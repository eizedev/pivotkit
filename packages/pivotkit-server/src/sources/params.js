/*
 * A source's parameters (sources.<id>.params): values a caller passes with the source's id
 * ("params": { "customer": "acme" }) and the source's loader receives, checked and written again by
 * pivotkit first. Each declared parameter has a type (string, integer, number, boolean) and may be
 * required, have a default, an enum, a pattern, lengths, a range or the date format. A parameter
 * bound to a claim of the caller's sign-in (claim) is never taken from the caller.
 *
 *   declaredProblems(declared)                 what is wrong with a declaration (the config check)
 *   paramSchemaOf(declared)                    the JSON Schema of the values
 *   normalizeParams(declared, given, caller, id)  the values checked, typed, defaults filled
 *   paramsList(declared)                       what list_sources says about them
 *   claimNamesOf(sources), claimsOf(payload, names)  the claims a verified token gives a caller
 */

import { createContext, Script } from "node:vm";
import { LIMITS } from "pivotkit-core";
import { OperationError } from "pivotkit-report/operations";

/** A parameter's name. */
export const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** The types a parameter can have. */
export const PARAM_TYPES = Object.freeze(["string", "integer", "number", "boolean"]);

/** The most parameters of a source, and characters of a value: what a view file's source.params carries. */
export const PARAM_LIMITS = Object.freeze({ count: LIMITS.srcParams, length: LIMITS.srcParamLength, defaultLength: 64 });

/** What a string parameter without a pattern or an enum allows (no "/", no "%", no spaces). */
const SAFE_TEXT = /^[A-Za-z0-9._~-]+$/;

/** A date parameter's form. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The keys a parameter's declaration may have. */
const DECLARATION_KEYS = new Set(["type", "required", "description", "example", "enum", "pattern", "minLength", "maxLength", "minimum", "maximum", "format", "default", "claim"]);

/** The longest name of a claim a parameter is bound to. */
const CLAIM_NAME_MAX = 256;

/** The longest pattern a parameter may have. */
export const PATTERN_MAX = 256;

/**
 * An operator's pattern as it is run: anchored at both ends (a pattern is the whole value, never a
 * part of it: "^[a-z]+" would let "abc/../admin" through otherwise), with the u flag.
 * @param {string} pattern
 */
export const compilePattern = (pattern) => new RegExp(`^(?:${pattern})$`, "u");

/**
 * Whether a pattern repeats a group ("(a|a)*", "(?:a|aa)+", "(a|a){1,60}", "(ab){2}"). A repeated
 * group can match one text in many ways, bounded or not, and a backtracking engine tries them all:
 * some values take seconds or longer, in the server's main thread. A group may only be optional
 * ("(-x)?", "(-x){0,1}"); any quantifier is allowed on a single character, an escape or a class.
 * Syntax alone cannot catch every slow pattern ("\d*\d*\d*x" is slow without a group), so every
 * match also runs under a time limit (matchWithin) and declaredProblems tries each pattern on
 * values made to be slow.
 * @param {string} pattern
 */
export function repeatsGroup(pattern) {
    let inClass = false;
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === "\\") {
            i++;
        } else if (inClass) {
            inClass = c !== "]";
        } else if (c === "[") {
            inClass = true;
        } else if (c === ")" && /^(?:[*+]|\{(?!0,1\})\d*(?:,\d*)?\})/u.test(pattern.slice(i + 1))) {
            return true;
        }
    }
    return false;
}

/** The longest an operator's pattern may run on one value, in ms. */
export const MATCH_MS = 25;

/** Where operator patterns run: a context of their own, so the time limit can stop one. */
const sandbox = createContext(Object.create(null));
const MATCH = new Script("re.test(text)");

/**
 * Whether a pattern matches a text, run with a time limit of MATCH_MS (node:vm's timeout, which
 * interrupts a running regular expression): true, false, or null when it took longer.
 * @param {RegExp} re
 * @param {string} text
 * @returns {boolean | null}
 */
export function matchWithin(re, text) {
    sandbox.re = re;
    sandbox.text = text;
    try {
        return Boolean(MATCH.runInContext(sandbox, { timeout: MATCH_MS }));
    } catch (e) {
        if (/** @type {any} */ (e)?.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
            return null;
        }
        throw e;
    } finally {
        sandbox.re = undefined;
        sandbox.text = undefined;
    }
}

/**
 * Whether a pattern is slow on some value of up to `length` characters: tried on runs of letters,
 * digits, spaces, punctuation and each character the pattern names, each followed by a character
 * that ends a match late ("!"). A value that runs out of time is tried once more before the pattern
 * counts as slow, so a host busy at start (another process, a garbage collection) does not refuse a
 * pattern that is fast.
 * @param {RegExp} re
 * @param {number} length
 * @param {(re: RegExp, text: string) => boolean | null} [match]  matchWithin (tests pass their own)
 */
