// The fixes of the 0.7.0 pre-release review (an operator's walkthrough and a security and privacy
// review): each test fails on the code before its fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REQUEST_LIMITS, callerOf, checkConfig, createLimits, limitKeyOf, validateOptions } from "pivotkit-server";
import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import { existsSync, mkdirSync, readdirSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
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
    assert.throws(() => validateOptions({ ...base, http: { publicUrl: "http://reports.example.com" } }), /http\.publicUrl \(or --public-url\): an http:\/\/ address .*output\.downloads\.allowInsecureUrl: true .*switch every download link off with output\.downloads\.enabled: false/);
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
    assert.match(text, /^WARNING \(Delivery\): http\.publicUrl is http:\/\/ on reports\.example\.com \(accepted by output\.downloads\.allowInsecureUrl\): download links and their cookies cross the network in clear text/m);
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

/** A schedule draft's file as draft_schedule writes it, with its status. */
const draftJson = (status) => JSON.stringify({ format: "pivotkit-report-draft", version: 0, status, name: "Weekly" });

test("output.maxAgeDays: a sweep deletes old reports and drafts no longer waiting, never a draft waiting for approval, and writes one info line with the counts; one that deletes nothing writes none", async () => {
    const dir = tempDir();
    const old = (Date.now() - 3 * 86_400_000) / 1000;
    const files = { "a.pivotkit-out.csv": "x", "b.pivotkit-out.xlsx": "x", "Weekly.pivotkit-out.report.json": draftJson("draft"), "Done.pivotkit-out.report.json": draftJson("approved"), "fresh.pivotkit-out.csv": "x", "mine.csv": "x" };
    for (const [name, text] of Object.entries(files)) {
        writeFileSync(join(dir, name), text);
        if (name !== "fresh.pivotkit-out.csv") utimesSync(join(dir, name), old, old);
    }
    const lines = [];
    const log = { info: (msg, fields) => lines.push({ msg, ...fields }) };
    await prune({ output: { dir, maxAgeDays: 1, cleanUp: true }, log });
    assert.deepEqual(readdirSync(dir).sort(), ["Weekly.pivotkit-out.report.json", "fresh.pivotkit-out.csv", "mine.csv"], "the draft waits for a person");
    assert.equal(lines.length, 1, JSON.stringify(lines));
    assert.equal(lines[0].msg, "output.maxAgeDays: reports and schedule drafts no longer waiting older than 1 days deleted");
    assert.deepEqual([lines[0].reports, lines[0].drafts], [2, 1]);
    // a directory of old drafts that wait: nothing deleted, nothing said
    const drafts = tempDir();
    writeFileSync(join(drafts, "Old.pivotkit-out.report.json"), draftJson("draft"));
    utimesSync(join(drafts, "Old.pivotkit-out.report.json"), old, old);
    await prune({ output: { dir: drafts, maxAgeDays: 1, cleanUp: true }, log });
    assert.deepEqual(readdirSync(drafts), ["Old.pivotkit-out.report.json"]);
    const empty = tempDir();
    await prune({ output: { dir: empty, maxAgeDays: 1, cleanUp: true }, log });
    assert.equal(lines.length, 1, "nothing deleted, nothing said");
});

test("output.maxAgeDays: a draft whose status the host changed from \"draft\" no longer waits and goes by age; one still \"draft\" or unreadable stays; check-config counts the ones that go", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    const old = (Date.now() - 40 * 86_400_000) / 1000;
    const draft = (status) => JSON.stringify({ format: "pivotkit-report-draft", version: 0, status, name: "Weekly" });
    const files = { "waiting.pivotkit-out.report.json": draft("draft"), "approved.pivotkit-out.report.json": draft("approved"), "rejected.pivotkit-out.report.json": draft("rejected"), "broken.pivotkit-out.report.json": "{not json", "old.pivotkit-out.csv": "x" };
    for (const [name, text] of Object.entries(files)) {
        writeFileSync(join(out, name), text);
        utimesSync(join(out, name), old, old);
    }
    const text = factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(text, /^WARNING \(Output\): 1 report and 2 schedule drafts no longer waiting for approval are older than 30 days and are deleted at the next start; copy them away or set output\.maxAgeDays: 0$/m);
    const lines = [];
    await prune({ output: { dir: out, maxAgeDays: 30, cleanUp: true }, log: { info: (msg, fields) => lines.push({ msg, ...fields }) } });
    assert.deepEqual(readdirSync(out).sort(), ["broken.pivotkit-out.report.json", "waiting.pivotkit-out.report.json"]);
    assert.deepEqual(lines, [{ msg: "output.maxAgeDays: reports and schedule drafts no longer waiting older than 30 days deleted", reports: 1, drafts: 2, maxAgeDays: 30 }]);
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
    assert.match(warnings[0].msg, /auth: the token "bot" cannot be used \(its file is empty\)/);
    // the cause, each in its words: a file cut short, a file gone (another core: the warning is per minute)
    const again = async (content) => {
        const seen = [];
        writeFileSync(file, `${TOKEN}\n`);
        const other = await createAuthCore({ auth: { mode: "token", tokens: [{ name: "bot", file }] } }, { env: {}, log: { ...log, warn: (msg) => seen.push(msg) }, loopback: true });
        if (content === null) unlinkSync(file);
        else writeFileSync(file, content);
        await assert.rejects(other.check(new Request("http://127.0.0.1/api/v1/sources", { headers: { authorization: `Bearer ${TOKEN}` } })));
        return seen.join("\n");
    };
    assert.match(await again("short-token-12345"), /\(its file has 17 characters\)/);
    assert.match(await again(null), /\(its file is missing\)/);
    // rotated to a token too easy to guess: refused like a short one, even when a request sends it
    const weak = "x".repeat(40);
    const seen = [];
    writeFileSync(file, `${TOKEN}\n`);
    const rotated = await createAuthCore({ auth: { mode: "token", tokens: [{ name: "bot", file }] } }, { env: {}, log: { ...log, warn: (msg) => seen.push(msg) }, loopback: true });
    writeFileSync(file, `${weak}\n`);
    for (let i = 0; i < 2; i++) {
        await assert.rejects(rotated.check(new Request("http://127.0.0.1/api/v1/sources", { headers: { authorization: `Bearer ${weak}` } })), (e) => e.status === 401);
    }
    assert.match(seen.join("\n"), /\(its file holds a token too easy to guess \(1 different character, at least 8\)\)/);
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

// --- a token in the address is logged as such on REST too ----------------------------------------

test("REST: a token in the address is refused 401 and logged with reason token_in_address, on a GET and on a POST (its precheck)", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        assert.equal((await call(`${server.api}/sources?access_token=${TOKEN}`)).status, 401);
        assert.equal((await call(`${server.api}/views/validate?access_token=${TOKEN}`, { body: { source: "sales", view: { rows: ["Region"] } } })).status, 401);
        const reasons = server.log.filter((l) => l.event === "refused").map((l) => l.reason);
        assert.deepEqual(reasons, ["token_in_address", "token_in_address"]);
        assert.ok(!JSON.stringify(server.log).includes(TOKEN), "the token is never logged");
    } finally {
        await server.close();
    }
});

