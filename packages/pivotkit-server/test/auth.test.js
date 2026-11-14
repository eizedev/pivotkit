// Sign-in of the REST service: static tokens (named, scoped, rotated by file), the refused-token
// and request limits, and OAuth 2.1 against a local issuer (OpenID Connect discovery and a JWKS on a
// loopback port): the REST resource's own audience, so a token for the MCP endpoint does not reach
// REST and the other way round.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { BY_REGION, OTHER_TOKEN, TOKEN, call, raw, restServer, workspace } from "./helpers.js";

const MCP_RESOURCE = "https://pk.example.com/mcp";
const REST_RESOURCE = "https://pk.example.com/api/v1";
let issuer;
let issuerServer;
let key;
let otherKey;

before(async () => {
    key = await generateKeyPair("RS256");
    otherKey = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    issuerServer = createServer((req, res) => {
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

/** A signed access token; `claims` and `header` change it. */
async function jwt({ claims = {}, header = {}, signWith = key.privateKey, expires = "5m", aud = REST_RESOURCE } = {}) {
    let token = new SignJWT({ scope: "pivotkit", client_id: "report-bot", ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1", ...header }).setIssuer(claims.iss ?? issuer).setAudience(aud).setSubject("someone").setIssuedAt();
    if (expires) {
        token = token.setExpirationTime(expires);
    }
    return token.sign(signWith);
}

const SOURCES = { sales: { file: "data/sales.csv", policy: { fields: { Region: "show" } } }, hr: { file: "data/sales.csv", scopes: ["pivotkit:hr"] } };

test("token: no token, an unknown one, Basic, a cookie, a token in the address and two headers are 401 with a challenge; the right one works", async () => {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, auth: { mode: "token" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const refused = [
            await call(`${server.api}/sources`),
            await call(`${server.api}/sources`, { token: OTHER_TOKEN }),
            await call(`${server.api}/sources`, { headers: { authorization: `Basic ${Buffer.from(`x:${TOKEN}`).toString("base64")}` } }),
            await call(`${server.api}/sources`, { headers: { cookie: `token=${TOKEN}; authorization=Bearer ${TOKEN}` } }),
            await call(`${server.api}/sources?access_token=${TOKEN}`),
            // the right token first: node:http keeps only the first Authorization header unless asked
            await raw(`${server.api}/sources`, { headers: { authorization: [`Bearer ${TOKEN}`, `Bearer ${OTHER_TOKEN}`] } })
        ];
        for (const res of refused) {
            assert.equal(res.status, 401, JSON.stringify(res.data));
            assert.equal(res.data.code, "INVALID_TOKEN");
            const challenge = res.headers.get?.("www-authenticate") ?? res.headers["www-authenticate"];
            assert.equal(challenge, 'Bearer realm="pivotkit"');
            assert.ok(!JSON.stringify(res.data).includes(TOKEN.slice(0, 12)));
        }
        const ok = await call(`${server.api}/sources`, { token: TOKEN });
        assert.equal(ok.status, 200);
        // a POST is checked before its body is read
        const post = await raw(`${server.api}/views/validate`, { method: "POST", headers: { "content-type": "application/json", "content-length": "1000000" }, body: "{" });
        assert.equal(post.status, 401);
        assert.ok(!JSON.stringify(server.log).includes(TOKEN), "the token is never logged");
    } finally {
        await server.close();
    }
});

test("token: scopes per token decide sources and operations; a token from a file is read again (rotation)", async () => {
    const dir = workspace();
    const file = join(dir, "bot.token");
    writeFileSync(file, `${OTHER_TOKEN}\n`);
    const server = await restServer({ sources: SOURCES, auth: { mode: "token", tokens: [{ name: "admin", env: "ADMIN" }, { name: "bot", file: "bot.token", scopes: ["pivotkit:read"] }], toolScopes: { render_view: ["pivotkit:render"] } }, output: { dir: "out" }, baseDir: dir }, { env: { ADMIN: TOKEN } });
    try {
        const adminList = await call(`${server.api}/sources`, { token: TOKEN });
        assert.deepEqual(adminList.data.sources.map((s) => s.id), ["sales", "hr"]);
        const botList = await call(`${server.api}/sources`, { token: OTHER_TOKEN });
        assert.deepEqual(botList.data.sources.map((s) => s.id), ["sales"]);
        const hr = await call(`${server.api}/sources/hr`, { token: OTHER_TOKEN });
        assert.equal(hr.status, 404, "a source without the scope answers as a missing one");
        const render = await call(`${server.api}/views/render`, { token: OTHER_TOKEN, body: { source: "sales", view: BY_REGION } });
        assert.equal(render.status, 403);
        assert.equal(render.data.code, "INSUFFICIENT_SCOPE");
        assert.match(render.data.detail, /pivotkit:render/);
        assert.equal((await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: BY_REGION } })).status, 200);
        const rotated = "a-rotated-token-that-is-long-enough-000000";
        writeFileSync(file, rotated);
        assert.equal((await call(`${server.api}/sources`, { token: OTHER_TOKEN })).status, 401);
        assert.equal((await call(`${server.api}/sources`, { token: rotated })).status, 200);
        const entry = server.log.find((l) => l.event === "request" && l.client === "bot");
        assert.ok(entry, "the token's name is logged");
    } finally {
        await server.close();
    }
});

test("limits: refused tokens per address, requests per caller; 429 with Retry-After, the same problem shape", async () => {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, auth: { mode: "token" }, rest: { rateLimit: { perMinute: 60, burst: 3, failedAuthPerMinute: 4 } }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            statuses.push((await call(`${server.api}/sources`, { token: OTHER_TOKEN })).status);
        }
        assert.deepEqual(statuses, [401, 401, 401, 401]);
        const blocked = await call(`${server.api}/sources`, { token: OTHER_TOKEN });
        assert.equal(blocked.status, 429);
        assert.equal(blocked.data.code, "RATE_LIMITED");
        assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
        // the right token from the same address is blocked too while the address is: no more guessing
        assert.equal((await call(`${server.api}/sources`, { token: TOKEN })).status, 429);
    } finally {
        await server.close();
    }
    const second = await restServer({ sources: SOURCES, auth: { mode: "token" }, rest: { rateLimit: { perMinute: 60, burst: 3 } }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            statuses.push((await call(`${second.api}/sources`, { token: TOKEN })).status);
        }
        assert.deepEqual(statuses, [200, 200, 200, 429]);
    } finally {
        await second.close();
    }
});

test("auth none is refused on an address other than loopback unless allowed", async () => {
    await assert.rejects(restServer({ http: { host: "0.0.0.0" } }), /needs --auth token or oauth/);
});

/** The REST and MCP endpoints on one port, OAuth with each its own resource. */
async function oauthServer(extra = {}) {
    const dir = workspace();
    return restServer({ sources: SOURCES, output: { dir: "out" }, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"], ...extra }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir }, { enable: ["rest", "mcp"] });
}

/** Waits until the server has loaded the issuer (readyz). */
async function ready(server) {
    for (let i = 0; i < 50; i++) {
        if ((await call(`${server.url}/readyz`)).status === 200) {
            return;
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("not ready");
}

test("oauth: the REST resource's metadata names it and the issuer; a token for the MCP endpoint does not reach REST, nor the other way round", async () => {
    const server = await oauthServer();
    try {
        await ready(server);
        const prm = await call(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.equal(prm.status, 200);
        assert.equal(prm.data.resource, REST_RESOURCE);
        assert.deepEqual(prm.data.authorization_servers, [issuer]);
        const none = await call(`${server.api}/sources`);
        assert.equal(none.status, 401);
        assert.match(none.headers.get("www-authenticate"), /^Bearer error="invalid_token".*resource_metadata="https:\/\/pk\.example\.com\/\.well-known\/oauth-protected-resource\/api\/v1"/);
        assert.match(none.headers.get("www-authenticate"), /scope="pivotkit"/);
        const forMcp = await call(`${server.api}/sources`, { token: await jwt({ aud: MCP_RESOURCE }) });
        assert.equal(forMcp.status, 401, "an MCP token is refused by REST");
        const forRest = await jwt();
        const ok = await call(`${server.api}/sources`, { token: forRest });
        assert.equal(ok.status, 200);
        // and the MCP endpoint refuses the REST token
        const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
        const mcp = await fetch(`${server.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${forRest}` }, body: init });
        assert.equal(mcp.status, 401);
        const mcpOk = await fetch(`${server.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${await jwt({ aud: MCP_RESOURCE })}` }, body: init });
        assert.equal(mcpOk.status, 200);
        await mcpOk.body?.cancel();
    } finally {
        await server.close();
    }
});

test("oauth: an expired token, another key, alg none, another issuer and missing scopes are refused; scopes per source and operation hold", async () => {
    const server = await oauthServer({ toolScopes: { render_view: ["pivotkit:render"] } });
    try {
        await ready(server);
        const [header, payload] = (await jwt()).split(".");
        const unsigned = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${payload}.`;
        const bad = [await jwt({ expires: "-1m" }), await jwt({ signWith: otherKey.privateKey }), unsigned, `${header}.${payload}.AAAA`, await jwt({ claims: { iss: "https://evil.example" } })];
        for (const token of bad) {
            const res = await call(`${server.api}/sources`, { token });
            assert.equal(res.status, 401, token.slice(0, 20));
        }
        const noScope = await call(`${server.api}/sources`, { token: await jwt({ claims: { scope: "other" } }) });
        assert.equal(noScope.status, 403);
        assert.equal(noScope.data.code, "INSUFFICIENT_SCOPE");
        assert.match(noScope.headers.get("www-authenticate"), /error="insufficient_scope"/);
        const list = await call(`${server.api}/sources`, { token: await jwt() });
        assert.deepEqual(list.data.sources.map((s) => s.id), ["sales"]);
        const withHr = await call(`${server.api}/sources`, { token: await jwt({ claims: { scope: "pivotkit pivotkit:hr" } }) });
        assert.deepEqual(withHr.data.sources.map((s) => s.id), ["sales", "hr"]);
        const render = await call(`${server.api}/views/render`, { token: await jwt(), body: { source: "sales", view: BY_REGION } });
        assert.equal(render.status, 403);
        assert.match(render.headers.get("www-authenticate"), /scope="pivotkit pivotkit:render"/);
        assert.equal((await call(`${server.api}/views/render`, { token: await jwt({ claims: { scope: "pivotkit pivotkit:render" } }), body: { source: "sales", view: BY_REGION } })).status, 200);
    } finally {
        await server.close();
    }
});

test("oauth: until the issuer answers, REST says 503 with Retry-After and /readyz is 503", async () => {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, auth: { mode: "oauth", issuer: "http://127.0.0.1:9", resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, baseDir: dir });
    try {
        const res = await call(`${server.api}/sources`, { token: await jwt() });
        assert.equal(res.status, 503);
        assert.equal(res.data.code, "AUTH_NOT_READY");
        assert.equal(res.headers.get("retry-after"), "10");
        const readyz = await call(`${server.url}/readyz`);
        assert.equal(readyz.status, 503);
        assert.equal(readyz.data.checks.auth, false);
        assert.equal((await call(`${server.url}/healthz`)).status, 200);
    } finally {
        await server.close();
    }
});
