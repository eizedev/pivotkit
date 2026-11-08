// The tips (tips.js) and the field descriptions (field-info.js): when each tip shows, which show at a
// time, what a host allows, what is stored; how a host's labels and descriptions are cleaned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutSections } from "../src/sections.js";
import { computePivot, encode, toSeries } from "pivotkit-core";
import { MANY_SERIES, MAX_CATEGORIES, chartPlan } from "../src/chart-types.js";
import { displayNames, fieldInfoOf, fieldMatches, typesOf } from "../src/field-info.js";
import { LABELS, resolveLabels } from "../src/labels.js";
import { LABELS as ALL_LABELS } from "../src/all-labels.js";
import { valueLabel } from "../src/names.js";
import { swapAxes } from "../src/view-ops.js";
import {
    ALL_TIPS, FIELDS_COLLAPSED, fieldsCollapsed, NO_EXPLANATIONS, SWITCHES, helpSwitch, keptOnReset, sectionOpen, withSection, NOTICE_IDS, SHORTCUTS, TIPS, TIP_IDS, TIP_LIMIT, TIP_THRESHOLDS, activeTips, allowedTips, cleanDismissed, readDismissed, storageName, subscribeStored, tipActionText, tipContext, tipText, withoutFilters, writeDismissed
} from "../src/tips.js";

const en = LABELS.en;

/** The context of a view of `rows`, as PivotReport builds it. */
function contextOf(rows, view, state = {}) {
    const encoded = encode(rows);
    const result = computePivot(encoded, view);
    const types = new Map(encoded.schema.fields.map((f) => [f.name.toLowerCase(), f.type]));
    const v = result.view;
    const typeOf = (field) => {
        const spec = v.derived.find((d) => d.name.toLowerCase() === String(field).toLowerCase());
        return types.get((spec ? spec.field : field).toLowerCase()) ?? "string";
    };
    const empty = v.rows.length === 0 && v.cols.length === 0 && v.values.length === 0;
    // the chart draws what chartPlan says, from a pivot with rows and columns swapped where it says so
    const plan = chartPlan(v, encoded);
    const drawn = plan.swap ? computePivot(encoded, swapAxes(v)) : result;
    const series = v.display === "chart" && v.values.length ? toSeries(drawn, { maxCategories: MAX_CATEGORIES }) : null;
    return tipContext({ view: v, result, encoded, failed: false, empty, typeOf, series, tableShown: v.display === "table" && !empty, chartPlan: plan, ...state });
}

/** The ids of the tips that hold, without a limit. */
const holding = (ctx) => activeTips(ctx, { allowed: "on", dismissed: [], limit: TIPS.length }).map((t) => t.id);

const SALES = [
    { Region: "North", Rep: "Ann", Units: 3, Day: "2026-01-05" },
    { Region: "South", Rep: "Bob", Units: 5, Day: "2026-02-20" },
    { Region: "West", Rep: "Cid", Units: 2, Day: "2026-03-03" }
];

test("tips: every entry has a text and, with an action, a button text, in English and German", () => {
    for (const labels of [LABELS.en, LABELS.de]) {
        for (const entry of TIPS) {
            const params = entry.id === "showAs" ? { type: "percentOfRowTotal" } : entry.id === "dateUngrouped" ? { field: "Day", unit: "yearMonth" } : { field: "F", count: 3, shown: 1, total: 2 };
            assert.ok(tipText(entry.id, params, labels, "en-US").length > 10, `${labels.lang} ${entry.id}`);
            if (entry.action) {
                assert.ok(tipActionText(entry, params, labels).length > 3, `${labels.lang} ${entry.id} action`);
            }
        }
    }
    // the shortcuts' texts load with the menus (Options, Help shows them)
    for (const labels of [ALL_LABELS.en, ALL_LABELS.de]) {
        assert.deepEqual(Object.keys(labels.shortcuts).sort(), SHORTCUTS.map((s) => s.text).sort());
    }
    assert.equal(new Set(TIP_IDS).size, TIP_IDS.length, "ids are unique");
    assert.equal(tipText("top", { field: "Rep", count: 1200, bottom: false }, en, "en-US"), "Rep shows the top 1,200 only: totals and percentages cover these items, not all of them.");
    assert.equal(tipActionText(TIPS.find((t) => t.id === "dateUngrouped"), { unit: "yearMonth" }, en), "Group by Month");
});

