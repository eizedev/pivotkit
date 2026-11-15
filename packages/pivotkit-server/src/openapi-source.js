/*
 * The command `pivotkit-server source-from-openapi`: one GET operation of an operator's OpenAPI
 * document (3.0 or 3.1, JSON) proposed as an HTTP source block (docs/reference/sources.md). The
 * operator reviews and edits the result; the server never imports this module.
 *
 *   readDocument(text)                       the document parsed, after the size, YAML and nesting checks
 *   sourceFromOpenApi(doc, { operation, id, backend })   the block, the notes and the texts to review
 *   sourceFromOpenApiCommand(argv, io)       the command: reads a file or an https:// URL, prints
 *
 * The document is third-party input and treated as hostile:
 * - at most OPENAPI_LIMITS.bytes, JSON only, nesting checked before JSON.parse;
 * - only local references ("#/..."), resolved lazily along the operation, its parameters, its
 *   answer and the row's properties, with own-property reads, a chain limit and one node budget for
 *   the whole run; a remote or file: reference is never fetched;
 * - no address from the document is copied as a value: the backend's url and a token url are TODO
 *   values that name what the document says, and config validation refuses a TODO
 *   (options/base.js todoPaths);
 * - a parameter's pattern is never copied (the safe default charset of sources/params.js applies);
 * - descriptions lose control and bidi characters, are capped and are listed for review, because the
 *   model reads them;
 * - the result is built as data and written with JSON.stringify; every text printed on stderr is
 *   cleaned the same way, so a document cannot write terminal escapes.
 * The block is checked with the server's own validators (declaredProblems, compileTemplate) while it
 * is built, so what comes out passes validateOptions once its TODO values are filled in.
 */

import { open } from "node:fs/promises";
import { SOURCE_ID } from "pivotkit-cli/rest";
import { FIELD_DESCRIPTION_MAX, TODO_MARK, todoPaths } from "./options/base.js";
import { SECRET_NAME } from "./options/http.js";
import { GuardedFetchError, guardedFetch } from "./sources/fetch.js";
import { PARAM_LIMITS, PARAM_NAME, PARAM_TYPES, declaredProblems } from "./sources/params.js";
import { compileTemplate } from "./sources/template.js";

/**
 * The bounds on a document: 5 MiB, 10 s for a URL, nesting of the JSON text, a chain of references,
 * allOf within allOf, the nodes the whole run may visit, the fields taken from a row, the length of a source's title.
 */
export const OPENAPI_LIMITS = Object.freeze({ bytes: 5_242_880, timeMs: 10_000, nesting: 128, refChain: 32, allOfDepth: 8, nodes: 100_000, fields: 500, title: 200 });

/** The methods of a path item (OpenAPI 3.0 and 3.1). */
const METHODS = Object.freeze(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

/** Names that are no plain key of an object in JavaScript; a document's name like these is skipped. */
const UNSAFE_NAMES = new Set(["__proto__", "constructor", "prototype"]);

/** A terminal's escape sequence (CSI or OSC), which a text from the document loses whole. */
// eslint-disable-next-line no-control-regex
const ESCAPES = /\u001b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?)/g;

/** Characters a text from the document loses: control characters (C0, C1) and line or paragraph separators (as a space). */
const BREAKS = /[\p{Cc}\p{Zl}\p{Zp}]+/gu;

/** And the invisible format characters (bidi controls, zero-width spaces, Unicode tags), but the joiners ZWNJ and ZWJ a word or an emoji may need. */
const INVISIBLE = /(?![\u200c\u200d])\p{Cf}/gu;

/** An OAuth scope token (RFC 6749, 3.3). */
const SCOPE_TOKEN = /^[\x21\x23-\x5b\x5d-\x7e]{1,128}$/;

/** A header's name (RFC 9110 token), as options/http.js takes it. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;

/** The headers a backend's sign-in cannot use: the connection sets them. */
const CONNECTION_HEADERS = /^(host|content-length|transfer-encoding|connection|te|trailer|upgrade|keep-alive|accept-encoding|proxy-.*|x-forwarded-.*|forwarded)$/i;

/** What the operator reads first on stderr. */
export const CHECK_FIRST = "The API host and the token URL come from the document; check them before adding credentials.";

/** The documentation of the command. */
const DOCS = "https://pivotkit.eize.dev/reference/sources/#openapi";

/** A document or an operation that gives no source; the command exits 2 with the message. */
export class OpenApiError extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = "OpenApiError";
    }
}

/**
 * A text of the document as it may be shown: no terminal escape sequences, control characters and
 * separators as one space, no bidi controls or other invisible format characters, trimmed, at most `max` characters.
 * @param {unknown} text
 * @param {number} [max]
 */
export const cleanText = (text, max = FIELD_DESCRIPTION_MAX) =>
    String(text)
        .replace(ESCAPES, "")
        .replace(BREAKS, " ")
        .replace(INVISIBLE, "")
        .replace(/ {2,}/g, " ")
        .trim()
        .slice(0, max)
        .trim();

/** A name of the document in a message: cleaned, short, quoted. */
const shown = (text) => JSON.stringify(cleanText(text, 80));

/** Whether a document's name may be a key of the block. */
const plainName = (name) => typeof name === "string" && name.length > 0 && name.length <= 200 && !UNSAFE_NAMES.has(name) && cleanText(name, 200) === name;

/**
 * The most nested arrays and objects in a JSON text, counted without parsing (strings skipped).
 * @param {string} text
 * @param {number} limit  stops counting above this
 */
function nestingOf(text, limit) {
    let depth = 0;
    let most = 0;
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (inString) {
            if (c === 92) {
                i++;
            } else if (c === 34) {
                inString = false;
            }
        } else if (c === 34) {
            inString = true;
        } else if (c === 123 || c === 91) {
            depth++;
            if (depth > most) {
                most = depth;
                if (most > limit) {
                    return most;
                }
            }
        } else if (c === 125 || c === 93) {
            depth--;
        }
    }
    return most;
}

