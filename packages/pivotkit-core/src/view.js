/*
 * The view object: the report as JSON (rows, columns, values, filters, derived fields, sort, totals,
 * collapsed groups, display and chart, formatting). It is the preset, the template and the undo state
 * at once, and it is user input: it may come from a browser, a file or a URL. normalize() therefore
 * only resolves names against the schema and fixed lists, copies known keys into a new object and
 * drops everything else; nothing in a view is ever evaluated, and a bad view never throws.
 *
 * Pipeline: JSON round trip with a size limit -> migrate() to the current version -> one normalizer
 * per section. Each section reports what it drops as an issue { path, message }.
 */

import { AGGREGATOR_NAMES, aggregatorFits, aggregatorOf } from "./aggregators.js";
import { DERIVED, MIN_BIN_SIZE } from "./derive.js";
import { FILTERS, FILTER_TYPES_V1, WEEK_START, fieldKinds, fieldTypeHint, itemFor, readItem } from "./filters.js";
import { closest } from "./hints.js";
import { isFormat } from "./format.js";
import { ISSUE_CAP, resolveLimits } from "./limits.js";
import { migrate1 } from "./migrate-1.js";
import { SHOW_AS } from "./show-as.js";
import { foldText } from "./text-match.js";
import { canonicalTimeZone } from "./time.js";
import { canonicalLocale, finite, get, isPlainObject, optionsOf, shown } from "./util.js";

export const VIEW_VERSION = 2;

/**
 * Every kind of issue normalize() (and migrate(), validate() and computePivot(), which report the
 * same) can give: one stable `code` per kind of problem, so a UI can say it in its own words. The
 * message stays English for developers. Per code:
 * - `severity`: "error", the part is left out or replaced by its default; "warning", the view is used
 *   as it is but may not do what was meant (an item that matches no item of the data only by case,
 *   a key inside a section that this version does not know). An issue carries its code's severity;
 *   `unknownKey` is an error at the top of a view and a warning inside a section.
 * - `schema`: whether the view's JSON Schema (schema/view-2.json) refuses the case of the code too;
 *   false for what only the data can tell (a field's name or type) and what JSON Schema cannot say.
 * computePivot adds "timeZoneMismatch" (the view's time zone is not the data's). `params` holds what
 * a text needs: `field` (a field name), `value` (the setting or item as given, as text, at most 100
 * characters), `agg`, `type` (a field type), `max`, `zone`, `suggestion` (the name meant, "did you
 * mean"), `allowed` (the field types a filter type works on).
 * @type {Readonly<Record<string, Readonly<{ severity: "error" | "warning", schema: boolean }>>>}
 */
export const VIEW_ISSUES = /* @__PURE__ */ issueTable({
    notView: "error schema", notJson: "error", tooLarge: "error", badVersion: "error schema", newerVersion: "error schema",
    noMigration: "error", unknownKey: "error schema",
    notList: "error schema", tooMany: "error schema", tooManyItems: "error schema", itemType: "error", itemTooLong: "error schema", itemCase: "warning",
    unknownField: "error", placedTwice: "error",
    groupingNoName: "error schema", groupingNameTaken: "error", groupingNoSource: "error", groupingUnknown: "error schema",
    binsNeedNumber: "error", groupingNeedsDate: "error", binSize: "error schema",
    notValueRef: "error schema", unknownAggregator: "error schema", aggregatorNeedsField: "error schema", aggregatorType: "error",
    unknownFormat: "error", badLabel: "error schema", unknownShowAs: "error schema", showAsNotAdditive: "error", showAsNotNumber: "error",
    unknownConditional: "error schema", conditionalNotNumber: "error", colorScaleColors: "error schema", dataBarColor: "error schema",
    unknownFilterType: "error schema", filterFieldType: "error", filterNoItems: "error schema", filterTextOp: "error schema", filterText: "error schema",
    filterMatch: "error schema", filterNot: "error schema", filterBlanks: "error schema", blanksUnspecified: "warning", filterEmpty: "warning",
    filterNotNumber: "error", filterCount: "error schema", filterTies: "error schema", filterPrecision: "error", filterValue: "error schema", filterValue2: "error schema",
    filterCompareValue: "error",
    filterRelativeDirection: "error schema", filterRelativeUnit: "error schema", filterRelativeCount: "error schema", filterRelativeAnchor: "error schema",
    sortNoItems: "error schema", sortedTwice: "error",
    badTotals: "error schema", collapsedPath: "error", unknownSetting: "error schema", badTitle: "error schema",
    unknownLocale: "error", unknownTimeZone: "error", timeZoneMismatch: "error", tooManyIssues: "warning"
});

/** Every code of VIEW_ISSUES. */
export const VIEW_ISSUE_CODES = /* @__PURE__ */ Object.freeze(Object.keys(VIEW_ISSUES));

/**
 * VIEW_ISSUES from a short form per code: its severity, and "schema" when the JSON Schema refuses it.
 * @param {Record<string, string>} short
 */
