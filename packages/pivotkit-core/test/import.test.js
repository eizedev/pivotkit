// pivotkit-core/import: the CSV and JSON readers on real public exports (test/import-fixtures/,
// sources in SOURCES.md), the shared table (header, names, cleaning, types, limits), retyping, the
// plugin contract, and the columnar input of encode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUILT_IN_READERS, PLUGIN_API_VERSION, csvReader, jsonReader, loadReader, readFile, readerFor, retype, validatePlugin } from "pivotkit-core/import";
import { LIMITS, PivotkitError, computePivot, encode, toGrid } from "pivotkit-core";

const fixture = (name) => readFileSync(new URL(`./import-fixtures/${name}`, import.meta.url));
const fileOf = (name, bytes = fixture(name)) => new File([bytes], name);
const text = (name, content) => new File([new TextEncoder().encode(content)], name);
const col = (table, name) => table.data[table.columns.indexOf(name)];
const typeOf = (table, name) => table.types[table.columns.indexOf(name)];
const codes = (table) => table.notes.map((n) => n.code);
const rejects = (promise, check) => assert.rejects(promise, (e) => e instanceof PivotkitError && check(e));

test("German election results: BOM, semicolons, a title block, German numbers and dates, leading zeros", async () => {
    const t = await readFile(fileOf("kerg2-btw25.csv"));
    assert.equal(t.columns[0], "Wahlart");
    assert.equal(t.columns.at(-1), "Gewählt");
    assert.equal(t.rowCount, 110);
    assert.deepEqual(codes(t).slice(0, 3), ["ENCODING", "SEPARATOR", "LINES_SKIPPED"]);
    assert.equal(t.notes[0].message, "Read as UTF-8.");
    assert.equal(t.notes[1].message, "Values separated by semicolons.");
    assert.equal(t.notes[2].message, "9 line(s) above the column names were skipped (a title block).");
    // 23.02.2025 is a date, not the number 23022025
    assert.equal(typeOf(t, "Wahltag"), "date");
    assert.equal(col(t, "Wahltag")[0], "2025-02-23");
    // 82,5122 is 82.5122; 60510631 stays whole
    assert.equal(typeOf(t, "Prozent"), "number");
    assert.equal(col(t, "Prozent")[1], 82.5122);
    assert.equal(col(t, "Anzahl")[0], 60_510_631);
    assert.equal(col(t, "DiffProzent")[0], -1.08241);
    // "01" (Schleswig-Holstein) keeps the column as text
    assert.equal(typeOf(t, "Gebietsnummer"), "string");
    assert.ok(col(t, "Gebietsnummer").includes("01"));
    // the table is encode's columnar input as it is
    const data = encode(t);
    assert.equal(data.length, 110);
    assert.equal(data.column("Wahltag").type, "date");
});

test("Excel's sep= line names the separator and is not the header", async () => {
    const body = new TextDecoder().decode(fixture("kerg2-btw25.csv")).replace(/^\u{FEFF}/u, "");
    const t = await readFile(text("kerg2.csv", `sep=;\r\n${body}`));
    assert.equal(t.columns[0], "Wahlart");
    assert.equal(t.notes[1].params.separator, ";");
    assert.equal(t.rowCount, 110);
});

test("charging points register: quotes with semicolons and line breaks, decimals, postcodes; UTF-8 and Windows-1252 read alike", async () => {
    const utf8 = await readFile(fileOf("ladesaeulen-bnetza.csv"));
    const cp1252 = await readFile(fileOf("ladesaeulen-bnetza-1252.csv"));
    assert.equal(utf8.notes[0].message, "Read as UTF-8.");
    assert.equal(cp1252.notes[0].message, "Read as Windows-1252.");
    assert.deepEqual(cp1252.columns, utf8.columns);
    assert.deepEqual(cp1252.types, utf8.types);
    assert.deepEqual(cp1252.data, utf8.data);
    const t = utf8;
    assert.equal(t.rowCount, 60);
    assert.equal(t.notes.find((n) => n.code === "LINES_SKIPPED").params.count, 10);
    assert.equal(t.columns[0], "Ladeeinrichtungs-ID");
    assert.ok(t.columns.includes("Straße"));
    assert.equal(col(t, "Betreiber")[1], "smopi® - Multi Chargepoint Solution GmbH");
    // a semicolon inside quotes is part of the value
    assert.equal(col(t, "Bezahlsysteme")[0], "RFID-Karte;Onlinezahlungsverfahren");
    // a line break inside quotes is a space; no value keeps one
    for (const values of t.data) for (const v of values) if (typeof v === "string") assert.ok(!/[\r\n]/.test(v), v);
    // German decimals, German dates, postcodes as text
    assert.equal(typeOf(t, "Breitengrad"), "number");
    assert.equal(col(t, "Breitengrad")[0], 48.442398);
    assert.equal(col(t, "Inbetriebnahmedatum")[0], "2020-01-11");
    assert.equal(typeOf(t, "Postleitzahl"), "string");
    assert.ok(col(t, "Postleitzahl").some((p) => /^0\d{4}$/.test(p)));
    // the identifier keeps its type: a number field named ...-ID is the UI's identifier rule, not the reader's
    assert.equal(typeOf(t, "Ladeeinrichtungs-ID"), "number");
});

