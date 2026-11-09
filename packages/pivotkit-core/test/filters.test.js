import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, computePivot, encode, findNode, relativeDateRange, validate } from "../src/index.js";
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

// ---- comparisons of the item itself (compare) and relative date ranges (relative) ----

/** Sum of Units of the rows a filter list keeps, with `now` for relative ranges. */
const kept = (filters, view = {}, options = {}) => total(computePivot(data, { values: [sumUnits], filters, ...view }, options));
const byYear = { derived: [{ name: "Year", field: "Date", by: "year" }, { name: "Month", field: "Date", by: "yearMonth" }] };

test("compare: a number item with each operator; blanks never match", () => {
    const keep = (op, value, value2) => kept([{ field: "Price", type: "compare", op, value, value2 }]);
    // prices 10 12 20 10 25 30 11 9 with units 3 5 2 7 1 (blank) 4 6
    assert.equal(keep("=", 10), 10);
    assert.equal(keep("!=", 10), 18);
    assert.equal(keep(">", 20), 1);
    assert.equal(keep(">=", 20), 3);
    assert.equal(keep("<", 10), 6);
    assert.equal(keep("<=", 10), 16);
    assert.equal(keep("between", 11, 20), 11);
    // the bounds in either order, as a value condition reads them
    assert.equal(keep("between", 20, 11), 11);
    assert.equal(keep("notBetween", 11, 20), 17);
    // a number as text, as filter items take it, and normalized to the number
    assert.equal(keep(">=", "20"), 3);
    assert.deepEqual(computePivot(data, { filters: [{ field: "Price", type: "compare", op: ">", value: "2.5e1" }] }).view.filters[0].value, 25);
    // a blank item is never kept, not even by != or notBetween
    const blank = computePivot(data, { rows: ["Region"], values: [{ agg: "count" }], filters: [{ field: "Units", type: "compare", op: "!=", value: 99 }] });
    assert.equal(total(blank), 7);
});

test("compare: a date by its calendar day, a grouping by its key", () => {
    assert.equal(kept([{ field: "Date", type: "compare", op: ">=", value: "2026-02-14" }]), 12);
    // a value with a time is read as its day, and normalized to it
    const r = computePivot(data, { values: [sumUnits], filters: [{ field: "Date", type: "compare", op: "<", value: "2026-01-05T18:00" }] });
    assert.equal(total(r), 6);
    assert.deepEqual(r.view.filters, [{ field: "Date", type: "compare", op: "<", value: "2026-01-05" }]);
    assert.equal(kept([{ field: "Date", type: "compare", op: "between", value: "2026-01-20", value2: "2026-02-14" }]), 14);
    // year 2026 and later; months from 2026-03 (key 202603)
    assert.equal(kept([{ field: "Year", type: "compare", op: ">=", value: 2026 }], byYear), 22);
    assert.equal(kept([{ field: "Month", type: "compare", op: ">=", value: 202603 }], byYear), 5);
});

test("compare: normalize reports what it cannot use, with codes", () => {
    const issues = (filters) => validate({ filters, ...byYear }, data).errors.map((i) => i.code);
    assert.deepEqual(issues([{ field: "Region", type: "compare", op: ">", value: 1 }]), ["filterCompareField"]);
    assert.deepEqual(issues([{ field: "Price", type: "compare", op: "~", value: 1 }]), ["filterCompareValue"]);
    assert.deepEqual(issues([{ field: "Price", type: "compare", op: ">", value: "ten" }]), ["filterCompareValue"]);
    assert.deepEqual(issues([{ field: "Price", type: "compare", op: "between", value: 1 }]), ["filterCompareValue"]);
    assert.deepEqual(issues([{ field: "Date", type: "compare", op: ">", value: "2026-02-30" }]), ["filterCompareValue"]);
    assert.deepEqual(issues([{ field: "Year", type: "compare", op: ">", value: 2020 }]), []);
});

test("relative: the last N years, months and days end with today's", () => {
    const now = "2026-03-05";
    const rel = (unit, count, view = {}) => kept([{ field: "Date", type: "relative", unit, count }], view, { now });
    // every date of 2026: all but 2025-12-31 (6 units)
    assert.equal(rel("year", 1), 22);
    assert.equal(rel("year", 2), 28);
    // March 2026 (1 + blank); January to March
    assert.equal(rel("month", 1), 1);
    assert.equal(rel("month", 3), 18);
    // 2026-03-01 to 2026-03-05: the 1 of 2026-03-01; today's later dates are in the range too
    assert.equal(rel("day", 5), 1);
    assert.equal(rel("day", 4), 0);
});

