import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError, VIEW_VERSION, encode, normalize, toViewFile } from "../src/index.js";
import { TEMPLATE_LIMITS, TEMPLATES_EXTENSION, parseTemplates, templatesFromSchema } from "../src/templates.js";
import { SCHEMA_CAPS } from "../src/schema.js";
import { SALES } from "./fixtures.js";

const VIEW = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };

test("parseTemplates reads view files, templates { name, view } and named bare views", () => {
    const file = toViewFile(VIEW, { name: "From a file", description: "Sales per region", source: { id: "sales" } });
    const { templates, issues } = parseTemplates([file, { name: "A template", view: VIEW }, { name: "A bare view", ...VIEW }]);
    assert.deepEqual(issues, []);
    assert.deepEqual(
        templates.map((t) => t.name),
        ["From a file", "A template", "A bare view"]
    );
    assert.equal(templates[0].description, "Sales per region");
    assert.deepEqual(templates[0].source, { id: "sales" });
    // the name of a bare view is the template's: it is not left in the view
    assert.deepEqual(templates[2].view, VIEW);
    // each view still goes through normalize against the data
    const data = encode(SALES);
    for (const t of templates) {
        assert.deepEqual(normalize(t.view, data).issues, []);
    }
});

test("parseTemplates reads the JSON text of a collection too", () => {
    const { templates } = parseTemplates(JSON.stringify([{ name: "One", view: VIEW }]));
    assert.equal(templates.length, 1);
    assert.equal(templates[0].name, "One");
});

test("parseTemplates leaves out what it cannot use, with an issue, and never throws", () => {
    const cyclic = { name: "Cycle", view: {} };
    cyclic.view.self = cyclic;
    const { templates, issues } = parseTemplates([
        VIEW, // no name
        { name: "   ", view: VIEW },
        42,
        { name: "Newer", view: { ...VIEW, version: VIEW_VERSION + 1 } },
        { format: "pivotkit-view", formatVersion: 2, name: "Newer format", view: VIEW },
        cyclic,
        { name: "Kept", view: VIEW }
    ]);
    assert.deepEqual(
        templates.map((t) => t.name),
        ["Kept"]
    );
    assert.deepEqual(
        issues.map((i) => i.path),
        ["[0]", "[1]", "[2]", "[3]", "[4]", "[5]"]
    );
    assert.match(issues[3].message, /newer/);
    for (const input of [null, undefined, {}, "not json", "{}", 5]) {
        const read = parseTemplates(input);
        assert.deepEqual(read.templates, []);
        assert.equal(read.issues.length, 1);
    }
});

test("parseTemplates: names are plain text, never markup or controls; names need not be unique", () => {
    const { templates } = parseTemplates([
        { name: "<b>Bold</b>\u0000‮evil", view: VIEW },
        { name: "Same", view: VIEW },
        { name: "Same", view: VIEW },
        { name: "x".repeat(1000), view: VIEW }
    ]);
    // text stays text (the UI renders it as text); control and bidi characters go
    assert.equal(templates[0].name, "<b>Bold</b> evil");
    assert.equal(templates.filter((t) => t.name === "Same").length, 2);
    assert.ok(templates[3].name.length <= 256);
});

test("parseTemplates: an inherited or a non-string name is no name", () => {
    const proto = Object.create({ name: "inherited" });
    proto.rows = ["Region"];
    const { templates, issues } = parseTemplates([{ name: 5, view: VIEW }, proto]);
    assert.deepEqual(templates, []);
    assert.equal(issues.length, 2);
});

test("parseTemplates caps the number of templates and the size of the collection", () => {
    const many = Array.from({ length: TEMPLATE_LIMITS.count + 5 }, (_, i) => ({ name: `T${i}`, view: VIEW }));
    const read = parseTemplates(many);
    assert.equal(read.templates.length, TEMPLATE_LIMITS.count);
    assert.match(read.issues[0].message, /more than/);

    const big = { name: "Big", view: { rows: ["Region"], filters: [{ field: "Region", type: "include", items: ["x".repeat(TEMPLATE_LIMITS.text)] }] } };
    const sized = parseTemplates([{ name: "Small", view: VIEW }, big, { name: "After", view: VIEW }]);
    assert.deepEqual(
        sized.templates.map((t) => t.name),
        ["Small"]
    );
    assert.match(sized.issues[0].message, /longer than/);

    const text = parseTemplates(" ".repeat(TEMPLATE_LIMITS.text + 1));
    assert.deepEqual(text.templates, []);
    assert.match(text.issues[0].message, /longer than/);
});

