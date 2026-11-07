/*
 * The view file: a view with what a person and another pivotkit need to know about it, as one JSON
 * document ("pivotkit-view", format version 1). A file, the JSON a person copies and a link all carry
 * it; the schema is published at VIEW_FILE_SCHEMA (docs/schema/view-file-1.json).
 *
 *   const file = toViewFile(view, { name: "Revenue by region", source: { id: "sales" }, data });
 *   const text = viewFileText(file);                  // canonical JSON, 2-space indent, trailing newline
 *   const read = fromViewFile(text, { data, sourceId: "sales" });
 *   // read.view: the view (not normalized), read.failed: why nothing can be used, read.compatible: ...
 *
 * Reading follows these rules: unknown keys are ignored (a later minor version may add some); a
 * document is an envelope when its `format` is "pivotkit-view", else it is a bare view (or a template
 * { name, view }); a newer `formatVersion` or a newer `view.version` is refused, never read as an older
 * one; the text is capped before it is parsed; every key is read as an own property; names and
 * descriptions are plain text. The view in the result is still user input: normalize() it against the
 * data before it is shown.
 */

import { VIEW_VERSION } from "./view.js";
import { isPlainObject } from "./util.js";

/** The value of `format` that marks an envelope. */
export const VIEW_FILE_FORMAT = "pivotkit-view";
/** The format version this package writes and reads; a newer one is refused. */
export const VIEW_FILE_VERSION = 1;
/**
 * Where the JSON Schema of format version 1 is published; the same file ships in this package as
 * "pivotkit-core/schema/view-file-1.json". A file names it in `$schema` (toViewFile's `schemaUrl`).
 */
export const VIEW_FILE_SCHEMA = "https://pivotkit.eize.dev/schema/view-file-1.json";

/**
 * The most a view file may hold: `text` characters before it is parsed, `name` characters of a name,
 * an id or a source name, `description` characters of a description, `fields` entries of source.fields.
 */
export const VIEW_FILE_LIMITS = Object.freeze({ text: 1_000_000, name: 256, description: 2_000, fields: 1_000 });

/** The types a field of source.fields can have (pivotkit-core's column types). */
const FIELD_TYPES = Object.freeze(["string", "number", "date", "boolean", "null"]);

/**
 * @typedef {{ id?: string, name?: string, fields?: Array<{ name: string, type: string }> }} ViewFileSource
 * @typedef {object} ViewFileMeta
 * @property {string} [name]  what the view shows ("Revenue by region"); default ""
 * @property {string} [description]  left out when empty
 * @property {string | Date} [createdAt]  when it was made; left out without it (a file that does not change on every export)
 * @property {{ name: string, version: string }} [generator]  the program that wrote it
 * @property {{ id?: string, name?: string }} [source]  the data the view was made for
 * @property {import("./encode.js").Encoded} [data]  the data: source.fields lists the fields the view uses with their types
 * @property {string | null} [schemaUrl]  the `$schema` written: VIEW_FILE_SCHEMA by default, a host's own
 *   copy of the schema, or null (or "") to leave `$schema` out. Reading never depends on it
 * @typedef {object} ViewFileRead
 * @property {Record<string, unknown> | null} view  the view as parsed, not normalized; null when nothing can be used
 * @property {boolean} envelope  the document was a view file, not a bare view
 * @property {string} name
 * @property {string} description
 * @property {string | null} createdAt
 * @property {{ name: string, version: string } | null} generator
 * @property {ViewFileSource | null} source
 * @property {null | "empty" | "tooLarge" | "notJson" | "notView" | "newerFormat" | "newerView"} failed  why nothing can be used
 * @property {import("./view.js").Issue[]} issues  what was left out of the envelope (not of the view: normalize() says that)
 * @property {ViewFileCompatibility} [compatible]  with `options.data`: how the view fits that data
 * @typedef {object} ViewFileCompatibility
 * @property {boolean} ok  same source (or none named) and every field there with its type
 * @property {"same" | "other" | "unknown"} source  "unknown" when the file or the caller names no source id
 * @property {string[]} missing  fields the view uses that the data does not have
 * @property {Array<{ name: string, type: string, dataType: string }>} changed  fields with another type in the data
 * @property {string[]} needs  every field the view uses
 */

