import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toGrid } from "../src/index.js";
import { isoWeek } from "../src/derive.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const keysBy = (by, extra = {}) => {
    const r = computePivot(data, { derived: [{ name: "G", field: "Date", by, ...extra }], rows: ["G"], values: [{ agg: "count" }] });
    return r.rowRoot.children.map((n) => [n.key, r.label("rows", n), r.value(n, r.colRoot, 0)]);
};

test("year, quarter, month", () => {
    assert.deepEqual(keysBy("year"), [[2025, "2025", 1], [2026, "2026", 7]]);
    assert.deepEqual(keysBy("quarter"), [[1, "Q1", 6], [2, "Q2", 1], [4, "Q4", 1]]);
    const months = computePivot(data, { derived: [{ name: "M", field: "Date", by: "month" }], rows: ["M"], values: [{ agg: "count" }], formatting: { locale: "en-US" } });
    assert.deepEqual(months.rowRoot.children.map((n) => months.label("rows", n)), ["Jan", "Feb", "Mar", "Apr", "Dec"]);
});

test("year-quarter, year-month and year-week keep years apart", () => {
    assert.deepEqual(keysBy("yearQuarter").map((k) => k[1]), ["2025-Q4", "2026-Q1", "2026-Q2"]);
    assert.deepEqual(keysBy("yearMonth").map((k) => k[1]), ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04"]);
    // 2025-12-31 is in ISO week 1 of 2026
    assert.equal(keysBy("yearWeek")[0][1], "2026-W01");
});

test("ISO weeks at year boundaries", () => {
    assert.deepEqual(isoWeek(Date.UTC(2026, 0, 1)), { year: 2026, week: 1 });
    assert.deepEqual(isoWeek(Date.UTC(2027, 0, 1)), { year: 2026, week: 53 });
    assert.deepEqual(isoWeek(Date.UTC(2021, 0, 3)), { year: 2020, week: 53 });
    assert.deepEqual(isoWeek(Date.UTC(2024, 11, 30)), { year: 2025, week: 1 });
    assert.deepEqual(isoWeek(Date.UTC(2026, 5, 15)), { year: 2026, week: 25 });
});

test("day, hour and weekday", () => {
    const d = encode([{ t: "2026-03-02T08:30:00" }, { t: "2026-03-02T17:00:00" }, { t: "2026-03-08T08:05:00" }]);
    const group = (by) => {
        const r = computePivot(d, { derived: [{ name: "G", field: "t", by }], rows: ["G"], values: [{ agg: "count" }], formatting: { locale: "en-US" } });
        return r.rowRoot.children.map((n) => `${r.label("rows", n)}=${r.value(n, r.colRoot, 0)}`);
    };
    assert.deepEqual(group("day"), ["Mar 2, 2026=2", "Mar 8, 2026=1"]);
    assert.deepEqual(group("hour"), ["08:00=2", "17:00=1"]);
    assert.deepEqual(group("weekday"), ["Mon=2", "Sun=1"]);
});

test("number bins with size and origin; lower bound included", () => {
    const r = computePivot(data, { derived: [{ name: "Band", field: "Price", by: "bin", size: 10, origin: 5 }], rows: ["Band"], values: [{ agg: "count" }], formatting: { locale: "en-US" } });
    assert.deepEqual(r.rowRoot.children.map((n) => [r.label("rows", n), r.value(n, r.colRoot, 0)]), [["5 – 15", 5], ["15 – 25", 1], ["25 – 35", 2]]);
});

test("derived fields work as filters and columns and are cached", () => {
    const view = { derived: [{ name: "Year", field: "Date", by: "year" }], cols: ["year"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Year", type: "include", items: [2026] }] };
    const r = computePivot(data, view);
    assert.deepEqual(r.colRoot.children.map((n) => n.key), [2026]);
    assert.equal(r.value(r.rowRoot, r.colRoot, 0), 22);
    const again = computePivot(data, view);
    assert.equal(again.colColumns[0].codes, r.colColumns[0].codes);
    assert.equal(toGrid(r).rows[0][1].text, "2026");
});

test("wrong source types are refused", () => {
    const r = computePivot(data, { derived: [{ name: "X", field: "Region", by: "year" }, { name: "Y", field: "Date", by: "bin", size: 5 }], rows: ["X", "Y"] });
    assert.deepEqual(r.view.derived, []);
    assert.deepEqual(r.view.rows, []);
});
