/*
 * The result with its tabs Table and Chart (view-tabs.jsx) and the status line under it: the table,
 * the chart, or both side by side (#51), in the tabs' panel. In their place the skeleton while the
 * data or a link loads, the error when the pivot failed, or the start screen of an empty view.
 */

import React, { useState } from "react";
import { PivotChart } from "./chart.jsx";
import { EmptyState } from "./empty-state.jsx";
import { Icon } from "./icons.jsx";
import { errorText } from "./labels.js";
import { valueLabels } from "./names.js";
import { SPLIT, SideBySide } from "./side-by-side.jsx";
import { Skeleton } from "./skeleton.jsx";
import { StatusLine } from "./status-line.jsx";
import { PivotTable } from "./table.jsx";
import { ViewTabs, tabId } from "./view-tabs.jsx";

/**
 * @param {{ id: string, shown: "table" | "chart" | "both", waiting: boolean, error: unknown, start: boolean, labels: any, locale: string,
 *   table: React.ReactNode, chart: React.ReactNode, empty: Omit<Parameters<typeof EmptyState>[0], "labels"> }} props  waiting: the data or a
 *   link loads; start: the start screen shows (an empty view, with the table); table, chart: null when there is none;
 *   empty: the start screen's props but its labels
 */
function ResultSection({ id, shown, waiting, error, start, labels, locale, table, chart, empty }) {
    // the table's share of Both, kept while the report is shown (side-by-side.jsx)
    const [split, setSplit] = useState(/** @type {number} */ (SPLIT.start));
    return (
        <section className="pk-result" id={id} role="tabpanel" aria-labelledby={tabId(id, shown)}>
            {waiting ? (
                <Skeleton text={labels.loadingReport} />
            ) : error ? (
                <div className="pk-message pk-error" role="alert">
                    <Icon name="info" />
                    <p>{errorText(error, labels, locale)}</p>
                </div>
            ) : start ? (
                <EmptyState {...empty} labels={labels} />
            ) : shown === "both" ? (
                <SideBySide labels={labels} split={split} onSplit={setSplit} table={table} chart={chart} />
            ) : shown === "chart" && chart ? (
                chart
            ) : (
                table
            )}
        </section>
    );
}

/**
 * @param {{ id: string, hintId: string, view: import("pivotkit-core").View, labels: any, locale: string, size: string, themeName: string,
 *   root: React.MutableRefObject<HTMLDivElement | null>, big: any, waiting: boolean, encoded: import("pivotkit-core").Encoded, viewKey: string,
 *   pivot: ReturnType<typeof import("./use-pivot-result.js").usePivotResult>, chart: ReturnType<typeof import("./use-chart-state.js").useChartState>,
 *   chartHost: { chartOptions: any, colorMap: any }, drill: ReturnType<typeof import("./use-drill.js").useDrill>,
 *   fields: ReturnType<typeof import("./use-fields.js").useFields>, showInfo: boolean, onSort: (field: string, sort: any) => boolean,
 *   steps: ReturnType<typeof import("./result-steps.js").resultSteps>, empty: Omit<Parameters<typeof EmptyState>[0], "labels">,
 *   source: React.ReactNode }} props  id: the tabs' panel; hintId: the cells' hint (above-result.jsx); waiting: the data or
 *   a link loads; viewKey: the view as the history keeps it; chartHost: the host's chartOptions and colorMap, compared by
 *   value; showInfo: the fields' "i"; onSort: a table header's sort; empty: the start screen's props but its labels;
 *   source: the import UI's line of the data shown, or null
 */
export function ResultArea({ id, hintId, view, labels, locale, size, themeName, root, big, waiting, encoded, viewKey, pivot, chart, chartHost, drill, fields, showInfo, onSort, steps, empty, source }) {
    // the whole label of the row in use while the table is virtual (table.jsx: onRowLabel)
    const [rowLabel, setRowLabel] = useState(/** @type {string | null} */ (null));
    const chartEl = pivot.chartResult ? (
        <PivotChart result={pivot.chartResult} plan={pivot.plan} series={pivot.series} labels={pivot.context.labels} locale={locale} themeName={themeName} root={root} valueNames={valueLabels(view.values, labels)} chartOptions={chartHost.chartOptions} colorMap={chartHost.colorMap} {...chart.events} onPoint={drill.onChartPoint} />
    ) : null;
    const tableEl = pivot.grid ? (
        <PivotTable grid={pivot.grid} view={view} labels={pivot.context.labels} version={viewKey} hintId={view.values.length ? hintId : undefined} onRowLabel={setRowLabel} infoOf={fields.infoOf} showInfo={showInfo} typeOf={fields.typeOf} hostOrdered={fields.hostOrdered} onSort={onSort} onToggle={steps.onToggle} onCell={(cell) => drill.openCell(cell)} />
    ) : null;
    return (
        <>
            {/* side by side needs a wide report (#51) */}
            <ViewTabs view={view} labels={labels} panelId={id} narrow={size === "narrow"} shown={pivot.shown} both={size === "wide"} big={big} plan={pivot.plan} encoded={encoded} lineChecks={chart.lineChecks} locale={locale} chartSeries={pivot.series} chartColors={{ chart: chart.chartRef }} {...steps.tabs} />
            <ResultSection id={id} shown={pivot.shown} waiting={waiting} error={pivot.error} start={pivot.start} labels={labels} locale={locale} table={tableEl} chart={chartEl} empty={empty} />
            <StatusLine result={pivot.result} ranges={pivot.context.ranges} labels={labels} locale={locale} rowLabel={pivot.tableOnScreen ? rowLabel : null} source={source} />
        </>
    );
}
