/*
 * The input a source-taking operation takes beyond pivotkit-report's table: `params` (values for a
 * source's parameters). An extra input is offered on a surface (MCP, REST and its OpenAPI document)
 * only when the server's configuration uses it, decided once at start (offersOf), so the schemas of a
 * server without parameters stay as they are. present() takes the extras out before the operation
 * runs (withoutExtras), since the operation's own schema refuses unknown keys.
 */

import { OPERATIONS } from "pivotkit-report/operations";
import { PARAM_LIMITS } from "./params.js";

/** The `params` input: values for the source's parameters. */
export const PARAMS_INPUT = Object.freeze({
    type: "object",
    maxProperties: PARAM_LIMITS.count,
    additionalProperties: { type: ["string", "number", "boolean"], maxLength: PARAM_LIMITS.length },
    description: "Values for the source's parameters; list_sources names them."
});

/** The extra inputs by name. */
const EXTRAS = Object.freeze({ params: PARAMS_INPUT });

/**
 * @typedef {{ params?: boolean }} SurfaceOffers  the extra inputs a surface offers
 * @typedef {{ mcp: SurfaceOffers, rest: SurfaceOffers }} Offers
 */

/**
 * What the server offers on each surface, from its options: params when a configured source
 * declares parameters.
 * @param {import("../config.js").ServerOptions} options
 * @returns {Offers}
 */
export function offersOf(options) {
    const params = Object.values(options.sources ?? {}).some((s) => s && s.params && Object.keys(s.params).length > 0);
    return Object.freeze({ mcp: Object.freeze({ params }), rest: Object.freeze({ params }) });
}

/**
 * The extra input properties of an operation on a surface: only for an operation that takes a
 * source, only those offered.
 * @param {string} name
 * @param {SurfaceOffers | undefined} offers
 * @returns {Record<string, unknown>}
 */
export function extraInputs(name, offers) {
    const takesSource = Boolean(/** @type {any} */ (OPERATIONS[name]?.input)?.properties?.source);
    if (!takesSource || !offers) {
        return {};
    }
    return Object.fromEntries(Object.entries(EXTRAS).filter(([key]) => /** @type {any} */ (offers)[key] === true));
}

/**
 * An input without the extra inputs, for the operation itself.
 * @param {Record<string, any>} input
 */
export function withoutExtras(input) {
    const out = { ...input };
    for (const key of Object.keys(EXTRAS)) {
        delete out[key];
    }
    return out;
}

/**
 * What list_sources adds for a caller on a surface, besides the sources (none in this version).
 * @param {any} _context
 * @param {import("../registry.js").Caller} _caller
 * @param {{ surface?: "mcp" | "rest" }} _how
 * @returns {Record<string, unknown>}
 */
export function listExtras(_context, _caller, _how) {
    return {};
}
