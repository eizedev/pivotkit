/*
 * The menus of the chips, in levels (levels.jsx): the first level says in one row per topic what is
 * set, and a topic opens its own level in place. A field on Rows or Columns: sort (A to Z and Z to A
 * side by side, by a value), Filter (the values with their counts, a condition on the names, a
 * condition on a value written as a sentence), the grouping of a date or a number, Top items, Move
 * to. A value: Summarize by, Show as, Number format, Highlight, Name, Move to. The topics are data
 * (chip-topics.js); this module draws the levels that hold a form. Every choice applies at once; a
 * number typed applies a moment after the typing stops, a name on Enter or when the field is left,
 * and Escape in a field gives back what applies. Remove field is the menu's last item.
 */

import React, { useId, useMemo, useState } from "react";
import { CATALOG, fieldItems, fieldLabel } from "pivotkit-core";
import { ClearInput } from "./clear-input.jsx";
import { keyOf, ValueList } from "./filter.jsx";
import { HelpContext } from "./help.js";
import { Icon } from "./icons.jsx";
import { InfoButton } from "./info.jsx";
import { fill } from "./labels.js";
import { LevelMenu, MenuItem, useAppliedText, useLater } from "./levels.jsx";
import { numberText, parseNumber } from "./numbers.js";
import { groupingName, refLabel, valueLabel } from "./names.js";
import { TOP_COUNTS, axisTopics, valueTopics } from "./menu-topics.js";
import { filtersOf, groupField, groupingOf, sameRef, selectedItems, sourceOf } from "./view-ops.js";
import { binProblem, conditionKind, measureChoices, setItemFilter, setLabelFilter, setTopFilter, setValueFilter, updateValue, withMeasure } from "./menu-ops.js";

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
 *   testId: string, className?: string, shown?: string, shownClass?: string, onKeyDown?: (e: React.KeyboardEvent) => void,
 *   onBlur?: () => void, autoFocus?: boolean }} props
 */
function NumberField({ value, onChange, problem, label, testId, className = "pk-field-label", shown, shownClass, onKeyDown, onBlur, autoFocus }) {
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
                    onKeyDown={onKeyDown}
                    onBlur={onBlur}
                    aria-label={label}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? id : undefined}
                    data-autofocus={autoFocus ? "" : undefined}
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
 * The keys of a field that applies what is typed: Enter applies now; Escape gives back what applies,
 * or, when nothing was changed, goes back a level.
 * @param {{ now: () => void, restore: () => boolean, back: () => void }} actions
 */
const fieldKeys = ({ now, restore, back }) => (/** @type {React.KeyboardEvent} */ e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        now();
    } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!restore()) {
            back();
        }
    }
};

/**
 * The measure a top N or a value condition goes by: a select when the view has several values that
 * give numbers, else the one name. `index` is the position in `choices`.
 * @param {{ choices: Array<{ field: string | null, agg: string }>, names: string[], index: number,
 *   onChange: (index: number) => void, label: string, prefix?: string, testId: string }} props
 */
