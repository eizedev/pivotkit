// Signed short-lived tokens (src/signed-tokens.js) and the commands that manage tokens: the
// verifier on its own (expiry, clock skew, lifetime, type, algorithm, keys, the deny list), then
// `token issue`, `token list`, `token revoke`, `token remove` and `key new|remove --for signing` as
// an operator runs them against a running server, on REST and MCP. Mode bits are POSIX facts: those
// assertions are left out on Windows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { checkConfig, loadConfig, validateOptions } from "pivotkit-server";
import { createSignedVerifier, SIGNED_TOKEN } from "../src/signed-tokens.js";
import { BIN, BY_REGION, TOKEN, call, factsOf, restServer, workspace } from "./helpers.js";

const POSIX = process.platform !== "win32";

/** The command as an operator runs it, without a terminal. */
const run = (args, { env = {}, cwd } = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env }, timeout: 30_000 });

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
    assert.deepEqual(scoped, { id: "0123456789abcdef", scopes: ["pivotkit:read", "pivotkit:render"], profile: "staff", expiresAt: Math.floor(now() / 1000) + 600 });
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

/** An MCP tool call with a bearer token: whether it was let in. */
async function mcpCall(server, token) {
    const client = new Client({ name: "signed", version: "1.0.0" });
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
        const result = await client.callTool({ name: "describe_source", arguments: { source: "sales" } });
        return !result.isError;
    } catch (e) {
        if (/401|invalid_token|Unauthorized/i.test(String(e?.message ?? e))) {
            return false;
        }
        throw e;
    } finally {
        await client.close().catch(() => undefined);
    }
}

test("token issue: a signed token works on REST and MCP at once, its value is in no file, list or log line", async () => {
    const { config, signed } = setup();
    const server = await serverOf(config);
    try {
        const issued = run(["token", "issue", "--config", config, "--name", "ci", "--expires", "1h", "--json"]);
        assert.equal(issued.status, 0, issued.stderr);
        const out = JSON.parse(issued.stdout);
        assert.match(out.token, JWT_TEXT);
        assert.match(out.id, /^[0-9a-f]{16}$/);
        assert.equal(out.name, "ci");
        assert.ok(Math.abs(Date.parse(out.expiresAt) - Date.now() - 3_600_000) < 60_000);
        const token = out.token;
        // REST and MCP both let it in, without a restart
        assert.equal((await call(`${server.api}/views/validate`, { body: { source: "sales", view: BY_REGION }, token })).status, 200);
        assert.equal(await mcpCall(server, token), true);
        // the log names the token by its ID, never its value or its name
        const text = JSON.stringify(server.log);
        assert.ok(server.log.some((l) => l.event === "call" && l.client === out.id), text);
        assert.ok(!text.includes(token) && !text.includes(token.split(".")[2]), "the value in the log");
        // the register holds no value
        for (const sub of readdirSync(signed)) {
            for (const name of readdirSync(join(signed, sub))) {
                assert.ok(!readFileSync(join(signed, sub, name), "utf8").includes(token.split(".")[2]), `${sub}/${name} holds the value`);
            }
        }
        // the list: ID, name and expiry, never the value
        const list = run(["token", "list", "--config", config]);
        assert.equal(list.status, 0, list.stderr);
        assert.match(list.stdout, new RegExp(`${out.id}\\s+ci\\s+signed`));
        assert.match(list.stdout, /ops\s+ops\s+static/);
        assert.ok(!list.stdout.includes(token) && !list.stdout.includes(TOKEN));
        const json = JSON.parse(run(["token", "list", "--config", config, "--json"]).stdout);
        assert.deepEqual(json.tokens.map((t) => [t.id, t.kind, t.status]), [["ops", "static", "active"], [out.id, "signed", "active"]]);
        assert.ok(!JSON.stringify(json).includes(token) && !JSON.stringify(json).includes(TOKEN));
    } finally {
        await server.close();
    }
});