// --- #473: a body over rest.data.maxBytes gets its 413 also by a client that reads only after sending ---

/**
 * A POST sent whole before anything is read, as .NET's HttpClient and PowerShell send: the answer's
 * status line and request id, or the error that ended the connection.
 */
function sendThenRead(url, token, bytes) {
    return new Promise((resolve) => {
        const u = new URL(url);
        const socket = connect(Number(u.port), u.hostname);
        const received = [];
        let error = null;
        socket.on("error", (e) => (error = e));
        socket.pause();
        const head = `POST ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${bytes}\r\nConnection: close\r\n\r\n`;
        const chunk = Buffer.alloc(65_536, 0x20);
        let left = bytes;
        socket.write(head);
        const pump = () => {
            while (left > 0) {
                const n = Math.min(left, chunk.length);
                left -= n;
                if (!socket.write(n === chunk.length ? chunk : chunk.subarray(0, n))) {
                    socket.once("drain", pump);
                    return;
                }
            }
            // all sent: only now is the answer read
            socket.on("data", (d) => received.push(d));
            socket.resume();
        };
        pump();
        socket.on("close", () => {
            const text = Buffer.concat(received).toString("latin1");
            resolve({ status: Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0), requestId: /\r\nx-request-id: ([^\r]+)/i.exec(text)?.[1] ?? null, error: error?.code ?? null });
        });
    });
}

