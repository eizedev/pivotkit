/*
 * render(): a view over data as a file - JSON, CSV, XLSX, SVG or a printable HTML report. Every step
 * is pivotkit-core's (fromViewFile, normalize, computePivot, toGrid and its exporters, chartPlan and
 * the chart's marks); this module only joins them. A bad view never throws: its issues come back with
 * the result (`ok` is false with an error among them); a programmer error, a limit and a refused
 * template throw PivotkitError.
 */

import { PivotkitError, closest, computePivot, describeView, encode, fromViewFile, normalize, outsideLimits, toGrid } from "pivotkit-core";
import { toCsvBytes, toJson, toXlsx } from "pivotkit-core/export";
import { DEFAULT_TEMPLATE } from "./default-template.js";
import { htmlTable } from "./html-table.js";
import { reportCss } from "./report-css.js";
import { chartSvg } from "./svg.js";
import { TEMPLATE_LIMIT, escapeHtml, fillTemplate, parseTemplate } from "./template.js";
import { fill, textsFor } from "./texts.js";
import { cleanTokens, tokenStyle } from "./tokens.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The formats: media type, file extension, and whether the body is text (`text` is set). */
export const RENDER_FORMATS = Object.freeze({
    json: Object.freeze({ mediaType: "application/json", extension: "json", text: true }),
    csv: Object.freeze({ mediaType: "text/csv;charset=utf-8", extension: "csv", text: true }),
    xlsx: Object.freeze({ mediaType: XLSX_TYPE, extension: "xlsx", text: false }),
    svg: Object.freeze({ mediaType: "image/svg+xml", extension: "svg", text: true }),
    html: Object.freeze({ mediaType: "text/html;charset=utf-8", extension: "html", text: true })
});

/**
 * What a report allows at most, besides pivotkit-core's LIMITS: the characters of a template, the size
 * of a chart in px, the cells of a report's table (a larger table is cut after the last whole row, and
 * says so), the categories of a chart (the first ones, as on the screen).
 */
export const REPORT_LIMITS = Object.freeze({ template: TEMPLATE_LIMIT, chartWidth: 8_000, chartHeight: 8_000, tableCells: 200_000, categories: 50 });

/** The default size of a chart in px. */
export const CHART_SIZE = Object.freeze({ width: 800, height: 480 });

/** Issues of a report itself (warnings), besides a view's (VIEW_ISSUES). */
export const REPORT_ISSUE_CODES = Object.freeze(["chartUnavailable", "tableCut", "chartCut", "viewFile"]);

/** Languages written from right to left. */
const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"]);

/**
 * @typedef {object} RenderOptions
 * @property {"json" | "csv" | "xlsx" | "svg" | "html"} [format]  default "html"
 * @property {string} [locale]  used when the view names none; default "en-US"
 * @property {string} [timeZone]  of rows that are not encoded yet (encode()), and of the "generated" time; default "UTC"
 * @property {Date | number | string} [now]  "today" of relative date filters and the "generated" time; fix it for output that is the same on every run
 * @property {Partial<import("pivotkit-core").Limits>} [limits]  pivotkit-core's limits
 * @property {boolean} [trusted]  the view is the host's own: the host's limits instead of outsideLimits() (default false)
 * @property {boolean} [strict]  no body when the view has an error (default false: the normalized view is rendered)
 * @property {Partial<import("pivotkit-core").Labels>} [labels]  pivotkit-core's texts (totals, value names)
 * @property {Partial<import("./texts.js").ReportTexts>} [texts]  the report's words around the table
 * @property {Record<string, string>} [tokens]  --pk-* colours over the light ones (the chart and the report)
 * @property {string} [title]  the report's title; default the view file's name, the chart's title, "Report"
 * @property {string} [description]  default the view file's description
 * @property {string} [source]  where the data comes from, for the report's details (a file name)
 * @property {string} [template]  html: a print template (parseTemplate), default DEFAULT_TEMPLATE
 * @property {boolean | "auto"} [chart]  html: with the chart; "auto" (default) when the view shows the chart
 * @property {"image" | "inline"} [chartEmbed]  html: the chart as a data: image (default) or as inline SVG
 * @property {{ init: Function }} [echarts]  the ECharts module (with its SVG renderer): svg, and html with a chart
 * @property {{ width?: number, height?: number }} [size]  of the chart in px, default 800 x 480
 * @property {number} [tableCells]  html: cells of the table at most, default REPORT_LIMITS.tableCells
 * @property {boolean} [bom]  csv: start with a byte order mark, so Excel reads it as UTF-8 (default true)
 */

