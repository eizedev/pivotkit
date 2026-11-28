/*
 * Reading a report's rows from pivotkit-server with a browser token (record 0021), without a DOM:
 * the token from the page's getToken(), the rows route, and what an answer that is not the rows
 * means for the person (a state). Loaded on first use with the states' parts (server-module.js).
 *
 * - The token goes only into the Authorization header. It is never in the address, never in a
 *   state, an event or a message, and nothing here stores it.
 * - The request sends no cookie and no referrer (credentials "omit", referrerPolicy "no-referrer").
 * - A server over http that is not this machine gets one console warning: the token crosses the
 *   network in clear text.
 * - A token that is about to expire is not sent: getToken() gives a new one first.
 * - A 401 asks getToken() once more and tries again once. A new key on the server ends a token
 *   before its time and answers as for an unknown one, so it is not only an expired one that asks.
 *   Only when getToken() gives nothing, or its token is refused too, is the state "expired".
 */

/** The rows route and the exchange route under a server's address. */
const ROWS_PATH = "/api/v1/sources/records";

/** Seconds before its expiry at which a token is no longer sent. */
const EARLY_SECONDS = 15;

/**
 * @typedef {"refused" | "linkRefused" | "linkInvalid" | "unfit" | "expired" | "signIn" | "signInLarge" | "large" | "unreachable" | "busy"} FailedState
 *   linkInvalid: the link's access level is not valid, no longer offered or missing; unfit: the
 *   request does not fit the source (400, 422); signIn: getToken() failed without saying why;
 *   signInLarge: the sign-in carries too much for a browser token
 */

/**
 * @typedef {object} ServerFailure  why the rows did not come, for the person and for IT support
 * @property {FailedState} state
 * @property {string} [code]  the server's error code (NOT_ALLOWED, LIMIT_EXCEEDED, INVALID_TOKEN, BUSY, …)
 * @property {number} [status]  the HTTP status
 * @property {string} [requestId]  the server's request id, to quote to IT support
 * @property {string} host  the server's host, for the line "no answer from …"; "" where no request went to the server
 * @property {boolean} [cut]  the answer broke off
 * @property {number} [maxRows]  LIMIT_EXCEEDED: the server's row limit
 * @property {number} [maxCells]  LIMIT_EXCEEDED: the server's limit of values
 * @property {number} [retryAfter]  BUSY: seconds the server asks to wait
 * @property {number} [retryAt]  busy: when the report reads again on its own (retryAtOf), ms since the epoch
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
 * Which state a refused answer is.
 * @param {number} status
 * @param {Record<string, any>} problem
 * @param {string | undefined} code
 * @returns {FailedState}
 */
function stateOf(status, problem, code) {
    if (status === 401) {
        return "expired";
    }
    if (status === 403 && problem.linkAccess) {
        // "invalid": a new link helps; "refused": the level shuts this account out
        return problem.linkAccess === "invalid" ? "linkInvalid" : "linkRefused";
    }
    if (code === "LIMIT_EXCEEDED" && problem.limit === "token") {
        return "signInLarge";
    }
    if (status === 413 || code === "LIMIT_EXCEEDED") {
        return "large";
    }
    if (status === 429 || status === 503) {
        return "busy";
    }
    if (status === 400 || status === 422) {
        return "unfit";
    }
    // 403, 404 (a source the person may not see is not found)
    return status >= 400 && status < 500 ? "refused" : "unreachable";
}

/** An object without its undefined values. */
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** A whole number of the problem, else undefined. */
const whole = (v) => (Number.isSafeInteger(v) ? v : undefined);

/**
 * What a state keeps of the problem beside its code: the limit of "large", the wait of "busy".
 * @param {FailedState} state
 * @param {Record<string, any>} problem
 */
function detailsOf(state, problem) {
    if (state === "large") {
        return defined({ maxRows: whole(problem.maxRows), maxCells: whole(problem.maxCells) });
    }
    const after = Number(problem.retryAfter ?? NaN);
    return state === "busy" && Number.isFinite(after) && after >= 0 ? { retryAfter: after } : {};
}

/**
 * The state of a refused answer (a problem of pivotkit-server).
 * @param {number} status
 * @param {Record<string, any> | null} problem
 * @param {string} host
 * @returns {ServerFailure}
 */
export function failureOf(status, problem, host) {
    const p = problem ?? {};
    const code = typeof p.code === "string" ? p.code : undefined;
    const requestId = typeof p.requestId === "string" ? p.requestId : undefined;
    const state = stateOf(status, p, code);
    return /** @type {ServerFailure} */ ({ state, host, ...defined({ status, code, requestId }), ...detailsOf(state, p) });
}

/** The longest wait of a busy server, in seconds, after which the report reads again on its own. */
export const AUTO_RETRY_MAX = 60;

/**
 * When the report reads again on its own after a busy answer, in ms since the epoch, or null. Only
 * when the server said how long to wait (Retry-After in seconds) and that wait is at most
 * AUTO_RETRY_MAX: a longer wait, or none given, is left to Try again. A wait of 0 is one second, so a
 * server that answers busy at once is not asked again at once.
 * @param {ServerFailure} failure
 * @param {number} [now]
 * @returns {number | null}
 */
export function retryAtOf(failure, now = Date.now()) {
    const after = failure.retryAfter;
    return failure.state === "busy" && after !== undefined && after <= AUTO_RETRY_MAX ? now + Math.max(after, 1) * 1000 : null;
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
    warnPlain(request.base);
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
            // the page's own sign-in step failed: nothing went to the report server yet
            return /** @type {ServerFailure} */ ({ state: "signIn", host: "" });
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
        // a wait in whole seconds only: an empty header, a date or "1e1" is no wait
        const retryAfter = answer.headers.get("retry-after")?.trim();
        return { ok: false, failure: failureOf(answer.status, problem && /^\d+$/.test(retryAfter ?? "") ? { ...problem, retryAfter } : problem, host) };
    }
    return { ok: false, failure: { state: "expired", host } };
}

/** The addresses warned about: once each. */
const warned = new Set();

/** One console warning for a server over http that is not this machine. */
function warnPlain(base) {
    const u = new URL(base);
    if (u.protocol === "http:" && !/^(localhost|127(\.\d{1,3}){3}|\[::1\])$/.test(u.hostname) && !warned.has(u.origin)) {
        warned.add(u.origin);
        console.warn(`pivotkit: server.url ${u.origin} is http: the browser token crosses the network in clear text. Use https.`);
    }
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
