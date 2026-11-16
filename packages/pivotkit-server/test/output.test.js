// The output directory as callers fill it, REST and MCP alike (both write through present()): a
// caller that renders without pause, renders at once, a directory the server cannot write, a
// directory that holds the operator's own files; and what check-config says about the directory and
// the policy before the first request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { whyNot } from "../src/context.js";
import { prune } from "../src/present.js";
import { makeRoom } from "../src/output.js";
import { checkConfig } from "pivotkit-server";
import { BIN, BY_REGION, call, factsOf, restServer, workspace } from "./helpers.js";

const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" }, timeout: 30_000 });

/** The reports and drafts pivotkit wrote into a directory (by the mark in their names). */
const reports = (dir) => readdirSync(dir).filter((n) => /\.pivotkit-out\.(xlsx|html|csv|json|svg|report\.json)$/i.test(n));

/** Files with given sizes and ages (seconds back), oldest first. */
function place(dir, files) {
    const now = Date.now();
    for (const [name, bytes, ageS] of files) {
        writeFileSync(join(dir, name), Buffer.alloc(bytes, 120));
        const when = new Date(now - ageS * 1000);
        utimesSync(join(dir, name), when, when);
    }
}

test("a full output directory makes room by deleting its oldest reports: one caller cannot stop rendering for everyone", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    // pivotkit's file goes; the operator's own files, a report-like one among them, years old, are
    // neither counted nor deleted (a hand-written name with ".pivotkit-out." would count as pivotkit's)
    place(out, [["Secret plan.pivotkit-out.xlsx", 10, 300], ["operator-data.json", 10, 200_000_000], ["notes.txt", 10, 400]]);
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxFiles: 3 }, baseDir: dir });
    try {
        const names = [];
        for (let i = 0; i < 4; i++) {
            const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
            assert.equal(res.status, 200, JSON.stringify(res.data));
            names.push(res.data.output.name);
        }
        // the three newest reports stay; the operator's files are not pivotkit's and stay
        assert.ok(names.every((n) => /\.pivotkit-out\.csv$/.test(n)), names.join());
        assert.deepEqual(reports(out).sort(), names.slice(1).sort());
        assert.ok(readdirSync(out).includes("notes.txt"));
        assert.ok(readdirSync(out).includes("operator-data.json"));
        const evicted = server.log.filter((l) => l.event === "info" && /output/.test(l.message) && l.deleted);
        assert.ok(evicted.length > 0, "the deletion is logged");
        assert.ok(!JSON.stringify(server.log).includes("Secret"), "by count, never by a file's name (it comes from the view)");
    } finally {
        await server.close();
    }
});

