/*
 * The zoom slider's window on a redraw: the window the slider was moved to stays while the categories
 * do. A redraw replaces the whole ECharts option (notMerge), so what ECharts held itself is passed
 * again. Only a drawn chart needs it: it loads with ECharts (echarts.js).
 */

/**
 * @typedef {{ names: readonly string[], start: number, end: number }} ZoomWindow
 *   the categories the window was moved over, and its first and last one by index
 */

/**
 * The option's dataZoom with the window kept from the last draw: the same categories in the same
 * order keep it, other categories start where decorateOption starts them.
 * @param {any[] | undefined} dataZoom  decorateOption's
 * @param {ZoomWindow | null} kept
 * @param {readonly string[]} names  the categories drawn now
 */
export function keptZoom(dataZoom, kept, names) {
    if (!dataZoom || !kept || kept.names.length !== names.length || kept.names.some((n, i) => n !== names[i])) {
        return dataZoom;
    }
    return dataZoom.map((z) => ({ ...z, startValue: kept.start, endValue: kept.end }));
}
