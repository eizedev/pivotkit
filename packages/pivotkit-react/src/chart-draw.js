/*
 * The chart's ECharts instance: started on the chart's element with its events (a click's and a tap's
 * menu, the tooltip that follows the pointer, the legend and the zoom slider, the size), and each draw
 * of the option. Only a drawn chart needs this: it loads with ECharts (echarts.js), so the first load
 * carries only chart.jsx's frame and its text alternative. It imports nothing the first load has of
 * pivotkit-react: what it needs of it (chart-types.js) comes as arguments.
 */

import { chartThemeFrom } from "pivotkit-core";
import { toEChartsOption } from "pivotkit-core/chart";
import { color, init } from "echarts/core";
import { cleanChartOptions } from "./chart-options.js";
import { colorMapFor } from "./chart-colors.js";
import { chartStyle, drawOption } from "./chart-decorate.js";
import { chartKeeper, shownOf, zoomKeyProps } from "./chart-legend.js";
import { tokenWatcher } from "./chart-tokens.js";
import { chartLines } from "./chart-tooltip.js";

/** How long a tap's tooltip waits for the second tap that opens its menu, in ms. */
const TAP_WAIT = 10_000;
/**
 * How long a click waits for a second one before its menu opens, in ms (#53): a double click opens the
 * rows at once, and its second click has to reach the chart, not the menu over it. A tap opens the
 * menu at once (touch has its own first tap: the tooltip).
 */
const DOUBLE_WAIT = 300;

/**
 * The tooltip follows the bar, segment or line point under the pointer (`hover` keeps it), not only
 * the category: ECharts draws the tooltip before it reports the element under the pointer, so the
 * element is kept and the tooltip drawn again at the pointer. hideTip first: at the same category
 * ECharts keeps what it drew and would not call the formatter again. An area's fill and a line
 * between its points have no dataIndex: no element. Every move counts, not only mouseover: ECharts
 * reports mouseover only for an element other than the one it last saw under the pointer, and it
 * keeps that one when the pointer leaves in one move (a tap elsewhere) and across a redraw. While
 * `held()` (a point's menu is open) no tooltip is drawn.
 * @param {any} instance  the ECharts instance
 * @param {{ current: { seriesIndex: number, dataIndex: number } | null }} hover
 * @param {() => boolean} held
 */
function followPointer(instance, hover, held) {
    const redraw = (/** @type {any} */ e) => {
        const at = e?.event;
        if (at && typeof at.offsetX === "number") {
            instance.dispatchAction({ type: "hideTip" });
            if (!held()) instance.dispatchAction({ type: "showTip", x: at.offsetX, y: at.offsetY });
        }
    };
    instance.on("mousemove", (/** @type {any} */ e) => {
        if (e.componentType === "series" && (e.seriesType === "bar" || e.seriesType === "line") && typeof e.dataIndex === "number") {
            const last = hover.current;
            if (last?.seriesIndex !== e.seriesIndex || last?.dataIndex !== e.dataIndex) {
                hover.current = { seriesIndex: e.seriesIndex, dataIndex: e.dataIndex };
                redraw(e);
            }
        }
    });
    instance.on("mouseout", (/** @type {any} */ e) => {
        if (hover.current) {
            hover.current = null;
            redraw(e);
        }
    });
}

/**
 * The point an event of ECharts hit: its category and series as the view's paths, its value, its
 * names; a slice (a pie's) adds up every column, a tile (a treemap's) is none.
 * @param {any} p  the event
 * @param {any} s  the series drawn (pivotkit-core's toSeries)
 */
function pointOf(p, s) {
    const kind = p.seriesType;
    if (!s || kind === "treemap") {
        return null;
    }
    if (kind === "pie") {
        const path = s.categoryPaths[p.dataIndex];
        return path ? { rowPath: path, colPath: [], valueIndex: s.series[0]?.valueIndex ?? 0, value: p.value, slice: true, rowLabel: s.categories[p.dataIndex] } : null;
    }
    const seriesEntry = kind === "heatmap" ? s.series.filter((/** @type {any} */ x) => x.valueIndex === s.series[0]?.valueIndex)[p.value?.[0]] : s.series[p.seriesIndex];
    const row = kind === "heatmap" ? p.value?.[1] : p.dataIndex;
    if (!seriesEntry || !s.categoryPaths[row]) {
        return null;
    }
    // a 100 % stack's part draws its share: the rows go with its value
    const value = kind === "heatmap" ? p.value[2] : typeof p.data?.raw === "number" ? p.data.raw : p.value;
    return { rowPath: s.categoryPaths[row], colPath: seriesEntry.colPath, valueIndex: seriesEntry.valueIndex, value, rowLabel: s.categories[row], colLabel: seriesEntry.colPath.length ? seriesEntry.name : undefined };
}

