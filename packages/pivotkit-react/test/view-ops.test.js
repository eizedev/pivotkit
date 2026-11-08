import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize, toGrid } from "pivotkit-core";
import {
    addField, defaultAgg, filterZoneFields, groupField, isEmptyView, isFiltered, moveField, removeAt, reorder,
    selectedItems, setChart, setSort, swapAxes, toggleCollapsed, numberRange, withHostOrders, zoneOverLimit,
    setChartDisplay, rowFolding, numericResult, sameRef, headerSortTarget, headerSortState, nextHeaderSort, sortEntry
} from "../src/view-ops.js";
import {
    binProblem, filterState, hasFilter, measureChoices, removeFilters, setItemFilter, setLabelFilter, setTopFilter,
    setValueFilter, totalNoEffect, TOTALS, updateValue, withMeasure
} from "../src/menu-ops.js";
import { refLabel, sortText, valueConditionText } from "../src/names.js";
import { LABELS, fill } from "../src/labels.js";
import { en as menuEn } from "../src/menu-labels.js";
import { de as menuDe } from "../src/menu-labels-de.js";
import { CHART_TYPES, CHART_TYPE_NAMES, chartTypeOf } from "../src/chart-types.js";

const data = encode([
    { Region: "North", Product: "A", Units: 3, Date: "2026-01-05" },
    { Region: "South", Product: "B", Units: 7, Date: "2026-02-14" },
    { Region: "West", Product: "A", Units: 1, Date: "2026-02-20" }
]);
const norm = (v) => normalize(v, data).view;
// the labels the menus see (menuLabels): the first load's with the menus' own texts
const MENU = { en: { ...LABELS.en, ...menuEn }, de: { ...LABELS.de, ...menuDe } };
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
    assert.deepEqual([c.display, c.chart], ["chart", { type: "bar", stacked: true, horizontal: false, valueLabels: "auto", legend: "auto", title: null, smooth: false, axisLabels: "auto", groupLabels: "auto", labelPosition: "outside" }]);
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
    const shown = setChartDisplay(v, { valueLabels: "value", legend: "bottom", title: "Units", smooth: true, axisLabels: "auto", groupLabels: "auto", labelPosition: "inside" });
    // the type stays the view's default: automatic, until the user picks one
    assert.deepEqual(shown.chart, { type: "auto", stacked: false, horizontal: false, valueLabels: "value", legend: "bottom", title: "Units", smooth: true, axisLabels: "auto", groupLabels: "auto", labelPosition: "inside" });
    // the display mode is the user's: a setting does not switch to the chart
    assert.equal(shown.display, "table");
    const line = setChart(shown, "line");
    assert.deepEqual([line.chart.type, line.chart.title, line.chart.legend, line.chart.smooth], ["line", "Units", "bottom", true]);
    assert.deepEqual(norm(line).chart, line.chart);
    // "Automatic" again: the data decides once more, the display settings stay
    const auto = setChart(line, "auto");
    assert.deepEqual([auto.chart.type, auto.chart.stacked, auto.chart.horizontal, auto.chart.title], ["auto", false, false, "Units"]);
    assert.deepEqual(norm(auto).chart, auto.chart);
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