/**
 * Parses an OpenAPI document's text: JSON only (a YAML document is refused with how to convert it),
 * at most OPENAPI_LIMITS.bytes and OPENAPI_LIMITS.nesting deep, OpenAPI 3.0 or 3.1. Throws OpenApiError.
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function readDocument(text) {
    const body = text.replace(/^\ufeff/, "");
    if (Buffer.byteLength(body) > OPENAPI_LIMITS.bytes) {
        throw new OpenApiError(`the document is larger than ${OPENAPI_LIMITS.bytes} bytes (5 MiB)`);
    }
    const start = body.trimStart();
    if (!start.startsWith("{")) {
        if (/^(?:---|%YAML|#|["']?[A-Za-z_$][\w$-]*["']?\s*:)/m.test(start)) {
            throw new OpenApiError("this looks like YAML; convert it to JSON first, then run again, for example: npx js-yaml openapi.yaml > openapi.json");
        }
        throw new OpenApiError("the document is not a JSON object (an OpenAPI document in JSON starts with {)");
    }
    if (nestingOf(body, OPENAPI_LIMITS.nesting) > OPENAPI_LIMITS.nesting) {
        throw new OpenApiError(`the document is nested deeper than ${OPENAPI_LIMITS.nesting} levels`);
    }
    let doc;
    try {
        doc = JSON.parse(body);
    } catch (e) {
        throw new OpenApiError(`the document is not valid JSON: ${cleanText(/** @type {Error} */ (e).message, 120)}`);
    }
    if (!isObject(doc)) {
        throw new OpenApiError("the document is not a JSON object");
    }
    if (Object.hasOwn(doc, "swagger")) {
        throw new OpenApiError("this is a Swagger 2.0 document; convert it to OpenAPI 3.0 or 3.1 first");
    }
    const version = Object.hasOwn(doc, "openapi") ? doc.openapi : undefined;
    if (typeof version !== "string" || !/^3\.[01]\.\d+/.test(version)) {
        throw new OpenApiError(`the document is not OpenAPI 3.0 or 3.1 (its "openapi" is ${version === undefined ? "missing" : shown(String(version))})`);
    }
    return doc;
}

/** @returns {value is Record<string, any>} */
function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** An own property of an object, or undefined. */
const own = (object, key) => (isObject(object) && Object.hasOwn(object, key) ? object[key] : undefined);

/** An own property that is an object, or undefined. */
const ownObject = (object, key) => {
    const value = own(object, key);
    return isObject(value) ? value : undefined;
};

/**
 * Resolves the document's local references, with a chain limit and one node budget for the run.
 * A reference that is not local ("#/...") is never followed: it resolves to null and a note says why.
 */
class Resolver {
    /**
     * @param {Record<string, any>} doc
     * @param {(note: string) => void} note
     */
    constructor(doc, note) {
        this.doc = doc;
        this.note = note;
        this.nodes = 0;
        /** @type {Set<string>} references already noted, so one is noted once */
        this.noted = new Set();
    }

    /** Counts a visited node; throws OpenApiError over the budget. */
    visit() {
        this.nodes++;
        if (this.nodes > OPENAPI_LIMITS.nodes) {
            throw new OpenApiError(`the document's references expand to more than ${OPENAPI_LIMITS.nodes} nodes; it may be built to exhaust whoever reads it`);
        }
    }

    /**
     * A node with its references followed, or null (a remote, broken or circular reference).
     * @param {unknown} node
     * @param {string} where  what the node is, for a note
     * @returns {Record<string, any> | null}
     */
    resolve(node, where) {
        /** @type {string[]} */
        const chain = [];
        let current = node;
        for (;;) {
            this.visit();
            if (!isObject(current)) {
                return null;
            }
            const ref = own(current, "$ref");
            if (ref === undefined) {
                return current;
            }
            if (typeof ref !== "string") {
                return this.refused(where, "a $ref that is not a text");
            }
            if (!ref.startsWith("#/") && ref !== "#") {
                return this.refused(where, `the reference ${shown(ref)} is not local to the document; remote and file references are never fetched`);
            }
            if (chain.includes(ref)) {
                return this.refused(where, `the reference ${shown(ref)} is circular`);
            }
            if (chain.length >= OPENAPI_LIMITS.refChain) {
                return this.refused(where, `the references chain more than ${OPENAPI_LIMITS.refChain} times`);
            }
            chain.push(ref);
            current = this.pointer(ref);
            if (current === undefined) {
                return this.refused(where, `the reference ${shown(ref)} points at nothing in the document`);
            }
        }
    }

    /**
     * The value a local reference points at, read with own properties only; undefined when none.
     * @param {string} ref  "#/components/schemas/Vm"
     */
    pointer(ref) {
        let value = this.doc;
        for (const raw of ref === "#" ? [] : ref.slice(2).split("/")) {
            let key;
            try {
                key = decodeURIComponent(raw);
            } catch {
                return undefined;
            }
            key = key.replace(/~1/g, "/").replace(/~0/g, "~");
            this.visit();
            if (Array.isArray(value) && /^(0|[1-9]\d{0,8})$/.test(key) && Number(key) < value.length) {
                value = value[Number(key)];
            } else if (isObject(value) && Object.hasOwn(value, key)) {
                value = value[key];
            } else {
                return undefined;
            }
        }
        return value;
    }

    /** A note for a reference not followed; null. */
    refused(where, why) {
        const text = `${where.charAt(0).toUpperCase()}${where.slice(1)}: ${why}.`;
        if (!this.noted.has(text)) {
            this.noted.add(text);
            this.note(text);
        }
        return null;
    }

    /**
     * A schema with its references followed and the properties of an allOf merged in (one level of
     * allOf per step, each followed again), or null.
     * @param {unknown} node
     * @param {string} where
     * @param {number} [depth]
     * @returns {Record<string, any> | null}
     */
    schema(node, where, depth = 0) {
        const schema = this.resolve(node, where);
        const parts = own(schema, "allOf");
        if (!schema || !Array.isArray(parts)) {
            return schema;
        }
        if (depth >= OPENAPI_LIMITS.allOfDepth) {
            return this.refused(where, `allOf is nested more than ${OPENAPI_LIMITS.allOfDepth} levels deep`);
        }
        /** @type {Array<[string, any]>} */
        const properties = Object.entries(ownObject(schema, "properties") ?? {});
        let type = own(schema, "type");
        for (const part of parts) {
            const inner = this.schema(part, where, depth + 1);
            if (!inner) {
                continue;
            }
            properties.push(...Object.entries(ownObject(inner, "properties") ?? {}));
            type ??= own(inner, "type");
            for (const key of ["items", "description"]) {
                if (!Object.hasOwn(schema, key) && Object.hasOwn(inner, key)) {
                    properties.push([`\0${key}`, inner[key]]);
                }
            }
        }
        const merged = /** @type {Record<string, any>} */ (Object.fromEntries(Object.entries(schema).filter(([k]) => k !== "allOf" && k !== "properties")));
        merged.properties = Object.fromEntries(properties.filter(([k]) => !k.startsWith("\0")));
        for (const [k, v] of properties.filter(([key]) => key.startsWith("\0"))) {
            merged[k.slice(1)] ??= v;
        }
        if (type !== undefined) {
            merged.type = type;
        }
        return merged;
    }
}

