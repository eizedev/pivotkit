/*
 * How a chart lays out its labels for its size: the room of a pie's labels, whether a donut's numbers
 * fit its ring, a heatmap's column and row names and cell numbers, the category axis of bars, lines and
 * areas, the group labels. Only chart-decorate.js uses it, so it loads with ECharts (dist/echarts.js),
 * not with the first load.
 */

/**
 * Room (px) above and below a pie for the labels outside it, for a chart `height` px high: 5 % of the
 * height, at most 24 px. The pie's radius is a share of its box, so in a low box the top and bottom
 * labels would reach past the canvas; a tall box keeps nearly all of its pie.
 * @param {number} height
 */
export function pieLabelRoom(height) {
    return Math.round(Math.min(24, Math.max(0, height) * 0.05));
}

/**
 * The least width (px) of a chart that keeps a legend on its right: the legend's column takes 160 px
 * (pivotkit-core), so a narrower chart (a phone) would squeeze the pie or the plot into a sliver. Below
 * it the legend is drawn at the bottom instead, with the room pivotkit-core gives a bottom legend.
 */
export const RIGHT_LEGEND_MIN_WIDTH = 480;
/** Room (px) pivotkit-core gives a legend at the bottom of a chart. */
export const BOTTOM_LEGEND_ROOM = 32;

/** Width (px) of a text in ECharts' 12 px labels, estimated: digits, signs and letters about 7 px each. */
const labelWidth = (text) => String(text).length * 7;

/**
 * Whether the numbers written inside a donut's ring fit across it: the ring is the outer less the
 * inner radius, both a share (ECharts' "70%") of half the smaller side of the pie's box. A pie (no
 * inner radius) has room from its centre and always fits.
 * @param {[string | number, string | number]} radius  the series' radius, inner and outer
 * @param {{ width: number, height: number }} box  the pie's box: the chart less the room around it
 * @param {string[]} texts  the labels written on the slices
 */
export function ringLabelsFit(radius, box, texts) {
    const half = Math.max(0, Math.min(box.width, box.height)) / 2;
    const px = (r) => (typeof r === "number" ? r : /%$/.test(String(r)) ? (parseFloat(String(r)) / 100) * half : parseFloat(String(r)) || 0);
    const inner = px(radius[0]);
    if (inner <= 0) {
        return true;
    }
    const ring = px(radius[1]) - inner;
    // a little room on both sides of the text, so it does not touch the slice's edges
    return texts.every((t) => labelWidth(t) + 6 <= ring);
}

/** Width (px) a slanted column name of a heatmap takes at most; a longer one ends in "…". */
export const SLANTED_LABEL_WIDTH = 120;
/** Room (px) of a heatmap's chart that is not cells: the row names, the column names and the colour scale. */
const HEATMAP_FRAME = { x: 80, y: 120 };
/** Height (px) of a line of ECharts' 12 px labels with the room between two of them. */
const LABEL_LINE = 16;
/** Room (px) a cell keeps on each side of its number. */
const LABEL_PAD = 4;

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
 * True when the cells of a heatmap of `columns` x `rows` in a chart of `width` x `height` px hold their
 * numbers as the chart writes them (`texts`, formatted: "1,234.5", "-12.3%"): the longest, estimated at
 * 0.55 of the font size per character, fits a cell's width with room on both sides, and a line its height.
 * @param {number} columns
 * @param {number} rows
 * @param {number} width
 * @param {number} height
 * @param {string[]} texts
 * @param {number} [fontSize]  px, ECharts' default for labels
 */
export function heatmapCellLabels(columns, rows, width, height, texts, fontSize = 12) {
    const w = Math.max(0, width - HEATMAP_FRAME.x) / Math.max(1, columns);
    const h = Math.max(0, height - HEATMAP_FRAME.y) / Math.max(1, rows);
    const longest = texts.reduce((m, t) => Math.max(m, String(t).length), 0) * fontSize * 0.55;
    return w >= longest + 2 * LABEL_PAD && h >= LABEL_LINE;
}

