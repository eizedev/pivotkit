/*
 * The OAuth issuers pivotkit-server accepts tokens of (auth.issuer, or the list auth.issuers:
 * issuersOf is the one reader of both forms) and the requests it makes to them: their metadata
 * (RFC 8414 or OpenID Connect discovery), their key sets (jwks_uri, read by jose; issuerKeys keeps
 * one per issuer) and, for a download link's sign-in, a token endpoint. All of them go through
 * guardedFetch (sources/fetch.js), under the rules of every other outbound request:
 *
 * - https only, no user name or password in the address, no redirect followed, the address checked
 *   on the one the socket connects to; link-local, cloud metadata, multicast and unspecified
 *   addresses are never reached.
 * - Loopback and private addresses only with auth.intranet: true (an issuer in the LAN or the
 *   cluster, such as Keycloak or Authentik). auth.allowInsecureIssuer, for a test issuer on this
 *   machine, allows plain http to a loopback address and nothing more.
 * - An IP address as the host only on an origin the operator wrote (an issuer, a jwksUri): the
 *   metadata cannot move a request to an address of its choosing.
 * - Size caps: ISSUER_LIMITS. A key set over its cap is refused, so no token verifies against it.
 *
 * The metadata's jwks_uri must be on the issuer's origin unless the issuer's jwksUri names the key
 * set (jwksUriOf); its token_endpoint may be elsewhere (some providers keep it on another host),
 * under the rules above.
 *
 * The first issuer is the one the server names to clients: the authorization server of its
 * metadata, the OpenAPI document's, the download links' sign-in and pivotkit login's
 * (firstIssuerOf). The others are accepted, never named.
 */

import { isIP } from "node:net";
import { createGuardedFetch, GuardedFetchError, guardedFetch } from "./sources/fetch.js";
import { ConfigError, HTTPS_ISSUER_TEXT } from "./options/shared.js";

/** The most bytes and the longest time of each request to the issuer. */
export const ISSUER_LIMITS = Object.freeze({ metadataBytes: 262_144, metadataMs: 10_000, jwksBytes: 262_144, jwksMs: 5000, tokenBytes: 65_536, tokenMs: 10_000 });

/** How often an issuer's metadata is read again (a changed jwks_uri), and the least time between two reads for a token with an unknown key. */
export const METADATA_REFRESH = Object.freeze({ everyMs: 3_600_000, unknownKeyMs: 60_000 });

/** The most issuers auth.issuers may list: each is read at start and every hour. */
export const MAX_ISSUERS = 10;

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
 * @typedef {object} IssuerEntry  one issuer whose tokens the server accepts (issuersOf)
 * @property {string} issuer  exactly as its tokens carry it in iss
 * @property {string | null} jwksUri  where its keys are, when not its metadata's jwks_uri
 * @property {string[] | null} audience  the aud values its tokens may carry at both endpoints; null: each endpoint's own (auth.audience, rest.audience)
 * @property {string[]} requiredScopes  scopes its tokens need, on top of the endpoint's
 * @property {string} key  the option that names the issuer, for messages: auth.issuer or auth.issuers[i].issuer
 * @property {string} jwksKey  the option that names its jwksUri
 */

/**
 * The issuers whose tokens the server accepts, in the operator's order: auth.issuers, else the one
 * of auth.issuer (with auth.jwksUri). Empty without either. The one reader of both forms.
 * @param {{ auth?: import("./config.js").AuthOptions }} options
 * @returns {IssuerEntry[]}
 */
export function issuersOf(options) {
    const auth = options.auth ?? {};
    if (Array.isArray(auth.issuers) && auth.issuers.length) {
        return auth.issuers.map((e, i) => ({ issuer: e.issuer, jwksUri: e.jwksUri ?? null, audience: e.audience?.length ? e.audience : null, requiredScopes: e.requiredScopes ?? [], key: `auth.issuers[${i}].issuer`, jwksKey: `auth.issuers[${i}].jwksUri` }));
    }
    return auth.issuer ? [{ issuer: auth.issuer, jwksUri: auth.jwksUri ?? null, audience: null, requiredScopes: [], key: "auth.issuer", jwksKey: "auth.jwksUri" }] : [];
}

