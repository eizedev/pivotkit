/*
 * The errors of an operation: their codes, each with the HTTP status a REST front end answers
 * with, and OperationError.
 */

import { CodedError } from "pivotkit-core/internal";

/** The codes of OperationError, each with the HTTP status a REST front end answers with. */
export const OPERATION_ERRORS = Object.freeze({
    INVALID_INPUT: 400,
    FILES_NOT_ALLOWED: 403,
    NOT_ALLOWED: 403,
    SOURCE_NOT_FOUND: 404,
    FILE_NOT_AVAILABLE: 404,
    NO_OUTPUT: 409,
    NO_LINK: 409,
    NOT_SCHEDULABLE: 409,
    LIMIT_EXCEEDED: 413,
    UNSUPPORTED_FORMAT: 415,
    INVALID_FILE: 422,
    NOT_REGULAR_FILE: 422,
    HARD_LINK: 422,
    INVALID_TEMPLATE: 422,
    DATA_MISMATCH: 422,
    DATA_NOT_AVAILABLE: 404,
    SOURCE_UNAVAILABLE: 502,
    UPLOAD_FAILED: 502,
    BUSY: 503,
    NOT_READY: 503,
    TIMEOUT: 504,
    INTERNAL: 500
});

/**
 * What an error may say beyond its code and message, for a person to act on: the request's id (to
 * quote to the operator), whether the same call may work when tried again, and after how many
 * seconds.
 * @typedef {object} OperationErrorDetails
 * @property {string} [requestId]
 * @property {boolean} [retryable]
 * @property {number} [retryAfter]  seconds
 */

/** An error of an operation a front end shows as it is: a stable code and a message without file content. */
/** @extends {CodedError<keyof typeof OPERATION_ERRORS, OperationErrorDetails | undefined>} */
export class OperationError extends CodedError {
    /**
     * @param {keyof typeof OPERATION_ERRORS} code
     * @param {string} message
     * @param {OperationErrorDetails} [details]
     */
    constructor(code, message, details = undefined) {
        super(code, message, {
            details: details
                ? {
                      ...(typeof details.requestId === "string" ? { requestId: details.requestId } : {}),
                      ...(typeof details.retryable === "boolean" ? { retryable: details.retryable } : {}),
                      ...(Number.isSafeInteger(details.retryAfter) && /** @type {number} */ (details.retryAfter) >= 0 ? { retryAfter: details.retryAfter } : {})
                  }
                : undefined
        });
        this.name = "OperationError";
        this.status = OPERATION_ERRORS[code] ?? 500;
    }
}
