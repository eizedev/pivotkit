// Sharing a view without a DOM: the link in the fragment, the tab's stored view, a view loaded from
// JSON, what was left out in plain words, and the host's chartOptions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "pivotkit-core";
import { decodeViewLink, encodeViewLink } from "pivotkit-core/link";
import { CHART_OPTIONS_CAPS, cleanChartOptions, mergeChartOptions } from "../src/chart-options.js";
import { LABELS } from "../src/labels.js";
import { issueLines, linkParam, readLinkParam, readStoredView, shareBase, viewFromObject, viewFromText, viewStorageName, withLinkParam, writeStoredView } from "../src/share.js";

const data = encode([
    { Region: "North", Product: "A", Units: 3 },
    { Region: "South", Product: "B", Units: 7 }
]);

test("the link's place in the fragment: pivot, or pivot-<storageKey>; other entries stay", () => {
    assert.equal(linkParam(undefined), "pivot");
    assert.equal(linkParam("sales"), "pivot-sales");
    const text = encodeViewLink({ rows: ["Region"] });
    const url = withLinkParam("https://example.com/report?x=1", "pivot", text);
    assert.equal(url, `https://example.com/report?x=1#pivot=${text}`);
    const two = withLinkParam(url, "pivot-ops", "1.abc");
    assert.equal(readLinkParam(new URL(two).hash, "pivot"), text);
    assert.equal(readLinkParam(new URL(two).hash, "pivot-ops"), "1.abc");
    // an anchor is replaced; null removes the entry
    assert.equal(withLinkParam("https://example.com/#top", "pivot", "1.x"), "https://example.com/#pivot=1.x");
    assert.equal(withLinkParam(two, "pivot", null), "https://example.com/report?x=1#pivot-ops=1.abc");
    assert.equal(withLinkParam("https://example.com/#pivot=1.x", "pivot", null), "https://example.com/");
    assert.equal(readLinkParam("", "pivot"), null);
    assert.equal(readLinkParam("#top", "pivot"), null);
    // the text survives the fragment unchanged
    assert.deepEqual(decodeViewLink(readLinkParam(new URL(url).hash, "pivot")).view, { rows: ["Region"] });
});

test("the link's address: the page's own for true, the host's base URL, none when off", () => {
    assert.equal(shareBase(true, "https://example.com/a#pivot=1.x"), "https://example.com/a#pivot=1.x");
    assert.equal(shareBase(" https://example.com/r ", "https://other"), "https://example.com/r");
    for (const off of [undefined, false, "", "  ", 1, {}]) {
        assert.equal(shareBase(off, "https://example.com"), null);
    }
});

test("the tab's view: stored per storageKey, quietly nothing when storage is blocked", () => {
    const map = new Map();
    const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
    writeStoredView("sales", storage, { rows: ["Region"] });
    assert.equal(readStoredView("sales", storage), JSON.stringify({ rows: ["Region"] }));
    assert.equal(readStoredView("ops", storage), null);
    assert.equal(viewStorageName(undefined), "pivotkit:view:");
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
    assert.equal(readStoredView("sales", blocked), null);
    assert.doesNotThrow(() => writeStoredView("sales", blocked, {}));
    assert.equal(readStoredView("sales", null), null);
});

test("a loaded view is normalized against the data; a template file gives its view", () => {
    const ok = viewFromText(JSON.stringify({ rows: ["region"], values: [{ field: "Units", agg: "sum" }] }), data);
    assert.deepEqual([ok.failed, ok.view.rows, ok.issues], [null, ["Region"], []]);
    const template = viewFromText(JSON.stringify({ name: "Mine", view: { cols: ["Product"] } }), data);
    assert.deepEqual(template.view.cols, ["Product"]);
    const partly = viewFromObject({ rows: ["Region", "Country"], cols: ["City"], chart: { legend: "left" } }, data);
    assert.deepEqual(partly.view.rows, ["Region"]);
    assert.deepEqual(issueLines(partly.issues, LABELS.en), ["fields this data does not have (“Country”, “City”)", "1 other setting"]);
    assert.match(issueLines(partly.issues, LABELS.de)[0], /^Felder, die diese Daten nicht haben/);
    assert.deepEqual(viewFromText("", data).failed, "empty");
    assert.deepEqual(viewFromText("not json", data).failed, "notJson");
    assert.deepEqual(viewFromText("[1]", data).failed, "notView");
    assert.deepEqual(viewFromText(JSON.stringify({ version: 99, rows: ["Region"] }), data).failed, "newer");
    assert.deepEqual(viewFromText("x".repeat(1_000_001), data).failed, "tooLarge");
    // unknown keys (a template's extra fields) are nothing to tell the user
    assert.deepEqual(issueLines([{ path: "name", message: "unknown key" }], LABELS.en), []);
});

