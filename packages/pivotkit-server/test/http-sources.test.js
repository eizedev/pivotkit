// HTTP sources (sources.<id>.http): the operator's address template filled with a caller's checked
// values, a backend over https on loopback (a certificate made per run with openssl, as
// fetch.test.js does; the names resolve to 127.0.0.1 through a lookup of the test's own), the rows
// read, paged and kept per caller, a backend's answers as the caller gets them on REST and MCP, the
// address rules (no private addresses without intranet, never metadata ones), check-config and
// check-source.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { callerOf, checkConfig, createContext, present, renderFile, serverTextOf, validateOptions } from "pivotkit-server";
import { createGuardedFetch } from "../src/sources/fetch.js";
import { httpMeans, jsonDepth, pointerValue, tableOf } from "../src/sources/http.js";
import { compileTemplate, expandUrl } from "../src/sources/template.js";
import { checkSource, paramFlags } from "../src/check-source.js";
import { loadRunner } from "../src/sources/run.js";
import { run } from "../src/runner.js";
import { call, factsOf, restServer, tempDir } from "./helpers.js";

/** What the backend answers per path, set by each test; and what it was asked. */
let routes = new Map();
/** @type {Array<{ path: string, query: string, headers: import("node:http").IncomingHttpHeaders }>} */
let asked = [];
let server;
let port = 0;
let cert;
/** The addresses names resolve to (default 127.0.0.1). */
const ADDRESSES = new Map();

before(async () => {
    const dir = tempDir();
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "2", "-subj", "/CN=api.example.test", "-addext", "subjectAltName=DNS:api.example.test,DNS:other.example.test,DNS:localhost"], { stdio: "ignore" });
    cert = readFileSync(join(dir, "cert.pem"));
    server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
        const url = new URL(req.url ?? "/", "https://x");
        asked.push({ path: url.pathname, query: url.search, headers: req.headers });
        const route = routes.get(url.pathname);
        if (!route) {
            res.writeHead(404, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "SECRET-BODY no such route" }));
            return;
        }
        route(req, res, url);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    httpMeans.fetch = createGuardedFetch({
        ca: cert,
        lookup: (host, options, callback) => {
            const address = ADDRESSES.get(host) ?? "127.0.0.1";
            callback(null, options?.all ? [{ address, family: 4 }] : address, 4);
        }
    });
});

after(() => server.close());

beforeEach(() => {
    routes = new Map();
    asked = [];
    ADDRESSES.clear();
});

/** A JSON answer. */
const json = (body, status = 200, headers = {}) => (_req, res) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
};

const VMS = [
    { name: "web-1", cpu: 4, state: "running", owner: "alice@example.com", tags: { env: "prod" } },
    { name: "web-2", cpu: 2, state: "stopped", owner: "bob@example.com", tags: { env: "test" } },
    { name: "db-1", cpu: 8, state: "running", owner: "carol@example.com", tags: { env: "prod" } }
];

const POLICY = Object.freeze({ default: "hide", fields: { name: "show", cpu: "show", state: "show" } });

/** A configuration with the backend "platform" and one source "vms" over it. */
const optionsOf = (http = {}, source = {}, more = {}) => ({
    httpSources: { backends: { platform: { url: `https://api.example.test:${port}/v1`, intranet: true, headers: { accept: "application/json" } } }, ...(more.httpSources ?? {}) },
    sources: {
        vms: {
            title: "Virtual machines",
            http: { backend: "platform", path: "/customers/{customer}/vms", query: { state: "{state}", limit: "500" }, rows: "/items", asOf: "/generatedAt", ...http },
            params: { customer: { type: "string", required: true, pattern: "^[a-z0-9-]{1,40}$", description: "The customer's short name", example: "acme" }, state: { type: "string", enum: ["running", "stopped"] } },
            policy: POLICY,
            ...source
        }
    },
    ...Object.fromEntries(Object.entries(more).filter(([k]) => k !== "httpSources"))
});

/** A context whose log lines are kept. */
async function contextOf(options, level = "info") {
    const lines = [];
    const context = await createContext({ log: level, ...options }, { stderr: { write: (t) => lines.push(...String(t).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) } });
    return Object.assign(context, { lines });
}

const LOCAL = callerOf("none", undefined);
const token = (name) => callerOf("token", { token: "", clientId: name, scopes: [], expiresAt: 0, extra: { allScopes: true } });
const nobody = () => callerOf("oauth", { token: "jwt", clientId: "bot", scopes: [], expiresAt: 0, extra: { subject: null, issuer: "https://issuer.example" } });
const VIEW = { rows: ["state"], values: [{ field: "cpu", agg: "sum" }] };
const describe = (context, params, caller = LOCAL, source = "vms") => present(context, "describe_source", { source, ...(params ? { params } : {}) }, caller);
/** A report's CSV as the file route gives it (the server's policy has results: true). */
const csvOf = async (context, input, caller = LOCAL) => new TextDecoder().decode(/** @type {any} */ (await renderFile(context, { view: VIEW, ...input, format: "csv" }, caller)).file.bytes);
const failure = (promise) => promise.then(
    () => assert.fail("expected an error"),
    (e) => e
);

test("template: a value stays in its segment or query value, encoded as RFC 6570 simple expansion; the URL keeps its origin and shape", () => {
    const declared = { customer: { type: "string", required: true }, id: { type: "integer", required: true }, q: { type: "string" } };
    const t = compileTemplate("https://api.example.com/v1/customers/{customer}/vms/{id}.json", { q: "{q}", limit: "500" }, declared);
    const url = expandUrl(t, { customer: "a b/../c?x#y&z=1;+", id: 7, q: "1&admin=true" });
    assert.equal(url.href, "https://api.example.com/v1/customers/a%20b%2F..%2Fc%3Fx%23y%26z%3D1%3B%2B/vms/7.json?q=1%26admin%3Dtrue&limit=500");
    assert.equal(url.host, "api.example.com");
    // a value that would be a "." or ".." segment, or empty, is refused before any request
    for (const value of [".", "..", ""]) {
        assert.throws(() => expandUrl(t, { customer: value, id: 1 }), /cannot be an empty, "\." or "\.\." path segment/);
    }
    // a query parameter without a value is left out; paging's own values go last
    assert.equal(expandUrl(t, { customer: "acme", id: 1 }, { page: 2 }).search, "?limit=500&page=2");
});