export function slowOn(re, length, match = matchWithin) {
    const chars = new Set(["a", "1", " ", "-", "_", ".", ...String(re.source).replace(/\\./gu, "").replace(/[\\^$.|?*+()[\]{}]/gu, "")]);
    for (const c of chars) {
        for (const tail of ["!", "\u0000", ""]) {
            const text = `${c.repeat(Math.max(length - 1, 1))}${tail}`;
            if (match(re, text) === null && match(re, text) === null) {
                return true;
            }
        }
    }
    return false;
}

/** The compiled patterns of a declaration, made once. */
const compiled = new WeakMap();

/** A declaration's parameters with their patterns compiled. */
function entriesOf(declared) {
    let entries = compiled.get(declared);
    if (!entries) {
        entries = Object.keys(declared)
            .sort()
            .map((name) => {
                const p = declared[name];
                return { name, ...p, regex: typeof p.pattern === "string" ? compilePattern(p.pattern) : null };
            });
        compiled.set(declared, entries);
    }
    return entries;
}

/**
 * What is wrong with a source's declaration of params, each as "<path>: <what>" (path relative to
 * the declaration, starting with its name); empty when nothing is.
 * @param {unknown} declared
 * @returns {string[]}
 */
export function declaredProblems(declared) {
    if (!declared || typeof declared !== "object" || Array.isArray(declared)) {
        return ["must be an object of parameters by name"];
    }
    const names = Object.keys(declared);
    const problems = [];
    if (names.length > PARAM_LIMITS.count) {
        problems.push(`at most ${PARAM_LIMITS.count} parameters`);
    }
    for (const name of names) {
        const p = /** @type {any} */ (declared)[name];
        const fail = (what) => problems.push(`${name}: ${what}`);
        if (!PARAM_NAME.test(name)) {
            fail('a name is letters, digits and "_" (at most 64), not starting with a digit');
            continue;
        }
        if (!p || typeof p !== "object" || Array.isArray(p)) {
            fail("must be an object with a type");
            continue;
        }
        for (const key of Object.keys(p)) {
            if (!DECLARATION_KEYS.has(key)) {
                fail(`unknown key "${key.slice(0, 40)}" (known: ${[...DECLARATION_KEYS].join(", ")})`);
            }
        }
        if (!PARAM_TYPES.includes(p.type)) {
            fail(`type must be one of ${PARAM_TYPES.join(", ")}`);
            continue;
        }
        const text = p.type === "string";
        const numeric = p.type === "integer" || p.type === "number";
        if (p.required !== undefined && typeof p.required !== "boolean") fail("required must be true or false");
        if (p.description !== undefined && (typeof p.description !== "string" || p.description.length > 500)) fail("description must be a text of at most 500 characters");
        if (p.claim !== undefined && (typeof p.claim !== "string" || !p.claim || p.claim.length > CLAIM_NAME_MAX)) fail(`claim must be a claim's name (at most ${CLAIM_NAME_MAX} characters)`);
        if (p.format !== undefined && !(text && p.format === "date")) fail('format is "date", for a string parameter');
        if (p.pattern !== undefined) {
            if (!text || typeof p.pattern !== "string") {
                fail("pattern is a regular expression, for a string parameter");
            } else if (p.pattern.length > PATTERN_MAX) {
                fail(`pattern has at most ${PATTERN_MAX} characters`);
            } else if (repeatsGroup(p.pattern)) {
                fail("pattern repeats a group (such as (a|b)*, (ab)+ or (ab){1,3}), which can take very long on some values; repeat single characters or classes ([ab]*), or make the group optional only ((-x)?)");
            } else {
                let re = null;
                try {
                    // the pattern alone, so it cannot close the anchoring group around it ("a)|(b")
                    new RegExp(p.pattern, "u");
                    re = compilePattern(p.pattern);
                } catch {
                    fail("pattern is not a valid regular expression");
                }
                if (re && slowOn(re, Number.isSafeInteger(p.maxLength) ? Math.min(p.maxLength, PARAM_LIMITS.length) : PARAM_LIMITS.defaultLength)) {
                    fail(`pattern takes too long on some values (over ${MATCH_MS} ms); write it so that one value can match it in one way only`);
                }
            }
        }
        for (const key of ["minLength", "maxLength"]) {
            if (p[key] !== undefined && (!text || !Number.isSafeInteger(p[key]) || p[key] < 0 || p[key] > PARAM_LIMITS.length)) fail(`${key} is a whole number from 0 to ${PARAM_LIMITS.length}, for a string parameter`);
        }
        for (const key of ["minimum", "maximum"]) {
            if (p[key] !== undefined && (!numeric || typeof p[key] !== "number" || !Number.isFinite(p[key]))) fail(`${key} is a number, for an integer or number parameter`);
        }
        if (p.enum !== undefined && (!Array.isArray(p.enum) || !p.enum.length || p.enum.length > 100)) {
            fail("enum is a list of 1 to 100 values");
        }
        // the example, the default and every enum value must pass the parameter's own check
        const values = [...(p.enum !== undefined && Array.isArray(p.enum) ? p.enum.map((v, i) => [`enum[${i}]`, v]) : []), ...(p.default !== undefined ? [["default", p.default]] : []), ...(p.example !== undefined ? [["example", p.example]] : [])];
        if (problems.some((x) => x.startsWith(`${name}:`))) {
            continue;
        }
        for (const [key, value] of values) {
            try {
                valueOf(name, { ...p, regex: p.pattern ? compilePattern(p.pattern) : null, enum: key.startsWith("enum") ? [value] : p.enum }, value);
            } catch (e) {
                fail(`${key}: ${String(e.message).replace(/^params\.\w+ /, "")}`);
            }
        }
        if (p.claim !== undefined && (p.default !== undefined || p.required === false)) {
            fail("a parameter bound to a claim takes neither a default nor required: false (without the claim the source is refused)");
        }
        if (p.claim !== undefined && p.type === "string" && p.pattern === undefined && p.enum === undefined) {
            fail("a parameter bound to a claim needs a pattern or an enum: the claim's value is checked like a caller's before it reaches the backend");
        }
    }
    return problems;
}

