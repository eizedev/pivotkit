/*
 * The measures a chart's label layout shares: the estimated width of a text, the height of a line of
 * labels, the room ECharts keeps around an axis's labels, a heatmap's frame and the group labels'
 * distance from the axis. Internal: chart-layout.js (the public layout of "pivotkit-core/chart"),
 * chart-fit.js and chart-style.js use them; "pivotkit-core/chart" does not export this module.
 */

import { CHART_GRID, DEFAULT_THEME } from "./defaults.js";

/** Width of a character as a share of the font size, estimated: most letters, digits and signs. */
const CHAR_WIDTH = 0.55;
/** Width of a capital letter (A to Z), estimated. */
const CAPITAL_WIDTH = 0.7;
/** Width of a CJK or fullwidth character: a whole em. */
const WIDE_WIDTH = 1;
/** Hangul, CJK (with kana and the CJK symbols), CJK compatibility and the fullwidth forms. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/**
 * Width (px) of a text at `fontSize` px, estimated per character: a whole em for CJK and fullwidth
 * characters, 0.7 em for a capital letter, 0.55 em for the others.
 * @param {unknown} text
 * @param {number} fontSize
 */
export function textWidth(text, fontSize) {
    let ems = 0;
    for (const ch of String(text)) {
        ems += WIDE.test(ch) ? WIDE_WIDTH : ch >= "A" && ch <= "Z" ? CAPITAL_WIDTH : CHAR_WIDTH;
    }
    return ems * fontSize;
}

/**
 * Width (px) of the longest of `texts` at `fontSize` px, estimated.
 * @param {unknown[]} texts
 * @param {number} fontSize
 * @returns {number}
 */
export function longestWidth(texts, fontSize) {
    let longest = 0;
    for (const t of texts) {
        longest = Math.max(longest, textWidth(t, fontSize));
    }
    return longest;
}
/** Height (px) of a line of labels at `fontSize` px with the room between two of them: 16 px at 12 px. */
export const labelLine = (/** @type {number} */ fontSize) => Math.round((fontSize * 4) / 3);
/** The least height (px) of a row that holds one line of text: a px more than the text. */
export const textRow = (/** @type {number} */ fontSize) => fontSize + 1;
/** Room (px) ECharts keeps between an axis and its labels (axisLabel.margin). */
export const AXIS_LABEL_MARGIN = 8;
/** Height (px) per px of width of a label slanted by 45 degrees (sin 45°). */
export const SLANT = Math.SQRT1_2;

/**
 * A pie's radius in px: a number as it is, a share ("70%") of `half`, half the smaller side of its box.
 * @param {string | number} r
 * @param {number} half
 */
export const radiusPx = (r, half) => (typeof r === "number" ? r : /%$/.test(String(r)) ? (parseFloat(String(r)) / 100) * half : parseFloat(String(r)) || 0);

/** Width (px) a slanted column name of a heatmap takes at most; a longer one ends in "…". */
export const SLANTED_LABEL_WIDTH = 120;
/** Room (px) of a heatmap's chart beside its cells: the row names. */
export const HEATMAP_FRAME_X = 80;

/**
 * Whether a heatmap slants its column names in a chart `width` px wide: when the longest is wider than
 * its column.
 * @param {unknown[]} names
 * @param {number} width
 * @param {number} fontSize
 */
export function columnsSlanted(names, width, fontSize) {
    const slot = Math.max(0, width - HEATMAP_FRAME_X) / Math.max(1, names.length);
    return names.length > 0 && longestWidth(names, fontSize) > slot;
}

/**
 * Room (px) of a heatmap's chart that is not cells: `x` beside them for the row names, `y` above and
 * below them: the grid's margins (`top`, `bottom`: pivotkit-core's heatmap grid, with the colour scale
 * below) and the column names (`names`, straight or slanted in a chart `width` px wide).
 * @param {{ top?: number, bottom?: number, names?: unknown[], width?: number, fontSize?: number }} [chart]
 * @returns {{ x: number, y: number }}
 */
export function heatmapFrame({ top = CHART_GRID.top, bottom = CHART_GRID.heatmapBottom, names = [], width = 800, fontSize = DEFAULT_THEME.textSize } = {}) {
    const columnNames = columnsSlanted(names, width, fontSize) ? (Math.min(SLANTED_LABEL_WIDTH, longestWidth(names, fontSize)) + fontSize) * SLANT : fontSize;
    return { x: HEATMAP_FRAME_X, y: Math.round(top + bottom + AXIS_LABEL_MARGIN + columnNames) };
}

/** Room (px) between the category labels and the group labels: below straight or slanted ones, beside a vertical axis. */
const GROUP_GAP = Object.freeze({ straight: 12, slanted: 2, beside: 16 });

/**
 * Distance (px) of the group labels from their category axis: past the category labels (a line of
 * them, slanted ones' height, or the longest, `longest` px, beside a vertical axis) and the room between.
 * @param {{ beside: boolean, slanted: boolean, longest: number, fontSize: number }} labels
 */
export function groupLabelOffset({ beside, slanted, longest, fontSize }) {
    if (beside) {
        return Math.round(longest) + GROUP_GAP.beside;
    }
    return slanted ? Math.round(longest * SLANT) + fontSize + GROUP_GAP.slanted : fontSize + GROUP_GAP.straight;
}

/** Height (px) a line of group labels takes below the axis: the text and ECharts' margin. */
export const groupLabelLine = (/** @type {number} */ fontSize) => fontSize + AXIS_LABEL_MARGIN;
