/*
 * The REST service's errors: RFC 9457 problem details (application/problem+json) with `type` (a
 * stable address per code), `title`, `status`, `code` (one of OPERATION_ERRORS or REST_ERRORS) and
 * `detail`. An operation's message is written to be shown (no file content, no values); a 5xx
 * carries a fixed text, never an error's message (a source's or a store's failure can hold an address
 * or a system error code). An error with details (a source or a store that failed) adds `requestId`
 * (the id on the request's log line, to quote to the operator), `retryable` and `Retry-After`.
 */

import { OPERATION_ERRORS, OperationError } from "pivotkit-report/operations";
import { isRequestId, requestId } from "../request-id.js";
import { REST_ERRORS } from "pivotkit-cli/rest";
import { hostRefusedLine } from "../checks.js";
import { PARAMS_BUSY_TEXT } from "../sources/params.js";
import { TEMPLATE_UNAVAILABLE_TEXT } from "../print-template.js";
import { DOCS_SITE } from "../options/branding.js";


/** The codes the REST layer adds to the operations', with their status, and every code a problem can carry: pivotkit-cli/rest's, which the CLI's remote mode checks answers against. */
export { REST_ERRORS, PROBLEM_CODES } from "pivotkit-cli/rest";

/** A code's status. */
export const statusOf = (code) => REST_ERRORS[code] ?? OPERATION_ERRORS[code] ?? 500;

/** The fixed words of a code (the problem's title). */
const titleOf = (code) => code.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * The address that names a code: its row in the docs' table of errors, under the documentation's
 * base (branding.docsUrl); "about:blank" where the operator set no documentation (RFC 9457 4.2.1:
 * the problem has no further meaning than its status; `code` still names it).
 * @param {string} code
 * @param {string | null} [docs]  the base (branding.js docsOf); pivotkit's site when left out
 */
export const typeOf = (code, docs = DOCS_SITE) => (docs === null ? "about:blank" : `${docs}reference/rest/#error-${code.toLowerCase().replace(/_/g, "-")}`);

/** What a 5xx says instead of the error's message. */
const SERVER_TEXT = { BUSY: "the server is busy with other reports; try again in a moment", NOT_READY: "the server is starting or shutting down; try again in a moment", AUTH_NOT_READY: "the server is waiting for its authorization server; try again in a moment", TIMEOUT: "the report took longer than the server allows; make the view smaller or filter more", SOURCE_UNAVAILABLE: "the source is not available right now; if it stays so, give the operator the request id", UPLOAD_FAILED: "the report was made but could not be stored; give the operator the request id", INTERNAL: "internal error" };

/** Other fixed texts of a code, picked by the error's `reason` (a SourceError's, sources/run.js SOURCE_REASONS; a pattern check's, sources/params.js). */
const SERVER_TEXT_BY_REASON = Object.freeze({
    BUSY: Object.freeze({ params: PARAMS_BUSY_TEXT, records: "too many rows requests run at once, or one of yours still runs; try again in a moment" }),
    SOURCE_UNAVAILABLE: Object.freeze({ refused: "the source's backend refused this server's access; ask the operator and give the request id", setup: "the source is not set up correctly; ask the operator and give the request id", template: TEMPLATE_UNAVAILABLE_TEXT })
});

/**
 * The fixed text of a code of status 500 or more, for REST and MCP alike: an error's own message of
 * such a code can hold an address or a system error code and never reaches a caller. `reason` picks
 * another of pivotkit's fixed texts of the code; an unknown one is the code's text.
 * @param {string} code
 * @param {unknown} [reason]  the error's reason (OperationError's `reason`, set by sources/run.js sourceFailure)
 */
export const serverTextOf = (code, reason = undefined) => {
    const variants = /** @type {Record<string, string> | undefined} */ (SERVER_TEXT_BY_REASON[/** @type {keyof typeof SERVER_TEXT_BY_REASON} */ (code)]);
    return (typeof reason === "string" && variants && Object.hasOwn(variants, reason) ? variants[reason] : undefined) ?? SERVER_TEXT[/** @type {keyof typeof SERVER_TEXT} */ (code)] ?? SERVER_TEXT.INTERNAL;
};

