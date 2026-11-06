import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, emptyView, encode, normalize, validate, VIEW_VERSION } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);

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
    const n = normalize(view, data);
    assert.deepEqual(n.rows, ["Region"]);
    assert.deepEqual(n.cols, ["Product"]);
    assert.deepEqual(n.values, [{ field: "Units", agg: "sum", format: "number:1", label: "Units", showAs: { type: "percentOfRowTotal", axis: "rows" }, conditional: { type: "dataBar", color: "#336699" } }]);
    assert.deepEqual(n.sort, [{ field: "Region", by: "value", order: "desc", value: { field: "Units", agg: "sum" } }]);
    assert.deepEqual(n.derived, [{ name: "Month", field: "Date", by: "yearMonth" }]);
    assert.equal(n.formatting.locale, "de-DE");
    assert.deepEqual(normalize(n, data), n);
    assert.deepEqual(validate(n, data), { valid: true, errors: [] });
});

test("the schema may be encoded data, { fields } or a field list", () => {
    const fields = [{ name: "Region", type: "string" }];
    assert.deepEqual(normalize({ rows: ["region"] }, { fields }).rows, ["Region"]);
    assert.deepEqual(normalize({ rows: ["region"] }, fields).rows, ["Region"]);
    assert.deepEqual(normalize({ rows: ["region"] }, data.schema).rows, ["Region"]);
});

test("anything that is not a view becomes the empty view", () => {
    for (const input of [null, undefined, 42, "x", "[1,2]", [], true, () => 1, Symbol("s")]) {
        assert.deepEqual(normalize(input, data), emptyView(), String(typeof input));
    }
    const cyclic = { rows: [] };
    cyclic.self = cyclic;
    assert.deepEqual(normalize(cyclic, data), emptyView());
    const throwing = { get rows() { throw new Error("boom"); } };
    assert.deepEqual(normalize(throwing, data), emptyView());
    assert.deepEqual(normalize("{\"rows\": [\"Region\"]}", data).rows, ["Region"]);
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
    const n = normalize(view, data);
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
    const n = normalize(json, data);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(n.totals.grandTotalRow, true);
    assert.equal(Object.getPrototypeOf(n), Object.prototype);
    assert.equal(n.values[0].format, null);
    assert.equal(Object.hasOwn(n, "__proto__"), false);
});

test("colours, locales and labels only pass in safe forms", () => {
    const n = normalize({
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
    const n = normalize({ filters: [{ field: "Region", type: "include", items: new Array(200_000).fill("North") }] }, data);
    assert.equal(n.filters[0].items.length, 100_000);
    assert.deepEqual(normalize({ rows: ["Region"], pad: "x".repeat(6_000_000) }, data), emptyView());
    const many = normalize({ values: new Array(1000).fill({ agg: "count" }) }, data);
    assert.equal(many.values.length, 64);
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
    const n = normalize({ filters: [{ field: "Units", type: "include", items: ["abc", 3, "4"] }] }, data);
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

test("an unknown version is read as the current one and reported", () => {
    assert.deepEqual(validate({ version: 99 }, data).errors.map((e) => e.path), ["version"]);
});