/**
 * The issuer the server names to clients (the first of issuersOf), or null without one.
 * @param {{ auth?: import("./config.js").AuthOptions }} options
 */
export const firstIssuerOf = (options) => issuersOf(options)[0]?.issuer ?? null;

/**
 * Whether every issuer's tokens need a scope (the endpoint's requiredScopes, or each issuer's own):
 * the start's warning about tokens with no scope is said only when this is false.
 * @param {{ auth?: import("./config.js").AuthOptions }} options
 * @param {string[]} endpointScopes  the endpoint's required scopes
 */
export const everyIssuerScoped = (options, endpointScopes) => endpointScopes.length > 0 || issuersOf(options).every((e) => e.requiredScopes.length > 0);

/**
 * Why the start refuses one issuer's scheme, or null: plain http without auth.allowInsecureIssuer
 * (which applies to every issuer). The scheme is read as a URL reads it, in any case.
 * @param {Pick<IssuerEntry, "issuer" | "key">} entry
 * @param {{ auth?: import("./config.js").AuthOptions }} options
 * @returns {string | null}
 */
export function issuerSchemeProblem(entry, options) {
    if (options.auth?.allowInsecureIssuer) {
        return null;
    }
    const text = String(entry.issuer);
    return URL.canParse(text) && new URL(text).protocol !== "https:" ? `${entry.key}: ${HTTPS_ISSUER_TEXT}` : null;
}

/**
 * The first issuer whose scheme the start refuses (issuerSchemeProblem), or null.
 * @param {{ auth?: import("./config.js").AuthOptions }} options
 * @returns {string | null}
 */
export const firstSchemeProblem = (options) => issuersOf(options).map((entry) => issuerSchemeProblem(entry, options)).find((p) => p !== null) ?? null;

/**
 * The start's refusal of an issuer's scheme (issuerSchemeProblem), as a ConfigError.
 * @param {{ auth?: import("./config.js").AuthOptions }} options
 */
export function refuseIssuerScheme(options) {
    const problem = firstSchemeProblem(options);
    if (problem) {
        throw new ConfigError(problem);
    }
}

/**
 * The rules of the requests to the server's issuers.
 * @param {{ auth?: import("./config.js").AuthOptions }} options
 * @returns {IssuerRules}
 */
