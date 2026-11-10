// pivotkit-xlsx on workbooks built as Excel writes them (make-xlsx.js): types from cell formats, the
// first visible sheet, the used range of formatted empty cells, and every refusal before parsing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync, strToU8 } from "fflate";
import { PivotkitError, computePivot, encode, toGrid } from "pivotkit-core";
import { readFile, readerFor, validatePlugin } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";
import { read, sheets } from "pivotkit-xlsx/reader";
import { TICKET_COLUMNS, makeXlsx, ticketRows } from "./make-xlsx.js";

const col = (t, name) => t.data[t.columns.indexOf(name)];
const typeOf = (t, name) => t.types[t.columns.indexOf(name)];
const fileOf = (bytes, name = "book.xlsx") => new File([bytes], name);
const rejects = (promise, reason, check = () => true) =>
    assert.rejects(promise, (e) => e instanceof PivotkitError && e.details.reason === reason && check(e));

const tickets = (count, extra = {}) =>
    makeXlsx({ sheets: [{ name: "Notes", hidden: true, rows: [["internal"], ["x"]] }, { name: "Tickets", rows: () => ticketRows(count), ...extra }, { name: "Summary", rows: [["Total"], [count]] }] });

test("a ticket export: the first visible sheet below its title block, types from the cell formats", async () => {
    const t = await read(fileOf(tickets(2_000)));
    assert.deepEqual(t.columns, TICKET_COLUMNS);
    assert.equal(t.rowCount, 2_000);
    assert.equal(t.notes[0].message, 'Read sheet "Tickets" of 3 sheets.');
    assert.equal(t.notes[1].message, "2 line(s) above the column names were skipped (a title block).");
    assert.deepEqual(t.types, [
        "number", "string", "date", "date", "string", "number", "string", "string", "string", "number",
        "number", "boolean", "string", "string", "string", "string", "boolean", "string", "string", "date"
    ]);
    assert.equal(col(t, "ID")[0], 27_000);
    assert.equal(col(t, "Number")[0], "INC1000000");
    // a date and time to the second, a date without a time, both wall clock
    assert.match(col(t, "Opened")[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.ok(col(t, "Closed").some((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
    assert.ok(col(t, "Closed").includes(null));
    // a formula's saved value, never the formula
    assert.equal(typeof col(t, "Cost")[0], "number");
    // postcodes stored as text keep their leading zero
    assert.ok(col(t, "Postcode").includes("01067"));
    assert.ok(col(t, "Location").includes("München"));
    // into the engine as it is
    const data = encode(t);
    const grid = toGrid(computePivot(data, { version: 1, rows: ["Region"], values: [{ field: "Hours", agg: "sum" }] }));
    assert.equal(grid.rows.length > 4, true);
});

test("sheets: names, order and visibility; read one by name or by index", async () => {
    const bytes = tickets(10);
    assert.deepEqual(await sheets(fileOf(bytes)), [
        { name: "Notes", index: 0, visible: false },
        { name: "Tickets", index: 1, visible: true },
        { name: "Summary", index: 2, visible: true }
    ]);
    assert.deepEqual((await read(fileOf(bytes), { sheet: "Summary" })).data, [[10]]);
    assert.deepEqual((await read(fileOf(bytes), { sheet: 0 })).columns, ["internal"]);
    await rejects(read(fileOf(bytes), { sheet: "Missing" }), "NO_SHEET", (e) => e.message === '"book.xlsx": the workbook has no sheet "Missing".');
    await rejects(read(fileOf(bytes), { sheet: 7 }), "NO_SHEET");
});

test("the used range: formatted empty cells to row 900,000 are left out before parsing, with a note", async () => {
    // two formatted columns down to row 900,000 (the benchmark, bench.js, formats all 20)
    const bytes = tickets(500, { usedRangeTo: 900_000, emptyCells: 2 });
    const started = performance.now();
    const t = await read(fileOf(bytes));
    const ms = performance.now() - started;
    assert.equal(t.rowCount, 500);
    const used = t.notes.find((n) => n.code === "USED_RANGE");
    assert.deepEqual(used.params, { usedRow: 900_000, lastRow: 503 });
    assert.equal(used.message, "The sheet's used range reaches row 900,000; values end at row 503, the empty rows below were skipped.");
    assert.ok(!t.notes.some((n) => n.code === "ROWS_EMPTY"), "no empty rows reached the table");
    // 900,000 rows of styled cells unpack to about 70 MB; read in about a second, not parsed into rows
    assert.ok(ms < 15_000, `${ms} ms`);
});

test("cells with an Excel error are empty, with a note", async () => {
    const bytes = makeXlsx({ sheets: [{ name: "S", rows: [["Name", "Ratio"], ["a", { error: "#DIV/0!" }], ["b", 0.5], ["#N/A", { error: "#N/A" }]] }] });
    const t = await read(fileOf(bytes));
    assert.deepEqual(t.data, [["a", "b", "#N/A"], [null, 0.5, null]]);
    assert.equal(t.notes.find((n) => n.code === "ERROR_CELLS").params.count, 2);
});

test("inline strings, booleans, a sheet name with an ampersand, a name with direction characters", async () => {
    const bytes = makeXlsx({ sheets: [{ name: "R&D", rows: [[{ inline: "Te\u{202E}am" }, "Done"], [{ inline: " A " }, true], ["B", false]] }] });
    const t = await read(fileOf(bytes));
    assert.equal(t.notes[0].params.sheet, "R&D");
    assert.deepEqual(t.columns, ["Team", "Done"]);
    assert.deepEqual(t.data, [["A", "B"], [true, false]]);
});

test("no worker is started: read-excel-file gets an uncompressed ZIP (a strict CSP blocks blob: workers)", async () => {
    const before = globalThis.Worker;
    let started = 0;
    globalThis.Worker = class {
        constructor() {
            started++;
            throw new Error("blocked by the Content-Security-Policy");
        }
    };
    try {
        // a sheet of several megabytes: fflate's own unzip would start a worker for it
        const t = await read(fileOf(tickets(5_000)));
        assert.equal(t.rowCount, 5_000);
        assert.equal(started, 0);
    } finally {
        if (before === undefined) delete globalThis.Worker;
        else globalThis.Worker = before;
    }
});

// ---------------------------------------------------------------------------------------------------
// refusals before parsing

/** The bytes with the 32-bit value at `at` replaced. */
function patch32(bytes, at, value) {
    const out = bytes.slice();
    new DataView(out.buffer).setUint32(at, value, true);
    return out;
}

/** Offsets of the central directory entries of a ZIP, by name. */
function directory(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    let end = bytes.length - 22;
    while (view.getUint32(end, true) !== 0x06054b50) end--;
    const out = new Map();
    let p = view.getUint32(end + 16, true);
    for (let k = 0; k < view.getUint16(end + 10, true); k++) {
        const n = view.getUint16(p + 28, true);
        out.set(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + n)), p);
        p += 46 + n + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    }
    return out;
}

test("a ZIP bomb: the unpacked size from the directory is refused before anything is unpacked", async () => {
    // 200 MB of one repeated row compress to a fraction of a megabyte
    const row = strToU8("<row><c><v>1</v></c></row>".repeat(4096));
    const big = new Uint8Array(200 * 1024 * 1024);
    for (let at = 0; at < big.length; at += row.length) big.set(row.subarray(0, Math.min(row.length, big.length - at)), at);
    const bytes = makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], extra: { "xl/media/padding.xml": big } });
    assert.ok(bytes.length < 2_000_000, `${bytes.length} bytes`);
    const started = performance.now();
    await rejects(read(fileOf(bytes), { limits: { unpackedBytes: 100 * 1024 * 1024 } }), "LIMIT", (e) => e.details.limit === "unpackedBytes" && /ZIP bomb/.test(e.message));
    assert.ok(performance.now() - started < 1_000, "refused without unpacking");
    // a forged directory that understates a part: unpacking stops at the stated size
    const small = makeXlsx({ sheets: [{ name: "S", rows: Array.from({ length: 20_000 }, (_, i) => [i]) }] });
    const at = directory(small).get("xl/worksheets/sheet1.xml");
    await rejects(read(fileOf(patch32(small, at + 24, 1000))), "DAMAGED", (e) => /unpacks to more than the 1,000 bytes its directory states/.test(e.message));
});

