// Sharing a view without a DOM: the link in the fragment, the tab's stored view, a view loaded from
// JSON (what was left out is unused.test.js), and the host's chartOptions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, linkParam, toViewFile, viewFileText } from "pivotkit-core";
import { decodeViewLink, encodeViewLink } from "pivotkit-core/link";
import { CHART_OPTIONS_CAPS, cleanChartOptions, mergeChartOptions } from "../src/chart-options.js";
import { LABELS } from "../src/labels.js";
import { loadCheck, readLinkParam, readStoredView, shareBase, viewFromObject, viewFromText, viewStorageName, withLinkParam, writeStoredView } from "../src/share.js";

const data = encode([
    { Region: "North", Product: "A", Units: 3 },
    { Region: "South", Product: "B", Units: 7 }
]);

test("the link's place in the fragment: pivot, or pivot-<storageKey>; other entries stay", () => {
    assert.equal(linkParam(undefined), "pivot");
    assert.equal(linkParam("sales"), "pivot-sales");
    const text = encodeViewLink({ rows: ["Region"] });
    const url = withLinkParam("https://example.com/report?x=1", undefined, text);
    assert.equal(url, `https://example.com/report?x=1#pivot=${text}`);
    const two = withLinkParam(url, "ops", "1.abc");
    assert.equal(readLinkParam(new URL(two).hash, undefined), text);
    assert.equal(readLinkParam(new URL(two).hash, "ops"), "1.abc");
    // the rest of the fragment stays byte for byte: an anchor, a hash route with its own query
    assert.equal(withLinkParam("https://example.com/#top", undefined, "1.x"), "https://example.com/#top&pivot=1.x");
    const routed = withLinkParam("https://h/app#/reports/a?tab=2", undefined, "1.abc");
    assert.equal(routed, "https://h/app#/reports/a?tab=2&pivot=1.abc");
    assert.equal(withLinkParam(routed, undefined, "1.def"), "https://h/app#/reports/a?tab=2&pivot=1.def");
    assert.equal(withLinkParam(routed, undefined, null), "https://h/app#/reports/a?tab=2");
    assert.equal(readLinkParam(new URL(routed).hash, undefined), "1.abc");
    assert.equal(withLinkParam("https://h/#x=%2F&pivot=1.a&y=a+b", undefined, "1.b"), "https://h/#x=%2F&y=a+b&pivot=1.b");
    // null removes the entry
    assert.equal(withLinkParam(two, undefined, null), "https://example.com/report?x=1#pivot-ops=1.abc");
    assert.equal(withLinkParam("https://example.com/#pivot=1.x", undefined, null), "https://example.com/");
    assert.equal(readLinkParam("", undefined), null);
    assert.equal(readLinkParam("#top", undefined), null);
    // the text survives the fragment unchanged
    assert.deepEqual(decodeViewLink(readLinkParam(new URL(url).hash, undefined)).view, { rows: ["Region"] });
});

test("the link's address: the page's own for true, the host's base URL, none when off", () => {
    assert.equal(shareBase(true, "https://example.com/a#pivot=1.x"), "https://example.com/a#pivot=1.x");
    // the page's query (tokens, ids) is not shared unless the host gives its URL
    assert.equal(shareBase(true, "https://example.com/a?token=secret#/r"), "https://example.com/a#/r");
    assert.equal(shareBase("https://example.com/a?data=x", "https://other"), "https://example.com/a?data=x");
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
    assert.deepEqual(partly.issues.map((i) => i.code), ["unknownField", "unknownField", "unknownSetting"]);
    // the view as given stays with it: the plain words of what was left out name its parts
    assert.deepEqual(partly.file?.view, { rows: ["Region", "Country"], cols: ["City"], chart: { legend: "left" } });
    // a compare value beyond what a Date holds loads with an issue, never a throw
    const dated = encode([{ When: new Date("2026-01-05T00:00:00Z") }]);
    const beyond = viewFromText(JSON.stringify({ filters: [{ field: "When", type: "compare", op: ">", value: 1e300 }] }), dated);
    assert.deepEqual([beyond.failed, beyond.view.filters, beyond.issues.map((i) => i.code)], [null, [], ["filterCompareValue"]]);
    assert.deepEqual(viewFromText("", data).failed, "empty");
    assert.deepEqual(viewFromText("not json", data).failed, "notJson");
    assert.deepEqual(viewFromText("[1]", data).failed, "notView");
    assert.deepEqual(viewFromText(JSON.stringify({ version: 99, rows: ["Region"] }), data).failed, "newer");
    assert.deepEqual(viewFromText("x".repeat(1_000_001), data).failed, "tooLarge");
});

