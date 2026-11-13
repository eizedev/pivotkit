// Loading data in the browser, the parts without a DOM: the source id of a file (import-source.js),
// the data steps of the undo history (data-history.js, import-steps.js), the file kept over a new
// mount (data-keep.js), the limits a file is read with (import-limits.js), the texts of the import UI
// and of the readers' notes (import-labels.js), and how a file is read: in the host's worker for the
// built-in readers, on the page for a plugin or when the worker does not start (import-run.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PivotkitError, encode } from "pivotkit-core";
import { IMPORT_NOTE_CODES, limitError, readFile } from "pivotkit-core/import";
import { DATA_STEPS, NO_DATA_STEPS, hostHistory, pushData, redoData, undoData, withoutFuture } from "../src/data-history.js";
import { IMPORT_TEXTS, de, en, errorText, importLabels, noteText } from "../src/import-labels.js";
import { acceptOf, completeTable, formatsOf, readImport, sheetsOf } from "../src/import-run.js";
import { SHOWN_MAX, sha256Bytes, sha256Hex, shownName, sourceIdOf } from "../src/import-source.js";
import { backToOriginal, loadData, moveData, restoreData } from "../src/import-steps.js";
import { KEPT_REPORTS, forgetData, hostIdentity, keepData, keptData } from "../src/data-keep.js";
import { importLimitsOf } from "../src/import-limits.js";
import { resolveLabels } from "../src/labels.js";
import { createState } from "../src/view-history.js";

const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
const csv = (text, name = "tickets.csv") => new File([text], name, { type: "text/csv" });
const TICKETS = "Id;Team;Opened;Hours\n1;Network;10.11.2026;1,5\n2;Server;11.11.2026;2,25\n3;Network;12.11.2026;4\n";

test("SHA-256 of its own gives Node's digest, at every padding boundary and for text outside ASCII", async () => {
    for (const text of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(119), "Größe\u0000Straße 😀", "x".repeat(5000)]) {
        const want = createHash("sha256").update(text, "utf8").digest("hex");
        assert.equal(Buffer.from(sha256Bytes(new TextEncoder().encode(text))).toString("hex"), want, `${text.length} characters`);
        assert.equal(await sha256Hex(text, { subtle: null }), want, "without crypto.subtle");
        assert.equal(await sha256Hex(text), want, "with crypto.subtle");
    }
});

test("a file's source id is its name and 16 hex digits of the SHA-256 of its name and columns, as the PowerShell Universal demo builds it", async () => {
    const columns = ["Id", "Team", "Opened"];
    const want = `tickets.csv#${createHash("sha256").update(["tickets.csv", ...columns].join("\u0000"), "utf8").digest("hex").slice(0, 16)}`;
    assert.equal(await sourceIdOf("tickets.csv", columns), want);
    assert.equal(await sourceIdOf("tickets.csv", columns, { subtle: null }), want);
    // other or reordered columns are other data; the same file again is the same
    assert.notEqual(await sourceIdOf("tickets.csv", ["Team", "Id", "Opened"]), want);
    assert.equal(await sourceIdOf("tickets.csv", [...columns]), want);
    // the worked example of docs/reference/import.md ("How a loaded file is named")
    assert.equal(await sourceIdOf("tickets.csv", ["Id", "Team", "Opened", "Hours", "Zip"]), "tickets.csv#e51bd4bc21e98ee8");
    assert.equal(await sourceIdOf("tickets.csv", ["Team", "Id", "Opened", "Hours", "Zip"], { subtle: null }), "tickets.csv#d11fe64346f1d906");
    // a long name is cut for people, the hash still covers all of it
    const long = `${"a".repeat(130)}.csv`;
    const other = `${"a".repeat(130)}x.csv`;
    const id = await sourceIdOf(long, columns);
    assert.equal(id.split("#")[0], `${"a".repeat(SHOWN_MAX - 3)}...`);
    assert.notEqual(id, await sourceIdOf(other, columns));
    // never cut inside a character outside the BMP
    const emoji = `${"a".repeat(SHOWN_MAX - 4)}😀😀😀`;
    assert.equal(shownName(emoji), `${"a".repeat(SHOWN_MAX - 4)}...`);
    assert.equal(shownName("short.csv"), "short.csv");
});

