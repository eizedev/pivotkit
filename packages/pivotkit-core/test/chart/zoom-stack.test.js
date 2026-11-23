// The zoom slider under a long category axis, the legend entries hidden by the view and bars and areas
// stacked to 100 % (#36): in the view, in the ECharts option (the screen, the SVG and the printed report
// draw it) and in decorateOption's slider.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, computePivot, emptyView, encode, normalize, validate } from "../../src/index.js";
import { decorateOption, toEChartsOption } from "pivotkit-core/chart";

const NO_TOKENS = { getPropertyValue: () => "" };

/** Revenue per region and category; East sells no hardware. North adds up to 60, South to 45, East to 52. */
const SALES = encode([
    { Region: "North", Category: "Hardware", Revenue: 20 },
    { Region: "North", Category: "Services", Revenue: 10 },
    { Region: "North", Category: "Software", Revenue: 30 },
    { Region: "South", Category: "Hardware", Revenue: 15 },
    { Region: "South", Category: "Services", Revenue: 5 },
    { Region: "South", Category: "Software", Revenue: 25 },
    { Region: "East", Category: "Services", Revenue: 12 },
    { Region: "East", Category: "Software", Revenue: 40 }
]);
const VIEW = { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale: "en-US" } };
const pivot = (chart, view = VIEW, data = SALES) => computePivot(data, { ...view, chart });

/** 40 countries with names long enough that a 390 px chart cannot write each one. */
const COUNTRIES = encode(Array.from({ length: 40 }, (_, i) => ({ Country: `Country number ${String(i + 1).padStart(2, "0")}`, Units: 10 + ((i * 7) % 13) })));
const LONG_AXIS = { rows: ["Country"], values: [{ field: "Units", agg: "sum" }], formatting: { locale: "en-US" } };

test("the view keeps zoom, stackPercent and the hidden legend entries, checked against fixed lists", () => {
    const chart = emptyView().chart;
    assert.equal(chart.zoom, "auto");
    assert.equal(chart.stackPercent, false);
    assert.deepEqual(chart.hidden, []);
    const fields = SALES;
    const norm = (input, options) => normalize(input, fields, options).view;
    const v = norm({ chart: { zoom: "on", stackPercent: true, hidden: ["Software", "Software", "North"] } });
    assert.deepEqual([v.chart.zoom, v.chart.stackPercent, v.chart.hidden], ["on", true, ["Software", "North"]]);
    for (const zoom of CATALOG.chartZooms) {
        assert.equal(validate({ chart: { zoom } }, fields).valid, true, zoom);
    }
    // unknown values fall back and are reported; a name that is not a text is left out
    const bad = validate({ chart: { zoom: "always", hidden: ["North", 3, { a: 1 }] } }, fields);
    assert.deepEqual(bad.errors.map((e) => e.path), ["chart.zoom", "chart.hidden[1]", "chart.hidden[2]"]);
    assert.deepEqual(norm({ chart: { hidden: "North" } }).chart.hidden, []);
    // a key named like a prototype is a name like any other
    assert.deepEqual(norm({ chart: JSON.parse('{"hidden":["__proto__"]}') }).chart.hidden, ["__proto__"]);
    // more names than limits.items are cut
    const many = norm({ chart: { hidden: ["a", "b", "c"] } }, { limits: { items: 2 } });
    assert.deepEqual(many.chart.hidden, ["a", "b"]);
});

