// What the HTTP server lets in before a request reaches a route: connections in all and per address
// with room kept for loopback, slow clients, and request targets that are not a path; and the
// sign-in settings checked at start (a static token no request could send, OAuth without scopes),
// and an issuer whose jwks_uri moves while the server runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { CONNECTION_LIMITS, connectionGate, connectionLimitsOf, refusedText } from "../src/listen.js";
import { serveFetch } from "pivotkit-server";
import { BIN, TOKEN, call, restServer, workspace } from "./helpers.js";

/** Sends raw bytes and gives back what the server answers (until it closes or `ms` pass). */
function rawExchange(port, text, ms = 3000) {
    return new Promise((resolve) => {
        let got = "";
        const socket = connect(port, "127.0.0.1", () => socket.write(text));
        socket.on("data", (c) => {
            got += c.toString("latin1");
        });
        const done = () => resolve(got);
        socket.on("close", done);
        socket.on("error", done);
        setTimeout(() => {
            socket.destroy();
            done();
        }, ms).unref();
    });
}

test("CONNECTION_LIMITS: the defaults", () => {
    assert.deepEqual({ ...CONNECTION_LIMITS }, { total: 256, perAddress: 0, loopback: 16, headersMs: 5_000, requestMs: 30_000, checkMs: 1_000 });
});

test("connections: one address gets perAddress, the network gets all but the loopback slots, loopback the rest", () => {
    const gate = connectionGate({ total: 6, perAddress: 2, loopback: 2 });
    assert.equal(gate.admit("203.0.113.1"), true);
    assert.equal(gate.admit("203.0.113.1"), true);
    assert.equal(gate.admit("203.0.113.1"), false, "a third from one address");
    assert.equal(gate.refusedBy, "perAddress");
    assert.equal(gate.admit("203.0.113.2"), true);
    assert.equal(gate.admit("::ffff:203.0.113.3"), true);
    assert.equal(gate.admit("203.0.113.4"), false, "the network may not take the loopback slots");
    assert.equal(gate.refusedBy, "loopbackReserve");
    assert.equal(gate.admit("::ffff:127.0.0.1"), true, "a health check still gets in");
    assert.equal(gate.admit("::1"), true);
    assert.equal(gate.admit("127.0.0.1"), false, "every slot taken");
    gate.release("203.0.113.1");
    assert.equal(gate.admit("203.0.113.1"), true, "a freed slot of the network");
    assert.equal(gate.admit("127.0.0.1"), false);
    assert.equal(gate.open(), 6);
    // behind a proxy the server trusts, every client has the proxy's address: no bound per address
    // no bound per address unless the operator sets one: behind NAT or a published port every client has one address
    assert.deepEqual(connectionLimitsOf({}), {});
    assert.deepEqual(connectionLimitsOf({ http: { trustProxy: true } }), {});
    assert.deepEqual(connectionLimitsOf({ http: { maxConnectionsPerAddress: 32 } }), { perAddress: 32 });
    const open = connectionGate({ ...CONNECTION_LIMITS, total: 6, loopback: 2 });
    for (let i = 0; i < 4; i++) {
        assert.equal(open.admit("203.0.113.9"), true, "one address may take every slot of the network");
    }
    assert.equal(open.admit("203.0.113.9"), false);
    assert.equal(open.admit("127.0.0.1"), true, "loopback keeps its slots");
});

