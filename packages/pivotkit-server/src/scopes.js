/*
 * Scopes as a caller sees them: the ones a resource's metadata offers (scopes_supported) and the hint
 * list_sources gives.
 */

/**
 * The scopes a resource's metadata offers (scopes_supported), or null for none: auth.scopesSupported,
 * else the surface's required scopes (REST: rest.requiredScopes, else auth.requiredScopes; MCP:
 * auth.requiredScopes). null when both are empty; an empty scopesSupported next to required scopes
 * gives an empty list. The 401 challenge names the required scopes, never these.
 * @param {import("./config.js").ServerOptions} options
 * @param {"mcp" | "rest"} surface
 * @returns {string[] | null}
 */
export function offeredScopes(options, surface) {
    const auth = options.auth ?? {};
    const required = (surface === "rest" ? options.rest?.requiredScopes : undefined) ?? auth.requiredScopes ?? [];
    return auth.scopesSupported?.length || required.length ? (auth.scopesSupported ?? required) : null;
}

/**
 * A hint list_sources gives a caller, or null: none in this version.
 * @param {any} _context
 * @param {import("./registry.js").Caller} _caller
 * @param {Array<{ id: string }>} _sources  the sources the caller may use
 * @returns {string | null}
 */
export function listHint(_context, _caller, _sources) {
    return null;
}
