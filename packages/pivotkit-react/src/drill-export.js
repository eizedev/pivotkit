/*
 * The drill-down panel's exports: the rows it shows on the clipboard (as the panel shows them,
 * tab-separated with a header row, or as JSON objects with the data's field names and raw values) or
 * as a file (CSV, Excel: pivotkit-core/export's rows exporters, each value as the panel shows it).
 * Each holds the rows the panel shows: with more rows behind the value than the drill-down's limit,
 * the first of them, and the note says so ("1,000 of 4,212 rows"). The file and sheet name is the
 * cell's path ("Central – Jul 2026"). Loaded with the menus.
 */

import { decodeRow } from "./drill.js";
import { safeFileName } from "./files.js";
import { fill, messageOf, plural } from "./labels.js";
import { XLSX_TYPE, copyOut, deliver, exportersNow, loadExporters } from "./export-run.js";

/** @typedef {"drill-copy" | "drill-json" | "drill-csv" | "drill-xlsx"} DrillExportKind */

/**
 * What the export holds, in words: "4 rows", or "1,000 of 4,212 rows" when the panel shows the first
 * of more.
 * @param {{ shown: number, count: number }} part
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} locale
 */
export function rowsText({ shown, count }, labels, locale) {
    return shown < count
        ? fill(labels.drillPart, { shown: shown.toLocaleString(locale), count: count.toLocaleString(locale) })
        : plural(labels.drillCount, count, { lang: labels.lang, locale });
}

/**
 * @param {DrillExportKind} kind
 * @param {{ drill: { name: string, count: number, locale: string, indices: ArrayLike<number>, formats: Record<string, string>,
 *     columns: Array<{ name: string, label?: string }>, rows: string[][] },
 *   encoded: import("pivotkit-core").Encoded, labels: import("./labels.js").UiLabels,
 *   onExport?: (file: import("./export-run.js").ExportFile) => unknown,
 *   announce: (text: string, extra?: { tone?: "error" }) => void, root: HTMLElement | null }} context
 */
export async function exportDrill(kind, { drill, encoded, labels, onExport, announce, root }) {
    const { locale } = drill;
    const part = { shown: drill.rows.length, count: drill.count };
    const rows = rowsText(part, labels, locale);
    const base = safeFileName(drill.name);
    try {
        const m = exportersNow() ?? (await loadExporters());
        if (kind === "drill-copy" || kind === "drill-json") {
            const json = kind === "drill-json";
            const text = json
                ? JSON.stringify(Array.from(drill.indices, (i) => decodeRow(encoded, i)), null, 2)
                : m.toTsv([drill.columns.map((c) => c.label ?? c.name), ...drill.rows]);
            const done = await copyOut(text, { kind, fileName: `${base}.${json ? "json" : "tsv"}`, type: json ? "application/json" : "text/tab-separated-values", container: root, onExport, rows: part });
            if (done !== "kept") {
                announce(done === "copied" ? fill(json ? labels.drillCopiedJson : labels.drillCopied, { rows }) : labels.toastCopyBlocked, done === "copied" ? undefined : { tone: "error" });
            }
            return;
        }
        const xlsx = kind === "drill-xlsx";
        // the headers as the panel shows them, yes/no in the report's words
        const fields = Object.fromEntries(drill.columns.map((c) => [c.name, c.label ?? c.name]));
        const options = { locale, formats: drill.formats, labels: { fields, true: labels.core.true, false: labels.core.false } };
        const file = `${base}.${xlsx ? "xlsx" : "csv"}`;
        const bytes = xlsx ? m.rowsToXlsx(encoded, drill.indices, { ...options, sheetName: drill.name }) : m.rowsToCsvBytes(encoded, drill.indices, options);
        const blob = new Blob([/** @type {BlobPart} */ (bytes)], { type: xlsx ? XLSX_TYPE : "text/csv;charset=utf-8" });
        if (deliver(blob, { kind, fileName: file, doc: root?.ownerDocument, onExport, rows: part })) {
            announce(fill(labels.drillExported, { file, rows }));
        }
    } catch (e) {
        announce(fill(labels.toastExportFailed, { message: messageOf(e) }), { tone: "error" });
    }
}
