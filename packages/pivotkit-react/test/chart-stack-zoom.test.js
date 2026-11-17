// The tooltip of bars and areas stacked to 100 % (#36): each part's value with its share, the stack's
// total of the values; the legend entries a view hides; the zoom window kept across redraws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode } from "pivotkit-core";
import { toEChartsOption } from "pivotkit-core/chart";
import { tooltipContent } from "../src/chart-tooltip.js";
import { keptZoom } from "../src/chart-legend.js";
import { hiddenAfter } from "../src/view-ops.js";

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

test("the zoom window stays across redraws of the same categories, and starts again for others", () => {
    const names = ["a", "b", "c", "d"];
    const kept = { names, start: 1, end: 2 };
    const slider = { type: "slider", startValue: 0, endValue: 1 };
    assert.deepEqual(keptZoom([slider], kept, names), [{ ...slider, startValue: 1, endValue: 2 }]);
    // other categories, or no slider: as drawn
    assert.deepEqual(keptZoom([slider], kept, ["a", "b"]), [slider]);
    assert.equal(keptZoom(undefined, kept, names), undefined);
    assert.deepEqual(keptZoom([slider], null, names), [slider]);
});