/**
 * A schema's one type: "string", "integer", "number", "boolean", "array", "object", or null (none,
 * or more than one besides "null", as OpenAPI 3.1 writes a nullable value).
 * @param {Record<string, any> | null} schema
 */
function typeOf(schema) {
    const type = own(schema, "type");
    const types = (Array.isArray(type) ? type : [type]).filter((t) => t !== "null" && t !== undefined);
    if (types.length === 1 && typeof types[0] === "string") {
        return types[0];
    }
    if (types.length === 0 && (isObject(own(schema, "items")) || own(schema, "items") === true)) {
        return "array";
    }
    if (types.length === 0 && isObject(own(schema, "properties"))) {
        return "object";
    }
    return null;
}

/** A JSON Pointer to one key ("/items"). */
const pointerTo = (key) => `/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;

/**
 * A safe, unused parameter name for a document's name ("customer-id" → "customer_id").
 * @param {string} name
 * @param {Set<string>} used  lower case, as query names compare
 */
function paramNameFor(name, used) {
    let base = PARAM_NAME.test(name) && !UNSAFE_NAMES.has(name) ? name : name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!base || UNSAFE_NAMES.has(base)) {
        base = "param";
    }
    if (/^\d/.test(base)) {
        base = `p_${base}`;
    }
    base = base.slice(0, 60);
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
        candidate = `${base}_${n}`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
}

/**
 * A declaration the server accepts: declaredProblems of sources/params.js runs on it, and an
 * optional key it refuses (an example outside the safe charset, too long an enum) is dropped.
 * @param {string} name
 * @param {Record<string, any>} declaration
 * @returns {{ declaration: Record<string, any>, dropped: string[] }}
 */
function accepted(name, declaration) {
    const dropped = [];
    let current = declaration;
    for (const key of ["example", "enum", "minLength", "maxLength", "minimum", "maximum", "format", "description"]) {
        if (!declaredProblems({ [name]: current }).length) {
            break;
        }
        if (Object.hasOwn(current, key)) {
            current = Object.fromEntries(Object.entries(current).filter(([k]) => k !== key));
            dropped.push(key);
        }
    }
    const problems = declaredProblems({ [name]: current });
    if (problems.length) {
        throw new OpenApiError(`the parameter ${shown(name)} cannot be declared: ${cleanText(problems.join("; "), 200)}`);
    }
    return { declaration: current, dropped };
}

/**
 * @typedef {object} Generated
 * @property {{ httpSources: { backends: Record<string, any> }, sources: Record<string, any> }} config
 * @property {string} id
 * @property {string} backend
 * @property {string[]} todos  the paths of the values that still say TODO
 * @property {string[]} notes  what the operator must still decide or know, one sentence each
 * @property {Array<{ path: string, text: string }>} review  every text from the document the model will read
 */

/**
 * The HTTP source block for one GET operation of a parsed OpenAPI document. Throws OpenApiError when
 * the operation cannot be a source.
 * @param {Record<string, any>} doc  readDocument's result
 * @param {{ operation: string, id?: string, backend?: string }} how
 * @returns {Generated}
 */
export function sourceFromOpenApi(doc, how) {
    /** @type {string[]} */
    const notes = [];
    const note = (text) => notes.push(text);
    const refs = new Resolver(doc, note);
    const found = findOperation(doc, how.operation, refs);
    const { path, method, operation, pathItem } = found;
    if (method !== "get") {
        throw new OpenApiError(`HTTP sources read with GET; the operation ${shown(how.operation)} is a ${method.toUpperCase()}, so it cannot be a source.`);
    }
    if (own(operation, "requestBody") !== undefined) {
        throw new OpenApiError("HTTP sources read with GET; this operation needs a request body, so it cannot be a source.");
    }
    const id = how.id ?? cleanText(how.operation, 64).replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 64);
    if (!SOURCE_ID.test(id)) {
        throw new OpenApiError(`--id: a source id is letters, digits, "_", "-" and "." (at most 64), starting with a letter or digit${how.id ? "" : `; the operation's id ${shown(how.operation)} gives none, so name one with --id`}`);
    }
    const infoTitle = cleanText(own(ownObject(doc, "info"), "title") ?? "", 40)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const backend = how.backend ?? (SOURCE_ID.test(infoTitle) ? infoTitle : "api");
    if (!SOURCE_ID.test(backend)) {
        throw new OpenApiError('--backend: a backend\'s name is letters, digits, "_", "-" and "." (at most 64), starting with a letter or digit');
    }

    const security = securityOf(doc, operation, refs, note);
    const { params, query, httpPath } = parametersOf(path, pathItem, operation, refs, note, security.queryNames);
    const answer = answerOf(operation, refs, note, id);
    const server = serverOf(doc, pathItem, operation, note);

    /** @type {Array<{ path: string, text: string }>} */
    const review = [];
    const title = cleanText(own(operation, "summary") ?? how.operation, OPENAPI_LIMITS.title);
    const description = typeof own(operation, "description") === "string" ? cleanText(operation.description) : "";
    /** @type {Record<string, any>} */
    const source = { title: title || id };
    review.push({ path: `sources.${id}.title`, text: source.title });
    if (description) {
        source.description = description;
        review.push({ path: `sources.${id}.description`, text: description });
    }
    /** @type {Record<string, any>} */
    const http = { backend, path: httpPath };
    if (Object.keys(query).length) {
        http.query = query;
    }
    if (answer.format === "csv") {
        http.format = "csv";
    } else {
        http.rows = answer.rows;
    }
    source.http = http;
    if (Object.keys(params).length) {
        source.params = params;
        for (const [name, p] of Object.entries(params)) {
            for (const key of ["description", "example"]) {
                if (p[key] !== undefined) {
                    review.push({ path: `sources.${id}.params.${name}.${key}`, text: String(p[key]) });
                }
            }
            if (p.enum) {
                review.push({ path: `sources.${id}.params.${name}.enum`, text: p.enum.join(", ") });
            }
        }
    }
    const described = answer.fields.filter((f) => f.description);
    if (described.length) {
        source.fields = Object.fromEntries(described.map((f) => [f.name, { description: f.description }]));
        review.push(...described.map((f) => ({ path: `sources.${id}.fields.${f.name}.description`, text: f.description })));
    }
    // an HTTP source needs a default that is not "show" (options/http.js); every field starts hidden
    source.policy = answer.fields.length ? { default: "hide", fields: Object.fromEntries(answer.fields.map((f) => [f.name, "hide"])) } : { default: "hide" };
    note(
        answer.fields.length
            ? `Every field is hidden (sources.${id}.policy): set the ones a caller may see to "show", "values" or "summary".`
            : `The answer's fields are not known from the document: list the fields a caller may see in sources.${id}.policy.fields (pivotkit-server check-source ${id} prints them).`
    );

    /** @type {Record<string, any>} */
    const backendBlock = { url: server.url };
    if (security.auth) {
        backendBlock.auth = security.auth;
    }
    const config = { httpSources: { backends: Object.fromEntries([[backend, backendBlock]]) }, sources: Object.fromEntries([[id, source]]) };
    if (own(operation, "deprecated") === true) {
        note("The document marks this operation as deprecated.");
    }
    return { config, id, backend, todos: todoPaths(config), notes, review };
}

