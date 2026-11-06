/*
 * Aggregators with Excel PivotTable semantics (PivotTable.js for first and last). Each one is a kernel
 * over typed arrays: create(column, cellCount) returns { add(cell, row), get(cell) }, so a pivot of
 * 100,000 rows allocates arrays per cell, not objects per row.
 *
 * Blank values are skipped by every aggregator. A cell with rows but no numbers is 0 for sum and
 * null for average, median, min, max and the variances (Excel shows #DIV/0! or 0 there).
 */

/** @typedef {"number" | "text" | "date"} ResultType */

/**
 * @typedef {object} Kernel
 * @property {(cell: number, row: number) => void} add
 * @property {(cell: number) => number | string | null} get
 */

/**
 * @typedef {object} AggregatorDef
 * @property {boolean} numeric        needs a number, boolean or date column
 * @property {boolean} [dates]        a numeric aggregator that also makes sense on dates
 * @property {(columnType: string) => ResultType} resultType
 * @property {(column: import("./encode.js").Column | null, cells: number, ranks: Int32Array | null, labelOf: (code: number) => string) => Kernel} create
 */

const numberResult = () => "number";

function count(column, cells) {
    const n = new Float64Array(cells);
    if (!column) {
        return { add: (cell) => { n[cell]++; }, get: (cell) => n[cell] };
    }
    const codes = column.codes;
    return {
        add: (cell, row) => {
            if (codes[row] !== -1) {
                n[cell]++;
            }
        },
        get: (cell) => n[cell]
    };
}

function uniqueSets(column, cells) {
    const sets = new Array(cells);
    const codes = column.codes;
    return {
        sets,
        add: (cell, row) => {
            const code = codes[row];
            if (code === -1) {
                return;
            }
            let s = sets[cell];
            if (s === undefined) {
                s = sets[cell] = new Set();
            }
            s.add(code);
        }
    };
}

function sum(column, cells) {
    const s = new Float64Array(cells);
    const values = column.values;
    return {
        add: (cell, row) => {
            const v = values[row];
            if (v === v) {
                s[cell] += v;
            }
        },
        get: (cell) => s[cell]
    };
}

function average(column, cells) {
    const s = new Float64Array(cells);
    const n = new Float64Array(cells);
    const values = column.values;
    return {
        add: (cell, row) => {
            const v = values[row];
            if (v === v) {
                s[cell] += v;
                n[cell]++;
            }
        },
        get: (cell) => (n[cell] > 0 ? s[cell] / n[cell] : null)
    };
}

function extreme(sign) {
    return (column, cells) => {
        const m = new Float64Array(cells).fill(NaN);
        const values = column.values;
        return {
            add: (cell, row) => {
                const v = values[row];
                if (v === v && !(m[cell] * sign >= v * sign)) {
                    m[cell] = v;
                }
            },
            get: (cell) => (Number.isNaN(m[cell]) ? null : m[cell])
        };
    };
}

function median(column, cells) {
    const lists = new Array(cells);
    const values = column.values;
    return {
        add: (cell, row) => {
            const v = values[row];
            if (v === v) {
                (lists[cell] ??= []).push(v);
            }
        },
        get: (cell) => {
            const list = lists[cell];
            if (!list || list.length === 0) {
                return null;
            }
            const sorted = Float64Array.from(list).sort();
            const mid = sorted.length >> 1;
            return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        }
    };
}

// Welford's online algorithm: numerically stable in one pass
function variance(sample, root) {
    return (column, cells) => {
        const n = new Float64Array(cells);
        const mean = new Float64Array(cells);
        const m2 = new Float64Array(cells);
        const values = column.values;
        return {
            add: (cell, row) => {
                const v = values[row];
                if (v === v) {
                    const k = ++n[cell];
                    const delta = v - mean[cell];
                    mean[cell] += delta / k;
                    m2[cell] += delta * (v - mean[cell]);
                }
            },
            get: (cell) => {
                const k = n[cell];
                const divisor = sample ? k - 1 : k;
                if (divisor <= 0) {
                    return null;
                }
                const result = Math.max(0, m2[cell]) / divisor;
                return root ? Math.sqrt(result) : result;
            }
        };
    };
}

// PivotTable.js semantics: first and last in the natural sort order of the values
function firstLast(isLast) {
    return (column, cells, ranks) => {
        const best = new Int32Array(cells).fill(-1);
        const codes = column.codes;
        return {
            add: (cell, row) => {
                const code = codes[row];
                if (code === -1) {
                    return;
                }
                const current = best[cell];
                if (current === -1 || (isLast ? ranks[code] > ranks[current] : ranks[code] < ranks[current])) {
                    best[cell] = code;
                }
            },
            get: (cell) => {
                const code = best[cell];
                if (code === -1) {
                    return null;
                }
                const v = column.dict[code];
                return typeof v === "boolean" ? String(v) : v;
            }
        };
    };
}

const dateOrNumber = (t) => (t === "date" ? "date" : "number");
const sameAsColumn = (t) => (t === "date" ? "date" : t === "number" ? "number" : "text");

/** @type {Readonly<Record<string, AggregatorDef>>} */
export const AGGREGATORS = Object.freeze({
    count: { numeric: false, resultType: numberResult, create: count },
    countUnique: {
        numeric: false,
        resultType: numberResult,
        create: (column, cells) => {
            const u = uniqueSets(column, cells);
            return { add: u.add, get: (cell) => (u.sets[cell] ? u.sets[cell].size : 0) };
        }
    },
    listUnique: {
        numeric: false,
        resultType: () => "text",
        create: (column, cells, ranks, labelOf) => {
            const u = uniqueSets(column, cells);
            return {
                add: u.add,
                get: (cell) => {
                    const s = u.sets[cell];
                    if (!s) {
                        return null;
                    }
                    return [...s].sort((a, b) => ranks[a] - ranks[b]).map(labelOf).join(", ");
                }
            };
        }
    },
    sum: { numeric: true, resultType: numberResult, create: sum },
    average: { numeric: true, dates: true, resultType: dateOrNumber, create: average },
    median: { numeric: true, dates: true, resultType: dateOrNumber, create: median },
    min: { numeric: true, dates: true, resultType: dateOrNumber, create: extreme(-1) },
    max: { numeric: true, dates: true, resultType: dateOrNumber, create: extreme(1) },
    stdev: { numeric: true, resultType: numberResult, create: variance(true, true) },
    stdevp: { numeric: true, resultType: numberResult, create: variance(false, true) },
    var: { numeric: true, resultType: numberResult, create: variance(true, false) },
    varp: { numeric: true, resultType: numberResult, create: variance(false, false) },
    first: { numeric: false, resultType: sameAsColumn, create: firstLast(false) },
    last: { numeric: false, resultType: sameAsColumn, create: firstLast(true) }
});

export const AGGREGATOR_NAMES = Object.freeze(Object.keys(AGGREGATORS));

/** True when the aggregator can run on a column of this type. */
export function aggregatorFits(agg, columnType) {
    const def = Object.hasOwn(AGGREGATORS, agg) ? AGGREGATORS[agg] : null;
    if (!def) {
        return false;
    }
    if (!def.numeric) {
        return true;
    }
    // a sum of dates means nothing; their average, median, min and max are dates again
    return columnType === "number" || columnType === "boolean" || columnType === "null" || (columnType === "date" && def.dates === true);
}
