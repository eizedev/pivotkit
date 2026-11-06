/*
 * The four zones (Filters, Columns, Rows, Values) with their chips. A chip is dragged to reorder or
 * move it, removed with its x, and its menu (chip-menus.jsx) holds everything else. A chip says what
 * is set on it in words: the grouping in its name ("Created (Month)"), "3 of 4" for a filter,
 * "Top 5", the sort; screen readers get the same in its name. After a chip is removed the focus goes
 * to its neighbour, or to the zone.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fieldItems } from "pivotkit-core";
import { AxisMenu, ValueMenu, ZONE_ICON } from "./chip-menus.jsx";
import { valueLabel } from "./names.js";
import { ChipList, useActiveDrag, useChip, useDropTarget } from "./dnd.jsx";
import { Icon, TYPE_ICON } from "./icons.jsx";
import { fill } from "./labels.js";
import { MenuButton } from "./popover.jsx";
import { ZONES, filterZoneFields, filtersOf, removeAt, selectedItems, sortOf, sourceOf } from "./view-ops.js";

/**
 * What is set on a field: its item filter as "shown of total" (null without one), its top N and its
 * sort, for the chip's badges and its accessible name.
 * @param {any} view
 * @param {string} field
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {string} locale
 */
function fieldState(view, field, encoded, locale) {
    const items = filtersOf(view, field, ["include", "exclude"]).filter((f) => f.type === "include" || f.items.length > 0);
    /** @type {{ shown: number, total: number } | null} */
    let summary = null;
    if (items.length) {
        const info = fieldItems(encoded, field, { view, locale });
        if (info) {
            const all = info.items.map((i) => i.value);
            summary = { shown: selectedItems(view, field, all).length, total: all.length };
        }
    }
    const top = filtersOf(view, field, ["top"])[0] ?? null;
    const other = filtersOf(view, field, ["label", "value"]).length > 0;
    return { summary, top, other, sort: sortOf(view, field) };
}

/** What is set on a chip in words, for its accessible name: "filtered 3 of 4, Top 5, sorted A to Z". */
function stateWords(state, labels, locale, firstValue) {
    if (!state) {
        return "";
    }
    const words = [];
    if (state.summary) {
        words.push(`${labels.stateFiltered} ${fill(labels.filterSummary, { shown: state.summary.shown.toLocaleString(locale), total: state.summary.total.toLocaleString(locale) })}`);
    } else if (state.other) {
        words.push(labels.stateFiltered);
    }
    if (state.top) {
        words.push(fill(state.top.bottom ? labels.bottomBadge : labels.topBadge, { count: state.top.count.toLocaleString(locale) }));
    }
    if (state.sort) {
        const desc = state.sort.order === "desc";
        const order = state.sort.by === "value" ? fill(desc ? labels.sortValueDesc : labels.sortValueAsc, { value: firstValue }) : desc ? labels.sortLabelDesc : labels.sortLabelAsc;
        words.push(fill(labels.stateSorted, { order }));
    }
    return words.join(", ");
}

function Badges({ state, labels, locale }) {
    const parts = [];
    if (state.summary) {
        const text = fill(labels.filterSummary, { shown: state.summary.shown.toLocaleString(locale), total: state.summary.total.toLocaleString(locale) });
        parts.push(
            <span key="filter" className="pk-chip-badge pk-badge-text">
                <Icon name="filter" size={12} />
                {text}
            </span>
        );
    } else if (state.other) {
        parts.push(<Icon key="filter" name="filter" size={12} className="pk-chip-badge" />);
    }
    if (state.top) {
        const text = fill(state.top.bottom ? labels.bottomBadge : labels.topBadge, { count: state.top.count.toLocaleString(locale) });
        parts.push(
            <span key="top" className="pk-chip-badge pk-badge-text" data-testid="top-badge">
                <Icon name="top" size={12} />
                {text}
            </span>
        );
    }
    if (state.sort) {
        const desc = state.sort.order === "desc";
        parts.push(<Icon key="sort" name={desc ? "sortDesc" : "sortAsc"} size={12} className="pk-chip-badge" />);
    }
    if (!parts.length) {
        return null;
    }
    return (
        <span className="pk-badges-inline" aria-hidden="true">
            {parts}
        </span>
    );
}