/**
 * @typedef {object} ChartRefs  chart.jsx's refs the instance's events read and write
 * @property {{ current: { series: any, onPoint: (point: any) => void, onInstance: (chart: any) => void, onLegend?: (change: { name: string, shown: boolean }) => void, menuOpen: boolean } }} latest  the latest props
 * @property {{ current: { seriesIndex: number, dataIndex: number } | null }} hover  the bar, segment or line point under the pointer
 * @property {{ current: { element: string, at: number } | null }} tapped  the element a tap showed the tooltip of, and when
 * @property {{ current: boolean }} touched  whether the last press on the chart was a finger's
 * @property {{ current: ReturnType<typeof setTimeout> | undefined }} waiting  a click's menu, waiting for a second click
 * @property {{ current: HTMLElement | null }} anchor  where a clicked point's menu opens
 */

/**
 * An ECharts instance on `el`, with the chart's events. A double click goes straight to the rows; a
 * click opens the point's menu after DOUBLE_WAIT; a tap shows the tooltip first, a second tap on the
 * same element opens the menu. iOS sends its click as a plain mouse event, so a press on the chart
 * says whether it was a finger's.
 * @param {HTMLElement} el  the chart's element
 * @param {ChartRefs} refs
 * @param {{ redraw: () => void, onWindow: (control: any) => void, onBox: (box: string) => void }} on
 *   redraw: draw again (the zoom slider's window needs a new layout, or the tokens changed);
 *   onWindow: the slider's window and place, for its keyboard control (zoomKeyProps with it), or
 *   null; onBox: the canvas size changed
 * @returns {{ instance: any, keeper: ReturnType<typeof chartKeeper>, tokens: ReturnType<typeof tokenWatcher>, stop: () => void }}
 *   tokens: draws the chart again (`redraw`) when the tokens a draw read change without a theme
 *   switch (chart-tokens.js); stop: a waiting click's menu and the events off, before the instance is
 *   disposed
 */
export function startChart(el, refs, on) {
    const { latest, hover, tapped, touched, waiting, anchor } = refs;
    const instance = init(el, null, { renderer: "canvas" });
    latest.current.onInstance(instance);
    /** The anchor of the point's menu, moved to where the event hit (#53). */
    const placeAnchor = (/** @type {any} */ p) => {
        const at = anchor.current;
        if (at && typeof p.event?.offsetX === "number") {
            at.style.left = `${p.event.offsetX}px`;
            at.style.top = `${p.event.offsetY}px`;
        }
        return at;
    };
    // a double click goes straight to the rows; a slice has none of its own
    instance.on("dblclick", (/** @type {any} */ p) => {
        clearTimeout(waiting.current);
        const point = pointOf(p, latest.current.series);
        if (point && !point.slice) {
            instance.dispatchAction({ type: "hideTip" });
            latest.current.onPoint({ ...point, direct: true, anchor: placeAnchor(p) });
        }
    });
    instance.on("click", (/** @type {any} */ p) => {
        const point = pointOf(p, latest.current.series);
        if (!point) {
            return;
        }
        // a touch has no pointer that rests on an element: the first tap on an element shows
        // its tooltip, a second tap on it opens its menu
        const element = `${p.seriesIndex}:${p.dataIndex}`;
        const last = tapped.current;
        if (touched.current && (last?.element !== element || Date.now() - last.at > TAP_WAIT)) {
            tapped.current = { element, at: Date.now() };
            return;
        }
        tapped.current = null;
        // the menu opens at the point: the tooltip would stay over it
        const open = () => {
            instance.dispatchAction({ type: "hideTip" });
            latest.current.onPoint({ ...point, anchor: placeAnchor(p), home: el });
        };
        clearTimeout(waiting.current);
        if (touched.current) {
            open();
        } else {
            waiting.current = setTimeout(open, DOUBLE_WAIT);
        }
    });
    const keeper = chartKeeper(instance, { categories: () => latest.current.series?.categories, onLegend: (/** @type {any} */ change) => latest.current.onLegend?.(change), redraw: on.redraw, onWindow: (/** @type {any} */ control) => on.onWindow(control ? { ...control, props: zoomKeyProps } : null) });
    followPointer(instance, hover, () => latest.current.menuOpen);
    instance.on("globalout", () => {
        hover.current = null;
        tapped.current = null;
    });
    // a tap beside every element: the next tap on an element shows its tooltip first again
    instance.getZr().on("click", (/** @type {any} */ e) => {
        if (!e.target) {
            tapped.current = null;
        }
    });
    const ro =
        typeof ResizeObserver === "function"
            ? new ResizeObserver(() => {
                  instance.resize();
                  on.onBox(`${instance.getWidth()}x${instance.getHeight()}`);
              })
            : null;
    ro?.observe(el);
    // a press: a finger's or not; one outside the chart forgets the tapped element
    // (composedPath: inside a shadow root the document sees the host as the target)
    const doc = el.ownerDocument;
    const onPress = (/** @type {PointerEvent} */ e) => {
        if (e.composedPath().includes(el)) {
            touched.current = e.pointerType === "touch";
        } else {
            tapped.current = null;
        }
    };
    doc.addEventListener("pointerdown", onPress, true);
    const tokens = tokenWatcher(el, on.redraw);
    return {
        instance,
        keeper,
        tokens,
        stop: () => {
            clearTimeout(waiting.current);
            keeper.dispose();
            tokens.dispose();
            ro?.disconnect();
            doc.removeEventListener("pointerdown", onPress, true);
        }
    };
}

