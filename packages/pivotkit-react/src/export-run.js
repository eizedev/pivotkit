/*
 * The report's exports, loaded with the menus (menus.js): the table as an Excel workbook or a CSV file
 * (pivotkit-core/export, loaded on first use), the chart as a PNG image, and the table on the
 * clipboard: as the table shows it, tab-separated (a spreadsheet takes it as columns), or its data as
 * JSON. The file name is the host's fileName made safe (files.js). The host's onExport sees every file
 * and every copy first and may take it over by returning false. use-export.js calls it.
 */

import { toGrid } from "pivotkit-core";
import { copyText, dataUrlToBlob, safeFileName, saveBlob } from "./files.js";
import { fill, messageOf } from "./labels.js";
import { menuLabels } from "./menu-labels.js";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** @typedef {import("./index.js").ExportFile} ExportFile */

/** @type {typeof import("pivotkit-core/export") | null} */
let exporters = null;
/** @type {Promise<typeof import("pivotkit-core/export")> | null} */
let pending = null;

/**
 * pivotkit-core/export, imported once; a failed import is forgotten, so the next call tries again. A
 * menu that copies calls it when it opens: a copy right in the click (no import to wait for) is
 * allowed in every browser.
 */
export function loadExporters() {
    pending ??= import("pivotkit-core/export").then(
        (m) => {
            exporters = m;
            return m;
        },
        (error) => {
            pending = null;
            throw error;
        }
    );
    return pending;
}

/** The export module, at once when it is loaded. */
export const exportersNow = () => exporters;

/** Starts loading the export module (a menu that copies, when it opens); a failure waits for the click. */
export const prepareExporters = () => void loadExporters().catch(() => undefined);

/**
 * Hands the file to the host's onExport, then downloads it unless onExport returned false.
 * @returns {boolean} whether the report downloaded it
 * @param {Blob} blob
 * @param {Omit<ExportFile, "blob"> & { doc?: Document, onExport?: (file: ExportFile) => unknown }} options
 */
export function deliver(blob, { doc, onExport, ...file }) {
    if (onExport?.({ ...file, blob }) === false) {
        return false;
    }
    saveBlob(blob, file.fileName, doc);
    return true;
}

/**
 * Hands the text to the host's onExport, then puts it on the clipboard unless onExport returned
 * false.
 * @param {string} text
 * @param {Omit<ExportFile, "blob" | "text"> & { type: string, container: HTMLElement | null, onExport?: (file: ExportFile) => unknown }} options
 * @returns {Promise<"copied" | "kept" | "blocked">}  kept: the host took it; blocked: the browser refused
 */
export async function copyOut(text, { type, container, onExport, ...file }) {
    if (onExport?.({ ...file, blob: new Blob([text], { type }), text }) === false) {
        return "kept";
    }
    return (await copyText(text, container)) ? "copied" : "blocked";
}

/**
 * @typedef {{ fileName: string, result: import("pivotkit-core").PivotResult | null, locale: string,
 *   labels: import("./labels.js").UiLabels, limits: object | undefined, root: React.RefObject<HTMLElement | null>,
 *   chartRef: React.RefObject<any>, announce: (text: string, extra?: { tone?: "error" }) => void,
 *   onExport?: (file: ExportFile) => unknown }} ExportContext
 */

/**
 * One export of the Export menu.
 * @param {"xlsx" | "csv" | "png" | "copy-table" | "copy-json"} kind
 * @param {ExportContext} context
 */
export async function runExport(kind, { fileName, result, locale, labels, limits, root, chartRef, announce, onExport }) {
    // the menus' texts (the copies' notes) over the report's
    labels = menuLabels(labels);
    const base = safeFileName(fileName);
    // the page of the report (a download in a shadow root, a frame); the global one by default
    const doc = root.current?.ownerDocument;
    try {
        if (kind === "png") {
            const surface = root.current ? getComputedStyle(root.current).getPropertyValue("--pk-surface").trim() : "";
            const url = chartRef.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: surface || undefined });
            const file = `${base}.png`;
            // the host that kept the file says itself what became of it
            if (url && deliver(dataUrlToBlob(url), { kind, fileName: file, doc, onExport })) {
                announce(fill(labels.toastExported, { file }));
            }
            return;
        }
        if (!result) {
            return;
        }
        const m = exporters ?? (await loadExporters());
        const grid = toGrid(result, { locale, labels: labels.core, limits });
        if (kind === "copy-table" || kind === "copy-json") {
            const json = kind === "copy-json";
            const done = await copyOut(json ? m.toJson(grid) : m.toTsv(grid), { kind, fileName: `${base}.${json ? "json" : "tsv"}`, type: json ? "application/json" : "text/tab-separated-values", container: root.current, onExport });
            if (done !== "kept") {
                announce(done === "copied" ? (json ? labels.toastDataCopied : labels.toastTableCopied) : labels.toastCopyBlocked, done === "copied" ? undefined : { tone: "error" });
            }
            return;
        }
        const file = `${base}.${kind}`;
        const bytes = kind === "xlsx" ? m.toXlsx(grid, { sheetName: base }) : m.toCsvBytes(grid, { bom: true });
        if (deliver(new Blob([/** @type {BlobPart} */ (bytes)], { type: kind === "xlsx" ? XLSX_TYPE : "text/csv;charset=utf-8" }), { kind, fileName: file, doc, onExport })) {
            announce(fill(labels.toastExported, { file }));
        }
    } catch (e) {
        announce(fill(labels.toastExportFailed, { message: messageOf(e) }), { tone: "error" });
    }
    }