test("hidden legend entries: unselected in the legend, also while the legend is off; a pie's slices too", () => {
    const bars = toEChartsOption(pivot({ type: "bar", hidden: ["Services", "Nowhere"] }));
    assert.deepEqual(bars.legend.selected, { Services: false, Nowhere: false });
    // every series stays in the option: their indexes are the tooltip's and the click's
    assert.deepEqual(bars.series.map((s) => s.name), ["Hardware", "Services", "Software"]);
    const off = toEChartsOption(pivot({ type: "bar", legend: "off", hidden: ["Services"] }));
    assert.equal(off.legend.show, false);
    assert.deepEqual(off.legend.selected, { Services: false });
    assert.equal(toEChartsOption(pivot({ type: "bar", legend: "off" })).legend, undefined);
    const pie = toEChartsOption(pivot({ type: "pie", hidden: ["North"] }));
    assert.deepEqual(pie.legend.selected, { North: false });
    // a hidden legend leaves the pie's labels as without a legend: every slice keeps its label
    const drawn = decorateOption(toEChartsOption(pivot({ type: "pie", legend: "off", hidden: ["North"] })), NO_TOKENS, { width: 390, height: 360 });
    assert.equal(drawn.legend.show, false);
});

test("100 % stacked bars: each category's parts as shares of its stack, the value kept for the tooltip", () => {
    const o = toEChartsOption(pivot({ type: "bar", stacked: true, stackPercent: true }));
    // categories: East, North, South; series: Hardware, Services, Software
    const shares = o.series.map((s) => s.data.map((d) => (d === null ? null : Math.round(d.value * 10) / 10)));
    assert.deepEqual(shares, [
        [null, 33.3, 33.3],
        [23.1, 16.7, 11.1],
        [76.9, 50, 55.6]
    ]);
    assert.deepEqual(o.series[0].data.map((d) => d?.raw ?? null), [null, 20, 15]);
    assert.ok(o.series.every((s) => s.stack === "total"));
    assert.equal(o.yAxis.max, 100);
    assert.equal(o.yAxis.axisLabel.formatter(50), "50%");
    // the share in the locale's way, for the value labels and the tooltip
    assert.equal(o.tooltip.shareFormatter(33.333), "33.3%");
    const de = toEChartsOption(computePivot(SALES, { ...VIEW, formatting: { locale: "de-DE" }, chart: { type: "bar", stacked: true, stackPercent: true, valueLabels: "value" } }));
    assert.equal(de.series[1].label.formatter({ value: 16.667, data: { value: 16.667, raw: 10 } }), "16,7\u00a0%");
    // without stacked, bars stay as they are; an area is stacked by it
    assert.equal(toEChartsOption(pivot({ type: "bar", stackPercent: true })).series[0].data[1], 20);
    const area = toEChartsOption(pivot({ type: "area", stackPercent: true }));
    assert.ok(area.series.every((s) => s.stack === "total"));
    assert.equal(Math.round(area.series[2].data[0].value * 10) / 10, 76.9);
    // a line is never stacked
    assert.equal(toEChartsOption(pivot({ type: "line", stackPercent: true })).series[0].stack, undefined);
});

test("100 % stacked horizontal bars: the value axis runs to 100 %, the layout reads the shares", () => {
    const o = toEChartsOption(pivot({ type: "bar", stacked: true, horizontal: true, stackPercent: true, valueLabels: "value" }));
    assert.equal(o.xAxis.max, 100);
    const drawn = decorateOption(o, NO_TOKENS, { width: 390, height: 360 });
    assert.equal(drawn.xAxis.max, 100);
    assert.ok(drawn.series.every((s) => s.label.position === "inside"));
});

test("100 % stacked: hidden series are not in the shares; a category without a sum and negative parts", () => {
    const o = toEChartsOption(pivot({ type: "bar", stacked: true, stackPercent: true, hidden: ["Software"] }));
    // North: 20 and 10 of 30
    assert.deepEqual(o.series.slice(0, 2).map((s) => Math.round(s.data[1].value * 10) / 10), [66.7, 33.3]);
    const data = encode([
        { Region: "North", Category: "A", Revenue: 0 },
        { Region: "North", Category: "B", Revenue: 0 },
        { Region: "South", Category: "A", Revenue: 30 },
        { Region: "South", Category: "B", Revenue: -10 }
    ]);
    const signed = toEChartsOption(computePivot(data, { ...VIEW, chart: { type: "bar", stacked: true, stackPercent: true } }));
    // nothing to share: no bar; a negative part takes its share below zero, of the parts' sizes added up
    assert.deepEqual(signed.series.map((s) => s.data[0]), [null, null]);
    assert.deepEqual(signed.series.map((s) => s.data[1].value), [75, -25]);
    assert.equal(signed.yAxis.min, -100);
});

