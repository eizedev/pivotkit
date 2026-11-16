/*
 * Authentication, shared by the MCP endpoint and the REST service; each front end turns a refusal
 * into its own answer (MCP: the SDK's challenge, REST: a problem document). Three modes:
 *
 * - "none": no check (loopback, or an explicit opt-in on another address).
 * - "token": static bearer tokens, each with a name (logged), optionally its scopes, a policy
 *   profile and an expiry; read from an environment variable at start or from a file on every
 *   request (rotation without a restart); compared as SHA-256 digests in constant time. A bearer no
 *   static token matches may be a signed token the server issued (signed-tokens.js, by its ID in the
 *   log).
 * - "oauth": an OAuth 2.1 protected resource: the issuer's metadata (RFC 8414 or OpenID Connect
 *   discovery), access tokens as JWTs checked against the issuer's JWKS with jose (signature, issuer,
 *   audience, expiry, algorithms; no "none", no HMAC). Each endpoint checks its own audience. The
 *   metadata is fetched in the background with retries; until it is there, `ready()` is false.
 *   Every request to the issuer goes through issuer.js (guardedFetch's rules; a loopback or private
 *   issuer only with auth.intranet).
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
import { OperationError } from "pivotkit-report/operations";
import { TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT } from "pivotkit-cli/rest";
import { ConfigError, DEFAULT_ALGORITHMS, pathOf } from "./config.js";
import { AUDIT_KEY_MIN, auditText, noteAudit } from "./log.js";
import { UTF16_TEXT, readSecret, readSecretFile, secretValue, unreadable } from "./secrets.js";
import { discover, issuerRulesOf, jwksUriOf, remoteKeySet } from "./issuer.js";
import { guardedFetch, isGuardedFetch } from "./sources/fetch.js";
import { claimNamesOf, claimsOf } from "./sources/params.js";
import { SIGNED_TOKEN, SignedTokenError, createSignedVerifier, expiryOf, keyring, looksSigned, signedStore } from "./signed-tokens.js";
import { maxLifetimeOf } from "./options/signed.js";

/** The fewest characters of a static token. */
export const TOKEN_MIN = 32;

/**
 * The fewest different characters of a static token. A random token has far more: `token new`
 * gives 43 characters of 64, and a hex token of 32 characters (openssl rand -hex 16) had at least 8
 * in a million tries.
 */
export const TOKEN_DISTINCT_MIN = 8;

/**
 * Why a static token is too easy to guess, or null: fewer than TOKEN_DISTINCT_MIN different
 * characters, or one piece repeated (the token repeats with a period of at most half its length,
 * such as abcabc...). The failed-token limit slows guessing per address only, so a token must not be
 * guessable.
 * @param {string} value
 * @returns {string | null}
 */
export function tokenGuessable(value) {
    const distinct = new Set(value).size;
    if (distinct < TOKEN_DISTINCT_MIN) {
        return `too easy to guess (${distinct} different character${distinct === 1 ? "" : "s"}, at least ${TOKEN_DISTINCT_MIN})`;
    }
    // the shortest period: the length less the longest border (Knuth-Morris-Pratt's prefix function)
    const border = new Int32Array(value.length);
    for (let i = 1, k = 0; i < value.length; i++) {
        while (k > 0 && value[i] !== value[k]) {
            k = border[k - 1];
        }
        if (value[i] === value[k]) {
            k++;
        }
        border[i] = k;
    }
    return value.length - border[value.length - 1] <= value.length / 2 ? "too easy to guess (one piece repeated)" : null;
}

/** What a bearer token may hold and why another one does not work: pivotkit-cli/rest's, which the CLI checks a token against before it sends it. */
export { TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT } from "pivotkit-cli/rest";

/** The command that makes a token, for the messages. */
export const MAKE_TOKEN = "pivotkit-server token new (with --file <path> it writes a file only you read)";

/** The command that makes a key for output.downloads.key or audit.key, for the messages. */
export const makeKey = (use) => `pivotkit-server key new --for ${use} --file <path>`;

/** How often the issuer's metadata is read again (a changed jwks_uri), and the least time between two reads for a token with an unknown key. */
export const METADATA_REFRESH = Object.freeze({ everyMs: 3_600_000, unknownKeyMs: 60_000 });