export function issuerRulesOf(options) {
    const auth = options.auth ?? {};
    const origins = issuersOf(options)
        .flatMap((e) => [e.issuer, e.jwksUri])
        .flatMap((text) => (text && URL.canParse(text) ? [new URL(text).origin] : []));
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
 * The key set's address: the issuer's jwksUri, else the metadata's jwks_uri, which must be on the issuer's
 * origin (a metadata document cannot send the key request elsewhere). Throws Error.
 * @param {any} metadata
 * @param {string} issuer
 * @param {string | null | undefined} configured  the issuer's jwksUri
 * @param {string} [key]  the option that names it, for the message
 */
export function jwksUriOf(metadata, issuer, configured, key = "auth.jwksUri") {
    if (configured) {
        return configured;
    }
    const given = metadata?.jwks_uri;
    if (typeof given !== "string" || !URL.canParse(given)) {
        throw new Error(`the issuer's metadata has no jwks_uri (set ${key})`);
    }
    if (new URL(given).origin !== new URL(issuer).origin) {
        throw new Error(`the issuer's jwks_uri is on another origin (${new URL(given).origin}); set ${key} to accept it`);
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

/**
 * @typedef {object} IssuerKeys
 * @property {IssuerEntry} entry
 * @property {() => Promise<unknown>} start
 * @property {() => boolean} ready
 * @property {() => any} metadata
 * @property {(token: string, how: Record<string, unknown>) => Promise<{ payload: import("jose").JWTPayload }>} verify
 * @property {() => void} close
 */

/**
 * One issuer's metadata and key set for the OAuth sign-in (auth.js): read at start in the background
 * with retries (ready() is false until then), again every hour, and when a token names a key the set
 * does not hold. A failed read again keeps what is loaded.
 * @param {IssuerEntry} entry
 * @param {IssuerRules} rules
 * @param {any} log
 * @returns {IssuerKeys}
 */
export function issuerKeys(entry, rules, log) {
    const { issuer } = entry;
    /** @type {any} */
    let state = { metadata: null, jwks: null, jwksUri: null };
    // when a token with an unknown key last made the metadata be read again
    let unknownAt = 0;
    /** @type {Promise<boolean> | null} */
    let inflight = null;

    /** Reads the issuer's metadata; a new key set only when its jwks_uri changed, so keys stay cached. Whether the key set changed. */
    async function load() {
        const metadata = await discover(issuer, rules);
        const jwksUri = jwksUriOf(metadata, issuer, entry.jwksUri, entry.jwksKey);
        if (jwksUri === state.jwksUri) {
            state = { ...state, metadata };
            return false;
        }
        const first = !state.jwks;
        state = { metadata, jwksUri, jwks: await remoteKeySet(jwksUri, rules, log) };
        log.info(first ? "oauth: issuer metadata loaded" : "oauth: the issuer's jwks_uri changed; keys are read from the new one", { issuer });
        return true;
    }

    /** Reads the metadata again (the hourly refresh, a token with an unknown key); a failure keeps what is loaded. */
    const refresh = () =>
        load().catch((e) => {
            log.warn(`oauth: the issuer's metadata could not be read again, keeping the loaded one: ${String(e?.message ?? e).slice(0, 600)}`, { issuer });
            return false;
        });
    let delay = 2000;
    let timer = null;
    let closed = false;
    const attempt = () =>
        load().catch((e) => {
            if (closed) {
                return;
            }
            log.warn(`oauth: the issuer's metadata could not be loaded, trying again in ${delay / 1000} s: ${String(e?.message ?? e).slice(0, 600)}`, { issuer });
            timer = setTimeout(attempt, delay);
            timer.unref?.();
            delay = Math.min(delay * 2, 60_000);
        });
    const refreshing = setInterval(() => {
        if (state.jwks) {
            refresh();
        }
    }, METADATA_REFRESH.everyMs);
    refreshing.unref?.();

    return {
        entry,
        /** The first read; it settles after the first try, loaded or not (the retries go on). */
        start: attempt,
        /** Whether the metadata and keys are loaded. */
        ready: () => Boolean(state.jwks),
        /** The metadata document, once loaded. */
        metadata: () => state.metadata,
        /**
         * Verifies a token with this issuer's keys (jose's jwtVerify; `how` without the issuer, which
         * is this one). One signed with a key the set does not hold reads the metadata again (at most
         * once a minute) and, when the key set moved to another jwks_uri, is tried once more.
         * @param {string} token
         * @param {Record<string, unknown>} how
         */
        async verify(token, how) {
            const { jwtVerify } = await import("jose");
            const checks = { ...how, issuer };
            try {
                return await jwtVerify(token, state.jwks, checks);
            } catch (e) {
                if (/** @type {any} */ (e)?.code !== "ERR_JWKS_NO_MATCHING_KEY" || Date.now() - unknownAt < METADATA_REFRESH.unknownKeyMs) {
                    throw e;
                }
                // one read for the requests that come at once; the wait starts only after a read that
                // found nothing new (or failed), so a made-up key cannot hold back a real rotation
                inflight ??= refresh().finally(() => {
                    inflight = null;
                });
                if (!(await inflight)) {
                    unknownAt = Date.now();
                    throw e;
                }
                return jwtVerify(token, state.jwks, checks);
            }
        },
        close() {
            closed = true;
            clearInterval(refreshing);
            if (timer) {
                clearTimeout(timer);
            }
        }
    };
}
