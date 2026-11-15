// What the server keeps and hands on about people (the 0.7.0 privacy review): data that belongs to
// one person (data sent in a request, a source bound to a person, a code source marked perPerson)
// never gets a link anyone can open; check-config warns when reports stay on disk without an age
// limit; cache keys hold no group, claim or parameter value in clear text; a person in no group of
// auth.groupProfiles is refused without auth.defaultProfile; one-time markers are swept on a timer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { NOT_IN_GROUP, callerOf, checkConfig, createContext, createServerHandler, groupRefusal, present, validateOptions } from "pivotkit-server";
import { loadRunner } from "../src/sources/run.js";
import { tableKeyOf } from "../src/sources/keys.js";
import { isClosedForDelivery } from "../src/registry.js";
import { createDownloadHandler } from "../src/downloads.js";
import { createLimits } from "../src/limits.js";
import { NO_LINK_NOTE } from "../src/delivery.js";
import { BY_REGION, call, factsOf, restServer, workspace } from "./helpers.js";

const OAUTH = Object.freeze({ mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp" });
const ROWS = [
    { Region: "North", Team: "a", Sales: 10 },
    { Region: "South", Team: "b", Sales: 20 }
];

/** A verified OAuth caller with a subject, its groups and the claims the sources name. */
const person = (subject, { groups = [], claims = undefined } = {}) => callerOf("oauth", { token: "jwt", clientId: "claude", scopes: [], expiresAt: 0, extra: { subject, issuer: OAUTH.issuer, groups, ...(claims ? { claims } : {}) } });

/** A context whose log lines are kept. */
async function contextOf(options) {
    const lines = [];
    const context = await createContext(options, { stderr: { write: (t) => lines.push(...String(t).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) } });
    return Object.assign(context, { lines });
}

/** Every field shown: such a source is open by its policy. */
const SHOWN = Object.freeze({ default: "show" });

/** A code source per caller (a claim-bound team, the operator's perPerson flag) and an open one. */
const PERSONAL_SOURCES = {
    open: { load: async () => ROWS, policy: SHOWN },
    team: { load: async () => ROWS, policy: SHOWN, params: { team: { type: "string", required: true, claim: "team", pattern: "^[a-z0-9-]{1,40}$" } } },
    mine: { load: async () => ROWS, policy: SHOWN, perPerson: true }
};

// --- F1: data that belongs to one person counts as closed for links ---------------------------------

test("data per person counts as closed for links: a claim-bound source, a perPerson code source and data sent in the request; an open source stays open", async () => {
    const context = await contextOf({ sources: PERSONAL_SOURCES, auth: OAUTH });
    try {
        const ana = person("ana", { claims: { team: "a" } });
        assert.equal((await context.registry.resolve("open", ana)).sourceClosed, false);
        assert.equal((await context.registry.resolve("team", ana)).sourceClosed, true);
        assert.equal((await context.registry.resolve("mine", ana)).sourceClosed, true);
        const inline = await context.registry.resolve("inline:", ana, { surface: "mcp", data: { columns: ["Region", "Sales"], rows: [["North", 1]], rowCount: 1 } });
        assert.equal(inline.sourceClosed, true);
        // check-config and the start warnings read the same state
        const closed = Object.fromEntries((await context.registry.check()).map((s) => [s.id, s.closed]));
        assert.deepEqual(closed, { open: false, team: true, mine: true });
    } finally {
        await context.close?.();
    }
});

test("isClosedForDelivery: closed by a field, inline data, a claim parameter, a token exchange, perPerson and an unknown id; open only where every field is shown for everyone", () => {
    const options = {
        auth: OAUTH,
        sources: {
            ...PERSONAL_SOURCES,
            sales: { file: "data/sales.csv" },
            shown: { file: "data/sales.csv", policy: SHOWN },
            exchanged: { http: { url: "https://api.example.test/vms", auth: { tokenExchange: { audience: "a", clientId: "p", clientSecret: { env: "X" } } } }, policy: SHOWN }
        },
        files: { allowDirs: ["data"], policy: SHOWN }
    };
    const closed = (ref) => isClosedForDelivery(/** @type {any} */ (options), ref);
    assert.equal(closed("shown"), false);
    assert.equal(closed("open"), false);
    assert.equal(closed("sales"), true, "a field not shown");
    assert.equal(closed("team"), true, "a parameter bound to a claim");
    assert.equal(closed("mine"), true, "perPerson");
    assert.equal(closed("exchanged"), true, "a token exchange");
    assert.equal(closed("inline:"), true, "data sent in the request");
    assert.equal(closed("nope"), true, "an id the options do not name");
    assert.equal(closed("file:sales.csv"), false, "a file by files.policy");
    // a profile that shows less closes an open source
    assert.equal(isClosedForDelivery(/** @type {any} */ ({ ...options, policy: { profiles: { reader: { default: "summary" } } } }), "shown"), true);
});

test("perPerson: a code source only, and not with cacheShared (one copy for all callers is no data per person)", () => {
    assert.doesNotThrow(() => validateOptions({ sources: { mine: { load: async () => [], perPerson: true } } }));
    assert.throws(() => validateOptions({ sources: { f: { file: "data/x.csv", perPerson: true } } }), /sources\.f\.perPerson: only a code source \(load\) takes perPerson/);
    assert.throws(() => validateOptions({ sources: { mine: { load: async () => [], perPerson: true, cacheShared: true } } }), /sources\.mine\.perPerson: a source with cacheShared serves one copy to all callers/);
    assert.throws(() => validateOptions({ sources: { mine: { load: async () => [], perPerson: "yes" } } }), /perPerson/);
});

test("output.baseUrl: a report over data sent in the request gets no address; the person asks the operator", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { open: { file: "data/sales.csv", policy: SHOWN } }, policy: { data: true }, output: { dir: "out", baseUrl: "https://files.example.com/reports/" }, baseDir: dir });
    try {
        const open = await call(`${server.api}/views/render`, { body: { source: "open", view: BY_REGION, format: "csv", name: "Open" } });
        assert.equal(open.status, 200, JSON.stringify(open.data));
        assert.match(String(open.data.output.url), /^https:\/\/files\.example\.com\/reports\//, "an open source keeps its address");
        const data = { columns: ["Region", "Sales"], rows: [["North", 10], ["South", 20]], rowCount: 2 };
        const mine = await call(`${server.api}/views/render`, { body: { source: "inline:", data, view: BY_REGION, format: "csv", name: "Mine" } });
        assert.equal(mine.status, 200, JSON.stringify(mine.data));
        assert.equal(mine.data.output.url, undefined);
        assert.equal(mine.data.output.note, NO_LINK_NOTE);
    } finally {
        await server.close();
    }
});

