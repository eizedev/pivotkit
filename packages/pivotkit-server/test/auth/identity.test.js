// Who calls: the subject of a verified OAuth token (auth.subjectClaim), a static token's name, or
// "local"; identityKey is the only identity caches and bindings use, and it fails closed (null) for a
// token without a usable subject and for a caller the server did not make. The caller never holds the
// access token; only exchangeTokenFor sends it, and only sources/auth.js may import it.
// The https tests make a certificate per run with the openssl command (loopbackCert in helpers.js):
// it must be on the PATH.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer as createTlsServer } from "node:https";
import { promisify } from "node:util";
import { loopbackCert } from "../helpers.js";
import { localIssuer } from "./local-issuer.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { callerOf, createContext } from "pivotkit-server";
import { identityKey } from "../../src/context.js";
import { callerView, createAuthCore, exchangeTokenFor } from "../../src/auth.js";

const RESOURCE = "http://127.0.0.1/mcp";
const quiet = { info() {}, warn() {}, debug() {}, error() {} };
/** The local issuer (local-issuer.js) and its address. */
let local;
let issuer;

before(async () => {
    local = await localIssuer();
    issuer = local.url;
});
after(() => local.close());

/** A signed access token of the client "bot" with these claims (sub only when given). */
const jwt = (claims = {}) => local.token({ claims: { client_id: "bot", ...claims }, aud: RESOURCE });

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
    const src = fileURLToPath(new URL("../../src/", import.meta.url));
    const files = readdirSync(src, { recursive: true }).map(String).filter((f) => f.endsWith(".js"));
    const users = files.filter((f) => readFileSync(join(src, f), "utf8").includes("exchangeTokenFor")).sort();
    assert.deepEqual(users.filter((f) => f !== "auth.js" && f !== join("sources", "auth.js")), []);
    assert.equal("exchangeTokenFor" in (await import("pivotkit-server")), false);
});

test("auth.subjectClaim is an option of the configuration", async () => {
    const context = await createContext({ auth: { mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp", subjectClaim: "oid" } });
    await context.close();
});

test("exchangeTokenFor sends the caller's token as the subject_token to the token endpoint only, with the client's credentials", async () => {
    // a token endpoint over https with a certificate made for this run; the child process trusts it
    // through NODE_EXTRA_CA_CERTS, so the module's own guardedFetch is used as it is
    const tls = loopbackCert("localhost", "127.0.0.1");
    const seen = [];
    const endpoint = createTlsServer({ key: tls.key, cert: tls.cert }, (req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
            seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization, type: req.headers["content-type"], form: Object.fromEntries(new URLSearchParams(body)) });
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ access_token: "exchanged", token_type: "Bearer", expires_in: 300 }));
        });
    });
    await new Promise((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
    try {
        const auth = new URL("../../src/auth.js", import.meta.url).href;
        const url = `https://localhost:${endpoint.address().port}/token`;
        const script = `const { callerOf, exchangeTokenFor } = await import(${JSON.stringify(auth)});
const caller = callerOf("oauth", { token: "the-callers-own-token", clientId: "bot", scopes: ["pivotkit"], expiresAt: 1900000000, extra: { subject: "ana", issuer: "https://issuer.example" } });
const answer = await exchangeTokenFor(caller, { url: ${JSON.stringify(url)}, clientId: "pivotkit backend", clientSecret: "s3cret:x", audience: "platform-api", scope: "platform:read", allowPrivate: true });
console.log(JSON.stringify({ status: answer.status, body: new TextDecoder().decode(answer.body), subjectExpiresAt: answer.subjectExpiresAt, callerKeys: Object.keys(caller) }));`;
        const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, NODE_EXTRA_CA_CERTS: tls.certFile }, encoding: "utf8" });
        const out = JSON.parse(stdout);
        assert.equal(out.status, 200);
        assert.equal(JSON.parse(out.body).access_token, "exchanged");
        assert.equal(out.subjectExpiresAt, 1900000000);
        assert.deepEqual(out.callerKeys.sort(), ["client", "issuer", "profile", "scopes", "subject"], "no token on the caller");
        assert.equal(seen.length, 1);
        assert.equal(seen[0].method, "POST");
        assert.equal(seen[0].type, "application/x-www-form-urlencoded");
        assert.deepEqual(seen[0].form, { grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: "the-callers-own-token", subject_token_type: "urn:ietf:params:oauth:token-type:access_token", requested_token_type: "urn:ietf:params:oauth:token-type:access_token", audience: "platform-api", scope: "platform:read" });
        // client_secret_basic: both parts form-encoded first (RFC 6749 2.3.1)
        assert.equal(seen[0].authorization, `Basic ${Buffer.from("pivotkit%20backend:s3cret%3Ax").toString("base64")}`);
    } finally {
        await new Promise((resolve) => endpoint.close(resolve));
    }
});
