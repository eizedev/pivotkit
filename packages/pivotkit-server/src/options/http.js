/*
 * The options of HTTP sources: `httpSources` (on or off, IP addresses as hosts, backends defined once
 * for many sources) and `sources.<id>.http` (the address template, its query and headers, where the
 * rows are, paging, limits). The shared keys `params`, `ttl`, `maxStale` and `timeMs` are
 * options/base.js's; this fragment gives them their defaults for an HTTP source.
 *
 * Everything is checked here at start and compiled once (httpSettingsOf): the template
 * (sources/template.js), the JSON Pointers, the headers, the paging and the effective limits, so a
 * load only fills in a caller's values. A backend's sign-in (http.auth) is not part of this version:
 * the key is unknown, so a configuration that names one is refused instead of sending requests
 * without it.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses a
 * second declaration).
 */

import { resolvePolicy } from "../policy.js";
import { compileTemplate } from "../sources/template.js";
import { ConfigError } from "./shared.js";

export const NAME = "http";

/**
 * @typedef {object} HttpBackendOptions  a backend many sources share (httpSources.backends.<name>)
 * @property {string} url  https:// origin and path prefix, no query
 * @property {boolean} [intranet]  loopback and private addresses may be reached (default false)
 * @property {Record<string, string>} [headers]  static headers, under each source's
 * @property {number} [timeMs]
 * @property {number} [maxBytes]
 * @property {number} [ttl]
 * @property {number} [maxStale]
 */

/**
 * @typedef {object} HttpSourcesOptions  httpSources
 * @property {boolean} [enabled]  false: every HTTP source is ignored (default true)
 * @property {boolean} [allowIpLiterals]  an IP address as a URL's host (default false)
 * @property {Record<string, HttpBackendOptions>} [backends]
 */

/**
 * @typedef {object} HttpSourceOptions  sources.<id>.http
 * @property {string} [backend]  a backend of httpSources.backends, with path
 * @property {string} [path]  the path template after the backend's url ("/customers/{customer}/vms")
 * @property {string} [url]  instead of backend and path: a full https:// URL template
 * @property {boolean} [intranet]  with url: loopback and private addresses may be reached (default false)
 * @property {Record<string, string>} [query]  a literal or exactly one {name}
 * @property {Record<string, string>} [headers]
 * @property {string} [rows]  JSON Pointer to the rows (default "": the body is the list)
 * @property {"json" | "csv"} [format]
 * @property {string} [asOf]  JSON Pointer to the body's own time (ISO 8601 or epoch seconds)
 * @property {{ next: string } | { link: true } | { page: string, start?: number } | { offset: string, limit: string, size: number }} [paging]
 * @property {number} [maxPages]  1 to 100 (default 10)
 * @property {number} [maxBytes]  all pages together (default 20 MiB, at most limits.fileBytes)
 */

/** The defaults of an HTTP source (a backend's value, then the source's own, win). */
export const HTTP_DEFAULTS = Object.freeze({ ttl: 60, maxStale: 3600, timeMs: 15_000, maxBytes: 20_971_520, maxPages: 10, format: "json" });

/** The most pages and the longest load an HTTP source may have. */
export const HTTP_MAX = Object.freeze({ pages: 100, timeMs: 600_000 });

/** The headers a configuration may not set: the connection's own, and sign-in, which goes to http.auth. */
const REFUSED_HEADERS = /^(authorization|cookie|host|content-length|transfer-encoding|connection|te|trailer|upgrade|keep-alive|accept-encoding|proxy-.*|x-forwarded-.*|forwarded)$/i;

/** A header's name (RFC 9110 token). */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;

/** A header's value: printable Latin-1 and tab, no line break, no NUL. */
const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]{0,1000}$/;

/** The words in a header's or query parameter's name that look like a secret's. */
export const SECRET_NAME = /key|token|secret|auth|pass/i;

/** What a paging setting is. */
const PAGING = { custom: pagingProblems };

/** A map of texts (headers, query). */
const TEXTS = { map: "string" };

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    top: {
        httpSources: {
            object: {
                enabled: "boolean",
                allowIpLiterals: "boolean",
                backends: { map: { object: { url: "string", intranet: "boolean", headers: TEXTS, timeMs: "integer", maxBytes: "integer", ttl: "integer", maxStale: "integer" } } }
            }
        }
    },
    source: {
        http: {
            object: {
                backend: "string",
                path: "string",
                url: "string",
                intranet: "boolean",
                query: TEXTS,
                headers: TEXTS,
                rows: "string",
                format: { enum: ["json", "csv"] },
                asOf: "string",
                paging: PAGING,
                maxPages: "integer",
                maxBytes: "integer"
            }
        }
    }
});

