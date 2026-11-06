/*
 * Default colours and shapes the host can replace: toXlsx(grid, { theme }) and
 * toEChartsOption(result, { theme }). Excel's own defaults for colour scales and data bars.
 */

export const DEFAULT_THEME = Object.freeze({
    /** colour scale when a view names none: low, middle, high */
    colorScale: Object.freeze(["#f8696b", "#ffeb84", "#63be7b"]),
    /** data bar colour when a view names none */
    dataBar: "#638ec6",
    /** inner and outer radius of the pie (a ring) */
    pieRadius: Object.freeze(["35%", "70%"])
});
