// What the server keeps in memory of a hidden column (docs/privacy.md, Memory): an HTTP source's CSV
// answer and a JSON answer, each with two hidden columns of unique markers, served to a signed-in
// caller, then measured in the kept loads and in heap snapshots of the main thread and the compute
// worker after a GC. A snapshot holds only what is still reachable, so this tells what pivotkit keeps
// from garbage that waits to be reused. test/memory/probe.mjs does the work in a process of its own
// (--expose-gc) and says how it finds markers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROBE = fileURLToPath(new URL("./memory/probe.mjs", import.meta.url));

test("a hidden column is kept nowhere: not in the kept loads, not among the main thread's or the worker's reachable strings, and no answer's bytes are kept", () => {
    const run = spawnSync(process.execPath, ["--expose-gc", PROBE], { encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr);
    const { rows, hits, bodyBytes, cached, main, workers, control } = JSON.parse(run.stdout.trim().split("\n").at(-1) ?? "");

    // the scan finds what is kept on purpose (a marker, one deep in a long text, one put together,
    // one near the start of a long flat text, a buffer of an answer's size): its zeros below mean something
    assert.equal(control.controls, 4, JSON.stringify(control));
    assert.ok(control.largestBuffer >= bodyBytes, JSON.stringify(control));

    assert.deepEqual(hits, { csv: 1, json: 1 }, "the later calls are answered from the kept loads");
    // the kept loads: their texts and the bytes of their packed columns; the shown column is all there
    for (const [format, load] of Object.entries(cached)) {
        assert.deepEqual(load.columns, ["order", "region", "amount", "name"], format);
        assert.deepEqual([load.hidden, load.shown], [0, rows], `${format}: ${JSON.stringify(load)}`);
    }
    // the main thread's reachable strings
    assert.equal(main.hidden, 0, JSON.stringify(main));
    // the worker keeps both data sets (the shown markers are all there), never a hidden value
    assert.equal(workers.length, 1);
    assert.deepEqual([workers[0].hidden, workers[0].shown], [0, 2 * rows], JSON.stringify(workers[0]));
    // the answers' bytes (most of them hidden values) are kept by neither
    for (const heap of [main, workers[0]]) {
        assert.ok(heap.largestBuffer < bodyBytes / 2, `a buffer of ${heap.largestBuffer} bytes is reachable; the smaller answer had ${bodyBytes}`);
    }
});
