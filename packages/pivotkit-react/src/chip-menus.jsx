/*
 * The menus of the chips. A field on Rows or Columns: sort (by label, or largest or smallest first by
 * any value that gives numbers), date grouping, number ranges, top N (by a chosen value), filter with a
 * value condition, move. A value: how it is summarized (the common aggregators first, the statistics folded
 * away), what it is shown as, number format, highlight, name, move. The entries come from
 * pivotkit-core's CATALOG; Remove is pinned to the foot of the menu so it is never scrolled away.
 */

import React, { useId, useState } from "react";
import { CATALOG, aggregatorsFor, fieldLabel, isFormat } from "pivotkit-core";
import { ClearInput } from "./clear-input.jsx";
import { ZONE_ICON } from "./icons.jsx";
import { FieldDescription } from "./info.jsx";
import { fill } from "./labels.js";
import { numberText, parseNumber } from "./numbers.js";
import { filterText, groupingName, refLabel, valueLabel } from "./names.js";
import { Option } from "./popover.jsx";
import { Section, SettingInfo } from "./section.jsx";
import { ZONES, binProblem, filtersOf, groupField, groupingOf, hasFilter, measureChoices, moveField, numericResult, removeFilters, reorder, sameRef, setSort, setTopFilter, setValueFilter, sortEntry, sortOf, sourceOf, updateValue, withMeasure } from "./view-ops.js";

/** The formats the value menu offers first, and those behind "More formats"; any other format of a view still works. */
const FORMAT_CHOICES = ["number", "number:0", "number:2", "currency", "percent"].filter(isFormat);
const MORE_FORMATS = ["integer", "compact", "bytes", "duration:h", "duration:s"].filter(isFormat);
/** The calculations shown without opening "More calculations". */
const COMMON_SHOW_AS = CATALOG.showAs.filter((s) => ["percentOfGrandTotal", "percentOfRowTotal", "percentOfColumnTotal"].includes(s));

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
 * A number typed into a menu, read in the report's locale (numbers.js). `kind` says what it must be:
 * "number" any number, "size" above 0, "count" a whole number of 1 or more. The problem shows while
 * the text is not such a number, and for an empty required field once Apply was pressed.
 * @param {string} text
 * @param {{ kind?: "number" | "size" | "count", required?: boolean, tried?: boolean, labels: any, locale: string }} options
 * @returns {{ value: number | null, problem: string | null }}
 */
function readNumber(text, { kind = "number", required = true, tried = false, labels, locale }) {
    const value = parseNumber(text, locale);
    const ok = value !== null && (kind === "number" || (kind === "size" ? value > 0 : Number.isInteger(value) && value >= 1));
    const say = () => (kind === "count" ? labels.countInvalid : fill(kind === "size" ? labels.sizeInvalid : labels.numberInvalid, { example: (kind === "size" ? 0.5 : 1234.5).toLocaleString(locale) }));
    if (text.trim() === "") {
        return { value: null, problem: required && tried ? say() : null };
    }
    return ok ? { value, problem: null } : { value: null, problem: say() };
}

/**
 * The text field of a number: a text input for the locale's own way of writing numbers (a number
 * input would read "1.000,5" by the browser's rules, not the report's), its problem under it.
 * @param {{ value: string, onChange: (text: string) => void, problem: string | null, label: string,
 *   testId: string, className?: string, shown?: string, shownClass?: string }} props
 */
function NumberField({ value, onChange, problem, label, testId, className = "pk-field-label", shown, shownClass }) {
    const id = useId();
    return (
        <>
            <label className={className}>
                {shown ? <span className={shownClass}>{shown}</span> : <span className="pk-sr">{label}</span>}
                <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label={label}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? id : undefined}
                    data-testid={testId}
                />
            </label>
            {problem ? (
                <p id={id} className="pk-form-problem" data-testid={`${testId}-problem`}>
                    {problem}
                </p>
            ) : null}
        </>
    );
}

/**
 * Number ranges: their size and where they start (Excel's "Starting at"). An empty start is 0, as its placeholder says; a start whose ranges
 * could not hold the field's numbers (`range`, see binProblem) is refused with a note under the input.
 */
