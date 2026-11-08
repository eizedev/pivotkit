import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, emptyView, encode, migrate, normalize, toGrid, validate, VIEW_VERSION } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
/** The normalized view alone; the issues are checked through validate(). */
const norm = (input, schema = data) => normalize(input, schema).view;

test("a full view normalizes to itself, with names in the data's spelling", () => {
    const view = {
        version: VIEW_VERSION,
        rows: ["region"],
        cols: ["PRODUCT"],
        values: [{ field: "units", agg: "sum", format: "number:1", label: "Units", showAs: { type: "percentOfRowTotal" }, conditional: { type: "dataBar", color: "#336699" } }],
        filters: [{ field: "rep", type: "exclude", items: ["Dee"] }],
        derived: [{ name: "Month", field: "date", by: "yearMonth" }],
        sort: [{ field: "region", by: "value", order: "desc" }],
        totals: { grandTotalRow: false, grandTotalColumn: true, rowSubtotals: true, colSubtotals: false },
        collapsed: { rows: [], cols: [] },
        display: "chart",
        chart: { type: "line", stacked: true, horizontal: false },
        formatting: { locale: "de-de" }
    };
    const n = norm(view, data);
    assert.deepEqual(n.rows, ["Region"]);
    assert.deepEqual(n.cols, ["Product"]);
    assert.deepEqual(n.values, [{ field: "Units", agg: "sum", format: "number:1", label: "Units", showAs: { type: "percentOfRowTotal", axis: "rows" }, conditional: { type: "dataBar", color: "#336699" } }]);
    assert.deepEqual(n.sort, [{ field: "Region", by: "value", order: "desc", value: { field: "Units", agg: "sum" } }]);
    assert.deepEqual(n.derived, [{ name: "Month", field: "Date", by: "yearMonth" }]);
    assert.equal(n.formatting.locale, "de-DE");
    assert.deepEqual(norm(n, data), n);
    assert.deepEqual(validate(n, data), { valid: true, errors: [] });
});

test("the schema may be encoded data, { fields } or a field list", () => {
    const fields = [{ name: "Region", type: "string" }];
    assert.deepEqual(norm({ rows: ["region"] }, { fields }).rows, ["Region"]);
    assert.deepEqual(norm({ rows: ["region"] }, fields).rows, ["Region"]);
    assert.deepEqual(norm({ rows: ["region"] }, data.schema).rows, ["Region"]);
});

test("anything that is not a view becomes the empty view", () => {
    for (const input of [null, undefined, 42, "x", "[1,2]", [], true, () => 1, Symbol("s")]) {
        assert.deepEqual(norm(input, data), emptyView(), String(typeof input));
    }
    const cyclic = { rows: [] };
    cyclic.self = cyclic;
    assert.deepEqual(norm(cyclic, data), emptyView());
    const throwing = { get rows() { throw new Error("boom"); } };
    assert.deepEqual(norm(throwing, data), emptyView());
    assert.deepEqual(norm("{\"rows\": [\"Region\"]}", data).rows, ["Region"]);
});

test("unknown names, aggregators, formats and keys are dropped and reported", () => {
    const view = {
        rows: ["Region", "Nope", "Region", { toString: () => "Region" }],
        values: [
            { field: "Units", agg: "constructor" },
            { field: "Units", agg: "sum", format: "number:2;[Red]" },
            { field: "Region", agg: "sum" },
            { field: null, agg: "median" },
            { field: "__proto__", agg: "count" }
        ],
        hack: true
    };
    const n = norm(view, data);
    assert.deepEqual(n.rows, ["Region"]);
    assert.deepEqual(n.values, [{ field: "Units", agg: "sum", format: null, label: null, showAs: null, conditional: null }]);
    const { valid, errors } = validate(view, data);
    assert.equal(valid, false);
    const paths = errors.map((e) => e.path);
    for (const p of ["hack", "rows[1]", "rows[2]", "rows[3]", "values[0]", "values[1].format", "values[2]", "values[3]", "values[4]"]) {
        assert.ok(paths.includes(p), `missing error for ${p}: ${JSON.stringify(errors)}`);
    }
});

test("prototype keys do nothing and pollute nothing", () => {
    const json = '{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"polluted": 1}}, "rows": ["Region"], "totals": {"__proto__": {"grandTotalRow": false}}, "values": [{"field": "Units", "agg": "sum", "__proto__": {"format": "x"}}]}';
    const n = norm(json, data);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(n.totals.grandTotalRow, true);
    assert.equal(Object.getPrototypeOf(n), Object.prototype);
    assert.equal(n.values[0].format, null);
    assert.equal(Object.hasOwn(n, "__proto__"), false);
});

