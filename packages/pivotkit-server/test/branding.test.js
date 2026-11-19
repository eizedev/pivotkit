// Branding for intranet deployments (#608, #612): with branding.docsUrl null, no answer of the
// server names pivotkit's documentation site, on any route, errors included; branding.name puts the
// operator's name on what end users and clients see; http.page.url sends / elsewhere; branding.icon
// is the MCP icon and the page's favicon. The defaults stay pivotkit's.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { checkConfig, validateOptions } from "pivotkit-server";
import { REST_ROUTES } from "../src/rest/routes.js";
import { sourceFromOpenApiCommand } from "../src/openapi-source.js";
import { TOKEN, call, factsOf, raw, restServer, workspace } from "./helpers.js";

/** The documentation site pivotkit names by default. */
const SITE = "pivotkit.eize.dev";

/** A 1x1 PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const PUBLIC = "https://pk.example.com";
const MCP_RESOURCE = `${PUBLIC}/mcp`;
const REST_RESOURCE = `${PUBLIC}/api/v1`;
const SOURCES = { sales: { file: "data/sales.csv", title: "Sales", policy: { default: "show" } } };

let issuer;
let issuerServer;
let key;

before(async () => {
    key = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    issuerServer = (await import("node:http")).createServer((req, res) => {
        if (req.url === "/.well-known/openid-configuration") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] }));
        } else if (req.url === "/jwks") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ keys: [jwk] }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${issuerServer.address().port}`;
});
after(() => new Promise((resolve) => issuerServer.close(resolve)));

/** An access token of the test issuer for a resource. */
const jwt = (aud) => new SignJWT({ scope: "pivotkit", client_id: "report-bot" }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience(aud).setSubject("someone").setIssuedAt().setExpirationTime("5m").sign(key.privateKey);

/** Waits until the server has loaded the issuer (readyz). */
async function ready(server) {
    for (let i = 0; i < 100; i++) {
        if ((await call(`${server.url}/readyz`)).status === 200) {
            return;
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("not ready");
}

/** A workspace with the sales data, an icon and an empty out/. */
function brandedWorkspace() {
    const dir = workspace();
    writeFileSync(join(dir, "icon.png"), PNG);
    return dir;
}

/** Sends raw bytes and gives back what the server answers, until it closes or 1.5 s pass. */
function rawExchange(port, text) {
    return new Promise((resolve) => {
        let got = "";
        const socket = connect(port, "127.0.0.1", () => socket.write(text));
        socket.on("data", (c) => {
            got += c.toString("latin1");
        });
        const done = () => resolve(got);
        socket.on("close", done);
        socket.on("error", done);
        setTimeout(() => {
            socket.destroy();
            done();
        }, 1500).unref();
    });
}

/** A text with the values of `$schema` keys taken out, also inside JSON written as a string (an MCP tool's text). */
const withoutSchemas = (text) => text.replace(/\\?"\$schema\\?"\s*:\s*\\?"[^"\\]*\\?"/g, '"$schema":"(taken out)"');

/**
 * One answer as text: the status line, every header and the body, with the values of `$schema`
 * keys taken out (a view file's validation reference, which may name the site: #612's exception).
 * @param {Response} response
 */
async function answerText(response) {
    const headers = [...response.headers].map(([k, v]) => `${k}: ${v}`).join("\n");
    const body = Buffer.from(await response.arrayBuffer()).toString("latin1");
    return withoutSchemas(`${response.status}\n${headers}\n\n${body}`);
}

/**
 * Every route of a server with REST, MCP, OAuth and download links, errors included, as
 * [what was asked, the answer's text] pairs.
 * @param {any} server  restServer's
 */
async function everyAnswer(server) {
    const restToken = await jwt(REST_RESOURCE);
    const mcpToken = await jwt(MCP_RESOURCE);
    /** @type {Array<[string, string]>} */
    const answers = [];
    const ask = async (what, url, init = {}) => {
        answers.push([what, await answerText(await fetch(url, { redirect: "manual", ...init }))]);
    };
    const json = (token, body, extra = {}) => ({ method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...extra }, body: JSON.stringify(body) });
    const authed = { headers: { authorization: `Bearer ${restToken}` } };

    // the landing page, the icon, health, unknown routes
    await ask("GET / (a browser)", `${server.url}/`, { headers: { accept: "text/html" } });
    await ask("GET /", `${server.url}/`);
    await ask("GET /icon.png", `${server.url}/icon.png`);
    await ask("GET /healthz", `${server.url}/healthz`);
    await ask("GET /readyz", `${server.url}/readyz`);
    await ask("GET /no-such-route", `${server.url}/no-such-route`);
    await ask("GET /no-such-route as JSON", `${server.url}/no-such-route`, { headers: { accept: "application/json" } });
    await ask("GET /mcp (a browser)", `${server.url}/mcp`, { headers: { accept: "text/html" } });

    // discovery and the OpenAPI document
    await ask("REST protected-resource metadata", `${server.url}/.well-known/oauth-protected-resource/api/v1`);
    await ask("MCP protected-resource metadata", `${server.url}/.well-known/oauth-protected-resource/mcp`);
    await ask("authorization-server metadata", `${server.url}/.well-known/oauth-authorization-server`);
    await ask("GET /openapi.json without a token", `${server.url}/openapi.json`);
    await ask("GET /openapi.json", `${server.url}/openapi.json`, authed);

    // every REST route with its example input, then the usual errors
    for (const route of REST_ROUTES) {
        const path = `${server.api}${route.path.replace("{id}", "sales")}`;
        await ask(`${route.method} ${route.path}`, path, route.method === "GET" ? authed : json(restToken, route.example.input));
    }
    await ask("REST without a token (401)", `${server.api}/sources`);
    await ask("REST with a wrong token (401)", `${server.api}/sources`, { headers: { authorization: "Bearer not-a-token" } });
    await ask("REST unknown source (404)", `${server.api}/sources/salse`, authed);
    await ask("REST invalid input (400)", `${server.api}/views/validate`, json(restToken, { source: "sales", view: 5 }));
    await ask("REST not JSON (415)", `${server.api}/views/validate`, { method: "POST", headers: { authorization: `Bearer ${restToken}`, "content-type": "text/plain" }, body: "x" });
    await ask("REST wrong method (405)", `${server.api}/sources`, { method: "DELETE", headers: { authorization: `Bearer ${restToken}` } });
    await ask("REST unknown operation (404)", `${server.api}/no-such-operation`, authed);

    // MCP: initialize, the lists, a tool, and its refusals
    const mcpHeaders = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
    const rpc = (id, method, params = {}) => ({ jsonrpc: "2.0", id, method, params });
    await ask("MCP initialize", `${server.url}/mcp`, json(mcpToken, rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }), mcpHeaders));
    await ask("MCP tools/list", `${server.url}/mcp`, json(mcpToken, rpc(2, "tools/list"), mcpHeaders));
    await ask("MCP prompts/list", `${server.url}/mcp`, json(mcpToken, rpc(3, "prompts/list"), mcpHeaders));
    await ask("MCP resources/list", `${server.url}/mcp`, json(mcpToken, rpc(4, "resources/list"), mcpHeaders));
    await ask("MCP get_view_guide", `${server.url}/mcp`, json(mcpToken, rpc(5, "tools/call", { name: "get_view_guide", arguments: {} }), mcpHeaders));
    await ask("MCP suggest_view", `${server.url}/mcp`, json(mcpToken, rpc(6, "tools/call", { name: "suggest_view", arguments: { source: "sales" } }), mcpHeaders));
    await ask("MCP unknown source", `${server.url}/mcp`, json(mcpToken, rpc(7, "tools/call", { name: "describe_source", arguments: { source: "salse" } }), mcpHeaders));
    await ask("MCP without a token (401)", `${server.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", ...mcpHeaders }, body: JSON.stringify(rpc(8, "tools/list")) });
    await ask("MCP GET (405)", `${server.url}/mcp`, { headers: { authorization: `Bearer ${mcpToken}`, accept: "text/event-stream" } });

    // download links: a report's link, and the answers to a link nobody has
    const made = await fetch(`${server.api}/views/render`, json(restToken, { source: "sales", view: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }, format: "csv" }));
    const link = (await made.clone().json()).output?.url;
    answers.push(["render_view with a link", await answerText(made)]);
    assert.ok(link, "render_view gives a download link");
    const local = `${server.url}${new URL(link).pathname}`;
    await ask("download page (a browser)", local, { headers: { accept: "text/html" } });
    await ask("download link (a program)", local);
    await ask("unknown download link (a browser)", `${server.url}/downloads/no-such-link`, { headers: { accept: "text/html" } });
    await ask("unknown download link (a program)", `${server.url}/downloads/no-such-link`, { headers: { accept: "application/json" } });
    await ask("download link wrong method", local, { method: "PUT", headers: { accept: "application/json" } });

    // the Host check and the body caps, on raw requests
    const port = new URL(server.url).port;
    for (const [what, path] of [
        ["refused Host on REST", "/api/v1/sources"],
        ["refused Host on MCP", "/mcp"],
        ["refused Host on /", "/"],
        ["refused Host on a download", "/downloads/no-such-link"]
    ]) {
        const r = await raw(`${server.url}${path}`, { headers: { host: "evil.example", accept: "application/json" } });
        answers.push([what, `${r.status}\n${JSON.stringify(r.headers)}\n\n${typeof r.data === "string" ? r.data : JSON.stringify(r.data)}`]);
    }
    answers.push(["REST body too large", await rawExchange(port, `POST /api/v1/views/validate HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nAuthorization: Bearer ${restToken}\r\nContent-Type: application/json\r\nContent-Length: 99999999\r\n\r\n{`)]);
    answers.push(["MCP body too large", await rawExchange(port, `POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: 99999999\r\n\r\n{`)]);
    answers.push(["a malformed request", await rawExchange(port, "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: x\r\n\r\n")]);
    answers.push(["a broken body", await rawExchange(port, `POST /api/v1/views/validate HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${restToken}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\nzz\r\n`)]);
    return answers;
}

/**
 * The server for the sweep: REST and MCP on one port, OAuth, an output directory with download links.
 * Its stop keeps the default http.graceMs: after the broken chunked body it must not wait for it (#655).
 */
async function sweepServer(branding, http = {}) {
    const dir = brandedWorkspace();
    return restServer({ sources: SOURCES, output: { dir: "out" }, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, http: { publicUrl: `${PUBLIC}/`, ...http }, ...(branding ? { branding } : {}), baseDir: dir }, { enable: ["rest", "mcp"] });
}

test("docsUrl null: no body or header of any route names pivotkit's documentation site, errors included", async () => {
    const server = await sweepServer({ docsUrl: null });
    try {
        await ready(server);
        const answers = await everyAnswer(server);
        const naming = answers.filter(([, text]) => text.includes(SITE)).map(([what, text]) => `${what}: ...${text.slice(Math.max(0, text.indexOf(SITE) - 120), text.indexOf(SITE) + 80)}...`);
        assert.deepEqual(naming, [], naming.join("\n\n"));
        // the sweep reached what it means to check: errors with a code, the OAuth documents, MCP
        const all = answers.map(([, t]) => t).join("\n");
        assert.match(all, /"code":"SOURCE_NOT_FOUND"/);
        assert.match(all, /"authorization_servers"/);
        assert.match(all, /"serverInfo"/);
        assert.match(all, /"openapi":"3\.1\.0"/);
    } finally {
        await server.close();
    }
});

test("docsUrl null: a problem's type is about:blank, the code stays; the metadata leave the documentation out", async () => {
    const server = await sweepServer({ docsUrl: null });
    try {
        await ready(server);
        const missing = await call(`${server.api}/sources/salse`, { token: await jwt(REST_RESOURCE) });
        assert.equal(missing.status, 404);
        assert.equal(missing.data.type, "about:blank");
        assert.equal(missing.data.code, "SOURCE_NOT_FOUND");
        const prm = await call(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.equal(prm.data.resource_documentation, undefined);
        const mcp = await call(`${server.url}/.well-known/oauth-protected-resource/mcp`);
        assert.equal(mcp.status, 200);
        assert.equal(mcp.data.resource_documentation, undefined);
        const page = await fetch(`${server.url}/`, { headers: { accept: "text/html" } });
        assert.doesNotMatch(await page.text(), /<h2>Documentation<\/h2>/);
    } finally {
        await server.close();
    }
});

test("docsUrl: every documentation link starts with the operator's address", async () => {
    const docs = "https://docs.intranet.example/pivot/";
    const server = await sweepServer({ docsUrl: docs });
    try {
        await ready(server);
        const answers = await everyAnswer(server);
        const naming = answers.filter(([, text]) => text.includes(SITE)).map(([what]) => what);
        assert.deepEqual(naming, []);
        const missing = await call(`${server.api}/sources/salse`, { token: await jwt(REST_RESOURCE) });
        assert.equal(missing.data.type, `${docs}reference/rest/#error-source-not-found`);
        const prm = await call(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.equal(prm.data.resource_documentation, `${docs}reference/rest/`);
        const mcp = await call(`${server.url}/.well-known/oauth-protected-resource/mcp`);
        assert.equal(mcp.data.resource_documentation, `${docs}reference/mcp/`);
        const openapi = await call(`${server.url}/openapi.json`, { token: await jwt(REST_RESOURCE) });
        assert.match(openapi.data.info.description, new RegExp(`Docs: ${docs.replace(/[.]/g, "\\.")}reference/rest/`));
        assert.match(openapi.data.components.schemas.View.description, new RegExp(`${docs.replace(/[.]/g, "\\.")}concepts/views/`));
        const page = await (await fetch(`${server.url}/`, { headers: { accept: "text/html" } })).text();
        assert.match(page, new RegExp(`href="${docs.replace(/[.]/g, "\\.")}getting-started/mcp/"`));
        const download = await call(`${server.url}/downloads/no-such-link`, { headers: { accept: "application/json" } });
        assert.equal(download.data.type, `${docs}reference/rest/#error-not-found`);
    } finally {
        await server.close();
    }
});

test("branding.name: the titles end users and clients see carry the operator's name", async () => {
    const server = await sweepServer({ name: "Team Reports", docsUrl: null, icon: "icon.png" });
    try {
        await ready(server);
        const restToken = await jwt(REST_RESOURCE);
        const openapi = await call(`${server.url}/openapi.json`, { token: restToken });
        assert.equal(openapi.data.info.title, "Team Reports REST");
        const prm = await call(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.equal(prm.data.resource_name, "Team Reports REST");
        const mcp = await call(`${server.url}/.well-known/oauth-protected-resource/mcp`);
        assert.equal(mcp.data.resource_name, "Team Reports");
        const init = await fetch(`${server.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${await jwt(MCP_RESOURCE)}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) });
        const text = await init.text();
        const result = JSON.parse(text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data: ")).slice(6)).result;
        assert.equal(result.serverInfo.title, "Team Reports");
        assert.equal(result.serverInfo.name, "pivotkit-mcp", "the name programs match on stays");
        assert.deepEqual(result.serverInfo.icons, [{ src: `data:image/png;base64,${PNG.toString("base64")}`, mimeType: "image/png", sizes: ["1x1"] }]);
        // the landing page: its title, the snippets' server name, the favicon
        const page = await (await fetch(`${server.url}/`, { headers: { accept: "text/html" } })).text();
        assert.match(page, /<title>Team Reports MCP server<\/title>/);
        assert.match(page, /<h1>Team Reports MCP server<\/h1>/);
        assert.match(page, /&quot;team-reports&quot;: \{/);
        assert.match(page, /claude mcp add --transport http team-reports /);
        assert.match(page, /<link rel="icon" type="image\/png" href="data:image\/png;base64,/);
        assert.doesNotMatch(page, /pivotkit/i);
        const icon = await fetch(`${server.url}/icon.png`);
        assert.equal(icon.status, 200);
        assert.equal(icon.headers.get("content-type"), "image/png");
        assert.deepEqual(Buffer.from(await icon.arrayBuffer()), PNG);
        // the download pages
        const html = await (await fetch(`${server.url}/downloads/no-such-link`, { headers: { accept: "text/html" } })).text();
        assert.match(html, /<title>[^<]* - Team Reports report<\/title>/);
        assert.match(html, /<p class="brand">Team Reports report<\/p>/);
    } finally {
        await server.close();
    }
    // with static tokens the challenges name a realm: the name's slug
    const tokens = await restServer({ sources: SOURCES, auth: { mode: "token" }, branding: { name: "Team Reports" }, baseDir: brandedWorkspace() }, { env: { PIVOTKIT_TOKEN: TOKEN }, enable: ["rest", "mcp"] });
    try {
        assert.equal((await call(`${tokens.api}/sources`)).headers.get("www-authenticate"), 'Bearer realm="team-reports"');
        const mcp = await fetch(`${tokens.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
        assert.equal(mcp.headers.get("www-authenticate"), 'Bearer realm="team-reports-mcp"');
    } finally {
        await tokens.close();
    }
});

test("defaults: the names, links and realms stay pivotkit's", async () => {
    const dir = brandedWorkspace();
    const server = await restServer({ sources: SOURCES, output: { dir: "out" }, auth: { mode: "token" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN }, enable: ["rest", "mcp"] });
    try {
        const openapi = await call(`${server.url}/openapi.json`, { token: TOKEN });
        assert.equal(openapi.data.info.title, "pivotkit REST");
        assert.match(openapi.data.info.description, /Docs: https:\/\/pivotkit\.eize\.dev\/reference\/rest\/$/);
        const missing = await call(`${server.api}/sources/salse`, { token: TOKEN });
        assert.equal(missing.data.type, "https://pivotkit.eize.dev/reference/rest/#error-source-not-found");
        const refused = await call(`${server.api}/sources`);
        assert.equal(refused.headers.get("www-authenticate"), 'Bearer realm="pivotkit"');
        const mcpRefused = await fetch(`${server.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
        assert.match(mcpRefused.headers.get("www-authenticate"), /realm="pivotkit-mcp"/);
        const page = await (await fetch(`${server.url}/`, { headers: { accept: "text/html" } })).text();
        assert.match(page, /<title>pivotkit MCP server<\/title>/);
        assert.match(page, /&quot;pivotkit&quot;: \{/);
        assert.match(page, /href="https:\/\/pivotkit\.eize\.dev\/getting-started\/mcp\/"/);
        assert.doesNotMatch(page, /rel="icon"/);
        assert.equal((await fetch(`${server.url}/icon.png`)).status, 404);
        const html = await (await fetch(`${server.url}/downloads/no-such-link`, { headers: { accept: "text/html" } })).text();
        assert.match(html, /<title>[^<]* - pivotkit report<\/title>/);
        const init = await fetch(`${server.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) });
        const text = await init.text();
        const result = JSON.parse(text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data: ")).slice(6)).result;
        assert.equal(result.serverInfo.title, "pivotkit");
        assert.equal(result.serverInfo.icons, undefined);
    } finally {
        await server.close();
    }
});

test("http.page.url: / and a browser's /mcp go to the operator's page, also on a REST-only server; REST-only / stays a 404 without it", async () => {
    const dir = brandedWorkspace();
    const target = "https://intranet.example/pivot-reports";
    for (const enable of [["rest", "mcp"], ["rest"]]) {
        const server = await restServer({ sources: SOURCES, auth: { mode: "token" }, http: { page: { url: target } }, branding: { docsUrl: null }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN }, enable });
        try {
            const root = await fetch(`${server.url}/`, { redirect: "manual" });
            assert.equal(root.status, 302, enable.join(","));
            assert.equal(root.headers.get("location"), target);
            if (enable.includes("mcp")) {
                const browser = await fetch(`${server.url}/mcp`, { redirect: "manual", headers: { accept: "text/html" } });
                assert.equal(browser.status, 302);
                assert.equal(browser.headers.get("location"), target);
            }
        } finally {
            await server.close();
        }
    }
    const plain = await restServer({ sources: SOURCES, auth: { mode: "token" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN }, enable: ["rest"] });
    try {
        const root = await call(`${plain.url}/`);
        assert.equal(root.status, 404);
        assert.equal(root.data.code, "NOT_FOUND");
    } finally {
        await plain.close();
    }
});

test("branding and http.page.url are checked: wrong values are refused with the key", () => {
    const base = { sources: { sales: { file: "data/sales.csv" } } };
    const refused = [
        [{ branding: { docsUrl: "ftp://docs.example/" } }, /branding\.docsUrl/],
        [{ branding: { docsUrl: "not a url" } }, /branding\.docsUrl/],
        [{ branding: { docsUrl: "https://docs.example/?q=1" } }, /branding\.docsUrl/],
        [{ branding: { name: "" } }, /branding\.name/],
        [{ branding: { name: "x".repeat(61) } }, /branding\.name/],
        [{ branding: { name: "Team\u0000Reports" } }, /branding\.name/],
        [{ branding: { name: "Team\u202eReports" } }, /branding\.name/],
        [{ branding: { colour: "red" } }, /branding/],
        [{ http: { page: { url: "javascript:alert(1)" } } }, /http\.page\.url/],
        [{ http: { page: { url: "/relative" } } }, /http\.page\.url/],
        [{ http: { page: { url: "https://a.example/x\r\nSet-Cookie: a=b" } } }, /http\.page\.url/],
        [{ http: { page: { url: "https://a.example/a\tb" } } }, /http\.page\.url/],
        [{ branding: { docsUrl: 'https://x.example/"><b>' } }, /branding\.docsUrl/],
        [{ branding: { docsUrl: "https://x.example/a b" } }, /branding\.docsUrl/],
        [{ http: { page: { url: "https://intranet.example/", sources: true } } }, /http\.page/]
    ];
    for (const [extra, message] of refused) {
        assert.throws(() => validateOptions({ ...base, ...extra }), message, JSON.stringify(extra));
    }
    validateOptions({ ...base, branding: { name: "Team Reports", docsUrl: null }, http: { page: { url: "https://intranet.example/reports" } } });
    validateOptions({ ...base, branding: { docsUrl: "http://docs.intranet/pivot" } });
});

test("branding.icon: a PNG within the cap; anything else stops the start, and check-config says why", async () => {
    const dir = brandedWorkspace();
    writeFileSync(join(dir, "icon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    writeFileSync(join(dir, "big.png"), Buffer.concat([PNG, Buffer.alloc(70 * 1024)]));
    for (const [icon, why] of [
        ["missing.png", /branding\.icon: .*not found|branding\.icon: .*cannot be read/],
        ["icon.svg", /branding\.icon: .*PNG/],
        ["big.png", /branding\.icon: .*64 KiB/]
    ]) {
        await assert.rejects(restServer({ sources: SOURCES, branding: { icon }, baseDir: dir }), why, icon);
        const { text, problems } = await checkConfig({ sources: SOURCES, branding: { icon }, baseDir: dir }, { http: true, rest: true });
        assert.ok(problems >= 1, text);
        assert.match(factsOf(text), why);
    }
});

test("check-config reports the branding: name, documentation, icon and the page's address", async () => {
    const dir = brandedWorkspace();
    const { text } = await checkConfig({ sources: SOURCES, branding: { name: "Team Reports", docsUrl: null, icon: "icon.png" }, http: { page: { url: "https://intranet.example/reports" } }, baseDir: dir }, { http: true, rest: true });
    const facts = factsOf(text);
    assert.match(facts, /^Branding:$/m);
    assert.match(facts, /name: Team Reports/);
    assert.match(facts, /documentation links: none \(branding\.docsUrl null\)/);
    assert.match(facts, /icon: .*icon\.png, 1x1 PNG/);
    assert.match(facts, /page: \/ goes to https:\/\/intranet\.example\/reports/);
    assert.doesNotMatch(facts, new RegExp(SITE), "the upgrading links follow docsUrl too");
    const plain = await checkConfig({ sources: SOURCES, baseDir: dir }, { http: true, rest: true });
    assert.doesNotMatch(plain.text, /^Branding:/m, "without branding the section is left out");
});

test("operator output follows docsUrl: source-from-openapi's notes with --config", async () => {
    const dir = workspace();
    const rows = { type: "array", items: { type: "object", properties: { id: { type: "integer" }, total: { type: "number" } } } };
    const get = { operationId: "listOrders", responses: { 200: { description: "ok", content: { "application/json": { schema: rows } } } } };
    writeFileSync(join(dir, "api.json"), JSON.stringify({ openapi: "3.1.0", info: { title: "Shop", version: "1" }, servers: [{ url: "https://api.example.com" }], paths: { "/orders": { get } } }));
    writeFileSync(join(dir, "pivotkit.json"), JSON.stringify({ branding: { docsUrl: "https://docs.intranet.example/pivot/" } }));
    const run = async (argv) => {
        const out = { stdout: "", stderr: "" };
        const code = await sourceFromOpenApiCommand(argv, { stdout: { write: (t) => (out.stdout += t) }, stderr: { write: (t) => (out.stderr += t) } }, {});
        return { code, ...out };
    };
    const plain = await run([join(dir, "api.json"), "--operation", "listOrders"]);
    assert.equal(plain.code, 0, plain.stderr);
    assert.match(plain.stderr, /Docs: https:\/\/pivotkit\.eize\.dev\/reference\/sources\/#openapi/);
    const own = await run([join(dir, "api.json"), "--operation", "listOrders", "--config", join(dir, "pivotkit.json")]);
    assert.equal(own.code, 0, own.stderr);
    assert.match(own.stderr, /Docs: https:\/\/docs\.intranet\.example\/pivot\/reference\/sources\/#openapi/);
    assert.doesNotMatch(own.stderr, new RegExp(SITE));
    writeFileSync(join(dir, "none.json"), JSON.stringify({ branding: { docsUrl: null } }));
    const none = await run([join(dir, "api.json"), "--operation", "listOrders", "--config", join(dir, "none.json")]);
    assert.equal(none.code, 0, none.stderr);
    assert.doesNotMatch(none.stderr, new RegExp(SITE));
});

test("a download sign-in with another issuer points to the docs, not to an issue", () => {
    const options = { sources: SOURCES, output: { dir: "out", downloads: { signIn: { clientId: "c", issuer: "https://other.example/" } } }, auth: { mode: "oauth", issuer: "https://auth.example/", resource: MCP_RESOURCE } };
    assert.throws(() => validateOptions(options), (e) => !/github\.com/.test(e.message) && /https:\/\/pivotkit\.eize\.dev\/reference\/delivery\//.test(e.message));
    assert.throws(() => validateOptions({ ...options, branding: { docsUrl: null } }), (e) => !/github\.com|pivotkit\.eize\.dev/.test(e.message) && /issuer of its own/.test(e.message));
});
