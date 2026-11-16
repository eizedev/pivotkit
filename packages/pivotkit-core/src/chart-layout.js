/*
 * How a chart lays out its labels for its size: the room of a pie's labels, whether a donut's numbers
 * fit its ring, a heatmap's column and row names and cell numbers, the category axis of bars, lines and
 * areas, the group labels. chart-style.js uses it and exports it ("pivotkit-core/chart"), so it loads
 * with a drawn chart, not with a report's first load. Every measure takes the chart's text size
 * (`fontSize`, px: the option's textStyle, from --pk-chart-text-size), DEFAULT_THEME's by default.
 */

import { DEFAULT_THEME } from "./defaults.js";

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

/** Width of a character (digits, signs and most letters) as a share of the font size, estimated. */
const CHAR_WIDTH = 0.55;
/** Width (px) of a text at `fontSize` px, estimated. */
const textWidth = (text, fontSize) => String(text).length * fontSize * CHAR_WIDTH;
/** Width (px) of the longest of `texts` at `fontSize` px, estimated. */
const longestWidth = (texts, fontSize) => texts.reduce((m, t) => Math.max(m, textWidth(t, fontSize)), 0);
/** Height (px) of a line of labels at `fontSize` px with the room between two of them: 16 px at 12 px. */
const labelLine = (fontSize) => Math.round((fontSize * 4) / 3);
/** The least height (px) of a row that holds one line of text: a px more than the text. */
const textRow = (fontSize) => fontSize + 1;
/** Room (px) ECharts keeps between an axis and its labels (axisLabel.margin). */
const AXIS_LABEL_MARGIN = 8;
/** Height (px) per px of width of a label slanted by 45 degrees (sin 45°). */
const SLANT = Math.SQRT1_2;

/** A pie's radius in px: a number as it is, a share ("70%") of `half`, half the smaller side of its box. */
const radiusPx = (r, half) => (typeof r === "number" ? r : /%$/.test(String(r)) ? (parseFloat(String(r)) / 100) * half : parseFloat(String(r)) || 0);

/**
 * Whether the numbers written inside a donut's ring fit across it: the ring is the outer less the
 * inner radius, both a share (ECharts' "70%") of half the smaller side of the pie's box. A pie (no
 * inner radius) has room from its centre and always fits.
 * @param {[string | number, string | number]} radius  the series' radius, inner and outer
 * @param {{ width: number, height: number }} box  the pie's box: the chart less the room around it
 * @param {string[]} texts  the labels written on the slices
 * @param {number} [fontSize]  px
 */
export function ringLabelsFit(radius, box, texts, fontSize = DEFAULT_THEME.textSize) {
    const half = Math.max(0, Math.min(box.width, box.height)) / 2;
    const inner = radiusPx(radius[0], half);
    if (inner <= 0) {
        return true;
    }
    const ring = radiusPx(radius[1], half) - inner;
    // a little room on both sides of the text, so it does not touch the slice's edges
    return texts.every((t) => textWidth(t, fontSize) + 6 <= ring);
}

/** ECharts' line from a slice to its outside label, px: its two parts (ECharts' defaults), and shorter ones for a narrow chart. */
const PIE_LINE = { length: 15, length2: 30 };
const PIE_LINE_SHORT = { length: 10, length2: 10 };
/** Room (px) between an outside label and its line (5) and the chart's edge (10), as ECharts keeps it. */
const PIE_LABEL_GAP = 15;
/** The least share of its radius a pie keeps to give its outside labels room. */
const PIE_MIN_SCALE = 0.4;

/**
 * The texts a pie writes on or beside its slices: its label's formatter on each slice (its name, value
 * and share), or the slice's name when the label has none (ECharts' default).
 * @param {{ data?: { name: string, value: unknown }[], label?: { formatter?: unknown } }} series
 * @returns {string[]}  none for a formatter that is no function (an ECharts template)
 */
export function pieLabelTexts(series) {
    const data = series.data || [];
    const total = data.reduce((sum, d) => sum + (typeof d.value === "number" ? d.value : 0), 0);
    const format = series.label?.formatter;
    if (format === undefined) {
        return data.map((d) => String(d.name));
    }
    if (typeof format !== "function") {
        return [];
    }
    return data.map((d) => String(format({ name: d.name, value: d.value, percent: total && typeof d.value === "number" ? (d.value / total) * 100 : 0 })));
}

