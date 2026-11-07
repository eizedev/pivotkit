/*
 * Drill-down: the source rows behind a cell, limited to a number of rows for the panel and the
 * onCellClick callback. With the `data` prop the host's own row objects are returned; with only
 * `encoded` data the rows are rebuilt from the columns. The panel shows the rows as text from the
 * encoded columns, formatted by each column's type as the table formats it (drillTable).
 */

import { cellRows, formatter, isFormat } from "pivotkit-core";

/** Rows passed to the panel and to onCellClick by default. */
export const DRILL_LIMIT = 1000;

/**
 * One row rebuilt from encoded columns: blank is null, dates are ISO texts of their wall clock.
 * A plain object for the host; every column is defined as an own property, so a column named
 * "__proto__" is a value like any other instead of setting the prototype.
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {number} i
 */
export function decodeRow(encoded, i) {
    const row = {};
    for (const column of encoded.columns) {
        const code = column.codes[i];
        const v = code < 0 ? null : column.dict[code];
        const value = column.type === "date" && typeof v === "number" ? new Date(v).toISOString().replace(/(T00:00:00)?\.000Z$/, "").replace(/:00$/, "") : v;
        Object.defineProperty(row, column.name, { value, enumerable: true, writable: true, configurable: true });
    }
    return row;
}

/**
 * The rows behind a cell.
 * @param {import("pivotkit-core").PivotResult} result
 * @param {{ rowPath?: any[], colPath?: any[], data?: object[] | null, limit?: number }} options
 * @returns {{ count: number, rows: object[], indices: Int32Array }}  `indices`: the rows' positions in the data
 */
export function drillRows(result, { rowPath = [], colPath = [], data = null, limit = DRILL_LIMIT }) {
    const all = cellRows(result, { row: rowPath, col: colPath });
    const indices = all.slice(0, Math.max(0, limit));
    const rows = new Array(indices.length);
    for (let k = 0; k < indices.length; k++) {
        rows[k] = data ? data[indices[k]] : decodeRow(result.encoded, indices[k]);
    }
    return { count: all.length, rows, indices };
}

const DATE_FORMATS = new Set(["date", "datetime", "time"]);

/**
 * The text of one column's values: a date as the table shows it (its day, with the time when the
 * column has times), a number with `format` (a format of pivotkit-core: "text" shows an identifier
 * as it is, "40072") or else in the locale with up to 6 decimals, yes/no with the labels' words.
 * @param {import("pivotkit-core").Column} column
 * @param {{ locale: string, labels: import("pivotkit-core").Labels, format?: unknown }} options
 * @returns {{ text: (value: unknown) => string, numeric: boolean }}
 */
export function columnText(column, { locale, labels, format }) {
    const spec = typeof format === "string" && isFormat(format) ? format.trim().toLowerCase() : null;
    if (column.type === "date") {
        // the dictionary holds wall-clock milliseconds, read in UTC like the table's labels
        const f = formatter(spec && DATE_FORMATS.has(spec.split(":")[0]) ? spec : column.dateOnly ? "date" : "datetime", { locale });
        return { text: f, numeric: false };
    }
    if (column.type === "number") {
        const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
        const f = spec && !DATE_FORMATS.has(spec.split(":")[0]) ? formatter(spec, { locale }) : (v) => nf.format(/** @type {number} */ (v));
        return { text: f, numeric: spec !== "text" };
    }
    if (column.type === "boolean") {
        return { text: (v) => (v ? labels.true : labels.false), numeric: false };
    }
    return { text: (v) => String(v), numeric: false };
}

/**
 * The rows of the drill-down panel as text, from the encoded columns: one entry per column (its name,
 * whether it is right-aligned as a number) and per row the texts; a blank value is "".
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {ArrayLike<number>} indices  positions of the rows in the data (drillRows)
 * @param {{ locale: string, labels: import("pivotkit-core").Labels, formatOf?: (column: string) => unknown }} options
 *   `formatOf`: the host's format for a column's values (fieldDefaults)
 * @returns {{ columns: Array<{ name: string, numeric: boolean }>, rows: string[][] }}
 */
export function drillTable(encoded, indices, { locale, labels, formatOf = () => undefined }) {
    const cols = encoded.columns.map((column) => ({ column, ...columnText(column, { locale, labels, format: formatOf(column.name) }) }));
    const rows = Array.from(indices, (i) =>
        cols.map(({ column, text }) => {
            const code = column.codes[i];
            const v = code < 0 ? null : column.dict[code];
            return v === null || v === undefined ? "" : text(v);
        })
    );
    return { columns: cols.map((c) => ({ name: c.column.name, numeric: c.numeric })), rows };
}