test("relative: across a year boundary, months reach into the year before", () => {
    const r = (count, now) => kept([{ field: "Date", type: "relative", unit: "month", count }], {}, { now });
    // Jan 2026 and Dec 2025: 3 + 5 + 6
    assert.equal(r(2, "2026-01-31"), 14);
    // a grouping filters by its source dates: the 2025 group keeps only its December
    const v = { ...byYear, rows: ["Year"] };
    const result = computePivot(data, { ...v, values: [sumUnits], filters: [{ field: "Year", type: "relative", unit: "month", count: 2 }] }, { now: "2026-01-15" });
    assert.deepEqual(result.rowRoot.children.map((n) => [n.key, result.value(n, result.colRoot, 0)]), [[2025, 6], [2026, 8]]);
});

test("relative: now is read in the data's time zone, never the machine's", () => {
    const zoned = encode(SALES, { timeZone: "America/New_York" });
    const view = { values: [sumUnits], filters: [{ field: "Date", type: "relative", unit: "year", count: 1 }] };
    // 2026-01-01 03:00 UTC is still 2025 in New York: only 2025-12-31 is kept
    assert.equal(total(computePivot(zoned, view, { now: new Date("2026-01-01T03:00:00Z") })), 6);
    assert.equal(total(computePivot(data, view, { now: new Date("2026-01-01T03:00:00Z") })), 22);
    // an ISO string without an offset is today as written
    assert.equal(total(computePivot(zoned, view, { now: "2026-01-01T00:00" })), 22);
    assert.throws(() => computePivot(data, view, { now: "soon" }), { code: "INVALID_OPTION" });
});

test("relative: normalize checks the field, the unit and the count", () => {
    const issues = (filters) => validate({ filters, derived: [...byYear.derived, { name: "Band", field: "Units", by: "bin", size: 5 }] }, data).errors.map((i) => i.code);
    assert.deepEqual(issues([{ field: "Region", type: "relative", unit: "year", count: 1 }]), ["filterRelativeField"]);
    assert.deepEqual(issues([{ field: "Band", type: "relative", unit: "year", count: 1 }]), ["filterRelativeField"]);
    assert.deepEqual(issues([{ field: "Date", type: "relative", unit: "week", count: 1 }]), ["filterRelativeUnit"]);
    assert.deepEqual(issues([{ field: "Date", type: "relative", unit: "year", count: 0 }]), ["filterRelativeCount"]);
    assert.deepEqual(issues([{ field: "Date", type: "relative", unit: "year", count: CATALOG.relativeMaxCount + 1 }]), ["filterRelativeCount"]);
    assert.deepEqual(issues([{ field: "Month", type: "relative", unit: "year", count: CATALOG.relativeMaxCount }]), []);
});

test("relativeDateRange says the days a range keeps", () => {
    assert.deepEqual(relativeDateRange("year", 5, { now: "2026-11-09" }), { from: "2022-01-01", to: "2026-12-31" });
    assert.deepEqual(relativeDateRange("month", 3, { now: "2026-01-31" }), { from: "2025-11-01", to: "2026-01-31" });
    assert.deepEqual(relativeDateRange("month", 1, { now: "2024-02-10" }), { from: "2024-02-01", to: "2024-02-29" });
    assert.deepEqual(relativeDateRange("day", 7, { now: "2026-03-02" }), { from: "2026-02-24", to: "2026-03-02" });
    assert.deepEqual(relativeDateRange("year", 1, { now: new Date("2026-01-01T03:00:00Z"), timeZone: "America/New_York" }), { from: "2025-01-01", to: "2025-12-31" });
    // years before 100 are years, not 1900 + n; a year before 0 has its sign and six digits
    assert.deepEqual(relativeDateRange("year", 500, { now: "0350-06-01" }), { from: "-000149-01-01", to: "0350-12-31" });
    assert.deepEqual(relativeDateRange("year", 2, { now: "0099-06-01" }), { from: "0098-01-01", to: "0099-12-31" });
    assert.equal(relativeDateRange("year", 501), null);
    // epoch ms beyond a Date's range are no time
    assert.throws(() => relativeDateRange("year", 1, { now: 9e15 }), { code: "INVALID_OPTION" });
    assert.throws(() => computePivot(data, { values: [sumUnits] }, { now: -9e15 }), { code: "INVALID_OPTION" });
    assert.equal(relativeDateRange("week", 1), null);
    assert.equal(relativeDateRange("year", 0), null);
    assert.equal(relativeDateRange("year", 1.5), null);
});
