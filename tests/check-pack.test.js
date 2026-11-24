// scripts/check-pack.js (npm run pack:check): which workspaces it checks, and every file path an
// exports map names, also under nested conditions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportPaths, workspacesToCheck } from "../scripts/check-pack.js";

test("check-pack checks the workspaces named, or every one of the root package.json", () => {
    assert.deepEqual(workspacesToCheck(["pivotkit-core"]), ["pivotkit-core"]);
    assert.ok(workspacesToCheck([]).includes("pivotkit-mcp"));
});

test("exportPaths finds every path of an exports map, under nested conditions too", () => {
    assert.deepEqual(exportPaths("./dist/index.js"), ["./dist/index.js"]);
    const exports = {
        ".": { types: "./types/index.d.ts", default: "./src/index.js" },
        "./styles.css": "./dist/styles.css",
        "./nested": { import: { types: "./types/nested.d.ts", default: "./src/nested.js" }, require: null }
    };
    assert.deepEqual(exportPaths(exports), ["./types/index.d.ts", "./src/index.js", "./dist/styles.css", "./types/nested.d.ts", "./src/nested.js"]);
    assert.deepEqual(exportPaths(undefined), []);
});