test("template: refused at start: another scheme, an expression outside the path, a query or fragment, user info, an IP address, an unknown or optional path param, two expressions in a segment, dot segments", () => {
    const declared = { customer: { type: "string", required: true }, id: { type: "integer", required: true }, state: { type: "string" } };
    const cases = [
        ["http://api.example.com/x", /must start with https:\/\//],
        ["https://{customer}.example.com/x", /expressions in the URL are allowed in the path only; for a query value use http\.query/],
        ["https://api.example.com:{id}/x", /allowed in the path only/],
        ["https://api.example.com/x?state={state}", /use http\.query/],
        ["https://api.example.com/x#top", /no fragment/],
        ["https://user:pw@api.example.com/x", /no user name or password/],
        ["https://10.0.0.7/x", /IP address/],
        ["https://[::1]/x", /IP address/],
        ["https://api.example.com/{nope}", /no declared parameter/],
        ["https://api.example.com/{state}", /params\.state must be required or have a default/],
        ["https://api.example.com/{customer}-{id}", /more than one expression/],
        ["https://api.example.com/x/../admin", /"\." or "\.\."/],
        ["https://api.example.com/x/%2e%2E/admin", /"\." or "\.\."/],
        ["https://api.example.com/a b", /must be percent-encoded/],
        ["https://api.example.com/{customer", /no expression/]
    ];
    for (const [template, error] of cases) {
        assert.throws(() => compileTemplate(template, {}, declared), error, template);
    }
    assert.ok(compileTemplate("https://10.0.0.7/x", {}, declared, { allowIpLiterals: true }));
    // query: a literal or exactly one {name}; names once, without regard to case; paging's names reserved
    assert.throws(() => compileTemplate("https://a.example/x", { s: "x{state}" }, declared), /a literal or exactly one \{name\}/);
    assert.throws(() => compileTemplate("https://a.example/x", { State: "{state}", state: "1" }, declared), /given twice/);
    assert.throws(() => compileTemplate("https://a.example/x", { page: "1" }, declared, { reserved: ["page"] }), /paging fills/);
});

test("options: an HTTP source compiles; its keys are checked with the path; a sign-in header goes to http.auth, never to http.headers", () => {
    assert.doesNotThrow(() => validateOptions(optionsOf()));
    const cases = [
        [optionsOf({ backend: "nope" }), /sources\.vms\.http\.backend: no backend "nope" in httpSources\.backends \(known: platform\)/],
        [optionsOf({ url: "https://api.example.test/x" }), /give either backend and path, or url/],
        [optionsOf({ intranet: true }), /set intranet on the backend/],
        [optionsOf({ path: "/vms?all=1" }), /starts with "\/" and has no "\?"/],
        [optionsOf({ headers: { Authorization: "Bearer x" } }), /headers\.Authorization: a sign-in header holds a secret, which is never written in the configuration; set the backend's sign-in in http\.auth/],
        [optionsOf({ headers: { Cookie: "session=x" } }), /headers\.Cookie: a sign-in header holds a secret/],
        [optionsOf({ headers: { Host: "evil.example" } }), /headers\.Host: this header is set by the connection/],
        [optionsOf({ headers: { "x-forwarded-for": "1.2.3.4" } }), /x-forwarded-for/],
        [optionsOf({ headers: { "proxy-authorization": "x" } }), /proxy-authorization/],
        [optionsOf({ headers: { "x-team": "a\r\nhost: evil" } }), /without line breaks/],
        [optionsOf({ auth: { header: { value: "the-secret-itself" } } }), /sources\.vms\.http\.auth\.header\.value: must be a reference to a secret/],
        [optionsOf({ paging: { page: "customer" } }), /customer is a query name pivotkit fills while paging, so it cannot also be a parameter/],
        [optionsOf({ paging: { offset: "o", limit: "l", size: 0 } }), /size: the rows per page/],
        [optionsOf({ paging: { cursor: "/next" } }), /paging: is one of/],
        [optionsOf({ maxPages: 101 }), /maxPages: 1 to 100/],
        [optionsOf({ rows: "items" }), /rows: a JSON Pointer/],
        [optionsOf({ format: "csv" }), /a CSV answer is one page/],
        [optionsOf({}, { file: "a.csv" }), /give either file or load, or http/],
        [optionsOf({ maxBytes: 2000 }, {}, { limits: { fileBytes: 1000 } }), /maxBytes: 1 to limits\.fileBytes \(1000\)/],
        [optionsOf({}, { timeMs: 600_001 }), /at most 600000/]
    ];
    for (const [options, error] of cases) {
        assert.throws(() => validateOptions(options), error);
    }
    // a backend's address: https, no expression, no query
    for (const url of ["http://api.example.test", "https://api.example.test/{x}", "https://api.example.test/v1?x=1"]) {
        assert.throws(() => validateOptions({ ...optionsOf(), httpSources: { backends: { platform: { url } } } }), /httpSources\.backends\.platform\.url/);
    }
    // there is no switch that opens private addresses for all; IP addresses as hosts only when allowed
    assert.throws(() => validateOptions({ ...optionsOf(), httpSources: { allowPrivate: true, backends: optionsOf().httpSources.backends } }), /unknown key "allowPrivate"/);
    assert.throws(() => validateOptions({ httpSources: { backends: { ip: { url: "https://10.0.0.7/v1" } } } }), /IP address/);
    assert.doesNotThrow(() => validateOptions({ httpSources: { allowIpLiterals: true, backends: { ip: { url: "https://10.0.0.7/v1" } } } }));
});

test("options: an HTTP source whose fields are shown by default, under the server's policy or any profile, is refused", () => {
    assert.throws(() => validateOptions(optionsOf({}, { policy: undefined }, { policy: { default: "show" } })), /sources\.vms\.policy: an HTTP source needs a default that is not "show".*set sources\.vms\.policy\.default to "hide"/);
    assert.throws(() => validateOptions(optionsOf({}, { policy: { default: "summary" } }, { policy: { profiles: { analyst: { default: "show" } } } })), /an HTTP source needs a default that is not "show"/);
    // hide by default with named fields to show: a profile cannot open it
    assert.doesNotThrow(() => validateOptions(optionsOf({}, {}, { policy: { profiles: { analyst: { default: "show" } } } })));
});

test("a load: the caller's values in the address the operator wrote, the rows at the pointer, only the shown fields, dataAsOf from the body", async () => {
    routes.set("/v1/customers/acme/vms", json({ items: VMS, generatedAt: "2026-11-14T07:30:00+01:00" }));
    const context = await contextOf(optionsOf({}, {}, { policy: { results: true } }));
    try {
        const result = (await describe(context, { customer: "acme", state: "running" })).result;
        assert.deepEqual(asked.map((a) => `${a.path}${a.query}`), ["/v1/customers/acme/vms?state=running&limit=500"]);
        assert.equal(asked[0].headers.accept, "application/json");
        assert.deepEqual(result.fields.map((f) => f.name).sort(), ["cpu", "name", "state"]);
        assert.doesNotMatch(JSON.stringify(result), /alice|owner|tags/);
        assert.equal(result.dataAsOf, "2026-11-14T06:30:00Z");
        const csv = await csvOf(context, { source: "vms", params: { customer: "acme" } });
        assert.match(csv, /running,12/);
        assert.match(csv, /stopped,2/);
    } finally {
        await context.close();
    }
});

test("a caller's values are checked before any request: a missing one names the param, a value outside the pattern or enum is refused, a path step never reaches the backend", async () => {
    routes.set("/v1/customers/acme/vms", json({ items: VMS }));
    const context = await contextOf(optionsOf());
    try {
        const missing = await failure(describe(context, undefined));
        assert.equal(missing.code, "INVALID_INPUT");
        assert.equal(missing.message, "the source vms needs params.customer (The customer's short name, for example acme); re-run with params.customer=acme");
        for (const customer of ["../admin", "acme/../../admin", "ACME", "acme%2F..", "a".repeat(41)]) {
            assert.equal((await failure(describe(context, { customer }))).code, "INVALID_INPUT", customer);
        }
        assert.equal((await failure(describe(context, { customer: "acme", state: "deleted" }))).code, "INVALID_INPUT");
        assert.equal((await failure(describe(context, { customer: "acme", limit: "100000" }))).code, "INVALID_INPUT");
        assert.equal(asked.length, 0);
        // list_sources names the params
        const listed = (await present(context, "list_sources", {}, LOCAL)).result.sources.find((s) => s.id === "vms");
        assert.deepEqual(listed.params, [
            { name: "customer", type: "string", required: true, description: "The customer's short name", example: "acme", pattern: "^[a-z0-9-]{1,40}$" },
            { name: "state", type: "string", required: false, enum: ["running", "stopped"] }
        ]);
    } finally {
        await context.close();
    }
});

test("a backend's answers as a caller gets them, alike on REST and MCP; a backend's body never reaches a caller or the log", async () => {
    const options = {
        ...optionsOf(),
        sources: {
            vms: optionsOf().sources.vms,
            all: { http: { backend: "platform", path: "/all", rows: "/items" }, policy: POLICY }
        }
    };
    const s = await restServer(options, { enable: ["rest", "mcp"] });
    const client = new Client({ name: "backend-answers", version: "1.0.0" });
    const set = (status, headers = {}) => {
        const answer = json({ error: "SECRET-BODY tenant acme-internal on db-7.corp" }, status, headers);
        routes.set("/v1/customers/acme/vms", answer);
        routes.set("/v1/all", answer);
    };
    const restOf = (source) => call(`${s.api}/sources/describe`, { body: { source, ...(source === "vms" ? { params: { customer: "acme" } } : {}) } });
    const mcpOf = async (source) => String(/** @type {any} */ ((await client.callTool({ name: "describe_source", arguments: { source, ...(source === "vms" ? { params: { customer: "acme" } } : {}) } })).content)[0].text);
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`)));
        set(400);
        let rest = await restOf("vms");
        assert.deepEqual([rest.status, rest.data.code, rest.data.detail], [400, "INVALID_INPUT", "the backend did not accept these parameters"]);
        // 401, 403 and 404 of a source with params: one answer, so other tenants' names cannot be probed
        for (const status of [401, 403, 404]) {
            set(status);
            rest = await restOf("vms");
            assert.deepEqual([rest.status, rest.data.code, rest.data.detail, rest.data.retryable], [404, "DATA_NOT_AVAILABLE", "nothing you may see for customer=acme: check the value", false], String(status));
            assert.match(await mcpOf("vms"), /^DATA_NOT_AVAILABLE: nothing you may see for customer=acme: check the value \(request id [A-Za-z0-9_-]{11}\)$/);
        }
        // without params: a refusal and a wrong address have texts of their own, never the backend's words
        set(403);
        rest = await restOf("all");
        assert.deepEqual([rest.status, rest.data.code, rest.data.detail, rest.data.retryable], [502, "SOURCE_UNAVAILABLE", serverTextOf("SOURCE_UNAVAILABLE", "refused"), false]);
        assert.match(rest.data.detail, /refused pivotkit's access; ask the operator/);
        assert.match(await mcpOf("all"), /^SOURCE_UNAVAILABLE: the source's backend refused pivotkit's access; ask the operator and give the request id \(source all; trying again will not help; request id [A-Za-z0-9_-]{11}\)$/);
        set(404);
        rest = await restOf("all");
        assert.equal(rest.data.detail, serverTextOf("SOURCE_UNAVAILABLE", "setup"));
        assert.match(rest.data.detail, /not set up correctly/);
        assert.match(await mcpOf("all"), /^SOURCE_UNAVAILABLE: the source is not set up correctly; ask the operator and give the request id \(source all; trying again will not help; request id [A-Za-z0-9_-]{11}\)$/);
        // try again later: retryable, Retry-After passed on
        set(503, { "retry-after": "30" });
        rest = await restOf("all");
        assert.deepEqual([rest.status, rest.data.detail, rest.data.retryable, rest.headers.get("retry-after")], [502, serverTextOf("SOURCE_UNAVAILABLE"), true, "30"]);
        assert.match(await mcpOf("all"), /^SOURCE_UNAVAILABLE: the source is not available right now; .*\(source all; trying again later may work; request id [A-Za-z0-9_-]{11}\)$/);
        set(500);
        rest = await restOf("all");
        assert.deepEqual([rest.data.detail, rest.data.retryable], [serverTextOf("SOURCE_UNAVAILABLE"), false]);
        // the body's words nowhere: not in an answer, not in the log
        assert.ok(!JSON.stringify(s.log).includes("SECRET-BODY"));
        assert.ok(!JSON.stringify(s.log).includes("acme-internal"));
        // the log says the status and the template, never a value
        const said = s.log.filter((l) => l.source === "all" && l.status === 503);
        assert.ok(said.length >= 1);
        assert.equal(said[0].template, `https://api.example.test:${port}/v1/all`);
        assert.ok(!s.log.some((l) => l.source === "vms" && JSON.stringify(l).includes("customers/acme")));
    } finally {
        await client.close();
        await s.close();
    }
});

test("addresses: loopback and private ones only for an intranet backend; link-local and metadata ones never; a redirect is not followed", async () => {
    routes.set("/v1/all", json({ items: VMS }));
    routes.set("/v1/moved", (_req, res) => {
        res.writeHead(302, { location: "https://169.254.169.254/latest/meta-data/" });
        res.end();
    });
    const sources = { all: { http: { backend: "platform", path: "/all", rows: "/items" }, policy: POLICY }, moved: { http: { backend: "platform", path: "/moved", rows: "/items" }, policy: POLICY } };
    const closed = await contextOf({ httpSources: { backends: { platform: { url: `https://api.example.test:${port}/v1` } } }, sources }, "debug");
    try {
        const error = await failure(describe(closed, undefined, LOCAL, "all"));
        assert.deepEqual([error.code, error.details.retryable, error.reason], ["SOURCE_UNAVAILABLE", false, "setup"]);
        assert.equal(asked.length, 0, "nothing was sent to a loopback address");
        // the refusal's own words only on the debug log line, with the request's id field
        assert.ok(closed.lines.some((l) => l.event === "debug" && /REFUSED_ADDRESS/.test(l.message)));
    } finally {
        await closed.close();
    }
    const open = await contextOf({ httpSources: { backends: { platform: { url: `https://api.example.test:${port}/v1`, intranet: true } } }, sources });
    try {
        assert.equal((await describe(open, undefined, LOCAL, "all")).result.fields.length, 3);
        assert.equal((await failure(describe(open, undefined, LOCAL, "moved"))).reason, "setup");
        // a name that resolves to a metadata address is refused even for an intranet backend
        ADDRESSES.set("api.example.test", "169.254.169.254");
        const metadata = await failure(present(open, "render_view", { source: "all", view: VIEW, format: "csv" }, token("other")));
        assert.deepEqual([metadata.code, metadata.reason], ["SOURCE_UNAVAILABLE", "setup"]);
    } finally {
        await open.close();
    }
});

test("paging: a next pointer, a Link header, page numbers and offsets; pages stay on the source's host and path; a repeated page stops", async () => {
    const pageOf = (items, more = {}) => json({ items, ...more });
    routes.set("/v1/next", (req, res, url) => {
        const at = url.searchParams.get("cursor");
        json(at === null ? { items: VMS.slice(0, 1), next: "?cursor=b" } : at === "b" ? { items: VMS.slice(1, 2), next: "/v1/next?cursor=c" } : { items: VMS.slice(2), next: null })(req, res);
    });
    routes.set("/v1/link", (req, res, url) => {
        const page = Number(url.searchParams.get("p") ?? 1);
        const headers = page < 3 ? { link: `<https://api.example.test:${port}/v1/link?p=${page + 1}>; rel="next", <https://api.example.test:${port}/v1/link?p=1>; rel="first"` } : {};
        json({ items: [VMS[page - 1]] }, 200, headers)(req, res);
    });
    routes.set("/v1/pages", (req, res, url) => pageOf(VMS.slice(Number(url.searchParams.get("page")) - 1, Number(url.searchParams.get("page"))))(req, res));
    routes.set("/v1/offsets", (req, res, url) => pageOf(VMS.slice(Number(url.searchParams.get("from")), Number(url.searchParams.get("from")) + Number(url.searchParams.get("size"))))(req, res));
    routes.set("/v1/away", pageOf(VMS.slice(0, 1), { next: `https://other.example.test:${port}/v1/away?x=2` }));
    routes.set("/v1/loop", pageOf(VMS.slice(0, 1), { next: "?again=1" }));
    const src = (path, paging, more = {}) => ({ http: { backend: "platform", path, rows: "/items", paging, ...more }, policy: POLICY });
    const context = await contextOf({
        ...optionsOf({}, {}, { policy: { results: true } }),
        sources: {
            next: src("/next", { next: "/next" }),
            link: src("/link", { link: true }),
            pages: src("/pages", { page: "page" }),
            offsets: src("/offsets", { offset: "from", limit: "size", size: 2 }),
            away: src("/away", { next: "/next" }),
            loop: src("/loop", { next: "/next" }),
            short: src("/next", { next: "/next" }, { maxPages: 2 })
        }
    });
    try {
        for (const id of ["next", "link", "pages", "offsets"]) {
            asked = [];
            const csv = await csvOf(context, { source: id, view: { rows: ["name"], values: [{ field: "cpu", agg: "sum" }] } });
            assert.match(csv, /web-1,4/, id);
            assert.match(csv, /web-2,2/, id);
            assert.match(csv, /db-1,8/, id);
        }
        assert.deepEqual(asked.map((a) => a.query), ["?from=0&size=2", "?from=2&size=2"]);
        // a next page on another host is the source's settings' failure, not followed
        asked = [];
        assert.equal((await failure(describe(context, undefined, LOCAL, "away"))).reason, "setup");
        assert.deepEqual(asked.map((a) => a.path), ["/v1/away"]);
        // a page named again ends the paging
        asked = [];
        assert.equal((await describe(context, undefined, LOCAL, "loop")).result.rows, 2);
        assert.deepEqual(asked.map((a) => a.query), ["", "?again=1"]);
        // over maxPages: LIMIT_EXCEEDED, pivotkit's own words
        const over = await failure(describe(context, undefined, LOCAL, "short"));
        assert.deepEqual([over.code, over.message], ["LIMIT_EXCEEDED", "the source short has more than 2 pages (http.maxPages)"]);
    } finally {
        await context.close();
    }
});

test("limits: all pages' bytes (http.maxBytes), limits.rows while paging, deep nesting and a body that is no JSON", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `vm-${i}`, cpu: i, state: "running" }));
    routes.set("/v1/big", json({ items: many, padding: "x".repeat(4000) }));
    routes.set("/v1/rows", (req, res, url) => json({ items: many.slice(0, 30), next: url.search ? null : "?p=2" })(req, res));
    routes.set("/v1/deep", json(`{"items":[${"[".repeat(100)}${"]".repeat(100)}]}`));
    routes.set("/v1/text", (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html>SECRET-BODY</html>");
    });
    const src = (path, more = {}) => ({ http: { backend: "platform", path, rows: "/items", ...more }, policy: POLICY });
    const context = await contextOf({ ...optionsOf(), limits: { rows: 40 }, sources: { big: src("/big", { maxBytes: 2000 }), rows: src("/rows", { paging: { next: "/next" } }), deep: src("/deep"), text: src("/text") } });
    try {
        const big = await failure(describe(context, undefined, LOCAL, "big"));
        assert.deepEqual([big.code, big.message], ["LIMIT_EXCEEDED", "the source big answered more than 2,000 bytes (http.maxBytes)"]);
        const rows = await failure(describe(context, undefined, LOCAL, "rows"));
        assert.deepEqual([rows.code, rows.message], ["LIMIT_EXCEEDED", "60 rows exceed the limit of 40 (limits.rows)"]);
        for (const id of ["deep", "text"]) {
            const e = await failure(describe(context, undefined, LOCAL, id));
            assert.deepEqual([e.code, e.reason, e.details.retryable], ["SOURCE_UNAVAILABLE", "setup", false], id);
            assert.doesNotMatch(e.message, /SECRET-BODY|html/);
        }
    } finally {
        await context.close();
    }
});

