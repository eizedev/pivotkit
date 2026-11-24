// pivotkit-xlsx on workbooks built as Excel writes them (make-xlsx.js): types from cell formats, the
// first visible sheet, the used range of formatted empty cells, and every refusal before parsing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync, strToU8, unzipSync } from "fflate";
import { PivotkitError, computePivot, encode, toGrid } from "pivotkit-core";
import { readFile, readerFor, validatePlugin } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";
import { read, sheets } from "pivotkit-xlsx/reader";
import { TICKET_COLUMNS, makeXlsx, ticketRows } from "./make-xlsx.js";
import { cpuClock } from "../../../tests/cpu-time.js";

const col = (t, name) => t.data[t.columns.indexOf(name)];
const fileOf = (bytes, name = "book.xlsx") => new File([bytes], name);
const rejects = (promise, reason, check = () => true) =>
    assert.rejects(promise, (e) => e instanceof PivotkitError && e.details.reason === reason && check(e));

const tickets = (count, extra = {}) =>
    makeXlsx({ sheets: [{ name: "Notes", hidden: true, rows: [["internal"], ["x"]] }, { name: "Tickets", rows: () => ticketRows(count), ...extra }, { name: "Summary", rows: [["Total"], [count]] }] });

/**
 * Time bounds as ratios of times taken in the same process, so a slow runner and coverage change them
 * little; the unit is the unpacking of the same sheet (the fastest of three). Measured for the
 * used-range test, plain and under coverage (Node 26; CI Node 22 and 24 alike): a read is 1.0-1.2
 * times the scan before parsing (up to 1.3 under full CPU load), the parse after it (read minus
 * scan) 0.1-1.3 times the unpacking, the scan 3.2-5.7 times the unpacking. With the filter passing
 * the empty rows on to the parser: 1.8-3.5 times the scan, the parse 6.5-24 times the unpacking. For
 * the padded sheet a read is 1.1-1.7 times its scan (with the shared strings, which the scan leaves
 * out); without the guard it took minutes and ran out of stack.
 */
const READ_PER_SCAN = 1.6;
const PARSE_PER_UNPACK = 3;
const SCAN_PER_UNPACK = 12;
const PADDED_READ_PER_SCAN = 5;
/**
 * Other test workspaces running in parallel slow the phases of one measurement unevenly (a read 1.8
 * times its scan was seen that way). The used-range test therefore measures unpack, scan and read in
 * interleaved rounds and bounds the fastest of each, with a new round only while a bound fails, up to
 * this many. A filter that passes the empty rows on fails in every round; measured as the fastest of
 * five, plain, under coverage and beside the other workspaces: the parse 3.9-8.4 times the unpacking
 * (bound 3), the read 1.7-2.8 times the scan (bound 1.6).
 */
const USED_RANGE_ROUNDS = 5;

/**
 * How long one sheet takes to unpack alone (the fastest of three), and to unpack and pass through
 * the checks before parsing (createXmlCheck, createXmlGuard, createSheetFilter) as read() does, its
 * output thrown away.
 */
async function sheetScanTimes(bytes, path) {
    const { readDirectory, unpackStream } = await import("../src/zip.js");
    const { createSheetFilter } = await import("../src/sheet-filter.js");
    const { createXmlCheck } = await import("../src/xml.js");
    const { createXmlGuard } = await import("../src/xml-guard.js");
    const entry = readDirectory(bytes, "book.xlsx", { archiveEntries: 100, unpackedBytes: 1e9 }).find((e) => e.name === path);
    // the unpacking is the unit of the bounds: its fastest of three, so one slow pass on a busy
    // runner does not loosen them
    let unpackMs = Infinity;
    for (let k = 0; k < 3; k++) {
        const started = performance.now();
        await unpackStream(bytes, entry, "book.xlsx", () => {}, () => {});
        unpackMs = Math.min(unpackMs, performance.now() - started);
    }
    const started = performance.now();
    const check = createXmlCheck("book.xlsx", path);
    const filter = createSheetFilter(createXmlGuard({ write() {} }, "book.xlsx", path), { file: "book.xlsx", part: path });
    await unpackStream(bytes, entry, "book.xlsx", (chunk) => {
        check(chunk);
        filter.push(chunk);
    }, () => {});
    filter.end();
    return { unpackMs, scanMs: performance.now() - started };
}

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

test("the used range: formatted empty cells to row 900,000 are left out before parsing, with a note", async (ctx) => {
    // two formatted columns down to row 900,000 (the benchmark, bench.js, formats all 20)
    const bytes = tickets(500, { usedRangeTo: 900_000, emptyCells: 2 });
    let unpackMs = Infinity;
    let scanMs = Infinity;
    let ms = Infinity;
    const holds = () => ms < READ_PER_SCAN * scanMs && ms - scanMs < PARSE_PER_UNPACK * unpackMs && scanMs < SCAN_PER_UNPACK * unpackMs;
    let t;
    let rounds = 0;
    while (rounds < USED_RANGE_ROUNDS && !holds()) {
        rounds++;
        const times = await sheetScanTimes(bytes, "xl/worksheets/sheet2.xml");
        unpackMs = Math.min(unpackMs, times.unpackMs);
        scanMs = Math.min(scanMs, times.scanMs);
        const started = performance.now();
        t = await read(fileOf(bytes));
        ms = Math.min(ms, performance.now() - started);
    }
    assert.equal(t.rowCount, 500);
    const used = t.notes.find((n) => n.code === "USED_RANGE");
    assert.deepEqual(used.params, { usedRow: 900_000, lastRow: 503 });
    assert.equal(used.message, "The sheet's used range reaches row 900,000; values end at row 503, the empty rows below were skipped.");
    assert.ok(!t.notes.some((n) => n.code === "ROWS_EMPTY"), "no empty rows reached the table");
    // 900,000 rows of styled cells unpack to about 90 MB. The read takes about as long as the scan
    // before parsing (unpack, check, filter) alone, and the parse after it little more than one
    // unpacking: the empty rows never reach the parser. The scan takes a few times the unpacking.
    // Each is the fastest of its rounds (USED_RANGE_ROUNDS).
    ctx.diagnostic(`read ${Math.round(ms)} ms, scan ${Math.round(scanMs)} ms, unpack ${Math.round(unpackMs)} ms, ${rounds} round(s)`);
    assert.ok(ms < READ_PER_SCAN * scanMs, `read ${Math.round(ms)} ms, scan ${Math.round(scanMs)} ms`);
    assert.ok(ms - scanMs < PARSE_PER_UNPACK * unpackMs, `read ${Math.round(ms)} ms, scan ${Math.round(scanMs)} ms, unpack ${Math.round(unpackMs)} ms`);
    assert.ok(scanMs < SCAN_PER_UNPACK * unpackMs, `scan ${Math.round(scanMs)} ms, unpack ${Math.round(unpackMs)} ms`);
});

