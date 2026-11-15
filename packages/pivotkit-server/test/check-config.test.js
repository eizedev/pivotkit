// check-config's verdict against what serve really does: a PROBLEM that stops the start is one serve
// refuses, any other PROBLEM is one serve starts with (and says what does not work). The checks of
// #424: missing secrets of the download links' sign-in client, a backend's authentication no source
// uses, an unreachable issuer (a WARNING), no sources, file secrets by their full path, stdio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkConfig, serve } from "pivotkit-server";
import { TOKEN, factsOf, workspace } from "./helpers.js";

/** A test issuer nothing listens on: the start loads its metadata in the background and keeps trying. */
const ISSUER = "http://127.0.0.1:9/issuer";
const OAUTH = { mode: "oauth", issuer: ISSUER, resource: "http://127.0.0.1:3333/mcp", allowInsecureIssuer: true };

/** Starts the server on a free port with these options; true when it started (then stopped), else the error. */
async function starts(options, env) {
    try {
        const server = await serve({ ...options, http: { ...options.http, port: 0 } }, { env, stderr: { write: () => true } });
        await server.close();
        return true;
    } catch (e) {
        return /** @type {Error} */ (e);
    }
}

const sales = { file: "data/sales.csv", policy: { default: "show", fields: { Customer: "hide" } } };
const vms = { http: { url: "https://platform.example.com/v1/vms", rows: "/items", auth: { header: { name: "authorization", value: { env: "PLATFORM_TOKEN" } } } }, policy: { default: "hide", fields: { name: "show" } } };