test("rows: objects by their own keys or lists with a header row; names cleaned and made unique; a nested value as JSON text; nesting counted outside strings", () => {
    const limits = { rows: 100, columns: 10, importCells: 1000, textLength: 20 };
    const log = { debug() {} };
    const objects = tableOf(JSON.parse('[{"Name":"a","name":"b","x\\u202e":{"deep":[1,2]},"__proto__":"p"},{"Name":"c","long":"' + "y".repeat(50) + '"}]'), /** @type {any} */ (limits), { id: "t", log });
    assert.deepEqual(objects.columns, ["Name", "name (2)", "x", "__proto__", "long"]);
    assert.deepEqual(objects.rows[0], ["a", "b", '{"deep":[1,2]}', "p", null]);
    assert.equal(objects.rows[1][4], "y".repeat(20));
    assert.deepEqual(tableOf([["a", "b"], [1, 2], [3]], /** @type {any} */ (limits), { id: "t", log }), { columns: ["a", "b"], rows: [[1, 2], [3, null]] });
    assert.throws(() => tableOf([{ a: 1 }, [1]], /** @type {any} */ (limits), { id: "t", log }), /SOURCE_UNAVAILABLE/);
    assert.throws(() => tableOf([Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`c${i}`, i]))], /** @type {any} */ (limits), { id: "t", log }), /limits\.columns/);
    // a pointer reads own properties only
    assert.equal(pointerValue({}, ["constructor"]), undefined);
    assert.equal(pointerValue({ a: [{ b: 1 }] }, ["a", "0", "b"]), 1);
    assert.equal(pointerValue({ a: [1] }, ["a", "01"]), undefined);
    assert.equal(pointerValue({ "a/b": { "~c": 2 } }, ["a/b", "~c"]), 2);
    assert.equal(jsonDepth('{"a":"[[[[[[","b":[[1]]}', 64), 3);
});

