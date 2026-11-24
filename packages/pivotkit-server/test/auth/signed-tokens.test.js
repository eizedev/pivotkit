// Signed short-lived tokens (src/signed-tokens.js) and the commands that manage tokens: the
// verifier on its own (expiry, clock skew, lifetime, type, algorithm, keys, the deny list), then
// `token issue`, `token list`, `token revoke`, `token remove` and `key new|remove --for signing` as
// an operator runs them against a running server, on REST and MCP. Mode bits are POSIX facts: those
// assertions are left out on Windows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { checkConfig, loadConfig, validateOptions } from "pivotkit-server";
import { createSignedVerifier, SIGNED_TOKEN } from "../../src/signed-tokens.js";
import { BY_REGION, OTHER_TOKEN, POSIX, TOKEN, call, factsOf, restServer, runBin, workspace, mcpToolWorks } from "../helpers.js";

/** A signed token as the server makes it: three base64url parts. */
const JWT_TEXT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------------------------
// The verifier on its own

/** A key pair and a verifier that knows it, with a clock the test sets and a deny list it fills. */
function verifierWith({ maxLifetimeSec = 3600, clockToleranceSec = 30 } = {}) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const revoked = new Set();
    let nowMs = Date.UTC(2026, 10, 16, 12, 0, 0);
    const verifier = createSignedVerifier({
        keyFor: async (kid) => (kid === "k1" ? publicKey : null),
        isRevoked: async (id) => revoked.has(id),
        issuer: SIGNED_TOKEN.issuer,
        typ: SIGNED_TOKEN.typ,
        clockToleranceSec,
        maxLifetimeSec,
        now: () => nowMs
    });
    /** A token signed with the pair: claims and header changed where a test asks. */
    const mint = async ({ iat = Math.floor(nowMs / 1000), life = 600, claims = {}, header = {}, key = privateKey } = {}) =>
        new SignJWT({ jti: "0123456789abcdef", ...claims })
            .setProtectedHeader({ alg: "EdDSA", kid: "k1", typ: SIGNED_TOKEN.typ, ...header })
            .setIssuer(SIGNED_TOKEN.issuer)
            .setIssuedAt(iat)
            .setNotBefore(iat)
            .setExpirationTime(iat + life)
            .sign(key);
    return { verifier, mint, revoked, publicKey, setNow: (ms) => (nowMs = ms), now: () => nowMs };
}

test("verifier: a fresh token gives its ID, scopes, profile and expiry; no scope claim means every scope", async () => {
    const { verifier, mint, now } = verifierWith();
    const scoped = await verifier.verify(await mint({ claims: { scope: "pivotkit:read pivotkit:render", profile: "staff" } }));
    assert.deepEqual(scoped, { id: "0123456789abcdef", scopes: ["pivotkit:read", "pivotkit:render"], profile: "staff", expiresAt: Math.floor(now() / 1000) + 600, subject: null });
    const all = await verifier.verify(await mint());
    assert.equal(all.scopes, null);
    assert.equal(all.profile, null);
});

test("verifier: an expired token is refused; a token just past its expiry within the clock tolerance passes", async () => {
    const { verifier, mint, setNow, now } = verifierWith();
    const token = await mint({ life: 600 });
    const start = now();
    setNow(start + 600_000 + 20_000);
    assert.equal((await verifier.verify(token)).id, "0123456789abcdef");
    setNow(start + 600_000 + 40_000);
    await assert.rejects(verifier.verify(token), (e) => e.code === "EXPIRED");
});

test("verifier: a token from a clock ahead is taken within the tolerance and refused beyond it", async () => {
    const { verifier, mint, now } = verifierWith();
    const t = Math.floor(now() / 1000);
    assert.ok(await verifier.verify(await mint({ iat: t + 20 })));
    await assert.rejects(verifier.verify(await mint({ iat: t + 120 })), (e) => e.code === "NOT_YET_VALID");
});

test("verifier: a lifetime over the maximum is refused even with a valid signature", async () => {
    const { verifier, mint } = verifierWith({ maxLifetimeSec: 3600 });
    assert.ok(await verifier.verify(await mint({ life: 3600 })));
    await assert.rejects(verifier.verify(await mint({ life: 3601 })), (e) => e.code === "TOO_LONG");
});

test("verifier: another type, an unknown or malformed key ID, another key, another issuer: refused", async () => {
    const { verifier, mint } = verifierWith();
    await assert.rejects(verifier.verify(await mint({ header: { typ: "JWT" } })), (e) => e.code === "INVALID");
    await assert.rejects(verifier.verify(await mint({ header: { kid: "k2" } })), (e) => e.code === "UNKNOWN_KEY");
    await assert.rejects(verifier.verify(await mint({ header: { kid: "../../etc/passwd" } })), (e) => e.code === "UNKNOWN_KEY");
    const other = generateKeyPairSync("ed25519").privateKey;
    await assert.rejects(verifier.verify(await mint({ key: other })), (e) => e.code === "INVALID");
    const foreign = await new SignJWT({ jti: "0123456789abcdef" }).setProtectedHeader({ alg: "EdDSA", kid: "k1", typ: SIGNED_TOKEN.typ }).setIssuer("someone-else").setIssuedAt().setExpirationTime("5m").sign(other);
    await assert.rejects(verifier.verify(foreign), (e) => e.code === "INVALID");
});

