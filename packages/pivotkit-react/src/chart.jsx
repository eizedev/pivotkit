/*
 * The chart: pivotkit-core's ECharts option on an ECharts instance of the host's echarts package (a
 * peer dependency). ECharts is loaded on first use (echarts.js: only the chart types and components the
 * core builds), so a report that never shows a chart does not load it. Colours come from the --pk-* tokens.
 * At most MAX_CATEGORIES categories are drawn (the series come from PivotReport, which also reads
 * them for the tips). The canvas has a text alternative (chart-summary.js).
 */

import React, { useEffect, useId, useRef, useState } from "react";
import { fieldLabel, toEChartsOption } from "pivotkit-core";
import { chartSummary } from "./chart-summary.js";
import { tooltipFormatter } from "./chart-tooltip.js";
import { MAX_CATEGORIES, chartTypeOf, pieLabelRoom } from "./chart-types.js";
import { chartThemeFrom } from "./theme.js";

/** @type {Promise<any> | null} */
let loading = null;

/** ECharts with the parts the chart draws with (echarts.js), loaded once on the first chart. */
export function loadECharts() {
    // a file of its own in dist/ (build.js), so the host's bundler splits it off
    loading ??= import("./echarts.js");
    return loading;
}

/**
 * Mark styles on top of the core's option: rounded bar ends, 2 px lines, tooltips in the theme, built
 * as DOM nodes (chart-tooltip.js) so a strict Content-Security-Policy allows them.
 * @param {any} option
 * @param {CSSStyleDeclaration} style  the report's computed style (the --pk-* tokens)
 * @param {number} [height]  the chart's height in px, for the room around a pie
 * @param {Document} [doc]  the chart's document, for the tooltip's nodes
 */
export function decorate(option, style, height = 480, doc = undefined) {
    const v = (name) => style.getPropertyValue(name).trim();
    // without the stylesheet the tokens are empty and ECharts keeps its own colours
    const surface = v("--pk-surface") || undefined;
    const tooltip = {
        ...option.tooltip,
        backgroundColor: v("--pk-surface-raised") || surface,
        borderColor: v("--pk-border") || undefined,
        textStyle: { color: v("--pk-text") || undefined, fontFamily: style.getPropertyValue("font-family") || undefined },
        extraCssText: `box-shadow: ${v("--pk-shadow") || "none"}; border-radius: 8px;`,
        ...(doc ? { formatter: tooltipFormatter(doc, { valueFormatter: option.tooltip?.valueFormatter, xNames: option.xAxis?.data, yNames: option.yAxis?.data }) } : {})
    };
    const series = (option.series || []).map((s) => {
        if (s.type === "bar") {
            const horizontal = option.yAxis && option.yAxis.type === "category";
            const r = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
            return { ...s, barMaxWidth: 48, itemStyle: { borderRadius: s.stack ? 0 : r, borderColor: s.stack ? surface : undefined, borderWidth: s.stack ? 1 : 0 }, emphasis: { focus: "series" } };
        }
        if (s.type === "line") {
            return { ...s, lineStyle: { width: 2 }, symbolSize: 7, smooth: false, areaStyle: s.areaStyle ? { opacity: 0.18 } : undefined, emphasis: { focus: "series" } };
        }
        if (s.type === "pie") {
            // the pie's box: below the legend (the core's top), with room for the labels above and below
            const room = pieLabelRoom(height);
            const top = (typeof s.top === "number" ? s.top : 0) + room;
            return { ...s, top, bottom: room, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 4 }, label: { ...s.label, color: v("--pk-text") || undefined } };
        }
        if (s.type === "heatmap") {
            return { ...s, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 3 }, label: { ...s.label, color: v("--pk-text") || undefined } };
        }
        return s;
    });
    const legend = option.legend ? { ...option.legend, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { ...option.legend.textStyle, color: v("--pk-text") || undefined } } : undefined;
    const grid = option.grid ? { left: 12, right: 24, bottom: option.visualMap ? 64 : 12, containLabel: true, ...option.grid } : undefined;
    return { ...option, tooltip, series, ...(legend ? { legend } : {}), ...(grid ? { grid } : {}), animationDuration: style.getPropertyValue("--pk-duration").trim() === "0ms" ? 0 : 400 };
}

