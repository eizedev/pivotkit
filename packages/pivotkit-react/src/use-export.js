/*
 * Export of the report: the table as an Excel workbook or a CSV file (pivotkit-core/export, loaded on
 * first use), the chart as a PNG image. The file name is the host's fileName made safe (files.js).
 */

import { toGrid } from "pivotkit-core";
import { dataUrlToBlob, safeFileName, saveBlob } from "./files.js";
import { fill, messageOf } from "./labels.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * @param {{ fileName: string, result: import("pivotkit-core").PivotResult | null, locale: string,
 *   labels: import("./labels.js").UiLabels, limits: object | undefined, root: React.RefObject<HTMLElement | null>,
 *   chartRef: React.RefObject<any>, announce: (text: string, extra?: { tone?: "error" }) => void }} options
 * @returns {(kind: "xlsx" | "csv" | "png") => Promise<void>}
 */
export function useExport({ fileName, result, locale, labels, limits, root, chartRef, announce }) {
    return async (kind) => {
        const base = safeFileName(fileName);
        const file = `${base}.${kind}`;
        const doc = root.current?.ownerDocument ?? document;
        try {
            if (kind === "png") {
                const surface = root.current ? getComputedStyle(root.current).getPropertyValue("--pk-surface").trim() : "";
                const url = chartRef.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: surface || undefined });
                if (!url) {
                    return;
                }
                saveBlob(dataUrlToBlob(url), file, doc);
            } else {
                if (!result) {
                    return;
                }
                const { toXlsx, toCsvBytes } = await import("pivotkit-core/export");
                const grid = toGrid(result, { locale, labels: labels.core, limits });
                const bytes = kind === "xlsx" ? toXlsx(grid, { sheetName: base }) : toCsvBytes(grid, { bom: true });
                saveBlob(new Blob([/** @type {BlobPart} */ (bytes)], { type: kind === "xlsx" ? XLSX_TYPE : "text/csv;charset=utf-8" }), file, doc);
            }
            announce(fill(labels.toastExported, { file }));
        } catch (e) {
            announce(fill(labels.toastExportFailed, { message: messageOf(e) }), { tone: "error" });
        }
};
}