test("kept data: reused for ttl per caller and values; never shared between callers; a caller without an identity keeps nothing; last good data after a transient failure only", async () => {
    let status = 200;
    routes.set("/v1/customers/acme/vms", (req, res) => (status === 200 ? json({ items: VMS, generatedAt: 1763193600 }) : json({ error: "down" }, status))(req, res));
    routes.set("/v1/customers/beta/vms", json({ items: VMS.slice(0, 1) }));
    const context = await contextOf(optionsOf({}, { ttl: 300 }));
    try {
        const first = (await describe(context, { customer: "acme" }, token("ann"))).result;
        assert.equal(first.dataAsOf, "2025-11-15T08:00:00Z");
        await describe(context, { customer: "acme" }, token("ann"));
        assert.equal(asked.length, 1, "the second call of the same caller and values is kept data");
        await describe(context, { customer: "beta" }, token("ann"));
        await describe(context, { customer: "acme" }, token("ben"));
        assert.equal(asked.length, 3, "other values and another caller load again");
        await describe(context, { customer: "acme" }, nobody());
        await describe(context, { customer: "acme" }, nobody());
        assert.equal(asked.length, 5, "a caller without an identity keeps nothing");
    } finally {
        await context.close();
    }
    asked = [];
    const stale = await contextOf(optionsOf({}, { ttl: 0, maxStale: 3600 }));
    try {
        status = 200;
        await describe(stale, { customer: "acme" }, token("ann"));
        status = 503;
        const again = (await describe(stale, { customer: "acme" }, token("ann"))).result;
        assert.deepEqual(again.stale, { since: again.stale.since });
        assert.equal(again.dataAsOf, "2025-11-15T08:00:00Z", "kept data keeps its own time");
        // a refusal drops what was kept: lost access is never covered
        status = 403;
        assert.equal((await failure(describe(stale, { customer: "acme" }, token("ann")))).code, "DATA_NOT_AVAILABLE");
        status = 503;
        assert.equal((await failure(describe(stale, { customer: "acme" }, token("ann")))).code, "SOURCE_UNAVAILABLE");
    } finally {
        await stale.close();
        status = 200;
    }
});

test("a caller that goes away stops waiting, and the backend's request is cancelled when nobody waits any more", async () => {
    let closed = false;
    routes.set("/v1/slow", (req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"items":[');
        req.socket.on("close", () => (closed = true));
    });
    const context = await contextOf({ ...optionsOf(), sources: { slow: { http: { backend: "platform", path: "/slow", rows: "/items" }, policy: POLICY } } });
    try {
        const gone = new AbortController();
        const call = present(context, "describe_source", { source: "slow" }, LOCAL, { signal: gone.signal });
        while (!asked.length) {
            await new Promise((r) => setTimeout(r, 10));
        }
        gone.abort();
        await assert.rejects(call);
        for (let i = 0; i < 100 && !closed; i++) {
            await new Promise((r) => setTimeout(r, 10));
        }
        assert.ok(closed, "the backend's connection was closed");
    } finally {
        await context.close();
    }
});

test("httpSources.enabled: false leaves every HTTP source out: not listed, not found; check-config says so", async () => {
    const options = optionsOf({}, {}, { httpSources: { enabled: false } });
    options.httpSources.backends = optionsOf().httpSources.backends;
    const context = await contextOf(options);
    try {
        assert.deepEqual((await present(context, "list_sources", {}, LOCAL)).result.sources, []);
        assert.equal((await failure(describe(context, { customer: "acme" }))).code, "SOURCE_NOT_FOUND");
    } finally {
        await context.close();
    }
    const { text } = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true });
    assert.match(text, /\nHTTP sources: off \(httpSources\.enabled: false\)\n {2}1 configured source is ignored\n/);
});

test("check-config: where each HTTP source asks (never a value), its limits and keeping, which backends may reach private addresses, warnings", async () => {
    const options = optionsOf({ headers: { "x-api-key": "abc-not-printed" }, query: { state: "{state}", token: "tok-not-printed" }, paging: { next: "/next" } }, { ttl: 300, params: { ...optionsOf().sources.vms.params, unused: { type: "string" } } });
    const result = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true });
    assert.equal(result.problems, 0);
    const text = factsOf(result.text);
    assert.match(text, /vms: an HTTP source, described under HTTP sources/);
    // one fact per line
    assert.ok(
        text.includes(
            [
                "HTTP sources (1):",
                `  vms: backend platform (https://api.example.test:${port}/v1)`,
                "    GET /customers/{customer}/vms?state={state}&token=...",
                "    rows at /items",
                "    next page at /next",
                "    up to 10 pages / 20 MiB / 15 s",
                "    kept 300 s per caller",
                "    last good data: up to 3600 s",
                "    create_link: none (no sources.<id>.link)",
                "    draft_schedule: drafts with the caller's params",
                "    params: customer (string, pattern, required), state (running|stopped), unused (string)",
                "  intranet: backend platform may reach loopback and private addresses (source vms)"
            ].join("\n")
        ),
        result.text
    );
    assert.match(text, /WARNING \(HTTP sources\): sources\.vms\.params\.unused: no part of the address uses it/);
    assert.match(text, /WARNING \(HTTP sources\): sources\.vms: the header x-api-key has a literal value and its name looks like a secret's/);
    assert.match(text, /WARNING \(HTTP sources\): sources\.vms: the query token has a literal value/);
    // the profile lines of an HTTP source: its fields are known only after a load
    assert.match(text, /\n {4}fields: known only after a load \(pivotkit-server check-source vms loads it\)\n/);
    assert.doesNotMatch(result.text, /abc-not-printed|tok-not-printed/);
    // maxBytes over the server's limits.fileBytes (50 MiB unless set): what a load reads, and why
    const big = await checkConfig(optionsOf({ maxBytes: 104_857_600 }), { http: true, env: {}, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true });
    assert.match(big.text, /up to 50 MiB \/ 15 s/);
    assert.match(factsOf(big.text), /WARNING \(HTTP sources\): sources\.vms: maxBytes \(100 MiB\) is over limits\.fileBytes \(50 MiB\); a load reads at most 50 MiB/);
});

