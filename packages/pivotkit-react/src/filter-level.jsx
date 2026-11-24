/*
 * The Filter level of a field's menu (chip-menus.jsx), on Rows, Columns and in Filters, top to
 * bottom: a summary card that stays in view (what shows, why the rest does not, the rows and the
 * data's dates; red with the reason when nothing shows; Reset filter), then three foldable sections.
 * "Quick choices" for a date along the time line (All, This year, Last [N] years, months, days: only
 * those that keep a row, each with the data's share of its range and its rows; a line names the ones
 * not offered; "Counted back from" today or the latest record when the data end before today), or
 * "Years combined" for a grouping that repeats every year (month of the year): a toggle per year,
 * written as whole-year comparisons. "Pick items": the values with their counts, those a rule leaves
 * out in a folded tail, their ticks kept. "Rules": sentences that all apply together, each with an
 * "i" that explains it with an example and a line with what it keeps; the quick choice stands among
 * them as a line to read, not a rule. The first rule folds Pick items and opens Rules, the last one
 * going does the reverse, a fold by hand wins afterwards. Every change applies at once (one undo step
 * each); a number a moment after the typing stops, Escape in a field gives back what applies. The
 * quick choices are in quick-choices.jsx. Loaded with the menus (menus.js).
 */

import React, { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { CATALOG, LIMITS, fieldLabel, formatter } from "pivotkit-core";
import { LimitsContext, itemsOf } from "./limits-context.js";
import { ClearInput } from "./clear-input.jsx";
import { useIsoLayoutEffect } from "./iso.js";
import { activeIn, useFormName } from "./dom.js";
import { FILTER_LIST_MAX, keyOf, ValueList } from "./filter.jsx";
import { QuickChoices, inMore } from "./quick-choices.jsx";
import { HelpContext } from "./help.js";
import { Icon } from "./icons.jsx";
import { fill, plural } from "./labels.js";
import { useAppliedText, useLater } from "./levels.jsx";
import { MeasurePick, NumberField, choiceIndex, fieldKeys, measuresOf, readNumber } from "./menu-fields.jsx";
import { dayText, isoDay, plainRange, refLabel, relativeText, yearText } from "./names.js";
import { numberText, parseNumber } from "./numbers.js";
import { LayerContext, Popover } from "./popover.jsx";
import { RULE_OPS, dateSpan, filtersOf, hiddenNot, opOf, ruleOp, sameRef, searchItems, selectedItems, sourceOf } from "./view-ops.js";
import {
    ITEM_RULE_TYPES,
    RULES_MAX,
    RULE_TYPES,
    combinedYearsText,
    conditionKind,
    itemTotals,
    keepsBlanks,
    quickChoice,
    relativeRule,
    removeRules,
    resetFilter,
    ruleKind,
    ruleText,
    setItemFilter,
    setRule,
    setRuleBlanks,
    setYearsCombined,
    textOn,
    textRule
} from "./menu-ops.js";

const twin = (op) => op === "between" || op === "notBetween";
/**
 * What a row's waiting value applies through: the row's latest `rule`, `apply` and `unset`, so a value
 * that applies later (a moment after the typing, or when its field is left after another rule was
 * added) goes into the row it is in now, a held one too (#245).
 * @template T
 * @param {T} props
 * @returns {React.MutableRefObject<T>}
 */
function useLatest(props) {
    const ref = useRef(props);
    useEffect(() => {
        ref.current = props;
    });
    return ref;
}

/**
 * A change that empties a value field (or leaves only spaces): its rule comes off, its row waits for a
 * new value. A comparison changed alone (to "is between") keeps the rule until its value is there.
 * @param {Record<string, unknown>} patch
 */
const emptied = (patch) =>
    ["a", "b", "count"].some((k) => {
        const v = patch[k];
        return typeof v === "string" && v.trim() === "";
    });
/** Rules as a text that does not depend on the order of their keys (normalize() writes its own order). */
const rulesKeyOf = (rules) => JSON.stringify(rules, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
/** The kind of row a rule is: the item itself (a comparison or a relative range), its total, its name. */
const rowKind = (f) => (!editable(f) ? "fixed" : f.type === "value" ? "total" : f.type === "text" ? "name" : "item");
/** The units of a rule's relative range ("is in the last [5] [years]"). */
const RANGE_UNITS = Object.freeze(["year", "month", "day"]);
/**
 * Whether a rule's row writes a relative range: one the chip says by its periods (names.js
 * `plainRange`), narrowed to what the row has fields for: the last N years, months or days, the
 * current one included.
 */
const ruleRange = (f) => plainRange(f) && (f.direction ?? "last") === "last" && f.includeCurrent !== false && RANGE_UNITS.includes(f.unit);
/**
 * Whether the rows can edit a rule: not one whose `not` they have no word for, not a relative range
 * they do not write (a loaded view's next, this, before, rolling, hours, weeks, quarters, that is not
 * the quick choice), not a comparison of dates by another precision than the day.
 */
const editable = (f) => !hiddenNot(f) && (f.type !== "relative" || ruleRange(f)) && (f.type !== "compare" || (f.precision ?? "day") === "day");
/** A grouping's items above this many are picked from a searchable list, not a native select. */
const PICKER_MIN = 13;

/** The noun of a field's items by its grouping: "months", "years", "values" for a number, "items". */
function nounOf(fk, labels) {
    const unit = fk.unit;
    const key = unit === null ? (fk.item === "number" ? "value" : fk.item === "date" ? "date" : "item") : unit === "bin" ? "range" : unit === "day" ? "day" : unit.replace(/^year(.)/, (_m, c) => c.toLowerCase());
    return Object.hasOwn(labels.nouns, key) ? labels.nouns[key] : labels.nouns.item;
}

/** Rows per dictionary code of a column. */
function countsOf(column) {
    const counts = new Float64Array(column.dict.length);
    for (let i = 0; i < column.codes.length; i++) {
        if (column.codes[i] >= 0) {
            counts[column.codes[i]]++;
        }
    }
    return counts;
}

/** The years of a date column with their rows, ascending. */
function yearsOf(column, counts) {
    const rows = new Map();
    column.dict.forEach((v, code) => {
        if (typeof v === "number") {
            const y = new Date(v).getUTCFullYear();
            rows.set(y, (rows.get(y) ?? 0) + counts[code]);
        }
    });
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([year, n]) => ({ year, rows: n }));
}

/**
 * The items a quick choice or a rule leaves out, at the end of the list: a folded group that names
 * them with their count, muted rows with their ticks kept inside; a search that finds some shows them.
 */
function LeftOut({ out, row, searching, labels, locale }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const shown = open || searching;
    const list = useRef(/** @type {HTMLUListElement | null} */ (null));
    // opened: its first items in view, not below the list's edge
    useEffect(() => {
        if (open) {
            list.current?.firstElementChild?.scrollIntoView?.({ block: "nearest" });
        }
    }, [open]);
    return (
        <li className="pk-values-tail">
            <button type="button" className="pk-tail-toggle" aria-expanded={shown} aria-controls={id} onClick={() => setOpen(!shown)} data-testid="tail-toggle">
                <Icon name={shown ? "chevronDown" : "chevronRight"} size={14} />
                <span>{fill(plural(labels.tailOut, out.length, { lang: labels.lang, locale }), { count: out.length.toLocaleString(locale) })}</span>
            </button>
            {shown ? (
                <ul ref={list} id={id} role="list" className="pk-tail-list" data-testid="tail-list">
                    {out.slice(0, FILTER_LIST_MAX).map(row)}
                </ul>
            ) : null}
        </li>
    );
}

/**
 * A foldable section of the level: a header button with its state, an action beside it, its body.
 * @param {{ id: string, title: string, state?: React.ReactNode, open: boolean, onToggle: () => void, action?: React.ReactNode, children: React.ReactNode }} props
 */
function FoldSection({ id, title, state, open, onToggle, action, children }) {
    const bodyId = useId();
    return (
        <section className="pk-fsection" data-testid={`fsection-${id}`}>
            <div className="pk-fsection-head">
                <button type="button" className="pk-fsection-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle} data-testid={`section-${id}`}>
                    <Icon name={open ? "chevronDown" : "chevronRight"} size={16} />
                    <span className="pk-fsection-title">{title}</span>
                    {state ? <span className="pk-fsection-state">{state}</span> : null}
                </button>
                {action}
            </div>
            {open ? (
                <div className="pk-fsection-body" id={bodyId} data-testid={`${id}-body`}>
                    {children}
                </div>
            ) : null}
        </section>
    );
}

/**
 * The action in a section's header (Pick all again, the rules' Remove): a short word, said in full
 * (`label`) to a screen reader and on hover.
 * @param {{ text: string, label: string, disabled: boolean, onClick: () => void, testId: string }} props
 */
function SectionAction({ text, label, disabled, onClick, testId }) {
    return (
        <button type="button" className="pk-action" disabled={disabled} aria-label={label} title={label} onClick={onClick} data-testid={testId}>
            {text}
        </button>
    );
}

/**
 * The summary card: the first line in bold (all shown, some shown, nothing shown), the reasons with
 * their counts (or, with nothing shown, the one reason and the nearest value), the rows and the data's
 * dates, Reset filter at the right.
 */
function Summary({ ctx, state }) {
    const { labels, locale, view, field } = ctx;
    const { shown, total, noun, unpicked, byQuick, byRules, byTotals, rows, rowsAll, span, yearsText, empty, quickWords } = state;
    const number = (n) => n.toLocaleString(locale);
    const lang = { lang: labels.lang, locale };
    const head = shown === 0 ? labels.summaryNone : shown === total ? fill(labels.summaryAll, { total: number(total), noun: plural(noun, total, lang) }) : fill(labels.summarySome, { shown: number(shown), total: number(total), noun: plural(noun, total, lang) });
    const why = [];
    if (shown === 0 && empty) {
        why.push(empty);
    } else {
        if (unpicked) {
            why.push(fill(labels.summaryPicks, { count: number(unpicked) }));
        }
        if (byQuick) {
            why.push(fill(labels.summaryQuick, { count: number(byQuick), quick: quickWords }));
        }
        // the form by the number of rules, the count the items they leave out
        if (byRules) {
            why.push(fill(plural(labels.summaryRules, state.itemRules, lang), { items: number(byRules) }));
        }
        if (byTotals) {
            why.push(fill(plural(labels.summaryTotals, state.totalRules, lang), { items: number(byTotals) }));
        }
    }
    const meta = [fill(labels.summaryRows, { rows: number(rows), total: number(rowsAll) })];
    if (span) {
        meta.push(fill(labels.summaryData, { range: `${dayText(isoDay(span.min), locale)} – ${dayText(isoDay(span.max), locale)}` }));
    }
    if (yearsText) {
        meta.push(yearsText);
    }
    return (
        <div className="pk-filter-summary">
            <div className={`pk-summary-card${shown === 0 ? " pk-summary-empty" : ""}`} role="status" data-testid="filter-summary">
                <p className="pk-summary-head" data-testid="filter-summary-head">
                    {head}
                </p>
                <p className="pk-summary-why" data-testid="filter-summary-why">
                    {why.length ? why.join(" · ") : state.rules ? labels.summaryKept : quickWords ? fill(labels.summaryQuickOnly, { quick: quickWords }) : labels.summaryOk}
                </p>
                <p className="pk-summary-meta" data-testid="filter-summary-meta">
                    {meta.join(" · ")}
                </p>
                <button type="button" className="pk-action pk-summary-reset" disabled={!state.canReset} onClick={() => ctx.act(resetFilter(view, field), "section-picks")} data-testid="filter-reset">
                    {labels.resetFilter}
                </button>
            </div>
        </div>
    );
}

/**
 * The years a cyclic grouping combines ("month of the year"): a toggle per year of the data with its
 * rows; the years ticked are written as whole-year comparisons (the last one cannot go).
 */
function YearsCombined({ ctx, years, on }) {
    const { view, field, labels, locale, commit, note, noun } = ctx;
    const all = years.map((y) => y.year);
    const toggle = (year) => {
        const next = on.includes(year) ? on.filter((y) => y !== year) : [...on, year].sort((a, b) => a - b);
        commit(setYearsCombined(view, field, next, all), note);
    };
    return (
        <>
            <p className="pk-hint pk-years-hint">{fill(labels.yearsCombinedHint, { noun: plural(noun, 1, { lang: labels.lang, locale }) })}</p>
            <div className="pk-years" role="group" aria-label={labels.yearsCombined} data-testid="years-combined">
                {years.map((y) => {
                    const pressed = on.includes(y.year);
                    return (
                        <button key={y.year} type="button" className="pk-year-chip" aria-pressed={pressed} disabled={pressed && on.length === 1} onClick={() => toggle(y.year)} data-testid={`year-${y.year}`}>
                            {pressed ? <Icon name="check" size={12} /> : null}
                            <span>{yearText(y.year, locale)}</span>
                            <span className="pk-quick-rows">{fill(labels.quickRows, { rows: y.rows.toLocaleString(locale) })}</span>
                        </button>
                    );
                })}
            </div>
            {on.length === 1 ? <p className="pk-hint">{fill(labels.yearsCombinedOne, { year: yearText(on[0], locale) })}</p> : null}
        </>
    );
}

/**
 * A grouping's item picked from a searchable list: a button with the current item opens a popover
 * with a search field and a listbox (the arrow keys move, Enter picks, Escape closes); the first
 * FILTER_LIST_MAX matches are listed. For lists too long for a native select.
 */
function ItemPicker({ items, value, onChange, label, testId, labels, locale }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const anchor = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const listId = useId();
    const searchName = useFormName();
    const found = searchItems(items, query);
    const matching = found.slice(0, FILTER_LIST_MAX);
    const current = items.find((i) => String(i.value) === value);
    const show = () => {
        setQuery("");
        setActive(Math.max(0, items.findIndex((i) => String(i.value) === value)));
        setOpen(true);
    };
    const close = () => setOpen(false);
    const pick = (item) => {
        close();
        onChange(String(item.value));
    };
    const optionId = (i) => `${listId}-${i}`;
    const onKeyDown = (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.min(matching.length - 1, Math.max(0, a + (e.key === "ArrowDown" ? 1 : -1))));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (matching[active]) {
                pick(matching[active]);
            }
        } else if (e.key === "Escape") {
            // closes the list alone (the level stays), the focus back on the button
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    };
    return (
        <span className="pk-picker">
            <button
                ref={anchor}
                type="button"
                className="pk-picker-button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={label}
                onClick={() => (open ? close() : show())}
                onKeyDown={(e) => {
                    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                        e.preventDefault();
                        show();
                    }
                }}
                data-testid={testId}
            >
                {current ? current.label : value || labels.ruleValue}
            </button>
            <Popover open={open} anchor={anchor} onClose={close} label={label} className="pk-picker-pop">
                <input
                    type="search"
                    name={searchName}
                    role="combobox"
                    className="pk-picker-search"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    aria-label={labels.pickerSearch}
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={matching[active] ? optionId(active) : undefined}
                    aria-autocomplete="list"
                    autoComplete="off"
                    placeholder={labels.pickerSearch}
                    data-autofocus=""
                    data-testid="picker-search"
                />
                <ul role="listbox" id={listId} className="pk-picker-list" aria-label={label} data-testid="picker-list">
                    {matching.map((item, i) => (
                        <li
                            key={String(item.value)}
                            id={optionId(i)}
                            role="option"
                            aria-selected={String(item.value) === value}
                            className={`pk-picker-option${i === active ? " pk-picker-active" : ""}`}
                            onMouseMove={() => setActive(i)}
                            onClick={() => pick(item)}
                            data-testid="picker-option"
                        >
                            <span>{item.label}</span>
                            <span className="pk-count">{item.count.toLocaleString(locale)}</span>
                        </li>
                    ))}
                    {matching.length ? null : <li className="pk-hint pk-picker-none">{labels.pickerNone}</li>}
                </ul>
                <p className="pk-hint pk-picker-count" aria-live="polite" data-testid="picker-count">
                    {fill(labels.pickerMatch, { count: found.length.toLocaleString(locale), total: items.length.toLocaleString(locale) })}
                </p>
            </Popover>
        </span>
    );
}

