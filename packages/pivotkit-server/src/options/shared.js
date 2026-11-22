/*
 * What the options table and its fragments share, in a module that imports none of them (so a
 * fragment can throw a ConfigError without importing config.js): the error, the slots a fragment can
 * add keys to, and the schema of a secret reference.
 */

import { CodedError } from "pivotkit-core/internal";

export class ConfigError extends CodedError {
    /**
     * @param {string} message
     * @param {string[]} [problems]  each problem's own message, where the error names several
     */
    constructor(message, problems = [message]) {
        super("CONFIG", message);
        this.name = "ConfigError";
        this.problems = problems;
    }
}

/**
 * How a rule reports a value out of its range (a number below or above its bounds). validateOptions
 * collects these, so check-config and the start name every such value at once; a rule never reads
 * on from a value it reported. Called alone, without validateOptions, it throws.
 * @typedef {(message: string) => void} RangeProblem
 */

/** @type {RangeProblem} */
export const throwRange = (message) => {
    throw new ConfigError(message);
};

/**
 * One ConfigError for the problems found: a single one as its own message, several counted, each on a
 * line of its own.
 * @param {string[]} problems  at least one
 */
export function configErrorOf(problems) {
    return problems.length === 1 ? new ConfigError(problems[0]) : new ConfigError(`${problems.length} problems in the configuration:\n  ${problems.join("\n  ")}`, problems);
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
 * or `{ "file": "path" }` (relative to the configuration file), never the secret itself. `creatable`:
 * a file reference may add `"create": true` (pivotkit makes the file where it is missing); elsewhere
 * the secret is one another system issues.
 * @param {unknown} ref
 * @param {boolean} creatable
 * @returns {string[]}
 */
function secretRefProblems(ref, creatable) {
    if (ref === null || typeof ref !== "object" || Array.isArray(ref)) {
        return ['must be a reference to a secret, { "env": "NAME" } or { "file": "path" }, never the secret itself'];
    }
    const keys = Object.keys(ref);
    const r = /** @type {any} */ (ref);
    if (keys.includes("create")) {
        if (!creatable) {
            return ["create: pivotkit cannot make a secret another system issues; make it there and name it by env or file"];
        }
        if (typeof r.create !== "boolean") {
            return ["create: must be true or false"];
        }
        if (r.env !== undefined) {
            return [CREATE_NEEDS_FILE];
        }
    }
    const known = creatable ? ["env", "file", "create"] : ["env", "file"];
    const extra = keys.filter((k) => !known.includes(k));
    if (extra.length) {
        return [`unknown key "${extra[0].slice(0, 60)}" (known: ${known.join(", ")})`];
    }
    const given = ["env", "file"].filter((k) => typeof r[k] === "string" && r[k] !== "");
    return given.length === 1 && keys.filter((k) => k !== "create").length === 1 ? [] : ["give either env (the variable that holds it) or file, as a non-empty text"];
}

/** What a reference with create and env is told. */
export const CREATE_NEEDS_FILE = "create needs file; pivotkit cannot set a variable";

/** The schema of a secret reference in the options' schema language (a custom check): one another system issues. */
export const SECRET_REF = Object.freeze({ custom: (/** @type {unknown} */ ref) => secretRefProblems(ref, false) });

/**
 * The schema of a secret reference pivotkit may make: `{ "file": "path", "create": true }` makes the
 * file where it is missing (state.js), or `{ "env": "NAME" }` (output.downloads.key, audit.key).
 */
export const CREATABLE_SECRET_REF = Object.freeze({ custom: (/** @type {unknown} */ ref) => secretRefProblems(ref, true) });
