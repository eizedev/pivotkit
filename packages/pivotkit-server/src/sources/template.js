/*
 * The address of an HTTP source: a URL template the operator writes, checked once at start
 * (compileTemplate) and filled with a caller's checked values on every load (expandUrl).
 *
 *   https://api.example.com/v1/customers/{customer}/vms     the path holds the expressions
 *   query: { "state": "{state}", "limit": "500" }            query values: a literal or one {name}
 *
 * Rules, so a caller's value can never change where a request goes:
 * - https:// only; no user name or password, no fragment and no "?" in the template (query values
 *   only through `query`); no expression in the host or the port.
 * - An expression is a declared parameter's name in braces, at most one per path segment, with
 *   literal text around it allowed ("{id}.json", "v{version}"). A parameter in the path must be
 *   required or have a default (the address cannot be built without it).
 * - Expansion is RFC 6570 level 1 (simple string expansion): every character but the unreserved
 *   ones (letters, digits, "-", ".", "_", "~") is percent-encoded, so "/", "?", "#", "&", "=", "+",
 *   ";" and a space ("%20") stay inside their segment or value. Numbers and booleans are written by
 *   pivotkit (String of the checked value), never the caller's text.
 * - The URL is built once with WHATWG URL and must keep the template's origin and its number of
 *   path segments; no expanded segment may be empty, "." or ".." (encoded or not).
 */

import { isIP } from "node:net";

/** An expression: a parameter's name in braces. */
const EXPRESSION = /\{([A-Za-z_][A-Za-z0-9_]{0,63})\}/g;