/** Each case: options, and whether serve refuses it. */
const CASES = [
    // starts: the PROBLEM says what does not work
    { name: "a source file that is not there", options: { sources: { sales, gone: { file: "data/gone.csv" } } }, stops: false, says: /sources\.gone\.file: data\/gone\.csv is not there -> the server starts; gone answers FILE_NOT_AVAILABLE/ },
    { name: "a backend secret that is not set", options: { sources: { vms } }, stops: false, says: /sources\.vms\.http\.auth\.header\.value: \$PLATFORM_TOKEN is not set -> the server starts; vms answers SOURCE_UNAVAILABLE/ },
    { name: "a download key that is not set", options: { sources: { sales }, output: { dir: "out", downloads: { key: { env: "DOWNLOADS_KEY" } } } }, stops: false, says: /output\.downloads\.key: \$DOWNLOADS_KEY is not set -> the server starts; reports get no download links until it can be read/ },
    { name: "an upload header secret that is not set", options: { sources: { sales }, output: { dir: "out", upload: { url: "https://store.example.com/r/{id}/{name}", headers: { authorization: { prefix: "Bearer ", value: { env: "STORE_TOKEN" } } } } } }, stops: false, says: /output\.upload\.headers\.authorization: \$STORE_TOKEN is not set -> the server starts; every upload fails/ },
    { name: "the download links' client secret that cannot be read", options: { sources: { sales }, output: { dir: "out", downloads: { signIn: { clientId: "pivotkit-downloads", clientSecret: { file: "secrets/client-secret" } } } }, auth: OAUTH, http: { publicUrl: "https://reports.example.com" } }, stops: false, says: /output\.downloads\.signIn\.clientSecret: the file secrets\/client-secret cannot be read \(no such file\) -> the server starts; download links \(signed in\) fail after the person signs in/ },
    // refused at start
    { name: "a static token that is not set", options: { sources: { sales }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT_TOKEN" }] } }, stops: true, says: /the token bot \(\$BOT_TOKEN\) is not set or shorter than 32 characters -> the server does not start/ },
    { name: "an output.dir that is a file", options: { sources: { sales }, output: { dir: "data/sales.csv" } }, stops: true, says: /output\.dir: not a directory -> the server does not start/ },
    { name: "a short audit key with OAuth", options: { sources: { sales }, auth: OAUTH, audit: { subject: "hash", key: { env: "AUDIT_KEY" } } }, env: { AUDIT_KEY: "short" }, stops: true, says: /audit\.key: at least \d+ characters -> the server does not start/ },
    { name: "an address off loopback without auth", options: { sources: { sales }, http: { host: "0.0.0.0" } }, stops: true, says: /0\.0\.0\.0 is not loopback: it needs auth token or oauth \(or auth\.allowUnauthenticated\) -> the server does not start/ }
];

for (const c of CASES) {
    test(`check-config's verdict is what serve does: ${c.name} ${c.stops ? "stops the start" : "starts"}`, async () => {
        const dir = workspace();
        const options = { ...c.options, baseDir: dir };
        const env = { PATH: process.env.PATH ?? "", ...c.env };
        const result = await checkConfig(options, { http: true, env, name: "pivotkit-server", rest: true });
        const text = factsOf(result.text);
        assert.equal(result.problems, 1, result.text);
        assert.equal(result.stops, c.stops ? 1 : 0, result.text);
        assert.match(text, c.says);
        assert.match(text.split("\n")[0], c.stops ? /the server would not start with it as it is\.$/ : /the server starts, but not everything will work\.$/);
        const started = await starts(options, env);
        if (c.stops) {
            assert.ok(started instanceof Error, `serve started, but check-config says it would not:\n${result.text}`);
        } else {
            assert.equal(started, true, `serve refused (${started}), but check-config says it starts:\n${result.text}`);
        }
    });
}

test("check-config: an output directory the server cannot write is a PROBLEM the server starts with", { skip: (process.platform === "win32" || process.getuid?.() === 0) && "file modes" }, async () => {
    const dir = workspace();
    chmodSync(join(dir, "out"), 0o500);
    const options = { sources: { sales }, output: { dir: "out" }, baseDir: dir };
    const result = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server" });
    assert.match(factsOf(result.text), /PROBLEM: output\.dir is not writable by the user \d+ the server runs as -> the server starts; every report fails with NO_OUTPUT/);
    assert.equal(result.stops, 0);
    assert.equal(await starts(options, {}), true);
    chmodSync(join(dir, "out"), 0o700);
});

test("check-config: a backend's authentication no source uses is a WARNING, its missing secret too, never a PROBLEM", async () => {
    const dir = workspace();
    const options = {
        sources: { vms: { http: { backend: "platform", path: "/vms", rows: "/items", auth: { header: { name: "authorization", value: { env: "OWN_TOKEN" } } } }, policy: { default: "hide" } } },
        httpSources: { backends: { platform: { url: "https://platform.example.com/v1", auth: { header: { name: "authorization", value: { env: "PLATFORM_TOKEN_MISSING" } } } } } },
        baseDir: dir
    };
    const result = await checkConfig(options, { http: true, env: { OWN_TOKEN: TOKEN }, name: "pivotkit-server" });
    const text = factsOf(result.text);
    assert.match(text, /WARNING: httpSources\.backends\.platform\.auth is not used by any source \(a source with its own http\.auth replaces it\)/);
    assert.match(text, /WARNING: httpSources\.backends\.platform\.auth\.header\.value: \$PLATFORM_TOKEN_MISSING is not set/);
    assert.equal(result.problems, 0, result.text);
});

test("check-config: an issuer whose metadata cannot be loaded is a WARNING; the server starts and keeps trying; a quick answer says nothing", async () => {
    const dir = workspace();
    const options = { sources: { sales }, auth: { mode: "oauth", issuer: "https://auth.example.com/application/o/pivotkit/", resource: "https://reports.example.com/mcp" }, output: { dir: "out", downloads: { signIn: { clientId: "pivotkit-downloads" } } }, http: { publicUrl: "https://reports.example.com" }, baseDir: dir };
    const asked = [];
    const down = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server", discover: async (issuer) => (asked.push(issuer), Promise.reject(new Error("fetch failed (ENOTFOUND); fetch failed (ENOTFOUND)"))) });
    assert.deepEqual(asked, ["https://auth.example.com/application/o/pivotkit/"]);
    assert.match(factsOf(down.text), /WARNING: auth\.issuer: the metadata of https:\/\/auth\.example\.com\/application\/o\/pivotkit\/ cannot be loaded from here \(fetch failed \(ENOTFOUND\)\); the server starts and keeps trying; callers get 503 until it loads; download links \(signed in\) answer 503 too/);
    assert.equal(down.problems, 0);
    const up = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server", discover: async () => ({}) });
    assert.doesNotMatch(up.text, /cannot be loaded/);
    // without discover (a library host's call) no issuer is asked
    assert.doesNotMatch((await checkConfig(options, { http: true, env: {} })).text, /cannot be loaded/);
});

test("check-config: no configuration read and no source given says so", async () => {
    const result = await checkConfig({}, { http: true, env: {}, name: "pivotkit-server" });
    assert.match(factsOf(result.text), /Sources \(0\):\n {2}WARNING: no sources and no files by path: callers can use only data they send in a request; name a configuration file \(--config or \$PIVOTKIT_CONFIG\) or a source \(--source id=file\)/);
    assert.equal(result.problems, 0);
});

test("check-config: secret files are named as written and by their full path, never with their value", async () => {
    const dir = workspace();
    mkdirSync(join(dir, "secrets"));
    writeFileSync(join(dir, "secrets", "key"), `${"k".repeat(64)}\n`, { mode: 0o600 });
    writeFileSync(join(dir, "secrets", "client"), "the-client-secret-value\n", { mode: 0o600 });
    const options = { sources: { sales }, auth: { mode: "oauth", issuer: "https://auth.example.com/", resource: "https://reports.example.com/mcp" }, http: { publicUrl: "https://reports.example.com" }, output: { dir: "out", downloads: { key: { file: "secrets/key" }, signIn: { clientId: "pivotkit-downloads", clientSecret: { file: "secrets/client" } } } }, baseDir: dir };
    const text = factsOf((await checkConfig(options, { http: true, env: {}, name: "pivotkit-server" })).text);
    assert.ok(text.includes(`key from the file secrets/key (${join(dir, "secrets", "key")})`), text);
    assert.ok(text.includes(`client secret from the file secrets/client (${join(dir, "secrets", "client")})`), text);
    assert.doesNotMatch(text, /kkkk|the-client-secret-value/);
});

test("check-config over stdio: no download links and no signed-in person, with the sources that need one", async () => {
    const dir = workspace();
    const options = { sources: { sales, mine: { http: { url: "https://platform.example.com/v1/{customer}/vms", rows: "/items" }, params: { customer: { type: "string", claim: "customer", required: true, pattern: "^[a-z0-9-]{1,40}$" } }, policy: { default: "hide" } } }, auth: OAUTH, output: { dir: "out" }, baseDir: dir };
    const text = factsOf((await checkConfig(options, { http: false, env: {} })).text);
    assert.match(text, /\nTransport: stdio \(with --http: 127\.0\.0\.1:3333\)\n {2}no download links: a report is a file in output\.dir\n {2}no signed-in person: mine cannot be used \(they need one\)\n/);
    assert.doesNotMatch(text, /Delivery:/);
});
