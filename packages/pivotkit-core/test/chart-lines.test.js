// Reference lines on a chart (#48): an average, a target and a linear trend. Which charts draw which
// line, the numbers, and the marks of the ECharts option (markLine), for bars, lines and areas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartThemeFrom, computePivot, emptyView, encode, normalize, referenceLineRules, toEChartsOption, valueAddsUp } from "pivotkit-core";
import { referenceLines } from "pivotkit-core/chart";

/**
 * Revenue per month and product. A climbs by 10 a month (10, 20, 30, 40: average 25), B stays near 5
 * (5, 5, 7, 3: average 5, trend from 5.6 to 4.4). Stacked, the months are 15, 25, 37, 43: average 30,
 * trend from 15.6 to 44.4.
 */
const ROWS = [
    { Date: "2026-01-15", Region: "North", Product: "A", Revenue: 10 },
    { Date: "2026-01-15", Region: "South", Product: "B", Revenue: 5 },
    { Date: "2026-02-15", Region: "North", Product: "A", Revenue: 20 },
    { Date: "2026-02-15", Region: "South", Product: "B", Revenue: 5 },
    { Date: "2026-03-15", Region: "South", Product: "A", Revenue: 30 },
    { Date: "2026-03-15", Region: "North", Product: "B", Revenue: 7 },
    { Date: "2026-04-15", Region: "South", Product: "A", Revenue: 40 },
    { Date: "2026-04-15", Region: "North", Product: "B", Revenue: 3 }
];
const data = encode(ROWS);
const MONTH = { name: "Month", field: "Date", by: "yearMonth" };
const pivot = (view) => computePivot(data, { derived: [MONTH], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale: "en-US" }, ...view });
const close = (a, b) => Math.abs(a - b) < 1e-9;
/** The lines as [kind, series, numbers...], rounded to 9 places. */
const brief = (lines) => lines.map((l) => [l.kind, l.series, ...(l.kind === "trend" ? [l.from, l.to] : [l.value])].map((x) => (typeof x === "number" ? Math.round(x * 1e9) / 1e9 : x)));

test("chart.referenceLines: off by default; average, trend and a target as a number are kept; anything else is reported", () => {
    assert.deepEqual(emptyView().chart.referenceLines, { average: false, trend: false, target: null });
    const ok = normalize({ chart: { referenceLines: { average: true, trend: true, target: 1500.5 } } }, data);
    assert.deepEqual(ok.view.chart.referenceLines, { average: true, trend: true, target: 1500.5 });
    assert.deepEqual(ok.issues, []);
    const bad = normalize({ chart: { referenceLines: { average: "yes", target: "lots", color: "red" } } }, data);
    assert.deepEqual(bad.view.chart.referenceLines, { average: false, trend: false, target: null });
    assert.deepEqual(
        bad.issues.map((i) => [i.path, i.code]),
        [
            ["chart.referenceLines.color", "unknownKey"],
            ["chart.referenceLines.target", "unknownSetting"]
        ]
    );
    // a normalized view passes again unchanged
    assert.deepEqual(normalize(ok.view, data).view.chart, ok.view.chart);
    for (const target of [Infinity, NaN, "12"]) {
        assert.equal(normalize({ chart: { referenceLines: { target } } }, data).view.chart.referenceLines.target, null, String(target));
    }
});

test("which charts get which lines: none on a pie, donut or heatmap; a trend only along a time line", () => {
    const v = (chart, view = {}) => referenceLineRules(pivot({ ...view, chart }).view, { stacked: false, horizontal: false, ...chart }, data);
    const all = { average: true, trend: true, target: true };
    assert.deepEqual(v({ type: "bar" }), all);
    assert.deepEqual(v({ type: "line" }), all);
    assert.deepEqual(v({ type: "area" }), all);
    assert.deepEqual(v({ type: "bar", horizontal: true }), all);
    for (const type of ["pie", "donut", "heatmap"]) {
        assert.deepEqual(v({ type }), { average: false, trend: false, target: false }, type);
    }
    // regions have no order of their own: an average and a target, no trend
    assert.deepEqual(v({ type: "bar" }, { rows: ["Region"] }), { average: true, trend: false, target: true });
    // a time line and a second field inside it: the categories are no longer points in time
    assert.deepEqual(v({ type: "bar" }, { rows: ["Month", "Region"] }).trend, false);
    // months sorted by their revenue: the order is the values', a trend along it would be made up
    assert.equal(v({ type: "bar" }, { sort: [{ field: "Month", by: "value", order: "desc", value: { field: "Revenue", agg: "sum" } }] }).trend, false);
    assert.equal(v({ type: "bar" }, { sort: [{ field: "Month", by: "label", order: "desc" }] }).trend, true);
});