function issueTable(short) {
    /** @type {Record<string, Readonly<{ severity: "error" | "warning", schema: boolean }>>} */
    const table = {};
    for (const [code, text] of Object.entries(short)) {
        const [severity, schema] = text.split(" ");
        table[code] = Object.freeze({ severity: severity === "warning" ? "warning" : "error", schema: schema === "schema" });
    }
    return Object.freeze(table);
}

/**
 * An issue of a code of VIEW_ISSUES, with the code's severity unless `severity` says otherwise.
 * @param {string} path
 * @param {string} message
 * @param {string} code
 * @param {IssueParams} [params]
 * @param {"error" | "warning"} [severity]
 * @returns {Issue}
 */
export function issueOf(path, message, code, params, severity = VIEW_ISSUES[code].severity) {
    return params ? { path, message, code, severity, params } : { path, message, code, severity };
}

/**
 * The chart types. "auto" (the default, also when a view has no `chart.type`) leaves the choice to
 * the data: lines when a date is on Rows, else bars (autoChartType in chart.js); any other type is
 * one the user chose.
 */
export const CHART_TYPES = Object.freeze(["auto", "bar", "line", "area", "pie", "donut", "heatmap"]);
/** The chart types drawn as slices of a circle: a pie, and a donut (a ring). */
export const SLICE_CHART_TYPES = Object.freeze(["pie", "donut"]);
export const DISPLAY_MODES = Object.freeze(["table", "chart"]);
export const CONDITIONAL_TYPES = Object.freeze(["colorScale", "dataBar"]);
/**
 * What a chart writes next to its marks: "auto" as its type draws them (a pie its names, a heatmap
 * its numbers, the others nothing), "off", "value", and for a pie "percent" (its share) or "both".
 */
export const CHART_VALUE_LABELS = Object.freeze(["auto", "off", "value", "percent", "both"]);
/**
 * Where a pie or a donut writes its value labels: "outside" next to each slice with its name and a
 * line, "inside" on the slice (the value or share only; the legend names the slices).
 */
export const CHART_LABEL_POSITIONS = Object.freeze(["outside", "inside"]);
/** Where the legend goes: "auto" above the chart when it has more than one series (a pie always). */
export const CHART_LEGENDS = Object.freeze(["auto", "bottom", "right", "off"]);
/**
 * The category axis of bars, lines and areas: "auto" every label when they fit, slanted when needed,
 * else every n-th; "all" every label, slanted; "nth" every n-th label, straight.
 */
export const CHART_AXIS_LABELS = Object.freeze(["auto", "all", "nth"]);
/**
 * With two or more row fields, the outer one's items as group labels under the axis: "auto" while
 * the chart has room for them (the UI measures it; the core draws them), "on" always, "off" never.
 */
export const CHART_GROUP_LABELS = Object.freeze(["auto", "on", "off"]);

/** A colour of a conditional format: #rgb or #rrggbb. */
export const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * @typedef {{ field?: string, value?: string | number, agg?: string, type?: string, max?: number, zone?: string, suggestion?: string, allowed?: string }} IssueParams
 * @typedef {{ path: string, message: string, code?: string, severity?: "error" | "warning", params?: IssueParams }} Issue  what was
 *   dropped or changed: where (`path`), an English message for developers, and with normalize() a
 *   `code` of VIEW_ISSUE_CODES, its `severity` and the `params` its text needs
 * @typedef {{ field: string | null, agg: string }} ValueRef  a measure by field and aggregator
 * @typedef {{ type: string, axis: "rows" | "cols" }} ShowAs
 * @typedef {{ type: "colorScale", colors: string[] } | { type: "dataBar", color: string | null }} Conditional
 * @typedef {{ field: string | null, agg: string, format: string | null, label: string | null,
 *   showAs: ShowAs | null, conditional: Conditional | null }} ValueSpec
 * @typedef {{ field: string, type: string, items?: any[], op?: string, value?: any, value2?: any,
 *   count?: number, bottom?: boolean, by?: ValueRef, unit?: string, anchor?: string, not?: boolean,
 *   blanks?: "exclude" | "include" | "only", on?: "value" | "label", precision?: string, ties?: "first" | "all",
 *   direction?: string, calendar?: boolean, includeCurrent?: boolean,
 *   match?: { case: "insensitive" | "sensitive", whitespace: "collapse" | "exact" } }} FilterSpec  one
 *   condition (filters.js FILTERS): `in` items; `blank`; `text` op, value, on, match; `compare` op,
 *   value and value2 (a number or a calendar day "2022-03-01"); `relative` unit and count, `anchor`
 *   "latest" when the range ends with the data's latest date instead of today; `top` by, count,
 *   bottom; `value` by, op, value, value2. Item filters have `not` (inverts the items with a value)
 *   and `blanks` (what happens to the blank items), a value condition has `not`
 * @typedef {{ name: string, field: string, by: string, size?: number, origin?: number }} DerivedSpec
 * @typedef {{ field: string, by: "label" | "value" | "custom", order: "asc" | "desc", value?: ValueRef, items?: any[] }} SortSpec
 * @typedef {{ type: string, stacked: boolean, horizontal: boolean, valueLabels: string, legend: string,
 *   title: string | null, smooth: boolean, axisLabels: string, groupLabels: string, labelPosition: string }} ChartSpec  the chart
 *   type and how it is drawn: value labels (CHART_VALUE_LABELS) and, on a pie or donut, where they go
 *   (CHART_LABEL_POSITIONS), legend (CHART_LEGENDS), a title over the
 *   chart, smooth lines (line, area), the category axis labels (CHART_AXIS_LABELS), and with two or more
 *   row fields the first one's items as group labels under the axis (CHART_GROUP_LABELS)
 *   custom: `items` first in their order (reversed for "desc"), the rest after them by label
 *
 * @typedef {object} View
 * @property {number} version
 * @property {string[]} rows
 * @property {string[]} cols
 * @property {ValueSpec[]} values
 * @property {FilterSpec[]} filters
 * @property {DerivedSpec[]} derived
 * @property {SortSpec[]} sort
 * @property {{ grandTotalRow: boolean, grandTotalColumn: boolean, rowSubtotals: boolean, colSubtotals: boolean }} totals
 * @property {{ rows: any[][], cols: any[][] }} collapsed
 * @property {"table" | "chart"} display
 * @property {ChartSpec} chart
 * @property {{ locale: string | null, timeZone: string | null, weekStart: number }} formatting  timeZone: the zone the
 *   report was made for; the host passes it to encode(), computePivot() reports a mismatch; weekStart:
 *   the first day of a week for relative ranges in weeks, 1 (Monday, the default) to 7 (Sunday)
 */

