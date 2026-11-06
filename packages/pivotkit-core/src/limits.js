/*
 * Limits against hostile or accidental huge input. The view limits cap what normalize() accepts from a
 * view; the resource limits cap memory: `rows` in encode(), `cells` in toGrid() and toSeries(), which
 * are dense (rows x columns) and would otherwise allocate gigabytes for two high-cardinality fields.
 * Every function that takes `options.limits` merges it over these defaults.
 */

import { PivotkitError } from "./errors.js";

export const LIMITS = Object.freeze({
    // view
    json: 5_000_000, // characters of the serialized view
    name: 256,
    axisFields: 32,
    values: 64,
    filters: 128,
    items: 100_000,
    derived: 64,
    sort: 64,
    collapsed: 10_000,
    topCount: 1_000_000,
    // resources
    rows: 10_000_000, // source rows encode() accepts
    cells: 2_000_000, // cells of a grid (toGrid) or data points of a chart (toSeries)
    cacheEntries: 64 // derived columns and sort orders kept per encoded data set (least recently used go)
});

/** @typedef {{ [K in keyof typeof LIMITS]: number }} Limits */

/**
 * The limits with `options.limits` merged over the defaults.
 * @param {{ limits?: Partial<Limits> }} [options]
 * @returns {Limits}
 */
export function resolveLimits(options) {
    const custom = options && options.limits;
    if (custom === undefined || custom === null) {
        return LIMITS;
    }
    if (typeof custom !== "object") {
        throw new PivotkitError("INVALID_OPTION", "options.limits must be an object");
    }
    /** @type {Limits} */
    const out = { ...LIMITS };
    for (const key of Object.keys(custom)) {
        const value = custom[key];
        if (!Object.hasOwn(LIMITS, key)) {
            throw new PivotkitError("INVALID_OPTION", `unknown limit "${key}"`);
        }
        if (!Number.isInteger(value) || value < 1) {
            throw new PivotkitError("INVALID_OPTION", `limits.${key} must be a whole number of 1 or more`);
        }
        out[key] = value;
    }
    return Object.freeze(out);
}
