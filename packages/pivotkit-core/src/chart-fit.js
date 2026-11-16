/*
 * The room decorateOption (chart-style.js) makes for labels next to the marks: a pie's labels outside
 * it, the values at the end of horizontal bars, and the ticks of a narrow value axis. Internal:
 * "pivotkit-core/chart" does not export this module. Widths are estimated (chart-measure.js).
 */

import { DEFAULT_THEME } from "./defaults.js";
import { ringLabelsFit } from "./chart-layout.js";
import { labelLine, longestWidth, radiusPx, textWidth } from "./chart-measure.js";

/** ECharts' line from a slice to its outside label, px: its two parts (ECharts' defaults), and shorter ones for a narrow chart. */
const PIE_LINE = Object.freeze({ length: 15, length2: 30 });
const PIE_LINE_SHORT = Object.freeze({ length: 10, length2: 10 });
/** Room (px) between an outside label and its line (5) and the chart's edge (10), as ECharts keeps it. */
const PIE_LABEL_GAP = 15;
/** The least share of its radius a pie keeps to give its outside labels room. */
export const PIE_MIN_SCALE = 0.4;
/** A slice narrower than this (degrees) gets no label inside, as pivotkit-core's inside labels. */
const INSIDE_MIN_ANGLE = 12;

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
 * The changes to a pie's series (in `box`, the chart less the room around it) that give its labels
 * outside room beside it; none for labels inside or off:
 * - where the longest label fits beside the pie, its size and lines stay;
 * - else shorter label lines, and a smaller pie (pieSize) until the longest label fits, or at least its
 *   longest word; a label then breaks into lines at its spaces;
 * - where even the least pie leaves a word no room: labels inside the slices, while they fit there
 *   (ringLabelsFit) and a legend names the slices;
 * - with a legend, each side of the pie writes as many labels as its height holds, those of the larger
 *   slices first; the others are left out (`data` with their label off). Without a legend every label
 *   stays, even where two overlap: a name is never lost.
 * @param {any} series  the pie's series: radius, data, label, labelLine
 * @param {{ width: number, height: number }} box
 * @param {{ fontSize?: number, legend?: boolean }} [options]  legend: whether the chart shows one
 * @returns {{ radius?: [string | number, string | number], labelLine?: object, label?: object, data?: object[], minShowLabelAngle?: number }}
 */
export function pieLabelFit(series, box, { fontSize = DEFAULT_THEME.textSize, legend = true } = {}) {
    const label = series.label;
    if (label?.show === false || label?.position === "inside" || label?.position === "inner" || !Array.isArray(series.radius)) {
        return {};
    }
    const texts = pieLabelTexts(series);
    const size = pieSize(texts, series.radius, box, fontSize);
    if (!size) {
        return legend ? withoutHidden(series, texts.map(() => 1), box, fontSize) : {};
    }
    if (size.wordCut && legend && ringLabelsFit(series.radius, box, texts, fontSize)) {
        return { label: { ...label, position: "inside" }, labelLine: { ...series.labelLine, show: false }, minShowLabelAngle: INSIDE_MIN_ANGLE };
    }
    const wrap = (/** @type {string} */ t) => wrapAtSpaces(t, size.room, fontSize);
    const format = typeof label?.formatter === "function" ? label.formatter : (/** @type {{ name: string }} */ p) => p.name;
    const sized = {
        radius: size.radius,
        labelLine: { ...series.labelLine, ...PIE_LINE_SHORT },
        ...(longestWidth(texts, fontSize) > size.room ? { label: { ...label, formatter: (/** @type {any} */ p) => wrap(String(format(p))) } } : {})
    };
    if (!legend) {
        return sized;
    }
    return { ...sized, ...withoutHidden(series, texts.map((t) => wrap(t).split("\n").length), box, fontSize) };
}

/**
 * The pie's radius and the room (px) beside it for its labels outside when the longest does not fit
 * beside it at its own radius: shorter lines, and the largest radius at which the whole labels fit;
 * below PIE_MIN_SCALE of the radius, the one at which their longest word does, at least that share.
 * `wordCut`: even that least pie leaves the longest word no room. null where the labels fit as they are.
 * @param {string[]} texts
 * @param {[string | number, string | number]} radius
 * @param {{ width: number, height: number }} box
 * @param {number} fontSize
 * @returns {{ radius: [string | number, string | number], room: number, wordCut: boolean } | null}
 */
function pieSize(texts, radius, box, fontSize) {
    const half = Math.max(0, Math.min(box.width, box.height)) / 2;
    const outer = radiusPx(radius[1], half);
    // the width beside a pie of radius r, from its edge to the chart's
    const beside = (/** @type {number} */ r, /** @type {{ length: number, length2: number }} */ line) => box.width / 2 - r - line.length - line.length2 - PIE_LABEL_GAP;
    const whole = longestWidth(texts, fontSize);
    if (outer <= 0 || beside(outer, PIE_LINE) >= whole) {
        return null;
    }
    const word = longestWidth(texts.flatMap((t) => t.split(" ")), fontSize);
    const besideCentre = beside(0, PIE_LINE_SHORT);
    const least = outer * PIE_MIN_SCALE;
    const r = Math.min(outer, besideCentre - whole >= least ? besideCentre - whole : Math.max(least, besideCentre - word));
    const scale = r / outer;
    const scaled = (/** @type {string | number} */ v) => (typeof v === "number" ? v * scale : /%$/.test(String(v)) ? `${Math.round(parseFloat(String(v)) * scale * 10) / 10}%` : v);
    const room = beside(r, PIE_LINE_SHORT);
    return { radius: [scaled(radius[0]), scaled(radius[1])], room, wordCut: room < word };
}

