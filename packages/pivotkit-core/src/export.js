/*
 * Export of a grid (toGrid) as an Excel workbook or CSV, built without a spreadsheet library.
 *
 * XLSX: the smallest Office Open XML package Excel, LibreOffice and Numbers open, zipped with fflate.
 * Value cells stay numbers (dates are date serials) with the number format of their value, header
 * labels are merged as in the grid, totals are bold, header rows and label columns are frozen, and
 * colour scales and data bars become native Excel conditional formats. Text is written as inline
 * strings, which Excel never evaluates as formulas.
 *
 * CSV: the locale decides the separator (";" where "," is the decimal comma, as Excel does), text is
 * quoted when needed, and text starting with = + - @, a tab or a carriage return gets a leading ' so
 * a spreadsheet does not run it as a formula (CSV injection).
 */

import { strToU8, zipSync } from "fflate";
import { excelNumberFormat } from "./format.js";

const MS_PER_DAY = 86400000;
// Excel's serial day 0 is 1899-12-30; 25569 is 1970-01-01
const EXCEL_EPOCH_OFFSET = 25569;
const DEFAULT_SCALE = ["#f8696b", "#ffeb84", "#63be7b"];
const DEFAULT_BAR = "#638ec6";

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

/** Excel serial date of wall-clock milliseconds. */
export function excelSerial(wallMs) {
    return wallMs / MS_PER_DAY + EXCEL_EPOCH_OFFSET;
}

function argb(hex) {
    const h = hex.length === 4 ? hex.slice(1).split("").map((x) => x + x).join("") : hex.slice(1);
    return `FF${h.toUpperCase()}`;
}

/** Sheet names: at most 31 characters, none of \ / ? * [ ] : */
function sheetName(name) {
    const clean = String(name ?? "").replace(/[\\/?*[\]:]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31);
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
 * @param {ReturnType<import("./grid.js").toGrid>} grid
 * @param {{ sheetName?: string }} [options]
 * @returns {Uint8Array}
 */
export function toXlsx(grid, options = {}) {
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

    const widths = new Array(grid.columnCount).fill(6);
    const conditional = new Map(); // valueIndex -> [[r, c]]
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
                    if (!conditional.has(cell.valueIndex)) {
                        conditional.set(cell.valueIndex, []);
                    }
                    conditional.get(cell.valueIndex).push([r, c]);
                }
                const isDate = cell.valueType === "date";
                const v = isDate ? excelSerial(cell.value) : cell.value;
                return `<c r="${ref}" s="${styleOf(excelNumberFormat(cell.format), bold)}"><v>${v}</v></c>`;
            }
            if (cell.text === "") {
                // keeps the bold total style on empty cells of a total row
                return bold ? `<c r="${ref}" s="${styleOf("General", true)}"/>` : "";
            }
            return `<c r="${ref}" t="inlineStr" s="${styleOf("General", bold)}"><is><t xml:space="preserve">${xmlEscape(cell.text)}</t></is></c>`;
        });
        return `<row r="${r + 1}">${cells.join("")}</row>`;
    });

    let priority = 1;
    const cfXml = [...conditional.entries()].map(([vi, cells]) => {
        const spec = grid.conditional[vi];
        let rule;
        if (spec.type === "colorScale") {
            const colors = spec.colors.length >= 2 ? spec.colors : DEFAULT_SCALE;
            const cfvo = colors.length === 3
                ? `<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>`
                : `<cfvo type="min"/><cfvo type="max"/>`;
            rule = `<cfRule type="colorScale" priority="${priority++}"><colorScale>${cfvo}${colors.map((c) => `<color rgb="${argb(c)}"/>`).join("")}</colorScale></cfRule>`;
        } else {
            rule = `<cfRule type="dataBar" priority="${priority++}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${argb(spec.color || DEFAULT_BAR)}"/></dataBar></cfRule>`;
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

/** The CSV separator Excel expects for a locale: ";" where the decimal mark is ",". */
export function csvSeparator(locale) {
    const decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal");
    return decimal && decimal.value === "," ? ";" : ",";
}

/** Prefixes text a spreadsheet would run as a formula with a quote. */
export function neutralizeFormula(text) {
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function pad(n, width = 2) {
    return String(n).padStart(width, "0");
}

function isoOf(wallMs) {
    const d = new Date(wallMs);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return wallMs % MS_PER_DAY === 0 ? date : `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * The grid as CSV text. Values are written as plain numbers with the locale's decimal mark, dates as
 * ISO dates; labels of merged row headers are repeated on every row so each line stands on its own.
 * @param {ReturnType<import("./grid.js").toGrid>} grid
 * @param {{ locale?: string, separator?: string, repeatLabels?: boolean }} [options]
 * @returns {string}
 */
export function toCsv(grid, options = {}) {
    const separator = options.separator ?? csvSeparator(options.locale);
    const repeat = options.repeatLabels !== false;
    const numberFormat = new Intl.NumberFormat(options.locale, { useGrouping: false, maximumFractionDigits: 15 });
    // the decimal mark only; a minus sign is written as "-" whatever the locale uses
    const number = (v) => numberFormat.format(v).replace(/^[−-]/, "-");
    const coveredBy = new Map();
    for (const m of grid.merges) {
        for (let r = m.row; r < m.row + m.rowSpan; r++) {
            for (let c = m.col; c < m.col + m.colSpan; c++) {
                if (r !== m.row || c !== m.col) {
                    coveredBy.set(`${r},${c}`, grid.rows[m.row][m.col]);
                }
            }
        }
    }
    const quote = (text) => {
        const safe = neutralizeFormula(text);
        return /["\r\n]/.test(safe) || safe.includes(separator) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = grid.rows.map((row, r) =>
        row
            .map((cell, c) => {
                let source = cell;
                if (!source) {
                    const origin = coveredBy.get(`${r},${c}`);
                    // a row label merged down its rows is repeated on each of them; covered header cells
                    // and the empty rest of a subtotal label spanning sideways stay empty
                    source = repeat && origin && origin.kind === "rowHeader" && origin.total === 0 && (origin.colSpan ?? 1) === 1
                        ? origin
                        : null;
                }
                if (!source) {
                    return "";
                }
                if (source.kind === "value" && typeof source.value === "number" && Number.isFinite(source.value)) {
                    return source.valueType === "date" ? isoOf(source.value) : number(source.value);
                }
                return quote(source.text);
            })
            .join(separator)
    );
    return lines.join("\r\n") + "\r\n";
}

/**
 * The CSV as UTF-8 bytes, with a byte order mark so Excel detects the encoding.
 * @param {ReturnType<import("./grid.js").toGrid>} grid
 * @param {{ locale?: string, separator?: string, repeatLabels?: boolean, bom?: boolean }} [options]
 * @returns {Uint8Array}
 */
export function toCsvBytes(grid, options = {}) {
    return strToU8((options.bom === false ? "" : "﻿") + toCsv(grid, options));
}