function MeasurePick({ choices, names, index, onChange, label, prefix, testId }) {
    if (choices.length < 2) {
        return (
            <span className="pk-by" data-testid={testId}>
                {prefix ? `${prefix} ${names[0]}` : names[0]}
            </span>
        );
    }
    return (
        <label className="pk-field-label pk-by-pick">
            {prefix ? <span>{prefix}</span> : <span className="pk-sr">{label}</span>}
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

/** The measures a filter of a field can go by, with the one it goes by now, and their names. */
function measuresOf(view, types, labels, ref) {
    const choices = withMeasure(measureChoices(view, (f) => types.get(f.toLowerCase())), ref);
    return { choices, names: choices.map((c) => refLabel(view, c, labels)) };
}

/**
 * The condition on the names of a field's items (text, or a number's label): the operator applies at
 * once, the text a moment after the typing stops; the × removes the condition.
 */
function LabelCondition({ view, field, kind, labels, commit, note, back, autoFocus = false }) {
    const label = filtersOf(view, field, ["label"])[0];
    const [op, setOp] = useState(label?.op ?? "");
    const apply = (o, value) => commit(setLabelFilter(view, field, o && value !== "" ? { op: o, value } : null), note);
    const text = useAppliedText(label?.value ?? "", (value) => apply(op, value));
    const title = kind === "number" ? labels.conditionNumber : labels.condition;
    return (
        <fieldset className="pk-condition">
            <legend>{title}</legend>
            <select
                value={op}
                onChange={(e) => {
                    setOp(e.target.value);
                    apply(e.target.value, text.text);
                }}
                aria-label={title}
                data-autofocus={autoFocus ? "" : undefined}
                data-testid="filter-condition-op"
            >
                <option value="">{labels.conditionNone}</option>
                {CATALOG.labelOps.map((o) => (
                    <option key={o} value={o}>
                        {labels.labelOps[o] ?? o}
                    </option>
                ))}
            </select>
            {op ? (
                <ClearInput
                    type="text"
                    value={text.text}
                    onChange={text.set}
                    onBlur={text.flush}
                    onKeyDown={fieldKeys({ now: text.flush, restore: text.restore, back })}
                    onClear={() => apply(op, "")}
                    clearLabel={labels.clearText}
                    aria-label={labels.conditionValue}
                    placeholder={labels.conditionValue}
                    maxLength={1000}
                    data-testid="filter-condition-text"
                />
            ) : null}
        </fieldset>
    );
}

/**
 * A condition on a value of the field's items, as a sentence: "Keep Month items whose Count of
 * Released is greater than 10". The value and the comparison apply at once, the numbers a moment
 * after the typing stops; "is anything" removes the condition.
 */
function ValueCondition({ view, field, types, labels, locale, commit, note, back, autoFocus = false }) {
    const condition = filtersOf(view, field, ["value"])[0];
    const { choices, names } = measuresOf(view, types, labels, condition?.by);
    const [by, setBy] = useState(() => choiceIndex(choices, condition?.by));
    const [op, setOp] = useState(condition?.op ?? "");
    const [first, setFirst] = useState(numberText(condition?.value, locale));
    const [second, setSecond] = useState(numberText(condition?.value2, locale));
    const later = useLater();
    const between = op === "between" || op === "notBetween";
    const a = readNumber(first, { required: false, labels, locale });
    const b = readNumber(second, { required: false, labels, locale });
    const apply = (next) => {
        const s = { by, op, first, second, ...next };
        const twin = s.op === "between" || s.op === "notBetween";
        const x = parseNumber(s.first, locale);
        const y = parseNumber(s.second, locale);
        if (!s.op) {
            if (condition) {
                commit(setValueFilter(view, field, null, condition), note);
            }
            return;
        }
        if (x === null || (twin && y === null)) {
            return;
        }
        commit(setValueFilter(view, field, { by: choices[s.by], op: s.op, value: x, ...(twin ? { value2: /** @type {number} */ (y) } : {}) }, condition), note);
    };
    const restore = () => {
        later.cancel();
        const was = [numberText(condition?.value, locale), numberText(condition?.value2, locale)];
        if (first === was[0] && second === was[1]) {
            return false;
        }
        setFirst(was[0]);
        setSecond(was[1]);
        return true;
    };
    const keys = fieldKeys({ now: later.now, restore, back });
    return (
        <fieldset className="pk-condition pk-value-condition" data-testid="value-condition">
            <legend>{labels.valueConditionTitle}</legend>
            <span className="pk-sentence">{fill(labels.keepWhose, { field: fieldLabel(field, labels.core) })}</span>
            <MeasurePick
                choices={choices}
                names={names}
                index={by}
                onChange={(i) => {
                    setBy(i);
                    apply({ by: i });
                }}
                label={labels.valueFilterBy}
                testId="value-filter-by"
            />
            <select
                value={op}
                onChange={(e) => {
                    setOp(e.target.value);
                    apply({ op: e.target.value });
                }}
                aria-label={labels.valueFilterOp}
                data-autofocus={autoFocus ? "" : undefined}
                data-testid="value-filter-op"
            >
                <option value="">{labels.valueOpAny}</option>
                {CATALOG.valueOps.map((o) => (
                    <option key={o} value={o}>
                        {labels.valueOps[o] ?? o}
                    </option>
                ))}
            </select>
            {op ? (
                <NumberField
                    value={first}
                    onChange={(t) => {
                        setFirst(t);
                        later.later(() => apply({ first: t }));
                    }}
                    onKeyDown={keys}
                    onBlur={later.now}
                    problem={a.problem}
                    label={labels.valueFilterNumber}
                    testId="value-filter-number"
                    className="pk-field-label pk-narrow-input"
                />
            ) : null}
            {op && between ? (
                <NumberField
                    value={second}
                    onChange={(t) => {
                        setSecond(t);
                        later.later(() => apply({ second: t }));
                    }}
                    onKeyDown={keys}
                    onBlur={later.now}
                    problem={b.problem}
                    label={`${labels.valueFilterTo} ${labels.valueFilterNumber}`}
                    shown={labels.valueFilterTo}
                    testId="value-filter-number2"
                    className="pk-field-label pk-narrow-input"
                />
            ) : null}
        </fieldset>
    );
}

/**
 * The Filter level: what it keeps now (the items picked, and the conditions in words), the values to
 * pick with their counts, then, folded each time the level opens, "More ways to filter": the
 * condition on the names and the condition on a value. Clear picks and Remove the conditions say what
 * they take away. Each change applies at once (one undo step). `hint` "conditions": opened from the
 * search on a condition, with "More ways to filter" open and the focus on its first field.
 */
function FilterLevel({ view, field, encoded, types, labels, locale, commit, back, hint }) {
    const info = useMemo(() => fieldItems(encoded, field, { view, locale, labels: labels.core }), [encoded, field, view, locale, labels]);
    const [more, setMore] = useState(hint === "conditions");
    const moreId = useId();
    if (!info) {
        return null;
    }
    const name = fieldLabel(field, labels.core);
    const note = { step: "filter", field: name };
    const all = info.items.map((i) => i.value);
    const picked = selectedItems(view, field, all);
    const selected = new Set(picked.map(keyOf));
    // a condition the type has none for (a loaded view's) still shows, so it can be taken off
    const kind = conditionKind(encoded, view, field) ?? (filtersOf(view, field, ["label"]).length ? "text" : null);
    const byNames = filtersOf(view, field, ["label"]).length > 0;
    const byValue = filtersOf(view, field, ["value"])[0];
    const conditions = [byNames ? labels.conditionOnNames : null, byValue ? fill(labels.conditionOnValue, { value: refLabel(view, byValue.by ?? null, labels) }) : null].filter(Boolean);
    const pickedText = fill(labels.itemsPicked, { shown: picked.length.toLocaleString(locale), total: all.length.toLocaleString(locale) });
    const itemsFiltered = picked.length < all.length || filtersOf(view, field, ["include"]).length > 0;
    return (
        <div className="pk-filter pk-filter-level">
            <div className="pk-level-result">
                <p role="status" data-testid="filter-result">
                    {conditions.length ? fill(labels.pickedPlus, { picked: pickedText, conditions: conditions.join(labels.listAnd) }) : pickedText}
                </p>
                {itemsFiltered ? (
                    <button type="button" className="pk-link pk-link-button" onClick={() => commit(setItemFilter(view, field, all, all), note)} data-testid="filter-clear-picks">
                        {labels.clearPicks}
                    </button>
                ) : null}
                {conditions.length ? (
                    <button type="button" className="pk-link pk-link-button" onClick={() => commit(setValueFilter(setLabelFilter(view, field, null), field, null), note)} data-testid="filter-remove-conditions">
                        {labels.removeConditions}
                    </button>
                ) : null}
            </div>
            <ValueList items={info.items} selected={selected} onChange={(next) => commit(setItemFilter(view, field, all.filter((v) => next.has(keyOf(v))), all), note)} labels={labels} locale={locale} autoFocus={!more}>
                <button type="button" className="pk-more-filters" aria-expanded={more} aria-controls={moreId} onClick={() => setMore(!more)} data-testid="filter-more">
                    <Icon name={more ? "chevronDown" : "chevronRight"} size={16} />
                    {labels.moreFilters}
                    {conditions.length && !more ? <span className="pk-section-mark">{" ●"}</span> : null}
                </button>
                {more ? (
                    <div id={moreId} className="pk-more-filters-body">
                        {kind ? <LabelCondition view={view} field={field} kind={kind} labels={labels} commit={commit} note={note} back={back} autoFocus={hint === "conditions"} /> : null}
                        <ValueCondition view={view} field={field} types={types} labels={labels} locale={locale} commit={commit} note={note} back={back} autoFocus={hint === "conditions" && !kind} />
                    </div>
                ) : null}
            </ValueList>
        </div>
    );
}

/**
 * The Top items level: Off, Top 3, Top 5, Top 10, or a count of one's own, largest or smallest
 * first ("Top N…"), by a value when the view has several. A choice applies at once, the count a
 * moment after the typing stops.
 */
function TopLevel({ view, field, types, labels, locale, commit, back }) {
    const top = filtersOf(view, field, ["top"])[0];
    const { choices, names } = measuresOf(view, types, labels, top?.by);
    const [by, setBy] = useState(() => choiceIndex(choices, top?.by));
    const quick = top && !top.bottom && TOP_COUNTS.includes(top.count) ? top.count : null;
    const [own, setOwn] = useState(Boolean(top) && quick === null);
    const [bottom, setBottom] = useState(Boolean(top?.bottom));
    const [count, setCount] = useState(numberText(top?.count ?? 10, locale));
    const later = useLater();
    const counted = readNumber(count, { kind: "count", labels, locale });
    const name = fieldLabel(field, labels.core);
    const set = (t) => commit(setTopFilter(view, field, t, top), { step: "top", field: name });
    const applyOwn = (next) => {
        const s = { bottom, count, by, ...next };
        const n = readNumber(s.count, { kind: "count", labels, locale }).value;
        if (n !== null) {
            set({ count: n, bottom: s.bottom, by: choices[s.by] });
        }
    };
    const groupName = useId();
    const radio = (id, text, checked, onPick) => (
        <label className="pk-radio">
            <input type="radio" name={groupName} checked={checked} onChange={onPick} data-autofocus={checked ? "" : undefined} data-testid={`top-${id}`} />
            <span>{text}</span>
        </label>
    );
    return (
        <div className="pk-level-form">
            <div role="radiogroup" aria-label={labels.topN} className="pk-radios">
                {radio("off", labels.off, !top && !own, () => {
                    setOwn(false);
                    set(null);
                })}
                {TOP_COUNTS.map((n) => (
                    <React.Fragment key={n}>
                        {radio(String(n), fill(labels.topBadge, { count: n.toLocaleString(locale) }), !own && quick === n, () => {
                            setOwn(false);
                            set({ count: n, bottom: false, by: choices[by] });
                        })}
                    </React.Fragment>
                ))}
                {radio("own", labels.topOwn, own, () => {
                    setOwn(true);
                    applyOwn({});
                })}
            </div>
            {own ? (
                <div className="pk-inline-form">
                    <div className="pk-segmented pk-small" role="group" aria-label={labels.topN}>
                        {[false, true].map((b) => (
                            <button
                                key={String(b)}
                                type="button"
                                aria-pressed={bottom === b}
                                onClick={() => {
                                    setBottom(b);
                                    applyOwn({ bottom: b });
                                }}
                                data-testid={b ? "top-bottom" : "top-top"}
                            >
                                {b ? labels.bottom : labels.top}
                            </button>
                        ))}
                    </div>
                    <NumberField
                        value={count}
                        onChange={(t) => {
                            setCount(t);
                            later.later(() => applyOwn({ count: t }));
                        }}
                        onKeyDown={fieldKeys({
                            now: later.now,
                            restore: () => {
                                later.cancel();
                                const was = numberText(top?.count ?? 10, locale);
                                if (count === was) {
                                    return false;
                                }
                                setCount(was);
                                return true;
                            },
                            back
                        })}
                        onBlur={later.now}
                        problem={counted.problem}
                        label={labels.topCount}
                        testId="top-count"
                        className="pk-field-label pk-narrow-input"
                    />
                </div>
            ) : null}
            <div className="pk-inline-form">
                <MeasurePick choices={choices} names={names} index={by} onChange={(i) => {
                        setBy(i);
                        if (top) {
                            set({ count: top.count, bottom: Boolean(top.bottom), by: choices[i] });
                        }
                    }} label={labels.topBy} prefix={labels.topBy} testId="top-by" />
            </div>
        </div>
    );
}

/**
 * Number ranges: their size and where they start (Excel's "Starting at"), applied together with
 * Apply (the field becomes another field, so the menu closes); Off takes them away. An empty start is
 * 0, as its placeholder says; a start whose ranges could not hold the field's numbers (`range`, see
 * binProblem) is refused with a note under the input.
 */
function BinsLevel({ view, field, labels, locale, range, regroup, back }) {
    const grouping = groupingOf(view, field);
    const bins = grouping?.by === "bin" ? grouping : null;
    const [size, setSize] = useState(numberText(bins?.size, locale));
    const [start, setStart] = useState(numberText(bins?.origin, locale));
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
                // an empty size takes the ranges away, as Remove ranges does
                if (bins && size.trim() === "") {
                    regroup(null);
                    return;
                }
                setTried(true);
                if (n !== null && s !== null && !far) {
                    regroup("bin", n, s);
                }
            }}
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    back();
                }
            }}
        >
            <NumberField value={size} onChange={setSize} problem={sized.problem} label={labels.binSize} shown={labels.binSize} testId="bin-size" autoFocus />
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
            <button type="submit" className="pk-btn pk-primary" disabled={far} data-testid="bin-apply">
                {labels.apply}
            </button>
            {bins ? (
                <button type="button" className="pk-btn" onClick={() => regroup(null)} data-testid="bin-off">
                    {labels.binsOff}
                </button>
            ) : null}
        </form>
    );
}