test("cells with an Excel error are empty, with a note", async () => {
    const bytes = makeXlsx({ sheets: [{ name: "S", rows: [["Name", "Ratio"], ["a", { error: "#DIV/0!" }], ["b", 0.5], ["#N/A", { error: "#N/A" }]] }] });
    const t = await read(fileOf(bytes));
    assert.deepEqual(t.data, [["a", "b", "#N/A"], [null, 0.5, null]]);
    assert.equal(t.notes.find((n) => n.code === "ERROR_CELLS").params.count, 2);
});

test("a number in a text cell that both notations read reads in the locale's: 1,234 and 1.500 are German in a German locale", async () => {
    const bytes = makeXlsx({ sheets: [{ name: "S", rows: [["Name", "Amount"], ["a", "1,234"], ["b", "2,5"]] }] });
    const de = await read(fileOf(bytes), { locale: "de-DE" });
    assert.deepEqual(de.data[1], [1.234, 2.5]);
    assert.equal(de.notes.find((n) => n.code === "DECIMAL_MARK"), undefined);
    const en = await read(fileOf(bytes), { locale: "en-US" });
    assert.deepEqual(en.data[1], [1.234, 2.5]);
    const both = makeXlsx({ sheets: [{ name: "S", rows: [["Name", "Amount"], ["a", "1,234"]] }] });
    assert.deepEqual((await read(fileOf(both), { locale: "de-DE" })).data[1], [1.234]);
    const english = await read(fileOf(both), { locale: "en-US" });
    assert.deepEqual(english.data[1], [1234]);
    assert.equal(english.notes.find((n) => n.code === "DECIMAL_MARK").params.decimal, ".");
    // a point is a German group, as in a comma-separated file of a German locale
    const points = makeXlsx({ sheets: [{ name: "S", rows: [["Name", "Amount"], ["a", "1.500"], ["b", "2.000"]] }] });
    assert.deepEqual((await read(fileOf(points), { locale: "de-DE" })).data[1], [1500, 2000]);
    assert.deepEqual((await read(fileOf(points), { locale: "en-US" })).data[1], [1.5, 2]);
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
    const cpu = cpuClock();
    // LIMIT_EXCEEDED as for every other limit (#208), with the limit, the values and the file
    await assert.rejects(read(fileOf(bytes), { limits: { unpackedBytes: 100 * 1024 * 1024 } }), (e) => e instanceof PivotkitError && e.code === "LIMIT_EXCEEDED" && e.details.limit === "unpackedBytes" && e.details.max === 100 * 1024 * 1024 && e.details.value > e.details.max && e.details.file === "book.xlsx" && /ZIP bomb/.test(e.message) && /limits\.unpackedBytes/.test(e.message));
    assert.ok(cpu() < 1_000, "refused without unpacking");
    // a forged directory that understates a part: unpacking stops at the stated size
    const small = makeXlsx({ sheets: [{ name: "S", rows: Array.from({ length: 20_000 }, (_, i) => [i]) }] });
    const at = directory(small).get("xl/worksheets/sheet1.xml");
    await rejects(read(fileOf(patch32(small, at + 24, 1000))), "DAMAGED", (e) => /unpacks to more than the 1,000 bytes its directory states/.test(e.message));
});

