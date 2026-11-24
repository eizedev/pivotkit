// scripts/audit-signatures.js with a stand-in for npm first on PATH: it tries again only when npm
// cannot read the registry's answer (FETCH_ERROR), passes npm's exit code on, and stops after three tries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tempDir } from "./temp-dir.js";

const SCRIPT = fileURLToPath(new URL("../scripts/audit-signatures.js", import.meta.url));

/** Runs the script with an npm that answers with `answers` in turn (output, exit code), counting its runs. */
function run(answers) {
    const dir = tempDir("audit-signatures");
    const count = join(dir, "count");
    writeFileSync(count, "0");
    writeFileSync(join(dir, "answers.json"), JSON.stringify(answers));
    // a Node script as npm: its runs counted in a file, each answer printed and exited with
    const npm = `#!${process.execPath}\nconst fs = require("fs"), path = require("path");\nconst c = path.join(__dirname, "count");\nconst n = Number(fs.readFileSync(c, "utf8"));\nfs.writeFileSync(c, String(n + 1));\nconst [text, code] = JSON.parse(fs.readFileSync(path.join(__dirname, "answers.json"), "utf8"))[Math.min(n, ${answers.length - 1})];\nprocess.stderr.write(text);\nprocess.exit(code);\n`;
    writeFileSync(join(dir, "npm"), npm);
    chmodSync(join(dir, "npm"), 0o755);
    const out = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, PIVOTKIT_AUDIT_PAUSE_MS: "1" } });
    return { status: out.status, tries: Number(readFileSync(count, "utf8")) };
}

test("a signature that does not verify fails at once", { skip: process.platform === "win32" }, () => {
    assert.deepEqual(run([["1 package has an invalid registry signature", 1]]), { status: 1, tries: 1 });
});

test("an answer npm cannot read is tried again; a later pass passes", { skip: process.platform === "win32" }, () => {
    assert.deepEqual(run([["npm error code FETCH_ERROR", 1], ["audited 71 packages", 0]]), { status: 0, tries: 2 });
});

test("three answers npm cannot read fail, after three tries", { skip: process.platform === "win32" }, () => {
    assert.deepEqual(run([["npm error code FETCH_ERROR", 1]]), { status: 1, tries: 3 });
});
