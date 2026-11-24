import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, findNode } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
// Units: 3, 5, 2, 7, 1, (blank), 4, 6
const grand = (value, rows = []) => {
    const r = computePivot(data, { rows, values: [value] });
    return { r, total: r.value(r.rowRoot, r.colRoot, 0), at: (key) => r.value(findNode(r, "rows", [key]), r.colRoot, 0) };
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test("count counts non-blank values of a field, or rows without a field", () => {
    assert.equal(grand({ field: "Units", agg: "count" }).total, 7);
    assert.equal(grand({ agg: "count" }).total, 8);
    assert.equal(grand({ field: "Region", agg: "count" }).total, 7);
});

test("countUnique and listUnique ignore blanks and list in natural order", () => {
    assert.equal(grand({ field: "Rep", agg: "countUnique" }).total, 5);
    assert.equal(grand({ field: "Rep", agg: "listUnique" }).total, "Ann, Bob, Cid, Dee, Eve");
    assert.equal(grand({ field: "Rep", agg: "listUnique" }, ["Region"]).at("South"), "Cid, Dee");
    assert.equal(grand({ field: "Region", agg: "countUnique" }).total, 3);
});

test("sum, average, median, min, max", () => {
    assert.equal(grand({ field: "Units", agg: "sum" }).total, 28);
    assert.equal(grand({ field: "Units", agg: "average" }).total, 4);
    assert.equal(grand({ field: "Units", agg: "median" }).total, 4);
    assert.equal(grand({ field: "Units", agg: "median" }, ["Region"]).at("North"), 3);
    // even count: the mean of the two middle values (7 and 1)
    assert.equal(grand({ field: "Units", agg: "median" }, ["Region"]).at("South"), 4);
    assert.equal(grand({ field: "Units", agg: "min" }).total, 1);
    assert.equal(grand({ field: "Units", agg: "max" }).total, 7);
});

test("sample and population variance and standard deviation", () => {
    // deviations from the mean 4: 1 1 4 9 9 0 4 -> 28
    close(grand({ field: "Units", agg: "var" }).total, 28 / 6);
    close(grand({ field: "Units", agg: "varp" }).total, 4);
    close(grand({ field: "Units", agg: "stdev" }).total, Math.sqrt(28 / 6));
    close(grand({ field: "Units", agg: "stdevp" }).total, 2);
    // one value: no sample variance, population variance 0
    assert.equal(grand({ field: "Units", agg: "var" }, ["Region"]).at("West"), null);
    assert.equal(grand({ field: "Units", agg: "varp" }, ["Region"]).at("West"), 0);
});

test("first and last follow the natural order of the values (PivotTable.js)", () => {
    assert.equal(grand({ field: "Rep", agg: "first" }).total, "Ann");
    assert.equal(grand({ field: "Rep", agg: "last" }).total, "Eve");
    assert.equal(grand({ field: "Units", agg: "first" }).total, 1);
    assert.equal(grand({ field: "Units", agg: "last" }).total, 7);
});

test("cells with rows but no numbers: sum 0, the others blank", () => {
    const d = encode([{ k: "x", v: null }, { k: "x", v: 1 }]);
    const r = computePivot(d, { rows: ["k"], values: ["sum", "average", "min", "max", "median", "stdev"].map((agg) => ({ field: "v", agg })), filters: [{ field: "v", type: "include", items: [null] }] });
    const x = findNode(r, "rows", ["x"]);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((vi) => r.value(x, r.colRoot, vi)), [0, null, null, null, null, null]);
});

test("dates: min, max and median are dates; sum of dates is refused", () => {
    const r = computePivot(data, { values: [{ field: "Date", agg: "min" }, { field: "Date", agg: "max" }, { field: "Date", agg: "sum" }] });
    assert.equal(r.values.length, 2);
    assert.deepEqual(r.valueTypes, ["date", "date"]);
    assert.equal(r.value(r.rowRoot, r.colRoot, 0), Date.UTC(2025, 11, 31));
    assert.equal(r.value(r.rowRoot, r.colRoot, 1), Date.UTC(2026, 3, 30));
});

test("booleans sum as 1 and 0", () => {
    const d = encode([{ ok: true }, { ok: false }, { ok: true }, { ok: null }]);
    const r = computePivot(d, { values: [{ field: "ok", agg: "sum" }, { field: "ok", agg: "average" }] });
    assert.equal(r.value(r.rowRoot, r.colRoot, 0), 2);
    close(r.value(r.rowRoot, r.colRoot, 1), 2 / 3);
});

test("subtotal medians come from the rows, not from the medians below", () => {
    const d = encode([
        { g: "a", h: "x", v: 1 }, { g: "a", h: "x", v: 2 }, { g: "a", h: "x", v: 3 }, { g: "a", h: "y", v: 100 }
    ]);
    const r = computePivot(d, { rows: ["g", "h"], values: [{ field: "v", agg: "median" }] });
    // medians below are 2 and 100; the rows of "a" are 1 2 3 100
    assert.equal(r.value(findNode(r, "rows", ["a"]), r.colRoot, 0), 2.5);
});
