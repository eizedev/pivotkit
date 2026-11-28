/*
 * What a report with a `server` asks the server for (record 0021), read from the page's own
 * configuration and its address, without a DOM. Part of server-module.js: it loads on first use.
 *
 * - The server's address comes from `server.url`, which the page names in its own code. A link never
 *   names it: neither the query nor the fragment can point the report at another server.
 * - The source comes from `server.source` only. A view link's `src` does not change it.
 * - The parameters come from the page's query string, only the names in `server.allowParams`. A name
 *   given twice counts once: its first value.
 * - The link's access level is the query's `pk-access`, passed on as it is; the server checks it.
 */

import { ACCESS_PARAM } from "./share.js";

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
 * @returns {{ request: import("./server.js").ServerRequest } | { problem: string } | null}  null: no server
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
 * @param {import("./server.js").ServerRequest | null | undefined} request
 * @returns {Array<[string, string]>}
 */
export function keptQuery(request) {
    if (!request) {
        return [];
    }
    return [...Object.entries(request.params), ...(request.access ? [/** @type {[string, string]} */ ([ACCESS_PARAM, request.access])] : [])];
}
