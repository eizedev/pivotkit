// The HTTP transport's checks before a request reaches a tool: Host (DNS rebinding), Origin, the
// static token, the body size, the browser's quick-start page; and the refusals at start.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { listen } from "pivotkit-mcp";
import { BY_REGION, call, httpClient, httpServer, workspace } from "./helpers.js";

/** A raw request with any headers (Host too), its status, headers and body. */
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

const INIT = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
const POST = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const TOKEN = "a-test-token-that-is-long-enough-0123456789";

test("Host and Origin: a foreign Host (DNS rebinding) and a foreign Origin are refused with 403; an allowed one passes", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, http: { allowOrigins: ["app.example.com"] }, baseDir: dir });
    try {
        assert.equal((await raw(server.url, { method: "POST", headers: { ...POST, host: "evil.example" }, body: INIT })).status, 403);
        assert.equal((await raw(server.url, { method: "POST", headers: { ...POST, origin: "https://evil.example" }, body: INIT })).status, 403);
        assert.equal((await raw(server.url, { method: "POST", headers: { ...POST, origin: "null" }, body: INIT })).status, 403);
        assert.equal((await raw(server.url, { method: "POST", headers: { ...POST, origin: "https://app.example.com" }, body: INIT })).status, 200);
        assert.equal((await raw(server.url, { method: "POST", headers: POST, body: INIT })).status, 200);
        assert.ok(server.log.some((l) => l.event === "refused" && l.host === "evil.example"));
    } finally {
        await server.close();
    }
});

test("a browser that opens /mcp is sent to the quick-start page; the page has the endpoint and configs, a strict CSP and no path", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv", title: "Sales <b>2026</b>" } }, baseDir: dir });
    try {
        const redirect = await raw(server.url, { headers: { accept: "text/html,application/xhtml+xml" } });
        assert.deepEqual([redirect.status, redirect.headers.location], [302, "/"]);
        const page = await raw(server.url.replace("/mcp", "/"));
        assert.equal(page.status, 200);
        assert.match(page.headers["content-security-policy"], /default-src 'none'/);
        assert.equal(page.headers["x-content-type-options"], "nosniff");
        assert.ok(page.body.includes(`claude mcp add --transport http pivotkit ${server.url}`));
        assert.ok(page.body.includes("Sales &lt;b&gt;2026&lt;/b&gt;"));
        assert.ok(!page.body.includes(dir) && !page.body.includes("sales.csv"), "no path, no file name");
        assert.doesNotMatch(page.body, /<script|https?:\/\/(?!pivotkit\.eize\.dev|127\.0\.0\.1)[a-z]/i);
        // an MCP client's GET is no browser: the SDK answers it (no GET stream without sessions)
        assert.equal((await raw(server.url, { headers: { accept: "text/event-stream" } })).status, 405);
        assert.deepEqual(JSON.parse((await raw(server.url.replace("/mcp", "/healthz"))).body), { ok: true });
        assert.equal((await raw(server.url.replace("/mcp", "/other"))).status, 404);
    } finally {
        await server.close();
    }
});

test("a body over 2 MiB is refused with 413 before it is parsed", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        const res = await raw(server.url, { method: "POST", headers: POST, body: `{"x":"${"a".repeat(2_200_000)}"}` });
        assert.equal(res.status, 413);
    } finally {
        await server.close();
    }
});

test("token: no token, a wrong one, one in the address, two headers: 401; the right one works; the page lists no source", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, baseDir: dir }, { env: { PIVOTKIT_MCP_TOKEN: TOKEN } });
    try {
        const none = await raw(server.url, { method: "POST", headers: POST, body: INIT });
        assert.equal(none.status, 401);
        assert.match(none.headers["www-authenticate"], /^Bearer realm="pivotkit-mcp"/);
        assert.equal((await raw(server.url, { method: "POST", headers: { ...POST, authorization: `Bearer ${TOKEN}x` }, body: INIT })).status, 401);
        assert.equal((await raw(`${server.url}?access_token=${TOKEN}`, { method: "POST", headers: { ...POST, authorization: `Bearer ${TOKEN}` }, body: INIT })).status, 401);
        assert.equal((await raw(server.url, { method: "POST", headers: { ...POST, authorization: `Basic ${TOKEN}` }, body: INIT })).status, 401);
        assert.equal((await raw(server.url, { method: "POST", headers: { ...POST, authorization: `bearer ${TOKEN}` }, body: INIT })).status, 200, "the scheme in any case");
        const { client, close } = await httpClient(server.url, { token: TOKEN });
        assert.equal((await call(client, "describe_source", { source: "sales" })).isError, false);
        await close();
        const page = await raw(server.url.replace("/mcp", "/"));
        assert.ok(!page.body.includes("<code>sales</code>"), "the page is not behind the token: no source names");
        assert.ok(page.body.includes("Bearer &lt;token&gt;"));
        assert.ok(!JSON.stringify(server.log).includes(TOKEN), "the token is never logged");
    } finally {
        await server.close();
    }
});

test("named tokens with scopes: a source and a tool need their scopes; one without them does not see the source", async () => {
    const dir = workspace();
    const options = {
        sources: { sales: { file: "data/sales.csv" }, hr: { file: "data/sales.csv", scopes: ["hr"] } },
        output: { dir: "out" },
        auth: { mode: "token", tokens: [{ name: "analyst", env: "T1", scopes: ["hr"] }, { name: "viewer", env: "T2", scopes: [] }], toolScopes: { render_view: ["render"] } },
        baseDir: dir
    };
    const server = await httpServer(options, { env: { T1: `${TOKEN}1`, T2: `${TOKEN}2` } });
    try {
        const viewer = await httpClient(server.url, { token: `${TOKEN}2` });
        assert.deepEqual((await call(viewer.client, "list_sources")).data.sources.map((s) => s.id), ["sales"]);
        assert.match((await call(viewer.client, "describe_source", { source: "hr" })).text, /^SOURCE_NOT_FOUND: no source "hr"/);
        assert.match((await call(viewer.client, "render_view", { source: "sales", view: BY_REGION })).text, /^NOT_ALLOWED/);
        await viewer.close();
        const analyst = await httpClient(server.url, { token: `${TOKEN}1` });
        assert.deepEqual((await call(analyst.client, "list_sources")).data.sources.map((s) => s.id), ["sales", "hr"]);
        // many requests at once, one server per request from a shared context: no caller sees another's sources
        const again = await httpClient(server.url, { token: `${TOKEN}2` });
        const lists = await Promise.all(Array.from({ length: 30 }, (_, i) => call((i % 2 ? analyst : again).client, "list_sources").then((r) => [i % 2, r.data.sources.length])));
        assert.ok(lists.every(([analystCall, n]) => n === (analystCall ? 2 : 1)));
        await again.close();
        await analyst.close();
        assert.ok(server.log.some((l) => l.event === "call" && l.client === "viewer"));
    } finally {
        await server.close();
    }
});

test("refusals at start: no auth on another address than loopback, a short token, an unknown key", async () => {
    const quiet = { env: {}, stderr: { write() {} } };
    await assert.rejects(listen({ http: { host: "0.0.0.0", port: 0 } }, quiet), /needs --auth token or oauth/);
    await assert.rejects(listen({ http: { port: 0 }, auth: { mode: "token" } }, { ...quiet, env: { PIVOTKIT_MCP_TOKEN: "short" } }), /shorter than 32 characters/);
    await assert.rejects(listen({ http: { port: 0, hots: "x" } }, quiet), /unknown key "hots"; did you mean "host"\?/);
});
