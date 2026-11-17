/*
 * The zoom slider under the category axis of bars, lines and areas (`chart.zoom`), for decorateOption
 * (chart-style.js): how many categories it shows first, and the ECharts dataZoom that draws it. Only a
 * chart on a screen asks for it; an SVG and a printed report draw every category.
 */

/** The slider's thickness by default (a control's least size, --pk-target) and the room between it and the axis labels, in px. */
export const ZOOM_SLIDER = Object.freeze({ size: 24, gap: 8 });

/**
 * When "auto" adds a slider: more categories than `categories`, or an axis that would leave out
 * `skipped` labels or more between two it writes (it writes every 4th or fewer).
 */
export const ZOOM_AUTO = Object.freeze({ categories: 20, skipped: 3 });

/**
 * How many categories the slider shows first, or 0 for no slider. "auto": a slider only for more
 * than ZOOM_AUTO.categories categories, or when the axis would leave out ZOOM_AUTO.skipped labels
 * or more between two; "on": always. The first window holds as many categories as the axis can name
 * (all of them when it can name all); "off" and anything else: no slider.
 * @param {string | undefined} mode  chart.zoom
 * @param {number} count  the categories
 * @param {number} every  n when the axis writes every n-th label of all of them (categoryLabelLayout)
 */
export function zoomWindow(mode, count, every) {
    const auto = count > ZOOM_AUTO.categories || every - 1 >= ZOOM_AUTO.skipped;
    if ((mode !== "auto" && mode !== "on") || count < 2 || (mode === "auto" && !auto)) {
        return 0;
    }
    return Math.min(count, Math.max(2, Math.floor(count / every)));
}

/**
 * The first and last category the slider shows: the window kept from before (within the
 * categories), else `shown` of them, the latest ones on a time line, else the first ones.
 * @param {number} count  the categories
 * @param {number} shown  zoomWindow's
 * @param {{ start: number, end: number } | undefined} kept
 * @param {boolean} latest  the categories run along a time line
 * @returns {{ start: number, end: number }}
 */
export function zoomRange(count, shown, kept, latest) {
    if (kept && Number.isInteger(kept.start) && Number.isInteger(kept.end) && kept.start >= 0 && kept.end < count && kept.start < kept.end) {
        return { start: kept.start, end: kept.end };
    }
    return latest ? { start: count - shown, end: count - 1 } : { start: 0, end: shown - 1 };
}

/**
 * The `count` longest names: the window's labels are laid out for the longest it can show.
 * @param {string[]} names
 * @param {number} count
 */
export function longestNames(names, count) {
    return [...names].sort((a, b) => String(b).length - String(a).length).slice(0, count);
}

/**
 * The ECharts slider for the window `range`: under the plot, or for horizontal bars right of it, with
 * the tokens' colours. Its ends can widen it to every category; the chart then lays its labels out
 * again (pivotkit-react).
 * @param {{ beside: boolean, axes: number, range: { start: number, end: number }, offset: number, size: number, fontSize: number, colors: { line?: string, fill?: string, handle?: string, text?: string } }} at
 *   beside: the category axis is vertical (horizontal bars); axes: the category axes the slider drives
 *   (2 with group labels); offset: px from the chart's edge (a legend's room); size: its thickness
 *   (a control's size, larger for a finger); fontSize: the names at its ends, the chart's text size
 */
export function zoomSlider({ beside, axes, range, offset, size, fontSize, colors }) {
    const index = Array.from({ length: axes }, (_, i) => i);
    return {
        type: "slider",
        ...(beside ? { yAxisIndex: index, orient: "vertical", width: size, right: offset, top: "middle" } : { xAxisIndex: index, height: size, bottom: offset }),
        startValue: range.start,
        endValue: range.end,
        // the slider moves whole categories; its ends name the first and last one shown
        minValueSpan: 1,
        brushSelect: false,
        borderColor: colors.line,
        fillerColor: colors.fill,
        handleStyle: { color: colors.handle, borderColor: colors.handle },
        moveHandleStyle: { color: colors.handle },
        textStyle: { color: colors.text, fontSize },
        dataBackground: { lineStyle: { color: colors.line }, areaStyle: { color: colors.line } }
    };
}
