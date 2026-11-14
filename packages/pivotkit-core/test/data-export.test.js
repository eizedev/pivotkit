// The data behind a report as a file (dataToCsv, dataToJson): every row, the values as they are, the
// fields under their own names, so the file read back (pivotkit-core/import's readFile, as the CLI
// reads --data) gives the same columns, types and values a view was made on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode } from "../src/index.js";
import { dataToCsv, dataToCsvBytes, dataToJson } from "../src/export.js";
import { readFile } from "../src/import.js";

const ROWS = [
    { Name: "=HYPERLINK(\"x\")", Amount: 1234.5678912, Tiny: 1e-7, Huge: 1.5e21, Day: "2026-07-03", At: "2026-07-03T08:15:00Z", Ok: true, Code: "007" },
    { Name: "Plain, with comma", Amount: -2, Tiny: 0.1 + 0.2, Huge: -3, Day: "2026-07-04", At: "2026-07-04T00:00:00.250Z", Ok: false, Code: "12" },
    { Name: "line\nbreak ‮and bidi", Amount: null, Tiny: null, Huge: null, Day: null, At: null, Ok: null, Code: "A-1" }
];
const data = encode(ROWS);

const csvLines = (text) => text.trimEnd().split("\r\n");

test("dataToCsv: the fields' own names, every row, raw values, comma and dot whatever the locale", () => {
    const lines = csvLines(dataToCsv(data, { locale: "de-DE" }));
    assert.equal(lines[0], "Name,Amount,Tiny,Huge,Day,At,Ok,Code");
    // a number with every digit it has (no format, no rounding to 15 digits), a day without a time, a
    // time with its milliseconds, true/false, the formula guard on text
    assert.equal(lines[1], `"'=HYPERLINK(""x"")",1234.5678912,1e-7,1.5e+21,2026-07-03,2026-07-03T08:15:00,true,007`);
    assert.equal(lines[2], `"Plain, with comma",-2,0.30000000000000004,-3,2026-07-04,2026-07-04T00:00:00.250,false,12`);
    // a line break is kept inside quotes, a bidi control left out (as every export does); blanks empty
    assert.equal(lines.length, 4);
    assert.equal(lines[3], `"line\nbreak and bidi",,,,,,,A-1`);
});

test("dataToCsv: a host's display names do not change the header (a view names fields by their own names)", () => {
    const csv = dataToCsv(data, { columns: ["amount", "NAME", "missing"] });
    assert.equal(csvLines(csv)[0], "Amount,Name");
});

test("dataToCsv: a derived field of a view is no column of the data file", () => {
    const view = { rows: ["Day by year"], derived: [{ name: "Day by year", field: "Day", by: "year" }], values: [{ field: "Amount", agg: "sum" }] };
    const result = computePivot(data, view);
    assert.equal(result.issues.filter((i) => i.severity !== "warning").length, 0);
    assert.equal(csvLines(dataToCsv(data))[0], "Name,Amount,Tiny,Huge,Day,At,Ok,Code");
    assert.deepEqual(Object.keys(JSON.parse(dataToJson(data))[0]), ["Name", "Amount", "Tiny", "Huge", "Day", "At", "Ok", "Code"]);
});

test("dataToCsv: a blank as the only value of a line is written \"\", so the line holds a row for any reader", async () => {
    const one = encode([{ A: 1 }, { A: null }, { A: 3 }]);
    assert.equal(dataToCsv(one), 'A\r\n1\r\n""\r\n3\r\n');
    // pivotkit's own reader skips a row without any value, as it does for every format (documented)
    const back = await readFile(new File([dataToCsv(one)], "one.csv"));
    assert.equal(back.rowCount, 2);
    assert.ok(back.notes.some((n) => n.code === "ROWS_EMPTY"));
});

test("columns: a name given twice is written once (CSV and JSON agree); a name of no column is left out", () => {
    assert.equal(csvLines(dataToCsv(data, { columns: ["Amount", "amount", "nope"] }))[0], "Amount");
    assert.deepEqual(Object.keys(JSON.parse(dataToJson(data, { columns: ["Amount", "amount"] }))[0]), ["Amount"]);
});

test("dataToCsvBytes: UTF-8 with a byte order mark unless bom is false", () => {
    const bytes = dataToCsvBytes(data, { columns: ["Code"] });
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(new TextDecoder().decode(dataToCsvBytes(data, { columns: ["Code"], bom: false })), "Code\r\n007\r\n12\r\nA-1\r\n");
});

