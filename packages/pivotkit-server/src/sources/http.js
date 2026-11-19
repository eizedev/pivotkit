/*
 * HTTP sources (sources.<id>.http): pivotkit requests an operator's backend with a caller's checked
 * values and reads the rows from its answer. The caller never gives an address: the operator's
 * template (sources/template.js) fixes the host and the path's shape, a value only fills its segment
 * or query value.
 *
 * Where it runs: the requests (guardedFetch, sources/fetch.js), parsing JSON (nested at most
 * MAX_DEPTH deep) and finding the rows (a JSON Pointer, own properties only) in the main thread,
 * where a backend's credentials would stay; the rows as plain values (a nested value as JSON text)
 * go to a worker, which encodes them and runs the operation as a table job. A JSON answer is read
 * while it streams (sources/json-rows.js): each row becomes a row of the table (tableBuilder) as it
 * arrives, so the page's bytes and its parsed objects are never held whole. Where the asOf or next
 * pointer reaches into the rows, the page is read whole instead (parsed). A CSV answer's bytes are
 * read in a worker (compute.js read), which gives back a packed table (packed.js) without the hidden
 * columns; that table is kept and goes to the operation's worker.
 *
 * Loading goes through sources/run.js like a code source's: the source's timeMs for all pages, one
 * load in flight per key, the load limits, kept data for ttl seconds per caller (the identity is
 * part of the key; a caller without one keeps and shares nothing; for a token exchange or a claim
 * the client and its scopes too; the caller's values and identity only as a keyed digest), an
 * answer kept without the columns the caller's levels hide (JSON and CSV alike), last good data
 * after a transient failure only.
 *
 * The backend's sign-in (http.auth) is sources/auth.js's: its headers go on every page, after the
 * static ones; a 401 drops the token it was sent and the page is asked once more with a new one.
 *
 * A backend's answer never reaches a caller in words: a status becomes a SourceError (BACKEND_ANSWERS)
 * whose text is pivotkit's, a GuardedFetchError's message goes to the log at debug only, and a body is
 * read for its rows and nothing else.
 */

import { randomBytes } from "node:crypto";
import { cleanText } from "pivotkit-core/import";
import { LIMITS } from "pivotkit-core";
import { OperationError } from "pivotkit-report/operations";
import { identityKey } from "../auth.js";
import { overLimit, withoutHiddenRows } from "../data.js";
import { isPacked, packedBytes } from "../packed.js";
import { httpSettingsOf } from "../options/http.js";
import { fieldKey } from "../policy.js";
import { requestId } from "../request-id.js";
import { asOfText } from "./as-of.js";
import { backendHeaders, dropToken } from "./auth.js";
import { guardedFetch, GuardedFetchError, upstreamCauseOf } from "./fetch.js";
export { upstreamCauseOf };
import { AnswerShapeError, rowsReader } from "./json-rows.js";
import { canonicalJson, configHashOf, privatePart, tableKeyOf } from "./keys.js";
import { SourceError, loadRunner, ownError } from "./run.js";
import { expandUrl, loggedPath } from "./template.js";

/** The deepest a JSON answer may be nested. */
export const MAX_DEPTH = 64;

/** The longest a column name of a backend's answer may be, in characters. */
const NAME_TEXT = 200;

/** The longest Retry-After pivotkit passes on, in seconds. */
const RETRY_AFTER_MAX = 3600;

/** The words of the answers a caller may read (pivotkit's own; a backend's text never reaches a caller). */
export const BACKEND_TEXT = Object.freeze({
    rejected: "the backend did not accept these parameters",
    nothing: (values) => `nothing you may see for ${values}: check the value${values.includes(",") ? "s" : ""}`
});

/**
 * What a guardedFetch is: the server's, or a test's own (createGuardedFetch with a certificate and a
 * lookup of its own). Not part of the package's API; no option reaches it.
 */
export const httpMeans = { fetch: guardedFetch };

/**
 * How deeply a JSON text is nested, counted until it passes `max` (strings skipped).
 * @param {string} text
 * @param {number} max
 */
export function jsonDepth(text, max) {
    let depth = 0;
    let deepest = 0;
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
        } else if (c === 91 || c === 123) {
            deepest = Math.max(deepest, ++depth);
            if (deepest > max) {
                return deepest;
            }
        } else if (c === 93 || c === 125) {
            depth--;
        }
    }
    return deepest;
}

/**
 * The value at a JSON Pointer's keys, own properties only (a key of an object's prototype matches
 * nothing); undefined when nothing is there.
 * @param {unknown} value
 * @param {string[]} keys
 */
