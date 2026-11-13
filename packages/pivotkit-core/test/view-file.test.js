import { test } from "node:test";
import assert from "node:assert/strict";
import { VIEW_FILE_FORMAT, VIEW_FILE_LIMITS, VIEW_FILE_SCHEMA, VIEW_FILE_VERSION, VIEW_VERSION, encode, fromViewFile, normalize, toViewFile, viewFileFields, viewFileName, viewFileText } from "pivotkit-core";
import { decodeViewLink, encodeViewLink } from "pivotkit-core/link";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const view = normalize(
    {
        rows: ["Region", "Month"],
        cols: ["Product"],
        values: [{ field: "Units", agg: "sum" }],
        derived: [{ name: "Month", field: "Date", by: "yearMonth" }],
        filters: [{ field: "Rep", type: "exclude", items: ["Dee"] }],
        sort: [{ field: "Region", by: "value", order: "desc", value: { field: "Price", agg: "sum" } }]
    },
    data
).view;

test("a view file has its keys in the canonical order and lists the fields the view uses with their types", () => {
    const file = toViewFile(view, { name: "Units by region", description: "  For the review  ", createdAt: new Date(Date.UTC(2026, 10, 7, 9, 30)), generator: { name: "pivotkit-react", version: "0.1.0" }, source: { id: "sales", name: "Sales" }, data });
    assert.deepEqual(Object.keys(file), ["$schema", "format", "formatVersion", "name", "description", "createdAt", "generator", "source", "extensions", "view"]);
    assert.equal(file.$schema, VIEW_FILE_SCHEMA);
    assert.equal(file.format, VIEW_FILE_FORMAT);
    assert.equal(file.formatVersion, VIEW_FILE_VERSION);
    assert.equal(file.description, "For the review");
    assert.equal(file.createdAt, "2026-11-07T09:30:00.000Z");
    // rows, columns, values, filters, sort; the grouping "Month" counts as its source "Date"
    assert.deepEqual(file.source, {
        id: "sales",
        name: "Sales",
        fields: [
            { name: "Region", type: "string" },
            { name: "Date", type: "date" },
            { name: "Product", type: "string" },
            { name: "Units", type: "number" },
            { name: "Rep", type: "string" },
            { name: "Price", type: "number" }
        ]
    });
    assert.deepEqual(file.extensions, {});
    assert.equal(file.view, view);
});

