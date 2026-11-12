/*
 * The pivot: filters, row and column key trees with subtotals and totals, aggregated cells and
 * "show values as". The steps live in their own modules (filters.js, tree.js, show-as.js); this one
 * wires them together and aggregates the cells.
 *
 * A cell is a (row node, column node) pair, so subtotals and totals are cells like any other and are
 * aggregated from the source rows (a median of a subtotal is the median of its rows, not of the
 * medians below it). Each source row contributes to the cells of all its ancestors, which is
 * (row depth + 1) x (column depth + 1) updates per row and value. Cells exist only where rows are, so
 * a pivot of two high-cardinality fields stays small here; the dense grid is limited in toGrid().
 * Many high-cardinality fields on both axes still make many nodes and cells: the trees count their
 * nodes against `limits.groups` and the cell index its cells against `limits.pivotCells` while they
 * grow, so such a view throws LIMIT_EXCEEDED before it fills the memory.
 */

import { aggregatorOf } from "./aggregators.js";
import { derivedColumn } from "./derive.js";
import { checkLimit, expect } from "./errors.js";
import { isEncoded } from "./encode.js";
import { applyFilters, todayOf } from "./filters.js";
import { DEFAULT_LABELS, labelOf, ranksOf } from "./labels.js";
import { KEEPS_VALUES_WEIGHT, resolveLimits } from "./limits.js";
import { SHOW_AS } from "./show-as.js";
import { buildTree, groupBy } from "./tree.js";
import { resolveLocale, optionsOf } from "./util.js";
import { issueOf, normalize } from "./view.js";

/** @typedef {import("./tree.js").PivotNode} PivotNode */

/**
 * @typedef {object} PivotContext  what the steps of one computePivot() call share
 * @property {import("./view.js").View} view
 * @property {string} locale
 * @property {number} today  wall-clock ms of `options.now` in the data's time zone (relative date ranges)
 * @property {(name: string | null) => import("./encode.js").Column | null} columnOf
 * @property {typeof groupBy} groupBy
 * @property {(ref: import("./view.js").ValueRef, rows: Int32Array, groupOf: Int32Array, groupCount: number) => any[]} aggregateGroups
 */

/**
 * @typedef {object} PivotResult
 * @property {import("./view.js").View} view       the normalized view
 * @property {import("./view.js").Issue[]} issues  what normalize() dropped, and a time zone mismatch
 * @property {string} locale                        resolved: view, then options, then "en-US"
 * @property {string} timeZone                      the data's time zone
 * @property {import("./encode.js").Encoded} encoded
 * @property {Int32Array} rows                      source row indices left after all filters
 * @property {string[]} rowFields
 * @property {string[]} colFields
 * @property {import("./encode.js").Column[]} rowColumns
 * @property {import("./encode.js").Column[]} colColumns
 * @property {import("./view.js").ValueSpec[]} values
 * @property {Array<"number" | "text" | "date">} valueTypes  result type per value, after show-as
 * @property {PivotNode} rowRoot
 * @property {PivotNode} colRoot
 * @property {PivotNode[]} rowNodes
 * @property {PivotNode[]} colNodes
 * @property {Int32Array} rowLeafOf
 * @property {Int32Array} colLeafOf
 * @property {(row: PivotNode, col: PivotNode, valueIndex: number) => number | string | null} value  raw aggregate
 * @property {(row: PivotNode, col: PivotNode, valueIndex: number) => number | string | null} display  after show-as
 * @property {(row: PivotNode, col: PivotNode) => boolean} hasRows  whether any source row is behind a cell
 * @property {(axis: "rows" | "cols", node: PivotNode, labels?: Partial<import("./labels.js").Labels>) => string} label
 */

const refKey = (ref) => `${ref.agg}\u0000${ref.field ?? ""}`;

/** Column lookup for one pivot: data columns and derived fields, each resolved once. */
function columnResolver(encoded, view) {
    const derived = new Map(view.derived.map((d) => [d.name.toLowerCase(), d]));
    const resolved = new Map();
    return (name) => {
        if (name === null || name === undefined) {
            return null;
        }
        const key = name.toLowerCase();
        if (!resolved.has(key)) {
            const spec = derived.get(key);
            resolved.set(key, spec ? derivedColumn(encoded, spec) : encoded.column(name) ?? null);
        }
        return resolved.get(key);
    };
}

