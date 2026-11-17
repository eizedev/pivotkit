/*
 * A chart's reference lines (chart.referenceLines) as numbers: the average of each series, a linear
 * trend and a target, where chart-plan.js's referenceLineRules and the numbers allow them
 * (referenceLineChecks). The ECharts option
 * (chart.js), the UI's tooltip and text summary and the report's SVG read them from here. Only a drawn
 * chart needs it: the entry point "pivotkit-core/chart" exports it.
 */

import { referenceLineRules } from "./chart-plan.js";
import { autoChartType, toSeries } from "./chart-series.js";
import { formatterFor } from "./format.js";
import { DEFAULT_LABELS } from "./labels.js";
import { resolveLocale } from "./util.js";

/** A day and a week in ms. */
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** The ms of the Monday of ISO week `week` of `year`: week 1 holds the year's 4 January. */
function isoWeekStart(year, week) {
    const jan4 = new Date(Date.UTC(2000, 0, 4));
    jan4.setUTCFullYear(year);
    return jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY + (week - 1) * WEEK;
}

/** `key`'s place in its period: the month of a yearMonth (base 100), the quarter of a yearQuarter (10). */
const periodOf = (key, base) => key - Math.floor(key / base) * base;

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
        day: (k) => k / DAY
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
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ chart?: { type: string, stacked?: boolean, stackPercent?: boolean, hidden?: string[] }, series?: { series: { name: string, data: (number | null)[], format: string }[], categoryPaths?: any[][] } }} [options]
 *   chart: what is drawn (chartPlan's), over the view's; series: toSeries of the same result
 * @returns {{ average: boolean, trend: boolean, target: boolean, notes: string[] }}
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
        return { ...rules, notes: [drawn.stackPercent ? "percentStack" : "noTotal"] };
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
    return { average: !negative, trend: rules.trend && !negative, target, notes };
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
 * @property {(index: number) => number} [at]  a trend's value at a category: a straight line over
 *   the categories' real time (months, days), else over their order
 * @property {boolean} [byTime]  a trend over the categories' real time; false: over their order
 * @property {(value: number) => string} format  writes a value of the line: its series' format (a
 *   stack's or a target's: the first series'), and a plain number keeps its decimals
 */

/**
 * A chart's reference lines as numbers: the view's chart.referenceLines that referenceLineRules
 * allows, over the plotted categories (the chart data, toSeries). Averages first, then trends, each
 * per series in their order (a stack: one of its total), then the target.
 * @param {import("./pivot.js").PivotResult} result
 * @param {{ chart?: { type: string, stacked?: boolean, stackPercent?: boolean, hidden?: string[] }, series?: { series: { name: string, data: (number | null)[], format: string }[], categoryPaths?: any[][] }, words?: Partial<Record<"average" | "trend" | "target", string>>, locale?: string }} [options]
 *   chart: what is drawn (chartPlan's, with the series hidden in the legend), default the view's; series: toSeries of the same result
 *   (the plotted categories), default made here; words: the lines' names (Labels.referenceLines);
 *   locale: used when the view names none, default the pivot's
 * @returns {ReferenceLine[]}
 */
export function referenceLines(result, { chart, series, words, locale } = {}) {
    const view = result.view;
    const setting = view.chart.referenceLines;
    // what is drawn: the caller's (chartPlan's) over the view's own, which carries the hidden series
    const merged = { ...view.chart, ...(chart ?? {}) };
    const drawn = merged.type === "auto" ? { ...merged, type: autoChartType(view, result.encoded) } : merged;
    if (!setting || (!setting.average && !setting.trend && setting.target === null)) {
        return [];
    }
    const s = series ?? toSeries(result);
    const rules = referenceLineChecks(result, { chart: drawn, series: s });
    const names = { ...DEFAULT_LABELS.referenceLines, ...words };
    const name = (/** @type {"average" | "trend" | "target"} */ kind) => names[kind];
    // the series drawn: one hidden in the legend (chart.hidden) has no lines and is no part of a stack
    const hidden = Array.isArray(/** @type {any} */ (drawn).hidden) ? /** @type {any} */ (drawn).hidden : [];
    const parts = s.series.map((x, i) => ({ ...x, index: i })).filter((x) => !hidden.includes(x.name));
    const times = rules.trend ? timesOf(view, result.encoded, s.categoryPaths) : null;
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
    // a stack's lines are of its total: the sum of the parts at each category that has one
    const total = parts.length ? parts[0].data.map((_, i) => totalAt(i)) : [];
    const lists = drawn.stacked ? [{ series: null, data: total }] : parts.map((x) => ({ series: /** @type {number | null} */ (x.index), data: x.data }));
    const lang = resolveLocale(view.formatting.locale, locale ?? result.locale);
    // a plain number's own count of decimals ("number:0", "integer") gives way to "number": an
    // average of whole numbers keeps its decimals
    const formatOf = (/** @type {number | null} */ i) => {
        const format = (i === null ? parts[0] : s.series[i])?.format ?? "number";
        return formatterFor(/^(?:number|integer)(?::\d+)?$/.test(format) ? "number" : format, lang);
    };
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
