// Sources behind one dispatch (file, code, the reserved "inline:"), the params a caller passes with a
// source, tables computed in a worker (a table job), when the data is from (dataAsOf), the operator's
// field descriptions, and the error details a person can act on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OPERATION_ERRORS, OperationError } from "pivotkit-report/operations";
import { ConfigError, callerOf, createContext, present, presentedInput, validateOptions } from "pivotkit-server";
import { createComputer } from "../src/compute.js";
import { errorDetails, newRequestId, requestId, withRequestId } from "../src/request-id.js";
import { asOfMembers, asOfSentence, asOfText } from "../src/sources/as-of.js";
import { INLINE_ID, kindOf } from "../src/sources/index.js";
import { canonicalJson, tableKeyOf } from "../src/sources/keys.js";
import { MATCH_MS, declaredProblems, matchMeans, matchWithin, normalizeParams, paramSchemaOf, paramsList } from "../src/sources/params.js";
import { BY_REGION, TOKEN, call, restServer, workspace } from "./helpers.js";

const LOCAL = callerOf("none", undefined);
const VIEW = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };
const ROWS = [{ Region: "North", Sales: 10, Secret: "x" }, { Region: "South", Sales: 20, Secret: "y" }];

/** A context without a log. */
const contextOf = (options) => createContext({ log: "off", ...options });

test("the kinds of source; inline: is reserved for data sent in the request, never a configured id", async () => {
    assert.equal(kindOf({ file: "a.csv" }), "file");
    assert.equal(kindOf({ load: async () => [] }), "code");
    assert.equal(kindOf({ http: {} }), "http");
    const context = await contextOf({ sources: { sales: { load: async () => ROWS } } });
    try {
        const unknown = await present(context, "describe_source", { source: "nothing" }, LOCAL).catch((e) => e);
        assert.equal(unknown.code, "SOURCE_NOT_FOUND");
        assert.match(unknown.message, /^no source "nothing"; list_sources lists them$/);
        // inline: without data is no source to look up: the table is missing (inline.test.js has the rest)
        const empty = await present(context, "describe_source", { source: INLINE_ID }, LOCAL).catch((e) => e);
        assert.equal(empty.code, "INVALID_INPUT");
        assert.match(empty.message, /give data with columns, rows and rowCount/);
        assert.throws(() => validateOptions({ sources: { "inline:": { load: async () => [] } } }), ConfigError, "no configured id holds a colon");
    } finally {
        await context.close();
    }
});

test("params: a declaration is checked when the configuration is", () => {
    assert.deepEqual(declaredProblems({ customer: { type: "string", required: true, pattern: "^[a-z0-9-]{1,40}$", example: "acme" }, state: { type: "string", enum: ["running", "stopped"], default: "running" }, n: { type: "integer", minimum: 1, maximum: 10 } }), []);
    const bad = [
        [{ "1x": { type: "string" } }, /a name is letters/],
        [{ x: { type: "date" } }, /type must be one of/],
        [{ x: { type: "string", pattern: "(" } }, /not a valid regular expression/],
        [{ x: { type: "integer", pattern: "^1$" } }, /for a string parameter/],
        [{ x: { type: "string", maxLength: 1000 } }, /maxLength is a whole number from 0 to 256/],
        [{ x: { type: "string", enum: ["a"], default: "b" } }, /default: must be one of a/],
        [{ x: { type: "string", pattern: "^[a-z]+$", example: "ACME" } }, /example: is not in the expected form/],
        [{ x: { type: "string", secret: true } }, /unknown key "secret"/],
        [Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`p${i}`, { type: "string" }])), /at most 16 parameters/]
    ];
    for (const [declared, why] of bad) {
        assert.match(declaredProblems(declared).join("; "), why, JSON.stringify(declared).slice(0, 60));
    }
    assert.throws(() => validateOptions({ sources: { s: { load: async () => [], params: { x: { type: "string", pattern: "(" } } } } }), /sources\.s\.params: x: pattern is not a valid regular expression/);
    assert.throws(() => validateOptions({ sources: { s: { file: "a.csv", params: { x: { type: "string" } } } } }), /only a code source \(load\) takes params/);
});

