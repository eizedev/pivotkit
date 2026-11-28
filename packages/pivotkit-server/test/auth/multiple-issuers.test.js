// More than one OAuth issuer (auth.issuers): a token is checked with the keys of the issuer its iss
// names, and only those; each issuer's own audience and required scopes; the first issuer is the
// one named to clients; a token exchange serves the people of one issuer only. Two local issuers
// (local-issuer.js) on loopback ports, both signing with a key of the same key ID.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { callerOf, checkConfig, createContext, present, validateOptions } from "pivotkit-server";
import { exchangeTokenFor } from "../../src/auth.js";
import { signedInForDelivery } from "../../src/delivery.js";
import { everyIssuerScoped } from "../../src/issuer.js";
import { call, factsOf, mcpInitialize, mcpToolWorks, restServer, untilReady, workspace } from "../helpers.js";
import { localIssuer, signingKey } from "./local-issuer.js";
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
        assert.match(String(mcp.headers.get("www-authenticate")), /error="insufficient_scope".*scope="pivotkit pivotkit:b"/);
        assert.equal(await mcpToolWorks(server, await b.token({ ...scoped, aud: "pivotkit-b" })), true);
    } finally {
        await server.close();
    }
});

test("auth.issuers: an issuer that cannot be reached holds back its own tokens only (503); the loaded issuer's pass, /readyz is 200 and names the waiting one", async () => {
    // b's metadata cannot be read: the server keeps trying it
    b.routes["/.well-known/openid-configuration"] = (_req, res) => {
        res.writeHead(500);
        res.end();
    };
    const server = await restServer({ sources: SOURCES, auth: authOf(), http: { publicUrl: "https://pk.example.com/" }, baseDir: workspace() }, { enable: ["rest", "mcp"] });
    try {
        await until(() => server.log.some((l) => l.message === "oauth: issuer metadata loaded" && l.issuer === a.url) && b.asked.includes("/.well-known/openid-configuration"), { message: "a loaded, b asked" });
        const ready = await call(`${server.url}/readyz`);
        assert.equal(ready.status, 200);
        // named by its option, never its address
        assert.deepEqual(ready.data.waiting, ["auth.issuers[1].issuer"]);
        assert.ok(server.log.some((l) => l.level === "warn" && String(l.message).includes("auth.issuers[1].issuer") && String(l.message).includes("503")), "the waiting issuer is logged");
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana" }) })).status, 200);
        assert.equal(await mcpToolWorks(server, await a.token({ aud: MCP_RESOURCE, sub: "ana" })), true);
        assert.equal((await call(`${server.api}/sources`, { token: await b.token({ aud: REST_RESOURCE, sub: "ben" }) })).status, 503);
        assert.equal((await mcpInitialize(server, await b.token({ aud: MCP_RESOURCE, sub: "ben" }))).status, 503);
        // once b loads, its tokens pass and /readyz names no issuer
        delete b.routes["/.well-known/openid-configuration"];
        await until(() => server.log.some((l) => l.message === "oauth: issuer metadata loaded" && l.issuer === b.url), { message: "b loaded", tries: 2000 });
        const after = await call(`${server.url}/readyz`);
        assert.equal(after.status, 200);
        assert.equal(after.data.waiting, undefined);
        assert.equal((await call(`${server.api}/sources`, { token: await b.token({ aud: REST_RESOURCE, sub: "ben" }) })).status, 200);
    } finally {
        delete b.routes["/.well-known/openid-configuration"];
        await server.close();
    }
});

test("auth.issuers: while no issuer is loaded, /readyz, REST and MCP answer 503", async () => {
    const dead = (_req, res) => {
        res.writeHead(500);
        res.end();
    };
    a.routes["/.well-known/openid-configuration"] = dead;
    b.routes["/.well-known/openid-configuration"] = dead;
    a.asked = [];
    b.asked = [];
    const server = await restServer({ sources: SOURCES, auth: authOf(), http: { publicUrl: "https://pk.example.com/" }, baseDir: workspace() }, { enable: ["rest", "mcp"] });
    try {
        await until(() => a.asked.length > 0 && b.asked.length > 0, { message: "both asked" });
        const ready = await call(`${server.url}/readyz`);
        assert.equal(ready.status, 503);
        assert.deepEqual(ready.data.waiting, ["auth.issuers[0].issuer", "auth.issuers[1].issuer"]);
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana" }) })).status, 503);
        assert.equal((await mcpInitialize(server, await a.token({ aud: MCP_RESOURCE, sub: "ana" }))).status, 503);
    } finally {
        delete a.routes["/.well-known/openid-configuration"];
        delete b.routes["/.well-known/openid-configuration"];
        await server.close();
    }
});

test("auth.issuers: a token with a key its issuer does not hold re-reads that issuer only; a key set that moved is followed per issuer", async () => {
    const server = await serverOf(authOf());
    try {
        // each key set is read on its first token: a's and b's are read before counting
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana" }) })).status, 200);
        assert.equal((await call(`${server.api}/sources`, { token: await b.token({ aud: REST_RESOURCE, sub: "ben" }) })).status, 200);
        a.asked = [];
        b.asked = [];
        // a key no issuer holds, under b's iss: refused, and a is not asked
        const stranger = await signingKey("k9");
        const unknown = await call(`${server.api}/sources`, { token: await b.token({ aud: REST_RESOURCE, sub: "ben", header: { kid: "k9" }, signWith: stranger.key.privateKey }) });
        assert.equal(unknown.status, 401);
        assert.ok(b.asked.includes("/.well-known/openid-configuration"), JSON.stringify(b.asked));
        assert.deepEqual(a.asked, []);
        // b rotates to a new key set at a new address: b's next token with the new key passes, a's still do
        const next = await signingKey("k2");
        b.metadata = { jwks_uri: `${b.url}/jwks-2` };
        b.routes["/jwks-2"] = { keys: [next.jwk] };
        const rotated = await b.token({ aud: REST_RESOURCE, sub: "ben", header: { kid: "k2" }, signWith: next.key.privateKey });
        // the unknown key above started the minute's wait for b: the hourly refresh is not waited for here
        assert.equal((await call(`${server.api}/sources`, { token: rotated })).status, 401, "within the minute after an unknown key, b is not read again");
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana" }) })).status, 200);
        assert.deepEqual(a.asked, [], "a's keys are not read again for b's tokens");
    } finally {
        b.metadata = {};
        delete b.routes["/jwks-2"];
        await server.close();
    }
});

