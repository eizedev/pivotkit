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
 */

import { aggregatorOf } from "./aggregators.js";
import { derivedColumn } from "./derive.js";
import { expect } from "./errors.js";
import { isEncoded } from "./encode.js";
import { applyFilters } from "./filters.js";
import { DEFAULT_LABELS, labelOf, ranksOf } from "./labels.js";
import { SHOW_AS } from "./show-as.js";
import { buildTree, groupBy } from "./tree.js";
import { resolveLocale } from "./util.js";
import { normalize } from "./view.js";

/** @typedef {import("./tree.js").PivotNode} PivotNode */

/**
 * @typedef {object} PivotContext  what the steps of one computePivot() call share
 * @property {import("./view.js").View} view
 * @property {string} locale
 * @property {(name: string | null) => import("./encode.js").Column | null} columnOf
 * @property {typeof groupBy} groupBy
 * @property {(ref: import("./view.js").ValueRef, rows: Int32Array, groupOf: Int32Array, groupCount: number) => any[]} aggregateGroups
 */

/**
 * @typedef {object} PivotResult
 * @property {import("./view.js").View} view       the normalized view
 * @property {Array<{ path: string, message: string }>} issues  what normalize() dropped, and a time zone mismatch
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
 * @returns {{ cellIndex: Map<number, number>, pairOf: Int32Array, pairCells: Int32Array[] }}
 */
function indexCells(rows, rowTree, colTree) {
    const nCol = colTree.nodes.length;
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
    const pairCells = [];
    const cellIndex = new Map();
    for (let i = 0; i < rows.length; i++) {
        const rl = rowTree.leafOf[i];
        const cl = colTree.leafOf[i];
        const pk = rl * nCol + cl;
        let p = pairIndex.get(pk);
        if (p === undefined) {
            p = pairCells.length;
            pairIndex.set(pk, p);
            if (!rowAnc.has(rl)) {
                rowAnc.set(rl, ancestors(rowTree.nodes[rl]));
            }
            if (!colAnc.has(cl)) {
                colAnc.set(cl, ancestors(colTree.nodes[cl]));
            }
            const ra = rowAnc.get(rl);
            const ca = colAnc.get(cl);
            const cells = new Int32Array(ra.length * ca.length);
            let k = 0;
            for (const r of ra) {
                for (const c of ca) {
                    const ck = r * nCol + c;
                    let cell = cellIndex.get(ck);
                    if (cell === undefined) {
                        cell = cellIndex.size;
                        cellIndex.set(ck, cell);
                    }
                    cells[k++] = cell;
                }
            }
            pairCells.push(cells);
        }
        pairOf[i] = p;
    }
    if (rows.length === 0) {
        // an empty grand total cell still exists, so totals show 0 counts instead of nothing
        cellIndex.set(0, 0);
    }
    return { cellIndex, pairOf, pairCells };
}

/** Sorts the children of every node: by label (natural order, blank last) or by a value, per field. */
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
        if (spec.by === "value") {
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
 * @param {{ locale?: string, limits?: Partial<import("./limits.js").Limits> }} [options]  locale: used
 *   when the view names none (natural sort, label filters, labels); default "en-US"
 * @returns {PivotResult}
 */
export function computePivot(data, viewInput, options = {}) {
    expect(isEncoded(data), "computePivot(data, view): data must come from encode()");
    const { view, issues } = normalize(viewInput, data, options);
    const locale = resolveLocale(view.formatting.locale, options.locale);
    if (view.formatting.timeZone && view.formatting.timeZone !== data.timeZone) {
        issues.push({
            path: "formatting.timeZone",
            message: `the view was made for ${view.formatting.timeZone}, the data is encoded in ${data.timeZone}; pass timeZone to encode()`
        });
    }
    const columnOf = columnResolver(data, view);
    const ranks = (column) => ranksOf(column, locale, data.cache);

    /** @type {PivotContext} */
    const ctx = {
        view,
        locale,
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

    const rowColumns = view.rows.map(columnOf);
    const colColumns = view.cols.map(columnOf);
    const rowTree = buildTree(rowColumns, rows);
    const colTree = buildTree(colColumns, rows);
    const nCol = colTree.nodes.length;

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

    const { cellIndex, pairOf, pairCells } = indexCells(rows, rowTree, colTree);
    const nCells = cellIndex.size;
    const kernels = measures.map((m) => kernelFor(data, m, m.field ? columnOf(m.field) : null, nCells, locale));
    for (const kernel of kernels) {
        for (let i = 0; i < rows.length; i++) {
            const cells = pairCells[pairOf[i]];
            const r = rows[i];
            for (let k = 0; k < cells.length; k++) {
                kernel.add(cells[k], r);
            }
        }
    }
    const UNSET = Symbol("unset");
    const memo = measures.map(() => new Array(nCells).fill(UNSET));
    const measureValue = (rowNode, colNode, m) => {
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