/**
 * The JSON Schema of a source's values (the parameters bound to a claim left out).
 * @param {Record<string, any>} declared
 */
export function paramSchemaOf(declared) {
    /** @type {Record<string, any>} */
    const properties = {};
    const required = [];
    for (const p of entriesOf(declared)) {
        if (p.claim !== undefined) {
            continue;
        }
        properties[p.name] = {
            type: p.type,
            ...(p.description ? { description: p.description } : {}),
            ...(p.enum ? { enum: p.enum } : {}),
            ...(p.type === "string" ? { maxLength: p.maxLength ?? PARAM_LIMITS.defaultLength, ...(p.minLength !== undefined ? { minLength: p.minLength } : {}), ...(p.pattern ? { pattern: p.pattern } : {}), ...(p.format ? { format: p.format } : {}) } : {}),
            ...(p.minimum !== undefined ? { minimum: p.minimum } : {}),
            ...(p.maximum !== undefined ? { maximum: p.maximum } : {}),
            ...(p.default !== undefined ? { default: p.default } : {}),
            ...(p.example !== undefined ? { examples: [p.example] } : {})
        };
        if (p.required && p.default === undefined) {
            required.push(p.name);
        }
    }
    return { type: "object", properties, required, additionalProperties: false };
}

/**
 * The values a caller passed for a source, checked against its declaration: each of its type (a
 * number in a text, "true" and "false" taken as written; the value written again by pivotkit, never
 * the caller's text), defaults filled, a parameter bound to a claim taken from the caller's claims.
 * Unknown names, a value for a claim-bound one and a missing required one are INVALID_INPUT; a
 * missing claim is NOT_ALLOWED. Without a declaration: null, and any value given is refused.
 * @param {Record<string, any> | undefined} declared
 * @param {unknown} given  the input's params
 * @param {{ claims?: Readonly<Record<string, unknown>> } | null} caller
 * @param {string} id  the source's id, for the messages
 * @returns {Record<string, string | number | boolean> | null}  keys sorted, no prototype
 */
