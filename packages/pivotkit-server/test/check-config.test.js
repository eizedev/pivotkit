// check-config's verdict against what serve really does: a PROBLEM that stops the start is one serve
// refuses, any other PROBLEM is one serve starts with (and says what does not work). Among them:
// missing secrets of the download links' sign-in client, a backend's authentication no source uses,
// an unreachable issuer (a WARNING), no sources, file secrets by their full path, stdio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { checkConfig, serve } from "pivotkit-server";
import { BIN, TOKEN, factsOf, workspace } from "./helpers.js";

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
/** A source at the default summary: closed for delivery. */
const summarized = { file: "data/sales.csv" };
const vms = { http: { url: "https://platform.example.com/v1/vms", rows: "/items", auth: { header: { name: "authorization", value: { env: "PLATFORM_TOKEN" } } } }, policy: { default: "hide", fields: { name: "show" } } };

/** Each case: options, and whether serve refuses it. */
const CASES = [
    // starts: the PROBLEM says what does not work
    { name: "a print template that is not there", options: { sources: { sales: { ...sales, template: "data/brand.html" } } }, stops: false, says: /sources\.sales\.template: brand\.html: not found -> the server starts; html reports of sales fail until it can be read/ },
    { name: "a source file that is not there", options: { sources: { sales, gone: { file: "data/gone.csv" } } }, stops: false, says: /sources\.gone\.file: data\/gone\.csv is not there -> the server starts; gone answers FILE_NOT_AVAILABLE/ },
    { name: "a backend secret that is not set", options: { sources: { vms } }, stops: false, says: /sources\.vms\.http\.auth\.header\.value: \$PLATFORM_TOKEN is not set -> the server starts; vms answers SOURCE_UNAVAILABLE/ },
    { name: "a download key that is not set", options: { sources: { sales }, output: { dir: "out", downloads: { key: { env: "DOWNLOADS_KEY" } } } }, stops: false, says: /output\.downloads\.key: \$DOWNLOADS_KEY is not set -> the server starts; reports get no download links until it can be read/ },
    { name: "an upload header secret that is not set", options: { sources: { sales }, output: { dir: "out", upload: { url: "https://store.example.com/r/{id}/{name}", headers: { authorization: { prefix: "Bearer ", value: { env: "STORE_TOKEN" } } } } } }, stops: false, says: /output\.upload\.headers\.authorization: \$STORE_TOKEN is not set -> the server starts; every upload fails/ },
    { name: "the download links' client secret that cannot be read", options: { sources: { sales }, output: { dir: "out", downloads: { signIn: { clientId: "pivotkit-downloads", clientSecret: { file: "secrets/client-secret" } } } }, auth: OAUTH, http: { publicUrl: "https://reports.example.com" } }, stops: false, says: /output\.downloads\.signIn\.clientSecret: the file secrets\/client-secret cannot be read \(no such file\) -> the server starts; download links \(signed in\) fail after the person signs in/ },
    { name: "an upload target on a loopback address", options: { sources: { sales }, output: { dir: "out", upload: { url: "https://localhost:8443/r/{id}" } } }, stops: false, says: /output\.upload\.url: localhost resolves to \S+, a loopback or private address, which uploads refuse without output\.upload\.intranet: true -> the server starts; every upload fails/ },
    // refused at start
    { name: "an http:// issuer without allowInsecureIssuer", options: { sources: { sales }, auth: { mode: "oauth", issuer: "http://127.0.0.1:9/issuer", resource: "http://127.0.0.1:3333/mcp" } }, stops: true, says: /auth\.issuer: must be an https:\/\/ address \(auth\.allowInsecureIssuer is for tests only\) -> the server does not start/ },
    { name: "a static token that is not set", options: { sources: { sales }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT_TOKEN" }] } }, stops: true, says: /the token bot \(\$BOT_TOKEN\) is not set or shorter than 32 characters -> the server does not start/ },
    { name: "an output.dir that is a file", options: { sources: { sales }, output: { dir: "data/sales.csv" } }, stops: true, says: /output\.dir: not a directory -> the server does not start/ },
    { name: "a short audit key with OAuth", options: { sources: { sales }, auth: OAUTH, audit: { subject: "hash", key: { env: "AUDIT_KEY" } } }, env: { AUDIT_KEY: "short" }, stops: true, says: /audit\.key: at least \d+ characters; make one with: pivotkit-server key new --for audit --file <path> -> the server does not start/ },
    { name: "a print template with an unknown placeholder", options: { sources: { sales: { ...sales, template: "data/brand.html" } } }, files: { "data/brand.html": "<h1>{{titel}}</h1>{{table}}" }, stops: true, says: /sources\.sales\.template: unknown placeholder \{\{titel\}\} \(line 1\); did you mean \{\{title\}\}\? -> the server does not start/ },
    { name: "an issuer whose scheme is HTTP:// in capitals", options: { sources: { sales }, auth: { mode: "oauth", issuer: "HTTP://127.0.0.1:9/issuer", resource: "http://127.0.0.1:3333/mcp" } }, stops: true, says: /auth\.issuer: must be an https:\/\/ address \(auth\.allowInsecureIssuer is for tests only\) -> the server does not start/ },
    { name: "an output.dir with create: false that is not there", options: { sources: { sales }, output: { dir: "later/out", create: false } }, stops: true, says: /output\.dir: not found \(create it first, or leave output\.create on\) -> the server does not start/ },
    { name: "an output.dir below a file", options: { sources: { sales }, output: { dir: "data/sales.csv/out" } }, stops: true, says: /output\.dir: cannot be created: a part of the path is a file -> the server does not start/ },
    { name: "an output.dir inside an allowed directory", options: { sources: { sales }, files: { allowDirs: ["data"] }, output: { dir: "data/out" } }, stops: true, says: /output\.dir: lies inside a directory of files\.allowDirs/ },
    { name: "output.maxAgeDays in the source's directory", options: { sources: { sales }, output: { dir: "data", maxAgeDays: 7 } }, stops: true, says: /output\.maxAgeDays in a directory that holds the configuration or a source, template or token file; give the reports a directory of their own -> the server does not start/ },
    { name: "an address off loopback without auth", options: { sources: { sales }, http: { host: "0.0.0.0" } }, stops: true, says: /0\.0\.0\.0 is not loopback: it needs auth token or oauth \(or auth\.allowUnauthenticated\) -> the server does not start/ }
];

for (const c of CASES) {
    test(`check-config's verdict is what serve does: ${c.name} ${c.stops ? "stops the start" : "starts"}`, async () => {
        const dir = workspace();
        for (const [name, text] of Object.entries(c.files ?? {})) {
            writeFileSync(join(dir, name), text);
        }
        const options = { ...c.options, baseDir: dir };
        const env = { PATH: process.env.PATH ?? "", ...c.env };
        const result = await checkConfig(options, { http: true, env, name: "pivotkit-server", rest: true });
        const text = factsOf(result.text);
        assert.equal(result.problems, 1, result.text);
        assert.equal(result.stops, c.stops ? 1 : 0, result.text);
        assert.match(text, c.says);
        assert.ok(result.text.split("\n")[0].length <= 78, "the verdict is one line a script can read");
        assert.match(text.split("\n")[0], c.stops ? /the server does not start with this configuration\.$/ : /the server starts, but not everything will work\.$/);
        const started = await starts(options, env);
        if (c.stops) {
            assert.ok(started instanceof Error, `serve started, but check-config says it would not:\n${result.text}`);
        } else {
            assert.equal(started, true, `serve refused (${started}), but check-config says it starts:\n${result.text}`);
        }
    });
}

test("an http:// issuer under download sign-in names the key the operator set: auth.issuer when signIn.issuer is left out, signIn.issuer when it is set", async () => {
    const dir = workspace();
    const signIn = { clientId: "pivotkit-downloads", clientSecret: { env: "DL_SECRET" } };
    const env = { PATH: process.env.PATH ?? "", DL_SECRET: "a-client-secret" };
    const variants = [
        { auth: { mode: "oauth", issuer: "http://idp.example.com/o/", resource: "https://reports.example.com/mcp" }, signIn, key: "auth.issuer" },
        { auth: { mode: "oauth", issuer: "https://idp.example.com/o/", resource: "https://reports.example.com/mcp" }, signIn: { ...signIn, issuer: "http://idp.example.com/o/" }, key: "output.downloads.signIn.issuer" }
    ];
    for (const v of variants) {
        const options = { sources: { sales }, auth: v.auth, output: { dir: "out", downloads: { signIn: v.signIn } }, http: { publicUrl: "https://reports.example.com" }, baseDir: dir };
        const said = `${v.key}: must be an https:// address (auth.allowInsecureIssuer is for tests only)`;
        const other = v.key === "auth.issuer" ? "output.downloads.signIn.issuer" : /(^|\s)auth\.issuer: must/;
        // check-config refuses it as serve does (the runner prints the message and exits with 2)
        const checked = await checkConfig(options, { http: true, env, name: "pivotkit-server", rest: true }).then((r) => r.text, (e) => String(e?.message));
        assert.ok(checked.includes(said), checked);
        assert.ok(typeof other === "string" ? !checked.includes(other) : !other.test(checked), checked);
        const started = await starts(options, env);
        assert.ok(started instanceof Error && started.message.includes(said), String(started));
    }
});

test("check-config: an output directory the server cannot write is a PROBLEM the server starts with", { skip: (process.platform === "win32" || process.getuid?.() === 0) && "file modes" }, async () => {
    const dir = workspace();
    chmodSync(join(dir, "out"), 0o500);
    try {
        const options = { sources: { sales }, output: { dir: "out" }, baseDir: dir };
        const result = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server" });
        assert.match(factsOf(result.text), /PROBLEM: output\.dir is not writable by the user \d+ the server runs as -> the server starts; every report fails with NO_OUTPUT/);
        assert.equal(result.stops, 0);
        assert.equal(await starts(options, {}), true);
    } finally {
        chmodSync(join(dir, "out"), 0o700);
    }
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
    assert.match(text, /WARNING \(HTTP sources\): httpSources\.backends\.platform\.auth is not used by any source \(a source with its own http\.auth replaces it\)/);
    assert.match(text, /WARNING \(HTTP sources\): httpSources\.backends\.platform\.auth\.header\.value: \$PLATFORM_TOKEN_MISSING is not set/);
    assert.equal(result.problems, 0, result.text);
});

test("check-config: an issuer whose metadata cannot be loaded is a WARNING; the server starts and keeps trying; a quick answer says nothing", async () => {
    const dir = workspace();
    const options = { sources: { sales }, auth: { mode: "oauth", issuer: "https://auth.example.com/application/o/pivotkit/", resource: "https://reports.example.com/mcp" }, output: { dir: "out", downloads: { signIn: { clientId: "pivotkit-downloads" } } }, http: { publicUrl: "https://reports.example.com" }, baseDir: dir };
    const asked = [];
    const down = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server", discover: async (issuer) => (asked.push(issuer), Promise.reject(new Error("https://auth.example.com/.well-known/oauth-authorization-server/application/o/pivotkit: NETWORK, the connection failed (ENOTFOUND); https://auth.example.com/application/o/pivotkit/.well-known/openid-configuration: NETWORK, the connection failed (ENOTFOUND)"))) });
    assert.deepEqual(asked, ["https://auth.example.com/application/o/pivotkit/"]);
    assert.match(factsOf(down.text), /WARNING \(Auth\): auth\.issuer: the metadata of https:\/\/auth\.example\.com\/application\/o\/pivotkit\/ cannot be loaded from here \(the connection failed: ENOTFOUND\); the server starts and keeps trying; callers get 503 until it loads; download links \(signed in\) answer 503 too/);
    assert.equal(down.problems, 0);
    // one cause, one warning: a name that cannot be looked up is not said a second time; the tried
    // addresses are not printed
    assert.deepEqual(factsOf(down.text).split("\n").filter((l) => l.startsWith("WARNING (Auth): auth.issuer")).length, 1, down.text);
    assert.doesNotMatch(down.text, /well-known/);
    const missing = await checkConfig(options, { http: true, env: {}, discover: async () => Promise.reject(new Error("404 from https://auth.example.com/.well-known/openid-configuration")) });
    assert.match(factsOf(missing.text), /cannot be loaded from here \(the issuer answered 404\); the server starts/);
    const up = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server", discover: async () => ({}) });
    assert.doesNotMatch(factsOf(up.text), /cannot be loaded/);
    // without discover (a library host's call) no issuer is asked
    assert.doesNotMatch(factsOf((await checkConfig(options, { http: true, env: {} })).text), /cannot be loaded/);
});

test("check-config: an issuer that accepts and never answers is a WARNING after 3 s, and the command ends then", async () => {
    // a listener that takes the connection and says nothing
    const held = [];
    const silent = createServer((socket) => held.push(socket));
    await new Promise((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const issuer = `http://127.0.0.1:${/** @type {any} */ (silent.address()).port}/issuer`;
    try {
        const dir = workspace();
        const config = join(dir, "pivotkit.json");
        writeFileSync(config, JSON.stringify({ sources: { sales }, auth: { mode: "oauth", issuer, resource: "http://127.0.0.1:3333/mcp", allowInsecureIssuer: true } }));
        const started = Date.now();
        const run = await new Promise((resolve) => {
            const child = spawn(process.execPath, [BIN, "check-config", "--config", config], { cwd: dir, env: { PATH: process.env.PATH ?? "" } });
            let stdout = "";
            child.stdout.on("data", (c) => (stdout += c));
            child.on("close", (status) => resolve({ status, stdout }));
        });
        const took = Date.now() - started;
        assert.match(factsOf(run.stdout), /WARNING \(Auth\): auth\.issuer: the metadata of http:\/\/127\.0\.0\.1:\d+\/issuer cannot be loaded from here \(no answer within 3 s\); the server starts and keeps trying; callers get 503 until it loads/);
        assert.equal(run.status, 0, run.stdout);
        assert.ok(took < 8000, `check-config took ${took} ms`); // wall time: event latency (a child process and the issuer's 3 s)
    } finally {
        for (const socket of held) socket.destroy();
        silent.close();
    }
    // a discover that never settles and ignores the signal: the wait still ends
    const options = { sources: { sales }, auth: { mode: "oauth", issuer: "https://auth.example.com/", resource: "https://reports.example.com/mcp" }, baseDir: workspace() };
    const stuck = await checkConfig(options, { http: true, env: {}, discover: () => new Promise(() => undefined) });
    assert.match(factsOf(stuck.text), /cannot be loaded from here \(no answer within 3 s\)/);
});

test("check-config: every warning is listed after the problems, named by its own heading, also when a section prints two (Delivery: and Retention:)", async () => {
    const dir = workspace();
    const options = { sources: { sales, summarized, open: { file: "data/sales.csv", policy: { default: "show" } } }, output: { dir: "out", maxAgeDays: 0 }, baseDir: dir };
    const result = await checkConfig(options, { http: true, env: {}, name: "pivotkit-server" });
    const lines = factsOf(result.text).split("\n");
    assert.equal(result.warnings, 3);
    // right after the counts (no problems here): the warnings, each with its heading (sales hides a
    // field under default show: a deny list)
    assert.deepEqual(lines.slice(1, 6), [
        "0 problems, 3 warnings.",
        "",
        'WARNING (Sources): sources.sales.policy: "show" by default with hidden fields is a deny list: a column the data gains later is shown unless someone hides it; prefer "hide" by default and give the fields to show the level show',
        "WARNING (Delivery): output.downloads.key is not set: links stop working on a restart and on another replica",
        "WARNING (Retention): output.maxAgeDays is 0 (no age limit) and reports over closed sources (sales, summarized) and data sent in requests can hold data about people; leave out output.maxAgeDays (the default deletes reports after 30 days) or set a number of days"
    ]);
    // and not again inside the sections
    assert.equal(lines.filter((l) => l.includes("WARNING")).length, 3);
    assert.ok(lines.includes("Retention:"), result.text);
});

test("check-config: the MCP and the REST audience, each on its line where they differ; one audience where REST is not served", async () => {
    const options = { sources: { sales }, auth: { mode: "oauth", issuer: "https://auth.example.com/", resource: "https://reports.example.com/mcp" }, baseDir: workspace() };
    const both = factsOf((await checkConfig(options, { http: true, env: {}, rest: true })).text);
    assert.match(both, /\n {2}MCP audience: https:\/\/reports\.example\.com\/mcp\n {2}REST audience: https:\/\/reports\.example\.com\/api\/v1\n/);
    const own = factsOf((await checkConfig({ ...options, rest: { audience: ["api://reports"] } }, { http: true, env: {}, rest: true })).text);
    assert.match(own, /\n {2}REST audience: api:\/\/reports\n/);
    const mcpOnly = factsOf((await checkConfig(options, { http: true, env: {} })).text);
    assert.doesNotMatch(mcpOnly, /REST audience|MCP audience/);
});

test("check-config: no configuration read and no source given says so", async () => {
    const result = await checkConfig({}, { http: true, env: {}, name: "pivotkit-server" });
    assert.match(factsOf(result.text), /\nWARNING \(Sources\): no sources and no files by path: callers can use only data they send in a request; name a configuration file \(--config or \$PIVOTKIT_CONFIG\) or a source \(--source id=file\)/);
    assert.equal(result.problems, 0);
});

test("check-config: secret files are named as written and by their full path, never with their value", async () => {
    const dir = workspace();
    mkdirSync(join(dir, "secrets"));
    writeFileSync(join(dir, "secrets", "key"), `${"k".repeat(64)}\n`, { mode: 0o600 });
    writeFileSync(join(dir, "secrets", "client"), "the-client-secret-value\n", { mode: 0o600 });
    const options = { sources: { summarized }, auth: { mode: "oauth", issuer: "https://auth.example.com/", resource: "https://reports.example.com/mcp" }, http: { publicUrl: "https://reports.example.com" }, output: { dir: "out", downloads: { key: { file: "secrets/key" }, signIn: { clientId: "pivotkit-downloads", clientSecret: { file: "secrets/client" } } } }, baseDir: dir };
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

test("check-config: the REST section names the service's and the OpenAPI document's full address, the document at the server's root", async () => {
    const dir = workspace();
    const options = { sources: { sales }, output: { dir: "out" }, auth: { mode: "token" }, baseDir: dir };
    const lines = async (extra) => factsOf((await checkConfig({ ...options, ...extra }, { http: true, env: { PIVOTKIT_TOKEN: TOKEN }, name: "pivotkit-server", rest: true })).text).split("\n");
    const named = await lines({ http: { publicUrl: "https://reports.example.com/" } });
    assert.ok(named.includes("REST: https://reports.example.com/api/v1"), named.join("\n"));
    assert.ok(named.includes("  OpenAPI document: https://reports.example.com/openapi.json; needs auth"), named.join("\n"));
    const unnamed = await lines({ rest: { openapi: "public" } });
    assert.ok(unnamed.includes("REST: /api/v1"), unnamed.join("\n"));
    assert.ok(unnamed.includes("  OpenAPI document: /openapi.json, at the server's root; public"), unnamed.join("\n"));
    const off = await lines({ rest: { openapi: "off" }, http: { publicUrl: "https://reports.example.com" } });
    assert.ok(off.includes("  OpenAPI document: off"), off.join("\n"));
    assert.ok(!named.concat(unnamed, off).some((l) => l.includes("/api/v1/openapi.json")));
});

test("check-config and serve name every value out of its range at once, each on a line of its own; one alone gives one line", async () => {
    const { run } = await import("../src/runner.js");
    const dir = workspace();
    const config = (options) => {
        const file = join(dir, "pivotkit.json");
        writeFileSync(file, JSON.stringify({ sources: { sales }, output: { dir: "out" }, ...options }));
        return file;
    };
    const ranged = {
        rest: { records: { maxRows: 0, concurrency: 99 } },
        compute: { workers: 0 },
        auth: { signedTokens: { dir: "signed", maxDays: 400 }, mode: "token" },
        mcp: { data: { rows: 0 } },
        sources: { sales: { ...sales, records: { maxRows: 0 } } }
    };
    for (const command of ["check-config", "serve"]) {
        const out = [];
        const io = { env: { PIVOTKIT_TOKEN: TOKEN }, stdout: { write: (t) => out.push(t) }, stderr: { write: (t) => out.push(t) } };
        assert.equal(await run([command, "--config", config(ranged), "--log-format", "text"], io), 2, out.join(""));
        const text = out.join("");
        assert.match(text, /6 problems in the configuration:/, text);
        for (const line of ["compute.workers: must be 1 or more", "rest.records.maxRows: from 1 to 10000000", "rest.records.concurrency: from 1 to 64", "sources.sales.records.maxRows: 1 or more", "auth.signedTokens.maxDays: 1 to 365", "mcp.data.rows: must be 1 or more"]) {
            assert.ok(text.includes(`\n  ${line}`), `${command} names ${line}: ${text}`);
        }
    }
    // a rule between keys never runs on a value out of its range: one line each
    const only = async (options, lines) => {
        const said = [];
        const io = { env: {}, stdout: { write: (t) => said.push(t) }, stderr: { write: (t) => said.push(t) } };
        assert.equal(await run(["check-config", "--config", config(options)], io), 2);
        assert.equal(said.join(""), lines.length === 1 ? `pivotkit-server: ${lines[0]}\n` : `pivotkit-server: ${lines.length} problems in the configuration:\n${lines.map((l) => `  ${l}\n`).join("")}`);
    };
    await only({ compute: { timeMs: 0 }, rest: { records: { writeMs: 5000 } } }, ["compute.timeMs: must be 1 or more"]);
    await only({ rest: { records: { writeMs: 1 } } }, ["rest.records.writeMs: from 1000 to 600000"]);
    await only({ rest: { records: { maxRows: 0 } }, sources: { sales: { ...sales, records: { maxRows: 20 } } } }, ["rest.records.maxRows: from 1 to 10000000"]);
    await only({ output: { dir: "out", upload: { url: "https://store.example.com/{name}", timeMs: 1 } }, rest: { records: { concurrency: 99 } } }, ["output.upload.timeMs: from 1000 to 600000 (10 minutes)", "rest.records.concurrency: from 1 to 64"]);
    // a broken rule of another kind stops the check, with the numbers found before it
    await only({ compute: { workers: 0 }, output: { dir: "out", baseUrl: "https://files.example.com/", downloads: { enabled: true } } }, ["compute.workers: must be 1 or more", "output.downloads.enabled: true next to output.baseUrl: choose one (the server's own links, or the web server at output.baseUrl)"]);
    // a single problem keeps its one line
    const out = [];
    const io = { env: {}, stdout: { write: (t) => out.push(t) }, stderr: { write: (t) => out.push(t) } };
    assert.equal(await run(["check-config", "--config", config({ rest: { records: { maxRows: 0 } } })], io), 2);
    assert.equal(out.join(""), "pivotkit-server: rest.records.maxRows: from 1 to 10000000\n");
});
