import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError, autoChartType, computePivot, encode, normalize, toEChartsOption, toSeries } from "../src/index.js";
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

test("a pie is a whole circle, a donut a ring; both use the row totals and a legend", () => {
    const pie = toEChartsOption(r, { chart: { type: "pie" } }).series[0];
    const donut = toEChartsOption(r, { chart: { type: "donut" } });
    assert.deepEqual(pie.radius, ["0%", "70%"]);
    assert.equal(donut.series[0].type, "pie");
    assert.deepEqual(donut.series[0].radius, ["42%", "70%"]);
    assert.deepEqual(donut.series[0].data, pie.data);
    assert.ok(donut.legend);
    assert.deepEqual(toEChartsOption(r, { chart: { type: "donut" }, theme: { donutRadius: ["50%", "60%"] } }).series[0].radius, ["50%", "60%"]);
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

test("display settings: a title, the legend where the view puts it, smooth lines", () => {
    const titled = toEChartsOption(r, { chart: { type: "bar", title: "Units" } });
    assert.equal(titled.title.text, "Units");
    // the grid makes room for the title and the legend above it
    assert.equal(titled.legend.top, 32);
    assert.ok(titled.grid.top > toEChartsOption(r).grid.top);
    assert.equal(toEChartsOption(r).title, undefined);
    assert.equal(toEChartsOption(r, { chart: { legend: "off" } }).legend, undefined);
    const bottom = toEChartsOption(r, { chart: { legend: "bottom" } });
    assert.equal(bottom.legend.bottom, 0);
    assert.ok(bottom.grid.bottom > 0);
    const right = toEChartsOption(r, { chart: { legend: "right" } });
    assert.equal(right.legend.orient, "vertical");
    assert.ok(right.grid.right > 100);
    // one series: no legend unless the view asks for one
    const one = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    assert.equal(toEChartsOption(one).legend, undefined);
    assert.equal(toEChartsOption(one, { chart: { legend: "bottom" } }).legend.bottom, 0);
    assert.equal(toEChartsOption(r, { chart: { type: "line", smooth: true } }).series[0].smooth, true);
    assert.equal(toEChartsOption(r, { chart: { type: "line" } }).series[0].smooth, false);
    assert.equal(toEChartsOption(r, { chart: { type: "pie", legend: "off" } }).legend, undefined);
});

test("value labels: the value on bars and lines, value and share on a pie, numbers on a heatmap", () => {
    assert.equal(toEChartsOption(r).series[0].label, undefined);
    const bar = toEChartsOption(r, { chart: { type: "bar", valueLabels: "value" } });
    assert.equal(bar.series[0].label.show, true);
    assert.equal(bar.series[0].label.position, "top");
    assert.equal(bar.series[0].label.formatter({ value: 1234 }), "1,234");
    assert.equal(toEChartsOption(r, { chart: { type: "bar", stacked: true, valueLabels: "value" } }).series[0].label.position, "inside");
    assert.equal(toEChartsOption(r, { chart: { type: "bar", horizontal: true, valueLabels: "value" } }).series[0].label.position, "right");
    // "percent" is a pie's: a bar writes its value
    assert.equal(toEChartsOption(r, { chart: { type: "line", valueLabels: "percent" } }).series[0].label.formatter({ value: 8 }), "8");
    const pie = (valueLabels) => toEChartsOption(r, { chart: { type: "pie", valueLabels } }).series[0].label;
    assert.equal(pie("auto").formatter, undefined);
    assert.equal(pie("off").show, false);
    assert.equal(pie("value").formatter({ name: "North", value: 10, percent: 35.7 }), "North: 10");
    assert.equal(pie("percent").formatter({ name: "North", value: 10, percent: 35.7 }), "North: 35.7%");
    assert.equal(pie("both").formatter({ name: "North", value: 10, percent: 35.7 }), "North: 10 (35.7%)");
    // on the slices: the number only (the legend names the slices); the share when nothing is chosen
    const inside = (valueLabels) => toEChartsOption(r, { chart: { type: "pie", valueLabels, labelPosition: "inside" } }).series[0];
    assert.equal(inside("auto").label.position, "inside");
    assert.equal(inside("auto").label.formatter({ name: "North", value: 10, percent: 35.7 }), "35.7%");
    assert.equal(inside("value").label.formatter({ name: "North", value: 10, percent: 35.7 }), "10");
    assert.equal(inside("both").label.formatter({ name: "North", value: 10, percent: 35.7 }), "10 (35.7%)");
    // the share as the locale writes it: a space before the sign in German
    const german = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], formatting: { locale: "de-DE" } });
    assert.match(toEChartsOption(german, { chart: { type: "pie", valueLabels: "percent" } }).series[0].label.formatter({ name: "Nord", value: 10, percent: 35.7 }), /^Nord: 35,7\s%$/);
    assert.equal(inside("off").label.show, false);
    assert.equal(inside("value").labelLine.show, false);
    assert.equal(pie("value").position, undefined);
    assert.equal(toEChartsOption(r, { chart: { type: "heatmap" } }).series[0].label.show, true);
    assert.equal(toEChartsOption(r, { chart: { type: "heatmap", valueLabels: "off" } }).series[0].label.show, false);
});