test("check-source: one load with the operator's values, pages, rows and fields with types (never a value); a wrong pointer names the body's keys; exit 1 on failure", async () => {
    routes.set("/v1/customers/acme/vms", json({ items: VMS, generatedAt: "2026-11-14T07:30:00Z", next: null }));
    const ok = await checkSource(optionsOf(), "vms", { customer: "acme" });
    assert.equal(ok.ok, true);
    assert.match(ok.text, new RegExp(`^source vms: GET https://api\\.example\\.test:${port}/v1/customers/\\{customer\\}/vms\\?state=\\{state\\}&limit=\\.\\.\\.\\n  page 1: 200 application/json, \\d+ bytes\\n  1 page, \\d+ bytes, 3 rows, \\d+ ms\\n  fields: name \\(text\\), cpu \\(number\\), state \\(text\\), owner \\(text\\), tags \\(text\\)\\n  data as of 2026-11-14T07:30:00Z \\(from the body\\)\\nOK with customer=acme\\n$`));
    assert.doesNotMatch(ok.text, /web-1|alice/);
    const wrong = await checkSource(optionsOf({ rows: "/results" }), "vms", { customer: "acme" });
    assert.equal(wrong.ok, false);
    assert.match(wrong.text, /pointer \/results matched nothing; the body has the keys: items, generatedAt, next/);
    assert.match(wrong.text, /a caller gets: SOURCE_UNAVAILABLE: the source is not set up correctly/);
    assert.match((await checkSource(optionsOf(), "vms", {})).text, /params: the source vms needs params\.customer/);
    routes.set("/v1/customers/zed/vms", json({ error: "SECRET-BODY" }, 403));
    const refused = await checkSource(optionsOf(), "vms", { customer: "zed" });
    assert.match(refused.text, /page 1: 403 application\/json/);
    assert.match(refused.text, /a caller gets: DATA_NOT_AVAILABLE: nothing you may see for customer=zed: check the value \(the backend answered 403\)\nFAILED\n$/);
    assert.doesNotMatch(refused.text, /SECRET-BODY/);
    assert.match((await checkSource(optionsOf(), "nope", {})).text, /no source "nope"; the HTTP sources are vms/);
    assert.deepEqual(paramFlags(["vms", "--param", "customer=acme", "--param=state=a=b", "--config", "x.json"]), { params: { customer: "acme", state: "a=b" }, rest: ["vms", "--config", "x.json"] });
    assert.throws(() => paramFlags(["--param", "novalue"]), /--param takes name=value/);
    assert.throws(() => paramFlags(["--param", "customer=a", "--param=customer=b"]), /--param customer is given twice/);
});