test("too many parts in the directory are refused", async () => {
    const bytes = tickets(3);
    await assert.rejects(read(fileOf(bytes), { limits: { archiveEntries: 5 } }), (e) => e instanceof PivotkitError && e.code === "LIMIT_EXCEEDED" && e.details.limit === "archiveEntries" && e.details.value === 9 && e.details.max === 5 && e.details.file === "book.xlsx");
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

test("the sheet filter gives the same XML however the sheet arrives in pieces", async () => {
    const { createSheetFilter } = await import("../src/sheet-filter.js");
    const { createXmlCheck } = await import("../src/xml.js");
    const xml = [
        '<?xml version="1.0"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C9"/><sheetData>',
        '<row r="1"><c r="A1" t="s"><v>0</v></c></row>\n',
        '<row r="2" s="3" customFormat="1"/>',
        "<!-- a comment between rows -->",
        '<row r="3"><c r="A3" s="3"/><c r="B3" s="3"/></row>',
        '<row r="4"><c r="C4" t="e"><v>#N/A</v></c><c r="D4"><f>A1</f><v>2</v></c></row>',
        '<row r="9" spans="1:3"><c r="A9" s="1"/></row>',
        '</sheetData><pageMargins left="0.7"/><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>\n'
    ].join("");
    const expected = xml
        // what follows the sheet's data is left out, but for the root's end tag
        .replace('<pageMargins left="0.7"/><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>\n', "</worksheet>")
        .replace('<row r="2" s="3" customFormat="1"/>', "")
        // so is anything between rows that is no row
        .replace("<!-- a comment between rows -->", "")
        .replace('<row r="3"><c r="A3" s="3"/><c r="B3" s="3"/></row>', "")
        .replace('<row r="9" spans="1:3"><c r="A9" s="1"/></row>', "")
        // whitespace between rows goes with the rows
        .replace("</row>\n", "</row>");
    const bytes = strToU8(xml);
    for (const size of [1, 2, 3, 7, 16, 64, bytes.length]) {
        const parts = [];
        const filter = createSheetFilter({ write: (b, from = 0, to = b.length) => parts.push(b.slice(from, to)) });
        const check = createXmlCheck("s.xlsx", "sheet");
        for (let at = 0; at < bytes.length; at += size) {
            const piece = bytes.subarray(at, at + size);
            check(piece);
            filter.push(piece);
        }
        const stats = filter.end();
        const out = new TextDecoder().decode(Uint8Array.from(parts.flatMap((p) => [...p])));
        assert.equal(out, expected, `pieces of ${size} bytes`);
        assert.deepEqual(stats, { lastRow: 9, lastValueRow: 4, dropped: 3, errors: 1, shared: 0 }, `pieces of ${size} bytes`);
    }
    // the guard: whitespace runs cut, over-long tokens refused, the same however the XML is split
    const { createXmlGuard, SPACE_RUN, MAX_TOKEN, MAX_TAG } = await import("../src/xml-guard.js");
    const through = (text, size) => {
        const input = strToU8(text);
        const parts = [];
        const guard = createXmlGuard({ write: (b, from = 0, to = b.length) => parts.push(b.slice(from, to)) }, "s.xlsx", "sheet");
        for (let at = 0; at < input.length; at += size) guard.write(input.subarray(at, at + size));
        let n = 0;
        for (const p of parts) n += p.length;
        const out = new Uint8Array(n);
        n = 0;
        for (const p of parts) out.set(p, (n += p.length) - p.length);
        return new TextDecoder().decode(out);
    };
    const run = (n, c = " ") => c.repeat(n);
    const cases = [
        // short whitespace and markup stay as they are
        [xml, xml],
        // a run in text and between attributes is cut; in a quoted value it is not
        [`<a>${run(SPACE_RUN + 5)}<b x="1"${run(SPACE_RUN + 3, "\n")}z="2"/><b y="${run(SPACE_RUN + 2)}"/>\t${run(SPACE_RUN)}</a>`, `<a>${run(SPACE_RUN)}<b x="1"${run(SPACE_RUN, "\n")}z="2"/><b y="${run(SPACE_RUN + 2)}"/>\t${run(SPACE_RUN - 1)}</a>`],
        // a comment, a CDATA section and a processing instruction pass, ">" and quotes in them too
        ['<?pi a="?>"?><a><!-- x > " y --><![CDATA[ <b> ]] > ]]><!--></a>', '<?pi a="?>"?><a><!-- x > " y --><![CDATA[ <b> ]] > ]]><!--></a>']
    ];
    for (const [input, output] of cases) {
        for (const size of [1, 2, 3, 7, 4096, input.length]) assert.equal(through(input, size), output, `pieces of ${size} bytes`);
    }
    for (const big of [`<a>${run(MAX_TOKEN + 1, "x")}</a>`, `<a x="${run(MAX_TOKEN, ">")}"/>`, `<a><!--${run(MAX_TOKEN, "->")}--></a>`, `<?${run(MAX_TOKEN, ">")}?>`, `<![CDATA[${run(MAX_TOKEN, "]>")}]]>`]) {
        for (const size of [3, 65_536]) assert.throws(() => through(big, size), (e) => e.details?.reason === "DAMAGED" && /1 MiB|256 KiB/.test(e.message), `${big.slice(0, 12)} in pieces of ${size} bytes`);
    }
    // up to MAX_TOKEN (text) and MAX_TAG (a tag from "<" to before ">") passes, a byte more does not
    assert.equal(through(`<a>${run(MAX_TOKEN, "x")}</a>`, 65_536).length, MAX_TOKEN + 7);
    assert.equal(through(`<a x="${run(MAX_TAG - 8, "y")}"/>`, 4096).length, MAX_TAG + 1);
    assert.throws(() => through(`<a x="${run(MAX_TAG - 7, "y")}"/>`, 4096), (e) => /256 KiB/.test(e.message));

    // a declaration split over two pieces is still found
    const evil = strToU8('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><worksheet/>');
    for (const size of [1, 3, 5]) {
        const check = createXmlCheck("s.xlsx", "sheet");
        assert.throws(() => {
            for (let at = 0; at < evil.length; at += size) check(evil.subarray(at, at + size));
        }, (e) => e.details?.reason === "XML_DECLARATION", `pieces of ${size} bytes`);
    }
});

// findings of the security review of the readers

test("a small sheet with a value far out (row 300,000, column XFD) is refused before read-excel-file makes it dense", async () => {
    const sheet = (rows) => makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
    const wide = sheet('<row r="1"><c r="XFD1"><v>1</v></c></row><row r="300000"><c r="A300000"><v>1</v></c></row>');
    assert.ok(wide.length < 10_000, `${wide.length} bytes`);
    const cpu = cpuClock();
    await assert.rejects(read(fileOf(wide)), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "columns" && e.details.file === "book.xlsx");
    await assert.rejects(read(fileOf(sheet('<row r="1"><c r="A1"><v>1</v></c></row><row r="999999999"><c r="A999999999"><v>1</v></c></row>'))), (e) => e.details.limit === "rows");
    await assert.rejects(read(fileOf(sheet('<row r="1"><c r="ALL1"><v>1</v></c></row><row r="200000"><c r="A200000"><v>1</v></c></row>'))), (e) => e.details.limit === "importCells");
    assert.ok(cpu() < 2_000, "refused at once");
});

test("a sheet name with a raw \">\" in its quoted value (legal XML; Excel writes &gt;) names the sheet whole", async () => {
    const base = makeXlsx({ sheets: [{ name: "AxB", rows: [["H"], [1]] }], level: 0 });
    for (const quoted of ['name="A>B"', "name='A>B'"]) {
        const workbook = new TextDecoder().decode(unzipSync(base)["xl/workbook.xml"]).replace('name="AxB"', quoted);
        assert.ok(workbook.includes(quoted));
        const bytes = rebuild(base, { "xl/workbook.xml": strToU8(workbook) });
        assert.deepEqual(await sheets(fileOf(bytes)), [{ name: "A>B", index: 0, visible: true }], quoted);
        assert.deepEqual((await read(fileOf(bytes))).data, [[1]], quoted);
    }
});

test("a list of sheets with <sheet repeated and never closed is read in linear time", async () => {
    // and no ">" after them; then with a quote that never closes in each
    for (const open of ["<sheet", '<sheet name="a', "<sheet name='a"]) {
        const workbook = `<?xml version="1.0"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${open.repeat(40_000)}`;
        const bytes = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), { "xl/workbook.xml": strToU8(workbook) });
        const cpu = cpuClock();
        await rejects(read(fileOf(bytes)), "NO_TABLE");
        assert.ok(cpu() < 2_000, `${open}: ${Math.round(cpu())} ms of CPU`);
    }
});

test("a row that never ends is refused once it passes 64 MiB, not held whole", async () => {
    const open = `<?xml version="1.0"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">`;
    // short cells (no token over 1 MiB, nothing to squeeze) and no </row>
    const cell = strToU8('<c r="A1" t="inlineStr"><is><t>aaaaaaaaaaaaaaaa</t></is></c>');
    const body = new Uint8Array(65 * 1024 * 1024);
    for (let at = 0; at < body.length; at += cell.length) body.set(cell.subarray(0, Math.min(cell.length, body.length - at)), at);
    const xml = new Uint8Array(open.length + body.length);
    xml.set(strToU8(open));
    xml.set(body, open.length);
    const bytes = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), { "xl/worksheets/sheet1.xml": xml });
    await rejects(read(fileOf(bytes)), "DAMAGED", (e) => /64 MiB/.test(e.message));
});

test("an XML part in UTF-16 is refused: the declaration check reads UTF-8", async () => {
    const utf16 = (text) => {
        const out = new Uint8Array(2 + text.length * 2);
        out.set([0xff, 0xfe]);
        for (let i = 0; i < text.length; i++) out[2 + i * 2] = text.charCodeAt(i);
        return out;
    };
    const bytes = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), {
        "xl/sharedStrings.xml": utf16('<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE sst [<!ENTITY a "b">]><sst/>')
    });
    await rejects(read(fileOf(bytes)), "XML_DECLARATION", (e) => /not UTF-8/.test(e.message));
});

test("a sheet name from the file is cleaned in notes and messages", async () => {
    const t = await read(fileOf(makeXlsx({ sheets: [{ name: "Q\u{202E}4 data", rows: [["A"], [1]] }] })));
    assert.equal(t.notes[0].params.sheet, "Q4 data");
    assert.equal(t.notes[0].message, 'Read sheet "Q4 data".');
});

