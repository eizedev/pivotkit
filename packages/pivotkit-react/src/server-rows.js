/*
 * Reading a report's rows from pivotkit-server with a browser token (record 0020), without a DOM:
 * the token from the page's getToken(), the rows route, and what an answer that is not the rows
 * means for the person (a state). Loaded on first use with the states' parts (server-module.js).
 *
 * - The token goes only into the Authorization header. It is never in the address, never in a
 *   state, an event or a message, and nothing here stores it.
 * - The request sends no cookie and no referrer (credentials "omit", referrerPolicy "no-referrer").
 * - A token that is about to expire is not sent: getToken() gives a new one first.
 * - A 401 asks getToken() once more and tries again once. A new key on the server ends a token
 *   before its time and answers as for an unknown one, so it is not only an expired one that asks.
 *   Only when getToken() gives nothing, or its token is refused too, is the state "expired".
 */

import { ROWS_PATH } from "./server.js";

/** Seconds before its expiry at which a token is no longer sent. */
const EARLY_SECONDS = 15;

/**
 * @typedef {"refused" | "linkRefused" | "expired" | "large" | "unreachable" | "busy"} FailedState
 */

/**
 * @typedef {object} ServerFailure  why the rows did not come, for the person and for IT support
 * @property {FailedState} state
 * @property {string} [code]  the server's error code (NOT_ALLOWED, LIMIT_EXCEEDED, INVALID_TOKEN, BUSY, …)
 * @property {number} [status]  the HTTP status
 * @property {string} [requestId]  the server's request id, to quote to IT support
 * @property {string} host  the server's host, for the line "no answer from …"
 * @property {boolean} [cut]  the answer broke off
 * @property {number} [maxRows]  LIMIT_EXCEEDED: the server's row limit
 * @property {number} [maxCells]  LIMIT_EXCEEDED: the server's limit of values
 * @property {number} [retryAfter]  BUSY: seconds the server asks to wait
 */

/**
 * @typedef {object} ServerRows  the rows the server answered
 * @property {import("pivotkit-core").ColumnarData} data  columnar, as pivotkit-core's encode takes it (encode checks the types)
 * @property {number} rowCount
 * @property {string | undefined} dataAsOf
 * @property {string | undefined} requestId
 */

/**
 * @typedef {object} HeldToken  the token of a report, kept in memory between its requests
 * @property {string} token
 * @property {number | null} expiresAt  ms since the epoch; null when getToken() said nothing about it
 */

/**
 * A token from what getToken() gave: its text, or an object with `token` and `expiresAt` (the
 * exchange route's answer) or `expiresIn`.
 * @param {unknown} given
 * @returns {HeldToken | null}
 */
export function tokenOf(given) {
    if (typeof given === "string") {
        return given ? { token: given, expiresAt: null } : null;
    }
    if (!given || typeof given !== "object") {
        return null;
    }
    const g = /** @type {Record<string, unknown>} */ (given);
    if (typeof g.token !== "string" || !g.token) {
        return null;
    }
    const at = typeof g.expiresAt === "string" ? Date.parse(g.expiresAt) : typeof g.expiresIn === "number" ? Date.now() + g.expiresIn * 1000 : NaN;
    return { token: g.token, expiresAt: Number.isFinite(at) ? at : null };
}

/** Whether a held token may still be sent. */
const fresh = (held, now = Date.now()) => held !== null && (held.expiresAt === null || held.expiresAt - EARLY_SECONDS * 1000 > now);

/**
 * The state of a refused answer (a problem of pivotkit-server).
 * @param {number} status
 * @param {Record<string, any> | null} problem
 * @param {string} host
 * @returns {ServerFailure}
 */
export function failureOf(status, problem, host) {
    const code = typeof problem?.code === "string" ? problem.code : undefined;
    const requestId = typeof problem?.requestId === "string" ? problem.requestId : undefined;
    const base = { status, host, ...(code ? { code } : {}), ...(requestId ? { requestId } : {}) };
    if (status === 401) {
        return { state: "expired", ...base };
    }
    if (status === 403 && problem?.linkAccess === true) {
        return { state: "linkRefused", ...base };
    }
    if (status === 413 || code === "LIMIT_EXCEEDED") {
        const limits = {
            ...(Number.isSafeInteger(problem?.maxRows) ? { maxRows: problem?.maxRows } : {}),
            ...(Number.isSafeInteger(problem?.maxCells) ? { maxCells: problem?.maxCells } : {})
        };
        return { state: "large", ...base, ...limits };
    }
    if (status === 429 || status === 503) {
        const after = Number(problem?.retryAfter ?? NaN);
        return { state: "busy", ...base, ...(Number.isFinite(after) && after >= 0 ? { retryAfter: after } : {}) };
    }
    // 400 (the page's request does not fit the source), 403, 404 (a source the person may not see is not found)
    if (status >= 400 && status < 500) {
        return { state: "refused", ...base };
    }
    return { state: "unreachable", ...base };
}

