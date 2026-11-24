// Files the report writes (files.js): a safe file name, and a data: URL as a Blob.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dataUrlToBlob, safeFileName } from "../src/files.js";
import { cpuClock } from "../../../tests/cpu-time.js";

test("file names: no path, no reserved characters or names", () => {
    assert.equal(safeFileName("report"), "report");
    assert.equal(safeFileName(" .report. . "), "report");
    // trailing dots and spaces are trimmed in linear time (a regex for them backtracked quadratically)
    const cpu = cpuClock();
    assert.equal(safeFileName(`a${". ".repeat(200_000)}x`), `a${". ".repeat(200_000)}x`.slice(0, 120).replace(/[\s.]+$/, ""));
    assert.equal(safeFileName(`a${". ".repeat(200_000)}`), "a");
    assert.ok(cpu() < 200, `${Math.round(cpu())} ms of CPU`);
    assert.equal(safeFileName("../../etc/passwd"), "etc-passwd");
    assert.equal(safeFileName("C:\\\\temp\\\\x"), "C-temp-x");
    assert.equal(safeFileName('a<b>c:"d|e?*'), "a-b-c-d-e-");
    assert.equal(safeFileName("CON"), "pivot");
    // Windows reserves a device name before any extension: "aux.x" + ".csv" is AUX as well
    assert.equal(safeFileName("aux.x"), "pivot");
    assert.equal(safeFileName("Nul.tar"), "pivot");
    assert.equal(safeFileName("COM¹"), "pivot");
    assert.equal(safeFileName("console"), "console");
    assert.equal(safeFileName("com1-sales"), "com1-sales");
    assert.equal(safeFileName(""), "pivot");
    assert.equal(safeFileName(42), "pivot");
    assert.equal(safeFileName("x".repeat(300)).length, 120);
});

test("a data: URL becomes a Blob without fetch()", async () => {
    const png = dataUrlToBlob("data:image/png;base64,iVBORw0KGgo=");
    assert.equal(png.type, "image/png");
    assert.deepEqual([...new Uint8Array(await png.arrayBuffer())].slice(1, 4).map((c) => String.fromCharCode(c)).join(""), "PNG");
    assert.equal(await dataUrlToBlob("data:text/plain,a%20b").text(), "a b");
    assert.throws(() => dataUrlToBlob("https://example.com/x.png"), TypeError);
});
