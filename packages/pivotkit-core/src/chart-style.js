/*
 * A report's marks on the ECharts option of toEChartsOption: the theme's colours (the --pk-* tokens),
 * rounded bars, the tooltip in the theme and the axis labels laid out for the chart's size
 * (chart-layout.js). The same look on the screen (pivotkit-react, which adds its DOM tooltip), in an
 * SVG and in a printed report (pivotkit-report). The entry point "pivotkit-core/chart": only a drawn
 * chart needs it, so a report's first load does not. It holds toEChartsOption too, for the same
 * reason: a bundle that loads the chart from here keeps the option's code out of its first load.
 */

import { DEFAULT_THEME, EXTREME_INKS, HEATMAP_GRID_BOTTOM, pxOf } from "./defaults.js";
import { BOTTOM_LEGEND_ROOM, CATEGORY_LABEL_WIDTH, RIGHT_LEGEND_MIN_WIDTH, categoryLabelLayout, categoryLabelWidth, columnLabelLayout, groupLabelsFit, heatmapCellLabels, pieLabelRoom, ringLabelsFit, rowLabelInterval } from "./chart-layout.js";
import { POINT_HALO, barExtent, otherSlices, pieLabelFit, pieLabelTexts, pointLabels, valueAxisSplit, valueLabelRoom } from "./chart-fit.js";
import { AXIS_LABEL_MARGIN, BOLD_WIDTH, ELLIPSIS, LINE_SAMPLES, TILE_MIN_CHARS, categorySlot, groupLabelLine, groupLabelOffset, heatmapFrame, lineLabelText, textWidth, tileLine } from "./chart-measure.js";
import { ZOOM_SLIDER, longestNames, zoomRange, zoomSlider, zoomWindow } from "./chart-zoom.js";
import { hexOf, labelColorOn, tileFill } from "./chart-colors.js";

export * from "./chart-layout.js";
export { toEChartsOption } from "./chart.js";
export { extremePoints, referenceLineChecks, referenceLines } from "./chart-lines.js";
export { labelColorOn };

/**
 * A treemap's tiles as a first draw laid them out, for decorateOption's `tileOf`: by an item's place in
 * the series' data and its name, its tile's size, or null. `chart` is the ECharts instance. ECharts
 * (checked with 6.1.0) keeps the tree in its list depth first, the root first: a flat treemap's item i
 * at i + 1. An item's name that is not at that place (a tree with children) gives null.
 * @param {any} chart
 * @returns {((index: number, name: string) => { width: number, height: number } | null) | undefined}
 */
export function drawnTiles(chart) {
    const series = chart.getModel?.()?.getSeriesByIndex(0);
    if (series?.subType !== "treemap") return undefined;
    const data = series.getData();
    return (index, name) => {
        if (index + 1 >= data.count() || data.getName(index + 1) !== name) return null;
        const tile = data.getItemLayout(index + 1);
        return typeof tile?.height === "number" ? { width: tile.width, height: tile.height } : null;
    };
}

/** Room (px) beside a combo's plot: the margins and the numbers of its two value axes, estimated. */
const COMBO_AXES_ROOM = 136;

/** A copy of an object without the given keys. */
const without = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/*
 * Text on a coloured area (#913, #914, #984): it reads against a colour the chart knows.
 * - A heatmap's cell has one colour of an ordered scale: its number takes labelColorOn's ink for it
 *   (the theme's text or background colour, else black or white), at least 4.5:1. Along the scale the
 *   ink changes once, from dark on light cells to light on dark ones.
 * - A treemap's tiles take any colours of a palette, a host's among them: every label is in one colour
 *   (--pk-chart-tile-text, white), as ECharts writes them, and a tile too light for it is darkened just
 *   as far as the text needs to keep --pk-chart-tile-contrast (tileFill). Every label looks the same,
 *   in both themes and after a switch; an ink chosen per tile would flip between dark and light.
 * - A high or low point's label crosses the plot and the bars: an outline in the background colour
 *   around its letters (POINT_HALO).
 */

/**
 * Rich text of ECharts: `text` in the style `key`, line by line. A "}" ends a style's text in ECharts'
 * markup, so it stands between two runs of the style, in the label's own style.
 * @param {string} key
 * @param {unknown} text
 */
const styled = (key, text) =>
    String(text)
        .split("\n")
        .map((line) => line.split("}").map((part) => (part ? `{${key}|${part}}` : "")).join("}"))
        .join("\n");

/**
 * The ink of `inks` that reads on `fill` (labelColorOn), black or white when none does; `inks[0]` for a
 * fill it cannot read.
 * @param {unknown} fill
 * @param {string[]} inks
 * @param {((color: string) => string | null) | undefined} readColor
 */
function inkOn(fill, inks, readColor) {
    const read = typeof fill === "string" ? (readColor ? (readColor(fill) ?? fill) : fill) : null;
    return read ? labelColorOn(read, inks) : inks[0];
}

/**
 * `text` as it fits `width` px at `fontSize` (textWidth): whole, else cut with ELLIPSIS after at least
 * TILE_MIN_CHARS characters; null when that does not fit.
 * @param {string} text
 * @param {number} width
 * @param {number} fontSize
 */
