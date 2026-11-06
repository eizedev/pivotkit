/*
 * The four zones (Filters, Columns, Rows, Values) with their chips. A chip is dragged to reorder or
 * move it, removed with its x, and its menu holds everything else: aggregator, "show values as",
 * format, highlight and name of a value; sort, date grouping, bins, top N and filter of a field; move
 * to another zone or position for the keyboard.
 */

import React, { useEffect, useRef, useState } from "react";
import { CATALOG, aggregatorsFor } from "pivotkit-core";
import { ChipList, useActiveDrag, useChip, useDropTarget } from "./dnd.jsx";
import { Icon, TYPE_ICON } from "./icons.jsx";
import { fill } from "./labels.js";
import { MenuButton, Option, Section } from "./popover.jsx";
import {
    ZONES,
    filterZoneFields,
    groupField,
    groupingOf,
    isFiltered,
    moveField,
    removeAt,
    reorder,
    setSort,
    setTopFilter,
    filtersOf,
    sortOf,
    sourceOf,
    updateValue
} from "./view-ops.js";

const DATE_UNITS = CATALOG.deriveUnits.filter((u) => u !== "bin");
/** The formats the value menu offers; any other format of a view still works and shows as checked "Automatic" off. */
const FORMAT_CHOICES = ["number", "number:0", "number:2", "integer", "currency", "percent", "compact", "bytes", "duration:h", "duration:s"];
const ZONE_ICON = { rows: "rows", cols: "cols", values: "sigma", filters: "filter" };

/** "Sum of Revenue", or the value's own name. */
export function valueLabel(spec, labels) {
    if (spec.label) {
        return spec.label;
    }
    if (!spec.field) {
        return labels.core.countRows;
    }
    const agg = Object.hasOwn(labels.core.aggregators, spec.agg) ? labels.core.aggregators[spec.agg] : spec.agg;
    return fill(labels.core.valueName, { agg, field: spec.field });
}

/** The name of a derived field for a grouping, in the labels' language. */
export function groupingName(source, unit, labels, size) {
    return unit === "bin" ? fill(labels.binsName, { field: source, size }) : fill(labels.derivedName, { field: source, unit: labels.units[unit] ?? unit });
}

function NumberForm({ label, initial, onApply, onClear, applyLabel, clearLabel, testId, min = 0 }) {
    const [value, setValue] = useState(String(initial ?? ""));
    const n = Number(value);
    const ok = value.trim() !== "" && Number.isFinite(n) && n > min;
    return (
        <form
            className="pk-inline-form"
            onSubmit={(e) => {
                e.preventDefault();
                if (ok) {
                    onApply(n);
                }
            }}
        >
            <label className="pk-field-label">
                <span>{label}</span>
                <input type="number" inputMode="decimal" step="any" value={value} onChange={(e) => setValue(e.target.value)} data-testid={testId} />
            </label>
            <button type="submit" className="pk-btn pk-primary" disabled={!ok}>
                {applyLabel}
            </button>
            {onClear ? (
                <button type="button" className="pk-btn" onClick={onClear}>
                    {clearLabel}
                </button>
            ) : null}
        </form>
    );
}

