/*
 * The chart: pivotkit-core's ECharts option on an ECharts instance of the host's echarts package (a
 * peer dependency). ECharts is loaded on first use (echarts.js: only the chart types and components the
 * core builds), so a report that never shows a chart does not load it. Colours come from the --pk-* tokens.
 * At most MAX_CATEGORIES categories are drawn (the series come from PivotReport, which also reads
 * them for the tips). The canvas has a text alternative (chart-summary.js), with the reference lines
 * once the chart has drawn them. The instance's events and each draw load with ECharts (chart-draw.js):
 * the first load holds only this frame and the text alternative.
 */

import React, { useEffect, useId, useRef, useState } from "react";
import { fieldLabel } from "pivotkit-core";
import { chartSummary } from "./chart-summary.js";
import { ITEM_TYPES, MAX_CATEGORIES, chartTypeOf } from "./chart-types.js";
import { fill } from "./labels.js";
import { lazy } from "./lazy.js";

/** ECharts with the parts the chart draws with (echarts.js), a file of its own in dist/ (build.js). */
const echarts = lazy(() => import("./echarts.js"));

/**
 * While a point's menu is open (`menuOpen`) the chart shows no tooltip: it would cover the menu.
 * Called after the draw's effect, so it runs after a draw that sets the options anew.
 * @param {React.MutableRefObject<any>} chart  the ECharts instance, once `ready`
 */
function useTooltipHeld(chart, ready, menuOpen) {
    const held = useRef(false);
    // after every render: a draw (setOption) puts the tooltip's own trigger back
    useEffect(() => {
        const instance = chart.current;
        if (!ready || !instance || (!menuOpen && !held.current)) {
            return;
        }
        held.current = menuOpen;
        instance.dispatchAction({ type: "hideTip" });
        instance.setOption({ tooltip: { triggerOn: menuOpen ? "none" : "mousemove|click" } });
    });
}

/** ECharts, loaded on the first chart (lazy.js: a failed import is tried again on the next chart). */
export const loadECharts = echarts.load;

/**
 * @param {{ result: import("pivotkit-core").PivotResult, series: ReturnType<typeof import("pivotkit-core").toSeries> | null,
 *   labels: import("./labels.js").UiLabels, locale: string,
 *   themeName: string, root: React.RefObject<HTMLElement>, onInstance: (chart: any) => void,
 *   onPoint: (point: { rowPath: any[], colPath: any[], valueIndex: number, value: unknown, slice?: boolean, direct?: boolean, anchor?: HTMLElement | null,
 *     home?: HTMLElement | null, rowLabel?: string, colLabel?: string }) => void,
 *   onLines?: (checks: { average: boolean, trend: boolean, target: boolean, extremes: boolean, notes: string[], format?: string } | null) => void,
 *   onLegend?: (change: { name: string, shown: boolean }) => void,
 *   valueNames: string[], chartOptions?: Record<string, unknown> | null, colorMap?: unknown,
 *   plan?: { name: string, chart: { type: string, stacked: boolean, horizontal: boolean } }, menuOpen?: boolean }} props
 *   `series`: pivotkit-core's toSeries with MAX_CATEGORIES, null when there is nothing to draw;
 *   `chartOptions`: the host's plain JSON (chart-options.js, checked), merged over everything else;
 *   `colorMap`: the host's colour per series or slice name, one or one per theme (chart-colors.js);
 *   `plan`: what to draw (chart-types.js chartPlan), the view's type resolved when it is "auto";
 *   `onLines`: which reference lines the drawn chart can draw (pivotkit-core's referenceLineChecks,
 *   with the first series' format), null when none is drawn;
 *   `onLegend`: a legend entry was clicked, and is shown or hidden now;
 *   `menuOpen`: a point's menu is open: no tooltip shows, it would cover the menu
 */