export function normalizeParams(declared, given, caller, id) {
    if (given !== undefined && given !== null && (typeof given !== "object" || Array.isArray(given))) {
        throw new OperationError("INVALID_INPUT", "params is an object of values by name");
    }
    const values = /** @type {Record<string, unknown>} */ (given ?? {});
    const names = Object.keys(values);
    if (!declared) {
        if (names.length) {
            throw new OperationError("INVALID_INPUT", `the source ${id} takes no params`);
        }
        return null;
    }
    const entries = entriesOf(declared);
    for (const name of names) {
        const p = entries.find((e) => e.name === name);
        if (!p) {
            const known = entries.filter((e) => e.claim === undefined).map((e) => e.name);
            throw new OperationError("INVALID_INPUT", `the source ${id} has no param ${JSON.stringify(name.slice(0, 64))}${known.length ? `; it takes ${known.join(", ")}` : ""}`);
        }
        if (p.claim !== undefined) {
            throw new OperationError("INVALID_INPUT", `params.${name} is set by the server from your sign-in; leave it out`);
        }
    }
    /** @type {Record<string, string | number | boolean>} */
    const out = Object.create(null);
    for (const p of entries) {
        let value;
        if (p.claim !== undefined) {
            value = caller?.claims && Object.hasOwn(caller.claims, p.claim) ? caller.claims[p.claim] : undefined;
            if (value === undefined) {
                const verified = p.claim === "email" ? " (a verified one: the token's email_verified is true)" : "";
                throw new OperationError("NOT_ALLOWED", `your sign-in has no ${p.claim} claim${verified}, which the source ${id} needs; ask the operator`);
            }
            // a claim's value goes into a backend's address: nothing that could change its path or query
            if (typeof value === "string" && /[/\\%?\r\n\0]|\.\./.test(value)) {
                throw new OperationError("NOT_ALLOWED", `your sign-in's ${p.claim} claim holds characters the source ${id} cannot take; ask the operator`);
            }
        } else {
            value = Object.hasOwn(values, p.name) && values[p.name] !== undefined && values[p.name] !== null ? values[p.name] : p.default;
        }
        if (value === undefined) {
            if (p.required) {
                const about = [p.description, p.example !== undefined ? `for example ${p.example}` : p.enum ? `one of ${p.enum.join(", ")}` : null].filter(Boolean).join(", ") || `a ${p.type}`;
                throw new OperationError("INVALID_INPUT", `the source ${id} needs params.${p.name} (${about}); ${rerunText(p)}`);
            }
            continue;
        }
        try {
            out[p.name] = valueOf(p.name, p, value);
        } catch (e) {
            if (p.claim !== undefined && e instanceof OperationError) {
                // the sign-in's value, not the caller's: never said back, and nothing the caller can fix
                throw new OperationError("NOT_ALLOWED", `your sign-in's ${p.claim} claim is not a value the source ${id} takes; ask the operator`);
            }
            // a value the caller sent: what the parameter is and takes, so the next try can fit
            throw e instanceof OperationError ? new OperationError("INVALID_INPUT", `${e.message}${hintOf(p)}`) : e;
        }
    }
    return out;
}

/** The longest pattern a refusal names. */
const HINT_PATTERN = 40;

/**
 * What a refusal of a caller's value adds about the parameter: its description, an example, a short
 * pattern ("" when it has none of them), in one parenthesis at the end of the message (MCP puts its
 * request id inside it, so no two stand in a row).
 * @param {any} p  a declaration
 */
function hintOf(p) {
    const about = [p.description, p.example !== undefined ? `for example ${p.example}` : null].filter(Boolean).join(", ");
    const pattern = typeof p.pattern === "string" && p.pattern.length <= HINT_PATTERN ? `pattern ${p.pattern}` : "";
    const parts = [about, pattern].filter(Boolean);
    return parts.length ? ` (${parts.join("; ")})` : "";
}

/**
 * How a caller gives a missing parameter, in the one form every surface uses: "re-run with
 * params.customer=acme" (the CLI and check-source say --param customer=acme), the declared example
 * where there is one.
 * @param {any} p  a declaration
 */
export const rerunText = (p) => `re-run with params.${p.name}=${p.example ?? p.enum?.[0] ?? "<value>"}`;

/**
 * One value of a parameter, checked and written again.
 * @param {string} name
 * @param {any} p  the declaration, with its compiled pattern as regex
 * @param {unknown} value
 * @returns {string | number | boolean}
 */