/**
 * The operation with this operationId; throws OpenApiError when none or more than one has it.
 * @param {Record<string, any>} doc
 * @param {string} operationId
 * @param {Resolver} refs
 */
function findOperation(doc, operationId, refs) {
    const paths = ownObject(doc, "paths") ?? {};
    /** @type {Array<{ path: string, method: string, operation: Record<string, any>, pathItem: Record<string, any> }>} */
    const matches = [];
    /** @type {string[]} */
    const gets = [];
    for (const path of Object.keys(paths)) {
        const pathItem = refs.resolve(paths[path], `paths ${shown(path)}`);
        for (const method of METHODS) {
            const operation = ownObject(pathItem, method);
            const opId = own(operation, "operationId");
            if (!operation || typeof opId !== "string") {
                continue;
            }
            refs.visit();
            if (method === "get") {
                gets.push(opId);
            }
            if (opId === operationId) {
                matches.push({ path, method, operation, pathItem: /** @type {Record<string, any>} */ (pathItem) });
            }
        }
    }
    if (matches.length > 1) {
        throw new OpenApiError(`the document has ${matches.length} operations with the id ${shown(operationId)}; an operationId is unique (OpenAPI), so the document needs fixing first`);
    }
    if (!matches.length) {
        const list = gets.slice(0, 30).map((g) => cleanText(g, 80));
        throw new OpenApiError(`no operation with the id ${shown(operationId)}; ${list.length ? `the GET operations of the document: ${list.join(", ")}${gets.length > list.length ? `, and ${gets.length - list.length} more` : ""}` : "the document has no GET operation with an operationId"}`);
    }
    return matches[0];
}

/**
 * The operation's parameters as params, http.query and http.path.
 * @param {string} path  the document's path ("/customers/{customerId}/vms")
 * @param {Record<string, any>} pathItem
 * @param {Record<string, any>} operation
 * @param {Resolver} refs
 * @param {(note: string) => void} note
 * @param {Set<string>} credentialNames  query names a security scheme sends a credential in (lower case)
 */