test("the menu says what a filter keeps, in short: shown of total, the text condition, the value condition", () => {
    const labels = MENU.en;
    let v = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    assert.equal(filterState(v, "Region", null, labels, "en-US"), null);
    v = setLabelFilter(v, "Region", { op: "contains", value: "or" });
    assert.equal(filterState(v, "Region", { summary: { shown: 15, total: 1045 } }, labels, "en-US"), "15 of 1,045, contains “or”");
    // each language its own quotation marks (labels.quote)
    assert.equal(filterState(v, "region", null, MENU.de, "de-DE"), "enthält „or“");
    assert.equal(filterState(v, "Region", null, { ...MENU.en, quote: "«{text}»" }, "fr-FR"), "contains «or»");
    v = norm(setValueFilter(v, "Region", { by: { field: "Units", agg: "sum" }, op: ">", value: 1000 }));
    assert.equal(filterState(v, "Region", null, labels, "en-US"), "Sum of Units > 1,000, contains “or”");
    assert.equal(filterState(v, "Region", null, MENU.de, "de-DE"), "Summe von Units > 1.000, enthält „or“");
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

test("editing one value condition or top N keeps the field's other ones of that type", () => {
    const units = { field: "Units", agg: "sum" };
    const v = norm({
        rows: ["Region"],
        values: [units],
        filters: [
            { field: "Region", type: "value", op: ">", value: 1, by: units },
            { field: "Region", type: "value", op: "<", value: 9, by: units },
            { field: "Region", type: "top", count: 2, by: units },
            { field: "Region", type: "top", count: 1, bottom: true, by: units }
        ]
    });
    const [first, second] = v.filters.filter((f) => f.type === "value");
    const edited = setValueFilter(v, "Region", { by: units, op: ">=", value: 2 }, first);
    assert.deepEqual(edited.filters.filter((f) => f.type === "value").map((f) => [f.op, f.value]), [[">=", 2], ["<", 9]]);
    const cleared = setValueFilter(v, "Region", null, first);
    assert.deepEqual(cleared.filters.filter((f) => f.type === "value"), [second]);
    const [top] = v.filters.filter((f) => f.type === "top");
    const topEdited = setTopFilter(v, "Region", { count: 5, bottom: false, by: units }, top);
    assert.deepEqual(topEdited.filters.filter((f) => f.type === "top").map((f) => [f.count, f.bottom]), [[5, false], [1, true]]);
    // a new one, without a previous entry, goes after the field's filters
    const added = setValueFilter(norm({ rows: ["Region"], values: [units] }), "Region", { by: units, op: ">", value: 0 }, undefined);
    assert.equal(added.filters.length, 1);
    // the last filter of a field in the Filters zone leaves it there, filtering nothing
    let z = addField(norm({ values: [units] }), "Product", "filters");
    z = norm(setValueFilter(z, "Product", { by: units, op: ">", value: 0 }));
    assert.deepEqual(setValueFilter(z, "Product", null, z.filters.find((f) => f.type === "value")).filters, [{ field: "Product", type: "exclude", items: [] }]);
});

test("a measure the view no longer shows stays a choice, so applying again keeps it", () => {
    const choices = [{ field: "Units", agg: "sum" }];
    assert.equal(withMeasure(choices, { field: "units", agg: "sum" }), choices);
    assert.deepEqual(withMeasure(choices, { field: "Units", agg: "max" }), [...choices, { field: "Units", agg: "max" }]);
    assert.equal(withMeasure(choices, null), choices);
});

test("between is written with the smaller number first, as the engine compares", () => {
    const v = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    assert.equal(valueConditionText(v, { op: "between", value: 10, value2: 2 }, LABELS.en, "en-US"), "Sum of Units between 2 and 10");
    assert.equal(valueConditionText(v, { op: "notBetween", value: 1000.5, value2: -3 }, LABELS.de, "de-DE"), "Summe von Units nicht zwischen -3 und 1.000,5");
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
    // every reason rowFolding returns is a key of the menus' texts (the Options menu shows it), in both languages
    const reasons = new Set([one, two, some, all].flatMap((v) => Object.values(rowFolding(v, outer).why)).concat(Object.values(rowFolding(one, []).why)).filter(Boolean));
    assert.deepEqual([...reasons].sort(), ["collapseAllDone", "collapseNeedsRows", "expandNothing"]);
    for (const key of reasons) {
        assert.equal(typeof MENU.en[key], "string", key);
        assert.equal(typeof MENU.de[key], "string", key);
        assert.ok(Object.hasOwn(menuEn, key) && Object.hasOwn(menuDe, key), `${key} is not a menu text`);
    }
});

test("a total that would change nothing in the view is named with the reason", () => {
    const none = norm({ values: [{ field: "Units", agg: "sum" }] });
    assert.deepEqual(TOTALS.map((k) => totalNoEffect(none, k)), ["needsRowField", "needsColField", "needsRowFields", "needsColFields"]);
    const one = norm({ rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] });
    assert.deepEqual(TOTALS.map((k) => totalNoEffect(one, k)), [null, null, "needsRowFields", "needsColFields"]);
    const two = norm({ rows: ["Region", "Product"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] });
    assert.equal(totalNoEffect(two, "rowSubtotals"), null);
    for (const key of ["needsRowField", "needsColField", "needsRowFields", "needsColFields"]) {
        assert.equal(typeof MENU.en[key], "string");
        assert.equal(typeof MENU.de[key], "string");
    }
});

test("a table header sorts: a value's header the innermost row field by it, a row field's name by label (#55)", () => {
    const typeOf = (f) => data.schema.fields.find((x) => x.name === f)?.type;
    const headers = (v) => {
        const grid = toGrid(computePivot(data, v));
        return grid.rows[grid.headerRows - 1].filter(Boolean);
    };
    const units = { field: "Units", agg: "sum" };
    // one value, no column field: its header sorts the innermost row field (Product), the corner names sort themselves
    let v = norm({ rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum" }] });
    const targets = headers(v).map((c) => headerSortTarget(v, c, typeOf));
    assert.deepEqual(targets, [{ field: "Region" }, { field: "Product" }, { field: "Product", ref: units }]);
    // with a column field and two values: only the grand total column's value headers sort
    v = norm({ rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }, { agg: "count" }] });
    const sortable = headers(v).map((c) => headerSortTarget(v, c, typeOf)).filter((t) => t?.ref);
    assert.deepEqual(sortable, [{ field: "Region", ref: units }, { field: "Region", ref: { field: null, agg: "count" } }]);
    // no row field, a value that gives no number, a column field's name: nothing to sort
    assert.equal(headerSortTarget(norm({ values: [{ field: "Units", agg: "sum" }] }), { kind: "colHeader", valueIndex: 0, colPath: [] }, typeOf), null);
    const listed = norm({ rows: ["Region"], values: [{ field: "Product", agg: "listUnique" }] });
    assert.equal(headerSortTarget(listed, { kind: "colHeader", valueIndex: 0, colPath: [] }, typeOf), null);
    assert.equal(headerSortTarget(norm({ rows: ["Region"], cols: ["Product"] }), { kind: "corner", field: "Product" }, typeOf), null);
});

test("a click on a value's header: largest first, smallest first, the default order; on a row field's name: A to Z and Z to A (#55)", () => {
    const units = { field: "Units", agg: "sum" };
    const byValue = { field: "Region", ref: units };
    const click = (v, target, hostOrdered = false) => setSort(v, target.field, nextHeaderSort(v, target, hostOrdered));
    let v = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    assert.deepEqual(headerSortState(v, byValue), { order: null, chosen: false });
    v = click(v, byValue);
    assert.deepEqual(v.sort, [{ field: "Region", by: "value", order: "desc", value: units }]);
    assert.deepEqual(headerSortState(v, byValue), { order: "descending", chosen: true });
    v = click(v, byValue);
    assert.deepEqual(v.sort, [{ field: "Region", by: "value", order: "asc", value: units }]);
    assert.deepEqual(headerSortState(v, byValue), { order: "ascending", chosen: true });
    v = click(v, byValue);
    assert.deepEqual(v.sort, []);
    // the row field's name: the default A to Z (no entry, not chosen), then Z to A, then A to Z (the entry goes, as the chip menu's)
    const byLabel = { field: "Region" };
    assert.deepEqual(headerSortState(v, byLabel), { order: "ascending", chosen: false });
    v = click(v, byLabel);
    assert.deepEqual(v.sort, [{ field: "Region", by: "label", order: "desc" }]);
    assert.deepEqual(headerSortState(v, byLabel), { order: "descending", chosen: true });
    assert.deepEqual(click(v, byLabel).sort, []);
    // from a sort by a value the name goes to A to Z; the value's header to largest first
    v = click(click(v, byValue), byLabel);
    assert.deepEqual(v.sort, []);
    // a field with the host's order: A to Z stays an entry, and a value's sort turned off gives the field's default back
    const custom = setSort(v, "Region", { by: "custom", order: "asc", items: ["West"] });
    assert.deepEqual(headerSortState(custom, byLabel), { order: "other", chosen: false });
    assert.deepEqual(nextHeaderSort(custom, byLabel, true), { by: "label", order: "asc" });
    assert.deepEqual(nextHeaderSort(custom, byLabel, false), null);
    assert.deepEqual(headerSortState(custom, byValue), { order: null, chosen: false });
});

test("sortEntry: A to Z is no entry unless the field has the host's order", () => {
    assert.equal(sortEntry({ by: "label", order: "asc" }), null);
    assert.deepEqual(sortEntry({ by: "label", order: "asc" }, true), { by: "label", order: "asc" });
    assert.deepEqual(sortEntry({ by: "label", order: "desc" }), { by: "label", order: "desc" });
});

test("sortText names a sort as the chip menu does", () => {
    const v = norm({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    const en = LABELS.en;
    assert.equal(sortText(v, { by: "value", order: "desc", value: { field: "Units", agg: "sum" } }, en), "Largest Sum of Units first");
    assert.equal(sortText(v, { by: "label", order: "desc" }, en), "Z to A");
    assert.equal(sortText(v, { by: "custom", order: "asc" }, en), "Custom order");
    assert.equal(fill(LABELS.de.headerSorted, { field: "Region", order: sortText(v, { by: "label", order: "asc" }, LABELS.de) }), "Region sortiert: A bis Z");
});
