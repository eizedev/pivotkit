// pivotkit login, token and logout against a fake server and a fake issuer on loopback: the device
// code flow, the refresh token kept in a file only its owner reads (--store file, so no test touches
// the real keychain), its rotation, and every way the sign-in ends. The keychain tools are checked
// with a stand-in that records what they get: the secret never goes into their arguments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "pivotkit-cli";
import { run, tempDir } from "./helpers.js";
import { accountOf, credentialStore, storeMeans } from "../src/credential-store.js";
import { scopeOf, signInMeans } from "../src/sign-in.js";

const DEVICE_CODE = "DEVICE-CODE-SECRET-5d1c";
const USER_CODE = "WDJB-MJHT";
const ACCESS = ["ACCESS-ONE-a1b2c3", "ACCESS-TWO-d4e5f6", "ACCESS-THREE-g7h8", "ACCESS-FOUR-i9j0"];
const REFRESH = ["REFRESH-ONE-9f8e7d", "REFRESH-TWO-6c5b4a", "REFRESH-THREE-3a2b1c", "REFRESH-FOUR-0d9e8f"];
const CLIENT = "pivotkit-cli";
const RAW = "ISSUER-TEXT-MARKER-77aa";

/**
 * A fake pivotkit-server (its sign-in metadata) and a fake issuer on one loopback port. `plan`
 * changes what each part answers; the requests are kept.
 */
async function fakeIssuer(plan = {}) {
    const requests = [];
    const state = { polls: 0, refreshes: 0, valid: new Set([REFRESH[0]]) };
    let origin = "";
    const send = (res, status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
    };
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const body = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
            requests.push({ method: req.method, url: req.url, body });
            if (plan.hook?.({ req, res, body, origin, state, send })) {
                return;
            }
            const issuer = plan.issuer ?? `${origin}/issuer`;
            if (req.url === "/.well-known/oauth-protected-resource/api/v1") {
                if (plan.prm === 404) {
                    res.writeHead(404, { "content-type": "application/problem+json" });
                    res.end(JSON.stringify({ code: "NOT_FOUND", status: 404, detail: "no such route" }));
                    return;
                }
                return send(res, 200, { resource: plan.resource ?? `${origin}/api/v1`, authorization_servers: [`${origin}/issuer`], scopes_supported: ["pivotkit.read"], resource_name: "pivotkit REST" });
            }
            if (req.url === "/.well-known/oauth-authorization-server/issuer" && plan.firstAddress) {
                // a provider with OpenID Connect discovery only: the first address answers otherwise
                if (plan.firstAddress === "redirect") {
                    res.writeHead(302, { location: `${origin}/elsewhere` });
                    return res.end();
                }
                res.writeHead(404, { "content-type": "text/html" });
                return res.end("<html>not found</html>");
            }
            if (req.url === "/.well-known/oauth-authorization-server/issuer" || (plan.firstAddress && req.url === "/issuer/.well-known/openid-configuration")) {
                return send(res, 200, { issuer, token_endpoint: `${origin}/token`, ...(plan.noDevice ? {} : { device_authorization_endpoint: plan.deviceEndpoint ?? `${origin}/device` }), scopes_supported: ["openid", "offline_access", "pivotkit.read"], ...(plan.revocation ? { revocation_endpoint: `${origin}/revoke` } : {}) });
            }
            if (req.url === "/revoke") {
                state.valid.delete(body.token);
                return send(res, 200, {});
            }
            if (req.url === "/device") {
                return send(res, 200, { device_code: DEVICE_CODE, user_code: USER_CODE, verification_uri: plan.verifyUri?.(origin) ?? `${origin}/activate`, expires_in: plan.expiresIn ?? 600, interval: plan.interval ?? 1 });
            }
            if (req.url === "/token" && body.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
                state.polls++;
                if (plan.deny) {
                    return send(res, 400, { error: "access_denied", error_description: RAW });
                }
                const slowDowns = plan.slowDown === true ? 1 : (plan.slowDown ?? 0);
                if (state.polls <= slowDowns) {
                    return send(res, 400, { error: "slow_down" });
                }
                if (plan.pending || state.polls < slowDowns + 2) {
                    return send(res, 400, { error: "authorization_pending", error_description: RAW });
                }
                return send(res, 200, { access_token: ACCESS[0], token_type: "Bearer", expires_in: 3600, ...(plan.noRefresh ? {} : { refresh_token: REFRESH[0] }) });
            }
            if (req.url === "/token" && body.grant_type === "refresh_token") {
                // rotation: each refresh token works once and the answer carries the next one
                if (!state.valid.has(body.refresh_token)) {
                    return send(res, 400, { error: "invalid_grant", error_description: RAW });
                }
                state.valid.delete(body.refresh_token);
                state.refreshes++;
                const next = REFRESH[state.refreshes];
                state.valid.add(next);
                return send(res, 200, { access_token: ACCESS[state.refreshes], token_type: "Bearer", expires_in: 3600, refresh_token: next });
            }
            send(res, 404, { error: "not_found" });
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, url: `${origin}/api/v1`, requests, state, close: () => new Promise((resolve) => server.closeAllConnections() || server.close(resolve)) };
}

