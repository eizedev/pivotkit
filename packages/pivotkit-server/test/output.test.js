// The output directory as callers fill it, REST and MCP alike (both write through present()): a
// caller that renders without pause, renders at once, a directory the server cannot write, a
// directory that holds the operator's own files; and what check-config says about the directory and
// the policy before the first request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
    // the operator's own files, a report-like one among them, years old: neither counted nor deleted
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
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxFiles: 3 }, baseDir: dir });
    try {
        for (let i = 0; i < 3; i++) {
            const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
            assert.equal(res.status, 200, JSON.stringify(res.data));
        }
        assert.equal(reports(out).length, 3);
        assert.ok(readdirSync(out).includes("Weekly.pivotkit-out.report.json") && readdirSync(out).includes("Monthly.pivotkit-out.report.json"));
        const draft = await call(`${server.api}/schedules/draft`, { body: { source: "sales", view: BY_REGION, name: "Daily", formats: ["xlsx"], every: { unit: "day", at: "07:00" }, recipients: ["Sales team"] } });
        // a draft takes the place of the last report; then only drafts are left
        assert.equal(draft.status, 200, JSON.stringify(draft.data));
        const full = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(full.status, 409, JSON.stringify(full.data));
        assert.equal(full.data.code, "NO_OUTPUT");
        assert.match(full.data.detail, /schedule drafts awaiting approval/);
        assert.equal(reports(out).filter((n) => n.endsWith(".report.json")).length, 3);
    } finally {
        await server.close();
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
