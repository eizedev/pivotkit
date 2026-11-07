/*
 * The chart types of the picker, the one table they are defined in: the view.chart settings each
 * entry stands for and its icon. The name of an entry is in labels.chartTypes. A new entry needs a
 * chart type pivotkit-core draws (CATALOG.chartTypes) and a label in every language.
 */

/** @typedef {{ chart: { type: string, stacked: boolean, horizontal: boolean }, icon: string, axis: boolean }} ChartTypeEntry */

/** @type {Readonly<Record<string, ChartTypeEntry>>} axis: drawn along a category axis (series hints apply) */
export const CHART_TYPES = Object.freeze({
    bar: { chart: { type: "bar", stacked: false, horizontal: false }, icon: "chart", axis: true },
    stacked: { chart: { type: "bar", stacked: true, horizontal: false }, icon: "stacked", axis: true },
    horizontal: { chart: { type: "bar", stacked: false, horizontal: true }, icon: "horizontal", axis: true },
    line: { chart: { type: "line", stacked: false, horizontal: false }, icon: "line", axis: true },
    area: { chart: { type: "area", stacked: false, horizontal: false }, icon: "area", axis: true },
    pie: { chart: { type: "pie", stacked: false, horizontal: false }, icon: "pie", axis: false },
    heatmap: { chart: { type: "heatmap", stacked: false, horizontal: false }, icon: "heatmap", axis: false }
});

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

/** Charts with more series than this get a hint to swap or filter. */
export const MANY_SERIES = 8;
/** Categories a chart draws at most; the rest are left out with a note. */
export const MAX_CATEGORIES = 50;

/**
 * Room (px) above and below a pie for the labels outside it, for a chart `height` px high: 5 % of the
 * height, at most 24 px. The pie's radius is a share of its box, so in a low box the top and bottom
 * labels would reach past the canvas; a tall box keeps nearly all of its pie.
 * @param {number} height
 */
export function pieLabelRoom(height) {
    return Math.round(Math.min(24, Math.max(0, height) * 0.05));
}

/** Width (px) a slanted column name of a heatmap takes at most; a longer one ends in "…". */
export const SLANTED_LABEL_WIDTH = 120;
/** Room (px) of a heatmap's chart that is not cells: the row names, the column names and the colour scale. */
const HEATMAP_FRAME = { x: 80, y: 120 };
/** A heatmap cell smaller than this (px) shows its value in the tooltip only: the numbers would overlap. */
const HEATMAP_LABEL_CELL = { width: 32, height: 16 };

/**
 * How a heatmap writes its column names along the x axis of a chart `width` px wide: straight when
 * the longest fits its column, else slanted by 45 degrees and cut at SLANTED_LABEL_WIDTH. Every name is
 * shown (the core sets interval 0); the width of a character is estimated as 0.55 of the font size.
 * @param {string[]} names
 * @param {number} width  the chart's width in px
 * @param {number} [fontSize]  px, ECharts' default for axis labels
 * @returns {{ rotate: number, width?: number, overflow?: "truncate" }}
 */
export function columnLabelLayout(names, width, fontSize = 12) {
    if (names.length === 0) {
        return { rotate: 0 };
    }
    const slot = Math.max(0, width - HEATMAP_FRAME.x) / names.length;
    const longest = Math.max(...names.map((n) => String(n).length)) * fontSize * 0.55;
    return longest <= slot ? { rotate: 0 } : { rotate: 45, width: SLANTED_LABEL_WIDTH, overflow: "truncate" };
}

/**
 * True when the cells of a heatmap of `columns` x `rows` in a chart of `width` x `height` px are large
 * enough for their numbers.
 * @param {number} columns
 * @param {number} rows
 * @param {number} width
 * @param {number} height
 */
export function heatmapCellLabels(columns, rows, width, height) {
    const w = Math.max(0, width - HEATMAP_FRAME.x) / Math.max(1, columns);
    const h = Math.max(0, height - HEATMAP_FRAME.y) / Math.max(1, rows);
    return w >= HEATMAP_LABEL_CELL.width && h >= HEATMAP_LABEL_CELL.height;
}
