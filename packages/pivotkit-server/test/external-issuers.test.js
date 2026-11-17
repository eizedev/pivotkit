// Tokens another system issues for its signed-in person (auth.externalIssuers), such as PowerShell
// Universal: Ed25519 JWTs with the issuer's own name and type, verified with the public key the
// operator configured. The REST service accepts them next to the static tokens; the server never
// holds a key that could mint them. Each issuer's verifier pins its issuer, type and keys, so a
// token of one issuer never passes as another's or as the server's own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { checkConfig, validateOptions } from "pivotkit-server";
import { callerOf, createAuthCore, identityKey } from "../src/auth.js";
import { BY_REGION, TOKEN, call, factsOf, restServer, workspace } from "./helpers.js";

const PSU = Object.freeze({ issuer: "psu", typ: "psu+jwt", kid: "psu-2026-11" });

/** An Ed25519 pair: the public key as PEM (what the operator configures), the private key to mint with. */
function pair() {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return { privateKey, publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(), privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

/** A token as the issuer mints it; each part can be changed. */
function mint(privateKey, { claims = {}, header = {}, iss = PSU.issuer, life = 600, iat = Math.floor(Date.now() / 1000), sub = "alice@example.com" } = {}) {
    const jwt = new SignJWT({ jti: "psu-0001", profile: "staff", ...(sub === null ? {} : { sub }), ...claims }).setProtectedHeader({ alg: "EdDSA", kid: PSU.kid, typ: PSU.typ, ...header }).setIssuedAt(iat).setExpirationTime(iat + life);
    return (iss === null ? jwt : jwt.setIssuer(iss)).sign(privateKey);
}

/** A workspace with the issuer's public key in keys/psu.pub, and the options that trust it. */
function setup({ issuerExtra = {}, auth = {}, keyText } = {}) {
    const keys = pair();
    const dir = workspace();
    mkdirSync(join(dir, "keys"));
    writeFileSync(join(dir, "keys", "psu.pub"), keyText ?? keys.publicPem);
    const options = {
        sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } },
        output: { dir: "out" },
        policy: { profiles: { staff: { results: true } } },
        auth: { mode: "token", tokens: [{ name: "ops", env: "OPS" }], externalIssuers: [{ issuer: PSU.issuer, typ: PSU.typ, keys: [{ kid: PSU.kid, publicKey: { file: "keys/psu.pub" } }], ...issuerExtra }], ...auth },
        baseDir: dir
    };
    return { ...keys, dir, options };
}

test("REST accepts a token of a configured issuer; the log names the issuer, never the token", async () => {
    const { privateKey, options } = setup();
    const server = await restServer(options, { env: { OPS: TOKEN } });
    try {
        const token = await mint(privateKey);
        const answer = await call(`${server.api}/views/validate`, { token, body: { source: "sales", view: BY_REGION } });
        assert.equal(answer.status, 200, JSON.stringify(answer.data));
        const line = server.log.find((l) => l.msg === "call" || l.operation === "validate_view");
        assert.ok(line, JSON.stringify(server.log));
        assert.equal(line.client, "psu");
        assert.ok(!JSON.stringify(server.log).includes(token), "the log holds the token");
        assert.equal((await call(`${server.api}/sources`, { token: TOKEN })).status, 200, "static tokens still work");
    } finally {
        await server.close();
    }
});

test("REST refuses a foreign issuer's token that is expired, too long-lived, of another type or issuer, without a subject or of an unknown key or profile", async () => {
    const { privateKey, options } = setup({ issuerExtra: { maxMinutes: 30 } });
    const other = pair();
    const server = await restServer(options, { env: { OPS: TOKEN } });
    try {
        const now = Math.floor(Date.now() / 1000);
        const cases = {
            expired: await mint(privateKey, { iat: now - 3600, life: 600 }),
            "too long": await mint(privateKey, { life: 31 * 60 }),
            "the server's own type": await mint(privateKey, { header: { typ: "pivotkit+jwt" } }),
            "the server's own issuer": await mint(privateKey, { iss: "pivotkit-server" }),
            "another issuer": await mint(privateKey, { iss: "someone-else" }),
            "no subject": await mint(privateKey, { sub: null }),
            "another key": await mint(other.privateKey),
            "an unknown kid": await mint(privateKey, { header: { kid: "psu-old" } }),
            "a profile not configured": await mint(privateKey, { claims: { profile: "admin" } }),
            "no ID": await mint(privateKey, { claims: { jti: undefined } })
        };
        for (const [name, token] of Object.entries(cases)) {
            const answer = await call(`${server.api}/sources`, { token });
            assert.equal(answer.status, 401, name);
        }
        assert.equal((await call(`${server.api}/sources`, { token: await mint(privateKey) })).status, 200, "a good token passes");
    } finally {
        await server.close();
    }
});

