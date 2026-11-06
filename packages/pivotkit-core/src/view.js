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

import { aggregatorFits, aggregatorOf } from "./aggregators.js";
import { DERIVED, MIN_BIN_SIZE } from "./derive.js";
import { FILTERS, itemFor } from "./filters.js";
import { isFormat } from "./format.js";
import { resolveLimits } from "./limits.js";
import { SHOW_AS } from "./show-as.js";
import { canonicalTimeZone } from "./time.js";
import { canonicalLocale, finite, get, isPlainObject } from "./util.js";

export const VIEW_VERSION = 1;

export const CHART_TYPES = Object.freeze(["bar", "line", "area", "pie", "heatmap"]);
export const DISPLAY_MODES = Object.freeze(["table", "chart"]);
export const CONDITIONAL_TYPES = Object.freeze(["colorScale", "dataBar"]);

const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * @typedef {{ path: string, message: string }} Issue
 * @typedef {{ field: string | null, agg: string }} ValueRef  a measure by field and aggregator
 * @typedef {{ type: string, axis: "rows" | "cols" }} ShowAs
 * @typedef {{ type: "colorScale", colors: string[] } | { type: "dataBar", color: string | null }} Conditional
 * @typedef {{ field: string | null, agg: string, format: string | null, label: string | null,
 *   showAs: ShowAs | null, conditional: Conditional | null }} ValueSpec
 * @typedef {{ field: string, type: string, items?: any[], op?: string, value?: any, value2?: number,
 *   count?: number, bottom?: boolean, by?: ValueRef }} FilterSpec
 * @typedef {{ name: string, field: string, by: string, size?: number, origin?: number }} DerivedSpec
 * @typedef {{ field: string, by: "label" | "value", order: "asc" | "desc", value?: ValueRef }} SortSpec
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
 * @property {{ type: string, stacked: boolean, horizontal: boolean }} chart
 * @property {{ locale: string | null, timeZone: string | null }} formatting  timeZone: the zone the
 *   report was made for; the host passes it to encode(), computePivot() reports a mismatch
 */

/** A view with nothing placed: the start of a new report. */
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
        chart: { type: "bar", stacked: false, horizontal: false },
        formatting: { locale: null, timeZone: null }
    };
}

// ---- migration ----

/**
 * One step per version: MIGRATIONS[n] turns a version-n view into a version-(n + 1) view. Version 1
 * is the first, so there is no step yet; when the view changes incompatibly, VIEW_VERSION goes up and
 * the step that converts old views is added here.
 * @type {Readonly<Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>>}
 */
export const MIGRATIONS = Object.freeze({});

/**
 * Brings a parsed view to the current version. A view without a version is taken as the current
 * one. A view of a newer version than this package knows is refused (view null), never read as an
 * older one: saving it again would silently drop what the newer version added.
 * @param {Record<string, unknown>} raw  a parsed view object
 * @param {Readonly<Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>>} [steps]
 * @returns {{ view: Record<string, unknown> | null, issues: Issue[] }}
 */
export function migrate(raw, steps = MIGRATIONS) {
    const issues = [];
    if (!isPlainObject(raw)) {
        return { view: null, issues: [{ path: "", message: "not a view object" }] };
    }
    const version = get(raw, "version") ?? VIEW_VERSION;
    if (!Number.isInteger(version) || version < 1) {
        return { view: null, issues: [{ path: "version", message: `unknown version ${JSON.stringify(version)}` }] };
    }
    if (version > VIEW_VERSION) {
        return {
            view: null,
            issues: [{ path: "version", message: `version ${version} is newer than this pivotkit-core reads (${VIEW_VERSION}); update pivotkit-core` }]
        };
    }
    let view = raw;
    for (let v = version; v < VIEW_VERSION; v++) {
        const step = steps[v];
        if (typeof step !== "function") {
            return { view: null, issues: [{ path: "version", message: `no migration from version ${v}` }] };
        }
        view = step(view);
        issues.push({ path: "version", message: `migrated from version ${v} to ${v + 1}` });
    }
    return { view: { ...view, version: VIEW_VERSION }, issues };
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
        ctx.issue(key, "not a list");
        return;
    }
    list.slice(0, max).forEach((entry, i) => each(entry, `${key}[${i}]`, i));
    if (list.length > max) {
        ctx.issue(key, `more than ${max} entries`);
    }
}

// ---- sections ----