test("earthquakes: commas, quoted commas, ISO times with an offset; the same rows as UTF-16 with tabs", async () => {
    const csv = await readFile(fileOf("usgs-earthquakes.csv"));
    const utf16 = await readFile(fileOf("usgs-earthquakes-utf16.txt"));
    assert.equal(csv.notes[1].params.separator, ",");
    assert.equal(utf16.notes[0].message, "Read as UTF-16 (little endian).");
    assert.equal(utf16.notes[1].params.separator, "\t");
    assert.deepEqual(utf16.columns, csv.columns);
    assert.deepEqual(utf16.data, csv.data);
    assert.equal(csv.rowCount, 60);
    assert.equal(typeOf(csv, "time"), "date");
    assert.equal(col(csv, "time")[0], "2026-11-10T19:54:18.279Z");
    assert.equal(col(csv, "place")[0], "207 km NW of Port-Olry, Vanuatu");
    assert.equal(typeOf(csv, "mag"), "number");
    assert.equal(col(csv, "depth")[0], 11.705);
    // an instant: encode reads it in the data's time zone
    const berlin = encode(csv, { timeZone: "Europe/Berlin" });
    assert.equal(berlin.column("time").type, "date");
});

test("Nobel laureates: the rows under a property, nested objects as dotted columns, strings stay text", async () => {
    const t = await readFile(fileOf("nobel-laureates.json"));
    assert.deepEqual(codes(t).slice(0, 2), ["JSON_PROPERTY", "JSON_FLATTENED"]);
    assert.equal(t.notes[0].message, 'The rows were read from "laureates".');
    assert.equal(t.rowCount, 8);
    assert.equal(col(t, "knownName.en")[0], "A. Michael Spence");
    assert.equal(col(t, "birth.place.country.en")[0], "USA");
    // "745" is a string in the JSON and stays text, as encode does
    assert.equal(typeOf(t, "id"), "string");
    assert.equal(col(t, "id")[0], "745");
    // an array is JSON text
    const prizes = col(t, "nobelPrizes")[0];
    assert.ok(prizes.startsWith("[{"), prizes);
});

test("endoflife.date: dates, booleans, and a column of dates mixed with false is text", async () => {
    const t = await readFile(fileOf("endoflife-nodejs.json"));
    assert.equal(t.rowCount, 26);
    assert.equal(typeOf(t, "releaseDate"), "date");
    assert.equal(typeOf(t, "extendedSupport"), "boolean");
    assert.equal(typeOf(t, "lts"), "string");
    assert.equal(col(t, "lts")[1], "false");
    assert.equal(typeOf(t, "cycle"), "string");
});

test("JSON shapes: array of arrays, { columns, rows }, columnar { columns, data }", async () => {
    const arrays = await readFile(text("a.json", '[["Team","Hours"],["A",1],["B",2.5]]'));
    const header = await readFile(text("b.json", '{"columns":["Team","Hours"],"rows":[["A",1],["B",2.5]]}'));
    const columnar = await readFile(text("c.json", '{"columns":["Team","Hours"],"data":[["A","B"],[1,2.5]]}'));
    for (const t of [arrays, header, columnar]) {
        assert.deepEqual(t.columns, ["Team", "Hours"]);
        assert.deepEqual(t.types, ["string", "number"]);
        assert.deepEqual(t.data, [["A", "B"], [1, 2.5]]);
    }
    await rejects(readFile(text("d.json", '{"columns":["A"],"data":[[1,2],[3]]}')), (e) => e.code === "INVALID_FILE");
    await rejects(readFile(text("e.json", '{"a":1}')), (e) => e.details.reason === "NO_TABLE" && e.message.startsWith('"e.json": no table found'));
    await rejects(readFile(text("f.json", '[{"a":1},')), (e) => e.details.reason === "INVALID_JSON" && e.details.file === "f.json");
});