test("zoom: a slider under a long axis it cannot label, labels laid out for the window; none in a file", () => {
    const option = toEChartsOption(computePivot(COUNTRIES, { ...LONG_AXIS, chart: { type: "bar" } }));
    // no zoom asked for (an SVG, a printed report): every category, every n-th label
    const file = decorateOption(option, NO_TOKENS, { width: 390, height: 360 });
    assert.equal(file.dataZoom, undefined);
    assert.ok(file.axisEvery > 1);
    const auto = decorateOption(option, NO_TOKENS, { width: 390, height: 360, zoom: "auto" });
    assert.equal(auto.dataZoom.length, 1);
    const [slider] = auto.dataZoom;
    assert.equal(slider.type, "slider");
    assert.deepEqual(slider.xAxisIndex, [0]);
    assert.equal(slider.startValue, 0);
    // the slider can widen to every category; it is a control's least size, its names the chart's text size
    assert.equal(slider.maxValueSpan, undefined);
    assert.equal(slider.height, 24);
    assert.equal(slider.textStyle.fontSize, 14);
    // the window shows fewer categories, each one named
    assert.ok(slider.endValue < 39 && slider.endValue >= 1, String(slider.endValue));
    assert.equal(auto.axisEvery, 1);
    // the slider takes its room under the plot
    assert.ok(auto.grid.bottom >= file.grid.bottom + slider.height);
    // more than 20 categories: "auto" adds the slider even where every name fits, its window all of them
    const wide = decorateOption(option, NO_TOKENS, { width: 4000, height: 480, zoom: "auto" });
    assert.deepEqual([wide.dataZoom[0].startValue, wide.dataZoom[0].endValue], [0, 39]);
    assert.equal(decorateOption(option, NO_TOKENS, { width: 4000, height: 480, zoom: "on" }).dataZoom[0].endValue, 39);
    assert.equal(decorateOption(option, NO_TOKENS, { width: 390, height: 360, zoom: "off" }).dataZoom, undefined);
    // horizontal bars: a slider beside the category axis, on the right
    const across = decorateOption(toEChartsOption(computePivot(COUNTRIES, { ...LONG_AXIS, chart: { type: "bar", horizontal: true } })), NO_TOKENS, { width: 390, height: 300, zoom: "auto" });
    assert.deepEqual(across.dataZoom[0].yAxisIndex, [0]);
    assert.equal(across.dataZoom[0].orient, "vertical");
    // a pie has no axis
    assert.equal(decorateOption(toEChartsOption(computePivot(COUNTRIES, { ...LONG_AXIS, chart: { type: "pie" } })), NO_TOKENS, { width: 390, height: 360, zoom: "on" }).dataZoom, undefined);
});

test("zoom \"auto\" is conservative: 20 categories or fewer only when the axis would leave out 3 labels or more", () => {
    const some = (n) => toEChartsOption(computePivot(encode(Array.from({ length: n }, (_, i) => ({ Country: `Country number ${String(i + 1).padStart(2, "0")}`, Units: i + 1 }))), { ...LONG_AXIS, chart: { type: "bar" } }));
    // 16 long names in a small chart: every 3rd label (2 left out between) is no reason; a slider only with "on"
    assert.equal(decorateOption(some(16), NO_TOKENS, { width: 200, height: 200 }).axisEvery, 3);
    assert.equal(decorateOption(some(16), NO_TOKENS, { width: 200, height: 200, zoom: "auto" }).dataZoom, undefined);
    assert.equal(decorateOption(some(16), NO_TOKENS, { width: 200, height: 200, zoom: "on" }).dataZoom.length, 1);
    // 20 of them: every 4th label (3 left out between) gets a slider, every 2nd does not
    assert.equal(decorateOption(some(20), NO_TOKENS, { width: 200, height: 200 }).axisEvery, 4);
    assert.equal(decorateOption(some(20), NO_TOKENS, { width: 200, height: 200, zoom: "auto" }).dataZoom.length, 1);
    assert.equal(decorateOption(some(20), NO_TOKENS, { width: 390, height: 360, zoom: "auto" }).dataZoom, undefined);
});