test("token issue: keys and records have mode 0600 in directories with mode 0700", { skip: !POSIX }, () => {
    const { config, signed } = setup();
    assert.equal(run(["token", "issue", "--config", config]).status, 0);
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
        const a = JSON.parse(run(["token", "issue", "--config", config, "--name", "laptop", "--json"]).stdout);
        const b = JSON.parse(run(["token", "issue", "--config", config, "--json"]).stdout);
        assert.equal((await call(`${server.api}/sources`, { token: a.token })).status, 200);
        assert.equal(run(["token", "revoke", "laptop", "--config", config]).status, 0);
        const refused = await call(`${server.api}/sources`, { token: a.token });
        assert.equal(refused.status, 401);
        assert.equal(await mcpCall(server, a.token), false);
        // the other one still works; then revoked by its ID
        assert.equal((await call(`${server.api}/sources`, { token: b.token })).status, 200);
        assert.equal(run(["token", "revoke", b.id, "--config", config]).status, 0);
        assert.equal((await call(`${server.api}/sources`, { token: b.token })).status, 401);
        const list = JSON.parse(run(["token", "list", "--config", config, "--json"]).stdout);
        assert.equal(list.tokens.find((t) => t.id === a.id).status, "revoked");
        // an ID from the log that the register does not know is revoked too
        assert.equal(run(["token", "revoke", "fedcba9876543210", "--config", config]).status, 0);
    } finally {
        await server.close();
    }
});

test("token issue: the profile and scopes go into the token, and an unknown profile is refused", async () => {
    const { config } = setup({ policy: { profiles: { narrow: { default: "show", fields: { Customer: "hide" } } } } });
    const server = await serverOf(config);
    try {
        const narrow = JSON.parse(run(["token", "issue", "--config", config, "--profile", "narrow", "--json"]).stdout).token;
        const described = await call(`${server.api}/sources/sales`, { token: narrow });
        assert.equal(described.status, 200);
        assert.ok(!JSON.stringify(described.data).includes("Customer"));
        // the source needs pivotkit:sales: a token with another scope does not see it, one with it does
        const other = JSON.parse(run(["token", "issue", "--config", config, "--scope", "pivotkit:other", "--json"]).stdout).token;
        const sales = JSON.parse(run(["token", "issue", "--config", config, "--scope", "pivotkit:sales", "--json"]).stdout).token;
        const ids = async (token) => (await call(`${server.api}/sources`, { token })).data.sources.map((s) => s.id);
        assert.deepEqual(await ids(other), []);
        assert.deepEqual(await ids(sales), ["sales"]);
        const wrong = run(["token", "issue", "--config", config, "--profile", "narow"]);
        assert.equal(wrong.status, 2);
        assert.match(wrong.stderr, /did you mean "narrow"/);
    } finally {
        await server.close();
    }
});

test("token issue: a lifetime over the maximum, a name in ID form and a taken name are refused", () => {
    const { config } = setup({ auth: { signedTokens: { dir: "signed", maxDays: 7 } } });
    const long = run(["token", "issue", "--config", config, "--expires", "8d"]);
    assert.equal(long.status, 2);
    assert.match(long.stderr, /at most 7 days/);
    assert.equal(run(["token", "issue", "--config", config, "--expires", "7d"]).status, 0);
    assert.equal(run(["token", "issue", "--config", config, "--name", "0123456789abcdef"]).status, 2);
    assert.equal(run(["token", "issue", "--config", config, "--name", "ops"]).status, 2);
    assert.equal(run(["token", "issue", "--config", config, "--name", "ci"]).status, 0);
    const again = run(["token", "issue", "--config", config, "--name", "ci"]);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /"ci"/);
    // a date works as an expiry too
    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    assert.equal(run(["token", "issue", "--config", config, "--expires", date]).status, 0);
});

