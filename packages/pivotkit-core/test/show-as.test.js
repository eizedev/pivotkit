import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, findNode, toGrid, validate } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
// Sum of Units by Region x Product:
//            A   B   total
//   North    8   2   10
//   South    7   1    8
//   West     4        4
//   (blank)  6        6
//   total   25   3   28
const pivot = (showAs, rows = ["Region"]) => {
    const r = computePivot(data, { rows, cols: ["Product"], values: [{ field: "Units", agg: "sum", showAs }] });
    const at = (rowPath, colPath = []) => r.display(findNode(r, "rows", rowPath), findNode(r, "cols", colPath), 0);
    return { r, at };
};
const close = (a, b) => assert.ok(a !== null && Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test("percent of grand total, row total and column total", () => {
    close(pivot("percentOfGrandTotal").at(["North"], ["A"]), 8 / 28);
    close(pivot("percentOfGrandTotal").at([], []), 1);
    close(pivot("percentOfRowTotal").at(["North"], ["A"]), 8 / 10);
    close(pivot("percentOfRowTotal").at([], ["B"]), 3 / 28);
    close(pivot("percentOfColumnTotal").at(["North"], ["A"]), 8 / 25);
    close(pivot("percentOfColumnTotal").at(["South"], []), 8 / 28);
});

test("percent of parent row and parent column", () => {
    const p = pivot({ type: "percentOfParentRow" }, ["Region", "Product"]);
    close(p.at(["North", "A"]), 8 / 10);
    close(p.at(["North"]), 10 / 28);
    close(p.at([]), 1);
    close(pivot("percentOfParentColumn").at(["North"], ["A"]), 8 / 10);
});

test("difference and percent difference from the previous item", () => {
    const d = pivot("differenceFromPrevious");
    assert.equal(d.at(["North"]), null);
    assert.equal(d.at(["South"]), -2);
    assert.equal(d.at(["West"]), -4);
    assert.equal(d.at([null]), 2);
    assert.equal(d.at([]), null);
    close(pivot("percentDifferenceFromPrevious").at(["South"]), -0.2);
    // along the columns: B minus A in each row
    const c = pivot({ type: "differenceFromPrevious", axis: "cols" });
    assert.equal(c.at(["North"], ["A"]), null);
    assert.equal(c.at(["North"], ["B"]), -6);
});

test("running total and percent running total", () => {
    const run = pivot("runningTotal");
    assert.deepEqual([["North"], ["South"], ["West"], [null], []].map((p) => run.at(p)), [10, 18, 22, 28, 28]);
    close(pivot("percentRunningTotal").at(["South"]), 18 / 28);
});

test("rank: ties share a rank, blanks are not ranked", () => {
    const desc = pivot("rankDescending");
    assert.deepEqual([["North"], ["South"], ["West"], [null]].map((p) => desc.at(p)), [1, 2, 4, 3]);
    const asc = pivot("rankAscending");
    assert.deepEqual([["North"], ["South"], ["West"], [null]].map((p) => asc.at(p)), [4, 3, 1, 2]);
    // West has no B: no rank there
    assert.equal(pivot({ type: "rankDescending", axis: "cols" }).at(["West"], ["B"]), null);
    const d = encode([{ k: "a", v: 5 }, { k: "b", v: 5 }, { k: "c", v: 1 }]);
    const r = computePivot(d, { rows: ["k"], values: [{ field: "v", agg: "sum", showAs: "rankDescending" }] });
    assert.deepEqual(["a", "b", "c"].map((k) => r.display(findNode(r, "rows", [k]), r.colRoot, 0)), [1, 1, 3]);
});

test("the grid formats percent show-as as percent and keeps the raw aggregate apart", () => {
    const { r } = pivot("percentOfGrandTotal");
    const grid = toGrid(r, { locale: "en-US" });
    const north = grid.rows[grid.headerRows];
    assert.equal(north[0].text, "North");
    assert.equal(north[1].text, "28.6%");
    assert.equal(north[1].format, "percent");
    assert.equal(r.value(findNode(r, "rows", ["North"]), findNode(r, "cols", ["A"]), 0), 8);
});

test("running totals need an aggregator that adds up", () => {
    for (const agg of ["average", "median", "min", "countUnique"]) {
        for (const type of ["runningTotal", "percentRunningTotal"]) {
            const { errors } = validate({ rows: ["Region"], values: [{ field: "Units", agg, showAs: type }] }, data);
            assert.deepEqual(errors.map((e) => e.path), ["values[0].showAs"], `${agg} ${type}`);
            const r = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg, showAs: type }] });
            // the value stays, shown as it is
            assert.equal(r.values[0].showAs, null);
        }
    }
    for (const agg of ["sum", "count"]) {
        assert.equal(validate({ rows: ["Region"], values: [{ field: "Units", agg, showAs: "runningTotal" }] }, data).valid, true, agg);
    }
    // difference from the previous item is meaningful for an average
    assert.equal(validate({ rows: ["Region"], values: [{ field: "Units", agg: "average", showAs: "differenceFromPrevious" }] }, data).valid, true);
});

test("a percent format of the view's choice is kept for percent show-as", () => {
    const r = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg: "sum", showAs: "percentOfGrandTotal", format: "percent:2" }] });
    const grid = toGrid(r);
    assert.equal(grid.rows[grid.headerRows][1].text, "35.71%");
});

test("a value shown as a calculation is named after it", () => {
    const name = (spec, labels) => toGrid(computePivot(data, { rows: ["Region"], values: [spec] }), labels ? { labels } : undefined).valueNames[0];
    assert.equal(name({ field: "Units", agg: "sum", showAs: "percentOfGrandTotal" }), "% of grand total of Units");
    assert.equal(name({ field: "Units", agg: "average", showAs: "rankDescending" }), "Rank (largest first) of Average of Units");
    assert.equal(name({ agg: "count", showAs: "runningTotal" }), "Running total of Count");
    assert.equal(name({ field: "Units", agg: "sum", showAs: "percentOfGrandTotal", label: "Share" }), "Share", "an own name wins");
    assert.equal(name({ field: "Units", agg: "sum", showAs: "percentOfRowTotal" }, { showAsName: "{showAs} von {value}", showAs: { percentOfRowTotal: "% der Zeilensumme" } }), "% der Zeilensumme von Units");
});