test("column names: trimmed, control characters out, empty ones numbered, repeated ones counted case-insensitively", async () => {
    const t = await readFile(text("names.csv", "Name; name ;;Te\u{202E}am\u{7};NAME;;\nA;B;C;D;E;;\nF;G;H;I;J;;\n"));
    assert.deepEqual(t.columns, ["Name", "name (2)", "Column 3", "Team", "NAME (3)"]);
    const renamed = t.notes.filter((n) => n.code === "COLUMN_RENAMED").map((n) => n.message);
    assert.deepEqual(renamed, ['Column "name" is named "name (2)".', 'Column 3 has no name; it is named "Column 3".', 'Column "NAME" is named "NAME (3)".']);
    // the two columns without a name and without a value are left out
    assert.deepEqual(t.notes.filter((n) => n.code === "COLUMN_DROPPED").map((n) => n.params.position), [6, 7]);
});

test("values: control and direction characters out, line breaks and tabs as spaces, long text cut, empty rows dropped", async () => {
    const long = "x".repeat(50);
    const t = await readFile(text("v.csv", `A,B\n"invoice\u{202E}fdp.exe","two\nlines\tand tab"\n,\n\n${long},=1+1\n`), { limits: { textLength: 20 } });
    assert.deepEqual(t.columns, ["A", "B"]);
    assert.deepEqual(col(t, "A"), ["invoicefdp.exe", "x".repeat(20)]);
    // text that looks like a formula stays as it is: the exports guard it
    assert.deepEqual(col(t, "B"), ["two lines and tab", "=1+1"]);
    assert.ok(t.notes.some((n) => n.code === "ROWS_EMPTY" && n.params.count === 2));
    assert.ok(t.notes.some((n) => n.code === "TEXT_CUT" && n.params.count === 1 && n.params.max === 20));
    assert.ok(t.notes.some((n) => n.code === "CHARACTERS_REMOVED" && n.params.count === 1));
});

test("rows with more values than names get columns named Column N", async () => {
    const t = await readFile(text("x.csv", "A;B\n1;2\n3;4;5\n"));
    assert.deepEqual(t.columns, ["A", "B", "Column 3"]);
    assert.deepEqual(col(t, "Column 3"), [null, 5]);
    assert.ok(t.notes.some((n) => n.code === "COLUMNS_ADDED" && n.params.rows === 1));
});

test("types from text: dates before numbers, leading zeros and long numbers stay text, the notation per column", async () => {
    const t = await readFile(text("t.csv", [
        "Day;Zip;Long;De;En;Int;Flag;Mixed",
        "10.11.2026;01067;12345678901234567;1.234,5;1234.5;1.234;true;1",
        "1.2.2026 08:30;04109;1;2,25;0.5;2;FALSE;x"
    ].join("\n")));
    assert.deepEqual(t.types, ["date", "string", "string", "number", "number", "number", "boolean", "string"]);
    assert.deepEqual(col(t, "Day"), ["2026-11-10", "2026-02-01T08:30:00"]);
    assert.deepEqual(col(t, "De"), [1234.5, 2.25]);
    assert.deepEqual(col(t, "En"), [1234.5, 0.5]);
    // with a semicolon, 1.234 is German: one thousand two hundred thirty-four
    assert.deepEqual(col(t, "Int"), [1234, 2]);
    // with a comma, 1.5 is English; a German "1,5" in quotes is still read (1,5 is never 15)
    const c = await readFile(text("c.csv", 'Int,De\n1.234,"1,5"\n2,"2,5"\n'));
    assert.deepEqual(col(c, "Int"), [1.234, 2]);
    assert.deepEqual(col(c, "De"), [1.5, 2.5]);
});

