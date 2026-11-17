/*
 * A chart's reference lines (chart.referenceLines): the average of each series, a linear trend and a
 * target, as numbers. Which chart gets which line is decided here once (referenceLineRules), for the
 * ECharts option (chart.js), the UI's menu, tooltip and text summary, and the report's SVG.
 *
 * - Pie, donut and heatmap have no value axis: no lines.
 * - Bars, lines and areas side by side: an average and a trend per series, over its plotted points.
 * - Stacked: the lines of the stack's total, the sum of its drawn parts, and only when every value
 *   adds up (a sum or a count). A stack of averages has a height that means nothing: no line at all.
 * - A trend only where the categories are points in time in their own order: every row field a date
 *   or a grouping along the time line, none sorted by a value or by hand.
 *
 * Internal: pivotkit-core's chart.js and the repository's packages use it (pivotkit-core/internal).
 */

import { AGGREGATORS } from "./aggregators.js";
import { autoChartType, toSeries } from "./chart-series.js";
import { TIMELINE_UNITS } from "./derive.js";
import { DEFAULT_LABELS } from "./labels.js";
import { SHOW_AS } from "./show-as.js";
import { SLICE_CHART_TYPES } from "./view.js";

/** The line kinds in the order a chart draws, a tooltip lists and a summary names them. */
export const REFERENCE_LINE_KINDS = Object.freeze(["average", "trend", "target"]);

/**
 * Whether a value's results add up across a category's series, so a stack of them has a total: an
 * additive aggregator (sum, count), shown as itself or as a show-as type that adds up (SHOW_AS
 * addsUp; one that walks an axis only along the rows, the chart's categories).
 * @param {{ agg?: string, showAs?: { type: string, axis?: string } | null } | undefined} value  the view's value
 */
export function valueAddsUp(value) {
    if (!value || typeof value.agg !== "string" || !Object.hasOwn(AGGREGATORS, value.agg) || !AGGREGATORS[value.agg].additive) {
        return false;
    }
    const showAs = value.showAs;
    if (!showAs) {
        return true;
    }
    const def = Object.hasOwn(SHOW_AS, showAs.type) ? SHOW_AS[showAs.type] : null;
    return Boolean(def && def.addsUp && (!def.alongAxis || showAs.axis === "rows"));
}

/**
 * Whether a view's categories are points in time in their own order: every row field a date or a
 * grouping of one along the time line, none sorted by a value or by hand.
 * @param {{ rows: string[], derived: any[], sort: any[] }} view  a normalized view
 * @param {import("./encode.js").Encoded} encoded
 */
function timeLine(view, encoded) {
    const key = (name) => String(name).toLowerCase();
    const isTime = (name) => {
        const d = view.derived.find((x) => key(x.name) === key(name));
        return d ? TIMELINE_UNITS.includes(d.by) && encoded.column(d.field)?.type === "date" : encoded.column(name)?.type === "date";
    };
    const ordered = (name) => !view.sort.some((s) => key(s.field) === key(name) && s.by !== "label");
    return view.rows.length > 0 && view.rows.every((name) => isTime(name) && ordered(name));
}

/**
 * Which reference lines a chart can draw for a view (see the top of this module). A setting that is
 * off here stays in the view: it draws again when the chart can.
 * @param {{ rows: string[], derived: any[], sort: any[], values: any[] }} view  a normalized view
 * @param {{ type: string, stacked?: boolean }} chart  what is drawn: chartPlan's chart, never "auto"
 * @param {import("./encode.js").Encoded} encoded
 * @returns {{ average: boolean, trend: boolean, target: boolean }}
 */
export function referenceLineRules(view, chart, encoded) {
    const axis = chart.type === "bar" || chart.type === "line" || chart.type === "area";
    const counted = axis && !SLICE_CHART_TYPES.includes(chart.type) && (!chart.stacked || view.values.every(valueAddsUp));
    return { average: counted, trend: counted && timeLine(view, encoded), target: counted };
}