test("colours, locales and labels only pass in safe forms", () => {
    const n = norm({
        values: [
            { field: "Units", agg: "sum", conditional: { type: "colorScale", colors: ["red;background:url(x)", "#00ff00", "#0000ff"] } },
            { field: "Units", agg: "sum", conditional: { type: "dataBar", color: "expression(alert(1))" } },
            { field: "Units", agg: "sum", label: "x".repeat(10_000) }
        ],
        formatting: { locale: "<script>" }
    }, data);
    assert.deepEqual(n.values[0].conditional, { type: "colorScale", colors: ["#00ff00", "#0000ff"] });
    assert.deepEqual(n.values[1].conditional, { type: "dataBar", color: null });
    assert.equal(n.values[2].label, null);
    assert.equal(n.formatting.locale, null);
});

test("limits: huge lists are cut, huge views refused", () => {
    const n = norm({ filters: [{ field: "Region", type: "include", items: new Array(200_000).fill("North") }] }, data);
    assert.equal(n.filters[0].items.length, 100_000);
    assert.deepEqual(norm({ rows: ["Region"], pad: "x".repeat(6_000_000) }, data), emptyView());
    const many = norm({ values: new Array(1000).fill({ agg: "count" }) }, data);
    assert.equal(many.values.length, 16);
});

test("filter, sort and collapsed entries are checked against the field types", () => {
    const { errors } = validate({
        rows: ["Region", "Product"],
        filters: [
            { field: "Units", type: "include", items: ["abc", 3] },
            { field: "Region", type: "top", count: -1 },
            { field: "Region", type: "value", op: "eval", value: 1 },
            { field: "Region", type: "label", op: "contains", value: 5 },
            { field: "Region", type: "regex", value: ".*" }
        ],
        sort: [{ field: "Region", by: "value", value: { field: "Region", agg: "sum" } }],
        collapsed: { rows: [["North"], ["North", "A"], "North"] }
    }, data);
    const messages = errors.map((e) => `${e.path}: ${e.message}`);
    assert.equal(messages.length, 8, messages.join("\n"));
    const n = norm({ filters: [{ field: "Units", type: "include", items: ["abc", 3, "4"] }] }, data);
    assert.deepEqual(n.filters[0].items, [3, 4]);
});

test("derived fields cannot shadow columns or chain", () => {
    const { errors } = validate({
        derived: [
            { name: "Region", field: "Date", by: "year" },
            { name: "Y", field: "Date", by: "year" },
            { name: "Z", field: "Y", by: "year" },
            { name: "B", field: "Units", by: "bin", size: 0 }
        ]
    }, data);
    assert.equal(errors.length, 3);
});

test("computePivot normalizes what it gets, so a hostile view cannot break it", () => {
    const r = computePivot(data, { rows: ["__proto__"], values: [{ field: "constructor", agg: "toString" }], filters: "x", sort: { a: 1 } });
    assert.deepEqual(r.view.rows, []);
    assert.equal(r.values.length, 0);
});

test("a newer version is refused, never read as an older one", () => {
    const { view, issues } = normalize({ version: VIEW_VERSION + 1, rows: ["Region"] }, data);
    assert.deepEqual(view, emptyView());
    assert.deepEqual(issues.map((e) => e.path), ["version"]);
    assert.match(issues[0].message, /newer/);
    for (const bad of [0, -1, 1.5, "1"]) {
        assert.deepEqual(validate({ version: bad }, data).errors.map((e) => e.path), ["version"], String(bad));
    }
    // no version: taken as the current one
    assert.deepEqual(norm({ rows: ["Region"] }).rows, ["Region"]);
});

test("migrate runs one step per version up to the current one", async () => {
    const { runMigrations } = await import("../src/view.js");
    // a made-up history: version 1 named the rows "rowFields", version 2 the columns "colFields"
    const steps = {
        1: ({ rowFields, ...v }) => ({ ...v, rows: rowFields }),
        2: ({ colFields, ...v }) => ({ ...v, cols: colFields })
    };
    assert.deepEqual(runMigrations({ version: 1, rowFields: ["a"], colFields: ["b"] }, steps, 3).view, { version: 3, rows: ["a"], cols: ["b"] });
    assert.deepEqual(runMigrations({ version: 2, rows: ["a"], colFields: ["b"] }, steps, 3).view, { version: 3, rows: ["a"], cols: ["b"] });
    assert.equal(runMigrations({ version: 1 }, { 2: steps[2] }, 3).view, null);
    assert.deepEqual(migrate({ version: VIEW_VERSION, rows: [] }), { view: { version: VIEW_VERSION, rows: [] }, issues: [] });
    assert.equal(migrate([1, 2]).view, null);
    assert.equal(migrate({ version: VIEW_VERSION + 1 }).view, null);
});

