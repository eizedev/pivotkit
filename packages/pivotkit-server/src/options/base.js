/*
 * The keys several features share (the foundation of 0.7.0): a source's params and its fields'
 * descriptions, how long a source's data is kept and how long a load may take (auth.subjectClaim, the
 * claim that names a person, stays in config.js's auth keys, where it was first). A feature that uses one of them never declares it again; it relaxes or adds rules
 * in its own fragment.
 *
 * ttl, maxStale and timeMs are taken by code sources only; options/code.js gives them their defaults
 * and sources/run.js their behaviour. HTTP sources take them too.
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

/** The keys of a source only a code source (load) takes. */
const CODE_ONLY = Object.freeze(["params", "ttl", "maxStale", "timeMs"]);

/** The longest description of a field, in characters. */
export const FIELD_DESCRIPTION_MAX = 500;

/**
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        for (const key of CODE_ONLY) {
            if (/** @type {any} */ (source)[key] !== undefined && !source.load) {
                throw new ConfigError(`sources.${id}.${key}: only a code source (load) takes ${key}`);
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
