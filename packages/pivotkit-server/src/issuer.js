/*
 * The requests pivotkit-server makes to the OAuth issuer (auth.issuer): its metadata (RFC 8414 or
 * OpenID Connect discovery), its key set (jwks_uri, read by jose) and, for a download link's
 * sign-in, its token endpoint. All of them go through guardedFetch (sources/fetch.js), under the
 * rules of every other outbound request:
 *
 * - https only, no user name or password in the address, no redirect followed, the address checked
 *   on the one the socket connects to; link-local, cloud metadata, multicast and unspecified
 *   addresses are never reached.
 * - Loopback and private addresses only with auth.intranet: true (an issuer in the LAN or the
 *   cluster, such as Keycloak or Authentik). auth.allowInsecureIssuer, for a test issuer on this
 *   machine, allows plain http to a loopback address and nothing more.
 * - An IP address as the host only on an origin the operator wrote (auth.issuer, auth.jwksUri): the
 *   metadata cannot move a request to an address of its choosing.
 * - Size caps: ISSUER_LIMITS. A key set over its cap is refused, so no token verifies against it.
 *
 * The metadata's jwks_uri must be on the issuer's origin unless auth.jwksUri names the key set
 * (jwksUriOf); its token_endpoint may be elsewhere (some providers keep it on another host), under
 * the rules above.
 */

import { isIP } from "node:net";
import { createGuardedFetch, GuardedFetchError, guardedFetch } from "./sources/fetch.js";

/** The most bytes and the longest time of each request to the issuer. */
export const ISSUER_LIMITS = Object.freeze({ metadataBytes: 262_144, metadataMs: 10_000, jwksBytes: 262_144, jwksMs: 5000, tokenBytes: 65_536, tokenMs: 10_000 });

/** How long jose keeps a key set and waits between two reads of it. */
const JWKS_CACHE = Object.freeze({ cooldownDuration: 30_000, cacheMaxAge: 600_000 });

/**
 * After a failed read of the key set: how long the next requests fail at once without asking the
 * issuer (jose reads again on every token while it holds no keys), and how long until the warning
 * is written again.
 */
export const JWKS_FAILURE = Object.freeze({ retryMs: 5000, warnMs: 60_000 });

/**
 * The fetches this module uses; tests put stand-ins here (a lookup, a certificate authority).
 * `fetch` for https, `loopback` for a test issuer on plain http (auth.allowInsecureIssuer).
 */
export const issuerMeans = { fetch: guardedFetch, loopback: createGuardedFetch({ allowHttpLoopback: true }) };

/**
 * @typedef {object} IssuerRules
 * @property {boolean} intranet  the issuer may be on a loopback or private address (auth.intranet)
 * @property {boolean} insecure  plain http to a loopback address (auth.allowInsecureIssuer, tests only)
 * @property {string[]} origins  the origins the operator wrote, where an IP address may be the host
 */

/**
 * The rules of the requests to the server's issuer.
 * @param {{ auth?: import("./config.js").AuthOptions }} options
 * @returns {IssuerRules}
 */
export function issuerRulesOf(options) {
    const auth = options.auth ?? {};
    const origins = [auth.issuer, auth.jwksUri].flatMap((text) => (text && URL.canParse(text) ? [new URL(text).origin] : []));
    return Object.freeze({ intranet: auth.intranet === true, insecure: auth.allowInsecureIssuer === true, origins });
}

/**
 * One request to the issuer under its rules.
 * @param {string} url
 * @param {IssuerRules} rules
 * @param {import("./sources/fetch.js").GuardedRequest} request
 */
export async function issuerFetch(url, rules, request) {
    if (!URL.canParse(url)) {
        throw new GuardedFetchError("BAD_URL", "not an address");
    }
    const target = new URL(url);
    const plain = target.protocol === "http:";
    if (plain && !rules.insecure) {
        throw new GuardedFetchError("NOT_HTTPS", "only https:// addresses are fetched (auth.allowInsecureIssuer is for a test issuer on this machine)");
    }
    const fetcher = plain ? issuerMeans.loopback : issuerMeans.fetch;
    // plain http reaches loopback only (guardedFetch), so allowInsecureIssuer allows no private address
    return fetcher(target.href, {
        ...request,
        allowPrivate: rules.intranet || plain,
        allowIpLiterals: isIP(target.hostname.replace(/^\[|\]$/g, "")) !== 0 && rules.origins.includes(target.origin)
    });
}

/**
 * What the operator does about a refused request to the issuer, for the log; "" for none.
 * @param {unknown} error
 * @param {IssuerRules} rules
 */
export function issuerHint(error, rules) {
    if (!(error instanceof GuardedFetchError)) {
        return "";
    }
    if (error.code === "REFUSED_ADDRESS" && /private/.test(error.message) && !rules.intranet) {
        return "; for an issuer on an internal address (LAN, cluster) set auth.intranet: true";
    }
    if (error.code === "NETWORK" && /CERT|SELF_SIGNED|UNABLE_TO|ERR_TLS/.test(`${error.message} ${/** @type {any} */ (error.cause)?.code ?? ""}`)) {
        return "; for a certificate of your own authority set NODE_EXTRA_CA_CERTS";
    }
    return "";
}

/**
 * A JSON document of the issuer: a time limit, no redirect, a size cap.
 * @param {string} url
 * @param {IssuerRules} rules
 * @param {AbortSignal} [signal]  ends it sooner (check-config's shorter wait)
 */
