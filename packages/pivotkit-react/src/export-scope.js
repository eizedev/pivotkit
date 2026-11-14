/*
 * What the host's `exportData` lets out of the report as files and copies: Source data in the Export
 * menu and the drill-down panel's exports (#259, #263). Off unless the host says so; with
 * `{ columns }` only those columns. First load (PivotReport reads it), pure.
 */

/**
 * @typedef {boolean | { columns?: string[] }} ExportDataOption
 * @typedef {{ columns?: string[] }} DataExport  on; `columns`: only these, in this order
 */

/**
 * The host's `exportData` as what the exports take: null when off (false, absent, or a shape it does
 * not know, so a mistake hands out nothing); `{}` for every column; `{ columns }` for some.
 * @param {unknown} exportData
 * @returns {DataExport | null}
 */
export function dataExportOf(exportData) {
    if (exportData === true) {
        return {};
    }
    if (!exportData || typeof exportData !== "object" || Array.isArray(exportData)) {
        return null;
    }
    const { columns } = /** @type {{ columns?: unknown }} */ (exportData);
    if (columns === undefined) {
        return {};
    }
    return Array.isArray(columns) ? { columns: columns.filter((c) => typeof c === "string") } : null;
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
