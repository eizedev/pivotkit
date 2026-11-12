import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, computePivot, encode, normalize, relativeDateRange, validate } from "../src/index.js";
import { DATED } from "./v1-corpus.js";

// today: Sunday, 15 March 2026, noon
const now = "2026-03-15T12:00:00Z";
const range = (unit, count, options) => relativeDateRange(unit, count, { now, ...options });

test("relativeDateRange: directions, whole units or rolling, the current unit or not", () => {
    assert.deepEqual(range("month", 1, { direction: "this" }), { from: "2026-03-01", to: "2026-03-31" });
    assert.deepEqual(range("quarter", 1, { direction: "this" }), { from: "2026-01-01", to: "2026-03-31" });
    assert.deepEqual(range("quarter", 2, { includeCurrent: false }), { from: "2025-07-01", to: "2025-12-31" });
    assert.deepEqual(range("month", 1, { direction: "next" }), { from: "2026-03-01", to: "2026-03-31" });
    assert.deepEqual(range("month", 2, { direction: "next", includeCurrent: false }), { from: "2026-04-01", to: "2026-05-31" });
    assert.deepEqual(range("year", 1, { direction: "before" }), { from: null, to: "2025-12-31" });
    // rolling: from the moment count units ago to now, to the minute
    assert.deepEqual(range("day", 30, { calendar: false }), { from: "2026-02-13T12:00", to: "2026-03-15T12:00" });
    assert.deepEqual(range("day", 30, { calendar: false, direction: "before" }), { from: null, to: "2026-02-13T11:59" });
    assert.deepEqual(range("day", 2, { calendar: false, direction: "next" }), { from: "2026-03-15T12:00", to: "2026-03-17T12:00" });
    // a month back from the 31st is the last day of the shorter month
    assert.deepEqual(relativeDateRange("month", 1, { now: "2026-03-31T00:00", calendar: false }), { from: "2026-02-28T00:00", to: "2026-03-31T00:00" });
    assert.deepEqual(range("hour", 1, { direction: "this" }), { from: "2026-03-15T12:00", to: "2026-03-15T12:59" });
    assert.deepEqual(range("hour", 3), { from: "2026-03-15T10:00", to: "2026-03-15T12:59" });
});

test("weeks start on Monday by default, on another day with weekStart", () => {
    assert.deepEqual(range("week", 1, { direction: "this" }), { from: "2026-03-09", to: "2026-03-15" });
    assert.deepEqual(range("week", 1, { direction: "this", weekStart: 7 }), { from: "2026-03-15", to: "2026-03-21" });
    assert.deepEqual(range("week", 2, { weekStart: 6 }), { from: "2026-03-07", to: "2026-03-20" });
    assert.equal(range("week", 1, { weekStart: 8 }), null);
});

test("anchors: today, the data's latest or first date, a date of its own", () => {
    assert.deepEqual(range("year", 1, { anchor: "2025-06-30" }), { from: "2025-01-01", to: "2025-12-31" });
    assert.deepEqual(range("day", 1, { anchor: "first", first: "2024-11-30" }), { from: "2024-11-30", to: "2024-11-30" });
    assert.equal(range("day", 1, { anchor: "first" }), null);
    assert.equal(range("day", 1, { anchor: "yesterday" }), null);
    assert.equal(range("day", 1, { direction: "sideways" }), null);
    assert.deepEqual(CATALOG.relativeUnits, ["hour", "day", "week", "month", "quarter", "year"]);
    assert.deepEqual(CATALOG.relativeDirections, ["last", "next", "this", "before"]);
});

const data = encode(DATED);
const kept = (filter, view = {}) => computePivot(data, { version: 2, filters: [{ field: "Created", type: "relative", blanks: "exclude", ...filter }], ...view }, { now }).rows.length;

test("relative filters keep the dates of their range; not and blanks as every filter", () => {
    // Created: 2024-11-30, 2025-01-15, 2025-06-30, 2025-12-31, blank, 2026-02-01, 2026-03-10, 2026-03-11
    assert.equal(kept({ direction: "this", unit: "week" }), 2);
    assert.equal(kept({ direction: "this", unit: "week" }, { formatting: { weekStart: 7 } }), 0);
    assert.equal(kept({ unit: "month", count: 1, includeCurrent: false }), 1);
    assert.equal(kept({ direction: "before", unit: "year", count: 1 }), 4);
    assert.equal(kept({ direction: "before", unit: "year", count: 1, blanks: "include" }), 5);
    assert.equal(kept({ unit: "year", count: 1, not: true }), 4);
    assert.equal(kept({ direction: "next", unit: "year", count: 1, anchor: "first" }), 1);
    assert.equal(kept({ unit: "day", count: 400, calendar: false }), 5);
    assert.equal(kept({ unit: "quarter", count: 2, anchor: "2025-06-30" }), 2);
});

test("normalize: directions, units, a count only where it counts, flags and anchors", () => {
    const filter = (f) => normalize({ version: 2, filters: [{ field: "Created", type: "relative", blanks: "exclude", ...f }] }, data);
    assert.deepEqual(filter({ direction: "this", unit: "week" }).view.filters[0], {
        field: "Created", type: "relative", direction: "this", unit: "week", calendar: true, includeCurrent: true, anchor: "today", not: false, blanks: "exclude"
    });
    assert.equal(filter({ unit: "day", count: 3, anchor: "2025-06-30T18:30:00Z" }).view.filters[0].anchor, "2025-06-30T18:30:00");
    const codes = (f) => filter(f).issues.map((i) => [i.code, i.params?.suggestion]);
    assert.deepEqual(codes({ direction: "this", unit: "week", count: 2 }), [["filterRelativeCount", undefined]]);
    // the count as written, and a missing count named as missing
    const count = (f) => filter(f).issues.map((i) => [i.message, i.params?.value]);
    assert.deepEqual(count({ unit: "month", count: "3" }), [["needs a whole count from 1 to 500", "3"]]);
    assert.deepEqual(count({ direction: "this", unit: "week", count: 2 }), [['"this" is the current unit alone and has no count', "2"]]);
    assert.deepEqual(count({ direction: "next", unit: "month" }), [["count is missing: a whole count from 1 to 500", undefined]]);
    assert.deepEqual(codes({ direction: "lats", unit: "week", count: 2 }), [["filterRelativeDirection", "last"]]);
    assert.deepEqual(codes({ unit: "weeks", count: 2 }), [["filterRelativeUnit", "week"]]);
    assert.deepEqual(codes({ unit: "week", count: 2, anchor: "lastest" }), [["filterRelativeAnchor", "latest"]]);
    assert.deepEqual(codes({ unit: "week", count: 2, calendar: "yes" }), [["unknownSetting", undefined]]);
    assert.deepEqual(validate({ version: 2, formatting: { weekStart: 0 } }, data).errors.map((e) => e.path), ["formatting.weekStart"]);
    assert.equal(normalize({ formatting: { weekStart: 7 } }, data).view.formatting.weekStart, 7);
    assert.equal(normalize({}, data).view.formatting.weekStart, 1);
});