function valueOf(name, p, value) {
    const fail = (what) => {
        throw new OperationError("INVALID_INPUT", `params.${name} ${what}`);
    };
    let out;
    if (p.type === "boolean") {
        out = value === true || value === "true" ? true : value === false || value === "false" ? false : fail("must be true or false");
    } else if (p.type === "integer" || p.type === "number") {
        const n = typeof value === "number" ? value : typeof value === "string" && (p.type === "integer" ? /^-?\d{1,16}$/ : /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d{1,3})?$/).test(value) ? Number(value) : NaN;
        if (!Number.isFinite(n) || (p.type === "integer" && !Number.isSafeInteger(n))) {
            fail(`must be ${p.type === "integer" ? "a whole number" : "a number"}`);
        }
        if (p.minimum !== undefined && n < p.minimum) fail(`must be at least ${p.minimum}`);
        if (p.maximum !== undefined && n > p.maximum) fail(`must be at most ${p.maximum}`);
        out = n;
    } else {
        // a text as text: a number or a boolean is a caller's mistake about the type, not a value
        const text = typeof value === "string" ? value : fail("must be a text");
        // String.prototype.isWellFormed (Node 20 and later; this package needs Node 22)
        if (!(/** @type {any} */ (text).isWellFormed())) {
            fail("must be a text without lone surrogates (not well-formed Unicode)");
        }
        const max = p.maxLength ?? PARAM_LIMITS.defaultLength;
        if (text.length > max) fail(`must have at most ${max} characters`);
        if (p.minLength !== undefined && text.length < p.minLength) fail(`must have at least ${p.minLength} characters`);
        // whatever the pattern allows: never a path step up, a line break or another control character
        if (text.includes("..") || /\p{Cc}/u.test(text)) {
            fail("may not hold .. or control characters");
        }
        if (p.format === "date") {
            const day = DATE.test(text) ? new Date(`${text}T00:00:00Z`) : null;
            if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== text) fail("must be a date (YYYY-MM-DD)");
        } else if (p.regex) {
            // an operator's pattern, anchored, runs on at most PARAM_LIMITS.length characters (maxLength holds)
            const matched = matchWithin(p.regex, text);
            if (matched === null) fail("could not be checked in time; send a shorter or simpler value");
            if (!matched) fail("is not in the expected form");
        } else if (!p.enum && !SAFE_TEXT.test(text)) {
            fail('may hold letters, digits and . _ ~ - only (the operator sets a pattern for other values)');
        }
        out = text;
    }
    if (p.enum && !p.enum.includes(out)) {
        fail(`must be one of ${p.enum.join(", ")}`);
    }
    return out;
}

/**
 * What list_sources says about a source's parameters (those bound to a claim left out).
 * @param {Record<string, any> | undefined} declared
 * @returns {Array<{ name: string, type: string, required: boolean, description?: string, example?: string | number | boolean, enum?: Array<string | number>, pattern?: string, format?: string, minLength?: number, maxLength?: number, minimum?: number, maximum?: number }>}
 */
export function paramsList(declared) {
    if (!declared) {
        return [];
    }
    return entriesOf(declared)
        .filter((p) => p.claim === undefined)
        .map((p) => ({
            name: p.name,
            type: p.type,
            required: Boolean(p.required) && p.default === undefined,
            ...(p.description ? { description: p.description } : {}),
            ...(p.example !== undefined ? { example: p.example } : {}),
            ...(p.enum ? { enum: p.enum } : {}),
            ...(p.pattern !== undefined ? { pattern: p.pattern } : {}),
            ...(p.format !== undefined ? { format: p.format } : {}),
            ...Object.fromEntries(["minLength", "maxLength", "minimum", "maximum"].filter((k) => p[k] !== undefined).map((k) => [k, p[k]]))
        }));
}

/**
 * The names of the claims the sources' parameters are bound to (params.<name>.claim): the only
 * claims a verified token gives its caller (Caller.claims).
 * @param {Record<string, { params?: Record<string, any> }> | undefined} sources  options.sources
 * @returns {Set<string>}
 */
export function claimNamesOf(sources) {
    const names = new Set();
    for (const source of Object.values(sources ?? {})) {
        for (const p of Object.values(source?.params ?? {})) {
            if (p && typeof p === "object" && typeof p.claim === "string" && p.claim) {
                names.add(p.claim);
            }
        }
    }
    return names;
}

/**
 * The claims of a verified token's payload a caller holds: only the names given, only texts (well
 * formed, at most PARAM_LIMITS.length characters), finite numbers and booleans; "email" only when
 * the token's email_verified is true. Undefined when none is named or none is there.
 * @param {Record<string, unknown>} payload  a verified token's claims
 * @param {ReadonlySet<string>} names  claimNamesOf's
 * @param {{ verified?: boolean }} [how]  verified: the claims were taken by claimsOf already (the email rule applied)
 * @returns {Readonly<Record<string, string | number | boolean>> | undefined}
 */
export function claimsOf(payload, names, { verified = false } = {}) {
    if (!names.size || !payload || typeof payload !== "object") {
        return undefined;
    }
    /** @type {Record<string, string | number | boolean>} */
    const out = {};
    for (const name of names) {
        const value = Object.hasOwn(payload, name) ? payload[name] : undefined;
        if (name === "email" && !verified && payload.email_verified !== true) {
            continue;
        }
        if ((typeof value === "string" && value.length <= PARAM_LIMITS.length && /** @type {any} */ (value).isWellFormed()) || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") {
            out[name] = value;
        }
    }
    return Object.keys(out).length ? Object.freeze(out) : undefined;
}
