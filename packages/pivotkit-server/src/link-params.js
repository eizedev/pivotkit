/*
 * Link parameters (sources.<id>.linkParams, record 0016): the parameters of a source that a link from
 * create_link may carry. Their values go into the page's query string, so a host application's
 * backend can read them. The view stays in the fragment (pivotkit-core's withLinkFragment).
 *
 *   linkParamsProblem(source, id)          what is wrong with a source's list (the config check)
 *   checkLinkParams(source, given, id)     refuses a caller's name the list leaves out
 *   linkParamsOf(source)                   what list_sources names
 *   linkEntriesOf(source, given, values)   the names and values a link carries
 *   withLinkQuery(url, entries)            the page's address with the values in its query
 *
 * A parameter bound to a sign-in claim never goes into a link: the list may not name one, and the
 * value written is always one the caller gave, never a claim's or a default.
 */

import { OperationError } from "pivotkit-report/operations";

/**
 * What is wrong with a source's linkParams, or null. The list needs the source's link and its params.
 * It names declared parameters only, each once, none bound to a claim, and every required one: a
 * link may carry only what it lists, so create_link could not read the source without it.
 * @param {Record<string, any>} source  a source's configuration (after the type check)
 * @param {string} id
 * @returns {string | null}
 */
export function linkParamsProblem(source, id) {
    const list = source.linkParams;
    if (list === undefined) {
        return null;
    }
    const path = `sources.${id}.linkParams`;
    if (source.link === undefined) {
        return `${path}: only a source with a link takes linkParams (sources.${id}.link)`;
    }
    const declared = source.params ?? {};
    const names = Object.keys(declared);
    if (!names.length) {
        return `${path}: the source declares no params (sources.${id}.params)`;
    }
    const seen = new Set();
    for (const name of list) {
        const p = Object.hasOwn(declared, name) ? declared[name] : undefined;
        if (!p) {
            const known = names.filter((n) => declared[n]?.claim === undefined);
            return `${path}: ${name.slice(0, 64)} is not one of the source's params (${known.join(", ")})`;
        }
        if (p.claim !== undefined) {
            return `${path}: ${name} is bound to the sign-in claim ${p.claim}; a link never carries it`;
        }
        if (seen.has(name)) {
            return `${path}: ${name} is listed twice`;
        }
        seen.add(name);
    }
    const missing = names.filter((n) => declared[n]?.required && declared[n].default === undefined && declared[n].claim === undefined && !seen.has(n));
    if (missing.length) {
        return `${path}: list ${missing.join(", ")} too: create_link needs every required parameter, and a link carries only the listed ones`;
    }
    return null;
}

/**
 * Refuses, for create_link, a parameter the caller gave that the source's list leaves out, naming the
 * allowed ones. A source without a list keeps create_link as it was: its params are read, the link
 * carries none. A name bound to a claim is left to normalizeParams, which says to leave it out.
 * Runs after the access check, so a source the caller may not use is never named.
 * @param {Record<string, any>} source
 * @param {unknown} given  the input's params
 * @param {string} id
 */
export function checkLinkParams(source, given, id) {
    const list = source.linkParams;
    if (!Array.isArray(list) || given === null || typeof given !== "object" || Array.isArray(given)) {
        return;
    }
    const declared = source.params ?? {};
    for (const name of Object.keys(given)) {
        const claimBound = Object.hasOwn(declared, name) && declared[name]?.claim !== undefined;
        if (!claimBound && !list.includes(name)) {
            const allowed = list.length ? `may carry ${list.join(", ")} only` : "carries no params";
            throw new OperationError("INVALID_INPUT", `a link to ${id} ${allowed}; leave out params.${JSON.stringify(name.slice(0, 64))} (the operator lists them in linkParams)`);
        }
    }
}

/**
 * The names list_sources gives for a source: its linkParams where it has a link and a list that is
 * not empty, else null.
 * @param {Record<string, any>} source
 * @returns {string[] | null}
 */
export function linkParamsOf(source) {
    return source.link && Array.isArray(source.linkParams) && source.linkParams.length ? [...source.linkParams] : null;
}

/**
 * The values a link carries: of the names the caller gave, those the list allows, each with the
 * value the server checked and wrote again (normalizeParams). Never a claim's value or a default.
 * @param {Record<string, any>} source
 * @param {unknown} given  the input's params
 * @param {Record<string, string | number | boolean> | null} values  normalizeParams' result
 * @returns {Array<[string, string]>}
 */
export function linkEntriesOf(source, given, values) {
    const list = linkParamsOf(source);
    if (!list || !values || given === null || typeof given !== "object") {
        return [];
    }
    const set = (name) => Object.hasOwn(given, name) && /** @type {any} */ (given)[name] !== undefined && /** @type {any} */ (given)[name] !== null;
    return list.filter((name) => set(name) && Object.hasOwn(values, name)).map((name) => [name, String(values[name])]);
}

/**
 * A page address with values in its query string. The query sits before the first "#", so a hash
 * route ("#/reports/a?tab=2") stays the fragment's. Entries of other names stay byte for byte; every
 * entry of a name set here goes, and the new one comes last. Without entries the address is returned
 * as it is.
 * @param {string} url
 * @param {Array<[string, string]>} entries
 * @returns {string}
 */
export function withLinkQuery(url, entries) {
    if (!entries.length) {
        return url;
    }
    const hashAt = url.indexOf("#");
    const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
    const fragment = hashAt === -1 ? "" : url.slice(hashAt);
    const queryAt = beforeHash.indexOf("?");
    const base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
    const query = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);
    const names = new Set(entries.map(([name]) => name));
    const kept = query.split("&").filter((entry) => entry !== "" && !names.has(nameOf(entry)));
    const added = entries.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    return `${base}?${[...kept, ...added].join("&")}${fragment}`;
}

/** The decoded name of a query entry ("a+b=1" is "a b"); the entry itself where it cannot be decoded. */
function nameOf(entry) {
    const at = entry.indexOf("=");
    const raw = (at === -1 ? entry : entry.slice(0, at)).replace(/\+/g, " ");
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}
