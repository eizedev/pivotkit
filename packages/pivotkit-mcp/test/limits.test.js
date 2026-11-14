// The MCP endpoint's request limits, as the REST service has them (mcp.rateLimit, mcp.concurrency):
// a token bucket per caller, refused tokens per address, requests of one caller at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { httpServer, workspace } from "./helpers.js";

/** A raw request, its status, headers and body. */
function raw(url, { method = "GET", headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = httpRequest(url, { method, headers }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
        });
        req.on("error", reject);
        req.end(body);
    });
}

const TOKEN = "a-test-token-that-is-long-enough-0123456789";
const OTHER = "another-test-token-long-enough-9876543210";
const LIST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
const POST = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
const as = (token) => ({ ...POST, authorization: `Bearer ${token}` });

/** Two named tokens, so each has its own bucket. */
const TOKENS = { auth: { mode: "token", tokens: [{ name: "a", env: "A" }, { name: "b", env: "B" }] } };
const ENV = { env: { A: TOKEN, B: OTHER } };

test("mcp.rateLimit: a caller over its burst gets 429 with Retry-After; another caller is not slowed", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, ...TOKENS, mcp: { rateLimit: { perMinute: 6, burst: 2 } }, baseDir: dir }, ENV);
    try {
        assert.equal((await raw(server.url, { method: "POST", headers: as(TOKEN), body: LIST })).status, 200);
        assert.equal((await raw(server.url, { method: "POST", headers: as(TOKEN), body: LIST })).status, 200);
        const over = await raw(server.url, { method: "POST", headers: as(TOKEN), body: LIST });
        assert.equal(over.status, 429, over.body);
        assert.ok(Number(over.headers["retry-after"]) >= 1);
        assert.match(JSON.parse(over.body).error.message, /too many requests/);
        assert.equal((await raw(server.url, { method: "POST", headers: as(OTHER), body: LIST })).status, 200, "another token has its own bucket");
    } finally {
        await server.close();
    }
});

test("mcp.rateLimit.failedAuthPerMinute: an address that keeps sending wrong tokens is told to wait; a right token still passes", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, ...TOKENS, mcp: { rateLimit: { failedAuthPerMinute: 3 } }, baseDir: dir }, ENV);
    try {
        for (let i = 0; i < 3; i++) {
            assert.equal((await raw(server.url, { method: "POST", headers: as(`${TOKEN}x`), body: LIST })).status, 401);
        }
        const blocked = await raw(server.url, { method: "POST", headers: as(`${TOKEN}x`), body: LIST });
        assert.equal(blocked.status, 429, blocked.body);
        assert.ok(Number(blocked.headers["retry-after"]) >= 1);
        assert.equal((await raw(server.url, { method: "POST", headers: as(TOKEN), body: LIST })).status, 200);
    } finally {
        await server.close();
    }
});

test("mcp.concurrency: a finished request gives its slot back, also when the answer is a stream", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, ...TOKENS, mcp: { concurrency: 1, rateLimit: { perMinute: 600, burst: 50 } }, baseDir: dir }, ENV);
    try {
        for (let i = 0; i < 6; i++) {
            const accept = i % 2 ? "text/event-stream, application/json" : "application/json, text/event-stream";
            const res = await raw(server.url, { method: "POST", headers: { ...as(TOKEN), accept }, body: LIST });
            assert.equal(res.status, 200, `request ${i}: ${res.body.slice(0, 200)}`);
        }
    } finally {
        await server.close();
    }
});
