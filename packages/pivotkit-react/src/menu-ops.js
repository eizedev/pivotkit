/*
 * The view changes and checks only the menus make (the filter, the chip menus, Options), as pure
 * functions like view-ops.js's, and the filter's summary a chip menu shows (with the names of
 * names.js): loaded with the menus (menus.js), so they stay out of the first load. view-ops.js holds
 * what the first render and its clicks need (placing, moving, sorting by a header, the tips' actions).
 */

import { CATALOG, MATCH_DEFAULTS, computePivot, isFormat } from "pivotkit-core";
import { fill } from "./labels.js";
import { itemRuleText, valueConditionText, wholeYears } from "./names.js";
import { axisOf, clone, emptyPick, filterZoneFields, filtersOf, groupingOf, numericResult, opOf, pickFilter, same, sameRef, sourceOf } from "./view-ops.js";

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
        next.filters.splice(at, 0, emptyPick(field));
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
            next.filters.splice(at, 0, emptyPick(field));
        }
    }
    return next;
}

/**
 * The pick of a field from the selected values: everything selected removes it; otherwise the
 * values not selected are dropped (pickFilter), so values that appear in newer data are shown, as in Excel.
 * @param {any} view
 * @param {string} field
 * @param {Array<unknown>} selected  values (null is blank)
 * @param {Array<unknown>} all  every value of the field
 */
export function setItemFilter(view, field, selected, all) {
    const keep = new Set(selected.map((v) => JSON.stringify(v)));
    const excluded = all.filter((v) => !keep.has(JSON.stringify(v)));
    return replaceFilters(view, field, ["in"], excluded.length ? [pickFilter(field, excluded)] : []);
}

/**
 * A rule on the name of a field's items: a text filter ({ op, value, on }, `op` a menu's operator of
 * RULE_OPS.text, `on` textOn()), case and runs of whitespace ignored, or null to remove the field's
 * text filters.
 * @param {any} view
 * @param {string} field
 * @param {{ op: string, value: string, on: "value" | "label" } | null} condition
 */
export function setLabelFilter(view, field, condition) {
    return replaceFilters(view, field, ["text"], condition && condition.value !== "" ? [textRule(field, condition)] : []);
}

/**
 * A text filter of a menu's rule on the name: `op` a menu's operator, the text matched as people type
 * it (MATCH_DEFAULTS: case and runs of whitespace, a no-break space among them, do not matter), the
 * blanks dropped.
 * @param {string} field
 * @param {{ op: string, value: string, on: "value" | "label" }} condition
 */
export const textRule = (field, { op, value, on }) => ({ field, type: "text", ...opOf(op), value, on, match: { ...MATCH_DEFAULTS }, blanks: "exclude" });

/**
 * What a rule on the name compares: a text field's value, else the label the table shows (a number,
 * a grouping's "Mar 2025").
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {string} field
 * @returns {"value" | "label"}
 */
export const textOn = (encoded, field) => (encoded.column(field)?.type === "string" ? "value" : "label");

/**
 * Top or bottom N items of a field by a value ({ count, bottom, by, ties }), or null to remove it.
 * `ties` "all" keeps the items tied with the last one too; without it the previous filter's ties stay.
 * `previous` is the top filter being edited (the view's own entry); without it the field's top filters
 * are replaced. Another top filter of the field (a view may hold two) stays.
 */
export function setTopFilter(view, field, top, previous) {
    const ties = top?.ties ?? previous?.ties;
    const entry = top ? { field, type: "top", count: top.count, bottom: Boolean(top.bottom), ...(top.by ? { by: top.by } : {}), ...(ties === "all" ? { ties: "all" } : {}) } : null;
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
        const v2 = opOf(op);
        entry = { field, type: "value", by: { field: by.field, agg: by.agg }, op: v2.op, value, ...(v2.op === "between" ? { value2 } : {}), not: v2.not };
    }
    if (previous) {
        return replaceFilter(view, field, previous, entry);
    }
    return replaceFilters(view, field, ["value"], entry ? [entry] : []);
}

/** The filter types the rule editor of the Filter level holds: on the item, its total, its name. */
export const RULE_TYPES = Object.freeze(["relative", "compare", "value", "text"]);

/** The most rules one field takes in the Filter level (the view's `limits.filters` counts all fields). */
export const RULES_MAX = 10;

