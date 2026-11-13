/*
 * Chart data from a pivot: categories from the row keys, one series per column key and value, and a
 * plain Apache ECharts option for bar, stacked bar, line, area, pie, donut and heatmap. The core does not
 * import ECharts; the UI passes the option to its own ECharts instance. Subtotals and grand totals
 * are not plotted; collapsed groups are plotted as one category.
 */

import { DEFAULT_THEME } from "./defaults.js";
import { TIMELINE_UNITS } from "./derive.js";
import { checkLimit, expect } from "./errors.js";
import { formatterFor } from "./format.js";
import { defaultFormat, valueName } from "./grid.js";
import { DEFAULT_LABELS } from "./labels.js";
import { axisLines } from "./layout.js";
import { resolveLimits } from "./limits.js";
import { isPivotResult } from "./pivot.js";
import { resolveLocale, optionsOf } from "./util.js";
import { SLICE_CHART_TYPES } from "./view.js";

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
 * @typedef {object} ChartTheme
 * @property {string[]} [colors]          series palette
 * @property {string} [textColor]
 * @property {string} [axisColor]         axis lines and ticks
 * @property {string} [gridColor]         split lines
 * @property {string} [backgroundColor]   default transparent
 * @property {string} [fontFamily]
 * @property {number} [strongWeight]    font weight of the title and the group labels, default 600
 * @property {number} [titleSize]       font size of the title in px, default 16
 * @property {number} [textSize]        font size of every other text (axes, legend, labels) in px, default 14
 * @property {string[]} [colorScale]     a colour scale whose view names none (low, an optional middle, high), for toXlsx
 * @property {string} [dataBar]          data bars whose view names no colour, for toXlsx
 * @property {[string, string]} [heatmapColors]  low and high end of the heatmap scale
 * @property {[string, string]} [pieRadius]       inner and outer radius of a pie, default a circle (0%, 70%)
 * @property {[string, string]} [donutRadius]     inner and outer radius of a donut, default a ring (42%, 70%)
 */

/** Room (px) the title takes above the chart: its line and 16 px below it (32 px at 16 px). */
const roomOfTitle = (titleSize) => titleSize + 16;
/**
 * Room (px) a legend takes on its side for text `textSize` px high: one line at the top or bottom (at
 * least 24 and 32 px, what a 14 px line takes), a column on the right.
 */
const legendRoom = (textSize) => ({ top: Math.max(24, textSize + 10), bottom: Math.max(32, textSize + 18), right: 160 });

/**
 * Where the legend of a chart goes and the room it takes, from `chart.legend`: "auto" above the
 * chart when `auto` (more than one series, a pie), "bottom", "right" (a scrolling column), "off".
 * @param {string | undefined} setting
 * @param {boolean} auto
 * @param {number} top  the room above the legend (the title)
 * @param {{ fontSize: number }} textStyle
 * @returns {{ legend: object | null, room: { top: number, bottom: number, right: number } }}
 */
function legendOf(setting, auto, top, textStyle) {
    const room = legendRoom(textStyle.fontSize);
    const where = setting === "bottom" || setting === "right" || setting === "off" ? setting : auto ? "top" : "off";
    if (where === "off") {
        return { legend: null, room: { top: 0, bottom: 0, right: 0 } };
    }
    if (where === "right") {
        return { legend: { type: "scroll", orient: "vertical", right: 0, top: top + 8, bottom: 8, textStyle }, room: { top: 0, bottom: 0, right: room.right } };
    }
    if (where === "bottom") {
        return { legend: { type: "scroll", bottom: 0, textStyle }, room: { top: 0, bottom: room.bottom, right: 0 } };
    }
    return { legend: { type: "scroll", top, textStyle }, room: { top: room.top, bottom: 0, right: 0 } };
}

/**
 * Room (px) between the category axis and the group labels under it (or left of it), before the
 * layout of the UI: a line of category labels `textSize` px high and the room around it (as
 * decorateOption's straight labels).
 */
