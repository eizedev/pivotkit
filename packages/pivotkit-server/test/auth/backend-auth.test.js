// A backend's sign-in for HTTP sources (http.auth, httpSources.backends.<name>.auth): a header from a
// secret, OAuth client credentials (a client secret or a client assertion), and the RFC 8693 token
// exchange for the signed-in person; the token cache (per settings, per person with client and
// scopes, expiry, one request at a time, a backend's 401); parameters bound to claims of the
// verified token; who may see and schedule such sources; check-config and check-source. A backend
// and a token endpoint run over https on loopback (a certificate from loopbackCert in helpers.js);
// the names resolve to 127.0.0.1 through a lookup of the test's own.
// Every secret, token and error description is a sentinel that must never show up in a log line, an
// answer, check-config or check-source.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { callerOf, checkConfig, createContext, present, validateOptions } from "pivotkit-server";
import { serverTextOf } from "pivotkit-server/internal";
import { createAuthCore, exchangeTokenFor } from "../../src/auth.js";
import { checkSource } from "../../src/check-source.js";
import { authMeans, backendHeaders, tokenCache, TOKEN_LIMITS } from "../../src/sources/auth.js";
import { httpSettingsOf } from "../../src/options/http.js";
import { createGuardedFetch } from "../../src/sources/fetch.js";
import { httpMeans } from "../../src/sources/http.js";
import { withRequestId } from "../../src/request-id.js";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { call, factsOf, loopbackCert, restServer, tempDir } from "../helpers.js";
import { localIssuer } from "./local-issuer.js";
import { until } from "../../../../tests/until.js";

/** Values that must never leave the server: a secret, a person's own token, the tokens issued, an error description. */
const SECRET = "SENTINEL-client-secret-7f3a";
const HEADER_SECRET = "SENTINEL-api-key-91be";
const PERSON_TOKEN = "SENTINEL-person-token-0c2d";
const DESCRIPTION = "SENTINEL-error-description";

/** What the backend and the token endpoint answer per path, set by each test; and what they were asked. */
let routes = new Map();
/** @type {Array<{ path: string, query: string, headers: import("node:http").IncomingHttpHeaders, form: Record<string, string> | null }>} */
let asked = [];
let server;
let port = 0;
let issued = 0;

before(async () => {
    const { key, cert } = loopbackCert("api.example.test", "auth.example.test");
    server = createServer({ key, cert }, (req, res) => {
        const url = new URL(req.url ?? "/", "https://x");
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
            const form = req.headers["content-type"] === "application/x-www-form-urlencoded" ? Object.fromEntries(new URLSearchParams(body)) : null;
            asked.push({ path: url.pathname, query: url.search, headers: req.headers, form });
            const route = routes.get(url.pathname);
            if (!route) {
                res.writeHead(404, { "content-type": "application/json" });
                res.end("{}");
                return;
            }
            route(req, res, form);
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    httpMeans.fetch = createGuardedFetch({ ca: cert, lookup: (_host, options, callback) => callback(null, options?.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4) });
});

after(() => server.close());

beforeEach(() => {
    routes = new Map();
    asked = [];
    tokenCache.clear();
    delete process.env.PIVOTKIT_TEST_API_KEY;
});

/** A JSON answer. */
const json = (body, status = 200) => (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
};

/** A token endpoint that issues a new token on every request ("issued-<n>"), with these members. */
const tokenEndpoint = (more = {}) => (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ access_token: `issued-${++issued}`, token_type: "Bearer", expires_in: 300, ...more }));
};

/** The token the last backend request carried. */
const lastBearer = () => String(asked.filter((a) => a.path.startsWith("/v1/")).at(-1)?.headers.authorization ?? "");

const VMS = [
    { name: "web-1", cpu: 4, state: "running", owner: "alice@example.com" },
    { name: "db-1", cpu: 8, state: "running", owner: "carol@example.com" }
];
const POLICY = Object.freeze({ default: "hide", fields: { name: "show", cpu: "show", state: "show" } });
const backendUrl = () => `https://api.example.test:${port}/v1`;
const tokenUrl = (path = "/token") => `https://auth.example.test:${port}${path}`;

/** A secret file of its own (mode 600) holding a value. */
function secretFile(value, mode = 0o600) {
    const dir = tempDir();
    const file = join(dir, "secret");
    writeFileSync(file, `${value}\n`);
    chmodSync(file, mode);
    return file;
}

/** The options of one source "vms" (no params) over the backend "platform" with this sign-in. */
const optionsOf = (auth, more = {}) => ({
    httpSources: { backends: { platform: { url: backendUrl(), intranet: true, ...(auth ? { auth } : {}) } } },
    sources: { vms: { title: "Virtual machines", http: { backend: "platform", path: "/vms", rows: "/items" }, policy: POLICY, ttl: 0, ...(more.source ?? {}) } },
    ...Object.fromEntries(Object.entries(more).filter(([k]) => k !== "source"))
});

/** OAuth options, as a token exchange or a claim needs them. */
const OAUTH = Object.freeze({ mode: "oauth", issuer: `https://auth.example.test/`, resource: "https://pivotkit.example.test/mcp" });

/** A context whose log lines are kept. */
async function contextOf(options, level = "info") {
    const lines = [];
    const context = await createContext({ log: level, ...options }, { stderr: { write: (t) => lines.push(...String(t).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) } });
    return Object.assign(context, { lines });
}

const LOCAL = callerOf("none", undefined);
const staticToken = callerOf("token", { token: "", clientId: "etl", scopes: [], expiresAt: 0, extra: { allScopes: true } });
/** A signed-in person (an OAuth caller) with its own access token. */
const person = (subject, { client = "claude", scopes = ["pivotkit"], expiresAt = Math.floor(Date.now() / 1000) + 3600, token = PERSON_TOKEN, claims = undefined } = {}) =>
    callerOf("oauth", { token, clientId: client, scopes, expiresAt, extra: { subject, issuer: OAUTH.issuer, ...(claims ? { claims } : {}) } });
