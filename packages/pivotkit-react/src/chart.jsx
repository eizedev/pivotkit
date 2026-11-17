/*
 * The chart: pivotkit-core's ECharts option on an ECharts instance of the host's echarts package (a
 * peer dependency). ECharts is loaded on first use (echarts.js: only the chart types and components the
 * core builds), so a report that never shows a chart does not load it. Colours come from the --pk-* tokens.
 * At most MAX_CATEGORIES categories are drawn (the series come from PivotReport, which also reads
 * them for the tips). The canvas has a text alternative (chart-summary.js), with the reference lines
 * once the chart has drawn them.
 */

import React, { useEffect, useId, useRef, useState } from "react";
import { fieldLabel } from "pivotkit-core";
import { chartSummary } from "./chart-summary.js";
import { MAX_CATEGORIES, SLICE_TYPES, chartTypeOf } from "./chart-types.js";
import { fill } from "./labels.js";
import { chartThemeFrom } from "./theme.js";

/** @type {Promise<any> | null} */
let loading = null;

/** How long a tap's tooltip waits for the second tap that opens its rows, in ms. */
const TAP_WAIT = 10_000;

/** ECharts with the parts the chart draws with (echarts.js), loaded once on the first chart. */
export function loadECharts() {
    // a file of its own in dist/ (build.js), so the host's bundler splits it off
    loading ??= import("./echarts.js");
    return loading;
}


/**
 * @param {{ result: import("pivotkit-core").PivotResult, series: ReturnType<typeof import("pivotkit-core").toSeries> | null,
 *   labels: import("./labels.js").UiLabels, locale: string,
 *   themeName: string, root: React.RefObject<HTMLElement>, onInstance: (chart: any) => void,
 *   onPoint: (point: { rowPath: any[], colPath: any[], valueIndex: number, value: unknown }) => void,
 *   onLines?: (checks: { average: boolean, trend: boolean, target: boolean, notes: string[], format?: string } | null) => void,
 *   onLegend?: (change: { name: string, shown: boolean }) => void,
 *   valueNames: string[], chartOptions?: Record<string, unknown> | null, colorMap?: unknown,
 *   plan?: { name: string, chart: { type: string, stacked: boolean, horizontal: boolean } } }} props
 *   `series`: pivotkit-core's toSeries with MAX_CATEGORIES, null when there is nothing to draw;
 *   `chartOptions`: the host's plain JSON (chart-options.js, checked), merged over everything else;
 *   `colorMap`: the host's colour per series or slice name, one or one per theme (chart-colors.js);
 *   `plan`: what to draw (chart-types.js chartPlan), the view's type resolved when it is "auto";
 *   `onLines`: which reference lines the drawn chart can draw (pivotkit-core's referenceLineChecks,
 *   with the first series' format), null when none is drawn;
 *   `onLegend`: a legend entry was clicked, and is shown or hidden now
 */