/** No token, refresh token, device code or issuer text in what the CLI wrote. */
function assertClean(result) {
    for (const [name, text] of [["stdout", result.stdout], ["stderr", result.stderr]]) {
        for (const secret of [DEVICE_CODE, ...REFRESH, RAW]) {
            assert.ok(!text.includes(secret), `${name} holds ${secret}`);
        }
    }
}

/** The environment of a run whose sign-ins live in `dir`. */
const envOf = (dir, more = {}) => ({ XDG_CONFIG_HOME: dir, APPDATA: dir, ...more });

/** The one token file of a sign-in directory. */
function tokenFile(dir) {
    const files = readdirSync(join(dir, "pivotkit", "tokens"));
    assert.equal(files.length, 1);
    return join(dir, "pivotkit", "tokens", files[0]);
}

test("login runs the device code flow, keeps the refresh token in a file only its owner reads, and says what to open", async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        const r = await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) });
        assert.equal(r.code, 0, r.stderr);
        assert.equal(r.stdout, "");
        assert.match(r.stderr, /^Sign in at 127\.0\.0\.1:\d+, the sign-in provider of 127\.0\.0\.1:\d+\.\nOpen /, "the issuer's host comes before the code");
        assert.match(r.stderr, new RegExp(`Open ${fake.origin}/activate and enter the code ${USER_CODE}`));
        assert.match(r.stderr, process.platform === "win32" ? /The refresh token is in .*, a file in your user profile\./ : /Signed in to .*\/api\/v1\. The refresh token is in .*, a file only you can read \(mode 0600\)\./);
        assertClean({ ...r, stderr: r.stderr });
        assert.ok(!r.stderr.includes(ACCESS[0]));
        const device = fake.requests.find((q) => q.url === "/device");
        assert.deepEqual(device.body, { client_id: CLIENT, scope: "pivotkit.read offline_access" });
        assert.equal(fake.state.polls, 2, "polled until the sign-in was done");
        const file = tokenFile(dir);
        assert.equal(readFileSync(file, "utf8"), REFRESH[0]);
        assert.equal(file.endsWith(`${accountOf(`${fake.url}`)}.token`), true);
        if (process.platform !== "win32") {
            assert.equal(statSync(file).mode & 0o777, 0o600);
            assert.equal(statSync(join(dir, "pivotkit", "tokens")).mode & 0o777, 0o700);
        }
        const list = readFileSync(join(dir, "pivotkit", "logins.json"), "utf8");
        assert.ok(!list.includes(REFRESH[0]) && !list.includes(ACCESS[0]), "the list of sign-ins holds no token");
        assert.equal(JSON.parse(list).logins[fake.url].clientId, CLIENT);
    } finally {
        await fake.close();
    }
});

test("token prints a fresh access token alone and keeps the rotated refresh token; the old one is never sent again", async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        assert.equal((await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) })).code, 0);
        const first = await run(["token"], { env: envOf(dir) });
        assert.equal(first.code, 0, first.stderr);
        assert.equal(first.stdout, `${ACCESS[1]}\n`);
        assert.equal(first.stderr, "");
        assertClean(first);
        assert.equal(readFileSync(tokenFile(dir), "utf8"), REFRESH[1]);
        const second = await run(["token", "--url", fake.url], { env: envOf(dir) });
        assert.equal(second.code, 0, second.stderr);
        assert.equal(second.stdout, `${ACCESS[2]}\n`);
        const sent = fake.requests.filter((q) => q.body.grant_type === "refresh_token").map((q) => q.body.refresh_token);
        assert.deepEqual(sent, [REFRESH[0], REFRESH[1]]);
        assert.equal(fake.requests.at(-1).body.client_id, CLIENT);
        const json = await run(["token", "--json"], { env: envOf(dir) });
        assert.equal(json.code, 0, json.stderr);
        assert.deepEqual(JSON.parse(json.stdout), { ok: true, exitCode: 0, command: "token", findings: [], server: fake.url, accessToken: ACCESS[3] });
        assertClean(json);
    } finally {
        await fake.close();
    }
});