test("normalize returns the issues it found next to the view", () => {
    const { view, issues } = normalize({ rows: ["Region", "Nope"], extra: 1 }, data);
    assert.deepEqual(view.rows, ["Region"]);
    assert.deepEqual(issues.map((i) => i.path), ["extra", "rows[1]"]);
    assert.deepEqual(computePivot(data, { rows: ["Nope"] }).issues.map((i) => i.path), ["rows[0]"]);
});

test("formats: decimals up to 20, currencies from ISO 4217 only", () => {
    const { errors } = validate({ values: [
        { field: "Units", agg: "sum", format: "number:21" },
        { field: "Units", agg: "sum", format: "number:99" },
        { field: "Units", agg: "sum", format: "currency:xyz" },
        { field: "Units", agg: "sum", format: "percent:20" },
        { field: "Units", agg: "sum", format: "currency:chf" }
    ] }, data);
    assert.deepEqual(errors.map((e) => e.path), ["values[0].format", "values[1].format", "values[2].format"]);
});

test("one locale precedence: the view, then the options, then en-US", () => {
    const view = { values: [{ field: "Price", agg: "sum" }] };
    const text = (v, pivotOptions, gridOptions) => {
        const g = toGrid(computePivot(data, v, pivotOptions), gridOptions);
        return g.rows[1][1].text;
    };
    assert.equal(text(view), "127");
    const decimal = { values: [{ field: "Price", agg: "average" }] };
    assert.equal(text(decimal), "15.88");
    assert.equal(text(decimal, { locale: "de-DE" }), "15,88");
    assert.equal(text(decimal, {}, { locale: "de-DE" }), "15,88");
    assert.equal(text({ ...decimal, formatting: { locale: "fr-CH" } }, { locale: "de-DE" }, { locale: "de-DE" }), "15,88");
    assert.equal(toGrid(computePivot(data, { ...decimal, formatting: { locale: "en-GB" } }), { locale: "de-DE" }).locale, "en-GB");
    assert.equal(toGrid(computePivot(data, decimal)).locale, "en-US");
});

/** A deterministic random generator (mulberry32). */
function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

test("fuzz: normalize never throws, its output is valid and normalizes to itself", () => {
    const rnd = random(7);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const atoms = [null, true, false, 0, -1, 1.5, 1e308, "", "auto", "both", "right", "Region", "units", "Date", "sum", "count", "bin", "year", "include", "top", "value", "label", "rows", "cols", "#fff", "percentOfRowTotal", "runningTotal", "__proto__", "constructor", "de-DE", "UTC", "x".repeat(300)];
    const keys = ["version", "rows", "cols", "values", "filters", "derived", "sort", "totals", "collapsed", "display", "chart", "formatting", "field", "agg", "type", "items", "op", "value", "value2", "count", "by", "name", "size", "origin", "order", "showAs", "conditional", "colors", "color", "locale", "timeZone", "axis", "format", "label", "valueLabels", "legend", "title", "smooth", "__proto__"];
    const make = (depth) => {
        const r = rnd();
        if (depth > 3 || r < 0.35) {
            return pick(atoms);
        }
        if (r < 0.6) {
            return Array.from({ length: Math.floor(rnd() * 4) }, () => make(depth + 1));
        }
        const obj = {};
        for (let i = Math.floor(rnd() * 5); i > 0; i--) {
            obj[pick(keys)] = make(depth + 1);
        }
        return obj;
    };
    for (let i = 0; i < 2000; i++) {
        const input = rnd() < 0.5 ? make(0) : { ...make(1), rows: [pick(["Region", "Product", "Rep"])], values: [{ field: pick(["Units", "Price", null]), agg: pick(["sum", "count", "average"]) }] };
        const { view } = normalize(input, data);
        assert.deepEqual(validate(view, data), { valid: true, errors: [] }, JSON.stringify(input));
        assert.deepEqual(normalize(view, data).view, view);
        assert.doesNotThrow(() => toGrid(computePivot(data, input)));
    }
});

test("a custom sort order: listed items first in their order, the rest by label, blank last", () => {
    const sorted = (sort) => {
        const r = computePivot(data, { rows: ["Region"], values: [{ agg: "count" }], sort: [{ field: "Region", ...sort }] });
        return r.rowRoot.children.map((n) => n.key);
    };
    assert.deepEqual(sorted({ by: "custom", items: ["West", "North"] }), ["West", "North", "South", null]);
    assert.deepEqual(sorted({ by: "custom", order: "desc", items: ["West", "North"] }), ["North", "West", "South", null]);
    // an item the data does not have is kept in the view and changes nothing
    assert.deepEqual(sorted({ by: "custom", items: ["Nowhere", "South"] }), ["South", "North", "West", null]);
    const n = normalize({ rows: ["Units"], sort: [{ field: "Units", by: "custom", items: [5, "3", "x", 5] }] }, data);
    assert.deepEqual(n.view.sort, [{ field: "Units", by: "custom", order: "asc", items: [5, 3] }]);
    assert.deepEqual(n.issues.map((i) => i.path), ["sort[0].items"]);
    assert.deepEqual(validate({ rows: ["Region"], sort: [{ field: "Region", by: "custom" }] }, data).errors.map((e) => e.path), ["sort[0].items"]);
});

