// tempDir() of tests/temp-dir.js is the one way to make a temporary directory (#463): a check over
// the repository's sources finds every other way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { root, sourceFiles } from "./source-files.js";

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

// tempDir() itself; this check, whose examples show what it finds; the test run and its tests, which
// make the leftovers a run must notice
const EXEMPT = ["tests/temp-dir.js", "tests/temp-dir-check.test.js", "scripts/test-run.js", "tests/test-run.test.js"];

test("no file but tests/temp-dir.js makes a temporary directory: every one goes through tempDir()", () => {
    const own = [];
    for (const file of sourceFiles()) {
        const name = relative(root, file).split("\\").join("/");
        // the packages' own code is not test code; the helper and this file make them, the run's check
        // only lists the temporary directory
        if (/^packages\/[^/]+\/(src|bin)\//.test(name) || EXEMPT.includes(name)) continue;
        if (makesTempDir(readFileSync(file, "utf8"))) own.push(name);
    }
    assert.deepEqual(own, [], "make a temporary directory with tempDir() of tests/temp-dir.js: it is removed when the process ends");
});
