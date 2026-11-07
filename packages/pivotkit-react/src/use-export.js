/*
 * Export of the report: the table as an Excel workbook or a CSV file (pivotkit-core/export, loaded on
 * first use), the chart as a PNG image. The file name is the host's fileName made safe (files.js).
 * The host's onExport sees every file before the download and may take it over by returning false.
 */

import { toGrid } from "pivotkit-core";
import { dataUrlToBlob, safeFileName, saveBlob } from "./files.js";
import { fill, messageOf } from "./labels.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Hands the file to the host's onExport, then downloads it unless onExport returned false.
 * @returns {boolean} whether the report downloaded it
 * @param {Blob} blob
 * @param {{ kind: "xlsx" | "csv" | "png", file: string, doc: Document, onExport?: (file: { kind: "xlsx" | "csv" | "png" | "json", fileName: string, blob: Blob }) => unknown }} options
 */
function deliver(blob, { kind, file, doc, onExport }) {
    if (onExport?.({ kind, fileName: file, blob }) === false) {
        return false;
    }
    saveBlob(blob, file, doc);
    return true;
}

/**
 * @param {{ fileName: string, result: import("pivotkit-core").PivotResult | null, locale: string,
 *   labels: import("./labels.js").UiLabels, limits: object | undefined, root: React.RefObject<HTMLElement | null>,
 *   chartRef: React.RefObject<any>, announce: (text: string, extra?: { tone?: "error" }) => void,
 *   onExport?: (file: { kind: "xlsx" | "csv" | "png" | "json", fileName: string, blob: Blob }) => unknown }} options
 * @returns {(kind: "xlsx" | "csv" | "png") => Promise<void>}
 */
export function useExport({ fileName, result, locale, labels, limits, root, chartRef, announce, onExport }) {
    return async (kind) => {
        const base = safeFileName(fileName);
        const file = `${base}.${kind}`;
        const doc = root.current?.ownerDocument ?? document;
        try {
            /** @type {boolean} */
            let downloaded;
            if (kind === "png") {
                const surface = root.current ? getComputedStyle(root.current).getPropertyValue("--pk-surface").trim() : "";
                const url = chartRef.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: surface || undefined });
                if (!url) {
                    return;
                }
                downloaded = deliver(dataUrlToBlob(url), { kind, file, doc, onExport });
            } else {
                if (!result) {
                    return;
                }
                const { toXlsx, toCsvBytes } = await import("pivotkit-core/export");
                const grid = toGrid(result, { locale, labels: labels.core, limits });
                const bytes = kind === "xlsx" ? toXlsx(grid, { sheetName: base }) : toCsvBytes(grid, { bom: true });
                downloaded = deliver(new Blob([/** @type {BlobPart} */ (bytes)], { type: kind === "xlsx" ? XLSX_TYPE : "text/csv;charset=utf-8" }), { kind, file, doc, onExport });
            }
            // the host that kept the file says itself what became of it
            if (downloaded) {
                announce(fill(labels.toastExported, { file }));
            }
        } catch (e) {
            announce(fill(labels.toastExportFailed, { message: messageOf(e) }), { tone: "error" });
        }
    };
}
