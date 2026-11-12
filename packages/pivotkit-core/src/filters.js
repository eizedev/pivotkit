/*
 * Filters, one table entry per type: the field types it works on, its keys, how normalize() reads it
 * from a view and how the pivot applies it. A new filter type is one entry here (see CONTRIBUTING.md,
 * "Adding a view feature").
 *
 * Every filter has one shape: { field, type, ..., not?, blanks? }. `not` inverts which items with a
 * value it keeps; blanks are decided by `blanks` alone: "exclude" (the default) drops them,
 * "include" keeps them, "only" keeps them and nothing else. So "not North" drops the blanks unless
 * `blanks: "include"` says otherwise, as Excel's and AG Grid's filters do.
 *
 * - Item filters (in, blank, text, compare, relative) decide per dictionary code and run
 *   first, on the rows. `in` keeps listed items; `blank` keeps the blanks (with `not`, the others);
 *   `text` compares an item's text (`on: "value"`, a text field's own) or its label (`on: "label"`,
 *   the text the table shows, for any field) with `equals`, `contains`, `beginsWith` or `endsWith`,
 *   folded as `match` says (foldText, text-match.js). `compare` compares the item itself (a number, a date by its calendar day, the
 *   key of a grouping: year 2022, month 202503); `relative` keeps the dates of a range that moves with
 *   today ("the last 5 years": this year and the four before it), on the source date of a grouping,
 *   so a year's total only counts its days in the range; with `anchor: "latest"` the range ends with
 *   the data's latest date instead of today. Today is the wall clock of `options.now` of
 *   computePivot() in the data's time zone, never the machine's. A date grouping compared with a
 *   calendar day ("between 2025-01-01 and 2025-12-31") is compared by its source dates too.
 * - Value filters (top N, value conditions) aggregate a measure per group and keep or drop whole
 *   groups, so totals show the visible items only, as in Excel. A filter on a field of an axis groups
 *   by the axis fields down to it ("top 3 products" keeps three products within each region above
 *   it); a field off the axes is grouped on its own. They run outer levels first, each on the rows
 *   the previous one left.
 *
 * Top N keeps exactly N groups per parent. Ties are broken by the order of first appearance in the
 * data, so a tie at the cut keeps the group seen first (Excel may keep all tied items).
 */

import { labelOf } from "./labels.js";
import { MATCH_CASES, MATCH_DEFAULTS, MATCH_WHITESPACE, foldText } from "./text-match.js";
import { DERIVED } from "./derive.js";
import { RELATIVE_ANCHORS, RELATIVE_DIRECTIONS, RELATIVE_MAX_COUNT, RELATIVE_UNITS, WEEK_START, rangeOf, startOf } from "./relative.js";
import { PivotkitError } from "./errors.js";
import { isDateMs, resolveTimeZone, toWallMs, wallClock } from "./time.js";
import { MS_PER_DAY, finite, get, isPlainObject, optionsOf, shown } from "./util.js";

/** The comparisons of a text filter; `not` inverts each ("does not contain"). */
export const TEXT_OPS = Object.freeze(["equals", "contains", "beginsWith", "endsWith"]);
/** What a text filter compares: a text field's value, or the label the table shows (any field). */
export const TEXT_ON = Object.freeze(["value", "label"]);
/**
 * The comparisons of a value condition (`value`) and of an item with a value (`compare`); `not`
 * inverts each ("not between").
 */
export const COMPARE_OPS = Object.freeze(["=", ">", ">=", "<", "<=", "between"]);
/**
 * How finely a comparison of dates goes: a date and the value are both taken as the start of their
 * year, quarter, month, day (the default) or hour, so "= 2025-03" with precision "month" keeps every
 * day of March 2025.
 */
export const COMPARE_PRECISIONS = Object.freeze(["year", "quarter", "month", "day", "hour"]);
/** Which of the groups tied at the cut of a top N stay: the first in the data (Excel's count), or all. */
export const TOP_TIES = Object.freeze(["first", "all"]);
/** What a filter does with blank items: drop them (the default), keep them too, keep only them. */
export const FILTER_BLANKS = Object.freeze(["exclude", "include", "only"]);
/**
 * The operators of view version 1 that version 2 writes as the positive one with `not: true`, for
 * the hint of an issue that names one.
 */
const NEGATED = Object.freeze({ notEquals: "equals", notContains: "contains", "!=": "=", notBetween: "between" });
export { RELATIVE_ANCHORS, RELATIVE_DIRECTIONS, RELATIVE_MAX_COUNT, RELATIVE_UNITS, WEEK_START } from "./relative.js";

const oneOf = (value, allowed) => (typeof value === "string" && allowed.includes(value) ? value : null);

/**
 * Whether a text matches a text filter's value, both folded alike (foldText); `value` is folded
 * already.
 * @param {string} op  of TEXT_OPS
 * @param {string} text
 * @param {string} value
 * @param {import("./text-match.js").TextMatch} match
 */
