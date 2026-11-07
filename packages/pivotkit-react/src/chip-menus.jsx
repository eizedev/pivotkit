/*
 * The menus of the chips. A field on Rows or Columns: sort, date grouping, number ranges, top N,
 * filter, move. A value: how it is summarized (the common aggregators first, the statistics folded
 * away), what it is shown as, number format, highlight, name, move. The entries come from
 * pivotkit-core's CATALOG; Remove is pinned to the foot of the menu so it is never scrolled away.
 */

import React, { useId, useState } from "react";
import { CATALOG, aggregatorsFor, fieldLabel, isFormat } from "pivotkit-core";
import { FieldDescription } from "./info.jsx";
import { fill } from "./labels.js";
import { groupingName, valueLabel } from "./names.js";
import { Option, Section } from "./popover.jsx";
import { ZONES, binProblem, filtersOf, groupField, groupingOf, isFiltered, moveField, reorder, setSort, setTopFilter, sortOf, sourceOf, updateValue } from "./view-ops.js";

/** The formats the value menu offers; any other format of a view still works. */
const FORMAT_CHOICES = ["number", "number:0", "number:2", "integer", "currency", "percent", "compact", "bytes", "duration:h", "duration:s"].filter(isFormat);
/** The calculations shown without opening "More calculations". */
const COMMON_SHOW_AS = CATALOG.showAs.filter((s) => ["percentOfGrandTotal", "percentOfRowTotal", "percentOfColumnTotal"].includes(s));
export const ZONE_ICON = { rows: "rows", cols: "cols", values: "sigma", filters: "filter" };

/** A folded group of options; open when it holds the current choice. */
function More({ title, open, children }) {
    return (
        <details className="pk-more" open={open}>
            <summary className="pk-more-title">{title}</summary>
            {children}
        </details>
    );
}

/**
 * Number ranges: their size and where they start (Excel's "Starting at"). An empty start is 0, as its placeholder says; a start whose ranges
 * could not hold the field's numbers (`range`, see binProblem) is refused with a note under the input.
 */