test("verifier: HS256 with a shared secret and alg none are refused", async () => {
    const { verifier } = verifierWith();
    const hs = await new SignJWT({ jti: "0123456789abcdef" }).setProtectedHeader({ alg: "HS256", kid: "k1", typ: SIGNED_TOKEN.typ }).setIssuer(SIGNED_TOKEN.issuer).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("a shared secret of enough length 0123456789"));
    await assert.rejects(verifier.verify(hs), (e) => e.code === "INVALID");
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", kid: "k1", typ: SIGNED_TOKEN.typ })}.${b64({ jti: "0123456789abcdef", iss: SIGNED_TOKEN.issuer, iat: 1, exp: 9_999_999_999 })}.`;
    await assert.rejects(verifier.verify(none), (e) => e.code === "INVALID");
});

test("verifier: a malformed scope, profile or ID claim is refused, never taken as every scope", async () => {
    const { verifier, mint } = verifierWith();
    await assert.rejects(verifier.verify(await mint({ claims: { scope: ["pivotkit:read"] } })), (e) => e.code === "INVALID");
    await assert.rejects(verifier.verify(await mint({ claims: { scope: 7 } })), (e) => e.code === "INVALID");
    await assert.rejects(verifier.verify(await mint({ claims: { profile: { name: "staff" } } })), (e) => e.code === "INVALID");
    await assert.rejects(verifier.verify(await mint({ claims: { profile: "../x" } })), (e) => e.code === "INVALID");
    await assert.rejects(verifier.verify(await mint({ claims: { jti: "../../revoked" } })), (e) => e.code === "INVALID");
});

test("verifier: a revoked token is refused, and a deny list that cannot be read refuses too", async () => {
    const { verifier, mint, revoked, publicKey, now } = verifierWith();
    const token = await mint();
    assert.ok(await verifier.verify(token));
    revoked.add("0123456789abcdef");
    await assert.rejects(verifier.verify(token), (e) => e.code === "REVOKED");
    const broken = createSignedVerifier({ keyFor: async () => publicKey, isRevoked: async () => Promise.reject(Object.assign(new Error("EIO"), { code: "EIO" })), issuer: SIGNED_TOKEN.issuer, typ: SIGNED_TOKEN.typ, clockToleranceSec: 30, maxLifetimeSec: 3600, now });
    await assert.rejects(broken.verify(token), (e) => e.code === "DENY_LIST");
});

// ---------------------------------------------------------------------------------------------
// The commands against a running server

/** A workspace with a configuration that has one static token and signed tokens in ./signed. */
function setup({ auth = {}, policy } = {}) {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    const options = { sources: { sales: { file: "data/sales.csv", scopes: ["pivotkit:sales"], policy: { default: "show" } } }, auth: { mode: "token", tokens: [{ name: "ops", env: "OPS_TOKEN" }], signedTokens: { dir: "signed" }, ...auth }, ...(policy ? { policy } : {}) };
    writeFileSync(config, `${JSON.stringify(options, null, 2)}\n`);
    return { dir, config, signed: join(dir, "signed") };
}

/** The server of a configuration file, REST and MCP, the static token in its variable. */
const serverOf = async (config) => restServer(await loadConfig(config), { env: { OPS_TOKEN: TOKEN }, enable: ["rest", "mcp"] });

