// pivotkit-node/net: the readings pivotkit-cli and pivotkit-server share. The tables pin what each
// front end got from its own copy before the copies became one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLoopback, networkCodeOf, retryAfterSeconds } from "pivotkit-node/net";
import * as rest from "pivotkit-node/rest";

test("pivotkit-node/net exports the shared readings, and pivotkit-node/rest the same isLoopback", async () => {
    assert.deepEqual(Object.keys(await import("pivotkit-node/net")).sort(), ["ipBytes", "isLoopback", "networkCodeOf", "retryAfterSeconds"]);
    assert.equal(rest.isLoopback, isLoopback);
});

test("isLoopback reads a host as written: localhost, 127.0.0.0/8 dotted, ::1; no other spelling, no IPv4-mapped form", () => {
    for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "127.255.255.255", "::1", "[::1]", "[127.0.0.1]"]) assert.equal(isLoopback(host), true, host);
    const others = ["localhost.", "127.1", "128.0.0.1", "0.0.0.0", "::", "0:0:0:0:0:0:0:1", "0::1", "::1%lo0", "127.0.0.1%eth0", "::ffff:127.0.0.1", "[::ffff:7f00:1]", "127.example.com", "", undefined];
    for (const host of others) assert.equal(isLoopback(host), false, String(host));
});

test("isLoopback with address: true reads an address a lookup or a socket gave: every spelling, a zone dropped, IPv4-mapped too, never a name", () => {
    for (const address of ["127.0.0.1", "127.9.9.9", "::1", "[::1]", "0:0:0:0:0:0:0:1", "::0001", "::1%lo0", "127.0.0.1%eth0", "::ffff:127.0.0.1", "::FFFF:127.0.0.1", "[::ffff:7f00:1]"]) {
        assert.equal(isLoopback(address, { address: true }), true, address);
    }
    assert.equal(isLoopback("::ffff:127.0.0.1", null), false);
    for (const address of ["localhost", "::ffff:128.0.0.1", "::127.0.0.1", "::", "0.0.0.0", "10.0.0.1", "fe80::1%lo0", "", undefined]) {
        assert.equal(isLoopback(address, { address: true }), false, String(address));
    }
});

test("retryAfterSeconds reads seconds or an HTTP date, a past date as 0; nothing else", () => {
    const now = Date.now();
    assert.equal(retryAfterSeconds(" 5 "), 5);
    assert.equal(retryAfterSeconds("86401"), 86401);
    assert.equal(retryAfterSeconds(new Date(now - 60_000).toUTCString()), 0);
    const ahead = retryAfterSeconds(new Date(now + 120_000).toUTCString());
    assert.ok(ahead > 100 && ahead <= 120, String(ahead));
    for (const value of [undefined, null, "", " ", "1e3", "abc", 5, "9".repeat(400)]) assert.equal(retryAfterSeconds(value), null, String(value));
    // V8's Date.parse reads "-5" and "5.5" as dates of the past
    assert.equal(retryAfterSeconds("-5"), 0);
});

test("retryAfterSeconds with maxDigits reads a longer number as a date, as pivotkit-server always did", () => {
    assert.equal(retryAfterSeconds("9999999999", { maxDigits: 10 }), 9_999_999_999);
    assert.equal(retryAfterSeconds("99999999999", { maxDigits: 10 }), null);
    assert.equal(retryAfterSeconds("99999999999"), 99_999_999_999);
    // Date.parse reads eleven digits with leading zeros as a date of the past: 0, not 1
    assert.equal(retryAfterSeconds("00000000001", { maxDigits: 10 }), 0);
    assert.equal(retryAfterSeconds("00000000001"), 1);
});

test("networkCodeOf looks where each client puts the code; accept narrows what counts", () => {
    const coded = (code, more = {}) => Object.assign(new Error("failed"), { code }, more);
    const node = { client: "node" };
    const fetchLike = { client: "fetch" };
    // node:http(s): on the error, or on the first error of an AggregateError; never on a cause
    assert.equal(networkCodeOf(coded("ECONNRESET"), node), "ECONNRESET");
    assert.equal(networkCodeOf(Object.assign(new AggregateError([coded("ECONNREFUSED"), coded("ETIMEDOUT")]), { code: "ECONNREFUSED" }), node), "ECONNREFUSED");
    assert.equal(networkCodeOf(new AggregateError([coded("ETIMEDOUT")]), node), "ETIMEDOUT");
    assert.equal(networkCodeOf(new Error("x", { cause: coded("ECONNRESET") }), node), null);
    // fetch: on the cause first, then on the error, then one cause deeper; never in an AggregateError's list
    assert.equal(networkCodeOf(new TypeError("fetch failed", { cause: coded("UND_ERR_SOCKET") }), fetchLike), "UND_ERR_SOCKET");
    assert.equal(networkCodeOf(coded("EPIPE", { cause: coded("ECONNRESET") }), fetchLike), "ECONNRESET");
    assert.equal(networkCodeOf(new TypeError("fetch failed", { cause: new Error("x", { cause: coded("ENOTFOUND") }) }), fetchLike), "ENOTFOUND");
    assert.equal(networkCodeOf(new AggregateError([coded("ETIMEDOUT")]), fetchLike), null);
    for (const error of [undefined, null, {}, new TypeError("fetch failed", { cause: new Error("x") })]) {
        assert.equal(networkCodeOf(error, node), null);
        assert.equal(networkCodeOf(error, fetchLike), null);
    }
    const shaped = (code) => typeof code === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(code);
    assert.equal(networkCodeOf(coded("lower case"), node), "lower case");
    assert.equal(networkCodeOf(coded("lower case"), { client: "fetch", accept: shaped }), null);
    assert.equal(networkCodeOf(coded(5, { cause: coded("EPIPE") }), { client: "fetch", accept: shaped }), "EPIPE");
});