export function matchText(op, text, value, match) {
    const t = foldText(text, match);
    switch (op) {
        case "equals":
            return t === value;
        case "contains":
            return t.includes(value);
        case "beginsWith":
            return t.startsWith(value);
        case "endsWith":
            return t.endsWith(value);
        default:
            return false;
    }
}

/** A number against a comparison: `a` (and `b` for between); a blank or no number never matches. */
function compare(op, v, a, b) {
    if (typeof v !== "number" || Number.isNaN(v)) {
        return false;
    }
    const lo = Math.min(a, b ?? a);
    const hi = Math.max(a, b ?? a);
    switch (op) {
        case "=":
            return v === a;
        case ">":
            return v > a;
        case ">=":
            return v >= a;
        case "<":
            return v < a;
        case "<=":
            return v <= a;
        case "between":
            return v >= lo && v <= hi;
        default:
            return false;
    }
}

/** The calendar day (wall-clock ms at 00:00) of a date's wall-clock ms. */
const dayOf = (ms) => Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;

/** "2022-03-01" of a day's wall-clock ms; a year before 0 or after 9999 with its sign and six digits ("-007973-01-01"). */
const isoDay = (ms) => new Date(ms).toISOString().slice(0, -"T00:00:00.000Z".length);

/**
 * The dates a relative date range keeps, both included, today being `options.now` (a Date, epoch ms
 * or an ISO string; default the current time) read in `options.timeZone` ("UTC" by default, never the
 * machine's zone), as computePivot() reads them: { from: "2022-01-01", to: "2026-12-31" } for whole
 * days, the minute "2026-03-15T12:00" where a bound is not at midnight (hours, a rolling range), and
 * `from` null for "before". `options` as a filter has them: `direction` (default "last"),
 * `calendar` and `includeCurrent` (default true), `weekStart` (1 Monday to 7 Sunday, default 1), and
 * `anchor`: "today" (the default), "latest" or "first" with `options.latest` or `options.first`, the
 * data's latest or first date (read like `now`; wall-clock ms as a column holds them), or a date of
 * its own ("2025-06-30"). `count` is not read for "this". Null for anything a filter could not have,
 * "latest" or "first" without its date, or a range that leaves what a Date holds (±8.64e15 ms, the
 * years -271821 to 275760); `now` or the anchor's date beyond that throws INVALID_OPTION, as
 * computePivot() does.
 * @param {string} unit  of RELATIVE_UNITS
 * @param {number} count  1 is the current unit alone (with direction "last" and the current unit included)
 * @param {{ now?: Date | number | string, timeZone?: string, anchor?: string, latest?: Date | number | string, first?: Date | number | string,
 *   direction?: string, calendar?: boolean, includeCurrent?: boolean, weekStart?: number }} [options]
 * @returns {{ from: string | null, to: string } | null}
 */
export function relativeDateRange(unit, count, options) {
    options = optionsOf(options, "relativeDateRange");
    const direction = options.direction ?? "last";
    const anchor = options.anchor ?? "today";
    const weekStart = options.weekStart ?? WEEK_START;
    const counted = direction === "this" || (Number.isInteger(count) && count >= 1 && count <= RELATIVE_MAX_COUNT);
    if (!RELATIVE_UNITS.includes(unit) || !RELATIVE_DIRECTIONS.includes(direction) || !counted || !Number.isInteger(weekStart) || weekStart < 1 || weekStart > 7 || anchorText(anchor) === null) {
        return null;
    }
    if ((anchor === "latest" && options.latest === undefined) || (anchor === "first" && options.first === undefined)) {
        return null;
    }
    const timeZone = resolveTimeZone(options.timeZone);
    const reference = anchor === "latest" ? todayOf(options.latest, timeZone) : anchor === "first" ? todayOf(options.first, timeZone) : anchor === "today" ? todayOf(options.now, timeZone) : anchorMs(anchor);
    const spec = { direction, unit, count, calendar: options.calendar ?? true, includeCurrent: options.includeCurrent ?? true };
    const { from, to } = rangeOf(spec, reference, weekStart);
    if (!Number.isFinite(to) || (direction !== "before" && !Number.isFinite(from))) {
        return null;
    }
    const whole = (ms) => !Number.isFinite(ms) || ms % MS_PER_DAY === 0;
    if (whole(from) && whole(to)) {
        return { from: Number.isFinite(from) ? isoDay(from) : null, to: isoDay(to - MS_PER_DAY) };
    }
    const minute = (ms) => new Date(ms).toISOString().slice(0, 16);
    return { from: Number.isFinite(from) ? minute(from) : null, to: minute(to - 1) };
}

/**
 * The wall-clock ms of a relative range's own anchor date ("2025-06-30", "2025-06-30T18:00"; an
 * offset is read as UTC, as filter items are), NaN for anything else.
 * @param {unknown} anchor
 */
const anchorMs = (anchor) => {
    const ms = typeof anchor === "string" && !RELATIVE_ANCHORS.includes(anchor) ? itemFor("date", anchor) : undefined;
    return typeof ms === "number" ? ms : NaN;
};

