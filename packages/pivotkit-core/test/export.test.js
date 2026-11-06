import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { readSheet } from "read-excel-file/node";
import { computePivot, csvSeparator, encode, neutralizeFormula, toCsv, toCsvBytes, toGrid, toXlsx } from "../src/index.js";
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
    assert.ok(fmts.includes("yyyy-mm-dd"));
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
    const g = toGrid(computePivot(d, { rows: ["name", "note"], values: [{ field: "v", agg: "sum" }], totals: { rowSubtotals: false } }), { locale: "en-US" });
    const lines = toCsv(g, { locale: "en-US" }).split("\r\n");
    assert.deepEqual(lines, [
        "name,note,Sum of v",
        '"Line\nbreak",x,-2',
        '"Smith, John","say ""hi""",1.5',
        '"Smith, John",y,1000.25',
        "Grand Total,,999.75",
        ""
    ]);
    const de = toCsv(g, { locale: "de-DE" }).split("\r\n");
    assert.equal(de[3], "Smith, John;y;1000,25");
});

test("CSV formula injection: = + - @ tab and CR get a leading quote, numbers do not", () => {
    for (const s of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) {
        assert.equal(neutralizeFormula(s), `'${s}`);
    }
    assert.equal(neutralizeFormula("a=1"), "a=1");
    const d = encode([{ k: "=cmd|' /C calc'!A0", v: -5 }, { k: "@x", v: 1 }]);
    const csv = toCsv(toGrid(computePivot(d, { rows: ["k"], values: [{ field: "v", agg: "sum" }] }), { locale: "en-US" }), { locale: "en-US" });
    assert.ok(csv.includes("'=cmd|' /C calc'!A0,-5"), csv);
    assert.ok(csv.includes("'@x,1"), csv);
});

test("CSV bytes start with a byte order mark unless switched off", () => {
    const g = toGrid(computePivot(data, { values: [{ agg: "count" }] }));
    const b = toCsvBytes(g, { locale: "en-US" });
    assert.deepEqual([...b.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.notEqual(toCsvBytes(g, { bom: false, locale: "en-US" })[0], 0xef);
});

test("CSV dates are ISO dates", () => {
    const g = toGrid(computePivot(data, { values: [{ field: "Date", agg: "max" }] }), { locale: "en-US" });
    assert.match(toCsv(g, { locale: "en-US" }), /Grand Total,2026-04-30\r\n$/);
});
