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
        const body = `{"x":"${"a".repeat(2_200_000)}"}`;
        // the whole answer arrives: the server reads the rest of the body before it closes, no reset
        const res = await raw(server.url, { method: "POST", headers: POST, body });
        assert.equal(res.status, 413);
        // refused on its declared size, before a byte of the body is read: only that check names a size
        const refused = server.log.find((l) => l.event === "refused" && l.reason === "body_too_large");
        assert.ok(refused, JSON.stringify(server.log));
        assert.deepEqual([refused.limit, refused.size, res.headers["x-request-id"]], [2_097_152, Buffer.byteLength(body), refused.requestId]);
    } finally {
        await server.close();
    }
});

test("pivotkit-mcp's own server: a body that is not JSON and an unsupported protocol version each get one refused line under the answer's X-Request-Id", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        const broken = await raw(server.url, { method: "POST", headers: { ...POST, "mcp-protocol-version": "2025-06-18" }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"MKR-BROKEN"' });
        const version = await raw(server.url, { method: "POST", headers: { ...POST, "mcp-protocol-version": "1999-01-01" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) });
        for (const answer of [broken, version]) {
            assert.equal(answer.status, 400, answer.body);
            const mine = server.log.filter((l) => l.requestId === answer.headers["x-request-id"]);
            assert.deepEqual(mine.map((l) => [l.event, l.level, l.status, l.reason, l.path]), [["refused", "warn", 400, "bad_request", "/mcp"]], JSON.stringify(mine));
        }
        assert.ok(!JSON.stringify(server.log).includes("MKR-BROKEN"), "the body is not logged");
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
    // the one token of $PIVOTKIT_MCP_TOKEN has no name of its own: the message names the variable only
    await assert.rejects(listen({ http: { port: 0 }, auth: { mode: "token" } }, { ...quiet, env: { PIVOTKIT_MCP_TOKEN: "short" } }), /^ConfigError: auth: the token \(\$PIVOTKIT_MCP_TOKEN\) is missing or shorter/);
    // a named token of auth.tokens is named
    await assert.rejects(listen({ http: { port: 0 }, auth: { mode: "token", tokens: [{ name: "analysts", env: "T_ANALYSTS" }] } }, quiet), /the token "analysts" \(\$T_ANALYSTS\) is missing/);
    await assert.rejects(listen({ http: { port: 0, hots: "x" } }, quiet), /unknown key "hots"; did you mean "host"\?/);
});

test("a Host the server does not answer to: JSON-RPC on /mcp, problem+json elsewhere, both with the hint", async () => {
    const dir = workspace();
    const server = await listen({ sources: { sales: { file: "data/sales.csv" } }, http: { port: 0 }, baseDir: dir, log: "off" }, { env: {}, stderr: { write() {} } });
    const said = "Invalid Host: evil.example; add the name with http.allowHosts or --allow-host, or set http.publicUrl";
    try {
        const ask = (path, init = {}) =>
            new Promise((resolve, reject) => {
                const u = new URL(path, server.url);
                const req = httpRequest({ host: u.hostname, port: u.port, path: u.pathname, method: init.method ?? "GET", headers: { host: "evil.example", ...(init.headers ?? {}) } }, (res) => {
                    let text = "";
                    res.on("data", (c) => (text += c));
                    res.on("end", () => resolve({ status: res.statusCode, type: String(res.headers["content-type"]), data: JSON.parse(text) }));
                });
                req.on("error", reject);
                req.end(init.body);
            });
        for (const path of ["/", "/healthz", "/.well-known/oauth-protected-resource/mcp"]) {
            const res = await ask(path);
            assert.equal(res.status, 403, path);
            assert.match(res.type, /^application\/problem\+json/, path);
            assert.deepEqual([res.data.code, res.data.detail], ["FORBIDDEN_HOST", said], path);
        }
        const mcp = await ask("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
        assert.equal(mcp.status, 403);
        assert.deepEqual(mcp.data, { jsonrpc: "2.0", error: { code: -32000, message: said }, id: null });
    } finally {
        await server.close();
    }
});
