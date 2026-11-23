// An HTTP source's JSON answer read while it streams (src/sources/json-rows.js): the rows at the
// source's pointer one by one, the rest of the body as it is. Every answer is read in pieces of
// several sizes, down to one byte, and must give what JSON.parse of the whole body and the pointer
// give: the same rows, the same body around them, or a refusal for a body that is no JSON.
// guardedFetch's `consume` hands the body over in pieces instead of keeping it.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { AnswerShapeError, rowsReader } from "../src/sources/json-rows.js";
import { GuardedFetchError } from "../src/sources/fetch.js";
import { loopbackFetch as local } from "./helpers.js";
import { MAX_DEPTH, jsonDepth, pointerValue } from "../src/sources/http.js";

/** The sizes of the pieces an answer is read in (0: the whole body at once). */
const PIECES = [1, 2, 3, 5, 17, 0];

/** What the whole body gives: the parsed body, or "refused". */
function reference(text) {
    const bytes = Buffer.from(text, "latin1");
    let decoded;
    try {
        decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch {
        return "refused";
    }
    if (jsonDepth(decoded, MAX_DEPTH) > MAX_DEPTH) {
        return "refused";
    }
    try {
        return JSON.parse(decoded);
    } catch {
        return "refused";
    }
}

/** The body with the value at `keys` replaced by an empty list (what the reader keeps of it). */
function withoutRows(body, keys) {
    if (!keys.length) {
        return [];
    }
    const copy = structuredClone(body);
    const parent = pointerValue(copy, keys.slice(0, -1));
    parent[keys.at(-1)] = [];
    return copy;
}

/** Reads `bytes` in pieces of `size` (0: whole): { body, rows } or the error. */
function readInPieces(bytes, keys, size) {
    const rows = [];
    const reader = rowsReader(keys, { maxDepth: MAX_DEPTH, onRow: (row) => rows.push(row) });
    try {
        const step = size || bytes.length || 1;
        for (let at = 0; at < bytes.length; at += step) {
            // a copy per piece: the reader may not depend on the pieces being one buffer
            reader.push(Uint8Array.from(bytes.subarray(at, at + step)));
        }
        const body = reader.end();
        return { body, rows, count: reader.rows };
    } catch (e) {
        return { error: e };
    }
}

/** Answers written as text (latin1 bytes, so "\xc3\xa9" is é in UTF-8 and "\xff" is no UTF-8). */
const ANSWERS = [
    // the rows at /items, other keys before and after, strings that look like JSON
    [`{"generatedAt":"2026-01-01","items":[{"a":1,"b":"x]},{["},{"a":2,"c":"\\"quoted\\" \\\\"}],"next":"?p=2"}`, ["items"]],
    // whitespace everywhere, nested values in a row, an empty object and list
    [` \r\n\t{ "items" : [ { "a" : [ 1 , { "b" : null } ] } , {} , { "x" : true } ] , "n" : -1.5e3 } \n`, ["items"]],
    // the whole body is the rows; lists as rows; scalars as rows
    [`[["name","cpu"],["web-1",4],["db-1",8]]`, []],
    [`[1, "two", null, false, 3.5]`, []],
    [`[]`, []],
    [`{"items":[]}`, ["items"]],
    // a pointer through a list and a deeper one
    [`[{"items":[{"a":1}]},{"items":[{"a":2}]}]`, ["1", "items"]],
    // a list on the way to the rows is not the rows; a key into a list matches nothing
    [`{"data":[[{"no":1}],[{"a":1}]]}`, ["data", "1"]],
    [`{"data":[{"items":[1]}]}`, ["data", "items"]],
    [`{"data":{"page":{"rows":[{"k":"v"}]},"rows":[{"not":"these"}]}}`, ["data", "page", "rows"]],
    // the same name elsewhere is not the rows; the rows' key inside a row is not either
    [`{"meta":{"items":[{"z":0}]},"items":[{"items":[{"deep":1}]}]}`, ["items"]],
    // a key with escapes that decodes to the pointer's key; a key that only looks like it
    [`{"it\\u0065ms":[{"a":1}],"items ":[{"b":2}]}`, ["items"]],
    // own keys only: __proto__ is a key like any other
    [`{"__proto__":[{"a":1}]}`, ["__proto__"]],
    [`{"items":[{"a":1}]}`, ["__proto__"]],
    // nothing at the pointer, an object or a text there
    [`{"other":[1]}`, ["items"]],
    [`{"items":{"a":1}}`, ["items"]],
    [`{"items":"text"}`, ["items"]],
    [`{"items":null}`, ["items"]],
    // UTF-8 inside and outside the rows, and a byte order mark
    [`\xef\xbb\xbf{"items":[{"name":"caf\xc3\xa9 \xe2\x82\xac"}],"t":"\xc3\xa9"}`, ["items"]],
    // two byte order marks at the start (the whole body's decoding drops both); one at a row's start is refused
    [`\xef\xbb\xbf\xef\xbb\xbf{"items":[1]}`, ["items"]],
    [`{"items":[\xef\xbb\xbf1]}`, ["items"]],
    [`[\xef\xbb\xbf[1]]`, []],
    // an index that is no list index
    [`[{"a":1},{"a":2}]`, ["01"]],
    [`[{"items":[1]}]`, ["0", "items"]],
    // no JSON: each must be refused
    [`{"items":[{"a":1},]}`, ["items"]],
    [`{"items":[,{"a":1}]}`, ["items"]],
    [`{"items":[{"a":1} {"a":2}]}`, ["items"]],
    [`{"items":[{"a":1},,{"a":2}]}`, ["items"]],
    [`{"items":[{"a":1}`, ["items"]],
    [`{"items":[{"a":1}]`, ["items"]],
    [`{"items":[{"a":1]}]}`, ["items"]],
    [`{"items":[{"a":1}}]}`, ["items"]],
    [`{"items":[1 2]}`, ["items"]],
    [`{"items":[1],}`, ["items"]],
    [`{"items" [1]}`, ["items"]],
    [`{"items":[1]} x`, ["items"]],
    [`{"items":[1]}{}`, ["items"]],
    [`{"items":[{"a":"\xff"}]}`, ["items"]],
    [`{"t":"\xc3","items":[1]}`, ["items"]],
    [`\xef\xbb{"items":[1]}`, ["items"]],
    [`<html>no json</html>`, ["items"]],
    [``, ["items"]],
    [`  `, []],
    [`{"items":[${"[".repeat(70)}${"]".repeat(70)}]}`, ["items"]],
    [`{"x":${"[".repeat(70)}${"]".repeat(70)},"items":[]}`, ["items"]],
    // nesting at the limit is fine
    [`{"items":[${"[".repeat(62)}${"]".repeat(62)}]}`, ["items"]]
];

/**
 * Reads `text` in pieces of every size and checks the result against the whole body's. With
 * `twice`, a refusal of a repeated name on the rows' path counts as agreeing (a random change can
 * make one).
 */
function agrees(text, keys, sizes = PIECES, twice = false) {
    const expected = reference(text);
    const bytes = Buffer.from(text, "latin1");
    for (const size of sizes) {
        const got = readInPieces(bytes, keys, size);
        if (twice && got.error instanceof AnswerShapeError && /rows twice/.test(got.error.message)) {
            continue;
        }
        const label = `${JSON.stringify(text.slice(0, 80))} at /${keys.join("/")} in pieces of ${size || "all"}`;
        if (expected === "refused") {
            assert.ok(got.error instanceof AnswerShapeError, `${label}: refused (${got.error ?? "accepted"})`);
            continue;
        }
        assert.equal(got.error, undefined, `${label}: ${got.error}`);
        const found = pointerValue(expected, keys);
        if (Array.isArray(found)) {
            assert.deepEqual(got.rows, found, `${label}: the rows`);
            assert.equal(got.count, found.length, `${label}: the count`);
            assert.deepEqual(got.body, withoutRows(expected, keys), `${label}: the body around the rows`);
        } else {
            assert.deepEqual(got.rows, [], `${label}: no rows`);
            assert.deepEqual(got.body, expected, `${label}: the body as it is`);
        }
    }
}

test("rowsReader gives what JSON.parse and the pointer give, in pieces of any size, and refuses what is no JSON", () => {
    for (const [text, keys] of ANSWERS) {
        agrees(text, keys);
    }
});

test("rowsReader agrees with JSON.parse on answers changed at random: a byte replaced, removed or doubled (fixed seed)", () => {
    // xorshift32: every bit of the state is used
    let state = 620;
    const random = (n) => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) % n;
    };
    const STRUCTURE = ['"', "\\", ",", ":", "[", "]", "{", "}", " ", "1", "\xef", "\xbb", "\xbf", "\xc3"];
    const valid = ANSWERS.filter(([text]) => reference(text) !== "refused");
    for (let n = 0; n < 3000; n++) {
        const [text, keys] = valid[random(valid.length)];
        const at = random(text.length + 1);
        const change = random(3);
        const changed = change === 0 ? text.slice(0, at) + STRUCTURE[random(STRUCTURE.length)] + text.slice(at + 1) : change === 1 ? text.slice(0, at) + text.slice(at + 1) : text.slice(0, at) + text.slice(at, at + 1) + text.slice(at);
        agrees(changed, keys, [1, 2, 3, 0], true);
    }
});