test("data steps: a load goes back to the data before it with its view history, Redo forward again, a new step drops the redo", () => {
    const h = (present) => ({ ...createState("s", "start", present), past: [{ view: "older", note: "x", tag: null }] });
    const fileA = { key: 1 };
    const fileB = { key: 2 };
    // the host's data with its history, then file A loaded
    let steps = pushData(NO_DATA_STEPS, { data: null, history: { ...h("host view"), future: [{ view: "undone", note: "y", tag: null }] } }, "a.csv loaded");
    assert.equal(steps.past.length, 1);
    assert.deepEqual(steps.past[0].history.future, [], "the redo of the history left is dropped: loading is a new step");
    // Undo while A is shown: the host's data and its history come back; A waits for Redo
    const back = undoData(steps, { data: fileA, history: h("view of A") });
    assert.equal(back.step.data, null);
    assert.equal(back.step.history.present, "host view");
    assert.equal(back.step.note, "a.csv loaded");
    assert.equal(back.steps.future[0].data, fileA);
    // Redo shows A again with the history it had, its own steps kept
    const forward = redoData(back.steps, { data: null, history: back.step.history });
    assert.equal(forward.step.data, fileA);
    assert.equal(forward.step.history.present, "view of A");
    assert.equal(forward.step.history.past.length, 1);
    assert.equal(forward.step.note, "a.csv loaded");
    assert.equal(redoData(forward.steps, { data: fileA, history: h("") }), null, "nothing more to redo");
    // a new step after Undo: what was undone goes
    assert.deepEqual(withoutFuture(back.steps).future, []);
    assert.equal(withoutFuture(steps), steps, "the same object when there is nothing to drop");
    // B loaded on A: the host's history is still found for "Back to original data"
    steps = pushData(forward.steps, { data: fileA, history: h("view of A") }, "b.csv loaded");
    assert.equal(hostHistory(steps)?.present, "host view");
    assert.equal(undoData(NO_DATA_STEPS, { data: null, history: h("") }), null);
    void fileB;
});

test("data steps keep at most DATA_STEPS data sets, the oldest going first", () => {
    let steps = NO_DATA_STEPS;
    for (let i = 0; i < DATA_STEPS + 3; i++) {
        steps = pushData(steps, { data: { key: i }, history: createState("s", "v") }, `file ${i} loaded`);
    }
    assert.equal(steps.past.length, DATA_STEPS);
    assert.deepEqual(steps.past.map((s) => s.data.key), [3, 4, 5]);
    // Undo and Redo move steps between past and future: the sum stays
    const back = undoData(steps, { data: { key: 99 }, history: createState("s", "v") });
    assert.equal(back.steps.past.length + back.steps.future.length, DATA_STEPS);
});

test("the report's data steps: Load data, Back to original data, Undo and Redo tell the host and say what happened", async () => {
    const labels = resolveLabels("en-US");
    const host = encode([{ Team: "A", Hours: 1 }]);
    const file = encode({ columns: ["Id", "Team"], types: ["number", "string"], data: [[1, 2], ["x", "y"]] });
    const told = [];
    const said = [];
    let undone = 0;
    let state = { imported: null, steps: NO_DATA_STEPS, history: createState("0|host", "start", "host view") };
    const replaced = [];
    const ctx = () => ({
        ...state,
        setSteps: (s) => (state = { ...state, steps: s }),
        setImported: (d) => (state = { ...state, imported: d }),
        history: { snapshot: () => state.history, replace: (h) => (replaced.push(h), (state = { ...state, history: h })) },
        hostEncoded: host,
        hostSource: { id: "sales", name: "Sales" },
        onDataLoad: (d) => (told.push(d), undefined),
        labels,
        locale: "en-US",
        announce: (text, extra) => said.push({ text, action: extra?.action?.label }),
        undo: () => (undone += 1)
    });
    const loaded = { encoded: file, source: { id: "t.csv#0123456789abcdef", name: "t.csv" }, file: { name: "t.csv", size: 10, type: "text/csv" }, sheet: null, rows: 2, columns: [{ name: "Id", type: "number" }, { name: "Team", type: "string" }], notes: [{ code: "ENCODING", params: { encoding: "UTF-8" }, message: "Read as UTF-8." }] };
    assert.equal(loadData(ctx(), loaded), true);
    assert.equal(state.imported.source.id, "t.csv#0123456789abcdef");
    assert.deepEqual(told.at(-1), { cause: "load", source: loaded.source, file: loaded.file, sheet: null, rows: 2, columns: loaded.columns, notes: loaded.notes });
    assert.deepEqual(said.at(-1), { text: "t.csv loaded: 2 rows, 2 columns", action: "Undo" });
    // the file's own view history, then Back to original data: the host's view comes back without its old steps
    state = { ...state, history: createState(`${state.imported.key}|file`, "start", "file view") };
    backToOriginal(ctx());
    assert.equal(state.imported, null);
    assert.equal(replaced.at(-1).present, "host view");
    assert.deepEqual(replaced.at(-1).past, []);
    assert.equal(told.at(-1).cause, "original");
    assert.deepEqual(told.at(-1).source, { id: "sales", name: "Sales" });
    assert.deepEqual(told.at(-1).columns, [{ name: "Team", type: "string" }, { name: "Hours", type: "number" }]);
    assert.equal(said.at(-1).text, "The original data is shown");
    // Undo: the file again, with its view; Redo: the original again
    assert.equal(moveData(ctx(), true), "Back to original data");
    assert.equal(state.imported?.source.name, "t.csv");
    assert.equal(state.history.present, "file view");
    assert.equal(told.at(-1).cause, "undo");
    assert.equal(moveData(ctx(), true), "t.csv loaded");
    assert.equal(state.imported, null);
    assert.equal(moveData(ctx(), true), null, "nothing older");
    assert.equal(moveData(ctx(), false), "t.csv loaded");
    assert.equal(told.at(-1).cause, "redo");
    // a host that refuses the file: nothing changes
    const before = state;
    const refuse = { ...ctx(), onDataLoad: () => false };
    assert.equal(loadData(refuse, loaded), false);
    assert.equal(state, before);
    assert.equal(undone, 0);
});