/** A value's name: applies on Enter or when the field is left; the × gives the default name back at once. */
function NameLevel({ view, index, labels, commit, back }) {
    const spec = view.values[index];
    const name = valueLabel(spec, labels);
    const note = { step: "value", field: name };
    const text = useAppliedText(spec.label ?? "", (t) => commit(updateValue(view, index, { label: t.trim() || null }), note), 0);
    return (
        <div className="pk-inline-form pk-level-form">
            {/* the default is the placeholder */}
            <ClearInput
                type="text"
                value={text.text}
                placeholder={valueLabel({ ...spec, label: null }, labels)}
                onChange={text.set}
                onBlur={text.flush}
                onKeyDown={fieldKeys({
                    now: () => {
                        text.flush();
                        back();
                    },
                    restore: text.restore,
                    back
                })}
                onClear={() => (spec.label ? commit(updateValue(view, index, { label: null }), note) : undefined)}
                clearLabel={labels.defaultName}
                aria-label={labels.rename}
                maxLength={200}
                data-autofocus=""
                data-testid="value-name"
            />
            <p className="pk-hint">{labels.nameHint}</p>
        </div>
    );
}

/**
 * The head of a chip menu: the field's name, with its "i" (the field's description and its "Learn
 * more", and `extra`, a paragraph of the report's own after it) when there is one.
 * @param {{ name: string, info?: { description: string, href?: string }, extra?: string | null, labels: any }} props
 */
