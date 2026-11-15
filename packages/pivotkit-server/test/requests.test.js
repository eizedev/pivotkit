// What every request carries through the server: its id (on the log line, in a source's code, in a
// problem that names it), the caller fields a log line may hold (an allowlist), the body size cap
// decided after the sign-in, and the scopes the metadata offers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { OperationError } from "pivotkit-report/operations";
import { SIGNED_IN, serveFetch } from "pivotkit-server";
import { BODY_BYTES, MAX_BODY_BYTES, bodyCapOf, peekSignIn } from "../src/listen.js";
import { bodyBytesOf } from "../src/limits.js";
import { CALLER_LOG_FIELDS, callerFields } from "../src/log.js";
import { REQUEST_ID, errorDetails, requestId, withRequestId } from "../src/request-id.js";
import { offeredScopes } from "../src/scopes.js";
import { problem, problemOf, serverTextOf } from "../src/rest/problem.js";
import { slowOn } from "../src/sources/params.js";
import { BY_REGION, TOKEN, call, raw, restServer, workspace } from "./helpers.js";

test("request ids: every REST request's log line has its own id; the file route's download line has its request's", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, policy: { results: true }, baseDir: dir });
    try {
        await call(`${server.api}/sources`);
        await call(`${server.api}/views/validate`, { body: { source: "sales", view: BY_REGION } });
        const file = await call(`${server.api}/views/render/file`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(file.status, 200);
        const requests = server.log.filter((l) => l.event === "request");
        assert.equal(requests.length, 3);
        for (const line of requests) {
            assert.match(line.requestId, REQUEST_ID);
        }
        assert.equal(new Set(requests.map((l) => l.requestId)).size, 3, "one id per request");
        const download = server.log.find((l) => l.event === "download");
        assert.equal(download.requestId, requests[2].requestId);
    } finally {
        await server.close();
    }
});

test("request ids: a code source's load runs inside its request's id, on REST and MCP, also when two calls overlap on one worker", async () => {
    const dir = workspace();
    /** @type {Array<{ team: string, id: string | null }>} */
    const seen = [];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const load = async (params) => {
        seen.push({ team: params.team, id: requestId() });
        // the first call waits, so the second one starts while it runs
        if (params.team === "a") {
            await gate;
        }
        // the second call fails, so its log line (status 500) tells the two apart
        if (params.team === "b") {
            throw new Error("the backend is down");
        }
        return [{ Team: params.team, Sales: 1 }];
    };
    const server = await restServer({ sources: { tickets: { load, params: { team: { type: "string", enum: ["a", "b", "c"] } }, policy: { default: "show" } } }, compute: { workers: 1 }, baseDir: dir }, { enable: ["rest", "mcp"] });
    const client = new Client({ name: "ids", version: "1.0.0" });
    try {
        const view = { rows: ["Team"], values: [{ field: "Sales", agg: "sum" }] };
        const first = call(`${server.api}/views/validate`, { body: { source: "tickets", params: { team: "a" }, view } });
        while (!seen.length) {
            await new Promise((r) => setTimeout(r, 5));
        }
        const second = call(`${server.api}/views/validate`, { body: { source: "tickets", params: { team: "b" }, view } });
        while (seen.length < 2) {
            await new Promise((r) => setTimeout(r, 5));
        }
        release();
        assert.equal((await first).status, 200);
        assert.equal((await second).status, 500);
        await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
        const tool = await client.callTool({ name: "validate_view", arguments: { source: "tickets", params: { team: "c" }, view } });
        assert.ok(!tool.isError, JSON.stringify(tool.content));
        const byTeam = Object.fromEntries(seen.map((s) => [s.team, s.id]));
        const requests = server.log.filter((l) => l.event === "request");
        assert.equal(byTeam.a, requests.find((l) => l.status === 200).requestId);
        assert.equal(byTeam.b, requests.find((l) => l.status === 500).requestId);
        assert.notEqual(byTeam.a, byTeam.b);
        // the error line of the failed call names the same request
        assert.equal(server.log.find((l) => l.event === "error").requestId, byTeam.b);
        const mcpCall = server.log.find((l) => l.event === "call");
        assert.match(mcpCall.requestId, REQUEST_ID);
        assert.equal(byTeam.c, mcpCall.requestId);
    } finally {
        await client.close();
        await server.close();
    }
});

