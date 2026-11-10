/*
 * Builds .xlsx files for the tests and the benchmark, as Excel writes them (shared strings, styles
 * with date formats, `r` on every row and cell, formulas with their cached values), streamed through
 * fflate so a sheet of hundreds of megabytes never sits in memory as one string. Nothing here is
 * committed as a binary: the tests generate what they read.
 *
 *   node test/make-xlsx.js out.xlsx [rows] [usedRangeTo]   # the large ticket export of the benchmark
 */

import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** "A", "B", ..., "Z", "AA" for a 0-based column. */
export function columnLetter(c) {
    let s = "";
    for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
}

const escapeXml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A cell of a generated sheet.
 * @typedef {null | string | number | boolean | { date: Date } | { formula: string, value: number } | { error: string } | { inline: string } | { styleOnly: true }} Cell
 */

/**
 * Builds a workbook.
 * @param {object} spec
 * @param {Array<{ name: string, hidden?: boolean, rows: Iterable<Cell[]> | (() => Iterable<Cell[]>), usedRangeTo?: number, emptyCells?: number }>} spec.sheets
 *   `usedRangeTo`: rows of formatted empty cells (`emptyCells` per row, default 1) after the data up to this row
 * @param {boolean} [spec.macros]  adds xl/vbaProject.bin and the macro content type, as an .xlsm has
 * @param {string} [spec.doctype]  put in front of xl/workbook.xml's root element
 * @param {Record<string, Uint8Array>} [spec.extra]  more parts
 * @param {number} [spec.level]  deflate level (0 stores)
 * @returns {Uint8Array}
 */