/** Derived fields go first: the other sections may name them. */
function derivedSection(raw, view, ctx) {
    listOf(raw, "derived", ctx.limits.derived, ctx, (d, path) => {
        const name = ctx.text(get(d, "name"));
        const source = ctx.fields.get(String(get(d, "field") ?? "").toLowerCase());
        const by = get(d, "by");
        const unit = typeof by === "string" && Object.hasOwn(DERIVED, by) ? DERIVED[by] : null;
        if (!name) {
            return ctx.issue(path, "needs a name");
        }
        if (ctx.fields.has(name.toLowerCase())) {
            return ctx.issue(path, `name "${name}" is already a field`);
        }
        if (!source || source.derived) {
            return ctx.issue(path, "unknown source field");
        }
        if (!unit) {
            return ctx.issue(path, "unknown grouping");
        }
        if (source.type !== unit.source) {
            return ctx.issue(path, unit.source === "number" ? "bins need a number field" : "date grouping needs a date field");
        }
        const spec = { name, field: source.name, by };
        if (by === "bin") {
            const size = finite(get(d, "size"));
            if (size === null || size < MIN_BIN_SIZE) {
                return ctx.issue(path, `bins need a size of at least ${MIN_BIN_SIZE}`);
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
                return ctx.issue(path, `unknown field ${JSON.stringify(name)}`);
            }
            if (placed.has(f.name)) {
                return ctx.issue(path, `"${f.name}" is already placed`);
            }
            placed.add(f.name);
            view[axis].push(f.name);
        });
    }
}

function conditionalOf(cond, path, ctx) {
    const type = get(cond, "type");
    if (type === "colorScale") {
        const colors = get(cond, "colors");
        const list = Array.isArray(colors) ? colors.filter((c) => typeof c === "string" && COLOR.test(c)).slice(0, 3) : [];
        if (Array.isArray(colors) && (list.length !== colors.length || list.length < 2)) {
            ctx.issue(`${path}.colors`, "two or three colours as #rgb or #rrggbb");
        }
        return { type, colors: list.length >= 2 ? list : [] };
    }
    if (type === "dataBar") {
        const color = get(cond, "color");
        const ok = typeof color === "string" && COLOR.test(color);
        if (color !== undefined && color !== null && !ok) {
            ctx.issue(`${path}.color`, "a colour as #rgb or #rrggbb");
        }
        return { type, color: ok ? color : null };
    }
    ctx.issue(path, `unknown conditional format ${JSON.stringify(type)}`);
    return null;
}

function showAsOf(showAs, ref, path, ctx) {
    const s = typeof showAs === "string" ? { type: showAs } : showAs;
    const type = get(s, "type");
    const def = typeof type === "string" && Object.hasOwn(SHOW_AS, type) ? SHOW_AS[type] : null;
    if (!def) {
        ctx.issue(path, `unknown show-as ${JSON.stringify(type)}`);
        return null;
    }
    if (def.additive && !aggregatorOf(ref.agg).additive) {
        // a running total of averages or medians adds up numbers that do not add up
        ctx.issue(path, `${type} needs an aggregator that adds up (sum or count), not ${ref.agg}`);
        return null;
    }
    return { type, axis: oneOf(get(s, "axis"), ["rows", "cols"], "rows") };
}

function valuesSection(raw, view, ctx) {
    listOf(raw, "values", ctx.limits.values, ctx, (v, path) => {
        const ref = ctx.valueRef(v, path);
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
                ctx.issue(`${path}.format`, `unknown format ${JSON.stringify(format)}`);
            }
        }
        const label = get(v, "label");
        if (label !== undefined && label !== null) {
            spec.label = ctx.text(label);
            if (spec.label === null) {
                ctx.issue(`${path}.label`, `not a text up to ${ctx.limits.name} characters`);
            }
        }
        const showAs = get(v, "showAs");
        if (showAs !== undefined && showAs !== null) {
            if (numericResult) {
                spec.showAs = showAsOf(showAs, ref, `${path}.showAs`, ctx);
            } else {
                ctx.issue(`${path}.showAs`, `${ref.agg} has no number to show as ${JSON.stringify(get(showAs, "type") ?? showAs)}`);
            }
        }
        const cond = get(v, "conditional");
        if (cond !== undefined && cond !== null) {
            if (numericResult) {
                spec.conditional = conditionalOf(cond, `${path}.conditional`, ctx);
            } else {
                ctx.issue(`${path}.conditional`, "conditional formatting needs a number value");
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
            return ctx.issue(path, `unknown field ${JSON.stringify(get(flt, "field"))}`);
        }
        if (!def) {
            return ctx.issue(path, `unknown filter type ${JSON.stringify(type)}`);
        }
        const spec = def.normalize(flt, { field: f.name, type }, f, path, ctx, view);
        if (spec) {
            view.filters.push(spec);
        }
    });
}

