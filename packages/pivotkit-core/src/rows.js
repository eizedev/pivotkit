/*
 * Export of source rows (a drill-down's rows behind a value) as CSV or an Excel workbook. The rows
 * are built as a grid of one header row and one line per row, so they go through the same writers as
 * the pivot grid: the same formula guard in CSV, inline strings in XLSX, typed numbers and dates.
 *
 * A cell shows its value as a drill-down panel does: a date as its day (with the time when the column
 * has times), a number with the field's format or else in the locale with up to 6 decimals, yes/no
 * with the labels' words; the format "text" keeps an identifier as it is ("40072").
 */

import { csvText, exportText } from "./csv.js";
import { checkLimit, expect } from "./errors.js";
import { isEncoded } from "./encode.js";
import { formatterFor, isFormat, shownDecimals } from "./format.js";
import { DEFAULT_LABELS, fieldLabel } from "./labels.js";
import { resolveLimits } from "./limits.js";
import { optionsOf, resolveLocale } from "./util.js";
import { toXlsx } from "./xlsx.js";

const DATE_FORMATS = new Set(["date", "datetime", "time"]);

/**
 * @typedef {object} RowsOptions
 * @property {string[]} [columns]  the fields to write, in this order (matched case-insensitively);
 *   default every column of the data
 * @property {string} [locale]  default "en-US"
 * @property {Record<string, string>} [formats]  a format name per field (matched case-insensitively,
 *   own entries only), as the drill-down panel takes it from `fieldDefaults`
 * @property {Partial<Pick<import("./labels.js").Labels, "fields" | "true" | "false">>} [labels]
 *   `fields`: the headers' display names; `true`, `false`: the words for yes/no
 * @property {Partial<import("./limits.js").Limits>} [limits]  `cells` counts rows x columns
 */

/** The own entry of `map` for `name`, matched case-insensitively; undefined when there is none. */
function entryOf(map, name) {
    if (!map || typeof map !== "object") {
        return undefined;
    }
    if (Object.hasOwn(map, name)) {
        return map[name];
    }
    const lower = name.toLowerCase();
    const key = Object.keys(map).find((k) => k.toLowerCase() === lower);
    return key === undefined ? undefined : map[key];
}

/**
 * One cell of a column for a dictionary value, as the drill-down panel shows it.
 * @param {import("./encode.js").Column} column
 * @param {string | null} spec  the field's format, a known format name or null
 * @param {string} locale
 * @param {{ true: string, false: string }} words
 * @returns {(v: string | number | boolean) => import("./grid.js").GridCell}
 */
function cellOf(column, spec, locale, words) {
    const name = spec ? spec.split(":")[0] : null;
    if (column.type === "date") {
        const format = name && DATE_FORMATS.has(name) ? spec : column.dateOnly ? "date" : "datetime";
        const text = formatterFor(format, locale);
        return (v) => ({ kind: "value", total: 0, value: v, valueType: "date", format, text: text(v) });
    }
    if (column.type === "number" && name !== "text") {
        const own = spec && !DATE_FORMATS.has(name) ? spec : null;
        const ownText = own ? formatterFor(own, locale) : null;
        return (v) => {
            // without a format: as many decimals as the value has, at most 6, as the panel shows it
            const format = own ?? `number:${shownDecimals(/** @type {number} */ (v), 6)}`;
            return { kind: "value", total: 0, value: v, valueType: "number", format, text: ownText ? ownText(v) : formatterFor(format, locale)(v) };
        };
    }
    if (column.type === "boolean") {
        return (v) => ({ kind: "value", total: 0, value: null, valueType: "text", text: v ? words.true : words.false });
    }
    return (v) => ({ kind: "value", total: 0, value: null, valueType: "text", text: String(v) });
}

/**
 * The rows as a grid: a header row with the fields' display names, then one line per row.
 * @param {import("./encode.js").Encoded} data
 * @param {ArrayLike<number>} indices
 * @param {RowsOptions} options
 * @param {string} fn  the public function's name, for errors
 * @returns {import("./grid.js").Grid}
 */
