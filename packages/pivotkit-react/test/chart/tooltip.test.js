// The chart's tooltip (chart-tooltip.js): its lines, the stack's total, the cut list, the reference
// lines, and the nodes it is built of (no markup, styles through the CSSOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toEChartsOption, toSeries } from "pivotkit-core";
import { referenceLines } from "pivotkit-core/chart";
import { decorate } from "../../src/chart-decorate.js";
import { tooltipContent, tooltipFormatter, tooltipReferences, valueAddsUp } from "../../src/chart-tooltip.js";
import { linePivot } from "./fixtures.js";

test("chart tooltips: a title and a line per series or slice, values in the core's format", () => {
    const fmt = (v) => (typeof v === "number" ? `${v.toFixed(1)} u` : "");
    // trigger "axis" (bar, line, area): the category, then each series with a value there (#376: a
    // series without one is left out, no empty line)
    assert.deepEqual(
        tooltipContent([{ axisValueLabel: "North", name: "North", seriesName: "2025", value: 3, color: "#123456" }, { name: "North", seriesName: "2026", value: 4, color: { type: "linear" } }, { name: "North", seriesName: "2027", value: null, color: "#654321" }], { valueFormatter: fmt }),
        { title: "North", lines: [{ color: "#123456", name: "2025", value: "3.0 u" }, { color: null, name: "2026", value: "4.0 u" }] }
    );
    // pie: the value's name, then the slice
    assert.deepEqual(tooltipContent({ seriesType: "pie", seriesName: "Sum of Units", name: "<b>x</b>", value: 2, color: "#abc" }, { valueFormatter: fmt }), {
        title: "Sum of Units",
        lines: [{ color: "#abc", name: "<b>x</b>", value: "2.0 u" }]
    });
    // the slice "Other (n)" of a pie without a legend (#544): its sum, then each slice it holds, the
    // largest first, cut as the series lines are
    const other = { seriesType: "pie", seriesName: "Population", name: "Other (3)", value: 6, color: "#888", data: { members: [{ name: "C", value: 1 }, { name: "A", value: 3 }, { name: "B", value: 2 }] } };
    assert.deepEqual(tooltipContent(other, { valueFormatter: fmt }), {
        title: "Population",
        lines: [
            { color: "#888", name: "Other (3)", value: "6.0 u" },
            { color: null, name: "A", value: "3.0 u" },
            { color: null, name: "B", value: "2.0 u" },
            { color: null, name: "C", value: "1.0 u" }
        ]
    });
    // with the share switched on, the slice's share as the other slices have it
    assert.equal(tooltipContent({ ...other, percent: 30 }, { valueFormatter: fmt, share: true, shareFormatter: (p) => `${p}%`, series: [{ additive: true }] }).lines[0].share, "30%");
    assert.deepEqual(tooltipContent(other, { valueFormatter: fmt, maxLines: 3, moreLabel: "+{count} more" }), {
        title: "Population",
        lines: [
            { color: "#888", name: "Other (3)", value: "6.0 u" },
            { color: null, name: "A", value: "3.0 u" }
        ],
        more: "+2 more"
    });
    // heatmap: the row and the column of the cell
    assert.deepEqual(tooltipContent({ seriesType: "heatmap", seriesName: "Count", value: [1, 0, 5], color: "#000" }, { valueFormatter: fmt, xNames: ["2025", "2026"], yNames: ["North"] }), {
        title: "Count",
        lines: [{ color: "#000", name: "North, 2026", value: "5.0 u" }]
    });
});

test("chart tooltips are nodes with texts and CSSOM styles, never markup", () => {
    /** a document with just what the formatter uses */
    const node = () => ({ style: {}, textContent: "", children: [], append(...c) { this.children.push(...c); } });
    const doc = /** @type {any} */ ({ createElement: () => node() });
    const box = /** @type {any} */ (tooltipFormatter(doc, {})({ seriesName: "<img src=x onerror=alert(1)>", name: "<script>", value: 1, color: "red" }));
    assert.equal(box.children[0].textContent, "<img src=x onerror=alert(1)>");
    const [marker, name, value] = box.children[1].children;
    assert.equal(marker.style.backgroundColor, "red");
    assert.equal(name.textContent, "<script>");
    assert.equal(value.textContent, "1");
    assert.equal(JSON.stringify(box).includes("innerHTML"), false);
});

