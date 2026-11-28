// More than one OAuth issuer (auth.issuers): a token is checked with the keys of the issuer its iss
// names, and only those; each issuer's own audience and required scopes; the first issuer is the
// one named to clients; a token exchange serves the people of one issuer only. Two local issuers
// (local-issuer.js) on loopback ports, both signing with a key of the same key ID.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { callerOf, checkConfig, createContext, present, validateOptions } from "pivotkit-server";
import { exchangeTokenFor } from "../../src/auth.js";
import { call, factsOf, mcpInitialize, mcpToolWorks, restServer, untilReady, workspace } from "../helpers.js";
import { localIssuer } from "./local-issuer.js";
import { until } from "../../../../tests/until.js";

const MCP_RESOURCE = "https://pk.example.com/mcp";
const REST_RESOURCE = "https://pk.example.com/api/v1";
const SOURCES = { sales: { file: "data/sales.csv", policy: { fields: { Region: "show" } } } };
/** Two local issuers: a (the first, named to clients) and b. */
let a;
let b;

before(async () => {
    [a, b] = await Promise.all([localIssuer(), localIssuer()]);
});
after(() => Promise.all([a.close(), b.close()]));

/** OAuth options with these issuers (default: a, then b with no settings of its own). */
const authOf = (issuers = [{ issuer: a.url }, { issuer: b.url }], more = {}) => ({ mode: "oauth", issuers, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"], ...more });

async function serverOf(auth) {
    const server = await restServer({ sources: SOURCES, auth, http: { publicUrl: "https://pk.example.com/" }, baseDir: workspace() }, { enable: ["rest", "mcp"] });
    await untilReady(server);
    return server;
}

test("auth.issuers: tokens of each issuer are accepted, each checked with its own issuer's keys; another issuer's iss is refused", async () => {
    const server = await serverOf(authOf());
    try {
        for (const issuer of [a, b]) {
            const res = await call(`${server.api}/sources`, { token: await issuer.token({ aud: REST_RESOURCE, sub: "ana" }) });
            assert.equal(res.status, 200, issuer.url);
            assert.equal(await mcpToolWorks(server, await issuer.token({ aud: MCP_RESOURCE, sub: "ana" })), true, issuer.url);
        }
        // signed with a's key, but naming b: b's keys do not verify it
        const crossed = await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana", iss: b.url }) });
        assert.equal(crossed.status, 401);
        const unknown = await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana", iss: "https://evil.example" }) });
        assert.equal(unknown.status, 401);
        // the first issuer is the one the metadata names
        const prm = await call(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.deepEqual(prm.data.authorization_servers, [a.url]);
        const mcpPrm = await call(`${server.url}/.well-known/oauth-protected-resource/mcp`);
        assert.deepEqual(mcpPrm.data.authorization_servers, [a.url]);
    } finally {
        await server.close();
    }
});

test("auth.issuers: an issuer's own audience replaces the endpoints' for its tokens; its own required scopes add to theirs (403 with a challenge)", async () => {
    const server = await serverOf(authOf([{ issuer: a.url }, { issuer: b.url, audience: ["pivotkit-b"], requiredScopes: ["pivotkit:b"] }]));
    try {
        const scoped = { claims: { scope: "pivotkit pivotkit:b" }, sub: "ben" };
        assert.equal((await call(`${server.api}/sources`, { token: await b.token({ ...scoped, aud: "pivotkit-b" }) })).status, 200);
        assert.equal((await call(`${server.api}/sources`, { token: await b.token({ ...scoped, aud: REST_RESOURCE }) })).status, 401, "b's tokens carry b's audience");
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: "pivotkit-b", sub: "ana" }) })).status, 401, "a's tokens keep the endpoint's");
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana" }) })).status, 200);
        const unscoped = await call(`${server.api}/sources`, { token: await b.token({ aud: "pivotkit-b", sub: "ben" }) });
        assert.equal(unscoped.status, 403);
        assert.equal(unscoped.data.code, "INSUFFICIENT_SCOPE");
        assert.match(unscoped.headers.get("www-authenticate"), /error="insufficient_scope".*scope="pivotkit pivotkit:b"/);
        const mcp = await mcpInitialize(server, await b.token({ aud: "pivotkit-b", sub: "ben" }));
        assert.equal(mcp.status, 403);
        assert.match(String(mcp.headers.get("www-authenticate")), /insufficient_scope/);
        assert.equal(await mcpToolWorks(server, await b.token({ ...scoped, aud: "pivotkit-b" })), true);
    } finally {
        await server.close();
    }
});

test("auth.issuers: until every issuer's metadata and keys are loaded, /readyz, REST and MCP answer 503, also to a token of a loaded issuer", async () => {
    // b's metadata cannot be read: the server keeps trying it
    b.routes["/.well-known/openid-configuration"] = (_req, res) => {
        res.writeHead(500);
        res.end();
    };
    const server = await restServer({ sources: SOURCES, auth: authOf(), http: { publicUrl: "https://pk.example.com/" }, baseDir: workspace() }, { enable: ["rest", "mcp"] });
    try {
        await until(() => server.log.some((l) => l.message === "oauth: issuer metadata loaded" && l.issuer === a.url) && b.asked.includes("/.well-known/openid-configuration"), { message: "a loaded, b asked" });
        assert.equal((await call(`${server.url}/readyz`)).status, 503);
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana" }) })).status, 503);
        assert.equal((await mcpInitialize(server, await a.token({ aud: MCP_RESOURCE, sub: "ana" }))).status, 503);
    } finally {
        delete b.routes["/.well-known/openid-configuration"];
        await server.close();
    }
});

