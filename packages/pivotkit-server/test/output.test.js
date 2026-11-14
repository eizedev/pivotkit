// The output directory as callers fill it, REST and MCP alike (both write through present()): a
// caller that renders without pause, renders at once, a directory the server cannot write, a
// directory that holds the operator's own files; and what check-config says about the directory and
// the policy before the first request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prune } from "../src/present.js";
import { BIN, BY_REGION, call, restServer, workspace } from "./helpers.js";

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
        assert.match(res.data.detail, /schedule drafts awaiting approval, which are not deleted/);
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
        assert.match(second.data.detail, /output\.maxAgeDays/, "the hint names what the operator can set");
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

test("an output directory the server cannot write: a warning at start, 409 NO_OUTPUT with a hint, a problem in check-config", { skip: process.getuid?.() === 0 ? "root writes anywhere" : false }, async () => {
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
        assert.match(check.stdout, /Output: out .*\(NOT WRITABLE/);
        assert.match(check.stdout, /1 problem: see NOT WRITABLE above/);
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
    assert.match(check.stdout, /PROBLEM: output\.maxAgeDays in a directory that holds the configuration or a source/);
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
    assert.match(res.stdout, /fields: summary by default; Product show, Margin hide, Region show, Customr hide;/);
    assert.match(res.stdout, /warning: sources\.sales\.policy\.fields\.Customr: no column of sales\.csv has this name; did you mean "Customer"\?/);
    assert.match(res.stdout, /warning: policy\.fields\.Margin: no column of any source has this name/);
    assert.match(res.stdout, /Profile export: .*Customer show/);
    assert.ok(!/warning: .*PRODUCT|warning: .*region/i.test(res.stdout), "a rule that matches by another case is no warning");
});

test("a missing output directory is created at start (0700, or the umask's mode where a web server serves it) and said once in the log", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "reports/new" }, baseDir: dir });
    try {
        const info = statSync(join(dir, "reports", "new"));
        assert.ok(info.isDirectory());
        if (process.platform !== "win32") {
            assert.equal(info.mode & 0o777, 0o700, "reports may hold what a model may not see: the server's user only");
        }
        const said = server.log.filter((l) => l.event === "info" && /output directory/.test(l.message) && /created/.test(l.message));
        assert.equal(said.length, 1, JSON.stringify(server.log));
        assert.ok(!JSON.stringify(server.log).includes(dir), "no path in the log");
        const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
    } finally {
        await server.close();
    }
    // a served directory is read by the web server's user: the umask decides, as for any directory
    const served = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "served", baseUrl: "https://files.example.com/r/" }, baseDir: dir });
    await served.close();
    if (process.platform !== "win32") {
        assert.equal(statSync(join(dir, "served")).mode & 0o777, 0o777 & ~process.umask());
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

test("a symbolic link to nothing as output.dir is a problem in check-config and refused at start; a refused start makes no directory", async () => {
    const dir = workspace();
    symlinkSync(join(dir, "gone"), join(dir, "dangling"));
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "dangling" } }));
    const check = run(["check-config", "--config", config]);
    assert.equal(check.status, 1, check.stdout);
    assert.match(check.stdout, /Output: dangling {2}\(NOT FOUND: a symbolic link to nothing\)/);
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "dangling" }, baseDir: dir }), /output\.dir: a symbolic link to nothing/);
    // inside an allowed directory: refused before anything is made
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, files: { allowDirs: ["data"] }, output: { dir: "data/new/out" }, baseDir: dir }), /files\.allowDirs/);
    assert.ok(!existsSync(join(dir, "data", "new")), "no directory left behind");
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
    assert.match(created.stdout, /Output: later\/out {2}\(missing: created at start\)/);
    const off = check({ dir: "later/out", create: false });
    assert.equal(off.status, 1, off.stdout);
    assert.match(off.stdout, /Output: later\/out {2}\(NOT FOUND: create the directory first, or leave output\.create on\)/);
    if (process.getuid?.() !== 0 && process.platform !== "win32") {
        chmodSync(join(dir, "data"), 0o555);
        try {
            const denied = check({ dir: "data/out" });
            assert.equal(denied.status, 1, denied.stdout);
            assert.match(denied.stdout, /Output: data\/out {2}\(NOT FOUND: cannot be created: permission denied for the user \d+/);
        } finally {
            chmodSync(join(dir, "data"), 0o755);
        }
    }
});
