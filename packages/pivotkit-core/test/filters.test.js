import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, computePivot, encode, fieldItems, findNode, fromViewFile, normalize, relativeDateRange, toViewFile, validate, viewFileText } from "../src/index.js";
import { SALES } from "./fixtures.js";
import { MS_PER_DAY } from "../src/util.js";

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
    assert.deepEqual(r.view.filters, [{ field: "Date", type: "compare", op: "<", value: "2026-01-05", precision: "day", not: false, blanks: "exclude" }]);
    assert.equal(kept([{ field: "Date", type: "compare", op: "between", value: "2026-01-20", value2: "2026-02-14" }]), 14);
    // year 2026 and later; months from 2026-03 (key 202603)
    assert.equal(kept([{ field: "Year", type: "compare", op: ">=", value: 2026 }], byYear), 22);
    assert.equal(kept([{ field: "Month", type: "compare", op: ">=", value: 202603 }], byYear), 5);
});

test("compare: normalize reports what it cannot use, with codes", () => {
    const issues = (filters) => validate({ filters, ...byYear }, data).errors.map((i) => i.code);
    assert.deepEqual(issues([{ field: "Region", type: "compare", op: ">", value: 1 }]), ["filterFieldType"]);
    assert.deepEqual(issues([{ field: "Price", type: "compare", op: "~", value: 1 }]), ["filterCompareValue"]);
    assert.deepEqual(issues([{ field: "Price", type: "compare", op: ">", value: "ten" }]), ["filterCompareValue"]);
    assert.deepEqual(issues([{ field: "Price", type: "compare", op: "between", value: 1 }]), ["filterCompareValue"]);
    assert.deepEqual(issues([{ field: "Date", type: "compare", op: ">", value: "2026-02-30" }]), ["filterCompareValue"]);
    assert.deepEqual(issues([{ field: "Year", type: "compare", op: ">", value: 2020 }]), []);
});

test("compare: a date's wall-clock ms beyond what a Date holds are an issue, never a throw", () => {
    const codes = (filter) => normalize({ filters: [filter] }, data).issues.map((i) => i.code);
    for (const ms of [1e300, 8.7e15, -8.7e15]) {
        assert.deepEqual(codes({ field: "Date", type: "compare", op: ">", value: ms }), ["filterCompareValue"], `value ${ms}`);
        assert.deepEqual(codes({ field: "Date", type: "compare", op: "between", value: "2026-01-01", value2: ms }), ["filterCompareValue"], `value2 ${ms}`);
        assert.equal(kept([{ field: "Date", type: "compare", op: ">", value: ms }]), 28, `the pivot leaves the filter out, ${ms}`);
        // a view file with such a filter loads with the issue
        const file = fromViewFile(viewFileText(toViewFile({ filters: [{ field: "Date", type: "compare", op: "<", value: ms }] })));
        assert.deepEqual(normalize(file.view, data).issues.map((i) => i.code), ["filterCompareValue"]);
    }
    // the edges of the range are days
    assert.deepEqual(computePivot(data, { filters: [{ field: "Date", type: "compare", op: "between", value: -8.64e15, value2: 8.64e15 }] }).view.filters[0], {
        field: "Date",
        type: "compare",
        op: "between",
        value: "-271821-04-20",
        value2: "+275760-09-13",
        precision: "day",
        not: false,
        blanks: "exclude"
    });
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
    assert.deepEqual(issues([{ field: "Region", type: "relative", unit: "year", count: 1 }]), ["filterFieldType"]);
    assert.deepEqual(issues([{ field: "Band", type: "relative", unit: "year", count: 1 }]), ["filterFieldType"]);
    assert.deepEqual(issues([{ field: "Date", type: "relative", unit: "decade", count: 1 }]), ["filterRelativeUnit"]);
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
    assert.equal(relativeDateRange("decade", 1), null);
    assert.equal(relativeDateRange("year", 0), null);
    assert.equal(relativeDateRange("year", 1.5), null);
});

