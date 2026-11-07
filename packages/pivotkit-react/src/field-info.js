/*
 * What a host says about its fields beyond the data (fieldDefaults): a display name (`label`), a
 * description in plain text and a link to more (`href`, https only), and the column type a field is
 * encoded as (`type`). Cleaned by the rules of pivotkit-core's fieldDefaultsFromSchema: texts cut to
 * its caps, control characters gone, a link that is not https dropped. A field without any of these
 * shows exactly as without fieldDefaults. Pure, tested without a DOM.
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
    const clean = fieldDefaultsFromSchema({ properties });
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
 * The display names for pivotkit-core's labels (`labels.fields`), or null when no field has one.
 * @param {Map<string, FieldInfo>} info
 * @returns {Record<string, string> | null}
 */
export function displayNames(info) {
    const out = {};
    for (const [key, entry] of info) {
        if (entry.label) {
            Object.defineProperty(out, key, { value: entry.label, enumerable: true });
        }
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
