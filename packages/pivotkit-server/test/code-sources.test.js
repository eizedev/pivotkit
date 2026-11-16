// Code sources of a library host: load(params, { caller, signal }), the time limit and its abort,
// coalescing, the load limits, kept data per caller or shared, last good data after a transient
// failure only, the run limits a file has, and a source's own errors (SourceError, anything else)
// as a caller gets them on REST and MCP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { join } from "node:path";
import { OperationError } from "pivotkit-report/operations";
import { CODE_DEFAULTS, ConfigError, SourceError, callerOf, checkConfig, createContext, present, serverTextOf, validateOptions } from "pivotkit-server";
import { LOAD_CACHE, createLoadCache, encodedBytes } from "../src/sources/cache.js";
import { LOAD_LIMITS, createLoadRunner, isTransient, loadRunner, ownError, sourceFailure } from "../src/sources/run.js";
import { createComputer } from "../src/compute.js";
import { packTable, packedBytes, unpackTable } from "../src/packed.js";
import { encode } from "pivotkit-core";
import { call, factsOf, restServer, workspace } from "./helpers.js";

const LOCAL = callerOf("none", undefined);
const VIEW = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };
const ROWS = [
    { Region: "North", Sales: 10, Secret: "x" },
    { Region: "South", Sales: 20, Secret: "y" }
];

/** A static token's caller: an identity of its own. */
const token = (name) => callerOf("token", { token: "", clientId: name, scopes: [], expiresAt: 0, extra: { allScopes: true } });
/** An OAuth caller without a usable subject: no identity. */
const nobody = () => callerOf("oauth", { token: "jwt", clientId: "bot", scopes: [], expiresAt: 0, extra: { subject: null, issuer: "https://issuer.example" } });

/** A context whose log lines are kept. */
async function contextOf(options) {
    const lines = [];
    const context = await createContext({ policy: { default: "show" }, ...options }, { stderr: { write: (t) => lines.push(...String(t).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) } });
    return Object.assign(context, { lines });
}

/** A promise with its resolve outside. */
function gate() {
    let open;
    const opened = new Promise((resolve) => (open = resolve));
    return { opened, open: (value) => open(value) };
}

const describe = (context, caller = LOCAL, params = undefined, source = "t") => present(context, "describe_source", { source, ...(params ? { params } : {}) }, caller);
const failure = (promise) => promise.then(
    () => assert.fail("expected an error"),
    (e) => e
);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("SourceError: one of four codes; transient from a backend's status; the defaults defined once", () => {
    assert.throws(() => new SourceError(/** @type {any} */ ("TIMEOUT")), TypeError);
    assert.throws(() => new SourceError(/** @type {any} */ ("BUSY")), /one of NOT_ALLOWED, INVALID_INPUT, DATA_NOT_AVAILABLE, SOURCE_UNAVAILABLE/);
    assert.equal(new SourceError("SOURCE_UNAVAILABLE", { status: 503 }).transient, true);
    assert.equal(new SourceError("SOURCE_UNAVAILABLE", { status: 500 }).transient, false);
    assert.equal(new SourceError("SOURCE_UNAVAILABLE", { status: 429, transient: false }).transient, false);
    assert.equal(new SourceError("NOT_ALLOWED").transient, false);
    assert.deepEqual(CODE_DEFAULTS, { timeMs: 30_000, ttl: null, maxStale: 3600, cacheShared: false });
    // network failures that may pass, also nested as fetch nests them; a plain error is none
    assert.equal(isTransient(Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("x"), { code: "ECONNRESET" }) })), true);
    assert.equal(isTransient(Object.assign(new Error("x"), { code: "UND_ERR_HEADERS_TIMEOUT" })), true);
    assert.equal(isTransient(new AggregateError([Object.assign(new Error("x"), { code: "ECONNREFUSED" })])), true);
    assert.equal(isTransient(new Error("refused")), false);
    assert.equal(isTransient(Object.assign(new Error("x"), { code: "EACCES" })), false);
    // a getter that throws is read as nothing, not as a failure of pivotkit
    const hostile = Object.defineProperty(new Error("x"), "code", {
        get() {
            throw new Error("boom");
        }
    });
    assert.equal(isTransient(hostile), false);
});

test("a source's errors as a caller gets them: a SourceError's code and cleaned publicMessage below 500, the fixed text otherwise", () => {
    const shown = sourceFailure(new SourceError("NOT_ALLOWED", { publicMessage: "You may not see‮ team blue's tickets.\u0007" }));
    assert.equal(shown.code, "NOT_ALLOWED");
    assert.equal(shown.message, "You may not see team blue's tickets.");
    assert.equal(sourceFailure(new SourceError("DATA_NOT_AVAILABLE", { publicMessage: "x".repeat(1000) })).message.length, 300);
    assert.equal(sourceFailure(new SourceError("INVALID_INPUT")).message, "the source did not accept these parameters");
    for (const thrown of [new OperationError("TIMEOUT", "db at 10.1.2.3 timed out"), new OperationError("BUSY", "db at 10.1.2.3"), new OperationError("NOT_ALLOWED", "db at 10.1.2.3"), new Error("db at 10.1.2.3"), "a string", null, new SourceError("SOURCE_UNAVAILABLE", { publicMessage: "db at 10.1.2.3" })]) {
        const answer = sourceFailure(thrown);
        assert.equal(answer.code, "SOURCE_UNAVAILABLE", String(thrown));
        assert.doesNotMatch(answer.message, /10\.1\.2\.3/);
        assert.equal(answer.details?.retryable, false);
        assert.match(String(answer.details?.requestId), /^[A-Za-z0-9_-]{11}$/);
    }
    assert.equal(sourceFailure(new SourceError("SOURCE_UNAVAILABLE", { transient: true })).details?.retryable, true);
});

test("hostile: a load that throws pivotkit's own codes with an address never shows its words, on REST and MCP", async () => {
    const dir = workspace();
    const server = await restServer(
        {
            sources: {
                s1: {
                    load: async () => {
                        throw new OperationError("TIMEOUT", "db at 10.1.2.3 timed out");
                    }
                },
                s2: {
                    load: async () => {
                        throw new OperationError("BUSY", "db at 10.1.2.3 is busy");
                    }
                },
                denied: {
                    load: async () => {
                        throw new SourceError("NOT_ALLOWED", { publicMessage: "You may not see this team's tickets." });
                    }
                }
            },
            baseDir: dir
        },
        { enable: ["rest", "mcp"] }
    );
    const client = new Client({ name: "hostile", version: "1.0.0" });
    try {
        for (const source of ["s1", "s2"]) {
            const rest = await call(`${server.api}/sources/describe`, { body: { source } });
            assert.equal(rest.status, 502, source);
            assert.equal(rest.data.code, "SOURCE_UNAVAILABLE");
            assert.equal(rest.data.detail, serverTextOf("SOURCE_UNAVAILABLE"));
            assert.doesNotMatch(JSON.stringify(rest.data), /10\.1\.2\.3|timed out|busy/);
        }
        await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
        for (const source of ["s1", "s2"]) {
            const tool = await client.callTool({ name: "describe_source", arguments: { source } });
            assert.ok(tool.isError);
            const text = String(/** @type {any} */ (tool.content)[0].text);
            assert.match(text, /^SOURCE_UNAVAILABLE: /);
            assert.doesNotMatch(text, /10\.1\.2\.3|timed out|busy/);
        }
        // a SourceError below 500: its publicMessage, on both
        const rest = await call(`${server.api}/sources/describe`, { body: { source: "denied" } });
        assert.deepEqual([rest.status, rest.data.code, rest.data.detail], [403, "NOT_ALLOWED", "You may not see this team's tickets."]);
        const tool = await client.callTool({ name: "describe_source", arguments: { source: "denied" } });
        assert.match(String(/** @type {any} */ (tool.content)[0].text), /^NOT_ALLOWED: You may not see this team's tickets\. \(request id [A-Za-z0-9_-]{11}\)$/);
        // the host's own words only in the log, and only with --log debug
        assert.ok(!JSON.stringify(server.log).includes("10.1.2.3"));
        assert.ok(server.log.some((l) => l.event === "error" && l.source === "s1" && l.error === "OperationError"));
    } finally {
        await client.close();
        await server.close();
    }
});

test("time limit: the signal is aborted at timeMs, the call answers SOURCE_UNAVAILABLE (retryable), and the load keeps its slot until it ends", async () => {
    const release = gate();
    let signal;
    const runner = createLoadRunner();
    const log = { warn() {}, error() {}, debug() {} };
    const how = { prepare: (raw) => raw, source: "s", label: "s", bucket: "b", owner: "o", timeMs: 50, ttl: null, maxStale: 0, version: null, sizeOf: () => 1, log };
    const error = await failure(
        runner.runLoad("k", (s) => {
            signal = s;
            return release.opened;
        }, how)
    );
    assert.equal(error.code, "SOURCE_UNAVAILABLE");
    assert.equal(error.details.retryable, true);
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason.name, "TimeoutError");
    assert.equal(runner.running("s"), 1, "a load that ignores the abort still holds its slot");
    release.open([{ A: 1 }]);
    await wait(10);
    assert.equal(runner.running("s"), 0);
});