/**
 * The slices whose label has no room on its side of the pie, with their label and line off (`data`);
 * nothing when every label has room (pieLabelsShown).
 * @param {any} series
 * @param {number[]} lines  the lines of each label
 * @param {{ height: number }} box
 * @param {number} fontSize
 */
function withoutHidden(series, lines, box, fontSize) {
    const shown = pieLabelsShown(series.data || [], lines, box.height, fontSize);
    if (shown.every(Boolean)) {
        return {};
    }
    const off = { label: { show: false }, labelLine: { show: false } };
    return { data: series.data.map((/** @type {object} */ d, /** @type {number} */ i) => (shown[i] ? d : { ...d, ...off })) };
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

/**
 * A text broken into lines ("\n") at its spaces, each line at most `width` px where its words allow (estimated).
 * @param {string} text
 * @param {number} width
 * @param {number} fontSize
 */
export function wrapAtSpaces(text, width, fontSize) {
    if (textWidth(text, fontSize) <= width) {
        return text;
    }
    /** @type {string[]} */
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

/** Room (px) ECharts keeps between a bar's end and its value label (label.distance). */
const VALUE_LABEL_DISTANCE = 5;

/**
 * Room (px) beside the plot for the value labels written past the end of horizontal bars (series of
 * type "bar" with their label at the "right"): the longest as the chart writes it and its distance from
 * the bar; 0 without such labels.
 * @param {any[]} series  the option's series
 * @param {number} fontSize  px
 */
export function valueLabelRoom(series, fontSize) {
    const ends = series.filter((s) => s.type === "bar" && s.label?.show && s.label.position === "right" && typeof s.label.formatter === "function");
    const texts = ends.flatMap((s) => (s.data || []).map((/** @type {unknown} */ value) => String(s.label.formatter({ value }))));
    return texts.length ? Math.ceil(longestWidth(texts, fontSize) + VALUE_LABEL_DISTANCE) : 0;
}

/** ECharts' splitNumber: the number of intervals a value axis aims at. */
const DEFAULT_SPLIT = 5;
/** Room (px) between two tick labels of a horizontal value axis. */
const TICK_GAP = 12;

/**
 * ECharts' "nice" interval for a raw one: 1, 2, 3, 5 or 10 times a power of ten.
 * @param {number} raw
 */
function niceInterval(raw) {
    const exp10 = 10 ** Math.floor(Math.log10(raw));
    const f = raw / exp10;
    return (f < 1.5 ? 1 : f < 2.5 ? 2 : f < 4 ? 3 : f < 7 ? 5 : 10) * exp10;
}

/**
 * The splitNumber of a horizontal value axis `plotWidth` px wide whose ticks would otherwise write
 * their labels over each other: the most intervals (fewer than ECharts' 5) whose ticks all fit, so the
 * ticks stay even and 0 keeps its label. undefined where ECharts' own ticks fit.
 * @param {[number, number]} extent  the smallest and largest value the bars reach
 * @param {{ plotWidth: number, fontSize: number, format: (v: number) => unknown }} axis  format: the axis's label formatter
 * @returns {number | undefined}
 */
export function valueAxisSplit([min, max], { plotWidth, fontSize, format }) {
    const lo = Math.min(0, min);
    const hi = Math.max(0, max);
    if (!(hi > lo) || !Number.isFinite(hi - lo)) {
        return undefined;
    }
    for (let split = DEFAULT_SPLIT; split > 1; split--) {
        const interval = niceInterval((hi - lo) / split);
        const first = Math.floor(lo / interval) * interval;
        const last = Math.ceil(hi / interval) * interval;
        const ticks = Math.round((last - first) / interval) + 1;
        const label = longestWidth([format(first), format(last)], fontSize) + TICK_GAP;
        if (ticks * label <= plotWidth) {
            return split === DEFAULT_SPLIT ? undefined : split;
        }
    }
    return 1;
}

/**
 * The smallest and largest value horizontal bars reach: each bar's value, the sums of a stack's
 * positive and negative parts.
 * @param {any[]} series  the option's bar series
 * @returns {[number, number]}
 */
export function barExtent(series) {
    const bars = series.filter((s) => s.type === "bar");
    const stacked = bars.some((s) => s.stack);
    const n = Math.max(0, ...bars.map((s) => (s.data || []).length));
    let min = 0;
    let max = 0;
    for (let i = 0; i < n; i++) {
        let up = 0;
        let down = 0;
        for (const s of bars) {
            // toEChartsOption writes a bar's value as a number (or null); an item object, as ECharts
            // also takes it, is read by its value
            const item = s.data?.[i];
            const v = item !== null && typeof item === "object" ? item.value : item;
            if (typeof v !== "number") continue;
            if (stacked) {
                if (v > 0) up += v;
                else down += v;
            } else {
                up = Math.max(up, v);
                down = Math.min(down, v);
            }
        }
        max = Math.max(max, up);
        min = Math.min(min, down);
    }
    return [min, max];
}
