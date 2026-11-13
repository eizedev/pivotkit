/*
 * The pivot as a grid of cells: header rows with merged column labels, body rows with merged row
 * labels, subtotals and grand totals, formatted text next to the raw value, toggles for collapsing
 * groups and conditional-formatting ratios. The layout is Excel's tabular form: one header column
 * per row field, one header row per column field (its name in the corner), then a header row with
 * the value names and the row field names. A single value's name is one cell over all its columns.
 *
 * The UI renders rows[r][c]; a null entry is covered by a merged cell above or to the left of it.
 */

import { checkLimit, expect } from "./errors.js";
import { formatterFor, parseFormat } from "./format.js";
import { DEFAULT_LABELS, fieldLabel, fill } from "./labels.js";
import { axisLines } from "./layout.js";
import { resolveLimits } from "./limits.js";
import { isPivotResult } from "./pivot.js";
import { SHOW_AS } from "./show-as.js";
import { decimalsOf, hexToRgb, resolveLocale, optionsOf } from "./util.js";

/**
 * @typedef {object} GridCell
 * @property {string} text      formatted for display
 * @property {string | number | boolean | null} value  raw value (number for values, key for labels)
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
 * @property {boolean} [hasRows]  value cells: whether any source row is behind the cell (a blank
 *   cell of a combination without data has none; nothing to drill into)
 * @property {{ axis: "rows" | "cols", path: any[], collapsed: boolean }} [toggle]
 * @property {{ scale?: number, bar?: number, color: string | null }} [style]  conditional formatting
 */

/** Aggregators whose results have decimals even on whole numbers: shown with two. */
const FRACTIONAL = new Set(["average", "median", "stdev", "stdevp", "var", "varp"]);
/** Decimals shown at most by the automatic format. */
const AUTO_DECIMALS = 2;

/**
 * The decimals of a number column's values, at most AUTO_DECIMALS: what a sum, minimum or maximum of
 * them needs. Cached on the encoded data per column.
 * @param {import("./encode.js").Encoded} encoded
 * @param {string | null} field
 */
function sourceDecimals(encoded, field) {
    const column = field ? encoded.column(field) : undefined;
    if (!column || column.type !== "number") {
        return AUTO_DECIMALS;
    }
    return encoded.cache.getOrSet(`decimals:${column.id}`, () => {
        let d = 0;
        for (const v of column.dict) {
            if (typeof v === "number") {
                d = Math.max(d, decimalsOf(v));
                if (d >= AUTO_DECIMALS) {
                    return AUTO_DECIMALS;
                }
            }
        }
        return d;
    });
}

/**
 * The format a value is shown with: a percent or rank calculation decides its own (a percent format
 * of the view's choice is kept), else the view's format, else one that fits the result type. The
 * automatic number format has the same decimals in every cell of a value column: those of the source
 * values (at most two) for a sum, minimum or maximum, two for an average or a spread.
 * @param {import("./pivot.js").PivotResult} result
 * @param {number} vi  value index
 */