test("params: values are checked, typed and written again; defaults filled; unknown, claim-bound and missing ones refused", () => {
    const declared = { customer: { type: "string", required: true, description: "The customer's short name", example: "acme" }, limit: { type: "integer", minimum: 1, maximum: 500, default: 100 }, live: { type: "boolean" }, day: { type: "string", format: "date" }, ratio: { type: "number" }, tenant: { type: "string", claim: "tid" } };
    const caller = { claims: { tid: "t-1" } };
    const out = normalizeParams(declared, { customer: "acme", limit: "42", live: "true", day: "2026-02-28", ratio: "0.5" }, caller, "vms");
    assert.deepEqual({ ...out }, { customer: "acme", day: "2026-02-28", limit: 42, live: true, ratio: 0.5, tenant: "t-1" });
    assert.deepEqual(Object.keys(out), ["customer", "day", "limit", "live", "ratio", "tenant"], "keys sorted");
    assert.equal(Object.getPrototypeOf(out), null);
    assert.equal(normalizeParams(declared, { customer: "acme" }, caller, "vms").limit, 100);
    const refused = [
        [{}, "INVALID_INPUT", /^the source vms needs params\.customer \(The customer's short name, for example acme\); re-run with params\.customer=acme$/],
        [{ customer: "acme", region: "x" }, "INVALID_INPUT", /has no param "region"; it takes customer, day, limit, live, ratio/],
        [{ customer: "acme", tenant: "t-2" }, "INVALID_INPUT", /set by the server from your sign-in/],
        [{ customer: "../admin" }, "INVALID_INPUT", /may not hold \.\. or control characters/],
        [{ customer: "a b" }, "INVALID_INPUT", /letters, digits and \. _ ~ - only/],
        [{ customer: "a/b" }, "INVALID_INPUT", /letters, digits/],
        [{ customer: "acme", limit: 0 }, "INVALID_INPUT", /at least 1/],
        [{ customer: "acme", limit: "4.5" }, "INVALID_INPUT", /whole number/],
        [{ customer: "acme", live: "yes" }, "INVALID_INPUT", /true or false/],
        [{ customer: "acme", day: "2026-02-30" }, "INVALID_INPUT", /a date/],
        [{ customer: "x".repeat(65) }, "INVALID_INPUT", /at most 64 characters/]
    ];
    for (const [given, code, message] of refused) {
        assert.throws(() => normalizeParams(declared, given, caller, "vms"), (e) => e.code === code && message.test(e.message), JSON.stringify(given));
    }
    assert.throws(() => normalizeParams(declared, { customer: "acme" }, {}, "vms"), (e) => e.code === "NOT_ALLOWED" && /no tid claim/.test(e.message), "a missing claim fails closed");
    for (const tid of ["a/b", "..", "x%2F", "a?b", "a\nb", "a\\b"]) {
        assert.throws(() => normalizeParams(declared, { customer: "acme" }, { claims: { tid } }, "vms"), (e) => e.code === "NOT_ALLOWED", tid);
    }
    assert.equal(normalizeParams(undefined, undefined, null, "sales"), null);
    assert.equal(normalizeParams(undefined, {}, null, "sales"), null);
    assert.throws(() => normalizeParams(undefined, { a: "1" }, null, "sales"), /the source sales takes no params/);
    // __proto__ is a plain name
    assert.deepEqual({ ...normalizeParams({ __proto__x: { type: "string" } }, { __proto__x: "a" }, null, "s") }, { __proto__x: "a" });
});

test("params: what list_sources says and the schema of the values leave out claim-bound ones", () => {
    const declared = { state: { type: "string", enum: ["running", "stopped"] }, customer: { type: "string", required: true, example: "acme" }, tenant: { type: "string", claim: "tid" } };
    assert.deepEqual(paramsList(declared), [
        { name: "customer", type: "string", required: true, example: "acme" },
        { name: "state", type: "string", required: false, enum: ["running", "stopped"] }
    ]);
    const schema = paramSchemaOf(declared);
    assert.deepEqual(Object.keys(schema.properties), ["customer", "state"]);
    assert.deepEqual(schema.required, ["customer"]);
    assert.equal(schema.additionalProperties, false);
});

test("params end to end: offered only when a source declares them; the code source gets the values and a frozen caller", async () => {
    const seen = [];
    const options = {
        sources: {
            tickets: {
                load: async (params, how) => {
                    seen.push({ params: { ...params }, caller: how.caller });
                    return [{ Team: params.team, Open: 3 }];
                },
                params: { team: { type: "string", required: true, enum: ["blue", "red"] } },
                policy: { default: "show" }
            },
            plain: { load: async (...args) => (seen.push({ args }), ROWS) }
        }
    };
    const context = await contextOf(options);
    try {
        // data sent in the request is offered on MCP by default, on REST only with a policy's data: true
        assert.deepEqual(context.offers, { mcp: { params: true, data: true }, rest: { params: true, data: false } });
        assert.ok(presentedInput("render_view", { offers: context.offers.mcp }).properties.params);
        assert.equal(presentedInput("list_sources", { offers: context.offers.mcp }).properties.params, undefined);
        const listed = await present(context, "list_sources", {}, LOCAL);
        assert.deepEqual(listed.result.sources.find((s) => s.id === "tickets").params, [{ name: "team", type: "string", required: true, enum: ["blue", "red"] }]);
        assert.equal(listed.result.sources.find((s) => s.id === "plain").params, undefined);
        const described = await present(context, "describe_source", { source: "tickets", params: { team: "red" } }, LOCAL);
        assert.deepEqual(described.result.fields.map((f) => f.name), ["Team", "Open"]);
        assert.deepEqual(seen[0].params, { team: "red" });
        assert.ok(Object.isFrozen(seen[0].caller));
        assert.equal(seen[0].caller.client, "local");
        const error = await present(context, "describe_source", { source: "tickets" }, LOCAL).catch((e) => e);
        assert.equal(error.code, "INVALID_INPUT");
        assert.match(error.message, /needs params\.team \(one of blue, red\); re-run with params\.team=blue$/);
        // a source without params gets no values, the caller and the signal of its time limit; params for it are refused
        await present(context, "describe_source", { source: "plain" }, LOCAL);
        const [values, how] = seen.at(-1).args;
        assert.deepEqual(values, {});
        assert.ok(Object.isFrozen(values));
        assert.equal(how.caller.client, "local");
        assert.ok(how.signal instanceof AbortSignal);
        assert.equal(how.signal.aborted, false);
        assert.equal((await present(context, "describe_source", { source: "plain", params: { a: "1" } }, LOCAL).catch((e) => e)).code, "INVALID_INPUT");
        const rendered = await present(context, "render_view", { source: "tickets", params: { team: "blue" }, view: { rows: ["Team"], values: [{ field: "Open", agg: "sum" }] }, format: "csv" }, LOCAL);
        assert.match(rendered.result.inline.text, /blue/);
    } finally {
        await context.close();
    }
    // without a source that declares params, nothing is offered and the schemas are as they were
    const plain = await contextOf({ sources: { plain: options.sources.plain } });
    try {
        assert.deepEqual(plain.offers, { mcp: { params: false, data: true }, rest: { params: false, data: false } });
        // no params, no params input: REST's schema is as it was; MCP's adds only data (inline.test.js)
        assert.deepEqual(presentedInput("render_view", { offers: plain.offers.rest }), presentedInput("render_view"));
        assert.deepEqual(Object.keys(presentedInput("render_view", { offers: plain.offers.mcp }).properties), [...Object.keys(presentedInput("render_view").properties), "data"]);
    } finally {
        await plain.close();
    }
});

test("params over REST: accepted where offered; where no source takes params, refused with words that say so, for every operation that takes a source", async () => {
    const offered = await restServer({ sources: { tickets: { load: async (params) => [{ Team: params.team, Open: 1 }], params: { team: { type: "string", enum: ["blue"] } } } }, auth: { mode: "token" } }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const ok = await call(`${offered.api}/sources/describe`, { token: TOKEN, body: { source: "tickets", params: { team: "blue" } } });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.match(ok.data.dataAsOf, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        const listed = await call(`${offered.api}/sources`, { token: TOKEN });
        assert.deepEqual(listed.data.sources[0].params, [{ name: "team", type: "string", required: false, enum: ["blue"] }]);
        const openapi = await call(`${offered.url}/openapi.json`, { token: TOKEN });
        assert.ok(openapi.data.components.schemas.DescribeSourceInput.properties.params);
    } finally {
        await offered.close();
    }
    const dir = workspace();
    const plain = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        // the request is well formed: the server has no source to take them (#516). The words stay
        // recognisable for host modules: "takes params" with the sources' route
        const asked = [
            ["sources/describe", { source: "sales", params: { a: "1" } }],
            ["views/render", { source: "sales", view: BY_REGION, format: "csv", params: { a: "1" } }],
            ["views/validate", { source: "sales", view: BY_REGION, params: {} }],
            ["views/render", { source: "nope", view: BY_REGION, params: { a: "1" } }]
        ];
        for (const [path, body] of asked) {
            const refused = await call(`${plain.api}/${path}`, { token: TOKEN, body });
            assert.equal(refused.status, 400, path);
            assert.equal(refused.data.code, "INVALID_INPUT");
            assert.equal(refused.data.detail, "this server has no source that takes params; leave params out (GET /sources lists the sources)", path);
        }
        // another unknown key keeps the schema's words
        const other = await call(`${plain.api}/sources/describe`, { token: TOKEN, body: { source: "sales", parms: { a: "1" } } });
        assert.match(other.data.detail, /^input has no key "parms"$/);
    } finally {
        await plain.close();
    }
});

test("a code source with params keeps its data per identity and values, and not at all without an identity", async () => {
    let loads = 0;
    const context = await contextOf({ sources: { t: { load: async (params) => (loads++, [{ Team: params.team, Open: 1 }]), version: () => 1, params: { team: { type: "string" } } } } });
    const token = (name) => callerOf("token", { token: "", clientId: name, scopes: [], expiresAt: 0, extra: { allScopes: true } });
    const noIdentity = callerOf("oauth", { token: "jwt", clientId: "bot", scopes: [], expiresAt: 0, extra: { subject: null, issuer: "https://issuer.example" } });
    try {
        const describe = (caller, team = "a") => present(context, "describe_source", { source: "t", params: { team } }, caller);
        await describe(token("one"));
        await describe(token("one"));
        assert.equal(loads, 1, "the same identity and values: kept");
        await describe(token("two"));
        assert.equal(loads, 2, "another identity: loaded again");
        await describe(token("one"), "b");
        assert.equal(loads, 3, "other values: loaded again");
        await describe(noIdentity);
        await describe(noIdentity);
        assert.equal(loads, 5, "no identity: never kept");
    } finally {
        await context.close();
    }
    // a version of null keeps nothing, as it does for a source without params
    let unversioned = 0;
    const nulls = await contextOf({ sources: { t: { load: async (params) => (unversioned++, [{ Team: params.team }]), version: () => null, params: { team: { type: "string" } } } } });
    try {
        await present(nulls, "describe_source", { source: "t", params: { team: "a" } }, LOCAL);
        await present(nulls, "describe_source", { source: "t", params: { team: "a" } }, LOCAL);
        assert.equal(unversioned, 2);
    } finally {
        await nulls.close();
    }
});

test("table jobs: data loaded in this thread is computed in a worker, hidden columns dropped there, kept by its key only", async () => {
    const computer = createComputer({ workers: 1 });
    const levels = { default: "show", fields: { secret: "hide" }, counts: true, rows: true };
    const spec = { id: "t", kind: "source", name: "Tickets", levels, limits: {}, schedulable: true };
    const describe = (job) => computer.run("describe_source", { source: "t" }, { spec, ...job });
    try {
        const rows = await describe({ table: { columns: ["Region", "Sales", "Secret"], rows: [["North", 10, "x"], ["South", 20, "y"]] }, tableKey: null, asOf: "2026-11-15T08:00:00Z" });
        assert.deepEqual(rows.outcome.result.fields.map((f) => f.name), ["Region", "Sales"]);
        assert.equal(rows.hidden, 1);
        assert.equal(rows.asOf, "2026-11-15T08:00:00Z");
        const columnar = await describe({ table: { columns: ["Region", "Secret"], data: [["East"], ["z"]] }, tableKey: null });
        assert.deepEqual(columnar.outcome.result.fields.map((f) => f.name), ["Region"]);
        assert.match(String(columnar.asOf), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "the time it arrived");
        // a key keeps the data: the same key with other rows answers the kept ones
        const key = tableKeyOf({ kind: "http", id: "t", configHash: "h", params: { a: 1 }, identity: "id-1", levels, limits: {} });
        await describe({ table: { columns: ["A"], rows: [["one"]] }, tableKey: key });
        assert.equal((await describe({ table: { columns: ["A"], rows: [["one"], ["two"]] }, tableKey: key })).outcome.result.rows, 1);
        // no key: never kept
        await describe({ table: { columns: ["A"], rows: [["one"]] }, tableKey: null });
        assert.equal((await describe({ table: { columns: ["A"], rows: [["one"], ["two"]] }, tableKey: null })).outcome.result.rows, 2);
        assert.equal(tableKeyOf({ kind: "http", id: "t", configHash: "h", params: {}, identity: null, levels, limits: {} }), null, "no identity, no key");
        // the parts are a list, never a joined text
        assert.notEqual(tableKeyOf({ kind: "a", id: "b|c", configHash: "", params: {}, identity: "i", levels: {}, limits: {} }), tableKeyOf({ kind: "a|b", id: "c", configHash: "", params: {}, identity: "i", levels: {}, limits: {} }));
    } finally {
        await computer.close();
    }
});

test("table jobs: a file handed in is parsed in the worker under the import limits and the compute time", async () => {
    const computer = createComputer({ workers: 1, timeMs: 5000 });
    const levels = { default: "show", fields: {}, counts: true, rows: true };
    const spec = { id: "inline:", kind: "file", name: "Data sent with the request", levels, limits: { fileBytes: 1000 }, schedulable: false };
    try {
        const csv = new TextEncoder().encode("Region,Sales\nNorth,10\nSouth,20\n");
        const read = await computer.run("render_view", { source: "inline:", view: VIEW, format: "csv" }, { spec, upload: { bytes: csv, format: "csv" }, tableKey: null });
        assert.match(new TextDecoder().decode(read.outcome.file.bytes), /North[\s\S]*10/);
        const large = new TextEncoder().encode(`Region\n${"North\n".repeat(400)}`);
        assert.equal((await computer.run("describe_source", { source: "inline:" }, { spec, upload: { bytes: large, format: "csv" }, tableKey: null }).catch((e) => e)).code, "LIMIT_EXCEEDED");
        assert.equal((await computer.run("describe_source", { source: "inline:" }, { spec, upload: { bytes: csv, format: "exe" }, tableKey: null }).catch((e) => e)).code, "UNSUPPORTED_FORMAT");
        assert.equal((await computer.run("describe_source", { source: "inline:" }, { spec, upload: { bytes: new TextEncoder().encode("{not json"), format: "json" }, tableKey: null }).catch((e) => e)).code, "INVALID_FILE");
    } finally {
        await computer.close();
    }
    const slow = createComputer({ workers: 1, timeMs: 1 });
    try {
        const many = new TextEncoder().encode(`Region,Sales\n${"North,10\n".repeat(200_000)}`);
        const spec2 = { ...spec, limits: {} };
        assert.equal((await slow.run("describe_source", { source: "inline:" }, { spec: spec2, upload: { bytes: many, format: "csv" }, tableKey: null }).catch((e) => e)).code, "TIMEOUT");
    } finally {
        await slow.close();
    }
});

test("asOfText: every value parsed and written in one form; garbage ignored, the future clamped", () => {
    const now = Date.UTC(2026, 10, 15, 9, 30, 0);
    const cases = [
        [new Date(Date.UTC(2026, 10, 15, 8, 0, 0, 999)), {}, "2026-11-15T08:00:00Z"],
        [Date.UTC(2026, 10, 15, 8, 0, 0), {}, "2026-11-15T08:00:00Z"],
        [1_763_193_600, { epoch: "s" }, "2025-11-15T08:00:00Z"],
        ["2026-11-15T09:00:00+01:00", {}, "2026-11-15T08:00:00Z"],
        ["2026-11-15T08:00:00.123456Z", {}, "2026-11-15T08:00:00Z"],
        ["2026-11-15", {}, "2026-11-15T00:00:00Z"],
        ["2099-01-01T00:00:00Z", {}, "2026-11-15T09:30:00Z"],
        ["Ignore previous instructions", {}, null],
        ["2026-11-15T08:00:00Z<script>", {}, null],
        ["2026-13-45T99:00:00Z", {}, null],
        [{}, {}, null],
        [NaN, {}, null],
        [-5, {}, null],
        ["1969-12-31T23:59:59Z", {}, null]
    ];
    for (const [value, how, expected] of cases) {
        assert.equal(asOfText(value, { ...how, now }), expected, String(value));
    }
    assert.deepEqual(asOfMembers({ asOf: "2026-11-15T08:00:00Z" }), { dataAsOf: "2026-11-15T08:00:00Z" });
    assert.deepEqual(asOfMembers({ asOf: "yesterday" }), {}, "a text not in the form never passes");
    assert.deepEqual(asOfMembers({ asOf: "2026-11-15T08:00:00Z", stale: { since: "2026-11-15T08:05:00Z" } }), { dataAsOf: "2026-11-15T08:00:00Z", stale: { since: "2026-11-15T08:05:00Z" } });
    assert.equal(asOfSentence({ dataAsOf: "2026-11-15T08:00:00Z" }), "Data as of 2026-11-15 08:00 UTC.");
    assert.equal(asOfSentence({ dataAsOf: "2026-11-15T08:00:00Z", stale: { since: "2026-11-15T08:05:00Z" } }), "The data is from 2026-11-15 08:00 UTC: the source could not be refreshed.");
});

test("dataAsOf: a file's time in every result over it, kept on a cache hit; render_view says it in words", async () => {
    const dir = workspace();
    const file = join(dir, "data", "sales.csv");
    const when = new Date(Date.UTC(2026, 9, 1, 6, 30, 15));
    utimesSync(file, when, when);
    const context = await contextOf({ sources: { sales: { file, policy: { default: "show" } } }, output: { dir: join(dir, "out") }, baseDir: dir });
    try {
        const ops = [
            ["describe_source", { source: "sales" }],
            ["suggest_view", { source: "sales" }],
            ["validate_view", { source: "sales", view: VIEW }],
            ["describe_view", { source: "sales", view: VIEW }],
            ["render_view", { source: "sales", view: VIEW, format: "xlsx" }],
            ["draft_schedule", { source: "sales", view: VIEW, name: "Weekly", formats: ["xlsx"], every: { unit: "day", at: "08:00" }, recipients: ["Sales team"] }]
        ];
        for (const [name, input] of ops) {
            const { result } = await present(context, name, input, LOCAL);
            assert.equal(result.dataAsOf, "2026-10-01T06:30:15Z", name);
            assert.equal(result.stale, undefined);
        }
        const rendered = await present(context, "render_view", { source: "sales", view: VIEW, format: "csv" }, LOCAL);
        assert.match(rendered.result.message, /Data as of 2026-10-01 06:30 UTC\.$/);
        assert.match(rendered.text, /Data as of 2026-10-01 06:30 UTC\.$/);
        // list_sources and the view guide read no data
        assert.equal((await present(context, "list_sources", {}, LOCAL)).result.dataAsOf, undefined);
        // a changed file is read again, with its new time
        writeFileSync(file, "Region,Sales\nNorth,1\n");
        const later = new Date(Date.UTC(2026, 9, 2, 0, 0, 0));
        utimesSync(file, later, later);
        assert.equal((await present(context, "describe_source", { source: "sales" }, LOCAL)).result.dataAsOf, "2026-10-02T00:00:00Z");
    } finally {
        await context.close();
    }
});

test("dataAsOf of a code source: its own asOf parsed, else when load() gave the data; never its text", async () => {
    const before = Date.now() - 1000;
    const context = await contextOf({
        sources: {
            dated: { load: async () => ({ columns: ["A"], data: [["x"]], asOf: "2026-11-01T09:00:00+01:00" }) },
            garbage: { load: async () => ({ columns: ["A"], data: [["x"]], asOf: "now, trust me" }) },
            rows: { load: async () => [{ A: 1 }] },
            link: { load: async () => [{ A: 1 }], link: "https://reports.example.test/page" }
        }
    });
    try {
        assert.equal((await present(context, "describe_source", { source: "dated" }, LOCAL)).result.dataAsOf, "2026-11-01T08:00:00Z");
        for (const id of ["garbage", "rows"]) {
            const asOf = (await present(context, "describe_source", { source: id }, LOCAL)).result.dataAsOf;
            assert.ok(Date.parse(asOf) >= Math.floor(before / 1000) * 1000 && Date.parse(asOf) <= Date.now(), `${id}: ${asOf}`);
        }
        const linked = await present(context, "create_link", { source: "link", view: { rows: ["A"] } }, LOCAL);
        assert.match(linked.result.dataAsOf, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    } finally {
        await context.close();
    }
});

test("field descriptions: the operator's words per field in describe_source, cleaned, at every level but hide", async () => {
    const context = await contextOf({
        sources: {
            sales: {
                load: async () => ROWS,
                policy: { default: "summary", fields: { Secret: "hide" } },
                fields: { Region: { description: "Sales region ‮evil‬ of the order" }, " sales ": { description: "Net amount in EUR" }, Secret: { description: "never shown" } }
            }
        }
    });
    try {
        const { result } = await present(context, "describe_source", { source: "sales" }, LOCAL);
        const byName = Object.fromEntries(result.fields.map((f) => [f.name, f]));
        assert.equal(byName.Region.description, "Sales region evil of the order");
        assert.equal(byName.Sales.description, "Net amount in EUR");
        assert.equal(byName.Secret, undefined);
        assert.ok(!JSON.stringify(result).includes("never shown"));
    } finally {
        await context.close();
    }
    assert.throws(() => validateOptions({ sources: { s: { load: async () => [], fields: { A: { description: "x".repeat(501) } } } } }), /at most 500 characters/);
});

test("error codes: the new ones with their status; details a person can act on, with the running request's id", async () => {
    assert.equal(OPERATION_ERRORS.DATA_MISMATCH, 422);
    assert.equal(OPERATION_ERRORS.DATA_NOT_AVAILABLE, 404);
    assert.equal(OPERATION_ERRORS.SOURCE_UNAVAILABLE, 502);
    assert.equal(OPERATION_ERRORS.UPLOAD_FAILED, 502);
    assert.match(newRequestId(), /^[A-Za-z0-9_-]{11}$/);
    assert.equal(requestId(), null);
    const id = newRequestId();
    const error = await withRequestId(id, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new OperationError("SOURCE_UNAVAILABLE", "not available right now; try again later", errorDetails({ retryable: true, retryAfter: 30 }));
    });
    assert.equal(error.status, 502);
    assert.deepEqual(error.details, { requestId: id, retryable: true, retryAfter: 30 });
    // outside a request an id is made, so an error always has one
    assert.match(errorDetails({ retryable: false }).requestId, /^[A-Za-z0-9_-]{11}$/);
    assert.equal(new OperationError("INVALID_INPUT", "x").details, undefined);
    assert.deepEqual(new OperationError("SOURCE_UNAVAILABLE", "x", /** @type {any} */ ({ requestId: 5, retryable: "yes", retryAfter: -1, other: 1 })).details, {});
});

test("params: an operator's pattern is the whole value (anchored), and never lets .. or a control character through", () => {
    const declared = { id: { type: "string", pattern: "[a-z]+" }, path: { type: "string", pattern: "[a-z./]+" }, any: { type: "string", pattern: "^.*$" } };
    assert.equal(normalizeParams(declared, { id: "abc" }, null, "s").id, "abc");
    for (const [name, value] of [["id", "abc/admin?x=1"], ["id", "x abc"], ["path", "a/../b"], ["path", ".."], ["any", "a\nb"], ["any", "a\u0000b"], ["any", "..%2F"]]) {
        assert.throws(() => normalizeParams(declared, { [name]: value }, null, "s"), (e) => e.code === "INVALID_INPUT", `${name}=${JSON.stringify(value)}`);
    }
    // a pattern a nested quantifier makes slow is refused at start, as is a very long one
    assert.match(declaredProblems({ x: { type: "string", pattern: "(a+)+$" } }).join(), /repeats a group/);
    assert.match(declaredProblems({ x: { type: "string", pattern: "(\\w|\\d+)*" } }).join(), /repeats a group/);
    assert.match(declaredProblems({ x: { type: "string", pattern: "a".repeat(257) } }).join(), /at most 256 characters/);
    assert.deepEqual(declaredProblems({ x: { type: "string", pattern: "[a-z]{2,8}(-[a-z]{2})?" } }), []);
});

test("canonicalJson: keys sorted at every level, __proto__ a plain key", () => {
    assert.equal(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } }), '{"a":{"c":2,"d":[1,{"y":2,"z":1}]},"b":1}');
    assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
    assert.equal(canonicalJson(JSON.parse('{"__proto__":{"x":1},"a":1}')), '{"__proto__":{"x":1},"a":1}');
});

