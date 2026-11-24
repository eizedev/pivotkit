// A pie or donut whose labels outside have no room, with the legend off (#544): the smallest slices
// go into one slice "Other (n)" until every label has room. decorateOption does it, so the screen,
// the SVG and the printed report follow the same rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, reportLabels, toEChartsOption } from "pivotkit-core";
import { decorateOption } from "pivotkit-core/chart";

/** 20 countries with populations from 2,000 down to 100 (thousands). */
const COUNTRIES = Array.from({ length: 20 }, (_, i) => ({ Country: `Country ${String.fromCharCode(65 + i)}`, Population: (20 - i) * 100 }));
const data = encode(COUNTRIES);
const TOKENS = { "--pk-chart-other": "#8a94a3", "--pk-surface": "#ffffff" };
const style = { getPropertyValue: (name) => TOKENS[name] ?? "" };
const donut = (chart = {}, view = {}) => computePivot(data, { rows: ["Country"], values: [{ field: "Population", agg: "sum" }], sort: [{ field: "Country", by: "value", order: "desc", value: { field: "Population", agg: "sum" } }], chart: { type: "donut", legend: "off", ...chart }, formatting: { locale: "en-US" }, ...view });
const PHONE = { width: 358, height: 319 };
const DESKTOP = { width: 1100, height: 520 };
const slices = (option) => option.series[0].data;

test("a phone: the smallest slices become one slice 'Other (n)', last, with their sum, in --pk-chart-other", () => {
    const out = decorateOption(toEChartsOption(donut()), style, PHONE);
    const d = slices(out);
    const other = d[d.length - 1];
    assert.match(other.name, /^Other \(\d+\)$/);
    const n = Number(/\((\d+)\)/.exec(other.name)[1]);
    assert.ok(n >= 2 && n < 20, other.name);
    assert.equal(d.length, 20 - n + 1);
    // the largest stay, in their order; the other slice holds the rest, the smallest
    assert.deepEqual(d.slice(0, -1).map((x) => x.name), COUNTRIES.slice(0, 20 - n).map((c) => c.Country));
    assert.equal(other.value, COUNTRIES.slice(20 - n).reduce((sum, c) => sum + c.Population, 0));
    assert.deepEqual(other.members.map((m) => m.name), COUNTRIES.slice(20 - n).map((c) => c.Country));
    assert.equal(other.itemStyle.color, "#8a94a3");
    // the same view, same numbers: the total of the slices does not change
    assert.equal(d.reduce((sum, x) => sum + x.value, 0), COUNTRIES.reduce((sum, c) => sum + c.Population, 0));
    // every label outside is shown: none is left out any more
    assert.ok(d.every((x) => x.label?.show !== false), "each slice keeps its label");
});

test("a kept slice keeps its colour: the palette's colour of its place, or its fixed colour", () => {
    const palette = ["#111111", "#222222", "#333333"];
    const out = decorateOption(toEChartsOption(donut({ colors: [{ name: "Country B", color: "#abcdef" }] }), { theme: { colors: palette } }), style, PHONE);
    const d = slices(out);
    assert.equal(d[0].itemStyle.color, "#111111");
    assert.equal(d[1].itemStyle.color, "#abcdef");
    assert.equal(d[2].itemStyle.color, "#333333");
});

test("German: 'Andere (n)' from the built-in German labels", () => {
    const de = decorateOption(toEChartsOption(donut(), { labels: reportLabels("de-DE") }), style, PHONE);
    assert.match(slices(de).at(-1).name, /^Andere \(\d+\)$/);
});

test("a host's word for the slice through the labels", () => {
    const own = decorateOption(toEChartsOption(donut(), { labels: { otherSlices: "Rest: {count}" } }), style, PHONE);
    assert.match(slices(own).at(-1).name, /^Rest: \d+$/);
});

test("nothing merged where every label has room, with the legend on, inside labels, or few slices", () => {
    const few = computePivot(data, { rows: ["Country"], values: [{ field: "Population", agg: "sum" }], filters: [{ field: "Country", type: "in", items: ["Country A", "Country B", "Country C"] }], chart: { type: "pie", legend: "off" } });
    assert.equal(slices(decorateOption(toEChartsOption(few), style, PHONE)).length, 3);
    // the legend names every slice: labels that do not fit are left out, as before
    assert.equal(slices(decorateOption(toEChartsOption(donut({ legend: "auto" })), style, PHONE)).length, 20);
    assert.equal(slices(decorateOption(toEChartsOption(donut({ labelPosition: "inside" })), style, PHONE)).length, 20);
    assert.equal(slices(decorateOption(toEChartsOption(donut({ valueLabels: "off" })), style, PHONE)).length, 20);
});

test("the rule follows the room: a wide chart keeps more slices than a phone", () => {
    const phone = slices(decorateOption(toEChartsOption(donut()), style, PHONE)).length;
    const wide = slices(decorateOption(toEChartsOption(donut()), style, DESKTOP)).length;
    assert.ok(wide > phone, `${wide} > ${phone}`);
});

test("a slice hidden in the legend stays out of 'Other' and stays hidden", () => {
    const out = decorateOption(toEChartsOption(donut({ hidden: ["Country T"] })), style, PHONE);
    const other = slices(out).at(-1);
    assert.ok(!other.members.some((m) => m.name === "Country T"));
    assert.ok(slices(out).some((x) => x.name === "Country T"));
    assert.equal(out.legend.selected["Country T"], false);
});