function rowsGrid(data, indices, options, fn) {
    expect(isEncoded(data), `${fn}(data, indices): data must come from encode()`);
    expect(indices !== null && typeof indices === "object" && typeof indices.length === "number", `${fn}(data, indices): indices must be an array of row positions`);
    const limits = resolveLimits(options);
    const locale = resolveLocale(null, options.locale);
    const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
    let columns = data.columns;
    if (options.columns !== undefined) {
        expect(Array.isArray(options.columns), `${fn}: options.columns must be an array of field names`);
        columns = options.columns.map((name) => data.column(String(name))).filter((c) => c !== undefined);
    }
    checkLimit("cells", (indices.length + 1) * columns.length, limits.cells, "rows x columns of the rows export");
    const makers = columns.map((column) => {
        const format = entryOf(options.formats, column.name);
        return cellOf(column, typeof format === "string" && isFormat(format) ? format.trim().toLowerCase() : null, locale, labels);
    });
    const header = columns.map((column) => /** @type {import("./grid.js").GridCell} */ ({ kind: "colHeader", total: 0, value: column.name, text: fieldLabel(column.name, labels) }));
    const rows = [header];
    for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        expect(Number.isInteger(i) && i >= 0 && i < data.length, `${fn}: indices[${k}] is not a row of the data`);
        rows.push(
            columns.map((column, c) => {
                const code = column.codes[i];
                return code < 0 ? null : makers[c](column.dict[code]);
            })
        );
    }
    return {
        rows,
        headerRows: 1,
        rowHeaderColumns: 0,
        columnCount: columns.length,
        merges: [],
        dataColumns: [],
        bodyRows: [],
        formats: [],
        showAs: [],
        valueNames: [],
        conditional: [],
        locale,
        timeZone: data.timeZone
    };
}

/**
 * Rows of the data as CSV text: a header row with the fields' display names, then one line per row.
 * As toCsv writes the grid: the locale's separator and decimal mark, numbers with full precision
 * (a percent as "-2.6%"), dates as ISO dates, yes/no as the labels' words, a blank value empty, and
 * the formula guard on text.
 * @param {import("./encode.js").Encoded} data  from encode()
 * @param {ArrayLike<number>} indices  the rows' positions in the data (cellRows)
 * @param {RowsOptions & { separator?: string }} [options]
 * @returns {string}
 */
export function rowsToCsv(data, indices, options) {
    options = optionsOf(options, "rowsToCsv");
    return csvText(rowsGrid(data, indices, options, "rowsToCsv"), options);
}

/**
 * The CSV of rowsToCsv as UTF-8 bytes, with a byte order mark so Excel detects the encoding.
 * @param {import("./encode.js").Encoded} data
 * @param {ArrayLike<number>} indices
 * @param {RowsOptions & { separator?: string, bom?: boolean }} [options]
 * @returns {Uint8Array}
 */
export function rowsToCsvBytes(data, indices, options) {
    options = optionsOf(options, "rowsToCsvBytes");
    return new TextEncoder().encode((options.bom === false ? "" : "\uFEFF") + csvText(rowsGrid(data, indices, options, "rowsToCsvBytes"), options));
}

/**
 * Rows of the data as an .xlsx workbook: a bold, frozen header row with the fields' display names,
 * numbers and dates as typed cells with the number format the panel shows them in, text as inline
 * strings (never a formula).
 * @param {import("./encode.js").Encoded} data
 * @param {ArrayLike<number>} indices
 * @param {RowsOptions & { sheetName?: string }} [options]  `sheetName` default "Pivot", made valid for Excel
 * @returns {Uint8Array}
 */
export function rowsToXlsx(data, indices, options) {
    options = optionsOf(options, "rowsToXlsx");
    return toXlsx(rowsGrid(data, indices, options, "rowsToXlsx"), { sheetName: options.sheetName });
}

// ---------------------------------------------------------------------------------------------------
// The data itself: every row, the values as they are

/**
 * @typedef {object} DataOptions
 * @property {string[]} [columns]  the fields to write, in this order (matched case-insensitively);
 *   default every column of the data
 * @property {Partial<import("./limits.js").Limits>} [limits]  `cells` counts rows x columns
 */

/**
 * A wall-clock date as ISO text without an offset, as the import reads it back: the day alone in a
 * column without clock times, else the day and the time, with milliseconds when the value has them.
 * @param {number} ms  wall-clock milliseconds
 * @param {boolean} dateOnly
 */
function isoWall(ms, dateOnly) {
    // a year beyond 9999 is written with its sign ("+10000-01-01"): split at the time, not at a place
    const [day, time] = new Date(ms).toISOString().split("T");
    if (dateOnly) {
        return day;
    }
    return `${day}T${ms % 1000 === 0 ? time.slice(0, 8) : time.slice(0, 12)}`;
}

