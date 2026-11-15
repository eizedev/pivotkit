/*
 * Authentication, shared by the MCP endpoint and the REST service; each front end turns a refusal
 * into its own answer (MCP: the SDK's challenge, REST: a problem document). Three modes:
 *
 * - "none": no check (loopback, or an explicit opt-in on another address).
 * - "token": static bearer tokens, each with a name (logged), optionally its scopes and a policy
 *   profile; read from an environment variable at start or from a file on every request (rotation
 *   without a restart); compared as SHA-256 digests in constant time.
 * - "oauth": an OAuth 2.1 protected resource: the issuer's metadata (RFC 8414 or OpenID Connect
 *   discovery), access tokens as JWTs checked against the issuer's JWKS with jose (signature, issuer,
 *   audience, expiry, algorithms; no "none", no HMAC). Each endpoint checks its own audience. The
 *   metadata is fetched in the background with retries; until it is there, `ready()` is false.
 *
 * The token itself is never logged, never passed on, never part of a message. A caller (callerOf)
 * never holds it: this module keeps an OAuth caller's token in a module-private WeakMap, and the one
 * way to use it is exchangeTokenFor, the RFC 8693 token exchange at a token endpoint (an ESLint rule
 * and a test keep other modules from importing it).
 *
 * Who a caller is (its identity, for caches and bindings) is the issuer and the subject of its token
 * (auth.subjectClaim, default "sub"), a static token's name, or "local" without sign-in; a verified
 * token without a usable subject has none, and `client` alone never is one.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { OperationError } from "pivotkit-report/operations";
import { TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT } from "pivotkit-cli/rest";
import { ConfigError, DEFAULT_ALGORITHMS, pathOf } from "./config.js";
import { auditText, noteAudit } from "./log.js";
import { readSecret } from "./secrets.js";
import { guardedFetch } from "./sources/fetch.js";

/** The fewest characters of a static token. */
export const TOKEN_MIN = 32;

/** The most bytes of the issuer's metadata document. */
const METADATA_BYTES = 262_144;

/** What a bearer token may hold and why another one does not work: pivotkit-cli/rest's, which the CLI checks a token against before it sends it. */
export { TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT } from "pivotkit-cli/rest";

/** The command that makes a token, for the messages. */
export const MAKE_TOKEN = `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`;

/** How often the issuer's metadata is read again (a changed jwks_uri), and the least time between two reads for a token with an unknown key. */
export const METADATA_REFRESH = Object.freeze({ everyMs: 3_600_000, unknownKeyMs: 60_000 });

/** SHA-256 of a text, for comparing tokens in constant time. */
const digest = (text) => createHash("sha256").update(text, "utf8").digest();

/**
 * A request refused by authentication: 401 invalid_token (or invalid_request) or 503 while the
 * issuer is not loaded. `description` is safe to send; it never names the token.
 */
export class AuthRefusal extends Error {
    /**
     * @param {number} status
     * @param {string} error  the OAuth error code
     * @param {string} description
     */
    constructor(status, error, description) {
        super(description);
        this.name = "AuthRefusal";
        this.status = status;
        this.error = error;
    }
}

/**
 * The bearer token of a request, or a reason why there is none to check: a token in the address,
 * two Authorization headers, another scheme (Basic) and a cookie are never read.
 * @param {Request} request
 * @returns {{ token: string } | { refused: string }}
 */
export function bearerOf(request) {
    const url = new URL(request.url);
    if (url.searchParams.has("access_token")) {
        return { refused: "a token in the address is refused; send it in the Authorization header" };
    }
    const header = request.headers.get("authorization");
    // Headers joins repeated headers with ", ": two Authorization headers are refused
    if (!header || header.includes(",")) {
        return { refused: header ? "send one Authorization header, not two" : "no token; send Authorization: Bearer <token>" };
    }
    const m = /^Bearer[ ]+(\S+)$/i.exec(header.trim());
    return m && TOKEN_SYNTAX.test(m[1]) ? { token: m[1] } : { refused: "not a bearer token; send Authorization: Bearer <token>" };
}

