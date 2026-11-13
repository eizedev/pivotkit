/*
 * What a chart draws for a view, the same on the screen (pivotkit-react), in an SVG and in a printed
 * report (pivotkit-report): a type the user chose is drawn as it is; "auto" (the default) draws lines
 * when a date is on Rows, lines with rows and columns swapped for the chart alone when a date is on
 * Columns only (so the dates run along the axis and the table keeps its layout), else bars. And the
 * colours of a chart from the --pk-* tokens of a report's theme. Pure and small: the first load of a
 * report needs it.
 */

import { autoChartType } from "./chart.js";

/**
 * The chart settings to draw a view with.
 * @param {{ rows: string[], cols: string[], derived: any[], chart: { type: string, stacked?: boolean, horizontal?: boolean } }} view  a normalized view
 * @param {import("./encode.js").Encoded} encoded
 * @returns {{ auto: boolean, swap: boolean, chart: { type: string, stacked: boolean, horizontal: boolean } }}
 *   `auto`: the view's type was "auto"; `swap`: draw from the pivot of `swapAxes(view)`
 */
export function chartPlan(view, encoded) {
    if (view.chart.type !== "auto") {
        return { auto: false, swap: false, chart: { type: view.chart.type, stacked: Boolean(view.chart.stacked), horizontal: Boolean(view.chart.horizontal) } };
    }
    const own = autoChartType(/** @type {any} */ (view), encoded);
    const swap = own === "bar" && view.cols.length > 0 && autoChartType(/** @type {any} */ ({ ...view, rows: view.cols }), encoded) === "line";
    return { auto: true, swap, chart: { type: own === "line" || swap ? "line" : "bar", stacked: false, horizontal: false } };
}

/** "Show values as" types that name an axis, and their counterpart on the other one. */
const SWAPPED_SHOW_AS = Object.freeze({ percentOfRowTotal: "percentOfColumnTotal", percentOfColumnTotal: "percentOfRowTotal", percentOfParentRow: "percentOfParentColumn", percentOfParentColumn: "percentOfParentRow" });

/**
 * A copy of a view with Rows and Columns swapped: the collapsed groups go with their axis, and a
 * "show values as" that names an axis names the other one, so every number stays what it was.
 * @template {{ rows: string[], cols: string[], collapsed: { rows: any[], cols: any[] }, values: any[] }} V
 * @param {V} view  a normalized view
 * @returns {V}
 */
export function swapAxes(view) {
    /** @type {V} */
    const next = JSON.parse(JSON.stringify(view));
    [next.rows, next.cols] = [next.cols, next.rows];
    next.collapsed = { rows: next.collapsed.cols, cols: next.collapsed.rows };
    for (const v of next.values) {
        if (v.showAs && v.showAs.axis) {
            v.showAs = { ...v.showAs, axis: v.showAs.axis === "rows" ? "cols" : "rows" };
        }
        if (v.showAs && Object.hasOwn(SWAPPED_SHOW_AS, v.showAs.type)) {
            v.showAs = { ...v.showAs, type: SWAPPED_SHOW_AS[v.showAs.type] };
        }
    }
    return next;
}

/** Number of categorical chart colours (--pk-chart-1 ... --pk-chart-8). */
export const CHART_COLORS = 8;

/**
 * The ECharts theme of toEChartsOption from the --pk-* tokens of a report: the computed style of a
 * report's root, or any object with getPropertyValue (a map of tokens, as pivotkit-report passes).
 * @param {{ getPropertyValue(name: string): string }} style
 * @returns {import("./chart.js").ChartTheme}
 */
export function chartThemeFrom(style) {
    const v = (name) => style.getPropertyValue(name).trim();
    const colors = [];
    for (let i = 1; i <= CHART_COLORS; i++) {
        const c = v(`--pk-chart-${i}`);
        if (c) {
            colors.push(c);
        }
    }
    /** @type {import("./chart.js").ChartTheme} */
    const theme = {
        colors,
        textColor: v("--pk-muted") || undefined,
        axisColor: v("--pk-border") || undefined,
        gridColor: v("--pk-grid") || v("--pk-border") || undefined,
        fontFamily: v("font-family") || undefined,
        backgroundColor: "transparent"
    };
    const low = v("--pk-heat-low");
    const high = v("--pk-heat-high");
    if (low && high) {
        theme.heatmapColors = [low, high];
    }
    return theme;
}
