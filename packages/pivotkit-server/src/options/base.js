/*
 * The keys several features share (the foundation of 0.7.0): a source's params and its fields'
 * descriptions, how long a source's data is kept and how long a load may take (auth.subjectClaim, the
 * claim that names a person, stays in config.js's auth keys, where it was first). A feature that uses one of them never declares it again; it relaxes or adds rules
 * in its own fragment.
 *
 * params, ttl, maxStale and timeMs are taken by code and HTTP sources (load, http); options/code.js
 * and options/http.js give them their defaults, sources/run.js their behaviour.
 */

import { declaredProblems } from "../sources/params.js";
import { ConfigError } from "./shared.js";

export const NAME = "base";

export const KEYS = Object.freeze({
    source: {
        params: { custom: declaredProblems },
        fields: { map: { object: { description: "string" } } },
        ttl: "integer",
        maxStale: "integer",
        timeMs: "integer"
    }
});

/** The keys of a source only a code source (load) or an HTTP source (http) takes. */
const LOADED_ONLY = Object.freeze(["params", "ttl", "maxStale", "timeMs"]);

/** The longest description of a field, in characters. */
export const FIELD_DESCRIPTION_MAX = 500;

/**
 * The one placeholder a generated block leaves for the operator to fill in (pivotkit-server
 * source-from-openapi): a value under httpSources or a source's http that starts with it is refused.
 */
export const TODO_MARK = "TODO";

/** A value that is still the placeholder. */
const STILL_TODO = new RegExp(`^${TODO_MARK}\\b`);

/**
 * The paths of the values under httpSources and each source's http that still say TODO, in order.
 * Other keys (a source's title or description) may say TODO as ordinary text.
 * @param {Record<string, any>} options
 * @returns {string[]}
 */
export function todoPaths(options) {
    /** @type {string[]} */
    const found = [];
    const walk = (value, path) => {
        if (typeof value === "string") {
            if (STILL_TODO.test(value)) found.push(path);
        } else if (value !== null && typeof value === "object") {
            for (const [key, inner] of Object.entries(value)) walk(inner, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`);
        }
    };
    walk(options.httpSources, "httpSources");
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        walk(source?.http, `sources.${id}.http`);
    }
    return found;
}

/**
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    // a generated block's placeholders, before any rule that would name them only as a wrong address
    const todos = todoPaths(options);
    if (todos.length) {
        throw new ConfigError(`${todos.length} ${todos.length === 1 ? "value still says" : "values still say"} ${TODO_MARK}: ${todos.slice(0, 10).join(", ")}${todos.length > 10 ? `, and ${todos.length - 10} more` : ""}; replace each with the real value`);
    }
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        for (const key of LOADED_ONLY) {
            if (/** @type {any} */ (source)[key] !== undefined && !source.load && !(/** @type {any} */ (source).http)) {
                throw new ConfigError(`sources.${id}.${key}: only a code source (load) takes ${key}, or an HTTP source (http)`);
            }
        }
        if (source.timeMs !== undefined && source.timeMs < 1) {
            throw new ConfigError(`sources.${id}.timeMs: must be 1 or more`);
        }
        for (const [name, field] of Object.entries(source.fields ?? {})) {
            if ((field.description?.length ?? 0) > FIELD_DESCRIPTION_MAX) {
                throw new ConfigError(`sources.${id}.fields.${name.slice(0, 60)}.description: at most ${FIELD_DESCRIPTION_MAX} characters`);
            }
        }
    }
}
