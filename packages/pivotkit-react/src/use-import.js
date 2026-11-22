/*
 * Loading data in the browser (allowImport). The import UI (import-host.jsx) loads on first use (the
 * Data menu, a file dragged over the report, the empty report's button) and renders the file input,
 * the drop overlay and the preview; "Load data" there replaces the data shown (import-steps.js). The
 * report keeps only the state, which the import UI works on through one object (`api`, ImportApi):
 * useImport holds that state, useImportApi builds the object once the report's other parts are there.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { importNow, loadImport } from "./lazy-import.js";

/**
 * @param {object | null} imported  the file's data shown (use-shown-data.js), null for the host's
 */
export function useImport(imported) {
    // the file being read (the import dialog), a file dragged over the report
    const [job, setJob] = useState(/** @type {import("./import-host.jsx").ImportJob | null} */ (null));
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const [mod, setMod] = useState(importNow);
    const fileInput = useRef(/** @type {HTMLInputElement | null} */ (null));
    // what waits for another sheet of the file shown to be read (a view made on it, viaSheet below):
    // it runs once that sheet's data is shown (runAfterSheet)
    const afterSheet = useRef(/** @type {(() => void) | null} */ (null));
    /** Runs what waited for its sheet, once a file's data is shown (use-view-loading.js). */
    const runAfterSheet = useCallback(() => {
        const run = afterSheet.current;
        if (run && imported) {
            afterSheet.current = null;
            run();
        }
    }, [imported]);
    // the import UI's view of the report (useImportApi), for the steps an event starts
    const apiNow = useRef(/** @type {any} */ (null));
    // rendered at once: the empty report's "Load data…" clicks the file input the module renders
    const load = useCallback(() => loadImport().then((m) => (flushSync(() => setMod(() => m)), m)), []);
    /** A file dragged over the report and dropped: counted in and out of its parts, then read. */
    const fileDrag = (/** @type {React.DragEvent} */ e) => {
        if (!Array.prototype.includes.call(e.dataTransfer?.types ?? [], "Files")) {
            return;
        }
        e.preventDefault();
        const files = e.type === "drop" ? [...e.dataTransfer.files] : null;
        dragDepth.current = files ? 0 : Math.max(0, dragDepth.current + (e.type === "dragenter" ? 1 : e.type === "dragleave" ? -1 : 0));
        setDragging(dragDepth.current > 0);
        if (e.type !== "dragover") {
            load().then((m) => files && m.startFiles(apiNow.current, files), () => undefined);
        }
    };
    return {
        mod,
        job,
        setJob,
        dragging,
        fileInput,
        runAfterSheet,
        load,
        /** What waits for another sheet of the file to be read (the import UI's openOnSheet). */
        afterData: (/** @type {(() => void) | null} */ run) => void (afterSheet.current = run),
        /** The import UI's view of the report from this render on (useImportApi). */
        keepApi: (/** @type {any} */ api) => void (apiNow.current = api),
        fileDrag,
        /** Undo (true) or Redo of a data step, once the import UI is loaded. */
        moveData: mod ? (/** @type {boolean} */ back) => mod.moveData(apiNow.current, back) : null,
        /**
         * A view that names another sheet of the workbook shown is opened on that sheet (the import
         * UI's openOnSheet, sheet-views.js): "switch" when reading that sheet started (`then` runs once
         * its data is shown), "missing" when the workbook has no such sheet (said; the view loads on
         * the sheet shown), else "none". A file's data is shown only through the import UI, so it is
         * loaded then.
         * @param {{ id?: string | null, sheet?: string | null }} made  the data and sheet the view names
         * @param {string} name  the view's name, for the note when the sheet is gone
         * @param {() => void} then
         * @returns {"switch" | "missing" | "none"}
         */
        viaSheet: (made, name, then) => (imported && mod ? mod.openOnSheet(apiNow.current, made, name, then) : "none"),
        /** The empty report's "Load data…": the file input, once the import UI is here. */
        pickLater: (/** @type {() => void} */ failed) => load().then((m) => m.pickFile(fileInput.current), failed)
    };
}

/**
 * What the import UI works on: this render's state, its setters and the props it needs.
 * @param {ReturnType<typeof useImport>} imp
 * @param {any} report  the parts of the report it reads (ImportApi in import-host.jsx)
 */
export function useImportApi(imp, report) {
    const api = {
        ...report,
        job: imp.job,
        setJob: imp.setJob,
        dragging: imp.dragging,
        pick: () => imp.mod?.pickFile(imp.fileInput.current),
        load: imp.load,
        afterData: imp.afterData
    };
    const { keepApi } = imp;
    useEffect(() => {
        keepApi(api);
    });
    return api;
}
