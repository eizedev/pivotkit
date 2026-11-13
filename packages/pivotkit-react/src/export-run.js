/*
 * The report's exports, loaded with the menus (menus.js): the table as an Excel workbook (its colour
 * scales and data bars in the theme's colours where the view names none) or a CSV file
 * (pivotkit-core/export, loaded on first use), the chart as a PNG image, an HTML report, the chart as
 * SVG and the HTML report printed (pivotkit-report with ECharts' SVG renderer, report-run.js, loaded on
 * first use), and the table on the clipboard: as the table shows it, tab-separated (a spreadsheet
 * takes it as columns), or its data as JSON. The file name is the host's fileName made safe
 * (files.js). The host's onExport sees every file, every copy and the report before it is printed
 * first and may take it over by returning false. use-export.js calls it.
 */

import { toGrid } from "pivotkit-core";
import { copyText, dataUrlToBlob, safeFileName, saveBlob } from "./files.js";
import { printHtml } from "./print-frame.js";
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

/** @type {Promise<[typeof import("./report-run.js"), any]> | null} */
let reportPending = null;

/**
 * pivotkit-report with ECharts (the report's chart parts, through the first load's loader, and the SVG
 * renderer), imported once; a failed import is forgotten, so the next call tries again.
 * @param {() => Promise<any>} loadECharts  chart.jsx's: dist/echarts.js is a file next to dist/index.js
 */
function loadReport(loadECharts) {
    reportPending ??= Promise.all([import("./report-run.js"), loadECharts()]).catch((error) => {
        reportPending = null;
        throw error;
    });
    return reportPending;
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
 * A CSS colour as "#rrggbb", or null: through a canvas's fillStyle, which writes an opaque sRGB colour
 * that way whatever syntax it was given (a name, rgb(), hsl()). A colour the canvas does not take
 * leaves fillStyle as it was, so it is set over two different colours and must give the same.
 * @param {string} text
 * @param {{ fillStyle: unknown } | null} ctx  a 2D context
 */
export function hexColor(text, ctx) {
    if (!text || !ctx) {
        return null;
    }
    const read = (/** @type {string} */ before) => {
        ctx.fillStyle = before;
        ctx.fillStyle = text;
        return String(ctx.fillStyle).toLowerCase();
    };
    const hex = read("#000000");
    return hex === read("#ffffff") && /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

/**
 * The colours of the theme the workbook gets for a conditional format whose view names none, as the
 * report resolves its tokens: the colour scale (--pk-scale-low, the host's --pk-scale-mid, -high) and
 * the data bars (--pk-chart-1). Each one missing or not a colour stays pivotkit-core's default.
 * @param {{ getPropertyValue(name: string): string }} style  getComputedStyle of the report's root
 * @param {(text: string) => string | null} toHex
 * @returns {{ colorScale?: string[], dataBar?: string }}
 */
export function xlsxThemeOf(style, toHex) {
    const [low, mid, high, bar] = ["--pk-scale-low", "--pk-scale-mid", "--pk-scale-high", "--pk-chart-1"].map((name) => toHex(style.getPropertyValue(name).trim()));
    return {
        ...(low && high ? { colorScale: mid ? [low, mid, high] : [low, high] } : {}),
        ...(bar ? { dataBar: bar } : {})
    };
}

/**
 * The theme of the workbook from the report's root. A dark report gives none: a workbook is light,
 * with Excel's black text, so it keeps pivotkit-core's defaults (the light theme's colours).
 * @param {HTMLElement | null} root
 */
function xlsxTheme(root) {
    const view = root?.ownerDocument.defaultView;
    if (!root || !view || root.getAttribute("data-pk-theme") === "dark") {
        return undefined;
    }
    const ctx = root.ownerDocument.createElement("canvas").getContext("2d");
    return xlsxThemeOf(view.getComputedStyle(root), (text) => hexColor(text, ctx));
}

/**
 * @typedef {{ fileName: string, result: import("pivotkit-core").PivotResult | null, locale: string,
 *   labels: import("./labels.js").UiLabels, limits: object | undefined, root: React.RefObject<HTMLElement | null>,
 *   chartRef: React.RefObject<any>, announce: (text: string, extra?: { tone?: "error" }) => void,
 *   onExport?: (file: ExportFile) => unknown, title?: string | null, source?: string | null, loadECharts?: () => Promise<any> }} ExportContext
 *   `title`: the report's title in an HTML report (the loaded view's name); `source`: the data's name;
 *   `loadECharts`: chart.jsx's loader of dist/echarts.js (passed in: a module of the menus that
 *   imported chart.jsx would move it out of the first load into a shared chunk)
 */

/**
 * One export of the Export menu.
 * @param {"xlsx" | "csv" | "png" | "html" | "svg" | "print" | "copy-table" | "copy-json"} kind
 * @param {ExportContext} context
 */
export async function runExport(kind, { fileName, result, locale, labels, limits, root, chartRef, announce, onExport, title, source, loadECharts }) {
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
        if (kind === "html" || kind === "svg" || kind === "print") {
            const [report, echarts] = await loadReport(/** @type {() => Promise<any>} */ (loadECharts));
            const chart = chartRef.current;
            // the chart's size on the screen, when it is drawn
            const size = chart ? { width: clampSize(chart.getWidth()), height: clampSize(chart.getHeight()) } : undefined;
            const rendered = await report.render(result.view, result.encoded, {
                format: kind === "svg" ? "svg" : "html",
                echarts,
                locale,
                trusted: true,
                labels: labels.core,
                ...(limits ? { limits } : {}),
                timeZone: result.timeZone,
                ...(title ? { title } : {}),
                ...(source ? { source } : {}),
                ...(size ? { size } : {}),
                tokens: report.reportTokensOf(root.current),
                chartEmbed: kind === "print" ? "inline" : "image"
            });
            const file = `${base}.${kind === "svg" ? "svg" : "html"}`;
            const blob = new Blob([/** @type {BlobPart} */ (rendered.body)], { type: rendered.mediaType });
            if (kind !== "print") {
                if (deliver(blob, { kind, fileName: file, doc, onExport })) {
                    announce(fill(labels.toastExported, { file }));
                }
                return;
            }
            // the host may print itself (a PDF on its server): it gets the report first
            if (onExport?.({ kind, fileName: file, blob }) === false) {
                return;
            }
            if (!root.current || !(await printHtml(/** @type {string} */ (rendered.text), root.current))) {
                announce(labels.toastPrintBlocked, { tone: "error" });
            }
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
        const bytes = kind === "xlsx" ? m.toXlsx(grid, { sheetName: base, theme: xlsxTheme(root.current) }) : m.toCsvBytes(grid, { bom: true });
        if (deliver(new Blob([/** @type {BlobPart} */ (bytes)], { type: kind === "xlsx" ? XLSX_TYPE : "text/csv;charset=utf-8" }), { kind, fileName: file, doc, onExport })) {
            announce(fill(labels.toastExported, { file }));
        }
    } catch (e) {
        announce(fill(labels.toastExportFailed, { message: messageOf(e) }), { tone: "error" });
    }
    }

/** A chart's size as pivotkit-report takes it: whole px from 100 to 8000. */
const clampSize = (px) => Math.max(100, Math.min(8000, Math.round(Number(px) || 0)));