/**
 * A rule on the item itself: "Released (Year) [is from] [2022]", "Price [is between] [10] and
 * [20]", for dates also "Released [is in the last] [5] [years]" (a relative range). The value is a
 * number typed, a day, or one of a grouping's items. Applies once it is complete; a value emptied
 * takes the rule off and leaves the row for a new value, as on the name.
 */
function ItemRule({ rule, ctx, apply, unset, first }) {
    const { field, labels, locale, fk, items } = ctx;
    const narrow = useContext(LayerContext).size === "narrow";
    const words = fk.dates ? labels.dateOps : labels.valueOps;
    const ops = fk.dates ? [...RULE_OPS.compare, "last"] : RULE_OPS.compare;
    const textOf = (v) => (v === undefined ? "" : fk.item === "number" ? numberText(v, locale) : String(v));
    const compared = rule?.type === "compare" ? rule : null;
    const ranged = rule?.type === "relative" ? rule : null;
    const [s, setS] = useState(() => ({
        op: ranged ? "last" : compared ? ruleOp(compared) : ">=",
        a: textOf(compared?.value),
        b: textOf(compared?.value2),
        count: numberText(ranged?.count ?? 5, locale),
        unit: ranged?.unit ?? "year"
    }));
    const later = useLater();
    const latest = useLatest({ rule, apply, unset });
    const formName = useFormName();
    const read = (text) => (fk.item === "number" ? parseNumber(text, locale) : fk.item === "date" ? (/^\d{4,}-\d{2}-\d{2}$/.test(text) ? text : null) : text === "" ? null : Number(text));
    const entryOf = (x) => {
        if (x.op === "last") {
            const n = readNumber(x.count, { kind: "count", max: CATALOG.relativeMaxCount, labels, locale }).value;
            // a loaded range's not and blanks stay as they are
            return n !== null ? { ...relativeRule(field, { unit: x.unit, count: n, anchor: ranged?.anchor }), ...(ranged ? { not: ranged.not, blanks: ranged.blanks } : {}) } : null;
        }
        const [a, b] = [read(x.a), read(x.b)];
        return a === null || (twin(x.op) && b === null) ? null : { field, type: "compare", ...opOf(x.op), value: a, ...(twin(x.op) ? { value2: b } : {}), blanks: compared?.blanks ?? "exclude" };
    };
    const change = (patch, wait = false) => {
        const next = { ...s, ...patch };
        setS(next);
        const run = () => {
            const entry = entryOf(next);
            if (entry) {
                latest.current.apply(entry);
            } else if (latest.current.rule && emptied(patch)) {
                // a value emptied takes the rule off, as on the name (#244)
                latest.current.unset();
            }
        };
        if (wait) {
            later.later(run);
        } else {
            later.cancel();
            run();
        }
    };
    const restore = () => {
        later.cancel();
        const was = { a: textOf(compared?.value), b: textOf(compared?.value2), count: numberText(ranged?.count ?? 5, locale) };
        if (s.a === was.a && s.b === was.b && s.count === was.count) {
            return false;
        }
        setS({ ...s, ...was });
        return true;
    };
    const keys = fieldKeys({ now: later.now, restore, back: ctx.back });
    const value = (key, label, testId) => {
        if (fk.item === "number") {
            const problem = readNumber(s[key], { required: false, labels, locale }).problem;
            return <NumberField value={s[key]} onChange={(t) => change({ [key]: t }, true)} onKeyDown={keys} onBlur={later.now} problem={problem} label={label} testId={testId} className="pk-field-label pk-narrow-input" />;
        }
        if (fk.item === "date") {
            return <input type="date" name={`${formName}-${key}`} value={s[key]} onChange={(e) => change({ [key]: e.target.value })} aria-label={label} data-testid={testId} />;
        }
        // a grouping: one of its items ("2022", "Mar 2025"), or the view's own when the data has it no more
        const listed = items.filter((i) => typeof i.value === "number");
        const own = s[key] !== "" && !listed.some((i) => String(i.value) === s[key]);
        if (listed.length >= PICKER_MIN && !narrow) {
            return <ItemPicker items={own ? [{ value: Number(s[key]), label: s[key], count: 0 }, ...listed] : listed} value={s[key]} onChange={(v) => change({ [key]: v })} label={label} testId={testId} labels={labels} locale={locale} />;
        }
        return (
            <select name={`${formName}-${key}`} value={s[key]} onChange={(e) => change({ [key]: e.target.value })} aria-label={label} data-testid={testId}>
                <option value="" disabled>
                    {labels.ruleValue}
                </option>
                {own ? <option value={s[key]}>{s[key]}</option> : null}
                {listed.map((i) => (
                    <option key={String(i.value)} value={String(i.value)}>
                        {i.label}
                    </option>
                ))}
            </select>
        );
    };
    const label = fk.item === "date" ? labels.ruleDate : labels.ruleValue;
    // "im letzten Monat", "in den letzten 3 Monaten": the words follow the count
    const lang = { lang: labels.lang, locale };
    const counted = readNumber(s.count, { kind: "count", max: CATALOG.relativeMaxCount, labels, locale });
    const many = counted.value ?? 2;
    return (
        <>
            <span className="pk-rule-subject">{fieldLabel(field, labels.core)}</span>
            <select className="pk-rule-op" name={`${formName}-op`} value={s.op} onChange={(e) => change({ op: e.target.value })} aria-label={labels.valueFilterOp} data-autofocus={first ? "" : undefined} data-testid="rule-item-op">
                {ops.map((o) => (
                    <option key={o} value={o}>
                        {o === "last" ? plural(labels.lastOp, many, lang) : words[o] ?? o}
                    </option>
                ))}
            </select>
            {s.op === "last" ? (
                <>
                    <NumberField
                        value={s.count}
                        onChange={(t) => change({ count: t }, true)}
                        onKeyDown={keys}
                        onBlur={later.now}
                        problem={counted.problem}
                        label={labels.quickCount[s.unit]}
                        testId="rule-last-count"
                        className="pk-field-label pk-count-input"
                    />
                    <select name={`${formName}-unit`} value={s.unit} onChange={(e) => change({ unit: e.target.value })} aria-label={labels.ruleUnit} data-testid="rule-last-unit">
                        {RANGE_UNITS.map((u) => (
                            <option key={u} value={u}>
                                {plural(labels.ruleUnits[u], many, lang)}
                            </option>
                        ))}
                    </select>
                </>
            ) : (
                <>
                    {value("a", label, "rule-item-value")}
                    {twin(s.op) ? (
                        <>
                            <span>{labels.valueFilterTo}</span>
                            {value("b", `${labels.valueFilterTo} ${label}`, "rule-item-value2")}
                        </>
                    ) : null}
                    {/* a blank item passes no comparison: said where "is not" would suggest otherwise, unless the rules keep the blanks */}
                    {(s.op === "!=" || s.op === "notBetween") && (compared?.blanks ?? (ctx.keepBlanks ? "include" : "exclude")) === "exclude" ? (
                        <span className="pk-hint pk-rule-note" data-testid="rule-blanks">
                            {labels.blanksOut}
                        </span>
                    ) : null}
                </>
            )}
        </>
    );
}