/**
 * The least-squares line through the points (index, value) of the plotted values; null below two.
 * @param {(number | null)[]} values
 */
function fit(values) {
    const points = values.flatMap((v, i) => (typeof v === "number" ? [[i, v]] : []));
    if (points.length < 2) {
        return null;
    }
    const mean = (k) => points.reduce((sum, p) => sum + p[k], 0) / points.length;
    const mx = mean(0);
    const my = mean(1);
    const sxx = points.reduce((sum, [x]) => sum + (x - mx) ** 2, 0);
    const slope = points.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0) / sxx;
    const at = (/** @type {number} */ i) => my + slope * (i - mx);
    const first = points[0][0];
    const last = points[points.length - 1][0];
    return { first, last, from: at(first), to: at(last), at };
}

/** The mean of the plotted values, null without one. */
function average(values) {
    const plotted = values.filter((v) => typeof v === "number");
    return plotted.length ? plotted.reduce((a, b) => a + b, 0) / plotted.length : null;
}

/**
 * @typedef {object} ReferenceLine
 * @property {"average" | "trend" | "target"} kind
 * @property {number | null} series  the series' index in the chart data; null for a target or a stack's total
 * @property {string} name  its word from the labels ("Average")
 * @property {number} [value]  an average's or a target's
 * @property {number} [first]  a trend's first and last category
 * @property {number} [last]
 * @property {number} [from]  a trend's value at its first and last category
 * @property {number} [to]
 * @property {(index: number) => number} [at]  a trend's value at a category
 */

/**
 * A chart's reference lines as numbers: the view's chart.referenceLines that referenceLineRules
 * allows, over the plotted categories (the chart data, toSeries). Averages first, then trends, each
 * per series in their order (a stack: one of its total), then the target.
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ chart?: { type: string, stacked?: boolean }, series?: { series: { data: (number | null)[] }[] }, words?: Partial<Record<"average" | "trend" | "target", string>> }} [options]
 *   chart: what is drawn (chartPlan's), default the view's; series: toSeries of the same result
 *   (the plotted categories), default made here; words: the lines' names (Labels.referenceLines)
 * @returns {ReferenceLine[]}
 */
export function referenceLines(result, { chart, series, words } = {}) {
    const view = result.view;
    const setting = view.chart.referenceLines;
    const drawn = chart ?? (view.chart.type === "auto" ? { ...view.chart, type: autoChartType(view, result.encoded) } : view.chart);
    if (!setting || (!setting.average && !setting.trend && setting.target === null)) {
        return [];
    }
    const rules = referenceLineRules(view, drawn, result.encoded);
    const names = { ...DEFAULT_LABELS.referenceLines, ...words };
    const name = (/** @type {"average" | "trend" | "target"} */ kind) => names[kind];
    // a stack's lines are of its total: the sum of the parts at each category that has one
    const parts = (series ?? toSeries(result)).series;
    const total = parts.length ? parts[0].data.map((_, i) => parts.reduce((sum, s) => (typeof s.data[i] === "number" ? (sum ?? 0) + s.data[i] : sum), /** @type {number | null} */ (null))) : [];
    const lists = drawn.stacked ? [{ series: null, data: total }] : parts.map((s, i) => ({ series: /** @type {number | null} */ (i), data: s.data }));
    /** @type {ReferenceLine[]} */
    const lines = [];
    if (setting.average && rules.average) {
        for (const l of lists) {
            const value = average(l.data);
            if (value !== null) {
                lines.push({ kind: "average", series: l.series, name: name("average"), value });
            }
        }
    }
    if (setting.trend && rules.trend) {
        for (const l of lists) {
            const line = fit(l.data);
            if (line) {
                lines.push({ kind: "trend", series: l.series, name: name("trend"), ...line });
            }
        }
    }
    if (typeof setting.target === "number" && rules.target) {
        lines.push({ kind: "target", series: null, name: name("target"), value: setting.target });
    }
    return lines;
}
