// The example reader plugin of the documentation (examples/reader-plugin, JSON Lines) works as the
// guide says: it passes the contract check, reads a real export, and its limits and errors are
// pivotkit-core's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile, readerFor, validatePlugin } from "pivotkit-core/import";
import jsonLinesReader from "../examples/reader-plugin/src/index.js";

// endoflife.date's Node.js cycles (MIT, see packages/pivotkit-core/test/import-fixtures/SOURCES.md), one object per line
const cycles = JSON.parse(readFileSync(new URL("../packages/pivotkit-core/test/import-fixtures/endoflife-nodejs.json", import.meta.url), "utf8"));
const jsonl = (objects) => new File([objects.map((o) => JSON.stringify(o)).join("\n") + "\n"], "nodejs.jsonl");

test("the example plugin passes the contract check and is chosen for .jsonl and .ndjson", () => {
    assert.equal(validatePlugin(jsonLinesReader).name, "jsonl");
    assert.equal(readerFor({ name: "log.ndjson" }, [jsonLinesReader]), jsonLinesReader);
    assert.equal(readerFor({ name: "x", type: "application/x-ndjson" }, [jsonLinesReader]), jsonLinesReader);
});

test("the example plugin reads a real export into a typed table", async () => {
    const t = await readFile(jsonl(cycles), { plugins: [jsonLinesReader] });
    assert.equal(t.rowCount, cycles.length);
    assert.deepEqual(t.columns.slice(0, 3), ["cycle", "releaseDate", "lts"]);
    assert.equal(t.types[t.columns.indexOf("releaseDate")], "date");
    assert.equal(t.types[t.columns.indexOf("extendedSupport")], "boolean");
    // "26" is a string in the JSON and stays text
    assert.equal(t.types[t.columns.indexOf("cycle")], "string");
});

test("the example plugin's errors and limits name the file", async () => {
    await assert.rejects(readFile(new File(['{"a":1}\n{"a":\n'], "bad.jsonl"), { plugins: [jsonLinesReader] }), (e) => e.code === "INVALID_FILE" && e.message === '"bad.jsonl": line 2 is no JSON.');
    await assert.rejects(readFile(jsonl(cycles), { plugins: [jsonLinesReader], limits: { rows: 5 } }), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "rows" && e.details.file === "nodejs.jsonl");
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(readFile(jsonl(cycles), { plugins: [jsonLinesReader], signal: aborted.signal }), (e) => e.name === "AbortError");
});
