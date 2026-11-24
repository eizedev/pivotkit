// Tokens another system issues for its signed-in person (auth.externalIssuers), such as PowerShell
// Universal: Ed25519 JWTs with the issuer's own name and type, verified with the public key the
// operator configured. The REST service accepts them next to the static tokens; the server never
// holds a key that could mint them. Each issuer's verifier pins its issuer, type and keys, so a
// token of one issuer never passes as another's or as the server's own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { checkConfig, loadConfig, validateOptions } from "pivotkit-server";
import { callerOf, createAuthCore, identityKey } from "../../src/auth.js";
import { BY_REGION, TOKEN, call, factsOf, restServer, runBin, workspace, mcpToolWorks } from "../helpers.js";

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
        policy: { profiles: { staff: { results: true }, viewer: {} } },
        auth: { mode: "token", tokens: [{ name: "ops", env: "OPS" }], externalIssuers: [{ issuer: PSU.issuer, typ: PSU.typ, scopes: ["pivotkit:read", "pivotkit:render"], profiles: ["staff"], profile: "staff", keys: [{ kid: PSU.kid, publicKey: { file: "keys/psu.pub" } }], ...issuerExtra }], ...auth },
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
        const line = server.log.find((l) => l.event === "request" && l.operation === "validate_view");
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
    assert.match(factsOf(text), /\nExternal token issuers \(1\):\n {2}psu: type psu\+jwt, key psu-2026-11, tokens live at most 60 min\n {4}scopes at most: pivotkit:read, pivotkit:render\n {4}profiles a token may name: staff\n {4}without a profile: staff\n/);
});

test("the MCP endpoint shares the check: it accepts the same token and refuses one of another key", async () => {
    const { privateKey, options } = setup();
    const server = await restServer(options, { env: { OPS: TOKEN }, enable: ["rest", "mcp"] });
    try {
        assert.equal(await mcpToolWorks(server, await mint(privateKey)), true);
        assert.equal(await mcpToolWorks(server, await mint(pair().privateKey)), false);
    } finally {
        await server.close();
    }
});

test("with the server's own signed tokens on: each kind passes only its own verifier, never the other's", async () => {
    const { privateKey, options, dir } = setup({ auth: { signedTokens: { dir: "signed" } } });
    const config = join(dir, "pivotkit.json");
    const written = { ...options };
    delete written.baseDir;
    writeFileSync(config, `${JSON.stringify(written, null, 2)}\n`);
    const issued = runBin(["token", "issue", "--config", config, "--name", "ci", "--expires", "10m", "--json"], { env: { OPS: TOKEN } });
    assert.equal(issued.status, 0, issued.stderr);
    const own = JSON.parse(issued.stdout).token;
    // the server's own signing key, as the test can read it from its directory
    const keyFile = readdirSync(join(dir, "signed", "keys"))[0];
    const ownKid = keyFile.replace(/\.key$/, "");
    const ownKey = createPrivateKey({ key: Buffer.from(readFileSync(join(dir, "signed", "keys", keyFile), "utf8").trim(), "base64url"), format: "der", type: "pkcs8" });
    const server = await restServer(await loadConfig(config), { env: { OPS: TOKEN } });
    try {
        const status = async (token) => (await call(`${server.api}/sources`, { token })).status;
        assert.equal(await status(own), 200, "the server's own token");
        assert.equal(await status(await mint(privateKey)), 200, "the issuer's token");
        // the issuer's key dressed as the server's own: the server's verifier knows no such key
        assert.equal(await status(await mint(privateKey, { iss: "pivotkit-server", header: { typ: "pivotkit+jwt" }, claims: { jti: "0123456789abcdef" } })), 401);
        // the server's own key dressed as the issuer's: the issuer's verifier knows only its own keys
        assert.equal(await status(await mint(ownKey, { header: { kid: ownKid } })), 401);
    } finally {
        await server.close();
    }
});

// ---------------------------------------------------------------------------------------------
// The issuer is an identity provider, not an operator: what its tokens get, and what they never get

