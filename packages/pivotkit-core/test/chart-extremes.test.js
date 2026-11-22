// High and low points on a chart (#574): a dot at each series' highest and lowest value, labelled
// "▲ 40" and "▼ 10". Which charts draw them (the rule of the reference lines), the numbers, and the
// marks of the ECharts option (markPoint), for bars, lines and areas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, emptyView, encode, normalize, referenceLineRules, toEChartsOption } from "pivotkit-core";
import { decorateOption, extremePoints, referenceLineChecks } from "pivotkit-core/chart";

/**
 * Revenue per month and product. A climbs by 10 a month (10, 20, 30, 40), B stays near 5 (5, 5, 7, 3).
 * Stacked, the months are 15, 25, 37, 43.
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
const ON = { average: false, trend: false, target: null, extremes: true };
const pivot = (view, rows = data) => computePivot(rows, { derived: [MONTH], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale: "en-US" }, ...view });
/** The points as [kind, series, category, value]. */
const brief = (points) => points.map((p) => [p.kind, p.series, p.index, p.value]);
/** A label's text without its glyph's markup ("{s|▲} 40" is "▲ 40"). */
const text = (label) => label.formatter().replace(/^\{s\|([^}]*)\} /, "$1 ");

test("chart.referenceLines.extremes: off by default, kept when true, reported when it is no boolean", () => {
    assert.equal(emptyView().chart.referenceLines.extremes, false);
    const ok = normalize({ chart: { referenceLines: { extremes: true } } }, data);
    assert.equal(ok.view.chart.referenceLines.extremes, true);
    assert.deepEqual(ok.issues, []);
    assert.deepEqual(normalize(ok.view, data).view.chart, ok.view.chart);
    assert.equal(normalize({ chart: { referenceLines: { extremes: "yes" } } }, data).view.chart.referenceLines.extremes, false);
});

test("which charts get high and low points: the rule of the average", () => {
    const rule = (chart, view = {}) => referenceLineRules(pivot({ ...view, chart }).view, { stacked: false, horizontal: false, ...chart }, data).extremes;
    for (const type of ["bar", "line", "area"]) {
        assert.equal(rule({ type }), true, type);
    }
    assert.equal(rule({ type: "bar", horizontal: true }), true);
    // no time line needed: regions get them too
    assert.equal(rule({ type: "bar" }, { rows: ["Region"] }), true);
    for (const type of ["pie", "donut", "heatmap"]) {
        assert.equal(rule({ type }), false, type);
    }
    // a stack of averages has no total to mark; a stack to 100 % is the same height everywhere
    assert.equal(rule({ type: "bar", stacked: true }, { values: [{ field: "Revenue", agg: "average" }] }), false);
    assert.equal(rule({ type: "bar", stacked: true, stackPercent: true }), false);
    assert.equal(rule({ type: "bar", stacked: true }), true);
});

test("the numbers: each series' highest and lowest value at its category", () => {
    const r = pivot({ chart: { type: "line", referenceLines: ON } });
    assert.deepEqual(brief(extremePoints(r)), [
        ["max", 0, 3, 40],
        ["min", 0, 0, 10],
        ["max", 1, 2, 7],
        ["min", 1, 3, 3]
    ]);
    // each point writes its value as its series does: a sum of whole numbers, a mean with one decimal
    assert.equal(extremePoints(r)[0].format(1234.5), "1,235");
    const mean = pivot({ values: [{ field: "Revenue", agg: "average", format: "number:1" }], chart: { type: "line", referenceLines: ON } });
    assert.equal(extremePoints(mean)[0].format(40), "40.0");
    // switched off: nothing
    assert.deepEqual(extremePoints(pivot({ chart: { type: "line" } })), []);
    // on a chart that draws none: nothing
    assert.deepEqual(extremePoints(pivot({ chart: { type: "pie", referenceLines: ON } })), []);
});