/**
 * A rule on the item's total: "[Count of Released] [is greater than] [3]", by a value of the view
 * (named in full; "Count of rows" when Values is empty). Applies once its numbers are there; a number
 * emptied takes the rule off and leaves the row for a new number, as on the name.
 */
function TotalRule({ rule, ctx, apply, unset, first }) {
    const { view, types, labels, locale } = ctx;
    const { choices, names } = measuresOf(view, types, labels, rule?.by);
    const [s, setS] = useState(() => ({ by: choiceIndex(choices, rule?.by), op: rule ? ruleOp(rule) : ">", a: numberText(rule?.value, locale), b: numberText(rule?.value2, locale) }));
    const later = useLater();
    const latest = useLatest({ rule, apply, unset });
    const formName = useFormName();
    const change = (patch, wait = false) => {
        const next = { ...s, ...patch };
        setS(next);
        const run = () => {
            const [a, b] = [parseNumber(next.a, locale), parseNumber(next.b, locale)];
            if (a !== null && (!twin(next.op) || b !== null)) {
                const by = choices[next.by];
                latest.current.apply({ field: ctx.field, type: "value", by: { field: by.field, agg: by.agg }, ...opOf(next.op), value: a, ...(twin(next.op) ? { value2: b } : {}) });
            } else if (latest.current.rule && emptied(patch)) {
                // a number emptied takes the rule off, as on the name (#244)
                latest.current.unset();
            }
        };
        if (wait) {
            later.later(run);
        } else {
            later.cancel();
            run();
        }
    };
    const restore = () => {
        later.cancel();
        const was = { a: numberText(rule?.value, locale), b: numberText(rule?.value2, locale) };
        if (s.a === was.a && s.b === was.b) {
            return false;
        }
        setS({ ...s, ...was });
        return true;
    };
    const keys = fieldKeys({ now: later.now, restore, back: ctx.back });
    const number = (key, label, testId, shown) => (
        <NumberField value={s[key]} onChange={(t) => change({ [key]: t }, true)} onKeyDown={keys} onBlur={later.now} problem={readNumber(s[key], { required: false, labels, locale }).problem} label={label} shown={shown} testId={testId} className="pk-field-label pk-narrow-input" />
    );
    return (
        <>
            <span className="pk-rule-subject pk-rule-lead">{fill(labels.ruleWhose, { field: fieldLabel(ctx.field, labels.core) })}</span>
            <MeasurePick choices={choices} names={names} index={s.by} onChange={(i) => change({ by: i })} label={labels.valueFilterBy} testId="value-filter-by" />
            <select className="pk-rule-op" name={`${formName}-op`} value={s.op} onChange={(e) => change({ op: e.target.value })} aria-label={labels.valueFilterOp} data-autofocus={first ? "" : undefined} data-testid="value-filter-op">
                {RULE_OPS.compare.map((o) => (
                    <option key={o} value={o}>
                        {labels.valueOps[o] ?? o}
                    </option>
                ))}
            </select>
            {number("a", labels.valueFilterNumber, "value-filter-number")}
            {twin(s.op) ? number("b", `${labels.valueFilterTo} ${labels.valueFilterNumber}`, "value-filter-number2", labels.valueFilterTo) : null}
        </>
    );
}

