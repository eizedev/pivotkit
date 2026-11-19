// The public entry points of pivotkit-server: what each exports, and that a reference page names every
// export (docs/versioning.md: every JS export is public interface). What only this repository's
// packages share is pivotkit-server/internal, whose names no docs page lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as server from "pivotkit-server";
import * as rest from "pivotkit-server/rest";
import * as policy from "pivotkit-server/policy";
import * as internal from "pivotkit-server/internal";
import { undocumentedExports } from "../../../tests/documented-exports.js";

test("the package exports its documented entry points and nothing else", () => {
    assert.deepEqual(Object.keys(server).sort(), [
        "BODY_BYTES", "CODE_DEFAULTS", "COMPUTE_DEFAULTS", "ConfigError", "DEFAULT_ALGORITHMS", "DEFAULT_PORT", "MAX_BODY_BYTES", "OPTION_KEYS", "OperationError", "POLICY_DEFAULTS", "POLICY_LEVELS",
        "SECRET_REF", "SERVER_LIMITS", "SOURCE_ERROR_CODES", "SecretError", "SourceError", "VERSION", "bodyBytesOf", "bodyCapOf", "callerFields", "callerOf", "checkConfig", "createContext",
        "createServerHandler", "errorDetails", "groupRefusal", "loadConfig", "offeredScopes", "peekSignIn", "present", "readSecret", "requestId", "requestScopeFor", "serve", "serveFetch", "validateOptions", "withRequestId"
    ]);
    assert.deepEqual(Object.keys(rest).sort(), ["PROBLEM_CODES", "REST_BASE", "REST_BODY_BYTES", "REST_ERRORS", "REST_LIMITS", "REST_ROUTES", "createRestHandler", "openApiDocument"]);
    assert.deepEqual(Object.keys(policy).sort(), [
        "AUTO_VALUES", "POLICY_DEFAULTS", "POLICY_LEVELS", "autoLevel", "deniedWord", "exposeFindings", "exposeSource", "levelInfo", "levelOf", "listsAll", "resolvePolicy", "stricter", "touchesClosed", "withStats"
    ]);
    // the internal entry holds no name of the public ones: one place per name
    assert.deepEqual(Object.keys(internal).filter((name) => name in server || name in rest || name in policy), []);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), [".", "./rest", "./policy", "./internal", "./package.json"]);
});

test("every export of every public entry point is named on a reference page of the docs", () => {
    const entries = { "pivotkit-server": server, "pivotkit-server/rest": rest, "pivotkit-server/policy": policy };
    assert.deepEqual(undocumentedExports(entries), [], "name each export in code font on its reference page");
});
