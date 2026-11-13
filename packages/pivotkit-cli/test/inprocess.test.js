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
