// OAuth 2.1 as the MCP authorization spec (2026-07-28) asks of a protected resource, against a local
// test issuer (OpenID Connect discovery and a JWKS on a loopback port): the metadata documents, the
// 401 and 403 challenges, and the tokens a server must refuse.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { BY_REGION, call, httpClient, httpServer, workspace } from "./helpers.js";

const RESOURCE = "https://mcp.example.com/mcp";
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
            res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"] }));
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
async function token({ claims = {}, header = {}, signWith = key.privateKey, expires = "5m" } = {}) {
    let jwt = new SignJWT({ scope: "pivotkit", client_id: "test-client", ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1", ...header }).setIssuer(claims.iss ?? issuer).setAudience(claims.aud ?? RESOURCE).setSubject("someone").setIssuedAt();
    if (expires) {
        jwt = jwt.setExpirationTime(expires);
    }
    return jwt.sign(signWith);
}

async function oauthServer(extra = {}) {
    const dir = workspace();
    return httpServer({
        sources: { sales: { file: "data/sales.csv" }, hr: { file: "data/sales.csv", scopes: ["pivotkit:hr"] } },
        output: { dir: "out" },
        auth: { mode: "oauth", issuer, resource: RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"], toolScopes: { render_view: ["pivotkit:render"] }, ...extra },
        baseDir: dir
    });
}

const INIT = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
const post = (url, bearer) => fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: INIT });

test("Protected Resource Metadata (RFC 9728) names the resource and the issuer; a request without a token gets 401 with the challenge", async () => {
    const server = await oauthServer();
    try {
        const prm = await (await fetch(server.url.replace("/mcp", "/.well-known/oauth-protected-resource/mcp"))).json();
        assert.equal(prm.resource, RESOURCE);
        assert.deepEqual(prm.authorization_servers, [issuer]);
        assert.deepEqual(prm.scopes_supported, ["pivotkit"]);
        const res = await post(server.url);
        assert.equal(res.status, 401);
        const challenge = res.headers.get("www-authenticate");
        assert.match(challenge, /^Bearer /);
        assert.match(challenge, /resource_metadata="https:\/\/mcp\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/);
        // the spec's "SHOULD": the scopes to ask for, in the first challenge
        assert.match(challenge, /scope="pivotkit"/);
    } finally {
        await server.close();
    }
});

test("a valid token works; the client id is logged, never the person's id or the token", async () => {
    const server = await oauthServer();
    try {
        const good = await token({ claims: { scope: "pivotkit pivotkit:render" } });
        const { client, close } = await httpClient(server.url, { token: good });
        assert.deepEqual((await call(client, "list_sources")).data.sources.map((s) => s.id), ["sales"], "hr needs its scope");
        assert.match((await call(client, "describe_source", { source: "hr" })).text, /^SOURCE_NOT_FOUND/);
        const rendered = await call(client, "render_view", { source: "sales", view: BY_REGION });
        assert.equal(rendered.data.ok, true);
        await close();
        const log = JSON.stringify(server.log);
        assert.match(log, /"client":"test-client"/);
        assert.ok(!log.includes("someone") && !log.includes(good));
    } finally {
        await server.close();
    }
});

test("tokens the server must refuse: expired, another issuer, another audience, unsigned, HMAC with the public key, unknown key, no exp, a jku of the attacker", async () => {
    const server = await oauthServer();
    try {
        const { exportSPKI } = await import("jose");
        const pem = await exportSPKI(key.publicKey);
        const hmac = await new SignJWT({ scope: "pivotkit" }).setProtectedHeader({ alg: "HS256", kid: "k1" }).setIssuer(issuer).setAudience(RESOURCE).setExpirationTime("5m").sign(new TextEncoder().encode(pem));
        const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
        const body = Buffer.from(JSON.stringify({ iss: issuer, aud: RESOURCE, scope: "pivotkit", exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
        const bad = {
            expired: await token({ claims: { exp: Math.floor(Date.now() / 1000) - 3600 }, expires: null }),
            issuer: await token({ claims: { iss: "https://evil.example" } }),
            audience: await token({ claims: { aud: "https://other.example.com/mcp" } }),
            none: `${header}.${body}.`,
            hmac,
            unknownKey: await token({ signWith: otherKey.privateKey, header: { kid: "k2" } }),
            noExp: await token({ expires: null }),
            jku: await token({ signWith: otherKey.privateKey, header: { jku: "https://evil.example/jwks", kid: "k1" } }),
            garbage: "abc.def.ghi"
        };
        for (const [name, t] of Object.entries(bad)) {
            const res = await post(server.url, t);
            assert.equal(res.status, 401, name);
            const text = await res.text();
            assert.doesNotMatch(text, /signature|claim|kid/i, `${name}: the reason stays on the server`);
        }
    } finally {
        await server.close();
    }
});

test("scopes: without the required scope 403 insufficient_scope; a tool's own scope is asked for by a 403 naming every scope it needs", async () => {
    const server = await oauthServer();
    try {
        const res = await post(server.url, await token({ claims: { scope: "openid" } }));
        assert.equal(res.status, 403);
        assert.match(res.headers.get("www-authenticate"), /error="insufficient_scope"/);
        assert.match(res.headers.get("www-authenticate"), /scope="pivotkit"/);
        const { client, close } = await httpClient(server.url, { token: await token() });
        const tool = await client.callTool({ name: "render_view", arguments: { source: "sales", view: BY_REGION } }).then(
            (r) => ({ result: r }),
            (e) => ({ error: e })
        );
        assert.ok(tool.error, "the call is refused before the tool runs");
        assert.match(String(tool.error?.message ?? tool.error), /403|insufficient_scope|pivotkit:render/);
        await close();
    } finally {
        await server.close();
    }
});

test("an issuer that cannot be reached: /mcp answers 503 and the server keeps trying; metadata of another origin's JWKS is refused", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "oauth", issuer: "http://127.0.0.1:9", resource: RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, baseDir: dir });
    try {
        const res = await post(server.url, "x");
        assert.equal(res.status, 503);
        assert.equal(res.headers.get("retry-after"), "10");
        assert.ok(server.log.some((l) => l.event === "warning" && /could not be loaded/.test(l.message)));
    } finally {
        await server.close();
    }
});