// an OpenAPI document with pivotkit's own extension on a schema and on the root
const OPENAPI = {
    openapi: "3.1.0",
    info: { title: "Sales API", version: "1.0.0" },
    [TEMPLATES_EXTENSION]: [{ name: "Root view", view: VIEW }],
    components: {
        schemas: {
            Sale: {
                type: "object",
                properties: { Region: { type: "string" }, Sales: { type: "number" } },
                [TEMPLATES_EXTENSION]: [
                    { name: "Sales by region", ...VIEW },
                    toViewFile({ rows: ["Product"], values: [{ field: "Sales", agg: "sum" }] }, { name: "Sales by product", source: { id: "sales" } }),
                    { $ref: "#/components/x-shared/0" }
                ]
            },
            Alias: { $ref: "#/components/schemas/Sale" },
            Remote: { $ref: "https://example.com/schema.json" },
            Listed: { type: "object", [TEMPLATES_EXTENSION]: { $ref: "#/components/x-shared" } }
        },
        "x-shared": [{ name: "Shared by reference", view: VIEW }]
    }
};

test("templatesFromSchema reads x-pivotkit-views of a named schema, a local $ref or the root", () => {
    const named = templatesFromSchema(OPENAPI, { schema: "Sale" });
    // an entry that is itself a $ref is no view: left out with an issue (only the list may be a reference)
    assert.deepEqual(
        named.templates.map((t) => t.name),
        ["Sales by region", "Sales by product"]
    );
    assert.deepEqual(
        named.issues.map((i) => i.path),
        [`${TEMPLATES_EXTENSION}[2]`]
    );
    assert.deepEqual(named.templates[1].source, { id: "sales" });
    assert.deepEqual(
        templatesFromSchema(OPENAPI, { schema: "#/components/schemas/Sale" }).templates.map((t) => t.name),
        ["Sales by region", "Sales by product"]
    );
    // a schema that is a local $ref is followed
    assert.equal(templatesFromSchema(OPENAPI, { schema: "Alias" }).templates.length, 2);
    // the list itself may be a local $ref
    assert.deepEqual(
        templatesFromSchema(OPENAPI, { schema: "Listed" }).templates.map((t) => t.name),
        ["Shared by reference"]
    );
    assert.deepEqual(
        templatesFromSchema(OPENAPI).templates.map((t) => t.name),
        ["Root view"]
    );
});

test("templatesFromSchema: nothing fetched, nothing thrown for what it cannot read, a wrong name throws", () => {
    const remote = templatesFromSchema(OPENAPI, { schema: "Remote" });
    assert.deepEqual(remote.templates, []);
    assert.match(remote.issues[0].message, /not local; not fetched/);
    // a document without the extension: no templates, no issue
    assert.deepEqual(templatesFromSchema({ openapi: "3.1.0" }), { templates: [], issues: [] });
    assert.deepEqual(templatesFromSchema({ [TEMPLATES_EXTENSION]: "nope" }).templates, []);
    assert.throws(() => templatesFromSchema(OPENAPI, { schema: "Missing" }), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT");
    assert.throws(() => templatesFromSchema(null), PivotkitError);
    assert.throws(() => templatesFromSchema([]), PivotkitError);
    // a reference cycle ends at the depth cap
    const cycle = { components: { schemas: { A: { $ref: "#/components/schemas/B" }, B: { $ref: "#/components/schemas/A" } } } };
    const read = templatesFromSchema(cycle, { schema: "A" });
    assert.deepEqual(read.templates, []);
    assert.match(read.issues[0].message, new RegExp(`deeper than ${SCHEMA_CAPS.depth}`));
});

test("templatesFromSchema: an own property only, never one of the prototype", () => {
    const doc = Object.create({ [TEMPLATES_EXTENSION]: [{ name: "Inherited", view: VIEW }] });
    assert.deepEqual(templatesFromSchema(doc).templates, []);
});
