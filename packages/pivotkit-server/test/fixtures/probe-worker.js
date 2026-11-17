// A compute worker for the pool's own paths (test/compute.test.js). It answers every job with its
// thread id, so a test sees whether the pool kept or replaced it. On "allocate" it fills its heap
// until the memory limit ends it. On "hold" it answers once the main thread lets it go through the
// job's gate (a SharedArrayBuffer). It fails to start once when $PIVOTKIT_TEST_FAIL_START names a
// file that is not there yet: it makes the file, then throws while it loads.
import { existsSync, writeFileSync } from "node:fs";
import { parentPort, threadId } from "node:worker_threads";

const failOnce = process.env.PIVOTKIT_TEST_FAIL_START;
if (failOnce && !existsSync(failOnce)) {
    writeFileSync(failOnce, "");
    throw new Error("the worker cannot start");
}

parentPort?.on("message", async ({ id, op, input }) => {
    if (op === "allocate") {
        const kept = [];
        for (;;) {
            kept.push(new Array(1_000_000).fill(kept.length));
        }
    }
    if (op === "hold") {
        await Atomics.waitAsync(input.gate, 0, 0).value;
    }
    parentPort?.postMessage({ id, outcome: { threadId }, hidden: 0 });
});
parentPort?.postMessage({ ready: true });
