/*
 * Every change the UI makes to a view, as pure functions: (view, ...) -> new view. The input is a
 * normalized view (pivotkit-core's normalize()); the output is a plain view object that the core
 * normalizes again before it computes, so a function here never has to validate names itself.
 *
 * Zones: "rows" and "cols" are the axes, "values" the value list, "filters" the fields that filter the
 * report without being on an axis. A field in the Filters zone is a filter entry; one that filters
 * nothing yet is { type: "exclude", items: [] }.
 */

import { LIMITS, aggregatorsFor, isFormat } from "pivotkit-core";
import { CHART_TYPES } from "./chart-types.js";

/** @typedef {"rows" | "cols" | "values" | "filters"} Zone */
export const ZONES = Object.freeze(/** @type {Zone[]} */ (["filters", "cols", "rows", "values"]));

const clone = (view) => JSON.parse(JSON.stringify(view));
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const clamp = (i, n) => (Number.isInteger(i) ? Math.max(0, Math.min(i, n)) : n);

/** The fields shown in the Filters zone: filtered fields that are on no axis, once each. */
export function filterZoneFields(view) {
    const seen = new Set();
    const out = [];
    for (const f of view.filters) {
        const key = f.field.toLowerCase();
        if (!seen.has(key) && !view.rows.some((r) => same(r, f.field)) && !view.cols.some((c) => same(c, f.field))) {
            seen.add(key);
            out.push(f.field);
        }
    }
    return out;
}

/** The axis a field is on, or null. */
export function axisOf(view, field) {
    if (view.rows.some((r) => same(r, field))) {
        return "rows";
    }
    if (view.cols.some((c) => same(c, field))) {
        return "cols";
    }
    return null;
}

/**
 * The aggregator a new value of a field gets: the host's choice for the field when it fits the type
 * (fieldDefaults), else sum for numbers and count for anything else.
 * @param {string | undefined} type
 * @param {string} [wanted]
 */
export function defaultAgg(type, wanted) {
    if (typeof wanted === "string" && aggregatorsFor(type ?? "string").includes(wanted)) {
        return wanted;
    }
    return type === "number" && aggregatorsFor(type).includes("sum") ? "sum" : "count";
}

/** Drops derived fields nothing refers to any more, and sort, collapsed and filter entries of fields
 *  that left the report. */
function tidy(view) {
    const used = new Set([...view.rows, ...view.cols, ...view.values.map((v) => v.field), ...view.filters.map((f) => f.field)].filter(Boolean).map((n) => n.toLowerCase()));
    view.derived = view.derived.filter((d) => used.has(d.name.toLowerCase()));
    view.sort = view.sort.filter((s) => used.has(s.field.toLowerCase()));
    return view;
}

function dropFromAxes(view, field) {
    view.rows = view.rows.filter((r) => !same(r, field));
    view.cols = view.cols.filter((c) => !same(c, field));
}

/** Collapsed paths belong to the fields of an axis; a change of the axis fields makes them meaningless. */
function resetCollapsed(view, before) {
    for (const axis of ["rows", "cols"]) {
        if (JSON.stringify(before[axis]) !== JSON.stringify(view[axis])) {
            view.collapsed[axis] = [];
        }
    }
}

/**
 * @typedef {object} AddOptions
 * @property {number} [index]  position in the zone, default the end
 * @property {string} [type]  the field's column type, for the aggregator
 * @property {{ agg?: string, format?: string, order?: unknown[] }} [defaults]  the host's settings for
 *   the field: a new value's aggregator and format, the custom order of its items on an axis
 * @property {string | null} [dateUnit]  a date grouping to place instead of the raw date (rows, columns, filters)
 * @property {string} [groupName]  the name of that grouping's derived field
 */

/**
 * The first zone of a view with more entries than pivotkit-core keeps (Rows and Columns:
 * `limits.axisFields`, Values: `limits.values`), with that maximum; null when every zone fits.
 * normalize() would drop the rest without a word, so the UI refuses such a step or says what it left
 * out.
 * @param {any} view
 * @param {Partial<import("pivotkit-core").Limits> | undefined} limits  the host's, over LIMITS
 * @returns {{ zone: "rows" | "cols" | "values", max: number } | null}
 */
