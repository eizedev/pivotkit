/*
 * Filters, one table entry per type: how normalize() reads it from a view and how the pivot applies
 * it. A new filter type is one entry here (see CONTRIBUTING.md, "Adding a view feature").
 *
 * - Item filters (include, exclude, label, compare, relative) decide per dictionary code and run
 *   first, on the rows. `compare` compares the item itself (a number, a date by its calendar day, the
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
import { DERIVED } from "./derive.js";
import { PivotkitError } from "./errors.js";
import { isDateMs, resolveTimeZone, toWallMs, wallClock } from "./time.js";
import { MS_PER_DAY, finite, get, optionsOf, shown } from "./util.js";

export const LABEL_OPS = Object.freeze(["equals", "notEquals", "contains", "notContains", "beginsWith", "endsWith"]);
/** The comparisons of a value condition (`value`) and of an item with a value (`compare`). */
export const VALUE_OPS = Object.freeze(["=", "!=", ">", ">=", "<", "<=", "between", "notBetween"]);
/** The units of a relative date range: the last N years, months or days, today's included. */
export const RELATIVE_UNITS = Object.freeze(["year", "month", "day"]);
/** The most years, months or days a relative range reaches back: 500 years from today stay after year 1. */
export const RELATIVE_MAX_COUNT = 500;
/**
 * What a relative range counts back from: today (the default, `options.now` of computePivot()), or
 * the latest date of the field's data, for data that end before today (an archive, a closed year).
 */
export const RELATIVE_ANCHORS = Object.freeze(["today", "latest"]);

const oneOf = (value, allowed) => (typeof value === "string" && allowed.includes(value) ? value : null);

function matchLabel(op, label, value) {
    const l = label.toLocaleLowerCase();
    const v = value.toLocaleLowerCase();
    switch (op) {
        case "equals":
            return l === v;
        case "notEquals":
            return l !== v;
        case "contains":
            return l.includes(v);
        case "notContains":
            return !l.includes(v);
        case "beginsWith":
            return l.startsWith(v);
        case "endsWith":
            return l.endsWith(v);
        default:
            return true;
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
        case "!=":
            return v !== a;
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
        case "notBetween":
            return v < lo || v > hi;
        default:
            return true;
    }
}

const matchValue = (filter, v) => compare(filter.op, v, filter.value, filter.value2);

/** The calendar day (wall-clock ms at 00:00) of a date's wall-clock ms. */
const dayOf = (ms) => Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;

/** "2022-03-01" of a day's wall-clock ms; a year before 0 or after 9999 with its sign and six digits ("-007973-01-01"). */
const isoDay = (ms) => new Date(ms).toISOString().slice(0, -"T00:00:00.000Z".length);

/**
 * The days of a relative range, [from, to) in wall-clock ms: the `count` years, months or days that
 * end with the one of `reference` (wall-clock ms, one a Date holds: today, or the data's latest
 * date). An end beyond what a Date holds is infinite (-Infinity, Infinity): every date of the data
 * is on its side of the reference.
 * @param {string} unit  of RELATIVE_UNITS
 * @param {number} count
 * @param {number} reference
 */
function rangeOf(unit, count, reference) {
    const d = new Date(reference);
    const y = d.getUTCFullYear();
    const m = unit === "year" ? 0 : d.getUTCMonth();
    const day = unit === "day" ? d.getUTCDate() : 1;
    // setUTCFullYear takes every year (Date.UTC reads 0 to 99 as 1900 to 1999) and rolls months over;
    // it is NaN only for a day beyond the Date range
    const at = (yy, mm, dd) => new Date(0).setUTCFullYear(yy, mm, dd);
    const step = (n) => (unit === "year" ? at(y + n, m, day) : unit === "month" ? at(y, m + n, day) : at(y, m, day + n));
    const from = step(1 - count);
    const to = step(1);
    return { from: Number.isNaN(from) ? -Infinity : from, to: Number.isNaN(to) ? Infinity : to };
}

