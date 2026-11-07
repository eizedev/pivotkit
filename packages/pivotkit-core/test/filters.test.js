import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, findNode, validate } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const sumUnits = { field: "Units", agg: "sum" };
const regions = (r) => r.rowRoot.children.map((n) => n.key);
const total = (r) => r.value(r.rowRoot, r.colRoot, 0);

test("include and exclude lists, with blank as null", () => {
    let r = computePivot(data, { rows: ["Region"], values: [sumUnits], filters: [{ field: "region", type: "include", items: ["North", "West"] }] });
    assert.deepEqual(regions(r), ["North", "West"]);
    assert.equal(total(r), 14);
    r = computePivot(data, { rows: ["Region"], values: [sumUnits], filters: [{ field: "Region", type: "exclude", items: [null, "South"] }] });
    assert.deepEqual(regions(r), ["North", "West"]);
});

test("a filter on a field off the axes filters the rows (report filter)", () => {
    const r = computePivot(data, { rows: ["Region"], values: [sumUnits], filters: [{ field: "Product", type: "include", items: ["B"] }] });
    assert.deepEqual(regions(r), ["North", "South"]);
    assert.equal(total(r), 3);
});

test("date items may be ISO strings", () => {
    const r = computePivot(data, { values: [sumUnits], filters: [{ field: "Date", type: "include", items: ["2026-01-05", "2026-01-20"] }] });
    assert.equal(total(r), 8);
});

test("label filters ignore case", () => {
    const r = computePivot(data, { rows: ["Rep"], values: [sumUnits], filters: [{ field: "Rep", type: "label", op: "contains", value: "E" }] });
    assert.deepEqual(r.rowRoot.children.map((n) => n.key), ["Dee", "Eve"]);
    const b = computePivot(data, { rows: ["Rep"], values: [sumUnits], filters: [{ field: "Rep", type: "label", op: "beginsWith", value: "a" }] });
    assert.deepEqual(b.rowRoot.children.map((n) => n.key), ["Ann"]);
});

test("top and bottom N by a value; totals show the visible items only", () => {
    let r = computePivot(data, { rows: ["Region"], values: [sumUnits], filters: [{ field: "Region", type: "top", count: 2 }] });
    assert.deepEqual(regions(r), ["North", "South"]);
    assert.equal(total(r), 18);
    r = computePivot(data, { rows: ["Region"], values: [sumUnits], filters: [{ field: "Region", type: "top", count: 1, bottom: true }] });
    assert.deepEqual(regions(r), ["West"]);
    // by a measure that is not shown
    r = computePivot(data, { rows: ["Region"], values: [sumUnits], filters: [{ field: "Region", type: "top", count: 1, by: { field: "Price", agg: "max" } }] });
    assert.deepEqual(regions(r), ["South"]);
});

test("top N on an inner field works within each outer item", () => {
    const r = computePivot(data, { rows: ["Region", "Rep"], values: [sumUnits], filters: [{ field: "Rep", type: "top", count: 1 }] });
    const reps = (region) => findNode(r, "rows", [region]).children.map((n) => n.key);
    // North: Ann 5 and Bob 5 tie; the first one in the data wins, so exactly one stays
    assert.deepEqual(reps("North"), ["Ann"]);
    assert.deepEqual(reps("South"), ["Cid"]);
});

test("value conditions", () => {
    const keep = (op, value, value2) => regions(computePivot(data, { rows: ["Region"], values: [sumUnits], filters: [{ field: "Region", type: "value", op, value, value2 }] }));
    assert.deepEqual(keep(">", 6), ["North", "South"]);
    assert.deepEqual(keep(">=", 6), ["North", "South", null]);
    assert.deepEqual(keep("<", 6), ["West"]);
    assert.deepEqual(keep("=", 8), ["South"]);
    assert.deepEqual(keep("!=", 8), ["North", "West", null]);
    assert.deepEqual(keep("between", 8, 5), ["South", null]);
    assert.deepEqual(keep("notBetween", 5, 8), ["North", "West"]);
    assert.deepEqual(keep("<=", 4), ["West"]);
});

test("value conditions by a chosen value, also one that is not shown; a measure without numbers is refused", () => {
    // Units summed: North 10, South 8, West 4, blank 6; the highest price: North 20, South 30, West 11, blank 9
    const maxPrice = { field: "Price", agg: "max" };
    const view = (by, value) => ({ rows: ["Region"], values: [sumUnits, maxPrice], filters: [{ field: "Region", type: "value", op: ">", value, by }] });
    assert.deepEqual(regions(computePivot(data, view(sumUnits, 9))), ["North"]);
    assert.deepEqual(regions(computePivot(data, view(maxPrice, 15))), ["North", "South"]);
    // without "by" the first value counts
    const first = { ...view(maxPrice, 9).filters[0], by: undefined };
    assert.deepEqual(regions(computePivot(data, { ...view(maxPrice, 9), filters: [first] })), ["North"]);
    // a measure the view does not show
    assert.deepEqual(regions(computePivot(data, { ...view(maxPrice, 15), values: [sumUnits] })), ["North", "South"]);
    const listed = validate({ rows: ["Region"], filters: [{ field: "Region", type: "value", op: ">", value: 1, by: { field: "Rep", agg: "listUnique" } }] }, data);
    assert.deepEqual(listed.errors.map((e) => e.path), ["filters[0].by"]);
});

test("filters combine: items first, then value filters from the outer level in", () => {
    const r = computePivot(data, {
        rows: ["Region"],
        values: [sumUnits],
        filters: [
            { field: "Region", type: "top", count: 2 },
            { field: "Region", type: "exclude", items: ["North"] }
        ]
    });
    assert.deepEqual(regions(r), ["South", null]);
});