test("now at the edge of what a Date holds: INVALID_OPTION in every zone, a range that leaves it is null", () => {
    const zoned = encode(SALES, { timeZone: "America/New_York" });
    const relative = { values: [sumUnits], filters: [{ field: "Date", type: "relative", unit: "year", count: 500 }] };
    // refused before the zone's formatter sees it (a plain Date would throw a RangeError there)
    for (const now of [1e300, 8.7e15, -8.7e15]) {
        assert.throws(() => computePivot(zoned, relative, { now }), { code: "INVALID_OPTION" }, `computePivot ${now}`);
        assert.throws(() => fieldItems(zoned, "Date", { view: relative, now }), { code: "INVALID_OPTION" }, `fieldItems ${now}`);
        assert.throws(() => relativeDateRange("year", 1, { now, timeZone: "Europe/Berlin" }), { code: "INVALID_OPTION" }, `relativeDateRange ${now}`);
    }
    // the last and the first moment a Date holds are today; a zone's offset past the edge is refused too
    assert.equal(relativeDateRange("year", 500, { now: 8.64e15 }), null);
    assert.equal(relativeDateRange("year", 500, { now: -8.64e15 }), null);
    assert.deepEqual(relativeDateRange("day", 1, { now: -8.64e15 }), { from: "-271821-04-20", to: "-271821-04-20" });
    assert.equal(relativeDateRange("day", 2, { now: -8.64e15 }), null);
    assert.deepEqual(relativeDateRange("day", 1, { now: 8.64e15 - MS_PER_DAY }), { from: "+275760-09-12", to: "+275760-09-12" });
    assert.throws(() => relativeDateRange("year", 1, { now: 8.64e15, timeZone: "Europe/Berlin" }), { code: "INVALID_OPTION" });
    // the pivot keeps the dates on today's side of a range without an end: none of 2026 is in the last 500 years of year 275760
    assert.equal(total(computePivot(zoned, relative, { now: 8.64e15 })), 0);
    assert.equal(total(computePivot(data, relative, { now: -8.64e15 })), 0);
    assert.equal(kept([{ field: "Date", type: "relative", unit: "day", count: 500 }], {}, { now: -8.64e15 + MS_PER_DAY }), 0);
});

// ---- the reference date of a relative range: today, or the data's latest record (anchor) ----

test("relative: anchor latest counts back from the data's latest date, whatever today is", () => {
    // the data end 2026-04-30; today is years later
    const now = "2030-11-09";
    const latest = (unit, count) => kept([{ field: "Date", type: "relative", unit, count, anchor: "latest" }], {}, { now });
    const today = (unit, count) => kept([{ field: "Date", type: "relative", unit, count }], {}, { now });
    // from today nothing is in range; from the latest record the year 2026 is (all but 2025-12-31)
    assert.equal(today("year", 1), 0);
    assert.equal(latest("year", 1), 22);
    assert.equal(latest("year", 2), 28);
    // the latest record's month (April 2026) and the three before it
    assert.equal(latest("month", 1), 4);
    assert.equal(latest("month", 4), 22);
    // the latest record's day alone
    assert.equal(latest("day", 1), 4);
    // normalize writes every key: the anchor "today" when none is given
    const anchored = computePivot(data, { filters: [{ field: "Date", type: "relative", unit: "year", count: 1, anchor: "latest" }] }).view.filters[0];
    assert.deepEqual(anchored, { field: "Date", type: "relative", direction: "last", unit: "year", count: 1, calendar: true, includeCurrent: true, anchor: "latest", not: false, blanks: "exclude" });
    const plain = computePivot(data, { filters: [{ field: "Date", type: "relative", unit: "year", count: 1 }] }).view.filters[0];
    assert.deepEqual(plain, { field: "Date", type: "relative", direction: "last", unit: "year", count: 1, calendar: true, includeCurrent: true, anchor: "today", not: false, blanks: "exclude" });
    // an unknown anchor: the filter is left out, with its code
    const bad = normalize({ filters: [{ field: "Date", type: "relative", unit: "year", count: 1, anchor: "yesterday" }] }, data);
    assert.deepEqual(bad.issues.map((i) => i.code), ["filterRelativeAnchor"]);
    assert.deepEqual(bad.view.filters, []);
});

