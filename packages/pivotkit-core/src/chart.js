/*
 * Chart data from a pivot: categories from the row keys, one series per column key and value, and a
 * plain Apache ECharts option for bar, stacked bar, line, area, pie and heatmap. The core does not
 * import ECharts; the UI passes the option to its own ECharts instance. Subtotals and grand totals
 * are not plotted; collapsed groups are plotted as one category.
 */

import { DEFAULT_THEME } from "./defaults.js";
import { checkLimit, expect } from "./errors.js";
import { formatterFor } from "./format.js";
import { defaultFormat, valueName } from "./grid.js";
import { DEFAULT_LABELS } from "./labels.js";
import { axisLines } from "./layout.js";
import { resolveLimits } from "./limits.js";
import { isPivotResult } from "./pivot.js";
import { resolveLocale } from "./util.js";

/**
 * Chart data: one category per plotted row line, one series per column line and value. Dense like
 * the grid: more than `limits.cells` data points throw a PivotkitError (LIMIT_EXCEEDED).
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ labels?: Partial<import("./labels.js").Labels>, separator?: string, limits?: Partial<import("./limits.js").Limits> }} [options]
 */
export function toSeries(result, options = {}) {
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
    if (colLines.length === 0) {
        colLines = [{ node: result.colRoot, kind: "leaf" }];
    }
    const pathLabel = (axis, node) => {
        const parts = [];
        for (let n = node; n && n.parent; n = n.parent) {
            parts.unshift(result.label(axis, n, labels));
        }
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
        categoryPaths: rowLines.map(({ node }) => node.path),
        series,
        // per value: the row totals over all columns, for pie charts
        totals: view.values.map((_, vi) => rowLines.map(({ node }) => numeric(result.display(node, result.colRoot, vi))))
    };
}

/**
 * @typedef {object} ChartTheme
 * @property {string[]} [colors]          series palette
 * @property {string} [textColor]
 * @property {string} [axisColor]         axis lines and ticks
 * @property {string} [gridColor]         split lines
 * @property {string} [backgroundColor]   default transparent
 * @property {string} [fontFamily]
 * @property {[string, string]} [heatmapColors]  low and high end of the heatmap scale
 * @property {[string, string]} [pieRadius]       inner and outer radius, default a ring (35%, 70%)
 */

/**
 * A plain ECharts option for the view's chart, themed by the host.
 * @param {import("./pivot.js").PivotResult} result
 * @param {object} [options]
 * @param {{ type?: string, stacked?: boolean, horizontal?: boolean }} [options.chart]  overrides the view's chart
 * @param {ChartTheme} [options.theme]
 * @param {string} [options.locale]  used when the view names none; default the pivot's locale
 * @param {Partial<import("./labels.js").Labels>} [options.labels]
 * @param {string} [options.separator]  between the parts of a multi-level label, default " / "
 * @param {Partial<import("./limits.js").Limits>} [options.limits]
 */
export function toEChartsOption(result, options = {}) {
    expect(isPivotResult(result), "toEChartsOption(result): result must come from computePivot()");
    const theme = options.theme ?? {};
    const chart = { ...result.view.chart, ...(options.chart || {}) };
    const locale = resolveLocale(result.view.formatting.locale, options.locale ?? result.locale);
    const s = toSeries(result, options);
    const first = s.series[0];
    const fmt = formatterFor(first ? first.format : "number", locale);
    const compact = formatterFor(first && /^percent/.test(first.format) ? first.format : "compact", locale);
    const textStyle = { color: theme.textColor, fontFamily: theme.fontFamily };
    const axisLine = { lineStyle: { color: theme.axisColor } };
    const base = {
        backgroundColor: theme.backgroundColor ?? "transparent",
        textStyle,
        ...(theme.colors && theme.colors.length ? { color: theme.colors } : {})
    };
    const legend = s.series.length > 1 ? { legend: { type: "scroll", top: 0, textStyle } } : {};
    const valueFormatter = (v) => (typeof v === "number" ? fmt(v) : "");

    if (chart.type === "pie") {
        const vi = first ? first.valueIndex : 0;
        const data = s.categories
            .map((name, i) => ({ name, value: s.totals[vi] ? s.totals[vi][i] : null }))
            .filter((d) => typeof d.value === "number" && d.value > 0);
        return {
            ...base,
            tooltip: { trigger: "item", valueFormatter },
            legend: { type: "scroll", top: 0, textStyle },
            series: [{ type: "pie", name: first ? first.name : "", radius: [...(theme.pieRadius ?? DEFAULT_THEME.pieRadius)], top: 24, data, label: { color: theme.textColor } }]
        };
    }

    if (chart.type === "heatmap") {
        const columns = s.series.filter((x) => x.valueIndex === (first ? first.valueIndex : 0));
        const data = [];
        let min = Infinity;
        let max = -Infinity;
        columns.forEach((col, x) => {
            col.data.forEach((v, y) => {
                if (v !== null) {
                    data.push([x, y, v]);
                    min = Math.min(min, v);
                    max = Math.max(max, v);
                }
            });
        });
        return {
            ...base,
            tooltip: { trigger: "item", valueFormatter },
            grid: { top: 16, bottom: 64 },
            xAxis: { type: "category", data: columns.map((c) => c.name), axisLine, splitArea: { show: true } },
            yAxis: { type: "category", data: s.categories, axisLine, splitArea: { show: true } },
            visualMap: {
                min: data.length ? min : 0,
                max: data.length ? max : 1,
                calculable: true,
                orient: "horizontal",
                left: "center",
                bottom: 0,
                textStyle,
                ...(theme.heatmapColors ? { inRange: { color: theme.heatmapColors } } : {})
            },
            series: [{ type: "heatmap", name: first ? first.name : "", data, label: { show: data.length <= 200, formatter: (p) => fmt(p.value[2]) } }]
        };
    }

    // bar, line and area share the category axis
    const type = chart.type === "line" || chart.type === "area" ? "line" : "bar";
    const categoryAxis = { type: "category", data: s.categories, axisLine, axisLabel: { color: theme.textColor } };
    const valueAxis = {
        type: "value",
        axisLine,
        axisLabel: { color: theme.textColor, formatter: (v) => compact(v) },
        splitLine: { lineStyle: { color: theme.gridColor } }
    };
    return {
        ...base,
        ...legend,
        tooltip: { trigger: "axis", valueFormatter },
        // only the top is set: room for the legend; ECharts keeps its own defaults for the label margins
        grid: { top: s.series.length > 1 ? 40 : 16 },
        xAxis: chart.horizontal ? valueAxis : categoryAxis,
        yAxis: chart.horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
        series: s.series.map((x) => ({
            type,
            name: x.name,
            data: x.data,
            ...(chart.stacked ? { stack: "total" } : {}),
            ...(chart.type === "area" ? { areaStyle: {} } : {}),
            ...(type === "line" ? { connectNulls: false } : {})
        }))
    };
}
