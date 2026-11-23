// encode() trusts its input's width: it caps rows, not columns (docs/concepts/limits.md, "Not
// counted"). Data from outside reaches it only through a path that counts columns or cells first.
// Each call of encode() in a package that serves data from outside is listed here with that path; a
// new call fails until someone names what bounds its input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const PACKAGES = ["pivotkit-server", "pivotkit-cli", "pivotkit-mcp"];

/** file -> what bounds the width of the data it encodes */
const BOUNDED = {
    "packages/pivotkit-server/src/data.js": "loadedTable (code sources: limits.columns and limits.importCells before the columns are made), the HTTP reader (sources/http.js) and inline data (sources/inline.js: limits.importCells and the MCP cap)",
    "packages/pivotkit-server/src/check/sources.js": "a table read by a file reader of pivotkit-core/import",
    "packages/pivotkit-cli/src/cli.js": "a table read by a file reader of pivotkit-core/import",
    "packages/pivotkit-cli/src/layout-view.js": "a table read by a file reader of pivotkit-core/import"
};

function filesOf(dir) {
    return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesOf(`${dir}${e.name}/`) : e.name.endsWith(".js") ? [`${dir}${e.name}`] : []));
}

test("every encode() call in a package that serves data from outside has its bound named", () => {
    // code lines only: a comment that names encode() is no call
    const calls = (file) => readFileSync(new URL(file, root), "utf8").split("\n").some((line) => !/^\s*(\*|\/\/|\/\*)/.test(line) && /(^|[^.\w])encode\(/.test(line));
    const callers = PACKAGES.flatMap((p) => filesOf(`packages/${p}/src/`)).filter(calls);
    assert.deepEqual(callers.filter((file) => !Object.hasOwn(BOUNDED, file)), [], "name what bounds the columns or cells of this call's data in BOUNDED");
    assert.deepEqual(Object.keys(BOUNDED).filter((file) => !callers.includes(file)), [], "a listed file no longer calls encode(): remove it from BOUNDED");
});