function MenuHead({ name, info, extra, labels }) {
    const text = (
        <>
            {info?.description}
            {info?.href ? (
                <>
                    {" "}
                    <a href={info.href} target="_blank" rel="noopener noreferrer" className="pk-learn-more">
                        {labels.learnMore}
                    </a>
                </>
            ) : null}
            {info?.description && extra ? (
                <>
                    <br />
                    <br />
                </>
            ) : null}
            {extra}
        </>
    );
    return (
        <div className="pk-level-name">
            <span className="pk-level-name-text" data-testid="menu-head">
                {name}
            </span>
            {info?.description || extra ? <InfoButton info={{ description: /** @type {any} */ (text) }} name={name} labels={labels} className="pk-menu-info" testId="menu-info" /> : null}
        </div>
    );
}

/** The last item of a chip's menu: takes the field (or value) out of the report. */
function RemoveItem({ labels, onRemove, close }) {
    return (
        <MenuItem
            id="menu-remove"
            text={labels.remove}
            icon="trash"
            danger
            onSelect={() => {
                close();
                onRemove();
            }}
        />
    );
}

/** A choice of a topic, applied: the menu closes first when the chip is replaced or moves away. */
const picker = (commit, close) => (/** @type {import("./menu-topics.js").Choice} */ choice) => {
    const next = choice.change?.();
    if (choice.closes) {
        close();
    }
    if (next) {
        commit(next.view, next.note);
    }
};

