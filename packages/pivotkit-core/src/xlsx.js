/*
 * Export of a grid (toGrid) as an Excel workbook, built without a spreadsheet library: the smallest
 * Office Open XML package Excel, LibreOffice and Numbers open, zipped with fflate.
 *
 * Value cells stay numbers (dates are date serials) with an Excel number format that shows them as
 * the grid does, header labels are merged as in the grid, totals are bold, header rows and label
 * columns are frozen, and colour scales and data bars become native Excel conditional formats. Text
 * is written as inline strings, which Excel never evaluates as formulas.
 *
 * Excel's limits: a sheet holds 1,048,576 rows and 16,384 columns (a larger grid throws a
 * PivotkitError), a cell 32,767 characters (longer text is cut). Dates before 1900-01-01 or after
 * 9999-12-31 have no serial in Excel and are written as text.
 */

import { strToU8, zipSync } from "fflate";
import { DEFAULT_THEME } from "./defaults.js";
import { checkLimit, expect } from "./errors.js";
import { excelNumberFormat } from "./format.js";
import { isGrid } from "./grid.js";
import { MS_PER_DAY, hexDigits } from "./util.js";

// Excel's serial day 0 is 1899-12-30; 25569 is 1970-01-01
const EXCEL_EPOCH_OFFSET = 25569;
export const EXCEL_MAX_ROWS = 1_048_576;
export const EXCEL_MAX_COLUMNS = 16_384;
export const EXCEL_MAX_TEXT = 32_767;
const FIRST_SERIAL_DAY = Date.UTC(1900, 0, 1);
// Excel counts the non-existent 1900-02-29 (a Lotus 1-2-3 compatibility bug), so serials from
// 1900-03-01 on are one day higher than the plain day count from 1899-12-31
const LEAP_BUG_DAY = Date.UTC(1900, 2, 1);
const LAST_SERIAL_DAY = Date.UTC(10000, 0, 1);
const RESERVED_SHEET_NAMES = new Set(["history"]);