/**
 * A relative range's anchor as normalize() writes it: "today", "latest", "first", or its own date as
 * "2025-06-30" (at midnight) or "2025-06-30T18:00:00"; null for anything else.
 * @param {unknown} anchor
 * @returns {string | null}
 */
function anchorText(anchor) {
    if (typeof anchor === "string" && RELATIVE_ANCHORS.includes(anchor)) {
        return anchor;
    }
    const ms = anchorMs(anchor);
    if (!isDateMs(ms)) {
        return null;
    }
    return ms % MS_PER_DAY === 0 ? isoDay(ms) : new Date(ms).toISOString().slice(0, 19);
}

/**
 * Today's wall-clock ms in a time zone: `now` (a Date, epoch ms or an ISO string; an ISO string
 * without an offset is taken as written), default the current time.
 * @param {unknown} now
 * @param {string} timeZone  canonical
 */
export function todayOf(now, timeZone) {
    const toWall = wallClock(timeZone);
    // epoch ms beyond what a Date holds (±8.64e15) are no time either: refused before the zone's
    // formatter sees them, and again as wall-clock ms, which the zone's offset may push past the edge
    const ms = toWallMs(now === undefined ? Date.now() : now, (t) => (isDateMs(t) ? toWall(t) : NaN));
    if (!isDateMs(ms)) {
        throw new PivotkitError("INVALID_OPTION", "now must be a Date, epoch milliseconds or an ISO date string");
    }
    return ms;
}

/** A dimension value from a view (filter item, collapsed path), converted to the column's type. */
export function itemFor(type, value) {
    if (value === null) {
        return null;
    }
    switch (type) {
        case "number": {
            const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
            return Number.isFinite(n) ? n : undefined;
        }
        case "date": {
            // filter items name dates as written in the data, or as wall-clock ms; an offset is read as UTC
            const n = typeof value === "number" ? value : typeof value === "string" ? toWallMs(value, (t) => t) : NaN;
            return Number.isFinite(n) ? n : undefined;
        }
        case "boolean":
            return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : undefined;
        default:
            return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                ? String(value).slice(0, 10_000)
                : undefined;
    }
}

// ---- normalizers: (raw entry, spec so far, field, path, ctx, view) -> spec or undefined ----

/**
 * `not` and `blanks` of an item filter into its spec: `not` a boolean (default false), `blanks` of
 * FILTER_BLANKS (default "exclude"; validate() warns when a filter leaves it out). Each that is not
 * one of them is an error and its default is used.
 */
function notAndBlanks(flt, spec, path, ctx) {
    const not = get(flt, "not");
    if (not !== undefined && typeof not !== "boolean") {
        ctx.issue(`${path}.not`, "not must be true or false", "filterNot", { value: shown(not) });
    }
    const blanks = get(flt, "blanks");
    if (blanks === undefined) {
        if (ctx.strict) {
            ctx.warn(path, 'says nothing about blank items; "exclude" is used', "blanksUnspecified");
        }
    } else if (!FILTER_BLANKS.includes(/** @type {string} */ (blanks))) {
        ctx.issue(`${path}.blanks`, `unknown blanks ${JSON.stringify(blanks)}`, "filterBlanks", { value: shown(blanks), ...ctx.suggest(blanks, FILTER_BLANKS) });
    }
    return Object.assign(spec, { not: not === true, blanks: FILTER_BLANKS.includes(/** @type {string} */ (blanks)) ? blanks : "exclude" });
}

/** `in`: the items to keep (with `not`, to drop); a blank is `blanks`, never an item. */
function normalizeIn(flt, spec, f, path, ctx) {
    const items = get(flt, "items");
    if (!Array.isArray(items)) {
        return ctx.issue(path, "needs a list of items", "filterNoItems");
    }
    if (items.length > ctx.limits.items) {
        ctx.issue(`${path}.items`, `more than ${ctx.limits.items} items`, "tooManyItems", { max: ctx.limits.items });
    }
    spec.items = [];
    for (const item of items.slice(0, ctx.limits.items)) {
        const converted = item === null ? null : itemFor(f.type, item);
        if (converted === null) {
            ctx.issue(`${path}.items`, 'null is no item: blank items are kept with blanks: "include" or "only"', "filterBlanks", { value: "null" });
        } else if (converted === undefined) {
            ctx.issue(`${path}.items`, `item ${JSON.stringify(item)} does not fit the ${f.type} field`, "itemType", { value: shown(item), type: f.type });
        } else {
            ctx.itemHint(f, converted, `${path}.items`);
            spec.items.push(converted);
        }
    }
    notAndBlanks(flt, spec, path, ctx);
    if (ctx.strict && spec.items.length === 0 && !spec.not && spec.blanks === "exclude") {
        ctx.warn(path, "keeps nothing: no items, no blanks", "filterEmpty");
    }
    return spec;
}

