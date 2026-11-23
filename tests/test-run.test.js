// scripts/test-run.js runs a test command, hands signals on to it and fails a run that leaves one of
// its own temporary directories behind, without counting another run's (#463, #526).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forwarded, leftovers } from "../scripts/test-run.js";
import { leftBehind, newNames } from "../scripts/temp-dirs.js";
import { HOST, ROOT_ENV, RUN_ENV, tempDir } from "./temp-dir.js";
import { HELPER, NO_SIGTERM, TEST_RUN, kill, maker, newRun, started } from "./temp-dir-children.js";

test("a test run hands SIGINT and SIGTERM on to its command, then checks for leftovers", { skip: NO_SIGTERM, timeout: 30_000 }, async () => {
    for (const signal of ["SIGTERM", "SIGINT"]) {
        const run = newRun();
        // a command that leaves a directory behind and stops on the signal with an exit code of its own
        const command = `
            const { mkdtempSync } = require("node:fs");
            const { join } = require("node:path");
            const { tmpdir } = require("node:os");
            mkdtempSync(join(tmpdir(), "pivotkit-" + process.env.${RUN_ENV} + "-left-"));
            process.on("${signal}", () => { console.log("stopping"); process.exit(5); });
            console.log(process.pid);
            setInterval(() => {}, 1000);
        `;
        const { child, first: pid, output, ended, closed } = await started([TEST_RUN, "node", "-e", command], { ...process.env, [RUN_ENV]: run });
        try {
            // the signal to the wrapper only, as a CI runner or a supervisor sends it
            child.kill(signal);
            const result = await ended;
            // a command the wrapper failed to stop holds the output open: stop it before reading it
            kill(pid);
            await closed;
            assert.deepEqual(result, { code: 5, signal: null }, `${signal}: ${output()}`);
            assert.match(output(), /^stopping$/m, signal);
            assert.match(output(), new RegExp(`left 1 temporary directory of run ${run} behind`), signal);
            assert.deepEqual(leftovers(run), [], signal);
        } finally {
            kill(pid);
            for (const dir of leftovers(run)) rmSync(dir, { recursive: true, force: true });
        }
    }
});

test("a test run hands SIGINT on only without a terminal, whose Ctrl-C reaches the command itself; SIGTERM always", () => {
    assert.deepEqual(forwarded(true), ["SIGTERM"]);
    assert.deepEqual(forwarded(false), ["SIGINT", "SIGTERM"]);
    assert.deepEqual(forwarded(undefined), ["SIGINT", "SIGTERM"]);
});

test("a test run whose command ends on a signal fails, and a command it cannot start fails after the check", { skip: NO_SIGTERM, timeout: 30_000 }, async () => {
    const run = newRun();
    const { child, first: pid, ended, closed, output } = await started([TEST_RUN, "node", "-e", "console.log(process.pid); setInterval(() => {}, 1000);"], { ...process.env, [RUN_ENV]: run });
    child.kill("SIGTERM");
    const result = await ended;
    kill(pid);
    await closed;
    assert.deepEqual(result, { code: 1, signal: null }, output());
    // a directory of the run from before the command, which the check still names and removes
    const early = mkdtempSync(join(tmpdir(), `pivotkit-${run}-early-`));
    try {
        const missing = spawnSync(process.execPath, [TEST_RUN, "pivotkit-no-such-command"], { encoding: "utf8", env: { ...process.env, [RUN_ENV]: run } });
        assert.notEqual(missing.status, 0);
        assert.match(missing.stderr, /ENOENT/);
        assert.match(missing.stderr, new RegExp(`left 1 temporary directory of run ${run} behind`));
        assert.equal(existsSync(early), false);
    } finally {
        rmSync(early, { recursive: true, force: true });
    }
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

test("CI's check names the pivotkit-* directories that are new after the tests, and those a sweep removed meanwhile", () => {
    const before = ["pivotkit-a1-server-p10-abcdef", "pivotkit-cli-p11-ghijkl"];
    assert.deepEqual(newNames(before, ["pivotkit-cli-p11-ghijkl"]), []);
    assert.deepEqual(newNames(before, [...before, "pivotkit-mcp-p12-mnopqr"]), ["pivotkit-mcp-p12-mnopqr"]);
    const log = "pivotkit-old-p9-aaaaaa\n";
    assert.deepEqual(leftBehind({ names: before, swept: log.length }, { names: before, swept: log }), []);
    assert.deepEqual(leftBehind({ names: before, swept: log.length }, { names: before, swept: `${log}pivotkit-cli-p13-bbbbbb\n` }), ["pivotkit-cli-p13-bbbbbb (removed by a sweep: its process was killed)"]);
});

test("a test run fails when a sweep removed a directory of its own that a killed process left", () => {
    const root = tempDir("sweep-run");
    const run = newRun();
    const command = `
        import { spawn } from "node:child_process";
        import { tempDir } from ${JSON.stringify(HELPER)};
        const child = spawn(process.execPath, ["--input-type=module", "-e", ${JSON.stringify(`import { tempDir } from ${JSON.stringify(HELPER)}; console.log(tempDir("killed")); setInterval(() => {}, 1000);`)}], { stdio: ["ignore", "pipe", "inherit"] });
        child.stdout.once("data", () => {
            child.once("exit", () => tempDir("sweeper"));
            child.kill("SIGKILL");
        });
    `;
    const result = spawnSync(process.execPath, [TEST_RUN, "node", "--input-type=module", "-e", command], { encoding: "utf8", env: { ...process.env, [RUN_ENV]: run, [ROOT_ENV]: root } });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`A sweep removed 1 temporary directory of run ${run} that a killed process left behind:\\n {2}pivotkit-${run}-killed-h${HOST}p\\d+-\\w{6}\\n`));
});
