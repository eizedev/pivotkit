// The table's window of rows (virtual.js): the rows in view, and the row labels of merged levels
// drawn and measured from every row, not only the rows on screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toGrid } from "pivotkit-core";
import { longestLabels, rowLabelOf, sliceRows, windowOf } from "../src/virtual.js";

test("virtual window: rows in view plus overscan, spacers for the rest", () => {
    assert.deepEqual(windowOf({ count: 1000, scrollTop: 0, viewport: 340, rowHeight: 34, overscan: 5 }), { start: 0, end: 15, padTop: 0, padBottom: 985 * 34 });
    const w = windowOf({ count: 1000, scrollTop: 3400, viewport: 340, rowHeight: 34, overscan: 5 });
    assert.deepEqual([w.start, w.end, w.padTop], [95, 115, 95 * 34]);
    assert.equal(windowOf({ count: 10, scrollTop: 99999, viewport: 340, rowHeight: 34 }).end, 10);
});

test("a merged row label that starts above the window is drawn in its first row, cut to the window", () => {
    const rows = [];
    for (const g of ["A", "B"]) for (let i = 0; i < 5; i++) rows.push({ G: g, I: `${g}${i}`, V: i });
    const grid = toGrid(computePivot(encode(rows), { rows: ["G", "I"], values: [{ field: "V", agg: "sum" }], totals: { rowSubtotals: false, grandTotalRow: false } }));
    const slice = sliceRows(grid, 2, 4);
    const first = slice[0].cells;
    assert.equal(first[0].cell.text, "A");
    assert.equal(first[0].rowSpan, 2);
    assert.deepEqual(first.map((c) => c.col), [0, 1, 2]);
    assert.equal(slice[1].cells[0].cell.text, "A3", "the second row has no label of its own in column 0");
    const whole = sliceRows(grid, 0, 10);
    assert.equal(whole[0].cells[0].rowSpan, 5);
});

test("the whole row label of a body row: merged levels read from above, a sideways span once", () => {
    const rows = [];
    for (const g of ["A", "B"]) for (let i = 0; i < 3; i++) rows.push({ G: g, I: `${g}${i}`, V: i });
    const grid = toGrid(computePivot(encode(rows), { rows: ["G", "I"], values: [{ field: "V", agg: "sum" }] }));
    const label = (r) => rowLabelOf(grid, r);
    const body = grid.rows.slice(grid.headerRows).map((_, r) => label(r));
    // A0 A1 A2, the subtotal of A, B0 ..., the grand total spanning both columns
    assert.equal(body[0], "A / A0");
    assert.equal(body[2], "A / A2");
    assert.ok(body.includes("B / B1"));
    assert.equal(body.at(-1), "Grand Total");
});

test("the longest row labels of a column by characters, with their toggles, from every row (not the rows on screen)", () => {
    const rows = [];
    for (const g of ["Alpha", "B"]) for (let i = 0; i < 400; i++) rows.push({ G: g, I: i === 377 ? `host-${g}-with-a-much-longer-name-${i}` : `h${i}`, V: i });
    const grid = toGrid(computePivot(encode(rows), { rows: ["G", "I"], values: [{ field: "V", agg: "sum" }] }));
    const inner = longestLabels(grid, 1, 3);
    assert.equal(inner.length, 3);
    assert.deepEqual(inner.slice(0, 2).map((l) => l.text).sort(), ["host-Alpha-with-a-much-longer-name-377", "host-B-with-a-much-longer-name-377"]);
    assert.ok(inner.every((l, i) => i === 0 || l.text.length <= inner[i - 1].text.length), "longest first");
    assert.equal(inner[0].toggle, false);
    // the outer level has a toggle; its subtotals and the grand total span both columns: they widen
    // neither column alone and are left out
    const outer = longestLabels(grid, 0, 50);
    assert.deepEqual(outer.map((l) => l.text), ["Alpha", "B"]);
    assert.ok(outer.every((l) => l.toggle && !l.total));
    assert.deepEqual(longestLabels(grid, 0, 0), []);
    // with one row field the grand total is a label of the column, drawn bold: marked as a total
    const one = toGrid(computePivot(encode(rows), { rows: ["G"], values: [{ field: "V", agg: "sum" }] }));
    assert.deepEqual(longestLabels(one, 0, 50).map((l) => [l.text, l.total]), [["Grand Total", true], ["Alpha", false], ["B", false]]);
});
