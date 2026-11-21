// Two chart types (#518): a combo chart (the first value as bars, every other value as a line on an
// axis of its own, on the right) and a treemap (one tile per category, its area its total).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, computePivot, encode, normalize, referenceLineRules, toEChartsOption } from "pivotkit-core";
import { decorateOption, labelColorOn } from "pivotkit-core/chart";

/** Revenue in thousands and units in a few dozen per month: two values of very different sizes. */
const ROWS = [
    ["2026-01-15", "North", 120_000, 40],
    ["2026-02-15", "North", 150_000, 55],
    ["2026-03-15", "South", 90_000, 70],
    ["2026-04-15", "South", 200_000, 30]
].map(([Date, Region, Revenue, Units]) => ({ Date, Region, Revenue, Units }));
const data = encode(ROWS);
const MONTH = { name: "Month", field: "Date", by: "yearMonth" };
const TWO = [
    { field: "Revenue", agg: "sum" },
    { field: "Units", agg: "sum" }
];
const pivot = (chart, view = {}) => computePivot(data, { derived: [MONTH], rows: ["Month"], values: TWO, formatting: { locale: "en-US" }, chart, ...view });
const THEME = { colors: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"], textColor: "#5a6270" };

test("the view takes the types combo and treemap; the catalog lists them", () => {
    for (const type of ["combo", "treemap"]) {
        const n = normalize({ chart: { type } }, data);
        assert.equal(n.view.chart.type, type);
        assert.deepEqual(n.issues, []);
        assert.ok(CATALOG.chartTypes.includes(type));
    }
});

test("combo: the first value as bars on the left axis, the second as a line on its own axis on the right", () => {
    const option = toEChartsOption(pivot({ type: "combo" }), { theme: THEME });
    assert.deepEqual(
        option.series.map((s) => [s.type, s.name, s.yAxisIndex ?? 0]),
        [
            ["bar", "Sum of Revenue", 0],
            ["line", "Sum of Units", 1]
        ]
    );
    assert.ok(Array.isArray(option.yAxis) && option.yAxis.length === 2);
    assert.deepEqual(
        option.yAxis.map((a) => [a.type, a.position]),
        [
            ["value", "left"],
            ["value", "right"]
        ]
    );
    // each axis is named after its values, with a sample in their series' colour: the axis and its marks belong together
    assert.match(option.yAxis[0].name, /Sum of Revenue/);
    assert.match(option.yAxis[1].name, /Sum of Units/);
    assert.equal(option.yAxis[0].nameTextStyle.rich.s.color, "#2a78d6");
    assert.equal(option.yAxis[1].nameTextStyle.rich.s.color, "#eb6834");
    // the right axis draws no grid lines of its own: one grid, the left axis's
    assert.equal(option.yAxis[1].splitLine.show, false);
    // a legend names both series
    assert.ok(option.legend);
});

test("combo with a field on Columns: every series of the first value as bars, the others as lines", () => {
    const option = toEChartsOption(pivot({ type: "combo" }, { cols: ["Region"] }), { theme: THEME });
    const kinds = option.series.map((s) => [s.type, s.yAxisIndex ?? 0]);
    assert.deepEqual(kinds, [
        ["bar", 0],
        ["line", 1],
        ["bar", 0],
        ["line", 1]
    ]);
});

test("combo with one value draws bars: there is nothing for a line", () => {
    const option = toEChartsOption(pivot({ type: "combo" }, { values: [TWO[0]] }), { theme: THEME });
    assert.deepEqual(
        option.series.map((s) => s.type),
        ["bar"]
    );
    assert.ok(!Array.isArray(option.yAxis));
});

test("combo and treemap draw no reference lines", () => {
    for (const type of ["combo", "treemap"]) {
        const r = pivot({ type });
        assert.deepEqual(referenceLineRules(r.view, { type, stacked: false, horizontal: false }, data), { average: false, trend: false, target: false, extremes: false });
    }
});

test("treemap: one tile per category, its area its total, each tile in its colour, no legend", () => {
    const r = computePivot(data, { rows: ["Region"], values: [TWO[0]], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    const option = toEChartsOption(r, { theme: THEME });
    assert.equal(option.series.length, 1);
    const [s] = option.series;
    assert.equal(s.type, "treemap");
    assert.deepEqual(
        s.data.map((d) => [d.name, d.value, d.itemStyle.color]),
        [
            ["North", 270_000, "#2a78d6"],
            ["South", 290_000, "#eb6834"]
        ]
    );
    // a flat map: no zoom into a tile, no breadcrumb, a click opens nothing in ECharts
    assert.equal(s.roam, false);
    assert.equal(s.nodeClick, false);
    assert.equal(s.breadcrumb.show, false);
    // the name and the value on the tile, the value as the table writes it
    assert.equal(s.label.formatter({ name: "North", value: 270_000 }), "North\n270,000");
    assert.equal(option.legend?.show ?? false, false);
    assert.equal(option.tooltip.trigger, "item");
    // a tile hidden in Chart settings › Series is left out
    const hidden = toEChartsOption(computePivot(data, { rows: ["Region"], values: [TWO[0]], chart: { type: "treemap", hidden: ["South"] } }), { theme: THEME });
    assert.deepEqual(
        hidden.series[0].data.map((d) => d.name),
        ["North"]
    );
});

test("labelColorOn: the label of a tile in the token colour that reads best on it", () => {
    const dark = "#1a1d23";
    const light = "#ffffff";
    assert.equal(labelColorOn("#eda100", [dark, light]), dark, "dark text on yellow");
    assert.equal(labelColorOn("#2a78d6", [dark, light]), light, "light text on blue");
    assert.equal(labelColorOn("#008300", [dark, light]), light);
    assert.equal(labelColorOn("rgb(237, 161, 0)", [dark, light]), dark);
    // a colour it cannot read: the first token
    assert.equal(labelColorOn("oklch(0.5 0.1 200)", [dark, light]), dark);
});

test("decorateOption: treemap labels take --pk-text or --pk-surface, whichever reads better on each tile", () => {
    const tokens = { "--pk-text": "#1a1d23", "--pk-surface": "#ffffff" };
    const style = { getPropertyValue: (n) => tokens[n] ?? "" };
    const r = computePivot(data, { rows: ["Region"], values: [TWO[0]], chart: { type: "treemap", colors: [{ name: "North", color: "#eda100" }, { name: "South", color: "#2a78d6" }] } });
    const out = decorateOption(toEChartsOption(r, { theme: THEME }), style, { width: 390, height: 300 });
    assert.deepEqual(
        out.series[0].data.map((d) => [d.name, d.label.color]),
        [
            ["North", "#1a1d23"],
            ["South", "#ffffff"]
        ]
    );
    // tiles are parted by the background's colour
    assert.equal(out.series[0].itemStyle.borderColor, "#ffffff");
    // on yellow the dark text reads (8.9:1): no outline; on a mid blue neither reaches 4.5:1, so the
    // white label gets a dark outline it reads against
    assert.equal(out.series[0].data[0].label.textBorderColor, undefined);
    assert.deepEqual([out.series[0].data[1].label.textBorderColor, out.series[0].data[1].label.textBorderWidth], ["#1a1d23", 2]);
});
