/*
 * The report's stylesheet ({{style}}): the tokens (light, dark on a dark screen, always light on
 * paper), the table as the screen's report draws it (pivotkit-react's styles.css: totals shaded and
 * bold, colour scales and data bars from --pk-cell-bg, --pk-bar and --pk-bar-color) and the print
 * rules: margins, the header row on every page, rows not split, the chart kept whole, landscape for a
 * wide table and a smaller font (never below 7 pt) for a very wide one.
 */

import { DARK_TOKENS, LIGHT_TOKENS, REPORT_FONT, WEIGHT_TOKENS, declarations } from "./tokens.js";

/** Columns from which a printed table is turned to landscape, and from which its font gets smaller. */
export const PRINT_WIDE = Object.freeze({ landscape: 8, small: 16 });

/**
 * @param {{ columns: number, tokens?: Record<string, string>, extra?: string }} options
 *   columns: the table's; tokens: the host's (cleaned), over the light ones; extra: the cells' colour rules
 */
export function reportCss({ columns, tokens = {}, extra = "" }) {
    const font = tokens["font-family"] ?? REPORT_FONT;
    const light = declarations({ ...LIGHT_TOKENS, ...WEIGHT_TOKENS, ...tokens });
    // the chart is drawn in the light colours (the host's), on a screen in dark mode too: its card keeps
    // the light surface the chart's image is drawn on
    const chartSurface = { ...LIGHT_TOKENS, ...tokens }["--pk-surface"];
    const page = columns > PRINT_WIDE.landscape ? "size:landscape;" : "";
    return `:root{${light};color-scheme:light dark}
@media screen and (prefers-color-scheme:dark){:root{${declarations(DARK_TOKENS)}}}
*{box-sizing:border-box}
body{margin:0;background:var(--pk-surface);color:var(--pk-text);font:14px/1.45 ${font}}
.pk-report{padding:24px}
.pk-report h1{font-size:20px;font-weight:var(--pk-weight-bold);line-height:1.3;margin:0 0 4px}
.pk-report-description{margin:0 0 12px;color:var(--pk-muted)}
.pk-report-description:empty{display:none}
.pk-report-chart{margin:12px 0 16px;padding:8px;background:${chartSurface};border:1px solid var(--pk-border);border-radius:8px;break-inside:avoid;width:max-content;max-width:100%}
.pk-report-chart img,.pk-report-chart svg{display:block;max-width:100%;height:auto}
.pk-table{border-collapse:collapse;font-variant-numeric:tabular-nums;margin:12px 0 0}
.pk-table th,.pk-table td{border:1px solid var(--pk-border);padding:4px 8px;vertical-align:top}
.pk-th{background:var(--pk-surface-2);text-align:left;font-weight:var(--pk-weight-strong)}
.pk-th.pk-row{font-weight:var(--pk-weight-normal);background:var(--pk-surface)}
.pk-num{text-align:right;white-space:nowrap}
.pk-table .pk-sub{background:var(--pk-total);font-weight:var(--pk-weight-strong)}
.pk-table .pk-grand{background:var(--pk-total-strong);font-weight:var(--pk-weight-bold)}
.pk-collapsed::before{content:"+ ";color:var(--pk-muted)}
.pk-td.pk-has-scale{background:color-mix(in srgb,var(--pk-cell-bg) 48%,var(--pk-surface))}
.pk-td.pk-has-bar{background-image:linear-gradient(90deg,color-mix(in srgb,var(--pk-bar-color,var(--pk-chart-1)) 32%,transparent) var(--pk-bar),transparent var(--pk-bar));background-repeat:no-repeat;background-size:100% 64%;background-position:left center}
.pk-report-note{color:var(--pk-muted);margin:8px 0}
.pk-report-details{display:grid;grid-template-columns:max-content 1fr;gap:2px 12px;margin:16px 0 0;color:var(--pk-muted);font-size:12px}
.pk-report-details dt{font-weight:var(--pk-weight-strong)}
.pk-report-details dd{margin:0}
@page{margin:12mm;${page}}
@media print{
body{font-size:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pk-report{padding:0}
.pk-report-chart{border:none;padding:0}
thead{display:table-header-group}
tr{break-inside:avoid}
.pk-table th,.pk-table td{padding:2px 6px}
${columns > PRINT_WIDE.small ? ".pk-table{font-size:7pt}" : ""}
}
${extra}`;
}
