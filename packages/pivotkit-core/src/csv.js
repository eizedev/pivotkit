/*
 * Export of a grid (toGrid) as CSV. The grid's locale decides the separator (";" where "," is the
 * decimal comma, as Excel does), text is quoted when needed, and text a spreadsheet would run as a
 * formula gets a leading ' (CSV injection):
 *
 * - text starting with a tab or a carriage return;
 * - text whose first visible character (after spaces, line breaks and control characters, which some
 *   spreadsheets skip) is = or @;
 * - text whose first visible character is + or -, unless the whole text is a plain number ("-5%",
 *   "-1,234.5") or a number range like the bin label "-10 – 0": those are data, and a ' would change
 *   them, while an expression like "-2+3" or "-1+cmd|..." is guarded.
 */

import { expect } from "./errors.js";
import { isGrid } from "./grid.js";
import { numberFormat } from "./intl.js";
import { DEFAULT_LOCALE, MS_PER_DAY, pad } from "./util.js";

const PLAIN_NUMBER = /^[+-]?\d[\d.,\u00a0\u202f ]*%?$/;
const NUMBER_RANGE = /^[+-]?\d[\d.,\u00a0\u202f]*\s\u2013\s[+-]?\d[\d.,\u00a0\u202f]*$/;

/**
 * The CSV separator Excel expects for a locale: ";" where the decimal mark is ",".
 * @param {string} locale
 */
export function csvSeparator(locale) {
    return decimalMark(locale) === "," ? ";" : ",";
}

function decimalMark(locale) {
    const part = numberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal");
    return part ? part.value : ".";
}

/**
 * Prefixes text a spreadsheet would run as a formula with a quote; see the rules above.
 * @param {string} text
 */
export function neutralizeFormula(text) {
    if (/^[\t\r]/.test(text)) {
        return `'${text}`;
    }
    // eslint-disable-next-line no-control-regex
    const start = text.replace(/^[\s\u0000-\u001F\u007F]+/, "");
    const formula = /^[=@]/.test(start) || (/^[+-]/.test(start) && !PLAIN_NUMBER.test(start) && !NUMBER_RANGE.test(start));
    return formula ? `'${text}` : text;
}

function isoOf(wallMs) {
    const d = new Date(wallMs);
    const date = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return wallMs % MS_PER_DAY === 0 ? date : `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * A number as a spreadsheet reads it back: 15 significant digits (what Excel keeps), the shortest
 * form ("1.5e-20" stays that, not "-0"), "-" as the minus sign and the locale's decimal mark.
 */
function plainNumber(v, mark) {
    const text = String(Number(v.toPrecision(15)));
    return mark === "." ? text : text.replace(".", mark);
}

/**
 * The grid as CSV text. Values are written as plain numbers with the locale's decimal mark, dates as
 * ISO dates; labels of merged row headers are repeated on every row so each line stands on its own.
 * @param {import("./grid.js").Grid} grid  from toGrid(); its locale decides the separator and decimal mark
 * @param {{ separator?: string, repeatLabels?: boolean }} [options]
 * @returns {string}
 */
export function toCsv(grid, options = {}) {
    expect(isGrid(grid), "toCsv(grid): grid must come from toGrid()");
    const locale = grid.locale ?? DEFAULT_LOCALE;
    const separator = options.separator ?? csvSeparator(locale);
    const repeat = options.repeatLabels !== false;
    const mark = decimalMark(locale);
    const coveredBy = new Map();
    for (const m of grid.merges) {
        for (let r = m.row; r < m.row + m.rowSpan; r++) {
            for (let c = m.col; c < m.col + m.colSpan; c++) {
                if (r !== m.row || c !== m.col) {
                    coveredBy.set(`${r},${c}`, grid.rows[m.row][m.col]);
                }
            }
        }
    }
    const quote = (text) => {
        const safe = neutralizeFormula(text);
        return /["\r\n]/.test(safe) || safe.includes(separator) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = grid.rows.map((row, r) =>
        row
            .map((cell, c) => {
                let source = cell;
                if (!source) {
                    const origin = coveredBy.get(`${r},${c}`);
                    // a row label merged down its rows is repeated on each of them; covered header cells
                    // and the empty rest of a subtotal label spanning sideways stay empty
                    source = repeat && origin && origin.kind === "rowHeader" && origin.total === 0 && (origin.colSpan ?? 1) === 1
                        ? origin
                        : null;
                }
                if (!source) {
                    return "";
                }
                if (source.kind === "value" && typeof source.value === "number" && Number.isFinite(source.value)) {
                    return source.valueType === "date" ? isoOf(source.value) : plainNumber(source.value, mark);
                }
                return quote(source.text);
            })
            .join(separator)
    );
    return lines.join("\r\n") + "\r\n";
}

/**
 * The CSV as UTF-8 bytes, with a byte order mark so Excel detects the encoding.
 * @param {import("./grid.js").Grid} grid
 * @param {{ separator?: string, repeatLabels?: boolean, bom?: boolean }} [options]
 * @returns {Uint8Array}
 */
export function toCsvBytes(grid, options = {}) {
    return new TextEncoder().encode((options.bom === false ? "" : "\uFEFF") + toCsv(grid, options));
}
