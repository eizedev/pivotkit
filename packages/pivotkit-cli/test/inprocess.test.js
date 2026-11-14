// What a spawned process cannot show: stdout that is a terminal. main() runs with the streams given.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

// the file helpers are one documented entry (pivotkit-cli/files, for pivotkit-mcp); the module behind
// it stays internal, so its other names are no API
test("the package exports main() and the file helpers of pivotkit-cli/files, not safe-files.js", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), [".", "./files", "./package.json"]);
    await assert.rejects(import("pivotkit-cli/safe-files"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    const files = await import("pivotkit-cli/files");
    assert.deepEqual(Object.keys(files).sort(), ["CliError", "DATA_FORMATS", "INFO_NOTES", "TEMP_FILE_NAME", "allowedDirs", "asCliError", "cleanFileName", "isInside", "printable", "readSafe", "readStdin", "readTable", "shortName", "writeNew", "writeSafe"]);
});

test("writeNew never replaces a file: a taken name gets -2, -3; the name is cleaned; no temporary file stays", async () => {
    const { writeNew } = await import("pivotkit-cli/files");
    const dir = tempDir();
    writeFileSync(join(dir, "Sales.csv"), "keep");
    assert.equal(await writeNew(dir, "Sales", "csv", new TextEncoder().encode("a")), "Sales-2.csv");
    assert.equal(await writeNew(dir, "Sales", "csv", new TextEncoder().encode("b")), "Sales-3.csv");
    assert.equal(readFileSync(join(dir, "Sales.csv"), "utf8"), "keep");
    assert.equal(await writeNew(dir, "../../etc/passwd", "csv", new Uint8Array()), "etc-passwd.csv");
    assert.equal(await writeNew(dir, ".hidden\u202e", "csv", new Uint8Array()), "hidden.csv");
    assert.equal(await writeNew(dir, "Umsätze Q1/2026", "xlsx", new Uint8Array()), "Umsatze Q1-2026.xlsx");
    assert.equal(await writeNew(dir, "", "json", new Uint8Array()), "report.json");
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
    await assert.rejects(writeNew(dir, "Sales", "csv", new Uint8Array(), { tries: 3 }), (e) => e.code === "EXISTS");
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

// pivotkit-server removes the temporary files of writes that were killed by TEMP_FILE_NAME: it must
// match every name writeSafe makes, and no report's name
test("TEMP_FILE_NAME matches the temporary files writeSafe makes, not the files it writes", async () => {
    const { TEMP_FILE_NAME } = await import("pivotkit-cli/files");
    const { tempFileName } = await import("../src/safe-files.js");
    for (const name of ["Sales.csv", "a", "Umsätze Q1 2026.xlsx", "x".repeat(300), "😀".repeat(80), ".hidden", "name.with.dots.tmp"]) {
        for (let i = 0; i < 20; i++) {
            const temp = tempFileName(name);
            assert.match(temp, TEMP_FILE_NAME, temp);
            assert.ok(Buffer.byteLength(temp) <= 255, `${temp}: longer than a file name may be`);
        }
    }
    for (const name of ["Sales.csv", "report.json", "a1b2-Sales.xlsx", "notes.tmp", ".hidden.tmp", "Sales.csv.tmp", ".Sales.csv.tmp"]) {
        assert.doesNotMatch(name, TEMP_FILE_NAME, name);
    }
    // a long name keeps its start and its end (the server's random prefix, its output mark)
    const long = `${"r".repeat(22)}-${"Quarterly sales by region and product ".repeat(3)}.pivotkit-out.report.json`;
    assert.match(tempFileName(long), /^\.r{22}-Q.*\.pivotkit-out\.report\.json\.\d+-[0-9a-z]+\.tmp$/);
});

test("Windows' device names, with an extension or trailing dots and spaces, are devices; names that start with one are not", async () => {
    const { isWindowsDevice } = await import("../src/safe-files.js");
    for (const name of ["NUL", "nul", "CON", "con.csv", "nul.tar.gz", "COM1", "com9.xlsx", "LPT3.txt", "AUX", "PRN.", "NUL .", "COM\u00b9"]) {
        assert.equal(isWindowsDevice(name), true, name);
    }
    for (const name of ["null", "console.csv", "COM10", "LPT", ".nul.csv.4242-a1b2.tmp", "a.NUL", "auxiliary.csv", "Sales.csv"]) {
        assert.equal(isWindowsDevice(name), false, name);
    }
});

test("writeNew on Windows takes a device's name as taken: a report named con is con-2", async () => {
    const { writeNew } = await import("../src/safe-files.js");
    const dir = tempDir();
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
        assert.equal(await writeNew(dir, "con", "csv", new TextEncoder().encode("a")), "con-2.csv");
        assert.equal(await writeNew(dir, "NUL", "pivotkit-out.xlsx", new TextEncoder().encode("b")), "NUL-2.pivotkit-out.xlsx");
        assert.equal(await writeNew(dir, "Sales", "csv", new TextEncoder().encode("c")), "Sales.csv");
    } finally {
        Object.defineProperty(process, "platform", /** @type {PropertyDescriptor} */ (platform));
    }
    assert.deepEqual(readdirSync(dir).sort(), ["NUL-2.pivotkit-out.xlsx", "Sales.csv", "con-2.csv"]);
});

test("readSafe with hardLinks: false refuses a file with a second name; the default reads it", { skip: process.platform === "win32" ? "hard links differ on Windows" : false }, async () => {
    const { readSafe } = await import("pivotkit-cli/files");
    const dir = tempDir();
    writeFileSync(join(dir, "data.csv"), "a\n1\n");
    linkSync(join(dir, "data.csv"), join(dir, "alias.csv"));
    await assert.rejects(readSafe("alias.csv", { cwd: dir, allow: [dir], maxBytes: 100, hardLinks: false }), (e) => e.code === "HARD_LINK" && !/a\n1/.test(e.message));
    assert.equal((await readSafe("alias.csv", { cwd: dir, allow: [dir], maxBytes: 100 })).length, 4);
});
