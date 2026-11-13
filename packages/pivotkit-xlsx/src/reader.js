/*
 * The reader of pivotkit-xlsx (loaded on demand by the plugin in index.js): an Excel workbook (.xlsx)
 * into a table of pivotkit-core/import.
 *
 * 1. Checks of its own before any XML is parsed: the file size (limits.fileBytes); what the file is
 *    (an .xls, an encrypted workbook, a binary .xlsb or a macro workbook is refused with what to do);
 *    the ZIP directory: parts (limits.archiveEntries) and unpacked size (limits.unpackedBytes), so a
 *    ZIP bomb is refused before it is unpacked; no vbaProject.bin; no <!DOCTYPE or <!ENTITY in the
 *    XML parts it reads.
 * 2. It unpacks only the parts the chosen sheet needs, streaming, never beyond the size the directory
 *    states; it leaves out the sheet's rows without a value (the used range of formatted empty cells)
 *    and what follows them, cuts long runs of whitespace and refuses a text over 1 MiB or a tag over 256 KiB, which
 *    read-excel-file would parse in quadratic time (xml.js).
 * 3. read-excel-file (MIT) parses those parts: shared strings, styles (a date is a number with a date
 *    format), the values Excel saved (never a formula). It gets them as a ZIP without compression,
 *    so it unpacks nothing itself and starts no worker: no `blob:` worker, which a strict
 *    Content-Security-Policy would block.
 * 4. pivotkit-core's `createTable` finds the header, cleans the values and infers the types, as for
 *    CSV and JSON.
 */

import { bytesOf, cleanText, createTable, fileError, fileName, readOptions } from "pivotkit-core/import";
import { readSheet } from "read-excel-file/universal";
import { checkXml, createSheetFilter, createXmlCheck, createXmlGuard } from "./xml.js";
import { createStoredZip, readDirectory, unpack, unpackStream } from "./zip.js";
import { sharedParts, worksheets } from "./workbook.js";

const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);
/** A sheet name in a message: it comes from the file. */
const shown = (name) => cleanText(String(name)).slice(0, 100);
/** The most a workbook's list of sheets and its relationships may be; real ones are a few kilobytes. */
const MAX_WORKBOOK_PART = 4 * 1024 * 1024;
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
// a password-protected .xlsx is a compound file holding the encrypted package (UTF-16 stream name)
const ENCRYPTED_STREAM = ascii("EncryptedPackage").flatMap((c) => [c, 0]);

function containsBytes(bytes, pattern) {
    const first = pattern[0];
    for (let i = bytes.indexOf(first); i !== -1 && i <= bytes.length - pattern.length; i = bytes.indexOf(first, i + 1)) {
        let k = 1;
        while (k < pattern.length && bytes[i + k] === pattern[k]) k++;
        if (k === pattern.length) return true;
    }
    return false;
}

/** Refuses what is no .xlsx, with what it is and what to do. */
function checkKind(bytes, file) {
    if (/\.xlsm$/i.test(file)) {
        throw fileError("MACROS", file, "a workbook with macros (.xlsm) is not loaded; save it as an Excel workbook (.xlsx) or as CSV.");
    }
    if (startsWith(bytes, CFB)) {
        if (containsBytes(bytes, ENCRYPTED_STREAM)) {
            throw fileError("ENCRYPTED", file, "the workbook is protected with a password; save it without one, then load it.");
        }
        throw fileError("XLS", file, "this is an Excel 97-2003 workbook (.xls); save it as an Excel workbook (.xlsx) or as CSV, then load it.");
    }
    if (!startsWith(bytes, ZIP)) {
        throw fileError("WRONG_TYPE", file, "this is no Excel workbook (.xlsx); check the file, or load a CSV file with the CSV reader.");
    }
}

/**
 * Reads and checks a workbook's directory and its small parts.
 * @returns {Promise<{ entries: Map<string, import("./zip.js").ZipEntry>, parts: Map<string, Uint8Array>, sheets: ReturnType<typeof worksheets>, shared: ReturnType<typeof sharedParts> }>}
 */
