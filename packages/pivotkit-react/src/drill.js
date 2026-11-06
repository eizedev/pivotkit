/*
 * Drill-down: the source rows behind a cell, limited to a number of rows for the panel and the
 * onCellClick callback. With the `data` prop the host's own row objects are returned; with only
 * `encoded` data the rows are rebuilt from the columns.
 */

import { cellRows } from "pivotkit-core";

/** Rows passed to the panel and to onCellClick by default. */
export const DRILL_LIMIT = 1000;

/**
 * One row rebuilt from encoded columns: blank is null, dates are ISO texts of their wall clock.
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {number} i
 */
export function decodeRow(encoded, i) {
    const row = {};
    for (const column of encoded.columns) {
        const code = column.codes[i];
        const v = code < 0 ? null : column.dict[code];
        row[column.name] = column.type === "date" && typeof v === "number" ? new Date(v).toISOString().replace(/(T00:00:00)?\.000Z$/, "").replace(/:00$/, "") : v;
    }
    return row;
}

/**
 * The rows behind a cell.
 * @param {import("pivotkit-core").PivotResult} result
 * @param {{ rowPath?: any[], colPath?: any[], data?: object[] | null, limit?: number }} options
 * @returns {{ count: number, rows: object[] }}
 */
export function drillRows(result, { rowPath = [], colPath = [], data = null, limit = DRILL_LIMIT }) {
    const indices = cellRows(result, { row: rowPath, col: colPath });
    const n = Math.min(indices.length, Math.max(0, limit));
    const rows = new Array(n);
    for (let k = 0; k < n; k++) {
        rows[k] = data ? data[indices[k]] : decodeRow(result.encoded, indices[k]);
    }
    return { count: indices.length, rows };
}

/**
 * A value of a source row as text for the drill-down table.
 * @param {unknown} v
 * @param {{ locale: string, timeZone?: string }} options
 */
export function cellText(v, { locale, timeZone }) {
    if (v === null || v === undefined) {
        return "";
    }
    if (v instanceof Date) {
        return Number.isNaN(v.getTime()) ? "" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timeZone && timeZone !== "local" ? timeZone : undefined }).format(v);
    }
    if (typeof v === "number") {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(v);
    }
    if (typeof v === "object") {
        return JSON.stringify(v);
    }
    return String(v);
}
