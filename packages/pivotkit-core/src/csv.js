/*
 * Export of a grid (toGrid) as CSV. The grid's locale decides the separator (";" where "," is the
 * decimal comma, as Excel does), text is quoted when needed, and text a spreadsheet would run as a
 * formula gets a leading ' (CSV injection):
 *
 * - text starting with a tab or a carriage return;
 * - text whose first visible character (after spaces, line breaks and control characters, which some
 *   spreadsheets skip) is = or @;
 * - text whose first visible character is + or -, unless the whole text is a number as a locale
 *   writes it ("-5%", "-1,234.5", "-1.234,5", "-1'234.5" and "-1’234.5" in de-CH, "-5,3 %", "-€1.50",
 *   "-1 234,50 €") or a number range like the bin label "-10 – 0": those are data, and a ' would change
 *   them (a spreadsheet would read text instead of a number), while an expression like "-2+3",
 *   "-$A$1" or "-1+cmd|..." is guarded. A number with the real minus sign U+2212 (sv-SE) starts with
 *   no formula character and is never prefixed.
 */

import { expect } from "./errors.js";
import { formatDecimals, parseFormat } from "./format.js";
import { isGrid } from "./grid.js";
import { numberFormat } from "./intl.js";
import { DEFAULT_LOCALE, MS_PER_DAY, pad, optionsOf } from "./util.js";

// a number as a locale writes it: a sign, a currency symbol before or after, digits with the group
// separators of the locales (. , ' ’ and the spaces), a percent sign after an optional space
const NUMBER = String.raw`[+\-\u2212]?\p{Sc}?\d[\d.,'\u2019\u00a0\u202f ]*(?:[\u00a0\u202f ]?(?:%|\p{Sc}))?`;
const PLAIN_NUMBER = new RegExp(`^${NUMBER}$`, "u");
// the characters that change the direction of text, left out of every exported text as the import
// leaves them out (import-table.js): "invoice\u202Etxt.exe" would read as another name, and one before
// "=" would hide a formula from neutralizeFormula
const BIDI_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Text of a cell as an export writes it: bidi controls left out, a formula guarded. */
const exportText = (text) => neutralizeFormula(text.replace(BIDI_CONTROLS, ""));
const NUMBER_RANGE = new RegExp(`^${NUMBER}\\s\u2013\\s${NUMBER}$`, "u");

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

/** `v` rounded to `decimals` as Intl rounds it (half away from zero, on the exact value of the double). */
function rounded(v, decimals) {
    const r = Math.sign(v) * Number(Math.abs(v).toFixed(decimals));
    return r === 0 ? 0 : r;
}

/**
 * A value cell's number. A percent and a "show values as" value are written as the table shows them:
 * rounded to the format's decimals, a percent in percent with a "%" ("-2.6%", which spreadsheets read
 * back as the fraction); the XLSX export keeps their full precision. Any other number is plain, with
 * full precision.
 * @param {number} v
 * @param {string | undefined} format  the cell's format
 * @param {string} mark  decimal mark
 * @param {boolean} showAs  the value is a "show values as" calculation
 * @param {string} locale
 */
function numberText(v, format, mark, showAs, locale) {
    const name = parseFormat(format)?.name;
    const percent = name === "percent" || name === "percent100";
    const decimals = showAs || percent ? formatDecimals(format, locale) : null;
    const shown = name === "percent" ? v * 100 : v;
    const text = plainNumber(decimals === null ? shown : rounded(shown, decimals), mark);
    return percent ? `${text}%` : text;
}

/**
 * The cells of the grid with merges filled in, row by row: a row label merged down its rows is
 * repeated on each of them when `repeat` is true; covered header cells and the empty rest of a subtotal
 * label spanning sideways stay null. Shared by the text exports (CSV, TSV, JSON).
 * @param {import("./grid.js").Grid} grid
 * @param {boolean} repeat
 * @returns {Array<Array<import("./grid.js").GridCell | null>>}
 */
