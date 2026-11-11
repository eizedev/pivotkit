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
 *   job: { file: File, n: number } | null, setJob: (job: { file: File, n: number } | null) => void,
 *   dragging: boolean, encoded: import("pivotkit-core").Encoded, sourceName: string | undefined,
 *   plugins: any[], worker?: () => Worker, limits?: object, timeZone?: string,
 *   box: () => DOMRect | undefined, pick: () => void }} ImportApi
 *   `box`: the report's box on screen; `pick`: clicks the file input (ImportLayer's `input`)
 */

let jobs = 0;

/**
 * Files picked or dropped: one opens its preview, more than one is said to be too many.
 * @param {ImportApi} api
 * @param {File[]} files
 */
export function startFiles(api, files) {
    if (files.length === 1) {
        api.setJob({ file: files[0], n: ++jobs });
    } else if (files.length > 1) {
        api.announce(importLabels(api.labels).dropOne, { tone: "error" });
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
            {api.job ? (
                <ImportDialog
                    key={api.job.n}
                    job={api.job}
                    labels={api.labels}
                    locale={api.locale}
                    plugins={api.plugins}
                    worker={api.worker}
                    limits={api.limits}
                    timeZone={api.timeZone}
                    announce={api.announce}
                    onClose={() => api.setJob(null)}
                    onApply={(loaded) => {
                        loadData(api, loaded);
                        api.setJob(null);
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