/**
 * Draws the chart's option on the instance: pivotkit-core's ECharts option in the report's tokens, the
 * reference lines, the report's marks and the host's chartOptions over them.
 * @param {any} instance  startChart's
 * @param {HTMLElement} root  the report's root, whose tokens the chart reads
 * @param {{ result: import("pivotkit-core").PivotResult, series: any, labels: any, locale: string, themeName: string,
 *   chartOptions?: Record<string, unknown> | null, colorMap?: unknown, drawAs: { type: string, stacked: boolean, horizontal: boolean } | null,
 *   itemType: boolean, maxCategories: number }} chart  chart.jsx's props; itemType: the type draws items, not series
 *   (chart-types.js ITEM_TYPES); maxCategories: chart-types.js MAX_CATEGORIES
 * @param {{ keeper: ReturnType<typeof chartKeeper>, tokens?: ReturnType<typeof tokenWatcher>, hover: ChartRefs["hover"], tapped: ChartRefs["tapped"], warned: { current: unknown } }} refs
 *   tokens: startChart's, told which tokens this draw read; warned: the chartOptions whose problems
 *   were said, once per value
 * @returns {{ lines: ReturnType<typeof chartLines> | null, shown: ReturnType<typeof shownOf> | null, axisEvery: number }}
 *   lines: the reference lines drawn; shown: what the text alternative says; axisEvery: n when the
 *   category axis writes every n-th label only
 */
export function drawChart(instance, root, chart, refs) {
    const { result, series, labels, locale, themeName, chartOptions, colorMap, drawAs } = chart;
    // the tokens with the lengths the chart reads in px resolved (the title's size, the marks' corners)
    const style = chartStyle(root);
    // the series of the summary and the hints, not computed a second time
    const colors = colorMapFor(colorMap, themeName);
    const option = toEChartsOption(result, { theme: chartThemeFrom(style), locale, labels: labels.core, maxCategories: chart.maxCategories, ...(series ? { series } : {}), ...(drawAs ? { chart: drawAs } : {}), ...(colors ? { colorMap: colors } : {}) });
    // a new option draws new marks: the element under the pointer is reported again when it moves
    refs.hover.current = null;
    refs.tapped.current = null;
    // each series' value: a stack's total only where the values add up (chart-tooltip.js valueAddsUp)
    const values = (series?.series ?? []).map((/** @type {any} */ x) => result.view.values[x.valueIndex]);
    // the reference lines (chart-tooltip.js chartLines): the tooltip names them, the text
    // alternative says them, and the Display menu learns which ones the drawn chart can draw
    const lines = series ? chartLines(result, { series, chart: drawAs, labels, locale }) : null;
    const tooltip = { mode: result.view.chart.tooltip, share: result.view.chart.tooltipShare, hover: refs.hover, totalLabel: labels.chartTotal, moreLabel: labels.chartMore, moreInTotalLabel: labels.chartMoreInTotal, values, lines: lines?.lines ?? [] };
    const doc = root.ownerDocument;
    const shown = series ? shownOf(series, option, result.view.chart.hidden, chart.itemType) : null;
    // the host's chartOptions win over the view's display settings and the report's own styles:
    // plain JSON only; what is dropped is a developer's mistake, said in the console
    const clean = chartOptions ? cleanChartOptions(chartOptions) : null;
    if (clean?.problems.length && refs.warned.current !== chartOptions) {
        refs.warned.current = chartOptions;
        console.warn(`pivotkit: chartOptions entries left out (only plain JSON, and no markup, addresses or text templates): ${clean.problems.slice(0, 5).join("; ")}${clean.problems.length > 5 ? `; and ${clean.problems.length - 5} more` : ""}`);
    }
    // the report's marks, the host's chartOptions over them, the reference lines' labels at their lines
    const drawn = drawOption(instance, option, style, doc, { categoryNames: series?.categories, axisLabels: result.view.chart.axisLabels, ...refs.keeper.zoomOf(result, series?.categories ?? [], doc), tooltip, parseColor: color.parse }, clean?.options);
    refs.keeper.drawn(drawn.dataZoom);
    refs.tokens?.drawn(root, style.names);
    return { lines, shown, axisEvery: drawn.axisEvery };
}