/** What a request without a token is told: plain words, since PowerShell's ErrorDetails drops what looks like a tag. */
const NO_TOKEN_TEXT = "no token; send Authorization: Bearer YOUR_TOKEN";

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
        return { refused: header ? "send one Authorization header, not two" : NO_TOKEN_TEXT };
    }
    const m = /^Bearer[ ]+(\S+)$/i.exec(header.trim());
    return m && TOKEN_SYNTAX.test(m[1]) ? { token: m[1] } : { refused: "not a bearer token; send Authorization: Bearer YOUR_TOKEN" };
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
        const read = t.env ? async () => env[t.env] ?? "" : async () => secretValue(await readSecretFile(pathOf(options, /** @type {string} */ (t.file))).catch(() => ""), "token");
        const value = await read();
        if (t.file && value.length < TOKEN_MIN) {
            const why = await readSecretFile(pathOf(options, t.file)).then(() => null, (e) => e?.code);
            if (why === "EACCES") {
                throw new ConfigError(`auth: ${which} (${t.file}) cannot be read: permission denied for the user ${process.getuid?.() ?? ""} the server runs as (in the container image: 10001)`);
            }
            if (why === "UTF16") {
                throw new ConfigError(`auth: ${which} (${t.file}) ${UTF16_TEXT}`);
            }
            if (why === "NOT_REGULAR_FILE" || why === "TOO_LARGE") {
                throw new ConfigError(`auth: ${which} (${t.file}) cannot be read: ${unreadable(why)}`);
            }
        }
        if (value.length < TOKEN_MIN) {
            throw new ConfigError(`auth: ${which} (${t.env ? `$${t.env}` : "its file"}) is missing or shorter than ${TOKEN_MIN} characters; make one with: ${MAKE_TOKEN}`);
        }
        if (!TOKEN_SYNTAX.test(value)) {
            throw new ConfigError(`auth: ${which} (${t.env ? `$${t.env}` : "its file"}) ${TOKEN_SYNTAX_TEXT}; make one with: ${MAKE_TOKEN}`);
        }
        const guessable = tokenGuessable(value);
        if (guessable) {
            throw new ConfigError(`auth: ${which} (${t.env ? `$${t.env}` : "its file"}) is ${guessable}; make one with: ${MAKE_TOKEN}`);
        }
        // validateOptions checked the date: refused from then on
        const expiresAt = t.expires ? expiryOf(t.expires, { durations: false }) : null;
        out.push({ name: t.name, which, file: t.file ? pathOf(options, t.file) : null, scopes: t.scopes ?? null, profile: t.profile ?? null, expires: t.expires ?? null, expiresAt, read: t.file ? judged(read) : async () => ({ value, usable: true }) });
    }
    return out;
}

/**
 * A token file's read with whether its token can be used (TOKEN_MIN, tokenGuessable), judged once
 * per value the file gives, not on every request that compares it. A variable's token is judged at
 * start.
 * @param {() => Promise<string>} read
 * @returns {() => Promise<{ value: string, usable: boolean }>}
 */
function judged(read) {
    let last = { value: "", usable: false };
    return async () => {
        const value = await read();
        if (value !== last.value) {
            last = { value, usable: value.length >= TOKEN_MIN && !tokenGuessable(value) };
        }
        return last;
    };
}

/** How often a static token's file that cannot be used is said on the log, at most: once a minute. */
const SHORT_TOKEN_WARN_MS = 60_000;

/** The issuer's metadata (issuer.js), for the token exchange's default token endpoint and the download sign-in. */
export { discover } from "./issuer.js";

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
 * @property {{ allScopes?: boolean, signed?: boolean, profile?: string | null, subject?: string | null, issuer?: string | null, groups?: string[], groupsUnknown?: boolean, audit?: string | null, claims?: Readonly<Record<string, string | number | boolean>> }} [extra]  subject: the token's auth.subjectClaim when usable, issuer: its iss, groups: the person's groups when the token carries a usable list, groupsUnknown: it does not (cut, too long, an overage marker, missing), audit: how the log names the person, claims: the ones sources' params are bound to (OAuth)
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
 * `hasgroups` for the claim "groups"), a text without a separator, a list with something other than texts, more than
 * GROUPS_MAX entries or one longer than GROUP_MAX characters. An empty list is known: no groups.
 * @param {Record<string, unknown>} payload
 * @param {import("./config.js").AuthOptions} auth
 * @returns {{ groups: string[] } | { unknown: keyof typeof UNKNOWN_GROUPS }}
 */