/**
 * A rule on the item's name: "The name [contains] [an]"; the text applies a moment after the typing
 * stops. A text emptied (or only spaces) takes the rule off and leaves the row for a new text (#159).
 */
function NameRule({ rule, ctx, apply, unset, first }) {
    const { field, labels } = ctx;
    const [op, setOp] = useState(rule ? ruleOp(rule) : "contains");
    const send = (o, value) => {
        if (value.trim() !== "") {
            apply({ ...textRule(field, { op: o, value, on: ctx.textOn }), ...(rule ? { blanks: rule.blanks } : {}) });
        } else if (rule) {
            unset();
        }
    };
    const text = useAppliedText(rule?.value ?? "", (value) => send(op, value));
    const opName = useFormName();
    return (
        <>
            <span className="pk-rule-subject">{labels.ruleName}</span>
            <select
                className="pk-rule-op"
                name={opName}
                value={op}
                onChange={(e) => {
                    setOp(e.target.value);
                    send(e.target.value, text.text);
                }}
                aria-label={labels.condition}
                data-autofocus={first ? "" : undefined}
                data-testid="filter-condition-op"
            >
                {RULE_OPS.text.map((o) => (
                    <option key={o} value={o}>
                        {labels.labelOps[o] ?? o}
                    </option>
                ))}
            </select>
            <ClearInput
                type="text"
                value={text.text}
                onChange={text.set}
                onBlur={text.flush}
                onKeyDown={fieldKeys({ now: text.flush, restore: text.restore, back: ctx.back })}
                onClear={() => text.set("")}
                clearLabel={labels.clearText}
                aria-label={labels.conditionValue}
                placeholder={labels.conditionValue}
                maxLength={LIMITS.textValue}
                data-testid="filter-condition-text"
            />
        </>
    );
}

/** A rule the rows cannot edit (a loaded view's): its words, and that it is kept as it is; its × removes it. */
function FixedRule({ rule, ctx }) {
    return (
        <>
            <span className="pk-rule-subject">{ctx.say(rule)}</span>
            <span className="pk-hint pk-rule-note" data-testid="rule-fixed">
                {ctx.labels.ruleFixed}
            </span>
        </>
    );
}

const ROWS = { item: ItemRule, total: TotalRule, name: NameRule, fixed: FixedRule };

/**
 * The rules of a field, all together ("and"): one row each with its "i" (what it compares, with an
 * example), its result line (what it keeps) and its ×, a new one (`draft`) while it is not complete,
 * and the buttons that add one, at most RULES_MAX per field and LIMITS.filters in the view. The quick
 * choice, when set, stands first as a line to read. `focusFirst`: opened from the search, the focus
 * on the first row (or the first button).
 */