test("check-source as a command: the configuration file, --param, exit codes", async () => {
    const dir = tempDir();
    const file = join(dir, "pivotkit.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, JSON.stringify(optionsOf()));
    routes.set("/v1/customers/acme/vms", json({ items: VMS }));
    const out = [];
    const io = { env: {}, stdout: { write: (t) => out.push(t) }, stderr: { write: (t) => out.push(t) } };
    assert.equal(await run(["check-source", "vms", "--param", "customer=acme", "--config", file], io), 0);
    assert.match(out.join(""), /3 rows/);
    out.length = 0;
    routes.set("/v1/customers/acme/vms", json({}, 503));
    assert.equal(await run(["check-source", "vms", "--param", "customer=acme", "--config", file], io), 1);
    assert.match(out.join(""), /FAILED/);
    out.length = 0;
    assert.equal(await run(["check-source", "--config", file], io), 2);
    assert.match(out.join(""), /check-source takes a source's id/);
});

test("check-source for the operator: options in any order, exit 2 for an id that is no HTTP source, the values on success, the --param to re-run with, where a refusal's secret is, and NODE_EXTRA_CA_CERTS that does not cover the certificate", async () => {
    const dir = tempDir();
    const file = join(dir, "pivotkit.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, JSON.stringify(optionsOf()));
    routes.set("/v1/customers/acme/vms", json({ items: VMS }));
    const out = [];
    const err = [];
    const io = { env: {}, stdout: { write: (t) => out.push(t) }, stderr: { write: (t) => err.push(t) } };
    // the id after the options, between them, and --param first
    for (const argv of [["--config", file, "vms", "--param", "customer=acme"], ["--param", "customer=acme", "--config", file, "vms"], [`--config=${file}`, "vms", "--param=customer=acme", "--log", "off"]]) {
        out.length = 0;
        assert.equal(await run(["check-source", ...argv], io), 0, `${argv.join(" ")}: ${err.join("")}`);
        assert.match(out.join(""), /\nOK with customer=acme\n$/);
    }
    // an id the configuration has no HTTP source for is a usage error, said on stderr
    err.length = 0;
    out.length = 0;
    assert.equal(await run(["check-source", "--config", file, "nope"], io), 2);
    assert.equal(err.join(""), 'pivotkit-server: no source "nope"; the HTTP sources are vms\n');
    assert.equal(out.join(""), "");
    err.length = 0;
    assert.equal(await run(["check-source", "vms", "other", "--config", file], io), 2);
    assert.match(err.join(""), /check-source takes one source's id, not 2 \(vms, other\)/);
    err.length = 0;
    assert.equal(await run(["check-source", "vms", "--config", file, "--bogus"], io), 2);
    assert.equal(err.join(""), 'pivotkit-server: unknown option "--bogus"; run "pivotkit-server --help"\n');
    err.length = 0;
    assert.equal(await run(["serve", "--auth", "bogus"], io), 2);
    assert.equal(err.join(""), 'pivotkit-server: --auth must be none, token or oauth; run "pivotkit-server --help"\n');
    err.length = 0;
    assert.equal(await run(["bogus"], io), 2);
    assert.equal(err.join(""), 'pivotkit-server: unknown command "bogus"; run "pivotkit-server --help"\n');

    // a missing required value: the flag to re-run with, the declared example
    const missing = await checkSource(optionsOf(), "vms", {});
    assert.match(missing.text, /\n {2}re-run with --param customer=acme\nFAILED\n$/);
    assert.match((await checkSource(optionsOf({}, { params: { customer: { type: "string", required: true, pattern: "^[a-z]+$" }, state: { type: "string", required: true, enum: ["running", "stopped"] } } }), "vms", {})).text, /re-run with --param customer=<value> --param state=running\n/);

    // a refused value: the flag to fix it with, the example filled in
    assert.match((await checkSource(optionsOf(), "vms", { customer: "ACME" })).text, /\n {2}params: params\.customer is not in the expected form \(The customer's short name, for example acme; pattern \^\[a-z0-9-\]\{1,40\}\$\); re-run with --param customer=acme\nFAILED\n$/);
    assert.match((await checkSource(optionsOf(), "vms", { customer: "acme", state: "gone" })).text, /params\.state must be one of running, stopped; re-run with --param state=running\n/);

    // 401 or 403: without credentials, where to set them; with a header from a secret, which secret (never its value)
    routes.set("/v1/customers/zed/vms", json({ error: "no" }, 403));
    assert.match((await checkSource(optionsOf(), "vms", { customer: "zed" })).text, /\n {2}the backend answered 403 and the source sends no credentials: if the values are right, set httpSources\.backends\.platform\.auth \(a header from a secret, client credentials or token exchange\)\n/);
    const secret = join(dir, "backend-token.txt");
    writeFileSync(secret, "s3cret-value-for-the-backend\n");
    routes.set("/v1/all", json({ error: "no" }, 401));
    const withHeader = { httpSources: { backends: { platform: { url: `https://api.example.test:${port}/v1`, intranet: true, auth: { header: { value: { file: secret } } } } } }, sources: { all: { http: { backend: "platform", path: "/all", rows: "/items" }, policy: POLICY } } };
    const refused = await checkSource(withHeader, "all", {});
    assert.match(refused.text, new RegExp(`\\n  the backend answered 401: check the secret behind httpSources\\.backends\\.platform\\.auth\\.header \\(the file ${secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) and that the backend accepts it\\n`));
    assert.doesNotMatch(refused.text, /s3cret/);

    // a certificate the server does not trust: with NODE_EXTRA_CA_CERTS set, that its file does not cover it
    routes.set("/v1/all", json({ items: VMS }));
    const open = { httpSources: { backends: { platform: { url: `https://api.example.test:${port}/v1`, intranet: true } } }, sources: { all: { http: { backend: "platform", path: "/all", rows: "/items" }, policy: POLICY } } };
    const noCa = createGuardedFetch({ lookup: (_h, o, cb) => cb(null, o?.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4) });
    const set = (await checkSource(open, "all", {}, { fetch: noCa, env: { NODE_EXTRA_CA_CERTS: join(dir, "ca.pem") } })).text;
    assert.match(set, /a certificate error: NODE_EXTRA_CA_CERTS is set, but no certificate in that file signed this server's certificate; add the certificate authority that did and start the server again/);
    assert.doesNotMatch(set, /ca\.pem/, "the file's path is the operator's own; the hint does not repeat it");
    // an expired certificate or another host's name is no unknown signer: the file is not blamed
    const { certificateHint } = await import("../src/sources/http.js");
    for (const failure of ["certificate has expired (CERT_HAS_EXPIRED)", "Hostname/IP does not match certificate's altnames (ERR_TLS_CERT_ALTNAME_INVALID)"]) {
        assert.doesNotMatch(certificateHint({ NODE_EXTRA_CA_CERTS: "ca.pem" }, failure), /is set/);
    }
});

test("REST: GET /sources/{id} of a source that needs params points to POST /sources/describe, which takes them", async () => {
    routes.set("/v1/customers/acme/vms", json({ items: VMS }));
    const s = await restServer(optionsOf());
    try {
        const got = await call(`${s.api}/sources/vms?customer=acme`);
        assert.equal(got.status, 400);
        assert.equal(got.data.code, "INVALID_INPUT");
        assert.equal(got.data.detail, 'the source vms needs params.customer (The customer\'s short name, for example acme); re-run with params.customer=acme. GET /sources/{id} takes no params: send them with POST /sources/describe, {"source": "vms", "params": {...}}');
        const posted = await call(`${s.api}/sources/describe`, { body: { source: "vms", params: { customer: "acme" } } });
        assert.equal(posted.status, 200, JSON.stringify(posted.data));
        // POST names no route to go to: only the GET does
        const missing = await call(`${s.api}/sources/describe`, { body: { source: "vms" } });
        assert.doesNotMatch(missing.data.detail, /POST \/sources\/describe/);
    } finally {
        await s.close();
    }
});

test("pivotkit-server --help names --version", async () => {
    const out = [];
    const io = { env: {}, stdout: { write: (t) => out.push(t) }, stderr: { write: (t) => out.push(t) } };
    assert.equal(await run(["--help"], io), 0);
    assert.match(out.join(""), /\n {7}pivotkit-server --version\n/);
    assert.match(out.join(""), /\n {2}--version +Print the version and exit\.\n {2}--help +Print this help and exit\.\n/, "--version before --help, as pivotkit-mcp's");
});

test("an answer without rows is an empty table: describe_source says no rows and render_view a report without them, not an error", async () => {
    routes.set("/v1/customers/acme/vms", json({ items: [], generatedAt: "2026-11-14T07:30:00Z" }));
    const context = await contextOf(optionsOf({}, {}, { policy: { results: true } }));
    try {
        const described = (await describe(context, { customer: "acme" })).result;
        assert.deepEqual([described.rows, described.fields], [0, []]);
        assert.equal(described.dataAsOf, "2026-11-14T07:30:00Z");
        const rendered = (await present(context, "render_view", { source: "vms", params: { customer: "acme" }, view: VIEW, format: "csv" }, LOCAL)).result;
        assert.equal(typeof rendered.ok, "boolean");
        assert.ok(rendered.findings.length > 0, "the view's fields are not in the empty data: findings, not an error");
    } finally {
        await context.close();
    }
});

test("a CSV answer: read in a worker as a file is, its fields under the policy; check-source says its size", async () => {
    routes.set("/v1/export.csv", (_req, res) => {
        res.writeHead(200, { "content-type": "text/csv" });
        res.end("name,cpu,state,owner\nweb-1,4,running,alice@example.com\nweb-2,2,stopped,bob@example.com\ndb-1,8,running,carol@example.com\n");
    });
    const options = { ...optionsOf({}, {}, { policy: { results: true } }), sources: { csv: { http: { backend: "platform", path: "/export.csv", format: "csv" }, policy: POLICY } } };
    const context = await contextOf(options);
    try {
        const described = (await describe(context, undefined, LOCAL, "csv")).result;
        assert.deepEqual(described.fields.map((f) => f.name).sort(), ["cpu", "name", "state"]);
        assert.match(await csvOf(context, { source: "csv" }), /running,12/);
        assert.equal(asked[0].headers.accept, "application/json", "the backend's own accept header wins over pivotkit's");
    } finally {
        await context.close();
    }
    const checked = await checkSource(options, "csv", {});
    assert.equal(checked.ok, true);
    assert.match(checked.text, /a CSV body of \d+ bytes/);
});

/** A backend route that answers slowly and says when its connection closed. */
function slowRoute(path) {
    const state = { closed: false };
    routes.set(path, (req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"items":[');
        req.socket.on("close", () => (state.closed = true));
    });
    return state;
}

/** Waits until a condition holds (at most about a second). */
async function until(condition) {
    for (let i = 0; i < 100 && !condition(); i++) {
        await new Promise((r) => setTimeout(r, 10));
    }
    return condition();
}

test("a REST client that closes its connection and an MCP client that closes its call's: the backend's request is cancelled", async () => {
    const s = await restServer({ ...optionsOf(), sources: { slow: { http: { backend: "platform", path: "/slow", rows: "/items" }, policy: POLICY } } }, { enable: ["rest", "mcp"] });
    const client = new Client({ name: "cancels", version: "1.0.0" });
    try {
        const rest = slowRoute("/v1/slow");
        const gone = new AbortController();
        const answer = fetch(`${s.api}/sources/describe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "slow" }), signal: gone.signal });
        assert.ok(await until(() => asked.length === 1), "the backend was asked");
        gone.abort();
        await assert.rejects(answer);
        assert.ok(await until(() => rest.closed), "REST: the backend's connection was closed");
        // MCP over Streamable HTTP: a call ends when its HTTP request does (the client closes)
        await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`)));
        const mcp = slowRoute("/v1/slow");
        const tool = client.callTool({ name: "describe_source", arguments: { source: "slow" } });
        tool.catch(() => undefined);
        assert.ok(await until(() => asked.length === 2), "the backend was asked again");
        await client.close();
        await assert.rejects(tool);
        assert.ok(await until(() => mcp.closed), "MCP: the backend's connection was closed");
    } finally {
        await client.close();
        await s.close();
    }
});


test("secrets in literal query values: never in check-source's text or the debug log", async () => {
    routes.set("/v1/customers/acme/vms", json({ items: VMS }));
    const options = optionsOf({ query: { state: "{state}", api_key: "tok-secret-1" } });
    const checked = await checkSource(options, "vms", { customer: "acme" });
    assert.equal(checked.ok, true);
    assert.match(checked.text, /api_key=\.\.\./);
    assert.doesNotMatch(checked.text, /tok-secret-1/);
    const context = await contextOf(options, "debug");
    try {
        await describe(context, { customer: "acme" });
        assert.ok(context.lines.some((l) => /api_key=\.\.\./.test(l.message ?? "")));
        assert.doesNotMatch(JSON.stringify(context.lines), /tok-secret-1/);
    } finally {
        await context.close();
    }
});

test("DATA_NOT_AVAILABLE names only the values a caller sets: never a default", async () => {
    routes.set("/v1/customers/acme/vms", json({ error: "no" }, 403));
    const options = optionsOf({ query: { state: "{state}", region: "{region}" } }, { params: { ...optionsOf().sources.vms.params, region: { type: "string", enum: ["eu", "us"], default: "eu" } } });
    const context = await contextOf(options);
    try {
        const e = await failure(describe(context, { customer: "acme", region: "us" }));
        assert.deepEqual([e.code, e.message], ["DATA_NOT_AVAILABLE", "nothing you may see for customer=acme: check the value"]);
        assert.equal(asked[0].query, "?region=us", "the value was sent; it is not said back because the parameter has a default");
    } finally {
        await context.close();
    }
});

test("a caller's value of the wrong form: refused with the parameter's description, example and pattern; a number for a text, a lone surrogate refused", async () => {
    const context = await contextOf(optionsOf());
    try {
        const upper = await failure(describe(context, { customer: "ACME" }));
        assert.equal(upper.message, "params.customer is not in the expected form (The customer's short name, for example acme; pattern ^[a-z0-9-]{1,40}$)");
        assert.match((await failure(describe(context, { customer: 42 }))).message, /^params\.customer must be a text/);
        assert.equal(asked.length, 0);
    } finally {
        await context.close();
    }
    const { normalizeParams } = await import("../src/sources/params.js");
    assert.throws(() => normalizeParams({ x: { type: "string", pattern: ".{1,10}" } }, { x: "a\uD800" }, null, "s"), /lone surrogates/);
    assert.deepEqual({ ...normalizeParams({ x: { type: "string", pattern: ".{1,10}" } }, { x: "a😀" }, null, "s") }, { x: "a😀" });
});

test("page and offset paging: exactly maxPages full pages and an empty one after them is no error; more is", async () => {
    const pages = (count, size) => (req, res, url) => {
        const page = Number(url.searchParams.get("page") ?? Math.floor(Number(url.searchParams.get("from")) / size) + 1);
        json({ items: page <= count ? Array.from({ length: size }, (_, i) => ({ name: `vm-${page}-${i}`, cpu: 1, state: "running" })) : [] })(req, res);
    };
    routes.set("/v1/two", pages(2, 3));
    routes.set("/v1/three", pages(3, 3));
    routes.set("/v1/offsets", pages(2, 2));
    const src = (path, paging) => ({ http: { backend: "platform", path, rows: "/items", paging, maxPages: 2 }, policy: POLICY });
    const context = await contextOf({ ...optionsOf(), sources: { two: src("/two", { page: "page" }), three: src("/three", { page: "page" }), offsets: src("/offsets", { offset: "from", limit: "size", size: 2 }) } });
    try {
        assert.equal((await describe(context, undefined, LOCAL, "two")).result.rows, 6);
        assert.deepEqual(asked.map((a) => a.query), ["?page=1", "?page=2", "?page=3"]);
        asked = [];
        assert.equal((await describe(context, undefined, LOCAL, "offsets")).result.rows, 4);
        assert.deepEqual(asked.map((a) => a.query), ["?from=0&size=2", "?from=2&size=2", "?from=4&size=2"]);
        const over = await failure(describe(context, undefined, LOCAL, "three"));
        assert.deepEqual([over.code, over.message], ["LIMIT_EXCEEDED", "the source three has more than 2 pages (http.maxPages)"]);
    } finally {
        await context.close();
    }
});

test("a new load is a new table: after ttl the worker computes the backend's new rows, not the ones it kept", async () => {
    let items = VMS;
    routes.set("/v1/customers/acme/vms", (req, res) => json({ items })(req, res));
    const context = await contextOf(optionsOf({}, { ttl: 1 }));
    try {
        assert.equal((await describe(context, { customer: "acme" })).result.rows, 3);
        items = VMS.slice(0, 1);
        assert.equal((await describe(context, { customer: "acme" })).result.rows, 3, "within ttl: kept data");
        await new Promise((r) => setTimeout(r, 1100));
        assert.equal((await describe(context, { customer: "acme" })).result.rows, 1);
        assert.equal(asked.length, 2);
    } finally {
        await context.close();
    }
});

test("the request's signal reaches every operation over a source (suggest, validate, describe a view, the file route) and a code source over REST", async () => {
    // a time limit far beyond the test's bound: only the caller's signal can end these calls in time
    const context = await contextOf({ ...optionsOf({}, {}, { policy: { results: true } }), sources: { slow: { http: { backend: "platform", path: "/slow", rows: "/items" }, timeMs: 60_000, policy: POLICY } } });
    const runs = {
        suggest_view: (signal) => present(context, "suggest_view", { source: "slow" }, LOCAL, { signal }),
        validate_view: (signal) => present(context, "validate_view", { source: "slow", view: VIEW }, LOCAL, { signal }),
        describe_view: (signal) => present(context, "describe_view", { source: "slow", view: VIEW }, LOCAL, { signal }),
        renderFile: (signal) => renderFile(context, { source: "slow", view: VIEW, format: "csv" }, LOCAL, { signal })
    };
    try {
        for (const [name, start] of Object.entries(runs)) {
            asked = [];
            const state = slowRoute("/v1/slow");
            const gone = new AbortController();
            const call = start(gone.signal);
            call.catch(() => undefined);
            assert.ok(await until(() => asked.length === 1), `${name}: the backend was asked`);
            const aborted = Date.now();
            gone.abort();
            const ended = await Promise.race([call.then(() => "answered", (e) => e), new Promise((r) => setTimeout(() => r("still waiting"), 2000))]);
            assert.ok(ended instanceof Error, `${name}: the call ended at the abort (${ended})`);
            assert.notEqual(ended.name, "TimeoutError", `${name}: not by a time limit`);
            assert.ok(Date.now() - aborted < 2000, `${name}: within 2 s of the abort`);
            assert.ok(await until(() => state.closed), `${name}: the backend's connection was closed`);
        }
    } finally {
        await context.close();
    }
    let started = false;
    let aborted = false;
    const s = await restServer({
        sources: {
            code: {
                load: (_params, { signal }) =>
                    new Promise((resolve) => {
                        started = true;
                        signal.addEventListener("abort", () => ((aborted = true), resolve([])), { once: true });
                    }),
                timeMs: 60_000
            }
        }
    });
    try {
        const gone = new AbortController();
        const answer = fetch(`${s.api}/sources/describe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "code" }), signal: gone.signal });
        answer.catch(() => undefined);
        assert.ok(await until(() => started), "the load started");
        gone.abort();
        assert.ok(await until(() => aborted), "the code source's signal was aborted when its only caller went away");
    } finally {
        await s.close();
    }
});

test("operator hints: intranet for a private address, NODE_EXTRA_CA_CERTS for a certificate, a warning for no rows; check-config warns of a local host without intranet", async () => {
    routes.set("/v1/all", json({ items: VMS, meta: { total: 3 } }));
    routes.set("/v1/none", json({ items: [] }));
    const sources = { all: { http: { backend: "platform", path: "/all", rows: "/items" }, policy: POLICY }, meta: { http: { backend: "platform", path: "/all", rows: "/meta" }, policy: POLICY }, none: { http: { backend: "platform", path: "/none", rows: "/items" }, policy: POLICY }, nothing: { http: { backend: "platform", path: "/all", rows: "/results" }, policy: POLICY } };
    const closed = { httpSources: { backends: { platform: { url: `https://api.example.test:${port}/v1` } } }, sources };
    assert.match((await checkSource(closed, "all", {})).text, /REFUSED_ADDRESS.*set intranet: true on the backend \(httpSources\.backends\.platform\.intranet\)/);
    const open = { httpSources: { backends: { platform: { url: `https://api.example.test:${port}/v1`, intranet: true } } }, sources };
    const noCa = createGuardedFetch({ lookup: (_h, o, cb) => cb(null, o?.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4) });
    assert.match((await checkSource(open, "all", {}, { fetch: noCa })).text, /a certificate error: for an internal certificate authority start the server with NODE_EXTRA_CA_CERTS/);
    assert.match((await checkSource(open, "meta", {})).text, /pointer \/meta points to an object, not a list of rows; its keys: total/);
    const none = await checkSource(open, "none", {});
    assert.equal(none.ok, true);
    assert.match(none.text, /warning: the answer has no rows at \/items/);
    const context = await contextOf(open);
    try {
        await failure(describe(context, undefined, LOCAL, "nothing"));
        assert.ok(context.lines.some((l) => l.event === "warning" && l.message === "the source nothing: the answer has no rows at /results (http.rows)"));
    } finally {
        await context.close();
    }
    const local = await checkConfig({ httpSources: { backends: { platform: { url: "https://localhost:8443/v1" } } }, sources: { all: sources.all } }, { http: true, env: {}, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true });
    assert.match(factsOf(local.text), /WARNING \(HTTP sources\): sources\.all: localhost is a loopback or private address, which is refused unless the backend has intranet: true/);
});

test("options: a query's problem is reported under http.query", () => {
    assert.throws(() => validateOptions(optionsOf({ query: { State: "{state}", state: "x" } })), /sources\.vms\.http\.query: state is given twice/);
    assert.throws(() => validateOptions(optionsOf({ query: { x: "{nope}" } })), /sources\.vms\.http\.query\.x: names \{nope\}, which is no declared parameter/);
});

test("the kept answer: hidden columns dropped before it is kept, the values only as a keyed digest; a profile that shows more gets its own copy", async () => {
    routes.set("/v1/customers/acme-secret/vms", json({ items: VMS }));
    const auth = { mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp", clientProfiles: { "narrow-bot": "narrow" } };
    const shown = { default: "hide", fields: { name: "show", cpu: "show", state: "show", owner: "show" } };
    const context = await contextOf(optionsOf({}, { policy: shown }, { policy: { profiles: { narrow: { fields: { owner: "hide" } } } }, auth }));
    // one person through two clients: the same identity, a narrower profile through one of them
    const through = (client) => callerOf("oauth", { token: "jwt", clientId: client, scopes: [], expiresAt: 0, extra: { subject: "ana", issuer: auth.issuer, groups: [] } }, auth);
    const kept = [];
    const original = loadRunner.runLoad;
    loadRunner.runLoad = async (key, ...rest) => {
        const ran = await original(key, ...rest);
        kept.push({ key, value: ran.value });
        return ran;
    };
    try {
        const narrow = (await describe(context, { customer: "acme-secret" }, through("narrow-bot"))).result;
        assert.deepEqual(narrow.fields.map((f) => f.name).sort(), ["cpu", "name", "state"]);
        assert.equal(narrow.hiddenFields, 2, "owner and tags, dropped before the answer was kept, still count as hidden");
        const wide = (await describe(context, { customer: "acme-secret" }, through("claude"))).result;
        assert.deepEqual(wide.fields.map((f) => f.name).sort(), ["cpu", "name", "owner", "state"]);
        assert.equal(kept.length, 2);
        // what is kept holds no hidden column, and the key no value in clear text
        assert.deepEqual(kept[0].value.table.columns.sort(), ["cpu", "name", "state"]);
        assert.doesNotMatch(JSON.stringify(kept[0].value.table), /alice@example\.com|prod/);
        assert.ok(kept[1].value.table.columns.includes("owner"));
        for (const { key } of kept) {
            assert.doesNotMatch(String(key), /acme-secret/);
        }
        assert.notEqual(kept[0].key, kept[1].key);
    } finally {
        loadRunner.runLoad = original;
        await context.close();
    }
});

/** Every text a kept value holds, its byte arrays read as UTF-8 too (a CSV answer kept as it came). */
function keptTexts(value, out = [], seen = new Set()) {
    if (typeof value === "string") {
        out.push(value);
    } else if (value instanceof Uint8Array) {
        // a copy: a packed column's bytes sit on a SharedArrayBuffer, which TextDecoder does not read
        out.push(new TextDecoder().decode(new Uint8Array(value)));
    } else if (value !== null && typeof value === "object" && !seen.has(value) && !ArrayBuffer.isView(value)) {
        seen.add(value);
        for (const v of Object.values(value)) {
            keptTexts(v, out, seen);
        }
    }
    return out.join("\n");
}

test("a CSV answer is kept without the columns the caller's levels hide; a profile that shows more gets its own copy", async () => {
    routes.set("/v1/export.csv", (_req, res) => {
        res.writeHead(200, { "content-type": "text/csv" });
        res.end("name,cpu,state,owner,secret\nweb-1,4,running,alice@example.com,s3cr3t-a\nweb-2,2,stopped,bob@example.com,s3cr3t-b\ndb-1,8,running,carol@example.com,s3cr3t-c\n");
    });
    const auth = { mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp", clientProfiles: { "narrow-bot": "narrow" } };
    const shown = { default: "hide", fields: { name: "show", cpu: "show", state: "show", owner: "show" } };
    const options = { ...optionsOf({}, {}, { policy: { results: true, profiles: { narrow: { fields: { owner: "hide" } } } }, auth }), sources: { csv: { http: { backend: "platform", path: "/export.csv", format: "csv" }, policy: shown } } };
    const context = await contextOf(options);
    const through = (client) => callerOf("oauth", { token: "jwt", clientId: client, scopes: [], expiresAt: 0, extra: { subject: "ana", issuer: auth.issuer, groups: [] } }, auth);
    const kept = [];
    const original = loadRunner.runLoad;
    loadRunner.runLoad = async (key, ...rest) => {
        const ran = await original(key, ...rest);
        kept.push({ key, value: ran.value });
        return ran;
    };
    try {
        const narrow = (await describe(context, undefined, through("narrow-bot"), "csv")).result;
        assert.deepEqual(narrow.fields.map((f) => f.name).sort(), ["cpu", "name", "state"]);
        assert.equal(narrow.hiddenFields, 2, "owner and secret, dropped before the answer was kept, still count as hidden");
        assert.match(await csvOf(context, { source: "csv" }, through("narrow-bot")), /running,12/);
        const wide = (await describe(context, undefined, through("claude"), "csv")).result;
        assert.deepEqual(wide.fields.map((f) => f.name).sort(), ["cpu", "name", "owner", "state"]);
        assert.equal(wide.hiddenFields, 1);
        assert.equal(asked.length, 2, "the narrow profile's second call reads what was kept; the wide one loads its own");
        // what is kept for the narrow profile holds neither hidden column, the wide one only its own
        const narrowKept = keptTexts(kept[0].value);
        assert.doesNotMatch(narrowKept, /alice@example\.com|s3cr3t/);
        assert.match(narrowKept, /web-1/, "the shown values are kept");
        const wideKept = keptTexts(kept.at(-1).value);
        assert.match(wideKept, /alice@example\.com/);
        assert.doesNotMatch(wideKept, /s3cr3t/);
        assert.equal(kept[0].key, kept[1].key);
        assert.notEqual(kept[0].key, kept.at(-1).key, "a narrower and a wider profile never share a kept answer");
    } finally {
        loadRunner.runLoad = original;
        await context.close();
    }
});

test("a CSV answer kept packed: the reader's notes without a hidden column's, warm calls without the table, the reader's limits as before", async () => {
    routes.set("/v1/export.csv", (_req, res) => {
        res.writeHead(200, { "content-type": "text/csv" });
        res.end("name,cpu,day,born\nweb-1,4,03/04/2026,05/06/1990\nweb-2,2,04/05/2026,07/08/1991\ndb-1,8,05/06/2026,09/10/1992\n");
    });
    const auth = { mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp" };
    const ana = callerOf("oauth", { token: "jwt", clientId: "claude", scopes: [], expiresAt: 0, extra: { subject: "ana", issuer: auth.issuer, groups: [] } }, auth);
    const policy = { default: "hide", fields: { name: "show", cpu: "show", day: "show" } };
    const options = { ...optionsOf({}, {}, { policy: { results: true }, auth }), sources: { csv: { http: { backend: "platform", path: "/export.csv", format: "csv" }, policy } } };
    const context = await contextOf(options);
    try {
        const described = (await describe(context, undefined, ana, "csv")).result;
        assert.equal(described.rows, 3);
        const notes = described.notes.map((n) => n.message).join("\n");
        assert.match(notes, /Dates in "day" were read as month\/day\/year/, "the reader's notes reach the caller");
        assert.doesNotMatch(notes, /born/, "nothing about a hidden column");
        for (let i = 0; i < 3; i++) {
            assert.match(await csvOf(context, { source: "csv", view: { rows: ["name"], values: [{ field: "cpu", agg: "sum" }] } }, ana), /db-1,8/);
        }
        assert.equal(asked.length, 1);
        assert.deepEqual(context.computer.sent(), { tables: 1, cached: 4 }, "the bytes go once, to the worker that reads them; the operations go without the table");
    } finally {
        await context.close();
    }
    // a limit of the reader: its own code and words, as when the operation's worker read the bytes
    const limited = await contextOf({ ...options, limits: { rows: 2 } });
    try {
        const error = await failure(describe(limited, undefined, ana, "csv"));
        assert.equal(error.code, "LIMIT_EXCEEDED");
        assert.match(error.message, /limits\.rows/);
    } finally {
        await limited.close();
    }
    // every column hidden: the rows still counted
    const none = await contextOf({ ...options, sources: { csv: { ...options.sources.csv, policy: { default: "hide" } } } });
    try {
        const described = (await describe(none, undefined, ana, "csv")).result;
        assert.deepEqual([described.rows, described.fields, described.hiddenFields], [3, [], 4]);
    } finally {
        await none.close();
    }
});

test("a kept CSV answer is read under the limits and time zone it was read with: other ones load their own", async () => {
    routes.set("/v1/export.csv", (_req, res) => {
        res.writeHead(200, { "content-type": "text/csv" });
        res.end("name,cpu,state\nweb-1,4,running\nweb-2,2,stopped\ndb-1,8,running\n");
    });
    const auth = { mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp" };
    const ana = callerOf("oauth", { token: "jwt", clientId: "claude", scopes: [], expiresAt: 0, extra: { subject: "ana", issuer: auth.issuer, groups: [] } }, auth);
    // one configured source object in two servers (a host that builds its contexts from one options object)
    const base = optionsOf({}, {}, { auth });
    const sources = { csv: { http: { backend: "platform", path: "/export.csv", format: "csv" }, policy: POLICY } };
    const wide = await contextOf({ ...base, sources });
    const narrow = await contextOf({ ...base, sources, limits: { rows: 2 } });
    const zoned = await contextOf({ ...base, sources, timeZone: "Asia/Tokyo" });
    try {
        assert.equal((await describe(wide, undefined, ana, "csv")).result.rows, 3);
        assert.equal((await failure(describe(narrow, undefined, ana, "csv"))).code, "LIMIT_EXCEEDED", "not the other server's kept table");
        assert.equal((await describe(zoned, undefined, ana, "csv")).result.rows, 3);
        assert.equal(asked.length, 3, "each reads the answer under its own limits and time zone");
    } finally {
        await Promise.all([wide.close(), narrow.close(), zoned.close()]);
    }
});

test("a CSV answer for a caller without an identity: read by the operation's worker, nothing kept", async () => {
    routes.set("/v1/export.csv", (_req, res) => {
        res.writeHead(200, { "content-type": "text/csv" });
        res.end("name,cpu,state,owner\nweb-1,4,running,alice@example.com\nweb-2,2,stopped,bob@example.com\n");
    });
    const options = { ...optionsOf({}, {}, { policy: { results: true } }), sources: { csv: { http: { backend: "platform", path: "/export.csv", format: "csv" }, policy: POLICY } } };
    const context = await contextOf(options);
    const kept = [];
    const original = loadRunner.runLoad;
    loadRunner.runLoad = async (key, ...rest) => {
        const ran = await original(key, ...rest);
        kept.push(key);
        return ran;
    };
    try {
        for (let i = 0; i < 2; i++) {
            const described = (await describe(context, undefined, nobody(), "csv")).result;
            assert.deepEqual([described.fields.map((f) => f.name).sort(), described.hiddenFields], [["cpu", "name", "state"], 1]);
        }
        assert.deepEqual(kept, [null, null], "no key: nothing kept or shared");
        assert.equal(asked.length, 2);
        assert.deepEqual(context.computer.sent(), { tables: 0, cached: 0 }, "no read job: the bytes go to the operation's worker");
    } finally {
        loadRunner.runLoad = original;
        await context.close();
    }
});