/**
 * Which row names of a heatmap the y axis writes in a chart `height` px high: every one (0) when a line
 * fits each row, else every n-th (ECharts' interval: n - 1 names left out between two shown), so the
 * names never overlap and the first one is always there.
 * @param {number} rows
 * @param {number} height
 */
export function rowLabelInterval(rows, height) {
    const h = Math.max(0, height - HEATMAP_FRAME.y) / Math.max(1, rows);
    return h >= LABEL_LINE ? 0 : Math.ceil(LABEL_LINE / Math.max(h, 0.1)) - 1;
}

/** Width (px) a category label of bars, lines and areas takes at most: a longer one ends in "…" (the tooltip has it whole). */
export const CATEGORY_LABEL_WIDTH = 120;
/** Room (px) of a chart that is not its category axis: the value axis and the margins. */
const AXIS_FRAME = { x: 80, y: 60 };

/**
 * How the category axis of bars, lines and areas writes its labels (`chart.axisLabels`):
 * - "auto": every label straight when the longest fits its slot, else slanted by 45 degrees while a
 *   line fits each slot, else every n-th slanted (`every` > 1, the chart says so in a note);
 * - "all": every label, slanted when they do not fit straight;
 * - "nth": straight, every n-th so they never overlap.
 * Along a vertical axis (horizontal bars) the labels stay straight: every one while a line fits each
 * row, else every n-th. A label is cut at CATEGORY_LABEL_WIDTH; character width estimated at 0.55 of the font size.
 * @param {string[]} names
 * @param {{ width: number, height: number, horizontal?: boolean, mode?: string, fontSize?: number }} box
 * @returns {{ rotate: number, interval: number, every: number, width: number, overflow: "truncate" }}
 */
export function categoryLabelLayout(names, { width, height, horizontal = false, mode = "auto", fontSize = 12 }) {
    const n = Math.max(1, names.length);
    const cut = { width: CATEGORY_LABEL_WIDTH, overflow: /** @type {const} */ ("truncate") };
    const every = (slot, need) => Math.max(1, Math.ceil(need / Math.max(slot, 0.1)));
    const result = (rotate, step) => ({ rotate, interval: step - 1, every: step, ...cut });
    if (horizontal) {
        // one line of 12 px text per row: a row of 13 px holds it
        const slot = Math.max(0, height - AXIS_FRAME.y) / n;
        return result(0, mode === "all" ? 1 : every(slot, fontSize + 1));
    }
    const slot = Math.max(0, width - AXIS_FRAME.x) / n;
    const longest = Math.min(CATEGORY_LABEL_WIDTH, Math.max(0, ...names.map((t) => String(t).length)) * fontSize * 0.55);
    if (mode === "nth") {
        return result(0, every(slot, longest + 8));
    }
    if (longest + 8 <= slot) {
        return result(0, 1);
    }
    return result(45, mode === "all" ? 1 : every(slot, LABEL_LINE));
}

/** The least room (px) a group label needs along the axis, and the least size of a chart with group labels. */
export const GROUP_LABEL_ROOM = Object.freeze({ along: 56, across: 28, width: 420, height: 260 });

/**
 * Whether "auto" group labels fit a chart of `width` x `height` px with `count` categories whose
 * smallest group has `groupSize` of them: each group's name needs GROUP_LABEL_ROOM.along px under the
 * axis (across: a line per group beside a vertical axis), and the chart itself a least size, or the
 * plot area left over is too small to read.
 * @param {number} count
 * @param {number} groupSize
 * @param {{ width: number, height: number, horizontal?: boolean }} box
 */
export function groupLabelsFit(count, groupSize, { width, height, horizontal = false }) {
    if (width < GROUP_LABEL_ROOM.width || height < GROUP_LABEL_ROOM.height) {
        return false;
    }
    const n = Math.max(1, count);
    const slot = horizontal ? Math.max(0, height - AXIS_FRAME.y) / n : Math.max(0, width - AXIS_FRAME.x) / n;
    return slot * Math.max(1, groupSize) >= (horizontal ? GROUP_LABEL_ROOM.across : GROUP_LABEL_ROOM.along);
}
