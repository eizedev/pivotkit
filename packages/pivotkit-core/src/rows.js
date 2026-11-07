/*
 * Export of source rows (a drill-down's rows behind a value) as CSV or an Excel workbook. The rows
 * are built as a grid of one header row and one line per row, so they go through the same writers as
 * the pivot grid: the same formula guard in CSV, inline strings in XLSX, typed numbers and dates.
 *
 * A cell shows its value as a drill-down panel does: a date as its day (with the time when the column
 * has times), a number with the field's format or else in the locale with up to 6 decimals, yes/no
 * with the labels' words; the format "text" keeps an identifier as it is ("40072").
 */

import { csvText } from "./csv.js";
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