test("token issue: a signed token works on REST and MCP at once, its value is in no file, list or log line", async () => {
    const { config, signed } = setup();
    const server = await serverOf(config);
    try {
        const issued = runBin(["token", "issue", "--config", config, "--name", "ci", "--expires", "1h", "--json"]);
        assert.equal(issued.status, 0, issued.stderr);
        const out = JSON.parse(issued.stdout);
        assert.match(out.token, JWT_TEXT);
        assert.match(out.id, /^[0-9a-f]{16}$/);
        assert.equal(out.name, "ci");
        assert.ok(Math.abs(Date.parse(out.expiresAt) - Date.now() - 3_600_000) < 60_000); // wall time: a timestamp the code wrote
        const token = out.token;
        // REST and MCP both let it in, without a restart
        assert.equal((await call(`${server.api}/views/validate`, { body: { source: "sales", view: BY_REGION }, token })).status, 200);
        assert.equal(await mcpToolWorks(server, token), true);
        // the log names the token by its ID, never its value or its name
        const text = JSON.stringify(server.log);
        assert.ok(server.log.some((l) => l.event === "call" && l.client === out.id), text);
        assert.ok(!text.includes(token) && !text.includes(token.split(".")[2]), "the value in the log");
        // the register holds no value
        for (const sub of readdirSync(signed).filter((n) => statSync(join(signed, n)).isDirectory())) {
            for (const name of readdirSync(join(signed, sub))) {
                assert.ok(!readFileSync(join(signed, sub, name), "utf8").includes(token.split(".")[2]), `${sub}/${name} holds the value`);
            }
        }
        // the list: ID, name and expiry, never the value
        const list = runBin(["token", "list", "--config", config]);
        assert.equal(list.status, 0, list.stderr);
        assert.match(list.stdout, new RegExp(`${out.id}\\s+ci\\s+signed`));
        assert.match(list.stdout, /ops\s+ops\s+static/);
        assert.ok(!list.stdout.includes(token) && !list.stdout.includes(TOKEN));
        const json = JSON.parse(runBin(["token", "list", "--config", config, "--json"]).stdout);
        assert.deepEqual(json.tokens.map((t) => [t.id, t.kind, t.status]), [["ops", "static", "active"], [out.id, "signed", "active"]]);
        assert.ok(!JSON.stringify(json).includes(token) && !JSON.stringify(json).includes(TOKEN));
    } finally {
        await server.close();
    }
});

test("token issue: keys and records have mode 0600 in directories with mode 0700", { skip: !POSIX }, () => {
    const { config, signed } = setup();
    assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
    for (const sub of ["keys", "issued"]) {
        assert.equal(statSync(join(signed, sub)).mode & 0o777, 0o700, sub);
        for (const name of readdirSync(join(signed, sub))) {
            assert.equal(statSync(join(signed, sub, name)).mode & 0o777, 0o600, `${sub}/${name}`);
        }
    }
    assert.equal(statSync(signed).mode & 0o777, 0o700);
});

test("token revoke by name or ID: the next request with it is refused on REST and MCP", async () => {
    const { config } = setup();
    const server = await serverOf(config);
    try {
        const a = JSON.parse(runBin(["token", "issue", "--config", config, "--name", "laptop", "--json"]).stdout);
        const b = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout);
        assert.equal((await call(`${server.api}/sources`, { token: a.token })).status, 200);
        assert.equal(runBin(["token", "revoke", "laptop", "--config", config]).status, 0);
        const refused = await call(`${server.api}/sources`, { token: a.token });
        assert.equal(refused.status, 401);
        assert.equal(await mcpToolWorks(server, a.token), false);
        // the other one still works; then revoked by its ID
        assert.equal((await call(`${server.api}/sources`, { token: b.token })).status, 200);
        assert.equal(runBin(["token", "revoke", b.id, "--config", config]).status, 0);
        assert.equal((await call(`${server.api}/sources`, { token: b.token })).status, 401);
        const list = JSON.parse(runBin(["token", "list", "--config", config, "--json"]).stdout);
        assert.equal(list.tokens.find((t) => t.id === a.id).status, "revoked");
        // an ID from the log that the register does not know is revoked too
        assert.equal(runBin(["token", "revoke", "fedcba9876543210", "--config", config]).status, 0);
    } finally {
        await server.close();
    }
});

test("token issue: the profile and scopes go into the token, and an unknown profile is refused", async () => {
    const { config } = setup({ policy: { profiles: { narrow: { default: "show", fields: { Customer: "hide" } } } } });
    const server = await serverOf(config);
    try {
        const narrow = JSON.parse(runBin(["token", "issue", "--config", config, "--profile", "narrow", "--json"]).stdout).token;
        const described = await call(`${server.api}/sources/sales`, { token: narrow });
        assert.equal(described.status, 200);
        assert.ok(!JSON.stringify(described.data).includes("Customer"));
        // the source needs pivotkit:sales: a token with another scope does not see it, one with it does
        const other = JSON.parse(runBin(["token", "issue", "--config", config, "--scope", "pivotkit:other", "--json"]).stdout).token;
        const sales = JSON.parse(runBin(["token", "issue", "--config", config, "--scope", "pivotkit:sales", "--json"]).stdout).token;
        const ids = async (token) => (await call(`${server.api}/sources`, { token })).data.sources.map((s) => s.id);
        assert.deepEqual(await ids(other), []);
        assert.deepEqual(await ids(sales), ["sales"]);
        const wrong = runBin(["token", "issue", "--config", config, "--profile", "narow"]);
        assert.equal(wrong.status, 2);
        assert.match(wrong.stderr, /did you mean "narrow"/);
    } finally {
        await server.close();
    }
});

