// The tips (tips.js) and the field descriptions (field-info.js): when each tip shows, which show at a
// time, what a host allows, what is stored; how a host's labels and descriptions are cleaned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toSeries } from "pivotkit-core";
import { MANY_SERIES, MAX_CATEGORIES } from "../src/chart-types.js";
import { displayNames, fieldInfoOf, fieldMatches, typesOf } from "../src/field-info.js";
import { LABELS, resolveLabels } from "../src/labels.js";
import { valueLabel } from "../src/names.js";
import {
    ALL_TIPS, NO_FIELD_INFO, NO_ZONE_INFO, SWITCHES, helpSwitch, NOTICE_IDS, SHORTCUTS, TIPS, TIP_IDS, TIP_LIMIT, TIP_THRESHOLDS, activeTips, allowedTips, cleanDismissed, readDismissed, storageName, subscribeStored, tipActionText, tipContext, tipText, withoutFilters, writeDismissed
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
    const series = v.display === "chart" && v.values.length ? toSeries(result, { maxCategories: MAX_CATEGORIES }) : null;
    return tipContext({ view: v, result, encoded, failed: false, empty, typeOf, series, tableShown: v.display === "table" && !empty, ...state });
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
    assert.match(tipText("showAs", { type: "percentOfColumnTotal" }, en, "en-US"), /^100 % is the total of each column/);
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
    assert.deepEqual(holding(pie), [], "a pie has no series to tell apart");
    const lines = contextOf(rows, { rows: ["R"], cols: ["D"], values: [{ field: "V", agg: "sum" }], display: "chart", chart: { type: "line" } });
    assert.deepEqual(holding(lines), ["chartDates"], "the dates tip says it, not the series tip too");
    const wide = Array.from({ length: MAX_CATEGORIES + 5 }, (_, i) => ({ K: `k${i}`, V: i }));
    const capped = contextOf(wide, { rows: ["K"], values: [{ field: "V", agg: "sum" }], display: "chart" });
    const tip = activeTips(capped, { allowed: "on", dismissed: [] })[0];
    assert.equal(tipText(tip.id, tip.params, en, "en-US"), `Showing the first ${MAX_CATEGORIES} of ${MAX_CATEGORIES + 5} categories. Add a filter or Top N to choose them.`);
});

test("tips: Undo after the first drag, saving after several changes", () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
    assert.ok(holding(contextOf(SALES, view, { dragAt: 1, changes: 1 + TIP_THRESHOLDS.afterDragChanges })).includes("afterDrag"));
    assert.ok(!holding(contextOf(SALES, view, { dragAt: 1, changes: 2 + TIP_THRESHOLDS.afterDragChanges })).includes("afterDrag"));
    assert.ok(holding(contextOf(SALES, view, { canSave: true, changes: TIP_THRESHOLDS.changesBeforeSave })).includes("saveTemplate"));
    assert.ok(!holding(contextOf(SALES, view, { canSave: true, changes: TIP_THRESHOLDS.changesBeforeSave - 1 })).includes("saveTemplate"));
    assert.ok(!holding(contextOf(SALES, view, { canSave: false, changes: 99 })).includes("saveTemplate"), "only when saving is there");
});

test("tips: at most TIP_LIMIT, the most important first; allowed, dismissed and switched off", () => {
    const ctx = contextOf(SALES, { rows: ["Rep"], values: [{ field: "Rep", agg: "count", showAs: { type: "percentOfGrandTotal" } }], filters: [{ field: "Rep", type: "top", count: 2 }] });
    assert.deepEqual(holding(ctx), ["top", "showAs", "textValue", "cells"]);
    assert.equal(TIP_LIMIT, 2);
    // "top" is a notice: it counts against no limit
    assert.deepEqual(activeTips(ctx, { allowed: "on", dismissed: [] }).map((t) => t.id), ["top", "showAs", "textValue"]);
    assert.deepEqual(activeTips(ctx, { allowed: "on", dismissed: [], limit: 1 }).map((t) => t.id), ["top", "showAs"]);
    assert.deepEqual(activeTips(ctx, { allowed: "on", dismissed: ["showAs"] }).map((t) => t.id), ["top", "textValue", "cells"]);
    assert.deepEqual(activeTips(ctx, { allowed: ["cells", "textValue"], dismissed: [] }).map((t) => t.id), ["top", "textValue", "cells"]);
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
    assert.deepEqual(helpSwitch(undefined, [], NO_FIELD_INFO), { on: true, user: true });
    assert.deepEqual(helpSwitch(undefined, [NO_FIELD_INFO], NO_FIELD_INFO), { on: false, user: true });
    assert.deepEqual(helpSwitch("on", [NO_FIELD_INFO], NO_FIELD_INFO), { on: true, user: false });
    assert.deepEqual(helpSwitch("off", [], NO_ZONE_INFO), { on: false, user: false });
    assert.deepEqual(cleanDismissed([NO_FIELD_INFO, NO_ZONE_INFO, "nope", ALL_TIPS, NO_ZONE_INFO]), [NO_FIELD_INFO, NO_ZONE_INFO, ALL_TIPS]);
    assert.deepEqual(SWITCHES, [ALL_TIPS, NO_FIELD_INFO, NO_ZONE_INFO]);
});
