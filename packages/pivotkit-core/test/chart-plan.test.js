// chartPlan, swapAxes and chartThemeFrom: what a chart draws and with which colours, the same for the
// screen (pivotkit-react) and a file (pivotkit-report); decorateOption's marks from a map of tokens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, chartPlan, chartThemeFrom, computePivot, encode, normalize, swapAxes, toEChartsOption } from "pivotkit-core";
import { categoryLabelLayout, columnLabelLayout, decorateOption, heatmapCellLabels, ringLabelsFit, rowLabelInterval } from "pivotkit-core/chart";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const view = (v) => normalize(v, data).view;

test('chartPlan: a chosen type as it is; "auto" draws lines along dates on Rows, swaps for dates on Columns only, else bars', () => {
    assert.deepEqual(chartPlan(view({ rows: ["Region"], chart: { type: "pie" } }), data), { auto: false, swap: false, chart: { type: "pie", stacked: false, horizontal: false } });
    const month = { name: "M", field: "Date", by: "yearMonth" };
    assert.deepEqual(chartPlan(view({ rows: ["M"], derived: [month], values: [{ field: "Units", agg: "sum" }] }), data), { auto: true, swap: false, chart: { type: "line", stacked: false, horizontal: false } });
    assert.deepEqual(chartPlan(view({ rows: ["Region"], cols: ["M"], derived: [month], values: [{ field: "Units", agg: "sum" }] }), data), { auto: true, swap: true, chart: { type: "line", stacked: false, horizontal: false } });
    assert.deepEqual(chartPlan(view({ rows: ["Region"], cols: ["Product"] }), data).chart.type, "bar");
});