/** The characters a literal part of a path segment may hold (RFC 3986 pchar, "%" for an escape). */
const PCHAR = /^[A-Za-z0-9\-._~!$&'()*+,;=:@%]*$/;

/** A query parameter's name as a template writes it. */
const QUERY_NAME = /^[A-Za-z0-9\-._~[\]]{1,64}$/;

/** The text of an expression in the URL outside the path. */
export const PATH_ONLY = "expressions in the URL are allowed in the path only; for a query value use http.query";

/**
 * A value as RFC 6570 simple string expansion writes it: everything but the unreserved characters
 * percent-encoded (UTF-8).
 * @param {string} text
 */
export const encodeValue = (text) => encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * @typedef {object} PathSegment
 * @property {string} prefix  literal text before the expression (or the whole segment)
 * @property {string | null} name  the parameter, or null for a literal segment
 * @property {string} suffix  literal text after the expression
 */

/**
 * @typedef {object} CompiledTemplate
 * @property {string} text  the template as written (the log names it, never with values)
 * @property {string} origin  the URL's origin
 * @property {PathSegment[]} segments  the path's segments (after the first "/")
 * @property {Array<{ name: string, value: string | null, param: string | null }>} query  in the order written; param: a value of one {name}
 * @property {Set<string>} uses  the parameters the template names
 */

/**
 * Checks a URL template and its query against the declared parameters; throws Error with what is
 * wrong (options/http.js turns it into a ConfigError with the key's path).
 * @param {string} template  a full https:// URL template
 * @param {Record<string, string> | undefined} query
 * @param {Record<string, any> | undefined} declared  sources.<id>.params
 * @param {{ allowIpLiterals?: boolean, reserved?: string[] }} [how]  reserved: query names pivotkit fills itself (paging)
 * @returns {CompiledTemplate}
 */
export function compileTemplate(template, query, declared, how = {}) {
    if (typeof template !== "string" || !template) {
        throw new Error("is an https:// address");
    }
    const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(.*)$/s.exec(template);
    if (!match) {
        throw new Error("is an https:// address");
    }
    const [, scheme, authority, path, rest] = match;
    if (scheme.toLowerCase() !== "https") {
        throw new Error("must start with https://");
    }
    if (rest) {
        throw new Error(rest.startsWith("#") ? "has no fragment (#)" : `has no "?": ${PATH_ONLY.split("; ")[1]}`);
    }
    if (/[{}]/.test(authority)) {
        throw new Error(PATH_ONLY);
    }
    if (authority.includes("@")) {
        throw new Error("has no user name or password; a backend's sign-in comes from its configuration, never from the address");
    }
    let base;
    try {
        base = new URL(`https://${authority}/`);
    } catch {
        throw new Error("has no valid host");
    }
    if (!base.hostname) {
        throw new Error("has no host");
    }
    if (isIP(base.hostname.replace(/^\[|\]$/g, "")) && !how.allowIpLiterals) {
        throw new Error("names its host by an IP address; name the server (or set httpSources.allowIpLiterals)");
    }
    const names = new Set(Object.keys(declared ?? {}));
    /** @type {Set<string>} */
    const uses = new Set();
    const useParam = (name) => {
        if (!names.has(name)) {
            throw new Error(`names {${name}}, which is no declared parameter (sources.<id>.params)`);
        }
        uses.add(name);
    };
    /** @type {PathSegment[]} */
    const segments = [];
    const parts = path === "" ? [] : path.slice(1).split("/");
    for (const segment of parts) {
        const found = [...segment.matchAll(EXPRESSION)];
        const stray = segment.replace(EXPRESSION, "");
        if (/[{}]/.test(stray)) {
            throw new Error(`has a "{" or "}" that is no expression in the segment ${JSON.stringify(segment.slice(0, 60))}; an expression is {name}`);
        }
        if (found.length > 1) {
            throw new Error(`has more than one expression in the segment ${JSON.stringify(segment.slice(0, 60))}; one per path segment`);
        }
        const name = found[0]?.[1] ?? null;
        const at = found[0]?.index ?? segment.length;
        const prefix = segment.slice(0, at);
        const suffix = name ? segment.slice(at + name.length + 2) : "";
        for (const literal of [prefix, suffix]) {
            if (!PCHAR.test(literal) || /%(?![0-9A-Fa-f]{2})/.test(literal)) {
                throw new Error(`has a character in the path that must be percent-encoded: ${JSON.stringify(literal.slice(0, 60))}`);
            }
        }
        if (!name && (segment === "." || segment === ".." || /^(?:%2e|\.){1,2}$/i.test(segment))) {
            throw new Error('has a path segment "." or ".."');
        }
        if (name) {
            useParam(name);
            const p = declared?.[name];
            if (!p?.required && p?.default === undefined) {
                throw new Error(`names {${name}} in the path, so params.${name} must be required or have a default`);
            }
        }
        segments.push({ prefix, name, suffix });
    }
    /** @type {CompiledTemplate["query"]} */
    const entries = [];
    const seen = new Set((how.reserved ?? []).map((n) => n.toLowerCase()));
    for (const [name, value] of Object.entries(query ?? {})) {
        if (!QUERY_NAME.test(name)) {
            throw new Error(`query: ${JSON.stringify(name.slice(0, 60))} is no query name (letters, digits and - . _ ~ [ ], at most 64)`);
        }
        if (seen.has(name.toLowerCase())) {
            throw new Error(`query: ${name} is given twice (names are compared without case), or is a name the paging fills`);
        }
        seen.add(name.toLowerCase());
        if (typeof value !== "string") {
            throw new Error(`query.${name}: a text, a literal or one {name}`);
        }
        const whole = /^\{([A-Za-z_][A-Za-z0-9_]{0,63})\}$/.exec(value);
        if (whole) {
            useParam(whole[1]);
            entries.push({ name, value: null, param: whole[1] });
        } else if (/[{}]/.test(value)) {
            throw new Error(`query.${name}: a value is a literal or exactly one {name}`);
        } else {
            entries.push({ name, value, param: null });
        }
    }
    return { text: template, origin: base.origin, segments, query: entries, uses };
}

/**
 * The URL of a request: the template filled with checked values (and the paging's own query
 * values). A query parameter without a value is left out. Throws Error when the URL does not keep
 * the template's origin and shape (a value no check caught: the load fails, nothing is requested).
 * @param {CompiledTemplate} compiled
 * @param {Record<string, string | number | boolean> | null} values  normalizeParams'
 * @param {Record<string, string | number>} [extra]  query values pivotkit fills (paging)
 * @returns {URL}
 */
export function expandUrl(compiled, values, extra = {}) {
    const text = (v) => (typeof v === "string" ? v : String(v));
    const filled = compiled.segments.map((s) => {
        if (!s.name) {
            return `${s.prefix}`;
        }
        const value = values?.[s.name];
        if (value === undefined) {
            throw new Error(`the path needs {${s.name}}`);
        }
        const encoded = encodeValue(text(value));
        if (encoded === "" || /^(?:\.|%2e){1,2}$/i.test(encoded)) {
            throw new Error(`{${s.name}} cannot be an empty, "." or ".." path segment`);
        }
        return `${s.prefix}${encoded}${s.suffix}`;
    });
    const pairs = [];
    for (const q of compiled.query) {
        const value = q.param ? values?.[q.param] : q.value;
        if (value !== undefined && value !== null) {
            pairs.push(`${encodeValue(q.name)}=${encodeValue(text(value))}`);
        }
    }
    for (const [name, value] of Object.entries(extra)) {
        pairs.push(`${encodeValue(name)}=${encodeValue(text(value))}`);
    }
    const url = new URL(`${compiled.origin}${filled.length ? `/${filled.join("/")}` : "/"}${pairs.length ? `?${pairs.join("&")}` : ""}`);
    const got = url.pathname === "/" && !filled.length ? [] : url.pathname.slice(1).split("/");
    if (url.origin !== compiled.origin || got.length !== Math.max(filled.length, 0) || got.some((seg, i) => seg !== filled[i])) {
        throw new Error("the filled address does not keep the template's host and path");
    }
    return url;
}

/**
 * The path and query of a request as the log may write it: each value replaced by {name}.
 * @param {CompiledTemplate} compiled
 * @param {Record<string, string | number>} [extra]
 */
export function loggedPath(compiled, extra = {}) {
    const path = compiled.segments.map((s) => (s.name ? `${s.prefix}{${s.name}}${s.suffix}` : s.prefix)).join("/");
    const query = [...compiled.query.map((q) => `${q.name}=${q.param ? `{${q.param}}` : q.value}`), ...Object.entries(extra).map(([k, v]) => `${k}=${v}`)];
    return `/${path}${query.length ? `?${query.join("&")}` : ""}`;
}