function fitText(text, width, fontSize) {
    if (textWidth(text, fontSize) <= width) return text;
    const chars = [...text];
    for (let n = chars.length - 1; n >= TILE_MIN_CHARS; n--) {
        const cut = `${chars.slice(0, n).join("").trimEnd()}${ELLIPSIS}`;
        if (textWidth(cut, fontSize) <= width) return cut;
    }
    return null;
}

/**
 * A number from a token, else `fallback`: a font weight (1 to 1000) or a contrast (0 or more).
 * @param {string} text
 * @param {number} fallback
 * @param {number} [max]
 */
const numberOr = (text, fallback, max = Infinity) => {
    const n = text === "" ? NaN : Number(text);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
};
/** A font weight from a token (1 to 1000), else `fallback`. */
const weightOr = (/** @type {string} */ text, /** @type {number} */ fallback) => numberOr(text, fallback, 1000) || fallback;

/**
 * How a treemap writes on its tiles, from the tokens: the text's colour (--pk-chart-tile-text), the
 * contrast it keeps (--pk-chart-tile-contrast; 0 keeps every tile's colour), its size
 * (--pk-chart-tile-size, else the chart's text size `fontSize`), the room around it
 * (--pk-chart-tile-padding), the name's weight (--pk-chart-tile-weight, else --pk-weight-strong) and
 * the value's (--pk-weight-normal); DEFAULT_THEME's where a token is missing. A tile's colour is read
 * as the screen draws it (`readColor`), then as ECharts reads it (`parseColor`, as #rrggbb), so
 * tileFill can mix it.
 * @param {(name: string) => string} v  a token's value
 * @param {{ fontSize: number, readColor?: (color: string) => string | null, parseColor?: (color: string) => unknown }} context
 */
function tileLookOf(v, { fontSize, readColor, parseColor }) {
    const tileColor = (/** @type {string} */ color) => {
        const shown = readColor ? (readColor(color) ?? color) : color;
        const rgba = parseColor ? parseColor(shown.trim()) : null;
        return Array.isArray(rgba) && rgba.length >= 3 ? hexOf(rgba.slice(0, 3)) : shown;
    };
    return {
        ink: v("--pk-chart-tile-text") || DEFAULT_THEME.tileText,
        floor: numberOr(v("--pk-chart-tile-contrast"), DEFAULT_THEME.tileContrast),
        fontSize: pxOf(v("--pk-chart-tile-size")) ?? fontSize,
        padding: pxOf(v("--pk-chart-tile-padding")) ?? DEFAULT_THEME.tilePadding,
        weights: /** @type {[number, number]} */ ([weightOr(v("--pk-chart-tile-weight"), weightOr(v("--pk-weight-strong"), DEFAULT_THEME.strongWeight)), weightOr(v("--pk-weight-normal"), DEFAULT_THEME.normalWeight)]),
        tileColor
    };
}

/**
 * A treemap's labels and tiles (see above): each tile's name, and its value below it, at its top left
 * in the tile text's colour, the name in the strong weight; each tile's colour darkened where the text
 * needs it (tileFill). ECharts gives a tile's label a box of the tile's size. With `tileOf` (the tiles
 * of a first draw) each label writes what fits its tile: the name cut short with ELLIPSIS (fitText),
 * the value whole or not at all (a number cut short would mislead). A tile without room for
 * TILE_MIN_CHARS characters or one line writes no label: the tooltip has it. Without `tileOf`, ECharts
 * cuts the labels.
 * @param {any} s  the treemap's series
 * @param {{ ink: string, floor: number, fontSize: number, padding: number, weights: [number, number], tileColor: (color: string) => string }} look
 *   ink: the text's colour; floor: the contrast it keeps; weights: the name's and the value's;
 *   tileColor: a colour as contrastOf reads it (hex or rgb()), or as it is; the ink is read so too, so a
 *   named or hsl() ink keeps its contrast
 * @param {((index: number, name: string) => { width: number, height: number } | null) | undefined} tileOf
 * @returns {{ label: any, data: any[] }}
 */
