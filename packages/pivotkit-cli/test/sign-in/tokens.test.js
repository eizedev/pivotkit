// pivotkit token and logout after a sign-in: a fresh access token and the rotated refresh token,
// exit 3 when the sign-in is gone, and the refresh token revoked at the issuer (RFC 7009).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { run, tempDir } from "../helpers.js";
import { storeMeans } from "../../src/credential-store.js";
import { ACCESS, CLIENT, REFRESH, assertClean, envOf, fakeIssuer, inProcess, tokenFile, withWaits } from "./fake-issuer.js";

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
        if (args[0] === "clear") {
            kept.delete("linux");
        }
        return { code: 0, stdout: "" };
    };
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        await withWaits(async () => assert.equal((await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "keychain"], dir)).code, 0));
        const r = await inProcess(["token"], dir);
        assert.equal(kept.has("linux"), false, "the keychain's stale entry is gone");
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

test("logout counts an empty 200 from the revocation endpoint as done (RFC 7009 2.2)", async () => {
    const fake = await fakeIssuer({
        revocation: true,
        hook: ({ req, res }) => {
            if (req.url !== "/revoke") {
                return false;
            }
            res.writeHead(200);
            res.end();
            return true;
        }
    });
    const dir = tempDir();
    try {
        await withWaits(async () => assert.equal((await inProcess(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], dir)).code, 0));
        const r = await inProcess(["logout"], dir);
        assert.equal(r.code, 0, r.stderr);
        assert.match(r.stderr, /The issuer revoked the refresh token\./);
    } finally {
        await fake.close();
    }
});
