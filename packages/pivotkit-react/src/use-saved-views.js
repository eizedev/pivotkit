/*
 * The saved views: the host's `templates`, and with templateStore="browser" the user's own in
 * localStorage under the storageKey, read after hydration as the tips are (their entries are read with
 * the menus' module, view-store.js). Which saved view is shown travels with each step of the history
 * (history.tag, view-save.js's LoadedView), and each saved view as it was loaded or saved is kept
 * (savedKeys, use-shown-data.js), so the toolbar shows when the view shown has unsaved changes.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { localStore, readItem, subscribeItem, writeItem } from "./storage.js";
import { templateEntries, viewsName } from "./templates.js";
import { savedKeyOf } from "./use-shown-data.js";
import { tagFor } from "./view-history.js";

/**
 * @param {import("./index.js").PivotReportProps} props
 * @param {{ menus: typeof import("./menus.js") | null, shown: ReturnType<typeof import("./use-shown-data.js").useShownData>,
 *   history: any, view: import("pivotkit-core").View, empty: boolean, locale: string, announce: (text: string) => void,
 *   latest: React.MutableRefObject<{ history: any }>, noteSaved: () => void }} report  latest: the report after its
 *   last render; noteSaved: tells the tips the view was saved
 */
export function useSavedViews(props, { menus, shown, history, view, empty, locale, announce, latest, noteSaved }) {
    const { templates = [], templateStore, storageKey, onSaveTemplate, onDeleteTemplate, onPublishTemplate, canPublish = false } = props;
    const { sourceId, sourceName, sourceParams, sheet, sheets, savedKeys, remember } = shown;
    const viewStore = templateStore === "browser";
    const storeName = viewsName(storageKey);
    const subscribeViews = useCallback((callback) => (viewStore ? subscribeItem(storeName, callback) : () => {}), [viewStore, storeName]);
    const viewsText = useSyncExternalStore(subscribeViews, () => (viewStore ? readItem(storeName, localStore()) : null), () => null);
    const entries = useMemo(
        () => templateEntries(templates, viewStore && menus ? menus.storedViews(viewsText, sourceId, { sheet, sheets }) : [], Boolean(onDeleteTemplate)),
        [templates, viewStore, menus, viewsText, sourceId, sheet, sheets, onDeleteTemplate]
    );
    // the saved view shown: the history step's, when it was loaded for the data shown now (another
    // source with the same columns keeps the history, not the name)
    const loaded = tagFor(history.tag, sourceId);
    // a tip's "Save view" opens the Views menu: a new number is a new request
    const [request, setRequest] = useState(0);
    const openViews = useCallback(() => setRequest((n) => n + 1), []);
    // what the Views menu needs to save, delete and publish (toolbar-panels.jsx: viewActions): the
    // host's callbacks, else the browser store; the notes come when they are kept
    const actions = {
        view: /** @type {import("pivotkit-core").View} */ (view),
        announce,
        locale,
        sourceId,
        // the sheet of a workbook shown, which a view saved into the browser store names, and the data
        // shown as the host's callbacks get it
        sheet,
        source: sourceId ? { id: sourceId, ...(sourceName ? { name: sourceName } : {}), ...(sourceParams ? { params: sourceParams } : {}) } : null,
        viewsText,
        store: viewStore,
        keep: (text) => writeItem(storeName, localStore(), text),
        onSave: onSaveTemplate,
        onDelete: onDeleteTemplate,
        onPublish: canPublish ? onPublishTemplate : undefined,
        // a view leaves the report checked against the data, never as it was stored, and in the form a
        // save hands over (the view as shown: normalized, with the host's orders), so Publish and
        // Save send the same view
        normalized: (v) => JSON.parse(history.keyOf(v)),
        loaded,
        empty,
        /**
         * A save kept: the view as it was when the save was clicked (`key`) is that saved view now. The
         * view shown takes its name only while it is still that view: a slow host may answer after
         * New, another view loaded or a change, and none of those may become the saved view.
         */
        onSaved: (/** @type {any} */ saved, /** @type {string} */ key) => {
            noteSaved();
            const tag = { ...saved, sourceId };
            remember(tag, key);
            const now = latest.current.history;
            if (now.viewKey === key) {
                now.setTag(tag);
            }
        },
        viewKey: history.viewKey
    };
    return {
        entries,
        actions,
        // whether the user can save at all (a tip offers it)
        canSave: Boolean(onSaveTemplate) || viewStore,
        name: loaded?.name ?? null,
        // for the toolbar: the saved view shown, and whether the view shown differs from it
        toolbar: loaded ? { name: loaded.name, changed: savedKeys[savedKeyOf(loaded)] !== history.viewKey } : null,
        request,
        openViews
    };
}
