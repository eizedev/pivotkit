// Where a sign-in keeps its refresh token: the keychain tools (macOS security, secret-tool, the Windows
// Credential Manager through PowerShell), which never get the secret as an argument, and the file only
// its owner reads when the keychain cannot keep it. The keychain tools are checked with a stand-in that
// records what they get.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, tempDir } from "../helpers.js";
import { accountOf, credentialStore, storeMeans } from "../../src/credential-store.js";
import { CLIENT, REFRESH, envOf, fakeIssuer, inProcess, tokenFile, withWaits } from "./fake-issuer.js";

/** Removes a test's entry from the Credential Manager whatever the test reached. */
async function keychainCleanup(resource) {
    const { keychainOf } = await import("../../src/credential-store.js");
    await keychainOf()?.remove(accountOf(resource));
}

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