test("token issue: a lifetime over the maximum, a name in ID form and a taken name are refused", () => {
    const { config } = setup({ auth: { signedTokens: { dir: "signed", maxDays: 7 } } });
    const long = runBin(["token", "issue", "--config", config, "--expires", "8d"]);
    assert.equal(long.status, 2);
    assert.match(long.stderr, /at most 7 days/);
    assert.equal(runBin(["token", "issue", "--config", config, "--expires", "7d"]).status, 0);
    assert.equal(runBin(["token", "issue", "--config", config, "--name", "0123456789abcdef"]).status, 2);
    assert.equal(runBin(["token", "issue", "--config", config, "--name", "ops"]).status, 2);
    assert.equal(runBin(["token", "issue", "--config", config, "--name", "ci"]).status, 0);
    const again = runBin(["token", "issue", "--config", config, "--name", "ci"]);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /"ci"/);
    // a date works as an expiry too
    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    assert.equal(runBin(["token", "issue", "--config", config, "--expires", date]).status, 0);
});

test("key rotation: a second key signs new tokens, tokens of the first stay valid until it is removed", async () => {
    const { config, signed } = setup();
    const server = await serverOf(config);
    try {
        const old = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout);
        const made = runBin(["key", "new", "--for", "signing", "--config", config, "--json"]);
        assert.equal(made.status, 0, made.stderr);
        const kid = JSON.parse(made.stdout).kid;
        assert.ok(!made.stdout.includes("PRIVATE") && JSON.parse(made.stdout).key === undefined, "a private key is never printed");
        const fresh = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout);
        const kidOf = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).kid;
        assert.equal(kidOf(fresh.token), kid);
        assert.notEqual(kidOf(old.token), kid);
        assert.equal((await call(`${server.api}/sources`, { token: old.token })).status, 200);
        assert.equal((await call(`${server.api}/sources`, { token: fresh.token })).status, 200);
        // the old key signs a live token: refused without --force
        const busy = runBin(["key", "remove", kidOf(old.token), "--for", "signing", "--config", config]);
        assert.equal(busy.status, 1);
        assert.match(busy.stderr, /1 token/);
        assert.equal(runBin(["key", "remove", kidOf(old.token), "--for", "signing", "--config", config, "--force"]).status, 0);
        assert.equal(readdirSync(join(signed, "keys")).length, 1);
        assert.equal((await call(`${server.api}/sources`, { token: old.token })).status, 401);
        assert.equal((await call(`${server.api}/sources`, { token: fresh.token })).status, 200);
        // key new --for signing never writes a file of yours or prints the key
        assert.equal(runBin(["key", "new", "--for", "signing", "--config", config, "--print"]).status, 2);
        assert.equal(runBin(["key", "new", "--for", "signing", "--config", config, "--file", "x.key"]).status, 2);
    } finally {
        await server.close();
    }
});

test("a static token that looks like a JWT still works with signed tokens on", async () => {
    const { config } = setup();
    const dotted = "abcDEF0123.ghiJKL4567mnop.qrsTUV89wxyz-_";
    const server = await restServer(await loadConfig(config), { env: { OPS_TOKEN: dotted }, enable: ["rest"] });
    try {
        assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
        assert.equal((await call(`${server.api}/sources`, { token: dotted })).status, 200);
    } finally {
        await server.close();
    }
});

test("token remove: a signed token is revoked and leaves the list; token revoke refuses a static token", async () => {
    const { config } = setup();
    const server = await serverOf(config);
    try {
        const t = JSON.parse(runBin(["token", "issue", "--config", config, "--name", "temp", "--json"]).stdout);
        assert.equal(runBin(["token", "remove", "temp", "--config", config]).status, 0);
        assert.equal((await call(`${server.api}/sources`, { token: t.token })).status, 401);
        const list = JSON.parse(runBin(["token", "list", "--config", config, "--json"]).stdout);
        assert.ok(!list.tokens.some((x) => x.id === t.id));
        const staticRevoke = runBin(["token", "revoke", "ops", "--config", config]);
        assert.equal(staticRevoke.status, 2);
        assert.match(staticRevoke.stderr, /token remove/);
    } finally {
        await server.close();
    }
});

// ---------------------------------------------------------------------------------------------
// Static tokens: expiry and remove

test("a static token with expires in the past gets 401; one in the future works", async () => {
    const dir = workspace();
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "old", env: "OLD", expires: past }, { name: "new", env: "NEW", expires: future }] }, baseDir: dir }, { env: { OLD: TOKEN, NEW: OTHER_TOKEN } });
    try {
        const old = await call(`${server.api}/sources`, { token: TOKEN });
        assert.equal(old.status, 401);
        assert.match(JSON.stringify(old.data), /expired/);
        assert.equal((await call(`${server.api}/sources`, { token: OTHER_TOKEN })).status, 200);
        assert.ok(server.log.some((l) => l.level === "warn" && /token "old" expired/.test(l.msg)), JSON.stringify(server.log));
    } finally {
        await server.close();
    }
});

