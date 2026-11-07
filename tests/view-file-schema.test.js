// The JSON Schema of the view file (pivotkit-core/schema/view-file-1.json, published at VIEW_FILE_SCHEMA
// as the copy scripts/docs-demo.js makes) and pivotkit-core's writer agree: the address, the format and
// its version, the limits, and every key a written file has is described there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { VIEW_FILE_FORMAT, VIEW_FILE_LIMITS, VIEW_FILE_SCHEMA, VIEW_FILE_VERSION, encode, normalize, toViewFile } from "pivotkit-core";

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