/**
 * Replaces one rule of a field, `previous` (the view's own entry, matched by its content), with
 * `entry` (a filter of RULE_TYPES), removes it when `entry` is null, or adds `entry` after the field's
 * other filters without `previous`.
 * @param {any} view
 * @param {string} field
 * @param {object | null} previous
 * @param {object | null} entry
 */
export const setRule = (view, field, previous, entry) => replaceFilter(view, field, previous, entry);

/** Date groupings by which "Last N months" says nothing the years do not: a year, its quarters. */
const COARSE = Object.freeze(["year", "yearQuarter"]);

/** The units of a date's quick choices, finest first (hours are left to a view's own filters). */
export const QUICK_UNITS = Object.freeze(["day", "week", "month", "quarter", "year"]);

/** The finest unit of the quick choices by a grouping along the time line; a date itself counts days. */
const FINEST = Object.freeze({ day: "day", yearWeek: "week", yearMonth: "month", yearQuarter: "quarter", year: "year" });

/**
 * How the Filter level's rules compare a field's items. `item`: "number" (a number typed), "date" (a
 * date field or a day grouping: a day chosen), "group" (another grouping: one of its items chosen),
 * null (text and yes/no have no comparison). `dates`: its source is a date (the words "from",
 * "before", the relative ranges); `cyclic`: a grouping that combines the years ("month of the year":
 * Years combined instead of the quick choices); `quick`: the quick choices are offered (a date along
 * the time line); `months`: "Last N months" among them (not for a grouping by year or quarter);
 * `days`: "Last N days" too (a date field or a day grouping). `unit`: the grouping's unit, for the
 * noun of its items. `units`: the units the quick choices count in (QUICK_UNITS), none finer than the
 * grouping (by month: months, quarters, years; a date itself or by day: days and weeks too).
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {any} view
 * @param {string} field
 * @returns {{ item: "number" | "date" | "group" | null, dates: boolean, cyclic: boolean, quick: boolean, months: boolean, days: boolean, unit: string | null, units: string[] }}
 */
export function ruleKind(encoded, view, field) {
    const grouping = groupingOf(view, field);
    const source = encoded.column(sourceOf(view, field))?.type ?? "string";
    const dates = source === "date";
    const item = grouping ? (grouping.by === "day" ? "date" : "group") : source === "number" || source === "date" ? source : null;
    const cyclic = dates && Boolean(grouping) && CATALOG.cyclicUnits.includes(grouping.by);
    const quick = dates && !cyclic;
    const finest = grouping ? (Object.hasOwn(FINEST, grouping.by) ? FINEST[grouping.by] : "day") : "day";
    const units = quick ? QUICK_UNITS.slice(QUICK_UNITS.indexOf(finest)) : [];
    return { item, dates, cyclic, quick, months: quick && !COARSE.includes(grouping?.by), days: quick && item === "date", unit: grouping?.by ?? null, units };
}

/**
 * A rule (RULE_TYPES) in short, as the chip and the Filter level say it: "last 5 years (2022–2026)",
 * "from 2022", "Count of Released > 3", "contains “an”".
 * @param {any} view
 * @param {any} f
 * @param {{ labels: any, locale: string, timeZone: string, date: boolean, labelOf?: (v: number) => string | undefined, span?: { min: number, max: number } | null }} options
 */
export function ruleText(view, f, { labels, locale, timeZone, date, labelOf, span }) {
    return f.type === "value" ? valueConditionText(view, f, labels, locale) : itemRuleText(f, labels, locale, { timeZone, date, labelOf, span, weekStart: view.formatting?.weekStart });
}

/**
 * The quick choice of a date field's Filter level its filters match: "all" (no relative range), or the
 * direction of the field's first relative range in a unit the choices offer (`fk.units`) that is not
 * inverted and keeps no blanks alone: "this", "last", "next" or "before", with its unit, count,
 * anchor, whether it goes by whole calendar periods (`calendar`) and takes the current one
 * (`includeCurrent`), and the filter itself; the field's other ranges and its comparisons are rules.
 * For a cyclic grouping "yearsCombined" with the years its whole-year comparisons keep (`years`,
 * ascending, from `all`, the years of the data) and those filters, "all" without any.
 * @param {any} view
 * @param {string} field
 * @param {{ cyclic: boolean, units?: string[] }} fk  ruleKind()
 * @param {number[]} [all]  the years of the data, for a cyclic grouping
 * @returns {{ id: "all" | "this" | "last" | "next" | "before" | "yearsCombined", unit?: string, count?: number, anchor?: string, calendar?: boolean, includeCurrent?: boolean, years?: number[], filters: any[] }}
 */