test("stacked: lines of the stack's total only when every value adds up", () => {
    const rules = (values) => referenceLineRules(pivot({ values }).view, { type: "bar", stacked: true, horizontal: false }, data);
    assert.deepEqual(rules([{ field: "Revenue", agg: "sum" }]), { average: true, trend: true, target: true });
    assert.deepEqual(rules([{ agg: "count" }]), { average: true, trend: true, target: true });
    // a stack of averages has no total: its height means nothing, so no line is measured against it
    assert.deepEqual(rules([{ field: "Revenue", agg: "average" }]), { average: false, trend: false, target: false });
    assert.deepEqual(rules([{ field: "Revenue", agg: "sum" }, { field: "Revenue", agg: "max" }]), { average: false, trend: false, target: false });
    // a rank does not add up across a category's series either
    assert.deepEqual(rules([{ field: "Revenue", agg: "sum", showAs: { type: "rankDescending", axis: "cols" } }]).average, false);
    assert.equal(valueAddsUp({ agg: "sum", showAs: { type: "percentOfGrandTotal" } }), true);
    assert.equal(valueAddsUp({ agg: "sum", showAs: { type: "runningTotal", axis: "cols" } }), false);
    assert.equal(valueAddsUp({ agg: "median" }), false);
});

test("the numbers: an average and a trend per series, a target once; a stack's lines are of its total", () => {
    const r = pivot({ chart: { type: "line", referenceLines: { average: true, trend: true, target: 35 } } });
    const lines = referenceLines(r);
    assert.deepEqual(brief(lines), [
        ["average", 0, 25],
        ["average", 1, 5],
        ["trend", 0, 10, 40],
        ["trend", 1, 5.6, 4.4],
        ["target", null, 35]
    ]);
    // the trend's value at a category, for the tooltip
    assert.ok(close(lines[3].at(2), 4.8));
    assert.equal(lines[0].name, "Average");
    const stacked = referenceLines(pivot({ chart: { type: "bar", stacked: true, referenceLines: { average: true, trend: true, target: null } } }));
    assert.deepEqual(brief(stacked), [
        ["average", null, 30],
        ["trend", null, 15.6, 44.4]
    ]);
    // a stack of averages: nothing
    const averages = pivot({ values: [{ field: "Revenue", agg: "average" }], chart: { type: "bar", stacked: true, referenceLines: { average: true, trend: true, target: 20 } } });
    assert.deepEqual(referenceLines(averages), []);
    // nothing switched on, a pie: nothing
    assert.deepEqual(referenceLines(pivot({ chart: { type: "line" } })), []);
    assert.deepEqual(referenceLines(pivot({ chart: { type: "pie", referenceLines: { average: true, trend: true, target: 3 } } })), []);
});

test("a trend needs two points; a series without values gets no average", () => {
    const one = computePivot(data, { derived: [MONTH], rows: ["Month"], values: [{ field: "Revenue", agg: "sum" }], filters: [{ field: "Date", type: "compare", op: "<", value: "2026-02-01" }], chart: { type: "line", referenceLines: { average: true, trend: true, target: null } } });
    assert.deepEqual(brief(referenceLines(one)), [["average", 0, 15]]);
});