test("relative: anchor latest on a grouping goes by the source dates' latest day; fieldItems agrees", () => {
    const v = { ...byYear, rows: ["Year"], values: [sumUnits] };
    // the last 2 months to April 2026: March and April (1 + blank + 4)
    const r = computePivot(data, { ...v, filters: [{ field: "Year", type: "relative", unit: "month", count: 2, anchor: "latest" }] }, { now: "2031-06-01" });
    assert.deepEqual(r.rowRoot.children.map((n) => [n.key, r.value(n, r.colRoot, 0)]), [[2026, 5]]);
    const items = fieldItems(data, "Year", { view: { ...v, filters: [{ field: "Year", type: "relative", unit: "year", count: 1, anchor: "latest" }] }, now: "2031-06-01" });
    assert.deepEqual(items.items.map((i) => [i.value, i.kept]), [[2025, false], [2026, true]]);
    // from today (2031) the same range keeps nothing
    const none = fieldItems(data, "Year", { view: { ...v, filters: [{ field: "Year", type: "relative", unit: "year", count: 1 }] }, now: "2031-06-01" });
    assert.deepEqual(none.items.map((i) => i.kept), [false, false]);
});

test("relativeDateRange: anchor latest with the data's latest date; year boundaries and time zones", () => {
    const latest = "2025-12-31";
    assert.deepEqual(relativeDateRange("year", 1, { now: "2026-11-09", anchor: "latest", latest }), { from: "2025-01-01", to: "2025-12-31" });
    assert.deepEqual(relativeDateRange("year", 2, { now: "2026-11-09", anchor: "latest", latest }), { from: "2024-01-01", to: "2025-12-31" });
    assert.deepEqual(relativeDateRange("month", 12, { now: "2026-11-09", anchor: "latest", latest }), { from: "2025-01-01", to: "2025-12-31" });
    assert.deepEqual(relativeDateRange("day", 7, { now: "2026-11-09", anchor: "latest", latest }), { from: "2025-12-25", to: "2025-12-31" });
    // anchor today ignores `latest`; the default is today
    assert.deepEqual(relativeDateRange("year", 1, { now: "2026-11-09", anchor: "today", latest }), { from: "2026-01-01", to: "2026-12-31" });
    assert.deepEqual(relativeDateRange("year", 1, { now: "2026-11-09", latest }), { from: "2026-01-01", to: "2026-12-31" });
    // the latest record as an instant is read in the data's time zone: New Year's night in UTC is still 2025 in New York
    assert.deepEqual(relativeDateRange("year", 1, { anchor: "latest", latest: new Date("2026-01-01T03:00:00Z"), timeZone: "America/New_York" }), { from: "2025-01-01", to: "2025-12-31" });
    assert.deepEqual(relativeDateRange("year", 1, { anchor: "latest", latest: new Date("2026-01-01T03:00:00Z") }), { from: "2026-01-01", to: "2026-12-31" });
    // the latest record as wall-clock ms, as a column holds dates
    assert.deepEqual(relativeDateRange("month", 1, { anchor: "latest", latest: Date.UTC(2024, 1, 10) }), { from: "2024-02-01", to: "2024-02-29" });
    // anchor latest without a latest date, or an unknown anchor: no range
    assert.equal(relativeDateRange("year", 1, { anchor: "latest" }), null);
    assert.equal(relativeDateRange("year", 1, { anchor: "yesterday", latest }), null);
    assert.throws(() => relativeDateRange("year", 1, { anchor: "latest", latest: "soon" }), { code: "INVALID_OPTION" });
});

