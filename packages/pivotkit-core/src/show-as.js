/*
 * "Show values as", one table entry per calculation: Excel's names, the default format of its result
 * and how it is computed from the raw aggregates. A new calculation is one entry here.
 *
 * Calculations along an axis (Excel's "base field") walk the siblings of the cell's node on that axis,
 * within its parent group. Running totals need an aggregator whose values add up (sum, count):
 * normalize() refuses them on average, median and the like, where a running "total" means nothing.
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

function runningTotal(percent) {
    return (x, c) => {
        const { node, at, siblings } = along(c);
        if (!node.parent) {
            // the grand total has no siblings: a running total there is the whole
            return percent ? (x === null ? null : 1) : x;
        }
        let sum = 0;
        for (let i = 0; i <= node.index; i++) {
            sum += at(siblings[i]) ?? 0;
        }
        return percent ? ratio(sum, at(node.parent)) : sum;
    };
}

function rank(descending) {
    return (x, c) => {
        const { node, at, siblings } = along(c);
        if (!node.parent || x === null) {
            return null;
        }
        let r = 1;
        for (const s of siblings) {
            const y = at(s);
            if (y !== null && (descending ? y > x : y < x)) {
                r++;
            }
        }
        return r;
    };
}

/**
 * @typedef {object} ShowAsDef
 * @property {string} format     default format of the result
 * @property {boolean} [alongAxis] walks the siblings on `axis`
 * @property {boolean} [additive]  needs an additive aggregator (sum, count)
 * @property {(x: number | null, c: ShowAsContext) => number | null} compute
 */

/** @type {Readonly<Record<string, ShowAsDef>>} */
export const SHOW_AS = Object.freeze({
    percentOfGrandTotal: { format: "percent", compute: (x, c) => ratio(x, c.raw(c.rowRoot, c.colRoot)) },
    percentOfRowTotal: { format: "percent", compute: (x, c) => ratio(x, c.raw(c.rowNode, c.colRoot)) },
    percentOfColumnTotal: { format: "percent", compute: (x, c) => ratio(x, c.raw(c.rowRoot, c.colNode)) },
    percentOfParentRow: { format: "percent", compute: (x, c) => ratio(x, c.raw(c.rowNode.parent ?? c.rowNode, c.colNode)) },
    percentOfParentColumn: { format: "percent", compute: (x, c) => ratio(x, c.raw(c.rowNode, c.colNode.parent ?? c.colNode)) },
    differenceFromPrevious: { format: "number", alongAxis: true, compute: difference(false) },
    percentDifferenceFromPrevious: { format: "percent", alongAxis: true, compute: difference(true) },
    runningTotal: { format: "number", alongAxis: true, additive: true, compute: runningTotal(false) },
    percentRunningTotal: { format: "percent", alongAxis: true, additive: true, compute: runningTotal(true) },
    rankAscending: { format: "integer", alongAxis: true, compute: rank(false) },
    rankDescending: { format: "integer", alongAxis: true, compute: rank(true) }
});

export const SHOW_AS_NAMES = Object.freeze(Object.keys(SHOW_AS));
