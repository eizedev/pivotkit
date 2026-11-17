// Fixed colours per category across charts and the share in the tooltip (#54): the view's chart.colors
// and a host's colorMap in the ECharts option (the screen, the SVG and the printed report draw it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, computePivot, emptyView, encode, normalize, validate } from "../src/index.js";
import { decorateOption, toEChartsOption } from "pivotkit-core/chart";

const NO_TOKENS = { getPropertyValue: () => "" };
const SALES = encode([
    { Region: "North", Category: "Hardware", Revenue: 20 },
    { Region: "North", Category: "Services", Revenue: 10 },
    { Region: "South", Category: "Hardware", Revenue: 15 },
    { Region: "South", Category: "Software", Revenue: 25 }
]);
const VIEW = { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale: "en-US" } };
const pivot = (chart, view = VIEW) => computePivot(SALES, { ...view, chart });
const norm = (input, options) => normalize(input, SALES, options).view;

test("the view keeps a colour per name and whether the tooltip shows the share, checked", () => {
    assert.deepEqual(emptyView().chart.colors, []);
    assert.equal(emptyView().chart.tooltipShare, false);
    const v = norm({ chart: { colors: [{ name: "North", color: "#E3000F" }, { name: "Software", color: "#287233" }, { name: "north", color: "#000" }], tooltipShare: true } });
    // each name once, the first one wins; names match without regard to case
    assert.deepEqual(v.chart.colors, [{ name: "North", color: "#E3000F" }, { name: "Software", color: "#287233" }]);
    assert.equal(v.chart.tooltipShare, true);
    // a colour is #rgb or #rrggbb; anything else is left out and reported
    const bad = validate({ chart: { colors: [{ name: "North", color: "red; background: url(x)" }, { name: 3, color: "#fff" }, "North"] } }, SALES);
    assert.deepEqual(bad.errors.map((e) => e.path), ["chart.colors", "chart.colors", "chart.colors"]);
    assert.deepEqual(norm({ chart: { colors: { North: "#fff" } } }).chart.colors, []);
    assert.deepEqual(norm({ chart: JSON.parse('{"colors":[{"name":"__proto__","color":"#abc"}]}') }).chart.colors, [{ name: "__proto__", color: "#abc" }]);
    assert.deepEqual(norm({ chart: { colors: [{ name: "a", color: "#111" }, { name: "b", color: "#222" }, { name: "c", color: "#333" }] } }, { limits: { items: 2 } }).chart.colors.length, 2);
    assert.ok(Array.isArray(CATALOG.chartTypes));
});

test("a series takes its colour by name: from the view, else from the host's colorMap; others keep the palette", () => {
    const o = toEChartsOption(pivot({ type: "bar", colors: [{ name: "software", color: "#287233" }] }), { colorMap: { HARDWARE: "#e3000f", Software: "#0000ff" } });
    const colorOf = (s) => s.itemStyle?.color ?? null;
    // the view wins over the host; names match without regard to case
    assert.deepEqual(o.series.map((s) => [s.name, colorOf(s)]), [["Hardware", "#e3000f"], ["Services", null], ["Software", "#287233"]]);
    // with a theme's palette, the others keep the palette's colour of their place: a fixed colour moves no other one
    const themed = toEChartsOption(pivot({ type: "bar" }), { colorMap: { Hardware: "#e3000f" }, theme: { colors: ["#111111", "#222222", "#333333"] } });
    assert.deepEqual(themed.series.map((s) => s.itemStyle?.color), ["#e3000f", "#222222", "#333333"]);
    const slices = toEChartsOption(pivot({ type: "pie" }), { colorMap: { North: "#e3000f" }, theme: { colors: ["#111111", "#222222"] } });
    assert.deepEqual(slices.series[0].data.map((d) => d.itemStyle?.color), ["#e3000f", "#222222"]);
    // a line and an area take it for the line and the fill too
    const area = toEChartsOption(pivot({ type: "area" }), { colorMap: { Hardware: "#e3000f" } });
    assert.deepEqual([area.series[0].itemStyle.color, area.series[0].lineStyle.color, area.series[0].areaStyle.color], ["#e3000f", "#e3000f", "#e3000f"]);
    // the marks keep it after the report's own styles
    const drawn = decorateOption(o, NO_TOKENS, { width: 800, height: 480 });
    assert.equal(drawn.series[0].itemStyle.color, "#e3000f");
    assert.equal(drawn.series[0].itemStyle.borderRadius.length, 4);
    const line = decorateOption(area, NO_TOKENS);
    assert.deepEqual([line.series[0].lineStyle.color, line.series[0].lineStyle.width, line.series[0].areaStyle.color], ["#e3000f", 2, "#e3000f"]);
});

test("a pie's slices take their colour by name; a host's colour that is not a plain colour is left out", () => {
    const o = toEChartsOption(pivot({ type: "pie" }), { colorMap: { south: "rgb(10, 20, 30)", North: "url(#x)" } });
    const data = o.series[0].data;
    assert.deepEqual(data.map((d) => [d.name, d.itemStyle?.color ?? null]), [["North", null], ["South", "rgb(10, 20, 30)"]]);
    // the pie keeps them through the report's marks
    assert.equal(decorateOption(o, NO_TOKENS).series[0].data[1].itemStyle.color, "rgb(10, 20, 30)");
    // a heatmap has no series to colour
    assert.doesNotThrow(() => toEChartsOption(pivot({ type: "heatmap" }), { colorMap: { North: "#fff" } }));
});

test("the tooltip's share: a formatter of the locale's percent on every chart but the heatmap", () => {
    const o = toEChartsOption(pivot({ type: "bar", tooltipShare: true }));
    assert.equal(o.tooltip.shareFormatter(33.333), "33.3%");
    const de = toEChartsOption(computePivot(SALES, { ...VIEW, formatting: { locale: "de-DE" }, chart: { type: "pie" } }));
    assert.equal(de.tooltip.shareFormatter(25), "25,0 %");
});
