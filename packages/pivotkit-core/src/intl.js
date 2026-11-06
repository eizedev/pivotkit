/*
 * Intl formatters are expensive to create, so they are cached here, in one bounded cache for the
 * whole package (least recently used go first). Not part of the public API.
 */

import { createCache } from "./util.js";

const cache = createCache(128);

/**
 * @param {string} locale
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {Intl.NumberFormat}
 */
export function numberFormat(locale, options = {}) {
    return cache.getOrSet(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(locale, options));
}

/**
 * @param {string} locale
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {Intl.DateTimeFormat}
 */
export function dateTimeFormat(locale, options) {
    return cache.getOrSet(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, options));
}

/**
 * Natural order: "Item 2" before "Item 10", case and accents ignored, as Excel sorts labels.
 * @param {string} locale
 * @returns {Intl.Collator}
 */
export function collator(locale) {
    return cache.getOrSet(`c|${locale}`, () => new Intl.Collator(locale, { numeric: true, sensitivity: "base" }));
}
