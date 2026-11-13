/*
 * Plain, structured summaries of a data set and of a view, for a person reading a log, an approver
 * and an LLM that writes or explains views: what fields there are and what a view does, as JSON with
 * one short English `text` per part. Nothing here is formatted for a locale or rendered; values from
 * the data are data (an LLM's prompt should mark them as such), capped in number and length.
 */

import { aggregatorsFor } from "./aggregators.js";
import { FILTERS } from "./filters.js";
import { isEncoded } from "./encode.js";
import { PivotkitError } from "./errors.js";
import { isPlainObject, optionsOf } from "./util.js";
import { normalize, validate, viewFields } from "./view.js";

/** The most items a field's summary lists, and the characters of each. */
export const DESCRIBE_LIMITS = Object.freeze({ items: 20, text: 80 });

/** A value of the data as a summary writes it: a date as its ISO day or minute, text capped. */
function valueText(value, type) {
    if (value === null || value === undefined) {
        return null;
    }
    if (type === "date" && typeof value === "number") {
        const iso = new Date(value).toISOString();
        return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16);
    }
    const text = String(value);
    return text.length > DESCRIBE_LIMITS.text ? `${text.slice(0, DESCRIBE_LIMITS.text - 1)}…` : text;
}

/** The filter types that work on a field of a type (FILTERS' field-type matrix); a data set has no groupings. */
const filtersFor = (type) => Object.keys(FILTERS).filter((t) => FILTERS[t].fields.includes(type));

/** A field's name in a summary's words: capped as a value is (a data set's names are data too). */
const nameText = (name) => /** @type {string} */ (valueText(name, "string"));

/**
 * @typedef {object} FieldSummary
 * @property {string} name
 * @property {string} type
 * @property {number} [distinct]  distinct items (encoded data only)
 * @property {number} [blanks]  rows without a value (encoded data only)
 * @property {Array<string | number | boolean>} [items]  the first DESCRIBE_LIMITS.items items in the data's order
 * @property {string | number} [min]
 * @property {string | number} [max]
 * @property {string[]} aggregators  the aggregators that work on it
 * @property {string[]} filters  the filter types that work on it
 * @property {string} text
 */

/**
 * The fields of a data set: type, and with encoded data the number of rows, distinct items, blanks,
 * the first items and the smallest and largest value; the aggregators and filter types each works
 * with. `options.items` caps the items listed per field (default DESCRIBE_LIMITS.items).
 * Rows that are not encoded (objects without a `name`) throw INVALID_ARGUMENT: encode() them first.
 * @param {unknown} data  encoded data, a schema { fields } or an array of { name, type }
 * @param {{ items?: number }} [options]
 * @returns {{ rows: number | null, fields: FieldSummary[], text: string }}
 */
export function describeSource(data, options) {
    options = optionsOf(options, "describeSource");
    if (Array.isArray(data) && data.length > 0 && !data.some((f) => isPlainObject(f) && typeof f.name === "string")) {
        throw new PivotkitError("INVALID_ARGUMENT", "describeSource takes encoded data, a schema or an array of { name, type }; encode() the rows first");
    }
    const cap = Number.isInteger(options.items) && /** @type {number} */ (options.items) >= 0 ? /** @type {number} */ (options.items) : DESCRIBE_LIMITS.items;
    const encoded = isEncoded(data) ? data : null;
    const fields = encoded ? encoded.schema.fields : viewFields(/** @type {any} */ ({ derived: [] }), data);
    const summaries = fields.map((f) => {
        const type = typeof f.type === "string" ? f.type : "string";
        /** @type {FieldSummary} */
        const out = { name: f.name, type, aggregators: [...aggregatorsFor(type)], filters: filtersFor(type), text: "" };
        const column = encoded?.column(f.name);
        if (column) {
            let blanks = 0;
            for (let i = 0; i < column.codes.length; i++) {
                if (column.codes[i] === -1) {
                    blanks++;
                }
            }
            out.distinct = column.dict.length;
            out.blanks = blanks;
            out.items = column.dict.slice(0, cap).map((v) => (type === "date" ? valueText(v, type) : typeof v === "string" ? valueText(v, type) : v));
            if (type === "number" || type === "date") {
                const numbers = /** @type {number[]} */ (column.dict.filter((v) => typeof v === "number" && !Number.isNaN(v)));
                if (numbers.length) {
                    const [lo, hi] = numbers.reduce(([a, b], v) => [Math.min(a, v), Math.max(b, v)], [Infinity, -Infinity]);
                    out.min = type === "date" ? valueText(lo, type) : lo;
                    out.max = type === "date" ? valueText(hi, type) : hi;
                }
            }
        }
        const parts = [`${nameText(f.name)}: ${type}`];
        if (out.distinct !== undefined) {
            parts.push(`${out.distinct} distinct`, `${out.blanks} blank`);
        }
        if (out.min !== undefined) {
            parts.push(`from ${out.min} to ${out.max}`);
        }
        out.text = parts.join(", ");
        return out;
    });
    const rows = encoded ? encoded.length : null;
    return { rows, fields: summaries, text: `${rows === null ? "" : `${rows} rows, `}${summaries.length} fields: ${summaries.map((f) => `${nameText(f.name)} (${f.type})`).join(", ")}` };
}

/** A value reference in words: "sum of Sales", "count of rows". */
const refText = (ref) => (ref ? (ref.field ? `${ref.agg} of ${ref.field}` : `${ref.agg} of rows`) : "the first value");

