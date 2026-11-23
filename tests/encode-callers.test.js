// encode() trusts the width of its input: it caps rows, not columns (docs/concepts/limits.md, "Not
// counted"). Data from outside reaches it only through a path that counts columns and cells first.
// Every file of a package that calls pivotkit-core's encode() is listed here with its number of calls
// and what bounds their data; a new call, or a new file, fails until someone names its bound.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);

/** file -> its calls of encode() and what bounds the width of the data they encode */
const BOUNDED = {
    "packages/pivotkit-server/src/data.js": [2, "code sources: loadedTable counts limits.columns and limits.importCells before the columns are made; HTTP sources: sources/http.js tableBuilder; data sent with a request: the input schema (1,000 columns) and sources/inline.js checkTableSize (limits.columns, rows, cells)"],
    "packages/pivotkit-server/src/check/sources.js": [1, "a table read by a file reader of pivotkit-core/import"],
    "packages/pivotkit-cli/src/cli.js": [2, "a table read by a file reader of pivotkit-core/import"],
    "packages/pivotkit-cli/src/layout-view.js": [1, "a table read by a file reader of pivotkit-core/import"],
    "packages/pivotkit-react/src/import-ui.jsx": [1, "a table read by a file reader of pivotkit-core/import with the host's importLimits"],
    "packages/pivotkit-react/src/use-shown-data.js": [2, "the host's own data (trusted), and an empty table"],
    "packages/pivotkit-report/src/render.js": [1, "the caller's own data (trusted): pivotkit-server passes data it bounded as above"]
};

const PACKAGES = readdirSync(new URL("packages/", root)).filter((p) => p !== "pivotkit-core");
const IMPORTS_ENCODE = /import\s*\{[^}]*\bencode\b[^}]*\}\s*from\s*"pivotkit-core"/;
// a namespace import or a renamed encode would hide calls from this test
const HIDDEN_IMPORT = /import\s*\*\s*as\s+\w+\s+from\s*"pivotkit-core"|\bencode\s+as\s+\w+/;

function sourcesOf(dir) {
    let entries;
    try {
        entries = readdirSync(new URL(dir, root), { withFileTypes: true });
    } catch {
        return [];
    }
    return entries.flatMap((e) => (e.isDirectory() ? sourcesOf(`${dir}${e.name}/`) : /\.(m?js|jsx)$/.test(e.name) ? [`${dir}${e.name}`] : []));
}

/** Calls of encode( on code lines, with comments and the text of string literals left out. */
function callsOf(text) {
    return text
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .map((line) => line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""'))
        .reduce((n, line) => n + (line.match(/(^|[^\w.$])encode\s*\(/g)?.length ?? 0), 0);
}

test("every call of pivotkit-core's encode() outside pivotkit-core has its bound named", () => {
    const found = {};
    const hidden = [];
    for (const file of PACKAGES.flatMap((p) => sourcesOf(`packages/${p}/src/`))) {
        const text = readFileSync(new URL(file, root), "utf8");
        if (HIDDEN_IMPORT.test(text)) hidden.push(file);
        if (IMPORTS_ENCODE.test(text)) found[file] = callsOf(text);
    }
    assert.deepEqual(hidden, [], "import encode by its name, so this test sees its calls");
    assert.deepEqual(
        Object.fromEntries(Object.entries(found).map(([file, n]) => [file, n])),
        Object.fromEntries(Object.entries(BOUNDED).map(([file, [n]]) => [file, n])),
        "a call of encode() was added, moved or removed: name what bounds its data in BOUNDED"
    );
});
