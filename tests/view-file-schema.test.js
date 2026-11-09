// The JSON Schema of the view file (pivotkit-core/schema/view-file-1.json, published at VIEW_FILE_SCHEMA
// as the copy scripts/docs-demo.js makes) and pivotkit-core's writer agree: the address, the format and
// its version, the limits, and every key a written file has is described there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { Validator } from "@cfworker/json-schema";
import { CATALOG, LIMITS, VIEW_FILE_FORMAT, VIEW_FILE_LIMITS, VIEW_FILE_SCHEMA, VIEW_FILE_VERSION, encode, normalize, toViewFile } from "pivotkit-core";

const file = new URL("../packages/pivotkit-core/schema/view-file-1.json", import.meta.url);
const schema = JSON.parse(readFileSync(file, "utf8"));

test("one schema: the package ships it, the site's copy (scripts/docs-demo.js) is the same bytes", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../packages/pivotkit-core/package.json", import.meta.url), "utf8"));
    assert.equal(pkg.exports["./schema/view-file-1.json"], "./schema/view-file-1.json");
    assert.ok(pkg.files.includes("schema"));
    const demo = readFileSync(new URL("../scripts/docs-demo.js", import.meta.url), "utf8");
    assert.match(demo, /packages\/pivotkit-core\/schema\//);
    const copy = new URL("../docs/schema/view-file-1.json", import.meta.url);
    if (existsSync(copy)) {
        assert.deepEqual(readFileSync(copy), readFileSync(file), "docs/schema/ is a stale copy: npm run docs:demo");
    }
});

test("the schema file is the one the files name, for the format and version the core writes", () => {
    assert.equal(schema.$id, VIEW_FILE_SCHEMA);
    assert.equal(schema.properties.format.const, VIEW_FILE_FORMAT);
    assert.equal(schema.properties.formatVersion.const, VIEW_FILE_VERSION);
    assert.equal(schema.properties.name.maxLength, VIEW_FILE_LIMITS.name);
    assert.equal(schema.properties.description.maxLength, VIEW_FILE_LIMITS.description);
    assert.equal(schema.properties.source.properties.fields.maxItems, VIEW_FILE_LIMITS.fields);
    // readers ignore unknown keys: the envelope is open
    assert.equal(schema.additionalProperties, undefined);
});

test("every key of a written view file is described by the schema, the required ones are there", () => {
    const data = encode([{ Region: "North", Units: 3, Date: "2026-01-01" }]);
    const view = normalize({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }, data).view;
    const file = toViewFile(view, { name: "Units", description: "d", createdAt: new Date(), generator: { name: "pivotkit-react", version: "0.1.0" }, source: { id: "s", name: "S" }, data });
    for (const key of Object.keys(file)) {
        assert.ok(Object.hasOwn(schema.properties, key), key);
    }
    for (const key of schema.required) {
        assert.ok(Object.hasOwn(file, key), key);
    }
    for (const key of Object.keys(file.source)) {
        assert.ok(Object.hasOwn(schema.properties.source.properties, key), `source.${key}`);
    }
    for (const f of file.source.fields) {
        assert.ok(schema.properties.source.properties.fields.items.properties.type.enum.includes(f.type), f.type);
    }
});