/** `blank`: the blank items (with `not`, every other). */
function normalizeBlank(flt, spec, _f, path, ctx) {
    const not = get(flt, "not");
    if (not !== undefined && typeof not !== "boolean") {
        ctx.issue(`${path}.not`, "not must be true or false", "filterNot", { value: shown(not) });
    }
    return Object.assign(spec, { not: not === true });
}

/**
 * `text`: an item's text (`on: "value"`, text fields only) or label (`on: "label"`) against a text,
 * folded as `match` says (default MATCH_DEFAULTS).
 */
function normalizeText(flt, spec, f, path, ctx) {
    const opIn = get(flt, "op");
    const op = oneOf(opIn, TEXT_OPS);
    const value = get(flt, "value");
    if (!op) {
        const positive = typeof opIn === "string" && Object.hasOwn(NEGATED, opIn) ? NEGATED[opIn] : null;
        const hint = positive ? { suggestion: positive } : ctx.suggest(opIn, TEXT_OPS);
        return ctx.issue(path, `unknown text operator ${JSON.stringify(opIn)}${positive ? `; write "${positive}" with not: true` : ""}`, "filterTextOp", { value: shown(opIn), ...hint });
    }
    if (typeof value !== "string" || value.length > ctx.limits.textValue) {
        return ctx.issue(path, `needs a text value of at most ${ctx.limits.textValue} characters`, "filterText", { max: ctx.limits.textValue });
    }
    const onIn = get(flt, "on");
    const on = onIn === undefined ? "value" : oneOf(onIn, TEXT_ON);
    if (!on) {
        return ctx.issue(`${path}.on`, `unknown on ${JSON.stringify(onIn)}`, "unknownSetting", { value: shown(onIn) });
    }
    if (on === "value" && f.type !== "string") {
        return ctx.issue(path, `compares text: on a ${f.type} field it compares the label (on: "label")`, "filterFieldType", { field: f.name, type: f.type, value: "text", allowed: "string", suggestion: "label" });
    }
    const matchIn = get(flt, "match");
    const match = { ...MATCH_DEFAULTS };
    if (matchIn !== undefined) {
        const caseIn = get(matchIn, "case");
        const spaceIn = get(matchIn, "whitespace");
        if (!isPlainObject(matchIn) || (caseIn !== undefined && !MATCH_CASES.includes(caseIn)) || (spaceIn !== undefined && !MATCH_WHITESPACE.includes(spaceIn))) {
            ctx.issue(`${path}.match`, 'match is { case: "insensitive" | "sensitive", whitespace: "collapse" | "exact" }', "filterMatch", { value: shown(caseIn ?? spaceIn ?? matchIn) });
        }
        ctx.keys(matchIn, MATCH_KEYS, `${path}.match`);
        match.case = MATCH_CASES.includes(caseIn) ? caseIn : MATCH_DEFAULTS.case;
        match.whitespace = MATCH_WHITESPACE.includes(spaceIn) ? spaceIn : MATCH_DEFAULTS.whitespace;
    }
    Object.assign(spec, { op, value, on, match });
    return notAndBlanks(flt, spec, path, ctx);
}

const MATCH_KEYS = Object.freeze(["case", "whitespace"]);

/** The grouping (DERIVED unit) a derived field of the view is made by; undefined for a data column. */
const unitOfField = (f, view) => (f.derived ? view.derived.find((d) => d.name === f.name)?.by : undefined);

/** Whether a filter's value is a calendar day (text), so a date grouping is compared by its source dates. */
const byDay = (f) => typeof f.value === "string";

/**
 * A comparison of the item itself: a number (also a grouping's key, year 2022, month 202503) or a
 * date, kept as its calendar day "2022-03-01". A date grouping takes a day too: then the source
 * dates are compared, not the key ("between 2025-01-01 and 2025-12-31" keeps the year 2025 of a
 * month-of-the-year grouping, the Filter level's Years combined).
 */
function normalizeCompare(flt, spec, f, path, ctx, view) {
    const unit = unitOfField(f, view);
    const dated = f.type === "date" || (unit !== undefined && DERIVED[unit].source === "date" && typeof get(flt, "value") === "string" && itemFor("number", get(flt, "value")) === undefined);
    const precisionIn = get(flt, "precision");
    const precision = precisionIn === undefined ? "day" : oneOf(precisionIn, COMPARE_PRECISIONS);
    if (!dated && precisionIn !== undefined) {
        ctx.issue(`${path}.precision`, "a precision compares dates only", "filterPrecision", { value: shown(precisionIn) });
    } else if (!precision) {
        return ctx.issue(path, `unknown precision ${JSON.stringify(precisionIn)}`, "filterPrecision", { value: shown(precisionIn), ...ctx.suggest(precisionIn, COMPARE_PRECISIONS) });
    }
    const read = (value) => {
        if (!dated) {
            // a number, or a text of one ("2022"), as filter items take them
            const n = value === undefined ? undefined : itemFor("number", value);
            return typeof n === "number" ? n : null;
        }
        // wall-clock ms beyond what a Date holds (±8.64e15) have no calendar day; a grouping
        // compared by its source dates takes days as text only (a number would be its key)
        const ms = value === undefined || (f.type !== "date" && typeof value !== "string") ? undefined : itemFor("date", value);
        return typeof ms === "number" && isDateMs(ms) ? precisionText(ms, /** @type {string} */ (precision)) : null;
    };
    const op = oneOf(get(flt, "op"), COMPARE_OPS);
    const value = read(get(flt, "value"));
    const twin = op === "between";
    const value2 = twin ? read(get(flt, "value2")) : null;
    if (!op || value === null || (twin && value2 === null)) {
        return ctx.issue(path, `needs an operator and ${twin ? "two values" : "a value"} of the ${f.type} field`, "filterCompareValue", { type: f.type, ...negatedHint(get(flt, "op")) });
    }
    Object.assign(spec, { op, value }, twin ? { value2 } : {}, dated ? { precision } : {});
    return notAndBlanks(flt, spec, path, ctx);
}