/** @type {Readonly<Record<string, ReadonlyArray<unknown>>>} The options that take one of a few values. */
const OPTION_VALUES = Object.freeze({ chart: [true, false, "auto"], chartEmbed: ["image", "inline"], bom: [true, false], strict: [true, false], trusted: [true, false] });

/** The names of RenderOptions: any other is refused, so a misspelt option is not ignored. */
const OPTION_KEYS = Object.freeze(["format", "locale", "timeZone", "now", "limits", "trusted", "strict", "labels", "texts", "tokens", "title", "description", "source", "template", "chart", "chartEmbed", "echarts", "size", "tableCells", "bom"]);

/**
 * @typedef {object} RenderResult
 * @property {string} format
 * @property {string} mediaType
 * @property {string} extension
 * @property {Uint8Array | null} body  the file; null when `strict` and the view has an error
 * @property {string} [text]  the body as text, for json, csv, svg and html
 * @property {import("pivotkit-core").Issue[]} issues  the view's issues, then the report's (REPORT_ISSUE_CODES)
 * @property {boolean} ok  no issue of severity "error"
 * @property {{ rows: number, columns: number, sourceRows: number, truncated: boolean } | null} summary  the table's body rows and columns, the data's rows, whether a part was cut
 * @property {import("pivotkit-core").View | null} view  the normalized view that was rendered
 */

/** @param {string} key  @param {string} message */
const badOption = (key, message) => new PivotkitError("INVALID_OPTION", `render: ${message}`, { option: key });

/** A report issue (a warning). */
const reportIssue = (code, message, params = {}) => ({ path: "", code, message, severity: /** @type {"warning"} */ ("warning"), params });

/** The data as encoded data: rows and columnar data are encoded, encoded data is used as it is. */
function encoded(data, options) {
    if (Array.isArray(data) || (data && typeof data === "object" && Array.isArray(/** @type {any} */ (data).columns) && Array.isArray(/** @type {any} */ (data).data))) {
        const columnar = /** @type {any} */ (data);
        return encode(Array.isArray(data) ? data : { columns: columnar.columns, types: columnar.types, data: columnar.data }, { timeZone: options.timeZone ?? "UTC", ...(options.limits ? { limits: options.limits } : {}) });
    }
    if (data && typeof data === "object" && typeof (/** @type {any} */ (data).column) === "function") {
        return /** @type {import("pivotkit-core").Encoded} */ (data);
    }
    throw new PivotkitError("INVALID_ARGUMENT", "render(view, data): data must be rows, columnar data ({ columns, types, data }) or encode()'s result");
}

/** The chart's size, checked against REPORT_LIMITS. */
function sizeOf(size) {
    const width = size?.width ?? CHART_SIZE.width;
    const height = size?.height ?? CHART_SIZE.height;
    for (const [key, value, max] of [["width", width, REPORT_LIMITS.chartWidth], ["height", height, REPORT_LIMITS.chartHeight]]) {
        if (!Number.isInteger(value) || value < 100 || value > max) {
            throw badOption("size", `size.${key} must be a whole number from 100 to ${max}`);
        }
    }
    return { width, height };
}

