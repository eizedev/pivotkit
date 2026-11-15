// The operator's controls (#331): a person's groups mapped to policy profiles (fail closed when the
// token's group list is cut, missing or replaced by an overage marker), auth.defaultProfile, the
// sources' scopes in the OAuth metadata (never in the 401 challenge), the hint of an empty
// list_sources, the person in the log (audit.subject: a keyed hash or the claim's text), check-config's
// lines, and when the data is from in the html and xlsx files the REST service hands out.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { ConfigError, callerOf, checkConfig, createContext, groupRefusal, groupsOf, offeredScopes, profileOf, validateOptions } from "pivotkit-server";
import { listHint } from "../src/scopes.js";
import { BY_REGION, TOKEN, call, factsOf, restServer, workspace } from "./helpers.js";

const REST_RESOURCE = "https://pk.example.com/api/v1";
let issuer;
let issuerServer;
let key;

before(async () => {
    key = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    issuerServer = createServer((req, res) => {
        res.writeHead(req.url === "/.well-known/openid-configuration" || req.url === "/jwks" ? 200 : 404, { "content-type": "application/json" });
        res.end(req.url === "/jwks" ? JSON.stringify({ keys: [jwk] }) : JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks`, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, response_types_supported: ["code"] }));
    });
    await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${issuerServer.address().port}`;
});
after(() => new Promise((resolve) => issuerServer.close(resolve)));

/** A signed access token for the REST resource; the subject only when given. */
async function jwt(claims = {}, { sub = "ana@example.com", aud = REST_RESOURCE } = {}) {
    let token = new SignJWT({ scope: "pivotkit", client_id: "report-bot", ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime("5m");
    if (sub) {
        token = token.setSubject(sub);
    }
    return token.sign(key.privateKey);
}

async function ready(server) {
    for (let i = 0; i < 50; i++) {
        if ((await call(`${server.url}/readyz`)).status === 200) {
            return;
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("not ready");
}

// finance sees customers, staff sees regions only, restricted sees no value at all
const PROFILES = { finance: { default: "show" }, staff: { fields: { Region: "show" } }, restricted: { default: "summary" } };
const GROUP_PROFILES = [
    { group: "finance", profile: "finance" },
    { group: "staff", profile: "staff" }
];

/** The REST service with OAuth against the local issuer. */
async function oauthServer(auth = {}, more = {}, env = {}) {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "summary" } }, hr: { file: "data/sales.csv", scopes: ["pivotkit:hr"] } }, policy: { profiles: PROFILES }, auth: { mode: "oauth", issuer, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"], ...auth }, http: { publicUrl: "https://pk.example.com/" }, output: { dir: "out" }, baseDir: dir, ...more }, { env });
    await ready(server);
    return server;
}

/** The level describe_source gives each field, by name. */
async function levels(server, token) {
    const res = await call(`${server.api}/sources/sales`, { token });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return Object.fromEntries(res.data.fields.map((f) => [f.name, f.level]));
}

test("groups: a list of texts; a cut, long, missing, overage or text claim is unknown, never empty", () => {
    const auth = {};
    assert.deepEqual(groupsOf({ groups: ["finance", "staff"] }, auth), { groups: ["finance", "staff"] });
    assert.deepEqual(groupsOf({ groups: [] }, auth), { groups: [] }, "an empty list is known: no groups");
    assert.deepEqual(groupsOf({ groups: Array.from({ length: 100 }, (_, i) => `g${i}`) }, auth).groups?.length, 100);
    for (const [payload, why] of [
        [{ groups: Array.from({ length: 101 }, (_, i) => `g${i}`) }, "many"],
        [{ groups: ["finance", "x".repeat(257)] }, "long"],
        [{ _claim_names: { groups: "src1" }, _claim_sources: { src1: { endpoint: "https://graph.example/x" } } }, "overage"],
        [{ hasgroups: true }, "overage"],
        [{ hasgroups: "true" }, "overage"],
        [{ groups: ["finance"], hasgroups: true }, "overage"],
        [{}, "missing"],
        [{ groups: null }, "missing"],
        [{ groups: "finance staff" }, "text"],
        [{ groups: ["finance", 7] }, "shape"],
        [{ groups: { finance: true } }, "shape"]
    ]) {
        assert.deepEqual(groupsOf(payload, auth), { unknown: why }, JSON.stringify(payload).slice(0, 80));
    }
    // a text only with a separator; split exactly, empty parts dropped
    assert.deepEqual(groupsOf({ groups: "finance staff" }, { groupsSeparator: " " }), { groups: ["finance", "staff"] });
    assert.deepEqual(groupsOf({ roles: "a,,b" }, { groupsClaim: "roles", groupsSeparator: "," }), { groups: ["a", "b"] });
    // a group named with a space is one group in a list: never split into two
    assert.deepEqual(groupsOf({ groups: ["finance staff"] }, auth), { groups: ["finance staff"] });
    // the claim the operator named, not "groups"; hasgroups speaks of "groups" only
    assert.deepEqual(groupsOf({ groups: ["finance"] }, { groupsClaim: "roles" }), { unknown: "missing" });
    assert.deepEqual(groupsOf({ roles: ["finance"], hasgroups: true }, { groupsClaim: "roles" }), { groups: ["finance"] });
});

test("profiles: a token's, then the client's, then the first matching group, then scopes, then the default", () => {
    const auth = { clientProfiles: { "model-client": "restricted", "trusted-app": "finance" }, groupProfiles: GROUP_PROFILES, scopeProfiles: { "pivotkit:staff": "staff", "pivotkit:fin": "finance" }, defaultProfile: "restricted" };
    const person = (extra, { client = "report-bot", scopes = ["pivotkit"] } = {}) => ({ token: "t", clientId: client, scopes, expiresAt: 0, extra: { subject: "ana", issuer: "https://i", ...extra } });
    // a static token: its own profile, else the default
    assert.equal(profileOf(auth, { token: "", clientId: "bot", scopes: [], expiresAt: 0, extra: { profile: "staff" } }), "staff");
    assert.equal(profileOf(auth, { token: "", clientId: "bot", scopes: [], expiresAt: 0, extra: {} }), "restricted");
    // a restricted model client stays restricted, whatever the person's groups
    assert.equal(profileOf(auth, person({ groups: ["finance"] }, { client: "model-client" })), "restricted");
    // a trusted client's profile applies to everyone using it, a person without groups too
    assert.equal(profileOf(auth, person({ groups: [] }, { client: "trusted-app" })), "finance");
    // the first matching entry wins, in the configuration's order (not the token's)
    assert.equal(profileOf(auth, person({ groups: ["staff", "finance"] })), "finance");
    assert.equal(profileOf(auth, person({ groups: ["staff"] })), "staff");
    // exact and case-sensitive
    assert.equal(profileOf(auth, person({ groups: ["Finance", "finance "] })), "restricted");
    // no group matches: the scope's profile, else the default
    assert.equal(profileOf(auth, person({ groups: ["sales"] }, { scopes: ["pivotkit", "pivotkit:staff"] })), "staff");
    assert.equal(profileOf(auth, person({ groups: ["sales"] }, { scopes: ["pivotkit:staff", "pivotkit:fin"] })), "restricted", "scopes naming two profiles name none");
    // unknown groups skip the scope step: a cut list never reaches a wider profile
    assert.equal(profileOf(auth, person({ groupsUnknown: true }, { scopes: ["pivotkit:fin"] })), "restricted");
    // without groupProfiles, groups mean nothing: today's order
    assert.equal(profileOf({ scopeProfiles: auth.scopeProfiles }, person({ groupsUnknown: true }, { scopes: ["pivotkit:fin"] })), "finance");
    assert.equal(profileOf({}, person({ groups: ["finance"] })), null);
});

test("groups: unknown groups without a default profile are refused; a client's or token's profile, or the default, decides instead", () => {
    const unknown = { token: "t", clientId: "report-bot", scopes: ["pivotkit", "pivotkit:fin"], expiresAt: 0, extra: { subject: "ana", issuer: "https://i", groupsUnknown: true } };
    const auth = { groupProfiles: GROUP_PROFILES, scopeProfiles: { "pivotkit:fin": "finance" } };
    assert.match(String(groupRefusal(auth, unknown)), /your sign-in does not carry your groups; ask the operator/);
    assert.equal(groupRefusal({ ...auth, defaultProfile: "restricted" }, unknown), null);
    assert.equal(groupRefusal({ ...auth, clientProfiles: { "report-bot": "staff" } }, unknown), null);
    assert.equal(groupRefusal({ scopeProfiles: auth.scopeProfiles }, unknown), null, "without groupProfiles nothing is refused");
    assert.equal(groupRefusal(auth, { ...unknown, extra: { ...unknown.extra, groupsUnknown: false, groups: [] } }), null);
    // a host with a gate of its own that makes the caller anyway is refused: no profile would be the
    // sources' own policy, which may show more than any profile
    assert.throws(() => callerOf("oauth", unknown, auth), { name: "OperationError", code: "NOT_ALLOWED", message: "your sign-in does not carry your groups; ask the operator" });
    // a known caller carries its groups for a code source, and only when it has some
    const known = callerOf("oauth", { ...unknown, extra: { ...unknown.extra, groupsUnknown: false, groups: ["staff"] } }, auth);
    assert.deepEqual(known.groups, ["staff"]);
    assert.equal(known.profile, "staff");
    assert.ok(!("groups" in callerOf("oauth", { ...unknown, extra: { subject: "ana", issuer: "https://i", groups: [] } }, {})));
});

test("groups over REST: finance, staff and the default profile; a cut list is 403 without a challenge and not counted as a refused token", async () => {
    const server = await oauthServer({ groupProfiles: GROUP_PROFILES, defaultProfile: "restricted" }, { rest: { rateLimit: { failedAuthPerMinute: 2 } } });
    try {
        assert.equal((await levels(server, await jwt({ groups: ["staff", "finance"] }))).Customer, "show");
        const staff = await levels(server, await jwt({ groups: ["staff"] }));
        assert.equal(staff.Region, "show");
        assert.equal(staff.Customer, "summary");
        assert.equal((await levels(server, await jwt({ groups: ["sales"] }))).Region, "summary", "no group matches: the default profile");
        assert.equal((await levels(server, await jwt({ groups: Array.from({ length: 101 }, (_, i) => (i === 0 ? "finance" : `g${i}`)) }))).Customer, "summary", "a cut list: the default profile, never finance");
    } finally {
        await server.close();
    }
    const strict = await oauthServer({ groupProfiles: GROUP_PROFILES }, { rest: { rateLimit: { failedAuthPerMinute: 2 } } });
    try {
        for (let i = 0; i < 4; i++) {
            const refused = await call(`${strict.api}/sources`, { token: await jwt({ _claim_names: { groups: "src1" } }) });
            assert.equal(refused.status, 403, JSON.stringify(refused.data));
            assert.equal(refused.data.code, "NOT_ALLOWED");
            assert.equal(refused.data.detail, "your sign-in does not carry your groups; ask the operator");
            assert.equal(refused.headers.get("www-authenticate"), null, "more scopes would not help: no challenge");
        }
        // four refusals over a limit of two refused tokens: not counted as bad tokens, so a bad token
        // from this address still gets 401, not 429
        const bad = await call(`${strict.api}/sources`, { token: "not-a-valid-token-but-long-enough-for-the-syntax" });
        assert.equal(bad.status, 401, JSON.stringify(bad.data));
        assert.equal((await call(`${strict.api}/sources`, { token: await jwt({ groups: ["finance"] }) })).status, 200);
        // the refused line names the client (the app to fix), never the person
        assert.ok(strict.log.some((l) => l.event === "refused" && l.status === 403 && l.client === "report-bot"), JSON.stringify(strict.log));
        assert.ok(!JSON.stringify(strict.log).includes("ana@example.com"));
    } finally {
        await strict.close();
    }
});

test("groups: with --log debug one line per sign-in gives how many groups and the profile, never their names", async () => {
    const server = await oauthServer({ groupProfiles: GROUP_PROFILES, defaultProfile: "restricted" }, { log: "debug" });
    try {
        await levels(server, await jwt({ groups: ["staff", "secret-group-name"] }));
        await levels(server, await jwt({ hasgroups: true }));
        const lines = server.log.filter((l) => l.event === "debug" && l.message === "oauth: signed in");
        assert.deepEqual(
            lines.map((l) => [l.groups, l.profile]),
            [
                [2, "staff"],
                ["unknown (the token says the groups are elsewhere (an overage marker))", "restricted"]
            ]
        );
        assert.ok(!JSON.stringify(server.log).includes("secret-group-name"));
    } finally {
        await server.close();
    }
});

test("scopes: the metadata offers the required scopes and the sources', never a scopeProfiles scope; the challenge asks for the required ones only", async () => {
    const sources = { sales: { file: "s.csv", scopes: ["pivotkit:sales"] }, vms: { file: "v.csv", scopes: ["pivotkit:vms", "pivotkit:sales"] }, hr: { file: "h.csv", scopes: ["pivotkit:admin"] } };
    const auth = { mode: "oauth", requiredScopes: ["pivotkit"], scopeProfiles: { "pivotkit:admin": "finance" }, offerSourceScopes: true };
    const options = { sources, files: { allowDirs: ["d"], scopes: ["pivotkit:files"] }, auth };
    // off by default: the required scopes only
    assert.deepEqual(offeredScopes({ ...options, auth: { ...auth, offerSourceScopes: undefined } }, "mcp"), ["pivotkit"]);
    assert.deepEqual(offeredScopes(options, "mcp"), ["pivotkit", "pivotkit:sales", "pivotkit:vms", "pivotkit:files"]);
    // REST reads no files by path: files.scopes is not offered there
    assert.deepEqual(offeredScopes({ ...options, rest: { requiredScopes: ["pivotkit:rest"] } }, "rest"), ["pivotkit:rest", "pivotkit:sales", "pivotkit:vms"]);
    assert.deepEqual(offeredScopes({ ...options, auth: { ...auth, offerSourceScopes: false } }, "mcp"), ["pivotkit"]);
    // the operator's own list is taken as it is
    assert.deepEqual(offeredScopes({ ...options, auth: { ...auth, scopesSupported: ["pivotkit", "x"] } }, "mcp"), ["pivotkit", "x"]);
    // no required scope, but sources with scopes: offered (an empty required list names nothing)
    assert.deepEqual(offeredScopes({ sources, auth: { mode: "oauth", offerSourceScopes: true } }, "rest"), ["pivotkit:sales", "pivotkit:vms", "pivotkit:admin"]);
    assert.equal(offeredScopes({ sources, auth: { mode: "oauth" } }, "rest"), null);

    const plain = await oauthServer();
    try {
        const prm = await call(`${plain.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.deepEqual(prm.data.scopes_supported, ["pivotkit"], "nothing but the required scopes unless switched on");
    } finally {
        await plain.close();
    }
    const server = await oauthServer({ offerSourceScopes: true });
    try {
        const prm = await call(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.deepEqual(prm.data.scopes_supported, ["pivotkit", "pivotkit:hr"]);
        const refused = await call(`${server.api}/sources`);
        assert.equal(refused.status, 401);
        assert.match(refused.headers.get("www-authenticate"), /scope="pivotkit"/);
        assert.doesNotMatch(refused.headers.get("www-authenticate"), /pivotkit:hr/);
    } finally {
        await server.close();
    }
});

test("list_sources: an empty list for a sign-in without the sources' scopes says which scopes the server offers", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", scopes: ["pivotkit:sales"] }, vms: { file: "data/sales.csv", scopes: ["pivotkit:vms"] }, admin: { file: "data/sales.csv", scopes: ["pivotkit:admin"] } }, policy: { profiles: PROFILES }, auth: { mode: "oauth", issuer, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"], scopeProfiles: { "pivotkit:admin": "finance" }, offerSourceScopes: true }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir });
    try {
        await ready(server);
        const empty = await call(`${server.api}/sources`, { token: await jwt() });
        assert.equal(empty.status, 200);
        assert.deepEqual(empty.data.sources, []);
        // a scopeProfiles scope is never named: it is not in the metadata either
        assert.equal(empty.data.hint, "No source is available with your current sign-in. This server offers the scopes: pivotkit:sales pivotkit:vms. Sign in with one of them, or ask the operator.");
        const rest = await call(`${server.api}/sources`, { token: await jwt() });
        assert.equal(rest.data.hint, empty.data.hint);
        const some = await call(`${server.api}/sources`, { token: await jwt({ scope: "pivotkit pivotkit:sales" }) });
        assert.deepEqual(
            some.data.sources.map((s) => s.id),
            ["sales"]
        );
        assert.equal(some.data.hint, undefined, "a list that is not empty has no hint");
    } finally {
        await server.close();
    }
    // a static token's caller: no metadata, so no scope is named
    const context = { options: { sources: { sales: { scopes: ["a"] } }, auth: { mode: "token" } } };
    assert.equal(listHint(context, { scopes: new Set(["b"]), client: "bot" }, []), "No source is available with your current sign-in. Ask the operator for a token with the scopes of a source.");
    assert.equal(listHint(context, { scopes: null, client: "bot" }, []), null);
    assert.equal(listHint({ options: { sources: {}, auth: { mode: "oauth" } } }, { scopes: new Set(), client: "x" }, []), null, "no source at all: nothing withheld");
    // nothing offered (the default): the scopes are not public, so the hint names none
    for (const auth of [{ mode: "oauth" }, { mode: "oauth", offerSourceScopes: false }]) {
        assert.equal(listHint({ options: { sources: { s: { scopes: ["a"] } }, auth } }, { scopes: new Set(), client: "x" }, []), "No source is available with your current sign-in. Ask the operator which scopes to sign in with.");
    }
});

test("audit: hash logs a keyed hash of issuer and subject on request and download lines; refused requests and other people's claims never", async () => {
    const auditKey = "an-audit-key-that-stays-the-same-across-restarts";
    const hashed = await oauthServer({}, { audit: { subject: "hash", key: { env: "AUDIT_KEY" } }, policy: { profiles: PROFILES, results: true } }, { AUDIT_KEY: auditKey });
    try {
        const token = await jwt({ groups: ["finance"], email: "ana.private@example.com" });
        assert.equal((await call(`${hashed.api}/sources/sales`, { token })).status, 200);
        assert.equal((await call(`${hashed.api}/views/render/file`, { token, body: { source: "sales", view: BY_REGION, format: "csv" } })).status, 200);
        assert.equal((await call(`${hashed.api}/sources`, { token: "not-a-valid-token-but-long-enough-for-the-syntax" })).status, 401);
        const request = hashed.log.find((l) => l.event === "request");
        const download = hashed.log.find((l) => l.event === "download");
        const iss = createHmac("sha256", auditKey).update(JSON.stringify([issuer, "ana@example.com"])).digest("hex").slice(0, 16);
        assert.equal(request?.subject, iss, JSON.stringify(hashed.log));
        assert.equal(download?.subject, iss);
        const withoutIssuer = createHmac("sha256", auditKey).update(JSON.stringify([null, "ana@example.com"])).digest("hex").slice(0, 16);
        assert.notEqual(iss, withoutIssuer, "the issuer is part of what is hashed");
        assert.match(iss, /^[0-9a-f]{16}$/);
        const text = JSON.stringify(hashed.log);
        for (const secret of ["ana@example.com", "ana.private@example.com", "finance"]) {
            assert.ok(!text.includes(secret), secret);
        }
        assert.ok(hashed.log.filter((l) => l.event === "refused").every((l) => !("subject" in l)));
    } finally {
        await hashed.close();
    }
    // the same key after a restart: the same person, the same hash
    const again = await oauthServer({}, { audit: { subject: "hash", key: { env: "AUDIT_KEY" } } }, { AUDIT_KEY: auditKey });
    try {
        await levels(again, await jwt());
        assert.equal(again.log.find((l) => l.event === "request")?.subject, createHmac("sha256", auditKey).update(JSON.stringify([issuer, "ana@example.com"])).digest("hex").slice(0, 16));
    } finally {
        await again.close();
    }
});

test("audit: plain logs the subject without control characters, at most 128 characters; off and static tokens log no person", async () => {
    const plain = await oauthServer({}, { audit: { subject: "plain" } });
    try {
        await levels(plain, await jwt({}, { sub: `ana\u202e\u2066\u0007\n\u2028\u2029\u0085${"x".repeat(200)}` }));
        const line = plain.log.find((l) => l.event === "request");
        assert.equal(line?.subject, `ana${"x".repeat(125)}`);
        // joiners belong to some names (Persian, Indic scripts, emoji sequences): kept
        await levels(plain, await jwt({}, { sub: "\u0645\u06cc\u200c\u0631\u0627 \u0d15\u0d4d\u200d" }));
        assert.equal(plain.log.filter((l) => l.event === "request").at(-1)?.subject, "\u0645\u06cc\u200c\u0631\u0627 \u0d15\u0d4d\u200d");
    } finally {
        await plain.close();
    }
    const off = await oauthServer();
    try {
        await levels(off, await jwt());
        assert.ok(off.log.filter((l) => l.event === "request").every((l) => !("subject" in l)));
    } finally {
        await off.close();
    }
    const dir = workspace();
    const token = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, audit: { subject: "plain" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        await call(`${token.api}/sources`, { token: TOKEN });
        assert.ok(token.log.filter((l) => l.event === "request").every((l) => !("subject" in l)));
    } finally {
        await token.close();
    }
});

test("audit: hash without a key warns that hashes change on restart; a key that cannot be read stops the start", async () => {
    const warned = await oauthServer({}, { audit: { subject: "hash" } });
    try {
        await levels(warned, await jwt());
        assert.ok(warned.log.some((l) => l.event === "warning" && /random key/.test(l.message)));
        assert.match(warned.log.find((l) => l.event === "request")?.subject ?? "", /^[0-9a-f]{16}$/);
    } finally {
        await warned.close();
    }
    const dir = workspace();
    await assert.rejects(
        restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "oauth", issuer, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true }, http: { publicUrl: "https://pk.example.com/" }, audit: { subject: "hash", key: { file: "missing.key" } }, baseDir: dir }),
        (e) => e instanceof ConfigError && /audit\.key: the file missing\.key cannot be read \(no such file\)/.test(e.message)
    );
    // a key shorter than 16 characters is refused at start and in check-config
    const short = { sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "oauth", issuer, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true }, http: { publicUrl: "https://pk.example.com/" }, audit: { subject: "hash", key: { env: "AUDIT_KEY" } }, baseDir: dir };
    await assert.rejects(restServer(short, { env: { AUDIT_KEY: "fifteen-chars-x" } }), (e) => e instanceof ConfigError && /audit\.key: at least 16 characters/.test(e.message));
    const checked = await checkConfig(short, { http: true, env: { AUDIT_KEY: "fifteen-chars-x" }, name: "pivotkit-server", rest: true });
    assert.match(checked.text, /PROBLEM: audit\.key: at least 16 characters/);
    const server = await restServer(short, { env: { AUDIT_KEY: "sixteen-chars-xx" } });
    await server.close();
});

test("options: groupProfiles and defaultProfile name profiles that exist; audit.key goes with hash only", () => {
    const base = { policy: { profiles: PROFILES }, auth: { mode: "oauth", issuer: "https://i.example", resource: "https://r.example/mcp" } };
    validateOptions({ ...base, auth: { ...base.auth, groupProfiles: GROUP_PROFILES, defaultProfile: "restricted", groupsClaim: "roles", groupsSeparator: ",", offerSourceScopes: false }, audit: { subject: "hash", key: { env: "K" } } });
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, groupProfiles: [{ group: "finance", profile: "financ" }] } }), /auth\.groupProfiles\[0\]\.profile: no profile "financ" in policy\.profiles; did you mean "finance"\?/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, groupProfiles: [{ group: "finance" }] } }), /auth\.groupProfiles\[0\]: needs a profile/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, groupProfiles: [{ group: "", profile: "staff" }] } }), /auth\.groupProfiles\[0\]\.group/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, defaultProfile: "nobody" } }), /auth\.defaultProfile: no profile "nobody"/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, groupsSeparator: "" } }), /auth\.groupsSeparator/);
    assert.throws(() => validateOptions({ ...base, audit: { subject: "plain", key: { env: "K" } } }), /audit\.key: only audit\.subject "hash"/);
    assert.throws(() => validateOptions({ ...base, audit: { subject: "hashed" } }), /audit\.subject: must be one of off, hash, plain; did you mean hash\?/);
    assert.throws(() => validateOptions({ ...base, audit: { subject: "hash", key: "the-key-itself" } }), /audit\.key: must be a reference to a secret/);
    assert.throws(() => validateOptions({ ...base, auth: { ...base.auth, groupProfile: [] } }), /did you mean "groupProfiles"/);
});

test("check-config: groups, the default profile, the scopes offered, unreachable sources, wider first entries and the audit", async () => {
    const dir = workspace();
    writeFileSync(join(dir, "audit.key"), "an-audit-key-of-enough-length\n", { mode: 0o644 });
    const options = {
        sources: { sales: { file: "data/sales.csv", scopes: ["pivotkit:sales"] }, hr: { file: "data/sales.csv", scopes: ["pivotkit:hr"] } },
        policy: { profiles: PROFILES },
        auth: { mode: "oauth", issuer: "https://login.example.com/", resource: "https://pk.example.com/mcp", requiredScopes: ["pivotkit"], groupProfiles: GROUP_PROFILES, defaultProfile: "restricted", scopeProfiles: { "pivotkit:hr": "finance" }, offerSourceScopes: true },
        audit: { subject: "hash", key: { file: "audit.key" } },
        baseDir: dir
    };
    const result = await checkConfig(options, { http: true, name: "pivotkit-server", rest: true });
    const lines = factsOf(result.text).split("\n");
    // under Auth: how a person gets a profile, one fact per line, ASCII arrows; the default subject claim is not said
    const auth = lines.indexOf("Auth: oauth");
    assert.ok(auth > 0, result.text);
    const own = lines.slice(auth, lines.indexOf("", auth));
    assert.ok(own.includes("  profile by group (claim groups; first match wins, a client's profile comes first):"), result.text);
    assert.ok(own.includes("    finance -> finance, staff -> staff"), result.text);
    assert.ok(own.includes("  otherwise: profile restricted"), result.text);
    assert.ok(own.includes("  scopes offered: pivotkit pivotkit:sales (define these at your provider; it may refuse a sign-in that asks for one it does not know)"), result.text);
    assert.ok(own.includes("  WARNING: the source hr needs the scope pivotkit:hr, which the server does not offer (auth.scopeProfiles names it, and a client must not choose its own profile): a client learns of it only from you"), result.text);
    assert.doesNotMatch(factsOf(result.text), /Sign-in:|→|subject from claim/);
    // the wider profile first is the intended order: silent
    assert.doesNotMatch(factsOf(result.text), /shows fields that/);
    assert.ok(lines.includes("Audit: hash"), result.text);
    assert.ok(lines.includes("  the person is logged as a keyed hash of issuer and sub"), result.text);
    assert.ok(lines.includes(`  key from the file audit.key (${join(dir, "audit.key")})`), result.text);
    assert.ok(lines.some((l) => /the audit key's file audit\.key can be read by other users/.test(l)), result.text);
    // offering the sources' scopes is opt-in: no change for an existing installation
    // (the block may hold other features' lines: none of this section's)
    assert.doesNotMatch(result.text, /New in this version[\s\S]*(scope|group|audit|profile)/i);
    assert.equal(result.problems, 0, result.text);
    // a subject claim other than sub is said
    assert.match((await checkConfig({ ...options, auth: { ...options.auth, subjectClaim: "oid" } }, { http: true, name: "pivotkit-server" })).text, /\n {2}a person is told apart by the claim oid\n/);

    // a wider profile after a narrower one: a warning; the default (scopes not offered): every source scope is unreachable
    const quiet = await checkConfig({ ...options, auth: { ...options.auth, groupProfiles: [...GROUP_PROFILES].reverse(), offerSourceScopes: undefined, scopeProfiles: undefined, defaultProfile: undefined }, audit: { subject: "hash", key: { env: "NOT_SET" } } }, { http: true, name: "pivotkit-server", rest: true });
    const said = factsOf(quiet.text);
    assert.match(said, /\n {2}WARNING: groupProfiles entry 2 \(finance\) shows fields that entry 1 \(staff\) holds back: people in both groups get entry 1, since the first match wins; if that is not intended, put the wider profile first\n/);
    assert.match(said, /WARNING: the source sales needs the scope pivotkit:sales, which the server does not offer \(auth\.offerSourceScopes is not on\)/);
    assert.match(said, /\n {2}a person whose token does not carry the groups is refused: "your sign-in does not carry your groups; ask the operator"\n/);
    // groupProfiles without defaultProfile: a person in no listed group is refused (not given the
    // sources' own policy, which may show more than any profile), and a warning
    assert.match(said, /\n {2}a person in none of these groups( whose client or scopes name no profile)? is refused: "your sign-in gives you no access to this server's data; ask the operator"\n/);
    assert.match(said, /WARNING: auth\.groupProfiles without auth\.defaultProfile: a person in none of the groups is refused \(403\); set auth\.defaultProfile to a narrow profile to let them in/);
    assert.match(said, /PROBLEM: audit\.key: \$NOT_SET is not set -> the server does not start/);
    assert.equal(quiet.problems, 1);
    assert.equal(quiet.stops, 1);
    assert.doesNotMatch(quiet.text, /New in this version[\s\S]*(scope|group|audit|profile)/i);

    // a static token: the scope no token holds, groups that take no effect, a person never named
    const token = await checkConfig({ sources: options.sources, policy: options.policy, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT", scopes: ["pivotkit:sales"] }], groupProfiles: GROUP_PROFILES }, audit: { subject: "plain" }, baseDir: dir }, { http: false, env: { BOT: "x".repeat(40) }, name: "pivotkit-server" });
    const tokenSaid = factsOf(token.text);
    assert.match(tokenSaid, /WARNING: the source hr needs the scope pivotkit:hr, which no static token holds: no caller can use it/);
    assert.match(tokenSaid, /WARNING: auth\.groupProfiles takes effect with auth\.mode oauth only/);
    assert.match(tokenSaid, /WARNING: audit names a person only with auth\.mode oauth/);
    // the token mode's warning stands in the Auth section, after its facts (warnings come last in a section)
    const plainToken = await checkConfig({ sources: options.sources, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT", scopes: ["pivotkit:sales"] }] }, baseDir: dir }, { http: false, env: { BOT: "x".repeat(40) }, name: "pivotkit-server" });
    const at = factsOf(plainToken.text).split("\n");
    const warning = at.findIndex((l) => /no static token holds/.test(l));
    assert.deepEqual(at.slice(warning - 2, warning), ["Auth: token", "  token bot from $BOT: scopes pivotkit:sales"], plainToken.text);
});

test("dataAsOf in files: the html report prints it, the xlsx carries it as the document property DataAsOf", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, policy: { results: true }, auth: { mode: "token" }, output: { dir: "out" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const html = await call(`${server.api}/views/render/file`, { token: TOKEN, body: { source: "sales", view: BY_REGION, format: "html" } });
        assert.equal(html.status, 200);
        const text = new TextDecoder().decode(html.data);
        assert.match(text, /<dt>Data as of<\/dt><dd>[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M UTC<\/dd>/);
        const xlsx = await call(`${server.api}/views/render/file`, { token: TOKEN, body: { source: "sales", view: BY_REGION, format: "xlsx" } });
        const files = unzipSync(xlsx.data);
        assert.match(strFromU8(files["docProps/custom.xml"]), /<property fmtid="\{D5CDD505-2E9C-101B-9397-08002B2CF9AE\}" pid="2" name="DataAsOf"><vt:filetime>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/vt:filetime><\/property>/);
    } finally {
        await server.close();
    }
});

test("createContext takes the operator's options", async () => {
    const context = await createContext({ policy: { profiles: PROFILES }, auth: { mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp", groupProfiles: GROUP_PROFILES, defaultProfile: "restricted", offerSourceScopes: false }, audit: { subject: "plain" } });
    await context.close();
});