test("serveFetch: stalled sockets past the limit are cut; a client that sends no headers is cut after headersMs", async () => {
    const listening = await serveFetch({ fetch: async () => Response.json({ ok: true }) }, { host: "127.0.0.1", port: 0, bodyBytes: 1024, limits: { total: 3, loopback: 0, perAddress: 3, headersMs: 500, requestMs: 1000, checkMs: 100 } });
    try {
        const stalled = [];
        for (let i = 0; i < 3; i++) {
            const socket = connect(listening.port, "127.0.0.1");
            await new Promise((r) => socket.once("connect", r));
            socket.write("GET / HTTP/1.1\r\n");
            socket.resume();
            stalled.push(socket);
        }
        // a fourth is cut at once
        const extra = await rawExchange(listening.port, "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n", 400);
        assert.equal(extra, "");
        // the stalled ones are timed out; then a request gets in again
        await Promise.all(stalled.map((s) => new Promise((r) => (s.destroyed ? r(undefined) : s.once("close", r)))));
        const answer = await rawExchange(listening.port, "GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
        assert.match(answer, /^HTTP\/1\.1 200/);
    } finally {
        await listening.close();
    }
});

test("refused connections are told once a minute with the address and counts; http.maxConnectionsPerAddress is checked", async () => {
    const told = [];
    const listening = await serveFetch({ fetch: async () => Response.json({ ok: true }) }, { host: "127.0.0.1", port: 0, bodyBytes: 1024, limits: { total: 1, loopback: 0, headersMs: 2000, requestMs: 3000, checkMs: 100 }, onRefused: (entry) => told.push(entry) });
    const held = connect(listening.port, "127.0.0.1");
    try {
        await new Promise((r) => held.once("connect", r));
        held.write("GET / HTTP/1.1\r\n");
        held.resume();
        for (let i = 0; i < 3; i++) {
            assert.equal(await rawExchange(listening.port, "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n", 300), "");
        }
        assert.equal(told.length, 1, JSON.stringify(told));
        assert.equal(told[0].open, 1);
        assert.equal(told[0].fromAddress, 1);
        assert.equal(told[0].refused, 1);
        assert.deepEqual(told[0].limits, ["total"]);
        assert.match(told[0].address, /127\.0\.0\.1/);
    } finally {
        held.destroy();
        await listening.close();
    }
    // the rest of the minute is told at close, not lost
    assert.equal(told.length, 2, JSON.stringify(told));
    assert.equal(told[1].refused, 2);
    assert.match(refusedText(told[1]), /every connection the server may hold was open/);
    const dir = workspace();
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, http: { maxConnectionsPerAddress: -1 }, baseDir: dir }), /http\.maxConnectionsPerAddress/);
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, http: { maxConnectionsPerAddress: 300 }, baseDir: dir }), /http\.maxConnectionsPerAddress: 0 \(no bound, the default\) to 256/);
    const bounded = await restServer({ sources: { sales: { file: "data/sales.csv" } }, http: { maxConnectionsPerAddress: 8 }, baseDir: dir });
    await bounded.close();
});

test("a request target that is not a path: the absolute form by its path, '*' 400, a tunnel nothing", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        const port = new URL(server.url).port;
        const absolute = await rawExchange(port, `GET http://localhost:${port}/api/v1/sources HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`);
        assert.match(absolute, /^HTTP\/1\.1 200/);
        assert.match(absolute, /"id":"sales"/);
        const star = await rawExchange(port, `OPTIONS * HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`);
        assert.match(star, /^HTTP\/1\.1 400/);
        // a tunnel (CONNECT host:port) nobody listens for: node:http closes the connection, nothing is served
        const authority = await rawExchange(port, `CONNECT localhost:${port} HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`);
        assert.doesNotMatch(authority, /^HTTP\/1\.1 [23]/);
    } finally {
        await server.close();
    }
});

test("a static token with characters a bearer token cannot carry is refused at start and in check-config", async () => {
    const dir = workspace();
    const bad = "a-test-token:that-is-long-enough!0123456789";
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] }, baseDir: dir }, { env: { BOT: bad } }), (e) => /the token "bot".*cannot carry.*make one with: node -e/.test(e.message));
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] } }));
    const check = spawnSync(process.execPath, [BIN, "check-config", "--config", config], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", BOT: bad } });
    assert.equal(check.status, 1, check.stdout);
    assert.match(check.stdout, /PROBLEM: the token bot \(\$BOT\) has characters a bearer token cannot carry/);
    // a good token still starts
    const ok = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] }, baseDir: dir }, { env: { BOT: TOKEN } });
    await ok.close();
});

/** A local issuer whose jwks_uri can move to another key set. */
async function movingIssuer() {
    const first = await generateKeyPair("RS256");
    const second = await generateKeyPair("RS256");
    const third = await generateKeyPair("RS256");
    const jwks = {
        "/jwks-c": { keys: [{ ...(await exportJWK(third.publicKey)), kid: "c", alg: "RS256", use: "sig" }] },
        "/jwks-a": { keys: [{ ...(await exportJWK(first.publicKey)), kid: "a", alg: "RS256", use: "sig" }] },
        "/jwks-b": { keys: [{ ...(await exportJWK(second.publicKey)), kid: "b", alg: "RS256", use: "sig" }] }
    };
    const state = { jwksPath: "/jwks-a", metadataReads: 0 };
    const server = createServer((req, res) => {
        if (req.url === "/.well-known/openid-configuration") {
            state.metadataReads++;
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ issuer: url, jwks_uri: `${url}${state.jwksPath}`, response_types_supported: ["code"] }));
        } else if (jwks[req.url ?? ""]) {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(jwks[req.url ?? ""]));
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
    const sign = (pair, kid) => new SignJWT({ scope: "pivotkit", client_id: "bot" }).setProtectedHeader({ alg: "RS256", kid }).setIssuer(url).setAudience("https://pk.example.com/api/v1").setExpirationTime("5m").sign(pair.privateKey);
    return { url, state, server, tokenA: () => sign(first, "a"), tokenB: () => sign(second, "b"), tokenC: () => sign(third, "c") };
}