test("token exits 3 when the refresh token is refused, says to sign in again and prints no token", async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        assert.equal((await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) })).code, 0);
        fake.state.valid.clear();
        const r = await run(["token"], { env: envOf(dir) });
        assert.equal(r.code, 3, "its own exit code: sign in again");
        assert.equal(r.stdout, "");
        assert.match(r.stderr, /the token could not be renewed: the issuer answered 400 invalid_grant; the sign-in has ended or was revoked; sign in again: pivotkit login --url /);
        assertClean(r);
        const json = await run(["token", "--json"], { env: envOf(dir) });
        assert.equal(json.code, 3);
        assert.equal(JSON.parse(json.stdout).exitCode, 3);
        assert.equal(JSON.parse(json.stdout).error.code, "INVALID_GRANT");
        assertClean(json);
    } finally {
        await fake.close();
    }
});

test("token and logout without a sign-in exit 3 and say how to sign in; logout removes the refresh token", async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        const none = await run(["token"], { env: envOf(dir) });
        assert.equal(none.code, 3);
        assert.match(none.stderr, /not signed in; run pivotkit login --url/);
        assert.equal((await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) })).code, 0);
        const other = await run(["token", "--url", "https://other.example/api/v1"], { env: envOf(dir) });
        assert.equal(other.code, 3);
        assert.match(other.stderr, /not signed in to https:\/\/other\.example\/api\/v1/);
        const out = await run(["logout"], { env: envOf(dir) });
        assert.equal(out.code, 0, out.stderr);
        assert.match(out.stderr, /Signed out of /);
        assert.deepEqual(readdirSync(join(dir, "pivotkit", "tokens")), []);
        assert.equal((await run(["token"], { env: envOf(dir) })).code, 3);
    } finally {
        await fake.close();
    }
});

test("login ends with exit 2 and the issuer's code, never its text, when the sign-in is declined", async () => {
    const fake = await fakeIssuer({ deny: true });
    const dir = tempDir();
    try {
        const r = await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) });
        assert.equal(r.code, 2);
        assert.match(r.stderr, /the sign-in did not finish: the issuer answered 400 access_denied; the sign-in was declined/);
        assertClean(r);
        assert.equal(existsSync(join(dir, "pivotkit", "logins.json")), false);
    } finally {
        await fake.close();
    }
});

test("login refuses a server without sign-in metadata, metadata for another address, another issuer and an issuer without the device flow", async () => {
    const cases = [
        [{ prm: 404 }, /the server publishes no sign-in metadata: it uses no sign-in provider/],
        [{ resource: "https://elsewhere.example/api/v1" }, /the server's metadata is for another address \(https:\/\/elsewhere\.example\/api\/v1\)/],
        [{ issuer: "https://evil.example/issuer" }, /the issuer's metadata names another issuer/],
        [{ noDevice: true }, /the issuer offers no device code flow/],
        [{ deviceEndpoint: "http://device.example/device" }, /device_authorization_endpoint is no https:\/\/ address/]
    ];
    for (const [plan, message] of cases) {
        const fake = await fakeIssuer(plan);
        const dir = tempDir();
        try {
            const r = await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) });
            assert.equal(r.code, 2, JSON.stringify(plan));
            assert.match(r.stderr, message);
            assert.equal(fake.requests.some((q) => q.url === "/device"), false, "no device code asked for");
        } finally {
            await fake.close();
        }
    }
});

test("login reads the issuer's OpenID Connect discovery when the RFC 8414 address answers a page or a redirect", async () => {
    for (const firstAddress of ["page", "redirect"]) {
        const fake = await fakeIssuer({ firstAddress });
        const dir = tempDir();
        try {
            const r = await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) });
            assert.equal(r.code, 0, `${firstAddress}: ${r.stderr}`);
            assert.ok(fake.requests.some((q) => q.url === "/issuer/.well-known/openid-configuration"), firstAddress);
            assert.ok(!fake.requests.some((q) => q.url === "/elsewhere"), "the redirect is not followed");
        } finally {
            await fake.close();
        }
    }
});

