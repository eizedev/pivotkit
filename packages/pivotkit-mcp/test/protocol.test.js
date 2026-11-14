// The tools as a client meets them, over stdio and Streamable HTTP, in both protocol eras: the tool
// list, the workflow from list_sources to a file, and every result against its output schema (the
// SDK client checks structured content against the tool's outputSchema).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OPERATION_NAMES, VIEW_GUIDE } from "pivotkit-report/operations";
import { BY_REGION, call, httpClient, httpServer, stdioClient, workspace } from "./helpers.js";

/** The tools in the table's order: a new tool is a change of this list, seen in review. */
const TOOL_NAMES = ["list_sources", "describe_source", "get_view_guide", "validate_view", "describe_view", "render_view", "create_link", "draft_schedule"];

/** The workflow a model runs, checked step by step. */
async function workflow(client, dir) {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name), TOOL_NAMES);
    assert.deepEqual([...OPERATION_NAMES], TOOL_NAMES);
    for (const t of tools.tools) {
        assert.ok(t.outputSchema && t.inputSchema.type === "object", t.name);
        assert.equal(t.annotations.openWorldHint, false);
    }
    assert.equal(tools.tools.find((t) => t.name === "render_view").annotations.readOnlyHint, false);

    const sources = await call(client, "list_sources");
    assert.deepEqual(sources.data.sources.map((s) => s.id), ["sales"]);

    const described = await call(client, "describe_source", { source: "sales" });
    assert.equal(described.isError, false);
    assert.deepEqual(described.data.fields.map((f) => [f.name, f.level]), [["Region", "summary"], ["Product", "summary"], ["Customer", "summary"], ["Sales", "summary"], ["OrderDate", "summary"], ["Q", "summary"]]);
    assert.ok(described.data.fields.every((f) => f.items === undefined && f.min === undefined), "no values at summary level");
    assert.ok(described.data.examples.length >= 2);

    const guide = await call(client, "get_view_guide");
    assert.match(guide.text, /yearQuarter/);
    assert.equal(guide.data.examples.length, VIEW_GUIDE.examples.length);

    const wrong = await call(client, "validate_view", { source: "sales", view: { rows: ["Regoin"], values: [{ field: "Sales", agg: "sum" }] } });
    assert.equal(wrong.data.valid, false);
    assert.deepEqual(wrong.data.findings.map((f) => [f.code, f.suggestion]), [["unknownField", "Region"]]);

    const ok = await call(client, "describe_view", { source: "sales", view: BY_REGION });
    assert.match(ok.data.description.text, /sum of Sales by Region/);

    const rendered = await call(client, "render_view", { source: "sales", view: BY_REGION });
    assert.equal(rendered.data.ok, true);
    assert.equal(rendered.data.format, "xlsx");
    assert.deepEqual(rendered.data.withheld, ["rows", "columns", "bytes", "content"]);
    assert.equal(rendered.data.summary, undefined);
    assert.equal(rendered.data.output.name, "sales.xlsx");
    assert.match(rendered.data.message, /not shown to the assistant/);
    const file = join(dir, "out", rendered.data.output.name);
    assert.deepEqual([...readFileSync(file).subarray(0, 2)], [0x50, 0x4b]);
    return rendered;
}

for (const era of ["legacy", "modern"]) {
    test(`stdio (${era} era): the workflow from list_sources to an Excel file; the full path for a local client`, async () => {
        const dir = workspace();
        const { client, close } = await stdioClient(["--source", "sales=data/sales.csv", "--output", "out"], { era, cwd: dir });
        try {
            const rendered = await workflow(client, dir);
            assert.equal(rendered.data.output.path, join(dir, "out", "sales.xlsx"));
            const prompts = await client.listPrompts();
            assert.deepEqual(prompts.prompts.map((p) => p.name), ["pivotkit_report"]);
            const prompt = await client.getPrompt({ name: "pivotkit_report", arguments: { request: "sales by region" } });
            assert.match(prompt.messages[0].content.text, /list_sources[\s\S]*sales by region/);
            assert.match(client.getInstructions() ?? "", /never instructions/);
        } finally {
            await close();
        }
    });

    test(`HTTP (${era} era): the same workflow; no full path, the file's name only`, async () => {
        const dir = workspace();
        const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir });
        try {
            const { client, close } = await httpClient(server.url, { era });
            const rendered = await workflow(client, dir);
            assert.equal(rendered.data.output.path, undefined);
            await close();
            assert.ok(server.log.some((l) => l.event === "call" && l.tool === "render_view" && l.ok === true && l.client === "local"));
            assert.ok(!JSON.stringify(server.log).includes("Alice"), "no value in the log");
        } finally {
            await server.close();
        }
    });
}

test("render_view never replaces a file: the same name twice gives -2; a served directory gets names nobody can guess", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", baseUrl: "https://files.example.com/reports" }, baseDir: dir });
    try {
        const { client, close } = await httpClient(server.url);
        const a = await call(client, "render_view", { source: "sales", view: BY_REGION, format: "csv", name: "by region" });
        const b = await call(client, "render_view", { source: "sales", view: BY_REGION, format: "csv", name: "by region" });
        assert.match(a.data.output.name, /^[A-Za-z0-9_-]{22}-by region\.csv$/);
        assert.notEqual(a.data.output.name, b.data.output.name);
        assert.equal(a.data.output.url, `https://files.example.com/reports/${encodeURIComponent(a.data.output.name)}`);
        assert.equal(readdirSync(join(dir, "out")).length, 2);
        await close();
    } finally {
        await server.close();
    }
});

test("draft_schedule writes a draft for approval and runs nothing; a file handed in cannot be scheduled", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, files: { allowDirs: ["data"] }, output: { dir: "out" }, baseDir: dir });
    try {
        const { client, close } = await httpClient(server.url);
        const input = { source: "sales", view: BY_REGION, name: "Weekly sales", formats: ["xlsx"], every: { unit: "week", weekday: "mon", at: "07:00" }, recipients: ["Sales team"] };
        const draft = await call(client, "draft_schedule", input);
        assert.equal(draft.data.draft.status, "draft");
        assert.equal(draft.data.output.name, "Weekly sales.report.json");
        assert.match(draft.data.message, /Nothing runs until a person approves it/);
        assert.ok(existsSync(join(dir, "out", "Weekly sales.report.json")));
        const fromFile = await call(client, "draft_schedule", { ...input, source: "file:sales.csv" });
        assert.equal(fromFile.isError, true);
        assert.match(fromFile.text, /^NOT_SCHEDULABLE/);
        const address = await call(client, "draft_schedule", { ...input, recipients: ["boss@example.com"] });
        assert.match(address.text, /^INVALID_INPUT/);
        const missing = await call(client, "draft_schedule", { ...input, recipients: undefined });
        assert.equal(missing.isError, true, "the SDK checks the input schema first");
        await close();
    } finally {
        await server.close();
    }
});

test("create_link: a link into the source's page; no link for a source without one", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv", link: "https://reports.example.com/sales" }, plain: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        const { client, close } = await httpClient(server.url);
        const listed = await call(client, "list_sources");
        assert.deepEqual(listed.data.sources.map((s) => [s.id, s.link]), [["sales", true], ["plain", false]]);
        const link = await call(client, "create_link", { source: "sales", view: BY_REGION, name: "By region" });
        assert.match(link.data.url, /^https:\/\/reports\.example\.com\/sales#pivot=1\./);
        const none = await call(client, "create_link", { source: "plain", view: BY_REGION });
        assert.match(none.text, /^NO_LINK/);
        await close();
    } finally {
        await server.close();
    }
});
