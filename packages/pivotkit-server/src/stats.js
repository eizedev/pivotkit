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
 * The longest value whose kind (LOOKS_LIKE) is looked at: a longer one keeps a field from the
 * automatic rule by its length anyway, and every test stays cheap whatever a cell holds.
 */
export const LOOKS_LENGTH = 64;

/** A value as the kind tests read it: compatibility forms folded (fullwidth digits, ligatures). */
const looksText = (v) => v.normalize("NFKC");

/**
 * What a value can look like that keeps a field from the automatic "values" level, by name. Each test
 * looks at one value of at most LOOKS_LENGTH characters (folded with NFKC); a field is flagged when
 * any of its values matches.
 * @type {Readonly<Record<string, (value: string) => boolean>>}
 */
export const LOOKS_LIKE = Object.freeze({
    // a word with "@" and a dot after it; found from "@" on, so the test is linear
    email: (v) => {
        const at = v.indexOf("@");
        return at > 0 && !/\s/u.test(v[at - 1]) && /^[^\s@]+\.[^\s@]/u.test(v.slice(at + 1));
    },
    // seven digits or more anywhere: a phone number, written with any separators or words around it
    // ("Tel 030 123 456", "+49 (30) 1234-567")
    phone: (v) => (v.match(/\p{Nd}/gu)?.length ?? 0) >= 7,
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
 * The statistics of encoded data (pivotkit-core's encode()). Two columns whose names the policy reads
 * as one (they differ only in case or whitespace) get no statistics: which of them a level or a list
 * would describe is not known, so both stay closed.
 * @param {any} data
 * @returns {SourceStats}
 */
export function sourceStats(data) {
    /** @type {Record<string, FieldStats>} */
    const fields = {};
    const shared = new Set();
    for (const field of data.schema.fields) {
        const column = data.column(field.name);
        const key = fieldKey(field.name);
        if (!column || shared.has(key)) {
            continue;
        }
        if (Object.hasOwn(fields, key)) {
            delete fields[key];
            shared.add(key);
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
            // the length first, in code points; the kinds only of values short enough to look at
            out.maxLength = texts.reduce((most, t) => Math.max(most, t.length > most ? [...t].length : 0), 0);
            const short = texts.filter((t) => t.length <= LOOKS_LENGTH).map(looksText);
            out.looks = Object.keys(LOOKS_LIKE).filter((kind) => short.some((t) => LOOKS_LIKE[kind](t)));
        }
        fields[key] = out;
    }
    return { rows: data.length, fields };
}
