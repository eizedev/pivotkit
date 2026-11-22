// The error classes the server uses: each extends CodedError (pivotkit-core/internal), which holds
// `code` and `details`, and carries exactly the members it always had.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError } from "pivotkit-core";
import { CodedError } from "pivotkit-core/internal";
import { CliError } from "pivotkit-node/files";
import { OperationError } from "pivotkit-report/operations";
import { AuthRefusal } from "../src/auth.js";
import { CommandError } from "../src/credentials.js";
import { OpenApiError } from "../src/openapi-source.js";
import { ConfigError } from "../src/options/shared.js";
import { SecretFileError } from "../src/secret-file.js";
import { SecretError } from "../src/secrets.js";
import { SignedTokenError } from "../src/signed-tokens.js";
import { GuardedFetchError } from "../src/sources/fetch.js";
import { AnswerShapeError } from "../src/sources/json-rows.js";
import { SourceError } from "../src/sources/run.js";
import { UploadFailure } from "../src/upload.js";

test("every error class extends CodedError and keeps its name and members", () => {
    const cases = [
        [new PivotkitError("INVALID_ARGUMENT", "m"), "PivotkitError", ["code", "details"]],
        [new CliError("io", "NOT_FOUND", "m"), "CliError", ["code", "kind"]],
        [new OperationError("INVALID_INPUT", "m"), "OperationError", ["code", "status"]],
        [new OperationError("BUSY", "m", { retryable: true }), "OperationError", ["code", "details", "status"]],
        [new AuthRefusal(401, "invalid_token", "m"), "AuthRefusal", ["error", "status"]],
        [new CommandError(1, "C", "m"), "Error", ["code", "exitCode", "kind"]],
        [new OpenApiError("m"), "OpenApiError", []],
        [new ConfigError("m"), "ConfigError", ["code", "problems"]],
        [new SecretFileError("EXISTS", "m"), "SecretFileError", ["code"]],
        [new SecretError("m"), "SecretError", ["code"]],
        [new SignedTokenError("EXPIRED", "m"), "SignedTokenError", ["code", "id"]],
        [new GuardedFetchError("NETWORK", "m", { transient: true, cause: new Error("c") }), "GuardedFetchError", ["cause", "code", "transient"]],
        [new AnswerShapeError("m"), "AnswerShapeError", []],
        [new SourceError("SOURCE_UNAVAILABLE"), "SourceError", ["code", "publicMessage", "reason", "retryAfter", "status", "transient"]],
        [new UploadFailure("U", true), "UploadFailure", ["code", "retryable"]]
    ];
    for (const [error, name, members] of cases) {
        assert.ok(error instanceof CodedError, name);
        assert.equal(error.name, name);
        const own = Object.getOwnPropertyNames(error).filter((key) => !["message", "name", "stack"].includes(key));
        assert.deepEqual(own.sort(), members, name);
    }
    // a class's own errors are not another's: PivotkitError stays what pivotkit-core throws
    assert.equal(new ConfigError("m") instanceof PivotkitError, false);
});
