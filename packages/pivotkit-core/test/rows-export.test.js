import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { readSheet } from "read-excel-file/node";
import { cellRows, computePivot, encode, toGrid } from "../src/index.js";
import { rowsToCsv, rowsToCsvBytes, rowsToXlsx, toJson, toTsv } from "../src/export.js";
import { SALES } from "./fixtures.js";

const ROWS = [
    { Name: "=HYPERLINK(\"x\")", Amount: 1234.5678912, Price: 0.25, Day: "2026-07-03", At: "2026-07-03T08:15:00Z", Ok: true, Id: 40072 },
    { Name: "Plain, with comma", Amount: -2, Price: null, Day: "2026-07-04", At: "2026-07-04T00:00:00Z", Ok: false, Id: 7 },
    { Name: "tab\there", Amount: 3, Price: 1, Day: null, At: null, Ok: null, Id: null }
];
const data = encode(ROWS);
const all = [0, 1, 2];

test("rowsToCsv: a header of display names, typed values, the formula guard", () => {
    const csv = rowsToCsv(data, all, { labels: { fields: { amount: "Amount (EUR)" } }, formats: { PRICE: "percent", id: "text" } });
    const lines = csv.trimEnd().split("\r\n");
    assert.equal(lines[0], "Name,Amount (EUR),Price,Day,At,Ok,Id");
    // the formula gets a leading ', numbers keep full precision, a percent is written as the panel shows it
    assert.equal(lines[1], `"'=HYPERLINK(""x"")",1234.5678912,25%,2026-07-03,2026-07-03 08:15:00,true,40072`);
    assert.equal(lines[2], `"Plain, with comma",-2,,2026-07-04,2026-07-04,false,7`);
    assert.equal(lines[3], "tab\there,3,100%,,,,");
});

test("rowsToCsv: the locale decides separator and decimal mark; columns pick and order fields", () => {
    const csv = rowsToCsv(data, [0], { locale: "de-DE", columns: ["amount", "name", "missing"], labels: { true: "ja", false: "nein" } });
    assert.equal(csv, `Amount;Name\r\n1234,5678912;"'=HYPERLINK(""x"")"\r\n`);
    const yes = rowsToCsv(data, [0, 1], { columns: ["Ok"], labels: { true: "ja", false: "nein" } });
    assert.equal(yes, "Ok\r\nja\r\nnein\r\n");
});

test("rowsToCsvBytes writes UTF-8 with a byte order mark unless bom is false", () => {
    const bytes = rowsToCsvBytes(data, [1], { columns: ["Name"] });
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(new TextDecoder().decode(rowsToCsvBytes(data, [1], { columns: ["Name"], bom: false })), `Name\r\n"Plain, with comma"\r\n`);
});