test("auth.tokens[].expires: a date or a date-time with a zone; anything else is refused", () => {
    const base = { auth: { mode: "token", tokens: [{ name: "a", env: "A" }] } };
    for (const good of ["2027-01-31", "2027-01-31T08:00:00Z", "2027-01-31T08:00:00+01:00"]) {
        validateOptions({ ...base, auth: { ...base.auth, tokens: [{ name: "a", env: "A", expires: good }] } });
    }
    for (const bad of ["tomorrow", "2027-13-01", "2027-01-31T08:00:00", "31.01.2027", "2027-01-31T25:00:00Z", "2027-01-31T08:61:00+01:00"]) {
        assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, tokens: [{ name: "a", env: "A", expires: bad }] } }), /auth\.tokens\[0\]\.expires/, bad);
    }
});

test("check-config warns of a static token that expires within a week or has expired, and lists the signing keys", async () => {
    const { config } = setup();
    assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
    const options = await loadConfig(config);
    options.auth.tokens = [{ name: "ops", env: "OPS_TOKEN", expires: new Date(Date.now() + 3 * 86_400_000).toISOString() }, { name: "gone", env: "GONE_TOKEN", expires: "2020-01-01" }];
    const { text } = await checkConfig(options, { http: true, env: { OPS_TOKEN: TOKEN, GONE_TOKEN: OTHER_TOKEN }, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true, mcp: false });
    const facts = factsOf(text);
    assert.match(facts, /WARNING \(Auth\): the token ops expires on \d{4}-\d{2}-\d{2}/);
    assert.match(facts, /WARNING \(Auth\): the token gone expired on 2020-01-01/);
    assert.match(facts, /Signed tokens: .*signed\n\s+1 key \(k\d{17}-[0-9a-f]{4} signs\), 1 active, 0 revoked/);
});

test("token new --expires writes the expiry into auth.tokens with --add; token remove takes it out with a backup, and deletes a file only where the server made it", () => {
    const { dir, config } = setup();
    const added = runBin(["token", "new", "--file", join(dir, "bot.token"), "--config", config, "--add", "--name", "bot", "--expires", "2030-06-30"]);
    assert.equal(added.status, 0, added.stderr);
    const after = JSON.parse(readFileSync(config, "utf8"));
    assert.equal(after.auth.tokens.find((t) => t.name === "bot").expires, "2030-06-30");
    const removed = runBin(["token", "remove", "bot", "--config", config]);
    assert.equal(removed.status, 0, removed.stderr);
    assert.ok(!JSON.parse(readFileSync(config, "utf8")).auth.tokens.some((t) => t.name === "bot"));
    assert.ok(readdirSync(dir).some((n) => n.startsWith("pivotkit.json.bak-")));
    // token new made that file, not the server: it stays, and the command says how to refuse it now
    assert.equal(existsSync(join(dir, "bot.token")), true);
    assert.match(removed.stdout, /restart/i);
    // a file the server makes (create: true) goes with its entry
    const raw = JSON.parse(readFileSync(config, "utf8"));
    raw.auth.tokens.push({ name: "made", file: "made.token", create: true });
    writeFileSync(config, JSON.stringify(raw));
    writeFileSync(join(dir, "made.token"), "made-by-the-server-at-start-0123456789abcdef\n");
    assert.equal(runBin(["token", "remove", "made", "--config", config]).status, 0);
    assert.equal(existsSync(join(dir, "made.token")), false);
    // the last static token stays
    const last = runBin(["token", "remove", "ops", "--config", config]);
    assert.equal(last.status, 2);
    assert.match(last.stderr, /last token/);
});

test("key new: a key made in the same millisecond, or with the clock set back, still sorts after the others and signs", async () => {
    const { signedStore } = await import("../../src/signed-tokens.js");
    const dir = join(workspace(), "signed");
    const fixed = Date.UTC(2026, 10, 16, 12, 0, 0, 0);
    let clock = fixed;
    const store = signedStore(dir, { now: () => clock });
    await store.ensureDirs();
    const kids = [await store.newKey(), await store.newKey()];
    clock = fixed - 3_600_000;
    kids.push(await store.newKey());
    assert.deepEqual([...kids].sort(), kids);
    const { token } = await store.issue({ name: null, profile: null, scopes: null, expiresAt: Math.floor(fixed / 1000) + 60 });
    assert.equal(JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).kid, kids[2]);
});

test("token list: a record edited without its issue time is left out, and the others are still listed", async () => {
    const { signedStore } = await import("../../src/signed-tokens.js");
    const dir = join(workspace(), "signed");
    const store = signedStore(dir);
    await store.ensureDirs();
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    const kept = (await store.issue({ name: "kept", profile: null, scopes: null, expiresAt })).record;
    const edited = (await store.issue({ name: "edited", profile: null, scopes: null, expiresAt })).record;
    const without = { ...edited };
    delete without.issuedAt;
    writeFileSync(join(dir, "issued", `${edited.id}.json`), JSON.stringify(without));
    assert.deepEqual((await store.issued()).map((r) => r.id), [kept.id]);
});

