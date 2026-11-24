// MCP and REST over one context give the same presented bodies: one table of calls, each run as an
// MCP tool (the SDK's client) and as a REST route, compared. Only the words for a model or a program
// (message) may differ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { BY_REGION, call, restServer, workspace } from "./helpers.js";

/** One call per operation: the MCP tool's arguments, the REST route and its body. */
const CALLS = [
    { tool: "list_sources", args: {}, route: "GET /sources" },
    { tool: "describe_source", args: { source: "sales" }, route: "GET /sources/sales" },
    { tool: "get_view_guide", args: {}, route: "GET /views/guide" },
    { tool: "suggest_view", args: { source: "open" }, route: "POST /views/suggest" },
    { tool: "suggest_view", args: { source: "sales", layout: { cols: ["OrderDate"] } }, route: "POST /views/suggest" },
    { tool: "validate_view", args: { source: "sales", layout: { rows: ["Region"], values: [{ field: "Sales" }] } }, route: "POST /views/validate" },
    { tool: "render_view", args: { source: "open", layout: { rows: ["Product"], values: [{ field: "Sales", agg: "average" }] }, format: "csv" }, route: "POST /views/render" },
    { tool: "validate_view", args: { source: "sales", view: { rows: ["Regoin"], values: [{ field: "Sales", agg: "sum" }] } }, route: "POST /views/validate" },
    { tool: "describe_view", args: { source: "sales", view: BY_REGION }, route: "POST /views/describe" },
    { tool: "render_view", args: { source: "sales", view: BY_REGION, format: "csv" }, route: "POST /views/render" },
    { tool: "render_view", args: { source: "open", view: BY_REGION, format: "csv" }, route: "POST /views/render" },
    { tool: "create_link", args: { source: "sales", view: BY_REGION }, route: "POST /views/link" },
    { tool: "describe_source", args: { source: "listed" }, route: "GET /sources/listed" },
    { tool: "validate_view", args: { source: "listed", view: { rows: ["Region"], filters: [{ field: "Region", type: "in", items: ["north", "Nort"], blanks: "exclude" }] } }, route: "POST /views/validate" },
    { tool: "render_view", args: { source: "listed", view: BY_REGION, format: "csv" }, route: "POST /views/render" },
    { tool: "draft_schedule", args: { source: "sales", view: BY_REGION, name: "Weekly", formats: ["csv"], every: { unit: "day", at: "06:00" }, recipients: ["Team"] }, route: "POST /schedules/draft" }
];

/**
 * What may differ: the words, the name a written file got (each call writes its own), and the
 * request id each answer names (results.test.js checks it).
 */
const comparable = (body) => JSON.parse(JSON.stringify({ ...body, requestId: undefined, message: undefined, output: body.output ? { ...body.output, name: undefined, filename: undefined, url: undefined, expiresAt: undefined } : body.output, draft: body.draft ? { ...body.draft, created: undefined } : body.draft }));

test("every operation: the MCP tool's structured content and the REST answer are the same", async () => {
    const dir = workspace();
    const server = await restServer(
        {
            sources: { sales: { file: "data/sales.csv", link: "https://reports.example.com/sales", policy: { fields: { Region: "show", Customer: "hide" } } }, open: { file: "data/sales.csv", policy: { default: "show" } }, listed: { file: "data/sales.csv", policy: { fields: { Region: "values", Customer: "hide" } } } },
            output: { dir: "out" },
            rest: { inline: true },
            // list_sources tells each surface what data it may send, in its own terms (sources.test.js):
            // with MCP's switched off, the two answer alike
            mcp: { data: false },
            baseDir: dir
        },
        { enable: ["rest", "mcp"] }
    );
    const client = new Client({ name: "conformance", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
    const seen = [];
    try {
        for (const c of CALLS) {
            const tool = await client.callTool({ name: c.tool, arguments: c.args });
            assert.ok(!tool.isError, `${c.tool}: ${JSON.stringify(tool.content).slice(0, 200)}`);
            const [method, path] = c.route.split(" ");
            const rest = await call(`${server.api}${path}`, method === "POST" ? { body: c.args } : {});
            assert.equal(rest.status, 200, `${c.route}: ${JSON.stringify(rest.data).slice(0, 200)}`);
            assert.deepEqual(comparable(rest.data), comparable(tool.structuredContent), `${c.tool} over ${c.route}`);
            seen.push({ call: c, body: rest.data });
        }
        // the values level answered alike, and as it should: the list, the findings, the content withheld
        const listed = seen.filter((s) => s.call.args.source === "listed").map((s) => s.body);
        assert.deepEqual(listed[0].fields.find((f) => f.name === "Region"), { ...listed[0].fields.find((f) => f.name === "Region"), level: "values", items: ["North", "South", "West"], complete: true });
        assert.deepEqual(listed[1].findings.map((f) => [f.code, f.field, f.suggestion]), [["itemCase", "Region", "North"], ["itemUnknown", "Region", "North"]]);
        assert.deepEqual(listed[2].withheld, ["rows", "columns", "bytes", "content"]);
    } finally {
        await client.close();
        await server.close();
    }
});
