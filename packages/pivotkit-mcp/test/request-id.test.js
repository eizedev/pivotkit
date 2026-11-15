// A tool call's id: on its log line, and in the error text of an error with details (a source or a
// store that failed), so the person can give the operator the line to look for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OperationError } from "pivotkit-report/operations";
import { errorResult } from "../src/tools.js";
import { BY_REGION, call, httpClient, httpServer, workspace } from "./helpers.js";

test("tool errors: an error with details ends with the request's id; any other error reads as before", () => {
    const withId = errorResult(new OperationError("SOURCE_UNAVAILABLE", "the source tickets is not available right now (temporary); try once more later", { requestId: "Ab3_xY9-k2Q", retryable: true }));
    assert.equal(withId.content[0].text, "SOURCE_UNAVAILABLE: the source tickets is not available right now (temporary); try once more later (id Ab3_xY9-k2Q)");
    assert.equal(withId.isError, true);
    assert.equal(errorResult(new OperationError("SOURCE_NOT_FOUND", 'no source "x"')).content[0].text, 'SOURCE_NOT_FOUND: no source "x"');
    assert.equal(errorResult(null).content[0].text, "INTERNAL: internal error");
});

test("tool calls: each call's log line has its own id", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    const { client, close } = await httpClient(server.url);
    try {
        await call(client, "validate_view", { source: "sales", view: BY_REGION });
        const failed = await call(client, "describe_source", { source: "nope" });
        assert.ok(failed.isError);
        assert.doesNotMatch(failed.text, /\(id /, "an error without details names no id");
        const calls = server.log.filter((l) => l.event === "call");
        assert.equal(calls.length, 2);
        assert.ok(calls.every((l) => /^[A-Za-z0-9_-]{11}$/.test(l.requestId)), JSON.stringify(calls));
        assert.notEqual(calls[0].requestId, calls[1].requestId);
    } finally {
        await close();
        await server.close();
    }
});
