/*
 * The quick choices of a date field in the Filter level (filter-level.jsx): This, Last, Next and
 * Before the last with their count and unit, Include the current period, rolling periods under More
 * choices, and the date the ranges count back from. Each choice keeps the days it names; the data's
 * share of them and their rows stand beside it. Loaded with the menus (menus.js).
 */

import React, { useId, useState } from "react";
import { CATALOG, relativeDateRange } from "pivotkit-core";
import { useFormName } from "./dom.js";
import { Icon } from "./icons.jsx";
import { fill, plural } from "./labels.js";
import { useLater } from "./levels.jsx";
import { NumberField, Radio, fieldKeys, readNumber } from "./menu-fields.jsx";
import { dayMs, dayText, isoDay, namedUntil, periodText, rangeShare, todayIn } from "./names.js";
import { numberText } from "./numbers.js";
import { dateFromInput, dateInputValue, dayOnOrBefore, rowsInRange, setAnchor, setQuickRange } from "./menu-ops.js";

/** The first letter as a sentence starts: "last {count} years" in a list of choices is "Last …". */
const capital = (text, locale) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

/** The most periods a quick choice reaches back by itself to the data's latest record. */
const REACH = Object.freeze({ year: 10, quarter: 12, month: 24, week: 104, day: 90 });

/** The directions a quick choice counts N periods in; next and before are among More choices. */
const COUNTED = Object.freeze(["last", "next", "before"]);
const MORE = Object.freeze(["next", "before"]);

/** Whether a quick choice sits under More choices (next, before, rolling periods): More opens with it. */
export const inMore = (quick) => MORE.includes(quick.id) || (COUNTED.includes(quick.id) && quick.calendar === false);

/**
 * The quick choices of a date along the time line, each with the days it keeps, the data's share of
 * them and its rows: All; This [unit] (only the units whose current period has data; none: named in a
 * line); Last [N] [unit], with "Include the current <unit>" under it while it is set. More choices,
 * folded: Next [N] [unit], Before the last [N] [unit], rolling instead of whole calendar periods.
 * The units are none finer than the grouping (ruleKind's `units`). A choice applies at once, a count
 * typed a moment after the typing stops (and picks its choice), a unit chosen at once (Last keeps its
 * count while it reaches the data, else takes the smallest that does); each unit select is named
 * after its choice. When Last's current period has no data and it counts from today, a button under
 * it counts back from the latest record. "Counted back from": today, the latest or the first record,
 * or a date (one being typed keeps the last whole date for the ranges and says so); shown below the
 * choices when the data end before the current period or the reference is not today, else among
 * More choices. The line of the choices not offered stands right under them.
 */