test("key rotation: a second key signs new tokens, tokens of the first stay valid until it is removed", async () => {
    const { config, signed } = setup();
    const server = await serverOf(config);
    try {
        const old = JSON.parse(run(["token", "issue", "--config", config, "--json"]).stdout);
        const made = run(["key", "new", "--for", "signing", "--config", config, "--json"]);
        assert.equal(made.status, 0, made.stderr);
        const kid = JSON.parse(made.stdout).kid;
        assert.ok(!made.stdout.includes("PRIVATE") && JSON.parse(made.stdout).key === undefined, "a private key is never printed");
        const fresh = JSON.parse(run(["token", "issue", "--config", config, "--json"]).stdout);
        const kidOf = (token) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).kid;
        assert.equal(kidOf(fresh.token), kid);
        assert.notEqual(kidOf(old.token), kid);
        assert.equal((await call(`${server.api}/sources`, { token: old.token })).status, 200);
        assert.equal((await call(`${server.api}/sources`, { token: fresh.token })).status, 200);
        // the old key signs a live token: refused without --force
        const busy = run(["key", "remove", kidOf(old.token), "--for", "signing", "--config", config]);
        assert.equal(busy.status, 1);
        assert.match(busy.stderr, /1 token/);
        assert.equal(run(["key", "remove", kidOf(old.token), "--for", "signing", "--config", config, "--force"]).status, 0);
        assert.equal(readdirSync(join(signed, "keys")).length, 1);
        assert.equal((await call(`${server.api}/sources`, { token: old.token })).status, 401);
        assert.equal((await call(`${server.api}/sources`, { token: fresh.token })).status, 200);
        // key new --for signing never writes a file of yours or prints the key
        assert.equal(run(["key", "new", "--for", "signing", "--config", config, "--print"]).status, 2);
        assert.equal(run(["key", "new", "--for", "signing", "--config", config, "--file", "x.key"]).status, 2);
    } finally {
        await server.close();
    }
});

test("a static token that looks like a JWT still works with signed tokens on", async () => {
    const { config } = setup();
    const dotted = "abcDEF0123.ghiJKL4567mnop.qrsTUV89wxyz-_";
    const server = await restServer(await loadConfig(config), { env: { OPS_TOKEN: dotted }, enable: ["rest"] });
    try {
        assert.equal(run(["token", "issue", "--config", config]).status, 0);
        assert.equal((await call(`${server.api}/sources`, { token: dotted })).status, 200);
    } finally {
        await server.close();
    }
});

test("token remove: a signed token is revoked and leaves the list; token revoke refuses a static token", async () => {
    const { config } = setup();
    const server = await serverOf(config);
    try {
        const t = JSON.parse(run(["token", "issue", "--config", config, "--name", "temp", "--json"]).stdout);
        assert.equal(run(["token", "remove", "temp", "--config", config]).status, 0);
        assert.equal((await call(`${server.api}/sources`, { token: t.token })).status, 401);
        const list = JSON.parse(run(["token", "list", "--config", config, "--json"]).stdout);
        assert.ok(!list.tokens.some((x) => x.id === t.id));
        const staticRevoke = run(["token", "revoke", "ops", "--config", config]);
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
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "old", env: "OLD", expires: past }, { name: "new", env: "NEW", expires: future }] }, baseDir: dir }, { env: { OLD: TOKEN, NEW: "another-test-token-long-enough-9876543210" } });
    try {
        const old = await call(`${server.api}/sources`, { token: TOKEN });
        assert.equal(old.status, 401);
        assert.match(JSON.stringify(old.data), /expired/);
        assert.equal((await call(`${server.api}/sources`, { token: "another-test-token-long-enough-9876543210" })).status, 200);
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
    for (const bad of ["tomorrow", "2027-13-01", "2027-01-31T08:00:00", "31.01.2027"]) {
        assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, tokens: [{ name: "a", env: "A", expires: bad }] } }), /auth\.tokens\[0\]\.expires/, bad);
    }
});

test("check-config warns of a static token that expires within a week or has expired, and lists the signing keys", async () => {
    const { config } = setup();
    assert.equal(run(["token", "issue", "--config", config]).status, 0);
    const options = await loadConfig(config);
    options.auth.tokens = [{ name: "ops", env: "OPS_TOKEN", expires: new Date(Date.now() + 3 * 86_400_000).toISOString() }, { name: "gone", env: "GONE_TOKEN", expires: "2020-01-01" }];
    const { text } = await checkConfig(options, { http: true, env: { OPS_TOKEN: TOKEN, GONE_TOKEN: "another-test-token-long-enough-9876543210" }, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true, mcp: false });
    const facts = factsOf(text);
    assert.match(facts, /WARNING \(Auth\): the token ops expires on \d{4}-\d{2}-\d{2}/);
    assert.match(facts, /WARNING \(Auth\): the token gone expired on 2020-01-01/);
    assert.match(facts, /Signed tokens: .*signed\n\s+1 key \(k\d{17}-[0-9a-f]{4} signs\), 1 active, 0 revoked/);
});

