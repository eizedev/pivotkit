/*
 * The changes the first load makes to a view (placing, moving, sorting by a header, totals, the tips'
 * actions; those only the menus make are in menu-ops.js, loaded with them), as pure functions:
 * (view, ...) -> new view. The input is a normalized view (pivotkit-core's normalize()); the output
 * is a plain view object that the core normalizes again before it computes, so a function here never
 * has to validate names itself.
 *
 * Zones: "rows" and "cols" are the axes, "values" the value list, "filters" the fields that filter the
 * report without being on an axis. A field in the Filters zone is a filter entry; one that filters
 * nothing yet is emptyPick(): { type: "in", items: [], not: true, blanks: "include" }.
 *
 * Filters are pivotkit-core's view version 2: { field, type, ..., not, blanks }. The menus keep their
 * own words for a negated rule ("is not", "does not contain", "is not between"): ruleOp() reads a
 * filter's operator in those words, opOf() writes one back as version 2's operator with `not`; the
 * picks of a field (its `in` filter) are the values not ticked, read by selectedItems() and written by
 * pickFilter().
 */

import { LIMITS, aggregatorsFor, foldText, isFormat } from "pivotkit-core";
import { CHART_TYPES } from "./chart-types.js";

/** @typedef {"rows" | "cols" | "values" | "filters"} Zone */
export const ZONES = Object.freeze(/** @type {Zone[]} */ (["filters", "cols", "rows", "values"]));

export const clone = (view) => JSON.parse(JSON.stringify(view));

/** The negated operators the menus offer, by the version-2 operator they negate. */
const NEGATED = Object.freeze({ "=": "!=", between: "notBetween", equals: "notEquals", contains: "notContains" });
/** The operators of the menus' rules: on an item's name, on an item or its total. */
export const RULE_OPS = Object.freeze({
    text: Object.freeze(["equals", "notEquals", "contains", "notContains", "beginsWith", "endsWith"]),
    compare: Object.freeze(["=", "!=", ">", ">=", "<", "<=", "between", "notBetween"])
});

/**
 * A filter's operator as the menus name it: its own, or with `not` its negation ("!=", "notBetween",
 * "notContains"). A `not` the menus have no word for (a loaded view's "does not begin with") is
 * hiddenNot().
 * @param {{ op?: string, not?: boolean }} f
 */
export const ruleOp = (f) => (f.not && typeof f.op === "string" && Object.hasOwn(NEGATED, f.op) ? NEGATED[f.op] : String(f.op));

/** Whether a filter's `not` has no word in the menus (ruleOp gives the operator without it). */
export const hiddenNot = (f) => Boolean(f.not) && !(typeof f.op === "string" && Object.hasOwn(NEGATED, f.op));

/**
 * A menu's operator as version 2 writes it: `{ op, not }` ("notBetween" is between with not).
 * @param {string} menuOp
 */
export function opOf(menuOp) {
    const positive = Object.keys(NEGATED).find((op) => NEGATED[op] === menuOp);
    return positive ? { op: positive, not: true } : { op: menuOp, not: false };
}

/**
 * The pick of a field: the values not ticked dropped (null is the blank), so values that appear in
 * newer data are shown, as in Excel.
 * @param {string} field
 * @param {unknown[]} excluded
 */
export const pickFilter = (field, excluded) => ({ field, type: "in", items: excluded.filter((v) => v !== null), not: true, blanks: excluded.includes(null) ? "exclude" : "include" });

/** The pick of a field that drops nothing: a field in the Filters zone without a filter holds it. */
export const emptyPick = (field) => pickFilter(field, []);

/** Whether a filter is a field's pick (an item list, ticked in the menus). */
export const isPick = (f) => f.type === "in";

/** Whether a pick drops nothing (emptyPick). */
export const isEmptyPick = (f) => isPick(f) && f.not === true && f.items.length === 0 && f.blanks === "include";
export const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

/**
 * The items of a picker whose label holds what was typed: as text filters compare (pivotkit-core's
 * foldText), so case and runs of whitespace, a no-break space among them, do not matter.
 * @param {Array<{ label: string } & Record<string, any>>} items
 * @param {string} query
 */
