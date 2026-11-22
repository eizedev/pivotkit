/*
 * The options of HTTP sources: `httpSources` (on or off, IP addresses as hosts, backends defined once
 * for many sources) and `sources.<id>.http` (the address template, its query and headers, where the
 * rows are, paging, limits). The shared keys `params`, `ttl`, `maxStale` and `timeMs` are
 * options/base.js's; this fragment gives them their defaults for an HTTP source.
 *
 * Everything is checked here at start and compiled once (httpSettingsOf): the template
 * (sources/template.js), the JSON Pointers, the headers, the paging and the effective limits, so a
 * load only fills in a caller's values. A backend's sign-in (`http.auth`, or a backend's `auth`) is
 * checked here too and compiled into `HttpSettings.auth` (backendAuthOf); sources/auth.js uses it:
 * a header from a secret, OAuth client credentials, or the RFC 8693 token exchange for the signed-in
 * person. A secret is always a reference (SECRET_REF), read when it is used, never here.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses a
 * second declaration).
 */

import { createHash } from "node:crypto";
import { issuerRulesOf } from "../issuer.js";
import { resolvePolicy } from "../policy.js";
import { canonicalJson } from "../sources/keys.js";
import { compileTemplate } from "../sources/template.js";
import { ConfigError, SECRET_REF, throwRange } from "./shared.js";

export const NAME = "http";

/**
 * @typedef {object} HttpBackendOptions  a backend many sources share (httpSources.backends.<name>)
 * @property {string} url  https:// origin and path prefix, no query
 * @property {boolean} [intranet]  loopback and private addresses may be reached (default false)
 * @property {Record<string, string>} [headers]  static headers, under each source's
 * @property {BackendAuthOptions} [auth]  the backend's sign-in, for every source that names no auth of its own
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
 * @property {BackendAuthOptions} [auth]  the backend's sign-in (default: the backend's auth)
 * @property {string} [rows]  JSON Pointer to the rows (default "": the body is the list)
 * @property {"json" | "csv"} [format]
 * @property {string} [asOf]  JSON Pointer to the body's own time (ISO 8601 or epoch seconds)
 * @property {{ next: string } | { link: true } | { page: string, start?: number } | { offset: string, limit: string, size: number }} [paging]
 * @property {number} [maxPages]  1 to 100 (default 10)
 * @property {number} [maxBytes]  all pages together (default 20 MiB, at most limits.fileBytes)
 */

/**
 * @typedef {{ env: string } | { file: string }} SecretRef
 * @typedef {object} BackendAuthOptions  exactly one of header, clientCredentials, tokenExchange
 * @property {{ name?: string, prefix?: string, value: SecretRef }} [header]  a static header from a secret
 * @property {{ tokenUrl: string, clientId: string, clientSecret?: SecretRef, assertion?: SecretRef, scope?: string, audience?: string, resource?: string, intranet?: boolean }} [clientCredentials]
 * @property {{ tokenUrl?: string, clientId: string, clientSecret: SecretRef, audience?: string, resource?: string, scope?: string, maxAgeSeconds?: number, intranet?: boolean }} [tokenExchange]
 */

/** The defaults of a backend's sign-in. */
export const AUTH_DEFAULTS = Object.freeze({ headerName: "authorization", maxAgeSeconds: 300, maxAgeMax: 86_400 });

/** The defaults of an HTTP source (a backend's value, then the source's own, win). */
export const HTTP_DEFAULTS = Object.freeze({ ttl: 60, maxStale: 3600, timeMs: 15_000, maxBytes: 20_971_520, maxPages: 10, format: "json" });

/** The most pages and the longest load an HTTP source may have. */
export const HTTP_MAX = Object.freeze({ pages: 100, timeMs: 600_000 });

/** The headers no configuration sets: the connection's own (and what a proxy adds). */
const CONNECTION_HEADERS = /^(host|content-length|transfer-encoding|connection|te|trailer|upgrade|keep-alive|accept-encoding|proxy-.*|x-forwarded-.*|forwarded)$/i;