test("check-config: per-person sources and data sent in requests are named with why they count as closed", async () => {
    const dir = workspace();
    const text = factsOf((await checkConfig({ sources: { ...PERSONAL_SOURCES, sales: { file: "data/sales.csv" } }, auth: OAUTH, output: { dir: "out" }, baseDir: dir }, { http: true, env: {} })).text);
    assert.match(text, /^ {2}per person \(counted as closed\): team \(a parameter bound to a claim\), mine \(perPerson\), data sent in requests \(inline:\)$/m);
    assert.match(text, /^ {2}reports over closed sources \(team, mine, sales\): no links/m);
    assert.match(text, /^ {2}reports over open sources \(open\): plain links$/m);
    // a code source open by its fields: pivotkit cannot see whether load answers per caller
    assert.match(text, /^ {2}open: load up to 30000 ms\n(?: {4}[^\n]*\n)*? {4}reports over it get plain links \(every field is shown\)\n {4}if load answers each caller differently, set perPerson: true/m);
    assert.match(text, /^ {2}mine: load up to 30000 ms\n {4}loaded on every call\n {4}data per caller, per person \(perPerson: no plain links to its reports\)/m);
    assert.doesNotMatch(text, /^ {2}(team|mine): load[^\n]*\n(?: {4}[^\n]*\n)*? {4}reports over it get plain links/m);
});

// --- F2: reports without an age limit --------------------------------------------------------------