/**
 * The start of a date's unit as a comparison writes it: the day "2025-03-01", with precision "hour"
 * the hour "2025-03-01T14:00"; a year before 0 or after 9999 with its sign and six digits. A start
 * beyond what a Date holds (the first year's, near its edge) is the date's own day.
 * @param {number} ms  a date's wall-clock ms
 * @param {string} precision
 */
function precisionText(ms, precision) {
    const start = startOf(precision, ms);
    return precision === "hour" ? new Date(start).toISOString().slice(0, -":00.000Z".length) : isoDay(Number.isNaN(start) ? dayOf(ms) : start);
}

/** The hint for a version-1 operator ("!=", "notBetween") that version 2 writes with `not`. */
function negatedHint(op) {
    return typeof op === "string" && Object.hasOwn(NEGATED, op) ? { suggestion: NEGATED[op] } : {};
}

/**
 * A relative date range on a date field or a grouping of one (relative.js): its direction, unit and
 * count (none for "this"), whether it goes by whole units (`calendar`) and takes the current one
 * (`includeCurrent`), and what it counts from (`anchor`).
 */
function normalizeRelative(flt, spec, _f, path, ctx) {
    const directionIn = get(flt, "direction");
    const direction = directionIn === undefined ? "last" : oneOf(directionIn, RELATIVE_DIRECTIONS);
    if (!direction) {
        return ctx.issue(path, `unknown direction ${JSON.stringify(directionIn)}`, "filterRelativeDirection", { value: shown(directionIn), ...ctx.suggest(directionIn, RELATIVE_DIRECTIONS) });
    }
    const by = oneOf(get(flt, "unit"), RELATIVE_UNITS);
    if (!by) {
        return ctx.issue(path, `unknown unit ${JSON.stringify(get(flt, "unit"))}`, "filterRelativeUnit", { value: shown(get(flt, "unit")), ...ctx.suggest(get(flt, "unit"), RELATIVE_UNITS) });
    }
    const countIn = get(flt, "count");
    const count = finite(countIn);
    if (direction === "this" ? countIn !== undefined : count === null || !Number.isInteger(count) || count < 1 || count > RELATIVE_MAX_COUNT) {
        const message = direction === "this" ? '"this" is the current unit alone and has no count' : `needs a whole count from 1 to ${RELATIVE_MAX_COUNT}`;
        return ctx.issue(path, message, "filterRelativeCount", { max: RELATIVE_MAX_COUNT, value: direction });
    }
    const flag = (key) => {
        const value = get(flt, key);
        if (value !== undefined && typeof value !== "boolean") {
            ctx.issue(`${path}.${key}`, `${key} must be true or false`, "unknownSetting", { value: shown(value) });
        }
        return typeof value === "boolean" ? value : true;
    };
    const anchorIn = get(flt, "anchor");
    const anchor = anchorIn === undefined ? "today" : anchorText(anchorIn);
    if (!anchor) {
        return ctx.issue(path, `unknown anchor ${JSON.stringify(anchorIn)}`, "filterRelativeAnchor", { value: shown(anchorIn), ...ctx.suggest(anchorIn, RELATIVE_ANCHORS) });
    }
    Object.assign(spec, { direction, unit: by }, direction === "this" ? {} : { count }, { calendar: flag("calendar"), includeCurrent: flag("includeCurrent"), anchor });
    return notAndBlanks(flt, spec, path, ctx);
}

/** The measure a value filter ranks or compares: `by`, default the view's first value. */
function measureOf(flt, path, ctx, view) {
    const byIn = get(flt, "by");
    const by = byIn === undefined ? ctx.defaultRef(view) : ctx.valueRef(byIn, `${path}.by`);
    if (by && ctx.resultType(by) !== "number") {
        ctx.issue(`${path}.by`, `${by.agg} gives no number to filter by`, "filterNotNumber", { agg: by.agg });
        return null;
    }
    return by;
}

