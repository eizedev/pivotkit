// The chart type menu's Display settings in levels (#106, #36): a short first level (value labels,
// legend, title) and topics that open a level (Axis, Tooltip, Entries, Layout), each with its state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, normalize } from "pivotkit-core";
// the German first-load texts: pivotkit-react adds them as it loads (deferred.js)
import "../../src/deferred.js";
import { CHART_TYPES, CHART_TYPE_NAMES } from "../../src/chart-types.js";
import { chartTopics, searchEntries, searchHits } from "../../src/menu-topics.js";
import { rowFolding } from "../../src/view-ops.js";
import { MENU } from "../helpers.js";

const data = encode([
    { Region: "North", Country: "A", Category: "Hardware", Revenue: 20, Price: 3 },
    { Region: "South", Country: "B", Category: "Services", Revenue: 5, Price: 4 }
]);
const labels = MENU.en;
const norm = (v) => normalize(v, data).view;
const ids = (topics) => topics.filter((t) => !t.hidden).map((t) => t.id);
const byId = (topics, id) => topics.find((t) => t.id === id);
const choices = (topic) => (topic.groups ?? []).flatMap((g) => g.choices);

test("bars: every topic a row with what is set that opens a level: Value labels, Legend, Title, Axis, Tooltip, Reference lines, Series, Layout", () => {
    const patches = [];
    const view = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar", stacked: true, hidden: ["Services"], zoom: "off" } });
    const topics = chartTopics({ view, drawn: "stacked", labels, names: ["Hardware", "Services"], act: { display: (p) => patches.push(p) } });
    assert.deepEqual(ids(topics), ["valueLabels", "legend", "title", "axis", "tooltip", "lines", "series", "layout"]);
    assert.deepEqual(topics.filter((t) => !t.hidden).map((t) => t.kind), ["menu", "menu", "panel", "menu", "menu", "menu", "menu", "menu"]);
    assert.deepEqual([byId(topics, "valueLabels").state, byId(topics, "legend").state], ["Automatic", "Automatic"]);
    // the rows say what is set; a setting off its default is marked
    assert.deepEqual([byId(topics, "title").state, byId(topics, "axis").state, byId(topics, "axis").changed], ["No title", "Automatic, zoom slider off", true]);
    assert.deepEqual([byId(topics, "series").state, byId(topics, "series").changed], ["1 of 2 shown", true]);
    assert.deepEqual([byId(topics, "tooltip").state, byId(topics, "tooltip").changed], ["Automatic", false]);
    // Series: a switch per series, in one group (a switch keeps its level open, levels.jsx)
    const series = choices(byId(topics, "series"));
    assert.deepEqual(series.map((c) => [c.text, c.checkbox, c.checked]), [["Hardware", true, true], ["Services", true, false]]);
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

test("a pie: its value labels with percent, the label position under Layout, no Axis; the share in Tooltip; slices in Series", () => {
    const view = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "pie" } });
    const topics = chartTopics({ view, drawn: "pie", labels, names: ["North", "South"], act: { display: () => {} } });
    assert.deepEqual(ids(topics), ["valueLabels", "legend", "title", "tooltip", "series", "layout"]);
    // a pie's tooltip has the share only (#54)
    assert.deepEqual(choices(byId(topics, "tooltip")).map((c) => c.id), ["chart-tooltip-share"]);
    assert.ok(choices(byId(topics, "valueLabels")).some((c) => c.id === "labels-percent"));
    assert.deepEqual(choices(byId(topics, "layout")).map((c) => c.id), ["label-position-outside", "label-position-inside"]);
    // one name for the topic: Entries, its rows the slices (#918)
    assert.equal(byId(topics, "series").title, "Entries");
    assert.deepEqual(choices(byId(topics, "series")).map((c) => c.text), ["North", "South"]);
});

test("Entries is found by its former name too: series in English, Reihen in German (#918)", () => {
    const view = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "pie" } });
    for (const [lang, word, title] of [["en", "series", "Entries"], ["de", "reihen", "Einträge"]]) {
        const topics = chartTopics({ view, drawn: "pie", labels: MENU[lang], names: ["North", "South"], act: { display: () => {} } });
        const hits = searchHits(searchEntries(topics), word);
        assert.deepEqual(hits.map((h) => [h.path, h.text]), [[title, "North"], [title, "South"]], lang);
    }
});

