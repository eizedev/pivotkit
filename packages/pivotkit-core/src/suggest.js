/*
 * A view from a layout and a data set's field description, without a browser: what pivotkit-cli's
 * `describe --suggest` and `render --rows ...` and the operations of pivotkit-report (an MCP server's
 * suggest_view and render_view) build a view with.
 *
 *   const description = describeSource(encoded);              // { rows, fields: [{ name, type, distinct, min, max }] }
 *   const { layout, picks } = suggestLayout(description);    // rules: what a first view shows
 *   const { view, name } = viewFromLayout(layout, description); // the one function that makes the view
 *   const { view: checked, issues } = normalize(view, encoded); // a layout is user input: normalize it
 *
 * A layout is plain JSON: { rows, cols, values: [{ field, agg }], groups: [{ field, by, size }],
 * filters, chart, map }. viewFromLayout writes names in the data's spelling, groups a date placed on
 * an axis as the browser does (dateUnitFor, named by GROUPING_NAMES) and takes an aggregator a value
 * leaves out from the field (a number summed, an identifier or any other type counted). It checks the
 * layout's shape and size only: an unknown field, aggregator or unit passes through, so normalize()
 * says what is wrong with a "did you mean". The rules of suggestLayout read types and counts, not
 * meaning: a temperature is summed like revenue. Pure; nothing here reads data or the clock.
 */

import { dateUnitFor } from "./derive.js";
import { PivotkitError, expect } from "./errors.js";
import { groupingName, reportLabels } from "./labels.js";
import { OUTSIDE_LIMITS } from "./limits.js";
import { isPlainObject, optionsOf } from "./util.js";
import { renameFields } from "./view-file.js";

/**
 * @typedef {object} Layout  what a view shows, by field names; every key optional
 * @property {string[]} [rows]  fields or groupings' names, outer first
 * @property {string[]} [cols]
 * @property {Array<{ field?: string, agg?: string }>} [values]  without `agg`: a number summed, else counted
 * @property {Array<{ field: string, by: string, size?: number }>} [groups]  a grouping of a field (DERIVE_UNITS), shown where its field is placed
 * @property {object[]} [filters]  filters as a view writes them
 * @property {string} [chart]  a chart type (CHART_TYPES): the view shows the chart
 * @property {Record<string, string>} [map]  a field the layout names (key) is the data's field (value)
 *
 * @typedef {object} LayoutPick  why suggestLayout chose a part
 * @property {"rows" | "cols" | "values"} part
 * @property {"category" | "date" | "secondCategory" | "firstNumber" | "countRows"} code
 * @property {string} [field]
 * @property {string} [agg]
 * @property {string} [by]
 * @property {string[]} others  the fields the rule could have taken too
 * @property {string} text
 *
 * @typedef {{ code: "noSuggestion" | "dateGrouped" | "unusedGroup" | "unusedMap", message: string, field?: string }} LayoutNote
 */

/** What suggestLayout takes for a category: at most this many values (rows), and on columns at most `cols`. */
export const SUGGEST_LIMITS = Object.freeze({ rows: 50, cols: 12 });

/** How large a layout may be: entries per list (rows, values, groups, ...), characters per name. */
export const LAYOUT_LIMITS = Object.freeze({ entries: 64, name: 1024 });

/** The last word of a field's name that makes a number field an identifier ("ID", "Order No", "asset_nr", "Serial #"). */
const IDENTIFIER_WORDS = Object.freeze(["id", "nr", "no", "number", "key", "#"]);

/**
 * Whether a field's name says it is an identifier: its last word is ID, Nr, No, Number, Key or "#",
 * in any case. Words are split at a space, "_", "-", ".", "/", ":", a change from a small letter to
 * a capital ("CustomerId", "CustomerID") and from a letter to a digit; a "#" is a word of its own
 * ("Serial#" as "Serial #"). Before the last word is read, a part in parentheses at the end ("ID
 * (Asset)") and digits at the end ("userID2") are left out. "Paid", "PAID" and "UUID" are one word,
 * not one ending in "id"; "Number of items" ends in "items". A number field named so is counted, not
 * summed: by the report's field list (pivotkit-react) and by viewFromLayout and suggestLayout.
 * @param {string} name
 */
