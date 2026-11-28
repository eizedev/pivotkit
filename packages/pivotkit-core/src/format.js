/*
 * Named value formats. A view is JSON and cannot carry functions, so a value refers to its format by
 * name and this module turns the name into a function. A name never runs as code.
 *
 *   number[:decimals]      1,234.5            default: up to 2 decimals; with decimals: exactly that many
 *   integer                1,235
 *   currency[:CODE]        €1,234.50          ISO 4217 code, default EUR
 *   percent[:decimals]     25%                value is a fraction (0.25); default up to 1 decimal
 *   percent100[:decimals]  25%                value is already in percent (25)
 *   compact                1.2M               locale short form
 *   bytes                  1.5 MB             powers of 1024
 *   duration[:unit]        2 h 5 min          value in s by default; unit ms|s|min|h|d
 *   date | datetime | time                    wall-clock milliseconds (see time.js)
 *   text                                      as it is
 *
 * The Excel number format code of each format is in excel-format.js.
 */

import { numberFormat, dateFormatter } from "./intl.js";
import { resolveLocale, optionsOf } from "./util.js";

/** @typedef {(value: unknown) => string} Formatter */

export const FORMAT_NAMES = Object.freeze([
    "number", "integer", "currency", "percent", "percent100", "compact", "bytes", "duration",
    "date", "datetime", "time", "text"
]);

/** Decimals a format can ask for; Intl allows more, but nobody reads 21 decimals. */
export const MAX_DECIMALS = 20;

const DURATION_SECONDS = { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 };
const FORMAT_PATTERN = /^(number|integer|currency|percent|percent100|compact|bytes|duration|date|datetime|time|text)(?::([A-Za-z0-9]{1,10}))?$/;
const WITH_DECIMALS = new Set(["number", "percent", "percent100"]);
/**
 * The Intl options of the date formats: the grid's, and their Excel codes' (excel-format.js).
 * @type {Record<string, Intl.DateTimeFormatOptions>}
 */