test("options: auth.issuers is a list of distinct https issuers, not beside auth.issuer; a token exchange names its issuer when there are several", async () => {
    const one = { issuer: "https://a.example.test/" };
    const two = [one, { issuer: "https://b.example.test/" }];
    assert.doesNotThrow(() => validateOptions({ auth: authOf(two, { allowInsecureIssuer: undefined }) }));
    assert.throws(() => validateOptions({ auth: { ...authOf(two), issuer: one.issuer } }), /auth\.issuer: set it in the entries of auth\.issuers, or leave auth\.issuers out; not both/);
    assert.throws(() => validateOptions({ auth: authOf([]) }), /auth\.issuers: 1 to 10 issuers/);
    assert.throws(() => validateOptions({ auth: authOf([one, one]) }), /auth\.issuers\[1\]\.issuer: is there twice/);
    assert.throws(() => validateOptions({ auth: authOf([one, { issuer: "https://A.example.test/" }]) }), /auth\.issuers\[1\]\.issuer: is "https:\/\/a\.example\.test\/" in another spelling/);
    assert.throws(() => validateOptions({ auth: authOf([{ issuer: "ftp://a.example.test/" }]) }), /auth\.issuers\[0\]\.issuer: .*an https:\/\/ address/);
    assert.throws(() => validateOptions({ auth: authOf([{ ...one, audience: [] }]) }), /auth\.issuers\[0\]\.audience/);
    assert.throws(() => validateOptions({ auth: { mode: "token", issuers: two } }), /auth\.issuers: needs auth\.mode "oauth"/);
    const exchange = (issuer) => ({ sources: { vms: { http: { url: "https://api.example.test/vms", auth: { tokenExchange: { clientId: "p", clientSecret: { env: "X" }, audience: "api", ...(issuer ? { issuer } : {}) } } } } } });
    assert.throws(() => validateOptions({ auth: authOf(two), ...exchange() }), /sources\.vms\.http\.auth\.tokenExchange\.issuer: the server accepts tokens of 2 issuers; name the one/);
    assert.throws(() => validateOptions({ auth: authOf(two), ...exchange("https://c.example.test/") }), /tokenExchange\.issuer: "https:\/\/c\.example\.test\/" is not one of the server's issuers/);
    assert.doesNotThrow(() => validateOptions({ auth: authOf(two), ...exchange(two[1].issuer) }));
    // with one issuer it may be left out, as before
    assert.doesNotThrow(() => validateOptions({ auth: { mode: "oauth", issuer: one.issuer, resource: MCP_RESOURCE }, ...exchange() }));
});

test("check-config: each issuer on a line of its own with its audience and scopes; auth.issuer beside auth.issuers is refused", async () => {
    const auth = authOf([{ issuer: "https://a.example.test/" }, { issuer: "https://b.example.test/", audience: ["pivotkit-b"], requiredScopes: ["pivotkit:b"] }], { allowInsecureIssuer: undefined });
    const facts = factsOf((await checkConfig({ sources: SOURCES, auth, baseDir: workspace() })).text);
    assert.match(facts, /\n {2}issuer https:\/\/a\.example\.test\/ \(named to clients\)\n {2}issuer https:\/\/b\.example\.test\/ \(audience pivotkit-b, required scopes pivotkit:b\)\n/);
    await assert.rejects(checkConfig({ sources: SOURCES, auth: { ...auth, issuer: "https://a.example.test/" }, baseDir: workspace() }), /auth\.issuer: set it in the entries of auth\.issuers, or leave auth\.issuers out; not both/);
});

test("a token exchange serves the people of its issuer only: another issuer's person finds no such source, and exchangeTokenFor sends no other issuer's token", async () => {
    const issuers = [{ issuer: "https://a.example.test/" }, { issuer: "https://b.example.test/" }];
    const tokenExchange = { issuer: issuers[1].issuer, clientId: "p", clientSecret: { env: "X" }, audience: "api" };
    const context = await createContext({ log: "error", auth: authOf(issuers, { allowInsecureIssuer: undefined }), sources: { vms: { http: { url: "https://api.example.test/vms", auth: { tokenExchange } }, policy: { default: "hide", fields: { name: "show" } } } } }, { stderr: { write: () => true } });
    const person = (issuer) => callerOf("oauth", { token: "t", clientId: "claude", scopes: ["pivotkit"], expiresAt: Math.floor(Date.now() / 1000) + 600, extra: { subject: "ana", issuer } });
    try {
        const listed = async (issuer) => (await present(context, "list_sources", {}, person(issuer))).result.sources.map((s) => s.id);
        assert.deepEqual(await listed(issuers[1].issuer), ["vms"]);
        assert.deepEqual(await listed(issuers[0].issuer), []);
        await assert.rejects(present(context, "describe_source", { source: "vms" }, person(issuers[0].issuer)), (e) => e.code === "SOURCE_NOT_FOUND");
    } finally {
        await context.close();
    }
    let asked = false;
    const fetch = async () => {
        asked = true;
        return { status: 200, headers: {}, body: new Uint8Array() };
    };
    await assert.rejects(exchangeTokenFor(person(issuers[0].issuer), { url: "https://b.example.test/token", issuer: issuers[1].issuer, clientId: "p", clientSecret: "s", fetch: /** @type {any} */ (fetch) }), (e) => e.code === "NOT_ALLOWED" && /another issuer than the one that signed you in/.test(e.message));
    assert.equal(asked, false);
});