test("rowsToXlsx: typed cells, the panel's number formats, a frozen bold header, inline strings", async () => {
    const bytes = rowsToXlsx(data, all, { sheetName: "Central – Jul 2026", formats: { price: "percent", id: "text" } });
    const parts = unzipSync(bytes);
    const sheetXml = strFromU8(parts["xl/worksheets/sheet1.xml"]);
    assert.match(strFromU8(parts["xl/workbook.xml"]), /<sheet name="Central – Jul 2026"/);
    assert.match(sheetXml, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
    assert.doesNotMatch(sheetXml, /<f>/);
    const formats = strFromU8(parts["xl/styles.xml"]);
    // up to 6 decimals as the panel shows a number without a format; the date as the locale writes it
    assert.match(formats, /formatCode="#,##0.000000"/);
    assert.match(formats, /formatCode="mmm d&quot;,&quot; yyyy"/);
    const sheet = await readSheet(Buffer.from(bytes));
    assert.deepEqual(sheet[0], ["Name", "Amount", "Price", "Day", "At", "Ok", "Id"]);
    assert.equal(sheet[1][0], "=HYPERLINK(\"x\")");
    assert.equal(sheet[1][1], 1234.5678912);
    assert.equal(sheet[1][2], 0.25);
    assert.ok(sheet[1][3] instanceof Date);
    assert.equal(sheet[1][5], "true");
    // an identifier with the format "text" stays text
    assert.equal(sheet[1][6], "40072");
    assert.equal(sheet[3][3], null);
});

test("rows exports check their input and count rows x columns against limits.cells", () => {
    assert.throws(() => rowsToCsv(SALES, [0]), { code: "INVALID_ARGUMENT" });
    assert.throws(() => rowsToCsv(data, null), { code: "INVALID_ARGUMENT" });
    assert.throws(() => rowsToCsv(data, [3]), { code: "INVALID_ARGUMENT" });
    assert.throws(() => rowsToXlsx(data, all, { limits: { cells: 10 } }), { code: "LIMIT_EXCEEDED" });
    assert.throws(() => rowsToCsv(data, all, "x"), { code: "INVALID_OPTION" });
});

test("rows of a drill-down: the rows behind a cell, as the panel lists them", () => {
    const sales = encode(SALES);
    const result = computePivot(sales, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    const csv = rowsToCsv(sales, cellRows(result, { row: ["South"] }), { columns: ["Rep", "Units"] });
    assert.equal(csv, "Rep,Units\r\nCid,7\r\nCid,1\r\nDee,\r\n");
});

const sales = encode(SALES);
const grid = toGrid(
    computePivot(sales, {
        rows: ["Region", "Product"],
        cols: ["Rep"],
        values: [{ field: "Units", agg: "sum" }],
        filters: [{ field: "Rep", type: "include", items: ["Ann", "Cid"] }]
    }),
    { locale: "en-US" }
);

test("toTsv: the grid as shown, tab-separated, row labels repeated, totals included", () => {
    const lines = toTsv(grid).trimEnd().split("\r\n");
    assert.equal(lines.length, grid.rows.length);
    assert.equal(lines[0].split("\t").length, grid.columnCount);
    assert.ok(lines.some((l) => l.startsWith("Grand Total")), lines.join("\n"));
    const north = lines.filter((l) => l.startsWith("North\t"));
    assert.ok(north.length >= 2, "the merged label North is repeated");
});

test("toTsv: display texts, quoted when they hold a tab, a line break or a quote; formulas guarded", () => {
    assert.equal(toTsv([["A", "B"], ["1,234.5", "a\tb"], ["=1+1", 'say "hi"'], ["-5%", "x\ny"]]), 'A\tB\r\n1,234.5\t"a\tb"\r\n\'=1+1\t"say ""hi"""\r\n-5%\t"x\ny"\r\n');
    assert.throws(() => toTsv({ rows: 1 }), { code: "INVALID_ARGUMENT" });
    assert.throws(() => toTsv(["a"]), { code: "INVALID_ARGUMENT" });
});

test("toJson: header texts per value column, labels and raw values per row", () => {
    const json = JSON.parse(toJson(grid));
    assert.deepEqual(json.rowHeaders, ["Region", "Product"]);
    assert.deepEqual(json.columns[0], { labels: ["Ann", "Sum of Units"], value: "Sum of Units", total: 0 });
    assert.equal(json.columns.at(-1).total, 2);
    const northA = json.rows.find((r) => r.labels[0] === "North" && r.labels[1] === "A");
    assert.deepEqual(northA, { labels: ["North", "A"], total: 0, values: [3, null, 3] });
    const grand = json.rows.at(-1);
    assert.equal(grand.total, 2);
    assert.equal(grand.values.length, json.columns.length);
    assert.equal(toJson(grid, { space: 0 }).includes("\n"), false);
});

test("toJson writes dates as ISO dates and text values as they are", () => {
    const g = toGrid(computePivot(sales, { rows: ["Region"], values: [{ field: "Date", agg: "max" }, { field: "Rep", agg: "first" }] }));
    const json = JSON.parse(toJson(g));
    const north = json.rows.find((r) => r.labels[0] === "North");
    assert.deepEqual(north.values, ["2026-02-03", "Ann"]);
});
