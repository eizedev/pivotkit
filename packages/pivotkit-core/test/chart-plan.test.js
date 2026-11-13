// chartPlan, swapAxes and chartThemeFrom: what a chart draws and with which colours, the same for the
// screen (pivotkit-react) and a file (pivotkit-report); decorateOption's marks from a map of tokens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartPlan, chartThemeFrom, computePivot, encode, normalize, swapAxes, toEChartsOption } from "pivotkit-core";
import { decorateOption } from "pivotkit-core/chart";
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
