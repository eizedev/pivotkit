// The public entry points of pivotkit-mcp: what each exports, and that a reference page names every
// export (docs/versioning.md: every JS export is public interface).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as mcp from "pivotkit-mcp";
import * as policy from "pivotkit-mcp/policy";
import * as serverPolicy from "pivotkit-server/policy";
import { undocumentedExports } from "../../../tests/documented-exports.js";

test("the package exports its documented entry points and nothing else", () => {
    assert.deepEqual(Object.keys(mcp).sort(), [
        "COMPUTE_DEFAULTS", "ConfigError", "DEFAULT_ALGORITHMS", "INSTRUCTIONS", "OPTION_KEYS", "POLICY_DEFAULTS", "POLICY_LEVELS", "SERVER_LIMITS", "SKILLS_DIR", "VERSION",
        "callerOf", "createHttpHandler", "createMcpContext", "instructionsOf", "listen", "loadConfig", "run", "validateOptions"
    ]);
    // pivotkit-server/policy under another name
    assert.deepEqual(Object.keys(policy).sort(), Object.keys(serverPolicy).sort());
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), [".", "./policy", "./package.json"]);
});

test("every export of every public entry point is named on a reference page of the docs", () => {
    assert.deepEqual(undocumentedExports({ "pivotkit-mcp": mcp, "pivotkit-mcp/policy": policy }), [], "name each export in code font on its reference page");
});