/**
 * The static tokens of the options: each with its name, where it comes from, its scopes and profile.
 * @param {import("./config.js").AuthOptions} auth
 * @param {Record<string, string | undefined>} env
 * @param {import("./config.js").ServerOptions} options
 * @param {string} tokenEnv  the variable of the one token when the options list none
 */
async function staticTokens(auth, env, options, tokenEnv) {
    const list = auth.tokens?.length ? auth.tokens : [{ name: "token", env: tokenEnv }];
    const out = [];
    for (const t of list) {
        // the one token of the variable has no name of its own ("token" in the log): a message names the variable only
        const which = auth.tokens?.length ? `the token "${t.name}"` : "the token";
        const read = t.env ? async () => env[t.env] ?? "" : async () => (await readFile(pathOf(options, /** @type {string} */ (t.file)), "utf8").catch(() => "")).trim();
        const value = await read();
        if (t.file && value.length < TOKEN_MIN) {
            const why = await readFile(pathOf(options, t.file), "utf8").then(() => null, (e) => e?.code);
            if (why === "EACCES") {
                throw new ConfigError(`auth: ${which} (${t.file}) cannot be read: permission denied for the user ${process.getuid?.() ?? ""} the server runs as (in the container image: 10001)`);
            }
        }
        if (value.length < TOKEN_MIN) {
            throw new ConfigError(`auth: ${which} (${t.env ? `$${t.env}` : "its file"}) is missing or shorter than ${TOKEN_MIN} characters; make one with: ${MAKE_TOKEN}`);
        }
        if (!TOKEN_SYNTAX.test(value)) {
            throw new ConfigError(`auth: ${which} (${t.env ? `$${t.env}` : "its file"}) ${TOKEN_SYNTAX_TEXT}; make one with: ${MAKE_TOKEN}`);
        }
        out.push({ name: t.name, scopes: t.scopes ?? null, profile: t.profile ?? null, read: t.file ? read : async () => value });
    }
    return out;
}

/**
 * Fetches a JSON document of the issuer: a time limit, no redirect, a size cap.
 * @param {string} url
 */