test("too many parts in the directory are refused", async () => {
    const bytes = tickets(3);
    await rejects(read(fileOf(bytes), { limits: { archiveEntries: 5 } }), "LIMIT", (e) => e.details.limit === "archiveEntries" && e.details.value === 9);
});

test("a document type or entity declaration in an XML part is refused", async () => {
    const entity = '<!DOCTYPE workbook [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>';
    await rejects(read(fileOf(makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], doctype: entity }))), "XML_DECLARATION", (e) => e.details.part === "xl/workbook.xml");
    await rejects(read(fileOf(makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], doctype: '<!doctype workbook SYSTEM "http://example.invalid/x.dtd">' }))), "XML_DECLARATION");
    // in the sheet, which is streamed: the check sees across the pieces
    const withEntity = makeXlsxWithSheet('<?xml version="1.0"?>\n<!ENTITY x SYSTEM "file:///etc/passwd"><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>');
    await rejects(read(fileOf(withEntity)), "XML_DECLARATION", (e) => e.details.part === "xl/worksheets/sheet1.xml");
});

/** A workbook whose first sheet's XML is replaced by `xml`. */
function makeXlsxWithSheet(xml) {
    return rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), { "xl/worksheets/sheet1.xml": strToU8(xml) });
}

/** A ZIP with the parts of `bytes` (stored), `replace` swapped in (null leaves a part out), deflated. */
function rebuild(bytes, replace) {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const parts = {};
    for (const [name, p] of directory(bytes)) {
        const local = view.getUint32(p + 42, true);
        const size = view.getUint32(p + 20, true);
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        if (replace[name] === null) continue;
        parts[name] = replace[name] ?? bytes.slice(start, start + size);
    }
    return zipOf(parts);
}