test("delivery: a source the automatic values rule may apply to counts as closed; a file: path never gets that rule", async () => {
    const dir = workspace({ "sales.csv": "Region,Sales\nNorth,1\n", "open.csv": "Region,Sales\nNorth,1\n" });
    const context = await contextOf({
        sources: { auto: { file: "data/sales.csv" }, open: { file: "data/open.csv", policy: { default: "show" } } },
        policy: { autoValues: true },
        files: { allowDirs: ["data"], policy: {} },
        baseDir: dir
    });
    try {
        const auto = await context.registry.resolve("auto", LOCAL);
        assert.ok(auto.policy.auto, "the rule applies to this source");
        assert.equal(auto.sourceClosed, true);
        assert.equal((await context.registry.resolve("open", LOCAL)).sourceClosed, false);
        const byPath = await context.registry.resolve("file:sales.csv", LOCAL);
        // the path is the operator's source: its policy, not files.policy
        assert.equal(byPath.spec.id, "auto");
        writeFileSync(join(dir, "data", "other.csv"), "Region,Sales\nNorth,1\n");
        const other = await context.registry.resolve("file:other.csv", LOCAL);
        assert.equal(other.spec.kind, "file");
        assert.equal(other.policy.auto, false, "file: paths never get the automatic rule");
    } finally {
        await context.close();
    }
});