test("schedule drafts awaiting approval count but are never deleted to make room; only drafts left refuses", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    place(out, [["Weekly.pivotkit-out.report.json", 10, 300], ["Monthly.pivotkit-out.report.json", 10, 200]]);
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxFiles: 4 }, baseDir: dir });
    try {
        for (let i = 0; i < 4; i++) {
            const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
            assert.equal(res.status, 200, JSON.stringify(res.data));
        }
        // two reports and both drafts: the drafts stayed while the older reports went
        assert.equal(reports(out).length, 4);
        assert.ok(readdirSync(out).includes("Weekly.pivotkit-out.report.json") && readdirSync(out).includes("Monthly.pivotkit-out.report.json"));
    } finally {
        await server.close();
    }
    // drafts written while output.maxFiles was larger fill a directory alone: a render refuses
    const full = workspace();
    place(join(full, "out"), [["A.pivotkit-out.report.json", 10, 300], ["B.pivotkit-out.report.json", 10, 200]]);
    const small = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxFiles: 2 }, baseDir: full });
    try {
        const res = await call(`${small.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(res.status, 409, JSON.stringify(res.data));
        assert.match(res.data.detail, /what is left are schedule drafts, awaiting approval or not, which are not deleted to make room/);
        assert.equal(reports(join(full, "out")).length, 2);
    } finally {
        await small.close();
    }
});

test("schedule drafts take at most half of output.maxFiles: more are refused, renders keep working", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxFiles: 3 }, baseDir: dir });
    const draft = (name) => call(`${server.api}/schedules/draft`, { body: { source: "sales", view: BY_REGION, name, formats: ["xlsx"], every: { unit: "day", at: "07:00" }, recipients: ["Sales team"] } });
    try {
        assert.equal((await draft("One")).status, 200);
        const second = await draft("Two");
        assert.equal(second.status, 409, JSON.stringify(second.data));
        assert.equal(second.data.code, "NO_OUTPUT");
        assert.match(second.data.detail, /schedule drafts awaiting approval, the most it may/);
        assert.match(second.data.detail, /a person must approve or remove some first, or the operator raises output\.maxFiles$/, "the hint names what the operator can set");
        assert.doesNotMatch(second.data.detail, /maxAgeDays/, "the age limit does not delete waiting drafts");
        for (let i = 0; i < 4; i++) {
            assert.equal((await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } })).status, 200);
        }
        assert.equal(reports(out).filter((n) => n.endsWith(".report.json")).length, 1);
    } finally {
        await server.close();
    }
    // output.maxFiles 1 leaves no room for a draft: it is refused, and a render is never blocked by one
    const one = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxFiles: 1 }, baseDir: workspace() });
    try {
        const refused = await call(`${one.api}/schedules/draft`, { body: { source: "sales", view: BY_REGION, name: "Only", formats: ["xlsx"], every: { unit: "day", at: "07:00" }, recipients: ["Sales team"] } });
        assert.equal(refused.status, 409, JSON.stringify(refused.data));
        assert.match(refused.data.detail, /output\.maxFiles 1 leaves no room for drafts/);
        for (let i = 0; i < 2; i++) {
            assert.equal((await call(`${one.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } })).status, 200);
        }
    } finally {
        await one.close();
    }
});

/** A schedule draft's file as pivotkit writes it, with its status, padded to about `bytes`. */
const draftFile = (status, bytes = 0) => JSON.stringify({ format: "pivotkit-report-draft", version: 0, status, name: "Weekly", note: "x".repeat(bytes) });

test("schedule drafts take at most half of output.maxMb: a draft over it is refused with what to do, renders keep working, check-config warns of a directory already over it", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    // drafts a host never approves: 600 KiB of the 512 KiB that half of output.maxMb 1 allows
    for (const name of ["A", "B", "C"]) {
        writeFileSync(join(out, `${name}.pivotkit-out.report.json`), draftFile("draft", 200 * 1024));
    }
    const checked = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxMb: 1 }, baseDir: dir }, { http: false, env: {} });
    assert.match(factsOf(checked.text), /^ {2}at most 1000 files and 1 MiB of pivotkit's; schedule drafts at most 500 files and 512 KiB$/m);
    assert.match(factsOf(checked.text), /^WARNING \(Output\): schedule drafts awaiting approval take 600\.\d KiB, more than the 512 KiB they may \(half of output\.maxMb\): new drafts are refused until a person approves or removes some, or you raise output\.maxMb$/m);
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxMb: 1 }, baseDir: dir });
    try {
        const refused = await call(`${server.api}/schedules/draft`, { body: { source: "sales", view: BY_REGION, name: "Daily", formats: ["xlsx"], every: { unit: "day", at: "07:00" }, recipients: ["Sales team"] } });
        assert.equal(refused.status, 409, JSON.stringify(refused.data));
        assert.equal(refused.data.code, "NO_OUTPUT");
        assert.match(refused.data.detail, /^the schedule drafts awaiting approval take 600\.\d KiB of the 512 KiB they may \(half of output\.maxMb\); a person must approve or remove some first, or the operator raises output\.maxMb$/);
        for (let i = 0; i < 3; i++) {
            assert.equal((await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } })).status, 200);
        }
        assert.equal(reports(out).filter((n) => n.endsWith(".report.json")).length, 3, "no draft deleted, none added");
    } finally {
        await server.close();
    }
});

