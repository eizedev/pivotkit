// The commands that make credentials (src/credentials.js, src/secret-file.js) as an operator runs
// them: `token new`, `token show` and `key new`, spawned like the container image runs them. The
// files they write, what they refuse, `--add` on a configuration file, the JSON contract, and a round
// trip through a running server. Mode bits and symbolic links are POSIX facts: those assertions are
// left out on Windows, where CI runs the rest of this file too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "pivotkit-server";
import { BIN, call, restServer, tempDir, workspace, BY_REGION } from "./helpers.js";

const POSIX = process.platform !== "win32";

/** The command as a person runs it, without a terminal and without $PIVOTKIT_CONFIG unless given. */
const run = (args, { env = {}, cwd } = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env }, timeout: 30_000 });

/** The same, not waiting: for runs at the same time. */
const runAsync = (args, { cwd } = {}) =>
    new Promise((resolve) => {
        const child = spawn(process.execPath, [BIN, ...args], { cwd, env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" } });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c) => (stdout += c));
        child.stderr.on("data", (c) => (stderr += c));
        child.on("exit", (status) => resolve({ status, stdout, stderr }));
    });

/** A token as `token new` makes it: 32 random bytes in base64url. */
const TOKEN_TEXT = /^[A-Za-z0-9_-]{43}$/;
/** A key as `key new` makes it: 48 random bytes in base64url. */
const KEY_TEXT = /^[A-Za-z0-9_-]{64}$/;

/** The file's text, which must be the value and one LF, ASCII only (no BOM, no UTF-16). */
function fileValue(path) {
    const bytes = readFileSync(path);
    assert.ok(bytes.every((b) => b < 0x80), "ASCII only");
    const text = bytes.toString("utf8");
    assert.ok(text.endsWith("\n") && !text.endsWith("\r\n") && text.indexOf("\n") === text.length - 1, "one line ending in LF");
    return text.slice(0, -1);
}

/** Temporary files a write left in a directory. */
const tempFiles = (dir) => readdirSync(dir).filter((n) => n.endsWith(".tmp"));

test("token new prints only the value on stdout; key new makes a longer one; both differ every time", () => {
    const a = run(["token", "new"]);
    assert.equal(a.status, 0, a.stderr);
    assert.match(a.stdout, /^[A-Za-z0-9_-]{43}\n$/);
    // no terminal: no hints, nothing else on either stream
    assert.equal(a.stderr, "");
    const b = run(["token", "new"]);
    assert.notEqual(a.stdout, b.stdout);
    const key = run(["key", "new", "--for", "downloads"]);
    assert.equal(key.status, 0, key.stderr);
    assert.match(key.stdout, /^[A-Za-z0-9_-]{64}\n$/);
    assert.equal(key.stderr, "");
    // $PIVOTKIT_CONFIG naming a file that is not there (the container image's) does not matter
    const inImage = run(["token", "new"], { env: { PIVOTKIT_CONFIG: "/config/pivotkit.json" } });
    assert.equal(inImage.status, 0, inImage.stderr);
    assert.match(inImage.stdout, /^[A-Za-z0-9_-]{43}\n$/);
});

test("token new --file writes the value with mode 0600 and LF, prints nothing unless --print", () => {
    const dir = tempDir();
    const file = join(dir, "reports.token");
    const r = run(["token", "new", "--file", file]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
    assert.match(fileValue(file), TOKEN_TEXT);
    if (POSIX) {
        assert.equal(statSync(file).mode & 0o777, 0o600);
    }
    const printed = run(["token", "new", "--file", join(dir, "other.token"), "--print"]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(printed.stdout, `${fileValue(join(dir, "other.token"))}\n`);
    const key = run(["key", "new", "--for", "audit", "--file", join(dir, "audit.key")]);
    assert.equal(key.status, 0, key.stderr);
    assert.equal(key.stdout, "");
    assert.match(fileValue(join(dir, "audit.key")), KEY_TEXT);
    assert.deepEqual(tempFiles(dir), []);
});

test("an existing file is not replaced without --force; --force replaces it; --if-missing keeps it", () => {
    const dir = tempDir();
    const file = join(dir, "reports.token");
    assert.equal(run(["token", "new", "--file", file]).status, 0);
    const first = fileValue(file);
    const again = run(["token", "new", "--file", file]);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /reports\.token.*already there.*--force.*--if-missing/s);
    assert.ok(!again.stderr.includes(first), "the value is never in a message");
    assert.equal(fileValue(file), first);
    const kept = run(["token", "new", "--file", file, "--if-missing", "--print"]);
    assert.equal(kept.status, 0, kept.stderr);
    assert.equal(kept.stdout, `${first}\n`, "--print gives the value in the file");
    const forced = run(["token", "new", "--file", file, "--force"]);
    assert.equal(forced.status, 0, forced.stderr);
    const second = fileValue(file);
    assert.notEqual(second, first);
    assert.match(second, TOKEN_TEXT);
    // a warning goes to stderr: clients still on the old value get 401
    assert.match(forced.stderr, /401/);
    assert.ok(!forced.stderr.includes(second) && !forced.stderr.includes(first));
    if (POSIX) {
        assert.equal(statSync(file).mode & 0o777, 0o600);
    }
    assert.deepEqual(tempFiles(dir), []);
    // --force and --if-missing together, and --if-missing without a file, are usage errors
    assert.equal(run(["token", "new", "--file", file, "--force", "--if-missing"]).status, 2);
    assert.equal(run(["token", "new", "--if-missing"]).status, 2);
});

test("--if-missing refuses a kept file the server could not use, and makes a kept file its owner's only", { skip: !POSIX && "mode bits are POSIX" }, () => {
    const dir = tempDir();
    const file = join(dir, "short.token");
    writeFileSync(file, "too-short\n", { mode: 0o644 });
    const r = run(["token", "new", "--file", file, "--if-missing"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /short\.token.*not a usable token/s);
    assert.ok(!r.stderr.includes("too-short"));
    const good = join(dir, "good.token");
    writeFileSync(good, "a-test-token-that-is-long-enough-0123456789\n", { mode: 0o644 });
    const k = run(["token", "new", "--file", good, "--if-missing"]);
    assert.equal(k.status, 0, k.stderr);
    assert.equal(statSync(good).mode & 0o777, 0o600);
    assert.equal(fileValue(good), "a-test-token-that-is-long-enough-0123456789");
    // a key below the download key's 32 bytes is refused as well
    const weak = join(dir, "weak.key");
    writeFileSync(weak, "0123456789abcdef0123\n", { mode: 0o600 });
    assert.equal(run(["key", "new", "--for", "downloads", "--file", weak, "--if-missing"]).status, 1);
});

test("a symbolic link, a directory and a missing directory are refused, never written through", { skip: !POSIX && "symbolic links need rights on Windows" }, () => {
    const dir = tempDir();
    const target = join(dir, "elsewhere.txt");
    writeFileSync(target, "keep me\n");
    const link = join(dir, "linked.token");
    symlinkSync(target, link);
    for (const extra of [[], ["--force"], ["--if-missing"]]) {
        const r = run(["token", "new", "--file", link, ...extra]);
        assert.equal(r.status, 1, extra.join(" "));
        assert.match(r.stderr, /symbolic link/);
    }
    assert.equal(readFileSync(target, "utf8"), "keep me\n");
    mkdirSync(join(dir, "adir"));
    const d = run(["token", "new", "--file", join(dir, "adir"), "--force"]);
    assert.equal(d.status, 1);
    assert.match(d.stderr, /a directory/);
    const missing = run(["token", "new", "--file", join(dir, "nope", "reports.token")]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /directory.*does not exist/);
    assert.deepEqual(tempFiles(dir), []);
});

test("a directory the user cannot write says so (READ_ONLY in --json)", { skip: (!POSIX || process.getuid?.() === 0) && "needs a POSIX user that is not root" }, () => {
    const dir = tempDir();
    const locked = join(dir, "locked");
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    try {
        const r = run(["token", "new", "--file", join(locked, "reports.token"), "--json"]);
        assert.equal(r.status, 1);
        const out = JSON.parse(r.stdout);
        assert.equal(out.ok, false);
        assert.equal(out.error.code, "READ_ONLY");
        assert.match(out.error.message, /cannot write/);
    } finally {
        chmodSync(locked, 0o700);
    }
});

test("--json: one object on stdout as pivotkit-cli's contract; the value only without --file or with --print", () => {
    const dir = tempDir();
    const plain = run(["token", "new", "--json"]);
    assert.equal(plain.status, 0, plain.stderr);
    const a = JSON.parse(plain.stdout);
    assert.deepEqual([a.ok, a.exitCode, a.command], [true, 0, "token new"]);
    assert.match(a.token, TOKEN_TEXT);
    const file = join(dir, "reports.token");
    const written = JSON.parse(run(["token", "new", "--file", file, "--json"]).stdout);
    assert.deepEqual([written.ok, written.exitCode, written.created, written.token], [true, 0, true, undefined]);
    assert.equal(written.file, file);
    const printed = JSON.parse(run(["token", "new", "--file", file, "--if-missing", "--print", "--json"]).stdout);
    assert.deepEqual([printed.ok, printed.created, printed.token], [true, false, fileValue(file)]);
    const refused = run(["token", "new", "--file", file, "--json"]);
    assert.equal(refused.status, 1);
    const e = JSON.parse(refused.stdout);
    assert.deepEqual([e.ok, e.exitCode, e.command, e.error.kind, e.error.code], [false, 1, "token new", "io", "EXISTS"]);
    assert.equal(e.token, undefined);
    assert.ok(!refused.stdout.includes(fileValue(file)));
    const usage = run(["token", "new", "--bogus", "--json"]);
    assert.equal(usage.status, 2);
    const u = JSON.parse(usage.stdout);
    assert.deepEqual([u.ok, u.exitCode, u.error.kind], [false, 2, "usage"]);
    const key = JSON.parse(run(["key", "new", "--for", "downloads", "--json"]).stdout);
    assert.deepEqual([key.ok, key.command, key.for], [true, "key new", "downloads"]);
    assert.match(key.key, KEY_TEXT);
    // the file is UTF-8 without BOM whatever the platform (PowerShell 5.1 would write UTF-16 with ">")
    assert.equal(readFileSync(file)[0], fileValue(file).charCodeAt(0));
});

test("key new: at least 32 bytes, and check-config passes with it as the download key", () => {
    const dir = workspace();
    const key = join(dir, "download.key");
    const r = run(["key", "new", "--for", "downloads", "--file", key]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(Buffer.byteLength(fileValue(key)) >= 32);
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", downloads: { key: { file: "download.key" } } } }));
    const check = run(["check-config", "--config", config]);
    assert.equal(check.status, 0, check.stdout);
    assert.doesNotMatch(check.stdout, /download.*key.*(PROBLEM|shorter)/i);
    // --for is required and checked
    assert.equal(run(["key", "new"]).status, 2);
    const wrong = run(["key", "new", "--for", "download"]);
    assert.equal(wrong.status, 2);
    assert.match(wrong.stderr, /did you mean "downloads"/);
});

test("--add: a backup, the indentation kept, a relative path; a duplicate name and an unknown profile refused", () => {
    const dir = workspace();
    mkdirSync(join(dir, "secrets"));
    const config = join(dir, "pivotkit.json");
    const original = `{\n    "sources": { "sales": { "file": "data/sales.csv" } },\n    "output": { "dir": "out" },\n    "policy": { "profiles": { "export": { "results": true } } }\n}\n`;
    writeFileSync(config, original, { mode: 0o640 });
    const r = run(["token", "new", "--file", join(dir, "secrets", "reports.token"), "--config", config, "--add", "--name", "reports", "--profile", "export", "--scope", "sales"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
    const text = readFileSync(config, "utf8");
    assert.match(text, /\n {4}"auth": \{\n {8}"mode": "token"/, "four spaces as before");
    const options = JSON.parse(text);
    assert.deepEqual(options.auth.tokens, [{ name: "reports", file: "secrets/reports.token", scopes: ["sales"], profile: "export" }]);
    assert.equal(readFileSync(`${config}.bak`, "utf8"), original);
    if (POSIX) {
        assert.equal(statSync(config).mode & 0o777, 0o640, "the configuration's mode kept");
    }
    // a second token: the next backup, the first token kept
    assert.equal(run(["token", "new", "--file", join(dir, "secrets", "ci.token"), "--config", config, "--add", "--name", "ci"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(config, "utf8")).auth.tokens.map((t) => t.name), ["reports", "ci"]);
    assert.ok(existsSync(`${config}.bak.1`));
    const before = readFileSync(config, "utf8");
    // a name already there, a profile that is not, an unknown scope's syntax: nothing written
    const dup = run(["token", "new", "--file", join(dir, "secrets", "x.token"), "--config", config, "--add", "--name", "reports"]);
    assert.equal(dup.status, 2);
    assert.match(dup.stderr, /"reports" is already in auth\.tokens/);
    const profile = run(["token", "new", "--file", join(dir, "secrets", "y.token"), "--config", config, "--add", "--name", "y", "--profile", "exprot"]);
    assert.equal(profile.status, 2);
    assert.match(profile.stderr, /did you mean "export"/);
    assert.equal(readFileSync(config, "utf8"), before);
    assert.ok(!existsSync(join(dir, "secrets", "x.token")) && !existsSync(join(dir, "secrets", "y.token")), "no file written for a refused entry");
    // a file inside output.dir is refused (the server prunes and serves that directory)
    const inOut = run(["token", "new", "--file", join(dir, "out", "z.token"), "--config", config]);
    assert.equal(inOut.status, 2);
    assert.match(inOut.stderr, /output\.dir/);
    // --add needs --config and --file
    assert.equal(run(["token", "new", "--add", "--file", join(dir, "secrets", "w.token")]).status, 2);
    assert.equal(run(["token", "new", "--add", "--config", config]).status, 2);
    assert.deepEqual(tempFiles(dir), []);
    assert.deepEqual(tempFiles(join(dir, "secrets")), []);
});

test("round trip: token new --add, the server takes it with its profile, --force rotates it without a restart", async () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, output: { dir: "out" }, policy: { profiles: { export: { results: true } } } }, null, 2));
    const file = join(dir, "export.token");
    const made = run(["token", "new", "--file", file, "--config", config, "--add", "--name", "export", "--profile", "export"]);
    assert.equal(made.status, 0, made.stderr);
    const check = run(["check-config", "--config", config]);
    assert.equal(check.status, 0, check.stdout);
    const server = await restServer(await loadConfig(config));
    try {
        const token = fileValue(file);
        const body = { source: "sales", view: BY_REGION, format: "csv" };
        assert.equal((await call(`${server.api}/sources`)).status, 401);
        assert.equal((await call(`${server.api}/sources`, { token })).status, 200);
        assert.equal((await call(`${server.api}/views/render/file`, { token, body })).status, 200, "the profile export may download");
        const shown = run(["token", "show", "export", "--config", config]);
        assert.equal(shown.status, 0, shown.stderr);
        assert.equal(shown.stdout, `${token}\n`);
        const rotated = run(["token", "new", "--file", file, "--force"]);
        assert.equal(rotated.status, 0, rotated.stderr);
        const next = fileValue(file);
        assert.equal((await call(`${server.api}/sources`, { token })).status, 401, "the old value is cut off");
        assert.equal((await call(`${server.api}/sources`, { token: next })).status, 200, "the new one works without a restart");
    } finally {
        await server.close();
    }
});

test("token show: the value of a configured token; 1 when it cannot be used, 2 for an unknown name", () => {
    const dir = tempDir();
    const config = join(dir, "pivotkit.json");
    writeFileSync(join(dir, "good.token"), "a-test-token-that-is-long-enough-0123456789\n");
    writeFileSync(join(dir, "short.token"), "short\n");
    writeFileSync(config, JSON.stringify({ auth: { mode: "token", tokens: [{ name: "good", file: "good.token" }, { name: "short", file: "short.token" }, { name: "gone", file: "gone.token" }, { name: "byenv", env: "BYENV_TOKEN" }] } }));
    const good = run(["token", "show", "good", "--config", config]);
    assert.equal(good.status, 0, good.stderr);
    assert.equal(good.stdout, "a-test-token-that-is-long-enough-0123456789\n");
    // $PIVOTKIT_CONFIG is the default for show
    assert.equal(run(["token", "show", "good"], { env: { PIVOTKIT_CONFIG: config } }).stdout, good.stdout);
    for (const name of ["short", "gone", "byenv"]) {
        const r = run(["token", "show", name, "--config", config]);
        assert.equal(r.status, 1, name);
        assert.equal(r.stdout, "");
    }
    assert.equal(run(["token", "show", "byenv", "--config", config], { env: { BYENV_TOKEN: "an-env-token-that-is-long-enough-012345678" } }).stdout, "an-env-token-that-is-long-enough-012345678\n");
    const unknown = run(["token", "show", "godo", "--config", config]);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /no token "godo".*did you mean "good"/);
    const json = JSON.parse(run(["token", "show", "good", "--config", config, "--json"]).stdout);
    assert.deepEqual([json.ok, json.command, json.name, json.token], [true, "token show", "good", "a-test-token-that-is-long-enough-0123456789"]);
    assert.equal(run(["token", "show"]).status, 2, "a name is needed");
    assert.equal(run(["token", "show", "good"]).status, 2, "a configuration is needed");
});

test("five runs of --if-missing at once leave one value and no temporary file", async () => {
    const dir = tempDir();
    const file = join(dir, "shared.token");
    const runs = await Promise.all(Array.from({ length: 5 }, () => runAsync(["token", "new", "--file", file, "--if-missing", "--print"])));
    for (const r of runs) {
        assert.equal(r.status, 0, r.stderr);
    }
    const value = fileValue(file);
    assert.deepEqual(new Set(runs.map((r) => r.stdout)), new Set([`${value}\n`]), "every run prints the one value in the file");
    assert.deepEqual(readdirSync(dir), ["shared.token"]);
});

test("the help lists token and key; their own help names every flag", () => {
    const help = run(["--help"]);
    assert.match(help.stdout, /token new/);
    assert.match(help.stdout, /token show/);
    assert.match(help.stdout, /key new/);
    const own = run(["token", "--help"]);
    assert.equal(own.status, 0);
    for (const flag of ["--file", "--name", "--profile", "--scope", "--if-missing", "--force", "--print", "--config", "--add", "--json"]) {
        assert.ok(own.stdout.includes(flag), flag);
    }
    assert.match(run(["key", "--help"]).stdout, /--for downloads\|audit/);
    assert.equal(run(["token", "renew"]).status, 2);
});

test("on a terminal: what to add, the profile, the restart and how to try it, with http.publicUrl; never the value on stderr", async () => {
    const { credentialsCommand } = await import("../src/credentials.js");
    const dir = tempDir();
    writeFileSync(join(dir, "pivotkit.json"), JSON.stringify({ policy: { profiles: { export: { results: true } } }, http: { publicUrl: "https://reports.example.com/" } }, null, 2));
    let out = "";
    let err = "";
    const io = { env: {}, cwd: dir, stdout: { write: (t) => (out += t) }, stderr: { isTTY: true, write: (t) => (err += t) } };
    assert.equal(await credentialsCommand("token", ["new", "--file", "reports.token", "--config", "pivotkit.json"], io), 0);
    const value = fileValue(join(dir, "reports.token"));
    assert.equal(out, "");
    assert.match(err, /Add it to auth\.tokens of pivotkit\.json/);
    assert.match(err, /\{"name":"reports","file":"reports\.token"\}/);
    assert.match(err, /--profile gives it one of export/);
    assert.match(err, /Restart the server/);
    assert.match(err, /curl -H "Authorization: Bearer \$\(cat 'reports\.token'\)" https:\/\/reports\.example\.com\/api\/v1\/sources/);
    assert.match(err, /Get-Content -Raw 'reports\.token'/);
    assert.match(err, /claude mcp add --transport http pivotkit https:\/\/reports\.example\.com\/mcp --header/);
    assert.ok(!err.includes(value));
    err = "";
    assert.equal(await credentialsCommand("token", ["new", "--file", "reports.token", "--force"], io), 0);
    assert.match(err, /warning: reports\.token replaced.*401/);
    assert.match(err, /no restart/);
    assert.ok(!err.includes(fileValue(join(dir, "reports.token"))) && !err.includes(value));
    err = "";
    assert.equal(await credentialsCommand("key", ["new", "--for", "downloads", "--file", "download.key"], io), 0);
    assert.match(err, /"output": \{ "downloads": \{ "key": \{ "file": "download\.key" \} \} \}/);
    assert.ok(!err.includes(fileValue(join(dir, "download.key"))));
});

test("--add warns where it changes what the server accepts: auth.mode set, $PIVOTKIT_TOKEN no longer read", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } } }));
    const first = run(["token", "new", "--file", join(dir, "a.token"), "--config", config, "--add", "--json"]);
    assert.equal(first.status, 0, first.stderr);
    const { warnings } = JSON.parse(first.stdout);
    assert.ok(warnings.some((w) => /had no auth\.mode: it is "token" now/.test(w)), warnings.join("\n"));
    assert.ok(warnings.some((w) => /\$PIVOTKIT_TOKEN .*no longer read/.test(w)), warnings.join("\n"));
    const second = run(["token", "new", "--file", join(dir, "b.token"), "--config", config, "--add"]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stderr, "", "no warning once the list had a token and the mode");
});

