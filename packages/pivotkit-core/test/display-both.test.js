// A view shown as the table and the chart side by side (#51): display "both".
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, describeView, encode, normalize } from "pivotkit-core";

const data = encode([{ Region: "East", Revenue: 3 }]);

test("normalize keeps display both; the catalog lists it", () => {
    const { view, issues } = normalize({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "both" }, data);
    assert.deepEqual(issues, []);
    assert.equal(view.display, "both");
    assert.deepEqual(CATALOG.displayModes, ["table", "chart", "both"]);
});

test("describeView says table and chart, with the chart's type", () => {
    const d = describeView({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "both", chart: { type: "bar" } }, data);
    assert.deepEqual(d.display, { mode: "both", chart: "bar" });
    assert.match(d.text, /as a table and a bar chart/);
});
