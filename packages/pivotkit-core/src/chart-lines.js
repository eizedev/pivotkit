/*
 * A chart's reference lines (chart.referenceLines) as numbers: the average of each series, a linear
 * trend and a target, and the high and low points of each series (extremePoints), where
 * chart-plan.js's referenceLineRules and the numbers allow them (referenceLineChecks). The ECharts
 * option (chart.js), the UI's tooltip and text summary and the report's SVG read them from here. Only
 * a drawn chart needs it: the entry point "pivotkit-core/chart" exports it.
 */

import { referenceLineRules, stacksToPercent } from "./chart-plan.js";
import { autoChartType, toSeries } from "./chart-series.js";
import { formatterFor } from "./format.js";
import { DEFAULT_LABELS } from "./labels.js";
import { MS_PER_DAY, periodOf, resolveLocale } from "./util.js";

/** A week in ms. */
const WEEK = 7 * MS_PER_DAY;

/** The ms of the Monday of ISO week `week` of `year`: week 1 holds the year's 4 January. */
function isoWeekStart(year, week) {
    const jan4 = new Date(Date.UTC(2000, 0, 4));
    jan4.setUTCFullYear(year);
    return jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * MS_PER_DAY + (week - 1) * WEEK;
}

/**
 * Each category's place in time, in the unit of its innermost row field (months for months, days for
 * days), from its key: so a gap of 8 months counts as 8. null when a category has no date (a blank,
 * a collapsed group) or the field is no time line: the trend then counts the categories' order.
 * @param {{ rows: string[], derived: any[] }} view
 * @param {import("./encode.js").Encoded} encoded
 * @param {any[][] | undefined} paths  toSeries' categoryPaths
 * @returns {number[] | null}
 */
function timesOf(view, encoded, paths) {
    const field = view.rows[view.rows.length - 1];
    if (!paths || field === undefined) {
        return null;
    }
    const key = String(field).toLowerCase();
    const derived = view.derived.find((d) => String(d.name).toLowerCase() === key);
    const by = derived ? derived.by : encoded.column(field)?.type === "date" ? "day" : null;
    /** @type {Record<string, (k: number) => number>} */
    const place = {
        year: (k) => k,
        yearQuarter: (k) => Math.floor(k / 10) * 4 + periodOf(k, 10),
        yearMonth: (k) => Math.floor(k / 100) * 12 + periodOf(k, 100),
        yearWeek: (k) => isoWeekStart(Math.floor(k / 100), periodOf(k, 100)) / WEEK,
        day: (k) => k / MS_PER_DAY
    };
    if (!by || !Object.hasOwn(place, by)) {
        return null;
    }
    const times = paths.map((p) => (p.length === view.rows.length && typeof p[p.length - 1] === "number" ? place[by](p[p.length - 1]) : null));
    return times.every((t) => typeof t === "number" && Number.isFinite(t)) ? /** @type {number[]} */ (times) : null;
}

/**
 * The least-squares line through the plotted values at their places (`times`, else their index);
 * null below two points. `at(i)`: its value at category i.
 * @param {(number | null)[]} values
 * @param {number[] | null} times
 */
function fit(values, times) {
    const x = (/** @type {number} */ i) => (times ? times[i] : i);
    const points = values.flatMap((v, i) => (typeof v === "number" ? [[x(i), v, i]] : []));
    if (points.length < 2) {
        return null;
    }
    const mean = (k) => points.reduce((sum, p) => sum + p[k], 0) / points.length;
    const mx = mean(0);
    const my = mean(1);
    const sxx = points.reduce((sum, [px]) => sum + (px - mx) ** 2, 0);
    if (sxx === 0) {
        return null;
    }
    const slope = points.reduce((sum, [px, py]) => sum + (px - mx) * (py - my), 0) / sxx;
    const at = (/** @type {number} */ i) => my + slope * (x(i) - mx);
    const first = points[0][2];
    const last = points[points.length - 1][2];
    return { first, last, from: at(first), to: at(last), at };
}

/**
 * Which reference lines a drawn chart can draw, and why the others are off (`notes`): the view's
 * rules (referenceLineRules) and what depends on the numbers. The notes:
 * - "percentStack": a stack to 100 % has the same height everywhere (chart.stackPercent).
 * - "noTotal": a stack of values that do not add up has no total.
 * - "negative": a stack with a part below zero has no single total: no average or trend of it.
 * - "noTime": a trend needs a time line on Rows in its own order.
 * - "byIndex": a category without a date (a blank) puts the trend on the categories' order.
 * - "mixedUnits": a target over values in different units (counts beside a field's values, or
 *   another format) fits none of them.
 * Series hidden in the legend (chart.hidden) do not count. Pie, donut and heatmap: no lines, no notes.
 * The high and low points (extremes) follow the average: a stack below zero has no total to mark.
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ chart?: { type: string, stacked?: boolean, stackPercent?: boolean, hidden?: string[], referenceLines?: object | null }, series?: { series: { name: string, data: (number | null)[], format: string }[], categoryPaths?: any[][] } }} [options]
 *   chart: what is drawn (chartPlan's), over the view's; series: toSeries of the same result
 * @returns {{ average: boolean, trend: boolean, target: boolean, extremes: boolean, notes: string[] }}
 */