function RuleEditor({ ctx, rules, focusFirst, quickLine, results, blanks }) {
    const { view, field, labels, locale, commit, note, fk, nameKind, noun } = ctx;
    const { explain } = useContext(HelpContext);
    const lang = { lang: labels.lang, locale };
    const [draft, setDraft] = useState(/** @type {"item" | "total" | "name" | null} */ (null));
    // counts the rows added, so a new row of the kind of the one before takes the focus too
    const [added, setAdded] = useState(0);
    // rules whose value was emptied: out of the view, each row kept in its place (`at`, its index among
    // the rows) with the focus, what is typed and the rule's blanks, until a new value applies it again
    // before the rule that followed it, its × removes the row, or a change from elsewhere draws the
    // rows again
    const [held, setHeld] = useState(/** @type {Array<{ at: number, kind: "item" | "total" | "name", blanks?: string }>} */ ([]));
    const blanksName = useFormName();
    const [info, setInfo] = useState(/** @type {number | null} */ (null));
    // rows are keyed by their place; a change the rows did not make (a quick choice, Remove, Undo)
    // draws them again from the view
    const [gen, setGen] = useState(0);
    const rulesKey = rulesKeyOf(rules);
    const [seen, setSeen] = useState(rulesKey);
    // the rules a row's own change leads to: the rows stay as they are (focus, what is typed)
    const [own, setOwn] = useState(/** @type {string | null} */ (null));
    if (rulesKey !== seen) {
        setSeen(rulesKey);
        if (rulesKey !== own) {
            setGen(gen + 1);
            setDraft(null);
            setHeld([]);
        }
    }
    const box = useRef(/** @type {HTMLFieldSetElement | null} */ (null));
    // after a removal the focus goes to the first button that adds a rule; a new rule takes it
    const focusAdd = useRef(false);
    // the rows whose × was clicked: what still waits in them (a value typed a moment ago, applied
    // when the row goes) applies nothing (#320)
    const removed = useRef(/** @type {Set<string>} */ (new Set()));
    // the view and the rows' generation shown now: a value that waits in a row applies to that view,
    // also when it applies as its row goes after a change above it (another rule's ×), so the row's
    // older view does not bring back what that change took away; a row of an older generation leaves
    // the held rows and the new one alone, since the rows were drawn again without them (#320)
    const now = useRef({ view, gen });
    useIsoLayoutEffect(() => {
        now.current = { view, gen };
    });
    useEffect(() => {
        if (focusAdd.current) {
            focusAdd.current = false;
            /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(".pk-rule-adds button:not([disabled])"))?.focus();
        }
    }, [gen]);
    useEffect(() => {
        if (draft) {
            // the new rule in view, whole (it may start below the menu's edge), and its first control focused
            const row = /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(".pk-rule:last-child"));
            /** @type {HTMLElement | null | undefined} */ (row?.querySelector("[data-autofocus]"))?.focus({ preventScroll: true });
            row?.scrollIntoView?.({ block: "nearest" });
            // a row of a fractional height may end a part of a pixel below the edge of what scrolls: whole pixels
            const scroller = row?.closest(".pk-level-body");
            if (row && scroller) {
                const over = row.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
                if (over > 0) {
                    scroller.scrollTop += Math.ceil(over);
                }
            }
        }
    }, [draft, added]);
    /**
     * A new rule's row, last. A new row not yet complete stays in its place (as an emptied rule's
     * does) and applies with what it holds once its field is left, so a second rule added while the
     * first one's text still waits is a row of its own (#245).
     */
    const add = (/** @type {"item" | "total" | "name"} */ k) => {
        if (draft) {
            setHeld([...held, { at: rules.length + held.length, kind: draft }]);
        }
        setDraft(k);
        setAdded(added + 1);
    };
    const kinds = /** @type {Array<"item" | "total" | "name">} */ (["item", "total", "name"]).filter((k) => (k === "item" ? Boolean(fk.item) : k === "name" ? Boolean(nameKind) : true));
    const count = rules.length + (draft ? 1 : 0) + held.length;
    const full = count >= RULES_MAX || view.filters.length >= LIMITS.filters;
    const addText = { item: fill(labels.addRuleItem, { field: fieldLabel(field, labels.core) }), total: labels.addRuleTotal, name: labels.addRuleName };
    /** The "i" of a rule: what it compares, with an example; the total's with its scope. */
    const infoText = (rule, kind) => {
        const one = plural(noun, 1, lang);
        if (kind === "total") {
            const by = rule?.by ?? measuresOf(view, ctx.types, labels, undefined).choices[0];
            return fill(labels.ruleInfo.total, { noun: one, nouns: plural(noun, 2, lang), measure: refLabel(view, by, labels), scope: ctx.scope });
        }
        if (kind === "name") {
            return fill(labels.ruleInfo.name, { noun: one });
        }
        return fill(labels.ruleInfo[fk.item === "group" ? (fk.cyclic ? "cyclic" : "group") : fk.item ?? "group"], { noun: one });
    };
    /** A change the rows make: the rows stay as they are (no new generation). */
    const commitOwn = (next) => {
        setOwn(rulesKeyOf(filtersOf(next, field, RULE_TYPES).filter((f) => !ctx.quickFilters.includes(f))));
        commit(next, note);
    };
    const row = (rule, kind, i, isHeld = false) => {
        const Row = ROWS[kind];
        const key = `${gen}:${i}`;
        const apply = (entry) => {
            if (removed.current.has(key)) {
                return;
            }
            // a new rule on the items keeps the blanks as the others do
            // an emptied rule typed again keeps its blanks
            const was = isHeld ? held.find((h) => h.at === i) : undefined;
            const own = was?.blanks && ITEM_RULE_TYPES.includes(entry.type) ? { ...entry, blanks: was.blanks } : !rule && ctx.keepBlanks && ITEM_RULE_TYPES.includes(entry.type) ? { ...entry, blanks: "include" } : entry;
            const current = now.current.gen === gen;
            if (isHeld && current) {
                setHeld(held.filter((h) => h.at !== i));
            } else if (!rule && current) {
                setDraft(null);
            }
            // in its place: before the next row's rule
            const before = isHeld ? (rows.slice(i + 1).find((x) => x.rule)?.rule ?? null) : null;
            commitOwn(setRule(now.current.view, field, rule, own, before));
        };
        // the value emptied: the rule leaves the view, its row stays (the sections stay as they are)
        const unset = () => {
            if (rule && !removed.current.has(key)) {
                if (now.current.gen === gen) {
                    setHeld([...held, { at: i, kind, blanks: rule.blanks }].sort((a, b) => a.at - b.at));
                    ctx.keepSections();
                }
                commitOwn(setRule(now.current.view, field, rule, null));
            }
        };
        const remove = () => {
            removed.current.add(key);
            focusAdd.current = true;
            if (rule) {
                commit(setRule(view, field, rule, null), note);
            } else {
                if (isHeld) {
                    setHeld(held.filter((h) => h.at !== i));
                } else {
                    setDraft(null);
                }
                setGen(gen + 1);
                // the last row gone: the sections as the rules decide (no rule: Pick items open)
                if (rows.length === 1) {
                    ctx.releaseSections();
                }
            }
        };
        const result = rule ? results.get(rule) : null;
        const open = info === i;
        const infoId = `${gen}-${i}`;
        return (
            <li key={key} className="pk-rule" data-testid="rule" data-kind={kind}>
                {i > 0 || quickLine ? <span className="pk-rule-and">{labels.ruleAnd}</span> : null}
                <span className="pk-rule-body">
                    <Row rule={rule} ctx={ctx} apply={apply} unset={unset} first={(focusFirst && i === 0) || (!rule && !isHeld && draft !== null)} />
                </span>
                <span className="pk-rule-tools">
                    {explain ? (
                        <button type="button" className="pk-icon-btn pk-rule-info" aria-expanded={open} aria-controls={open ? infoId : undefined} onClick={() => setInfo(open ? null : i)} aria-label={labels.explainRule} title={labels.explainRule} data-testid="rule-info">
                            <Icon name="info" size={14} />
                        </button>
                    ) : null}
                    {/* the field being typed in keeps the focus until the click: its blur would apply what
                        waits, and the menu, changed above the ×, would move it from under the pointer */}
                    <button type="button" className="pk-icon-btn pk-rule-remove" onMouseDown={(e) => e.preventDefault()} onClick={remove} aria-label={labels.removeRule} title={labels.removeRule} data-testid="rule-remove">
                        <Icon name="x" size={14} />
                    </button>
                </span>
                <p className={`pk-hint pk-rule-result${result && result.kept === 0 ? " pk-rule-result-empty" : ""}`} data-testid="rule-result">
                    {result ? result.text : labels.ruleIncomplete}
                </p>
                {open ? (
                    <p className="pk-rule-info-text" id={infoId} data-testid="rule-info-text">
                        {infoText(rule, kind)}
                    </p>
                ) : null}
            </li>
        );
    };
    // the rules, an emptied one's row in its place (so it keeps its key and the focus), the new one last
    const rows = rules.map((r) => ({ rule: r, kind: rowKind(r), isHeld: false }));
    for (const h of held) {
        rows.splice(h.at, 0, { rule: null, kind: h.kind, isHeld: true });
    }
    if (draft) {
        rows.push({ rule: null, kind: draft, isHeld: false });
    }
    // a removed row is gone once this commit is done (what waited in it was dropped as it unmounted,
    // before this effect): its key is free again for a row that takes its place later
    useEffect(() => {
        for (const key of removed.current) {
            if (!rows.some((_r, i) => key === `${gen}:${i}`)) {
                removed.current.delete(key);
            }
        }
    });
    return (
        <fieldset ref={box} className="pk-condition pk-rules" data-testid="rules">
            <legend className="pk-sr">{labels.rulesTitle}</legend>
            <p className="pk-hint">{fill(count || quickLine ? labels.rulesKeep : labels.rulesNone, { noun: plural(noun, 2, lang) })}</p>
            {count || quickLine ? (
                <ul className="pk-rule-list" role="list">
                    {quickLine ? (
                        <li className="pk-rule pk-rule-quick" data-testid="rule-quick">
                            <span>{fill(labels.quickLine, { text: quickLine })}</span>
                            <button type="button" className="pk-action" onClick={ctx.focusQuick} data-testid="rule-quick-change">
                                {labels.changeAbove}
                            </button>
                        </li>
                    ) : null}
                    {/* one list, so a new rule keeps its row (and the focus) once it applies */}
                    {rows.map((x, i) => row(x.rule, x.kind, i, x.isHeld))}
                </ul>
            ) : null}
            {blanks ? (
                <label className="pk-check pk-rules-blanks">
                    <input type="checkbox" name={`${blanksName}`} checked={blanks.on} onChange={(e) => commit(setRuleBlanks(view, field, e.target.checked), note)} data-testid="rules-blanks" />
                    <span>{fill(plural(labels.rulesBlanks, blanks.rows, lang), { rows: blanks.rows.toLocaleString(locale) })}</span>
                </label>
            ) : null}
            <div className="pk-rule-adds" role="group" aria-label={labels.addRule}>
                {kinds.map((k, i) => (
                    <button
                        key={k}
                        type="button"
                        className="pk-btn pk-small-btn"
                        disabled={full}
                        // the field being typed in keeps the focus until the click (its blur would apply what
                        // waits, and the menu, changed above the button, would move it from under the pointer)
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => add(k)}
                        data-autofocus={focusFirst && !count && i === 0 ? "" : undefined}
                        data-testid={`rule-add-${k}`}
                    >
                        <Icon name="plus" size={14} />
                        <span className="pk-btn-text">{addText[k]}</span>
                    </button>
                ))}
            </div>
            {full ? <p className="pk-hint">{fill(labels.rulesFull, { max: RULES_MAX })}</p> : null}
        </fieldset>
    );
}

