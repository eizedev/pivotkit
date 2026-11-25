/*
 * Plain, structured summaries of a data set and of a view, for a person reading a log, an approver
 * and an LLM that writes or explains views: what fields there are and what a view does, as JSON with
 * one short `text` per part. The texts are English; describeView also writes German
 * (DESCRIBE_LABELS in describe-labels.js). Nothing here is formatted for a locale or rendered; values from
 * the data are data (an LLM's prompt should mark them as such), capped in number and length.
 */

import { aggregatorsFor } from "./aggregators.js";
import { FILTERS } from "./filters.js";
import { DESCRIBE_LABELS } from "./describe-labels.js";
import { isEncoded } from "./encode.js";
import { PivotkitError } from "./errors.js";
import { fill, pluralForm } from "./labels.js";
import { isPlainObject, optionsOf } from "./util.js";
import { normalize, validate, viewFields } from "./view.js";

/** The most items a field's summary lists, and the characters of each. */
export const DESCRIBE_LIMITS = Object.freeze({ items: 20, text: 80 });

/** A value of the data as a summary writes it: a date as its ISO day or minute (one no date holds: its number), text capped. */
function valueText(value, type) {
    if (value === null || value === undefined) {
        return null;
    }
    if (type === "date" && typeof value === "number" && !Number.isNaN(new Date(value).getTime())) {
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
    const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    return { rows, fields: summaries, text: `${rows === null ? "" : `${count(rows, "row")}, `}${count(summaries.length, "field")}: ${summaries.map((f) => `${nameText(f.name)} (${f.type})`).join(", ")}` };
}

/** A word of a table by a name from a view (own entries only), else the name itself. */
const wordOf = (table, name) => (table && Object.hasOwn(table, name) ? table[name] : name);

/** A value reference in words: "sum of Sales", "count of rows"; German "Summe von Sales". */
const refText = (ref, words) => {
    if (!ref) {
        return words.firstValue;
    }
    const agg = wordOf(words.aggregators, ref.agg);
    return ref.field ? fill(words.valueName, { agg, field: ref.field }) : fill(words.valueOfRows, { agg });
};

/** A list of items in words, capped. */
const itemsText = (items, words) => {
    const shown = items.slice(0, 10).map((v) => (typeof v === "string" ? JSON.stringify(valueText(v, "string")) : String(v)));
    return items.length > 10 ? fill(words.more, { items: shown.join(", "), count: items.length - 10 }) : shown.join(", ");
};

/** A filter's phrase and the values it is filled with: the phrase is built from words first, then filled once, so a name or value that holds "{field}" stays as it is. */
function filterPhrase(f, words) {
    const yesNot = (p) => (f.not ? p.not : p.yes);
    const compared = { value: JSON.stringify(f.value), value2: JSON.stringify(f.value2) };
    switch (f.type) {
        case "in":
            return { phrase: yesNot(words.in), values: { items: itemsText(f.items ?? [], words) || words.noItems } };
        case "blank":
            return { phrase: yesNot(words.blank), values: {}, blanks: false };
        case "text": {
            const own = fill(yesNot(words.text[f.op]), f.on === "label" ? { field: words.asShown } : {});
            const phrase = f.match ? fill(words.match, { text: own, case: wordOf(words.cases, f.match.case), whitespace: wordOf(words.whitespace, f.match.whitespace) }) : own;
            return { phrase, values: { value: JSON.stringify(f.value) } };
        }
        case "compare": {
            const phrase = fill(yesNot(words.compare), { op: words.ops[f.op] });
            return { phrase: f.precision && f.precision !== "day" ? fill(words.precision, { text: phrase, precision: wordOf(words.precisions, f.precision) }) : phrase, values: compared };
        }
        case "relative": {
            const range = f.direction === "this" ? wordOf(words.ranges.this, f.unit) : pluralForm(words.ranges[f.direction]?.[f.unit], f.count, words.lang);
            const phrase = fill(yesNot(words.relative), { range });
            const how = [f.calendar === false ? words.rolling : null, f.includeCurrent === false ? words.currentExcluded : null, f.anchor && f.anchor !== "today" ? fill(words.fromAnchor, { anchor: Object.hasOwn(words.anchors, f.anchor) ? words.anchors[f.anchor] : "{anchor}" }) : null].filter(Boolean);
            return { phrase: how.length ? fill(words.how, { text: phrase, how: how.join(", ") }) : phrase, values: { count: f.count, anchor: f.anchor } };
        }
        case "top": {
            const phrase = f.bottom ? words.bottom : words.top;
            return { phrase: f.ties === "all" ? fill(words.tiesKept, { text: phrase }) : phrase, values: { count: f.count, by: refText(f.by, words) }, blanks: false };
        }
        case "value":
            return { phrase: fill(yesNot(words.value), { op: words.ops[f.op] }), values: { by: refText(f.by, words), ...compared }, blanks: false };
        default:
            return { phrase: "{field}: {type}", values: { type: f.type }, blanks: false };
    }
}

/**
 * One filter of a normalized view in words: "Region is one of \"North\", \"South\" (blanks dropped)".
 * @param {import("./view.js").FilterSpec} f
 * @param {import("./describe-labels.js").DescribeLabels} [words]  default English
 */
export function filterText(f, words = DESCRIBE_LABELS.en) {
    const { phrase, values, blanks } = filterPhrase(f, words);
    const withBlanks = blanks !== false && f.blanks ? fill(words.withBlanks, { text: phrase, blanks: words.blanks[f.blanks] }) : phrase;
    return fill(withBlanks, { ...values, field: f.field });
}

/**
 * The words of `labels` over English, one level deep: a table that `labels` gives in part ({ blanks:
 * { exclude } }) keeps English for its other entries.
 * @param {unknown} labels
 * @returns {import("./describe-labels.js").DescribeLabels}
 */
function wordsOf(labels) {
    /** @type {any} */
    const words = { ...DESCRIBE_LABELS.en };
    if (!isPlainObject(labels)) {
        return words;
    }
    for (const [key, value] of Object.entries(/** @type {object} */ (labels))) {
        const base = Object.hasOwn(words, key) ? words[key] : undefined;
        words[key] = isPlainObject(base) && isPlainObject(value) ? { ...base, ...value } : value;
    }
    return words;
}

/**
 * A view in plain parts: what it shows (rows, columns, values with their names), what it filters (each
 * filter structured, with its words), its groupings, sort and display, whether it is valid against the
 * data and what is wrong (validate()'s errors and warnings), and one short `text` of it all.
 * The view is normalized first; the parts are the normalized view's, so a part with an error is left
 * out of them, and `text` of an invalid view starts with "(invalid: n errors, ...)".
 * The `text`s are English unless `options.labels` gives other words: DESCRIBE_LABELS.de or
 * describeLabels(locale) for German. A partial `labels` takes English for each key and table entry it leaves out.
 * validate()'s errors and warnings stay English.
 * @param {unknown} input  a view (any input normalize() takes)
 * @param {unknown} schema  encoded data, { fields } or the fields array
 * @param {{ limits?: Partial<import("./limits.js").Limits>, labels?: Partial<import("./describe-labels.js").DescribeLabels> }} [options]
 */
export function describeView(input, schema, options) {
    options = optionsOf(options, "describeView");
    const words = wordsOf(options.labels);
    const { valid, errors, warnings } = validate(input, schema, options);
    const view = normalize(input, schema, options).view;
    const values = view.values.map((v) => ({ field: v.field, agg: v.agg, label: v.label, showAs: v.showAs?.type ?? null, text: v.label ?? refText(v, words) }));
    const filters = view.filters.map((f) => ({ ...f, text: filterText(f, words) }));
    const derived = view.derived.map((d) => ({ ...d, text: fill(d.by === "bin" ? words.bins : words.derived, { name: d.name, field: d.field, by: wordOf(words.units, d.by), size: d.size }) }));
    // a sort's column holds one key per column field: a date's key is milliseconds, written as its day
    const types = new Map(viewFields(view, schema).map((f) => [f.name, f.type]));
    const keyText = (key, i) => (types.get(view.cols[i]) === "date" ? (valueText(key, "date") ?? String(key)) : String(key));
    const sortPhrase = (s) => (s.by === "value" ? (s.column ? words.sortColumn : words.sortValue) : s.by === "custom" ? words.sortCustom : words.sortLabel);
    const sort = view.sort.map((s) => ({ ...s, text: fill(sortPhrase(s), { field: s.field, by: s.by === "value" ? refText(s.value, words) : "", column: s.column ? s.column.map(keyText).join(" › ") : "", order: s.order === "desc" ? words.orders.desc : words.orders.asc }) }));
    const chart = wordOf(words.chartTypes, view.chart.type);
    const parts = [
        values.length ? values.map((v) => v.text).join(", ") : words.countRows,
        view.rows.length ? fill(words.rows, { fields: view.rows.join(" > ") }) : null,
        view.cols.length ? fill(words.cols, { fields: view.cols.join(" > ") }) : null,
        filters.length ? fill(words.where, { filters: filters.map((f) => f.text).join(words.and) }) : null,
        view.display === "table" ? null : fill(view.display === "both" ? words.both : words.chart, { type: chart })
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
        display: { mode: view.display, chart: view.display === "table" ? null : view.chart.type },
        text: `${valid ? "" : `${fill(pluralForm(words.invalid, errors.length, words.lang), { count: errors.length })} `}${parts.filter(Boolean).join(" ")}`
    };
}