/** The auth core of the options and a caller made from a token, or the refusal's status. */
async function callerWith(options, env = { OPS: TOKEN }) {
    const core = await createAuthCore(options, { env, log: { warn() {}, info() {}, debug() {}, level: "info" }, loopback: true });
    return {
        core,
        /** @param {string} token */
        async of(token) {
            try {
                return callerOf("token", await core.check(new Request("http://127.0.0.1/api/v1/sources", { headers: { authorization: `Bearer ${token}` } })), options.auth);
            } catch (e) {
                return { refused: e.status };
            }
        }
    };
}

test("scopes: a token's scope is cut to the issuer's scopes; without scope it gets exactly those, never every scope", async () => {
    const { privateKey, options } = setup();
    const { core, of } = await callerWith(options);
    try {
        const without = await of(await mint(privateKey));
        assert.deepEqual([...without.scopes].sort(), ["pivotkit:read", "pivotkit:render"]);
        const narrow = await of(await mint(privateKey, { claims: { scope: "pivotkit:read" } }));
        assert.deepEqual([...narrow.scopes], ["pivotkit:read"]);
        const wider = await of(await mint(privateKey, { claims: { scope: "pivotkit:read admin:everything" } }));
        assert.deepEqual([...wider.scopes], ["pivotkit:read"], "a scope the operator did not allow is dropped");
    } finally {
        core.close();
    }
    const none = setup({ issuerExtra: { scopes: [] } });
    const empty = await callerWith(none.options);
    try {
        const caller = await empty.of(await mint(none.privateKey));
        assert.notEqual(caller.scopes, null, "never every scope");
        assert.equal(caller.scopes.size, 0);
    } finally {
        empty.core.close();
    }
});

test("profiles: a token names one of the issuer's profiles or gets 401; without one it gets the issuer's profile, else auth.defaultProfile", async () => {
    const a = setup({ issuerExtra: { profiles: ["staff"], profile: "viewer" } });
    const one = await callerWith(a.options);
    try {
        assert.equal((await one.of(await mint(a.privateKey))).profile, "staff");
        assert.equal((await one.of(await mint(a.privateKey, { claims: { profile: "viewer" } }))).refused, 401, "outside the allowlist");
        assert.equal((await one.of(await mint(a.privateKey, { claims: { profile: undefined } }))).profile, "viewer", "the issuer's profile");
    } finally {
        one.core.close();
    }
    const b = setup({ issuerExtra: { profiles: undefined, profile: undefined }, auth: { defaultProfile: "viewer" } });
    const two = await callerWith(b.options);
    try {
        assert.equal((await two.of(await mint(b.privateKey))).refused, 401, "no allowlist: a token may name no profile");
        assert.equal((await two.of(await mint(b.privateKey, { claims: { profile: undefined } }))).profile, "viewer", "auth.defaultProfile");
    } finally {
        two.core.close();
    }
});

test("claims and header: a future nbf or iat, alg none or HS256, a missing typ, and a jti or sub of the wrong form get 401", async () => {
    const { privateKey, options } = setup();
    const { core, of } = await callerWith(options);
    const now = Math.floor(Date.now() / 1000);
    const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const body = { iss: "psu", sub: "alice@example.com", jti: "psu-1", iat: now, exp: now + 600 };
    try {
        const cases = {
            "nbf ahead": await mint(privateKey, { claims: { nbf: now + 600 } }),
            "iat ahead": await mint(privateKey, { iat: now + 600 }),
            "alg none": `${b64({ alg: "none", kid: PSU.kid, typ: PSU.typ })}.${b64(body)}.`,
            "alg none with a part": `${b64({ alg: "none", kid: PSU.kid, typ: PSU.typ })}.${b64(body)}.AAAA`,
            HS256: await new SignJWT(body).setProtectedHeader({ alg: "HS256", kid: PSU.kid, typ: PSU.typ }).sign(new TextEncoder().encode("x".repeat(32))),
            "no typ": await mint(privateKey, { header: { typ: undefined } }),
            "jti with a space": await mint(privateKey, { claims: { jti: "psu 1" } }),
            "jti too long": await mint(privateKey, { claims: { jti: "a".repeat(129) } }),
            "jti with a slash": await mint(privateKey, { claims: { jti: "psu/1" } }),
            "sub too long": await mint(privateKey, { sub: "a".repeat(257) }),
            "sub empty": await mint(privateKey, { sub: "" }),
            "sub a number": await mint(privateKey, { claims: { sub: 42 } }),
            "sub with a control character": await mint(privateKey, { sub: "alice\u0007" }),
            "sub with a space": await mint(privateKey, { sub: "alice smith" }),
            "sub with a bidi control": await mint(privateKey, { sub: "alice\u202E" })
        };
        for (const [name, token] of Object.entries(cases)) {
            assert.equal((await of(token)).refused, 401, name);
        }
        assert.equal((await of(await mint(privateKey, { claims: { jti: "a".repeat(128) }, sub: "b".repeat(256) }))).client, "psu", "the longest jti and sub pass");
    } finally {
        core.close();
    }
});