const describe = (context, caller = LOCAL, source = "vms", params = undefined) => present(context, "describe_source", { source, ...(params ? { params } : {}) }, caller);
const failure = (promise) => promise.then(
    () => assert.fail("expected an error"),
    (e) => e
);
/** Nothing of the sentinels in this text. */
const clean = (what, text) => {
    for (const s of [SECRET, HEADER_SECRET, PERSON_TOKEN, DESCRIPTION]) {
        assert.ok(!String(text).includes(s), `${what} holds ${s}`);
    }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("options: http.auth is exactly one sign-in, its secrets references, its addresses https; a token exchange and a claim need OAuth", () => {
    const cc = { tokenUrl: tokenUrl(), clientId: "pivotkit-backend", clientSecret: { env: "X" } };
    assert.doesNotThrow(() => validateOptions(optionsOf({ header: { value: { env: "X" } } })));
    assert.doesNotThrow(() => validateOptions(optionsOf({ clientCredentials: cc })));
    assert.doesNotThrow(() => validateOptions(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "pivotkit", assertion: { file: "/var/run/secrets/tokens/pivotkit" } } })));
    assert.doesNotThrow(() => validateOptions(optionsOf({ tokenExchange: { audience: "platform-api", clientId: "pivotkit", clientSecret: { env: "X" } } }, { auth: OAUTH })));
    const refused = [
        [optionsOf({}), /backends\.platform\.auth: exactly one of header, clientCredentials or tokenExchange/],
        [optionsOf({ header: { value: { env: "X" } }, clientCredentials: cc }), /exactly one of/],
        [optionsOf({ header: { value: HEADER_SECRET } }), /auth\.header\.value: must be a reference to a secret/],
        [optionsOf({ header: { value: { env: "X", file: "y" } } }), /give either env .* or file/],
        [optionsOf({ header: { name: "host", value: { env: "X" } } }), /header\.name: a header's name that the connection does not set itself/],
        [optionsOf({ header: { name: "x-a\r\nb", value: { env: "X" } } }), /header\.name/],
        [optionsOf({ header: { prefix: "Bearer \r\n", value: { env: "X" } } }), /header\.prefix: printable ASCII/],
        [optionsOf({ header: {} }), /header\.value: the secret reference/],
        [optionsOf({ clientCredentials: { ...cc, clientSecret: SECRET } }), /clientSecret: must be a reference to a secret/],
        [optionsOf({ clientCredentials: { ...cc, assertion: { file: "a" } } }), /either clientSecret or assertion/],
        [optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p" } }), /either clientSecret or assertion/],
        [optionsOf({ clientCredentials: { ...cc, tokenUrl: "http://auth.example.test/token" } }), /tokenUrl: must start with https:\/\//],
        [optionsOf({ clientCredentials: { ...cc, tokenUrl: "https://user:pw@auth.example.test/token" } }), /no user name, password or fragment/],
        [optionsOf({ clientCredentials: { ...cc, tokenUrl: "https://10.0.0.7/token" } }), /IP address as the host is refused/],
        [optionsOf({ clientCredentials: { ...cc, clientId: "" } }), /clientId: the client's id/],
        [optionsOf({ clientCredentials: { ...cc, scope: "a\nb" } }), /scope: a text of at most 1000 characters without control characters/],
        [optionsOf({ clientCredentials: { ...cc, resource: "not a uri" } }), /resource: an absolute URI/],
        [optionsOf({ clientCredentials: { ...cc, password: "x" } }), /unknown key "password"/],
        [optionsOf({ tokenExchange: { audience: "platform-api", clientId: "pivotkit", clientSecret: { env: "X" } } }), /tokenExchange: needs auth\.mode "oauth"/],
        [optionsOf({ tokenExchange: { clientId: "pivotkit", clientSecret: { env: "X" } } }, { auth: OAUTH }), /audience or resource names the backend/],
        [optionsOf({ tokenExchange: { audience: "a", clientId: "pivotkit" } }, { auth: OAUTH }), /tokenExchange\.clientSecret: the client's secret/],
        [optionsOf({ tokenExchange: { audience: "a", clientId: "pivotkit", clientSecret: { env: "X" }, assertion: { file: "a" } } }, { auth: OAUTH }), /unknown key "assertion"/],
        [optionsOf({ tokenExchange: { audience: "a", clientId: "pivotkit", clientSecret: { env: "X" }, maxAgeSeconds: 0 } }, { auth: OAUTH }), /maxAgeSeconds: 1 to 86400/],
        [optionsOf({ tokenExchange: { audience: "a", clientId: "pivotkit", clientSecret: { env: "X" }, tokenUrl: "http://a.example/t" } }, { auth: OAUTH }), /tokenUrl: must start with https:\/\//]
    ];
    for (const [options, error] of refused) {
        assert.throws(() => validateOptions(options), error);
    }
    // the sign-in's header is never also a static header, of the backend or of the source
    assert.throws(() => validateOptions({ ...optionsOf(), httpSources: { backends: { platform: { url: backendUrl(), headers: { "x-api-key": "a" }, auth: { header: { name: "X-Api-Key", value: { env: "X" } } } } } } }), /header\.name: x-api-key is also a static header/);
    assert.throws(() => validateOptions(optionsOf({ header: { name: "x-api-key", value: { env: "X" } } }, { source: { http: { backend: "platform", path: "/vms", headers: { "x-api-key": "a" } } } })), /sources\.vms\.http\.headers\.x-api-key: the backend's sign-in .* sets this header/);
    // a source's own sign-in
    assert.doesNotThrow(() => validateOptions(optionsOf(undefined, { source: { http: { url: `${backendUrl()}/vms`, intranet: true, auth: { header: { name: "x-api-key", value: { env: "X" } } } } } })));
    // claims: OAuth only, and a text claim needs a pattern or an enum
    const claimed = (param, auth) => ({ ...optionsOf(undefined, { source: { http: { backend: "platform", path: "/customers/{customer}/vms", rows: "/items" }, params: { customer: param } } }), ...(auth ? { auth } : {}) });
    assert.doesNotThrow(() => validateOptions(claimed({ type: "string", required: true, claim: "customer", pattern: "^[a-z0-9-]{1,40}$" }, OAUTH)));
    assert.throws(() => validateOptions(claimed({ type: "string", required: true, claim: "customer", pattern: "^[a-z]+$" })), /params\.customer\.claim: needs auth\.mode "oauth"/);
    assert.throws(() => validateOptions(claimed({ type: "string", required: true, claim: "customer" }, OAUTH)), /a parameter bound to a claim needs a pattern or an enum/);
    assert.throws(() => validateOptions(claimed({ type: "string", claim: "customer", pattern: "^[a-z]+$", default: "acme" }, OAUTH)), /takes neither a default/);
    // a code source's claim too
    assert.throws(() => validateOptions({ sources: { mine: { load: async () => [], params: { team: { type: "string", required: true, claim: "team", enum: ["a", "b"] } } } } }), /sources\.mine\.params\.team\.claim: needs auth\.mode "oauth"/);
});

test("header: the value read from its secret on every load (a rotated file works), after the static headers; a missing secret answers SOURCE_UNAVAILABLE and names only the reference", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile(HEADER_SECRET);
    const context = await contextOf({ ...optionsOf({ header: { name: "X-Api-Key", value: { file } } }), httpSources: { backends: { platform: { url: backendUrl(), intranet: true, headers: { "x-team": "ops" }, auth: { header: { name: "X-Api-Key", value: { file } } } } } } });
    try {
        await describe(context);
        assert.equal(asked[0].headers["x-api-key"], HEADER_SECRET);
        assert.equal(asked[0].headers["x-team"], "ops");
        assert.equal(asked[0].headers.authorization, undefined);
        writeFileSync(file, "rotated-key\n");
        await describe(context);
        assert.equal(asked[1].headers["x-api-key"], "rotated-key");
    } finally {
        await context.close();
    }
    // from a variable with a prefix
    process.env.PIVOTKIT_TEST_API_KEY = HEADER_SECRET;
    asked = [];
    const env = await contextOf(optionsOf({ header: { prefix: "Bearer ", value: { env: "PIVOTKIT_TEST_API_KEY" } } }));
    try {
        await describe(env);
        assert.equal(lastBearer(), `Bearer ${HEADER_SECRET}`);
        delete process.env.PIVOTKIT_TEST_API_KEY;
        const error = await failure(describe(env));
        assert.deepEqual([error.code, error.reason, error.details.retryable], ["SOURCE_UNAVAILABLE", "setup", false]);
        assert.ok(env.lines.some((l) => l.event === "warning" && /\$PIVOTKIT_TEST_API_KEY is not set/.test(l.message)));
        assert.equal(asked.length, 1, "no request without the sign-in");
        clean("the log", JSON.stringify(env.lines));
        clean("the error", JSON.stringify({ message: error.message, details: error.details }));
    } finally {
        await env.close();
    }
});

test("client credentials: a client secret as client_secret_basic, the token kept until 30 s before it expires and shared by every caller, one request for many callers", async (t) => {
    // the clock a kept token's expiry is counted on, moved by the test
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    routes.set("/token", tokenEndpoint({ scope: "platform:read" }));
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile(SECRET);
    const context = await contextOf(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "pivotkit backend", clientSecret: { file }, scope: "platform:read", audience: "platform-api", intranet: true } }), "debug");
    try {
        // five callers at once: one token request
        await Promise.all([LOCAL, staticToken, person("ana"), person("ben"), LOCAL].map((c) => describe(context, c)));
        const requests = asked.filter((a) => a.path === "/token");
        assert.equal(requests.length, 1);
        assert.deepEqual(requests[0].form, { grant_type: "client_credentials", scope: "platform:read", audience: "platform-api" });
        // RFC 6749 2.3.1: both parts form-encoded first
        assert.equal(requests[0].headers.authorization, `Basic ${Buffer.from(`pivotkit%20backend:${SECRET}`).toString("base64")}`);
        const token = lastBearer();
        assert.match(token, /^Bearer issued-\d+$/);
        assert.ok(asked.filter((a) => a.path === "/v1/vms").every((a) => a.headers.authorization === token));
        await describe(context, LOCAL);
        assert.equal(asked.filter((a) => a.path === "/token").length, 1, "the kept token");
        clean("the log", JSON.stringify(context.lines));
        assert.ok(!JSON.stringify(context.lines).includes(token.slice(7)), "no issued token in the log");
    } finally {
        await context.close();
    }
    // expires_in 33: kept 3 s, then asked for again
    tokenCache.clear();
    routes.set("/token", tokenEndpoint({ expires_in: 33 }));
    const short = await contextOf(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }));
    try {
        asked = [];
        await describe(short);
        await describe(short);
        assert.equal(asked.filter((a) => a.path === "/token").length, 1);
        t.mock.timers.tick(3100);
        await describe(short);
        assert.equal(asked.filter((a) => a.path === "/token").length, 2);
    } finally {
        await short.close();
    }
});

