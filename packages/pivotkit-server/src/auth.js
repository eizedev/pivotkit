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
 * The token itself is never logged, never passed on, never part of a message.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ConfigError, DEFAULT_ALGORITHMS, pathOf } from "./config.js";

/** The fewest characters of a static token. */
export const TOKEN_MIN = 32;

/** The most bytes of the issuer's metadata document. */
const METADATA_BYTES = 262_144;

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
    const m = /^Bearer[ ]+([A-Za-z0-9\-._~+/]+=*)$/i.exec(header.trim());
    return m ? { token: m[1] } : { refused: "not a bearer token; send Authorization: Bearer <token>" };
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
        const read = t.env ? async () => env[t.env] ?? "" : async () => (await readFile(pathOf(options, /** @type {string} */ (t.file)), "utf8").catch(() => "")).trim();
        const value = await read();
        if (t.file && value.length < TOKEN_MIN) {
            const why = await readFile(pathOf(options, t.file), "utf8").then(() => null, (e) => e?.code);
            if (why === "EACCES") {
                throw new ConfigError(`auth: the token "${t.name}" (${t.file}) cannot be read: permission denied for the user ${process.getuid?.() ?? ""} the server runs as (in the container image: 10001)`);
            }
        }
        if (value.length < TOKEN_MIN) {
            throw new ConfigError(`auth: the token "${t.name}" (${t.env ? `$${t.env}` : "its file"}) is missing or shorter than ${TOKEN_MIN} characters; make one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`);
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
 * @property {{ allScopes?: boolean, profile?: string | null }} [extra]
 */

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
    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    /** @type {any} */
    let state = { metadata: null, jwks: null };

    async function load() {
        const metadata = await discover(issuer);
        const jwksUri = auth.jwksUri ?? metadata.jwks_uri;
        if (!jwksUri) {
            throw new Error("the issuer's metadata has no jwks_uri (set auth.jwksUri)");
        }
        if (!auth.jwksUri && new URL(jwksUri).origin !== new URL(issuer).origin) {
            throw new Error(`the issuer's jwks_uri is on another origin (${new URL(jwksUri).origin}); set auth.jwksUri to accept it`);
        }
        state = { metadata, jwks: createRemoteJWKSet(new URL(jwksUri), { timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 600_000 }) };
        log.info("oauth: issuer metadata loaded", { issuer });
    }
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
            try {
                const { payload } = await jwtVerify(token, state.jwks, { issuer, audience, algorithms, clockTolerance: auth.clockTolerance ?? 30, ...(auth.requireTyp ? { typ: auth.requireTyp } : {}), requiredClaims: ["exp"] });
                return { token, clientId: String(payload.azp ?? payload.client_id ?? "client").slice(0, 80), scopes: scopesOf(payload, auth.scopeClaim), expiresAt: /** @type {number} */ (payload.exp), resource, extra: {} };
            } catch (e) {
                // why a token failed stays here (a message would help someone who tries tokens); the
                // operator sees it with --log debug: jose's code and the claim, never the token
                log.debug("oauth: token refused", { reason: String(e?.code ?? e?.name ?? "invalid").slice(0, 60), ...(e?.claim ? { claim: String(e.claim).slice(0, 40) } : {}), expected: { issuer, audience } });
                throw new AuthRefusal(401, "invalid_token", "the access token is not valid for this server");
            }
        },
        close() {
            closed = true;
            if (timer) {
                clearTimeout(timer);
            }
        }
    };
}

/**
 * The policy profile of a verified caller: a static token's own, else the OAuth client's
 * (auth.clientProfiles), else the one profile its scopes name (auth.scopeProfiles); scopes that name
 * two different profiles give none (the server's policy, never more).
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
    if (authInfo.token === "") {
        // a static token without a profile of its own
        return null;
    }
    if (auth?.clientProfiles && Object.hasOwn(auth.clientProfiles, authInfo.clientId)) {
        return auth.clientProfiles[authInfo.clientId];
    }
    const named = new Set((authInfo.scopes ?? []).filter((s) => auth?.scopeProfiles && Object.hasOwn(auth.scopeProfiles, s)).map((s) => auth?.scopeProfiles?.[s]));
    return named.size === 1 ? /** @type {string} */ ([...named][0]) : null;
}
