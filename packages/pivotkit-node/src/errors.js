/*
 * The errors of reading and writing files for a caller, and how a message names what it is about.
 * A CliError has a kind (what went wrong, for scripts) and a code; the command line ends with exit
 * code 2 for it. No message holds the content of a file: a path is named by its base name (a
 * directory below the working directory as typed), text from a file or a view is cleaned before it
 * is printed; what a message may quote from data is the header's field names (each cut) and at most
 * one cell value where it says what to fix, cut at 20 characters.
 */

import { basename } from "node:path";
import { PivotkitError } from "pivotkit-core";
import { CodedError } from "pivotkit-core/internal";
import { cleanText } from "pivotkit-core/import";
import { OperationError } from "pivotkit-report/operations";

/** @typedef {"usage" | "io" | "limit" | "template" | "remote" | "internal"} ErrorKind */

/** @extends {CodedError<string, undefined>} */
export class CliError extends CodedError {
    /**
     * @param {ErrorKind} kind
     * @param {string} code  a stable name, e.g. NOT_FOUND, OUTSIDE_ALLOWED_DIR, UNKNOWN_OPTION
     * @param {string} message
     */
    constructor(kind, code, message) {
        super(code, message);
        this.name = "CliError";
        this.kind = kind;
    }
}

/** The most characters of a name or message from outside that a message prints. */
const PRINT_LENGTH = 200;

/** Text from a file, a view or the data, safe to print: no control or direction characters, capped. */
export function printable(text) {
    const clean = cleanText(String(text ?? ""));
    return clean.length > PRINT_LENGTH ? `${clean.slice(0, PRINT_LENGTH - 1)}…` : clean;
}

/** A path as messages name it: its base name only. */
export const shortName = (path) => printable(path === "-" ? "stdin" : basename(String(path)));

/** What Node's file errors mean, by their code. */
const FILE_ERRORS = Object.freeze({ ENOENT: "not found", EACCES: "not allowed to read or write", EPERM: "not allowed to read or write", EISDIR: "is a directory", ENOTDIR: "a part of the path is not a directory", ELOOP: "is a symbolic link", EEXIST: "exists", ENOSPC: "no space left on the disk", EROFS: "the file system is read-only" });

/**
 * The kind of a pivotkit-core error, by its code.
 * @param {PivotkitError} error
 * @returns {ErrorKind}
 */
function kindOfPivotkitError(error) {
    const code = /** @type {string} */ (error.code);
    // a reader over a limit throws LIMIT_EXCEEDED; pivotkit-xlsx 0.1.0 threw INVALID_FILE with reason
    // LIMIT and details.limit, and a host may still have it installed next to this package
    const overLimit = code === "LIMIT_EXCEEDED" || (code === "INVALID_FILE" && (error.details?.reason === "LIMIT" || typeof error.details?.limit === "string"));
    return overLimit ? "limit" : code === "INVALID_TEMPLATE" ? "template" : code === "INVALID_FILE" ? "io" : code === "INVALID_OPTION" ? "usage" : "internal";
}

/**
 * Any error as a CliError: pivotkit-core's by their code, Node's file errors by theirs (with the
 * file's base name, never its content), anything else as internal.
 * @param {unknown} error
 * @param {string} [path]  the file it is about
 * @returns {CliError}
 */
export function asCliError(error, path) {
    if (error instanceof CliError) {
        return error;
    }
    const name = path ? shortName(path) : "";
    if (error instanceof PivotkitError) {
        const reason = typeof error.details?.reason === "string" ? error.details.reason : /** @type {string} */ (error.code);
        return new CliError(kindOfPivotkitError(error), reason, printable(name && !error.message.includes(name) ? `${name}: ${error.message}` : error.message));
    }
    if (error instanceof OperationError) {
        // an operation of pivotkit-report's table: its code, the CLI's kind for it
        const kind = error.code === "LIMIT_EXCEEDED" ? "limit" : error.code === "INVALID_INPUT" ? "usage" : error.code === "INTERNAL" ? "internal" : "io";
        return new CliError(kind, error.code, printable(error.message));
    }
    const e = /** @type {NodeJS.ErrnoException} */ (error);
    if (e && typeof e.code === "string" && Object.hasOwn(FILE_ERRORS, e.code)) {
        return new CliError("io", e.code, `${name || "file"}: ${FILE_ERRORS[e.code]}`);
    }
    return new CliError("internal", "INTERNAL", printable(e && e.message ? e.message : String(error)));
}
