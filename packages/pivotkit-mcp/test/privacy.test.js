// What the MCP server's log keeps of a caller's input: a configured source id, "inline:" or "file:",
// never the model's own text for `source`; and a request the protocol layer refuses is one refused
// line with its status and its error's class, its message (which can quote the body) only at debug.
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

test("a request the protocol layer refuses: one refused line with its status, the error's class and the SDK's name for it, never its message (which quotes the body) but at debug", async () => {
    const dir = workspace();
    // a 2026-07-28 request whose Mcp-Name header and body disagree: the SDK's message quotes the body's params.name
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" } };
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "Jane Doe 91000", arguments: {}, _meta: meta } });
    const send = (server) => fetch(server.url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/call", "mcp-name": "render_view" }, body });
    const info = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        const answer = await send(info);
        assert.equal(answer.status, 400);
        const mine = info.log.filter((l) => l.requestId === answer.headers.get("x-request-id"));
        // the error's class and the SDK's fixed name for the refusal (lower-case letters and dashes only)
        assert.deepEqual(mine.map((l) => [l.event, l.level, l.status, l.reason, l.path, l.error, l.refusal]), [["refused", "warn", 400, "bad_request", "/mcp", "Error", "name-header-mismatch"]], JSON.stringify(info.log));
        assert.doesNotMatch(JSON.stringify(info.log), /Jane Doe|91000/);
    } finally {
        await info.close();
    }
    // at debug the message is on the same line, for the operator who sets the server up
    const debug = await httpServer({ log: "debug", sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        const answer = await send(debug);
        assert.equal(answer.status, 400);
        const mine = debug.log.filter((l) => l.requestId === answer.headers.get("x-request-id"));
        assert.equal(mine.length, 1, JSON.stringify(mine));
        assert.match(String(mine[0].detail), /Jane Doe/);
    } finally {
        await debug.close();
    }
});
