/*
 * Default colours and shapes the host can replace: toXlsx(grid, { theme }) and
 * toEChartsOption(result, { theme }), chartThemeFrom() reads them from a report's --pk-* tokens. They
 * are pivotkit-react's light theme (pivotkit-report's test/tokens.test.js keeps them in step with
 * styles.css): the colour scale its --pk-heat-low and --pk-heat-high, light for low and strong for
 * high, so it says "more", not "good" or "bad" (Excel's red, yellow, green reads the wrong way round
 * for a temperature or a cost); the data bars its --pk-chart-1; the sizes its --pk-chart-title-size,
 * --pk-chart-text-size, --pk-radius-chart and --pk-radius-card at the least font size, 14 px.
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
    /** font size of a chart's other text (axes, legend, labels), px: the 14 px minimum */
    textSize: 14,
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
 * The colour scales a report builder picks in the value menu (Highlight › Colour scale), low to high,
 * as a view's `conditional.colors`. The theme's own scale (light to dark in its accent) has no colours.
 * Blue to orange first: the pair that people with red-green colour blindness tell apart. A cell mixes
 * its colour into the surface, so the text keeps 4.5:1 on every step (pivotkit-react's contrast test).
 */
export const COLOR_SCALES = Object.freeze({
    blueOrange: Object.freeze(["#2a78d6", "#f2f2f2", "#eb6834"]),
    blueRed: Object.freeze(["#2a78d6", "#f2f2f2", "#e34948"]),
    redGreen: Object.freeze(["#e34948", "#f2d16b", "#1baf7a"])
});

/**
 * The margins (px) of a chart's grid that pivotkit-core sets: above the plot (before the title's and
 * the legend's room), and below a heatmap's cells for its colour scale. Internal: toEChartsOption and
 * the label layout (chart-measure.js) share them. Plain numbers, so a bundler writes them in place and
 * a report's first load does not grow.
 */
export const GRID_TOP = 16;
export const HEATMAP_GRID_BOTTOM = 64;

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
