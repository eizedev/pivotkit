/*
 * A plain Apache ECharts option for bar, stacked bar, line, area, pie, donut and heatmap, from a pivot
 * and its chart data (chart-series.js). The core does not import ECharts; the UI passes the option to
 * its own ECharts instance. Only a drawn chart needs this module: pivotkit-react loads it with ECharts.
 */

import { colorLookup } from "./chart-colors.js";
import { extremePoints, referenceLines } from "./chart-lines.js";
import { lineLabelText } from "./chart-measure.js";
import { autoChartType, toSeries } from "./chart-series.js";
import { legendSelected, percentShares, stacksToPercent } from "./chart-stack.js";
import { DEFAULT_THEME, GRID_TOP, HEATMAP_GRID_BOTTOM } from "./defaults.js";
import { expect } from "./errors.js";
import { formatterFor } from "./format.js";
import { valueNames } from "./grid.js";
import { DEFAULT_LABELS } from "./labels.js";
import { isPivotResult } from "./pivot.js";
import { resolveLocale, optionsOf } from "./util.js";
import { SLICE_CHART_TYPES } from "./view.js";

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
 * @property {string} [referenceColor]  reference lines of no series (a target, a stack's total), default textColor
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
 * A plain ECharts option for the view's chart, themed by the host. The view's display settings
 * (chart.valueLabels, legend, title, smooth) are part of it, so an image of the chart shows them.
 * What the tooltip lists (chart.tooltip) is up to the UI's formatter (pivotkit-react's).
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
 * @param {Record<string, string>} [options.colorMap]  a fixed colour per series or slice name (hex,
 *   rgb(), hsl() or a CSS name); the view's chart.colors win over it
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
    // a share as the locale writes it ("12.5%", "12,5 %"): the tooltip's (not ECharts' own key)
    const shareFormatter = formatterFor("percent100:1", locale);
    // a fixed colour per series or slice by name: the view's, then the host's
    const colorOf = colorLookup(chart.colors, options.colorMap, theme.colors);
    // a pie's or heatmap's one series is named by the value it draws (the tooltip's title): with a field
    // on Columns the first series is the first column's, but a slice adds every column, a cell names its own
    const vi = first ? first.valueIndex : 0;
    const valueTitle = result.view.values[vi] ? valueNames(result.view.values, { ...DEFAULT_LABELS, ...(options.labels || {}) })[vi] : "";
    // the title over the chart, and the legend where the view puts it, with the room they take
    const title = typeof chart.title === "string" && chart.title.trim() ? { title: { text: chart.title.trim(), left: "center", top: 0, textStyle: { ...textStyle, fontSize: theme.titleSize ?? DEFAULT_THEME.titleSize, fontWeight: theme.strongWeight ?? DEFAULT_THEME.strongWeight } } } : {};
    const titleRoom = title.title ? roomOfTitle(theme.titleSize ?? DEFAULT_THEME.titleSize) : 0;
    const { legend, room } = legendOf(chart.legend, SLICE_CHART_TYPES.includes(chart.type) || s.series.length > 1, titleRoom, textStyle);
    // the hidden entries are unselected, also in a legend that is not shown (chart.hidden)
    const selected = legendSelected(chart.hidden);
    const legendPart = legend ? { legend: selected ? { ...legend, selected } : legend } : selected ? { legend: { show: false, selected } } : {};
    // what is written next to the marks: "percent" and "both" are a pie's; the other types write the value
    const labels = chart.valueLabels === "off" || chart.valueLabels === "value" || chart.valueLabels === "percent" || chart.valueLabels === "both" ? chart.valueLabels : "auto";

    if (SLICE_CHART_TYPES.includes(chart.type)) {
        const data = s.categories
            .map((name, i) => ({ name, value: s.totals[vi] ? s.totals[vi][i] : null }))
            .filter((d) => typeof d.value === "number" && d.value > 0)
            .map((d, i) => {
                const color = colorOf(d.name, i);
                return color ? { ...d, itemStyle: { color } } : d;
            });
        // the share as the locale writes it: "12.5%" in English, "12,5 %" in German
        const percent = (p) => shareFormatter(p.percent);
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
            tooltip: { trigger: "item", valueFormatter, shareFormatter },
            ...legendPart,
            series: [
                {
                    type: "pie",
                    name: valueTitle,
                    // the name of the slice that holds the smallest ones where their labels have no
                    // room (decorateOption); not ECharts' own key
                    otherName: options.labels?.otherSlices ?? DEFAULT_LABELS.otherSlices,
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

    if (chart.type === "treemap") {
        // one tile per category, its area its total (as a pie's slice), in its colour; no legend: each
        // tile is named on it. A tile hidden in Chart settings › Series is left out
        const hidden = Array.isArray(chart.hidden) ? chart.hidden : [];
        const palette = theme.colors ?? [];
        const data = s.categories
            .map((name, i) => ({ name, value: s.totals[vi] ? s.totals[vi][i] : null }))
            .filter((d) => typeof d.value === "number" && d.value > 0)
            .map((d, i) => {
                const color = colorOf(d.name, i) ?? (palette.length ? palette[i % palette.length] : null);
                return color ? { ...d, itemStyle: { color } } : d;
            })
            .filter((d) => !hidden.includes(d.name));
        return {
            ...base,
            ...title,
            tooltip: { trigger: "item", valueFormatter, shareFormatter },
            series: [
                {
                    type: "treemap",
                    name: valueTitle,
                    data,
                    // a flat map: no zoom into a tile, no path above it, a click opens nothing in ECharts
                    roam: false,
                    nodeClick: false,
                    breadcrumb: { show: false },
                    top: titleRoom + 8,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    // the name and the value on the tile; decorateOption gives each label the colour that reads on it
                    label: { show: labels !== "off", formatter: (p) => `${p.name}\n${fmt(p.value)}`, overflow: "truncate", fontSize: textStyle.fontSize },
                    upperLabel: { show: false },
                    itemStyle: { gapWidth: 2 }
                }
            ]
        };
    }

    if (chart.type === "heatmap") {
        const columns = s.series.filter((x) => x.valueIndex === vi);
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
            grid: { top: GRID_TOP + titleRoom, bottom: HEATMAP_GRID_BOTTOM },
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
            series: [{ type: "heatmap", name: valueTitle, data, label: { show: labels === "auto" ? data.length <= 200 : labels !== "off", formatter: (p) => fmt(p.value[2]) } }]
        };
    }

    // bar, line and area share the category axis
    const type = chart.type === "line" || chart.type === "area" ? "line" : "bar";
    // a combo: the first value's series as bars on the left axis, every other value's as lines on the
    // right one; with one value there is nothing for a line, and it draws bars
    const firstValue = first ? first.valueIndex : 0;
    const combo = chart.type === "combo" && s.series.some((x) => x.valueIndex !== firstValue);
    const typeOf = (/** @type {{ valueIndex: number }} */ x) => (combo ? (x.valueIndex === firstValue ? "bar" : "line") : type);
    const groups = groupAxisOf(s, result.view.rows.length, chart, { separator: options.separator ?? " / ", axisLine, theme });
    // with group labels the axis names each category by its inner levels, the group axis the outer one
    const categoryAxis = { type: "category", data: groups ? groups.leaves : s.categories, axisLine, axisLabel: { ...axisText } };
    const valueAxis = {
        type: "value",
        axisLine,
        axisLabel: { ...axisText, formatter: (v) => compact(v) },
        splitLine: { lineStyle: { color: theme.gridColor } }
    };
    // stacked to 100 %: each part as its share of the stack, the axis from 0 to 100 % (chart.stackPercent)
    const percent = stacksToPercent(chart);
    const shares = percent ? percentShares(s.series, new Set(chart.hidden)) : null;
    if (shares) {
        const whole = formatterFor("percent100:0", locale);
        Object.assign(valueAxis, { max: 100, min: shares.negative ? -100 : 0, axisLabel: { ...valueAxis.axisLabel, formatter: (v) => whole(v) } });
    }
    const stacked = !combo && (chart.stacked || percent);
    // value labels: at the end of a bar, inside a stacked one, above a point of a line
    const showValues = labels !== "auto" && labels !== "off";
    const position = type === "line" ? "top" : stacked ? "inside" : chart.horizontal && !combo ? "right" : "top";
    const valueLabel = showValues ? { label: { show: true, position, color: theme.textColor, formatter: (p) => (typeof p.value === "number" ? (percent ? shareFormatter(p.value) : fmt(p.value)) : "") } } : {};
    const marks = markLines(referenceLines(result, { chart, series: s, words: options.labels?.referenceLines, locale: options.locale }), s, { horizontal: Boolean(chart.horizontal), theme, short: (v) => compact(v), hidden: Array.isArray(chart.hidden) ? chart.hidden : [] });
    const points = markPoints(extremePoints(result, { chart, series: s, locale: options.locale }), s, { type, horizontal: Boolean(chart.horizontal), theme, colorOf, raised: showValues && !stacked, hidden: Array.isArray(chart.hidden) ? chart.hidden : [] });
    // the value axis reaches every line: a target past the tallest bar is drawn, not cut off.
    // dataMin and dataMax are ECharts' own (ECharts 6, scaleRawExtentInfo: they widen the data's
    // extent before the nice ticks), little documented: tests/browser/chart-lines.spec.js checks that a
    // target above every bar is inside the plot, so an ECharts update that drops them fails there
    if (marks.extent) {
        valueAxis.dataMin = marks.extent[0];
        valueAxis.dataMax = marks.extent[1];
    }
    return {
        ...base,
        ...title,
        ...legendPart,
        // the tooltip covers the category under the pointer; a UI's formatter narrows it to the element
        // under the pointer (chart.tooltip). The category lights up no bar: only the one under the
        // pointer does (decorateOption: a bar's focus is "self")
        // shareFormatter (not ECharts'): a share as the locale writes it, for the tooltip (chart.tooltipShare, a 100 % stack)
        tooltip: { trigger: "axis", valueFormatter, shareFormatter },
        ...(type === "bar" ? { axisPointer: { triggerEmphasis: false } } : {}),
        // room for the title and the legend; ECharts keeps its own defaults for the label margins
        grid: { top: GRID_TOP + titleRoom + room.top + marks.room, ...(room.bottom ? { bottom: room.bottom + 8 } : {}), ...(room.right ? { right: room.right + 8 } : {}) },
        xAxis: chart.horizontal && !combo ? valueAxis : groups ? [categoryAxis, groups.axis] : categoryAxis,
        yAxis: combo ? comboAxes(s, valueAxis, { theme, locale, colorOf, names: valueNames(result.view.values, { ...DEFAULT_LABELS, ...(options.labels || {}) }), firstValue }) : chart.horizontal ? (groups ? [{ ...categoryAxis, inverse: true }, { ...groups.axis, inverse: true }] : { ...categoryAxis, inverse: true }) : valueAxis,
        series: s.series.map((x, i) => {
            // a fixed colour (chart.colors, colorMap) for the bars, or the line and its fill
            const color = colorOf(x.name, i);
            const type = typeOf(x);
            return {
                type,
                ...(combo && type === "line" ? { yAxisIndex: 1 } : {}),
                name: x.name,
                // a 100 % stack's parts are { value: share, raw: value }
                data: shares ? shares.data[i] : x.data,
                ...(stacked ? { stack: "total" } : {}),
                ...(color ? { itemStyle: { color }, ...(type === "line" ? { lineStyle: { color } } : {}) } : {}),
                ...(chart.type === "area" ? { areaStyle: color ? { color } : {} } : {}),
                ...(type === "line" ? { connectNulls: false, smooth: Boolean(chart.smooth) } : {}),
                ...valueLabel,
                ...(marks.bySeries[i] ? { markLine: { silent: true, symbol: ["none", "none"], data: marks.bySeries[i] } } : {}),
                ...(points[i] ? { markPoint: { silent: true, symbol: "circle", symbolSize: POINT_SIZE, data: points[i] } } : {})
            };
        })
    };
}

/**
 * How each kind of reference line is drawn: an average dashed, a trend dotted, a target solid. The
 * labels of lying lines go right of the plot (decorateOption keeps them apart and makes room for
 * them); on horizontal bars the lines stand upright, and their labels go above the plot, one row
 * each (markLines' `room`).
 */
const LINE_TYPES = Object.freeze({ average: "dashed", trend: "dotted", target: "solid" });
/** Room (px) between a label above the plot and the plot, and between two rows of them. */
const LABEL_GAP = 6;

/**
 * The reference lines as ECharts markLine data, by the series that draws them: a series' own lines on
 * it, in its colour; the lines of no series (a target, a stack's total) on the last series shown,
 * drawn above every mark, in the theme's reference colour. Silent: a line is no element to point at; the
 * tooltip names its value. A trend is drawn from category to category, at its value at each: over
 * real time with a gap it bends where the axis leaves the gap out. A label writes the name and the
 * value as the value axis does (`short`); each item's `name` is the line's name alone, for a chart too
 * narrow for the value. `extent`: the lowest and highest value of the lines, for the value axis;
 * `room`: the height (px) the labels of upright lines take above the plot.
 * @param {import("./chart-lines.js").ReferenceLine[]} lines
 * @param {ReturnType<typeof toSeries>} s
 * @param {{ horizontal: boolean, theme: ChartTheme, short: (v: number) => string, hidden: string[] }} how
 *   hidden: the series the legend hides (chart.hidden); ECharts hides a series' markLine with it
 */
function markLines(lines, s, { horizontal, theme, short, hidden }) {
    /** @type {any[][]} */
    const bySeries = s.series.map(() => []);
    // the lines of no series go on the last series shown; with none shown, nowhere
    const shown = s.series.map((x, i) => (hidden.includes(x.name) ? -1 : i)).filter((i) => i >= 0);
    const holder = shown.length ? shown[shown.length - 1] : -1;
    const values = [];
    const value = horizontal ? "xAxis" : "yAxis";
    const fontSize = theme.textSize ?? DEFAULT_THEME.textSize;
    let rows = 0;
    // a point of a trend: [category, value], or [value, category] along a horizontal chart
    const point = (category, v) => ({ coord: horizontal ? [v, category] : [category, v] });
    for (const line of lines) {
        const own = line.series !== null ? s.series[line.series] : undefined;
        const text = line.kind === "trend" ? line.name : `${line.name} ${short(/** @type {number} */ (line.value))}`;
        // upright lines: the labels in rows above the plot (the category axis runs downwards, so a
        // line starts at the top), the first row nearest to it; lying ones right of the plot
        const where = horizontal ? { position: "start", distance: [0, LABEL_GAP + rows * (fontSize + LABEL_GAP)] } : { position: "end", distance: LABEL_GAP };
        rows += 1;
        // the line's colour: its series' (the palette's, as ECharts picks it), else the reference colour
        const colors = theme.colors ?? [];
        const color = own ? colors[/** @type {number} */ (line.series) % Math.max(1, colors.length)] : (theme.referenceColor ?? theme.textColor);
        const type = LINE_TYPES[line.kind];
        const style = {
            name: line.name,
            lineStyle: { type, width: 1.5, ...(own ? {} : { color }) },
            // the words in the text colour, after a sample of the line's dash in its colour
            label: { formatter: () => lineLabelText(type, text), rich: { s: { ...(color ? { color } : {}), fontSize } }, ...where, color: theme.textColor, fontSize }
        };
        const target = bySeries[own ? /** @type {number} */ (line.series) : holder];
        if (line.kind === "trend") {
            const first = /** @type {number} */ (line.first);
            const last = /** @type {number} */ (line.last);
            const at = /** @type {(i: number) => number} */ (line.at);
            // over the categories' order the line is straight: one segment
            const step = line.byTime ? 1 : last - first;
            for (let i = first; i < last; i += step) {
                // the label on the last part only
                const part = i + step === last ? style : { ...style, label: { ...style.label, show: false } };
                target?.push([{ ...point(i, at(i)), ...part }, point(i + step, at(i + step))]);
                values.push(at(i));
            }
            values.push(at(last));
        } else {
            target?.push({ [value]: line.value, ...style });
            values.push(/** @type {number} */ (line.value));
        }
    }
    return { bySeries: bySeries.map((d) => (d.length ? d : null)), extent: values.length ? [Math.min(...values), Math.max(...values)] : null, room: horizontal && rows ? rows * (fontSize + LABEL_GAP) + LABEL_GAP : 0 };
}

/** The size (px) of a high or low point's dot: a little larger than a line's points (7 px). */
const POINT_SIZE = 10;
/** The glyphs of a high and a low point: they say which one it is without colour. */
export const POINT_GLYPHS = Object.freeze({ max: "\u25B2", min: "\u25BC" });

/**
 * The high and low points as ECharts markPoint data, by the series that draws them: a series' own on
 * it; a stack's total's on the last series shown, in the theme's reference colour. Each is a dot in its
 * series' colour (chart.colors, colorMap, else the palette's) and a label: the glyph (▲, ▼) in that
 * colour, the value in the text colour, which reads on every background (a palette colour such as
 * yellow does not, as text). A line's highest label goes above its dot, its lowest below; a bar's past
 * its end, where nothing else is drawn, above any value label there (`raised`). decorateOption keeps
 * the labels inside the plot and apart.
 * @param {import("./chart-lines.js").ExtremePoint[]} points
 * @param {ReturnType<typeof toSeries>} s
 * @param {{ type: string, horizontal: boolean, theme: ChartTheme, colorOf: (name: string, i: number) => string | undefined, raised: boolean, hidden: string[] }} how
 *   hidden: the series the legend hides (chart.hidden): a stack's total sits on the top one shown
 * @returns {(any[] | null)[]}
 */
function markPoints(points, s, { type, horizontal, theme, colorOf, raised, hidden }) {
    /** @type {any[][]} */
    const bySeries = s.series.map(() => []);
    const fontSize = theme.textSize ?? DEFAULT_THEME.textSize;
    const colors = theme.colors ?? [];
    for (const p of points) {
        const own = p.series !== null;
        // a stack's total goes on its top part: the last series with a value there
        const holder = own ? /** @type {number} */ (p.series) : lastWith(s, p.index, hidden);
        if (holder < 0) continue;
        const color = own ? (colorOf(s.series[holder].name, holder) ?? colors[holder % Math.max(1, colors.length)]) : (theme.referenceColor ?? theme.textColor);
        const below = type === "line" && p.kind === "min";
        const position = horizontal ? (p.value < 0 ? "left" : "right") : below || (type === "bar" && p.value < 0) ? "bottom" : "top";
        const label = `${p.format(p.value)}`;
        bySeries[holder].push({
            name: p.kind,
            // the label's words without its markup: decorateOption measures them
            text: `${POINT_GLYPHS[p.kind]} ${label}`,
            coord: horizontal ? [p.value, p.index] : [p.index, p.value],
            value: p.value,
            ...(color ? { itemStyle: { color } } : {}),
            label: {
                show: true,
                position,
                distance: raised && !below ? fontSize + 10 : 6,
                formatter: () => `{s|${POINT_GLYPHS[p.kind]}} ${label}`,
                rich: { s: { ...(color ? { color } : {}), fontSize } },
                color: theme.textColor,
                fontSize
            }
        });
    }
    return bySeries.map((d) => (d.length ? d : null));
}

/** The last series shown with a value at category `i`, -1 for none: the top of a stack there. */
function lastWith(s, i, hidden) {
    for (let k = s.series.length - 1; k >= 0; k--) {
        if (typeof s.series[k].data[i] === "number" && !hidden.includes(s.series[k].name)) return k;
    }
    return -1;
}

/**
 * A combo chart's two value axes: the bars' on the left, the lines' on the right, each named after its
 * values with a sample (■) in the colour of its first series, so an axis and its marks belong together.
 * The right axis writes its numbers in the lines' format and draws no grid lines of its own.
 * @param {ReturnType<typeof toSeries>} s
 * @param {any} left  the value axis as the other types draw it
 * @param {{ theme: ChartTheme, locale: string, colorOf: (name: string, i: number) => string | null, names: string[], firstValue: number }} how
 */
function comboAxes(s, left, { theme, locale, colorOf, names, firstValue }) {
    const colors = theme.colors ?? [];
    const colorAt = (/** @type {number} */ i) => (i < 0 ? undefined : (colorOf(s.series[i].name, i) ?? colors[i % Math.max(1, colors.length)]));
    const lineAt = s.series.findIndex((x) => x.valueIndex !== firstValue);
    const lineValues = [...new Set(s.series.filter((x) => x.valueIndex !== firstValue).map((x) => x.valueIndex))];
    const fontSize = theme.textSize ?? DEFAULT_THEME.textSize;
    const named = (/** @type {string} */ text, /** @type {string | undefined} */ color, /** @type {"left" | "right"} */ align) => ({
        name: `{s|\u25A0} ${text}`,
        nameLocation: "end",
        nameTextStyle: { color: theme.textColor, fontSize, align, rich: { s: { ...(color ? { color } : {}), fontSize } } }
    });
    const format = s.series[lineAt]?.format ?? "number";
    const short = formatterFor(/^percent/.test(format) ? format : "compact", locale);
    return [
        { ...left, position: "left", ...named(names[firstValue] ?? "", colorAt(0), "left") },
        { ...left, position: "right", axisLabel: { ...left.axisLabel, formatter: (/** @type {number} */ v) => short(v) }, splitLine: { show: false }, ...named(lineValues.map((v) => names[v]).join(", "), colorAt(lineAt), "right") }
    ];
}
