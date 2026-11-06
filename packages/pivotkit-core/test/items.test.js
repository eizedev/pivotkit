import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, fieldItems, normalize, computePivot, PivotkitError } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);

test("the values of a field with their row counts, in label order and blank last", () => {
    const r = fieldItems(data, "region");
    assert.equal(r.field, "Region");
    assert.equal(r.type, "string");
    assert.deepEqual(r.items, [
        { value: "North", label: "North", count: 3 },
        { value: "South", label: "South", count: 3 },
        { value: "West", label: "West", count: 1 },
        { value: null, label: "(blank)", count: 1 }
    ]);
    assert.equal(r.truncated, false);
    assert.equal(fieldItems(data, "Region", { labels: { blank: "(leer)" } }).items.at(-1).label, "(leer)");
});

test("a derived field of the view lists its groups, and its values filter the pivot", () => {
    const view = { derived: [{ name: "Month", field: "Date", by: "yearMonth" }] };
    const r = fieldItems(data, "Month", { view });
    assert.deepEqual(r.items.map((i) => [i.label, i.count]), [["2025-12", 1], ["2026-01", 2], ["2026-02", 2], ["2026-03", 2], ["2026-04", 1]]);
    // an item value names the group in an include filter
    const pivot = computePivot(data, { ...view, rows: ["Month"], filters: [{ field: "Month", type: "include", items: [r.items[1].value] }] });
    assert.deepEqual(pivot.rowRoot.children.map((n) => n.key), [202601]);
});

test("dates are listed as wall-clock milliseconds that an include filter accepts", () => {
    const r = fieldItems(data, "Date", { locale: "de-DE" });
    assert.equal(r.items[0].value, Date.UTC(2025, 11, 31));
    assert.equal(r.items[0].label, "31.12.2025");
    const { view, issues } = normalize({ filters: [{ field: "Date", type: "include", items: [r.items[0].value] }] }, data);
    assert.deepEqual(issues, []);
    assert.deepEqual(view.filters[0].items, [Date.UTC(2025, 11, 31)]);
});

test("numbers sort by value; the list is cut at limits.items", () => {
    const r = fieldItems(data, "Units", { limits: { items: 3 } });
    assert.deepEqual(r.items.map((i) => i.value), [1, 2, 3]);
    assert.equal(r.truncated, true);
});

test("an unknown field gives null; data that is not encoded throws", () => {
    assert.equal(fieldItems(data, "Nope"), null);
    assert.equal(fieldItems(data, 42), null);
    assert.throws(() => fieldItems([], "Region"), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT");
});