test("tips: the empty report, rows without values, the cells, a value opened once", () => {
    assert.deepEqual(holding(contextOf(SALES, {})), ["menus"]);
    assert.deepEqual(holding(contextOf(SALES, {}, { dragAt: 0 })), ["afterDrag"], "after a drag the menus tip gives way");
    assert.deepEqual(holding(contextOf(SALES, { rows: ["Region"] })), ["values"]);
    assert.deepEqual(holding(contextOf(SALES, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] })), ["cells"]);
    assert.deepEqual(holding(contextOf(SALES, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }, { drilled: true })), []);
});

test("tips: top N, a filter that leaves nothing, a percentage, a text in Values", () => {
    const top = contextOf(SALES, { rows: ["Rep"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Rep", type: "top", count: 2 }] });
    assert.deepEqual(activeTips(top, { allowed: "on", dismissed: [] })[0].params, { field: "Rep", count: 2, bottom: false });
    const none = contextOf(SALES, { rows: ["Rep"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Rep", type: "include", items: [] }] });
    assert.equal(holding(none)[0], "filterEmpty");
    const view = withoutFilters(none.view);
    assert.deepEqual(view.filters, [], "the filter of a field on an axis goes");
    const zone = withoutFilters({ rows: [], cols: [], filters: [{ field: "Region", type: "exclude", items: ["North"] }] });
    assert.deepEqual(zone.filters, [{ field: "Region", type: "exclude", items: [] }], "a field in the Filters zone stays there");
    assert.ok(!holding(contextOf([], { rows: ["Rep"] })).includes("filterEmpty"), "no data is no filter problem");
    const pct = contextOf(SALES, { rows: ["Rep"], values: [{ field: "Units", agg: "sum", showAs: { type: "percentOfColumnTotal" } }] });
    assert.deepEqual(activeTips(pct, { allowed: "on", dismissed: [] })[0].params, { type: "percentOfColumnTotal" });
    assert.match(tipText("showAs", { type: "percentOfColumnTotal" }, en, "en-US"), /^100% is the total of each column/);
    // the percent sign as the language writes it: no space in English, a space in German
    assert.match(tipText("showAs", { type: "percentOfColumnTotal" }, LABELS.de, "de-DE"), /^100 % ist die Summe/);
    assert.ok(!holding(contextOf(SALES, { rows: ["Rep"], values: [{ field: "Units", agg: "sum", showAs: { type: "rankDescending" } }] })).includes("showAs"), "a rank is no percentage");
    const text = contextOf(SALES, { rows: ["Region"], values: [{ field: "Rep", agg: "count" }] });
    assert.deepEqual(activeTips(text, { allowed: "on", dismissed: [] })[0], { id: "textValue", params: { field: "Rep" }, entry: TIPS.find((t) => t.id === "textValue") });
    assert.ok(!holding(contextOf(SALES, { rows: ["Region"], values: [{ field: "Units", agg: "count" }] })).includes("textValue"));
    assert.ok(!holding(contextOf(SALES, { rows: ["Region"], values: [{ field: "Rep", agg: "count", label: "Reps" }] })).includes("textValue"), "a named count is on purpose");
});

test("tips: an ungrouped date with many columns, many columns, from their thresholds", () => {
    const days = Array.from({ length: TIP_THRESHOLDS.dateColumns + 1 }, (_, i) => ({ Day: `2026-01-${String(i + 1).padStart(2, "0")}`, R: "a", V: i }));
    const wide = contextOf(days, { rows: ["R"], cols: ["Day"], values: [{ field: "V", agg: "sum" }] });
    const tip = activeTips(wide, { allowed: "on", dismissed: [], limit: TIPS.length }).find((t) => t.id === "dateUngrouped");
    assert.deepEqual(tip?.params, { field: "Day", source: "Day", unit: "yearMonth" }, "dates without times: by month, not by day");
    assert.ok(!holding(contextOf(days.slice(1), { rows: ["R"], cols: ["Day"], values: [{ field: "V", agg: "sum" }] })).includes("dateUngrouped"), "at the threshold: no tip");
    const grouped = contextOf(days, { rows: ["R"], cols: ["Day (Month)"], derived: [{ name: "Day (Month)", field: "Day", by: "yearMonth" }], values: [{ field: "V", agg: "sum" }] });
    assert.ok(!holding(grouped).includes("dateUngrouped"), "a grouped date");
    const cols = Array.from({ length: TIP_THRESHOLDS.manyColumns + 1 }, (_, i) => ({ C: `c${i}`, R: "a", V: i }));
    assert.ok(holding(contextOf(cols, { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }] })).includes("manyColumns"));
    assert.ok(!holding(contextOf(cols.slice(1), { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }] })).includes("manyColumns"));
    const square = cols.flatMap((c) => cols.map((r) => ({ C: c.C, R: r.C, V: 1 })));
    assert.ok(!holding(contextOf(square, { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }] })).includes("manyColumns"), "as many rows: swapping does not help");
});

