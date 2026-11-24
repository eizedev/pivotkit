import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, normalize } from "../src/index.js";
import { HINT_LIMITS, closest } from "../src/hints.js";

test("closest: the name that folds to the same text, else the nearest within a third of its length", () => {
    assert.equal(closest("region", ["Product", "Region"]), "Region");
    assert.equal(closest("Regoin", ["Product", "Region"]), "Region");
    assert.equal(closest("ACTIVE DIRECTORY", ["Active\u00A0Directory"]), "Active\u00A0Directory");
    assert.equal(closest("Planet", ["Product", "Region"]), null);
    // a short name allows one edit only
    assert.equal(closest("ab", ["xy"]), null);
    assert.equal(closest("ab", ["ax"]), "ax");
    assert.equal(closest("", ["a"]), null);
    assert.equal(closest(7, ["7"]), null);
});

test("closest is bounded: candidates and lengths are capped", () => {
    const many = Array.from({ length: HINT_LIMITS.candidates + 10 }, (_, i) => `field${i}`);
    many.push("Region");
    assert.equal(closest("Region", many), null);
    assert.equal(closest("x".repeat(HINT_LIMITS.length + 1), ["x".repeat(HINT_LIMITS.length + 1)]), null);
    assert.equal(closest("Region", ["x".repeat(10_000), "Regoin"]), "Regoin");
});

test("closest: a swap of two neighbours is one edit; the first of two equally close wins; the distance stops at three", () => {
    // five letters allow one edit: as two replacements "lable" would be too far from "label"
    assert.equal(closest("lable", ["label"]), "label");
    assert.equal(closest("lable", ["lbael"]), null);
    assert.equal(closest("Region", ["Regiox", "Rxgion"]), "Regiox");
    assert.equal(closest("Region", ["Rxgion", "Regiox"]), "Rxgion");
    // 18 letters allow six edits by length, but never more than HINT_LIMITS.distance
    assert.equal(HINT_LIMITS.distance, 3);
    assert.equal(closest("abcdefghijklmnopqr", ["abcdefghijklmnxxxx"]), null);
    assert.equal(closest("abcdefghijklmnopqr", ["abcdefghijklmnoxxx"]), "abcdefghijklmnoxxx");
    // a candidate that is no text is skipped
    assert.equal(closest("Region", [null, 7, "Region"]), "Region");
});

test("an aggregator named as other tools name it is not accepted, but hinted: avg, mean, cnt", () => {
    const data = encode([{ R: "a", U: 1 }]);
    for (const [given, hint] of [["avg", "average"], ["Mean", "average"], ["cnt", "count"]]) {
        const { issues, view } = normalize({ rows: ["R"], values: [{ field: "U", agg: given }] }, data);
        const issue = issues.find((i) => i.code === "unknownAggregator");
        assert.equal(issue?.params.suggestion, hint, given);
        assert.equal(view.values.length, 0, given);
    }
});