test("check-config: warns only when output.maxAgeDays is 0 while closed sources or data sent in requests are on; the default limit is said on the output line", async () => {
    const dir = workspace();
    const warned = factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxAgeDays: 0 }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(warned, /^Retention:\n {2}no age limit: reports stay in output\.dir until output\.maxFiles \(1000\) or output\.maxMb \(1024 MB\) push them out, also after their link expired\n {2}WARNING: output\.maxAgeDays is 0 \(no age limit\) and reports over closed sources \(sales\) and data sent in requests can hold data about people; leave out output\.maxAgeDays \(the default deletes reports after 30 days\) or set a number of days$/m);
    assert.match(warned, /^ {2}no age limit \(output\.maxAgeDays 0\)$/m);
    // data sent in requests alone: an open source, MCP on
    const inlineOnly = factsOf((await checkConfig({ sources: { open: { file: "data/sales.csv", policy: SHOWN } }, output: { dir: "out", maxAgeDays: 0 }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(inlineOnly, /WARNING: output\.maxAgeDays is 0 \(no age limit\) and data sent in requests can hold/);
    // the default (30 days), a written limit, no output.dir, or nothing closed and no data in requests: no warning
    const byDefault = factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(byDefault, /Retention:/);
    assert.match(byDefault, /^ {2}reports and drafts older than 30 days are deleted$/m);
    assert.match(byDefault, /\nNew in this version: [^\n]*reports deleted after 30 days/);
    assert.doesNotMatch(factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxAgeDays: 7 }, baseDir: dir }, { http: false, env: {} })).text), /Retention:|deleted after 30 days/);
    assert.doesNotMatch((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir }, { http: false, env: {} })).text, /Retention:/);
    assert.doesNotMatch((await checkConfig({ sources: { open: { file: "data/sales.csv", policy: SHOWN } }, mcp: { data: false }, output: { dir: "out", maxAgeDays: 0 }, baseDir: dir }, { http: false, env: {} })).text, /Retention:/);
});

test("output.maxAgeDays: 30 days by default in a directory of the reports' own; a directory with the operator's files starts without an age limit unless one is written", async () => {
    const dir = workspace();
    const own = await contextOf({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir });
    try {
        assert.equal(own.output?.maxAgeDays, 30);
    } finally {
        await own.close();
    }
    const off = await contextOf({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxAgeDays: 0 }, baseDir: dir });
    try {
        assert.equal(off.output?.maxAgeDays, 0, "0: no age limit");
    } finally {
        await off.close();
    }
    // the reports beside the source file: the default does not apply, and the server starts
    const shared = await contextOf({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "data" }, baseDir: dir });
    try {
        assert.equal(shared.output?.maxAgeDays, 0);
        assert.equal(shared.output?.cleanUp, false);
    } finally {
        await shared.close();
    }
    const text = (await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "data" }, baseDir: dir }, { http: false, env: {} })).text;
    assert.match(text, /^ {2}no age limit: the directory holds other files$/m);
    assert.doesNotMatch(text, /PROBLEM: output\.maxAgeDays/);
    assert.doesNotMatch(factsOf(text), /deleted after 30 days/);
    // a limit written for such a directory still stops the start, as before
    await assert.rejects(contextOf({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "data", maxAgeDays: 30 }, baseDir: dir }), /output\.maxAgeDays could delete/);
});

// --- F6: cache keys hold no group, claim or value in clear text --------------------------------------

test("cache keys: a code source's key holds no group, claim or parameter value in clear text; two persons still get two entries, one person one", async () => {
    const context = await contextOf({ sources: { team: { load: async () => ROWS, params: { team: { type: "string", required: true, claim: "team", pattern: "^[a-z0-9-]{1,40}$" }, region: { type: "string" } } } }, auth: OAUTH });
    const keys = [];
    const original = loadRunner.runLoad;
    loadRunner.runLoad = (key, ...rest) => {
        keys.push(key);
        return original(key, ...rest);
    };
    try {
        const ana = person("ana", { groups: ["payroll-admins"], claims: { team: "acme-secret-team" } });
        const bob = person("bob", { groups: ["payroll-admins"], claims: { team: "acme-secret-team" } });
        await present(context, "describe_source", { source: "team", params: { region: "Nordheim-Valley" } }, ana);
        await present(context, "describe_source", { source: "team", params: { region: "Nordheim-Valley" } }, ana);
        await present(context, "describe_source", { source: "team", params: { region: "Nordheim-Valley" } }, bob);
        assert.equal(keys.length, 3);
        for (const key of keys) {
            assert.equal(typeof key, "string");
            assert.doesNotMatch(key, /payroll-admins|acme-secret-team|Nordheim-Valley/, key);
        }
        assert.equal(keys[0], keys[1], "one person, one entry");
        assert.notEqual(keys[0], keys[2], "two persons, two entries");
    } finally {
        loadRunner.runLoad = original;
        await context.close?.();
    }
});

