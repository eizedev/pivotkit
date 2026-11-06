/*
 * The pivot as a grid of cells: header rows with merged column labels, body rows with merged row
 * labels, subtotals and grand totals, formatted text next to the raw value, toggles for collapsing
 * groups and conditional-formatting ratios. The layout is Excel's tabular form: one header column
 * per row field, one header row per column field (its name in the corner), then a header row with
 * the value names and the row field names.
 *
 * The UI renders rows[r][c]; a null entry is covered by a merged cell above or to the left of it.
 */

import { formatter } from "./format.js";
import { DEFAULT_LABELS, fill } from "./labels.js";

/**
 * @typedef {object} GridCell
 * @property {string} text      formatted for display
 * @property {string | number | null} value  raw value (number for values, key for labels)
 * @property {"corner" | "colHeader" | "rowHeader" | "value"} kind
 * @property {0 | 1 | 2} total  0 = none, 1 = subtotal, 2 = grand total
 * @property {number} [rowSpan]
 * @property {number} [colSpan]
 * @property {"number" | "text" | "date"} [valueType]
 * @property {string} [format]  format name of a value cell
 * @property {string} [field]  corner cells: the field whose name they show
 * @property {any[]} [rowPath]
 * @property {any[]} [colPath]
 * @property {number} [valueIndex]
 * @property {{ axis: "rows" | "cols", path: any[], collapsed: boolean }} [toggle]
 * @property {{ scale?: number, bar?: number, color: string | null }} [style]  conditional formatting
 */

const PERCENT_SHOW_AS = new Set([
    "percentOfGrandTotal", "percentOfRowTotal", "percentOfColumnTotal", "percentOfParentRow",
    "percentOfParentColumn", "percentDifferenceFromPrevious", "percentRunningTotal"
]);

/** The format a value is shown with when the view names none. */
export function defaultFormat(result, vi) {
    const spec = result.values[vi];
    if (spec.showAs) {
        if (PERCENT_SHOW_AS.has(spec.showAs.type)) {
            return "percent:1";
        }
        if (spec.showAs.type === "rankAscending" || spec.showAs.type === "rankDescending") {
            return "integer";
        }
    }
    if (spec.format) {
        return spec.format;
    }
    const type = result.valueTypes[vi];
    if (type === "text") {
        return "text";
    }
    if (type === "date") {
        const column = result.encoded.column(spec.field);
        return column && column.dateOnly === false ? "datetime" : "date";
    }
    return spec.agg === "count" || spec.agg === "countUnique" ? "integer" : "number";
}

/** "Sum of Sales", or the value's own label. */
export function valueName(spec, labels = DEFAULT_LABELS) {
    if (spec.label) {
        return spec.label;
    }
    if (!spec.field) {
        return labels.countRows ?? DEFAULT_LABELS.countRows;
    }
    const aggs = { ...DEFAULT_LABELS.aggregators, ...(labels.aggregators || {}) };
    const agg = Object.hasOwn(aggs, spec.agg) ? aggs[spec.agg] : spec.agg;
    return fill(labels.valueName ?? DEFAULT_LABELS.valueName, { agg, field: spec.field });
}

function pathKey(path) {
    return JSON.stringify(path);
}

/**
 * The visible lines of an axis in display order: leaves, collapsed groups, subtotals after their
 * children and the grand total last.
 */
export function axisLines(root, depth, collapsedPaths, subtotals, grandTotal) {
    const collapsed = new Set(collapsedPaths.map(pathKey));
    const lines = [];
    if (depth === 0) {
        lines.push({ node: root, kind: "leaf" });
        return lines;
    }
    const visit = (node) => {
        if (node.children.length === 0) {
            lines.push({ node, kind: "leaf" });
            return;
        }
        if (collapsed.has(pathKey(node.path))) {
            lines.push({ node, kind: "collapsed" });
            return;
        }
        node.children.forEach(visit);
        if (subtotals) {
            lines.push({ node, kind: "subtotal" });
        }
    };
    root.children.forEach(visit);
    if (grandTotal || lines.length === 0) {
        lines.push({ node: root, kind: "grand" });
    }
    return lines;
}

const totalOf = (kind) => (kind === "grand" ? 2 : kind === "subtotal" ? 1 : 0);

function ancestorAt(node, depth) {
    let n = node;
    while (n && n.depth > depth) {
        n = n.parent;
    }
    return n;
}

