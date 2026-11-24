/*
 * An operation's input checked against its JSON Schema. The table wraps every `run` with it
 * (operations.js).
 */

import { OperationError } from "./errors.js";

/**
 * Checks an input against an operation's input schema, for the JSON Schema keywords the table uses
 * (type, enum, required, properties, additionalProperties: false, items, min/max length, items and
 * value, pattern, uniqueItems, maxProperties, additionalProperties as a schema). Every `run` calls it first, so a front end without a validator of its
 * own (a REST service, a script) gets INVALID_INPUT naming the place, never a TypeError.
 * @param {Record<string, unknown>} schema
 * @param {unknown} value
 * @param {string} [path]
 */
export function checkInput(schema, value, path = "input") {
    const fail = (what) => {
        throw new OperationError("INVALID_INPUT", `${path} ${what}`);
    };
    const s = /** @type {any} */ (schema);
    const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
    if (s.type !== undefined) {
        const types = Array.isArray(s.type) ? s.type : [s.type];
        const t = typeOf(value);
        if (!types.includes(t) && !(t === "integer" && types.includes("number"))) {
            fail(`must be ${types.join(" or ")}`);
        }
    }
    if (s.enum && !s.enum.includes(value)) {
        fail(`must be one of ${s.enum.join(", ")}`);
    }
    if (typeof value === "string") {
        if (s.minLength !== undefined && value.length < s.minLength) fail(`must have at least ${s.minLength} characters`);
        if (s.maxLength !== undefined && value.length > s.maxLength) fail(`must have at most ${s.maxLength} characters, not ${value.length}; shorten it`);
        if (s.pattern !== undefined && !new RegExp(s.pattern).test(value)) fail("is not in the expected form");
    }
    if (typeof value === "number") {
        if (s.minimum !== undefined && value < s.minimum) fail(`must be at least ${s.minimum}`);
        if (s.maximum !== undefined && value > s.maximum) fail(`must be at most ${s.maximum}`);
    }
    if (Array.isArray(value)) {
        if (s.minItems !== undefined && value.length < s.minItems) fail(`must have at least ${s.minItems} items`);
        if (s.maxItems !== undefined && value.length > s.maxItems) fail(`must have at most ${s.maxItems} items`);
        if (s.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) fail("must not repeat an item");
        if (s.items) value.forEach((v, i) => checkInput(s.items, v, `${path}[${i}]`));
    }
    if ((s.properties || s.additionalProperties !== undefined) && value && typeof value === "object" && !Array.isArray(value)) {
        const properties = s.properties ?? {};
        if (s.maxProperties !== undefined && Object.keys(value).length > s.maxProperties) fail(`must have at most ${s.maxProperties} keys`);
        for (const key of s.required ?? []) {
            if (!Object.hasOwn(value, key) || value[key] === undefined) fail(`needs ${key}`);
        }
        for (const [key, v] of Object.entries(value)) {
            if (Object.hasOwn(properties, key)) {
                if (v !== undefined) checkInput(properties[key], v, `${path}.${key}`);
            } else if (s.additionalProperties === false) {
                fail(`has no key ${JSON.stringify(key.slice(0, 40))}`);
            } else if (s.additionalProperties && typeof s.additionalProperties === "object") {
                checkInput(s.additionalProperties, v, `${path}[${JSON.stringify(key.slice(0, 40))}]`);
            }
        }
    }
}