export function groupsOf(payload, auth) {
    const claim = auth.groupsClaim ?? "groups";
    const names = payload._claim_names;
    // `hasgroups` (Microsoft Entra ID's marker) speaks of the claim "groups" only
    if ((names && typeof names === "object" && Object.hasOwn(names, claim)) || (claim === "groups" && (payload.hasgroups === true || payload.hasgroups === "true"))) {
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

/** What a person is told who is in none of the groups of auth.groupProfiles, when nothing else names a profile either. */
export const NOT_IN_GROUP = "your sign-in gives you no access to this server's data; ask the operator";

/**
 * Why a verified OAuth caller is refused (403) for its groups, or null. With auth.groupProfiles set:
 * a token whose groups are unknown, when no token profile, client profile or auth.defaultProfile
 * decides its profile instead (GROUPS_REFUSED); a person in none of the groups, when nothing else
 * names a profile either (no client, scope or default profile; NOT_IN_GROUP). A cut or missing group
 * list, or a group the operator did not list, never falls through to the sources' own policy, which
 * may show more than any profile.
 * @param {import("./config.js").AuthOptions | undefined} auth
 * @param {{ token?: string, clientId?: string, scopes?: string[], extra?: Record<string, any> } | undefined} authInfo  a verified token's (AuthInfo, or the SDK's copy of it)
 * @returns {string | null}
 */
export function groupRefusal(auth, authInfo) {
    if (!authInfo || authInfo.token === "" || !auth?.groupProfiles?.length) {
        return null;
    }
    if (!authInfo.extra?.groupsUnknown) {
        return profileOf(auth, /** @type {AuthInfo} */ (authInfo)) === null ? NOT_IN_GROUP : null;
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
    let key;
    try {
        key = await readSecret(options.audit.key, options, env);
    } catch (e) {
        throw new ConfigError(`audit.key: ${String(e?.message ?? e)}`);
    }
    if (key.length < AUDIT_KEY_MIN) {
        throw new ConfigError(`audit.key: at least ${AUDIT_KEY_MIN} characters (a short key lets anyone with the log try names); make one with: ${makeKey("audit")}`);
    }
    return { subject, key: Buffer.from(key, "utf8") };
}

/** What a request with a token the server does not know is told. */
const UNKNOWN_TOKEN_TEXT = "unknown token; check the token the operator gave you";

/** What a caller with a signed token is told, by why it was refused; only a caller with a genuinely signed token gets past "unknown". */
const SIGNED_REFUSALS = Object.freeze({ EXPIRED: "this token expired; ask the operator for a new one", REVOKED: "this token was revoked; ask the operator for a new one", NOT_YET_VALID: "this token is not valid yet; the clocks of the server and the machine that issued it differ" });

/**
 * The check of the signed tokens of auth.signedTokens.dir (signed-tokens.js): a bearer in, an
 * AuthInfo out, or AuthRefusal. A token whose profile policy.profiles no longer has is refused. The
 * log names a refused token by why (debug), never by its value.
 * @param {import("./config.js").ServerOptions} options
 * @param {any} log
 * @returns {(token: string) => Promise<AuthInfo>}
 */
function signedCheckOf(options, log) {
    const store = signedStore(pathOf(options, /** @type {string} */ (options.auth?.signedTokens?.dir)));
    // a stranger's made-up token reaches these before any check: each text at most once a minute
    /** @type {Map<string, number>} */
    const warned = new Map();
    const warn = (text) => {
        const now = Date.now();
        if (now - (warned.get(text) ?? -Infinity) >= SHORT_TOKEN_WARN_MS) {
            warned.set(text, now);
            log.warn(text);
        }
    };
    const verifier = createSignedVerifier({
        keyFor: keyring(store, { onProblem: (text) => warn(`auth: signed tokens: ${text}`) }),
        isRevoked: (id) => store.isRevoked(id),
        issuer: SIGNED_TOKEN.issuer,
        typ: SIGNED_TOKEN.typ,
        clockToleranceSec: options.auth?.clockTolerance ?? 30,
        maxLifetimeSec: maxLifetimeOf(options)
    });
    const profiles = new Set(Object.keys(options.policy?.profiles ?? {}));
    return async (token) => {
        let claims;
        try {
            claims = await verifier.verify(token);
        } catch (e) {
            if (!(e instanceof SignedTokenError)) {
                throw e;
            }
            log.debug("auth: signed token refused", { reason: e.code });
            throw new AuthRefusal(401, "invalid_token", SIGNED_REFUSALS[/** @type {keyof typeof SIGNED_REFUSALS} */ (e.code)] ?? UNKNOWN_TOKEN_TEXT);
        }
        if (claims.profile !== null && !profiles.has(claims.profile)) {
            warn(`auth: the signed token ${claims.id} names the profile "${claims.profile}", which policy.profiles does not have: refused`);
            throw new AuthRefusal(401, "invalid_token", "this token's profile is not configured; ask the operator for a new one");
        }
        return { token: "", clientId: claims.id, scopes: claims.scopes ?? [], expiresAt: claims.expiresAt, extra: { allScopes: claims.scopes === null, profile: claims.profile, signed: true } };
    };
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
        for (const t of tokens) {
            if (t.expiresAt !== null && Date.now() >= t.expiresAt) {
                log.warn(`auth: the token "${t.name}" expired (${t.expires}): requests with it get 401; remove it (pivotkit-server token remove ${t.name}) or give it a later expires`);
            }
        }
        const signed = auth.signedTokens?.dir ? signedCheckOf(options, log) : null;
        /** @type {Map<string, number>} when each token's unusable file was last said on the log */
        const warned = new Map();
        // a file emptied, removed or cut after the start (a rotation gone wrong): every request with
        // that token gets 401, so the operator is told which entry, never its value
        const unusable = async (t) => {
            const now = Date.now();
            if (now - (warned.get(t.name) ?? -Infinity) >= SHORT_TOKEN_WARN_MS) {
                warned.set(t.name, now);
                // the cause, never the value or the path
                const cause = await readSecretFile(/** @type {string} */ (t.file)).then(
                    (text) => {
                        const v = secretValue(text, "token");
                        return v === "" ? "its file is empty" : v.length < TOKEN_MIN ? `its file has ${v.length} characters` : `its file holds a token ${tokenGuessable(v) ?? "that cannot be used"}`;
                    },
                    (e) => (e?.code === "ENOENT" ? "its file is missing" : e?.code === "UTF16" ? `its file ${UTF16_TEXT}` : "its file cannot be read")
                );
                log.warn(`auth: ${t.which} cannot be used (${cause}): a token has at least ${TOKEN_MIN} characters and ${TOKEN_DISTINCT_MIN} different ones, so requests with it are refused; write the token to the file again (write it whole, then rename it into place)`);
            }
        };
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
                    throw new AuthRefusal(401, "invalid_token", bearer.refused ?? NO_TOKEN_TEXT);
                }
                const given = digest(bearer.token);
                let match = null;
                // every token compared, so the time does not tell which one is close
                for (const t of tokens) {
                    const { value, usable } = await t.read();
                    if (!usable) {
                        await unusable(t);
                    } else if (timingSafeEqual(given, digest(value)) && !match) {
                        match = t;
                    }
                }
                if (!match) {
                    // a static token never reaches the signed check: a static one with dots keeps working
                    if (signed && looksSigned(bearer.token)) {
                        return signed(bearer.token);
                    }
                    throw new AuthRefusal(401, "invalid_token", UNKNOWN_TOKEN_TEXT);
                }
                if (match.expiresAt !== null && Date.now() >= match.expiresAt) {
                    // only a caller with the right value learns this
                    throw new AuthRefusal(401, "invalid_token", `this token expired (${match.expires}); ask the operator for a new one`);
                }
                const expiresAt = Math.floor(Date.now() / 1000) + 3600;
                return { token: "", clientId: match.name, scopes: match.scopes ?? [], expiresAt: match.expiresAt === null ? expiresAt : Math.min(expiresAt, Math.floor(match.expiresAt / 1000)), extra: { allScopes: match.scopes === null, profile: match.profile } };
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
    // the claims a caller holds: only those the sources' params name (sources/params.js claimsOf)
    const claimNames = claimNamesOf(options.sources);
    const { jwtVerify } = await import("jose");
    const rules = issuerRulesOf(options);
    /** @type {any} */
    let state = { metadata: null, jwks: null, jwksUri: null };
    // when a token with an unknown key last made the metadata be read again
    let unknownAt = 0;
    /** @type {Promise<boolean> | null} */
    let inflight = null;

    /** Reads the issuer's metadata; a new key set only when its jwks_uri changed, so keys stay cached. Whether the key set changed. */
    async function load() {
        const metadata = await discover(issuer, rules);
        const jwksUri = jwksUriOf(metadata, issuer, auth.jwksUri);
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
            log.warn(`oauth: the issuer's metadata could not be read again, keeping the loaded one: ${String(e?.message ?? e).slice(0, 600)}`);
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
            log.warn(`oauth: the issuer's metadata could not be loaded, trying again in ${delay / 1000} s: ${String(e?.message ?? e).slice(0, 600)}`);
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
        /**
         * How the log names a person signed in elsewhere (a download link's sign-in), as a call's log
         * line names them: auditText with the operator's audit setting and key; null with audit off.
         * @param {string | null | undefined} iss
         * @param {string | null | undefined} subject
         */
        auditName: (iss, subject) => auditText(audit, iss, subject),
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
            const claims = claimsOf(payload, claimNames);
            /** @type {AuthInfo} */
            const info = {
                token,
                clientId: String(payload.azp ?? payload.client_id ?? "client").slice(0, 80),
                scopes: scopesOf(payload, auth.scopeClaim),
                expiresAt: /** @type {number} */ (payload.exp),
                resource,
                extra: { subject, issuer: iss, ...("groups" in groups ? { groups: groups.groups } : { groupsUnknown: true }), audit: auditText(audit, iss, subject), ...(claims ? { claims } : {}) }
            };
            // what the operator needs to set groupProfiles up: how many groups (never which), and
            // the profile they gave
            if (log.level === "debug") {
                const refused = groupRefusal(auth, info);
                log.debug("oauth: signed in", { groups: "groups" in groups ? groups.groups.length : `unknown (${UNKNOWN_GROUPS[groups.unknown]})`, profile: refused ? `refused (403: ${refused === GROUPS_REFUSED ? "groups unknown" : "in none of the groups"})` : (profileOf(auth, info) ?? "none (the sources' policy)") });
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
 * Null: the sources' own policy (with auth.groupProfiles, groupRefusal refuses such a person).
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
 * some). Throws OperationError NOT_ALLOWED for a caller groupRefusal refuses.
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
        // a signed token by its ID: a static token's name never names the same identity
        known.set(caller, { basis: [authInfo.extra?.signed ? "signed" : "token", String(authInfo.clientId ?? "token")], token: null });
        return caller;
    }
    const refused = groupRefusal(authOptions, authInfo);
    if (refused) {
        // the front ends refuse such a caller (403) before they make one; a host with a gate of its
        // own is refused here, since no profile (the sources' own policy) could be wider
        throw new OperationError("NOT_ALLOWED", refused);
    }
    const subject = subjectOf(authInfo.extra?.subject);
    const issuer = typeof authInfo.extra?.issuer === "string" ? authInfo.extra.issuer : null;
    const groups = Array.isArray(authInfo.extra?.groups) ? authInfo.extra.groups.filter((g) => typeof g === "string") : [];
    const claims = authInfo.extra?.claims && typeof authInfo.extra.claims === "object" ? claimsOf(authInfo.extra.claims, new Set(Object.keys(authInfo.extra.claims)), { verified: true }) : undefined;
    const caller = { scopes, client, profile, subject, issuer, ...(groups.length ? { groups: [...groups] } : {}), ...(claims ? { claims } : {}) };
    noteAudit(caller, authInfo.extra?.audit);
    known.set(caller, { basis: subject && issuer ? [issuer, subject] : null, token: typeof authInfo.token === "string" && authInfo.token ? authInfo.token : null, expiresAt: typeof authInfo.expiresAt === "number" && Number.isFinite(authInfo.expiresAt) ? Math.floor(authInfo.expiresAt) : null });
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
 * @param {{ url: string, clientId: string, clientSecret?: string, audience?: string, resource?: string, scope?: string, signal?: AbortSignal, timeMs?: number, maxBytes?: number, allowPrivate?: boolean, allowIpLiterals?: boolean, fetch?: typeof guardedFetch }} request  fetch: a guardedFetch (createGuardedFetch's: sources/auth.js passes httpMeans.fetch, which the tests replace with one trusting their certificate); anything else is refused
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
    if (request.fetch !== undefined && !isGuardedFetch(request.fetch)) {
        throw new TypeError("exchangeTokenFor sends a person's token through a guardedFetch only");
    }
    const answer = await (request.fetch ?? guardedFetch)(request.url, { method: "POST", headers, body: form.toString(), ...(request.signal ? { signal: request.signal } : {}), ...(request.timeMs ? { timeMs: request.timeMs } : {}), ...(request.maxBytes ? { maxBytes: request.maxBytes } : {}), ...(request.allowPrivate !== undefined ? { allowPrivate: request.allowPrivate } : {}), ...(request.allowIpLiterals ? { allowIpLiterals: true } : {}) });
    return { ...answer, subjectExpiresAt: entry.expiresAt ?? null };
}
