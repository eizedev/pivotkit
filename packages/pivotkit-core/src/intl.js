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

// A year before 1 AD in the Gregorian calendar, with its era: "2 BC", "2 v. Chr.", "紀元前2年".
const ERA_YEAR = { year: "numeric", era: "short", calendar: "gregory", timeZone: "UTC" };

/**
 * A year of a date grouping (a Gregorian year, also for a locale of another calendar): from 1 AD as
 * the number ("2026"), before it with its era ("2 BC", "2 v. Chr."), the one convention of every date
 * label for years before 1 AD. Without the era Intl writes 2 BC as "2", the same as 2 AD.
 * @param {number} year  astronomical: 0 is 1 BC, -1 is 2 BC
 * @param {string} locale
 */
export function yearText(year, locale) {
    if (year >= 1) {
        return String(year);
    }
    // midsummer: 1 January of the first year a Date holds is before its first day
    const date = new Date(0);
    date.setUTCFullYear(year, 6, 1);
    return dateTimeFormat(locale, /** @type {Intl.DateTimeFormatOptions} */ (ERA_YEAR)).format(date);
}

/**
 * A function that writes a date as `options` say (with timeZone "UTC": the wall clock). A Gregorian
 * date before 1 AD gets its era next to the year, where and how the locale writes it ("Jan 11, 2 BC",
 * "11.01.2 v. Chr."), since `dateStyle` cannot be combined with Intl's own `era` option; a calendar
 * that writes an era of its own keeps its form.
 * @param {string} locale
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {(date: Date) => string}
 */
export function dateFormatter(locale, options) {
    const df = dateTimeFormat(locale, options);
    const gregorian = df.resolvedOptions().calendar === "gregory";
    return (date) => {
        if (!gregorian || !(date.getUTCFullYear() < 1)) {
            return df.format(date);
        }
        const parts = df.formatToParts(date);
        if (parts.some((p) => p.type === "era") || !parts.some((p) => p.type === "year")) {
            return df.format(date);
        }
        // the year with its era and what the locale writes between them ("2", " ", "BC"), in its order
        const era = dateTimeFormat(locale, /** @type {Intl.DateTimeFormatOptions} */ (ERA_YEAR)).formatToParts(date);
        const [y, e] = [era.findIndex((p) => p.type === "year"), era.findIndex((p) => p.type === "era")];
        const withEra = era
            .slice(Math.min(y, e), Math.max(y, e) + 1)
            .map((p) => p.value)
            .join("");
        return parts.map((p) => (p.type === "year" ? withEra : p.value)).join("");
    };
}

/**
 * Natural order: "Item 2" before "Item 10", case and accents ignored, as Excel sorts labels.
 * @param {string} locale
 * @returns {Intl.Collator}
 */
export function collator(locale) {
    return cache.getOrSet(`c|${locale}`, () => new Intl.Collator(locale, { numeric: true, sensitivity: "base" }));
}