/**
 * A view with nothing placed: the start of a new report.
 * @returns {View}
 */
export function emptyView() {
    return {
        version: VIEW_VERSION,
        rows: [],
        cols: [],
        values: [],
        filters: [],
        derived: [],
        sort: [],
        totals: { grandTotalRow: true, grandTotalColumn: true, rowSubtotals: true, colSubtotals: true },
        collapsed: { rows: [], cols: [] },
        display: "table",
        chart: { type: "auto", stacked: false, horizontal: false, valueLabels: "auto", legend: "auto", title: null, smooth: false, axisLabels: "auto", groupLabels: "auto", labelPosition: "outside" },
        formatting: { locale: null, timeZone: null, weekStart: WEEK_START }
    };
}

// ---- migration ----

/**
 * One step per version: MIGRATIONS[n] turns a version-n view into a version-(n + 1) view. When the
 * view changes incompatibly, VIEW_VERSION goes up and the step that converts old views is added here,
 * in a module of its own (migrate-1.js: version 1's filters in version 2's condition shape).
 * @type {Readonly<Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>>}
 */
export const MIGRATIONS = Object.freeze({ 1: migrate1 });

/**
 * Brings a parsed view to the current version. A view without a version is read as version 1, the
 * first (hand-written JSON of version 1 keeps working; the step to version 2 leaves version 2's shapes
 * as they are). A view of a newer version than this package knows is refused (view null), never read
 * as an older one: saving it again would silently drop what the newer version added.
 * @param {unknown} raw  a parsed view object
 * @returns {{ view: Record<string, unknown> | null, issues: Issue[] }}
 */
export function migrate(raw) {
    return runMigrations(raw, MIGRATIONS, VIEW_VERSION);
}

/**
 * The migration pipeline with its steps and target version as arguments, so it can be tested before
 * the first real step exists.
 * @param {unknown} raw
 * @param {Readonly<Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>>} steps
 * @param {number} target
 */
export function runMigrations(raw, steps, target) {
    const issues = [];
    if (!isPlainObject(raw)) {
        return { view: null, issues: [issueOf("", "not a view object", "notView")] };
    }
    const version = get(raw, "version") ?? 1;
    if (!Number.isInteger(version) || version < 1) {
        return { view: null, issues: [issueOf("version", `unknown version ${JSON.stringify(version)}`, "badVersion", { value: shown(version) })] };
    }
    if (version > target) {
        return {
            view: null,
            issues: [issueOf("version", `version ${version} is newer than this pivotkit-core reads (${target}); update pivotkit-core`, "newerVersion", { value: version, max: target })]
        };
    }
    let view = /** @type {Record<string, unknown>} */ (raw);
    for (let v = version; v < target; v++) {
        const step = steps[v];
        if (typeof step !== "function") {
            return { view: null, issues: [issueOf("version", `no migration from version ${v}`, "noMigration", { value: v })] };
        }
        view = step(view);
    }
    return { view: { ...view, version: target }, issues };
}

// ---- helpers shared by the sections ----