const groupAxisOffset = (textSize) => textSize + 12;

/**
 * The group labels of a category axis with two or more row fields (`chart.groupLabels` "auto" or
 * "on"; a UI hides "auto" ones where the chart has no room for them):
 * a second category axis with the same categories, which writes the outer field's item once per group,
 * at its middle, and draws a separator between two groups; the main axis then names each category by
 * its inner levels. null when there is nothing to group (one row field, or every category alone).
 * @param {ReturnType<typeof toSeries>} s
 * @param {number} rowFields
 * @param {Partial<import("./view.js").ChartSpec>} chart
 * @param {{ separator: string, axisLine: { lineStyle?: object }, theme: ChartTheme }} style
 */
function groupAxisOf(s, rowFields, chart, { separator, axisLine, theme }) {
    const levels = s.categoryLevels ?? [];
    if (chart.groupLabels === "off" || rowFields < 2 || !levels.some((l) => l.length >= 2)) {
        return null;
    }
    const outer = levels.map((l) => l[0] ?? "");
    // a collapsed group is one category: its own name on both axes
    const leaves = levels.map((l, i) => (l.length > 1 ? l.slice(1).join(separator) : s.categories[i]));
    const starts = outer.map((g, i) => i === 0 || g !== outer[i - 1]);
    const middles = new Set();
    let from = 0;
    let smallest = outer.length;
    for (let i = 1; i <= outer.length; i++) {
        if (i === outer.length || starts[i]) {
            middles.add(Math.floor((from + i - 1) / 2));
            smallest = Math.min(smallest, i - from);
            from = i;
        }
    }
    return {
        leaves,
        axis: {
            type: "category",
            data: outer,
            position: chart.horizontal ? "left" : "bottom",
            offset: groupAxisOffset(theme.textSize ?? DEFAULT_THEME.textSize),
            axisLine: { show: false },
            // the separators: from this axis to the main one, at the first category of each group
            axisTick: { show: true, inside: true, length: groupAxisOffset(theme.textSize ?? DEFAULT_THEME.textSize), interval: (i) => i > 0 && starts[i] === true, lineStyle: axisLine.lineStyle },
            axisLabel: { color: theme.textColor, fontSize: theme.textSize ?? DEFAULT_THEME.textSize, fontWeight: theme.strongWeight ?? DEFAULT_THEME.strongWeight, interval: (i) => middles.has(i) },
            axisPointer: { show: false },
            splitLine: { show: false },
            groups: true,
            // "auto": a UI may leave the group labels out where the chart is too small for them
            groupsAuto: chart.groupLabels !== "on",
            // the fewest categories of a group: a UI cuts the group labels to that many bands
            groupSize: smallest
        }
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

/**
 * A plain ECharts option for the view's chart, themed by the host. The view's display settings
 * (chart.valueLabels, legend, title, smooth) are part of it, so an image of the chart shows them.
 * @param {import("./pivot.js").PivotResult} result
 * @param {object} [options]
 * @param {Partial<import("./view.js").ChartSpec>} [options.chart]  overrides the view's chart settings
 * @param {ChartTheme} [options.theme]
 * @param {string} [options.locale]  used when the view names none; default the pivot's locale
 * @param {Partial<import("./labels.js").Labels>} [options.labels]
 * @param {string} [options.separator]  between the parts of a multi-level label, default " / "
 * @param {Partial<import("./limits.js").Limits>} [options.limits]
 * @param {number} [options.maxCategories]  plots the first categories only, see toSeries
 * @param {ReturnType<typeof toSeries>} [options.series]  toSeries() of the same result and options, when
 *   the caller has it already (it is not computed twice)
 */
export function toEChartsOption(result, options) {
    options = optionsOf(options, "toEChartsOption");
    expect(isPivotResult(result), "toEChartsOption(result): result must come from computePivot()");
    const theme = options.theme ?? {};
    const chart = { ...result.view.chart, ...(options.chart || {}) };
    if (chart.type === "auto") {
        chart.type = autoChartType(result.view, result.encoded);
    }
    const locale = resolveLocale(result.view.formatting.locale, options.locale ?? result.locale);
    // the chart data the caller already has (toSeries of the same result and options), or made here
    const s = options.series ?? toSeries(result, options);
    expect(s && Array.isArray(s.series) && Array.isArray(s.categories), "toEChartsOption: series must come from toSeries()");
    const first = s.series[0];
    const fmt = formatterFor(first ? first.format : "number", locale);
    const compact = formatterFor(first && /^percent/.test(first.format) ? first.format : "compact", locale);
    // every text but the title at the theme's size: ECharts' own is 12 px, and its axis labels do not
    // take the option's textStyle, so each one names its size (axisText)
    const textStyle = { color: theme.textColor, fontFamily: theme.fontFamily, fontSize: theme.textSize ?? DEFAULT_THEME.textSize };
    const axisText = { color: textStyle.color, fontSize: textStyle.fontSize };
    const axisLine = { lineStyle: { color: theme.axisColor } };
    const base = {
        backgroundColor: theme.backgroundColor ?? "transparent",
        textStyle,
        ...(theme.colors && theme.colors.length ? { color: theme.colors } : {})
    };
    const valueFormatter = (v) => (typeof v === "number" ? fmt(v) : "");
    // the title over the chart, and the legend where the view puts it, with the room they take
    const title = typeof chart.title === "string" && chart.title.trim() ? { title: { text: chart.title.trim(), left: "center", top: 0, textStyle: { ...textStyle, fontSize: theme.titleSize ?? DEFAULT_THEME.titleSize, fontWeight: theme.strongWeight ?? DEFAULT_THEME.strongWeight } } } : {};
    const titleRoom = title.title ? roomOfTitle(theme.titleSize ?? DEFAULT_THEME.titleSize) : 0;
    const { legend, room } = legendOf(chart.legend, SLICE_CHART_TYPES.includes(chart.type) || s.series.length > 1, titleRoom, textStyle);
    const legendPart = legend ? { legend } : {};
    // what is written next to the marks: "percent" and "both" are a pie's; the other types write the value
    const labels = chart.valueLabels === "off" || chart.valueLabels === "value" || chart.valueLabels === "percent" || chart.valueLabels === "both" ? chart.valueLabels : "auto";

    if (SLICE_CHART_TYPES.includes(chart.type)) {
        const vi = first ? first.valueIndex : 0;
        const data = s.categories
            .map((name, i) => ({ name, value: s.totals[vi] ? s.totals[vi][i] : null }))
            .filter((d) => typeof d.value === "number" && d.value > 0);
        // the share as the locale writes it: "12.5%" in English, "12,5 %" in German
        const percent = (p) => formatterFor("percent100:1", locale)(p.percent);
        const inside = chart.labelPosition === "inside";
        // outside: the slice's name with what is chosen, on a line to the slice; inside: only the
        // number on the slice (the legend names the slices), the share when nothing is chosen
        const part = { value: (p) => fmt(p.value), percent, both: (p) => `${fmt(p.value)} (${percent(p)})` };
        const pieLabel =
            labels === "off"
                ? { show: false }
                : inside
                  ? { position: "inside", formatter: part[labels === "auto" ? "percent" : labels] }
                  : labels === "auto"
                    ? {}
                    : { formatter: (p) => `${p.name}: ${part[labels](p)}` };
        const radius = chart.type === "donut" ? (theme.donutRadius ?? DEFAULT_THEME.donutRadius) : (theme.pieRadius ?? DEFAULT_THEME.pieRadius);
        return {
            ...base,
            ...title,
            tooltip: { trigger: "item", valueFormatter },
            ...legendPart,
            series: [
                {
                    type: "pie",
                    name: first ? first.name : "",
                    radius: [...radius],
                    top: titleRoom + room.top,
                    ...(room.bottom ? { bottom: room.bottom } : {}),
                    ...(room.right ? { right: room.right } : {}),
                    data,
                    // on the slices: a label only where the slice is wide enough for it
                    ...(inside ? { minShowLabelAngle: 12, labelLine: { show: false } } : {}),
                    // inside, ECharts picks a colour that reads on each slice
                    label: { ...(inside ? {} : { color: theme.textColor }), ...pieLabel }
                }
            ]
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
            ...title,
            tooltip: { trigger: "item", valueFormatter },
            grid: { top: 16 + titleRoom, bottom: 64 },
            // no split areas: ECharts paints them light grey whatever the theme, so the empty cells
            // would be the brightest part of a dark chart; an empty cell shows the background
            // every column is labelled (interval 0): ECharts would otherwise hide every second name
            xAxis: { type: "category", data: columns.map((c) => c.name), axisLine, axisLabel: { ...axisText, interval: 0 }, splitArea: { show: false } },
            yAxis: { type: "category", data: s.categories, axisLine, axisLabel: { ...axisText }, splitArea: { show: false } },
            visualMap: {
                min: data.length ? min : 0,
                max: data.length ? max : 1,
                calculable: true,
                orient: "horizontal",
                left: "center",
                bottom: 0,
                textStyle,
                // the ends of the scale in the value's number format, as the cells and the tooltip
                formatter: (v) => (typeof v === "number" ? fmt(v) : String(v)),
                ...(theme.heatmapColors ? { inRange: { color: theme.heatmapColors } } : {})
            },
            // the numbers in the cells: by default while there are few enough cells
            series: [{ type: "heatmap", name: first ? first.name : "", data, label: { show: labels === "auto" ? data.length <= 200 : labels !== "off", formatter: (p) => fmt(p.value[2]) } }]
        };
    }

    // bar, line and area share the category axis
    const type = chart.type === "line" || chart.type === "area" ? "line" : "bar";
    const groups = groupAxisOf(s, result.view.rows.length, chart, { separator: options.separator ?? " / ", axisLine, theme });
    // with group labels the axis names each category by its inner levels, the group axis the outer one
    const categoryAxis = { type: "category", data: groups ? groups.leaves : s.categories, axisLine, axisLabel: { ...axisText } };
    const valueAxis = {
        type: "value",
        axisLine,
        axisLabel: { ...axisText, formatter: (v) => compact(v) },
        splitLine: { lineStyle: { color: theme.gridColor } }
    };
    // value labels: at the end of a bar, inside a stacked one, above a point of a line
    const showValues = labels !== "auto" && labels !== "off";
    const position = type === "line" ? "top" : chart.stacked ? "inside" : chart.horizontal ? "right" : "top";
    const valueLabel = showValues ? { label: { show: true, position, color: theme.textColor, formatter: (p) => (typeof p.value === "number" ? fmt(p.value) : "") } } : {};
    return {
        ...base,
        ...title,
        ...legendPart,
        tooltip: { trigger: "axis", valueFormatter },
        // room for the title and the legend; ECharts keeps its own defaults for the label margins
        grid: { top: 16 + titleRoom + room.top, ...(room.bottom ? { bottom: room.bottom + 8 } : {}), ...(room.right ? { right: room.right + 8 } : {}) },
        xAxis: chart.horizontal ? valueAxis : groups ? [categoryAxis, groups.axis] : categoryAxis,
        yAxis: chart.horizontal ? (groups ? [{ ...categoryAxis, inverse: true }, { ...groups.axis, inverse: true }] : { ...categoryAxis, inverse: true }) : valueAxis,
        series: s.series.map((x) => ({
            type,
            name: x.name,
            data: x.data,
            ...(chart.stacked ? { stack: "total" } : {}),
            ...(chart.type === "area" ? { areaStyle: {} } : {}),
            ...(type === "line" ? { connectNulls: false, smooth: Boolean(chart.smooth) } : {}),
            ...valueLabel
        }))
    };
}
