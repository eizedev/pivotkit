// assertStates (tests/docs-facts.js): where a fact may stand in Markdown, and what does not count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertStates } from "./docs-facts.js";

const states = (text, ...parts) => {
    try {
        assertStates(text, "page", ...parts);
        return true;
    } catch {
        return false;
    }
};

test("assertStates: a fact in one sentence, a wrapped list item or a table row, in any order", () => {
    const page = ["# Weather", "", "- Read it: Singapore has the most rain days (286 in 2025), Cairo", "  the fewest (5). Half of Cape Town's 75 fall in its", "  winter (38).", "", "| Data set | Rows |", "| --- | --- |", "| Weather | 15,344 days |", "", "1. First, e.g. a city, then a month. Second sentence."].join("\n");
    assert.equal(states(page, "Cairo", "the fewest (5)", "Singapore"), true, "a list item over two lines is one text");
    assert.equal(states(page, "Cape Town", "75", "winter", "(38)"), true);
    assert.equal(states(page, "Weather", "15,344 days"), true, "a table row is one sentence");
    assert.equal(states(page, "First", "e.g. a city", "a month"), true, "e.g. ends no sentence");
    assert.equal(states(page, "Second sentence"), true, "a numbered item's number ends no sentence");
});

test("assertStates: a part in another sentence, a number inside a longer one, or a wrong number does not count", () => {
    const page = "Singapore has the most rain days (286 in 2025). Cairo has 1,075 of them. Dubai has 75.5 hours.";
    assert.equal(states(page, "Singapore", "1,075"), false, "the parts of a fact stand in one sentence");
    assert.equal(states(page, "Cairo", "75"), false, "75 is not in 1,075");
    assert.equal(states(page, "Dubai", "75"), false, "75 is not in 75.5");
    assert.equal(states(page, "Singapore", "(287 in 2025)"), false);
    assert.equal(states(page, "Cairo", "1,075"), true);
    assert.throws(() => assertStates(page, "docs/x.md", "Oslo", "12"), /docs\/x\.md should state in one sentence: "Oslo", "12"/);
});
