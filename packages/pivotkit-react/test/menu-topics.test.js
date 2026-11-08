// The menus in levels as data (menu-topics.js): what each topic shows on the first level, what its
// choices change, the search over every level, and the keys of a menu (arrow keys, type-ahead).
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, normalize } from "pivotkit-core";
import { LABELS } from "../src/labels.js";
import { en as menuEn } from "../src/menu-labels.js";
import { de as menuDe } from "../src/menu-labels-de.js";
import { setItemFilter, setTopFilter, setValueFilter } from "../src/menu-ops.js";
import { axisTopics, optionTopics, rowName, searchEntries, searchHits, SEARCH_HITS, stepIndex, TOP_COUNTS, topText, typeAheadIndex, valueTopics } from "../src/menu-topics.js";

const data = encode([
    { Region: "North", Product: "A", Units: 3, Date: "2026-01-05" },
    { Region: "South", Product: "B", Units: 7, Date: "2026-02-14" },
    { Region: "West", Product: "A", Units: 1, Date: "2026-02-20" }
]);
const norm = (v) => normalize(v, data).view;
const MENU = { en: { ...LABELS.en, ...menuEn }, de: { ...LABELS.de, ...menuDe } };
const types = new Map([["region", "string"], ["product", "string"], ["units", "number"], ["date", "date"]]);
const byId = (topics, id) => topics.find((t) => t.id === id);
const choice = (topic, id) => topic.groups.flatMap((g) => g.choices).find((c) => c.id === id);
const units = { field: "Units", agg: "sum" };

const axis = (view, field = "Region", extra = {}) => axisTopics({ view, zone: "rows", index: view.rows.indexOf(field), field, types, labels: MENU.en, locale: "en-US", ...extra });

test("a field's first level: sort side by side, by its one value inline, Filter, Top items, Move to; each says what is set", () => {
    const view = norm({ rows: ["Region"], values: [units] });
    const topics = axis(view);
    assert.deepEqual(topics.map((t) => [t.id, t.kind]), [["sort", "segmented"], ["sortValue", "inline"], ["filter", "panel"], ["top", "panel"], ["move", "menu"]]);
    const sort = byId(topics, "sort");
    assert.deepEqual(sort.groups[0].choices.map((c) => [c.text, c.checked]), [["A to Z", true], ["Z to A", false]]);
    assert.deepEqual(byId(topics, "sortValue").groups[0].choices.map((c) => c.text), ["Largest Sum of Units first", "Smallest Sum of Units first"]);
    // nothing set: the defaults in words, no dot
    assert.deepEqual([byId(topics, "filter").state, byId(topics, "filter").changed], ["All", false]);
    assert.deepEqual([byId(topics, "top").state, byId(topics, "top").changed], ["Off", false]);
    // an action row says nothing on its right
    assert.equal(byId(topics, "move").state, undefined);
    assert.deepEqual(choice(byId(topics, "move"), "move-cols").closes, true);
});

test("a choice changes the view as the menu did: sort, and the history's note", () => {
    const view = norm({ rows: ["Region"], values: [units] });
    const { view: z, note } = choice(byId(axis(view), "sort"), "sort-label-desc").change();
    assert.deepEqual(z.sort, [{ field: "Region", by: "label", order: "desc" }]);
    assert.deepEqual(note, { step: "sort", field: "Region" });
    const largest = choice(byId(axis(view), "sortValue"), "sort-value-desc-0").change().view;
    assert.deepEqual(largest.sort, [{ field: "Region", by: "value", order: "desc", value: units }]);
    // A to Z again: no sort entry (the natural order)
    assert.deepEqual(choice(byId(axis(z), "sort"), "sort-label-asc").change().view.sort, []);
    // the current sort is visible: the radio, and the value sort's own state with its dot
    const topics = axis(largest);
    assert.equal(choice(byId(topics, "sortValue"), "sort-value-desc-0").checked, true);
    assert.equal(choice(byId(topics, "sort"), "sort-label-asc").checked, false);
    assert.deepEqual([byId(topics, "sortValue").state, byId(topics, "sortValue").changed], ["Largest Sum of Units first", true]);
});

test("several values to sort by: a level of their own; dates sort Oldest and Newest", () => {
    const view = norm({ rows: ["Date"], values: [units, { field: "Units", agg: "max" }] });
    const topics = axis(view, "Date");
    assert.equal(byId(topics, "sortValue").kind, "menu");
    assert.equal(byId(topics, "sortValue").groups[0].choices.length, 4);
    assert.deepEqual(byId(topics, "sort").groups[0].choices.map((c) => c.text), ["Oldest", "Newest"]);
});