/**
 * How a pie in `box` (the chart less the room around it) makes room for its labels outside, beside it;
 * the changes to its series, none for labels inside or off:
 * - where the longest label (pieLabelTexts) fits beside the pie, its size and lines stay;
 * - else shorter label lines, and a smaller pie (down to PIE_MIN_SCALE of its radius) until the longest
 *   label fits, or at least its longest word; a label then breaks into lines at its spaces;
 * - each side of the pie writes as many labels as its height holds, those of the larger slices first;
 *   the others are left out (`data` with their label off). The legend and the tooltip name every slice.
 * Widths are estimated (CHAR_WIDTH).
 * @param {any} series  the pie's series: radius, data, label, labelLine
 * @param {{ width: number, height: number }} box
 * @param {number} [fontSize]  px
 * @returns {{ radius?: [string | number, string | number], labelLine?: object, label?: object, data?: object[] }}
 */
export function pieLabelFit(series, box, fontSize = DEFAULT_THEME.textSize) {
    const label = series.label;
    if (label?.show === false || label?.position === "inside" || label?.position === "inner" || !Array.isArray(series.radius)) {
        return {};
    }
    const texts = pieLabelTexts(series);
    const half = Math.max(0, Math.min(box.width, box.height)) / 2;
    const outer = radiusPx(series.radius[1], half);
    const side = (r, line) => box.width / 2 - r - line.length - line.length2 - PIE_LABEL_GAP;
    const whole = longestWidth(texts, fontSize);
    let sized = {};
    let lines = texts.map(() => 1);
    if (outer > 0 && side(outer, PIE_LINE) < whole) {
        const word = longestWidth(texts.flatMap((t) => t.split(" ")), fontSize);
        // the largest radius at which the whole labels fit beside the pie; below the least radius, the
        // one at which their longest word does (the labels are written on lines then)
        const fits = side(0, PIE_LINE_SHORT);
        const least = outer * PIE_MIN_SCALE;
        const r = Math.min(outer, fits - whole >= least ? fits - whole : Math.max(least, fits - word));
        const scale = r / outer;
        const room = side(r, PIE_LINE_SHORT);
        const scaled = (v) => (typeof v === "number" ? v * scale : /%$/.test(String(v)) ? `${Math.round(parseFloat(String(v)) * scale * 10) / 10}%` : v);
        const format = typeof label?.formatter === "function" ? label.formatter : (/** @type {{ name: string }} */ p) => p.name;
        const wrap = (/** @type {string} */ t) => wrapAtSpaces(t, room, fontSize);
        lines = texts.map((t) => wrap(t).split("\n").length);
        sized = {
            radius: [scaled(series.radius[0]), scaled(series.radius[1])],
            labelLine: { ...series.labelLine, ...PIE_LINE_SHORT },
            ...(whole > room ? { label: { ...label, formatter: (/** @type {any} */ p) => wrap(String(format(p))) } } : {})
        };
    }
    const shown = pieLabelsShown(series.data || [], lines, box.height, fontSize);
    if (shown.every(Boolean)) {
        return sized;
    }
    const off = { label: { show: false }, labelLine: { show: false } };
    return { ...sized, data: series.data.map((/** @type {object} */ d, /** @type {number} */ i) => (shown[i] ? d : { ...d, ...off })) };
}

/**
 * Which slices of a pie keep their label outside: per side of the pie (ECharts' start at the top,
 * clockwise), as many as `height` holds at `lines` lines each, the larger slices first.
 * @param {{ value: unknown }[]} data
 * @param {number[]} lines
 * @param {number} height  px
 * @param {number} fontSize  px
 * @returns {boolean[]}
 */
function pieLabelsShown(data, lines, height, fontSize) {
    const values = data.map((d) => (typeof d.value === "number" && d.value > 0 ? d.value : 0));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    let before = 0;
    const left = values.map((v) => {
        // the slice's middle, in degrees from the top, clockwise: past 180 it is on the left
        const middle = ((before + v / 2) / total) * 360;
        before += v;
        return middle > 180;
    });
    const shown = values.map(() => false);
    for (const onLeft of [false, true]) {
        let used = 0;
        const order = values.map((v, i) => i).filter((i) => left[i] === onLeft).sort((a, b) => values[b] - values[a]);
        for (const i of order) {
            used += lines[i] * labelLine(fontSize);
            shown[i] = used <= height;
        }
    }
    return shown;
}

