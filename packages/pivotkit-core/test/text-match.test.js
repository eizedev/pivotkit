import { test } from "node:test";
import assert from "node:assert/strict";
import { MATCH_DEFAULTS, foldText } from "../src/index.js";

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

test("foldText does not depend on the runtime's locale: I folds to i", () => {
    // toLocaleLowerCase("tr") gives a dotless ı; the filters fold the same everywhere
    assert.equal(foldText("DIRECTORY"), "directory");
    assert.notEqual("I".toLocaleLowerCase("tr"), foldText("I"));
});