/** The menu of a chip on Rows or Columns. */
function AxisMenu({ view, zone, index, field, types, labels, commit, close, openFilter, chipRef }) {
    const source = sourceOf(view, field);
    const sourceType = types.get(source.toLowerCase());
    const grouping = groupingOf(view, field);
    const sort = sortOf(view, field);
    const firstValue = view.values[0] ?? null;
    const firstRef = firstValue ? { field: firstValue.field, agg: firstValue.agg } : { field: null, agg: "count" };
    const firstName = firstValue ? valueLabel(firstValue, labels) : labels.core.countRows;
    const top = filtersOf(view, field, ["top"])[0];
    const isSort = (by, order) => (sort ? sort.by === by && sort.order === order : by === "label" && order === "asc");
    const doSort = (by, order) => {
        close();
        commit(setSort(view, field, by === "label" && order === "asc" ? null : by === "value" ? { by, order, value: firstRef } : { by, order }));
    };
    const regroup = (unit, size) => {
        close();
        const name = unit ? groupingName(source, unit, labels, size) : null;
        commit(groupField(view, field, unit, { size, name: name ?? undefined }).view);
    };
    const others = ZONES.filter((z) => z !== zone);
    const list = view[zone];
    return (
        <>
            <Section title={labels.sort}>
                <Option checked={isSort("label", "asc")} icon="sortAsc" onSelect={() => doSort("label", "asc")}>{labels.sortLabelAsc}</Option>
                <Option checked={isSort("label", "desc")} icon="sortDesc" onSelect={() => doSort("label", "desc")}>{labels.sortLabelDesc}</Option>
                <Option checked={isSort("value", "desc")} icon="sortDesc" onSelect={() => doSort("value", "desc")}>{fill(labels.sortValueDesc, { value: firstName })}</Option>
                <Option checked={isSort("value", "asc")} icon="sortAsc" onSelect={() => doSort("value", "asc")}>{fill(labels.sortValueAsc, { value: firstName })}</Option>
            </Section>
            {sourceType === "date" ? (
                <Section title={labels.groupBy}>
                    <div className="pk-choice-grid">
                        <Option checked={!grouping} onSelect={() => regroup(null)}>{labels.groupNone}</Option>
                        {DATE_UNITS.map((u) => (
                            <Option key={u} checked={grouping?.by === u} onSelect={() => regroup(u)} testId={`group-${u}`}>
                                {labels.units[u] ?? u}
                            </Option>
                        ))}
                    </div>
                </Section>
            ) : null}
            {sourceType === "number" ? (
                <Section title={labels.bins}>
                    <NumberForm label={labels.binSize} initial={grouping?.size ?? ""} applyLabel={labels.apply} clearLabel={labels.clear} onApply={(size) => regroup("bin", size)} onClear={grouping ? () => regroup(null) : null} testId="bin-size" />
                </Section>
            ) : null}
            <Section title={labels.topN}>
                <TopForm top={top} labels={labels} firstName={firstName} onApply={(t) => { close(); commit(setTopFilter(view, field, t ? { ...t, by: firstRef } : null)); }} />
            </Section>
            <Section title={labels.zones.filters}>
                <Option icon="filter" onSelect={() => { close(); openFilter(field, chipRef.current); }} checked={isFiltered(view, field) ? true : undefined} testId="open-filter">
                    {labels.filter}
                </Option>
            </Section>
            <MoveSection view={view} zone={zone} index={index} count={list.length} others={others} labels={labels} commit={commit} close={close} types={types} field={field} text={field} />
        </>
    );
}

function TopForm({ top, labels, firstName, onApply }) {
    const [count, setCount] = useState(String(top?.count ?? 10));
    const [bottom, setBottom] = useState(Boolean(top?.bottom));
    const n = Number(count);
    const ok = Number.isInteger(n) && n > 0;
    return (
        <form className="pk-inline-form" onSubmit={(e) => { e.preventDefault(); if (ok) onApply({ count: n, bottom }); }}>
            <div className="pk-segmented pk-small" role="group" aria-label={labels.topN}>
                <button type="button" aria-pressed={!bottom} onClick={() => setBottom(false)}>{labels.top}</button>
                <button type="button" aria-pressed={bottom} onClick={() => setBottom(true)}>{labels.bottom}</button>
            </div>
            <label className="pk-field-label pk-narrow-input">
                <span className="pk-sr">{labels.topCount}</span>
                <input type="number" min="1" step="1" value={count} onChange={(e) => setCount(e.target.value)} aria-label={labels.topCount} data-testid="top-count" />
            </label>
            <span className="pk-muted pk-by">{fill(labels.by, { value: firstName })}</span>
            <button type="submit" className="pk-btn pk-primary" disabled={!ok}>{labels.apply}</button>
            {top ? <button type="button" className="pk-btn" onClick={() => onApply(null)}>{labels.clear}</button> : null}
        </form>
    );
}

function MoveSection({ view, zone, index, count, others, labels, commit, close, types, field, text }) {
    const type = types.get(sourceOf(view, field ?? "").toLowerCase());
    return (
        <Section title={labels.move}>
            {others.map((z) => (
                <Option key={z} icon={ZONE_ICON[z]} onSelect={() => { close(); commit(moveField(view, zone, index, z, undefined, { type }), { moved: z, field: text }); }} testId={`move-${z}`}>
                    {fill(labels.moveTo, { zone: labels.zones[z] })}
                </Option>
            ))}
            {zone !== "filters" && index > 0 ? <Option icon="chevronRight" onSelect={() => { close(); commit(reorder(view, zone, index, index - 1)); }}>{labels.moveLeft}</Option> : null}
            {zone !== "filters" && index < count - 1 ? <Option icon="chevronRight" onSelect={() => { close(); commit(reorder(view, zone, index, index + 1)); }}>{labels.moveRight}</Option> : null}
            <Option icon="trash" danger onSelect={() => { close(); commit(removeAt(view, zone, index), { removed: true, field: text }); }} testId="menu-remove">
                {labels.remove}
            </Option>
        </Section>
    );
}

