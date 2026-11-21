// A name of the report's own for a field in Rows, Columns or Filters (#158): `fieldLabels` in the view,
// shown in the grid's headers, the chart's series and the exports; a host's display names stay
// under it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize, toGrid, toSeries, withFieldLabels } from "pivotkit-core";
import { toCsv } from "pivotkit-core/export";

const data = encode([
    { cn: "Berlin", cat: "A", Revenue: 3 },
    { cn: "Rome", cat: "B", Revenue: 4 }
]);

test("normalize keeps a field's own name; a view without one has no fieldLabels", () => {
    const { view, issues } = normalize({ rows: ["cn"], values: [{ field: "Revenue", agg: "sum" }], fieldLabels: { CN: " City " } }, data);
    assert.deepEqual(issues, []);
    // the field's own spelling, the text trimmed
    assert.deepEqual(view.fieldLabels, { cn: "City" });
    assert.equal(Object.hasOwn(normalize({ rows: ["cn"] }, data).view, "fieldLabels"), false);
});

test("normalize: an unknown field, an empty or overlong name, or no object is said and left out", () => {
    const run = (fieldLabels) => normalize({ rows: ["cn"], fieldLabels }, data);
    const unknown = run({ nope: "X", cn: "City" });
    assert.deepEqual(unknown.view.fieldLabels, { cn: "City" });
    assert.equal(unknown.issues[0].code, "unknownField");
    assert.equal(unknown.issues[0].path, "fieldLabels.nope");
    const empty = run({ cn: "  " });
    assert.equal(Object.hasOwn(empty.view, "fieldLabels"), false);
    assert.equal(empty.issues[0].code, "badLabel");
    assert.equal(run({ cn: "x".repeat(300) }).issues[0].code, "badLabel");
    assert.equal(run(["cn"]).issues[0].code, "badLabel");
    // a grouping's name can have one too
    const grouped = normalize({ derived: [{ name: "Bucket", field: "Revenue", by: "bin", size: 2 }], rows: ["Bucket"], fieldLabels: { Bucket: "Size class" } }, data);
    assert.deepEqual(grouped.issues, []);
    assert.deepEqual(grouped.view.fieldLabels, { Bucket: "Size class" });
});

test("the grid's headers, the chart's names and the CSV use the view's names over a host's", () => {
    const view = { rows: ["cn"], cols: ["cat"], values: [{ field: "Revenue", agg: "sum" }], fieldLabels: { cn: "City", cat: "Category" } };
    const result = computePivot(data, view);
    const grid = toGrid(result, { labels: { fields: { cn: "Host city", Revenue: "Turnover" } } });
    const texts = grid.rows.slice(0, grid.headerRows).flat().filter(Boolean).map((c) => c.text);
    assert.ok(texts.includes("City"), texts.join("|"));
    assert.ok(texts.includes("Category"));
    assert.ok(!texts.includes("Host city"));
    // a field without its own name keeps the host's
    assert.ok(texts.includes("Sum of Turnover"));
    assert.match(toCsv(grid), /City/);
    const series = toSeries(computePivot(data, { ...view, cols: [] }), { labels: {} });
    assert.ok(JSON.stringify(series).includes("Sum of Revenue"));
});

test("withFieldLabels: the view's names win, whatever the case of the host's key", () => {
    const labels = withFieldLabels({ fields: { CN: "Host" } }, { cn: "City" });
    assert.equal(labels.fields.cn, "City");
    assert.equal(Object.hasOwn(labels.fields, "CN"), false);
    const same = { fields: { a: "b" } };
    assert.equal(withFieldLabels(same, undefined), same);
});
