/*
 * pivotkit-core/templates: a collection of named views, as a host keeps them for its people (shared views) or a
 * person's own (my views). A template is a view file (the "pivotkit-view" envelope, see view-file.js),
 * a template { name, view } or a bare view with a `name`. parseTemplates() reads a collection of them;
 * templatesFromSchema() reads one an OpenAPI document or JSON Schema carries in pivotkit's own
 * extension `x-pivotkit-views` (a convention of pivotkit, not part of OpenAPI or JSON Schema). A
 * separate entry point, like pivotkit-core/link, so a UI loads it only where it reads templates.
 *
 *   import { parseTemplates, templatesFromSchema } from "pivotkit-core/templates";
 *   const { templates, issues } = parseTemplates(await response.json());
 *   const { templates } = templatesFromSchema(openapi, { schema: "Release" });
 *   // templates: [{ name, view, description?, source? }]; each view is still user input
 *
 * A collection is data from anywhere: its text and its number of entries are capped before they are
 * read, every key is read as an own property, names and descriptions are plain text, nothing is run
 * or fetched. Neither function throws for a bad collection: what was left out is in `issues`.
 */

import { VIEW_FILE_LIMITS, fromViewFile } from "./view-file.js";
import { SCHEMA_CAPS, namedSchema, plainText, pointer } from "./schema.js";
import { expect } from "./errors.js";
import { isPlainObject } from "./util.js";

/**
 * The most a collection may hold: `count` templates (the rest is left out), `text` characters of its
 * JSON (a text longer than that is not parsed; entries given as objects are counted as their JSON and
 * read until they reach it).
 */
export const TEMPLATE_LIMITS = Object.freeze({ count: 500, text: 5_000_000 });

/** The name of the extension that holds the templates of an OpenAPI document or a JSON Schema. */
export const TEMPLATES_EXTENSION = "x-pivotkit-views";

/**
 * @typedef {object} TemplateEntry  a template as read: a view with its name
 * @property {string} name  plain text, never empty
 * @property {Record<string, unknown>} view  as parsed, not normalized
 * @property {string} [description]  plain text, when the entry has one
 * @property {import("./view-file.js").ViewFileSource} [source]  the data it was made for, when a view file names it
 * @typedef {{ templates: TemplateEntry[], issues: import("./view.js").Issue[] }} TemplatesRead
 */

/** The JSON length of a value, or -1 when it is no JSON (a cycle, a BigInt). */
function jsonLength(value) {
    try {
        return JSON.stringify(value)?.length ?? 0;
    } catch {
        return -1;
    }
}

/**
 * Reads a collection of templates: a list (or its JSON text) whose entries are view files, templates
 * { name, view } or bare views with a `name`. An entry without a name, without a usable view, or of a
 * newer format or view version is left out with an issue (path `[i]`); names need not be unique.
 * Never throws.
 * @param {unknown} input  the list, or its JSON text
 * @returns {TemplatesRead}
 */