export function isIdentifierName(name) {
    const words = String(name)
        .replace(/(\s*\([^()]*\))+\s*$/, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Za-z])(\d)/g, "$1 $2")
        .replace(/#/g, " # ")
        .split(/[\s_.\-/:()]+/)
        .filter(Boolean);
    while (words.length > 1 && /^\d+$/.test(words[words.length - 1])) {
        words.pop();
    }
    const last = words[words.length - 1];
    return last !== undefined && IDENTIFIER_WORDS.includes(last.toLowerCase());
}

/** The words a view's name is made of, by language (the value names come from REPORT_LABELS). */
const NAME_WORDS = Object.freeze({ en: Object.freeze({ by: "by", and: "and" }), de: Object.freeze({ by: "nach", and: "und" }) });
const wordsOf = (locale) => (String(locale ?? "").split("-")[0].toLowerCase() === "de" ? NAME_WORDS.de : NAME_WORDS.en);

/**
 * A date of a description (describeSource writes "2025-01-10" or "2025-01-10T09:30", wall clock as
 * the data holds it) as milliseconds, read as UTC like the data's dates; NaN for anything else.
 * @param {unknown} text
 */
function dateMs(text) {
    if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(text)) {
        return NaN;
    }
    return Date.parse(text.includes("T") ? `${text}Z` : text);
}

/** The fields of a description (describeSource's result, or its `fields`), checked. */
function fieldsOf(description, fn) {
    if (description === null || description === undefined) {
        return [];
    }
    const fields = Array.isArray(description) ? description : isPlainObject(description) ? /** @type {any} */ (description).fields : undefined;
    expect(Array.isArray(fields), `${fn}: the description is describeSource()'s result or its fields`);
    return fields.filter((f) => isPlainObject(f) && typeof f.name === "string");
}

/**
 * A first layout for a data set from its field description (describeSource's result): rows the first
 * text field that is a category (no identifier's name; with counts, at least 2 and at most
 * SUGGEST_LIMITS.rows values, and fewer values than rows with a value), columns the first date field
 * grouped by its span (dateUnitFor) or, without one, the next category of at most SUGGEST_LIMITS.cols
 * values, values the first number field that is no identifier, summed (none: the count of rows).
 * Without a category the date goes to rows. A data set with nothing to group by gets a count of rows
 * and the note `noSuggestion`. `picks` say what each part took and what else it could have taken.
 * @param {unknown} description  describeSource(data), or its fields
 * @param {{ locale?: string }} [options]  the language of the groupings' names in `picks`
 * @returns {{ layout: Layout, picks: LayoutPick[], notes: LayoutNote[] }}
 */