export function makeXlsx(spec) {
    const chunks = [];
    let failed = null;
    const zip = new Zip((err, chunk) => {
        if (err) failed = err;
        else chunks.push(chunk);
    });
    const level = spec.level ?? 6;
    const add = (name, text) => {
        const file = level === 0 ? new ZipPassThrough(name) : new ZipDeflate(name, { level });
        zip.add(file);
        file.push(typeof text === "string" ? strToU8(text) : text, true);
    };
    const strings = new Map();
    const shared = (t) => {
        let i = strings.get(t);
        if (i === undefined) {
            i = strings.size;
            strings.set(t, i);
        }
        return i;
    };
    spec.sheets.forEach((sheet, k) => {
        const file = level === 0 ? new ZipPassThrough(`xl/worksheets/sheet${k + 1}.xml`) : new ZipDeflate(`xl/worksheets/sheet${k + 1}.xml`, { level });
        zip.add(file);
        let buffer = "";
        const flush = (final) => {
            if (buffer.length > 1 << 20 || final) {
                file.push(strToU8(buffer), final);
                buffer = "";
            }
        };
        const rows = typeof sheet.rows === "function" ? sheet.rows() : sheet.rows;
        let r = 0;
        buffer += `${XML}<worksheet ${NS}><dimension ref="A1:${columnLetter(19)}${sheet.usedRangeTo ?? 1}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>`;
        for (const cells of rows) {
            r++;
            let row = `<row r="${r}">`;
            cells.forEach((v, c) => {
                const ref = `${columnLetter(c)}${r}`;
                if (v === null || v === undefined) return;
                if (typeof v === "number") row += `<c r="${ref}"><v>${v}</v></c>`;
                else if (typeof v === "boolean") row += `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
                else if (typeof v === "string") row += `<c r="${ref}" t="s"><v>${shared(v)}</v></c>`;
                else if ("date" in v) {
                    const serial = v.date.getTime() / 86_400_000 + 25_569;
                    row += `<c r="${ref}" s="${serial % 1 === 0 ? 1 : 2}"><v>${serial}</v></c>`;
                } else if ("formula" in v) row += `<c r="${ref}"><f>${escapeXml(v.formula)}</f><v>${v.value}</v></c>`;
                else if ("error" in v) row += `<c r="${ref}" t="e"><v>${escapeXml(v.error)}</v></c>`;
                else if ("inline" in v) row += `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(v.inline)}</t></is></c>`;
                else if ("styleOnly" in v) row += `<c r="${ref}" s="3"/>`;
            });
            buffer += `${row}</row>`;
            flush(false);
        }
        const empty = sheet.emptyCells ?? 1;
        for (let e = r + 1; e <= (sheet.usedRangeTo ?? 0); e++) {
            let row = `<row r="${e}" spans="1:${empty}" s="3" customFormat="1">`;
            for (let c = 0; c < empty; c++) row += `<c r="${columnLetter(c)}${e}" s="3"/>`;
            buffer += `${row}</row>`;
            flush(false);
        }
        buffer += `</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
        flush(true);
    });
    const sheetsXml = spec.sheets.map((s, k) => `<sheet name="${escapeXml(s.name)}" sheetId="${k + 1}"${s.hidden ? ' state="hidden"' : ""} r:id="rId${k + 1}"/>`).join("");
    add("xl/workbook.xml", `${XML}${spec.doctype ?? ""}<workbook ${NS}><workbookPr/><bookViews><workbookView/></bookViews><sheets>${sheetsXml}</sheets></workbook>`);
    const n = spec.sheets.length;
    const rels = spec.sheets.map((_, k) => `<Relationship Id="rId${k + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join("");
    add("xl/_rels/workbook.xml.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
    add("xl/styles.xml", `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>`);
    const si = [...strings.keys()].map((t) => `<si><t xml:space="preserve">${escapeXml(t)}</t></si>`).join("");
    add("xl/sharedStrings.xml", `${XML}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.size}" uniqueCount="${strings.size}">${si}</sst>`);
    const overrides = spec.sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
    const main = spec.macros ? "application/vnd.ms-excel.sheet.macroEnabled.main+xml" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
    add("[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${main}"/>${overrides}</Types>`);
    add("_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    if (spec.macros) add("xl/vbaProject.bin", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2, 3]));
    for (const [name, data] of Object.entries(spec.extra ?? {})) add(name, data);
    zip.end();
    if (failed) throw failed;
    let size = 0;
    for (const c of chunks) size += c.length;
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.length;
    }
    return out;
}

/** A deterministic random number generator (mulberry32), so the generated data is the same each run. */
export function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const TICKET_COLUMNS = [
    "ID", "Number", "Opened", "Closed", "State", "Priority", "Category", "Assigned to", "Group", "Hours",
    "Cost", "Reopened", "Postcode", "Location", "Asset tag", "Short description", "SLA met", "Customer", "Region", "Updated"
];

/**
 * Rows of a ticket export like those of IT service tools: 20 columns of mixed types, a title block of
 * two lines above the header, dates with and without a time, postcodes with leading zeros.
 * @param {number} count  data rows
 */
export function* ticketRows(count, seed = 44) {
    const rnd = random(seed);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const states = ["New", "In progress", "On hold", "Resolved", "Closed", "Cancelled"];
    const categories = ["Hardware", "Software", "Network", "Access", "Database", "Inquiry / Help", "Printer"];
    const groups = ["Service Desk", "Network", "Workplace", "Database", "Security", "Field Services 1", "Field Services 2"];
    const people = Array.from({ length: 180 }, (_, i) => `Agent ${String(i + 1).padStart(3, "0")}`);
    const cities = ["Dresden", "Leipzig", "Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main", "Stuttgart", "Düsseldorf", "Chemnitz"];
    const postcodes = ["01067", "04109", "10115", "20095", "80331", "50667", "60311", "70173", "40213", "09111"];
    const regions = ["East", "North", "South", "West"];
    yield ["Ticket export", null, null, null, "generated by pivotkit's tests"];
    yield [];
    yield TICKET_COLUMNS;
    const start = Date.UTC(2024, 0, 1);
    for (let i = 0; i < count; i++) {
        const opened = start + Math.floor(rnd() * 700 * 86_400) * 1000;
        const closed = rnd() < 0.8 ? opened + Math.floor(rnd() * 30) * 86_400_000 : null;
        const city = Math.floor(rnd() * cities.length);
        yield [
            27_000 + i,
            `INC${String(1_000_000 + i).padStart(7, "0")}`,
            { date: new Date(opened) },
            closed === null ? null : { date: new Date(closed - (closed % 86_400_000)) },
            pick(states),
            1 + Math.floor(rnd() * 4),
            pick(categories),
            pick(people),
            pick(groups),
            Math.round(rnd() * 4000) / 100,
            { formula: `J${i + 4}*85`, value: Math.round(rnd() * 400_000) / 100 },
            rnd() < 0.1,
            postcodes[city],
            cities[city],
            `AST-${String(Math.floor(rnd() * 50_000)).padStart(6, "0")}`,
            `Ticket ${i}: ${pick(["cannot log in", "printer offline", "VPN drops", "new laptop", "password reset", "slow database"])} at ${cities[city]}`,
            rnd() < 0.85,
            `Customer ${Math.floor(rnd() * 900) + 1}`,
            pick(regions),
            { date: new Date(opened + 3_600_000) }
        ];
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const { writeFileSync } = await import("node:fs");
    const [out, rows = "94000", used = "900000"] = process.argv.slice(2);
    const bytes = makeXlsx({ sheets: [{ name: "Tickets", rows: () => ticketRows(Number(rows)), usedRangeTo: Number(used), emptyCells: 20 }] });
    writeFileSync(out, bytes);
    console.log(`${out}: ${bytes.length.toLocaleString("en-US")} bytes`);
}