/** The filters of the view without a field's own of the given types. */
const without = (view, field, types) => view.filters.filter((f) => !(typeof f.field === "string" && f.field.toLowerCase() === field.toLowerCase() && types.includes(f.type)));

/**
 * The Filter level. `hint` "conditions": opened from the search on a rule, with the rules open and
 * the focus on the first one.
 */
export function FilterLevel({ view, field, encoded, types, labels, locale, commit, back, hint }) {
    const limits = useContext(LimitsContext);
    const info = useMemo(() => itemsOf(encoded, field, { view, locale, labels: labels.core, limits }), [encoded, field, view, locale, labels, limits]);
    const narrow = useContext(LayerContext).size === "narrow";
    const fk = useMemo(() => ruleKind(encoded, view, field), [encoded, view, field]);
    const source = sourceOf(view, field);
    const column = fk.dates ? encoded.column(source) : null;
    const span = useMemo(() => (fk.dates ? dateSpan(encoded, source) : null), [encoded, fk.dates, source]);
    const counts = useMemo(() => (column ? countsOf(column) : null), [column]);
    const years = useMemo(() => (fk.cyclic && column && counts ? yearsOf(column, counts) : []), [fk.cyclic, column, counts]);
    const quick = quickChoice(view, field, fk, years.map((y) => y.year));
    // the reference date of the quick choices before one is set: the field's range's, else today
    const [anchorLocal, setAnchorLocal] = useState(/** @type {string | null} */ (null));
    const anchor = quick.anchor ?? anchorLocal ?? "today";
    // More choices: open when the choice set is one of them
    const [moreOpen, setMoreOpen] = useState(() => inMore(quick));
    // the sections: open by hand (true, false) or as the rules decide (null): the items while the
    // field has no rules, the rules while it has
    const [openQuick, setOpenQuick] = useState(true);
    const [openPicks, setOpenPicks] = useState(/** @type {boolean | null} */ (null));
    const [openRules, setOpenRules] = useState(/** @type {boolean | null} */ (hint === "conditions" ? true : null));
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    // the rules of the field besides the quick choice, with what each one keeps
    const rulesAll = filtersOf(view, field, RULE_TYPES);
    const rules = rulesAll.filter((f) => !quick.filters.includes(f));
    const itemRules = rules.filter((f) => f.type !== "value");
    const totalRules = rules.filter((f) => f.type === "value");
    const anyRule = rules.length > 0 || quick.filters.length > 0;
    // every change from no rule or quick choice to one opens Rules and folds Pick items, every change
    // back does the reverse - unless a section was folded or opened by hand since the last change:
    // then that choice stays this once
    const hadRule = useRef(anyRule);
    const byHand = useRef(false);
    /**
     * The focus kept on a control of the level: when a control went (a rule's ×, a button that
     * disabled itself, a section that folded) it goes to the header of the section it belonged to.
     */
    const lost = useRef(false);
    const refocus = () => {
        if (!lost.current) {
            return;
        }
        const active = box.current ? activeIn(box.current) : null;
        if (!active || !active.isConnected || !box.current?.contains(active) || (active instanceof HTMLButtonElement && active.disabled)) {
            /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector('[data-testid="section-rules"]'))?.focus();
        }
        lost.current = false;
    };
    // after every render, so after the RuleEditor's own focus move (the first button that adds a
    // rule) and after the fold that takes that button away
    useEffect(refocus);
    useEffect(() => {
        if (hadRule.current !== anyRule) {
            hadRule.current = anyRule;
            if (byHand.current) {
                byHand.current = false;
            } else {
                setOpenRules(anyRule);
                setOpenPicks(!anyRule);
            }
            // the focus may be on a control that went with the change (a rule's ×, a button that
            // disabled itself): checked after the render that folds the sections (the effect
            // above), or, when they do not change, a moment later
            lost.current = true;
            setTimeout(refocus, 100);
        }
    }, [anyRule]);
    // "change it above": the quick choices open and in view, the focus on the choice that is set
    const [goQuick, setGoQuick] = useState(0);
    useEffect(() => {
        if (goQuick) {
            // the checked choice; for Years combined the first year on that can take the focus (the
            // only one on is disabled), else the first year
            const target = /** @type {HTMLElement | null | undefined} */ (
                box.current?.querySelector('[data-testid="quick-choices"] input:checked, [data-testid="quick-more-body"] input[type="radio"]:checked, [data-testid="years-combined"] [aria-pressed="true"]:not(:disabled)') ?? box.current?.querySelector('[data-testid="years-combined"] button:not(:disabled)')
            );
            target?.scrollIntoView?.({ block: "center" });
            target?.focus({ preventScroll: true });
        }
    }, [goQuick]);
    const timeZone = encoded.timeZone;
    const noun = nounOf(fk, labels);
    const lang = { lang: labels.lang, locale };
    // the memos below follow the view by its content: the rules, the quick choice and the measures are
    // read from it, so they are left out of the dependencies (the exhaustive-deps disables)
    const keyOfView = JSON.stringify(view);
    // what the table shows of the field, and the totals the rules on totals compare: pivots of the
    // field alone (its Grand Total scope), with the view's other filters
    const totals = useMemo(() => {
        if (!info) {
            return null;
        }
        const base = without(view, field, ["value", "top"]);
        const by = totalRules[0]?.by ?? measuresOf(view, types, labels, undefined).choices[0];
        const all = itemTotals(encoded, view, field, by, [...base, ...totalRules], limits);
        const perRule = new Map();
        for (const r of totalRules) {
            const plain = itemTotals(encoded, view, field, r.by, base, limits);
            const kept = itemTotals(encoded, view, field, r.by, [...base, r], limits);
            perRule.set(r, { totals: plain.totals, kept: kept.totals.size });
        }
        return { shown: all.totals, rows: all.rows, perRule, by };
    }, [encoded, keyOfView, field, info, limits]); // eslint-disable-line react-hooks/exhaustive-deps
    // what each rule on the items keeps, by itself
    const itemResults = useMemo(() => {
        const out = new Map();
        for (const r of itemRules) {
            const kept = itemsOf(encoded, field, { view: { ...view, filters: [r] }, locale, labels: labels.core, limits });
            out.set(r, kept ? kept.items.filter((i) => i.kept).length : 0);
        }
        // the quick choice alone, for the items it leaves out
        if (quick.filters.length && itemRules.length) {
            const kept = itemsOf(encoded, field, { view: { ...view, filters: quick.filters }, locale, labels: labels.core, limits });
            out.set("quick", new Set(kept ? kept.items.filter((i) => !i.kept).map((i) => keyOf(i.value)) : []));
        }
        return out;
    }, [encoded, keyOfView, field, locale, labels, limits]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!info || !totals) {
        return null;
    }
    const name = fieldLabel(field, labels.core);
    const note = { step: "filter", field: name };
    const all = info.items.map((i) => i.value);
    const picked = selectedItems(view, field, all);
    const selected = new Set(picked.map(keyOf));
    // a rule on the names the type has none for (a loaded view's) still shows, so it can be taken off
    const nameKind = conditionKind(encoded, view, field) ?? (rules.some((r) => r.type === "text") ? "text" : null);
    const labelOf = (v) => info.items.find((i) => i.value === v)?.label;
    const say = (f) => ruleText(view, f, { labels, locale, timeZone, date: fk.dates, labelOf, span });
    const number = (n) => n.toLocaleString(locale);
    // the quick choice in words: "last 2 years (2025; 2026 has no data)", "2024–2025 combined"
    const yearsOn = quick.id === "yearsCombined" && quick.years ? quick.years : years.map((y) => y.year);
    const yearsText = fk.cyclic && years.length > 1 ? combinedYearsText(yearsOn, years.map((y) => y.year), labels, locale) : null;
    const quickWords = quick.id === "yearsCombined" ? yearsText : quick.filters.length ? relativeText(quick.filters[0], labels, locale, timeZone, undefined, span, view.formatting?.weekStart) : null;
    // the items: picked, kept by the quick choice and the rules on items, shown after the rules on totals
    const outByQuick = /** @type {Set<string> | undefined} */ (itemResults.get("quick")) ?? (quick.filters.length ? new Set(info.items.filter((i) => !i.kept).map((i) => keyOf(i.value))) : new Set());
    const kept = info.items.filter((i) => i.kept && selected.has(keyOf(i.value)));
    const shown = totalRules.length ? kept.filter((i) => totals.shown.has(keyOf(i.value))).length : kept.length;
    const unpicked = all.length - picked.length;
    const byQuick = info.items.filter((i) => selected.has(keyOf(i.value)) && outByQuick.has(keyOf(i.value))).length;
    const byRules = info.items.filter((i) => selected.has(keyOf(i.value)) && !i.kept).length - byQuick;
    const byTotals = kept.length - shown;
    /** The totals from the lowest to the highest item, as the table writes them: "the totals go from 6.8 (Jan) to 22.3 (Aug)". */
    const spread = (map, by) => {
        const entries = [...map.entries()].filter(([, v]) => v !== null);
        if (!entries.length) {
            return null;
        }
        const [lo, hi] = [entries.reduce((a, e) => (e[1] < a[1] ? e : a)), entries.reduce((a, e) => (e[1] > a[1] ? e : a))];
        const spec = view.values.find((v) => sameRef({ field: v.field ?? null, agg: v.agg }, by));
        const text = formatter(spec?.format ?? (by.agg === "count" || by.agg === "countUnique" ? "integer" : "number"), { locale });
        const item = (k) => labelOf(JSON.parse(k)) ?? k;
        return fill(labels.totalSpread, { low: text(lo[1]), lowItem: item(lo[0]), high: text(hi[1]), highItem: item(hi[0]) });
    };
    /** A rule on the total in words: "Average of Mean °C that is greater than 25". */
    const totalWords = (r) => {
        const measure = refLabel(view, r.by, labels);
        const op = labels.valueOps[ruleOp(r)] ?? ruleOp(r);
        const num = (x) => (typeof x === "number" ? x.toLocaleString(locale, { maximumFractionDigits: 6 }) : "");
        return twin(r.op) ? fill(labels.totalWordsTwo, { measure, op, from: num(Math.min(r.value, r.value2)), to: num(Math.max(r.value, r.value2)) }) : fill(labels.totalWords, { measure, op, number: num(r.value) });
    };
    // nothing shown: the one reason, with the nearest value for a rule on the total
    /** @type {string | null} */
    let empty = null;
    if (shown === 0) {
        const total = totalRules.find((r) => totals.perRule.get(r)?.kept === 0);
        if (total) {
            empty = fill(labels.emptyTotal, { noun: plural(noun, 1, lang), rule: totalWords(total), spread: spread(totals.perRule.get(total).totals, total.by) ?? "" });
        } else if (picked.length === 0) {
            empty = labels.emptyPicks;
        } else if (byQuick + byRules > 0) {
            empty = fill(labels.emptyRules, { noun: plural(noun, 1, lang), rules: [...(quickWords ? [quickWords] : []), ...itemRules.map(say)].join(labels.listAnd) });
        }
    }
    // the result line of each rule: what it keeps by itself
    const results = new Map();
    for (const r of rules) {
        if (r.type === "value") {
            const own = totals.perRule.get(r);
            const text = own.kept === 0 ? fill(labels.ruleKeepsNone, { total: number(all.length), noun: plural(noun, all.length, lang), spread: spread(own.totals, r.by) ?? "" }) : fill(labels.ruleKeeps, { kept: number(own.kept), total: number(all.length), noun: plural(noun, all.length, lang) });
            results.set(r, { kept: own.kept, text });
        } else {
            const n = /** @type {number} */ (itemResults.get(r) ?? 0);
            results.set(r, { kept: n, text: fill(labels.ruleKeeps, { kept: number(n), total: number(all.length), noun: plural(noun, all.length, lang) }) });
        }
    }
    // the scope of a total: the other axes' items and the data's dates ("all 14 City items and the dates Jan 1, 2023 – Dec 31, 2025")
    const others = [...view.rows, ...view.cols].filter((f) => f.toLowerCase() !== field.toLowerCase());
    const scopeParts = others.map((f) => fill(labels.scopeItems, { count: number(itemsOf(encoded, f, { view, locale, labels: labels.core, limits })?.items.length ?? 0), field: fieldLabel(f, labels.core) }));
    if (span) {
        scopeParts.push(fill(labels.scopeDates, { range: `${dayText(isoDay(span.min), locale)} – ${dayText(isoDay(span.max), locale)}` }));
    }
    const scope = scopeParts.length ? scopeParts.join(labels.listAnd) : labels.scopeRows;
    const focusQuick = () => {
        setOpenQuick(true);
        if (inMore(quick)) {
            setMoreOpen(true);
        }
        setGoQuick((n) => n + 1);
    };
    /**
     * A change from a button that disables itself (Pick all again, Remove, Reset filter): the focus goes to the
     * header of its section instead of being lost, whatever the sections do.
     */
    const act = (next, header) => {
        commit(next, note);
        requestAnimationFrame(() => {
            const active = box.current ? activeIn(box.current) : null;
            if (!active || !active.isConnected || !box.current?.contains(active) || (active instanceof HTMLButtonElement && active.disabled)) {
                /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(`[data-testid="${header}"]`))?.focus();
            }
        });
    };
    const keepBlanks = keepsBlanks(view, field);
    // a rule emptied in its row: the sections stay as they are when it was the last one (its row stays open)
    const keepSections = () => {
        if (rules.length === 1 && !quick.filters.length) {
            byHand.current = true;
            setOpenPicks(openPicks ?? !anyRule);
            setOpenRules(openRules ?? anyRule);
        }
    };
    // an emptied rule's row removed when no rule is left: the sections as the rules decide again
    const releaseSections = () => {
        setOpenPicks(null);
        setOpenRules(null);
        lost.current = true;
    };
    const ctx = { view, field, types, labels, locale, commit, note, back, fk, nameKind, say, textOn: textOn(encoded, field), timeZone, hint, items: info.items, noun, scope, quickFilters: quick.filters, focusQuick, act, keepBlanks, keepSections, releaseSections };
    // "Also keep items without a value": for a field with blank items and a rule on its items (the quick choice among them)
    const blankRows = info.items.find((i) => i.value === null)?.count ?? 0;
    const blanks = blankRows > 0 && (itemRules.length > 0 || quick.filters.length > 0) ? { rows: blankRows, on: keepBlanks } : null;
    const picksOpen = openPicks ?? !anyRule;
    const rulesOpen = openRules ?? anyRule;
    // on a phone one section at a time
    const togglePicks = () => {
        byHand.current = true;
        setOpenPicks(!picksOpen);
        if (narrow && !picksOpen) {
            setOpenRules(false);
        }
    };
    const toggleRules = () => {
        byHand.current = true;
        setOpenRules(!rulesOpen);
        if (narrow && !rulesOpen) {
            setOpenPicks(false);
        }
    };
    const summary = { shown, total: all.length, noun, unpicked, byQuick, byRules, byTotals, itemRules: itemRules.length, totalRules: totalRules.length, rows: totals.rows, rowsAll: encoded.length, span, yearsText, empty, quickWords, rules: rules.length, canReset: unpicked > 0 || anyRule };
    const outOf = (i) => i.kept === false;
    const quickSection = fk.quick && span && column && counts ? { id: "quick", title: labels.quickTitle, body: <QuickChoices ctx={ctx} quick={quick} anchor={anchor} setAnchorLocal={setAnchorLocal} span={span} column={column} counts={counts} moreOpen={moreOpen} setMoreOpen={setMoreOpen} /> } : fk.cyclic && years.length > 1 && years.length <= 12 ? { id: "years", title: labels.yearsCombined, body: <YearsCombined ctx={ctx} years={years} on={yearsOn} /> } : null;
    return (
        <div ref={box} className="pk-filter pk-filter-level">
            <Summary ctx={ctx} state={summary} />
            {quickSection ? (
                <FoldSection id={quickSection.id} title={quickSection.title} state={quickWords && !openQuick ? quickWords : null} open={openQuick} onToggle={() => setOpenQuick(!openQuick)}>
                    {quickSection.body}
                </FoldSection>
            ) : null}
            <FoldSection
                id="picks"
                title={labels.pickItems}
                state={unpicked ? fill(labels.picksState, { picked: number(picked.length), total: number(all.length) }) : fill(labels.picksAll, { total: number(all.length) })}
                open={picksOpen}
                onToggle={togglePicks}
                action={<SectionAction text={labels.clear} label={labels.clearPicks} disabled={!unpicked} onClick={() => act(setItemFilter(view, field, all, all), "section-picks")} testId="filter-clear-picks" />}
            >
                <ValueList
                    items={info.items}
                    selected={selected}
                    onChange={(next) => commit(setItemFilter(view, field, all.filter((v) => next.has(keyOf(v))), all), note)}
                    labels={labels}
                    locale={locale}
                    autoFocus={!anyRule && !fk.quick && hint !== "conditions"}
                    note={labels.appliesAtOnce}
                    tail={anyRule ? { isOut: outOf, render: (out, row, searching) => <LeftOut out={out} row={row} searching={searching} labels={labels} locale={locale} /> } : undefined}
                />
            </FoldSection>
            <FoldSection
                id="rules"
                title={labels.rulesTitle}
                state={
                    rules.length ? (
                        <>
                            <span className="pk-section-mark">●</span> {fill(plural(labels.rulesState, rules.length, lang), { count: number(rules.length) })}
                        </>
                    ) : (
                        labels.rulesNoneState
                    )
                }
                open={rulesOpen}
                onToggle={toggleRules}
                action={<SectionAction text={labels.removeAll} label={labels.removeRules} disabled={!rules.length} onClick={() => act(removeRules(view, field, quick.filters), "section-rules")} testId="filter-remove-rules" />}
            >
                <RuleEditor ctx={ctx} rules={rules} focusFirst={hint === "conditions"} quickLine={quickWords} results={results} blanks={blanks} />
            </FoldSection>
        </div>
    );
}
