/*
 * The error model of pivotkit-core:
 *
 * - A bad view never throws. A view is user input; normalize() drops what it cannot use and reports
 *   it as an issue, and every function that takes a view normalizes it first.
 * - A programmer error throws a PivotkitError: a wrong argument (computePivot(null), toGrid({})), an
 *   invalid option (an unknown locale or time zone in the options) or a resource limit (more cells
 *   than `limits.cells`, more rows than an XLSX sheet holds). `code` tells them apart.
 */

/** @typedef {"INVALID_ARGUMENT" | "INVALID_OPTION" | "LIMIT_EXCEEDED"} PivotkitErrorCode */

export class PivotkitError extends Error {
    /**
     * @param {PivotkitErrorCode} code
     * @param {string} message
     * @param {Record<string, unknown>} [details]  for LIMIT_EXCEEDED: { limit, value, max }
     */
    constructor(code, message, details = {}) {
        super(message);
        this.name = "PivotkitError";
        /** @type {PivotkitErrorCode} */
        this.code = code;
        /** @type {Record<string, unknown>} */
        this.details = details;
    }
}

/**
 * Throws INVALID_ARGUMENT unless `ok`.
 * @param {unknown} ok
 * @param {string} message
 * @returns {asserts ok}
 */
export function expect(ok, message) {
    if (!ok) {
        throw new PivotkitError("INVALID_ARGUMENT", message);
    }
}

/**
 * Throws LIMIT_EXCEEDED when `value` is above `max`.
 * @param {string} limit  name of the limit, as in LIMITS
 * @param {number} value
 * @param {number} max
 * @param {string} what  for the message, e.g. "grid cells"
 */
export function checkLimit(limit, value, max, what) {
    if (value > max) {
        throw new PivotkitError(
            "LIMIT_EXCEEDED",
            `${value.toLocaleString("en-US")} ${what} exceed the limit of ${max.toLocaleString("en-US")} (limits.${limit})`,
            { limit, value, max }
        );
    }
}