function oneOf(value, allowed, fallback) {
    return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function bool(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}

/** Accepts an encoded data set, a schema { fields } or an array of fields. */
function schemaFields(schema) {
    const fields = Array.isArray(schema) ? schema : schema && Array.isArray(schema.fields) ? schema.fields : schema && schema.schema ? schema.schema.fields : [];
    return fields
        .filter((f) => f && typeof f.name === "string")
        .map((f) => ({ name: f.name, type: typeof f.type === "string" ? f.type : "string" }));
}

/**
 * Walks a list section: reports a non-list, cuts it at `max` and reports that, calls `each` per
 * entry with its path.
 */
function listOf(raw, key, max, ctx, each) {
    const list = key.split(".").reduce((obj, k) => get(obj, k), raw);
    if (list === undefined) {
        return;
    }
    if (!Array.isArray(list)) {
        ctx.issue(key, "not a list", "notList");
        return;
    }
    list.slice(0, max).forEach((entry, i) => each(entry, `${key}[${i}]`, i));
    if (list.length > max) {
        ctx.issue(key, `more than ${max} entries`, "tooMany", { max });
    }
}

// ---- sections ----

/**
 * The keys each part of a view knows; normalize() reports any other key inside a part as a warning
 * (`unknownKey`), the keys of a filter come from its type's entry in FILTERS.
 */
export const VIEW_KEYS = Object.freeze({
    view: Object.freeze(Object.keys(emptyView())),
    derived: Object.freeze(["name", "field", "by", "size", "origin"]),
    value: Object.freeze(["field", "agg", "format", "label", "showAs", "conditional"]),
    valueRef: Object.freeze(["field", "agg"]),
    showAs: Object.freeze(["type", "axis"]),
    conditional: Object.freeze({ colorScale: Object.freeze(["type", "colors"]), dataBar: Object.freeze(["type", "color"]) }),
    sort: Object.freeze(["field", "by", "order", "items", "value"]),
    totals: Object.freeze(Object.keys(emptyView().totals)),
    collapsed: Object.freeze(["rows", "cols"]),
    chart: Object.freeze(Object.keys(emptyView().chart)),
    formatting: Object.freeze(Object.keys(emptyView().formatting))
});

/** Derived fields go first: the other sections may name them. */
function derivedSection(raw, view, ctx) {
    listOf(raw, "derived", ctx.limits.derived, ctx, (d, path) => {
        ctx.keys(d, VIEW_KEYS.derived, path);
        const name = ctx.text(get(d, "name"));
        const source = ctx.fields.get(String(get(d, "field") ?? "").toLowerCase());
        const by = get(d, "by");
        const unit = typeof by === "string" && Object.hasOwn(DERIVED, by) ? DERIVED[by] : null;
        if (!name) {
            return ctx.issue(path, "needs a name", "groupingNoName");
        }
        if (ctx.fields.has(name.toLowerCase())) {
            return ctx.issue(path, `name "${name}" is already a field`, "groupingNameTaken", { field: name });
        }
        if (!source || source.derived) {
            return ctx.issue(path, "unknown source field", "groupingNoSource", { field: shown(get(d, "field")) });
        }
        if (!unit) {
            return ctx.issue(path, "unknown grouping", "groupingUnknown", { value: shown(by) });
        }
        if (source.type !== unit.source) {
            return unit.source === "number" ? ctx.issue(path, "bins need a number field", "binsNeedNumber", { field: source.name }) : ctx.issue(path, "date grouping needs a date field", "groupingNeedsDate", { field: source.name });
        }
        const spec = { name, field: source.name, by };
        if (by === "bin") {
            const size = finite(get(d, "size"));
            if (size === null || size < MIN_BIN_SIZE) {
                return ctx.issue(path, `bins need a size of at least ${MIN_BIN_SIZE}`, "binSize");
            }
            spec.size = size;
            spec.origin = finite(get(d, "origin")) ?? 0;
        }
        view.derived.push(spec);
        ctx.fields.set(name.toLowerCase(), { name, type: unit.type, derived: true });
    });
}

/** Rows and columns: each field once, in one axis only. */
function axesSection(raw, view, ctx) {
    const placed = new Set();
    for (const axis of ["rows", "cols"]) {
        listOf(raw, axis, ctx.limits.axisFields, ctx, (name, path) => {
            const f = ctx.resolve(name);
            if (!f) {
                return ctx.unknownField(path, name);
            }
            if (placed.has(f.name)) {
                return ctx.issue(path, `"${f.name}" is already placed`, "placedTwice", { field: f.name });
            }
            placed.add(f.name);
            view[axis].push(f.name);
        });
    }
}

function conditionalOf(cond, path, ctx) {
    const type = get(cond, "type");
    if (type === "colorScale" || type === "dataBar") {
        ctx.keys(cond, VIEW_KEYS.conditional[type], path);
    }
    if (type === "colorScale") {
        const colors = get(cond, "colors");
        const list = Array.isArray(colors) ? colors.filter((c) => typeof c === "string" && COLOR.test(c)).slice(0, 3) : [];
        // an empty list is the theme's scale, as no list is: normalize writes it so, and a normalized
        // view must pass normalize again unchanged
        if (Array.isArray(colors) && colors.length > 0 && (list.length !== colors.length || list.length < 2)) {
            ctx.issue(`${path}.colors`, "two or three colours as #rgb or #rrggbb", "colorScaleColors");
        }
        return { type, colors: list.length >= 2 ? list : [] };
    }
    if (type === "dataBar") {
        const color = get(cond, "color");
        const ok = typeof color === "string" && COLOR.test(color);
        if (color !== undefined && color !== null && !ok) {
            ctx.issue(`${path}.color`, "a colour as #rgb or #rrggbb", "dataBarColor");
        }
        return { type, color: ok ? color : null };
    }
    ctx.issue(path, `unknown conditional format ${JSON.stringify(type)}`, "unknownConditional", { value: shown(type) });
    return null;
}

function showAsOf(showAs, ref, path, ctx) {
    const s = typeof showAs === "string" ? { type: showAs } : showAs;
    ctx.keys(s, VIEW_KEYS.showAs, path);
    const type = get(s, "type");
    const def = typeof type === "string" && Object.hasOwn(SHOW_AS, type) ? SHOW_AS[type] : null;
    if (!def) {
        ctx.issue(path, `unknown show-as ${JSON.stringify(type)}`, "unknownShowAs", { value: shown(type) });
        return null;
    }
    if (def.additive && !aggregatorOf(ref.agg).additive) {
        // a running total of averages or medians adds up numbers that do not add up
        ctx.issue(path, `${type} needs an aggregator that adds up (sum or count), not ${ref.agg}`, "showAsNotAdditive", { value: type, agg: ref.agg });
        return null;
    }
    return { type, axis: oneOf(get(s, "axis"), ["rows", "cols"], "rows") };
}

function valuesSection(raw, view, ctx) {
    listOf(raw, "values", ctx.limits.values, ctx, (v, path) => {
        const ref = ctx.valueRef(v, path, VIEW_KEYS.value);
        if (!ref) {
            return;
        }
        const numericResult = ctx.resultType(ref) === "number";
        const spec = { ...ref, format: null, label: null, showAs: null, conditional: null };
        const format = get(v, "format");
        if (format !== undefined && format !== null) {
            if (isFormat(format)) {
                spec.format = format.trim().toLowerCase();
            } else {
                ctx.issue(`${path}.format`, `unknown format ${JSON.stringify(format)}`, "unknownFormat", { value: shown(format) });
            }
        }
        const label = get(v, "label");
        if (label !== undefined && label !== null) {
            spec.label = ctx.text(label);
            if (spec.label === null) {
                ctx.issue(`${path}.label`, `not a text up to ${ctx.limits.name} characters`, "badLabel", { max: ctx.limits.name });
            }
        }
        const showAs = get(v, "showAs");
        if (showAs !== undefined && showAs !== null) {
            if (numericResult) {
                spec.showAs = showAsOf(showAs, ref, `${path}.showAs`, ctx);
            } else {
                ctx.issue(`${path}.showAs`, `${ref.agg} has no number to show as ${JSON.stringify(get(showAs, "type") ?? showAs)}`, "showAsNotNumber", { agg: ref.agg });
            }
        }
        const cond = get(v, "conditional");
        if (cond !== undefined && cond !== null) {
            if (numericResult) {
                spec.conditional = conditionalOf(cond, `${path}.conditional`, ctx);
            } else {
                ctx.issue(`${path}.conditional`, "conditional formatting needs a number value", "conditionalNotNumber", { agg: ref.agg });
            }
        }
        view.values.push(spec);
    });
}

/** Filters: the type's own normalizer from the FILTERS table does the rest. */
function filtersSection(raw, view, ctx) {
    listOf(raw, "filters", ctx.limits.filters, ctx, (flt, path) => {
        const f = ctx.resolve(get(flt, "field"));
        const type = get(flt, "type");
        const def = typeof type === "string" && Object.hasOwn(FILTERS, type) ? FILTERS[type] : null;
        if (!f) {
            return ctx.unknownField(path, get(flt, "field"));
        }
        if (!def) {
            const renamed = typeof type === "string" && Object.hasOwn(FILTER_TYPES_V1, type) ? { suggestion: FILTER_TYPES_V1[type] } : suggest(type, Object.keys(FILTERS));
            return ctx.issue(path, `unknown filter type ${JSON.stringify(type)}`, "unknownFilterType", { value: shown(type), ...renamed });
        }
        ctx.keys(flt, def.keys, path);
        if (!fieldKinds(f, view).some((kind) => def.fields.includes(kind))) {
            return ctx.issue(path, `a ${type} filter does not work on the ${f.type} field "${f.name}"`, "filterFieldType", { field: f.name, type: f.type, value: type, allowed: def.fields.join(", "), suggestion: fieldTypeHint(f.type) });
        }
        const spec = def.normalize(flt, { field: f.name, type }, f, path, ctx, view);
        if (spec) {
            view.filters.push(spec);
        }
    });
}

/** What a sort goes by: the items' labels, a value, an order of its own. */
export const SORT_BY = Object.freeze(["label", "value", "custom"]);

/** The items of a custom sort order: converted to the field's type, each once, at most `limits.items`. */
function customItems(items, f, path, ctx) {
    if (!Array.isArray(items)) {
        ctx.issue(path, "a custom order needs a list of items", "sortNoItems");
        return null;
    }
    if (items.length > ctx.limits.items) {
        ctx.issue(path, `more than ${ctx.limits.items} items`, "tooManyItems", { max: ctx.limits.items });
    }
    const seen = new Set();
    const out = [];
    for (const item of items.slice(0, ctx.limits.items)) {
        const converted = readItem(f, item, path, ctx);
        if (converted !== undefined && !seen.has(converted)) {
            seen.add(converted);
            out.push(converted);
        }
    }
    return out;
}

/** Sort, one entry per field. */
function sortSection(raw, view, ctx) {
    const seen = new Set();
    listOf(raw, "sort", ctx.limits.sort, ctx, (s, path) => {
        ctx.keys(s, VIEW_KEYS.sort, path);
        const f = ctx.resolve(get(s, "field"));
        if (!f || seen.has(f.name)) {
            return f ? ctx.issue(path, `"${f.name}" is sorted twice`, "sortedTwice", { field: f.name }) : ctx.unknownField(path, get(s, "field"));
        }
        const by = oneOf(get(s, "by"), SORT_BY, "label");
        const spec = { field: f.name, by, order: oneOf(get(s, "order"), ["asc", "desc"], "asc") };
        if (by === "custom") {
            const items = customItems(get(s, "items"), f, `${path}.items`, ctx);
            if (!items) {
                return;
            }
            spec.items = items;
        }
        if (by === "value") {
            const ref = get(s, "value") === undefined ? ctx.defaultRef(view) : ctx.valueRef(get(s, "value"), `${path}.value`);
            if (!ref) {
                return;
            }
            spec.value = ref;
        }
        seen.add(f.name);
        view.sort.push(spec);
    });
}

function totalsSection(raw, view, ctx) {
    const totals = get(raw, "totals");
    if (totals === undefined) {
        return;
    }
    if (!isPlainObject(totals)) {
        return ctx.issue("totals", "not an object", "badTotals");
    }
    ctx.keys(totals, VIEW_KEYS.totals, "totals");
    for (const key of Object.keys(view.totals)) {
        view.totals[key] = bool(get(totals, key), view.totals[key]);
    }
}

/** Collapsed groups: key paths of fields on the axis. */
function collapsedSection(raw, view, ctx) {
    ctx.keys(get(raw, "collapsed"), VIEW_KEYS.collapsed, "collapsed");
    for (const axis of ["rows", "cols"]) {
        const types = view[axis].map((name) => ctx.fields.get(name.toLowerCase()).type);
        const seen = new Set();
        listOf(raw, `collapsed.${axis}`, ctx.limits.collapsed, ctx, (p) => {
            // the deepest level has nothing to collapse
            if (!Array.isArray(p) || p.length === 0 || p.length >= types.length) {
                return ctx.issue(`collapsed.${axis}`, `path ${JSON.stringify(p)} does not fit the ${axis}`, "collapsedPath");
            }
            const converted = p.map((v, level) => itemFor(types[level], v));
            if (converted.includes(undefined)) {
                return ctx.issue(`collapsed.${axis}`, `path ${JSON.stringify(p)} does not fit the field types`, "collapsedPath");
            }
            const key = JSON.stringify(converted);
            if (!seen.has(key)) {
                seen.add(key);
                view.collapsed[axis].push(converted);
            }
        });
    }
}

function displaySection(raw, view, ctx) {
    const display = get(raw, "display");
    view.display = oneOf(display, DISPLAY_MODES, view.display);
    if (display !== undefined && view.display !== display) {
        ctx.issue("display", `unknown display ${JSON.stringify(display)}`, "unknownSetting", { value: shown(display) });
    }
    const chart = get(raw, "chart");
    ctx.keys(chart, VIEW_KEYS.chart, "chart");
    if (chart !== undefined) {
        const own = (key, allowed, fallback) => {
            const value = get(chart, key);
            const out = oneOf(value, allowed, fallback);
            if (value !== undefined && out !== value) {
                ctx.issue(`chart.${key}`, `unknown ${key} ${JSON.stringify(value)}`, "unknownSetting", { value: shown(value) });
            }
            return out;
        };
        const title = get(chart, "title");
        view.chart = {
            type: own("type", CHART_TYPES, view.chart.type),
            stacked: bool(get(chart, "stacked"), false),
            horizontal: bool(get(chart, "horizontal"), false),
            valueLabels: own("valueLabels", CHART_VALUE_LABELS, "auto"),
            legend: own("legend", CHART_LEGENDS, "auto"),
            title: title === undefined || title === null ? null : ctx.text(title),
            smooth: bool(get(chart, "smooth"), false),
            axisLabels: own("axisLabels", CHART_AXIS_LABELS, "auto"),
            groupLabels: own("groupLabels", CHART_GROUP_LABELS, "auto"),
            labelPosition: own("labelPosition", CHART_LABEL_POSITIONS, "outside")
        };
        if (title !== undefined && title !== null && view.chart.title === null && !(typeof title === "string" && title.trim() === "")) {
            ctx.issue("chart.title", `not a text up to ${ctx.limits.name} characters`, "badTitle", { max: ctx.limits.name });
        }
    }
}

function formattingSection(raw, view, ctx) {
    const formatting = get(raw, "formatting");
    ctx.keys(formatting, VIEW_KEYS.formatting, "formatting");
    const locale = get(formatting, "locale");
    if (locale !== undefined && locale !== null) {
        view.formatting.locale = canonicalLocale(locale);
        if (view.formatting.locale === null) {
            ctx.issue("formatting.locale", `unknown locale ${JSON.stringify(locale)}`, "unknownLocale", { value: shown(locale) });
        }
    }
    const weekStart = get(formatting, "weekStart");
    if (weekStart !== undefined && weekStart !== null) {
        if (Number.isInteger(weekStart) && weekStart >= 1 && weekStart <= 7) {
            view.formatting.weekStart = weekStart;
        } else {
            ctx.issue("formatting.weekStart", "the first day of a week is 1 (Monday) to 7 (Sunday)", "unknownSetting", { value: shown(weekStart) });
        }
    }
    const timeZone = get(formatting, "timeZone");
    if (timeZone !== undefined && timeZone !== null) {
        view.formatting.timeZone = canonicalTimeZone(timeZone);
        if (view.formatting.timeZone === null) {
            ctx.issue("formatting.timeZone", `unknown time zone ${JSON.stringify(timeZone)}`, "unknownTimeZone", { value: shown(timeZone) });
        }
    }
}

/** In order: derived fields first, values before filters and sort (their default measure). */
const SECTIONS = [derivedSection, axesSection, valuesSection, filtersSection, sortSection, totalsSection, collapsedSection, displaySection, formattingSection];

/** `{ suggestion }` with the name of `candidates` closest to `name`, else nothing ("did you mean"). */
function suggest(name, candidates) {
    const suggestion = closest(name, candidates);
    return suggestion === null ? {} : { suggestion };
}

/** The most distinct items of a text field the item hints (itemCase) look through. */
const HINT_ITEMS = 100_000;

/**
 * What the sections share: the limits, the fields by lower-case name, and the ways to report.
 * @param {unknown} schema
 * @param {import("./limits.js").Limits} limits
 * @param {(issue: Issue) => void} add  issueList().add
 * @param {boolean} strict  validate(): also the warnings that only a strict check gives
 */
function context(schema, limits, add, strict) {
    const fields = new Map(schemaFields(schema).map((f) => [f.name.toLowerCase(), f]));
    // the text items of a field, as they are and by their folded text, built on first use: only
    // encoded data has items
    const textItems = new Map();
    const itemsOf = (name) => {
        if (!textItems.has(name)) {
            const data = /** @type {any} */ (schema);
            const column = data && !Array.isArray(data) && typeof data.column === "function" ? data.column(name) : undefined;
            textItems.set(name, column && column.type === "string" && column.dict.length <= HINT_ITEMS ? { exact: new Set(column.dict), byFold: new Map(column.dict.map((v) => [foldText(v), v])) } : null);
        }
        return textItems.get(name);
    };
    const ctx = {
        limits,
        fields,
        strict,
        issue: (path, message, code, params) => {
            add(issueOf(path, message, code, params));
        },
        warn: (path, message, code, params) => {
            add(issueOf(path, message, code, params, "warning"));
        },
        /** An unknown field, with the closest field's name when one is close. */
        suggest,
        unknownField: (path, name) => ctx.issue(path, `unknown field ${JSON.stringify(name)}`, "unknownField", { field: shown(name), ...suggest(name, [...fields.values()].map((f) => f.name)) }),
        /** Warns about each key of `obj` (a part of the view) that is not of `allowed`. */
        keys: (obj, allowed, path) => {
            if (!isPlainObject(obj)) {
                return;
            }
            for (const key of Object.keys(obj)) {
                if (!allowed.includes(key)) {
                    ctx.warn(`${path}.${key.slice(0, 100)}`, "unknown key", "unknownKey", { value: shown(key), ...suggest(key, allowed) });
                }
            }
        },
        /**
         * Warns when a text item of a field is no item of the data but folds to one (another case, a
         * no-break space): the data's item is the suggestion.
         */
        itemHint: (field, item, path) => {
            if (typeof item !== "string") {
                return;
            }
            const items = itemsOf(field.name);
            const match = items && !items.exact.has(item) ? items.byFold.get(foldText(item)) : undefined;
            if (match !== undefined) {
                ctx.warn(path, `item ${JSON.stringify(item)} is no item of "${field.name}"; did you mean ${JSON.stringify(match)}?`, "itemCase", { field: field.name, value: shown(item), suggestion: match });
            }
        },
        text: (value) => {
            if (typeof value !== "string") {
                return null;
            }
            const t = value.trim();
            return t === "" || t.length > limits.name ? null : t;
        },
        resolve: (name) => (typeof name === "string" && name.length <= limits.name ? fields.get(name.trim().toLowerCase()) : undefined),
        resultType: (ref) => aggregatorOf(ref.agg).resultType(ref.field ? fields.get(ref.field.toLowerCase()).type : "number"),
        defaultRef: (view) => (view.values.length ? { field: view.values[0].field, agg: view.values[0].agg } : { field: null, agg: "count" }),
        valueRef: (ref, path, keys = VIEW_KEYS.valueRef) => {
            if (!isPlainObject(ref)) {
                ctx.issue(path, "not a value reference", "notValueRef");
                return null;
            }
            ctx.keys(ref, keys, path);
            const agg = get(ref, "agg");
            const fieldName = get(ref, "field");
            const f = fieldName === null || fieldName === undefined ? null : ctx.resolve(fieldName);
            if (!aggregatorOf(agg)) {
                ctx.issue(path, `unknown aggregator ${JSON.stringify(agg)}`, "unknownAggregator", { value: shown(agg), ...suggest(agg, AGGREGATOR_NAMES) });
                return null;
            }
            if (f === undefined) {
                ctx.unknownField(path, fieldName);
                return null;
            }
            if (f === null && agg !== "count") {
                ctx.issue(path, `${agg} needs a field`, "aggregatorNeedsField", { agg });
                return null;
            }
            if (f && !aggregatorFits(agg, f.type)) {
                ctx.issue(path, `${agg} does not work on the ${f.type} field "${f.name}"`, "aggregatorType", { agg, type: f.type, field: f.name });
                return null;
            }
            return { field: f ? f.name : null, agg };
        }
    };
    return ctx;
}

/**
 * Normalizes a view against a schema: names are resolved case-insensitively to the data's spelling,
 * unknown fields, aggregators, formats and keys are dropped, missing parts get their defaults. Never
 * throws on a bad view; anything that is not a view becomes the empty view. Every change is an issue.
 *
 * @param {unknown} input  a view object or its JSON text
 * @param {unknown} schema  encoded data, { fields: [{ name, type }] } or the fields array
 * @param {{ limits?: Partial<import("./limits.js").Limits> }} [options]
 * @returns {{ view: View, issues: Issue[] }}
 */
export function normalize(input, schema, options) {
    options = optionsOf(options, "normalize");
    return check(input, schema, options, false);
}

/** normalize() and validate(): `strict` adds the warnings only a strict check gives. */
function check(input, schema, options, strict) {
    const limits = resolveLimits(options);
    const view = emptyView();
    const refuse = (path, message, code, params) => ({ view, issues: [issueOf(path, message, code, params)] });

    // A JSON round trip with a size limit: no functions, getters, cycles or prototypes survive.
    let parsed;
    try {
        const json = typeof input === "string" ? input : JSON.stringify(input);
        if (typeof json !== "string") {
            return refuse("", "not a view object", "notView");
        }
        if (json.length > limits.json) {
            return refuse("", `larger than ${limits.json} characters`, "tooLarge", { max: limits.json });
        }
        parsed = JSON.parse(json);
    } catch {
        return refuse("", "not valid JSON", "notJson");
    }
    const issues = issueList();
    const migrated = migrate(parsed);
    migrated.issues.forEach(issues.add);
    if (migrated.view === null) {
        return { view, issues: issues.done() };
    }
    const raw = migrated.view;
    for (const key of Object.keys(raw)) {
        if (!Object.hasOwn(view, key)) {
            issues.add(issueOf(key.slice(0, 100), "unknown key", "unknownKey", { value: shown(key), ...suggest(key, VIEW_KEYS.view) }));
        }
    }
    const ctx = context(schema, limits, issues.add, strict);
    for (const section of SECTIONS) {
        section(raw, view, ctx);
    }
    return { view, issues: issues.done() };
}

/**
 * The issues of one check, capped by ISSUE_CAP (limits.js): `add` keeps an issue while its code and
 * the list have room and counts it otherwise; `done` gives the list, with "tooManyIssues" last when
 * any was left out.
 */
function issueList() {
    /** @type {Issue[]} */
    const issues = [];
    const perCode = new Map();
    let left = 0;
    return {
        /** @param {Issue} issue */
        add: (issue) => {
            const n = perCode.get(issue.code) ?? 0;
            if (n >= ISSUE_CAP.perCode || issues.length >= ISSUE_CAP.total) {
                left++;
                return;
            }
            perCode.set(issue.code, n + 1);
            issues.push(issue);
        },
        done: () => (left === 0 ? issues : [...issues, issueOf("", `${left} more issues left out`, "tooManyIssues", { value: String(left), max: ISSUE_CAP.perCode })])
    };
}

/**
 * Checks a view strictly: what normalize() would drop or change is an error, what it uses but may not
 * be what was meant is a warning (with the warnings only a strict check gives). Valid without errors.
 * @param {unknown} input
 * @param {unknown} schema
 * @param {{ limits?: Partial<import("./limits.js").Limits> }} [options]
 * @returns {{ valid: boolean, errors: Issue[], warnings: Issue[] }}
 */
export function validate(input, schema, options) {
    options = optionsOf(options, "validate");
    const { issues } = check(input, schema, options, true);
    const errors = issues.filter((i) => i.severity !== "warning");
    return { valid: errors.length === 0, errors, warnings: issues.filter((i) => i.severity === "warning") };
}

/**
 * The fields of a view including its derived fields: [{ name, type, derived? }].
 * @param {View} view  a normalized view
 * @param {unknown} schema
 */
export function viewFields(view, schema) {
    return schemaFields(schema).concat(
        (view.derived || []).map((d) => ({ name: d.name, type: DERIVED[d.by].type, derived: true }))
    );
}
