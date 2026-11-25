// High and low points on a chart (#574): a dot at each series' highest and lowest value, labelled
// "▲ 40" and "▼ 10". Which charts draw them (the rule of the reference lines), the numbers, and the
// marks of the ECharts option (markPoint), for bars, lines and areas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, emptyView, encode, normalize, referenceLineRules, toEChartsOption } from "pivotkit-core";
import { decorateOption, extremePoints, referenceLineChecks } from "pivotkit-core/chart";
import { MONTH, MONTHLY } from "./fixtures.js";

const data = encode(MONTHLY);
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
    const rows = encode([...MONTHLY, { Date: "2026-02-15", Region: "North", Product: "B", Revenue: -20 }]);
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
    // the dot in the series' colour; the glyph and the number in the text colour, which reads on every
    // background (a series' colour such as a light grey or yellow does not, as text: #913)
    assert.equal(a.markPoint.data[0].itemStyle.color, "#111111");
    assert.equal(b.markPoint.data[0].itemStyle.color, "#222222");
    assert.equal(b.markPoint.data[0].label.rich.s.color, undefined, "the glyph takes the label's colour");
    assert.equal(a.markPoint.data[0].label.color, "#333333");
    assert.equal(a.markPoint.data[0].label.fontSize, 15);
    // a fixed colour (chart.colors) wins over the palette for the dot; the label keeps the text colour
    const fixed = toEChartsOption(pivot({ chart: { type: "line", colors: [{ name: "B", color: "#abcdef" }], referenceLines: ON } }), { theme });
    assert.equal(fixed.series[1].markPoint.data[0].itemStyle.color, "#abcdef");
    assert.equal(fixed.series[1].markPoint.data[0].label.rich.s.color, undefined);
    assert.equal(fixed.series[1].markPoint.data[0].label.color, "#333333");
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

test("decorateOption: grouped bars (#913): a point's label stands over its own bar and never across a taller neighbour", () => {
    const style = { getPropertyValue: () => "" };
    // three teams side by side per month; A's high (50,000) between a taller B (100,000) and nothing
    const rows = encode([
        { Month: "m1", Team: "A", N: 50_000 },
        { Month: "m1", Team: "B", N: 100_000 },
        { Month: "m1", Team: "C", N: 10_000 },
        { Month: "m2", Team: "A", N: 20_000 },
        { Month: "m2", Team: "B", N: 30_000 },
        { Month: "m2", Team: "C", N: 40_000 }
    ]);
    const r = computePivot(rows, { rows: ["Month"], cols: ["Team"], values: [{ field: "N", agg: "sum" }], sort: [], formatting: { locale: "en-US" }, chart: { type: "bar", referenceLines: ON } });
    const highOf = (option, i) => option.series[i].markPoint.data.find((d) => d.name === "max");
    const out = decorateOption(toEChartsOption(r), style, { width: 360, height: 300 });
    // above A's bar the label would run across B's taller bar, beside it too: left out, the dot stays
    assert.equal(highOf(out, 0).label.show, false, JSON.stringify(highOf(out, 0).label));
    // B's high is the tallest bar: its label stays above it
    assert.notEqual(highOf(out, 1).label.show, false);
    // one column of bars (stacked) has no neighbours to avoid
    const stacked = decorateOption(toEChartsOption(computePivot(rows, { rows: ["Month"], cols: ["Team"], values: [{ field: "N", agg: "sum" }], sort: [], chart: { type: "bar", stacked: true, referenceLines: ON } })), style, { width: 360, height: 300 });
    assert.ok(stacked.series.some((s) => (s.markPoint?.data ?? []).some((d) => d.label.show !== false)));
});