test("rowsReader refuses a body that names its rows twice, and stops at the first byte that cannot be JSON", () => {
    // JSON.parse would keep the later value: other rows, or none at all
    for (const body of [`{"items":[{"a":1}],"items":[{"a":2}]}`, `{"items":[{"a":1}],"items":5}`, `{"items":[{"a":1}],"items":null}`]) {
        const twice = readInPieces(Buffer.from(body), ["items"], 0);
        assert.match(String(twice.error?.message), /rows twice/, body);
    }
    for (const body of [`{"a":{"items":[1]},"a":{"items":[2]}}`, `{"a":{"items":[1,2]},"a":{"x":2}}`]) {
        const twice = readInPieces(Buffer.from(body), ["a", "items"], 0);
        assert.match(String(twice.error?.message), /rows twice/, body);
    }
    // the same names off the pointer's path are fine
    assert.equal(readInPieces(Buffer.from(`{"items":[1],"b":{"items":2},"c":[{"a":1}]}`), ["items"], 0).error, undefined);
    // a broken separator in the rows is refused while it streams, before the rest arrives
    const reader = rowsReader(["items"], { maxDepth: MAX_DEPTH, onRow: () => {} });
    assert.throws(() => reader.push(Buffer.from(`{"items":[{"a":1},,`)), AnswerShapeError);
    // nesting deeper than the limit is refused as it streams
    const deep = rowsReader(["items"], { maxDepth: MAX_DEPTH, onRow: () => {} });
    assert.throws(() => deep.push(Buffer.from(`{"items":[${"[".repeat(70)}`)), AnswerShapeError);
});