test("time limit end to end: a load over timeMs is aborted; a late result is kept for the next call, unless a refusal came in between", async () => {
    let loads = 0;
    const answers = [];
    const context = await contextOf({
        sources: {
            t: {
                load: async (params, { signal }) => {
                    loads++;
                    const answer = answers.shift();
                    if (answer === "slow") {
                        // ignores the abort and answers late
                        await wait(150);
                        return [{ Region: `late ${loads}`, Sales: 1 }];
                    }
                    if (answer === "deny") {
                        throw new SourceError("NOT_ALLOWED");
                    }
                    assert.equal(signal.aborted, false);
                    return [{ Region: `fresh ${loads}`, Sales: 1 }];
                },
                timeMs: 50,
                ttl: 60
            }
        }
    });
    try {
        answers.push("slow");
        const late = await failure(describe(context));
        assert.equal(late.code, "SOURCE_UNAVAILABLE");
        assert.equal(late.details.retryable, true);
        assert.ok(context.lines.some((l) => l.event === "warning" && l.source === "t" && /took longer than 50 ms/.test(l.message)));
        await wait(200);
        // the late result is kept: the next call within ttl reuses it without loading
        const kept = await describe(context);
        assert.equal(loads, 1);
        assert.deepEqual(kept.result.fields.find((f) => f.name === "Region").items?.map((i) => i.value ?? i), ["late 1"]);

        // a load that succeeds after the time limit and before the late result: the late result does
        // not replace the newer data
        const newer = await contextOf({ sources: { t: { ...context.options.sources.t } } });
        try {
            answers.push("slow", "fresh");
            assert.equal((await failure(describe(newer))).code, "SOURCE_UNAVAILABLE");
            const fresh = await describe(newer);
            assert.deepEqual(fresh.result.fields.find((f) => f.name === "Region").items?.map((i) => i.value ?? i), ["fresh 3"]);
            await wait(200);
            const still = await describe(newer);
            assert.deepEqual(still.result.fields.find((f) => f.name === "Region").items?.map((i) => i.value ?? i), ["fresh 3"]);
        } finally {
            await newer.close();
        }

        // a refusal between the time limit and the late result: the late result is not kept
        const other = await contextOf({ sources: { t: { ...context.options.sources.t } } });
        try {
            answers.push("slow", "deny", "fresh");
            assert.equal((await failure(describe(other))).code, "SOURCE_UNAVAILABLE");
            assert.equal((await failure(describe(other))).code, "NOT_ALLOWED");
            await wait(200);
            const after = await describe(other);
            assert.deepEqual(after.result.fields.find((f) => f.name === "Region").items?.map((i) => i.value ?? i), ["fresh 6"]);
        } finally {
            await other.close();
        }
    } finally {
        await context.close();
    }
});

test("coalescing: parallel calls of one caller with the same values share one load; another person or other values load their own", async () => {
    const release = gate();
    let loads = 0;
    const context = await contextOf({ sources: { t: { load: async (params) => (loads++, await release.opened, [{ Region: params.team, Sales: 1 }]), params: { team: { type: "string" } } } } });
    try {
        const ana = token("ana");
        const calls = [describe(context, ana, { team: "a" }), describe(context, ana, { team: "a" }), describe(context, ana, { team: "a" }), describe(context, token("ben"), { team: "a" }), describe(context, ana, { team: "b" })];
        await wait(20);
        assert.equal(loads, 3);
        release.open();
        const results = await Promise.all(calls);
        assert.ok(results.every((r) => r.result.dataAsOf));
    } finally {
        await context.close();
    }
});

test("coalescing: callers without an identity share nothing, get nothing kept and no last good data", async () => {
    let loads = 0;
    let fail = false;
    const context = await contextOf({
        sources: {
            t: {
                load: async () => {
                    loads++;
                    if (fail) {
                        throw new SourceError("SOURCE_UNAVAILABLE", { transient: true });
                    }
                    await wait(20);
                    return ROWS;
                },
                ttl: 60
            }
        }
    });
    try {
        await Promise.all([describe(context, nobody()), describe(context, nobody())]);
        assert.equal(loads, 2);
        await describe(context, nobody());
        assert.equal(loads, 3, "nothing kept, even with ttl");
        fail = true;
        assert.equal((await failure(describe(context, nobody()))).code, "SOURCE_UNAVAILABLE");
    } finally {
        await context.close();
    }
});

test("load limits: at most 2 loads of one person and 4 of one source run at once; over that SOURCE_UNAVAILABLE, retryable", async () => {
    const release = gate();
    let loads = 0;
    const context = await contextOf({ sources: { t: { load: async (params) => (loads++, await release.opened, [{ Region: params.team, Sales: 1 }]), params: { team: { type: "string" } } } } });
    try {
        const ana = token("ana");
        const running = [describe(context, ana, { team: "a" }), describe(context, ana, { team: "b" })];
        await wait(10);
        const third = await failure(describe(context, ana, { team: "c" }));
        assert.deepEqual([third.code, third.details.retryable, third.details.retryAfter], ["SOURCE_UNAVAILABLE", true, 1]);
        // another person still gets a slot, until the source's four are taken
        running.push(describe(context, token("ben"), { team: "a" }), describe(context, token("ben"), { team: "b" }));
        await wait(10);
        assert.equal((await failure(describe(context, token("cleo"), { team: "a" }))).code, "SOURCE_UNAVAILABLE");
        assert.equal(loads, 4);
        assert.ok(context.lines.some((l) => l.event === "warning" && /too many loads running/.test(l.message)));
        release.open();
        await Promise.all(running);
        await describe(context, ana, { team: "c" });
        assert.equal(loads, 5, "free again once the loads ended");
        assert.deepEqual(LOAD_LIMITS, { perSource: 4, perIdentity: 2 });
    } finally {
        await context.close();
    }
});

test("last good data: after a transient failure the last good data stands in, with stale and the words; a refusal drops it", async () => {
    let outcome = "ok";
    let loads = 0;
    const context = await contextOf({
        output: undefined,
        sources: {
            t: {
                load: async () => {
                    loads++;
                    if (outcome === "transient") {
                        throw new SourceError("SOURCE_UNAVAILABLE", { status: 503 });
                    }
                    if (outcome === "network") {
                        throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
                    }
                    if (outcome === "refused") {
                        throw new Error("401 from the backend");
                    }
                    return { rows: ROWS, asOf: "2026-11-14T08:00:00Z" };
                }
            }
        }
    });
    try {
        const first = await describe(context);
        assert.equal(first.result.dataAsOf, "2026-11-14T08:00:00Z");
        assert.equal(first.result.stale, undefined);
        for (const kind of ["transient", "network"]) {
            outcome = kind;
            const stale = await describe(context);
            assert.equal(stale.result.dataAsOf, "2026-11-14T08:00:00Z", kind);
            assert.match(stale.result.stale?.since ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, kind);
        }
        const rendered = await present(context, "render_view", { source: "t", view: VIEW, format: "csv" }, LOCAL);
        assert.ok(rendered.result.stale);
        assert.match(rendered.result.message, /The data is from 2026-11-14 08:00 UTC: the source could not be refreshed\./);
        const warnings = context.lines.filter((l) => l.event === "warning" && l.source === "t" && /last good data from/.test(l.message));
        assert.equal(warnings.length, 3);
        assert.ok(!JSON.stringify(context.lines).includes("socket hang up"), "the source's words never in the log at info");
        // a failure that is not transient answers at once and drops the kept data: no stale after it
        outcome = "refused";
        const refused = await failure(describe(context));
        assert.deepEqual([refused.code, refused.details.retryable], ["SOURCE_UNAVAILABLE", false]);
        outcome = "transient";
        const after = await failure(describe(context));
        assert.deepEqual([after.code, after.details.retryable], ["SOURCE_UNAVAILABLE", true]);
        assert.equal(loads, 6, "every call loaded: nothing fresh without ttl or version");
    } finally {
        await context.close();
    }
});

test("last good data: a SourceError refusal drops it too; maxStale 0 turns it off; older than maxStale is not used", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    let outcome = "ok";
    const load = async () => {
        if (outcome === "transient") {
            throw new SourceError("SOURCE_UNAVAILABLE", { transient: true });
        }
        if (outcome === "denied") {
            throw new SourceError("NOT_ALLOWED", { publicMessage: "Access was withdrawn." });
        }
        return ROWS;
    };
    const context = await contextOf({ sources: { t: { load }, off: { load, maxStale: 0 }, short: { load, maxStale: 1 } } });
    try {
        for (const id of ["t", "off", "short"]) {
            outcome = "ok";
            await describe(context, LOCAL, undefined, id);
        }
        outcome = "denied";
        assert.equal((await failure(describe(context))).message, "Access was withdrawn.");
        outcome = "transient";
        assert.equal((await failure(describe(context))).code, "SOURCE_UNAVAILABLE", "the refusal dropped the last good data");
        assert.equal((await failure(describe(context, LOCAL, undefined, "off"))).code, "SOURCE_UNAVAILABLE");
        assert.ok((await describe(context, LOCAL, undefined, "short")).result.stale);
        t.mock.timers.tick(1100);
        assert.equal((await failure(describe(context, LOCAL, undefined, "short"))).code, "SOURCE_UNAVAILABLE", "older than maxStale");
    } finally {
        await context.close();
    }
});

test("kept data: version() decides as before, ttl reuses for its seconds, without both every call loads", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    let loads = 0;
    let version = 1;
    const load = async () => (loads++, ROWS);
    const context = await contextOf({ sources: { versioned: { load, version: () => version }, timed: { load, ttl: 1 }, plain: { load } } });
    try {
        await describe(context, LOCAL, undefined, "versioned");
        await describe(context, LOCAL, undefined, "versioned");
        assert.equal(loads, 1);
        version = 2;
        await describe(context, LOCAL, undefined, "versioned");
        assert.equal(loads, 2);
        await describe(context, LOCAL, undefined, "timed");
        await describe(context, LOCAL, undefined, "timed");
        assert.equal(loads, 3);
        t.mock.timers.tick(1100);
        await describe(context, LOCAL, undefined, "timed");
        assert.equal(loads, 4);
        await describe(context, LOCAL, undefined, "plain");
        await describe(context, LOCAL, undefined, "plain");
        assert.equal(loads, 6);
    } finally {
        await context.close();
    }
});

