// Temporary directories of the tests go again (#463): tempDir() of tests/temp-dir.js is the one way
// to make one, its directories are removed when the process ends however it ends, and
// scripts/test-run.js fails a run that leaves one of its own behind, without counting another run's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { forwarded, leftovers } from "../scripts/test-run.js";
import { newNames } from "../scripts/temp-dirs.js";
import { root, sourceFiles } from "./source-files.js";
import { GRACE_MS, RUN_ENV } from "./temp-dir.js";

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

/**
 * Whether a source makes or finds a temporary directory itself: mkdtemp, os.tmpdir() (called, taken
 * from a namespace, imported or destructured, also renamed), the TMPDIR/TEMP/TMP variables or a
 * "/tmp/" path. A word in a string or a key, and comments, do not count.
 * @param {string} source
 */
function makesTempDir(source) {
    // strings first, kept as they are, so a "/*" or "//" inside one starts no comment
    const code = source.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match, literal) => literal ?? "");
    // a regular expression literal with a quote in it can still look like the start of a string here
    return /\bmkdtemp(Sync)?\b|\btmpdir\s*\(|\.\s*tmpdir\b|\{[^}]*\btmpdir\b[^}]*\}\s*(from\b|=\s*require\b)|\btmpdir\s+as\b|\benv\s*(\.\s*|\[\s*["'`])(TMPDIR|TEMP|TMP)\b|["'`]\/tmp\//.test(code);
}

test("the check finds every way to make or find a temporary directory, and not a comment about one", () => {
    const found = [
        'import { mkdtempSync } from "node:fs";',
        "await mkdtemp(prefix);",
        "const dir = tmpdir();",
        'import { tmpdir as t } from "node:os";',
        "join(os.tmpdir (), name)",
        'const { tmpdir: where } = require("os");',
        "const base = process.env.TMPDIR;",
        'const base = process.env["TMP"] ?? process.env.TEMP;',
        'const dir = "/tmp/pivotkit-x";',
        "const dir = `/tmp/${name}`;",
        // a "/*" inside a string starts no comment
        'const glob = "tests/*.test.js";\nmkdtempSync(prefix);\n/** a doc comment */',
        "const url = 'http://example.org'; const dir = tmpdir();",
    ];
    for (const source of found) assert.equal(makesTempDir(source), true, source);
    const clean = [
        "// tempDir() instead of os.tmpdir() or mkdtempSync",
        "/* not process.env.TMPDIR, not \"/tmp\" */ const dir = tempDir();",
        'const url = "http://localhost/tmp";',
        "const tmpdirLabel = tempDir(\"probe\");",
        'const page = "https://example.org/a"; // a page',
        // a word in a string or a key is no temporary directory
        'const hint = "set TMPDIR or tmpdir to change it";',
        "const options = { tmpdir: false, label: \"/tmp\" };",
    ];
    for (const source of clean) assert.equal(makesTempDir(source), false, source);
});

test("the checks over the repository's sources cover .cjs, .jsx, .ts and .tsx files as well", () => {
    const names = sourceFiles().map((file) => relative(root, file).split("\\").join("/"));
    for (const name of ["tests/browser/pages/host.jsx", "bench/browser/page.jsx", "packages/pivotkit-server/test/types/consumer.ts"]) assert.ok(names.includes(name), name);
    assert.ok(names.every((name) => /\.(c|m)?(j|t)sx?$/.test(name)));
});

test("no file but tests/temp-dir.js makes a temporary directory: every one goes through tempDir()", () => {
    const own = [];
    for (const file of sourceFiles()) {
        const name = relative(root, file).split("\\").join("/");
        // the packages' own code is not test code; the helper and this file make them, the run's check
        // only lists the temporary directory
        if (/^packages\/[^/]+\/(src|bin)\//.test(name) || ["tests/temp-dir.js", "tests/temp-dirs.test.js", "scripts/test-run.js"].includes(name)) continue;
        if (makesTempDir(readFileSync(file, "utf8"))) own.push(name);
    }
    assert.deepEqual(own, [], "make a temporary directory with tempDir() of tests/temp-dir.js: it is removed when the process ends");
});

test("tempDir's directories carry the run's id and are gone when the process ends: at its end, after a throw, after exit()", () => {
    for (const then of ["", "throw new Error('a failing test file');", "process.exit(3);"]) {
        const run = newRun();
        const child = runMaker(then, run);
        const dirs = JSON.parse(child.stdout.trim().split("\n")[0]);
        assert.equal(dirs.length, 2, child.stderr);
        // the owner's process id before the random part: a later process removes them if it died
        assert.match(basename(dirs[0]), new RegExp(`^pivotkit-${run}-server-p${child.pid}-\\w{6}$`));
        assert.match(basename(dirs[1]), new RegExp(`^pivotkit-${run}-probe-p${child.pid}-\\w{6}$`));
        for (const dir of dirs) assert.equal(existsSync(dir), false, `${then || "the end"}: ${dir} is still there`);
        assert.deepEqual(leftovers(run), [], then);
    }
});

const NO_SIGTERM = process.platform === "win32" && "Windows has no SIGTERM to catch: a killed process ends at once";

/**
 * Starts a process and waits for the first line it prints, as JSON (its "ready" line).
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * `ended` settles when the process exits, `closed` when its output is complete as well (a process it
 * started and left running can hold that open).
 * @returns {Promise<{ child: import("node:child_process").ChildProcess, first: any, output: () => string, ended: Promise<{ code: number | null, signal: string | null }>, closed: Promise<void> }>}
 */
async function started(args, env) {
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stderr.on("data", (chunk) => (err += chunk));
    const ended = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
    const closed = new Promise((resolve) => child.on("close", () => resolve()));
    const first = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.stdout.on("data", (chunk) => {
            const ready = !out.includes("\n");
            out += chunk;
            if (ready && out.includes("\n")) resolve(JSON.parse(out.split("\n")[0]));
        });
        closed.then(() => reject(new Error(`ended before it was ready: ${out}${err}`)));
    });
    return { child, first, output: () => out + err, ended, closed };
}

/**
 * Ends a process that may already be gone.
 * @param {number} pid
 */
function kill(pid) {
    try {
        process.kill(pid, "SIGKILL");
    } catch {
        // already gone
    }
}

test("tempDir's directories are gone after SIGTERM, as a spawning test's timeout sends it", { skip: NO_SIGTERM, timeout: 30_000 }, async () => {
    const run = newRun();
    const { child, first: dirs, ended } = await started(["--input-type=module", "-e", maker("setInterval(() => {}, 1000);")], { ...process.env, [RUN_ENV]: run });
    assert.ok(dirs.every((dir) => existsSync(dir)));
    child.kill("SIGTERM");
    assert.deepEqual(await ended, { code: 128 + 15, signal: null });
    for (const dir of dirs) assert.equal(existsSync(dir), false, dir);
});

test("a SIGTERM handler of the process's own (a server's graceful stop) runs to its end, before or after the first tempDir()", { skip: NO_SIGTERM, timeout: 30_000 }, async () => {
    for (const order of ["after", "before"]) {
        const run = newRun();
        // the stop takes a moment and still needs the directory, as pivotkit-server's runner closing its server
        const stop = `const stop = () => setTimeout(() => { console.log("stopped " + existsSync(dirs[0])); process.exit(0); }, 50);`;
        const handle = `process.once("SIGTERM", () => stop());`;
        const code = maker(`${order === "after" ? handle : ""} setInterval(() => {}, 1000);`)
            .replace(`import { tempDir }`, `import { existsSync } from "node:fs";\n    ${stop}\n    ${order === "before" ? handle : ""}\n    import { tempDir }`)
            .replace("console.log(JSON.stringify([a, tempDir(\"probe\")]));", "const dirs = [a, tempDir(\"probe\")];\n    console.log(JSON.stringify(dirs));");
        const { child, first: dirs, output, ended, closed } = await started(["--input-type=module", "-e", code], { ...process.env, [RUN_ENV]: run });
        child.kill("SIGTERM");
        const result = await ended;
        await closed;
        assert.deepEqual(result, { code: 0, signal: null }, `${order}: ${output()}`);
        assert.match(output(), /^stopped true$/m, order);
        for (const dir of dirs) assert.equal(existsSync(dir), false, `${order}: ${dir}`);
    }
});

test("a SIGTERM handler that never ends the process: tempDir ends it after a grace period, the directories gone", { skip: NO_SIGTERM, timeout: 30_000 }, async () => {
    const run = newRun();
    const { child, first: dirs, output, ended, closed } = await started(["--input-type=module", "-e", maker(`process.once("SIGTERM", () => console.log("ignored")); setInterval(() => {}, 1000);`)], { ...process.env, [RUN_ENV]: run });
    // a deadline of its own, so a process that does not end fails the test instead of holding it
    let deadline;
    try {
        const sent = Date.now();
        child.kill("SIGTERM");
        const result = await Promise.race([ended, new Promise((resolve) => (deadline = setTimeout(() => resolve({ code: "still running", signal: null }), GRACE_MS * 3)))]);
        child.kill("SIGKILL");
        await closed;
        assert.deepEqual(result, { code: 128 + 15, signal: null }, output());
        assert.match(output(), /^ignored$/m);
        // not at once: the handler had its grace period
        assert.ok(Date.now() - sent >= GRACE_MS - 100, `ended after ${Date.now() - sent} ms`);
        for (const dir of dirs) assert.equal(existsSync(dir), false, dir);
    } finally {
        clearTimeout(deadline);
        child.kill("SIGKILL");
        for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    }
});

// SIGKILL, a crash or a fatal error of V8 end a process without its exit event: its directories stay
// (#526). The next process that makes one removes those of processes that are gone, never one of a
// process still running.
test("a killed process's directories go with the next tempDir() of any process; a running one's stay", { timeout: 30_000 }, async () => {
    const run = newRun();
    const env = { ...process.env, [RUN_ENV]: run };
    const killed = await started(["--input-type=module", "-e", maker("setInterval(() => {}, 1000);")], env);
    const running = await started(["--input-type=module", "-e", maker("setInterval(() => {}, 1000);")], env);
    try {
        killed.child.kill("SIGKILL");
        await killed.ended;
        assert.ok(killed.first.every((dir) => existsSync(dir)), "SIGKILL leaves them");
        // another run's process, without this run's id
        const next = runMaker("", "");
        assert.equal(next.status, 0, next.stderr);
        for (const dir of killed.first) assert.equal(existsSync(dir), false, `${dir} of the killed process is still there`);
        for (const dir of running.first) assert.equal(existsSync(dir), true, `${dir} of the running process was removed`);
    } finally {
        kill(running.child.pid);
        await running.ended;
        for (const dir of [...killed.first, ...running.first]) rmSync(dir, { recursive: true, force: true });
    }
});

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

test("CI's check names the pivotkit-* directories that are new after the tests, not those that went", () => {
    const before = ["pivotkit-a1-server-p10-abcdef", "pivotkit-cli-p11-ghijkl"];
    assert.deepEqual(newNames(before, ["pivotkit-cli-p11-ghijkl"]), []);
    assert.deepEqual(newNames(before, [...before, "pivotkit-mcp-p12-mnopqr"]), ["pivotkit-mcp-p12-mnopqr"]);
});