async function open(bytes, file, limits, between) {
    checkKind(bytes, file);
    const list = readDirectory(bytes, file, limits);
    const entries = new Map(list.map((e) => [e.name, e]));
    for (const e of list) {
        if (/(^|\/)vbaProject\.bin$/i.test(e.name)) {
            throw fileError("MACROS", file, "the workbook holds macros (vbaProject.bin); save it as an Excel workbook (.xlsx) without macros, or as CSV.");
        }
    }
    if (!entries.has("xl/workbook.xml")) {
        if (entries.has("xl/workbook.bin")) {
            throw fileError("XLSB", file, "this is an Excel binary workbook (.xlsb); save it as an Excel workbook (.xlsx) or as CSV, then load it.");
        }
        throw fileError("WRONG_TYPE", file, "this ZIP file is no Excel workbook (it has no xl/workbook.xml).");
    }
    /** @type {Map<string, Uint8Array>} */
    const parts = new Map();
    const read = async (path, max = Infinity) => {
        const entry = entries.get(path);
        if (!entry) return null;
        if (entry.size > max) {
            throw fileError("DAMAGED", file, `the part "${path}" is ${entry.size.toLocaleString("en-US")} bytes, far more than a workbook's list of sheets holds; it is refused.`);
        }
        const data = await unpack(bytes, entry, file, between);
        checkXml(data, file, path);
        parts.set(path, data);
        return data;
    };
    const types = await read("[Content_Types].xml", MAX_WORKBOOK_PART);
    if (types && /macroEnabled/i.test(new TextDecoder().decode(types))) {
        throw fileError("MACROS", file, "a workbook with macros (.xlsm) is not loaded; save it as an Excel workbook (.xlsx) or as CSV.");
    }
    const decode = (data) => (data ? new TextDecoder().decode(data) : "");
    const workbook = decode(await read("xl/workbook.xml", MAX_WORKBOOK_PART));
    const rels = decode(await read("xl/_rels/workbook.xml.rels", MAX_WORKBOOK_PART));
    const sheets = worksheets(workbook, rels);
    if (sheets.length === 0) {
        throw fileError("NO_TABLE", file, "the workbook has no worksheet.");
    }
    return { entries, parts, sheets, shared: sharedParts(rels) };
}

/** The sheet asked for: by name, by index (0-based), else the first visible one. */
function pickSheet(sheets, wanted, file) {
    if (typeof wanted === "string") {
        const s = sheets.find((x) => x.name === wanted);
        if (!s) throw fileError("NO_SHEET", file, `the workbook has no sheet "${shown(wanted)}".`, { sheet: wanted });
        return s;
    }
    if (typeof wanted === "number") {
        const s = sheets[wanted];
        if (!s) throw fileError("NO_SHEET", file, `the workbook has no sheet ${wanted + 1}.`, { sheet: wanted });
        return s;
    }
    return sheets.find((s) => s.visible) ?? sheets[0];
}

/**
 * The worksheets of a workbook: name, index (0-based) and whether it is visible.
 * @param {Blob | ArrayBuffer | Uint8Array} file
 * @param {import("pivotkit-core/import").ReadOptions} [options]
 * @returns {Promise<import("pivotkit-core/import").SheetInfo[]>}
 */
export async function sheets(file, options) {
    const o = readOptions(options);
    const name = fileName(file, o);
    const bytes = await bytesOf(file, o.limits, name);
    const { sheets: list } = await open(bytes, name, o.limits, () => o.signal?.throwIfAborted());
    return list.map(({ name: sheet, index, visible }) => ({ name: sheet, index, visible }));
}

/**
 * Reads one sheet of a workbook into a table: `options.sheet` (a name, or an index from 0), else the
 * first visible one.
 * @param {Blob | ArrayBuffer | Uint8Array} file
 * @param {import("pivotkit-core/import").ReadOptions} [options]
 * @returns {Promise<import("pivotkit-core/import").ImportTable>}
 */
