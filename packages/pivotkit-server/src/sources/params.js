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
 */

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
                return { name, ...p, regex: typeof p.pattern === "string" ? new RegExp(p.pattern, "u") : null };
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
        if (p.claim !== undefined && (typeof p.claim !== "string" || !p.claim)) fail("claim must be a claim's name");
        if (p.format !== undefined && !(text && p.format === "date")) fail('format is "date", for a string parameter');
        if (p.pattern !== undefined) {
            if (!text || typeof p.pattern !== "string") {
                fail("pattern is a regular expression, for a string parameter");
            } else {
                try {
                    new RegExp(p.pattern, "u");
                } catch {
                    fail("pattern is not a valid regular expression");
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
                valueOf(name, { ...p, regex: p.pattern ? new RegExp(p.pattern, "u") : null, enum: key.startsWith("enum") ? [value] : p.enum }, value);
            } catch (e) {
                fail(`${key}: ${String(e.message).replace(/^params\.\w+ /, "")}`);
            }
        }
        if (p.claim !== undefined && (p.default !== undefined || p.required === false)) {
            fail("a parameter bound to a claim takes neither a default nor required: false (without the claim the source is refused)");
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
                throw new OperationError("NOT_ALLOWED", `your sign-in has no ${p.claim} claim, which the source ${id} needs; ask the operator`);
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
                throw new OperationError("INVALID_INPUT", `the source ${id} needs params.${p.name} (${p.type})${p.description ? `: ${p.description}` : ""}${p.enum ? `, one of ${p.enum.join(", ")}` : p.example !== undefined ? `, for example ${p.example}` : ""}`);
            }
            continue;
        }
        out[p.name] = valueOf(p.name, p, value);
    }
    return out;
}

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
        const text = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "boolean" ? String(value) : fail("must be a text");
        const max = p.maxLength ?? PARAM_LIMITS.defaultLength;
        if (text.length > max) fail(`must have at most ${max} characters`);
        if (p.minLength !== undefined && text.length < p.minLength) fail(`must have at least ${p.minLength} characters`);
        if (p.format === "date") {
            const day = DATE.test(text) ? new Date(`${text}T00:00:00Z`) : null;
            if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== text) fail("must be a date (YYYY-MM-DD)");
        } else if (p.regex) {
            // an operator's pattern runs on at most PARAM_LIMITS.length characters (maxLength holds)
            p.regex.lastIndex = 0;
            if (!p.regex.test(text)) fail("is not in the form the source takes");
        } else if (!p.enum && (!SAFE_TEXT.test(text) || text.includes(".."))) {
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
 * @returns {Array<{ name: string, type: string, required: boolean, description?: string, example?: string | number | boolean, enum?: Array<string | number> }>}
 */
export function paramsList(declared) {
    if (!declared) {
        return [];
    }
    return entriesOf(declared)
        .filter((p) => p.claim === undefined)
        .map((p) => ({ name: p.name, type: p.type, required: Boolean(p.required) && p.default === undefined, ...(p.description ? { description: p.description } : {}), ...(p.example !== undefined ? { example: p.example } : {}), ...(p.enum ? { enum: p.enum } : {}) }));
}