test("client credentials: a client assertion (a service account token) read on every token request; a token endpoint on a private address needs intranet", async () => {
    routes.set("/token", tokenEndpoint({ expires_in: 1 }));
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6cGl2b3RraXQifQ.sig1");
    const auth = { clientCredentials: { tokenUrl: tokenUrl(), clientId: "pivotkit", assertion: { file }, intranet: true } };
    const context = await contextOf(optionsOf(auth));
    try {
        await describe(context);
        writeFileSync(file, "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyb3RhdGVkIn0.sig2\n");
        // expires_in 1 is under the 30 s margin: never kept
        await describe(context);
        const forms = asked.filter((a) => a.path === "/token").map((a) => a.form);
        assert.equal(forms.length, 2);
        assert.deepEqual(forms[0], { grant_type: "client_credentials", client_id: "pivotkit", client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6cGl2b3RraXQifQ.sig1" });
        assert.equal(forms[1].client_assertion, "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyb3RhdGVkIn0.sig2");
        assert.equal(asked.find((a) => a.path === "/token")?.headers.authorization, undefined, "no Basic credentials with an assertion");
    } finally {
        await context.close();
    }
    // without intranet: the token endpoint resolves to loopback and is refused before anything is sent
    asked = [];
    const closed = await contextOf(optionsOf({ clientCredentials: { ...auth.clientCredentials, intranet: false } }), "debug");
    try {
        const error = await failure(describe(closed));
        assert.deepEqual([error.code, error.reason], ["SOURCE_UNAVAILABLE", "setup"]);
        assert.equal(asked.length, 0);
        assert.ok(closed.lines.some((l) => /set intranet: true in the sign-in's settings/.test(l.message)));
    } finally {
        await closed.close();
    }
});

test("a token endpoint's refusal: SOURCE_UNAVAILABLE that is not retryable, only the error code logged (never error_description), the failure kept 5 s, no last good data", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    routes.set("/token", tokenEndpoint({ expires_in: 1 }));
    const file = secretFile(SECRET);
    const context = await contextOf(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }, { source: { ttl: 0, maxStale: 3600 } }));
    try {
        await describe(context);
        routes.set("/token", json({ error: "invalid_client", error_description: DESCRIPTION }, 401));
        const error = await failure(describe(context));
        assert.deepEqual([error.code, error.reason, error.details.retryable], ["SOURCE_UNAVAILABLE", "refused", false]);
        assert.equal(error.stale, undefined);
        assert.ok(context.lines.some((l) => l.event === "warning" && l.message === "the source vms: the token endpoint answered 401 (invalid_client) for httpSources.backends.platform.auth.clientCredentials"));
        // the stable fields beside the free text: why, which backend, what it answered
        const said = context.lines.find((l) => l.message === "the source vms: the token endpoint answered 401 (invalid_client) for httpSources.backends.platform.auth.clientCredentials");
        assert.deepEqual([said.cause, said.backend, said.upstreamStatus, said.level], ["sign_in_failed", "platform", 401, "warn"]);
        // kept 5 s: no second request
        const before = asked.filter((a) => a.path === "/token").length;
        assert.equal((await failure(describe(context))).code, "SOURCE_UNAVAILABLE");
        assert.equal(asked.filter((a) => a.path === "/token").length, before);
        clean("the log", JSON.stringify(context.lines));
        clean("the error", `${error.message} ${JSON.stringify(error.details)}`);
    } finally {
        await context.close();
    }
    // an error code that is no RFC 6749 code is not logged; a server error is not "refused"
    tokenCache.clear();
    routes.set("/token", json({ error: `bad code ${DESCRIPTION}` }, 503));
    const other = await contextOf(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }));
    try {
        const error = await failure(describe(other));
        assert.deepEqual([error.code, error.reason, error.details.retryable], ["SOURCE_UNAVAILABLE", undefined, false]);
        assert.ok(other.lines.some((l) => l.message === "the source vms: the token endpoint answered 503 for httpSources.backends.platform.auth.clientCredentials"));
        clean("the log", JSON.stringify(other.lines));
    } finally {
        await other.close();
    }
});

