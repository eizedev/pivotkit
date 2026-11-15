/*
 * The options of #332 (the upload target): its keys by slot (options/shared.js SLOTS) and the rules between them.
 * Empty until that work fills it; a key is declared here once, never also in config.js or another
 * fragment (options/index.js refuses a second declaration).
 */

export const NAME = "upload";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({});

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} _options
 */
export function validate(_options) {}
