/*
 * The sheet of a workbook a view was made on (issue #252). A view saved, downloaded or linked while a
 * loaded workbook's sheet is shown names it in its source (`source.params.sheet`); the source id
 * (pivotkit-core/import's sourceIdOf: the file's shown name, "#" and a hash of its name and columns) leaves the sheet
 * out. These rules decide which views of the browser store a workbook's data lists and what opening
 * a view that names another sheet does. Pure, without a DOM; small, since the report's first load
 * holds it.
 */

/** A loaded file's source id: its shown name, "#" and 16 hex digits (pivotkit-core/import's sourceIdOf). */
const FILE_ID = /^([^]*)#[0-9a-f]{16}$/;

/**
 * The file name part of a loaded file's source id, or null for another id (a host's data).
 * @param {string | null | undefined} id
 */
export function fileOfId(id) {
    const m = typeof id === "string" ? FILE_ID.exec(id) : null;
    return m ? m[1] : null;
}

/**
 * The sheet a view's source names, or null.
 * @param {unknown} source  a view file's source ({ id, params })
 * @returns {string | null}
 */
export function sheetOfSource(source) {
    const sheet = source && typeof source === "object" ? /** @type {any} */ (source).params?.sheet : undefined;
    return typeof sheet === "string" && sheet ? sheet : null;
}

/**
 * @typedef {object} ShownSheet  the data shown, for these rules
 * @property {string | undefined} id  its source id
 * @property {string | null} sheet  the sheet of a workbook shown, else null
 * @property {readonly string[]} sheets  the sheets of that workbook (names)
 */

/**
 * Whether a view of the browser store is listed for the data shown: made for this data (its id), for
 * no named data, while no data is named, or for a sheet of a file of the same name while a workbook's
 * sheet is shown (the same workbook's other sheets have other columns, so another id; opening it
 * reads that sheet, sheetPlan).
 * @param {{ sourceId?: string, sheet?: string | null }} entry
 * @param {ShownSheet} shown
 */
export function listedFor(entry, shown) {
    if (!entry.sourceId || !shown.id || entry.sourceId === shown.id) {
        return true;
    }
    return Boolean(entry.sheet && shown.sheet && fileOfId(entry.sourceId) !== null && fileOfId(entry.sourceId) === fileOfId(shown.id));
}

/**
 * What opening a view that names a sheet does with the data shown: nothing ("none": it names no
 * sheet, the sheet shown, or other data than this file), read that sheet of the file again first
 * ("switch"), or say that the workbook has no such sheet ("missing": the view loads on the data shown).
 * @param {{ id?: string | null, sheet?: string | null }} view  the source the view names
 * @param {ShownSheet} shown
 * @returns {{ kind: "none" } | { kind: "switch" | "missing", sheet: string }}
 */
export function sheetPlan(view, shown) {
    const sheet = view.sheet;
    if (!sheet || !shown.sheet || sheet === shown.sheet) {
        return { kind: "none" };
    }
    const file = fileOfId(view.id);
    if (file === null || file !== fileOfId(shown.id)) {
        return { kind: "none" };
    }
    return { kind: shown.sheets.includes(sheet) ? "switch" : "missing", sheet };
}
