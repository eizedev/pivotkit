/*
 * pivotkit-report: a view over rows as a file without a browser - JSON, CSV, XLSX, SVG and a printable
 * HTML report from a template with placeholders - on pivotkit-core, in Node and in the browser alike.
 *
 *   import * as echarts from "echarts";
 *   const { body, issues, ok } = await render(view, rows, { format: "html", echarts, now: "2026-11-13" });
 *   // import { parseTemplate, fillTemplate, PLACEHOLDERS } from "pivotkit-report/template"
 *
 * Conventions as in pivotkit-core: required inputs first, everything optional in one options object;
 * a bad view never throws (issues), a programmer error, a limit or a refused template throws
 * PivotkitError.
 */

/**
 * @typedef {import("./render.js").RenderOptions} RenderOptions
 * @typedef {import("./render.js").RenderResult} RenderResult
 * @typedef {import("./texts.js").ReportTexts} ReportTexts
 */

export { render, RENDER_FORMATS, REPORT_LIMITS, REPORT_ISSUE_CODES, CHART_SIZE } from "./render.js";
export { cleanSvg } from "./svg.js";
export { DEFAULT_TEMPLATE, REPORT_CSP } from "./default-template.js";
export { REPORT_TEXTS } from "./texts.js";
export { LIGHT_TOKENS, DARK_TOKENS, WEIGHT_TOKENS } from "./tokens.js";