test("with a state directory and no configuration of its own: token issue --state-dir makes the key in secrets/signed, and the server takes the token", async () => {
    const { serve } = await import("pivotkit-server");
    const dir = workspace();
    const state = join(dir, "state");
    mkdirSync(state);
    const log = [];
    const server = await serve({ sources: { sales: { file: "data/sales.csv" } }, http: { host: "0.0.0.0", port: 0, enable: ["rest"] }, baseDir: dir }, { env: {}, stateDir: state, stderr: { write: (t) => log.push(String(t)) } });
    try {
        const issued = runBin(["token", "issue", "--json"], { env: { PIVOTKIT_STATE_DIR: state } });
        assert.equal(issued.status, 0, issued.stderr);
        const { token, id } = JSON.parse(issued.stdout);
        assert.equal(readdirSync(join(state, "secrets", "signed", "keys")).length, 1);
        assert.equal((await call(`http://127.0.0.1:${server.port}/api/v1/sources`, { token })).status, 200);
        const list = runBin(["token", "list"], { env: { PIVOTKIT_STATE_DIR: state } });
        assert.match(list.stdout, /admin\s+admin\s+static/);
        assert.match(list.stdout, new RegExp(`${id}\\s+-\\s+signed`));
        // the server's own token is not removed: it is given a new value instead
        const admin = runBin(["token", "remove", "admin"], { env: { PIVOTKIT_STATE_DIR: state } });
        assert.equal(admin.status, 2);
        assert.match(admin.stderr, /token new --file .*admin\.token --force/);
    } finally {
        await server.close();
    }
});

test("an expired signed token is refused on REST and MCP, and the log names a token by its ID, never by its name", async () => {
    const { signedStore } = await import("../../src/signed-tokens.js");
    const { config, signed } = setup();
    const server = await serverOf(config);
    try {
        const store = signedStore(signed);
        await store.ensureDirs();
        const { token: expired } = await store.issue({ name: null, profile: null, scopes: null, expiresAt: Math.floor(Date.now() / 1000) - 120 });
        const refused = await call(`${server.api}/sources`, { token: expired });
        assert.equal(refused.status, 401);
        assert.match(JSON.stringify(refused.data), /expired/);
        assert.equal(await mcpToolWorks(server, expired), false);
        const named = JSON.parse(runBin(["token", "issue", "--config", config, "--name", "distinct-laptop-name", "--json"]).stdout);
        assert.equal((await call(`${server.api}/sources`, { token: named.token })).status, 200);
        const text = JSON.stringify(server.log);
        assert.ok(text.includes(named.id));
        assert.ok(!text.includes("distinct-laptop-name"), "the name in the log");
    } finally {
        await server.close();
    }
});

test("a signed token whose profile policy.profiles no longer has gets 401", async () => {
    const { config } = setup({ policy: { profiles: { narrow: { default: "show" } } } });
    const token = JSON.parse(runBin(["token", "issue", "--config", config, "--profile", "narrow", "--json"]).stdout).token;
    const options = await loadConfig(config);
    delete options.policy;
    const server = await restServer(options, { env: { OPS_TOKEN: TOKEN } });
    try {
        const refused = await call(`${server.api}/sources`, { token });
        assert.equal(refused.status, 401);
        assert.match(JSON.stringify(refused.data), /profile/);
    } finally {
        await server.close();
    }
});

test("rate limits count per signed token: one token over its limit does not slow another", async () => {
    const { config } = setup();
    const options = await loadConfig(config);
    const server = await restServer({ ...options, rest: { rateLimit: { perMinute: 1, burst: 1 } } }, { env: { OPS_TOKEN: TOKEN } });
    try {
        const a = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout).token;
        const b = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout).token;
        assert.equal((await call(`${server.api}/sources`, { token: a })).status, 200);
        assert.equal((await call(`${server.api}/sources`, { token: a })).status, 429);
        assert.equal((await call(`${server.api}/sources`, { token: b })).status, 200);
    } finally {
        await server.close();
    }
});

test("keys that cannot be read refuse every signed token, and say so on the log at most once a minute", { skip: !POSIX || process.getuid?.() === 0 }, async () => {
    const { config, signed } = setup();
    const token = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout).token;
    const server = await serverOf(config);
    chmodSync(join(signed, "keys"), 0o000);
    try {
        for (let i = 0; i < 5; i++) {
            assert.equal((await call(`${server.api}/sources`, { token })).status, 401);
        }
        const warnings = server.log.filter((l) => l.level === "warn" && /keys cannot be read/.test(l.msg));
        assert.equal(warnings.length, 1, JSON.stringify(server.log));
    } finally {
        chmodSync(join(signed, "keys"), 0o700);
        await server.close();
    }
});

// ---------------------------------------------------------------------------------------------
// Signed tokens under hostile or odd input