/** A text broken into lines ("\n") at its spaces, each line at most `width` px where its words allow (estimated). */
function wrapAtSpaces(text, width, fontSize) {
    if (textWidth(text, fontSize) <= width) {
        return text;
    }
    const lines = [];
    for (const word of text.split(" ")) {
        const last = lines.length ? `${lines[lines.length - 1]} ${word}` : null;
        if (last !== null && textWidth(last, fontSize) <= width) {
            lines[lines.length - 1] = last;
        } else {
            lines.push(word);
        }
    }
    return lines.join("\n");
}

/** Width (px) a slanted column name of a heatmap takes at most; a longer one ends in "…". */
export const SLANTED_LABEL_WIDTH = 120;
/** Room (px) of a heatmap's chart beside its cells: the row names. */
const HEATMAP_FRAME_X = 80;
/** Room (px) a cell keeps on each side of its number. */
const LABEL_PAD = 4;

/**
 * How a heatmap writes its column names along the x axis of a chart `width` px wide: straight when
 * the longest fits its column, else slanted by 45 degrees and cut at SLANTED_LABEL_WIDTH. Every name is
 * shown (the core sets interval 0); the width of a character is estimated (CHAR_WIDTH).
 * @param {string[]} names
 * @param {number} width  the chart's width in px
 * @param {number} [fontSize]  px
 * @returns {{ rotate: number, width?: number, overflow?: "truncate" }}
 */
export function columnLabelLayout(names, width, fontSize = DEFAULT_THEME.textSize) {
    if (names.length === 0) {
        return { rotate: 0 };
    }
    const slot = Math.max(0, width - HEATMAP_FRAME_X) / names.length;
    const longest = longestWidth(names, fontSize);
    return longest <= slot ? { rotate: 0 } : { rotate: 45, width: SLANTED_LABEL_WIDTH, overflow: "truncate" };
}

/**
 * Room (px) of a heatmap's chart that is not cells: `x` beside them for the row names, `y` above and
 * below them for the grid's margins (`top`, `bottom`: pivotkit-core's grid, the colour scale below) and
 * the column names (`names`, laid out for a chart `width` px wide by columnLabelLayout).
 * @param {{ top?: number, bottom?: number, names?: string[], width?: number, fontSize?: number }} [chart]
 * @returns {{ x: number, y: number }}
 */
export function heatmapFrame({ top = 16, bottom = 64, names = [], width = 800, fontSize = DEFAULT_THEME.textSize } = {}) {
    const slanted = columnLabelLayout(names, width, fontSize).rotate !== 0;
    const columnNames = slanted ? (Math.min(SLANTED_LABEL_WIDTH, longestWidth(names, fontSize)) + fontSize) * SLANT : fontSize;
    return { x: HEATMAP_FRAME_X, y: Math.round(top + bottom + AXIS_LABEL_MARGIN + columnNames) };
}

/**
 * True when the cells of a heatmap of `columns` x `rows` in a chart of `width` x `height` px hold their
 * numbers as the chart writes them (`texts`, formatted: "1,234.5", "-12.3%"): the longest, estimated
 * (CHAR_WIDTH), fits a cell's width with room on both sides, and a line its height.
 * @param {number} columns
 * @param {number} rows
 * @param {number} width
 * @param {number} height
 * @param {string[]} texts
 * @param {number} [fontSize]  px
 * @param {{ x: number, y: number }} [frame]  the room that is not cells (heatmapFrame), by default with straight column names
 */
export function heatmapCellLabels(columns, rows, width, height, texts, fontSize = DEFAULT_THEME.textSize, frame = heatmapFrame({ fontSize })) {
    const w = Math.max(0, width - frame.x) / Math.max(1, columns);
    const h = Math.max(0, height - frame.y) / Math.max(1, rows);
    return w >= longestWidth(texts, fontSize) + 2 * LABEL_PAD && h >= labelLine(fontSize);
}

/**
 * Which row names of a heatmap the y axis writes in a chart `height` px high: every one (0) while each
 * row is a px higher than the text, else every n-th (ECharts' interval: n - 1 names left out between
 * two shown), so the names never overlap and the first one is always there.
 * @param {number} rows
 * @param {number} height
 * @param {number} [fontSize]  px
 * @param {{ x: number, y: number }} [frame]  the room that is not cells (heatmapFrame), by default with straight column names
 */