export function pointerValue(value, keys) {
    let at = value;
    for (const key of keys) {
        if (Array.isArray(at)) {
            if (!/^(?:0|[1-9]\d{0,8})$/.test(key) || Number(key) >= at.length) {
                return undefined;
            }
            at = at[Number(key)];
        } else if (at !== null && typeof at === "object" && Object.hasOwn(at, key)) {
            at = /** @type {Record<string, unknown>} */ (at)[key];
        } else {
            return undefined;
        }
    }
    return at;
}

/** A Retry-After header in seconds (a number of seconds or an HTTP date), capped; undefined without one. */
function retryAfterOf(value) {
    if (typeof value !== "string" || !value.trim()) {
        return undefined;
    }
    const seconds = /^\d{1,10}$/.test(value.trim()) ? Number(value.trim()) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
    return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), RETRY_AFTER_MAX) : undefined;
}

/**
 * A backend's status as the caller gets it (every kind of source answers alike):
 *
 *   400, 422                        INVALID_INPUT "the backend did not accept these parameters"
 *   401, 403, 404 with params       DATA_NOT_AVAILABLE "nothing you may see for customer=xyz: check the value"
 *                                   (one answer for the three, so other tenants' names cannot be probed;
 *                                   it names only parameters a caller sets: none with a default or a claim)
 *   401, 403 without params         SOURCE_UNAVAILABLE, reason "refused"
 *   404 without params              SOURCE_UNAVAILABLE, reason "setup" (the address is wrong)
 *   429, 502, 503, 504              SOURCE_UNAVAILABLE, transient, Retry-After passed on
 *   anything else                   SOURCE_UNAVAILABLE
 *
 * @param {number} status
 * @param {Record<string, any> | undefined} declared  the source's params
 * @param {Record<string, string | number | boolean> | null} values  the caller's checked values
 * @param {Record<string, string>} headers
 * @returns {SourceError}
 */
export function backendAnswer(status, declared, values, headers) {
    if (status === 400 || status === 422) {
        return new SourceError("INVALID_INPUT", { publicMessage: BACKEND_TEXT.rejected, status });
    }
    if ((status === 401 || status === 403 || status === 404) && declaresParams(declared)) {
        // a default is the operator's and a claim's value the sign-in's: neither is said back
        const given = Object.entries(values ?? {})
            .filter(([k]) => declared?.[k]?.default === undefined && declared?.[k]?.claim === undefined)
            .map(([k, v]) => `${k}=${v}`);
        return new SourceError("DATA_NOT_AVAILABLE", { publicMessage: BACKEND_TEXT.nothing(given.length ? given.join(", ") : "these parameters"), status });
    }
    if (status === 401 || status === 403) {
        return new SourceError("SOURCE_UNAVAILABLE", { status, transient: false, reason: "refused" });
    }
    if (status === 404) {
        return new SourceError("SOURCE_UNAVAILABLE", { status, transient: false, reason: "setup" });
    }
    const retryAfter = retryAfterOf(headers["retry-after"]);
    return new SourceError("SOURCE_UNAVAILABLE", { status, ...(retryAfter !== undefined ? { retryAfter } : {}) });
}

/**
 * Whether a source declares parameters.
 * @param {Record<string, any> | undefined} declared  sources.<id>.params
 */
export const declaresParams = (declared) => Boolean(declared && Object.keys(declared).length);

/** A system error code of a certificate that the server's trusted authorities do not cover. */
const CERTIFICATE = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|UNABLE_TO_GET_ISSUER/;

/** The codes of a certificate whose signer the server does not know (not an expired one, not another host's name). */
const UNKNOWN_SIGNER = /SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/;

/**
 * What the operator does about a certificate the server does not trust. Node reads
 * NODE_EXTRA_CA_CERTS once, at start: with it set and a signer the server does not know, that file
 * holds no authority that signed the certificate.
 * @param {Record<string, string | undefined>} env
 * @param {string} failure  the error's message and system code
 */
export const certificateHint = (env, failure) =>
    env.NODE_EXTRA_CA_CERTS && UNKNOWN_SIGNER.test(failure)
        ? "a certificate error: NODE_EXTRA_CA_CERTS is set, but no certificate in that file signed this server's certificate; add the certificate authority that did and start the server again"
        : "a certificate error: for an internal certificate authority start the server with NODE_EXTRA_CA_CERTS set to its certificate file";

/** The guardedFetch codes that mean the source's settings are wrong (an address it may not reach, a redirect). */
const SETUP_CODES = new Set(["BAD_URL", "NOT_HTTPS", "USERINFO", "BAD_HEADER", "BAD_METHOD", "BAD_BODY", "IP_LITERAL", "REFUSED_ADDRESS", "REDIRECT"]);

