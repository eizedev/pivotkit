import { test } from "node:test";
import assert from "node:assert/strict";
import { VIEW_VERSION, encode, migrate, normalize, validate } from "../src/index.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const filtersOf = (view) => migrate(view).view?.filters;

test("version 1 views migrate to version 2; a view without a version is read as version 1", () => {
    assert.equal(VIEW_VERSION, 2);
    assert.equal(migrate({ version: 1 }).view?.version, 2);
    assert.equal(migrate({}).view?.version, 2);
    assert.deepEqual(migrate({ version: 3 }).issues.map((i) => i.code), ["newerVersion"]);
});

test("include and exclude become in, the blank item becomes blanks", () => {
    assert.deepEqual(filtersOf({ version: 1, filters: [
        { field: "Region", type: "include", items: ["North"] },
        { field: "Region", type: "include", items: ["North", null] },
        { field: "Region", type: "exclude", items: ["North"] },
        { field: "Region", type: "exclude", items: [null, "North"] }
    ] }), [
        { field: "Region", type: "in", items: ["North"], blanks: "exclude" },
        { field: "Region", type: "in", items: ["North"], blanks: "include" },
        { field: "Region", type: "in", items: ["North"], not: true, blanks: "include" },
        { field: "Region", type: "in", items: ["North"], not: true, blanks: "exclude" }
    ]);
});

test("label becomes text on the label, case-insensitive with exact whitespace; negations become not; blanks as version 1 matched them", () => {
    assert.deepEqual(filtersOf({ version: 1, filters: [
        { field: "Rep", type: "label", op: "notContains", value: "zz" },
        { field: "Rep", type: "label", op: "notContains", value: "an" },
        { field: "Rep", type: "label", op: "contains", value: "BL" },
        { field: "Rep", type: "label", op: "equals", value: "x" }
    ] }), [
        // "(blank)" does not contain "zz": version 1 kept the blank; it contains "an": dropped
        { field: "Rep", type: "text", op: "contains", value: "zz", on: "label", match: { case: "insensitive", whitespace: "exact" }, not: true, blanks: "include" },
        { field: "Rep", type: "text", op: "contains", value: "an", on: "label", match: { case: "insensitive", whitespace: "exact" }, not: true, blanks: "exclude" },
        { field: "Rep", type: "text", op: "contains", value: "BL", on: "label", match: { case: "insensitive", whitespace: "exact" }, blanks: "include" },
        { field: "Rep", type: "text", op: "equals", value: "x", on: "label", match: { case: "insensitive", whitespace: "exact" }, blanks: "exclude" }
    ]);
});

test("compare, relative and value: negated operators become the positive one with not; item filters drop blanks", () => {
    assert.deepEqual(filtersOf({ version: 1, filters: [
        { field: "Price", type: "compare", op: "!=", value: 10 },
        { field: "Price", type: "compare", op: "notBetween", value: 1, value2: 2 },
        { field: "Date", type: "relative", unit: "year", count: 1 },
        { field: "Region", type: "value", op: "!=", value: 8 },
        { field: "Region", type: "top", count: 2 }
    ] }), [
        { field: "Price", type: "compare", op: "=", value: 10, not: true, blanks: "exclude" },
        { field: "Price", type: "compare", op: "between", value: 1, value2: 2, not: true, blanks: "exclude" },
        { field: "Date", type: "relative", unit: "year", count: 1, blanks: "exclude" },
        { field: "Region", type: "value", op: "=", value: 8, not: true },
        { field: "Region", type: "top", count: 2 }
    ]);
});

test("a version-2 view without a version passes the step unchanged, and so does what is no version-1 filter", () => {
    const v2 = [
        { field: "Region", type: "in", items: ["North"], not: true },
        { field: "Rep", type: "text", op: "beginsWith", value: "a" },
        { field: "Price", type: "compare", op: ">", value: 1, blanks: "include" },
        "not a filter",
        { field: "Region", type: "include" }
    ];
    assert.deepEqual(filtersOf({ filters: v2 }), [...v2.slice(0, 2), { ...v2[2] }, "not a filter", { field: "Region", type: "in" }]);
    // a v2 text filter without a version keeps version 2's defaults: case and whitespace do not matter
    assert.deepEqual(normalize({ filters: [v2[1]] }, data).view.filters[0].match, { case: "insensitive", whitespace: "collapse" });
    // and garbage stays garbage for normalize to report
    assert.deepEqual(normalize({ filters: v2.slice(3) }, data).issues.map((i) => i.code), ["unknownField", "filterNoItems"]);
});

test("a migrated version-1 view is valid without warnings", () => {
    const v1 = { version: 1, rows: ["Region"], values: [{ field: "Units", agg: "sum" }], filters: [
        { field: "Region", type: "exclude", items: [null] },
        { field: "Rep", type: "label", op: "notEquals", value: "Ann" },
        { field: "Date", type: "relative", unit: "month", count: 3, anchor: "latest" },
        { field: "Region", type: "value", op: "notBetween", value: 1, value2: 5 }
    ] };
    assert.deepEqual(validate(v1, data), { valid: true, errors: [], warnings: [] });
});
