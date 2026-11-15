/*
 * The statistics of a source's data that the exposure policy decides the "values" level by: per field
 * its type and distinct count, and for a text field with few distinct values the fewest rows a value
 * has, the longest value's length and which kinds of personal or technical data a value looks like.
 * Numbers and the names of those kinds only, never a value: the data layer (data.js, in a worker or
 * for a code source) computes them when it reads the data and keeps them with it under the file's
 * key; the main thread's policy (policy.js withStats) reads only these.
 */

import { fieldKey } from "./policy.js";

/**
 * The most distinct values of a text field whose rows per value, length and kinds are counted: the
 * most a "values" list may hold (config.js caps policy.valuesMax at it). A field with more gets its
 * distinct count only, which keeps it from "values".
 */
export const STATS_DISTINCT = 1000;

/**
 * What a value can look like that keeps a field from the automatic "values" level, by name. Each test
 * looks at one value; a field is flagged when any of its values matches.
 * @type {Readonly<Record<string, (value: string) => boolean>>}
 */
export const LOOKS_LIKE = Object.freeze({
    email: (v) => /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(v),
    // digits with the separators a number is written with, seven digits or more ("+49 30 1234567",
    // "(030) 123-4567")
    phone: (v) => /^\+?[\d\s()./-]+$/u.test(v.trim()) && (v.match(/\d/gu)?.length ?? 0) >= 7,
    url: (v) => /\b(?:https?|ftp):\/\/|\bwww\.\S/iu.test(v),
    iban: (v) => /[A-Z]{2}\d{2}[A-Z0-9]{11,30}/iu.test(v.replace(/\s+/gu, "")),
    ip: (v) => /\b\d{1,3}(?:\.\d{1,3}){3}\b/u.test(v) || /\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b/iu.test(v),
    digits: (v) => /\d{6,}/u.test(v)
});

/**
 * @typedef {object} FieldStats
 * @property {string} type  the field's type ("string", "number", "date", ...)
 * @property {number} distinct  distinct values, blanks not counted
 * @property {number} [minRows]  text fields up to STATS_DISTINCT values: the fewest rows a value has
 * @property {number} [maxLength]  text fields up to STATS_DISTINCT values: the longest value's characters
 * @property {string[]} [looks]  text fields up to STATS_DISTINCT values: the kinds of LOOKS_LIKE a value matches
 */

/**
 * @typedef {object} SourceStats
 * @property {number} rows
 * @property {Record<string, FieldStats>} fields  by the policy's key of the field's name (fieldKey)
 */

/**
 * The statistics of encoded data (pivotkit-core's encode()).
 * @param {any} data
 * @returns {SourceStats}
 */
export function sourceStats(data) {
    /** @type {Record<string, FieldStats>} */
    const fields = {};
    for (const field of data.schema.fields) {
        const column = data.column(field.name);
        if (!column) {
            continue;
        }
        /** @type {FieldStats} */
        const out = { type: column.type, distinct: column.dict.length };
        if (column.type === "string" && column.dict.length <= STATS_DISTINCT) {
            const counts = new Uint32Array(column.dict.length);
            for (let i = 0; i < column.codes.length; i++) {
                if (column.codes[i] >= 0) {
                    counts[column.codes[i]]++;
                }
            }
            const texts = column.dict.map(String);
            out.minRows = texts.length ? Math.min(...counts) : 0;
            out.maxLength = texts.reduce((most, t) => Math.max(most, [...t].length), 0);
            out.looks = Object.keys(LOOKS_LIKE).filter((kind) => texts.some((t) => LOOKS_LIKE[kind](t)));
        }
        fields[fieldKey(field.name)] = out;
    }
    return { rows: data.length, fields };
}