test("login without a refresh token from the issuer says to ask for offline_access and keeps nothing", async () => {
    const fake = await fakeIssuer({ noRefresh: true });
    const dir = tempDir();
    try {
        const r = await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) });
        assert.equal(r.code, 2);
        assert.match(r.stderr, /the issuer gave no refresh token/);
        assert.ok(!r.stderr.includes(ACCESS[0]));
        assert.equal(existsSync(join(dir, "pivotkit", "logins.json")), false);
    } finally {
        await fake.close();
    }
});

test("login needs a client id: --client-id, else PIVOTKIT_CLIENT_ID; without one a usage error before any request", async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        const r = await run(["login", "--url", fake.url, "--store", "file"], { env: envOf(dir) });
        assert.equal(r.code, 2);
        assert.match(r.stderr, /the issuer's client id is needed: --client-id <id>, or PIVOTKIT_CLIENT_ID/);
        assert.equal(fake.requests.length, 0);
        const byEnv = await run(["login", "--store", "file"], { env: envOf(dir, { PIVOTKIT_CLIENT_ID: CLIENT, PIVOTKIT_URL: fake.url }) });
        assert.equal(byEnv.code, 0, byEnv.stderr);
    } finally {
        await fake.close();
    }
});

test("the scope: --scope as given, else the server's scopes and offline_access when the issuer offers it or lists none", () => {
    assert.equal(scopeOf(undefined, ["pivotkit.read"], ["openid", "offline_access"]), "pivotkit.read offline_access");
    assert.equal(scopeOf(undefined, ["pivotkit.read"], ["openid"]), "pivotkit.read");
    assert.equal(scopeOf(undefined, [], null), "offline_access");
    assert.equal(scopeOf("api://reports/.default  offline_access", ["x"], null), "api://reports/.default offline_access");
    assert.throws(() => scopeOf('a"b', [], null), /--scope takes scopes/);
});

/** Runs main() in this process with sign-ins in `dir`. */
async function inProcess(args, dir) {
    const out = [];
    const err = [];
    const code = await main(args, { stdin: (async function* () {})(), stdout: { write: (c) => out.push(String(c)) }, stderr: { write: (c) => err.push(String(c)) }, env: envOf(dir), cwd: dir });
    return { code, stdout: out.join(""), stderr: err.join("") };
}

