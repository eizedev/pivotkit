/*
 * Whether a secret's value is one the server can use, by the server's own rules, for code that
 * makes or keeps a secret (credentials.js, a start that creates a missing one): a static token
 * (auth.js TOKEN_MIN, TOKEN_SYNTAX and tokenGuessable), the download links' key (downloads/tokens.js KEY_MIN_BYTES) and the
 * audit key (log.js AUDIT_KEY_MIN), each one line as secrets.js reads it. Each check gives why a value
 * cannot be used, or null; never the value.
 */

import { TOKEN_MIN, TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT, tokenGuessable } from "./auth.js";
import { KEY_MIN_BYTES } from "./downloads/tokens.js";
import { AUDIT_KEY_MIN } from "./log.js";

/**
 * Why a static token cannot be used, or null.
 * @param {string} value
 * @returns {string | null}
 */
export const tokenProblem = (value) => (value.length < TOKEN_MIN ? `${value.length} characters, at least ${TOKEN_MIN}` : TOKEN_SYNTAX.test(value) ? tokenGuessable(value) : TOKEN_SYNTAX_TEXT);

/** What a key is for: output.downloads.key or audit.key. */
export const KEY_USES = Object.freeze(["downloads", "audit"]);

/**
 * Why a key cannot be used for `use`, or null.
 * @param {"downloads" | "audit"} use
 * @returns {(value: string) => string | null}
 */
export const keyProblem = (use) => (value) => {
    if (!value || /[\r\n\0]/.test(value)) {
        return value ? "a line break or NUL inside" : "empty";
    }
    if (use === "downloads" && Buffer.byteLength(value) < KEY_MIN_BYTES) {
        return `shorter than ${KEY_MIN_BYTES} bytes`;
    }
    return use === "audit" && value.length < AUDIT_KEY_MIN ? `shorter than ${AUDIT_KEY_MIN} characters` : null;
};
