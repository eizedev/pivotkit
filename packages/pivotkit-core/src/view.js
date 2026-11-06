/*
 * The view object: the report as JSON (rows, columns, values, filters, derived fields, sort, totals,
 * collapsed groups, display and chart, formatting). It is the preset, the template and the undo state
 * at once, and it is user input: it may come from a browser, a file or a URL. normalize() therefore
 * only resolves names against the schema and fixed lists, copies known keys into a new object and
 * drops everything else; nothing in a view is ever evaluated.
 */

import { AGGREGATORS, aggregatorFits } from "./aggregators.js";
import { DERIVE_UNITS } from "./derive.js";
import { isFormat } from "./format.js";
import { toWallMs } from "./encode.js";

export const VIEW_VERSION = 1;

export const SHOW_AS = Object.freeze([
    "percentOfGrandTotal", "percentOfRowTotal", "percentOfColumnTotal", "percentOfParentRow",
    "percentOfParentColumn", "differenceFromPrevious", "percentDifferenceFromPrevious", "runningTotal",
    "percentRunningTotal", "rankAscending", "rankDescending"
]);
/** show-as types that walk along an axis (Excel's "base field") */
export const SHOW_AS_ALONG_AXIS = Object.freeze([
    "differenceFromPrevious", "percentDifferenceFromPrevious", "runningTotal", "percentRunningTotal",
    "rankAscending", "rankDescending"
]);
export const FILTER_TYPES = Object.freeze(["include", "exclude", "label", "top", "value"]);
export const LABEL_OPS = Object.freeze(["equals", "notEquals", "contains", "notContains", "beginsWith", "endsWith"]);
export const VALUE_OPS = Object.freeze(["=", "!=", ">", ">=", "<", "<=", "between", "notBetween"]);
export const CHART_TYPES = Object.freeze(["bar", "line", "area", "pie", "heatmap"]);
export const DISPLAY_MODES = Object.freeze(["table", "chart"]);

/** Limits against hostile or accidental huge views. */
export const LIMITS = Object.freeze({
    json: 5_000_000, // characters of the serialized view
    name: 256,
    axisFields: 32,
    values: 64,
    filters: 128,
    items: 100_000,
    derived: 64,
    sort: 64,
    collapsed: 10_000,
    topCount: 1_000_000
});

const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
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
 * @property {{ locale: string | null }} formatting
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
        formatting: { locale: null }
    };
}

/** Accepts an encoded data set, a schema { fields } or an array of fields. */
function schemaFields(schema) {
    const fields = Array.isArray(schema) ? schema : schema && Array.isArray(schema.fields) ? schema.fields : schema && schema.schema ? schema.schema.fields : [];
    return fields
        .filter((f) => f && typeof f.name === "string")
        .map((f) => ({ name: f.name, type: typeof f.type === "string" ? f.type : "string" }));
}

const own = (obj, key) => obj !== null && typeof obj === "object" && !Array.isArray(obj) && Object.hasOwn(obj, key);
const get = (obj, key) => (own(obj, key) ? obj[key] : undefined);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function oneOf(value, allowed, fallback) {
    return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function bool(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}

function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value, max = LIMITS.name) {
    if (typeof value !== "string") {
        return null;
    }
    const t = value.trim();
    return t === "" || t.length > max ? null : t;
}