test("REST and MCP: a refused sign-in answers with pivotkit's fixed text; no secret, token or error description in an answer or the log", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    routes.set("/token", json({ error: "invalid_grant", error_description: DESCRIPTION }, 400));
    const file = secretFile(SECRET);
    const s = await restServer(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }), { enable: ["rest", "mcp"] });
    const client = new Client({ name: "backend-auth", version: "1.0.0" });
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`)));
        const rest = await call(`${s.api}/sources/describe`, { body: { source: "vms" } });
        assert.deepEqual([rest.status, rest.data.code, rest.data.detail, rest.data.retryable], [502, "SOURCE_UNAVAILABLE", serverTextOf("SOURCE_UNAVAILABLE", "refused"), false]);
        const mcp = String(/** @type {any} */ ((await client.callTool({ name: "describe_source", arguments: { source: "vms" } })).content)[0].text);
        assert.match(mcp, /^SOURCE_UNAVAILABLE: the source's backend refused this server's access/);
        clean("the REST answer", JSON.stringify(rest.data));
        clean("the MCP answer", mcp);
        clean("the log", JSON.stringify(s.log));
        assert.ok(s.log.some((l) => l.message === "the source vms: the token endpoint answered 400 (invalid_grant) for httpSources.backends.platform.auth.clientCredentials"));
    } finally {
        await client.close();
        await s.close();
    }
});

test("a token endpoint that drops the connection: no last good data; one that hangs past the source's timeMs: the source's time limit", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    routes.set("/token", tokenEndpoint({ expires_in: 1 }));
    const file = secretFile(SECRET);
    const auth = { clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } };
    const context = await contextOf(optionsOf(auth, { source: { ttl: 0, maxStale: 3600, timeMs: 500 } }));
    try {
        await describe(context);
        routes.set("/token", (req) => req.socket.destroy());
        const dropped = await failure(describe(context));
        assert.deepEqual([dropped.code, dropped.details.retryable], ["SOURCE_UNAVAILABLE", false]);
        assert.equal(dropped.stale, undefined);
    } finally {
        await context.close();
    }
    // a token request still running when the source's time limit ends: that limit answers (the same
    // caller's last good data may stand in, as after any time limit)
    tokenCache.clear();
    routes.set("/token", tokenEndpoint({ expires_in: 1 }));
    const slow = await contextOf(optionsOf(auth, { source: { ttl: 0, maxStale: 3600, timeMs: 500 } }));
    try {
        await describe(slow);
        routes.set("/token", (req, res) => setTimeout(() => tokenEndpoint({ expires_in: 1 })(req, res), 1500));
        const late = await describe(slow);
        assert.ok(late.result.stale, "the source's time limit, after which last good data stands in");
    } finally {
        await slow.close();
    }
});

test("races: a caller that goes away does not fail others waiting for the same token; two 401s at once both ask once more and share the new token", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    // the token endpoint answers once the test lets it, after the first caller went away
    let answer;
    const answered = new Promise((resolve) => (answer = resolve));
    routes.set("/token", (req, res) => answered.then(() => tokenEndpoint()(req, res)));
    const file = secretFile(SECRET);
    const context = await contextOf(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }));
    try {
        const gone = new AbortController();
        const first = present(context, "describe_source", { source: "vms" }, LOCAL, { signal: gone.signal });
        const second = describe(context, staticToken);
        await until(() => asked.some((a) => a.path === "/token"), { message: "the token request was sent" });
        gone.abort(new Error("went away"));
        await assert.rejects(first);
        answer();
        assert.equal((await second).result.fields.length, 3);
        assert.equal(asked.filter((a) => a.path === "/token").length, 1);
        // the backend stops taking the kept token: both loads at once get 401, both ask once more
        const old = lastBearer();
        asked = [];
        routes.set("/v1/vms", (req, res) => (req.headers.authorization === old ? json({}, 401)(req, res) : json({ items: VMS })(req, res)));
        const [a, b] = await Promise.all([describe(context, LOCAL), describe(context, person("ana"))]);
        assert.equal(a.result.fields.length, 3);
        assert.equal(b.result.fields.length, 3);
        assert.equal(asked.filter((x) => x.path === "/token").length, 1, "one new token for both");
    } finally {
        await context.close();
    }
});

test("a token endpoint's answer is checked: a token with a line break, another token type or none is refused; a bad expires_in counts as 60 s", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile(SECRET);
    const auth = { clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } };
    for (const body of [{ access_token: "a\r\nx-injected: 1", token_type: "Bearer" }, { access_token: "abc", token_type: "mac" }, { token_type: "Bearer" }, { access_token: "a b", token_type: "Bearer" }, "not json"]) {
        tokenCache.clear();
        asked = [];
        routes.set("/token", json(body));
        const context = await contextOf(optionsOf(auth));
        try {
            const error = await failure(describe(context));
            assert.deepEqual([error.code, error.reason], ["SOURCE_UNAVAILABLE", "setup"], JSON.stringify(body));
            assert.ok(!asked.some((a) => a.path === "/v1/vms"), "no backend request with a bad token");
        } finally {
            await context.close();
        }
    }
    // expires_in as text or out of range: 60 s (kept 30 s)
    tokenCache.clear();
    asked = [];
    routes.set("/token", tokenEndpoint({ expires_in: "3600" }));
    const context = await contextOf(optionsOf(auth));
    try {
        await describe(context);
        await describe(context);
        assert.equal(asked.filter((a) => a.path === "/token").length, 1);
    } finally {
        await context.close();
    }
});

test("a backend's 401: the token it was sent is dropped and the page asked once more with a new one, never twice", async () => {
    const file = secretFile(SECRET);
    routes.set("/token", tokenEndpoint());
    let refuse = 1;
    routes.set("/v1/vms", (req, res) => (refuse-- > 0 ? json({}, 401)(req, res) : json({ items: VMS })(req, res)));
    const context = await contextOf(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }));
    try {
        assert.equal((await describe(context)).result.fields.length, 3);
        const backend = asked.filter((a) => a.path === "/v1/vms");
        assert.equal(backend.length, 2);
        assert.notEqual(backend[0].headers.authorization, backend[1].headers.authorization);
        assert.equal(asked.filter((a) => a.path === "/token").length, 2);
        // always 401: one retry, then the backend's refusal
        asked = [];
        refuse = 99;
        const error = await failure(describe(context));
        assert.deepEqual([error.code, error.reason], ["SOURCE_UNAVAILABLE", "refused"]);
        assert.equal(asked.filter((a) => a.path === "/v1/vms").length, 2);
    } finally {
        await context.close();
    }
});

test("token exchange: the person's token goes as subject_token to the token endpoint only, never to the backend; the exchanged token kept per person, client and scopes", async () => {
    routes.set("/xchg", tokenEndpoint());
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile(SECRET);
    const auth = { tokenExchange: { tokenUrl: tokenUrl("/xchg"), audience: "platform-api", scope: "platform:read", clientId: "pivotkit-backend", clientSecret: { file }, intranet: true } };
    const context = await contextOf(optionsOf(auth, { auth: OAUTH }), "debug");
    try {
        const ana = person("ana");
        await describe(context, ana);
        const exchanges = asked.filter((a) => a.path === "/xchg");
        assert.equal(exchanges.length, 1);
        assert.deepEqual(exchanges[0].form, { grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: PERSON_TOKEN, subject_token_type: "urn:ietf:params:oauth:token-type:access_token", requested_token_type: "urn:ietf:params:oauth:token-type:access_token", audience: "platform-api", scope: "platform:read" });
        assert.equal(exchanges[0].headers.authorization, `Basic ${Buffer.from(`pivotkit-backend:${SECRET}`).toString("base64")}`);
        assert.match(lastBearer(), /^Bearer issued-\d+$/);
        // the same person, client and scopes: the kept token
        await describe(context, person("ana"));
        assert.equal(asked.filter((a) => a.path === "/xchg").length, 1);
        // another client, other scopes, another person: an exchange of their own
        await describe(context, person("ana", { client: "other-client" }));
        await describe(context, person("ana", { scopes: ["pivotkit", "admin"] }));
        await describe(context, person("ben"));
        assert.equal(asked.filter((a) => a.path === "/xchg").length, 4);
        // the person's token reached nothing but the token endpoint
        for (const a of asked.filter((x) => x.path !== "/xchg")) {
            clean(`the request to ${a.path}`, JSON.stringify(a));
        }
        clean("the log", JSON.stringify(context.lines));
    } finally {
        await context.close();
    }
});

test("token exchange: an exchanged token never outlives the person's own token or maxAgeSeconds; a backend's 401 asks again; its aud is compared", async (t) => {
    // the clock the person's token and maxAgeSeconds are counted on, moved by the test
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile(SECRET);
    // a JWT for another audience: used, with a warning
    const jwtFor = (aud) => `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ aud })).toString("base64url")}.sig`;
    routes.set("/xchg", (_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ access_token: `${jwtFor("someone-else")}${++issued}`, token_type: "N_A", issued_token_type: "urn:ietf:params:oauth:token-type:access_token", expires_in: 3600 }));
    });
    const auth = { tokenExchange: { tokenUrl: tokenUrl("/xchg"), audience: "platform-api", clientId: "p", clientSecret: { file }, intranet: true } };
    const context = await contextOf(optionsOf(auth, { auth: OAUTH }));
    try {
        // the person's token expires in 1 s
        const soon = person("ana", { expiresAt: Math.floor(Date.now() / 1000) + 1 });
        await describe(context, soon);
        assert.ok(context.lines.some((l) => l.event === "warning" && /the token's aud does not name the requested audience platform-api/.test(l.message)));
        t.mock.timers.tick(2000);
        await describe(context, person("ana"));
        assert.equal(asked.filter((a) => a.path === "/xchg").length, 2, "exchanged again after the person's token expired");
    } finally {
        await context.close();
    }
    tokenCache.clear();
    asked = [];
    const short = await contextOf(optionsOf({ tokenExchange: { ...auth.tokenExchange, maxAgeSeconds: 3 } }, { auth: OAUTH }));
    try {
        await describe(short, person("ana"));
        await describe(short, person("ana"));
        assert.equal(asked.filter((a) => a.path === "/xchg").length, 1);
        t.mock.timers.tick(3100);
        await describe(short, person("ana"));
        assert.equal(asked.filter((a) => a.path === "/xchg").length, 2, "maxAgeSeconds");
    } finally {
        await short.close();
    }
});

test("token exchange: the token endpoint from the issuer's metadata, only on the issuer's own origin", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    routes.set("/oauth/token", tokenEndpoint());
    const file = secretFile(SECRET);
    const issuer = `https://auth.example.test:${port}/`;
    const original = authMeans.discover;
    let metadata = { issuer, token_endpoint: `https://auth.example.test:${port}/oauth/token` };
    authMeans.discover = async () => metadata;
    const auth = { tokenExchange: { audience: "platform-api", clientId: "p", clientSecret: { file }, intranet: true } };
    try {
        const context = await contextOf(optionsOf(auth, { auth: { ...OAUTH, issuer } }));
        try {
            await describe(context, person("ana"));
            assert.equal(asked.filter((a) => a.path === "/oauth/token").length, 1);
        } finally {
            await context.close();
        }
        tokenCache.clear();
        metadata = { issuer, token_endpoint: "https://elsewhere.example.test/token" };
        const elsewhere = await contextOf(optionsOf(auth, { auth: { ...OAUTH, issuer } }));
        try {
            const error = await failure(describe(elsewhere, person("ana")));
            assert.deepEqual([error.code, error.reason], ["SOURCE_UNAVAILABLE", "setup"]);
            assert.ok(elsewhere.lines.some((l) => /names no https:\/\/ token_endpoint on the issuer's origin; set tokenExchange\.tokenUrl/.test(l.message)));
        } finally {
            await elsewhere.close();
        }
    } finally {
        authMeans.discover = original;
    }
});