export function quickChoice(view, field, fk, all = []) {
    const ranges = filtersOf(view, field, ["relative"]);
    const compared = filtersOf(view, field, ["compare"]);
    if (fk.cyclic) {
        // the whole-year comparisons are Years combined; any other comparison is a rule
        const whole = compared.filter(isWholeYear);
        const years = whole.length ? yearsCombined(whole, all) : null;
        return years ? { id: "yearsCombined", years, filters: whole } : { id: "all", filters: [] };
    }
    const units = fk.units ?? [];
    const r = ranges.find((f) => units.includes(f.unit) && !f.not && f.blanks !== "only");
    if (!r) {
        return { id: "all", filters: [] };
    }
    const id = /** @type {"this" | "last" | "next" | "before"} */ (r.direction ?? "last");
    return { id, unit: r.unit, count: r.count ?? 1, anchor: r.anchor ?? "today", calendar: r.calendar !== false, includeCurrent: r.includeCurrent !== false, filters: [r] };
}

/**
 * The years a cyclic grouping's comparisons keep, when every one of them is a whole-year rule
 * (Years combined writes them: "between 2024-01-01 and 2025-12-31" keeps the years, "not between" a
 * gap); null when a comparison is something else, or none is left to keep.
 * @param {any[]} compared  the field's `compare` filters
 * @param {number[]} all  the years of the data
 */
function yearsCombined(compared, all) {
    let kept = new Set(all);
    for (const f of compared) {
        const [a, b] = /** @type {[string, string]} */ (wholeYears(f.value, f.value2)).map(Number);
        kept = new Set([...kept].filter((y) => (a <= y && y <= b) !== f.not));
    }
    return kept.size ? [...kept].sort((x, y) => x - y) : null;
}

/** A comparison of whole years of days (Jan 1 to Dec 31), as Years combined writes them (the blanks kept or not). */
export const isWholeYear = (f) => f.type === "compare" && f.op === "between" && f.blanks !== "only" && wholeYears(f.value, f.value2) !== null;

/**
 * The whole-year comparisons that keep `years` of `all` (ascending): the span they cover, less each
 * gap in it; `blanks` as the field's rules have them.
 */
export function yearRules(field, years, all, blanks = "exclude") {
    if (!years.length || years.length === all.length) {
        return [];
    }
    const day = (y, last) => `${String(y).padStart(4, "0")}-${last ? "12-31" : "01-01"}`;
    const rule = (not, from, to) => ({ field, type: "compare", op: "between", value: day(from, false), value2: day(to, true), not, blanks });
    const rules = [rule(false, years[0], years[years.length - 1])];
    for (let i = 1; i < years.length; i++) {
        // a gap: a year of the data between two years kept
        if (all.some((y) => years[i - 1] < y && y < years[i])) {
            rules.push(rule(true, years[i - 1] + 1, years[i] - 1));
        }
    }
    return rules;
}

/**
 * Years combined of a cyclic grouping: its whole-year comparisons are replaced by the ones that keep
 * `years` (yearRules), keeping the blanks as the field's rules do (keepsBlanks); all of the data's
 * years keep none. Its other filters, its other comparisons
 * (rules such as "is from Jun") among them, stay.
 * @param {any} view
 * @param {string} field
 * @param {number[]} years  ascending
 * @param {number[]} all  the years of the data
 */
export function setYearsCombined(view, field, years, all) {
    const blanks = keepsBlanks(view, field) ? "include" : "exclude";
    const cleared = filtersOf(view, field, ["compare"]).filter(isWholeYear).reduce((v, f) => setRule(v, field, f, null), view);
    return yearRules(field, years, all, blanks).reduce((v, r) => setRule(v, field, null, r), cleared);
}

/**
 * @typedef {{ direction?: string, unit: string, count?: number, anchor?: string, calendar?: boolean, includeCurrent?: boolean, blanks?: string }} QuickRange
 *   a relative range as the quick choices and the rules write it: `direction` "last" (the default),
 *   "this", "next" or "before"; `anchor` "today" (the default), "latest", "first" or a day
 *   ("2025-06-30"); `calendar` false for rolling periods; `includeCurrent` false to leave the current
 *   unit out; `blanks` "exclude" (the default) or "include"
 */