/** A kernel of an aggregator over a column for `cells` cells. */
function kernelFor(encoded, ref, column, cells, locale) {
    const ranks = column ? ranksOf(column, locale, encoded.cache) : null;
    return aggregatorOf(ref.agg).create(column, cells, ranks, (code) => labelOf(column, column.dict[code], locale));
}

/**
 * Cells: every (row ancestor, column ancestor) pair of every (row leaf, column leaf) pair present.
 * Every leaf of an axis is at the same depth, so each pair has `perPair` = (row depth + 1) x
 * (column depth + 1) cell references, stored flat (pair p at p x perPair). They count against
 * `maxCells` before they are stored; the distinct cells are at most as many. Keys are
 * row node id x column count + column node id, exact while `limits.groups` keeps below its ceiling.
 * @returns {{ cellIndex: Map<number, number>, pairOf: Int32Array, cells: number[], perPair: number }}
 */
function indexCells(rows, rowTree, colTree, maxCells) {
    const nCol = colTree.nodes.length;
    const perPair = (rowTree.depth + 1) * (colTree.depth + 1);
    // every leaf is in at least one pair: a lower bound before anything is stored
    checkLimit("pivotCells", Math.max(rowTree.leafCount, colTree.leafCount) * perPair, maxCells, "pivot cells");
    const ancestors = (node) => {
        const list = [];
        for (let n = node; n; n = n.parent) {
            list.push(n.id);
        }
        return list;
    };
    const rowAnc = new Map();
    const colAnc = new Map();
    const pairOf = new Int32Array(rows.length);
    const pairIndex = new Map();
    /** @type {number[]} */
    const cells = [];
    const cellIndex = new Map();
    for (let i = 0; i < rows.length; i++) {
        const rl = rowTree.leafOf[i];
        const cl = colTree.leafOf[i];
        const pk = rl * nCol + cl;
        let p = pairIndex.get(pk);
        if (p === undefined) {
            p = pairIndex.size;
            pairIndex.set(pk, p);
            checkLimit("pivotCells", cells.length + perPair, maxCells, "pivot cells");
            if (!rowAnc.has(rl)) {
                rowAnc.set(rl, ancestors(rowTree.nodes[rl]));
            }
            if (!colAnc.has(cl)) {
                colAnc.set(cl, ancestors(colTree.nodes[cl]));
            }
            for (const r of rowAnc.get(rl)) {
                for (const c of colAnc.get(cl)) {
                    const ck = r * nCol + c;
                    let cell = cellIndex.get(ck);
                    if (cell === undefined) {
                        cell = cellIndex.size;
                        cellIndex.set(ck, cell);
                    }
                    cells.push(cell);
                }
            }
        }
        pairOf[i] = p;
    }
    if (rows.length === 0) {
        // an empty grand total cell still exists, so totals show 0 counts instead of nothing
        cellIndex.set(0, 0);
    }
    return { cellIndex, pairOf, cells, perPair };
}

/**
 * Aggregates every measure over the cells; the value of a cell is read once, on demand. `has` tells
 * whether any row is behind a cell.
 * @returns {{ value: (rowNode: PivotNode, colNode: PivotNode, measure: number) => number | string | null, has: (rowNode: PivotNode, colNode: PivotNode) => boolean }}
 */
function aggregateCells(data, measures, columnOf, locale, rows, rowTree, colTree, maxCells) {
    const nCol = colTree.nodes.length;
    const { cellIndex, pairOf, cells, perPair } = indexCells(rows, rowTree, colTree, maxCells);
    const nCells = cellIndex.size;
    const kernels = measures.map((m) => kernelFor(data, m, m.field ? columnOf(m.field) : null, nCells, locale));
    for (const kernel of kernels) {
        for (let i = 0; i < rows.length; i++) {
            const start = pairOf[i] * perPair;
            const r = rows[i];
            for (let k = start; k < start + perPair; k++) {
                kernel.add(cells[k], r);
            }
        }
    }
    const UNSET = Symbol("unset");
    const memo = measures.map(() => new Array(nCells).fill(UNSET));
    // without rows the grand total cell exists anyway (indexCells), but nothing is behind it
    const has = (rowNode, colNode) => rows.length > 0 && cellIndex.has(rowNode.id * nCol + colNode.id);
    const value = (rowNode, colNode, m) => {
        const cell = cellIndex.get(rowNode.id * nCol + colNode.id);
        if (cell === undefined) {
            return null;
        }
        let v = memo[m][cell];
        if (v === UNSET) {
            v = memo[m][cell] = kernels[m].get(cell);
        }
        return v;
    };
    return { value, has };
}

