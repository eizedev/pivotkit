// The operation table shared by the CLI, the MCP server and a REST service: every operation runs on
// real rows through a front end's env, and what it returns is what its output schema says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Validator } from "@cfworker/json-schema";
import { encode } from "pivotkit-core";
import { OPERATIONS, OPERATION_ERRORS, OPERATION_NAMES, OperationError, VIEW_GUIDE, exampleViews, findingOf } from "pivotkit-report/operations";
import { FIXED, HOSTILE, SALES, echarts } from "./fixtures.js";

const ORDERS = SALES.map((r) => ({ ...r, Sales: r.Units * r.Price, OrderDate: r.Date }));
const encoded = encode(ORDERS, { timeZone: "UTC" });
const env = { data: async (id) => ({ data: encoded, name: `${id}.csv`, notes: [] }), sources: async () => [{ id: "sales", title: "Sales", kind: "source", link: true, schedulable: true }], link: async () => ({ url: "https://reports.example.com/sales#/tab" }), echarts, ...FIXED };

/** Checks an operation's result against its output schema (draft 2020-12, as MCP's SDK reads it). */
function conforms(name, result) {
    const outcome = new Validator(/** @type {any} */ (OPERATIONS[name].output), "2020-12", false).validate(result);
    assert.ok(outcome.valid, `${name}: ${JSON.stringify(outcome.errors.slice(0, 3))}`);
}

test("every operation has its words, schemas without $schema, an HTTP route of its own and only known needs", () => {
    const routes = new Set();
    for (const name of OPERATION_NAMES) {
        const op = OPERATIONS[name];
        assert.equal(op.name, name);
        assert.match(name, /^[a-z]+(_[a-z]+)+$/);
        assert.ok(op.title && op.description.length > 40, name);
        for (const schema of [op.input, op.output]) {
            assert.equal(schema.type, "object");
            assert.ok(!("$schema" in schema));
            assert.doesNotThrow(() => new Validator(/** @type {any} */ (schema), "2020-12"));
        }
        assert.equal(op.input.additionalProperties, false, `${name}: input takes no other keys`);
        const route = `${op.http.method} ${op.http.path}`;
        assert.ok(!routes.has(route), route);
        routes.add(route);
        for (const need of op.needs) {
            assert.ok(["data", "sources", "link", "template"].includes(need), `${name} needs ${need}`);
        }
    }
});

test("the view guide's examples and the examples built from a source's fields are valid views without findings", async () => {
    for (const { title, view } of [...VIEW_GUIDE.examples, ...exampleViews(encoded.schema.fields)]) {
        const { result } = await OPERATIONS.validate_view.run({ source: "sales", view }, env);
        assert.deepEqual(result.findings, [], title);
        assert.equal(result.valid, true, title);
    }
    assert.ok(exampleViews(encoded.schema.fields).length >= 3);
    assert.deepEqual(exampleViews([]), []);
    // the guide names every filter type and grouping the engine knows
    for (const word of [...VIEW_GUIDE.catalog.filterTypes, "yearQuarter", "latest"]) {
        assert.ok(VIEW_GUIDE.text.includes(word), word);
    }
});

test("validate_view: a misspelt field is an error with the name meant; the fields the view uses are listed", async () => {
    const { result } = await OPERATIONS.validate_view.run({ source: "sales", view: { rows: ["Regoin"], values: [{ field: "Sales", agg: "sum" }] } }, env);
    conforms("validate_view", result);
    assert.equal(result.valid, false);
    assert.deepEqual(result.findings.map((f) => [f.code, f.path, f.suggestion]), [["unknownField", "rows[0]", "Region"]]);
    assert.deepEqual(result.uses, ["Regoin", "Sales"]);
    const broken = await OPERATIONS.validate_view.run({ source: "sales", view: "{ not json" }, env);
    assert.deepEqual(broken.result.findings.map((f) => f.code), ["viewFile"]);
    await assert.rejects(OPERATIONS.validate_view.run({ source: "sales", view: { rows: ["x".repeat(1_000_001)] } }, env), (e) => e instanceof OperationError && e.code === "LIMIT_EXCEEDED" && e.status === 413);
});

test("describe_source: names, types and counts by default; values only when asked for; examples from its own fields", async () => {
    const plain = (await OPERATIONS.describe_source.run({ source: "sales" }, env)).result;
    conforms("describe_source", plain);
    const units = plain.fields.find((f) => f.name === "Units");
    assert.equal(units.min, undefined);
    assert.deepEqual(plain.fields.find((f) => f.name === "Region").items, []);
    assert.doesNotMatch(units.text, /from/);
    assert.ok(plain.examples.every((e) => typeof e.title === "string"));
    const rich = (await OPERATIONS.describe_source.run({ source: "sales", items: 2 }, env)).result;
    assert.deepEqual(rich.fields.find((f) => f.name === "Region").items, ["North", "South"]);
    assert.equal(rich.fields.find((f) => f.name === "Units").min, 1);
});

test("describe_view: the view in words, its findings and the fields it uses", async () => {
    const { result } = await OPERATIONS.describe_view.run({ source: "sales", view: VIEW_GUIDE.examples[1].view }, env);
    conforms("describe_view", result);
    assert.equal(result.valid, true);
    assert.match(result.description.text, /sum of Sales by Region across Quarter/);
    assert.deepEqual(result.uses, ["Region", "OrderDate", "Sales"]);
});