/** Plain text of at most `max` characters: control characters become spaces, ends trimmed. */
function plainText(value, max) {
    if (typeof value !== "string") {
        return "";
    }
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, max);
}

/** An own property of a plain object, else undefined. */
const own = (obj, key) => (isPlainObject(obj) && Object.hasOwn(obj, key) ? obj[key] : undefined);

/**
 * The names of the data's fields a view uses, in the order they appear: rows, columns, values,
 * filters, sort (with the values a sort, a top N or a value condition goes by). A grouping (derived
 * field) counts as its source field. Names as the view writes them, each once (case-insensitive).
 * @param {unknown} view  a view, normalized or not
 * @returns {string[]}
 */
export function viewFileFields(view) {
    const derived = new Map();
    const list = (key) => {
        const v = own(view, key);
        return Array.isArray(v) ? v : [];
    };
    for (const d of list("derived")) {
        const name = own(d, "name");
        const field = own(d, "field");
        if (typeof name === "string" && typeof field === "string") {
            derived.set(name.toLowerCase(), field);
        }
    }
    const out = [];
    const seen = new Set();
    const add = (name) => {
        if (typeof name !== "string" || name === "") {
            return;
        }
        const source = derived.get(name.toLowerCase()) ?? name;
        if (!seen.has(source.toLowerCase())) {
            seen.add(source.toLowerCase());
            out.push(source);
        }
    };
    const ref = (r) => add(own(r, "field"));
    list("rows").forEach(add);
    list("cols").forEach(add);
    list("values").forEach(ref);
    for (const f of list("filters")) {
        add(own(f, "field"));
        ref(own(f, "by"));
    }
    for (const s of list("sort")) {
        add(own(s, "field"));
        ref(own(s, "value"));
    }
    return out;
}

/** The schema fields of an Encoded (or of anything with schema.fields), by lower-case name. */
function fieldsOf(data) {
    const fields = data && data.schema && Array.isArray(data.schema.fields) ? data.schema.fields : [];
    return new Map(fields.filter((f) => f && typeof f.name === "string").map((f) => [f.name.toLowerCase(), f]));
}

/**
 * A view as a view file (an object; viewFileText() writes it). Keys in their canonical order:
 * $schema (unless `meta.schemaUrl` is null), format, formatVersion, name, description (only when not empty), createdAt (only when
 * given), generator (when given), source, extensions, view. `options.link` gives the profile a link
 * carries: format, formatVersion, source.id, name (when not empty) and view; nothing that grows with
 * the data (fields) or changes on every export (createdAt).
 * @param {object} view  the view (normalized: it is written as it is)
 * @param {ViewFileMeta} [meta]
 * @param {{ link?: boolean }} [options]
 * @returns {Record<string, unknown>}
 */
export function toViewFile(view, meta = {}, options = {}) {
    if (!isPlainObject(view)) {
        throw new TypeError("toViewFile(view): view must be an object");
    }
    const name = plainText(meta.name, VIEW_FILE_LIMITS.name);
    const sourceId = plainText(meta.source?.id, VIEW_FILE_LIMITS.name);
    if (options.link) {
        return {
            format: VIEW_FILE_FORMAT,
            formatVersion: VIEW_FILE_VERSION,
            ...(sourceId ? { source: { id: sourceId } } : {}),
            ...(name ? { name } : {}),
            view
        };
    }
    const description = plainText(meta.description, VIEW_FILE_LIMITS.description);
    const when = meta.createdAt instanceof Date ? meta.createdAt : typeof meta.createdAt === "string" && meta.createdAt ? new Date(meta.createdAt) : null;
    const created = when && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
    const generator = meta.generator && typeof meta.generator.name === "string" ? { name: plainText(meta.generator.name, VIEW_FILE_LIMITS.name), version: plainText(meta.generator.version, VIEW_FILE_LIMITS.name) } : null;
    const sourceName = plainText(meta.source?.name, VIEW_FILE_LIMITS.name);
    const schema = meta.schemaUrl === undefined ? VIEW_FILE_SCHEMA : typeof meta.schemaUrl === "string" ? meta.schemaUrl.trim() : "";
    const known = fieldsOf(meta.data);
    const fields = meta.data
        ? viewFileFields(view)
              .map((f) => known.get(f.toLowerCase()))
              .filter(Boolean)
              .map((f) => ({ name: f.name, type: typeof f.type === "string" ? f.type : "string" }))
        : null;
    return {
        ...(schema ? { $schema: schema } : {}),
        format: VIEW_FILE_FORMAT,
        formatVersion: VIEW_FILE_VERSION,
        name,
        ...(description ? { description } : {}),
        ...(created ? { createdAt: created } : {}),
        ...(generator ? { generator } : {}),
        source: { ...(sourceId ? { id: sourceId } : {}), ...(sourceName ? { name: sourceName } : {}), ...(fields ? { fields } : {}) },
        extensions: {},
        view
    };
}