function normalizeTop(flt, spec, _f, path, ctx, view) {
    const by = measureOf(flt, path, ctx, view);
    if (!by) {
        return undefined;
    }
    const count = finite(get(flt, "count"));
    if (count === null || count < 1 || count > ctx.limits.topCount || !Number.isInteger(count)) {
        return ctx.issue(path, "needs a whole count of 1 or more", "filterCount", { max: ctx.limits.topCount });
    }
    const bottom = get(flt, "bottom");
    const tiesIn = get(flt, "ties");
    const ties = tiesIn === undefined ? "first" : oneOf(tiesIn, TOP_TIES);
    if (!ties) {
        ctx.issue(`${path}.ties`, `unknown ties ${JSON.stringify(tiesIn)}`, "filterTies", { value: shown(tiesIn), ...ctx.suggest(tiesIn, TOP_TIES) });
    }
    return Object.assign(spec, { by, count, bottom: typeof bottom === "boolean" ? bottom : false, ties: ties ?? "first" });
}

function normalizeValue(flt, spec, _f, path, ctx, view) {
    const by = measureOf(flt, path, ctx, view);
    if (!by) {
        return undefined;
    }
    const op = oneOf(get(flt, "op"), COMPARE_OPS);
    const value = finite(get(flt, "value"));
    if (!op || value === null) {
        return ctx.issue(path, "needs an operator and a number", "filterValue", negatedHint(get(flt, "op")));
    }
    const not = get(flt, "not");
    if (not !== undefined && typeof not !== "boolean") {
        ctx.issue(`${path}.not`, "not must be true or false", "filterNot", { value: shown(not) });
    }
    Object.assign(spec, { by, op, value, not: not === true });
    if (op === "between") {
        const value2 = finite(get(flt, "value2"));
        if (value2 === null) {
            return ctx.issue(path, `${op} needs value2`, "filterValue2", { value: op });
        }
        spec.value2 = value2;
    }
    return spec;
}

// ---- appliers ----

/*
 * An item filter's `allowed(column, f, locale, today)` gives match[code + 1] for each dictionary code
 * (index 0 is blank and not looked at); withNotBlanks() turns it into what the filter keeps: `not`
 * inverts the items with a value, `blanks` alone decides the blank.
 */

/**
 * The applier of an item filter from its match: `not` and `blanks` applied.
 * @param {(column: any, f: any, locale: string, today: number, weekStart: number) => Uint8Array} match
 */
function withNotBlanks(match) {
    return (column, f, locale, today, weekStart) => {
        const matched = match(column, f, locale, today, weekStart);
        const keep = new Uint8Array(matched.length);
        keep[0] = f.blanks === "exclude" ? 0 : 1;
        if (f.blanks !== "only") {
            const flip = f.not ? 1 : 0;
            for (let i = 1; i < matched.length; i++) {
                keep[i] = matched[i] ^ flip;
            }
        }
        return keep;
    };
}

/** `in`: the listed items. */
function matchItems(column, f) {
    const index = new Map(column.dict.map((v, code) => [v, code]));
    const listed = new Uint8Array(column.dict.length + 1);
    for (const item of f.items) {
        const code = index.get(item);
        if (code !== undefined) {
            listed[code + 1] = 1;
        }
    }
    return listed;
}

/** `blank`: the blank item (with `not`, every other). */
function keepBlank(column, f) {
    const keep = new Uint8Array(column.dict.length + 1).fill(f.not ? 1 : 0);
    keep[0] = f.not ? 0 : 1;
    return keep;
}

/** `text`: each item's text (its value, or its label in the report's locale) against the filter's. */
function matchTexts(column, f, locale) {
    const value = foldText(f.value, f.match);
    const matched = new Uint8Array(column.dict.length + 1);
    column.dict.forEach((v, code) => {
        matched[code + 1] = matchText(f.op, f.on === "label" ? labelOf(column, v, locale) : String(v), value, f.match) ? 1 : 0;
    });
    return matched;
}

/** Compare: a date item by its calendar day; a number as it is. */
function allowedCompared(column, f) {
    const date = column.type === "date";
    // a date and the values as the start of their unit (precision, default the day)
    const precision = f.precision ?? "day";
    const read = (v) => (date ? itemFor("date", v) : v);
    const [a, b] = [read(f.value), f.value2 === undefined ? undefined : read(f.value2)];
    const matched = new Uint8Array(column.dict.length + 1);
    column.dict.forEach((v, code) => {
        matched[code + 1] = compare(f.op, date && typeof v === "number" ? startOf(precision, v) : v, a, b) ? 1 : 0;
    });
    return matched;
}

/** The latest date of a date column (wall-clock ms), or null without one. */
export function latestOf(column) {
    let latest = -Infinity;
    for (const v of column.dict) {
        if (typeof v === "number" && v > latest) {
            latest = v;
        }
    }
    return Number.isFinite(latest) ? latest : null;
}

/** The first date of a date column (wall-clock ms), or null without one. */
export function firstOf(column) {
    let first = Infinity;
    for (const v of column.dict) {
        if (typeof v === "number" && v < first) {
            first = v;
        }
    }
    return Number.isFinite(first) ? first : null;
}