test("zoom: the latest categories first on a time line; a kept window, its labels laid out for its size; a finger's slider", () => {
    const option = toEChartsOption(computePivot(COUNTRIES, { ...LONG_AXIS, chart: { type: "bar" } }));
    const first = decorateOption(option, NO_TOKENS, { width: 390, height: 360, zoom: "auto" }).dataZoom[0];
    const latest = decorateOption(option, NO_TOKENS, { width: 390, height: 360, zoom: "auto", timeline: true }).dataZoom[0];
    assert.deepEqual([latest.startValue, latest.endValue], [39 - first.endValue, 39]);
    // a window widened to every category: the labels are laid out for all 40 again
    const all = decorateOption(option, NO_TOKENS, { width: 390, height: 360, zoom: "auto", zoomAt: { start: 0, end: 39 } });
    assert.deepEqual([all.dataZoom[0].startValue, all.dataZoom[0].endValue], [0, 39]);
    assert.ok(all.axisEvery > 1);
    // a window that does not fit the categories is not kept
    assert.equal(decorateOption(option, NO_TOKENS, { width: 390, height: 360, zoom: "auto", zoomAt: { start: 30, end: 80 } }).dataZoom[0].startValue, 0);
    // on a touch screen the slider is as thick as a finger's target, --pk-target-touch
    const tokens = { getPropertyValue: (name) => ({ "--pk-target": "24px", "--pk-target-touch": "44px" })[name] ?? "" };
    assert.equal(decorateOption(option, tokens, { width: 390, height: 360, zoom: "auto", touch: true }).dataZoom[0].height, 44);
    assert.equal(decorateOption(option, tokens, { width: 390, height: 360, zoom: "auto" }).dataZoom[0].height, 24);
});

test("zoom with group labels drives both category axes", () => {
    const rows = [];
    for (const region of ["Africa", "Americas", "Asia", "Europe"]) {
        for (let i = 1; i <= 10; i++) {
            rows.push({ Region: region, Country: `${region} country ${i}`, Units: i });
        }
    }
    const o = toEChartsOption(computePivot(encode(rows), { rows: ["Region", "Country"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", groupLabels: "on" } }));
    const drawn = decorateOption(o, NO_TOKENS, { width: 800, height: 480, zoom: "on" });
    assert.deepEqual(drawn.dataZoom[0].xAxisIndex, [0, 1]);
});

test("a view file leaves out the chart keys newer than 0.7 at their defaults, so 0.7 readers take it without a warning", async () => {
    const { toViewFile, fromViewFile } = await import("../../src/index.js");
    const view = normalize({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar" } }, SALES).view;
    const file = toViewFile(view, { name: "Revenue" });
    assert.deepEqual(Object.keys(file.view.chart), ["type", "stacked", "horizontal", "valueLabels", "legend", "title", "smooth", "axisLabels", "groupLabels", "labelPosition"]);
    // the link carries the same
    assert.equal("zoom" in toViewFile(view, {}, { link: true }).view.chart, false);
    // a key set to something else is written; read back, the view is the same
    const set = normalize({ ...view, chart: { ...view.chart, zoom: "off", hidden: ["North"], tooltip: "axis" } }, SALES).view;
    const written = toViewFile(set, { name: "Revenue" }).view.chart;
    assert.deepEqual([written.zoom, written.hidden, written.tooltip, "stackPercent" in written], ["off", ["North"], "axis", false]);
    assert.deepEqual(normalize(fromViewFile(toViewFile(set, { name: "Revenue" })).view, SALES).view.chart, set.chart);
    // the view handed in is not changed
    assert.equal(view.chart.zoom, "auto");
});
