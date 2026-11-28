// The browser path (records 0019 and 0020): a person's token exchanged at POST
// /api/v1/sources/records/token for a short-lived browser token, which reads the rows of that one
// source with those params only, from a page on rest.browser.origins or the server's own origin.
// Every other route, MCP and /openapi.json refuse the token as unknown; the log names its ID only.
// Persons sign in with an external issuer's token (record 0014), as in records.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { callerOf, checkConfig, validateOptions } from "pivotkit-server";
import { prepareHttpServe } from "pivotkit-server/internal";
import { REST_ROUTES } from "../src/rest/routes.js";
import { BROWSER_TOKEN, createBrowserTokens } from "../src/browser-tokens.js";
import { KEY_READ_MS } from "../src/key-source.js";
import { ACCESS_PARAM } from "../src/link-access.js";
import { TOKEN, call, factsOf, restServer, runBin, untilReady, workspace } from "./helpers.js";
import { localIssuer } from "./auth/local-issuer.js";
import { until } from "../../../tests/until.js";

const CSV = ["Region,Customer,Sales", "North,HIDDENMARKA,10", "South,HIDDENMARKB,20", "West,HIDDENMARKC,7"].join("\n") + "\n";

const PSU = Object.freeze({ issuer: "psu", typ: "psu+jwt", kid: "psu-2026-11" });

/** A key for rest.browser.key: 32 bytes and more. */
const BROWSER_KEY = "a-browser-key-of-the-test-0123456789abcdef";

/** staff reads the rows of sales and team; plain reads none. */
const PROFILES = Object.freeze({
    staff: { records: ["sales", "team"], fields: { Region: "show", Sales: "show" } },
    plain: { fields: { Region: "show", Sales: "show" } }
});

/** The page that may read rows with a browser token. */
const PAGE = "https://intranet.example.com";

/**
 * A server with the sources sales (a file) and team (a code source with a param), the profiles, a
 * static token (ops) and the external issuer; `rest`, `auth` and `top` are laid over the options.
 * @param {{ rest?: Record<string, unknown>, auth?: Record<string, unknown>, top?: Record<string, unknown>, env?: Record<string, string>, enable?: string[] }} [extra]
 */
async function serverOf(extra = {}) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const dir = workspace({ "sales.csv": CSV });
    mkdirSync(join(dir, "keys"));
    writeFileSync(join(dir, "keys", "psu.pub"), publicKey.export({ type: "spki", format: "pem" }).toString());
    const options = {
        sources: {
            sales: { file: "data/sales.csv", link: `${PAGE}/report`, policy: { fields: { Customer: "hide" } } },
            team: { load: async (params) => [{ Region: String(params.team), Sales: 1 }], params: { team: { type: "string" } }, policy: { default: "show" } }
        },
        policy: { profiles: PROFILES },
        auth: { mode: "token", tokens: [{ name: "ops", env: "OPS", profile: "staff" }], externalIssuers: [{ issuer: PSU.issuer, typ: PSU.typ, scopes: ["pivotkit:read"], profiles: Object.keys(PROFILES), profile: "staff", keys: [{ kid: PSU.kid, publicKey: { file: "keys/psu.pub" } }] }], ...(extra.auth ?? {}) },
        rest: { browser: { origins: [PAGE] }, ...(extra.rest ?? {}) },
        ...(extra.top ?? {}),
        baseDir: dir
    };
    const env = { OPS: TOKEN, ...(extra.env ?? {}) };
    const server = await restServer(options, { env, ...(extra.enable ? { enable: extra.enable } : {}) });
    /** A person's token of the external issuer, `seconds` long. */
    const person = ({ sub = "alice@example.com", profile = "staff", seconds = 600 } = {}) => {
        const now = Math.floor(Date.now() / 1000);
        return new SignJWT({ jti: `psu-${Math.random().toString(16).slice(2, 10)}`, profile, sub }).setProtectedHeader({ alg: "EdDSA", kid: PSU.kid, typ: PSU.typ }).setIssuer(PSU.issuer).setIssuedAt(now).setExpirationTime(now + seconds).sign(privateKey);
    };
    return { server, person, env, options };
}