test("averages: no 100 % stack; lines: smooth lines; a heatmap has no Series; two row fields add group labels", () => {
    const avg = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "average" }], chart: { type: "bar", stacked: true } });
    assert.equal(byId(chartTopics({ view: avg, drawn: "stacked", labels, names: ["Hardware", "Services"], act: { display: () => {} } }), "layout"), undefined);
    const line = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", smooth: true } });
    const lt = chartTopics({ view: line, drawn: "line", labels, names: ["Sum of Revenue"], act: { display: () => {} } });
    assert.deepEqual(choices(byId(lt, "layout")).map((c) => [c.id, c.checked]), [["chart-smooth", true]]);
    // one series: Series has its colour; its switch says it is always shown (#54 review)
    const only = choices(byId(lt, "series"));
    assert.deepEqual(only.map((c) => [c.text, c.checked, c.disabled, c.reason, c.color.label]), [["Sum of Revenue", true, true, "The only series is always shown", "Colour of Sum of Revenue"]]);
    const heat = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "heatmap" } });
    // its colour scale takes the legend's place: no Legend, whose choices would change nothing (#916)
    assert.deepEqual(ids(chartTopics({ view: heat, drawn: "heatmap", labels, names: [], act: { display: () => {} } })), ["valueLabels", "title"]);
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

test("Tooltip has the share as a switch; Series has a colour beside each series, Default for a view's own, Remove for a name not shown (#54)", () => {
    const patches = [];
    const view = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar", tooltipShare: true, colors: [{ name: "services", color: "#123456" }, { name: "Gone", color: "#abcdef" }] } });
    const drawnColors = new Map([["Hardware", "#2a78d6"], ["Services", "#123456"]]);
    const topics = chartTopics({ view, drawn: "bar", labels, names: ["Hardware", "Services"], act: { display: (p) => patches.push(p) }, drawnColors });
    const tooltip = byId(topics, "tooltip");
    assert.equal(tooltip.state, "Automatic, Share in the tooltip");
    const share = choices(tooltip).find((c) => c.id === "chart-tooltip-share");
    assert.deepEqual([share.checkbox, share.checked], [true, true]);
    const series = byId(topics, "series");
    const [hardware, services] = series.groups[0].choices;
    // the colour field starts from the view's colour, else the one drawn
    assert.deepEqual([hardware.color.value, services.color.value], ["#2a78d6", "#123456"]);
    assert.equal(hardware.color.label, "Colour of Hardware");
    assert.equal(hardware.actions, undefined);
    assert.deepEqual(services.actions.map((a) => a.label), ["Default: Services"]);
    hardware.color.pick("#00aa00");
    services.actions[0].run();
    assert.deepEqual(patches.splice(0), [{ colors: [{ name: "services", color: "#123456" }, { name: "Gone", color: "#abcdef" }, { name: "Hardware", color: "#00aa00" }] }, { colors: [{ name: "Gone", color: "#abcdef" }] }]);
    // a view's colour for a name not shown: its own group, with Remove
    const stale = series.groups[1];
    assert.equal(stale.title, "Colours of names not shown");
    assert.deepEqual(stale.choices.map((c) => [c.text, c.label]), [["Gone", "Remove: Gone"]]);
    stale.choices[0].run();
    assert.deepEqual(patches, [{ colors: [{ name: "services", color: "#123456" }] }]);
    assert.equal(series.changed, true);
});

test("Entries of a treemap: the dot shows the tile as drawn, darker for a pale colour; the field keeps the colour set (#1009)", () => {
    const view = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap", colors: [{ name: "South", color: "#ffd700" }] } });
    const drawnColors = new Map([["North", "#2974d0"], ["South", "#877200"]]);
    const entries = (drawn) => byId(chartTopics({ view, drawn, labels, names: ["North", "South"], act: { display: () => {} }, drawnColors }), "series").groups[0].choices;
    const [north, south] = entries("treemap");
    assert.deepEqual([north.color.value, north.color.shown], ["#2974d0", "#2974d0"]);
    assert.deepEqual([south.color.value, south.color.shown], ["#ffd700", "#877200"]);
    // bars draw the colour set as it is: the dot shows it at once after a pick, before the chart is drawn again
    assert.equal(entries("bar")[1].color.shown, "#ffd700");
});

