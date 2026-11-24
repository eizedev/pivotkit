/*
 * The options of the log (log.js): `log` is a level alone (the short form, "debug") or an object of
 * its level, its format and whether lines name addresses.
 *
 *   "log": "debug"
 *   "log": { "level": "warn", "format": "json", "address": "off" }
 *
 * The flags --log, --log-format and --log-address and the variables PIVOTKIT_LOG_LEVEL,
 * PIVOTKIT_LOG_FORMAT and PIVOTKIT_LOG_ADDRESS set the same (flags.js: a flag wins, then the file,
 * then the environment).
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses a
 * second declaration).
 */

import { LOG_ADDRESS, LOG_FORMATS, LOG_LEVELS } from "../log.js";

export const NAME = "log";

/** The schema of `log`: a level, or the object. */
const LOG = Object.freeze({ or: [{ enum: LOG_LEVELS }, { object: { level: { enum: LOG_LEVELS }, format: { enum: LOG_FORMATS }, address: { enum: LOG_ADDRESS } } }] });

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({ top: { log: LOG } });

/** The schema says it all. */
export function validate() {}
