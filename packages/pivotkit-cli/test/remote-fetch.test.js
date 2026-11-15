// The client's way to an address that is not loopback: Node's fetch (remote.js). The fake server is on
// loopback, so the client is told the address is not, to run that way in-process: a 200, a problem, a
// redirect returned and not followed, an answer whose size is over the cap only after decoding, a cut
// answer and a timeout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { RemoteError } from "../src/errors.js";
import { ANSWER_BYTES, createClient, serverOf } from "../src/remote.js";
import { tempDir } from "./helpers.js";

const TOKEN = "fetch-token-SECRET-0123456789abcdefghijkl";

/** A fake server; `handler(req, res)` answers. */
async function fakeServer(handler) {
    const server = createServer((req, res) => {
        req.resume();
        req.on("end", () => handler(req, res));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { url: `http://127.0.0.1:${server.address().port}/api/v1`, close: () => new Promise((resolve) => server.closeAllConnections() || server.close(resolve)) };
}

/** A client that takes the fetch way to the server, with `values` as the command line gives them. */
function clientOf(server, values = {}) {
    const target = { ...serverOf({ url: server.url }, {}), loopback: false };
    const ctx = { io: { env: { PIVOTKIT_TOKEN: TOKEN }, cwd: tempDir("pivotkit-fetch-") }, allow: [] };
    return createClient({ server: target, values: { url: server.url, ...values }, ctx, userAgent: "pivotkit-cli/test" });
}

/** The RemoteError a promise rejects with. */
async function remoteError(promise) {
    try {
        await promise;
    } catch (e) {
        assert.ok(e instanceof RemoteError, String(e));
        assert.ok(!e.message.includes(TOKEN));
        return e;
    }
    assert.fail("no error");
}

test("fetch: a 200 with the token, a problem with its code and the token taken out of detail", async () => {
    const server = await fakeServer((req, res) => {
        if (req.url.endsWith("/sources")) {
            assert.equal(req.headers.authorization, `Bearer ${TOKEN}`);
            res.writeHead(200, { "content-type": "application/json" });
            return res.end(JSON.stringify({ sources: [{ id: "sales" }] }));
        }
        res.writeHead(429, { "content-type": "application/problem+json", "retry-after": "3" });
        res.end(JSON.stringify({ code: "RATE_LIMITED", status: 429, detail: `slow down ${req.headers.authorization}` }));
    });
    try {
        const client = clientOf(server);
        assert.deepEqual((await client.json("GET", "sources")).data, { sources: [{ id: "sales" }] });
        const e = await remoteError(client.json("GET", "sources/sales"));
        assert.deepEqual([e.code, e.status, e.retryAfter], ["RATE_LIMITED", 429, 3]);
        assert.match(e.message, /slow down Bearer …/);
    } finally {
        await server.close();
    }
});

test("fetch: a redirect comes back as REDIRECT and is not followed", async () => {
    let requests = 0;
    const server = await fakeServer((req, res) => {
        requests++;
        res.writeHead(302, { location: "/api/v1/elsewhere" });
        res.end();
    });
    try {
        const e = await remoteError(clientOf(server).json("GET", "sources"));
        assert.deepEqual([e.code, e.status], ["REDIRECT", 302]);
        assert.equal(requests, 1);
    } finally {
        await server.close();
    }
});

test("fetch: the size cap counts the answer after decoding (a small gzip that unpacks over 5 MB)", async () => {
    const big = gzipSync(JSON.stringify({ sources: [], pad: "x".repeat(ANSWER_BYTES.json + 1024) }));
    assert.ok(big.length < 100_000);
    const server = await fakeServer((req, res) => {
        res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip", "content-length": String(big.length) });
        res.end(big);
    });
    try {
        const e = await remoteError(clientOf(server).json("GET", "sources"));
        assert.equal(e.code, "ANSWER_TOO_LARGE");
    } finally {
        await server.close();
    }
});

test("fetch: a cut answer and a timeout", async () => {
    const cut = await fakeServer((req, res) => {
        res.writeHead(200, { "content-type": "text/csv;charset=utf-8", "content-length": "1000" });
        res.write("Region,Sum\n");
        setTimeout(() => res.socket.destroy(), 50);
    });
    try {
        const e = await remoteError(clientOf(cut).file({ source: "sales", view: "{}", format: "csv" }));
        assert.equal(e.code, "ANSWER_CUT");
    } finally {
        await cut.close();
    }
    const silent = await fakeServer(() => undefined);
    try {
        const e = await remoteError(clientOf(silent, { timeout: "1" }).json("GET", "sources"));
        assert.deepEqual([e.code, e.status], ["TIMEOUT", null]);
    } finally {
        await silent.close();
    }
});
