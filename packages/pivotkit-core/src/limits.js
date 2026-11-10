/*
 * Limits against hostile or accidental huge input. The view limits cap what normalize() accepts from a
 * view; the resource limits cap memory and time: `rows` in encode(); `groups` and `pivotCells` in
 * computePivot(), counted while the key trees and the cell index grow, and `work`, its cell updates,
 * computed exactly before the aggregation starts; `cells` in toGrid() and
 * toSeries(), which are dense (rows x columns) and would otherwise allocate gigabytes for two
 * high-cardinality fields; `cacheEntries` per encoded data set. The defaults are sized for a browser
 * tab and the about 100,000 rows the engine is designed for (docs/concepts/limits.md, "Why the
 * defaults are what they are", has the numbers behind them). Every function that takes `options.limits` merges it over these defaults.
 */

import { PivotkitError } from "./errors.js";

export const LIMITS = Object.freeze({
    // view
    json: 5_000_000, // characters of the serialized view
    name: 256,
    axisFields: 8, // fields per axis: each level adds subtotals to every row's work (see pivotCells)
    values: 16, // value fields: each is a column per column item; the work limit bounds what they cost
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
    work: 100_000_000, // cell updates of computePivot(): filtered rows x (row depth + 1) x (column depth + 1) x measures, KEEPS_VALUES_WEIGHT each for median, countUnique, listUnique
    cells: 2_000_000, // cells of a grid (toGrid) or data points of a chart (toSeries)
    cacheEntries: 16, // derived columns and sort orders kept per encoded data set (least recently used go)
    // loading a file (pivotkit-core/import and reader plugins), each checked before the step it guards
    fileBytes: 104_857_600, // bytes of a file, before it is read (100 MiB)
    columns: 1_000, // columns of a loaded table
    importCells: 10_000_000, // rows x columns of a loaded table, counted while its rows are read
    textLength: 32_767, // characters of one value of a loaded table (Excel's cell limit); longer text is cut
    archiveEntries: 10_000, // parts of an archive format (an .xlsx is a ZIP), from its directory, before any is unpacked
    unpackedBytes: 524_288_000 // bytes all parts of an archive unpack to, from its directory, before any is unpacked (500 MiB)
});

/**
 * Highest value a host may set, where a larger one would break the engine rather than only cost
 * memory: cell keys are row node id x column count + column node id, exact in a double only while
 * (groups / 2)^2 stays below 2^53.
 */
const CEILINGS = Object.freeze({ groups: 2 ** 27 });

/**
 * How much heavier a cell update of an aggregator that keeps a value per row (median, countUnique,
 * listUnique: `keepsValues` in AGGREGATORS) counts against `work`: it stores an entry (a number in a
 * list, a code in a set) where the others add to a number. Measured per update (Node 26, arm64):
 * sum 2.5 ns and no memory beyond its cells; median 9 to 11 ns and 10 to 18 bytes; countUnique of
 * distinct values 65 to 80 ns and 28 to 42 bytes.
 */
export const KEEPS_VALUES_WEIGHT = 10;

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
