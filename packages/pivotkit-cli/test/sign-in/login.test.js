// pivotkit login: the device code flow, what it asks of the server and the issuer (their metadata,
// the client ID, the scope), how a sign-in ends when it is declined or incomplete, and the issuer's
// host shown before the code (phishing, RFC 8628 5.4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { run, tempDir } from "../helpers.js";
import { accountOf } from "../../src/credential-store.js";
import { scopeOf } from "../../src/sign-in.js";
import { ACCESS, CLIENT, REFRESH, USER_CODE, assertClean, envOf, fakeIssuer, inProcess, tokenFile, withWaits } from "./fake-issuer.js";

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
        assertClean(r);
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

test("login needs a client id: --client-id, else PIVOTKIT_CLIENT_ID, else the server's; without one a usage error after the server's metadata only", async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        const r = await run(["login", "--url", fake.url, "--store", "file"], { env: envOf(dir) });
        assert.equal(r.code, 2);
        assert.match(r.stderr, /the issuer's client id is needed: --client-id <id>, or PIVOTKIT_CLIENT_ID/);
        // the server's metadata is read to see whether it publishes a client; the issuer is not asked
        assert.deepEqual(fake.requests.map((q) => q.url), ["/.well-known/oauth-protected-resource/api/v1"]);
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
    const { sameSite } = await import("../../src/sign-in.js");
    assert.equal(sameSite("auth.example.com", "auth.example.com"), true);
    assert.equal(sameSite("device.auth.example.com", "auth.example.com"), true, "a subdomain of the issuer");
    assert.equal(sameSite("example.com", "auth.example.com"), true, "a parent of the issuer");
    assert.equal(sameSite("attacker.okta.com", "acme.okta.com"), false, "two tenants of one hosting domain");
    assert.equal(sameSite("evil-example.com", "example.com"), false);
    assert.equal(sameSite("microsoft.com", "login.microsoftonline.com"), false);
});

test("login takes the client ID the server publishes when neither --client-id nor PIVOTKIT_CLIENT_ID is given, and names it and the issuer", async () => {
    await withWaits(async () => {
        const fake = await fakeIssuer({ published: "reports-cli" });
        try {
            const r = await inProcess(["login", "--url", fake.url, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            assert.match(r.stderr, /^Using the client ID reports-cli that the server publishes, at 127\.0\.0\.1:\d+\.\n/);
            assert.equal(fake.requests.find((q) => q.url === "/device").body.client_id, "reports-cli");
        } finally {
            await fake.close();
        }
        const none = await fakeIssuer();
        try {
            const r = await inProcess(["login", "--url", none.url, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.match(r.stderr, /the issuer's client id is needed: --client-id <id>, or PIVOTKIT_CLIENT_ID; the server publishes none/);
        } finally {
            await none.close();
        }
    });
});

test("--client-id pins the client ID: the published one is not used and not named", async () => {
    await withWaits(async () => {
        const fake = await fakeIssuer({ published: "reports-cli" });
        try {
            const r = await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            assert.doesNotMatch(r.stderr, /that the server publishes/);
            assert.equal(fake.requests.find((q) => q.url === "/device").body.client_id, CLIENT);
        } finally {
            await fake.close();
        }
    });
});

for (const [name, published] of [["a number", 1], ["null", null], ["an empty text", ""], ["an object", {}], ["a text with a space", "has space"]]) {
    test(`a published client ID that is ${name} is refused before the issuer is asked`, async () => {
        const fake = await fakeIssuer({ hook: ({ req, res, origin, send }) => req.url === "/.well-known/oauth-protected-resource/api/v1" && (send(res, 200, { resource: `${origin}/api/v1`, authorization_servers: [`${origin}/issuer`], pivotkit_client_id: published }), true) });
        try {
            const r = await inProcess(["login", "--url", fake.url, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.match(r.stderr, /the client ID the server publishes is not usable; give one with --client-id/);
            assert.deepEqual(fake.requests.map((q) => q.url), ["/.well-known/oauth-protected-resource/api/v1"]);
        } finally {
            await fake.close();
        }
    });
}

test("PIVOTKIT_CLIENT_ID wins over the published client ID", async () => {
    await withWaits(async () => {
        const fake = await fakeIssuer({ published: "reports-cli" });
        const dir = tempDir();
        try {
            const r = await inProcess(["login", "--url", fake.url, "--store", "file"], dir, { PIVOTKIT_CLIENT_ID: "from-env" });
            assert.equal(r.code, 0, r.stderr);
            assert.equal(fake.requests.find((q) => q.url === "/device").body.client_id, "from-env");
        } finally {
            await fake.close();
        }
    });
});