test("auth.issuers: a key set that moved is followed for that issuer alone", async () => {
    const server = await serverOf(authOf());
    try {
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana" }) })).status, 200);
        a.asked = [];
        const next = await signingKey("k2");
        b.metadata = { jwks_uri: `${b.url}/jwks-2` };
        b.routes["/jwks-2"] = { keys: [next.jwk] };
        const rotated = await b.token({ aud: REST_RESOURCE, sub: "ben", header: { kid: "k2" }, signWith: next.key.privateKey });
        assert.equal((await call(`${server.api}/sources`, { token: rotated })).status, 200);
        assert.ok(b.asked.includes("/jwks-2"), JSON.stringify(b.asked));
        // b's old key is gone with its old set; a's tokens pass and a is not read again
        assert.equal((await call(`${server.api}/sources`, { token: await b.token({ aud: REST_RESOURCE, sub: "ben" }) })).status, 401);
        assert.equal((await call(`${server.api}/sources`, { token: await a.token({ aud: REST_RESOURCE, sub: "ana" }) })).status, 200);
        assert.deepEqual(a.asked, []);
    } finally {
        b.metadata = {};
        delete b.routes["/jwks-2"];
        await server.close();
    }
});

test("auth.issuers: an entry's jwksUri is where that issuer's keys are read, in place of its metadata's jwks_uri", async () => {
    // b's metadata names a key set on another origin, which is refused unless the entry names one
    b.metadata = { jwks_uri: "https://keys.example.test/jwks" };
    b.routes["/own-keys"] = { keys: [b.jwk] };
    b.asked = [];
    const server = await serverOf(authOf([{ issuer: a.url }, { issuer: b.url, jwksUri: `${b.url}/own-keys` }]));
    try {
        assert.equal((await call(`${server.api}/sources`, { token: await b.token({ aud: REST_RESOURCE, sub: "ben" }) })).status, 200);
        assert.ok(b.asked.includes("/own-keys"), JSON.stringify(b.asked));
    } finally {
        b.metadata = {};
        delete b.routes["/own-keys"];
        await server.close();
    }
});

test("everyIssuerScoped: the endpoint's scopes cover every issuer, else each issuer needs scopes of its own", () => {
    const of = (issuers) => ({ auth: authOf(issuers) });
    assert.equal(everyIssuerScoped(of([{ issuer: "https://a.example.test/" }]), ["pivotkit"]), true);
    assert.equal(everyIssuerScoped(of([{ issuer: "https://a.example.test/", requiredScopes: ["x"] }, { issuer: "https://b.example.test/", requiredScopes: ["y"] }]), []), true);
    assert.equal(everyIssuerScoped(of([{ issuer: "https://a.example.test/", requiredScopes: ["x"] }, { issuer: "https://b.example.test/" }]), []), false);
    assert.equal(everyIssuerScoped({ auth: { mode: "oauth", issuer: "https://a.example.test/" } }, []), false);
});

test("links and stores bound to a sign-in: only the first issuer's people, whose sign-in the server checks", () => {
    const options = { auth: authOf([{ issuer: "https://a.example.test/" }, { issuer: "https://b.example.test/" }]) };
    const person = (issuer) => callerOf("oauth", { token: "t", clientId: "claude", scopes: ["pivotkit"], expiresAt: Math.floor(Date.now() / 1000) + 600, extra: { subject: "ana", issuer } });
    assert.equal(signedInForDelivery(person("https://a.example.test/"), options), true);
    assert.equal(signedInForDelivery(person("https://b.example.test/"), options), false);
    // with one issuer, as before: every verified caller is that issuer's
    assert.equal(signedInForDelivery(person("https://b.example.test/"), { auth: { mode: "oauth", issuer: "https://b.example.test/" } }), true);
});

test("options: auth.issuers is a list of distinct https issuers, not beside auth.issuer; a token exchange names its issuer when there are several", async () => {
    const one = { issuer: "https://a.example.test/" };
    const two = [one, { issuer: "https://b.example.test/" }];
    assert.doesNotThrow(() => validateOptions({ auth: authOf(two, { allowInsecureIssuer: undefined }) }));
    assert.throws(() => validateOptions({ auth: { ...authOf(two), issuer: one.issuer } }), /auth\.issuer: set it in the entries of auth\.issuers, or leave auth\.issuers out; not both/);
    assert.throws(() => validateOptions({ auth: authOf([]) }), /auth\.issuers: 1 to 10 issuers/);
    const many = (n) => Array.from({ length: n }, (_, i) => ({ issuer: `https://i${i}.example.test/` }));
    assert.doesNotThrow(() => validateOptions({ auth: authOf(many(10)) }));
    assert.throws(() => validateOptions({ auth: authOf(many(11)) }), /auth\.issuers: 1 to 10 issuers/);
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
