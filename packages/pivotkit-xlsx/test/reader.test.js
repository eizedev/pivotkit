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
    // LIMIT_EXCEEDED as for every other limit (#208), with the limit, the values and the file
    await assert.rejects(read(fileOf(bytes), { limits: { unpackedBytes: 100 * 1024 * 1024 } }), (e) => e instanceof PivotkitError && e.code === "LIMIT_EXCEEDED" && e.details.limit === "unpackedBytes" && e.details.max === 100 * 1024 * 1024 && e.details.value > e.details.max && e.details.file === "book.xlsx" && /ZIP bomb/.test(e.message) && /limits\.unpackedBytes/.test(e.message));
    assert.ok(performance.now() - started < 1_000, "refused without unpacking");
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
    const { createSheetFilter, createXmlCheck } = await import("../src/xml.js");
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
        assert.deepEqual(stats, { lastRow: 9, lastValueRow: 4, dropped: 3, errors: 1 }, `pieces of ${size} bytes`);
    }
    // the guard: whitespace runs cut, over-long tokens refused, the same however the XML is split
    const { createXmlGuard, SPACE_RUN, MAX_TOKEN, MAX_TAG } = await import("../src/xml.js");
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
    const started = performance.now();
    await assert.rejects(read(fileOf(wide)), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "columns" && e.details.file === "book.xlsx");
    await assert.rejects(read(fileOf(sheet('<row r="1"><c r="A1"><v>1</v></c></row><row r="999999999"><c r="A999999999"><v>1</v></c></row>'))), (e) => e.details.limit === "rows");
    await assert.rejects(read(fileOf(sheet('<row r="1"><c r="ALL1"><v>1</v></c></row><row r="200000"><c r="A200000"><v>1</v></c></row>'))), (e) => e.details.limit === "importCells");
    assert.ok(performance.now() - started < 2_000, "refused at once");
});

test("a list of sheets with <sheet repeated and never closed is read in linear time", async () => {
    const workbook = `<?xml version="1.0"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${"<sheet".repeat(40_000)}`; // and no ">" after them
    const bytes = rebuild(makeXlsx({ sheets: [{ name: "S", rows: [["A"]] }], level: 0 }), { "xl/workbook.xml": strToU8(workbook) });
    const started = performance.now();
    await rejects(read(fileOf(bytes)), "NO_TABLE");
    assert.ok(performance.now() - started < 2_000, `${performance.now() - started} ms`);
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
test("a sheet padded with whitespace is read in linear time and memory, with its values", async () => {
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
    // 50 MiB unpacked: the reader never holds the padding as text, nor all of it at once
    // about 0.5 s on a laptop, a few seconds under coverage on a busy runner; before the fix minutes
    assert.ok(ms < 20_000, `${Math.round(ms)} ms`);
    assert.ok(peak - rss < 300 * MiB, `${Math.round((peak - rss) / MiB)} MiB more resident memory`);
});

test("a text of more than 1 MiB or a tag of more than 256 KiB in a sheet is refused at once, however it is padded", async () => {
    const MiB = 1024 * 1024;
    const sheet = (body) => makeXlsxWithSheet(`<?xml version="1.0"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${body}</row></sheetData></worksheet>`);
    const started = performance.now();
    // an Excel cell holds at most 32,767 characters
    await rejects(read(fileOf(sheet(`<c r="A1" t="inlineStr"><is><t>${"a".repeat(2 * MiB)}</t></is></c>`))), "DAMAGED", (e) => /1 MiB/.test(e.message));
    // a quoted attribute value of ">" is one tag to an XML parser
    await rejects(read(fileOf(sheet(`<c r="A1" x="${">".repeat(2 * MiB)}"><v>1</v></c>`))), "DAMAGED", (e) => /256 KiB/.test(e.message));
    await rejects(read(fileOf(sheet(`<c r="A1"><v>1</v></c><!--${"->".repeat(MiB)}-->`))), "DAMAGED", (e) => /1 MiB/.test(e.message));
    assert.ok(performance.now() - started < 5_000, `${Math.round(performance.now() - started)} ms`);
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
    // quadratic), then the guard refuses the one long tag the parser would read
    const started = performance.now();
    await rejects(read(fileOf(sheet(`<row r="1"><c r="A1"><v>1</v></c></row><row r="2">${"<c ".repeat(170_000)}</c></row>`))), "DAMAGED", (e) => /256 KiB/.test(e.message));
    assert.ok(performance.now() - started < 3_000, `${Math.round(performance.now() - started)} ms`);
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
