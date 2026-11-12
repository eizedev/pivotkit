/*
 * Names the UI writes for things the core leaves unnamed: a value ("Sum of Revenue", "% of grand
 * total of Revenue") and the derived field of a grouping ("Created by month"), in the labels' language;
 * what a click on a field of the field list does, and the zones folded into one line, in words.
 */

import { fieldLabel, relativeDateRange } from "pivotkit-core";
import { fill, plural } from "./labels.js";
import { hiddenNot, ruleOp } from "./view-ops.js";

/** A rule's short text, inverted in words when its `not` has no word of its own (hiddenNot). */
const withNot = (f, text, labels) => (hiddenNot(f) ? fill(labels.notRule, { rule: text }) : text);

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
 * A sort in words: "Z to A", "Largest Sum of Revenue first", "Custom order".
 * @param {any} view
 * @param {{ by: string, order: string, value?: { field: string | null, agg: string } }} sort
 * @param {import("./labels.js").UiLabels} labels
 */
export function sortText(view, sort, labels) {
    const desc = sort.order === "desc";
    if (sort.by === "value") {
        return fill(desc ? labels.sortValueDesc : labels.sortValueAsc, { value: refLabel(view, sort.value, labels) });
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

/** A calendar day ("2022-03-01") as the locale writes a date. */
export const dayText = (iso, locale) => new Date(`${iso}T00:00Z`).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" });

/** A calendar day of wall-clock ms ("2022-03-01"), as a date column holds dates. */
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The next and the previous calendar day of an ISO day. */
const dayAfter = (iso, n = 1) => isoDay(Date.parse(`${iso}T00:00Z`) + n * 86_400_000);

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

/** The dates of any relative filter (relativeDays' arguments): `from` null for "before". */
const datesOf = (f, timeZone, now, latest, more = {}) =>
    relativeDateRange(f.unit, f.count ?? 1, { timeZone, now, anchor: f.anchor, latest: latest ?? undefined, first: more.first ?? undefined, direction: f.direction, calendar: f.calendar, includeCurrent: f.includeCurrent, weekStart: more.weekStart });

/**
 * Whether a relative range is one the menus write: the last N years, months or days, whole, the
 * current one included, counted from today or from the latest record.
 * @param {{ unit: string, direction?: string, calendar?: boolean, includeCurrent?: boolean, anchor?: string }} f
 */
export const plainRange = (f) => (f.direction ?? "last") === "last" && f.calendar !== false && f.includeCurrent !== false && (f.anchor === undefined || f.anchor === "today" || f.anchor === "latest") && ["year", "month", "day"].includes(f.unit);

/**
 * A range of days as the unit writes it: "2022–2026" for years, "Dec 2025–Nov 2026" for months, dates
 * for days; one period alone ("2026").
 * @param {{ from: string, to: string }} range  ISO days, both included
 * @param {string} unit
 * @param {string} locale
 */
export function periodText(range, unit, locale) {
    const month = (iso) => new Date(`${iso}T00:00Z`).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });
    const text = unit === "year" ? (iso) => iso.slice(0, 4) : unit === "month" ? month : (iso) => dayText(iso, locale);
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
 * @returns {{ none: true } | { none: false, data: string, missing: string[], count: number } | null}  `count`: how many
 *   periods have no data, for the words ("2026 has no data", "2021–2022 have no data")
 */
export function rangeShare(range, unit, span, locale) {
    // the data cover the whole period (year, month, day) their first and last date fall in
    const [first, last] = [periodStart(isoDay(span.min), unit), periodEnd(isoDay(span.max), unit)];
    if (first <= range.from && last >= range.to) {
        return null;
    }
    const from = range.from > first ? range.from : first;
    const to = range.to < last ? range.to : last;
    if (from > to) {
        return { none: true };
    }
    const missing = [];
    let count = 0;
    /** A part of the range without data: its years that have no data at all, the rest as the unit writes it. */
    const part = (a, b, dataYear) => {
        const years = [];
        const [ya, yb] = [Number(a.slice(0, 4)), Number(b.slice(0, 4))];
        // the years outside the data's own: whole years without data, written as years
        for (let y = ya; y <= yb; y++) {
            if (y !== dataYear) {
                years.push(y);
            }
        }
        if (years.length) {
            missing.push(years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`);
            count += years.length;
        }
        if (ya <= dataYear && dataYear <= yb) {
            // the remainder inside a year that has data
            const yearFrom = `${String(dataYear).padStart(4, "0")}-01-01`;
            const yearTo = `${String(dataYear).padStart(4, "0")}-12-31`;
            const rest = { from: a > yearFrom ? a : yearFrom, to: b < yearTo ? b : yearTo };
            missing.push(periodText(rest, unit, locale));
            count += periodText({ from: rest.from, to: rest.from }, unit, locale) === periodText({ from: rest.to, to: rest.to }, unit, locale) ? 1 : 2;
        }
    };
    if (range.from < first) {
        part(range.from, dayAfter(first, -1), Number(first.slice(0, 4)));
    }
    if (range.to > last) {
        part(dayAfter(last), range.to, Number(last.slice(0, 4)));
    }
    return { none: false, data: periodText({ from, to }, unit, locale), missing, count };
}

/** The first day of the year, month or day an ISO day falls in. */
const periodStart = (iso, unit) => (unit === "year" ? `${iso.slice(0, 4)}-01-01` : unit === "month" ? `${iso.slice(0, 7)}-01` : iso);

/** The last day of the year, month or day an ISO day falls in. */
function periodEnd(iso, unit) {
    if (unit === "day") {
        return iso;
    }
    const [y, m] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
    return isoDay(unit === "year" ? Date.UTC(y, 11, 31) : Date.UTC(y, m, 0));
}

/**
 * A relative date range in short, with the days it keeps: "last 5 years (2022–2026)", "this year
 * (2026)". With the data's span, the data's share of them: "last 2 years (2025; 2026 has no data)",
 * "this year (2026 has no data)". Anchored at the data's latest date: "last 12 months to Dec 2025",
 * its days only when the data do not cover them all.
 * @param {{ unit: string, count: number, anchor?: string }} f  a `relative` filter
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
    // one year is "this year" (the quick choice of that name); one month or day keeps the count in the singular, as the radio "Last [1] month" says it
    const key = f.count === 1 ? f.unit : `${f.unit}s`;
    let text = fill(Object.hasOwn(labels.relative, key) ? labels.relative[key] : key, { count: f.count.toLocaleString(locale) });
    const range = relativeDays(f, timeZone, now, span?.max);
    if (!range) {
        return text;
    }
    const latest = f.anchor === "latest";
    if (latest) {
        text = fill(labels.relativeTo, { text, end: periodText({ from: range.to, to: range.to }, f.unit, locale) });
    }
    const share = span ? rangeShare(range, f.unit, span, locale) : null;
    if (!share) {
        return latest ? text : fill(labels.withRange, { text, range: periodText(range, f.unit, locale) });
    }
    const lang = { lang: labels.lang, locale };
    if (share.none) {
        return fill(labels.withRange, { text, range: fill(plural(labels.noData, 1, lang), { range: periodText(range, f.unit, locale) }) });
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
    const to = pointText(range.to, locale);
    return fill(labels.withRange, { text, range: range.from === null ? fill(more.until, { to }) : range.from === range.to ? to : `${pointText(range.from, locale)} – ${to}` });
}

/**
 * The start of a comparison's unit ("2026-02-01", "2026-03-01T14:00") as its precision writes it: the
 * year "2026", the quarter "Q1 2026", the month "Feb 2026", the day, the hour.
 */
function precisionText(iso, precision, locale) {
    if (precision === "year" || precision === "quarter" || precision === "month") {
        const at = new Date(`${iso.slice(0, 10)}T00:00Z`);
        if (precision === "month") {
            return at.toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });
        }
        return precision === "year" ? iso.slice(0, iso.length - 6) : `Q${Math.floor(at.getUTCMonth() / 3) + 1} ${iso.slice(0, iso.length - 6)}`;
    }
    return pointText(iso, locale);
}

/** A day ("2026-03-01") or a minute ("2026-03-01T14:00") as the locale writes it. */
const pointText = (iso, locale) =>
    iso.length > 10 ? new Date(`${iso.slice(0, 16)}Z`).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) : dayText(iso, locale);

/**
 * The years two calendar days bound as whole years (Jan 1 to Dec 31), or null: the days a comparison
 * on a date grouping's source dates gets from Years combined.
 * @returns {[string, string] | null}
 */
export function wholeYears(from, to) {
    const whole = typeof from === "string" && typeof to === "string" && /^\d{4}-01-01$/.test(from) && /^\d{4}-12-31$/.test(to);
    return whole ? [from.slice(0, 4), to.slice(0, 4)] : null;
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
        // the smaller first, as the engine reads them (ISO days sort as text)
        const [from, to] = f.value2 !== undefined && f.value2 < f.value ? [f.value2, f.value] : [f.value, f.value2];
        // whole years of days (Years combined): "2024 to 2025", "2025", "not 2025"
        const years = wholeYears(from, to);
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