test("dates with slashes: the values decide the order, else the locale, with a note", async () => {
    const clear = await readFile(text("a.csv", "When\n13/02/2026\n01/03/2026\n"));
    assert.deepEqual(col(clear, "When"), ["2026-02-13", "2026-03-01"]);
    assert.ok(!codes(clear).includes("DATE_ORDER"));
    const us = await readFile(text("b.csv", "When\n02/03/2026\n"));
    assert.deepEqual(col(us, "When"), ["2026-02-03"]);
    assert.equal(us.notes.find((n) => n.code === "DATE_ORDER").message, 'Dates in "When" were read as month/day/year; the values fit both.');
    const de = await readFile(text("c.csv", "When\n02/03/2026\n"), { locale: "de-DE" });
    assert.deepEqual(col(de, "When"), ["2026-03-02"]);
});

test("retype: another type from the values as read, without reading the file again", async () => {
    const t = await readFile(fileOf("kerg2-btw25.csv"));
    const asText = retype(t, { Prozent: "string", Wahltag: "string" });
    // the text as the file wrote it, not the number
    assert.equal(col(asText, "Prozent")[1], "82,5122");
    assert.equal(col(asText, "Wahltag")[0], "23.02.2025");
    assert.equal(typeOf(asText, "Prozent"), "string");
    // other columns unchanged, the table read once
    assert.equal(col(asText, "Anzahl"), col(t, "Anzahl"));
    const back = retype(asText, { Prozent: "number" });
    assert.deepEqual(col(back, "Prozent"), col(t, "Prozent"));
    // a text column as numbers: what is no number is blank, with a note
    const n = retype(t, { Gebietsname: "number" });
    assert.ok(col(n, "Gebietsname").every((v) => v === null));
    assert.equal(n.notes.at(-1).message, `110 value(s) in "Gebietsname" are no number and are empty.`);
    // by position too; the override of read() is the same
    const byPosition = retype(t, [undefined, "string"]);
    assert.equal(col(byPosition, "Wahltag")[0], "23.02.2025");
    const read = await readFile(fileOf("kerg2-btw25.csv"), { types: { Prozent: "string" } });
    assert.deepEqual(col(read, "Prozent"), col(asText, "Prozent"));
    assert.throws(() => retype({ columns: ["a"] }, {}), (e) => e.code === "INVALID_ARGUMENT");
});

test("an unclosed quote names its line; files that are no text are refused with what they are", async () => {
    await rejects(readFile(text("q.csv", 'A,B\n1,2\n3,"open\nstill open\n')), (e) => e.details.reason === "UNCLOSED_QUOTE" && e.details.line === 3 && e.message === '"q.csv": the quote that opens a value in line 3 is never closed.');
    // a quote closed after line breaks: the line counted is the one it opened in
    await rejects(readFile(text("r.csv", 'A\n"a\nb"\n"c\n')), (e) => e.details.line === 4);
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await rejects(readFile(fileOf("book.csv", zip)), (e) => e.details.reason === "WRONG_TYPE" && /Excel workbook/.test(e.message));
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);
    await rejects(readFile(fileOf("old.csv", xls)), (e) => e.details.reason === "WRONG_TYPE" && /\.xls/.test(e.message));
    await rejects(readFile(fileOf("bin.txt", new Uint8Array([65, 0, 0, 0, 66, 67, 0, 1, 2]))), (e) => e.details.reason === "BINARY");
});

test("limits: the file size before reading, rows, columns and cells while reading; each message names the file and the limit", async () => {
    let read = false;
    const big = new (class extends Blob {
        get size() {
            return LIMITS.fileBytes + 1;
        }
        get name() {
            return "huge.csv";
        }
        async arrayBuffer() {
            read = true;
            return new ArrayBuffer(0);
        }
    })([]);
    await rejects(readFile(big), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "fileBytes" && e.details.file === "huge.csv");
    assert.equal(read, false, "the bytes were not read");
    const rows = "A\n" + "1\n".repeat(11);
    await rejects(readFile(text("rows.csv", rows), { limits: { rows: 10 } }), (e) => e.details.limit === "rows" && e.message === '"rows.csv" has more than 10 rows (limits.rows): load a smaller extract of it, or a host can raise this limit');
    await rejects(readFile(text("cols.csv", "A,B,C\n1,2,3\n"), { limits: { columns: 2 } }), (e) => e.details.limit === "columns");
    await rejects(readFile(text("cells.csv", "A,B\n1,2\n3,4\n5,6\n"), { limits: { importCells: 5 } }), (e) => e.details.limit === "importCells");
    await rejects(readFile(text("j.json", JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ i })))), { limits: { rows: 10 } }), (e) => e.details.limit === "rows");
    await rejects(readFile(text("w.json", JSON.stringify([{ a: 1, b: 2, c: 3 }])), { limits: { columns: 2 } }), (e) => e.details.limit === "columns");
});

