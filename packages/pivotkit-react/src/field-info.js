/*
 * What a host says about its fields beyond the data (fieldDefaults): a display name (`label`), a
 * description in plain text and a link to more (`href`, https only), and the column type a field is
 * encoded as (`type`). Cleaned by the rules of pivotkit-core's fieldDefaultsFromSchema: texts cut to
 * its caps, control characters gone, a link that is not https dropped. A field without any of these
 * shows exactly as without fieldDefaults. And the one rule for a field the host says nothing about
 * that is an identifier (fieldDefaultsFor): counted, shown as it is. Pure, tested without a DOM.
 */

import { fieldDefaultsFromSchema } from "pivotkit-core";

/** @typedef {{ label?: string, description?: string, href?: string }} FieldInfo */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => (isObject(o) && Object.hasOwn(o, k) ? o[k] : undefined);

/** The column types a host may name for encode (pivotkit-core's `types` option). */
const TYPES = Object.freeze(["string", "number", "date", "boolean"]);

/**
 * Every field's label, description and link, by lower-case name (matched case-insensitively, like
 * column names). Empty without fieldDefaults.
 * @param {unknown} fieldDefaults
 * @returns {Map<string, FieldInfo>}
 */
export function fieldInfoOf(fieldDefaults) {
    /** @type {Map<string, FieldInfo>} */
    const map = new Map();
    if (!isObject(fieldDefaults)) {
        return map;
    }
    // the host's entries as the schema they would be: one set of rules for both ways in
    const properties = {};
    for (const name of Object.keys(/** @type {object} */ (fieldDefaults))) {
        const d = own(fieldDefaults, name);
        const title = own(d, "label");
        const description = own(d, "description");
        const href = own(d, "href");
        if (title !== undefined || description !== undefined || href !== undefined) {
            Object.defineProperty(properties, name, { value: { title, description, externalDocs: { url: href } }, enumerable: true });
        }
    }
    if (Object.keys(properties).length === 0) {
        return map;
    }
    const clean = fieldDefaultsFromSchema({ properties }).defaults;
    for (const name of Object.keys(clean)) {
        const { label, description, href } = clean[name];
        const info = {};
        if (label) {
            info.label = label;
        }
        if (description) {
            info.description = description;
            // a link belongs to a description: alone it would be a "Learn more" about nothing
            if (href) {
                info.href = href;
            }
        }
        if (Object.keys(info).length) {
            map.set(name.toLowerCase(), info);
        }
    }
    return map;
}

/**
 * The display names for pivotkit-core's labels (`labels.fields`), or null when no field has one. A
 * label that two fields share, or that is another field's own name, gets the field's name in
 * parentheses ("Name (product_name)"), so no two fields look the same anywhere.
 * @param {Map<string, FieldInfo>} info
 * @param {readonly string[]} [fieldNames]  the data's column names, in their own spelling
 * @returns {Record<string, string> | null}
 */
export function displayNames(info, fieldNames = []) {
    const spelling = new Map(fieldNames.map((n) => [String(n).toLowerCase(), String(n)]));
    const uses = new Map();
    for (const entry of info.values()) {
        if (entry.label) {
            const l = entry.label.toLowerCase();
            uses.set(l, (uses.get(l) ?? 0) + 1);
        }
    }
    const out = {};
    for (const [key, entry] of info) {
        if (!entry.label) {
            continue;
        }
        const l = entry.label.toLowerCase();
        const clash = uses.get(l) > 1 || (spelling.has(l) && l !== key);
        const value = clash ? `${entry.label} (${spelling.get(key) ?? key})` : entry.label;
        Object.defineProperty(out, key, { value, enumerable: true });
    }
    return Object.keys(out).length ? out : null;
}

/**
 * The column types a host named (fieldDefaults[field].type), for encode's `types`; null without any.
 * @param {unknown} fieldDefaults
 * @returns {Record<string, string> | null}
 */
export function typesOf(fieldDefaults) {
    if (!isObject(fieldDefaults)) {
        return null;
    }
    const out = {};
    for (const name of Object.keys(/** @type {object} */ (fieldDefaults))) {
        const type = own(own(fieldDefaults, name), "type");
        if (typeof type === "string" && TYPES.includes(type)) {
            Object.defineProperty(out, name, { value: type, enumerable: true });
        }
    }
    return Object.keys(out).length ? out : null;
}

/**
 * Whether a field matches the search of the field list: its name, its display name or its description.
 * @param {string} field
 * @param {string} query  lower case, trimmed
 * @param {FieldInfo | undefined} info
 */
export function fieldMatches(field, query, info) {
    if (!query) {
        return true;
    }
    return [field, info?.label, info?.description].some((t) => typeof t === "string" && t.toLowerCase().includes(query));
}

/** The last word of a field's name that makes a number field an identifier ("ID", "Order No", "asset_nr", "Serial #"). */
const IDENTIFIER_WORDS = Object.freeze(["id", "nr", "no", "number", "key", "#"]);

/**
 * Whether a field's name says it is an identifier: its last word is ID, Nr, No, Number, Key or "#",
 * in any case. Words are split at a space, "_", "-", ".", "/", ":", a change from a small letter to
 * a capital ("CustomerId", "CustomerID") and from a letter to a digit; a "#" is a word of its own
 * ("Serial#" as "Serial #"). Before the last word is read, a part in parentheses at the end ("ID
 * (Asset)") and digits at the end ("userID2") are left out. "Paid", "PAID" and "UUID" are one word,
 * not one ending in "id"; "Number of items" ends in "items".
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

/** isIdentifier's answer per column: a column's values do not change, its dictionary is read once. */
const identifierColumns = new WeakMap();

/**
 * Whether a column is an identifier: a number column of whole numbers whose name says so
 * (isIdentifierName). That every value is another is no sign: a count per row is too.
 * @param {{ name: string, type: string, dict: ArrayLike<unknown>, derived?: boolean } | undefined} column
 */
export function isIdentifier(column) {
    if (!column || column.type !== "number" || column.derived || !isIdentifierName(column.name)) {
        return false;
    }
    const known = identifierColumns.get(column);
    if (known !== undefined) {
        return known;
    }
    let whole = true;
    for (let i = 0; i < column.dict.length && whole; i++) {
        whole = Number.isInteger(column.dict[i]);
    }
    identifierColumns.set(column, whole);
    return whole;
}

/**
 * The settings of a field: the host's (fieldDefaults, matched case-insensitively like column names),
 * and for an identifier the host says nothing about how to count or show (no `agg`, `format` or
 * `drillFormat`): counted when it is added as a value, and its numbers shown as they are in the
 * drill-down (27000, not 27,000). A host overrides it with any of the three.
 * @param {unknown} fieldDefaults
 * @param {string} field
 * @param {Parameters<typeof isIdentifier>[0]} column  the field's column (encoded.column(field))
 * @returns {import("./index.js").FieldDefaults | undefined}
 */
export function fieldDefaultsFor(fieldDefaults, field, column) {
    const key = isObject(fieldDefaults) ? Object.keys(/** @type {object} */ (fieldDefaults)).find((k) => k.toLowerCase() === String(field).toLowerCase()) : undefined;
    const host = key === undefined ? undefined : own(fieldDefaults, key);
    const set = ["agg", "format", "drillFormat"].some((k) => own(host, k) !== undefined);
    if (set || !isIdentifier(column)) {
        return isObject(host) ? host : undefined;
    }
    return { ...(isObject(host) ? host : {}), agg: "count", drillFormat: "text" };
}