/** Merges equal neighbours (same mergeKey) into rectangles: right first, then down. */
function mergeRegion(matrix, top, left, bottom, right, merges) {
    for (let r = top; r < bottom; r++) {
        for (let c = left; c < right; c++) {
            const cell = matrix[r][c];
            if (!cell || cell.mergeKey === undefined) {
                continue;
            }
            const key = cell.mergeKey;
            let c2 = c + 1;
            while (c2 < right && matrix[r][c2] && matrix[r][c2].mergeKey === key) {
                c2++;
            }
            let r2 = r + 1;
            while (r2 < bottom) {
                let same = true;
                for (let x = c; x < c2; x++) {
                    if (!matrix[r2][x] || matrix[r2][x].mergeKey !== key) {
                        same = false;
                        break;
                    }
                }
                if (!same) {
                    break;
                }
                r2++;
            }
            if (c2 - c > 1 || r2 - r > 1) {
                cell.colSpan = c2 - c;
                cell.rowSpan = r2 - r;
                merges.push({ row: r, col: c, rowSpan: r2 - r, colSpan: c2 - c });
                for (let y = r; y < r2; y++) {
                    for (let x = c; x < c2; x++) {
                        if (y !== r || x !== c) {
                            matrix[y][x] = null;
                        }
                    }
                }
            }
        }
    }
}