test("compare: a date grouping with a calendar day compares the source dates, not the grouping's key", () => {
    // "month of the year" combines the years; a day as the value picks the years (the Filter level's Years combined)
    const v = { derived: [{ name: "Month", field: "Date", by: "month" }], rows: ["Month"], values: [sumUnits] };
    const year = (op, from, to) => computePivot(data, { ...v, filters: [{ field: "Month", type: "compare", op, value: from, value2: to }] });
    const r = year("between", "2026-01-01", "2026-12-31");
    assert.equal(total(r), 22);
    assert.deepEqual(r.rowRoot.children.map((n) => n.key), [1, 2, 3, 4]);
    assert.equal(total(year("notBetween", "2026-01-01", "2026-12-31")), 6);
    assert.equal(total(year("<", "2026-01-01")), 6);
    // kept as the day, and fieldItems marks the months it leaves out (December has only 2025)
    assert.deepEqual(r.view.filters, [{ field: "Month", type: "compare", op: "between", value: "2026-01-01", value2: "2026-12-31", precision: "day", not: false, blanks: "exclude" }]);
    const items = fieldItems(data, "Month", { view: { ...v, filters: r.view.filters } });
    assert.deepEqual(items.items.map((i) => [i.value, i.kept]), [[1, true], [2, true], [3, true], [4, true], [12, false]]);
    // a key stays a key; a day and a key mixed is no comparison
    assert.deepEqual(computePivot(data, { ...v, filters: [{ field: "Month", type: "compare", op: ">=", value: "3" }] }).rowRoot.children.map((n) => n.key), [3, 4, 12]);
    assert.deepEqual(normalize({ ...v, filters: [{ field: "Month", type: "compare", op: "between", value: "2026-01-01", value2: 3 }] }, data).issues.map((i) => i.code), ["filterCompareValue"]);
});

// ---- version 2: one condition shape, not and blanks ----

/** The regions a version-2 view keeps (null for the blank). */
const keptRegions = (filters) => regions(computePivot(data, { version: 2, rows: ["Region"], values: [sumUnits], filters }));

test("in: not inverts the items with a value, blanks alone decides the blank", () => {
    const f = (extra) => [{ field: "Region", type: "in", items: ["North"], ...extra }];
    assert.deepEqual(keptRegions(f({})), ["North"]);
    assert.deepEqual(keptRegions(f({ blanks: "include" })), ["North", null]);
    assert.deepEqual(keptRegions(f({ blanks: "only" })), [null]);
    assert.deepEqual(keptRegions(f({ not: true })), ["South", "West"]);
    assert.deepEqual(keptRegions(f({ not: true, blanks: "include" })), ["South", "West", null]);
    assert.deepEqual(keptRegions(f({ not: true, blanks: "only" })), [null]);
    // null is no item in version 2: an error that says to use blanks
    assert.deepEqual(validate({ version: 2, filters: [{ field: "Region", type: "in", items: [null], blanks: "exclude" }] }, data).errors.map((e) => e.code), ["filterBlanks"]);
});

test("blank: the blank items, or with not every other", () => {
    assert.deepEqual(keptRegions([{ field: "Region", type: "blank" }]), [null]);
    assert.deepEqual(keptRegions([{ field: "Region", type: "blank", not: true }]), ["North", "South", "West"]);
    assert.deepEqual(computePivot(data, { version: 2, filters: [{ field: "Units", type: "blank" }] }).rows.length, 1);
    // a blank filter has no blanks of its own
    assert.deepEqual(validate({ version: 2, filters: [{ field: "Region", type: "blank", blanks: "only" }] }, data).warnings.map((w) => w.path), ["filters[0].blanks"]);
});