async function fetchJson(url) {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
    if (!response.ok) {
        throw new Error(`${response.status} from ${url}`);
    }
    // read while it streams, never more than the cap
    const chunks = [];
    let size = 0;
    for await (const chunk of /** @type {any} */ (response.body ?? [])) {
        size += chunk.length;
        if (size > METADATA_BYTES) {
            await response.body?.cancel().catch(() => undefined);
            throw new Error(`the document at ${url} is larger than ${METADATA_BYTES} bytes`);
        }
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * The issuer's metadata: RFC 8414 first (the well-known part before the issuer's path), then OpenID
 * Connect discovery (after it). Its issuer must equal the configured one exactly.
 * @param {string} issuer
 */
export async function discover(issuer) {
    const url = new URL(issuer);
    const path = url.pathname.replace(/\/$/, "");
    const tries = [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}${path}/.well-known/openid-configuration`];
    const errors = [];
    for (const at of tries) {
        try {
            const doc = await fetchJson(at);
            if (doc.issuer !== issuer) {
                throw new Error(`the metadata at ${at} names the issuer ${JSON.stringify(String(doc.issuer).slice(0, 200))}, not ${issuer}`);
            }
            return doc;
        } catch (e) {
            errors.push(`${String(e?.message ?? e)}${e?.cause?.code ? ` (${e.cause.code})` : ""}`);
        }
    }
    throw new Error(errors.join("; "));
}

/** The scopes of a token's claims: "scope" (space-separated), else "scp" (a list or a text). */
export function scopesOf(payload, claim) {
    const raw = claim ? payload[claim] : (payload.scope ?? payload.scp);
    return Array.isArray(raw) ? raw.filter((s) => typeof s === "string") : typeof raw === "string" ? raw.split(/\s+/).filter(Boolean) : [];
}

/** The RFC 9728 metadata address of a resource: /.well-known/oauth-protected-resource before its path. */
export function resourceMetadataUrlOf(resource) {
    const url = new URL(resource);
    const path = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    url.pathname = `/.well-known/oauth-protected-resource${path === "/" ? "" : path}`;
    url.hash = "";
    url.search = "";
    return url.href;
}

/**
 * @typedef {object} AuthInfo
 * @property {string} token  empty for a static token
 * @property {string} clientId  a static token's name or the OAuth client id
 * @property {string[]} scopes
 * @property {number} expiresAt
 * @property {URL} [resource]
 * @property {{ allScopes?: boolean, profile?: string | null, subject?: string | null, issuer?: string | null, groups?: string[], groupsUnknown?: boolean, audit?: string | null }} [extra]  subject: the token's auth.subjectClaim when usable, issuer: its iss, groups: the person's groups when the token carries a usable list, groupsUnknown: it does not (cut, too long, an overage marker, missing), audit: how the log names the person (OAuth)
 */

/** The longest subject taken as an identity. */
export const SUBJECT_MAX = 256;

/** A claim's value as a subject: a non-empty text of at most SUBJECT_MAX characters, else null. */
export const subjectOf = (value) => (typeof value === "string" && value.length > 0 && value.length <= SUBJECT_MAX ? value : null);

/** The most groups a token's list may hold; a longer one counts as cut (unknown). */
export const GROUPS_MAX = 100;

/** The longest group name taken; a longer one makes the list unknown. */
export const GROUP_MAX = 256;

/** Why a person's groups are unknown, for the debug line (never the groups themselves). */
const UNKNOWN_GROUPS = Object.freeze({ missing: "the claim is missing", overage: "the token says the groups are elsewhere (an overage marker)", text: "a text, and auth.groupsSeparator is not set", shape: "not a list of texts", many: `more than ${GROUPS_MAX} groups`, long: `a group longer than ${GROUP_MAX} characters` });

/**
 * The groups a verified token carries in auth.groupsClaim (default "groups"): a list of texts, or a
 * text split by auth.groupsSeparator when one is set. Anything else leaves them unknown, never
 * empty: a missing claim, an overage marker instead of the list (`_claim_names` naming the claim, or
 * `hasgroups`), a text without a separator, a list with something other than texts, more than
 * GROUPS_MAX entries or one longer than GROUP_MAX characters. An empty list is known: no groups.
 * @param {Record<string, unknown>} payload
 * @param {import("./config.js").AuthOptions} auth
 * @returns {{ groups: string[] } | { unknown: keyof typeof UNKNOWN_GROUPS }}
 */
export function groupsOf(payload, auth) {
    const claim = auth.groupsClaim ?? "groups";
    const names = payload._claim_names;
    if ((names && typeof names === "object" && Object.hasOwn(names, claim)) || payload.hasgroups === true || payload.hasgroups === "true") {
        return { unknown: "overage" };
    }
    const raw = Object.hasOwn(payload, claim) ? payload[claim] : undefined;
    if (raw === undefined || raw === null) {
        return { unknown: "missing" };
    }
    let list;
    if (typeof raw === "string") {
        if (!auth.groupsSeparator) {
            return { unknown: "text" };
        }
        list = raw.split(auth.groupsSeparator).filter(Boolean);
    } else if (Array.isArray(raw) && raw.every((g) => typeof g === "string")) {
        list = raw;
    } else {
        return { unknown: "shape" };
    }
    if (list.length > GROUPS_MAX) {
        return { unknown: "many" };
    }
    if (list.some((g) => g.length > GROUP_MAX)) {
        return { unknown: "long" };
    }
    return { groups: [...list] };
}

/** What a caller is told when its groups are unknown and nothing else names its profile. */
export const GROUPS_REFUSED = "your sign-in does not carry your groups; ask the operator";

/**
 * Why a verified caller is refused (403) for its groups, or null: auth.groupProfiles is set, its
 * token's groups are unknown, and no token profile, client profile or auth.defaultProfile decides
 * its profile instead. A cut or missing group list never falls through to a wider policy.
 * @param {import("./config.js").AuthOptions | undefined} auth
 * @param {{ token?: string, clientId?: string, extra?: Record<string, any> } | undefined} authInfo  a verified token's (AuthInfo, or the SDK's copy of it)
 * @returns {string | null}
 */
export function groupRefusal(auth, authInfo) {
    if (!authInfo || authInfo.token === "" || !authInfo.extra?.groupsUnknown || !auth?.groupProfiles?.length) {
        return null;
    }
    if (authInfo.extra.profile || (auth.clientProfiles && Object.hasOwn(auth.clientProfiles, String(authInfo.clientId))) || auth.defaultProfile) {
        return null;
    }
    return GROUPS_REFUSED;
}

/**
 * The audit setting of the options with its key: the key read once at start (audit.key, a secret
 * reference), or a random one per process for "hash" without it (logged as a warning: the hashes
 * change on every restart). Throws ConfigError when the key cannot be read.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ env: Record<string, string | undefined>, log: any }} runtime
 * @returns {Promise<{ subject: "off" | "hash" | "plain", key: Uint8Array | null }>}
 */
export async function auditOf(options, { env, log }) {
    const subject = options.audit?.subject ?? "off";
    if (subject !== "hash") {
        return { subject, key: null };
    }
    if (!options.audit?.key) {
        log.warn("audit.subject is hash without audit.key: a random key is used, so the same person gets another hash after every restart");
        return { subject, key: randomBytes(32) };
    }
    try {
        return { subject, key: Buffer.from(await readSecret(options.audit.key, options, env), "utf8") };
    } catch (e) {
        throw new ConfigError(`audit.key: ${String(e?.message ?? e)}`);
    }
}

/**
 * Builds the authentication both front ends share (one per process: one issuer to fetch).
 * @param {import("./config.js").ServerOptions} options
 * @param {{ env: Record<string, string | undefined>, log: any, loopback: boolean, tokenEnv?: string }} runtime  tokenEnv: the variable of the one token when auth.tokens is empty (default PIVOTKIT_MCP_TOKEN)
 */
export async function createAuthCore(options, { env, log, loopback, tokenEnv = "PIVOTKIT_MCP_TOKEN" }) {
    const auth = options.auth ?? {};
    const mode = auth.mode ?? "none";
    if (mode === "none") {
        if (!loopback && !auth.allowUnauthenticated) {
            throw new ConfigError("auth: an address other than loopback needs auth token or oauth (or auth.allowUnauthenticated: true, --allow-unauthenticated, for a network you trust)");
        }
        if (!loopback) {
            log.warn("serving without authentication on an address other than loopback (auth.allowUnauthenticated)");
        }
        return { mode, ready: () => true, close() {} };
    }

    if (mode === "token") {
        const tokens = await staticTokens(auth, env, options, tokenEnv);
        return {
            mode,
            ready: () => true,
            /**
             * The static token a request carries.
             * @param {Request} request
             * @returns {Promise<AuthInfo>}  or throws AuthRefusal
             */
            async check(request) {
                const bearer = /** @type {{ token?: string, refused?: string }} */ (bearerOf(request));
                if (!bearer.token) {
                    throw new AuthRefusal(401, "invalid_token", bearer.refused ?? "no token; send Authorization: Bearer <token>");
                }
                const given = digest(bearer.token);
                let match = null;
                // every token compared, so the time does not tell which one is close
                for (const t of tokens) {
                    const value = await t.read();
                    if (value.length >= TOKEN_MIN && timingSafeEqual(given, digest(value)) && !match) {
                        match = t;
                    }
                }
                if (!match) {
                    throw new AuthRefusal(401, "invalid_token", "unknown token; check the token the operator gave you");
                }
                return { token: "", clientId: match.name, scopes: match.scopes ?? [], expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { allScopes: match.scopes === null, profile: match.profile } };
            },
            close() {}
        };
    }

    // oauth
    const issuer = /** @type {string} */ (auth.issuer);
    if (new URL(issuer).protocol !== "https:" && !auth.allowInsecureIssuer) {
        throw new ConfigError("auth.issuer: must be an https:// address (auth.allowInsecureIssuer is for tests only)");
    }
    const algorithms = auth.algorithms?.length ? auth.algorithms : [...DEFAULT_ALGORITHMS];
    const audit = await auditOf(options, { env, log });
    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    /** @type {any} */
    let state = { metadata: null, jwks: null, jwksUri: null };
    // when a token with an unknown key last made the metadata be read again
    let unknownAt = 0;
    /** @type {Promise<boolean> | null} */
    let inflight = null;

    /** Reads the issuer's metadata; a new key set only when its jwks_uri changed, so keys stay cached. Whether the key set changed. */
    async function load() {
        const metadata = await discover(issuer);
        const jwksUri = auth.jwksUri ?? metadata.jwks_uri;
        if (!jwksUri) {
            throw new Error("the issuer's metadata has no jwks_uri (set auth.jwksUri)");
        }
        if (!auth.jwksUri && new URL(jwksUri).origin !== new URL(issuer).origin) {
            throw new Error(`the issuer's jwks_uri is on another origin (${new URL(jwksUri).origin}); set auth.jwksUri to accept it`);
        }
        if (jwksUri === state.jwksUri) {
            state = { ...state, metadata };
            return false;
        }
        const first = !state.jwks;
        state = { metadata, jwksUri, jwks: createRemoteJWKSet(new URL(jwksUri), { timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 600_000 }) };
        log.info(first ? "oauth: issuer metadata loaded" : "oauth: the issuer's jwks_uri changed; keys are read from the new one", { issuer });
        return true;
    }

    /** Reads the metadata again (the hourly refresh, a token with an unknown key); a failure keeps what is loaded. */
    const refresh = () =>
        load().catch((e) => {
            log.warn(`oauth: the issuer's metadata could not be read again, keeping the loaded one: ${String(e?.message ?? e).slice(0, 300)}`);
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
            log.warn(`oauth: the issuer's metadata could not be loaded, trying again in ${delay / 1000} s: ${String(e?.message ?? e).slice(0, 300)}`);
            timer = setTimeout(attempt, delay);
            timer.unref?.();
            delay = Math.min(delay * 2, 60_000);
        });
    await attempt();
    const refreshing = setInterval(() => {
        if (state.jwks) {
            refresh();
        }
    }, METADATA_REFRESH.everyMs);
    refreshing.unref?.();

    /**
     * Verifies a token. One signed with a key the set does not hold reads the metadata again (at most
     * once a minute) and, when the key set moved to another jwks_uri, is tried once more.
     */
    async function verifyJwt(token, audience) {
        const how = { issuer, audience, algorithms, clockTolerance: auth.clockTolerance ?? 30, ...(auth.requireTyp ? { typ: auth.requireTyp } : {}), requiredClaims: ["exp"] };
        try {
            return await jwtVerify(token, state.jwks, how);
        } catch (e) {
            if (e?.code !== "ERR_JWKS_NO_MATCHING_KEY" || Date.now() - unknownAt < METADATA_REFRESH.unknownKeyMs) {
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
            return jwtVerify(token, state.jwks, how);
        }
    }

    return {
        mode,
        issuer,
        /** Whether the issuer's metadata and keys are loaded. */
        ready: () => Boolean(state.jwks),
        /** The issuer's metadata document, once loaded. */
        metadata: () => state.metadata,
        /**
         * Checks an access token for one endpoint's audience.
         * @param {string} token
         * @param {{ audience: string[], resource: URL }} endpoint
         * @returns {Promise<AuthInfo>}  or throws AuthRefusal
         */
        async verify(token, { audience, resource }) {
            if (!state.jwks) {
                throw new AuthRefusal(503, "temporarily_unavailable", "the server is waiting for its authorization server");
            }
            let payload;
            try {
                ({ payload } = await verifyJwt(token, audience));
            } catch (e) {
                // why a token failed stays here (a message would help someone who tries tokens); the
                // operator sees it with --log debug: jose's code and the claim, never the token
                log.debug("oauth: token refused", { reason: String(e?.code ?? e?.name ?? "invalid").slice(0, 60), ...(e?.claim ? { claim: String(e.claim).slice(0, 40) } : {}), expected: { issuer, audience } });
                throw new AuthRefusal(401, "invalid_token", "the access token is not valid for this server");
            }
            const subject = subjectOf(payload[auth.subjectClaim ?? "sub"]);
            const iss = typeof payload.iss === "string" ? payload.iss : null;
            const groups = groupsOf(payload, auth);
            /** @type {AuthInfo} */
            const info = {
                token,
                clientId: String(payload.azp ?? payload.client_id ?? "client").slice(0, 80),
                scopes: scopesOf(payload, auth.scopeClaim),
                expiresAt: /** @type {number} */ (payload.exp),
                resource,
                extra: { subject, issuer: iss, ...("groups" in groups ? { groups: groups.groups } : { groupsUnknown: true }), audit: auditText(audit, iss, subject) }
            };
            // what the operator needs to set groupProfiles up: how many groups (never which), and
            // the profile they gave
            if (log.level === "debug") {
                const refused = groupRefusal(auth, info);
                log.debug("oauth: signed in", { groups: "groups" in groups ? groups.groups.length : `unknown (${UNKNOWN_GROUPS[groups.unknown]})`, profile: refused ? "refused (403)" : (profileOf(auth, info) ?? "none (the sources' policy)") });
            }
            return info;
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

/**
 * The policy profile of a verified caller, the first that names one:
 *
 * 1. a static token's own profile;
 * 2. the OAuth client's (auth.clientProfiles): a client's profile wins over a person's groups, both
 *    ways, so a restricted model client stays restricted;
 * 3. the first entry of auth.groupProfiles whose group the person's token carries (exact,
 *    case-sensitive); when its groups are unknown (cut, missing, an overage marker), the scope step
 *    is skipped and only auth.defaultProfile follows (groupRefusal refuses the call without one);
 * 4. the one profile its scopes name (auth.scopeProfiles); scopes that name two different profiles
 *    name none;
 * 5. auth.defaultProfile, for every signed-in caller (a static token without a profile too).
 *
 * Null: the sources' own policy.
 * @param {import("./config.js").AuthOptions | undefined} auth
 * @param {AuthInfo | undefined} authInfo
 * @returns {string | null}
 */
export function profileOf(auth, authInfo) {
    if (!authInfo) {
        return null;
    }
    if (authInfo.extra?.profile) {
        return authInfo.extra.profile;
    }
    const fallback = auth?.defaultProfile ?? null;
    if (authInfo.token === "") {
        // a static token without a profile of its own
        return fallback;
    }
    if (auth?.clientProfiles && Object.hasOwn(auth.clientProfiles, authInfo.clientId)) {
        return auth.clientProfiles[authInfo.clientId];
    }
    if (auth?.groupProfiles?.length) {
        if (authInfo.extra?.groupsUnknown) {
            return fallback;
        }
        const groups = new Set(authInfo.extra?.groups ?? []);
        const entry = auth.groupProfiles.find((e) => groups.has(e.group));
        if (entry) {
            return entry.profile;
        }
    }
    const named = new Set((authInfo.scopes ?? []).filter((s) => auth?.scopeProfiles && Object.hasOwn(auth.scopeProfiles, s)).map((s) => auth?.scopeProfiles?.[s]));
    return named.size === 1 ? /** @type {string} */ ([...named][0]) : fallback;
}

/**
 * What this module knows of each caller callerOf made: the parts of its identity, and an OAuth
 * caller's access token. Module-private: nothing outside reads the token.
 * @type {WeakMap<object, { basis: string[] | null, token: string | null, expiresAt?: number | null }>}
 */
const known = new WeakMap();

/**
 * Who calls, from the request's verified token: its scopes, how the log names it, its policy
 * profile (profileOf) and, for an OAuth token, its subject, issuer and groups (only when it carries
 * some). A caller groupRefusal refuses holds no scope and no profile.
 * @param {string} mode
 * @param {any} authInfo
 * @param {import("./config.js").AuthOptions} [authOptions]  for the profiles of clients, groups and scopes and the default one
 * @returns {import("./registry.js").Caller}
 */
export function callerOf(mode, authInfo, authOptions = undefined) {
    if (mode === "none") {
        const caller = { scopes: null, client: "local", profile: null };
        known.set(caller, { basis: ["local"], token: null });
        return caller;
    }
    if (!authInfo) {
        // a request that reached an operation without a verified token holds no scope: closed, not open
        return { scopes: new Set(), client: "unknown", profile: null };
    }
    const profile = profileOf(authOptions, authInfo);
    const scopes = authInfo.extra?.allScopes ? null : new Set(authInfo.scopes ?? []);
    const client = authInfo.extra?.allScopes ? String(authInfo.clientId ?? "token") : String(authInfo.clientId ?? "client").slice(0, 80);
    if (authInfo.token === "" || mode === "token") {
        // a static token: its name is who calls
        const caller = { scopes, client, profile };
        known.set(caller, { basis: ["token", String(authInfo.clientId ?? "token")], token: null });
        return caller;
    }
    if (groupRefusal(authOptions, authInfo)) {
        // the front ends refuse such a caller (403); one made anyway holds no scope and no profile
        return { scopes: new Set(), client, profile: null };
    }
    const subject = subjectOf(authInfo.extra?.subject);
    const issuer = typeof authInfo.extra?.issuer === "string" ? authInfo.extra.issuer : null;
    const groups = Array.isArray(authInfo.extra?.groups) ? authInfo.extra.groups.filter((g) => typeof g === "string") : [];
    const caller = { scopes, client, profile, subject, issuer, ...(groups.length ? { groups: [...groups] } : {}) };
    noteAudit(caller, authInfo.extra?.audit);
    known.set(caller, { basis: subject && issuer ? [issuer, subject] : null, token: typeof authInfo.token === "string" && authInfo.token ? authInfo.token : null, expiresAt: Number.isSafeInteger(authInfo.expiresAt) ? authInfo.expiresAt : null });
    return caller;
}

/**
 * The parts of a caller's identity ([issuer, subject], ["token", name] or ["local"]), or null: a
 * caller callerOf did not make, or an OAuth token without a usable subject.
 * @param {import("./registry.js").Caller} caller
 * @returns {readonly string[] | null}
 */
export function identityBasisOf(caller) {
    const basis = caller && typeof caller === "object" ? known.get(caller)?.basis : null;
    return basis ? Object.freeze([...basis]) : null;
}

/** The key identities are made with: random per process, so an identity key means nothing outside it. */
const IDENTITY_KEY = randomBytes(32);

/**
 * The identity of a caller, the only one a cache, the coalescing of loads or a binding uses: base64url
 * of HMAC-SHA256 over the parts of its identity (the issuer and subject of an OAuth token, a static
 * token's name, "local" without sign-in), with the client and the sorted scopes appended when asked.
 * Null for a caller without one (an OAuth token without a usable subject, a caller callerOf did not
 * make): no cache, no coalescing across requests, no binding. The client alone is never an identity.
 * @param {import("./registry.js").Caller} caller
 * @param {{ client?: boolean }} [how]
 * @returns {string | null}
 */
export function identityKey(caller, { client = false } = {}) {
    const basis = identityBasisOf(caller);
    if (!basis) {
        return null;
    }
    const parts = client ? [...basis, caller.client, caller.scopes === null ? null : [...caller.scopes].sort()] : basis;
    return createHmac("sha256", IDENTITY_KEY).update(JSON.stringify(parts)).digest("base64url");
}

/**
 * A caller as a library host's code source sees it: a frozen copy built field by field (scopes as a
 * list), without any token.
 * @param {import("./registry.js").Caller} caller
 */
export function callerView(caller) {
    const claims = caller.claims ? Object.freeze(Object.fromEntries(Object.entries(caller.claims).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)))) : undefined;
    return Object.freeze({
        subject: caller.subject ?? null,
        issuer: caller.issuer ?? null,
        client: caller.client,
        profile: caller.profile ?? null,
        scopes: caller.scopes === null ? null : Object.freeze([...caller.scopes].sort()),
        groups: Object.freeze([...(caller.groups ?? [])]),
        ...(claims ? { claims } : {})
    });
}

/**
 * The RFC 8693 token exchange for a signed-in person: the caller's own access token goes as the
 * subject_token to the token endpoint named here, and nowhere else. Needs an OAuth caller with a
 * subject (NOT_ALLOWED otherwise). The answer is the token endpoint's, unread, with when the
 * caller's own token expires (subjectExpiresAt, seconds since 1970), which an exchanged token must
 * not outlive.
 * @param {import("./registry.js").Caller} caller
 * @param {{ url: string, clientId: string, clientSecret?: string, audience?: string, resource?: string, scope?: string, signal?: AbortSignal, timeMs?: number, maxBytes?: number, allowPrivate?: boolean, allowIpLiterals?: boolean }} request
 * @returns {Promise<import("./sources/fetch.js").GuardedResponse & { subjectExpiresAt: number | null }>}
 */
export async function exchangeTokenFor(caller, request) {
    const entry = caller && typeof caller === "object" ? known.get(caller) : undefined;
    if (!entry?.token || !entry.basis || entry.basis[0] === "token" || entry.basis[0] === "local") {
        throw new OperationError("NOT_ALLOWED", "this source needs a signed-in person (an OAuth token with a subject)");
    }
    const form = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: entry.token, subject_token_type: "urn:ietf:params:oauth:token-type:access_token", requested_token_type: "urn:ietf:params:oauth:token-type:access_token" });
    for (const key of /** @type {const} */ (["audience", "resource", "scope"])) {
        if (request[key]) {
            form.set(key, request[key]);
        }
    }
    /** @type {Record<string, string>} */
    const headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    if (request.clientSecret !== undefined) {
        // RFC 6749 2.3.1: both parts form-encoded before the Basic credentials are made
        headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(request.clientId)}:${encodeURIComponent(request.clientSecret)}`).toString("base64")}`;
    } else {
        form.set("client_id", request.clientId);
    }
    const answer = await guardedFetch(request.url, { method: "POST", headers, body: form.toString(), ...(request.signal ? { signal: request.signal } : {}), ...(request.timeMs ? { timeMs: request.timeMs } : {}), ...(request.maxBytes ? { maxBytes: request.maxBytes } : {}), ...(request.allowPrivate !== undefined ? { allowPrivate: request.allowPrivate } : {}), ...(request.allowIpLiterals ? { allowIpLiterals: true } : {}) });
    return { ...answer, subjectExpiresAt: entry.expiresAt ?? null };
}