test("chart display settings: value labels, legend, title and smooth lines, checked against fixed lists", () => {
    assert.deepEqual(emptyView().chart, { type: "auto", stacked: false, horizontal: false, valueLabels: "auto", legend: "auto", title: null, smooth: false, axisLabels: "auto", groupLabels: "auto", labelPosition: "outside" });
    const chart = { type: "pie", valueLabels: "both", legend: "right", title: "  Units by region ", smooth: true, labelPosition: "inside" };
    assert.deepEqual(norm({ chart }).chart, { type: "pie", stacked: false, horizontal: false, valueLabels: "both", legend: "right", title: "Units by region", smooth: true, axisLabels: "auto", groupLabels: "auto", labelPosition: "inside" });
    assert.equal(norm({ chart: { type: "donut" } }).chart.type, "donut");
    assert.deepEqual(validate({ chart }, data), { valid: true, errors: [] });
    // unknown settings fall back to their defaults and are reported
    const bad = normalize({ chart: { valueLabels: "everything", legend: "left", title: 42, smooth: "yes", labelPosition: "above" } }, data);
    assert.deepEqual(bad.view.chart, emptyView().chart);
    assert.deepEqual(bad.issues.map((i) => i.path), ["chart.valueLabels", "chart.legend", "chart.labelPosition", "chart.title"]);
    assert.equal(norm({ chart: { title: "x".repeat(300) } }).chart.title, null);
    assert.equal(norm({ chart: { title: "   " } }).chart.title, null);
    // a view of before these settings reads with their defaults
    assert.deepEqual(norm({ chart: { type: "line" } }).chart, { ...emptyView().chart, type: "line" });
});

test("a colour scale in the theme's colours normalizes to itself without an issue", () => {
    // normalize writes the theme's scale as colors: []; a view kept or shared after it (the UI, a link,
    // a view file) passes normalize again and must not report the list as a dropped part
    for (const conditional of [{ type: "colorScale" }, { type: "colorScale", colors: [] }, { type: "colorScale", colors: null }]) {
        const first = normalize({ rows: ["Region"], values: [{ field: "Units", agg: "sum", conditional }] }, data);
        assert.deepEqual(first.issues, []);
        assert.deepEqual(first.view.values[0].conditional, { type: "colorScale", colors: [] });
        const again = normalize(first.view, data);
        assert.deepEqual(again.issues, []);
        assert.deepEqual(again.view, first.view);
    }
    // one colour, or one that is no colour, is still reported
    assert.equal(normalize({ values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale", colors: ["#ff0000"] } }] }, data).issues[0].path, "values[0].conditional.colors");
});

test("an inner row field sorts by a value within each group, also when two values share field and aggregator", () => {
    const view = {
        rows: ["Units (by 5)", "Region"],
        derived: [{ name: "Units (by 5)", field: "Units", by: "bin", size: 5, origin: 0 }],
        values: [
            { field: "Units", agg: "count", label: "Rows", conditional: { type: "colorScale" } },
            { field: "Units", agg: "count", label: "Share", showAs: { type: "percentOfGrandTotal", axis: "rows" } }
        ],
        sort: [
            { field: "Units (by 5)", by: "value", order: "desc", value: { field: "Units", agg: "count" } },
            { field: "Region", by: "value", order: "desc", value: { field: "Units", agg: "count" } }
        ]
    };
    const { view: n, issues } = normalize(view, data);
    assert.deepEqual(issues, []);
    assert.deepEqual(normalize(n, data), { view: n, issues: [] });
    const r = computePivot(data, n);
    // bins by count, largest first: 0 - 5 (Units 3, 2, 1, 4) before 5 - 10 (5, 7, 6)
    assert.deepEqual(r.rowRoot.children.map((c) => c.key), [0, 5, null]);
    // within each bin the regions by count, largest first; ties by label in the same direction, blank last
    assert.deepEqual(r.rowRoot.children[0].children.map((c) => c.key), ["North", "West", "South"]);
    assert.deepEqual(r.rowRoot.children[1].children.map((c) => c.key), ["South", "North", null]);
});