/**
 * The fields of an upstream warning: why (upstreamCauseOf's words), the backend's name (never its
 * address), its status where it answered, and the time since the source's request started.
 * @param {import("../options/http.js").HttpSettings} settings
 * @param {number} started
 * @param {string} cause
 * @param {number} [status]
 */
const upstreamFields = (settings, started, cause, status) => ({ cause, ...(settings.backend ? { backend: settings.backend } : {}), ...(status ? { upstreamStatus: status } : {}), upstreamMs: Date.now() - started });

/**
 * A GuardedFetchError as the source's failure: never with its message (it can name a host or a
 * system error code), which goes to the log at debug with the request's id; at warn its cause.
 * @param {GuardedFetchError} error
 * @param {{ id: string, log: any, maxBytes: number, settings: import("../options/http.js").HttpSettings, started: number }} how
 */
function fetchFailure(error, how) {
    // what the operator does about it, for the debug log and check-source
    const hint =
        error.code === "REFUSED_ADDRESS" && !how.settings.intranet && /private/.test(error.message)
            ? `; for an internal API set intranet: true on ${how.settings.backend ? `the backend (httpSources.backends.${how.settings.backend}.intranet)` : `the source (sources.${how.id}.http.intranet)`}`
            : error.code === "NETWORK" && CERTIFICATE.test(`${error.message} ${/** @type {any} */ (error.cause)?.code ?? ""}`)
              ? `; ${certificateHint(process.env, `${error.message} ${/** @type {any} */ (error.cause)?.code ?? ""}`)}`
              : "";
    how.log.debug(`the source ${how.id}: the request failed (${error.code}): ${String(error.message).slice(0, 300)}${hint}`, { source: how.id, requestId: requestId() });
    if (error.code !== "ABORTED") {
        const fields = upstreamFields(how.settings, how.started, upstreamCauseOf(error), error.status);
        how.log.warn(`the source ${how.id}: the backend failed (${fields.cause})`, { source: how.id, ...fields });
    }
    if (error.code === "TOO_LARGE") {
        return ownError(new OperationError("LIMIT_EXCEEDED", `the source ${how.id} answered more than ${how.maxBytes.toLocaleString("en-US")} bytes (http.maxBytes)`));
    }
    if (error.code === "ABORTED") {
        // the caller went away or the time limit fired: sources/run.js says which
        return error;
    }
    if (SETUP_CODES.has(error.code)) {
        return new SourceError("SOURCE_UNAVAILABLE", { transient: false, reason: "setup" });
    }
    return new SourceError("SOURCE_UNAVAILABLE", { transient: error.code === "TIMEOUT" || error.transient === true });
}

/**
 * A failure of the answer's shape: the settings do not fit the backend's answer. With `upstream`
 * (upstreamFields' of a body that cannot be read) a warning says so; else only the debug line.
 */
const shapeFailure = (id, log, what, upstream = null) => {
    log.debug(`the source ${id}: ${what}`, { source: id, requestId: requestId() });
    if (upstream) {
        log.warn(`the source ${id}: the backend's answer cannot be read (bad_body)`, { source: id, ...upstream });
    }
    return new SourceError("SOURCE_UNAVAILABLE", { transient: false, reason: "setup" });
};

/**
 * A value of a backend's row as the table keeps it: text cut, a nested value as JSON text.
 * @param {unknown} value
 * @param {number} max
 */
function plainOf(value, max) {
    if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
        return value ?? null;
    }
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > max ? text.slice(0, max).replace(/[\uD800-\uDBFF]$/, "") : text;
}

/**
 * A backend's column names, cleaned (no control or direction characters, trimmed, capped), one name
 * per field (a name that repeats one without regard to case gets " (2)").
 * @param {unknown[]} raw
 */
function columnNames(raw) {
    const seen = new Set();
    return raw.map((name, i) => {
        let clean = cleanText(String(name ?? "")).trim().slice(0, NAME_TEXT) || `column ${i + 1}`;
        for (let n = 2; seen.has(fieldKey(clean)); n++) {
            clean = `${clean.replace(/ \(\d+\)$/, "")} (${n})`;
        }
        seen.add(fieldKey(clean));
        return clean;
    });
}

/**
 * The rows of every page as a table: rows that are objects (their own keys, in the order first seen)
 * or lists (the first one the header). Checked against limits.columns and limits.importCells.
 * @param {unknown[]} rows
 * @param {import("pivotkit-core").Limits} limits
 * @param {{ id: string, log: any }} how
 * @returns {{ columns: string[], rows: unknown[][] }}
 */