test("cache keys: a table job's key holds no parameter value in clear text; other values or another identity give another key", () => {
    const parts = { kind: "http", id: "vms", configHash: "h", params: { customer: "acme-secret" }, identity: "id-1", levels: { default: "show", fields: {} }, limits: {} };
    const key = /** @type {string} */ (tableKeyOf(parts));
    assert.doesNotMatch(key, /acme-secret/);
    assert.equal(tableKeyOf({ ...parts }), key);
    assert.notEqual(tableKeyOf({ ...parts, params: { customer: "other" } }), key);
    assert.notEqual(tableKeyOf({ ...parts, identity: "id-2" }), key);
    assert.equal(tableKeyOf({ ...parts, identity: null }), null);
});

// --- F8: a person in no group of groupProfiles ------------------------------------------------------

test("groups: a person in no group of auth.groupProfiles is refused without auth.defaultProfile; a scope's or client's profile or the default decides instead", () => {
    const auth = { groupProfiles: [{ group: "finance", profile: "finance" }], scopeProfiles: { "pivotkit:staff": "staff" } };
    const info = (groups, scopes = ["pivotkit"]) => ({ token: "t", clientId: "report-bot", scopes, expiresAt: 0, extra: { subject: "ana", issuer: "https://i", groups } });
    assert.equal(groupRefusal(auth, info(["sales"])), NOT_IN_GROUP);
    assert.equal(groupRefusal(auth, info([])), NOT_IN_GROUP);
    assert.match(NOT_IN_GROUP, /ask the operator/);
    assert.doesNotMatch(NOT_IN_GROUP, /sales|finance/);
    assert.equal(groupRefusal(auth, info(["finance"])), null);
    assert.equal(groupRefusal(auth, info(["sales"], ["pivotkit", "pivotkit:staff"])), null, "a scope names a profile");
    assert.equal(groupRefusal({ ...auth, defaultProfile: "staff" }, info(["sales"])), null);
    assert.equal(groupRefusal({ ...auth, clientProfiles: { "report-bot": "staff" } }, info(["sales"])), null);
    // a static token has its own profile or the sources' policy, as before
    assert.equal(groupRefusal(auth, { token: "", clientId: "bot", scopes: [], expiresAt: 0, extra: {} }), null);
    // a host with a gate of its own that makes the caller anyway is refused
    assert.throws(() => callerOf("oauth", info(["sales"]), auth), /ask the operator/);
});

test("check-config: with groupProfiles and no defaultProfile it says a person in none of the groups is refused", async () => {
    const options = { sources: { sales: { file: "data/sales.csv" } }, policy: { profiles: { finance: { default: "show" } } }, auth: { ...OAUTH, groupProfiles: [{ group: "finance", profile: "finance" }] }, baseDir: workspace() };
    const text = factsOf((await checkConfig(options, { http: true, env: {} })).text);
    assert.match(text, /\n {2}a person in none of these groups is refused: "[^"]*ask the operator"\n/);
    assert.match(text, /WARNING: auth\.groupProfiles without auth\.defaultProfile: a person in none of the groups is refused \(403\); set auth\.defaultProfile to a narrow profile to let them in/);
});

// --- F10: one-time markers swept on a timer -------------------------------------------------------