test("params: a pattern may not repeat a group without a bound (slow on some values), nor escape its anchors", () => {
    for (const pattern of ["(a|a)*b", "(?:a|aa)+$", "(ab){2,}", "(x)+", "([a-z]|-)*", "(a|a){1,60}b", "((a|a){1,8}){1,8}b", "(?:a{1,40}){1,40}b", "(ab){1,3}", "(ab){2}"]) {
        assert.match(declaredProblems({ x: { type: "string", pattern } }).join(), /repeats a group/, pattern);
    }
    // a quantifier on a single atom or class, and an optional group, stay allowed
    for (const pattern of ["[a-z]+", "a*b", "\\d{2,}", "(-[a-z]{2})?", "(-[a-z]{2}){0,1}", "[(]+", "\\(+"]) {
        assert.deepEqual(declaredProblems({ x: { type: "string", pattern } }), [], pattern);
    }
    assert.match(declaredProblems({ x: { type: "string", pattern: "a)|(b" } }).join(), /not a valid regular expression/);
    assert.throws(() => validateOptions({ sources: { s: { load: async () => [], params: { x: { type: "string", pattern: "(?:a|aa)+$" } } } } }), /repeats a group/);
});

test("a code source with params keeps its data per client and groups too, not only per person", async () => {
    let loads = 0;
    const context = await contextOf({ sources: { t: { load: async (params) => (loads++, [{ Team: params.team }]), version: () => 1, params: { team: { type: "string" } } } } });
    const person = (client, groups) => {
        const caller = callerOf("oauth", { token: "jwt", clientId: client, scopes: ["pivotkit"], expiresAt: 0, extra: { subject: "ana", issuer: "https://issuer.example" } });
        return groups ? Object.assign(caller, { groups }) : caller;
    };
    try {
        const describe = (caller) => present(context, "describe_source", { source: "t", params: { team: "a" } }, caller);
        await describe(person("broad"));
        await describe(person("broad"));
        assert.equal(loads, 1);
        await describe(person("narrow"));
        assert.equal(loads, 2, "another client of the same person");
        await describe(person("broad", ["finance"]));
        assert.equal(loads, 3, "another set of groups");
        await describe(person("broad", ["finance"]));
        assert.equal(loads, 3);
    } finally {
        await context.close();
    }
});

