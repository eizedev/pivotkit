// The pure parts of the UI: the history with its notes, the keyboard moves of drag and drop, what a
// screen reader hears, the chart's text alternative and hints, file names and labels from a host.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toSeries } from "pivotkit-core";
import { chartHints, chartSummary } from "../src/chart-summary.js";
import { MANY_SERIES, MAX_CATEGORIES } from "../src/chart-types.js";
import { announcementsOf, nextTarget } from "../src/dnd-moves.js";
import { dataUrlToBlob, safeFileName } from "../src/files.js";
import { LABELS, resolveLabels } from "../src/labels.js";
import { valueLabel } from "../src/names.js";
import { HISTORY_LIMIT, createState, record, redo, reset, settle, undo } from "../src/view-history.js";

const en = LABELS.en;

test("history: steps with notes, undo and redo say what they did, reset is a step", () => {
    let s = createState("schema", "start");
    s = record(s, "a", "Region added to Rows");
    s = record(s, "b", "Region removed");
    assert.equal(record(s, "b", "nothing"), s, "an unchanged view is no step");
    const u = undo(s);
    assert.deepEqual([u.state.present, u.note], ["a", "Region removed"]);
    const r = redo(u.state);
    assert.deepEqual([r.state.present, r.note], ["b", "Region removed"]);
    assert.equal(undo(createState("x", "y")).note, null);
    const back = reset(s, "back to the start view");
    assert.equal(back.present, "start");
    assert.equal(undo(back).state.present, "b", "a reset can be undone");
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = record(s, `v${i}`, `step ${i}`);
    assert.equal(s.past.length, HISTORY_LIMIT);
});

test("history: the host passing back what it got changes nothing; another view is a step; a new schema starts over", () => {
    let s = record(createState("schema", "start"), "a", "first");
    const at = (shown, schema = "schema") => ({ schema, start: "start", shown, outside: "change from outside" });
    assert.equal(settle(s, at("a")), s, "the same view: the history stays as it is");
    const outside = settle(s, at("loaded"));
    assert.deepEqual([outside.present, outside.past.length, undo(outside).note], ["loaded", 2, "change from outside"]);
    const fresh = settle(s, at("renormalized", "other"));
    assert.deepEqual([fresh.schema, fresh.present, fresh.past.length, fresh.start], ["other", "renormalized", 0, "start"]);
});

test("keyboard drag: left and right through a zone's positions, up and down through the zones", () => {
    const targets = [
        { id: "zone:filters", zone: "filters", kind: "zone" },
        { id: "zone:cols", zone: "cols", kind: "zone" },
        { id: "chip:rows:A", zone: "rows", kind: "chip", index: 0 },
        { id: "chip:rows:C", zone: "rows", kind: "chip", index: 2 },
        { id: "zone:rows", zone: "rows", kind: "zone" },
        { id: "zone:values", zone: "values", kind: "zone" }
    ];
    const field = { kind: "field" };
    // a field from the field list starts in Rows, at the end
    assert.equal(nextTarget("ArrowRight", targets, null, field), "zone:rows");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "zone" }, field), "chip:rows:C");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "chip", index: 2 }, field), "chip:rows:A");
    assert.equal(nextTarget("ArrowLeft", targets, { zone: "rows", kind: "chip", index: 0 }, field), null, "the first position");
    assert.equal(nextTarget("ArrowUp", targets, { zone: "rows", kind: "chip", index: 0 }, field), "zone:cols");
    assert.equal(nextTarget("ArrowUp", targets, { zone: "cols", kind: "zone" }, field), "zone:filters");
    assert.equal(nextTarget("ArrowDown", targets, { zone: "rows", kind: "zone" }, field), "zone:values");
    assert.equal(nextTarget("ArrowDown", targets, { zone: "values", kind: "zone" }, field), null);
    // the chip B (index 1) of Rows, not over anything yet: left is before A, right is before C
    const chip = { kind: "chip", zone: "rows", index: 1 };
    assert.equal(nextTarget("ArrowLeft", targets, null, chip), "chip:rows:A");
    assert.equal(nextTarget("ArrowRight", targets, null, chip), "chip:rows:C");
    assert.equal(nextTarget("ArrowUp", targets, null, chip), "zone:cols");
});

test("drag announcements name the zone and the position", () => {
    const a = announcementsOf(en);
    const active = { data: { current: { kind: "field", label: "Region" } } };
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "chip", zone: "rows", index: 1, count: 2 } } } }), "Region is over Rows, position 2 of 3.");
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "zone", zone: "cols", count: 0 } } } }), "Region is over Columns, at the end.");
    assert.equal(a.onDragOver({ active, over: null }), "Region is not over a zone.");
    assert.equal(a.onDragOver({ active, over: { data: { current: { kind: "panel" } } } }), "Region is not over a zone.", "a field still in the list");
    const chip = { data: { current: { kind: "chip", zone: "rows", index: 0, label: "Region" } } };
    assert.equal(a.onDragEnd({ active: chip, over: { data: { current: { kind: "chip", zone: "rows", index: 1, count: 2 } } } }), "Region dropped in Rows, position 2 of 2.");
    assert.equal(a.onDragEnd({ active: chip, over: { data: { current: { kind: "panel" } } } }), "Region removed");
    assert.match(en.dragInstructions, /menu/, "the instructions name the menu as the other way");
});