export function zoneOverLimit(view, limits) {
    const limit = (name) => (limits && Number.isInteger(limits[name]) && limits[name] > 0 ? limits[name] : LIMITS[name]);
    for (const [zone, name] of /** @type {const} */ ([["rows", "axisFields"], ["cols", "axisFields"], ["values", "values"]])) {
        const list = view && Array.isArray(view[zone]) ? view[zone] : [];
        if (list.length > limit(name)) {
            return { zone, max: limit(name) };
        }
    }
    return null;
}

/**
 * Places a field in a zone at an index (default the end). On an axis the field leaves the other axis
 * (a field is on one axis only); in Values it is added as a new value, so a field can be summed and
 * averaged at once; in Filters it gets an empty filter unless it has one. With `dateUnit` a date is
 * placed grouped (by month, say), as its derived field.
 * @param {any} view
 * @param {string} field
 * @param {Zone} zone
 * @param {AddOptions} [options]
 */
export function addField(view, field, zone, options = {}) {
    if (options.dateUnit && zone !== "values") {
        const name = options.groupName ?? `${field} (${options.dateUnit})`;
        // the grouping moves when it is placed again, like any field
        // (a grouping has items of its own: the host's order of the date does not apply)
        const placed = addField(removeField(view, name), field, zone, { ...options, dateUnit: null, defaults: undefined });
        return groupField(placed, field, options.dateUnit, { name }).view;
    }
    const next = clone(view);
    if (zone === "rows" || zone === "cols") {
        dropFromAxes(next, field);
        next[zone].splice(clamp(options.index, next[zone].length), 0, field);
        const order = options.defaults?.order;
        if (Array.isArray(order) && order.length > 0 && !next.sort.some((s) => same(s.field, field))) {
            next.sort.push({ field, by: "custom", order: "asc", items: [...order] });
        }
    } else if (zone === "values") {
        const wanted = options.defaults ?? {};
        const format = typeof wanted.format === "string" && isFormat(wanted.format) ? wanted.format : null;
        next.values.splice(clamp(options.index, next.values.length), 0, { field, agg: defaultAgg(options.type, wanted.agg), format, label: null, showAs: null, conditional: null });
    } else if (zone === "filters") {
        dropFromAxes(next, field);
        if (!next.filters.some((f) => same(f.field, field))) {
            next.filters.push({ field, type: "exclude", items: [] });
        }
    }
    resetCollapsed(next, view);
    return tidy(next);
}

/**
 * Removes the entry at `index` of a zone. A field leaving an axis or the Filters zone takes its
 * filters and its sort with it, as in Excel; a value leaves only that value.
 */
export function removeAt(view, zone, index) {
    const next = clone(view);
    if (zone === "values") {
        next.values.splice(index, 1);
    } else {
        const list = zone === "filters" ? filterZoneFields(view) : view[zone];
        const field = list[index];
        if (field === undefined) {
            return view;
        }
        dropFromAxes(next, field);
        next.filters = next.filters.filter((f) => !same(f.field, field));
    }
    resetCollapsed(next, view);
    return tidy(next);
}

/** Takes a field off the axes and out of the Filters zone (its filters go with it). */
function removeField(view, field) {
    if (!axisOf(view, field) && !filterZoneFields(view).some((f) => same(f, field))) {
        return view;
    }
    const next = clone(view);
    dropFromAxes(next, field);
    next.filters = next.filters.filter((f) => !same(f.field, field));
    resetCollapsed(next, view);
    return tidy(next);
}

/** The field name of the entry at `index` of a zone. */
export function fieldAt(view, zone, index) {
    if (zone === "values") {
        return view.values[index] ? view.values[index].field : undefined;
    }
    return (zone === "filters" ? filterZoneFields(view) : view[zone])[index];
}

/**
 * Moves an entry from one zone to another (or within one zone) to an index of the target zone. A value
 * moved to an axis or Filters places its field there; an axis field moved to Values adds a value and
 * leaves the axis.
 */
/**
 * @param {any} view
 * @param {Zone} from
 * @param {number} fromIndex
 * @param {Zone} to
 * @param {number | undefined} toIndex
 * @param {AddOptions} [options]
 */
