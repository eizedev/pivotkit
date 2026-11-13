/*
 * Default colours and shapes the host can replace: toXlsx(grid, { theme }) and
 * toEChartsOption(result, { theme }), chartThemeFrom() reads them from a report's --pk-* tokens. They
 * are pivotkit-react's light theme (pivotkit-report's test/tokens.test.js keeps them in step with
 * styles.css): the colour scale its --pk-heat-low and --pk-heat-high, light for low and strong for
 * high, so it says "more", not "good" or "bad" (Excel's red, yellow, green reads the wrong way round
 * for a temperature or a cost); the data bars its --pk-chart-1; the sizes its --pk-chart-title-size,
 * --pk-radius-chart and --pk-radius-card at a 16 px font.
 */

export const DEFAULT_THEME = Object.freeze({
    /** colour scale when a view names none: low, high (two or three colours, low to high) */
    colorScale: Object.freeze(["#eaf1fb", "#2a78d6"]),
    /** data bar colour when a view names none */
    dataBar: "#2a78d6",
    /** font weight of a chart's title and group labels */
    strongWeight: 600,
    /** font size of a chart's title, px */
    titleSize: 16,
    /** corner radius of a chart's bars and pie slices, px (a heatmap's cells three quarters of it) */
    markRadius: 4,
    /** corner radius of a chart's tooltip, px */
    cardRadius: 8,
    /** inner and outer radius of a pie: a whole circle */
    pieRadius: Object.freeze(["0%", "70%"]),
    /** inner and outer radius of a donut: a ring */
    donutRadius: Object.freeze(["42%", "70%"])
});

/**
 * A theme's size from a token, as a number of px: "16px" or "16" (a token resolved by the report, or a
 * host's own), else null (empty, a keyword, or a length the caller cannot resolve without a page: em,
 * calc()). For chartThemeFrom and decorateOption; here, next to the defaults, so the chart's module
 * shares no larger module with the main entry (a shared module is a chunk of its own in a bundle).
 * @param {string} text
 * @returns {number | null}
 */
export function pxOf(text) {
    const m = /^(\d*\.?\d+)(px)?$/.exec(String(text ?? "").trim());
    return m ? Number(m[1]) : null;
}