// the schema checks the envelope (the view inside it is normalize()'s, which says what it drops):
// real exports pass a JSON Schema 2020-12 validator, broken envelopes do not
test("real exports validate against the schema (JSON Schema 2020-12), broken envelopes do not", () => {
    const validator = new Validator(schema, "2020-12", false);
    const data = encode([{ Region: "North", Units: 3, Date: "2026-01-01", Ok: true }]);
    const view = normalize({ rows: ["Region", "Ok"], cols: ["Date"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Region", type: "exclude", items: ["South"] }] }, data).view;
    const files = [
        toViewFile(view, { name: "Units", description: "d", createdAt: new Date(Date.UTC(2026, 10, 7)), generator: { name: "pivotkit-react", version: "0.1.0" }, source: { id: "s", name: "S" }, data }),
        toViewFile(view),
        toViewFile(view, { schemaUrl: null }),
        toViewFile(view, { source: { id: "s" } }, { link: true })
    ];
    for (const file of files) {
        const result = validator.validate(JSON.parse(JSON.stringify(file)));
        assert.equal(result.valid, true, JSON.stringify(result.errors.slice(0, 3)));
    }
    const good = JSON.parse(JSON.stringify(files[0]));
    for (const broken of [
        { ...good, format: "other" },
        { ...good, formatVersion: 2 },
        { ...good, name: "x".repeat(VIEW_FILE_LIMITS.name + 1) },
        { ...good, createdAt: "yesterday" },
        { ...good, source: { fields: [{ name: "A", type: "money" }] } },
        { ...good, view: [] },
        (({ view: _view, ...rest }) => rest)(good)
    ]) {
        assert.equal(validator.validate(broken).valid, false, JSON.stringify(broken).slice(0, 120));
    }
    // an unknown key is fine: the envelope is open
    assert.equal(validator.validate({ ...good, later: 1 }).valid, true);
});

// the view's filters: their types and the parts of the comparisons and relative ranges, from the
// same tables normalize() reads; a view of 0.2.0's filter types stays valid (formatVersion 1)
test("the schema's filters match the core's: types, operators, units, the count's range", () => {
    const filters = schema.properties.view.properties.filters;
    assert.equal(filters.maxItems, LIMITS.filters);
    // the known types are listed; any other text is valid too (a newer pivotkit's, reported as unused)
    assert.deepEqual([...filters.items.properties.type.anyOf[0].enum].sort(), [...CATALOG.filterTypes].sort());
    const [compare, relative] = filters.items.allOf.map((a) => a.then.properties);
    assert.deepEqual(compare.op.enum, [...CATALOG.valueOps]);
    assert.deepEqual(relative.unit.enum, [...CATALOG.relativeUnits]);
    assert.equal(relative.count.maximum, CATALOG.relativeMaxCount);
    const validator = new Validator(schema, "2020-12", false);
    const data = encode([{ Region: "North", Units: 3, Date: "2026-01-01" }]);
    const view = normalize(
        {
            derived: [{ name: "Year", field: "Date", by: "year" }],
            rows: ["Year"],
            values: [{ field: "Units", agg: "sum" }],
            filters: [
                { field: "Region", type: "exclude", items: ["South"] },
                { field: "Year", type: "compare", op: ">=", value: 2022 },
                { field: "Date", type: "compare", op: "between", value: "2022-01-01", value2: "2026-12-31" },
                { field: "Year", type: "relative", unit: "year", count: 5 },
                { field: "Year", type: "value", op: ">", value: 3 }
            ]
        },
        data
    ).view;
    assert.equal(view.filters.length, 5);
    const good = JSON.parse(JSON.stringify(toViewFile(view)));
    assert.equal(validator.validate(good).valid, true);
    const withFilter = (f) => ({ ...good, view: { ...good.view, filters: [f] } });
    // a filter type of a newer pivotkit is valid; this version reports it as unused
    assert.equal(validator.validate(withFilter({ field: "Date", type: "between" })).valid, true);
    assert.deepEqual(normalize({ filters: [{ field: "Date", type: "between" }] }, data).issues.map((i) => i.code), ["unknownFilterType"]);
        for (const broken of [
        { field: "Date", type: 7 },
        { field: "Date", type: "relative", unit: "week", count: 1 },
        { field: "Date", type: "relative", unit: "year", count: 0 },
        { field: "Date", type: "relative", unit: "year" },
        { field: "Year", type: "compare", op: "~", value: 1 },
        { field: "Year", type: "compare", op: ">" },
        { type: "include", items: [] }
    ]) {
        assert.equal(validator.validate(withFilter(broken)).valid, false, JSON.stringify(broken));
    }
});