export function moveField(view, from, fromIndex, to, toIndex, options = {}) {
    if (from === to) {
        return reorder(view, from, fromIndex, toIndex);
    }
    const field = fieldAt(view, from, fromIndex);
    if (field === undefined || field === null) {
        return view;
    }
    let next = clone(view);
    if (from === "values") {
        next.values.splice(fromIndex, 1);
    } else if (to !== "filters") {
        // the field keeps its filters when it moves between the axes and the Filters zone
        dropFromAxes(next, field);
        if (to === "values") {
            next.filters = next.filters.filter((f) => !same(f.field, field));
        }
    }
    next = addField(next, field, to, { ...options, index: toIndex });
    resetCollapsed(next, view);
    return tidy(next);
}

/** Moves an entry within a zone. */
export function reorder(view, zone, from, to) {
    const list = zone === "filters" ? null : zone === "values" ? view.values : view[zone];
    if (!list || from === to || from < 0 || from >= list.length) {
        return view;
    }
    const next = clone(view);
    const target = next[zone];
    const [item] = target.splice(from, 1);
    target.splice(clamp(to, target.length), 0, item);
    resetCollapsed(next, view);
    return next;
}

/** Aggregators whose result counts rows or items instead of being a value of the field (its unit). */
const COUNTING = new Set(["count", "countUnique", "listUnique"]);
const unitOf = (agg) => (COUNTING.has(agg) ? "count" : "field");

/**
 * Changes properties of the value at `index` (agg, format, label, showAs, conditional). A new
 * aggregator drops the "show values as" calculation (a running total does not fit an average) and
 * picks the format: one the patch names; else the user's own format (one that is not the host's
 * default) while the result keeps its unit (average to median: still years); else the host's format
 * for the field (fieldDefaults) when its aggregator has that unit; else none, the automatic one.
 * @param {any} view
 * @param {number} index
 * @param {{ agg?: string, format?: string | null, label?: string | null, showAs?: object | null, conditional?: object | null }} patch
 * @param {{ defaults?: { agg?: string, format?: string } }} [options]  `defaults`: the host's
 *   settings for the value's field
 */
export function updateValue(view, index, patch, options = {}) {
    const next = clone(view);
    if (!next.values[index]) {
        return view;
    }
    const before = view.values[index];
    const value = { ...next.values[index], ...patch };
    if (patch.agg && patch.agg !== before.agg) {
        value.showAs = patch.showAs ?? null;
        const wanted = options.defaults ?? {};
        const hostFormat = typeof wanted.format === "string" && isFormat(wanted.format) ? wanted.format : null;
        const own = before.format && before.format !== hostFormat ? before.format : null;
        if (patch.format !== undefined) {
            value.format = patch.format;
        } else if (own) {
            value.format = unitOf(before.agg) === unitOf(patch.agg) ? own : null;
        } else {
            // the host's format belongs to its aggregator for the field (a number of days to an average, say)
            value.format = hostFormat && unitOf(typeof wanted.agg === "string" ? wanted.agg : "sum") === unitOf(patch.agg) ? hostFormat : null;
        }
    }
    next.values[index] = value;
    return next;
}

/**
 * The smallest and the largest number of a number column, for the range form; null without numbers.
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {string} field
 * @returns {{ min: number, max: number } | null}
 */
