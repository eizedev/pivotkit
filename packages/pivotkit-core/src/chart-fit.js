/*
 * The room decorateOption (chart-style.js) makes for labels next to the marks: a pie's labels outside
 * it, the values at the end of horizontal bars, the ticks of a narrow value axis and the labels of
 * the high and low points (pointLabels). Internal:
 * "pivotkit-core/chart" does not export this module. Widths are estimated (chart-measure.js).
 */

import { DEFAULT_THEME } from "./defaults.js";
import { DEFAULT_LABELS } from "./labels.js";
import { CATEGORY_LABEL_WIDTH, ringLabelsFit } from "./chart-layout.js";
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

/** Room (px) between a high or low point's dot (half its size) and its label, as ECharts keeps it. */
const POINT_DOT = 5;
/** The outline (px) decorateOption draws around a label in the background's colour. */
export const POINT_HALO = 3;
/** A label's distance from its dot (px) when the label names none, as ECharts keeps it. */
const POINT_LABEL_DISTANCE = 5;
/** The share of the plot the labels' room is measured on: ECharts' nice ticks may stretch the values. */
const PLOT_SHARE = 0.8;
/** Room (px) below the plot for the category labels' margin, beside a line of their text. */
const AXIS_LABEL_ROOM = 8;
/** Room (px) the value axis's labels take beside the plot, estimated, when the categories are spread. */
const VALUE_LABEL_ROOM = 48;
/** More series than this: each dot stays, but only the chart's highest and lowest value keep a label. */
export const POINT_LABEL_SERIES = 8;

/** ECharts' gap between the bars of one category, a share of a bar's width (its barGap default). */
const BAR_GAP = 0.3;
/** ECharts' gap between two categories' bars, a share of the category's band (its barCategoryGap default). */
const BAR_CATEGORY_GAP = 0.2;

/**
 * Where ECharts draws each series' bars within a category's band of `band` px, as its bar layout does
 * with its default barGap and barCategoryGap (BAR_GAP, BAR_CATEGORY_GAP) and the series' barMaxWidth: a
 * host's barGap, barCategoryGap or barWidth (chartOptions) moves the bars, and the point labels placed
 * here may then cross a bar or be left out. The layout is estimated, not read from the drawn bars:
 * per series index, the offset of the bar's left edge from the band's middle and its width; null for a
 * series that is no bar, or hidden in the legend. Stacked bars share one column.
 * @param {any[]} series  the decorated series (barMaxWidth set by decorateOption)
 * @param {number} band
 * @param {{ selected?: Record<string, boolean> }} [legend]  the option's (selected false: hidden)
 * @returns {({ offset: number, width: number } | null)[]}
 */
function barSlots(series, band, legend) {
    /** @type {Map<string, number[]>} each column with its series */
    const columns = new Map();
    series.forEach((s, i) => {
        if (s.type !== "bar" || legend?.selected?.[s.name] === false) return;
        const key = s.stack ? `stack:${s.stack}` : `own:${i}`;
        columns.set(key, [...(columns.get(key) ?? []), i]);
    });
    const n = columns.size;
    const auto = n ? Math.max(0, (band * (1 - BAR_CATEGORY_GAP)) / (n + (n - 1) * BAR_GAP)) : 0;
    /** @type {({ offset: number, width: number } | null)[]} */
    const slots = series.map(() => null);
    const widths = [...columns.values()].map((members) => {
        const max = Math.min(...members.map((i) => (typeof series[i].barMaxWidth === "number" ? series[i].barMaxWidth : Infinity)));
        return Math.min(auto, max);
    });
    const total = widths.reduce((sum, w) => sum + w * (1 + BAR_GAP), 0) - (widths.length ? widths[widths.length - 1] * BAR_GAP : 0);
    let offset = -total / 2;
    [...columns.values()].forEach((members, k) => {
        for (const i of members) slots[i] = { offset, width: widths[k] };
        offset += widths[k] * (1 + BAR_GAP);
    });
    return slots;
}

/**
 * The boxes of grouped bars (side by side, not stacked) in a chart's estimated pixels, by series and
 * category: the obstacles of the high and low points' labels. None for one column of bars.
 * @param {any[]} series
 * @param {({ offset: number, width: number } | null)[]} slots  barSlots'
 * @param {number} band
 * @param {(value: number) => number} yOf
 * @returns {{ si: number, index: number, x0: number, x1: number, y0: number, y1: number }[]}
 */