test("cacheShared: one load for everyone and caller null; each profile's hidden fields still dropped (both orders)", async () => {
    for (const order of [["plain", "narrow"], ["narrow", "plain"]]) {
        let loads = 0;
        const seen = [];
        const context = await contextOf({
            sources: { t: { load: async (params, how) => (loads++, seen.push(how.caller), ROWS), cacheShared: true, ttl: 60 } },
            policy: { default: "show", profiles: { narrow: { fields: { Secret: "hide" } } } }
        });
        try {
            const callers = { plain: token("ana"), narrow: Object.assign(token("ben"), { profile: "narrow" }) };
            const fields = {};
            for (const who of order) {
                fields[who] = (await describe(context, callers[who])).result.fields.map((f) => f.name);
            }
            assert.deepEqual(fields.plain, ["Region", "Sales", "Secret"], order.join());
            assert.deepEqual(fields.narrow, ["Region", "Sales"], order.join());
            assert.ok(seen.every((c) => c === null), "a shared source never sees a caller");
            // the same profile again: no load
            const before = loads;
            await describe(context, token("cleo"));
            assert.equal(loads, before);
        } finally {
            await context.close();
        }
    }
    assert.match((await checkConfig({ sources: { t: { load: async () => [], cacheShared: true, ttl: 120 } } }, { http: false })).text, /\n {2}t: load up to 30000 ms\n {4}reused for 120 s\n {4}shared by all callers/);
});

test("run limits: rows, columns and cells as for files; long texts cut on a copy; { rows, asOf } and columnar with asOf", async () => {
    const long = "x".repeat(50);
    const rows = [{ Region: long, Sales: 1 }];
    const context = await contextOf({
        limits: { rows: 3, columns: 3, importCells: 8, textLength: 10 },
        sources: {
            many: { load: async () => [{ A: 1 }, { A: 2 }, { A: 3 }, { A: 4 }] },
            wide: { load: async () => [{ A: 1, B: 2, C: 3, D: 4 }] },
            cells: { load: async () => ({ columns: ["A", "B", "C"], data: [[1, 2, 3], [1, 2, 3], [1, 2, 3]] }) },
            long: { load: async () => rows },
            columnar: { load: async () => ({ columns: ["Region"], data: [[long]], asOf: 1_763_193_600_000 }) }
        }
    });
    try {
        for (const [id, what] of [["many", /4 rows exceed the limit of 3 \(limits\.rows\)/], ["wide", /4 columns exceed the limit of 3 \(limits\.columns\)/], ["cells", /9 cells exceed the limit of 8 \(limits\.importCells\)/]]) {
            const error = await failure(describe(context, LOCAL, undefined, id));
            assert.equal(error.code, "LIMIT_EXCEEDED", id);
            assert.match(error.message, what);
        }
        const cut = await present(context, "render_view", { source: "long", view: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }, format: "csv" }, LOCAL);
        assert.match(cut.result.inline.text, /^Region[^\n]*\n"?x{10}"?,1/m);
        assert.equal(rows[0].Region, long, "the host's rows are not changed");
        const columnar = await describe(context, LOCAL, undefined, "columnar");
        assert.equal(columnar.result.dataAsOf, "2025-11-15T08:00:00Z");
    } finally {
        await context.close();
    }
});

test("options: cacheShared only for a code source; timeMs at most ten minutes; ttl and maxStale not negative; check-config prints each code source", async () => {
    assert.throws(() => validateOptions({ sources: { s: { file: "a.csv", cacheShared: true } } }), ConfigError);
    assert.throws(() => validateOptions({ sources: { s: { load: async () => [], timeMs: 600_001 } } }), /at most 600000/);
    assert.throws(() => validateOptions({ sources: { s: { load: async () => [], ttl: -1 } } }), /ttl: must be a whole number of 0 or more/);
    assert.throws(() => validateOptions({ sources: { s: { load: async () => [], maxStale: -1 } } }), /maxStale: must be a whole number of 0 or more/);
    assert.ok(validateOptions({ sources: { s: { load: async () => [], cacheShared: false, timeMs: 600_000, ttl: 0, maxStale: 0 } } }));
    const text = (await checkConfig({ sources: { a: { load: async () => [], version: () => 1, timeMs: 20_000, maxStale: 0 }, b: { load: async () => [] }, f: { file: "x.csv" } } }, { http: false })).text;
    assert.match(text, /^Code sources \(2\):$/m);
    assert.match(text, /^ {2}a: load up to 20000 ms\n {4}reused while version\(\) is the same\n {4}data per caller\n {4}last good data: off$/m);
    assert.match(text, /^ {2}b: load up to 30000 ms\n {4}loaded on every call\n {4}data per caller\n {4}last good data: up to 3600 s after a transient failure$/m);
    // among the changes of this version (data sent in the request is one on an MCP server too)
    assert.match(factsOf(text), /\nNew in this version: [^\n]*code sources with a time limit and data per caller/);
    // without MCP, where data sent in the request adds no note, a file source alone gives none
    assert.doesNotMatch((await checkConfig({ sources: { f: { file: "x.csv" } } }, { http: false, mcp: false })).text, /Code sources|New in this version/);
    // with MCP on (the default) a file source alone gets no code-source line or note either
    assert.doesNotMatch((await checkConfig({ sources: { f: { file: "x.csv" } } }, { http: false })).text, /Code sources/);
});

test("the load cache: least recently used out, at most 8 entries and a quarter of the bytes per owner, its own entries first; encoded data measured", () => {
    const cache = createLoadCache({ entries: 4, bytes: 100, perIdentity: 2 });
    cache.set("a1", 1, { identity: "a", bytes: 10 });
    cache.set("a2", 2, { identity: "a", bytes: 10 });
    cache.set("a3", 3, { identity: "a", bytes: 10 });
    assert.equal(cache.get("a1"), undefined, "a third entry of one owner pushes out its oldest");
    assert.equal(cache.get("a2"), 2);
    cache.set("b1", 4, { identity: "b", bytes: 10 });
    cache.set("c1", 5, { identity: "c", bytes: 10 });
    assert.equal(cache.size().entries, 4);
    cache.set("d1", 6, { identity: "d", bytes: 10 });
    assert.equal(cache.get("a3"), undefined, "the least recently used of all goes");
    // one owner over its share (25 of 100 bytes) pushes out its own entries, never the others'
    cache.set("e1", 7, { identity: "e", bytes: 20 });
    cache.set("e2", 8, { identity: "e", bytes: 20 });
    assert.equal(cache.get("e1"), undefined);
    assert.equal(cache.get("e2"), 8);
    for (const key of ["b1", "c1", "d1"]) {
        assert.notEqual(cache.get(key), undefined, key);
    }
    cache.set("huge", 9, { identity: "f", bytes: 26 });
    assert.equal(cache.get("huge"), undefined, "larger than an owner's share: not kept");
    assert.ok(cache.size().bytes <= 100);
    assert.deepEqual(LOAD_CACHE, { entries: 64, bytes: 268_435_456, perIdentity: 8 });
    const data = { columns: [{ codes: new Int32Array(4), values: new Float64Array(4), dict: ["ab", "c"] }] };
    assert.equal(encodedBytes(data), 16 + 32 + 16 + 4 + 16 + 2);
});