/**
 * The rows of a request, or why not.
 * @param {import("./server.js").ServerRequest} request
 * @param {{ getToken: () => import("./server.js").ServerConnection["getToken"], held: { current: HeldToken | null }, signal?: AbortSignal, fetch?: typeof fetch }} how
 *   getToken: the page's current getToken; held: the report's token between requests
 * @returns {Promise<{ ok: true, rows: ServerRows } | { ok: false, failure: ServerFailure }>}
 *   an aborted request rejects with the signal's reason
 */
export async function fetchRows(request, how) {
    const { held, signal } = how;
    const send = how.fetch ?? fetch;
    const host = hostOf(request.base);
    const ask = async () => {
        let given;
        try {
            given = await how.getToken()({ source: request.source, params: { ...request.params }, ...(request.access ? { access: request.access } : {}) });
        } catch (e) {
            signal?.throwIfAborted();
            // the page's own exchange said why (the exchange route's problem), or could not ask
            const problem = /** @type {any} */ (e)?.problem;
            if (problem && typeof problem === "object") {
                return failureOf(Number(problem.status) || 403, problem, host);
            }
            return /** @type {ServerFailure} */ ({ state: "unreachable", host });
        }
        signal?.throwIfAborted();
        held.current = tokenOf(given);
        return held.current ? null : /** @type {ServerFailure} */ ({ state: "expired", host });
    };
    for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0 || !fresh(held.current)) {
            const failed = await ask();
            if (failed) {
                return { ok: false, failure: failed };
            }
        }
        const token = /** @type {HeldToken} */ (held.current).token;
        /** @type {Response} */
        let answer;
        try {
            answer = await send(`${request.base}${ROWS_PATH}`, {
                method: "POST",
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify({ source: request.source, params: request.params }),
                credentials: "omit",
                cache: "no-store",
                referrerPolicy: "no-referrer",
                signal
            });
        } catch {
            signal?.throwIfAborted();
            return { ok: false, failure: { state: "unreachable", host } };
        }
        let text;
        try {
            text = await answer.text();
        } catch {
            signal?.throwIfAborted();
            return { ok: false, failure: { state: "unreachable", host, status: answer.status, cut: true } };
        }
        const parsed = parse(text);
        if (answer.ok) {
            const rows = rowsOf(parsed);
            return rows ? { ok: true, rows } : { ok: false, failure: { state: "unreachable", host, status: answer.status, cut: true } };
        }
        if (answer.status === 401 && attempt === 0) {
            // expired, or ended by a new key: one new token, one more try
            held.current = null;
            continue;
        }
        const problem = parsed && typeof parsed === "object" ? /** @type {Record<string, any>} */ (parsed) : null;
        const retryAfter = answer.headers.get("retry-after");
        return { ok: false, failure: failureOf(answer.status, problem && retryAfter !== null ? { ...problem, retryAfter } : problem, host) };
    }
    return { ok: false, failure: { state: "expired", host } };
}

/** JSON text as a value, or null. */
function parse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * The rows of an answer of the rows route, or null for one that is not.
 * @param {unknown} body
 * @returns {ServerRows | null}
 */
function rowsOf(body) {
    const b = /** @type {Record<string, any> | null} */ (body && typeof body === "object" ? body : null);
    if (!b || !Array.isArray(b.columns) || !Array.isArray(b.types) || !Array.isArray(b.data) || b.data.length !== b.columns.length) {
        return null;
    }
    return {
        data: /** @type {import("pivotkit-core").ColumnarData} */ ({ columns: b.columns, types: b.types, data: b.data }),
        rowCount: Number.isSafeInteger(b.rowCount) ? b.rowCount : (b.data[0]?.length ?? 0),
        dataAsOf: typeof b.dataAsOf === "string" ? b.dataAsOf : undefined,
        requestId: typeof b.requestId === "string" ? b.requestId : undefined
    };
}

/** The host of the server's address, for the support line. */
function hostOf(base) {
    try {
        return new URL(base).host;
    } catch {
        return base;
    }
}
