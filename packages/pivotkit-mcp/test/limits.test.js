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
        // the log says what the client was answered
        const refused = server.log.filter((l) => l.event === "refused").map((l) => l.status);
        assert.deepEqual(refused, [401, 401, 401, 429]);
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

/** A code source whose load waits until `release()`: a call over it holds its caller's slot. */
function slowSource() {
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    return { source: { load: async () => (await gate, [{ Region: "North", Sales: 1 }]) }, release: () => release() };
}

const DESCRIBE = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "describe_source", arguments: { source: "slow" } } });

/** A POST that is sent and then left: its socket is destroyed after `ms`. */
function leave(url, headers, body, ms) {
    return new Promise((resolve) => {
        const req = httpRequest(url, { method: "POST", headers });
        req.on("error", () => resolve(undefined));
        req.on("response", (res) => res.resume());
        req.end(body);
        setTimeout(() => {
            req.destroy();
            resolve(undefined);
        }, ms);
    });
}

for (const accept of ["application/json, text/event-stream", "text/event-stream, application/json"]) {
    test(`mcp.concurrency: a call holds its slot while it runs (${accept.split(",")[0]}); the next is told 429, then it is free again`, async () => {
        const slow = slowSource();
        const server = await httpServer({ sources: { slow: slow.source }, ...TOKENS, mcp: { concurrency: 1, rateLimit: { perMinute: 600, burst: 50 } } }, ENV);
        try {
            const running = raw(server.url, { method: "POST", headers: { ...as(TOKEN), accept }, body: DESCRIBE });
            await new Promise((r) => setTimeout(r, 200));
            const second = await raw(server.url, { method: "POST", headers: as(TOKEN), body: LIST });
            assert.equal(second.status, 429, second.body);
            assert.match(JSON.parse(second.body).error.message, /too many requests at once/);
            assert.equal(second.headers["retry-after"], "1");
            slow.release();
            assert.equal((await running).status, 200);
            assert.equal((await raw(server.url, { method: "POST", headers: as(TOKEN), body: LIST })).status, 200);
        } finally {
            slow.release();
            await server.close();
        }
    });
}

test("mcp.concurrency: a client that leaves gives its slot back; HEAD and other methods take none", async () => {
    const slow = slowSource();
    const server = await httpServer({ sources: { slow: slow.source }, ...TOKENS, mcp: { concurrency: 2, rateLimit: { perMinute: 600, burst: 50 } } }, ENV);
    try {
        // the answer streams: the client that leaves while the call runs gives its slot back at once
        await leave(server.url, { ...as(TOKEN), accept: "text/event-stream, application/json" }, DESCRIBE, 200);
        await leave(server.url, { ...as(TOKEN), accept: "text/event-stream, application/json" }, DESCRIBE, 200);
        await new Promise((r) => setTimeout(r, 100));
        assert.equal((await raw(server.url, { method: "POST", headers: as(TOKEN), body: LIST })).status, 200, "the slots of the two who left are free while their calls still run");
        slow.release();
        for (const method of ["HEAD", "HEAD", "GET", "DELETE", "PUT"]) {
            const res = await raw(server.url, { method, headers: as(TOKEN) });
            assert.equal(res.status, 405, method);
            assert.equal(res.headers.allow, "POST");
        }
        await new Promise((r) => setTimeout(r, 100));
        const both = await Promise.all([1, 2].map(() => raw(server.url, { method: "POST", headers: as(TOKEN), body: LIST })));
        assert.deepEqual(both.map((r) => r.status), [200, 200], "both slots are free");
    } finally {
        slow.release();
        await server.close();
    }
});