// a workbook a few dozen kilobytes large whose XML is padded with whitespace: under every default
// limit, it unpacks to tens of megabytes that read-excel-file parsed in quadratic time and with a
// stack frame per piece (a minute, up to a gigabyte, then "Maximum call stack size exceeded"); the
// 24 MiB inside a tag did that on their own, the rest cost memory in proportion to its size
test("a sheet padded with whitespace is read in linear time and memory, with its values", async (ctx) => {
    const MiB = 1024 * 1024;
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const pad = (n) => " ".repeat(n);
    const sheetXml =
        `<?xml version="1.0"?>\n<worksheet ${NS}>${pad(2 * MiB)}<dimension ref="A1:B3"/><sheetData>` +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>n</t></is></c></row>' +
        `<row r="2"><c r="A2" t="s"><v>1</v></c>${pad(4 * MiB)}<c r="B2"${pad(24 * MiB)}><v>1</v></c></row>` +
        '<row r="3"><c r="A3" t="inlineStr"><is><t xml:space="preserve">  y </t></is></c><c r="B3"><v>2</v></c></row>' +
        `</sheetData>${pad(16 * MiB)}<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>`;
    const sst = `<?xml version="1.0"?>\n<sst ${NS} count="2" uniqueCount="2"><si><t>name</t></si>${pad(4 * MiB)}<si><t>x</t></si></sst>`;
    const bytes = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), { "xl/worksheets/sheet1.xml": strToU8(sheetXml), "xl/sharedStrings.xml": strToU8(sst) });
    assert.ok(bytes.length < 200_000, `${bytes.length} bytes`);
    const { scanMs } = await sheetScanTimes(bytes, "xl/worksheets/sheet1.xml");
    const rss = process.memoryUsage().rss;
    let peak = rss;
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 2);
    const started = performance.now();
    try {
        const t = await read(fileOf(bytes), { onProgress: () => (peak = Math.max(peak, process.memoryUsage().rss)) });
        assert.deepEqual(t.columns, ["name", "n"]);
        assert.deepEqual(col(t, "name"), ["x", "y"]);
        assert.deepEqual(col(t, "n"), [1, 2]);
    } finally {
        clearInterval(timer);
    }
    const ms = performance.now() - started;
    peak = Math.max(peak, process.memoryUsage().rss);
    // 50 MiB unpacked: the reader never holds the padding as text, nor all of it at once. The read
    // takes about as long as the scan of the sheet before parsing; without the guard, read-excel-file
    // took minutes and then ran out of stack
    ctx.diagnostic(`read ${Math.round(ms)} ms, scan ${Math.round(scanMs)} ms`);
    assert.ok(ms < PADDED_READ_PER_SCAN * scanMs, `read ${Math.round(ms)} ms, scan ${Math.round(scanMs)} ms`); // wall time: a ratio of two measurements
    assert.ok(peak - rss < 300 * MiB, `${Math.round((peak - rss) / MiB)} MiB more resident memory`);
});

test("a text of more than 1 MiB or a tag of more than 256 KiB in a sheet is refused at once, however it is padded", async () => {
    const MiB = 1024 * 1024;
    const sheet = (body) => makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${body}</row></sheetData></worksheet>`);
    const cpu = cpuClock();
    // an Excel cell holds at most 32,767 characters
    await rejects(read(fileOf(sheet(`<c r="A1" t="inlineStr"><is><t>${"a".repeat(2 * MiB)}</t></is></c>`))), "DAMAGED", (e) => /1 MiB/.test(e.message));
    // a quoted attribute value of ">" is one tag to an XML parser
    await rejects(read(fileOf(sheet(`<c r="A1" x="${">".repeat(2 * MiB)}"><v>1</v></c>`))), "DAMAGED", (e) => /256 KiB/.test(e.message));
    await rejects(read(fileOf(sheet(`<c r="A1"><v>1</v></c><!--${"->".repeat(MiB)}-->`))), "DAMAGED", (e) => /1 MiB/.test(e.message));
    assert.ok(cpu() < 5_000, `${Math.round(cpu())} ms of CPU`);
});

test("cell and row positions are read however the attribute is quoted or spaced, in linear time", async () => {
    const sheet = (rows) => makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
    const far = [
        "<row r='3000000'><c r='A3000000'><v>1</v></c></row>",
        '<row r = "3000000"><c\nr="A3000000"><v>1</v></c></row>',
        "<row\tr='3000000'><c\tr = 'A3000000' s=\"1\"><v>1</v></c></row>"
    ];
    for (const row of far) {
        await assert.rejects(read(fileOf(sheet(`<row r="1"><c r="A1"><v>1</v></c></row>${row}`))), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows", row);
    }
    await assert.rejects(read(fileOf(sheet("<row r='1'><c r='XFD1'><v>1</v></c></row>"))), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "columns");
    // a quoted value holding ' r="' is no position
    const t = await read(fileOf(sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>n</t></is></c></row><row r="2"><c x=' r="A3000000"' r="A2"><v>7</v></c></row>`)));
    assert.deepEqual(col(t, "n"), [7]);
    // a row of half a megabyte of "<c " without a ">": the filter scans each tag once (it was
    // quadratic) and refuses the "<" in a tag the parser would read as one long tag
    const cpu = cpuClock();
    await rejects(read(fileOf(sheet(`<row r="1"><c r="A1"><v>1</v></c></row><row r="2">${"<c ".repeat(170_000)}</c></row>`))), "DAMAGED", (e) => /"<" in a tag/.test(e.message));
    assert.ok(cpu() < 3_000, `${Math.round(cpu())} ms of CPU`);
});

test("rows inside a comment or CDATA section between rows are not read", async () => {
    const book = makeXlsxWithSheet(
        '<?xml version="1.0"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
            '<row r="1"><c r="A1" t="inlineStr"><is><t>n</t></is></c></row><row r="2"><c r="A2"><v>1</v></c></row>' +
            '<!-- <row r="3"><c r="A3"><v>9</v></c></row><row r="4"><c r="A4"><v>5</v></c></row> -->' +
            '<![CDATA[ <row r="5"><c r="A5"><v>6</v></c></row> ]]><?pi <row r="6"><c r="A6"><v>8</v></c></row> ?>' +
            '<row r="7"><c r="A7"><v>2</v></c></row></sheetData></worksheet>'
    );
    const t = await read(fileOf(book));
    assert.deepEqual(col(t, "n").filter((v) => v !== null), [1, 2]);
});