test("token new --expires writes the expiry into auth.tokens with --add; token remove takes it out with a backup, and deletes a file only where the server made it", () => {
    const { dir, config } = setup();
    const added = run(["token", "new", "--file", join(dir, "bot.token"), "--config", config, "--add", "--name", "bot", "--expires", "2030-06-30"]);
    assert.equal(added.status, 0, added.stderr);
    const after = JSON.parse(readFileSync(config, "utf8"));
    assert.equal(after.auth.tokens.find((t) => t.name === "bot").expires, "2030-06-30");
    const removed = run(["token", "remove", "bot", "--config", config]);
    assert.equal(removed.status, 0, removed.stderr);
    assert.ok(!JSON.parse(readFileSync(config, "utf8")).auth.tokens.some((t) => t.name === "bot"));
    assert.ok(readdirSync(dir).some((n) => n.startsWith("pivotkit.json.bak-")));
    // token new made that file, not the server: it stays, and the command says how to refuse it now
    assert.equal(existsSync(join(dir, "bot.token")), true);
    assert.match(removed.stderr, /restart/i);
    // a file the server makes (create: true) goes with its entry
    const raw = JSON.parse(readFileSync(config, "utf8"));
    raw.auth.tokens.push({ name: "made", file: "made.token", create: true });
    writeFileSync(config, JSON.stringify(raw));
    writeFileSync(join(dir, "made.token"), "made-by-the-server-at-start-0123456789abcdef\n");
    assert.equal(run(["token", "remove", "made", "--config", config]).status, 0);
    assert.equal(existsSync(join(dir, "made.token")), false);
    // the last static token stays
    const last = run(["token", "remove", "ops", "--config", config]);
    assert.equal(last.status, 2);
    assert.match(last.stderr, /last token/);
});

test("key new: a key made in the same millisecond, or with the clock set back, still sorts after the others and signs", async () => {
    const { signedStore } = await import("../src/signed-tokens.js");
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

test("with a state directory and no configuration of its own: token issue --state-dir makes the key in secrets/signed, and the server takes the token", async () => {
    const { serve } = await import("pivotkit-server");
    const { mkdirSync } = await import("node:fs");
    const dir = workspace();
    const state = join(dir, "state");
    mkdirSync(state);
    const log = [];
    const server = await serve({ sources: { sales: { file: "data/sales.csv" } }, http: { host: "0.0.0.0", port: 0, enable: ["rest"] }, baseDir: dir }, { env: {}, stateDir: state, stderr: { write: (t) => log.push(String(t)) } });
    try {
        const issued = run(["token", "issue", "--json"], { env: { PIVOTKIT_STATE_DIR: state } });
        assert.equal(issued.status, 0, issued.stderr);
        const { token, id } = JSON.parse(issued.stdout);
        assert.equal(readdirSync(join(state, "secrets", "signed", "keys")).length, 1);
        assert.equal((await call(`http://127.0.0.1:${server.port}/api/v1/sources`, { token })).status, 200);
        const list = run(["token", "list"], { env: { PIVOTKIT_STATE_DIR: state } });
        assert.match(list.stdout, /admin\s+admin\s+static/);
        assert.match(list.stdout, new RegExp(`${id}\\s+-\\s+signed`));
        // the server's own token is not removed: it is given a new value instead
        const admin = run(["token", "remove", "admin"], { env: { PIVOTKIT_STATE_DIR: state } });
        assert.equal(admin.status, 2);
        assert.match(admin.stderr, /token new --file .*admin\.token --force/);
    } finally {
        await server.close();
    }
});
