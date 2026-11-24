// OAuth 2.1 as the MCP authorization spec (2026-07-28) asks of a protected resource, against a local
// test issuer (OpenID Connect discovery and a JWKS on a loopback port): the metadata documents, the
// 401 and 403 challenges, and the tokens a server must refuse.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { BY_REGION, call, httpClient, httpServer, workspace } from "./helpers.js";
import { localIssuer, signingKey } from "../../pivotkit-server/test/auth/local-issuer.js";
import { until } from "../../../tests/until.js";

const RESOURCE = "https://mcp.example.com/mcp";
/** The local issuer (pivotkit-server's test/auth/local-issuer.js), its address, and a key it does not publish. */
let local;
let issuer;
let otherKey;

before(async () => {
    local = await localIssuer();
    issuer = local.url;
    otherKey = (await signingKey()).key;
});
after(() => local.close());

/** A signed access token of "someone" for the MCP endpoint; `claims` (also `iss` and `aud`) and the options change it. */
const token = ({ claims = {}, ...options } = {}) => local.token({ claims: { client_id: "test-client", ...claims }, aud: /** @type {string | undefined} */ (claims.aud) ?? RESOURCE, sub: "someone", ...options });

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
        // the required scope; a source's scope only with auth.offerSourceScopes (off by default)
        assert.deepEqual(prm.scopes_supported, ["pivotkit"]);
        const res = await post(server.url);
        assert.equal(res.status, 401);
        const challenge = res.headers.get("www-authenticate");
        assert.match(challenge, /^Bearer /);
        assert.match(challenge, /resource_metadata="https:\/\/mcp\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/);
        // the spec's "SHOULD": the scopes to ask for, in the first challenge
        assert.match(challenge, /scope="pivotkit"/);
        // a source's scope is offered in the metadata only, never asked for in the challenge
        assert.doesNotMatch(challenge, /pivotkit:hr/);
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
        const pem = await exportSPKI(local.key.publicKey);
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

test("an issuer that cannot be reached: /mcp answers 503 with Retry-After, and the log warns that its metadata could not be loaded", async () => {
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

for (const era of ["legacy", "modern"]) {
    test(`a code source with params over MCP (${era}): the tools offer params, load gets the values and the person's subject, never the token`, async () => {
        const seen = [];
        const server = await httpServer({
            sources: {
                tickets: {
                    load: async (params, { caller }) => {
                        seen.push({ params: { ...params }, caller });
                        return [{ Team: params.team, Open: 2 }];
                    },
                    params: { team: { type: "string", required: true, enum: ["blue", "red"] } },
                    policy: { default: "show" }
                }
            },
            auth: { mode: "oauth", issuer, resource: RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }
        });
        const bearer = await token();
        const { client, close } = await httpClient(server.url, { era, token: bearer });
        try {
            const tools = (await client.listTools()).tools;
            assert.ok(tools.find((t) => t.name === "describe_source").inputSchema.properties.params, "offered where a source declares params");
            assert.equal(tools.find((t) => t.name === "list_sources").inputSchema.properties?.params, undefined);
            const listed = await call(client, "list_sources");
            assert.deepEqual(listed.data.sources[0].params, [{ name: "team", type: "string", required: true, enum: ["blue", "red"] }]);
            const described = await call(client, "describe_source", { source: "tickets", params: { team: "red" } });
            assert.equal(described.isError, false, described.text);
            assert.match(described.data.dataAsOf, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            assert.deepEqual(seen[0].params, { team: "red" });
            assert.equal(seen[0].caller.subject, "someone");
            assert.equal(seen[0].caller.issuer, issuer);
            assert.ok(Object.isFrozen(seen[0].caller));
            assert.ok(!JSON.stringify(seen[0].caller).includes(bearer.slice(20, 60)));
            const missing = await call(client, "describe_source", { source: "tickets" });
            assert.equal(missing.isError, true);
            assert.match(missing.text, /^INVALID_INPUT: the source tickets needs params\.team/);
        } finally {
            await close();
            await server.close();
        }
    });
}

test("the issuer's keys are read through pivotkit-server's guarded requests: a key set over the cap is refused, so its key signs nothing in", async () => {
    // an issuer whose key set holds its signing key and is padded far over 256 KiB with more keys
    const padded = await localIssuer();
    const big = JSON.stringify({ keys: [padded.jwk, ...Array.from({ length: 1200 }, (_, i) => ({ ...padded.jwk, kid: `pad${i}` }))] });
    assert.ok(big.length > 262_144);
    padded.routes["/jwks"] = (_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(big);
    };
    const own = padded.url;
    const server = await oauthServer({ issuer: own });
    try {
        const good = await token({ claims: { iss: own }, signWith: padded.key.privateKey });
        // 503 until the server has tried to read the issuer's keys
        const response = await until(async () => {
            const r = await post(server.url, good);
            return r.status !== 503 && r;
        }, { tries: 100, every: 30 });
        assert.equal(response.status, 401);
        assert.match(JSON.stringify(server.log), /the issuer's keys could not be read from .*\/jwks: TOO_LARGE/);
    } finally {
        await server.close();
        await padded.close();
    }
});