/**
 * The text of a view file: JSON with a 2-space indent and a trailing newline, in the key order
 * toViewFile() gives (so two exports of the same view without createdAt are the same bytes).
 * @param {Record<string, unknown>} file
 */
export function viewFileText(file) {
    return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * The suggested file name of a view file: "<slug>.pivotkit.json" ("Revenue by region" ->
 * "revenue-by-region.pivotkit.json"), "view.pivotkit.json" when no letter or digit is left.
 * @param {unknown} name
 */
export function viewFileName(name) {
    const slug = (typeof name === "string" ? name : "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
        .replace(/-+$/, "");
    return `${slug || "view"}.pivotkit.json`;
}

/**
 * Reads a view file, a bare view or a template ({ name, view }) from its text or its parsed object.
 * Never throws. With `options.data` it also says how the view fits that data (`compatible`): the
 * same source (by `options.sourceId`), and every field it uses there with the same type.
 * @param {unknown} input  the text, or the parsed JSON
 * @param {{ data?: import("./encode.js").Encoded, sourceId?: string }} [options]
 * @returns {ViewFileRead}
 */
export function fromViewFile(input, options = {}) {
    /** @type {ViewFileRead} */
    const read = { view: null, envelope: false, name: "", description: "", createdAt: null, generator: null, source: null, failed: null, issues: [] };
    const fail = (failed, message) => ({ ...read, failed, issues: [...read.issues, { path: "", message }] });
    let doc = input;
    if (typeof input === "string") {
        if (input.trim() === "") {
            return fail("empty", "empty text");
        }
        if (input.length > VIEW_FILE_LIMITS.text) {
            return fail("tooLarge", `longer than ${VIEW_FILE_LIMITS.text} characters`);
        }
        try {
            doc = JSON.parse(input);
        } catch {
            return fail("notJson", "not valid JSON");
        }
    }
    if (!isPlainObject(doc)) {
        return fail("notView", "not a JSON object");
    }
    const issue = (path, message) => read.issues.push({ path, message });
    let view;
    if (own(doc, "format") === VIEW_FILE_FORMAT) {
        read.envelope = true;
        // an integer; anything else that is not missing is refused, never read as version 1: a newer
        // or unknown version (2, 2.5, "2") could mean what version 1 does not
        const version = own(doc, "formatVersion");
        if (version === undefined || version === null) {
            issue("formatVersion", `missing; read as ${VIEW_FILE_VERSION}`);
        } else if (version !== VIEW_FILE_VERSION) {
            const n = typeof version === "number" ? version : typeof version === "string" && version.trim() !== "" ? Number(version) : NaN;
            return n > VIEW_FILE_VERSION
                ? fail("newerFormat", `format version ${JSON.stringify(version)} is newer than ${VIEW_FILE_VERSION}`)
                : fail("notView", `format version ${JSON.stringify(version)} is not ${VIEW_FILE_VERSION}`);
        }
        view = own(doc, "view");
        read.name = plainText(own(doc, "name"), VIEW_FILE_LIMITS.name);
        read.description = plainText(own(doc, "description"), VIEW_FILE_LIMITS.description);
        const created = own(doc, "createdAt");
        read.createdAt = typeof created === "string" && !Number.isNaN(Date.parse(created)) ? created.slice(0, 64) : null;
        if (created !== undefined && read.createdAt === null) {
            issue("createdAt", "not a date and time");
        }
        const generator = own(doc, "generator");
        if (isPlainObject(generator) && typeof own(generator, "name") === "string") {
            read.generator = { name: plainText(own(generator, "name"), VIEW_FILE_LIMITS.name), version: plainText(own(generator, "version"), VIEW_FILE_LIMITS.name) };
        }
        read.source = readSource(own(doc, "source"), issue);
    } else {
        // a bare view, or a template { name, view }
        const inner = own(doc, "view");
        if (isPlainObject(inner) && typeof own(doc, "name") === "string") {
            view = inner;
            read.name = plainText(own(doc, "name"), VIEW_FILE_LIMITS.name);
        } else {
            view = doc;
        }
    }
    if (!isPlainObject(view)) {
        return fail("notView", "no view object");
    }
    const viewVersion = own(view, "version");
    if (typeof viewVersion === "number" && viewVersion > VIEW_VERSION) {
        return fail("newerView", `view version ${viewVersion} is newer than ${VIEW_VERSION}`);
    }
    read.view = /** @type {Record<string, unknown>} */ (view);
    if (options.data) {
        read.compatible = compatibility(read, options.data, options.sourceId);
    }
    return read;
}

/** The source of an envelope: id, name and fields as plain text, the rest left out with an issue. */
function readSource(raw, issue) {
    if (raw === undefined) {
        return null;
    }
    if (!isPlainObject(raw)) {
        issue("source", "not an object");
        return null;
    }
    /** @type {ViewFileSource} */
    const source = {};
    const id = plainText(own(raw, "id"), VIEW_FILE_LIMITS.name);
    const name = plainText(own(raw, "name"), VIEW_FILE_LIMITS.name);
    if (id) {
        source.id = id;
    }
    if (name) {
        source.name = name;
    }
    const fields = own(raw, "fields");
    if (fields !== undefined) {
        if (!Array.isArray(fields)) {
            issue("source.fields", "not a list");
        } else {
            if (fields.length > VIEW_FILE_LIMITS.fields) {
                issue("source.fields", `more than ${VIEW_FILE_LIMITS.fields} fields; the rest left out`);
            }
            source.fields = [];
            fields.slice(0, VIEW_FILE_LIMITS.fields).forEach((f, i) => {
                const fieldName = plainText(own(f, "name"), VIEW_FILE_LIMITS.name);
                const type = own(f, "type");
                if (!fieldName) {
                    issue(`source.fields[${i}]`, "no name");
                } else if (!FIELD_TYPES.includes(type)) {
                    issue(`source.fields[${i}].type`, `unknown type ${JSON.stringify(type)}`);
                    source.fields?.push({ name: fieldName, type: "string" });
                } else {
                    source.fields?.push({ name: fieldName, type });
                }
            });
        }
    }
    return source;
}

/**
 * How a read view fits the data: the same source, its fields there with their types.
 * @returns {ViewFileCompatibility}
 */
function compatibility(read, data, sourceId) {
    const known = fieldsOf(data);
    const listed = read.source?.fields;
    const needs = viewFileFields(read.view);
    const missing = needs.filter((n) => !known.has(n.toLowerCase()));
    const changed = (listed ?? [])
        .filter((f) => known.has(f.name.toLowerCase()) && known.get(f.name.toLowerCase()).type !== f.type)
        .map((f) => ({ name: f.name, type: f.type, dataType: String(known.get(f.name.toLowerCase()).type) }));
    const fileId = read.source?.id;
    /** @type {"same" | "other" | "unknown"} */
    const same = typeof sourceId === "string" && sourceId && fileId ? (fileId === sourceId ? "same" : "other") : "unknown";
    return { ok: same !== "other" && missing.length === 0 && changed.length === 0, source: same, missing, changed, needs };
}