export function tableOf(rows, limits, how) {
    const table = tableBuilder(limits, how);
    for (const row of rows) {
        table.add(row);
    }
    return table.finish();
}

/**
 * tableOf one row at a time, for rows that arrive while an answer streams: each row becomes a list
 * of plain values at once. After a row of another shape or a limit, it keeps no more rows but goes
 * on counting, so finish() fails as tableOf of all the rows fails: a shape first, then
 * limits.columns, then limits.importCells.
 * @param {import("pivotkit-core").Limits} limits
 * @param {{ id: string, log: any }} how
 */
export function tableBuilder(limits, how) {
    /** Whether the rows are lists (the first one the header); null before the first row. */
    let lists = /** @type {boolean | null} */ (null);
    let header = /** @type {unknown[]} */ ([]);
    /** Objects' keys, in the order first seen, and their column. */
    const index = new Map();
    /** @type {unknown[][]} */
    let body = [];
    let count = 0;
    let badShape = false;
    let columnsOver = 0;
    /** Whether rows are still kept (no shape or limit failed yet). */
    let keep = true;
    const drop = () => {
        keep = false;
        body = [];
    };
    return {
        /** @param {unknown} row */
        add(row) {
            if (lists === null) {
                lists = Array.isArray(row);
                if (lists) {
                    header = /** @type {unknown[]} */ (row);
                    if (header.length > limits.columns) {
                        columnsOver = header.length;
                        drop();
                    }
                    return;
                }
            }
            if (lists ? !Array.isArray(row) : row === null || typeof row !== "object" || Array.isArray(row)) {
                badShape = true;
                drop();
                return;
            }
            count++;
            if (lists) {
                if (keep && count * header.length > limits.importCells) {
                    drop();
                }
                if (keep) {
                    const values = /** @type {unknown[]} */ (row);
                    body.push(header.map((_, i) => plainOf(values[i], limits.textLength)));
                }
                return;
            }
            if (!columnsOver) {
                for (const key of Object.keys(/** @type {object} */ (row))) {
                    if (!index.has(key)) {
                        index.set(key, index.size);
                        if (index.size > limits.columns) {
                            columnsOver = index.size;
                            drop();
                            break;
                        }
                    }
                }
            }
            if (keep && count * index.size > limits.importCells) {
                drop();
            }
            if (keep) {
                const out = new Array(index.size).fill(null);
                for (const [key, i] of index) {
                    if (Object.hasOwn(/** @type {object} */ (row), key)) {
                        out[i] = plainOf(/** @type {any} */ (row)[key], limits.textLength);
                    }
                }
                body.push(out);
            }
        },
        /** @returns {{ columns: string[], rows: unknown[][] }} */
        finish() {
            if (lists === null) {
                return { columns: [], rows: [] };
            }
            if (badShape) {
                throw shapeFailure(how.id, how.log, "the rows are neither all objects nor all lists");
            }
            if (columnsOver) {
                throw overLimit("columns", columnsOver, limits.columns, "columns");
            }
            const width = lists ? header.length : index.size;
            if (count * width > limits.importCells) {
                throw overLimit("importCells", count * width, limits.importCells, "cells");
            }
            // an object's row is as wide as the keys seen up to it
            for (const row of body) {
                while (row.length < width) {
                    row.push(null);
                }
            }
            return { columns: columnNames(lists ? header : [...index.keys()]), rows: body };
        }
    };
}

/**
 * Whether a JSON answer is read while it streams: not where the asOf or next pointer reaches into
 * the rows, which the streamed body leaves out.
 * @param {import("../options/http.js").HttpSettings} settings
 */
export function streamsRows(settings) {
    if (settings.format === "csv") {
        return false;
    }
    const next = settings.paging && "next" in settings.paging ? settings.paging.next : null;
    const inside = (/** @type {string[] | null | undefined} */ keys) => Boolean(keys) && /** @type {string[]} */ (keys).length > settings.rows.length && settings.rows.every((k, i) => /** @type {string[]} */ (keys)[i] === k);
    return !inside(settings.asOf) && !inside(next);
}

/** The next page's address of a Link header (rel="next"), or null. */
function linkNext(value) {
    for (const part of String(value ?? "").split(/,(?=\s*<)/)) {
        const m = /^\s*<([^>]*)>\s*;(.*)$/s.exec(part);
        if (m && /(?:^|;)\s*rel\s*=\s*"?(?:[^";]*\s)?next(?:\s[^";]*)?"?\s*(?:;|$)/i.test(m[2])) {
            return m[1];
        }
    }
    return null;
}

