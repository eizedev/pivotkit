// Branding on pivotkit-mcp's own HTTP server (listen(), without pivotkit-server serve): with
// branding.docsUrl null no answer names pivotkit's documentation site; the name, the icon and the
// operator's page (http.page.url) reach the routes this server answers itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { httpClient, httpServer, workspace } from "./helpers.js";

const TOKEN = "a-test-token-that-is-long-enough-0123456789";

/** A 1x1 PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** A text with the values of `$schema` keys taken out, also inside JSON written as a string (a tool's text). */
const withoutSchemas = (text) => text.replace(/\\?"\$schema\\?"\s*:\s*\\?"[^"\\]*\\?"/g, '"$schema":"(taken out)"');

/** A GET with any Host header: status, headers and body as text. */
function rawGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = httpRequest({ host: u.hostname, port: u.port, path: u.pathname, headers, agent: false }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(`${res.statusCode}\n${JSON.stringify(res.headers)}\n\n${Buffer.concat(chunks).toString("latin1")}`));
        });
        req.on("error", reject);
        req.end();
    });
}

test("listen with docsUrl null: the page, the icon, refusals, the protocol and the tools name no documentation site", async () => {
    const dir = workspace();
    writeFileSync(join(dir, "icon.png"), PNG);
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, output: { dir: "out" }, auth: { mode: "token", tokens: [{ name: "t", env: "T" }] }, branding: { name: "Team Reports", docsUrl: null, icon: "icon.png" }, baseDir: dir }, { env: { T: TOKEN } });
    const root = server.url.replace(/\/mcp$/, "");
    try {
        /** @type {Array<[string, string]>} */
        const answers = [];
        const ask = async (what, url, init = {}) => {
            const r = await fetch(url, { redirect: "manual", ...init });
            answers.push([what, `${r.status}\n${[...r.headers].map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${await r.text()}`]);
            return answers.at(-1)[1];
        };
        const page = await ask("GET /", `${root}/`, { headers: { accept: "text/html" } });
        await ask("GET /icon.png", `${root}/icon.png`);
        await ask("GET /no-such-route", `${root}/no-such-route`);
        await ask("POST /mcp without a token", server.url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
        await ask("unknown download link", `${root}/downloads/no-such-link`, { headers: { accept: "application/json" } });
        answers.push(["refused Host on /", await rawGet(`${root}/`, { host: "evil.example", accept: "application/json" })]);
        const { client, close } = await httpClient(server.url, { token: TOKEN });
        try {
            const info = client.getServerVersion();
            assert.equal(info?.title, "Team Reports");
            assert.deepEqual(info?.icons, [{ src: `data:image/png;base64,${PNG.toString("base64")}`, mimeType: "image/png", sizes: ["1x1"] }]);
            answers.push(["initialize", JSON.stringify({ info, instructions: client.getInstructions() })]);
            answers.push(["tools/list", JSON.stringify(await client.listTools())]);
            for (const [name, args] of [
                ["get_view_guide", {}],
                ["suggest_view", { source: "sales" }],
                ["describe_source", { source: "salse" }]
            ]) {
                answers.push([name, JSON.stringify(await client.callTool({ name, arguments: args }))]);
            }
        } finally {
            await close();
        }
        const naming = answers.filter(([, text]) => withoutSchemas(text).includes("pivotkit.eize.dev")).map(([what]) => what);
        assert.deepEqual(naming, []);
        assert.match(page, /<title>Team Reports MCP server<\/title>/);
        assert.match(page, /content-security-policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:;/);
        assert.doesNotMatch(page, /<h2>Documentation<\/h2>/);
    } finally {
        await server.close();
    }
});

test("listen with http.page.url: / and a browser's /mcp go to the operator's page", async () => {
    const dir = workspace();
    const target = "https://intranet.example/pivot-reports";
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, http: { page: { url: target } }, baseDir: dir });
    const root = server.url.replace(/\/mcp$/, "");
    try {
        for (const url of [`${root}/`, server.url]) {
            const r = await fetch(url, { redirect: "manual", headers: { accept: "text/html" } });
            assert.equal(r.status, 302, url);
            assert.equal(r.headers.get("location"), target);
        }
        assert.equal((await fetch(`${root}/icon.png`)).status, 404, "no icon without branding.icon");
    } finally {
        await server.close();
    }
});

test("the page escapes the icon's address like every other value", async () => {
    const { quickStartPage } = await import("../src/page.js");
    const branding = { name: "Reports", slug: "reports", docs: null, icon: { src: 'data:image/png;base64,AA"><script>x&y', width: 1, height: 1 } };
    const page = quickStartPage({ endpoint: "http://127.0.0.1:3333/mcp", version: "0.0.0", auth: "none", issuer: null, sources: null, branding: /** @type {any} */ (branding) });
    assert.ok(page.includes('<link rel="icon" type="image/png" href="data:image/png;base64,AA&quot;&gt;&lt;script&gt;x&amp;y">'), page.slice(0, 400));
    assert.ok(!page.includes("<script>"));
});