function groupedBars(series, slots, band, yOf) {
    const offsets = new Set(slots.filter(Boolean).map((slot) => /** @type {any} */ (slot).offset));
    if (offsets.size < 2) return [];
    return series.flatMap((s, si) => {
        const slot = slots[si];
        if (!slot || s.stack) return [];
        return (s.data ?? []).flatMap((/** @type {any} */ d, /** @type {number} */ index) => {
            const v = typeof d === "number" ? d : typeof d?.value === "number" ? d.value : null;
            if (v === null) return [];
            const x0 = (index + 0.5) * band + slot.offset;
            const [a, b] = [yOf(Math.max(v, 0)), yOf(Math.min(v, 0))];
            return [{ si, index, x0, x1: x0 + slot.width, y0: Math.min(a, b), y1: Math.max(a, b) }];
        });
    });
}

/**
 * Whether a point's label box, its outline with it, crosses a bar other than its point's own (groupedBars).
 * @param {{ si: number, index: number, x0: number, x1: number, y0: number, y1: number }[]} bars
 * @param {{ si: number, index: number }} point
 * @param {{ x0: number, x1: number, y0: number, y1: number }} box
 */
function acrossBar(bars, point, box) {
    return bars.some((r) => (r.si !== point.si || r.index !== point.index) && r.x0 < box.x1 && box.x0 < r.x1 && r.y0 < box.y1 && box.y0 < r.y1);
}

/**
 * How far (px, up: negative) a label over its dot (`box`) moves to stand over the highest bar of its
 * category's group (groupedBars), POINT_HALO above it; 0 when it stands there already or no group is.
 * @param {{ index: number, y0: number }[]} bars
 * @param {number} index  the point's category
 * @param {{ y1: number }} box
 */
function overGroup(bars, index, box) {
    const tops = bars.filter((r) => r.index === index).map((r) => r.y0);
    return tops.length ? Math.min(0, Math.min(...tops) - POINT_HALO - box.y1) : 0;
}

/**
 * How far (px) a label's box at `pos` moves into the plot. Beside a dot near the plot's top or bottom
 * edge: up or down. Above or below a dot at the plot's first or last category: sideways. Over its
 * group ("raised"): up by `lift`, and sideways as above.
 * @param {string} pos
 * @param {{ x0: number, x1: number, y0: number, y1: number }} box
 * @param {{ width: number, top: number, bottom: number, lift: number }} plot
 */
function intoPlot(pos, box, { width, top, bottom, lift }) {
    const beside = pos === "right" || pos === "left";
    const dy = pos === "raised" ? lift : beside ? Math.min(0, bottom - box.y1) || Math.max(0, top - box.y0) : 0;
    const dx = beside ? 0 : Math.max(0, -box.x0) || Math.min(0, width - box.x1);
    return { dx, dy };
}

/**
 * The labels of the high and low points (pivotkit-core's markPoint): kept inside the plot and apart.
 * - The value axis reaches past each label at the plot's ends: `dataMin` and `dataMax` in values, from
 *   a plot estimated a fifth smaller than the chart leaves, as ECharts' nice ticks may stretch it. A
 *   label that would take the axis across zero, past every value, goes beside its dot instead.
 * - With more than POINT_LABEL_SERIES series, only the chart's highest and lowest value keep a label;
 *   every dot stays.
 * - Two labels that would cover each other, another point's dot or another bar (grouped bars, #913),
 *   move: the later one beside its dot (right, then left), then over the highest bar of its group,
 *   else it is left out: in dense grouped bars some labels are left out. The chart's highest and
 *   lowest value are placed first, so they keep theirs. The dot stays; the tooltip and the text
 *   alternative name the value. Each point sits over its own bar (barSlots).
 *   `pixelOf` gives each value's real height after a first draw; without it the heights are
 *   estimated on the same plot.
 * Horizontal bars: each bar has a band of its own, so only the axis's reach is set.
 * @param {any[]} series  the decorated series
 * @param {{ width: number, height: number, grid: any, fontSize: number, horizontal: boolean, axis: any, pixelOf?: (value: number) => number, legend?: { selected?: Record<string, boolean> } }} chart
 *   axis: the value axis, with the reach the reference lines gave it; legend: the option's (its selected: false hides a series)
 * @returns {{ series: any[], dataMin?: number, dataMax?: number } | null}  null without points
 */