test("token exchange: the issuer's metadata is read under auth.issuer's rules (auth.intranet), and a refused private issuer names the setting", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    routes.set("/oauth/token", tokenEndpoint());
    const file = secretFile(SECRET);
    const issuer = `https://auth.example.test:${port}/`;
    const original = authMeans.discover;
    const rulesSeen = [];
    authMeans.discover = async (given, rules) => {
        rulesSeen.push(rules);
        return { issuer: given, token_endpoint: `https://auth.example.test:${port}/oauth/token` };
    };
    const auth = { tokenExchange: { audience: "platform-api", clientId: "p", clientSecret: { file }, intranet: true } };
    try {
        for (const intranet of [true, undefined]) {
            tokenCache.clear();
            const context = await contextOf(optionsOf(auth, { auth: { ...OAUTH, issuer, ...(intranet ? { intranet } : {}) } }));
            try {
                await describe(context, person("ana"));
            } finally {
                await context.close();
            }
            assert.equal(rulesSeen.at(-1)?.intranet, intranet === true, `auth.intranet ${intranet}`);
        }
    } finally {
        authMeans.discover = original;
    }
    // the real discover: an issuer on a loopback address is refused without auth.intranet
    tokenCache.clear();
    const refused = await contextOf(optionsOf(auth, { auth: { ...OAUTH, issuer: `https://127.0.0.1:${port}/` } }));
    try {
        const error = await failure(describe(refused, person("ana")));
        assert.equal(error.code, "SOURCE_UNAVAILABLE");
        assert.ok(refused.lines.some((l) => /the issuer's metadata could not be read for the token endpoint; for an issuer on an internal address set auth\.intranet: true/.test(l.message)), JSON.stringify(refused.lines));
    } finally {
        await refused.close();
    }
});

test("a source only a signed-in person can use: not listed and not found without a subject, never schedulable", async () => {
    routes.set("/xchg", tokenEndpoint());
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile(SECRET);
    const auth = { tokenExchange: { tokenUrl: tokenUrl("/xchg"), audience: "platform-api", clientId: "p", clientSecret: { file }, intranet: true } };
    const options = { ...optionsOf(auth, { auth: OAUTH }), sources: { ...optionsOf(auth).sources, open: { http: { url: `${backendUrl()}/vms`, intranet: true, rows: "/items" }, policy: POLICY, ttl: 0 } } };
    const context = await contextOf(options);
    try {
        const noSubject = callerOf("oauth", { token: PERSON_TOKEN, clientId: "claude", scopes: [], expiresAt: 0, extra: { subject: null, issuer: OAUTH.issuer } });
        for (const caller of [LOCAL, staticToken, noSubject]) {
            const listed = (await present(context, "list_sources", {}, caller)).result.sources.map((s) => s.id);
            assert.deepEqual(listed, ["open"]);
            const error = await failure(describe(context, caller));
            assert.equal(error.code, "SOURCE_NOT_FOUND");
            assert.doesNotMatch(error.message, /did you mean "vms"/);
        }
        assert.equal(asked.length, 0, "nothing exchanged for a caller without a subject");
        const listed = (await present(context, "list_sources", {}, person("ana"))).result.sources;
        assert.deepEqual(listed.map((s) => [s.id, s.schedulable]), [["vms", false], ["open", true]]);
        const schedule = await failure(present(context, "draft_schedule", { source: "vms", view: { rows: ["state"], values: [{ field: "cpu", agg: "sum" }] }, name: "weekly", cron: "0 8 * * 1" }, person("ana")));
        assert.equal(schedule.code, "NOT_SCHEDULABLE");
        assert.match(schedule.message, /a schedule runs without a signed-in person/);
        assert.equal(asked.length, 0, "no exchange for a schedule");
    } finally {
        await context.close();
    }
});

test("claims: only the claims the configuration names reach a caller, email only when verified; a claim-bound value fills the address, is checked like a caller's and is never said back", async () => {
    const local = await localIssuer();
    const issuer = local.url;
    const RESOURCE = "http://127.0.0.1/mcp";
    /** What the code source was given. */
    const loads = [];
    const auth = { mode: "oauth", issuer, resource: RESOURCE, allowInsecureIssuer: true };
    const options = {
        auth,
        httpSources: { backends: { platform: { url: backendUrl(), intranet: true } } },
        sources: {
            vms: { http: { backend: "platform", path: "/customers/{customer}/vms", query: { state: "{state}" }, rows: "/items" }, params: { customer: { type: "string", required: true, claim: "customer", pattern: "^[a-z0-9-]{1,40}$" }, state: { type: "string", enum: ["running", "stopped"] } }, policy: POLICY, ttl: 60 },
            mail: { http: { backend: "platform", path: "/by-mail/{email}", rows: "/items" }, params: { email: { type: "string", required: true, claim: "email", pattern: "^[^@/]+@[a-z0-9.-]+$" } }, policy: POLICY },
            team: { load: async (params, { caller }) => (loads.push({ params: { ...params }, claims: { ...caller.claims } }), [{ team: params.team, cpu: 1 }]), params: { team: { type: "string", required: true, claim: "team", enum: ["red", "blue"] } }, policy: { default: "show" } }
        }
    };
    const core = await createAuthCore(options, { env: {}, log: { info() {}, warn() {}, debug() {}, error() {} }, loopback: true });
    const callerFor = async (claims) => {
        const jwt = await local.token({ claims: { client_id: "claude", sub: "ana", ...claims }, aud: RESOURCE });
        return callerOf("oauth", await core.verify(jwt, { audience: [RESOURCE], resource: new URL(RESOURCE) }), auth);
    };
    const context = await contextOf(options, "debug");
    try {
        routes.set("/v1/customers/acme/vms", json({ items: VMS }));
        const ana = await callerFor({ customer: "acme", team: "red", department: "SENTINEL-not-named", email: "ana@example.com" });
        assert.deepEqual(ana.claims, { customer: "acme", team: "red" }, "only named claims; email without email_verified left out");
        await describe(context, ana, "vms", { state: "running" });
        assert.deepEqual(asked.map((a) => `${a.path}${a.query}`), ["/v1/customers/acme/vms?state=running"]);
        // the caller cannot set it, and list_sources does not offer it
        const set = await failure(describe(context, ana, "vms", { customer: "other" }));
        assert.deepEqual([set.code, set.message], ["INVALID_INPUT", "params.customer is set by the server from your sign-in; leave it out"]);
        const listed = (await present(context, "list_sources", {}, ana)).result.sources.find((s) => s.id === "vms");
        assert.deepEqual(listed.params.map((p) => p.name), ["state"]);
        assert.equal(listed.schedulable, false);
        // a missing claim names it; a value with a path step or outside the pattern is refused before any request
        asked = [];
        const missing = await failure(describe(context, await callerFor({ team: "red" }), "vms"));
        assert.deepEqual([missing.code, missing.message], ["NOT_ALLOWED", "your sign-in has no customer claim, which the source vms needs; ask the operator"]);
        for (const customer of ["../admin", "a/b", "a%2Fb", "a?x=1", "ACME"]) {
            const error = await failure(describe(context, await callerFor({ customer }), "vms"));
            assert.equal(error.code, "NOT_ALLOWED", customer);
            assert.ok(!error.message.includes(customer), "the claim's value is never said back");
        }
        assert.equal(asked.length, 0);
        // a backend's 404 for the claim's value: the caller's own values only, never the claim's
        routes.set("/v1/customers/zeta/vms", json({}, 404));
        const nothing = await failure(describe(context, await callerFor({ customer: "zeta" }), "vms", { state: "stopped" }));
        assert.deepEqual([nothing.code, nothing.message], ["DATA_NOT_AVAILABLE", "nothing you may see for state=stopped: check the value"]);
        // email: only a verified one
        const unverified = await failure(describe(context, await callerFor({ email: "ana@example.com", email_verified: false }), "mail"));
        assert.match(unverified.message, /no email claim \(a verified one: the token's email_verified is true\)/);
        routes.set("/v1/by-mail/ana%40example.com", json({ items: VMS }));
        await describe(context, await callerFor({ email: "ana@example.com", email_verified: true }), "mail");
        assert.equal(asked.at(-1)?.path, "/v1/by-mail/ana%40example.com");
        // a code source gets the claim through its param and in caller.claims (only the named ones)
        await describe(context, ana, "team");
        assert.deepEqual(loads, [{ params: { team: "red" }, claims: { customer: "acme", team: "red" } }]);
        // without a subject the claim-bound sources are not there
        const noSubject = callerOf("oauth", { token: "t", clientId: "claude", scopes: [], expiresAt: 0, extra: { subject: null, issuer, claims: { customer: "acme" } } });
        assert.deepEqual((await present(context, "list_sources", {}, noSubject)).result.sources.map((s) => s.id), []);
        // claims are never logged, not even at debug
        const log = JSON.stringify(context.lines);
        for (const value of ["acme", "zeta", "ana@example.com", "SENTINEL-not-named"]) {
            assert.ok(!log.includes(value), value);
        }
    } finally {
        await context.close();
        core.close();
        await local.close();
    }
});

test("check-config: how each backend authentication is made and where its secrets come from (a file by its full path); a missing variable or file is a PROBLEM the server starts with, a readable file a warning; never a value", async () => {
    const readable = secretFile(SECRET, 0o644);
    const options = {
        auth: OAUTH,
        httpSources: { backends: { platform: { url: backendUrl(), auth: { clientCredentials: { tokenUrl: tokenUrl(), clientId: "pivotkit-backend", clientSecret: { file: readable }, scope: "platform:read" } } } } },
        sources: {
            vms: { http: { backend: "platform", path: "/vms", rows: "/items" }, policy: POLICY },
            hosts: { http: { backend: "platform", path: "/hosts", rows: "/items" }, policy: POLICY },
            keyed: { http: { url: `${backendUrl()}/keyed`, auth: { header: { name: "x-api-key", value: { env: "PIVOTKIT_TEST_MISSING" } } } }, policy: POLICY },
            mine: { http: { url: `${backendUrl()}/mine`, auth: { tokenExchange: { audience: "platform-api", clientId: "pivotkit-backend", clientSecret: { env: "PIVOTKIT_TEST_API_KEY" } } } }, policy: POLICY, link: "https://platform.example.com/mine" },
            own: { http: { url: `${backendUrl()}/customers/{customer}` }, params: { customer: { type: "string", required: true, claim: "customer", pattern: "^[a-z]+$" } }, policy: POLICY }
        }
    };
    const result = await checkConfig(options, { env: { PIVOTKIT_TEST_API_KEY: SECRET } });
    const text = factsOf(result.text);
    assert.match(text, /\n {4}backend authentication: client credentials as pivotkit-backend at https:\/\/auth\.example\.test:\d+\/token, scope platform:read \(httpSources\.backends\.platform\.auth\)\n {6}client secret from the file \S+\n/);
    assert.ok(text.includes(`client secret from the file ${readable}`), result.text);
    if (process.platform === "win32") {
        // Windows has no such modes: the file takes its folder's permissions, and nothing is warned of
        assert.doesNotMatch(text, /can be read by other users/);
    } else {
        assert.match(text, /WARNING \(HTTP sources\): httpSources\.backends\.platform\.auth\.clientCredentials\.clientSecret \(.*\) can be read by other users of this machine \(mode 644\)/);
        // a backend's secrets are checked once, for all its sources
        assert.equal(text.match(/can be read by other users/g)?.length, 1);
    }
    assert.match(text, /\n {4}backend authentication: header x-api-key\n {6}value from \$PIVOTKIT_TEST_MISSING\n/);
    // the server starts with it; the source that uses it answers SOURCE_UNAVAILABLE
    assert.match(text, /PROBLEM: sources\.keyed\.http\.auth\.header\.value: \$PIVOTKIT_TEST_MISSING is not set -> the server starts; keyed answers SOURCE_UNAVAILABLE/);
    assert.match(text, /\n {4}backend authentication: token exchange for audience platform-api at the issuer's token endpoint as pivotkit-backend\n {6}client secret from \$PIVOTKIT_TEST_API_KEY\n {6}each token reused up to 300 s; only for a signed-in person\n/);
    assert.match(text, /\n {2}mine:\n(?: {4}[^\n]*\n)*? {4}create_link: links to the source's page \(sources\.<id>\.link\)\n {4}draft_schedule: none \(token exchange: the data is the signed-in person's\)\n/);
    assert.match(text, /\n {2}own:\n(?: {4}[^\n]*\n)*? {4}draft_schedule: none \(a claim: the data is the signed-in person's\)\n/);
    assert.match(text, /from the person's token: customer \(claim customer\); listed only for a signed-in person/);
    assert.equal(result.problems, 1);
    assert.equal(result.stops, 0);
    clean("check-config", text);
});

test("check-source: the sign-in's outcome (status, error code, scope, expires_in), never a token; a token exchange asks the token endpoint without a person's token and loads nothing", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    routes.set("/token", tokenEndpoint({ scope: "platform:read", expires_in: 600 }));
    const file = secretFile(SECRET);
    const cc = optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "pivotkit-backend", clientSecret: { file }, intranet: true } });
    let out = await checkSource(cc, "vms", {}, { fetch: httpMeans.fetch });
    assert.ok(out.ok, out.text);
    assert.match(out.text, /backend auth: client credentials at https:\/\/auth\.example\.test:\d+\/token: the token endpoint answered 200, expires_in 600 s, scope platform:read/);
    assert.doesNotMatch(out.text, /issued-/);
    clean("check-source", out.text);
    tokenCache.clear();
    routes.set("/token", json({ error: "invalid_client", error_description: DESCRIPTION }, 401));
    out = await checkSource(cc, "vms", {}, { fetch: httpMeans.fetch });
    assert.equal(out.ok, false);
    assert.match(out.text, /the token endpoint answered 401 \(invalid_client\)/);
    assert.match(out.text, /a caller gets: SOURCE_UNAVAILABLE: the source's backend refused this server's access/);
    clean("check-source", out.text);
    // a missing secret: the reference named
    tokenCache.clear();
    out = await checkSource(optionsOf({ header: { value: { env: "PIVOTKIT_TEST_MISSING" } } }), "vms", {}, { fetch: httpMeans.fetch });
    assert.equal(out.ok, false);
    assert.match(out.text, /\$PIVOTKIT_TEST_MISSING is not set/);
    // token exchange: no person's token here; the endpoint answers and takes the client
    asked = [];
    routes.set("/xchg", json({ error: "invalid_request", error_description: DESCRIPTION }, 400));
    const exchange = optionsOf({ tokenExchange: { tokenUrl: tokenUrl("/xchg"), audience: "platform-api", clientId: "pivotkit-backend", clientSecret: { file }, intranet: true } }, { auth: OAUTH });
    out = await checkSource(exchange, "vms", {}, { fetch: httpMeans.fetch });
    assert.ok(out.ok, out.text);
    assert.match(out.text, /backend auth: token exchange at https:\/\/auth\.example\.test:\d+\/xchg: the token endpoint answered 400 \(invalid_request\)/);
    assert.match(out.text, /OK \(not loaded: token exchange\)/);
    assert.equal(asked.filter((a) => a.path === "/v1/vms").length, 0);
    assert.equal(asked[0].form?.subject_token, undefined);
    routes.set("/xchg", json({ error: "invalid_client" }, 401));
    out = await checkSource(exchange, "vms", {}, { fetch: httpMeans.fetch });
    assert.equal(out.ok, false);
    assert.match(out.text, /refused the client pivotkit-backend/);
    for (const [status, body] of [[404, {}], [503, {}], [200, { access_token: "x", token_type: "Bearer" }]]) {
        routes.set("/xchg", json(body, status));
        out = await checkSource(exchange, "vms", {}, { fetch: httpMeans.fetch });
        assert.equal(out.ok, false, String(status));
        assert.match(out.text, /did not answer as one does .* check vms|did not answer as one does/);
    }
    clean("check-source", out.text);
    // a claim-bound parameter: --param stands in for the claim
    routes.set("/v1/customers/acme/vms", json({ items: VMS }));
    const claimed = { ...optionsOf(undefined, { source: { http: { backend: "platform", path: "/customers/{customer}/vms", rows: "/items" }, params: { customer: { type: "string", required: true, claim: "customer", pattern: "^[a-z]+$" } } } }), auth: OAUTH };
    out = await checkSource(claimed, "vms", { customer: "acme" }, { fetch: httpMeans.fetch });
    assert.ok(out.ok, out.text);
});

test("the token cache holds at most TOKEN_LIMITS.entries tokens, the oldest out first", async () => {
    routes.set("/xchg", tokenEndpoint());
    const file = secretFile(SECRET);
    const options = optionsOf({ tokenExchange: { tokenUrl: tokenUrl("/xchg"), audience: "a", clientId: "p", clientSecret: { file }, intranet: true } }, { auth: OAUTH });
    validateOptions(options);
    const auth = httpSettingsOf(options.sources.vms).auth;
    const quiet = { info() {}, warn() {}, debug() {}, error() {} };
    const first = person("p0");
    for (let i = 0; i <= TOKEN_LIMITS.entries; i++) {
        await backendHeaders(auth, i === 0 ? first : person(`p${i}`), { id: "vms", log: quiet, fetch: httpMeans.fetch });
    }
    assert.equal(tokenCache.size(), TOKEN_LIMITS.entries);
    const before = asked.length;
    await backendHeaders(auth, person("p0"), { id: "vms", log: quiet, fetch: httpMeans.fetch });
    assert.equal(asked.length, before + 1, "the oldest was dropped");
});

test("review: the quick-start page's titles leave out sources only a signed-in person can use", async () => {
    const file = secretFile(SECRET);
    const options = { ...optionsOf({ tokenExchange: { tokenUrl: tokenUrl("/xchg"), audience: "a", clientId: "p", clientSecret: { file }, intranet: true } }, { auth: OAUTH }), sources: { ...optionsOf().sources, open: { http: { url: `${backendUrl()}/vms`, intranet: true, rows: "/items" }, policy: POLICY }, claimed: { http: { url: `${backendUrl()}/c/{customer}`, intranet: true }, params: { customer: { type: "string", required: true, claim: "customer", pattern: "^[a-z]+$" } }, policy: POLICY } } };
    const context = await contextOf(options);
    try {
        // vms (a token exchange through its backend) and claimed (a claim) are left out
        assert.deepEqual(context.registry.titles().map((t) => t.id), ["open"]);
    } finally {
        await context.close();
    }
});

test("review: an exchanged token never outlives a person's token whose exp is fractional, and is not kept when its exp is unknown", async (t) => {
    // the clock the person's token is counted on, moved by the test
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    routes.set("/xchg", tokenEndpoint());
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile(SECRET);
    const context = await contextOf(optionsOf({ tokenExchange: { tokenUrl: tokenUrl("/xchg"), audience: "a", clientId: "p", clientSecret: { file }, intranet: true } }, { auth: OAUTH }));
    try {
        const exp = Date.now() / 1000 + 1.9;
        await describe(context, person("ana", { expiresAt: exp }));
        t.mock.timers.tick(2100);
        await describe(context, person("ana"));
        assert.equal(asked.filter((a) => a.path === "/xchg").length, 2, "a fractional exp still bounds the exchanged token");
        tokenCache.clear();
        asked = [];
        await describe(context, person("ben", { expiresAt: null }));
        await describe(context, person("ben", { expiresAt: null }));
        assert.equal(asked.filter((a) => a.path === "/xchg").length, 2, "nothing kept without the person's exp");
    } finally {
        await context.close();
    }
});

test("review: a Bearer answer whose issued_token_type is not an access token is refused; the issuer's metadata is read once for callers at once", async () => {
    routes.set("/v1/vms", json({ items: VMS }));
    const file = secretFile(SECRET);
    routes.set("/token", tokenEndpoint({ issued_token_type: "urn:ietf:params:oauth:token-type:refresh_token" }));
    const cc = await contextOf(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }));
    try {
        assert.deepEqual([(await failure(describe(cc))).reason], ["setup"]);
    } finally {
        await cc.close();
    }
    routes.set("/oauth/token", tokenEndpoint());
    const issuer = `https://auth.example.test:${port}/`;
    const original = authMeans.discover;
    let reads = 0;
    authMeans.discover = async () => {
        reads++;
        await sleep(100);
        return { issuer, token_endpoint: `https://auth.example.test:${port}/oauth/token` };
    };
    try {
        const context = await contextOf(optionsOf({ tokenExchange: { audience: "a", clientId: "p", clientSecret: { file }, intranet: true } }, { auth: { ...OAUTH, issuer } }));
        try {
            await Promise.all(["a1", "a2", "a3"].map((p) => describe(context, person(p))));
            assert.equal(reads, 1);
        } finally {
            await context.close();
        }
    } finally {
        authMeans.discover = original;
    }
});

