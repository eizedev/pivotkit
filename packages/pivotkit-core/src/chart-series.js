/*
 * Chart data from a pivot: categories from the row keys, one series per column key and value, and the
 * chart type "auto" stands for. Subtotals and grand totals are not plotted; collapsed groups are
 * plotted as one category. The first render needs these (the chart's text alternative, the tips), so
 * they are apart from the ECharts option (chart.js), which only a drawn chart needs.
 */

import { TIMELINE_UNITS } from "./derive.js";
import { checkLimit, expect } from "./errors.js";
import { defaultFormat, valueName } from "./grid.js";
import { DEFAULT_LABELS } from "./labels.js";
import { axisLines } from "./layout.js";
import { resolveLimits } from "./limits.js";
import { isPivotResult } from "./pivot.js";
import { optionsOf } from "./util.js";

/**
 * Chart data: one category per plotted row line, one series per column line and value. Dense like
 * the grid: more than `limits.cells` data points throw a PivotkitError (LIMIT_EXCEEDED).
 * `maxCategories` keeps the first categories in the view's order (sort by value for the largest);
 * `categoryCount` is the number there were before.
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ labels?: Partial<import("./labels.js").Labels>, separator?: string, limits?: Partial<import("./limits.js").Limits>, maxCategories?: number }} [options]
 */
export function toSeries(result, options) {
    options = optionsOf(options, "toSeries");
    expect(isPivotResult(result), "toSeries(result): result must come from computePivot()");
    const limits = resolveLimits(options);
    const view = result.view;
    const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
    const separator = options.separator ?? " / ";
    const plotted = (root, depth, collapsed) => axisLines(root, depth, collapsed, false, false).filter((l) => l.kind !== "grand");
    let rowLines = plotted(result.rowRoot, view.rows.length, view.collapsed.rows);
    let colLines = plotted(result.colRoot, view.cols.length, view.collapsed.cols);
    // a pivot whose only row is the grand total still plots that one bar
    if (rowLines.length === 0) {
        rowLines = [{ node: result.rowRoot, kind: "leaf" }];
    }
    const categoryCount = rowLines.length;
    if (options.maxCategories !== undefined) {
        expect(Number.isInteger(options.maxCategories) && options.maxCategories > 0, "toSeries: maxCategories must be a positive whole number");
        rowLines = rowLines.slice(0, options.maxCategories);
    }
    if (colLines.length === 0) {
        colLines = [{ node: result.colRoot, kind: "leaf" }];
    }
    const partsOf = (axis, node) => {
        const parts = [];
        for (let n = node; n && n.parent; n = n.parent) {
            parts.unshift(result.label(axis, n, labels));
        }
        return parts;
    };
    const pathLabel = (axis, node) => {
        const parts = partsOf(axis, node);
        return parts.length ? parts.join(separator) : labels.grandTotal;
    };
    const plottedValues = view.values.filter((_, vi) => result.valueTypes[vi] !== "text").length;
    checkLimit("cells", rowLines.length * Math.max(1, colLines.length * plottedValues), limits.cells, "chart data points");
    const names = view.values.map((v) => valueName(v, labels));
    const numeric = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const series = [];
    for (const { node: colNode } of colLines) {
        view.values.forEach((spec, vi) => {
            if (result.valueTypes[vi] === "text") {
                return;
            }
            const colName = colNode.parent ? pathLabel("cols", colNode) : "";
            const name = colName && view.values.length > 1 ? `${colName}${separator}${names[vi]}` : colName || names[vi];
            series.push({
                name,
                valueIndex: vi,
                colPath: colNode.path,
                format: defaultFormat(result, vi),
                data: rowLines.map(({ node }) => numeric(result.display(node, colNode, vi)))
            });
        });
    }
    return {
        categories: rowLines.map(({ node }) => pathLabel("rows", node)),
        // the label of each level of a category's path ([] for the grand total), for a two-level axis
        categoryLevels: rowLines.map(({ node }) => partsOf("rows", node)),
        categoryCount,
        categoryPaths: rowLines.map(({ node }) => node.path),
        series,
        // per value: the row totals over all columns, for pie charts
        totals: view.values.map((_, vi) => rowLines.map(({ node }) => numeric(result.display(node, result.colRoot, vi))))
    };
}

/**
 * The chart type "auto" stands for (the view's default, `chart.type: "auto"`): lines when a field on
 * Rows is a date or a grouping of one along the time line (day, week, month, quarter, year), so the
 * categories are points in time; else bars. A grouping that repeats (weekday, hour of day, month,
 * quarter or week of year) makes categories, not a time line: bars. A date on
 * Columns alone is not enough: each date would be a line of its own, so a UI that wants lines there
 * swaps rows and columns for the chart first (pivotkit-react does).
 * @param {import("./view.js").View} view  the normalized view
 * @param {import("./encode.js").Encoded} data
 * @returns {"line" | "bar"}
 */
export function autoChartType(view, data) {
    const derived = Array.isArray(view.derived) ? view.derived : [];
    const isDate = (name) => {
        const key = String(name).toLowerCase();
        const d = derived.find((x) => x && typeof x.name === "string" && x.name.toLowerCase() === key);
        // a grouping along the time line counts as a date; a repeating one and a number range do not
        if (d && !TIMELINE_UNITS.includes(d.by)) {
            return false;
        }
        return data.column(d ? d.field : name)?.type === "date";
    };
    return (Array.isArray(view.rows) ? view.rows : []).some(isDate) ? "line" : "bar";
}
