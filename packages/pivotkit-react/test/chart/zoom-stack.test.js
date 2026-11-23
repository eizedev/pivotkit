// The tooltip of bars and areas stacked to 100 % (#36): each part's value with its share, the stack's
// total of the values; the legend entries a view hides; the zoom window kept across redraws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toSeries } from "pivotkit-core";
import { toEChartsOption } from "pivotkit-core/chart";
import { tooltipContent } from "../../src/chart-tooltip.js";
import { keptWindow, shownOnly } from "../../src/chart-legend.js";
import { hiddenAfter } from "../../src/view-ops.js";

const SALES = encode([
    { Region: "North", Category: "Hardware", Revenue: 20 },
    { Region: "North", Category: "Services", Revenue: 10 },
    { Region: "North", Category: "Software", Revenue: 30 },
    { Region: "South", Category: "Hardware", Revenue: 15 },
    { Region: "South", Category: "Services", Revenue: 5 },
    { Region: "South", Category: "Software", Revenue: 25 }
]);
const VIEW = { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale: "en-US" } };

/** ECharts' parameters of an axis tooltip at a category: one per series, its data item as given. */
const paramsAt = (option, dataIndex) =>
    option.series.map((s, seriesIndex) => {
        const item = s.data[dataIndex];
        return { seriesIndex, dataIndex, seriesName: s.name, name: "North", axisValueLabel: "North", data: item, value: item !== null && typeof item === "object" ? item.value : item, color: "#123456" };
    });

test("a 100 % stack's tooltip: the part's value with its share, the total of the values (#36, #376)", () => {
    const option = toEChartsOption(computePivot(SALES, { ...VIEW, chart: { type: "bar", stacked: true, stackPercent: true } }));
    const { valueFormatter, shareFormatter } = option.tooltip;
    const series = option.series.map((s) => ({ type: s.type, stack: s.stack, additive: true }));
    // North: Hardware 20 of 60
    const one = tooltipContent(paramsAt(option, 0), { valueFormatter, shareFormatter, series, hover: { seriesIndex: 0, dataIndex: 0 } });
    assert.deepEqual(one.lines, [{ color: "#123456", name: "Hardware", value: "20", share: "33.3%" }]);
    assert.deepEqual(one.total, { name: "Total", value: "60" });
    const all = tooltipContent(paramsAt(option, 0), { valueFormatter, shareFormatter, series, mode: "axis" });
    assert.deepEqual(all.lines.map((l) => [l.value, l.share]), [["20", "33.3%"], ["10", "16.7%"], ["30", "50.0%"]]);
    // a stack that does not add up keeps its shares and has no total
    const averages = tooltipContent(paramsAt(option, 0), { valueFormatter, shareFormatter, series: series.map((s) => ({ ...s, additive: false })), mode: "axis" });
    assert.equal(averages.total, undefined);
    assert.equal(averages.lines[0].share, "33.3%");
    // without a 100 % stack nothing changes: no share
    const plain = toEChartsOption(computePivot(SALES, { ...VIEW, chart: { type: "bar", stacked: true } }));
    const before = tooltipContent(paramsAt(plain, 0), { valueFormatter: plain.tooltip.valueFormatter, series, hover: { seriesIndex: 0, dataIndex: 0 } });
    assert.deepEqual(before.lines, [{ color: "#123456", name: "Hardware", value: "20" }]);
});

test("a legend click hides or shows an entry: the view's list after it", () => {
    assert.deepEqual(hiddenAfter([], "North", false), ["North"]);
    assert.deepEqual(hiddenAfter(["North", "South"], "North", true), ["South"]);
    // twice the same: once in the list
    assert.deepEqual(hiddenAfter(["North"], "North", false), ["North"]);
});

test("the zoom window is kept for the same categories only", () => {
    const names = ["a", "b", "c", "d"];
    assert.deepEqual(keptWindow({ names, start: 1, end: 3 }, names), { start: 1, end: 3 });
    assert.equal(keptWindow({ names, start: 1, end: 3 }, ["a", "b"]), undefined);
    assert.equal(keptWindow({ names, start: 1, end: 3 }, ["a", "b", "c", "x"]), undefined);
    assert.equal(keptWindow(null, names), undefined);
});

