/*
 * Where Save and Save as write in the Views menu (toolbar-panels.jsx), from the view loaded and what
 * the host allows. Pure, tested without a DOM; loads with the menus.
 *
 * - Save writes the loaded view under its name: a view of the browser store in its place, a user's
 *   view of the host through onSaveTemplate (scope "user"), a shared view through onPublishTemplate
 *   when the user may publish (after asking: everyone sees it). A shared view the user may not
 *   change, a view from a file or a link (not among the saved views) and an empty report say why
 *   Save is off.
 * - Save as writes a user's view under a name: through onSaveTemplate when the host takes the saves,
 *   else into the browser store. A name that exists there asks before it is replaced.
 *
 * A view of the browser store is known by its name, the data it names (`storeSource`) and the sheet
 * of a workbook it was made on (`storeSheet`): the store keeps one view of a name without named data
 * and one per data and sheet (view-store.js), never its place, which changes when a view before it is
 * deleted.
 */

/**
 * @typedef {{ name: string, scope: "user" | "shared" | null, store: boolean, storeSource?: string | null, storeSheet?: string | null }} LoadedView
 *   the view loaded: its name, its group (null: a file or a link), whether the browser store keeps it
 *   and, there, the data and the sheet it names
 * @typedef {{ host: boolean, store: boolean, publish: boolean, sourceId?: string, sheet?: string | null }} SaveRights
 *   onSaveTemplate is set, the browser store is on, the user may publish (canPublish with
 *   onPublishTemplate); the data shown and its sheet of a workbook
 * @typedef {{ kind: "store", at?: number, storeSource: string | null, storeSheet?: string | null } | { kind: "host" } | { kind: "publish" }} SaveWrite
 *   where a save goes; `at`: the browser store's view it writes over (none: a view added)
 * @typedef {SaveWrite | { kind: null, why: "saveSharedLocked" | "saveNotInViews" | "exportNeedsField" }} SaveTarget
 *   `why`: the label that says why Save is off
 * @typedef {{ name: string, scope: string, at?: number, sourceId?: string, sheet?: string }} Entry  an entry of the Views menu
 */

/** Whether Save as can write anywhere. @param {SaveRights} can */
export const canSaveAs = (can) => can.host || can.store;

/**
 * Whether an entry of the Views menu is the view loaded: its name, its group, and for the browser
 * store the data it names.
 * @param {Entry} t
 * @param {LoadedView | null | undefined} loaded
 */
export const isLoadedEntry = (t, loaded) =>
    !!loaded && t.name === loaded.name && (t.scope === "user" ? "user" : "shared") === loaded.scope && (t.at !== undefined) === loaded.store && (!loaded.store || ((t.sourceId ?? null) === (loaded.storeSource ?? null) && (t.sheet ?? null) === (loaded.storeSheet ?? null)));

/**
 * The browser store's view of this name for this data and sheet (none: one saved without named data;
 * a view of this data saved before views named their sheet stands in for the sheet, so Save writes
 * over it and gives it the sheet).
 * @param {ReadonlyArray<Entry>} entries
 * @param {string} name
 * @param {string | null | undefined} source
 * @param {string | null | undefined} sheet
 */
const storeEntry = (entries, name, source, sheet) => {
    const of = (s) => entries.find((t) => t.at !== undefined && t.name === name && (t.sourceId ?? null) === (source ?? null) && (t.sheet ?? null) === s);
    return of(source ? (sheet ?? null) : null) ?? (source && sheet ? of(null) : undefined);
};

/**
 * Where Save writes the loaded view, or why it is off; null when there is no Save to offer (nothing
 * loaded, or no way to save at all).
 * @param {LoadedView | null} loaded
 * @param {ReadonlyArray<Entry>} entries  the Views menu's entries
 * @param {SaveRights} can
 * @param {boolean} [empty]  the report has no field placed
 * @returns {SaveTarget | null}
 */
export function saveTarget(loaded, entries, can, empty = false) {
    if (!loaded) {
        return null;
    }
    /** @type {SaveTarget | null} */
    let target;
    if (loaded.scope === "shared") {
        target = can.publish ? { kind: "publish" } : canSaveAs(can) ? { kind: null, why: "saveSharedLocked" } : null;
    } else if (loaded.scope === "user" && loaded.store) {
        // in its place; gone (deleted in another tab): added again, as Save as would
        const entry = storeEntry(entries, loaded.name, loaded.storeSource, loaded.storeSheet);
        target = can.store ? (entry ? { kind: "store", at: entry.at, storeSource: loaded.storeSource ?? null, storeSheet: loaded.storeSheet ?? null } : { kind: "store", storeSource: can.sourceId ?? null, storeSheet: can.sheet ?? null }) : null;
    } else if (loaded.scope === "user") {
        target = can.host ? { kind: "host" } : null;
    } else {
        target = canSaveAs(can) ? { kind: null, why: "saveNotInViews" } : null;
    }
    // an empty report is never written over a saved view
    return target && target.kind && empty ? { kind: null, why: "exportNeedsField" } : target;
}

/**
 * Where Save as writes a view named `name`, and the user's view it would replace (null: none, so
 * nothing to ask): the host's own view of that name when the host takes the saves, else the browser
 * store's for this data (or saved without named data).
 * @template {Entry} T
 * @param {string} name
 * @param {ReadonlyArray<T>} entries
 * @param {SaveRights} can
 * @returns {SaveWrite & { replaces: T | null }}
 */
export function saveAsTarget(name, entries, can) {
    if (can.host) {
        return { kind: "host", replaces: entries.find((t) => t.scope === "user" && t.at === undefined && t.name === name) ?? null };
    }
    const old = /** @type {T | undefined} */ (storeEntry(entries, name, can.sourceId, can.sheet) ?? storeEntry(entries, name, null, null));
    return old ? { kind: "store", at: old.at, storeSource: old.sourceId ?? null, storeSheet: old.sheet ?? null, replaces: old } : { kind: "store", storeSource: can.sourceId ?? null, storeSheet: can.sheet ?? null, replaces: null };
}