/**
 * Relative: the dates of the range (the column is the source date of a grouping, see applyFilters)
 * around today, the column's latest or first date (a column without dates counts from today), or
 * the filter's own date; weeks start on the view's `formatting.weekStart`.
 */
function allowedRelative(column, f, _locale, today, weekStart) {
    const reference = f.anchor === "today" ? today : f.anchor === "latest" ? latestOf(column) ?? today : f.anchor === "first" ? firstOf(column) ?? today : anchorMs(f.anchor);
    const { from, to } = rangeOf(f, reference, weekStart);
    return Uint8Array.from([0, ...column.dict], (v, i) => (i > 0 && typeof v === "number" && v >= from && v < to ? 1 : 0));
}

/**
 * Value filters: keep[group] from the aggregated values and the group paths. A group without a number
 * (no rows with a value) never matches, `not` or not.
 */
function keepMatching(f, values) {
    return Uint8Array.from(values, (v) => (typeof v === "number" && !Number.isNaN(v) && compare(f.op, v, f.value, f.value2) !== f.not ? 1 : 0));
}

function keepTop(f, values, paths) {
    const keep = new Uint8Array(paths.length);
    // within each parent group: the count largest (or smallest) values; blanks never count
    const byParent = new Map();
    paths.forEach((p, g) => {
        const parent = p.slice(0, -1).join(",");
        if (!byParent.has(parent)) {
            byParent.set(parent, []);
        }
        byParent.get(parent).push(g);
    });
    for (const groups of byParent.values()) {
        const ranked = groups.filter((g) => typeof values[g] === "number").sort((a, b) => (f.bottom ? values[a] - values[b] : values[b] - values[a]) || a - b);
        // ties "all": every group with the value at the cut stays too
        const cut = f.ties === "all" && ranked.length > f.count ? values[ranked[f.count - 1]] : undefined;
        ranked.forEach((g, i) => {
            if (i < f.count || values[g] === cut) {
                keep[g] = 1;
            }
        });
    }
    return keep;
}

/**
 * @typedef {object} FilterDef
 * @property {"items" | "values"} stage
 * @property {readonly string[]} fields  the field types it works on ("dateGrouping": a grouping of a
 *   date, whatever its own type); any other is the error filterFieldType
 * @property {readonly string[]} keys  the keys a filter of the type has (an other key is reported)
 * @property {Function} normalize
 * @property {Function} [allowed]  item filters
 * @property {Function} [keep]     value filters
 * @property {boolean | ((f: any) => boolean)} [source]  item filters that read the source date of a
 *   grouping: always, or for a filter that says so (a comparison with a calendar day)
 */

/** The keys of a filter of a type: its field and type, and its own. */
const keysOf = (...own) => Object.freeze(["field", "type", ...own]);

/** Whether an item filter reads the source date of a grouping instead of the grouping's own column. */
export const readsSource = (def, f) => (typeof def.source === "function" ? def.source(f) : Boolean(def.source));

const ALL_TYPES = Object.freeze(["string", "number", "date", "boolean"]);
const NOT_BLANKS = Object.freeze(["not", "blanks"]);

/** @type {Readonly<Record<string, FilterDef>>} */
export const FILTERS = Object.freeze({
    in: { stage: "items", fields: ALL_TYPES, keys: keysOf("items", ...NOT_BLANKS), normalize: normalizeIn, allowed: withNotBlanks(matchItems) },
    blank: { stage: "items", fields: ALL_TYPES, keys: keysOf("not"), normalize: normalizeBlank, allowed: keepBlank },
    text: { stage: "items", fields: ALL_TYPES, keys: keysOf("op", "value", "on", "match", ...NOT_BLANKS), normalize: normalizeText, allowed: withNotBlanks(matchTexts) },
    compare: { stage: "items", fields: Object.freeze(["number", "date"]), keys: keysOf("op", "value", "value2", "precision", ...NOT_BLANKS), normalize: normalizeCompare, allowed: withNotBlanks(allowedCompared), source: byDay },
    relative: { stage: "items", fields: Object.freeze(["date", "dateGrouping"]), keys: keysOf("direction", "unit", "count", "calendar", "includeCurrent", "anchor", ...NOT_BLANKS), normalize: normalizeRelative, allowed: withNotBlanks(allowedRelative), source: true },
    top: { stage: "values", fields: ALL_TYPES, keys: keysOf("by", "count", "bottom", "ties"), normalize: normalizeTop, keep: keepTop },
    value: { stage: "values", fields: ALL_TYPES, keys: keysOf("by", "op", "value", "value2", "not"), normalize: normalizeValue, keep: keepMatching }
});

export const FILTER_TYPES = Object.freeze(Object.keys(FILTERS));

/** The filter types of view version 1 and what version 2 calls them, for the hint of an unknown type. */
export const FILTER_TYPES_V1 = Object.freeze({ include: "in", exclude: "in", label: "text" });

/**
 * What a field is for the field-type matrix (FILTERS[type].fields): its type, and "dateGrouping" for
 * a grouping of a date.
 * @param {{ name: string, type: string, derived?: boolean }} f
 * @param {{ derived: Array<{ name: string, by: string }> }} view  normalized so far
 */