test("#473: a declared body over rest.data.maxBytes from a caller that may send data gets 413 with its request id, also when the client reads only after sending it all", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, policy: { profiles: { etl: { data: true } } }, auth: { mode: "token", tokens: [{ name: "etl", env: "ETL_TOKEN", profile: "etl" }] }, baseDir: dir }, { env: { ETL_TOKEN: TOKEN } });
    try {
        // 11 MiB: over the default rest.data.maxBytes (10 MiB), under four times it
        const got = await sendThenRead(`${server.api}/views/render`, TOKEN, 11 * 1_048_576);
        assert.equal(got.status, 413, JSON.stringify(got));
        assert.ok(got.requestId, JSON.stringify(got));
        // a caller without a valid token keeps the small bound (four times 2 MiB): never more than that is read
        const stranger = await sendThenRead(`${server.api}/views/render`, "a-token-nobody-has-0123456789012345678", 11 * 1_048_576);
        assert.notEqual(stranger.status, 200);
        assert.ok(server.log.some((l) => l.event === "refused" && l.status === 413 && l.size === 11 * 1_048_576));
    } finally {
        await server.close();
    }
});

// --- #468: download links that expire too fast for a person ------------------------------------------

test("#468: check-config warns of download links that expire in under 5 minutes; 5 and more say nothing more", async () => {
    const dir = workspace();
    const at = async (expiresMinutes) => factsOf((await checkConfig({ sources: { open: { file: "data/sales.csv", policy: { default: "show" } } }, output: { dir: "out", downloads: { expiresMinutes } }, baseDir: dir }, { http: true, env: {} })).text);
    assert.match(await at(1), /^WARNING \(Delivery\): output\.downloads\.expiresMinutes is 1: a person must read the answer, open the link and sign in within this time; 5 minutes or more is safer$/m);
    assert.match(await at(4), /expiresMinutes is 4: a person must read the answer/);
    assert.doesNotMatch(await at(5), /expiresMinutes is/);
});

// --- #471: a model chooses sources by their description ----------------------------------------------

test("#471: check-config names the sources without a description in one hint line (not a warning) under Sources", async () => {
    const dir = workspace();
    const result = await checkConfig({ sources: { sales: { file: "data/sales.csv" }, described: { file: "data/sales.csv", description: "Orders by region and product, one row per order" }, orders: { file: "data/sales.csv" } }, baseDir: dir }, { http: false, env: {} });
    const text = factsOf(result.text);
    assert.match(text, /^Sources \(3\):\n {2}no description: sales, orders \(a model chooses sources by it: sources\.<id>\.description\)$/m);
    assert.equal(text.match(/no description/g)?.length, 1, "one line for all of them");
    assert.doesNotMatch(text, /WARNING[^\n]*description/);
    const described = factsOf((await checkConfig({ sources: { described: { file: "data/sales.csv", description: "Orders" } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(described, /no description/);
});

// --- #479: a row longer than its header is left out where the source hides a field --------------------

/** Two hidden salaries; the third row's name holds an unquoted comma, so 73457 shifts into Office. */
const SHIFTED_CSV = ["Name,Team,Salary,Salary,Office,Grade", "Ann,a,51234,51235,Berlin,3", "Bob,b,62345,62346,Hamburg,4", "Carl,Jr,c,73456,73457,Munich,5"].join("\n") + "\n";

test("#479: a row longer than its header is left out of a source that hides a field, with a read note; nothing of it reaches describe or a render", async () => {
    const dir = workspace({ "staff.csv": SHIFTED_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "show", fields: { Salary: "hide", "Salary (2)": "hide" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.equal(described.status, 200);
        const text = JSON.stringify(described.data);
        assert.doesNotMatch(text, /7345[67]|Carl|Munich/, "nothing of the shifted row");
        assert.equal(described.data.rows, 2);
        assert.ok(described.data.notes.some((n) => n.code === "ROWS_DROPPED" && /1 row/.test(n.message)), JSON.stringify(described.data.notes));
        const office = await call(`${server.api}/views/render`, { body: { source: "staff", view: { rows: ["Office"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(office.data), /7345[67]/);
    } finally {
        await server.close();
    }
});

test("#479: a source that hides nothing keeps such a row (its extra values in a hidden Column N), as before", async () => {
    const dir = workspace({ "staff.csv": SHIFTED_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "show" } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.equal(described.data.rows, 3);
        assert.ok(!described.data.notes.some((n) => n.code === "ROWS_DROPPED"));
    } finally {
        await server.close();
    }
});

// --- the operator review of #476 ----------------------------------------------------------------------

test("check-config: counts the reports the age sweep deletes at the next start, as a WARNING (Output); drafts waiting for approval are not counted", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    const old = (Date.now() - 40 * 86_400_000) / 1000;
    for (const name of ["a.pivotkit-out.csv", "b.pivotkit-out.xlsx", "Weekly.pivotkit-out.report.json", "fresh.pivotkit-out.csv", "mine.csv"]) {
        writeFileSync(join(out, name), "x");
        if (name !== "fresh.pivotkit-out.csv") utimesSync(join(out, name), old, old);
    }
    const text = factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(text, /^WARNING \(Output\): 2 reports are older than 30 days and are deleted at the next start; copy them away or set output\.maxAgeDays: 0$/m);
    assert.match(text, /^ {2}reports older than 30 days are deleted; schedule drafts stay until a person approves or removes them$/m);
    // no age limit, or nothing old: no such warning
    assert.doesNotMatch((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxAgeDays: 0 }, baseDir: dir }, { http: false, env: {} })).text, /deleted at the next start/);
    assert.doesNotMatch((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxAgeDays: 60 }, baseDir: dir }, { http: false, env: {} })).text, /deleted at the next start/);
});

test("check-config: an output directory shared with the configuration says so once, as the WARNING", async () => {
    const dir = workspace();
    const text = factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "." }, baseDir: dir }, { http: false, env: {} })).text);
    assert.equal(text.match(/refuses new (reports|ones)/g)?.length, 1, text);
});