test("Reference lines: a level after Tooltip on bars, lines and areas: Average and Trend switches, a Target row that opens its form, the reasons (#48)", () => {
    const patches = [];
    const of = (referenceLines, { type = "bar", rules = { average: true, trend: true, target: true, notes: [] }, targetText = "" } = {}) => {
        const view = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type, referenceLines } });
        return chartTopics({ view, drawn: type, labels, names: ["Sum of Revenue"], act: { display: (p) => patches.push(p) }, lines: { rules, targetText } });
    };
    const off = byId(of({ average: false, trend: false, target: null }), "lines");
    assert.deepEqual([off.title, off.kind, off.state, off.changed, off.note], ["Reference lines", "menu", "Off", false, null]);
    // the switches, as Layout's (a switch keeps its level open, levels.jsx); the Target row opens its form
    const [average, trend, extremes, target] = choices(off);
    assert.deepEqual([average.checkbox, average.checked, trend.checkbox, target.open, target.hint], [true, false, true, "linesTarget", "No target"]);
    // the high and low points (#574): a switch between the lines and the target
    assert.deepEqual([extremes.id, extremes.text, extremes.checkbox, extremes.checked], ["line-extremes", "High and low points", true, false]);
    extremes.run();
    assert.deepEqual(patches.splice(0), [{ referenceLines: { average: false, trend: false, target: null, extremes: true } }]);
    const marked = byId(of({ average: false, trend: false, target: null, extremes: true }), "lines");
    assert.deepEqual([marked.state, marked.changed, choices(marked)[2].checked], ["High and low points", true, true]);
    average.run();
    assert.deepEqual(patches.splice(0), [{ referenceLines: { average: true, trend: false, target: null, extremes: false } }]);
    const form = byId(of({ average: false, trend: false, target: null }), "linesTarget");
    assert.deepEqual([form.kind, form.hidden, form.levelTitle], ["panel", true, "Reference lines › Target"]);
    // what is on, and the target as the locale writes it
    const some = of({ average: true, trend: false, target: 26 }, { targetText: "26" });
    assert.deepEqual([byId(some, "lines").state, byId(some, "lines").changed, choices(byId(some, "lines"))[3].hint], ["Average, Target", true, "26"]);
    // a stack of averages: every line off with its reason
    const stack = byId(of({ average: true, trend: false, target: 26 }, { rules: { average: false, trend: false, target: false, notes: ["noTotal"] } }), "lines");
    const reasons = choices(stack).map((c) => [c.id, c.disabled ?? false, c.reason ?? null]);
    const why = "These lines need a total. Switch to Bars, not stacked, to draw them.";
    assert.deepEqual(reasons, [["line-average", true, why], ["line-trend", true, why], ["line-extremes", true, why], ["line-target", true, why], ["target-remove", false, null]]);
    choices(stack)[4].run();
    assert.deepEqual(patches.splice(0), [{ referenceLines: { average: true, trend: false, target: null, extremes: false } }]);
    // no time line: the trend's reason; values in two units: the target's
    const regions = choices(byId(of({ average: false, trend: false, target: null }, { rules: { average: true, trend: false, target: false, notes: ["noTime", "mixedUnits"] } }), "lines"));
    assert.deepEqual([regions[1].reason, regions[3].reason], ["A trend needs dates on Rows, in date order.", "The values have different units, so one target does not fit them."]);
    // the chart not drawn yet: a note says the lines come once it is
    assert.equal(byId(of({ average: false, trend: false, target: null }, { rules: { average: true, trend: true, target: true, notes: ["table"] } }), "lines").note, "The lines show here once the chart is drawn.");
    // a pie, a donut, a heatmap, bars and lines and a treemap have no lines (#518: two value axes,
    // one tile per category)
    for (const type of ["pie", "donut", "heatmap", "combo", "treemap"]) {
        assert.equal(byId(of({ average: true, trend: false, target: null }, { type }), "lines"), undefined, type);
    }
    // German
    const de = MENU.de;
    const view = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar" } });
    assert.equal(byId(chartTopics({ view, drawn: "bar", labels: de, names: ["x"], act: { display: () => {} } }), "lines").state, "Aus");
});