/**
 * What a load saw, for check-source (never values): each page's status, content type and bytes, the
 * body's top-level keys when the rows' pointer matched nothing.
 * @typedef {{ pages: Array<{ status: number, type: string, bytes: number }>, keys?: string[], found?: string, asOfRaw?: boolean, auth?: import("./auth.js").AuthTrace }} LoadTrace
 */

/**
 * Loads an HTTP source's data: every page, its rows as a table, when the data is from.
 * @param {import("../options/http.js").HttpSettings} settings
 * @param {Record<string, string | number | boolean> | null} values  the caller's checked values
 * @param {{ signal: AbortSignal, limits: import("pivotkit-core").Limits, log: any, declared: Record<string, any> | undefined, caller: import("../registry.js").Caller, fetch?: typeof guardedFetch, trace?: LoadTrace }} how
 * @returns {Promise<{ table: { columns: string[], rows: unknown[][] } | null, upload: { bytes: Uint8Array, format: "csv" } | null, asOf: string, pages: number, bytes: number }>}
 */
export async function loadHttp(settings, values, how) {
    const fetch = how.fetch ?? httpMeans.fetch;
    const { id, template } = settings;
    const started = Date.now();
    const maxBytes = Math.min(settings.maxBytes, how.limits.fileBytes ?? settings.maxBytes);
    const fixed = { accept: settings.format === "csv" ? "text/csv" : "application/json", ...settings.headers };
    const signIn = (trace) => backendHeaders(settings.auth, how.caller, { signal: how.signal, id, log: how.log, fetch, ...(settings.backend ? { backend: settings.backend } : {}), ...(trace ? { trace } : {}) });
    // the sign-in's headers last: a static header never stands in for them
    if (how.trace && settings.auth) {
        how.trace.auth = { kind: settings.auth.kind };
    }
    let headers = { ...fixed, ...(await signIn(how.trace?.auth)) };
    let retried = false;
    const table = tableBuilder(how.limits, { id, log: how.log });
    const streams = streamsRows(settings);
    /** The rows of the pages read so far (a list's header counted). */
    let total = 0;
    let bytes = 0;
    let pages = 0;
    /** @type {unknown} */
    let asOfValue;
    const seen = new Set();
    /** @type {Record<string, string | number>} */
    let extra = settings.paging && "page" in settings.paging ? { [settings.paging.page]: settings.paging.start } : settings.paging && "offset" in settings.paging ? { [settings.paging.offset]: 0, [settings.paging.limit]: settings.paging.size } : {};
    /** @type {URL | null} */
    let url = expandUrl(template, values, extra);
    // page and offset paging cannot know a page is the last until the next one is empty: after
    // maxPages pages one more is asked for, which must have no rows
    let probing = false;
    while (url) {
        seen.add(url.href);
        /** This page's rows while it streams (a 2xx answer only), and how many it had. */
        let reader = /** @type {ReturnType<typeof rowsReader> | null} */ (null);
        let status = 0;
        const consume = (/** @type {number} */ code) => {
            status = code;
            if (code < 200 || code > 299) {
                return null;
            }
            let count = 0;
            reader = rowsReader(settings.rows, {
                maxDepth: MAX_DEPTH,
                // rows past limits.rows or of the page after maxPages are counted, not kept
                onRow: (row) => {
                    count++;
                    if (!probing && total + count <= how.limits.rows) {
                        table.add(row);
                    }
                }
            });
            return /** @type {(piece: Uint8Array) => void} */ (/** @type {any} */ (reader).push);
        };
        let answer;
        try {
            answer = await fetch(url, { headers, signal: how.signal, maxBytes: maxBytes - bytes, timeMs: Math.max(settings.timeMs - (Date.now() - started), 1), allowPrivate: settings.intranet, allowIpLiterals: settings.allowIpLiterals, ...(streams ? { consume } : {}) });
        } catch (e) {
            if (e instanceof AnswerShapeError) {
                throw shapeFailure(id, how.log, e.message, upstreamFields(settings, started, "bad_body", status));
            }
            throw e instanceof GuardedFetchError ? fetchFailure(e, { id, log: how.log, maxBytes, settings, started }) : e;
        }
        if (answer.status === 401 && !retried && dropToken(settings.auth, how.caller, headers)) {
            // the backend no longer takes the kept token: once more with a new one
            retried = true;
            how.log.debug(`the source ${id}: the backend answered 401; its token is asked for again`, { source: id, requestId: requestId() });
            headers = { ...fixed, ...(await signIn(undefined)) };
            continue;
        }
        pages++;
        bytes += answer.size;
        how.trace?.pages.push({ status: answer.status, type: String(answer.headers["content-type"] ?? "").slice(0, 100), bytes: answer.size });
        how.log.debug(`the source ${id}: GET ${loggedPath(template, extra)} answered ${answer.status}`, { source: id, status: answer.status, requestId: requestId() });
        if (answer.status < 200 || answer.status > 299) {
            how.log.warn(`the source ${id}: the backend answered ${answer.status}`, { source: id, status: answer.status, template: template.text, ...upstreamFields(settings, started, "http_status", answer.status) });
            if (answer.status === 401 && settings.auth?.kind === "header") {
                // a caller of a source with params reads DATA_NOT_AVAILABLE: this line says where to look
                how.log.warn(`the source ${id}: the backend answered 401 to the header from ${settings.auth.at}.value: check the secret behind it`, { source: id, requestId: requestId() });
            }
            throw backendAnswer(answer.status, how.declared, values, answer.headers);
        }
        if (settings.format === "csv") {
            return { table: null, upload: { bytes: answer.body, format: "csv" }, asOf: asOfText(new Date()) ?? "", pages, bytes };
        }
        const upstream = () => upstreamFields(settings, started, "bad_body", answer.status);
        const body = reader ? endOf(reader, { id, log: how.log, upstream }) : parsed(answer.body, { id, log: how.log, upstream });
        if (pages === 1 && settings.asOf) {
            asOfValue = pointerValue(body, settings.asOf);
        }
        const found = pointerValue(body, settings.rows);
        if (!Array.isArray(found)) {
            // the keys of what was found (or of the body), so check-source can say where the rows are
            const shown = found !== null && typeof found === "object" ? found : body;
            if (how.trace && shown !== null && typeof shown === "object") {
                how.trace.keys = Object.keys(shown).slice(0, 30).map((k) => cleanText(k).slice(0, 60));
                how.trace.found = found === undefined ? "nothing" : Array.isArray(found) ? "a list" : found === null ? "null" : typeof found === "object" ? "an object" : `a ${typeof found}`;
            }
            const what = found === undefined ? "has no rows at" : `has ${found === null ? "null" : typeof found === "object" ? "an object" : `a ${typeof found}`}, not a list of rows, at`;
            how.log.warn(`the source ${id}: the answer ${what} ${settings.rowsText || '"" (the whole body)'} (http.rows)`, { source: id, ...upstreamFields(settings, started, "bad_body", answer.status) });
            throw shapeFailure(id, how.log, `the rows' pointer ${settings.rowsText || '""'} matched ${found === undefined ? "nothing" : "no list"}`);
        }
        // a streamed page's list is empty in its body: its rows went to the table as they arrived
        const count = reader ? /** @type {any} */ (reader).rows : found.length;
        if (probing) {
            if (count) {
                throw ownError(new OperationError("LIMIT_EXCEEDED", `the source ${id} has more than ${settings.maxPages} pages (http.maxPages)`));
            }
            break;
        }
        if (total + count > how.limits.rows) {
            throw overLimit("rows", total + count, how.limits.rows, "rows");
        }
        if (!reader) {
            for (const row of found) {
                table.add(row);
            }
        }
        total += count;
        url = nextPage(settings, body, answer.headers, url, count, seen, how.log);
        if (url && settings.paging && "page" in settings.paging) {
            extra = { [settings.paging.page]: Number(extra[settings.paging.page]) + 1 };
            url = expandUrl(template, values, extra);
        } else if (url && settings.paging && "offset" in settings.paging) {
            extra = { [settings.paging.offset]: Number(extra[settings.paging.offset]) + settings.paging.size, [settings.paging.limit]: settings.paging.size };
            url = expandUrl(template, values, extra);
        }
        if (url && pages >= settings.maxPages) {
            if (settings.paging && ("next" in settings.paging || "link" in settings.paging)) {
                throw ownError(new OperationError("LIMIT_EXCEEDED", `the source ${id} has more than ${settings.maxPages} pages (http.maxPages)`));
            }
            probing = true;
        }
    }
    const asOf = (asOfValue !== undefined ? asOfText(typeof asOfValue === "string" || typeof asOfValue === "number" ? asOfValue : null, { epoch: "s" }) : null) ?? asOfText(new Date()) ?? "";
    if (how.trace && settings.asOf) {
        how.trace.asOfRaw = asOfValue !== undefined;
    }
    if (asOfValue !== undefined && asOfText(typeof asOfValue === "string" || typeof asOfValue === "number" ? asOfValue : null, { epoch: "s" }) === null) {
        how.log.debug(`the source ${id}: its asOf did not parse; the time it arrived stands in`, { source: id });
    }
    return { table: table.finish(), upload: null, asOf, pages, bytes };
}

