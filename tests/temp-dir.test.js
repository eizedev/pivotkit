// tempDir()'s directories are removed when the process ends, however it ends: at its end, after a
// throw, after exit() and after SIGTERM, also with a SIGTERM handler of its own (#463).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { basename } from "node:path";
import { leftovers } from "../scripts/test-run.js";
import { GRACE_MS, HOST, RUN_ENV } from "./temp-dir.js";
import { NO_SIGTERM, maker, newRun, runMaker, started } from "./temp-dir-children.js";

test("tempDir's directories carry the run's id and are gone when the process ends: at its end, after a throw, after exit()", () => {
    for (const then of ["", "throw new Error('a failing test file');", "process.exit(3);"]) {
        const run = newRun();
        const child = runMaker(then, run);
        const dirs = JSON.parse(child.stdout.trim().split("\n")[0]);
        assert.equal(dirs.length, 2, child.stderr);
        // the owner's process id before the random part: a later process removes them if it died
        assert.match(basename(dirs[0]), new RegExp(`^pivotkit-${run}-server-h${HOST}p${child.pid}-\\w{6}$`));
        assert.match(basename(dirs[1]), new RegExp(`^pivotkit-${run}-probe-h${HOST}p${child.pid}-\\w{6}$`));
        for (const dir of dirs) assert.equal(existsSync(dir), false, `${then || "the end"}: ${dir} is still there`);
        assert.deepEqual(leftovers(run), [], then);
    }
});

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
        assert.ok(Date.now() - sent >= GRACE_MS - 100, `ended after ${Date.now() - sent} ms`); // wall time: a timer's least delay
        for (const dir of dirs) assert.equal(existsSync(dir), false, dir);
    } finally {
        clearTimeout(deadline);
        child.kill("SIGKILL");
        for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    }
});