test("tips: charts with many series, dates on Columns, capped categories, and the table", () => {
    const rows = [];
    for (let c = 0; c < MANY_SERIES + 2; c++) rows.push({ R: "r", C: `c${c}`, V: c, D: `2026-01-${String(c + 1).padStart(2, "0")}` });
    const bars = contextOf(rows, { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }], display: "chart", chart: { type: "bar" } });
    assert.deepEqual(holding(bars), ["chartSeries"]);
    const pie = contextOf(rows, { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }], display: "chart", chart: { type: "pie" } });
    // a pie has no series to tell apart; it adds up the columns, and says so
    assert.deepEqual(holding(pie), ["pieColumns"]);
    assert.equal(tipText("pieColumns", activeTips(pie, { allowed: "on", dismissed: [] })[0].params, en, "en-US"), "A pie draws one slice per row and adds up the columns (C). Bars show the columns side by side.");
    const lines = contextOf(rows, { rows: ["R"], cols: ["D"], values: [{ field: "V", agg: "sum" }], display: "chart", chart: { type: "line" } });
    assert.deepEqual(holding(lines), ["chartDates"], "the dates tip says it, not the series tip too");
    const wide = Array.from({ length: MAX_CATEGORIES + 5 }, (_, i) => ({ K: `k${i}`, V: i }));
    const capped = contextOf(wide, { rows: ["K"], values: [{ field: "V", agg: "sum" }], display: "chart" });
    const tip = activeTips(capped, { allowed: "on", dismissed: [] })[0];
    assert.equal(tipText(tip.id, tip.params, en, "en-US"), `Showing the first ${MAX_CATEGORIES} of ${MAX_CATEGORIES + 5} categories. Add a filter or Top N to choose them.`);
});

