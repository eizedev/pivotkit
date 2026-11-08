/*
 * The drill-down panel's table (drill-panel.jsx): the rows behind a value as text from the encoded
 * columns, formatted by each column's type as the table formats it, and the cell's labels as the
 * panel's title. Loaded with the menus; the first load keeps only what finds the rows (drill.js), which
 * the host's onCellClick gets in the click.
 */

import { fieldLabel, findNode, formatter, isFormat } from "pivotkit-core";

/**
 * What the report hands the panel (PivotReport: a click on a value): the result, the cell's paths,
 * the rows found (drillRows) and how the report names, describes and formats a field.
 * @typedef {{ result: import("pivotkit-core").PivotResult, rowPath: unknown[], colPath: unknown[], count: number, indices: ArrayLike<number>,
 *   formatOf: (field: string) => unknown, nameOf: (field: string) => string, infoOf: (field: string) => { description?: string } | null | undefined }} DrillSource
 */

/**
 * The panel's contents.
 * @typedef {{ title: string, name: string, count: number, locale: string, indices: ArrayLike<number>, formats: Record<string, string>,
 *   columns: Array<{ name: string, numeric: boolean, label?: string, description?: string }>, rows: string[][] }} Drill
 */

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

/** "Region: North · Product: A" for a cell's paths. */
function pathTitle(result, rowPath, colPath, labels) {
    const parts = [];
    const items = [];
    const add = (axis, fields, path) => {
        const node = findNode(result, axis, path);
        for (let n = node; n && n.parent; n = n.parent) {
            const item = result.label(axis, n, labels.core);
            parts.unshift(`${fieldLabel(fields[n.depth - 1], labels.core)}: ${item}`);
            items.unshift(item);
        }
    };
    add("cols", result.colFields, colPath);
    add("rows", result.rowFields, rowPath);
    // the items alone name the drill-down's files and sheet: "Central – Jul 2026"
    return { title: parts.length ? parts.join(" · ") : labels.core.grandTotal, name: items.length ? items.join(" – ") : labels.core.grandTotal };
}

/**
 * The panel's contents for a clicked value: its title, its table, and the formats the panel's exports
 * use (pivotkit-core's rows exporters write them as the table shows them).
 * @param {DrillSource} source
 * @param {import("./labels.js").UiLabels} labels
 * @returns {Drill}
 */
export function drillOf({ result, rowPath, colPath, count, indices, formatOf, nameOf, infoOf }, labels) {
    const table = drillTable(result.encoded, indices, { locale: result.locale, labels: labels.core, formatOf });
    const columns = table.columns.map((c) => ({ ...c, label: nameOf(c.name), description: infoOf(c.name)?.description }));
    const formats = Object.fromEntries(table.columns.map((c) => [c.name, formatOf(c.name)]).filter(([, f]) => typeof f === "string"));
    return { ...pathTitle(result, rowPath, colPath, labels), count, rows: table.rows, columns, indices, formats, locale: result.locale };
}