/** A ZIP of the parts, each deflated, written by hand so a test can set any field. */
function zipOf(parts, { flags = 0 } = {}) {
    const locals = [];
    const central = [];
    let offset = 0;
    for (const [name, data] of Object.entries(parts)) {
        const nameBytes = strToU8(name);
        const packed = deflateSync(data);
        const local = new Uint8Array(30 + nameBytes.length + packed.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, flags, true);
        lv.setUint16(8, 8, true);
        lv.setUint32(18, packed.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);
        local.set(packed, 30 + nameBytes.length);
        const entry = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(entry.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, flags, true);
        cv.setUint16(10, 8, true);
        cv.setUint32(20, packed.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        entry.set(nameBytes, 46);
        locals.push(local);
        central.push(entry);
        offset += local.length;
    }
    const centralSize = central.reduce((n, e) => n + e.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, central.length, true);
    ev.setUint16(10, central.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const out = new Uint8Array(offset + centralSize + 22);
    let at = 0;
    for (const part of [...locals, ...central, end]) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}

test("macros: vbaProject.bin, the macro content type and the .xlsm name are refused", async () => {
    const rows = [["A"], [1]];
    await rejects(read(fileOf(makeXlsx({ sheets: [{ name: "S", rows }], macros: true }))), "MACROS", (e) => /vbaProject\.bin/.test(e.message));
    // the macro content type without the macros themselves
    const contentTypeOnly = rebuild(makeXlsx({ sheets: [{ name: "S", rows }], level: 0, macros: true }), { "xl/vbaProject.bin": null });
    await rejects(read(fileOf(contentTypeOnly)), "MACROS", (e) => /\.xlsm/.test(e.message));
    await rejects(read(fileOf(makeXlsx({ sheets: [{ name: "S", rows }] }), "book.xlsm")), "MACROS");
});

test("an .xls, a password-protected workbook, a binary .xlsb, an encrypted ZIP: refused with what to do", async () => {
    // the compound file header that .xls and encrypted workbooks share (synthetic, no real content)
    const cfb = (extra = []) => new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(504).fill(0), ...extra]);
    const encryptedName = [..."EncryptedPackage"].flatMap((c) => [c.charCodeAt(0), 0]);
    await rejects(read(fileOf(cfb(), "old.xlsx")), "XLS", (e) => e.message === '"old.xlsx": this is an Excel 97-2003 workbook (.xls); save it as an Excel workbook (.xlsx) or as CSV, then load it.');
    await rejects(read(fileOf(cfb(encryptedName), "secret.xlsx")), "ENCRYPTED", (e) => /password/.test(e.message));
    await rejects(read(fileOf(zipOf({ "xl/workbook.bin": new Uint8Array(10), "[Content_Types].xml": strToU8("<Types/>") }), "b.xlsx")), "XLSB");
    await rejects(read(fileOf(zipOf({ "xl/workbook.xml": strToU8("<workbook/>") }, { flags: 1 }))), "ENCRYPTED");
    await rejects(read(fileOf(zipOf({ "word/document.xml": strToU8("<w/>") }))), "WRONG_TYPE", (e) => /no xl\/workbook\.xml/.test(e.message));
});

