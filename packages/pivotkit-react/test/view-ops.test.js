import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize } from "pivotkit-core";
import {
    addField, defaultAgg, filterZoneFields, groupField, isEmptyView, isFiltered, moveField, removeAt, reorder,
    selectedItems, setChart, setItemFilter, setLabelFilter, setSort, setTopFilter, swapAxes, toggleCollapsed, updateValue,
    binProblem, numberRange, withHostOrders, zoneOverLimit, setChartDisplay, removeFilters, hasFilter, rowFolding,
    setValueFilter, measureChoices, numericResult, sameRef
} from "../src/view-ops.js";
import { filterText, refLabel, valueConditionText } from "../src/names.js";
import { LABELS } from "../src/labels.js";
import { CHART_TYPES, CHART_TYPE_NAMES, chartTypeOf } from "../src/chart-types.js";

const data = encode([
    { Region: "North", Product: "A", Units: 3, Date: "2026-01-05" },
    { Region: "South", Product: "B", Units: 7, Date: "2026-02-14" },
    { Region: "West", Product: "A", Units: 1, Date: "2026-02-20" }
]);
const norm = (v) => normalize(v, data).view;
const empty = norm({});

test("adding a field: an axis takes it from the other axis, Values adds a value, Filters an empty filter", () => {
    let v = addField(empty, "Region", "rows");
    assert.deepEqual(v.rows, ["Region"]);
    v = addField(v, "Region", "cols");
    assert.deepEqual([v.rows, v.cols], [[], ["Region"]]);
    v = addField(v, "Units", "values", { type: "number" });
    v = addField(v, "Region", "values", { type: "string" });
    assert.deepEqual(v.values.map((x) => [x.field, x.agg]), [["Units", "sum"], ["Region", "count"]]);
    v = addField(v, "Product", "filters");
    assert.deepEqual(filterZoneFields(norm(v)), ["Product"]);
    assert.deepEqual(norm(v).filters, [{ field: "Product", type: "exclude", items: [] }], "a valid filter that filters nothing");
    assert.equal(isFiltered(v, "Product"), false);
    assert.deepEqual(addField(v, "Product", "rows", { index: 0 }).rows, ["Product"]);
});

test("insert positions and reordering", () => {
    let v = addField(addField(empty, "Region", "rows"), "Product", "rows", { index: 0 });
    assert.deepEqual(v.rows, ["Product", "Region"]);
    v = reorder(v, "rows", 0, 1);
    assert.deepEqual(v.rows, ["Region", "Product"]);
    assert.equal(reorder(v, "rows", 5, 0), v, "an index outside the zone changes nothing");
});

test("removing takes the field's filters and sort with it; removing a value leaves the axes", () => {
    let v = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Region", type: "exclude", items: ["West"] }], sort: [{ field: "Region", order: "desc" }] });
    const noRegion = removeAt(v, "rows", 0);
    assert.deepEqual([noRegion.rows, noRegion.filters, noRegion.sort], [[], [], []]);
    v = removeAt(v, "values", 0);
    assert.deepEqual([v.rows, v.values], [["Region"], []]);
    const f = norm({ filters: [{ field: "Product", type: "include", items: ["A"] }] });
    assert.deepEqual(removeAt(f, "filters", 0).filters, []);
});

test("moving between zones keeps filters between axes and Filters, and turns a value into an axis field", () => {
    let v = norm({ rows: ["Region"], filters: [{ field: "Region", type: "exclude", items: ["West"] }], values: [{ field: "Product", agg: "count" }] });
    v = moveField(v, "rows", 0, "filters", 0);
    assert.deepEqual([v.rows, filterZoneFields(v), v.filters[0].items], [[], ["Region"], ["West"]]);
    v = moveField(v, "filters", 0, "cols", 0);
    assert.deepEqual([v.cols, v.filters.length], [["Region"], 1]);
    v = moveField(v, "values", 0, "rows", 0);
    assert.deepEqual([v.rows, v.values], [["Product"], []]);
    v = moveField(norm(v), "rows", 0, "values", 0, { type: "string" });
    assert.deepEqual([v.rows, v.values.map((x) => x.agg)], [[], ["count"]]);
});