test("chart tooltips follow the pointer: the element alone, a stack's total, every series between elements (#376)", () => {
    const fmt = (v) => `${v} u`;
    const names = ["Software", "Hardware", "Services"];
    // the axis items ECharts hands the formatter at one category: one per series, null where it has no value
    const at = (dataIndex, values) => values.map((value, i) => ({ seriesIndex: i, dataIndex, axisValueLabel: "East", name: "East", seriesName: names[i], value, color: `#00000${i}` }));
    const stack = (type) => names.map(() => ({ type, stack: "total" }));
    const own = (type) => names.map(() => ({ type }));
    const line = (i, value) => ({ color: `#00000${i}`, name: names[i], value: `${value} u` });
    const total = (value) => ({ name: "Total", value: `${value} u` });
    const north = at(0, [30, 20, 10]);
    const east = at(2, [40, null, 12]);
    const content = (params, options) => tooltipContent(params, { valueFormatter: fmt, totalLabel: "Total", ...options });

    // stacked bars: a segment shows its series and the stack's total
    assert.deepEqual(content(north, { series: stack("bar"), hover: { seriesIndex: 1, dataIndex: 0 } }), { title: "East", lines: [line(1, 20)], total: total(60) });
    // the gap between stacked bars: the total only; so does an element of another category
    assert.deepEqual(content(north, { series: stack("bar"), hover: null }), { title: "East", lines: [], total: total(60) });
    assert.deepEqual(content(north, { series: stack("bar"), hover: { seriesIndex: 1, dataIndex: 2 } }), { title: "East", lines: [], total: total(60) });
    // grouped bars: a bar alone, no total; between bars every series with a value
    assert.deepEqual(content(east, { series: own("bar"), hover: { seriesIndex: 2, dataIndex: 2 } }), { title: "East", lines: [line(2, 12)] });
    assert.deepEqual(content(east, { series: own("bar"), hover: null }), { title: "East", lines: [line(0, 40), line(2, 12)] });
    // lines: a point alone; the line between points every series, the one without a value left out
    assert.deepEqual(content(east, { series: own("line"), hover: { seriesIndex: 0, dataIndex: 2 } }), { title: "East", lines: [line(0, 40)] });
    assert.deepEqual(content(east, { series: own("line") }), { title: "East", lines: [line(0, 40), line(2, 12)] });
    // stacked area: the fill every series and the total; a point that point and the total
    assert.deepEqual(content(east, { series: stack("line") }), { title: "East", lines: [line(0, 40), line(2, 12)], total: total(52) });
    assert.deepEqual(content(east, { series: stack("line"), hover: { seriesIndex: 2, dataIndex: 2 } }), { title: "East", lines: [line(2, 12)], total: total(52) });

    // "axis" (every series): all of them wherever the pointer is, the hovered one marked, and the total
    assert.deepEqual(content(north, { mode: "axis", series: stack("bar"), hover: { seriesIndex: 0, dataIndex: 0 } }), { title: "East", lines: [{ ...line(0, 30), hovered: true }, line(1, 20), line(2, 10)], total: total(60) });
    assert.deepEqual(content(north, { mode: "axis", series: own("bar") }), { title: "East", lines: [line(0, 30), line(1, 20), line(2, 10)] });
    // a legend that hides a series: ECharts leaves it out of the items, so the total is what is drawn
    assert.deepEqual(content(north.slice(1), { series: stack("bar") }), { title: "East", lines: [], total: total(30) });
});

test("chart tooltips: the total is the sum of the parts, none for a value that does not add up; the hovered series first; a long list cut (review of #376)", () => {
    const fmt = (v) => `${v} u`;
    const names = ["Software", "Hardware", "Services"];
    const at = (values) => values.map((value, i) => ({ seriesIndex: i, dataIndex: 0, axisValueLabel: "North", seriesName: names[i], value, color: `#00000${i}` }));
    const stack = (additive = true) => names.map(() => ({ type: "bar", stack: "total", additive }));
    const content = (params, options) => tooltipContent(params, { valueFormatter: fmt, totalLabel: "Total", ...options });
    // a part below zero: the total is the sum of the parts, 30 - 20 + 10
    assert.deepEqual(content(at([30, -20, 10]), { series: stack(), hover: { seriesIndex: 1, dataIndex: 0 } }).total, { name: "Total", value: "20 u" });
    // an average does not add up: no total, and between the bars every series instead of the total
    const averages = content(at([30, 20, 10]), { series: stack(false), hover: null });
    assert.deepEqual([averages.lines.map((l) => l.name), averages.total], [names, undefined]);
    assert.deepEqual(content(at([30, 20, 10]), { series: stack(false), hover: { seriesIndex: 2, dataIndex: 0 } }), { title: "North", lines: [{ color: "#000002", name: "Services", value: "10 u" }] });
    // every series: the hovered one comes first, marked
    assert.deepEqual(content(at([30, 20, 10]), { mode: "axis", series: stack(), hover: { seriesIndex: 2, dataIndex: 0 } }).lines.map((l) => [l.name, Boolean(l.hovered)]), [["Services", true], ["Software", false], ["Hardware", false]]);
    // more lines than fit: the first ones and how many more, the hovered one kept first
    const many = Array.from({ length: 15 }, (_, i) => ({ seriesIndex: i, dataIndex: 0, axisValueLabel: "North", seriesName: `S${i}`, value: i, color: "#000000" }));
    const cut = tooltipContent(many, { mode: "axis", maxLines: 6, moreLabel: "+{count} more", hover: { seriesIndex: 9, dataIndex: 0 } });
    assert.deepEqual([cut.lines.map((l) => l.name), cut.more], [["S9", "S0", "S1", "S2", "S3"], "+10 more"]);
    assert.equal(tooltipContent(many.slice(0, 6), { mode: "axis", maxLines: 6 }).more, undefined);
});

