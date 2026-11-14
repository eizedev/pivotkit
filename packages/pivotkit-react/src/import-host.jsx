/*
 * The import UI's part of the report: what the report renders through it once it is loaded (the file
 * input, the drop overlay, the dialog of the file being read, the Data menu's panel, the source line)
 * and what a file picked or dropped starts. The report keeps only its state and hands it in as one
 * object (`ImportApi`), so its first load holds no more than the Data button, the drop handler and the
 * state; everything here loads on first use (lazy-import.jsx).
 */

import React from "react";
import { DataPanel, DropOverlay, ImportDialog, SourceLine as Line } from "./import-ui.jsx";
import { importLabels } from "./import-labels.js";
import { acceptOf } from "./import-run.js";
import { backToOriginal, loadData } from "./import-steps.js";
import { useFormName } from "./dom.js";

/**
 * @typedef {import("./import-steps.js").ImportContext & {
 *   job: ImportJob | null, setJob: React.Dispatch<React.SetStateAction<ImportJob | null>>,
 *   dismiss?: (id: number) => void,
 *   dragging: boolean, encoded: import("pivotkit-core").Encoded, sourceName: string | undefined,
 *   plugins: any[], worker?: () => Worker, limits?: object, timeZone?: string,
 *   box: () => DOMRect | undefined, pick: () => void }} ImportApi
 *   `box`: the report's box on screen; `pick`: clicks the file input (ImportLayer's `input`)
 * @typedef {{ file: File, n: number, sheet?: string, auto?: boolean, done?: (loaded: boolean) => void }} ImportJob
 *   a file being read: `sheet` and `auto` as ImportDialog's job; `done` is told whether it was loaded
 */

let jobs = 0;

/**
 * The error notes of loading data each report shows (by its `dismiss`, one per report): a new file
 * closes them, so a note about an earlier file never stands next to the next one's.
 * @type {WeakMap<Function, number[]>}
 */
const shownErrors = new WeakMap();

/**
 * An error note of loading data, kept to be closed when the next file comes.
 * @param {ImportApi} api
 * @param {string} text
 */
function sayError(api, text) {
    const id = api.announce(text, { tone: "error" });
    if (typeof id === "number" && typeof api.dismiss === "function") {
        shownErrors.set(api.dismiss, [...(shownErrors.get(api.dismiss) ?? []), id]);
    }
}

/**
 * Files picked or dropped: one opens its preview, more than one is said to be too many. The error
 * notes of earlier files go.
 * @param {ImportApi} api
 * @param {File[]} files
 */
export function startFiles(api, files) {
    closeErrors(api);
    if (files.length === 1) {
        api.setJob({ file: files[0], n: ++jobs });
    } else if (files.length > 1) {
        sayError(api, importLabels(api.labels).dropOne);
    }
}

/**
 * Reads another sheet of the file shown and loads it at once (a saved view made on that sheet was
 * opened, sheet-views.js): the dialog shows the progress and has Cancel, a sheet that cannot be read
 * says why there. `done` is told whether the sheet was loaded (Cancel, a failure and a host's refusal
 * are not).
 * @param {ImportApi} api
 * @param {string} sheet
 * @param {(loaded: boolean) => void} done
 */
export function loadSheet(api, sheet, done) {
    const file = api.imported?.blob;
    if (!file) {
        done(false);
        return;
    }
    closeErrors(api);
    api.setJob({ file, n: ++jobs, sheet, auto: true, done });
}

/** Closes the error notes of earlier files. @param {ImportApi} api */
function closeErrors(api) {
    const dismiss = api.dismiss;
    if (typeof dismiss === "function") {
        (shownErrors.get(dismiss) ?? []).forEach((id) => dismiss(id));
        shownErrors.delete(dismiss);
    }
}

/**
 * Opens the browser's file picker: the report's hidden file input.
 * @param {HTMLInputElement | null} input
 */
export function pickFile(input) {
    if (input) {
        input.value = "";
        input.click();
    }
}

/**
 * The file input, the overlay while a file is dragged over the report, the dialog of the file read.
 * @param {{ api: ImportApi, input: React.MutableRefObject<HTMLInputElement | null> }} props
 */
export function ImportLayer({ api, input }) {
    const name = useFormName();
    const job = api.job;
    return (
        <>
            <input
                ref={input}
                type="file"
                name={name}
                hidden
                tabIndex={-1}
                aria-hidden="true"
                accept={acceptOf(api.plugins)}
                onChange={(e) => startFiles(api, [...(e.target.files ?? [])])}
                data-testid="file-input"
            />
            {api.dragging ? <DropOverlay labels={api.labels} locale={api.locale} plugins={api.plugins} box={api.box} /> : null}
            {job ? (
                <ImportDialog
                    key={job.n}
                    job={job}
                    labels={api.labels}
                    locale={api.locale}
                    plugins={api.plugins}
                    worker={api.worker}
                    limits={api.limits}
                    timeZone={api.timeZone}
                    announce={(text, extra) => (extra?.tone === "error" ? sayError(api, text) : api.announce(text, extra))}
                    // only this dialog's job: a file dropped meanwhile has its own
                    onClose={() => {
                        api.setJob((j) => (j === job ? null : j));
                        job.done?.(false);
                    }}
                    onApply={(loaded) => {
                        const ok = loadData(api, loaded);
                        api.setJob((j) => (j === job ? null : j));
                        job.done?.(ok);
                    }}
                />
            ) : null}
        </>
    );
}

/**
 * The Data menu's panel.
 * @param {{ api: ImportApi, close: () => void }} props
 */
export function DataMenuPanel({ api, close }) {
    const source = { name: api.sourceName ?? null, rows: api.encoded.length, columns: api.encoded.schema.fields.length, imported: Boolean(api.imported) };
    return <DataPanel labels={api.labels} locale={api.locale} source={source} plugins={api.plugins} close={close} onPick={api.pick} onBack={() => backToOriginal(api)} />;
}

/** Under the result while a file's data is shown. @param {{ api: ImportApi }} props */
export function SourceLine({ api }) {
    return api.imported ? <Line labels={api.labels} source={{ name: api.imported.source.name, sheet: api.imported.sheet }} /> : null;
}