test("the drafts' caps count only drafts that still wait; a draft that just fits is taken; one larger than all drafts may take says the operator must raise output.maxMb", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    const context = (output) => ({ output: { maxFiles: 1000, maxMb: 1, cleanUp: true, ...output } });
    const cap = 512 * 1024;
    // byte cap: waiting drafts fill it but for 100 bytes; an approved draft beside them does not count
    writeFileSync(join(out, "Waiting.pivotkit-out.report.json"), draftFile("draft", cap - 100 - draftFile("draft").length));
    writeFileSync(join(out, "Approved.pivotkit-out.report.json"), draftFile("approved", 300 * 1024));
    const waitingBytes = statSync(join(out, "Waiting.pivotkit-out.report.json")).size;
    assert.equal(await makeRoom(context({}), out, cap - waitingBytes, true), 0, "a draft that just fits is taken");
    await assert.rejects(makeRoom(context({}), out, cap - waitingBytes + 1, true), /^OperationError: the schedule drafts awaiting approval take [\d.]+ KiB of the 512 KiB they may \(half of output\.maxMb\)/);
    // count cap: maxFiles 4 lets two drafts wait; one waits, one was approved: a second waiting one fits
    const counted = workspace();
    const outCounted = join(counted, "out");
    writeFileSync(join(outCounted, "A.pivotkit-out.report.json"), draftFile("draft"));
    writeFileSync(join(outCounted, "B.pivotkit-out.report.json"), draftFile("rejected"));
    assert.equal(await makeRoom(context({ maxFiles: 4, maxMb: 1024 }), outCounted, 10, true), 0, "an approved or rejected draft is no waiting draft");
    writeFileSync(join(outCounted, "C.pivotkit-out.report.json"), draftFile("draft"));
    await assert.rejects(makeRoom(context({ maxFiles: 4, maxMb: 1024 }), outCounted, 10, true), /holds 2 schedule drafts awaiting approval, the most it may/);
    // two sizes that round alike are said in bytes, so the answer never reads "512 KiB of the 512 KiB"
    const close = workspace();
    writeFileSync(join(close, "out", "Big.pivotkit-out.report.json"), draftFile("draft", cap - 10 - draftFile("draft").length));
    await assert.rejects(makeRoom(context({}), join(close, "out"), 20, true), (e) => /take 524,278 bytes of the 524,288 bytes they may/.test(e.message) || assert.fail(e.message));
    // one draft larger than all drafts together may take: nothing waits, and no approval can help
    const empty = workspace();
    await assert.rejects(makeRoom(context({}), join(empty, "out"), cap + 1024, true), (e) => e.message === "the schedule draft takes 513 KiB, more than all drafts together may take (512 KiB, half of output.maxMb); the operator raises output.maxMb" || assert.fail(e.message));
});