test("the Filter row says what the filter keeps: the items picked and the value condition, as the chip does", () => {
    let view = norm({ rows: ["Region"], values: [units] });
    view = setItemFilter(view, "Region", ["North"], ["North", "South", "West"]);
    view = norm(setValueFilter(view, "Region", { by: units, op: ">", value: 10 }));
    const filter = byId(axis(view, "Region", { state: { summary: { shown: 1, total: 3 } } }), "filter");
    assert.deepEqual([filter.state, filter.changed], ["1 of 3, Sum of Units > 10", true]);
});

test("Top items: Off, or what is set in words; the quick counts", () => {
    const view = norm(setTopFilter(norm({ rows: ["Region"], values: [units] }), "Region", { count: 5, bottom: true, by: units }));
    assert.deepEqual([byId(axis(view), "top").state, byId(axis(view), "top").changed], ["Bottom 5 by Sum of Units", true]);
    assert.equal(topText(view, { count: 10 }, MENU.de, "de-DE"), "Top 10 nach Summe von Units");
    assert.deepEqual(TOP_COUNTS, [3, 5, 10]);
});

test("a date's Group level: one column with hints, under the two group headings, and None; a choice closes the menu", () => {
    const view = norm({ rows: ["Date"], values: [units] });
    const group = byId(axis(view, "Date"), "group");
    assert.equal(group.kind, "menu");
    assert.deepEqual(group.groups.map((g) => g.title), ["Along the time line", "Same period every year", undefined]);
    assert.deepEqual([group.state, group.changed], ["None", false]);
    const month = choice(group, "group-month");
    assert.deepEqual([month.text, month.hint, month.closes], ["Month of year", "Jan of every year", true]);
    const grouped = month.change().view;
    assert.deepEqual(grouped.rows, ["Date by month of year"]);
    const again = byId(axis(grouped, "Date by month of year"), "group");
    assert.deepEqual([again.state, again.changed], ["Month of year", true]);
    assert.equal(choice(again, "group-month").checked, true);
});

test("a number field has Number ranges as a level; Off says nothing is set", () => {
    const view = norm({ rows: ["Units"], values: [{ field: null, agg: "count" }] });
    const bins = byId(axis(view, "Units"), "bins");
    assert.deepEqual([bins.kind, bins.state, bins.changed], ["panel", "Off", false]);
});

test("a value's first level: Summarize by, Show as and Number format as levels, Highlight side by side, Name, Move to", () => {
    const view = norm({ rows: ["Region"], values: [units] });
    const topics = valueTopics({ view, index: 0, types, labels: MENU.en, locale: "en-US" });
    assert.deepEqual(topics.map((t) => [t.id, t.kind]), [["summarize", "menu"], ["showAs", "menu"], ["format", "menu"], ["highlight", "segmented"], ["name", "panel"], ["move", "menu"]]);
    assert.equal(byId(topics, "summarize").state, "Sum");
    // another aggregator is another chip: the menu closes
    assert.equal(choice(byId(topics, "summarize"), "agg-average").closes, true);
    assert.deepEqual(choice(byId(topics, "summarize"), "agg-average").change().view.values[0].agg, "average");
    // each format with an example in the report's locale
    const format = byId(topics, "format");
    // pivotkit-core's currency is the euro unless the view says another
    assert.equal(choice(format, "format-currency").hint, "€1,234.50");
    assert.equal(choice(format, "format-percent").hint, "25.6%");
    assert.deepEqual(format.groups.map((g) => g.title), [undefined, "More formats"]);
    // a choice applies at once and the menu stays open
    const scaled = choice(byId(topics, "highlight"), "cond-colorScale");
    assert.equal(scaled.closes, undefined);
    const next = scaled.change().view;
    assert.deepEqual(next.values[0].conditional, { type: "colorScale" });
    const highlight = byId(valueTopics({ view: next, index: 0, types, labels: MENU.en, locale: "en-US" }), "highlight");
    assert.equal(highlight.changed, true);
    assert.equal(choice(highlight, "cond-colorScale").checked, true);
    assert.deepEqual([byId(topics, "name").state, byId(topics, "name").changed], ["Sum of Units", false]);
});

test("Show as: a calculation along an axis adds the Along choices; a text value has no number settings", () => {
    const view = norm({ rows: ["Region"], values: [{ ...units, showAs: { type: "runningTotal", axis: "rows" } }] });
    const showAs = byId(valueTopics({ view, index: 0, types, labels: MENU.en, locale: "en-US" }), "showAs");
    assert.deepEqual([showAs.state, showAs.changed], ["Running total", true]);
    assert.equal(showAs.groups.at(-1).title, "Along");
    assert.deepEqual(choice(showAs, "along-cols").change().view.values[0].showAs, { type: "runningTotal", axis: "cols" });
    const list = norm({ rows: ["Product"], values: [{ field: "Region", agg: "listUnique" }] });
    assert.deepEqual(valueTopics({ view: list, index: 0, types, labels: MENU.en, locale: "en-US" }).map((t) => t.id), ["summarize", "name", "move"]);
});