test("problems: an error with details carries requestId, retryable and Retry-After; one without stays as it was", async () => {
    const details = await withRequestId("AAAAAAAAAAA", () => errorDetails({ retryable: true, retryAfter: 30 }));
    const unavailable = problemOf(new OperationError("SOURCE_UNAVAILABLE", "the backend at 10.0.0.7 said ECONNREFUSED", details));
    assert.equal(unavailable.status, 502);
    assert.equal(unavailable.headers.get("retry-after"), "30");
    const body = await unavailable.json();
    assert.equal(body.requestId, "AAAAAAAAAAA");
    assert.equal(body.retryable, true);
    // a 5xx never carries the error's own words (an address, an errno): a fixed text
    assert.equal(body.detail, "the source is not available right now; if it stays so, give the operator the request id");
    const upload = await problemOf(new OperationError("UPLOAD_FAILED", "PUT https://store.internal/x: 403", { requestId: "BBBBBBBBBBB", retryable: false })).json();
    assert.deepEqual([upload.detail, upload.requestId, upload.retryable], ["the report was made but could not be stored; give the operator the request id", "BBBBBBBBBBB", false]);
    const noRetryAfter = problemOf(new OperationError("SOURCE_UNAVAILABLE", "x", { requestId: "CCCCCCCCCCC", retryable: false }));
    assert.equal(noRetryAfter.headers.get("retry-after"), null);
    // without details: byte for byte what problem() gives, as before
    const plain = problemOf(new OperationError("SOURCE_NOT_FOUND", 'no source "x"'));
    assert.equal(await plain.text(), await problem("SOURCE_NOT_FOUND", 'no source "x"').text());
    assert.equal(problemOf(new OperationError("BUSY", "busy")).headers.get("retry-after"), "5");
    assert.equal((await problemOf(new Error("secret at /etc/x")).json()).detail, "internal error");
    // a requestId that is not one of ours (a source's own text) is not passed on: the request's own id is
    const forged = await withRequestId("DDDDDDDDDDD", () => problemOf(new OperationError("SOURCE_UNAVAILABLE", "x", { requestId: "<script>alert(1)</script>", retryable: true })).json());
    assert.equal(forged.requestId, "DDDDDDDDDDD");
    const outside = await problemOf(new OperationError("SOURCE_UNAVAILABLE", "x", { requestId: "not an id", retryable: true })).json();
    assert.equal(outside.requestId, undefined);
    // inside a request every problem names its id, with or without details
    const inRequest = await withRequestId("EEEEEEEEEEE", () => problemOf(new OperationError("FILE_NOT_AVAILABLE", "the source sales is not available now")).json());
    assert.equal(inRequest.requestId, "EEEEEEEEEEE");
    // the fixed texts are one table, MCP uses it too
    assert.equal(serverTextOf("SOURCE_UNAVAILABLE"), body.detail);
    assert.equal(serverTextOf("TIMEOUT"), "the report took longer than the server allows; make the view smaller or filter more");
    assert.equal(serverTextOf("SOMETHING_NEW"), "internal error");
});

test("request ids: every REST error answer carries its request's id, the same as on its log line", async () => {
    const dir = workspace();
    const broken = async () => {
        throw new Error("db at 10.1.2.3 refused");
    };
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" }, gone: { file: "data/missing.csv" }, broken: { load: broken } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] }, baseDir: dir }, { env: { BOT: TOKEN } });
    try {
        const answers = {
            internal: await call(`${server.api}/sources/broken`, { token: TOKEN }),
            gone: await call(`${server.api}/sources/gone`, { token: TOKEN }),
            unknown: await call(`${server.api}/sources/nope`, { token: TOKEN }),
            noToken: await call(`${server.api}/sources`),
            refusedPost: await call(`${server.api}/views/validate`, { body: { source: "sales", view: BY_REGION } }),
            badJson: await call(`${server.api}/views/validate`, { body: "{", token: TOKEN })
        };
        assert.deepEqual(Object.values(answers).map((a) => a.status), [500, 404, 404, 401, 401, 400]);
        for (const [name, answer] of Object.entries(answers)) {
            assert.match(answer.data.requestId ?? "", REQUEST_ID, name);
            const line = server.log.find((l) => l.requestId === answer.data.requestId && (l.event === "request" || l.event === "refused"));
            assert.ok(line, `${name}: a log line with ${answer.data.requestId}: ${JSON.stringify(server.log)}`);
        }
        assert.equal(answers.internal.data.detail, "internal error");
        assert.equal(server.log.find((l) => l.event === "error").requestId, answers.internal.data.requestId);
        // a successful answer has no id in its body (it is not a problem)
        const ok = await call(`${server.api}/sources`, { token: TOKEN });
        assert.equal(ok.data.requestId, undefined);
    } finally {
        await server.close();
    }
});

