// Data sent in the request through the SDK's client: the tools offer `data` (the words a model reads
// say the rows are its own, not the operator's), a table at the cap passes the SDK's count of input
// elements and pivotkit's cap, one over the cap gets pivotkit's message, a far larger one the SDK's;
// over stdio the same; mcp.data: false leaves `data` out of every tool.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BY_REGION, call, httpClient, httpServer, stdioClient, workspace } from "./helpers.js";

/** A table of n rows and w columns. */
const tableOf = (n, w = 2) => ({ columns: Array.from({ length: w }, (_, i) => (i === 0 ? "Region" : `Sales ${i}`)), rows: Array.from({ length: n }, (_, r) => Array.from({ length: w }, (_, c) => (c === 0 ? ["North", "South"][r % 2] : r + c))), rowCount: n });

test("MCP over HTTP: data offered and described; the cap answers in pivotkit's words up to the SDK's element count", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir });
    const { client, close } = await httpClient(server.url);
    try {
        const tools = (await client.listTools()).tools;
        const render = tools.find((t) => t.name === "render_view");
        assert.deepEqual(render.inputSchema.properties.data.required, ["columns", "rows", "rowCount"]);
        assert.match(render.inputSchema.properties.data.description, /not the operator's data and the operator's exposure policy does not apply to them/);
        assert.equal(tools.find((t) => t.name === "get_view_guide").inputSchema.properties?.data, undefined);
        const listed = await call(client, "list_sources");
        assert.deepEqual(listed.data.data, { rows: 500, cells: 5000, bytes: 262_144 });
        // at the cap: 500 rows x 10 columns, about 5,500 elements as the SDK counts them
        const at = await call(client, "render_view", { source: "inline:", data: tableOf(500, 10), view: { rows: ["Region"], values: [{ field: "Sales 1", agg: "sum" }] }, format: "csv" });
        assert.equal(at.isError, false, at.text);
        assert.equal(at.data.summary.sourceRows, 500);
        // over it, under the SDK's 10,000 elements: pivotkit's message with the cap
        const over = await call(client, "describe_source", { source: "inline:", data: tableOf(600, 10) });
        assert.equal(over.isError, true);
        assert.match(over.text, /^LIMIT_EXCEEDED: you sent 600 rows \(6000 cells\): the limit is 500 rows \/ 5000 cells \/ 256 KiB/);
        // far over it: the SDK refuses the call before pivotkit sees it
        const far = await client.callTool({ name: "describe_source", arguments: { source: "inline:", data: tableOf(2000, 10) } }).catch((e) => e);
        assert.match(String(far?.message ?? JSON.stringify(far)), /more than the maximum of 10000 elements/);
        const mismatch = await call(client, "describe_source", { source: "inline:", data: { ...tableOf(3), rowCount: 4 } });
        assert.match(mismatch.text, /^DATA_MISMATCH: you sent 3 rows but rowCount says 4: send the whole table/);
        const link = await call(client, "create_link", { source: "inline:", data: tableOf(3), view: BY_REGION });
        assert.match(link.text, /^NO_LINK: data sent in the request cannot be linked/);
        const line = server.log.find((l) => l.tool === "render_view" && l.source === "inline:");
        assert.deepEqual([line.rows, line.columns, line.ok], [500, 10, true]);
        assert.doesNotMatch(JSON.stringify(server.log), /North/);
    } finally {
        await close();
        await server.close();
    }
});

test("MCP over stdio: the same table works; mcp.data: false leaves data out of every tool", async () => {
    const dir = workspace();
    const { client, close } = await stdioClient(["--source", "sales=data/sales.csv", "--output", "out"], { cwd: dir });
    try {
        const described = await call(client, "describe_source", { source: "inline:", data: { name: "Mine", columns: ["Region", "Sales"], rows: [["North", 1], ["South", 2]], rowCount: 2 } });
        assert.equal(described.isError, false, described.text);
        assert.equal(described.data.rows, 2);
    } finally {
        await close();
    }
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, mcp: { data: false }, baseDir: dir });
    const off = await httpClient(server.url);
    try {
        for (const tool of (await off.client.listTools()).tools) {
            assert.equal(tool.inputSchema.properties?.data, undefined, tool.name);
        }
        const refused = await call(off.client, "describe_source", { source: "inline:" });
        assert.match(refused.text, /^NOT_ALLOWED: this server takes no data sent in the request/);
    } finally {
        await off.close();
        await server.close();
    }
});