test("--add refuses a configuration it could not replace before it writes the token", { skip: !POSIX && "symbolic links need rights on Windows" }, () => {
    const dir = workspace();
    const real = join(dir, "real.json");
    writeFileSync(real, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } } }));
    const config = join(dir, "pivotkit.json");
    symlinkSync(real, config);
    const r = run(["token", "new", "--file", join(dir, "a.token"), "--config", config, "--add"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /symbolic link/);
    assert.ok(!existsSync(join(dir, "a.token")), "no token file left behind");
});

test("without hard links: the file is created in place, and a run that loses waits for the other's value", async () => {
    const { placeSecret, secretFileMeans } = await import("../src/secret-file.js");
    const { link } = secretFileMeans;
    const noLinks = Object.assign(new Error("operation not permitted"), { code: "EPERM" });
    try {
        const dir = tempDir();
        secretFileMeans.link = async () => Promise.reject(noLinks);
        const made = await placeSecret(join(dir, "made.token"), "a-test-token-that-is-long-enough-0123456789");
        assert.equal(made.created, true);
        assert.equal(fileValue(join(dir, "made.token")), "a-test-token-that-is-long-enough-0123456789");
        if (POSIX) {
            assert.equal(statSync(join(dir, "made.token")).mode & 0o777, 0o600);
        }
        // another process creates the name first and writes its value 200 ms later
        const target = join(dir, "raced.token");
        secretFileMeans.link = async () => {
            writeFileSync(target, "");
            setTimeout(() => writeFileSync(target, "the-other-process-token-long-enough-012345\n"), 200);
            throw noLinks;
        };
        const kept = await placeSecret(target, "mine-mine-mine-mine-mine-mine-mine-mine-01", { keep: true });
        assert.deepEqual([kept.created, kept.value], [false, "the-other-process-token-long-enough-012345"]);
        assert.deepEqual(tempFiles(dir), []);
    } finally {
        secretFileMeans.link = link;
    }
});

test("secret-rules: the server's rules for a token and a key", async () => {
    const { tokenProblem, keyProblem } = await import("../src/secret-rules.js");
    assert.equal(tokenProblem("a-test-token-that-is-long-enough-0123456789"), null);
    assert.match(String(tokenProblem("short")), /at least 32/);
    assert.ok(tokenProblem("a test token that is long enough 0123456789"), "a space is no bearer token");
    assert.equal(keyProblem("downloads")("x".repeat(32)), null);
    assert.match(String(keyProblem("downloads")("x".repeat(31))), /32 bytes/);
    assert.equal(keyProblem("audit")("x".repeat(16)), null);
    assert.match(String(keyProblem("audit")("x".repeat(15))), /16 characters/);
    assert.match(String(keyProblem("audit")("two\nlines-two-lines")), /line break/);
});