test("review: the log: a setup warning once per interval, a cached failure with the request id, a hidden person-bound source, a backend 401 to a static header, unreadable secrets at start", async () => {
    routes.set("/v1/vms", json({}, 401));
    const context = await contextOf(optionsOf({ header: { value: { env: "PIVOTKIT_TEST_API_KEY" } } }));
    try {
        // at start: the secret that cannot be read, by its reference
        assert.ok(context.lines.some((l) => l.event === "warning" && /httpSources\.backends\.platform\.auth\.header\.value: \$PIVOTKIT_TEST_API_KEY is not set/.test(l.message)), "start warning");
        const before = context.lines.length;
        await failure(describe(context));
        await failure(describe(context));
        const said = context.lines.slice(before).filter((l) => /cannot be made/.test(l.message ?? ""));
        assert.equal(said.length, 1, "once per interval");
        process.env.PIVOTKIT_TEST_API_KEY = HEADER_SECRET;
        await failure(describe(context));
        assert.ok(context.lines.some((l) => l.event === "warning" && /answered 401 to the header from httpSources\.backends\.platform\.auth\.header\.value: check the secret/.test(l.message)));
        clean("the log", JSON.stringify(context.lines));
    } finally {
        await context.close();
    }
    routes.set("/v1/vms", json({ items: VMS }));
    routes.set("/token", json({ error: "invalid_client" }, 401));
    const file = secretFile(SECRET);
    const cached = await contextOf(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }));
    try {
        await failure(describe(cached));
        await failure(withRequestId("req-cached-1", () => describe(cached)));
        assert.ok(cached.lines.some((l) => l.event === "info" && l.message === "the source vms: token request failed (cached)" && l.requestId === "req-cached-1"));
    } finally {
        await cached.close();
    }
    const bound = await contextOf(optionsOf({ tokenExchange: { tokenUrl: tokenUrl("/xchg"), audience: "a", clientId: "p", clientSecret: { file }, intranet: true } }, { auth: OAUTH }));
    try {
        const noSubject = callerOf("oauth", { token: PERSON_TOKEN, clientId: "claude", scopes: [], expiresAt: 0, extra: { subject: null, issuer: OAUTH.issuer } });
        const error = await failure(describe(bound, noSubject));
        assert.equal(error.code, "SOURCE_NOT_FOUND");
        assert.ok(bound.lines.some((l) => l.event === "info" && /only a signed-in person can use .* the caller's token has no subject/.test(l.message) && l.source === "vms"));
    } finally {
        await bound.close();
    }
});