test("Options: totals as switches (off with the reason where they change nothing), Rows, help, the shortcuts as a level", () => {
    const calls = [];
    const act = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
    const view = norm({ rows: ["Region"], values: [units] });
    const topics = optionTopics({ view, labels: MENU.en, folding: { canExpand: false, canCollapse: true, why: { expand: "expandNothing" } }, tips: { controls: true, on: true, canReset: false }, explanations: { on: false }, sections: { can: true }, act });
    assert.deepEqual(topics.map((t) => [t.id, t.kind]), [["totals", "inline"], ["rows", "inline"], ["help", "inline"], ["shortcuts", "panel"]]);
    const col = choice(byId(topics, "totals"), "total-grandTotalColumn");
    assert.deepEqual([col.checkbox, col.disabled, col.reason, col.info], [true, true, "Needs a field in Columns.", "grandTotalColumn"]);
    choice(byId(topics, "totals"), "total-grandTotalRow").run();
    choice(byId(topics, "help"), "show-explanations").run();
    choice(byId(topics, "help"), "reset-sections").run();
    assert.deepEqual(calls, [["total", "grandTotalRow", false], ["explain", true], ["resetSections"]]);
    assert.deepEqual([choice(byId(topics, "rows"), "expand-all").disabled, choice(byId(topics, "rows"), "expand-all").reason], [true, "Nothing is collapsed."]);
    assert.equal(choice(byId(topics, "help"), "reset-tips").disabled, true);
    // a host that decides the tips and explanations itself: no switches for them
    const hosted = optionTopics({ view, labels: MENU.en, folding: { canExpand: true, canCollapse: true, why: {} }, tips: { controls: false, on: true, canReset: false }, explanations: null, sections: null, act });
    assert.deepEqual(byId(hosted, "help").groups[0].choices, []);
});

test("search: every choice of every level with its path, and the panels; all words must match; the start of a text first", () => {
    const view = norm({ rows: ["Region"], values: [units] });
    const entries = searchEntries(valueTopics({ view, index: 0, types, labels: MENU.en, locale: "en-US" }));
    const hit = (q) => searchHits(entries, q, "en-US").map((e) => `${e.text} | ${e.path}`);
    assert.deepEqual(hit("currency"), ["Currency | Number format"]);
    assert.deepEqual(hit("compact"), ["Compact (1.2K) | Number format › More formats"]);
    // the path counts: "format" finds the formats, the words in any order
    assert.ok(hit("format whole").includes("Whole number | Number format › More formats"));
    assert.deepEqual(hit("name"), ["Name | "]);
    assert.deepEqual(hit("   "), []);
    assert.deepEqual(hit("nothing like this"), []);
    assert.ok(searchHits(entries, "o", "en-US").length <= SEARCH_HITS);
    // a field's: the Filter panel is an entry that opens it
    const field = searchEntries(axis(view));
    assert.deepEqual(searchHits(field, "filt", "en-US").map((e) => [e.id, Boolean(e.choice)]), [["open-filter", false], ["move-filters", true]]);
    assert.deepEqual(searchHits(field, "move col", "en-US").map((e) => e.id), ["move-cols"]);
});

test("the keys of a menu: arrows around the ends, Home and End; type-ahead moves on with one letter, stays with more", () => {
    assert.equal(stepIndex("ArrowDown", 2, 3), 0);
    assert.equal(stepIndex("ArrowUp", 0, 3), 2);
    assert.equal(stepIndex("ArrowUp", -1, 3), 2);
    assert.equal(stepIndex("Home", 2, 3), 0);
    assert.equal(stepIndex("End", 0, 3), 2);
    assert.equal(stepIndex("a", 0, 3), null);
    assert.equal(stepIndex("ArrowDown", -1, 0), null);
    const texts = ["Sort", "Sort by value", "Filter", "Show as", "Move to"];
    assert.equal(typeAheadIndex(texts, 0, "s"), 1);
    assert.equal(typeAheadIndex(texts, 1, "s"), 3);
    assert.equal(typeAheadIndex(texts, 3, "s"), 0);
    assert.equal(typeAheadIndex(texts, 3, "so"), 0);
    assert.equal(typeAheadIndex(texts, 1, "so"), 1);
    assert.equal(typeAheadIndex(texts, 0, "x"), null);
    assert.equal(typeAheadIndex(["Ändern", "Zeile"], -1, "ä", "de-DE"), 0);
});

test("a row's name says its state and a change in words, not only with the dot", () => {
    assert.equal(rowName("Filter", "1 of 3", true, MENU.en.sectionChanged), "Filter, 1 of 3, changed");
    assert.equal(rowName("Move to", undefined, false, MENU.en.sectionChanged), "Move to");
    assert.equal(rowName("Filter", "Alle", false, MENU.de.sectionChanged), "Filter, Alle");
});
