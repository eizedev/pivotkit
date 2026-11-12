// The JSON Schemas of the view file and pivotkit-core's writer agree: the address, the format and its
// version, the limits, and every key a written file has is described in the schema of the version it
// writes (view-file-2.json, built by scripts/schemas.js, published at VIEW_FILE_SCHEMA as the copy
// scripts/docs-demo.js makes). view-file-1.json still describes the files of format version 1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { Validator } from "@cfworker/json-schema";
import { CATALOG, LIMITS, VIEW_FILE_FORMAT, VIEW_FILE_LIMITS, VIEW_FILE_SCHEMA, VIEW_FILE_VERSION, encode, fromViewFile, normalize, toViewFile } from "pivotkit-core";

const schemaFile = (version) => new URL(`../packages/pivotkit-core/schema/view-file-${version}.json`, import.meta.url);
const schema = JSON.parse(readFileSync(schemaFile(VIEW_FILE_VERSION), "utf8"));
const schemaV1 = JSON.parse(readFileSync(schemaFile(1), "utf8"));

test("one schema per format version: the package ships them, the site's copy (scripts/docs-demo.js) is the same bytes", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../packages/pivotkit-core/package.json", import.meta.url), "utf8"));
    for (const version of [1, VIEW_FILE_VERSION]) {
        assert.equal(pkg.exports[`./schema/view-file-${version}.json`], `./schema/view-file-${version}.json`);
        const copy = new URL(`../docs/schema/view-file-${version}.json`, import.meta.url);
        if (existsSync(copy)) {
            assert.deepEqual(readFileSync(copy), readFileSync(schemaFile(version)), "docs/schema/ is a stale copy: npm run docs:demo");
        }
    }
    assert.ok(pkg.files.includes("schema"));
    const demo = readFileSync(new URL("../scripts/docs-demo.js", import.meta.url), "utf8");
    assert.match(demo, /packages\/pivotkit-core\/schema\//);
    assert.equal(schemaV1.$id, "https://pivotkit.eize.dev/schema/view-file-1.json");
    assert.equal(schemaV1.properties.formatVersion.const, 1);
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
    assert.ok(Object.hasOwn(schema.properties.source.properties, "params"));
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
        toViewFile(view, { source: { id: "s" } }, { link: true }),
        toViewFile(view, { source: { id: "s", params: { year: "2026" } } }, { link: true })
    ];
    for (const file of files) {
        const result = validator.validate(JSON.parse(JSON.stringify(file)));
        assert.equal(result.valid, true, JSON.stringify(result.errors.slice(0, 3)));
    }
    const good = JSON.parse(JSON.stringify(files[0]));
    for (const broken of [
        { ...good, format: "other" },
        { ...good, formatVersion: VIEW_FILE_VERSION + 1 },
        { ...good, source: { id: "s", params: { year: 2026 } } },
        { ...good, view: { ...good.view, filters: [{ field: "Region", type: "include", items: [] }] } },
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

// the view's filters of view version 1 (schema/view-file-1.json describes files of format version 1,
// which hold version-1 views): their types and the parts of the comparisons and relative ranges; a
// view of 0.2.0's filter types stays valid
const V1_FILTERS = Object.freeze({
    types: ["compare", "exclude", "include", "label", "relative", "top", "value"],
    valueOps: ["=", "!=", ">", ">=", "<", "<=", "between", "notBetween"],
    relativeUnits: ["year", "month", "day"]
});
test("the schema's filters are version 1's: types, operators, units, the count's range", () => {
    const schema = schemaV1;
    const filters = schema.properties.view.properties.filters;
    assert.equal(filters.maxItems, LIMITS.filters);
    // the known types are listed; any other text is valid too (a newer pivotkit's, reported as unused)
    assert.deepEqual([...filters.items.properties.type.anyOf[0].enum].sort(), V1_FILTERS.types);
    const [compare, relative] = filters.items.allOf.map((a) => a.then.properties);
    assert.deepEqual(compare.op.enum, V1_FILTERS.valueOps);
    assert.deepEqual(relative.unit.enum, V1_FILTERS.relativeUnits);
    assert.equal(relative.count.maximum, CATALOG.relativeMaxCount);
    const validator = new Validator(schema, "2020-12", false);
    const data = encode([{ Region: "North", Units: 3, Date: "2026-01-01" }]);
    // a version-1 view as 0.4.0 wrote it
    const view = /** @type {any} */ (
        {
            version: 1,
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
        }
    );
    // and pivotkit-core reads it without an issue
    assert.deepEqual(normalize(view, data).issues, []);
    // a file of format version 1, as 0.4.0 wrote it
    const good = { format: "pivotkit-view", formatVersion: 1, name: "", source: {}, extensions: {}, view };
    assert.equal(validator.validate(good).valid, true);
    assert.equal(fromViewFile(good).failed, null);
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
