/*
 * Default colours and shapes the host can replace: toXlsx(grid, { theme }) and
 * toEChartsOption(result, { theme }). Excel's own defaults for colour scales and data bars.
 */

export const DEFAULT_THEME = Object.freeze({
    /** colour scale when a view names none: low, middle, high */
    colorScale: Object.freeze(["#f8696b", "#ffeb84", "#63be7b"]),
    /** data bar colour when a view names none */
    dataBar: "#638ec6",
    /** inner and outer radius of a pie: a whole circle */
    pieRadius: Object.freeze(["0%", "70%"]),
    /** inner and outer radius of a donut: a ring */
    donutRadius: Object.freeze(["42%", "70%"])
});
