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
 * each); a number a moment after the typing stops, Escape in a field gives back what applies. Loaded
 * with the menus (menus.js).
 */

import React, { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { CATALOG, LIMITS, fieldItems, fieldLabel, formatter } from "pivotkit-core";
import { ClearInput } from "./clear-input.jsx";
import { activeIn, useFormName } from "./dom.js";
import { FILTER_LIST_MAX, keyOf, ValueList } from "./filter.jsx";
import { HelpContext } from "./help.js";
import { Icon } from "./icons.jsx";
import { fill, plural } from "./labels.js";
import { useAppliedText, useLater } from "./levels.jsx";
import { MeasurePick, NumberField, choiceIndex, fieldKeys, measuresOf, readNumber } from "./menu-fields.jsx";
import { dayText, isoDay, periodText, rangeShare, refLabel, relativeDays, relativeText } from "./names.js";
import { numberText, parseNumber } from "./numbers.js";
import { LayerContext, Popover } from "./popover.jsx";
import { dateSpan, filtersOf, sameRef, selectedItems, sourceOf } from "./view-ops.js";
import { RULES_MAX, RULE_TYPES, conditionKind, itemTotals, quickChoice, removeRules, resetFilter, ruleKind, ruleText, setAnchor, setItemFilter, setQuickRange, setRule, setYearsCombined } from "./menu-ops.js";

const twin = (op) => op === "between" || op === "notBetween";
/** The first letter as a sentence starts: "last {count} years" in a list of choices is "Last …". */
const capital = (text, locale) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
/** Rules as a text that does not depend on the order of their keys (normalize() writes its own order). */
const rulesKeyOf = (rules) => JSON.stringify(rules, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
/** The kind of row a rule is: the item itself (a comparison or a relative range), its total, its name. */
const rowKind = (f) => (f.type === "value" ? "total" : f.type === "label" ? "name" : "item");
/** The most years, months and days a quick choice reaches back by itself to the data's latest record. */
const REACH = Object.freeze({ year: 10, month: 24, day: 90 });
/** A grouping's items above this many are picked from a searchable list, not a native select. */
const PICKER_MIN = 13;
const MS_PER_DAY = 86_400_000;

/** The noun of a field's items by its grouping: "months", "years", "values" for a number, "items". */
function nounOf(fk, labels) {
    const unit = fk.unit;
    const key = unit === null ? (fk.item === "number" ? "value" : fk.item === "date" ? "date" : "item") : unit === "bin" ? "range" : unit === "day" ? "day" : unit.replace(/^year(.)/, (_m, c) => c.toLowerCase());
    return Object.hasOwn(labels.nouns, key) ? labels.nouns[key] : labels.nouns.item;
}

/** A relative filter's days as wall-clock ms, [from, to): the rows of a date column in it. */
function rowsIn(range, column, counts) {
    const from = Date.parse(`${range.from}T00:00Z`);
    const to = Date.parse(`${range.to}T00:00Z`) + MS_PER_DAY;
    let rows = 0;
    column.dict.forEach((v, code) => {
        if (typeof v === "number" && v >= from && v < to) {
            rows += counts[code];
        }
    });
    return rows;
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

/** A foldable section of the level: a header button with its state, an action beside it, its body. */
/**
 * @param {{ id: string, title: string, state?: React.ReactNode, open: boolean, onToggle: () => void, action?: React.ReactNode, children: React.ReactNode }} props
 */
function Section({ id, title, state, open, onToggle, action, children }) {
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
 * The quick choices of a date along the time line: All, This year, Last [N] years, months (unless the
 * grouping is by year or quarter) and days (a date or a day grouping), each with the days it keeps,
 * the data's share of them and its rows; only those that keep a row, the others named in a line. A
 * choice applies at once, a count typed a moment after the typing stops (and picks its choice). The
 * reference date, today or the latest record, shows when the data end before the current period.
 */
function QuickChoices({ ctx, quick, anchor, setAnchorLocal, span, column, counts }) {
    const { view, field, labels, locale, fk, timeZone, commit, note, back } = ctx;
    const lang = { lang: labels.lang, locale };
    const latest = span.max;
    const latestDay = isoDay(latest);
    // today, once per opening of the level (the choices and their shares are measured against it)
    const [now] = useState(() => Date.now());
    const days = (unit, count) => relativeDays({ unit, count, anchor }, timeZone, now, latest);
    /** The smallest count whose range reaches the latest record, up to REACH; null when none does. */
    const reach = (unit) => {
        for (let n = 1; n <= REACH[unit]; n++) {
            const r = days(unit, n);
            if (r && r.from <= latestDay) {
                return n;
            }
        }
        return null;
    };
    // the smallest counts that reach the latest record ("Last 1 year" would be This year: 2 at least)
    const defaults = useMemo(() => ({ year: Math.max(2, reach("year") ?? REACH.year), month: reach("month") ?? REACH.month, day: reach("day") ?? REACH.day }), [anchor, latest, timeZone]); // eslint-disable-line react-hooks/exhaustive-deps
    const counted = { year: quick.id === "years" ? quick.count : defaults.year, month: quick.id === "months" ? quick.count : defaults.month, day: quick.id === "days" ? quick.count : defaults.day };
    const [texts, setTexts] = useState(() => Object.fromEntries(Object.entries(counted).map(([u, n]) => [u, numberText(n, locale)])));
    // a change that came from elsewhere (Undo, a rule, the search) shows in a count not being typed in
    const [editing, setEditing] = useState(/** @type {string | null} */ (null));
    const quickKey = `${quick.id}:${quick.count ?? ""}:${anchor}`;
    const [seen, setSeen] = useState(quickKey);
    if (quickKey !== seen) {
        setSeen(quickKey);
        const synced = { ...texts };
        for (const unit of CATALOG.relativeUnits) {
            if (unit !== editing) {
                synced[unit] = numberText(counted[unit], locale);
            }
        }
        setTexts(synced);
    }
    const later = useLater();
    const group = useId();
    const groupName = useFormName();
    const set = (range) => commit(setQuickRange(view, field, range ? { ...range, anchor } : null), note);
    /** The sub-line of a choice: the data's share of its days ("2025 (2026 has no data)") and its rows. */
    const sub = (range, unit, id) => {
        const share = rangeShare(range, unit, span, locale);
        if (share?.none) {
            return null;
        }
        const period = share ? `${share.data} ` : periodText(range, unit, locale);
        const missing = share ? fill(plural(labels.noData, share.count, lang), { range: share.missing.join(", ") }) : null;
        return (
            <span className="pk-quick-sub" id={subId(id)}>
                <span>
                    {period}
                    {missing ? <span className="pk-quick-missing">({missing})</span> : null}
                </span>
                <span className="pk-quick-rows">{fill(labels.quickRows, { rows: rowsIn(range, column, counts).toLocaleString(locale) })}</span>
            </span>
        );
    };
    // the days with data and the rows of a choice describe its radio (aria-describedby)
    const subId = (id) => `${group}-${id}`;
    const radio = (id, checked, onPick, name, children, sub, described = Boolean(sub)) => (
        <label className="pk-radio pk-quick" key={id}>
            <input type="radio" name={groupName} checked={checked} onChange={onPick} aria-label={name} aria-describedby={described ? subId(id) : undefined} data-autofocus={checked && ctx.hint !== "conditions" ? "" : undefined} data-testid={`quick-${id}`} />
            {children}
            {sub}
        </label>
    );
    const hidden = [];
    const rows = [radio("all", quick.id === "all" || quick.id === "custom", () => set(null), labels.filterAll, <span>{labels.filterAll}</span>, (
        <span className="pk-quick-sub" id={subId("all")}>
            <span>{`${dayText(isoDay(span.min), locale)}–${dayText(latestDay, locale)}`}</span>
            <span className="pk-quick-rows">{fill(labels.quickRows, { rows: column.codes.length.toLocaleString(locale) })}</span>
        </span>
    ))];
    const thisYear = days("year", 1);
    const yearWords = capital(labels.relative.year, locale);
    if (thisYear && sub(thisYear, "year", "thisYear")) {
        rows.push(radio("thisYear", quick.id === "thisYear", () => set({ unit: "year", count: 1 }), yearWords, <span>{yearWords}</span>, sub(thisYear, "year", "thisYear")));
    } else if (thisYear) {
        hidden.push(`${yearWords} (${periodText(thisYear, "year", locale)})`);
    }
    for (const unit of /** @type {const} */ (["year", "month", "day"])) {
        if ((unit === "month" && !fk.months) || (unit === "day" && !fk.days)) {
            continue;
        }
        const read = readNumber(texts[unit], { kind: "count", max: CATALOG.relativeMaxCount, labels, locale });
        const n = read.value;
        const id = `${unit}s`;
        const shown = n ?? counted[unit];
        // "Last [5] years", "Letztes [1] Jahr": the words around the count, in its number
        // (the form of that count with a place for the field instead of the number)
        const forms = Object.fromEntries(Object.entries(labels.quickLast[unit]).map(([k, v]) => [k, String(v).replace("{count}", "{n}")]));
        const words = plural(forms, shown, lang);
        const [before, after] = words.split("{n}");
        const range = days(unit, shown);
        const line = range ? sub(range, unit, id) : null;
        if (!line) {
            // not one row in reach: not offered, said below
            if (quick.id !== id) {
                hidden.push(fill(words, { n: shown.toLocaleString(locale) }));
                continue;
            }
        }
        const pick = () => set({ unit, count: shown });
        rows.push(
            <div className="pk-quick-row" key={unit}>
                {radio(id, quick.id === id, pick, fill(words, { n: shown.toLocaleString(locale) }), <span aria-hidden="true">{before}</span>, null, Boolean(line))}
                <NumberField
                    value={texts[unit]}
                    onChange={(t) => {
                        setTexts({ ...texts, [unit]: t });
                        later.later(() => {
                            const v = readNumber(t, { kind: "count", max: CATALOG.relativeMaxCount, labels, locale }).value;
                            if (v !== null) {
                                set({ unit, count: v });
                            }
                        });
                    }}
                    onKeyDown={fieldKeys({
                        now: later.now,
                        restore: () => {
                            later.cancel();
                            const was = numberText(counted[unit], locale);
                            if (texts[unit] === was) {
                                return false;
                            }
                            setTexts({ ...texts, [unit]: was });
                            return true;
                        },
                        back
                    })}
                    onBlur={() => {
                        setEditing(null);
                        later.now();
                    }}
                    onFocus={() => setEditing(unit)}
                    problem={read.problem}
                    label={labels.quickCount[unit]}
                    testId={`quick-${id}-count`}
                    className="pk-field-label pk-count-input"
                />
                <span aria-hidden="true">{after}</span>
                {line}
            </div>
        );
    }
    // the switch shows when the latest record lies before the current period (the month; the year for a grouping by year or quarter)
    const today = new Date(relativeDays({ unit: "day", count: 1 }, timeZone, now)?.from ?? isoDay(now));
    const periodStart = fk.months ? Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) : Date.UTC(today.getUTCFullYear(), 0, 1);
    const showAnchor = latest < periodStart;
    const anchorId = useId();
    const anchorName = useFormName();
    return (
        <>
            <div role="radiogroup" aria-label={labels.quickTitle} className="pk-radios pk-quick-choices" data-testid="quick-choices">
                {rows}
            </div>
            {showAnchor ? (
                <div className="pk-quick-anchor">
                    <label htmlFor={anchorId}>{labels.anchorLabel}</label>
                    <select
                        id={anchorId}
                        name={anchorName}
                        value={anchor}
                        onChange={(e) => {
                            const next = /** @type {"today" | "latest"} */ (e.target.value);
                            setAnchorLocal(next);
                            if (quick.filters.length) {
                                commit(setAnchor(view, field, next), note);
                            }
                        }}
                        data-testid="quick-anchor"
                    >
                        <option value="today">{fill(labels.anchorToday, { date: dayText(isoDay(today.getTime()), locale) })}</option>
                        <option value="latest">{fill(labels.anchorLatest, { date: dayText(latestDay, locale) })}</option>
                    </select>
                </div>
            ) : null}
            {hidden.length ? (
                <p className="pk-hint pk-quick-hidden" data-testid="quick-hidden">
                    {fill(plural(labels.quickHidden, hidden.length, lang), { choices: hidden.join(", "), latest: dayText(latestDay, locale) })}
                </p>
            ) : null}
        </>
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
                            <span>{String(y.year)}</span>
                            <span className="pk-quick-rows">{fill(labels.quickRows, { rows: y.rows.toLocaleString(locale) })}</span>
                        </button>
                    );
                })}
            </div>
            {on.length === 1 ? <p className="pk-hint">{fill(labels.yearsCombinedOne, { year: String(on[0]) })}</p> : null}
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
    const q = query.trim().toLocaleLowerCase();
    const found = q ? items.filter((i) => i.label.toLocaleLowerCase().includes(q)) : items;
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
 * number typed, a day, or one of a grouping's items. Applies once it is complete.
 */
function ItemRule({ rule, ctx, apply, first }) {
    const { field, labels, locale, fk, items } = ctx;
    const narrow = useContext(LayerContext).size === "narrow";
    const words = fk.dates ? labels.dateOps : labels.valueOps;
    const ops = fk.dates ? [...CATALOG.valueOps, "last"] : CATALOG.valueOps;
    const textOf = (v) => (v === undefined ? "" : fk.item === "number" ? numberText(v, locale) : String(v));
    const compared = rule?.type === "compare" ? rule : null;
    const ranged = rule?.type === "relative" ? rule : null;
    const [s, setS] = useState(() => ({
        op: ranged ? "last" : compared?.op ?? ">=",
        a: textOf(compared?.value),
        b: textOf(compared?.value2),
        count: numberText(ranged?.count ?? 5, locale),
        unit: ranged?.unit ?? "year"
    }));
    const later = useLater();
    const formName = useFormName();
    const read = (text) => (fk.item === "number" ? parseNumber(text, locale) : fk.item === "date" ? (/^\d{4,}-\d{2}-\d{2}$/.test(text) ? text : null) : text === "" ? null : Number(text));
    const entryOf = (x) => {
        if (x.op === "last") {
            const n = readNumber(x.count, { kind: "count", max: CATALOG.relativeMaxCount, labels, locale }).value;
            return n !== null ? { field, type: "relative", unit: x.unit, count: n, ...(ranged?.anchor === "latest" ? { anchor: "latest" } : {}) } : null;
        }
        const [a, b] = [read(x.a), read(x.b)];
        return a === null || (twin(x.op) && b === null) ? null : { field, type: "compare", op: x.op, value: a, ...(twin(x.op) ? { value2: b } : {}) };
    };
    const change = (patch, wait = false) => {
        const next = { ...s, ...patch };
        setS(next);
        const run = () => {
            const entry = entryOf(next);
            if (entry) {
                apply(entry);
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
                        {CATALOG.relativeUnits.map((u) => (
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
                    {/* a blank item passes no comparison: said where "is not" would suggest otherwise */}
                    {s.op === "!=" || s.op === "notBetween" ? (
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
 * (named in full; "Count of rows" when Values is empty). Applies once its numbers are there.
 */
function TotalRule({ rule, ctx, apply, first }) {
    const { view, types, labels, locale } = ctx;
    const { choices, names } = measuresOf(view, types, labels, rule?.by);
    const [s, setS] = useState(() => ({ by: choiceIndex(choices, rule?.by), op: rule?.op ?? ">", a: numberText(rule?.value, locale), b: numberText(rule?.value2, locale) }));
    const later = useLater();
    const formName = useFormName();
    const change = (patch, wait = false) => {
        const next = { ...s, ...patch };
        setS(next);
        const run = () => {
            const [a, b] = [parseNumber(next.a, locale), parseNumber(next.b, locale)];
            if (a !== null && (!twin(next.op) || b !== null)) {
                const by = choices[next.by];
                apply({ field: ctx.field, type: "value", by: { field: by.field, agg: by.agg }, op: next.op, value: a, ...(twin(next.op) ? { value2: b } : {}) });
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
                {CATALOG.valueOps.map((o) => (
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

/** A rule on the item's name: "The name [contains] [an]"; the text applies a moment after the typing stops. */
function NameRule({ rule, ctx, apply, first }) {
    const { field, labels } = ctx;
    const [op, setOp] = useState(rule?.op ?? "contains");
    const send = (o, value) => {
        if (value !== "") {
            apply({ field, type: "label", op: o, value });
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
                {CATALOG.labelOps.map((o) => (
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
                maxLength={1000}
                data-testid="filter-condition-text"
            />
        </>
    );
}

const ROWS = { item: ItemRule, total: TotalRule, name: NameRule };

/**
 * The rules of a field, all together ("and"): one row each with its "i" (what it compares, with an
 * example), its result line (what it keeps) and its ×, a new one (`draft`) while it is not complete,
 * and the buttons that add one, at most RULES_MAX per field and LIMITS.filters in the view. The quick
 * choice, when set, stands first as a line to read. `focusFirst`: opened from the search, the focus
 * on the first row (or the first button).
 */
function RuleEditor({ ctx, rules, focusFirst, quickLine, results }) {
    const { view, field, labels, locale, commit, note, fk, nameKind, noun } = ctx;
    const { explain } = useContext(HelpContext);
    const lang = { lang: labels.lang, locale };
    const [draft, setDraft] = useState(/** @type {"item" | "total" | "name" | null} */ (null));
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
        }
    }
    const box = useRef(/** @type {HTMLFieldSetElement | null} */ (null));
    // after a removal the focus goes to the first button that adds a rule; a new rule takes it
    const focusAdd = useRef(false);
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
    }, [draft]);
    const kinds = /** @type {Array<"item" | "total" | "name">} */ (["item", "total", "name"]).filter((k) => (k === "item" ? Boolean(fk.item) : k === "name" ? Boolean(nameKind) : true));
    const count = rules.length + (draft ? 1 : 0);
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
    const row = (rule, kind, i) => {
        const Row = ROWS[kind];
        const apply = (entry) => {
            const next = setRule(view, field, rule, entry);
            setOwn(rulesKeyOf(filtersOf(next, field, RULE_TYPES).filter((f) => !ctx.quickFilters.includes(f))));
            if (!rule) {
                setDraft(null);
            }
            commit(next, note);
        };
        const remove = () => {
            focusAdd.current = true;
            if (rule) {
                commit(setRule(view, field, rule, null), note);
            } else {
                setDraft(null);
                setGen(gen + 1);
            }
        };
        const result = rule ? results.get(rule) : null;
        const open = info === i;
        const infoId = `${gen}-${i}`;
        return (
            <li key={`${gen}:${i}`} className="pk-rule" data-testid="rule" data-kind={kind}>
                {i > 0 || quickLine ? <span className="pk-rule-and">{labels.ruleAnd}</span> : null}
                <span className="pk-rule-body">
                    <Row rule={rule} ctx={ctx} apply={apply} first={(focusFirst && i === 0) || (!rule && draft !== null)} />
                </span>
                <span className="pk-rule-tools">
                    {explain ? (
                        <button type="button" className="pk-icon-btn pk-rule-info" aria-expanded={open} aria-controls={open ? infoId : undefined} onClick={() => setInfo(open ? null : i)} aria-label={labels.explainRule} title={labels.explainRule} data-testid="rule-info">
                            <Icon name="info" size={14} />
                        </button>
                    ) : null}
                    <button type="button" className="pk-icon-btn pk-rule-remove" onClick={remove} aria-label={labels.removeRule} title={labels.removeRule} data-testid="rule-remove">
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
                    {[...rules.map((r, i) => row(r, rowKind(r), i)), ...(draft ? [row(null, draft, rules.length)] : [])]}
                </ul>
            ) : null}
            <div className="pk-rule-adds" role="group" aria-label={labels.addRule}>
                {kinds.map((k, i) => (
                    <button
                        key={k}
                        type="button"
                        className="pk-btn pk-small-btn"
                        disabled={full}
                        onClick={() => setDraft(k)}
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
    const info = useMemo(() => fieldItems(encoded, field, { view, locale, labels: labels.core }), [encoded, field, view, locale, labels]);
    const narrow = useContext(LayerContext).size === "narrow";
    const fk = useMemo(() => ruleKind(encoded, view, field), [encoded, view, field]);
    const source = sourceOf(view, field);
    const column = fk.dates ? encoded.column(source) : null;
    const span = useMemo(() => (fk.dates ? dateSpan(encoded, source) : null), [encoded, fk.dates, source]);
    const counts = useMemo(() => (column ? countsOf(column) : null), [column]);
    const years = useMemo(() => (fk.cyclic && column && counts ? yearsOf(column, counts) : []), [fk.cyclic, column, counts]);
    const quick = quickChoice(view, field, fk, years.map((y) => y.year));
    // the reference date of the quick choices before one is set: the field's range's, else today
    const [anchorLocal, setAnchorLocal] = useState(/** @type {"today" | "latest" | null} */ (null));
    const anchor = /** @type {"today" | "latest"} */ (quick.anchor ?? anchorLocal ?? "today");
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
                box.current?.querySelector('[data-testid="quick-choices"] input:checked, [data-testid="years-combined"] [aria-pressed="true"]:not(:disabled)') ?? box.current?.querySelector('[data-testid="years-combined"] button:not(:disabled)')
            );
            target?.scrollIntoView?.({ block: "center" });
            target?.focus({ preventScroll: true });
        }
    }, [goQuick]);
    const timeZone = encoded.timeZone;
    const noun = nounOf(fk, labels);
    const lang = { lang: labels.lang, locale };
    const keyOfView = JSON.stringify(view);
    // what the table shows of the field, and the totals the rules on totals compare: pivots of the
    // field alone (its Grand Total scope), with the view's other filters
    const totals = useMemo(() => {
        if (!info) {
            return null;
        }
        const base = without(view, field, ["value", "top"]);
        const by = totalRules[0]?.by ?? measuresOf(view, types, labels, undefined).choices[0];
        const all = itemTotals(encoded, view, field, by, [...base, ...totalRules]);
        const perRule = new Map();
        for (const r of totalRules) {
            const plain = itemTotals(encoded, view, field, r.by, base);
            const kept = itemTotals(encoded, view, field, r.by, [...base, r]);
            perRule.set(r, { totals: plain.totals, kept: kept.totals.size });
        }
        return { shown: all.totals, rows: all.rows, perRule, by };
    }, [encoded, keyOfView, field, info]); // eslint-disable-line react-hooks/exhaustive-deps
    // what each rule on the items keeps, by itself
    const itemResults = useMemo(() => {
        const out = new Map();
        for (const r of itemRules) {
            const kept = fieldItems(encoded, field, { view: { ...view, filters: [r] }, locale, labels: labels.core });
            out.set(r, kept ? kept.items.filter((i) => i.kept).length : 0);
        }
        // the quick choice alone, for the items it leaves out
        if (quick.filters.length && itemRules.length) {
            const kept = fieldItems(encoded, field, { view: { ...view, filters: quick.filters }, locale, labels: labels.core });
            out.set("quick", new Set(kept ? kept.items.filter((i) => !i.kept).map((i) => keyOf(i.value)) : []));
        }
        return out;
    }, [encoded, keyOfView, field, locale, labels]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!info || !totals) {
        return null;
    }
    const name = fieldLabel(field, labels.core);
    const note = { step: "filter", field: name };
    const all = info.items.map((i) => i.value);
    const picked = selectedItems(view, field, all);
    const selected = new Set(picked.map(keyOf));
    // a rule on the names the type has none for (a loaded view's) still shows, so it can be taken off
    const nameKind = conditionKind(encoded, view, field) ?? (rules.some((r) => r.type === "label") ? "text" : null);
    const labelOf = (v) => info.items.find((i) => i.value === v)?.label;
    const say = (f) => ruleText(view, f, { labels, locale, timeZone, date: fk.dates, labelOf, span });
    const number = (n) => n.toLocaleString(locale);
    // the quick choice in words: "last 2 years (2025; 2026 has no data)", "2024–2025 combined"
    const yearsOn = quick.id === "yearsCombined" && quick.years ? quick.years : years.map((y) => y.year);
    const yearsText = fk.cyclic && years.length > 1 ? (yearsOn.length === 1 ? fill(labels.yearsOne, { year: String(yearsOn[0]) }) : fill(labels.yearsAll, { years: yearsOn.length === years.length || yearsOn[yearsOn.length - 1] - yearsOn[0] === yearsOn.length - 1 ? `${yearsOn[0]}–${yearsOn[yearsOn.length - 1]}` : yearsOn.join(", ") })) : null;
    const quickWords = quick.id === "yearsCombined" ? yearsText : quick.filters.length ? relativeText(quick.filters[0], labels, locale, timeZone, undefined, span) : null;
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
        const op = labels.valueOps[r.op] ?? r.op;
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
    const scopeParts = others.map((f) => fill(labels.scopeItems, { count: number(fieldItems(encoded, f, { view, locale, labels: labels.core })?.items.length ?? 0), field: fieldLabel(f, labels.core) }));
    if (span) {
        scopeParts.push(fill(labels.scopeDates, { range: `${dayText(isoDay(span.min), locale)} – ${dayText(isoDay(span.max), locale)}` }));
    }
    const scope = scopeParts.length ? scopeParts.join(labels.listAnd) : labels.scopeRows;
    const focusQuick = () => {
        setOpenQuick(true);
        setGoQuick((n) => n + 1);
    };
    /**
     * A change from a button that disables itself (Clear, Remove, Reset filter): the focus goes to the
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
    const ctx = { view, field, types, labels, locale, commit, note, back, fk, nameKind, timeZone, hint, items: info.items, noun, scope, quickFilters: quick.filters, focusQuick, act };
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
    const quickSection = fk.quick && span && column && counts ? { id: "quick", title: labels.quickTitle, body: <QuickChoices ctx={ctx} quick={quick} anchor={anchor} setAnchorLocal={setAnchorLocal} span={span} column={column} counts={counts} /> } : fk.cyclic && years.length > 1 && years.length <= 12 ? { id: "years", title: labels.yearsCombined, body: <YearsCombined ctx={ctx} years={years} on={yearsOn} /> } : null;
    return (
        <div ref={box} className="pk-filter pk-filter-level">
            <Summary ctx={ctx} state={summary} />
            {quickSection ? (
                <Section id={quickSection.id} title={quickSection.title} state={quickWords && !openQuick ? quickWords : null} open={openQuick} onToggle={() => setOpenQuick(!openQuick)}>
                    {quickSection.body}
                </Section>
            ) : null}
            <Section
                id="picks"
                title={labels.pickItems}
                state={unpicked ? fill(labels.picksState, { picked: number(picked.length), total: number(all.length) }) : fill(labels.picksAll, { total: number(all.length) })}
                open={picksOpen}
                onToggle={togglePicks}
                action={
                    <button type="button" className="pk-action" disabled={!unpicked} aria-label={labels.clearPicks} onClick={() => act(setItemFilter(view, field, all, all), "section-picks")} data-testid="filter-clear-picks">
                        {labels.clear}
                    </button>
                }
            >
                <ValueList
                    items={info.items}
                    selected={selected}
                    onChange={(next) => commit(setItemFilter(view, field, all.filter((v) => next.has(keyOf(v))), all), note)}
                    labels={labels}
                    locale={locale}
                    autoFocus={!anyRule && !fk.quick && hint !== "conditions"}
                    tail={anyRule ? { isOut: outOf, render: (out, row, searching) => <LeftOut out={out} row={row} searching={searching} labels={labels} locale={locale} /> } : undefined}
                />
            </Section>
            <Section
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
                action={
                    <button type="button" className="pk-action" disabled={!rules.length} aria-label={labels.removeRules} onClick={() => act(removeRules(view, field, quick.filters), "section-rules")} data-testid="filter-remove-rules">
                        {labels.removeAll}
                    </button>
                }
            >
                <RuleEditor ctx={ctx} rules={rules} focusFirst={hint === "conditions"} quickLine={quickWords} results={results} />
            </Section>
        </div>
    );
}
