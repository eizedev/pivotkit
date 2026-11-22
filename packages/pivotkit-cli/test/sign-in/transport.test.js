// The requests of a sign-in: pivotkit-cli's user agent, no redirect followed, answers capped in size
// and time, https only except an issuer next to a loopback server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, tempDir } from "../helpers.js";
import { signInMeans } from "../../src/sign-in.js";
import { versions } from "../../src/cli.js";
import { CLIENT, envOf, fakeIssuer, inProcess, withWaits } from "./fake-issuer.js";

// #628: the sign-in requests sent Node's default user agent, the REST calls pivotkit-cli's
test("login, token and logout send pivotkit-cli's user agent to the server and the issuer", async () => {
    const fake = await fakeIssuer({ revocation: true });
    const dir = tempDir();
    try {
        assert.equal((await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) })).code, 0);
        assert.equal((await run(["token"], { env: envOf(dir) })).code, 0);
        const out = await run(["logout"], { env: envOf(dir) });
        assert.equal(out.code, 0, out.stderr);
        assert.ok(fake.requests.some((q) => q.url === "/revoke"), "logout revoked the token");
        const agents = new Set(fake.requests.map((q) => q.userAgent));
        assert.deepEqual([...agents], [`pivotkit-cli/${versions()["pivotkit-cli"]}`]);
    } finally {
        await fake.close();
    }
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
    const { checkedUrl } = await import("../../src/sign-in.js");
    assert.equal(checkedUrl("http://127.0.0.1:8080/issuer", "the issuer", true).protocol, "http:");
    assert.throws(() => checkedUrl("http://127.0.0.1:8080/issuer", "the issuer", false), /the issuer is no https:\/\/ address/);
    assert.throws(() => checkedUrl("http://auth.example/issuer", "the issuer", true), /no https:\/\/ address/);
});