test("date grouping replaces the field in place and can be removed again", () => {
    const v = norm({ rows: ["Region", "Date"], filters: [{ field: "Date", type: "include", items: ["2026-01-05"] }] });
    const g = groupField(v, "Date", "yearMonth", { name: "Date (month)" });
    assert.equal(g.field, "Date (month)");
    const grouped = norm(g.view);
    assert.deepEqual(grouped.rows, ["Region", "Date (month)"]);
    assert.deepEqual(grouped.derived, [{ name: "Date (month)", field: "Date", by: "yearMonth" }]);
    assert.deepEqual(grouped.filters, [], "a filter on raw dates does not fit the groups");
    const r = computePivot(data, grouped);
    assert.deepEqual(r.rowRoot.children[0].children.map((n) => n.key), [202601]);
    const back = groupField(grouped, "Date (month)", null);
    assert.deepEqual([back.view.rows, back.view.derived], [["Region", "Date"], []]);
});

test("number bins are a derived field with a size", () => {
    const v = norm({ rows: ["Units"] });
    const { view } = groupField(v, "Units", "bin", { size: 5, name: "Units (by 5)" });
    const r = computePivot(data, view);
    assert.deepEqual(r.rowRoot.children.map((n) => n.key), [0, 5]);
});

test("a new range size keeps the ranges' start; a start of its own replaces it", () => {
    const v = norm({ derived: [{ name: "Units (by 2)", field: "Units", by: "bin", size: 2, origin: 1 }], rows: ["Units (by 2)"] });
    const kept = groupField(v, "Units (by 2)", "bin", { size: 3, name: "Units (by 3)" }).view;
    assert.deepEqual(kept.derived, [{ name: "Units (by 3)", field: "Units", by: "bin", size: 3, origin: 1 }]);
    assert.ok(computePivot(data, kept).rowRoot.children.every((n) => n.key === null || (n.key - 1) % 3 === 0));
    const moved = groupField(v, "Units (by 2)", "bin", { size: 3, origin: 0.5, name: "Units (by 3)" }).view;
    assert.equal(moved.derived[0].origin, 0.5);
    // a field grouped for the first time starts at 0
    assert.equal(groupField(norm({ rows: ["Units"] }), "Units", "bin", { size: 3, name: "Units (by 3)" }).view.derived[0].origin, 0);
});

test("item filters exclude what is not selected; selectedItems reads them back", () => {
    const all = ["North", "South", "West"];
    let v = setItemFilter(norm({ rows: ["Region"] }), "Region", ["North", "West"], all);
    assert.deepEqual(norm(v).filters, [{ field: "Region", type: "exclude", items: ["South"] }]);
    assert.deepEqual(selectedItems(norm(v), "Region", all), ["North", "West"]);
    assert.equal(isFiltered(v, "Region"), true);
    v = setItemFilter(v, "Region", all, all);
    assert.deepEqual(v.filters, [], "everything selected is no filter");
    const inc = norm({ filters: [{ field: "Region", type: "include", items: ["South"] }] });
    assert.deepEqual(selectedItems(inc, "Region", all), ["South"]);
    // a field in the Filters zone stays there when its filter is cleared
    const zone = setItemFilter(inc, "Region", all, all);
    assert.deepEqual(filterZoneFields(zone), ["Region"]);
});

test("label conditions and top N", () => {
    let v = setLabelFilter(norm({ rows: ["Region"] }), "Region", { op: "contains", value: "th" });
    assert.deepEqual(computePivot(data, v).rowRoot.children.map((n) => n.key), ["North", "South"]);
    v = setLabelFilter(v, "Region", null);
    v = setTopFilter(norm({ ...v, values: [{ field: "Units", agg: "sum" }] }), "Region", { count: 1, by: { field: "Units", agg: "sum" } });
    assert.deepEqual(computePivot(data, v).rowRoot.children.map((n) => n.key), ["South"]);
    assert.deepEqual(setTopFilter(v, "Region", null).filters, []);
});

