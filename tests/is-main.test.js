// The scripts of this repository that can be both run and imported decide with isMain
// (scripts/is-main.js) whether they were run. A comparison of process.argv[1] with import.meta.url
// fails for a checkout under a path with a space or reached through a symlink: the script then does
// nothing and exits 0 (#312).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** The JavaScript files of this repository outside node_modules and build output. */
function sourceFiles(dir = root) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (["node_modules", "dist", "coverage", "site", ".git", "test-results", "playwright-report"].includes(entry.name)) return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.(js|mjs)$/.test(entry.name) ? [path] : [];
    });
}

test("no script compares process.argv[1] itself to tell whether it was run: it uses isMain", () => {
    const own = [];
    for (const file of sourceFiles()) {
        const name = relative(root, file).split("\\").join("/");
        if (name === "scripts/is-main.js" || name === "tests/is-main.test.js") continue;
        if (/process\.argv\[1\]/.test(readFileSync(file, "utf8"))) own.push(name);
    }
    assert.deepEqual(own, [], "compare with isMain(import.meta.url) from scripts/is-main.js instead");
});

test("a script runs when started through a path with a space or through a symlink", { skip: process.platform === "win32" && "symlinks need extra rights on Windows" }, (t) => {
    // scripts/check-release.js without arguments prints its usage and exits 2; a guard that does not
    // see that it was run exits 0 without output
    const dir = mkdtempSync(join(realpathSync(tmpdir()), "pivotkit-is-main-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const spaced = join(dir, "a b");
    mkdirSync(join(spaced, "scripts"), { recursive: true });
    for (const file of ["check-release.js", "is-main.js"]) {
        copyFileSync(join(root, "scripts", file), join(spaced, "scripts", file));
    }
    writeFileSync(join(spaced, "package.json"), JSON.stringify({ type: "module" }));
    symlinkSync(spaced, join(dir, "link"), "dir");
    for (const script of [join(spaced, "scripts", "check-release.js"), join(dir, "link", "scripts", "check-release.js")]) {
        const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
        assert.equal(result.status, 2, `${script}: ${result.stderr}`);
        assert.match(result.stderr, /^usage: node scripts\/check-release\.js/);
    }
});
