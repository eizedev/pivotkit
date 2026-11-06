/*
 * The pivot: filters, row and column key trees with subtotals and totals, aggregated cells and
 * "show values as".
 *
 * Every tree node is a group: the root is the grand total, inner nodes are subtotals, leaves the
 * deepest keys. A cell is a (row node, column node) pair, so subtotals and totals are cells like any
 * other and are aggregated from the source rows (a median of a subtotal is the median of its rows,
 * not of the medians below it). Each source row contributes to the cells of all its ancestors, which
 * is (row depth + 1) x (column depth + 1) updates per row and value.
 *
 * Value filters (top N, value conditions) remove whole groups before the final aggregation, so totals
 * show the visible items only, as in Excel.
 */

import { AGGREGATORS } from "./aggregators.js";
import { derivedColumn } from "./derive.js";
import { DEFAULT_LABELS, labelOf, ranksOf } from "./labels.js";
import { normalize } from "./view.js";

/**
 * @typedef {object} PivotNode
 * @property {number} id
 * @property {number} depth      0 for the root (grand total)
 * @property {number} code       dictionary code of its key, -1 for blank, -2 for the root
 * @property {string | number | boolean | null} key  raw key value (null for blank and the root)
 * @property {Array<string | number | boolean | null>} path  keys from the top level down
 * @property {PivotNode | null} parent
 * @property {PivotNode[]} children  in display (sorted) order
 * @property {number} index      position among its siblings
 */

const refKey = (ref) => `${ref.agg}\u0000${ref.field ?? ""}`;

function columnResolver(encoded, view) {
    const derived = new Map(view.derived.map((d) => [d.name.toLowerCase(), d]));
    return (name) => {
        if (name === null || name === undefined) {
            return null;
        }
        const spec = derived.get(name.toLowerCase());
        return spec ? derivedColumn(encoded, spec) : encoded.column(name) ?? null;
    };
}

/**
 * Groups rows by the codes of some columns.
 * @param {import("./encode.js").Column[]} columns
 * @param {Int32Array} rows  source row indices
 * @returns {{ groupOf: Int32Array, paths: number[][] }}  groupOf is indexed by position in rows
 */
export function groupBy(columns, rows) {
    const groupOf = new Int32Array(rows.length);
    const paths = [];
    if (columns.length === 0) {
        paths.push([]);
        return { groupOf, paths };
    }
    let product = 1;
    for (const c of columns) {
        product *= c.dict.length + 1;
    }
    const numeric = product < 2 ** 52;
    const map = new Map();
    const k = columns.length;
    const codeArrays = columns.map((c) => c.codes);
    const radices = columns.map((c) => c.dict.length + 1);
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        let key;
        if (numeric) {
            key = 0;
            for (let j = 0; j < k; j++) {
                key = key * radices[j] + codeArrays[j][r] + 1;
            }
        } else {
            key = "";
            for (let j = 0; j < k; j++) {
                key += codeArrays[j][r] + ",";
            }
        }
        let g = map.get(key);
        if (g === undefined) {
            g = paths.length;
            const path = new Array(k);
            for (let j = 0; j < k; j++) {
                path[j] = codeArrays[j][r];
            }
            paths.push(path);
            map.set(key, g);
        }
        groupOf[i] = g;
    }
    return { groupOf, paths };
}

/** Aggregates one measure per group; returns the values by group. */
function aggregateGroups(columnOf, ref, rows, groupOf, groupCount, locale) {
    const column = ref.field ? columnOf(ref.field) : null;
    const def = AGGREGATORS[ref.agg];
    const ranks = column ? ranksOf(column, locale) : null;
    const kernel = def.create(column, groupCount, ranks, (code) => labelOf(column, column.dict[code], locale));
    for (let i = 0; i < rows.length; i++) {
        kernel.add(groupOf[i], rows[i]);
    }
    const out = new Array(groupCount);
    for (let g = 0; g < groupCount; g++) {
        out[g] = kernel.get(g);
    }
    return out;
}

function matchLabel(op, label, value) {
    const l = label.toLocaleLowerCase();
    const v = value.toLocaleLowerCase();
    switch (op) {
        case "equals":
            return l === v;
        case "notEquals":
            return l !== v;
        case "contains":
            return l.includes(v);
        case "notContains":
            return !l.includes(v);
        case "beginsWith":
            return l.startsWith(v);
        case "endsWith":
            return l.endsWith(v);
        default:
            return true;
    }
}