/**
 * A streamed JSON answer's body around its rows (the rows' list empty), parsed; a body that is no
 * JSON is the source's failure, as parsed() says.
 * @param {ReturnType<typeof rowsReader>} reader
 * @param {{ id: string, log: any, upstream: () => Record<string, unknown> }} how
 */
function endOf(reader, how) {
    try {
        return reader.end();
    } catch (e) {
        throw e instanceof AnswerShapeError ? shapeFailure(how.id, how.log, e.message, how.upstream()) : e;
    }
}

/**
 * A JSON answer parsed; a body that is no UTF-8 text, no JSON or nested too deeply is the source's
 * failure (its words never reach a caller).
 * @param {Uint8Array} bytes
 * @param {{ id: string, log: any, upstream: () => Record<string, unknown> }} how  upstream: the fields of the warning for a body that cannot be read
 */
function parsed(bytes, how) {
    let text;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch {
        throw shapeFailure(how.id, how.log, "the answer is no UTF-8 text", how.upstream());
    }
    if (jsonDepth(text, MAX_DEPTH) > MAX_DEPTH) {
        throw shapeFailure(how.id, how.log, `the answer is nested deeper than ${MAX_DEPTH} levels`, how.upstream());
    }
    try {
        return JSON.parse(text);
    } catch {
        throw shapeFailure(how.id, how.log, "the answer is no JSON", how.upstream());
    }
}

