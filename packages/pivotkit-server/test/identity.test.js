// Who calls: the subject of a verified OAuth token (auth.subjectClaim), a static token's name, or
// "local"; identityKey is the only identity caches and bindings use, and it fails closed (null) for a
// token without a usable subject and for a caller the server did not make. The caller never holds the
// access token; only exchangeTokenFor sends it, and only sources/auth.js may import it.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { callerOf, createContext } from "pivotkit-server";
import { identityKey } from "../src/context.js";
import { callerView, createAuthCore, exchangeTokenFor } from "../src/auth.js";

let issuer;
let issuerServer;
let key;
const RESOURCE = "http://127.0.0.1/mcp";
const quiet = { info() {}, warn() {}, debug() {}, error() {} };

before(async () => {
    key = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    issuerServer = createServer((req, res) => {
        res.writeHead(req.url === "/.well-known/openid-configuration" || req.url === "/jwks" ? 200 : 404, { "content-type": "application/json" });
        res.end(req.url === "/jwks" ? JSON.stringify({ keys: [jwk] }) : JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks`, token_endpoint: `${issuer}/token` }));
    });
    await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${issuerServer.address().port}`;
});
after(() => new Promise((resolve) => issuerServer.close(resolve)));

/** A signed access token with these claims (sub only when given). */
async function jwt(claims = {}, iss = issuer) {
    return new SignJWT({ scope: "pivotkit", client_id: "bot", ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(RESOURCE).setIssuedAt().setExpirationTime("5m").sign(key.privateKey);
}

/** The OAuth core of these auth options, and a function from claims to a verified caller. */
async function oauth(extra = {}) {
    const auth = { mode: "oauth", issuer, resource: RESOURCE, allowInsecureIssuer: true, ...extra };
    const core = await createAuthCore({ auth }, { env: {}, log: quiet, loopback: true });
    return { core, callerFor: async (claims) => callerOf("oauth", await core.verify(await jwt(claims), { audience: [RESOURCE], resource: new URL(RESOURCE) }), auth) };
}

test("an OAuth caller's identity is its issuer and subject; the client alone is none", async () => {
    const { core, callerFor } = await oauth();
    try {
        const ana = await callerFor({ sub: "ana" });
        assert.equal(ana.subject, "ana");
        assert.equal(ana.issuer, issuer);
        const again = await callerFor({ sub: "ana", client_id: "another-client", scope: "other" });
        const ben = await callerFor({ sub: "ben" });
        assert.match(String(identityKey(ana)), /^[A-Za-z0-9_-]{43}$/);
        assert.equal(identityKey(ana), identityKey(again), "the same person through another client");
        assert.notEqual(identityKey(ana), identityKey(ben));
        // with the client and scopes: a token through a broad client never stands for a restricted one
        assert.notEqual(identityKey(ana, { client: true }), identityKey(again, { client: true }));
        assert.equal(identityKey(ana, { client: true }), identityKey(await callerFor({ sub: "ana" }), { client: true }));
        // the key says nothing of the subject
        assert.ok(!String(identityKey(ana)).includes("ana"));
    } finally {
        core.close();
    }
});

test("fail closed: no sub, an empty, too long or non-text sub, or a missing configured claim give no identity", async () => {
    const plain = await oauth();
    try {
        for (const claims of [{}, { sub: "" }, { sub: "x".repeat(257) }, { sub: 42 }, { sub: ["a"] }]) {
            const caller = await plain.callerFor(claims);
            assert.equal(caller.subject, null, JSON.stringify(claims).slice(0, 40));
            assert.equal(identityKey(caller), null);
            assert.equal(identityKey(caller, { client: true }), null, "the client is never an identity on its own");
        }
        assert.equal((await plain.callerFor({ sub: "x".repeat(256) })).subject, "x".repeat(256));
    } finally {
        plain.core.close();
    }
    // a provider whose sub differs per application: the operator names another claim
    const entra = await oauth({ subjectClaim: "oid" });
    try {
        const withOid = await entra.callerFor({ sub: "per-app-value", oid: "0000-1111" });
        assert.equal(withOid.subject, "0000-1111");
        const withoutOid = await entra.callerFor({ sub: "per-app-value" });
        assert.equal(withoutOid.subject, null, "sub does not stand in for a missing oid");
        assert.equal(identityKey(withoutOid), null);
    } finally {
        entra.core.close();
    }
});

test("a static token's identity is its name, without sign-in it is local; a caller made by hand has none", () => {
    const named = (name) => callerOf("token", { token: "", clientId: name, scopes: [], expiresAt: 0, extra: { allScopes: true, profile: null } });
    assert.equal(identityKey(named("etl")), identityKey(named("etl")));
    assert.notEqual(identityKey(named("etl")), identityKey(named("bot")));
    // a token named "local" is not the caller without sign-in
    assert.notEqual(identityKey(named("local")), identityKey(callerOf("none", undefined)));
    assert.equal(identityKey(callerOf("none", undefined)), identityKey(callerOf("none", undefined)));
    assert.equal(identityKey({ scopes: null, client: "local", profile: null }), null);
    assert.equal(identityKey(callerOf("oauth", undefined)), null, "a request without a verified token");
});

test("the caller never holds the token; a code source gets a frozen copy built field by field", async () => {
    const { core, callerFor } = await oauth();
    try {
        const token = await jwt({ sub: "ana" });
        const caller = callerOf("oauth", await core.verify(token, { audience: [RESOURCE], resource: new URL(RESOURCE) }), {});
        assert.ok(!JSON.stringify({ ...caller, scopes: [...(caller.scopes ?? [])] }).includes(token.slice(10, 40)));
        const view = callerView(await callerFor({ sub: "ana", scope: "b a" }));
        assert.ok(Object.isFrozen(view));
        assert.ok(Object.isFrozen(view.scopes));
        assert.deepEqual(view.scopes, ["a", "b"]);
        assert.deepEqual(Object.keys(view).sort(), ["client", "groups", "issuer", "profile", "scopes", "subject"]);
        assert.throws(() => {
            /** @type {any} */ (view).subject = "someone else";
        });
    } finally {
        core.close();
    }
});

test("exchangeTokenFor refuses a caller without a signed-in person, and only sources/auth.js may import it", async () => {
    const none = callerOf("none", undefined);
    const token = callerOf("token", { token: "", clientId: "etl", scopes: [], expiresAt: 0, extra: { allScopes: true } });
    const { core, callerFor } = await oauth();
    try {
        const noSubject = await callerFor({});
        for (const caller of [none, token, noSubject, { scopes: null, client: "local", profile: null }]) {
            await assert.rejects(exchangeTokenFor(caller, { url: "https://auth.example.test/token", clientId: "pivotkit" }), (e) => e.code === "NOT_ALLOWED");
        }
    } finally {
        core.close();
    }
    // no module of the server but auth.js and sources/auth.js names it, and the package does not export it
    const src = fileURLToPath(new URL("../src/", import.meta.url));
    const files = readdirSync(src, { recursive: true }).map(String).filter((f) => f.endsWith(".js"));
    const users = files.filter((f) => readFileSync(join(src, f), "utf8").includes("exchangeTokenFor")).sort();
    assert.deepEqual(users.filter((f) => f !== "auth.js" && f !== join("sources", "auth.js")), []);
    assert.equal("exchangeTokenFor" in (await import("pivotkit-server")), false);
});

test("auth.subjectClaim is an option of the configuration", async () => {
    const context = await createContext({ auth: { mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp", subjectClaim: "oid" } });
    await context.close();
});