/**
 * The days a relative date range keeps, today being `options.now` (a Date, epoch ms or an ISO string;
 * default the current time) read in `options.timeZone` ("UTC" by default, never the machine's zone),
 * as computePivot() reads them: { from: "2022-01-01", to: "2026-12-31" }, both included. With
 * `anchor: "latest"` the range ends with `options.latest`, the data's latest date (read like `now`;
 * wall-clock ms as a column holds them), not with today. Null for a unit not of RELATIVE_UNITS, a
 * count that is not a whole number from 1 to RELATIVE_MAX_COUNT, an anchor not of RELATIVE_ANCHORS,
 * "latest" without a latest date, or a range that leaves what a Date holds (±8.64e15 ms, the years
 * -271821 to 275760); `now` or `latest` beyond that throws INVALID_OPTION, as computePivot() does.
 * @param {string} unit  "year", "month" or "day"
 * @param {number} count  1 is this year (month, day) alone
 * @param {{ now?: Date | number | string, timeZone?: string, anchor?: string, latest?: Date | number | string }} [options]
 * @returns {{ from: string, to: string } | null}
 */
export function relativeDateRange(unit, count, options) {
    options = optionsOf(options, "relativeDateRange");
    const anchor = options.anchor ?? "today";
    if (!RELATIVE_UNITS.includes(unit) || !Number.isInteger(count) || count < 1 || count > RELATIVE_MAX_COUNT || !RELATIVE_ANCHORS.includes(anchor)) {
        return null;
    }
    if (anchor === "latest" && options.latest === undefined) {
        return null;
    }
    const timeZone = resolveTimeZone(options.timeZone);
    const { from, to } = rangeOf(unit, count, anchor === "latest" ? todayOf(options.latest, timeZone) : todayOf(options.now, timeZone));
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
        return null;
    }
    return { from: isoDay(from), to: isoDay(to - MS_PER_DAY) };
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

function normalizeItems(flt, spec, f, path, ctx) {
    const items = get(flt, "items");
    if (!Array.isArray(items)) {
        return ctx.issue(path, "needs a list of items", "filterNoItems");
    }
    if (items.length > ctx.limits.items) {
        ctx.issue(`${path}.items`, `more than ${ctx.limits.items} items`, "tooManyItems", { max: ctx.limits.items });
    }
    spec.items = [];
    for (const item of items.slice(0, ctx.limits.items)) {
        const converted = itemFor(f.type, item);
        if (converted === undefined) {
            ctx.issue(`${path}.items`, `item ${JSON.stringify(item)} does not fit the ${f.type} field`, "itemType", { value: shown(item), type: f.type });
        } else {
            ctx.itemHint(f, converted, `${path}.items`);
            spec.items.push(converted);
        }
    }
    return spec;
}

function normalizeLabel(flt, spec, _f, path, ctx) {
    const op = oneOf(get(flt, "op"), LABEL_OPS);
    const value = get(flt, "value");
    if (!op) {
        return ctx.issue(path, `unknown label operator ${JSON.stringify(get(flt, "op"))}`, "filterLabelOp", { value: shown(get(flt, "op")) });
    }
    if (typeof value !== "string" || value.length > 1000) {
        return ctx.issue(path, "needs a text value", "filterText");
    }
    return Object.assign(spec, { op, value });
}

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
    if (f.type !== "number" && f.type !== "date") {
        return ctx.issue(path, "compares numbers and dates only", "filterCompareField", { field: f.name });
    }
    const unit = unitOfField(f, view);
    const dated = f.type === "date" || (unit !== undefined && DERIVED[unit].source === "date" && typeof get(flt, "value") === "string" && itemFor("number", get(flt, "value")) === undefined);
    const read = (value) => {
        if (!dated) {
            // a number, or a text of one ("2022"), as filter items take them
            const n = value === undefined ? undefined : itemFor("number", value);
            return typeof n === "number" ? n : null;
        }
        // wall-clock ms beyond what a Date holds (±8.64e15) have no calendar day; a grouping
        // compared by its source dates takes days as text only (a number would be its key)
        const ms = value === undefined || (f.type !== "date" && typeof value !== "string") ? undefined : itemFor("date", value);
        return isDateMs(ms) ? isoDay(dayOf(ms)) : null;
    };
    const op = oneOf(get(flt, "op"), VALUE_OPS);
    const value = read(get(flt, "value"));
    const twin = op === "between" || op === "notBetween";
    const value2 = twin ? read(get(flt, "value2")) : null;
    if (!op || value === null || (twin && value2 === null)) {
        return ctx.issue(path, `needs an operator and ${twin ? "two values" : "a value"} of the ${f.type} field`, "filterCompareValue", { type: f.type });
    }
    return Object.assign(spec, { op, value }, twin ? { value2 } : {});
}

