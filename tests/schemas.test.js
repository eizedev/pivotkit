// pivotkit-core's generated JSON Schemas (scripts/schemas.js): the committed files are what the
// script builds from the engine's tables (run `node scripts/schemas.js` after changing one), the
// schema refuses every issue case that VIEW_ISSUES marks `schema`, and views pivotkit-core writes
// pass both the schema and validate().
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Validator } from "@cfworker/json-schema";
import { VIEW_ISSUES, VIEW_VERSION, emptyView, encode, normalize, validate } from "pivotkit-core";
import { buildSchemas, schemaText } from "../scripts/schemas.js";
import { ISSUE_CASES } from "../packages/pivotkit-core/test/issue-cases.js";
import { SALES } from "../packages/pivotkit-core/test/fixtures.js";

const built = buildSchemas();
const committed = (name) => readFileSync(new URL(`../packages/pivotkit-core/schema/${name}`, import.meta.url), "utf8");
const viewSchema = JSON.parse(committed(`view-${VIEW_VERSION}.json`));
const data = encode(SALES);

test("the committed schemas are what scripts/schemas.js builds", () => {
    for (const [name, schema] of Object.entries(built)) {
        assert.equal(committed(name), schemaText(schema), `${name} is stale: node scripts/schemas.js`);
    }
    const pkg = JSON.parse(readFileSync(new URL("../packages/pivotkit-core/package.json", import.meta.url), "utf8"));
    for (const name of Object.keys(built)) {
        assert.equal(pkg.exports[`./schema/${name}`], `./schema/${name}`, name);
    }
});

test("the view schema refuses every issue case that VIEW_ISSUES marks schema", () => {
    const validator = new Validator(viewSchema, "2020-12", false);
    const marked = Object.entries(VIEW_ISSUES).filter(([, i]) => i.schema).map(([code]) => code);
    assert.ok(marked.length > 30, "most codes are the schema's too");
    for (const code of marked) {
        const view = JSON.parse(JSON.stringify(ISSUE_CASES[code]));
        assert.equal(validator.validate(view).valid, false, `${code}: ${JSON.stringify(view).slice(0, 120)}`);
    }
});

test("views pivotkit-core writes pass the schema and validate()", () => {
    const validator = new Validator(viewSchema, "2020-12", false);
    const views = [
        emptyView(),
        normalize({}, data).view,
        normalize(
            {
                version: 2,
                rows: ["Region"],
                cols: ["Product"],
                values: [{ field: "Units", agg: "sum", showAs: "percentOfRowTotal", conditional: { type: "colorScale" } }, { agg: "count", label: "Rows", conditional: { type: "dataBar", color: "#336699" } }],
                filters: [
                    { field: "Region", type: "in", items: ["North"], not: true, blanks: "include" },
                    { field: "Region", type: "blank", not: true },
                    { field: "Rep", type: "text", op: "contains", value: "a", on: "value", match: { case: "sensitive", whitespace: "exact" }, blanks: "exclude" },
                    { field: "Price", type: "compare", op: "between", value: 1, value2: 30, not: true, blanks: "exclude" },
                    { field: "Date", type: "compare", op: ">=", value: "2026-02-01", precision: "month", blanks: "exclude" },
                    { field: "Date", type: "relative", direction: "this", unit: "week", blanks: "exclude" },
                    { field: "Date", type: "relative", direction: "before", unit: "day", count: 30, calendar: false, anchor: "2026-03-01", blanks: "include" },
                    { field: "Region", type: "top", count: 2, ties: "all", by: { field: "Price", agg: "max" } },
                    { field: "Region", type: "value", op: ">", value: 1, not: true }
                ],
                derived: [{ name: "Year", field: "Date", by: "year" }, { name: "Band", field: "Units", by: "bin", size: 5, origin: 1 }],
                sort: [{ field: "Region", by: "custom", items: ["North"] }, { field: "Product", by: "value", order: "desc" }],
                totals: { rowSubtotals: false },
                collapsed: { rows: [] },
                display: "chart",
                chart: { type: "bar", title: "Units", legend: "right" },
                formatting: { locale: "de-DE", timeZone: "UTC", weekStart: 7 }
            },
            data
        ).view
    ];
    for (const view of views) {
        assert.deepEqual(validate(view, data), { valid: true, errors: [], warnings: [] });
        const result = validator.validate(JSON.parse(JSON.stringify(view)));
        assert.equal(result.valid, true, JSON.stringify(result.errors.slice(0, 3)));
    }
    assert.equal(views[2].filters.length, 9);
});