test("every note code of the readers has a text in English and German; German has every English text", () => {
    for (const code of IMPORT_NOTE_CODES) {
        assert.ok(Object.hasOwn(en.notes, code), `en ${code}`);
    }
    assert.deepEqual(keys(de), keys(en));
    assert.deepEqual(Object.keys(IMPORT_TEXTS), ["en", "de"]);
});

test("a note in the report's language: counts in their plural form and the locale's digits, the variants of a code, a plugin's own code in its words", () => {
    const where = { lang: "en", locale: "en-US" };
    assert.equal(noteText({ code: "ROWS_EMPTY", params: { count: 1 } }, en, where), "1 empty row was left out.");
    assert.equal(noteText({ code: "ROWS_EMPTY", params: { count: 12345 } }, en, where), "12,345 empty rows were left out.");
    assert.equal(noteText({ code: "ROWS_EMPTY", params: { count: 12345 } }, de, { lang: "de", locale: "de-DE" }), "12.345 leere Zeilen wurden weggelassen.");
    assert.equal(noteText({ code: "COLUMN_RENAMED", params: { position: 3, from: "", to: "Column 3" } }, en, where), "Column 3 has no name; it is named “Column 3”.");
    assert.equal(noteText({ code: "COLUMN_RENAMED", params: { position: 2, from: "Status", to: "Status (2)" } }, de, where), "Die Spalte „Status“ heißt jetzt „Status (2)“.");
    assert.equal(noteText({ code: "SHEET", params: { sheet: "Data", count: 3, visible: 2 } }, en, where), "Read the sheet “Data” of 3 sheets.");
    assert.equal(noteText({ code: "SHEET", params: { sheet: "Data", count: 1 } }, en, where), "Read the sheet “Data”.");
    assert.equal(noteText({ code: "VALUES_NOT_CONVERTED", params: { column: "Hours", type: "number", count: 2 } }, de, { lang: "de", locale: "de-DE" }), "2 Werte in „Hours“ lassen sich nicht als Zahl lesen und bleiben leer.");
    assert.equal(noteText({ code: "DATE_ORDER", params: { column: "Opened", order: "mdy" } }, en, where), "Dates in “Opened” were read as month/day/year; the values fit both.");
    assert.equal(noteText({ code: "USED_RANGE", params: { usedRow: 900000, lastRow: 94312 } }, en, where), "The sheet's used range reaches row 900,000; the values end at row 94,312, the empty rows below were skipped.");
    assert.equal(noteText({ code: "PLUGIN_OWN", params: {}, message: "Read 3 records." }, en, where), "Read 3 records.");
    // a param from the file is text: markup stays as it is
    assert.equal(noteText({ code: "JSON_PROPERTY", params: { property: "<b>rows</b>" } }, en, where), "The rows were read from “<b>rows</b>”.");
});

