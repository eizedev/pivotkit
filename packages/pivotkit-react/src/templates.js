/*
 * The entries of the Views menu: the host's `templates` (a view or a view file each, shared or the
 * user's own) and the views of the browser store (view-store.js, loaded with the menus), each with its
 * scope and whether it can be deleted.
 */

import { fieldDefaultsFromSchema, fromViewFile } from "pivotkit-core";

/** Whether the console was told once that a deletable entry without a scope counts as the user's own. */
let warnedScope = false;

/**
 * Names as plain text, by the rules of a field's display name (pivotkit-core's fieldDefaultsFromSchema:
 * control, bidi and zero-width characters go, at most 120 characters); undefined for a name left empty.
 * @param {string[]} names
 * @returns {Array<string | undefined>}
 */
function plainNames(names) {
    const properties = {};
    names.forEach((title, i) => Object.defineProperty(properties, String(i), { value: { title }, enumerable: true }));
    const clean = names.length ? fieldDefaultsFromSchema({ properties }).defaults : {};
    return names.map((n, i) => (Object.hasOwn(clean, String(i)) ? clean[String(i)].label : undefined));
}

/** The localStorage item of a report's views: one per storageKey ("pivotkit:views" without one). */
export const viewsName = (key) => (key ? `pivotkit:views:${key}` : "pivotkit:views");

/**
 * @typedef {object} TemplateEntry  an entry of the Views menu
 * @property {string} name
 * @property {Record<string, unknown>} view  not normalized: the report normalizes it when it is loaded
 * @property {"shared" | "user"} scope
 * @property {boolean} deletable
 * @property {number} [at]  its place in the browser store; only for the store's own entries
 * @property {string} [sourceId]  the data a view of the browser store names, when it names one
 * @property {string} [sheet]  the sheet of a workbook the view was made on (its source.params.sheet)
 * @property {string} [sheetOf]  the source id of that workbook's sheet (a host's view file; the
 *   browser store's entries have it as `sourceId`)
 * @property {string} [fileSource]  the source id a host's view file names (with or without a sheet): the data it
 *   was made for, which Publish hands on
 */

/**
 * The entries of the Views menu: the host's templates (an entry with `file` is read as a view file;
 * one without a usable view or name is left out), then the browser store's. An entry without a
 * `scope` is the user's own when it is deletable, else shared (with a console warning once: a
 * deletable shared view would land under "My views"). A host's entry can be deleted only when it is
 * marked `deletable` and the host takes the delete (`hostDeletes`). Every name is plain text
 * (plainNames), as a name from a file or the store is.
 * @param {unknown} templates  the host's
 * @param {Array<{ name: string, view: Record<string, unknown>, at: number, sourceId?: string, sheet?: string }>} stored
 * @param {boolean} hostDeletes
 * @returns {TemplateEntry[]}
 */
export function templateEntries(templates, stored, hostDeletes) {
    /** @type {TemplateEntry[]} */
    const out = [];
    for (const t of Array.isArray(templates) ? templates : []) {
        if (!t || typeof t !== "object") {
            continue;
        }
        let { name, view } = t;
        /** @type {{ sheet?: string, sheetOf?: string, fileSource?: string }} */
        let made = {};
        if (t.file !== undefined && t.file !== null) {
            const read = fromViewFile(t.file);
            view = read.view;
            name = typeof name === "string" && name ? name : read.name;
            // the sheet of a workbook it was made on (sheet-views.js reads it the same way; that module
            // loads with the menus, this one with the first render)
            const sheet = read.source?.params?.sheet;
            made = { ...(read.source?.id ? { fileSource: read.source.id } : {}), ...(sheet && read.source?.id ? { sheet, sheetOf: read.source.id } : {}) };
        }
        if (typeof name === "string" && name && view && typeof view === "object") {
            const deletable = t.deletable === true;
            const scoped = t.scope === "shared" || t.scope === "user";
            if (deletable && !scoped && !warnedScope) {
                warnedScope = true;
                console.warn('pivotkit: a template marked deletable without a scope is listed under "My views"; give shared views scope: "shared"');
            }
            out.push({ name, view, deletable: deletable && hostDeletes, scope: scoped ? t.scope : deletable ? "user" : "shared", ...made });
        }
    }
    const all = [...out, ...stored.map((t) => ({ name: t.name, view: t.view, scope: /** @type {const} */ ("user"), deletable: true, at: t.at, ...(t.sourceId ? { sourceId: t.sourceId } : {}), ...(t.sheet ? { sheet: t.sheet } : {}) }))];
    const names = plainNames(all.map((t) => t.name));
    return all.flatMap((t, i) => (names[i] ? [{ ...t, name: /** @type {string} */ (names[i]) }] : []));
}