test("last good data over REST and MCP: stale in the result, and the message and summary line say it", async () => {
    let down = false;
    const dir = workspace();
    const server = await restServer(
        {
            sources: {
                t: {
                    load: async () => {
                        if (down) {
                            throw new SourceError("SOURCE_UNAVAILABLE", { status: 504 });
                        }
                        return { rows: ROWS, asOf: "2026-11-14T08:00:00Z" };
                    }
                }
            },
            policy: { default: "show" },
            rest: { inline: true },
            baseDir: dir
        },
        { enable: ["rest", "mcp"] }
    );
    const client = new Client({ name: "stale", version: "1.0.0" });
    try {
        assert.equal((await call(`${server.api}/sources/describe`, { body: { source: "t" } })).data.stale, undefined);
        down = true;
        const rest = await call(`${server.api}/views/render`, { body: { source: "t", view: VIEW, format: "csv" } });
        assert.equal(rest.status, 200, JSON.stringify(rest.data));
        assert.equal(rest.data.dataAsOf, "2026-11-14T08:00:00Z");
        assert.match(rest.data.stale.since, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        assert.match(rest.data.message, /the source could not be refreshed/);
        await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
        const tool = await client.callTool({ name: "render_view", arguments: { source: "t", view: VIEW, format: "csv" } });
        assert.ok(!tool.isError, JSON.stringify(tool.content));
        assert.ok(/** @type {any} */ (tool.structuredContent).stale);
        assert.match(String(/** @type {any} */ (tool.content)[0].text), /The data is from 2026-11-14 08:00 UTC: the source could not be refreshed\./);
        assert.ok(server.log.some((l) => l.event === "warning" && l.source === "t" && /SourceError SOURCE_UNAVAILABLE \(status 504\)/.test(l.message)));
    } finally {
        await client.close();
        await server.close();
    }
});

test("request ids: a shared load that fails gives each caller its own request id", async () => {
    const release = gate();
    // version() runs at once on every call, in the same step as the call joins the load: the second
    // call of it means both callers wait for the one load (a fixed wait raced a busy machine)
    const joined = gate();
    let versions = 0;
    const dir = workspace();
    const server = await restServer({
        sources: {
            t: {
                load: async () => {
                    await release.opened;
                    throw new Error("the backend is down");
                },
                version: () => {
                    if (++versions === 2) joined.open();
                    return "v1";
                }
            }
        },
        baseDir: dir
    });
    try {
        assert.equal(versions, 0, "the start does not call version()");
        const first = call(`${server.api}/sources/describe`, { body: { source: "t" } });
        const second = call(`${server.api}/sources/describe`, { body: { source: "t" } });
        await joined.opened;
        release.open();
        const answers = await Promise.all([first, second]);
        assert.deepEqual(answers.map((a) => a.status), [502, 502]);
        const ids = answers.map((a) => a.data.requestId);
        assert.notEqual(ids[0], ids[1]);
        for (const id of ids) {
            assert.ok(server.log.some((l) => l.event === "request" && l.requestId === id && l.status === 502), `${id}: ${JSON.stringify(server.log)}`);
        }
        assert.equal(server.log.filter((l) => l.event === "error" && l.source === "t").length, 1, "one load, one error line");
    } finally {
        await server.close();
    }
});

test("hostile: kept data never reaches another caller: not as last good data, not under a shared source's other profile, not within ttl", async () => {
    let down = false;
    const load = async (params, how) => {
        if (down) {
            throw new SourceError("SOURCE_UNAVAILABLE", { transient: true });
        }
        return [{ Region: `rows of ${how.caller?.client ?? "everyone"}`, Sales: 1, Secret: "only for the wide profile" }];
    };
    const context = await contextOf({
        sources: { t: { load, ttl: 60 }, shared: { load, cacheShared: true } },
        policy: { default: "show", profiles: { narrow: { fields: { Secret: "hide" } } } }
    });
    const regions = (r) => JSON.stringify(r.result.fields.find((f) => f.name === "Region"));
    try {
        // within ttl, each caller gets its own rows
        assert.match(regions(await describe(context, token("ana"))), /rows of ana/);
        const ben = await describe(context, token("ben"));
        assert.match(regions(ben), /rows of ben/);
        assert.doesNotMatch(JSON.stringify(ben.result), /rows of ana/);
        // a transient failure for a caller with nothing kept: an error, never another caller's rows
        down = true;
        const cleo = await failure(describe(context, token("cleo")));
        assert.equal(cleo.code, "SOURCE_UNAVAILABLE");
        // a shared source: the wide profile's data is no last good data for the narrow profile
        down = false;
        const wide = await describe(context, token("ana"), undefined, "shared");
        assert.ok(wide.result.fields.some((f) => f.name === "Secret"));
        down = true;
        const narrow = await failure(describe(context, Object.assign(token("ben"), { profile: "narrow" }), undefined, "shared"));
        assert.equal(narrow.code, "SOURCE_UNAVAILABLE");
        assert.doesNotMatch(JSON.stringify(narrow), /only for the wide profile/);
    } finally {
        await context.close();
    }
});

test("hostile: the host's code that throws while its rows are read, and a version() that returns a promise, answer SOURCE_UNAVAILABLE", async () => {
    const trap = {
        Region: "North",
        get Sales() {
            throw new OperationError("TIMEOUT", "db at 10.1.2.3 timed out");
        }
    };
    const context = await contextOf({ sources: { getter: { load: async () => [trap] }, promised: { load: async () => ROWS, version: async () => 1 } } });
    try {
        for (const id of ["getter", "promised"]) {
            const error = await failure(describe(context, LOCAL, undefined, id));
            assert.equal(error.code, "SOURCE_UNAVAILABLE", id);
            assert.equal(error.details.retryable, false);
            assert.doesNotMatch(error.message, /10\.1\.2\.3/);
        }
    } finally {
        await context.close();
    }
});

test("hostile: a host value that throws pivotkit's own error class while it is read never shows its text", async () => {
    const { PivotkitError } = await import("pivotkit-core");
    const boom = () => {
        throw new PivotkitError("LIMIT_EXCEEDED", "db at 10.1.2.3 is full");
    };
    const getter = Object.defineProperty({ Region: "North" }, "Sales", { get: boom, enumerable: true });
    const column = Object.defineProperty([], 0, { get: boom, enumerable: true });
    const json = { toJSON: boom };
    const context = await contextOf({
        sources: {
            getter: { load: async () => [getter] },
            columnar: { load: async () => ({ columns: ["Region"], data: [column] }) },
            json: { load: async () => [{ Region: json, Sales: 1 }] }
        }
    });
    try {
        for (const id of ["getter", "columnar"]) {
            const error = await failure(describe(context, LOCAL, undefined, id));
            assert.equal(error.code, "SOURCE_UNAVAILABLE", id);
            assert.doesNotMatch(error.message, /10\.1\.2\.3/, id);
        }
        // a value whose toJSON throws is written as encode writes it: empty
        const json = await present(context, "render_view", { source: "json", view: VIEW, format: "csv" }, LOCAL);
        assert.doesNotMatch(JSON.stringify(json), /10\.1\.2\.3/);
    } finally {
        await context.close();
    }
});

test("run limits: a value that is not text is cut after it is written as text; a row with too many keys fails before they are listed; rows are counted before any is read", async () => {
    const long = ["y".repeat(50)];
    let wideKeys = 0;
    const counted = Object.create(null);
    for (let i = 0; i < 50_000; i++) {
        counted[`k${i}`] = i;
    }
    const trap = { get Region() { wideKeys++; return "x"; } };
    const context = await contextOf({
        limits: { rows: 2, columns: 3, textLength: 10 },
        sources: {
            long: { load: async () => [{ Region: long, Sales: 1 }] },
            many: { load: async () => [{ ...counted }] },
            rows: { load: async () => [trap, trap, trap] }
        }
    });
    try {
        const cut = await present(context, "render_view", { source: "long", view: VIEW, format: "csv" }, LOCAL);
        // written as encode writes it, ["yyy..., then cut to 10 characters
        assert.match(cut.result.inline.text, /\[""y{8}"?,1/);
        assert.doesNotMatch(cut.result.inline.text, /y{9}/);
        const many = await failure(describe(context, LOCAL, undefined, "many"));
        assert.equal(many.code, "LIMIT_EXCEEDED");
        assert.match(many.message, /exceed the limit of 3 \(limits\.columns\)/);
        const rows = await failure(describe(context, LOCAL, undefined, "rows"));
        assert.match(rows.message, /3 rows exceed the limit of 2 \(limits\.rows\)/);
        assert.equal(wideKeys, 0, "no row was read");
    } finally {
        await context.close();
    }
});

/** A runner's options for a unit test, with a log that keeps its lines. */
function unitHow(extra = {}) {
    const lines = [];
    const log = { warn: (m) => lines.push(["warn", m]), error: (e) => lines.push(["error", String(e?.message ?? e)]), debug: (m) => lines.push(["debug", m]) };
    return { lines, how: { prepare: (raw) => raw, source: "s", label: "s", bucket: "b", owner: "o", timeMs: 1000, ttl: 0, maxStale: 3600, version: null, sizeOf: () => 1, log, ...extra } };
}

test("a version() whose promise rejects answers SOURCE_UNAVAILABLE and leaves no unhandled rejection", async () => {
    const context = await contextOf({ sources: { t: { load: async () => ROWS, version: () => Promise.reject(new Error("db at 10.1.2.3")) } } });
    let unhandled = 0;
    const count = () => unhandled++;
    process.on("unhandledRejection", count);
    try {
        const error = await failure(describe(context));
        assert.equal(error.code, "SOURCE_UNAVAILABLE");
        await wait(20);
        assert.equal(unhandled, 0);
    } finally {
        process.off("unhandledRejection", count);
        await context.close();
    }
    // a version that JSON cannot write is no version
    const runner = createLoadRunner();
    const { how } = unitHow({ version: () => () => 1, ttl: null });
    let loads = 0;
    await runner.runLoad("k", async () => ++loads, how);
    await runner.runLoad("k", async () => ++loads, how);
    assert.equal(loads, 2, "nothing fresh without a version");
});

test("a caller that goes away: a shared load runs on for the others; aborted only when every caller left, and that is no failure of the source", async () => {
    const runner = createLoadRunner();
    const { how } = unitHow();
    await runner.runLoad("k", async () => "first", how);
    let release = gate();
    let seen;
    const gated = (signal) => {
        seen = signal;
        const mine = release;
        return new Promise((resolve, reject) => {
            mine.opened.then(resolve);
            signal.addEventListener("abort", () => reject(signal.reason));
        });
    };
    const a = new AbortController();
    const b = new AbortController();
    const first = runner.runLoad("k", gated, { ...how, signal: a.signal });
    const second = runner.runLoad("k", gated, { ...how, signal: b.signal });
    a.abort();
    await assert.rejects(first);
    assert.equal(seen.aborted, false, "the other caller still waits");
    release.open("second");
    assert.equal((await second).value, "second");
    // the only caller leaves: the load is aborted, nothing is refused or dropped
    release = gate();
    const c = new AbortController();
    const alone = runner.runLoad("k", gated, { ...how, signal: c.signal });
    await wait(5);
    c.abort();
    await assert.rejects(alone);
    assert.equal(seen.aborted, true);
    const stale = await runner.runLoad("k", async () => {
        throw new SourceError("SOURCE_UNAVAILABLE", { transient: true });
    }, how);
    assert.equal(stale.value, "second", "the last good data is still there");
    assert.ok(stale.stale);
    // a caller that is gone before it asks
    const gone = new AbortController();
    gone.abort();
    await assert.rejects(runner.runLoad("other", async () => 1, { ...how, signal: gone.signal }));
});

test("a refusal is never transient: no last good data after NOT_ALLOWED, whatever transient or status say", async () => {
    assert.equal(new SourceError("NOT_ALLOWED", { transient: true }).transient, false);
    assert.equal(new SourceError("DATA_NOT_AVAILABLE", { status: 503 }).transient, false);
    assert.equal(isTransient(new SourceError("INVALID_INPUT", { transient: true })), false);
    const runner = createLoadRunner();
    const { how } = unitHow();
    await runner.runLoad("k", async () => "good", how);
    const refused = await failure(runner.runLoad("k", async () => {
        throw new SourceError("NOT_ALLOWED", { transient: true, status: 503 });
    }, how));
    assert.equal(refused.code, "NOT_ALLOWED");
    assert.equal((await failure(runner.runLoad("k", async () => {
        throw new SourceError("SOURCE_UNAVAILABLE", { transient: true });
    }, how))).code, "SOURCE_UNAVAILABLE", "the refusal dropped the last good data");
});

test("SourceError: retryAfter passed on for a transient SOURCE_UNAVAILABLE, checked as OperationError checks it; a publicMessage is never cut inside a character", () => {
    assert.equal(sourceFailure(new SourceError("SOURCE_UNAVAILABLE", { transient: true, retryAfter: 30 })).details?.retryAfter, 30);
    assert.equal(new SourceError("SOURCE_UNAVAILABLE", { retryAfter: -1 }).retryAfter, undefined);
    assert.equal(new SourceError("SOURCE_UNAVAILABLE", { retryAfter: 1.5 }).retryAfter, undefined);
    const text = sourceFailure(new SourceError("NOT_ALLOWED", { publicMessage: `${"x".repeat(299)}\u{1F600}` })).message;
    assert.equal(text, "x".repeat(299));
});

test("a load still holding its slot after twice its time limit is logged; the slot stays until it ends", async () => {
    const runner = createLoadRunner();
    const { how, lines } = unitHow({ timeMs: 20 });
    const release = gate();
    await failure(runner.runLoad("k", () => release.opened, how));
    await wait(60);
    assert.ok(lines.some(([level, m]) => level === "warn" && /still holds a load slot 40 ms after it started/.test(m)), JSON.stringify(lines));
    assert.equal(runner.running("s"), 1);
    release.open(1);
    await wait(5);
    assert.equal(runner.running("s"), 0);
});

test("the time limit's timer ends with the load: a load that answered in time is never aborted later", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const runner = createLoadRunner();
    const { how } = unitHow({ timeMs: 1000 });
    let seen;
    await runner.runLoad("k", async (signal) => ((seen = signal), "fast"), how);
    t.mock.timers.tick(5000);
    assert.equal(seen.aborted, false);
});

test("kept data counts from when its load ended: ttl and stale's since", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 14, 8, 0, 0) });
    const runner = createLoadRunner();
    const { how } = unitHow({ ttl: 10 });
    const release = gate();
    const loading = runner.runLoad("k", () => release.opened, how);
    t.mock.timers.tick(8000);
    release.open("v");
    await loading;
    t.mock.timers.tick(5000);
    let loads = 0;
    await runner.runLoad("k", async () => (loads++, "w"), how);
    assert.equal(loads, 0, "5 s after the load ended: within ttl");
    t.mock.timers.tick(6000);
    const stale = await runner.runLoad("k", async () => {
        throw new SourceError("SOURCE_UNAVAILABLE", { transient: true });
    }, how);
    assert.equal(stale.stale?.since, "2026-11-14T08:00:08Z");
});

