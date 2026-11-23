/*
 * What the REST service says about itself: the OpenAPI document (/openapi.json) and, with OAuth, the
 * Protected Resource Metadata of /api/v1 (RFC 9728), which names the authorization server, the
 * scopes on offer and the CLI's public client.
 */

import { REST_BASE, SIGN_IN_CLIENT_FIELD } from "pivotkit-node/rest";
import { publicOriginOf } from "../config.js";
import { docsLink } from "../branding.js";
import { offeredScopes } from "../scopes.js";
import { openApiDocument } from "./openapi.js";
import { json } from "./problem.js";

/** The PRM path of the REST resource. */
export const PRM_PATH = `/.well-known/oauth-protected-resource${REST_BASE}`;

/**
 * The service's documents.
 * @param {any} context  createContext's
 * @param {{ core: any, mode: "none" | "token" | "oauth", resource: URL, requiredScopes: string[], branding: ReturnType<typeof import("../branding.js").brandingOfContext>, problem: import("./problem.js").Problem }} how  core: context.auth's; mode: auth.mode
 */
export function createDiscovery(context, { core, mode, resource, requiredScopes, branding, problem }) {
    const options = context.options;
    const authOptions = options.auth ?? {};
    let document = null;

    /** The OpenAPI document, made once. */
    const openapi = () => (document ??= openApiDocument({ branding, auth: authOptions, publicUrl: publicOriginOf(options) ?? undefined, issuer: core.metadata?.() ?? null, resource: resource.href, requiredScopes, offers: context.offers?.rest }));

    /** The Protected Resource Metadata: not found without OAuth, AUTH_NOT_READY until the issuer is loaded. */
    function resourceMetadata() {
        if (mode !== "oauth") {
            return problem("NOT_FOUND", "no such route");
        }
        const metadata = core.metadata();
        if (!metadata) {
            return problem("AUTH_NOT_READY", "", { headers: { "retry-after": "10" } });
        }
        const offered = offeredScopes(options, "rest");
        const signInClient = options.rest?.signIn?.clientId;
        return json({ resource: resource.href, authorization_servers: [metadata.issuer], ...(offered ? { scopes_supported: offered } : {}), resource_name: `${branding.name} REST`, ...(branding.docs !== null ? { resource_documentation: docsLink(branding.docs, "reference/rest/") } : {}), ...(signInClient ? { [SIGN_IN_CLIENT_FIELD]: signInClient } : {}) }, 200, { "cache-control": "max-age=300" });
    }

    return { openapi, resourceMetadata };
}
