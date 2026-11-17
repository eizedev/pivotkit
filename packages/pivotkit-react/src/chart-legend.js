/*
 * The chart's legend and zoom slider between draws: a click on a legend entry is reported (the view
 * keeps it, chart.hidden), and the slider's window is kept while the categories stay. A redraw replaces
 * the whole ECharts option (notMerge), so what ECharts held itself is passed again. Only a drawn chart
 * needs it: it loads with ECharts (echarts.js), so the first load does not carry it.
 */

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