/** The exchange: a browser token for a person's token. */
const exchange = (server, token, body, headers = {}) => call(`${server.api}/sources/records/token`, { body, token, headers });

/** A rows request. */
const rows = (server, token, body, headers = {}) => call(`${server.api}/sources/records`, { body, token, headers });

test("a person's token becomes a browser token that reads the rows of its source, and the log names only its ID", async () => {
    const { server, person } = await serverOf();
    try {
        const got = await exchange(server, await person(), { source: "sales" });
        assert.equal(got.status, 200, JSON.stringify(got.data));
        assert.deepEqual(Object.keys(got.data).filter((k) => k !== "requestId").sort(), ["expiresAt", "expiresIn", "source", "token", "tokenType"]);
        assert.equal(got.data.tokenType, "Bearer");
        assert.equal(got.data.source, "sales");
        assert.ok(got.data.expiresIn > 240 && got.data.expiresIn <= 300, String(got.data.expiresIn));
        assert.match(got.data.expiresAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
        // an encrypted JWT: nothing of the person is readable in it
        const parts = got.data.token.split(".");
        assert.equal(parts.length, 5);
        assert.equal(JSON.parse(Buffer.from(parts[0], "base64url").toString()).typ, BROWSER_TOKEN.typ);
        assert.doesNotMatch(Buffer.from(parts[3], "base64url").toString("latin1"), /alice/);

        const read = await rows(server, got.data.token, { source: "sales" });
        assert.equal(read.status, 200, JSON.stringify(read.data));
        assert.deepEqual(read.data.columns, ["Region", "Sales"]);
        assert.equal(read.data.rowCount, 3);
        assert.doesNotMatch(JSON.stringify(read.data), /HIDDENMARK/);

        const lines = server.log;
        assert.ok(!JSON.stringify(lines).includes(got.data.token), "the token's value is in no log line");
        const issued = lines.find((l) => l.route === "POST /sources/records/token" && l.status === 200);
        assert.match(String(issued?.token), /^[0-9a-f]{16}$/, JSON.stringify(issued));
        const used = await until(() => lines.find((l) => l.event === "records"));
        assert.equal(used.token, issued?.token, "the rows line names the same ID");
    } finally {
        await server.close();
    }
});

test("a browser token reads only its own source and params", async () => {
    const { server, person } = await serverOf();
    try {
        const north = (await exchange(server, await person(), { source: "team", params: { team: "north" } })).data.token;
        const ok = await rows(server, north, { source: "team" });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.deepEqual(ok.data.data[0], ["north"], "the token's params where the request names none");
        assert.equal((await rows(server, north, { source: "team", params: { team: "north" } })).status, 200);
        const other = await rows(server, north, { source: "team", params: { team: "south" } });
        assert.equal(other.status, 403);
        assert.equal(other.data.code, "NOT_ALLOWED");
        const elsewhere = await rows(server, north, { source: "sales" });
        assert.equal(elsewhere.status, 403);
        assert.equal(elsewhere.data.code, "NOT_ALLOWED");
    } finally {
        await server.close();
    }
});

test("only a person who may read the source's rows gets a browser token, and a browser token makes none", async () => {
    const { server, person } = await serverOf();
    try {
        const ops = await exchange(server, TOKEN, { source: "sales" });
        assert.equal(ops.status, 403, "a static token is no person");
        assert.equal(ops.data.code, "NOT_ALLOWED");
        const plain = await exchange(server, await person({ profile: "plain" }), { source: "sales" });
        assert.equal(plain.status, 403);
        assert.equal(plain.data.code, "NOT_ALLOWED");
        const missing = await exchange(server, await person(), { source: "nothing-here" });
        assert.deepEqual([missing.status, missing.data.code, missing.data.detail], [plain.status, plain.data.code, missing.data.detail], "a missing source answers as one the caller may not read");
        const token = (await exchange(server, await person(), { source: "sales" })).data.token;
        const again = await exchange(server, token, { source: "sales" });
        assert.equal(again.status, 401);
        assert.equal(again.data.code, "INVALID_TOKEN");
        const wrong = await exchange(server, await person(), { source: "sales", extra: 1 });
        assert.equal(wrong.status, 400);
    } finally {
        await server.close();
    }
});

test("every route but the rows route, /openapi.json and MCP refuse a browser token as unknown", async () => {
    const { server, person } = await serverOf({ enable: ["rest", "mcp"] });
    try {
        const token = (await exchange(server, await person(), { source: "sales" })).data.token;
        const others = REST_ROUTES.filter((r) => r.answer !== "records");
        assert.ok(others.some((r) => r.answer === "browserToken"), "the exchange route is walked too");
        for (const route of others) {
            const path = `${server.api}${route.path.replace("{id}", "sales")}`;
            const got = await call(path, { method: route.method, token, ...(route.method === "POST" ? { body: { source: "sales" } } : {}) });
            assert.equal(got.status, 401, `${route.method} ${route.path}: ${JSON.stringify(got.data)}`);
            assert.equal(got.data.code, "INVALID_TOKEN", `${route.method} ${route.path}`);
        }
        assert.equal((await call(`${server.url}/openapi.json`, { token })).status, 401);
        const mcp = await fetch(`${server.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
        assert.equal(mcp.status, 401);
        // never in the address, not even on the rows route
        const inAddress = await call(`${server.api}/sources/records?access_token=${encodeURIComponent(token)}`, { body: { source: "sales" } });
        assert.equal(inAddress.status, 401);
        assert.ok(!JSON.stringify(server.log).includes(token));
    } finally {
        await server.close();
    }
});

test("CORS: a page of rest.browser.origins and the server's own page read rows with a browser token only", async () => {
    const { server, person } = await serverOf();
    try {
        const token = (await exchange(server, await person(), { source: "sales" })).data.token;
        const preflight = await fetch(`${server.api}/sources/records`, { method: "OPTIONS", headers: { origin: PAGE, "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type" } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get("access-control-allow-origin"), PAGE);
        const ok = await rows(server, token, { source: "sales" }, { origin: PAGE });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal(ok.headers.get("access-control-allow-origin"), PAGE);
        const own = await rows(server, token, { source: "sales" }, { origin: server.url });
        assert.equal(own.status, 200, "the server's own origin");

        // a person's own token from that page: the browser path takes browser tokens only
        const passedOn = await rows(server, await person(), { source: "sales" }, { origin: PAGE });
        assert.equal(passedOn.status, 403);
        assert.equal(passedOn.data.code, "FORBIDDEN_ORIGIN");
        // every other route refuses the page, the exchange route too
        assert.equal((await exchange(server, await person(), { source: "sales" }, { origin: PAGE })).status, 403);
        assert.equal((await call(`${server.api}/sources`, { token, headers: { origin: PAGE } })).status, 403);
        const otherPreflight = await fetch(`${server.api}/sources`, { method: "OPTIONS", headers: { origin: PAGE, "access-control-request-method": "GET" } });
        assert.equal(otherPreflight.status, 403);
        // an origin nobody listed
        assert.equal((await rows(server, token, { source: "sales" }, { origin: "https://elsewhere.example.com" })).status, 403);
        // a refused token's answer is readable by the page, so it can get a new one
        const bad = await rows(server, `${token.slice(0, -4)}AAAA`, { source: "sales" }, { origin: PAGE });
        assert.equal(bad.status, 401);
        assert.equal(bad.headers.get("access-control-allow-origin"), PAGE);
        assert.equal(bad.data.expired, undefined);
    } finally {
        await server.close();
    }
});

test("without rest.browser.origins no other page reads rows", async () => {
    const { server, person } = await serverOf({ rest: { browser: {} } });
    try {
        const token = (await exchange(server, await person(), { source: "sales" })).data.token;
        assert.equal((await rows(server, token, { source: "sales" }, { origin: PAGE })).status, 403);
        assert.equal((await rows(server, token, { source: "sales" })).status, 200, "a request without an Origin (a backend)");
    } finally {
        await server.close();
    }
});

test("a browser token ends with the person's own token, and its refusal says expired", async () => {
    // no grace past a token's end (auth.clockTolerance, 30 seconds by default), so the test waits seconds
    const { server, person } = await serverOf({ auth: { clockTolerance: 0 } });
    try {
        const got = await exchange(server, await person({ seconds: 2 }), { source: "sales" });
        assert.equal(got.status, 200, JSON.stringify(got.data));
        assert.ok(got.data.expiresIn <= 2, `never past the person's own token: ${got.data.expiresIn}`);
        const late = await until(async () => {
            const answer = await rows(server, got.data.token, { source: "sales" }, { origin: PAGE });
            return answer.status === 401 ? answer : null;
        }, { tries: 100, every: 100, message: "the browser token outlived the person's token" });
        assert.equal(late.data.expired, true, JSON.stringify(late.data));
        assert.equal(late.headers.get("access-control-allow-origin"), PAGE, "the page reads why, and renews");
    } finally {
        await server.close();
    }
});

test("a new rest.browser.key ends every browser token within a second", async () => {
    const { server, person, env } = await serverOf({ rest: { browser: { origins: [PAGE], key: { env: "BROWSER_KEY" } } }, env: { BROWSER_KEY } });
    try {
        const token = (await exchange(server, await person(), { source: "sales" })).data.token;
        assert.equal((await rows(server, token, { source: "sales" })).status, 200);
        env.BROWSER_KEY = `${BROWSER_KEY}-new`;
        const started = Date.now();
        // asked every 100 ms, so the person's rate limit is not what answers
        await until(async () => (await rows(server, token, { source: "sales" })).status === 401, { tries: 50, every: 100, message: "the old key's token still reads rows" });
        assert.ok(Date.now() - started < KEY_READ_MS * 3);
        const fresh = (await exchange(server, await person(), { source: "sales" })).data.token;
        assert.equal((await rows(server, fresh, { source: "sales" })).status, 200);
    } finally {
        await server.close();
    }
});

test("browser tokens: expiry, another key, a changed byte, and what they keep of the person", async () => {
    let now = Date.parse("2026-11-28T08:00:00Z");
    const options = validateOptions({ sources: { s: { file: "x.csv" } }, rest: { browser: { minutes: 5 } }, auth: { clockTolerance: 0 } });
    const tokens = createBrowserTokens(options, { now: () => now });
    const person = callerOf("oauth", { token: "jwt", clientId: "app", scopes: ["pivotkit"], expiresAt: now / 1000 + 3600, extra: { subject: "ana", issuer: "https://issuer.example", groups: ["sales-team"], claims: { region: "north", tenant: "t1" } } });
    const issued = await tokens.issue(person, { source: "s", params: { region: "north" }, code: false, claims: ["region"] });
    assert.ok(issued);
    const read = await tokens.read(issued.token);
    assert.equal(read.source, "s");
    assert.deepEqual(read.params, { region: "north" });
    assert.equal(read.grant.caller.subject, "ana");
    assert.equal(read.grant.caller.groups, undefined, "a source without code gets no groups");
    assert.deepEqual(read.grant.caller.claims, { region: "north" }, "only the claims its params name");
    const coded = await tokens.read((await tokens.issue(person, { source: "s", params: {}, code: true, claims: [] }))?.token ?? "");
    assert.deepEqual(coded.grant.caller.groups, ["sales-team"], "a code source sees the groups");
    assert.deepEqual(coded.grant.caller.claims, { region: "north", tenant: "t1" });

    const changed = `${issued.token.slice(0, -2)}${issued.token.endsWith("A") ? "B" : "A"}A`;
    await assert.rejects(tokens.read(changed), { code: "INVALID" });
    await assert.rejects(createBrowserTokens(options, { now: () => now }).read(issued.token), { code: "INVALID" }, "another process's random key");
    now += 5 * 60 * 1000 + 1000;
    await assert.rejects(tokens.read(issued.token), { code: "EXPIRED" });
    // static and signed tokens are no persons: no browser token
    assert.equal(await tokens.issue(callerOf("token", { token: "", clientId: "ops", scopes: [], expiresAt: 0, extra: { allScopes: true } }), { source: "s", params: {}, code: false, claims: [] }), null);
});

test("rest.browser options are checked", () => {
    const base = { sources: { s: { file: "x.csv" } } };
    assert.throws(() => validateOptions({ ...base, rest: { browser: { minutes: 61 } } }), /rest\.browser\.minutes/);
    assert.throws(() => validateOptions({ ...base, rest: { browser: { origins: ["https://a.example.com/path"] } } }), /rest\.browser\.origins\[0\]/);
    assert.throws(() => validateOptions({ ...base, rest: { browser: { origins: ["*"] } } }), /"\*" is not accepted/);
    assert.throws(() => validateOptions({ ...base, rest: { browser: { levels: ["anyone"] } } }), /rest\.browser\.levels/);
    assert.throws(() => validateOptions({ ...base, rest: { browser: { levels: [] } } }), /rest\.browser\.levels/);
    assert.doesNotThrow(() => validateOptions({ ...base, rest: { browser: { origins: [PAGE], minutes: 10, levels: ["me", "signedIn", "group"], key: { env: "K" } } } }));
});

test("access levels: create_link signs the level into the link, and the exchange lets in only whom it names", async () => {
    const local = await localIssuer();
    const dir = workspace({ "sales.csv": CSV });
    const server = await restServer({
        sources: { sales: { file: "data/sales.csv", link: `${PAGE}/report`, policy: { fields: { Customer: "hide" } } } },
        policy: { profiles: PROFILES },
        auth: { mode: "oauth", issuer: local.url, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"], defaultProfile: "staff" },
        rest: { browser: { levels: ["me", "group"] } },
        http: { publicUrl: "https://pk.example.com/" },
        baseDir: dir
    });
    const as = (sub, groups = []) => local.token({ claims: { client_id: "host-app", groups }, aud: "https://pk.example.com/api/v1", sub });
    /** A link of `level` made by ana, and its pk-access value. */
    const linkOf = async (access) => {
        const made = await call(`${server.api}/views/link`, { token: await as("ana", ["sales-team"]), body: { source: "sales", view: { rows: ["Region"] }, access } });
        return { made, value: made.data.url ? new URL(made.data.url.split("#")[0]).searchParams.get(ACCESS_PARAM) : null };
    };
    try {
        await untilReady(server, 100);
        const mine = await linkOf({ level: "me" });
        assert.equal(mine.made.status, 200, JSON.stringify(mine.made.data));
        assert.match(String(mine.value), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
        assert.doesNotMatch(Buffer.from(String(mine.value).split(".")[0], "base64url").toString(), /ana/, "the link names the person only as a keyed digest");
        assert.equal((await exchange(server, await as("ana"), { source: "sales", access: mine.value })).status, 200);
        const bob = await exchange(server, await as("bob"), { source: "sales", access: mine.value });
        assert.equal(bob.status, 403);
        assert.equal(bob.data.code, "NOT_ALLOWED");

        const team = await linkOf({ level: "group", group: "sales-team" });
        assert.equal(team.made.status, 200, JSON.stringify(team.made.data));
        assert.doesNotMatch(Buffer.from(String(team.value).split(".")[0], "base64url").toString(), /sales-team/);
        assert.equal((await exchange(server, await as("bob", ["sales-team"]), { source: "sales", access: team.value })).status, 200);
        assert.equal((await exchange(server, await as("carl", ["other"]), { source: "sales", access: team.value })).status, 403);
        // a changed value, a group not one's own, a level the instance does not offer
        const changed = `${String(team.value).slice(0, -1)}${String(team.value).endsWith("A") ? "B" : "A"}`;
        assert.equal((await exchange(server, await as("bob", ["sales-team"]), { source: "sales", access: changed })).status, 403);
        assert.equal((await linkOf({ level: "group", group: "admins" })).made.status, 403);
        assert.equal((await linkOf({ level: "signedIn" })).made.status, 403);
        // without signedIn on offer, a link without a level opens for nobody
        assert.equal((await exchange(server, await as("ana"), { source: "sales" })).status, 403);
        assert.equal((await linkOf({ level: "everyone" })).made.status, 400);
    } finally {
        await server.close();
        await local.close();
    }
});

test("access levels: a person of an external issuer makes signed-in links only, and a server without the browser path takes no level", async () => {
    const { server, person } = await serverOf({ rest: { browser: { levels: ["me", "signedIn"] } } });
    try {
        const body = (access) => ({ source: "sales", view: { rows: ["Region"] }, access });
        const me = await call(`${server.api}/views/link`, { token: await person(), body: body({ level: "me" }) });
        assert.equal(me.status, 403, JSON.stringify(me.data));
        assert.match(me.data.detail, /host application/);
        const signedIn = await call(`${server.api}/views/link`, { token: await person(), body: body({ level: "signedIn" }) });
        assert.equal(signedIn.status, 200, JSON.stringify(signedIn.data));
        const value = new URL(signedIn.data.url.split("#")[0]).searchParams.get(ACCESS_PARAM);
        assert.equal((await exchange(server, await person({ sub: "bob@example.com" }), { source: "sales", access: value })).status, 200);
    } finally {
        await server.close();
    }
    const plain = await restServer({ sources: { sales: { file: "data/sales.csv", link: `${PAGE}/report` } }, auth: { mode: "token", tokens: [{ name: "ops", env: "OPS" }] }, baseDir: workspace({ "sales.csv": CSV }) }, { env: { OPS: TOKEN } });
    try {
        const refused = await call(`${plain.api}/views/link`, { token: TOKEN, body: { source: "sales", view: { rows: ["Region"] }, access: { level: "signedIn" } } });
        assert.equal(refused.status, 403);
        assert.match(refused.data.detail, /no live links/);
        assert.equal((await call(`${plain.api}/views/link`, { token: TOKEN, body: { source: "sales", view: { rows: ["Region"] } } })).status, 200, "without access as before");
    } finally {
        await plain.close();
    }
});

test("with a state directory the browser key is made once, so a browser token outlives a restart", async () => {
    const dir = workspace({ "sales.csv": CSV });
    const state = join(dir, "state");
    mkdirSync(state);
    const given = { sources: { sales: { file: "data/sales.csv" } }, policy: { profiles: PROFILES }, auth: { mode: "token" }, baseDir: dir };
    const prepare = () => prepareHttpServe(given, { env: { PIVOTKIT_TOKEN: TOKEN }, host: "0.0.0.0", tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
    const first = await prepare();
    assert.deepEqual(first.options.rest?.browser?.key, { file: join(state, "secrets", "browser.key"), create: true });
    assert.ok(first.notes.some((n) => n.text.startsWith("created the browser tokens' key")), JSON.stringify(first.notes));
    const person = callerOf("oauth", { token: "jwt", clientId: "app", scopes: ["pivotkit"], expiresAt: Date.now() / 1000 + 3600, extra: { subject: "ana", issuer: "https://issuer.example" } });
    const issued = await createBrowserTokens(first.options).issue(person, { source: "sales", params: {}, code: false, claims: [] });
    const second = await prepare();
    assert.equal((await createBrowserTokens(second.options).read(issued?.token ?? "")).grant.caller.subject, "ana", "the key of the first start");
    // a server whose profiles read no rows makes no browser key
    const none = await prepareHttpServe({ ...given, policy: {} }, { env: { PIVOTKIT_TOKEN: TOKEN }, host: "0.0.0.0", tokenEnv: "PIVOTKIT_TOKEN", stateDir: join(dir, "state-2") }).catch((e) => e);
    assert.equal(none?.options?.rest?.browser?.key, undefined);
});

test("check-config shows the browser path: lifetime, pages, levels and the key", async () => {
    const options = { sources: { sales: { file: "data/sales.csv" } }, policy: { profiles: PROFILES }, auth: { mode: "token", tokens: [{ name: "ops", env: "OPS" }] }, baseDir: workspace({ "sales.csv": CSV }) };
    // the section's facts, and its warnings and problems, which check-config prints first
    const section = async (rest, env = {}) => {
        const text = factsOf((await checkConfig({ ...options, rest }, { http: true, rest: true, env: { OPS: TOKEN, ...env }, name: "pivotkit-server" })).text);
        const said = text.split("\n").filter((l) => /^(WARNING \(Browser path\)|PROBLEM): rest\.browser/.test(l) || /^WARNING \(Browser path\)/.test(l));
        return `${text.split("Browser path (REST)")[1]?.split("\n\n")[0] ?? ""}\n${said.join("\n")}`;
    };
    const plain = await section({});
    assert.match(plain, /^: POST \/api\/v1\/sources\/records\/token/);
    assert.match(plain, /browser tokens live 5 minutes, never longer than the person's own token/);
    assert.match(plain, /pages that read rows with one: only the server's own/);
    assert.match(plain, /access levels of live links: signedIn/);
    assert.match(plain, /rest\.browser\.key is not set: browser tokens stop working on a restart/);
    const set = await section({ browser: { origins: [PAGE], minutes: 10, levels: ["me", "signedIn"], key: { env: "BK" } } }, { BK: BROWSER_KEY });
    assert.match(set, /browser tokens live 10 minutes/);
    assert.match(set, new RegExp(`pages that read rows with one: ${PAGE} \\(rest\\.browser\\.origins\\), and the server's own`));
    assert.match(set, /access levels of live links: me, signedIn/);
    assert.match(set, /key from \$BK/);
    assert.doesNotMatch(set, /not set|PROBLEM/);
    const short = await section({ browser: { key: { env: "BK" } } }, { BK: "short" });
    assert.match(short, /rest\.browser\.key is shorter than 32 bytes; make one with: pivotkit-server key new --for browser/);
    const off = factsOf((await checkConfig({ ...options, policy: {}, rest: { browser: { minutes: 5 } } }, { http: true, rest: true, env: { OPS: TOKEN }, name: "pivotkit-server" })).text);
    assert.match(off, /rest\.browser is set, but no profile reads rows/);
});

test("key new --for browser makes a key the server takes as rest.browser.key", () => {
    const dir = workspace();
    const made = runBin(["key", "new", "--for", "browser", "--file", join(dir, "browser.key"), "--json"]);
    assert.equal(made.status, 0, made.stderr);
    const answer = JSON.parse(made.stdout);
    assert.equal(answer.for, "browser");
    assert.equal(answer.created, true);
    assert.ok(readFileSync(join(dir, "browser.key")).length >= 32);
    const options = validateOptions({ sources: { s: { file: "x.csv" } }, rest: { browser: { key: { file: join(dir, "browser.key") } } }, baseDir: dir });
    assert.ok(options.rest?.browser?.key);
});
