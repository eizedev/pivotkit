// scripts/npm-pack.js reads what `npm pack --json --workspace <name>` prints, for
// scripts/check-pack.js (npm run pack:check) and the release workflow's Pack step. npm 10 and 11
// print an array of packages, npm 12 an object keyed by workspace name (#383); a prepack script can
// log lines to stdout before the JSON.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { packEntries } from "../scripts/npm-pack.js";

const script = fileURLToPath(new URL("../scripts/npm-pack.js", import.meta.url));

// one package as npm pack --json describes it (trimmed to a few files)
const entry = {
    id: "pivotkit-xlsx@0.3.1",
    name: "pivotkit-xlsx",
    version: "0.3.1",
    size: 62750,
    unpackedSize: 203778,
    shasum: "c7205beb73c363f1423383346eda9fbe8629e958",
    integrity: "sha512-AAAA",
    filename: "pivotkit-xlsx-0.3.1.tgz",
    files: [
        { path: "CHANGELOG.md", size: 4096, mode: 420 },
        { path: "LICENSE", size: 1064, mode: 420 },
        { path: "dist/index.js", size: 150000, mode: 420 },
    ],
    entryCount: 3,
    bundled: [],
};
// npm 10 and 11: an array, pretty-printed
const NPM10 = `${JSON.stringify([entry], null, 2)}\n`;
// npm 12: an object keyed by the workspace's name
const NPM12 = `${JSON.stringify({ [entry.name]: entry }, null, 2)}\n`;
// what pivotkit-cli's prepack (its build) logs to stdout before npm's JSON
const PREPACK_LOG = "packages/pivotkit-cli/examples/: sales.csv.gz, sales.pivotkit.json, examples.json\n";

test("packEntries reads npm 10's array of packages", () => {
    assert.deepEqual(packEntries(NPM10), [entry]);
});

test("packEntries reads npm 12's object keyed by workspace name", () => {
    assert.deepEqual(packEntries(NPM12), [entry]);
});

test("packEntries skips what a prepack script logs to stdout before the JSON, with either shape", () => {
    assert.deepEqual(packEntries(PREPACK_LOG + NPM10), [entry]);
    assert.deepEqual(packEntries(PREPACK_LOG + NPM12), [entry]);
    // a log line with brackets of its own is not taken for the JSON
    const bracketed = "built [esm] {minify: true}\n";
    assert.deepEqual(packEntries(bracketed + NPM10), [entry]);
    assert.deepEqual(packEntries(bracketed + NPM12), [entry]);
});

test("packEntries says what it got when stdout has no JSON", () => {
    assert.throws(() => packEntries("npm warn something\n"), /no JSON in the output of npm pack/);
});

test("node scripts/npm-pack.js prints the tarball's file name of what it reads on stdin, with either shape", () => {
    for (const out of [NPM10, PREPACK_LOG + NPM12]) {
        const result = spawnSync(process.execPath, [script], { input: out, encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "pivotkit-xlsx-0.3.1.tgz\n");
    }
});