async function fetchJson(url, rules, signal) {
    let answer;
    try {
        answer = await issuerFetch(url, rules, { headers: { accept: "application/json" }, maxBytes: ISSUER_LIMITS.metadataBytes, timeMs: ISSUER_LIMITS.metadataMs, ...(signal ? { signal } : {}) });
    } catch (e) {
        throw new Error(`${url}: ${e instanceof GuardedFetchError ? `${e.code}, ${e.message}` : String(/** @type {any} */ (e)?.message ?? e)}${issuerHint(e, rules)}`, { cause: e });
    }
    if (answer.status !== 200) {
        throw new Error(`${answer.status} from ${url}`);
    }
    return JSON.parse(new TextDecoder().decode(answer.body));
}

/**
 * The issuer's metadata: RFC 8414 first (the well-known part before the issuer's path), then OpenID
 * Connect discovery (after it). Its issuer must equal the configured one exactly.
 * @param {string} issuer
 * @param {IssuerRules} [rules]  default: the rules of an issuer at that address, without intranet
 * @param {{ signal?: AbortSignal }} [how]  signal: ends both tries sooner than their own time limit (check-config)
 */
export async function discover(issuer, rules = issuerRulesOf({ auth: { issuer } }), { signal } = {}) {
    const url = new URL(issuer);
    const path = url.pathname.replace(/\/$/, "");
    const tries = [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}${path}/.well-known/openid-configuration`];
    const errors = [];
    for (const at of tries) {
        try {
            const doc = await fetchJson(at, rules, signal);
            if (doc.issuer !== issuer) {
                throw new Error(`the metadata at ${at} names the issuer ${JSON.stringify(String(doc.issuer).slice(0, 200))}, not ${issuer}`);
            }
            return doc;
        } catch (e) {
            errors.push(String(/** @type {any} */ (e)?.message ?? e));
            // an address the rules refuse is refused for the second try too
            if (/** @type {any} */ (e)?.cause instanceof GuardedFetchError && ["REFUSED_ADDRESS", "IP_LITERAL", "NOT_HTTPS"].includes(/** @type {any} */ (e).cause.code)) {
                break;
            }
        }
    }
    throw new Error(errors.join("; "));
}

/**
 * The key set's address: auth.jwksUri, else the metadata's jwks_uri, which must be on the issuer's
 * origin (a metadata document cannot send the key request elsewhere). Throws Error.
 * @param {any} metadata
 * @param {string} issuer
 * @param {string | undefined} configured  auth.jwksUri
 */
export function jwksUriOf(metadata, issuer, configured) {
    if (configured) {
        return configured;
    }
    const given = metadata?.jwks_uri;
    if (typeof given !== "string" || !URL.canParse(given)) {
        throw new Error("the issuer's metadata has no jwks_uri (set auth.jwksUri)");
    }
    if (new URL(given).origin !== new URL(issuer).origin) {
        throw new Error(`the issuer's jwks_uri is on another origin (${new URL(given).origin}); set auth.jwksUri to accept it`);
    }
    return given;
}

/**
 * The issuer's key set for jose's jwtVerify, read through issuerFetch (jose's customFetch): at most
 * ISSUER_LIMITS.jwksBytes, no redirect. A read that fails is logged as a warning (with the hint, at
 * most once a minute), so a key set that cannot be read does not show only as refused tokens; for
 * JWKS_FAILURE.retryMs after it, tokens are refused without asking the issuer again.
 * @param {string} jwksUri
 * @param {IssuerRules} rules
 * @param {{ warn(text: string): void }} log
 */
export async function remoteKeySet(jwksUri, rules, log) {
    const { createRemoteJWKSet, customFetch } = await import("jose");
    /** The last failed read: its time and error; when the warning was last written. */
    let failed = { at: 0, error: /** @type {unknown} */ (null) };
    let warnedAt = 0;
    /** @type {import("jose").FetchImplementation} */
    const fetchKeys = async (url, request) => {
        if (failed.error && Date.now() - failed.at < JWKS_FAILURE.retryMs) {
            throw failed.error;
        }
        try {
            const answer = await issuerFetch(url, rules, { headers: Object.fromEntries(request.headers), signal: request.signal, maxBytes: ISSUER_LIMITS.jwksBytes, timeMs: ISSUER_LIMITS.jwksMs });
            // an answer jose would refuse later counts as a failed read here, so it is not asked again on every token
            if (answer.status !== 200) {
                throw new Error(`the issuer answered ${answer.status}`);
            }
            let keys;
            try {
                keys = JSON.parse(new TextDecoder().decode(answer.body))?.keys;
            } catch {
                keys = undefined;
            }
            if (!Array.isArray(keys)) {
                throw new Error("the answer is no key set (JSON with a keys list)");
            }
            failed = { at: 0, error: null };
            return new Response(/** @type {any} */ (answer.body), { status: 200, headers: { "content-type": "application/json" } });
        } catch (e) {
            failed = { at: Date.now(), error: e };
            if (Date.now() - warnedAt >= JWKS_FAILURE.warnMs) {
                warnedAt = Date.now();
                log.warn(`oauth: the issuer's keys could not be read from ${url}: ${e instanceof GuardedFetchError ? `${e.code}, ${e.message}` : String(/** @type {any} */ (e)?.message ?? e).slice(0, 200)}${issuerHint(e, rules)}`);
            }
            throw e;
        }
    };
    return createRemoteJWKSet(new URL(jwksUri), { timeoutDuration: ISSUER_LIMITS.jwksMs, ...JWKS_CACHE, [customFetch]: fetchKeys });
}