export const DATE_STYLES = {
    date: { dateStyle: "medium", timeZone: "UTC" },
    datetime: { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" },
    time: { timeStyle: "short", timeZone: "UTC" }
};
// shown without a minus for -0 and for values that round to zero
/** @type {Intl.NumberFormatOptions} */
const SIGN = { signDisplay: "negative" };

let currencies = null;
function isCurrency(code) {
    if (currencies === null) {
        currencies = typeof Intl.supportedValuesOf === "function" ? new Set(Intl.supportedValuesOf("currency")) : false;
    }
    return currencies ? currencies.has(code.toUpperCase()) : /^[a-z]{3}$/i.test(code);
}

/**
 * Parses "currency:EUR" into its name and argument; null for anything that is not a known format.
 * @param {unknown} spec
 * @returns {{ name: string, arg: string | undefined, decimals: number | undefined } | null}
 */
export function parseFormat(spec) {
    if (typeof spec !== "string") {
        return null;
    }
    const m = FORMAT_PATTERN.exec(spec.trim().toLowerCase());
    if (!m) {
        return null;
    }
    const [, name, arg] = m;
    if (arg !== undefined) {
        if (name === "currency" && !isCurrency(arg)) {
            return null;
        }
        if (name === "duration" && !Object.hasOwn(DURATION_SECONDS, arg)) {
            return null;
        }
        if (WITH_DECIMALS.has(name) && !(/^\d{1,2}$/.test(arg) && Number(arg) <= MAX_DECIMALS)) {
            return null;
        }
        if (!["currency", "duration", ...WITH_DECIMALS].includes(name)) {
            return null;
        }
    }
    return { name, arg, decimals: WITH_DECIMALS.has(name) && arg !== undefined ? Number(arg) : undefined };
}

/**
 * The decimals a format shows at most, in the unit it shows (percent: of the percentage), for writing
 * a number as the table shows it; null for a format whose text is not a plain rounded number
 * (compact, bytes, duration, dates, text).
 * @param {string | null | undefined} spec
 * @param {string} locale  for a currency's own decimals
 * @returns {number | null}
 */
export function formatDecimals(spec, locale) {
    const f = parseFormat(spec) || { name: "number", arg: undefined, decimals: undefined };
    switch (f.name) {
        case "integer":
            return 0;
        case "number":
            return f.decimals ?? 2;
        case "percent":
        case "percent100":
            return f.decimals ?? 1;
        case "currency":
            return numberFormat(locale, { style: "currency", currency: (f.arg || "EUR").toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
        default:
            return null;
    }
}

/** True when the string is a format name this module knows. */
export function isFormat(spec) {
    return parseFormat(spec) !== null;
}

function toNumber(value) {
    if (value === null || value === undefined || value === "") {
        return NaN;
    }
    return typeof value === "number" ? value : Number(value);
}

/** Intl options for "up to max decimals" or "exactly decimals". */
const fractionDigits = (decimals, max) =>
    decimals === undefined ? { maximumFractionDigits: max } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };

/**
 * "2 h 5 min": the largest unit that fits plus the next one when it is not zero.
 * @param {number} seconds
 * @param {string} locale
 */
export function formatDuration(seconds, locale) {
    if (!Number.isFinite(seconds)) {
        return "";
    }
    const sign = seconds <= -0.05 ? "-" : "";
    const total = Math.abs(seconds);
    if (total < 60) {
        return `${sign}${numberFormat(locale, { maximumFractionDigits: 1 }).format(total)} s`;
    }
    /** @type {Array<[string, number]>} */
    const units = [["d", 86400], ["h", 3600], ["min", 60], ["s", 1]];
    const first = units.findIndex(([, size]) => total >= size);
    const [bigLabel, bigSize] = units[first];
    const big = Math.floor(total / bigSize);
    const parts = [`${big} ${bigLabel}`];
    const next = units[first + 1];
    if (next) {
        const small = Math.floor((total - big * bigSize) / next[1]);
        if (small > 0) {
            parts.push(`${small} ${next[0]}`);
        }
    }
    return sign + parts.join(" ");
}

/**
 * @param {number} bytes
 * @param {string} locale
 */
export function formatBytes(bytes, locale) {
    if (!Number.isFinite(bytes)) {
        return "";
    }
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let value = Math.abs(bytes);
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    const text = numberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(value);
    return `${bytes < 0 && /[1-9]/.test(text) ? "-" : ""}${text} ${units[i]}`;
}

function plain(value) {
    return value === null || value === undefined ? "" : String(value);
}

/**
 * A function value -> string for a format name and a resolved locale. Internal: the grid and the
 * chart pass the locale they resolved.
 * @param {string | null | undefined} spec
 * @param {string} locale
 * @returns {Formatter}
 */
export function formatterFor(spec, locale) {
    const f = parseFormat(spec) || { name: "number", arg: undefined, decimals: undefined };
    // `per`: the value's unit in what Intl formats (percent100's 25 is 0.25)
    const nf = (options, per = 1) => {
        const fmt = numberFormat(locale, { ...SIGN, ...options });
        return (v) => {
            const n = toNumber(v);
            return Number.isNaN(n) ? plain(v) : fmt.format(n / per);
        };
    };
    switch (f.name) {
        case "text":
            return plain;
        case "integer":
            return nf({ maximumFractionDigits: 0 });
        case "currency":
            return nf({ style: "currency", currency: (f.arg || "EUR").toUpperCase() });
        case "percent":
            return nf({ style: "percent", ...fractionDigits(f.decimals, 1) });
        case "percent100":
            return nf({ style: "percent", ...fractionDigits(f.decimals, 1) }, 100);
        case "compact":
            return nf({ notation: "compact", maximumFractionDigits: 1 });
        case "bytes":
            return (v) => formatBytes(toNumber(v), locale);
        case "duration": {
            const factor = DURATION_SECONDS[f.arg || "s"];
            return (v) => formatDuration(toNumber(v) * factor, locale);
        }
        case "date":
        case "datetime":
        case "time": {
            const df = dateFormatter(locale, DATE_STYLES[f.name]);
            return (v) => {
                const n = toNumber(v);
                return Number.isFinite(n) ? df(new Date(n)) : plain(v);
            };
        }
        case "number":
        default:
            return nf(fractionDigits(f.decimals, 2));
    }
}

/**
 * A function value -> string for a format name.
 * @param {string | null | undefined} spec  a format name; an unknown one formats as "number"
 * @param {{ locale?: string }} [options]  default "en-US"
 * @returns {Formatter}
 */
export function formatter(spec, options) {
    options = optionsOf(options, "formatter");
    return formatterFor(spec, resolveLocale(null, options.locale));
}