test("a truncated file and a file with the wrong extension", async () => {
    const bytes = tickets(200);
    await rejects(read(fileOf(bytes.subarray(0, Math.floor(bytes.length / 2)))), "DAMAGED", (e) => /damaged or cut off/.test(e.message));
    const csv = readFileSync(new URL("../../pivotkit-core/test/import-fixtures/usgs-earthquakes.csv", import.meta.url));
    await rejects(readFile(fileOf(csv, "quakes.xlsx"), { plugins: [xlsxReader] }), "WRONG_TYPE", (e) => e.message === '"quakes.xlsx": this is no Excel workbook (.xlsx); check the file, or load a CSV file with the CSV reader.');
    // and the other way round: a workbook named .csv is refused by the CSV reader
    await rejects(readFile(fileOf(bytes, "book.csv"), { plugins: [xlsxReader] }), "WRONG_TYPE", (e) => /Excel workbook/.test(e.message));
});

test("limits: the file size before reading; rows of the table", async () => {
    let read = false;
    const big = new (class extends Blob {
        get size() {
            return 2_000_000;
        }
        async arrayBuffer() {
            read = true;
            return new ArrayBuffer(0);
        }
    })([]);
    await assert.rejects(readFile(Object.assign(big, { name: "big.xlsx" }), { plugins: [xlsxReader], limits: { fileBytes: 1_000_000 } }), (e) => e.details.limit === "fileBytes");
    assert.equal(read, false);
    await assert.rejects(readFile(fileOf(tickets(50)), { plugins: [xlsxReader], limits: { rows: 40 } }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows" && e.details.file === "book.xlsx");
});

test("the plugin: contract v1, chosen for .xlsx, its reader loaded on first use only", async () => {
    assert.equal(validatePlugin(xlsxReader).name, "xlsx");
    assert.equal(readerFor({ name: "Report.XLSX" }, [xlsxReader]), xlsxReader);
    assert.equal(readerFor({ name: "x", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, [xlsxReader]), xlsxReader);
    const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
    assert.ok(!/^import\s/m.test(index), "the descriptor imports nothing up front");
    const t = await readFile(fileOf(tickets(5)), { plugins: [xlsxReader] });
    assert.equal(t.rowCount, 5);
});

test("abort and progress", async () => {
    const controller = new AbortController();
    const phases = [];
    await read(fileOf(tickets(3_000)), { onProgress: (p) => phases.push(p.phase) });
    assert.deepEqual([...new Set(phases)], ["read", "unpack", "parse"]);
    controller.abort();
    await assert.rejects(read(fileOf(tickets(10)), { signal: controller.signal }), (e) => e.name === "AbortError");
    const late = new AbortController();
    await assert.rejects(read(fileOf(tickets(3_000)), { signal: late.signal, onProgress: (p) => p.phase === "unpack" && late.abort() }), (e) => e.name === "AbortError");
});