export function fieldKinds(f, view) {
    const unit = unitOfField(f, view);
    return unit !== undefined && DERIVED[unit].source === "date" ? [f.type, "dateGrouping"] : [f.type];
}

/** The filter type that works on a field of a type, for the hint of filterFieldType. */
export const fieldTypeHint = (type) => (type === "string" ? "text" : type === "number" || type === "date" ? "compare" : "in");

/** The item filters a field's own rules are made of (its picks, `in`, are not rules). */
const ITEM_RULES = Object.freeze(["blank", "text", "compare", "relative"]);

/**
 * Which items of a field its own rules on items (blank, text, compare, relative) keep: keep[code + 1] is 1
 * when at least one row of the item passes all of them (a relative range goes by the rows' source
 * dates, so a year partly in range is kept); null when the field has no such rule. The rows of
 * `column` and `source` line up (a grouping and the date it is made of).
 * @param {import("./view.js").View} view  normalized
 * @param {string} field
 * @param {import("./encode.js").Column} column
 * @param {import("./encode.js").Column} source  the field's source column (the column itself without a grouping)
 * @param {string} locale
 * @param {() => number} today  wall-clock ms of today, asked for only when a range needs it
 * @returns {Uint8Array | null}
 */
export function keptByRules(view, field, column, source, locale, today) {
    const rules = view.filters.filter((f) => f.field.toLowerCase() === field.toLowerCase() && ITEM_RULES.includes(f.type));
    if (!rules.length) {
        return null;
    }
    const now = rules.some((f) => f.type === "relative") ? today() : 0;
    const allowed = (f) => FILTERS[f.type].allowed(readsSource(FILTERS[f.type], f) ? source : column, f, locale, now, view.formatting.weekStart);
    const own = rules.filter((f) => !readsSource(FILTERS[f.type], f)).map(allowed);
    const bySource = rules.filter((f) => readsSource(FILTERS[f.type], f)).map(allowed);
    const kept = new Uint8Array(column.dict.length + 1);
    for (let i = 0; i < column.codes.length; i++) {
        const c = column.codes[i] + 1;
        if (!kept[c] && own.every((a) => a[c] === 1) && bySource.every((a) => a[source.codes[i] + 1] === 1)) {
            kept[c] = 1;
        }
    }
    return kept;
}

function filterRows(rows, keep) {
    let n = 0;
    const out = new Int32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        if (keep(rows[i], i)) {
            out[n++] = rows[i];
        }
    }
    return out.slice(0, n);
}

/**
 * Applies the view's filters to the source rows. `kept[i]`, when given, gets the rows left after the
 * view's filter i (filters apply in turn: item filters in the view's order, then value filters from
 * the outer level in); it stays null for a filter that did not apply (its field is not in the data).
 * @param {import("./pivot.js").PivotContext} ctx
 * @param {Int32Array} rows
 * @param {Array<number | null>} [kept]
 * @returns {Int32Array}
 */
export function applyFilters(ctx, rows, kept) {
    const { view, columnOf, locale, today } = ctx;
    // a filter on a grouping's source (relative ranges): the date column the grouping is made of
    const sourceOf = (name) => view.derived.find((d) => d.name.toLowerCase() === name.toLowerCase())?.field ?? name;
    view.filters.forEach((f, i) => {
        const def = FILTERS[f.type];
        const column = columnOf(readsSource(def, f) ? sourceOf(f.field) : f.field);
        if (def.stage !== "items" || !column) {
            return;
        }
        const allowed = def.allowed(column, f, locale, today, view.formatting.weekStart);
        const codes = column.codes;
        rows = filterRows(rows, (r) => allowed[codes[r] + 1] === 1);
        if (kept) {
            kept[i] = rows.length;
        }
    });
    const levelOf = (name) => {
        const r = view.rows.indexOf(name);
        if (r !== -1) {
            return { fields: view.rows.slice(0, r + 1), order: r };
        }
        const c = view.cols.indexOf(name);
        if (c !== -1) {
            return { fields: view.cols.slice(0, c + 1), order: 100 + c };
        }
        return { fields: [name], order: 200 };
    };
    // i: the filter's place in the view
    const valueFilters = view.filters
        .map((f, i) => ({ f, i, ...levelOf(f.field) }))
        .filter(({ f }) => FILTERS[f.type].stage === "values")
        .sort((a, b) => a.order - b.order || a.i - b.i);
    for (const { f, i, fields } of valueFilters) {
        const columns = fields.map(columnOf);
        if (columns.includes(null)) {
            continue;
        }
        const { groupOf, paths } = ctx.groupBy(columns, rows);
        const values = ctx.aggregateGroups(f.by, rows, groupOf, paths.length);
        const keep = FILTERS[f.type].keep(f, values, paths);
        rows = filterRows(rows, (_r, j) => keep[groupOf[j]] === 1);
        if (kept) {
            kept[i] = rows.length;
        }
    }
    return rows;
}

