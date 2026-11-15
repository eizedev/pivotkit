/*
 * What the options table and its fragments share, in a module that imports none of them (so a
 * fragment can throw a ConfigError without importing config.js): the error, the slots a fragment can
 * add keys to, and the schema of a secret reference.
 */

export class ConfigError extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = "ConfigError";
        this.code = "CONFIG";
    }
}

/**
 * Where a fragment's keys go: `top` (a top-level key of the options), `source` (a key of
 * sources.<id>), `policy` (a key of every policy: the server's, a profile's, a source's and
 * files.policy; a fragment's validate refuses the places its key means nothing), and the keys of the
 * objects `http`, `auth`, `mcp`, `rest` and `output`.
 */
export const SLOTS = Object.freeze(["top", "source", "http", "policy", "auth", "mcp", "rest", "output"]);

/** @typedef {"top" | "source" | "http" | "policy" | "auth" | "mcp" | "rest" | "output"} Slot */

/**
 * What is wrong with a secret reference: exactly one of `{ "env": "NAME" }` (an environment variable)
 * or `{ "file": "path" }` (relative to the configuration file), never the secret itself.
 * @param {unknown} ref
 * @returns {string[]}
 */
function secretRefProblems(ref) {
    if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
        return ['must be a reference to a secret, { "env": "NAME" } or { "file": "path" }, never the secret itself'];
    }
    const keys = Object.keys(ref);
    const extra = keys.filter((k) => k !== "env" && k !== "file");
    if (extra.length) {
        return [`unknown key "${extra[0].slice(0, 60)}" (known: env, file)`];
    }
    const given = keys.filter((k) => typeof (/** @type {any} */ (ref)[k]) === "string" && /** @type {any} */ (ref)[k] !== "");
    return given.length === 1 && keys.length === 1 ? [] : ["give either env (the variable that holds it) or file, as a non-empty text"];
}

/** The schema of a secret reference in the options' schema language (a custom check). */
export const SECRET_REF = Object.freeze({ custom: secretRefProblems });
