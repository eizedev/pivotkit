/*
 * The view changes and checks only the menus make (the filter, the chip menus, Options), as pure
 * functions like view-ops.js's, and the filter's summary a chip menu shows (with the names of
 * names.js): loaded with the menus (menus.js), so they stay out of the first load. view-ops.js holds
 * what the first render and its clicks need (placing, moving, sorting by a header, the tips' actions).
 */

import { isFormat } from "pivotkit-core";
import { fill } from "./labels.js";
import { valueConditionText } from "./names.js";
import { axisOf, clone, filterZoneFields, filtersOf, numericResult, same, sameRef, sourceOf } from "./view-ops.js";

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
 * The measures to choose from with `ref` among them: a sort, a top N or a condition may go by a
 * measure the view no longer shows (its value was removed); it stays a choice, so applying the form
 * again keeps it.
 * @param {Array<{ field: string | null, agg: string }>} choices
 * @param {{ field: string | null, agg: string } | null | undefined} ref
 */
export function withMeasure(choices, ref) {
    return ref && !choices.some((c) => sameRef(c, ref)) ? [...choices, { field: ref.field ?? null, agg: ref.agg }] : choices;
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

/**
 * The condition on a field's labels its type offers: "text" for text, "number" for a number (on the
 * label as shown), none for a date (or a grouping of one) and a yes/no field, whose items the list
 * above chooses.
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {any} view
 * @param {string} field
 * @returns {"text" | "number" | null}
 */
export function conditionKind(encoded, view, field) {
    const type = encoded.column(sourceOf(view, field))?.type ?? "string";
    return type === "date" || type === "boolean" ? null : type === "number" ? "number" : "text";
}

/**
 * What the filter of a field keeps, in short, for its menu's first level and the chip: "15 of 45",
 * "contains “abc”", "Sum of Revenue > 1,000", joined by commas; null without a filter.
 * @param {any} view
 * @param {string} field
 * @param {{ summary: { shown: number, total: number } | null } | null | undefined} state  the chip's state (zones.jsx)
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 */
export function filterState(view, field, state, labels, locale) {
    const same = (f) => typeof f.field === "string" && f.field.toLowerCase() === field.toLowerCase();
    const parts = [];
    if (state && state.summary) {
        parts.push(fill(labels.filterSummary, { shown: state.summary.shown.toLocaleString(locale), total: state.summary.total.toLocaleString(locale) }));
    }
    for (const f of view.filters.filter(same)) {
        if (f.type === "label") {
            const op = Object.hasOwn(labels.labelOps, f.op) ? labels.labelOps[f.op] : f.op;
            parts.push(`${op} ${fill(labels.quote, { text: f.value })}`);
        } else if (f.type === "value") {
            parts.push(valueConditionText(view, f, labels, locale));
        }
    }
    return parts.length ? parts.join(", ") : null;
}
