// The file handling in one process: what a spawned command cannot show (a /proc file, a faked
// platform) and the helpers behind pivotkit-node/files that no entry exports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./helpers.js";

// files and rest are what pivotkit-cli/files and pivotkit-cli/rest publish, net is for the two front ends (test/net.test.js); safe-files.js stays internal
test("the package exports the file helpers of pivotkit-node/files and the REST contract of pivotkit-node/rest, not safe-files.js", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), ["./files", "./net", "./rest", "./package.json"]);
    const rest = await import("pivotkit-node/rest");
    assert.deepEqual(Object.keys(rest).sort(), ["CLIENT_ID_SYNTAX", "PROBLEM_CODES", "REST_BASE", "REST_ERRORS", "SIGN_IN_CLIENT_FIELD", "SOURCE_ID", "TOKEN_SYNTAX", "TOKEN_SYNTAX_TEXT", "isLoopback", "resourceMetadataUrlOf"]);
    assert.equal(rest.resourceMetadataUrlOf("https://reports.example/api/v1/"), "https://reports.example/.well-known/oauth-protected-resource/api/v1");
    // literal loopback addresses only, as a URL's hostname writes them too
    for (const host of ["localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]", "LOCALHOST"]) assert.equal(rest.isLoopback(host), true, host);
    for (const host of ["127.example.com", "localhost.example.com", "128.0.0.1", "0.0.0.0", "::", "[::ffff:7f00:1]", ""]) assert.equal(rest.isLoopback(host), false, host);
    await assert.rejects(import("pivotkit-node/safe-files"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    const files = await import("pivotkit-node/files");
    assert.deepEqual(Object.keys(files).sort(), ["CliError", "DATA_FORMATS", "INFO_NOTES", "NO_HARD_LINKS", "TEMP_FILE_NAME", "allowedDirs", "asCliError", "cleanFileName", "isInside", "printable", "readSafe", "readStdin", "readTable", "shortName", "writeNew", "writeSafe"]);
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
test("writeNew never replaces a file: a taken name gets -2, -3; the name is cleaned; no temporary file stays", async () => {
    const { writeNew } = await import("pivotkit-node/files");
    const dir = tempDir();
    writeFileSync(join(dir, "Sales.csv"), "keep");
    assert.equal(await writeNew(dir, "Sales", "csv", new TextEncoder().encode("a")), "Sales-2.csv");
    assert.equal(await writeNew(dir, "Sales", "csv", new TextEncoder().encode("b")), "Sales-3.csv");
    assert.equal(readFileSync(join(dir, "Sales.csv"), "utf8"), "keep");
    assert.equal(await writeNew(dir, "../../etc/passwd", "csv", new Uint8Array()), "etc-passwd.csv");
    assert.equal(await writeNew(dir, ".hidden\u202e", "csv", new Uint8Array()), "hidden.csv");
    assert.equal(await writeNew(dir, "Umsätze Q1/2026", "xlsx", new Uint8Array()), "Umsatze Q1-2026.xlsx");
    // parentheses stay: a title such as "Orders (fake backend)" keeps its shape
    assert.equal(await writeNew(dir, "Orders (fake backend)", "xlsx", new Uint8Array()), "Orders (fake backend).xlsx");
    assert.equal(await writeNew(dir, "", "json", new Uint8Array()), "report.json");
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
    await assert.rejects(writeNew(dir, "Sales", "csv", new Uint8Array(), { tries: 3 }), (e) => e.code === "EXISTS");
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("writeNew without hard links (FAT, exFAT, some SMB mounts): the name is created exclusively in place", async () => {
    const { fileMeans } = await import("../src/safe-files.js");
    const { writeNew } = await import("pivotkit-node/files");
    const { link, unlink } = fileMeans;
    const dir = tempDir();
    const noLink = (code) => async () => {
        throw Object.assign(new Error(code), { code });
    };
    try {
        for (const code of ["EPERM", "ENOTSUP"]) {
            fileMeans.link = noLink(code);
            assert.equal(await writeNew(dir, `Sales ${code}`, "csv", new TextEncoder().encode("a,b")), `Sales ${code}.csv`);
            assert.equal(readFileSync(join(dir, `Sales ${code}.csv`), "utf8"), "a,b");
        }
        if (process.platform !== "win32") {
            await writeNew(dir, "Own", "csv", new Uint8Array(), { mode: 0o600 });
            assert.equal(statSync(join(dir, "Own.csv")).mode & 0o777, 0o600);
        }
        // a file that appears in between is never replaced: the next name
        let raced = false;
        fileMeans.link = async (_temp, target) => {
            if (!raced) writeFileSync(target, "keep");
            raced = true;
            throw Object.assign(new Error("EPERM"), { code: "EPERM" });
        };
        assert.equal(await writeNew(dir, "Raced", "csv", new TextEncoder().encode("new")), "Raced-2.csv");
        assert.equal(readFileSync(join(dir, "Raced.csv"), "utf8"), "keep");
        assert.equal(readFileSync(join(dir, "Raced-2.csv"), "utf8"), "new");
        // any other failure of link() is no reason to write in place
        fileMeans.link = noLink("EACCES");
        await assert.rejects(writeNew(dir, "Denied", "csv", new Uint8Array()), (e) => e.code === "EACCES");
        assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith("Denied")), []);
        // the file has its name: a temporary file that cannot be removed then is no failure
        fileMeans.link = link;
        fileMeans.unlink = async () => {
            throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
        };
        assert.equal(await writeNew(dir, "Linked", "csv", new TextEncoder().encode("x")), "Linked.csv");
    } finally {
        Object.assign(fileMeans, { link, unlink });
    }
    assert.equal(readFileSync(join(dir, "Linked.csv"), "utf8"), "x");
});

test("writeNew writes the mode it is given, whatever the umask; 0644 without one", { skip: process.platform === "win32" && "Windows has no file modes" }, async () => {
    const { writeNew } = await import("pivotkit-node/files");
    const dir = tempDir();
    const before = process.umask(0);
    try {
        assert.equal(statSync(join(dir, await writeNew(dir, "closed", "csv", new Uint8Array(), { mode: 0o600 }))).mode & 0o777, 0o600);
        assert.equal(statSync(join(dir, await writeNew(dir, "open", "csv", new Uint8Array()))).mode & 0o777, 0o644);
    } finally {
        process.umask(before);
    }
});

// pivotkit-server removes the temporary files of writes that were killed by TEMP_FILE_NAME: it must
// match every name writeSafe makes, and no report's name
test("TEMP_FILE_NAME matches the temporary files writeSafe makes, not the files it writes", async () => {
    const { TEMP_FILE_NAME } = await import("pivotkit-node/files");
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
    const { readSafe } = await import("pivotkit-node/files");
    const dir = tempDir();
    writeFileSync(join(dir, "data.csv"), "a\n1\n");
    linkSync(join(dir, "data.csv"), join(dir, "alias.csv"));
    await assert.rejects(readSafe("alias.csv", { cwd: dir, allow: [dir], maxBytes: 100, hardLinks: false }), (e) => e.code === "HARD_LINK" && !/a\n1/.test(e.message));
    assert.equal((await readSafe("alias.csv", { cwd: dir, allow: [dir], maxBytes: 100 })).length, 4);
});

test("a reader's limit error is a limit: LIMIT_EXCEEDED, and INVALID_FILE with reason LIMIT of pivotkit-xlsx 0.1.0", async () => {
    const { PivotkitError } = await import("pivotkit-core");
    const { asCliError } = await import("pivotkit-node/files");
    const now = asCliError(new PivotkitError("LIMIT_EXCEEDED", '"book.xlsx" has more than 5 parts in its ZIP directory (limits.archiveEntries)', { limit: "archiveEntries", value: 9, max: 5, file: "book.xlsx" }), "book.xlsx");
    assert.deepEqual([now.kind, now.code], ["limit", "LIMIT_EXCEEDED"]);
    const before = asCliError(new PivotkitError("INVALID_FILE", '"book.xlsx": the workbook has 9 parts, more than 5 (limits.archiveEntries).', { reason: "LIMIT", file: "book.xlsx", limit: "archiveEntries", value: 9, max: 5 }), "book.xlsx");
    assert.deepEqual([before.kind, before.code], ["limit", "LIMIT"]);
    const damaged = asCliError(new PivotkitError("INVALID_FILE", '"book.xlsx": damaged', { reason: "DAMAGED", file: "book.xlsx" }), "book.xlsx");
    assert.deepEqual([damaged.kind, damaged.code], ["io", "DAMAGED"]);
});

test("every reader note code of pivotkit-core is sorted as info or as a warning: a new code is a decision here", async () => {
    const { IMPORT_NOTE_CODES } = await import("pivotkit-core/import");
    const { INFO_NOTES } = await import("pivotkit-node/files");
    // the notes that say the data differs from the file
    const WARNINGS = ["LINES_SKIPPED", "COLUMN_RENAMED", "COLUMNS_RENAMED_MORE", "COLUMN_DROPPED", "COLUMNS_ADDED", "TEXT_CUT", "CHARACTERS_REMOVED", "DATE_ORDER", "DECIMAL_MARK", "VALUES_NOT_CONVERTED", "NUMBERS_TOO_LARGE", "NUMBERS_ROUNDED", "JSON_PROPERTY", "ERROR_CELLS"];
    assert.deepEqual([...INFO_NOTES, ...WARNINGS].sort(), [...IMPORT_NOTE_CODES].sort());
});
