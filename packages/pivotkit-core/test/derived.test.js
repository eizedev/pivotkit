import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, suggestDateUnit, toGrid, validate } from "../src/index.js";
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
    assert.deepEqual(keysBy("yearQuarter").map((k) => k[1]), ["Q4 2025", "Q1 2026", "Q2 2026"]);
    assert.deepEqual(keysBy("yearMonth").map((k) => k[1]), ["Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"]);
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

/** Bin labels and counts of a number column. */
function bins(values, size, origin) {
    const d = encode(values.map((x) => ({ x })));
    const r = computePivot(d, { derived: [{ name: "B", field: "x", by: "bin", size, origin }], rows: ["B"], values: [{ agg: "count" }], formatting: { locale: "en-US" } });
    return r.rowRoot.children.map((n) => [n.key, r.label("rows", n), r.value(n, r.colRoot, 0)]);
}

test("bins of decimal sizes put boundary values into the bin they start", () => {
    assert.deepEqual(bins([0.3, 0.1, 0.7, 0.6, 0.29], 0.1), [
        [0.1, "0.1 – 0.2", 1], [0.2, "0.2 – 0.3", 1], [0.3, "0.3 – 0.4", 1], [0.6, "0.6 – 0.7", 1], [0.7, "0.7 – 0.8", 1]
    ]);
    assert.deepEqual(bins([0.07, 0.06, 0.03], 0.01).map((b) => b[0]), [0.03, 0.06, 0.07]);
    assert.deepEqual(bins([0.15, 0.1, 0.35, 0.3, 0.05], 0.05).map((b) => b[0]), [0.05, 0.1, 0.15, 0.3, 0.35]);
    assert.deepEqual(bins([1.1, 1.2, 1.3], 0.1, 0.05).map((b) => b[1]), ["1.05 – 1.15", "1.15 – 1.25", "1.25 – 1.35"]);
});

test("negative values and origins", () => {
    assert.deepEqual(bins([-0.3, -0.1, -0.25, 0], 0.1), [[-0.3, "-0.3 – -0.2", 2], [-0.1, "-0.1 – 0", 1], [0, "0 – 0.1", 1]]);
    assert.deepEqual(bins([-5, -10, 0, 4], 10), [[-10, "-10 – 0", 2], [0, "0 – 10", 2]]);
    assert.deepEqual(bins([-7, 2], 5, -2).map((b) => b[1]), ["-7 – -2", "-2 – 3"]);
});

test("bins too small to be exact are refused; values beyond the range are blank", () => {
    for (const size of [1e-10, 5e-324, 1e-300]) {
        assert.deepEqual(validate({ derived: [{ name: "B", field: "Price", by: "bin", size }] }, data).errors.map((e) => e.path), ["derived[0]"], String(size));
    }
    // 1e300 / 1e-9 overflows to Infinity: no bin, not one bin labelled "∞"
    const [only] = bins([1e300, 1], 1e-9);
    assert.deepEqual(only.slice(1), ["1 – 1.000000001", 1]);
    const d = encode([{ x: 1e300 }, { x: 1 }]);
    const r = computePivot(d, { derived: [{ name: "B", field: "x", by: "bin", size: 1e-9 }], rows: ["B"], values: [{ agg: "count" }] });
    assert.deepEqual(r.rowRoot.children.map((n) => n.key), [1, null]);
});

test("a bin index beyond 2^53 is blank instead of a bin whose bounds are equal", () => {
    const big = encode([{ V: 1e15 }, { V: 2 }]);
    const r = computePivot(big, { derived: [{ name: "B", field: "V", by: "bin", size: 1e-9 }], rows: ["B"], values: [{ agg: "count" }], formatting: { locale: "en-US" } });
    const labels = r.rowRoot.children.map((n) => r.label("rows", n));
    // 2 is still exact (2e9 bins from 0); 1e15 / 1e-9 = 1e24 bins is not
    assert.equal(labels.length, 2);
    assert.ok(labels.some((l) => l.startsWith("2 –")), labels.join(" | "));
    for (const l of labels) {
        const [lo, hi] = l.split(" – ");
        assert.notEqual(lo, hi, `bin "${l}" has equal bounds`);
    }
});

test("year-month labels follow the locale; the keys stay numbers that sort in time", () => {
    const r = computePivot(data, { derived: [{ name: "M", field: "Date", by: "yearMonth" }], rows: ["M"], values: [{ agg: "count" }], formatting: { locale: "de-DE" } });
    const first = r.rowRoot.children[0];
    assert.equal(first.key, 202512);
    assert.match(r.label("rows", first), /^Dez\.? 2025$/);
});

test("suggestDateUnit picks a grouping from the span of a date field", () => {
    const span = (days) => encode([{ d: new Date(Date.UTC(2026, 0, 1)) }, { d: new Date(Date.UTC(2026, 0, 1) + days * 86_400_000) }]);
    assert.equal(suggestDateUnit(span(30), "d"), "day");
    assert.equal(suggestDateUnit(span(62), "d"), "day");
    assert.equal(suggestDateUnit(span(63), "d"), "yearMonth");
    assert.equal(suggestDateUnit(span(700), "d"), "yearMonth");
    assert.equal(suggestDateUnit(span(800), "d"), "yearQuarter");
    assert.equal(suggestDateUnit(span(3000), "d"), "year");
    assert.equal(suggestDateUnit(span(0), "d"), null, "one day: nothing to group");
    assert.equal(suggestDateUnit(encode([{ d: "2026-01-01", n: 1 }]), "n"), null, "not a date");
    assert.equal(suggestDateUnit(data, "missing"), null);
    assert.equal(suggestDateUnit(data, "date"), "yearMonth", "case-insensitive, SALES spans Dec 2025 to Apr 2026");
});