test("a file's error in the report's language without the file's name the note names already: a limit with its key and that a host can raise it (issue #185)", async () => {
    const en_ = { lang: "en", locale: "en-US" };
    const de_ = { lang: "de", locale: "de-DE" };
    // a limit of the built-in readers, as they throw it: in the report's language, the key in brackets
    const rows = await readFile(csv("A\n" + "1\n".repeat(1001), "big.csv"), { limits: { rows: 1000 } }).catch((e) => e);
    assert.equal(rows.code, "LIMIT_EXCEEDED");
    assert.equal(errorText(rows, "big.csv", en, en_), "it has more than 1,000 rows (limits.rows): load a smaller extract of it, or a host can raise this limit");
    assert.equal(errorText(rows, "big.csv", de, de_), "sie hat mehr als 1.000 Zeilen (limits.rows): eine kleinere Auswahl daraus laden, oder eine Anwendung kann diese Grenze anheben");
    const cells = await readFile(csv("A,B\n1,2\n3,4\n5,6\n", "cells.csv"), { limits: { importCells: 5 } }).catch((e) => e);
    assert.equal(errorText(cells, "cells.csv", en, en_), "it has more than 5 values (rows x columns) (limits.importCells): load a smaller extract of it, or a host can raise this limit");
    const bytes = new PivotkitError("LIMIT_EXCEEDED", "\"huge.csv\" has more than 10 bytes (limits.fileBytes): …", { limit: "fileBytes", value: 11, max: 10, file: "huge.csv" });
    assert.equal(errorText(bytes, "huge.csv", de, de_), "sie hat mehr als 10 Bytes (limits.fileBytes): eine kleinere Auswahl daraus laden, oder eine Anwendung kann diese Grenze anheben");
    // a limit this version has no word for (a plugin's own): the reader's message without the name in front
    const own = new PivotkitError("LIMIT_EXCEEDED", "\"big.log\" has more than 9 records (limits.records): load less", { limit: "records", value: 10, max: 9, file: "big.log" });
    assert.equal(errorText(own, "big.log", en, en_), "has more than 9 records (limits.records): load less");
    // a file the reader refuses: its message without the name and colon in front, in either form
    const invalid = await readFile(new File(["{"], "bad.json", { type: "application/json" })).catch((e) => e);
    assert.equal(invalid.code, "INVALID_FILE");
    assert.ok(invalid.message.startsWith('"bad.json": '), invalid.message);
    assert.equal(errorText(invalid, "bad.json", en, en_), invalid.message.slice('"bad.json": '.length));
    // a name the message does not start with is left alone, as is a plain text
    assert.equal(errorText(new Error('"other.csv" has a problem'), "big.csv", en, en_), '"other.csv" has a problem');
    assert.equal(errorText("no reader", "big.csv", en, en_), "no reader");
});

test("a workbook over the archive limits of pivotkit-xlsx is said in the report's language too (issue #239)", () => {
    const en_ = { lang: "en", locale: "en-US" };
    const de_ = { lang: "de", locale: "de-DE" };
    // as pivotkit-xlsx's zip.js throws them (LIMIT_EXCEEDED since #236)
    const parts = limitError("archiveEntries", 9, 5, "book.xlsx", "parts in its ZIP directory");
    assert.equal(errorText(parts, "book.xlsx", en, en_), "it has more than 5 parts in its ZIP directory (limits.archiveEntries): load a smaller extract of it, or a host can raise this limit");
    assert.equal(errorText(parts, "book.xlsx", de, de_), "sie hat mehr als 5 Teile in ihrem ZIP-Verzeichnis (limits.archiveEntries): eine kleinere Auswahl daraus laden, oder eine Anwendung kann diese Grenze anheben");
    const bomb = limitError("unpackedBytes", 209_715_200, 104_857_600, "book.xlsx", "bytes unpacked, by its ZIP directory; a ZIP bomb or a workbook too large to load");
    assert.equal(errorText(bomb, "book.xlsx", en, en_), "it has more than 104,857,600 bytes unpacked (limits.unpackedBytes): load a smaller extract of it, or a host can raise this limit");
    assert.equal(errorText(bomb, "book.xlsx", de, de_), "sie hat mehr als 104.857.600 entpackte Bytes (limits.unpackedBytes): eine kleinere Auswahl daraus laden, oder eine Anwendung kann diese Grenze anheben");
    // every limit a reader of pivotkit-core or pivotkit-xlsx stops a file at has words in both languages
    const stops = ["fileBytes", "rows", "columns", "importCells", "archiveEntries", "unpackedBytes"];
    for (const texts of [en, de]) {
        assert.deepEqual(Object.keys(texts.limitWhat).sort(), [...stops].sort());
    }
});