test("a stack's total only for values that add up: sums and counts, not shown as a rank or a percent difference (#376)", () => {
    const value = (agg, showAs = null) => ({ field: "Revenue", agg, showAs });
    assert.deepEqual([value("sum"), value("count"), value("average"), value("median"), value("max")].map(valueAddsUp), [true, true, false, false, false]);
    for (const type of ["rankAscending", "rankDescending", "percentDifferenceFromPrevious", "percentOfColumnTotal", "percentRunningTotal"]) {
        assert.equal(valueAddsUp(value("sum", { type, axis: "rows" })), false, type);
    }
    for (const type of ["percentOfGrandTotal", "percentOfRowTotal", "differenceFromPrevious", "runningTotal"]) {
        assert.equal(valueAddsUp(value("sum", { type, axis: "rows" })), true, type);
    }
    assert.equal(valueAddsUp(value("average", { type: "percentOfRowTotal", axis: "rows" })), false);
    // a running total across the series of a category counts each part again: no total
    assert.equal(valueAddsUp(value("sum", { type: "runningTotal", axis: "cols" })), false);
    assert.equal(valueAddsUp(value("sum", { type: "differenceFromPrevious", axis: "cols" })), false);
    assert.equal(valueAddsUp(undefined), false);
});

test("decorate tells the tooltip which series add up: a stacked sum gets a total, a stacked average or a rank none", () => {
    // what the browser's chart hands decorate (chart.jsx): the view's values, one per series
    const node = () => ({ style: {}, textContent: "", children: [], append(...c) { this.children.push(...c); } });
    const doc = /** @type {any} */ ({ createElement: () => node() });
    const params = ["Software", "Hardware", "Services"].map((seriesName, seriesIndex) => ({ seriesIndex, dataIndex: 0, axisValueLabel: "North", seriesName, value: 10 * (seriesIndex + 1), color: "#000000" }));
    const option = { series: params.map(() => ({ type: "bar", stack: "total" })), tooltip: {} };
    const rows = (value) => {
        const drawn = decorate(option, { getPropertyValue: () => "" }, 480, doc, 800, { tooltip: { values: params.map(() => value), totalLabel: "Total" } });
        return /** @type {any} */ (drawn.tooltip.formatter(params)).children.map((c) => c.textContent || c.children.map((x) => x.textContent).join(" ").trim());
    };
    assert.equal(rows({ field: "Revenue", agg: "sum" }).at(-1), "Total 60");
    assert.equal(rows({ field: "Revenue", agg: "average" }).some((r) => r.startsWith("Total")), false);
    assert.equal(rows({ field: "Revenue", agg: "sum", showAs: { type: "rankDescending", axis: "rows" } }).some((r) => r.startsWith("Total")), false);
});

test("a cut list with a total says the cut series are in the total", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ seriesIndex: i, dataIndex: 0, axisValueLabel: "North", seriesName: `S${i}`, value: 1, color: "#000000" }));
    const series = many.map(() => ({ type: "line", stack: "total" }));
    const options = { maxLines: 6, moreLabel: "+{count} more", moreInTotalLabel: "+{count} more (in the total)" };
    assert.equal(tooltipContent(many, { ...options, series }).more, "+10 more (in the total)");
    assert.equal(tooltipContent(many, { ...options, series: series.map(() => ({ type: "line" })) }).more, "+10 more");
});