function treemapLabels(s, { ink, floor, fontSize, padding, weights, tileColor }, tileOf) {
    const format = typeof s.label?.formatter === "function" ? s.label.formatter : null;
    const line = tileLine(fontSize);
    const rich = {
        name: { fontSize, lineHeight: line, fontWeight: weights[0], color: ink },
        value: { fontSize, lineHeight: line, fontWeight: weights[1], color: ink }
    };
    const words = (/** @type {string[]} */ lines) => [styled("name", lines[0]), ...lines.slice(1).map((t) => styled("value", t))].join("\n");
    const label = { ...s.label, position: "insideTopLeft", padding, color: ink, rich, ...(format ? { formatter: (/** @type {any} */ p) => words(String(format(p)).split("\n")) } : {}) };
    const bold = weights[0] >= 600 ? BOLD_WIDTH : 1;
    const shownInk = tileColor(ink);
    const data = (Array.isArray(s.data) ? s.data : []).map((/** @type {any} */ d, /** @type {number} */ i) => {
        const own = d.itemStyle?.color;
        const item = typeof own === "string" ? { ...d, itemStyle: { ...d.itemStyle, color: tileFill(tileColor(own), shownInk, floor) } } : d;
        const tile = format && tileOf ? tileOf(i, d.name) : null;
        if (!tile || !format) return item;
        const width = tile.width - 2 * padding;
        const [first, ...rest] = String(format(d)).split("\n");
        // ECharts gives the text the tile less the padding on every side, and leaves out a line that
        // does not fit that height whole
        const lines = Math.floor((tile.height - 2 * padding) / line);
        const name = lines >= 1 ? fitText(first, width / bold, fontSize) : null;
        if (name === null) return { ...item, label: { ...d.label, show: false } };
        // the value below the name where its line fits whole, and the tile's height holds it
        const value = rest.filter((t) => textWidth(t, fontSize) <= width).slice(0, lines - 1);
        const text = words([name, ...value]);
        return { ...item, label: { ...d.label, formatter: () => text } };
    });
    return { label, data };
}

/**
 * A heatmap's numbers in the ink that reads on their cell (labelColorOn on the colour ECharts drew it
 * in): one rich style per ink, so the cells keep their data as they are.
 * @param {any} label  the series' label
 * @param {string[]} inks  the theme's text and background colours
 * @param {((color: string) => string | null) | undefined} readColor
 */
function inkedLabel(label, inks, readColor) {
    if (!inks.length || typeof label?.formatter !== "function") {
        return { ...label, color: inks[0] };
    }
    const format = label.formatter;
    const all = [...inks, ...EXTREME_INKS];
    const keyOf = (/** @type {unknown} */ fill) => `ink${all.indexOf(inkOn(fill, inks, readColor))}`;
    return {
        ...label,
        color: inks[0],
        formatter: (/** @type {any} */ p) => styled(keyOf(p.color), format(p)),
        rich: Object.fromEntries(all.map((c, i) => [`ink${i}`, { color: c }]))
    };
}

/**
 * A heatmap's colours as ECharts can mix them. ECharts works out each cell's colour from the scale's
 * ends itself, and its parser reads hex, rgb(), hsl() and some names only: any other colour (oklch(),
 * rgb() with spaces) turns the cells black. `readColor` gives a colour ECharts reads (the colour as
 * it is, or the same colour another way), or null; an end it gives none for takes DEFAULT_THEME's.
 * @param {string[]} colors  low to high
 * @param {(color: string) => string | null} readColor
 */
function heatmapColors(colors, readColor) {
    const fallback = DEFAULT_THEME.colorScale;
    return colors.map((c, i) => readColor(String(c)) ?? fallback[i === 0 ? 0 : fallback.length - 1]);
}

/** A chart narrower than this writes the reference lines' names before their values only where they fit (briefWords). */
const LINE_VALUE_MIN_WIDTH = 480;
/** On a narrow chart, the share of its width a reference line's label may take with its name. */
const LINE_WORDS_SHARE = 0.3;
/** Room (px) between the plot and a reference line's label right of it. */
const LINE_LABEL_GAP = 6;

/** The words of a reference line's label, without its sample: its name and value (a trend's name). */
const wordsOf = (/** @type {any} */ item) => String(item.label.formatter()).replace(/^\{s\|[^}]*\} /, "");

/**
 * The words of reference lines' labels on a chart `width` px wide (narrower than LINE_VALUE_MIN_WIDTH),
 * by line: each its name and value where every label with its sample takes at most LINE_WORDS_SHARE of
 * the width, else each its value alone (`brief`; a trend its name). All or none, so the labels read
 * alike. Without the names the samples' dashes tell the kinds.
 * @param {any[]} items  the lines' markLine items (their first point for a trend)
 * @param {number} width
 * @param {number} fontSize
 * @returns {Map<any, string>}
 */
function briefWords(items, width, fontSize) {
    const sampleOf = (/** @type {any} */ item) => LINE_SAMPLES[/** @type {keyof typeof LINE_SAMPLES} */ (item.lineStyle?.type)] ?? "";
    const named = items.every((item) => textWidth(`${sampleOf(item)} ${wordsOf(item)}`, fontSize) <= width * LINE_WORDS_SHARE);
    return new Map(items.map((item) => [item, named ? wordsOf(item) : String(item.brief ?? item.name ?? "")]));
}

/**
 * The reference lines of upright lines (horizontal bars) on a narrow chart: each label with the words
 * briefWords gives, its line's name where every label fits, else the value.
 * @param {any[]} series
 * @param {number} width
 * @param {number} fontSize
 */
function uprightWords(series, width, fontSize) {
    const head = (/** @type {any} */ d) => (Array.isArray(d) ? d[0] : d);
    const brief = briefWords(series.flatMap((s) => (s.markLine?.data ?? []).map(head)), width, fontSize);
    return series.map((s) => (s.markLine ? { ...s, markLine: { ...s.markLine, data: s.markLine.data.map((/** @type {any} */ d) => withWords(d, /** @type {string} */ (brief.get(head(d))))) } } : s));
}

