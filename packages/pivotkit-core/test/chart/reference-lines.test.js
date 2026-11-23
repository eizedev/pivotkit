// Reference lines on a chart (#48): an average, a target and a linear trend. Which charts draw which
// line, the numbers, and the marks of the ECharts option (markLine), for bars, lines and areas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartThemeFrom, computePivot, emptyView, encode, normalize, referenceLineRules, toEChartsOption, toSeries, valueAddsUp } from "pivotkit-core";
import { referenceLineChecks, referenceLines } from "pivotkit-core/chart";
import { MONTH, MONTHLY } from "./fixtures.js";

const data = encode(MONTHLY);
const pivot = (view) => computePivot(data, { derived: [MONTH], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale: "en-US" }, ...view });
const close = (a, b) => Math.abs(a - b) < 1e-9;
/** The lines as [kind, series, numbers...], rounded to 9 places. */
/** A label's text without its line sample ("{s|— —} Average 25" is "Average 25"). */
const words = (label) => label.formatter().replace(/^\{s\|[^}]*\} /, "");
/** The three switches of referenceLineRules, without its notes. */
const flags = ({ average, trend, target }) => ({ average, trend, target });
const brief = (lines) => lines.map((l) => [l.kind, l.series, ...(l.kind === "trend" ? [l.from, l.to] : [l.value])].map((x) => (typeof x === "number" ? Math.round(x * 1e9) / 1e9 : x)));

test("chart.referenceLines: off by default; average, trend and a target as a number are kept; anything else is reported", () => {
    assert.deepEqual(emptyView().chart.referenceLines, { average: false, trend: false, target: null, extremes: false });
    const ok = normalize({ chart: { referenceLines: { average: true, trend: true, target: 1500.5 } } }, data);
    assert.deepEqual(ok.view.chart.referenceLines, { average: true, trend: true, target: 1500.5, extremes: false });
    assert.deepEqual(ok.issues, []);
    const bad = normalize({ chart: { referenceLines: { average: "yes", target: "lots", color: "red" } } }, data);
    assert.deepEqual(bad.view.chart.referenceLines, { average: false, trend: false, target: null, extremes: false });
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
    const v = (chart, view = {}) => flags(referenceLineRules(pivot({ ...view, chart }).view, { stacked: false, horizontal: false, ...chart }, data));
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
    const rules = (values) => flags(referenceLineRules(pivot({ values }).view, { type: "bar", stacked: true, horizontal: false }, data));
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
    // a trend is drawn from category to category: its value at each, so a gap in time bends it right
    assert.equal(a.markLine.silent, true);
    assert.deepEqual(a.markLine.symbol, ["none", "none"]);
    // each series' average and trend on it; the target, a line of no series, on the last series
    assert.deepEqual(a.markLine.data.map(where), [25, [[0, 10], [1, 20]], [[1, 20], [2, 30]], [[2, 30], [3, 40]]]);
    assert.deepEqual(b.markLine.data.map(where).map((d) => (Array.isArray(d) ? d.map(([x, y]) => [x, Math.round(y * 10) / 10]) : d)), [5, [[0, 5.6], [1, 5.2]], [[1, 5.2], [2, 4.8]], [[2, 4.8], [3, 4.4]], 80]);
    const target = b.markLine.data[4];
    assert.equal(target.lineStyle.color, "#123456");
    assert.equal(target.lineStyle.type, "solid");
    assert.equal(a.markLine.data[0].lineStyle.color, undefined, "a series' line takes the series' colour");
    assert.equal(a.markLine.data[0].lineStyle.type, "dashed");
    assert.equal(a.markLine.data[1][0].lineStyle.type, "dotted");
    // only the trend's last part has its label
    assert.deepEqual(a.markLine.data.slice(1).map((d) => d[0].label.show !== false), [false, false, true]);
    assert.equal(words(target.label), "Target 80");
    assert.equal(words(a.markLine.data[0].label), "Average 25");
    assert.equal(words(a.markLine.data[3][0].label), "Trend");
    assert.equal(target.label.color, "#333333");
    assert.equal(target.label.fontSize, 15);
    // the value axis reaches the target, past the tallest bar (40)
    assert.deepEqual([option.yAxis.dataMin, option.yAxis.dataMax], [4.4, 80]);
    // a horizontal chart: the lines stand on the value axis, x
    const h = toEChartsOption(pivot({ chart: { type: "bar", horizontal: true, referenceLines: { average: true, trend: true, target: -5 } } }));
    assert.deepEqual(h.series[0].markLine.data.map(where), [25, [[10, 0], [20, 1]], [[20, 1], [30, 2]], [[30, 2], [40, 3]]]);
    assert.equal(h.series[1].markLine.data[4].xAxis, -5);
    assert.equal(h.xAxis.dataMin, -5);
    // its lines stand upright: their labels in rows above the plot, which makes room for them
    const labels = [...h.series[0].markLine.data, ...h.series[1].markLine.data].map((d) => (Array.isArray(d) ? d[0] : d).label).filter((l) => l.show !== false);
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
    // the label writes the number as the value axis does, short; the tooltip has it whole
    assert.equal(words(de.series[1].markLine.data[0].label), "Ziel 1234,5");
});

