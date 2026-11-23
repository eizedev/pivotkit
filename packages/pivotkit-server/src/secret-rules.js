/*
 * The one place of the rules a secret's value must meet to be used: a static token (length, syntax,
 * not guessable), the download links' key and the audit key. Everything that makes, reads or checks
 * such a value asks here: the start (auth.js, downloads/tokens.js), a token file read again on
 * requests, check-config (check/*), and the commands that make a secret (credentials.js, state.js).
 * Each check gives why a value cannot be used, or null; never the value. A leaf: it imports nothing
 * of the server.
 */

import { TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT } from "pivotkit-node/rest";

/** The fewest characters of a static token. */
export const TOKEN_MIN = 32;

/**
 * The fewest different characters of a static token. A random token has far more: `token new`
 * gives 43 characters of 64, and a hex token of 32 characters (openssl rand -hex 16) had at least 8
 * in a million tries.
 */
export const TOKEN_DISTINCT_MIN = 8;

/**
 * Why a static token is too easy to guess, or null: fewer than TOKEN_DISTINCT_MIN different
 * characters, or one piece repeated (the token repeats with a period of at most half its length,
 * such as abcabc...). The failed-token limit slows guessing per address only, so a token must not be
 * guessable.
 * @param {string} value
 * @returns {string | null}
 */
function tokenGuessable(value) {
    const distinct = new Set(value).size;
    if (distinct < TOKEN_DISTINCT_MIN) {
        return `too easy to guess (${distinct} different character${distinct === 1 ? "" : "s"}, at least ${TOKEN_DISTINCT_MIN})`;
    }
    // the shortest period: the length less the longest border (Knuth-Morris-Pratt's prefix function)
    const border = new Int32Array(value.length);
    for (let i = 1, k = 0; i < value.length; i++) {
        while (k > 0 && value[i] !== value[k]) {
            k = border[k - 1];
        }
        if (value[i] === value[k]) {
            k++;
        }
        border[i] = k;
    }
    return value.length - border[value.length - 1] <= value.length / 2 ? "too easy to guess (one piece repeated)" : null;
}

/** What a bearer token may hold and why another one does not work: pivotkit-node/rest's, which the CLI checks a token against before it sends it. */
export { TOKEN_SYNTAX };

/** The least length of output.downloads.key, in bytes. */
const KEY_MIN_BYTES = 32;

/** The least characters of audit.key. */
const AUDIT_KEY_MIN = 16;

/**
 * What keeps a static token from being used, or null: "short" (fewer than TOKEN_MIN characters),
 * "syntax" (a character a bearer token cannot hold) or "guessable", with the words for each.
 * @param {string} value
 * @returns {{ kind: "short" | "syntax" | "guessable", text: string } | null}
 */
export function tokenFault(value) {
    if (value.length < TOKEN_MIN) return { kind: "short", text: `${value.length} characters, at least ${TOKEN_MIN}` };
    if (!TOKEN_SYNTAX.test(value)) return { kind: "syntax", text: TOKEN_SYNTAX_TEXT };
    const guessable = tokenGuessable(value);
    return guessable ? { kind: "guessable", text: guessable } : null;
}

/**
 * Why a static token cannot be used, or null.
 * @param {string} value
 * @returns {string | null}
 */
export const tokenProblem = (value) => tokenFault(value)?.text ?? null;

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
    return use === "audit" && value.length < AUDIT_KEY_MIN ? `at least ${AUDIT_KEY_MIN} characters` : null;
};