test("the chart's text alternative names type, values, counts and extremes", () => {
    const rows = [{ R: "North", P: "A", V: 5 }, { R: "South", P: "A", V: 9 }, { R: "South", P: "B", V: 1 }];
    const r = computePivot(encode(rows), { rows: ["R"], cols: ["P"], values: [{ field: "V", agg: "sum" }] });
    const s = toSeries(r);
    const text = chartSummary(s, { type: "bar", rows: ["R"], valueNames: ["Sum of V"], labels: en, locale: "en-US" });
    assert.equal(text, "Bars: Sum of V by R. 2 categories, 2 series. Highest 9 at South / A; lowest 1 at South / B. Switch to Table to read every value.");
    const de = chartSummary(s, { type: "line", rows: ["R"], valueNames: ["Summe von V"], labels: LABELS.de, locale: "de-DE" });
    assert.match(de, /^Linien: Summe von V nach R\. 2 Kategorien, 2 Reihen\./);
});

test("chart hints: many series, dates on columns for lines, the category cap", () => {
    const rows = [];
    for (let c = 0; c < MANY_SERIES + 2; c++) rows.push({ R: "r", C: `c${c}`, V: c });
    const many = toSeries(computePivot(encode(rows), { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }] }));
    assert.deepEqual(chartHints(many, { type: "bar", datesOnColumnsOnly: false, labels: en, locale: "en-US" }).map((h) => [h.id, h.swap]), [["series", true]]);
    assert.deepEqual(chartHints(many, { type: "pie", datesOnColumnsOnly: false, labels: en, locale: "en-US" }), [], "a pie has no series to tell apart");
    assert.deepEqual(chartHints(many, { type: "line", datesOnColumnsOnly: true, labels: en, locale: "en-US" }).map((h) => h.id), ["dates"]);
    const wide = Array.from({ length: MAX_CATEGORIES + 5 }, (_, i) => ({ K: `k${i}`, V: i }));
    const capped = toSeries(computePivot(encode(wide), { rows: ["K"], values: [{ field: "V", agg: "sum" }] }), { maxCategories: MAX_CATEGORIES });
    const hints = chartHints(capped, { type: "bar", datesOnColumnsOnly: false, labels: en, locale: "en-US" });
    assert.equal(hints.at(-1).text, `Showing the first ${MAX_CATEGORIES} of ${MAX_CATEGORIES + 5} categories. Add a filter or Top N to choose them.`);
});

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

test("file names: no path, no reserved characters or names", () => {
    assert.equal(safeFileName("report"), "report");
    assert.equal(safeFileName("../../etc/passwd"), "etc-passwd");
    assert.equal(safeFileName("C:\\\\temp\\\\x"), "C-temp-x");
    assert.equal(safeFileName('a<b>c:"d|e?*'), "a-b-c-d-e-");
    assert.equal(safeFileName("CON"), "pivot");
    assert.equal(safeFileName(""), "pivot");
    assert.equal(safeFileName(42), "pivot");
    assert.equal(safeFileName("x".repeat(300)).length, 120);
});

test("a data: URL becomes a Blob without fetch()", async () => {
    const png = dataUrlToBlob("data:image/png;base64,iVBORw0KGgo=");
    assert.equal(png.type, "image/png");
    assert.deepEqual([...new Uint8Array(await png.arrayBuffer())].slice(1, 4).map((c) => String.fromCharCode(c)).join(""), "PNG");
    assert.equal(await dataUrlToBlob("data:text/plain,a%20b").text(), "a b");
    assert.throws(() => dataUrlToBlob("https://example.com/x.png"), TypeError);
});

test("labels from a host: wrong types are ignored, not merged", () => {
    const l = resolveLabels("en", { emptySteps: "not a list", zones: { rows: 5, cols: "Spalten" }, undo: null, unknownKey: "x", lang: "fr" });
    assert.deepEqual(l.emptySteps, en.emptySteps);
    assert.deepEqual([l.zones.rows, l.zones.cols, l.undo, l.lang], ["Rows", "Spalten", "Undo", "fr"]);
    assert.equal(/** @type {any} */ (l).unknownKey, undefined);
    assert.deepEqual(resolveLabels("en", { emptySteps: ["One", "Two"] }).emptySteps, ["One", "Two"]);
    assert.deepEqual(resolveLabels("en", { emptySteps: [1, 2] }).emptySteps, en.emptySteps);
});
