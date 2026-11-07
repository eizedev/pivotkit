import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError, computePivot, encode, fieldDefaultsFromSchema, fieldLabel, toGrid, toSeries } from "../src/index.js";
import { toCsv } from "../src/export.js";
import { SCHEMA_CAPS } from "../src/schema.js";
import { SALES } from "./fixtures.js";

// An OpenAPI 3.1 document shaped like a real product API (made up): a list endpoint, a row schema
// built with allOf and $ref, nullable fields written both ways, enums, formats, extensions.
const OPENAPI = {
    openapi: "3.1.0",
    info: { title: "Inventory API", version: "2.0.0" },
    paths: {
        "/items": {
            get: {
                responses: {
                    200: { content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Item" } } } } }
                }
            }
        }
    },
    components: {
        schemas: {
            Base: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Identifier of the item.", "x-internal": true },
                    created: { type: "string", format: "date-time", title: "Created", description: "When the item was\nrecorded, in UTC." }
                }
            },
            Status: { type: "string", enum: ["planned", "active", "retired"], description: "Where the item is in its life." },
            Item: {
                allOf: [
                    { $ref: "#/components/schemas/Base" },
                    {
                        type: "object",
                        required: ["name"],
                        properties: {
                            name: { type: "string", title: "Name" },
                            status: { $ref: "#/components/schemas/Status", title: "Status" },
                            units: { type: ["integer", "null"], title: "Units in stock", externalDocs: { url: "https://example.org/docs/units" } },
                            price: { anyOf: [{ type: "number" }, { type: "null" }], description: "Net price per unit." },
                            released: { type: "string", format: "date", title: "Release date" },
                            vendor: { type: "string", title: "Vendor", externalDocs: { url: "javascript:alert(1)" } },
                            notes: { type: "string" }
                        }
                    }
                ]
            }
        }
    }
};

test("fieldDefaultsFromSchema: an OpenAPI schema by name gives labels, descriptions, types, orders and links", () => {
    const d = fieldDefaultsFromSchema(OPENAPI, { schema: "Item" });
    assert.deepEqual(Object.keys(d), ["id", "created", "name", "status", "units", "price", "released", "vendor"], "a property without anything to say is left out");
    assert.deepEqual(d.id, { description: "Identifier of the item." });
    assert.deepEqual(d.created, { label: "Created", description: "When the item was recorded, in UTC.", type: "date" });
    assert.deepEqual(d.status, { label: "Status", description: "Where the item is in its life.", order: ["planned", "active", "retired"] }, "the $ref's own title wins, the target's enum and description stay");
    assert.deepEqual(d.units, { label: "Units in stock", href: "https://example.org/docs/units", type: "number" });
    assert.deepEqual(d.price, { description: "Net price per unit.", type: "number" });
    assert.equal(d.released.type, "date");
    assert.deepEqual(d.vendor, { label: "Vendor" }, "a link that is not https is dropped");
    // the same schema by a local $ref, and as the row schema itself
    assert.deepEqual(fieldDefaultsFromSchema(OPENAPI, { schema: "#/components/schemas/Item" }), d);
    assert.deepEqual(fieldDefaultsFromSchema({ components: OPENAPI.components }, { schema: "Item" }), d, "options.schema without an openapi key");
});

test("fieldDefaultsFromSchema: a plain JSON Schema of a row, or an array of rows", () => {
    const row = { type: "object", properties: { Region: { title: "Sales region", description: "Where it was sold." }, Units: { type: "integer" } } };
    const want = { Region: { label: "Sales region", description: "Where it was sold." }, Units: { type: "number" } };
    assert.deepEqual(fieldDefaultsFromSchema(row), want);
    assert.deepEqual(fieldDefaultsFromSchema({ type: "array", items: row }), want);
    assert.deepEqual(fieldDefaultsFromSchema({ swagger: "2.0", definitions: { Row: row } }, { schema: "Row" }), want, "Swagger 2 definitions");
});