function Chip({ id, zone, index, count, field, text, typeName, view, types, labels, commit, openFilter, onRemove, state, locale }) {
    const { setNodeRef, isDragging, style, itemProps, handleProps } = useChip(id, { kind: "chip", zone, index, count, field, label: text, type: typeName });
    const chipRef = useRef(/** @type {HTMLElement | null} */ (null));
    const ref = (el) => {
        chipRef.current = el;
        setNodeRef(el);
    };
    const badges = state ? <Badges state={state} labels={labels} locale={locale} /> : null;
    const words = stateWords(state, labels, locale, view.values[0] ? valueLabel(view.values[0], labels) : labels.core.countRows);
    const name = words ? `${text}, ${words}` : undefined;
    const remove = () => onRemove(zone, index, text);
    return (
        <li ref={ref} style={style} className={`pk-chip pk-chip-${zone}${isDragging ? " pk-dragging" : ""}`} {...itemProps} data-chip={text}>
            <span className="pk-handle" {...handleProps} aria-label={fill(labels.dragHandle, { field: text })}>
                <Icon name="grip" size={16} />
            </span>
            <span className={`pk-type pk-type-${typeName}`} aria-hidden="true">
                <Icon name={/** @type {any} */ (TYPE_ICON[typeName] ?? "text")} size={13} />
            </span>
            {zone === "filters" ? (
                <button type="button" className="pk-chip-label" onClick={(e) => openFilter(field, e.currentTarget.closest(".pk-chip"))} title={fill(labels.filterTitle, { field: text })} aria-label={name}>
                    <span className="pk-btn-text">
                        {text}
                        {badges}
                    </span>
                </button>
            ) : (
                <MenuButton
                    label={fill(labels.fieldMenu, { field: text })}
                    text={
                        <>
                            {text}
                            {badges}
                        </>
                    }
                    className="pk-chip-label"
                    name={name}
                    role="dialog"
                    popoverClass="pk-chip-menu"
                    testId={`chip-menu-${text}`}
                >
                    {(close) =>
                        zone === "values" ? (
                            <ValueMenu view={view} index={index} types={types} labels={labels} commit={commit} close={close} onRemove={remove} />
                        ) : (
                            <AxisMenu view={view} zone={zone} index={index} field={field} types={types} labels={labels} commit={commit} close={close} openFilter={openFilter} chipRef={chipRef} onRemove={remove} />
                        )
                    }
                </MenuButton>
            )}
            <button type="button" className="pk-chip-x" onClick={remove} aria-label={fill(labels.removeField, { field: text })} title={fill(labels.removeField, { field: text })}>
                <Icon name="x" size={14} />
            </button>
        </li>
    );
}

function Zone({ zone, entries, labels, children, action }) {
    const count = entries.length;
    const { setNodeRef, isOver } = useDropTarget(`zone:${zone}`, { kind: "zone", zone, count });
    const active = useActiveDrag();
    const dragging = Boolean(active);
    const [flash, setFlash] = useState(false);
    const [prev, setPrev] = useState(count);
    // a chip arrived: the zone lights up once (state from the previous render, not an effect)
    if (count !== prev) {
        setPrev(count);
        if (count > prev) {
            setFlash(true);
        }
    }
    useEffect(() => {
        if (!flash) {
            return undefined;
        }
        const t = setTimeout(() => setFlash(false), 600);
        return () => clearTimeout(t);
    }, [flash]);
    return (
        <section ref={setNodeRef} tabIndex={-1} className={`pk-zone pk-zone-${zone}${isOver ? " pk-over" : ""}${dragging ? " pk-dropping" : ""}${flash ? " pk-flash" : ""}`} aria-label={labels.zones[zone]} data-zone={zone}>
            <div className="pk-zone-head">
                <h3 className="pk-zone-title">
                    <Icon name={/** @type {any} */ (ZONE_ICON[zone])} size={14} />
                    {labels.zones[zone]}
                </h3>
                {action}
            </div>
            <ChipList ids={entries.map((e) => e.id)}>
                <ul className="pk-chips">
                    {children}
                    {count === 0 ? <li className="pk-zone-hint">{labels.zoneHints[zone]}</li> : null}
                </ul>
            </ChipList>
        </section>
    );
}

