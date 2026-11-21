// A row field sorted by a value in one column (#70): the sort entry's `column` names the column by its
// items (the column fields' labels), and the rows follow that column's values; missing ones sort last.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize } from "pivotkit-core";

const rows = [
    { City: "Oslo", Month: "Jan", Year: 2025, Temp: -4 },
    { City: "Oslo", Month: "Jul", Year: 2025, Temp: 17 },
    { City: "Cairo", Month: "Jan", Year: 2025, Temp: 14 },
    { City: "Cairo", Month: "Jul", Year: 2025, Temp: 29 },
    { City: "Lima", Month: "Jan", Year: 2025, Temp: 23 },
    { City: "Lima", Month: "Jul", Year: 2025, Temp: 15 },
    { City: "Rome", Month: "Jan", Year: 2025, Temp: 8 }
];
const data = encode(rows);
const base = { rows: ["City"], cols: ["Month"], values: [{ field: "Temp", agg: "average" }] };
const order = (view) => computePivot(data, view).rowNodes.filter((n) => n.depth === 1).sort((a, b) => a.index - b.index).map((n) => n.key);
const temp = { field: "Temp", agg: "average" };

test("rows sorted by one column's values: Jul largest first; a row without Jul comes last", () => {
    assert.deepEqual(order({ ...base, sort: [{ field: "City", by: "value", order: "desc", value: temp, column: ["Jul"] }] }), ["Cairo", "Oslo", "Lima", "Rome"]);
    assert.deepEqual(order({ ...base, sort: [{ field: "City", by: "value", order: "asc", value: temp, column: ["Jul"] }] }), ["Lima", "Oslo", "Cairo", "Rome"]);
    // by Jan instead
    assert.deepEqual(order({ ...base, sort: [{ field: "City", by: "value", order: "desc", value: temp, column: ["Jan"] }] }), ["Lima", "Cairo", "Rome", "Oslo"]);
    // without a column: the whole row (Grand Total), as before
    assert.deepEqual(order({ ...base, sort: [{ field: "City", by: "value", order: "desc", value: temp }] }), ["Cairo", "Lima", "Rome", "Oslo"]);
});

test("the column path follows the column fields' types and depth; with a column the data lacks, every row ties and goes by label", () => {
    const two = { rows: ["City"], cols: ["Year", "Month"], values: [{ field: "Temp", agg: "average" }] };
    const { view } = normalize({ ...two, sort: [{ field: "City", by: "value", order: "desc", value: temp, column: ["2025", "Jul"] }] }, data);
    // the year as the data's number, the month as text
    assert.deepEqual(view.sort[0].column, [2025, "Jul"]);
    assert.deepEqual(order({ ...two, sort: [{ field: "City", by: "value", order: "desc", value: temp, column: [2025, "Jul"] }] }), ["Cairo", "Oslo", "Lima", "Rome"]);
    // an outer column alone: the year's subtotal
    assert.deepEqual(order({ ...two, sort: [{ field: "City", by: "value", order: "desc", value: temp, column: [2025] }] }), ["Cairo", "Lima", "Rome", "Oslo"]);
    // ties go by label in the sort's direction, as for any sort by a value
    assert.deepEqual(order({ ...base, sort: [{ field: "City", by: "value", order: "desc", value: temp, column: ["Dec"] }] }), ["Rome", "Oslo", "Lima", "Cairo"]);
});

test("normalize: a column path only for a row field sorted by a value; longer than the column fields or not a list is said and dropped", () => {
    const issues = (sort) => normalize({ ...base, sort: [sort] }, data);
    const ok = issues({ field: "City", by: "value", value: temp, column: ["Jul"] });
    assert.deepEqual(ok.issues, []);
    assert.deepEqual(ok.view.sort[0].column, ["Jul"]);
    const long = issues({ field: "City", by: "value", value: temp, column: ["Jul", "x"] });
    assert.equal(long.view.sort[0].column, undefined);
    assert.equal(long.issues[0].code, "sortColumn");
    assert.equal(long.issues[0].severity, "warning");
    const label = issues({ field: "City", by: "label", column: ["Jul"] });
    assert.equal(label.view.sort[0].column, undefined);
    assert.equal(label.issues[0].code, "sortColumn");
    const colField = issues({ field: "Month", by: "value", value: temp, column: ["Jul"] });
    assert.equal(colField.view.sort[0].column, undefined);
    assert.equal(colField.issues[0].code, "sortColumn");
    const notList = issues({ field: "City", by: "value", value: temp, column: "Jul" });
    assert.equal(notList.view.sort[0].column, undefined);
    assert.equal(notList.issues[0].code, "sortColumn");
    // no field on Columns: said as such, not as "one to 0 items"
    const noCols = normalize({ ...base, cols: [], sort: [{ field: "City", by: "value", value: temp, column: ["Jul"] }] }, data);
    assert.equal(noCols.view.sort[0].column, undefined);
    assert.match(noCols.issues[0].message, /only with a field on Columns/);
});
