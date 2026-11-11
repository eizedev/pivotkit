/*
 * <PivotReport>: the report builder. The view and its undo history live in useViewHistory (controlled
 * by the host or not); the field list, the zones, the toolbar, the table and the chart are views of
 * that state and change it through commit(), which they get as a prop. The pivot is computed once per
 * view; the grid only for the table.
 *
 * While the host loads its data (`loading`), and while a large data set is encoded for the first time,
 * the report shows its skeleton (skeleton.jsx). A view can come back by itself: the tab's own
 * (`persistView`, sessionStorage) or a shared link in the page's address (`shareLink`); both are read
 * after the first render, so a server render and its hydration match, and both pass normalize().
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { computePivot, emptyView, encode, fieldLabel, normalize, suggestDateUnit, toGrid, toSeries, viewFields } from "pivotkit-core";
import { PivotChart } from "./chart.jsx";
import { MAX_CATEGORIES, chartPlan } from "./chart-types.js";
import { groupingName, layoutSummary, valueLabel } from "./names.js";
import { PivotDnd } from "./dnd.jsx";
import { DRILL_LIMIT, drillRows } from "./drill.js";
import { displayNames, fieldDefaultsFor, fieldInfoOf, typesOf } from "./field-info.js";
import { FieldPanel } from "./fields.jsx";
import { Icon, TYPE_ICON } from "./icons.jsx";
import { errorText, fill, plural, resolveLabels } from "./labels.js";
import { useIsoLayoutEffect } from "./iso.js";
import { MenuPanel, loadMenus, menusNow, onMenuTexts } from "./lazy-menus.jsx";
import { importNow, loadImport } from "./lazy-import.js";
import { LayerContext } from "./popover.jsx";
import { linkNow, linkParam, loadCheck, loadLink, readLinkParam, readStoredView, shareBase, viewFromObject, writeStoredView } from "./share.js";
import { HelpContext } from "./help.js";
import { Skeleton } from "./skeleton.jsx";
import { PivotTable } from "./table.jsx";
import { Toasts, useToasts } from "./toasts.jsx";
import { localStore, readItem, subscribeItem, writeItem } from "./storage.js";
import { templateEntries, viewsName } from "./templates.js";
import { ALL_TIPS, FIELDS_COLLAPSED, fieldsCollapsed, NO_EXPLANATIONS, activeTips, helpSwitch, allowedTips, cleanDismissed, keptOnReset, parseStored, readStored, subscribeStored, tipActionText, tipContext, tipText, withoutFilters, writeDismissed } from "./tips.js";
import { Tips } from "./tip-list.jsx";
import { Unused } from "./unused.jsx";
import { FormNameContext, activeIn } from "./dom.js";
import { stillApplies } from "./unused-keep.js";
import { Toolbar } from "./toolbar.jsx";
import { prepareExporters, useExport } from "./use-export.js";
import { useResolvedTheme } from "./use-theme.js";
import { useViewHistory } from "./use-view-history.js";
import { tagFor } from "./view-history.js";
import { useBigResult, useFitHeight } from "./use-big-result.js";
import {
    addField, filterZoneFields, groupField, isEmptyView, moveField, removeAt, rowFolding, setChart, setChartDisplay, setCollapsed, setDisplay, setSort, setTotal, sourceOf, swapAxes, toggleCollapsed, zoneOverLimit
} from "./view-ops.js";
import { Zones, zoneEntries } from "./zones.jsx";

/** A saved view's identity (view-save.js: LoadedView), for the keys of the views as saved. */
const savedKeyOf = (t) => JSON.stringify([t.scope, t.store, t.storeSource ?? null, t.sourceId ?? null, t.name]);

/** Width classes of the report (its own width, not the window's). */
export function sizeOf(width) {
    return width < 640 ? "narrow" : width < 1024 ? "medium" : "wide";
}

/**
 * Below this height (px, border box) the report starts with its zones folded into one line, the
 * compact layout; a narrow report (its zones stacked, one line each) below COMPACT_HEIGHT_NARROW.
 */
export const COMPACT_HEIGHT = 600;
export const COMPACT_HEIGHT_NARROW = 820;

/** Whether a report of this width class and height starts compact. */
export const compactAt = (size, height) => height < (size === "narrow" ? COMPACT_HEIGHT_NARROW : COMPACT_HEIGHT);

/** True while a popover or menu of the report is open in its layer (the layer also holds a probe). */
const layerOpen = (layer) => Boolean(layer && [...layer.children].some((c) => !c.classList.contains("pk-origin")));