/** Chip entries of every zone: id, field, text, type (of the source field: a grouped date stays a date). */
export function zoneEntries(view, types, labels) {
    const typeOf = (f) => types.get(String(sourceOf(view, f)).toLowerCase()) ?? "string";
    const seen = new Map();
    const axis = (zone) => view[zone].map((f, i) => ({ id: `chip:${zone}:${f}`, field: f, text: f, type: typeOf(f), index: i }));
    return {
        filters: filterZoneFields(view).map((f, i) => ({ id: `chip:filters:${f}`, field: f, text: f, type: typeOf(f), index: i })),
        cols: axis("cols"),
        rows: axis("rows"),
        values: view.values.map((v, i) => {
            // stable across reorders, so a moved chip keeps its element; a repeated value gets a number
            const key = `${v.agg}:${v.field}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
            return { id: `chip:values:${key}:${seen.get(key)}`, field: v.field, text: valueLabel(v, labels), type: v.field ? typeOf(v.field) : "number", index: i };
        })
    };
}

/**
 * @param {{ view: any, types: Map<string, string>, labels: import("./labels.js").UiLabels,
 *   commit: (view: object, note?: any) => void, openFilter: (field: string, anchor: HTMLElement) => void,
 *   encoded: import("pivotkit-core").Encoded, locale: string, onSwap: () => void }} props
 */
export function Zones({ view, types, labels, commit, openFilter, encoded, locale, onSwap }) {
    const entries = useMemo(() => zoneEntries(view, types, labels), [view, types, labels]);
    // the state of every field chip, once per view (a filter summary counts the field's values)
    const states = useMemo(() => {
        const map = new Map();
        for (const zone of ["filters", "cols", "rows"]) {
            for (const e of entries[zone]) {
                map.set(e.field, fieldState(view, e.field, encoded, locale));
            }
        }
        return map;
    }, [entries, view, encoded, locale]);
    const root = useRef(/** @type {HTMLDivElement | null} */ (null));
    const focusAfter = useRef(/** @type {{ zone: string, index: number } | null} */ (null));
    const onRemove = (zone, index, text) => {
        focusAfter.current = { zone, index };
        commit(removeAt(view, zone, index), { step: "removed", field: text, removed: true });
    };
    // after a removal: the chip now at that place, the one before it, or the zone
    useEffect(() => {
        const at = focusAfter.current;
        if (!at || !root.current) {
            return;
        }
        focusAfter.current = null;
        const zone = root.current.querySelector(`[data-zone="${at.zone}"]`);
        const chips = zone ? [...zone.querySelectorAll(".pk-chip .pk-chip-label")] : [];
        const target = /** @type {HTMLElement | null} */ (chips[Math.min(at.index, chips.length - 1)] ?? zone);
        target?.focus({ preventScroll: true });
    });
    return (
        <div className="pk-zones" ref={root}>
            {ZONES.map((zone) => (
                <Zone
                    key={zone}
                    zone={zone}
                    entries={entries[zone]}
                    labels={labels}
                    action={
                        zone === "cols" ? (
                            <button type="button" className="pk-link pk-swap" onClick={onSwap} disabled={view.rows.length + view.cols.length === 0} data-testid="swap">
                                <Icon name="swap" size={14} />
                                {labels.swap}
                            </button>
                        ) : null
                    }
                >
                    {entries[zone].map((e) => (
                        <Chip
                            key={e.id}
                            id={e.id}
                            zone={zone}
                            index={e.index}
                            count={entries[zone].length}
                            field={e.field}
                            text={e.text}
                            typeName={e.type}
                            view={view}
                            types={types}
                            labels={labels}
                            commit={commit}
                            openFilter={openFilter}
                            onRemove={onRemove}
                            state={zone === "values" ? null : states.get(e.field)}
                            locale={locale}
                        />
                    ))}
                </Zone>
            ))}
        </div>
    );
}