/**
 * What is wrong with a paging setting: exactly one of `{ next: <pointer> }`, `{ link: true }`,
 * `{ page: <name>, start?: <n> }` or `{ offset: <name>, limit: <name>, size: <n> }`.
 * @param {unknown} paging
 * @returns {string[]}
 */
function pagingProblems(paging) {
    if (!paging || typeof paging !== "object" || Array.isArray(paging)) {
        return ['is one of { "next": "/pointer" }, { "link": true }, { "page": "name" } or { "offset": "name", "limit": "name", "size": 100 }'];
    }
    const p = /** @type {Record<string, unknown>} */ (paging);
    const keys = Object.keys(p).sort().join(",");
    const name = (v) => typeof v === "string" && /^[A-Za-z0-9\-._~]{1,64}$/.test(v);
    if (keys === "next") {
        return typeof p.next === "string" && pointerProblem(p.next) === null ? [] : [`next: ${pointerProblem(String(p.next)) ?? "a JSON Pointer"}`];
    }
    if (keys === "link") {
        return p.link === true ? [] : ["link: true (the next page from the answer's Link header)"];
    }
    if (keys === "page" || keys === "page,start") {
        return name(p.page) && (p.start === undefined || (Number.isSafeInteger(p.start) && /** @type {number} */ (p.start) >= 0)) ? [] : ["page: the query name of the page number; start: the first page's number (default 1)"];
    }
    if (keys === "limit,offset,size") {
        return name(p.offset) && name(p.limit) && Number.isSafeInteger(p.size) && /** @type {number} */ (p.size) >= 1 && /** @type {number} */ (p.size) <= 10_000 ? [] : ["offset and limit: query names; size: the rows per page, 1 to 10000"];
    }
    return ['is one of { "next": "/pointer" }, { "link": true }, { "page": "name", "start": 1 } or { "offset": "name", "limit": "name", "size": 100 }'];
}

/**
 * What is wrong with a JSON Pointer (RFC 6901), or null.
 * @param {string} text
 */
function pointerProblem(text) {
    if (text === "") {
        return null;
    }
    if (!text.startsWith("/") || /~(?![01])/.test(text) || text.length > 256) {
        return 'a JSON Pointer: "" (the whole body) or "/" and the keys ("/items", "/data/rows"), ~1 for a "/" in a key, ~0 for a "~"';
    }
    return null;
}

/**
 * A JSON Pointer's keys.
 * @param {string} text
 * @returns {string[]}
 */
export const pointerKeys = (text) => (text === "" ? [] : text.slice(1).split("/").map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~")));

/**
 * @typedef {object} HttpSettings  an HTTP source as its loads use it, compiled once
 * @property {string} id
 * @property {import("../sources/template.js").CompiledTemplate} template
 * @property {string | null} backend  the backend's name
 * @property {string | null} backendUrl
 * @property {boolean} intranet  loopback and private addresses may be reached
 * @property {boolean} allowIpLiterals
 * @property {Record<string, string>} headers  names in lower case
 * @property {"json" | "csv"} format
 * @property {string} rowsText
 * @property {string[]} rows  the rows' JSON Pointer as keys
 * @property {string[] | null} asOf
 * @property {{ next: string[] } | { link: true } | { page: string, start: number } | { offset: string, limit: string, size: number } | null} paging
 * @property {string} pagingText
 * @property {number} maxPages
 * @property {number} maxBytes  all pages together
 * @property {number} timeMs  the whole load
 * @property {number} ttl
 * @property {number} maxStale
 * @property {string[]} unused  declared params no template uses
 * @property {string[]} secretLooking  header and query names that look like a secret's with a literal value (never the value)
 */

/** Each HTTP source's settings, by its configured object. */
const compiled = new WeakMap();

/**
 * An HTTP source's compiled settings (made when the options were checked).
 * @param {object} source  options.sources[id]
 * @returns {HttpSettings}
 */
export function httpSettingsOf(source) {
    const settings = compiled.get(source);
    if (!settings) {
        throw new Error("an HTTP source's options are checked (validateOptions) before it is used");
    }
    return settings;
}

/**
 * Checks a map of headers; returns them with names in lower case.
 * @param {Record<string, string> | undefined} headers
 * @param {string} path
 */
function headersOf(headers, path) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (!HEADER_NAME.test(name)) {
            throw new ConfigError(`${path}.${name.slice(0, 60)}: not a header name`);
        }
        if (REFUSED_HEADERS.test(name)) {
            throw new ConfigError(`${path}.${name}: this header is set by the connection or is a sign-in; a backend's sign-in is not configured in headers`);
        }
        if (!HEADER_VALUE.test(value)) {
            throw new ConfigError(`${path}.${name}: a value without line breaks, NUL or characters outside Latin-1, at most 1000 characters`);
        }
        out[name.toLowerCase()] = value;
    }
    return out;
}