test("two issuers with their keys and types swapped: each token passes only as its own issuer's", async () => {
    const { options, dir, privateKey: keyA } = setup();
    const b = pair();
    writeFileSync(join(dir, "keys", "b.pub"), b.publicPem);
    options.auth.externalIssuers.push({ issuer: "other", typ: "other+jwt", scopes: ["pivotkit:read"], profiles: ["staff"], profile: "staff", keys: [{ kid: "other-1", publicKey: { file: "keys/b.pub" } }] });
    const { core, of } = await callerWith(options);
    try {
        assert.equal((await of(await mint(keyA))).client, "psu");
        assert.equal((await of(await mint(b.privateKey, { iss: "other", header: { typ: "other+jwt", kid: "other-1" } }))).client, "other");
        assert.equal((await of(await mint(keyA, { header: { typ: "other+jwt" } }))).refused, 401, "psu's token with other's type");
        assert.equal((await of(await mint(b.privateKey, { header: { kid: "other-1" } }))).refused, 401, "other's key and kid under psu's name");
        assert.equal((await of(await mint(keyA, { iss: "other", header: { typ: "other+jwt", kid: PSU.kid } }))).refused, 401, "psu's key under other's name");
    } finally {
        core.close();
    }
});

test("the identity is ['external', issuer, sub]; token exchange and bound reports are refused for such a caller", async () => {
    const { identityBasisOf, exchangeTokenFor } = await import("../../src/auth.js");
    const { signedInForDelivery, linkFor } = await import("../../src/delivery.js");
    const { privateKey, options } = setup();
    const { core, of } = await callerWith(options);
    try {
        const caller = await of(await mint(privateKey));
        assert.deepEqual(identityBasisOf(caller), ["external", "psu", "alice@example.com"]);
        await assert.rejects(exchangeTokenFor(caller, { url: "https://idp.example/token", clientId: "pivotkit" }), (e) => e.code === "NOT_ALLOWED");
        // a person of another issuer cannot sign in where the server checks a bound link or store
        assert.equal(signedInForDelivery(caller), false);
        assert.equal(linkFor({ bind: "signIn" }, { closed: true, surface: "mcp", results: true, subject: signedInForDelivery(caller) ? caller.subject : null }), null);
    } finally {
        core.close();
    }
    // and a signIn link needs OAuth, which external issuers never run with
    assert.throws(() => validateOptions({ ...options, output: { dir: "out", downloads: { bind: "signIn", signIn: { clientId: "x" } } } }), /needs auth\.mode "oauth"/);
});

test("the configuration: more than eight issuers, an issuer named like a token, scopes required, profiles configured, the lifetime's bounds", () => {
    const base = setup().options;
    const issuer = base.auth.externalIssuers[0];
    const many = Array.from({ length: 9 }, (_, i) => ({ ...issuer, issuer: `psu-${i}` }));
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: many } }), /at most 8 issuers/);
    assert.doesNotThrow(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: many.slice(0, 8) } }));
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, issuer: "ops" }] } }), /externalIssuers\[0\]\.issuer: "ops" is the name of a token in auth\.tokens/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, issuer: "0123456789abcdef" }] } }), /in the form of a signed token's ID/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, scopes: undefined }] } }), /externalIssuers\[0\]\.scopes: the scopes its tokens may get/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, scopes: ["two words"] }] } }), /is no scope/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, profiles: ["admin"] }] } }), /profiles\[0\]: "admin" is not in policy\.profiles/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, profile: "admin" }] } }), /externalIssuers\[0\]\.profile: "admin" is not in policy\.profiles/);
    assert.doesNotThrow(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, maxMinutes: 1440 }] } }));
    assert.doesNotThrow(() => validateOptions({ ...base, auth: { ...base.auth, externalIssuers: [{ ...issuer, maxMinutes: 1 }] } }));
});