test("swapAxes keeps every number: collapsed groups and a share of a row total go with their axis", () => {
    const grouped = view({ rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum" }], collapsed: { rows: [["North"]] } });
    const g = swapAxes(grouped);
    assert.deepEqual([g.rows, g.cols, g.collapsed.rows, g.collapsed.cols], [[], ["Region", "Product"], [], [["North"]]]);
    assert.deepEqual(grouped.rows, ["Region", "Product"], "the view itself is not changed");
    const v = view({ rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum", showAs: { type: "percentOfRowTotal" } }] });
    const s = swapAxes(v);
    assert.deepEqual([s.rows, s.cols, s.values[0].showAs.type], [["Product"], ["Region"], "percentOfColumnTotal"]);
    // North's share of product A, read in both pivots
    const a = computePivot(data, v);
    const b = computePivot(data, s);
    const node = (root, key) => root.children.find((n) => n.key === key);
    assert.equal(a.display(node(a.rowRoot, "North"), node(a.colRoot, "A"), 0), b.display(node(b.rowRoot, "A"), node(b.colRoot, "North"), 0));
    assert.ok(a.display(node(a.rowRoot, "North"), node(a.colRoot, "A"), 0) > 0);
});

test("chartThemeFrom reads the --pk-* tokens of any style; decorateOption marks an option from a map of them", () => {
    const tokens = { "--pk-chart-1": "#111111", "--pk-chart-2": " #222222 ", "--pk-muted": "#333333", "--pk-border": "#444444", "--pk-heat-low": "#000000", "--pk-heat-high": "#ffffff", "--pk-surface": "#fafafa", "--pk-text": "#101010", "font-family": "Arial" };
    const style = { getPropertyValue: (n) => tokens[n] ?? "" };
    const theme = chartThemeFrom(style);
    assert.deepEqual([theme.colors, theme.textColor, theme.heatmapColors, theme.fontFamily], [["#111111", "#222222"], "#333333", ["#000000", "#ffffff"], "Arial"]);
    const result = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" } });
    const option = decorateOption(toEChartsOption(result, { theme }), style, { width: 600, height: 300 });
    assert.equal(option.series[0].barMaxWidth, 48);
    assert.equal(option.tooltip.textStyle.color, "#101010");
    assert.equal(option.tooltip.formatter, undefined, "no tooltip formatter unless one is given");
    assert.equal(typeof decorateOption(toEChartsOption(result, { theme }), style, { tooltipFormatter: () => () => "x" }).tooltip.formatter, "function");
    assert.equal(option.axisEvery, 1);
    // the weight of the title and the group labels: --pk-weight-strong as a number, else DEFAULT_THEME's
    const weightOf = (value) => chartThemeFrom({ getPropertyValue: (n) => (n === "--pk-weight-strong" ? value : "") }).strongWeight;
    assert.deepEqual([weightOf("500"), weightOf("bold"), weightOf(""), weightOf("5000")], [500, undefined, undefined, undefined]);
});

test("decorateOption: readColor keeps a heatmap's colours ECharts can mix; an end it reads no colour for takes DEFAULT_THEME's (#386)", () => {
    const tokens = { "--pk-heat-low": "oklch(0.95 0.03 250)", "--pk-heat-high": "#003366" };
    const style = { getPropertyValue: (n) => tokens[n] ?? "" };
    const result = computePivot(data, { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "heatmap" } });
    const option = toEChartsOption(result, { theme: chartThemeFrom(style) });
    // a reader of hex only, as ECharts' parser reads no oklch()
    const hexOnly = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : null);
    assert.deepEqual(decorateOption(option, style, { readColor: hexOnly }).visualMap.inRange.color, [DEFAULT_THEME.colorScale[0], "#003366"]);
    // a reader that writes the colour another way (a browser): the colour as it gives it
    assert.deepEqual(decorateOption(option, style, { readColor: (c) => hexOnly(c) ?? "#e8f3ff" }).visualMap.inRange.color, ["#e8f3ff", "#003366"]);
    // no reader: the colours as the theme has them
    assert.deepEqual(decorateOption(option, style).visualMap.inRange.color, ["oklch(0.95 0.03 250)", "#003366"]);
    // neither end readable: both defaults, low to high
    const both = toEChartsOption(result, { theme: { heatmapColors: ["lab(90 0 0)", "lab(30 0 0)"] } });
    assert.deepEqual(decorateOption(both, style, { readColor: hexOnly }).visualMap.inRange.color, [...DEFAULT_THEME.colorScale]);
});

test("chartThemeFrom: the title's size in px, else DEFAULT_THEME's; toEChartsOption writes it", () => {
    const sizeOf = (value) => chartThemeFrom({ getPropertyValue: (n) => (n === "--pk-chart-title-size" ? value : "") }).titleSize;
    assert.deepEqual([sizeOf("20px"), sizeOf(" 18.5px "), sizeOf("22"), sizeOf("1.2em"), sizeOf("max(16px, 1em)"), sizeOf(""), sizeOf("0px")], [20, 18.5, 22, undefined, undefined, undefined, undefined]);
    const result = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", title: "Units" } });
    assert.equal(toEChartsOption(result, { theme: { titleSize: 21 } }).title.textStyle.fontSize, 21);
    assert.equal(toEChartsOption(result).title.textStyle.fontSize, DEFAULT_THEME.titleSize);
});

test("chartThemeFrom: a workbook's colour scale (a middle colour when set) and data bars from the scale tokens and --pk-chart-1", () => {
    const theme = (tokens) => {
        const t = chartThemeFrom({ getPropertyValue: (n) => tokens[n] ?? "" });
        return { colorScale: t.colorScale, dataBar: t.dataBar };
    };
    assert.deepEqual(theme({ "--pk-scale-low": "#eeeeee", "--pk-scale-high": "#222222", "--pk-chart-1": "#123456" }), { colorScale: ["#eeeeee", "#222222"], dataBar: "#123456" });
    assert.deepEqual(theme({ "--pk-scale-low": "#eeeeee", "--pk-scale-mid": "#888888", "--pk-scale-high": "#222222" }), { colorScale: ["#eeeeee", "#888888", "#222222"], dataBar: undefined });
    assert.deepEqual(theme({ "--pk-scale-low": "#eeeeee" }), { colorScale: undefined, dataBar: undefined }, "low without high keeps the default");
});

test("decorateOption: the marks' corners from --pk-radius-chart in px (a heatmap's cells three quarters), the tooltip's from --pk-radius-card", () => {
    const marks = (tokens, type) => {
        const result = computePivot(data, { rows: ["Region"], ...(type === "heatmap" ? { cols: ["Product"] } : {}), values: [{ field: "Units", agg: "sum" }], chart: { type } });
        return decorateOption(toEChartsOption(result), { getPropertyValue: (n) => tokens[n] ?? "" }, { width: 600, height: 300 });
    };
    assert.deepEqual(marks({}, "bar").series[0].itemStyle.borderRadius, [DEFAULT_THEME.markRadius, DEFAULT_THEME.markRadius, 0, 0]);
    assert.deepEqual(marks({ "--pk-radius-chart": "0px" }, "bar").series[0].itemStyle.borderRadius, [0, 0, 0, 0]);
    assert.deepEqual(marks({ "--pk-radius-chart": "8px" }, "bar").series[0].itemStyle.borderRadius, [8, 8, 0, 0]);
    assert.equal(marks({ "--pk-radius-chart": "6px" }, "pie").series[0].itemStyle.borderRadius, 6);
    assert.equal(marks({ "--pk-radius-chart": "8px" }, "heatmap").series[0].itemStyle.borderRadius, 6);
    assert.equal(marks({}, "heatmap").series[0].itemStyle.borderRadius, 3);
    assert.match(marks({}, "bar").tooltip.extraCssText, /border-radius: 8px;/);
    assert.match(marks({ "--pk-radius-card": "2px" }, "bar").tooltip.extraCssText, /border-radius: 2px;/);
});

// #221: the chart's text size is a token (--pk-chart-text-size in px), and the layout measures with it
test("chartThemeFrom: the text's size in px, else DEFAULT_THEME's; toEChartsOption writes it on every text, decorateOption lays out with it", () => {
    const sizeOf = (value) => chartThemeFrom({ getPropertyValue: (n) => (n === "--pk-chart-text-size" ? value : "") }).textSize;
    assert.deepEqual([sizeOf("16px"), sizeOf("15"), sizeOf("1em"), sizeOf(""), sizeOf("0px")], [16, 15, undefined, undefined, undefined]);
    assert.equal(DEFAULT_THEME.textSize, 14);
    const result = computePivot(data, { rows: ["Region", "Product"], cols: ["Q"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", groupLabels: "on" } });
    const option = toEChartsOption(result, { theme: { textSize: 17 } });
    assert.equal(option.textStyle.fontSize, 17);
    for (const axis of [option.xAxis, option.yAxis].flat()) assert.equal(axis.axisLabel.fontSize, 17, "every axis label");
    assert.equal(toEChartsOption(result).textStyle.fontSize, DEFAULT_THEME.textSize);
    // ten names that fit straight in 640 px at 12 px but not at 20 px: the axis slants them at the larger size
    const names = Array.from({ length: 10 }, (_, i) => `Name ${i}`);
    assert.equal(categoryLabelLayout(names, { width: 640, height: 400, fontSize: 12 }).rotate, 0);
    assert.equal(categoryLabelLayout(names, { width: 640, height: 400, fontSize: 20 }).rotate, 45);
    assert.equal(columnLabelLayout(names, 700, 12).rotate, 0);
    assert.equal(columnLabelLayout(names, 700, 20).rotate, 45);
    // a row of 15 px holds a line of 12 px text, not one of 20 px
    assert.equal(rowLabelInterval(10, 120 + 10 * 17, 12), 0);
    assert.ok(rowLabelInterval(10, 120 + 10 * 17, 20) > 0);
    assert.equal(heatmapCellLabels(4, 4, 80 + 4 * 60, 400, ["1,234.5"], 12), true);
    assert.equal(heatmapCellLabels(4, 4, 80 + 4 * 60, 400, ["1,234.5"], 20), false);
    assert.equal(ringLabelsFit(["42%", "70%"], { width: 300, height: 300 }, ["12.5%"], 10), true);
    assert.equal(ringLabelsFit(["42%", "70%"], { width: 300, height: 300 }, ["12.5%"], 20), false);
    const bars = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" } });
    const rotateAt = (textSize, width) => decorateOption(toEChartsOption(bars, { theme: { textSize } }), { getPropertyValue: () => "" }, { width, height: 300 }).xAxis.axisLabel.rotate;
    // four regions ("(blank)" the longest, 7 characters) in 80 + 4 * 60 px: straight at 12 px, slanted at 20 px
    assert.deepEqual([rotateAt(12, 320), rotateAt(20, 320)], [0, 45]);
});

test("the room of the title, the legend and the group labels grows with the text sizes", () => {
    // two values: two series, so a legend above the chart
    const result = computePivot(data, { rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum" }, { field: "Price", agg: "sum" }], chart: { type: "bar", groupLabels: "on", title: "Units" } });
    const at = (theme) => {
        const o = toEChartsOption(result, { theme });
        return { gridTop: o.grid.top, legendTop: o.legend.top, groupOffset: o.xAxis[1].offset };
    };
    // 16 px title, 14 px text: 32 px for the title, 24 for the legend line, 26 to the group labels
    assert.deepEqual(at({}), { gridTop: 16 + 32 + 24, legendTop: 32, groupOffset: 26 });
    assert.deepEqual(at({ titleSize: 24, textSize: 20 }), { gridTop: 16 + 40 + 30, legendTop: 40, groupOffset: 32 });
});

test('chart.tooltip: "auto" (the element under the pointer) by default, "axis" (every series); an unknown mode is reported', async () => {
    const { CATALOG, emptyView } = await import("pivotkit-core");
    assert.deepEqual(CATALOG.chartTooltips, ["auto", "axis"]);
    assert.equal(emptyView().chart.tooltip, "auto");
    assert.equal(view({ chart: { tooltip: "axis" } }).chart.tooltip, "axis");
    const bad = normalize({ chart: { tooltip: "item" } }, data);
    assert.equal(bad.view.chart.tooltip, "auto");
    assert.deepEqual(bad.issues.map((i) => [i.path, i.code]), [["chart.tooltip", "unknownSetting"]]);
});

test("the tooltip's marks: a bar lights up alone, the axis position lights up no bar; a line lights up as a whole", () => {
    const style = { getPropertyValue: () => "" };
    const of = (chart) => decorateOption(toEChartsOption(computePivot(data, { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart })), style, { width: 600, height: 300 });
    const stacked = of({ type: "bar", stacked: true });
    assert.equal(stacked.tooltip.trigger, "axis");
    assert.deepEqual(stacked.series.map((s) => s.emphasis.focus), stacked.series.map(() => "self"));
    assert.deepEqual(stacked.axisPointer, { triggerEmphasis: false });
    // with every series in the tooltip too: the hovered bar is the one that lights up
    assert.deepEqual(of({ type: "bar", tooltip: "axis" }).axisPointer, { triggerEmphasis: false });
    // a line lights up as a whole; pie, donut and heatmap keep the item tooltip
    const line = of({ type: "line" });
    assert.deepEqual([line.series[0].emphasis.focus, line.axisPointer], ["series", undefined]);
    for (const type of ["pie", "donut", "heatmap"]) {
        const o = of({ type });
        assert.deepEqual([o.tooltip.trigger, o.axisPointer], ["item", undefined], type);
    }
});

test("CATALOG.additiveAggregators: the aggregators whose values add up (a stack's total means something)", async () => {
    const { CATALOG } = await import("pivotkit-core");
    assert.deepEqual(CATALOG.additiveAggregators, ["count", "sum"]);
    // shown as: shares of the grand or the row total, a difference and a running total still add up
    // across a category's series; a rank, a percent difference or a share of another base does not
    assert.deepEqual(CATALOG.additiveShowAs, ["percentOfGrandTotal", "percentOfRowTotal", "differenceFromPrevious", "runningTotal"]);
});
