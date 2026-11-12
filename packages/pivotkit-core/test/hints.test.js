import { test } from "node:test";
import assert from "node:assert/strict";
import { HINT_LIMITS, closest } from "../src/hints.js";

test("closest: the name that folds to the same text, else the nearest within a third of its length", () => {
    assert.equal(closest("region", ["Product", "Region"]), "Region");
    assert.equal(closest("Regoin", ["Product", "Region"]), "Region");
    assert.equal(closest("ACTIVE DIRECTORY", ["Active Directory"]), "Active Directory");
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
