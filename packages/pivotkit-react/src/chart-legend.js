/*
 * The chart's legend and zoom slider between draws: a click on a legend entry is reported (the view
 * keeps it, chart.hidden), and the slider's window is kept while the categories stay; a window of
 * another size is drawn again, so the axis lays its names out for it. A redraw replaces the whole
 * ECharts option (notMerge), so what ECharts held itself is passed again. And the series the chart's
 * text alternative counts. Only a drawn chart needs this: it loads with ECharts (echarts.js), so the
 * first load does not carry it.
 */

import { autoChartType } from "pivotkit-core";

/** How long the zoom slider rests before a window of another size lays its labels out again, in ms. */
export const RELAYOUT_WAIT = 250;

/**
 * @typedef {{ names: readonly string[], start: number, end: number }} ZoomWindow
 *   the categories the window was moved over, and its first and last one by index
 */

/**
 * The window kept from the last draw, for pivotkit-core's decorateOption (`zoomAt`): only while the
 * same categories are drawn in the same order; other categories start where decorateOption starts them.
 * @param {ZoomWindow | null} kept
 * @param {readonly string[]} names  the categories drawn now
 * @returns {{ start: number, end: number } | undefined}
 */
export function keptWindow(kept, names) {
    if (!kept || kept.names.length !== names.length || kept.names.some((n, i) => n !== names[i])) {
        return undefined;
    }
    return { start: kept.start, end: kept.end };
}

/**
 * Follows a click on the legend and the zoom slider of an ECharts instance.
 * @param {any} instance
 * @param {{ onLegend: (change: { name: string, shown: boolean }) => void, onZoom: (start: number, end: number) => void }} on
 *   onLegend: an entry is shown or hidden now; onZoom: the slider's window, first and last category by index
 */
export function followChart(instance, { onLegend, onZoom }) {
    instance.on("legendselectchanged", (/** @type {any} */ e) => onLegend({ name: e.name, shown: Boolean(e.selected?.[e.name]) }));
    instance.on("datazoom", () => {
        const z = instance.getOption().dataZoom?.[0];
        if (z && typeof z.startValue === "number" && typeof z.endValue === "number") {
            onZoom(z.startValue, z.endValue);
        }
    });
}

/**
 * Follows the legend and the zoom slider of a chart (followChart) and keeps the slider's window.
 * @param {any} instance  the chart's ECharts instance
 * @param {{ categories: () => readonly string[] | undefined, onLegend: (change: { name: string, shown: boolean }) => void, redraw: () => void }} on
 *   categories: the categories drawn now; redraw: draws the chart again (a window of another size)
 */
export function chartKeeper(instance, { categories, onLegend, redraw }) {
    /** @type {ZoomWindow | null} */
    let kept = null;
    let span = -1;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let wait;
    followChart(instance, {
        onLegend,
        onZoom: (start, end) => {
            const names = categories();
            if (!names) {
                return;
            }
            kept = { names, start, end };
            if (end - start !== span) {
                clearTimeout(wait);
                wait = setTimeout(redraw, RELAYOUT_WAIT);
            }
        }
    });
    return {
        /**
         * decorateOption's zoom settings: the view's chart.zoom, the window kept, the latest categories
         * first over dates (a date on Rows), a finger's slider on a touch screen
         * @param {import("pivotkit-core").PivotResult} result
         * @param {readonly string[]} names
         * @param {Document} doc
         */
        zoomOf: (result, names, doc) => ({
            zoom: result.view.chart.zoom,
            zoomAt: keptWindow(kept, names),
            timeline: autoChartType(result.view, result.encoded) === "line",
            touch: Boolean(doc.defaultView?.matchMedia?.("(pointer: coarse)").matches)
        }),
        /** The slider drawn: its window's size, to tell a move from a new size. @param {any[] | undefined} dataZoom */
        drawn: (dataZoom) => {
            const z = dataZoom?.[0];
            span = z ? z.endValue - z.startValue : -1;
        },
        dispose: () => clearTimeout(wait)
    };
}

/**
 * What the chart's text alternative counts (chart-summary.js): the series shown, without the legend
 * entries hidden (series, or for a pie and a donut categories), and whether it is a 100 % stack (the
 * option has a share formatter only then, pivotkit-core's chart.js).
 * @param {ReturnType<typeof import("pivotkit-core").toSeries>} s
 * @param {any} option  toEChartsOption's
 * @param {readonly string[] | undefined} hidden  the view's chart.hidden
 * @param {boolean} slices  a pie or a donut
 */
export function shownOf(s, option, hidden, slices) {
    return { series: shownOnly(s, hidden ?? [], slices), shares: Boolean(option.tooltip?.shareFormatter) };
}

/**
 * The chart data as it is shown: without the legend entries hidden (chart.hidden), series or, for a
 * pie and a donut, categories.
 * @param {ReturnType<typeof import("pivotkit-core").toSeries>} s
 * @param {readonly string[]} hidden
 * @param {boolean} slices
 */
export function shownOnly(s, hidden, slices) {
    const out = new Set(hidden);
    if (!out.size) {
        return s;
    }
    if (!slices) {
        return { ...s, series: s.series.filter((x) => !out.has(x.name)) };
    }
    const keep = s.categories.map((name, i) => (out.has(name) ? -1 : i)).filter((i) => i >= 0);
    return {
        ...s,
        categories: keep.map((i) => s.categories[i]),
        categoryCount: (s.categoryCount ?? s.categories.length) - (s.categories.length - keep.length),
        series: s.series.map((x) => ({ ...x, data: keep.map((i) => x.data[i]) }))
    };
}