/** A dimension value from a view (filter item, collapsed path), converted to the column's type. */
function itemFor(type, value) {
    if (value === null) {
        return null;
    }
    switch (type) {
        case "number": {
            const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
            return Number.isFinite(n) ? n : undefined;
        }
        case "date": {
            const n = typeof value === "number" ? value : typeof value === "string" ? toWallMs(value, "UTC") : NaN;
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

function derivedType(by) {
    return by === "day" ? "date" : "number";
}

/**
 * Normalizes a view against a schema: names are resolved case-insensitively to the data's spelling,
 * unknown fields, aggregators, formats and keys are dropped, missing parts get their defaults. Never
 * throws; anything that is not a view becomes the empty view.
 *
 * @param {unknown} input  a view object or its JSON text
 * @param {unknown} schema  encoded data, { fields: [{ name, type }] } or the fields array
 * @param {{ onIssue?: (path: string, message: string) => void }} [options]
 * @returns {View}
 */
export function normalize(input, schema, options = {}) {
    const issue = typeof options.onIssue === "function" ? options.onIssue : () => {};
    const view = emptyView();

    // A JSON round trip with a size limit: no functions, getters, cycles or prototypes survive.
    let raw;
    try {
        const json = typeof input === "string" ? input : JSON.stringify(input);
        if (typeof json !== "string") {
            issue("", "not a view object");
            return view;
        }
        if (json.length > LIMITS.json) {
            issue("", `larger than ${LIMITS.json} characters`);
            return view;
        }
        raw = JSON.parse(json);
    } catch {
        issue("", "not valid JSON");
        return view;
    }
    if (!isPlainObject(raw)) {
        issue("", "not a view object");
        return view;
    }
    for (const key of Object.keys(raw)) {
        if (!Object.hasOwn(view, key)) {
            issue(key.slice(0, 100), "unknown key");
        }
    }
    const version = get(raw, "version");
    if (version !== undefined && version !== VIEW_VERSION) {
        issue("version", `unsupported version ${JSON.stringify(version)}; read as version ${VIEW_VERSION}`);
    }

    // Fields: the schema's columns plus valid derived fields, resolved case-insensitively.
    const fields = new Map(schemaFields(schema).map((f) => [f.name.toLowerCase(), f]));
    const derivedIn = get(raw, "derived");
    if (derivedIn !== undefined) {
        if (!Array.isArray(derivedIn)) {
            issue("derived", "not a list");
        } else {
            derivedIn.slice(0, LIMITS.derived).forEach((d, i) => {
                const path = `derived[${i}]`;
                const name = text(get(d, "name"));
                const source = fields.get(String(get(d, "field") ?? "").toLowerCase());
                const by = oneOf(get(d, "by"), DERIVE_UNITS, null);
                if (!name) {
                    return issue(path, "needs a name");
                }
                if (fields.has(name.toLowerCase())) {
                    return issue(path, `name "${name}" is already a field`);
                }
                if (!source || source.derived) {
                    return issue(path, "unknown source field");
                }
                if (!by) {
                    return issue(path, "unknown grouping");
                }
                if (by === "bin" ? source.type !== "number" : source.type !== "date") {
                    return issue(path, by === "bin" ? "bins need a number field" : "date grouping needs a date field");
                }
                const spec = { name, field: source.name, by };
                if (by === "bin") {
                    const size = finite(get(d, "size"));
                    if (size === null || size <= 0) {
                        return issue(path, "bins need a size above 0");
                    }
                    spec.size = size;
                    spec.origin = finite(get(d, "origin")) ?? 0;
                }
                view.derived.push(spec);
                fields.set(name.toLowerCase(), { name, type: derivedType(by), derived: true });
            });
            if (derivedIn.length > LIMITS.derived) {
                issue("derived", `more than ${LIMITS.derived} entries`);
            }
        }
    }
    const resolve = (name) => (typeof name === "string" && name.length <= LIMITS.name ? fields.get(name.trim().toLowerCase()) : undefined);

    // Rows and columns: each field once, in one axis only.
    const placed = new Set();
    for (const axis of ["rows", "cols"]) {
        const list = get(raw, axis);
        if (list === undefined) {
            continue;
        }
        if (!Array.isArray(list)) {
            issue(axis, "not a list");
            continue;
        }
        list.slice(0, LIMITS.axisFields).forEach((name, i) => {
            const f = resolve(name);
            if (!f) {
                return issue(`${axis}[${i}]`, `unknown field ${JSON.stringify(name)}`);
            }
            if (placed.has(f.name)) {
                return issue(`${axis}[${i}]`, `"${f.name}" is already placed`);
            }
            placed.add(f.name);
            view[axis].push(f.name);
        });
        if (list.length > LIMITS.axisFields) {
            issue(axis, `more than ${LIMITS.axisFields} fields`);
        }
    }

    const valueRef = (ref, path) => {
        if (!isPlainObject(ref)) {
            issue(path, "not a value reference");
            return null;
        }
        const agg = oneOf(get(ref, "agg"), Object.keys(AGGREGATORS), null);
        const fieldName = get(ref, "field");
        const f = fieldName === null || fieldName === undefined ? null : resolve(fieldName);
        if (!agg) {
            issue(path, `unknown aggregator ${JSON.stringify(get(ref, "agg"))}`);
            return null;
        }
        if (f === undefined) {
            issue(path, `unknown field ${JSON.stringify(fieldName)}`);
            return null;
        }
        if (f === null && agg !== "count") {
            issue(path, `${agg} needs a field`);
            return null;
        }
        if (f && !aggregatorFits(agg, f.type)) {
            issue(path, `${agg} does not work on the ${f.type} field "${f.name}"`);
            return null;
        }
        return { field: f ? f.name : null, agg };
    };

    // Values
    const valuesIn = get(raw, "values");
    if (valuesIn !== undefined) {
        if (!Array.isArray(valuesIn)) {
            issue("values", "not a list");
        } else {
            valuesIn.slice(0, LIMITS.values).forEach((v, i) => {
                const path = `values[${i}]`;
                const ref = valueRef(v, path);
                if (!ref) {
                    return;
                }
                const fieldType = ref.field ? fields.get(ref.field.toLowerCase()).type : "number";
                const numericResult = AGGREGATORS[ref.agg].resultType(fieldType) === "number";
                const format = get(v, "format");
                const spec = { ...ref, format: null, label: null, showAs: null, conditional: null };
                if (format !== undefined && format !== null) {
                    if (isFormat(format)) {
                        spec.format = format.trim().toLowerCase();
                    } else {
                        issue(`${path}.format`, `unknown format ${JSON.stringify(format)}`);
                    }
                }
                const label = get(v, "label");
                if (label !== undefined && label !== null) {
                    spec.label = text(label);
                    if (spec.label === null) {
                        issue(`${path}.label`, "not a text up to 256 characters");
                    }
                }
                const showAs = get(v, "showAs");
                if (showAs !== undefined && showAs !== null) {
                    const s = typeof showAs === "string" ? { type: showAs } : showAs;
                    const type = oneOf(get(s, "type"), SHOW_AS, null);
                    if (!type) {
                        issue(`${path}.showAs`, `unknown show-as ${JSON.stringify(get(s, "type"))}`);
                    } else if (!numericResult) {
                        issue(`${path}.showAs`, `${ref.agg} has no number to show as ${type}`);
                    } else {
                        spec.showAs = { type, axis: oneOf(get(s, "axis"), ["rows", "cols"], "rows") };
                    }
                }
                const cond = get(v, "conditional");
                if (cond !== undefined && cond !== null) {
                    const type = get(cond, "type");
                    if (!numericResult) {
                        issue(`${path}.conditional`, "conditional formatting needs a number value");
                    } else if (type === "colorScale") {
                        const colors = get(cond, "colors");
                        const list = Array.isArray(colors) ? colors.filter((c) => typeof c === "string" && COLOR.test(c)).slice(0, 3) : [];
                        if (Array.isArray(colors) && (list.length !== colors.length || list.length < 2)) {
                            issue(`${path}.conditional.colors`, "two or three colours as #rgb or #rrggbb");
                        }
                        spec.conditional = { type, colors: list.length >= 2 ? list : [] };
                    } else if (type === "dataBar") {
                        const color = get(cond, "color");
                        if (color !== undefined && color !== null && !(typeof color === "string" && COLOR.test(color))) {
                            issue(`${path}.conditional.color`, "a colour as #rgb or #rrggbb");
                        }
                        spec.conditional = { type, color: typeof color === "string" && COLOR.test(color) ? color : null };
                    } else {
                        issue(`${path}.conditional`, `unknown conditional format ${JSON.stringify(type)}`);
                    }
                }
                view.values.push(spec);
            });
            if (valuesIn.length > LIMITS.values) {
                issue("values", `more than ${LIMITS.values} values`);
            }
        }
    }
    const defaultRef = () => (view.values.length ? { field: view.values[0].field, agg: view.values[0].agg } : { field: null, agg: "count" });

    // Filters
    const filtersIn = get(raw, "filters");
    if (filtersIn !== undefined) {
        if (!Array.isArray(filtersIn)) {
            issue("filters", "not a list");
        } else {
            filtersIn.slice(0, LIMITS.filters).forEach((flt, i) => {
                const path = `filters[${i}]`;
                const f = resolve(get(flt, "field"));
                const type = oneOf(get(flt, "type"), FILTER_TYPES, null);
                if (!f) {
                    return issue(path, `unknown field ${JSON.stringify(get(flt, "field"))}`);
                }
                if (!type) {
                    return issue(path, `unknown filter type ${JSON.stringify(get(flt, "type"))}`);
                }
                const spec = { field: f.name, type };
                if (type === "include" || type === "exclude") {
                    const items = get(flt, "items");
                    if (!Array.isArray(items)) {
                        return issue(path, "needs a list of items");
                    }
                    if (items.length > LIMITS.items) {
                        issue(`${path}.items`, `more than ${LIMITS.items} items`);
                    }
                    spec.items = [];
                    for (const item of items.slice(0, LIMITS.items)) {
                        const converted = itemFor(f.type, item);
                        if (converted === undefined) {
                            issue(`${path}.items`, `item ${JSON.stringify(item)} does not fit the ${f.type} field`);
                        } else {
                            spec.items.push(converted);
                        }
                    }
                } else if (type === "label") {
                    const op = oneOf(get(flt, "op"), LABEL_OPS, null);
                    const value = get(flt, "value");
                    if (!op) {
                        return issue(path, `unknown label operator ${JSON.stringify(get(flt, "op"))}`);
                    }
                    if (typeof value !== "string" || value.length > 1000) {
                        return issue(path, "needs a text value");
                    }
                    Object.assign(spec, { op, value });
                } else {
                    const byIn = get(flt, "by");
                    const by = byIn === undefined ? defaultRef() : valueRef(byIn, `${path}.by`);
                    if (!by) {
                        return;
                    }
                    if (AGGREGATORS[by.agg].resultType(by.field ? fields.get(by.field.toLowerCase()).type : "number") !== "number") {
                        return issue(`${path}.by`, `${by.agg} gives no number to filter by`);
                    }
                    spec.by = by;
                    if (type === "top") {
                        const count = finite(get(flt, "count"));
                        if (count === null || count < 1 || count > LIMITS.topCount || !Number.isInteger(count)) {
                            return issue(path, "needs a whole count of 1 or more");
                        }
                        spec.count = count;
                        spec.bottom = bool(get(flt, "bottom"), false);
                    } else {
                        const op = oneOf(get(flt, "op"), VALUE_OPS, null);
                        const value = finite(get(flt, "value"));
                        if (!op || value === null) {
                            return issue(path, "needs an operator and a number");
                        }
                        Object.assign(spec, { op, value });
                        if (op === "between" || op === "notBetween") {
                            const value2 = finite(get(flt, "value2"));
                            if (value2 === null) {
                                return issue(path, `${op} needs value2`);
                            }
                            spec.value2 = value2;
                        }
                    }
                }
                view.filters.push(spec);
            });
            if (filtersIn.length > LIMITS.filters) {
                issue("filters", `more than ${LIMITS.filters} filters`);
            }
        }
    }

    // Sort, one entry per field
    const sortIn = get(raw, "sort");
    if (sortIn !== undefined) {
        if (!Array.isArray(sortIn)) {
            issue("sort", "not a list");
        } else {
            const seen = new Set();
            sortIn.slice(0, LIMITS.sort).forEach((s, i) => {
                const path = `sort[${i}]`;
                const f = resolve(get(s, "field"));
                if (!f || seen.has(f.name)) {
                    return issue(path, f ? `"${f.name}" is sorted twice` : `unknown field ${JSON.stringify(get(s, "field"))}`);
                }
                const by = oneOf(get(s, "by"), ["label", "value"], "label");
                const spec = { field: f.name, by, order: oneOf(get(s, "order"), ["asc", "desc"], "asc") };
                if (by === "value") {
                    const ref = get(s, "value") === undefined ? defaultRef() : valueRef(get(s, "value"), `${path}.value`);
                    if (!ref) {
                        return;
                    }
                    spec.value = ref;
                }
                seen.add(f.name);
                view.sort.push(spec);
            });
        }
    }

    // Totals
    const totals = get(raw, "totals");
    if (totals !== undefined) {
        if (!isPlainObject(totals)) {
            issue("totals", "not an object");
        } else {
            for (const key of Object.keys(view.totals)) {
                view.totals[key] = bool(get(totals, key), view.totals[key]);
            }
        }
    }

    // Collapsed groups: key paths of fields on the axis
    const collapsed = get(raw, "collapsed");
    if (collapsed !== undefined) {
        for (const axis of ["rows", "cols"]) {
            const list = get(collapsed, axis);
            if (list === undefined) {
                continue;
            }
            if (!Array.isArray(list)) {
                issue(`collapsed.${axis}`, "not a list");
                continue;
            }
            const types = view[axis].map((name) => fields.get(name.toLowerCase()).type);
            const seen = new Set();
            for (const p of list.slice(0, LIMITS.collapsed)) {
                // the deepest level has nothing to collapse
                if (!Array.isArray(p) || p.length === 0 || p.length >= types.length) {
                    issue(`collapsed.${axis}`, `path ${JSON.stringify(p)} does not fit the ${axis}`);
                    continue;
                }
                const converted = p.map((v, level) => itemFor(types[level], v));
                if (converted.includes(undefined)) {
                    issue(`collapsed.${axis}`, `path ${JSON.stringify(p)} does not fit the field types`);
                    continue;
                }
                const key = JSON.stringify(converted);
                if (!seen.has(key)) {
                    seen.add(key);
                    view.collapsed[axis].push(converted);
                }
            }
        }
    }

    view.display = oneOf(get(raw, "display"), DISPLAY_MODES, view.display);
    const chart = get(raw, "chart");
    if (chart !== undefined) {
        view.chart = {
            type: oneOf(get(chart, "type"), CHART_TYPES, view.chart.type),
            stacked: bool(get(chart, "stacked"), false),
            horizontal: bool(get(chart, "horizontal"), false)
        };
        if (get(chart, "type") !== undefined && view.chart.type !== get(chart, "type")) {
            issue("chart.type", `unknown chart type ${JSON.stringify(get(chart, "type"))}`);
        }
    }
    const locale = get(get(raw, "formatting"), "locale");
    if (locale !== undefined && locale !== null) {
        try {
            view.formatting.locale = typeof locale === "string" && locale.length <= 64 ? Intl.getCanonicalLocales(locale)[0] ?? null : null;
        } catch {
            view.formatting.locale = null;
        }
        if (view.formatting.locale === null) {
            issue("formatting.locale", `unknown locale ${JSON.stringify(locale)}`);
        }
    }
    return view;
}

/**
 * Checks a view strictly: everything normalize() would drop or change is an error.
 * @param {unknown} input
 * @param {unknown} schema
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
 */
export function validate(input, schema) {
    const errors = [];
    normalize(input, schema, { onIssue: (path, message) => errors.push({ path, message }) });
    return { valid: errors.length === 0, errors };
}

/** The schema of a view's fields including its derived fields: [{ name, type }]. */
export function viewFields(view, schema) {
    const base = schemaFields(schema);
    return base.concat((view.derived || []).map((d) => ({ name: d.name, type: derivedType(d.by), derived: true })));
}
