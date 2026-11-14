/*
 * What the report does when the data shown changes through the import UI: a file loaded, the host's
 * data shown again, Undo or Redo of one of those steps (data-history.js), and a file's data a report
 * mounted again shows where it was (data-keep.js). Each tells the host
 * (onDataLoad: a load can be refused, the others are reported), records the step and says what
 * happened in a status note with Undo. The report hands in its state and setters (`ImportContext`);
 * loaded with the import UI, so the first load holds none of it.
 */

import { hostHistory, pushData, redoData, undoData } from "./data-history.js";
import { importLabels } from "./import-labels.js";
import { fill, messageOf, plural } from "./labels.js";

/**
 * @typedef {object} ShownData  a loaded file's data as the report keeps it
 * @property {number} key  names the data set for the view history (use-view-history.js: dataKey)
 * @property {import("pivotkit-core").Encoded} encoded
 * @property {{ id: string, name: string }} source
 * @property {string | null} sheet
 * @property {readonly string[]} [sheets]  the workbook's sheets (names)
 * @property {File} [blob]  the file, to read another of its sheets
 * @property {{ name: string, size: number, type: string }} file
 *
 * @typedef {object} ImportContext
 * @property {ShownData | null} imported  the file's data shown, null for the host's
 * @property {import("./data-history.js").DataSteps} steps
 * @property {(steps: import("./data-history.js").DataSteps) => void} setSteps
 * @property {(data: ShownData | null) => void} setImported
 * @property {{ snapshot: () => any, replace: (state: any) => void }} history
 * @property {import("pivotkit-core").Encoded} hostEncoded  the host's data
 * @property {{ id: string, name?: string } | undefined} hostSource  the host's `source`
 * @property {((detail: DataLoad) => unknown) | undefined} onDataLoad
 * @property {any} labels
 * @property {string} locale
 * @property {(text: string, extra?: { action?: { label: string, run: () => void }, tone?: "error" }) => void} announce
 * @property {() => void} undo  the report's Undo, for the status note's action
 *
 * @typedef {object} DataLoad  what onDataLoad gets
 * @property {"load" | "original" | "undo" | "redo" | "restore"} cause  a file loaded (refuse it with false), the host's data shown again, Undo or Redo of one of those, or a file's data shown again by a report mounted again (data-keep.js)
 * @property {{ id?: string, name?: string } | null} source  the data shown now: the file's (its id names its saved views), or the host's `source`
 * @property {{ name: string, size: number, type: string } | null} file  the file, for "load" and when a step shows a file's data
 * @property {string | null} sheet  the sheet of a workbook
 * @property {number} rows
 * @property {Array<{ name: string, type: string }>} columns
 * @property {Array<{ code: string, params: Record<string, unknown>, message: string }>} notes  the readers' notes ("load" only)
 */

/** What the host is told about the data shown: a file's, or its own (null). */
function describe(ctx, data, cause, notes = []) {
    const encoded = data ? data.encoded : ctx.hostEncoded;
    return /** @type {DataLoad} */ ({
        cause,
        source: data ? { ...data.source } : ctx.hostSource ? { ...ctx.hostSource } : null,
        file: data ? { ...data.file } : null,
        sheet: data ? data.sheet : null,
        rows: encoded.length,
        columns: encoded.schema.fields.map((f) => ({ name: f.name, type: f.type })),
        notes
    });
}

let keys = 0;

/**
 * Tells the host (onDataLoad). Whatever the host's code throws stays the host's: for a load it
 * refuses the file and says why; for the steps that have happened already it is reported to the
 * page (an error a moment later, outside the report), and the step stands. Only `false` itself
 * refuses: a promise is not waited for.
 * @param {ImportContext} ctx
 * @param {DataLoad} detail
 * @returns {{ refused: boolean, error?: unknown }}
 */
function tell(ctx, detail) {
    try {
        return { refused: ctx.onDataLoad?.(detail) === false };
    } catch (error) {
        if (detail.cause !== "load") {
            setTimeout(() => {
                throw error;
            }, 0);
        }
        return { refused: true, error };
    }
}

/**
 * "Load data" in the preview: the host may refuse it (onDataLoad returns false); else the file's data
 * is shown, a step Undo takes back. Returns whether it was loaded.
 * @param {ImportContext} ctx
 * @param {import("./import-ui.jsx").LoadedData} loaded
 */
export function loadData(ctx, loaded) {
    const data = { key: ++keys, encoded: loaded.encoded, source: loaded.source, sheet: loaded.sheet, sheets: loaded.sheets, blob: loaded.blob, file: loaded.file };
    const t = importLabels(ctx.labels);
    const told = tell(ctx, describe(ctx, data, "load", loaded.notes));
    if (told.refused) {
        if (told.error !== undefined) {
            ctx.announce(fill(t.refused, { name: loaded.source.name, message: messageOf(told.error) }), { tone: "error" });
        }
        return false;
    }
    const where = { lang: ctx.labels.lang, locale: ctx.locale };
    ctx.setSteps(pushData(ctx.steps, { data: ctx.imported, history: ctx.history.snapshot() }, fill(t.stepLoaded, { name: loaded.source.name })));
    ctx.setImported(data);
    ctx.announce(fill(t.loaded, { name: loaded.source.name, rows: plural(t.rows, loaded.rows, where), columns: plural(t.columns, loaded.columns.length, where) }), { action: { label: ctx.labels.undo, run: ctx.undo } });
    return true;
}

/**
 * "Back to original data": the host's data with the view it had when it was left (its own steps
 * stay behind: Undo brings the file back first), a step Undo takes back.
 * @param {ImportContext} ctx
 */
export function backToOriginal(ctx) {
    if (!ctx.imported) {
        return;
    }
    const t = importLabels(ctx.labels);
    const kept = hostHistory(ctx.steps);
    ctx.setSteps(pushData(ctx.steps, { data: ctx.imported, history: ctx.history.snapshot() }, t.backToOriginal));
    ctx.setImported(null);
    if (kept) {
        ctx.history.replace({ ...kept, past: [], future: [] });
    }
    tell(ctx, describe(ctx, null, "original"));
    ctx.announce(t.originalShown, { action: { label: ctx.labels.undo, run: ctx.undo } });
}

/**
 * Undo (`back`) or Redo of a data step: the data and view history it kept. The note of the step, or
 * null when there is none.
 * @param {ImportContext} ctx
 * @param {boolean} back
 * @returns {string | null}
 */
export function moveData(ctx, back) {
    const moved = (back ? undoData : redoData)(ctx.steps, { data: ctx.imported, history: ctx.history.snapshot() });
    if (!moved) {
        return null;
    }
    ctx.setSteps(moved.steps);
    ctx.setImported(moved.step.data);
    ctx.history.replace(moved.step.history);
    tell(ctx, describe(ctx, moved.step.data, back ? "undo" : "redo"));
    return moved.step.note;
}

/**
 * A report mounted again shows the file's data it kept (data-keep.js): the host is told, as for the
 * other steps, so a host that follows the data shown (and controls the view) knows the view that
 * comes next is the file's.
 * @param {ImportContext} ctx
 */
export function restoreData(ctx) {
    if (ctx.imported) {
        tell(ctx, describe(ctx, ctx.imported, "restore"));
    }
}
