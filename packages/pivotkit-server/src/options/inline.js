/*
 * The options of data sent in a request (sources/inline.js).
 *
 * - `policy.data`, `policy.profiles.<p>.data`: whether a caller may send its own data. REST: only with
 *   true. MCP: unless false. A source's policy and files.policy do not take it (it is about the caller).
 * - `mcp.data`: false switches MCP inline data off; an object lowers the built-in cap
 *   (MCP_DATA_CAP), each of rows, cells and bytes at most the built-in value.
 * - `rest.data.maxBytes`: the largest body of a REST caller that may send data, from BODY_BYTES (what
 *   every caller may send) to MAX_BODY_BYTES (listen.js).
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses a
 * second declaration).
 */

import { BODY_BYTES, MAX_BODY_BYTES } from "../listen.js";
import { MCP_DATA_CAP, bytesText } from "../sources/inline.js";
import { ConfigError } from "./shared.js";

export const NAME = "inline";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    policy: { data: "boolean" },
    mcp: { data: { or: [{ const: false }, { object: { rows: "integer", cells: "integer", bytes: "integer" } }] } },
    rest: { data: { object: { maxBytes: "integer" } } }
});

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    for (const [path, policy] of /** @type {Array<[string, any]>} */ ([["files.policy", options.files?.policy], ...Object.entries(options.sources ?? {}).map(([id, source]) => [`sources.${id}.policy`, source.policy])])) {
        if (policy?.data !== undefined) {
            throw new ConfigError(`${path}.data: whether a caller may send data is set in policy.data or a profile (policy.profiles.<name>.data), not per source`);
        }
    }
    const cap = options.mcp?.data;
    if (cap && typeof cap === "object") {
        for (const key of /** @type {Array<keyof typeof MCP_DATA_CAP>} */ (["rows", "cells", "bytes"])) {
            const value = cap[key];
            if (value === undefined) {
                continue;
            }
            if (value < 1) {
                throw new ConfigError(`mcp.data.${key}: must be 1 or more (mcp.data: false switches inline data off)`);
            }
            if (value > MCP_DATA_CAP[key]) {
                throw new ConfigError(`mcp.data.${key}: the built-in cap can only be lowered, to at most ${MCP_DATA_CAP[key]}${key === "bytes" ? ` (${bytesText(MCP_DATA_CAP.bytes)})` : ""}; for more data, configure a source`);
            }
        }
    }
    const maxBytes = options.rest?.data?.maxBytes;
    if (maxBytes !== undefined && (maxBytes < BODY_BYTES || maxBytes > MAX_BODY_BYTES)) {
        throw new ConfigError(`rest.data.maxBytes: ${BODY_BYTES} (${bytesText(BODY_BYTES)}, what every caller may send) to ${MAX_BODY_BYTES} (${bytesText(MAX_BODY_BYTES)})`);
    }
}
