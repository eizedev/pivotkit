// The fixes of the 0.7.0 pre-release review (an operator's walkthrough and a security and privacy
// review): each test fails on the code before its fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REQUEST_LIMITS, callerOf, checkConfig, createLimits, limitKeyOf, validateOptions } from "pivotkit-server";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { prune } from "../src/output.js";
import { join } from "node:path";
import { placeMarker, signToken, subkeysOf, sweepMarkers } from "../src/downloads.js";
import { createAuthCore } from "../src/auth.js";
import { TOKEN, call, factsOf, restServer, tempDir, workspace } from "./helpers.js";

// --- F2: columns the file gives no header never take a "show" default --------------------------------

/**
 * Staff with a hidden salary in the last column; the third row's name holds an unquoted comma, so its
 * salary lands in a sixth column the header does not name ("Column 6").
 */
const STAFF_CSV = ["Name,Team,Office,Grade,Salary", "Ann,a,Berlin,3,51234", "Bob,b,Hamburg,4,62345", "Carl,Jr,c,Munich,5,73456"].join("\n") + "\n";
const STAFF_POLICY = Object.freeze({ default: "show", fields: { Salary: "hide" } });

test("F2: a column a long row adds is hidden under default show; its values reach neither describe nor a render", async () => {
    const dir = workspace({ "staff.csv": STAFF_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: STAFF_POLICY } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.equal(described.status, 200);
        const text = JSON.stringify(described.data);
        assert.doesNotMatch(text, /Column 6/, "the column without a header is not described");
        assert.doesNotMatch(text, /73456/, "no salary of the shifted row");
        const all = await call(`${server.api}/views/render`, { body: { source: "staff", view: { rows: ["Name"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(all.data), /73456/);
        const asked = await call(`${server.api}/views/render`, { body: { source: "staff", view: { rows: ["Column 6"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(asked.data), /73456/, "asking for it by its name gives nothing of it");
    } finally {
        await server.close();
    }
});

test("F2: an operator's own rule for such a column still holds", async () => {
    const dir = workspace({ "staff.csv": STAFF_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "summary", fields: { "Column 6": "show" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.match(JSON.stringify(described.data), /Column 6/);
    } finally {
        await server.close();
    }
});

test("F2: check-config prints such a column as hidden and warns of a default show with hidden fields (a deny list)", async () => {
    const dir = workspace({ "staff.csv": STAFF_CSV });
    const text = factsOf((await checkConfig({ sources: { staff: { file: "data/staff.csv", policy: STAFF_POLICY } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(text, /^ {6}Column 6: hide \(the file gives this column no header\)$/m);
    assert.match(text, /^WARNING \(Sources\): sources\.staff\.policy: "show" by default with hidden fields is a deny list/m);
    // a default that is not show, or show without a hidden field: no such warning
    const closed = factsOf((await checkConfig({ sources: { staff: { file: "data/staff.csv", policy: { default: "summary", fields: { Salary: "hide" } } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(closed, /deny list/);
    const open = factsOf((await checkConfig({ sources: { staff: { file: "data/staff.csv", policy: { default: "show" } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(open, /deny list/);
});

// --- F1: download links over plain http on another machine need an explicit opt-in ------------------

test("F1: an http:// http.publicUrl off loopback with download links on is refused unless output.downloads.allowInsecureUrl is set", () => {
    const base = { sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" } };
    assert.throws(() => validateOptions({ ...base, http: { publicUrl: "http://reports.example.com" } }), /http\.publicUrl: an http:\/\/ address .*output\.downloads\.allowInsecureUrl/);
    assert.throws(() => validateOptions({ ...base, output: { dir: "out", downloads: { bind: "once" } }, http: { publicUrl: "http://10.1.2.3:3333" } }), /allowInsecureUrl/);
    // allowed: https, loopback, links off, or the opt-in
    for (const options of [
        { ...base, http: { publicUrl: "https://reports.example.com" } },
        { ...base, http: { publicUrl: "http://localhost:3333" } },
        { ...base, http: { publicUrl: "http://[::1]:3333" } },
        { ...base, http: { publicUrl: "http://127.0.0.1:3333" } },
        { ...base, output: { dir: "out", downloads: { enabled: false } }, http: { publicUrl: "http://reports.example.com" } },
        { ...base, output: { dir: "out", downloads: { allowInsecureUrl: true } }, http: { publicUrl: "http://reports.example.com" } }
    ]) {
        assert.doesNotThrow(() => validateOptions(options), JSON.stringify(options));
    }
});

test("F1: with the opt-in, check-config and the start warn of links in clear text", async () => {
    const dir = workspace();
    const options = { sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", downloads: { allowInsecureUrl: true } }, http: { publicUrl: "http://reports.example.com" }, baseDir: dir };
    const text = factsOf((await checkConfig(options, { http: true, env: {} })).text);
    assert.match(text, /^WARNING \(Delivery\): http\.publicUrl is http:\/\/ on reports\.example\.com \(output\.downloads\.allowInsecureUrl\): download links and their cookies cross the network in clear text/m);
    const server = await restServer(options);
    try {
        assert.ok(server.log.some((l) => l.level === "warn" && /http\.publicUrl is http:\/\/ on reports\.example\.com/.test(l.msg)), JSON.stringify(server.log));
    } finally {
        await server.close();
    }
    // https: no such warning
    assert.doesNotMatch((await checkConfig({ ...options, output: { dir: "out" }, http: { publicUrl: "https://reports.example.com" } }, { http: true, env: {} })).text, /clear text/);
});

// --- F3: the request limits count per person, a client's people together under a cap ---------------

test("F3: limitKeyOf names the person, else the client; a client's people together run at most concurrency x clientShare requests", () => {
    const oauth = (subject) => callerOf("oauth", { token: "jwt", clientId: "claude", scopes: [], expiresAt: 0, extra: { subject, issuer: "https://auth.example.test/" } });
    assert.notEqual(limitKeyOf(oauth("ana")), limitKeyOf(oauth("ben")));
    assert.equal(limitKeyOf(oauth("ana")), limitKeyOf(oauth("ana")));
    assert.equal(limitKeyOf(oauth(undefined)), "client:claude", "a token without a person counts for its client");
    assert.match(limitKeyOf(callerOf("none")), /^person:/);
    const limits = createLimits({ concurrency: 1 });
    try {
        const cap = REQUEST_LIMITS.clientShare;
        for (let i = 0; i < cap; i++) {
            assert.equal(limits.enter(`person:${i}`, "claude"), true);
        }
        assert.equal(limits.enter("person:one-more", "claude"), false, "the client's cap");
        assert.equal(limits.enter("person:other", "other-client"), true, "another client is not held by it");
        assert.equal(limits.enter("person:0", "claude"), false, "a person's own concurrency");
        limits.leave("person:0", "claude");
        assert.equal(limits.enter("person:one-more", "claude"), true, "a place given back");
    } finally {
        limits.close();
    }
});

// --- F4: the download key is read at most about once a second, not on every request ------------------

test("F4: requests with forged tokens do not read the key file or variable each time", async () => {
    const dir = workspace();
    let reads = 0;
    const env = new Proxy({ DL_KEY: "a-download-key-for-tests-that-is-long-enough-0123456789" }, { get: (t, k) => (k === "DL_KEY" && reads++, Reflect.get(t, k)) });
    const server = await restServer({ sources: { open: { file: "data/sales.csv", policy: { default: "show" } } }, output: { dir: "out", downloads: { key: { env: "DL_KEY" } } }, baseDir: dir }, { env });
    try {
        const forged = signToken(subkeysOf(randomBytes(32)), { n: randomBytes(16).toString("base64url"), e: Math.floor(Date.now() / 1000) + 600, b: "none" });
        const before = reads;
        const statuses = [];
        for (let i = 0; i < 20; i++) {
            statuses.push((await fetch(`${server.url}/downloads/${forged}`)).status);
        }
        assert.ok(statuses.every((s) => s === 404), String(statuses));
        assert.ok(reads - before <= 2, `the key was read ${reads - before} times for 20 requests`);
    } finally {
        await server.close();
    }
});

// --- F5: a used sign-in state is kept on the server until it expires ---------------------------------

test("F5: sweepMarkers deletes an expired sign-in state's marker and keeps a live one", async () => {
    const dir = tempDir();
    const old = join(dir, `${randomBytes(16).toString("base64url")}.state`);
    const live = join(dir, `${randomBytes(16).toString("base64url")}.state`);
    await placeMarker(old, Math.floor(Date.now() / 1000) - 1);
    await placeMarker(live, Math.floor(Date.now() / 1000) + 600);
    assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith(".tmp")), [], "no temporary file is left");
    await sweepMarkers(dir);
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(live), true);
});

// --- the age sweep says what it deleted -----------------------------------------------------------

test("output.maxAgeDays: a sweep that deletes old reports and drafts writes one info line with both counts; one that deletes nothing writes none", async () => {
    const dir = tempDir();
    const old = (Date.now() - 3 * 86_400_000) / 1000;
    for (const name of ["a.pivotkit-out.csv", "b.pivotkit-out.xlsx", "Weekly.pivotkit-out.report.json", "fresh.pivotkit-out.csv", "mine.csv"]) {
        writeFileSync(join(dir, name), "x");
        if (name !== "fresh.pivotkit-out.csv") utimesSync(join(dir, name), old, old);
    }
    const lines = [];
    const log = { info: (msg, fields) => lines.push({ msg, ...fields }) };
    await prune({ output: { dir, maxAgeDays: 1, cleanUp: true }, log });
    assert.deepEqual(readdirSync(dir).sort(), ["fresh.pivotkit-out.csv", "mine.csv"]);
    assert.equal(lines.length, 1, JSON.stringify(lines));
    assert.match(lines[0].msg, /output\.maxAgeDays/);
    assert.equal(lines[0].reports, 2);
    assert.equal(lines[0].drafts, 1);
    const empty = tempDir();
    await prune({ output: { dir: empty, maxAgeDays: 1, cleanUp: true }, log });
    assert.equal(lines.length, 1, "nothing deleted, nothing said");
});

// --- a static token's file that went missing, empty or short says so on the log ---------------------

test("auth token: a token file emptied or removed after the start refuses with 401 and writes one warning per minute naming the token, never a value", async () => {
    const dir = tempDir();
    const file = join(dir, "bot.token");
    writeFileSync(file, `${TOKEN}\n`);
    const warnings = [];
    const log = { warn: (msg, fields) => warnings.push({ msg, ...fields }), info() {}, debug() {} };
    const core = await createAuthCore({ auth: { mode: "token", tokens: [{ name: "bot", file }] } }, { env: {}, log, loopback: true });
    const ask = () => core.check(new Request("http://127.0.0.1/api/v1/sources", { headers: { authorization: `Bearer ${TOKEN}` } }));
    assert.equal((await ask()).clientId, "bot");
    writeFileSync(file, "");
    await assert.rejects(ask(), (e) => e.status === 401);
    await assert.rejects(ask(), (e) => e.status === 401);
    assert.equal(warnings.length, 1, JSON.stringify(warnings));
    assert.match(warnings[0].msg, /auth: the token "bot" \(its file\) is missing, empty or shorter than 32 characters/);
    assert.ok(!JSON.stringify(warnings).includes(TOKEN.slice(0, 12)), "never the token");
    assert.ok(!JSON.stringify(warnings).includes(dir), "never the file's path either");
});

// --- check-config warns of an output directory that holds the operator's own files, as serve does ----

test("check-config: output.dir in the configuration's directory is a WARNING (Output), with the text serve warns with", async () => {
    const dir = workspace();
    const result = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "." }, baseDir: dir }, { http: false, env: {} });
    assert.match(factsOf(result.text), /^WARNING \(Output\): output\.dir is the configuration's directory or holds a source, template or token file: reports there are never deleted to make room, so a full directory refuses new ones; give the reports a directory of their own$/m);
    assert.ok(result.warnings >= 1);
    // a directory of the reports' own: no such warning
    assert.doesNotMatch((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir }, { http: false, env: {} })).text, /never deleted to make room/);
});