export function numberRange(encoded, field) {
    const column = encoded.column(field);
    if (!column || column.type !== "number") {
        return null;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of column.dict) {
        if (typeof v === "number" && Number.isFinite(v)) {
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
    }
    return min <= max ? { min, max } : null;
}

/**
 * Why ranges of `size` from `start` cannot hold the numbers of `range`, or null when they can. A start
 * so far from the values that a range's bounds can no longer be told apart in a double (1e17 for
 * magnitudes of 2 to 9 in ranges of 0.5) would put every row into "(blank)": "far".
 * @param {number} size
 * @param {number} start
 * @param {{ min: number, max: number } | null} range
 * @returns {"far" | null}
 */
export function binProblem(size, start, range) {
    if (!range) {
        return null;
    }
    for (const v of [range.min, range.max]) {
        const k = Math.floor((v - start) / size);
        const low = start + k * size;
        const slack = size * 1e-9;
        if (!Number.isSafeInteger(k) || low + size === low || low > v + slack || v >= low + size + slack) {
            return "far";
        }
    }
    return null;
}

/**
 * The derived field a grouping makes of a field on an axis: replaces it in place. `unit` null removes
 * the grouping (back to the source field). Returns the view and the new field's name.
 * @param {any} view
 * @param {string} field  the field on the axis (a source field or a derived one)
 * @param {string | null} unit  a DERIVED unit of pivotkit-core ("year", "month", "bin", ...)
 * @param {{ size?: number, origin?: number, name?: string }} [options]  bins: size and origin (the
 *   start of the ranges; without one a range field keeps its own, else 0); name: the derived field's name
 */
export function groupField(view, field, unit, options = {}) {
    const spec = view.derived.find((d) => same(d.name, field));
    const source = spec ? spec.field : field;
    const axis = axisOf(view, field);
    const next = clone(view);
    let name = source;
    if (unit) {
        name = options.name ?? `${source} (${unit})`;
        const existing = next.derived.find((d) => same(d.name, name));
        const origin = options.origin ?? (spec?.by === "bin" ? spec.origin ?? 0 : 0);
        const wanted = unit === "bin" ? { name, field: source, by: unit, size: options.size, origin } : { name, field: source, by: unit };
        if (existing) {
            Object.assign(existing, wanted);
        } else {
            next.derived.push(wanted);
        }
    }
    if (axis) {
        const other = axis === "rows" ? "cols" : "rows";
        if (!same(name, field) && next[other].some((f) => same(f, name))) {
            // the grouping is on the other axis already: it stays there only
            next[axis] = next[axis].filter((f) => !same(f, field));
        } else {
            const seen = new Set();
            next[axis] = next[axis].map((f) => (same(f, field) ? name : f)).filter((f) => !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase()));
        }
    }
    if (!same(name, field)) {
        // the old field's filters name values the new grouping does not have
        const inFilterZone = !axis && filterZoneFields(view).some((f) => same(f, field));
        next.filters = next.filters.filter((f) => !same(f.field, field));
        if (inFilterZone) {
            next.filters.push({ field: name, type: "exclude", items: [] });
        }
    }
    next.sort = next.sort.map((s) => (same(s.field, field) ? { ...s, field: name } : s));
    resetCollapsed(next, view);
    return { view: tidy(next), field: name };
}

/** The grouping of a field: its derived spec, or null for a plain field. */
export function groupingOf(view, field) {
    return view.derived.find((d) => same(d.name, field)) ?? null;
}

/** The source field of a field: itself, or the field a derived field groups. */
export function sourceOf(view, field) {
    const spec = groupingOf(view, field);
    return spec ? spec.field : field;
}

/**
 * Sort of a field: { by: "label" | "value" | "custom", order, value?, items? }; null removes the field's sort entry
 * (natural label order).
 */
export function setSort(view, field, sort) {
    const next = clone(view);
    next.sort = next.sort.filter((s) => !same(s.field, field));
    if (sort) {
        next.sort.push({ field, ...sort });
    }
    return next;
}

/**
 * The view with the host's custom order (fieldDefaults.order) for every field on Rows or Columns that
 * has no sort entry: a saved or default view sorts such a field as placing it in the UI does
 * (addField). A field with an entry keeps it, "A to Z" included; a grouping has items of its own.
 * Returns the same view when there is nothing to add.
 * @param {any} view  normalized
 * @param {(field: string) => unknown[] | undefined} orderOf  the host's order of a source field
 */
export function withHostOrders(view, orderOf) {
    const missing = [...view.rows, ...view.cols].filter((field) => !view.derived.some((d) => same(d.name, field)) && !view.sort.some((s) => same(s.field, field)));
    const added = missing.map((field) => ({ field, order: orderOf(field) })).filter(({ order }) => Array.isArray(order) && order.length > 0);
    if (!added.length) {
        return view;
    }
    const next = clone(view);
    for (const { field, order } of added) {
        next.sort.push({ field, by: "custom", order: "asc", items: [.../** @type {unknown[]} */ (order)] });
    }
    return next;
}

/** The sort entry of a field, or null. */
export function sortOf(view, field) {
    return view.sort.find((s) => same(s.field, field)) ?? null;
}

/** Filters of one type of a field. */
export function filtersOf(view, field, types) {
    return view.filters.filter((f) => same(f.field, field) && (!types || types.includes(f.type)));
}

