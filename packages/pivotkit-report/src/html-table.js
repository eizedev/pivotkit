/*
 * The pivot table as HTML, written from pivotkit-core's grid (toGrid): what the Excel export keeps,
 * as the table shows it. Merged headers and row labels as colspan and rowspan, totals and subtotals
 * as classes (bold, shaded), colour scales and data bars as classes with their colours in a rule of
 * their own (no `style` attribute, so a page with a strict Content-Security-Policy can show it), a
 * collapsed group marked. Every text is escaped; every class comes from the fixed names below; a
 * colour is written only when it is a hex colour.
 *
 * Left out on purpose: the header's sort buttons, the toggles and drill-down (nothing runs in a
 * report). A table over `maxCells` cells is cut after the last whole row that fits: `cut` says how
 * many body rows it shows of how many.
 */

import { DEFAULT_THEME } from "pivotkit-core";
import { scaleColor } from "pivotkit-core/export";
import { escapeHtml } from "./template.js";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** The class of a total: subtotal or grand total. */
const totalClass = (total) => (total === 2 ? " pk-grand" : total === 1 ? " pk-sub" : "");

/**
 * @typedef {object} HtmlTable
 * @property {string} html  the <table>
 * @property {string} css  the rules of the conditional colours, per cell class
 * @property {{ rows: number, of: number } | null} cut  body rows shown of all, when the table was cut
 */

/**
 * @param {import("pivotkit-core").Grid} grid
 * @param {{ maxCells: number, caption?: string, colorScale?: string[], dataBar?: string }} options
 *   colorScale, dataBar: the colours of a scale or a bar whose view names none (pivotkit-core's DEFAULT_THEME)
 * @returns {HtmlTable}
 */
export function htmlTable(grid, { maxCells, caption, colorScale = [...DEFAULT_THEME.colorScale], dataBar = DEFAULT_THEME.dataBar }) {
    const width = Math.max(1, grid.columnCount);
    const bodyCount = grid.rows.length - grid.headerRows;
    // the header always; then whole body rows while the cells fit
    const fit = Math.max(0, Math.min(bodyCount, Math.floor(maxCells / width) - grid.headerRows));
    const rules = [];
    let ruleId = 0;
    const colorRule = (style) => {
        if (!style) {
            return "";
        }
        if (style.bar !== undefined) {
            const color = style.color && HEX.test(style.color) ? style.color : dataBar;
            const bar = Math.round(Math.max(0, Math.min(1, style.bar)) * 1000) / 10;
            const name = `pk-c${ruleId++}`;
            rules.push(`.${name}{--pk-bar:${bar}%;--pk-bar-color:${HEX.test(color) ? color : DEFAULT_THEME.dataBar}}`);
            return ` pk-has-bar ${name}`;
        }
        if (style.scale !== undefined) {
            const t = Math.max(0, Math.min(1, style.scale));
            const color = style.color && HEX.test(style.color) ? style.color : scaleColor(colorScale.filter((c) => HEX.test(c)).length >= 2 ? colorScale.filter((c) => HEX.test(c)) : [...DEFAULT_THEME.colorScale], t);
            const name = `pk-c${ruleId++}`;
            rules.push(`.${name}{--pk-cell-bg:${color}}`);
            return ` pk-has-scale ${name}`;
        }
        return "";
    };
    const span = (cell) => `${(cell.colSpan ?? 1) > 1 ? ` colspan="${cell.colSpan}"` : ""}${(cell.rowSpan ?? 1) > 1 ? ` rowspan="${cell.rowSpan}"` : ""}`;
    const head = [];
    for (let r = 0; r < grid.headerRows; r++) {
        const cells = grid.rows[r]
            .map((cell) => {
                if (!cell) {
                    return "";
                }
                const kind = cell.kind === "corner" ? " pk-corner" : "";
                return `<th scope="col" class="pk-th${kind}${totalClass(cell.total)}"${span(cell)}>${escapeHtml(cell.text)}</th>`;
            })
            .join("");
        head.push(`<tr>${cells}</tr>`);
    }
    const body = [];
    for (let r = grid.headerRows; r < grid.headerRows + fit; r++) {
        const cells = grid.rows[r]
            .map((cell) => {
                if (!cell) {
                    return "";
                }
                // a row label merged past the rows the cut keeps ends there
                const rowSpan = Math.min(cell.rowSpan ?? 1, grid.headerRows + fit - r);
                const spans = span({ ...cell, rowSpan });
                if (cell.kind === "rowHeader") {
                    const collapsed = cell.toggle?.collapsed ? " pk-collapsed" : "";
                    return `<th scope="row" class="pk-th pk-row${totalClass(cell.total)}${collapsed}"${spans}>${escapeHtml(cell.text)}</th>`;
                }
                const number = cell.valueType === "text" ? " pk-text" : " pk-num";
                return `<td class="pk-td${number}${totalClass(cell.total)}${colorRule(cell.style)}"${spans}>${escapeHtml(cell.text)}</td>`;
            })
            .join("");
        body.push(`<tr>${cells}</tr>`);
    }
    const captionHtml = caption ? `<caption>${escapeHtml(caption)}</caption>` : "";
    return {
        html: `<table class="pk-table">${captionHtml}<thead>${head.join("")}</thead><tbody>${body.join("")}</tbody></table>`,
        css: rules.join("\n"),
        cut: fit < bodyCount ? { rows: fit, of: bodyCount } : null
    };
}