test("polling waits the issuer's interval, five seconds more after slow_down (RFC 8628 3.5), and gives up when the code expires", async () => {
    const sleep = signInMeans.sleep;
    const waits = [];
    signInMeans.sleep = async (ms) => void waits.push(ms);
    try {
        const slow = await fakeIssuer({ slowDown: true });
        try {
            const r = await inProcess(["login", "--url", slow.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            assert.equal(slow.state.polls, 3);
            assert.deepEqual(waits, [1000, 6000, 6000]);
        } finally {
            await slow.close();
        }
        waits.length = 0;
        const pending = await fakeIssuer({ pending: true, expiresIn: 3 });
        try {
            const r = await inProcess(["login", "--url", pending.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.match(r.stderr, /the code expired before the sign-in finished; run pivotkit login again/);
            assert.deepEqual(waits, [1000, 1000, 1000]);
            assert.equal(pending.state.polls, 3);
        } finally {
            await pending.close();
        }
    } finally {
        signInMeans.sleep = sleep;
    }
});

test("the keychain tools never get the secret as an argument: macOS security -i reads it as hex on stdin, secret-tool and PowerShell on stdin", async () => {
    const { platform, run: realRun } = storeMeans;
    const calls = [];
    const kept = new Map();
    storeMeans.run = async (command, args, input) => {
        calls.push({ command, args, input });
        const joined = args.join(" ");
        if (/add-generic-password/.test(input)) {
            kept.set("mac", Buffer.from(/-X ([0-9a-f]+)/.exec(input)[1], "hex").toString("utf8"));
            return { code: 0, stdout: "" };
        }
        if (/find-generic-password/.test(joined)) {
            return { code: 0, stdout: `${kept.get("mac")}\n` };
        }
        if (args[0] === "store") {
            kept.set("linux", input);
            return { code: 0, stdout: "" };
        }
        if (args[0] === "lookup") {
            return { code: 0, stdout: kept.get("linux") };
        }
        if (/powershell/i.test(command)) {
            const [action, , secret] = input.split("\n");
            if (action === "write") {
                kept.set("win", secret);
                return { code: 0, stdout: "" };
            }
            return { code: 0, stdout: kept.get("win") };
        }
        return { code: 1, stdout: "" };
    };
    const secret = "REFRESH-KEYCHAIN-SECRET-1234";
    try {
        for (const [os, tool] of [["darwin", /^\/usr\/bin\/security$/], ["linux", /^secret-tool$/], ["win32", /powershell\.exe$/i]]) {
            storeMeans.platform = /** @type {any} */ (os);
            calls.length = 0;
            const dir = tempDir();
            const placed = await credentialStore(envOf(dir)).put("https://reports.example/api/v1", secret, "auto");
            assert.equal(placed.store, "keychain", os);
            assert.equal(await credentialStore(envOf(dir)).get({ resource: "https://reports.example/api/v1", store: "keychain" }), secret, os);
            assert.ok(calls.length >= 2);
            for (const c of calls) {
                assert.match(c.command, tool);
                assert.ok(!c.args.join(" ").includes(secret), `${os}: the secret is in the arguments`);
                assert.ok(!c.args.join(" ").includes(Buffer.from(secret).toString("hex")), `${os}: the secret's hex is in the arguments`);
            }
            assert.ok(calls.some((c) => c.input.includes(secret) || c.input.includes(Buffer.from(secret).toString("hex"))), `${os}: the secret went on stdin`);
            assert.equal(existsSync(join(dir, "pivotkit", "tokens")), false, `${os}: no file with a keychain`);
        }
    } finally {
        storeMeans.platform = platform;
        storeMeans.run = realRun;
    }
});

test("auto falls back to a file only its owner reads when the keychain cannot keep the token, and says so; --store keychain fails instead", async () => {
    const { platform, run: realRun } = storeMeans;
    storeMeans.platform = "linux";
    // secret-tool without a secret service: every call fails
    storeMeans.run = async () => ({ code: 1, stdout: "" });
    try {
        const dir = tempDir();
        const placed = await credentialStore(envOf(dir)).put("https://reports.example/api/v1", "REFRESH-FALLBACK-9999", "auto");
        assert.equal(placed.store, "file");
        assert.equal(placed.fellBack, true);
        assert.equal(readFileSync(placed.where, "utf8"), "REFRESH-FALLBACK-9999");
        if (process.platform !== "win32") {
            assert.equal(statSync(placed.where).mode & 0o777, 0o600);
        }
        await assert.rejects(credentialStore(envOf(tempDir())).put("https://reports.example/api/v1", "x", "keychain"), (e) => e.code === "NO_KEYCHAIN" && /use --store file/.test(e.message));
        // a keychain that says yes but keeps nothing does not count
        storeMeans.run = async (command, args) => ({ code: 0, stdout: args[0] === "lookup" ? "something else" : "" });
        assert.equal((await credentialStore(envOf(tempDir())).put("https://reports.example/api/v1", "REFRESH-LOST", "auto")).store, "file");
    } finally {
        storeMeans.platform = platform;
        storeMeans.run = realRun;
    }
});

test("the Windows Credential Manager keeps, returns and removes a token through PowerShell", { skip: process.platform === "win32" && process.env.CI ? false : "runs on CI's Windows runners only: it writes to the real Credential Manager" }, async (t) => {
    const resource = `https://pivotkit-test-${process.pid}.example/api/v1`;
    const store = credentialStore(envOf(tempDir()));
    const realRun = storeMeans.run;
    const codes = [];
    storeMeans.run = async (...args) => {
        const result = await realRun(...args);
        codes.push(result.code);
        return result;
    };
    try {
        const placed = await store.put(resource, "REFRESH-WINDOWS-CREDENTIAL-1", "keychain").catch((e) => e);
        // exit code 3: the script ran and CredWrite said no (a session without a credential store);
        // anything else that fails is a broken script and fails the test
        if (placed instanceof Error && codes[0] === 3) {
            t.skip("CredWrite refused in this session");
            return;
        }
        assert.ok(!(placed instanceof Error), `the store failed with the exit codes ${codes.join(", ")}`);
        assert.equal(placed.store, "keychain");
        assert.equal(await store.get({ resource, store: "keychain" }), "REFRESH-WINDOWS-CREDENTIAL-1");
        await store.record({ resource, issuer: "https://issuer.example", clientId: "c", scope: "", tokenEndpoint: "https://issuer.example/token", store: "keychain" });
        await store.remove(resource);
        assert.equal(await store.get({ resource, store: "keychain" }), null);
    } finally {
        storeMeans.run = realRun;
        await keychainCleanup(resource);
    }
});

/** Removes a test's entry from the Credential Manager whatever the test reached. */
async function keychainCleanup(resource) {
    const { keychainOf } = await import("../src/credential-store.js");
    await keychainOf()?.remove(accountOf(resource));
}

// ---------------------------------------------------------------------------------------------
// The review's points: polling, phishing, transient errors, the lock, rotation, revocation, the store

/** Runs a test with the waits recorded instead of slept. */
async function withWaits(work) {
    const sleep = signInMeans.sleep;
    const waits = [];
    signInMeans.sleep = async (ms) => void waits.push(ms);
    try {
        return await work(waits);
    } finally {
        signInMeans.sleep = sleep;
    }
}

test("a second slow_down adds five seconds more; an issuer's interval over 60 s is kept, not cut", async () => {
    await withWaits(async (waits) => {
        const twice = await fakeIssuer({ slowDown: 2 });
        try {
            assert.equal((await inProcess(["login", "--url", twice.url, "--client-id", CLIENT, "--store", "file"], tempDir())).code, 0);
            assert.deepEqual(waits, [1000, 6000, 11000, 11000]);
        } finally {
            await twice.close();
        }
        waits.length = 0;
        const long = await fakeIssuer({ interval: 90, slowDown: 1 });
        try {
            assert.equal((await inProcess(["login", "--url", long.url, "--client-id", CLIENT, "--store", "file"], tempDir())).code, 0);
            assert.deepEqual(waits, [90_000, 90_000, 90_000], "RFC 8628 3.5: never shorter than the issuer asks");
        } finally {
            await long.close();
        }
    });
});

test("a poll that fails on the way (a 503 page, a dropped connection, no JSON) is asked again; three in a row end the sign-in, an OAuth error at once", async () => {
    await withWaits(async () => {
        const flaky = await fakeIssuer({
            hook: ({ req, res, state }) => {
                if (req.url !== "/token") {
                    return false;
                }
                state.polls++;
                if (state.polls === 1) {
                    res.writeHead(503, { "content-type": "text/html" });
                    res.end("<html>busy</html>");
                    return true;
                }
                if (state.polls === 2) {
                    res.socket.destroy();
                    return true;
                }
                if (state.polls === 3) {
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end("{not json");
                    return true;
                }
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ access_token: ACCESS[0], token_type: "Bearer", refresh_token: REFRESH[0] }));
                return true;
            }
        });
        try {
            const r = await inProcess(["login", "--url", flaky.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            assert.equal(flaky.state.polls, 4);
        } finally {
            await flaky.close();
        }
        const down = await fakeIssuer({
            hook: ({ req, res, state }) => {
                if (req.url !== "/token") {
                    return false;
                }
                state.polls++;
                res.writeHead(500, { "content-type": "application/json" });
                res.end(JSON.stringify({ error: "server_error" }));
                return true;
            }
        });
        try {
            const r = await inProcess(["login", "--url", down.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.equal(down.state.polls, 4, "the first try and three more");
        } finally {
            await down.close();
        }
        const denied = await fakeIssuer({ deny: true });
        try {
            assert.equal((await inProcess(["login", "--url", denied.url, "--client-id", CLIENT, "--store", "file"], tempDir())).code, 2);
            assert.equal(denied.state.polls, 1, "an OAuth error is not asked again");
        } finally {
            await denied.close();
        }
    });
});

test("redirects at the issuer's metadata and at the token endpoint are not followed; an answer over the cap and one too slow are errors", async () => {
    await withWaits(async () => {
        const redirect = (path) => ({ req, res, origin }) => {
            if (!req.url.startsWith(path)) {
                return false;
            }
            res.writeHead(302, { location: `${origin}/elsewhere` });
            res.end();
            return true;
        };
        const meta = await fakeIssuer({ hook: redirect("/.well-known/oauth-authorization-server") });
        try {
            const r = await inProcess(["login", "--url", meta.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.match(r.stderr, /the issuer's metadata cannot be read/);
            assert.ok(!meta.requests.some((q) => q.url === "/elsewhere"));
        } finally {
            await meta.close();
        }
        const token = await fakeIssuer({ hook: redirect("/token") });
        try {
            const r = await inProcess(["login", "--url", token.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.match(r.stderr, /redirected; redirects are not followed/);
            assert.ok(!token.requests.some((q) => q.url === "/elsewhere"));
        } finally {
            await token.close();
        }
        const big = await fakeIssuer({
            hook: ({ req, res }) => {
                if (req.url !== "/device") {
                    return false;
                }
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ device_code: "x".repeat(300_000) }));
                return true;
            }
        });
        try {
            const r = await inProcess(["login", "--url", big.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.match(r.stderr, /is too large/);
        } finally {
            await big.close();
        }
    });
    const requestMs = signInMeans.requestMs;
    signInMeans.requestMs = 200;
    const slow = await fakeIssuer({ hook: ({ req }) => req.url.startsWith("/.well-known/oauth-protected-resource") });
    try {
        const r = await inProcess(["login", "--url", slow.url, "--client-id", CLIENT, "--store", "file"], tempDir());
        assert.equal(r.code, 2);
        assert.match(r.stderr, /cannot be reached within 0\.2 s/);
    } finally {
        signInMeans.requestMs = requestMs;
        await slow.close();
    }
});

test("https only: a verification address over http elsewhere is refused; plain http for the issuer only next to a loopback server", async () => {
    const fake = await fakeIssuer({ verifyUri: () => "http://device.example/activate" });
    try {
        const r = await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], tempDir());
        assert.equal(r.code, 2);
        assert.match(r.stderr, /verification_uri is no https:\/\/ address/);
    } finally {
        await fake.close();
    }
    const { checkedUrl } = await import("../src/sign-in.js");
    assert.equal(checkedUrl("http://127.0.0.1:8080/issuer", "the issuer", true).protocol, "http:");
    assert.throws(() => checkedUrl("http://127.0.0.1:8080/issuer", "the issuer", false), /the issuer is no https:\/\/ address/);
    assert.throws(() => checkedUrl("http://auth.example/issuer", "the issuer", true), /no https:\/\/ address/);
});

test("phishing (RFC 8628 5.4): the issuer's host comes before the code, with a warning when the code page is on another site", async () => {
    await withWaits(async () => {
        const fake = await fakeIssuer({ verifyUri: (origin) => origin.replace("127.0.0.1", "localhost") + "/activate" });
        try {
            const r = await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            const lines = r.stderr.split("\n");
            const warning = lines.findIndex((l) => /^warning: the code page is on localhost:\d+, not on 127\.0\.0\.1:\d+/.test(l));
            const code = lines.findIndex((l) => l.includes(USER_CODE));
            assert.ok(warning >= 0 && warning < code, r.stderr);
        } finally {
            await fake.close();
        }
    });
    const { siteOf } = await import("../src/sign-in.js");
    assert.equal(siteOf("login.microsoftonline.com"), "microsoftonline.com");
    assert.equal(siteOf("auth.example.co.uk"), "example.co.uk");
    assert.equal(siteOf("127.0.0.1"), "127.0.0.1");
});

test("two token runs at once: the lock lets one refresh at a time, so neither spends the other's rotated token", async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        assert.equal((await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) })).code, 0);
        const [a, b] = await Promise.all([run(["token"], { env: envOf(dir) }), run(["token"], { env: envOf(dir) })]);
        assert.deepEqual([a.code, b.code], [0, 0], `${a.stderr}${b.stderr}`);
        assert.deepEqual(new Set([a.stdout, b.stdout]), new Set([`${ACCESS[1]}\n`, `${ACCESS[2]}\n`]));
        assert.deepEqual(readdirSync(join(dir, "pivotkit", "locks")), [], "the lock is gone");
    } finally {
        await fake.close();
    }
});

test("rotation: when the keychain cannot keep the new refresh token, the access token is still printed and the file keeps it, with a warning", async () => {
    const { platform, run: realRun } = storeMeans;
    const kept = new Map();
    let writes = 0;
    storeMeans.platform = "linux";
    storeMeans.run = async (command, args, input) => {
        if (args[0] === "store") {
            writes++;
            if (writes > 1) {
                return { code: 1, stdout: "" };
            }
            kept.set("linux", input);
            return { code: 0, stdout: "" };
        }
        if (args[0] === "lookup") {
            return { code: 0, stdout: kept.get("linux") ?? "" };
        }
        return { code: 0, stdout: "" };
    };
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        await withWaits(async () => assert.equal((await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "keychain"], dir)).code, 0));
        const r = await inProcess(["token"], dir);
        assert.equal(r.code, 0, r.stderr);
        assert.equal(r.stdout, `${ACCESS[1]}\n`);
        assert.match(r.stderr, /^warning: the keychain could not keep the new refresh token; it is in .*\.token, /);
        assert.equal(readFileSync(tokenFile(dir), "utf8"), REFRESH[1]);
        assert.equal(JSON.parse(readFileSync(join(dir, "pivotkit", "logins.json"), "utf8")).logins[fake.url].store, "file");
        assert.equal((await inProcess(["token"], dir)).stdout, `${ACCESS[2]}\n`, "the next run reads the file");
    } finally {
        storeMeans.platform = platform;
        storeMeans.run = realRun;
        await fake.close();
    }
});