test("sort, values, collapse, chart", () => {
    let v = norm({ rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum" }] });
    v = setSort(v, "Region", { by: "value", order: "desc", value: { field: "Units", agg: "sum" } });
    assert.deepEqual(computePivot(data, v).rowRoot.children.map((n) => n.key), ["South", "North", "West"]);
    const avg = updateValue(norm({ ...v, values: [{ field: "Units", agg: "sum", showAs: { type: "runningTotal" } }] }), 0, { agg: "average" });
    assert.equal(avg.values[0].showAs, null, "a running total does not fit an average");
    v = toggleCollapsed(v, "rows", ["North"]);
    assert.deepEqual(v.collapsed.rows, [["North"]]);
    assert.deepEqual(toggleCollapsed(v, "rows", ["North"]).collapsed.rows, []);
    assert.deepEqual(reorder(v, "rows", 0, 1).collapsed.rows, [], "collapsed paths belong to the old field order");
    const c = setChart(v, "stacked");
    assert.deepEqual([c.display, c.chart], ["chart", { type: "bar", stacked: true, horizontal: false, valueLabels: "auto", legend: "auto", title: null, smooth: false, axisLabels: "auto", groupLabels: "auto" }]);
    assert.equal(chartTypeOf(c.chart), "stacked");
    assert.equal(isEmptyView(empty), true);
    assert.equal(defaultAgg("date"), "count");
});

test("a new aggregator keeps the host's format for the field, a user's own format while the unit stays", () => {
    const defaults = { agg: "average", format: "number:1" };
    const at = (format) => norm({ rows: ["Region"], values: [{ field: "Units", agg: "average", format }] });
    // the host's format, set when the value was added or by a template: taken again
    assert.equal(updateValue(at("number:1"), 0, { agg: "median" }, { defaults }).values[0].format, "number:1");
    assert.equal(updateValue(at(null), 0, { agg: "max" }, { defaults }).values[0].format, "number:1");
    // the user's own format stays while the result is still a value of the field
    assert.equal(updateValue(at("number:3"), 0, { agg: "median" }, { defaults }).values[0].format, "number:3");
    // a count is not in the field's unit: neither format fits it
    assert.equal(updateValue(at("number:1"), 0, { agg: "count" }, { defaults }).values[0].format, null);
    assert.equal(updateValue(at("currency:EUR"), 0, { agg: "count" }, { defaults }).values[0].format, null);
    // a format the patch names wins; without the host's settings a new aggregator starts automatic
    assert.equal(updateValue(at("number:1"), 0, { agg: "median", format: "integer" }, { defaults }).values[0].format, "integer");
    assert.equal(updateValue(at(null), 0, { agg: "median" }).values[0].format, null);
    // a host's format for a count applies to counts only
    const counted = norm({ rows: ["Region"], values: [{ field: "Product", agg: "count", format: "integer" }] });
    assert.equal(updateValue(counted, 0, { agg: "countUnique" }, { defaults: { agg: "count", format: "integer" } }).values[0].format, "integer");
});

test("a saved view sorts a field by the host's order when it has no sort entry of its own", () => {
    const orderOf = (field) => (field.toLowerCase() === "product" ? ["B", "A"] : undefined);
    const v = norm({ rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] });
    const ordered = withHostOrders(v, orderOf);
    assert.deepEqual(ordered.sort, [{ field: "Product", by: "custom", order: "asc", items: ["B", "A"] }]);
    assert.deepEqual(computePivot(data, ordered).colRoot.children.map((n) => n.key), ["B", "A"]);
    // an entry of the view wins, "A to Z" included; nothing to add: the same view
    const own = norm({ ...v, sort: [{ field: "Product", by: "label", order: "asc" }] });
    assert.equal(withHostOrders(own, orderOf), own);
    assert.equal(withHostOrders(v, () => undefined), v);
    // a grouping has items of its own
    const grouped = norm({ rows: ["Date (month)"], derived: [{ name: "Date (month)", field: "Date", by: "month" }] });
    assert.equal(withHostOrders(grouped, () => [1, 2]), grouped);
});

test("every result is a view normalize accepts without issues", () => {
    let v = empty;
    const steps = [
        (x) => addField(x, "Region", "rows"),
        (x) => addField(x, "Date", "cols"),
        (x) => groupField(x, "Date", "quarter", { name: "Date (quarter)" }).view,
        (x) => addField(x, "Units", "values", { type: "number" }),
        (x) => addField(x, "Product", "filters"),
        (x) => setItemFilter(x, "Product", ["A"], ["A", "B"]),
        (x) => moveField(x, "cols", 0, "rows", 0),
        (x) => updateValue(x, 0, { showAs: { type: "percentOfGrandTotal", axis: "rows" }, format: "percent:1" })
    ];
    for (const step of steps) {
        v = step(v);
        assert.deepEqual(normalize(v, data).issues, [], JSON.stringify(v));
        v = norm(v);
    }
});

test("the chart type table: every entry round-trips and is a chart type of the core", async () => {
    const { CATALOG } = await import("pivotkit-core");
    for (const name of CHART_TYPE_NAMES) {
        assert.equal(chartTypeOf(CHART_TYPES[name].chart), name);
        assert.ok(CATALOG.chartTypes.includes(CHART_TYPES[name].chart.type), name);
        assert.equal(normalize({ chart: CHART_TYPES[name].chart }, data).issues.length, 0, name);
    }
    assert.equal(chartTypeOf({ type: "bar", stacked: true, horizontal: true }), "horizontal");
    assert.equal(chartTypeOf({ type: "unknown" }), "bar");
    // a stacked area or line of a template is named by its own type, not as bars
    assert.equal(chartTypeOf({ type: "area", stacked: true }), "area");
    assert.equal(chartTypeOf({ type: "line", stacked: true }), "line");
    assert.equal(chartTypeOf({ type: "pie", horizontal: true }), "pie");
});

test("a date placed on an axis or in Filters comes grouped; a value gets the host's defaults", () => {
    let v = addField(empty, "Date", "rows", { type: "date", dateUnit: "yearMonth", groupName: "Date (Month)" });
    assert.deepEqual(v.rows, ["Date (Month)"]);
    assert.deepEqual(v.derived, [{ name: "Date (Month)", field: "Date", by: "yearMonth" }]);
    // placed again elsewhere, the grouping moves instead of staying twice
    v = addField(norm(v), "Date", "cols", { type: "date", dateUnit: "yearMonth", groupName: "Date (Month)" });
    assert.deepEqual([v.rows, v.cols], [[], ["Date (Month)"]]);
    const f = norm(addField(empty, "Date", "filters", { type: "date", dateUnit: "year", groupName: "Date (Year)" }));
    assert.deepEqual(filterZoneFields(f), ["Date (Year)"]);
    assert.deepEqual(normalize(f, data).issues, []);
    const withDefaults = addField(empty, "Units", "values", { type: "number", defaults: { agg: "average", format: "duration:h" } });
    assert.deepEqual([withDefaults.values[0].agg, withDefaults.values[0].format], ["average", "duration:h"]);
    const wrong = addField(empty, "Region", "values", { type: "string", defaults: { agg: "sum", format: "nonsense" } });
    assert.deepEqual([wrong.values[0].agg, wrong.values[0].format], ["count", null], "a default that does not fit is ignored");
    assert.equal(defaultAgg("number", "median"), "median");
});

test("swapping rows and columns takes collapsed groups and calculations along", () => {
    const v = norm({
        rows: ["Region", "Product"], cols: [], collapsed: { rows: [["North"]], cols: [] },
        values: [{ field: "Units", agg: "sum", showAs: { type: "runningTotal", axis: "rows" } }, { field: "Units", agg: "sum", showAs: { type: "percentOfRowTotal" } }]
    });
    const s = swapAxes(v);
    assert.equal(v.collapsed.rows.length, 1);
    assert.deepEqual([s.rows, s.cols, s.collapsed], [[], ["Region", "Product"], { rows: [], cols: [["North"]] }]);
    assert.deepEqual(s.values.map((x) => x.showAs), [{ type: "runningTotal", axis: "cols" }, { type: "percentOfColumnTotal", axis: "cols" }]);
    assert.deepEqual(normalize(s, data).issues, []);
    assert.deepEqual(swapAxes(s).values.map((x) => x.showAs.type), ["runningTotal", "percentOfRowTotal"]);
});

test("a ninth field on an axis is over the limit the core keeps; the UI refuses it instead of losing it", () => {
    const wide = encode([Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`F${i}`, i]))]);
    let view = normalize({}, wide).view;
    for (let i = 0; i < 8; i++) {
        view = addField(view, `F${i}`, "rows");
    }
    assert.equal(zoneOverLimit(view, undefined), null);
    const ninth = addField(view, "F8", "rows");
    assert.deepEqual(zoneOverLimit(ninth, undefined), { zone: "rows", max: 8 });
    // normalize would keep eight and drop the ninth without a word in the UI
    assert.equal(normalize(ninth, wide).view.rows.length, 8);
    assert.deepEqual(zoneOverLimit({ rows: [], cols: ["a", "b", "c"], values: [] }, { axisFields: 2 }), { zone: "cols", max: 2 });
    const values = { rows: [], cols: [], values: Array.from({ length: 17 }, () => ({ agg: "count" })) };
    assert.deepEqual(zoneOverLimit(values, {}), { zone: "values", max: 16 });
    assert.equal(zoneOverLimit(values, { values: 20 }), null);
});