/** Replaces the filters of the given types of a field with `entries` (possibly none). */
function replaceFilters(view, field, types, entries) {
    const next = clone(view);
    const index = next.filters.findIndex((f) => same(f.field, field));
    const kept = next.filters.filter((f) => !(same(f.field, field) && types.includes(f.type)));
    const at = index === -1 ? kept.length : Math.min(index, kept.length);
    kept.splice(at, 0, ...entries);
    next.filters = kept;
    // a field in the Filters zone stays there with an empty filter when its last filter goes
    if (!axisOf(next, field) && filterZoneFields(view).some((f) => same(f, field)) && !kept.some((f) => same(f.field, field))) {
        next.filters.splice(at, 0, { field, type: "exclude", items: [] });
    }
    return next;
}

/**
 * Replaces one filter of a field, `previous` (a filter of the view, matched by its content), with
 * `entry`, or removes it when `entry` is null; without `previous` the entry is added after the field's
 * other filters. The field's other filters, also others of the same type, stay as they are.
 */
function replaceFilter(view, field, previous, entry) {
    const next = clone(view);
    const key = previous ? JSON.stringify(previous) : null;
    const at = key === null ? -1 : next.filters.findIndex((f) => same(f.field, field) && JSON.stringify(f) === key);
    if (at === -1) {
        if (!entry) {
            return next;
        }
        const last = next.filters.map((f) => same(f.field, field)).lastIndexOf(true);
        next.filters.splice(last + 1, 0, entry);
        return next;
    }
    if (entry) {
        next.filters[at] = entry;
    } else {
        next.filters.splice(at, 1);
        // a field in the Filters zone stays there with an empty filter when its last filter goes
        if (!axisOf(next, field) && filterZoneFields(view).some((f) => same(f, field)) && !next.filters.some((f) => same(f.field, field))) {
            next.filters.splice(at, 0, { field, type: "exclude", items: [] });
        }
    }
    return next;
}

/**
 * The item filter of a field from the selected values: everything selected removes it; otherwise the
 * values not selected are excluded, so values that appear in newer data are shown, as in Excel.
 * @param {any} view
 * @param {string} field
 * @param {Array<unknown>} selected  values (null is blank)
 * @param {Array<unknown>} all  every value of the field
 */
export function setItemFilter(view, field, selected, all) {
    const keep = new Set(selected.map((v) => JSON.stringify(v)));
    const excluded = all.filter((v) => !keep.has(JSON.stringify(v)));
    return replaceFilters(view, field, ["include", "exclude"], excluded.length ? [{ field, type: "exclude", items: excluded }] : []);
}

/** The values an item filter lets through, from the field's values; all of them without a filter. */
export function selectedItems(view, field, all) {
    let selected = all;
    for (const f of filtersOf(view, field, ["include", "exclude"])) {
        const listed = new Set(f.items.map((v) => JSON.stringify(v)));
        selected = selected.filter((v) => listed.has(JSON.stringify(v)) === (f.type === "include"));
    }
    return selected;
}

/** The label condition of a field ({ op, value }) or null to remove it. */
export function setLabelFilter(view, field, condition) {
    return replaceFilters(view, field, ["label"], condition && condition.value !== "" ? [{ field, type: "label", op: condition.op, value: condition.value }] : []);
}

/**
 * Top or bottom N items of a field by a value ({ count, bottom, by }), or null to remove it. `previous`
 * is the top filter being edited (the view's own entry); without it the field's top filters are
 * replaced. Another top filter of the field (a view may hold two) stays.
 */
export function setTopFilter(view, field, top, previous) {
    const entry = top ? { field, type: "top", count: top.count, bottom: Boolean(top.bottom), ...(top.by ? { by: top.by } : {}) } : null;
    if (previous) {
        return replaceFilter(view, field, previous, entry);
    }
    return replaceFilters(view, field, ["top"], entry ? [entry] : []);
}

/**
 * A value condition on a field ({ by, op, value, value2 }, pivotkit-core's `value` filter: "Sum of
 * Revenue greater than 1000"), or null to remove it. `previous` is the condition being edited (the
 * view's own entry): only that one is replaced or removed; without it every value condition of the
 * field is. The field keeps its other filters.
 * @param {any} view
 * @param {string} field
 * @param {{ by: { field: string | null, agg: string }, op: string, value: number, value2?: number } | null} condition
 * @param {object} [previous]
 */