test("token issue: many scopes round-trip through the server; a token over the server's length limit is refused at issue", async () => {
    const { config } = setup();
    const server = await serverOf(config);
    try {
        const many = Array.from({ length: 20 }, (_, i) => ["--scope", `pivotkit:scope-${i}`]).flat();
        const ok = runBin(["token", "issue", "--config", config, ...many, "--json"]);
        assert.equal(ok.status, 0, ok.stderr);
        assert.equal((await call(`${server.api}/sources`, { token: JSON.parse(ok.stdout).token })).status, 200);
        const tooMany = Array.from({ length: 40 }, (_, i) => ["--scope", `pivotkit:a-rather-long-scope-name-${i}`]).flat();
        const refused = runBin(["token", "issue", "--config", config, ...tooMany]);
        assert.equal(refused.status, 2);
        assert.equal(refused.stdout, "");
        assert.match(refused.stderr, /too many or too long scopes/);
    } finally {
        await server.close();
    }
});

test("token issue: a scope with whitespace inside is refused", () => {
    const { config } = setup();
    const r = runBin(["token", "issue", "--config", config, "--scope", "pivotkit:a pivotkit:b"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--scope/);
});

test("token remove of a static token whose file stays: the first line says the running server still accepts it", () => {
    const { dir, config } = setup();
    assert.equal(runBin(["token", "new", "--file", join(dir, "leaked.token"), "--config", config, "--add", "--name", "leaked"]).status, 0);
    const r = runBin(["token", "remove", "leaked", "--config", config]);
    assert.equal(r.status, 0, r.stderr);
    const first = r.stdout.split("\n")[0];
    assert.match(first, /^The running server still accepts this token until it restarts\. Restart it now, or delete .*leaked\.token\.$/);
});

test("token list shows key removed for a token whose key was removed with --force", () => {
    const { config } = setup();
    const t = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout);
    const kid = JSON.parse(Buffer.from(t.token.split(".")[0], "base64url").toString()).kid;
    assert.equal(runBin(["key", "remove", kid, "--for", "signing", "--config", config, "--force"]).status, 0);
    const list = JSON.parse(runBin(["token", "list", "--config", config, "--json"]).stdout);
    assert.equal(list.tokens.find((x) => x.id === t.id).status, "key removed");
    assert.match(runBin(["token", "list", "--config", config]).stdout, new RegExp(`${t.id}.*key removed`));
});

test("token revoke of a well-formed ID the register does not know says so", () => {
    const { config } = setup();
    const r = runBin(["token", "revoke", "fedcba9876543210", "--config", config]);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /not in the register; written to the deny list anyway/);
});

test("key loading refuses a symlinked key file and a key file others may read; token issue warns and signs with a good key", { skip: !POSIX }, async () => {
    const { config, signed } = setup();
    // the first issue makes the signing key the planted ones copy
    const first = runBin(["token", "issue", "--config", config, "--json"]);
    assert.equal(first.status, 0, first.stderr);
    const keys = join(signed, "keys");
    const [good] = readdirSync(keys);
    // a planted key with a newer kid, readable by the group, and one behind a symbolic link
    copyFileSync(join(keys, good), join(keys, "k99990101000000000-aaaa.key"));
    chmodSync(join(keys, "k99990101000000000-aaaa.key"), 0o640);
    copyFileSync(join(keys, good), join(signed, "elsewhere.key"));
    chmodSync(join(signed, "elsewhere.key"), 0o600);
    symlinkSync(join(signed, "elsewhere.key"), join(keys, "k99990101000000001-bbbb.key"));
    const r = runBin(["token", "issue", "--config", config, "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const kidOf = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).kid;
    assert.equal(kidOf(out.token), good.slice(0, -4));
    assert.ok(out.warnings.some((w) => /k99990101000000000-aaaa.*readable/.test(w)), JSON.stringify(out.warnings));
    assert.ok(out.warnings.some((w) => /k99990101000000001-bbbb.*symbolic link/.test(w)), JSON.stringify(out.warnings));
    const options = await loadConfig(config);
    const { text } = await checkConfig(options, { http: true, env: { OPS_TOKEN: TOKEN }, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true, mcp: false });
    assert.match(factsOf(text), /k99990101000000000-aaaa.*readable/);
});

test("a refused revoked token is logged at info, by its ID, at most once a minute", async () => {
    const { config } = setup();
    const server = await serverOf(config);
    try {
        const t = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout);
        assert.equal(runBin(["token", "revoke", t.id, "--config", config]).status, 0);
        for (let i = 0; i < 3; i++) {
            assert.equal((await call(`${server.api}/sources`, { token: t.token })).status, 401);
        }
        const lines = server.log.filter((l) => l.level === "info" && /revoked/.test(l.msg) && l.msg.includes(t.id));
        assert.equal(lines.length, 1, JSON.stringify(server.log));
    } finally {
        await server.close();
    }
});

test("verifier: the token ID's rule is a parameter, for an issuer with IDs of its own", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const verifier = createSignedVerifier({ keyFor: async () => publicKey, isRevoked: async () => false, issuer: SIGNED_TOKEN.issuer, typ: SIGNED_TOKEN.typ, clockToleranceSec: 30, maxLifetimeSec: 3600, tokenId: /^psu-[0-9]{4}$/ });
    const token = await new SignJWT({ jti: "psu-0042" }).setProtectedHeader({ alg: "EdDSA", kid: "k1", typ: SIGNED_TOKEN.typ }).setIssuer(SIGNED_TOKEN.issuer).setIssuedAt().setExpirationTime("5m").sign(privateKey);
    assert.equal((await verifier.verify(token)).id, "psu-0042");
});