test("the chart's text alternative counts the series and slices shown; a 100 % stack says it shows shares", async () => {
    const { chartSummary } = await import("../../src/chart-summary.js");
    const { en } = await import("../../src/labels.js");
    const s = toSeries(computePivot(SALES, VIEW));
    const all = chartSummary(s, { type: "stacked", rows: ["Region"], valueNames: ["Sum of Revenue"], labels: en, locale: "en-US" });
    assert.match(all, /2 categories, 3 series\. Highest 30 at North \/ Software/);
    // Software hidden: two series, its 30 no longer the highest
    const shown = chartSummary(shownOnly(s, ["Software"], false), { type: "stacked", rows: ["Region"], valueNames: ["Sum of Revenue"], labels: en, locale: "en-US" });
    assert.match(shown, /2 categories, 2 series\. Highest 20 at North \/ Hardware/);
    // a pie's hidden slice leaves its category out
    const pie = chartSummary(shownOnly(s, ["North"], true), { type: "pie", rows: ["Region"], valueNames: ["Sum of Revenue"], labels: en, locale: "en-US" });
    assert.match(pie, /1 category, 3 series\./);
    assert.doesNotMatch(pie, /North/);
    const shares = chartSummary(s, { type: "stacked", rows: ["Region"], valueNames: ["Sum of Revenue"], labels: en, locale: "en-US", shares: true });
    assert.match(shares, /3 series\. Shown as shares of each stack\. Highest/);
});

test("a 100 % stack's tooltip with a part below zero and a category that adds up to nothing", () => {
    const data = encode([
        { Region: "North", Category: "A", Revenue: 30 },
        { Region: "North", Category: "B", Revenue: -10 },
        { Region: "South", Category: "A", Revenue: 0 },
        { Region: "South", Category: "B", Revenue: 0 }
    ]);
    const option = toEChartsOption(computePivot(data, { ...VIEW, chart: { type: "bar", stacked: true, stackPercent: true } }));
    const { valueFormatter, shareFormatter } = option.tooltip;
    const series = option.series.map((s) => ({ type: s.type, stack: s.stack, additive: true }));
    // North: 30 is 75 % of the parts' sizes, -10 is -25 %; the total adds the values: 20
    const north = tooltipContent(paramsAt(option, 0), { valueFormatter, shareFormatter, series, mode: "axis" });
    assert.deepEqual(north.lines.map((l) => [l.name, l.value, l.share]), [["A", "30", "75.0%"], ["B", "-10", "-25.0%"]]);
    assert.deepEqual(north.total, { name: "Total", value: "20" });
    // South adds up to nothing: no bar, no line
    const south = tooltipContent(paramsAt(option, 1), { valueFormatter, shareFormatter, series, mode: "axis" });
    assert.deepEqual(south.lines, []);
});

test("the zoom window by keyboard: arrows move it, Shift with an arrow resizes it, Page keys move it by its size, Home and End", async () => {
    const { nextWindow } = await import("../../src/chart-legend.js");
    const at = { start: 10, end: 19 };
    assert.deepEqual(nextWindow(at, 40, "ArrowRight", false), { start: 11, end: 20 });
    assert.deepEqual(nextWindow(at, 40, "ArrowUp", false), { start: 9, end: 18 });
    assert.deepEqual(nextWindow(at, 40, "ArrowRight", true), { start: 10, end: 20 });
    assert.deepEqual(nextWindow(at, 40, "ArrowLeft", true), { start: 10, end: 18 });
    assert.deepEqual(nextWindow(at, 40, "PageDown", false), { start: 20, end: 29 });
    assert.deepEqual(nextWindow(at, 40, "PageUp", false), { start: 0, end: 9 });
    assert.deepEqual(nextWindow(at, 40, "Home", false), { start: 0, end: 9 });
    assert.deepEqual(nextWindow(at, 40, "End", false), { start: 30, end: 39 });
    // at the ends nothing changes; the smallest window is two categories
    assert.equal(nextWindow({ start: 30, end: 39 }, 40, "ArrowRight", false), null);
    assert.equal(nextWindow({ start: 5, end: 6 }, 40, "ArrowLeft", true), null);
    assert.equal(nextWindow(at, 40, "a", false), null);
});