test("review: check-config warns of a token endpoint off the issuer's origin and of one on a private address without intranet; check-source names the client settings on a refusal", async () => {
    const options = {
        auth: { ...OAUTH, issuer: "https://login.example.test/" },
        sources: {
            other: { http: { url: "https://api.example.test/x", auth: { tokenExchange: { tokenUrl: "https://elsewhere.example.test/token", audience: "a", clientId: "p", clientSecret: { env: "PIVOTKIT_TEST_API_KEY" } } } }, policy: POLICY },
            local: { http: { url: "https://api.example.test/y", auth: { clientCredentials: { tokenUrl: "https://localhost/token", clientId: "p", clientSecret: { env: "PIVOTKIT_TEST_API_KEY" } } } }, policy: POLICY }
        }
    };
    const { text } = await checkConfig(options, { env: { PIVOTKIT_TEST_API_KEY: SECRET } });
    assert.match(factsOf(text), /WARNING \(HTTP sources\): sources\.other\.http\.auth\.tokenExchange\.tokenUrl: the person's token goes to elsewhere\.example\.test, not to the issuer's login\.example\.test/);
    assert.match(factsOf(text), /WARNING \(HTTP sources\): sources\.local\.http\.auth\.clientCredentials\.tokenUrl: localhost is a loopback or private address, which is refused unless intranet: true is set there/);
    routes.set("/v1/vms", json({ items: VMS }));
    routes.set("/token", json({ error: "invalid_client" }, 401));
    const file = secretFile(SECRET);
    const out = await checkSource(optionsOf({ clientCredentials: { tokenUrl: tokenUrl(), clientId: "p", clientSecret: { file }, intranet: true } }), "vms", {}, { fetch: httpMeans.fetch });
    assert.match(out.text, /check httpSources\.backends\.platform\.auth\.clientCredentials\.clientId and clientSecret/);
});

