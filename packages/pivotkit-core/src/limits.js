/*
 * Limits against hostile or accidental huge input. The view limits cap what normalize() accepts from a
 * view; the resource limits cap memory: `rows` in encode(); `groups` and `pivotCells` in
 * computePivot(), counted while the key trees and the cell index grow; `cells` in toGrid() and
 * toSeries(), which are dense (rows x columns) and would otherwise allocate gigabytes for two
 * high-cardinality fields; `cacheEntries` per encoded data set. The defaults are sized for a browser
 * tab and the about 100,000 rows the engine is designed for (the core README, "Limits", has the
 * numbers behind them). Every function that takes `options.limits` merges it over these defaults.
 */

import { PivotkitError } from "./errors.js";

export const LIMITS = Object.freeze({
    // view
    json: 5_000_000, // characters of the serialized view
    name: 256,
    axisFields: 8, // fields per axis: each level adds subtotals to every row's work (see pivotCells)
    values: 64,
    filters: 128,
    items: 100_000,
    derived: 64,
    sort: 64,
    collapsed: 10_000,
    topCount: 1_000_000,
    // resources
    rows: 1_000_000, // source rows encode() accepts
    groups: 500_000, // nodes of the row and column key trees together (leaves, subtotals, grand totals)
    pivotCells: 2_000_000, // aggregated cells of computePivot(): per distinct (row leaf, column leaf) pair, (row depth + 1) x (column depth + 1)
    cells: 2_000_000, // cells of a grid (toGrid) or data points of a chart (toSeries)
    cacheEntries: 16 // derived columns and sort orders kept per encoded data set (least recently used go)
});

/**
 * Highest value a host may set, where a larger one would break the engine rather than only cost
 * memory: cell keys are row node id x column count + column node id, exact in a double only while
 * (groups / 2)^2 stays below 2^53.
 */
const CEILINGS = Object.freeze({ groups: 2 ** 27 });

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
        if (Object.hasOwn(CEILINGS, key) && value > CEILINGS[key]) {
            throw new PivotkitError("INVALID_OPTION", `limits.${key} must be at most ${CEILINGS[key]}`);
        }
        out[key] = value;
    }
    return Object.freeze(out);
}