export async function read(file, options) {
    const o = readOptions(options);
    const name = fileName(file, o);
    const signal = o.signal;
    signal?.throwIfAborted();
    const bytes = await bytesOf(file, o.limits, name);
    o.onProgress?.({ phase: "read", done: bytes.length, total: bytes.length });
    const between = () => signal?.throwIfAborted();
    const { entries, parts, sheets: list, shared } = await open(bytes, name, o.limits, between);
    const sheet = pickSheet(list, o.sheet, name);

    const entry = entries.get(sheet.path);
    if (!entry) throw fileError("DAMAGED", name, `the part of sheet "${shown(sheet.name)}" is missing; open the workbook in Excel and save it again.`);
    // shared strings and styles stream from the workbook into the ZIP below, never held whole
    const streamed = [shared.sharedStrings, shared.styles].filter((path, k, all) => entries.has(path) && !parts.has(path) && all.indexOf(path) === k && path !== sheet.path);
    // read-excel-file reads the parts from a ZIP: one without compression, of only these parts, each
    // passed through createXmlGuard, with the sheet's rows without a value left out while it streams in
    // sized for the parts as the directory states them: the buffer never grows (no copy); what the
    // filter and the guard leave out is never written, and transfer() below gives the unused end back
    let room = entry.size + 22 + 2 * (76 + sheet.path.length);
    for (const [path, data] of parts) room += data.length + 2 * (76 + path.length);
    for (const path of streamed) room += /** @type {import("./zip.js").ZipEntry} */ (entries.get(path)).size + 2 * (76 + path.length);
    const zip = createStoredZip(room);
    for (const [path, data] of parts) {
        const part = zip.begin(path);
        createXmlGuard(part, name, path).write(data);
        part.end();
    }
    parts.clear();
    for (const path of streamed) {
        const part = zip.begin(path);
        const guard = createXmlGuard(part, name, path);
        const check = createXmlCheck(name, path);
        await unpackStream(bytes, /** @type {import("./zip.js").ZipEntry} */ (entries.get(path)), name, (chunk) => {
            check(chunk);
            guard.write(chunk);
        }, between);
        part.end();
    }
    const sheetPart = zip.begin(sheet.path);
    // a title block above the header may hold a few rows more than the table
    const filter = createSheetFilter(createXmlGuard(sheetPart, name, sheet.path), { file: name, part: sheet.path, maxRow: o.limits.rows + 1_000, maxColumn: o.limits.columns, maxCells: o.limits.importCells + o.limits.columns * 1_000 });
    const check = createXmlCheck(name, sheet.path);
    let unpacked = 0;
    await unpackStream(bytes, entry, name, (chunk) => {
        check(chunk);
        filter.push(chunk);
        unpacked += chunk.length;
    }, () => {
        signal?.throwIfAborted();
        o.onProgress?.({ phase: "unpack", done: unpacked, total: entry.size });
    });
    const trimmed = filter.end();
    sheetPart.end();
    let stored = zip.finish();
    signal?.throwIfAborted();
    o.onProgress?.({ phase: "parse", done: 0, total: trimmed.lastValueRow });
    /** @type {unknown[][]} */
    let rows;
    try {
        // an ArrayBuffer of the ZIP's length: transfer() shrinks the buffer, where it can, without a copy
        const whole = /** @type {ArrayBuffer & { transfer?: (length: number) => ArrayBuffer }} */ (stored.buffer);
        const buffer = whole.byteLength === stored.length ? whole : typeof whole.transfer === "function" ? whole.transfer(stored.length) : stored.slice().buffer;
        stored = null;
        rows = await readSheet(buffer, sheet.name);
    } catch (error) {
        throw fileError("DAMAGED", name, `sheet "${shown(sheet.name)}" cannot be read (${String(/** @type {Error} */ (error)?.message ?? error).slice(0, 200)}); open the workbook in Excel and save it again.`);
    }
    signal?.throwIfAborted();
    o.onProgress?.({ phase: "parse", done: trimmed.lastValueRow, total: trimmed.lastValueRow });

    const table = createTable({ file: name, limits: o.limits, locale: o.locale, hints: { decimal: ".", serialDates: true } });
    table.note("SHEET", { sheet: sheet.name, count: list.length, visible: list.filter((s) => s.visible).length });
    if (trimmed.lastRow > trimmed.lastValueRow && trimmed.lastRow - trimmed.lastValueRow >= 100) {
        table.note("USED_RANGE", { usedRow: trimmed.lastRow, lastRow: trimmed.lastValueRow });
    }
    for (let r = 0; r < rows.length; r++) {
        table.row(rows[r]);
        rows[r] = null;
    }
    // read-excel-file reads a cell with an error (#N/A, #DIV/0!) as empty; the filter counted them
    if (trimmed.errors > 0) table.note("ERROR_CELLS", { count: trimmed.errors });
    signal?.throwIfAborted();
    return table.finish(o.types);
}