test("tips: an automatic chart draws lines over dates (swapped for the chart alone), a chosen type gets the suggestion", () => {
    const rows = [];
    for (const R of ["North", "South"]) for (let m = 1; m <= 6; m++) rows.push({ R, D: `2026-0${m}-10`, V: m });
    const month = [{ name: "D by month", field: "D", by: "yearMonth" }];
    const view = (chart, axes) => contextOf(rows, { ...axes, derived: month, values: [{ field: "V", agg: "sum" }], display: "chart", ...(chart ? { chart } : {}) });
    // dates on Columns, no type chosen: lines with the months along the axis, no tip to swap
    const auto = view(null, { rows: ["R"], cols: ["D by month"] });
    assert.deepEqual([auto.chartPlan.name, auto.chartPlan.auto, auto.chartPlan.swap], ["line", true, true]);
    assert.deepEqual(auto.series.categories.length, 6, "the months are the categories");
    assert.deepEqual(holding(auto), []);
    // dates on Rows: lines as they are; no date: bars
    assert.deepEqual(view(null, { rows: ["D by month"], cols: ["R"] }).chartPlan, { name: "line", auto: true, swap: false, chart: { type: "line", stacked: false, horizontal: false } });
    assert.equal(contextOf(rows, { rows: ["R"], values: [{ field: "V", agg: "sum" }], display: "chart" }).chartPlan.name, "bar");
    // a type the user chose: drawn as chosen, with a one-click suggestion first
    const bars = view({ type: "bar" }, { rows: ["R"], cols: ["D by month"] });
    assert.deepEqual([bars.chartPlan.name, bars.chartPlan.auto], ["bar", false]);
    const first = activeTips(bars, { allowed: "on", dismissed: [] })[0];
    assert.equal(first.id, "chartOverTime");
    assert.equal(tipText(first.id, first.params, en, "en-US"), "D by month is a date: lines show how the values change over time.");
    assert.equal(tipActionText(first.entry, first.params, en), "Show as lines over time");
    assert.equal(first.entry.action, "auto");
    // a repeating grouping (weekday) is categories: no suggestion of lines over time
    const weekdays = contextOf(rows, { rows: ["D by weekday"], derived: [{ name: "D by weekday", field: "D", by: "weekday" }], values: [{ field: "V", agg: "sum" }], display: "chart", chart: { type: "bar" } });
    assert.ok(!holding(weekdays).includes("chartOverTime"));
    assert.equal(contextOf(rows, { rows: ["D by weekday"], derived: [{ name: "D by weekday", field: "D", by: "weekday" }], values: [{ field: "V", agg: "sum" }], display: "chart" }).chartPlan.name, "bar");
    // lines chosen, or a heatmap (dates in its grid): no suggestion
    assert.ok(!holding(view({ type: "line" }, { rows: ["D by month"], cols: ["R"] })).includes("chartOverTime"));
    assert.ok(!holding(view({ type: "heatmap" }, { rows: ["R"], cols: ["D by month"] })).includes("chartOverTime"));
});

test("tips: a pie of more than about 7 slices suggests bars", () => {
    const slices = (n) => contextOf(Array.from({ length: n }, (_, i) => ({ K: `k${i}`, V: i + 1 })), { rows: ["K"], values: [{ field: "V", agg: "sum" }], display: "chart", chart: { type: "donut" } });
    assert.ok(!holding(slices(TIP_THRESHOLDS.pieSlices)).includes("pieSlices"), "at the threshold: no tip");
    const many = activeTips(slices(TIP_THRESHOLDS.pieSlices + 3), { allowed: "on", dismissed: [] })[0];
    assert.equal(many.id, "pieSlices");
    assert.equal(many.entry.action, "bars");
    assert.equal(tipText(many.id, many.params, en, "en-US"), "A pie works for up to about 7 parts; this one has 10. Bars compare them more easily.");
    assert.equal(tipText(many.id, many.params, LABELS.de, "de-DE"), "Ein Kreis eignet sich für bis zu etwa 7 Teile; dieser hat 10. Balken lassen sich leichter vergleichen.");
});