test("a field with the host's custom order is sorted in it when placed on an axis", () => {
    const order = ["West", "North"];
    let v = addField(empty, "Region", "rows", { type: "string", defaults: { order } });
    assert.deepEqual(norm(v).sort, [{ field: "Region", by: "custom", order: "asc", items: ["West", "North"] }]);
    assert.deepEqual(computePivot(data, v).rowRoot.children.map((n) => n.key), ["West", "North", "South"]);
    // moved to Columns, the field keeps its sort; a sort chosen in the view is not replaced
    v = addField(setSort(v, "Region", { by: "label", order: "desc" }), "Region", "cols", { type: "string", defaults: { order } });
    assert.deepEqual(norm(v).sort, [{ field: "Region", by: "label", order: "desc" }]);
    // a date placed grouped has items of its own
    const d = addField(empty, "Date", "rows", { type: "date", dateUnit: "yearMonth", groupName: "Date (Month)", defaults: { order: ["2026-01-05"] } });
    assert.deepEqual(d.sort, []);
});

test("the range form: the numbers of a field, and a start too far from them", () => {
    assert.deepEqual(numberRange(data, "Units"), { min: 1, max: 7 });
    assert.equal(numberRange(data, "Region"), null);
    assert.equal(numberRange(data, "Missing"), null);
    const quakes = { min: 2.5, max: 9.1 };
    assert.equal(binProblem(0.5, 0, quakes), null);
    // far, but the ranges can still be told apart: the same ranges as from 0
    assert.equal(binProblem(0.5, 1e9, quakes), null);
    assert.equal(binProblem(0.5, -1e15, quakes), null);
    // every row would land in "(blank)"
    assert.equal(binProblem(0.5, 1e17, quakes), "far");
    assert.equal(binProblem(0.5, -1e16, quakes), "far");
    assert.equal(binProblem(0.5, 1e17, null), null);
});

