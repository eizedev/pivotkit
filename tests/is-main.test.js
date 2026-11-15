// The scripts of this repository that can be both run and imported decide with isMain
// (scripts/is-main.js) whether they were run. A comparison of process.argv[1] with import.meta.url
// fails for a checkout under a path with a space or reached through a symlink: the script then does
// nothing and exits 0 (#312). A file URL's pathname is percent-encoded: as a path it misses a
// directory with a space.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("no script takes a file URL's pathname as a path: it is percent-encoded (a space is %20)", () => {
    const own = [];
    for (const file of sourceFiles()) {
        const name = relative(root, file).split("\\").join("/");
        if (name === "tests/is-main.test.js") continue;
        if (/(import\.meta\.url|\broot)\)\.pathname/.test(readFileSync(file, "utf8"))) own.push(name);
    }
    assert.deepEqual(own, [], "use fileURLToPath(new URL(..., import.meta.url)) instead");
});

/** A new directory under the real temporary directory, removed after the test. */
function scratch(t) {
    const dir = mkdtempSync(join(realpathSync(tmpdir()), "pivotkit-is-main-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
}

test("scripts run when started through a symbolic link whose name has a space", { skip: process.platform === "win32" && "symlinks need extra rights on Windows" }, (t) => {
    // the repository reached as "<tmp>/a b/...": process.argv[1] has the link and the space,
    // import.meta.url neither
    const dir = scratch(t);
    const link = join(dir, "a b");
    symlinkSync(root, link, "dir");
    // pivotkit-xlsx's workbook generator writes the file it is given
    const out = join(dir, "tickets.xlsx");
    let result = spawnSync(process.execPath, [join(link, "packages", "pivotkit-xlsx", "test", "make-xlsx.js"), out, "5", "10"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(out), "make-xlsx.js did not see that it was run: no workbook written");
    // check-release without arguments prints its usage and exits 2
    result = spawnSync(process.execPath, [join(link, "scripts", "check-release.js")], { encoding: "utf8" });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /^usage: node scripts\/check-release\.js/);
});

test("the playground's server serves its files from a directory whose real path has a space", async (t) => {
    const dir = join(scratch(t), "a b");
    mkdirSync(join(dir, "dist"), { recursive: true });
    copyFileSync(join(root, "examples", "playground", "serve.js"), join(dir, "serve.js"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(dir, "dist", "index.html"), "<!doctype html><title>spaced</title>");
    const child = spawn(process.execPath, [join(dir, "serve.js"), "0"], { stdio: ["ignore", "pipe", "inherit"] });
    t.after(() => child.kill());
    let base = null;
    let out = "";
    child.stdout.setEncoding("utf8");
    for await (const chunk of child.stdout) {
        out += chunk;
        base = /http:\/\/127\.0\.0\.1:\d+\//.exec(out)?.[0] ?? null;
        if (base) break;
    }
    assert.ok(base, `the server did not start: ${out}`);
    const res = await fetch(base);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /spaced/);
});