test("a host's texts for loading data (labels.dataImport) win over the defaults, of the right kind only", () => {
    const labels = resolveLabels("de-DE", { dataImport: { loadFile: "Datei öffnen…", rows: { one: "{count} Datensatz", other: "{count} Datensätze" }, cancel: 3 } });
    const t = importLabels(labels);
    assert.equal(t.loadFile, "Datei öffnen…");
    assert.equal(t.rows.other, "{count} Datensätze");
    assert.equal(t.cancel, "Abbrechen", "a number for a text is ignored");
    assert.equal(t.apply, "Daten laden");
    assert.equal(importLabels(labels), t, "merged once per labels object");
    assert.equal(importLabels(resolveLabels("fr-FR")).apply, "Load data", "English for a language without its texts");
});

test("the file picker takes what the readers read: the host's plugins first; the formats in words", () => {
    const jsonl = { apiVersion: 1, kind: "reader", name: "jsonl", label: "JSON Lines", accept: [".jsonl", "application/x-ndjson"], load: async () => ({ read: async () => null }) };
    assert.equal(acceptOf([]), ".csv,.tsv,.txt,.tab,text/csv,text/tab-separated-values,text/plain,.json,application/json");
    assert.ok(acceptOf([jsonl]).startsWith(".jsonl,application/x-ndjson,.csv"));
    assert.deepEqual(formatsOf([jsonl]), ["JSON Lines", "CSV or text", "JSON"]);
    // in the report's language where it has a name for the reader; a plugin of others keeps its own
    assert.deepEqual(formatsOf([jsonl, { name: "xlsx", label: "Excel workbook", accept: [".xlsx"] }], de.formatNames), ["JSON Lines", "Excel-Arbeitsmappe", "CSV oder Text", "JSON"]);
});

/**
 * A module worker as a test double: it runs import-worker.js's protocol in this process, with the
 * real readers. `failStart`: it cannot start (a CSP, a missing file): an error before "ready".
 */
function fakeWorker({ failStart = false, log = [] } = {}) {
    return () => {
        const w = {
            terminated: false,
            onmessage: null,
            onerror: null,
            terminate() {
                this.terminated = true;
                log.push("terminate");
            },
            async postMessage({ file, options }) {
                log.push(`read ${file.name}`);
                try {
                    const table = await readFile(file, { ...options, plugins: [], onProgress: (progress) => !w.terminated && w.onmessage?.({ data: { type: "progress", progress } }) });
                    if (!w.terminated) w.onmessage?.({ data: { type: "done", table: structuredClone(table) } });
                } catch (e) {
                    if (!w.terminated) w.onmessage?.({ data: { type: "error", error: { code: e.code, message: e.message, details: { ...e.details } } } });
                }
            }
        };
        log.push("start");
        setTimeout(() => (failStart ? w.onerror?.({ message: "blocked", preventDefault() {} }) : w.onmessage?.({ data: { type: "ready" } })), 0);
        return /** @type {any} */ (w);
    };
}

test("a CSV file is read in the host's worker, with progress; the table is the page's read", async () => {
    const log = [];
    const progress = [];
    const file = csv(TICKETS);
    const table = await readImport(file, { worker: fakeWorker({ log }), onProgress: (p) => progress.push(p.phase) });
    assert.deepEqual(log, ["start", "read tickets.csv", "terminate"]);
    assert.ok(progress.length > 0);
    const page = await readFile(file);
    assert.deepEqual(table.columns, page.columns);
    assert.deepEqual(table.types, ["number", "string", "date", "number"]);
    assert.deepEqual(table.data, page.data);
});