test("a stack marks its total; a series hidden in the legend is left out of it and has no points", () => {
    const stack = pivot({ chart: { type: "bar", stacked: true, referenceLines: ON } });
    assert.deepEqual(brief(extremePoints(stack)), [
        ["max", null, 3, 43],
        ["min", null, 0, 15]
    ]);
    const hidden = pivot({ chart: { type: "bar", stacked: true, hidden: ["B"], referenceLines: ON } });
    assert.deepEqual(brief(extremePoints(hidden)), [
        ["max", null, 3, 40],
        ["min", null, 0, 10]
    ]);
    const side = pivot({ chart: { type: "line", hidden: ["A"], referenceLines: ON } });
    assert.deepEqual(brief(extremePoints(side)), [
        ["max", 1, 2, 7],
        ["min", 1, 3, 3]
    ]);
});

test("a stack with a part below zero has no single total: no points, and the checks say so", () => {
    const rows = encode([...ROWS, { Date: "2026-02-15", Region: "North", Product: "B", Revenue: -20 }]);
    const r = pivot({ chart: { type: "bar", stacked: true, referenceLines: ON } }, rows);
    assert.deepEqual(extremePoints(r), []);
    const checks = referenceLineChecks(r);
    assert.equal(checks.extremes, false);
    assert.ok(checks.notes.includes("negative"));
    assert.equal(referenceLineChecks(pivot({ chart: { type: "line", referenceLines: ON } })).extremes, true);
});

