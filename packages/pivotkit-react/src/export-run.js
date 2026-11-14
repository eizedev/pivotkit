/*
 * The report's exports, loaded with the menus (menus.js): the table as an Excel workbook (its colour
 * scales and data bars in the theme's colours where the view names none) or a CSV file
 * (pivotkit-core/export, loaded on first use), the chart as a PNG image, an HTML report, the chart as
 * SVG and the HTML report printed (pivotkit-report with ECharts' SVG renderer, report-run.js, loaded on
 * first use), the source data (every row of the data shown as it is, CSV or JSON: pivotkit-core's
 * dataToCsvBytes and dataToJson, so a view file renders it again on the command line), and the table on the clipboard: as the table shows it, tab-separated (a spreadsheet
 * takes it as columns), or its data as JSON. The file name is the host's fileName made safe
 * (files.js). The host's onExport sees every file, every copy and the report before it is printed
 * first and may take it over by returning false. use-export.js calls it.
 */

import { chartThemeFrom, toGrid } from "pivotkit-core";
import { copyText, dataUrlToBlob, safeFileName, saveBlob } from "./files.js";
import { printHtml } from "./print-frame.js";
import { lightTokens } from "./light-tokens.js";
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

/** Whether the browser reads a text as a CSS colour (CSS.supports); false without it. */
const isColor = (/** @type {string} */ text) => typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", text);

/**
 * A CSS colour as "#rrggbb", or null: through a canvas's fillStyle, which writes an opaque sRGB colour
 * that way whatever syntax it was given (a name, rgb(), hsl()). A text that is no colour is refused
 * first (a canvas would keep the colour it had).
 * @param {string} text
 * @param {{ fillStyle: unknown } | null} ctx  a 2D context
 * @param {(text: string) => boolean} [supports]  whether the text is a colour
 */
export function hexColor(text, ctx, supports = isColor) {
    if (!text || !ctx || !supports(text)) {
        return null;
    }
    ctx.fillStyle = text;
    const hex = String(ctx.fillStyle).toLowerCase();
    return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

/** The tokens of a workbook's colours: its colour scale (--pk-scale-mid only when a host sets it) and data bars. */
export const XLSX_TOKENS = Object.freeze(["--pk-scale-low", "--pk-scale-mid", "--pk-scale-high", "--pk-chart-1"]);

/**
 * The colours of the theme the workbook gets for a conditional format whose view names none, as the
 * report resolves its tokens (pivotkit-core's chartThemeFrom): the colour scale (--pk-scale-low, the
 * host's --pk-scale-mid, -high) and the data bars (--pk-chart-1). Each one missing or not a colour
 * stays pivotkit-core's default; a middle colour that is none is left out.
 * @param {{ getPropertyValue(name: string): string }} style  the report's light tokens
 * @param {(text: string) => string | null} toHex
 * @returns {{ colorScale?: string[], dataBar?: string }}
 */
export function xlsxThemeOf(style, toHex) {
    const { colorScale = [], dataBar = "" } = chartThemeFrom(style);
    const scale = colorScale.map(toHex);
    const [low, high, mid] = [scale[0], scale.at(-1), scale.length === 3 ? scale[1] : null];
    const bar = toHex(dataBar);
    return {
        ...(low && high ? { colorScale: mid ? [low, mid, high] : [low, high] } : {}),
        ...(bar ? { dataBar: bar } : {})
    };
}

/**
 * The theme of the workbook from the report's root: the light theme's tokens in either theme (a
 * workbook is light, with Excel's black text), so a host's theme reaches it from a dark report too.
 * @param {HTMLElement | null} root
 */
function xlsxTheme(root) {
    if (!root) {
        return undefined;
    }
    const tokens = lightTokens(root, XLSX_TOKENS);
    const ctx = root.ownerDocument.createElement("canvas").getContext("2d");
    return xlsxThemeOf({ getPropertyValue: (name) => tokens[name] ?? "" }, (text) => hexColor(text, ctx));
}

/**
 * The tokens of an HTML report and an SVG from the report's root: the light theme's (report-run.js's
 * REPORT_TOKENS) in either theme, and the chart's lengths and the report's font sizes in px (the
 * chart's module resolves them: LENGTH_TOKENS, report-run.js's REPORT_LENGTHS).
 * @param {HTMLElement | null} root
 * @param {{ REPORT_TOKENS: readonly string[], REPORT_LENGTHS: readonly string[] }} report
 * @param {{ LENGTH_TOKENS: readonly string[], tokenLengths: (root: HTMLElement, names: readonly string[]) => Record<string, string> }} chart
 * @returns {Record<string, string> | undefined}
 */
function reportTokens(root, report, chart) {
    if (!root) {
        return undefined;
    }
    const tokens = lightTokens(root, report.REPORT_TOKENS, () => chart.tokenLengths(root, [...chart.LENGTH_TOKENS, ...report.REPORT_LENGTHS]));
    return Object.keys(tokens).length ? tokens : undefined;
}

/**
 * @typedef {{ fileName: string, result: import("pivotkit-core").PivotResult | null, encoded?: import("pivotkit-core").Encoded | null, exportData?: boolean, locale: string,
 *   labels: import("./labels.js").UiLabels, limits: object | undefined, root: React.RefObject<HTMLElement | null>,
 *   chartRef: React.RefObject<any>, announce: (text: string, extra?: { tone?: "error" }) => void,
 *   onExport?: (file: ExportFile) => unknown, title?: string | null, source?: string | null, loadECharts?: () => Promise<any> }} ExportContext
 *   `title`: the report's title in an HTML report (the loaded view's name); `source`: the data's name;
 *   `encoded`: the data shown (the host's or a loaded file's), which the source data exports, only
 *   with `exportData` (the host's prop: the menu hides it otherwise, and no other way reaches it);
 *   `loadECharts`: chart.jsx's loader of dist/echarts.js (passed in: a module of the menus that
 *   imported chart.jsx would move it out of the first load into a shared chunk)
 */

/**
 * One export of the Export menu.
 * @param {"xlsx" | "csv" | "png" | "html" | "svg" | "print" | "copy-table" | "copy-json" | "data-csv" | "data-json"} kind
 * @param {ExportContext} context
 */
export async function runExport(kind, { fileName, result, encoded, exportData, locale, labels, limits, root, chartRef, announce, onExport, title, source, loadECharts }) {
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
        if (kind === "data-csv" || kind === "data-json") {
            // every row as it is, also while no field is placed: what a view file is applied to
            const data = encoded ?? result?.encoded;
            if (!exportData || !data) {
                return;
            }
            const m = exporters ?? (await loadExporters());
            const csv = kind === "data-csv";
            const file = `${base}-data.${csv ? "csv" : "json"}`;
            const blob = csv ? new Blob([/** @type {BlobPart} */ (m.dataToCsvBytes(data, limits ? { limits } : {}))], { type: "text/csv;charset=utf-8" }) : new Blob([m.dataToJson(data, limits ? { limits } : {})], { type: "application/json" });
            if (deliver(blob, { kind, fileName: file, doc, onExport })) {
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
                tokens: reportTokens(root.current, report, echarts),
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