/** A reference line's markLine item with its label writing `words` after its sample. */
const withWords = (/** @type {any} */ d, /** @type {string} */ words) => {
    const head = Array.isArray(d) ? d[0] : d;
    const label = { ...head.label, formatter: () => lineLabelText(head.lineStyle?.type, words) };
    return Array.isArray(d) ? [{ ...head, label }, d[1]] : { ...head, label };
};

/**
 * The labels of lying reference lines (pivotkit-core's markLines): right of the plot, as wide as the
 * widest takes, and kept apart: from the highest down, a label closer than a line of text to the one
 * above moves down. `pixelOf` gives each line's real height in the chart (ECharts' convertToPixel,
 * after a first draw): the labels then sit at their lines. Without it the heights are estimated on a
 * scale at most as fine as ECharts' (it never stretches the values over less than half the axis, nor
 * the plot over less than about half the chart), so the labels end at least as far apart as
 * estimated. A chart narrower than LINE_VALUE_MIN_WIDTH writes the lines' names only where they fit
 * (briefWords), and leaves out a
 * label that would sit more than one and a half lines from its line; the tooltip has every value. A
 * trend on bars ends at the middle of the last bar: its label moves right by half a bar's band.
 * @param {any[]} series  the decorated series
 * @param {{ width: number, height: number, grid: any, fontSize: number, pixelOf?: (value: number) => number }} chart
 * @returns {{ series: any[], room: number } | null}
 */
function lineLabels(series, { width, height, grid, fontSize, pixelOf }) {
    /** @type {{ item: any, si: number, di: number, value: number, trend: boolean }[]} */
    const labels = [];
    series.forEach((s, si) =>
        (s.markLine?.data ?? []).forEach((/** @type {any} */ d, /** @type {number} */ di) => {
            const head = Array.isArray(d) ? d[0] : d;
            if (head.label?.show === false) return;
            const value = Array.isArray(d) ? d[1].coord[1] : d.yAxis;
            if (typeof value === "number") labels.push({ item: head, si, di, value, trend: Array.isArray(d) });
        })
    );
    if (!labels.length) {
        return null;
    }
    const narrow = width < LINE_VALUE_MIN_WIDTH;
    // the widest label: its sample, a space and its words
    /** @type {Map<any, string>} the words of each label on a narrow chart */
    const brief = narrow ? briefWords(labels.map((l) => l.item), width, fontSize) : new Map();
    const textOf = (/** @type {any} */ item) => `${LINE_SAMPLES[/** @type {keyof typeof LINE_SAMPLES} */ (item.lineStyle?.type)] ?? ""} ${brief.get(item) ?? wordsOf(item)}`;
    const widest = Math.max(...labels.map((l) => textWidth(textOf(l.item), fontSize)));
    // without the real heights: the values' span (the data, a stack's tops, 0 and the lines) on a coarse scale
    const numbers = series.flatMap((s) => (s.data ?? []).filter((/** @type {unknown} */ v) => typeof v === "number"));
    const tops = series.some((s) => s.stack) ? (series[0]?.data ?? []).map((/** @type {unknown} */ _, /** @type {number} */ i) => series.reduce((sum, s) => sum + (typeof s.data?.[i] === "number" && s.data[i] > 0 ? s.data[i] : 0), 0)) : [];
    const all = [0, ...numbers, ...tops, ...labels.map((l) => l.value)];
    const span = Math.max(...all) - Math.min(...all) || 1;
    const plot = Math.max(1, (height - (typeof grid.top === "number" ? grid.top : 0) - (typeof grid.bottom === "number" ? grid.bottom : 0)) * 0.5);
    const scale = plot / (2 * span);
    const yOf = (/** @type {number} */ v) => (pixelOf ? pixelOf(v) : -v * scale);
    const line = Math.ceil(fontSize * 1.3);
    // half a bar's band: the plot's width, estimated without the value axis's labels, per category
    const categories = Math.max(1, ...series.map((s) => (Array.isArray(s.data) ? s.data.length : 0)));
    const band = series.some((s) => s.type === "bar") ? Math.max(0, width - grid.left - grid.right - widest - 48) / categories / 2 : 0;
    /** @type {Map<any, number>} */
    const offsets = new Map();
    let below = -Infinity;
    // from the top down; lines at one height in the order they are drawn
    for (const l of [...labels].sort((a, b) => yOf(a.value) - yOf(b.value))) {
        const y = yOf(l.value);
        const placed = Math.max(y, below + line);
        offsets.set(l.item, placed - y);
        below = placed;
    }
    const placed = series.map((s, si) =>
        s.markLine
            ? {
                  ...s,
                  markLine: {
                      ...s.markLine,
                      data: s.markLine.data.map((/** @type {any} */ d, /** @type {number} */ di) => {
                          const head = Array.isArray(d) ? d[0] : d;
                          const l = labels.find((x) => x.si === si && x.di === di);
                          if (!l) return d;
                          const dy = offsets.get(head) ?? 0;
                          const far = narrow && dy > line * 1.5;
                          const label = { ...head.label, offset: [l.trend ? band : 0, dy], ...(far ? { show: false } : {}) };
                          const item = Array.isArray(d) ? [{ ...head, label }, d[1]] : { ...head, label };
                          return narrow ? withWords(item, /** @type {string} */ (brief.get(head))) : item;
                      })
                  }
              }
            : s
    );
    return { series: placed, room: Math.ceil(widest) + 2 * LINE_LABEL_GAP };
}