test("output.draftMaxAgeDays: drafts that still wait go after that many days, also with output.maxAgeDays 0; off by default; refused where the operator's files lie", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    const files = { "Old.pivotkit-out.report.json": [draftFile("draft"), 10], "New.pivotkit-out.report.json": [draftFile("draft"), 1], "Done.pivotkit-out.report.json": [draftFile("approved"), 10], "old.pivotkit-out.csv": ["x", 10] };
    for (const [name, [text, days]] of Object.entries(files)) {
        writeFileSync(join(out, name), text);
        const when = new Date(Date.now() - days * 86_400_000);
        utimesSync(join(out, name), when, when);
    }
    const options = { sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxAgeDays: 0, draftMaxAgeDays: 7 }, baseDir: dir };
    const text = factsOf((await checkConfig(options, { http: false, env: {} })).text);
    assert.match(text, /^ {2}no age limit for reports \(output\.maxAgeDays 0\); schedule drafts that wait for approval are deleted after 7 days$/m);
    assert.match(text, /^WARNING \(Output\): 1 schedule draft waiting for approval is older than 7 days and is deleted at the next start; copy it away or set output\.draftMaxAgeDays: 0$/m);
    // the start sweeps: the old waiting draft goes; reports and drafts no longer waiting keep output.maxAgeDays 0
    const server = await restServer(options);
    try {
        assert.deepEqual(reports(out).sort(), ["Done.pivotkit-out.report.json", "New.pivotkit-out.report.json", "old.pivotkit-out.csv"]);
        const said = server.log.filter((l) => /output\.draftMaxAgeDays/.test(l.message ?? l.msg ?? ""));
        assert.equal(said.length, 1, JSON.stringify(server.log));
        assert.equal(said[0].drafts, 1);
    } finally {
        await server.close();
    }
    // by default a waiting draft stays, however old
    const kept = workspace();
    writeFileSync(join(kept, "out", "Old.pivotkit-out.report.json"), draftFile("draft"));
    const longAgo = new Date(Date.now() - 400 * 86_400_000);
    utimesSync(join(kept, "out", "Old.pivotkit-out.report.json"), longAgo, longAgo);
    const plain = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: kept });
    await plain.close();
    assert.deepEqual(reports(join(kept, "out")), ["Old.pivotkit-out.report.json"]);
    // checked like output.maxAgeDays
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", draftMaxAgeDays: -1 }, baseDir: kept }), /output\.draftMaxAgeDays: must be a whole number of 0 or more/);
    const config = join(kept, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "data", draftMaxAgeDays: 7 } }));
    const check = run(["check-config", "--config", config]);
    assert.equal(check.status, 1, check.stdout);
    assert.match(factsOf(check.stdout), /PROBLEM: output\.draftMaxAgeDays in a directory that holds the configuration or a source, template or token file; give the reports a directory of their own -> the server does not start/);
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "data", draftMaxAgeDays: 7 }, baseDir: kept }), /output\.dir: is the configuration's directory or holds a source, template or token file, which output\.draftMaxAgeDays could delete/);
});

test("the file count holds when many reports are written at once", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxFiles: 5 }, rest: { concurrency: 64, rateLimit: { perMinute: 6000, burst: 100 } }, baseDir: dir });
    try {
        const all = await Promise.all(Array.from({ length: 40 }, () => call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } })));
        assert.deepEqual(all.map((r) => r.status).filter((s) => s !== 200), []);
        assert.equal(reports(out).length, 5);
    } finally {
        await server.close();
    }
});

