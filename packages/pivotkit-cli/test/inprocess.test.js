// What a spawned process cannot show: stdout that is a terminal. main() runs with the streams given.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
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

// the file helpers and the REST contract are published entries; they are pivotkit-node's, so an error
// of one is an instance of the other's class
test("the package exports main(), the file helpers of pivotkit-cli/files and the REST contract of pivotkit-cli/rest, pivotkit-node's", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), [".", "./files", "./rest", "./package.json"]);
    const rest = await import("pivotkit-cli/rest");
    assert.deepEqual(Object.keys(rest).sort(), ["CLIENT_ID_SYNTAX", "PROBLEM_CODES", "REST_BASE", "REST_ERRORS", "SIGN_IN_CLIENT_FIELD", "SOURCE_ID", "TOKEN_SYNTAX", "TOKEN_SYNTAX_TEXT", "isLoopback", "resourceMetadataUrlOf"]);
    assert.equal(rest.isLoopback, (await import("pivotkit-node/rest")).isLoopback);
    await assert.rejects(import("pivotkit-cli/safe-files"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
    const files = await import("pivotkit-cli/files");
    assert.deepEqual(Object.keys(files).sort(), ["CliError", "DATA_FORMATS", "INFO_NOTES", "TEMP_FILE_NAME", "allowedDirs", "asCliError", "cleanFileName", "isInside", "printable", "readSafe", "readStdin", "readTable", "shortName", "writeNew", "writeSafe"]);
    assert.equal(files.CliError, (await import("pivotkit-node/files")).CliError);
});