test("the ECharts option: a markLine per line, silent, labelled with the name and the number, the target inside the value axis", () => {
    const r = pivot({ chart: { type: "bar", referenceLines: { average: true, trend: true, target: 80 } } });
    const option = toEChartsOption(r, { theme: { referenceColor: "#123456", textColor: "#333333", textSize: 15 } });
    const [a, b] = option.series;
    const where = (d) => (Array.isArray(d) ? d.map((p) => p.coord) : (d.yAxis ?? d.xAxis));
    assert.equal(a.markLine.silent, true);
    assert.deepEqual(a.markLine.symbol, ["none", "none"]);
    // each series' average and trend on it; the target, a line of no series, on the last series
    assert.deepEqual(a.markLine.data.map(where), [25, [[0, 10], [3, 40]]]);
    assert.deepEqual(b.markLine.data.map(where), [5, [[0, 5.6], [3, 4.4]], 80]);
    const target = b.markLine.data[2];
    assert.equal(target.lineStyle.color, "#123456");
    assert.equal(target.lineStyle.type, "solid");
    assert.equal(a.markLine.data[0].lineStyle.color, undefined, "a series' line takes the series' colour");
    assert.equal(a.markLine.data[0].lineStyle.type, "dashed");
    assert.equal(a.markLine.data[1][0].lineStyle.type, "dotted");
    assert.equal(target.label.formatter(), "Target 80");
    assert.equal(a.markLine.data[0].label.formatter(), "Average 25");
    assert.equal(a.markLine.data[1][0].label.formatter(), "Trend");
    assert.equal(target.label.color, "#333333");
    assert.equal(target.label.fontSize, 15);
    // the value axis reaches the target, past the tallest bar (40)
    assert.deepEqual([option.yAxis.dataMin, option.yAxis.dataMax], [4.4, 80]);
    // a horizontal chart: the lines stand on the value axis, x
    const h = toEChartsOption(pivot({ chart: { type: "bar", horizontal: true, referenceLines: { average: true, trend: true, target: -5 } } }));
    assert.deepEqual(h.series[0].markLine.data.map(where), [25, [[10, 0], [40, 3]]]);
    assert.equal(h.series[1].markLine.data[2].xAxis, -5);
    assert.equal(h.xAxis.dataMin, -5);
    // its lines stand upright: their labels in rows above the plot, which makes room for them
    const labels = [...h.series[0].markLine.data, ...h.series[1].markLine.data].map((d) => (Array.isArray(d) ? d[0] : d).label);
    assert.deepEqual(labels.map((l) => l.position), ["start", "start", "start", "start", "start"]);
    assert.deepEqual(labels.map((l) => l.distance[1]).sort((a, b) => a - b), [6, 26, 46, 66, 86], "one row each, 14 px text and 6 px between");
    const bare = toEChartsOption(pivot({ chart: { type: "bar", horizontal: true } }));
    assert.equal(h.grid.top - bare.grid.top, 5 * 20 + 6);
    assert.equal(option.grid.top, toEChartsOption(pivot({ chart: { type: "bar" } }), { theme: { textSize: 15 } }).grid.top, "lying lines keep their labels in the plot");
    // nothing switched on: no markLine, no reach
    const plain = toEChartsOption(pivot({ chart: { type: "bar" } }));
    assert.equal(plain.series[0].markLine, undefined);
    assert.equal(plain.yAxis.dataMax, undefined);
});

test("the ECharts option of a stack: its total's lines on its top series, in the reference colour", () => {
    const option = toEChartsOption(pivot({ chart: { type: "area", stacked: true, referenceLines: { average: true, trend: false, target: null } } }), { theme: { referenceColor: "#123456" } });
    assert.equal(option.series[0].markLine, undefined);
    const [average] = option.series[1].markLine.data;
    assert.equal(average.yAxis, 30);
    assert.equal(average.lineStyle.color, "#123456");
    // German words from the labels, the number as the view's locale writes it
    const de = toEChartsOption(pivot({ formatting: { locale: "de-DE" }, chart: { type: "bar", referenceLines: { average: false, trend: false, target: 1234.5 } } }), { labels: { referenceLines: { average: "Durchschnitt", trend: "Trend", target: "Ziel" } } });
    assert.equal(de.series[1].markLine.data[0].label.formatter(), "Ziel 1.234,5");
});

test("chartThemeFrom: the colour of the lines of no series from --pk-chart-reference", () => {
    const tokens = { "--pk-chart-reference": " #abcdef ", "--pk-muted": "#101010" };
    assert.equal(chartThemeFrom({ getPropertyValue: (n) => tokens[n] ?? "" }).referenceColor, "#abcdef");
    assert.equal(chartThemeFrom({ getPropertyValue: () => "" }).referenceColor, undefined);
    // without it the lines take the text colour
    const r = pivot({ chart: { type: "bar", referenceLines: { average: false, trend: false, target: 12 } } });
    assert.equal(toEChartsOption(r, { theme: { textColor: "#101010" } }).series[1].markLine.data[0].lineStyle.color, "#101010");
});
