/*
 * The id of a request: 8 random bytes in base64url, carried through the request's work with
 * AsyncLocalStorage, so an error deep inside a source can name it and the request's log line can say
 * the same id. A person quotes it to the operator; it says nothing about the request itself. The
 * REST service runs each request, the MCP server each tool call, inside withRequestId; their log lines
 * carry the id, and a problem or tool error of an error with details names it. Outside a request,
 * errorDetails makes a fresh id per error.
 *
 *   await withRequestId(newRequestId(), () => present(...));
 *   throw new OperationError("SOURCE_UNAVAILABLE", "...", errorDetails({ retryable: true }));
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

/** The request id of the work running now. */
const current = new AsyncLocalStorage();

/** A new request id: 8 random bytes, base64url (11 characters). */
export const newRequestId = () => randomBytes(8).toString("base64url");

/** The form of a request id. */
export const REQUEST_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Runs fn with a request id that requestId() reads inside it (also across awaits).
 * @template T
 * @param {string} id
 * @param {() => T} fn
 * @returns {T}
 */
export const withRequestId = (id, fn) => current.run(id, fn);

/**
 * Where a front end keeps a request's id in serveFetch's `info`, so the precheck, the route and an
 * answer to a body that cannot be read name the same id.
 */
const INFO_KEY = Symbol("pivotkit.requestId");

/**
 * The id of the request `info` belongs to: made on first use, then the same.
 * @param {Record<string | symbol, any>} info
 * @returns {string}
 */
export function requestIdFor(info) {
    if (!Object.hasOwn(info, INFO_KEY)) {
        info[INFO_KEY] = newRequestId();
    }
    return info[INFO_KEY];
}

/** Whether a value is a request id of pivotkit's form (an error's details may come from a source's code). */
export const isRequestId = (value) => typeof value === "string" && REQUEST_ID.test(value);

/** The request id of the work running now, or null outside withRequestId. */
export const requestId = () => /** @type {string | undefined} */ (current.getStore()) ?? null;

/**
 * The details of an OperationError a person can act on: the running request's id (a new one when
 * none runs, so an error always carries one), whether trying again may work, and after how long.
 * @param {{ retryable: boolean, retryAfter?: number }} how
 * @returns {import("pivotkit-report/operations").OperationErrorDetails}
 */
export function errorDetails({ retryable, retryAfter }) {
    return { requestId: requestId() ?? newRequestId(), retryable, ...(retryAfter !== undefined ? { retryAfter } : {}) };
}
