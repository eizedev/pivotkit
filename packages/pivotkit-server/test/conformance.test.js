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
    { tool: "validate_view", args: { source: "sales", view: { rows: ["Regoin"], values: [{ field: "Sales", agg: "sum" }] } }, route: "POST /views/validate" },
    { tool: "describe_view", args: { source: "sales", view: BY_REGION }, route: "POST /views/describe" },
    { tool: "render_view", args: { source: "sales", view: BY_REGION, format: "csv" }, route: "POST /views/render" },
    { tool: "render_view", args: { source: "open", view: BY_REGION, format: "csv" }, route: "POST /views/render" },
    { tool: "create_link", args: { source: "sales", view: BY_REGION }, route: "POST /views/link" },
    { tool: "draft_schedule", args: { source: "sales", view: BY_REGION, name: "Weekly", formats: ["csv"], every: { unit: "day", at: "06:00" }, recipients: ["Team"] }, route: "POST /schedules/draft" }
];

/** What may differ: the words, and the name a written file got (each call writes its own). */
const comparable = (body) => JSON.parse(JSON.stringify({ ...body, message: undefined, output: body.output ? { ...body.output, name: undefined, url: undefined } : body.output, draft: body.draft ? { ...body.draft, created: undefined } : body.draft }));

test("every operation: the MCP tool's structured content and the REST answer are the same", async () => {
    const dir = workspace();
    const server = await restServer(
        {
            sources: { sales: { file: "data/sales.csv", link: "https://reports.example.com/sales", policy: { fields: { Region: "show", Customer: "hide" } } }, open: { file: "data/sales.csv", policy: { default: "show" } } },
            output: { dir: "out" },
            rest: { inline: true },
            baseDir: dir
        },
        { enable: ["rest", "mcp"] }
    );
    const client = new Client({ name: "conformance", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
    try {
        for (const c of CALLS) {
            const tool = await client.callTool({ name: c.tool, arguments: c.args });
            assert.ok(!tool.isError, `${c.tool}: ${JSON.stringify(tool.content).slice(0, 200)}`);
            const [method, path] = c.route.split(" ");
            const rest = await call(`${server.api}${path}`, method === "POST" ? { body: c.args } : {});
            assert.equal(rest.status, 200, `${c.route}: ${JSON.stringify(rest.data).slice(0, 200)}`);
            assert.deepEqual(comparable(rest.data), comparable(tool.structuredContent), `${c.tool} over ${c.route}`);
        }
    } finally {
        await client.close();
        await server.close();
    }
});