function parametersOf(path, pathItem, operation, refs, note, credentialNames) {
    /** @type {Map<string, Record<string, any>>} by "in:name"; the operation's win over the path item's */
    const byKey = new Map();
    for (const list of [own(pathItem, "parameters"), own(operation, "parameters")]) {
        for (const [i, raw] of (Array.isArray(list) ? list : []).entries()) {
            const parameter = refs.resolve(raw, `parameter ${i + 1}`);
            const name = own(parameter, "name");
            const where = own(parameter, "in");
            if (!parameter || typeof name !== "string" || typeof where !== "string") {
                continue;
            }
            byKey.set(`${where}:${name}`, parameter);
        }
    }
    /** @type {Array<{ name: string, where: "path" | "query", declaration: Record<string, any>, original: string }>} */
    const taken = [];
    const used = new Set();
    for (const parameter of byKey.values()) {
        const original = parameter.name;
        const where = parameter.in;
        const label = `${where} parameter ${shown(original)}`;
        const fatal = (why) => {
            throw new OpenApiError(`the path parameter ${shown(original)} ${why}, so the address cannot be written as an HTTP source's path`);
        };
        if (where === "header" || where === "cookie") {
            note(`Skipped the ${label}: an HTTP source sends no ${where} values from a caller (static headers go to http.headers, a credential to the backend's auth).`);
            continue;
        }
        if (where !== "path" && where !== "query") {
            continue;
        }
        if (!plainName(original)) {
            if (where === "path") fatal("has a name that cannot be a key");
            note(`Skipped the ${label}: its name cannot be a key of the configuration.`);
            continue;
        }
        if (where === "query" && credentialNames.has(original.toLowerCase())) {
            note(`Skipped the ${label}: the document sends a credential in it; a credential never comes from a caller.`);
            continue;
        }
        const style = own(parameter, "style");
        if ((style !== undefined && style !== (where === "path" ? "simple" : "form")) || own(parameter, "allowReserved") === true) {
            if (where === "path") fatal(`has the style ${shown(String(style ?? "allowReserved"))}`);
            note(`Skipped the ${label}: its style or allowReserved writes values in a way an HTTP source does not.`);
            continue;
        }
        const schema = refs.schema(own(parameter, "schema"), label);
        const type = typeOf(schema);
        if (!schema || !PARAM_TYPES.includes(/** @type {string} */ (type))) {
            if (where === "path") fatal(`is ${type === "array" || type === "object" ? `of type ${type}` : "of no type a parameter has"}`);
            note(`Skipped the ${label}: ${type === "array" || type === "object" ? `an ${type} value` : "a value of no single type"} is not a parameter of an HTTP source (string, integer, number, boolean).`);
            continue;
        }
        if (own(parameter, "explode") !== undefined) {
            note(`The ${label}'s explode is left out: it makes no difference for a single value.`);
        }
        /** @type {Record<string, any>} */
        const declaration = { type };
        if (where === "path" || own(parameter, "required") === true) {
            declaration.required = true;
        }
        const description = own(parameter, "description") ?? own(schema, "description");
        if (typeof description === "string" && cleanText(description)) {
            declaration.description = cleanText(description);
        }
        const secretLooking = SECRET_NAME.test(original);
        if (own(schema, "pattern") !== undefined) {
            note(`The ${label}'s pattern is not copied (a document's regular expression could take very long on a caller's value); ${type === "string" ? "the safe default applies: letters, digits and . _ ~ -" : "it has no effect on this type"}. Write your own pattern if the values need more.`);
        }
        if (type === "string" && own(schema, "format") === "date") {
            declaration.format = "date";
        }
        if (!secretLooking) {
            // an enum is copied only as it stands: a value that cleaning would change is no value the API takes
            const values = own(schema, "enum");
            const usable = Array.isArray(values) ? values.filter((v) => v !== null) : [];
            if (usable.length && usable.every((v) => typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v === cleanText(v, PARAM_LIMITS.length)))) {
                declaration.enum = usable;
            } else if (usable.length) {
                note(`The ${label}'s list of values is not copied: it holds values that are not plain texts, numbers or true and false.`);
            }
            const example = own(parameter, "example") ?? own(schema, "example") ?? (Array.isArray(own(schema, "examples")) ? schema.examples[0] : undefined);
            if (example !== undefined && example !== null && typeof example !== "object") {
                declaration.example = typeof example === "string" ? cleanText(example, PARAM_LIMITS.length) : example;
            }
        } else {
            note(`The ${label}'s name looks like a credential's, so its example and list of values are not copied. A caller would send this value: if it is the API's key, remove the parameter and configure the backend's auth instead.`);
        }
        if (type === "string") {
            for (const key of ["minLength", "maxLength"]) {
                const n = own(schema, key);
                if (Number.isSafeInteger(n) && n >= 0) {
                    declaration[key] = Math.min(n, PARAM_LIMITS.length);
                    if (n > PARAM_LIMITS.length) {
                        note(`The ${label}'s ${key} ${n} is ${PARAM_LIMITS.length}, the most a parameter's value has.`);
                    }
                }
            }
        } else if (type === "integer" || type === "number") {
            for (const key of ["minimum", "maximum"]) {
                const n = own(schema, key);
                if (typeof n === "number" && Number.isFinite(n)) {
                    declaration[key] = n;
                }
            }
        }
        const name = paramNameFor(original, used);
        const { declaration: ok, dropped } = accepted(name, declaration);
        if (dropped.length) {
            note(`The ${label}: left out ${dropped.join(", ")}, which the server would refuse (sources.<id>.params rules).`);
        }
        if (name !== original) {
            note(`The ${label} is the parameter ${name} (a parameter's name is letters, digits and "_").`);
        }
        taken.push({ name, where, declaration: ok, original });
    }
    // at most PARAM_LIMITS.count: path and required ones first
    const ordered = [...taken.filter((p) => p.declaration.required), ...taken.filter((p) => !p.declaration.required)];
    if (ordered.filter((p) => p.declaration.required).length > PARAM_LIMITS.count) {
        throw new OpenApiError(`the operation needs more than ${PARAM_LIMITS.count} parameters, the most a source has`);
    }
    const kept = ordered.slice(0, PARAM_LIMITS.count);
    for (const p of ordered.slice(PARAM_LIMITS.count)) {
        note(`Skipped the query parameter ${shown(p.original)}: a source has at most ${PARAM_LIMITS.count} parameters.`);
    }
    if (!path.startsWith("/") || /[?#]/.test(path)) {
        throw new OpenApiError(`the path ${shown(path)} is no path an HTTP source can use (it starts with "/" and has no "?" or "#")`);
    }
    // the path with each {original} as {name}
    let httpPath = path;
    for (const p of kept.filter((k) => k.where === "path")) {
        httpPath = httpPath.split(`{${p.original}}`).join(`{${p.name}}`);
    }
    const params = Object.fromEntries(kept.map((p) => [p.name, p.declaration]));
    const query = Object.fromEntries(kept.filter((p) => p.where === "query").map((p) => [p.original, `{${p.name}}`]));
    try {
        // the server's own check of an address template, on a stand-in origin
        compileTemplate(`https://api.example.com${httpPath}`, query, params);
    } catch (e) {
        throw new OpenApiError(`the path ${shown(path)} cannot be an HTTP source's address: ${cleanText(/** @type {Error} */ (e).message, 200)}`);
    }
    const queryish = kept.filter((p) => p.where === "query" && /^(page|page_?size|per_?page|offset|limit|cursor|skip|top|\$top|\$skip)$/i.test(p.original));
    if (queryish.length) {
        note(`The query parameters ${queryish.map((p) => p.original).join(", ")} look like paging: if the API pages, remove them from params and http.query and set http.paging instead (${DOCS.replace("#openapi", "#http-paging")}).`);
    }
    return { params, query, httpPath };
}

