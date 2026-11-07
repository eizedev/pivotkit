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
import { mergeChartOptions } from "./chart-options.js";
import { tooltipFormatter } from "./chart-tooltip.js";
import { CATEGORY_LABEL_WIDTH, MAX_CATEGORIES, categoryLabelLayout, groupLabelsFit, chartTypeOf, columnLabelLayout, heatmapCellLabels, pieLabelRoom, rowLabelInterval } from "./chart-types.js";
import { fill } from "./labels.js";
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
 * @param {number} [width]  the chart's width in px, for the column names of a heatmap and the category axis
 * @param {{ categoryNames?: string[], axisLabels?: string }} [extra]  the categories' whole names (the
 *   tooltip's title when the axis writes them shorter) and the view's chart.axisLabels
 * @returns {any}  the option; `axisEvery` (not ECharts') is n when the category axis writes every n-th label
 */
export function decorate(option, style, height = 480, doc = undefined, width = 800, extra = {}) {
    const first = (a) => (Array.isArray(a) ? a[0] : a);
    const v = (name) => style.getPropertyValue(name).trim();
    // without the stylesheet the tokens are empty and ECharts keeps its own colours
    const surface = v("--pk-surface") || undefined;
    const tooltip = {
        ...option.tooltip,
        backgroundColor: v("--pk-surface-raised") || surface,
        borderColor: v("--pk-border") || undefined,
        textStyle: { color: v("--pk-text") || undefined, fontFamily: style.getPropertyValue("font-family") || undefined },
        extraCssText: `box-shadow: ${v("--pk-shadow") || "none"}; border-radius: 8px;`,
        ...(doc ? { formatter: tooltipFormatter(doc, { valueFormatter: option.tooltip?.valueFormatter, xNames: first(option.xAxis)?.data, yNames: first(option.yAxis)?.data, categoryNames: extra.categoryNames }) } : {})
    };
    const series = (option.series || []).map((s) => {
        if (s.type === "bar") {
            const horizontal = first(option.yAxis)?.type === "category";
            const r = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
            return { ...s, barMaxWidth: 48, itemStyle: { borderRadius: s.stack ? 0 : r, borderColor: s.stack ? surface : undefined, borderWidth: s.stack ? 1 : 0 }, emphasis: { focus: "series" } };
        }
        if (s.type === "line") {
            return { ...s, lineStyle: { width: 2 }, symbolSize: 7, smooth: Boolean(s.smooth), areaStyle: s.areaStyle ? { opacity: 0.18 } : undefined, emphasis: { focus: "series" } };
        }
        if (s.type === "pie") {
            // the pie's box: below the legend (the core's top), with room for the labels above and below
            const room = pieLabelRoom(height);
            const top = (typeof s.top === "number" ? s.top : 0) + room;
            const bottom = (typeof s.bottom === "number" ? s.bottom : 0) + room;
            return { ...s, top, bottom, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 4 }, label: { ...s.label, color: v("--pk-text") || undefined } };
        }
        if (s.type === "heatmap") {
            // numbers only in cells large enough for them (heatmapCellLabels); the tooltip has every one
            const texts = typeof s.label?.formatter === "function" ? s.data.map((/** @type {any} */ d) => s.label.formatter({ value: d })) : [];
            const fits = heatmapCellLabels(option.xAxis?.data?.length ?? 1, option.yAxis?.data?.length ?? 1, width, height, texts);
            return { ...s, itemStyle: { borderColor: surface, borderWidth: 2, borderRadius: 3 }, label: { ...s.label, show: Boolean(s.label?.show) && fits, color: v("--pk-text") || undefined } };
        }
        return s;
    });
    const legend = option.legend ? { ...option.legend, icon: "roundRect", itemWidth: 12, itemHeight: 12, textStyle: { ...option.legend.textStyle, color: v("--pk-text") || undefined } } : undefined;
    const grid = option.grid ? { left: 12, right: 24, bottom: option.visualMap ? 64 : 12, containLabel: true, ...option.grid } : undefined;
    // a heatmap names every column: slanted where they would overlap (columnLabelLayout)
    const heatmap = series.some((s) => s.type === "heatmap") && option.xAxis?.axisLabel;
    const xAxis = heatmap ? { ...option.xAxis, axisLabel: { ...option.xAxis.axisLabel, ...columnLabelLayout(option.xAxis.data ?? [], width) } } : option.xAxis;
    // and its rows: every name where a line fits each row, else every n-th (rowLabelInterval)
    const yAxis = heatmap && option.yAxis ? { ...option.yAxis, axisLabel: { ...option.yAxis.axisLabel, interval: rowLabelInterval(option.yAxis.data?.length ?? 0, height) } } : option.yAxis;
    // a long title ends in "…" within the chart's width (the PNG is drawn from the same option)
    const title = option.title ? { title: { ...option.title, textStyle: { ...option.title.textStyle, width: Math.max(40, width - 32), overflow: "truncate" } } } : {};
    // bars, lines and areas: the category axis writes every label that fits (categoryLabelLayout), the
    // group labels sit below (or left of) those labels
    let axes = { xAxis, yAxis };
    let axisEvery = 1;
    const along = !heatmap && series.some((s) => s.type === "bar" || s.type === "line") ? (first(option.yAxis)?.type === "category" ? "yAxis" : first(option.xAxis)?.type === "category" ? "xAxis" : null) : null;
    if (along) {
        let list = Array.isArray(axes[along]) ? axes[along] : [axes[along]];
        // "auto" group labels need room: below it the axis writes the whole names instead
        const group = list[1]?.groups ? list[1] : null;
        if (group && group.groupsAuto && !groupLabelsFit(list[0].data?.length ?? 0, group.groupSize ?? 1, { width, height, horizontal: along === "yAxis" })) {
            list = [{ ...list[0], data: extra.categoryNames ?? list[0].data }];
        }
        const names = list[0].data ?? [];
        const layout = categoryLabelLayout(names, { width, height, horizontal: along === "yAxis", mode: extra.axisLabels });
        axisEvery = layout.every;
        const longest = Math.min(CATEGORY_LABEL_WIDTH, Math.max(0, ...names.map((t) => String(t).length)) * 12 * 0.55);
        const offset = along === "yAxis" ? Math.round(longest) + 16 : layout.rotate ? Math.round(longest * 0.71) + 14 : 24;
        const main = { ...list[0], axisLabel: { ...list[0].axisLabel, rotate: layout.rotate, interval: layout.interval, width: layout.width, overflow: layout.overflow } };
        // a group's name is cut to the room of its smallest group, so two names never run into each other
        const slot = (along === "yAxis" ? Math.max(0, height - 60) : Math.max(0, width - 80)) / Math.max(1, names.length);
        const groupWidth = along === "yAxis" ? CATEGORY_LABEL_WIDTH : Math.max(24, Math.round(slot * (list[1]?.groupSize ?? 1)) - 8);
        const rest = list.slice(1).map((a) => (a.groups ? { ...a, offset, axisTick: { ...a.axisTick, length: offset }, axisLabel: { ...a.axisLabel, width: groupWidth, overflow: "truncate" } } : a));
        axes = { ...axes, [along]: rest.length ? [main, ...rest] : main };
    }
    return { ...option, ...title, tooltip, series, ...(axes.xAxis ? { xAxis: axes.xAxis } : {}), ...(axes.yAxis ? { yAxis: axes.yAxis } : {}), ...(legend ? { legend } : {}), ...(grid ? { grid } : {}), animationDuration: style.getPropertyValue("--pk-duration").trim() === "0ms" ? 0 : 400, axisEvery };
}

