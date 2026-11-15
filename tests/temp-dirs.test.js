// Temporary directories of the tests go again (#463): tempDir() of tests/temp-dir.js is the one way
// to make one, its directories are removed when the process ends however it ends, and
// scripts/test-run.js fails a run that leaves one of its own behind, without counting another run's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { leftovers } from "../scripts/test-run.js";
import { root, sourceFiles } from "./source-files.js";
import { RUN_ENV } from "./temp-dir.js";

const HELPER = fileURLToPath(new URL("./temp-dir.js", import.meta.url));
const TEST_RUN = fileURLToPath(new URL("../scripts/test-run.js", import.meta.url));

/** A run id of its own, so this test counts only what its children make. */
const newRun = () => randomBytes(6).toString("hex");

/**
 * A Node process that makes two directories with tempDir() (one with a file in it), prints their
 * paths and then does `then`.
 * @param {string} then
 */
const maker = (then) => `
    import { writeFileSync } from "node:fs";
    import { join } from "node:path";
    import { tempDir } from ${JSON.stringify(HELPER)};
    const a = tempDir("pivotkit-server-");
    writeFileSync(join(a, "out.csv"), "a,b\\n");
    console.log(JSON.stringify([a, tempDir("probe")]));
    ${then}
`;

const runMaker = (then, run) => spawnSync(process.execPath, ["--input-type=module", "-e", maker(then)], { encoding: "utf8", env: { ...process.env, [RUN_ENV]: run } });

test("no file but tests/temp-dir.js makes a temporary directory: every one goes through tempDir()", () => {
    const own = [];
    for (const file of sourceFiles()) {
        const name = relative(root, file).split("\\").join("/");
        // the packages' own code is not test code; the helper and this file make them, the run's check
        // only lists the temporary directory
        if (/^packages\/[^/]+\/(src|bin)\//.test(name) || ["tests/temp-dir.js", "tests/temp-dirs.test.js", "scripts/test-run.js"].includes(name)) continue;
        if (/\bmkdtemp(Sync)?\b|\btmpdir\(/.test(readFileSync(file, "utf8"))) own.push(name);
    }
    assert.deepEqual(own, [], "make a temporary directory with tempDir() of tests/temp-dir.js: it is removed when the process ends");
});

test("tempDir's directories carry the run's id and are gone when the process ends: at its end, after a throw, after exit()", () => {
    for (const then of ["", "throw new Error('a failing test file');", "process.exit(3);"]) {
        const run = newRun();
        const child = runMaker(then, run);
        const dirs = JSON.parse(child.stdout.trim().split("\n")[0]);
        assert.equal(dirs.length, 2, child.stderr);
        assert.match(basename(dirs[0]), new RegExp(`^pivotkit-${run}-server-\\w{6}$`));
        assert.match(basename(dirs[1]), new RegExp(`^pivotkit-${run}-probe-\\w{6}$`));
        for (const dir of dirs) assert.equal(existsSync(dir), false, `${then || "the end"}: ${dir} is still there`);
        assert.deepEqual(leftovers(run), [], then);
    }
});

test("tempDir's directories are gone after SIGTERM, as a spawning test's timeout sends it", { skip: process.platform === "win32" && "Windows has no SIGTERM to catch: a killed process ends at once" }, async () => {
    const run = newRun();
    const child = spawn(process.execPath, ["--input-type=module", "-e", maker("setInterval(() => {}, 1000);")], { env: { ...process.env, [RUN_ENV]: run }, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    const dirs = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.stdout.on("data", (chunk) => {
            out += chunk;
            if (out.includes("\n")) resolve(JSON.parse(out.split("\n")[0]));
        });
    });
    assert.ok(dirs.every((dir) => existsSync(dir)));
    const ended = new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal })));
    child.kill("SIGTERM");
    assert.deepEqual(await ended, { code: 128 + 15, signal: null });
    for (const dir of dirs) assert.equal(existsSync(dir), false, dir);
});

test("a test run fails when it leaves a directory of its own behind, names and removes it, and counts no other run's", () => {
    const run = newRun();
    const other = newRun();
    // a child that leaves one directory of this run and one of another run behind (made without tempDir)
    const leave = `
        const { mkdtempSync } = require("node:fs");
        const { join } = require("node:path");
        const { tmpdir } = require("node:os");
        mkdtempSync(join(tmpdir(), "pivotkit-" + process.env.${RUN_ENV} + "-left-"));
        console.log(mkdtempSync(join(tmpdir(), "pivotkit-${other}-busy-")));
    `;
    const failing = spawnSync(process.execPath, [TEST_RUN, "node", "-e", leave], { encoding: "utf8", env: { ...process.env, [RUN_ENV]: run } });
    const otherDir = failing.stdout.trim();
    try {
        assert.equal(failing.status, 1, failing.stderr);
        assert.match(failing.stderr, new RegExp(`left 1 temporary directory of run ${run} behind`));
        assert.match(failing.stderr, new RegExp(`pivotkit-${run}-left-\\w{6}`));
        assert.deepEqual(leftovers(run), []);
        // another run's directory is neither counted nor removed
        assert.equal(existsSync(otherDir), true);
        const named = failing.stderr.split("\n").filter((line) => line.startsWith("  "));
        assert.equal(named.length, 1, failing.stderr);
        assert.doesNotMatch(named[0], new RegExp(other));
    } finally {
        if (otherDir) rmSync(otherDir, { recursive: true, force: true });
    }
});

test("a test run passes the command's exit code on, and its run id to the command, kept from an outer run", () => {
    const run = newRun();
    const clean = spawnSync(process.execPath, [TEST_RUN, "node", "--input-type=module", "-e", maker("")], { encoding: "utf8", env: { ...process.env, [RUN_ENV]: run } });
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, new RegExp(`pivotkit-${run}-server-`));
    const failed = spawnSync(process.execPath, [TEST_RUN, "node", "-e", "process.exit(7)"], { encoding: "utf8" });
    assert.equal(failed.status, 7, failed.stderr);
    // without an outer run, the command gets an id of its own
    const fresh = spawnSync(process.execPath, [TEST_RUN, "node", "-e", `console.log(process.env.${RUN_ENV})`], { encoding: "utf8", env: { ...process.env, [RUN_ENV]: "" } });
    assert.match(fresh.stdout.trim(), /^[0-9a-f]{12}$/);
});