function BinForm({ grouping, labels, onApply, onClear, range, locale }) {
    const [size, setSize] = useState(numberText(grouping?.size, locale));
    const [start, setStart] = useState(numberText(grouping?.origin, locale));
    const [tried, setTried] = useState(false);
    const problemId = useId();
    const sized = readNumber(size, { kind: "size", tried, labels, locale });
    const started = readNumber(start, { required: false, labels, locale });
    const n = sized.value;
    const s = start.trim() === "" ? 0 : started.value;
    const far = n !== null && s !== null && binProblem(n, s, range) === "far";
    const number = (x) => x.toLocaleString(locale, { maximumFractionDigits: 6 });
    return (
        <form
            className="pk-inline-form pk-bin-form"
            onSubmit={(e) => {
                e.preventDefault();
                // an empty size removes the ranges, as Remove does
                if (onClear && size.trim() === "") {
                    onClear();
                    return;
                }
                setTried(true);
                if (n !== null && s !== null && !far) {
                    onApply(n, s);
                }
            }}
        >
            <NumberField value={size} onChange={setSize} problem={sized.problem} label={labels.binSize} shown={labels.binSize} testId="bin-size" />
            <label className="pk-field-label">
                <span>{labels.binStart}</span>
                <ClearInput type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={start} placeholder="0" onChange={setStart} clearLabel={labels.clearText} data-testid="bin-start" aria-invalid={far || started.problem ? true : undefined} aria-describedby={far || started.problem ? problemId : undefined} />
            </label>
            {started.problem ? (
                <p id={problemId} className="pk-form-problem" data-testid="bin-start-problem">
                    {started.problem}
                </p>
            ) : far && range && s !== null && n !== null ? (
                <p id={problemId} className="pk-form-problem" data-testid="bin-problem">
                    {fill(labels.binStartFar, { start: number(s), min: number(range.min), max: number(range.max) })}
                </p>
            ) : null}
            {/* a start the ranges cannot hold has its note; Apply waits for another start */}
            <button type="submit" className="pk-btn pk-primary" disabled={far}>
                {labels.apply}
            </button>
            {onClear ? (
                <button type="button" className="pk-btn" onClick={onClear} data-testid="bin-remove">
                    {labels.removeSetting}
                </button>
            ) : null}
        </form>
    );
}

/**
 * The measure a top N or a value condition goes by: a select when the view has several values that
 * give numbers, else the one name. `index` is the position in `choices`.
 * @param {{ choices: Array<{ field: string | null, agg: string }>, names: string[], index: number,
 *   onChange: (index: number) => void, label: string, prefix?: string, testId: string }} props
 */
function MeasurePick({ choices, names, index, onChange, label, prefix, testId }) {
    if (choices.length < 2) {
        return <span className="pk-muted pk-by">{prefix ? `${prefix} ${names[0]}` : names[0]}</span>;
    }
    return (
        <label className="pk-field-label pk-by-pick">
            {prefix ? <span className="pk-muted">{prefix}</span> : <span className="pk-sr">{label}</span>}
            <select value={index} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testId}>
                {choices.map((c, i) => (
                    <option key={`${c.field}:${c.agg}`} value={i}>
                        {names[i]}
                    </option>
                ))}
            </select>
        </label>
    );
}

/** The index of a reference in the choices; the first (the default) when it is not there. */
const choiceIndex = (choices, ref) => Math.max(0, choices.findIndex((c) => sameRef(c, ref)));

function TopForm({ top, labels, choices, names, onApply, locale }) {
    const [count, setCount] = useState(numberText(top?.count ?? 10, locale));
    const [bottom, setBottom] = useState(Boolean(top?.bottom));
    const [by, setBy] = useState(() => choiceIndex(choices, top?.by));
    const [tried, setTried] = useState(false);
    const counted = readNumber(count, { kind: "count", tried, labels, locale });
    return (
        <form
            className="pk-inline-form"
            onSubmit={(e) => {
                e.preventDefault();
                // an empty count removes the Top N, as Remove does
                if (top && count.trim() === "") {
                    onApply(null);
                    return;
                }
                setTried(true);
                if (counted.value !== null) {
                    onApply({ count: counted.value, bottom, by: choices[by] });
                }
            }}
        >
            <div className="pk-segmented pk-small" role="group" aria-label={labels.topN}>
                <button type="button" aria-pressed={!bottom} onClick={() => setBottom(false)}>{labels.top}</button>
                <button type="button" aria-pressed={bottom} onClick={() => setBottom(true)}>{labels.bottom}</button>
            </div>
            <NumberField value={count} onChange={setCount} problem={counted.problem} label={labels.topCount} testId="top-count" className="pk-field-label pk-narrow-input" />
            <MeasurePick choices={choices} names={names} index={by} onChange={setBy} label={labels.topBy} prefix={labels.topBy} testId="top-by" />
            <button type="submit" className="pk-btn pk-primary">{labels.apply}</button>
            {top ? <button type="button" className="pk-btn" onClick={() => onApply(null)} data-testid="top-remove">{labels.removeSetting}</button> : null}
        </form>
    );
}