/**
 * A quick choice applied: `previous`, the field's quick range (quickChoice().filters[0], null for
 * none), is replaced by `range`, or removed for All (null); without `previous` (undefined) every
 * relative range of the field is. Its other filters, the comparisons of the item among them, stay:
 * picks, quick choice and rules apply together.
 * @param {any} view
 * @param {string} field
 * @param {QuickRange | null} range
 * @param {object | null} [previous]
 */
export function setQuickRange(view, field, range, previous) {
    const entry = range ? relativeRule(field, range) : null;
    if (previous !== undefined) {
        return replaceFilter(view, field, previous, entry);
    }
    return replaceFilters(view, field, ["relative"], entry ? [entry] : []);
}

/**
 * A relative range as the quick choices and the rules write it (QuickRange): only what differs from
 * the defaults, no count for "this", no `includeCurrent` for a rolling range (it counts from the
 * moment itself), not inverted.
 * @param {string} field
 * @param {QuickRange} range
 */
export const relativeRule = (field, { direction = "last", unit, count, anchor, calendar = true, includeCurrent = true, blanks = "exclude" }) => ({
    field,
    type: "relative",
    ...(direction === "last" ? {} : { direction }),
    unit,
    ...(direction === "this" ? {} : { count }),
    ...(calendar ? {} : { calendar: false }),
    ...(includeCurrent || !calendar || direction === "this" ? {} : { includeCurrent: false }),
    ...(anchor && anchor !== "today" ? { anchor } : {}),
    not: false,
    blanks
});

/**
 * What the field's relative ranges count from: "today" (not written), "latest" or "first", the data's
 * latest or first record, or a day ("2025-06-30"). Every range of the field takes it; the view stays
 * the same without one.
 * @param {any} view
 * @param {string} field
 * @param {string} anchor
 */
export function setAnchor(view, field, anchor) {
    const next = clone(view);
    for (const f of next.filters) {
        if (same(f.field, field) && f.type === "relative") {
            delete f.anchor;
            if (anchor !== "today") {
                f.anchor = anchor;
            }
        }
    }
    return next;
}

/** The filter types of a field's rules on its items, whose blanks "Also keep items without a value" decides. */
export const ITEM_RULE_TYPES = Object.freeze(["relative", "compare", "text"]);

/**
 * Whether a field's rules on its items (its quick choice among them) keep its blank items: each of
 * them has `blanks: "include"`, and there is one.
 * @param {any} view
 * @param {string} field
 */
export function keepsBlanks(view, field) {
    const rules = filtersOf(view, field, ITEM_RULE_TYPES);
    return rules.length > 0 && rules.every((f) => f.blanks === "include");
}

/**
 * "Also keep items without a value": every rule of a field on its items (ITEM_RULE_TYPES, its quick
 * choice among them) keeps the blank items, or none does. A rule on the total has no blanks of its
 * own; only blanks stay possible through the picks ("(blank)" alone ticked).
 * @param {any} view
 * @param {string} field
 * @param {boolean} keep
 */
export function setRuleBlanks(view, field, keep) {
    const next = clone(view);
    for (const f of next.filters) {
        if (same(f.field, field) && ITEM_RULE_TYPES.includes(f.type)) {
            f.blanks = keep ? "include" : "exclude";
        }
    }
    return next;
}

/** Takes the whole filter of a field off: its picks, its quick choice and its rules (a loaded view's blank filter too); Top N stays. */
export const resetFilter = (view, field) => replaceFilters(view, field, ["in", "blank", ...RULE_TYPES], []);

/**
 * The totals a rule on the total compares, as the table's Grand Total shows them: one per item of
 * the field, the measure over every row the view's other filters and the field's own filters on
 * items leave (`filters`: those to apply; the field's rules on totals are left out, so each rule
 * can say what it keeps). Blank keys are null, as the items' values.
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {any} view  normalized
 * @param {string} field
 * @param {{ field: string | null, agg: string }} by
 * @param {any[]} filters
 * @returns {{ totals: Map<string, number | null>, rows: number }}  totals by the item's key (JSON), and the rows left
 */