test("text: a text field's value or any field's label, folded as match says; not and blanks", () => {
    const spaced = encode([{ Name: "ACTIVE\u00A0DIRECTORY" }, { Name: "Active Directory admins" }, { Name: "active  directory sync" }, { Name: "Other" }, { Name: null }]);
    const names = (filter) => computePivot(spaced, { version: 2, rows: ["Name"], filters: [{ field: "Name", type: "text", ...filter }] }).rowRoot.children.map((n) => n.key).sort();
    // #159: the default folds case and whitespace, a no-break space too
    assert.deepEqual(names({ op: "beginsWith", value: "ACTIVE DIRECTORY " }), ["ACTIVE\u00A0DIRECTORY", "Active Directory admins", "active  directory sync"]);
    assert.deepEqual(names({ op: "equals", value: "active directory" }), ["ACTIVE\u00A0DIRECTORY"]);
    assert.deepEqual(names({ op: "equals", value: "active directory", match: { whitespace: "exact" } }), []);
    assert.deepEqual(names({ op: "contains", value: "Directory", match: { case: "sensitive" } }), ["Active Directory admins"]);
    assert.deepEqual(names({ op: "endsWith", value: "sync", not: true }), ["ACTIVE\u00A0DIRECTORY", "Active Directory admins", "Other"]);
    assert.deepEqual(names({ op: "endsWith", value: "sync", not: true, blanks: "include" }).length, 4);
    // on the label: a number as the table shows it
    const units = computePivot(data, { version: 2, rows: ["Units"], filters: [{ field: "Units", type: "text", op: "beginsWith", value: "5", on: "label" }] });
    assert.deepEqual(units.rowRoot.children.map((n) => n.key), [5]);
    // normalized: every key written
    assert.deepEqual(units.view.filters[0], { field: "Units", type: "text", op: "beginsWith", value: "5", on: "label", match: { case: "insensitive", whitespace: "collapse" }, not: false, blanks: "exclude" });
});

test("the field-type matrix: a filter type on a field it does not fit is an error with the type that fits", () => {
    const errors = (filter) => validate({ version: 2, derived: [{ name: "Year", field: "Date", by: "year" }], filters: [{ blanks: "exclude", ...filter }] }, data).errors.map((e) => [e.code, e.params?.suggestion]);
    assert.deepEqual(errors({ field: "Region", type: "compare", op: ">", value: 1 }), [["filterFieldType", "text"]]);
    assert.deepEqual(errors({ field: "Units", type: "relative", unit: "year", count: 1 }), [["filterFieldType", "compare"]]);
    assert.deepEqual(errors({ field: "Units", type: "text", op: "equals", value: "5" }), [["filterFieldType", "label"]]);
    assert.deepEqual(errors({ field: "Units", type: "text", op: "equals", value: "5", on: "label" }), []);
    assert.deepEqual(errors({ field: "Year", type: "relative", unit: "year", count: 1 }), []);
    assert.deepEqual(CATALOG.filterFields.relative, ["date", "dateGrouping"]);
});

test("version 1's operators and types in a version-2 view are errors that name version 2's", () => {
    const errors = (filter) => validate({ version: 2, filters: [filter] }, data).errors.map((e) => [e.code, e.params?.suggestion]);
    assert.deepEqual(errors({ field: "Region", type: "include", items: ["North"] }), [["unknownFilterType", "in"]]);
    assert.deepEqual(errors({ field: "Region", type: "label", op: "contains", value: "N" }), [["unknownFilterType", "text"]]);
    assert.deepEqual(errors({ field: "Region", type: "text", op: "notEquals", value: "N" }), [["filterTextOp", "equals"]]);
    assert.deepEqual(errors({ field: "Price", type: "compare", op: "!=", value: 1, blanks: "exclude" }), [["filterCompareValue", "="]]);
    assert.deepEqual(errors({ field: "Region", type: "value", op: "notBetween", value: 1, value2: 2 }), [["filterValue", "between"]]);
});

test("strict warnings: a filter that says nothing about blanks, an in filter that keeps nothing", () => {
    const warnings = (filter) => validate({ version: 2, filters: [filter] }, data).warnings.map((w) => w.code);
    assert.deepEqual(warnings({ field: "Region", type: "in", items: ["North"] }), ["blanksUnspecified"]);
    assert.deepEqual(warnings({ field: "Region", type: "in", items: [], blanks: "exclude" }), ["filterEmpty"]);
    assert.deepEqual(warnings({ field: "Region", type: "in", items: [], not: true, blanks: "exclude" }), []);
    assert.deepEqual(warnings({ field: "Region", type: "in", items: [], blanks: "include" }), []);
    // normalize() does not give them
    assert.deepEqual(normalize({ version: 2, filters: [{ field: "Region", type: "in", items: [] }] }, data).issues, []);
});