export function QuickChoices({ ctx, quick, anchor, setAnchorLocal, span, column, counts, moreOpen, setMoreOpen }) {
    const { view, field, labels, locale, fk, timeZone, commit, note, back } = ctx;
    const lang = { lang: labels.lang, locale };
    const more = labels.relativeMore;
    const units = fk.units;
    const weekStart = view.formatting?.weekStart;
    const latestDay = isoDay(span.max);
    // today, once per opening of the level (the choices and their shares are measured against it)
    const [now] = useState(() => Date.now());
    const todayIso = todayIn(timeZone, now);
    /** The dates of a range counted from the reference date (`from` null for "before"); null when it leaves what a Date holds. */
    const datesOf = (spec, at = anchor) => {
        try {
            return relativeDateRange(spec.unit, spec.count ?? 1, { ...spec, anchor: at, timeZone, now, latest: span.max, first: span.min, weekStart });
        } catch {
            // a date of its own beyond what a Date holds
            return null;
        }
    };
    const rowsOf = (range) => (range ? rowsInRange(range, column.dict, counts) : 0);
    /** Whether a range with a start begins on or before the latest record: its last periods reach the data. */
    const reaches = (r) => r !== null && r.from !== null && dayOnOrBefore(r.from, latestDay);
    /** The smallest count of a unit whose last periods reach the latest record, up to REACH. */
    const reach = (unit) => {
        for (let n = 1; n <= REACH[unit]; n++) {
            if (reaches(datesOf({ unit, count: n }))) {
                return n;
            }
        }
        return REACH[unit];
    };
    // "Last 1 month" would be This month: 2 at least
    const defaultCount = (unit) => Math.max(2, reach(unit));
    const firstUnit = units.includes("month") ? "month" : units[0];
    const readCount = (text) => readNumber(text, { kind: "count", max: CATALOG.relativeMaxCount, labels, locale });
    /** A counted row as the view has it, or its start: the unit by the grouping, the count that reaches the data. */
    const rowOf = (d) =>
        quick.id === d
            ? { text: numberText(quick.count, locale), unit: quick.unit, current: quick.includeCurrent }
            : { text: numberText(d === "next" ? 1 : defaultCount(firstUnit), locale), unit: firstUnit, current: true };
    const [rows, setRows] = useState(() => Object.fromEntries(COUNTED.map((d) => [d, rowOf(d)])));
    const [thisUnit, setThisUnit] = useState(quick.id === "this" ? quick.unit : "year");
    const [rolling, setRolling] = useState(() => COUNTED.includes(quick.id) && quick.calendar === false);
    // a change that came from elsewhere (Undo, a rule, the search) shows in a count not being typed in
    const [editing, setEditing] = useState(/** @type {string | null} */ (null));
    const quickKey = JSON.stringify([quick.id, quick.unit, quick.count, quick.calendar, quick.includeCurrent]);
    const [seen, setSeen] = useState(quickKey);
    if (quickKey !== seen) {
        setSeen(quickKey);
        if (COUNTED.includes(quick.id)) {
            const d = quick.id;
            const own = rowOf(d);
            setRows({ ...rows, [d]: editing === d ? { ...own, text: rows[d].text } : own });
            setRolling(quick.calendar === false);
        } else if (quick.id === "this") {
            setThisUnit(/** @type {string} */ (quick.unit));
        }
    }
    const later = useLater();
    const group = useId();
    const groupName = useFormName();
    const formName = useFormName();
    const anchorId = useId();
    const moreId = useId();
    const set = (spec) => commit(setQuickRange(view, field, spec ? { ...spec, anchor, blanks: ctx.keepBlanks ? "include" : "exclude" } : null, quick.filters[0] ?? null), note);
    /** A counted row's range ({ direction, unit, count, ... }), null while its count is not one. */
    const specOf = (d, row = rows[d], roll = rolling) => {
        const n = readCount(row.text).value;
        return n === null ? null : { direction: d, unit: row.unit, count: n, calendar: !roll, includeCurrent: row.current };
    };
    // the days with data and the rows of a choice describe its radio (aria-describedby)
    const subId = (id) => `${group}-${id}`;
    /** The sub-line of a choice: the data's share of its days ("2025 (2026 has no data)") and its rows; rolling ranges in days. */
    const sub = (range, unit, id) => {
        if (!range) {
            return null;
        }
        const shownUnit = range.from === null || range.from.length > 10 || range.to.length > 10 ? "day" : unit;
        let period;
        /** @type {string | null} */
        let missing = null;
        if (range.from === null) {
            period = fill(more.until, { to: periodText({ from: range.to, to: range.to }, shownUnit, locale) });
        } else {
            const share = rangeShare(range, shownUnit, span, locale, todayIso);
            if (share?.none) {
                period = "";
                missing = fill(plural(labels.noData, 1, lang), { range: periodText({ from: range.from, to: share.to ?? range.to }, shownUnit, locale) });
            } else {
                period = share ? `${share.data} ` : periodText(range, shownUnit, locale);
                missing = share ? fill(plural(labels.noData, share.count, lang), { range: share.missing.join(", ") }) : null;
            }
        }
        return (
            <span className="pk-quick-sub" id={subId(id)}>
                <span>
                    {period}
                    {missing ? <span className="pk-quick-missing">{period ? `(${missing})` : missing}</span> : null}
                </span>
                <span className="pk-quick-rows">{fill(labels.quickRows, { rows: rowsOf(range).toLocaleString(locale) })}</span>
            </span>
        );
    };
    /** A choice's radio in a label with the words before its fields (a click on them picks it). */
    const radio = (id, checked, onPick, name, children, described = true) => (
        <label className="pk-radio pk-quick">
            <Radio
                name={groupName}
                checked={checked}
                onChange={onPick}
                aria-label={name}
                aria-describedby={described ? subId(id) : undefined}
                data-autofocus={checked && ctx.hint !== "conditions" ? "" : undefined}
                data-testid={`quick-${id}`}
            />
            {children}
        </label>
    );
    /** A unit's select, named after its choice ("Unit of “Last …”"), or its name alone when the grouping leaves one unit. */
    const unitPick = (value, options, onChange, testId, label) =>
        options.length > 1 ? (
            <select name={`${formName}-${testId}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testId}>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.text}
                    </option>
                ))}
            </select>
        ) : (
            <span aria-hidden="true">{options[0]?.text}</span>
        );

    const hidden = [];
    const main = [
        <div className="pk-quick-row" key="all">
            {radio("all", quick.id === "all", () => set(null), labels.filterAll, <span>{labels.filterAll}</span>)}
            <span className="pk-quick-sub" id={subId("all")}>
                <span>{`${dayText(isoDay(span.min), locale)}–${dayText(latestDay, locale)}`}</span>
                <span className="pk-quick-rows">{fill(labels.quickRows, { rows: column.codes.length.toLocaleString(locale) })}</span>
            </span>
        </div>
    ];
    // This [unit]: the units whose current period has data (the one set stays)
    const thisUnits = units.filter((u) => rowsOf(datesOf({ direction: "this", unit: u })) > 0 || (quick.id === "this" && quick.unit === u));
    if (thisUnits.length) {
        const u = thisUnits.includes(thisUnit) ? thisUnit : thisUnits[thisUnits.length - 1];
        const name = capital(more.this[u], locale);
        main.push(
            <div className="pk-quick-row" key="this">
                {radio("this", quick.id === "this", () => set({ direction: "this", unit: u }), name, thisUnits.length > 1 ? null : <span aria-hidden="true">{name}</span>)}
                {thisUnits.length > 1 && unitPick(
                    u,
                    thisUnits.map((o) => ({ value: o, text: capital(more.this[o], locale) })),
                    (v) => {
                        setThisUnit(v);
                        set({ direction: "this", unit: v });
                    },
                    "quick-this-unit",
                    labels.quickThisUnit
                )}
                {sub(datesOf({ direction: "this", unit: u }), u, "this")}
            </div>
        );
    } else {
        const year = datesOf({ direction: "this", unit: "year" });
        if (year?.from) {
            hidden.push(`${capital(more.this.year, locale)} (${periodText({ from: year.from, to: year.to }, "year", locale)})`);
        }
    }

    /** Last, Next or Before the last [N] [unit], with "Include the current <unit>" under it while it is set. */
    const counted = (d) => {
        const row = rows[d];
        const read = readCount(row.text);
        // the words around the count in its number ("Last [1] month", "Letztes [1] Jahr"); 2 while it is not a count
        const n = read.value ?? 2;
        // the forms with a place for the field instead of the number
        const formOf = (unit) => plural(Object.fromEntries(Object.entries(more[d][unit]).map(([k, v]) => [k, String(v).replace("{count}", "{n}")])), n, lang);
        const [before] = formOf(row.unit).split("{n}");
        const name = capital(fill(formOf(row.unit), { n: n.toLocaleString(locale) }), locale);
        const range = datesOf({ direction: d, unit: row.unit, count: n, calendar: !rolling, includeCurrent: row.current });
        const change = (patch, wait = false) => {
            const next = { ...row, ...patch };
            setRows({ ...rows, [d]: next });
            const run = () => {
                const spec = specOf(d, next);
                if (spec) {
                    set(spec);
                }
            };
            if (wait) {
                later.later(run);
            } else {
                later.cancel();
                run();
            }
        };
        const pickUnit = (unit) => {
            // Last keeps its count while it reaches the data, else takes the smallest count that does
            const r = d === "last" && read.value !== null ? datesOf({ unit, count: read.value, calendar: !rolling, includeCurrent: row.current }) : null;
            const keep = d !== "last" || reaches(r);
            change({ unit, ...(keep ? {} : { text: numberText(defaultCount(unit), locale) }) });
        };
        // the current period of the unit, for the words of its checkbox ("Nov 2026 has no data")
        const current = datesOf({ direction: "this", unit: row.unit });
        // empty only with a day before today in it: a period that starts today cannot have data yet (#586)
        const currentEmpty = current?.from ? rowsOf(current) === 0 && dayMs(namedUntil({ from: current.from, to: current.to }, span, todayIso)) >= dayMs(current.from) : false;
        return (
            <div className="pk-quick-row" key={d}>
                {radio(d, quick.id === d, () => change({}), name, <span aria-hidden="true">{capital(before.trimEnd(), locale)}</span>, range !== null)}
                <NumberField
                    value={row.text}
                    onChange={(t) => change({ text: t }, true)}
                    onKeyDown={fieldKeys({
                        now: later.now,
                        restore: () => {
                            later.cancel();
                            if (quick.id !== d) {
                                return false;
                            }
                            const was = numberText(/** @type {number} */ (quick.count), locale);
                            if (row.text === was) {
                                return false;
                            }
                            setRows({ ...rows, [d]: { ...row, text: was } });
                            return true;
                        },
                        back
                    })}
                    onBlur={() => {
                        setEditing(null);
                        later.now();
                    }}
                    onFocus={() => setEditing(d)}
                    problem={read.problem}
                    label={labels.quickCount[row.unit] ?? labels.quickCount.year}
                    testId={`quick-${d}-count`}
                    className="pk-field-label pk-count-input"
                />
                {unitPick(
                    row.unit,
                    units.map((u) => ({ value: u, text: formOf(u).split("{n}")[1]?.trim() ?? u })),
                    pickUnit,
                    `quick-${d}-unit`,
                    fill(labels.quickUnitOf, { choice: capital(before.trimEnd(), locale) })
                )}
                {sub(range, row.unit, d)}
                {quick.id === d && !rolling ? (
                    <label className="pk-check pk-quick-current">
                        <input type="checkbox" name={`${formName}-${d}-current`} checked={row.current} onChange={(e) => change({ current: e.target.checked })} data-testid={`quick-${d}-current`} />
                        <span>
                            {labels.quickCurrent[row.unit]}
                            {currentEmpty ? <span className="pk-quick-missing">{` (${fill(plural(labels.noData, 1, lang), { range: current?.from ? periodText({ from: current.from, to: current.to }, row.unit, locale) : "" })})`}</span> : null}
                        </span>
                    </label>
                ) : null}
                {/* the current period is empty because the data end before it: one click counts back from their end */}
                {quick.id === d && d !== "next" && currentEmpty && anchor === "today" ? (
                    <div className="pk-quick-fix">
                        <button type="button" className="pk-btn pk-small-btn" onClick={() => setAnchorTo("latest")} data-testid={`quick-${d}-from-latest`}>
                            <Icon name="date" size={14} />
                            <span className="pk-btn-text">{fill(labels.anchorUseLatest, { date: dayText(latestDay, locale) })}</span>
                        </button>
                    </div>
                ) : null}
            </div>
        );
    };
    main.push(counted("last"));

    // the reference date: below the choices when the data end before the current period (the month; the
    // year for a grouping by year or quarter) or when it is not today, else among More choices; placed
    // once, so it does not move while it is used
    const today = new Date(todayIso);
    const periodStart = fk.months ? Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) : Date.UTC(today.getUTCFullYear(), 0, 1);
    const [anchorOutside] = useState(() => span.max < periodStart || anchor !== "today");
    const anchorKind = ["today", "latest", "first"].includes(anchor) ? anchor : "date";
    // the date field shows a day ("2025-06-30" of a loaded "2025-06-30T18:00:00", "10000-01-01" of
    // "+010000-01-01"; a year before 1 it cannot hold); one being typed stays in the field, the range
    // keeps the last whole date until a whole date is there
    const [day, setDay] = useState(dateInputValue(anchorKind === "date" ? anchor : latestDay));
    const dayIso = dateFromInput(day);
    const dayWhole = dayIso !== null;
    // a date set elsewhere (Undo) shows in the field
    const [seenAnchor, setSeenAnchor] = useState(anchor);
    if (anchor !== seenAnchor) {
        setSeenAnchor(anchor);
        if (anchorKind === "date") {
            setDay(dateInputValue(anchor));
        }
    }
    const dayHint = `${anchorId}-hint`;
    const setAnchorTo = (a) => {
        setAnchorLocal(a);
        if (quick.filters.length) {
            commit(setAnchor(view, field, a), note);
        }
    };
    const anchorRow = (
        <div className="pk-quick-anchor">
            <label htmlFor={anchorId}>{labels.anchorLabel}</label>
            <select id={anchorId} name={`${formName}-anchor`} value={anchorKind} onChange={(e) => setAnchorTo(e.target.value === "date" ? (dayIso ?? latestDay) : e.target.value)} data-testid="quick-anchor">
                <option value="today">{fill(labels.anchorToday, { date: dayText(isoDay(today.getTime()), locale) })}</option>
                <option value="latest">{fill(labels.anchorLatest, { date: dayText(latestDay, locale) })}</option>
                <option value="first">{fill(labels.anchorFirst, { date: dayText(isoDay(span.min), locale) })}</option>
                <option value="date">{labels.anchorDate}</option>
            </select>
            {anchorKind === "date" ? (
                <input
                    type="date"
                    name={`${formName}-day`}
                    value={day}
                    onChange={(e) => {
                        setDay(e.target.value);
                        const iso = dateFromInput(e.target.value);
                        if (iso) {
                            setAnchorTo(iso);
                        }
                    }}
                    // left without a whole date: the one that applies comes back
                    onBlur={() => {
                        if (!dayWhole) {
                            setDay(dateInputValue(anchor));
                        }
                    }}
                    aria-label={labels.anchorDay}
                    aria-invalid={dayWhole ? undefined : true}
                    aria-describedby={dayWhole ? undefined : dayHint}
                    data-testid="quick-anchor-date"
                />
            ) : null}
            {anchorKind === "date" && !dayWhole ? (
                <p className="pk-hint pk-quick-missing" id={dayHint} data-testid="quick-anchor-date-hint">
                    {fill(labels.anchorDayIncomplete, { date: dayText(anchor, locale) })}
                </p>
            ) : null}
        </div>
    );
    return (
        <>
            <div role="radiogroup" aria-label={labels.quickTitle} className="pk-radios pk-quick-choices" data-testid="quick-choices">
                {main}
            </div>
            {hidden.length ? (
                <p className="pk-hint pk-quick-hidden" data-testid="quick-hidden">
                    {fill(plural(labels.quickHidden, hidden.length, lang), { choices: hidden.join(", "), latest: dayText(latestDay, locale) })}
                </p>
            ) : null}
            {anchorOutside ? anchorRow : null}
            <button type="button" className="pk-quick-more-toggle" aria-expanded={moreOpen} aria-controls={moreId} onClick={() => setMoreOpen(!moreOpen)} data-testid="quick-more">
                <Icon name={moreOpen ? "chevronDown" : "chevronRight"} size={14} />
                <span>{labels.quickMore}</span>
            </button>
            {moreOpen ? (
                <div id={moreId} className="pk-quick-more" data-testid="quick-more-body">
                    <div role="radiogroup" aria-label={labels.quickMore} className="pk-radios pk-quick-choices">
                        {counted("next")}
                        {counted("before")}
                    </div>
                    <label className="pk-check">
                        <input
                            type="checkbox"
                            name={`${formName}-rolling`}
                            checked={rolling}
                            onChange={(e) => {
                                setRolling(e.target.checked);
                                const spec = COUNTED.includes(quick.id) ? specOf(quick.id, rows[quick.id], e.target.checked) : null;
                                if (spec) {
                                    set(spec);
                                }
                            }}
                            data-testid="quick-rolling"
                        />
                        <span>{labels.quickRolling}</span>
                    </label>
                    {anchorOutside ? null : anchorRow}
                </div>
            ) : null}
        </>
    );
}
