/*
 * The Excel number format code that shows a cell as the grid shows it (format.js), so exported cells
 * stay numbers with the same look. It is chosen per cell where the grid's look depends on the value
 * (up to 2 decimals, compact). Only the exports need it (xlsx.js, rows.js), so it is a file of its own:
 * a bundle that splits by file keeps it out of a page's first load.
 */

import { DATE_STYLES, parseFormat } from "./format.js";
import { dateTimeFormat, numberFormat } from "./intl.js";
import { createCache } from "./util.js";

// codes that depend on the locale only, not on the value
const codes = createCache(64);

// Excel shows these as they are; every other literal character is quoted
const quote = (text) => text.replace(/[^ :/-]+/g, (run) => `"${run.replace(/"/g, "")}"`);
const fraction = (n) => (n > 0 ? "." + "0".repeat(n) : "");

/** Decimals a value shows with "up to max decimals": 2.50 -> 1. */
export function shownDecimals(v, max) {
    if (!Number.isFinite(v) || Math.abs(v) >= 1e21) {
        return 0;
    }
    const s = Math.abs(v).toFixed(max).replace(/0+$/, "");
    const dot = s.indexOf(".");
    return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * "#,##0.00" in place of the number parts of an Intl result, the rest as quoted literals. The percent
 * sign is Excel's scaling "%", or a literal one for a value already in percent (scaledPercent false).
 */
function sectionFromParts(parts, numberCode, scaledPercent = true) {
    let out = "";
    let literal = "";
    let numberDone = false;
    for (const p of parts) {
        const isNumber = p.type === "integer" || p.type === "group" || p.type === "decimal" || p.type === "fraction";
        if (isNumber || p.type === "minusSign" || (p.type === "percentSign" && scaledPercent)) {
            out += quote(literal);
            literal = "";
            if (p.type === "minusSign") {
                out += "-";
            } else if (p.type === "percentSign") {
                out += "%";
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

/**
 * An Excel code from the parts of an Intl format: one section, or "positive;negative" when the
 * locale writes negatives other than with a leading minus (Excel's default for one section).
 */
function codeFromIntl(nf, sample, numberCode, scaledPercent = true) {
    const positive = sectionFromParts(nf.formatToParts(sample), numberCode, scaledPercent);
    const negative = sectionFromParts(nf.formatToParts(-sample), numberCode, scaledPercent);
    return negative === `-${positive}` ? positive : `${positive};${negative}`;
}

function currencyCode(code, locale) {
    const nf = numberFormat(locale, { style: "currency", currency: code });
    return codeFromIntl(nf, 1234.5, `#,##0${fraction(nf.resolvedOptions().maximumFractionDigits)}`);
}

/** Percent as the locale writes it ("25,5 %" in de-DE); scaled: the value is a fraction. */
function percentCode(decimals, locale, scaled) {
    return codeFromIntl(numberFormat(locale, { style: "percent" }), 0.5, `#,##0${fraction(decimals)}`, scaled);
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
            return percentCode(f.decimals ?? shownDecimals(value * 100, 1), locale, true);
        case "percent100":
            // the value is already in percent: a literal % sign, no scaling
            return percentCode(f.decimals ?? shownDecimals(value, 1), locale, false);
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