/** Sort, one entry per field. */
function sortSection(raw, view, ctx) {
    const seen = new Set();
    listOf(raw, "sort", ctx.limits.sort, ctx, (s, path) => {
        const f = ctx.resolve(get(s, "field"));
        if (!f || seen.has(f.name)) {
            return ctx.issue(path, f ? `"${f.name}" is sorted twice` : `unknown field ${JSON.stringify(get(s, "field"))}`);
        }
        const by = oneOf(get(s, "by"), ["label", "value"], "label");
        const spec = { field: f.name, by, order: oneOf(get(s, "order"), ["asc", "desc"], "asc") };
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
        return ctx.issue("totals", "not an object");
    }
    for (const key of Object.keys(view.totals)) {
        view.totals[key] = bool(get(totals, key), view.totals[key]);
    }
}

/** Collapsed groups: key paths of fields on the axis. */
function collapsedSection(raw, view, ctx) {
    for (const axis of ["rows", "cols"]) {
        const types = view[axis].map((name) => ctx.fields.get(name.toLowerCase()).type);
        const seen = new Set();
        listOf(raw, `collapsed.${axis}`, ctx.limits.collapsed, ctx, (p) => {
            // the deepest level has nothing to collapse
            if (!Array.isArray(p) || p.length === 0 || p.length >= types.length) {
                return ctx.issue(`collapsed.${axis}`, `path ${JSON.stringify(p)} does not fit the ${axis}`);
            }
            const converted = p.map((v, level) => itemFor(types[level], v));
            if (converted.includes(undefined)) {
                return ctx.issue(`collapsed.${axis}`, `path ${JSON.stringify(p)} does not fit the field types`);
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
        ctx.issue("display", `unknown display ${JSON.stringify(display)}`);
    }
    const chart = get(raw, "chart");
    if (chart !== undefined) {
        view.chart = {
            type: oneOf(get(chart, "type"), CHART_TYPES, view.chart.type),
            stacked: bool(get(chart, "stacked"), false),
            horizontal: bool(get(chart, "horizontal"), false)
        };
        if (get(chart, "type") !== undefined && view.chart.type !== get(chart, "type")) {
            ctx.issue("chart.type", `unknown chart type ${JSON.stringify(get(chart, "type"))}`);
        }
    }
}

function formattingSection(raw, view, ctx) {
    const formatting = get(raw, "formatting");
    const locale = get(formatting, "locale");
    if (locale !== undefined && locale !== null) {
        view.formatting.locale = canonicalLocale(locale);
        if (view.formatting.locale === null) {
            ctx.issue("formatting.locale", `unknown locale ${JSON.stringify(locale)}`);
        }
    }
    const timeZone = get(formatting, "timeZone");
    if (timeZone !== undefined && timeZone !== null) {
        view.formatting.timeZone = canonicalTimeZone(timeZone);
        if (view.formatting.timeZone === null) {
            ctx.issue("formatting.timeZone", `unknown time zone ${JSON.stringify(timeZone)}`);
        }
    }
}

/** In order: derived fields first, values before filters and sort (their default measure). */
const SECTIONS = [derivedSection, axesSection, valuesSection, filtersSection, sortSection, totalsSection, collapsedSection, displaySection, formattingSection];

function context(schema, limits, issues) {
    const fields = new Map(schemaFields(schema).map((f) => [f.name.toLowerCase(), f]));
    const ctx = {
        limits,
        fields,
        issue: (path, message) => {
            issues.push({ path, message });
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
        valueRef: (ref, path) => {
            if (!isPlainObject(ref)) {
                ctx.issue(path, "not a value reference");
                return null;
            }
            const agg = get(ref, "agg");
            const fieldName = get(ref, "field");
            const f = fieldName === null || fieldName === undefined ? null : ctx.resolve(fieldName);
            if (!aggregatorOf(agg)) {
                ctx.issue(path, `unknown aggregator ${JSON.stringify(agg)}`);
                return null;
            }
            if (f === undefined) {
                ctx.issue(path, `unknown field ${JSON.stringify(fieldName)}`);
                return null;
            }
            if (f === null && agg !== "count") {
                ctx.issue(path, `${agg} needs a field`);
                return null;
            }
            if (f && !aggregatorFits(agg, f.type)) {
                ctx.issue(path, `${agg} does not work on the ${f.type} field "${f.name}"`);
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
export function normalize(input, schema, options = {}) {
    const limits = resolveLimits(options);
    /** @type {Issue[]} */
    const issues = [];
    const view = emptyView();
    const refuse = (path, message) => ({ view, issues: [...issues, { path, message }] });

    // A JSON round trip with a size limit: no functions, getters, cycles or prototypes survive.
    let parsed;
    try {
        const json = typeof input === "string" ? input : JSON.stringify(input);
        if (typeof json !== "string") {
            return refuse("", "not a view object");
        }
        if (json.length > limits.json) {
            return refuse("", `larger than ${limits.json} characters`);
        }
        parsed = JSON.parse(json);
    } catch {
        return refuse("", "not valid JSON");
    }
    const migrated = migrate(parsed);
    issues.push(...migrated.issues);
    if (migrated.view === null) {
        return { view, issues };
    }
    const raw = migrated.view;
    for (const key of Object.keys(raw)) {
        if (!Object.hasOwn(view, key)) {
            issues.push({ path: key.slice(0, 100), message: "unknown key" });
        }
    }
    const ctx = context(schema, limits, issues);
    for (const section of SECTIONS) {
        section(raw, view, ctx);
    }
    return { view, issues };
}

/**
 * Checks a view strictly: everything normalize() would drop or change is an error.
 * @param {unknown} input
 * @param {unknown} schema
 * @param {{ limits?: Partial<import("./limits.js").Limits> }} [options]
 * @returns {{ valid: boolean, errors: Issue[] }}
 */
export function validate(input, schema, options = {}) {
    const { issues } = normalize(input, schema, options);
    return { valid: issues.length === 0, errors: issues };
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