export function suggestLayout(description, options) {
    options = optionsOf(options, "suggestLayout");
    const fields = fieldsOf(description, "suggestLayout");
    const rowCount = isPlainObject(description) && typeof (/** @type {any} */ (description).rows) === "number" ? /** @type {any} */ (description).rows : null;
    const filled = (f) => (rowCount === null || typeof f.blanks !== "number" ? rowCount : rowCount - f.blanks);
    const isCategory = (f, max) => {
        if (!(f.type === "string" || f.type === "boolean") || isIdentifierName(f.name)) {
            return false;
        }
        if (typeof f.distinct !== "number") {
            return true;
        }
        const values = filled(f);
        return f.distinct >= 2 && f.distinct <= max && (values === null || f.distinct < values);
    };
    const categories = fields.filter((f) => isCategory(f, SUGGEST_LIMITS.rows));
    const numbers = fields.filter((f) => f.type === "number" && !isIdentifierName(f.name));
    const dates = fields.map((f) => ({ f, by: f.type === "date" ? dateUnitFor(dateMs(f.min), dateMs(f.max)) : null })).filter((d) => d.by);
    const names = (list, but) => list.filter((f) => f !== but).map((f) => f.name);

    /** @type {Layout & { rows: string[], cols: string[], groups: any[] }} */
    const layout = { rows: [], cols: [], values: [], groups: [] };
    /** @type {LayoutPick[]} */
    const picks = [];
    const date = dates[0];
    const first = categories[0];
    if (first) {
        layout.rows.push(first.name);
        picks.push({ part: "rows", code: "category", field: first.name, others: names(categories, first), text: `${first.name}: the first text field with few values${typeof first.distinct === "number" ? ` (${first.distinct})` : ""}` });
    }
    if (date) {
        const part = first ? "cols" : "rows";
        layout[part].push(date.f.name);
        layout.groups.push({ field: date.f.name, by: date.by });
        picks.push({ part, code: "date", field: date.f.name, by: date.by, others: dates.slice(1).map((d) => d.f.name), text: `${groupingName(date.f.name, date.by, options)}: the first date, grouped by its span` });
    } else if (first) {
        const second = categories.find((f) => f !== first && isCategory(f, SUGGEST_LIMITS.cols));
        if (second) {
            layout.cols.push(second.name);
            picks.push({ part: "cols", code: "secondCategory", field: second.name, others: names(categories, second).filter((n) => n !== first.name), text: `${second.name}: the next text field with up to ${SUGGEST_LIMITS.cols} values${typeof second.distinct === "number" ? ` (${second.distinct})` : ""}` });
        }
    }
    const number = numbers[0];
    if (number) {
        layout.values = [{ field: number.name, agg: "sum" }];
        picks.push({ part: "values", code: "firstNumber", field: number.name, agg: "sum", others: names(numbers, number), text: `sum of ${number.name}: the first number field that is no identifier` });
    } else {
        layout.values = [{ agg: "count" }];
        picks.push({ part: "values", code: "countRows", agg: "count", others: [], text: "count of rows: the data has no number field that is no identifier" });
    }
    /** @type {LayoutNote[]} */
    const notes = layout.rows.length === 0 ? [{ code: "noSuggestion", message: fields.length ? "no field to group by: no text field with 2 to 50 values that repeat, and no date" : "the data has no fields" }] : [];
    if (!layout.groups.length) {
        delete layout.groups;
    }
    return { layout, picks, notes };
}

