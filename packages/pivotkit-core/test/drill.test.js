import { test } from "node:test";
import assert from "node:assert/strict";
import { cellRows, computePivot, encode, findNode } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const r = computePivot(data, {
    rows: ["Region"],
    cols: ["Product"],
    values: [{ field: "Units", agg: "sum" }],
    filters: [{ field: "Rep", type: "exclude", items: ["Bob"] }]
});

test("the source rows behind a cell, a subtotal and the grand total", () => {
    assert.deepEqual([...cellRows(r, ["North"], ["A"])], [0]);
    assert.deepEqual([...cellRows(r, ["South"], [])], [3, 4, 5]);
    assert.deepEqual([...cellRows(r, [], ["B"])], [2, 4, 5]);
    // Bob's row (1) is filtered out
    assert.deepEqual([...cellRows(r)], [0, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual([...cellRows(r, [null], ["A"])], [7]);
});

test("nodes work as well as paths; unknown paths give no rows", () => {
    assert.deepEqual([...cellRows(r, findNode(r, "rows", ["West"]), r.colRoot)], [6]);
    assert.equal(cellRows(r, ["Nowhere"]).length, 0);
    assert.equal(cellRows(r, ["West"], ["B"]).length, 0);
});

test("drill-down rows add up to the cell value", () => {
    for (const region of r.rowRoot.children) {
        for (const product of r.colRoot.children) {
            const rows = cellRows(r, region, product);
            const sum = [...rows].reduce((s, i) => s + (SALES[i].Units ?? 0), 0);
            const v = r.value(region, product, 0);
            assert.equal(v ?? 0, sum, `${region.key}/${product.key}`);
        }
    }
});