export function pointLabels(series, { width, height, grid, fontSize, horizontal, axis, pixelOf, legend }) {
    /** @type {{ si: number, di: number, d: any, value: number, index: number, text: string }[]} */
    const items = [];
    series.forEach((s, si) =>
        (s.markPoint?.data ?? []).forEach((/** @type {any} */ d, /** @type {number} */ di) => {
            const at = Array.isArray(d.coord) ? d.coord : [];
            const value = horizontal ? at[0] : at[1];
            const index = horizontal ? at[1] : at[0];
            const text = typeof d.text === "string" ? d.text : "";
            if (typeof value === "number" && typeof index === "number") items.push({ si, di, d, value, index, text });
        })
    );
    if (!items.length) {
        return null;
    }
    const top = typeof grid?.top === "number" ? grid.top : 0;
    const bottom = typeof grid?.bottom === "number" ? grid.bottom : 0;
    const left = typeof grid?.left === "number" ? grid.left : 0;
    const right = typeof grid?.right === "number" ? grid.right : 0;
    const line = Math.ceil(fontSize * 1.3);
    // the values the axis spans: 0 (ECharts' value axis keeps it), the data, a stack's tops, the lines' reach
    const numbers = series.flatMap((s) => (s.data ?? []).map((/** @type {any} */ v) => (typeof v === "number" ? v : typeof v?.value === "number" ? v.value : null)).filter((/** @type {unknown} */ v) => typeof v === "number"));
    const tops = items.map((i) => i.value);
    const reach = [axis?.dataMin, axis?.dataMax].filter((v) => typeof v === "number");
    const all = [0, ...numbers, ...tops, ...reach];
    const low = Math.min(...all);
    const high = Math.max(...all);
    const span = high - low || 1;
    // the plot along the value axis, less the category labels' line, a fifth smaller for the nice ticks
    const plot = Math.max(40, (horizontal ? width - left - right - CATEGORY_LABEL_WIDTH : height - top - bottom - line - AXIS_LABEL_ROOM) * PLOT_SHARE);
    // a label's room along the value axis: its distance, half the dot and its height (or width)
    const room = (/** @type {typeof items[number]} */ i) => (typeof i.d.label?.distance === "number" ? i.d.label.distance : POINT_LABEL_DISTANCE) + POINT_DOT + (horizontal ? textWidth(i.text, fontSize) : line);
    const unit = span / plot;
    let dataMax = typeof axis?.dataMax === "number" ? axis.dataMax : undefined;
    let dataMin = typeof axis?.dataMin === "number" ? axis.dataMin : undefined;
    /** @type {Map<any, { position?: string, show?: boolean, offset?: number[] }>} */
    const moves = new Map();
    // the chart's highest and lowest value
    const highest = items.reduce((a, b) => (b.d.name === "max" && (!a || b.value > a.value) ? b : a), /** @type {typeof items[number] | null} */ (null));
    const lowest = items.reduce((a, b) => (b.d.name === "min" && (!a || b.value < a.value) ? b : a), /** @type {typeof items[number] | null} */ (null));
    // many series: the labels would cover the lines; only the chart's highest and lowest keep theirs
    if (series.filter((s) => s.type === "line" || s.type === "bar").length > POINT_LABEL_SERIES) {
        for (const i of items) {
            if (i !== highest && i !== lowest) moves.set(i.d, { show: false });
        }
    }
    for (const i of items) {
        if (moves.get(i.d)?.show === false) continue;
        const pos = i.d.label?.position;
        const reach = room(i) * unit;
        // a label that would take the axis across zero, where no value is, goes beside its dot instead:
        // the axis shows no range the data never reaches
        if (!horizontal && pos === "bottom" && low >= 0 && i.value - reach < 0) {
            moves.set(i.d, { position: "right" });
            continue;
        }
        if (!horizontal && pos === "top" && high <= 0 && i.value + reach > 0) {
            moves.set(i.d, { position: "right" });
            continue;
        }
        if (pos === "top" || pos === "right") dataMax = Math.max(dataMax ?? -Infinity, i.value + reach);
        if (pos === "bottom" || pos === "left") dataMin = Math.min(dataMin ?? Infinity, i.value - reach);
    }
    if (horizontal) {
        return { series, dataMin, dataMax };
    }
    // the boxes of the labels: x by category (the plot's width over the categories), y by value
    const categories = Math.max(1, ...series.map((s) => (Array.isArray(s.data) ? s.data.length : 0)));
    const band = Math.max(1, width - left - right - VALUE_LABEL_ROOM) / categories;
    const extent = [Math.min(low, dataMin ?? low), Math.max(high, dataMax ?? high)];
    const yOf = (/** @type {number} */ v) => (pixelOf ? pixelOf(v) : ((extent[1] - v) / (extent[1] - extent[0] || 1)) * plot);
    /** @typedef {{ x0: number, x1: number, y0: number, y1: number }} Box */
    const overlap = (/** @type {Box} */ a, /** @type {Box} */ b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    // a point stands over the middle of its bar: grouped bars stand side by side in the band
    const slots = barSlots(series, band, legend);
    const xOf = (/** @type {number} */ si, /** @type {number} */ index) => (index + 0.5) * band + (slots[si] ? /** @type {any} */ (slots[si]).offset + /** @type {any} */ (slots[si]).width / 2 : 0);
    const bars = groupedBars(series, slots, band, yOf);
    const dots = items.map((i) => {
        const x = xOf(i.si, i.index);
        const y = yOf(i.value);
        return { x0: x - POINT_DOT, x1: x + POINT_DOT, y0: y - POINT_DOT, y1: y + POINT_DOT };
    });
    const boxOf = (/** @type {typeof items[number]} */ i, /** @type {string} */ pos) => {
        const x = xOf(i.si, i.index);
        const y = yOf(i.value);
        // the outline adds to the text's box on every side
        const tall = line + 2 * POINT_HALO;
        const w = textWidth(i.text, fontSize) + 2 * POINT_HALO;
        const gap = (typeof i.d.label?.distance === "number" ? i.d.label.distance : POINT_LABEL_DISTANCE) + POINT_DOT;
        if (pos === "right") return { x0: x + gap, x1: x + gap + w, y0: y - tall / 2, y1: y + tall / 2 };
        if (pos === "left") return { x0: x - gap - w, x1: x - gap, y0: y - tall / 2, y1: y + tall / 2 };
        const y0 = pos === "bottom" ? y + gap : y - gap - tall;
        return { x0: x - w / 2, x1: x + w / 2, y0, y1: y0 + tall };
    };
    // the plot's edges along the value axis: it reaches at least the values, zero and the labels' reach
    const plotTop = yOf(extent[1]);
    const plotBottom = yOf(extent[0]);
    /** @type {Box[]} */
    const placed = [];
    // the chart's highest and lowest first: where labels are left out, they keep theirs
    const first = items.map((_, k) => k).sort((a, b) => Number(items[b] === highest || items[b] === lowest) - Number(items[a] === highest || items[a] === lowest));
    first.forEach((k) => {
        const i = items[k];
        if (moves.get(i.d)?.show === false) return;
        const own = moves.get(i.d)?.position ?? i.d.label?.position ?? "top";
        // over no other label and no other dot; beside its dot, within the plot's width (a label above
        // or below a dot stays within its category's band, the plot's margin takes the rest)
        const free = (/** @type {Box} */ b, /** @type {string} */ p) => (p === "top" || p === "bottom" || (b.x0 >= 0 && b.x1 <= band * categories)) && !placed.some((o) => overlap(o, b)) && !dots.some((d, j) => j !== k && overlap(d, b)) && !acrossBar(bars, i, b);
        // over the highest bar of its group: a label over its dot, within the plot
        const lift = own === "top" ? overGroup(bars, i.index, boxOf(i, "top")) : 0;
        const raised = (/** @type {Box} */ b) => ({ ...b, y0: b.y0 + lift, y1: b.y1 + lift });
        const boxAt = (/** @type {string} */ p) => (p === "raised" ? raised(boxOf(i, "top")) : boxOf(i, p));
        const candidates = [...new Set([own, "right", "left"]), ...(lift ? ["raised"] : [])];
        const pos = candidates.find((p) => (p !== "raised" || boxAt(p).y0 >= plotTop) && free(boxAt(p), p === "raised" ? "top" : p));
        if (pos) {
            const box = boxAt(pos);
            const { dx, dy } = intoPlot(pos, box, { width: band * categories, top: plotTop, bottom: plotBottom, lift });
            // the raised box has its lift already
            const shift = pos === "raised" ? 0 : dy;
            placed.push({ x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 + shift, y1: box.y1 + shift });
            const at = pos === "raised" ? "top" : pos;
            if (at !== (i.d.label?.position ?? "top") || dy || dx) moves.set(i.d, { position: at, ...(dy || dx ? { offset: [dx, dy] } : {}) });
        } else {
            moves.set(i.d, { show: false });
        }
    });
    const out = series.map((s) => (s.markPoint ? { ...s, markPoint: { ...s.markPoint, data: s.markPoint.data.map((/** @type {any} */ d) => (moves.has(d) ? { ...d, label: { ...d.label, ...moves.get(d) } } : d)) } } : s));
    return { series: out, dataMin, dataMax };
}

/** The arc (in lines of text) a slice needs at the pie's edge to keep its label outside, without a legend. */
const OTHER_ARC = 0.5;

/**
 * A pie's or donut's smallest slices as one slice "Other (n)", last, where its labels outside have no
 * room and no legend names the slices (#544): the fewest of the smallest slices (at least two) after
 * which every label has room (pieLabelFit, as a pie with a legend would leave labels out). The slice
 * holds their sum and lists them (`members`, for the tooltip), in `color`. The kept slices keep their
 * order and colour. A slice hidden in the legend is no part of it. null when every label has room, or
 * when no merge gives them room.
 * @param {any} series  the pie's series, with its labels outside
 * @param {{ width: number, height: number }} box  as pieLabelFit's
 * @param {{ fontSize: number, color?: string, hidden?: Record<string, boolean> }} options
 *   hidden: the legend's `selected` (false: hidden)
 * @returns {any[] | null}  the slices
 */
export function otherSlices(series, box, { fontSize, color, hidden = {} }) {
    const data = Array.isArray(series.data) ? series.data : [];
    const shownOf = (/** @type {any} */ d) => hidden[d.name] !== false;
    // a label needs room on its side of the pie (pieLabelFit, as with a legend), and its slice needs
    // an arc of OTHER_ARC lines at the pie's edge: ECharts lays the labels of a run of thin slices
    // over each other
    const fits = (/** @type {any[]} */ slices) => {
        const shown = slices.filter(shownOf);
        const fit = /** @type {any} */ (pieLabelFit({ ...series, data: shown }, box, { fontSize, legend: true }));
        if (fit.label?.position === "inside" || (fit.data ?? []).some((/** @type {any} */ d) => d.label?.show === false)) {
            return false;
        }
        const radius = /** @type {any[]} */ (fit.radius ?? series.radius ?? [0, "70%"]);
        const edge = radiusPx(radius[1], Math.max(0, Math.min(box.width, box.height)) / 2);
        const total = shown.reduce((sum, d) => sum + (typeof d.value === "number" && d.value > 0 ? d.value : 0), 0) || 1;
        return shown.every((d) => ((typeof d.value === "number" ? d.value : 0) / total) * 2 * Math.PI * edge >= OTHER_ARC * labelLine(fontSize));
    };
    if (fits(data)) {
        return null;
    }
    // the slices that may go, the smallest first
    const order = data.map((d, i) => ({ d, i })).filter(({ d }) => shownOf(d) && typeof d.value === "number").sort((a, b) => a.d.value - b.d.value || b.i - a.i);
    const name = typeof series.otherName === "string" ? series.otherName : DEFAULT_LABELS.otherSlices;
    // one fit per try: a chart draws at most 50 slices (MAX_CATEGORIES of the UI, the report's cap)
    for (let n = 2; n < order.length; n++) {
        const gone = new Set(order.slice(0, n).map((x) => x.i));
        const members = data.filter((_, i) => gone.has(i)).map((d) => ({ name: d.name, value: d.value }));
        const other = {
            name: name.replace("{count}", () => String(n)),
            value: members.reduce((sum, m) => sum + m.value, 0),
            members,
            ...(color ? { itemStyle: { color } } : {})
        };
        const slices = [...data.filter((_, i) => !gone.has(i)), other];
        if (fits(slices)) {
            return slices;
        }
    }
    return null;
}