export function parseTemplates(input) {
    /** @type {TemplatesRead} */
    const out = { templates: [], issues: [] };
    const issue = (path, message) => out.issues.push({ path, message });
    let list = input;
    if (typeof input === "string") {
        if (input.length > TEMPLATE_LIMITS.text) {
            issue("", `longer than ${TEMPLATE_LIMITS.text} characters; not read`);
            return out;
        }
        try {
            list = JSON.parse(input);
        } catch {
            issue("", "not valid JSON");
            return out;
        }
    }
    if (!Array.isArray(list)) {
        issue("", "not a list of templates");
        return out;
    }
    if (list.length > TEMPLATE_LIMITS.count) {
        issue("", `${list.length} templates, more than ${TEMPLATE_LIMITS.count}: the first ${TEMPLATE_LIMITS.count} are read`);
    }
    let size = typeof input === "string" ? -Infinity : 0;
    for (let i = 0; i < Math.min(list.length, TEMPLATE_LIMITS.count); i++) {
        const entry = list[i];
        if (size !== -Infinity) {
            const length = jsonLength(entry);
            if (length < 0) {
                issue(`[${i}]`, "not JSON; left out");
                continue;
            }
            size += length;
            if (size > TEMPLATE_LIMITS.text) {
                issue(`[${i}]`, `the templates are longer than ${TEMPLATE_LIMITS.text} characters as JSON; this one and the rest are left out`);
                break;
            }
        }
        const read = fromViewFile(entry);
        if (read.failed || !read.view) {
            issue(`[${i}]`, `${read.issues.at(-1)?.message ?? "no view"}; left out`);
            continue;
        }
        // a bare view names itself; fromViewFile reads the name of an envelope and of { name, view }
        const bare = read.view === entry;
        const name = plainText(bare ? (Object.hasOwn(read.view, "name") ? read.view.name : undefined) : read.name, VIEW_FILE_LIMITS.name);
        if (!name) {
            issue(`[${i}]`, "no name; left out");
            continue;
        }
        const view = { ...read.view };
        if (bare) {
            // the name of a bare view is the template's, not a key of the view
            delete view.name;
        }
        /** @type {TemplateEntry} */
        const template = { name, view };
        const description = plainText(read.description, VIEW_FILE_LIMITS.description);
        if (description) {
            template.description = description;
        }
        if (read.source && Object.keys(read.source).length > 0) {
            template.source = read.source;
        }
        out.templates.push(template);
        read.issues.forEach((x) => issue(`[${i}]${x.path ? `.${x.path}` : ""}`, x.message));
    }
    return out;
}

/** A local `$ref` followed (as far as SCHEMA_CAPS.depth), or the value itself. */
function follow(doc, value, issue, path) {
    let at = value;
    for (let depth = 0; isPlainObject(at) && Object.hasOwn(at, "$ref") && typeof at.$ref === "string"; depth++) {
        const ref = at.$ref;
        if (depth >= SCHEMA_CAPS.depth || !ref.startsWith("#")) {
            issue(path, ref.startsWith("#") ? `$ref nested deeper than ${SCHEMA_CAPS.depth} levels; not read` : `$ref ${ref.slice(0, 200)} is not local; not fetched`);
            return undefined;
        }
        at = pointer(doc, ref);
        if (at === undefined) {
            issue(path, `$ref ${ref.slice(0, 200)} is not in the document`);
        }
    }
    return at;
}

/**
 * The templates an OpenAPI document (or a JSON Schema) carries in its extension `x-pivotkit-views`:
 * a list of view files, templates { name, view } or bare views with a `name`, read by parseTemplates.
 * The extension is read from the schema `options.schema` names (a schema of `components.schemas` or
 * `definitions`, or a local `$ref`), else from the document's root. Only references inside the
 * document are followed; nothing is fetched or run. A document without the extension gives no
 * templates and no issue. Input that is no object, or a schema name the document lacks, throws
 * INVALID_ARGUMENT (as fieldDefaultsFromSchema does); anything else that cannot be read is in `issues`.
 * @param {object} doc
 * @param {{ schema?: string }} [options]
 * @returns {TemplatesRead}
 */
export function templatesFromSchema(doc, options = {}) {
    expect(isPlainObject(doc), "templatesFromSchema: the document must be an object");
    expect(isPlainObject(options), "templatesFromSchema: options must be an object");
    /** @type {import("./view.js").Issue[]} */
    const issues = [];
    const issue = (path, message) => issues.push({ path, message });
    let holder = doc;
    if (options.schema !== undefined) {
        holder = follow(doc, namedSchema(doc, options.schema, "templatesFromSchema"), issue, String(options.schema).slice(0, 200));
        expect(holder !== undefined || issues.length > 0, `templatesFromSchema: no schema ${JSON.stringify(String(options.schema)).slice(0, 80)} in the document`);
    }
    const raw = isPlainObject(holder) && Object.hasOwn(holder, TEMPLATES_EXTENSION) ? follow(doc, holder[TEMPLATES_EXTENSION], issue, TEMPLATES_EXTENSION) : undefined;
    if (raw === undefined) {
        return { templates: [], issues };
    }
    const read = parseTemplates(raw);
    return { templates: read.templates, issues: [...issues, ...read.issues.map((x) => ({ path: `${TEMPLATES_EXTENSION}${x.path.startsWith("[") || !x.path ? "" : "."}${x.path}`, message: x.message }))] };
}