// --- security review of #476 ----------------------------------------------------------------------

test("#479: a hidden column in the middle: the shifted salary never shows under the next column (the review's repro)", async () => {
    const dir = workspace({ "staff.csv": "Name,Salary,Team,Office\nAnn,51234,a,Berlin\nCarl, Jr,73456,c,Munich\n" });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "show", fields: { Salary: "hide" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.doesNotMatch(JSON.stringify(described.data), /73456/);
        const team = await call(`${server.api}/views/render`, { body: { source: "staff", view: { rows: ["Team"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(team.data), /73456/);
    } finally {
        await server.close();
    }
});

test("F3: one client's people together take at most clientShare times perMinute: a person cannot open buckets without end", () => {
    let now = 0;
    const limits = createLimits({ rateLimit: { perMinute: 1, burst: 1 } }, () => now);
    try {
        for (let i = 0; i < REQUEST_LIMITS.clientShare; i++) {
            assert.equal(limits.take(`person:${i}`, "claude"), 0, `person ${i}`);
        }
        assert.ok(limits.take("person:new", "claude") > 0, "the client's own bucket is empty");
        assert.equal(limits.take("person:other", "other-client"), 0, "another client is not held by it");
        now += 60_000;
        assert.equal(limits.take("person:new", "claude"), 0, "it fills again");
    } finally {
        limits.close();
    }
});

// --- fix review of #476 at 05c42f10 ----------------------------------------------------------------

test("#479: the ROWS_DROPPED note stays when a hidden column is called name (notes are cleaned by code, not by a word in their text)", async () => {
    const dir = workspace({ "people.csv": "Name,Team,Office\nAnn,a,Berlin\nCarl,Jr,c,Munich\n" });
    const server = await restServer({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { Name: "hide" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        assert.ok(described.data.notes.some((n) => n.code === "ROWS_DROPPED"), JSON.stringify(described.data.notes));
        assert.ok(described.data.notes.some((n) => n.code === "COLUMNS_ADDED"), JSON.stringify(described.data.notes));
    } finally {
        await server.close();
    }
});

test("#479: a row longer than its header only by an empty last cell is left out too: its values are shifted all the same", async () => {
    const dir = workspace({ "people.csv": "name,ssn,city\nann,11,Berlin\nbob,12,3,\n" });
    const server = await restServer({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { ssn: "hide" } } } }, baseDir: dir });
    try {
        const city = await call(`${server.api}/views/render`, { body: { source: "people", view: { rows: ["city"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(city.data), /"3"|\b3\b(?=[^0-9])/, JSON.stringify(city.data));
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        assert.equal(described.data.rows, 1);
    } finally {
        await server.close();
    }
});

test("#479: a summary field shifted into a shown column is left out as a hidden one is", async () => {
    const dir = workspace({ "people.csv": "name,salary,city\nann,51234,Berlin\nbob,62,345,Munich\n" });
    const server = await restServer({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { salary: "summary" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        assert.doesNotMatch(JSON.stringify(described.data), /345/);
        assert.equal(described.data.rows, 1);
    } finally {
        await server.close();
    }
});

test("#479: check-config says how many rows are longer than the header and who does not get them", async () => {
    const dir = workspace({ "people.csv": "name,ssn,city\nann,11,Berlin\ndan,14,Bonn\neve,15,Kiel\nbob,12,3,\ncid,13,4,x\n" });
    const text = factsOf((await checkConfig({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { ssn: "hide" } } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(text, /^WARNING \(Sources\): sources\.people: 2 rows have more values than the header \(a separator inside a value\); they are left out for callers who do not see every field as show$/m);
});

test("auth token: a token file that cannot be read (a directory in its place) is said so, not called empty", async () => {
    const dir = tempDir();
    const file = join(dir, "bot.token");
    writeFileSync(file, `${TOKEN}\n`);
    const seen = [];
    const core = await createAuthCore({ auth: { mode: "token", tokens: [{ name: "bot", file }] } }, { env: {}, log: { warn: (msg) => seen.push(msg), info() {}, debug() {} }, loopback: true });
    unlinkSync(file);
    mkdirSync(file);
    await assert.rejects(core.check(new Request("http://127.0.0.1/api/v1/sources", { headers: { authorization: `Bearer ${TOKEN}` } })));
    assert.match(seen.join("\n"), /\(its file cannot be read\)/);
});

test("#479: a file whose every line ends with a separator the header lacks keeps all its rows; a row wider than the others is still left out", async () => {
    const dir = workspace({ "trailing.csv": "name,ssn,city\nann,11,Berlin,\ncid,13,Hamburg,\n", "wider.csv": "name,ssn,city,\nann,11,Berlin,\nbob,12,3,Munich,\ncid,13,Hamburg,\n" });
    const server = await restServer({ sources: { trailing: { file: "data/trailing.csv", policy: { fields: { name: "show", city: "show" } } }, wider: { file: "data/wider.csv", policy: { fields: { name: "show", city: "show" } } } }, baseDir: dir });
    try {
        const trailing = await call(`${server.api}/sources/describe`, { body: { source: "trailing" } });
        assert.equal(trailing.data.rows, 2, "a trailing separator on every line is no shift");
        assert.ok(!trailing.data.notes.some((n) => n.code === "ROWS_DROPPED"));
        const wider = await call(`${server.api}/sources/describe`, { body: { source: "wider" } });
        assert.equal(wider.data.rows, 0, "rows of different widths: every row wider than the named header goes (which one shifted cannot be told)");
        assert.doesNotMatch(JSON.stringify(wider.data), /Munich|"3"/);
    } finally {
        await server.close();
    }
});

// --- privacy probe of 44532f38 ---------------------------------------------------------------------

/** describe and a render by city of `people.csv` under ssn hidden: the text a caller gets. */
async function cityAnswers(csv) {
    const dir = workspace({ "people.csv": csv });
    const server = await restServer({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { ssn: "hide" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        const city = await call(`${server.api}/views/render`, { body: { source: "people", view: { rows: ["city"], values: [{ agg: "count" }] }, format: "json" } });
        return { rows: described.data.rows, text: JSON.stringify(described.data) + JSON.stringify(city.data) };
    } finally {
        await server.close();
    }
}

test("#479 probe 1: most rows shifted, each with an empty last cell, among a row of the header's width: no SSN shows", async () => {
    const got = await cityAnswers("name,ssn,city\nSm,ith,111-SECRET,\nJo,hn,222-SECRET,\nann,33,Berlin\n");
    assert.doesNotMatch(got.text, /SECRET/);
    assert.equal(got.rows, 1);
});

test("#479 probe 2: a header with a trailing separator counts by its named width: a shifted row that leaves the file uneven is caught", async () => {
    const got = await cityAnswers("name,ssn,city,\nann,11,Berlin,\nSm,ith,999-SECRET,x\n");
    assert.doesNotMatch(got.text, /SECRET/);
});

test("#479: a uniform export that ends every line with a separator (the header too, or not) keeps all its rows", async () => {
    assert.equal((await cityAnswers("name,ssn,city\nann,11,Berlin,\ncid,13,Hamburg,\n")).rows, 2);
    assert.equal((await cityAnswers("name,ssn,city,\nann,11,Berlin,\ncid,13,Hamburg,\n")).rows, 2);
});

test("#479 probe 3 and 5: check-config names the CSV limit for a source with a field below show, and no long-row warning where every field is show", async () => {
    const dir = workspace({ "people.csv": "name,ssn,city\nann,11,Berlin\nbob,12,3,x\n" });
    const closed = factsOf((await checkConfig({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { ssn: "hide" } } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.equal(closed.match(/a value kept back is safe in CSV only when values that hold the separator are quoted/g)?.length, 1, closed);
    const open = factsOf((await checkConfig({ sources: { people: { file: "data/people.csv", policy: { default: "show" } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(open, /more values than the header|safe in CSV only/);
});
