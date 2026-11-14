/*
 * The REST service's errors: RFC 9457 problem details (application/problem+json) with `type` (a
 * stable address per code), `title`, `status`, `code` (one of OPERATION_ERRORS or REST_ERRORS) and
 * `detail`. An operation's message is written to be shown (no file content, no values); a 5xx
 * carries a fixed text, never an error's message.
 */

import { OPERATION_ERRORS } from "pivotkit-report/operations";

/** The codes the REST layer adds to the operations', with their status. */
export const REST_ERRORS = Object.freeze({
    INVALID_TOKEN: 401,
    INSUFFICIENT_SCOPE: 403,
    FORBIDDEN_HOST: 403,
    FORBIDDEN_ORIGIN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    BODY_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    VIEW_HAS_ERRORS: 422,
    RATE_LIMITED: 429,
    AUTH_NOT_READY: 503
});

/** Every code a problem can carry. */
export const PROBLEM_CODES = Object.freeze([...Object.keys(OPERATION_ERRORS), ...Object.keys(REST_ERRORS)]);

/** A code's status. */
export const statusOf = (code) => REST_ERRORS[code] ?? OPERATION_ERRORS[code] ?? 500;

/** The fixed words of a code (the problem's title). */
const titleOf = (code) => code.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The address that names a code: its row in the docs' table of errors. */
export const typeOf = (code) => `https://pivotkit.eize.dev/reference/rest/#error-${code.toLowerCase().replace(/_/g, "-")}`;

/** What a 5xx says instead of the error's message. */
const SERVER_TEXT = { BUSY: "the server is busy with other reports; try again in a moment", NOT_READY: "the server is starting or shutting down; try again in a moment", AUTH_NOT_READY: "the server is waiting for its authorization server; try again in a moment", TIMEOUT: "the report took longer than the server allows; make the view smaller or filter more", INTERNAL: "internal error" };

/** The headers every answer of the REST service carries. */
export const SAFE_HEADERS = Object.freeze({ "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" });

/**
 * A problem document as a Response.
 * @param {string} code
 * @param {string} detail
 * @param {{ headers?: Record<string, string>, extra?: Record<string, unknown> }} [more]  extra: further members (a view's findings)
 */
export function problem(code, detail, more = {}) {
    const status = statusOf(code);
    const body = { type: typeOf(code), title: titleOf(code), status, code, detail: status >= 500 ? (SERVER_TEXT[code] ?? SERVER_TEXT.INTERNAL) : String(detail).slice(0, 1000), ...(more.extra ?? {}) };
    return new Response(JSON.stringify(body), { status, headers: { ...SAFE_HEADERS, "content-type": "application/problem+json", ...(more.headers ?? {}) } });
}

/** A JSON answer. */
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...SAFE_HEADERS, "content-type": "application/json", ...headers } });