test("chart display settings change without the type, and stay when the type changes", () => {
    const v = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    const shown = setChartDisplay(v, { valueLabels: "value", legend: "bottom", title: "Units", smooth: true, axisLabels: "auto", groupLabels: "auto" });
    assert.deepEqual(shown.chart, { type: "bar", stacked: false, horizontal: false, valueLabels: "value", legend: "bottom", title: "Units", smooth: true, axisLabels: "auto", groupLabels: "auto" });
    // the display mode is the user's: a setting does not switch to the chart
    assert.equal(shown.display, "table");
    const line = setChart(shown, "line");
    assert.deepEqual([line.chart.type, line.chart.title, line.chart.legend, line.chart.smooth], ["line", "Units", "bottom", true]);
    assert.deepEqual(norm(line).chart, line.chart);
});

test("Remove filter takes the item list and the text condition, keeps Top N and the field in Filters", () => {
    let v = norm({ rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] });
    v = setItemFilter(v, "Region", ["North"], ["North", "South", "West"]);
    v = setLabelFilter(v, "Region", { op: "contains", value: "o" });
    v = setTopFilter(v, "Region", { count: 2, bottom: false });
    assert.equal(hasFilter(v, "Region"), true);
    const removed = removeFilters(v, "Region");
    assert.deepEqual(removed.filters.map((f) => f.type), ["top"]);
    assert.equal(hasFilter(removed, "Region"), false);
    // Top N alone is no filter here: it has its own control
    assert.equal(hasFilter(setTopFilter(norm({ rows: ["Region"] }), "Region", { count: 1 }), "Region"), false);
    // a field of the Filters zone stays there, filtering nothing
    let z = addField(norm({}), "Product", "filters");
    z = setItemFilter(z, "Product", ["A"], ["A", "B"]);
    assert.deepEqual(removeFilters(z, "Product").filters, [{ field: "Product", type: "exclude", items: [] }]);
    assert.deepEqual(filterZoneFields(removeFilters(z, "Product")), ["Product"]);
});

