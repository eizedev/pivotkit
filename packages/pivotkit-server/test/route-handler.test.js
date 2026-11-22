// createRouteHandler: what every route family (REST, MCP, download links, serve) gets from it, with a
// family of its own made here. The families' own answers are covered by their tests over HTTP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { noteAnswered } from "../src/log.js";
import { requestId } from "../src/request-id.js";
import { createRouteHandler } from "../src/route-handler.js";

/** A context whose log keeps its refused lines with the request id they were written under. */
function contextOf(options = {}) {
    const lines = [];
    const log = { level: "info", refused: (entry, how = {}) => (noteAnswered(entry.status), lines.push({ ...entry, id: requestId(), level: how.level ?? "info" })), warn() {} };
    return { context: { log, options }, lines };
}

const request = (path, headers = {}) => new Request(`http://localhost${path}`, { headers });

test("precheck, fetch and the unreadable-body answer of one request name one id, in the header and on the line", async () => {
    const { context, lines } = contextOf();
    let released = 0;
    const routes = createRouteHandler(context, {
        check: async () => null,
        answer: async () => new Response("no", { status: 404 }),
        familyOf: () => ({ path: "/things", notFound: "info" }),
        release: () => released++,
        unreadable: { path: "/things", limitOf: () => 10, answer: (status, limit, id) => Response.json({ status, limit, id }, { status }) }
    });
    const info = { address: "192.0.2.1" };
    assert.equal(await routes.precheck(request("/things/a"), info), null);
    const answer = await routes.fetch(request("/things/a"), info);
    const id = answer.headers.get("x-request-id");
    assert.match(id, /^[A-Za-z0-9_-]{11}$/);
    // an error answer without a line of its own gets one, under the request's id, with the family's path and level
    assert.deepEqual(lines, [{ status: 404, path: "/things", reason: "not_found", id, level: "info" }]);
    assert.equal(released, 1);
    const unreadable = routes.problem(413, "/things/a", info);
    assert.equal(unreadable.headers.get("x-request-id"), id);
    assert.deepEqual(await unreadable.json(), { status: 413, limit: 10, id });
    assert.deepEqual(lines[1], { status: 413, path: "/things", reason: "body_too_large", limit: 10, id, level: "info" });
    assert.equal(released, 2);
});

test("an answer whose route wrote its own line gets no second one; finish touches every answer", async () => {
    const { context, lines } = contextOf();
    const routes = createRouteHandler(context, {
        check: async (req) => (req.headers.has("x-refuse") ? (context.log.refused({ status: 403, reason: "own" }), new Response("", { status: 403 })) : null),
        answer: async () => new Response("ok"),
        finish: (response) => new Response(response.body, { status: response.status, headers: { "x-finished": "1" } })
    });
    const refused = await routes.precheck(request("/", { "x-refuse": "1" }));
    assert.equal(refused.headers.get("x-finished"), "1");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].reason, "own");
    const ok = await routes.fetch(request("/"));
    assert.equal(ok.headers.get("x-finished"), "1");
    assert.ok(ok.headers.get("x-request-id"));
    assert.throws(() => routes.problem(400, "/"), TypeError);
});

test("with http.trustProxy the forwarded client is the request's address; without, the socket's peer", async () => {
    const seen = [];
    const { requestScope } = await import("../src/request-id.js");
    for (const trustProxy of [true, false]) {
        const { context } = contextOf({ http: { trustProxy } });
        const routes = createRouteHandler(context, { check: async () => null, answer: async () => (seen.push(requestScope()?.address), new Response("ok")) });
        await routes.fetch(request("/", { "x-forwarded-for": "198.51.100.7" }), { address: "::ffff:192.0.2.1" });
    }
    assert.deepEqual(seen, ["198.51.100.7", "192.0.2.1"]);
});
