import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MATCH_DEFAULTS, foldText } from "../src/index.js";

const index = fileURLToPath(new URL("../src/index.js", import.meta.url));

test("foldText folds case and collapses whitespace by default, a no-break space too (#159)", () => {
    assert.deepEqual(MATCH_DEFAULTS, { case: "insensitive", whitespace: "collapse" });
    assert.equal(foldText("  ACTIVE\u00A0DIRECTORY\t Sync "), "active directory sync");
    assert.equal(foldText("a\u202Fb\u3000c\r\nd"), "a b c d");
    // a zero-width space is no whitespace
    assert.equal(foldText("a\u200Bb"), "a\u200Bb");
});

test("foldText keeps what the match says: case, whitespace", () => {
    assert.equal(foldText(" A  B ", { case: "sensitive", whitespace: "exact" }), " A  B ");
    assert.equal(foldText(" A  B ", { case: "sensitive" }), "A B");
    assert.equal(foldText(" A  B ", { whitespace: "exact" }), " a  b ");
    assert.equal(foldText(12), "12");
});

test("foldText does not depend on the machine's locale: I folds to i under a Turkish locale too", () => {
    // Turkish lowercases I to a dotless ı; the filters fold the same everywhere. The child process runs
    // with a Turkish locale; a runtime whose toLocaleLowerCase() follows it would catch a fold by locale
    // (Node on macOS keeps "i" there either way).
    const script = `const { foldText } = await import(${JSON.stringify(index)}); console.log(foldText("DIRECTORY I"));`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8" }, encoding: "utf8" });
    assert.equal(out.trim(), "directory i");
    assert.equal(foldText("DIRECTORY I"), "directory i");
});