// a row holds a comment, CDATA section or processing instruction with "</row>" in it: the filter ends
// the row where the parser does, not at that "</row>" (#238)
test("a </row> inside a comment, CDATA section or processing instruction in a row does not end the row", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const head = '<row r="1"><c r="A1" t="inlineStr"><is><t>n</t></is></c><c r="B1" t="inlineStr"><is><t>m</t></is></c></row>';
    const hidden = '</row><row r="3"><c r="A3"><v>9</v></c><c r="B3"><v>9</v></c></row>';
    for (const markup of [`<![CDATA[ ${hidden} ]]>`, `<!-- ${hidden} -->`, `<?pi ${hidden} ?>`]) {
        const book = makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet ${NS}><sheetData>${head}<row r="2"><c r="A2"><v>1</v></c>${markup}<c r="B2"><v>2</v></c></row><row r="4"><c r="A4"><v>3</v></c><c r="B4"><v>4</v></c></row></sheetData></worksheet>`);
        const t = await read(fileOf(book));
        assert.deepEqual(col(t, "n"), [1, 3], markup.slice(0, 4));
        assert.deepEqual(col(t, "m"), [2, 4], markup.slice(0, 4));
    }
    // the same in the filter however the sheet arrives in pieces, and a row with many sections in it
    // ends in linear time
    const { createSheetFilter } = await import("../src/sheet-filter.js");
    const xml = `<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><t><![CDATA[</row>]]></t><!--</row>--><?x </row>?></row></sheetData></worksheet>`;
    for (const size of [1, 2, 5, 13, xml.length]) {
        const parts = [];
        const filter = createSheetFilter({ write: (b, from = 0, to = b.length) => parts.push(new TextDecoder().decode(b.slice(from, to))) });
        const bytes = strToU8(xml);
        for (let at = 0; at < bytes.length; at += size) filter.push(bytes.subarray(at, at + size));
        assert.deepEqual(filter.end(), { lastRow: 1, lastValueRow: 1, dropped: 0, errors: 0, shared: -1 }, `pieces of ${size} bytes`);
        assert.equal(parts.join(""), xml, `pieces of ${size} bytes`);
    }
    const many = `<row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c>${"<!----><?a?>".repeat(150_000)}</row>`;
    const cpu = cpuClock();
    const t = await read(fileOf(makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet ${NS}><sheetData>${many}</sheetData></worksheet>`)));
    assert.deepEqual(t.columns, ["1"]);
    assert.ok(cpu() < 3_000, `${Math.round(cpu())} ms of CPU`);
});

// 100 MiB of one-letter shared strings fit in a workbook of 257 KB, and read-excel-file keeps an entry
// for each: hundreds of megabytes for a sheet of two cells (#237)
test("shared strings: only those up to the highest one a cell names are kept, and they count against importCells", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const strings = (n) => strToU8(`<?xml version="1.0"?>\n<sst ${NS}>${"<si><t>a</t></si>".repeat(n - 2)}<si><t>name</t></si><si><t>x</t></si></sst>`);
    const book = (sheetXml, sst) => rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), { "xl/worksheets/sheet1.xml": strToU8(sheetXml), "xl/sharedStrings.xml": sst });
    const sheetNaming = (a, b) => `<?xml version="1.0"?>\n<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>${a}</v></c></row><row r="2"><c r="A2" t="s"><v>${b}</v></c></row></sheetData></worksheet>`;
    const limits = { importCells: 1_000, columns: 10 }; // 11,000 cells with the rows of a title block
    // a sheet of two cells naming the first two of 50,000 strings: read under the low limit
    const near = book(sheetNaming(0, 1), strings(50_000));
    const t = await read(fileOf(near), { limits });
    assert.deepEqual(t.columns, ["a"]);
    assert.deepEqual(col(t, "a"), ["a"]);
    // a cell naming the last one: all 50,000 are needed, more than the limit
    await assert.rejects(read(fileOf(book(sheetNaming(49_998, 49_999), strings(50_000))), { limits }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "importCells" && e.details.max === 11_000 && /shared strings and formats/.test(e.message));
    // under the default limits the strings the cells name are read as before
    const all = await read(fileOf(book(sheetNaming(49_998, 49_999), strings(50_000))));
    assert.deepEqual(col(all, "name"), ["x"]);
    // a sheet without shared strings keeps none of them
    const inline = await read(fileOf(book(`<?xml version="1.0"?>\n<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>v</t></is></c></row><row r="2"><c r="A2"><v>5</v></c></row></sheetData></worksheet>`, strings(50_000))), { limits });
    assert.deepEqual(col(inline, "v"), [5]);
});

test("styles: cell and number formats count against importCells, together with the shared strings", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const styles = (n) => strToU8(`<?xml version="1.0"?>\n<styleSheet ${NS}><numFmts><numFmt numFmtId="164" formatCode="0.0"/></numFmts><cellXfs>${'<xf numFmtId="0"/>'.repeat(n)}</cellXfs></styleSheet>`);
    const book = (n) => rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], level: 0 }), { "xl/styles.xml": styles(n) });
    const limits = { importCells: 1_000, columns: 10 };
    // the sheet's one shared string ("A") and the one number format count too: 11,000 in all
    assert.equal((await read(fileOf(book(10_998)), { limits })).rowCount, 1);
    await assert.rejects(read(fileOf(book(10_999)), { limits }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "importCells" && e.details.value === 11_001 && /shared strings and formats/.test(e.message));
});

test("the count of shared strings and formats gives the same XML however the part arrives in pieces", async () => {
    const { createEntryCount } = await import("../src/entry-count.js");
    const sst = '<?xml version="1.0"?><sst count="4"><si><t>a</t></si><si/><si\n><r><t>b</t></r></si><si><t>c</t></si></sst>';
    const through = (text, size, keep, options = {}) => {
        const parts = [];
        const count = createEntryCount({ write: (b, from = 0, to = b.length) => parts.push(new TextDecoder().decode(b.slice(from, to))) }, { file: "s.xlsx", part: "p", keep, max: 100, total: { count: 0 }, ...options });
        const bytes = strToU8(text);
        for (let at = 0; at < bytes.length; at += size) count.write(bytes.subarray(at, at + size));
        count.end();
        return parts.join("");
    };
    for (const size of [1, 2, 3, 7, 8, 9, 30, sst.length]) {
        assert.equal(through(sst, size, 4), sst, `all kept, pieces of ${size} bytes`);
        assert.equal(through(sst, size, 2), '<?xml version="1.0"?><sst count="4"><si><t>a</t></si><si/></sst>', `two kept, pieces of ${size} bytes`);
        assert.equal(through(sst, size, 0), '<?xml version="1.0"?><sst count="4"></sst>', `none kept, pieces of ${size} bytes`);
        assert.throws(() => through(sst, size, 4, { max: 3 }), (e) => e.details?.limit === "importCells" && e.details.value === 4);
    }
    // <sheet>, <numFmts> and <xfs> are no entries; <xf> and <numFmt> are, with a prefix too; in a
    // comment, CDATA section or processing instruction they are not (the parser skips those)
    const xml = '<styleSheet><numFmts count="1"><numFmt numFmtId="164"/></numFmts><cellXfs><xf/><x:xf\tnumFmtId="1"></x:xf><!-- <xf/> --><?pi <xf/> ?></cellXfs><xfs/><sheet/></styleSheet>';
    for (const size of [1, 3, 8, xml.length]) {
        assert.equal(through(xml, size, Infinity, { max: 3 }), xml);
        assert.throws(() => through(xml, size, Infinity, { max: 2 }), (e) => e.details?.value === 3);
    }
    // a string item in a CDATA section is text, not an item: the cut comes after the real ones
    const cdata = '<sst><si><t><![CDATA[<si>]]></t></si><si><t>second</t></si><si><t>third</t></si></sst>';
    for (const size of [1, 2, 5, 9, cdata.length]) {
        assert.equal(through(cdata, size, 3), cdata, `pieces of ${size} bytes`);
        assert.equal(through(cdata, size, 2), '<sst><si><t><![CDATA[<si>]]></t></si><si><t>second</t></si></sst>', `pieces of ${size} bytes`);
    }
    // parts counted with one total share the limit: strings and formats together
    const total = { count: 0 };
    through('<sst><si/><si/></sst>', 4, Infinity, { max: 3, total });
    assert.throws(() => through('<styleSheet><xf/><xf/></styleSheet>', 4, Infinity, { max: 3, total }), (e) => e.details?.value === 4);
});