/** Characters XML 1.0 does not allow are removed; markup characters are escaped. */
export function xmlEscape(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** "A1" reference of a zero-based column and row. */
export function cellRef(col, row) {
    let s = "";
    let n = col + 1;
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return `${s}${row + 1}`;
}

/**
 * Excel serial date of wall-clock milliseconds; null when Excel has no serial for it.
 * @param {number} wallMs
 * @returns {number | null}
 */
export function excelSerial(wallMs) {
    if (!(wallMs >= FIRST_SERIAL_DAY && wallMs < LAST_SERIAL_DAY)) {
        return null;
    }
    const serial = wallMs / MS_PER_DAY + EXCEL_EPOCH_OFFSET;
    return wallMs < LEAP_BUG_DAY ? serial - 1 : serial;
}

function argb(hex) {
    return `FF${hexDigits(hex).toUpperCase()}`;
}

/**
 * Sheet names: at most 31 characters, none of \\ / ? * [ ] : or control characters, no leading or
 * trailing apostrophe, and not "History", which Excel reserves.
 */
export function sheetName(name) {
    const clean = String(name ?? "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F\\/?*[\]:]/g, " ")
        .replace(/^'+|'+$/g, "")
        .trim()
        .slice(0, 31)
        .trim();
    if (RESERVED_SHEET_NAMES.has(clean.toLowerCase())) {
        return `${clean} 1`;
    }
    return clean || "Pivot";
}

/** Compresses cell references into column runs: "C3:C9 E3:E9". */
function sqref(cells) {
    const byCol = new Map();
    for (const [r, c] of cells) {
        if (!byCol.has(c)) {
            byCol.set(c, []);
        }
        byCol.get(c).push(r);
    }
    const parts = [];
    for (const [c, rows] of [...byCol.entries()].sort((a, b) => a[0] - b[0])) {
        rows.sort((a, b) => a - b);
        let start = rows[0];
        let prev = rows[0];
        for (let i = 1; i <= rows.length; i++) {
            if (i < rows.length && rows[i] === prev + 1) {
                prev = rows[i];
                continue;
            }
            parts.push(start === prev ? cellRef(c, start) : `${cellRef(c, start)}:${cellRef(c, prev)}`);
            if (i < rows.length) {
                start = prev = rows[i];
            }
        }
    }
    return parts.join(" ");
}

/**
 * The grid as an .xlsx workbook.
 * @param {import("./grid.js").Grid} grid  from toGrid()
 * @param {{ sheetName?: string, theme?: { colorScale?: string[], dataBar?: string } }} [options]
 *   theme: colours for conditional formats whose view names none
 * @returns {Uint8Array}
 */
export function toXlsx(grid, options = {}) {
    expect(isGrid(grid), "toXlsx(grid): grid must come from toGrid()");
    checkLimit("xlsxRows", grid.rows.length, EXCEL_MAX_ROWS, "rows (an Excel sheet)");
    checkLimit("xlsxColumns", grid.columnCount, EXCEL_MAX_COLUMNS, "columns (an Excel sheet)");
    const theme = { ...DEFAULT_THEME, ...(options.theme || {}) };
    const locale = grid.locale;
    // Styles: one cellXfs entry per (number format, bold) pair, created as cells need them.
    const numFmts = new Map(); // code -> id
    const xfs = [{ fmt: 0, bold: false }];
    const xfIndex = new Map([["0|false", 0]]);
    const styleOf = (code, bold) => {
        let fmt = 0;
        if (code && code !== "General") {
            if (!numFmts.has(code)) {
                numFmts.set(code, 164 + numFmts.size);
            }
            fmt = numFmts.get(code);
        }
        const key = `${fmt}|${bold}`;
        if (!xfIndex.has(key)) {
            xfIndex.set(key, xfs.length);
            xfs.push({ fmt, bold });
        }
        return xfIndex.get(key);
    };
    const textCell = (ref, text, bold) => {
        const t = text.length > EXCEL_MAX_TEXT ? text.slice(0, EXCEL_MAX_TEXT) : text;
        return `<c r="${ref}" t="inlineStr" s="${styleOf("General", bold)}"><is><t xml:space="preserve">${xmlEscape(t)}</t></is></c>`;
    };
    const numberCell = (ref, v, code, bold) => `<c r="${ref}" s="${styleOf(code, bold)}"><v>${v}</v></c>`;

    const widths = new Array(grid.columnCount).fill(6);
    /** valueIndex -> { cells: [[r, c]], min, max } */
    const conditional = new Map();
    const rowsXml = grid.rows.map((row, r) => {
        const isHeader = r < grid.headerRows;
        const cells = row.map((cell, c) => {
            if (!cell) {
                return "";
            }
            const ref = cellRef(c, r);
            const bold = isHeader || cell.total > 0;
            if (!cell.colSpan || cell.colSpan === 1) {
                widths[c] = Math.max(widths[c], Math.min(60, cell.text.length + 2));
            }
            if (cell.kind === "value" && typeof cell.value === "number" && Number.isFinite(cell.value)) {
                if (cell.total === 0 && cell.valueIndex !== undefined && grid.conditional && grid.conditional[cell.valueIndex]) {
                    const cf = conditional.get(cell.valueIndex) ?? { cells: [], min: Infinity, max: -Infinity };
                    cf.cells.push([r, c]);
                    cf.min = Math.min(cf.min, cell.value);
                    cf.max = Math.max(cf.max, cell.value);
                    conditional.set(cell.valueIndex, cf);
                }
                if (cell.valueType === "date") {
                    const serial = excelSerial(cell.value);
                    return serial === null ? textCell(ref, cell.text, bold) : numberCell(ref, serial, excelNumberFormat(cell.format, cell.value, locale), bold);
                }
                return numberCell(ref, cell.value, excelNumberFormat(cell.format, cell.value, locale), bold);
            }
            if ((cell.kind === "rowHeader" || cell.kind === "colHeader") && typeof cell.value === "number" && cell.text === String(cell.value)) {
                // a label that is a plain number (a year, a number key) stays a number
                return numberCell(ref, cell.value, "General", bold);
            }
            if (cell.text === "") {
                // keeps the bold total style on empty cells of a total row
                return bold ? `<c r="${ref}" s="${styleOf("General", true)}"/>` : "";
            }
            return textCell(ref, cell.text, bold);
        });
        return `<row r="${r + 1}">${cells.join("")}</row>`;
    });

    let priority = 1;
    const cfXml = [...conditional.entries()].map(([vi, { cells, min, max }]) => {
        const spec = grid.conditional[vi];
        let rule;
        if (spec.type === "colorScale") {
            const colors = spec.colors.length >= 2 ? spec.colors : theme.colorScale;
            const cfvo = colors.length === 3
                ? `<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>`
                : `<cfvo type="min"/><cfvo type="max"/>`;
            rule = `<cfRule type="colorScale" priority="${priority++}"><colorScale>${cfvo}${colors.map((c) => `<color rgb="${argb(c)}"/>`).join("")}</colorScale></cfRule>`;
        } else {
            // bars start at zero, as in the grid: 0 is the bar's end when all values lie on one side of it
            const low = min > 0 ? `<cfvo type="num" val="0"/>` : `<cfvo type="min"/>`;
            const high = max < 0 ? `<cfvo type="num" val="0"/>` : `<cfvo type="max"/>`;
            rule = `<cfRule type="dataBar" priority="${priority++}"><dataBar>${low}${high}<color rgb="${argb(spec.color || theme.dataBar)}"/></dataBar></cfRule>`;
        }
        return `<conditionalFormatting sqref="${sqref(cells)}">${rule}</conditionalFormatting>`;
    });

    const pane = grid.headerRows > 0 || grid.rowHeaderColumns > 0
        ? `<pane${grid.rowHeaderColumns ? ` xSplit="${grid.rowHeaderColumns}"` : ""}${grid.headerRows ? ` ySplit="${grid.headerRows}"` : ""} topLeftCell="${cellRef(grid.rowHeaderColumns, grid.headerRows)}" activePane="${grid.rowHeaderColumns && grid.headerRows ? "bottomRight" : grid.headerRows ? "bottomLeft" : "topRight"}" state="frozen"/>`
        : "";
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
    const merges = grid.merges.length
        ? `<mergeCells count="${grid.merges.length}">${grid.merges
            .map((m) => `<mergeCell ref="${cellRef(m.col, m.row)}:${cellRef(m.col + m.colSpan - 1, m.row + m.rowSpan - 1)}"/>`)
            .join("")}</mergeCells>`
        : "";
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
    const sheet = `${xml}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rowsXml.join("")}</sheetData>${merges}${cfXml.join("")}</worksheet>`;

    const fmtXml = [...numFmts.entries()].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${xmlEscape(code)}"/>`).join("");
    const styles = `${xml}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.size ? `<numFmts count="${numFmts.size}">${fmtXml}</numFmts>` : ""}<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs
        .map((x) => `<xf numFmtId="${x.fmt}" fontId="${x.bold ? 1 : 0}"${x.fmt ? ` applyNumberFormat="1"` : ""}${x.bold ? ` applyFont="1"` : ""}/>`)
        .join("")}</cellXfs><dxfs count="0"/></styleSheet>`;

    const name = xmlEscape(sheetName(options.sheetName));
    const files = {
        "[Content_Types].xml": `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
        "_rels/.rels": `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        "xl/workbook.xml": `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "xl/_rels/workbook.xml.rels": `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        "xl/styles.xml": styles,
        "xl/worksheets/sheet1.xml": sheet
    };
    const zipped = {};
    for (const [path, content] of Object.entries(files)) {
        zipped[path] = strToU8(content);
    }
    return zipSync(zipped, { level: 6 });
}