/**
 * A value condition on a field ("Sum of Revenue greater than 1000"): the value it goes by, an operator
 * of pivotkit-core's CATALOG.valueOps and one number, or two for between.
 */
function ValueFilterForm({ condition, labels, choices, names, onApply, locale }) {
    const [by, setBy] = useState(() => choiceIndex(choices, condition?.by));
    const [op, setOp] = useState(condition?.op ?? ">");
    const [first, setFirst] = useState(numberText(condition?.value, locale));
    const [second, setSecond] = useState(numberText(condition?.value2, locale));
    const [tried, setTried] = useState(false);
    const between = op === "between" || op === "notBetween";
    const a = readNumber(first, { tried, labels, locale });
    const b = readNumber(second, { tried, labels, locale });
    const ok = a.value !== null && (!between || b.value !== null);
    return (
        <form
            className="pk-inline-form pk-value-filter"
            onSubmit={(e) => {
                e.preventDefault();
                // no number removes the condition, as Remove does
                if (condition && first.trim() === "" && second.trim() === "") {
                    onApply(null);
                    return;
                }
                setTried(true);
                if (ok) {
                    onApply({ by: choices[by], op, value: /** @type {number} */ (a.value), ...(between ? { value2: /** @type {number} */ (b.value) } : {}) });
                }
            }}
        >
            <MeasurePick choices={choices} names={names} index={by} onChange={setBy} label={labels.valueFilterBy} testId="value-filter-by" />
            <label className="pk-field-label">
                <span className="pk-sr">{labels.valueFilterOp}</span>
                <select value={op} onChange={(e) => setOp(e.target.value)} aria-label={labels.valueFilterOp} data-testid="value-filter-op">
                    {CATALOG.valueOps.map((o) => (
                        <option key={o} value={o}>
                            {labels.valueOps[o] ?? o}
                        </option>
                    ))}
                </select>
            </label>
            <NumberField value={first} onChange={setFirst} problem={a.problem} label={labels.valueFilterNumber} testId="value-filter-number" className="pk-field-label pk-narrow-input" />
            {between ? (
                <NumberField value={second} onChange={setSecond} problem={b.problem} label={`${labels.valueFilterTo} ${labels.valueFilterNumber}`} shown={labels.valueFilterTo} shownClass="pk-muted" testId="value-filter-number2" className="pk-field-label pk-narrow-input" />
            ) : null}
            <button type="submit" className="pk-btn pk-primary" data-testid="value-filter-apply">{labels.apply}</button>
            {condition ? <button type="button" className="pk-btn" onClick={() => onApply(null)} data-testid="value-filter-remove">{labels.removeSetting}</button> : null}
        </form>
    );
}