// review findings of #314: a namespace prefix, markup in the shared strings, a value written otherwise
test("shared strings with a prefix count, markup in them does not, and a value not written as <v>n</v> keeps them all", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const XNS = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const book = (sheetXml, sst) => rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), { "xl/worksheets/sheet1.xml": strToU8(sheetXml), "xl/sharedStrings.xml": strToU8(sst) });
    const sheetOf = (a, b) => `<?xml version="1.0"?>\n<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s">${a}</c></row><row r="2"><c r="A2" t="s">${b}</c></row></sheetData></worksheet>`;
    const limits = { importCells: 1_000, columns: 10 };
    // 50,000 string items with a prefix, a cell naming the last: counted as without one
    const prefixed = `<x:sst ${XNS}>${"<x:si><x:t>a</x:t></x:si>".repeat(49_998)}<x:si><x:t>name</x:t></x:si><x:si><x:t>x</x:t></x:si></x:sst>`;
    await assert.rejects(read(fileOf(book(sheetOf("<v>49998</v>", "<v>49999</v>"), prefixed)), { limits }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "importCells");
    assert.deepEqual(col(await read(fileOf(book(sheetOf("<v>49998</v>", "<v>49999</v>"), prefixed))), "name"), ["x"]);
    // a sheet with a prefix too: which strings it names is not known, all are kept
    const both = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), {
        "xl/worksheets/sheet1.xml": strToU8(`<x:worksheet ${XNS}><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c></x:row><x:row r="2"><x:c r="A2" t="s"><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>`),
        "xl/sharedStrings.xml": strToU8(`<x:sst ${XNS}><x:si><x:t>n</x:t></x:si><x:si><x:t>v</x:t></x:si></x:sst>`)
    });
    assert.deepEqual(col(await read(fileOf(both)), "n"), ["v"]);
    // "<si>" in a CDATA section is text: the strings the cells name are all there
    const cdata = `<sst ${NS}><si><t><![CDATA[<si>]]></t></si><si><t>second</t></si><si><t>third</t></si></sst>`;
    assert.deepEqual(col(await read(fileOf(book(sheetOf("<v>1</v>", "<v>2</v>"), cdata))), "second"), ["third"]);
    // <v > is a value to the parser; CDATA in it reads as empty: neither is cut short
    const two = `<sst ${NS}><si><t>n</t></si><si><t>v</t></si></sst>`;
    assert.deepEqual(col(await read(fileOf(book(sheetOf("<v>0</v>", "<v >1</v>"), two))), "n"), ["v"]);
    assert.deepEqual((await read(fileOf(book(sheetOf("<v>0</v>", "<v><![CDATA[1]]></v>"), two)))).columns, ["n"]);
    // strings cut after the one a cell names end with the root's own end tag, prefix and all
    const pfxRoot = `<x:sst ${XNS}><x:si><x:t>hello</x:t></x:si><x:si><x:t>w</x:t></x:si><x:si><x:t>z</x:t></x:si></x:sst>`;
    const named = book(`<?xml version="1.0"?>\n<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>5</v></c></row></sheetData></worksheet>`, pfxRoot);
    assert.deepEqual(col(await read(fileOf(named)), "hello"), [5]);
});

// the parser ends a name at any of 0x09-0x0D (form feed and vertical tab too), as at a space
test("whitespace 0x09-0x0D after a name: <xf\\f/> and <si\\v/> are counted as entries", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const limits = { importCells: 1_000, columns: 10 };
    const styled = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], level: 0 }), { "xl/styles.xml": strToU8(`<styleSheet ${NS}><cellXfs>${"<xf\f/>".repeat(12_000)}</cellXfs></styleSheet>`) });
    await assert.rejects(read(fileOf(styled), { limits }), (e) => e.details?.limit === "importCells" && /shared strings and formats/.test(e.message));
    const strings = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), {
        "xl/worksheets/sheet1.xml": strToU8(`<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>11999</v></c></row></sheetData></worksheet>`),
        "xl/sharedStrings.xml": strToU8(`<sst ${NS}>${"<si\v/>".repeat(12_000)}</sst>`)
    });
    await assert.rejects(read(fileOf(strings), { limits }), (e) => e.details?.limit === "importCells" && /shared strings and formats/.test(e.message));
});

// the extents below pass the table's own checks (the empty rows and columns between are left out),
// so only the filter's check before parsing refuses them: it must see the cell and the row
test("whitespace 0x09-0x0D after a name: <c\\f r> and <row\\v r> are checked before parsing", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const sheet = (rows) => makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>n</t></is></c></row>${rows}</sheetData></worksheet>`);
    // 2,000 rows x 10 columns is more than 1,000 + 10 x 1,000 cells
    await assert.rejects(read(fileOf(sheet('<row r="2000"><c\fr="J2000"><v>1</v></c></row>')), { limits: { importCells: 1_000, columns: 10 } }), (e) => e.details?.limit === "importCells" && e.details.value === 20_000);
    // row 5,000 is past 100 + 1,000 rows
    await assert.rejects(read(fileOf(sheet('<row\vr="5000"><c><v>1</v></c></row>')), { limits: { rows: 100 } }), (e) => e.details?.limit === "rows" && e.details.value === 5_000);
});

test("whitespace 0x09-0x0D: the guard cuts a long run of form feeds or vertical tabs as of spaces", async () => {
    const { createXmlGuard, SPACE_RUN } = await import("../src/xml-guard.js");
    const parts = [];
    createXmlGuard({ write: (b, from = 0, to = b.length) => parts.push(b.slice(from, to)) }, "s.xlsx", "sheet").write(strToU8(`<a${"\f".repeat(SPACE_RUN + 9)}b="1">${"\v".repeat(SPACE_RUN + 9)}</a>`));
    assert.equal(parts.reduce((n, p) => n + p.length, 0), `<ab="1"></a>`.length + 2 * SPACE_RUN);
});

test("a sheet named as the shared strings or the styles of its workbook is refused", async () => {
    const base = makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], level: 0 });
    const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const rels = (type) => strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/${type}" Target="worksheets/sheet1.xml"/></Relationships>`);
    for (const type of ["sharedStrings", "styles"]) {
        await rejects(read(fileOf(rebuild(base, { "xl/_rels/workbook.xml.rels": rels(type) }))), "DAMAGED", (e) => /missing or not a sheet/.test(e.message));
    }
});

