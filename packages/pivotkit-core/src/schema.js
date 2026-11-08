/*
 * Field defaults from a schema: the display name, description, type and order of each field of a row,
 * read from a JSON Schema (an object with `properties`) or from an OpenAPI document and the name of
 * one of its schemas. Pure: the schema is data, nothing in it is run or fetched; only references
 * inside the same document (`#/...`) are followed, and every size is capped.
 */

import { expect } from "./errors.js";

/** Caps on what is read from a schema: it may come from anywhere. */
export const SCHEMA_CAPS = Object.freeze({
    /** fields read from one schema */
    fields: 1000,
    /** characters of a display name (`title`) */
    label: 120,
    /** characters of a description */
    description: 1000,
    /** entries of an `enum`, the order of a field's items */
    order: 1000,
    /** characters of a link */
    href: 2000,
    /** `$ref` and `allOf` levels followed before giving up */
    depth: 32,
    /** schema objects resolved in one call, however they nest: a document cannot ask for unbounded work */
    steps: 20000
});

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => (isObject(o) && Object.hasOwn(o, k) ? o[k] : undefined);
/** A copy of a schema object without some of its keywords. */
const without = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/**
 * Plain text of at most `max` characters: control characters become spaces, bidi controls and
 * zero-width characters go, runs of spaces one space, the ends trimmed; a longer text is cut and ends with "…". Undefined for anything else.
 * @param {unknown} value
 * @param {number} max
 * @returns {string | undefined}
 */