/** The headers every answer of the REST service carries. */
export const SAFE_HEADERS = Object.freeze({ "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" });

/**
 * A problem document as a Response.
 * @param {string} code
 * @param {string} detail
 * @param {{ headers?: Record<string, string>, extra?: Record<string, unknown>, reason?: string, docs?: string | null }} [more]  extra: further members (a view's findings); reason: which fixed text a 5xx says (serverTextOf); docs: the documentation's base (typeOf)
 */
export function problem(code, detail, more = {}) {
    const status = statusOf(code);
    const body = { type: typeOf(code, more.docs), title: titleOf(code), status, code, detail: status >= 500 ? serverTextOf(code, more.reason) : String(detail).slice(0, 1000), ...(more.extra ?? {}) };
    return new Response(JSON.stringify(body), { status, headers: { ...SAFE_HEADERS, "content-type": "application/problem+json", ...(more.headers ?? {}) } });
}

/**
 * The answer to a request whose Host is refused, as problem+json, with its refused line.
 * @param {{ refused(entry: Record<string, unknown>): void }} log
 * @param {Request} request
 * @param {string} refused  hostRefusal's
 * @param {string | null} [docs]  the documentation's base (typeOf)
 */
export function hostProblem(log, request, refused, docs = undefined) {
    log.refused(hostRefusedLine(request, refused));
    return problem("FORBIDDEN_HOST", refused, { docs });
}

/** The codes whose problem says when to try again, without details of their own. */
const RETRY_AFTER = Object.freeze({ BUSY: "5", NOT_READY: "5" });

/**
 * An error of an operation (or anything else, as INTERNAL) as a problem: the code's status and text,
 * from an OperationError's details `retryable` and the header `Retry-After`, and `requestId`: the
 * details' when it has pivotkit's form, else the running request's (none outside a request).
 * @param {unknown} error
 * @param {{ headers?: Record<string, string>, extra?: Record<string, unknown>, docs?: string | null }} [more]
 */
export function problemOf(error, more = {}) {
    if (!(error instanceof OperationError)) {
        return problem("INTERNAL", "internal error", { ...more, extra: { ...idMember(requestId()), ...(more.extra ?? {}) } });
    }
    const details = error.details ?? {};
    const retryAfter = details.retryAfter !== undefined ? String(details.retryAfter) : RETRY_AFTER[/** @type {keyof typeof RETRY_AFTER} */ (error.code)];
    return problem(error.code, error.message, {
        docs: more.docs,
        reason: /** @type {any} */ (error).reason,
        headers: { ...(retryAfter !== undefined ? { "retry-after": retryAfter } : {}), ...(more.headers ?? {}) },
        extra: { ...idMember(isRequestId(details.requestId) ? details.requestId : requestId()), ...(details.retryable !== undefined ? { retryable: details.retryable } : {}), ...(more.extra ?? {}) }
    });
}

/**
 * problem, problemOf and hostProblem bound to a documentation base, for a handler of one context
 * (branding.js: context.branding.docs).
 * @param {string | null} docs
 */
export function problemsFor(docs) {
    return {
        /** @type {typeof problem} */
        problem: (code, detail, more = {}) => problem(code, detail, { docs, ...more }),
        /** @type {typeof problemOf} */
        problemOf: (error, more = {}) => problemOf(error, { docs, ...more }),
        /** @type {typeof hostProblem} */
        hostProblem: (log, request, refused) => hostProblem(log, request, refused, docs)
    };
}

/** The member `requestId`, or none without an id. */
const idMember = (id) => (id ? { requestId: id } : {});

/**
 * A problem answer with the member `requestId` added (when it has none), so a person can quote it; any
 * other answer as it is.
 * @param {Response} response
 * @param {string} id
 */
export async function withRequestIdMember(response, id) {
    if (!response.headers.get("content-type")?.includes("application/problem+json")) {
        return response;
    }
    const body = await response.json();
    if (body.requestId !== undefined) {
        return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
    }
    const { type, title, status, code, detail, ...rest } = body;
    return new Response(JSON.stringify({ type, title, status, code, detail, requestId: id, ...rest }), { status: response.status, headers: response.headers });
}

/** A JSON answer. */
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...SAFE_HEADERS, "content-type": "application/json", ...headers } });
