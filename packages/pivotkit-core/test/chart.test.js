import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError, computePivot, encode, toEChartsOption, toSeries } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const r = computePivot(data, { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], formatting: { locale: "en-US" } });

test("series: categories from rows, one series per column key, no totals", () => {
    const s = toSeries(r);
    assert.deepEqual(s.categories, ["North", "South", "West", "(blank)"]);
    assert.deepEqual(s.series.map((x) => [x.name, x.data]), [["A", [8, 7, 4, 6]], ["B", [2, 1, null, null]]]);
    assert.deepEqual(s.totals[0], [10, 8, 4, 6]);
});

test("several values and nested rows name their series and categories by path", () => {
    const r2 = computePivot(data, { rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum" }, { agg: "count" }, { field: "Rep", agg: "listUnique" }] });
    const s = toSeries(r2);
    assert.equal(s.categories[0], "North / A");
    // text values are not plotted
    assert.deepEqual(s.series.map((x) => x.name), ["Sum of Units", "Count"]);
});

test("bar, stacked bar and horizontal bar", () => {
    const bar = toEChartsOption(r, { chart: { type: "bar" } });
    assert.deepEqual(bar.xAxis.data, ["North", "South", "West", "(blank)"]);
    assert.equal(bar.yAxis.type, "value");
    assert.deepEqual(bar.series.map((x) => x.type), ["bar", "bar"]);
    assert.equal(bar.series[0].stack, undefined);
    assert.ok(bar.legend);
    const stacked = toEChartsOption(r, { chart: { type: "bar", stacked: true } });
    assert.equal(stacked.series[1].stack, "total");
    const horizontal = toEChartsOption(r, { chart: { type: "bar", horizontal: true } });
    assert.equal(horizontal.xAxis.type, "value");
    assert.equal(horizontal.yAxis.type, "category");
    assert.equal(typeof bar.tooltip.valueFormatter(1234.5), "string");
});

test("line and area", () => {
    const line = toEChartsOption(r, { chart: { type: "line" } });
    assert.deepEqual(line.series.map((x) => x.type), ["line", "line"]);
    const area = toEChartsOption(r, { chart: { type: "area", stacked: true } });
    assert.deepEqual(area.series[0].areaStyle, {});
    assert.equal(area.series[0].stack, "total");
});

test("pie uses the row totals and drops empty slices", () => {
    const pie = toEChartsOption(r, { chart: { type: "pie" } });
    assert.equal(pie.series[0].type, "pie");
    assert.deepEqual(pie.series[0].data, [{ name: "North", value: 10 }, { name: "South", value: 8 }, { name: "West", value: 4 }, { name: "(blank)", value: 6 }]);
});

test("heatmap: column keys across, row keys down, a visual map over the values", () => {
    const heat = toEChartsOption(r, { chart: { type: "heatmap" }, theme: { heatmapColors: ["#ffffff", "#003366"] } });
    assert.deepEqual(heat.xAxis.data, ["A", "B"]);
    assert.deepEqual(heat.yAxis.data, ["North", "South", "West", "(blank)"]);
    assert.deepEqual(heat.series[0].data, [[0, 0, 8], [0, 1, 7], [0, 2, 4], [0, 3, 6], [1, 0, 2], [1, 1, 1]]);
    assert.deepEqual([heat.visualMap.min, heat.visualMap.max], [1, 8]);
    assert.deepEqual(heat.visualMap.inRange.color, ["#ffffff", "#003366"]);
});

test("heatmap: empty cells show the background, every column name is shown, labels in the theme", () => {
    const heat = toEChartsOption(r, { chart: { type: "heatmap" }, theme: { textColor: "#cccccc" } });
    // ECharts' split areas are light grey in every theme
    assert.equal(heat.xAxis.splitArea.show, false);
    assert.equal(heat.yAxis.splitArea.show, false);
    assert.equal(heat.xAxis.axisLabel.interval, 0);
    assert.equal(heat.xAxis.axisLabel.color, "#cccccc");
    assert.equal(heat.yAxis.axisLabel.color, "#cccccc");
});

test("the theme reaches colours and text; the option is plain data apart from formatters", () => {
    const option = toEChartsOption(r, { theme: { colors: ["#111111", "#222222"], textColor: "#eeeeee" } });
    assert.deepEqual(option.color, ["#111111", "#222222"]);
    assert.equal(option.textStyle.color, "#eeeeee");
    assert.equal(option.series[0].type, "bar");
    assert.doesNotThrow(() => JSON.stringify(option));
});

test("a pivot without rows plots one category", () => {
    const s = toSeries(computePivot(data, { values: [{ field: "Units", agg: "sum" }] }));
    assert.deepEqual(s.categories, ["Grand Total"]);
    assert.deepEqual(s.series[0].data, [28]);
});

test("maxCategories plots the first categories in the view's order and reports how many there were", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ k: `k${String(i).padStart(2, "0")}`, v: i }));
    const r = computePivot(encode(rows), { rows: ["k"], values: [{ field: "v", agg: "sum" }], sort: [{ field: "k", by: "value", order: "desc" }] });
    const s = toSeries(r, { maxCategories: 5 });
    assert.deepEqual(s.categories, ["k29", "k28", "k27", "k26", "k25"]);
    assert.equal(s.categoryCount, 30);
    assert.equal(s.series[0].data.length, 5);
    assert.equal(toSeries(r).categoryCount, 30);
    assert.equal(toEChartsOption(r, { maxCategories: 5 }).xAxis.data.length, 5);
    assert.throws(() => toSeries(r, { maxCategories: 0 }), PivotkitError);
    // the series a caller already computed are used as they are
    assert.deepEqual(toEChartsOption(r, { series: s }).xAxis.data, s.categories);
    assert.throws(() => toEChartsOption(r, { series: /** @type {any} */ ({}) }), PivotkitError);
});
