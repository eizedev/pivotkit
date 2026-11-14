// Dates before year 1 and after 9999 in the filter's texts and rules: ISO days with a sign and six
// digits ("-000001-01-01", "+010000-01-01"), years written as the table writes them ("2 BC").
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_DATE_MS, computePivot, encode, normalize } from "pivotkit-core";
import { LABELS } from "../src/labels.js";
import { en as menuEn } from "../src/menu-labels.js";
import { combinedYearsText, dateFromInput, dateInputValue, dayOnOrBefore, yearRules } from "../src/menu-ops.js";
import { compareText, isoDay, periodText, rangeShare, wholeYears, yearText } from "../src/names.js";

const L = { ...LABELS.en, ...menuEn };
/** Wall-clock ms of a day in any year. */
const dayMs = (year, month, day) => {
    const d = new Date(0);
    d.setUTCFullYear(year, month - 1, day);
    return d.getTime();
};
const data = encode([{ D: "-000001-06-15" }, { D: "0005-06-15" }, { D: "+010000-06-15" }]);
/** The table's label of a year grouping's key, which the filter's texts must match. */
const tableYear = (year, locale = "en-US") => {
    const r = computePivot(encode([{ D: new Date(dayMs(year, 6, 15)) }]), { rows: ["G"], derived: [{ name: "G", field: "D", by: "year" }], values: [{ agg: "count" }], formatting: { locale } });
    return r.label("rows", r.rowRoot.children[0]);
};

test("an ISO day of any year, and periods written as the table writes their years", () => {
    assert.equal(isoDay(dayMs(-1, 1, 11)), "-000001-01-11");
    assert.equal(isoDay(dayMs(10000, 2, 29)), "+010000-02-29");
    assert.equal(isoDay(dayMs(2026, 3, 1)), "2026-03-01");
    const range = { from: "-000001-01-01", to: "+010000-12-31" };
    assert.equal(periodText(range, "year", "en-US"), `${tableYear(-1)}–10000`);
    assert.equal(tableYear(-1), "2 BC");
    assert.equal(periodText(range, "quarter", "en-US"), "Q1 2 BC–Q4 10000");
    assert.equal(periodText(range, "month", "en-US"), "Jan 2 BC–Dec 10000");
    assert.equal(periodText(range, "day", "en-US"), "Jan 1, 2 BC–Dec 31, 10000");
    assert.equal(periodText({ from: "-000001-01-01", to: "-000001-12-31" }, "year", "de-DE"), tableYear(-1, "de-DE"));
});

test("the data's share of a range across year 0", () => {
    const share = rangeShare({ from: "-000002-01-01", to: "0001-12-31" }, "year", { min: dayMs(-1, 6, 1), max: dayMs(0, 6, 1) }, "en-US");
    assert.deepEqual(share, { none: false, data: "2 BC–1 BC", missing: ["3 BC", "1"], count: 2 });
    assert.equal(rangeShare({ from: "-000001-01-01", to: "0000-12-31" }, "year", { min: dayMs(-1, 6, 1), max: dayMs(0, 6, 1) }, "en-US"), null);
    assert.deepEqual(rangeShare({ from: "+010001-01-01", to: "+010002-12-31" }, "year", { min: dayMs(10000, 1, 1), max: dayMs(10000, 6, 1) }, "en-US"), { none: true });
});

test("comparisons of whole years, and between in time order, for years with a sign", () => {
    assert.deepEqual(wholeYears("-000001-01-01", "+010000-12-31"), [-1, 10000]);
    assert.equal(compareText({ op: "between", value: "-000001-01-01", value2: "0002-12-31" }, L, "en-US", { date: true }), "2 BC to 2");
    assert.equal(compareText({ op: "between", value: "-000001-01-01", value2: "-000001-12-31" }, L, "en-US", { date: true }), "2 BC");
    // the later day given first: the earlier one first, as the engine reads them (not by the sign)
    assert.equal(compareText({ op: "between", value: "0002-01-05", value2: "-000001-01-05" }, L, "en-US", { date: true }), "Jan 5, 2 BC to Jan 5, 2");
    assert.equal(compareText({ op: ">=", value: "+010000-01-01", precision: "year" }, L, "en-US", { date: true }), "from 10000");
    assert.equal(compareText({ op: ">=", value: "-000001-04-01", precision: "quarter" }, L, "en-US", { date: true }), "from Q2 2 BC");
    assert.equal(compareText({ op: ">=", value: "-000001-04-01", precision: "month" }, L, "en-US", { date: true }), "from Apr 2 BC");
});