test("login leaves no token behind when its record cannot be written", { skip: process.platform === "win32" || process.getuid?.() === 0 ? "needs POSIX modes and a user other than root" : false }, async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    const home = join(dir, "pivotkit");
    try {
        mkdirSync(join(home, "tokens"), { recursive: true, mode: 0o700 });
        // the token's directory takes the file, the list's directory refuses its new copy
        chmodSync(home, 0o500);
        const r = await withWaits(() => inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], dir));
        assert.equal(r.code, 2, r.stderr);
        assert.deepEqual(readdirSync(join(home, "tokens")), [], "no orphan token");
    } finally {
        chmodSync(home, 0o700);
        await fake.close();
    }
});

test("a new login of the same server keeps the new token first: from the file to the keychain, the old file goes only after", async () => {
    const { platform, run: realRun } = storeMeans;
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        await withWaits(async () => assert.equal((await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], dir)).code, 0));
        const kept = new Map();
        storeMeans.platform = "linux";
        storeMeans.run = async (command, args, input) => (args[0] === "store" ? (kept.set("t", input), { code: 0, stdout: "" }) : args[0] === "lookup" ? { code: 0, stdout: kept.get("t") ?? "" } : { code: 0, stdout: "" });
        fake.state.polls = 0;
        await withWaits(async () => assert.equal((await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "keychain"], dir)).code, 0));
        assert.equal(kept.get("t"), REFRESH[0]);
        assert.deepEqual(readdirSync(join(dir, "pivotkit", "tokens")), [], "the old file is gone");
        assert.equal(JSON.parse(readFileSync(join(dir, "pivotkit", "logins.json"), "utf8")).logins[fake.url].store, "keychain");
    } finally {
        storeMeans.platform = platform;
        storeMeans.run = realRun;
        await fake.close();
    }
});