/** Sorts the children of every node: by label (natural order, blank last), by a value or in a custom order, per field. */
function sortAxis(tree, fields, columns, sortOf, valueOfNode, ranks) {
    const walk = (node) => {
        if (node.children.length === 0) {
            return;
        }
        const spec = sortOf.get(fields[node.depth]) ?? { by: "label", order: "asc" };
        const dir = spec.order === "desc" ? -1 : 1;
        const r = ranks(columns[node.depth]);
        const rank = (n) => (n.code < 0 ? Infinity : r[n.code]);
        const byLabel = (a, b) => {
            const ra = rank(a);
            const rb = rank(b);
            if (ra === rb) {
                return 0;
            }
            if (ra === Infinity || rb === Infinity) {
                return ra === Infinity ? 1 : -1;
            }
            return (ra - rb) * dir;
        };
        if (spec.by === "custom") {
            // listed items first in the list's order, the rest after them by label; blank last
            const place = new Map(spec.items.map((item, i) => [item, i]));
            const listed = (n) => (place.has(n.key) ? place.get(n.key) : Infinity);
            node.children.sort((a, b) => {
                const pa = listed(a);
                const pb = listed(b);
                if (pa === Infinity && pb === Infinity) {
                    return byLabel(a, b);
                }
                return pa === pb ? 0 : pa === Infinity ? 1 : pb === Infinity ? -1 : (pa - pb) * dir;
            });
        } else if (spec.by === "value") {
            const vals = new Map(node.children.map((c) => [c, valueOfNode(c, spec.value)]));
            node.children.sort((a, b) => {
                const va = vals.get(a);
                const vb = vals.get(b);
                if (va === null || vb === null) {
                    return va === vb ? byLabel(a, b) : va === null ? 1 : -1;
                }
                return (va - vb) * dir || byLabel(a, b);
            });
        } else {
            node.children.sort(byLabel);
        }
        node.children.forEach((c, i) => {
            c.index = i;
            walk(c);
        });
    };
    walk(tree.root);
}

/**
 * Pivots encoded data with a view.
 *
 * @param {import("./encode.js").Encoded} data  from encode()
 * @param {unknown} viewInput  a view; normalized here, so it may come straight from a user
 * @param {{ locale?: string, now?: Date | number | string, limits?: Partial<import("./limits.js").Limits> }} [options]  locale: used
 *   when the view names none (natural sort, label filters, labels); default "en-US". now: today for
 *   relative date ranges ("the last 5 years"), a Date, epoch ms or an ISO string read in the data's
 *   time zone; default the current time (an invalid one throws INVALID_OPTION). limits: the view
 *   limits for normalize(), `work` for the cell updates (computed before the trees are built),
 *   `groups` for the nodes of both key trees and `pivotCells` for the cells (each counted while it
 *   grows); more throws a PivotkitError (LIMIT_EXCEEDED)
 * @returns {PivotResult}
 */
