import { test } from "node:test";
import assert from "node:assert/strict";
import { cellRows, computePivot, encode, findNode, toGrid } from "../src/index.js";
import { SALES, bodyRow } from "./fixtures.js";

const data = encode(SALES);
const r = computePivot(data, {
    rows: ["Region"],
    cols: ["Product"],
    values: [{ field: "Units", agg: "sum" }],
    filters: [{ field: "Rep", type: "exclude", items: ["Bob"] }]
});

test("the source rows behind a cell, a subtotal and the grand total", () => {
    assert.deepEqual([...cellRows(r, { row: ["North"], col: ["A"] })], [0]);
    assert.deepEqual([...cellRows(r, { row: ["South"], col: [] })], [3, 4, 5]);
    assert.deepEqual([...cellRows(r, { col: ["B"] })], [2, 4, 5]);
    // Bob's row (1) is filtered out
    assert.deepEqual([...cellRows(r)], [0, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual([...cellRows(r, { row: [null], col: ["A"] })], [7]);
});

test("nodes work as well as paths; unknown paths give no rows", () => {
    assert.deepEqual([...cellRows(r, { row: findNode(r, "rows", ["West"]), col: r.colRoot })], [6]);
    assert.equal(cellRows(r, { row: ["Nowhere"] }).length, 0);
    assert.equal(cellRows(r, { row: ["West"], col: ["B"] }).length, 0);
});

test("a value cell says whether rows are behind it, as cellRows counts them", () => {
    const grid = toGrid(r);
    // West has no product B: a blank cell with nothing to drill into
    const west = bodyRow(grid, "West");
    const b = grid.dataColumns.findIndex((c) => c.colPath[0] === "B") + grid.rowHeaderColumns;
    assert.equal(west[b].text, "");
    assert.equal(west[b].hasRows, false);
    for (const row of grid.rows.slice(grid.headerRows)) {
        for (const cell of row) {
            if (cell && cell.kind === "value") {
                assert.equal(cell.hasRows, cellRows(r, { row: cell.rowPath, col: cell.colPath }).length > 0, JSON.stringify([cell.rowPath, cell.colPath]));
            }
        }
    }
    // a row whose value is blank is still a row behind the cell
    const blank = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg: "average" }], filters: [{ field: "Units", type: "include", items: [null] }] });
    const south = bodyRow(toGrid(blank), "South");
    assert.equal(south[1].value, null);
    assert.equal(south[1].hasRows, true);
    // no rows at all: the grand total shows 0 but has nothing behind it
    const empty = toGrid(computePivot(encode([]), { values: [{ agg: "count" }] }));
    assert.equal(empty.rows[empty.headerRows][1].hasRows, false);
});

test("drill-down rows add up to the cell value", () => {
    for (const region of r.rowRoot.children) {
        for (const product of r.colRoot.children) {
            const rows = cellRows(r, { row: region, col: product });
            const sum = [...rows].reduce((s, i) => s + (SALES[i].Units ?? 0), 0);
            const v = r.value(region, product, 0);
            assert.equal(v ?? 0, sum, `${region.key}/${product.key}`);
        }
    }
});
