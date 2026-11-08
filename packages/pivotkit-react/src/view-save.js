/*
 * Where Save and Save as write in the Views menu (toolbar-panels.jsx), from the view loaded and what
 * the host allows. Pure, tested without a DOM; loads with the menus.
 *
 * - Save writes the loaded view under its name: a view of the browser store in its place, a user's
 *   view of the host through onSaveTemplate (scope "user"), a shared view through onPublishTemplate
 *   when the user may publish. A shared view the user may not change, and a view from a file or a
 *   link (not among the saved views), say why Save is off.
 * - Save as writes a user's view under a new name: through onSaveTemplate when the host takes the
 *   saves, else into the browser store. A name that exists there asks before it is replaced.
 */

/**
 * @typedef {{ name: string, scope: "user" | "shared" | null, store: boolean }} LoadedView  the view
 *   loaded: its name, its group (null: a file or a link) and whether the browser store keeps it
 * @typedef {{ host: boolean, store: boolean, publish: boolean }} SaveRights  onSaveTemplate is set,
 *   the browser store is on, the user may publish (canPublish with onPublishTemplate)
 * @typedef {{ kind: "store", at?: number } | { kind: "host" } | { kind: "publish" } | { kind: null, why: "saveSharedLocked" | "saveNotInViews" }} SaveTarget
 *   `at`: the place in the browser store to write over (none: the view is gone, it is added again);
 *   `why`: the label that says why Save is off
 */

/** Whether Save as can write anywhere. @param {SaveRights} can */
export const canSaveAs = (can) => can.host || can.store;

/**
 * Where Save writes the loaded view; null when there is no Save to offer (nothing loaded, or no way to
 * save at all).
 * @param {LoadedView | null} loaded
 * @param {ReadonlyArray<{ name: string, scope: string, at?: number }>} entries  the Views menu's entries
 * @param {SaveRights} can
 * @returns {SaveTarget | null}
 */
export function saveTarget(loaded, entries, can) {
    if (!loaded) {
        return null;
    }
    if (loaded.scope === "shared") {
        return can.publish ? { kind: "publish" } : canSaveAs(can) ? { kind: null, why: "saveSharedLocked" } : null;
    }
    if (loaded.scope === "user" && loaded.store) {
        const at = entries.find((t) => t.at !== undefined && t.name === loaded.name)?.at;
        return can.store ? { kind: "store", ...(at !== undefined ? { at } : {}) } : null;
    }
    if (loaded.scope === "user") {
        return can.host ? { kind: "host" } : null;
    }
    return canSaveAs(can) ? { kind: null, why: "saveNotInViews" } : null;
}

/**
 * The user's view Save as would replace: one of the same name where Save as writes (the host's own
 * views when it takes the saves, else the browser store's), or null.
 * @template {{ name: string, scope: string, at?: number }} T
 * @param {string} name
 * @param {ReadonlyArray<T>} entries
 * @param {SaveRights} can
 * @returns {T | null}
 */
export function saveAsConflict(name, entries, can) {
    if (!canSaveAs(can)) {
        return null;
    }
    return entries.find((t) => t.scope === "user" && t.name === name && (can.host ? t.at === undefined : t.at !== undefined)) ?? null;
}