test("check-config warns of a token exchange without scope, since some providers then issue a token without scopes", async () => {
    const exchange = { audience: "platform-api", clientId: "p", clientSecret: { env: "PIVOTKIT_TEST_API_KEY" } };
    const options = {
        auth: OAUTH,
        httpSources: { backends: { platform: { url: "https://api.example.test/v1", auth: { tokenExchange: exchange } } } },
        sources: {
            shared: { http: { backend: "platform", path: "/vms" }, policy: POLICY },
            own: { http: { url: "https://api.example.test/x", auth: { tokenExchange: exchange } }, policy: POLICY },
            scoped: { http: { url: "https://api.example.test/y", auth: { tokenExchange: { ...exchange, scope: "platform:read" } } }, policy: POLICY }
        }
    };
    const facts = factsOf((await checkConfig(options, { env: { PIVOTKIT_TEST_API_KEY: SECRET } })).text);
    const unscoped = /WARNING \(HTTP sources\): ([\w.]+)\.tokenExchange: no scope; some providers, Authentik among them, then issue a token without scopes\. Set scope to the narrowest the backend needs/g;
    assert.deepEqual([...facts.matchAll(unscoped)].map((m) => m[1]).sort(), ["httpSources.backends.platform.auth", "sources.own.http.auth"]);
});

test("review: exchangeTokenFor sends a person's token through a guardedFetch only", async () => {
    let called = false;
    const plain = async () => {
        called = true;
        return { status: 200, headers: {}, body: new Uint8Array() };
    };
    await assert.rejects(exchangeTokenFor(person("ana"), { url: tokenUrl("/xchg"), clientId: "p", clientSecret: "s", fetch: /** @type {any} */ (plain) }), /through a guardedFetch only/);
    assert.equal(called, false);
});
