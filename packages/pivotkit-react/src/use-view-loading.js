/*
 * Views loaded from outside the history: a file, pasted JSON or a link (applyLoaded), a saved view
 * from the menu or the start screen (openTemplate), and New, the empty start screen. Each is one step
 * Undo takes back, with a status note that goes by itself and what the view left out in the area
 * above the result, which stays (use-unused-notes.js). A view that names another sheet of the
 * workbook shown waits for that sheet (viaSheet, runAfterSheet), then loads on it.
 */

import { useCallback, useEffect, useRef } from "react";
import { emptyView, normalize } from "pivotkit-core";
import { fill } from "./labels.js";
import { viewFromObject } from "./share.js";
import { unusedNotes } from "./unused-keep.js";
import { zoneOverLimit } from "./view-ops.js";

/** The sheet of a stored view loaded on another sheet (its own is gone): no entry is that view. */
const SHEET_GONE = "\u0000";

/**
 * @param {import("./index.js").PivotReportProps} props
 * @param {{ history: any, encoded: import("pivotkit-core").Encoded, limits: object | undefined, labels: any, locale: string,
 *   announce: (text: string, extra?: object) => void, sourceId: string | undefined, empty: boolean,
 *   commit: import("./use-steps.js").Commit, undoAction: () => { label: string, run: () => void },
 *   remember: (tag: any, key: string) => void, noteLoad: (notes: any[], given: object | null, said: boolean, reopen?: boolean) => void,
 *   viaSheet: (made: { id?: string | null, sheet?: string | null }, name: string, then: () => void) => "switch" | "missing" | "none",
 *   runAfterSheet: () => void }} report  runAfterSheet: runs what waited for its sheet (use-import.js), a new
 *   function when other data is shown
 */
export function useViewLoading(props, report) {
    const { history, encoded, limits, labels, locale, announce, sourceId, empty, commit, undoAction, remember, noteLoad, viaSheet, runAfterSheet } = report;
    const { sources, onSourceSwitch } = props;
    // the report as a link meets it (use-share-link.js), as it is after each render
    const latest = useRef(/** @type {import("./link-open.js").LinkReport} */ ({ history, encoded, limits, labels, announce, sourceId, loaded: /** @type {any} */ (null), sources, onSourceSwitch }));
    /**
     * A view loaded from outside (a file, pasted JSON, a link) is shown: a step Undo takes back (a link
     * read at the start is where the report starts, `restored`).
     */
    const applyLoaded = useCallback(
        /** @param {import("./share.js").LoadedView} loaded @param {{ link?: boolean, restored?: boolean }} [how] */
        (loaded, { link = false, restored = false } = {}) => {
            if (!loaded.view) {
                return;
            }
            // a file or a link names its view, which is not among the saved ones (Save is off for it)
            const tag = loaded.file?.name ? { name: loaded.file.name, scope: null, store: false, sourceId: latest.current.sourceId } : null;
            if (tag) {
                remember(tag, latest.current.history.keyOf(loaded.view));
            }
            if (restored) {
                latest.current.history.setTag(tag);
            } else {
                commit(loaded.view, { step: "viewLoaded" }, tag);
            }
            const notes = unusedNotes(loaded.issues, loaded.file?.view);
            // the status note says some parts did not fit: the warning's live region stays quiet
            noteLoad(notes, loaded.view, notes.length > 0);
            const text = link ? (notes.length ? labels.toastLinkOpenedPartly : labels.toastLinkOpened) : notes.length ? labels.toastViewLoadedPartly : labels.toastViewLoaded;
            announce(text, restored ? undefined : { action: undoAction() });
        },
        [commit, labels, announce, remember, noteLoad, undoAction]
    );
    useEffect(() => {
        latest.current = { history, encoded, limits, labels, announce, sourceId, loaded: applyLoaded, sources, onSourceSwitch };
    });
    const loadTemplate = useCallback(
        (t) => {
            // which saved view this is: its group, the browser store's entry (by its name, the data and
            // the sheet it names), and the data it was loaded for
            const tag = { name: t.name, scope: t.scope === "user" ? "user" : "shared", store: t.at !== undefined, storeSource: t.sourceId ?? null, storeSheet: t.sheet ?? null, sourceId };
            remember(tag, history.keyOf(t.view));
            commit(t.view, { step: "template", name: t.name }, tag);
            // a saved view made with other limits loads with the fields that fit: what was left out
            // goes into the area above the result, the note says it was loaded
            const over = zoneOverLimit(t.view, limits);
            // what else of it the data cannot use (a field that is gone, a setting this version lacks);
            // a zone over the limit is said in its own words above
            const issues = normalize(t.view, encoded, { limits }).issues.filter((i) => !over || i.code !== "tooMany");
            noteLoad([...(over ? [{ text: fill(labels.viewTrimmed, { name: t.name, zone: labels.zones[over.zone], max: over.max.toLocaleString(locale) }), path: over.zone }] : []), ...unusedNotes(issues, t.view)], t.view, false);
            announce(fill(labels.toastLoaded, { name: t.name }));
        },
        [commit, labels, announce, limits, locale, history, remember, sourceId, encoded, noteLoad]
    );
    // the view that waited for its sheet, once that sheet is shown (this render's loadTemplate and data)
    const loadLater = useRef(/** @type {((what: { template?: any, file?: object }) => void) | null} */ (null));
    useEffect(() => {
        loadLater.current = ({ template, file }) => {
            if (template) {
                loadTemplate(template);
            } else if (file) {
                applyLoaded(viewFromObject(file, encoded, { limits, sourceId }));
            }
        };
        runAfterSheet();
    }, [loadTemplate, encoded, limits, sourceId, applyLoaded, runAfterSheet]);
    return {
        latest,
        applyLoaded,
        /** A view file that names another sheet of the workbook shown reads that sheet first (share-actions.js). */
        fileViaSheet: (made, name, file) => viaSheet(made, name, () => loadLater.current?.({ file })),
        /** A saved view chosen in the menu or on the start screen: on its sheet of the workbook first. */
        openTemplate: (t) => {
            const how = viaSheet({ id: t.sourceId ?? t.sheetOf, sheet: t.sheet }, t.name, () => loadLater.current?.({ template: t }));
            if (how !== "switch") {
                // on a sheet it was not made for, the view is not that saved view: Save adds one for
                // this sheet instead of moving the saved one here
                loadTemplate(how === "missing" ? { ...t, sheet: SHEET_GONE } : t);
            }
        },
        /** New: an empty report (the start screen), one step Undo takes back; the loaded view's name goes. */
        newReport: () => {
            if (empty) {
                return;
            }
            commit(emptyView(), { step: "new" }, null);
            noteLoad([], null, false, false);
            announce(labels.newEmpty, { action: undoAction() });
        }
    };
}