test("Layout folds the groups of Rows in words of the fields: Show each Country, Show Region only; with one field in Rows both are off with the reason (#580)", () => {
    const calls = [];
    const act = { display: () => {}, expand: () => calls.push("expand"), collapse: () => calls.push("collapse") };
    const two = norm({ rows: ["Region", "Country"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "bar" }, collapsed: { rows: [["North"]] } });
    const folding = { canExpand: true, canCollapse: true, why: { expand: null, collapse: null } };
    const topics = chartTopics({ view: two, drawn: "bar", labels, names: [], act, folding });
    // Layout is there for every type: the bars have no switch of their own in it
    assert.ok(ids(topics).includes("layout"));
    const fold = choices(byId(topics, "layout"));
    assert.deepEqual(fold.map((c) => [c.id, c.text, c.disabled ?? false, c.closes]), [["chart-show-each", "Show each Country", false, true], ["chart-show-only", "Show Region only", false, true]]);
    fold[0].run();
    fold[1].run();
    assert.deepEqual(calls, ["expand", "collapse"]);
    // nothing collapsed: Show each says why it does nothing
    const none = chartTopics({ view: two, drawn: "bar", labels, names: [], act, folding: { canExpand: false, canCollapse: true, why: { expand: "expandNothing", collapse: null } } });
    const each = choices(byId(none, "layout"))[0];
    assert.deepEqual([each.disabled, each.reason], [true, "Nothing is collapsed."]);
    // one field in Rows: the words without names, both off with the reason
    const one = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line" } });
    const single = choices(byId(chartTopics({ view: one, drawn: "line", labels, names: ["Sum of Revenue"], act, folding: rowFolding(one, []) }), "layout"));
    assert.deepEqual(single.map((c) => [c.id, c.text, c.disabled, c.reason]), [
        ["chart-smooth", "Smooth lines", undefined, undefined],
        ["chart-show-each", "Show details", true, "Needs two or more fields in Rows."],
        ["chart-show-only", "Show group totals only", true, "Needs two or more fields in Rows."]
    ]);
    // German, with the names
    const de = MENU.de;
    const german = choices(byId(chartTopics({ view: two, drawn: "bar", labels: de, names: [], act, folding }), "layout"));
    assert.deepEqual(german.map((c) => c.text), ["Country einzeln zeigen", "Nur Region zeigen"]);
});