test("body size: a 413 names its request's id, in the answer and on a log line, declared or found while the body streams", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] }, baseDir: dir }, { env: { BOT: TOKEN } });
    try {
        const big = JSON.stringify({ source: "sales", view: BY_REGION, pad: "x".repeat(BODY_BYTES) });
        const declared = await raw(`${server.api}/views/validate`, { method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(big)) }, body: big });
        const streamed = await raw(`${server.api}/views/validate`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: big });
        for (const answer of [declared, streamed]) {
            assert.equal(answer.status, 413);
            assert.equal(answer.data.code, "BODY_TOO_LARGE");
            assert.match(answer.data.requestId ?? "", REQUEST_ID);
            assert.ok(server.log.some((l) => l.event === "refused" && l.status === 413 && l.requestId === answer.data.requestId), JSON.stringify(server.log));
        }
    } finally {
        await server.close();
    }
});

test("log: only the allowlisted caller fields reach a line, never groups, claims, subject, issuer, scopes or a token", () => {
    assert.deepEqual(CALLER_LOG_FIELDS, ["client"]);
    const caller = { client: "report-bot", profile: "finance", scopes: new Set(["pivotkit"]), subject: "u-123", issuer: "https://idp.example", groups: ["finance-secret-group"], claims: { customer: "acme-secret" }, token: "eyJ.secret" };
    assert.deepEqual(callerFields(caller), { client: "report-bot" });
    assert.deepEqual(callerFields({ client: { toString: () => "x" } }), {});
    assert.deepEqual(callerFields(null), {});
});

test("body size: a cap given as a function is decided after the precheck signed the caller in, for the drain of a refusal too", async () => {
    const seen = [];
    const handler = {
        async precheck(request, info) {
            if (request.headers.get("authorization") === "Bearer refuse") {
                return new Response("no", { status: 401 });
            }
            if (request.headers.get("authorization") === "Bearer big") {
                info[SIGNED_IN] = { caller: { client: "big" } };
            }
            return null;
        },
        async fetch(request, info) {
            // the route still finds the sign-in: the cap only looked
            const body = await request.text();
            return Response.json({ bytes: body.length, signedIn: Boolean(info[SIGNED_IN]) });
        }
    };
    const bodyBytes = (request, info) => {
        seen.push(Boolean(peekSignIn(info)));
        return peekSignIn(info) ? 100 : 10;
    };
    const listening = await serveFetch(handler, { host: "127.0.0.1", port: 0, bodyBytes });
    const url = `http://127.0.0.1:${listening.port}/x`;
    try {
        // no Content-Length (chunked): only the cap read while the body streams can stop it
        assert.equal((await raw(url, { method: "POST", body: "x".repeat(50) })).status, 413, "50 bytes over the 10 of a stranger");
        const signed = await raw(url, { method: "POST", headers: { authorization: "Bearer big" }, body: "x".repeat(50) });
        assert.deepEqual([signed.status, signed.data], [200, { bytes: 50, signedIn: true }]);
        assert.equal((await raw(url, { method: "POST", headers: { authorization: "Bearer big" }, body: "x".repeat(150) })).status, 413);
        assert.deepEqual(seen, [false, true, true]);
        // a refused precheck: the cap is decided for it too (the drain stops at 4 x the stranger's cap)
        const refused = await raw(url, { method: "POST", headers: { authorization: "Bearer refuse" }, body: "x".repeat(30) });
        assert.equal(refused.status, 401);
        assert.deepEqual(seen, [false, true, true, false]);
    } finally {
        await listening.close();
    }
});

