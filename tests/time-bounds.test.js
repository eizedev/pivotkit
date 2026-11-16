// Tests bound how long work takes by CPU time (tests/cpu-time.js), not by wall time (#436). Wall time
// grows when other suites share the machine, so such a bound fails while the code works. A bound on
// event latency (a timer, the network, a child process) stays on wall time: CPU time misses waits.
// So do a timestamp the code wrote, a polling deadline and a ratio of two measurements made alike.
// Such a line ends in a comment with the marker and the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { root, sourceFiles } from "./source-files.js";

/** The marker, at the start of a line's trailing comment. */
const MARKER = "// wall time:";

/** A reading of the wall clock. */
const CLOCK = /\b(Date\.now\(\)|performance\.now\(\)|process\.hrtime\b|new Date\(\)\.getTime\(\))/;

/** A comparison or an assert (an arrow is no comparison). */
const COMPARES = /(^|[^=<>!])(<=?|>=?)(?!=)|\bassert\b/;

/** A line with its strings and template texts blanked out, at the same length. */
const blanked = (line) => line.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (text) => " ".repeat(text.length));

/**
 * The lines of a source that compare a wall-clock reading without the marker, as "line: text": a
 * reading and a comparison on one line, or a variable assigned a difference of readings that a later
 * line of the same test compares.
 * @param {string} source
 */
function unmarkedBounds(source) {
    const found = [];
    /** @type {Set<string>} */
    let held = new Set();
    source.split("\n").forEach((line, i) => {
        // a variable belongs to its test
        if (/^(test|describe)\(|^\}\);/.test(line)) held = new Set();
        const plain = blanked(line);
        const at = plain.indexOf("//");
        const comment = at === -1 ? "" : line.slice(at);
        const code = (at === -1 ? plain : plain.slice(0, at)).replace(/=>/g, "  ");
        const assigned = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/.exec(code);
        if (assigned && CLOCK.test(assigned[2]) && /\s-\s/.test(assigned[2])) {
            held.add(assigned[1]);
            return;
        }
        const reads = CLOCK.test(code) || [...held].some((name) => new RegExp(`(^|[^\\w$])${name.replace(/\$/g, "\\$")}([^\\w$]|$)`).test(code));
        const marked = comment.startsWith(`${MARKER} `) && comment.length > MARKER.length + 1;
        if (reads && COMPARES.test(code) && !marked) found.push(`${i + 1}: ${line.trim()}`);
    });
    return found;
}

test("the check finds a wall-clock bound, also through a variable, and passes a marked one and a CPU-time one", () => {
    const bad = [
        "    assert.ok(performance.now() - t0 < 200);",
        "    assert.ok(Date.now() - started < 1000, `${Date.now() - started} ms`);",
        "    if (process.hrtime.bigint() - begin > limit) throw new Error();",
        "    assert.ok(new Date().getTime() - t0 <= 50);",
        "    const took = Date.now() - started;\n    assert.ok(took < 8000);",
        `    assert.ok(Date.now() - started < 10_000, "${MARKER} in a string is no marker");`
    ];
    for (const code of bad) assert.equal(unmarkedBounds(code).length, 1, code);
    const good = [
        `    assert.ok(Date.now() - started < 10_000); ${MARKER} event latency (a child process)`,
        "    assert.ok(cpu() < 1000);",
        "    const ms = performance.now() - started;",
        "    assert.ok(ticks > 0, `${ticks} ticks in ${Date.now() - started} ms`);",
        "    const took = Date.now() - started;\n});\ntest(\"next\", () => {\n    assert.ok(took < 8000);"
    ];
    for (const code of good) assert.deepEqual(unmarkedBounds(code), [], code);
});

test("every wall-clock bound in a test file is marked with its reason; work is bounded by CPU time", () => {
    const found = [];
    for (const file of sourceFiles()) {
        const name = relative(root, file).split("\\").join("/");
        if (!/(^|\/)(test|tests)\//.test(name) || name === "tests/time-bounds.test.js") continue;
        for (const line of unmarkedBounds(readFileSync(file, "utf8"))) found.push(`${name}:${line}`);
    }
    assert.deepEqual(found, [], `bound work with cpuClock() of tests/cpu-time.js, or end the line with "${MARKER} <why>"`);
});