export function PivotChart({ result, series, labels, locale, themeName, root, onInstance, onPoint, onLines, onLegend, valueNames, chartOptions, colorMap, plan }) {
    const el = useRef(/** @type {HTMLDivElement | null} */ (null));
    const chart = useRef(/** @type {any} */ (null));
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(/** @type {string | null} */ (null));
    // the canvas size a pie's label room (pieLabelRoom) and a heatmap's column names (columnLabelLayout)
    // follow; other types do not need it
    const [box, setBox] = useState("");
    // n when the category axis writes every n-th label only: a note says so
    const [every, setEvery] = useState(1);
    // the reference lines drawn, in words for the text alternative (loaded with the chart)
    const [linesText, setLinesText] = useState("");
    const summaryId = useId();
    const type = plan ? plan.name : chartTypeOf(result.view.chart);
    const drawAs = plan ? plan.chart : null;
    const latest = useRef({ series, onPoint, onInstance, onLines, onLegend, type });
    // the legend and the zoom slider between draws (chart-legend.js); a new window size draws again
    const keeper = useRef(/** @type {any} */ (null));
    const [zoomed, setZoomed] = useState(0);
    // the zoom slider's window and place, for its keyboard control (chart-legend.js zoomKeyProps)
    const [zoomKeys, setZoomKeys] = useState(/** @type {any} */ (null));
    // what the text alternative says: the series shown, and whether they are a 100 % stack's shares
    const [shown, setShown] = useState(/** @type {{ series: any, shares: boolean } | null} */ (null));
    // the ECharts module (echarts.js), with the report's marks (decorate) and the check and merge of the host's chartOptions
    const lib = useRef(/** @type {any} */ (null));
    // the chartOptions whose problems were said: once per value, not on every redraw
    const warned = useRef(/** @type {unknown} */ (undefined));
    // the bar, segment or line point under the pointer: the tooltip names it (chart-tooltip.js)
    const hover = useRef(/** @type {{ seriesIndex: number, dataIndex: number } | null} */ (null));
    // the element a tap showed the tooltip of, and when: a second tap on it opens its rows
    const tapped = useRef(/** @type {{ element: string, at: number } | null} */ (null));
    // whether the last press on the chart was a finger's: iOS sends its click as a plain mouse event,
    // so the click itself does not say
    const touched = useRef(false);
    useEffect(() => {
        latest.current = { series, onPoint, onInstance, onLines, onLegend, type };
    });

    useEffect(() => {
        let disposed = false;
        /** @type {ResizeObserver | null} */
        let ro = null;
        /** @type {((e: PointerEvent) => void) | null} */
        let onPress = null;
        /** @type {Document | null} */
        let doc = null;
        loadECharts().then(
            (echarts) => {
                if (disposed || !el.current) {
                    return;
                }
                lib.current = echarts;
                const instance = echarts.init(el.current, null, { renderer: "canvas" });
                chart.current = instance;
                latest.current.onInstance(instance);
                instance.on("click", (p) => {
                    const { series: s, onPoint: cb } = latest.current;
                    const kind = p.seriesType;
                    if (!s || kind === "pie") {
                        return;
                    }
                    const seriesEntry = kind === "heatmap" ? s.series.filter((x) => x.valueIndex === s.series[0]?.valueIndex)[p.value?.[0]] : s.series[p.seriesIndex];
                    const row = kind === "heatmap" ? p.value?.[1] : p.dataIndex;
                    if (!seriesEntry || !s.categoryPaths[row]) {
                        return;
                    }
                    // a touch has no pointer that rests on an element: the first tap on an element shows
                    // its tooltip, a second tap on it opens its rows
                    const element = `${p.seriesIndex}:${p.dataIndex}`;
                    const last = tapped.current;
                    if (touched.current && (last?.element !== element || Date.now() - last.at > TAP_WAIT)) {
                        tapped.current = { element, at: Date.now() };
                        return;
                    }
                    tapped.current = null;
                    // the panel covers the chart: the tooltip would stay over it
                    instance.dispatchAction({ type: "hideTip" });
                    // a 100 % stack's part draws its share: the rows go with its value
                    const value = kind === "heatmap" ? p.value[2] : typeof p.data?.raw === "number" ? p.data.raw : p.value;
                    cb({ rowPath: s.categoryPaths[row], colPath: seriesEntry.colPath, valueIndex: seriesEntry.valueIndex, value });
                });
                keeper.current = echarts.chartKeeper(instance, { categories: () => latest.current.series?.categories, onLegend: (/** @type {any} */ change) => latest.current.onLegend?.(change), redraw: () => setZoomed((n) => n + 1), onWindow: (/** @type {any} */ control) => setZoomKeys(control ? { ...control, props: echarts.zoomKeyProps } : null) });
                // ECharts draws the tooltip before it reports the element under the pointer: the
                // element is kept, and the tooltip drawn again at the pointer. hideTip first: at the
                // same category ECharts keeps what it drew and would not call the formatter again.
                // An area's fill and a line between its points have no dataIndex: no element.
                const redraw = (/** @type {any} */ e) => {
                    const at = e?.event;
                    if (at && typeof at.offsetX === "number") {
                        instance.dispatchAction({ type: "hideTip" });
                        instance.dispatchAction({ type: "showTip", x: at.offsetX, y: at.offsetY });
                    }
                };
                instance.on("mouseover", (/** @type {any} */ e) => {
                    if (e.componentType === "series" && (e.seriesType === "bar" || e.seriesType === "line") && typeof e.dataIndex === "number") {
                        hover.current = { seriesIndex: e.seriesIndex, dataIndex: e.dataIndex };
                        redraw(e);
                    }
                });
                instance.on("mouseout", (/** @type {any} */ e) => {
                    if (hover.current) {
                        hover.current = null;
                        redraw(e);
                    }
                });
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
                ro =
                    typeof ResizeObserver === "function"
                        ? new ResizeObserver(() => {
                              instance.resize();
                              setBox(`${instance.getWidth()}x${instance.getHeight()}`);
                          })
                        : null;
                ro?.observe(el.current);
                // a press: a finger's or not; one outside the chart forgets the tapped element
                // (composedPath: inside a shadow root the document sees the host as the target)
                const box = el.current;
                doc = box.ownerDocument;
                onPress = (/** @type {PointerEvent} */ e) => {
                    if (e.composedPath().includes(box)) {
                        touched.current = e.pointerType === "touch";
                    } else {
                        tapped.current = null;
                    }
                };
                doc.addEventListener("pointerdown", onPress, true);
                setReady(true);
            },
            (err) => setFailed(String(err && err.message ? err.message : err))
        );
        return () => {
            disposed = true;
            keeper.current?.dispose();
            ro?.disconnect();
            if (onPress) {
                doc?.removeEventListener("pointerdown", onPress, true);
            }
            chart.current?.dispose();
            chart.current = null;
            latest.current.onInstance(null);
            latest.current.onLines?.(null);
        };
        // one instance per mounted chart; the latest props are read through refs
    }, []);

    useEffect(() => {
        if (!ready || !chart.current || !root.current) {
            return;
        }
        // pivotkit-core's option comes with ECharts (echarts.js): only a drawn chart needs it
        const { toEChartsOption } = lib.current;
        // the tokens with the lengths the chart reads in px resolved (the title's size, the marks' corners)
        const style = lib.current.chartStyle(root.current);
        // the series of the summary and the hints, not computed a second time
        const colors = lib.current.colorMapFor(colorMap, themeName);
        const option = toEChartsOption(result, { theme: chartThemeFrom(style), locale, labels: labels.core, maxCategories: MAX_CATEGORIES, ...(series ? { series } : {}), ...(drawAs ? { chart: drawAs } : {}), ...(colors ? { colorMap: colors } : {}) });
        // a new option draws new marks: the element under the pointer is reported again when it moves
        hover.current = null;
        tapped.current = null;
        // each series' value: a stack's total only where the values add up (chart-tooltip.js valueAddsUp)
        const values = (series?.series ?? []).map((x) => result.view.values[x.valueIndex]);
        // the reference lines (chart-tooltip.js chartLines): the tooltip names them, the text
        // alternative says them, and the Display menu learns which ones the drawn chart can draw
        const lines = series ? lib.current.chartLines(result, { series, chart: drawAs, labels, locale }) : null;
        setLinesText(lines?.text ?? "");
        latest.current.onLines?.(lines?.checks ?? null);
        const tooltip = { mode: result.view.chart.tooltip, share: result.view.chart.tooltipShare, hover, totalLabel: labels.chartTotal, moreLabel: labels.chartMore, moreInTotalLabel: labels.chartMoreInTotal, values, lines: lines?.lines ?? [] };
        const doc = root.current.ownerDocument;
        setShown(series ? lib.current.shownOf(series, option, result.view.chart.hidden, SLICE_TYPES.includes(type)) : null);
        // the host's chartOptions win over the view's display settings and the report's own styles:
        // plain JSON only; what is dropped is a developer's mistake, said in the console
        const clean = chartOptions ? lib.current.cleanChartOptions(chartOptions) : null;
        if (clean?.problems.length && warned.current !== chartOptions) {
            warned.current = chartOptions;
            console.warn(`pivotkit: chartOptions entries left out (only plain JSON, and no markup, addresses or text templates): ${clean.problems.slice(0, 5).join("; ")}${clean.problems.length > 5 ? `; and ${clean.problems.length - 5} more` : ""}`);
        }
        // the report's marks, the host's chartOptions over them, the reference lines' labels at their lines
        const drawn = lib.current.drawOption(chart.current, option, style, doc, { categoryNames: series?.categories, axisLabels: result.view.chart.axisLabels, ...keeper.current.zoomOf(result, series?.categories ?? [], doc), tooltip, parseColor: lib.current.color.parse }, clean?.options);
        keeper.current.drawn(drawn.dataZoom);
        setEvery(drawn.axisEvery);
        // box: the axis labels, a pie and a heatmap are laid out again when the size changes
    }, [ready, result, series, labels, locale, themeName, root, box, chartOptions, colorMap, drawAs, zoomed, type]);

    const empty = result.view.values.length === 0;
    const summary = series && !empty ? chartSummary(shown?.series ?? series, { type, rows: result.view.rows.map((f) => fieldLabel(f, labels.core)), valueNames, labels, locale, shares: shown?.shares, linesText }) : labels.noChartData;
    return (
        <div className="pk-chart-wrap">
            <div className="pk-chart-box">
                <div ref={el} className="pk-chart" data-testid="pivot-chart" role="img" aria-label={result.view.chart.title ? `${labels.chart}: ${result.view.chart.title}` : labels.chart} aria-describedby={summaryId} />
                <p id={summaryId} className="pk-sr" data-testid="chart-summary">
                    {summary}
                </p>
                {zoomKeys ? <div {...zoomKeys.props(zoomKeys, labels, fill, locale)} /> : null}
                {!ready && !failed ? <div className="pk-chart-note">{labels.loadingChart}</div> : null}
                {failed ? <div className="pk-chart-note pk-error">{failed}</div> : null}
                {ready && empty ? <div className="pk-chart-note">{labels.noChartData}</div> : null}
            </div>
            {ready && !empty && every > 1 ? (
                <p className="pk-axis-note" data-testid="axis-note">
                    {fill(labels.axisEvery, { n: every.toLocaleString(locale) })}
                </p>
            ) : null}
        </div>
    );
}