test("each person of an issuer is an identity of their own, apart from the server's own signed tokens", async () => {
    const { privateKey, options } = setup();
    const core = await createAuthCore(options, { env: { OPS: TOKEN }, log: { warn() {}, info() {}, debug() {}, level: "info" }, loopback: true });
    const request = (token) => new Request("http://127.0.0.1/api/v1/sources", { headers: { authorization: `Bearer ${token}` } });
    const alice = callerOf("token", await core.check(request(await mint(privateKey))), options.auth);
    const again = callerOf("token", await core.check(request(await mint(privateKey, { claims: { jti: "psu-0002" } }))), options.auth);
    const bob = callerOf("token", await core.check(request(await mint(privateKey, { sub: "bob@example.com" }))), options.auth);
    assert.equal(alice.client, "psu");
    assert.equal(alice.profile, "staff");
    assert.equal(identityKey(alice), identityKey(again), "two tokens of one person are one identity");
    assert.notEqual(identityKey(alice), identityKey(bob));
    const ops = callerOf("token", await core.check(request(TOKEN)), options.auth);
    assert.notEqual(identityKey(alice), identityKey(ops));
    core.close();
});

test("the audit setting names an issuer's person in the log as for OAuth: a keyed hash, or the subject's text", async () => {
    const { privateKey, options } = setup({ auth: {} });
    const server = await restServer({ ...options, audit: { subject: "plain" } }, { env: { OPS: TOKEN } });
    try {
        await call(`${server.api}/views/validate`, { token: await mint(privateKey), body: { source: "sales", view: BY_REGION } });
        assert.ok(server.log.some((l) => l.client === "psu" && l.subject === "alice@example.com"), JSON.stringify(server.log));
    } finally {
        await server.close();
    }
});

test("the configuration is checked: names and types of the server's own, a second entry of an issuer, more than two keys, the lifetime, and the mode", () => {
    const base = setup().options;
    const issuer = base.auth.externalIssuers[0];
    const refused = [
        [{ issuer: "pivotkit-server" }, /auth\.externalIssuers\[0\]\.issuer: "pivotkit-server" is the server's own/],
        [{ typ: "pivotkit+jwt" }, /auth\.externalIssuers\[0\]\.typ: "pivotkit\+jwt" is the server's own/],
        [{ typ: "has space" }, /auth\.externalIssuers\[0\]\.typ:/],
        [{ keys: [] }, /auth\.externalIssuers\[0\]\.keys: one or two keys/],
        [{ keys: [issuer.keys[0], { kid: "b", publicKey: { file: "b" } }, { kid: "c", publicKey: { file: "c" } }] }, /auth\.externalIssuers\[0\]\.keys: one or two keys/],
        [{ keys: [issuer.keys[0], issuer.keys[0]] }, /auth\.externalIssuers\[0\]\.keys\[1\]\.kid: "psu-2026-11" is there twice/],
        [{ maxMinutes: 0 }, /auth\.externalIssuers\[0\]\.maxMinutes: 1 to 1440/],
        [{ maxMinutes: 1441 }, /auth\.externalIssuers\[0\]\.maxMinutes: 1 to 1440/]
    ];
    for (const [change, message] of refused) {
        assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, ...change }] } }), message, JSON.stringify(change));
    }
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [issuer, issuer] } }), /auth\.externalIssuers\[1\]\.issuer: "psu" is there twice/);
    assert.throws(() => validateOptions({ ...base, auth: { mode: "oauth", issuer: "https://auth.example.com", resource: "https://reports.example.com/mcp", externalIssuers: [issuer] } }), /auth\.externalIssuers: works with auth\.mode "token" only/);
    assert.doesNotThrow(() => validateOptions(base));
});

test("a key that is no Ed25519 public key stops the start, and check-config says so; a good one is listed", async () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
    const priv = pair().privatePem;
    for (const [keyText, why] of [[priv, /a private key; give the issuer's public key/], [rsa, /not an Ed25519 public key/], ["not a key", /not an Ed25519 public key/]]) {
        const { options } = setup({ keyText });
        await assert.rejects(restServer(options, { env: { OPS: TOKEN } }), why);
        const { text } = await checkConfig(options, { env: { OPS: TOKEN }, http: true, rest: true });
        assert.match(factsOf(text), new RegExp(`PROBLEM: auth\\.externalIssuers\\[0\\]\\.keys\\[0\\]: the file keys/psu\\.pub .*${why.source}.* -> the server does not start`));
    }
    const { options } = setup();
    const { text } = await checkConfig(options, { env: { OPS: TOKEN }, http: true, rest: true });
    assert.match(factsOf(text), /\nExternal token issuers \(1\):\n {2}psu: type psu\+jwt, key psu-2026-11, tokens live at most 60 min\n/);
});

test("the MCP endpoint shares the check: it accepts the same token and refuses one of another key", async () => {
    const { privateKey, options } = setup();
    const server = await restServer(options, { env: { OPS: TOKEN }, enable: ["rest", "mcp"] });
    const works = async (token) => {
        const client = new Client({ name: "external", version: "1.0.0" });
        try {
            await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
            return !(await client.callTool({ name: "describe_source", arguments: { source: "sales" } })).isError;
        } catch (e) {
            if (/401|invalid_token|Unauthorized/i.test(String(e?.message ?? e))) {
                return false;
            }
            throw e;
        } finally {
            await client.close().catch(() => undefined);
        }
    };
    try {
        assert.equal(await works(await mint(privateKey)), true);
        assert.equal(await works(await mint(pair().privateKey)), false);
    } finally {
        await server.close();
    }
});
