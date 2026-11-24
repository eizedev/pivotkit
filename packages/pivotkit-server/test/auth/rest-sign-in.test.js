// Sign-in of the REST service: static tokens (named, scoped, rotated by file), the refused-token
// and request limits, and OAuth 2.1 against a local issuer (OpenID Connect discovery and a JWKS on a
// loopback port): the REST resource's own audience, so a token for the MCP endpoint does not reach
// REST and the other way round.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { REQUEST_LIMITS } from "../../src/limits.js";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { checkConfig, validateOptions } from "pivotkit-server";
import { BY_REGION, OTHER_TOKEN, TOKEN, call, factsOf, raw, restServer, untilReady, workspace, mcpInitialize } from "../helpers.js";
import { until } from "../../../../tests/until.js";
import { localIssuer, signingKey } from "./local-issuer.js";

const MCP_RESOURCE = "https://pk.example.com/mcp";
const REST_RESOURCE = "https://pk.example.com/api/v1";
/** The local issuer (local-issuer.js), its address, and a key it does not publish. */
let local;
let issuer;
let otherKey;

before(async () => {
    local = await localIssuer();
    issuer = local.url;
    otherKey = (await signingKey()).key;
});
after(() => local.close());

/** A signed access token of the local issuer for the REST resource, of "someone"; the options change it. */
const jwt = ({ aud = REST_RESOURCE, sub = "someone", ...options } = {}) => local.token({ aud, sub, ...options });

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
        // the right token still works from that address: a stranger's wrong tokens lock out nobody
        assert.equal((await call(`${server.api}/sources`, { token: TOKEN })).status, 200);
        assert.equal((await call(`${server.api}/sources`, { token: OTHER_TOKEN })).status, 429);
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