export function computePivot(data, viewInput, options) {
    options = optionsOf(options, "computePivot");
    expect(isEncoded(data), "computePivot(data, view): data must come from encode()");
    const limits = resolveLimits(options);
    const { view, issues } = normalize(viewInput, data, options);
    const locale = resolveLocale(view.formatting.locale, options.locale);
    if (view.formatting.timeZone && view.formatting.timeZone !== data.timeZone) {
        issues.push(issueOf("formatting.timeZone", `the view was made for ${view.formatting.timeZone}, the data is encoded in ${data.timeZone}; pass timeZone to encode()`, "timeZoneMismatch", { value: view.formatting.timeZone, zone: data.timeZone }));
    }
    const columnOf = columnResolver(data, view);
    const ranks = (column) => ranksOf(column, locale, data.cache);

    /** @type {PivotContext} */
    const ctx = {
        view,
        locale,
        today: todayOf(options.now, data.timeZone),
        columnOf,
        groupBy,
        aggregateGroups: (ref, rows, groupOf, groupCount) => {
            const kernel = kernelFor(data, ref, ref.field ? columnOf(ref.field) : null, groupCount, locale);
            for (let i = 0; i < rows.length; i++) {
                kernel.add(groupOf[i], rows[i]);
            }
            return Array.from({ length: groupCount }, (_, g) => kernel.get(g));
        }
    };

    /** @type {Int32Array} */
    let rows = new Int32Array(data.length);
    for (let i = 0; i < rows.length; i++) {
        rows[i] = i;
    }
    rows = applyFilters(ctx, rows);

    // Measures: the visible values plus references used only for sorting, each computed once.
    const measureIndex = new Map();
    const measures = [];
    const addMeasure = (ref) => {
        const key = refKey(ref);
        if (!measureIndex.has(key)) {
            measureIndex.set(key, measures.length);
            measures.push({ field: ref.field, agg: ref.agg });
        }
        return measureIndex.get(key);
    };
    const valueMeasure = view.values.map(addMeasure);
    for (const s of view.sort) {
        if (s.by === "value") {
            addMeasure(s.value);
        }
    }

    // Every row updates (row depth + 1) x (column depth + 1) cells per measure, known exactly before
    // the trees are built or anything is aggregated.
    const weight = measures.reduce((w, m) => w + (aggregatorOf(m.agg).keepsValues ? KEEPS_VALUES_WEIGHT : 1), 0);
    checkLimit("work", rows.length * (view.rows.length + 1) * (view.cols.length + 1) * weight, limits.work, "cell updates");

    const rowColumns = view.rows.map(columnOf);
    const colColumns = view.cols.map(columnOf);
    const rowTree = { ...buildTree(rowColumns, rows, { max: limits.groups, used: 0 }), depth: rowColumns.length };
    const colTree = { ...buildTree(colColumns, rows, { max: limits.groups, used: rowTree.nodes.length }), depth: colColumns.length };

    const { value: measureValue, has: hasRows } = aggregateCells(data, measures, columnOf, locale, rows, rowTree, colTree, limits.pivotCells);
    const num = (v) => (typeof v === "number" ? v : null);

    const sortOf = new Map(view.sort.map((s) => [s.field, s]));
    sortAxis(rowTree, view.rows, rowColumns, sortOf, (n, ref) => num(measureValue(n, colTree.root, measureIndex.get(refKey(ref)))), ranks);
    sortAxis(colTree, view.cols, colColumns, sortOf, (n, ref) => num(measureValue(rowTree.root, n, measureIndex.get(refKey(ref)))), ranks);

    const valueTypes = view.values.map((v) => {
        if (v.showAs) {
            return "number";
        }
        const column = v.field ? columnOf(v.field) : null;
        return aggregatorOf(v.agg).resultType(column ? column.type : "number");
    });

    /** Raw aggregate of value vi in a cell; null when the cell has no rows. */
    const value = (rowNode, colNode, vi) => measureValue(rowNode, colNode, valueMeasure[vi]);

    /** The value as shown: after "show values as". */
    const display = (rowNode, colNode, vi) => {
        const spec = view.values[vi];
        const v = value(rowNode, colNode, vi);
        if (!spec.showAs) {
            return v;
        }
        return SHOW_AS[spec.showAs.type].compute(num(v), {
            rowNode,
            colNode,
            rowRoot: rowTree.root,
            colRoot: colTree.root,
            raw: (r, c) => num(value(r, c, vi)),
            axis: spec.showAs.axis
        });
    };

    return {
        view,
        issues,
        locale,
        timeZone: data.timeZone,
        encoded: data,
        rows,
        rowFields: view.rows,
        colFields: view.cols,
        rowColumns,
        colColumns,
        values: view.values,
        valueTypes,
        rowRoot: rowTree.root,
        colRoot: colTree.root,
        rowNodes: rowTree.nodes,
        colNodes: colTree.nodes,
        rowLeafOf: rowTree.leafOf,
        colLeafOf: colTree.leafOf,
        value,
        display,
        hasRows,
        label: (axis, node, labels = DEFAULT_LABELS) => {
            if (!node.parent) {
                return labels.grandTotal ?? DEFAULT_LABELS.grandTotal;
            }
            const column = (axis === "cols" ? colColumns : rowColumns)[node.depth - 1];
            return labelOf(column, node.key, locale, labels);
        }
    };
}

/**
 * True for the output of computePivot().
 * @param {unknown} result
 * @returns {result is PivotResult}
 */
export function isPivotResult(result) {
    const r = /** @type {any} */ (result);
    return r !== null && typeof r === "object" && typeof r.display === "function" && r.rowRoot !== undefined;
}
