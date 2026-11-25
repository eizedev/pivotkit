/*
 * <PivotReport>: the report builder. Report composes it from hooks, one per concern, and the parts
 * it renders. The view and its undo history live in useViewHistory (controlled by the host or not);
 * the field list, the zones, the toolbar, the table and the chart are views of that state and change
 * it through commit() (use-steps.js), which they get as a prop. The pivot is computed once per view;
 * the grid only for the table (use-pivot-result.js).
 *
 * While the host loads its data (`loading`), and while a large data set is encoded for the first time,
 * the report shows its skeleton (skeleton.jsx). A view can come back by itself: the tab's own
 * (`persistView`, sessionStorage) or a shared link in the page's address (`shareLink`); both are read
 * after the first render, so a server render and its hydration match, and both pass normalize()
 * (use-share-link.js).
 *
 * The hooks Report calls, by concern (each file says what it holds). Effects run in call order:
 * useViewLoading fills the ref a link reads (use-share-link.js) in a layout effect, so it is filled
 * before useShareLink's layout effect opens a link at mount.
 *
 * - use-host-props.js: the host's props compared by value, and the warnings about them
 * - use-report-size.js, use-drawer.js: width and height classes, Enlarge, the field list's drawer
 * - use-shown-data.js: the host's data encoded, or a loaded file's; useKeepData, what a new mount keeps
 * - use-import.js: the import UI's state (useImport) and the object it works on (useImportApi)
 * - use-view-history.js, use-report-labels.js, use-pivot-result.js, use-fields.js: the view, its
 *   texts, what is computed from it and what the parts ask about its fields
 * - use-zone-fold.js, use-tips.js (useActivity), use-steps.js: the zones folded, what the user did,
 *   commit() with Undo, Redo and Reset
 * - use-unused-notes.js, use-view-loading.js, use-share-link.js: views loaded from outside and what
 *   they left out
 * - use-dismissed.js, use-menus.js, use-saved-views.js, use-drill.js, use-placing.js,
 *   use-chart-state.js, use-export.js: the rest of what the toolbar, the zones and the result need
 *
 * useLabelsOf and useTipsTable stay in this file: they read deferred.js, which only this file may
 * import (build.js: deferredFile).
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LimitsContext } from "./limits-context.js";
import { loadECharts } from "./chart.jsx";
import { PivotDnd } from "./dnd.jsx";
import { AboveResult } from "./above-result.jsx";
import { FieldSlot } from "./fields.jsx";
import { labelsHere, langOf, onLabels, requestLabels, resolveLabels } from "./labels.js";
import { DEFERRED } from "./deferred.js";
import { MenuPanel } from "./lazy-menus.jsx";
import { LayerContext } from "./popover.jsx";
import { HelpContext } from "./help.js";
import { ResultArea } from "./result-area.jsx";
import { reportKeys } from "./report-keys.js";
import { resultSteps } from "./result-steps.js";
import { Skeleton } from "./skeleton.jsx";
import { Toasts, useToasts } from "./toasts.jsx";
import { FormNameContext, useFormPrefix } from "./dom.js";
import { ReportToolbar } from "./report-toolbar.jsx";
import { useChartState } from "./use-chart-state.js";
import { useDismissed } from "./use-dismissed.js";
import { useDrawer } from "./use-drawer.js";
import { useDrill } from "./use-drill.js";
import { useExport } from "./use-export.js";
import { useFields } from "./use-fields.js";
import { useHostProps } from "./use-host-props.js";
import { useImport, useImportApi } from "./use-import.js";
import { useMenus } from "./use-menus.js";
import { usePivotResult } from "./use-pivot-result.js";
import { usePlacing } from "./use-placing.js";
import { useReportLabels } from "./use-report-labels.js";
import { useReportSize } from "./use-report-size.js";
import { useSavedViews } from "./use-saved-views.js";
import { useShareLink } from "./use-share-link.js";
import { useKeepData, useShownData } from "./use-shown-data.js";
import { useSteps } from "./use-steps.js";
import { useResolvedTheme } from "./use-theme.js";
import { tipsShown, useActivity } from "./use-tips.js";
import { useUnusedNotes } from "./use-unused-notes.js";
import { useViewHistory } from "./use-view-history.js";
import { useViewLoading } from "./use-view-loading.js";
import { useZoneFold } from "./use-zone-fold.js";
import { warnOnce } from "./warn-once.js";
import { isEmptyView } from "./view-ops.js";
import { DragChip, Zones } from "./zones.jsx";

/** Rows above which the report shows its skeleton first and encodes the data in the next frame. */
export const DEFER_ROWS = 10_000;