test("Years combined writes years with a sign, and the first and last year as far as a Date holds", () => {
    const field = "D by month";
    const rules = yearRules(field, [-1, 10000], [-1, 5, 10000]);
    assert.deepEqual(rules.map((r) => [r.value, r.value2, r.not]), [["-000001-01-01", "+010000-12-31", false], ["0000-01-01", "9999-12-31", true]]);
    const view = { rows: [field], derived: [{ name: field, field: "D", by: "month" }], values: [{ agg: "count" }], filters: rules };
    const normalized = normalize(view, data);
    assert.deepEqual(normalized.issues, []);
    assert.equal(computePivot(data, normalized.view).value(computePivot(data, normalized.view).rowRoot, computePivot(data, normalized.view).colRoot, 0), 2);
    const edges = yearRules(field, [-271821, 275760], [-271821, 0, 275760]);
    assert.deepEqual(edges[0].value, isoDay(-MAX_DATE_MS));
    assert.deepEqual(edges[0].value2, isoDay(MAX_DATE_MS));
    assert.deepEqual(normalize({ ...view, filters: edges }, data).issues, []);
    assert.deepEqual(wholeYears(edges[0].value, edges[0].value2), [-271821, 275760]);
});

test("Years combined's summary writes the years as the table does (#351)", () => {
    assert.equal(combinedYearsText([-4, -3, -2], [-4, -3, -2, 5], L, "en-US"), `${tableYear(-4)}–${tableYear(-2)} combined`);
    assert.equal(combinedYearsText([0, 5], [0, 1, 5], L, "en-US"), `${tableYear(0)}, 5 combined`);
    assert.equal(combinedYearsText([0], [0, 5], L, "en-US"), `${tableYear(0)} only`);
    assert.equal(combinedYearsText([2024, 2025], [2024, 2025], L, "en-US"), "2024–2025 combined");
    assert.equal(tableYear(0), yearText(0, "en-US"));
});

test("whether a day is on or before another compares the days, not their text (#351)", () => {
    // as text "-000002" sorts after "-000001" and "+010000" before "2026"
    assert.equal(dayOnOrBefore("-000002-01-01", "-000001-01-01"), true);
    assert.equal(dayOnOrBefore("-000001-01-01", "-000002-01-01"), false);
    assert.equal(dayOnOrBefore("+010000-01-01", "2026-01-01"), false);
    assert.equal(dayOnOrBefore("2026-01-01T10:00", "2026-01-01"), true);
});

test("a reference date in the date field: years after 9999 both ways, years before 1 not offered (#351)", () => {
    // an <input type="date"> holds four or more digits of a year after 0, without a sign
    assert.equal(dateInputValue("2026-03-01"), "2026-03-01");
    assert.equal(dateInputValue("+010000-01-01T00:00"), "10000-01-01");
    assert.equal(dateInputValue("0005-06-15"), "0005-06-15");
    assert.equal(dateInputValue("-000001-06-15"), "");
    assert.equal(dateFromInput("10000-01-01"), "+010000-01-01");
    assert.equal(dateFromInput("2026-03-01"), "2026-03-01");
    assert.equal(dateFromInput("0005-06-15"), "0005-06-15");
    assert.equal(dateFromInput("2026-02-30"), null);
    assert.equal(dateFromInput("0000-01-01"), null);
    assert.equal(dateFromInput("202"), null);
    assert.equal(dateFromInput(""), null);
});
