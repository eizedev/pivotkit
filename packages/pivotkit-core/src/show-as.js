/*
 * "Show values as", one table entry per calculation: Excel's names, the default format of its result
 * and how it is computed from the raw aggregates. A new calculation is one entry here.
 *
 * Calculations along an axis (Excel's "base field") look at the siblings of the cell's node on that
 * axis, within its parent group. A running total and a rank read the group's running sums and its
 * sorted values, made once per group and kept in the context's `memo`: a group of n siblings costs
 * n log n, not n x n (20,000 row items took 8 s with a walk per cell). Running totals need an
 * aggregator whose values add up (sum, count): normalize() refuses them on average, median and the
 * like, where a running "total" means nothing.
 */

const ratio = (a, b) => (a === null || b === null || b === 0 ? null : a / b);

/**
 * @typedef {object} ShowAsContext
 * @property {import("./pivot.js").PivotNode} rowNode
 * @property {import("./pivot.js").PivotNode} colNode
 * @property {import("./pivot.js").PivotNode} rowRoot
 * @property {import("./pivot.js").PivotNode} colRoot
 * @property {(row: import("./pivot.js").PivotNode, col: import("./pivot.js").PivotNode) => number | null} raw
 * @property {"rows" | "cols"} axis
 * @property {Map<unknown, WeakMap<object, Map<object, SiblingStats>>>} [memo]  kept per pivot result
 * @property {unknown} [key]  the value's key in `memo` (its index in the view's values)
 */

/**
 * @typedef {object} SiblingStats
 * @property {number[]} sums    running sums along the siblings, nulls counted as 0
 * @property {number[]} sorted  the siblings' values that are not null, ascending
 */

/** The node along the axis, its siblings and the raw value of a sibling. */
function along(c) {
    const onRows = c.axis !== "cols";
    const node = onRows ? c.rowNode : c.colNode;
    const at = (n) => (onRows ? c.raw(n, c.colNode) : c.raw(c.rowNode, n));
    return { node, at, siblings: node.parent ? node.parent.children : [node] };
}

function difference(percent) {
    return (x, c) => {
        const { node, at, siblings } = along(c);
        if (!node.parent || node.index === 0 || x === null) {
            return null;
        }
        const prev = at(siblings[node.index - 1]) ?? 0;
        return percent ? ratio(x - prev, prev) : x - prev;
    };
}

/**
 * The running sums and the sorted values of the cell's sibling group, made once per group (memo).
 * @param {ShowAsContext} c
 * @returns {SiblingStats}
 */
function siblingStats(c) {
    const { node, at, siblings } = along(c);
    const other = c.axis !== "cols" ? c.colNode : c.rowNode;
    const make = () => {
        const sums = [];
        const sorted = [];
        let sum = 0;
        for (const s of siblings) {
            const y = at(s);
            sum += y ?? 0;
            sums.push(sum);
            if (y !== null) sorted.push(y);
        }
        sorted.sort((a, b) => a - b);
        return { sums, sorted };
    };
    if (!c.memo) return make();
    let byParent = c.memo.get(c.key);
    if (!byParent) c.memo.set(c.key, (byParent = new WeakMap()));
    const parent = /** @type {object} */ (node.parent);
    let byOther = byParent.get(parent);
    if (!byOther) byParent.set(parent, (byOther = new Map()));
    let stats = byOther.get(other);
    if (!stats) byOther.set(other, (stats = make()));
    return stats;
}

/** The number of values in `sorted` below `x`, or at most `x` with `orEqual`. */
function countBelow(sorted, x, orEqual) {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sorted[mid] < x || (orEqual && sorted[mid] === x)) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function runningTotal(percent) {
    return (x, c) => {
        const { node, at } = along(c);
        if (!node.parent) {
            // the grand total has no siblings: a running total there is the whole
            return percent ? (x === null ? null : 1) : x;
        }
        const sum = siblingStats(c).sums[node.index];
        return percent ? ratio(sum, at(node.parent)) : sum;
    };
}

function rank(descending) {
    return (x, c) => {
        const { node } = along(c);
        if (!node.parent || x === null) {
            return null;
        }
        const { sorted } = siblingStats(c);
        // 1 + the siblings above x (descending) or below it (ascending): equal values share a rank
        return 1 + (descending ? sorted.length - countBelow(sorted, x, true) : countBelow(sorted, x, false));
    };
}

/**
 * @typedef {object} ShowAsDef
 * @property {string} format     default format of the result
 * @property {boolean} [alongAxis] walks the siblings on `axis`
 * @property {boolean} [additive]  needs an additive aggregator (sum, count)
 * @property {boolean} [addsUp]    of an additive aggregator, the results of a category's series still
 *   add up to something (a stacked chart's total): a share of the grand or the row total, a difference
 *   or a running total along the rows. Not a rank, a percent difference or a share of another base
 * @property {(x: number | null, c: ShowAsContext) => number | null} compute
 */

/** @type {Readonly<Record<string, ShowAsDef>>} */
export const SHOW_AS = Object.freeze({
    percentOfGrandTotal: { format: "percent", addsUp: true, compute: (x, c) => ratio(x, c.raw(c.rowRoot, c.colRoot)) },
    percentOfRowTotal: { format: "percent", addsUp: true, compute: (x, c) => ratio(x, c.raw(c.rowNode, c.colRoot)) },
    percentOfColumnTotal: { format: "percent", compute: (x, c) => ratio(x, c.raw(c.rowRoot, c.colNode)) },
    percentOfParentRow: { format: "percent", compute: (x, c) => ratio(x, c.raw(c.rowNode.parent ?? c.rowNode, c.colNode)) },
    percentOfParentColumn: { format: "percent", compute: (x, c) => ratio(x, c.raw(c.rowNode, c.colNode.parent ?? c.colNode)) },
    differenceFromPrevious: { format: "number", alongAxis: true, addsUp: true, compute: difference(false) },
    percentDifferenceFromPrevious: { format: "percent", alongAxis: true, compute: difference(true) },
    runningTotal: { format: "number", alongAxis: true, additive: true, addsUp: true, compute: runningTotal(false) },
    percentRunningTotal: { format: "percent", alongAxis: true, additive: true, compute: runningTotal(true) },
    rankAscending: { format: "integer", alongAxis: true, compute: rank(false) },
    rankDescending: { format: "integer", alongAxis: true, compute: rank(true) }
});

export const SHOW_AS_NAMES = Object.freeze(Object.keys(SHOW_AS));
