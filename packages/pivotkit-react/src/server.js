/*
 * The `server` connection's first-load part (record 0021): what to ask the server for, read from the
 * page's own configuration and its address, without a DOM. The network code, the texts and the
 * states' parts load on first use (server-module.js, through loadServer), so a page without a server
 * loads none of it.
 *
 * - The server's address comes from `server.url`, which the page names in its own code. A link never
 *   names it: neither the query nor the fragment can point the report at another server.
 * - The source comes from `server.source` only. A view link's `src` does not change it.
 * - The parameters come from the page's query string, only the names in `server.allowParams`. A name
 *   given twice counts once: its first value.
 * - The link's access level is the query's `pk-access`, passed on as it is; the server checks it.
 */

import { lazy } from "./lazy.js";

/** The query parameter of a live link's access level (pivotkit-server's link-access.js). */
export const ACCESS_PARAM = "pk-access";

/** The rows route and the exchange route under a server's address. */
export const ROWS_PATH = "/api/v1/sources/records";

/** The network code, the states' texts and parts, loaded once (lazy.js). */
const mod = lazy(() => import("./server-module.js"));

/** Loads the server's module; a failed import is tried again on the next call. */
export const loadServer = mod.load;

/**
 * @typedef {object} ServerConnection  the `server` prop
 * @property {string} url  the server's address, as the page's own configuration has it (https://reports.example.com)
 * @property {string} source  the source id whose rows the report shows
 * @property {(request: TokenRequest) => unknown} getToken  gives a browser token for the request:
 *   its text, or the exchange route's answer (`{ token, expiresAt }`), or a promise of either. It is
 *   called at the start and again when the token expired. Nothing (null, "") means the person must
 *   sign in again. An error with a `problem` (the exchange route's answer) says why it was refused
 * @property {string[]} [allowParams]  the names of the source's parameters the page's query string may set
 * @property {string | number} [refreshKey]  a new value reads the rows again; the report keeps showing
 *   the rows it has until the new ones are there
 */

/**
 * @typedef {object} TokenRequest  what getToken() gets: what the exchange route takes
 * @property {string} source
 * @property {Record<string, string>} params
 * @property {string} [access]  the link's pk-access value, where the page's address has one
 */

/**
 * @typedef {object} ServerRequest  what the report asks the server for
 * @property {string} base  the server's address, without a slash at the end
 * @property {string} source
 * @property {Record<string, string>} params
 * @property {string | undefined} access
 * @property {string} key  the request as text: a new key reads the rows again
 */

/**
 * The server's address as the report uses it: an http or https URL without query and fragment, and
 * without a slash at the end; null for anything else.
 * @param {unknown} url
 */
export function serverBase(url) {
    if (typeof url !== "string" || !url.trim()) {
        return null;
    }
    try {
        const u = new URL(url.trim());
        if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) {
            return null;
        }
        return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
        return null;
    }
}

/**
 * What the report asks the server for, or why it cannot (a mistake of the page, said in the console).
 * @param {unknown} server  the prop
 * @param {string} search  the page's query string (location.search), "" before the first render ran
 * @returns {{ request: ServerRequest } | { problem: string } | null}  null: no server
 */
export function serverRequestOf(server, search) {
    if (server === undefined || server === null) {
        return null;
    }
    const s = /** @type {Record<string, unknown>} */ (server);
    const base = serverBase(s.url);
    if (!base) {
        return { problem: "server.url must be an http or https address without a user name" };
    }
    if (typeof s.source !== "string" || !s.source.trim()) {
        return { problem: "server.source must name a source" };
    }
    if (typeof s.getToken !== "function") {
        return { problem: "server.getToken must be a function that gives a browser token" };
    }
    const query = new URLSearchParams(search);
    const names = Array.isArray(s.allowParams) ? [...new Set(s.allowParams.filter((n) => typeof n === "string" && n !== ACCESS_PARAM))] : [];
    /** @type {Record<string, string>} */
    const params = {};
    for (const name of names) {
        const value = query.get(name);
        if (value !== null) {
            // a name such as "__proto__" stays a plain key of its own
            Object.defineProperty(params, name, { value, enumerable: true, writable: true, configurable: true });
        }
    }
    const access = query.get(ACCESS_PARAM) ?? undefined;
    const source = s.source.trim();
    const refresh = typeof s.refreshKey === "string" || typeof s.refreshKey === "number" ? s.refreshKey : "";
    const key = JSON.stringify([base, source, Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)), access ?? null, refresh]);
    return { request: { base, source, params, access, key } };
}

/**
 * The query entries a copied link keeps on a report with a server: the parameters it read, and the
 * link's access level, which only narrows who may open it.
 * @param {ServerRequest | null | undefined} request
 * @returns {Array<[string, string]>}
 */
export function keptQuery(request) {
    if (!request) {
        return [];
    }
    return [...Object.entries(request.params), ...(request.access ? [/** @type {[string, string]} */ ([ACCESS_PARAM, request.access])] : [])];
}

/**
 * The parameters as people read them: "customer: acme, year: 2026".
 * @param {Array<[string, string]>} entries
 */
export const paramsText = (entries) =>
    entries
        .filter(([name]) => name !== ACCESS_PARAM)
        .map(([name, value]) => `${name}: ${value}`)
        .join(", ");

/**
 * A URL with these query entries set (each replaces one of its name), the rest of it as it is.
 * @param {string} url
 * @param {Array<[string, string]>} entries
 */
export function withQuery(url, entries) {
    if (!entries.length) {
        return url;
    }
    try {
        const u = new URL(url);
        for (const [name, value] of entries) {
            u.searchParams.set(name, value);
        }
        return u.toString();
    } catch {
        return url;
    }
}
