/*
 * Drill-down: the source rows behind a cell, limited to a number of rows for the panel and the
 * onCellClick callback. With the `data` prop the host's own row objects are returned; with only
 * `encoded` data the rows are rebuilt from the columns. The panel's table of them is drill-table.js's,
 * loaded with the menus.
 */

import { cellRows } from "pivotkit-core";

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