test("the menu says what a filter keeps: shown of total, the text condition, the value condition", () => {
    const labels = LABELS.en;
    let v = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    assert.equal(filterText(v, "Region", null, labels, "en-US"), null);
    v = setLabelFilter(v, "Region", { op: "contains", value: "or" });
    assert.equal(filterText(v, "Region", { summary: { shown: 15, total: 1045 } }, labels, "en-US"), "Filter: 15 of 1,045, contains “or”");
    assert.equal(filterText(v, "region", null, LABELS.de, "de-DE"), "Filter: enthält “or”");
    v = norm(setValueFilter(v, "Region", { by: { field: "Units", agg: "sum" }, op: ">", value: 1000 }));
    assert.equal(filterText(v, "Region", null, labels, "en-US"), "Filter: Sum of Units > 1,000, contains “or”");
    assert.equal(filterText(v, "Region", null, LABELS.de, "de-DE"), "Filter: Summe von Units > 1.000, enthält “or”");
});

test("a value condition: set, changed, removed; it keeps the field's other filters and names its value", () => {
    const units = { field: "Units", agg: "sum" };
    let v = norm({ rows: ["Region"], values: [units, { field: "Units", agg: "max", label: "Biggest" }] });
    v = setItemFilter(v, "Region", ["North", "South"], ["North", "South", "West"]);
    v = setValueFilter(v, "Region", { by: units, op: ">=", value: 3 });
    const checked = normalize(v, data);
    assert.deepEqual(checked.issues, []);
    assert.deepEqual(checked.view.filters.map((f) => f.type).sort(), ["exclude", "value"]);
    // what the engine keeps: North 3, South 7; West is excluded by the item filter
    const r = computePivot(data, v);
    assert.deepEqual(r.rowRoot.children.map((n) => n.key), ["North", "South"]);
    // between takes a second number; a new condition replaces the old one
    v = setValueFilter(v, "Region", { by: { field: "Units", agg: "max" }, op: "between", value: 2, value2: 5 });
    assert.deepEqual(v.filters.filter((f) => f.type === "value"), [{ field: "Region", type: "value", by: { field: "Units", agg: "max" }, op: "between", value: 2, value2: 5 }]);
    assert.deepEqual(computePivot(data, v).rowRoot.children.map((n) => n.key), ["North"]);
    assert.equal(valueConditionText(v, v.filters.find((f) => f.type === "value"), LABELS.en, "en-US"), "Biggest between 2 and 5");
    assert.equal(valueConditionText(v, { op: "!=", value: 0.5 }, LABELS.de, "de-DE"), "Summe von Units ≠ 0,5");
    assert.equal(hasFilter(v, "Region"), true);
    // Remove filter takes it with the item filter; Clear takes it alone
    assert.deepEqual(removeFilters(v, "Region").filters, []);
    assert.deepEqual(setValueFilter(v, "Region", null).filters.map((f) => f.type), ["exclude"]);
});