test("Layout's row says how the groups of Rows show: Each Country, Region only, or some collapsed, with the other layout state (#580 review)", () => {
    const act = { display: () => {}, expand: () => {}, collapse: () => {} };
    const two = norm({ rows: ["Region", "Country"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", smooth: true } });
    const state = (view, folding) => {
        const t = byId(chartTopics({ view, drawn: "line", labels, names: ["Sum of Revenue"], act, folding }), "layout");
        return [t.state, t.changed];
    };
    assert.deepEqual(state(two, { canExpand: false, canCollapse: true, collapsed: 0, why: {} }), ["Smooth lines, Each Country", true]);
    const plain = { ...two, chart: { ...two.chart, smooth: false } };
    assert.deepEqual(state(plain, { canExpand: false, canCollapse: true, collapsed: 0, why: {} }), ["Each Country", false]);
    assert.deepEqual(state(plain, { canExpand: true, canCollapse: false, collapsed: 2, why: {} }), ["Region only", true]);
    assert.deepEqual(state(plain, { canExpand: true, canCollapse: true, collapsed: 1, why: {} }), ["Some groups collapsed", true]);
    // one field in Rows: nothing to say about groups
    const one = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line" } });
    assert.deepEqual(state(one, rowFolding(one, [])), [null, false]);
    const de = MENU.de;
    assert.equal(byId(chartTopics({ view: plain, drawn: "line", labels: de, names: [], act, folding: { canExpand: true, canCollapse: false, collapsed: 2, why: {} } }), "layout").state, "Nur Region");
});

test("a treemap has no legend and no axis; its Series level lists its tiles (#518)", () => {
    const view = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" } });
    const topics = chartTopics({ view, drawn: "treemap", labels, names: ["North", "South"], act: { display: () => {} } });
    assert.equal(byId(topics, "legend"), undefined);
    assert.equal(byId(topics, "axis"), undefined);
    assert.ok(byId(topics, "valueLabels"));
    assert.ok(byId(topics, "series"));
});

/**
 * The choices of Chart settings whose name says what they do, by id (a number in it stands for any),
 * with why. Every other choice has a line under it (`note`), a hint beside it or an "i" (#916).
 * Horizontal bars write All straight, so there All needs its line (#963): see `plain`.
 */
const PLAIN = new Map([
    ["labels-off", "Off"],
    ["labels-value", "Value"],
    ["labels-percent", "Percent"],
    ["labels-both", "Value and percent"],
    ["legend-bottom", "Bottom"],
    ["legend-right", "Right"],
    ["legend-off", "Off"],
    ["axis-all", "All (slanted)"],
    ["groups-on", "On, under the group's title Group labels under the axis"],
    ["groups-off", "Off"],
    ["zoom-on", "On, under Zoom slider"],
    ["zoom-off", "Off"],
    ["tooltip-auto", "the Tooltip's i explains Automatic and All series"],
    ["tooltip-axis", "the Tooltip's i"],
    ["line-average", "Average, a reference line"],
    ["line-extremes", "High and low points"],
    ["target-remove", "Remove the target"],
    ["series-N", "a series' own name; the Series i explains its switch and colour"],
    ["series-N-default", "the colour's Default, with the reset icon"],
    ["color-stale-N", "Remove"],
    ["chart-smooth", "Smooth lines"],
    ["label-position-inside", "the i at Outside explains both"],
    ["chart-show-each", "Show each Country"],
    ["chart-show-only", "Show Region only"]
]);

/** Whether a choice of a chart type needs no line: horizontal bars' All is not the slanted All (#963). */
const plain = (type, id) => PLAIN.has(id) && !(type === "horizontal" && id === "axis-all");

/** Every choice Chart settings offers, with its actions, over every chart type, in one language. */
function everyChoice(language) {
    const view = (type, chart = {}) => norm({ rows: ["Region", "Country"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }, { field: "Price", agg: "sum" }], chart: { ...CHART_TYPES[type].chart, colors: [{ name: "Hardware", color: "#123456" }, { name: "Gone", color: "#abcdef" }], ...chart } });
    const act = { display: () => {}, expand: () => {}, collapse: () => {} };
    const folding = { canExpand: true, canCollapse: true, collapsed: 0, why: {} };
    const settings = CHART_TYPE_NAMES.filter((t) => t !== "auto").flatMap((type) => [
        { view: view(type), type, lines: { rules: { average: true, trend: true, target: true, extremes: true, notes: [] }, targetText: "" } },
        // a target the chart cannot draw: Remove the target; a pie's labels inside
        { view: view(type, { referenceLines: { average: false, trend: false, target: 5, extremes: false }, labelPosition: "inside" }), type, lines: { rules: { average: false, trend: false, target: false, extremes: false, notes: [] }, targetText: "5" } }
    ]);
    return settings.flatMap(({ view: v, type, lines }) =>
        chartTopics({ view: v, drawn: type, labels: language, names: ["Hardware", "Services"], act, lines, folding }).flatMap((topic) => choices(topic).flatMap((c) => [c, ...(c.actions ?? [])].map((choice) => ({ type, topic, choice, id: choice.id.replace(/\d+/g, "N") }))))
    );
}

test("every choice of Chart settings says what it does: by its name, or by a line under it, in English and German (#916)", () => {
    for (const language of [MENU.en, MENU.de]) {
        const all = everyChoice(language);
        const unclear = all.filter(({ type, choice, id }) => !plain(type, id) && !(choice.note || choice.hint || choice.info)).map(({ type, topic, choice }) => `${type}: ${topic.title} › ${choice.text}`);
        assert.deepEqual([...new Set(unclear)], [], language.lang);
        // the list names only choices there are
        assert.deepEqual([...PLAIN.keys()].filter((id) => !all.some((c) => c.id === id)), []);
    }
    // each line in German is German, not the English one
    const en = new Map(everyChoice(MENU.en).map((c) => [`${c.type} ${c.choice.id}`, c.choice.note]));
    for (const c of everyChoice(MENU.de)) {
        if (c.choice.note) {
            assert.notEqual(c.choice.note, en.get(`${c.type} ${c.choice.id}`), c.choice.id);
        }
    }
});

test("what the lines under Automatic say follows the chart: no numbers on bars, a pie's names or shares, the legend above, the axis labels of horizontal bars (#916)", () => {
    const note = (type, topic, id, chart = {}) => {
        const view = norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { ...CHART_TYPES[type].chart, ...chart } });
        return choices(byId(chartTopics({ view, drawn: type, labels, names: ["North", "South"], act: { display: () => {} } }), topic)).find((c) => c.id === id).note;
    };
    assert.equal(note("bar", "valueLabels", "labels-auto"), "None; the tooltip shows the numbers.");
    assert.equal(note("pie", "valueLabels", "labels-auto"), "Each slice's name.");
    assert.equal(note("donut", "valueLabels", "labels-auto", { labelPosition: "inside" }), "Each slice's share.");
    assert.equal(note("treemap", "valueLabels", "labels-auto"), "Each tile's name and value.");
    assert.equal(note("heatmap", "valueLabels", "labels-auto"), "The numbers, up to 200 filled cells, when the cells are large enough.");
    assert.equal(note("line", "legend", "legend-auto"), "Above, with two or more series.");
    assert.equal(note("pie", "legend", "legend-auto"), "Above.");
    assert.equal(note("bar", "axis", "axis-auto"), "Straight if they fit, else slanted; every n-th if still too many.");
    assert.equal(note("horizontal", "axis", "axis-auto"), "All if they fit, else every n-th.");
    // horizontal bars write every name straight: All, not All (slanted) (#963)
    assert.equal(note("horizontal", "axis", "axis-all"), "Every name, straight, even where they overlap.");
    assert.equal(note("bar", "axis", "axis-all"), undefined);
    assert.equal(note("pie", "tooltip", "chart-tooltip-share"), "Sums and counts with their share of the total, such as 25%. Not for averages.");
    assert.equal(note("line", "lines", "line-trend"), "A straight line that best fits the values.");
});