export function itemTotals(encoded, view, field, by, filters) {
    const result = computePivot(encoded, { ...view, rows: [field], cols: [], values: [{ ...(by.field ? { field: by.field } : {}), agg: by.agg }], filters, sort: [] });
    const totals = new Map();
    // a measure the data cannot give (a view's issue) leaves no value to read
    if (!result.values.length) {
        return { totals, rows: result.rows.length };
    }
    for (const node of result.rowRoot.children) {
        const v = result.value(node, result.colRoot, 0);
        totals.set(JSON.stringify(node.key), typeof v === "number" && Number.isFinite(v) ? v : null);
    }
    return { totals, rows: result.rows.length };
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
 * Removes the rules of a field (RULE_TYPES); its picks and Top N stay, and so do `keep`, the filters
 * of the quick choice (quickChoice().filters), in their place.
 */
export function removeRules(view, field, keep = []) {
    const kept = new Set(keep.map((f) => JSON.stringify(f)));
    return filtersOf(view, field, RULE_TYPES).filter((f) => !kept.has(JSON.stringify(f))).reduce((v, f) => setRule(v, field, f, null), view);
}

/** The four totals of Options, in their order. */
export const TOTALS = Object.freeze(["grandTotalRow", "grandTotalColumn", "rowSubtotals", "colSubtotals"]);

/** What each total needs on its axis, and the text that says so. */
const AXIS_NEEDS = Object.freeze({
    grandTotalRow: { zone: "rows", fields: 1, why: "needsRowField" },
    grandTotalColumn: { zone: "cols", fields: 1, why: "needsColField" },
    rowSubtotals: { zone: "rows", fields: 2, why: "needsRowFields" },
    colSubtotals: { zone: "cols", fields: 2, why: "needsColFields" }
});

/**
 * Why a total of Options would change nothing in this view, or null when it changes something: a
 * grand total row needs a field in Rows (without one the only row is the total), a grand total column
 * one in Columns, subtotals two or more fields on their axis, and every total a value (without one a
 * total has no number, and the table draws none). The key names the text (labels).
 * @param {any} view
 * @param {string} key  one of TOTALS
 * @returns {string | null}
 */
export function totalNoEffect(view, key) {
    const axis = AXIS_NEEDS[key];
    if (view[axis.zone].length < axis.fields) {
        return axis.why;
    }
    return view.values.length > 0 ? null : "needsValue";
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
 * "last 5 years (2022–2026)", "from 2022", "contains “abc”", "Sum of Revenue > 1,000", joined by
 * commas; null without a filter.
 * @param {any} view
 * @param {string} field
 * @param {{ summary: { shown: number, total: number } | null, rules?: string[] } | null | undefined} state  the chip's state (zones.jsx), with its rules in short
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 */
export function filterState(view, field, state, labels, locale) {
    const same = (f) => typeof f.field === "string" && f.field.toLowerCase() === field.toLowerCase();
    const parts = [];
    if (state && state.summary) {
        parts.push(fill(labels.filterSummary, { shown: state.summary.shown.toLocaleString(locale), total: state.summary.total.toLocaleString(locale) }));
    }
    // the chip's rules on the items (with a text rule), else the text rules said here
    parts.push(...(state?.rules ?? []));
    for (const f of view.filters.filter(same)) {
        if (f.type === "value" || (f.type === "text" && !state?.rules)) {
            parts.push(ruleText(view, f, { labels, locale, timeZone: "UTC", date: false }));
        }
    }
    return parts.length ? parts.join(", ") : null;
}

/** A bound of relativeDateRange() as wall-clock ms: a day ("2026-03-01") or a minute ("2026-03-01T14:00"). */
const boundMs = (text) => Date.parse(text.length > 10 ? `${text}Z` : `${text}T00:00Z`);

/**
 * The rows of a date column in the dates of a relative range (pivotkit-core's relativeDateRange:
 * both bounds included, a day or a minute, `from` null for "before"): what a quick choice keeps.
 * @param {{ from: string | null, to: string }} range
 * @param {ArrayLike<unknown>} dict  the column's dictionary (dates as wall-clock ms)
 * @param {ArrayLike<number>} counts  rows per dictionary code
 */
export function rowsInRange(range, dict, counts) {
    const from = range.from === null ? -Infinity : boundMs(range.from);
    // the end's whole day, or its whole minute
    const to = boundMs(range.to) + (range.to.length > 10 ? 60_000 : 86_400_000);
    let rows = 0;
    for (let code = 0; code < dict.length; code++) {
        const v = dict[code];
        if (typeof v === "number" && v >= from && v < to) {
            rows += counts[code];
        }
    }
    return rows;
}