test("a worker that cannot start leaves the read to the page; a reader's error comes back as a PivotkitError", async () => {
    const log = [];
    const table = await readImport(csv(TICKETS), { worker: fakeWorker({ failStart: true, log }) });
    assert.equal(table.rowCount, 3);
    assert.deepEqual(log, ["start", "terminate"]);
    // a factory that throws (a cross-origin worker URL): the page reads too
    assert.equal((await readImport(csv(TICKETS), { worker: () => { throw new Error("SecurityError"); } })).rowCount, 3);
    await assert.rejects(readImport(csv('a,b\n"open,1\n'), { worker: fakeWorker() }), (e) => e instanceof PivotkitError && e.code === "INVALID_FILE" && e.details.reason === "UNCLOSED_QUOTE" && /line 2/.test(e.message));
    await assert.rejects(readImport(csv("a\n1\n2\n3\n"), { worker: fakeWorker(), limits: { rows: 2 } }), (e) => e instanceof PivotkitError && e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows");
});

test("Cancel stops the worker at once, and a read on the page between steps", async () => {
    const log = [];
    const controller = new AbortController();
    const reading = readImport(csv(TICKETS), { worker: fakeWorker({ log }), signal: controller.signal });
    controller.abort();
    await assert.rejects(reading, (e) => e.name === "AbortError");
    assert.ok(log.includes("terminate"));
    const big = csv(`n\n${Array.from({ length: 100_000 }, (_, i) => i).join("\n")}\n`);
    const c2 = new AbortController();
    const onPage = readImport(big, { signal: c2.signal, onProgress: () => c2.abort() });
    await assert.rejects(onPage, (e) => e.name === "AbortError");
});

test("a plugin's file is never sent to the worker: the plugin is code of the page", async () => {
    const log = [];
    const reads = [];
    const plugin = {
        apiVersion: 1,
        kind: "reader",
        name: "upper",
        label: "Upper",
        accept: [".up"],
        load: async () => ({
            read: async (file, options) => {
                reads.push(options.name);
                return readFile(new File([await file.text()], "x.csv"));
            },
            sheets: async () => [{ name: "One", index: 0, visible: true }, { name: "Two", index: 1, visible: false }, { bad: true }]
        })
    };
    const file = new File([TICKETS], "data.up");
    const table = await readImport(file, { plugins: [plugin], worker: fakeWorker({ log }) });
    assert.equal(table.rowCount, 3);
    assert.deepEqual(log, []);
    assert.deepEqual(reads, ["data.up"]);
    assert.deepEqual(await sheetsOf(file, { plugins: [plugin] }), [{ name: "One", index: 0, visible: true }, { name: "Two", index: 1, visible: false }]);
    assert.deepEqual(await sheetsOf(csv("a\n1\n"), {}), [], "one table: no sheets");
    // no reader for the file: the message says so
    await assert.rejects(readImport(new File(["x"], "notes.pdf", { type: "application/pdf" }), { worker: fakeWorker({ log }) }), (e) => e.details?.reason === "NO_READER");
    assert.deepEqual(log, []);
});

/** A worker double that answers with what `script` says, for the shapes a worker should not send. */
function scriptedWorker(script) {
    return () => {
        const w = { onmessage: null, onerror: null, onmessageerror: null, terminated: false, terminate() { this.terminated = true; }, postMessage(msg) { script.onPost?.(w, msg); } };
        setTimeout(() => script.onStart?.(w), 0);
        return /** @type {any} */ (w);
    };
}

test("a worker that answers without a table, cannot take the options or never starts: no hang, an error or the page's read", async () => {
    const file = csv(TICKETS);
    await assert.rejects(readImport(file, { worker: scriptedWorker({ onStart: (w) => w.onmessage({ data: { type: "ready" } }), onPost: (w) => w.onmessage({ data: { type: "done" } }) }) }), /no table/);
    await assert.rejects(readImport(file, { worker: scriptedWorker({ onStart: (w) => w.onmessage({ data: { type: "ready" } }), onPost: (w) => w.onmessage({ data: { type: "done", table: "x" } }) }) }), /no table/);
    await assert.rejects(readImport(file, { worker: scriptedWorker({ onStart: (w) => w.onmessage({ data: { type: "ready" } }), onPost: (w) => w.onmessageerror() }) }), /could not be read/);
    // options it cannot take, a factory that gives no worker, a worker that never says it is ready: the page reads
    const throwing = scriptedWorker({ onStart: (w) => w.onmessage({ data: { type: "ready" } }), onPost: () => { throw new DOMException("could not be cloned", "DataCloneError"); } });
    assert.equal((await readImport(file, { worker: throwing })).rowCount, 3);
    assert.equal((await readImport(file, { worker: () => /** @type {any} */ (undefined) })).rowCount, 3);
    const silent = scriptedWorker({});
    assert.equal((await readImport(file, { worker: silent, readyMs: 50 })).rowCount, 3);
});

test("a plugin's minimal table (columns, types, data, notes) gets what the preview and retype need", async () => {
    const minimal = { columns: ["a", "b"], types: ["string", "string"], data: [["1", "2"], ["x", "y"]], notes: [{ code: "SHEET" }, null, { nope: 1 }] };
    const t = completeTable(minimal);
    assert.equal(t.rowCount, 2);
    assert.deepEqual(t.raw, minimal.data);
    assert.deepEqual(t.detected, ["string", "string"]);
    assert.deepEqual(t.notes, [{ code: "SHEET", params: {}, message: "SHEET" }]);
    const plugin = { apiVersion: 1, kind: "reader", name: "mini", label: "Mini", accept: [".mini"], load: async () => ({ read: async () => minimal }) };
    const read = await readImport(new File(["x"], "a.mini"), { plugins: [plugin] });
    assert.equal(read.rowCount, 2);
    // the preview's change of a type works on it (retype needs raw and hints)
    const { retype } = await import("pivotkit-core/import");
    assert.deepEqual(retype(read, ["number", "string"]).data[0], [1, 2]);
});

test("a host whose onDataLoad throws: a load is refused with its message; a step that happened stays, the error goes to the page", async () => {
    const labels = resolveLabels("en-US");
    const said = [];
    let state = { imported: null, steps: NO_DATA_STEPS, history: createState("0|host", "start", "host view") };
    const thrown = [];
    const realTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => thrown.push(fn);
    try {
        const ctx = (onDataLoad) => ({
            ...state,
            setSteps: (s) => (state = { ...state, steps: s }),
            setImported: (d) => (state = { ...state, imported: d }),
            history: { snapshot: () => state.history, replace: (h) => (state = { ...state, history: h }) },
            hostEncoded: encode([{ a: 1 }]),
            hostSource: undefined,
            onDataLoad,
            labels,
            locale: "en-US",
            announce: (text, extra) => said.push({ text, tone: extra?.tone }),
            undo: () => undefined
        });
        const loaded = { encoded: encode([{ b: 2 }]), source: { id: "f#1", name: "f.csv" }, file: { name: "f.csv", size: 3, type: "text/csv" }, sheet: null, rows: 1, columns: [{ name: "b", type: "number" }], notes: [] };
        assert.equal(loadData(ctx(() => { throw new Error("Not today"); }), loaded), false);
        assert.equal(state.imported, null);
        assert.deepEqual(said.at(-1), { text: "f.csv was not loaded: Not today", tone: "error" });
        // a promise is not waited for: only false refuses
        assert.equal(loadData(ctx(() => Promise.resolve(false)), loaded), true);
        backToOriginal(ctx(() => { throw new Error("host bug"); }));
        assert.equal(state.imported, null, "the step stands");
        assert.equal(said.at(-1).text, "The original data is shown");
        assert.equal(moveData(ctx(() => { throw new Error("host bug"); }), true), "Back to original data");
        assert.equal(thrown.length, 2, "the host's errors are thrown later, outside the report");
        assert.throws(() => thrown[0](), /host bug/);
    } finally {
        globalThis.setTimeout = realTimeout;
    }
});

test("a report mounted again: its file's data is kept per storageKey in memory, for the same host data only, for at most KEPT_REPORTS reports", () => {
    const host = hostIdentity({ dataKey: "sales-2000", sourceId: "sales", schemaKey: "[]" });
    const entry = (name) => ({ host, imported: { key: 1, encoded: encode([]), source: { id: `${name}#0`, name }, sheet: null, file: { name, size: 1, type: "text/csv" } }, steps: NO_DATA_STEPS, history: createState("1|x", "s"), savedKeys: {} });
    const a = entry("a.csv");
    keepData("report-a", a);
    assert.equal(keptData("report-a", host), a);
    assert.equal(keptData("report-a", host), a, "reading keeps it: the report writes it again while the file is shown");
    // two reports, two keys
    const b = entry("b.csv");
    keepData("report-b", b);
    assert.equal(keptData("report-a", host), a);
    assert.equal(keptData("report-b", host), b);
    // the host's data is other data: another dataKey, another source, or (without a dataKey) other columns
    assert.notEqual(hostIdentity({ dataKey: "sales-500", sourceId: "sales", schemaKey: "[]" }), host);
    assert.notEqual(hostIdentity({ dataKey: "sales-2000", sourceId: "other", schemaKey: "[]" }), host);
    assert.equal(hostIdentity({ dataKey: undefined, sourceId: undefined, schemaKey: '[["Team","string"]]' }), hostIdentity({ dataKey: undefined, sourceId: undefined, schemaKey: '[["Team","string"]]' }));
    assert.notEqual(hostIdentity({ dataKey: undefined, sourceId: undefined, schemaKey: '[["Team","string"]]' }), hostIdentity({ dataKey: undefined, sourceId: undefined, schemaKey: '[["Team","number"]]' }));
    assert.notEqual(hostIdentity({ dataKey: 1, sourceId: undefined, schemaKey: "[]" }), hostIdentity({ dataKey: undefined, sourceId: undefined, schemaKey: "1" }));
    // a report mounted over other data takes nothing; reading lets nothing go (the report does, in an effect)
    assert.equal(keptData("report-a", hostIdentity({ dataKey: "sales-500", sourceId: "sales", schemaKey: "[]" })), null);
    assert.equal(keptData("report-a", host), a);
    forgetData("report-a");
    assert.equal(keptData("report-a", host), null);
    // the host's data shown again lets it go
    forgetData("report-b");
    assert.equal(keptData("report-b", host), null);
    // bounded: the key written longest ago goes first
    for (let i = 0; i <= KEPT_REPORTS; i++) {
        keepData(`r${i}`, entry(`${i}.csv`));
    }
    assert.equal(keptData("r0", host), null);
    for (let i = 1; i <= KEPT_REPORTS; i++) {
        assert.equal(keptData(`r${i}`, host)?.imported.source.name, `${i}.csv`);
    }
    // written again, a key is the latest
    keepData("r1", entry("1.csv"));
    keepData("r9", entry("9.csv"));
    assert.equal(keptData("r2", host), null);
    assert.ok(keptData("r1", host));
    for (let i = 0; i <= 9; i++) {
        forgetData(`r${i}`);
    }
});

test("a file's data shown again by a report mounted again tells the host (onDataLoad \"restore\"); the host's data tells nothing", () => {
    const labels = resolveLabels("en-US");
    const file = encode({ columns: ["Id", "Team"], types: ["number", "string"], data: [[1, 2], ["x", "y"]] });
    const told = [];
    const imported = { key: 7, encoded: file, source: { id: "t.csv#0123456789abcdef", name: "t.csv" }, sheet: null, file: { name: "t.csv", size: 10, type: "text/csv" } };
    const ctx = { imported, hostEncoded: encode([{ Team: "A" }]), hostSource: { id: "sales" }, onDataLoad: (d) => told.push(d), labels, locale: "en-US" };
    restoreData(/** @type {any} */ (ctx));
    assert.deepEqual(told, [{ cause: "restore", source: imported.source, file: imported.file, sheet: null, rows: 2, columns: [{ name: "Id", type: "number" }, { name: "Team", type: "string" }], notes: [] }]);
    restoreData(/** @type {any} */ ({ ...ctx, imported: null }));
    assert.equal(told.length, 1);
});

test("a loaded file's limits are the host's importLimits over its limits, key by key", async () => {
    assert.equal(importLimitsOf(undefined, undefined), undefined);
    assert.equal(importLimitsOf(null, null), undefined);
    assert.deepEqual(importLimitsOf({ rows: 50, cells: 9 }, undefined), { rows: 50, cells: 9 }, "without importLimits: the host's limits");
    assert.deepEqual(importLimitsOf(undefined, { rows: 2 }), { rows: 2 });
    // the import key wins, the host's other keys stay
    assert.deepEqual(importLimitsOf({ rows: 5_000, cells: 9 }, { rows: 2, fileBytes: 1_000 }), { rows: 2, cells: 9, fileBytes: 1_000 });
    // a value that is no object reaches readFile as it is, which refuses it with its own message
    await assert.rejects(readImport(csv(TICKETS), { limits: importLimitsOf({ rows: 5 }, /** @type {any} */ ("small")) }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION");
    // an array is no limits object either: not spread into the host's limits, refused by readFile
    for (const value of [[], [2]]) {
        assert.deepEqual(importLimitsOf({ rows: 5 }, value), value);
        await assert.rejects(readImport(csv(TICKETS), { limits: importLimitsOf({ rows: 5 }, /** @type {any} */ (value)) }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION", JSON.stringify(value));
    }
    // the host's data of five rows fits its own limits; a file of three rows is over the import limit of 2,
    // read on the page and in the worker alike, and the error names the limit
    const limits = { rows: 5_000 };
    const fileLimits = importLimitsOf(limits, { rows: 2 });
    assert.equal(encode([{}, {}, {}, {}, {}], { limits }).length, 5);
    for (const worker of [undefined, fakeWorker()]) {
        await assert.rejects(readImport(csv(TICKETS), { worker, limits: fileLimits }), (e) => e instanceof PivotkitError && e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows" && e.details.max === 2);
    }
});