/** Rows of the host's data: rows, or columnar ({ columns, types, data }, one array per column). */
const rowsOf = (d) => (Array.isArray(d) ? d.length : (d?.data?.[0]?.length ?? 0));

/**
 * The pivot report builder. While the host's data loads (`loading`) or a large data set is encoded for
 * the first time, the report shows its skeleton; once shown, the report stays (its view and history
 * too) and a later `loading` covers its result only. A language whose texts load on demand
 * (pivotkit-element: deferred-late.js) is waited for: before it the skeleton shows without a word, and
 * a report that changes its language keeps the last one's texts until the new ones are here.
 * @param {import("./index.js").PivotReportProps} props
 */
export function PivotReport(props) {
    const { loading = false, data, encoded } = props;
    // a large data set: the skeleton paints first, the encoding runs after it (a frame later)
    const [deferred, setDeferred] = useState(() => !encoded && rowsOf(data) > DEFER_ROWS);
    const [started, setStarted] = useState(false);
    useEffect(() => {
        if (!deferred) {
            return undefined;
        }
        let timer = 0;
        const frame = requestAnimationFrame(() => {
            timer = window.setTimeout(() => setDeferred(false), 0);
        });
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, [deferred]);
    const texts = useLabelsOf(props.locale);
    const waiting = Boolean(loading) || deferred || !texts.shown;
    if (!waiting && !started) {
        setStarted(true);
    }
    if (waiting && !started) {
        return <WaitingReport {...props} locale={texts.locale} silent={!texts.shown} />;
    }
    return <Report {...props} locale={texts.locale} />;
}

/**
 * The locale whose texts the report shows: `locale` once its language's first-load texts are here (or
 * cannot come: no loader, or the load failed, then English), until then the last one that was shown.
 * Starts the load during the render, as React.lazy does: the request leaves as early as it can, and a
 * second report of the same language shares it (labels.js requestLabels).
 * @param {string | undefined} locale
 * @returns {{ shown: boolean, locale: string | undefined }}  shown: false until a locale's texts were here once
 */
function useLabelsOf(locale) {
    const here = useSyncExternalStore(onLabels, () => labelsHere(locale, DEFERRED.loadLabels), () => labelsHere(locale, DEFERRED.loadLabels));
    if (!here) {
        requestLabels(locale, DEFERRED.loadLabels);
    }
    // a report that mounts, or changes its language, tries a language that failed before once more
    const lang = langOf(locale);
    useEffect(() => requestLabels(lang, DEFERRED.loadLabels, { again: true }), [lang]);
    const [last, setLast] = useState(() => (here ? { locale } : null));
    if (here && (!last || last.locale !== locale)) {
        setLast({ locale });
    }
    return here ? { shown: true, locale } : { shown: last !== null, locale: last?.locale };
}

/** The tips' table once it loaded (pivotkit-element), shared by every report of the page. */
let tipsLoaded = DEFERRED.tips;
/** @type {Promise<NonNullable<typeof DEFERRED.tips>> | null} */
let tipsPending = null;

/**
 * The tips' table with its conditions and texts (tips.js): here at once in pivotkit-react; in
 * pivotkit-element loaded after the first render, null until then. A failed load shows no tip, says so
 * once in the console and is tried again by the next report that mounts.
 */
function useTipsTable() {
    const [mod, setMod] = useState(() => tipsLoaded);
    useEffect(() => {
        const load = DEFERRED.loadTips;
        if (mod || !load) {
            return undefined;
        }
        let live = true;
        tipsPending ??= load().then((m) => (tipsLoaded = m), (error) => {
            tipsPending = null;
            warnOnce(`pivotkit: the tips did not load, the report shows none: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        });
        tipsPending.then(
            (m) => live && setMod(m),
            () => {}
        );
        return () => {
            live = false;
        };
    }, [mod]);
    return mod;
}

/**
 * The report's frame with the skeleton in it, before the report has its data; `silent` while its
 * language's texts load: no word at all, so the report never says anything in English first.
 * @param {import("./index.js").PivotReportProps & { silent?: boolean }} props
 */
function WaitingReport({ locale = "en-US", labels: customLabels, theme = "auto", height = 640, className, label, silent = false }) {
    const root = useRef(/** @type {HTMLDivElement | null} */ (null));
    const labelsKey = JSON.stringify(customLabels ?? null);
    const labels = useMemo(() => resolveLabels(locale, JSON.parse(labelsKey)), [locale, labelsKey]);
    const themeName = useResolvedTheme(theme, root);
    return (
        <div ref={root} className={`pk-root${className ? ` ${className}` : ""}`} data-pk-theme={themeName} lang={silent ? undefined : labels.lang} role="region" aria-label={label || (silent ? undefined : labels.report)} style={{ height }}>
            <Skeleton full text={silent ? "" : labels.loadingReport} />
        </div>
    );
}

/**
 * The report itself, once it has its data.
 * @param {import("./index.js").PivotReportProps} props
 */
function Report(props) {
    const { locale = "en-US", theme = "auto", height = 640, className, label, loading = false, allowImport = false, fileName = "pivot", onExport, exportData = false, drillDownExport = false } = props;
    const host = useHostProps(props);
    const root = useRef(/** @type {HTMLDivElement | null} */ (null));
    // the column with the toolbar, the zones and the result
    const mainRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    // the field list's slot: a drawer on a narrow report
    const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const themeName = useResolvedTheme(theme, root);
    // the layer of the report's popovers and menus
    const [layer, setLayer] = useState(/** @type {HTMLElement | null} */ (null));
    const zonesId = useId();
    const resultId = useId();
    const hintId = useId();
    const formPrefix = useFormPrefix();
    const { size, short, big } = useReportSize({ root, main: mainRef, grow: host.grow, layer });
    const drawer = useDrawer(size, panelRef);
    const { toasts, push, dismiss, pause } = useToasts();
    /** A status note: `extra` holds its action (a button) and its tone. */
    const announce = useCallback((/** @type {string} */ text, /** @type {{ action?: { label: string, run: () => void }, tone?: "error" }} */ extra = {}) => push({ text, ...extra }), [push]);
    const data = useShownData(props, host);
    const { encoded, limits, imported } = data;
    const imp = useImport(imported);
    const history = useViewHistory({ encoded, view: props.view, defaultView: props.defaultView, onViewChange: props.onViewChange, limits, outsideNote: host.baseLabels.steps.outside, orderOf: host.orderOf, dataKey: imported ? imported.key : 0, initial: data.kept?.history });
    const view = history.view;
    const labels = useReportLabels(host.baseLabels, host.info, encoded, view);
    const empty = isEmptyView(view);
    const pivot = usePivotResult({ encoded, view, locale, limits, labels, size, empty, sourceError: data.source.error });
    const { shown } = pivot;
    const fields = useFields({ view, encoded, labels, info: host.info, fieldDefaults: props.fieldDefaults, orderOf: host.orderOf, locale, context: pivot.context });
    const fold = useZoneFold({ zones: props.zones, short, empty });
    const activity = useActivity();
    const steps = useSteps({ history, labels, limits, locale, announce, moveData: imp.moveData, newStep: data.newStep, onChange: activity.countChange, onAdded: fold.keepOpen });
    const { commit } = steps;
    const notes = useUnusedNotes(props, { imported, encoded, limits, keyOf: history.keyOf, view, result: pivot.result, empty, locale });
    const loads = useViewLoading(props, { history, encoded, limits, labels, locale, announce, sourceId: data.sourceId, empty, commit, undoAction: steps.undoAction, remember: data.remember, noteLoad: notes.noteLoad, viaSheet: imp.viaSheet, runAfterSheet: imp.runAfterSheet });
    const dismissed = useDismissed(props, { size, describedFields: fields.described });
    const { menus, help } = useMenus(labels, dismissed.explainSettings);
    const saved = useSavedViews(props, { menus, shown: data, history, view, empty, locale, announce, latest: loads.latest, noteSaved: activity.noteSaved });
    // sharing: a link (when the host allows it), the view as a view file (JSON, a file), loading one
    const link = useShareLink(props, { latest: loads.latest, kept: Boolean(data.kept), history, view, viewName: saved.name, data, encoded, limits, root, announce, fileName, viaSheet: loads.fileViaSheet, applyLoaded: loads.applyLoaded });
    const drill = useDrill(props, { result: pivot.result, imported, swapped: pivot.plan.swap, defaultsOf: fields.defaultsOf, nameOf: fields.nameOf, infoOf: fields.infoOf, noteDrilled: activity.noteDrilled });
    const placing = usePlacing({ view, encoded, labels, limits, locale, commit, fields, info: host.info, drawer, root, noteDrag: activity.noteDrag });
    const chart = useChartState({ view, labels, commit, announce });
    const exporting = useExport({ fileName, result: pivot.computed, encoded, exportData, locale, labels, limits, root, chartRef: chart.chartRef, announce, onExport, title: saved.name, source: data.sourceName, loadECharts, colorMap: host.colorMap });
    const api = useImportApi(imp, { imported, setImported: data.setImported, steps: data.steps, setSteps: data.setSteps, history, encoded, hostEncoded: data.source.encoded, hostSource: props.source, sourceName: data.sourceName, labels, locale, plugins: host.plugins, worker: props.importWorker, limits: host.fileLimits, timeZone: props.timeZone, onDataLoad: props.onDataLoad, announce, dismiss, undo: steps.undoLatest, box: () => root.current?.getBoundingClientRect() });
    useKeepData(data, {
        snapshot: history.snapshot,
        restore: (kept) => {
            imp.mod?.restoreData(api);
            history.replace(kept.history);
        }
    });
    const tipsTable = useTipsTable();
    const tips = tipsShown({ table: tipsTable, view, display: shown, pivot, encoded, empty, typeOf: fields.typeOf, showTable: pivot.tableOnScreen, activity, canSave: saved.canSave, dismissed, labels, locale, commit, nameOf: fields.nameOf, openViews: saved.openViews, narrow: size === "narrow" });
    const results = resultSteps({ view, commit, announce, labels, locale, result: pivot.result, outer: pivot.outer, folding: pivot.folding });
    const layerValue = useMemo(() => ({ layer, size }), [layer, size]);
    const focusReport = () => root.current?.focus({ preventScroll: true });
    const onDrag = allowImport ? imp.fileDrag : undefined;
    // the start screen of an empty view: saved views to try and, with allowImport, a file to load
    const startScreen = { templates: saved.entries, onTemplate: loads.openTemplate, onLoad: allowImport ? () => imp.pickLater(() => announce(labels.menuFailed, { tone: "error" })) : undefined, noData: allowImport && fields.fields.length === 0 };
    return (
        <div
            ref={root}
            className={`pk-root${className ? ` ${className}` : ""}`}
            data-pk-theme={themeName}
            data-pk-size={size}
            data-pk-layout={fold.folded ? "compact" : undefined}
            data-pk-enlarged={big.enlarged ? "" : undefined}
            data-pk-fields={dismissed.railed ? "collapsed" : undefined}
            data-pk-fit={host.grow ? undefined : "contain"}
            lang={labels.lang}
            // a named region, not <main>: the host's page has its own main landmark around the report
            role="region"
            aria-label={label || labels.report}
            style={{ height }}
            // a click anywhere in the report focuses it, so the undo and redo shortcuts work
            tabIndex={-1}
            onKeyDown={reportKeys({ big, layer, open: drawer.open || Boolean(drill.drill) || Boolean(placing.filterTarget), undo: steps.undo, redo: steps.redo })}
            onDragEnter={onDrag}
            onDragOver={onDrag}
            onDragLeave={onDrag}
            onDrop={onDrag}
        >
            <LayerContext.Provider value={layerValue}>
              <LimitsContext.Provider value={limits}>
              <FormNameContext.Provider value={formPrefix}>
              <HelpContext.Provider value={help}>
                <PivotDnd labels={labels} onDrop={placing.onDrop} renderOverlay={(src) => <DragChip src={src} typeOf={fields.typeOf} />} onDragStart={(src) => void (src.kind === "field" && drawer.closeIfNarrow())}>
                    <div className={`pk-layout${drawer.open ? " pk-drawer-open" : ""}`}>
                        <FieldSlot slotRef={panelRef} root={root} labels={labels} fields={fields} placing={placing} drawer={drawer} dismissed={dismissed} announce={announce} />
                        <div className="pk-main" ref={mainRef}>
                            <ReportToolbar view={view} labels={labels} size={size} shown={shown} empty={empty} exportData={exportData} history={history} data={data} steps={steps} loads={loads} saved={saved} share={link.context} exporting={exporting} chartReady={pivot.chartShown && chart.ready} drawer={drawer} dismissed={dismissed} dataMenu={allowImport ? { api } : null} />
                            <Zones view={view} types={fields.types} labels={labels} commit={commit} encoded={encoded} locale={fields.dateLocale} onSwap={results.onSwap} id={zonesId} folded={fold.folded} onFold={() => fold.setFolded(!fold.folded)} defaultsOf={fields.defaultsOf} infoOf={fields.infoOf} titleOf={fields.titleOf} earlier={history.earlier} explain={dismissed.explainZones} showInfo={dismissed.showFieldInfo} adding={placing.adding} />
                            <AboveResult labels={labels} view={view} types={fields.types} context={pivot.context} narrow={drawer.narrow} enlarged={big.enlarged} hint={pivot.tableOnScreen && view.values.length ? hintId : null} link={link} notes={notes} tips={tips} onTipDismiss={dismissed.dismiss} focusReport={focusReport} />
                            <ResultArea id={resultId} hintId={hintId} view={view} labels={labels} locale={locale} size={size} themeName={themeName} root={root} big={big} waiting={loading || link.opening} encoded={encoded} viewKey={history.viewKey} pivot={pivot} chart={chart} chartHost={host} drill={drill} fields={fields} showInfo={dismissed.showFieldInfo} onSort={placing.sortFromHeader} steps={results} empty={startScreen} source={imp.mod ? <imp.mod.SourceLine api={api} /> : null} />
                            {/* the status notes at the bottom edge of what is on screen of the report */}
                            <div className="pk-toast-dock">
                                <Toasts toasts={toasts} dismiss={dismiss} pause={pause} closeLabel={labels.close} />
                            </div>
                        </div>
                        {/* inside the layout: clipped to the report's box with it (its slide-in too) */}
                        {drill.drill ? <MenuPanel name="DrillPanel" props={{ drill: drill.drill, onClose: drill.closeDrill, labels: pivot.context.labels, locale, exportContext: { encoded, onExport, announce, root, exportData, drillDownExport } }} /> : null}
                    </div>
                    {/* the filter and the drill-down load with the menus (lazy-menus.jsx) */}
                    {placing.filterTarget ? <MenuPanel name="FilterPopover" props={{ target: placing.filterTarget, onClose: placing.closeFilter, view, encoded, locale, labels, commit }} /> : null}
                    {drill.point ? <MenuPanel name="PointMenu" props={{ target: drill.point, onClose: drill.closePoint, onRows: drill.openPoint, view, encoded, locale, labels, commit, showRows: drill.pointRows }} /> : null}
                </PivotDnd>
                {/* loading data: the file input, the drop overlay, the preview (import-host.jsx) */}
                {allowImport && imp.mod ? <imp.mod.ImportLayer api={api} input={imp.fileInput} /> : null}
                <div className="pk-layer" ref={setLayer}>
                    {/* a fixed probe at 0, 0: where fixed popovers start (popover.jsx) */}
                    <span className="pk-origin" aria-hidden="true" />
                </div>
              </HelpContext.Provider>
              </FormNameContext.Provider>
              </LimitsContext.Provider>
            </LayerContext.Provider>
        </div>
    );
}