function matchValue(filter, v) {
    if (typeof v !== "number" || Number.isNaN(v)) {
        return false;
    }
    const a = filter.value;
    const lo = Math.min(a, filter.value2 ?? a);
    const hi = Math.max(a, filter.value2 ?? a);
    switch (filter.op) {
        case "=":
            return v === a;
        case "!=":
            return v !== a;
        case ">":
            return v > a;
        case ">=":
            return v >= a;
        case "<":
            return v < a;
        case "<=":
            return v <= a;
        case "between":
            return v >= lo && v <= hi;
        case "notBetween":
            return v < lo || v > hi;
        default:
            return true;
    }
}

function filterRows(rows, keep) {
    let n = 0;
    const out = new Int32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        if (keep(rows[i], i)) {
            out[n++] = rows[i];
        }
    }
    return out.slice(0, n);
}

/** Include, exclude and label filters: decided per dictionary code, applied per row. */
function applyItemFilters(view, columnOf, rows, locale) {
    for (const f of view.filters) {
        if (f.type !== "include" && f.type !== "exclude" && f.type !== "label") {
            continue;
        }
        const column = columnOf(f.field);
        if (!column) {
            continue;
        }
        // allowed[code + 1]: index 0 is blank
        const allowed = new Uint8Array(column.dict.length + 1);
        if (f.type === "label") {
            for (let code = -1; code < column.dict.length; code++) {
                const label = labelOf(column, code === -1 ? null : column.dict[code], locale);
                allowed[code + 1] = matchLabel(f.op, label, f.value) ? 1 : 0;
            }
        } else {
            const index = new Map(column.dict.map((v, code) => [v, code]));
            const listed = new Uint8Array(column.dict.length + 1);
            for (const item of f.items) {
                const code = item === null ? -1 : index.get(item);
                if (code !== undefined) {
                    listed[code + 1] = 1;
                }
            }
            for (let i = 0; i < allowed.length; i++) {
                allowed[i] = f.type === "include" ? listed[i] : 1 - listed[i];
            }
        }
        const codes = column.codes;
        rows = filterRows(rows, (r) => allowed[codes[r] + 1] === 1);
    }
    return rows;
}

/**
 * Top N and value conditions. A filter on a field of an axis groups by the axis fields down to it, so
 * "top 3 products" keeps three products within each region above it; a field off the axes is grouped
 * on its own. Filters run outer levels first, each on the rows the previous one left.
 */
function applyValueFilters(view, columnOf, rows, locale) {
    const levelOf = (name) => {
        const r = view.rows.indexOf(name);
        if (r !== -1) {
            return { fields: view.rows.slice(0, r + 1), order: r };
        }
        const c = view.cols.indexOf(name);
        if (c !== -1) {
            return { fields: view.cols.slice(0, c + 1), order: 100 + c };
        }
        return { fields: [name], order: 200 };
    };
    const filters = view.filters
        .filter((f) => f.type === "top" || f.type === "value")
        .map((f, i) => ({ f, i, ...levelOf(f.field) }))
        .sort((a, b) => a.order - b.order || a.i - b.i);
    for (const { f, fields } of filters) {
        const columns = fields.map(columnOf);
        if (columns.includes(null)) {
            continue;
        }
        const { groupOf, paths } = groupBy(columns, rows);
        const values = aggregateGroups(columnOf, f.by, rows, groupOf, paths.length, locale);
        const keep = new Uint8Array(paths.length);
        if (f.type === "value") {
            values.forEach((v, g) => {
                keep[g] = matchValue(f, v) ? 1 : 0;
            });
        } else {
            // within each parent group: the count largest (or smallest) values; blanks never count
            const byParent = new Map();
            paths.forEach((p, g) => {
                const parent = p.slice(0, -1).join(",");
                if (!byParent.has(parent)) {
                    byParent.set(parent, []);
                }
                byParent.get(parent).push(g);
            });
            for (const groups of byParent.values()) {
                groups
                    .filter((g) => typeof values[g] === "number")
                    .sort((a, b) => (f.bottom ? values[a] - values[b] : values[b] - values[a]) || a - b)
                    .slice(0, f.count)
                    .forEach((g) => {
                        keep[g] = 1;
                    });
            }
        }
        rows = filterRows(rows, (_r, i) => keep[groupOf[i]] === 1);
    }
    return rows;
}