test("checkConfig(options) refuses what createContext refuses, and needs no second argument", async () => {
    const load = async () => [];
    for (const [source, why] of [
        [{ load, timeMs: 700_000 }, /timeMs: at most 600000/],
        [{ load, ttl: -1 }, /ttl/],
        [{ load, ttl: "5s" }, /ttl/],
        [{ load, cacheShared: "yes" }, /cacheShared/],
        [{ load, file: "a.csv" }, /file or load/]
    ]) {
        await assert.rejects(checkConfig({ sources: { s: /** @type {any} */ (source) } }), (e) => e instanceof ConfigError && why.test(e.message), String(why));
        await assert.rejects(createContext({ sources: { s: /** @type {any} */ (source) } }), ConfigError);
    }
    const { text, problems } = await checkConfig({ sources: { s: { load } } });
    assert.equal(problems, 0);
    assert.match(text, /^pivotkit-mcp: the configuration is valid\./);
    assert.match((await checkConfig({ sources: { s: { load } } }, { name: "my-app" })).text, /^my-app: the configuration is valid\./);
});

test("a caller that leaves a shared load as its only caller: the next caller starts a fresh load, not the aborted one", async () => {
    const runner = createLoadRunner();
    const { how } = unitHow();
    const signals = [];
    let release = gate();
    const load = (signal) => {
        signals.push(signal);
        const mine = release;
        return new Promise((resolve, reject) => {
            mine.opened.then(resolve);
            signal.addEventListener("abort", () => reject(signal.reason));
        });
    };
    const a = new AbortController();
    const first = runner.runLoad("k", load, { ...how, signal: a.signal });
    a.abort();
    await assert.rejects(first);
    release = gate();
    const second = runner.runLoad("k", load, how);
    release.open("fresh");
    assert.equal((await second).value, "fresh");
    assert.equal(signals.length, 2, "a load of its own");
    assert.equal(signals[0].aborted, true);
    assert.equal(signals[1].aborted, false);
});

test("a call whose signal is already aborted never starts a load", async () => {
    const runner = createLoadRunner();
    const { how } = unitHow();
    const gone = new AbortController();
    gone.abort();
    let loads = 0;
    await assert.rejects(runner.runLoad("k", async () => ++loads, { ...how, signal: gone.signal }));
    await assert.rejects(runner.runLoad(null, async () => ++loads, { ...how, signal: gone.signal }));
    assert.equal(loads, 0);
    assert.equal(runner.running("s"), 0);
});

test("the load cache's bound on all bytes: with many owners each within its share, the least recently used go, and the bytes are counted down", () => {
    const cache = createLoadCache({ entries: 64, bytes: 100, perIdentity: 8 });
    for (const owner of ["a", "b", "c", "d", "e"]) {
        cache.set(owner, owner, { identity: owner, bytes: 20 });
    }
    assert.deepEqual(cache.size(), { entries: 5, bytes: 100 });
    cache.get("a");
    cache.set("f", "f", { identity: "f", bytes: 20 });
    assert.equal(cache.get("b"), undefined, "the least recently used of all went");
    assert.equal(cache.get("a"), "a");
    assert.deepEqual(cache.size(), { entries: 5, bytes: 100 });
    cache.set("f", "f2", { identity: "f", bytes: 10 });
    assert.deepEqual(cache.size(), { entries: 5, bytes: 90 }, "a replaced entry counts once");
    cache.delete("c");
    assert.deepEqual(cache.size(), { entries: 4, bytes: 70 });
});

test("the warning about a hung load is not given for a slow load that ended in the meantime", async () => {
    const runner = createLoadRunner();
    const { how, lines } = unitHow({ timeMs: 20 });
    await failure(runner.runLoad("k", () => new Promise((resolve) => setTimeout(() => resolve(1), 30)), how));
    await wait(80);
    assert.ok(!lines.some(([, m]) => /still holds a load slot/.test(m)), JSON.stringify(lines));
    assert.equal(runner.running("s"), 0);
});

/** A code source's large table: `n` rows of four columns, as columnar data (cheap to build). */
const largeTable = (n) => ({
    columns: ["Region", "Team", "Sales", "Note"],
    data: [Array.from({ length: n }, (_, i) => ["North", "South", "East", "West"][i % 4]), Array.from({ length: n }, (_, i) => `team-${i % 97}`), Array.from({ length: n }, (_, i) => (i * 7919) % 10_000), Array.from({ length: n }, (_, i) => `note ${i}`)]
});

test("where it runs: a code source's operation is computed in a worker, bounded by compute.timeMs; its load is kept for the next call", async () => {
    let loads = 0;
    const table = largeTable(400_000);
    const context = await contextOf({ compute: { workers: 1, timeMs: 20 }, sources: { t: { load: async () => (loads++, table), ttl: 60 } } });
    try {
        // a timer of this thread runs while the worker computes
        let ticks = 0;
        const timer = setInterval(() => ticks++, 1);
        const started = Date.now();
        const error = await describe(context).then(
            () => null,
            (e) => e
        );
        clearInterval(timer);
        assert.ok(error, "the call answers TIMEOUT, not a result");
        assert.equal(error.code, "TIMEOUT", "the computation over a code source's data is bounded by compute.timeMs");
        assert.match(error.message, /compute\.timeMs/);
        assert.ok(ticks > 0, `the thread was not blocked (${ticks} ticks in ${Date.now() - started} ms)`);
        assert.equal(loads, 1);
        // the load is kept (ttl): the next call computes again, but does not load again
        assert.equal((await failure(describe(context))).code, "TIMEOUT");
        assert.equal(loads, 1);
    } finally {
        await context.close();
    }
});

