import {test} from "node:test";
import assert from "node:assert/strict";
import {isoDay,dayText,periodText,rangeShare,wholeYears,compareText} from "../src/names.js";
test("date summaries preserve the complete ISO day and year",()=>{
    assert.equal(isoDay(Date.parse("+010000-02-29")),"+010000-02-29");
    assert.match(dayText("+010000-02-29","en-US"),/29/);
    assert.equal(periodText({from:"+010000-01-01",to:"+010001-12-31"},"year","en-US"),"10000–10001");
    assert.deepEqual(wholeYears("-000001-01-01","0002-12-31"),[-1,2]);
    assert.equal(rangeShare({from:"9999-01-01",to:"+010000-12-31"},"year",{min:Date.parse("9999-01-01"),max:Date.parse("+010000-12-31")},"en-US", "2027-01-01"),null);
});

test("maximum partial year/month share does not overflow Date (#97)", () => {
    const range = {from: "+275760-09-01", to: "+275760-09-13"};
    for (const unit of ["year", "month"]) assert.equal(rangeShare(range, unit, {min: Date.parse(range.from), max: 8.64e15}, "en-US", "2027-01-01"), null);
});

test("minimum-date partial year/month is clamped before range intersection", () => {
    const span = {min: -8.64e15, max: -8.64e15};
    for (const unit of ["year", "month"]) {
        assert.equal(rangeShare({from: "-271821-04-20", to: "-271821-04-20"}, unit, span, "en-US", "2027-01-01"), null);
        assert.deepEqual(rangeShare({from: "2026-01-01", to: "2026-12-31"}, unit, span, "en-US", "2027-01-01"), {none: true});
    }
});

test("view-v2 quarter and minute ranges retain complete expanded years", () => {
    const range = {from: "+010000-02-01T12:00", to: "+010000-05-01T14:00"};
    assert.equal(periodText(range, "quarter", "en-US"), "Q1 10000–Q2 10000");
    assert.match(periodText(range, "month", "en-US"), /Feb/);
});


test("timed BCE comparisons retain era and differ from CE", async () => {
    const {resolveLabels} = await import("../src/labels.js");
    const {menuLabels} = await import("../src/menu-labels.js");
    const labels = menuLabels(resolveLabels("en-US"));
    const text = (value) => compareText({op: "=", value, precision: "hour"}, labels, "en-US", {date: true});
    assert.match(text("-000001-01-01T12:00"), /BC/);
    assert.notEqual(text("-000001-01-01T12:00"), text("0002-01-01T12:00"));
});

test("quick choices count whole expanded days but only one minute for timed bounds", async () => {
    const {rowsInRange} = await import("../src/menu-ops.js");
    const day = "+010000-02-29";
    const dict = [Date.parse(`${day}T00:00Z`), Date.parse(`${day}T12:00Z`), Date.parse("+010000-03-01T00:00Z")];
    assert.equal(rowsInRange({from: day, to: day}, dict, [1, 2, 4]), 3);
    assert.equal(rowsInRange({from: `${day}T00:00`, to: `${day}T00:00`}, dict, [1, 2, 4]), 1);
});

test("month comparisons distinguish BCE from CE", async () => {
    const {resolveLabels} = await import("../src/labels.js");
    const {menuLabels} = await import("../src/menu-labels.js");
    const labels = menuLabels(resolveLabels("en-US"));
    const text = value => compareText({op:"=",value,precision:"month"}, labels, "en-US", {date:true});
    assert.match(text("-000001-01-01"), /BC/);
    assert.notEqual(text("-000001-01-01"), text("0002-01-01"));
});