/**
 * Where the rows are and the row's fields, from the operation's 2xx answer.
 * @param {Record<string, any>} operation
 * @param {Resolver} refs
 * @param {(note: string) => void} note
 * @param {string} id
 * @returns {{ format: "json" | "csv", rows: string, fields: Array<{ name: string, description: string }> }}
 */
function answerOf(operation, refs, note, id) {
    const todoRows = `${TODO_MARK}: JSON Pointer to the rows`;
    const responses = ownObject(operation, "responses") ?? {};
    const codes = Object.keys(responses).filter((c) => /^2(\d\d|XX)$/i.test(c));
    codes.sort((a, b) => (a === "200" ? -1 : b === "200" ? 1 : a.localeCompare(b)));
    const response = codes.length ? refs.resolve(responses[codes[0]], `the answer ${codes[0]}`) : null;
    const content = ownObject(response, "content") ?? {};
    const types = Object.keys(content);
    const json = types.find((t) => /^application\/json\s*(;|$)/i.test(t)) ?? types.find((t) => /^application\/[\w.-]*\+json\s*(;|$)/i.test(t));
    if (!json) {
        if (types.some((t) => /^text\/csv\s*(;|$)/i.test(t))) {
            note("The answer is CSV: the whole body is the table (http.format csv).");
            return { format: "csv", rows: "", fields: [] };
        }
        note(`The document gives no JSON answer for this operation: set sources.${id}.http.rows to where the rows are (pivotkit-server check-source ${id} prints the body's keys).`);
        return { format: "json", rows: todoRows, fields: [] };
    }
    const body = refs.schema(own(content[json], "schema"), "the answer's schema");
    let rows = todoRows;
    /** @type {Record<string, any> | null} */
    let row = null;
    if (typeOf(body) === "array") {
        rows = "";
        row = refs.schema(own(body, "items"), "the rows' schema");
    } else if (typeOf(body) === "object") {
        const properties = ownObject(body, "properties") ?? {};
        const lists = Object.keys(properties).filter((name) => plainName(name) && typeOf(refs.schema(properties[name], `the answer's property ${shown(name)}`)) === "array");
        if (lists.length === 1) {
            rows = pointerTo(lists[0]);
            row = refs.schema(own(refs.schema(properties[lists[0]], "the rows' schema"), "items"), "the rows' schema");
        } else {
            note(lists.length ? `The answer has ${lists.length} lists (${lists.map((l) => cleanText(l, 40)).join(", ")}): set sources.${id}.http.rows to the one with the rows.` : `The answer's schema has no list: set sources.${id}.http.rows to where the rows are.`);
        }
    } else {
        note(`The answer's schema is not a list or an object pivotkit can read: set sources.${id}.http.rows to where the rows are.`);
    }
    /** @type {Array<{ name: string, description: string }>} */
    const fields = [];
    const properties = ownObject(row, "properties") ?? {};
    for (const name of Object.keys(properties)) {
        if (!plainName(name)) {
            note(`Skipped the row's property ${shown(name)}: its name cannot be a key of the configuration.`);
            continue;
        }
        if (fields.length >= OPENAPI_LIMITS.fields) {
            note(`Only the first ${OPENAPI_LIMITS.fields} of the row's properties are listed.`);
            break;
        }
        const property = refs.schema(properties[name], `the row's property ${shown(name)}`);
        const text = own(property, "description") ?? own(properties[name], "description");
        fields.push({ name, description: typeof text === "string" ? cleanText(text) : "" });
    }
    if (row && typeOf(row) !== "object") {
        note("The rows are not objects with named properties: check what the backend sends with check-source.");
    }
    return { format: "json", rows, fields };
}

/**
 * The backend's url as a TODO value naming what the document says.
 * @param {Record<string, any>} doc
 * @param {Record<string, any>} pathItem
 * @param {Record<string, any>} operation
 * @param {(note: string) => void} note
 */
function serverOf(doc, pathItem, operation, note) {
    const servers = [own(operation, "servers"), own(pathItem, "servers"), own(doc, "servers")].find((s) => Array.isArray(s) && s.length) ?? [];
    const first = servers.find((s) => typeof own(s, "url") === "string");
    if (!first) {
        return { url: `${TODO_MARK}: https://... (the document names no server address)` };
    }
    const named = describedAddress(first.url);
    if (servers.length > 1) {
        note(`The document names ${servers.length} server addresses; the first is shown in the backend's url.`);
    }
    if (/[{}]/.test(first.url)) {
        note("The document's server address has variables in braces: write the address with your values.");
    }
    return { url: `${TODO_MARK}: https://... (the document names ${named}; check it)` };
}

