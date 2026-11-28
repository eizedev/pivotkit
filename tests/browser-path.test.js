// The components' network code (pivotkit-react's server-rows.js, record 0020) against a real
// pivotkit-server: the page's getToken() exchanges a person's token for a browser token, the rows
// come back as columnar data, and an answer that is not the rows becomes the state the report
// shows. Persons sign in with an external issuer's token (record 0014), as in the server's tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { fetchRows } from "../packages/pivotkit-react/src/server-rows.js";
import { serverRequestOf } from "../packages/pivotkit-react/src/server.js";
import { call, restServer, workspace } from "../packages/pivotkit-server/test/helpers.js";

const CSV = ["Region,Customer,Sales", "North,acme,10", "South,acme,20", "West,beta,7"].join("\n") + "\n";
const PSU = Object.freeze({ issuer: "psu", typ: "psu+jwt", kid: "psu-2026-11" });
const PAGE = "https://intranet.example.com";

async function serverOf(extra = {}) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const dir = workspace({ "sales.csv": CSV });
    mkdirSync(join(dir, "keys"));
    writeFileSync(join(dir, "keys", "psu.pub"), publicKey.export({ type: "spki", format: "pem" }).toString());
    writeFileSync(join(dir, "browser.key"), "a-browser-key-of-the-test-0123456789abcdef\n");
    const server = await restServer({
        sources: {
            sales: { file: "data/sales.csv", policy: { fields: { Customer: "hide" } } },
            team: { load: async (params) => [{ Region: String(params.team), Sales: 1 }], params: { team: { type: "string" } }, policy: { default: "show" } }
        },
        policy: { profiles: { staff: { records: ["sales", "team"], fields: { Region: "show", Sales: "show" } } } },
        auth: { mode: "token", tokens: [{ name: "ops", env: "OPS" }], externalIssuers: [{ issuer: PSU.issuer, typ: PSU.typ, scopes: ["pivotkit:read"], profiles: ["staff"], profile: "staff", keys: [{ kid: PSU.kid, publicKey: { file: "keys/psu.pub" } }] }] },
        rest: { browser: { origins: [PAGE], key: { file: "browser.key" } }, ...(extra.rest ?? {}) },
        baseDir: dir
    }, { env: { OPS: "an-ops-token-of-the-test-0123456789" } });
    const person = () => {
        const now = Math.floor(Date.now() / 1000);
        return new SignJWT({ jti: `psu-${Math.random().toString(16).slice(2, 10)}`, profile: "staff", sub: "alice@example.com" }).setProtectedHeader({ alg: "EdDSA", kid: PSU.kid, typ: PSU.typ }).setIssuer(PSU.issuer).setIssuedAt(now).setExpirationTime(now + 600).sign(privateKey);
    };
    /** The page's getToken(): its backend exchanges the person's token; the calls are counted. */
    const exchange = { calls: 0, asked: /** @type {any[]} */ ([]) };
    const getToken = async (request) => {
        exchange.calls++;
        exchange.asked.push(request);
        const got = await call(`${server.api}/sources/records/token`, { token: await person(), body: request });
        if (got.status !== 200) {
            throw Object.assign(new Error(got.data.detail), { problem: got.data });
        }
        return got.data;
    };
    return { server, dir, getToken, exchange };
}

const requestOf = (server, source, search = "", allowParams = []) => {
    const read = serverRequestOf({ url: server.url, source, getToken: () => null, allowParams }, search);
    assert.ok(read && "request" in read, JSON.stringify(read));
    return read.request;
};