/** The sign-in headers, which go to http.auth (a secret reference), never to http.headers (a literal). */
const SIGN_IN_HEADERS = /^(authorization|cookie)$/i;

/** A header's name (RFC 9110 token). */
export const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;

/** A header's value: printable Latin-1 and tab, no line break, no NUL. */
export const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]{0,1000}$/;

/** The words in a header's or query parameter's name that look like a secret's. */
export const SECRET_NAME = /key|token|secret|auth|pass/i;

/** What a paging setting is. */
const PAGING = { custom: pagingProblems };

/** A map of texts (headers, query). */
const TEXTS = { map: "string" };

/** A backend's sign-in (http.auth, httpSources.backends.<name>.auth): its keys; backendAuthOf checks the rest. */
const AUTH = {
    object: {
        header: { object: { name: "string", prefix: "string", value: SECRET_REF } },
        clientCredentials: { object: { tokenUrl: "string", clientId: "string", clientSecret: SECRET_REF, assertion: SECRET_REF, scope: "string", audience: "string", resource: "string", intranet: "boolean" } },
        tokenExchange: { object: { tokenUrl: "string", clientId: "string", clientSecret: SECRET_REF, audience: "string", resource: "string", scope: "string", maxAgeSeconds: "integer", intranet: "boolean" } }
    }
};

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    top: {
        httpSources: {
            object: {
                enabled: "boolean",
                allowIpLiterals: "boolean",
                backends: { map: { object: { url: "string", intranet: "boolean", headers: TEXTS, auth: AUTH, timeMs: "integer", maxBytes: "integer", ttl: "integer", maxStale: "integer" } } }
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
                auth: AUTH,
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
export function pointerProblem(text) {
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
 * @property {BackendAuth | null} auth  the backend's sign-in (the source's own, else its backend's)
 */

/**
 * A backend's sign-in as sources/auth.js uses it, checked and compiled once. `hash` names the
 * settings (never a secret: the references only) for the token cache; `at` is where it is configured,
 * for messages.
 * @typedef {{ kind: "header", at: string, hash: string, name: string, prefix: string, value: SecretRef, baseDir: string | undefined }
 *   | { kind: "clientCredentials", at: string, hash: string, tokenUrl: string, clientId: string, clientSecret: SecretRef | null, assertion: SecretRef | null, scope: string | null, audience: string | null, resource: string | null, intranet: boolean, allowIpLiterals: boolean, baseDir: string | undefined }
 *   | { kind: "tokenExchange", at: string, hash: string, tokenUrl: string | null, issuer: string | null, issuerRules: import("../issuer.js").IssuerRules, clientId: string, clientSecret: SecretRef, scope: string | null, audience: string | null, resource: string | null, maxAgeSeconds: number, intranet: boolean, allowIpLiterals: boolean, baseDir: string | undefined }} BackendAuth
 */

/** A text of the sign-in's settings (a client id, a scope): no control characters, at most `max`. */
const plainText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && !/\p{Cc}/u.test(value);

/**
 * Checks a token endpoint's address: https://, no user name or password, no fragment, an IP
 * address only with httpSources.allowIpLiterals. Throws ConfigError.
 * @param {string} text
 * @param {string} at
 * @param {boolean} allowIpLiterals
 */
function tokenUrlOf(text, at, allowIpLiterals) {
    let url;
    try {
        url = new URL(text);
    } catch {
        throw new ConfigError(`${at}: an https:// address`);
    }
    if (url.protocol !== "https:") {
        throw new ConfigError(`${at}: must start with https:// (the token endpoint gets the client's secret)`);
    }
    if (url.username || url.password || url.hash) {
        throw new ConfigError(`${at}: no user name, password or fragment in the address (the client's secret goes in clientSecret)`);
    }
    if (!allowIpLiterals && /^\[|^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
        throw new ConfigError(`${at}: an IP address as the host is refused unless httpSources.allowIpLiterals is true; use the host's name`);
    }
    return url.href;
}

/**
 * Checks and compiles a backend's sign-in (http.auth or httpSources.backends.<name>.auth); throws
 * ConfigError. The keys themselves (and each secret reference) were checked by the options' schema.
 * @param {import("../config.js").ServerOptions} options
 * @param {BackendAuthOptions} auth
 * @param {string} at  where it is configured
 * @param {Record<string, string>} headers  the static headers the requests carry (names in lower case)
 * @returns {BackendAuth}
 */
export function backendAuthOf(options, auth, at, headers) {
    const kinds = ["header", "clientCredentials", "tokenExchange"].filter((k) => /** @type {any} */ (auth)[k] !== undefined);
    if (kinds.length !== 1) {
        throw new ConfigError(`${at}: exactly one of header, clientCredentials or tokenExchange`);
    }
    const kind = kinds[0];
    const allowIpLiterals = options.httpSources?.allowIpLiterals === true;
    const hash = createHash("sha256").update(canonicalJson([at, options.baseDir ?? null, auth])).digest("base64url");
    const common = { at: `${at}.${kind}`, hash, baseDir: options.baseDir };
    const texts = (given, keys) => {
        for (const key of keys) {
            if (given[key] !== undefined && !plainText(given[key], 1000)) {
                throw new ConfigError(`${at}.${kind}.${key}: a text of at most 1000 characters without control characters`);
            }
        }
        if (given.resource !== undefined && !URL.canParse(given.resource)) {
            throw new ConfigError(`${at}.${kind}.resource: an absolute URI (RFC 8707), such as https://api.example.com/`);
        }
    };
    if (kind === "header") {
        const h = /** @type {NonNullable<BackendAuthOptions["header"]>} */ (auth.header);
        const name = (h.name ?? AUTH_DEFAULTS.headerName).toLowerCase();
        if (!HEADER_NAME.test(name) || CONNECTION_HEADERS.test(name)) {
            throw new ConfigError(`${at}.header.name: a header's name that the connection does not set itself (such as authorization or x-api-key)`);
        }
        if (Object.hasOwn(headers, name)) {
            throw new ConfigError(`${at}.header.name: ${name} is also a static header (http.headers); a request carries it once`);
        }
        if (h.prefix !== undefined && !/^[\x20-\x7e]{0,100}$/.test(h.prefix)) {
            throw new ConfigError(`${at}.header.prefix: printable ASCII, at most 100 characters (such as "Bearer ")`);
        }
        if (h.value === undefined) {
            throw new ConfigError(`${at}.header.value: the secret reference, { "env": "NAME" } or { "file": "path" }`);
        }
        return Object.freeze({ ...common, kind: /** @type {const} */ ("header"), name, prefix: h.prefix ?? "", value: h.value });
    }
    if (kind === "clientCredentials") {
        const c = /** @type {NonNullable<BackendAuthOptions["clientCredentials"]>} */ (auth.clientCredentials);
        if (typeof c.tokenUrl !== "string") {
            throw new ConfigError(`${at}.clientCredentials.tokenUrl: the token endpoint's https:// address`);
        }
        if (!plainText(c.clientId, 200)) {
            throw new ConfigError(`${at}.clientCredentials.clientId: the client's id, a text of at most 200 characters`);
        }
        if ((c.clientSecret === undefined) === (c.assertion === undefined)) {
            throw new ConfigError(`${at}.clientCredentials: either clientSecret or assertion (a JWT such as a Kubernetes service account token), as a secret reference`);
        }
        texts(c, ["scope", "audience", "resource"]);
        return Object.freeze({ ...common, kind: /** @type {const} */ ("clientCredentials"), tokenUrl: tokenUrlOf(c.tokenUrl, `${at}.clientCredentials.tokenUrl`, allowIpLiterals), clientId: c.clientId, clientSecret: c.clientSecret ?? null, assertion: c.assertion ?? null, scope: c.scope ?? null, audience: c.audience ?? null, resource: c.resource ?? null, intranet: c.intranet === true, allowIpLiterals });
    }
    const x = /** @type {NonNullable<BackendAuthOptions["tokenExchange"]>} */ (auth.tokenExchange);
    if (options.auth?.mode !== "oauth") {
        throw new ConfigError(`${at}.tokenExchange: needs auth.mode "oauth": the token exchange is made with the signed-in person's token`);
    }
    if (!plainText(x.clientId, 200)) {
        throw new ConfigError(`${at}.tokenExchange.clientId: pivotkit's client id at the token endpoint, a text of at most 200 characters`);
    }
    if (x.clientSecret === undefined) {
        throw new ConfigError(`${at}.tokenExchange.clientSecret: the client's secret, as a secret reference (only a confidential client may exchange tokens)`);
    }
    if (x.audience === undefined && x.resource === undefined) {
        throw new ConfigError(`${at}.tokenExchange: audience or resource names the backend the exchanged token is for`);
    }
    texts(x, ["scope", "audience", "resource"]);
    if (x.maxAgeSeconds !== undefined && (x.maxAgeSeconds < 1 || x.maxAgeSeconds > AUTH_DEFAULTS.maxAgeMax)) {
        throw new ConfigError(`${at}.tokenExchange.maxAgeSeconds: 1 to ${AUTH_DEFAULTS.maxAgeMax}`);
    }
    return Object.freeze({
        ...common,
        kind: /** @type {const} */ ("tokenExchange"),
        tokenUrl: x.tokenUrl !== undefined ? tokenUrlOf(x.tokenUrl, `${at}.tokenExchange.tokenUrl`, allowIpLiterals) : null,
        issuer: options.auth?.issuer ?? null,
        // the issuer's metadata (its default token endpoint) is read under auth.issuer's rules (issuer.js)
        issuerRules: issuerRulesOf(options),
        clientId: x.clientId,
        clientSecret: x.clientSecret,
        scope: x.scope ?? null,
        audience: x.audience ?? null,
        resource: x.resource ?? null,
        maxAgeSeconds: x.maxAgeSeconds ?? AUTH_DEFAULTS.maxAgeSeconds,
        intranet: x.intranet === true,
        allowIpLiterals
    });
}

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
        if (CONNECTION_HEADERS.test(name)) {
            throw new ConfigError(`${path}.${name}: this header is set by the connection, not by the configuration`);
        }
        if (SIGN_IN_HEADERS.test(name)) {
            throw new ConfigError(`${path}.${name}: a sign-in header holds a secret, which is never written in the configuration; set the backend's sign-in in http.auth (a header from a secret reference, client credentials or token exchange)`);
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
 * An HTTP source's numbers out of their range (its pages, bytes and time, with its backend's), as
 * messages: validate collects them, compileSource throws the first.
 * @param {import("../config.js").ServerOptions} options
 * @param {string} id
 * @param {any} source
 * @param {any} backend  the source's backend, if it names one
 * @returns {string[]}
 */
function numberProblems(options, id, source, backend) {
    const http = source.http;
    const at = `sources.${id}.http`;
    const out = [];
    if (http.maxPages !== undefined && (http.maxPages < 1 || http.maxPages > HTTP_MAX.pages)) {
        out.push(`${at}.maxPages: 1 to ${HTTP_MAX.pages}`);
    }
    const maxBytes = http.maxBytes ?? backend?.maxBytes ?? HTTP_DEFAULTS.maxBytes;
    const fileBytes = options.limits?.fileBytes;
    if (maxBytes < 1 || (fileBytes !== undefined && maxBytes > fileBytes)) {
        out.push(`${at}.maxBytes: 1 to limits.fileBytes${fileBytes !== undefined ? ` (${fileBytes})` : ""}`);
    }
    // a backend's own timeMs is checked with the backends
    if (source.timeMs !== undefined && source.timeMs > HTTP_MAX.timeMs) {
        out.push(`sources.${id}.timeMs: at most ${HTTP_MAX.timeMs} (ten minutes)`);
    }
    return out;
}

/**
 * Compiles one HTTP source; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 * @param {string} id
 * @param {any} source
 * @param {Map<string, BackendAuth>} backendAuths  each backend's compiled sign-in, by name
 * @returns {HttpSettings}
 */
function compileSource(options, id, source, backendAuths) {
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
        // a query's problem under http.query ("query.state: ..."), the address's under path or url
        const message = /** @type {Error} */ (e).message;
        throw new ConfigError(/^query[.:]/.test(message) ? `${at}.${message}` : `${at}.${hasBackend ? "path" : "url"}: ${message}`);
    }
    const [outOfRange] = numberProblems(options, id, source, backend);
    if (outOfRange) {
        throw new ConfigError(outOfRange);
    }
    const maxBytes = http.maxBytes ?? backend?.maxBytes ?? HTTP_DEFAULTS.maxBytes;
    const timeMs = source.timeMs ?? backend?.timeMs ?? HTTP_DEFAULTS.timeMs;
    // a backend's settings were checked with the backends; its headers merged under the source's
    const headers = { ...(backend ? headersOf(backend.headers, `httpSources.backends.${http.backend}.headers`) : {}), ...headersOf(http.headers, `${at}.headers`) };
    // the source's own sign-in, else its backend's (compiled once per backend, so its sources share a token)
    const auth = http.auth !== undefined ? backendAuthOf(options, http.auth, `${at}.auth`, headers) : hasBackend ? (backendAuths.get(http.backend) ?? null) : null;
    if (auth && hasBackend && http.auth === undefined && auth.kind === "header" && Object.hasOwn(headers, auth.name)) {
        throw new ConfigError(`${at}.headers.${auth.name}: the backend's sign-in (httpSources.backends.${http.backend}.auth) sets this header`);
    }
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
        secretLooking,
        auth
    });
}

/**
 * Checks the rules between these keys and compiles every HTTP source; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 * @param {import("./shared.js").RangeProblem} [range]  where a value out of its range goes (validateOptions collects them)
 */
export function validate(options, range = throwRange) {
    /** @type {Map<string, BackendAuth>} */
    const backendAuths = new Map();
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
        const headers = headersOf(backend.headers, `${at}.headers`);
        if (backend.auth !== undefined) {
            backendAuths.set(name, backendAuthOf(options, backend.auth, `${at}.auth`, headers));
        }
        if (backend.timeMs !== undefined && (backend.timeMs < 1 || backend.timeMs > HTTP_MAX.timeMs)) {
            range(`${at}.timeMs: 1 to ${HTTP_MAX.timeMs}`);
        }
    }
    const profiles = Object.values(options.policy?.profiles ?? {});
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        // a parameter bound to a claim (HTTP and code sources) is filled from a verified token's claim
        const claimed = Object.entries(source.params ?? {}).find(([, p]) => p && typeof p === "object" && p.claim !== undefined);
        if (claimed && options.auth?.mode !== "oauth") {
            throw new ConfigError(`sources.${id}.params.${claimed[0]}.claim: needs auth.mode "oauth": the value comes from the signed-in person's verified token`);
        }
        if (!source.http) {
            continue;
        }
        // a field the backend adds later must not be shown without anyone deciding
        if ([undefined, ...profiles].some((profile) => resolvePolicy(options.policy, source.policy, profile).default === "show")) {
            throw new ConfigError(`sources.${id}.policy: an HTTP source needs a default that is not "show", under the server's policy and every profile: a field the backend adds later would be shown without anyone deciding; set sources.${id}.policy.default to "hide" and list the fields to show in sources.${id}.policy.fields`);
        }
        // its numbers out of range are said all at once; the rest of the source is checked once they fit
        const backends = options.httpSources?.backends ?? {};
        const numbers = numberProblems(options, id, source, Object.hasOwn(backends, source.http.backend ?? "") ? backends[source.http.backend] : undefined);
        if (numbers.length) {
            numbers.forEach((message) => range(message));
            continue;
        }
        compiled.set(source, compileSource(options, id, source, backendAuths));
    }
}
