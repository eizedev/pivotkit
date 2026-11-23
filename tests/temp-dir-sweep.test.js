// SIGKILL, a crash or a fatal error of V8 end a process without its exit event: its directories stay
// (#526). The next process that makes one removes those of processes that are gone, never one of a
// process still running.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { HOST, ROOT_ENV, RUN_ENV, SWEPT_LOG, removeOrphans, tempDir, tempDirNames } from "./temp-dir.js";
import { kill, maker, newRun, started } from "./temp-dir-children.js";

test("a killed process's directories go with the next tempDir() of any process on this host, noted; a running one's, another host's and a foreign one stay", { timeout: 30_000 }, async (t) => {
    // a temporary root of this test's own: no other process sweeps there
    const root = tempDir("sweep-root");
    const env = { ...process.env, [RUN_ENV]: newRun(), [ROOT_ENV]: root };
    // a dead process id (no process has it) with another host's mark, and a foreign tool's name
    const others = ["pivotkit-a1-server-h00000000p999999-abcdef", "pivotkit-tool-p999999-abcdef"];
    for (const name of others) mkdirSync(join(root, name));
    const killed = await started(["--input-type=module", "-e", maker("setInterval(() => {}, 1000);")], env);
    // ended even when the second start fails
    t.after(() => kill(killed.child.pid));
    const running = await started(["--input-type=module", "-e", maker("setInterval(() => {}, 1000);")], env);
    try {
        killed.child.kill("SIGKILL");
        await killed.ended;
        // another run's process
        const next = spawnSync(process.execPath, ["--input-type=module", "-e", maker("")], { encoding: "utf8", env: { ...env, [RUN_ENV]: newRun() } });
        assert.equal(next.status, 0, next.stderr);
        const names = killed.first.map((dir) => basename(dir)).sort();
        const said = /^removed 2 temporary directories of ended processes: (.*)$/m.exec(next.stderr)?.[1].split(", ") ?? [];
        assert.deepEqual(said.sort(), names, next.stderr);
        assert.deepEqual(readFileSync(join(root, SWEPT_LOG), "utf8").split("\n").filter(Boolean).sort(), names);
        for (const dir of killed.first) assert.equal(existsSync(dir), false, `${dir} of the killed process is still there`);
        for (const dir of running.first) assert.equal(existsSync(dir), true, `${dir} of the running process was removed`);
        for (const name of others) assert.equal(existsSync(join(root, name)), true, `${name} was removed`);
    } finally {
        kill(running.child.pid);
        await running.ended;
    }
});

// A sweep lists the directories, then asks whether each one's process still runs. A process that
// ends in between removes its own directories at its exit. Such a directory is no killed process's
// leftover, and a note would fail that process's test run (#436).
test("a sweep notes no directory that its process removed at its end, between the listing and the check", () => {
    const root = tempDir("sweep-race");
    const name = `pivotkit-a1-server-h${HOST}p999999-abcdef`;
    mkdirSync(join(root, name));
    const kill = process.kill;
    // the process with id 999999 ends now: it has removed its directory, and it is gone
    process.kill = /** @type {typeof process.kill} */ ((pid, signal) => {
        if (pid !== 999999) return kill.call(process, pid, signal);
        rmSync(join(root, name), { recursive: true });
        throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    });
    try {
        removeOrphans(root);
    } finally {
        process.kill = kill;
    }
    assert.equal(existsSync(join(root, SWEPT_LOG)), false, "the sweep noted a directory its process had removed");
});

test("a sweep never writes its note through a symbolic link, and says so", { skip: process.platform === "win32" && "symbolic links need rights on Windows" }, () => {
    const root = tempDir("sweep-link");
    const target = join(tempDir("sweep-target"), "elsewhere.txt");
    writeFileSync(target, "kept\n");
    symlinkSync(target, join(root, SWEPT_LOG));
    // a directory of a process that is gone: one that just ended (a fixed id could be a live
    // process on a busy machine)
    const gone = spawnSync(process.execPath, ["-e", ""]).pid;
    const orphan = `pivotkit-x-h${HOST}p${gone}-abcdef`;
    mkdirSync(join(root, orphan));
    const next = spawnSync(process.execPath, ["--input-type=module", "-e", maker("")], { encoding: "utf8", env: { ...process.env, [RUN_ENV]: "", [ROOT_ENV]: root } });
    assert.equal(next.status, 0, next.stderr);
    assert.equal(existsSync(join(root, orphan)), false, "removed");
    assert.match(next.stderr, new RegExp(`^could not note them in ${join(root, SWEPT_LOG).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: `, "m"));
    assert.equal(readFileSync(target, "utf8"), "kept\n");
    // a name of its own instead, so CI's check (new pivotkit-* names) fails on it
    assert.deepEqual(tempDirNames(root).filter((name) => name.startsWith("pivotkit-swept-unnoted-")), [`pivotkit-swept-unnoted-${next.pid}`]);
    assert.equal(readFileSync(join(root, `pivotkit-swept-unnoted-${next.pid}`), "utf8"), `${orphan}\n`);
});
