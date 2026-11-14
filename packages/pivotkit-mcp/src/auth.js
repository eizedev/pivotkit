/*
 * Authentication of the HTTP transport, three modes:
 *
 * - "none": no check (loopback, or an explicit opt-in on another address).
 * - "token": static bearer tokens, each with a name (logged) and optionally its scopes; read from an
 *   environment variable at start or from a file on every request (rotation without a restart);
 *   compared as SHA-256 digests in constant time.
 * - "oauth": the server is an OAuth 2.1 protected resource (MCP authorization, revision 2026-07-28):
 *   Protected Resource Metadata (RFC 9728) with the issuer as authorization server, access tokens as
 *   JWTs checked against the issuer's JWKS with jose (signature, issuer, audience, expiry, algorithms;
 *   no "none", no HMAC), 401 with a challenge naming the metadata, 403 insufficient_scope for missing
 *   scopes (the SDK's requireBearerAuth). The issuer's metadata is fetched in the background with
 *   retries; until it is there, /mcp answers 503.
 *
 * The token itself is never logged, never passed on, never part of a message.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { OAuthError, getOAuthProtectedResourceMetadataUrl, oauthMetadataResponse, requireBearerAuth } from "@modelcontextprotocol/server";
import { ConfigError, DEFAULT_ALGORITHMS, pathOf } from "./config.js";

/** The fewest characters of a static token. */
export const TOKEN_MIN = 32;

/** The most bytes of the issuer's metadata document. */
const METADATA_BYTES = 262_144;

/** SHA-256 of a text, for comparing tokens in constant time. */
const digest = (text) => createHash("sha256").update(text, "utf8").digest();

/** A JSON answer with a status and headers. */
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

/** The bearer token of a request, or a reason why there is none to check. */
function bearerOf(request) {
    const url = new URL(request.url);
    if (url.searchParams.has("access_token")) {
        return { refused: "a token in the address is refused; send it in the Authorization header" };
    }
    const header = request.headers.get("authorization");
    // Headers joins repeated headers with ", ": two Authorization headers are refused
    if (!header || header.includes(",")) {
        return { refused: header ? "one Authorization header" : "no token" };
    }
    const m = /^Bearer[ ]+([A-Za-z0-9\-._~+/]+=*)$/i.exec(header.trim());
    return m ? { token: m[1] } : { refused: "not a bearer token" };
}

/**
 * The static tokens of the options: each with its name, where it comes from and its scopes.
 * @param {import("./config.js").AuthOptions} auth
 * @param {Record<string, string | undefined>} env
 * @param {import("./config.js").McpOptions} options
 */
async function staticTokens(auth, env, options) {
    const list = auth.tokens?.length ? auth.tokens : [{ name: "token", env: "PIVOTKIT_MCP_TOKEN" }];
    const out = [];
    for (const t of list) {
        const read = t.env ? async () => env[t.env] ?? "" : async () => (await readFile(pathOf(options, /** @type {string} */ (t.file)), "utf8").catch(() => "")).trim();
        const value = await read();
        if (value.length < TOKEN_MIN) {
            throw new ConfigError(`auth: the token "${t.name}" (${t.env ? `$${t.env}` : "its file"}) is missing or shorter than ${TOKEN_MIN} characters; make one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`);
        }
        out.push({ name: t.name, scopes: t.scopes ?? null, read: t.file ? read : async () => value });
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
    const text = await response.text();
    if (text.length > METADATA_BYTES) {
        throw new Error(`the document at ${url} is larger than ${METADATA_BYTES} bytes`);
    }
    return JSON.parse(text);
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
            errors.push(String(e?.message ?? e));
        }
    }
    throw new Error(errors.join("; "));
}

/** The scopes of a token's claims: "scope" (space-separated), else "scp" (a list or a text). */
export function scopesOf(payload, claim) {
    const raw = claim ? payload[claim] : (payload.scope ?? payload.scp);
    return Array.isArray(raw) ? raw.filter((s) => typeof s === "string") : typeof raw === "string" ? raw.split(/\s+/).filter(Boolean) : [];
}

/**
 * Builds the authentication of the HTTP transport.
 * @param {import("./config.js").McpOptions} options
 * @param {{ env: Record<string, string | undefined>, log: any, loopback: boolean }} runtime
 */
