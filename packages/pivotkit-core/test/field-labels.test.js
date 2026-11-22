// A name of the report's own for a field in Rows, Columns or Filters (#158): `fieldLabels` in the view,
// shown in the grid's headers, the chart's series and the exports; a host's display names stay
// under it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize, renameFields, toGrid, toSeries, withFieldLabels } from "pivotkit-core";
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
    // a value of a renamed field is named by it: "Count of City"
    const series = toSeries(computePivot(data, { rows: ["cat"], values: [{ field: "cn", agg: "count" }], fieldLabels: { cn: "City", cat: "Category" } }), { labels: {} });
    assert.deepEqual(series.series.map((s) => s.name), ["Count of City"]);
});

test("withFieldLabels: the view's names win, whatever the case of the host's key", () => {
    const labels = withFieldLabels({ fields: { CN: "Host" } }, { cn: "City" });
    assert.equal(labels.fields.cn, "City");
    assert.equal(Object.hasOwn(labels.fields, "CN"), false);
    const same = { fields: { a: "b" } };
    assert.equal(withFieldLabels(same, undefined), same);
});

test("renameFields moves a field's own name along with the field", () => {
    const { view } = renameFields({ rows: ["cn"], fieldLabels: { cn: "City" } }, { cn: "town" });
    assert.deepEqual(view.rows, ["town"]);
    assert.deepEqual(view.fieldLabels, { town: "City" });
});

// #699: one field named twice in another case kept the last name without a word, and two fields of
// one name drew two headers that read alike
test("normalize warns when fieldLabels names a field twice, and when two fields get one name", () => {
    const twice = normalize({ rows: ["cn"], fieldLabels: { cn: "A", CN: "B" } }, data);
    assert.deepEqual(twice.view.fieldLabels, { cn: "B" }, "the last name is still used");
    assert.deepEqual(twice.issues.map((i) => [i.code, i.severity, i.path, i.params?.field]), [["labelTwice", "warning", "fieldLabels.CN", "cn"]]);
    // two own names alike, and an own name that is another field's name: each such name is named
    const alike = normalize({ rows: ["cn", "cat"], fieldLabels: { cn: "Place", cat: "Place" } }, data);
    assert.deepEqual(alike.view.fieldLabels, { cn: "Place", cat: "Place" }, "both names are still used");
    assert.deepEqual(alike.issues.map((i) => [i.code, i.severity, i.path, i.params?.value]), [["labelTaken", "warning", "fieldLabels.cn", "Place"], ["labelTaken", "warning", "fieldLabels.cat", "Place"]]);
    const taken = normalize({ rows: ["cn", "cat"], fieldLabels: { cn: "cat" } }, data);
    assert.deepEqual(taken.issues.map((i) => [i.code, i.path, i.params?.field, i.params?.value]), [["labelTaken", "fieldLabels.cn", "cn", "cat"]]);
    // alike in case and spacing; a derived field; a field not on the report is no clash
    assert.deepEqual(normalize({ rows: ["cn", "cat"], fieldLabels: { cn: " CAT " } }, data).issues.map((i) => i.code), ["labelTaken"]);
    const grouped = normalize({ derived: [{ name: "Bucket", field: "Revenue", by: "bin", size: 2 }], rows: ["Bucket", "cn"], fieldLabels: { Bucket: "cn" } }, data);
    assert.deepEqual(grouped.issues.map((i) => [i.code, i.params?.field]), [["labelTaken", "Bucket"]]);
    assert.deepEqual(normalize({ rows: ["cn"], fieldLabels: { cn: "cat" } }, data).issues, [], "cat is not on the report");
    // a field in Values or Filters counts: its name shows in a value's header and on its chip
    assert.deepEqual(normalize({ rows: ["cn"], values: [{ field: "Revenue", agg: "sum" }], fieldLabels: { Revenue: "CN" } }, data).issues.map((i) => i.path), ["fieldLabels.Revenue"]);
    assert.deepEqual(normalize({ rows: ["cn"], filters: [{ field: "cat", type: "in", items: ["A"], blanks: "exclude" }], fieldLabels: { cat: "cn" } }, data).issues.map((i) => i.path), ["fieldLabels.cat"]);
    // names that differ, or a field's own name for itself: no warning
    assert.deepEqual(normalize({ rows: ["cn"], fieldLabels: { cn: "City", cat: "Kind" } }, data).issues, []);
    assert.deepEqual(normalize({ rows: ["cn"], fieldLabels: { cn: "cn" } }, data).issues, []);
});