/**
 * A paging setting as loads use it.
 * @param {any} paging  a checked sources.<id>.http.paging, or null
 * @returns {HttpSettings["paging"]}
 */
function pagingOf(paging) {
    if (!paging) {
        return null;
    }
    if (paging.next !== undefined) {
        return { next: pointerKeys(paging.next) };
    }
    if (paging.link) {
        return { link: true };
    }
    return paging.page ? { page: paging.page, start: paging.start ?? 1 } : { offset: paging.offset, limit: paging.limit, size: paging.size };
}

/**
 * Compiles one HTTP source; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 * @param {string} id
 * @param {any} source
 * @returns {HttpSettings}
 */
function compileSource(options, id, source) {
    const http = source.http;
    const at = `sources.${id}.http`;
    const hasBackend = http.backend !== undefined || http.path !== undefined;
    if (hasBackend === (http.url !== undefined)) {
        throw new ConfigError(`${at}: give either backend and path, or url`);
    }
    if (hasBackend && (http.backend === undefined || http.path === undefined)) {
        throw new ConfigError(`${at}: backend and path go together (the path after the backend's url)`);
    }
    const backends = options.httpSources?.backends ?? {};
    const backend = hasBackend ? (Object.hasOwn(backends, http.backend) ? backends[http.backend] : null) : null;
    if (hasBackend && !backend) {
        const known = Object.keys(backends);
        throw new ConfigError(`${at}.backend: no backend "${String(http.backend).slice(0, 60)}" in httpSources.backends${known.length ? ` (known: ${known.join(", ")})` : ""}`);
    }
    if (hasBackend && http.intranet !== undefined) {
        throw new ConfigError(`${at}.intranet: set intranet on the backend (httpSources.backends.${http.backend}.intranet)`);
    }
    if (hasBackend && (!http.path.startsWith("/") || /[?#]/.test(http.path))) {
        throw new ConfigError(`${at}.path: starts with "/" and has no "?" or "#" (query values go to http.query)`);
    }
    const format = http.format ?? HTTP_DEFAULTS.format;
    if (format === "csv" && (http.paging || http.rows !== undefined || http.asOf !== undefined)) {
        throw new ConfigError(`${at}: a CSV answer is one page, the whole body: rows, asOf and paging are for JSON answers`);
    }
    for (const key of ["rows", "asOf"]) {
        if (http[key] !== undefined && pointerProblem(http[key]) !== null) {
            throw new ConfigError(`${at}.${key}: ${pointerProblem(http[key])}`);
        }
    }
    const paging = http.paging ?? null;
    const reserved = paging?.page ? [paging.page] : paging?.offset ? [paging.offset, paging.limit] : [];
    for (const name of reserved) {
        if (Object.keys(source.params ?? {}).some((p) => p.toLowerCase() === name.toLowerCase())) {
            throw new ConfigError(`${at}.paging: ${name} is a query name pivotkit fills while paging, so it cannot also be a parameter (sources.${id}.params.${name})`);
        }
    }
    if (paging?.offset && paging.offset.toLowerCase() === paging.limit.toLowerCase()) {
        throw new ConfigError(`${at}.paging: offset and limit are two query names`);
    }
    const allowIpLiterals = options.httpSources?.allowIpLiterals === true;
    const templateText = hasBackend ? `${backend.url.replace(/\/+$/, "")}${http.path}` : http.url;
    let template;
    try {
        template = compileTemplate(templateText, http.query, source.params, { allowIpLiterals, reserved });
    } catch (e) {
        throw new ConfigError(`${at}.${hasBackend ? "path" : "url"}: ${/** @type {Error} */ (e).message}`);
    }
    if (http.maxPages !== undefined && (http.maxPages < 1 || http.maxPages > HTTP_MAX.pages)) {
        throw new ConfigError(`${at}.maxPages: 1 to ${HTTP_MAX.pages}`);
    }
    const maxBytes = http.maxBytes ?? backend?.maxBytes ?? HTTP_DEFAULTS.maxBytes;
    const fileBytes = options.limits?.fileBytes;
    if (maxBytes < 1 || (fileBytes !== undefined && maxBytes > fileBytes)) {
        throw new ConfigError(`${at}.maxBytes: 1 to limits.fileBytes${fileBytes !== undefined ? ` (${fileBytes})` : ""}`);
    }
    const timeMs = source.timeMs ?? backend?.timeMs ?? HTTP_DEFAULTS.timeMs;
    if (timeMs > HTTP_MAX.timeMs) {
        throw new ConfigError(`sources.${id}.timeMs: at most ${HTTP_MAX.timeMs} (ten minutes)`);
    }
    // a backend's settings were checked with the backends; its headers merged under the source's
    const headers = { ...(backend ? headersOf(backend.headers, `httpSources.backends.${http.backend}.headers`) : {}), ...headersOf(http.headers, `${at}.headers`) };
    const secretLooking = [...Object.keys(headers).map((n) => `header ${n}`), ...template.query.filter((q) => q.param === null).map((q) => `query ${q.name}`)].filter((n) => SECRET_NAME.test(n.split(" ")[1]));
    return Object.freeze({
        id,
        template,
        backend: hasBackend ? http.backend : null,
        backendUrl: hasBackend ? backend.url : null,
        intranet: hasBackend ? backend.intranet === true : http.intranet === true,
        allowIpLiterals,
        headers,
        format,
        rowsText: http.rows ?? "",
        rows: pointerKeys(http.rows ?? ""),
        asOf: http.asOf !== undefined ? pointerKeys(http.asOf) : null,
        paging: pagingOf(paging),
        pagingText: paging ? (paging.next !== undefined ? `next page at ${paging.next}` : paging.link ? "next page from the Link header" : paging.page ? `pages by ${paging.page}` : `pages by ${paging.offset}/${paging.limit} of ${paging.size}`) : "",
        maxPages: http.maxPages ?? HTTP_DEFAULTS.maxPages,
        maxBytes,
        timeMs,
        ttl: source.ttl ?? backend?.ttl ?? HTTP_DEFAULTS.ttl,
        maxStale: source.maxStale ?? backend?.maxStale ?? HTTP_DEFAULTS.maxStale,
        unused: Object.keys(source.params ?? {}).filter((name) => !template.uses.has(name)),
        secretLooking
    });
}

/**
 * Checks the rules between these keys and compiles every HTTP source; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    for (const [name, backend] of Object.entries(options.httpSources?.backends ?? {})) {
        const at = `httpSources.backends.${name}`;
        if (typeof backend.url !== "string") {
            throw new ConfigError(`${at}.url: the backend's https:// address (and path prefix)`);
        }
        if (/[{}]/.test(backend.url)) {
            throw new ConfigError(`${at}.url: no expressions in a backend's url; they go into a source's http.path`);
        }
        try {
            compileTemplate(backend.url, undefined, undefined, { allowIpLiterals: options.httpSources?.allowIpLiterals === true });
        } catch (e) {
            throw new ConfigError(`${at}.url: ${/** @type {Error} */ (e).message}`);
        }
        headersOf(backend.headers, `${at}.headers`);
        if (backend.timeMs !== undefined && (backend.timeMs < 1 || backend.timeMs > HTTP_MAX.timeMs)) {
            throw new ConfigError(`${at}.timeMs: 1 to ${HTTP_MAX.timeMs}`);
        }
    }
    const profiles = Object.values(options.policy?.profiles ?? {});
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (!source.http) {
            continue;
        }
        // a field the backend adds later must not be shown without anyone deciding
        if ([undefined, ...profiles].some((profile) => resolvePolicy(options.policy, source.policy, profile).default === "show")) {
            throw new ConfigError(`sources.${id}.policy: an HTTP source needs a default that is not "show", under the server's policy and every profile: a field the backend adds later would be shown without anyone deciding; set sources.${id}.policy.default to "hide" and list the fields to show in sources.${id}.policy.fields`);
        }
        compiled.set(source, compileSource(options, id, source));
    }
}