export function searchItems(items, query) {
    const q = foldText(query);
    return q ? items.filter((i) => foldText(i.label).includes(q)) : items;
}

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
            next.filters.push(emptyPick(field));
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
 * The first and the last date of a date column (wall-clock ms, as the column holds them), or null
 * for another type or a column without dates: the data's span, which a relative range is measured
 * against ("2026 has no data") and the anchor "latest" counts back from.
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {string} field  a date column (a grouping's source, see sourceOf)
 * @returns {{ min: number, max: number } | null}
 */
export function dateSpan(encoded, field) {
    const column = encoded.column(field);
    if (!column || column.type !== "date") {
        return null;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of column.dict) {
        if (typeof v === "number") {
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
    }
    return min <= max ? { min, max } : null;
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
            next.filters.push(emptyPick(name));
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

/**
 * The entry setSort writes for a sort the user chose: A to Z is the default without an entry, except
 * for a field with the host's order, which keeps it as an entry, or the host's order would come back
 * (withHostOrders).
 * @param {{ by: string, order: string }} spec
 * @param {boolean} [hostOrdered]  the field has the host's order (fieldDefaults.order)
 */
export function sortEntry(spec, hostOrdered) {
    return spec.by === "label" && spec.order === "asc" && !hostOrdered ? null : spec;
}

/**
 * What a click on a header of the table sorts: a row field's name sorts that field by label; a value's
 * name sorts the innermost row field by that value. Only a value's header that stands for the whole
 * row does (its column path is empty: the one value header over all columns, the values without
 * column fields, the grand total column), and only a value that gives a number (numericResult). Null
 * for every other header.
 * @param {any} view
 * @param {{ kind: string, field?: string, valueIndex?: number, colPath?: any[] }} cell  a header cell of the grid
 * @param {(field: string) => string | undefined} typeOf  the column type of a field
 * @returns {{ field: string, ref?: { field: string | null, agg: string } } | null}
 */
export function headerSortTarget(view, cell, typeOf) {
    if (cell.kind === "corner") {
        return cell.field && view.rows.some((f) => same(f, cell.field)) ? { field: cell.field } : null;
    }
    const spec = cell.kind === "colHeader" && cell.valueIndex !== undefined && !cell.colPath?.length ? view.values[cell.valueIndex] : undefined;
    if (!spec || !view.rows.length || !numericResult(spec, spec.field ? typeOf(spec.field) ?? "string" : "number")) {
        return null;
    }
    return { field: view.rows[view.rows.length - 1], ref: { field: spec.field ?? null, agg: spec.agg } };
}

/**
 * The sort a header shows (aria-sort): "ascending", "descending", "other" (a custom order), or null
 * when the rows are not in its order; `chosen` when a sort entry of the view puts them in it (the
 * default A to Z of a field without an entry is not chosen).
 * @param {any} view
 * @param {{ field: string, ref?: { field: string | null, agg: string } }} target  headerSortTarget's
 * @returns {{ order: "ascending" | "descending" | "other" | null, chosen: boolean }}
 */
export function headerSortState(view, target) {
    const s = sortOf(view, target.field);
    const word = (order) => (order === "desc" ? "descending" : "ascending");
    if (target.ref) {
        return s?.by === "value" && sameRef(s.value, target.ref) ? { order: word(s.order), chosen: true } : { order: null, chosen: false };
    }
    if (!s) {
        return { order: "ascending", chosen: false };
    }
    return { order: s.by === "label" ? word(s.order) : s.by === "custom" ? "other" : null, chosen: s.by === "label" };
}

/**
 * The field's sort entry after a click on a header (setSort's argument): a value's header goes from
 * largest first to smallest first to no sort by it (the field's default order); a row field's name
 * from A to Z to Z to A and back, and to A to Z from a sort by a value or a custom order.
 * @param {any} view
 * @param {{ field: string, ref?: { field: string | null, agg: string } }} target  headerSortTarget's
 * @param {boolean} [hostOrdered]  the field has the host's order (fieldDefaults.order)
 */
export function nextHeaderSort(view, target, hostOrdered) {
    const s = sortOf(view, target.field);
    if (target.ref) {
        const mine = s?.by === "value" && sameRef(s.value, target.ref);
        return mine && s.order === "asc" ? null : { by: "value", order: mine ? "asc" : "desc", value: mine ? s.value : target.ref };
    }
    const desc = !s || (s.by === "label" && s.order === "asc");
    return sortEntry({ by: "label", order: desc ? "desc" : "asc" }, hostOrdered);
}

/** Filters of one type of a field. */
export function filtersOf(view, field, types) {
    return view.filters.filter((f) => same(f.field, field) && (!types || types.includes(f.type)));
}

/** The values a field's picks let through, from the field's values (null is the blank); all of them without a pick. */
export function selectedItems(view, field, all) {
    let selected = all;
    for (const f of filtersOf(view, field, ["in"])) {
        const listed = new Set(f.items.map((v) => JSON.stringify(v)));
        const blank = f.blanks !== "exclude";
        selected = selected.filter((v) => (v === null ? blank : f.blanks !== "only" && listed.has(JSON.stringify(v)) !== f.not));
    }
    return selected;
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

/** True when two value references ({ field, agg }) name the same measure. */
export function sameRef(a, b) {
    return Boolean(a && b) && a.agg === b.agg && (a.field === null || b.field === null ? a.field === b.field : same(a.field, b.field));
}

/** True when a field has a filter that removes something. */
export function isFiltered(view, field) {
    return filtersOf(view, field).some((f) => !isEmptyPick(f));
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
        // keys of the menus' texts (menu-labels.js): the Options menu shows them with its labels
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

