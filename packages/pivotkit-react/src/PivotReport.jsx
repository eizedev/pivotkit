/*
 * <PivotReport>: the report builder. It owns the view and its history; the field list, the zones,
 * the toolbar, the table and the chart are views of that state and change it through commit(). The
 * pivot is computed once per view (memoized by the view's JSON); the grid only for the table.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computePivot, createHistory, emptyView, encode, findNode, normalize, toGrid, viewFields } from "pivotkit-core";
import { PivotChart } from "./chart.jsx";
import { PivotDnd } from "./dnd.jsx";
import { DRILL_LIMIT, drillRows } from "./drill.js";
import { DrillPanel } from "./drill-panel.jsx";
import { FieldPanel } from "./fields.jsx";
import { FilterPopover } from "./filter.jsx";
import { Icon, TYPE_ICON } from "./icons.jsx";
import { fill, resolveLabels } from "./labels.js";
import { LayerContext } from "./popover.jsx";
import { PivotTable } from "./table.jsx";
import { resolveTheme } from "./theme.js";
import { Toasts, useToasts } from "./toasts.jsx";
import { Toolbar } from "./toolbar.jsx";
import { addField, filterZoneFields, isEmptyView, moveField, removeAt, setChart, setCollapsed, setDisplay, setTotal, sourceOf, toggleCollapsed } from "./view-ops.js";
import { Zones } from "./zones.jsx";

/** Width classes of the report (its own width, not the window's). */
export function sizeOf(width) {
    return width < 640 ? "narrow" : width < 1024 ? "medium" : "wide";
}

/** Light or dark from the theme prop, <html data-theme> and the system setting; follows changes. */
function useResolvedTheme(wanted) {
    const read = () => {
        if (typeof document === "undefined") {
            return resolveTheme(wanted, null, false);
        }
        const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : false;
        return resolveTheme(wanted, document.documentElement.getAttribute("data-theme"), media);
    };
    const [theme, setTheme] = useState(read);
    useEffect(() => {
        setTheme(read());
        if (wanted === "light" || wanted === "dark" || typeof document === "undefined") {
            return undefined;
        }
        const update = () => setTheme(read());
        const mo = typeof MutationObserver === "function" ? new MutationObserver(update) : null;
        mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
        mq?.addEventListener("change", update);
        return () => {
            mo?.disconnect();
            mq?.removeEventListener("change", update);
        };
        // read() depends on `wanted` only
    }, [wanted]);
    return theme;
}

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