/**
 * @param {{ result: import("pivotkit-core").PivotResult, series: ReturnType<typeof import("pivotkit-core").toSeries> | null,
 *   labels: import("./labels.js").UiLabels, locale: string,
 *   themeName: string, root: React.RefObject<HTMLElement>, onInstance: (chart: any) => void,
 *   onPoint: (point: { rowPath: any[], colPath: any[], valueIndex: number, value: unknown }) => void,
 *   valueNames: string[] }} props
 *   `series`: pivotkit-core's toSeries with MAX_CATEGORIES, null when there is nothing to draw
 */
export function PivotChart({ result, series, labels, locale, themeName, root, onInstance, onPoint, valueNames }) {
    const el = useRef(/** @type {HTMLDivElement | null} */ (null));
    const chart = useRef(/** @type {any} */ (null));
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(/** @type {string | null} */ (null));
    // the canvas height a pie's label room follows (pieLabelRoom); other types do not need it
    const [pieHeight, setPieHeight] = useState(0);
    const summaryId = useId();
    const type = chartTypeOf(result.view.chart);
    const latest = useRef({ series, onPoint, onInstance, type });
    useEffect(() => {
        latest.current = { series, onPoint, onInstance, type };
    });

    useEffect(() => {
        let disposed = false;
        /** @type {ResizeObserver | null} */
        let ro = null;
        loadECharts().then(
            (echarts) => {
                if (disposed || !el.current) {
                    return;
                }
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
                    if (seriesEntry && s.categoryPaths[row]) {
                        cb({ rowPath: s.categoryPaths[row], colPath: seriesEntry.colPath, valueIndex: seriesEntry.valueIndex, value: kind === "heatmap" ? p.value[2] : p.value });
                    }
                });
                ro =
                    typeof ResizeObserver === "function"
                        ? new ResizeObserver(() => {
                              instance.resize();
                              if (latest.current.type === "pie") {
                                  setPieHeight(instance.getHeight());
                              }
                          })
                        : null;
                ro?.observe(el.current);
                setReady(true);
            },
            (err) => setFailed(String(err && err.message ? err.message : err))
        );
        return () => {
            disposed = true;
            ro?.disconnect();
            chart.current?.dispose();
            chart.current = null;
            latest.current.onInstance(null);
        };
        // one instance per mounted chart; the latest props are read through refs
    }, []);

    useEffect(() => {
        if (!ready || !chart.current || !root.current) {
            return;
        }
        const style = getComputedStyle(root.current);
        // the series of the summary and the hints, not computed a second time
        const option = toEChartsOption(result, { theme: chartThemeFrom(style), locale, labels: labels.core, maxCategories: MAX_CATEGORIES, ...(series ? { series } : {}) });
        chart.current.setOption(decorate(option, style, chart.current.getHeight(), root.current.ownerDocument), { notMerge: true });
        // pieHeight: a pie is drawn again when its height changes
    }, [ready, result, series, labels, locale, themeName, root, pieHeight]);

    const empty = result.view.values.length === 0;
    const summary = series && !empty ? chartSummary(series, { type, rows: result.view.rows.map((f) => fieldLabel(f, labels.core)), valueNames, labels, locale }) : labels.noChartData;
    return (
        <div className="pk-chart-wrap">
            <div className="pk-chart-box">
                <div ref={el} className="pk-chart" data-testid="pivot-chart" role="img" aria-label={labels.chart} aria-describedby={summaryId} />
                <p id={summaryId} className="pk-sr" data-testid="chart-summary">
                    {summary}
                </p>
                {!ready && !failed ? <div className="pk-chart-note">{labels.loadingChart}</div> : null}
                {failed ? <div className="pk-chart-note pk-error">{failed}</div> : null}
                {ready && empty ? <div className="pk-chart-note">{labels.noChartData}</div> : null}
            </div>
        </div>
    );
}