test("body size: a function that gives no usable number falls back to BODY_BYTES; the number form works as before", async () => {
    for (const odd of [NaN, 0, -1, "100", 1.5, Infinity]) {
        const listening = await serveFetch({ fetch: async (request) => Response.json({ bytes: (await request.text()).length }) }, { host: "127.0.0.1", port: 0, bodyBytes: () => /** @type {any} */ (odd) });
        try {
            const ok = await raw(`http://127.0.0.1:${listening.port}/`, { method: "POST", body: "x".repeat(5000) });
            assert.deepEqual([ok.status, ok.data], [200, { bytes: 5000 }], String(odd));
        } finally {
            await listening.close();
        }
    }
    assert.equal(bodyBytesOf({})(new Request("http://x/"), {}), BODY_BYTES);
});

test("body size: a cap function gives a stranger at most BODY_BYTES, a signed-in caller at most MAX_BODY_BYTES", () => {
    const head = new Request("http://x/", { method: "POST" });
    const huge = () => 10 * MAX_BODY_BYTES;
    assert.equal(bodyCapOf(huge, head, {}), BODY_BYTES, "not signed in: never more than the default");
    assert.equal(bodyCapOf(() => BODY_BYTES * 5, head, {}), BODY_BYTES);
    assert.equal(bodyCapOf(huge, head, { [SIGNED_IN]: { caller: {} } }), MAX_BODY_BYTES);
    assert.equal(bodyCapOf(() => 20_971_520, head, { [SIGNED_IN]: { caller: {} } }), 20_971_520);
    // smaller caps pass as given; the number form is the host's own
    assert.equal(bodyCapOf(() => 10, head, {}), 10);
    assert.equal(bodyCapOf(1024, head, {}), 1024);
});

test("body size: the REST service refuses a body over 2 MiB with and without a token, as before", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] }, baseDir: dir }, { env: { BOT: TOKEN } });
    try {
        const big = JSON.stringify({ source: "sales", view: BY_REGION, pad: "x".repeat(BODY_BYTES) });
        const length = { "content-length": String(Buffer.byteLength(big)) };
        // declared: refused before the sign-in, as before
        for (const headers of [length, { ...length, authorization: `Bearer ${TOKEN}` }]) {
            const answer = await raw(`${server.api}/views/validate`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: big });
            assert.equal(answer.status, 413, JSON.stringify(headers));
        }
        // not declared (chunked): a stranger is refused by the sign-in, a signed-in caller by the cap
        const stranger = await raw(`${server.api}/views/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: big });
        assert.equal(stranger.status, 401);
        const signed = await raw(`${server.api}/views/validate`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: big });
        assert.equal(signed.status, 413);
    } finally {
        await server.close();
    }
});

test("scopes: what the metadata offers is scopesSupported, else the surface's required scopes, else nothing", () => {
    assert.deepEqual(offeredScopes({ auth: { scopesSupported: ["a", "b"], requiredScopes: ["a"] } }, "mcp"), ["a", "b"]);
    assert.deepEqual(offeredScopes({ auth: { requiredScopes: ["pivotkit"] } }, "mcp"), ["pivotkit"]);
    // an empty scopesSupported next to required scopes gives an empty list, as it always did
    assert.deepEqual(offeredScopes({ auth: { scopesSupported: [], requiredScopes: ["pivotkit"] } }, "mcp"), []);
    assert.equal(offeredScopes({ auth: {} }, "mcp"), null);
    assert.equal(offeredScopes({ auth: { scopesSupported: [] } }, "rest"), null);
    assert.deepEqual(offeredScopes({ auth: { requiredScopes: ["pivotkit"] }, rest: { requiredScopes: ["pivotkit:rest"] } }, "rest"), ["pivotkit:rest"]);
    assert.deepEqual(offeredScopes({ auth: { requiredScopes: ["pivotkit"] }, rest: { requiredScopes: ["pivotkit:rest"] } }, "mcp"), ["pivotkit"]);
});

test("params: a pattern that ran out of time once is tried once more before it is refused as slow", () => {
    const re = /^[a-z]+$/;
    let calls = 0;
    // a busy host: the first try of one value runs out of time, the second one does not
    const flaky = (r, text) => (calls++ === 0 ? null : r.test(text));
    assert.equal(slowOn(re, 8, flaky), false);
    assert.ok(calls > 1);
    // slow on both tries: refused
    assert.equal(slowOn(re, 8, () => null), true);
});