test("output.maxMb: the oldest reports go until the new one fits; a directory of the operator's own files is never cleaned", async () => {
    const dir = workspace();
    const out = join(dir, "out");
    const half = 600 * 1024;
    place(out, [["a.pivotkit-out.xlsx", half, 300], ["b.pivotkit-out.xlsx", half, 200]]);
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxMb: 1 }, baseDir: dir });
    try {
        const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.deepEqual(reports(out).sort(), [res.data.output.name, "b.pivotkit-out.xlsx"].sort());
        assert.ok(reports(out).reduce((sum, n) => sum + statSync(join(out, n)).size, 0) <= 1_048_576);
    } finally {
        await server.close();
    }
    // the source lies in the output directory: nothing is deleted there, a full one refuses
    place(join(dir, "data"), [["old.pivotkit-out.csv", 10, 300]]);
    const shared = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "data", maxFiles: 1 }, baseDir: dir });
    try {
        assert.ok(shared.log.some((l) => l.event === "warning" && /output\.dir/.test(l.message) && /not deleted|never deleted/.test(l.message)), JSON.stringify(shared.log));
        const res = await call(`${shared.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(res.status, 409);
        assert.equal(res.data.code, "NO_OUTPUT");
        assert.match(res.data.detail, /output\.maxFiles/);
        assert.deepEqual(readdirSync(join(dir, "data")).sort(), ["old.pivotkit-out.csv", "sales.csv"]);
    } finally {
        await shared.close();
    }
});

test("an output directory on a read-only file system (a container's --read-only root without a volume): the start, a report and check-config say to mount a volume", async () => {
    const { outputMeans } = await import("../src/context.js");
    const { outputErrorOf } = await import("../src/output.js");
    const { checkConfig } = await import("pivotkit-server");
    const { constants } = await import("node:fs");
    const { access } = outputMeans;
    const dir = workspace();
    outputMeans.access = async (path, mode) => (mode & constants.W_OK ? Promise.reject(Object.assign(new Error("read-only file system"), { code: "EROFS" })) : access(path, mode));
    try {
        const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir });
        await server.close();
        assert.ok(server.log.some((l) => l.event === "warning" && /output\.dir is on a read-only file system \(for example a container started with --read-only/.test(l.message) && /mount a writable volume at/.test(l.message)), JSON.stringify(server.log.map((l) => l.message)));
        const result = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir }, { http: true, env: {} });
        assert.match(factsOf(result.text), /PROBLEM: output\.dir is on a read-only file system .*mount a writable volume/);
    } finally {
        outputMeans.access = access;
    }
    // a report's answer when a write meets the read-only file system
    assert.match(outputErrorOf(Object.assign(new Error("x"), { code: "EROFS" })).message, /the output directory is on a read-only file system; the operator must mount a writable volume there \(output\.dir\)/);
    assert.match(outputErrorOf(Object.assign(new Error("x"), { code: "EACCES" })).message, /not writable by the server's user/);
});

test("an output directory the server cannot write: a warning at start, 409 NO_OUTPUT with a hint, a problem in check-config", { skip: process.getuid?.() === 0 ? "root writes anywhere" : process.platform === "win32" ? "POSIX modes" : false }, async () => {
    const dir = workspace();
    const out = join(dir, "out");
    chmodSync(out, 0o555);
    try {
        const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir });
        try {
            assert.ok(server.log.some((l) => l.event === "warning" && /output\.dir/.test(l.message) && /not writable/.test(l.message)), JSON.stringify(server.log));
            const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION } });
            assert.equal(res.status, 409, JSON.stringify(res.data));
            assert.equal(res.data.code, "NO_OUTPUT");
            assert.match(res.data.detail, /not writable by the server's user/);
        } finally {
            await server.close();
        }
        const config = join(dir, "pivotkit.json");
        writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" } }));
        const check = run(["check-config", "--config", config]);
        assert.equal(check.status, 1, check.stdout);
        const said = factsOf(check.stdout);
        assert.match(said, /^PROBLEM: output\.dir is not writable by the user \d+ the server runs as -> the server starts; every report fails with NO_OUTPUT$/m);
        assert.match(said, /^pivotkit-server: the server starts, but not everything will work\.\n1 problem, /);
    } finally {
        chmodSync(out, 0o755);
    }
});

test("output.maxAgeDays never cleans a directory of the operator's own files: check-config names it, a context held to it deletes nothing", async () => {
    const dir = workspace();
    place(join(dir, "data"), [["old.pivotkit-out.csv", 10, 5 * 86_400]]);
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "data", maxAgeDays: 1 } }));
    const check = run(["check-config", "--config", config]);
    assert.equal(check.status, 1, check.stdout);
    assert.match(factsOf(check.stdout), /PROBLEM: output\.maxAgeDays in a directory that holds the configuration or a source, template or token file; give the reports a directory of their own -> the server does not start/);
    assert.doesNotMatch(check.stdout, /older than 1 days are deleted/);
    // createContext refuses this; a context built another way is held to the same rule
    await prune({ output: { dir: join(dir, "data"), maxAgeDays: 1, cleanUp: false } });
    assert.deepEqual(readdirSync(join(dir, "data")).sort(), ["old.pivotkit-out.csv", "sales.csv"]);
    await prune({ output: { dir: join(dir, "data"), maxAgeDays: 1, cleanUp: true } });
    assert.deepEqual(readdirSync(join(dir, "data")), ["sales.csv"]);
});

test("check-config warns of a policy rule that matches no column and prints the data's spelling", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({
        sources: { sales: { file: "data/sales.csv", policy: { fields: { region: "show", Customr: "hide" } } } },
        policy: { fields: { PRODUCT: "show", Margin: "hide" }, profiles: { export: { fields: { customer: "show" } } } },
        output: { dir: "out" }
    }));
    const res = run(["check-config", "--config", config]);
    assert.equal(res.status, 0, res.stdout);
    const said = factsOf(res.stdout);
    assert.match(said, /\n {4}policy: summary by default; Product show, Margin hide, Region show, Customr hide\n/);
    assert.match(said, /WARNING \(Sources\): sources\.sales\.policy\.fields\.Customr: no column of sales\.csv has this name; did you mean "Customer"\?/);
    assert.match(said, /WARNING \(Sources\): policy\.fields\.Margin: no column of any source has this name/);
    assert.match(said, /\nProfile export:\n {2}policy: as each source by default; Customer show\n {2}sales: [^\n]*Customer show/);
    assert.ok(!/warning: .*PRODUCT|warning: .*region/i.test(said), "a rule that matches by another case is no warning");
});

test("check-config prints a source's rules in its own spelling, never in another source's", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({
        sources: {
            // the columns of an HTTP source are known only after a load: its rules as written
            orders: { http: { url: "https://backend.example.com/v1/orders.csv", format: "csv" }, policy: { default: "hide", fields: { order: "show", customer: "show", Amount: "summary" } } },
            sales: { file: "data/sales.csv", policy: { fields: { Customer: "values" } } },
            other: { http: { url: "https://backend.example.com/v1/other.csv", format: "csv" }, policy: { fields: { CUSTOMER: "hide" } } }
        },
        policy: { fields: { amount: "show" } },
        output: { dir: "out" }
    }));
    const res = run(["check-config", "--config", config]);
    const said = factsOf(res.stdout);
    assert.match(said, /\n {4}policy: hide by default; Amount summary, order show, customer show\n/, said);
    assert.match(said, /\n {4}policy: summary by default; amount show, Customer values\n/, said);
    assert.match(said, /\n {4}policy: summary by default; amount show, CUSTOMER hide\n/, said);
});

test("a missing output directory is created at start (0700, or 0755 narrowed by the umask where a web server serves it) and said once in the log", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "reports/new" }, baseDir: dir });
    try {
        const info = statSync(join(dir, "reports", "new"));
        assert.ok(info.isDirectory());
        if (process.platform !== "win32") {
            assert.equal(info.mode & 0o777, 0o700, "reports may hold what a model may not see: the server's user only");
        }
        const said = server.log.filter((l) => l.event === "warning" && /output directory/.test(l.message) && /created/.test(l.message));
        assert.equal(said.length, 1, JSON.stringify(server.log));
        assert.ok(!JSON.stringify(server.log).includes(dir), "no path in the log");
        const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
    } finally {
        await server.close();
    }
    // a served directory is read by the web server's user: 0755, which the umask can only narrow,
    // so even under umask 000 nobody else may write it
    const before = process.umask(0);
    try {
        const served = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "served", baseUrl: "https://files.example.com/r/" }, baseDir: dir });
        await served.close();
    } finally {
        process.umask(before);
    }
    if (process.platform !== "win32") {
        assert.equal(statSync(join(dir, "served")).mode & 0o777, 0o755);
    }
    // an existing directory is left as it is, and nothing is said
    const again = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "reports/new" }, baseDir: dir });
    try {
        assert.ok(!again.log.some((l) => /created/.test(String(l.message))));
    } finally {
        await again.close();
    }
});

test("output.create: false keeps a missing directory an error; one that cannot be created is an error with the reason", async () => {
    const dir = workspace();
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "missing", create: false }, baseDir: dir }), /output\.dir: not found.*output\.create/);
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "missing", create: "yes" }, baseDir: dir }), /output\.create/);
    if (process.getuid?.() !== 0 && process.platform !== "win32") {
        chmodSync(join(dir, "data"), 0o555);
        try {
            await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "data/out" }, baseDir: dir }), /output\.dir: cannot be created.*permission denied/);
        } finally {
            chmodSync(join(dir, "data"), 0o755);
        }
    }
});

test("a symbolic link to nothing as output.dir is a problem in check-config and refused at start; a refused start makes no directory", { skip: process.platform === "win32" ? "symbolic links need rights on Windows" : false }, async () => {
    const dir = workspace();
    symlinkSync(join(dir, "gone"), join(dir, "dangling"));
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "dangling" } }));
    const check = run(["check-config", "--config", config]);
    assert.equal(check.status, 1, check.stdout);
    assert.match(factsOf(check.stdout), /PROBLEM: output\.dir: a symbolic link to nothing \(its target does not exist\) -> the server does not start/);
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "dangling" }, baseDir: dir }), /output\.dir: a symbolic link to nothing/);
    // inside an allowed directory: refused before anything is made
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, files: { allowDirs: ["data"] }, output: { dir: "data/new/out" }, baseDir: dir }), /files\.allowDirs/);
    assert.ok(!existsSync(join(dir, "data", "new")), "no directory left behind");
});

test("check-config refuses what serve refuses: a missing output.dir inside an allowed directory, one below a link to nothing", { skip: process.platform === "win32" ? "symbolic links need rights on Windows" : false }, async () => {
    const dir = workspace();
    symlinkSync(join(dir, "gone"), join(dir, "link"));
    const config = join(dir, "pivotkit.json");
    const check = (options) => {
        writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, ...options }));
        return run(["check-config", "--config", config]);
    };
    const inside = check({ files: { allowDirs: ["data"] }, output: { dir: "data/new/out" } });
    assert.equal(inside.status, 1, inside.stdout);
    assert.match(factsOf(inside.stdout), /PROBLEM: output\.dir: lies inside a directory of files\.allowDirs/);
    const below = check({ output: { dir: "link/out" } });
    assert.equal(below.status, 1, below.stdout);
    assert.match(factsOf(below.stdout), /PROBLEM: output\.dir: cannot be created: a symbolic link in the path points to nothing -> the server does not start/);
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "link/out" }, baseDir: dir }), /output\.dir: cannot be created: a symbolic link in the path points to nothing/);
});

test("check-config says whether the output directory exists, will be created, or cannot be", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    const check = (output) => {
        writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output }));
        return run(["check-config", "--config", config]);
    };
    const created = check({ dir: "later/out" });
    assert.equal(created.status, 0, created.stdout);
    assert.match(factsOf(created.stdout), /\nOutput: later\/out\n {2}\S+[\\/]later[\\/]out\n {2}will be created at start\n/);
    const off = check({ dir: "later/out", create: false });
    assert.equal(off.status, 1, off.stdout);
    assert.match(factsOf(off.stdout), /PROBLEM: output\.dir: not found \(create it first, or leave output\.create on\) -> the server does not start/);
    if (process.getuid?.() !== 0 && process.platform !== "win32") {
        chmodSync(join(dir, "data"), 0o555);
        try {
            const denied = check({ dir: "data/out" });
            assert.equal(denied.status, 1, denied.stdout);
            assert.match(factsOf(denied.stdout), /PROBLEM: output\.dir: cannot be created: permission denied for the user \d+/);
        } finally {
            chmodSync(join(dir, "data"), 0o755);
        }
    }
});

test("a name longer than the file system allows: check-config and serve both refuse it with the reason (#365)", { skip: process.platform === "win32" ? "Windows reports other codes for long names" : false }, async () => {
    const dir = workspace();
    const long = "x".repeat(300);
    const config = join(dir, "pivotkit.json");
    for (const path of [long, `${long}/out`]) {
        writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: path } }));
        const check = run(["check-config", "--config", config]);
        assert.equal(check.status, 1, check.stdout);
        assert.match(factsOf(check.stdout), /PROBLEM: output\.dir: cannot be created: a name in the path is longer than the file system allows -> the server does not start/);
        await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: path }, baseDir: dir }), /^ConfigError: output\.dir: cannot be created: a name in the path is longer than the file system allows$/);
    }
    assert.deepEqual(readdirSync(dir).sort(), ["data", "out", "pivotkit.json"], "a refused start makes nothing");
});

test("a symbolic link loop in output.dir is named as one, in check-config and at start (#365)", { skip: process.platform === "win32" ? "symbolic links need rights on Windows" : false }, async () => {
    const dir = workspace();
    symlinkSync(join(dir, "loop"), join(dir, "loop"));
    const config = join(dir, "pivotkit.json");
    for (const path of ["loop", "loop/out"]) {
        writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: path } }));
        const check = run(["check-config", "--config", config]);
        assert.equal(check.status, 1, check.stdout);
        assert.match(factsOf(check.stdout), /PROBLEM: output\.dir: cannot be created: a symbolic link in the path leads in a loop -> the server does not start/);
        await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: path }, baseDir: dir }), /^ConfigError: output\.dir: cannot be created: a symbolic link in the path leads in a loop$/);
    }
});

test("whyNot: words for every code a directory start meets, a neutral fallback that keeps the code (#365)", () => {
    assert.equal(whyNot("ELOOP"), "a symbolic link in the path leads in a loop");
    assert.equal(whyNot("ENAMETOOLONG"), "a name in the path is longer than the file system allows");
    assert.equal(whyNot("ENOTDIR"), "a part of the path is a file");
    assert.equal(whyNot("EEXIST"), "something that is not a directory already exists at the path");
    assert.equal(whyNot("EIO"), "the file system refused it (EIO)");
    assert.equal(whyNot(undefined), "the file system refused it (unknown error)");
});

test("check-config and serve give the same reason for an output.dir stat refuses: a file in the path, no permission; examined, not created, with output.create false (#365)", { skip: process.getuid?.() === 0 || process.platform === "win32" ? "root reads anywhere; POSIX modes" : false }, async () => {
    const dir = workspace();
    mkdirSync(join(dir, "locked"), { mode: 0o600 });
    const config = join(dir, "pivotkit.json");
    const both = async (output, reason) => {
        writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output }));
        const check = run(["check-config", "--config", config]);
        assert.equal(check.status, 1, check.stdout);
        assert.ok(factsOf(check.stdout).split("\n").includes(`PROBLEM: output.dir: ${reason} -> the server does not start`), check.stdout);
        await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output, baseDir: dir }), (e) => e.message === `output.dir: ${reason}`);
    };
    try {
        await both({ dir: "data/sales.csv/out" }, "cannot be created: a part of the path is a file");
        await both({ dir: "locked/out" }, `cannot be created: permission denied for the user ${process.getuid?.()} the server runs as`);
        await both({ dir: "locked/out", create: false }, `cannot be examined: permission denied for the user ${process.getuid?.()} the server runs as`);
        await both({ dir: "x".repeat(300), create: false }, "cannot be examined: a name in the path is longer than the file system allows");
    } finally {
        chmodSync(join(dir, "locked"), 0o755);
    }
});

test("an output.dir inside an allowed directory: the start's error and check-config's PROBLEM line say the same reason, word for word", async () => {
    const dir = workspace();
    const reason = "lies inside a directory of files.allowDirs (or holds one): the model could read the reports it was not shown; use a directory outside them";
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, files: { allowDirs: ["data"] }, output: { dir: "data/out" } }));
    const check = run(["check-config", "--config", config]);
    assert.equal(check.status, 1, check.stdout);
    assert.ok(factsOf(check.stdout).split("\n").includes(`PROBLEM: output.dir: ${reason} -> the server does not start`), check.stdout);
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, files: { allowDirs: ["data"] }, output: { dir: "data/out" }, baseDir: dir }), (e) => e.message === `output.dir: ${reason}`);
});
