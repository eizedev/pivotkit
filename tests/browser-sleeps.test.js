// A browser test waits for a condition (expect, expect.poll, animationsSettled, twoFrames), not for a
// fixed time. A fixed sleep checks that nothing happens for a while, or gives a person's pace to an
// input; it says which in a comment on its own line or the line above (tests/AGENTS.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { filesUnder, root } from "./source-files.js";

/** A fixed sleep of Playwright. */
const SLEEP = /\.waitForTimeout\(/;

/**
 * The lines of a source with a fixed sleep and no comment on the same line or the line above, as
 * "line: text".
 * @param {string} source
 */
function unexplainedSleeps(source) {
    const lines = source.split("\n");
    return lines.flatMap((line, i) => {
        if (!SLEEP.test(line)) return [];
        const explained = line.includes("//") || (i > 0 && lines[i - 1].trim().startsWith("//"));
        return explained ? [] : [`${i + 1}: ${line.trim()}`];
    });
}

test("the check finds a sleep without a comment and passes one with a comment beside or above", () => {
    assert.equal(unexplainedSleeps("    await page.mouse.up();\n    await page.waitForTimeout(100);").length, 1);
    assert.equal(unexplainedSleeps("    // the pointer rests on it\n\n    await page.waitForTimeout(400);").length, 1);
    assert.deepEqual(unexplainedSleeps("    // nothing opens, also a moment later\n    await page.waitForTimeout(400);"), []);
    assert.deepEqual(unexplainedSleeps("    await page.waitForTimeout(400); // nothing opens"), []);
});

test("every fixed sleep of the browser tests says in a comment why it is one", () => {
    const found = [];
    for (const file of filesUnder(join(root, "tests", "browser"), (name) => name.endsWith(".js"))) {
        for (const line of unexplainedSleeps(readFileSync(file, "utf8"))) found.push(`${relative(root, file).split("\\").join("/")}:${line}`);
    }
    assert.deepEqual(found, [], "wait for the condition instead (expect, expect.poll, animationsSettled), or say in a comment what the sleep checks");
});