test("ties take the first; a flat series, a single point and empty categories get no point of their own", () => {
    const rows = encode([
        { Month: "a", Product: "A", Revenue: 5 },
        { Month: "b", Product: "A", Revenue: 9 },
        { Month: "c", Product: "A", Revenue: 9 },
        { Month: "d", Product: "A", Revenue: 2 },
        { Month: "a", Product: "Flat", Revenue: 4 },
        { Month: "b", Product: "Flat", Revenue: 4 },
        { Month: "c", Product: "One", Revenue: 6 }
    ]);
    const r = computePivot(rows, { rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", referenceLines: ON } });
    assert.deepEqual(brief(extremePoints(r)), [
        ["max", 0, 1, 9],
        ["min", 0, 3, 2]
    ]);
});

test("the ECharts option: a silent markPoint per series, a dot in its colour, ▲ above the highest and ▼ below the lowest", () => {
    const theme = { colors: ["#111111", "#222222"], textColor: "#333333", textSize: 15 };
    const option = toEChartsOption(pivot({ chart: { type: "line", referenceLines: ON } }), { theme });
    const [a, b] = option.series;
    assert.equal(a.markPoint.silent, true);
    assert.deepEqual(
        a.markPoint.data.map((d) => d.coord),
        [
            [3, 40],
            [0, 10]
        ]
    );
    assert.deepEqual(a.markPoint.data.map((d) => text(d.label)), ["▲ 40", "▼ 10"]);
    assert.deepEqual(a.markPoint.data.map((d) => d.label.position), ["top", "bottom"]);
    assert.deepEqual(b.markPoint.data.map((d) => text(d.label)), ["▲ 7", "▼ 3"]);
    // the dot and the glyph in the series' colour; the number in the text colour, which reads on
    // every background (a palette colour such as yellow does not, as text)
    assert.equal(a.markPoint.data[0].itemStyle.color, "#111111");
    assert.equal(b.markPoint.data[0].itemStyle.color, "#222222");
    assert.equal(b.markPoint.data[0].label.rich.s.color, "#222222");
    assert.equal(a.markPoint.data[0].label.color, "#333333");
    assert.equal(a.markPoint.data[0].label.fontSize, 15);
    // a fixed colour (chart.colors) wins over the palette, for the dot and the glyph
    const fixed = toEChartsOption(pivot({ chart: { type: "line", colors: [{ name: "B", color: "#abcdef" }], referenceLines: ON } }), { theme });
    assert.equal(fixed.series[1].markPoint.data[0].itemStyle.color, "#abcdef");
    assert.equal(fixed.series[1].markPoint.data[0].label.rich.s.color, "#abcdef");
    // nothing switched on: no markPoint
    assert.equal(toEChartsOption(pivot({ chart: { type: "line" } })).series[0].markPoint, undefined);
});

test("the ECharts option of a stack and of horizontal bars", () => {
    const stack = toEChartsOption(pivot({ chart: { type: "bar", stacked: true, referenceLines: ON } }), { theme: { referenceColor: "#123456" } });
    assert.equal(stack.series[0].markPoint, undefined);
    assert.deepEqual(
        stack.series[1].markPoint.data.map((d) => [d.coord, d.itemStyle.color]),
        [
            [[3, 43], "#123456"],
            [[0, 15], "#123456"]
        ]
    );
    // bars: both labels past the bar's end, where nothing else is drawn
    assert.deepEqual(stack.series[1].markPoint.data.map((d) => d.label.position), ["top", "top"]);
    const h = toEChartsOption(pivot({ chart: { type: "bar", horizontal: true, referenceLines: ON } }));
    assert.deepEqual(
        h.series[0].markPoint.data.map((d) => d.coord),
        [
            [40, 3],
            [10, 0]
        ]
    );
    assert.deepEqual(h.series[0].markPoint.data.map((d) => d.label.position), ["right", "right"]);
});

test("decorateOption: the value axis keeps room for the labels at the plot's ends", () => {
    const style = { getPropertyValue: () => "" };
    const on = decorateOption(toEChartsOption(pivot({ chart: { type: "line", referenceLines: ON } })), style, { width: 390, height: 300 });
    // the highest label above 40 stays inside the plot
    assert.ok(on.yAxis.dataMax > 40, `dataMax ${on.yAxis.dataMax}`);
    // below zero, the lowest label below -10 too
    const minus = encode([5, -10, 20].map((v, i) => ({ Month: `m${i}`, Revenue: v })));
    const below = decorateOption(toEChartsOption(computePivot(minus, { rows: ["Month"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", referenceLines: ON } })), style, { width: 390, height: 300 });
    assert.ok(below.yAxis.dataMin < -10, `dataMin ${below.yAxis.dataMin}`);
    const off = decorateOption(toEChartsOption(pivot({ chart: { type: "line" } })), style, { width: 390, height: 300 });
    assert.equal(off.yAxis.dataMax, undefined);
    // values near zero, all above it: the lowest label goes beside its dot, the axis stays at zero
    const near = encode([1, 30, 12].map((v, i) => ({ Month: `m${i}`, Revenue: v })));
    const nearOption = decorateOption(toEChartsOption(computePivot(near, { rows: ["Month"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", referenceLines: ON } })), style, { width: 390, height: 300 });
    assert.equal(nearOption.yAxis.dataMin, undefined);
    assert.equal(nearOption.series[0].markPoint.data.find((d) => d.name === "min").label.position, "right");
    // bars start at zero: their labels all sit above, so the axis only reaches higher
    const bars = decorateOption(toEChartsOption(pivot({ chart: { type: "bar", referenceLines: ON } })), style, { width: 390, height: 300 });
    assert.ok(bars.yAxis.dataMax > 40);
    assert.equal(bars.yAxis.dataMin, undefined);
});

test("decorateOption: two labels at one category that would cover each other move apart, sideways", () => {
    const style = { getPropertyValue: () => "" };
    // February: 2024's low (22.8) just above 2025's (20.6)
    const rows = encode([
        { Month: "m1", Year: "2024", T: 24 },
        { Month: "m2", Year: "2024", T: 22.8 },
        { Month: "m3", Year: "2024", T: 29 },
        { Month: "m1", Year: "2025", T: 23 },
        { Month: "m2", Year: "2025", T: 20.6 },
        { Month: "m3", Year: "2025", T: 40 }
    ]);
    const r = computePivot(rows, { rows: ["Month"], cols: ["Year"], values: [{ field: "T", agg: "sum", format: "number:1" }], sort: [], chart: { type: "line", referenceLines: ON } });
    const lows = (option) => option.series.map((s) => s.markPoint.data.find((d) => text(d.label).startsWith("▼")));
    const before = lows(toEChartsOption(r));
    assert.deepEqual(before.map((d) => d.coord[0]), [1, 1], "both lows in February");
    const out = decorateOption(toEChartsOption(r), style, { width: 390, height: 260 });
    const [first, second] = lows(out);
    const sides = [first.label.position, second.label.position];
    assert.notDeepEqual(sides[0], sides[1], `two labels at one place: ${JSON.stringify(sides)}`);
    // with the real heights (pixelOf) far apart, both stay below their dots
    const far = decorateOption(toEChartsOption(r), style, { width: 390, height: 260, pixelOf: (v) => 1000 - v * 100 });
    assert.deepEqual(lows(far).map((d) => d.label.position), ["bottom", "bottom"]);
});

test("decorateOption: a label reads over a line it crosses, outlined in the background's colour", () => {
    const style = { getPropertyValue: (name) => (name === "--pk-surface" ? "#101418" : "") };
    const out = decorateOption(toEChartsOption(pivot({ chart: { type: "line", referenceLines: ON } })), style, { width: 800, height: 480 });
    const label = out.series[0].markPoint.data[0].label;
    assert.deepEqual([label.textBorderColor, label.textBorderWidth, label.rich.s.textBorderColor], ["#101418", 3, "#101418"]);
    assert.equal(out.series[0].markPoint.data[0].itemStyle.borderColor, "#101418");
});

test("decorateOption: more than eight series keep every dot, but only the chart's highest and lowest value keep a label", () => {
    const style = { getPropertyValue: () => "" };
    const rows = encode(Array.from({ length: 10 }, (_, k) => [1, 2, 3].map((m) => ({ Month: `m${m}`, City: `c${k}`, T: k * 3 + m }))).flat());
    const r = computePivot(rows, { rows: ["Month"], cols: ["City"], values: [{ field: "T", agg: "sum" }], chart: { type: "line", referenceLines: ON } });
    const out = decorateOption(toEChartsOption(r), style, { width: 1200, height: 480 });
    const data = out.series.flatMap((s) => s.markPoint?.data ?? []);
    assert.equal(data.length, 20, "a dot for each series' highest and lowest");
    assert.deepEqual(data.filter((d) => d.label.show !== false).map((d) => d.text).sort(), ["▲ 30", "▼ 1"]);
    // eight series: every label
    const eight = computePivot(rows, { rows: ["Month"], cols: ["City"], values: [{ field: "T", agg: "sum" }], filters: [{ field: "City", type: "in", items: ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"] }], chart: { type: "line", referenceLines: ON } });
    const all = decorateOption(toEChartsOption(eight), style, { width: 1200, height: 480 }).series.flatMap((s) => s.markPoint?.data ?? []);
    assert.ok(all.filter((d) => d.label.show !== false).length > 2);
});

test("toEChartsOption's chart option sets the reference lines over the view's: a whole referenceLines, a key left out is off", () => {
    const plain = pivot({ chart: { type: "line" } });
    // the view has none; the option asks for the high and low points and an average
    const asked = toEChartsOption(plain, { chart: { referenceLines: { extremes: true, average: true } } });
    assert.deepEqual(
        asked.series[0].markPoint.data.map((d) => d.coord),
        [
            [3, 40],
            [0, 10]
        ]
    );
    assert.ok(asked.series[0].markLine?.data.length, JSON.stringify(asked.series[0].markLine));
    // the view has them; the option's referenceLines without them switches them off
    const off = toEChartsOption(pivot({ chart: { type: "line", referenceLines: ON } }), { chart: { referenceLines: { target: 25 } } });
    assert.equal(off.series[0].markPoint, undefined);
    assert.equal(off.series.flatMap((s) => s.markLine?.data ?? []).length, 1, "the target alone");
    // without the option, the view's own
    assert.equal(toEChartsOption(pivot({ chart: { type: "line", referenceLines: ON } })).series[0].markPoint.data.length, 2);
});