function BinForm({ grouping, labels, onApply, onClear, range, locale }) {
    const [size, setSize] = useState(String(grouping?.size ?? ""));
    const [start, setStart] = useState(String(grouping?.origin ?? ""));
    const problemId = useId();
    const n = Number(size);
    const s = start.trim() === "" ? 0 : Number(start);
    const sizeOk = size.trim() !== "" && Number.isFinite(n) && n > 0;
    const far = sizeOk && Number.isFinite(s) && binProblem(n, s, range) === "far";
    const ok = sizeOk && Number.isFinite(s) && !far;
    const number = (x) => x.toLocaleString(locale, { maximumFractionDigits: 6 });
    return (
        <form
            className="pk-inline-form pk-bin-form"
            onSubmit={(e) => {
                e.preventDefault();
                if (ok) {
                    onApply(n, s);
                }
            }}
        >
            <label className="pk-field-label">
                <span>{labels.binSize}</span>
                <input type="number" inputMode="decimal" step="any" value={size} onChange={(e) => setSize(e.target.value)} data-testid="bin-size" />
            </label>
            <label className="pk-field-label">
                <span>{labels.binStart}</span>
                <input type="number" inputMode="decimal" step="any" value={start} placeholder="0" onChange={(e) => setStart(e.target.value)} data-testid="bin-start" aria-invalid={far || undefined} aria-describedby={far ? problemId : undefined} />
            </label>
            {far && range ? (
                <p id={problemId} className="pk-form-problem" data-testid="bin-problem">
                    {fill(labels.binStartFar, { start: number(s), min: number(range.min), max: number(range.max) })}
                </p>
            ) : null}
            <button type="submit" className="pk-btn pk-primary" disabled={!ok}>
                {labels.apply}
            </button>
            {onClear ? (
                <button type="button" className="pk-btn" onClick={onClear}>
                    {labels.clear}
                </button>
            ) : null}
        </form>
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

/** Move to another zone and left or right; Remove is the menu's foot (RemoveFoot). */
function MoveSection({ view, zone, index, count, labels, commit, close, text, type }) {
    return (
        <Section title={labels.move}>
            {ZONES.filter((z) => z !== zone).map((z) => (
                <Option key={z} icon={ZONE_ICON[z]} onSelect={() => { close(); commit(moveField(view, zone, index, z, undefined, { type }), { step: "moved", field: text, zone: z }); }} testId={`move-${z}`}>
                    {fill(labels.moveTo, { zone: labels.zones[z] })}
                </Option>
            ))}
            {zone !== "filters" && index > 0 ? <Option icon="chevronRight" onSelect={() => { close(); commit(reorder(view, zone, index, index - 1), { step: "reordered", zone }); }}>{labels.moveLeft}</Option> : null}
            {zone !== "filters" && index < count - 1 ? <Option icon="chevronRight" onSelect={() => { close(); commit(reorder(view, zone, index, index + 1), { step: "reordered", zone }); }}>{labels.moveRight}</Option> : null}
        </Section>
    );
}

function RemoveFoot({ labels, onRemove, close }) {
    return (
        <div className="pk-menu-foot">
            <Option icon="trash" danger onSelect={() => { close(); onRemove(); }} testId="menu-remove">
                {labels.remove}
            </Option>
        </div>
    );
}

/** The menu of a chip on Rows or Columns. */
export function AxisMenu({ view, zone, index, field, types, labels, commit, close, openFilter, chipRef, onRemove, defaultsOf, rangeOf, locale, info }) {
    const source = sourceOf(view, field);
    const name = fieldLabel(field, labels.core);
    const sourceType = types.get(source.toLowerCase());
    const grouping = groupingOf(view, field);
    const sort = sortOf(view, field);
    const firstValue = view.values[0] ?? null;
    const firstRef = firstValue ? { field: firstValue.field, agg: firstValue.agg } : { field: null, agg: "count" };
    const firstName = firstValue ? valueLabel(firstValue, labels) : labels.core.countRows;
    const top = filtersOf(view, field, ["top"])[0];
    const isSort = (by, order) => (sort ? sort.by === by && sort.order === order : by === "label" && order === "asc");
    // the custom order of the view, else the host's for the field (fieldDefaults.order); a grouped
    // field has items of its own
    const hostOrder = source === field ? defaultsOf?.(source)?.order : undefined;
    const customItems = sort?.by === "custom" ? sort.items : Array.isArray(hostOrder) && hostOrder.length > 0 ? hostOrder : null;
    const doSort = (by, order) => {
        close();
        const spec = by === "value" ? { by, order, value: firstRef } : by === "custom" ? { by, order, items: [...customItems] } : { by, order };
        // A to Z is the default without an entry; a field with the host's order keeps it as an entry, or
        // the host's order would come back (withHostOrders)
        commit(setSort(view, field, by === "label" && order === "asc" && !(Array.isArray(hostOrder) && hostOrder.length > 0) ? null : spec), { step: "sort", field: name });
    };
    const regroup = (unit, size, origin) => {
        close();
        const sourceName = fieldLabel(source, labels.core);
        const grouped = unit ? groupingName(sourceName, unit, labels, size) : null;
        commit(groupField(view, field, unit, { size, origin, name: grouped ?? undefined }).view, { step: "group", field: sourceName });
    };
    const unitOption = (u) => (
        <Option key={u} checked={grouping?.by === u} onSelect={() => regroup(u)} testId={`group-${u}`} hint={labels.unitHints[u] || undefined}>
            {labels.units[u] ?? u}
        </Option>
    );
    return (
        <>
            <div className="pk-menu-body">
                {info ? <FieldDescription info={info} labels={labels} className="pk-field-desc pk-menu-desc" /> : null}
                <Section title={labels.sort}>
                    <Option checked={isSort("label", "asc")} icon="sortAsc" onSelect={() => doSort("label", "asc")}>{sourceType === "date" ? labels.sortOldest : labels.sortLabelAsc}</Option>
                    <Option checked={isSort("label", "desc")} icon="sortDesc" onSelect={() => doSort("label", "desc")}>{sourceType === "date" ? labels.sortNewest : labels.sortLabelDesc}</Option>
                    <Option checked={isSort("value", "desc")} icon="sortDesc" onSelect={() => doSort("value", "desc")}>{fill(labels.sortValueDesc, { value: firstName })}</Option>
                    <Option checked={isSort("value", "asc")} icon="sortAsc" onSelect={() => doSort("value", "asc")}>{fill(labels.sortValueAsc, { value: firstName })}</Option>
                    {customItems ? <Option checked={isSort("custom", "asc")} icon="sortAsc" onSelect={() => doSort("custom", "asc")} testId="sort-custom">{labels.sortCustom}</Option> : null}
                    {customItems ? <Option checked={isSort("custom", "desc")} icon="sortDesc" onSelect={() => doSort("custom", "desc")} testId="sort-custom-desc">{labels.sortCustomDesc}</Option> : null}
                </Section>
                {sourceType === "date" ? (
                    <Section title={labels.groupBy}>
                        <div className="pk-subtitle">{labels.groupTimeline}</div>
                        <div className="pk-choice-grid">{CATALOG.timelineUnits.map(unitOption)}</div>
                        <div className="pk-subtitle">{labels.groupCyclic}</div>
                        <div className="pk-choice-grid">{CATALOG.cyclicUnits.map(unitOption)}</div>
                        <Option checked={!grouping} onSelect={() => regroup(null)} testId="group-none">{labels.groupNone}</Option>
                    </Section>
                ) : null}
                {sourceType === "number" ? (
                    <Section title={labels.bins}>
                        <BinForm grouping={grouping?.by === "bin" ? grouping : null} labels={labels} range={rangeOf?.(source) ?? null} locale={locale} onApply={(size, origin) => regroup("bin", size, origin)} onClear={grouping ? () => regroup(null) : null} />
                    </Section>
                ) : null}
                <Section title={labels.topN}>
                    <TopForm top={top} labels={labels} firstName={firstName} onApply={(t) => { close(); commit(setTopFilter(view, field, t ? { ...t, by: firstRef } : null), { step: "top", field: name }); }} />
                </Section>
                <Section title={labels.zones.filters}>
                    <Option icon="filter" onSelect={() => { close(); openFilter(field, chipRef.current); }} checked={isFiltered(view, field) ? true : undefined} testId="open-filter">
                        {labels.filter}
                    </Option>
                </Section>
                <MoveSection view={view} zone={zone} index={index} count={view[zone].length} labels={labels} commit={commit} close={close} text={name} type={sourceType} />
            </div>
            <RemoveFoot labels={labels} onRemove={onRemove} close={close} />
        </>
    );
}

/** The menu of a value chip. */
export function ValueMenu({ view, index, types, labels, commit, close, onRemove, defaultsOf, info }) {
    const spec = view.values[index];
    const type = spec.field ? types.get(spec.field.toLowerCase()) ?? "string" : "number";
    const aggs = spec.field ? aggregatorsFor(type) : ["count"];
    const common = CATALOG.commonAggregators.filter((a) => aggs.includes(a));
    const rare = aggs.filter((a) => !CATALOG.commonAggregators.includes(a));
    const otherShowAs = CATALOG.showAs.filter((s) => !COMMON_SHOW_AS.includes(s));
    const numeric = !["listUnique"].includes(spec.agg) && !(["first", "last"].includes(spec.agg) && type !== "number") && !(type === "date" && ["average", "median", "min", "max"].includes(spec.agg));
    const name = valueLabel(spec, labels);
    const set = (patch) => {
        close();
        commit(updateValue(view, index, patch, { defaults: spec.field ? defaultsOf?.(spec.field) : undefined }), { step: "value", field: name });
    };
    const [rename, setRename] = useState(spec.label ?? "");
    const aggOption = (a) => (
        <Option key={a} checked={spec.agg === a} onSelect={() => set({ agg: a })} testId={`agg-${a}`}>
            {labels.core.aggregators[a] ?? a}
        </Option>
    );
    const showAsOption = (s) => (
        <Option key={s} checked={spec.showAs?.type === s} onSelect={() => set({ showAs: { type: s, axis: spec.showAs?.axis ?? "rows" } })} testId={`showas-${s}`}>
            {labels.showAsNames[s] ?? s}
        </Option>
    );
    return (
        <>
            <div className="pk-menu-body">
                {info ? <FieldDescription info={info} labels={labels} className="pk-field-desc pk-menu-desc" /> : null}
                <Section title={labels.aggregation}>
                    <div className="pk-choice-grid">{common.map(aggOption)}</div>
                    {rare.length ? (
                        <More title={labels.moreStatistics} open={rare.includes(spec.agg)}>
                            <div className="pk-choice-grid">{rare.map(aggOption)}</div>
                        </More>
                    ) : null}
                </Section>
                {numeric ? (
                    <Section title={labels.showAs}>
                        <div className="pk-choice-grid">
                            <Option checked={!spec.showAs} onSelect={() => set({ showAs: null })} testId="showas-none">{labels.showAsNone}</Option>
                            {COMMON_SHOW_AS.map(showAsOption)}
                        </div>
                        <More title={labels.moreCalculations} open={Boolean(spec.showAs && otherShowAs.includes(spec.showAs.type))}>
                            <div className="pk-choice-grid">{otherShowAs.map(showAsOption)}</div>
                        </More>
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
                            {/* no colours: pivotkit-core's DEFAULT_THEME gives them, as in Excel */}
                            <Option checked={spec.conditional?.type === "colorScale"} onSelect={() => set({ conditional: { type: "colorScale" } })} testId="cond-colorScale">
                                {labels.colorScale}
                            </Option>
                            <Option checked={spec.conditional?.type === "dataBar"} onSelect={() => set({ conditional: { type: "dataBar", color: null } })} testId="cond-dataBar">
                                {labels.dataBar}
                            </Option>
                        </div>
                    </Section>
                ) : null}
                <Section title={labels.rename}>
                    <form className="pk-inline-form" onSubmit={(e) => { e.preventDefault(); set({ label: rename.trim() || null }); }}>
                        <input type="text" value={rename} placeholder={valueLabel({ ...spec, label: null }, labels)} onChange={(e) => setRename(e.target.value)} aria-label={labels.rename} maxLength={200} />
                        <button type="submit" className="pk-btn pk-primary">{labels.apply}</button>
                    </form>
                </Section>
                <MoveSection view={view} zone="values" index={index} count={view.values.length} labels={labels} commit={commit} close={close} text={name} type={type} />
            </div>
            <RemoveFoot labels={labels} onRemove={onRemove} close={close} />
        </>
    );
}