/** "Nov 13, 2026, 10:00 AM" of `now` in the locale and time zone. */
function generatedText(now, locale, timeZone) {
    const date = now === undefined ? new Date() : new Date(/** @type {any} */ (now));
    if (Number.isNaN(date.getTime())) {
        throw badOption("now", "now must be a date, a time in ms or an ISO text");
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

/**
 * Renders a view over data as a file.
 * @param {unknown} view  a view, a view file or a template { name, view }, as an object or JSON text
 * @param {unknown} data  rows, columnar data ({ columns, types, data }) or encode()'s result
 * @param {RenderOptions} [options]
 * @returns {Promise<RenderResult>}
 */
export async function render(view, data, options = {}) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
        throw badOption("options", "options must be an object");
    }
    for (const key of Object.keys(options)) {
        if (!OPTION_KEYS.includes(key)) {
            const near = closest(key, OPTION_KEYS);
            throw badOption(key, `unknown option ${JSON.stringify(key.slice(0, 40))}${near ? `; did you mean ${JSON.stringify(near)}?` : ""}`);
        }
    }
    const format = options.format ?? "html";
    if (!Object.hasOwn(RENDER_FORMATS, format)) {
        throw badOption("format", `unknown format ${JSON.stringify(String(format)).slice(0, 40)}; one of ${Object.keys(RENDER_FORMATS).join(", ")}`);
    }
    const kind = RENDER_FORMATS[format];
    const base = { format, mediaType: kind.mediaType, extension: kind.extension };
    // a template is checked before any work
    const template = format === "html" ? parseTemplate(options.template ?? DEFAULT_TEMPLATE) : null;
    const size = format === "svg" || format === "html" ? sizeOf(options.size) : null;
    // options that take one of a few values: anything else (a CLI's "on") would be read as the default
    for (const [key, allowed] of Object.entries(OPTION_VALUES)) {
        const value = /** @type {Record<string, unknown>} */ (options)[key];
        if (value !== undefined && !allowed.includes(value)) {
            throw badOption(key, `${key} takes ${allowed.map((v) => JSON.stringify(v)).join(", ")}, not ${JSON.stringify(String(value)).slice(0, 40)}`);
        }
    }
    if ((format === "svg" || (format === "html" && options.chart === true)) && typeof options.echarts?.init !== "function") {
        throw badOption("echarts", `${format === "svg" ? "an SVG" : "a report with chart: true"} needs ECharts: pass the echarts module (with its SVG renderer) as options.echarts`);
    }
    if (options.now !== undefined) {
        // checked here, so a wrong one is named as an option before any work
        generatedText(options.now, "en-US", "UTC");
    }
    const issues = [];
    const read = fromViewFile(typeof view === "string" ? view : JSON.stringify(view ?? null));
    if (read.failed) {
        issues.push({ path: "", code: "viewFile", message: `not a view: ${read.issues.at(-1)?.message ?? read.failed}`, severity: "error", params: { value: read.failed } });
    }
    const data2 = encoded(data, options);
    const limits = options.trusted ? options.limits : outsideLimits(options.limits);
    const normalized = normalize(read.view ?? {}, data2, { ...(limits ? { limits } : {}) });
    issues.push(...normalized.issues);
    const pivotOptions = { locale: options.locale ?? "en-US", ...(options.limits ? { limits: options.limits } : {}), ...(options.now !== undefined ? { now: options.now } : {}) };
    const result = computePivot(data2, normalized.view, pivotOptions);
    for (const issue of result.issues) {
        if (!issues.some((i) => i.code === issue.code && i.path === issue.path)) {
            issues.push(issue);
        }
    }
    const ok = !issues.some((i) => i.severity === "error");
    if (!ok && options.strict) {
        return { ...base, body: null, issues, ok, summary: null, view: normalized.view };
    }
    const grid = toGrid(result, { ...(options.labels ? { labels: options.labels } : {}), ...(options.limits ? { limits: options.limits } : {}) });
    const summary = { rows: grid.bodyRows.length, columns: grid.columnCount, sourceRows: data2.length, truncated: false };
    const texts = textsFor(grid.locale, options.texts);
    const title = (options.title ?? (read.name || normalized.view.chart.title || texts.untitled)).trim() || texts.untitled;
    const chartOf = () =>
        chartSvg(result, {
            echarts: /** @type {any} */ (options.echarts),
            style: tokenStyle(options.tokens),
            ...size,
            locale: grid.locale,
            labels: options.labels,
            limits: options.limits,
            now: options.now,
            maxCategories: REPORT_LIMITS.categories
        });
    const chartCut = (chart) => {
        if (chart.categories < chart.of) {
            summary.truncated = true;
            issues.push(reportIssue("chartCut", fill(REPORT_TEXTS_EN.chartCut, { shown: chart.categories, count: chart.of }), { value: String(chart.categories), max: chart.of }));
        }
    };
    /** @type {Uint8Array} */
    let body;
    if (format === "json") {
        body = new TextEncoder().encode(toJson(grid));
    } else if (format === "csv") {
        body = toCsvBytes(grid, { bom: options.bom !== false });
    } else if (format === "xlsx") {
        body = toXlsx(grid, { sheetName: title });
    } else if (format === "svg") {
        const chart = chartOf();
        chartCut(chart);
        body = new TextEncoder().encode(chart.svg);
    } else {
        const number = new Intl.NumberFormat(grid.locale);
        const table = htmlTable(grid, { maxCells: options.tableCells ?? REPORT_LIMITS.tableCells });
        let tableNote = "";
        if (table.cut) {
            summary.truncated = true;
            issues.push(reportIssue("tableCut", fill(REPORT_TEXTS_EN.tableCut, { shown: table.cut.rows, count: table.cut.of }), { value: String(table.cut.rows), max: table.cut.of }));
            tableNote = `<p class="pk-report-note">${escapeHtml(fill(texts.tableCut, { shown: number.format(table.cut.rows), count: number.format(table.cut.of) }))}</p>`;
        }
        const wantChart = options.chart === true || ((options.chart ?? "auto") === "auto" && normalized.view.display === "chart");
        let chartHtml = "";
        if (wantChart && typeof options.echarts?.init !== "function") {
            issues.push(reportIssue("chartUnavailable", REPORT_TEXTS_EN.chartUnavailable));
        } else if (wantChart) {
            const chart = chartOf();
            chartCut(chart);
            const note = chart.categories < chart.of ? `<figcaption class="pk-report-note">${escapeHtml(fill(texts.chartCut, { shown: number.format(chart.categories), count: number.format(chart.of) }))}</figcaption>` : "";
            const inner = options.chartEmbed === "inline" ? chart.svg : `<img alt="${escapeHtml(`${texts.chart}: ${title}`)}" width="${size?.width}" height="${size?.height}" src="data:image/svg+xml;base64,${base64(new TextEncoder().encode(chart.svg))}">`;
            chartHtml = `<figure class="pk-report-chart">${inner}${note}</figure>`;
        }
        const described = describeView(normalized.view, data2, { ...(limits ? { limits } : {}) });
        const timeZone = options.timeZone ?? grid.timeZone ?? "UTC";
        const values = {
            title,
            description: options.description ?? read.description ?? "",
            source: options.source ?? "",
            generated: generatedText(options.now, grid.locale, timeZone),
            rows: fill(texts.rowsCount, { count: number.format(data2.length) }),
            filters: described.filters.length ? described.filters.map((f) => f.text).join("; ") : texts.noFilters,
            summary: described.text,
            lang: grid.locale,
            dir: RTL.has(grid.locale.split("-")[0].toLowerCase()) ? "rtl" : "ltr"
        };
        const detail = (label, value) => (value ? `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>` : "");
        const markup = {
            style: `<style>${reportCss({ columns: grid.columnCount, tokens: cleanTokens(options.tokens ?? {}), extra: table.css })}</style>`,
            chart: chartHtml,
            table: table.html + tableNote,
            details: `<dl class="pk-report-details">${detail(texts.source, values.source)}${detail(texts.rows, values.rows)}${detail(texts.filters, values.filters)}${detail(texts.generated, values.generated)}</dl>`
        };
        body = new TextEncoder().encode(fillTemplate(/** @type {any} */ (template), { ...values, ...markup }));
    }
    const out = { ...base, body, issues, ok, summary, view: normalized.view };
    return kind.text ? { ...out, text: new TextDecoder().decode(body) } : out;
}

/** The English texts, for the issues (a program reads them, not the report's reader). */
const REPORT_TEXTS_EN = textsFor("en");

/** Bytes as base64, in browsers and Node alike. */
function base64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}