export function setValueFilter(view, field, condition, previous) {
    /** @type {object | null} */
    let entry = null;
    if (condition) {
        const { by, op, value, value2 } = condition;
        const between = op === "between" || op === "notBetween";
        entry = { field, type: "value", by: { field: by.field, agg: by.agg }, op, value, ...(between ? { value2 } : {}) };
    }
    if (previous) {
        return replaceFilter(view, field, previous, entry);
    }
    return replaceFilters(view, field, ["value"], entry ? [entry] : []);
}

/**
 * True when a value gives a number for each cell, so it can be shown as a share, formatted, highlighted,
 * sorted by and filtered by: not a list of distinct values, not the first or last entry of a text,
 * not an average, median, minimum or maximum of dates.
 * @param {{ agg: string }} spec
 * @param {string} type  the column type of the value's field ("number" for a row count)
 */
export function numericResult(spec, type) {
    return spec.agg !== "listUnique" && !(["first", "last"].includes(spec.agg) && type !== "number") && !(type === "date" && ["average", "median", "min", "max"].includes(spec.agg));
}

/**
 * The measures to choose from with `ref` among them: a sort, a top N or a condition may go by a
 * measure the view no longer shows (its value was removed); it stays a choice, so applying the form
 * again keeps it.
 * @param {Array<{ field: string | null, agg: string }>} choices
 * @param {{ field: string | null, agg: string } | null | undefined} ref
 */
export function withMeasure(choices, ref) {
    return ref && !choices.some((c) => sameRef(c, ref)) ? [...choices, { field: ref.field ?? null, agg: ref.agg }] : choices;
}

/** True when two value references ({ field, agg }) name the same measure. */
export function sameRef(a, b) {
    return Boolean(a && b) && a.agg === b.agg && (a.field === null || b.field === null ? a.field === b.field : same(a.field, b.field));
}

/**
 * The measures a field on an axis can be sorted, ranked and filtered by: each value of the view that
 * gives a number, once per field and aggregator, in the view's order; the row count without one. The
 * first one is the default, as pivotkit-core's.
 * @param {any} view
 * @param {(field: string) => string | undefined} typeOf  the column type of a field
 * @returns {Array<{ field: string | null, agg: string }>}
 */
export function measureChoices(view, typeOf) {
    const out = [];
    for (const v of view.values) {
        const ref = { field: v.field ?? null, agg: v.agg };
        if (numericResult(v, v.field ? typeOf(v.field) ?? "string" : "number") && !out.some((r) => sameRef(r, ref))) {
            out.push(ref);
        }
    }
    return out.length ? out : [{ field: null, agg: "count" }];
}

/**
 * Removes what the filter of a field keeps out: its item list, its text condition and a value
 * condition; Top N has its own control and stays. A field in the Filters zone stays there, unfiltered.
 */
export function removeFilters(view, field) {
    return replaceFilters(view, field, ["include", "exclude", "label", "value"], []);
}

/** True when a field has an item, text or value filter that removes something (Top N is not counted). */
export function hasFilter(view, field) {
    return filtersOf(view, field, ["include", "exclude", "label", "value"]).some((f) => f.type !== "exclude" || f.items.length > 0);
}

/** True when a field has a filter that removes something. */
export function isFiltered(view, field) {
    return filtersOf(view, field).some((f) => f.type !== "exclude" || f.items.length > 0);
}

/** Collapses or expands one group of an axis. */
export function toggleCollapsed(view, axis, path) {
    const next = clone(view);
    const key = JSON.stringify(path);
    const list = next.collapsed[axis];
    const at = list.findIndex((p) => JSON.stringify(p) === key);
    if (at === -1) {
        list.push(path);
    } else {
        list.splice(at, 1);
    }
    return next;
}

/**
 * What "Expand all" and "Collapse all" would do for the rows: each is offered only when it changes
 * something. `outer` are the groups that can collapse (every level but the last, from the pivot's
 * tree); `why` names the reason when one of them would change nothing.
 * @param {any} view
 * @param {Array<Array<unknown>>} outer
 * @returns {{ canExpand: boolean, canCollapse: boolean, collapsed: number, open: number, why: { expand: string | null, collapse: string | null } }}
 */