test("oauth: a token signed with a key of a moved jwks_uri works without a restart; unknown keys do not read the metadata on every request", async () => {
    const issuer = await movingIssuer();
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "oauth", issuer: issuer.url, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, baseDir: dir });
    try {
        for (let i = 0; i < 50 && (await call(`${server.url}/readyz`)).status !== 200; i++) {
            await new Promise((r) => setTimeout(r, 100));
        }
        assert.equal((await call(`${server.api}/sources`, { token: await issuer.tokenA() })).status, 200);
        issuer.state.jwksPath = "/jwks-b";
        const reads = issuer.state.metadataReads;
        assert.equal((await call(`${server.api}/sources`, { token: await issuer.tokenB() })).status, 200, "the new key set is found");
        assert.equal(issuer.state.metadataReads, reads + 1);
        // a stream of tokens with unknown keys reads the metadata once, then not again within a minute
        const stranger = await generateKeyPair("RS256");
        for (let i = 0; i < 5; i++) {
            const token = await new SignJWT({ scope: "pivotkit" }).setProtectedHeader({ alg: "RS256", kid: `x${i}` }).setIssuer(issuer.url).setAudience("https://pk.example.com/api/v1").setExpirationTime("5m").sign(stranger.privateKey);
            assert.equal((await call(`${server.api}/sources`, { token })).status, 401);
        }
        assert.equal(issuer.state.metadataReads, reads + 2);
    } finally {
        await server.close();
        await new Promise((resolve) => issuer.server.close(resolve));
    }
});

test("oauth: a made-up key that triggers a read which finds a new key set does not hold back the next rotation", async () => {
    const issuer = await movingIssuer();
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "oauth", issuer: issuer.url, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, baseDir: dir });
    try {
        for (let i = 0; i < 50 && (await call(`${server.url}/readyz`)).status !== 200; i++) {
            await new Promise((r) => setTimeout(r, 100));
        }
        issuer.state.jwksPath = "/jwks-b";
        const stranger = await generateKeyPair("RS256");
        const made = await new SignJWT({ scope: "pivotkit" }).setProtectedHeader({ alg: "RS256", kid: "made-up" }).setIssuer(issuer.url).setAudience("https://pk.example.com/api/v1").setExpirationTime("5m").sign(stranger.privateKey);
        assert.equal((await call(`${server.api}/sources`, { token: made })).status, 401, "its read finds jwks-b, but the token is still not signed by it");
        issuer.state.jwksPath = "/jwks-c";
        assert.equal((await call(`${server.api}/sources`, { token: await issuer.tokenC() })).status, 200, "the next rotation is read at once");
    } finally {
        await server.close();
        await new Promise((resolve) => issuer.server.close(resolve));
    }
});

test("oauth without required scopes or tool scopes: REST warns at start, as MCP does", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "oauth", issuer: "http://127.0.0.1:9", resource: "https://pk.example.com/mcp", allowInsecureIssuer: true }, baseDir: dir });
    try {
        assert.ok(server.log.some((l) => l.event === "warning" && /REST/.test(l.message) && /scopes/.test(l.message)), JSON.stringify(server.log));
    } finally {
        await server.close();
    }
    const scoped = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "oauth", issuer: "http://127.0.0.1:9", resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"] }, baseDir: dir });
    try {
        assert.ok(!scoped.log.some((l) => l.event === "warning" && /REST: no required scopes/.test(l.message)));
    } finally {
        await scoped.close();
    }
});

test("a client that leaves before the answer starts: its streamed body is given up as soon as it comes, so what waits for its end (a caller's slot) is freed", async () => {
    let cancelled = false;
    const listening = await serveFetch(
        {
            // the answer comes 300 ms after the client left; its body would stream until a call ends
            fetch: async () => {
                await new Promise((resolve) => setTimeout(resolve, 300));
                return new Response(new ReadableStream({ cancel: () => void (cancelled = true) }), { headers: { "content-type": "text/event-stream" } });
            }
        },
        { host: "127.0.0.1", port: 0, bodyBytes: 1024 }
    );
    try {
        await new Promise((resolve) => {
            const socket = connect(listening.port, "127.0.0.1", () => {
                socket.write("POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}");
                setTimeout(() => {
                    socket.destroy();
                    resolve(undefined);
                }, 30);
            });
        });
        await new Promise((resolve) => setTimeout(resolve, 600));
        assert.equal(cancelled, true, "the body of an answer whose client already left is cancelled");
    } finally {
        await listening.close();
    }
});