test("where it runs: the same result, hidden fields and dataAsOf as before; rows whose keys differ in case are one column", async (t) => {
    const loadedAt = Date.UTC(2025, 10, 15, 8, 0, 0);
    // the worker's clock is not this thread's: the time a load ended comes from here
    t.mock.timers.enable({ apis: ["Date"], now: loadedAt });
    const rows = [
        { Region: "North", Sales: 10, Secret: "x" },
        { region: "South", Sales: 20, secret: "y" },
        { Sales: 5 }
    ];
    const context = await contextOf({ sources: { t: { load: async () => rows, ttl: 60, policy: { fields: { Secret: "hide" } } } } });
    try {
        const described = await describe(context);
        assert.deepEqual(described.result.fields.map((f) => f.name), ["Region", "Sales"]);
        assert.equal(described.result.hiddenFields, 1, "a field dropped before the worker still counts as hidden");
        assert.equal(described.result.dataAsOf, "2025-11-15T08:00:00Z");
        const rendered = await present(context, "render_view", { source: "t", view: VIEW, format: "csv" }, LOCAL);
        assert.match(rendered.result.inline.text, /North,10/);
        assert.match(rendered.result.inline.text, /South,20/);
        assert.equal(rendered.result.dataAsOf, "2025-11-15T08:00:00Z", "kept data keeps the time it was loaded");
    } finally {
        await context.close();
    }
});

/** A code source's table of repeated long texts: three columns of 50 categories each, and a number. */
const repeatedTexts = (n, length) => {
    const values = Array.from({ length: 50 }, (_, i) => `category-${i}-`.padEnd(length, "x"));
    return { columns: ["A", "B", "C", "Sales"], data: [0, 1, 2].map((c) => Array.from({ length: n }, (_, i) => values[(i * (c + 3)) % 50])).concat([Array.from({ length: n }, (_, i) => i % 1000)]) };
};

test("where it runs: a kept load goes to a worker once; warm calls send its key only, to the worker that kept it", async () => {
    let loads = 0;
    const table = repeatedTexts(100_000, 400);
    const context = await contextOf({ compute: { workers: 2 }, sources: { t: { load: async () => (loads++, table), ttl: 60 } } });
    try {
        const counts = [];
        for (let i = 0; i < 4; i++) {
            const described = await describe(context);
            assert.equal(described.result.rows, 100_000);
            counts.push(described.result.fields.map((f) => f.name).join());
        }
        assert.deepEqual(new Set(counts), new Set(["A,B,C,Sales"]));
        assert.equal(loads, 1);
        assert.deepEqual(context.computer.sent(), { tables: 1, cached: 3 }, "warm calls do not send the table again");
    } finally {
        await context.close();
    }
});

test("where it runs: a worker that pushed a kept table out asks for it, and gets it once", async () => {
    const dir = workspace(Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`f${i}.csv`, `Region,Sales\nNorth,${i}\n`])));
    const computer = createComputer({ workers: 1 });
    const levels = { default: "show", fields: {}, counts: true, rows: true };
    const spec = { id: "t", kind: "source", name: "T", levels, limits: {}, schedulable: true };
    const job = { spec, table: packTable({ columns: ["Region"], data: [["North", "South", "North"]] }, 3, 0), tableKey: "key-a", asOf: "2026-11-15T08:00:00Z" };
    try {
        assert.equal((await computer.run("describe_source", { source: "t" }, job)).outcome.result.rows, 3);
        // four file sources fill the worker's four places; the table's key is still noted for it
        for (let i = 0; i < 4; i++) {
            const file = { ...spec, kind: "file", path: join(dir, "data", `f${i}.csv`), allow: [join(dir, "data")], hardLinks: true };
            await computer.run("describe_source", { source: "t" }, { spec: file });
        }
        const again = await computer.run("describe_source", { source: "t" }, job);
        assert.equal(again.outcome.result.rows, 3);
        assert.equal(again.asOf, "2026-11-15T08:00:00Z");
        assert.deepEqual(computer.sent(), { tables: 2, cached: 1 }, "sent without the table, asked for, sent with it");
        await computer.run("describe_source", { source: "t" }, job);
        assert.deepEqual(computer.sent(), { tables: 2, cached: 2 });
    } finally {
        await computer.close();
    }
});

test("where it runs: a new load is a new table for the workers (version and ttl 0), never the one kept before", async () => {
    let n = 0;
    const view = { rows: ["A"], values: [{ field: "A", agg: "count" }] };
    const context = await contextOf({ compute: { workers: 1 }, sources: { versioned: { load: async () => [{ A: `load-${++n}` }], version: () => n }, plain: { load: async () => [{ A: `load-${++n}` }], ttl: 0 } } });
    try {
        for (const source of ["versioned", "plain"]) {
            const first = await present(context, "render_view", { source, view, format: "csv" }, LOCAL);
            const second = await present(context, "render_view", { source, view, format: "csv" }, LOCAL);
            assert.notEqual(first.result.inline.text, second.result.inline.text, source);
            assert.match(second.result.inline.text, new RegExp(`load-${n}`), source);
        }
    } finally {
        await context.close();
    }
});

test("where it runs: a row's later spelling of a key wins; rows without a shown field keep their count", async () => {
    const context = await contextOf({
        sources: {
            t: { load: async () => [{ Team: "a", team: "b" }] },
            hidden: { load: async () => [{ S: 1 }, { S: 2 }, { S: 3 }], policy: { fields: { S: "hide" } } },
            empty: { load: async () => [{}, {}, {}] }
        }
    });
    try {
        const rendered = await present(context, "render_view", { source: "t", view: { rows: ["Team"], values: [{ field: "Team", agg: "count" }] }, format: "csv" }, LOCAL);
        assert.match(rendered.result.inline.text, /^b,1$/m);
        assert.doesNotMatch(rendered.result.inline.text, /^a,/m);
        for (const id of ["hidden", "empty"]) {
            const described = await describe(context, LOCAL, undefined, id);
            assert.equal(described.result.rows, 3, id);
            assert.equal(described.result.fields.length, 0, id);
        }
        assert.equal((await describe(context, LOCAL, undefined, "hidden")).result.hiddenFields, 1);
    } finally {
        await context.close();
    }
});

test("packed tables: each kind of column back as it was; their size counted exactly", () => {
    const day = new Date(Date.UTC(2026, 10, 15));
    const big = 2n ** 70n;
    const table = {
        columns: ["Text", "Number", "Date", "Flag", "Mixed"],
        types: [undefined, "number", undefined, undefined, undefined],
        data: [
            ["North", null, "North", "", undefined],
            [1.5, null, Number.NaN, -0, 7],
            [day, null, new Date(Number.NaN), day, day],
            [true, false, null, true, false],
            ["x", 1, day, big, null]
        ]
    };
    const packed = packTable(table, 5, 2);
    assert.deepEqual(packed.columns.map((c) => c.kind), ["text", "number", "date", "boolean", "any"]);
    assert.equal(packed.dropped, 2);
    const back = /** @type {any} */ (unpackTable(packed));
    assert.deepEqual(back.columns, table.columns);
    assert.deepEqual(back.types, table.types);
    assert.deepEqual(back.data[0], ["North", null, "North", "", null], "a blank text is null, as encode reads both");
    assert.deepEqual(back.data[1], [1.5, null, Number.NaN, -0, 7]);
    assert.deepEqual(back.data[2].map((d) => (d === null ? null : d.getTime())), [day.getTime(), null, Number.NaN, day.getTime(), day.getTime()]);
    assert.deepEqual(back.data[3], [true, false, null, true, false]);
    assert.equal(back.data[4], table.data[4], "a mixed column goes as it is");
    assert.ok(packed.columns[0].codes.buffer instanceof SharedArrayBuffer);
    assert.ok(packed.columns[0].text.buffer instanceof SharedArrayBuffer, "the dictionary's bytes are shared too");
    // header 64; names; text: codes 5 x 1 (two entries fit a byte), "North" and "" as 5 UTF-8 bytes and
    // two ends of 4; number (1.5 and -0 are no whole numbers) and date: 5 x 8 and a blank byte each;
    // flags 5; mixed: 5 x 8, "x", a Date and a BigInt
    const names = table.columns.reduce((n, c) => n + 16 + 2 * c.length, 0);
    const expected = 64 + names + (5 + 5 + 8) + (40 + 5) + (40 + 5) + 5 + (40 + 18 + 24 + 24);
    assert.equal(packedBytes(packed), expected);
    // the same text in two strings is one entry; without columns the rows stay counted
    const two = packTable({ columns: ["T"], data: [["ab", ["a", "b"].join("")]] }, 2, 0);
    assert.deepEqual([/** @type {any} */ (two.columns[0]).ends.length, [.../** @type {any} */ (two.columns[0]).codes]], [1, [1, 1]]);
    assert.deepEqual(unpackTable(packTable({ columns: [], data: [] }, 3, 1)), [{}, {}, {}]);
});

/** A packed table of `n` rows: a text of three values and a number, about 15 bytes a row once encoded. */
const smallKinds = (n) => packTable({ columns: ["A", "B"], data: [Array.from({ length: n }, (_, i) => ["x", "y", "z"][i % 3]), Array.from({ length: n }, (_, i) => i % 7)] }, n, 0);
const JOB_SPEC = { id: "t", kind: "source", name: "T", levels: { default: "show", fields: {}, counts: true, rows: true }, limits: { rows: 5_000_000, importCells: 100_000_000 }, schedulable: true };

