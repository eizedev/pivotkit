// The names the report gives things (names.js): a value's name, what a field of the field list says,
// the compact layout's line and a date grouping in words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LABELS } from "../src/labels.js";
// the German first-load texts: pivotkit-react adds them as it loads (deferred.js)
import "../src/deferred.js";
import { fieldAction, groupingName, layoutSummary, valueLabel } from "../src/names.js";

const en = LABELS.en;

test("value names: plain aggregator words, show-as renames the value", () => {
    assert.equal(valueLabel({ field: "Revenue", agg: "sum" }, en), "Sum of Revenue");
    assert.equal(valueLabel({ field: "Revenue", agg: "sum", showAs: { type: "percentOfGrandTotal" } }, en), "% of grand total of Revenue");
    assert.equal(valueLabel({ field: "Hours", agg: "stdev" }, en), "Standard deviation (sample) of Hours");
    assert.equal(valueLabel({ field: "Umsatz", agg: "average", showAs: { type: "rankDescending" } }, LABELS.de), "Rang (größter zuerst) von Durchschnitt von Umsatz");
    assert.equal(valueLabel({ field: "X", agg: "sum", label: "Own" }, en), "Own");
    // no Excel abbreviations in either language
    for (const lang of [LABELS.en, LABELS.de]) {
        for (const name of Object.values(lang.core.aggregators)) assert.doesNotMatch(name, /StdAbw|StdDev|VarP|VarianzN|^Min$|^Max$/, name);
    }
});

test("a field of the field list says where it is and what a click on it does", () => {
    const at = (type, zones, labels = en) => {
        const a = fieldAction("Priority", type, zones, labels);
        return [a.kind, a.zone, a.name, a.description];
    };
    assert.deepEqual(at("string", []), ["add", "rows", "Priority", "Add to Rows"]);
    // in Columns: a click moves it to Rows, it is not added a second time
    assert.deepEqual(at("string", ["cols"]), ["move", "rows", "Priority, in Columns", "Move to Rows"]);
    assert.deepEqual(at("date", ["filters"]), ["move", "rows", "Priority, in Filters", "Move to Rows"]);
    // in Rows already: a click does nothing, so there is nothing to describe
    assert.deepEqual(at("string", ["rows"]), [null, "rows", "Priority, in Rows", ""]);
    // counted in Values, not on an axis: a click adds it to Rows
    assert.deepEqual(at("string", ["values"]), ["add", "rows", "Priority, in Values", "Add to Rows"]);
    // a number goes to Values; in Values already, a click adds no second value (that is the menu's
    // "Add to Values again"), so a repeated Enter cannot pile up "Count of Ticket 2", "3", ...
    assert.deepEqual(at("number", ["rows"]), ["add", "values", "Priority, in Rows", "Add to Values"]);
    assert.deepEqual(at("number", ["cols"]), ["add", "values", "Priority, in Columns", "Add to Values"]);
    assert.deepEqual(at("number", ["values", "rows"]), [null, "values", "Priority, in Values, Rows", ""]);
    assert.deepEqual(at("number", ["values"], LABELS.de), [null, "values", "Priority, in Werte", ""]);
    assert.deepEqual(at("string", ["cols"], LABELS.de), ["move", "rows", "Priority, in Spalten", "Nach Zeilen verschieben"]);
});

test("the compact layout's one line names every zone with fields, rows first", () => {
    const entries = { filters: [{ text: "Status" }], cols: [{ text: "Priority" }], rows: [{ text: "Team" }, { text: "Channel" }], values: [] };
    assert.deepEqual(layoutSummary(entries, en), [
        { zone: "rows", title: "Rows", fields: "Team, Channel" },
        { zone: "cols", title: "Columns", fields: "Priority" },
        { zone: "filters", title: "Filters", fields: "Status" }
    ]);
    assert.deepEqual(layoutSummary({ filters: [], cols: [], rows: [], values: [] }, LABELS.de), []);
});

test("a date grouping is named in words: Date by month, Datum nach Monat", () => {
    assert.equal(groupingName("Date", "yearMonth", LABELS.en), "Date by month");
    assert.equal(groupingName("Date", "month", LABELS.en), "Date by month of year");
    assert.equal(groupingName("Datum", "yearMonth", LABELS.de), "Datum nach Monat");
    assert.equal(groupingName("Amount", "bin", LABELS.en, 100), "Amount (by 100)");
    // a host's labels without unitInName: the unit's own name
    assert.equal(groupingName("Date", "year", { ...LABELS.en, unitInName: undefined }), "Date by Year");
});