test("without a description, a time or data the keys are left out, and the text is the same bytes every time", () => {
    const file = toViewFile(view, { name: "Units" });
    assert.deepEqual(Object.keys(file), ["$schema", "format", "formatVersion", "name", "source", "extensions", "view"]);
    assert.deepEqual(file.source, {});
    const text = viewFileText(file);
    assert.equal(text, viewFileText(toViewFile(view, { name: "Units" })));
    assert.ok(text.endsWith("}\n"));
    assert.match(text, /^\{\n {2}"\$schema"/);
    // a date that is no date is left out, not written as "Invalid Date"
    assert.equal(toViewFile(view, { createdAt: "yesterday" }).createdAt, undefined);
});

test("$schema: the published schema by default, a host's own address, or left out; reading never needs it", () => {
    assert.equal(toViewFile(view).$schema, VIEW_FILE_SCHEMA);
    const own = toViewFile(view, { schemaUrl: "https://reports.example.com/schema/view-file-1.json" });
    assert.equal(own.$schema, "https://reports.example.com/schema/view-file-1.json");
    assert.equal(Object.keys(own)[0], "$schema");
    for (const off of [null, "", "  "]) {
        const none = toViewFile(view, { schemaUrl: off });
        assert.equal(Object.hasOwn(none, "$schema"), false);
        assert.deepEqual(Object.keys(none).slice(0, 2), ["format", "formatVersion"]);
        assert.deepEqual(fromViewFile(viewFileText(none)).view, view);
    }
    // any $schema, or none, reads the same
    assert.deepEqual(fromViewFile({ ...toViewFile(view), $schema: "urn:anything" }).view, view);
});

test("the link profile carries format, version, source id, name and view, nothing that grows with the data", () => {
    const link = toViewFile(view, { name: "Units", description: "d", createdAt: new Date(), generator: { name: "x", version: "1" }, source: { id: "sales", name: "Sales" }, data }, { link: true });
    assert.deepEqual(Object.keys(link), ["format", "formatVersion", "source", "name", "view"]);
    assert.deepEqual(link.source, { id: "sales" });
    assert.deepEqual(Object.keys(toViewFile(view, {}, { link: true })), ["format", "formatVersion", "view"]);
    // it travels in a link with the transport prefix "1." and reads back as a view file
    const text = encodeViewLink(link);
    assert.match(text, /^1\./);
    const read = fromViewFile(decodeViewLink(text).view);
    assert.equal(read.envelope, true);
    assert.equal(read.name, "Units");
    assert.deepEqual(read.view, view);
});

test("a view file reads back with its envelope; unknown keys are ignored", () => {
    const file = { ...toViewFile(view, { name: "Units", source: { id: "sales" }, data }), later: { anything: true }, extensions: { "example.com": { x: 1 } } };
    const read = fromViewFile(JSON.stringify(file));
    assert.equal(read.failed, null);
    assert.equal(read.envelope, true);
    assert.equal(read.name, "Units");
    assert.equal(read.source?.id, "sales");
    assert.deepEqual(read.view, view);
    assert.deepEqual(read.issues, []);
});

test("a bare view and a template { name, view } still load", () => {
    const bare = fromViewFile(JSON.stringify(view));
    assert.equal(bare.envelope, false);
    assert.deepEqual(bare.view, view);
    const template = fromViewFile({ name: "Old template", view });
    assert.equal(template.name, "Old template");
    assert.deepEqual(template.view, view);
});

test("a newer format version or view version is refused, never read as an older one", () => {
    const newer = fromViewFile({ format: VIEW_FILE_FORMAT, formatVersion: VIEW_FILE_VERSION + 1, view });
    assert.equal(newer.failed, "newerFormat");
    assert.equal(newer.view, null);
    const newerView = fromViewFile({ format: VIEW_FILE_FORMAT, formatVersion: 1, view: { ...view, version: VIEW_VERSION + 1 } });
    assert.equal(newerView.failed, "newerView");
    assert.equal(fromViewFile({ ...view, version: VIEW_VERSION + 1 }).failed, "newerView");
    // a format version that is not an integer this package reads (1, 2) is never read as one of them
    for (const v of [2.5, "3", 3, "2.5"]) {
        assert.equal(fromViewFile({ format: VIEW_FILE_FORMAT, formatVersion: v, view }).failed, "newerFormat", JSON.stringify(v));
    }
    for (const v of [0, -1, "1", "2", 1.5, "one", true, {}]) {
        assert.equal(fromViewFile({ format: VIEW_FILE_FORMAT, formatVersion: v, view }).failed, "notView", JSON.stringify(v));
    }
});

test("what cannot be a view says why; nothing throws", () => {
    assert.equal(fromViewFile("").failed, "empty");
    assert.equal(fromViewFile("   ").failed, "empty");
    assert.equal(fromViewFile("x".repeat(VIEW_FILE_LIMITS.text + 1)).failed, "tooLarge");
    assert.equal(fromViewFile("{nope").failed, "notJson");
    assert.equal(fromViewFile("[1,2]").failed, "notView");
    assert.equal(fromViewFile(null).failed, "notView");
    assert.equal(fromViewFile({ format: VIEW_FILE_FORMAT, formatVersion: 1, view: [] }).failed, "notView");
    assert.equal(fromViewFile({ format: VIEW_FILE_FORMAT, formatVersion: 1 }).failed, "notView");
});

test("keys are read as own properties: __proto__ and inherited keys never count", () => {
    const text = `{"__proto__": {"format": "pivotkit-view", "view": {"rows": ["Evil"]}}, "rows": ["Region"]}`;
    const read = fromViewFile(text);
    assert.equal(read.envelope, false);
    assert.deepEqual(read.view?.rows, ["Region"]);
    assert.equal(/** @type {any} */ ({}).format, undefined);
    const inherited = Object.create({ format: VIEW_FILE_FORMAT, view: { rows: ["X"] } });
    assert.equal(fromViewFile(inherited).envelope, false);
});

test("names, descriptions and the source are plain text, capped; a broken envelope part is left out with an issue", () => {
    const read = fromViewFile({
        format: VIEW_FILE_FORMAT,
        formatVersion: 1,
        name: `<b>Bold</b>\u0000${"n".repeat(400)}`,
        description: 42,
        createdAt: "not a date",
        generator: "me",
        source: { id: "sales", name: "Sales\nData", fields: [{ name: "Region", type: "string" }, { name: "", type: "number" }, { name: "Odd", type: "money" }] },
        view
    });
    assert.equal(read.failed, null);
    assert.ok(read.name.startsWith("<b>Bold</b> n"), "markup stays text; the caller renders it as text");
    assert.equal(read.name.length, VIEW_FILE_LIMITS.name);
    assert.equal(read.description, "");
    assert.equal(read.createdAt, null);
    assert.equal(read.generator, null);
    assert.deepEqual(read.source, { id: "sales", name: "Sales Data", fields: [{ name: "Region", type: "string" }, { name: "Odd", type: "string" }] });
    assert.deepEqual(read.issues.map((i) => i.path), ["createdAt", "source.fields[1]", "source.fields[2].type"]);
    const capped = fromViewFile({ format: VIEW_FILE_FORMAT, formatVersion: 1, source: { fields: Array.from({ length: VIEW_FILE_LIMITS.fields + 5 }, (_, i) => ({ name: `f${i}`, type: "string" })) }, view });
    assert.equal(capped.source?.fields?.length, VIEW_FILE_LIMITS.fields);
    assert.equal(fromViewFile({ format: VIEW_FILE_FORMAT, view }).issues[0].path, "formatVersion");
    // field names are plain text too
    assert.equal(fromViewFile({ format: VIEW_FILE_FORMAT, formatVersion: 1, source: { fields: [{ name: "a\u0000\nb", type: "string" }] }, view }).source?.fields?.[0].name, "a b");
});

test("with the data it says whether the view fits: same source, every field there with its type", () => {
    const file = toViewFile(view, { name: "Units", source: { id: "sales" }, data });
    assert.deepEqual(fromViewFile(file, { data, sourceId: "sales" }).compatible, { ok: true, source: "same", missing: [], changed: [], needs: ["Region", "Date", "Product", "Units", "Rep", "Price"] });
    assert.equal(fromViewFile(file, { data, sourceId: "weather" }).compatible?.source, "other");
    assert.equal(fromViewFile(file, { data, sourceId: "weather" }).compatible?.ok, false);
    assert.equal(fromViewFile(file, { data }).compatible?.source, "unknown");
    // other data: fields missing, a type changed
    const other = encode([{ Region: "N", Units: "many", Product: "A" }]);
    const fit = fromViewFile(file, { data: other, sourceId: "sales" }).compatible;
    assert.deepEqual(fit?.missing, ["Date", "Rep", "Price"]);
    assert.deepEqual(fit?.changed, [{ name: "Units", type: "number", dataType: "string" }]);
    // a bare view: the fields it uses, no types to compare
    assert.deepEqual(fromViewFile({ rows: ["Nope"] }, { data }).compatible?.missing, ["Nope"]);
});

test("viewFileFields lists the data's fields a view uses, groupings as their source, each once", () => {
    assert.deepEqual(viewFileFields(view), ["Region", "Date", "Product", "Units", "Rep", "Price"]);
    assert.deepEqual(viewFileFields({ rows: ["a", "A"], values: [{ field: null, agg: "count" }] }), ["a"]);
    assert.deepEqual(viewFileFields(null), []);
});

test("the suggested file name is a slug with .pivotkit.json", () => {
    assert.equal(viewFileName("Revenue by région / 2026"), "revenue-by-region-2026.pivotkit.json");
    assert.equal(viewFileName("…"), "view.pivotkit.json");
    assert.equal(viewFileName(undefined), "view.pivotkit.json");
    assert.ok(viewFileName("x".repeat(500)).length <= 80 + ".pivotkit.json".length);
});