test("a loaded view cannot pollute prototypes", () => {
    const loaded = viewFromText('{"rows":["Region"],"__proto__":{"polluted":true},"constructor":{"prototype":{"bad":1}}}', data);
    assert.deepEqual(loaded.view.rows, ["Region"]);
    assert.equal(/** @type {any} */ ({}).polluted, undefined);
    assert.equal(/** @type {any} */ ({}).bad, undefined);
});

test("chartOptions: plain JSON passes, functions and other values are left out and named", () => {
    const fine = { title: { textStyle: { fontSize: 20 } }, grid: { left: 40 }, series: { barMaxWidth: 24 }, color: ["#123456"], legend: { show: false, data: null } };
    assert.deepEqual(cleanChartOptions(fine), { options: fine, problems: [] });
    assert.deepEqual(cleanChartOptions(undefined), { options: null, problems: [] });
    assert.deepEqual(cleanChartOptions([1]).options, null);
    assert.deepEqual(cleanChartOptions(new Date(0)).options, null);
    const bad = cleanChartOptions({ tooltip: { formatter: () => "x" }, grid: { top: Infinity, left: 2 }, when: new Date(0), list: [1, () => 2], ["__proto__"]: { polluted: true }, s: Symbol("s") });
    assert.deepEqual(bad.options, { tooltip: {}, grid: { left: 2 }, list: [1, null] });
    assert.deepEqual(bad.problems.sort(), [
        "chartOptions.__proto__: not allowed",
        "chartOptions.grid.top: not a finite number",
        "chartOptions.list[1]: a function, not allowed",
        "chartOptions.s: a symbol, not allowed",
        "chartOptions.tooltip.formatter: a function, not allowed",
        "chartOptions.when: not plain JSON, not allowed"
    ]);
    assert.equal(/** @type {any} */ ({}).polluted, undefined);
    // JSON.parse keeps "__proto__" as an own key: it is dropped, not merged
    const parsed = cleanChartOptions(JSON.parse('{"__proto__":{"polluted":true},"grid":{"left":1}}'));
    assert.deepEqual([parsed.options, parsed.problems], [{ grid: { left: 1 } }, ["chartOptions.__proto__: not allowed"]]);
    let deep = {};
    const root = deep;
    for (let i = 0; i < CHART_OPTIONS_CAPS.depth + 2; i++) {
        deep.a = {};
        deep = deep.a;
    }
    assert.match(cleanChartOptions(root).problems[0], /nested deeper/);
    const wide = Object.fromEntries(Array.from({ length: CHART_OPTIONS_CAPS.entries + 5 }, (_, i) => [`k${i}`, i]));
    assert.equal(Object.keys(cleanChartOptions(wide).options).length, CHART_OPTIONS_CAPS.entries);
});

test("chartOptions merge: key by key, lists entry by entry, an object into every entry of a list", () => {
    const fmt = () => "";
    const base = { legend: { top: 0, textStyle: { color: "#111" } }, series: [{ type: "bar", data: [1] }, { type: "bar", data: [2] }], xAxis: { axisLabel: { formatter: fmt } } };
    const merged = mergeChartOptions(base, { legend: { textStyle: { fontSize: 16 } }, series: { barMaxWidth: 24 }, xAxis: { name: "Region" } });
    assert.deepEqual(merged.legend, { top: 0, textStyle: { color: "#111", fontSize: 16 } });
    assert.deepEqual(merged.series.map((s) => [s.type, s.data, s.barMaxWidth]), [["bar", [1], 24], ["bar", [2], 24]]);
    assert.equal(merged.xAxis.axisLabel.formatter, fmt, "the report's own formatters stay");
    assert.equal(merged.xAxis.name, "Region");
    const byIndex = mergeChartOptions(base, { series: [{ label: { show: true } }] });
    assert.deepEqual([byIndex.series[0].label, byIndex.series[1].label], [{ show: true }, undefined]);
    // the host wins over a view's setting: legend off from the host hides the legend a view placed
    assert.equal(mergeChartOptions({ legend: { bottom: 0 } }, { legend: { show: false } }).legend.show, false);
    // nothing is changed in place
    assert.equal(base.series[0].barMaxWidth, undefined);
    assert.deepEqual(mergeChartOptions(base, undefined), base);
});
