/*
 * What the report computes from the data and the view: the pivot once per view, the grid only for the
 * table, and for the chart its plan (the type it draws; rows and columns may be swapped for the chart
 * alone), its own pivot when they are and its series. Each step that fails gives its error; the first
 * one is the report's.
 */

import { useMemo } from "react";
import { computePivot, toGrid, toSeries } from "pivotkit-core";
import { MAX_CATEGORIES, chartPlan } from "./chart-types.js";
import { dateContext } from "./date-context.js";
import { measured } from "./measure.js";
import { rowFolding, swapAxes } from "./view-ops.js";

/** A pivot, or the error it failed with. */
function pivotOf(encoded, view, locale, limits) {
    try {
        return { result: measured("computePivot", () => computePivot(encoded, view, { locale, limits })), error: null };
    } catch (error) {
        return { result: null, error };
    }
}

/** Every key path of the row tree down to the second-last level: what "collapse all" collapses. */
function outerPaths(result) {
    const depth = result.rowFields.length;
    const out = [];
    const walk = (node) => {
        if (node.depth > 0 && node.depth < depth) {
            out.push(node.path);
        }
        if (node.depth < depth - 1) {
            node.children.forEach(walk);
        }
    };
    walk(result.rowRoot);
    return out;
}

/**
 * @param {{ encoded: import("pivotkit-core").Encoded, view: import("pivotkit-core").View, locale: string, limits: object | undefined,
 *   labels: any, size: string, empty: boolean, sourceError: unknown }} options  size: the report's width class;
 *   sourceError: the error of encoding the host's data, if any
 */
export function usePivotResult({ encoded, view, locale, limits, labels, size, empty, sourceError }) {
    // what the result shows: the table, the chart, or both side by side (#51). Both need a wide
    // report; a narrower one shows the table and offers the tabs Table and Chart
    const shown = view.display === "both" && size !== "wide" ? "table" : view.display;
    const tableShown = shown !== "chart";
    const chartShown = shown !== "table";
    const computed = useMemo(() => pivotOf(encoded, view, locale, limits), [encoded, view, locale, limits]);
    const context = useMemo(() => dateContext(computed.result, labels), [computed.result, labels]);
    const result = context.result;
    // what the chart draws: the user's type, or the one the data suggests ("auto"), for which rows and
    // columns may be swapped for the chart alone (dates on Columns run along the axis)
    const plan = useMemo(() => chartPlan(view, encoded), [view, encoded]);
    const chartComputed = useMemo(
        () => (!plan.swap || !chartShown || !result ? computed : pivotOf(encoded, swapAxes(view), locale, limits)),
        [plan.swap, chartShown, view, encoded, locale, limits, computed, result]
    );
    const chartContext = useMemo(() => chartComputed.result === computed.result ? context : dateContext(chartComputed.result, labels), [chartComputed.result, computed.result, context, labels]);
    const chartResult = chartContext.result;
    const gridState = useMemo(() => {
        if (!result || !tableShown || empty) {
            return { grid: null, error: null };
        }
        try {
            return { grid: measured("toGrid", () => toGrid(result, { locale, labels: context.labels.core, limits })), error: null };
        } catch (error) {
            return { grid: null, error };
        }
    }, [result, tableShown, empty, locale, context.labels, limits]);
    // the chart's series, once per result: drawn by the chart, read by its tips
    const series = useMemo(() => {
        if (!chartResult || !chartShown || view.values.length === 0) {
            return null;
        }
        try {
            return toSeries(chartResult, { labels: chartContext.labels.core, maxCategories: MAX_CATEGORIES });
        } catch {
            return null;
        }
    }, [chartResult, chartShown, view.values.length, chartContext.labels]);
    // Expand all and Collapse all: offered when they change something
    const outer = useMemo(() => (result ? outerPaths(result) : []), [result]);
    const error = sourceError ?? computed.error ?? gridState.error ?? (chartShown ? chartComputed.error : null);
    return {
        shown,
        chartShown,
        // the start screen of an empty view, in the table's place
        start: empty && tableShown,
        // the table is on screen
        tableOnScreen: Boolean(!error && !(empty && tableShown) && tableShown && gridState.grid),
        // the pivot of the view as it is, for exports
        computed: /** @type {import("pivotkit-core").PivotResult | null} */ (computed.result),
        result: /** @type {import("pivotkit-core").PivotResult | null} */ (result),
        context,
        plan,
        chartResult: /** @type {import("pivotkit-core").PivotResult | null} */ (chartResult),
        chartContext,
        grid: /** @type {import("pivotkit-core").Grid | null} */ (gridState.grid),
        series,
        outer,
        folding: rowFolding(view, outer),
        error
    };
}