test("abort and progress", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(readFile(fileOf("kerg2-btw25.csv"), { signal: controller.signal }), (e) => e.name === "AbortError");
    const phases = [];
    await readFile(fileOf("kerg2-btw25.csv"), { onProgress: (p) => phases.push(p.phase) });
    assert.deepEqual([...new Set(phases)], ["read", "parse"]);
    // a large file is read in steps: an abort between them stops it
    const many = "A,B\n" + "1,2\n".repeat(40_000);
    const late = new AbortController();
    const reading = readFile(text("many.csv", many), { signal: late.signal, onProgress: (p) => p.phase === "parse" && late.abort() });
    await assert.rejects(reading, (e) => e.name === "AbortError");
});

test("plugins: the contract is checked, another API version is refused with both versions named", async () => {
    assert.equal(PLUGIN_API_VERSION, 1);
    assert.deepEqual(BUILT_IN_READERS.map((p) => p.name), ["csv", "json"]);
    const plugin = { apiVersion: 1, kind: "reader", name: "demo", label: "Demo", accept: [".demo", "application/x-demo"], load: async () => ({ read: async () => ({ columns: [] }) }) };
    assert.equal(validatePlugin(plugin).name, "demo");
    assert.ok(Object.isFrozen(validatePlugin(plugin)));
    assert.throws(() => validatePlugin({ ...plugin, apiVersion: 2 }), (e) => e.code === "INVALID_ARGUMENT" && e.message === 'plugin "demo" uses plugin API version 2; this pivotkit-core supports version 1. Use a version of the plugin made for API 1, or update pivotkit.');
    assert.throws(() => validatePlugin({ ...plugin, kind: "chart" }), /kind "chart"/);
    assert.throws(() => validatePlugin({ ...plugin, name: "Bad Name" }), /name/);
    assert.throws(() => validatePlugin({ ...plugin, accept: ["xlsx"] }), /accept/);
    assert.throws(() => validatePlugin({ ...plugin, load: "./reader.js" }), /load/);
    assert.throws(() => validatePlugin(null), /must be an object/);
    // the host's plugins before the built-in ones; by extension, then by media type
    assert.equal(readerFor({ name: "a.CSV" }), csvReader);
    assert.equal(readerFor({ name: "a.json" }), jsonReader);
    assert.equal(readerFor({ name: "x.demo" }, [plugin]).name, "demo");
    assert.equal(readerFor({ name: "noext", type: "application/x-demo" }, [plugin]).name, "demo");
    assert.equal(readerFor({ name: "a.xlsx" }), undefined);
    await rejects(readFile(text("a.xlsx", "x")), (e) => e.details.reason === "NO_READER");
    // a module without read() is refused when loaded
    await assert.rejects(loadReader({ ...plugin, name: "empty", load: async () => ({}) }), /read\(file, options\)/);
    // what a plugin's read() returns is checked
    const sloppy = { ...plugin, name: "sloppy", load: async () => ({ read: async () => ({ columns: ["a"], types: ["money"], data: [[1]], notes: [] }) }) };
    await assert.rejects(readFile(text("x.demo", "x"), { plugins: [sloppy] }), (e) => e.code === "INVALID_ARGUMENT" && /plugin "sloppy".*a type is none/.test(e.message));
    // a module's default export is accepted
    const viaDefault = await loadReader({ ...plugin, name: "dflt", load: async () => ({ default: { read: async () => "ok" } }) });
    assert.equal(await viaDefault.read(), "ok");
});

