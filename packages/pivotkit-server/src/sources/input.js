/*
 * The input a source-taking operation takes beyond pivotkit-report's table: `params` (values for a
 * source's parameters) and `data` (a table sent in the request, with source "inline:"). An extra input
 * is offered on a surface (MCP, REST and its OpenAPI document) only when the server's configuration
 * uses it, decided once at start (offersOf), so the schemas of a server without parameters stay as
 * they are. present() takes the extras out before the operation runs (withoutExtras), since the
 * operation's own schema refuses unknown keys.
 */

import { OPERATIONS } from "pivotkit-report/operations";
import { PARAM_LIMITS } from "./params.js";
import { INLINE_ID, dataListEntry, mcpCapOf, restDataOffered } from "./inline.js";

/** The `params` input: values for the source's parameters. */
export const PARAMS_INPUT = Object.freeze({
    type: "object",
    maxProperties: PARAM_LIMITS.count,
    additionalProperties: { type: ["string", "number", "boolean"], maxLength: PARAM_LIMITS.length },
    description: "Values for the source's parameters; list_sources names them."
});

/** The longest text of a cell sent in `data` (Excel's longest cell). */
export const DATA_CELL_TEXT = 32_767;

/** The most columns of a table sent in `data`. */
export const DATA_COLUMNS = 1000;

/** The `data` input: a table the caller sends, with source "inline:". */
export const DATA_INPUT = Object.freeze({
    type: "object",
    required: ["columns", "rows", "rowCount"],
    additionalProperties: false,
    properties: {
        name: { type: "string", maxLength: 200, description: "What the data is, for the report's title." },
        columns: { type: "array", minItems: 1, maxItems: DATA_COLUMNS, items: { type: "string", minLength: 1, maxLength: 256 }, description: "The column names, each once." },
        rows: { type: "array", items: { type: "array", items: { type: ["string", "number", "boolean", "null"], maxLength: DATA_CELL_TEXT } }, description: "The rows, each a list of one value per column, in the columns' order." },
        rowCount: { type: "integer", minimum: 0, description: "How many rows the whole table has: a table that arrives cut short is refused." },
        asOf: { type: "string", maxLength: 40, description: "When the data is from, as you state it (ISO 8601)." }
    },
    description: `Your own rows, with source "${INLINE_ID}". They are not the operator's data and the operator's exposure policy does not apply to them. list_sources says how much may be sent.`
});

/** The extra inputs by name. */
const EXTRAS = Object.freeze({ params: PARAMS_INPUT, data: DATA_INPUT });

/**
 * @typedef {{ params?: boolean, data?: boolean }} SurfaceOffers  the extra inputs a surface offers
 * @typedef {{ mcp: SurfaceOffers, rest: SurfaceOffers }} Offers
 */

/**
 * What the server offers on each surface, from its options: params when a configured source
 * declares parameters; data on MCP unless mcp.data is false, on REST when a policy or a profile has
 * `data: true`.
 * @param {import("../config.js").ServerOptions} options
 * @returns {Offers}
 */
export function offersOf(options) {
    const params = Object.values(options.sources ?? {}).some((s) => s && s.params && Object.keys(s.params).length > 0);
    return Object.freeze({ mcp: Object.freeze({ params, data: mcpCapOf(options) !== false }), rest: Object.freeze({ params, data: restDataOffered(options) }) });
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
 * What list_sources adds for a caller on a surface, besides the sources: `data`, how much it may send
 * (sources/inline.js), when it may send data.
 * @param {any} context
 * @param {import("../registry.js").Caller} caller
 * @param {{ surface?: "mcp" | "rest" }} how
 * @returns {Record<string, unknown>}
 */
export function listExtras(context, caller, how) {
    return dataListEntry(context.options, caller, how.surface ?? "mcp");
}