/**
 * The next page's address, or null: by the paging setting; a `next` or `link` address only on the
 * same origin and path as the page just read (only its query may differ).
 * @param {import("../options/http.js").HttpSettings} settings
 * @param {unknown} body
 * @param {Record<string, string>} headers
 * @param {URL} current
 * @param {number} count  the rows of this page
 * @param {Set<string>} seen
 * @param {any} log
 * @returns {URL | null}
 */
function nextPage(settings, body, headers, current, count, seen, log) {
    const paging = settings.paging;
    if (!paging) {
        return null;
    }
    if ("page" in paging) {
        return count > 0 ? current : null;
    }
    if ("offset" in paging) {
        return count >= paging.size ? current : null;
    }
    const given = "next" in paging ? pointerValue(body, paging.next) : linkNext(headers.link);
    if (given === undefined || given === null || given === "" || given === false) {
        return null;
    }
    if (typeof given !== "string" || given.length > 4096) {
        throw shapeFailure(settings.id, log, "the next page's address is no text");
    }
    let next;
    try {
        next = new URL(given, current);
    } catch {
        throw shapeFailure(settings.id, log, "the next page's address does not parse");
    }
    if (next.origin !== current.origin || next.pathname !== current.pathname || next.username || next.password) {
        throw shapeFailure(settings.id, log, "the next page's address is on another host or path; pages must differ only in their query");
    }
    next.hash = "";
    return seen.has(next.href) ? null : next;
}

/**
 * A CSV answer read in a worker into a packed table without the hidden columns: the reader's and the
 * pool's errors (a limit, a body that is no CSV, BUSY, TIMEOUT) reach the caller as they are, as they
 * did when the operation's worker read the bytes. The worker keeps the data set by `tableKey`, so
 * the operation's job goes to it without the table.
 */
async function readCsv(computer, spec, upload, tableKey, asOf, signal) {
    try {
        return await computer.read(spec, upload, tableKey, asOf, signal);
    } catch (e) {
        throw e instanceof OperationError ? ownError(e) : e;
    }
}

/** A random name per configured source object, so two servers' sources of the same id never share data. */
const names = new WeakMap();
const nameOf = (source) => {
    if (!names.has(source)) {
        names.set(source, randomBytes(9).toString("base64url"));
    }
    return names.get(source);
};

/**
 * About the bytes a kept table takes in the main thread's cache: a packed one (a CSV answer's) as
 * packed.js counts it; rows by their texts' length, other values as 8.
 */
function tableBytes(loaded) {
    if (loaded.upload) {
        // never kept (a caller without an identity), measured all the same
        return loaded.upload.bytes.byteLength;
    }
    if (isPacked(loaded.table)) {
        return packedBytes(loaded.table);
    }
    let bytes = 0;
    for (const c of loaded.table.columns) {
        bytes += 2 * c.length + 16;
    }
    for (const row of loaded.table.rows) {
        for (const v of row) {
            bytes += typeof v === "string" ? 2 * v.length + 16 : 8;
        }
    }
    return bytes;
}

