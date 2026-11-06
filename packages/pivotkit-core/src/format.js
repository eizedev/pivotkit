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
 * excelNumberFormat() gives the Excel number format code that shows a cell as the grid does; it is
 * chosen per cell where the grid's look depends on the value (up to 2 decimals, compact).
 */

import { numberFormat, dateTimeFormat } from "./intl.js";
import { createCache, resolveLocale } from "./util.js";

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
/** @type {Record<string, Intl.DateTimeFormatOptions>} */
const DATE_STYLES = {
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
    const nf = (options) => {
        const fmt = numberFormat(locale, { ...SIGN, ...options });
        return (v) => {
            const n = toNumber(v);
            return Number.isNaN(n) ? plain(v) : fmt.format(n);
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
        case "percent100": {
            const p = nf({ style: "percent", ...fractionDigits(f.decimals, 1) });
            return (v) => p(toNumber(v) / 100);
        }
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
            const df = dateTimeFormat(locale, DATE_STYLES[f.name]);
            return (v) => {
                const n = toNumber(v);
                return Number.isFinite(n) ? df.format(new Date(n)) : plain(v);
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
export function formatter(spec, options = {}) {
    return formatterFor(spec, resolveLocale(null, options.locale));
}

// ---- Excel number formats ----

// codes that depend on the locale only, not on the value
const codes = createCache(64);

// Excel shows these as they are; every other literal character is quoted
const quote = (text) => text.replace(/[^ :/-]+/g, (run) => `"${run.replace(/"/g, "")}"`);
const fraction = (n) => (n > 0 ? "." + "0".repeat(n) : "");

/** Decimals a value shows with "up to max decimals": 2.50 -> 1. */
function shownDecimals(v, max) {
    if (!Number.isFinite(v) || Math.abs(v) >= 1e21) {
        return 0;
    }
    const s = Math.abs(v).toFixed(max).replace(/0+$/, "");
    const dot = s.indexOf(".");
    return dot === -1 ? 0 : s.length - dot - 1;
}

/** "#,##0.00" in place of the number parts of an Intl result, the rest as quoted literals. */
function sectionFromParts(parts, numberCode) {
    let out = "";
    let literal = "";
    let numberDone = false;
    for (const p of parts) {
        const isNumber = p.type === "integer" || p.type === "group" || p.type === "decimal" || p.type === "fraction";
        if (isNumber || p.type === "minusSign") {
            out += quote(literal);
            literal = "";
            if (p.type === "minusSign") {
                out += "-";
            } else if (!numberDone) {
                out += numberCode;
                numberDone = true;
            }
        } else {
            literal += p.value;
        }
    }
    return out + quote(literal);
}

function currencyCode(code, locale) {
    const nf = numberFormat(locale, { style: "currency", currency: code });
    const digits = nf.resolvedOptions().maximumFractionDigits;
    const number = `#,##0${fraction(digits)}`;
    return `${sectionFromParts(nf.formatToParts(1234.5), number)};${sectionFromParts(nf.formatToParts(-1234.5), number)}`;
}

function compactCode(v, locale) {
    if (!Number.isFinite(v) || v === 0) {
        return "#,##0";
    }
    const parts = numberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).formatToParts(Math.abs(v));
    const integer = parts.filter((p) => p.type === "integer").map((p) => p.value).join("");
    const decimals = parts.filter((p) => p.type === "fraction").map((p) => p.value).join("");
    const shown = Number(`${integer}.${decimals || 0}`);
    const exponent = shown > 0 ? Math.round(Math.log10(Math.abs(v) / shown)) : 0;
    if (exponent < 0 || exponent % 3 !== 0) {
        // a compact form in steps other than thousands (10,000 in Japanese): no Excel equivalent
        return "General";
    }
    const firstNumber = parts.findIndex((p) => p.type === "integer");
    const suffix = parts.slice(firstNumber).filter((p) => p.type === "compact" || p.type === "literal").map((p) => p.value).join("");
    return `#,##0${fraction(decimals.length)}${",".repeat(exponent / 3)}${quote(suffix)}`;
}

/** An Excel date code from the parts of the grid's Intl date format: "mmm d, yyyy" for en-US. */
function dateCode(kind, locale) {
    // 5 January 2026 03:04 shows whether day, month and hour are padded
    // (Excel reads "h" as 24-hour unless AM/PM is in the code, as Intl does)
    const parts = dateTimeFormat(locale, DATE_STYLES[kind]).formatToParts(new Date(Date.UTC(2026, 0, 5, 3, 4)));
    return parts
        .map((p) => {
            switch (p.type) {
                case "year":
                    return p.value.length === 2 ? "yy" : "yyyy";
                case "month":
                    return /^\d+$/.test(p.value) ? (p.value.length === 2 ? "mm" : "m") : "mmm";
                case "day":
                    return p.value.length === 2 ? "dd" : "d";
                case "hour":
                    return p.value.length === 2 ? "hh" : "h";
                case "minute":
                    return "mm";
                case "second":
                    return "ss";
                case "dayPeriod":
                    return "AM/PM";
                case "weekday":
                    return "ddd";
                default:
                    return quote(p.value);
            }
        })
        .join("");
}

/**
 * The Excel number format code that shows a cell as the grid shows it, so exported cells stay
 * numbers with the same look. Gaps: bytes and duration have no Excel equivalent (Excel cannot divide
 * by 1024 or turn seconds into "2 h 5 min" in a format) and are written as plain numbers ("General").
 * @param {string | null | undefined} spec  the format name of the value
 * @param {number} value  the cell's value; formats like "number" choose their decimals per value
 * @param {string} locale  the grid's locale
 * @returns {string}
 */
export function excelNumberFormat(spec, value, locale) {
    const f = parseFormat(spec) || { name: "number", arg: undefined, decimals: undefined };
    switch (f.name) {
        case "integer":
            return "#,##0";
        case "number":
            return `#,##0${fraction(f.decimals ?? shownDecimals(value, 2))}`;
        case "percent":
            return `#,##0${fraction(f.decimals ?? shownDecimals(value * 100, 1))}%`;
        case "percent100":
            // the value is already in percent: a literal % sign, no scaling
            return `#,##0${fraction(f.decimals ?? shownDecimals(value, 1))}"%"`;
        case "currency":
            return codes.getOrSet(`${spec}|${locale}`, () => currencyCode((f.arg || "EUR").toUpperCase(), locale));
        case "compact":
            return compactCode(value, locale);
        case "date":
        case "datetime":
        case "time":
            return codes.getOrSet(`${f.name}|${locale}`, () => dateCode(f.name, locale));
        case "text":
            return "@";
        default:
            return "General";
    }
}
