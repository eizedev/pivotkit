// What the MCP server's log keeps of a caller's input: a configured source id, "inline:" or "file:",
// never the model's own text for `source`; and a request the protocol layer refuses is logged by its
// error's class at warn level, its message (which can quote the body) only at debug.
import { test } from "node:test";
import assert from "node:assert/strict";
import { httpClient, httpServer, call, workspace } from "./helpers.js";

const BY_REGION = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };

test("the log names a configured source, file: without its name, and anything else as unknown, never the model's text", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, files: { allowDirs: ["data"] }, baseDir: dir });
    const { client, close } = await httpClient(server.url);
    try {
        await call(client, "validate_view", { source: "sales", view: BY_REGION });
        await call(client, "describe_source", { source: "Jane Doe salary 91000" });
        await call(client, "describe_source", { source: "file:sales.csv" });
        await call(client, "describe_source", { source: "file:Jane Doe salary.csv" });
        const sources = server.log.filter((l) => l.event === "call").map((l) => l.source);
        assert.deepEqual(sources, ["sales", "unknown", "file:", "file:"]);
        assert.doesNotMatch(JSON.stringify(server.log), /Jane Doe/);
    } finally {
        await close();
        await server.close();
    }
});

test("a request the protocol layer refuses: the warning names the error's class, never its message (which quotes the body)", async () => {
    const dir = workspace();
    // a 2026-07-28 request whose Mcp-Name header and body disagree: the SDK's message quotes the body's params.name
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" } };
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "Jane Doe 91000", arguments: {}, _meta: meta } });
    const send = (server) => fetch(server.url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": "render_view" }, body });
    const info = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        assert.equal((await send(info)).status, 400);
        const warning = info.log.find((l) => l.event === "warning" && /protocol layer/.test(l.message));
        assert.ok(warning, JSON.stringify(info.log));
        // the error's class and the SDK's fixed name for the refusal (lower-case letters and dashes only)
        assert.match(warning.message, /: Error \(name-header-mismatch\)$/);
        assert.doesNotMatch(JSON.stringify(info.log), /Jane Doe|91000/);
    } finally {
        await info.close();
    }
    // at debug the message is there for the operator who sets the server up
    const debug = await httpServer({ log: "debug", sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        assert.equal((await send(debug)).status, 400);
        assert.ok(debug.log.some((l) => l.event === "debug" && /protocol layer/.test(l.message) && /Jane Doe/.test(String(l.error))), JSON.stringify(debug.log));
    } finally {
        await debug.close();
    }
});