test("the pool: a worker that asks again for a table it was just sent is a fault, not a loop", async () => {
    const computer = createComputer({ workers: 1, timeMs: 5000 }, { worker: new URL("./fixtures/need-worker.js", import.meta.url) });
    try {
        const error = await computer.run("describe_source", { source: "t" }, { spec: JOB_SPEC, table: smallKinds(3), tableKey: "k", asOf: null }).then(
            () => null,
            (e) => e
        );
        assert.equal(error?.code, "INTERNAL");
        assert.deepEqual(computer.sent(), { tables: 2, cached: 0 }, "the table once more, then no more");
    } finally {
        await computer.close();
    }
});

test("the pool: a worker keeps at most a quarter of compute.memoryMb of data sets", async () => {
    const MIB = 1_048_576;
    for (const memoryMb of [64, 256]) {
        const computer = createComputer({ workers: 2, memoryMb });
        try {
            assert.deepEqual(await computer.bounds(), [(memoryMb * MIB) / 4, (memoryMb * MIB) / 4], `${memoryMb} MB`);
        } finally {
            await computer.close();
        }
    }
});

test("the pool: a table over the worker's bound goes with every call; a second one pushes the first out by its bytes", async () => {
    // the bound comes from the test seam, relative to the table's own encoded size, so the worker's
    // memory (and a coverage run's overhead on it) is the default's, far above what a run needs
    const n = 50_000;
    const table = smallKinds(n);
    const size = encodedBytes(encode(/** @type {any} */ (unpackTable(table)), { timeZone: "UTC", limits: JOB_SPEC.limits }));
    const job = (key) => ({ spec: JOB_SPEC, table, tableKey: key, asOf: null });
    const describeJob = (computer, key) => computer.run("describe_source", { source: "t" }, job(key)).then((r) => r.outcome.result.rows);
    const below = createComputer({ workers: 1 }, { cacheBytes: Math.floor(size * 0.9) });
    try {
        assert.deepEqual(await below.bounds(), [Math.floor(size * 0.9)]);
        for (let i = 0; i < 3; i++) {
            assert.equal(await describeJob(below, "a"), n);
        }
        assert.deepEqual(below.sent(), { tables: 3, cached: 0 }, "never kept, never sent without its table");
    } finally {
        await below.close();
    }
    // room for one such table, not two
    const one = createComputer({ workers: 1 }, { cacheBytes: Math.floor(size * 1.5) });
    try {
        await describeJob(one, "a");
        await describeJob(one, "a");
        assert.deepEqual(one.sent(), { tables: 1, cached: 1 });
        // a second table pushes the first out by its bytes (two entries of four)
        await describeJob(one, "b");
        assert.equal(await describeJob(one, "a"), n);
        assert.deepEqual(one.sent(), { tables: 3, cached: 2 }, "a went without its table, was asked for and sent");
    } finally {
        await one.close();
    }
});

test("the pool: a table job goes to the worker that kept its data while that one is free", async () => {
    const computer = createComputer({ workers: 2 });
    const run = (key) => computer.run("describe_source", { source: "t" }, { spec: JOB_SPEC, table: smallKinds(10), tableKey: key, asOf: null });
    try {
        // at once: a goes to the first worker, b to the second
        await Promise.all([run("a"), run("b")]);
        await run("b");
        assert.deepEqual(computer.sent(), { tables: 2, cached: 1 }, "b went to the second worker, without its table");
    } finally {
        await computer.close();
    }
});

test("where it runs: a table key only for a load that is kept and reused", async () => {
    const loads = { plain: 0, nullVersion: 0, timed: 0, large: 0 };
    const sources = {
        plain: { load: async () => (loads.plain++, ROWS) },
        nullVersion: { load: async () => (loads.nullVersion++, ROWS), version: () => null },
        timed: { load: async () => (loads.timed++, ROWS), ttl: 60 },
        // over the owner's share of 1 MiB: 256 KiB; 100,000 numbers take 800 KB packed
        large: { load: async () => (loads.large++, { columns: ["N"], data: [Array.from({ length: 100_000 }, (_, i) => i + 0.5)] }), ttl: 60 }
    };
    const context = await contextOf({ compute: { workers: 1 }, sourceCache: { maxMb: 1 }, sources });
    try {
        const sentFor = async (id) => {
            const before = context.computer.sent();
            await describe(context, LOCAL, undefined, id);
            await describe(context, LOCAL, undefined, id);
            const after = context.computer.sent();
            return { tables: after.tables - before.tables, cached: after.cached - before.cached };
        };
        assert.deepEqual(await sentFor("plain"), { tables: 0, cached: 0 }, "no ttl and no version: no key");
        assert.deepEqual(await sentFor("nullVersion"), { tables: 0, cached: 0 }, "a version of null is no version");
        assert.deepEqual(await sentFor("timed"), { tables: 1, cached: 1 });
        assert.deepEqual(await sentFor("large"), { tables: 0, cached: 0 }, "over the owner's share: not kept, no key");
        assert.deepEqual(loads, { plain: 2, nullVersion: 2, timed: 1, large: 2 });
    } finally {
        await context.close();
    }
    assert.throws(() => validateOptions({ sourceCache: { maxMb: 0 } }), /sourceCache\.maxMb: from 1 to 65536/);
    assert.ok(validateOptions({ sourceCache: { maxMb: 1024 } }));
    assert.match(factsOf((await checkConfig({ sources: { a: { load: async () => [] } }, sourceCache: { maxMb: 1024 } }, { http: false })).text), /\nKept loads: at most 1024 MiB \(sourceCache\.maxMb\)\n {2}the data code and HTTP sources loaded, kept for their next calls\n {2}a table over 256 MiB \(a quarter\) is not kept and loads on every call\n {2}with several contexts in one process, the largest setting applies\n/);
    assert.match(factsOf((await checkConfig({ sources: { a: { load: async () => [] } } }, { http: false })).text), /\nKept loads: at most 256 MiB \(sourceCache\.maxMb\)\n {2}the data code and HTTP sources loaded, kept for their next calls\n {2}a table over 64 MiB \(a quarter\)/);
});

test("the load cache: the largest sourceCache.maxMb of the open contexts applies; a close shrinks it to the largest left", async () => {
    const MIB = 1_048_576;
    assert.equal(loadRunner.cacheBytes(), LOAD_CACHE.bytes, "no context open: the default");
    // a table of about 800 KB, kept per owner up to a quarter of the cache
    const table = { columns: ["N"], data: [Array.from({ length: 100_000 }, (_, i) => i + 0.5)] };
    let loads = 0;
    const source = { load: async () => (loads++, table), ttl: 60 };
    const larger = await contextOf({ sourceCache: { maxMb: 8 }, sources: { t: source } });
    const smaller = await contextOf({ sourceCache: { maxMb: 1 }, sources: { t: source } });
    try {
        assert.equal(loadRunner.cacheBytes(), 8 * MIB, "the smaller context does not shrink the larger one's cache");
        const [ana, ben] = [token("ana"), token("ben")];
        await describe(smaller, ana);
        await describe(smaller, ben);
        await describe(smaller, ana);
        await describe(smaller, ben);
        assert.equal(loads, 2, "both kept: within 2 MiB each, a quarter of the larger setting");
        await larger.close();
        assert.equal(loadRunner.cacheBytes(), 1 * MIB, "the largest left");
        // trimmed to 1 MiB: ana's load, the least recently used, went; ben's still fits
        await describe(smaller, ben);
        assert.equal(loads, 2);
        await describe(smaller, ana);
        await describe(smaller, ana);
        assert.equal(loads, 4, "over the 256 KiB share now: loaded on every call");
    } finally {
        await larger.close();
        await smaller.close();
    }
    assert.equal(loadRunner.cacheBytes(), LOAD_CACHE.bytes, "every context closed: the default again");
});

test("an async prepare (an HTTP source's CSV answer read in a worker): callers share it, its own errors pass, any other is the source's failure, a late result is kept", async () => {
    const runner = createLoadRunner();
    // two callers while prepare waits: one load, one prepare
    let loads = 0;
    let prepared = 0;
    const reading = gate();
    const { how } = unitHow({ ttl: 60, prepare: async (raw) => (prepared++, await reading.opened, `${raw} read`) });
    const first = runner.runLoad("k", async () => (++loads, "answer"), how);
    await wait(5);
    const second = runner.runLoad("k", async () => (++loads, "answer"), how);
    reading.open();
    assert.deepEqual([(await first).value, (await second).value, loads, prepared], ["answer read", "answer read", 1, 1]);
    assert.equal((await runner.runLoad("k", async () => ++loads, how)).value, "answer read", "kept");
    // pivotkit's own error of prepare (a limit of the reader, BUSY): as it is, nothing kept
    const own = unitHow({ ttl: 60, prepare: async () => {
        throw ownError(new OperationError("LIMIT_EXCEEDED", "1,001 rows exceed the limit of 1,000 (limits.rows)"));
    } });
    const limited = await failure(runner.runLoad("own", async () => "answer", own.how));
    assert.deepEqual([limited.code, limited.message], ["LIMIT_EXCEEDED", "1,001 rows exceed the limit of 1,000 (limits.rows)"]);
    assert.equal((await runner.runLoad("own", async () => "again", unitHow({ ttl: 60 }).how)).value, "again", "nothing was kept");
    // any other error of prepare: the source's failure, its words not passed on
    const other = unitHow({ prepare: async () => {
        throw new Error("db at 10.1.2.3");
    } });
    const failed = await failure(runner.runLoad("other", async () => "answer", other.how));
    assert.equal(failed.code, "SOURCE_UNAVAILABLE");
    assert.doesNotMatch(failed.message, /10\.1\.2\.3/);
    // a load over its time: its late result is prepared and kept; a late prepare that fails leaves no unhandled rejection
    let unhandled = 0;
    const count = () => unhandled++;
    process.on("unhandledRejection", count);
    try {
        const late = gate();
        const timed = unitHow({ timeMs: 20, ttl: 60, prepare: async (raw) => `${raw} read` });
        await failure(runner.runLoad("late", () => late.opened, timed.how));
        late.open("late answer");
        await wait(10);
        assert.equal((await runner.runLoad("late", async () => "new", timed.how)).value, "late answer read");
        const lateBad = gate();
        const bad = unitHow({ timeMs: 20, ttl: 60, prepare: async () => {
            throw new Error("cannot be read");
        } });
        await failure(runner.runLoad("bad", () => lateBad.opened, bad.how));
        lateBad.open("late answer");
        await wait(10);
        assert.equal((await runner.runLoad("bad", async () => "new", unitHow({ ttl: 60 }).how)).value, "new", "a late result that cannot be prepared is not kept");
        assert.equal(unhandled, 0);
    } finally {
        process.off("unhandledRejection", count);
    }
});