function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Region: North · Product: A" for a cell's paths. */
function pathTitle(result, rowPath, colPath, labels) {
    const parts = [];
    const add = (axis, fields, path) => {
        const node = findNode(result, axis, path);
        for (let n = node; n && n.parent; n = n.parent) {
            parts.unshift(`${fields[n.depth - 1]}: ${result.label(axis, n, labels.core)}`);
        }
    };
    add("cols", result.colFields, colPath);
    add("rows", result.rowFields, rowPath);
    return parts.length ? parts.join(" · ") : labels.core.grandTotal;
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

function EmptyState({ labels, templates, onTemplate }) {
    return (
        <div className="pk-empty" data-testid="empty-state">
            <div className="pk-empty-art" aria-hidden="true">
                <span className="pk-empty-chip pk-c1" />
                <span className="pk-empty-chip pk-c2" />
                <span className="pk-empty-chip pk-c3" />
            </div>
            <h2>{labels.emptyTitle}</h2>
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
            {templates.length ? (
                <div className="pk-empty-actions">
                    {templates.slice(0, 3).map((t) => (
                        <button key={t.name} type="button" className="pk-btn" onClick={() => onTemplate(t)}>
                            <Icon name="sparkle" />
                            <span className="pk-btn-text">{fill(labels.tryTemplate, { name: t.name })}</span>
                        </button>
                    ))}
                </div>
            ) : null}
            <p className="pk-hint">{labels.emptyHint}</p>
        </div>
    );
}

/**
 * The pivot report builder.
 * @param {import("./index.js").PivotReportProps} props
 */
export function PivotReport(props) {
    const {
        data,
        encoded: encodedProp,
        view: startView,
        onViewChange,
        templates = [],
        onSaveTemplate,
        onDeleteTemplate,
        onCellClick,
        drillDown = true,
        drillDownLimit = DRILL_LIMIT,
        locale = "en-US",
        timeZone,
        labels: customLabels,
        theme = "auto",
        height = 640,
        limits,
        className,
        fileName = "pivot"
    } = props;

    const labelsKey = JSON.stringify(customLabels ?? null);
    const labels = useMemo(() => resolveLabels(locale, customLabels), [locale, labelsKey]);
    const limitsKey = JSON.stringify(limits ?? null);
    const themeName = useResolvedTheme(theme);
    const root = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [layer, setLayer] = useState(/** @type {HTMLElement | null} */ (null));
    const [size, setSize] = useState("wide");
    const [drawer, setDrawer] = useState(false);
    const [filterTarget, setFilterTarget] = useState(/** @type {{ field: string, anchor: HTMLElement } | null} */ (null));
    const [drill, setDrill] = useState(null);
    const chartRef = useRef(null);
    const [chartReady, setChartReady] = useState(false);
    const { toasts, push, dismiss } = useToasts();

    // the data, encoded once per data set
    const source = useMemo(() => {
        try {
            const enc = encodedProp ?? measured("encode", () => encode(/** @type {any[]} */ (Array.isArray(data) ? data : []), { timeZone: timeZone ?? "UTC", limits }));
            return { encoded: enc, error: null };
        } catch (error) {
            return { encoded: encode([]), error };
        }
        // limits by value
    }, [encodedProp, data, timeZone, limitsKey]);
    const encoded = source.encoded;

    // the view and its history; a new start view (by value) or new data start a new history
    const startKey = JSON.stringify(startView ?? null);
    const history = useMemo(() => createHistory(normalize(startView ?? emptyView(), encoded, { limits }).view), [startKey, encoded]);
    const [tick, setTick] = useState(0);
    const view = useMemo(() => history.current, [history, tick]);
    const viewKey = JSON.stringify(view);

    const announce = useCallback((text, extra = undefined) => push({ text, ...extra }), [push]);

    const commit = useCallback(
        (next, note = {}) => {
            const normalized = normalize(next, encoded, { limits }).view;
            if (!history.push(normalized)) {
                return;
            }
            setTick((t) => t + 1);
            onViewChange?.(normalized);
            if (note.removed) {
                announce(fill(labels.toastRemoved, { field: note.field ?? "" }).trim(), {
                    action: {
                        label: labels.undo,
                        run: () => {
                            const back = history.undo();
                            setTick((t) => t + 1);
                            onViewChange?.(back);
                        }
                    }
                });
            } else if (note.added) {
                announce(fill(labels.toastAdded, { field: note.field, zone: labels.zones[note.added] }));
            } else if (note.moved) {
                announce(fill(labels.toastMoved, { field: note.field ?? "", zone: labels.zones[note.moved] }));
            }
        },
        [history, encoded, onViewChange, labels, announce, limitsKey]
    );

    const undo = useCallback(() => {
        if (history.canUndo) {
            // not onViewChange?.(history.undo()): an optional call skips its arguments
            const next = history.undo();
            onViewChange?.(next);
            setTick((t) => t + 1);
            announce(labels.toastUndone);
        }
    }, [history, onViewChange, labels, announce]);
    const redo = useCallback(() => {
        if (history.canRedo) {
            // not onViewChange?.(history.redo()): an optional call skips its arguments
            const next = history.redo();
            onViewChange?.(next);
            setTick((t) => t + 1);
            announce(labels.toastRedone);
        }
    }, [history, onViewChange, labels, announce]);
    const reset = useCallback(() => {
        const next = history.reset();
        setTick((t) => t + 1);
        onViewChange?.(next);
        announce(labels.toastReset);
    }, [history, onViewChange, labels, announce]);

    // the pivot, once per view
    const computed = useMemo(() => {
        try {
            return { result: measured("computePivot", () => computePivot(encoded, view, { locale, limits })), error: null };
        } catch (error) {
            return { result: null, error };
        }
    }, [encoded, viewKey, locale, limitsKey]);
    const result = computed.result;
    const gridState = useMemo(() => {
        if (!result || view.display !== "table" || isEmptyView(view)) {
            return { grid: null, error: null };
        }
        try {
            return { grid: measured("toGrid", () => toGrid(result, { locale, labels: labels.core, limits })), error: null };
        } catch (error) {
            return { grid: null, error };
        }
    }, [result, view, locale, labels, limitsKey]);
    const error = source.error ?? computed.error ?? gridState.error;

    // fields: the data's columns for the list, with derived fields for the type of a chip
    const fields = encoded.schema.fields;
    const types = useMemo(() => new Map(viewFields(view, encoded).map((f) => [f.name.toLowerCase(), f.type])), [view, encoded]);
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

    // size class from the report's own width
    useEffect(() => {
        const el = root.current;
        if (!el || typeof ResizeObserver !== "function") {
            return undefined;
        }
        const ro = new ResizeObserver(([entry]) => setSize(sizeOf(entry.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    useEffect(() => {
        if (size !== "narrow") {
            setDrawer(false);
        }
    }, [size]);
    const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    useEffect(() => {
        // the closed drawer is out of the tab order and hidden from assistive technology
        if (panelRef.current) {
            panelRef.current.inert = size === "narrow" && !drawer;
        }
    }, [size, drawer]);

    const typeOf = (field) => types.get(sourceOf(view, field ?? "").toLowerCase()) ?? "string";

    const addTo = useCallback(
        (field, zone) => {
            commit(addField(view, field, zone, { type: typeOf(field) }), { added: zone, field });
        },
        // typeOf reads types and view
        [view, types, commit]
    );

    const onDrop = useCallback(
        (src, target) => {
            if (target.zone === "panel") {
                if (src.kind !== "field") {
                    commit(removeAt(view, src.zone, src.index), { removed: true, field: src.label ?? src.field });
                }
                return;
            }
            if (src.kind === "field") {
                commit(addField(view, src.field, /** @type {any} */ (target.zone), { index: target.index, type: typeOf(src.field) }), { added: target.zone, field: src.field });
            } else {
                const zone = /** @type {any} */ (target.zone);
                const index = target.index;
                commit(moveField(view, src.zone, src.index, zone, index, { type: typeOf(src.field) }), src.zone !== zone ? { moved: zone, field: src.label ?? src.field } : {});
            }
        },
        [view, types, commit]
    );

    const openCell = useCallback(
        /** @param {any} cell */
        ({ rowPath = [], colPath = [], value, valueIndex, text }) => {
            if (!result) {
                return;
            }
            const { count, rows } = drillRows(result, { rowPath, colPath, data: encodedProp ? null : data, limit: drillDownLimit });
            onCellClick?.({ row: rowPath, col: colPath, value, valueIndex, text, count, rows });
            if (drillDown) {
                setDrill({ title: pathTitle(result, rowPath, colPath, labels), count, rows, columns: encoded.columns.map((c) => c.name) });
            }
        },
        [result, encodedProp, data, drillDownLimit, onCellClick, drillDown, labels, encoded]
    );

    const doExport = useCallback(
        async (kind) => {
            const file = `${fileName}.${kind}`;
            try {
                if (kind === "png") {
                    const surface = root.current ? getComputedStyle(root.current).getPropertyValue("--pk-surface").trim() : "#fff";
                    const url = chartRef.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: surface || "#fff" });
                    if (!url) {
                        return;
                    }
                    saveBlob(await (await fetch(url)).blob(), file);
                } else {
                    if (!result) {
                        return;
                    }
                    const { toXlsx, toCsvBytes } = await import("pivotkit-core/export");
                    const grid = toGrid(result, { locale, labels: labels.core, limits });
                    const bytes = kind === "xlsx" ? toXlsx(grid, { sheetName: fileName }) : toCsvBytes(grid, { bom: true });
                    saveBlob(new Blob([/** @type {BlobPart} */ (bytes)], { type: kind === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8" }), file);
                }
                announce(fill(labels.toastExported, { file }));
            } catch (e) {
                announce(fill(labels.toastExportFailed, { message: e && e.message ? e.message : String(e) }), { tone: "error" });
            }
        },
        [fileName, result, locale, labels, limitsKey, announce]
    );

    const loadTemplate = useCallback(
        (t) => {
            const { view: v } = normalize(t.view, encoded, { limits });
            commit(v);
            announce(fill(labels.toastLoaded, { name: t.name }));
        },
        [encoded, commit, labels, announce, limitsKey]
    );

    const onKeyDown = (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
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

    const tooLarge = error && error.code === "LIMIT_EXCEEDED";
    const empty = isEmptyView(view);
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

    return (
        <div
            ref={root}
            className={`pk-root${className ? ` ${className}` : ""}`}
            data-pk-theme={themeName}
            data-pk-size={size}
            style={{ height }}
            // a click anywhere in the report focuses it, so the undo and redo shortcuts work
            tabIndex={-1}
            onKeyDown={onKeyDown}
        >
            <LayerContext.Provider value={layerValue}>
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
                    <div className={`pk-layout${drawer ? " pk-drawer-open" : ""}`}>
                        <div className="pk-panel-slot" ref={panelRef}>
                            <FieldPanel fields={fields} placed={placed} labels={labels} onAdd={(f, z) => { addTo(f, z); if (size === "narrow") setDrawer(false); }} drawer={size === "narrow"} onClose={() => setDrawer(false)} />
                        </div>
                        {size === "narrow" && drawer ? <div className="pk-scrim pk-drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" /> : null}
                        <main className="pk-main">
                            <Toolbar
                                view={view}
                                labels={labels}
                                size={size}
                                canUndo={history.canUndo}
                                canRedo={history.canRedo}
                                canReset={history.canUndo || history.canRedo}
                                onUndo={undo}
                                onRedo={redo}
                                onReset={reset}
                                onDisplay={(d) => commit(setDisplay(view, d))}
                                onChart={(p) => commit(setChart(view, p))}
                                onTotal={(key, on) => commit(setTotal(view, key, on))}
                                onExpand={() => commit(setCollapsed(view, "rows", null))}
                                onCollapse={() => result && commit(setCollapsed(view, "rows", outerPaths(result)))}
                                templates={templates}
                                onLoadTemplate={loadTemplate}
                                onSaveTemplate={onSaveTemplate ? (name) => { onSaveTemplate(name, view); announce(fill(labels.toastSaved, { name })); } : null}
                                onDeleteTemplate={onDeleteTemplate ? (name) => { onDeleteTemplate(name); announce(fill(labels.toastDeleted, { name })); } : null}
                                onExport={doExport}
                                chartReady={view.display === "chart" && chartReady}
                                onShowFields={() => setDrawer(true)}
                            />
                            <Zones view={view} types={types} labels={labels} commit={commit} openFilter={(field, anchor) => setFilterTarget({ field, anchor })} />
                            {result && result.issues.length > 0 && !empty ? (
                                <details className="pk-issues">
                                    <summary>
                                        <Icon name="info" /> {labels.issues} {result.issues.length}
                                    </summary>
                                    <ul>
                                        {result.issues.slice(0, 20).map((i, k) => (
                                            <li key={k}>
                                                <code>{i.path}</code> {i.message}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            ) : null}
                            <section className="pk-result" aria-label={view.display === "chart" ? labels.chart : labels.table}>
                                {error ? (
                                    <div className="pk-message pk-error" role="alert">
                                        <Icon name="info" />
                                        <p>{tooLarge ? fill(labels.tooLarge, { value: Number(error.details.value).toLocaleString(locale), max: Number(error.details.max).toLocaleString(locale) }) : fill(labels.error, { message: error.message })}</p>
                                    </div>
                                ) : empty && view.display === "table" ? (
                                    <EmptyState labels={labels} templates={templates} onTemplate={loadTemplate} />
                                ) : view.display === "chart" && result ? (
                                    <PivotChart
                                        result={result}
                                        labels={labels}
                                        locale={locale}
                                        themeName={themeName}
                                        root={root}
                                        onInstance={(c) => {
                                            chartRef.current = c;
                                            setChartReady(Boolean(c));
                                        }}
                                        onPoint={(p) => openCell({ rowPath: p.rowPath, colPath: p.colPath, value: p.value, valueIndex: p.valueIndex, text: String(p.value ?? "") })}
                                    />
                                ) : gridState.grid ? (
                                    <PivotTable grid={gridState.grid} view={view} labels={labels} version={tick} onToggle={(axis, path) => commit(toggleCollapsed(view, axis, path))} onCell={(cell) => openCell(cell)} />
                                ) : null}
                            </section>
                            <div className="pk-status">
                                <span data-testid="row-count">{result ? fill(labels.rowsCount, { count: result.rows.length.toLocaleString(locale) }) : ""}</span>
                                {!empty && view.display === "table" && view.values.length ? <span className="pk-muted">{labels.cellHint}</span> : null}
                            </div>
                        </main>
                    </div>
                    <FilterPopover target={filterTarget} onClose={() => setFilterTarget(null)} view={view} encoded={encoded} locale={locale} labels={labels} commit={commit} />
                </PivotDnd>
                <DrillPanel drill={drill} onClose={() => setDrill(null)} labels={labels} locale={locale} timeZone={encoded.timeZone} />
                <Toasts toasts={toasts} dismiss={dismiss} closeLabel={labels.close} />
                <div className="pk-layer" ref={setLayer} />
            </LayerContext.Provider>
        </div>
    );
}