function makeNode(id, depth, code, key, parent) {
    return {
        id,
        depth,
        code,
        key,
        path: parent ? [...parent.path, key] : [],
        parent,
        children: [],
        index: 0
    };
}

/** Builds the key tree of an axis; returns the leaf node of every row position. */
function buildTree(columns, rows) {
    const { groupOf, paths } = groupBy(columns, rows);
    const root = makeNode(0, 0, -2, null, null);
    const nodes = [root];
    const childMaps = [new Map()];
    const leafOfGroup = new Array(paths.length);
    paths.forEach((path, g) => {
        let node = root;
        for (let level = 0; level < path.length; level++) {
            const code = path[level];
            const map = childMaps[node.id];
            let child = map.get(code);
            if (child === undefined) {
                const key = code === -1 ? null : columns[level].dict[code];
                child = makeNode(nodes.length, level + 1, code, key, node);
                nodes.push(child);
                childMaps.push(new Map());
                map.set(code, child);
                node.children.push(child);
            }
            node = child;
        }
        leafOfGroup[g] = node;
    });
    const leafOf = new Int32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        leafOf[i] = leafOfGroup[groupOf[i]].id;
    }
    return { root, nodes, leafOf };
}

/**
 * Pivots encoded data with a view.
 *
 * @param {import("./encode.js").Encoded} encoded
 * @param {unknown} viewInput  a view; normalized here, so it may come straight from a user
 * @param {{ locale?: string }} [options]  locale for natural sort and label filters
 */
export function computePivot(encoded, viewInput, options = {}) {
    const view = normalize(viewInput, encoded);
    const locale = options.locale ?? view.formatting.locale ?? undefined;
    const columnOf = columnResolver(encoded, view);

    let rows = new Int32Array(encoded.length);
    for (let i = 0; i < rows.length; i++) {
        rows[i] = i;
    }
    rows = applyItemFilters(view, columnOf, rows, locale);
    rows = applyValueFilters(view, columnOf, rows, locale);

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

    // Cells: every (row ancestor, column ancestor) pair of every (row leaf, column leaf) pair present.
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
    const nCells = cellIndex.size;

    const kernels = measures.map((m) => {
        const column = m.field ? columnOf(m.field) : null;
        const ranks = column ? ranksOf(column, locale) : null;
        return AGGREGATORS[m.agg].create(column, nCells, ranks, (code) => labelOf(column, column.dict[code], locale));
    });
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

    // Sort children: by label (natural order, blank last) or by a value, per field.
    const sortOf = new Map(view.sort.map((s) => [s.field, s]));
    const sortAxis = (tree, fields, columns, otherRoot, isRows) => {
        const walk = (node) => {
            if (node.children.length === 0) {
                return;
            }
            const level = node.depth;
            const spec = sortOf.get(fields[level]) ?? { by: "label", order: "asc" };
            const dir = spec.order === "desc" ? -1 : 1;
            const ranks = ranksOf(columns[level], locale);
            const rank = (n) => (n.code < 0 ? Infinity : ranks[n.code]);
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
                const m = measureIndex.get(refKey(spec.value));
                const val = (n) => {
                    const v = isRows ? measureValue(n, otherRoot, m) : measureValue(otherRoot, n, m);
                    return typeof v === "number" ? v : null;
                };
                const vals = new Map(node.children.map((c) => [c, val(c)]));
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
    };
    sortAxis(rowTree, view.rows, rowColumns, colTree.root, true);
    sortAxis(colTree, view.cols, colColumns, rowTree.root, false);

    const valueTypes = view.values.map((v) => {
        if (v.showAs) {
            return "number";
        }
        const column = v.field ? columnOf(v.field) : null;
        return AGGREGATORS[v.agg].resultType(column ? column.type : "number");
    });

    /** Raw aggregate of value vi in a cell; null when the cell has no rows. */
    const value = (rowNode, colNode, vi) => measureValue(rowNode, colNode, valueMeasure[vi]);
    const num = (v) => (typeof v === "number" ? v : null);
    const ratio = (a, b) => (a === null || b === null || b === 0 ? null : a / b);

    /** The value as shown: after "show values as". */
    const display = (rowNode, colNode, vi) => {
        const spec = view.values[vi];
        const v = value(rowNode, colNode, vi);
        if (!spec.showAs) {
            return v;
        }
        const x = num(v);
        const raw = (r, c) => num(value(r, c, vi));
        switch (spec.showAs.type) {
            case "percentOfGrandTotal":
                return ratio(x, raw(rowTree.root, colTree.root));
            case "percentOfRowTotal":
                return ratio(x, raw(rowNode, colTree.root));
            case "percentOfColumnTotal":
                return ratio(x, raw(rowTree.root, colNode));
            case "percentOfParentRow":
                return ratio(x, raw(rowNode.parent ?? rowNode, colNode));
            case "percentOfParentColumn":
                return ratio(x, raw(rowNode, colNode.parent ?? colNode));
            default:
                return alongAxis(spec.showAs, rowNode, colNode, x, raw);
        }
    };

    const alongAxis = (showAs, rowNode, colNode, x, raw) => {
        const onRows = showAs.axis !== "cols";
        const node = onRows ? rowNode : colNode;
        const at = (n) => (onRows ? raw(n, colNode) : raw(rowNode, n));
        if (!node.parent) {
            // the grand total has no siblings: a running total there is the whole
            if (showAs.type === "runningTotal") {
                return x;
            }
            return showAs.type === "percentRunningTotal" ? (x === null ? null : 1) : null;
        }
        const siblings = node.parent.children;
        switch (showAs.type) {
            case "differenceFromPrevious":
            case "percentDifferenceFromPrevious": {
                if (node.index === 0 || x === null) {
                    return null;
                }
                const prev = at(siblings[node.index - 1]) ?? 0;
                return showAs.type === "differenceFromPrevious" ? x - prev : ratio(x - prev, prev);
            }
            case "runningTotal":
            case "percentRunningTotal": {
                let sum = 0;
                for (let i = 0; i <= node.index; i++) {
                    sum += at(siblings[i]) ?? 0;
                }
                return showAs.type === "runningTotal" ? sum : ratio(sum, at(node.parent));
            }
            case "rankAscending":
            case "rankDescending": {
                if (x === null) {
                    return null;
                }
                let rank = 1;
                for (const s of siblings) {
                    const y = at(s);
                    if (y !== null && (showAs.type === "rankDescending" ? y > x : y < x)) {
                        rank++;
                    }
                }
                return rank;
            }
            default:
                return x;
        }
    };

    return {
        view,
        locale,
        encoded,
        /** source row indices left after all filters */
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
        /** the label of a node's key */
        label: (axis, node, labels = DEFAULT_LABELS) => {
            if (!node.parent) {
                return labels.grandTotal ?? DEFAULT_LABELS.grandTotal;
            }
            const column = (axis === "cols" ? colColumns : rowColumns)[node.depth - 1];
            return labelOf(column, node.key, locale, labels);
        }
    };
}

const sameKey = (a, b) => a === b || (a === null && b === null) || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b));