test("decorateOption: grouped bars (#913): a label with no room over its bar or beside its dot stands over its group's highest bar", () => {
    const style = { getPropertyValue: () => "" };
    // A's high (50,000) next to a taller B (90,000) in m1; B's own high is in m2, so m1's group has room above
    const rows = encode([
        { Month: "m1", Team: "A", N: 50_000 },
        { Month: "m1", Team: "B", N: 90_000 },
        { Month: "m1", Team: "C", N: 10_000 },
        { Month: "m2", Team: "A", N: 20_000 },
        { Month: "m2", Team: "B", N: 100_000 },
        { Month: "m2", Team: "C", N: 40_000 }
    ]);
    const r = computePivot(rows, { rows: ["Month"], cols: ["Team"], values: [{ field: "N", agg: "sum" }], sort: [], formatting: { locale: "en-US" }, chart: { type: "bar", referenceLines: ON } });
    // the real heights: 100,000 at 50 px, 0 at 250 px
    const pixelOf = (v) => 250 - v * 0.002;
    const out = decorateOption(toEChartsOption(r), style, { width: 360, height: 300, pixelOf });
    const label = out.series[0].markPoint.data.find((d) => d.name === "max").label;
    assert.notEqual(label.show, false, JSON.stringify(label));
    assert.equal(label.position, "top");
    // moved up from A's top (150 px): the label's foot (its distance above the 5 px dot) above B's top (70 px)
    assert.ok(150 - 5 - label.distance + label.offset[1] <= pixelOf(90_000), JSON.stringify(label));
});

test("decorateOption: dense grouped bars (#913): the chart's highest and lowest label are placed first, before the other series' labels take their room", () => {
    const style = { getPropertyValue: () => "" };
    // three series over six months; the chart's lowest (13) and highest (100) are B's, the second series
    const values = { A: [40, 89, 84, 34, 91, 65], B: [31, 60, 13, 100, 73, 57], C: [51, 68, 22, 22, 99, 78] };
    const rows = encode(Object.entries(values).flatMap(([Team, list]) => list.map((N, i) => ({ Month: `m${i + 1}`, Team, N }))));
    const r = computePivot(rows, { rows: ["Month"], cols: ["Team"], values: [{ field: "N", agg: "sum" }], sort: [], formatting: { locale: "en-US" }, chart: { type: "bar", referenceLines: ON } });
    const out = decorateOption(toEChartsOption(r), style, { width: 360, height: 300 });
    const shown = out.series.flatMap((s) => (s.markPoint?.data ?? []).filter((d) => d.label.show !== false).map((d) => text(d.label)));
    assert.ok(shown.includes("▲ 100") && shown.includes("▼ 13"), shown.join(", "));
    // lossy: not every label has room
    assert.ok(shown.length < 6, shown.join(", "));
});

test("decorateOption: lines keep the series' order, so close lows move apart instead of a label left out", () => {
    const style = { getPropertyValue: () => "" };
    // three years of monthly temperatures: the lows of January and February close together
    const values = { 2023: [4.1, 2.8, 5.5, 7.7, 14, 19.4, 20.1, 19.6, 18.9, 12.1, 5.5, 3.6], 2024: [1.2, 6.6, 7.6, 10.9, 16.9, 18, 20.4, 21.4, 17.5, 11.5, 5.4, 3.8], 2025: [2.3, 0.6, 6.2, 12, 13.9, 19.7, 19.6, 18.9, 15.7, 10.3, 5.2, 3.1] };
    const rows = encode(Object.entries(values).flatMap(([Year, list]) => list.map((T, i) => ({ Month: `m${String(i + 1).padStart(2, "0")}`, Year, T }))));
    const r = computePivot(rows, { rows: ["Month"], cols: ["Year"], values: [{ field: "T", agg: "sum", format: "number:1" }], sort: [], formatting: { locale: "en-US" }, chart: { type: "line", referenceLines: ON } });
    const out = decorateOption(toEChartsOption(r), style, { width: 1080, height: 420 });
    const shown = out.series.flatMap((s) => (s.markPoint?.data ?? []).filter((d) => d.label.show !== false).map((d) => text(d.label)));
    assert.deepEqual(shown.sort(), ["▲ 20.1", "▲ 21.4", "▲ 19.7", "▼ 0.6", "▼ 1.2", "▼ 2.8"].sort());
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
    assert.equal(all.length, 16, "a dot for each series' highest and lowest");
    assert.equal(all.filter((d) => d.label.show !== false).length, 16);
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
    // without the option, or with it undefined, the view's own; null switches them off
    assert.equal(toEChartsOption(pivot({ chart: { type: "line", referenceLines: ON } })).series[0].markPoint.data.length, 2);
    assert.equal(toEChartsOption(pivot({ chart: { type: "line", referenceLines: ON } }), { chart: { referenceLines: undefined } }).series[0].markPoint.data.length, 2);
    assert.equal(toEChartsOption(pivot({ chart: { type: "line", referenceLines: ON } }), { chart: { referenceLines: null } }).series[0].markPoint, undefined);
});