test("dataToJson: an array of row objects with typed values, null for a blank, no formula guard", () => {
    const rows = JSON.parse(dataToJson(data));
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], { Name: "=HYPERLINK(\"x\")", Amount: 1234.5678912, Tiny: 1e-7, Huge: 1.5e21, Day: "2026-07-03", At: "2026-07-03T08:15:00", Ok: true, Code: "007" });
    // the text as it is: JSON is read by programs, not run by a spreadsheet
    assert.deepEqual(rows[2], { Name: "line\nbreak \u202Eand bidi", Amount: null, Tiny: null, Huge: null, Day: null, At: null, Ok: null, Code: "A-1" });
});

test("an empty data set: the header alone, an empty array", () => {
    const empty = encode({ columns: ["A", "B"], types: ["string", "number"], data: [[], []] });
    assert.equal(dataToCsv(empty), "A,B\r\n");
    assert.equal(dataToJson(empty).trim(), "[]");
});

test("rows x columns count against limits.cells; data must come from encode()", () => {
    assert.throws(() => dataToCsv(data, { limits: { cells: 10 } }), { code: "LIMIT_EXCEEDED" });
    assert.throws(() => dataToJson(data, { limits: { cells: 10 } }), { code: "LIMIT_EXCEEDED" });
    assert.throws(() => dataToCsv(ROWS), /encode/);
});

/** Each column of encoded data as [name, type, values], the values as the report reads them. */
function columnsOf(encoded) {
    return encoded.columns.map((c) => [c.name, c.type, Array.from(c.codes, (k) => (k < 0 ? null : c.dict[k]))]);
}

// every field but Name: its formula guard and line break are the file's on purpose
const ROUND = ["Amount", "Tiny", "Huge", "Day", "At", "Ok", "Code"];
const roundColumns = (encoded) => columnsOf(encoded).filter(([name]) => ROUND.includes(name));

test("read back as the CLI reads --data, the CSV gives the same columns, types and values", async () => {
    // Code keeps its leading zeros as text, Tiny and Huge their exponents
    const table = await readFile(new File([dataToCsvBytes(data, { columns: ROUND })], "data.csv"));
    const back = encode(table);
    assert.deepEqual(columnsOf(back), roundColumns(data));
    assert.equal(back.column("At").dateOnly, false);
    assert.equal(back.column("Day").dateOnly, true);
});

test("read back, the JSON keeps text that looks like a number as text (a CSV cannot say so)", async () => {
    const ids = encode([{ Year: "2024", N: 1 }, { Year: "2025", N: 2 }]);
    const json = encode(await readFile(new File([dataToJson(ids)], "data.json")));
    assert.deepEqual(columnsOf(json), columnsOf(ids));
    const csv = encode(await readFile(new File([dataToCsv(ids)], "data.csv")));
    assert.equal(csv.column("Year").type, "number");
});

test("read back, the JSON gives the same columns, types and values", async () => {
    const back = encode(await readFile(new File([dataToJson(data, { columns: ROUND })], "data.json")));
    assert.deepEqual(columnsOf(back), roundColumns(data));
});

test("a field name a spreadsheet would run gets the formula guard in the CSV; the JSON keeps it", () => {
    const named = encode([{ "-Net": 5, "=x": "a" }]);
    assert.equal(csvLines(dataToCsv(named))[0], "'-Net,'=x");
    assert.deepEqual(Object.keys(JSON.parse(dataToJson(named))[0]), ["-Net", "=x"]);
});

test("a field named __proto__ is a key like any other in the JSON", () => {
    // JSON.parse makes "__proto__" an own key, as a host's rows from an API have it
    const odd = encode(JSON.parse('[{"__proto__":"x","A":1}]'));
    assert.equal(odd.column("__proto__")?.name, "__proto__");
    const text = dataToJson(odd);
    assert.equal(text, '[\n{"__proto__":"x","A":1}\n]\n');
});

test("a date beyond the year 9999 is written whole (its leading + guarded in the CSV)", () => {
    const far = encode([{ When: new Date(Date.UTC(10000, 0, 2)) }]);
    assert.equal(csvLines(dataToCsv(far))[1], "'+010000-01-02");
    assert.deepEqual(JSON.parse(dataToJson(far)), [{ When: "+010000-01-02" }]);
});