test("the lifetime's boundary: a token of exactly maxMinutes passes, one second more gets 401", async () => {
    const { privateKey, options } = setup({ issuerExtra: { maxMinutes: 5 } });
    const { core, of } = await callerWith(options);
    try {
        assert.equal((await of(await mint(privateKey, { life: 300 }))).client, "psu");
        assert.equal((await of(await mint(privateKey, { life: 301 }))).refused, 401);
    } finally {
        core.close();
    }
});

test("keys: one from a variable works; an unreadable file, an encrypted private key and a file with a public and a private block stop the start", async () => {
    const env = pair();
    const fromEnv = setup();
    fromEnv.options.auth.externalIssuers[0].keys = [{ kid: PSU.kid, publicKey: { env: "PSU_KEY" } }];
    const { core, of } = await callerWith(fromEnv.options, { OPS: TOKEN, PSU_KEY: env.publicPem });
    try {
        assert.equal((await of(await mint(env.privateKey))).client, "psu");
    } finally {
        core.close();
    }
    const encrypted = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "secret" }).toString();
    const both = `${pair().publicPem}${pair().privatePem}`;
    for (const [keyText, why] of [[encrypted, /a private key/], [both, /a private key/]]) {
        const { options } = setup({ keyText });
        await assert.rejects(createAuthCore(options, { env: { OPS: TOKEN }, log: { warn() {}, info() {}, debug() {} }, loopback: true }), why);
    }
    const missing = setup();
    missing.options.auth.externalIssuers[0].keys = [{ kid: PSU.kid, publicKey: { file: "keys/none.pub" } }];
    await assert.rejects(createAuthCore(missing.options, { env: { OPS: TOKEN }, log: { warn() {}, info() {}, debug() {} }, loopback: true }), /the file keys\/none\.pub cannot be read/);
    const { text } = await checkConfig(missing.options, { env: { OPS: TOKEN }, http: true, rest: true });
    assert.match(factsOf(text), /PROBLEM: auth\.externalIssuers\[0\]\.keys\[0\]: the file keys\/none\.pub cannot be read .* -> the server does not start/);
});

test("a refused token is said at info, each reason once a minute, never with the token", async () => {
    const { privateKey, options } = setup();
    const lines = [];
    const log = { warn: (t) => lines.push(["warn", t]), info: (t) => lines.push(["info", t]), debug() {}, level: "info" };
    const core = await createAuthCore(options, { env: { OPS: TOKEN }, log, loopback: true });
    try {
        const old = await mint(privateKey, { iat: 1_000_000_000 });
        for (let i = 0; i < 3; i++) {
            await core.check(new Request("http://127.0.0.1/", { headers: { authorization: `Bearer ${old}` } })).catch(() => undefined);
        }
        const said = lines.filter(([, t]) => /issuer "psu" was refused/.test(t));
        assert.deepEqual(said, [["info", 'auth: a token of the issuer "psu" was refused (EXPIRED)']]);
        assert.ok(!JSON.stringify(lines).includes(old), "the log holds the token");
    } finally {
        core.close();
    }
});