test("the tooltip's total row and the hovered line: weights and the rule from the tokens, set through the CSSOM", () => {
    const node = () => ({ style: {}, textContent: "", children: [], append(...c) { this.children.push(...c); } });
    const doc = /** @type {any} */ ({ createElement: () => node() });
    const params = [
        { seriesIndex: 0, dataIndex: 0, axisValueLabel: "North", seriesName: "Software", value: 30, color: "#111111" },
        { seriesIndex: 1, dataIndex: 0, axisValueLabel: "North", seriesName: "Hardware", value: 20, color: "#222222" }
    ];
    const series = [{ type: "bar", stack: "total" }, { type: "bar", stack: "total" }];
    const box = /** @type {any} */ (tooltipFormatter(doc, { mode: "axis", series, hover: { seriesIndex: 1, dataIndex: 0 }, totalLabel: "Total" })(params));
    // the hovered series first (#376 review), then the others in their order
    const [head, hardware, software, sum] = box.children;
    assert.deepEqual([head.textContent, box.children.length], ["North", 4]);
    assert.deepEqual([hardware.children[1].textContent, software.children[1].textContent], ["Hardware", "Software"]);
    assert.equal(software.children[1].style.fontWeight, undefined);
    assert.equal(hardware.children[1].style.fontWeight, "var(--pk-weight-strong)");
    // a long name ends in "…" at the token's width
    assert.deepEqual([software.children[1].style.maxWidth, software.children[1].style.textOverflow], ["var(--pk-tooltip-name-w)", "ellipsis"]);
    assert.deepEqual([sum.children[1].textContent, sum.children[2].textContent], ["Total", "50"]);
    assert.equal(sum.style.borderTop, "1px solid var(--pk-border)");
    assert.equal(sum.style.fontWeight, "var(--pk-weight-strong)");
    // the tooltip's size, as every line: no size of its own
    assert.equal(sum.style.fontSize, undefined);
    // the total's marker keeps the column but shows no colour
    assert.equal(sum.children[0].style.backgroundColor, undefined);
});

test("the tooltip's title is the category's whole name when the axis writes it shorter", () => {
    const params = [{ dataIndex: 1, axisValueLabel: "B", seriesName: "Units", value: 2, color: "#123456" }];
    assert.equal(tooltipContent(params, { categoryNames: ["North / A", "North / B"] }).title, "North / B");
    assert.equal(tooltipContent(params).title, "B");
});

test("the tooltip names the reference lines: the hovered series' own and the lines of no series, a trend at its category", () => {
    const r = linePivot({ type: "line", referenceLines: { average: true, trend: true, target: 35 } });
    const s = toSeries(r);
    const names = s.series.map((x) => x.name);
    const context = tooltipReferences(referenceLines(r, { series: s }), names, "#abcdef");
    const params = s.series.map((x, i) => ({ seriesIndex: i, dataIndex: 2, axisValueLabel: "Mar 2026", seriesName: x.name, value: x.data[2], color: ["#111111", "#222222"][i] }));
    const fmt = (v) => String(v);
    // every series at the category: every line in its series' colour, a trend at the category (A: 30, B: 4.8)
    const all = tooltipContent(params, { valueFormatter: fmt, mode: "axis", references: context });
    assert.deepEqual(
        all.references.map((l) => [l.name, l.value, l.color]),
        [
            ["Average (A)", "25", "#111111"],
            ["Average (B)", "5", "#222222"],
            ["Trend (A)", "30", "#111111"],
            ["Trend (B)", "4.8", "#222222"],
            ["Target", "35", "#abcdef"]
        ]
    );
    // the point of B under the pointer: B's lines and the target
    const b = tooltipContent(params, { valueFormatter: fmt, references: context, hover: { seriesIndex: 1, dataIndex: 2 } });
    assert.deepEqual(b.references.map((l) => l.name), ["Average (B)", "Trend (B)", "Target"]);
    // one series: the lines go by their names alone
    assert.deepEqual(tooltipReferences(referenceLines(r, { series: s }), ["A"], null).map((l) => l.name), ["Average", "Average", "Trend", "Trend", "Target"]);
    // no lines: no part of the tooltip
    assert.equal(tooltipContent(params, { valueFormatter: fmt }).references, undefined);
    // decorate hands them to the tooltip: the lines' colour of no series from --pk-chart-reference
    const drawn = decorate(toEChartsOption(r, { series: s }), { getPropertyValue: (n) => ({ "--pk-chart-reference": "#abcdef" })[n] ?? "" }, 480, /** @type {any} */ ({ createElement: () => ({ style: {}, children: [], append() {} }) }), 800, { tooltip: { lines: referenceLines(r, { series: s }) } });
    assert.equal(typeof drawn.tooltip.formatter, "function");
});

test("the tooltip's reference lines as nodes, below a rule in the tokens' colours", () => {
    const node = () => ({ style: {}, textContent: "", children: [], append(...c) { this.children.push(...c); } });
    const doc = /** @type {any} */ ({ createElement: () => node() });
    const format = tooltipFormatter(doc, { valueFormatter: String, mode: "axis", references: [{ name: "Target", color: "#abcdef", series: null, value: () => "35" }] });
    const box = /** @type {any} */ (format([{ seriesIndex: 0, dataIndex: 0, axisValueLabel: "Jan", seriesName: "A", value: 10, color: "#111111" }]));
    const [, a, target] = box.children;
    assert.equal(a.children[1].textContent, "A");
    assert.deepEqual([target.children[0].style.backgroundColor, target.children[1].textContent, target.children[2].textContent], ["#abcdef", "Target", "35"]);
    assert.equal(target.style.borderTop, "1px solid var(--pk-border)");
});