/**
 * An address from the document as a TODO value names it: without a user name, password, query or
 * fragment, cleaned and short.
 * @param {string} text
 */
function describedAddress(text) {
    let shownText = cleanText(text, 300);
    try {
        const url = new URL(shownText);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        shownText = url.href;
    } catch {
        // a relative address or one with variables: shown without what follows ? or #
        shownText = shownText.replace(/[?#].*$/, "").replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1");
    }
    return cleanText(shownText, 200) || "an empty address";
}

/**
 * The backend's sign-in as a skeleton with TODO values, from the operation's security requirement
 * (else the document's): an API key in a header or an HTTP bearer or basic scheme as a header from
 * a secret, OAuth client credentials as clientCredentials. Other schemes get a note.
 * @param {Record<string, any>} doc
 * @param {Record<string, any>} operation
 * @param {Resolver} refs
 * @param {(note: string) => void} note
 * @returns {{ auth: Record<string, any> | null, queryNames: Set<string> }}
 */
function securityOf(doc, operation, refs, note) {
    const requirements = Object.hasOwn(operation, "security") ? operation.security : own(doc, "security");
    const schemes = ownObject(ownObject(doc, "components"), "securitySchemes") ?? {};
    /** @type {Set<string>} */
    const queryNames = new Set();
    // every API key a scheme sends in the query: a credential, never a caller's parameter
    for (const name of Object.keys(schemes)) {
        const scheme = refs.resolve(schemes[name], `the security scheme ${shown(name)}`);
        if (own(scheme, "type") === "apiKey" && own(scheme, "in") === "query" && typeof own(scheme, "name") === "string") {
            queryNames.add(scheme.name.toLowerCase());
        }
    }
    if (!Array.isArray(requirements) || !requirements.length) {
        return { auth: null, queryNames };
    }
    if (requirements.some((r) => isObject(r) && !Object.keys(r).length)) {
        note("The document allows this operation without sign-in too; the backend's auth below is for when the API asks for it.");
    }
    /** @type {string[]} */
    const unsupported = [];
    for (const requirement of requirements) {
        const names = isObject(requirement) ? Object.keys(requirement) : [];
        if (names.length !== 1) {
            if (names.length > 1) {
                unsupported.push(`${names.map((n) => cleanText(n, 40)).join(" and ")} together`);
            }
            continue;
        }
        const name = names[0];
        const scheme = Object.hasOwn(schemes, name) ? refs.resolve(schemes[name], `the security scheme ${shown(name)}`) : null;
        const auth = scheme ? authOf(scheme, requirement[name], name, unsupported) : null;
        if (auth) {
            if (unsupported.length) {
                note(`The document also names sign-ins pivotkit does not write for you: ${unsupported.join("; ")}.`);
            }
            return { auth, queryNames };
        }
    }
    note(`The document's sign-in (${unsupported.join("; ") || "a scheme it does not define"}) is not one pivotkit writes for you: configure the backend's auth by hand (${DOCS.replace("#openapi", "#http-auth")}). For each person's own access, tokenExchange is the one to use.`);
    return { auth: null, queryNames };
}

/**
 * One security scheme as a backend's auth skeleton, or null (and why, in unsupported).
 * @param {Record<string, any>} scheme
 * @param {unknown} scopes  the requirement's scopes
 * @param {string} name
 * @param {string[]} unsupported
 */
function authOf(scheme, scopes, name, unsupported) {
    const type = own(scheme, "type");
    const label = cleanText(name, 40);
    const secret = (what) => ({ env: `${TODO_MARK}: the variable that holds ${what}` });
    if (type === "apiKey") {
        const where = own(scheme, "in");
        const header = own(scheme, "name");
        if (where !== "header") {
            unsupported.push(`${label} (an API key in the ${where === "query" ? "query" : where === "cookie" ? "cookie" : "request"}; a backend's auth sends a header)`);
            return null;
        }
        const usable = typeof header === "string" && HEADER_NAME.test(header) && !CONNECTION_HEADERS.test(header);
        return { header: { name: usable ? header.toLowerCase() : `${TODO_MARK}: the header's name`, value: secret("the API key") } };
    }
    if (type === "http") {
        const kind = String(own(scheme, "scheme") ?? "").toLowerCase();
        if (kind === "bearer") {
            return { header: { prefix: "Bearer ", value: secret("the token") } };
        }
        if (kind === "basic") {
            return { header: { prefix: "Basic ", value: secret('the base64 of "user:password"') } };
        }
        unsupported.push(`${label} (HTTP ${cleanText(kind, 20) || "scheme"})`);
        return null;
    }
    if (type === "oauth2") {
        const flow = ownObject(ownObject(scheme, "flows"), "clientCredentials");
        if (!flow) {
            unsupported.push(`${label} (OAuth for people, not client credentials)`);
            return null;
        }
        const tokenUrl = own(flow, "tokenUrl");
        /** @type {Record<string, any>} */
        const cc = {
            tokenUrl: `${TODO_MARK}: https://... (${typeof tokenUrl === "string" ? `the document names ${describedAddress(tokenUrl)}; check it` : "the document names no token address"})`,
            clientId: `${TODO_MARK}: the client id`,
            clientSecret: secret("the client secret")
        };
        const wanted = Array.isArray(scopes) ? scopes.filter((s) => typeof s === "string" && SCOPE_TOKEN.test(s)) : [];
        if (wanted.length) {
            cc.scope = wanted.join(" ").slice(0, 1000);
        }
        return { clientCredentials: cc };
    }
    unsupported.push(`${label} (${type === "openIdConnect" ? "OpenID Connect" : type === "mutualTLS" ? "mutual TLS" : cleanText(String(type ?? "no type"), 20)})`);
    return null;
}

/**
 * What the command prints on stderr: the check first, then the TODO values, the notes and the texts
 * to review. Every text from the document in it is cleaned already.
 * @param {Generated} generated
 */
export function operatorText(generated) {
    const lines = [CHECK_FIRST, ""];
    lines.push(`Still to decide: ${generated.todos.length} ${generated.todos.length === 1 ? "value says" : "values say"} ${TODO_MARK}, and the server refuses the configuration until none does:`);
    lines.push(...generated.todos.map((p) => `  ${p}`));
    if (generated.notes.length) {
        lines.push("", "Notes:", ...generated.notes.map((n) => `  - ${n}`));
    }
    if (generated.review.length) {
        lines.push("", "Review these as text the model will read:", ...generated.review.map((r) => `  ${r.path}: ${JSON.stringify(r.text)}`));
    }
    lines.push("", `Add the block to your configuration, fill in every ${TODO_MARK}, then run pivotkit-server check-config and check-source ${generated.id}. Docs: ${DOCS}`, "");
    return lines.join("\n");
}

/**
 * Reads a document from a file, at most OPENAPI_LIMITS.bytes (read from the open file, never trusting
 * its size), or from an https:// URL through guardedFetch (no credentials, OPENAPI_LIMITS.timeMs).
 * @param {string} target
 * @param {{ fetch?: typeof guardedFetch }} [means]
 * @returns {Promise<string>}
 */
export async function loadDocumentText(target, means = {}) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
        let url;
        try {
            url = new URL(target);
        } catch {
            throw new OpenApiError("not an address");
        }
        const where = `${url.protocol}//${url.host}`;
        try {
            const response = await (means.fetch ?? guardedFetch)(url, { method: "GET", headers: { accept: "application/json" }, maxBytes: OPENAPI_LIMITS.bytes, timeMs: OPENAPI_LIMITS.timeMs });
            if (response.status !== 200) {
                throw new OpenApiError(`${where} answered ${response.status}`);
            }
            return new TextDecoder("utf-8", { fatal: true }).decode(response.body);
        } catch (e) {
            if (e instanceof OpenApiError) {
                throw e;
            }
            if (e instanceof GuardedFetchError) {
                throw new OpenApiError(`${where}: ${e.code === "TOO_LARGE" ? `the document is larger than ${OPENAPI_LIMITS.bytes} bytes (5 MiB)` : cleanText(e.message, 200)}${e.code === "NOT_HTTPS" || e.code === "REFUSED_ADDRESS" || e.code === "IP_LITERAL" ? "; download the document and pass the file instead" : ""}`);
            }
            throw new OpenApiError(`${where}: the document is not UTF-8 text`);
        }
    }
    let handle;
    try {
        handle = await open(target, "r");
    } catch (e) {
        throw new OpenApiError(`cannot read ${JSON.stringify(cleanText(target, 300))}: ${/** @type {any} */ (e).code ?? "error"}`);
    }
    try {
        const buffer = Buffer.alloc(OPENAPI_LIMITS.bytes + 1);
        let length = 0;
        for (;;) {
            const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
            if (bytesRead === 0) {
                break;
            }
            length += bytesRead;
            if (length > OPENAPI_LIMITS.bytes) {
                throw new OpenApiError(`the document is larger than ${OPENAPI_LIMITS.bytes} bytes (5 MiB)`);
            }
        }
        try {
            return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
        } catch {
            throw new OpenApiError("the document is not UTF-8 text");
        }
    } catch (e) {
        if (e instanceof OpenApiError) {
            throw e;
        }
        throw new OpenApiError(`cannot read ${JSON.stringify(cleanText(target, 300))}: ${/** @type {any} */ (e).code ?? "error"}`);
    } finally {
        await handle.close();
    }
}