function hexToRgb(hex) {
    const h = hex.length === 4 ? hex.slice(1).split("").map((x) => x + x).join("") : hex.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** The colour at position t (0..1) of a scale of two or three colours. */
export function scaleColor(colors, t) {
    const stops = colors.map(hexToRgb);
    const segment = stops.length === 3 ? (t <= 0.5 ? 0 : 1) : 0;
    const local = stops.length === 3 ? (t <= 0.5 ? t * 2 : (t - 0.5) * 2) : t;
    const a = stops[segment];
    const b = stops[segment + 1];
    return "#" + a.map((x, i) => Math.round(x + (b[i] - x) * local).toString(16).padStart(2, "0")).join("");
}

/**
 * @param {ReturnType<import("./pivot.js").computePivot>} result
 * @param {object} [options]
 * @param {string} [options.locale]  number and date formats; default the view's locale
 * @param {Partial<typeof DEFAULT_LABELS>} [options.labels]  texts for totals, blanks and value names
 */
export function toGrid(result, options = {}) {
    const view = result.view;
    const locale = options.locale ?? result.locale;
    const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
    const rowDepth = view.rows.length;
    const colDepth = view.cols.length;
    const values = view.values;
    const nValues = values.length;

    const rowLines = axisLines(result.rowRoot, rowDepth, view.collapsed.rows, view.totals.rowSubtotals, view.totals.grandTotalRow);
    const colLines = axisLines(result.colRoot, colDepth, view.collapsed.cols, view.totals.colSubtotals, view.totals.grandTotalColumn);
    const dataColumns = [];
    for (const line of colLines) {
        if (nValues === 0) {
            dataColumns.push({ line, vi: -1 });
        } else {
            values.forEach((_, vi) => dataColumns.push({ line, vi }));
        }
    }

    const formats = values.map((_, vi) => defaultFormat(result, vi));
    const formatters = formats.map((f) => formatter(f, locale));
    const names = values.map((v) => valueName(v, labels));
    const nodeLabel = (axis, node) => result.label(axis, node, labels);
    const totalLabel = (axis, node) => (node.parent ? fill(labels.total, { label: nodeLabel(axis, node) }) : labels.grandTotal);
    const toggleFor = (axis, node, collapsed) => ({ axis, path: node.path, collapsed });

    const k = Math.max(1, rowDepth);
    // header rows: one per column field, then the row of value names (row field names on its left)
    const h = colDepth + 1;
    const width = k + dataColumns.length;

    // ---- header ----
    const header = [];
    for (let r = 0; r < h; r++) {
        header.push(new Array(width).fill(null));
    }
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < k; c++) {
            let cell;
            if (r === h - 1) {
                cell = { text: rowDepth > 0 ? view.rows[c] : "", value: null, kind: "corner", total: 0, field: rowDepth > 0 ? view.rows[c] : undefined };
            } else if (c === k - 1) {
                // the column field's name, next to its labels
                cell = { text: view.cols[r], value: null, kind: "corner", total: 0, field: view.cols[r] };
            } else {
                cell = { text: "", value: null, kind: "corner", total: 0, mergeKey: "corner" };
            }
            header[r][c] = cell;
        }
    }
    dataColumns.forEach(({ line, vi }, j) => {
        const c = k + j;
        const { node, kind } = line;
        for (let level = 0; level < colDepth; level++) {
            let cell;
            const spanDown = kind === "grand" ? 0 : node.depth - 1;
            if (kind !== "leaf" && level === spanDown) {
                const text = kind === "collapsed" ? nodeLabel("cols", node) : totalLabel("cols", node);
                cell = {
                    text,
                    value: kind === "collapsed" ? node.key : null,
                    kind: "colHeader",
                    total: totalOf(kind),
                    colPath: node.path,
                    mergeKey: `s${node.id}:${kind}`
                };
                if (kind === "collapsed") {
                    cell.toggle = toggleFor("cols", node, true);
                }
            } else if (kind !== "leaf" && level > spanDown) {
                cell = { text: "", value: null, kind: "colHeader", total: totalOf(kind), mergeKey: `s${node.id}:${kind}` };
            } else {
                const a = ancestorAt(node, level + 1);
                cell = { text: nodeLabel("cols", a), value: a.key, kind: "colHeader", total: 0, colPath: a.path, mergeKey: `n${a.id}` };
                if (a.children.length > 0) {
                    cell.toggle = toggleFor("cols", a, false);
                }
            }
            header[level][c] = cell;
        }
        header[h - 1][c] = {
            text: vi >= 0 ? names[vi] : "",
            value: null,
            kind: "colHeader",
            total: totalOf(kind),
            valueIndex: vi >= 0 ? vi : undefined,
            colPath: node.path
        };
    });
    const merges = [];
    mergeRegion(header, 0, 0, h, width, merges);

    // ---- body ----
    const body = rowLines.map(() => new Array(width).fill(null));
    rowLines.forEach(({ node, kind }, i) => {
        for (let level = 0; level < k; level++) {
            let cell;
            if (rowDepth === 0) {
                cell = { text: nValues > 0 || colDepth > 0 ? labels.grandTotal : "", value: null, kind: "rowHeader", total: 2, rowPath: [] };
            } else {
                const spanRight = kind === "grand" ? 0 : node.depth - 1;
                if (kind !== "leaf" && level === spanRight) {
                    cell = {
                        text: kind === "collapsed" ? nodeLabel("rows", node) : totalLabel("rows", node),
                        value: kind === "collapsed" ? node.key : null,
                        kind: "rowHeader",
                        total: totalOf(kind),
                        rowPath: node.path,
                        mergeKey: `s${node.id}:${kind}`
                    };
                    if (kind === "collapsed") {
                        cell.toggle = toggleFor("rows", node, true);
                    }
                } else if (kind !== "leaf" && level > spanRight) {
                    cell = { text: "", value: null, kind: "rowHeader", total: totalOf(kind), mergeKey: `s${node.id}:${kind}` };
                } else {
                    const a = ancestorAt(node, level + 1);
                    cell = { text: nodeLabel("rows", a), value: a.key, kind: "rowHeader", total: 0, rowPath: a.path, mergeKey: `n${a.id}` };
                    if (a.children.length > 0) {
                        cell.toggle = toggleFor("rows", a, false);
                    }
                }
            }
            body[i][level] = cell;
        }
        dataColumns.forEach(({ line, vi }, j) => {
            const total = Math.max(totalOf(kind), totalOf(line.kind));
            if (vi < 0) {
                body[i][k + j] = { text: "", value: null, kind: "value", total, rowPath: node.path, colPath: line.node.path };
                return;
            }
            const v = result.display(node, line.node, vi);
            body[i][k + j] = {
                text: v === null ? "" : formatters[vi](v),
                value: v,
                kind: "value",
                total: /** @type {0|1|2} */ (total),
                valueType: values[vi].showAs ? "number" : result.valueTypes[vi],
                format: formats[vi],
                rowPath: node.path,
                colPath: line.node.path,
                valueIndex: vi
            };
        });
    });
    const bodyMerges = [];
    mergeRegion(body, 0, 0, body.length, k, bodyMerges);
    for (const m of bodyMerges) {
        merges.push({ ...m, row: m.row + h });
    }

    // ---- conditional formatting over the value cells that are not totals ----
    values.forEach((spec, vi) => {
        if (!spec.conditional) {
            return;
        }
        const cells = [];
        for (const row of body) {
            for (let c = k; c < width; c++) {
                const cell = row[c];
                if (cell && cell.valueIndex === vi && cell.total === 0 && typeof cell.value === "number") {
                    cells.push(cell);
                }
            }
        }
        if (cells.length === 0) {
            return;
        }
        let min = Infinity;
        let max = -Infinity;
        for (const cell of cells) {
            min = Math.min(min, cell.value);
            max = Math.max(max, cell.value);
        }
        for (const cell of cells) {
            if (spec.conditional.type === "colorScale") {
                const t = max === min ? 0.5 : (cell.value - min) / (max - min);
                const colors = spec.conditional.colors;
                cell.style = { scale: t, color: colors.length >= 2 ? scaleColor(colors, t) : null };
            } else {
                // bars start at zero, so a bar's length compares values as Excel's data bars do
                const lo = Math.min(0, min);
                const hi = Math.max(0, max);
                cell.style = { bar: hi === lo ? 0 : (cell.value - lo) / (hi - lo), color: spec.conditional.color };
            }
        }
    });

    const rows = header.concat(body);
    for (const row of rows) {
        for (const cell of row) {
            if (cell) {
                delete cell.mergeKey;
            }
        }
    }
    return {
        rows,
        headerRows: h,
        rowHeaderColumns: k,
        columnCount: width,
        merges,
        dataColumns: dataColumns.map(({ line, vi }) => ({ colPath: line.node.path, valueIndex: vi, total: totalOf(line.kind) })),
        bodyRows: rowLines.map(({ node, kind }) => ({ rowPath: node.path, total: totalOf(kind), collapsed: kind === "collapsed" })),
        formats,
        valueNames: names,
        /** per value: its conditional format from the view, for the XLSX export */
        conditional: values.map((v) => v.conditional)
    };
}