test("logout revokes the refresh token at the issuer when it offers RFC 7009, and says when it cannot", async () => {
    const fake = await fakeIssuer({ revocation: true });
    const dir = tempDir();
    try {
        await withWaits(async () => assert.equal((await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], dir)).code, 0));
        const r = await inProcess(["logout"], dir);
        assert.equal(r.code, 0, r.stderr);
        assert.match(r.stderr, /The issuer revoked the refresh token\./);
        const revoke = fake.requests.find((q) => q.url === "/revoke");
        assert.deepEqual(revoke.body, { token: REFRESH[0], token_type_hint: "refresh_token", client_id: CLIENT });
        assert.ok(!r.stderr.includes(REFRESH[0]));
    } finally {
        await fake.close();
    }
});

test("the store: a missing keychain tool is named, a token over the Windows Credential Manager's 2560 bytes goes to the file, a linked token file is refused", async () => {
    const { platform, run: realRun } = storeMeans;
    try {
        storeMeans.platform = "linux";
        storeMeans.run = async () => ({ code: null, stdout: "", missing: true });
        const missing = await credentialStore(envOf(tempDir())).put("https://reports.example/api/v1", "REFRESH-X", "auto");
        assert.equal(missing.store, "file");
        assert.match(missing.why, /secret-tool \(the package libsecret-tools.*\) is not installed/);
        storeMeans.platform = "win32";
        let called = false;
        storeMeans.run = async () => {
            called = true;
            return { code: 0, stdout: "" };
        };
        const long = await credentialStore(envOf(tempDir())).put("https://reports.example/api/v1", "R".repeat(2561), "auto");
        assert.equal(long.store, "file");
        assert.match(long.why, /longer than the 2560 bytes the Windows Credential Manager keeps/);
        assert.equal(called, false, "the Credential Manager is not asked");
    } finally {
        storeMeans.platform = platform;
        storeMeans.run = realRun;
    }
    if (process.platform !== "win32") {
        const fake = await fakeIssuer();
        const dir = tempDir();
        try {
            assert.equal((await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) })).code, 0);
            const file = tokenFile(dir);
            writeFileSync(join(dir, "elsewhere.token"), REFRESH[0]);
            unlinkSync(file);
            symlinkSync(join(dir, "elsewhere.token"), file);
            const r = await run(["token"], { env: envOf(dir) });
            assert.equal(r.code, 2);
            assert.match(r.stderr, /is not a file pivotkit wrote/);
        } finally {
            await fake.close();
        }
    }
});
