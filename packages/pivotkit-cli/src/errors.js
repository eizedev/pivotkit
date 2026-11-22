/*
 * The command line's own error: a pivotkit-server's refusal or a network error. Every other error is
 * a CliError of pivotkit-node/files, which says how a message names a file and what it may quote. A
 * CliError is exit code 2; a view's findings are exit code 1 (cli.js).
 */

import { CliError } from "pivotkit-node/files";

/**
 * A pivotkit-server's refusal (an RFC 9457 problem), an answer that is none of a pivotkit-server, or
 * a network error: kind "remote" with the HTTP status (null without an answer) and the seconds the
 * server asks to wait (Retry-After), else null. The message holds fixed words, the problem's code
 * and its cleaned detail only.
 */
export class RemoteError extends CliError {
    /**
     * @param {string} code
     * @param {string} message
     * @param {{ status?: number | null, retryAfter?: number | null }} [more]
     */
    constructor(code, message, { status = null, retryAfter = null } = {}) {
        super("remote", code, message);
        this.name = "RemoteError";
        this.status = status;
        this.retryAfter = retryAfter;
    }
}