/**
 * Mark styles on top of the core's option: rounded bar ends, 2 px lines, tooltips in the theme, built
 * as DOM nodes (chart-tooltip.js) so a strict Content-Security-Policy allows them.
 * @param {any} option  toEChartsOption()'s
 * @param {{ getPropertyValue(name: string): string }} style  the --pk-* tokens: a report's computed
 *   style, or a map of tokens wrapped (pivotkit-report)
 * @param {{ height?: number, width?: number, categoryNames?: string[], axisLabels?: string,
 *   tooltipFormatter?: (context: { valueFormatter?: (v: unknown) => string, shareFormatter?: (v: number) => string, xNames?: string[], yNames?: string[], categoryNames?: string[] }) => unknown,
 *   readColor?: (color: string) => string | null, parseColor?: (color: string) => unknown, zoom?: string, zoomAt?: { start: number, end: number }, timeline?: boolean, touch?: boolean,
 *   pixelOf?: (value: number) => number, tileOf?: (index: number, name: string) => { width: number, height: number } | null }} [size]
 *   height and width: the chart's size in px (the room around a pie, a heatmap's column names, the
 *   category axis); categoryNames: the categories' whole names (the tooltip's title when the axis
 *   writes them shorter); axisLabels: the view's chart.axisLabels; tooltipFormatter: builds the
 *   tooltip's formatter (pivotkit-react's DOM tooltip), left out for a chart without one (an SVG);
 *   readColor: a heatmap colour as one ECharts can mix, or null (see heatmapColors); parseColor:
 *   ECharts' colour parser (color.parse), so a treemap's tile in any colour ECharts reads (a name,
 *   hsl()) is measured against its text (tileLookOf); zoom: the view's
 *   chart.zoom, for a chart on a screen (chart-zoom.js); without it every category is drawn; zoomAt:
 *   the slider's window from before; timeline: the categories run along a time line (the first window
 *   shows the latest); touch: a finger points (the slider takes --pk-target-touch); pixelOf: a value's
 *   height in the drawn chart (ECharts' convertToPixel after a first draw), so the labels of the
 *   reference lines sit at their lines (lineLabels); tileOf: a treemap's tile in the drawn chart by
 *   its item (drawnTiles), so each label writes what fits its tile (treemapLabels)
 * @returns {any}  the option; `axisEvery` (not ECharts') is n when the category axis writes every n-th label
 */