export function plainText(value, max) {
    if (typeof value !== "string") {
        return undefined;
    }
    const text = value
        .slice(0, max * 4)
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
        // bidi controls and zero-width characters: they can make a text read as another one
        .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) {
        return undefined;
    }
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * The link of a "Learn more": an absolute https URL, else undefined.
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function safeHref(value) {
    if (typeof value !== "string" || value.length > SCHEMA_CAPS.href) {
        return undefined;
    }
    try {
        const url = new URL(value.trim());
        return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The value a local JSON pointer ("#/components/schemas/Release") points to in `root`, or undefined.
 * @param {object} root
 * @param {string} ref
 */
export function pointer(root, ref) {
    if (typeof ref !== "string" || !ref.startsWith("#")) {
        return undefined;
    }
    const tokens = ref.slice(1).split("/").slice(1).map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
    let at = /** @type {unknown} */ (root);
    for (const token of tokens) {
        at = Array.isArray(at) && /^\d+$/.test(token) ? at[Number(token)] : own(at, token);
        if (at === undefined) {
            return undefined;
        }
    }
    return at;
}

/** A `$ref` whose target is being resolved: met again, it is a cycle. */
const RESOLVING = Symbol("resolving");

/**
 * @typedef {{ root: object, steps: number, refs: Map<string, any>, issues: Array<{ path: string, message: string }>, said: Set<string> }} Context
 *   the document, the schema objects left to read, the resolved `$ref` targets (each read once), what
 *   could not be read
 */

/** Notes an issue once per kind and path. @param {Context} ctx */
function note(ctx, path, message, kind = message) {
    const key = `${kind}:${path}`;
    if (!ctx.said.has(key) && ctx.issues.length < 100) {
        ctx.said.add(key);
        ctx.issues.push({ path, message });
    }
}

/**
 * A schema with its local `$ref`s followed and its `allOf` parts merged (their `properties` together),
 * and a nullable `anyOf`/`oneOf` (one schema and "null") read as that one schema. A `$ref` target is
 * resolved once and reused, so a large document that refers to the same schemas many times stays
 * cheap; a reference cycle and the caps end it, with an issue.
 * @param {Context} ctx
 * @param {unknown} schema
 * @param {string} path  where the schema is, for issues
 * @param {number} [depth]
 * @returns {Record<string, any> | undefined}
 */
function resolve(ctx, schema, path, depth = 0) {
    if (!isObject(schema)) {
        return undefined;
    }
    if (depth > SCHEMA_CAPS.depth) {
        note(ctx, path, `nested deeper than ${SCHEMA_CAPS.depth} levels; not read`, "depth");
        return undefined;
    }
    if (ctx.steps <= 0) {
        note(ctx, "", `stopped after ${SCHEMA_CAPS.steps} schema objects; the rest is not read`, "steps");
        return undefined;
    }
    ctx.steps -= 1;
    let s = /** @type {Record<string, any>} */ (schema);
    const ref = own(s, "$ref");
    if (typeof ref === "string") {
        let target = ctx.refs.get(ref);
        if (target === RESOLVING) {
            note(ctx, path, `$ref ${ref.slice(0, 200)} refers to itself; not read`);
            return undefined;
        }
        if (!ctx.refs.has(ref)) {
            const raw = pointer(ctx.root, ref);
            if (raw === undefined) {
                note(ctx, path, ref.startsWith("#") ? `$ref ${ref.slice(0, 200)} is not in the document` : `$ref ${ref.slice(0, 200)} is not local; not fetched`);
            }
            ctx.refs.set(ref, RESOLVING);
            target = resolve(ctx, raw, ref.slice(0, 200), depth + 1);
            ctx.refs.set(ref, target);
        }
        if (!target) {
            return undefined;
        }
        // keywords next to a $ref (OpenAPI 3.1: a description of this use) win over the target's
        s = { ...target, ...without(s, "$ref") };
    }
    const allOf = own(s, "allOf");
    if (Array.isArray(allOf)) {
        const parts = allOf.slice(0, SCHEMA_CAPS.fields).map((p, i) => resolve(ctx, p, `${path}.allOf[${i}]`, depth + 1)).filter(Boolean);
        const properties = {};
        for (const p of [...parts, s]) {
            const props = own(p, "properties");
            if (isObject(props)) {
                for (const k of Object.keys(props)) {
                    Object.defineProperty(properties, k, { value: props[k], enumerable: true, writable: true, configurable: true });
                }
            }
        }
        const merged = parts.reduce((acc, p) => ({ ...acc, ...without(p, "properties") }), {});
        s = { ...merged, ...without(s, "allOf"), properties };
    }
    for (const key of ["anyOf", "oneOf"]) {
        const list = own(s, key);
        if (Array.isArray(list)) {
            const options = list.slice(0, SCHEMA_CAPS.fields).map((p, i) => resolve(ctx, p, `${path}.${key}[${i}]`, depth + 1)).filter((p) => p && own(p, "type") !== "null");
            if (options.length === 1) {
                s = { ...options[0], ...without(s, key) };
            }
        }
    }
    return s;
}

/** The type of a schema without "null": "integer" from ["integer", "null"]. */
function typeOf(s) {
    const t = own(s, "type");
    const list = Array.isArray(t) ? t.filter((x) => x !== "null") : [t];
    return list.length === 1 && typeof list[0] === "string" ? list[0] : undefined;
}

/**
 * The schema `name` names in an OpenAPI (or Swagger) document: a schema of `components.schemas` (or
 * `definitions`), or a local `$ref` ("#/components/schemas/Release"); undefined when there is none.
 * @param {object} doc
 * @param {unknown} name
 * @param {string} [caller]  the function named in the error
 */
export function namedSchema(doc, name, caller = "fieldDefaultsFromSchema") {
    expect(typeof name === "string" && name.trim() !== "", `${caller}: an OpenAPI document needs options.schema, the name of a schema or a local $ref`);
    if (name.startsWith("#")) {
        return pointer(doc, name);
    }
    return own(own(own(doc, "components"), "schemas"), name) ?? own(own(doc, "definitions"), name);
}

/**
 * @typedef {object} SchemaFieldDefaults  what a schema says about one field (the shape of
 *   pivotkit-react's fieldDefaults entries)
 * @property {string} [label]  the display name, from `title`
 * @property {string} [description]  plain text, from `description`
 * @property {string} [href]  an https link to more, from `externalDocs.url`
 * @property {"number" | "date"} [type]  from `type` integer or number, and `format` date or date-time
 * @property {Array<string | number | boolean | null>} [order]  the field's items in the order of its `enum`
 */

/**
 * The defaults of every field of a row from its schema: a JSON Schema of the row (an object with
 * `properties`, or an array of such rows), or an OpenAPI 3 / Swagger 2 document with `options.schema`,
 * the name of a schema in `components.schemas` (or `definitions`) or a local `$ref` ("#/components/
 * schemas/Release"). Read per property: `title` (label), `description`, `externalDocs.url` (an https
 * link), `type` and `format` (number or date), `enum` (order). Only references inside the document
 * are followed, each `$ref` target is read once; nothing is fetched or run. Texts are cut to
 * SCHEMA_CAPS. A property without any of these is left out. Like normalize(), a schema it cannot read
 * all of does not throw: `issues` says what was left out (a reference that is not in the document or
 * not local, a cycle, the caps); input that is no schema at all throws INVALID_ARGUMENT.
 * @param {object} schema
 * @param {{ schema?: string }} [options]
 * @returns {{ defaults: Record<string, SchemaFieldDefaults>, issues: Array<{ path: string, message: string }> }}
 */
export function fieldDefaultsFromSchema(schema, options = {}) {
    expect(isObject(schema), "fieldDefaultsFromSchema: the schema must be an object");
    expect(isObject(options), "fieldDefaultsFromSchema: options must be an object");
    const doc = /** @type {Record<string, any>} */ (schema);
    const isDocument = own(doc, "openapi") !== undefined || own(doc, "swagger") !== undefined;
    /** @type {Context} */
    const ctx = { root: doc, steps: SCHEMA_CAPS.steps, refs: new Map(), issues: [], said: new Set() };
    let row = resolve(ctx, isDocument || options.schema !== undefined ? namedSchema(doc, options.schema) : doc, "");
    expect(row, `fieldDefaultsFromSchema: no schema ${JSON.stringify(String(options.schema ?? "")).slice(0, 80)} in the document`);
    if (typeOf(row) === "array") {
        row = resolve(ctx, own(row, "items"), "items");
    }
    const properties = own(row, "properties");
    expect(isObject(properties), "fieldDefaultsFromSchema: the schema of a row must have properties");
    /** @type {Record<string, SchemaFieldDefaults>} */
    const out = {};
    const names = Object.keys(properties);
    if (names.length > SCHEMA_CAPS.fields) {
        note(ctx, "properties", `${names.length} fields, more than ${SCHEMA_CAPS.fields}: the first ${SCHEMA_CAPS.fields} are read`);
    }
    for (const name of names.slice(0, SCHEMA_CAPS.fields)) {
        const p = resolve(ctx, properties[name], `properties.${name.slice(0, 200)}`);
        if (!p) {
            continue;
        }
        /** @type {SchemaFieldDefaults} */
        const entry = {};
        const label = plainText(own(p, "title"), SCHEMA_CAPS.label);
        if (label) {
            entry.label = label;
        }
        const description = plainText(own(p, "description"), SCHEMA_CAPS.description);
        if (description) {
            entry.description = description;
        }
        const href = safeHref(own(own(p, "externalDocs"), "url"));
        if (href) {
            entry.href = href;
        }
        const type = typeOf(p);
        const format = own(p, "format");
        if (type === "integer" || type === "number") {
            entry.type = "number";
        } else if (type === "string" && (format === "date" || format === "date-time")) {
            entry.type = "date";
        }
        const list = own(p, "enum");
        if (Array.isArray(list)) {
            const order = list.slice(0, SCHEMA_CAPS.order).filter((v) => v === null || ["string", "number", "boolean"].includes(typeof v));
            if (order.length > 0) {
                entry.order = order;
            }
        }
        if (Object.keys(entry).length > 0) {
            // a property named "__proto__" is a field like any other
            Object.defineProperty(out, name, { value: entry, enumerable: true, writable: true, configurable: true });
        }
    }
    return { defaults: out, issues: ctx.issues };
}