test("the measures to sort, rank and filter by: each value that gives numbers, once, the row count without one", () => {
    const typeOf = (f) => data.column(f)?.type;
    const v = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }, { field: "Units", agg: "sum", showAs: { type: "percentOfGrandTotal" } }, { field: "Region", agg: "listUnique" }, { field: "Date", agg: "max" }, { field: "Region", agg: "count" }] });
    assert.deepEqual(measureChoices(v, typeOf), [{ field: "Units", agg: "sum" }, { field: "Region", agg: "count" }]);
    assert.deepEqual(measureChoices(norm({ rows: ["Region"] }), typeOf), [{ field: null, agg: "count" }]);
    assert.equal(numericResult({ agg: "first" }, "string"), false);
    assert.equal(numericResult({ agg: "first" }, "number"), true);
    assert.equal(sameRef({ field: "units", agg: "sum" }, { field: "Units", agg: "sum" }), true);
    assert.equal(sameRef({ field: null, agg: "count" }, { field: "Units", agg: "count" }), false);
    // the name of a measure is the value's, without its "show as"
    assert.equal(refLabel(v, { field: "units", agg: "sum" }, LABELS.en), "Sum of Units");
    assert.equal(refLabel(v, { field: null, agg: "count" }, LABELS.en), LABELS.en.core.countRows);
});

test("sort by a chosen value and top N by a chosen value reach the engine", () => {
    const v0 = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }, { field: "Units", agg: "min" }] });
    const minUnits = { field: "Units", agg: "min" };
    const sorted = setSort(v0, "Region", { by: "value", order: "asc", value: minUnits });
    assert.deepEqual(normalize(sorted, data).view.sort, [{ field: "Region", by: "value", order: "asc", value: minUnits }]);
    const top = setTopFilter(v0, "Region", { count: 1, bottom: true, by: minUnits });
    assert.deepEqual(normalize(top, data).view.filters, [{ field: "Region", type: "top", count: 1, bottom: true, by: minUnits }]);
    assert.deepEqual(computePivot(data, top).rowRoot.children.map((n) => n.key), ["West"]);
});

test("expand all and collapse all are offered only when they change something, and say why not", () => {
    const one = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    assert.deepEqual(rowFolding(one, []), { canExpand: false, canCollapse: false, collapsed: 0, open: 0, why: { expand: "expandNothing", collapse: "collapseNeedsRows" } });
    const two = norm({ rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum" }] });
    const outer = [["North"], ["South"], ["West"]];
    assert.deepEqual(rowFolding(two, outer), { canExpand: false, canCollapse: true, collapsed: 0, open: 3, why: { expand: "expandNothing", collapse: null } });
    const some = toggleCollapsed(two, "rows", ["South"]);
    assert.deepEqual([rowFolding(some, outer).canExpand, rowFolding(some, outer).canCollapse, rowFolding(some, outer).open], [true, true, 2]);
    let all = some;
    for (const p of [["North"], ["West"]]) {
        all = toggleCollapsed(all, "rows", p);
    }
    assert.deepEqual(rowFolding(all, outer), { canExpand: true, canCollapse: false, collapsed: 3, open: 0, why: { expand: null, collapse: "collapseAllDone" } });
    for (const key of ["expandNothing", "collapseNeedsRows", "collapseAllDone"]) {
        assert.equal(typeof LABELS.en[key], "string");
        assert.equal(typeof LABELS.de[key], "string");
    }
});