/** A relative date range on a date field or a grouping of one: the last `count` years, months or days. */
function normalizeRelative(flt, spec, f, path, ctx, view) {
    const unit = unitOfField(f, view);
    if (unit === undefined ? f.type !== "date" : DERIVED[unit].source !== "date") {
        return ctx.issue(path, "needs a date field or a grouping of one", "filterRelativeField", { field: f.name });
    }
    const by = oneOf(get(flt, "unit"), RELATIVE_UNITS);
    if (!by) {
        return ctx.issue(path, `unknown unit ${JSON.stringify(get(flt, "unit"))}`, "filterRelativeUnit", { value: shown(get(flt, "unit")) });
    }
    const count = finite(get(flt, "count"));
    if (count === null || !Number.isInteger(count) || count < 1 || count > RELATIVE_MAX_COUNT) {
        return ctx.issue(path, `needs a whole count from 1 to ${RELATIVE_MAX_COUNT}`, "filterRelativeCount", { max: RELATIVE_MAX_COUNT });
    }
    // today is the default and is not written; "latest" counts back from the data's latest date
    const anchorIn = get(flt, "anchor");
    const anchor = anchorIn === undefined ? "today" : oneOf(anchorIn, RELATIVE_ANCHORS);
    if (!anchor) {
        return ctx.issue(path, `unknown anchor ${JSON.stringify(anchorIn)}`, "filterRelativeAnchor", { value: shown(anchorIn) });
    }
    return Object.assign(spec, { unit: by, count }, anchor === "latest" ? { anchor } : {});
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
    return Object.assign(spec, { by, count, bottom: typeof bottom === "boolean" ? bottom : false });
}

function normalizeValue(flt, spec, _f, path, ctx, view) {
    const by = measureOf(flt, path, ctx, view);
    if (!by) {
        return undefined;
    }
    const op = oneOf(get(flt, "op"), VALUE_OPS);
    const value = finite(get(flt, "value"));
    if (!op || value === null) {
        return ctx.issue(path, "needs an operator and a number", "filterValue");
    }
    Object.assign(spec, { by, op, value });
    if (op === "between" || op === "notBetween") {
        const value2 = finite(get(flt, "value2"));
        if (value2 === null) {
            return ctx.issue(path, `${op} needs value2`, "filterValue2", { value: op });
        }
        spec.value2 = value2;
    }
    return spec;
}

// ---- appliers ----

/** Item filters: allowed[code + 1] per dictionary code (index 0 is blank). */
function allowedItems(include) {
    return (column, f) => {
        const index = new Map(column.dict.map((v, code) => [v, code]));
        const listed = new Uint8Array(column.dict.length + 1);
        for (const item of f.items) {
            const code = item === null ? -1 : index.get(item);
            if (code !== undefined) {
                listed[code + 1] = 1;
            }
        }
        return include ? listed : listed.map((x) => 1 - x);
    };
}

function allowedLabels(column, f, locale) {
    const allowed = new Uint8Array(column.dict.length + 1);
    for (let code = -1; code < column.dict.length; code++) {
        const label = labelOf(column, code === -1 ? null : column.dict[code], locale);
        allowed[code + 1] = matchLabel(f.op, label, f.value) ? 1 : 0;
    }
    return allowed;
}

