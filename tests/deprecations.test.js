// Every deprecation id (PK-DEP-NNNN) that a package's source names is in the register of
// docs/versioning.md (#491). A warning with an id nobody can look up helps no one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { root, sourceFiles } from "./source-files.js";

/** A deprecation id. */
const ID = /\bPK-DEP-\d{4}\b/g;

/**
 * The ids in the register: the first cell of each table row under "## Register".
 * @param {string} page  the text of docs/versioning.md
 */
function registerIds(page) {
    const start = page.search(/^## Register\b/m);
    assert.ok(start >= 0, "docs/versioning.md has no \"## Register\" section");
    const rest = page.slice(start).split("\n").slice(1);
    const end = rest.findIndex((line) => line.startsWith("## "));
    const section = (end < 0 ? rest : rest.slice(0, end)).join("\n").replace(/<!--[\s\S]*?-->/g, "");
    return new Set([...section.matchAll(/^\| (PK-DEP-\d{4}) \|/gm)].map((m) => m[1]));
}

/**
 * The ids the sources name that the register lacks, as "file: id".
 * @param {Record<string, string>} sources  file to text
 * @param {Set<string>} register
 */
function missingIds(sources, register) {
    return Object.entries(sources).flatMap(([file, text]) => [...new Set(text.match(ID) ?? [])].filter((id) => !register.has(id)).map((id) => `${file}: ${id}`));
}

test("every PK-DEP id in packages/*/src is in the register", () => {
    const register = registerIds(readFileSync(join(root, "docs/versioning.md"), "utf8"));
    /** @type {Record<string, string>} */
    const sources = {};
    for (const file of sourceFiles(join(root, "packages"))) {
        const path = relative(root, file).split("\\").join("/");
        if (/^packages\/[^/]+\/src\//.test(path)) sources[path] = readFileSync(file, "utf8");
    }
    assert.ok(Object.keys(sources).length > 50, "found too few source files under packages/*/src");
    assert.deepEqual(missingIds(sources, register), [], "add these to the register in docs/versioning.md");
});

test("the register check finds an id the register lacks, and ignores the commented example", () => {
    const page = "## Register { #register }\n\n<!--\n| PK-DEP-0001 | example | x | 1.0.0 | 2.0.0 |\n-->\n\n| Id | Deprecated |\n| --- | --- |\n| PK-DEP-0002 | `old` | `new` | 1.1.0 | 2.0.0 |\n\n## Where this comes from\n\n| PK-DEP-0003 | not the register |\n";
    const register = registerIds(page);
    assert.deepEqual([...register], ["PK-DEP-0002"]);
    assert.deepEqual(missingIds({ "packages/a/src/x.js": 'warn("PK-DEP-0002 ...", "PK-DEP-0004")' }, register), ["packages/a/src/x.js: PK-DEP-0004"]);
});
