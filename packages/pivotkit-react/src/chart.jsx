/*
 * The chart: pivotkit-core's ECharts option on an ECharts instance of the host's echarts package (a
 * peer dependency). ECharts is loaded on first use with only the chart types and components the core
 * builds, so a report that never shows a chart does not load it. Colours come from the --pk-* tokens.
 * At most MAX_CATEGORIES categories are drawn. The canvas has a text alternative (chart-summary.js),
 * and hints say when the chart is hard to read, with "Swap rows and columns" where that helps.
 */

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { toEChartsOption, toSeries } from "pivotkit-core";
import { chartHints, chartSummary } from "./chart-summary.js";
import { MAX_CATEGORIES, chartTypeOf } from "./chart-types.js";
import { Icon } from "./icons.jsx";
import { chartThemeFrom } from "./theme.js";

/** @type {Promise<any> | null} */
let loading = null;

/** echarts/core with bar, line, pie and heatmap, the components they use and the canvas renderer. */
export function loadECharts() {
    loading ??= Promise.all([import("echarts/core"), import("echarts/charts"), import("echarts/components"), import("echarts/renderers")]).then(([core, charts, components, renderers]) => {
        core.use([
            charts.BarChart,
            charts.LineChart,
            charts.PieChart,
            charts.HeatmapChart,
            components.GridComponent,
            components.TooltipComponent,
            components.LegendComponent,
            components.VisualMapComponent,
            renderers.CanvasRenderer
        ]);
        return core;
    });
    return loading;
}

/** Mark styles on top of the core's option: rounded bar ends, 2 px lines, tooltips in the theme. */
export function decorate(option, style) {
    const v = (name) => style.getPropertyValue(name).trim();
    // without the stylesheet the tokens are empty and ECharts keeps its own colours
    const surface = v("--pk-surface") || undefined;
    const tooltip = {
        ...option.tooltip,
        backgroundColor: v("--pk-surface-raised") || surface,
        borderColor: v("--pk-border") || undefined,
        textStyle: { color: v("--pk-text") || undefined, fontFamily: style.getPropertyValue("font-family") || undefined },
        extraCssText: `box-shadow: ${v("--pk-shadow") || "none"}; border-radius: 8px;`
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
            return { ...s, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 4 }, label: { ...s.label, color: v("--pk-text") || undefined } };
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
 * @param {{ result: import("pivotkit-core").PivotResult, labels: import("./labels.js").UiLabels, locale: string,
 *   themeName: string, root: React.RefObject<HTMLElement>, onInstance: (chart: any) => void,
 *   onPoint: (point: { rowPath: any[], colPath: any[], valueIndex: number, value: unknown }) => void,
 *   onSwap: () => void, datesOnColumnsOnly: boolean, valueNames: string[] }} props
 */
export function PivotChart({ result, labels, locale, themeName, root, onInstance, onPoint, onSwap, datesOnColumnsOnly, valueNames }) {
    const el = useRef(/** @type {HTMLDivElement | null} */ (null));
    const chart = useRef(/** @type {any} */ (null));
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(/** @type {string | null} */ (null));
    const summaryId = useId();
    // the series as drawn: the core's chart data with the category cap
    const series = useMemo(() => {
        try {
            return toSeries(result, { labels: labels.core, maxCategories: MAX_CATEGORIES });
        } catch {
            return null;
        }
    }, [result, labels]);
    const latest = useRef({ series, onPoint, onInstance });
    useEffect(() => {
        latest.current = { series, onPoint, onInstance };
    });
    const type = chartTypeOf(result.view.chart);

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
                ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => instance.resize()) : null;
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
        const option = toEChartsOption(result, { theme: chartThemeFrom(style), locale, labels: labels.core, maxCategories: MAX_CATEGORIES });
        chart.current.setOption(decorate(option, style), { notMerge: true });
    }, [ready, result, labels, locale, themeName, root]);

    const empty = result.view.values.length === 0;
    const summary = series && !empty ? chartSummary(series, { type, rows: result.view.rows, valueNames, labels, locale }) : labels.noChartData;
    const hints = series && !empty ? chartHints(series, { type, datesOnColumnsOnly, labels, locale }) : [];
    return (
        <div className="pk-chart-wrap">
            {hints.length ? (
                <div className="pk-chart-hints" data-testid="chart-hints">
                    {hints.map((h) => (
                        <p key={h.id} className="pk-note" data-hint={h.id}>
                            <Icon name="info" size={16} />
                            <span>{h.text}</span>
                            {h.swap ? (
                                <button type="button" className="pk-btn pk-small-btn" onClick={onSwap}>
                                    <Icon name="swap" size={14} />
                                    <span className="pk-btn-text">{labels.swap}</span>
                                </button>
                            ) : null}
                        </p>
                    ))}
                </div>
            ) : null}
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