export function filledCells(grid, repeat) {
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
    return grid.rows.map((row, r) =>
        row.map((cell, c) => {
            if (cell) {
                return cell;
            }
            const origin = coveredBy.get(`${r},${c}`);
            return repeat && origin && origin.kind === "rowHeader" && origin.total === 0 && (origin.colSpan ?? 1) === 1 ? origin : null;
        })
    );
}

/**
 * A value cell with a finite number (a date as wall-clock milliseconds).
 * @param {import("./grid.js").GridCell} cell
 * @returns {cell is import("./grid.js").GridCell & { value: number }}
 */
export const isNumberCell = (cell) => cell.kind === "value" && typeof cell.value === "number" && Number.isFinite(cell.value);

/**
 * The grid as CSV text. Values are written as plain numbers with the locale's decimal mark, dates as
 * ISO dates; a percent and a "show values as" value as the table shows them (rounded, a percent in
 * percent with "%"), every other number with full precision; labels of merged row headers are
 * repeated on every row so each line stands on its own.
 * @param {import("./grid.js").Grid} grid  from toGrid(); its locale decides the separator and decimal mark
 * @param {{ separator?: string, repeatLabels?: boolean }} [options]
 * @returns {string}
 */
export function toCsv(grid, options) {
    options = optionsOf(options, "toCsv");
    expect(isGrid(grid), "toCsv(grid): grid must come from toGrid()");
    return csvText(grid, options);
}

