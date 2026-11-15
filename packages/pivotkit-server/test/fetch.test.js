// guardedFetch, the one way the server makes a request to another server: https only, no redirect,
// the address checked where the socket connects (also a name that resolves to a forbidden one, and
// IPv4-mapped IPv6), bodies counted after decompression while they stream, one time limit for all.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { tempDir } from "./helpers.js";
import { GuardedFetchError, addressRefusal, createGuardedFetch, guardedFetch } from "../src/sources/fetch.js";

let server;
let base;
let connections = 0;
const requests = [];

before(async () => {
    server = createServer((req, res) => {
        requests.push(req.url);
        const path = new URL(req.url ?? "/", "http://x").pathname;
        if (path === "/ok") {
            res.writeHead(200, { "content-type": "application/json", "x-thing": "1" });
            res.end(JSON.stringify({ ok: true }));
        } else if (path === "/gzip") {
            res.writeHead(200, { "content-encoding": "gzip" });
            res.end(gzipSync(JSON.stringify({ zipped: true })));
        } else if (path === "/bomb") {
            // 16 MiB of zeros, a few KiB on the wire
            res.writeHead(200, { "content-encoding": "gzip" });
            res.end(gzipSync(Buffer.alloc(16 * 1_048_576)));
        } else if (path === "/large") {
            res.writeHead(200, { "content-length": String(2 * 1_048_576) });
            res.end(Buffer.alloc(2 * 1_048_576, 120));
        } else if (path === "/chunked") {
            res.writeHead(200);
            let sent = 0;
            const more = () => {
                while (sent < 4 * 1_048_576) {
                    sent += 65_536;
                    if (!res.write(Buffer.alloc(65_536, 120))) {
                        res.once("drain", more);
                        return;
                    }
                }
                res.end();
            };
            more();
        } else if (path === "/trickle") {
            res.writeHead(200);
            const timer = setInterval(() => res.write("x"), 50);
            res.on("close", () => clearInterval(timer));
        } else if (path === "/redirect") {
            res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
            res.end();
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    server.on("connection", () => connections++);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

/** A guardedFetch that may use plain http to loopback (this test's server). */
const local = createGuardedFetch({ allowHttpLoopback: true });

/** A lookup that answers what `answers` says, counting its calls. */
function stubLookup(answers) {
    const stub = (hostname, options, callback) => {
        stub.calls++;
        const list = typeof answers === "function" ? answers(stub.calls, hostname) : answers;
        if (options.all) {
            callback(null, list);
        } else {
            callback(null, list[0].address, list[0].family);
        }
    };
    stub.calls = 0;
    return stub;
}

/** The code of the error a request ends with. */
async function codeOf(promise) {
    try {
        await promise;
    } catch (e) {
        assert.ok(e instanceof GuardedFetchError, String(e?.stack ?? e));
        return e.code;
    }
    return "ok";
}

test("a request to loopback works: status, lower-case headers, the body decoded (also gzip)", async () => {
    const plain = await local(`${base}/ok`);
    assert.equal(plain.status, 200);
    assert.equal(plain.headers["x-thing"], "1");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(plain.body)), { ok: true });
    const zipped = await local(`${base}/gzip`);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(zipped.body)), { zipped: true });
});

test("only https: plain http is refused unless allowed, and then only to a loopback address", async () => {
    assert.equal(await codeOf(guardedFetch(`${base}/ok`)), "NOT_HTTPS");
    assert.equal(await codeOf(guardedFetch("ftp://example.com/x")), "NOT_HTTPS");
    assert.equal(await codeOf(guardedFetch("not a url")), "BAD_URL");
    // allowed for loopback only: a private address by name or as a literal is not loopback
    const lookup = stubLookup([{ address: "10.0.0.7", family: 4 }]);
    assert.equal(await codeOf(createGuardedFetch({ allowHttpLoopback: true, lookup })("http://internal.test/x")), "NOT_HTTPS");
    assert.equal(await codeOf(local("http://10.0.0.7/x")), "NOT_HTTPS");
});

test("an address with a user name or password is refused before anything is sent", async () => {
    const before = requests.length;
    assert.equal(await codeOf(local(`http://user:pass@127.0.0.1:${server.address().port}/ok`)), "USERINFO");
    assert.equal(await codeOf(guardedFetch("https://user@example.com/")), "USERINFO");
    assert.equal(requests.length, before);
});

test("metadata, link-local and unspecified addresses are refused as literals in every spelling, without a lookup", async () => {
    const lookup = stubLookup([{ address: "8.8.8.8", family: 4 }]);
    const fetcher = createGuardedFetch({ allowHttpLoopback: true, lookup });
    const literals = [
        "http://169.254.169.254/latest/meta-data/",
        "http://[::ffff:169.254.169.254]/",
        "http://[::ffff:a9fe:a9fe]/",
        "http://2852039166/",
        "http://0xa9.0xfe.0xa9.0xfe/",
        "http://0251.0376.0251.0376/",
        "http://[fd00:ec2::254]/",
        "http://100.100.100.200/",
        "http://0.0.0.0/",
        "http://[::]/",
        "http://[fe80::1]/",
        "http://224.0.0.1/",
        "http://255.255.255.255/",
        "http://[64:ff9b::a9fe:a9fe]/",
        "https://169.254.169.254/"
    ];
    for (const url of literals) {
        assert.equal(await codeOf(fetcher(url, { timeMs: 2000 })), "REFUSED_ADDRESS", url);
    }
    assert.equal(lookup.calls, 0, "a literal is never looked up");
});

test("a name that resolves to a metadata address, a mapped one or a mix with a public one is refused at connect time", async () => {
    for (const answers of [[{ address: "169.254.169.254", family: 4 }], [{ address: "::ffff:169.254.169.254", family: 6 }], [{ address: "::ffff:a9fe:a9fe", family: 6 }], [{ address: "8.8.8.8", family: 4 }, { address: "169.254.169.254", family: 4 }], [{ address: "fd00:ec2::254", family: 6 }]]) {
        const lookup = stubLookup(answers);
        const code = await codeOf(createGuardedFetch({ lookup })("https://metadata.example.test/x", { timeMs: 2000 }));
        assert.equal(code, "REFUSED_ADDRESS", JSON.stringify(answers));
        assert.equal(lookup.calls, 1);
    }
});

test("allowPrivate: false refuses loopback and private addresses, by name (the system's resolver) and as literals", async () => {
    const before = connections;
    assert.equal(await codeOf(local(`http://localhost:${server.address().port}/ok`, { allowPrivate: false })), "REFUSED_ADDRESS");
    assert.equal(await codeOf(local(`${base}/ok`, { allowPrivate: false })), "REFUSED_ADDRESS");
    assert.equal(await codeOf(guardedFetch("https://10.1.2.3/", { allowPrivate: false })), "REFUSED_ADDRESS");
    assert.equal(await codeOf(guardedFetch("https://[::ffff:192.168.1.1]/", { allowPrivate: false })), "REFUSED_ADDRESS");
    assert.equal(await codeOf(guardedFetch("https://[fd12::1]/", { allowPrivate: false })), "REFUSED_ADDRESS");
    assert.equal(connections, before, "nothing reached the server");
    // allowed by default (internal APIs)
    assert.equal((await local(`http://localhost:${server.address().port}/ok`)).status, 200);
});

test("the address is checked where the socket connects: one lookup, and a later answer is never used", async () => {
    // a check before the request followed by a connect would ask twice and reach the second answer
    // (this test's server on loopback); the guard asks once, on the connection itself
    const before = connections;
    const lookup = stubLookup((n) => (n === 1 ? [{ address: "192.0.2.1", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]));
    const code = await codeOf(createGuardedFetch({ lookup })(`https://rebind.example.test:${server.address().port}/ok`, { timeMs: 400, allowPrivate: false }));
    assert.ok(["TIMEOUT", "NETWORK"].includes(code), code);
    assert.equal(lookup.calls, 1);
    assert.equal(connections, before);
});

test("a redirect is refused, not followed", async () => {
    const before = requests.length;
    const error = await local(`${base}/redirect`).catch((e) => e);
    assert.equal(error.code, "REDIRECT");
    assert.equal(error.status, 302);
    assert.equal(requests.length, before + 1, "only the first request was made");
});

test("bodies over maxBytes are cut: with a Content-Length, streamed, and a gzip bomb counted after decompression", async () => {
    assert.equal(await codeOf(local(`${base}/large`, { maxBytes: 1_048_576 })), "TOO_LARGE");
    assert.equal(await codeOf(local(`${base}/chunked`, { maxBytes: 1_048_576 })), "TOO_LARGE");
    const started = Date.now();
    assert.equal(await codeOf(local(`${base}/bomb`, { maxBytes: 1_048_576 })), "TOO_LARGE");
    assert.ok(Date.now() - started < 5000);
    // under the limit it is read whole
    assert.equal((await local(`${base}/large`, { maxBytes: 3 * 1_048_576 })).body.length, 2 * 1_048_576);
});

test("a server that trickles its answer is cut at timeMs, the whole request counted", async () => {
    const started = Date.now();
    const error = await local(`${base}/trickle`, { timeMs: 300 }).catch((e) => e);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(error.transient, true);
    assert.ok(Date.now() - started < 2000, `ended after ${Date.now() - started} ms`);
});

test("a cancelled signal ends the request; headers of the connection and line breaks are refused", async () => {
    const controller = new AbortController();
    const pending = local(`${base}/trickle`, { signal: controller.signal, timeMs: 5000 });
    setTimeout(() => controller.abort(), 50);
    assert.equal(await codeOf(pending), "ABORTED");
    for (const headers of [{ host: "evil.example" }, { "Transfer-Encoding": "chunked" }, { "proxy-authorization": "x" }, { "x-a": "1\r\nx-b: 2" }]) {
        assert.equal(await codeOf(local(`${base}/ok`, { headers })), "BAD_HEADER", JSON.stringify(headers));
    }
});

test("an error names no part of the address's path or query", async () => {
    const lookup = stubLookup([{ address: "169.254.169.254", family: 4 }]);
    const error = await createGuardedFetch({ lookup })("https://api.example.test/customers/secret-name?key=secret-value").catch((e) => e);
    assert.ok(!/secret/.test(error.message), error.message);
    const missing = await local(`http://127.0.0.1:1/x?key=secret-value`).catch((e) => e);
    assert.equal(missing.code, "NETWORK");
    assert.equal(missing.transient, true);
    assert.ok(!/secret/.test(missing.message), missing.message);
});

test("addressRefusal: the rules by range", () => {
    const always = ["0.1.2.3", "169.254.1.1", "100.100.100.200", "224.0.0.251", "240.0.0.1", "::", "fe80::1", "febf::1", "ff02::fb", "fd00:ec2::254", "::ffff:0.0.0.0", "::ffff:169.254.169.254", "64:ff9b::169.254.169.254", "not an ip"];
    const privateOnes = ["127.0.0.1", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1", "100.64.0.1", "::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "fd00:ec2::253"];
    const open = ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2001:4860:4860::8888"];
    for (const a of always) {
        assert.equal(addressRefusal(a), "always", a);
        assert.equal(addressRefusal(a, { allowPrivate: false }), "always", a);
    }
    for (const a of privateOnes) {
        assert.equal(addressRefusal(a), null, a);
        assert.equal(addressRefusal(a, { allowPrivate: false }), "private", a);
    }
    for (const a of open) {
        assert.equal(addressRefusal(a, { allowPrivate: false }), null, a);
    }
});

test("https: a server whose certificate is trusted answers; a redirect over https is refused too; an untrusted one fails", async () => {
    // a certificate made for this run (openssl), so no key is kept in the repository
    const dir = tempDir();
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    const cert = readFileSync(join(dir, "cert.pem"));
    const tls = createTlsServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
        if (req.url === "/moved") {
            res.writeHead(301, { location: "https://localhost/elsewhere" });
            res.end();
            return;
        }
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("secure");
    });
    await new Promise((resolve) => tls.listen(0, "127.0.0.1", resolve));
    const port = tls.address().port;
    try {
        const trusted = createGuardedFetch({ ca: cert });
        const answer = await trusted(`https://localhost:${port}/`);
        assert.equal(new TextDecoder().decode(answer.body), "secure");
        assert.equal(await codeOf(trusted(`https://localhost:${port}/moved`)), "REDIRECT");
        assert.equal(await codeOf(trusted(`https://localhost:${port}/`, { allowPrivate: false })), "REFUSED_ADDRESS");
        // the system's authorities do not know this certificate
        assert.equal(await codeOf(guardedFetch(`https://localhost:${port}/`)), "NETWORK");
    } finally {
        await new Promise((resolve) => tls.close(resolve));
    }
});