test("the view's display settings reach the option without an override", () => {
    const view = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "line", title: "Trend", smooth: true, legend: "bottom", valueLabels: "value" } };
    const option = toEChartsOption(computePivot(data, view));
    assert.equal(option.title.text, "Trend");
    assert.equal(option.legend.bottom, 0);
    assert.equal(option.series[0].smooth, true);
    assert.equal(option.series[0].label.show, true);
});

test("two row fields: the inner items name the categories, the outer ones are group labels on a second axis", () => {
    const nested = computePivot(data, { rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum" }] });
    const s = toSeries(nested);
    assert.deepEqual(s.categoryLevels.slice(0, 3), [["North", "A"], ["North", "B"], ["South", "A"]]);
    const bar = toEChartsOption(nested, { series: s });
    assert.ok(Array.isArray(bar.xAxis));
    const [main, groups] = bar.xAxis;
    assert.deepEqual(main.data.slice(0, 3), ["A", "B", "A"]);
    assert.equal(groups.data.length, main.data.length, "both axes have the same bands");
    // each group's name once, at its middle; a separator where a group starts
    const named = groups.data.map((g, i) => (groups.axisLabel.interval(i) ? g : null)).filter(Boolean);
    assert.deepEqual(named, [...new Set(groups.data)]);
    const starts = groups.data.map((_, i) => groups.axisTick.interval(i));
    assert.deepEqual(starts, groups.data.map((g, i) => i > 0 && g !== groups.data[i - 1]));
    // horizontal bars: on the y axis, both reversed; lines and areas too
    const horizontal = toEChartsOption(nested, { chart: { horizontal: true } });
    assert.deepEqual([horizontal.yAxis.length, horizontal.yAxis[0].inverse, horizontal.yAxis[1].inverse], [2, true, true]);
    assert.ok(Array.isArray(toEChartsOption(nested, { chart: { type: "area" } }).xAxis));
    // off, one row field, a pie: one axis with the whole names
    const off = toEChartsOption(nested, { chart: { groupLabels: "off" } });
    assert.equal(off.xAxis.data[0], "North / A");
    assert.equal(Array.isArray(toEChartsOption(r).xAxis), false);
    assert.equal(toEChartsOption(nested, { chart: { type: "pie" } }).xAxis, undefined);
});

test("auto: lines when a date or a date grouping is on Rows, else bars; a date on Columns alone is not enough", () => {
    const month = { name: "Date (Month)", field: "Date", by: "yearMonth" };
    const view = (v) => normalize(v, data).view;
    assert.equal(autoChartType(view({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }), data), "bar");
    assert.equal(autoChartType(view({ rows: ["Date"], values: [{ field: "Units", agg: "sum" }] }), data), "line");
    assert.equal(autoChartType(view({ rows: ["Region", "Date (Month)"], derived: [month], values: [{ field: "Units", agg: "sum" }] }), data), "line");
    assert.equal(autoChartType(view({ rows: ["Region"], cols: ["Date (Month)"], derived: [month], values: [{ field: "Units", agg: "sum" }] }), data), "bar");
    // a grouping that repeats is categories, not a time line: bars; every one along the time line: lines
    for (const by of ["weekday", "hour", "month", "quarter", "week"]) {
        assert.equal(autoChartType(view({ rows: ["D"], derived: [{ name: "D", field: "Date", by }], values: [{ agg: "count" }] }), data), "bar", by);
    }
    for (const by of ["day", "yearWeek", "yearMonth", "yearQuarter", "year"]) {
        assert.equal(autoChartType(view({ rows: ["D"], derived: [{ name: "D", field: "Date", by }], values: [{ agg: "count" }] }), data), "line", by);
    }
    // a number range of a number is no date
    assert.equal(autoChartType(view({ rows: ["Units (bins)"], derived: [{ name: "Units (bins)", field: "Units", by: "bin", size: 2 }], values: [{ agg: "count" }] }), data), "bar");
    // the view's default type is "auto", and the option draws it as the type it stands for
    const byMonth = computePivot(data, { rows: ["Date (Month)"], derived: [month], values: [{ field: "Units", agg: "sum" }], display: "chart" });
    assert.equal(byMonth.view.chart.type, "auto");
    assert.deepEqual(toEChartsOption(byMonth).series.map((x) => x.type), ["line"]);
    assert.deepEqual(toEChartsOption(r).series.map((x) => x.type), ["bar", "bar"]);
    // a type the user chose stays
    assert.deepEqual(toEChartsOption(byMonth, { chart: { type: "bar" } }).series.map((x) => x.type), ["bar"]);
});

test("heatmap: the colour scale writes its ends in the value's number format", () => {
    const money = computePivot(data, { rows: ["Region"], cols: ["Product"], values: [{ field: "Price", agg: "sum", format: "currency:EUR" }], formatting: { locale: "de-DE" } });
    const heat = toEChartsOption(money, { chart: { type: "heatmap" } });
    assert.equal(typeof heat.visualMap.formatter, "function");
    assert.equal(heat.visualMap.formatter(1234.5), heat.tooltip.valueFormatter(1234.5));
    assert.match(heat.visualMap.formatter(1234.5), /1\.234,50\s€/);
});