test("horizontal bars name All without slanted, in English and German, in the choice and the Axis' state (#963)", () => {
    for (const [language, all, slanted] of [[MENU.en, "All", "All (slanted)"], [MENU.de, "Alle", "Alle (schräg)"]]) {
        const axisOf = (type) => byId(chartTopics({ view: norm({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { ...CHART_TYPES[type].chart, axisLabels: "all" } }), drawn: type, labels: language, names: [], act: { display: () => {} } }), "axis");
        assert.equal(choices(axisOf("horizontal")).find((c) => c.id === "axis-all").text, all);
        assert.equal(axisOf("horizontal").state, all);
        assert.equal(choices(axisOf("bar")).find((c) => c.id === "axis-all").text, slanted);
    }
});

test("every chart type says what Automatic writes as value labels, in English and German (#916)", () => {
    for (const language of [MENU.en, MENU.de]) {
        for (const type of CHART_TYPE_NAMES.filter((t) => t !== "auto")) {
            const view = norm({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { ...CHART_TYPES[type].chart } });
            const auto = choices(byId(chartTopics({ view, drawn: type, labels: language, names: ["North"], act: { display: () => {} } }), "valueLabels")).find((c) => c.id === "labels-auto");
            assert.equal(typeof auto?.note, "string", `${language.lang} ${type}`);
            assert.ok(auto.note.length > 0, `${language.lang} ${type}`);
        }
    }
});
