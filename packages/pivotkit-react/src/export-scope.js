/*
 * What the host's `exportData` lets out of the report: Source data in the Export menu, whether the
 * drill-down panel copies and downloads its rows (#263), and which columns those hold (#259).
 * Loaded with the menus: the Export menu, the drill-down panel and the export read it when they are
 * used, so the first load does not carry it.
 */

/**
 * @typedef {boolean | { columns?: string[] }} ExportDataOption
 * @typedef {{ source: boolean, columns?: string[], unknown: string[], notList?: boolean }} DataExport
 *   `source`: Source data is offered; `columns`: the host's columns as the data names them (only
 *   these, in this order, in Source data and in the drill-down's exports); `unknown`: names the host
 *   gave that no column of the data has; `notList`: `columns` was given but is no list
 */

/**
 * The host's `exportData` against the data's own columns (not the derived fields a view adds):
 * - off (false, absent, or a shape it does not know): no Source data; the drill-down's exports
 *   only with the host's `drillDownExport` (drillExportOn), every column;
 * - `{ columns }` that is no list (`"Region"`, a function): both off, as an empty list, so a mistake
 *   hands out nothing;
 * - true or `{}`: Source data with every column;
 * - `{ columns }`: Source data and the drill-down's exports with those columns only, matched
 *   case-insensitively, each once; none that matches (or an empty list): no Source data, and the
 *   drill-down's exports go too, since they would hold no column.
 * @param {unknown} exportData
 * @param {string[]} names  the data's columns, without derived fields
 * @returns {DataExport}
 */
export function dataExportOf(exportData, names) {
    if (exportData === true) {
        return { source: true, unknown: [] };
    }
    if (!exportData || typeof exportData !== "object" || Array.isArray(exportData)) {
        return { source: false, unknown: [] };
    }
    const { columns } = /** @type {{ columns?: unknown }} */ (exportData);
    if (columns === undefined) {
        return { source: true, unknown: [] };
    }
    if (!Array.isArray(columns)) {
        return { source: false, columns: [], unknown: [], notList: true };
    }
    const wanted = columns.filter((c) => typeof c === "string");
    const picked = pickColumns(names, wanted).map((i) => names[i]);
    const known = new Set(picked.map((n) => n.toLowerCase()));
    const unknown = wanted.filter((w) => !known.has(w.toLowerCase()));
    return { source: picked.length > 0, columns: picked, unknown };
}

/**
 * Whether the drill-down panel offers its copies and downloads: with `exportData` on and a column
 * left, or with `drillDownExport` while `exportData` is off (#263). `drillDownExport` never widens
 * the host's columns: none left stays off.
 * @param {DataExport} scope  dataExportOf's answer
 * @param {{ drillDownExport?: boolean }} [options]
 * @returns {boolean}
 */
export function drillExportOn(scope, { drillDownExport = false } = {}) {
    if (scope.columns) {
        return scope.columns.length > 0;
    }
    return scope.source || drillDownExport === true;
}

/**
 * The places of the wanted columns among `names`, in the wanted order, matched case-insensitively as
 * pivotkit-core's exporters match them; a name not there is left out, each column once.
 * @param {string[]} names
 * @param {string[] | undefined} wanted  undefined: every column, in its order
 * @returns {number[]}
 */
export function pickColumns(names, wanted) {
    if (wanted === undefined) {
        return names.map((_n, i) => i);
    }
    const picked = [];
    for (const w of wanted) {
        const i = names.findIndex((n) => n.toLowerCase() === w.toLowerCase());
        if (i >= 0 && !picked.includes(i)) {
            picked.push(i);
        }
    }
    return picked;
}

/** What the console was told already, so a host's mistake is said once per page. */
const warned = new Set();

/**
 * dataExportOf against the data shown (its columns without derived fields), with the host's names
 * that match nothing said once in the console.
 * @param {unknown} exportData
 * @param {import("pivotkit-core").Encoded | null | undefined} encoded
 * @returns {DataExport}
 */
export function dataExportFor(exportData, encoded) {
    const names = encoded ? encoded.columns.filter((c) => !c.derived).map((c) => c.name) : [];
    const scope = dataExportOf(exportData, names);
    if (scope.notList) {
        warnOnce("pivotkit: exportData.columns is not a list; Source data and the drill-down's exports are off");
    } else if (names.length > 0 && scope.columns) {
        const off = scope.source ? "" : "; no column is left, so Source data and the drill-down's exports are off";
        const listed = scope.unknown.slice(0, 5).map((n) => JSON.stringify(n.slice(0, 40))).join(", ") + (scope.unknown.length > 5 ? `, and ${scope.unknown.length - 5} more` : "");
        const text = scope.unknown.length > 0 ? `pivotkit: exportData.columns names no column of the data: ${listed}${off}` : scope.source ? null : `pivotkit: exportData.columns is empty${off}`;
        if (text) {
            warnOnce(text);
        }
    }
    return scope;
}

/** @param {string} text */
function warnOnce(text) {
    if (!warned.has(text)) {
        warned.add(text);
        console.warn(text);
    }
}