test("downloads: the markers of expired one-time links are swept on a timer, without another download", async () => {
    const dir = workspace();
    const context = await contextOf({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", downloads: { bind: "once" } }, baseDir: dir });
    const markers = join(dir, "out", ".pivotkit-downloads");
    mkdirSync(markers, { recursive: true });
    const old = join(markers, `${randomBytes(16).toString("base64url")}.used`);
    writeFileSync(old, `${Math.floor(Date.now() / 1000) - 60}\n`);
    const live = join(markers, `${randomBytes(16).toString("base64url")}.used`);
    writeFileSync(live, `${Math.floor(Date.now() / 1000) + 600}\n`);
    const handler = createDownloadHandler(context, { env: {}, loopback: true, sweepEveryMs: 30 });
    try {
        for (let i = 0; i < 100 && existsSync(old); i++) {
            await new Promise((r) => setTimeout(r, 20));
        }
        assert.equal(existsSync(old), false, "the expired marker is gone");
        assert.equal(existsSync(live), true, "a live link's marker stays");
    } finally {
        handler.close();
        await context.close?.();
    }
});

test("downloads: after close() the sweep timer no longer runs", async () => {
    const dir = workspace();
    const context = await contextOf({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", downloads: { bind: "once" } }, baseDir: dir });
    const handler = createDownloadHandler(context, { env: {}, loopback: true, sweepEveryMs: 20 });
    handler.close();
    const markers = join(dir, "out", ".pivotkit-downloads");
    mkdirSync(markers, { recursive: true });
    const old = join(markers, `${randomBytes(16).toString("base64url")}.used`);
    writeFileSync(old, `${Math.floor(Date.now() / 1000) - 60}\n`);
    try {
        await new Promise((r) => setTimeout(r, 150));
        assert.equal(existsSync(old), true, "no sweep after close()");
    } finally {
        await context.close?.();
    }
});

// --- the limiter keeps addresses and callers only while they count -----------------------------------

test("limits: an address without a refused token in the last minute and a caller whose bucket is full again are dropped on a timer; not after close()", async () => {
    let t = 1_000_000;
    const wait = () => new Promise((r) => setTimeout(r, 80));
    const limits = createLimits({}, () => t, { pruneEveryMs: 20 });
    try {
        limits.failed("192.0.2.7");
        limits.take("report-bot");
        await wait();
        assert.deepEqual(limits.size(), { addresses: 1, callers: 1 }, "both still count");
        t += 61_000;
        limits.failed("192.0.2.8");
        await wait();
        // the old address and the full bucket are gone; the address refused just now stays
        assert.deepEqual(limits.size(), { addresses: 1, callers: 0 });
        assert.equal(limits.blocked("192.0.2.8"), 0);
    } finally {
        limits.close();
    }
    const closed = createLimits({}, () => t, { pruneEveryMs: 20 });
    closed.close();
    closed.failed("192.0.2.9");
    t += 61_000;
    await wait();
    assert.deepEqual(closed.size(), { addresses: 1, callers: 0 }, "no prune after close()");
});

test("limits: an address that reached failedAuthPerMinute stays blocked and kept for the whole minute; it goes once its last refusal is older than a minute", () => {
    let t = 5_000_000;
    // no timer tick in this test: prune() runs when the test says
    const limits = createLimits({ rateLimit: { failedAuthPerMinute: 3 } }, () => t, { pruneEveryMs: 3_600_000 });
    try {
        for (let i = 0; i < 3; i++) {
            limits.failed("198.51.100.4");
        }
        assert.ok(limits.blocked("198.51.100.4") > 0);
        t += 40_000;
        limits.prune();
        assert.ok(limits.blocked("198.51.100.4") > 0, "still blocked after 40 s");
        assert.equal(limits.size().addresses, 1, "still kept after 40 s");
        t += 21_000;
        limits.prune();
        assert.equal(limits.size().addresses, 0, "gone after a minute");
        assert.equal(limits.blocked("198.51.100.4"), 0);
    } finally {
        limits.close();
    }
});

test("serve: a start that fails after the download links (or REST) were made stops their timers; an embedded host's retry starts", async () => {
    const dir = workspace();
    const options = { sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", downloads: { bind: "once" } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT_TOKEN" }] }, http: { enable: ["rest"] }, baseDir: dir };
    const runtime = { stderr: { write: () => undefined }, loopback: true };
    // every interval made during the start, and every one cleared
    const made = new Set();
    const cleared = new Set();
    const realSet = globalThis.setInterval;
    const realClear = globalThis.clearInterval;
    globalThis.setInterval = /** @type {any} */ ((...args) => {
        const handle = realSet(...args);
        made.add(handle);
        return handle;
    });
    globalThis.clearInterval = /** @type {any} */ ((handle) => {
        cleared.add(handle);
        return realClear(handle);
    });
    try {
        // the token's variable is not set: the REST handler refuses, after the download links were made
        await assert.rejects(createServerHandler(/** @type {any} */ (options), { ...runtime, env: {} }), /BOT_TOKEN/);
    } finally {
        globalThis.setInterval = realSet;
        globalThis.clearInterval = realClear;
    }
    assert.ok(made.size > 0, "the start made a timer");
    assert.deepEqual([...made].filter((h) => !cleared.has(h)).length, 0, "no timer of the failed start runs on");
    // the host retries with the variable set
    const handler = await createServerHandler(/** @type {any} */ (options), { ...runtime, env: { BOT_TOKEN: "t".repeat(40) } });
    await handler.close();
});