test("chartThemeFrom: the colour of the lines of no series from --pk-chart-reference", () => {
    const tokens = { "--pk-chart-reference": " #abcdef ", "--pk-muted": "#101010" };
    assert.equal(chartThemeFrom({ getPropertyValue: (n) => tokens[n] ?? "" }).referenceColor, "#abcdef");
    assert.equal(chartThemeFrom({ getPropertyValue: () => "" }).referenceColor, undefined);
    // without it the lines take the text colour
    const r = pivot({ chart: { type: "bar", referenceLines: { average: false, trend: false, target: 12 } } });
    assert.equal(toEChartsOption(r, { theme: { textColor: "#101010" } }).series[1].markLine.data[0].lineStyle.color, "#101010");
});

/** A pivot of `rows` by a grouping of Date (`by`), Product on Columns unless `cols` says otherwise. */
const timePivot = (rows, by, view = {}) => {
    const d = encode(rows);
    return { d, r: computePivot(d, { derived: [{ name: "When", field: "Date", by }], rows: ["When"], cols: [], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale: "en-US" }, ...view }) };
};
const on = { average: true, trend: true, target: null };

test("a trend fits the real time: a gap of 8 months counts as 8, of 8 days as 8", () => {
    // 10 a month: January 10, February 20, October 100 (8 months after February)
    const months = [["2026-01-15", 10], ["2026-02-15", 20], ["2026-10-15", 100]].map(([Date, Revenue]) => ({ Date, Revenue }));
    const m = timePivot(months, "yearMonth", { chart: { type: "line", referenceLines: on } }).r;
    const [, trend] = referenceLines(m);
    assert.deepEqual([trend.from, trend.to].map((x) => Math.round(x * 1e9) / 1e9), [10, 100]);
    assert.ok(close(trend.at(1), 20), "on the line, not at the middle of the axis");
    // by day: 1, 2 and 10 on the 1st, 2nd and 10th
    const days = [["2026-03-01", 1], ["2026-03-02", 2], ["2026-03-10", 10]].map(([Date, Revenue]) => ({ Date, Revenue }));
    const t = referenceLines(timePivot(days, "day", { chart: { type: "bar", referenceLines: on } }).r)[1];
    assert.deepEqual([t.from, t.to, t.at(1)].map((x) => Math.round(x * 1e9) / 1e9), [1, 10, 2]);
    // the date field itself, quarters, years and ISO weeks too
    const dates = timePivot(days, "day").d;
    const raw = computePivot(dates, { rows: ["Date"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", referenceLines: on } });
    assert.ok(close(referenceLines(raw)[1].at(1), 2));
    const quarters = [["2025-02-01", 10], ["2025-05-01", 20], ["2026-05-01", 60]].map(([Date, Revenue]) => ({ Date, Revenue }));
    assert.ok(close(referenceLines(timePivot(quarters, "yearQuarter", { chart: { type: "line", referenceLines: on } }).r)[1].at(1), 20));
    const years = [["2020-02-01", 10], ["2021-05-01", 20], ["2025-05-01", 60]].map(([Date, Revenue]) => ({ Date, Revenue }));
    assert.ok(close(referenceLines(timePivot(years, "year", { chart: { type: "line", referenceLines: on } }).r)[1].at(1), 20));
    const weeks = [["2025-12-29", 10], ["2026-01-05", 20], ["2026-03-02", 100]].map(([Date, Revenue]) => ({ Date, Revenue }));
    assert.ok(close(referenceLines(timePivot(weeks, "yearWeek", { chart: { type: "line", referenceLines: on } }).r)[1].at(1), 20));
});

test("a category without a date (blank) puts the trend on the categories' order, and the rules say so", () => {
    const rows = [["2026-01-15", 10], ["2026-02-15", 20], [null, 30]].map(([Date, Revenue]) => ({ Date, Revenue }));
    const { r } = timePivot(rows, "yearMonth", { chart: { type: "line", referenceLines: on } });
    const series = toSeries(r);
    const rules = referenceLineChecks(r, { series });
    assert.deepEqual([rules.trend, rules.notes], [true, ["byIndex"]]);
    const [, trend] = referenceLines(r, { series });
    assert.deepEqual([trend.from, trend.to].map((x) => Math.round(x * 1e9) / 1e9), [10, 30]);
    // with every category dated: no note
    const dated = timePivot(rows.slice(0, 2), "yearMonth", { chart: { type: "line" } });
    assert.deepEqual(referenceLineChecks(dated.r).notes, []);
});

test("a stack with parts below zero has no total: no average and no trend of it, the target stays", () => {
    // B loses money in March: the stack is 15, 25, 25, 43
    const rows = MONTHLY.map((r) => (r.Product === "B" && r.Date === "2026-03-15" ? { ...r, Revenue: -5 } : r));
    const d = encode(rows);
    const r = computePivot(d, { derived: [MONTH], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar", stacked: true, referenceLines: { average: true, trend: true, target: 30 } } });
    const series = toSeries(r);
    const rules = referenceLineChecks(r, { series });
    assert.deepEqual([flags(rules), rules.notes], [{ average: false, trend: false, target: true }, ["negative"]]);
    assert.deepEqual(brief(referenceLines(r, { series })), [["target", null, 30]]);
    // side by side, a value below zero is just a value
    const side = computePivot(d, { ...r.view, chart: { ...r.view.chart, stacked: false } });
    assert.deepEqual(brief(referenceLines(side)).map((l) => l.slice(0, 2)), [["average", 0], ["average", 1], ["trend", 0], ["trend", 1], ["target", null]]);
    // a series hidden in the legend (chart.hidden) is not part of the stack: without B there is nothing below zero
    const hidden = { ...r.view.chart, hidden: ["B"] };
    assert.deepEqual(flags(referenceLineChecks(r, { series, chart: hidden })), { average: true, trend: true, target: true });
    assert.deepEqual(brief(referenceLines(r, { series, chart: hidden })), [["average", null, 25], ["trend", null, 10, 40], ["target", null, 30]]);
});

test("a null in the middle: the average leaves it out, the trend keeps the real time", () => {
    // A has no revenue in February: 10, -, 30, 40
    const rows = MONTHLY.filter((r) => !(r.Product === "A" && r.Date === "2026-02-15"));
    const r = computePivot(encode(rows), { derived: [MONTH], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", referenceLines: on } });
    const [a] = referenceLines(r);
    assert.ok(close(a.value, 80 / 3));
    const trend = referenceLines(r).find((l) => l.kind === "trend" && l.series === 0);
    // x 0, 2, 3 and y 10, 30, 40: the line y = 10 + 10x
    assert.deepEqual([trend.from, trend.to, trend.at(1)].map((x) => Math.round(x * 1e9) / 1e9), [10, 40, 20]);
});

test("a value shown as a share: the lines are shares, written as the value is", () => {
    const r = pivot({ cols: [], values: [{ field: "Revenue", agg: "sum", showAs: { type: "percentOfGrandTotal" } }], chart: { type: "bar", referenceLines: { average: true, trend: false, target: 0.3 } } });
    const lines = referenceLines(r);
    assert.deepEqual(brief(lines), [["average", 0, 0.25], ["target", null, 0.3]]);
    assert.match(lines[1].format(0.3), /^30(\.0)?%$/);
});

test("a target over values in different units has nothing to measure: refused, with a note", () => {
    const rules = (values) => referenceLineChecks(pivot({ values, chart: { type: "bar" } }));
    const mixed = rules([{ field: "Revenue", agg: "sum" }, { agg: "count" }]);
    assert.deepEqual([flags(mixed), mixed.notes], [{ average: true, trend: true, target: false }, ["mixedUnits"]]);
    const formats = rules([{ field: "Revenue", agg: "sum", format: "currency:EUR" }, { field: "Revenue", agg: "average" }]);
    assert.deepEqual(formats.notes, ["mixedUnits"]);
    assert.deepEqual(rules([{ field: "Revenue", agg: "sum" }, { field: "Revenue", agg: "max" }]).notes, []);
    const r = pivot({ values: [{ field: "Revenue", agg: "sum" }, { agg: "count" }], chart: { type: "bar", referenceLines: { average: false, trend: false, target: 30 } } });
    assert.deepEqual(referenceLines(r), []);
});

test("the notes: a stack without a total, a 100 % stack, no time line", () => {
    // the chart as drawn (chartPlan's, and chart.stackPercent of a view that has it)
    const checks = (chart, view = {}) => referenceLineChecks(pivot(view), { chart: { type: "bar", stacked: false, ...chart } });
    assert.deepEqual(checks({ stacked: true }, { values: [{ field: "Revenue", agg: "average" }] }).notes, ["noTotal"]);
    // stacked to 100 %: every stack is the same height, no line means anything
    const percent = checks({ stacked: true, stackPercent: true });
    assert.deepEqual([flags(percent), percent.notes], [{ average: false, trend: false, target: false }, ["percentStack"]]);
    assert.deepEqual(flags(referenceLineRules(pivot().view, { type: "bar", stacked: true, stackPercent: true }, data)), { average: false, trend: false, target: false });
    assert.deepEqual(checks({}, { rows: ["Region"] }).notes, ["noTime"]);
    assert.deepEqual(checks({ type: "pie" }).notes, []);
    // counts beside a field's values: two units, no target
    assert.deepEqual(checks({}, { values: [{ field: "Revenue", agg: "sum" }, { agg: "count" }] }).notes, ["mixedUnits"]);
});

test("the labels write the value as the axis does, short", () => {
    const r = pivot({ values: [{ field: "Revenue", agg: "sum", format: "currency:EUR" }], chart: { type: "bar", referenceLines: { average: false, trend: false, target: 1234567 } } });
    const option = toEChartsOption(r);
    const target = option.series.at(-1).markLine.data[0];
    assert.equal(words(target.label), "Target 1.2M");
    assert.equal(target.name, "Target");
    // the tooltip and the text alternative keep the whole number
    assert.equal(referenceLines(r).at(-1).format(1234567), "€1,234,567.00");
});

test("decorateOption: the labels of lying lines right of the plot, kept apart, with room; a narrow chart writes the names only", async () => {
    const { decorateOption } = await import("pivotkit-core/chart");
    const style = { getPropertyValue: () => "" };
    // A's average 25 and a target of 26: two labels at nearly the same height
    const r = pivot({ chart: { type: "line", referenceLines: { average: true, trend: true, target: 26 } } });
    const bare = decorateOption(toEChartsOption(pivot({ chart: { type: "line" } })), style, { width: 800, height: 480 });
    const wide = decorateOption(toEChartsOption(r), style, { width: 800, height: 480 });
    const shown = wide.series.flatMap((x) => x.markLine?.data ?? []).map((d) => (Array.isArray(d) ? d[0] : d)).filter((d) => d.label.show !== false);
    assert.deepEqual(shown.map((d) => d.label.position), ["end", "end", "end", "end", "end"]);
    // room on the right for the widest label, "Average 25"
    assert.ok(wide.grid.right - bare.grid.right >= 70, `${wide.grid.right} - ${bare.grid.right}`);
    // the higher label stays at its line, the one just below moves down (the browser spec measures it)
    const average = shown.find((d) => words(d.label) === "Average 25");
    const target = shown.find((d) => words(d.label) === "Target 26");
    assert.equal(target.label.offset[1], 0);
    assert.ok(average.label.offset[1] > 10, JSON.stringify(average.label.offset));
    // narrow: the names alone
    const narrow = decorateOption(toEChartsOption(r), style, { width: 360, height: 480 });
    const names = narrow.series.flatMap((x) => x.markLine?.data ?? []).map((d) => (Array.isArray(d) ? d[0] : d)).filter((d) => d.label.show !== false).map((d) => words(d.label));
    assert.deepEqual(names.sort(), ["Average", "Average", "Target", "Trend", "Trend"]);
});

test("each label carries its line's cue: a sample of its dash in the line's colour", () => {
    const r = pivot({ chart: { type: "line", referenceLines: { average: true, trend: true, target: 80 } } });
    const option = toEChartsOption(r, { theme: { colors: ["#111111", "#222222"], referenceColor: "#999999", textColor: "#333333" } });
    const [a, b] = option.series;
    const average = a.markLine.data[0].label;
    assert.equal(average.formatter(), "{s|– –} Average 25");
    assert.equal(average.rich.s.color, "#111111");
    assert.equal(average.color, "#333333", "the words in the text colour, which reads on every theme");
    assert.equal(b.markLine.data[0].label.rich.s.color, "#222222");
    const trend = a.markLine.data.find((d) => Array.isArray(d) && d[0].label.show !== false)[0].label;
    assert.equal(trend.formatter(), "{s|···} Trend");
    const target = b.markLine.data.at(-1).label;
    assert.equal(target.formatter(), "{s|——} Target 80");
    assert.equal(target.rich.s.color, "#999999");
    // a name from the labels cannot break the markup
    const odd = toEChartsOption(r, { labels: { referenceLines: { average: "Mean {x|y}", trend: "Trend", target: "Target" } } });
    assert.equal(odd.series[0].markLine.data[0].label.formatter(), "{s|– –} Mean xy 25");
});

test("a trend over the categories' order (no real time) is one straight segment", () => {
    const rows = [["2026-01-15", 10], ["2026-02-15", 20], [null, 30]].map(([Date, Revenue]) => ({ Date, Revenue }));
    const { r } = timePivot(rows, "yearMonth", { chart: { type: "line", referenceLines: { average: false, trend: true, target: null } } });
    const data = toEChartsOption(r).series[0].markLine.data;
    assert.deepEqual(data.map((d) => d.map((p) => p.coord)), [[[0, 10], [2, 30]]]);
    assert.equal(referenceLines(r)[0].byTime, false);
    const timed = referenceLines(timePivot(rows.slice(0, 2), "yearMonth", { chart: { type: "line", referenceLines: { average: false, trend: true, target: null } } }).r);
    assert.equal(timed[0].byTime, true);
});

test("decorateOption with the lines' real places (pixelOf): labels at their lines, a line apart; a narrow chart drops what cannot sit near", async () => {
    const { decorateOption } = await import("pivotkit-core/chart");
    const style = { getPropertyValue: () => "" };
    // A's average 25, B's average 5, a target of 26: 4 px a unit, 0 at y 400
    const r = pivot({ chart: { type: "line", referenceLines: { average: true, trend: false, target: 26 } } });
    const pixelOf = (v) => 400 - v * 4;
    const labelsOf = (o) => o.series.flatMap((x) => x.markLine?.data ?? []).map((d) => (Array.isArray(d) ? d[0] : d)).map((d) => ({ words: words(d.label), dy: d.label.offset?.[1] ?? 0, show: d.label.show !== false }));
    const wide = labelsOf(decorateOption(toEChartsOption(r), style, { width: 800, height: 480, pixelOf }));
    // the target at its line (y 296), the average 4 px lower (y 300) moves to a line below it (296 + 19)
    assert.deepEqual(wide.find((l) => l.words === "Target 26").dy, 0);
    assert.deepEqual(wide.find((l) => l.words === "Average 25").dy, 15);
    assert.deepEqual(wide.find((l) => l.words === "Average 5").dy, 0);
    // narrow: three lines at the same height; the third would sit two lines off its own: left out
    const same = pivot({ cols: [], values: [{ field: "Revenue", agg: "sum" }, { field: "Revenue", agg: "max" }], chart: { type: "line", referenceLines: { average: true, trend: false, target: 30 } } });
    const flat = (v) => (v > 20 ? 200 : 300);
    const narrow = labelsOf(decorateOption(toEChartsOption(same), style, { width: 360, height: 480, pixelOf: flat }));
    assert.deepEqual(narrow.map((l) => [l.words, l.show]), [["Average", true], ["Average", true], ["Target", false]]);
});

test("the lines of no series ride on the last series shown: the legend hides a series' markLine with it", () => {
    const hidden = (names, stacked = false) => toEChartsOption(pivot({ chart: { type: "bar", stacked, hidden: names, referenceLines: { average: false, trend: false, target: 26 } } }));
    // B hidden: the target on A
    const one = hidden(["B"]);
    assert.equal(one.series[1].markLine, undefined);
    assert.equal(one.series[0].markLine.data[0].yAxis, 26);
    assert.equal(hidden(["B"], true).series[0].markLine.data[0].yAxis, 26);
    // every series hidden: no line at all
    assert.deepEqual(hidden(["A", "B"]).series.map((x) => x.markLine), [undefined, undefined]);
});
