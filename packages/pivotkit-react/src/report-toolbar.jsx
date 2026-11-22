/*
 * The report's toolbar (toolbar.jsx) wired to the report's parts: the history's steps, the saved
 * views, sharing, the exports, the tips' and explanations' switches and the Data menu.
 */

import React from "react";
import { MenuPanel } from "./lazy-menus.jsx";
import { Toolbar } from "./toolbar.jsx";

/**
 * @param {{ view: import("pivotkit-core").View, labels: any, size: string, shown: string, empty: boolean, exportData: import("./index.js").PivotReportProps["exportData"],
 *   history: any, data: ReturnType<typeof import("./use-shown-data.js").useShownData>, steps: ReturnType<typeof import("./use-steps.js").useSteps>,
 *   loads: ReturnType<typeof import("./use-view-loading.js").useViewLoading>, saved: ReturnType<typeof import("./use-saved-views.js").useSavedViews>,
 *   share: import("./share-actions.js").ShareContext, exporting: ReturnType<typeof import("./use-export.js").useExport>, chartReady: boolean,
 *   drawer: ReturnType<typeof import("./use-drawer.js").useDrawer>, dismissed: ReturnType<typeof import("./use-dismissed.js").useDismissed>,
 *   dataMenu: object | null }} props  shown: what the result shows; chartReady: a chart is shown and drawn; dataMenu: the Data
 *   menu's props (allowImport), else null
 */
export function ReportToolbar({ view, labels, size, shown, empty, exportData, history, data, steps, loads, saved, share, exporting, chartReady, drawer, dismissed, dataMenu }) {
    return (
        <Toolbar
            view={view}
            labels={labels}
            size={size}
            canUndo={history.canUndo || data.steps.past.length > 0}
            canRedo={history.canRedo || data.steps.future.length > 0}
            canReset={history.canReset}
            startEmpty={history.startEmpty}
            canNew={!empty}
            onUndo={steps.undo}
            onRedo={steps.redo}
            onReset={steps.reset}
            onNew={loads.newReport}
            loadedView={saved.toolbar}
            share={share}
            templates={saved.entries}
            onLoadTemplate={loads.openTemplate}
            templateActions={saved.actions}
            onExport={exporting.run}
            prepareExport={exporting.prepare}
            dataExport={{ exportData, encoded: data.encoded }}
            chartReady={chartReady}
            display={shown}
            empty={empty}
            onShowFields={drawer.show}
            {...dismissed.toolbar}
            viewsRequest={saved.request}
            data={dataMenu ? { loaded: Boolean(data.imported), panel: (/** @type {() => void} */ close) => <MenuPanel name="DataMenu" loadingText={labels.loadingMenu} props={{ ...dataMenu, close, labels }} /> } : null}
        />
    );
}
