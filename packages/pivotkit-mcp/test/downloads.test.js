// pivotkit-server's download links on the MCP server's own HTTP listener (pivotkit-mcp --http):
// /downloads/ is answered after the Host check and before the MCP clients' Origin check and body cap;
// a tool result carries the link in its text and, for clients of 2025-06-18 or later, as a
// resource_link. Over stdio there is no link.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BY_REGION, ERAS, call, httpClient, httpServer, stdioClient, workspace } from "./helpers.js";

/** A raw request with any headers, its status, headers and body. */
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

/** sales: every field shown (open); closed: the default summary. */
const SOURCES = { sales: { file: "data/sales.csv", policy: { default: "show" } }, closed: { file: "data/sales.csv" } };

/** The /downloads/ part of a link on the listener's own address. */
const onServer = (server, url) => `${new URL(server.url).origin}${new URL(url).pathname}`;

for (const era of Object.keys(ERAS)) {
    test(`${era}: an open source's report on pivotkit-mcp --http: a link in the text and a resource_link with its size; the link sends the file`, async () => {
        const dir = workspace();
        const server = await httpServer({ sources: SOURCES, output: { dir: "out" }, baseDir: dir });
        try {
            const { client, close } = await httpClient(server.url, { era });
            const r = await call(client, "render_view", { source: "sales", view: BY_REGION, format: "csv", name: "Sales by region" });
            await close();
            const output = r.data.output;
            assert.equal(output.bound, "none");
            assert.equal(output.filename, "Sales by region.csv");
            assert.ok(output.url.startsWith(`${new URL(server.url).origin}/downloads/`), output.url);
            assert.match(r.raw.content[0].text, /Open the link in your browser; it works for 60 minutes\./);
            const link = r.raw.content[1];
            assert.deepEqual(link, { type: "resource_link", uri: output.url, name: "Sales by region.csv", title: "Sales by region", mimeType: "text/csv;charset=utf-8", size: readFileSync(join(dir, "out", output.name)).length, annotations: { audience: ["user"] } });
            const got = await fetch(output.url);
            assert.equal(got.status, 200);
            assert.deepEqual(Buffer.from(await got.arrayBuffer()), readFileSync(join(dir, "out", output.name)));
        } finally {
            await server.close();
        }
    });
}

test("a client that names no protocol revision of 2025-06-18 or later gets the link in the text only, no resource_link", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: SOURCES, output: { dir: "out" }, baseDir: dir });
    try {
        const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
        const body = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "render_view", arguments: { source: "sales", view: BY_REGION, format: "csv", name: "Old client" } } });
        for (const version of [undefined, "2025-03-26"]) {
            const r = await raw(server.url, { method: "POST", headers: { ...headers, ...(version ? { "mcp-protocol-version": version } : {}) }, body });
            assert.equal(r.status, 200, r.body);
            const json = JSON.parse(r.body.startsWith("{") ? r.body : /** @type {string} */ (r.body.split("\n").find((l) => l.startsWith("data: "))).slice(6));
            const content = json.result.content;
            assert.deepEqual(content.map((c) => c.type), ["text"], String(version));
            assert.match(content[0].text, /\/downloads\//);
        }
    } finally {
        await server.close();
    }
});

test("once on pivotkit-mcp --http: the page's POST reaches the link though its Origin is no MCP client's; a foreign Origin, a 2 KiB body and a foreign Host are refused", async () => {
    const dir = workspace();
    // results: true is REST's; MCP callers get bound links without it
    const server = await httpServer({ sources: SOURCES, output: { dir: "out", downloads: { bind: "once" } }, http: { allowOrigins: ["app.example.com"] }, baseDir: dir });
    try {
        const { client, close } = await httpClient(server.url);
        const r = await call(client, "render_view", { source: "closed", view: BY_REGION, format: "csv", name: "Once" });
        await close();
        assert.equal(r.data.output.bound, "once");
        assert.equal(r.raw.content[1].size, undefined);
        const url = r.data.output.url;
        const origin = new URL(server.url).origin;
        const page = await raw(url);
        assert.equal(page.status, 200);
        assert.match(page.body, /<form method="post">/);
        const foreign = await raw(url, { method: "POST", headers: { origin: "https://app.example.com" } });
        assert.equal(foreign.status, 403);
        assert.match(foreign.body, /must be started from its own page/);
        const big = await raw(url, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded", "content-length": "2048" }, body: "x".repeat(2048) });
        assert.equal(big.status, 413);
        const chunked = await raw(url, { method: "POST", headers: { origin, "transfer-encoding": "chunked" }, body: "x".repeat(4096) });
        assert.equal(chunked.status, 413);
        assert.equal((await raw(url, { headers: { host: "evil.example" } })).status, 403);
        // the page's own POST: the browser's Origin is the link's (not an MCP client's allowed origin)
        const sent = await raw(url, { method: "POST", headers: { origin } });
        assert.equal(sent.status, 200);
        assert.equal(sent.body, readFileSync(join(dir, "out", r.data.output.name), "utf8"));
        assert.equal((await raw(url, { method: "POST", headers: { origin } })).status, 409);
        // the log of the listener names the downloads, never the token
        const token = url.split("/downloads/")[1];
        assert.ok(server.log.some((l) => l.event === "download" && l.bound === "once" && l.ok === true));
        assert.ok(!JSON.stringify(server.log).includes(token));
    } finally {
        await server.close();
    }
});

test("draft_schedule over an open source: the draft is stored under the link's prefix and its link sends the JSON", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: SOURCES, output: { dir: "out" }, baseDir: dir });
    try {
        const { client, close } = await httpClient(server.url);
        const r = await call(client, "draft_schedule", { source: "sales", view: BY_REGION, name: "Weekly sales", formats: ["xlsx"], every: { unit: "week", weekday: "mon", at: "07:00" }, recipients: ["Sales team"] });
        await close();
        assert.match(r.data.output.name, /^[A-Za-z0-9_-]{22}-Weekly sales\.pivotkit-out\.report\.json$/);
        assert.equal(r.data.output.filename, "Weekly sales.report.json");
        assert.equal(r.data.output.bound, "none");
        const got = await fetch(onServer(server, r.data.output.url));
        assert.equal(got.status, 200);
        assert.equal(got.headers.get("content-type"), "application/json");
        assert.equal((await got.json()).status, "draft");
    } finally {
        await server.close();
    }
});

test("stdio: no HTTP server, so no link and no resource_link; the result names the file's path", async () => {
    const dir = workspace();
    const { client, close } = await stdioClient(["--source", "sales=data/sales.csv", "--output", "out"], { cwd: dir });
    try {
        const r = await call(client, "render_view", { source: "sales", view: BY_REGION, format: "csv", name: "Local" });
        assert.equal(r.data.output.url, undefined);
        assert.equal(r.data.output.bound, undefined);
        assert.equal(r.data.output.path, join(dir, "out", "Local.pivotkit-out.csv"));
        assert.deepEqual(r.raw.content.map((c) => c.type), ["text"]);
    } finally {
        await close();
    }
});