export async function createAuth(options, { env, log, loopback }) {
    const auth = options.auth ?? {};
    const mode = auth.mode ?? "none";
    if (mode === "none") {
        if (!loopback && !auth.allowUnauthenticated) {
            throw new ConfigError("auth: an address other than loopback needs auth token or oauth (or auth.allowUnauthenticated: true, --allow-unauthenticated, for a network you trust)");
        }
        if (!loopback) {
            log.warn("serving without authentication on an address other than loopback (auth.allowUnauthenticated)");
        }
        return { mode, gate: async () => null, metadata: () => undefined };
    }

    if (mode === "token") {
        const tokens = await staticTokens(auth, env, options);
        const challenge = { "www-authenticate": 'Bearer realm="pivotkit-mcp"' };
        return {
            mode,
            /** @param {Request} request */
            async gate(request) {
                const bearer = bearerOf(request);
                if (!bearer.token) {
                    return json(401, { error: "invalid_token", error_description: bearer.refused }, challenge);
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
                    return json(401, { error: "invalid_token", error_description: "unknown token" }, challenge);
                }
                return { token: "", clientId: match.name, scopes: match.scopes ?? [], expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { allScopes: match.scopes === null } };
            },
            metadata: () => undefined
        };
    }

    // oauth
    const issuer = /** @type {string} */ (auth.issuer);
    const resource = new URL(/** @type {string} */ (auth.resource));
    if (new URL(issuer).protocol !== "https:" && !auth.allowInsecureIssuer) {
        throw new ConfigError("auth.issuer: must be an https:// address (auth.allowInsecureIssuer is for tests only)");
    }
    const audience = auth.audience?.length ? auth.audience : [resource.href.replace(/\/$/, ""), resource.href];
    const algorithms = auth.algorithms?.length ? auth.algorithms : [...DEFAULT_ALGORITHMS];
    const requiredScopes = auth.requiredScopes ?? [];
    if (!requiredScopes.length) {
        log.warn("auth.requiredScopes is empty: any token of the issuer for this audience is accepted");
    }
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
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
    const attempt = () =>
        load().catch((e) => {
            log.warn(`oauth: the issuer's metadata could not be loaded, trying again in ${delay / 1000} s: ${String(e?.message ?? e).slice(0, 300)}`);
            timer = setTimeout(attempt, delay);
            timer.unref?.();
            delay = Math.min(delay * 2, 60_000);
        });
    await attempt();

    const verifier = {
        /** @param {string} token */
        async verifyAccessToken(token) {
            try {
                const { payload } = await jwtVerify(token, state.jwks, { issuer, audience, algorithms, clockTolerance: auth.clockTolerance ?? 30, ...(auth.requireTyp ? { typ: auth.requireTyp } : {}), requiredClaims: ["exp"] });
                return { token, clientId: String(payload.azp ?? payload.client_id ?? "client").slice(0, 80), scopes: scopesOf(payload, auth.scopeClaim), expiresAt: /** @type {number} */ (payload.exp), resource, extra: {} };
            } catch {
                // why a token failed stays here: a message would help someone who tries tokens
                throw new OAuthError("invalid_token", "the access token is not valid for this server");
            }
        }
    };
    const gateOf = requireBearerAuth({ verifier, requiredScopes, resourceMetadataUrl, expectedResource: resource });
    return {
        mode,
        resourceMetadataUrl,
        /** @param {Request} request */
        async gate(request) {
            if (!state.jwks) {
                return json(503, { error: "temporarily_unavailable", error_description: "the server is waiting for its authorization server" }, { "retry-after": "10" });
            }
            if (new URL(request.url).searchParams.has("access_token")) {
                return json(400, { error: "invalid_request", error_description: "a token in the address is refused" });
            }
            return gateOf(request);
        },
        /** The discovery documents (RFC 9728, and the issuer's metadata for older clients), or undefined. */
        metadata(request) {
            if (!state.metadata) {
                return undefined;
            }
            return oauthMetadataResponse(request, {
                oauthMetadata: state.metadata,
                resourceServerUrl: resource,
                resourceName: "pivotkit",
                serviceDocumentationUrl: new URL("https://pivotkit.eize.dev/reference/mcp/"),
                ...(auth.scopesSupported?.length || requiredScopes.length ? { scopesSupported: auth.scopesSupported ?? requiredScopes } : {}),
                ...(auth.allowInsecureIssuer ? { dangerouslyAllowInsecureIssuerUrl: true } : {})
            });
        },
        close() {
            if (timer) {
                clearTimeout(timer);
            }
        }
    };
}