/** Runs `fn` with matchMeans replaced, then puts the real one back. */
async function withMatchMeans(means, fn) {
    const real = { ...matchMeans };
    Object.assign(matchMeans, means);
    try {
        return await fn();
    } finally {
        Object.assign(matchMeans, real);
    }
}

test("params at start (#528, real vm): a pattern too slow for a request's limit is refused, so the start never takes a pattern requests refuse", () => {
    // about 250 ms on "1" x 63 + "!" even once V8 has compiled it: over MATCH_MS on every try
    const problems = declaredProblems({ x: { type: "string", pattern: "\\d*\\d*\\d*\\d*\\d*\\d*x", maxLength: 64 } });
    assert.match(problems.join(), /takes too long on some values \(over 75 ms, a request's limit\)/);
});

// The tests below replace matchMeans to simulate a busy host deterministically. They cover the retry
// and budget logic only; the real time limit is covered by the real-vm tests around them.

test("params on a busy host (#528): a fast pattern passes the start and a request when the first try of each value runs out of time", async () => {
    let tries = 0;
    await withMatchMeans({ run: (re, text) => (tries++ % 2 === 0 ? null : re.test(text)) }, () => {
        const declared = { team: { type: "string", pattern: "[a-z0-9-]{1,64}" } };
        assert.deepEqual(declaredProblems(declared), []);
        tries = 0;
        assert.deepEqual({ ...normalizeParams(declared, { team: "blue-7" }, null, "s") }, { team: "blue-7" });
    });
});

test("params on a busy host (#528): the start's check counts a value as fast when any of its three tries ends in time, and a pattern whose check runs past its budget as slow", async () => {
    const declared = { team: { type: "string", pattern: "[a-z0-9-]{1,64}" } };
    let tries = 0;
    await withMatchMeans({ run: (re, text) => (tries++ % 3 < 2 ? null : re.test(text)) }, () => assert.deepEqual(declaredProblems(declared), []));
    // a clock that moves 400 ms per match: the check of one pattern runs past its budget
    let clock = 0;
    await withMatchMeans({ run: (re, text) => ((clock += 400), re.test(text)), now: () => clock }, () => {
        assert.match(declaredProblems(declared).join(), /team: pattern could not be checked within 1000 ms at start, so it counts as slow/);
    });
});

test("params on a busy host (#528): a value that runs out of time twice is BUSY, 503 and retryable, over real HTTP; a claim's value too", async () => {
    const declared = { team: { type: "string", pattern: "[a-z0-9-]{1,64}" } };
    // the server starts on a quiet host; the busy one comes after
    const server = await restServer({ sources: { tickets: { load: async (params) => [{ Team: params.team, Open: 1 }], params: declared } }, auth: { mode: "token" } }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    await withMatchMeans({ run: () => null }, async () => {
        assert.throws(() => normalizeParams(declared, { team: "blue-7" }, null, "s"), (e) => e.code === "BUSY" && e.status === 503 && e.details?.retryable === true && e.message === "params could not be checked in time; the server may be busy, try again");
        const claimed = { team: { type: "string", pattern: "[a-z0-9-]{1,64}", claim: "team" } };
        assert.throws(() => normalizeParams(claimed, {}, { claims: { team: "blue-7" } }, "s"), (e) => e.code === "BUSY");
        try {
            const busy = await call(`${server.api}/sources/describe`, { token: TOKEN, body: { source: "tickets", params: { team: "blue-7" } } });
            assert.equal(busy.status, 503, JSON.stringify(busy.data));
            assert.equal(busy.data.code, "BUSY");
            assert.equal(busy.data.retryable, true);
            assert.equal(busy.headers.get("retry-after"), "1");
            assert.equal(busy.data.detail, "params could not be checked in time; the server may be busy, try again");
        } finally {
            await server.close();
        }
    });
});

test("params on a busy host (#528): the pattern checks of one request share a budget; when it runs out the request is BUSY", async () => {
    // each try takes what it was given (the clock moves by its limit); a try ends in time every second time
    let clock = 0;
    const limits = [];
    let tries = 0;
    await withMatchMeans({ run: (re, text, ms) => ((clock += ms), limits.push(ms), tries++ % 2 === 0 ? null : re.test(text)), now: () => clock }, () => {
        const declared = { a: { type: "string", pattern: "[a-z]+" }, b: { type: "string", pattern: "[a-z]+" } };
        assert.throws(() => normalizeParams(declared, { a: "x", b: "y" }, null, "s"), (e) => e.code === "BUSY" && e.message === "params could not be checked in time; the server may be busy, try again");
        // a: two tries of 75 ms use the 150 ms; b gets no try
        assert.deepEqual(limits, [75, 75]);
    });
});

test("params: an operator's pattern never runs unbounded: a slow one is refused at start, a slow match at run time", () => {
    // passes the syntax rules, but takes polynomial time on a long run of digits
    const slow = "\\d*\\d*\\d*\\d*\\d*\\d*x";
    assert.match(declaredProblems({ x: { type: "string", pattern: slow, maxLength: 256 } }).join(), /takes too long/);
    // the time limit really interrupts a running regular expression (here one the rules would refuse)
    for (const [pattern, text] of [["(a|a){1,60}b", `${"a".repeat(40)}!`], ["(?:a{1,40}){1,40}b", `${"a".repeat(40)}!`], [slow, `${"1".repeat(256)}!`]]) {
        const started = Date.now();
        assert.equal(matchWithin(new RegExp(`^(?:${pattern})$`, "u"), text), null, pattern);
        assert.ok(Date.now() - started < MATCH_MS * 10, `${pattern}: cut after ${Date.now() - started} ms`);
    }
    assert.equal(matchWithin(/^[a-z]+$/u, "abc"), true);
    assert.equal(matchWithin(/^[a-z]+$/u, "ab1"), false);
    // a declaration that skipped the check (a host's own code): the value is refused, in time, as BUSY
    // (#528: a match that runs out of time twice cannot tell a slow pattern from a busy server)
    const started = Date.now();
    assert.throws(() => normalizeParams({ x: { type: "string", pattern: "(a|a){1,60}b", maxLength: 64 } }, { x: `${"a".repeat(40)}!` }, null, "s"), (e) => e.code === "BUSY" && /could not be checked/.test(e.message));
    assert.ok(Date.now() - started < 1000);
});

test("a refused value: the parameter's words in one parenthesis at the end, its pattern after a semicolon", async () => {
    const { normalizeParams } = await import("../src/sources/params.js");
    assert.throws(() => normalizeParams({ team: { type: "string", enum: ["blue", "red"], description: "The team", example: "blue" } }, { team: "green" }, null, "t"), (e) => e.message === "params.team must be one of blue, red (The team, for example blue)");
    assert.throws(() => normalizeParams({ team: { type: "string", pattern: "^[a-z]+$" } }, { team: "Blue" }, null, "t"), (e) => e.message === "params.team is not in the expected form (pattern ^[a-z]+$)");
});