/**
 * The columns and the value of each cell as a file of the data holds it: a number as JavaScript
 * writes it (every digit), a date as ISO text, true/false, text as it is, null for a blank. Derived
 * fields are no columns of the data (a view computes them), so they are never written.
 * @param {import("./encode.js").Encoded} data
 * @param {DataOptions} options
 * @param {string} fn
 */
function dataColumns(data, options, fn) {
    expect(isEncoded(data), `${fn}(data): data must come from encode()`);
    let columns = data.columns.filter((c) => !c.derived);
    if (options.columns !== undefined) {
        expect(Array.isArray(options.columns), `${fn}: options.columns must be an array of field names`);
        // a name that matches no column is left out, one named twice is written once
        const wanted = new Set(options.columns.map((name) => String(name).toLowerCase()));
        columns = [...wanted].map((key) => columns.find((c) => c.key === key)).filter((c) => c !== undefined);
    }
    checkLimit("cells", (data.length + 1) * columns.length, resolveLimits(options).cells, "rows x columns of the data export");
    const valueOf = columns.map((column) => (column.type === "date" ? (v) => isoWall(/** @type {number} */ (v), Boolean(column.dateOnly)) : (v) => v));
    /** @param {number} i  @param {number} c */
    const cell = (i, c) => {
        const code = columns[c].codes[i];
        return code < 0 ? null : valueOf[c](columns[c].dict[code]);
    };
    return { columns, cell };
}

/**
 * The data as CSV text, to read again (the command line's --data, a spreadsheet, a script): a header
 * with the fields' own names (a view names them so), then every row with its values as they are, not
 * formatted: "," between values and "." as the decimal mark whatever the locale, numbers with every
 * digit, dates as ISO text without an offset (wall clock), true/false, a blank empty. Text keeps the
 * formula guard and loses bidi controls, as every CSV this package writes.
 * @param {import("./encode.js").Encoded} data  from encode()
 * @param {DataOptions} [options]
 * @returns {string}
 */
export function dataToCsv(data, options) {
    options = optionsOf(options, "dataToCsv");
    return dataCsv(data, options, "dataToCsv");
}

/**
 * The CSV of dataToCsv as UTF-8 bytes, with a byte order mark unless `bom` is false.
 * @param {import("./encode.js").Encoded} data
 * @param {DataOptions & { bom?: boolean }} [options]
 * @returns {Uint8Array}
 */
export function dataToCsvBytes(data, options) {
    options = optionsOf(options, "dataToCsvBytes");
    return new TextEncoder().encode((options.bom === false ? "" : "﻿") + dataCsv(data, options, "dataToCsvBytes"));
}

function dataCsv(data, options, fn) {
    const { columns, cell } = dataColumns(data, options, fn);
    const text = (v) => {
        const safe = exportText(String(v));
        return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = [columns.map((c) => text(c.name)).join(",")];
    // a blank is empty, except as the only value of a line: an empty line is skipped by every reader
    const blank = columns.length === 1 ? '""' : "";
    for (let i = 0; i < data.length; i++) {
        const line = new Array(columns.length);
        for (let c = 0; c < columns.length; c++) {
            const v = cell(i, c);
            line[c] = v === null ? blank : typeof v === "string" ? text(v) : String(v);
        }
        lines.push(line.join(","));
    }
    return lines.join("\r\n") + "\r\n";
}

/**
 * The data as JSON text: an array with one object per row, each field under its own name, the values
 * typed (numbers, true/false, text as it is, dates as ISO text without an offset, null for a blank).
 * One row per line, so a large file stays readable in an editor and in a diff.
 * @param {import("./encode.js").Encoded} data  from encode()
 * @param {DataOptions} [options]
 * @returns {string}
 */
export function dataToJson(data, options) {
    options = optionsOf(options, "dataToJson");
    const { columns, cell } = dataColumns(data, options, "dataToJson");
    const lines = [];
    for (let i = 0; i < data.length; i++) {
        // no prototype: a field named "__proto__" is a key like any other
        /** @type {Record<string, unknown>} */
        const row = Object.create(null);
        for (let c = 0; c < columns.length; c++) {
            row[columns[c].name] = cell(i, c);
        }
        lines.push(JSON.stringify(row));
    }
    return lines.length ? `[\n${lines.join(",\n")}\n]\n` : "[]\n";
}
