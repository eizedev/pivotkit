import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computePivot, encode } from "../src/index.js";
import { decodeViewLink } from "../src/link.js";
import { DATA_SETS, LINK_CASES, NOW, V1_CASES } from "./v1-corpus.js";

const golden = JSON.parse(readFileSync(new URL("./v1-golden.json", import.meta.url), "utf8"));
const encoded = Object.fromEntries(Object.entries(DATA_SETS).map(([name, rows]) => [name, encode(rows)]));

test("the golden file covers every case of the corpus", () => {
    assert.equal(golden.now, NOW);
    assert.deepEqual(Object.keys(golden.rows).sort(), V1_CASES.map((c) => c.name).sort());
    assert.deepEqual(Object.keys(golden.links).sort(), LINK_CASES.map((c) => c.name).sort());
});

for (const c of V1_CASES) {
    test(`v1 view keeps its rows: ${c.name}`, () => {
        const result = computePivot(encoded[c.data], c.view, { now: NOW });
        assert.deepEqual(result.issues, []);
        assert.deepEqual(Array.from(result.rows).sort((a, b) => a - b), golden.rows[c.name]);
    });
}

for (const c of LINK_CASES) {
    test(`v1 link decodes: ${c.name}`, () => {
        assert.deepEqual(decodeViewLink(golden.links[c.name]), { view: c.envelope, issues: [] });
    });
}