test("fieldDefaultsFromSchema: bad input throws, hostile input is capped and never runs", () => {
    for (const bad of [null, "schema", [], 42]) {
        assert.throws(() => fieldDefaultsFromSchema(/** @type {any} */ (bad)), PivotkitError);
    }
    assert.throws(() => fieldDefaultsFromSchema(OPENAPI), /options.schema/, "a document needs the name of its row schema");
    assert.throws(() => fieldDefaultsFromSchema(OPENAPI, { schema: "Missing" }), PivotkitError);
    assert.throws(() => fieldDefaultsFromSchema({ type: "object" }), /properties/);
    // remote references are not fetched
    assert.deepEqual(fieldDefaultsFromSchema({ properties: { a: { $ref: "https://example.org/a.json" }, b: { title: "B" } } }), { b: { label: "B" } });
    // a reference cycle ends
    const cycle = { components: { schemas: { A: { $ref: "#/components/schemas/B" }, B: { $ref: "#/components/schemas/A" } } }, properties: { x: { $ref: "#/components/schemas/A" }, y: { title: "Y" } } };
    assert.deepEqual(fieldDefaultsFromSchema(cycle), { y: { label: "Y" } });
    // a fan-out of allOf over allOf stops after SCHEMA_CAPS.steps schema objects, not after 1000^n
    const wide = Array.from({ length: 1000 }, () => ({ $ref: "#/$defs/L1" }));
    const fan = { $defs: { L1: { allOf: wide.map(() => ({ $ref: "#/$defs/L2" })) }, L2: { allOf: wide.map(() => ({ $ref: "#/$defs/L3" })) }, L3: { allOf: wide } }, properties: { a: { allOf: wide, title: "A" } } };
    const t0 = performance.now();
    fieldDefaultsFromSchema(fan);
    assert.ok(performance.now() - t0 < 5000, "bounded work");
    // texts are plain and capped; a property named __proto__ is a field like any other
    const long = "x".repeat(SCHEMA_CAPS.description + 50);
    const proto = JSON.parse('{"properties":{"__proto__":{"title":"Proto"},"t":{"title":"<b>bold</b>\\u0000\\u2028line","description":"' + long + '"}}}');
    const d = fieldDefaultsFromSchema(proto);
    assert.equal(Object.getPrototypeOf(d), Object.prototype);
    assert.deepEqual(Object.keys(d), ["__proto__", "t"]);
    assert.equal(d.t.label, "<b>bold</b> line", "kept as text, never parsed as markup");
    assert.equal(d.t.description.length, SCHEMA_CAPS.description);
    assert.ok(d.t.description.endsWith("…"));
    assert.equal(({}).polluted, undefined);
    // enums keep primitive values only, capped
    const e = fieldDefaultsFromSchema({ properties: { s: { enum: ["a", { x: 1 }, null, 2, ...Array.from({ length: 2000 }, (_, i) => `v${i}`)] } } });
    assert.equal(e.s.order.length, SCHEMA_CAPS.order - 1);
    assert.deepEqual(e.s.order.slice(0, 3), ["a", null, 2]);
});

test("fieldLabel: own entries only, case-insensitive, the name without one", () => {
    const labels = { fields: { region: "Sales region", Empty: "  " } };
    assert.equal(fieldLabel("Region", labels), "Sales region");
    assert.equal(fieldLabel("Empty", labels), "Empty", "a blank label is no label");
    assert.equal(fieldLabel("constructor", labels), "constructor");
    assert.equal(fieldLabel("Units", undefined), "Units");
});

test("display names in the table headers, value names, the chart and the CSV; the view keeps the names", () => {
    const fields = { Region: "Sales region", Units: "Units sold", Rep: "Sales rep" };
    const result = computePivot(encode(SALES), { rows: ["Region"], cols: ["Rep"], values: [{ field: "Units", agg: "sum" }, { field: "Units", agg: "max" }] });
    const grid = toGrid(result, { labels: { fields } });
    const header = grid.rows.slice(0, grid.headerRows).flat().filter(Boolean);
    assert.ok(header.some((c) => c.kind === "corner" && c.text === "Sales region" && c.field === "Region"), "the corner says the label, the cell keeps the field");
    assert.ok(header.some((c) => c.kind === "corner" && c.text === "Sales rep" && c.field === "Rep"));
    assert.deepEqual(grid.valueNames, ["Sum of Units sold", "Max of Units sold"]);
    assert.match(toCsv(grid).split("\n")[0], /Sales rep/);
    assert.ok(!/\bRegion\b/.test(toCsv(grid).split("\n").slice(0, grid.headerRows).join("\n")), "no field name in the CSV headers");
    assert.match(toSeries(result, { labels: { fields } }).series[0].name, /Units sold/);
    assert.deepEqual(result.view.rows, ["Region"]);
    // without labels nothing changes
    assert.deepEqual(toGrid(result).valueNames, ["Sum of Units", "Max of Units"]);
});
