/*
 * The chart types of the picker, the one table they are defined in: the view.chart settings each
 * entry stands for and its icon. The name of an entry is in labels.chartTypes. A new entry needs a
 * chart type pivotkit-core draws (CATALOG.chartTypes) and a label in every language.
 */

/** @typedef {{ chart: { type: string, stacked: boolean, horizontal: boolean }, icon: string, axis: boolean }} ChartTypeEntry */

/** @type {Readonly<Record<string, ChartTypeEntry>>} axis: drawn along a category axis (series hints apply) */
export const CHART_TYPES = Object.freeze({
    bar: { chart: { type: "bar", stacked: false, horizontal: false }, icon: "chart", axis: true },
    stacked: { chart: { type: "bar", stacked: true, horizontal: false }, icon: "stacked", axis: true },
    horizontal: { chart: { type: "bar", stacked: false, horizontal: true }, icon: "horizontal", axis: true },
    line: { chart: { type: "line", stacked: false, horizontal: false }, icon: "line", axis: true },
    area: { chart: { type: "area", stacked: false, horizontal: false }, icon: "area", axis: true },
    pie: { chart: { type: "pie", stacked: false, horizontal: false }, icon: "pie", axis: false },
    heatmap: { chart: { type: "heatmap", stacked: false, horizontal: false }, icon: "heatmap", axis: false }
});

/** The picker entries in their order. */
export const CHART_TYPE_NAMES = Object.freeze(Object.keys(CHART_TYPES));

/**
 * The picker entry of a view's chart settings.
 * @param {{ type: string, stacked?: boolean, horizontal?: boolean }} chart
 */
export function chartTypeOf(chart) {
    const found = CHART_TYPE_NAMES.find((name) => {
        const c = CHART_TYPES[name].chart;
        return c.type === chart.type && c.stacked === Boolean(chart.stacked) && c.horizontal === Boolean(chart.horizontal);
    });
    if (found) {
        return found;
    }
    // a setting the picker has no entry for: a bar both stacked and horizontal is closest to the
    // horizontal bars, a stacked line or area to its own type; "bar" only for a type it does not know
    if (chart.type === "bar") {
        return chart.horizontal ? "horizontal" : "stacked";
    }
    return CHART_TYPE_NAMES.find((name) => CHART_TYPES[name].chart.type === chart.type) ?? "bar";
}

/** Charts with more series than this get a hint to swap or filter. */
export const MANY_SERIES = 8;
/** Categories a chart draws at most; the rest are left out with a note. */
export const MAX_CATEGORIES = 50;

/**
 * Room (px) above and below a pie for the labels outside it, for a chart `height` px high: 5 % of the
 * height, at most 24 px. The pie's radius is a share of its box, so in a low box the top and bottom
 * labels would reach past the canvas; a tall box keeps nearly all of its pie.
 * @param {number} height
 */
export function pieLabelRoom(height) {
    return Math.round(Math.min(24, Math.max(0, height) * 0.05));
}