/**
 * The node of an axis for a key path ([] is the grand total); null when there is none.
 * @param {ReturnType<typeof computePivot>} result
 * @param {"rows" | "cols"} axis
 * @param {Array<string | number | boolean | null>} path
 */
export function findNode(result, axis, path) {
    let node = axis === "cols" ? result.colRoot : result.rowRoot;
    for (const key of path || []) {
        node = node.children.find((c) => sameKey(c.key, key));
        if (!node) {
            return null;
        }
    }
    return node;
}

/**
 * The source row indices behind a cell (drill-down), in data order.
 * @param {ReturnType<typeof computePivot>} result
 * @param {PivotNode | Array<any>} [row]  a row node or key path; omitted or [] for all rows
 * @param {PivotNode | Array<any>} [col]  a column node or key path
 * @returns {Int32Array}
 */
export function cellRows(result, row = [], col = []) {
    const rowNode = Array.isArray(row) ? findNode(result, "rows", row) : row;
    const colNode = Array.isArray(col) ? findNode(result, "cols", col) : col;
    if (!rowNode || !colNode) {
        return new Int32Array(0);
    }
    const under = (nodes, leafId, target) => {
        let n = nodes[leafId];
        while (n && n.depth > target.depth) {
            n = n.parent;
        }
        return n === target;
    };
    const out = [];
    for (let i = 0; i < result.rows.length; i++) {
        if (under(result.rowNodes, result.rowLeafOf[i], rowNode) && under(result.colNodes, result.colLeafOf[i], colNode)) {
            out.push(result.rows[i]);
        }
    }
    return Int32Array.from(out);
}