/**
 * @param {{ result: import("pivotkit-core").PivotResult, series: ReturnType<typeof import("pivotkit-core").toSeries> | null,
 *   labels: import("./labels.js").UiLabels, locale: string,
 *   themeName: string, root: React.RefObject<HTMLElement>, onInstance: (chart: any) => void,
 *   onPoint: (point: { rowPath: any[], colPath: any[], valueIndex: number, value: unknown }) => void,
 *   valueNames: string[], chartOptions?: Record<string, unknown> | null }} props
 *   `series`: pivotkit-core's toSeries with MAX_CATEGORIES, null when there is nothing to draw;
 *   `chartOptions`: the host's plain JSON (chart-options.js, checked), merged over everything else
 */
export function PivotChart({ result, series, labels, locale, themeName, root, onInstance, onPoint, valueNames, chartOptions }) {
    const el = useRef(/** @type {HTMLDivElement | null} */ (null));
    const chart = useRef(/** @type {any} */ (null));
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(/** @type {string | null} */ (null));
    // the canvas size a pie's label room (pieLabelRoom) and a heatmap's column names (columnLabelLayout)
    // follow; other types do not need it
    const [box, setBox] = useState("");
    // n when the category axis writes every n-th label only: a note says so
    const [every, setEvery] = useState(1);
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
                              setBox(`${instance.getWidth()}x${instance.getHeight()}`);
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
        const { axisEvery, ...drawn } = decorate(option, style, chart.current.getHeight(), root.current.ownerDocument, chart.current.getWidth(), { categoryNames: series?.categories, axisLabels: result.view.chart.axisLabels });
        setEvery(axisEvery);
        // the host's chartOptions win over the view's display settings and the report's own styles
        chart.current.setOption(chartOptions ? mergeChartOptions(drawn, chartOptions) : drawn, { notMerge: true });
        // box: the axis labels, a pie and a heatmap are laid out again when the size changes
    }, [ready, result, series, labels, locale, themeName, root, box, chartOptions]);

    const empty = result.view.values.length === 0;
    const summary = series && !empty ? chartSummary(series, { type, rows: result.view.rows.map((f) => fieldLabel(f, labels.core)), valueNames, labels, locale }) : labels.noChartData;
    return (
        <div className="pk-chart-wrap">
            <div className="pk-chart-box">
                <div ref={el} className="pk-chart" data-testid="pivot-chart" role="img" aria-label={result.view.chart.title ? `${labels.chart}: ${result.view.chart.title}` : labels.chart} aria-describedby={summaryId} />
                <p id={summaryId} className="pk-sr" data-testid="chart-summary">
                    {summary}
                </p>
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
