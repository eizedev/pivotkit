// Code sources of a library host: load(params, { caller, signal }), the time limit and its abort,
// coalescing, the load limits, kept data per caller or shared, last good data after a transient
// failure only, the run limits a file has, and a source's own errors (SourceError, anything else)
// as a caller gets them on REST and MCP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { OperationError } from "pivotkit-report/operations";
import { CODE_DEFAULTS, ConfigError, SourceError, callerOf, checkConfig, createContext, present, serverTextOf, validateOptions } from "pivotkit-server";
import { LOAD_CACHE, createLoadCache, encodedBytes } from "../src/sources/cache.js";
import { LOAD_LIMITS, createLoadRunner, isTransient, sourceFailure } from "../src/sources/run.js";
import { call, restServer, workspace } from "./helpers.js";

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
        assert.match(String(/** @type {any} */ (tool.content)[0].text), /^NOT_ALLOWED: You may not see this team's tickets\. \(id [A-Za-z0-9_-]{11}\)$/);
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
    assert.match((await checkConfig({ sources: { t: { load: async () => [], cacheShared: true, ttl: 120 } } }, { http: false })).text, /t: load up to 30000 ms, reused for 120 s; shared by all callers/);
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
    assert.match(text, /^ {2}a: load up to 20000 ms, reused while version\(\) is the same; data per caller; last good data off$/m);
    assert.match(text, /^ {2}b: load up to 30000 ms, loaded on every call; data per caller; last good data up to 3600 s after a transient failure$/m);
    assert.match(text, /New in this version[^\n]*\n {2}- Code sources: load gets \(params, \{ caller, signal \}\)/);
    assert.doesNotMatch((await checkConfig({ sources: { f: { file: "x.csv" } } }, { http: false })).text, /Code sources|New in this version/);
});

test("the load cache: least recently used out, at most 8 entries per identity, a byte budget; encoded data measured", () => {
    const cache = createLoadCache({ entries: 4, bytes: 100, perIdentity: 2 });
    cache.set("a1", 1, { identity: "a", bytes: 10 });
    cache.set("a2", 2, { identity: "a", bytes: 10 });
    cache.set("a3", 3, { identity: "a", bytes: 10 });
    assert.equal(cache.get("a1"), undefined, "a third entry of one identity pushes out its oldest");
    assert.equal(cache.get("a2"), 2);
    cache.set("b1", 4, { identity: "b", bytes: 10 });
    cache.set("c1", 5, { identity: "c", bytes: 10 });
    assert.equal(cache.size().entries, 4);
    cache.set("d1", 6, { identity: "d", bytes: 10 });
    assert.equal(cache.get("a3"), undefined, "the least recently used of all goes");
    cache.set("big", 7, { identity: "e", bytes: 80 });
    assert.ok(cache.size().bytes <= 100);
    cache.set("huge", 8, { identity: "e", bytes: 101 });
    assert.equal(cache.get("huge"), undefined, "larger than the budget: not kept");
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
    const dir = workspace();
    const server = await restServer({
        sources: {
            t: {
                load: async () => {
                    await release.opened;
                    throw new Error("the backend is down");
                }
            }
        },
        baseDir: dir
    });
    try {
        const first = call(`${server.api}/sources/describe`, { body: { source: "t" } });
        const second = call(`${server.api}/sources/describe`, { body: { source: "t" } });
        await wait(50);
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