test("a view file loads with its envelope; a newer format asks to update pivotkit", () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
    const text = viewFileText(toViewFile(view, { name: "Units", source: { id: "sales" }, data }));
    const loaded = viewFromText(text, data, { sourceId: "sales" });
    assert.equal(loaded.failed, null);
    assert.deepEqual(loaded.view?.rows, ["Region"]);
    assert.equal(loaded.file?.name, "Units");
    assert.equal(loaded.file?.compatible?.ok, true);
    const newer = viewFromText(JSON.stringify({ format: "pivotkit-view", formatVersion: 3, view }), data);
    assert.equal(newer.failed, "newer");
    assert.match(LABELS.en.viewFailed.newer, /Update pivotkit/);
    assert.match(LABELS.de.viewFailed.newer, /Zum Öffnen pivotkit aktualisieren/);
});

test("a view for other data asks first: its source, the fields this data does not have, another type", () => {
    const view = { rows: ["Region", "Country"], values: [{ field: "Units", agg: "sum" }] };
    const other = encode([{ Region: "North", Country: "DE", Units: 3 }]);
    const file = toViewFile(view, { name: "By country", source: { id: "weather", name: "Weather <b>" }, data: other });
    // the same data: nothing to ask
    assert.equal(loadCheck(viewFromObject(file, other, { sourceId: "weather" }), LABELS.en), null);
    // another source, a field missing; the host can switch to it
    const loaded = viewFromObject(file, data, { sourceId: "sales" });
    const check = loadCheck(loaded, LABELS.en, [{ id: "weather", name: "Weather" }]);
    assert.deepEqual(check?.lines, ["It was made for “Weather”.", "Fields this data does not have: “Country”."]);
    assert.deepEqual(check?.switchTo, { id: "weather", name: "Weather" });
    // no such source with the host: the file's name for it, as text, and no switch
    const unknown = loadCheck(loaded, LABELS.en, []);
    assert.equal(unknown?.lines[0], "It was made for “Weather <b>”.");
    assert.equal(unknown?.switchTo, null);
    // a field of another type
    const typed = encode([{ Region: "North", Country: "DE", Units: "many" }]);
    assert.deepEqual(loadCheck(viewFromObject(file, typed, { sourceId: "weather" }), LABELS.en)?.lines, ["Fields of another type here: “Units”."]);
    // in German
    assert.equal(loadCheck(loaded, LABELS.de, [])?.lines[0], "Sie wurde für „Weather <b>“ gemacht.");
    // the fields in the language's quotation marks
    assert.equal(loadCheck(loaded, LABELS.de, [])?.lines[1], "Felder, die diese Daten nicht haben: „Country“.");
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

test("chartOptions: markup, addresses and text templates are left out wherever they are", () => {
    const { options, problems } = cleanChartOptions({
        tooltip: { formatter: "<img src=x onerror=alert(1)>", extraCssText: "background:url(https://x)", className: "x", appendTo: "body", renderMode: "html", backgroundColor: "#fff" },
        title: { text: "Sales", link: "javascript:alert(1)", sublink: "https://x", target: "blank", subtarget: "self" },
        series: [{ label: { formatter: "{a|x}", rich: { a: { color: "#f00" } } }, symbol: "image://https://x/p.png", tooltip: { content: "<b>x</b>" } }],
        legend: { formatter: "{name}" },
        backgroundColor: { image: "https://x/p.png" },
        xAxis: { axisLabel: { formatter: 12 } }
    });
    assert.deepEqual(options, { tooltip: { backgroundColor: "#fff" }, title: { text: "Sales" }, series: [{ label: {}, tooltip: {} }], legend: {}, backgroundColor: {}, xAxis: { axisLabel: { formatter: 12 } } });
    assert.equal(problems.length, 15);
    assert.ok(problems.includes("chartOptions.tooltip.formatter: a text template (written as markup), not allowed"));
    assert.ok(problems.includes("chartOptions.series[0].symbol: an image address, not allowed"));
    assert.ok(problems.includes("chartOptions.title.link: markup, an address or the tooltip's element, not allowed"));
});

test("a view from outside (link, file, pasted JSON, the tab's) keeps at most 50 filters, or the host's lower limit", () => {
    const many = { filters: Array.from({ length: 60 }, () => ({ field: "Region", type: "include", items: ["North"] })) };
    const sales = encode([{ Region: "North" }]);
    const loaded = viewFromObject(many, sales);
    assert.equal(loaded.view?.filters.length, 50);
    assert.deepEqual(loaded.issues.map((i) => i.code), ["tooMany"]);
    assert.equal(viewFromObject(many, sales, { limits: { filters: 5 } }).view?.filters.length, 5);
    assert.equal(viewFromText(JSON.stringify(many), sales, { limits: { filters: 500 } }).view?.filters.length, 50);
});