export function rowLabelInterval(rows, height, fontSize = DEFAULT_THEME.textSize, frame = heatmapFrame({ fontSize })) {
    const h = Math.max(0, height - frame.y) / Math.max(1, rows);
    const line = textRow(fontSize);
    return h >= line ? 0 : Math.ceil(line / Math.max(h, 0.1)) - 1;
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
 * row, else every n-th. A label is cut at CATEGORY_LABEL_WIDTH; a slanted one shorter where it would
 * take more than SLANTED_SHARE of the height (slantedLabelWidth). The width of a character is estimated (CHAR_WIDTH).
 * @param {string[]} names
 * @param {{ width: number, height: number, horizontal?: boolean, mode?: string, fontSize?: number, reserved?: number }} box
 *   reserved: the px of the height that are neither plot nor category labels (margins, title, legend, group labels)
 * @returns {{ rotate: number, interval: number, every: number, width: number, overflow: "truncate" }}
 */
export function categoryLabelLayout(names, { width, height, horizontal = false, mode = "auto", fontSize = DEFAULT_THEME.textSize, reserved = 0 }) {
    const n = Math.max(1, names.length);
    const every = (slot, need) => Math.max(1, Math.ceil(need / Math.max(slot, 0.1)));
    const result = (rotate, step) => ({ rotate, interval: step - 1, every: step, width: rotate ? slantedLabelWidth(height - reserved, fontSize) : CATEGORY_LABEL_WIDTH, overflow: /** @type {const} */ ("truncate") });
    if (horizontal) {
        // one line of text per row
        const slot = Math.max(0, height - AXIS_FRAME.y) / n;
        return result(0, mode === "all" ? 1 : every(slot, textRow(fontSize)));
    }
    const slot = Math.max(0, width - AXIS_FRAME.x) / n;
    const longest = categoryLabelWidth(names, fontSize);
    if (mode === "nth") {
        return result(0, every(slot, longest + 8));
    }
    if (longest + 8 <= slot) {
        return result(0, 1);
    }
    return result(45, mode === "all" ? 1 : every(slot, labelLine(fontSize)));
}

/** The most a block of slanted category labels takes of the height left for the plot and them. */
const SLANTED_SHARE = 0.4;

/**
 * Width (px) a category label slanted by 45 degrees is cut at, so the labels take at most SLANTED_SHARE
 * of `room` (the height for the plot and the labels): at most CATEGORY_LABEL_WIDTH, at least three
 * characters' worth.
 * @param {number} room  px
 * @param {number} [fontSize]  px
 */
function slantedLabelWidth(room, fontSize) {
    const width = (SLANTED_SHARE * Math.max(0, room) - AXIS_LABEL_MARGIN) / SLANT - fontSize;
    return Math.round(Math.min(CATEGORY_LABEL_WIDTH, Math.max(3 * fontSize, width)));
}

/**
 * Width (px) the longest category label takes along a horizontal axis, cut at CATEGORY_LABEL_WIDTH: the
 * room the group labels keep below (or beside) it.
 * @param {string[]} names
 * @param {number} [fontSize]  px
 */
export function categoryLabelWidth(names, fontSize = DEFAULT_THEME.textSize) {
    return Math.min(CATEGORY_LABEL_WIDTH, longestWidth(names, fontSize));
}

/** Room (px) ECharts keeps between a bar's end and its value label (label.distance). */
const VALUE_LABEL_DISTANCE = 5;

/**
 * Room (px) beside the plot for the value labels written past the end of horizontal bars (series of
 * type "bar" with their label at the "right"): the longest as the chart writes it, estimated
 * (CHAR_WIDTH), and its distance from the bar; 0 without such labels.
 * @param {any[]} series  the option's series
 * @param {number} [fontSize]  px
 */
export function valueLabelRoom(series, fontSize = DEFAULT_THEME.textSize) {
    const ends = series.filter((s) => s.type === "bar" && s.label?.show && s.label.position === "right" && typeof s.label.formatter === "function");
    const texts = ends.flatMap((s) => (s.data || []).map((/** @type {unknown} */ value) => String(s.label.formatter({ value }))));
    return texts.length ? Math.ceil(longestWidth(texts, fontSize) + VALUE_LABEL_DISTANCE) : 0;
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
