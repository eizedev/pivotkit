/*
 * The zoom slider under the category axis of bars, lines and areas (`chart.zoom`), for decorateOption
 * (chart-style.js): how many categories it shows first, and the ECharts dataZoom that draws it. Only a
 * chart on a screen asks for it; an SVG and a printed report draw every category.
 */

/** The slider's thickness (a control's least size, --pk-target) and the room between it and the axis labels, in px. */
export const ZOOM_SLIDER = Object.freeze({ size: 24, gap: 8 });

/**
 * How many categories the slider shows first, or 0 for no slider. "auto": a slider only while the
 * axis cannot write every label (`every` > 1), showing as many as it can write; "on": always, first
 * every category the axis can write; "off" and anything else: none.
 * @param {string | undefined} mode  chart.zoom
 * @param {number} count  the categories
 * @param {number} every  n when the axis writes every n-th label of all of them (categoryLabelLayout)
 */
export function zoomWindow(mode, count, every) {
    if ((mode !== "auto" && mode !== "on") || count < 2 || (mode === "auto" && every <= 1)) {
        return 0;
    }
    return Math.min(count, Math.max(2, Math.floor(count / every)));
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
 * The ECharts slider for a window of `shown` categories from the first one: under the plot, or for
 * horizontal bars right of it, with the tokens' colours. The window never grows past `shown`: the
 * labels are laid out for that many, so a wider one would write them over each other.
 * @param {{ beside: boolean, axes: number, shown: number, offset: number, fontSize: number, colors: { line?: string, fill?: string, handle?: string, text?: string } }} at
 *   beside: the category axis is vertical (horizontal bars); axes: the category axes the slider drives
 *   (2 with group labels); offset: px from the chart's edge (a legend's room); fontSize: the names at
 *   the slider's ends, the chart's text size
 */
export function zoomSlider({ beside, axes, shown, offset, fontSize, colors }) {
    const index = Array.from({ length: axes }, (_, i) => i);
    return {
        type: "slider",
        ...(beside ? { yAxisIndex: index, orient: "vertical", width: ZOOM_SLIDER.size, right: offset, top: "middle" } : { xAxisIndex: index, height: ZOOM_SLIDER.size, bottom: offset }),
        startValue: 0,
        endValue: shown - 1,
        // the slider moves whole categories; its ends name the first and last one shown
        minValueSpan: 1,
        maxValueSpan: shown - 1,
        brushSelect: false,
        borderColor: colors.line,
        fillerColor: colors.fill,
        handleStyle: { color: colors.handle, borderColor: colors.handle },
        moveHandleStyle: { color: colors.handle },
        textStyle: { color: colors.text, fontSize },
        dataBackground: { lineStyle: { color: colors.line }, areaStyle: { color: colors.line } }
    };
}