export function referenceLineChecks(result, { chart, series } = {}) {
    const view = result.view;
    const merged = { ...view.chart, ...(chart ?? {}) };
    const drawn = merged.type === "auto" ? { ...merged, type: autoChartType(view, result.encoded) } : merged;
    const rules = referenceLineRules(view, drawn, result.encoded);
    if (drawn.type !== "bar" && drawn.type !== "line" && drawn.type !== "area") {
        return { ...rules, notes: [] };
    }
    if (!rules.average) {
        return { ...rules, notes: [stacksToPercent(drawn) ? "percentStack" : "noTotal"] };
    }
    const s = series ?? toSeries(result);
    const hidden = Array.isArray(drawn.hidden) ? drawn.hidden : [];
    const shown = s.series.filter((x) => !hidden.includes(x.name));
    const negative = Boolean(drawn.stacked) && shown.some((x) => x.data.some((v) => typeof v === "number" && v < 0));
    const byIndex = rules.trend && !negative && !timesOf(view, result.encoded, s.categoryPaths);
    // one unit: one format, and not counts (count, countUnique) beside a field's values
    const counts = new Set(view.values.map((v) => v.agg === "count" || v.agg === "countUnique"));
    const target = rules.target && counts.size < 2 && new Set(shown.map((x) => x.format)).size < 2;
    const notes = [negative ? "negative" : !rules.trend ? "noTime" : byIndex ? "byIndex" : "", target ? "" : "mixedUnits"].filter(Boolean);
    return { average: !negative, trend: rules.trend && !negative, target, extremes: !negative, notes };
}

/** The mean of the plotted values, null without one. */
function average(values) {
    const plotted = values.filter((v) => typeof v === "number");
    return plotted.length ? plotted.reduce((a, b) => a + b, 0) / plotted.length : null;
}

/**
 * What the lines and points of a chart are measured on: the series drawn (one hidden in the legend,
 * chart.hidden, has none and is no part of a stack), each as its own list, or a stack's total as one
 * (the sum of its drawn parts at each category that has one); what the chart can draw
 * (referenceLineChecks); and each list's format (a stack's: the first part's), where a plain number's
 * own count of decimals ("number:0", "integer") gives way to "number": an average of whole numbers
 * keeps its decimals. `own`: the format as it is, for a value of the data (a high or low point).
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ chart?: object, series?: any, locale?: string }} options  as referenceLines'
 */
function drawnSeries(result, { chart, series, locale }) {
    const view = result.view;
    // what is drawn: the caller's (chartPlan's) over the view's own, which carries the hidden series
    const merged = { ...view.chart, ...(chart ?? {}) };
    const drawn = merged.type === "auto" ? { ...merged, type: autoChartType(view, result.encoded) } : merged;
    const s = series ?? toSeries(result);
    const rules = referenceLineChecks(result, { chart: drawn, series: s });
    const hidden = Array.isArray(/** @type {any} */ (drawn).hidden) ? /** @type {any} */ (drawn).hidden : [];
    const parts = s.series.map((x, i) => ({ ...x, index: i })).filter((x) => !hidden.includes(x.name));
    /** @param {number} i */
    const totalAt = (i) => {
        /** @type {number | null} */
        let sum = null;
        for (const part of parts) {
            const v = part.data[i];
            if (typeof v === "number") {
                sum = (sum ?? 0) + v;
            }
        }
        return sum;
    };
    const total = parts.length ? parts[0].data.map((_, i) => totalAt(i)) : [];
    /** @type {{ series: number | null, data: (number | null)[] }[]} */
    const lists = drawn.stacked ? [{ series: null, data: total }] : parts.map((x) => ({ series: x.index, data: x.data }));
    const lang = resolveLocale(view.formatting.locale, locale ?? result.locale);
    const formatOf = (/** @type {number | null} */ i, own = false) => {
        const format = (i === null ? parts[0] : s.series[i])?.format ?? "number";
        return formatterFor(!own && /^(?:number|integer)(?::\d+)?$/.test(format) ? "number" : format, lang);
    };
    return { view, s, rules, lists, formatOf };
}

/**
 * The reference lines a chart draws: the caller's chart's referenceLines (toEChartsOption's `chart`
 * option over the view's) as a whole, else the view's. Inside it, a setting left out is off; null
 * switches every line off.
 * @param {import("./pivot.js").PivotResult} result
 * @param {any} chart  what is drawn, as referenceLines takes it
 * @returns {{ average: boolean, trend: boolean, target: number | null, extremes: boolean } | null}
 */