export function defaultFormat(result, vi) {
    const spec = result.values[vi];
    const own = spec.showAs ? SHOW_AS[spec.showAs.type].format : null;
    if (own === "percent") {
        // one decimal in every cell ("2.0%", not "2%" next to "3.3%"), unless the view chose its own
        return spec.format && parseFormat(spec.format).name === "percent" ? spec.format : "percent:1";
    }
    if (own === "integer") {
        return "integer";
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
    if (spec.agg === "count" || spec.agg === "countUnique") {
        return "integer";
    }
    return `number:${FRACTIONAL.has(spec.agg) ? AUTO_DECIMALS : sourceDecimals(result.encoded, spec.field)}`;
}

/**
 * "Sum of Sales", or the value's own label. A value shown as a calculation says so: "% of grand
 * total of Sales" (a sum is named by its field alone), "Running total of Count of Ticket".
 */
export function valueName(spec, labels = DEFAULT_LABELS) {
    if (spec.label) {
        return spec.label;
    }
    let base;
    if (!spec.field) {
        base = labels.countRows ?? DEFAULT_LABELS.countRows;
    } else {
        const aggs = { ...DEFAULT_LABELS.aggregators, ...(labels.aggregators || {}) };
        const agg = Object.hasOwn(aggs, spec.agg) ? aggs[spec.agg] : spec.agg;
        base = fill(labels.valueName ?? DEFAULT_LABELS.valueName, { agg, field: fieldLabel(spec.field, labels) });
    }
    if (!spec.showAs) {
        return base;
    }
    const names = { ...DEFAULT_LABELS.showAs, ...(labels.showAs || {}) };
    const type = spec.showAs.type;
    const showAs = Object.hasOwn(names, type) ? names[type] : type;
    const value = spec.field && spec.agg === "sum" ? fieldLabel(spec.field, labels) : base;
    return fill(labels.showAsName ?? DEFAULT_LABELS.showAsName, { showAs, value });
}

/** @type {(kind: string) => 0 | 1 | 2} */
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
 * @typedef {object} Grid
 * @property {Array<Array<GridCell | null>>} rows  header rows first; null is covered by a merge
 * @property {number} headerRows
 * @property {number} rowHeaderColumns
 * @property {number} columnCount
 * @property {Array<{ row: number, col: number, rowSpan: number, colSpan: number }>} merges
 * @property {Array<{ colPath: any[], valueIndex: number, total: 0 | 1 | 2 }>} dataColumns
 * @property {Array<{ rowPath: any[], total: 0 | 1 | 2, collapsed: boolean }>} bodyRows
 * @property {string[]} formats     per value
 * @property {Array<string | null>} showAs  per value: its "show values as" type, or null
 * @property {string[]} valueNames  per value
 * @property {Array<import("./view.js").Conditional | null>} conditional  per value, for the XLSX export
 * @property {string} locale        the locale the texts are formatted in; the exports use it too
 * @property {string} timeZone      the data's time zone
 */

/**
 * True for the output of toGrid().
 * @param {unknown} grid
 * @returns {grid is Grid}
 */
export function isGrid(grid) {
    const g = /** @type {any} */ (grid);
    return g !== null && typeof g === "object" && Array.isArray(g.rows) && Array.isArray(g.merges) && Number.isInteger(g.columnCount);
}

/**
 * @typedef {object} GridContext  what the steps of one toGrid() call share
 * @property {import("./pivot.js").PivotResult} result
 * @property {import("./view.js").View} view
 * @property {import("./labels.js").Labels} labels
 * @property {Array<{ line: { node: import("./tree.js").PivotNode, kind: string }, vi: number }>} dataColumns
 * @property {number} k      label columns
 * @property {number} h      header rows
 * @property {number} width
 * @property {string[]} formats
 * @property {Array<(v: unknown) => string>} formatters
 * @property {string[]} names
 */

/** @typedef {GridCell & { mergeKey?: string }} LabelCell  a cell while merges are worked out */

const toggleFor = (axis, node, collapsed) => ({ axis, path: node.path, collapsed });

/**
 * The label cell of an axis line at one level of the axis: the key of the line's ancestor at that
 * level, the label of a total or collapsed group where it starts, or the empty rest it spans over.
 * Column lines are labelled downwards in the header, row lines rightwards in the body.
 * @param {GridContext} g
 * @param {"rows" | "cols"} axis
 */
function labelCell(g, axis, { node, kind }, level) {
    /** @type {"colHeader" | "rowHeader"} */
    const cellKind = axis === "cols" ? "colHeader" : "rowHeader";
    const pathOf = (n) => (axis === "cols" ? { colPath: n.path } : { rowPath: n.path });
    const label = (n) => g.result.label(axis, n, g.labels);
    const start = kind === "grand" ? 0 : node.depth - 1;
    if (kind !== "leaf" && level === start) {
        const text = kind === "collapsed" ? label(node) : node.parent ? fill(g.labels.total, { label: label(node) }) : g.labels.grandTotal;
        /** @type {LabelCell} */
        const cell = { text, value: kind === "collapsed" ? node.key : null, kind: cellKind, total: totalOf(kind), ...pathOf(node), mergeKey: `s${node.id}:${kind}` };
        if (kind === "collapsed") {
            cell.toggle = toggleFor(axis, node, true);
        }
        return cell;
    }
    if (kind !== "leaf" && level > start) {
        return { text: "", value: null, kind: cellKind, total: totalOf(kind), mergeKey: `s${node.id}:${kind}` };
    }
    const a = ancestorAt(node, level + 1);
    /** @type {LabelCell} */
    const cell = { text: label(a), value: a.key, kind: cellKind, total: 0, ...pathOf(a), mergeKey: `n${a.id}` };
    if (a.children.length > 0) {
        cell.toggle = toggleFor(axis, a, false);
    }
    return cell;
}

/** Header rows: one per column field, then the row of value names (row field names on its left). */
function headerRows(g) {
    const { view, k, h, width } = g;
    const header = Array.from({ length: h }, () => new Array(width).fill(null));
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < k; c++) {
            if (r === h - 1) {
                header[r][c] = { text: view.rows.length > 0 ? fieldLabel(view.rows[c], g.labels) : "", value: null, kind: "corner", total: 0, field: view.rows.length > 0 ? view.rows[c] : undefined };
            } else if (c === k - 1) {
                // the column field's name, next to its labels
                header[r][c] = { text: fieldLabel(view.cols[r], g.labels), value: null, kind: "corner", total: 0, field: view.cols[r] };
            } else {
                header[r][c] = { text: "", value: null, kind: "corner", total: 0, mergeKey: "corner" };
            }
        }
    }
    // one value: its name once, over all of its columns, instead of in each of them
    const single = view.values.length === 1;
    g.dataColumns.forEach(({ line, vi }, j) => {
        const c = k + j;
        for (let level = 0; level < view.cols.length; level++) {
            header[level][c] = labelCell(g, "cols", line, level);
        }
        /** @type {LabelCell} */
        const cell = {
            text: vi >= 0 ? g.names[vi] : "",
            value: null,
            kind: "colHeader",
            total: single ? 0 : totalOf(line.kind),
            valueIndex: vi >= 0 ? vi : undefined,
            colPath: single ? [] : line.node.path
        };
        if (single) {
            cell.mergeKey = "value";
        }
        header[h - 1][c] = cell;
    });
    return header;
}

