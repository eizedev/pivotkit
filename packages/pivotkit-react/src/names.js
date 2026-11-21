/*
 * Names the UI writes for things the core leaves unnamed: a value ("Sum of Revenue", "% of grand
 * total of Revenue") and the derived field of a grouping ("Created by month"), in the labels' language;
 * what a click on a field of the field list does, and the zones folded into one line, in words.
 */

import { MAX_DATE_MS, fieldItems, fieldLabel, formatter, numberRepeats, relativeDateRange } from "pivotkit-core";
import { fill, plural } from "./labels.js";
import { hiddenNot, ruleOp } from "./view-ops.js";

/** A rule's short text, inverted in words when its `not` has no word of its own (hiddenNot). */
const withNot = (f, text, labels) => (hiddenNot(f) ? fill(labels.notRule, { rule: text }) : text);

/**
 * The names of a view's values, the chips' and the table headers': a repeated one numbered as the
 * exports name it ("Sum of Revenue (2)", pivotkit-core's numberRepeats).
 */
export const valueLabels = (values, labels) => numberRepeats(values.map((v) => valueLabel(v, labels)));

/** "Sum of Revenue", "% of grand total of Revenue", or the value's own name. */
export function valueLabel(spec, labels) {
    if (spec.label) {
        return spec.label;
    }
    const core = labels.core;
    let base;
    if (!spec.field) {
        base = core.countRows;
    } else {
        const agg = Object.hasOwn(core.aggregators, spec.agg) ? core.aggregators[spec.agg] : spec.agg;
        base = fill(core.valueName, { agg, field: fieldLabel(spec.field, core) });
    }
    if (!spec.showAs || !core.showAs || !core.showAsName) {
        return base;
    }
    const showAs = Object.hasOwn(core.showAs, spec.showAs.type) ? core.showAs[spec.showAs.type] : spec.showAs.type;
    return fill(core.showAsName, { showAs, value: spec.field && spec.agg === "sum" ? fieldLabel(spec.field, core) : base });
}

/**
 * The name of a measure a sort, a top N or a value condition goes by ({ field, agg }): the name of the
 * view's value for it ("Sum of Revenue", or the name the user gave it), without a "show as"
 * calculation, since the raw result is what is compared; the row count the view does not show is
 * "Count of rows".
 * @param {any} view
 * @param {{ field: string | null, agg: string } | null | undefined} ref
 * @param {import("./labels.js").UiLabels} labels
 */
export function refLabel(view, ref, labels) {
    const field = ref?.field ?? null;
    const sameField = (v) => (field === null || v.field === null || v.field === undefined ? (v.field ?? null) === field : v.field.toLowerCase() === field.toLowerCase());
    const spec = ref ? (view.values ?? []).find((v) => v.agg === ref.agg && sameField(v)) : undefined;
    if (!spec && field === null) {
        return labels.countOfRows;
    }
    return valueLabel({ ...(spec ?? ref), showAs: null }, labels);
}

/**
 * The column a sort by one column goes by, as the table names its items ("2025 › Jul"): each item by
 * pivotkit-core's fieldItems of its column field.
 * @param {any} view
 * @param {any[]} column
 * @param {import("pivotkit-core").Encoded} encoded
 */
export function columnText(view, column, encoded, labels, locale) {
    return column
        .map((key, i) => {
            const items = fieldItems(encoded, view.cols[i], { view, locale, labels: labels.core })?.items ?? [];
            return items.find((item) => item.value === key)?.label ?? String(key);
        })
        .join(" › ");
}

/**
 * A sort in words: "Z to A", "Largest Sum of Revenue first", "Custom order".
 * @param {any} view
 * @param {{ by: string, order: string, value?: { field: string | null, agg: string }, column?: any[] }} sort
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} [columnText]  the column of a sort by one column, as the table names it ("Jul",
 *   "2025 › Jul"); default its items as text
 */
export function sortText(view, sort, labels, columnText) {
    const desc = sort.order === "desc";
    if (sort.by === "value") {
        const name = refLabel(view, sort.value, labels);
        const value = sort.column ? fill(labels.valueInColumn, { value: name, column: columnText ?? sort.column.map(String).join(" › ") }) : name;
        return fill(desc ? labels.sortValueDesc : labels.sortValueAsc, { value });
    }
    if (sort.by === "custom") {
        return desc ? labels.sortCustomDesc : labels.sortCustom;
    }
    return desc ? labels.sortLabelDesc : labels.sortLabelAsc;
}

