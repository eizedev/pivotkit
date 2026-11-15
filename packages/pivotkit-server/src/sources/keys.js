/*
 * Cache keys of loaded data. A key is canonical JSON (object keys sorted at every level) of a list,
 * never a joined string, so no value can make two different keys equal. The parts that name a
 * person or what they gave (a caller's values, groups and claims, its identity) are in a key only as
 * a keyed digest (privatePart), so a key in memory holds none of them in clear text. A caller
 * without an identity (identityKey null) gets no key: its data is never cached.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * JSON with the keys of every object sorted; functions and undefined left out.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
    return JSON.stringify(sorted(value));
}

/** A copy with sorted keys. */
function sorted(value) {
    if (Array.isArray(value)) {
        return value.map((v) => (typeof v === "function" || v === undefined ? null : sorted(v)));
    }
    if (value && typeof value === "object" && !(value instanceof Date)) {
        // no prototype: a key named __proto__ is a plain key
        /** @type {Record<string, unknown>} */
        const out = Object.create(null);
        for (const key of Object.keys(value).sort()) {
            const v = /** @type {any} */ (value)[key];
            if (typeof v !== "function" && v !== undefined) {
                out[key] = sorted(v);
            }
        }
        return out;
    }
    return value;
}

/** The key of privatePart's digests: random per process, so a digest means nothing outside it. */
const PRIVATE_KEY = randomBytes(32);

/**
 * The part of a cache key that names a person or what they gave, as a keyed digest (base64url of
 * HMAC-SHA256 over its canonical JSON): equal parts give equal digests, and a guessable value (a
 * group's or a team's name) cannot be tried against it without the process's key.
 * @param {unknown} value
 * @returns {string}
 */
export const privatePart = (value) => createHmac("sha256", PRIVATE_KEY).update(canonicalJson(value)).digest("base64url");

/**
 * A hash of a source's configuration (its functions left out), so a changed source does not reuse
 * the data of the one before.
 * @param {unknown} source
 */
export const configHashOf = (source) => createHash("sha256").update(canonicalJson(source ?? null)).digest("base64url");

/**
 * The key of a table job's data: canonical JSON of what decides the data, the caller's values and
 * identity as privatePart. Null without an identity: such data is not cached.
 * @param {{ kind: string, id: string, configHash: string, params: Record<string, unknown> | null, identity: string | null, levels: unknown, limits: unknown }} parts
 * @returns {string | null}
 */
export function tableKeyOf({ kind, id, configHash, params, identity, levels, limits }) {
    if (identity === null) {
        return null;
    }
    return canonicalJson([kind, id, configHash, privatePart([params ?? {}, identity]), levels, limits]);
}