/** Body rows: row labels, then one value cell per data column. */
function bodyRows(g, rowLines) {
    const { result, view, k, width } = g;
    return rowLines.map((line) => {
        const { node, kind } = line;
        const row = new Array(width).fill(null);
        for (let level = 0; level < k; level++) {
            row[level] = view.rows.length === 0
                ? { text: view.values.length > 0 || view.cols.length > 0 ? g.labels.grandTotal : "", value: null, kind: "rowHeader", total: 2, rowPath: [] }
                : labelCell(g, "rows", line, level);
        }
        g.dataColumns.forEach(({ line: col, vi }, j) => {
            const total = /** @type {0 | 1 | 2} */ (Math.max(totalOf(kind), totalOf(col.kind)));
            const hasRows = result.hasRows(node, col.node);
            if (vi < 0) {
                row[k + j] = { text: "", value: null, kind: "value", total, rowPath: node.path, colPath: col.node.path, hasRows };
                return;
            }
            const v = result.display(node, col.node, vi);
            row[k + j] = {
                text: v === null ? "" : g.formatters[vi](v),
                value: v,
                kind: "value",
                total,
                valueType: view.values[vi].showAs ? "number" : result.valueTypes[vi],
                format: g.formats[vi],
                rowPath: node.path,
                colPath: col.node.path,
                valueIndex: vi,
                hasRows
            };
        });
        return row;
    });
}

/** Conditional formatting over the value cells that are not totals: a style per cell. */
function applyConditional(g, body) {
    g.view.values.forEach((spec, vi) => {
        if (!spec.conditional) {
            return;
        }
        const cells = [];
        for (const row of body) {
            for (let c = g.k; c < g.width; c++) {
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
}

/**
 * The pivot as a grid of cells. Dense: rows x columns cells are allocated, so the size is counted
 * first and more than `limits.cells` throws a PivotkitError (LIMIT_EXCEEDED) before any allocation.
 * @param {import("./pivot.js").PivotResult} result  from computePivot()
 * @param {object} [options]
 * @param {string} [options.locale]  used when the view names none; default the pivot's locale
 * @param {Partial<import("./labels.js").Labels>} [options.labels]  texts for totals, blanks and value names
 * @param {Partial<import("./limits.js").Limits>} [options.limits]
 * @returns {Grid}
 */
export function toGrid(result, options) {
    options = optionsOf(options, "toGrid");
    expect(isPivotResult(result), "toGrid(result): result must come from computePivot()");
    const limits = resolveLimits(options);
    const view = result.view;
    const locale = resolveLocale(view.formatting.locale, options.locale ?? result.locale);
    const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
    // without values a total carries no number: no subtotal or grand total line on either axis
    const totals = view.values.length > 0 ? view.totals : { grandTotalRow: false, grandTotalColumn: false, rowSubtotals: false, colSubtotals: false };
    const rowLines = axisLines(result.rowRoot, view.rows.length, view.collapsed.rows, totals.rowSubtotals, totals.grandTotalRow);
    const colLines = axisLines(result.colRoot, view.cols.length, view.collapsed.cols, totals.colSubtotals, totals.grandTotalColumn);
    // one data column per value and column line; without values only the column fields' labels
    // need columns (empty cells under them), and without those there is no data column at all
    const dataColumns = view.values.length > 0
        ? colLines.flatMap((line) => view.values.map((_, vi) => ({ line, vi })))
        : view.cols.length > 0 ? colLines.map((line) => ({ line, vi: -1 })) : [];
    const k = Math.max(1, view.rows.length);
    const h = view.cols.length + 1;
    const width = k + dataColumns.length;
    checkLimit("cells", (h + rowLines.length) * width, limits.cells, "grid cells");

    const formats = view.values.map((_, vi) => defaultFormat(result, vi));
    /** @type {GridContext} */
    const g = {
        result,
        view,
        labels,
        dataColumns,
        k,
        h,
        width,
        formats,
        formatters: formats.map((f) => formatterFor(f, locale)),
        names: view.values.map((v) => valueName(v, labels))
    };
    const header = headerRows(g);
    const body = bodyRows(g, rowLines);
    const merges = [];
    mergeRegion(header, 0, 0, h, width, merges);
    const bodyMerges = [];
    mergeRegion(body, 0, 0, body.length, k, bodyMerges);
    merges.push(...bodyMerges.map((m) => ({ ...m, row: m.row + h })));
    applyConditional(g, body);

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
        showAs: view.values.map((v) => (v.showAs ? v.showAs.type : null)),
        valueNames: g.names,
        conditional: view.values.map((v) => v.conditional),
        locale,
        timeZone: result.timeZone
    };
}