/** toCsv without the checks, for a grid this package built (the rows export). */
export function csvText(grid, options) {
    const locale = grid.locale ?? DEFAULT_LOCALE;
    const separator = options.separator ?? csvSeparator(locale);
    const mark = decimalMark(locale);
    const quote = (text) => {
        const safe = exportText(text);
        return /["\r\n]/.test(safe) || safe.includes(separator) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = filledCells(grid, options.repeatLabels !== false).map((row) =>
        row
            .map((source) => {
                if (!source) {
                    return "";
                }
                if (isNumberCell(source)) {
                    const showAs = source.valueIndex !== undefined && Boolean(grid.showAs?.[source.valueIndex]);
                    return source.valueType === "date" ? isoOf(source.value) : numberText(source.value, source.format, mark, showAs, locale);
                }
                return quote(source.text);
            })
            .join(separator)
    );
    return lines.join("\r\n") + "\r\n";
}

/**
 * Display texts as tab-separated text for the clipboard: what a spreadsheet takes as columns when it
 * is pasted. Each cell is guarded like a CSV cell (bidi controls left out, a leading ' on text a
 * spreadsheet would run as a formula) and quoted when it holds a tab, a line break or a quote.
 * @param {string[][]} rows
 * @returns {string}
 */
export function tsvText(rows) {
    const quote = (text) => {
        const safe = exportText(String(text ?? ""));
        return /["\t\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    return rows.map((row) => row.map(quote).join("\t")).join("\r\n") + "\r\n";
}

/**
 * The grid as the table shows it, tab-separated for the clipboard: every cell's display text
 * ("1,234.5", "Jan 5, 2026", "35.7%"), headers and totals included, a row label repeated on every row
 * it spans. A spreadsheet in the same locale reads the numbers and dates back when it is pasted.
 * Text a spreadsheet would run as a formula gets a leading ' as in the CSV.
 * @param {import("./grid.js").Grid | string[][]} table  from toGrid(), or rows of display texts
 *   (the first row the headers), such as the rows a drill-down panel shows
 * @returns {string}
 */
export function toTsv(table) {
    if (Array.isArray(table)) {
        expect(table.every(Array.isArray), "toTsv(rows): rows must be arrays of texts");
        return tsvText(table);
    }
    expect(isGrid(table), "toTsv(grid): grid must come from toGrid() or be an array of rows");
    return tsvText(filledCells(table, true).map((row) => row.map((cell) => (cell ? cell.text : ""))));
}

/** A value of a value cell as JSON: the number, a date as its ISO date, text as it is, blank null. */
function jsonValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined) {
        return null;
    }
    if (isNumberCell(cell)) {
        return cell.valueType === "date" ? isoOf(cell.value) : Number(cell.value.toPrecision(15));
    }
    return typeof cell.value === "number" ? null : cell.value;
}

/**
 * The grid's data as JSON text, for a program rather than a spreadsheet:
 *
 *   { "rowHeaders": ["Region", "Product"],
 *     "columns": [{ "labels": ["Ann", "Sum of Units"], "value": "Sum of Units", "total": 0 }, ...],
 *     "rows": [{ "labels": ["North", "A"], "total": 0, "collapsed": false, "values": [12, null, ...] }, ...] }
 *
 * `rowHeaders` names the row label columns, `columns` describes each value column (the header texts
 * above it, the value's name, 0 none, 1 subtotal, 2 grand total), `rows` holds each body row's labels
 * (a label repeated on every row it spans; "" beside a subtotal's label and beside a collapsed group,
 * which has `collapsed: true` and its group's totals as values) and its values in the order of
 * `columns`: numbers with full precision (15 significant digits), a "show values as" share as the
 * fraction (0.25 for 25%), dates as ISO dates of their wall clock, text as it is, a blank cell null.
 * @param {import("./grid.js").Grid} grid  from toGrid()
 * @param {{ space?: number }} [options]  `space`: indentation of the text, default 2
 * @returns {string}
 */
export function toJson(grid, options) {
    options = optionsOf(options, "toJson");
    expect(isGrid(grid), "toJson(grid): grid must come from toGrid()");
    const cells = filledCells(grid, true);
    const k = grid.rowHeaderColumns;
    const header = cells.slice(0, grid.headerRows);
    const text = (cell) => (cell ? cell.text : "");
    const lastHeader = header[header.length - 1] ?? [];
    // a header cell merged sideways or down is the label of every column under it
    const headerCell = header.map((row) => row.slice());
    for (const m of grid.merges) {
        for (let r = m.row; r < Math.min(m.row + m.rowSpan, grid.headerRows); r++) {
            for (let c = m.col; c < m.col + m.colSpan; c++) {
                headerCell[r][c] = grid.rows[m.row][m.col];
            }
        }
    }
    const data = {
        rowHeaders: Array.from({ length: k }, (_, c) => text(lastHeader[c] ?? null)),
        columns: grid.dataColumns.map((column, i) => {
            const c = k + i;
            const labels = [];
            let previous = null;
            for (const row of headerCell) {
                const cell = row[c];
                // a cell merged down is one label
                if (cell && cell !== previous && cell.kind !== "corner" && cell.text !== "") {
                    labels.push(cell.text);
                }
                previous = cell;
            }
            return { labels, value: column.valueIndex >= 0 ? (grid.valueNames[column.valueIndex] ?? null) : null, total: column.total };
        }),
        rows: grid.bodyRows.map((row, i) => {
            const line = cells[grid.headerRows + i];
            return { labels: line.slice(0, k).map(text), total: row.total, collapsed: row.collapsed, values: line.slice(k).map(jsonValue) };
        })
    };
    return JSON.stringify(data, null, options.space ?? 2);
}

/**
 * The CSV as UTF-8 bytes, with a byte order mark so Excel detects the encoding.
 * @param {import("./grid.js").Grid} grid
 * @param {{ separator?: string, repeatLabels?: boolean, bom?: boolean }} [options]
 * @returns {Uint8Array}
 */
export function toCsvBytes(grid, options) {
    options = optionsOf(options, "toCsvBytes");
    return new TextEncoder().encode((options.bom === false ? "" : "\uFEFF") + toCsv(grid, options));
}
