// Tests bound how long work takes by CPU time (tests/cpu-time.js), not by wall time (#436). Wall time
// grows when other suites share the machine, so such a bound fails while the code works. A bound on
// event latency (a timer, the network, a child process) stays on wall time: CPU time misses waits.
// Its line carries the marker, a wide margin and a comment that says why.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { root, sourceFiles } from "./source-files.js";

/** The marker of a bound that measures event latency on purpose. */
const MARKER = "// wall time: event latency";

/**
 * The lines of a source that bound a wall-clock duration without the marker, as "line: text".
 * @param {string} code
 */
function unmarkedBounds(code) {
    return code
        .split("\n")
        .map((line, i) => [i + 1, line])
        .filter(([, line]) => /\b(performance|Date)\.now\(\)\s*-\s*[A-Za-z_$][\w$]*\s*</.test(line) && !line.includes(MARKER))
        .map(([n, line]) => `${n}: ${line.trim()}`);
}

test("the check finds a wall-clock bound, and passes a marked one and a CPU-time one", () => {
    assert.equal(unmarkedBounds("    assert.ok(performance.now() - t0 < 200);").length, 1);
    assert.equal(unmarkedBounds("    assert.ok(Date.now() - started < 1000, `${Date.now() - started} ms`);").length, 1);
    assert.equal(unmarkedBounds(`    assert.ok(Date.now() - started < 10_000); ${MARKER} (a child process)`).length, 0);
    assert.equal(unmarkedBounds("    assert.ok(cpu() < 1000);").length, 0);
    assert.equal(unmarkedBounds("    const ms = performance.now() - started;").length, 0, "a measurement without a bound");
});

test("every wall-clock bound in a test file is marked as event latency; work is bounded by CPU time", () => {
    const found = [];
    for (const file of sourceFiles()) {
        const name = relative(root, file).split("\\").join("/");
        if (!/(^|\/)(test|tests)\//.test(name) || name === "tests/time-bounds.test.js") continue;
        for (const line of unmarkedBounds(readFileSync(file, "utf8"))) found.push(`${name}:${line}`);
    }
    assert.deepEqual(found, [], `bound work with cpuClock() of tests/cpu-time.js, or mark an event-latency bound with "${MARKER}" and say why`);
});
