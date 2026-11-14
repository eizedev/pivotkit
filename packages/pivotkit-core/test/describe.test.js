import { test } from "node:test";
import assert from "node:assert/strict";
import { DESCRIBE_LIMITS, PivotkitError, describeSource, describeView, encode } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);

test("describeSource: each field's type, items, blanks, range, and what works on it", () => {
    const d = describeSource(data);
    assert.equal(d.rows, 8);
    const region = d.fields.find((f) => f.name === "Region");
    assert.deepEqual(region, {
        name: "Region", type: "string", distinct: 3, blanks: 1, items: ["North", "South", "West"],
        aggregators: region?.aggregators, filters: ["in", "blank", "text", "top", "value"], text: "Region: string, 3 distinct, 1 blank"
    });
    assert.ok(region?.aggregators.includes("count") && !region.aggregators.includes("sum"));
    const date = d.fields.find((f) => f.name === "Date");
    assert.equal(date?.min, "2025-12-31");
    assert.equal(date?.max, "2026-04-30");
    assert.deepEqual(date?.filters, ["in", "blank", "text", "compare", "relative", "top", "value"]);
    assert.equal(d.fields.find((f) => f.name === "Units")?.text, "Units: number, 7 distinct, 1 blank, from 1 to 7");
    assert.match(d.text, /^8 rows, 6 fields: Region \(string\), Product \(string\)/);
    // capped items; a schema without data: types only
    assert.equal(describeSource(data, { items: 2 }).fields[0].items?.length, 2);
    const typesOnly = describeSource(data.schema).fields[0];
    assert.equal(typesOnly.items, undefined);
    assert.equal(describeSource([{ name: "A", type: "number" }]).rows, null);
    assert.equal(DESCRIBE_LIMITS.items, 20);
    // rows that are not encoded are no fields: an error that says so, not "0 fields"
    assert.throws(() => describeSource([{ Region: "North" }]), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT" && /encode\(\)/.test(e.message));
    assert.equal(describeSource([]).fields.length, 0);
    // a field name from the data is capped in the words, as its items are
    const long = describeSource(encode([{ ["N".repeat(500)]: 1 }]));
    assert.equal(long.fields[0].name.length, 500);
    assert.ok(long.text.length < 200 && long.fields[0].text.length < 200, long.text);
});

test("describeView: an invalid view says so in its words, and an empty list of items is named", () => {
    const d = describeView({ version: 2, rows: ["Nope"], filters: [{ field: "Region", type: "compare", op: "!=", value: 3, blanks: "exclude" }] }, data);
    assert.equal(d.valid, false);
    assert.equal(d.text, "(invalid: 2 errors, the parts they name are left out) count of rows");
    assert.equal(describeView({ version: 2, filters: [{ field: "Region", type: "in", items: [], blanks: "include" }] }, data).filters[0].text, "Region is one of (no items) (blanks kept)");
});

test("describeView: the view in parts, each with its words, and what is wrong with it", () => {
    const d = describeView(
        {
            version: 2,
            rows: ["Region"],
            cols: ["Product"],
            values: [{ field: "Units", agg: "sum" }],
            filters: [
                { field: "Region", type: "in", items: ["North", "South"], blanks: "exclude" },
                { field: "Rep", type: "text", op: "contains", value: "an", not: true, blanks: "include" },
                { field: "Date", type: "relative", unit: "month", count: 3, calendar: false, blanks: "exclude" },
                { field: "Region", type: "top", count: 1, ties: "all" },
                { field: "Product", type: "value", op: "between", value: 1, value2: 9, by: { field: "Units", agg: "sum" } }
            ],
            display: "chart",
            chart: { type: "bar" }
        },
        data
    );
    assert.equal(d.valid, true);
    assert.deepEqual(d.filters.map((f) => f.text), [
        'Region is one of "North", "South" (blanks dropped)',
        'Rep does not contain "an", case insensitive, whitespace collapse (blanks kept)',
        "Date is in the last 3 months (rolling) (blanks dropped)",
        "top 1 Region by sum of Units, ties kept",
        "Product where sum of Units is between 1 and 9"
    ]);
    assert.equal(d.text, 'sum of Units by Region across Product where Region is one of "North", "South" (blanks dropped); and Rep does not contain "an", case insensitive, whitespace collapse (blanks kept); and Date is in the last 3 months (rolling) (blanks dropped); and top 1 Region by sum of Units, ties kept; and Product where sum of Units is between 1 and 9 as a bar chart');
    assert.deepEqual(d.display, { mode: "chart", chart: "bar" });
    // what is wrong: errors and warnings with their hints
    const bad = describeView({ rows: ["Regoin"], filters: [{ field: "Region", type: "in", items: ["north"] }] }, data);
    assert.equal(bad.valid, false);
    assert.deepEqual(bad.errors.map((e) => [e.code, e.params?.suggestion]), [["unknownField", "Region"]]);
    assert.deepEqual(bad.warnings.map((w) => [w.code, w.params?.suggestion]), [["itemCase", "North"], ["blanksUnspecified", undefined]]);
    assert.equal(bad.text, '(invalid: 1 error, the parts they name are left out) count of rows where Region is one of "north" (blanks dropped)');
});

test("describeSource counts in the singular for one row and one field", () => {
    assert.equal(describeSource(encode([{ A: 1 }])).text, "1 row, 1 field: A (number)");
});
