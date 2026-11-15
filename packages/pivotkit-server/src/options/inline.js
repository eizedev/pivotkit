/*
 * The options of data sent in a request.
 *
 * The keys this feature adds, by slot (options/shared.js SLOTS), and the rules between them. Empty
 * until the feature fills it. A key is declared here once, never also in config.js or another
 * fragment (options/index.js refuses a second declaration).
 */

export const NAME = "inline";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({});

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} _options
 */
export function validate(_options) {}
