// What a spawned process cannot show: stdout that is a terminal. main() runs with the streams given.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "pivotkit-cli";
import { BY_REGION, SALES_CSV, tempDir } from "./helpers.js";

function io(cwd, { tty = false } = {}) {
    const out = [];
    const err = [];
    return {
        out,
        err,
        io: { stdin: (async function* () {})(), stdout: { isTTY: tty, write: (c) => out.push(c) }, stderr: { write: (c) => err.push(String(c)) }, env: {}, cwd }
    };
}

test("an XLSX is not written to a terminal: exit 2 with the hint, nothing on stdout; piped it is", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "sales.csv"), SALES_CSV);
    writeFileSync(join(dir, "view.json"), JSON.stringify(BY_REGION));
    const terminal = io(dir, { tty: true });
    assert.equal(await main(["render", "view.json", "--data", "sales.csv", "-f", "xlsx"], terminal.io), 2);
    assert.deepEqual(terminal.out, []);
    assert.match(terminal.err.join(""), /an XLSX file is not shown in a terminal/);
    const piped = io(dir);
    assert.equal(await main(["render", "view.json", "--data", "sales.csv", "-f", "xlsx"], piped.io), 0);
    assert.deepEqual([...piped.out[0].subarray(0, 2)], [0x50, 0x4b]);
});

test("a file that has more bytes than its size said is refused as changed, never cut (Linux: a /proc file says 0)", { skip: process.platform === "linux" ? false : "needs /proc, whose files report size 0" }, async () => {
    const { readSafe } = await import("../src/safe-files.js");
    await assert.rejects(readSafe("/proc/self/status", { cwd: "/", allow: [], maxBytes: 1_000_000 }), (e) => e.code === "CHANGED" && /status: changed while it was read/.test(e.message));
});

test("a regular file is read whole, up to the last byte; a file of 0 bytes is empty", async () => {
    const { readSafe } = await import("../src/safe-files.js");
    const dir = tempDir();
    writeFileSync(join(dir, "six.txt"), "abcdef");
    writeFileSync(join(dir, "empty.txt"), "");
    assert.equal(new TextDecoder().decode(await readSafe("six.txt", { cwd: dir, allow: [], maxBytes: 6 })), "abcdef");
    assert.equal((await readSafe("empty.txt", { cwd: dir, allow: [], maxBytes: 6 })).length, 0);
    await assert.rejects(readSafe("six.txt", { cwd: dir, allow: [], maxBytes: 5 }), (e) => e.code === "LIMIT_EXCEEDED");
});

// safe-files.js is internal until the open points of #209 are settled: an export is an API that a
// later release could not take back
test("the package exports the command's main() only, not its file helpers", async () => {
    const { default: pkg } = await import("pivotkit-cli/package.json", { with: { type: "json" } });
    assert.deepEqual(Object.keys(pkg.exports), [".", "./package.json"]);
    await assert.rejects(import("pivotkit-cli/safe-files"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
});