export function PivotChart({ result, series, labels, locale, themeName, root, onInstance, onPoint, onLines, onLegend, valueNames, chartOptions, colorMap, plan, menuOpen = false }) {
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
    // a click's menu, waiting for a second click (chart-draw.js DOUBLE_WAIT)
    const waiting = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));
    const anchor = useRef(/** @type {HTMLSpanElement | null} */ (null));
    const latest = useRef({ series, onPoint, onInstance, onLines, onLegend, type, menuOpen });
    // the legend and the zoom slider between draws (chart-legend.js); a new window size draws again
    const keeper = useRef(/** @type {any} */ (null));
    // the tokens a draw read: changed without a theme switch, they draw again (chart-tokens.js)
    const tokens = useRef(/** @type {any} */ (null));
    // counts the draws the instance asks for: a new zoom window, changed tokens
    const [redraws, setRedraws] = useState(0);
    // the zoom slider's window and place, for its keyboard control (chart-legend.js zoomKeyProps)
    const [zoomKeys, setZoomKeys] = useState(/** @type {any} */ (null));
    // what the text alternative says: the series shown, and whether they are a 100 % stack's shares
    const [shown, setShown] = useState(/** @type {{ series: any, shares: boolean } | null} */ (null));
    // the ECharts module (echarts.js), with the instance's events and the draw (chart-draw.js)
    const lib = useRef(/** @type {any} */ (null));
    // the chartOptions whose problems were said: once per value, not on every redraw
    const warned = useRef(/** @type {unknown} */ (undefined));
    // the bar, segment or line point under the pointer: the tooltip names it (chart-tooltip.js)
    const hover = useRef(/** @type {{ seriesIndex: number, dataIndex: number } | null} */ (null));
    // the element a tap showed the tooltip of, and when: a second tap on it opens its menu
    const tapped = useRef(/** @type {{ element: string, at: number } | null} */ (null));
    // whether the last press on the chart was a finger's: iOS sends its click as a plain mouse event,
    // so the click itself does not say
    const touched = useRef(false);
    useEffect(() => {
        latest.current = { series, onPoint, onInstance, onLines, onLegend, type, menuOpen };
    });

    useEffect(() => {
        let disposed = false;
        /** @type {() => void} */
        let stop = () => undefined;
        loadECharts().then(
            (echarts) => {
                if (disposed || !el.current) {
                    return;
                }
                lib.current = echarts;
                // the instance with its events (chart-draw.js, loaded with ECharts)
                const started = echarts.startChart(el.current, { latest, hover, tapped, touched, waiting, anchor }, { redraw: () => setRedraws((n) => n + 1), onWindow: setZoomKeys, onBox: setBox });
                chart.current = started.instance;
                keeper.current = started.keeper;
                tokens.current = started.tokens;
                stop = started.stop;
                setReady(true);
            },
            (err) => setFailed(String(err && err.message ? err.message : err))
        );
        return () => {
            disposed = true;
            stop();
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
        // the option, its reference lines and the report's marks (chart-draw.js, loaded with ECharts)
        const drawn = lib.current.drawChart(chart.current, root.current, { result, series, labels, locale, themeName, chartOptions, colorMap, drawAs, itemType: ITEM_TYPES.includes(type), maxCategories: MAX_CATEGORIES }, { keeper: keeper.current, tokens: tokens.current, hover, tapped, warned });
        setLinesText(drawn.lines?.text ?? "");
        latest.current.onLines?.(drawn.lines?.checks ?? null);
        setShown(drawn.shown);
        setEvery(drawn.axisEvery);
        // box: the axis labels, a pie and a heatmap are laid out again when the size changes
    }, [ready, result, series, labels, locale, themeName, root, box, chartOptions, colorMap, drawAs, redraws, type]);

    // after the draw: a draw while the menu is open keeps the tooltip away too
    useTooltipHeld(chart, ready, menuOpen);
    const empty = result.view.values.length === 0;
    const summary = series && !empty ? chartSummary(shown?.series ?? series, { type, rows: result.view.rows.map((f) => fieldLabel(f, labels.core)), valueNames, labels, locale, shares: shown?.shares, linesText }) : labels.noChartData;
    return (
        <div className="pk-chart-wrap">
            <div className="pk-chart-box">
                <div ref={el} className="pk-chart" data-testid="pivot-chart" role="img" tabIndex={-1} aria-label={result.view.chart.title ? `${labels.chart}: ${result.view.chart.title}` : labels.chart} aria-describedby={summaryId} />
                {/* where a clicked point's menu opens (#53): moved to the point by the click */}
                <span ref={anchor} className="pk-point-anchor" aria-hidden="true" />
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
