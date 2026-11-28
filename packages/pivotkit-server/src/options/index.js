/*
 * The options table's fragments: the shared base and one per feature, each with the keys it adds by
 * slot (shared.js SLOTS) and its own rules (validate). config.js composes OPTION_KEYS from them, so a
 * feature adds its keys in its own file and never edits the table; a key declared twice is an error
 * when the table is composed (at import), so two features cannot both own one.
 */

import { SLOTS } from "./shared.js";
import * as base from "./base.js";
import * as inline from "./inline.js";
import * as downloads from "./downloads.js";
import * as http from "./http.js";
import * as code from "./code.js";
import * as operator from "./operator.js";
import * as upload from "./upload.js";
import * as issuer from "./issuer.js";
import * as log from "./log.js";
import * as signed from "./signed.js";
import * as external from "./external.js";
import * as views from "./views.js";
import * as records from "./records.js";
import * as branding from "./branding.js";

/**
 * @typedef {object} Fragment
 * @property {string} name
 * @property {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} KEYS
 * @property {(options: import("../config.js").ServerOptions, range: import("./shared.js").RangeProblem) => void} validate  a value out of its range goes to range (the fragments that bound a number)
 */

/** @type {ReadonlyArray<Fragment>} the fragments in the order their rules run */
export const FRAGMENTS = Object.freeze([base, issuer, inline, downloads, http, code, operator, upload, log, signed, external, records, views, branding].map((f) => Object.freeze({ name: f.NAME, KEYS: f.KEYS, validate: f.validate })));

/** A slot's key as a path in the options, for messages. */
const pathOf = (slot, key) => (slot === "top" ? key : slot === "source" ? `sources.<id>.${key}` : `${slot}.${key}`);

/**
 * The base slots with every fragment's keys added: new objects, the inputs untouched. Throws Error (a
 * programmer's mistake, found at import) for a slot that does not exist or a key a slot already has.
 * @param {Record<import("./shared.js").Slot, Record<string, any>>} baseSlots  config.js's own keys
 * @param {ReadonlyArray<Fragment>} fragments
 * @returns {Record<import("./shared.js").Slot, Record<string, any>>}
 */
export function composeSlots(baseSlots, fragments) {
    /** @type {Record<string, Record<string, any>>} */
    const slots = Object.fromEntries(SLOTS.map((slot) => [slot, { ...(baseSlots[slot] ?? {}) }]));
    /** @type {Map<string, string>} who declared each key, by its path */
    const owner = new Map(SLOTS.flatMap((slot) => Object.keys(baseSlots[slot] ?? {}).map((key) => [pathOf(slot, key), "config.js"])));
    for (const fragment of fragments) {
        const file = `options/${fragment.name}.js`;
        for (const [slot, keys] of Object.entries(fragment.KEYS)) {
            if (!SLOTS.includes(/** @type {any} */ (slot))) {
                throw new Error(`${file}: no slot "${slot}" (slots: ${SLOTS.join(", ")})`);
            }
            for (const [key, schema] of Object.entries(keys)) {
                const path = pathOf(slot, key);
                if (owner.has(path)) {
                    throw new Error(`${owner.get(path)} and ${file} both declare ${path}`);
                }
                owner.set(path, file);
                slots[slot][key] = schema;
            }
        }
    }
    return /** @type {any} */ (slots);
}
