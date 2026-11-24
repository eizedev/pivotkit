/*
 * Scopes as a caller sees them: the ones a resource's metadata offers (scopes_supported) and the hint
 * list_sources gives when a sign-in reaches no source.
 *
 * The metadata offers the required scopes and, with auth.offerSourceScopes (off by default: a
 * provider may refuse a sign-in that asks for a scope it does not define, and the metadata is public),
 * every scope a source needs, so a person and a client can see which scopes exist. The 401 challenge keeps
 * naming the required scopes only: a client that follows the MCP specification asks for those first,
 * and asking every client for every source's scope would be the over-broad consent the MCP security
 * best practices warn of. A scope of auth.scopeProfiles is never offered by itself: a client that
 * asked for it would pick its own policy profile.
 */

import { holds } from "./registry.js";

/**
 * The scopes a resource's metadata offers (scopes_supported), or null for none. auth.scopesSupported,
 * when set, is taken as it is (an empty list offers none, unless a scope is required); otherwise the surface's required scopes (REST:
 * rest.requiredScopes, else auth.requiredScopes; MCP: auth.requiredScopes) and, with
 * auth.offerSourceScopes true, the scopes of the sources (MCP: files.scopes too; REST takes no
 * file paths), without those auth.scopeProfiles names. null when that leaves none.
 * @param {import("./config.js").ServerOptions} options
 * @param {"mcp" | "rest"} surface
 * @returns {string[] | null}
 */
export function offeredScopes(options, surface) {
    const auth = options.auth ?? {};
    const required = (surface === "rest" ? options.rest?.requiredScopes : undefined) ?? auth.requiredScopes ?? [];
    if (auth.scopesSupported) {
        return auth.scopesSupported.length || required.length ? auth.scopesSupported : null;
    }
    const offered = new Set(required);
    for (const scope of sourceScopes(options, surface)) {
        if (!(auth.scopeProfiles && Object.hasOwn(auth.scopeProfiles, scope))) {
            offered.add(scope);
        }
    }
    return offered.size ? [...offered] : null;
}

/**
 * The scopes the sources need that the metadata may offer: each source's (in the options' order)
 * and, on MCP, files.scopes; none unless auth.offerSourceScopes is true.
 * @param {import("./config.js").ServerOptions} options
 * @param {"mcp" | "rest"} surface
 * @returns {string[]}
 */
export function sourceScopes(options, surface) {
    if (options.auth?.offerSourceScopes !== true) {
        return [];
    }
    const scopes = Object.values(options.sources ?? {}).flatMap((s) => s.scopes ?? []);
    if (surface === "mcp" && options.files?.allowDirs?.length) {
        scopes.push(...(options.files.scopes ?? []));
    }
    return [...new Set(scopes)];
}

/** The hint's first sentence: the list is empty because of the sign-in, not because nothing is there. */
export const NO_SOURCE = "No source is available with your current sign-in.";

/**
 * The hint list_sources gives a caller that sees no source although the server has some it lacks
 * the scopes for, or null. With OAuth it names the scopes the metadata offers that the caller does
 * not hold (they are public there already); a static token's caller, or scopes the server does not
 * offer, get the first sentence and who to ask.
 * @param {{ options: import("./config.js").ServerOptions }} context
 * @param {import("./registry.js").Caller} caller
 * @param {Array<{ id: string }>} sources  the sources the caller may use
 * @param {{ surface?: "mcp" | "rest" }} [how]
 * @returns {string | null}
 */
export function listHint(context, caller, sources, how = {}) {
    const options = context.options;
    if (sources.length || caller.scopes === null) {
        return null;
    }
    const surface = how.surface ?? "mcp";
    const withheld = Object.values(options.sources ?? {}).some((s) => !holds(caller, s.scopes));
    if (!withheld) {
        return null;
    }
    if ((options.auth?.mode ?? "none") !== "oauth") {
        return `${NO_SOURCE} Ask the operator for a token with the scopes of a source.`;
    }
    const missing = (offeredScopes(options, surface) ?? []).filter((s) => !caller.scopes?.has(s));
    return missing.length ? `${NO_SOURCE} This server offers the scopes: ${missing.join(" ")}. Sign in with one of them, or ask the operator.` : `${NO_SOURCE} Ask the operator which scopes to sign in with.`;
}