test("the report says this refusal of shared strings and formats in its own words, by details.what (issue #325)", async () => {
    // pivotkit-react's texts of loading data, as the report shows a reader's error
    const { de, en, errorText } = await import("../../pivotkit-react/src/import-labels.js");
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const limits = { importCells: 1_000, columns: 10 };
    const strings = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), {
        "xl/worksheets/sheet1.xml": strToU8(`<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>11999</v></c></row></sheetData></worksheet>`),
        "xl/sharedStrings.xml": strToU8(`<sst ${NS}>${"<si><t>x</t></si>".repeat(12_000)}</sst>`)
    });
    // a workbook taken by its media type, without an extension in its name
    const file = new File([strings], "export", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const error = await readFile(file, { plugins: [xlsxReader], limits }).catch((e) => e);
    assert.equal(error.code, "LIMIT_EXCEEDED", String(error));
    assert.equal(error.details.limit, "importCells");
    assert.equal(errorText(error, "export", en, { lang: "en", locale: "en-US" }), "it has more than 11,000 different texts and formats (limits.importCells): load a smaller extract of it, or a host can raise this limit");
    assert.equal(errorText(error, "export", de, { lang: "de", locale: "de-DE" }), "sie hat mehr als 11.000 verschiedene Texte und Formate (limits.importCells): eine kleinere Auswahl daraus laden, oder eine Anwendung kann diese Grenze anheben");
    // a sheet whose values span too much stays rows x columns
    const wide = await read(fileOf(makeXlsx({ sheets: [{ name: "S", rows: Array.from({ length: 1_200 }, (_, r) => Array.from({ length: 10 }, (_, c) => r * 10 + c)) }] })), { limits }).catch((e) => e);
    assert.equal(wide.details?.limit, "importCells", String(wide));
    assert.equal(errorText(wide, "book.xlsx", en, { lang: "en", locale: "en-US" }), "it has more than 11,000 values (rows x columns) (limits.importCells): load a smaller extract of it, or a host can raise this limit");
});

// #324: the end of a row tag was found by its first ">", so a quoted ">" or "/>" in it cut the tag
test("a quoted '>' or '/>' in a row tag does not end the tag: the row is read and checked", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const sheet = (row2) => makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>n</t></is></c></row>${row2}</sheetData></worksheet>`);
    for (const tag of ['<row r="2" x="/>">', "<row r='2' x='a>b'>"]) {
        const t = await read(fileOf(sheet(`${tag}<c r="A2"><v>1</v></c></row>`)));
        assert.deepEqual(col(t, "n"), [1], tag);
    }
    await assert.rejects(read(fileOf(sheet('<row r="2" x="/>"><c r="XFD2"><v>1</v></c></row>'))), (e) => e.details?.limit === "columns");
    // the filter gives the same XML however the sheet arrives in pieces
    const { createSheetFilter } = await import("../src/sheet-filter.js");
    const xml = '<worksheet><sheetData><row r="1" q="/>"><c r="A1"><v>1</v></c></row><row r="2" q=\'>\'><c r="A2" s="1"/></row></sheetData><pageMargins/></worksheet>';
    const expected = '<worksheet><sheetData><row r="1" q="/>"><c r="A1"><v>1</v></c></row></sheetData></worksheet>';
    for (const size of [1, 2, 5, 13, xml.length]) {
        const parts = [];
        const filter = createSheetFilter({ write: (b, from = 0, to = b.length) => parts.push(new TextDecoder().decode(b.slice(from, to))) });
        const bytes = strToU8(xml);
        for (let at = 0; at < bytes.length; at += size) filter.push(bytes.subarray(at, at + size));
        assert.deepEqual(filter.end(), { lastRow: 2, lastValueRow: 1, dropped: 1, errors: 0, shared: -1 }, `pieces of ${size} bytes`);
        assert.equal(parts.join(""), expected, `pieces of ${size} bytes`);
    }
});

// read-excel-file reads a tag or an attribute without its namespace prefix (<x:row>, x:r): a sheet
// written with prefixes went past the checks before parsing, so a value far out made the parser build
// a dense table of billions of cells from a file of a few hundred bytes
test("a sheet with namespace prefixes is checked and trimmed as one without", async () => {
    const XNS = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const prefixed = (rows) => makeXlsxWithSheet(`<?xml version="1.0"?>\n<x:worksheet ${XNS}><x:sheetData>${rows}</x:sheetData></x:worksheet>`);
    const head = '<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>n</x:t></x:is></x:c></x:row>';
    const cpu = cpuClock();
    await assert.rejects(read(fileOf(prefixed(`${head}<x:row r="300000"><x:c r="ALL300000"><x:v>1</x:v></x:c></x:row>`))), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "importCells");
    await assert.rejects(read(fileOf(prefixed(`${head}<x:row r="2"><x:c r="XFD2"><x:v>1</x:v></x:c></x:row>`))), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "columns");
    // a cell with another prefix than its row, and only the sheet's data with a prefix, count the same
    await assert.rejects(read(fileOf(prefixed(`${head}<x:row r="2"><y:c xmlns:y="urn:y" r="XFD2"><x:v>1</x:v></y:c></x:row>`))), (e) => e.details?.limit === "columns");
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    await assert.rejects(read(fileOf(makeXlsxWithSheet(`<worksheet ${NS} ${XNS}><x:sheetData><row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="XFD2"><v>1</v></c></row></x:sheetData></worksheet>`))), (e) => e.details?.limit === "columns");
    assert.ok(cpu() < 3_000, `${Math.round(cpu())} ms of CPU`);
    // a sheet with prefixes reads as before; its rows without a value are left out with a note
    const empty = Array.from({ length: 200 }, (_, k) => `<x:row r="${k + 3}"><x:c r="A${k + 3}" s="1"/></x:row>`).join("");
    const t = await read(fileOf(prefixed(`${head}<x:row r="2" ><x:c r="A2"><x:v>7</x:v></x:c></x:row >${empty}`)));
    assert.deepEqual(col(t, "n"), [7]);
    assert.ok(t.notes.some((note) => note.code === "USED_RANGE"), JSON.stringify(t.notes));
    // the filter gives the same XML however the sheet arrives in pieces, and finds the shared string a
    // cell names in a <v> with a prefix
    const { createSheetFilter } = await import("../src/sheet-filter.js");
    const xml = '<x:worksheet><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>3</x:v></x:c></x:row ><x:row r="2"><x:c r="A2" s="1"/></x:row></x:sheetData><x:pageMargins/></x:worksheet>';
    const expected = '<x:worksheet><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>3</x:v></x:c></x:row ></x:sheetData></x:worksheet>';
    for (const size of [1, 2, 5, 13, xml.length]) {
        const parts = [];
        const filter = createSheetFilter({ write: (b, from = 0, to = b.length) => parts.push(new TextDecoder().decode(b.slice(from, to))) });
        const bytes = strToU8(xml);
        for (let at = 0; at < bytes.length; at += size) filter.push(bytes.subarray(at, at + size));
        assert.deepEqual(filter.end(), { lastRow: 2, lastValueRow: 1, dropped: 1, errors: 0, shared: 3 }, `pieces of ${size} bytes`);
        assert.equal(parts.join(""), expected, `pieces of ${size} bytes`);
    }
});

// read-excel-file appends each cell with a value to its row, after the empty cells up to the cell's
// column: a row whose cells all name column A is as wide as its number of cells
test("a row whose cells name one column counts as wide as the parser makes it, before parsing", async () => {
    const { createSheetFilter } = await import("../src/sheet-filter.js");
    const filtered = (cells, limits) => {
        const filter = createSheetFilter({ write() {} }, limits);
        filter.push(strToU8(`<worksheet><sheetData><row r="1">${cells}</row></sheetData></worksheet>`));
        return filter.end();
    };
    const oneColumn = Array.from({ length: 50 }, (_, k) => `<c r="A${k + 1}"><v>1</v></c>`).join("");
    assert.throws(() => filtered(oneColumn, { maxColumn: 10 }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "columns" && e.details.value === 50);
    assert.throws(() => filtered(oneColumn, { maxCells: 100 }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "importCells");
    // cells in their order, with gaps and empty cells: as wide as the last column, as before
    const inOrder = '<c r="A1"><v>1</v></c><c r="C1" s="1"/><c r="J1"><v>1</v></c>';
    assert.doesNotThrow(() => filtered(inOrder, { maxColumn: 10, maxCells: 10 }));
    assert.throws(() => filtered(`${inOrder}<c r="J2"><v>1</v></c>`, { maxColumn: 10 }), (e) => e.details?.value === 11);
    // and read() refuses it, with the limit the filter names
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    await assert.rejects(read(fileOf(makeXlsxWithSheet(`<worksheet ${NS}><sheetData><row r="1">${oneColumn}</row></sheetData></worksheet>`)), { limits: { columns: 10 } }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "columns");
});

// read-excel-file reads a row's r with Number() and a cell's r as letters, then Number(), with
// entities decoded (a prefixed r maybe twice) and any prefix but "xmlns:" left out; the checks
// before parsing read them so too (an entity or a byte beyond ASCII counts as the worst), or a few bytes ask it for a
// billion rows
test("row and cell numbers are read as the parser reads them, before parsing", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const sheet = (rows) => makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>n</t></is></c></row>${rows}</sheetData></worksheet>`);
    const rowTags = ['<row r="1e9">', '<row r="0x40000000">', '<row r="+999999999">', '<row r=" 999999999 ">', '<row r="&#57;99999999">', '<row r="Infinity">',
        '<row XMLNS:r="999999999" xmlns:XMLNS="urn:y">', '<row xmlns:a:r="999999999">', '<row x:y:r="999999999" y:r="2">', '<row a=x"y r="999999999" b=">', '<row x:r="&amp;#57;99999999" r="2">'];
    for (const tag of rowTags) {
        await assert.rejects(read(fileOf(sheet(`${tag}<c r="A2"><v>1</v></c></row>`))), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows", tag);
    }
    // a row without r takes its number from its first cell
    await assert.rejects(read(fileOf(sheet('<row><c r="A2e8"><v>1</v></c></row>'))), (e) => e.details?.limit === "rows");
    // columns only the check before parsing can refuse in time (billions of cells to the parser);
    // "~" is column 62 to it, a lower-case letter 33 to 58
    const cpu = cpuClock();
    for (const cell of ['<c r="~~~~~~~2">', '<c r="zzzzzzz2">', '<c r="ZZZZZZZZ2" r="A2">', '<c x:r="ZZZZZZZZ2" r="A2">', '<c x:y:r="ZZZZZZZZ2" y:r="A2">']) {
        await assert.rejects(read(fileOf(sheet(`<row r="2">${cell}<v>1</v></c></row>`))), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "columns", cell);
    }
    for (const cell of ['<c r="&#90;ZZZZZZZ2">', '<c x:r="&amp;#90;ZZZZZZZ2" r="A2">', '<c r="A\u00a02">']) {
        await assert.rejects(read(fileOf(sheet(`<row r="2">${cell}<v>1</v></c></row>`))), (e) => e.code === "LIMIT_EXCEEDED", cell);
    }
    assert.ok(cpu() < 3_000, `${Math.round(cpu())} ms of CPU`);
    // an xmlns:r declared on a row or cell is no r
    const t = await read(fileOf(sheet('<row r="2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c r="A2" xmlns:t="urn:t"><v>7</v></c></row>')));
    assert.deepEqual(col(t, "n"), [7]);
});

