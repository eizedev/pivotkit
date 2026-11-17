/*
 * A chart's reference lines (chart.referenceLines) as numbers: the average of each series, a linear
 * trend and a target, where chart-plan.js's referenceLineRules allows them. The ECharts option
 * (chart.js), the UI's tooltip and text summary and the report's SVG read them from here. Only a drawn
 * chart needs it: the entry point "pivotkit-core/chart" exports it.
 */

import { referenceLineRules } from "./chart-plan.js";
import { autoChartType, toSeries } from "./chart-series.js";
import { DEFAULT_LABELS } from "./labels.js";

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