/** Compare: a date item by its calendar day; a number as it is. */
function allowedCompared(column, f) {
    const date = column.type === "date";
    const read = (v) => (date ? Date.parse(`${v}T00:00Z`) : v);
    const [a, b] = [read(f.value), f.value2 === undefined ? undefined : read(f.value2)];
    const allowed = new Uint8Array(column.dict.length + 1);
    column.dict.forEach((v, code) => {
        allowed[code + 1] = compare(f.op, date && typeof v === "number" ? dayOf(v) : v, a, b) ? 1 : 0;
    });
    return allowed;
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

/**
 * Relative: the dates of the range (the column is the source date of a grouping, see applyFilters),
 * counted back from today, or from the column's latest date (`anchor: "latest"`; a column without
 * dates counts from today).
 */
function allowedRelative(column, f, _locale, today) {
    const { from, to } = rangeOf(f.unit, f.count, (f.anchor === "latest" ? latestOf(column) : null) ?? today);
    return Uint8Array.from([0, ...column.dict], (v, i) => (i > 0 && typeof v === "number" && v >= from && v < to ? 1 : 0));
}

/** Value filters: keep[group] from the aggregated values and the group paths. */
function keepMatching(f, values) {
    return Uint8Array.from(values, (v) => (matchValue(f, v) ? 1 : 0));
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
        groups
            .filter((g) => typeof values[g] === "number")
            .sort((a, b) => (f.bottom ? values[a] - values[b] : values[b] - values[a]) || a - b)
            .slice(0, f.count)
            .forEach((g) => {
                keep[g] = 1;
            });
    }
    return keep;
}

/**
 * @typedef {object} FilterDef
 * @property {"items" | "values"} stage
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

/** @type {Readonly<Record<string, FilterDef>>} */
export const FILTERS = Object.freeze({
    include: { stage: "items", keys: keysOf("items"), normalize: normalizeItems, allowed: allowedItems(true) },
    exclude: { stage: "items", keys: keysOf("items"), normalize: normalizeItems, allowed: allowedItems(false) },
    label: { stage: "items", keys: keysOf("op", "value"), normalize: normalizeLabel, allowed: allowedLabels },
    compare: { stage: "items", keys: keysOf("op", "value", "value2"), normalize: normalizeCompare, allowed: allowedCompared, source: byDay },
    relative: { stage: "items", keys: keysOf("unit", "count", "anchor"), normalize: normalizeRelative, allowed: allowedRelative, source: true },
    top: { stage: "values", keys: keysOf("by", "count", "bottom"), normalize: normalizeTop, keep: keepTop },
    value: { stage: "values", keys: keysOf("by", "op", "value", "value2"), normalize: normalizeValue, keep: keepMatching }
});

export const FILTER_TYPES = Object.freeze(Object.keys(FILTERS));

/** The item filters a field's own rules are made of (its picks, include and exclude, are not rules). */
const ITEM_RULES = Object.freeze(["label", "compare", "relative"]);

/**
 * Which items of a field its own rules on items (label, compare, relative) keep: keep[code + 1] is 1
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
    const allowed = (f) => FILTERS[f.type].allowed(readsSource(FILTERS[f.type], f) ? source : column, f, locale, now);
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
 * Applies the view's filters to the source rows.
 * @param {import("./pivot.js").PivotContext} ctx
 * @param {Int32Array} rows
 * @returns {Int32Array}
 */
export function applyFilters(ctx, rows) {
    const { view, columnOf, locale, today } = ctx;
    // a filter on a grouping's source (relative ranges): the date column the grouping is made of
    const sourceOf = (name) => view.derived.find((d) => d.name.toLowerCase() === name.toLowerCase())?.field ?? name;
    for (const f of view.filters) {
        const def = FILTERS[f.type];
        const column = columnOf(readsSource(def, f) ? sourceOf(f.field) : f.field);
        if (def.stage !== "items" || !column) {
            continue;
        }
        const allowed = def.allowed(column, f, locale, today);
        const codes = column.codes;
        rows = filterRows(rows, (r) => allowed[codes[r] + 1] === 1);
    }
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
    const valueFilters = view.filters
        .filter((f) => FILTERS[f.type].stage === "values")
        .map((f, i) => ({ f, i, ...levelOf(f.field) }))
        .sort((a, b) => a.order - b.order || a.i - b.i);
    for (const { f, fields } of valueFilters) {
        const columns = fields.map(columnOf);
        if (columns.includes(null)) {
            continue;
        }
        const { groupOf, paths } = ctx.groupBy(columns, rows);
        const values = ctx.aggregateGroups(f.by, rows, groupOf, paths.length);
        const keep = FILTERS[f.type].keep(f, values, paths);
        rows = filterRows(rows, (_r, i) => keep[groupOf[i]] === 1);
    }
    return rows;
}

