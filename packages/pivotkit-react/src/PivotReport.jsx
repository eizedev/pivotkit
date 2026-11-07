/*
 * <PivotReport>: the report builder. The view and its undo history live in useViewHistory (controlled
 * by the host or not); the field list, the zones, the toolbar, the table and the chart are views of
 * that state and change it through commit(), which they get as a prop. The pivot is computed once per
 * view; the grid only for the table.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PivotkitError, computePivot, encode, findNode, suggestDateUnit, toGrid, viewFields } from "pivotkit-core";
import { PivotChart } from "./chart.jsx";
import { groupingName, valueLabel } from "./names.js";
import { PivotDnd } from "./dnd.jsx";
import { DRILL_LIMIT, drillRows, drillTable } from "./drill.js";
import { DrillPanel } from "./drill-panel.jsx";
import { FieldPanel } from "./fields.jsx";
import { FilterPopover } from "./filter.jsx";
import { Icon, TYPE_ICON } from "./icons.jsx";
import { fill, hostFailure, messageOf, plural, resolveLabels } from "./labels.js";
import { useIsoLayoutEffect } from "./iso.js";
import { LayerContext } from "./popover.jsx";
import { PivotTable } from "./table.jsx";
import { Toasts, useToasts } from "./toasts.jsx";
import { Toolbar } from "./toolbar.jsx";
import { useExport } from "./use-export.js";
import { useResolvedTheme } from "./use-theme.js";
import { useViewHistory } from "./use-view-history.js";
import {
    addField, filterZoneFields, filtersOf, isEmptyView, moveField, removeAt, setChart, setCollapsed, setDisplay, setTotal, sourceOf, swapAxes, toggleCollapsed
} from "./view-ops.js";
import { Zones } from "./zones.jsx";

/** Width classes of the report (its own width, not the window's). */
export function sizeOf(width) {
    return width < 640 ? "narrow" : width < 1024 ? "medium" : "wide";
}

/** Below this height (px, border box) the report starts with its zones folded into one line, the compact layout. */
export const COMPACT_HEIGHT = 540;

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