/**
 * An HTTP source's data for a caller (or what is kept of it): sources/run.js with the source's
 * settings. The key holds the source, its settings' hash, the caller's values and identity (as a
 * keyed digest), the levels that decide the hidden columns, and the time zone and limits a CSV
 * answer is read with; without an identity nothing is kept or shared. What is kept never holds a
 * hidden column: a JSON answer's rows without them, a CSV answer read in a worker into a packed
 * table without them (for a caller without an identity, whose load is never kept, the bytes go to
 * the operation's worker as they are). `tableKey` names this load's table for the worker (a new load has a new one,
 * so a worker never answers from an older table).
 * @param {{ read: (spec: any, upload: { bytes: Uint8Array, format: "csv" }, tableKey: string | null, asOf: string | null, signal?: AbortSignal) => Promise<{ table: import("../packed.js").PackedTable, notes: any[] }> }} computer  compute.js's pool
 * @param {any} resolved  registry.resolve's
 * @param {import("../registry.js").Caller} caller
 * @param {any} log
 * @param {AbortSignal} [signal]
 */
export async function loadFor(computer, resolved, caller, log, signal = undefined) {
    const source = resolved.source;
    const settings = httpSettingsOf(source);
    const spec = resolved.spec;
    const values = resolved.params ?? null;
    // a token exchange or a claim: the person through this client with these scopes (sources/auth.js)
    const bound = resolved.personBound === true;
    const identity = identityKey(caller, { client: bound });
    if (settings.auth?.kind === "tokenExchange" && (identity === null || typeof caller.subject !== "string")) {
        throw new OperationError("NOT_ALLOWED", `the source ${spec.id} needs a signed-in person (an OAuth token with a subject)`);
    }
    const person = identity ?? `client:${caller.client}`;
    const name = nameOf(source);
    const configHash = configHashOf({ http: source.http, settings });
    // the values and the identity only as a keyed digest; the levels that decide which columns are
    // dropped before the answer is kept (a caller whose profile shows more gets its own copy)
    const key = identity === null ? null : canonicalJson(["http", name, configHash, privatePart([values ?? {}, identity]), { default: spec.levels.default, fields: spec.levels.fields }, spec.timeZone ?? null, spec.limits]);
    const limits = { ...LIMITS, ...spec.limits };
    // a load's table (its serial: a new load is a new key) under the caller's levels and limits
    const tableKeyFor = (serial) => tableKeyOf({ kind: "http", id: `${name}:${spec.id}`, configHash: canonicalJson([configHash, serial, spec.timeZone ?? null]), params: values, identity, levels: spec.levels, limits: spec.limits });
    const ran = await loadRunner.runLoad(key, (loadSignal) => loadHttp(settings, values, { signal: loadSignal, limits, log, declared: source.params, caller }), {
        // hidden columns never kept: a JSON answer's rows without them, a CSV answer read in a worker
        // (outside the source's timeMs, within compute.timeMs) into a packed table without them
        prepare: async ({ table, upload, asOf, pages, bytes }, readSignal) => {
            const serial = randomBytes(9).toString("base64url");
            if (upload && key === null) {
                // a caller without an identity: nothing is kept (runLoad keeps nothing under a null
                // key), so the bytes go straight to the operation's worker, which drops the hidden columns
                return { table: null, upload, notes: [], asOf, pages, bytes, serial };
            }
            const read = upload ? await readCsv(computer, spec, upload, tableKeyFor(serial), asOf, readSignal) : { table: withoutHiddenRows(spec.levels, /** @type {any} */ (table)), notes: [] };
            return { ...read, asOf, pages, bytes, serial };
        },
        source: name,
        label: spec.id,
        bucket: person,
        owner: person,
        timeMs: settings.timeMs,
        ttl: settings.ttl,
        maxStale: settings.maxStale,
        version: null,
        sizeOf: tableBytes,
        log,
        ...(signal ? { signal } : {})
    });
    return { value: ran.value, stale: ran.stale, tableKey: tableKeyFor(ran.value.serial) };
}

export const httpKind = Object.freeze({
    async specOf() {
        return {};
    },

    /**
     * Loads the backend's data in this thread and runs the operation over it in a worker.
     * @param {any} computer
     * @param {string} op
     * @param {any} input
     * @param {any} resolved
     * @param {any} base
     * @param {import("../registry.js").Caller} caller
     * @param {any} log
     * @param {{ signal?: AbortSignal }} [how]
     */
    async run(computer, op, input, resolved, base, caller, log, how = {}) {
        const { value, stale, tableKey } = await loadFor(computer, resolved, caller, log, how.signal);
        const job = { ...base, spec: resolved.spec, tableKey, asOf: value.asOf, ...(value.upload ? { upload: value.upload } : { table: value.table }), ...(value.notes.length ? { notes: value.notes } : {}) };
        const ran = await computer.run(op, input, job);
        return { ...ran, asOf: ran.asOf ?? value.asOf, stale };
    }
});