/** The signs of the comparisons in a value condition's short text; between has words. */
const OP_SIGNS = Object.freeze({ "=": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤" });

/**
 * A value condition in short: "Sum of Revenue > 1,000", "Sum of Revenue between 5 and 8".
 * @param {any} view
 * @param {{ by?: { field: string | null, agg: string }, op: string, value: number, value2?: number }} f  a `value` filter
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 */
export function valueConditionText(view, f, labels, locale) {
    const number = (x) => (typeof x === "number" ? x.toLocaleString(locale, { maximumFractionDigits: 6 }) : "");
    const value = refLabel(view, f.by ?? (view.values?.[0] ? { field: view.values[0].field ?? null, agg: view.values[0].agg } : null), labels);
    const op = ruleOp(f);
    if (op === "between" || op === "notBetween") {
        // the engine compares with the smaller number first; so does the text
        const [from, to] = typeof f.value2 === "number" && f.value2 < f.value ? [f.value2, f.value] : [f.value, f.value2];
        return fill(labels.valueConditions[op], { value, from: number(from), to: number(to) });
    }
    return withNot(f, fill(labels.valueConditions.compare, { value, op: Object.hasOwn(OP_SIGNS, op) ? OP_SIGNS[op] : op, number: number(f.value) }), labels);
}

// ISO days of any year a Date holds: four digits for the years 0 to 9999, else a sign and six digits
// ("-000001-01-11" is 2 BC, "+010000-02-29"), as pivotkit-core writes and reads them. Days are compared
// by their ms, never as text: "-000002" sorts after "-000001".

/** The day of an ISO day or minute: "2026-03-01" of "2026-03-01T14:00". */
const dayPart = (iso) => iso.split("T")[0];

/** Wall-clock ms of an ISO day (or of a minute's day). */
export const dayMs = (iso) => Date.parse(`${dayPart(iso)}T00:00Z`);

/** The year of an ISO day: 2026 of "2026-03-01", -1 of "-000001-01-11". */
export const yearOf = (iso) => Number(iso.slice(0, iso.indexOf("-", 1)));

/** The month of an ISO day, 1 to 12. */
const monthOf = (iso) => Number(dayPart(iso).slice(-5, -3));

/** A year as an ISO day writes it: "0002", "2026", "-000001", "+010000". */
export const isoYear = (y) => (y >= 0 && y <= 9999 ? String(y).padStart(4, "0") : `${y < 0 ? "-" : "+"}${String(Math.abs(y)).padStart(6, "0")}`);

/** Midsummer of a year (1 January of the first year a Date holds is before its first day). */
const midYear = (y) => {
    const d = new Date(0);
    d.setUTCFullYear(y, 6, 1);
    return d;
};

/**
 * A year as the table writes it (pivotkit-core's year grouping): "2026", before 1 AD with its era
 * ("2 BC", "2 v. Chr."), always in the Gregorian calendar.
 * @param {number} y  astronomical: 0 is 1 BC
 * @param {string} locale
 */
export const yearText = (y, locale) => (y >= 1 ? String(y) : midYear(y).toLocaleDateString(locale, { year: "numeric", era: "short", calendar: "gregory", timeZone: "UTC" }));

/** A month of an ISO day as the table writes it: "Mar 2026", "Jan 2 BC". */
const monthText = (iso, locale) => {
    const y = yearOf(iso);
    // the first month a Date holds starts on 20 April
    const at = Math.max(dayMs(`${isoYear(y)}-${String(monthOf(iso)).padStart(2, "0")}-01`) || -MAX_DATE_MS, -MAX_DATE_MS);
    return new Date(at).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC", ...(y < 1 ? { era: "short" } : {}) });
};

/** A calendar day ("2022-03-01") as the locale writes a date, a year before 1 AD with its era (pivotkit-core's `date` format). */
export const dayText = (iso, locale) => formatter("date", { locale })(dayMs(iso));

/** A calendar day of wall-clock ms ("2022-03-01", "-000001-01-11"), as a date column holds dates. */
export const isoDay = (ms) => new Date(ms).toISOString().split("T")[0];

/** The next and the previous calendar day of an ISO day. */
const dayAfter = (iso, n = 1) => isoDay(dayMs(iso) + n * 86_400_000);

/**
 * The days a relative filter keeps, both included (pivotkit-core's relativeDateRange): counted back
 * from today (`now`, default the current time) or, with `anchor: "latest"`, from the data's latest
 * date (`latest`, wall-clock ms); null without one then, or for a range that leaves what a Date holds.
 * @param {{ unit: string, count?: number, anchor?: string, direction?: string, calendar?: boolean, includeCurrent?: boolean }} f  a `relative` filter
 * @param {string} timeZone  the data's
 * @param {Date | number | string} [now]
 * @param {number | null} [latest]
 * @param {{ first?: number | null, weekStart?: number }} [more]  the data's first date (anchor "first"), the view's first day of a week
 * @returns {{ from: string, to: string } | null}  null too for a range without a start ("before")
 */
export function relativeDays(f, timeZone, now, latest, more = {}) {
    const range = datesOf(f, timeZone, now, latest, more);
    return range && range.from !== null ? { from: range.from, to: range.to } : null;
}

/** Today in a time zone as an ISO day (`now`, default the current time); the UTC day beyond what a Date holds. */
export const todayIn = (timeZone, now) => relativeDays({ unit: "day" }, timeZone, now)?.from ?? isoDay(now === undefined ? Date.now() : new Date(now).getTime());

/**
 * The last day of a range whose lack of data is worth a word (#586): yesterday when the range holds
 * today and the data have no date after today (the days from today on cannot have data yet), else
 * the range's end. Rows dated after today (end-of-life dates, plans) keep every day, and so does a
 * range wholly after today.
 * @param {{ from: string, to: string }} range  ISO days (a minute's day is read)
 * @param {{ min: number, max: number }} span  the data's first and last date (wall-clock ms)
 * @param {string} today  today in the data's time zone (ISO day)
 */
export function namedUntil(range, span, today) {
    const [from, to] = [dayPart(range.from), dayPart(range.to)];
    const ended = dayMs(isoDay(span.max)) <= dayMs(today);
    return ended && dayMs(from) <= dayMs(today) && dayMs(today) <= dayMs(to) ? dayAfter(today, -1) : to;
}

/** The dates of any relative filter (relativeDays' arguments): `from` null for "before". */
const datesOf = (f, timeZone, now, latest, more = {}) =>
    relativeDateRange(f.unit, f.count ?? 1, { timeZone, now, anchor: f.anchor, latest: latest ?? undefined, first: more.first ?? undefined, direction: f.direction, calendar: f.calendar, includeCurrent: f.includeCurrent, weekStart: more.weekStart });

/**
 * Whether a relative range is said in short with its periods ("last 3 months (Aug–Oct 2026)", "this
 * quarter (Q4 2026)"): the last N or this day, week, month, quarter or year, in whole calendar
 * periods, counted from today or from the latest record. The others are said with their dates.
 * @param {{ unit: string, direction?: string, calendar?: boolean, includeCurrent?: boolean, anchor?: string }} f
 */
export const plainRange = (f) =>
    ["last", "this"].includes(f.direction ?? "last") && f.calendar !== false && (f.anchor === undefined || f.anchor === "today" || f.anchor === "latest") && ["year", "quarter", "month", "week", "day"].includes(f.unit);

/**
 * A range of days as the unit writes it: "2022–2026" for years, "Q4 2025–Q3 2026" for quarters, "Dec
 * 2025–Nov 2026" for months, dates for weeks and days; one period alone ("2026").
 * @param {{ from: string, to: string }} range  ISO days, both included (a minute's day is read)
 * @param {string} unit
 * @param {string} locale
 */
export function periodText(range, unit, locale) {
    const year = (iso) => yearText(yearOf(iso), locale);
    const quarter = (iso) => `Q${Math.floor((monthOf(iso) - 1) / 3) + 1} ${year(iso)}`;
    const text = unit === "year" ? year : unit === "quarter" ? quarter : unit === "month" ? (iso) => monthText(iso, locale) : (iso) => dayText(dayPart(iso), locale);
    const [from, to] = [text(range.from), text(range.to)];
    return from === to ? from : `${from}–${to}`;
}

/**
 * The days a relative date range keeps, as the unit writes them: "2022–2026" for years, "Dec
 * 2025–Nov 2026" for months, dates for days; one period alone ("2026"); "" for no range.
 * @param {{ unit: string, count: number, anchor?: string }} f  a `relative` filter
 * @param {string} locale
 * @param {string} timeZone  the data's
 * @param {Date | number | string} [now]  today, default the current time
 * @param {number | null} [latest]  the data's latest date (wall-clock ms), for anchor "latest"
 */
export function rangeText(f, locale, timeZone, now, latest) {
    const range = relativeDays(f, timeZone, now, latest);
    return range ? periodText(range, f.unit, locale) : "";
}

/**
 * The data's share of a range: which of its days have data and which have none. Null when the data
 * cover the whole range; `none` when they cover none of it; else the days with data (`data`) and
 * the parts without, as years when whole years have no data ("2026"), else as the unit writes them.
 * @param {{ from: string, to: string }} range  ISO days
 * @param {string} unit
 * @param {{ min: number, max: number }} span  the data's first and last date (wall-clock ms)
 * @param {string} locale
 * @param {string} today  today in the data's time zone (ISO day). The days `namedUntil` leaves out are
 *   not named: null when only they lack data; `none` with `to`, the last day to name, when that is
 *   before the range's end
 * @returns {{ none: true, to?: string } | { none: false, data: string, missing: string[], count: number } | null}  `count`: how many
 *   periods have no data, for the words ("2026 has no data", "2021–2022 have no data")
 */
export function rangeShare(range, unit, span, locale, today) {
    // the data cover the whole period (year, month, day) their first and last date fall in; a quarter
    // is measured in months, a week in days
    const grain = unit === "quarter" ? "month" : unit === "week" ? "day" : unit;
    range = { from: dayPart(range.from), to: dayPart(range.to) };
    const until = namedUntil(range, span, today);
    const [first, last] = [periodStart(isoDay(span.min), grain), periodEnd(isoDay(span.max), grain)];
    if (dayMs(first) <= dayMs(range.from) && dayMs(last) >= dayMs(until)) {
        return null;
    }
    const from = dayMs(range.from) > dayMs(first) ? range.from : first;
    const to = dayMs(range.to) < dayMs(last) ? range.to : last;
    if (dayMs(from) > dayMs(to)) {
        return dayMs(range.from) > dayMs(until) ? null : until === range.to ? { none: true } : { none: true, to: until };
    }
    const missing = [];
    let count = 0;
    /** A part of the range without data: its years that have no data at all, the rest as the unit writes it. */
    const part = (a, b, dataYear) => {
        const years = [];
        const [ya, yb] = [yearOf(a), yearOf(b)];
        // the years outside the data's own: whole years without data, written as years
        for (let y = ya; y <= yb; y++) {
            if (y !== dataYear) {
                years.push(y);
            }
        }
        if (years.length) {
            missing.push(years.length === 1 ? yearText(years[0], locale) : `${yearText(years[0], locale)}–${yearText(years[years.length - 1], locale)}`);
            count += years.length;
        }
        if (ya <= dataYear && dataYear <= yb) {
            // the remainder inside a year that has data
            const yearFrom = `${isoYear(dataYear)}-01-01`;
            const yearTo = `${isoYear(dataYear)}-12-31`;
            const rest = { from: dayMs(a) > dayMs(yearFrom) ? a : yearFrom, to: dayMs(b) < dayMs(yearTo) ? b : yearTo };
            missing.push(periodText(rest, unit, locale));
            count += periodText({ from: rest.from, to: rest.from }, unit, locale) === periodText({ from: rest.to, to: rest.to }, unit, locale) ? 1 : 2;
        }
    };
    const before = dayMs(until) < dayMs(first) ? until : dayAfter(first, -1);
    if (dayMs(range.from) <= dayMs(before)) {
        part(range.from, before, yearOf(first));
    }
    if (dayMs(until) > dayMs(last)) {
        part(dayAfter(last), until, yearOf(last));
    }
    return missing.length ? { none: false, data: periodText({ from, to }, unit, locale), missing, count } : null;
}

/** The first day of the year, month or day an ISO day falls in. */
const periodStart = (iso, unit) => (unit === "year" ? `${isoYear(yearOf(iso))}-01-01` : unit === "month" ? `${iso.slice(0, -3)}-01` : iso);

/** The last day of the year, month or day an ISO day falls in. */
function periodEnd(iso, unit) {
    if (unit === "day") {
        return iso;
    }
    const [y, m] = [yearOf(iso), monthOf(iso)];
    // setUTCFullYear, not Date.UTC, which reads the years 0 to 99 as 1900 to 1999
    const end = new Date(0);
    end.setUTCFullYear(y, unit === "year" ? 11 : m, unit === "year" ? 31 : 0);
    return isoDay(Math.min(end.getTime(), MAX_DATE_MS) || MAX_DATE_MS);
}

/**
 * A relative date range in short, with the days it keeps: "last 5 years (2022–2026)", "this year
 * (2026)". With the data's span, the data's share of them: "last 2 years (2025; 2026 has no data)",
 * "this year (2026 has no data)". The days from today on are not named while the data have no date
 * after today: they cannot have data yet (namedUntil, #586).
 * Anchored at the data's latest date: "last 12 months to Dec 2025",
 * its days only when the data do not cover them all.
 * @param {{ unit: string, count?: number, anchor?: string, direction?: string, calendar?: boolean, includeCurrent?: boolean }} f  a `relative` filter
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 * @param {string} timeZone  the data's
 * @param {Date | number | string} [now]  today, default the current time
 * @param {{ min: number, max: number } | null} [span]  the data's first and last date (wall-clock ms)
 * @param {number} [weekStart]  the view's first day of a week, 1 (Monday, the default) to 7
 */
export function relativeText(f, labels, locale, timeZone, now, span, weekStart) {
    if (!plainRange(f)) {
        return otherRangeText(f, labels, locale, timeZone, now, span, weekStart);
    }
    const more = labels.relativeMore;
    const count = f.count ?? 1;
    // one year is "this year" (the quick choice of that name); one month or day keeps the count in the singular, as the radio "Last [1] month" says it
    const key = count === 1 ? f.unit : `${f.unit}s`;
    let text =
        f.direction === "this"
            ? more.this[f.unit] ?? f.unit
            : Object.hasOwn(labels.relative, key)
              ? fill(labels.relative[key], { count: count.toLocaleString(locale) })
              : fill(plural(more.last[f.unit] ?? { other: f.unit }, count, { lang: labels.lang, locale }), { count: count.toLocaleString(locale) });
    const range = relativeDays(f, timeZone, now, span?.max, { weekStart });
    const latest = f.anchor === "latest";
    // counted to the latest record, its end says which period is the last one
    if (f.includeCurrent === false && f.direction !== "this" && !latest) {
        text = fill(more.withoutCurrent, { text });
    }
    if (!range) {
        return text;
    }
    if (latest) {
        text = fill(labels.relativeTo, { text, end: periodText({ from: range.to, to: range.to }, f.unit, locale) });
    }
    const share = span ? rangeShare(range, f.unit, span, locale, todayIn(timeZone, now)) : null;
    if (!share) {
        return latest ? text : fill(labels.withRange, { text, range: periodText(range, f.unit, locale) });
    }
    const lang = { lang: labels.lang, locale };
    if (share.none) {
        return fill(labels.withRange, { text, range: fill(plural(labels.noData, 1, lang), { range: periodText({ from: range.from, to: share.to ?? range.to }, f.unit, locale) }) });
    }
    return fill(labels.withShare, { text, range: share.data, missing: fill(plural(labels.noData, share.count, lang), { range: share.missing.join(", ") }) });
}

/**
 * A relative range the menus do not write (a loaded view's: next, this, before, rolling, without the
 * current unit, hours, weeks, quarters, counted from the first record or a date) in words, with the
 * dates it keeps: "next 2 weeks (Mar 16, 2026 – Mar 29, 2026)", "before the last 30 days, rolling
 * (until Feb 13, 2026, 11:59 AM)".
 */
function otherRangeText(f, labels, locale, timeZone, now, span, weekStart) {
    const more = labels.relativeMore;
    const lang = { lang: labels.lang, locale };
    const direction = f.direction ?? "last";
    let text = direction === "this" ? more.this[f.unit] ?? f.unit : plural(more[direction]?.[f.unit] ?? { other: f.unit }, f.count ?? 1, lang);
    if (f.calendar === false && direction !== "this") {
        text = fill(more.rolling, { text });
    } else if (f.includeCurrent === false && direction !== "this") {
        text = fill(more.withoutCurrent, { text });
    }
    if (f.anchor === "latest") {
        text = fill(more.fromLatest, { text });
    } else if (f.anchor === "first") {
        text = fill(more.fromFirst, { text });
    } else if (f.anchor && f.anchor !== "today") {
        text = fill(more.fromDate, { text, date: pointText(f.anchor, locale) });
    }
    const range = datesOf(f, timeZone, now, span?.max, { first: span?.min, weekStart });
    if (!range) {
        return text;
    }
    // bounds at midnight (a rolling range from a date of its own) are said as days, not as "12:00 AM"
    const days = (range.from === null || range.from.endsWith("T00:00")) && range.to.endsWith("T00:00");
    const point = (iso) => pointText(days ? iso.slice(0, 10) : iso, locale);
    const to = point(range.to);
    return fill(labels.withRange, { text, range: range.from === null ? fill(more.until, { to }) : range.from === range.to ? to : `${point(range.from)} – ${to}` });
}

/**
 * The start of a comparison's unit ("2026-02-01", "2026-03-01T14:00") as its precision writes it: the
 * year "2026", the quarter "Q1 2026", the month "Feb 2026", the day, the hour.
 */
function precisionText(iso, precision, locale) {
    if (precision === "year" || precision === "quarter" || precision === "month") {
        if (precision === "month") {
            return monthText(iso, locale);
        }
        const year = yearText(yearOf(iso), locale);
        return precision === "year" ? year : `Q${Math.floor((monthOf(iso) - 1) / 3) + 1} ${year}`;
    }
    return pointText(iso, locale);
}

/** A day ("2026-03-01") or a minute ("2026-03-01T14:00") as the locale writes it. */
const pointText = (iso, locale) => (iso.includes("T") ? formatter("datetime", { locale })(Date.parse(`${iso}Z`)) : dayText(iso, locale));

/**
 * The years two calendar days bound as whole years (Jan 1 to Dec 31; in the first and last year a
 * Date holds, its first and last day), or null: the days a comparison on a date grouping's source
 * dates gets from Years combined.
 * @returns {[number, number] | null}
 */
export function wholeYears(from, to) {
    const day = /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}$/;
    const whole =
        typeof from === "string" &&
        typeof to === "string" &&
        day.test(from) &&
        day.test(to) &&
        (from.endsWith("-01-01") || from === isoDay(-MAX_DATE_MS)) &&
        (to.endsWith("-12-31") || to === isoDay(MAX_DATE_MS));
    return whole ? [yearOf(from), yearOf(to)] : null;
}

/**
 * A comparison of the item itself in short: "from 2022", "2022 to 2024" for a date or a date
 * grouping, "≥ 10" for a number. `labelOf` gives an item's label (a grouping's "Mar 2025").
 * @param {{ op: string, value: number | string, value2?: number | string, precision?: string, not?: boolean }} f  a `compare` filter
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 * @param {{ date: boolean, labelOf?: (value: number) => string | undefined }} kind
 */
export function compareText(f, labels, locale, { date, labelOf }) {
    // a date grouping's key without its label is written as it is (2022, not 2,022)
    const shown = (v) => (typeof v === "string" ? precisionText(v, f.precision, locale) : labelOf?.(v) ?? (date ? String(v) : v.toLocaleString(locale, { maximumFractionDigits: 6 })));
    const forms = labels.compareShort;
    const op = ruleOp(f);
    if (op === "between" || op === "notBetween") {
        // the earlier first, as the engine reads them (days by their ms: "-000002" is before "-000001")
        const order = (v) => (typeof v === "string" ? dayMs(v) : v);
        const [from, to] = f.value2 !== undefined && order(f.value2) < order(f.value) ? [f.value2, f.value] : [f.value, f.value2];
        // whole years of days (Years combined): "2024 to 2025", "2025", "not 2025"
        const years = wholeYears(from, to)?.map((y) => yearText(y, locale));
        if (years) {
            return years[0] === years[1] ? fill(forms[op === "between" ? "=" : "!="], { value: years[0] }) : fill(forms[op], { from: years[0], to: years[1] });
        }
        return fill(forms[op], { from: shown(from), to: shown(to) });
    }
    return withNot(f, date && Object.hasOwn(forms, op) ? fill(forms[op], { value: shown(f.value) }) : `${Object.hasOwn(OP_SIGNS, op) ? OP_SIGNS[op] : op} ${shown(f.value)}`, labels);
}

/**
 * A rule on a field's items in short, as its chip and its menu say it: "last 5 years (2022–2026)",
 * "from 2022", "contains “an”".
 * @param {{ type: string, op?: string, value?: any, value2?: any, unit?: string, count?: number, not?: boolean }} f  a `relative`, `compare` or `text` filter
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 * @param {{ timeZone: string, date: boolean, labelOf?: (value: number) => string | undefined, span?: { min: number, max: number } | null, weekStart?: number }} kind
 *   `span`: the data's first and last date, for the data's share of a relative range; `weekStart`: the view's first day of a week
 */
export function itemRuleText(f, labels, locale, { timeZone, date, labelOf, span, weekStart }) {
    if (f.type === "relative") {
        return withNot(f, relativeText(/** @type {any} */ (f), labels, locale, timeZone, undefined, span, weekStart), labels);
    }
    if (f.type === "compare") {
        return compareText(/** @type {any} */ (f), labels, locale, { date, labelOf });
    }
    const op = ruleOp(f);
    return withNot(f, `${Object.hasOwn(labels.labelOps, op) ? labels.labelOps[op] : op} ${fill(labels.quote, { text: f.value })}`, labels);
}

/** The name of a derived field for a grouping, in the labels' language: "Date by month", "Amount (by 100)". */
export function groupingName(source, unit, labels, size) {
    const inName = labels.unitInName && Object.hasOwn(labels.unitInName, unit) ? labels.unitInName[unit] : labels.units[unit];
    return unit === "bin" ? fill(labels.binsName, { field: source, size }) : fill(labels.derivedName, { field: source, unit: inName ?? unit });
}


/** The zone a click on a field of the field list puts it in: numbers to Values, the rest to Rows. */
export const quickZone = (type) => (type === "number" ? "values" : "rows");

/**
 * What a click (or Enter) on a field of the field list does, from its type and the zones it is in:
 * "add" it to its quick zone, "move" it there from Columns or Filters (a field is on one axis only),
 * or nothing when it is in that zone already, as in Excel's field list: a number in Values is not
 * added a second time by a click, only by "Add to Values again" in its menu. `name` is the button's
 * accessible name (the field and where it is), `description` the action in words.
 * @param {string} field
 * @param {string} type
 * @param {string[]} zones  the zones the field is in
 * @param {import("./labels.js").UiLabels} labels
 * @returns {{ zone: string, kind: "add" | "move" | null, name: string, description: string }}
 */
export function fieldAction(field, type, zones, labels) {
    const zone = quickZone(type);
    const kind = zones.includes(zone) ? null : zone !== "values" && zones.some((z) => z === "cols" || z === "filters") ? "move" : "add";
    const name = zones.length ? `${field}, ${fill(labels.inZone, { zone: zones.map((z) => labels.zones[z] ?? z).join(", ") })}` : field;
    const description = kind === null ? "" : fill(kind === "move" ? labels.moveTo : labels.addTo, { zone: labels.zones[zone] });
    return { zone, kind, name, description };
}

/** The order of the zones in the one-line summary of the compact layout. */
const SUMMARY_ORDER = Object.freeze(["rows", "cols", "values", "filters"]);

/**
 * The zones in one line, for the compact layout: "Rows: Team · Columns: Priority · Values: Count of
 * Ticket"; zones without a field are left out.
 * @param {Record<string, Array<{ text: string }>>} entries  the chips of each zone (zoneEntries)
 * @param {import("./labels.js").UiLabels} labels
 * @returns {Array<{ zone: string, title: string, fields: string }>}  empty when no field is placed
 */
export function layoutSummary(entries, labels) {
    return SUMMARY_ORDER.filter((zone) => entries[zone] && entries[zone].length).map((zone) => ({ zone, title: labels.zones[zone], fields: entries[zone].map((e) => e.text).join(", ") }));
}