/** Move to another zone and left or right; Remove is the menu's foot (RemoveFoot). */
function MoveSection({ view, zone, index, count, labels, commit, close, text, type }) {
    return (
        <Section title={labels.move} id="move">
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
export function AxisMenu({ view, zone, index, field, types, labels, commit, close, openFilter, chipRef, onRemove, defaultsOf, rangeOf, locale, info, state }) {
    const source = sourceOf(view, field);
    const name = fieldLabel(field, labels.core);
    const sourceType = types.get(source.toLowerCase());
    const grouping = groupingOf(view, field);
    const sort = sortOf(view, field);
    // the values a sort, a top N or a value condition can go by; the first is the default
    const shown = measureChoices(view, (f) => types.get(f.toLowerCase()));
    const top = filtersOf(view, field, ["top"])[0];
    const condition = filtersOf(view, field, ["value"])[0];
    // a measure that is not among the values any more stays a choice of what goes by it
    const pick = (ref) => {
        const list = withMeasure(shown, ref);
        return { choices: list, names: list.map((c) => refLabel(view, c, labels)) };
    };
    const { choices, names } = pick(sort?.by === "value" ? sort.value : null);
    const topPick = pick(top?.by);
    const conditionPick = pick(condition?.by);
    const isSort = (by, order, ref) => (sort ? sort.by === by && sort.order === order && (by !== "value" || sameRef(sort.value, ref)) : by === "label" && order === "asc");
    // the custom order of the view, else the host's for the field (fieldDefaults.order); a grouped
    // field has items of its own
    const hostOrder = source === field ? defaultsOf?.(source)?.order : undefined;
    const customItems = sort?.by === "custom" ? sort.items : Array.isArray(hostOrder) && hostOrder.length > 0 ? hostOrder : null;
    const doSort = (by, order, ref) => {
        close();
        const spec = by === "value" ? { by, order, value: ref } : by === "custom" ? { by, order, items: [...customItems] } : { by, order };
        commit(setSort(view, field, sortEntry(spec, Array.isArray(hostOrder) && hostOrder.length > 0)), { step: "sort", field: name });
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
                <Section title={labels.sort} id="sort">
                    <Option checked={isSort("label", "asc")} icon="sortAsc" onSelect={() => doSort("label", "asc")}>{sourceType === "date" ? labels.sortOldest : labels.sortLabelAsc}</Option>
                    <Option checked={isSort("label", "desc")} icon="sortDesc" onSelect={() => doSort("label", "desc")}>{sourceType === "date" ? labels.sortNewest : labels.sortLabelDesc}</Option>
                    {/* by each value that gives numbers, largest and smallest first */}
                    {choices.map((c, i) => (
                        <React.Fragment key={`${c.field}:${c.agg}`}>
                            <Option checked={isSort("value", "desc", c)} icon="sortDesc" onSelect={() => doSort("value", "desc", c)} testId={`sort-value-desc-${i}`}>{fill(labels.sortValueDesc, { value: names[i] })}</Option>
                            <Option checked={isSort("value", "asc", c)} icon="sortAsc" onSelect={() => doSort("value", "asc", c)} testId={`sort-value-asc-${i}`}>{fill(labels.sortValueAsc, { value: names[i] })}</Option>
                        </React.Fragment>
                    ))}
                    {customItems ? <Option checked={isSort("custom", "asc")} icon="sortAsc" onSelect={() => doSort("custom", "asc")} testId="sort-custom">{labels.sortCustom}</Option> : null}
                    {customItems ? <Option checked={isSort("custom", "desc")} icon="sortDesc" onSelect={() => doSort("custom", "desc")} testId="sort-custom-desc">{labels.sortCustomDesc}</Option> : null}
                </Section>
                {sourceType === "date" ? (
                    <Section title={labels.groupBy} id="groupBy">
                        <div className="pk-subtitle">{labels.groupTimeline}</div>
                        <div className="pk-choice-grid">{CATALOG.timelineUnits.map(unitOption)}</div>
                        <div className="pk-subtitle">{labels.groupCyclic}</div>
                        <div className="pk-choice-grid">{CATALOG.cyclicUnits.map(unitOption)}</div>
                        <Option checked={!grouping} onSelect={() => regroup(null)} testId="group-none">{labels.groupNone}</Option>
                    </Section>
                ) : null}
                {sourceType === "number" ? (
                    <Section title={labels.bins} id="bins">
                        <BinForm grouping={grouping?.by === "bin" ? grouping : null} labels={labels} range={rangeOf?.(source) ?? null} locale={locale} onApply={(size, origin) => regroup("bin", size, origin)} onClear={grouping ? () => regroup(null) : null} />
                    </Section>
                ) : null}
                <Section title={labels.topN} id="topN">
                    <TopForm top={top} labels={labels} choices={topPick.choices} names={topPick.names} locale={locale} onApply={(t) => { close(); commit(setTopFilter(view, field, t, top), { step: "top", field: name }); }} />
                </Section>
                <Section title={labels.zones.filters} id="filters">
                    {/* a filter says what it keeps, in the accent colour, and can go right below */}
                    {hasFilter(view, field) ? (
                        <>
                            <Option icon="filter" tone="accent" onSelect={() => { close(); openFilter(field, chipRef.current); }} testId="open-filter">
                                {filterText(view, field, state, labels, locale)}
                            </Option>
                            <Option icon="x" onSelect={() => { close(); commit(removeFilters(view, field), { step: "filter", field: name }); }} testId="remove-filter">
                                {labels.removeFilter}
                            </Option>
                        </>
                    ) : (
                        <Option icon="filter" onSelect={() => { close(); openFilter(field, chipRef.current); }} testId="open-filter">
                            {labels.filter}
                        </Option>
                    )}
                    {/* a condition on a value of the field's items: "Sum of Revenue greater than 1000" */}
                    <More title={labels.valueFilter} open={Boolean(condition)}>
                        <ValueFilterForm condition={condition} labels={labels} choices={conditionPick.choices} names={conditionPick.names} locale={locale} onApply={(c) => { close(); commit(setValueFilter(view, field, c, condition), { step: "filter", field: name }); }} />
                    </More>
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
    const numeric = numericResult(spec, type);
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
    const formatOption = (f) => (
        <Option key={f} checked={spec.format === f} onSelect={() => set({ format: f })} testId={`format-${f}`}>
            {labels.formats[f] ?? f}
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
                <Section title={labels.aggregation} id="summarize">
                    <div className="pk-choice-grid">{common.map(aggOption)}</div>
                    {rare.length ? (
                        <More title={labels.moreStatistics} open={rare.includes(spec.agg)}>
                            <div className="pk-choice-grid">{rare.map(aggOption)}</div>
                        </More>
                    ) : null}
                </Section>
                {numeric ? (
                    <Section title={labels.showAs} id="showAs" info="showAs">
                        <div className="pk-choice-grid">
                            <Option checked={!spec.showAs} onSelect={() => set({ showAs: null })} testId="showas-none">{labels.showAsNone}</Option>
                            {COMMON_SHOW_AS.map(showAsOption)}
                        </div>
                        <More title={labels.moreCalculations} open={Boolean(spec.showAs && otherShowAs.includes(spec.showAs.type))}>
                            <div className="pk-choice-grid">{otherShowAs.map(showAsOption)}</div>
                        </More>
                        {spec.showAs && CATALOG.showAsAlongAxis.includes(spec.showAs.type) ? (
                            <div className="pk-setting-row">
                                <div className="pk-segmented pk-small" role="group" aria-label={labels.along}>
                                    <span className="pk-muted">{labels.along}</span>
                                    {["rows", "cols"].map((axis) => (
                                        <button key={axis} type="button" aria-pressed={spec.showAs.axis === axis} onClick={() => set({ showAs: { ...spec.showAs, axis } })}>
                                            {labels.zones[axis]}
                                        </button>
                                    ))}
                                </div>
                                <SettingInfo id="along" name={labels.along} />
                            </div>
                        ) : null}
                    </Section>
                ) : null}
                {numeric ? (
                    <Section title={labels.format} id="format">
                        <div className="pk-choice-grid">
                            <Option checked={!spec.format} onSelect={() => set({ format: null })}>{labels.formatAuto}</Option>
                            {FORMAT_CHOICES.map(formatOption)}
                        </div>
                        <More title={labels.moreFormats} open={MORE_FORMATS.includes(spec.format ?? "")}>
                            <div className="pk-choice-grid">{MORE_FORMATS.map(formatOption)}</div>
                        </More>
                    </Section>
                ) : null}
                {numeric ? (
                    <Section title={labels.conditional} id="highlight">
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
                <Section title={labels.rename} id="name">
                    <form className="pk-inline-form" onSubmit={(e) => { e.preventDefault(); set({ label: rename.trim() || null }); }}>
                        {/* the × gives the value its default name back at once (one undo step); the default is the placeholder */}
                        <ClearInput
                            type="text"
                            value={rename}
                            placeholder={valueLabel({ ...spec, label: null }, labels)}
                            onChange={setRename}
                            onClear={() => (spec.label ? commit(updateValue(view, index, { label: null }), { step: "value", field: name }) : undefined)}
                            clearLabel={labels.defaultName}
                            aria-label={labels.rename}
                            maxLength={200}
                            data-testid="value-name"
                        />
                        <button type="submit" className="pk-btn pk-primary">{labels.apply}</button>
                    </form>
                </Section>
                <Section title={labels.zones.filters} id="valueFilters">
                    <p className="pk-hint pk-menu-hint" data-testid="values-filter-hint">{labels.valuesFilterHint}</p>
                </Section>
                <MoveSection view={view} zone="values" index={index} count={view.values.length} labels={labels} commit={commit} close={close} text={name} type={type} />
            </div>
            <RemoveFoot labels={labels} onRemove={onRemove} close={close} />
        </>
    );
}
