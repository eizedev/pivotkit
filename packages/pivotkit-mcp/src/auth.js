/*
 * Authentication of the MCP endpoint: pivotkit-server's shared core (static tokens, the OAuth
 * issuer and its keys) answered the way MCP clients expect:
 *
 * - "token": 401 with `WWW-Authenticate: Bearer realm="pivotkit-mcp"` and an OAuth error body;
 * - "oauth": the endpoint is an OAuth 2.1 protected resource (MCP authorization, revision
 *   2026-07-28): Protected Resource Metadata (RFC 9728) with the issuer as authorization server, the
 *   SDK's requireBearerAuth for the 401 and 403 challenges (insufficient_scope for missing scopes),
 *   403 access_denied for a person whose token does not carry their groups (auth.groupProfiles),
 *   503 until the issuer's metadata is loaded. Its audience is auth.resource (the REST service has
 *   its own).
 *
 * The token itself is never logged, never passed on, never part of a message.
 */

import { OAuthError, getOAuthProtectedResourceMetadataUrl, oauthMetadataResponse, requireBearerAuth } from "@modelcontextprotocol/server";
import { AuthRefusal, groupRefusal, offeredScopes } from "pivotkit-server";

/** The client of each answer that refused a verified token for its person's groups, for the log line. */
const refusedClients = new WeakMap();

/**
 * The client (app) whose verified token an answer refused for its person's groups, or undefined:
 * the refused log line names it, so the operator finds the app to fix; never the person.
 * @param {Response} response
 * @returns {string | undefined}
 */
export const refusedClientOf = (response) => refusedClients.get(response);

/** A JSON answer with a status and headers. */
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

/**
 * Builds the authentication of the MCP endpoint over the context's shared core.
 * @param {any} context  createMcpContext's
 * @param {{ env: Record<string, string | undefined>, loopback: boolean }} runtime
 */
export async function createAuth(context, runtime) {
    const options = context.options;
    const auth = options.auth ?? {};
    const core = await context.auth(runtime);
    const mode = core.mode;
    if (mode === "none") {
        return { mode, gate: async () => null, metadata: () => undefined };
    }

    if (mode === "token") {
        const challenge = { "www-authenticate": 'Bearer realm="pivotkit-mcp"' };
        return {
            mode,
            /** @param {Request} request */
            async gate(request) {
                try {
                    return await core.check(request);
                } catch (e) {
                    if (e instanceof AuthRefusal) {
                        return json(401, { error: "invalid_token", error_description: e.message }, challenge);
                    }
                    throw e;
                }
            },
            metadata: () => undefined
        };
    }

    // oauth
    const resource = new URL(/** @type {string} */ (auth.resource));
    const audience = auth.audience?.length ? auth.audience : [resource.href.replace(/\/$/, ""), resource.href];
    const requiredScopes = auth.requiredScopes ?? [];
    if (!requiredScopes.length) {
        context.log.warn("auth.requiredScopes is empty: any token of the issuer for this audience is accepted");
    }
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
    const verifier = {
        /** @param {string} token */
        async verifyAccessToken(token) {
            try {
                return await core.verify(token, { audience, resource });
            } catch (e) {
                throw e instanceof AuthRefusal ? new OAuthError("invalid_token", e.message) : e;
            }
        }
    };
    // the audience is checked by the core (resource or a configured audience); the verifier then
    // reports the canonical resource, so the SDK's own resource check agrees with it
    const gateOf = requireBearerAuth({ verifier, requiredScopes, resourceMetadataUrl, expectedResource: resource });
    return {
        mode,
        resourceMetadataUrl,
        /** @param {Request} request */
        async gate(request) {
            if (!core.ready()) {
                return json(503, { error: "temporarily_unavailable", error_description: "the server is waiting for its authorization server" }, { "retry-after": "10" });
            }
            if (new URL(request.url).searchParams.has("access_token")) {
                return json(400, { error: "invalid_request", error_description: "a token in the address is refused" });
            }
            const authInfo = await gateOf(request);
            // a person whose groups the token does not carry (auth.groupProfiles): 403, no scope
            // challenge (more scopes would not help), not counted as a refused token
            const refused = authInfo instanceof Response ? null : groupRefusal(auth, authInfo);
            if (!refused) {
                return authInfo;
            }
            const answer = json(403, { error: "access_denied", error_description: refused });
            refusedClients.set(answer, String(/** @type {any} */ (authInfo).clientId));
            return answer;
        },
        /** The discovery documents (RFC 9728, and the issuer's metadata for older clients), or undefined. */
        metadata(request) {
            const metadata = core.metadata();
            if (!metadata) {
                return undefined;
            }
            const offered = offeredScopes(options, "mcp");
            return oauthMetadataResponse(request, {
                oauthMetadata: metadata,
                resourceServerUrl: resource,
                resourceName: "pivotkit",
                serviceDocumentationUrl: new URL("https://pivotkit.eize.dev/reference/mcp/"),
                ...(offered ? { scopesSupported: offered } : {}),
                ...(auth.allowInsecureIssuer ? { dangerouslyAllowInsecureIssuerUrl: true } : {})
            });
        }
    };
}
