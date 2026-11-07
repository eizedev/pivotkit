import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { readSheet } from "read-excel-file/node";
import { computePivot, encode, toGrid } from "../src/index.js";
import { toCsv, toCsvBytes, toXlsx } from "../src/export.js";
import { csvSeparator, neutralizeFormula } from "../src/csv.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const view = {
    rows: ["Region", "Product"],
    cols: ["Rep"],
    values: [
        { field: "Units", agg: "sum", format: "number:1", conditional: { type: "colorScale" } },
        { field: "Date", agg: "max" }
    ],
    filters: [{ field: "Rep", type: "include", items: ["Ann", "Cid"] }]
};
const grid = toGrid(computePivot(data, view), { locale: "en-US" });
const bytes = toXlsx(grid, { sheetName: "Sales: 2026 [draft]" });
const parts = unzipSync(bytes);
const xml = (name) => strFromU8(parts[name]);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

test("the workbook is a zip of well-formed XML parts", () => {
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual(Object.keys(parts).sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    for (const name of Object.keys(parts)) {
        assert.equal(XMLValidator.validate(xml(name)), true, name);
    }
    assert.match(xml("xl/workbook.xml"), /<sheet name="Sales {2}2026 {2}draft" sheetId="1"/);
});

test("merged headers, frozen panes, column widths and native conditional formatting", () => {
    const sheet = parser.parse(xml("xl/worksheets/sheet1.xml")).worksheet;
    const merges = [].concat(sheet.mergeCells.mergeCell).map((m) => m.ref);
    assert.equal(Number(sheet.mergeCells.count), grid.merges.length);
    // "Ann" spans her two values in the first header row
    assert.ok(merges.includes("C1:D1"), merges.join(" "));
    const pane = sheet.sheetViews.sheetView.pane;
    assert.deepEqual([pane.xSplit, pane.ySplit, pane.state, pane.topLeftCell], ["2", "2", "frozen", "C3"]);
    assert.equal([].concat(sheet.cols.col).length, grid.columnCount);
    const cf = sheet.conditionalFormatting;
    assert.equal(cf.cfRule.type, "colorScale");
    assert.equal([].concat(cf.cfRule.colorScale.color).length, 3);
});

test("values are typed numbers and dates; totals are bold; a reader gets them back", async () => {
    const styles = parser.parse(xml("xl/styles.xml")).styleSheet;
    const fmts = [].concat(styles.numFmts.numFmt).map((f) => f.formatCode);
    assert.ok(fmts.includes("#,##0.0"));
    // the grid's date format in Excel's terms: "Jan 5, 2026"
    assert.ok(fmts.includes('mmm d"," yyyy'), fmts.join(" | "));
    const sheet = await readSheet(Buffer.from(bytes));
    // the column field's name sits next to its labels, above the row field names
    assert.deepEqual(sheet[0].slice(0, 3), [null, "Rep", "Ann"]);
    const north = sheet.find((row) => row[0] === "North");
    assert.equal(north[1], "A");
    assert.equal(north[2], 3);
    assert.ok(north[3] instanceof Date);
    assert.equal(north[3].toISOString(), "2026-01-05T00:00:00.000Z");
    const grand = sheet.at(-1);
    assert.equal(grand[0], "Grand Total");
    assert.equal(typeof grand[2], "number");
    // bold font on the total row
    const boldXfs = [].concat(styles.cellXfs.xf).map((x, i) => (x.fontId === "1" ? i : -1)).filter((i) => i >= 0);
    const lastRow = [].concat(parser.parse(xml("xl/worksheets/sheet1.xml")).worksheet.sheetData.row).at(-1);
    assert.ok([].concat(lastRow.c).every((c) => boldXfs.includes(Number(c.s))));
});

test("text never becomes a formula in XLSX and control characters are removed", () => {
    const d = encode([{ k: "=HYPERLINK(\"x\")", v: 1 }, { k: "a\u0001b<&>", v: 2 }]);
    const parts2 = unzipSync(toXlsx(toGrid(computePivot(d, { rows: ["k"], values: [{ field: "v", agg: "sum" }] }))));
    const sheet = strFromU8(parts2["xl/worksheets/sheet1.xml"]);
    assert.equal(XMLValidator.validate(sheet), true);
    assert.ok(!sheet.includes("<f>"));
    assert.ok(sheet.includes("ab&lt;&amp;&gt;"));
    assert.ok(sheet.includes('t="inlineStr"'));
});

test("CSV: separator by locale, quoting, repeated row labels", () => {
    assert.equal(csvSeparator("en-US"), ",");
    assert.equal(csvSeparator("de-DE"), ";");
    const d = encode([
        { name: "Smith, John", note: 'say "hi"', v: 1.5 },
        { name: "Line\nbreak", note: "x", v: -2 },
        { name: "Smith, John", note: "y", v: 1000.25 }
    ]);
    const view = { rows: ["name", "note"], values: [{ field: "v", agg: "sum" }], totals: { rowSubtotals: false } };
    const g = toGrid(computePivot(d, view), { locale: "en-US" });
    const lines = toCsv(g).split("\r\n");
    assert.deepEqual(lines, [
        "name,note,Sum of v",
        '"Line\nbreak",x,-2',
        '"Smith, John","say ""hi""",1.5',
        '"Smith, John",y,1000.25',
        "Grand Total,,999.75",
        ""
    ]);
    // the grid's locale decides separator and decimal mark
    const de = toCsv(toGrid(computePivot(d, view), { locale: "de-DE" })).split("\r\n");
    assert.equal(de[3], "Smith, John;y;1000,25");
});

test("CSV formula injection: formulas get a leading quote, numbers and number ranges do not", () => {
    for (const s of ["=1+1", "+1+1", "-2+3", "-1+cmd|' /C calc'!A0", "@SUM(A1)", "\tx", "\rx", "  =1+1", "\n=1", "\u0001@x", "-x", "+A1"]) {
        assert.equal(neutralizeFormula(s), `'${s}`, JSON.stringify(s));
    }
    for (const s of ["a=1", "-1", "+1", "-5%", "-1,234.5", "-10 – 0", "-0.5 – 0", "1 – 2", "(blank)"]) {
        assert.equal(neutralizeFormula(s), s, JSON.stringify(s));
    }
    const d = encode([{ k: "=cmd|' /C calc'!A0", v: -5 }, { k: "@x", v: 1 }]);
    const csv = toCsv(toGrid(computePivot(d, { rows: ["k"], values: [{ field: "v", agg: "sum" }] }), { locale: "en-US" }));
    assert.ok(csv.includes("'=cmd|' /C calc'!A0,-5"), csv);
    assert.ok(csv.includes("'@x,1"), csv);
});

test("CSV bytes start with a byte order mark unless switched off", () => {
    const g = toGrid(computePivot(data, { values: [{ agg: "count" }] }));
    const b = toCsvBytes(g);
    assert.deepEqual([...b.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.notEqual(toCsvBytes(g, { bom: false })[0], 0xef);
});

test("CSV dates are ISO dates", () => {
    const g = toGrid(computePivot(data, { values: [{ field: "Date", agg: "max" }] }), { locale: "en-US" });
    assert.match(toCsv(g), /Grand Total,2026-04-30\r\n$/);
});

/** The worksheet XML, the number format code per cell reference and the cells by reference. */
function sheetOf(xlsxBytes) {
    const files = unzipSync(xlsxBytes);
    const sheetXml = strFromU8(files["xl/worksheets/sheet1.xml"]);
    const styles = parser.parse(strFromU8(files["xl/styles.xml"])).styleSheet;
    const codes = new Map([].concat(styles.numFmts?.numFmt ?? []).map((f) => [f.numFmtId, f.formatCode]));
    const xfs = [].concat(styles.cellXfs.xf);
    const cells = new Map();
    for (const row of [].concat(parser.parse(sheetXml).worksheet.sheetData.row)) {
        for (const c of [].concat(row.c ?? [])) {
            cells.set(c.r, { ...c, code: codes.get(xfs[Number(c.s ?? 0)].numFmtId) ?? "General" });
        }
    }
    return { sheetXml, cells, workbook: strFromU8(files["xl/workbook.xml"]) };
}

const gridOf = (rows, view, locale = "en-US") => toGrid(computePivot(encode(rows), view), { locale });

test("XLSX number formats show cells as the grid does", () => {
    const rows = [{ k: "a", v: 28 }, { k: "b", v: 1.5 }, { k: "c", v: 2.345 }];
    const value = (format, locale) => {
        const { cells } = sheetOf(toXlsx(gridOf(rows, { rows: ["k"], values: [{ field: "v", agg: "sum", format }], totals: { grandTotalRow: false } }, locale)));
        return ["B2", "B3", "B4"].map((ref) => cells.get(ref).code);
    };
    // "number": up to two decimals, per cell, without a trailing dot
    assert.deepEqual(value("number"), ["#,##0", "#,##0.0", "#,##0.00"]);
    // the automatic format: the same decimals in the whole column, those of the data (at most two)
    assert.deepEqual(value(undefined), ["#,##0.00", "#,##0.00", "#,##0.00"]);
    assert.deepEqual(value("number:1"), ["#,##0.0", "#,##0.0", "#,##0.0"]);
    // the currency symbol and its place as the locale writes it
    assert.deepEqual(value("currency:eur").slice(0, 1), ['"€"#,##0.00']);
    // (de-DE puts a no-break space before the symbol and the percent sign)
    assert.deepEqual(value("currency:eur", "de-DE").slice(0, 1), ['#,##0.00"\u00a0€"']);
    assert.deepEqual(value("percent:1", "de-DE").slice(0, 1), ['#,##0.0"\u00a0"%']);
    // percent100 keeps its value and shows a literal percent sign
    assert.deepEqual(value("percent100"), ['#,##0"%"', '#,##0.0"%"', '#,##0.0"%"']);
    assert.deepEqual(value("compact").slice(0, 1), ["#,##0"]);
    const big = sheetOf(toXlsx(gridOf([{ k: "a", v: 1_234_567 }], { rows: ["k"], values: [{ field: "v", agg: "sum", format: "compact" }] }))).cells;
    assert.equal(big.get("B2").code, '#,##0.0,,"M"');
    const pct = sheetOf(toXlsx(gridOf([{ k: "a", v: 1 }, { k: "b", v: 3 }], { rows: ["k"], values: [{ field: "v", agg: "sum", showAs: "percentOfGrandTotal" }] }))).cells;
    // a calculation's own percent: one decimal in every cell
    assert.deepEqual([pct.get("B2").code, pct.get("B4").code], ["#,##0.0%", "#,##0.0%"]);
    // "percent" chosen in the view: up to one decimal per cell
    const own = sheetOf(toXlsx(gridOf([{ k: "a", v: 1 }, { k: "b", v: 3 }], { rows: ["k"], values: [{ field: "v", agg: "sum", showAs: "percentOfGrandTotal", format: "percent" }] }))).cells;
    assert.deepEqual([own.get("B2").code, own.get("B4").code], ["#,##0%", "#,##0%"]);
    const pct3 = sheetOf(toXlsx(gridOf([{ k: "a", v: 1 }, { k: "b", v: 2 }], { rows: ["k"], values: [{ field: "v", agg: "sum", showAs: "percentOfGrandTotal", format: "percent" }] }))).cells;
    assert.equal(pct3.get("B2").code, "#,##0.0%");
});

test("XLSX: dates before 1900-03-01 get Excel's serials, earlier than 1900 is text", () => {
    const { cells } = sheetOf(toXlsx(gridOf(
        [{ d: "1900-02-28" }, { d: "1900-03-01" }, { d: "1899-12-31" }, { d: "1900-01-01" }],
        { rows: ["d"], values: [{ field: "d", agg: "max" }], totals: { grandTotalRow: false } }
    )));
    // body rows in date order: 1899-12-31, 1900-01-01, 1900-02-28, 1900-03-01
    assert.equal(cells.get("B2").t, "inlineStr");
    assert.equal(cells.get("B3").v, 1);
    assert.equal(cells.get("B4").v, 59);
    assert.equal(cells.get("B5").v, 61);
});

test("XLSX: text is cut at Excel's 32,767 characters, a number label stays a number", () => {
    const { sheetXml, cells } = sheetOf(toXlsx(gridOf([{ k: "x".repeat(40_000), v: 1 }, { k: "y", v: 2 }], { rows: ["k"], values: [{ field: "v", agg: "sum" }] })));
    const longest = Math.max(...[...sheetXml.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1].length));
    assert.equal(longest, 32_767);
    const years = sheetOf(toXlsx(gridOf([{ d: "2026-01-01", v: 1 }], { derived: [{ name: "Year", field: "d", by: "year" }], rows: ["Year"], values: [{ field: "v", agg: "sum" }] }))).cells;
    assert.equal(years.get("A2").v, 2026);
    assert.equal(years.get("A2").t, undefined);
    assert.ok(cells.get("A2"));
});

test("XLSX sheet names: control characters go, History is reserved", () => {
    const grid = gridOf([{ k: "a" }], { rows: ["k"] });
    assert.match(sheetOf(toXlsx(grid, { sheetName: "History" })).workbook, /<sheet name="History 1"/);
    assert.match(sheetOf(toXlsx(grid, { sheetName: "history" })).workbook, /<sheet name="history 1"/);
    assert.match(sheetOf(toXlsx(grid, { sheetName: "a\u0001b\nc" })).workbook, /<sheet name="a b c"/);
    assert.match(sheetOf(toXlsx(grid, { sheetName: "'''" })).workbook, /<sheet name="Pivot"/);
});

test("XLSX data bars start at zero as in the grid", () => {
    const bar = (values) => {
        const rows = values.map((v, i) => ({ k: `k${i}`, v }));
        const g = gridOf(rows, { rows: ["k"], values: [{ field: "v", agg: "sum", conditional: { type: "dataBar" } }] });
        return sheetOf(toXlsx(g)).sheetXml.match(/<dataBar>(.*?)<color/)[1];
    };
    assert.equal(bar([5, 10]), '<cfvo type="num" val="0"/><cfvo type="max"/>');
    assert.equal(bar([-5, 10]), '<cfvo type="min"/><cfvo type="max"/>');
    assert.equal(bar([-5, -10]), '<cfvo type="min"/><cfvo type="num" val="0"/>');
});

test("XLSX theme: default colours of conditional formats can be replaced", () => {
    const g = gridOf([{ k: "a", v: 1 }, { k: "b", v: 2 }], { rows: ["k"], values: [{ field: "v", agg: "sum", conditional: { type: "dataBar" } }] });
    assert.match(sheetOf(toXlsx(g, { theme: { dataBar: "#123456" } })).sheetXml, /<color rgb="FF123456"\/>/);
});

test("CSV numbers: tiny and huge values keep their value; minus zero is 0", () => {
    const csv = toCsv(gridOf([{ k: "a", v: -1.5e-20 }, { k: "b", v: 1e21 }, { k: "c", v: -0 }, { k: "d", v: 0.1 + 0.2 }], { rows: ["k"], values: [{ field: "v", agg: "sum" }], totals: { grandTotalRow: false } }));
    assert.deepEqual(csv.split("\r\n").slice(1, 5), ["a,-1.5e-20", "b,1e+21", "c,0", "d,0.3"]);
    const de = toCsv(gridOf([{ k: "a", v: -1.5e-20 }], { rows: ["k"], values: [{ field: "v", agg: "sum" }] }, "de-DE"));
    assert.equal(de.split("\r\n")[1], "a;-1,5e-20");
});

test("CSV: bin labels and negative numbers as text are not altered; the grid locale decides the separator", () => {
    const g = gridOf([{ x: -5 }, { x: 5 }], { derived: [{ name: "B", field: "x", by: "bin", size: 10 }], rows: ["B"], values: [{ agg: "count" }] });
    assert.deepEqual(toCsv(g).split("\r\n").slice(1, 3), ["-10 – 0,1", "0 – 10,1"]);
    const de = gridOf([{ k: "a", v: 1.5 }], { rows: ["k"], values: [{ field: "v", agg: "sum" }], formatting: { locale: "de-DE" } });
    assert.equal(toCsv(de).split("\r\n")[1], "a;1,5");
    assert.equal(toCsv(de, { separator: "\t" }).split("\r\n")[1], "a\t1,5");
});

test("CSV writes a percent as the table shows it, in percent with full precision", () => {
    const view = { rows: ["k"], values: [{ field: "v", agg: "sum", showAs: "percentOfGrandTotal" }, { field: "v", agg: "sum", format: "percent100" }, { field: "v", agg: "sum" }] };
    const rows = [{ k: "a", v: 1 }, { k: "b", v: 2 }];
    const en = toCsv(gridOf(rows, view)).split("\r\n");
    assert.equal(en[1], "a,33.3333333333333%,1%,1");
    assert.equal(en[3], "Grand Total,100%,3%,3");
    const de = toCsv(gridOf(rows, view, "de-DE")).split("\r\n");
    assert.equal(de[1], "a;33,3333333333333%;1%;1");
    // a fraction times 100 keeps 15 significant digits, without binary noise
    assert.equal(toCsv(gridOf([{ k: "a", v: 7 }, { k: "b", v: 93 }], { rows: ["k"], values: [{ field: "v", agg: "sum", showAs: "percentOfGrandTotal" }] })).split("\r\n")[1], "a,7%");
});