test("render_view: a file of the format asked for (xlsx by default), its summary; a view with errors makes no file", async () => {
    const xlsx = await OPERATIONS.render_view.run({ source: "sales", view: VIEW_GUIDE.examples[0].view }, env);
    conforms("render_view", xlsx.result);
    assert.equal(xlsx.result.format, "xlsx");
    assert.deepEqual([...xlsx.file.bytes.subarray(0, 2)], [0x50, 0x4b]);
    assert.equal(xlsx.file.extension, "xlsx");
    // North, South, West, the blank region and the grand total
    assert.deepEqual(xlsx.result.summary, { rows: 5, columns: 2, sourceRows: 8, truncated: false });
    const csv = await OPERATIONS.render_view.run({ source: "sales", view: VIEW_GUIDE.examples[0].view, format: "csv", name: "by region" }, env);
    assert.equal(csv.file.name, "by region");
    assert.match(new TextDecoder().decode(csv.file.bytes), /North,/);
    const svg = await OPERATIONS.render_view.run({ source: "sales", view: { ...VIEW_GUIDE.examples[0].view, display: "chart" }, format: "svg" }, env);
    assert.match(new TextDecoder().decode(svg.file.bytes), /^<svg/);
    const bad = await OPERATIONS.render_view.run({ source: "sales", view: { rows: ["Nope"] } }, env);
    conforms("render_view", bad.result);
    assert.equal(bad.result.ok, false);
    assert.equal(bad.file, undefined);
    await assert.rejects(OPERATIONS.render_view.run({ source: "sales", view: {}, format: "pdf" }, env), (e) => e.code === "INVALID_INPUT");
    await assert.rejects(OPERATIONS.render_view.run({ source: "sales", view: {} }, { ...env, data: async () => ({ data: encoded.schema.fields, name: "x" }) }), (e) => e.code === "INVALID_INPUT");
});

test("create_link: the view in the fragment of the source's page, the page's own fragment kept; no link without a page or for a broken view", async () => {
    const { result } = await OPERATIONS.create_link.run({ source: "sales", view: VIEW_GUIDE.examples[0].view, name: "By region" }, env);
    conforms("create_link", result);
    assert.match(result.url, /^https:\/\/reports\.example\.com\/sales#\/tab&pivot=1\./);
    const { readViewLink } = await import("pivotkit-core/link");
    const back = readViewLink(new URL(result.url).hash, null);
    assert.deepEqual([back.name, back.src, back.view.rows], ["By region", { id: "sales" }, ["Region"]]);
    const broken = await OPERATIONS.create_link.run({ source: "sales", view: { rows: ["Nope"] } }, env);
    assert.deepEqual([broken.result.ok, broken.result.url], [false, undefined]);
    await assert.rejects(OPERATIONS.create_link.run({ source: "sales", view: {} }, { ...env, link: async () => null }), (e) => e.code === "NO_LINK" && e.status === 409);
});

test("draft_schedule: a draft document and its file, never an address as recipient; a handed-in file cannot be scheduled", async () => {
    const input = { source: "sales", view: VIEW_GUIDE.examples[0].view, name: "Weekly sales", formats: ["xlsx"], every: { unit: "week", weekday: "mon", at: "07:00", timeZone: "Europe/Berlin" }, recipients: ["Sales team"] };
    const { result, file } = await OPERATIONS.draft_schedule.run(input, env);
    conforms("draft_schedule", result);
    assert.equal(result.draft.status, "draft");
    assert.deepEqual(result.draft.schedule, { every: "week", at: "07:00", weekday: "mon", timeZone: "Europe/Berlin" });
    assert.equal(result.draft.created, "2026-11-13T10:00:00.000Z");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(file.bytes)), result.draft);
    for (const to of ["boss@example.com", "https://evil.example", "mailto:x", "a\\b"]) {
        await assert.rejects(OPERATIONS.draft_schedule.run({ ...input, recipients: [to] }, env), (e) => e.code === "INVALID_INPUT", to);
    }
    await assert.rejects(OPERATIONS.draft_schedule.run({ ...input, every: { unit: "week", at: "07:00" } }, env), (e) => e.code === "INVALID_INPUT");
    await assert.rejects(OPERATIONS.draft_schedule.run({ ...input, every: { ...input.every, timeZone: "Mars/Base" } }, env), (e) => e.code === "INVALID_INPUT");
    await assert.rejects(OPERATIONS.draft_schedule.run(input, { ...env, data: async () => ({ data: encoded, name: "x", schedulable: false }) }), (e) => e.code === "NOT_SCHEDULABLE");
});

test("findings carry no control or direction characters and are capped; every error code has an HTTP status", () => {
    for (const text of HOSTILE) {
        const f = findingOf({ severity: "warning", code: "x", path: text, message: `${text}‮${"y".repeat(500)}`, params: { suggestion: text } });
        for (const part of [f.path, f.message, f.suggestion]) {
            // eslint-disable-next-line no-control-regex
            assert.doesNotMatch(part, /[\u0000-\u001f\u007f‮]/);
            assert.ok(part.length <= 200);
        }
    }
    for (const [code, status] of Object.entries(OPERATION_ERRORS)) {
        assert.ok(Number.isInteger(status) && status >= 400 && status < 600, code);
        assert.equal(new OperationError(/** @type {any} */ (code), "m").status, status);
    }
});