export function decorateOption(option, style, { height = 480, width = 800, categoryNames, axisLabels, tooltipFormatter, readColor, parseColor, zoom, zoomAt, timeline = false, touch = false, pixelOf, tileOf } = {}) {
    const extra = { categoryNames, axisLabels };
    const first = (a) => (Array.isArray(a) ? a[0] : a);
    const v = (name) => style.getPropertyValue(name).trim();
    // the size the core wrote the texts at (the theme's textSize, --pk-chart-text-size): the layout
    // below measures with it
    const fontSize = typeof option.textStyle?.fontSize === "number" ? option.textStyle.fontSize : DEFAULT_THEME.textSize;
    // a legend on the right of a narrow chart goes to the bottom (RIGHT_LEGEND_MIN_WIDTH): the room the
    // core keeps for it on the right is given back, the room of a bottom legend taken
    const rightLegend = option.legend?.orient === "vertical" && typeof option.legend.right === "number";
    const legendDown = rightLegend && width < RIGHT_LEGEND_MIN_WIDTH;
    if (legendDown) {
        option = {
            ...option,
            legend: { ...without(option.legend, ["orient", "right", "top"]), bottom: 0 },
            series: (option.series || []).map((s) => (s.type === "pie" ? { ...without(s, ["right"]), bottom: (typeof s.bottom === "number" ? s.bottom : 0) + BOTTOM_LEGEND_ROOM } : s)),
            ...(option.grid ? { grid: { ...without(option.grid, ["right"]), bottom: BOTTOM_LEGEND_ROOM + 8 } } : {})
        };
    }
    // without the stylesheet the tokens are empty and ECharts keeps its own colours
    const surface = v("--pk-surface") || undefined;
    // the marks' corners (--pk-radius-chart in px; pivotkit-react resolves it), a heatmap's cells three
    // quarters of it; the tooltip's, a DOM node in the report, as CSS (--pk-radius-card)
    const r = pxOf(v("--pk-radius-chart")) ?? DEFAULT_THEME.markRadius;
    const cell = Math.round(r * 0.75 * 100) / 100;
    const tooltip = {
        ...option.tooltip,
        backgroundColor: v("--pk-surface-raised") || surface,
        borderColor: v("--pk-border") || undefined,
        textStyle: { color: v("--pk-text") || undefined, fontFamily: style.getPropertyValue("font-family") || undefined, fontSize },
        extraCssText: `box-shadow: ${v("--pk-shadow") || "none"}; border-radius: ${v("--pk-radius-card") || `${DEFAULT_THEME.cardRadius}px`};`,
        ...(tooltipFormatter ? { formatter: tooltipFormatter({ valueFormatter: option.tooltip?.valueFormatter, shareFormatter: option.tooltip?.shareFormatter, xNames: first(option.xAxis)?.data, yNames: first(option.yAxis)?.data, categoryNames: extra.categoryNames }) } : {})
    };
    // the room of a heatmap that is not cells: its grid's margins and the column names as written
    const cellFrame = (option.series || []).some((s) => s.type === "heatmap") ? heatmapFrame({ top: option.grid?.top, bottom: option.grid?.bottom, names: option.xAxis?.data ?? [], width, fontSize }) : undefined;
    // the labels of the high and low points read over a line they cross: an outline in the background's
    // colour, the dot a ring of it
    const halo = surface ? { textBorderColor: surface, textBorderWidth: POINT_HALO } : {};
    const ringed = (/** @type {any} */ s) => (s.markPoint ? { ...s, markPoint: { ...s.markPoint, data: s.markPoint.data.map((/** @type {any} */ d) => ({ ...d, itemStyle: { ...d.itemStyle, ...(surface ? { borderColor: surface, borderWidth: 1.5 } : {}) }, label: { ...d.label, ...halo, rich: Object.fromEntries(Object.entries(d.label?.rich ?? {}).map(([k, r]) => [k, { ...r, ...halo }])) } })) } } : s);
    // a bar lights up alone, as the tooltip names it alone; a line lights up as a whole
    let series = (option.series || []).map(ringed).map((s) => {
        if (s.type === "bar") {
            const horizontal = first(option.yAxis)?.type === "category";
            const corners = horizontal ? [0, r, r, 0] : [r, r, 0, 0];
            return { ...s, barMaxWidth: 48, itemStyle: { ...s.itemStyle, borderRadius: s.stack ? 0 : corners, borderColor: s.stack ? surface : undefined, borderWidth: s.stack ? 1 : 0 }, emphasis: { focus: "self" } };
        }
        if (s.type === "line") {
            return { ...s, lineStyle: { ...s.lineStyle, width: 2 }, symbolSize: 7, smooth: Boolean(s.smooth), areaStyle: s.areaStyle ? { ...s.areaStyle, opacity: 0.18 } : undefined, emphasis: { focus: "series" } };
        }
        if (s.type === "pie") {
            // the pie's box: below the legend (the core's top), with room for the labels above and below
            const room = pieLabelRoom(height);
            const top = (typeof s.top === "number" ? s.top : 0) + room;
            const bottom = (typeof s.bottom === "number" ? s.bottom : 0) + room;
            // numbers inside a ring too thin for them (a low or narrow chart) would spill over its edges
            // onto the background: they are written outside, on a line to their slice, instead
            let label = s.label;
            // ECharts needs an explicit outside guide line on the first draw: an
            // undefined labelLine replaces its defaults and leaves the labels unplaced.
            let line = s.labelLine ?? { show: true };
            const box = { width: width - (typeof s.right === "number" ? s.right : 0), height: height - top - bottom };
            if (label?.position === "inside" && label.show !== false && Array.isArray(s.radius)) {
                if (!ringLabelsFit(s.radius, box, typeof label.formatter === "function" ? pieLabelTexts(s) : [], fontSize)) {
                    label = without(label, ["position"]);
                    line = { show: true };
                }
            }
            const legendShown = Boolean(option.legend) && option.legend.show !== false;
            // no legend names the slices: where their labels outside have no room, the smallest go into
            // one slice "Other (n)" (otherSlices), on the screen, in an SVG and in print alike
            const outside = label?.show !== false && label?.position !== "inside";
            const merged = !legendShown && outside ? otherSlices({ ...s, label, labelLine: line }, box, { fontSize, color: v("--pk-chart-other") || v("--pk-muted") || undefined, hidden: option.legend?.selected ?? {} }) : null;
            if (merged) s = { ...s, data: merged };
            // labels outside: room beside the pie, on lines where they are long, left out where a side has no room (pieLabelFit)
            const fit = pieLabelFit({ ...s, label, labelLine: line }, box, { fontSize, legend: legendShown });
            label = fit.label ?? label;
            return { ...s, top, bottom, ...fit, labelLine: fit.labelLine ?? line, itemStyle: { ...s.itemStyle, borderColor: surface, borderWidth: 2, borderRadius: r }, label: { ...label, color: label?.position === "inside" ? undefined : v("--pk-text") || undefined } };
        }
        if (s.type === "treemap") {
            // the labels in the tile text's colour, a tile darkened where it needs (treemapLabels); the
            // tiles parted by the background's colour
            return { ...s, itemStyle: { ...s.itemStyle, borderColor: surface, borderRadius: cell }, ...treemapLabels(s, tileLookOf(v, { fontSize, readColor, parseColor }), tileOf) };
        }
        if (s.type === "heatmap") {
            // numbers only in cells large enough for them (heatmapCellLabels); the tooltip has every one
            const texts = typeof s.label?.formatter === "function" ? s.data.map((/** @type {any} */ d) => s.label.formatter({ value: d })) : [];
            const fits = heatmapCellLabels(option.xAxis?.data?.length ?? 1, option.yAxis?.data?.length ?? 1, width, height, texts, fontSize, cellFrame);
            const inks = [v("--pk-text"), surface].filter((c) => typeof c === "string" && c !== "");
            return { ...s, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: cell }, label: { ...inkedLabel(s.label, inks, readColor), show: Boolean(s.label?.show) && fits } };
        }
        return s;
    });
    const legend = option.legend ? { ...option.legend, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { ...option.legend.textStyle, color: v("--pk-text") || undefined } } : undefined;
    const grid = option.grid ? { left: 12, right: 24, bottom: option.visualMap ? HEATMAP_GRID_BOTTOM : 12, containLabel: true, ...option.grid } : undefined;
    // the values past the end of horizontal bars keep their room on the right (valueLabelRoom)
    if (grid) grid.right += valueLabelRoom(series, fontSize);
    // the labels of lying reference lines: right of the plot, kept apart, with room
    const lines = grid && first(option.yAxis)?.type === "value" ? lineLabels(series, { width, height, grid, fontSize, pixelOf }) : null;
    // upright lines (horizontal bars) have a row each above the plot; a narrow chart writes their names where they fit
    if (grid && !lines && width < LINE_VALUE_MIN_WIDTH) series = uprightWords(series, width, fontSize);
    if (lines) {
        grid.right += lines.room;
        series = lines.series;
    }
    // the labels of the high and low points: inside the plot (the value axis reaches past them) and apart
    const horizontalBars = first(option.yAxis)?.type === "category";
    const valueKey = horizontalBars ? "xAxis" : "yAxis";
    const points = grid ? pointLabels(series, { width, height, grid, fontSize, horizontal: horizontalBars, axis: first(option[valueKey]), pixelOf, legend: option.legend }) : null;
    /** @type {Record<string, any>} */
    const reach = {};
    if (points) {
        series = points.series;
        const own = first(option[valueKey]);
        reach[valueKey] = { ...own, ...(points.dataMin !== undefined ? { dataMin: points.dataMin } : {}), ...(points.dataMax !== undefined ? { dataMax: points.dataMax } : {}) };
    }
    // a heatmap names every column: slanted where they would overlap (columnLabelLayout)
    const heatmap = series.some((s) => s.type === "heatmap") && option.xAxis?.axisLabel;
    const xAxis = heatmap ? { ...option.xAxis, axisLabel: { ...option.xAxis.axisLabel, ...columnLabelLayout(option.xAxis.data ?? [], width, fontSize) } } : option.xAxis;
    // and its rows: every name where a line fits each row, else every n-th (rowLabelInterval)
    const yAxis = heatmap && option.yAxis ? { ...option.yAxis, axisLabel: { ...option.yAxis.axisLabel, interval: rowLabelInterval(option.yAxis.data?.length ?? 0, height, fontSize, cellFrame) } } : option.yAxis;
    // a long title ends in "…" within the chart's width (the PNG is drawn from the same option)
    const title = option.title ? { title: { ...option.title, textStyle: { ...option.title.textStyle, width: Math.max(40, width - 32), overflow: "truncate" } } } : {};
    // bars, lines and areas: the category axis writes every label that fits (categoryLabelLayout), the
    // group labels sit below (or left of) those labels
    // two value axes (a combo) named above the plot: each name within half the chart, cut with "…";
    // a narrow chart leaves the names out (the legend names the series in the same colours) and gives
    // their line of room back to the plot
    const named = Array.isArray(yAxis) && yAxis.length === 2 && yAxis.every((a) => a?.type === "value" && a.name);
    const narrowCombo = named && width < LINE_VALUE_MIN_WIDTH;
    if (narrowCombo && grid && typeof grid.top === "number") grid.top -= fontSize + 10;
    const halves = named ? yAxis.map((/** @type {any} */ a) => (narrowCombo ? { ...a, name: "" } : { ...a, nameTruncate: { maxWidth: Math.max(40, Math.floor((width - COMBO_AXES_ROOM) / 2) - 8), ellipsis: "…" } })) : null;
    let axes = { xAxis: reach.xAxis ?? xAxis, yAxis: halves ?? reach.yAxis ?? yAxis };
    let axisEvery = 1;
    /** @type {object | null} the zoom slider (chart-zoom.js) */
    let slider = null;
    const along = !heatmap && series.some((s) => s.type === "bar" || s.type === "line") ? (first(option.yAxis)?.type === "category" ? "yAxis" : first(option.xAxis)?.type === "category" ? "xAxis" : null) : null;
    if (along) {
        let list = Array.isArray(axes[along]) ? axes[along] : [axes[along]];
        // "auto" group labels need room: below it the axis writes the whole names instead
        const group = list[1]?.groups ? list[1] : null;
        if (group && group.groupsAuto && !groupLabelsFit(list[0].data?.length ?? 0, group.groupSize ?? 1, { width, height, horizontal: along === "yAxis" })) {
            list = [{ ...list[0], data: extra.categoryNames ?? list[0].data }];
        }
        const names = list[0].data ?? [];
        // the height that is neither plot nor category labels: the grid's margins and a line of group labels
        const reserved = (typeof grid?.top === "number" ? grid.top : 0) + (typeof grid?.bottom === "number" ? grid.bottom : 0) + (list[1]?.groups ? groupLabelLine(fontSize) : 0);
        const box = { width, height, horizontal: along === "yAxis", mode: extra.axisLabels, fontSize, reserved };
        let layout = categoryLabelLayout(names, box);
        // a zoom slider shows a window of the categories: their labels are laid out for the window
        const shown = zoomWindow(zoom, names.length, layout.every);
        // the slider's thickness: a control's least size, a finger's on a touch screen (the tokens)
        const sliderSize = pxOf(v(touch ? "--pk-target-touch" : "--pk-target")) ?? ZOOM_SLIDER.size;
        const range = shown ? zoomRange(names.length, shown, zoomAt, timeline) : null;
        if (range) {
            // the slider takes its room from the height the labels may take
            const room = { ...box, reserved: reserved + (along === "yAxis" ? 0 : sliderSize + ZOOM_SLIDER.gap) };
            const count = range.end - range.start + 1;
            layout = categoryLabelLayout(count < names.length ? longestNames(names, count) : names, room);
        }
        axisEvery = layout.every;
        const longest = Math.min(layout.width, categoryLabelWidth(names, fontSize));
        const offset = groupLabelOffset({ beside: along === "yAxis", slanted: Boolean(layout.rotate), longest, fontSize });
        const main = { ...list[0], axisLabel: { ...list[0].axisLabel, rotate: layout.rotate, interval: layout.interval, width: layout.width, overflow: layout.overflow } };
        // a group's name is cut to the room of its smallest group, so two names never run into each other
        const slot = categorySlot(names.length, { width, height, horizontal: along === "yAxis" });
        const groupWidth = along === "yAxis" ? CATEGORY_LABEL_WIDTH : Math.max(24, Math.round(slot * (list[1]?.groupSize ?? 1)) - 8);
        const rest = list.slice(1).map((a) => (a.groups ? { ...a, offset, axisTick: { ...a.axisTick, length: offset }, axisLabel: { ...a.axisLabel, width: groupWidth, overflow: "truncate" } } : a));
        axes = { ...axes, [along]: rest.length ? [main, ...rest] : main };
        if (range && grid) {
            const beside = along === "yAxis";
            // beyond a legend on that side; the plot gives the slider its room
            const offset = beside ? (rightLegend && !legendDown && typeof option.grid?.right === "number" ? option.grid.right - 4 : 4) : option.legend && option.legend.bottom === 0 ? BOTTOM_LEGEND_ROOM : 4;
            const color = (name) => (readColor ? (readColor(v(name)) ?? undefined) : v(name) || undefined);
            slider = zoomSlider({ beside, axes: 1 + rest.length, range, offset, size: sliderSize, fontSize, colors: { line: color("--pk-border"), fill: color("--pk-accent-soft"), handle: color("--pk-accent"), text: color("--pk-muted") } });
            grid[beside ? "right" : "bottom"] += sliderSize + ZOOM_SLIDER.gap;
        }
        // horizontal bars: fewer ticks where the value axis's labels would run into each other
        const value = along === "yAxis" && !Array.isArray(axes.xAxis) && axes.xAxis?.type === "value" ? axes.xAxis : null;
        if (value && grid && typeof value.axisLabel?.formatter === "function") {
            const beside = rest.length ? offset + CATEGORY_LABEL_WIDTH : longest + AXIS_LABEL_MARGIN;
            const plotWidth = width - grid.left - grid.right - beside;
            const splitNumber = valueAxisSplit(barExtent(series), { plotWidth, fontSize, format: value.axisLabel.formatter });
            if (splitNumber) axes = { ...axes, xAxis: { ...value, splitNumber } };
        }
    }
    const visualMap = readColor && Array.isArray(option.visualMap?.inRange?.color) ? { visualMap: { ...option.visualMap, inRange: { ...option.visualMap.inRange, color: heatmapColors(option.visualMap.inRange.color, readColor) } } } : {};
    return { ...option, ...title, ...visualMap, tooltip, series, ...(axes.xAxis ? { xAxis: axes.xAxis } : {}), ...(axes.yAxis ? { yAxis: axes.yAxis } : {}), ...(legend ? { legend } : {}), ...(grid ? { grid } : {}), ...(slider ? { dataZoom: [slider] } : {}), animationDuration: style.getPropertyValue("--pk-duration").trim() === "0ms" ? 0 : 400, axisEvery };
}