test("value: not inverts the comparison; a group without a number never matches", () => {
    const keep = (extra) => keptRegions([{ field: "Region", type: "value", op: "between", value: 5, value2: 8, ...extra }]);
    assert.deepEqual(keep({}), ["South", null]);
    assert.deepEqual(keep({ not: true }), ["North", "West"]);
    const prices = computePivot(data, { version: 2, rows: ["Region"], values: [{ field: "Units", agg: "average" }], filters: [{ field: "Product", type: "value", op: "=", value: 99, not: true, by: { field: "Units", agg: "sum" } }] });
    assert.ok(prices.rows.length > 0);
});

test("compare: a date's precision takes both sides to the start of their year, quarter, month, day or hour", () => {
    // Date: 2026-01-05, 01-20, 02-03, 02-14, 03-01, 03-09, 04-30, 2025-12-31 with units 3 5 2 7 1 (blank) 4 6
    const keep = (op, value, precision, value2) => kept([{ field: "Date", type: "compare", op, value, value2, precision }]);
    assert.equal(keep("=", "2026-02-20", "month"), 9);
    assert.equal(keep(">=", "2026-03-31", "quarter"), 22);
    assert.equal(keep(">=", "2026-04-15", "quarter"), 4);
    assert.equal(keep("=", "2026-06-01", "year"), 22);
    assert.equal(keep("between", "2026-01-31", "month", "2026-02-01"), 17);
    // normalized to the start of the unit
    const at = (value, precision) => computePivot(data, { filters: [{ field: "Date", type: "compare", op: "=", value, precision }] }).view.filters[0].value;
    assert.equal(at("2026-02-20", "month"), "2026-02-01");
    assert.equal(at("2026-05-20T14:35", "quarter"), "2026-04-01");
    assert.equal(at("2026-05-20T14:35", "hour"), "2026-05-20T14:00");
    const hours = encode([{ At: "2026-03-01T09:15" }, { At: "2026-03-01T09:59" }, { At: "2026-03-01T10:00" }]);
    assert.equal(computePivot(hours, { filters: [{ field: "At", type: "compare", op: "=", value: "2026-03-01T09:30", precision: "hour" }] }).rows.length, 2);
    // a precision on a number, or an unknown one, is an issue
    const codes = (filter) => validate({ version: 2, filters: [{ blanks: "exclude", ...filter }] }, data).errors.map((e) => [e.code, e.params?.suggestion]);
    assert.deepEqual(codes({ field: "Price", type: "compare", op: ">", value: 1, precision: "day" }), [["filterPrecision", undefined]]);
    assert.deepEqual(codes({ field: "Date", type: "compare", op: ">", value: "2026-01-01", precision: "months" }), [["filterPrecision", "month"]]);
});

test("top: ties at the cut stay with ties all; the first in the data with ties first, the default", () => {
    // North: Ann 5 and Bob 5 tie for the top one
    const reps = (ties) => {
        const r = computePivot(data, { rows: ["Region", "Rep"], values: [sumUnits], filters: [{ field: "Rep", type: "top", count: 1, ...(ties ? { ties } : {}) }] });
        return findNode(r, "rows", ["North"]).children.map((n) => n.key);
    };
    assert.deepEqual(reps(undefined), ["Ann"]);
    assert.deepEqual(reps("first"), ["Ann"]);
    assert.deepEqual(reps("all"), ["Ann", "Bob"]);
    assert.equal(computePivot(data, { filters: [{ field: "Rep", type: "top", count: 1 }] }).view.filters[0].ties, "first");
    assert.deepEqual(validate({ filters: [{ field: "Rep", type: "top", count: 1, ties: "every" }] }, data).errors.map((e) => e.code), ["filterTies"]);
});