test("packed tables: whole numbers in the narrowest integer array, texts as one UTF-8 buffer, back as they were", () => {
    const n = 70_000;
    const table = {
        columns: ["Byte", "Signed", "Wide", "Huge", "City", "Odd", "Many"],
        data: [
            Array.from({ length: n }, (_, i) => (i % 9 === 0 ? null : i % 256)),
            Array.from({ length: n }, (_, i) => (i % 2 ? -129 : 300)),
            Array.from({ length: n }, (_, i) => i * 30_000),
            Array.from({ length: n }, (_, i) => (i ? 1 : 2 ** 31)),
            Array.from({ length: n }, (_, i) => ["Zürich", "東京", "", "😀 x"][i % 4]),
            Array.from({ length: n }, (_, i) => (i ? "a" : "\uD800 lone")),
            Array.from({ length: n }, (_, i) => `id-${i}`)
        ]
    };
    const packed = packTable(table, n, 0);
    const columns = /** @type {any[]} */ (packed.columns);
    assert.deepEqual(columns.map((c) => c.kind), ["number", "number", "number", "number", "text", "text", "text"]);
    assert.deepEqual(columns.slice(0, 4).map((c) => c.values.constructor.name), ["Uint8Array", "Int16Array", "Int32Array", "Float64Array"]);
    assert.ok(columns[0].blank, "a whole-number column keeps its blanks");
    assert.equal(columns[0].values.buffer.constructor, SharedArrayBuffer);
    assert.deepEqual(columns.slice(4).map((c) => c.codes.constructor.name), ["Uint8Array", "Uint8Array", "Uint32Array"]);
    assert.ok("text" in columns[4] && "ends" in columns[4]);
    assert.ok("dict" in columns[5], "a lone surrogate stays a string: UTF-8 cannot carry it");
    // about the answer's own bytes: the distinct ids as UTF-8, their ends and the codes
    const many = columns[6];
    assert.equal(many.text.byteLength, table.data[6].join("").length);
    assert.equal(packedBytes({ packed: true, length: n, dropped: 0, columns: [many] }), 64 + 16 + 2 * "Many".length + many.text.byteLength + 4 * n + 4 * n);
    const back = /** @type {any} */ (unpackTable(packed));
    for (let c = 0; c < table.columns.length; c++) {
        assert.deepEqual(back.data[c], table.data[c], table.columns[c]);
    }
});

test("an async prepare and a refusal: a value prepared after the key was refused is never kept", async () => {
    // the only caller leaves while prepare waits; a new load is refused; the old prepare ends after
    const runner = createLoadRunner();
    const reading = gate();
    const leave = new AbortController();
    let seen;
    const first = runner.runLoad("k", async () => "old", unitHow({ ttl: 60, signal: leave.signal, prepare: async (raw, signal) => ((seen = signal), await reading.opened, raw) }).how);
    await wait(10);
    leave.abort();
    await assert.rejects(first);
    assert.equal(seen?.aborted, true, "prepare's signal fires when every caller went away");
    await failure(runner.runLoad("k", async () => {
        throw new SourceError("NOT_ALLOWED", { transient: false });
    }, unitHow({ ttl: 60 }).how));
    reading.open();
    await wait(10);
    assert.deepEqual(runner.size(), { entries: 0, bytes: 0 });
    assert.equal((await runner.runLoad("k", async () => "fresh", unitHow({ ttl: 60 }).how)).value, "fresh");
    // a late result (over timeMs) still in prepare when the key is refused
    const late = gate();
    const lateReading = gate();
    await failure(runner.runLoad("late", () => late.opened, unitHow({ timeMs: 20, ttl: 60, prepare: async (raw) => (await lateReading.opened, raw) }).how));
    late.open("late");
    await wait(10);
    await failure(runner.runLoad("late", async () => {
        throw new SourceError("NOT_ALLOWED", { transient: false });
    }, unitHow({ ttl: 60 }).how));
    lateReading.open();
    await wait(10);
    assert.equal((await runner.runLoad("late", async () => "fresh", unitHow({ ttl: 60 }).how)).value, "fresh", "the refused key's old data is not brought back");
    // a load that started later and is kept already is not overwritten by an earlier one's late result
    const slow = gate();
    const slowReading = gate();
    await failure(runner.runLoad("order", () => slow.opened, unitHow({ timeMs: 20, ttl: 60, prepare: async (raw) => (await slowReading.opened, raw) }).how));
    slow.open("earlier");
    await wait(5);
    assert.equal((await runner.runLoad("order", async () => "later", unitHow({ ttl: 60 }).how)).value, "later");
    slowReading.open();
    await wait(10);
    assert.equal((await runner.runLoad("order", async () => "again", unitHow({ ttl: 60 }).how)).value, "later");
});

test("an async prepare: last good data after a transient failure is the prepared value", async () => {
    const runner = createLoadRunner();
    const { how } = unitHow({ ttl: 0, maxStale: 3600, prepare: async (raw) => `${raw} read` });
    assert.equal((await runner.runLoad("k", async () => "answer", how)).value, "answer read");
    const stale = await runner.runLoad("k", async () => {
        throw new SourceError("SOURCE_UNAVAILABLE", { transient: true });
    }, how);
    assert.equal(stale.value, "answer read");
    assert.ok(stale.stale);
});

test("data too large to keep: one warning per source an hour naming sourceCache.maxMb, and every call loads", async (t) => {
    const runner = createLoadRunner({ cache: createLoadCache({ bytes: 4 * 1_048_576 }) });
    const { how, lines } = unitHow({ ttl: 60, sizeOf: () => 2 * 1_048_576, label: "big" });
    let loads = 0;
    for (let i = 0; i < 3; i++) {
        await runner.runLoad("k", async () => ++loads, how);
    }
    assert.equal(loads, 3);
    const warned = lines.filter(([level, m]) => level === "warn" && /sourceCache\.maxMb/.test(m));
    assert.deepEqual(warned.map(([, m]) => m), ["the source big: its data (2.0 MiB) is larger than a quarter of sourceCache.maxMb (1.0 MiB), so it is not kept and every call loads it again; raise sourceCache.maxMb to keep it"]);
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 3_600_000 });
    await runner.runLoad("k", async () => ++loads, how);
    assert.equal(lines.filter(([level, m]) => level === "warn" && /sourceCache\.maxMb/.test(m)).length, 2, "said again after an hour");
});

test("the pool: a CSV read whose callers all went away stops, its worker replaced", async () => {
    const computer = createComputer({ workers: 1, timeMs: 30_000 });
    const rows = ["a,b,c"];
    for (let i = 0; i < 400_000; i++) {
        rows.push(`x${i},${i},y${i % 7}`);
    }
    const bytes = new TextEncoder().encode(`${rows.join("\n")}\n`);
    try {
        const leave = new AbortController();
        const reading = computer.read(JOB_SPEC, { bytes, format: "csv" }, null, null, leave.signal);
        setTimeout(() => leave.abort(new DOMException("every caller went away", "AbortError")), 30);
        await assert.rejects(reading, { name: "AbortError" });
        // the next job gets a new worker
        const read = await computer.read(JOB_SPEC, { bytes: new TextEncoder().encode("a,b\n1,2\n"), format: "csv" }, null, null);
        assert.equal(read.table.length, 1);
    } finally {
        await computer.close();
    }
});

test("packed tables: a number column with -0 stays Float64, so -0 comes back as -0", () => {
    const packed = packTable({ columns: ["N"], data: [[1, -0]] }, 2, 0);
    const column = /** @type {any} */ (packed.columns[0]);
    assert.equal(column.values.constructor, Float64Array);
    const back = /** @type {any} */ (unpackTable(packed));
    assert.ok(Object.is(back.data[0][1], -0), "an integer array would give 0");
});

test("an async prepare that ignores the signal: when every caller left before it resolved, its value is not kept", async () => {
    const runner = createLoadRunner();
    const reading = gate();
    const leave = new AbortController();
    const first = runner.runLoad("k", async () => "old", unitHow({ ttl: 60, signal: leave.signal, prepare: async (raw) => (await reading.opened, raw) }).how);
    await wait(10);
    leave.abort();
    await assert.rejects(first);
    reading.open();
    await wait(10);
    assert.deepEqual(runner.size(), { entries: 0, bytes: 0 });
    assert.equal((await runner.runLoad("k", async () => "fresh", unitHow({ ttl: 60 }).how)).value, "fresh");
});