test("tips: Undo after the first drag, saving after several changes", () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
    assert.ok(holding(contextOf(SALES, view, { dragAt: 1, changes: 1 + TIP_THRESHOLDS.afterDragChanges })).includes("afterDrag"));
    assert.ok(!holding(contextOf(SALES, view, { dragAt: 1, changes: 2 + TIP_THRESHOLDS.afterDragChanges })).includes("afterDrag"));
    assert.ok(holding(contextOf(SALES, view, { canSave: true, changes: TIP_THRESHOLDS.changesBeforeSave })).includes("saveTemplate"));
    assert.ok(!holding(contextOf(SALES, view, { canSave: true, changes: TIP_THRESHOLDS.changesBeforeSave - 1 })).includes("saveTemplate"));
    assert.ok(!holding(contextOf(SALES, view, { canSave: false, changes: 99 })).includes("saveTemplate"), "only when saving is there");
    // after a save the tip goes, and comes back after as many changes again
    const saved = TIP_THRESHOLDS.changesBeforeSave + 2;
    assert.ok(!holding(contextOf(SALES, view, { canSave: true, changes: saved, savedAt: saved })).includes("saveTemplate"));
    assert.ok(!holding(contextOf(SALES, view, { canSave: true, changes: saved + TIP_THRESHOLDS.changesBeforeSave - 1, savedAt: saved })).includes("saveTemplate"));
    assert.ok(holding(contextOf(SALES, view, { canSave: true, changes: saved + TIP_THRESHOLDS.changesBeforeSave, savedAt: saved })).includes("saveTemplate"));
});

test("tips: at most TIP_LIMIT, the most important first; allowed, dismissed and switched off", () => {
    const ctx = contextOf(SALES, { rows: ["Rep"], values: [{ field: "Rep", agg: "count", showAs: { type: "percentOfGrandTotal" } }], filters: [{ field: "Rep", type: "top", count: 2 }] });
    assert.deepEqual(holding(ctx), ["top", "showAs", "textValue", "cells"]);
    // one tip at a time; the next one waits in the queue until the first is dismissed or followed
    assert.equal(TIP_LIMIT, 1);
    // "top" is a notice: it counts against no limit
    assert.deepEqual(activeTips(ctx, { allowed: "on", dismissed: [] }).map((t) => t.id), ["top", "showAs"]);
    assert.deepEqual(activeTips(ctx, { allowed: "on", dismissed: [], limit: 2 }).map((t) => t.id), ["top", "showAs", "textValue"]);
    assert.deepEqual(activeTips(ctx, { allowed: "on", dismissed: ["showAs"] }).map((t) => t.id), ["top", "textValue"]);
    assert.deepEqual(activeTips(ctx, { allowed: "on", dismissed: ["showAs", "textValue"] }).map((t) => t.id), ["top", "cells"]);
    assert.deepEqual(activeTips(ctx, { allowed: ["cells", "textValue"], dismissed: [] }).map((t) => t.id), ["top", "textValue"]);
    assert.deepEqual(activeTips({ ...ctx, failed: true }, { allowed: "on", dismissed: [] }), [], "an error shows nothing");
});