/** The command's usage line. */
export const USAGE = "pivotkit-server source-from-openapi <file or https URL> --operation <operationId> [--id <source id>] [--backend <name>]";

/**
 * The command: prints the block (JSON) on stdout and what the operator must decide on stderr; 0 on
 * success, 2 on a usage error or a document that gives no source.
 * @param {string[]} argv
 * @param {{ stdout: { write(t: string): unknown }, stderr: { write(t: string): unknown } }} io
 * @param {{ fetch?: typeof guardedFetch }} [means]
 */
export async function sourceFromOpenApiCommand(argv, io, means = {}) {
    /** @type {Record<string, string>} */
    const flags = {};
    /** @type {string[]} */
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const match = /^--(operation|id|backend)(?:=(.*))?$/s.exec(arg);
        if (match) {
            const value = match[2] ?? argv[++i];
            if (value === undefined || value === "" || (match[2] === undefined && value.startsWith("--"))) {
                return usage(io, `--${match[1]} needs a value`);
            }
            if (Object.hasOwn(flags, match[1])) {
                return usage(io, `--${match[1]} is given twice`);
            }
            flags[match[1]] = value;
        } else if (arg.startsWith("--")) {
            return usage(io, `unknown option ${shown(arg)}`);
        } else {
            rest.push(arg);
        }
    }
    if (rest.length !== 1 || !flags.operation) {
        return usage(io, rest.length !== 1 ? "name one OpenAPI document, a file or an https:// URL" : "--operation names the operation (its operationId)");
    }
    try {
        const doc = readDocument(await loadDocumentText(rest[0], means));
        const generated = sourceFromOpenApi(doc, { operation: flags.operation, id: flags.id, backend: flags.backend });
        io.stdout.write(`${JSON.stringify(generated.config, null, 2)}\n`);
        io.stderr.write(operatorText(generated));
        return 0;
    } catch (e) {
        if (e instanceof OpenApiError) {
            io.stderr.write(`pivotkit-server source-from-openapi: ${cleanText(e.message, 2000)}\n`);
            return 2;
        }
        throw e;
    }
}

/** A usage error: the message and the usage line, exit 2. */
function usage(io, message) {
    io.stderr.write(`pivotkit-server source-from-openapi: ${message}\nUsage: ${USAGE}\n`);
    return 2;
}