test("the components read a source's rows with a browser token from the page's getToken(), and reuse it", async () => {
    const { server, getToken, exchange } = await serverOf();
    try {
        const held = { current: null };
        /** @type {any[]} */
        const sent = [];
        const spy = (url, init) => {
            sent.push({ url, init });
            return fetch(url, init);
        };
        const got = await fetchRows(requestOf(server, "sales"), { getToken: () => getToken, held, fetch: spy });
        assert.equal(got.ok, true, JSON.stringify(got));
        assert.deepEqual(got.rows.data.columns, ["Region", "Sales"]);
        assert.deepEqual(got.rows.data.data, [["North", "South", "West"], [10, 20, 7]]);
        assert.equal(got.rows.rowCount, 3);
        // the token only in the header; no cookie, no referrer
        assert.equal(sent.length, 1);
        assert.ok(!sent[0].url.includes(held.current.token));
        assert.equal(sent[0].init.headers.authorization, `Bearer ${held.current.token}`);
        assert.equal(sent[0].init.credentials, "omit");
        assert.equal(sent[0].init.referrerPolicy, "no-referrer");
        // a second read takes the same token
        assert.equal((await fetchRows(requestOf(server, "sales"), { getToken: () => getToken, held })).ok, true);
        assert.equal(exchange.calls, 1);
        assert.ok(!JSON.stringify(server.log).includes(held.current.token), "the log never holds the token");
    } finally {
        await server.close();
    }
});

test("the query's parameters reach the server only as allowParams lets them, and the token is bound to them", async () => {
    const { server, getToken, exchange } = await serverOf();
    try {
        const held = { current: null };
        const request = requestOf(server, "team", "?team=north&other=x&team=south", ["team"]);
        const got = await fetchRows(request, { getToken: () => getToken, held });
        assert.equal(got.ok, true, JSON.stringify(got));
        assert.deepEqual(got.rows.data.data, [["north"], [1]]);
        assert.deepEqual(exchange.asked[0], { source: "team", params: { team: "north" } });
        // the same token for other parameters: refused by the server, never widened
        const other = await fetchRows({ ...request, params: { team: "south" } }, { getToken: () => async () => null, held });
        assert.equal(other.ok, false);
        assert.equal(other.failure.state, "refused");
        assert.equal(other.failure.code, "NOT_ALLOWED");
        assert.match(String(other.failure.requestId), /^[A-Za-z0-9_-]{11}$/);
    } finally {
        await server.close();
    }
});

test("a token the server no longer takes is renewed once through getToken(); nothing new means expired", async () => {
    const { server, getToken, exchange } = await serverOf();
    try {
        const held = { current: { token: "pkb.not-a-real-browser-token", expiresAt: null } };
        const renewed = await fetchRows(requestOf(server, "sales"), { getToken: () => getToken, held });
        assert.equal(renewed.ok, true, JSON.stringify(renewed));
        assert.equal(exchange.calls, 1);
        // the page cannot give a new one: the person must sign in again
        held.current = { token: "pkb.not-a-real-browser-token", expiresAt: null };
        const ended = await fetchRows(requestOf(server, "sales"), { getToken: () => async () => null, held });
        assert.equal(ended.ok, false);
        assert.equal(ended.failure.state, "expired");
        assert.equal(JSON.stringify(ended).includes("pkb.not-a-real"), false, "a state never holds the token");
    } finally {
        await server.close();
    }
});

test("the server's refusals become the report's states: too large with its limit, a source the person may not read, a server that does not answer", async () => {
    const { server, getToken } = await serverOf({ rest: { records: { maxRows: 2 } } });
    try {
        const large = await fetchRows(requestOf(server, "sales"), { getToken: () => getToken, held: { current: null } });
        assert.equal(large.ok, false);
        assert.deepEqual([large.failure.state, large.failure.code, large.failure.maxRows], ["large", "LIMIT_EXCEEDED", 2]);
        const missing = await fetchRows(requestOf(server, "nothing-here"), { getToken: () => getToken, held: { current: null } });
        assert.equal(missing.ok, false);
        assert.equal(missing.failure.state, "refused");
    } finally {
        await server.close();
    }
    // the server is gone: no answer
    const gone = await fetchRows(requestOf(server, "sales"), { getToken: () => async () => "pkb.x", held: { current: null } });
    assert.equal(gone.ok, false);
    assert.equal(gone.failure.state, "unreachable");
    assert.equal(gone.failure.host, new URL(server.url).host);
});