test("notices (the result is cut or empty) stay: with tips off, all dismissed, at the narrow limit", () => {
    assert.deepEqual(NOTICE_IDS, ["filterEmpty", "top", "chartCapped"]);
    assert.ok(NOTICE_IDS.every((id) => !TIP_IDS.includes(id)), "a notice is not a tip id a host or a user can switch off");
    const ctx = contextOf(SALES, { rows: ["Rep"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Rep", type: "top", count: 2 }] });
    for (const options of [{ allowed: "off", dismissed: [] }, { allowed: "on", dismissed: [ALL_TIPS] }, { allowed: ["cells"], dismissed: ["cells"] }, { allowed: "on", dismissed: ["top"], limit: 0 }]) {
        assert.deepEqual(activeTips(ctx, /** @type {any} */ (options)).map((t) => t.id), ["top"], JSON.stringify(options));
    }
    assert.deepEqual(cleanDismissed(["top", "cells"]), ["cells"], "a notice cannot be stored as dismissed");
});

test("tips: the host's tips prop and attribute, dismissed ids, storage that fails", () => {
    assert.equal(allowedTips(undefined), "on");
    assert.equal(allowedTips("on"), "on");
    assert.equal(allowedTips(""), "on");
    assert.equal(allowedTips("off"), "off");
    assert.deepEqual(allowedTips("values, cells,nope,top"), ["values", "cells"]);
    assert.deepEqual(allowedTips(["values", 3, "constructor"]), ["values"]);
    assert.deepEqual(cleanDismissed(["cells", "cells", "*", "__proto__", 1]), ["cells", "*"]);
    assert.deepEqual(cleanDismissed("top"), []);
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    let told = 0;
    const stop = subscribeStored("sales", () => told++);
    writeDismissed("sales", storage, ["cells"]);
    assert.equal(store.get(storageName("sales")), '["cells"]');
    assert.deepEqual(readDismissed("sales", storage), ["cells"]);
    assert.equal(told, 1, "a write tells the reports with that key");
    stop();
    writeDismissed("sales", storage, ["cells", "values"]);
    assert.equal(told, 1);
    writeDismissed("sales", storage, ["cells"]);
    assert.deepEqual(readDismissed("other", storage), [], "every report has its own key");
    writeDismissed(undefined, storage, ["cells"]);
    assert.equal(store.size, 1, "no key: nothing stored");
    writeDismissed("sales", storage, []);
    assert.equal(store.size, 0);
    store.set(storageName("bad"), "{not json");
    assert.deepEqual(readDismissed("bad", storage), []);
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => { throw new Error("x"); } };
    assert.deepEqual(readDismissed("sales", blocked), []);
    assert.doesNotThrow(() => writeDismissed("sales", blocked, ["cells"]));
});

test("display names: a label that two fields share, or another field's name, gets the field's name", () => {
    const info = fieldInfoOf({ a: { label: "Same" }, b: { label: "same" }, c: { label: "d" }, e: { label: "Unique" } });
    assert.deepEqual({ ...displayNames(info, ["a", "b", "c", "d", "e"]) }, { a: "Same (a)", b: "same (b)", c: "d (c)", e: "Unique" });
    assert.deepEqual({ ...displayNames(fieldInfoOf({ Units: { label: "units" } }), ["Units"]) }, { units: "units" }, "its own name in other case is no clash");
});

test("labels: a host's text under an earlier key of a tip still applies", () => {
    const l = resolveLabels("en", { topNote: "Only {count} of {field}.", cellHint: "Click.", tips: { cells: "Own." } });
    assert.equal(l.tips.top, "Only {count} of {field}.");
    assert.equal(l.tips.cells, "Own.", "the tip's own entry wins");
    assert.equal(resolveLabels("de", { emptyHint: 3 }).tips.menus, LABELS.de.tips.menus, "a wrong type is ignored");
});

test("field descriptions: cleaned like a schema; nothing without fieldDefaults", () => {
    assert.equal(fieldInfoOf(undefined).size, 0);
    assert.equal(fieldInfoOf({ Units: { agg: "average", format: "number:1" } }).size, 0, "fieldDefaults without labels or descriptions change nothing");
    assert.equal(displayNames(fieldInfoOf({ Units: { agg: "sum" } })), null);
    const info = fieldInfoOf(JSON.parse('{"Units":{"label":" Units sold ","description":"How many.\\nCounted at the till.","href":"https://example.org/units"},"Rep":{"description":"x","href":"http://example.org"},"Region":{"label":42,"href":"https://example.org"},"__proto__":{"label":"P"}}'));
    assert.deepEqual(info.get("units"), { label: "Units sold", description: "How many. Counted at the till.", href: "https://example.org/units" });
    assert.deepEqual(info.get("rep"), { description: "x" }, "an http link is dropped");
    assert.equal(info.get("region"), undefined, "a label that is not text, a link without a description");
    assert.deepEqual(info.get("__proto__"), { label: "P" });
    const names = displayNames(info);
    assert.equal(Object.getPrototypeOf(names), Object.prototype);
    assert.equal(names.units, "Units sold");
    assert.equal(valueLabel({ field: "Units", agg: "sum" }, { ...en, core: { ...en.core, fields: names } }), "Sum of Units sold");
    assert.equal(valueLabel({ field: "Units", agg: "sum", showAs: { type: "percentOfGrandTotal" } }, { ...en, core: { ...en.core, fields: names } }), "% of grand total of Units sold");
    assert.equal(valueLabel({ field: "Units", agg: "sum" }, en), "Sum of Units");
    const long = fieldInfoOf({ A: { description: "y".repeat(5000) } }).get("a");
    assert.ok(long.description.length <= 1000);
    assert.ok(fieldMatches("Units", "sold", info.get("units")));
    assert.ok(fieldMatches("Units", "till", info.get("units")));
    assert.ok(fieldMatches("Units", "uni", undefined));
    assert.ok(!fieldMatches("Units", "rep", info.get("units")));
    assert.deepEqual(typesOf({ A: { type: "number" }, B: { type: "date" }, C: { type: "eval" }, D: {} }), { A: "number", B: "date" });
    assert.equal(typesOf({ A: { agg: "sum" } }), null);
});

test("tips: a line or an area over categories without an order suggests bars; dates, ranges and a custom order do not", () => {
    const rows = [
        { Country: "Chile", Region: "Americas", Year: 2024, Day: "2026-01-02", Pop: 19 },
        { Country: "Japan", Region: "Asia", Year: 2025, Day: "2026-01-03", Pop: 124 }
    ];
    const at = (view) => holding(contextOf(rows, { values: [{ field: "Pop", agg: "sum" }], display: "chart", ...view }));
    assert.deepEqual(at({ rows: ["Region", "Country"], chart: { type: "area" } }), ["chartTrend"]);
    assert.deepEqual(at({ rows: ["Country"], chart: { type: "line" } }), ["chartTrend"]);
    assert.deepEqual(at({ rows: ["Country"], chart: { type: "bar" } }), []);
    assert.deepEqual(at({ rows: ["Day"], chart: { type: "line" } }), [], "dates are an order");
    assert.deepEqual(at({ rows: ["Year"], chart: { type: "line" } }), [], "numbers are an order");
    assert.deepEqual(at({ rows: ["Country"], chart: { type: "line" }, sort: [{ field: "Country", by: "custom", items: ["Japan", "Chile"] }] }), [], "a custom order is an order");
    const ctx = contextOf(rows, { rows: ["Country"], values: [{ field: "Pop", agg: "sum" }], display: "chart", chart: { type: "area" } });
    const tip = activeTips(ctx, { allowed: "on", dismissed: [] }).find((t) => t.id === "chartTrend");
    assert.equal(tip.entry.action, "bars");
    assert.equal(tipActionText(tip.entry, tip.params, en), "Switch to Bars");
    assert.equal(tipText("chartTrend", {}, en, "en-US"), "Lines connect points into a trend. For categories such as countries, bars fit better.");
});

test("help switches: the host's on or off decides, else the user's list; Show dismissed tips again keeps them", () => {
    // one switch of the user's, "Show explanations", for the "i" of settings, zones and fields
    // and the field list collapsed to a rail (FIELDS_COLLAPSED), kept in the same list
    assert.deepEqual(SWITCHES, [ALL_TIPS, NO_EXPLANATIONS, FIELDS_COLLAPSED]);
    assert.deepEqual(helpSwitch(undefined, []), { on: true, user: true });
    assert.deepEqual(helpSwitch(undefined, [NO_EXPLANATIONS]), { on: false, user: true });
    // a host's prop decides its kind, whatever the switch says
    assert.deepEqual(helpSwitch("on", [NO_EXPLANATIONS]), { on: true, user: false });
    assert.deepEqual(helpSwitch("off", []), { on: false, user: false });
    // the earlier separate switches are no entries any more
    assert.deepEqual(cleanDismissed(["-fieldInfo", "-zoneInfo", "-settingInfo", "nope", ALL_TIPS, NO_EXPLANATIONS, NO_EXPLANATIONS]), [ALL_TIPS, NO_EXPLANATIONS]);
    // "Show dismissed tips again" keeps the switches and the sections' states, takes the tips back
    assert.deepEqual([ALL_TIPS, NO_EXPLANATIONS, "open:share", "values"].filter(keptOnReset), [ALL_TIPS, NO_EXPLANATIONS, "open:share"]);
});

test("the field list collapsed: the user's choice in this session, else the host's fieldList, else the stored list", () => {
    assert.equal(fieldsCollapsed(null, undefined, []), false);
    assert.equal(fieldsCollapsed(null, undefined, [FIELDS_COLLAPSED]), true);
    // the host decides over what was stored; a value it does not know leaves it to the user
    assert.equal(fieldsCollapsed(null, "open", [FIELDS_COLLAPSED]), false);
    assert.equal(fieldsCollapsed(null, "collapsed", []), true);
    assert.equal(fieldsCollapsed(null, "nope", [FIELDS_COLLAPSED]), true);
    // the user's change in this session wins over the host's start
    assert.equal(fieldsCollapsed(false, "collapsed", []), false);
    // a stored, kept switch: "Show dismissed tips again" does not open the list
    assert.deepEqual(cleanDismissed([FIELDS_COLLAPSED]), [FIELDS_COLLAPSED]);
    assert.equal(keptOnReset(FIELDS_COLLAPSED), true);
});

test("menu sections: open or folded by default, the user's choice kept in the tips' list only where it differs", () => {
    assert.equal(sectionOpen("exportDownload", []), true);
    assert.equal(sectionOpen("share", []), false);
    const opened = withSection([], "share", true);
    assert.deepEqual(opened, ["open:share"]);
    assert.equal(sectionOpen("share", opened), true);
    // back to its default: no entry
    assert.deepEqual(withSection(opened, "share", false), []);
    const folded = withSection(["values"], "exportDownload", false);
    assert.deepEqual(folded, ["values", "closed:exportDownload"]);
    assert.equal(sectionOpen("exportDownload", folded), false);
    // stored entries survive cleaning; unknown sections and shapes do not
    assert.deepEqual(cleanDismissed(["open:share", "closed:exportDownload", "open:nothing", "open:", "closed:__proto__"]), ["open:share", "closed:exportDownload"]);
    // a section without a default is open
    assert.equal(sectionOpen("unknown", []), true);
});

test("menu sections: Share and the chart's display settings start folded; the chip menus and Options fold no more", () => {
    assert.equal(sectionOpen("share", []), false);
    assert.equal(sectionOpen("chartDisplay", []), false);
    for (const id of ["exportDownload", "exportCopy", "thisView", "sharedViews", "myViews", "chartType"]) {
        assert.equal(sectionOpen(id, []), true, id);
    }
    // the folds that are gone (the chip menus and Options have levels now, the earlier folds of
    // Options → Rows, a value's Name and its Filters hint): a stored state of theirs is dropped
    const gone = ["summarize", "showAs", "format", "highlight", "move", "sort", "groupBy", "bins", "topN", "filters", "totals", "help", "name", "valueFilters", "folding"];
    assert.deepEqual(cleanDismissed([...gone.map((id) => `closed:${id}`), ...gone.map((id) => `open:${id}`), "open:share"]), ["open:share"]);
});

test("Reset menu sections: every section as at first, the tips and switches kept; Show dismissed tips again keeps the sections", () => {
    const list = [ALL_TIPS, "values", "open:share", "closed:exportDownload", FIELDS_COLLAPSED];
    assert.deepEqual(withoutSections(list), [ALL_TIPS, "values", FIELDS_COLLAPSED]);
    assert.equal(sectionOpen("share", withoutSections(list)), false);
    assert.equal(sectionOpen("exportDownload", withoutSections(list)), true);
    assert.deepEqual(list.filter(keptOnReset), [ALL_TIPS, "open:share", "closed:exportDownload", FIELDS_COLLAPSED]);
});
