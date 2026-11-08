/*
 * The chart types of the picker, the one table they are defined in: the view.chart settings each
 * entry stands for and its icon. The name of an entry is in labels.chartTypes. A new entry needs a
 * chart type pivotkit-core draws (CATALOG.chartTypes) and a label in every language.
 */

import { autoChartType } from "pivotkit-core";

/** @typedef {{ chart: { type: string, stacked: boolean, horizontal: boolean }, icon: string, axis: boolean }} ChartTypeEntry */

/**
 * @type {Readonly<Record<string, ChartTypeEntry>>} axis: drawn along a category axis (series hints
 *   apply). "auto" is the view's default: the data decides (chartPlan), until the user picks a type.
 */
export const CHART_TYPES = Object.freeze({
    auto: { chart: { type: "auto", stacked: false, horizontal: false }, icon: "sparkle", axis: true },
    bar: { chart: { type: "bar", stacked: false, horizontal: false }, icon: "chart", axis: true },
    stacked: { chart: { type: "bar", stacked: true, horizontal: false }, icon: "stacked", axis: true },
    horizontal: { chart: { type: "bar", stacked: false, horizontal: true }, icon: "horizontal", axis: true },
    line: { chart: { type: "line", stacked: false, horizontal: false }, icon: "line", axis: true },
    area: { chart: { type: "area", stacked: false, horizontal: false }, icon: "area", axis: true },
    pie: { chart: { type: "pie", stacked: false, horizontal: false }, icon: "pie", axis: false },
    donut: { chart: { type: "donut", stacked: false, horizontal: false }, icon: "donut", axis: false },
    heatmap: { chart: { type: "heatmap", stacked: false, horizontal: false }, icon: "heatmap", axis: false }
});

/** The picker entries drawn as slices of a circle (pivotkit-core's SLICE_CHART_TYPES). */
export const SLICE_TYPES = Object.freeze(["pie", "donut"]);

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

/**
 * What the chart draws for a view. A type the user chose is drawn as it is. "auto" (the default)
 * draws lines when a date is on Rows; with a date on Columns only it draws lines too, with rows and
 * columns swapped for the chart alone (`swap`), so the dates run along the axis and the table keeps
 * its layout; else bars (pivotkit-core's autoChartType decides).
 * @param {{ rows: string[], cols: string[], derived: any[], chart: { type: string, stacked?: boolean, horizontal?: boolean } }} view
 * @param {import("pivotkit-core").Encoded} encoded
 * @returns {{ name: string, auto: boolean, swap: boolean, chart: { type: string, stacked: boolean, horizontal: boolean } }}
 *   `name`: the picker entry drawn (never "auto"); `chart`: the settings to draw with
 */
export function chartPlan(view, encoded) {
    if (view.chart.type !== "auto") {
        const name = chartTypeOf(view.chart);
        return { name, auto: false, swap: false, chart: { type: view.chart.type, stacked: Boolean(view.chart.stacked), horizontal: Boolean(view.chart.horizontal) } };
    }
    const own = autoChartType(/** @type {any} */ (view), encoded);
    const swap = own === "bar" && view.cols.length > 0 && autoChartType(/** @type {any} */ ({ ...view, rows: view.cols }), encoded) === "line";
    const name = own === "line" || swap ? "line" : "bar";
    return { name, auto: true, swap, chart: { ...CHART_TYPES[name].chart } };
}

/** Charts with more series than this get a hint to swap or filter. */
export const MANY_SERIES = 8;
/** Categories a chart draws at most; the rest are left out with a note. */
export const MAX_CATEGORIES = 50;
