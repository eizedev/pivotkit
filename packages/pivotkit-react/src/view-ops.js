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

/** Changes properties of the value at `index` (agg, format, label, showAs, conditional). */
export function updateValue(view, index, patch) {
    const next = clone(view);
    if (!next.values[index]) {
        return view;
    }
    const value = { ...next.values[index], ...patch };
    if (patch.agg && patch.agg !== view.values[index].agg) {
        // a calculation or a format chosen for another aggregator may not fit the new one
        value.showAs = patch.showAs ?? null;
        value.format = patch.format ?? null;
    }
    next.values[index] = value;
    return next;
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

/** Top or bottom N items of a field by a value ({ count, bottom, by }), or null to remove it. */
export function setTopFilter(view, field, top) {
    return replaceFilters(view, field, ["top"], top ? [{ field, type: "top", count: top.count, bottom: Boolean(top.bottom), ...(top.by ? { by: top.by } : {}) }] : []);
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

/** Switches to the chart with a picker entry's settings (chart-types.js). */
export function setChart(view, name) {
    const next = clone(view);
    next.chart = { ...CHART_TYPES[name].chart };
    next.display = "chart";
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
