// What the server keeps in memory of a hidden column (docs/privacy.md, Memory): an HTTP source
// answering CSV, one answering JSON and a code source, each called by a signed-in person (whose
// load is kept) and by a caller without an identity (nothing kept), with hidden text and number
// columns of unique values (hidden by the default level and by a field's own rule), measured after a
// GC in the kept loads, in the data sets the worker keeps, and in heap snapshots of the main thread
// and the worker. A snapshot holds only what is still reachable, so this tells what pivotkit keeps
// from garbage that waits to be reused. test/memory/probe.mjs does the work in a process of its own
// (--expose-gc) and says how it looks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createComputer } from "../src/compute.js";
import { KEPT_JOB } from "../src/data.js";

const PROBE = fileURLToPath(new URL("./memory/probe.mjs", import.meta.url));

/** The probe's backend needs a certificate from openssl, as the other tests of HTTP sources do. */
const noOpenssl = spawnSync("openssl", ["version"]).error ? "openssl is not installed: the probe's https backend needs a certificate made with it" : false;

test("a hidden column is kept nowhere: not in the kept loads, not in the worker's data sets, not among what the main thread or the worker still reach", { skip: noOpenssl }, () => {
    const run = spawnSync(process.execPath, ["--expose-gc", PROBE], { encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr);
    const { rows, sources, hits, answerBytes, kept, worker, main, workers, control } = JSON.parse(run.stdout.trim().split("\n").at(-1) ?? "");
    const none = { hiddenTexts: 0, hiddenNumbers: 0 };
    const hiddenOf = (look) => ({ hiddenTexts: look.hiddenTexts, hiddenNumbers: look.hiddenNumbers });

    // the snapshot scan finds what is kept on purpose (markers short, deep in a long text, put together
    // from parts and near the start of a long flat text, a boxed number, a buffer of an answer's size
    // by its size): its zeros below mean something for texts and boxed numbers. A snapshot shows no
    // number held unboxed (a double array, a small integer) and no buffer's bytes: those are checked
    // in the kept loads and the worker's data sets only, so a number kept unboxed elsewhere is not seen
    assert.deepEqual([control.texts, control.number], [4, true], JSON.stringify(control));
    assert.ok(control.largestBuffer >= answerBytes, JSON.stringify(control));

    for (const { id, person } of sources) {
        // a person's later calls come from the kept load; a caller without an identity loads each time
        assert.equal(hits[id], person ? 1 : 3, `${id}: ${JSON.stringify(hits)}`);
        if (person) {
            // the kept load: its texts, numbers and packed bytes; every shown value is there
            assert.deepEqual(kept[id].columns, ["order", "region", "amount", "name", "shownint"], id);
            assert.deepEqual(kept[id].look, { ...none, shownTexts: rows, shownNumbers: rows }, `${id}: ${JSON.stringify(kept[id])}`);
        }
        // the worker keeps a person's data set (every shown value there), nothing of the others'
        assert.deepEqual(worker[id], { ...none, shownTexts: person ? rows : 0, shownNumbers: person ? rows : 0 }, `${id}: ${JSON.stringify(worker[id])}`);
        // nothing hidden among the strings and boxed numbers either thread still reaches
        assert.deepEqual(hiddenOf(main.sources[id]), none, `main thread, ${id}`);
        assert.equal(workers.length, 1);
        assert.deepEqual(hiddenOf(workers[0].sources[id]), none, `worker, ${id}`);
    }
    // no answer's bytes (most of them hidden values) stay reachable
    for (const heap of [main, workers[0]]) {
        assert.ok(heap.largestBuffer < answerBytes / 2, `a buffer of ${heap.largestBuffer} bytes is reachable; the smallest answer had ${answerBytes}`);
    }
});

test("the look into the workers is only there for a computer made for it: a normal one has neither hook, and its worker refuses the kept job", async () => {
    const computer = createComputer({ workers: 1 });
    try {
        assert.equal(/** @type {any} */ (computer).keptDataSets, undefined);
        assert.equal(/** @type {any} */ (computer).heapSnapshots, undefined);
        await assert.rejects(computer.run(KEPT_JOB, null, /** @type {any} */ ({})), (e) => /** @type {any} */ (e).code === "INTERNAL");
    } finally {
        await computer.close();
    }
});