test("oauth: the REST resource's metadata names it and the issuer; a token for the MCP endpoint does not reach REST, nor the other way round", async () => {
    const server = await oauthServer();
    try {
        await untilReady(server);
        const prm = await call(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.equal(prm.status, 200);
        assert.equal(prm.data.resource, REST_RESOURCE);
        assert.deepEqual(prm.data.authorization_servers, [issuer]);
        // a foreign origin is refused before this route, so a wildcard CORS header would say what is not so
        assert.equal(prm.headers.get("access-control-allow-origin"), null);
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
        const mcp = await mcpInitialize(server, forRest);
        await mcp.body?.cancel();
        assert.equal(mcp.status, 401);
        const mcpOk = await mcpInitialize(server, await jwt({ aud: MCP_RESOURCE }));
        assert.equal(mcpOk.status, 200);
        await mcpOk.body?.cancel();
    } finally {
        await server.close();
    }
});

test("oauth: an expired token, another key, alg none, another issuer and missing scopes are refused; scopes per source and operation hold", async () => {
    const server = await oauthServer({ toolScopes: { render_view: ["pivotkit:render"] } });
    try {
        await untilReady(server);
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

test("oauth: a person's subject, groups and other claims never reach a log line, at info or debug, on REST and MCP", async () => {
    for (const level of ["info", "debug"]) {
        const dir = workspace();
        const server = await restServer({ sources: SOURCES, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, http: { publicUrl: "https://pk.example.com/" }, log: level, baseDir: dir }, { enable: ["rest", "mcp"] });
        const claims = { groups: ["finance-secret-group"], customer: "acme-secret-claim", email: "person@secret.example", name: "Secret Person" };
        const client = new Client({ name: "claims", version: "1.0.0" });
        try {
            await untilReady(server);
            assert.equal((await call(`${server.api}/views/validate`, { body: { source: "sales", view: BY_REGION }, token: await jwt({ claims }) })).status, 200);
            assert.equal((await call(`${server.api}/sources/nope`, { token: await jwt({ claims }) })).status, 404);
            const token = await jwt({ claims, aud: MCP_RESOURCE });
            await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
            await client.callTool({ name: "describe_source", arguments: { source: "sales" } });
            await client.callTool({ name: "describe_source", arguments: { source: "nope" } });
            const text = JSON.stringify(server.log);
            assert.ok(server.log.some((l) => l.event === "call" && l.client === "report-bot"), text);
            assert.ok(server.log.some((l) => l.event === "request" && l.client === "report-bot"), text);
            for (const secret of ["someone", "finance-secret-group", "acme-secret-claim", "person@secret.example", "Secret Person"]) {
                assert.ok(!text.includes(secret), `${level}: ${secret} in the log`);
            }
        } finally {
            await client.close();
            await server.close();
        }
    }
});

test("F3: the request limits count per person, not per OAuth client: two people of one client each get their own bucket, on REST and MCP", async () => {
    const dir = workspace();
    const limited = await restServer({ sources: SOURCES, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, rest: { rateLimit: { perMinute: 1, burst: 2 } }, mcp: { rateLimit: { perMinute: 1, burst: 2 } }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir }, { enable: ["rest", "mcp"] });
    try {
        const ana = await jwt({ sub: "ana" });
        const ben = await jwt({ sub: "ben" });
        assert.equal((await call(`${limited.api}/sources`, { token: ana })).status, 200);
        assert.equal((await call(`${limited.api}/sources`, { token: ana })).status, 200);
        assert.equal((await call(`${limited.api}/sources`, { token: ana })).status, 429, "ana's bucket is empty");
        assert.equal((await call(`${limited.api}/sources`, { token: ben })).status, 200, "ben of the same client has his own");
        const mcp = async (token) => {
            const res = await mcpInitialize(limited, token);
            await res.body?.cancel();
            return res.status;
        };
        const anaMcp = await jwt({ sub: "ana", aud: MCP_RESOURCE });
        const benMcp = await jwt({ sub: "ben", aud: MCP_RESOURCE });
        assert.deepEqual([await mcp(anaMcp), await mcp(anaMcp), await mcp(anaMcp)], [200, 200, 429]);
        assert.equal(await mcp(benMcp), 200, "on MCP too");
    } finally {
        await limited.close();
    }
});

test("limits: the people of one OAuth client together are held to concurrency x clientShare; the refusal names limit clientShare", async () => {
    const dir = workspace();
    let open;
    const gate = new Promise((resolve) => (open = resolve));
    // the loads started: each one's request holds its place
    let started = 0;
    const slow = { load: async () => (started++, await gate, [{ Region: "North" }]), policy: { default: "show" } };
    const server = await restServer({ sources: { slow, slow2: { ...slow } }, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, rest: { concurrency: 1 }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir }, { enable: ["rest", "mcp"] });
    try {
        const people = await Promise.all(Array.from({ length: REQUEST_LIMITS.clientShare + 1 }, (_, i) => jwt({ sub: `person-${i}` })));
        // four loads of one source run at once: the held requests spread over two
        const held = people.slice(0, -1).map((token, i) => call(`${server.api}/sources/describe`, { token, body: { source: i % 2 ? "slow2" : "slow" } }));
        // the held requests take their places before the last one is sent
        await until(() => started === people.length - 1, { message: "every held request's load started" });
        const refused = await call(`${server.api}/sources/describe`, { token: people.at(-1), body: { source: "slow" } });
        assert.equal(refused.status, 429, JSON.stringify(refused.data));
        assert.ok(server.log.some((l) => l.event === "refused" && l.reason === "rate_limited" && l.limit === "clientShare"), JSON.stringify(server.log.filter((l) => l.event === "refused")));
        open();
        assert.ok((await Promise.all(held)).every((r) => r.status === 200));
    } finally {
        open();
        await server.close();
    }
});

test("limits: a refusal by the client's rate bucket logs limit clientRate, a person's own logs rate", async () => {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, rest: { rateLimit: { perMinute: 1, burst: 1 } }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir }, { enable: ["rest", "mcp"] });
    try {
        const people = await Promise.all(Array.from({ length: REQUEST_LIMITS.clientShare + 1 }, (_, i) => jwt({ sub: `person-${i}` })));
        for (const token of people.slice(0, -1)) {
            assert.equal((await call(`${server.api}/sources`, { token })).status, 200);
        }
        assert.equal((await call(`${server.api}/sources`, { token: people[0] })).status, 429);
        assert.equal((await call(`${server.api}/sources`, { token: people.at(-1) })).status, 429);
        const limits = server.log.filter((l) => l.event === "refused" && l.reason === "rate_limited").map((l) => l.limit);
        assert.deepEqual(limits, ["rate", "clientRate"]);
    } finally {
        await server.close();
    }
});

test("rest.signIn.clientId: the REST metadata publishes the command line's public client ID; check-config shows it", async () => {
    const dir = workspace();
    const options = { sources: SOURCES, output: { dir: "out" }, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, rest: { signIn: { clientId: "pivotkit-cli" } }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir };
    const server = await restServer(options, { enable: ["rest", "mcp"] });
    try {
        await untilReady(server);
        const prm = await call(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.equal(prm.status, 200);
        assert.equal(prm.data.pivotkit_client_id, "pivotkit-cli");
        assert.equal(prm.data.resource, REST_RESOURCE, "the RFC 9728 fields stay as they are");
    } finally {
        await server.close();
    }
    const plain = await oauthServer();
    try {
        await untilReady(plain);
        assert.equal(Object.hasOwn((await call(`${plain.url}/.well-known/oauth-protected-resource/api/v1`)).data, "pivotkit_client_id"), false, "nothing without the setting");
    } finally {
        await plain.close();
    }
    const { text } = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server", rest: true });
    assert.match(factsOf(text), /\n {2}sign-in client for pivotkit login: pivotkit-cli \(published; a public client without a secret\)\n/);
});

test("rest.signIn: OAuth only, a client ID of the right form, and never a secret", () => {
    const base = { sources: SOURCES, auth: { mode: "oauth", issuer: "https://auth.example.com", resource: MCP_RESOURCE } };
    assert.doesNotThrow(() => validateOptions({ ...base, rest: { signIn: { clientId: "pivotkit-cli" } } }));
    assert.throws(() => validateOptions({ sources: SOURCES, auth: { mode: "token", tokens: [{ name: "a", env: "A" }] }, rest: { signIn: { clientId: "pivotkit-cli" } } }), /rest\.signIn: needs auth\.mode "oauth"/);
    assert.throws(() => validateOptions({ ...base, rest: { signIn: { clientId: "two words" } } }), /rest\.signIn\.clientId: the public client's ID/);
    assert.throws(() => validateOptions({ ...base, rest: { signIn: {} } }), /rest\.signIn\.clientId: the public client's ID/);
    assert.throws(() => validateOptions({ ...base, rest: { signIn: { clientId: "pivotkit-cli", clientSecret: { env: "S" } } } }), /clientSecret/);
});