export function rowFolding(view, outer) {
    const keys = new Set(view.collapsed.rows.map((p) => JSON.stringify(p)));
    const collapsed = outer.filter((p) => keys.has(JSON.stringify(p))).length;
    const open = view.rows.length < 2 ? 0 : outer.length - collapsed;
    const canExpand = view.collapsed.rows.length > 0;
    const canCollapse = open > 0;
    return {
        canExpand,
        canCollapse,
        collapsed: view.collapsed.rows.length,
        open,
        why: {
            expand: canExpand ? null : "expandNothing",
            collapse: canCollapse ? null : view.rows.length < 2 ? "collapseNeedsRows" : "collapseAllDone"
        }
    };
}

/**
 * Collapses every group of the outer levels of an axis (paths from the pivot's tree), or expands all.
 * @param {any} view
 * @param {"rows" | "cols"} axis
 * @param {Array<Array<unknown>> | null} paths  the paths to collapse; null expands everything
 */
export function setCollapsed(view, axis, paths) {
    const next = clone(view);
    next.collapsed[axis] = paths ? paths : [];
    return next;
}

/** The four totals of Options, in their order. */
export const TOTALS = Object.freeze(["grandTotalRow", "grandTotalColumn", "rowSubtotals", "colSubtotals"]);

/**
 * Why a total of Options would change nothing in this view, or null when it changes something: a
 * grand total row needs a field in Rows (without one the only row is the total), a grand total column
 * one in Columns, subtotals two or more fields on their axis. The key names the text (labels).
 * @param {any} view
 * @param {string} key  one of TOTALS
 * @returns {string | null}
 */
export function totalNoEffect(view, key) {
    if (key === "grandTotalRow") {
        return view.rows.length >= 1 ? null : "needsRowField";
    }
    if (key === "grandTotalColumn") {
        return view.cols.length >= 1 ? null : "needsColField";
    }
    if (key === "rowSubtotals") {
        return view.rows.length >= 2 ? null : "needsRowFields";
    }
    return view.cols.length >= 2 ? null : "needsColFields";
}

/** Turns one of the totals on or off. */
export function setTotal(view, key, on) {
    const next = clone(view);
    next.totals[key] = Boolean(on);
    return next;
}

/** Table or chart. */
export function setDisplay(view, display) {
    const next = clone(view);
    next.display = display;
    return next;
}

/** Switches to the chart with a picker entry's settings (chart-types.js); its display settings stay. */
export function setChart(view, name) {
    const next = clone(view);
    next.chart = { ...next.chart, ...CHART_TYPES[name].chart };
    next.display = "chart";
    return next;
}

/**
 * Changes how the chart is drawn: { valueLabels, legend, title, smooth } (pivotkit-core's chart
 * settings); the chart type stays.
 * @param {any} view
 * @param {{ valueLabels?: string, legend?: string, title?: string | null, smooth?: boolean }} patch
 */
export function setChartDisplay(view, patch) {
    const next = clone(view);
    next.chart = { ...next.chart, ...patch };
    return next;
}

/**
 * Swaps the fields of Rows and Columns, with their collapsed groups; a calculation along an axis
 * ("running total along Rows") goes along the other one, so it still runs along the same fields.
 */
export function swapAxes(view) {
    const next = clone(view);
    [next.rows, next.cols] = [next.cols, next.rows];
    next.collapsed = { rows: next.collapsed.cols, cols: next.collapsed.rows };
    for (const v of next.values) {
        if (v.showAs && v.showAs.axis) {
            v.showAs = { ...v.showAs, axis: v.showAs.axis === "rows" ? "cols" : "rows" };
        }
    }
    const swapped = { percentOfRowTotal: "percentOfColumnTotal", percentOfColumnTotal: "percentOfRowTotal", percentOfParentRow: "percentOfParentColumn", percentOfParentColumn: "percentOfParentRow" };
    for (const v of next.values) {
        if (v.showAs && Object.hasOwn(swapped, v.showAs.type)) {
            v.showAs = { ...v.showAs, type: swapped[v.showAs.type] };
        }
    }
    return next;
}

/** True when nothing is placed: the UI shows its first steps. */
export function isEmptyView(view) {
    return view.rows.length === 0 && view.cols.length === 0 && view.values.length === 0;
}