test("encode: columnar input gives the same pivot as row objects (real data)", async () => {
    const t = await readFile(fileOf("kerg2-btw25.csv"));
    const rows = Array.from({ length: t.rowCount }, (_, r) => Object.fromEntries(t.columns.map((c, k) => [c, t.data[k][r]])));
    const view = { version: 1, rows: ["Gebietsname"], columns: ["Stimme"], values: [{ field: "Anzahl", agg: "sum" }, { field: "Prozent", agg: "average" }], filters: [] };
    const byColumns = encode(t);
    const byRows = encode(rows, { types: Object.fromEntries(t.columns.map((c, k) => [c, t.types[k]])) });
    assert.deepEqual(byColumns.schema, byRows.schema);
    assert.deepEqual(toGrid(computePivot(byColumns, view)), toGrid(computePivot(byRows, view)));
    // a date field grouped by month, from ISO text in both
    const dated = { version: 1, rows: ["Wahltag"], values: [{ field: "Anzahl", agg: "sum" }] };
    assert.deepEqual(toGrid(computePivot(byColumns, dated)), toGrid(computePivot(byRows, dated)));
});

test("encode: columnar input is checked, typed and selected like rows", () => {
    const input = { columns: ["Team", "Hours", "team"], types: ["string", null, "string"], data: [["A", "B"], new Float64Array([1, NaN]), ["x", "y"]] };
    const data = encode(input);
    assert.equal(data.length, 2);
    assert.deepEqual(data.columns.map((c) => c.name), ["Team", "Hours"]);
    assert.equal(data.column("Hours").type, "number");
    assert.equal(data.column("Hours").codes[1], -1);
    assert.match(data.issues[0].message, /the later column is left out/);
    // options.types wins over the input's types; options.columns selects
    assert.equal(encode(input, { types: { Team: "number" } }).column("Team").type, "number");
    assert.deepEqual(encode(input, { columns: ["hours"] }).columns.map((c) => c.name), ["Hours"]);
    const bad = (value, pattern) => assert.throws(() => encode(value), (e) => e.code === "INVALID_ARGUMENT" && pattern.test(e.message));
    bad({ columns: ["a", "b"], data: [[1]] }, /2 column names but 1 arrays/);
    bad({ columns: ["a", "b"], data: [[1], [1, 2]] }, /same length/);
    bad({ columns: ["a"], data: ["x"] }, /data\[0\] must be an array/);
    bad({ columns: ["a"], types: ["money"], data: [[1]] }, /types\[0\]/);
    bad({ columns: [1], data: [[1]] }, /columns\[0\] must be a string/);
    assert.throws(() => encode({ columns: ["a"], data: [[1, 2, 3]] }, { limits: { rows: 2 } }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows");
    assert.equal(encode({ columns: [], data: [] }).length, 0);
});

// findings of the security review of the readers

test("a wide row late in a long file is refused before a column of every row is allocated", async () => {
    const lines = "A\n" + "1\n".repeat(300_000) + Array.from({ length: 1_000 }, (_, i) => i).join(",") + "\n";
    const started = performance.now();
    await rejects(readFile(text("late.csv", lines)), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "importCells" && e.details.file === "late.csv");
    assert.ok(performance.now() - started < 5_000, `${performance.now() - started} ms`);
    // a row of more fields than limits.columns stops while it is split
    await rejects(readFile(text("commas.csv", "A\n" + ",".repeat(5_000) + "x\n")), (e) => e.details.limit === "columns");
});

test("invisible format characters and lone surrogates are removed; joiners stay", async () => {
    const t = await readFile(text("z.csv", "Name\nab\u{200B}c\u{2060}d\u{FEFF}e\u{AD}f\u{E0041}g\n\u{1F469}\u{200D}\u{1F4BB}\n"));
    assert.deepEqual(t.data[0], ["abcdefg", "\u{1F469}\u{200D}\u{1F4BB}"]);
    assert.equal(t.notes.find((n) => n.code === "CHARACTERS_REMOVED").params.count, 1);
});

test("a JSON key in a note is cleaned and cut", async () => {
    const key = `rows\u{202E}${"x".repeat(1_000)}`;
    const t = await readFile(text("k.json", JSON.stringify({ [key]: [{ a: 1 }] })));
    const p = t.notes.find((n) => n.code === "JSON_PROPERTY").params.property;
    assert.ok(!p.includes("\u{202E}"));
    assert.equal(p.length, 256);
});
