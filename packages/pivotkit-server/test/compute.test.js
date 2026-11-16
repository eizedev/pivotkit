// The compute pool's own paths (src/compute.js), with a worker of the tests' own
// (fixtures/probe-worker.js): a run over the memory limit, a worker that dies while it starts, a read
// whose callers went away while it waited for a worker, and an input the structured clone cannot copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createComputer } from "../src/compute.js";
import { tempDir } from "./helpers.js";

const PROBE = new URL("./fixtures/probe-worker.js", import.meta.url);

/** The thread id of the worker that answers the next run. */
const threadOf = async (computer) => (await computer.run("echo", null, {})).outcome.threadId;

/** A regression fails within this, instead of waiting out a queueMs or timeMs of minutes. */
const FAST = { timeout: 20_000 };

/** What a run that fails threw; null when it did not fail. */
const failureOf = (promise) =>
    promise.then(
        () => null,
        (e) => e
    );

test("the pool: a run over compute.memoryMb is LIMIT_EXCEEDED and names the limit; its worker is replaced", FAST, async () => {
    const computer = createComputer({ workers: 1, memoryMb: 64, timeMs: 120_000 }, { worker: PROBE });
    try {
        const before = await threadOf(computer);
        const error = await failureOf(computer.run("allocate", null, {}));
        assert.equal(error?.code, "LIMIT_EXCEEDED", String(error));
        assert.equal(error.message, "the report needs more than the 64 MB of memory a run may use (compute.memoryMb)");
        assert.notEqual(await threadOf(computer), before, "a new worker answers");
        assert.equal(computer.size(), 1);
    } finally {
        await computer.close();
    }
});

test("the pool: a worker that dies while it starts fails the run that waits for it with INTERNAL, not after compute.timeMs; it is replaced", FAST, async () => {
    const marker = join(tempDir(), "failed-once");
    process.env.PIVOTKIT_TEST_FAIL_START = marker;
    // a run that waited for its time would end in TIMEOUT after 30 s, not INTERNAL
    const computer = createComputer({ workers: 1, timeMs: 30_000 }, { worker: PROBE });
    try {
        // run() takes the worker at once, before the worker has loaded its module
        const error = await failureOf(computer.run("echo", null, {}));
        assert.ok(existsSync(marker), "the worker died while it started");
        assert.equal(error?.code, "INTERNAL", String(error));
        assert.equal(error.message, "internal error");
        assert.equal(typeof (await threadOf(computer)), "number", "its replacement answers");
        assert.equal(computer.size(), 1);
    } finally {
        delete process.env.PIVOTKIT_TEST_FAIL_START;
        await computer.close();
    }
});

test("the pool: a read whose callers went away while it waited for a worker fails with their reason; the worker runs on", FAST, async () => {
    const computer = createComputer({ workers: 1, timeMs: 120_000, queueMs: 120_000 }, { worker: PROBE });
    try {
        const before = await threadOf(computer);
        const gate = new Int32Array(new SharedArrayBuffer(4));
        const held = computer.run("hold", { gate }, {});
        const controller = new AbortController();
        const queued = failureOf(computer.read({}, { bytes: new Uint8Array(0), format: "csv" }, null, null, controller.signal));
        const reason = new Error("every caller went away");
        // aborted while it waits for the slot the held run took (the slot, not the worker's progress,
        // makes it wait); then the gate lets the held run end, and the queued read gets the worker,
        // sees the abort and gives it back unused
        controller.abort(reason);
        Atomics.store(gate, 0, 1);
        Atomics.notify(gate, 0);
        assert.equal((await held).outcome.threadId, before);
        assert.equal(await queued, reason);
        assert.equal(await threadOf(computer), before, "the same worker: neither terminated nor replaced");
    } finally {
        await computer.close();
    }
});

test("the pool: an input the structured clone cannot copy is INVALID_INPUT, and its worker is free at once", FAST, async () => {
    // queueMs 0: a call that finds no free worker is BUSY at once
    const computer = createComputer({ workers: 1, timeMs: 120_000, queueMs: 0 }, { worker: PROBE });
    try {
        const before = await threadOf(computer);
        let deep = [];
        for (let i = 0; i < 100_000; i++) {
            deep = [deep];
        }
        const error = await failureOf(computer.run("echo", { deep }, {}));
        assert.equal(error?.code, "INVALID_INPUT", String(error));
        assert.equal(error.message, "the input is nested too deeply");
        assert.equal(await threadOf(computer), before, "the same worker, free without waiting");
    } finally {
        await computer.close();
    }
});
