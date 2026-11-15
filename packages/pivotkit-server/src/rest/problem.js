/*
 * The REST service's errors: RFC 9457 problem details (application/problem+json) with `type` (a
 * stable address per code), `title`, `status`, `code` (one of OPERATION_ERRORS or REST_ERRORS) and
 * `detail`. An operation's message is written to be shown (no file content, no values); a 5xx
 * carries a fixed text, never an error's message.
 */

import { OPERATION_ERRORS } from "pivotkit-report/operations";
import { REST_ERRORS } from "pivotkit-cli/rest";

/** The codes the REST layer adds to the operations', with their status, and every code a problem can carry: pivotkit-cli/rest's, which the CLI's remote mode checks answers against. */
export { REST_ERRORS, PROBLEM_CODES } from "pivotkit-cli/rest";

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