/** Throws INVALID_ARGUMENT or LIMIT_EXCEEDED unless the layout has the shape of a Layout and its size. */
function checkLayout(layout) {
    expect(isPlainObject(layout), "viewFromLayout: the layout is an object { rows, cols, values, groups, filters, chart, map }");
    const known = ["rows", "cols", "values", "groups", "filters", "chart", "map"];
    for (const key of Object.keys(layout)) {
        expect(known.includes(key), `viewFromLayout: unknown key ${JSON.stringify(key.slice(0, 40))} in the layout (it takes ${known.join(", ")})`);
    }
    const text = (value, where) => {
        expect(typeof value === "string", `viewFromLayout: ${where} is a text`);
        if (value.length > LAYOUT_LIMITS.name) {
            throw new PivotkitError("LIMIT_EXCEEDED", `viewFromLayout: ${where} has ${value.length} characters, more than ${LAYOUT_LIMITS.name}`, { limit: "name", value: value.length, max: LAYOUT_LIMITS.name });
        }
    };
    const list = (key, each) => {
        const value = layout[key];
        if (value === undefined) {
            return;
        }
        expect(Array.isArray(value), `viewFromLayout: ${key} is a list`);
        if (value.length > LAYOUT_LIMITS.entries) {
            throw new PivotkitError("LIMIT_EXCEEDED", `viewFromLayout: ${key} has ${value.length} entries, more than ${LAYOUT_LIMITS.entries}`, { limit: key, value: value.length, max: LAYOUT_LIMITS.entries });
        }
        value.forEach((v, i) => each(v, `${key}[${i}]`));
    };
    const optionalText = (o, key, where) => o[key] === undefined || text(o[key], `${where}.${key}`);
    list("rows", text);
    list("cols", text);
    list("values", (v, where) => {
        expect(isPlainObject(v), `viewFromLayout: ${where} is { field, agg }`);
        optionalText(v, "field", where);
        optionalText(v, "agg", where);
    });
    list("groups", (v, where) => {
        expect(isPlainObject(v), `viewFromLayout: ${where} is { field, by, size }`);
        text(v.field, `${where}.field`);
        text(v.by, `${where}.by`);
        expect(v.size === undefined || typeof v.size === "number", `viewFromLayout: ${where}.size is a number`);
    });
    list("filters", (v, where) => expect(isPlainObject(v), `viewFromLayout: ${where} is a filter object`));
    if (layout.filters !== undefined && JSON.stringify(layout.filters).length > OUTSIDE_LIMITS.json) {
        throw new PivotkitError("LIMIT_EXCEEDED", "viewFromLayout: the filters are larger than a view may be", { limit: "json", max: OUTSIDE_LIMITS.json });
    }
    if (layout.chart !== undefined) {
        text(layout.chart, "chart");
    }
    if (layout.map !== undefined) {
        expect(isPlainObject(layout.map), "viewFromLayout: map is an object { old name: new name }");
        const entries = Object.entries(layout.map);
        if (entries.length > LAYOUT_LIMITS.entries) {
            throw new PivotkitError("LIMIT_EXCEEDED", `viewFromLayout: map has ${entries.length} entries, more than ${LAYOUT_LIMITS.entries}`, { limit: "map", value: entries.length, max: LAYOUT_LIMITS.entries });
        }
        for (const [from, to] of entries) {
            text(from, "a name in map");
            text(to, `map[${JSON.stringify(from.slice(0, 40))}]`);
        }
    }
}

