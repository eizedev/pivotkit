// The chart type menu's Display settings in levels (#106, #36): a short first level (value labels,
// legend, title) and topics that open a level (Axis, Tooltip, Series, Layout), each with its state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, normalize } from "pivotkit-core";
import { LABELS } from "../src/labels.js";
import { en as menuEn } from "../src/menu-labels.js";
import { chartTopics } from "../src/menu-topics.js";

const data = encode([
    { Region: "North", Country: "A", Category: "Hardware", Revenue: 20, Price: 3 },
    { Region: "South", Country: "B", Category: "Services", Revenue: 5, Price: 4 }
]);
const labels = { ...LABELS.en, ...menuEn };
const norm = (v) => normalize(v, data).view;
const ids = (topics) => topics.filter((t) => !t.hidden).map((t) => t.id);
const byId = (topics, id) => topics.find((t) => t.id === id);
const choices = (topic) => (topic.groups ?? []).flatMap((g) => g.choices);

test("bars: every topic a row with what is set that opens a level: Value labels, Legend, Title, Axis, Tooltip, Series, Layout", () => {
    const patches = [];
    const view = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar", stacked: true, hidden: ["Services"], zoom: "off" } });
    const topics = chartTopics({ view, drawn: "stacked", labels, names: ["Hardware", "Services"], act: { display: (p) => patches.push(p) } });
    assert.deepEqual(ids(topics), ["valueLabels", "legend", "title", "axis", "tooltip", "series", "layout"]);
    assert.deepEqual(topics.map((t) => t.kind), ["menu", "menu", "panel", "menu", "menu", "menu", "menu"]);
    assert.deepEqual([byId(topics, "valueLabels").state, byId(topics, "legend").state], ["Automatic", "Automatic"]);
    // the rows say what is set; a setting off its default is marked
    assert.deepEqual([byId(topics, "title").state, byId(topics, "axis").state, byId(topics, "axis").changed], ["No title", "Automatic, zoom slider off", true]);
    assert.deepEqual([byId(topics, "series").state, byId(topics, "series").changed], ["1 of 2 shown", true]);
    assert.deepEqual([byId(topics, "tooltip").state, byId(topics, "tooltip").changed], ["Automatic", false]);
    // Series: a switch per series, in one group; the level stays open after each
    const series = choices(byId(topics, "series"));
    assert.deepEqual(series.map((c) => [c.text, c.checkbox, c.checked, c.stays]), [["Hardware", true, true, true], ["Services", true, false, true]]);
    series[1].run();
    series[0].run();
    assert.deepEqual(patches.splice(0), [{ hidden: [] }, { hidden: ["Services", "Hardware"] }]);
    // a choice applies its patch
    const zoomOn = choices(byId(topics, "axis")).find((c) => c.id === "zoom-on");
    assert.equal(zoomOn.testId ?? zoomOn.id, "zoom-on");
    zoomOn.run();
    choices(byId(topics, "layout")).find((c) => c.id === "chart-stack-percent").run();
    assert.deepEqual(patches, [{ zoom: "on" }, { stackPercent: true }]);
    // one row field: no group labels
    assert.equal(byId(topics, "axis").groups.some((g) => g.title === labels.groupLabels), false);
});

test("a pie: its value labels with percent, the label position under Layout, no Axis or Tooltip; slices in Series", () => {
    const view = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "pie" } });
    const topics = chartTopics({ view, drawn: "pie", labels, names: ["North", "South"], act: { display: () => {} } });
    assert.deepEqual(ids(topics), ["valueLabels", "legend", "title", "series", "layout"]);
    assert.ok(choices(byId(topics, "valueLabels")).some((c) => c.id === "labels-percent"));
    assert.deepEqual(choices(byId(topics, "layout")).map((c) => c.id), ["label-position-outside", "label-position-inside"]);
    // one name for the topic: Series, its rows the slices
    assert.equal(byId(topics, "series").title, "Series");
    assert.deepEqual(choices(byId(topics, "series")).map((c) => c.text), ["North", "South"]);
});

test("averages: no 100 % stack; lines: smooth lines; a heatmap has no Series; two row fields add group labels", () => {
    const avg = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "average" }], chart: { type: "bar", stacked: true } });
    assert.equal(byId(chartTopics({ view: avg, drawn: "stacked", labels, names: ["Hardware", "Services"], act: { display: () => {} } }), "layout"), undefined);
    const line = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", smooth: true } });
    const lt = chartTopics({ view: line, drawn: "line", labels, names: ["Sum of Revenue"], act: { display: () => {} } });
    assert.deepEqual(choices(byId(lt, "layout")).map((c) => [c.id, c.checked]), [["chart-smooth", true]]);
    assert.equal(byId(lt, "series"), undefined, "one series: nothing to hide");
    const heat = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "heatmap" } });
    assert.deepEqual(ids(chartTopics({ view: heat, drawn: "heatmap", labels, names: [], act: { display: () => {} } })), ["valueLabels", "legend", "title"]);
    const two = norm({ rows: ["Region", "Country"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar" } });
    assert.ok(byId(chartTopics({ view: two, drawn: "bar", labels, names: [], act: { display: () => {} } }), "axis").groups.some((g) => g.title === labels.groupLabels));
});

test("Series lists every series, however many: the level scrolls, none is left out", () => {
    const names = Array.from({ length: 120 }, (_, i) => `Series ${i + 1}`);
    const view = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar" } });
    const series = choices(byId(chartTopics({ view, drawn: "bar", labels, names, act: { display: () => {} } }), "series"));
    assert.equal(series.length, 120);
    assert.equal(series.at(-1).text, "Series 120");
});