/** The menu of a value chip. */
function ValueMenu({ view, index, types, labels, commit, close }) {
    const spec = view.values[index];
    const type = spec.field ? types.get(spec.field.toLowerCase()) ?? "string" : "number";
    const aggs = spec.field ? aggregatorsFor(type) : ["count"];
    const numeric = !["listUnique"].includes(spec.agg) && !(["first", "last"].includes(spec.agg) && type !== "number") && !(type === "date" && ["average", "median", "min", "max"].includes(spec.agg));
    const set = (patch) => {
        close();
        commit(updateValue(view, index, patch));
    };
    const [name, setName] = useState(spec.label ?? "");
    return (
        <>
            <Section title={labels.aggregation}>
                <div className="pk-choice-grid">
                    {aggs.map((a) => (
                        <Option key={a} checked={spec.agg === a} onSelect={() => set({ agg: a })} testId={`agg-${a}`}>
                            {labels.core.aggregators[a] ?? a}
                        </Option>
                    ))}
                </div>
            </Section>
            {numeric ? (
                <Section title={labels.showAs}>
                    <div className="pk-choice-grid">
                        <Option checked={!spec.showAs} onSelect={() => set({ showAs: null })}>{labels.showAsNone}</Option>
                        {CATALOG.showAs.map((s) => (
                            <Option key={s} checked={spec.showAs?.type === s} onSelect={() => set({ showAs: { type: s, axis: spec.showAs?.axis ?? "rows" } })} testId={`showas-${s}`}>
                                {labels.showAsNames[s] ?? s}
                            </Option>
                        ))}
                    </div>
                    {spec.showAs && CATALOG.showAsAlongAxis.includes(spec.showAs.type) ? (
                        <div className="pk-segmented pk-small" role="group" aria-label={labels.along}>
                            <span className="pk-muted">{labels.along}</span>
                            {["rows", "cols"].map((axis) => (
                                <button key={axis} type="button" aria-pressed={spec.showAs.axis === axis} onClick={() => set({ showAs: { ...spec.showAs, axis } })}>
                                    {labels.zones[axis]}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </Section>
            ) : null}
            {numeric ? (
                <Section title={labels.format}>
                    <div className="pk-choice-grid">
                        <Option checked={!spec.format} onSelect={() => set({ format: null })}>{labels.formatAuto}</Option>
                        {FORMAT_CHOICES.map((f) => (
                            <Option key={f} checked={spec.format === f} onSelect={() => set({ format: f })} testId={`format-${f}`}>
                                {labels.formats[f] ?? f}
                            </Option>
                        ))}
                    </div>
                </Section>
            ) : null}
            {numeric ? (
                <Section title={labels.conditional}>
                    <div className="pk-choice-grid">
                        <Option checked={!spec.conditional} onSelect={() => set({ conditional: null })}>{labels.conditionalNone}</Option>
                        <Option checked={spec.conditional?.type === "colorScale"} onSelect={() => set({ conditional: { type: "colorScale", colors: ["#f8696b", "#ffeb84", "#63be7b"] } })} testId="cond-colorScale">
                            {labels.colorScale}
                        </Option>
                        <Option checked={spec.conditional?.type === "dataBar"} onSelect={() => set({ conditional: { type: "dataBar", color: null } })} testId="cond-dataBar">
                            {labels.dataBar}
                        </Option>
                    </div>
                </Section>
            ) : null}
            <Section title={labels.rename}>
                <form className="pk-inline-form" onSubmit={(e) => { e.preventDefault(); set({ label: name.trim() || null }); }}>
                    <input type="text" value={name} placeholder={valueLabel({ ...spec, label: null }, labels)} onChange={(e) => setName(e.target.value)} aria-label={labels.rename} maxLength={200} />
                    <button type="submit" className="pk-btn pk-primary">{labels.apply}</button>
                </form>
            </Section>
            <MoveSection view={view} zone="values" index={index} count={view.values.length} others={["rows", "cols", "filters"]} labels={labels} commit={commit} close={close} types={types} field={spec.field} text={valueLabel(spec, labels)} />
        </>
    );
}

function Chip({ id, zone, index, field, text, typeName, view, types, labels, commit, openFilter, badges }) {
    const { setNodeRef, isDragging, style, itemProps, handleProps } = useChip(id, { kind: "chip", zone, index, field, label: text, type: typeName });
    const chipRef = useRef(/** @type {HTMLElement | null} */ (null));
    const ref = (el) => {
        chipRef.current = el;
        setNodeRef(el);
    };
    return (
        <li ref={ref} style={style} className={`pk-chip pk-chip-${zone}${isDragging ? " pk-dragging" : ""}`} {...itemProps} data-chip={text}>
            <span className="pk-handle" {...handleProps} aria-label={fill(labels.dragHandle, { field: text })}>
                <Icon name="grip" size={14} />
            </span>
            <span className={`pk-type pk-type-${typeName}`} aria-hidden="true">
                <Icon name={/** @type {any} */ (TYPE_ICON[typeName] ?? "text")} size={13} />
            </span>
            {zone === "filters" ? (
                <button type="button" className="pk-chip-label" onClick={(e) => openFilter(field, e.currentTarget.closest(".pk-chip"))} aria-label={fill(labels.filterTitle, { field: text })}>
                    {text}
                    {badges}
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
                    role="dialog"
                    popoverClass="pk-chip-menu"
                    testId={`chip-menu-${text}`}
                >
                    {(close) =>
                        zone === "values" ? (
                            <ValueMenu view={view} index={index} types={types} labels={labels} commit={commit} close={close} />
                        ) : (
                            <AxisMenu view={view} zone={zone} index={index} field={field} types={types} labels={labels} commit={commit} close={close} openFilter={openFilter} chipRef={chipRef} />
                        )
                    }
                </MenuButton>
            )}
            <button type="button" className="pk-chip-x" onClick={() => commit(removeAt(view, zone, index), { removed: true, field: text })} aria-label={fill(labels.removeField, { field: text })} title={fill(labels.removeField, { field: text })}>
                <Icon name="x" size={14} />
            </button>
        </li>
    );
}

function Zone({ zone, entries, labels, children }) {
    const { setNodeRef, isOver } = useDropTarget(`zone:${zone}`, { kind: "zone", zone });
    const active = useActiveDrag();
    const dragging = Boolean(active);
    const [flash, setFlash] = useState(false);
    const count = entries.length;
    const prev = useRef(count);
    useEffect(() => {
        if (count > prev.current) {
            setFlash(true);
            const t = setTimeout(() => setFlash(false), 600);
            prev.current = count;
            return () => clearTimeout(t);
        }
        prev.current = count;
        return undefined;
    }, [count]);
    return (
        <section ref={setNodeRef} className={`pk-zone pk-zone-${zone}${isOver ? " pk-over" : ""}${dragging ? " pk-dropping" : ""}${flash ? " pk-flash" : ""}`} aria-label={labels.zones[zone]} data-zone={zone}>
            <h3 className="pk-zone-title">
                <Icon name={/** @type {any} */ (ZONE_ICON[zone])} size={14} />
                {labels.zones[zone]}
            </h3>
            <ChipList ids={entries.map((e) => e.id)}>
                <ul className="pk-chips">
                    {children}
                    {count === 0 ? <li className="pk-zone-hint">{labels.zoneHints[zone]}</li> : null}
                </ul>
            </ChipList>
        </section>
    );
}

/** Chip entries of every zone: id, field, text, type. */
export function zoneEntries(view, types, labels) {
    const typeOf = (f) => types.get(String(f).toLowerCase()) ?? "string";
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
 * @param {{ view: object, types: Map<string, string>, labels: import("./labels.js").UiLabels,
 *   commit: (view: object, note?: object) => void, openFilter: (field: string, anchor: HTMLElement) => void }} props
 */
export function Zones({ view, types, labels, commit, openFilter }) {
    const entries = zoneEntries(view, types, labels);
    return (
        <div className="pk-zones">
            {ZONES.map((zone) => (
                <Zone key={zone} zone={zone} entries={entries[zone]} labels={labels}>
                    {entries[zone].map((e) => (
                        <Chip
                            key={e.id}
                            id={e.id}
                            zone={zone}
                            index={e.index}
                            field={e.field}
                            text={e.text}
                            typeName={e.type}
                            view={view}
                            types={types}
                            labels={labels}
                            commit={commit}
                            openFilter={openFilter}
                            badges={
                                zone !== "values" ? (
                                    <>
                                        {zone !== "filters" && isFiltered(view, e.field) ? <Icon name="filter" size={12} className="pk-chip-badge" /> : null}
                                        {zone === "filters" && isFiltered(view, e.field) ? <span className="pk-dot" aria-label={labels.filtered} /> : null}
                                        {sortOf(view, e.field) ? <Icon name={sortOf(view, e.field).order === "desc" ? "sortDesc" : "sortAsc"} size={12} className="pk-chip-badge" /> : null}
                                    </>
                                ) : null
                            }
                        />
                    ))}
                </Zone>
            ))}
        </div>
    );
}