/** A performance measure for the browser's performance timeline ("pivotkit:computePivot"). */
function measured(name, fn) {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const out = fn();
    if (typeof performance !== "undefined" && typeof performance.measure === "function") {
        try {
            performance.measure(`pivotkit:${name}`, { start: t0, end: performance.now() });
        } catch {
            // an old browser without the options form of measure(): no timing, nothing else changes
        }
    }
    return out;
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

/** The tab's sessionStorage, or null where it is missing or blocked. */
function sessionStore() {
    try {
        return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
    } catch {
        return null;
    }
}

/** What the console was told already, so a developer's mistake is said once per page. */
const warned = new Set();
const warnOnce = (text) => {
    if (!warned.has(text)) {
        warned.add(text);
        console.warn(text);
    }
};

/** A host's chartOptions as a text that changes only when they do, or the object itself (a cycle). */
function optionsKey(options) {
    try {
        return JSON.stringify(options ?? null, (k, v) => (["function", "symbol", "bigint"].includes(typeof v) ? `\u0000${typeof v}` : v));
    } catch {
        return options;
    }
}

/** The page's address and fragment, or undefined outside a browser. */
const here = () => (typeof location !== "undefined" ? { href: location.href, hash: location.hash } : undefined);

/** Rows above which the report shows its skeleton first and encodes the data in the next frame. */
export const DEFER_ROWS = 10_000;

/** The host's data as encode() takes it: rows, or columnar ({ columns, types, data }, one array per column). */
const dataOf = (d) => (Array.isArray(d) || Array.isArray(d?.columns) ? d : []);
/** Rows of the host's data. */
const rowsOf = (d) => (Array.isArray(d) ? d.length : (d?.data?.[0]?.length ?? 0));

/** No data steps (data-history.js): none until a file is loaded. */
const NO_STEPS = Object.freeze({ past: [], future: [] });

/**
 * The issues of a view loaded from outside as the warning's notes, with the view as given; a
 * template's name and description are unknown keys of its view, nothing the person can act on.
 * @param {import("pivotkit-core").Issue[]} issues
 * @param {unknown} raw
 */
const unusedNotes = (issues, raw) => issues.filter((i) => (i.code ?? (i.message === "unknown key" ? "unknownKey" : "")) !== "unknownKey" || !["name", "description"].includes(i.path)).map((issue) => ({ issue, raw }));

/**
 * The pivot report builder. While the host's data loads (`loading`) or a large data set is encoded for
 * the first time, the report shows its skeleton; once shown, the report stays (its view and history
 * too) and a later `loading` covers its result only.
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
    const waiting = Boolean(loading) || deferred;
    if (!waiting && !started) {
        setStarted(true);
    }
    if (waiting && !started) {
        return <WaitingReport {...props} />;
    }
    return <Report {...props} />;
}

/**
 * The report's frame with the skeleton in it, before the report has its data.
 * @param {import("./index.js").PivotReportProps} props
 */
function WaitingReport({ locale = "en-US", labels: customLabels, theme = "auto", height = 640, className, label }) {
    const root = useRef(/** @type {HTMLDivElement | null} */ (null));
    const labelsKey = JSON.stringify(customLabels ?? null);
    const labels = useMemo(() => resolveLabels(locale, JSON.parse(labelsKey)), [locale, labelsKey]);
    const themeName = useResolvedTheme(theme, root);
    return (
        <div ref={root} className={`pk-root${className ? ` ${className}` : ""}`} data-pk-theme={themeName} lang={labels.lang} role="region" aria-label={label || labels.report} style={{ height }}>
            <Skeleton full text={labels.loadingReport} />
        </div>
    );
}

/**
 * The host's view as JSON, to compare it by value; "null" for none, and for one that is no JSON (a
 * cycle, a BigInt): normalize() reports nothing of that kind here.
 * @param {unknown} view
 */
function keyOfHostView(view) {
    try {
        return JSON.stringify(view ?? null) ?? "null";
    } catch {
        return "null";
    }
}

/** A subscription to something that never changes (useSyncExternalStore of a value chosen once). */
const staysTheSame = () => () => undefined;

/**
 * The start screen of an empty view; with `onLoad` (allowImport) a place to drop a file or pick one,
 * and without any data (`noData`) only that.
 */
function EmptyState({ labels, templates, onTemplate, onLoad, noData }) {
    return (
        <div className="pk-empty" data-testid="empty-state">
            <div className="pk-empty-art" aria-hidden="true">
                <span className="pk-empty-chip pk-c1" />
                <span className="pk-empty-chip pk-c2" />
                <span className="pk-empty-chip pk-c3" />
            </div>
            <h2>{noData ? labels.emptyNoData : labels.emptyTitle}</h2>
            {noData ? null : (
                <ol className="pk-steps">
                    {labels.emptySteps.map((s, i) => (
                        <li key={i}>
                            <span className="pk-step-n" aria-hidden="true">
                                {i + 1}
                            </span>
                            <span>{s}</span>
                        </li>
                    ))}
                </ol>
            )}
            {onLoad ? (
                <div className="pk-drop-zone" data-testid="empty-drop">
                    <p>{labels.emptyLoad}</p>
                    <button type="button" className="pk-btn" onClick={onLoad} data-testid="empty-load">
                        <Icon name="upload" />
                        <span className="pk-btn-text">{labels.loadData}</span>
                    </button>
                </div>
            ) : null}
            {templates.length ? (
                <div className="pk-empty-actions">
                    {templates.slice(0, 3).map((t, i) => (
                        <button key={`${i}:${t.name}`} type="button" className="pk-btn" onClick={() => onTemplate(t)}>
                            <Icon name="sparkle" />
                            <span className="pk-btn-text">{fill(labels.tryView, { name: t.name })}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/**
 * The report itself, once it has its data.
 * @param {import("./index.js").PivotReportProps} props
 */
function Report(props) {
    const {
        data,
        dataKey,
        encoded: encodedProp,
        view: viewProp,
        defaultView,
        onViewChange,
        templates = [],
        onSaveTemplate,
        onDeleteTemplate,
        onPublishTemplate,
        canPublish = false,
        templateStore,
        onCellClick,
        drillDown = true,
        drillDownLimit = DRILL_LIMIT,
        locale = "en-US",
        timeZone,
        labels: customLabels,
        theme = "auto",
        height = 640,
        limits: limitsProp,
        className,
        fileName = "pivot",
        fieldDefaults,
        onExport,
        label,
        tips: tipsProp = "on",
        storageKey,
        dismissedTips,
        onTipDismiss,
        chartOptions,
        shareLink,
        persistView,
        fieldInfo: fieldInfoProp,
        zoneInfo: zoneInfoProp,
        settingInfo: settingInfoProp,
        source: sourceProp,
        sources,
        onSourceSwitch,
        schemaUrl,
        grow: growProp,
        fieldList,
        loading = false,
        allowImport = false,
        plugins: pluginsProp,
        onDataLoad,
        importWorker
    } = props;
    // past its box only without a height of the host's (or when the host asks for it): a card with a
    // height keeps the report inside, its result scrolls
    const grow = growProp === "on" || (growProp !== "off" && props.height === undefined);
    // the data the view is made for (the host's source), for the view files and the check before a load
    const hostSourceId = typeof sourceProp?.id === "string" && sourceProp.id ? sourceProp.id : undefined;
    const hostSourceName = typeof sourceProp?.name === "string" && sourceProp.name ? sourceProp.name : undefined;
    // loading data in the browser (allowImport): the file's data shown, null for the host's; the data
    // steps of the undo history (data-history.js), the file being read (the import dialog), a file
    // dragged over the report, and the import UI once loaded (lazy-import.jsx)
    const [imported, setImported] = useState(/** @type {import("./import-steps.js").ShownData | null} */ (null));
    const [dataSteps, setDataSteps] = useState(/** @type {import("./data-history.js").DataSteps} */ (NO_STEPS));
    const [job, setJob] = useState(/** @type {{ file: File, n: number } | null} */ (null));
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const [importMod, setImportMod] = useState(importNow);
    const fileInput = useRef(/** @type {HTMLInputElement | null} */ (null));
    const plugins = Array.isArray(pluginsProp) ? pluginsProp : [];
    // the data the view is made for: the file's (its name and the hash of its columns, so the browser
    // store keeps views per file), else the host's source
    const sourceId = imported ? imported.source.id : hostSourceId;
    const sourceName = imported ? imported.source.name : hostSourceName;

    // props a host may rebuild on every render, compared by value
    const labelsKey = JSON.stringify(customLabels ?? null);
    const defaultsKey = JSON.stringify(fieldDefaults ?? null);
    // what the host says about its fields: display names, descriptions, links; nothing changes without it
    const info = useMemo(() => fieldInfoOf(JSON.parse(defaultsKey)), [defaultsKey]);
    const baseLabels = useMemo(() => resolveLabels(locale, JSON.parse(labelsKey)), [locale, labelsKey]);
    const typesKey = JSON.stringify(typesOf(fieldDefaults));
    const limitsKey = JSON.stringify(limitsProp ?? null);
    const limits = useMemo(() => JSON.parse(limitsKey) ?? undefined, [limitsKey]);
    const root = useRef(/** @type {HTMLDivElement | null} */ (null));
    const themeName = useResolvedTheme(theme, root);
    const [layer, setLayer] = useState(/** @type {HTMLElement | null} */ (null));
    const [size, setSize] = useState("wide");
    // the measured height class, and the one the layout follows: a change waits while a popover is
    // open, so a resize never pulls the zones (and a chip menu's anchor) from under the user
    const [measuredShort, setMeasuredShort] = useState(false);
    const [short, setShort] = useState(false);
    // the user's choice of the compact layout (Layout in the toolbar, the folded line); null: by height
    const [folded, setFolded] = useState(/** @type {boolean | null} */ (null));
    const layoutFolded = folded ?? short;
    const zonesId = useId();
    // the prefix of the names of this report's form fields (dom.js useFormName): useId is unique in
    // one React root only, two web components are two roots; chosen in the browser, so a server
    // render and its hydration agree (the server's snapshot is the plain prefix)
    const ownPrefix = useRef(/** @type {string | null} */ (null));
    const formPrefix = useSyncExternalStore(staysTheSame, () => (ownPrefix.current ??= `pk-${Math.random().toString(36).slice(2, 8)}`), () => "pk");
    const [drawer, setDrawer] = useState(false);
    const [filterTarget, setFilterTarget] = useState(/** @type {{ field: string, anchor: HTMLElement, base?: object } | null} */ (null));
    const [drill, setDrill] = useState(/** @type {import("./drill-table.js").DrillSource | null} */ (null));
    const [hinted, setHinted] = useState(false);
    // changes of the view in this session, and their number at the first drag (for the tips)
    const changesRef = useRef(0);
    const [changes, setChanges] = useState(0);
    const [dragAt, setDragAt] = useState(/** @type {number | null} */ (null));
    // `changes` when the view was last saved: the tip to save it waits for new changes
    const [savedAt, setSavedAt] = useState(0);
    // the menus' module once loaded: its texts are those of the "i" of the settings (help.labels)
    const [menus, setMenus] = useState(/** @type {typeof import("./menus.js") | null} */ (null));
    // a language's menu texts arrived or failed: the help's labels follow (counted, to render again)
    const [, setTexts] = useState(0);
    useEffect(() => onMenuTexts(() => setTexts((n) => n + 1)), []);
    // a tip's "Save view" opens the Views menu: a new number is a new request
    const [viewsRequest, setViewsRequest] = useState(0);
    // what a loaded view (a file, a link, a saved view) left out, for the area above the result; it
    // stays until it is dismissed or another view is loaded
    // (`loaded`: that view normalized, for the lines that still apply to the view shown, unused-keep.js;
    // `after`: the host's view then, so a host's broken view given later takes the area over)
    const [leftOut, setLeftOut] = useState(/** @type {{ notes: import("./unused.jsx").UnusedNote[], loaded: any, after: string | null }} */ ({ notes: [], loaded: null, after: null }));
    const [issuesDismissed, setIssuesDismissed] = useState(/** @type {string | null} */ (null));
    // views loaded from outside (a template, a file, a link, New): a new one is a new warning of its
    // unused parts (open again, not dismissed), also with the same parts as the view before
    const [loads, setLoads] = useState(0);
    // the status note of the last load said already that some parts did not fit
    const [unusedSaid, setUnusedSaid] = useState(false);
    // the view loaded: the saved view or file it came from (its name names the files it is shared as),
    // its group ("user", "shared"; null for a file or a link), whether the browser store keeps it, and
    // its view as saved (`key`, history.keyOf), so the toolbar shows when it has unsaved changes
    // the saved view each step of the history shows travels with it (history.tag, view-save.js's
    // LoadedView); `savedKeys` holds each saved view as it was loaded or saved (history.keyOf, by
    // savedKeyOf), so the toolbar shows when the view shown has unsaved changes
    const [savedKeys, setSavedKeys] = useState(/** @type {Record<string, string>} */ ({}));
    // the whole label of the row in use while the table is virtual (table.jsx: onRowLabel)
    const [rowLabel, setRowLabel] = useState(/** @type {string | null} */ (null));
    const chartRef = useRef(null);
    const [chartReady, setChartReady] = useState(false);
    const hintId = useId();
    const closeFilter = useCallback(() => setFilterTarget(null), []);
    const { toasts, push, dismiss, pause } = useToasts();
    const announce = useCallback(
        /** @param {string} text @param {{ action?: { label: string, run: () => void }, tone?: "error" }} [extra] */
        (text, extra) => push({ text, ...extra }),
        [push]
    );

    // the data, encoded once per data set: per array, or per dataKey when the host gives one (a host
    // that builds a new array on every render passes a key, so the rows are not encoded again)
    const dataIdentity = dataKey !== undefined ? dataKey : data;
    const source = useMemo(() => {
        try {
            const types = JSON.parse(typesKey);
            const enc = encodedProp ?? measured("encode", () => encode(dataOf(data), { timeZone: timeZone ?? "UTC", limits, ...(types ? { types } : {}) }));
            return { encoded: enc, error: null };
        } catch (error) {
            return { encoded: encode([]), error };
        }
        // data is read through dataIdentity: with a dataKey a new array with the same key is the same data
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [encodedProp, dataIdentity, timeZone, limits, typesKey]);
    const encoded = imported ? imported.encoded : source.encoded;
    // the display names (labels.fields), told apart where two fields would look the same
    const fieldNamesKey = encoded.schema.fields.map((f) => f.name).join("\u0000");
    const labels = useMemo(() => {
        const fields = displayNames(info, fieldNamesKey ? fieldNamesKey.split("\u0000") : []);
        return fields ? { ...baseLabels, core: { ...baseLabels.core, fields } } : baseLabels;
    }, [baseLabels, info, fieldNamesKey]);

    // the host's custom orders (fieldDefaults.order), compared by value: every view shown sorts by them
    const ordersKey = JSON.stringify(
        fieldDefaults && typeof fieldDefaults === "object"
            ? Object.entries(fieldDefaults).filter(([, d]) => d && Array.isArray(d.order) && d.order.length > 0).map(([field, d]) => [field, d.order])
            : []
    );
    const orderOf = useMemo(() => {
        const orders = /** @type {[string, unknown[]][]} */ (JSON.parse(ordersKey));
        if (!orders.length) {
            return undefined;
        }
        return (/** @type {string} */ field) => orders.find(([name]) => name.toLowerCase() === field.toLowerCase())?.[1];
    }, [ordersKey]);
    const history = useViewHistory({ encoded, view: viewProp, defaultView, onViewChange, limits, outsideNote: labels.steps.outside, orderOf, dataKey: imported ? imported.key : 0 });
    const view = history.view;
    // the host's view (`view`, else the first `defaultView`) and what of it the data cannot use: shown
    // above the result like a loaded view's unused parts, once per distinct view (a host may render the
    // same view again and again), not while the data is still on its way
    const [startView] = useState(() => defaultView);
    const hostKey = keyOfHostView(viewProp !== undefined ? viewProp : startView);
    const keyOf = history.keyOf;
    const hostNotes = useMemo(() => {
        if (hostKey === "null" || loading || encoded.schema.fields.length === 0) {
            return null;
        }
        const raw = JSON.parse(hostKey);
        if (raw === null) {
            return null;
        }
        const notes = unusedNotes(normalize(raw, encoded, { limits }).issues, raw);
        return notes.length ? { notes, loaded: JSON.parse(keyOf(raw)) } : null;
    }, [hostKey, loading, encoded, limits, keyOf]);
    /** What a loaded view (`given`, as given) left out, for the area above the result. */
    const leaveOut = useCallback((notes, given) => setLeftOut({ notes, loaded: given ? JSON.parse(keyOf(given)) : null, after: hostKey }), [keyOf, hostKey]);
    // the saved view shown: the history step's, when it was loaded for the data shown now (another
    // source with the same columns keeps the history, not the name)
    const loadedView = tagFor(history.tag, sourceId);
    const viewName = loadedView?.name ?? null;
    const unsaved = Boolean(loadedView) && savedKeys[savedKeyOf(loadedView)] !== history.viewKey;

    // the host's chartOptions, compared by value (a function or another value JSON cannot hold counts
    // as its kind); the chart checks them (chart-options.js, loaded with ECharts) before it draws
    const chartOptionsKey = optionsKey(chartOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stableChartOptions = useMemo(() => chartOptions, [chartOptionsKey]);

    const stepText = useCallback(
        (note) => {
            const template = Object.hasOwn(labels.steps, note.step) ? labels.steps[note.step] : labels.steps.change;
            return fill(template, {
                field: note.field ?? "",
                name: note.name ?? "",
                zone: labels.zones[note.zone] ?? note.zone ?? "",
                display: note.display ? labels[note.display] : "",
                type: note.type ? labels.chartTypes[note.type] : ""
            });
        },
        [labels]
    );
    // the import UI's view of the report (`api` below), for the steps an event starts
    const apiNow = useRef(/** @type {any} */ (null));
    // Undo and Redo: the view's own steps first, then a data step (a file loaded, the original data)
    const undo = () => {
        const note = history.canUndo || !importMod ? history.undo() : importMod.moveData(apiNow.current, true);
        if (note !== null) {
            announce(fill(labels.toastUndone, { step: note }));
        }
    };
    const redo = () => {
        const note = history.canRedo || !importMod ? history.redo() : importMod.moveData(apiNow.current, false);
        if (note !== null) {
            announce(fill(labels.toastRedone, { step: note }));
        }
    };
    /** A new step drops the data steps undone before it. */
    const newStep = useCallback(() => setDataSteps((s) => (s.future.length ? { past: s.past, future: [] } : s)), []);
    // the toast's Undo runs later, on the history of that moment
    const undoLater = useRef(undo);
    useEffect(() => {
        undoLater.current = undo;
    });
    // Reset shows the start view, no saved view: the history's step has no tag (Undo brings it back)
    const reset = useCallback(() => {
        history.reset(labels.steps.reset);
        newStep();
        // as New's note: Undo right there brings the view back
        announce(labels.toastReset, { action: { label: labels.undo, run: () => undoLater.current() } });
    }, [history, labels, announce, newStep]);

    // a view that comes back by itself: the tab's stored one, then a shared link (which wins); read
    // once, after the first render. A link needs pivotkit-core/link: while it loads the result waits.
    const param = linkParam(storageKey);
    const [opening, setOpening] = useState(false);
    const appliedLink = useRef(/** @type {string | null} */ (null));
    // commit() is defined further down: the ref gets it after the render
    const latest = useRef({ history, encoded, limits, labels, announce, commit: /** @type {any} */ (null), sourceId, loaded: /** @type {any} */ (null), sources, onSourceSwitch });
    // a link for other data, waiting for the user's choice (Load anyway, Cancel, Switch)
    const [linkCheck, setLinkCheck] = useState(/** @type {null | { lines: string[], quiet: boolean, load: () => void, switchTo?: { name: string, run: () => void } }} */ (null));
    /**
     * Opens the view of a link text; the result waits while the link module loads. At load the link is
     * where the report starts (a new history); a link opened later in the tab (only the fragment
     * changed) is a step Undo takes back, like Open view file.
     */
    const openLink = useCallback((text, asStep = false) => {
        appliedLink.current = text;
        const now = linkNow();
        const apply = (m) => {
            const { history: h, encoded: enc, limits: lim, labels: l, announce: say, sourceId: id, loaded: done, sources: list, onSourceSwitch: switchTo } = latest.current;
            const decoded = m.decodeViewLink(text);
            // a link carries a view file (its link profile) or, made before it, a bare view
            const loaded = decoded.view ? viewFromObject(decoded.view, enc, { limits: lim, sourceId: id }) : null;
            if (!loaded || !loaded.view) {
                say(loaded?.failed === "newer" ? l.viewFailed.newer : l.viewFailed.badLink, { tone: "error" });
                return;
            }
            const open = () => {
                if (asStep) {
                    done(loaded, { link: true });
                } else {
                    h.restore(/** @type {object} */ (loaded.view));
                    done(loaded, { link: true, restored: true });
                }
            };
            // a link made for other data asks first, as a pasted view does
            const check = loadCheck(loaded, l, Array.isArray(list) ? list : []);
            if (!check) {
                open();
                return;
            }
            const target = check.switchTo;
            setLinkCheck({
                lines: check.lines,
                quiet: !asStep,
                load: open,
                switchTo:
                    target && typeof switchTo === "function"
                        ? { name: target.name, run: () => switchTo({ source: { id: target.id, name: target.name }, view: /** @type {Record<string, unknown>} */ (loaded.file?.view ?? loaded.view), name: loaded.file?.name || undefined }) }
                        : undefined
            });
        };
        if (now) {
            apply(now);
            return;
        }
        setOpening(true);
        loadLink().then(
            (m) => {
                setOpening(false);
                apply(m);
            },
            () => {
                setOpening(false);
                latest.current.announce(latest.current.labels.viewFailed.badLink, { tone: "error" });
            }
        );
    }, []);
    useIsoLayoutEffect(() => {
        const page = here();
        const link = shareLink ? readLinkParam(page?.hash ?? "", param) : null;
        if (link) {
            openLink(link);
        } else if (persistView === "session") {
            const raw = readStoredView(storageKey, sessionStore());
            if (raw) {
                try {
                    const loaded = viewFromObject(JSON.parse(raw), encoded, { limits });
                    if (loaded.view) {
                        history.restore(loaded.view);
                    }
                } catch {
                    // a stored text that is no JSON (changed by hand): the start view stays
                }
            }
        }
        // once per mounted report: a later change of these props does not bring a stored view back
    }, []);
    // a link opened in the same tab (only the fragment changed): its view, once
    useEffect(() => {
        if (!shareLink || typeof window === "undefined") {
            return undefined;
        }
        const onHash = () => {
            const link = readLinkParam(here()?.hash ?? "", param);
            if (link && link !== appliedLink.current) {
                openLink(link, true);
            }
        };
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
    }, [shareLink, param, openLink]);
    // the tab keeps the view shown (persistView="session"); Reset stores the start view the same way
    useEffect(() => {
        if (persistView === "session") {
            writeStoredView(storageKey, sessionStore(), JSON.parse(history.viewKey));
        }
    }, [persistView, storageKey, history.viewKey]);

    /**
     * Every change of the view: `note.step` names it for "Undone: ...". Adding needs no note on
     * screen (the chip appears); a removal offers Undo.
     */
    const commit = useCallback(
        /** @param {object} next @param {{ step: string, removed?: boolean, field?: string, zone?: string, name?: string, display?: string, type?: string }} [note] @param {any} [tag] the saved view it is (history.tag) */
        (next, note = { step: "change" }, tag = undefined) => {
            // a field beyond the limit of its zone would vanish in normalize(): refuse the step and say so
            const over = note.step === "template" ? null : zoneOverLimit(next, limits);
            if (over) {
                announce(fill(labels.zoneFull, { zone: labels.zones[over.zone], max: over.max.toLocaleString(locale) }), { tone: "error" });
                return;
            }
            const changed = history.commit(next, stepText(note), tag);
            if (changed) {
                changesRef.current += 1;
                setChanges(changesRef.current);
                newStep();
            }
            if (!changed || !note.removed) {
                return;
            }
            announce(fill(labels.toastRemoved, { field: note.field ?? "" }).trim(), { action: { label: labels.undo, run: () => undoLater.current() } });
        },
        [history, stepText, labels, announce, limits, locale, newStep]
    );

    /** A saved view as it is kept now (loaded or saved): the view shown differs from it, or not. */
    const remember = useCallback((tag, key) => setSavedKeys((all) => ({ ...all, [savedKeyOf(tag)]: key })), []);

    /**
     * A view loaded from outside (a file, pasted JSON, a link) is shown: a step Undo takes back (a link
     * read at the start is where the report starts, `restored`), a note that it was loaded (with Undo)
     * that goes by itself, and what it left out in the area above the result, which stays.
     */
    const applyLoaded = useCallback(
        /** @param {import("./share.js").LoadedView} loaded @param {{ link?: boolean, restored?: boolean }} [how] */
        (loaded, { link = false, restored = false } = {}) => {
            if (!loaded.view) {
                return;
            }
            // a file or a link names its view, which is not among the saved ones (Save is off for it)
            const tag = loaded.file?.name ? { name: loaded.file.name, scope: null, store: false, sourceId: latest.current.sourceId } : null;
            if (tag) {
                remember(tag, latest.current.history.keyOf(loaded.view));
            }
            if (restored) {
                latest.current.history.setTag(tag);
            } else {
                commit(loaded.view, { step: "viewLoaded" }, tag);
            }
            const notes = unusedNotes(loaded.issues, loaded.file?.view);
            leaveOut(notes, loaded.view);
            setIssuesDismissed(null);
            setLoads((x) => x + 1);
            // the status note says some parts did not fit: the warning's live region stays quiet
            setUnusedSaid(notes.length > 0);
            const text = link ? (notes.length ? labels.toastLinkOpenedPartly : labels.toastLinkOpened) : notes.length ? labels.toastViewLoadedPartly : labels.toastViewLoaded;
            announce(text, restored ? undefined : { action: { label: labels.undo, run: () => undoLater.current() } });
        },
        [commit, labels, announce, remember, leaveOut]
    );

    useEffect(() => {
        latest.current = { history, encoded, limits, labels, announce, commit, sourceId, loaded: applyLoaded, sources, onSourceSwitch };
    });

    // the pivot, once per view
    const computed = useMemo(() => {
        try {
            return { result: measured("computePivot", () => computePivot(encoded, view, { locale, limits })), error: null };
        } catch (error) {
            return { result: null, error };
        }
    }, [encoded, view, locale, limits]);
    const result = computed.result;
    // what the chart draws: the user's type, or the one the data suggests ("auto"), for which rows and
    // columns may be swapped for the chart alone (dates on Columns run along the axis)
    const plan = useMemo(() => chartPlan(view, encoded), [view, encoded]);
    const chartComputed = useMemo(() => {
        if (!plan.swap || view.display !== "chart" || !result) {
            return computed;
        }
        try {
            return { result: measured("computePivot", () => computePivot(encoded, swapAxes(view), { locale, limits })), error: null };
        } catch (error) {
            return { result: null, error };
        }
    }, [plan.swap, view, encoded, locale, limits, computed, result]);
    const chartResult = chartComputed.result;
    const empty = isEmptyView(view);
    const gridState = useMemo(() => {
        if (!result || view.display !== "table" || empty) {
            return { grid: null, error: null };
        }
        try {
            return { grid: measured("toGrid", () => toGrid(result, { locale, labels: labels.core, limits })), error: null };
        } catch (error) {
            return { grid: null, error };
        }
    }, [result, view.display, empty, locale, labels, limits]);
    const error = source.error ?? computed.error ?? gridState.error ?? (view.display === "chart" ? chartComputed.error : null);

    // fields: the data's columns for the list; the type of a chip is its source field's
    const fields = encoded.schema.fields;
    const types = useMemo(() => new Map(viewFields(view, encoded).map((f) => [f.name.toLowerCase(), f.type])), [view, encoded]);
    const typeOf = useCallback((field) => types.get(sourceOf(view, field ?? "").toLowerCase()) ?? "string", [types, view]);
    /** A field's display name (fieldDefaults label), else its name. */
    const nameOf = useCallback((field) => fieldLabel(field, labels.core), [labels]);
    /** True when the host gives a field on an axis an order (fieldDefaults.order); a grouping has items of its own. */
    const hostOrdered = useCallback((field) => sourceOf(view, field) === field && (orderOf?.(field)?.length ?? 0) > 0, [view, orderOf]);
    /** A click on a table header: the field's new sort, a step Undo takes back as the chip menu's. */
    const sortFromHeader = useCallback((field, sort) => commit(setSort(view, field, sort), { step: "sort", field: nameOf(field) }), [view, commit, nameOf]);
    /** A field's description and link (of its source field for a grouping), or undefined. */
    const infoOf = useCallback(
        (field) => {
            if (!field || info.size === 0) {
                return undefined;
            }
            const entry = info.get(sourceOf(view, field).toLowerCase());
            return entry && entry.description ? entry : undefined;
        },
        [info, view]
    );
    const placed = useMemo(() => {
        const map = new Map();
        const mark = (name, zone) => {
            const key = sourceOf(view, name).toLowerCase();
            const list = map.get(key) ?? [];
            if (!list.includes(zone)) {
                list.push(zone);
            }
            map.set(key, list);
        };
        view.rows.forEach((f) => mark(f, "rows"));
        view.cols.forEach((f) => mark(f, "cols"));
        view.values.forEach((v) => v.field && mark(v.field, "values"));
        filterZoneFields(view).forEach((f) => mark(f, "filters"));
        return map;
    }, [view]);

    // the menus' panels, right after the first render: there before anyone opens a menu; with the
    // menu texts of the report's language, again when it changes
    const lang = labels.lang;
    useEffect(() => {
        let live = true;
        loadMenus(lang).then(
            (m) => {
                if (live) {
                    setMenus(() => m);
                }
            },
            () => undefined
        );
        return () => {
            live = false;
        };
    }, [lang]);
    // the report's least height: it grows past a host box too low for it (use-big-result.js)
    const mainRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const fit = useFitHeight(root, mainRef, grow);
    const big = useBigResult(root);
    // size class from the report's own width; the height class from its border box, measured before
    // the first paint, so a low report never shows its zones open for a frame. A box lower than the
    // open zones need (fit) is low too.
    useIsoLayoutEffect(() => {
        const el = root.current;
        if (!el) {
            return undefined;
        }
        const box = el.getBoundingClientRect();
        // the width class before the first paint too: never a frame of the wide layout on a phone
        setSize(sizeOf(box.width));
        const first = compactAt(sizeOf(box.width), box.height);
        setMeasuredShort(first);
        setShort(first);
        if (typeof ResizeObserver !== "function") {
            return undefined;
        }
        const ro = new ResizeObserver(([entry]) => {
            const width = sizeOf(entry.contentRect.width);
            setSize(width);
            const height = entry.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
            // low: below the size class's height, or too low for what the open zones need (then the
            // report would grow past its box; folded, it fits)
            setMeasuredShort(compactAt(width, height) || (fit.current.open > 0 && height <= fit.current.open + 1));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    useEffect(() => {
        if (measuredShort === short) {
            return undefined;
        }
        const apply = () => {
            if (!layerOpen(layer)) {
                setShort(measuredShort);
            }
        };
        apply();
        if (!layer || typeof MutationObserver !== "function") {
            return undefined;
        }
        // a popover is open: apply when it closes
        const mo = new MutationObserver(apply);
        mo.observe(layer, { childList: true });
        return () => mo.disconnect();
    }, [measuredShort, short, layer]);
    const drawerOpen = drawer && size === "narrow";
    const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    useEffect(() => {
        // the closed drawer is out of the tab order and hidden from assistive technology
        if (panelRef.current) {
            panelRef.current.inert = size === "narrow" && !drawerOpen;
        }
    }, [size, drawerOpen]);

    /** A field's settings: the host's (fieldDefaults), and an identifier's own when the host says nothing (field-info.js). */
    const defaultsOf = useCallback((field) => fieldDefaultsFor(fieldDefaults, field, encoded.column(field)), [fieldDefaults, encoded]);
    /** How a field from the field list is placed: a date grouped by its span, a value with the field's settings. */
    const placeOptions = useCallback(
        (field, zone, index = undefined) => {
            const column = encoded.column(field);
            const unit = zone !== "values" && column && column.type === "date" && !column.derived ? suggestDateUnit(encoded, field) : null;
            return { index, type: typeOf(field), defaults: defaultsOf(field), dateUnit: unit, groupName: unit ? groupingName(nameOf(column.name), unit, labels) : undefined };
        },
        [encoded, typeOf, defaultsOf, labels, nameOf]
    );
    const addTo = useCallback(
        (field, zone, index = undefined) => {
            const options = placeOptions(field, zone, index);
            commit(addField(view, field, zone, options), { step: "added", field: options.groupName ?? nameOf(field), zone });
        },
        [view, placeOptions, commit, nameOf]
    );

    /**
     * "Filter…" of a field not in the report: the filter of a draft that puts it into Filters (a date
     * grouped as it would be placed), so Apply places it with the selection and Cancel changes nothing.
     */
    const filterNew = useCallback(
        (field, anchor) => {
            const options = placeOptions(field, "filters");
            const draft = addField(view, field, "filters", options);
            // on a narrow report the field list is a drawer: it closes, the filter anchors to its button
            const opener = size === "narrow" ? /** @type {HTMLElement | null} */ (root.current?.querySelector("[data-pk-opener='fields']") ?? null) : null;
            if (size === "narrow") {
                setDrawer(false);
            }
            const target = opener ?? anchor;
            if (target) {
                setFilterTarget({ field: options.groupName ?? field, anchor: target, base: draft });
            }
        },
        [placeOptions, view, size]
    );

    const onDrop = useCallback(
        (src, target) => {
            // the first drag: a tip about Undo and the menus follows (it counts the change it makes)
            setDragAt((at) => at ?? changesRef.current + 1);
            if (target.zone === "panel") {
                if (src.kind !== "field") {
                    commit(removeAt(view, src.zone, src.index), { step: "removed", removed: true, field: src.label ?? src.field });
                }
                return;
            }
            if (src.kind === "field") {
                addTo(src.field, target.zone, target.index);
            } else {
                const zone = /** @type {any} */ (target.zone);
                const note = src.zone !== zone ? { step: "moved", field: src.label ?? src.field, zone } : { step: "reordered", zone };
                // into Values: a new value, counted or summed by the field's settings as one from the field list
                commit(moveField(view, src.zone, src.index, zone, target.index, { type: typeOf(src.field), defaults: zone === "values" && src.field ? defaultsOf(src.field) : undefined }), note);
            }
        },
        [view, typeOf, commit, addTo, defaultsOf]
    );

    const openCell = useCallback(
        /** @param {any} cell */
        ({ rowPath = [], colPath = [], value, valueIndex, text }) => {
            if (!result) {
                return;
            }
            setHinted(true);
            // the host's own row objects, unless the rows are rebuilt from the columns (encoded, columnar, a file's)
            const { count, rows, indices } = drillRows(result, { rowPath, colPath, data: encodedProp || imported || !Array.isArray(data) ? null : data, limit: drillDownLimit });
            onCellClick?.({ row: rowPath, col: colPath, value, valueIndex, text, count, rows });
            if (drillDown) {
                // the values as the table shows them; a host's format for a field (fieldDefaults) applies
                const formatOf = (name) => {
                    const d = defaultsOf(name);
                    return d ? (d.drillFormat ?? d.format) : undefined;
                };
                // the panel's table is drill-table.js's, with the menus: here only what it is made of
                setDrill({ result, rowPath, colPath, count, indices, formatOf, nameOf, infoOf });
            }
        },
        [result, encodedProp, imported, data, drillDownLimit, onCellClick, drillDown, defaultsOf, nameOf, infoOf]
    );

    const doExport = useExport({ fileName, result, locale, labels, limits, root, chartRef, announce, onExport });

    // loading data (allowImport): the import UI (import-host.jsx) loads on first use (the Data menu, a
    // file dragged over the report, the empty report's button) and renders the file input, the drop
    // overlay and the preview; "Load data" there replaces the data shown (import-steps.js)
    // (rendered at once: the empty report's "Load data…" clicks the file input the module renders)
    const requestImport = () => loadImport().then((m) => (flushSync(() => setImportMod(() => m)), m));
    /** What the import UI works on: this render's state, its setters and the props it needs. */
    const api = {
        imported, setImported, steps: dataSteps, setSteps: setDataSteps, job, setJob, dragging, history, encoded, hostEncoded: source.encoded, hostSource: sourceProp, sourceName, labels, locale, plugins, worker: importWorker, limits, timeZone, onDataLoad, announce,
        undo: () => undoLater.current(),
        box: () => root.current?.getBoundingClientRect(),
        pick: () => importMod?.pickFile(fileInput.current),
        load: requestImport
    };
    useEffect(() => {
        apiNow.current = api;
    });
    /** A file dragged over the report and dropped: counted in and out of its parts, then read. */
    const fileDrag = (/** @type {React.DragEvent} */ e) => {
        if (!Array.prototype.includes.call(e.dataTransfer?.types ?? [], "Files")) {
            return;
        }
        e.preventDefault();
        const files = e.type === "drop" ? [...e.dataTransfer.files] : null;
        dragDepth.current = files ? 0 : Math.max(0, dragDepth.current + (e.type === "dragenter" ? 1 : e.type === "dragleave" ? -1 : 0));
        setDragging(dragDepth.current > 0);
        if (e.type !== "dragover") {
            requestImport().then((m) => files && m.startFiles(apiNow.current, files), () => undefined);
        }
    };

    // sharing: a link (when the host allows it), the view as a view file (JSON, a file), loading one;
    // what each does is share-actions.js's, loaded with the menus
    const base = shareBase(shareLink, here()?.href);
    /** @type {import("./share-actions.js").ShareContext} */
    const share = {
        canLink: base !== null,
        prepare: base !== null ? () => void loadLink().catch(() => undefined) : undefined,
        view,
        viewName,
        sourceId,
        sourceName,
        schemaUrl,
        encoded,
        shareLink,
        param,
        root,
        fileName,
        onExport,
        announce,
        limits,
        sources,
        onSourceSwitch,
        applyLoaded
    };

    const loadTemplate = useCallback(
        (t) => {
            // which saved view this is: its group, the browser store's entry (by its name and the data
            // it names), and the data it was loaded for
            const tag = { name: t.name, scope: t.scope === "user" ? "user" : "shared", store: t.at !== undefined, storeSource: t.sourceId ?? null, sourceId };
            remember(tag, history.keyOf(t.view));
            commit(t.view, { step: "template", name: t.name }, tag);
            // a saved view made with other limits loads with the fields that fit: what was left out
            // goes into the area above the result, the note says it was loaded
            const over = zoneOverLimit(t.view, limits);
            // what else of it the data cannot use (a field that is gone, a setting this version lacks);
            // a zone over the limit is said in its own words above
            const issues = normalize(t.view, encoded, { limits }).issues.filter((i) => !over || i.code !== "tooMany");
            leaveOut([...(over ? [{ text: fill(labels.viewTrimmed, { name: t.name, zone: labels.zones[over.zone], max: over.max.toLocaleString(locale) }), path: over.zone }] : []), ...unusedNotes(issues, t.view)], t.view);
            setIssuesDismissed(null);
            setLoads((x) => x + 1);
            setUnusedSaid(false);
            announce(fill(labels.toastLoaded, { name: t.name }));
        },
        [commit, labels, announce, limits, locale, history, remember, sourceId, encoded, leaveOut]
    );
    /** New: an empty report (the start screen), one step Undo takes back; the loaded view's name goes. */
    const newReport = () => {
        if (empty) {
            return;
        }
        commit(emptyView(), { step: "new" }, null);
        leaveOut([], null);
        setLoads((x) => x + 1);
        setUnusedSaid(false);
        announce(labels.newEmpty, { action: { label: labels.undo, run: () => undoLater.current() } });
    };
    // the browser store (templateStore="browser"): the user's own views in localStorage under the
    // storageKey; read after hydration, as the tips. Its views are read with the menus' module
    // (view-store.js), loaded right after the first render
    const viewStore = templateStore === "browser";
    const storeName = viewsName(storageKey);
    const subscribeViews = useCallback((callback) => (viewStore ? subscribeItem(storeName, callback) : () => {}), [viewStore, storeName]);
    const viewsText = useSyncExternalStore(subscribeViews, () => (viewStore ? readItem(storeName, localStore()) : null), () => null);
    const entries = useMemo(() => templateEntries(templates, viewStore && menus ? menus.storedViews(viewsText, sourceId) : [], Boolean(onDeleteTemplate)), [templates, viewStore, menus, viewsText, sourceId, onDeleteTemplate]);
    // what the Views menu needs to save, delete and publish (toolbar-panels.jsx: viewActions): the
    // host's callbacks, else the browser store; the notes come when they are kept
    const templateActions = {
        view,
        announce,
        locale,
        sourceId,
        viewsText,
        store: viewStore,
        keep: (text) => writeItem(storeName, localStore(), text),
        onSave: onSaveTemplate,
        onDelete: onDeleteTemplate,
        onPublish: canPublish ? onPublishTemplate : undefined,
        // a view leaves the report checked against the data, never as it was stored, and in the form a
        // save hands over (the view as shown: normalized, with the host's orders), so Publish and
        // Save send the same view
        normalized: (v) => JSON.parse(history.keyOf(v)),
        loaded: loadedView,
        empty,
        /**
         * A save kept: the view as it was when the save was clicked (`key`) is that saved view now. The
         * view shown takes its name only while it is still that view: a slow host may answer after
         * New, another view loaded or a change, and none of those may become the saved view.
         */
        onSaved: (/** @type {any} */ saved, /** @type {string} */ key) => {
            setSavedAt(changesRef.current);
            const tag = { ...saved, sourceId };
            remember(tag, key);
            const now = latest.current.history;
            if (now.viewKey === key) {
                now.setTag(tag);
            }
        },
        viewKey: history.viewKey
    };

    const onKeyDown = (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        // Escape ends Enlarge: only inside the report (never a host dialog's key), only once no menu,
        // drawer, filter or drill-down of the report is open (those close first, on their own Escape)
        if (e.key === "Escape" && big.enlarged && !e.defaultPrevented && !layerOpen(layer) && !drawerOpen && !drill && !filterTarget) {
            e.preventDefault();
            big.setEnlarged(false);
            return;
        }
        if (target.closest("input, textarea, select, [contenteditable]")) {
            return;
        }
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.altKey && (e.key === "z" || e.key === "Z")) {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        } else if (mod && (e.key === "y" || e.key === "Y")) {
            e.preventDefault();
            redo();
        }
    };

    const layerValue = useMemo(() => ({ layer, size }), [layer, size]);
    const renderOverlay = (src) => (
        <div className="pk-chip pk-overlay">
            <Icon name="grip" size={14} />
            <span className={`pk-type pk-type-${src.type ?? typeOf(src.field)}`}>
                <Icon name={/** @type {any} */ (TYPE_ICON[src.type ?? typeOf(src.field)] ?? "text")} size={13} />
            </span>
            <span className="pk-chip-text">{src.label ?? src.field}</span>
        </div>
    );

    const showTable = !error && !(empty && view.display === "table") && view.display !== "chart" && gridState.grid;

    // Expand all and Collapse all: offered when they change something, and they say what they did
    const outer = useMemo(() => (result ? outerPaths(result) : []), [result]);
    const folding = rowFolding(view, outer);
    // `texts`: the Options menu's labels, with the menus' texts that say what was done
    const expandAll = (texts) => {
        const count = view.collapsed.rows.length;
        commit(setCollapsed(view, "rows", null), { step: "collapse" });
        announce(plural(texts.groupsExpanded, count, { lang: labels.lang, locale }));
    };
    const collapseAll = (texts) => {
        if (!result) {
            return;
        }
        commit(setCollapsed(view, "rows", outer), { step: "collapse" });
        announce(plural(texts.groupsCollapsed, folding.open, { lang: labels.lang, locale }));
    };

    // the chart's series, once per result: drawn by the chart, read by its tips
    const series = useMemo(() => {
        if (!chartResult || view.display !== "chart" || view.values.length === 0) {
            return null;
        }
        try {
            return toSeries(chartResult, { labels: labels.core, maxCategories: MAX_CATEGORIES });
        } catch {
            return null;
        }
    }, [chartResult, view.display, view.values.length, labels]);

    // tips: the host allows some or all, the user dismisses them (remembered per storageKey)
    const allowedKey = JSON.stringify(allowedTips(tipsProp));
    const allowed = useMemo(() => JSON.parse(allowedKey), [allowedKey]);
    const dismissedKey = JSON.stringify(cleanDismissed(dismissedTips));
    // what this report holds (from the host, or dismissed here) and what is stored under storageKey;
    // the storage is read after hydration: on the server and in the first render nothing is stored,
    // so the markup of both is the same (useSyncExternalStore's server snapshot)
    const [own, setOwn] = useState(() => cleanDismissed(JSON.parse(dismissedKey)));
    const [lastDismissedKey, setLastDismissedKey] = useState(dismissedKey);
    if (dismissedKey !== lastDismissedKey) {
        // the host passed other dismissed tips: they replace the list (the host stores it itself)
        setLastDismissedKey(dismissedKey);
        setOwn(JSON.parse(dismissedKey));
    }
    const subscribe = useCallback((callback) => subscribeStored(storageKey, callback), [storageKey]);
    const storedRaw = useSyncExternalStore(subscribe, () => readStored(storageKey, localStore()), () => null);
    const dismissed = useMemo(() => cleanDismissed([...own, ...parseStored(storedRaw)]), [own, storedRaw]);
    const changeDismissed = useCallback(
        (next, id) => {
            setOwn(next);
            writeDismissed(storageKey, localStore(), next);
            onTipDismiss?.({ id, dismissed: next });
        },
        [storageKey, onTipDismiss]
    );
    const tipsOn = allowed !== "off" && !dismissed.includes(ALL_TIPS);
    // the i of the field descriptions and of the zones: the host forces them, else the user's switch
    const describedFields = [...info.values()].some((i) => i.description);
    // one switch of the user's ("Show explanations") for the three kinds; a host's prop forces its kind
    const fieldSwitch = helpSwitch(fieldInfoProp, dismissed);
    const zoneSwitch = helpSwitch(zoneInfoProp, dismissed);
    const settingSwitch = helpSwitch(settingInfoProp, dismissed);
    const explainUser = settingSwitch.user || zoneSwitch.user || (describedFields && fieldSwitch.user);
    // what the setting "i" read: shown or not
    // with the menus' texts once they are loaded (the explanations are among them); while the
    // language changes, the last ones until the new language's are here, never English in between
    const ready = menus ? menusNow(labels.lang) : null;
    const withTexts = ready ? ready.menuLabels(labels) : null;
    const [keptTexts, setKeptTexts] = useState(/** @type {any} */ (null));
    if (withTexts && withTexts !== keptTexts) {
        setKeptTexts(withTexts);
    }
    const helpLabels = withTexts ?? keptTexts ?? labels;
    const help = useMemo(
        () => ({
            explain: settingSwitch.on,
            labels: helpLabels
        }),
        [settingSwitch.on, helpLabels]
    );
    // the field list folded to a rail (wide and medium; a narrow report has the drawer): the user's
    // choice is stored with the tips, unless the host's fieldList decides, then it lasts this session
    const [fieldsSession, setFieldsSession] = useState(/** @type {boolean | null} */ (null));
    useEffect(() => {
        if (fieldList !== undefined && fieldList !== "open" && fieldList !== "collapsed") {
            warnOnce(`pivotkit: fieldList ${JSON.stringify(String(fieldList)).slice(0, 40)} is neither "open" nor "collapsed"; the user's choice decides`);
        }
    }, [fieldList]);
    const railed = size !== "narrow" && fieldsCollapsed(fieldsSession, fieldList, dismissed);
    const collapseFields = (next) => {
        if (fieldList === "open" || fieldList === "collapsed") {
            setFieldsSession(next);
        } else {
            changeDismissed(next ? [...dismissed, FIELDS_COLLAPSED] : dismissed.filter((d) => d !== FIELDS_COLLAPSED), null);
        }
    };
    const toggle = (id, on) => changeDismissed(on ? dismissed.filter((d) => d !== id) : [...dismissed, id], on ? null : id);
    const ctx = tipContext({ view, result, encoded, failed: Boolean(error), empty, typeOf, fields: labels.core.fields, series, tableShown: Boolean(showTable), drilled: hinted, changes, dragAt, canSave: Boolean(onSaveTemplate) || viewStore, savedAt, chartPlan: plan });
    const shownTips = activeTips(ctx, { allowed, dismissed }).map((t) => ({
        id: t.id,
        params: t.params,
        icon: t.entry.icon ?? "info",
        notice: t.entry.kind === "notice",
        action: t.entry.action ?? "",
        text: tipText(t.id, t.params, labels, locale),
        actionText: tipActionText(t.entry, t.params, labels)
    }));
    const runTip = (id, action) => {
        const params = shownTips.find((t) => t.id === id)?.params ?? {};
        if (action === "swap") {
            commit(swapAxes(view), { step: "swap" });
        } else if (action === "removeFilters") {
            commit(withoutFilters(view), { step: "filtersRemoved" });
        } else if (action === "groupDate") {
            commit(groupField(view, params.source, params.unit, { name: groupingName(nameOf(params.source), params.unit, labels) }).view, { step: "group", field: nameOf(params.source) });
        } else if (action === "bars") {
            commit(setChart(view, "bar"), { step: "chart", type: "bar" });
        } else if (action === "auto") {
            commit(setChart(view, "auto"), { step: "chart", type: "auto" });
        } else if (action === "saveTemplate") {
            setViewsRequest((n) => n + 1);
        }
    };

    // a link not opened: the same link given again (the fragment set once more) asks again
    const cancelLink = () => {
        appliedLink.current = null;
        setLinkCheck(null);
    };
    // the area above the result: what a loaded view (or the host's, when it came later) left out, the
    // lines that still apply to the view shown (unused-keep.js), then what computePivot() could not use
    const fromHost = hostNotes !== null && leftOut.after !== hostKey;
    const given = fromHost ? hostNotes : leftOut;
    const notes = useMemo(
        () => [...given.notes.filter((n) => stillApplies(n, given.loaded, view)), ...(result && !empty ? result.issues.slice(0, 20).map((issue) => ({ issue, raw: view })) : [])],
        [given, result, empty, view]
    );
    // the warning's identity: its view's lines, all of them (one that no longer applies does not open
    // or bring back a warning folded or dismissed), and the load
    const notesKey = useMemo(
        () => JSON.stringify([fromHost ? "host" : loads, ...given.notes.map((n) => ("issue" in n ? [n.issue.path, n.issue.message] : n.text)), ...(result && !empty ? result.issues.slice(0, 20).map((i) => [i.path, i.message]) : [])]),
        [fromHost, given, loads, result, empty]
    );
    // while enlarged, the fields in one line: what the result shows, without the zones
    const summaryParts = big.enlarged ? layoutSummary(zoneEntries(view, types, labels), labels) : [];
    const summaryText = summaryParts.length ? summaryParts.map((p) => `${p.title}: ${p.fields}`).join(" · ") : labels.layoutEmpty;

    return (
        <div
            ref={root}
            className={`pk-root${className ? ` ${className}` : ""}`}
            data-pk-theme={themeName}
            data-pk-size={size}
            data-pk-layout={layoutFolded ? "compact" : undefined}
            data-pk-enlarged={big.enlarged ? "" : undefined}
            data-pk-fields={railed ? "collapsed" : undefined}
            data-pk-fit={grow ? undefined : "contain"}
            lang={labels.lang}
            // a named region, not <main>: the host's page has its own main landmark around the report
            role="region"
            aria-label={label || labels.report}
            style={{ height }}
            // a click anywhere in the report focuses it, so the undo and redo shortcuts work
            tabIndex={-1}
            onKeyDown={onKeyDown}
            onDragEnter={allowImport ? fileDrag : undefined}
            onDragOver={allowImport ? fileDrag : undefined}
            onDragLeave={allowImport ? fileDrag : undefined}
            onDrop={allowImport ? fileDrag : undefined}
        >
            <LayerContext.Provider value={layerValue}>
              <FormNameContext.Provider value={formPrefix}>
              <HelpContext.Provider value={help}>
                <PivotDnd
                    labels={labels}
                    onDrop={onDrop}
                    renderOverlay={renderOverlay}
                    onDragStart={(src) => {
                        if (src.kind === "field" && size === "narrow") {
                            setDrawer(false);
                        }
                    }}
                >
                    <div className={`pk-layout${drawerOpen ? " pk-drawer-open" : ""}`}>
                        <div className="pk-panel-slot" ref={panelRef}>
                            <FieldPanel
                                fields={fields}
                                placed={placed}
                                labels={labels}
                                onAdd={(f, z) => {
                                    addTo(f, z);
                                    if (size === "narrow") {
                                        setDrawer(false);
                                    }
                                }}
                                onNote={(text) => announce(text)}
                                onFilter={filterNew}
                                nameOf={nameOf}
                                info={info}
                                showInfo={fieldSwitch.on}
                                drawer={size === "narrow"}
                                open={drawerOpen}
                                onClose={() => setDrawer(false)}
                                collapsed={railed}
                                onCollapse={collapseFields}
                                onSkip={() => /** @type {HTMLElement | null | undefined} */ (root.current?.querySelector(".pk-toolbar button:not([disabled])"))?.focus()}
                            />
                        </div>
                        {drawerOpen ? <div className="pk-scrim pk-drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" /> : null}
                        <div className="pk-main" ref={mainRef}>
                            <Toolbar
                                view={view}
                                chartPlan={plan}
                                labels={labels}
                                size={size}
                                canUndo={history.canUndo || dataSteps.past.length > 0}
                                canRedo={history.canRedo || dataSteps.future.length > 0}
                                canReset={history.canReset}
                                startEmpty={history.startEmpty}
                                canNew={!empty}
                                onUndo={undo}
                                onRedo={redo}
                                onReset={reset}
                                onNew={newReport}
                                loadedView={loadedView ? { name: loadedView.name, changed: unsaved } : null}
                                onDisplay={(d) => commit(setDisplay(view, d), { step: "display", display: d })}
                                onChart={(p) => commit(setChart(view, p), { step: "chart", type: p })}
                                onChartDisplay={(patch) => commit(setChartDisplay(view, patch), { step: "chartDisplay" })}
                                onTotal={(key, on) => commit(setTotal(view, key, on), { step: "totals" })}
                                onExpand={expandAll}
                                onCollapse={collapseAll}
                                folding={folding}
                                share={share}
                                templates={entries}
                                onLoadTemplate={loadTemplate}
                                templateActions={templateActions}
                                onExport={doExport}
                                prepareExport={prepareExporters}
                                chartReady={view.display === "chart" && chartReady}
                                empty={empty}
                                onShowFields={() => setDrawer(true)}
                                layoutFolded={layoutFolded}
                                onLayout={() => setFolded(!layoutFolded)}
                                zonesId={zonesId}
                                tipsControls={allowed !== "off"}
                                tipsOn={tipsOn}
                                onTipsOn={(on) => changeDismissed(on ? dismissed.filter((id) => id !== ALL_TIPS) : [...dismissed, ALL_TIPS], on ? null : ALL_TIPS)}
                                canResetTips={dismissed.some((id) => !keptOnReset(id))}
                                onResetTips={() => changeDismissed(dismissed.filter(keptOnReset), null)}
                                help={{
                                    explanations: explainUser ? { on: !dismissed.includes(NO_EXPLANATIONS), set: (on) => toggle(NO_EXPLANATIONS, on) } : null
                                }}
                                viewsRequest={viewsRequest}
                                data={allowImport ? { loaded: Boolean(imported), panel: (/** @type {() => void} */ close) => <MenuPanel name="DataMenu" loadingText={labels.loadingMenu} props={{ api, close, labels }} /> } : null}
                            />
                            <Zones
                                view={view}
                                types={types}
                                labels={labels}
                                commit={commit}
                                encoded={encoded}
                                locale={locale}
                                onSwap={() => commit(swapAxes(view), { step: "swap" })}
                                id={zonesId}
                                folded={layoutFolded}
                                onShow={() => setFolded(false)}
                                defaultsOf={defaultsOf}
                                infoOf={infoOf}
                                earlier={history.earlier}
                                explain={zoneSwitch.on}
                                showInfo={fieldSwitch.on}
                            />
                            {linkCheck ? (
                                <div className="pk-link-check" data-testid="link-check">
                                    <MenuPanel name="LoadCheck" props={{ check: linkCheck, labels, title: labels.linkCheckTitle, quiet: linkCheck.quiet, close: () => setLinkCheck(null), onCancel: cancelLink }} />
                                </div>
                            ) : null}
                            {/* what a loaded view left out and what the view asks for that this data has not: it stays
                                (the status note goes by itself) until it is dismissed */}
                            <Unused
                                notes={notes}
                                notesKey={notesKey}
                                dismissed={issuesDismissed === notesKey}
                                onDismiss={(next) => {
                                    setIssuesDismissed(notesKey);
                                    // what follows the warning, else the report
                                    next?.focus({ preventScroll: true });
                                    if (!next || activeIn(next) !== next) {
                                        root.current?.focus({ preventScroll: true });
                                    }
                                }}
                                labels={labels}
                                locale={locale}
                                narrow={size === "narrow"}
                                // the status note "View loaded; some parts did not fit this data" said it
                                quiet={unusedSaid && !fromHost}
                            />
                            <Tips
                                tips={shownTips}
                                labels={labels}
                                onDismiss={(id) => changeDismissed([...dismissed, id], id)}
                                onAction={runTip}
                                focusFallback={() => root.current?.focus({ preventScroll: true })}
                            />
                            {showTable && view.values.length ? (
                                <p id={hintId} className="pk-sr" data-testid="cell-hint">
                                    {labels.tips.cells}
                                </p>
                            ) : null}
                            <div className="pk-result-head">
                                {big.enlarged ? (
                                    <p className="pk-enlarged-fields" data-testid="enlarged-fields">
                                        {summaryText}
                                    </p>
                                ) : null}
                                <span className="pk-grow" />
                                <button type="button" className="pk-btn pk-pressable pk-small-btn" data-pk-on={big.enlarged ? "" : undefined} onClick={big.toggleEnlarged} data-testid="enlarge">
                                    <Icon name="enlarge" size={14} />
                                    {/* says what a click does: Enlarge, or Reduce while enlarged; a changing name is no
                                        toggle (no aria-pressed), the highlight shows the state (data-pk-on) */}
                                    <span className="pk-btn-text">{big.enlarged ? labels.reduce : labels.enlarge}</span>
                                </button>
                                {big.fullOk ? (
                                    <button type="button" className="pk-btn pk-pressable pk-small-btn" aria-pressed={big.full} onClick={big.toggleFull} data-testid="full-screen">
                                        <Icon name="fullScreen" size={14} />
                                        <span className="pk-btn-text">{labels.fullScreen}</span>
                                    </button>
                                ) : null}
                            </div>
                            <section className="pk-result" aria-label={view.display === "chart" ? labels.chart : labels.table}>
                                {loading || opening ? (
                                    <Skeleton text={labels.loadingReport} />
                                ) : error ? (
                                    <div className="pk-message pk-error" role="alert">
                                        <Icon name="info" />
                                        <p>{errorText(error, labels, locale)}</p>
                                    </div>
                                ) : empty && view.display === "table" ? (
                                    <EmptyState labels={labels} templates={entries} onTemplate={loadTemplate} onLoad={allowImport ? () => requestImport().then((m) => m.pickFile(fileInput.current), () => undefined) : undefined} noData={allowImport && fields.length === 0} />
                                ) : view.display === "chart" && chartResult ? (
                                    <PivotChart
                                        result={chartResult}
                                        plan={plan}
                                        series={series}
                                        labels={labels}
                                        locale={locale}
                                        themeName={themeName}
                                        root={root}
                                        valueNames={view.values.map((v) => valueLabel(v, labels))}
                                        chartOptions={stableChartOptions}
                                        onInstance={(c) => {
                                            chartRef.current = c;
                                            setChartReady(Boolean(c));
                                        }}
                                        // a chart with rows and columns swapped names the view's paths the other way round
                                        onPoint={(p) => openCell({ rowPath: plan.swap ? p.colPath : p.rowPath, colPath: plan.swap ? p.rowPath : p.colPath, value: p.value, valueIndex: p.valueIndex, text: String(p.value ?? "") })}
                                    />
                                ) : gridState.grid ? (
                                    <PivotTable grid={gridState.grid} view={view} labels={labels} version={history.viewKey} hintId={view.values.length ? hintId : undefined} onRowLabel={setRowLabel} infoOf={infoOf} showInfo={fieldSwitch.on} typeOf={typeOf} hostOrdered={hostOrdered} onSort={sortFromHeader} onToggle={(axis, path) => commit(toggleCollapsed(view, axis, path), { step: "collapse" })} onCell={(cell) => openCell(cell)} />
                                ) : null}
                            </section>
                            <div className="pk-status">
                                <span data-testid="row-count">{result ? plural(labels.rowsCount, result.rows.length, { lang: labels.lang, locale }) : ""}</span>
                                {importMod ? <importMod.SourceLine api={api} /> : null}
                                {rowLabel && showTable ? (
                                    <span className="pk-row-label" data-testid="row-label">
                                        {fill(labels.rowLabel, { label: rowLabel })}
                                    </span>
                                ) : null}
                            </div>
                            {/* the status notes at the bottom edge of what is on screen of the report */}
                            <div className="pk-toast-dock">
                                <Toasts toasts={toasts} dismiss={dismiss} pause={pause} closeLabel={labels.close} />
                            </div>
                        </div>
                        {/* inside the layout: clipped to the report's box with it (its slide-in too) */}
                        {drill ? <MenuPanel name="DrillPanel" props={{ drill, onClose: () => setDrill(null), labels, locale, exportContext: { encoded, onExport, announce, root } }} /> : null}
                    </div>
                    {/* the filter and the drill-down load with the menus (lazy-menus.jsx) */}
                    {filterTarget ? <MenuPanel name="FilterPopover" props={{ target: filterTarget, onClose: closeFilter, view, encoded, locale, labels, commit }} /> : null}
                </PivotDnd>
                {/* loading data: the file input, the drop overlay, the preview (import-host.jsx) */}
                {allowImport && importMod ? <importMod.ImportLayer api={api} input={fileInput} /> : null}
                <div className="pk-layer" ref={setLayer}>
                    {/* a fixed probe at 0, 0: where fixed popovers start (popover.jsx) */}
                    <span className="pk-origin" aria-hidden="true" />
                </div>
              </HelpContext.Provider>
              </FormNameContext.Provider>
            </LayerContext.Provider>
        </div>
    );
}
