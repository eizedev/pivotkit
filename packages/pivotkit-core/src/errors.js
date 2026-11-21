/*
 * The error model of pivotkit-core:
 *
 * - A bad view never throws. A view is user input; normalize() drops what it cannot use and reports
 *   it as an issue, and every function that takes a view normalizes it first. Only a host that asks
 *   for it gets an error: computePivot's `strict` throws INVALID_VIEW, with the error issues in
 *   `details.issues` (#563).
 * - A programmer error throws a PivotkitError: a wrong argument (computePivot(null), toGrid({})), an
 *   invalid option (an unknown locale or time zone in the options) or a resource limit (more cells
 *   than `limits.cells`, more rows than an XLSX sheet holds). `code` tells them apart.
 * - A file that cannot be read (pivotkit-core/import and reader plugins) throws INVALID_FILE, with
 *   `details.reason` (WRONG_TYPE, UNCLOSED_QUOTE, ENCRYPTED, ...) and `details.file`; a file over a
 *   limit throws LIMIT_EXCEEDED with `details.file`.
 * - A print template that puts a placeholder where filled-in text could become markup, a link or code
 *   (pivotkit-report) throws INVALID_TEMPLATE, with `details.reason` and the placeholder.
 */

/** @typedef {"INVALID_ARGUMENT" | "INVALID_OPTION" | "INVALID_VIEW" | "LIMIT_EXCEEDED" | "INVALID_FILE" | "INVALID_TEMPLATE"} PivotkitErrorCode */

export class PivotkitError extends Error {
    /**
     * @param {PivotkitErrorCode} code
     * @param {string} message
     * @param {Record<string, unknown>} [details]  for LIMIT_EXCEEDED: { limit, value, max }, for a file also
     *   { file, what } (what was counted, in English); for INVALID_FILE: { reason, file }
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
 * The words of a limit a value ran over, the same in every package: "1,001 rows exceed the limit of
 * 1,000 (limits.rows)". Numbers are written in en-US, never the runtime's locale.
 * @param {number} value
 * @param {number} max
 * @param {string} what  what is counted, e.g. "grid cells"
 * @param {string} where  the setting that holds the limit, e.g. "limits.rows"
 * @returns {string}
 */
export const limitText = (value, max, what, where) => `${value.toLocaleString("en-US")} ${what} exceed the limit of ${max.toLocaleString("en-US")} (${where})`;

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
            limitText(value, max, what, `limits.${limit}`),
            { limit, value, max }
        );
    }
}
