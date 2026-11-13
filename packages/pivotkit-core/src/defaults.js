/*
 * Default colours and shapes the host can replace: toXlsx(grid, { theme }) and
 * toEChartsOption(result, { theme }). The colours are pivotkit-react's light theme: the colour scale
 * its --pk-heat-low and --pk-heat-high, light for low and strong for high, so it says "more", not
 * "good" or "bad" (Excel's red, yellow, green reads the wrong way round for a temperature or a cost);
 * the data bars its --pk-chart-1.
 */

export const DEFAULT_THEME = Object.freeze({
    /** colour scale when a view names none: low, high (two or three colours, low to high) */
    colorScale: Object.freeze(["#eaf1fb", "#2a78d6"]),
    /** data bar colour when a view names none */
    dataBar: "#2a78d6",
    /** inner and outer radius of a pie: a whole circle */
    pieRadius: Object.freeze(["0%", "70%"]),
    /** inner and outer radius of a donut: a ring */
    donutRadius: Object.freeze(["42%", "70%"])
});