/** A list of items in words, capped. */
const itemsText = (items) => {
    const shown = items.slice(0, 10).map((v) => (typeof v === "string" ? JSON.stringify(valueText(v, "string")) : String(v)));
    return items.length > 10 ? `${shown.join(", ")} and ${items.length - 10} more` : shown.join(", ");
};

const BLANKS_TEXT = Object.freeze({ exclude: "blanks dropped", include: "blanks kept", only: "only blanks" });
const COMPARE_TEXT = Object.freeze({ "=": "is", ">": "is greater than", ">=": "is at least", "<": "is less than", "<=": "is at most", between: "is between" });

/**
 * One filter of a normalized view in words: "Region is one of \"North\", \"South\" (blanks dropped)".
 * @param {import("./view.js").FilterSpec} f
 */
export function filterText(f) {
    const not = f.not ? "not " : "";
    const blanks = f.blanks ? ` (${BLANKS_TEXT[f.blanks]})` : "";
    const between = (a, b) => `${JSON.stringify(a)} and ${JSON.stringify(b)}`;
    switch (f.type) {
        case "in":
            return `${f.field} is ${not}one of ${itemsText(f.items ?? []) || "(no items)"}${blanks}`;
        case "blank":
            return `${f.field} is ${not}blank`;
        case "text":
            return `${f.field}${f.on === "label" ? " (as shown)" : ""} ${not ? "does not " : ""}${f.op === "equals" ? (not ? "equal" : "equals") : f.op === "contains" ? (not ? "contain" : "contains") : f.op === "beginsWith" ? (not ? "begin with" : "begins with") : not ? "end with" : "ends with"} ${JSON.stringify(f.value)}${f.match ? `, case ${f.match.case}, whitespace ${f.match.whitespace}` : ""}${blanks}`;
        case "compare":
            return `${f.field} ${not ? "is not" : "is"} ${COMPARE_TEXT[f.op].replace(/^is /, "")} ${f.op === "between" ? between(f.value, f.value2) : JSON.stringify(f.value)}${f.precision && f.precision !== "day" ? ` (by ${f.precision})` : ""}${blanks}`;
        case "relative": {
            const range = f.direction === "this" ? `this ${f.unit}` : `${f.direction} ${f.count} ${f.unit}${f.count === 1 ? "" : "s"}`;
            const how = [f.calendar === false ? "rolling" : null, f.includeCurrent === false ? "current excluded" : null, f.anchor && f.anchor !== "today" ? `from ${f.anchor}` : null].filter(Boolean);
            return `${f.field} ${not ? "is not" : "is"} in the ${range}${how.length ? ` (${how.join(", ")})` : ""}${blanks}`;
        }
        case "top":
            return `${f.bottom ? "bottom" : "top"} ${f.count} ${f.field} by ${refText(f.by)}${f.ties === "all" ? ", ties kept" : ""}`;
        case "value":
            return `${f.field} where ${refText(f.by)} ${not ? "is not" : "is"} ${COMPARE_TEXT[f.op].replace(/^is /, "")} ${f.op === "between" ? between(f.value, f.value2) : JSON.stringify(f.value)}`;
        default:
            return `${f.field}: ${f.type}`;
    }
}

/**
 * A view in plain parts: what it shows (rows, columns, values with their names), what it filters (each
 * filter structured, with its words), its groupings, sort and display, whether it is valid against the
 * data and what is wrong (validate()'s errors and warnings), and one short English `text` of it all.
 * The view is normalized first; the parts are the normalized view's, so a part with an error is left
 * out of them, and `text` of an invalid view starts with "(invalid: n errors, ...)".
 * @param {unknown} input  a view (any input normalize() takes)
 * @param {unknown} schema  encoded data, { fields } or the fields array
 * @param {{ limits?: Partial<import("./limits.js").Limits> }} [options]
 */
export function describeView(input, schema, options) {
    options = optionsOf(options, "describeView");
    const { valid, errors, warnings } = validate(input, schema, options);
    const view = normalize(input, schema, options).view;
    const values = view.values.map((v) => ({ field: v.field, agg: v.agg, label: v.label, showAs: v.showAs?.type ?? null, text: v.label ?? refText(v) }));
    const filters = view.filters.map((f) => ({ ...f, text: filterText(f) }));
    const derived = view.derived.map((d) => ({ ...d, text: `${d.name}: ${d.field} by ${d.by}${d.by === "bin" ? ` of ${d.size}` : ""}` }));
    const sort = view.sort.map((s) => ({ ...s, text: `${s.field} ${s.by === "value" ? `by ${refText(s.value)}` : s.by === "custom" ? "in a custom order" : "by label"}, ${s.order === "desc" ? "descending" : "ascending"}` }));
    const parts = [
        values.length ? values.map((v) => v.text).join(", ") : "count of rows",
        view.rows.length ? `by ${view.rows.join(" > ")}` : null,
        view.cols.length ? `across ${view.cols.join(" > ")}` : null,
        filters.length ? `where ${filters.map((f) => f.text).join("; and ")}` : null,
        view.display === "chart" ? `as a ${view.chart.type === "auto" ? "chart" : `${view.chart.type} chart`}` : null
    ];
    return {
        valid,
        errors,
        warnings,
        rows: { fields: view.rows, text: view.rows.join(" > ") },
        cols: { fields: view.cols, text: view.cols.join(" > ") },
        values,
        filters,
        derived,
        sort,
        display: { mode: view.display, chart: view.display === "chart" ? view.chart.type : null },
        text: `${valid ? "" : `(invalid: ${errors.length} error${errors.length === 1 ? "" : "s"}, the parts they name are left out) `}${parts.filter(Boolean).join(" ")}`
    };
}