test("a token always resolves to a profile the operator chose: an issuer without profile and without auth.defaultProfile stops the start", async () => {
    const { options } = setup({ issuerExtra: { profile: undefined } });
    await assert.rejects(restServer(options, { env: { OPS: TOKEN } }), /auth\.externalIssuers\[0\]\.profile: a token that names no profile needs a profile you chose; set the issuer's profile or auth\.defaultProfile/);
    const { text } = await checkConfig(options, { env: { OPS: TOKEN }, http: true, rest: true });
    assert.match(factsOf(text), /PROBLEM: auth\.externalIssuers\[0\]\.profile: a token that names no profile needs a profile you chose; set the issuer's profile or auth\.defaultProfile -> the server does not start/);
    assert.match(factsOf(text), / {4}without a profile: none: refused\n/);
    // auth.defaultProfile alone is enough
    const withDefault = setup({ issuerExtra: { profile: undefined }, auth: { defaultProfile: "staff" } });
    const { core, of } = await callerWith(withDefault.options);
    try {
        assert.equal((await of(await mint(withDefault.privateKey, { claims: { profile: undefined } }))).profile, "staff");
    } finally {
        core.close();
    }
});

test("check-config warns when the profile a token without one gets is not in the issuer's profiles", async () => {
    const own = setup({ issuerExtra: { profiles: ["staff"], profile: "viewer" } });
    assert.match(factsOf((await checkConfig(own.options, { env: { OPS: TOKEN }, http: true, rest: true })).text), /WARNING \(External token issuers\): auth\.externalIssuers\[0\]: a token that names no profile gets viewer, which its profiles do not list \(staff\); a token naming viewer itself gets 401/);
    const byDefault = setup({ issuerExtra: { profiles: ["staff"], profile: undefined }, auth: { defaultProfile: "viewer" } });
    assert.match(factsOf((await checkConfig(byDefault.options, { env: { OPS: TOKEN }, http: true, rest: true })).text), /WARNING \(External token issuers\): auth\.externalIssuers\[0\]: a token that names no profile gets viewer/);
    const fine = setup();
    assert.doesNotMatch((await checkConfig(fine.options, { env: { OPS: TOKEN }, http: true, rest: true })).text, /which its profiles do not list/);
});

test("issuers without auth.mode token check nothing: the start and check-config warn, and say what to set", async () => {
    // no mode written and no state directory: the server runs without auth, and an issuer's token is never read
    const { options } = setup({ auth: { mode: undefined, tokens: undefined } });
    const server = await restServer(options);
    try {
        const said = server.log.filter((l) => l.level === "warn").map((l) => l.msg);
        assert.ok(
            said.some((t) => /auth\.externalIssuers is set, but auth\.mode is not set \(so "none"\): its tokens are not checked.*set auth\.mode "token"/.test(t)),
            JSON.stringify(server.log)
        );
    } finally {
        await server.close();
    }
    const { text } = await checkConfig(options, { env: {}, http: true, rest: true });
    assert.match(factsOf(text), /WARNING \(Auth\): auth\.externalIssuers is set, but auth\.mode is not set \(so "none"\): its tokens are not checked.*set auth\.mode "token"/);
    // with mode token, no such warning
    const fine = setup();
    assert.doesNotMatch((await checkConfig(fine.options, { env: { OPS: TOKEN }, http: true, rest: true })).text, /auth\.externalIssuers is set, but/);
});

test("sub: surrogates, private-use and unassigned characters get 401; a subject is compared in NFC", async () => {
    const { privateKey, options } = setup();
    const { core, of } = await callerWith(options);
    try {
        for (const [name, sub] of [["a lone surrogate", "alice\uD800"], ["private use", "alice\uE000"], ["unassigned", "alice\u0378"]]) {
            assert.equal((await of(await mint(privateKey, { sub }))).refused, 401, name);
        }
        const composed = await of(await mint(privateKey, { sub: "ren\u00E9" }));
        const decomposed = await of(await mint(privateKey, { sub: "rene\u0301" }));
        assert.equal(composed.subject, "ren\u00E9");
        assert.equal(decomposed.subject, "ren\u00E9", "normalised to NFC");
        assert.equal(identityKey(composed), identityKey(decomposed));
    } finally {
        core.close();
    }
});

test("the once-a-minute log limiter has a hard cap: when it is full, the oldest text goes and may be said again", async () => {
    const { onceAMinute } = await import("../../src/auth.js");
    const said = [];
    const limited = onceAMinute({ info: (t) => said.push(t), warn: (t) => said.push(t) });
    limited("info", "first");
    limited("info", "first");
    assert.equal(said.length, 1, "once a minute");
    for (let i = 0; i < 1000; i++) {
        limited("info", `text ${i}`);
    }
    limited("info", "first");
    assert.equal(said.filter((t) => t === "first").length, 2, "the oldest entry was dropped at the cap");
    limited("info", "text 999");
    assert.equal(said.filter((t) => t === "text 999").length, 1, "a recent one is still held");
});