/** A copy of plain JSON (a filter of the layout), so the view never shares an object with it. */
const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * The view a layout describes, over a data set's field description (describeSource's result, its
 * fields, or null: then names are taken as written and no date is grouped on its own). Names match the
 * description case-insensitively and are written in its spelling; a field of `map` is renamed first
 * (renameFields: the layout's name is the data's other name); each grouping gets the name the browser
 * gives it (GROUPING_NAMES in the language of `options.locale`) and takes its field's place on the
 * axes; a date field on an axis without a grouping is grouped by its span (note `dateGrouped`); a value
 * without an aggregator is summed when its field is a number that is no identifier, else counted; a
 * filter is copied as it is; `chart` makes the view show that chart type. The view is raw: normalize()
 * or validate() it against the data. `name` says what it shows ("Sum of Revenue by Region and Date by
 * month"). Throws INVALID_ARGUMENT for a layout of another shape, LIMIT_EXCEEDED beyond LAYOUT_LIMITS.
 * @param {Layout} layout
 * @param {unknown} description
 * @param {{ locale?: string }} [options]
 * @returns {{ view: Record<string, any>, name: string, notes: LayoutNote[] }}
 */
export function viewFromLayout(layout, description, options) {
    options = optionsOf(options, "viewFromLayout");
    checkLayout(layout);
    const fields = fieldsOf(description, "viewFromLayout");
    const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f]));
    const spelled = (name) => byName.get(name.toLowerCase())?.name ?? name;
    /** @type {LayoutNote[]} */
    const notes = [];

    // the groupings: their names, unique against the fields and each other
    const taken = new Set(fields.map((f) => f.name.toLowerCase()));
    const derived = [];
    /** @type {Map<string, string[]>} a field's groupings by the field's lower-case name */
    const groupsOf = new Map();
    const addGroup = (field, by, size) => {
        const base = groupingName(field, by, { locale: options.locale, size });
        let name = base;
        for (let n = 2; taken.has(name.toLowerCase()); n++) {
            name = `${base} ${n}`;
        }
        taken.add(name.toLowerCase());
        derived.push({ name, field, by, ...(size !== undefined ? { size } : {}) });
        groupsOf.set(field.toLowerCase(), [...(groupsOf.get(field.toLowerCase()) ?? []), name]);
        return name;
    };
    for (const g of layout.groups ?? []) {
        addGroup(spelled(g.field), g.by, g.size);
    }
    const derivedNames = new Map(derived.map((d) => [d.name.toLowerCase(), d.name]));
    const used = new Set();
    const axis = (list) =>
        (list ?? []).flatMap((raw) => {
            const own = derivedNames.get(raw.toLowerCase());
            if (own) {
                used.add(own);
                return [own];
            }
            const name = spelled(raw);
            const groups = groupsOf.get(name.toLowerCase());
            if (groups) {
                groups.forEach((g) => used.add(g));
                return groups;
            }
            const f = byName.get(name.toLowerCase());
            const by = f && f.type === "date" ? dateUnitFor(dateMs(f.min), dateMs(f.max)) : null;
            if (by) {
                const group = addGroup(name, by, undefined);
                used.add(group);
                notes.push({ code: "dateGrouped", field: name, message: `${name} is grouped by its span: ${group}` });
                return [group];
            }
            return [name];
        });
    const rows = axis(layout.rows);
    const cols = axis(layout.cols);
    const values = (layout.values ?? []).map((v) => {
        const field = v.field === undefined ? undefined : spelled(v.field);
        const f = field === undefined ? undefined : byName.get(field.toLowerCase());
        const agg = v.agg ?? (f && f.type === "number" && !isIdentifierName(f.name) ? "sum" : "count");
        return field === undefined ? { agg } : { field, agg };
    });
    const filters = (layout.filters ?? []).map((raw) => {
        const f = copy(raw);
        if (typeof f.field === "string") {
            f.field = derivedNames.get(f.field.toLowerCase()) ?? spelled(f.field);
            if (derivedNames.has(f.field.toLowerCase())) {
                used.add(f.field);
            }
        }
        if (isPlainObject(f.by) && typeof f.by.field === "string") {
            f.by.field = spelled(f.by.field);
        }
        return f;
    });
    for (const d of derived) {
        if (!used.has(d.name)) {
            notes.push({ code: "unusedGroup", field: d.field, message: `the grouping ${d.name} is on no axis and in no filter: put ${d.field} on rows or columns` });
        }
    }
    /** @type {Record<string, any>} */
    let view = { version: 2, rows, cols, values, ...(derived.length ? { derived } : {}), ...(filters.length ? { filters } : {}) };
    if (layout.chart !== undefined) {
        view.display = "chart";
        view.chart = { type: layout.chart };
    }
    if (layout.map) {
        const renamed = renameFields(view, layout.map);
        view = renamed.view;
        for (const name of renamed.unused) {
            notes.push({ code: "unusedMap", field: name, message: `the layout names no field ${name}` });
        }
        // the new names in the data's spelling
        view = renameFields(view, Object.fromEntries(Object.values(layout.map).filter((n) => byName.has(n.toLowerCase()) && byName.get(n.toLowerCase()).name !== n).map((n) => [n, spelled(n)]))).view;
    }
    return { view, name: viewName(view, options.locale), notes };
}

/** What a view shows in words: "Sum of Revenue by Region and Date by month". */
function viewName(view, locale) {
    const labels = reportLabels(locale);
    const words = wordsOf(locale);
    const agg = (a) => (Object.hasOwn(labels.aggregators, a) ? labels.aggregators[a] : a);
    const value = (v) => (v.field === undefined ? labels.countRows : labels.valueName.replace("{agg}", () => agg(v.agg)).replace("{field}", () => v.field));
    const values = view.values.length ? view.values.map(value).join(", ") : labels.countRows;
    const axes = [view.rows.join(", "), view.cols.join(", ")].filter(Boolean);
    return axes.length ? `${values} ${words.by} ${axes.join(` ${words.and} `)}` : values;
}