test("token issue prunes expired records at most once an hour", async () => {
    const { config, signed } = setup();
    assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
    const stale = join(signed, "issued", "00000000000000aa.json");
    const record = { id: "00000000000000aa", name: null, kid: "k1", profile: null, scopes: null, issuedAt: "2020-01-01T00:00:00.000Z", expiresAt: "2020-01-01T01:00:00.000Z" };
    writeFileSync(stale, JSON.stringify(record));
    assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
    assert.equal(existsSync(stale), true, "pruned again within the hour");
    const marker = readdirSync(signed).find((n) => n.startsWith("."));
    assert.ok(marker, "a marker file");
    const old = new Date(Date.now() - 2 * 3_600_000);
    utimesSync(join(signed, marker), old, old);
    assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
    assert.equal(existsSync(stale), false);
});

test("token list --json names a static token's file by its base name, never its full path", () => {
    const { dir, config } = setup();
    assert.equal(runBin(["token", "new", "--file", join(dir, "bot.token"), "--config", config, "--add", "--name", "bot"]).status, 0);
    const out = runBin(["token", "list", "--config", config, "--json"]).stdout;
    assert.ok(!out.includes(dir), out);
    assert.equal(JSON.parse(out).tokens.find((t) => t.id === "bot").source, "file bot.token");
});

test("the prune marker is never written through a symbolic link, and a marker from the future counts as stale", { skip: !POSIX }, async () => {
    const { dir, config, signed } = setup();
    assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
    const marker = join(signed, ".pruned");
    // a marker from the future: pruning runs anyway
    const stale = join(signed, "issued", "00000000000000bb.json");
    writeFileSync(stale, JSON.stringify({ id: "00000000000000bb", name: null, kid: "k1", profile: null, scopes: null, issuedAt: "2020-01-01T00:00:00.000Z", expiresAt: "2020-01-01T01:00:00.000Z" }));
    const future = new Date(Date.now() + 86_400_000);
    utimesSync(marker, future, future);
    assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
    assert.equal(existsSync(stale), false, "a future marker held pruning back");
    // a marker that is a link to another file: the file keeps its content
    const victim = join(dir, "victim.txt");
    writeFileSync(victim, "keep me\n");
    const old = new Date(Date.now() - 2 * 3_600_000);
    utimesSync(victim, old, old);
    unlinkSync(marker);
    symlinkSync(victim, marker);
    assert.equal(runBin(["token", "issue", "--config", config]).status, 0);
    assert.equal(readFileSync(victim, "utf8"), "keep me\n");
});

test("a key file with a wider mode is skipped: the log, check-config and token list say so and give the fix; key remove takes it away", { skip: !POSIX }, async () => {
    const { config, signed } = setup();
    const t = JSON.parse(runBin(["token", "issue", "--config", config, "--json"]).stdout);
    const [file] = readdirSync(join(signed, "keys"));
    const kid = file.slice(0, -4);
    chmodSync(join(signed, "keys", file), 0o640);
    const server = await serverOf(config);
    try {
        assert.equal((await call(`${server.api}/sources`, { token: t.token })).status, 401);
        const line = server.log.find((l) => l.level === "warn" && l.msg.includes(kid));
        assert.ok(line, JSON.stringify(server.log));
        assert.match(line.msg, /its tokens get 401/);
        assert.match(line.msg, /chmod 600 /);
    } finally {
        await server.close();
    }
    const { text } = await checkConfig(await loadConfig(config), { http: true, env: { OPS_TOKEN: TOKEN }, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true, mcp: false });
    assert.match(factsOf(text), /its tokens get 401.*chmod 600/s);
    const list = JSON.parse(runBin(["token", "list", "--config", config, "--json"]).stdout);
    assert.equal(list.tokens.find((x) => x.id === t.id).status, "key unusable");
    const removed = runBin(["key", "remove", kid, "--for", "signing", "--config", config]);
    assert.equal(removed.status, 0, removed.stderr);
    assert.deepEqual(readdirSync(join(signed, "keys")), []);
    assert.equal(JSON.parse(runBin(["token", "list", "--config", config, "--json"]).stdout).tokens.find((x) => x.id === t.id).status, "key removed");
});