/** The menu of a chip on Rows or Columns. */
export function AxisMenu({ view, zone, index, field, types, labels, commit, close, onRemove, defaultsOf, rangeOf, locale, info, state, encoded }) {
    const source = sourceOf(view, field);
    const topics = axisTopics({ view, zone, index, field, types, labels, locale, state, defaultsOf });
    const regroup = (unit, size, origin) => {
        close();
        const sourceName = fieldLabel(source, labels.core);
        const grouped = unit ? groupingName(sourceName, unit, labels, size) : null;
        commit(groupField(view, field, unit, { size, origin, name: grouped ?? undefined }).view, { step: "group", field: sourceName });
    };
    const panel = (id, back, hint) =>
        id === "filter" ? (
            <FilterLevel view={view} field={field} encoded={encoded} types={types} labels={labels} locale={locale} commit={commit} back={back} hint={hint} />
        ) : id === "top" ? (
            <TopLevel view={view} field={field} types={types} labels={labels} locale={locale} commit={commit} back={back} />
        ) : id === "bins" ? (
            <BinsLevel view={view} field={field} labels={labels} locale={locale} range={rangeOf?.(source) ?? null} regroup={regroup} back={back} />
        ) : null;
    const name = fieldLabel(field, labels.core);
    return (
        <LevelMenu
            name={name}
            labels={labels}
            locale={locale}
            topics={topics}
            close={close}
            onPick={picker(commit, close)}
            panel={panel}
            search
            // the same name as the chip and the levels' titles ("Date by month"); the "i" is the source field's
            head={<MenuHead name={name} info={info} labels={labels} />}
            foot={<RemoveItem labels={labels} onRemove={onRemove} close={close} />}
        />
    );
}

/** The menu of a value chip. */
export function ValueMenu({ view, index, types, labels, commit, close, onRemove, defaultsOf, info, locale = "en-US" }) {
    const { explain } = React.useContext(HelpContext);
    const name = valueLabel(view.values[index], labels);
    const topics = valueTopics({ view, index, types, labels, locale, defaultsOf });
    return (
        <LevelMenu
            name={name}
            labels={labels}
            locale={locale}
            topics={topics}
            close={close}
            onPick={picker(commit, close)}
            panel={(id, back) => (id === "name" ? <NameLevel view={view} index={index} labels={labels} commit={commit} back={back} /> : null)}
            search
            // the "i" at the top: the field's description, and (with the explanations on) why a value has no filter
            head={<MenuHead name={name} info={info} extra={explain ? labels.settingInfo.valuesFilter : null} labels={labels} />}
            foot={<RemoveItem labels={labels} onRemove={onRemove} close={close} />}
        />
    );
}