test("a row in a row is checked; a '<' in a tag and a row the sheet does not end are refused", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const head = '<row r="1"><c r="A1" t="inlineStr"><is><t>n</t></is></c></row>';
    const sheet = (rows, end = "</sheetData></worksheet>") => makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet ${NS}><sheetData>${head}${rows}${end}`);
    await assert.rejects(read(fileOf(sheet('<row r="2"><c r="A2"><v>1</v></c><row r="999999999"></row></row>'))), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows");
    // the parser reads a quoted "<" as part of the tag, so it would see an r the checks do not
    await rejects(read(fileOf(sheet('<row r="2"><c a="<" r="XFD2"><v>1</v></c></row><row r="600000"><c r="A600000"><v>1</v></c></row>'))), "DAMAGED", (e) => /"<"/.test(e.message));
    await rejects(read(fileOf(sheet('<row r="2"><c r="A2" <v>1</v></c></row>'))), "DAMAGED", (e) => /"<"/.test(e.message));
    // a row cut off at the end of the sheet goes to the parser unchecked no more
    const cpu = cpuClock();
    await rejects(read(fileOf(sheet('<row r="2"><c r="ZZZZZZZZ2"><v>1</v></c>', ""))), "DAMAGED");
    assert.ok(cpu() < 1_000, `${Math.round(cpu())} ms of CPU`);
    // the sheet's data starts where the parser starts it: not in a comment or CDATA section before it
    for (const before of ["<!-- <sheetData> -->", "<![CDATA[<sheetData>]]>"]) {
        const t = await read(fileOf(makeXlsxWithSheet(`<worksheet ${NS}>${before}<sheetData>${head}<row r="2"><c r="A2"><v>7</v></c></row></sheetData></worksheet>`)));
        assert.deepEqual(col(t, "n"), [7], before);
    }
});

// the shared strings are counted where the parser reads their tags: a quoted "<!--" in a tag would
// hide the items after it from the count
test("a '<' in a tag of the shared strings is refused, so no item is hidden from the count", async () => {
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const strings = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], level: 0 }), {
        "xl/worksheets/sheet1.xml": strToU8(`<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="s"><v>11999</v></c></row></sheetData></worksheet>`),
        "xl/sharedStrings.xml": strToU8(`<sst ${NS}><x a="<!--"/>${"<si><t>a</t></si>".repeat(12_000)}<x b="-->"/></sst>`)
    });
    await rejects(read(fileOf(strings), { limits: { importCells: 1_000, columns: 10 } }), "DAMAGED", (e) => /"<"/.test(e.message));
});