test("rowsReader keeps no piece of the answer: a row's values are texts of their own", () => {
    const rows = [];
    const reader = rowsReader(["items"], { maxDepth: MAX_DEPTH, onRow: (row) => rows.push(row) });
    const piece = Buffer.from(`{"items":[{"name":"${"n".repeat(40)}"}]}`);
    reader.push(piece);
    reader.end();
    piece.fill(0);
    assert.equal(rows[0].name, "n".repeat(40));
});

let server;
let base;
before(async () => {
    server = createServer((req, res) => {
        const path = new URL(req.url ?? "/", "http://x").pathname;
        if (path === "/rows") {
            res.writeHead(200, { "content-type": "application/json" });
            res.write('{"items":[{"a":1},');
            setTimeout(() => res.end('{"a":2}]}'), 20);
        } else if (path === "/gzip") {
            res.writeHead(200, { "content-encoding": "gzip" });
            res.end(gzipSync('{"items":[{"z":true}]}'));
        } else if (path === "/large") {
            res.writeHead(200);
            res.write('{"items":[');
            res.end(`${'{"a":1},'.repeat(10_000)}{"a":1}]}`);
        } else if (path === "/redirect") {
            res.writeHead(302, { location: "/rows" });
            res.end('{"items":[]}');
        } else if (path === "/slow") {
            res.writeHead(200, { "content-type": "application/json" });
            res.write('{"items":[{"a":1},');
        } else if (path === "/missing") {
            res.writeHead(404, { "content-type": "application/json" });
            res.end('{"error":"none"}');
        } else {
            res.writeHead(500);
            res.end();
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test("guardedFetch's consume: the body's pieces go to the consumer, decoded, counted as size; none is kept; other answers are kept as before", async () => {
    const pieces = [];
    const statuses = [];
    const answer = await local(`${base}/rows`, { consume: (status) => (statuses.push(status), (piece) => pieces.push(Buffer.from(piece))) });
    assert.equal(answer.status, 200);
    assert.equal(answer.body.length, 0);
    assert.equal(Buffer.concat(pieces).toString(), '{"items":[{"a":1},{"a":2}]}');
    assert.equal(answer.size, Buffer.concat(pieces).length);
    assert.deepEqual(statuses, [200]);
    const zipped = [];
    const gz = await local(`${base}/gzip`, { consume: () => (piece) => zipped.push(Buffer.from(piece)) });
    assert.equal(Buffer.concat(zipped).toString(), '{"items":[{"z":true}]}');
    assert.equal(gz.size, 22);
    // a consumer that declines (an error status) gets nothing: the body is kept as without consume
    const missing = await local(`${base}/missing`, { consume: (status) => (status === 200 ? () => assert.fail("not consumed") : null) });
    assert.equal(new TextDecoder().decode(missing.body), '{"error":"none"}');
    assert.equal(missing.size, missing.body.length);
    // without consume, size is the body's length too
    assert.equal((await local(`${base}/large`)).size, 10 + 8 * 10_000 + 9);
});

test("guardedFetch's consume: maxBytes still cuts the body while it streams, and a consumer's error ends the request with that error", async () => {
    let seen = 0;
    const cut = await local(`${base}/large`, { maxBytes: 1000, consume: () => (piece) => (seen += piece.length) }).then(() => null, (e) => e);
    assert.ok(cut instanceof GuardedFetchError);
    assert.equal(cut.code, "TOO_LARGE");
    assert.ok(seen <= 1000, `at most maxBytes reached the consumer (${seen})`);
    const own = new Error("the consumer's own");
    const failed = await local(`${base}/large`, { consume: () => () => { throw own; } }).then(() => null, (e) => e);
    assert.equal(failed, own);
});

test("guardedFetch's consume: a redirect is still refused before any piece; a cancelled signal or timeMs ends a body that is still arriving", async () => {
    const pieces = [];
    const take = () => (piece) => pieces.push(piece);
    const redirect = await local(`${base}/redirect`, { consume: take }).then(() => null, (e) => e);
    assert.equal(redirect?.code, "REDIRECT");
    assert.equal(pieces.length, 0);
    const gone = new AbortController();
    const aborted = local(`${base}/slow`, { signal: gone.signal, consume: () => (piece) => (pieces.push(piece), gone.abort()) }).then(() => null, (e) => e);
    assert.equal((await aborted)?.code, "ABORTED");
    assert.equal((await local(`${base}/slow`, { timeMs: 200, consume: take }).then(() => null, (e) => e))?.code, "TIMEOUT");
});
