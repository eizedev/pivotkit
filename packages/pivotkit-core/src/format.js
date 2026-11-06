/*
 * Named value formats. A view is JSON and cannot carry functions, so a value refers to its format by
 * name and this module turns the name into a function. A name never runs as code; unknown names fall
 * back to locale numbers.
 *
 *   number[:decimals]      1,234.5            locale grouping and decimal separator
 *   integer                1,235
 *   currency[:CODE]        €1,234.50          ISO 4217 code, default EUR
 *   percent[:decimals]     25%                value is a fraction (0.25)
 *   percent100[:decimals]  25%                value is already in percent (25)
 *   compact                1.2M               locale short form
 *   bytes                  1.5 MB             powers of 1024
 *   duration[:unit]        2 h 5 min          value in s by default; unit ms|s|min|h|d
 *   date | datetime | time                    wall-clock milliseconds (see encode.js)
 *   text                                      as it is
 */

/** @typedef {(value: unknown) => string} Formatter */

export const FORMAT_NAMES = Object.freeze([
    "number", "integer", "currency", "percent", "percent100", "compact", "bytes", "duration",
    "date", "datetime", "time", "text"
]);

const DURATION_SECONDS = { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 };
const FORMAT_PATTERN = /^(number|integer|currency|percent|percent100|compact|bytes|duration|date|datetime|time|text)(?::([A-Za-z0-9]{1,10}))?$/;

/**
 * Parses "currency:EUR" into its name and argument; null for anything that is not a known format.
 * @param {unknown} spec
 * @returns {{ name: string, arg: string | undefined } | null}
 */
export function parseFormat(spec) {
    if (typeof spec !== "string") {
        return null;
    }
    const m = FORMAT_PATTERN.exec(spec.trim().toLowerCase());
    if (!m) {
        return null;
    }
    if (m[1] === "currency" && m[2] !== undefined && !/^[a-z]{3}$/.test(m[2])) {
        return null;
    }
    if (m[1] === "duration" && m[2] !== undefined && !Object.hasOwn(DURATION_SECONDS, m[2])) {
        return null;
    }
    if (["number", "percent", "percent100"].includes(m[1]) && m[2] !== undefined && !/^\d{1,2}$/.test(m[2])) {
        return null;
    }
    return { name: m[1], arg: m[2] };
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

/**
 * "2 h 5 min": the largest unit that fits plus the next one when it is not zero.
 * @param {number} seconds
 * @param {string} [locale]
 */
export function formatDuration(seconds, locale) {
    if (!Number.isFinite(seconds)) {
        return "";
    }
    const sign = seconds < 0 ? "-" : "";
    const total = Math.abs(seconds);
    if (total < 60) {
        return `${sign}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(total)} s`;
    }
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
 * @param {string} [locale]
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
    const n = new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(value);
    return `${bytes < 0 ? "-" : ""}${n} ${units[i]}`;
}

function plain(value) {
    return value === null || value === undefined ? "" : String(value);
}

/**
 * A function value -> string for a format name and a locale. Dates are wall-clock milliseconds and
 * are therefore formatted in UTC.
 * @param {string | null | undefined} spec
 * @param {string} [locale]
 * @returns {Formatter}
 */
export function formatter(spec, locale) {
    const f = parseFormat(spec) || { name: "number", arg: undefined };
    const decimals = f.arg !== undefined && /^\d+$/.test(f.arg) ? Number(f.arg) : undefined;
    const nf = (options) => {
        const fmt = new Intl.NumberFormat(locale, options);
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
            return nf({ style: "percent", maximumFractionDigits: decimals ?? 1 });
        case "percent100": {
            const p = nf({ style: "percent", maximumFractionDigits: decimals ?? 1 });
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
            const opts = f.name === "date"
                ? { dateStyle: "medium", timeZone: "UTC" }
                : f.name === "time"
                    ? { timeStyle: "short", timeZone: "UTC" }
                    : { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" };
            const df = new Intl.DateTimeFormat(locale, opts);
            return (v) => {
                const n = toNumber(v);
                return Number.isFinite(n) ? df.format(new Date(n)) : plain(v);
            };
        }
        case "number":
        default:
            return nf(decimals === undefined
                ? { maximumFractionDigits: 2 }
                : { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
}

/**
 * The Excel number format code for a format name, so exported cells stay numbers with the same look.
 * @param {string | null | undefined} spec
 * @returns {string} "General" when there is no closer equivalent
 */
export function excelNumberFormat(spec) {
    const f = parseFormat(spec);
    if (!f) {
        return "General";
    }
    const decimals = f.arg !== undefined && /^\d+$/.test(f.arg) ? Number(f.arg) : undefined;
    const fraction = (n) => (n > 0 ? "." + "0".repeat(n) : "");
    switch (f.name) {
        case "integer":
            return "#,##0";
        case "currency":
            return `#,##0.00 "${(f.arg || "EUR").toUpperCase()}"`;
        case "percent":
            return `0${fraction(decimals ?? 1)}%`;
        case "date":
            return "yyyy-mm-dd";
        case "datetime":
            return "yyyy-mm-dd hh:mm";
        case "time":
            return "hh:mm";
        case "text":
            return "@";
        case "number":
            // "#,##0.##" would leave a trailing dot on whole numbers in Excel
            return decimals === undefined ? "General" : `#,##0${fraction(decimals)}`;
        default:
            // percent100, compact, bytes and duration have no exact Excel equivalent: plain number
            return "General";
    }
}
