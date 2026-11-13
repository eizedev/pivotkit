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
import { MAX_CATEGORIES, chartTypeOf } from "./chart-types.js";
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
 * @param {{ result: import("pivotkit-core").PivotResult, series: ReturnType<typeof import("pivotkit-core").toSeries> | null,
 *   labels: import("./labels.js").UiLabels, locale: string,
 *   themeName: string, root: React.RefObject<HTMLElement>, onInstance: (chart: any) => void,
 *   onPoint: (point: { rowPath: any[], colPath: any[], valueIndex: number, value: unknown }) => void,
 *   valueNames: string[], chartOptions?: Record<string, unknown> | null,
 *   plan?: { name: string, chart: { type: string, stacked: boolean, horizontal: boolean } } }} props
 *   `series`: pivotkit-core's toSeries with MAX_CATEGORIES, null when there is nothing to draw;
 *   `chartOptions`: the host's plain JSON (chart-options.js, checked), merged over everything else;
 *   `plan`: what to draw (chart-types.js chartPlan), the view's type resolved when it is "auto"
 */
export function PivotChart({ result, series, labels, locale, themeName, root, onInstance, onPoint, valueNames, chartOptions, plan }) {
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
    const type = plan ? plan.name : chartTypeOf(result.view.chart);
    const drawAs = plan ? plan.chart : null;
    const latest = useRef({ series, onPoint, onInstance, type });
    // the ECharts module (echarts.js), with the report's marks (decorate) and the check and merge of the host's chartOptions
    const lib = useRef(/** @type {any} */ (null));
    // the chartOptions whose problems were said: once per value, not on every redraw
    const warned = useRef(/** @type {unknown} */ (undefined));
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
        // the tokens with the lengths the chart reads in px resolved (the title's size, the marks' corners)
        const style = lib.current.chartStyle(root.current);
        // the series of the summary and the hints, not computed a second time
        const option = toEChartsOption(result, { theme: chartThemeFrom(style), locale, labels: labels.core, maxCategories: MAX_CATEGORIES, ...(series ? { series } : {}), ...(drawAs ? { chart: drawAs } : {}) });
        const { axisEvery, ...drawn } = lib.current.decorate(option, style, chart.current.getHeight(), root.current.ownerDocument, chart.current.getWidth(), { categoryNames: series?.categories, axisLabels: result.view.chart.axisLabels });
        setEvery(axisEvery);
        // the host's chartOptions win over the view's display settings and the report's own styles:
        // plain JSON only; what is dropped is a developer's mistake, said in the console
        const clean = chartOptions ? lib.current.cleanChartOptions(chartOptions) : null;
        if (clean?.problems.length && warned.current !== chartOptions) {
            warned.current = chartOptions;
            console.warn(`pivotkit: chartOptions entries left out (only plain JSON, and no markup, addresses or text templates): ${clean.problems.slice(0, 5).join("; ")}${clean.problems.length > 5 ? `; and ${clean.problems.length - 5} more` : ""}`);
        }
        chart.current.setOption(clean?.options ? lib.current.mergeChartOptions(drawn, clean.options) : drawn, { notMerge: true });
        // box: the axis labels, a pie and a heatmap are laid out again when the size changes
    }, [ready, result, series, labels, locale, themeName, root, box, chartOptions, drawAs]);

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