function settingOf(result, chart) {
    const own = chart && typeof chart === "object" && chart.referenceLines !== undefined ? chart.referenceLines : result.view.chart.referenceLines;
    return own && typeof own === "object" ? { average: false, trend: false, target: null, extremes: false, ...own } : null;
}

/**
 * @typedef {object} ExtremePoint
 * @property {"max" | "min"} kind  the highest or the lowest value
 * @property {number | null} series  the series' index in the chart data; null for a stack's total
 * @property {number} index  the category it is at: the first of equal ones
 * @property {number} value
 * @property {(value: number) => string} format  writes the value as its series does, with its decimals
 */

/**
 * The high and low points of a chart (chart.referenceLines.extremes, the caller's chart's, else
 * the view's): each drawn series' highest and
 * lowest value, or a stack's total's, where the chart draws them (referenceLineChecks: where it draws
 * an average). Per series in their order, the highest first. A list whose values are all the same (or
 * one value) has no point: there is nothing to tell apart.
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ chart?: { type: string, stacked?: boolean, stackPercent?: boolean, hidden?: string[], referenceLines?: object | null }, series?: { series: { name: string, data: (number | null)[], format: string }[], categoryPaths?: any[][] }, locale?: string }} [options]
 *   as referenceLines'
 * @returns {ExtremePoint[]}
 */
export function extremePoints(result, { chart, series, locale } = {}) {
    if (!settingOf(result, chart)?.extremes) {
        return [];
    }
    const { rules, lists, formatOf } = drawnSeries(result, { chart, series, locale });
    if (!rules.extremes) {
        return [];
    }
    /** @type {ExtremePoint[]} */
    const points = [];
    for (const l of lists) {
        let max = -1;
        let min = -1;
        l.data.forEach((v, i) => {
            if (typeof v !== "number") {
                return;
            }
            if (max < 0 || v > /** @type {number} */ (l.data[max])) {
                max = i;
            }
            if (min < 0 || v < /** @type {number} */ (l.data[min])) {
                min = i;
            }
        });
        if (max >= 0 && l.data[max] !== l.data[min]) {
            const format = formatOf(l.series, true);
            points.push({ kind: "max", series: l.series, index: max, value: /** @type {number} */ (l.data[max]), format });
            points.push({ kind: "min", series: l.series, index: min, value: /** @type {number} */ (l.data[min]), format });
        }
    }
    return points;
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
 * @property {(index: number) => number} [at]  a trend's value at a category: a straight line over
 *   the categories' real time (months, days), else over their order
 * @property {boolean} [byTime]  a trend over the categories' real time; false: over their order
 * @property {(value: number) => string} format  writes a value of the line: its series' format (a
 *   stack's or a target's: the first series'), and a plain number keeps its decimals
 */

/**
 * A chart's reference lines as numbers: chart.referenceLines (the caller's chart's, else the
 * view's) that referenceLineRules allows, over the plotted categories (the chart data, toSeries). Averages first, then trends, each
 * per series in their order (a stack: one of its total), then the target.
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ chart?: { type: string, stacked?: boolean, stackPercent?: boolean, hidden?: string[], referenceLines?: object | null }, series?: { series: { name: string, data: (number | null)[], format: string }[], categoryPaths?: any[][] }, words?: Partial<Record<"average" | "trend" | "target", string>>, locale?: string }} [options]
 *   chart: what is drawn (chartPlan's, with the series hidden in the legend), default the view's; series: toSeries of the same result
 *   (the plotted categories), default made here; words: the lines' names (Labels.referenceLines);
 *   locale: used when the view names none, default the pivot's
 * @returns {ReferenceLine[]}
 */
export function referenceLines(result, { chart, series, words, locale } = {}) {
    const setting = settingOf(result, chart);
    if (!setting || (!setting.average && !setting.trend && setting.target === null)) {
        return [];
    }
    const { view, s, rules, lists, formatOf } = drawnSeries(result, { chart, series, locale });
    const names = { ...DEFAULT_LABELS.referenceLines, ...words };
    const name = (/** @type {"average" | "trend" | "target"} */ kind) => names[kind];
    const times = rules.trend ? timesOf(view, result.encoded, s.categoryPaths) : null;
    /** @type {ReferenceLine[]} */
    const lines = [];
    if (setting.average && rules.average) {
        for (const l of lists) {
            const value = average(l.data);
            if (value !== null) {
                lines.push({ kind: "average", series: l.series, name: name("average"), value, format: formatOf(l.series) });
            }
        }
    }
    if (setting.trend && rules.trend) {
        for (const l of lists) {
            const line = fit(l.data, times);
            if (line) {
                lines.push({ kind: "trend", series: l.series, name: name("trend"), ...line, byTime: times !== null, format: formatOf(l.series) });
            }
        }
    }
    if (typeof setting.target === "number" && rules.target) {
        lines.push({ kind: "target", series: null, name: name("target"), value: setting.target, format: formatOf(null) });
    }
    return lines;
}