/** The host's settings for a field (fieldDefaults), matched case-insensitively like column names. */
function defaultsFor(fieldDefaults, field) {
    if (!fieldDefaults || typeof fieldDefaults !== "object") {
        return undefined;
    }
    const key = Object.keys(fieldDefaults).find((k) => k.toLowerCase() === String(field).toLowerCase());
    return key === undefined ? undefined : fieldDefaults[key];
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
                    {templates.slice(0, 3).map((t, i) => (
                        <button key={`${i}:${t.name}`} type="button" className="pk-btn" onClick={() => onTemplate(t)}>
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
        dataKey,
        encoded: encodedProp,
        view: viewProp,
        defaultView,
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
        limits: limitsProp,
        className,
        fileName = "pivot",
        fieldDefaults,
        onExport,
        label
    } = props;

    // props a host may rebuild on every render, compared by value
    const labelsKey = JSON.stringify(customLabels ?? null);
    const labels = useMemo(() => resolveLabels(locale, JSON.parse(labelsKey)), [locale, labelsKey]);
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
    const [drawer, setDrawer] = useState(false);
    const [filterTarget, setFilterTarget] = useState(/** @type {{ field: string, anchor: HTMLElement } | null} */ (null));
    const [drill, setDrill] = useState(/** @type {{ title: string, count: number, columns: Array<{ name: string, numeric: boolean }>, rows: string[][] } | null} */ (null));
    const [hinted, setHinted] = useState(false);
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
            const enc = encodedProp ?? measured("encode", () => encode(/** @type {any[]} */ (Array.isArray(data) ? data : []), { timeZone: timeZone ?? "UTC", limits }));
            return { encoded: enc, error: null };
        } catch (error) {
            return { encoded: encode([]), error };
        }
        // data is read through dataIdentity: with a dataKey a new array with the same key is the same data
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [encodedProp, dataIdentity, timeZone, limits]);
    const encoded = source.encoded;

    const history = useViewHistory({ encoded, view: viewProp, defaultView, onViewChange, limits, outsideNote: labels.steps.outside });
    const view = history.view;

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
    const undo = useCallback(() => {
        const note = history.undo();
        if (note !== null) {
            announce(fill(labels.toastUndone, { step: note }));
        }
    }, [history, labels, announce]);
    const redo = useCallback(() => {
        const note = history.redo();
        if (note !== null) {
            announce(fill(labels.toastRedone, { step: note }));
        }
    }, [history, labels, announce]);
    // the toast's Undo runs later, on the history of that moment
    const undoLater = useRef(undo);
    useEffect(() => {
        undoLater.current = undo;
    });
    const reset = useCallback(() => {
        history.reset(labels.steps.reset);
        announce(labels.toastReset);
    }, [history, labels, announce]);

    /**
     * Every change of the view: `note.step` names it for "Undone: ...". Adding needs no note on
     * screen (the chip appears); a removal offers Undo.
     */
    const commit = useCallback(
        /** @param {object} next @param {{ step: string, removed?: boolean, field?: string, zone?: string, name?: string, display?: string, type?: string }} [note] */
        (next, note = { step: "change" }) => {
            if (!history.commit(next, stepText(note)) || !note.removed) {
                return;
            }
            announce(fill(labels.toastRemoved, { field: note.field ?? "" }).trim(), { action: { label: labels.undo, run: () => undoLater.current() } });
        },
        [history, stepText, labels, announce]
    );

    // the pivot, once per view
    const computed = useMemo(() => {
        try {
            return { result: measured("computePivot", () => computePivot(encoded, view, { locale, limits })), error: null };
        } catch (error) {
            return { result: null, error };
        }
    }, [encoded, view, locale, limits]);
    const result = computed.result;
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
    const error = source.error ?? computed.error ?? gridState.error;

    // fields: the data's columns for the list; the type of a chip is its source field's
    const fields = encoded.schema.fields;
    const types = useMemo(() => new Map(viewFields(view, encoded).map((f) => [f.name.toLowerCase(), f.type])), [view, encoded]);
    const typeOf = useCallback((field) => types.get(sourceOf(view, field ?? "").toLowerCase()) ?? "string", [types, view]);
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

    // size class from the report's own width; the height class from its border box, measured before
    // the first paint, so a low report never shows its zones open for a frame
    useIsoLayoutEffect(() => {
        const el = root.current;
        if (!el) {
            return undefined;
        }
        const first = el.getBoundingClientRect().height < COMPACT_HEIGHT;
        setMeasuredShort(first);
        setShort(first);
        if (typeof ResizeObserver !== "function") {
            return undefined;
        }
        const ro = new ResizeObserver(([entry]) => {
            setSize(sizeOf(entry.contentRect.width));
            const height = entry.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
            setMeasuredShort(height < COMPACT_HEIGHT);
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

    /** How a field from the field list is placed: a date grouped by its span, a value with the host's defaults. */
    const placeOptions = useCallback(
        (field, zone, index = undefined) => {
            const column = encoded.column(field);
            const unit = zone !== "values" && column && column.type === "date" && !column.derived ? suggestDateUnit(encoded, field) : null;
            return { index, type: typeOf(field), defaults: defaultsFor(fieldDefaults, field), dateUnit: unit, groupName: unit ? groupingName(column.name, unit, labels) : undefined };
        },
        [encoded, typeOf, fieldDefaults, labels]
    );
    const addTo = useCallback(
        (field, zone, index = undefined) => {
            const options = placeOptions(field, zone, index);
            commit(addField(view, field, zone, options), { step: "added", field: options.groupName ?? field, zone });
        },
        [view, placeOptions, commit]
    );

    const onDrop = useCallback(
        (src, target) => {
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
                commit(moveField(view, src.zone, src.index, zone, target.index, { type: typeOf(src.field) }), note);
            }
        },
        [view, typeOf, commit, addTo]
    );

    const openCell = useCallback(
        /** @param {any} cell */
        ({ rowPath = [], colPath = [], value, valueIndex, text }) => {
            if (!result) {
                return;
            }
            setHinted(true);
            const { count, rows, indices } = drillRows(result, { rowPath, colPath, data: encodedProp ? null : data, limit: drillDownLimit });
            onCellClick?.({ row: rowPath, col: colPath, value, valueIndex, text, count, rows });
            if (drillDown) {
                // the values as the table shows them; a host's format for a field (fieldDefaults) applies
                const formatOf = (name) => {
                    const d = defaultsFor(fieldDefaults, name);
                    return d ? (d.drillFormat ?? d.format) : undefined;
                };
                setDrill({ title: pathTitle(result, rowPath, colPath, labels), count, ...drillTable(encoded, indices, { locale: result.locale, labels: labels.core, formatOf }) });
            }
        },
        [result, encodedProp, data, drillDownLimit, onCellClick, drillDown, labels, encoded, fieldDefaults]
    );

    const doExport = useExport({ fileName, result, locale, labels, limits, root, chartRef, announce, onExport });

    const loadTemplate = useCallback(
        (t) => {
            commit(t.view, { step: "template", name: t.name });
            announce(fill(labels.toastLoaded, { name: t.name }));
        },
        [commit, labels, announce]
    );
    // the host's callbacks may return a promise: the note comes when it is kept
    const saveTemplate = onSaveTemplate
        ? async (name) => {
              try {
                  await onSaveTemplate(name, view);
                  announce(fill(labels.toastSaved, { name }));
              } catch (e) {
                  announce(hostFailure(labels.toastSaveFailed, labels.toastSaveRejected, e), { tone: "error" });
              }
          }
        : null;
    const deleteTemplate = onDeleteTemplate
        ? async (name) => {
              try {
                  await onDeleteTemplate(name);
                  announce(fill(labels.toastDeleted, { name }));
                  return true;
              } catch (e) {
                  announce(hostFailure(labels.toastDeleteFailed, labels.toastDeleteRejected, e), { tone: "error" });
                  return false;
              }
          }
        : null;

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

    const tooLarge = error instanceof PivotkitError && error.code === "LIMIT_EXCEEDED" ? /** @type {{ value: number, max: number }} */ (error.details) : null;
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

    // notes above the result: top N changes what totals mean; a layout without values shows no numbers
    const notes = [];
    if (!empty && !error) {
        for (const field of [...view.rows, ...view.cols]) {
            const top = filtersOf(view, field, ["top"])[0];
            if (top) {
                notes.push({ id: `top:${field}`, text: fill(top.bottom ? labels.bottomNote : labels.topNote, { field, count: top.count.toLocaleString(locale) }) });
            }
        }
        if (view.values.length === 0 && view.display === "table") {
            notes.push({ id: "values", text: labels.noValuesHint });
        }
    }
    const isDate = (f) => typeOf(f) === "date";
    const showTable = !error && !(empty && view.display === "table") && view.display !== "chart" && gridState.grid;

    return (
        <div
            ref={root}
            className={`pk-root${className ? ` ${className}` : ""}`}
            data-pk-theme={themeName}
            data-pk-size={size}
            data-pk-layout={layoutFolded ? "compact" : undefined}
            lang={labels.lang}
            // a named region, not <main>: the host's page has its own main landmark around the report
            role="region"
            aria-label={label || labels.report}
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
                                drawer={size === "narrow"}
                                open={drawerOpen}
                                onClose={() => setDrawer(false)}
                            />
                        </div>
                        {drawerOpen ? <div className="pk-scrim pk-drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" /> : null}
                        <div className="pk-main">
                            <Toolbar
                                view={view}
                                labels={labels}
                                size={size}
                                canUndo={history.canUndo}
                                canRedo={history.canRedo}
                                canReset={history.canReset}
                                onUndo={undo}
                                onRedo={redo}
                                onReset={reset}
                                onDisplay={(d) => commit(setDisplay(view, d), { step: "display", display: d })}
                                onChart={(p) => commit(setChart(view, p), { step: "chart", type: p })}
                                onTotal={(key, on) => commit(setTotal(view, key, on), { step: "totals" })}
                                onExpand={() => commit(setCollapsed(view, "rows", null), { step: "collapse" })}
                                onCollapse={() => result && commit(setCollapsed(view, "rows", outerPaths(result)), { step: "collapse" })}
                                templates={templates}
                                onLoadTemplate={loadTemplate}
                                onSaveTemplate={saveTemplate}
                                onDeleteTemplate={deleteTemplate}
                                onExport={doExport}
                                chartReady={view.display === "chart" && chartReady}
                                onShowFields={() => setDrawer(true)}
                                layoutFolded={layoutFolded}
                                onLayout={() => setFolded(!layoutFolded)}
                                zonesId={zonesId}
                            />
                            <Zones
                                view={view}
                                types={types}
                                labels={labels}
                                commit={commit}
                                openFilter={(field, anchor) => setFilterTarget({ field, anchor })}
                                encoded={encoded}
                                locale={locale}
                                onSwap={() => commit(swapAxes(view), { step: "swap" })}
                                id={zonesId}
                                folded={layoutFolded}
                                onShow={() => setFolded(false)}
                            />
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
                            {notes.map((n) => (
                                <p key={n.id} className="pk-note" data-testid={`note-${n.id.split(":")[0]}`}>
                                    <Icon name={n.id === "values" ? "sigma" : "top"} size={16} />
                                    <span>{n.text}</span>
                                </p>
                            ))}
                            {showTable && view.values.length ? (
                                <p id={hintId} className={hinted ? "pk-sr" : "pk-note pk-cell-hint"} data-testid="cell-hint">
                                    <Icon name="info" size={16} />
                                    <span>{labels.cellHint}</span>
                                </p>
                            ) : null}
                            <section className="pk-result" aria-label={view.display === "chart" ? labels.chart : labels.table}>
                                {error ? (
                                    <div className="pk-message pk-error" role="alert">
                                        <Icon name="info" />
                                        <p>{tooLarge ? fill(labels.tooLarge, { value: Number(tooLarge.value).toLocaleString(locale), max: Number(tooLarge.max).toLocaleString(locale) }) : fill(labels.error, { message: messageOf(error) })}</p>
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
                                        valueNames={view.values.map((v) => valueLabel(v, labels))}
                                        datesOnColumnsOnly={view.cols.some(isDate) && !view.rows.some(isDate)}
                                        onSwap={() => commit(swapAxes(view), { step: "swap" })}
                                        onInstance={(c) => {
                                            chartRef.current = c;
                                            setChartReady(Boolean(c));
                                        }}
                                        onPoint={(p) => openCell({ rowPath: p.rowPath, colPath: p.colPath, value: p.value, valueIndex: p.valueIndex, text: String(p.value ?? "") })}
                                    />
                                ) : gridState.grid ? (
                                    <PivotTable grid={gridState.grid} view={view} labels={labels} version={history.viewKey} hintId={view.values.length ? hintId : undefined} onToggle={(axis, path) => commit(toggleCollapsed(view, axis, path), { step: "collapse" })} onCell={(cell) => openCell(cell)} />
                                ) : null}
                            </section>
                            <div className="pk-status">
                                <span data-testid="row-count">{result ? plural(labels.rowsCount, result.rows.length, { lang: labels.lang, locale }) : ""}</span>
                                <Toasts toasts={toasts} dismiss={dismiss} pause={pause} closeLabel={labels.close} />
                            </div>
                        </div>
                    </div>
                    <FilterPopover target={filterTarget} onClose={closeFilter} view={view} encoded={encoded} locale={locale} labels={labels} commit={commit} />
                </PivotDnd>
                <DrillPanel drill={drill} onClose={() => setDrill(null)} labels={labels} locale={locale} />
                <div className="pk-layer" ref={setLayer}>
                    {/* a fixed probe at 0, 0: where fixed popovers start (popover.jsx) */}
                    <span className="pk-origin" aria-hidden="true" />
                </div>
            </LayerContext.Provider>
        </div>
    );
}
