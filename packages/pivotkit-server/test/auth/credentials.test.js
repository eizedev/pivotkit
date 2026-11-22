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
import { BIN, BY_REGION, POSIX, call, factsOf, restServer, runBin, tempDir, workspace } from "../helpers.js";

/** The command as a person runs it (runBin), not waiting: for runs at the same time. */
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
    const a = runBin(["token", "new"]);
    assert.equal(a.status, 0, a.stderr);
    assert.match(a.stdout, /^[A-Za-z0-9_-]{43}\n$/);
    // no terminal: no hints, nothing else on either stream
    assert.equal(a.stderr, "");
    const b = runBin(["token", "new"]);
    assert.notEqual(a.stdout, b.stdout);
    const key = runBin(["key", "new", "--for", "downloads"]);
    assert.equal(key.status, 0, key.stderr);
    assert.match(key.stdout, /^[A-Za-z0-9_-]{64}\n$/);
    assert.equal(key.stderr, "");
    // $PIVOTKIT_CONFIG naming a file that is not there (the container image's) does not matter
    const inImage = runBin(["token", "new"], { env: { PIVOTKIT_CONFIG: "/config/pivotkit.json" } });
    assert.equal(inImage.status, 0, inImage.stderr);
    assert.match(inImage.stdout, /^[A-Za-z0-9_-]{43}\n$/);
});

test("token new --file writes the value with mode 0600 and LF, prints nothing unless --print", () => {
    const dir = tempDir();
    const file = join(dir, "reports.token");
    const r = runBin(["token", "new", "--file", file]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
    assert.match(fileValue(file), TOKEN_TEXT);
    if (POSIX) {
        assert.equal(statSync(file).mode & 0o777, 0o600);
    }
    const printed = runBin(["token", "new", "--file", join(dir, "other.token"), "--print"]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(printed.stdout, `${fileValue(join(dir, "other.token"))}\n`);
    const key = runBin(["key", "new", "--for", "audit", "--file", join(dir, "audit.key")]);
    assert.equal(key.status, 0, key.stderr);
    assert.equal(key.stdout, "");
    assert.match(fileValue(join(dir, "audit.key")), KEY_TEXT);
    assert.deepEqual(tempFiles(dir), []);
});

test("an existing file is not replaced without --force; --force replaces it; --if-missing keeps it", () => {
    const dir = tempDir();
    const file = join(dir, "reports.token");
    assert.equal(runBin(["token", "new", "--file", file]).status, 0);
    const first = fileValue(file);
    const again = runBin(["token", "new", "--file", file]);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /reports\.token.*already there.*--force.*--if-missing/s);
    assert.ok(!again.stderr.includes(first), "the value is never in a message");
    assert.equal(fileValue(file), first);
    const kept = runBin(["token", "new", "--file", file, "--if-missing", "--print"]);
    assert.equal(kept.status, 0, kept.stderr);
    assert.equal(kept.stdout, `${first}\n`, "--print gives the value in the file");
    const forced = runBin(["token", "new", "--file", file, "--force"]);
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
    assert.equal(runBin(["token", "new", "--file", file, "--force", "--if-missing"]).status, 2);
    assert.equal(runBin(["token", "new", "--if-missing"]).status, 2);
});

test("--if-missing refuses a kept file the server could not use; a kept file loses only its world bits", { skip: !POSIX && "mode bits are POSIX" }, () => {
    const dir = tempDir();
    const file = join(dir, "short.token");
    writeFileSync(file, "too-short\n", { mode: 0o644 });
    const r = runBin(["token", "new", "--file", file, "--if-missing"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /short\.token.*not a usable token/s);
    assert.ok(!r.stderr.includes("too-short"));
    const good = join(dir, "good.token");
    writeFileSync(good, "a-test-token-that-is-long-enough-0123456789\n");
    chmodSync(good, 0o644);
    const k = runBin(["token", "new", "--file", good, "--if-missing"]);
    assert.equal(k.status, 0, k.stderr);
    // the world bits go; the group's stay (a group that shares it), with a warning
    assert.equal(statSync(good).mode & 0o777, 0o640);
    assert.match(k.stderr, /warning: .*good\.token.*readable by others than its owner \(mode 640\)/);
    assert.equal(fileValue(good), "a-test-token-that-is-long-enough-0123456789");
    const shared = runBin(["token", "new", "--file", good, "--if-missing"]);
    assert.equal(statSync(good).mode & 0o777, 0o640, "a group's bits are not taken away");
    assert.match(shared.stderr, /mode 640/);
    chmodSync(good, 0o600);
    assert.equal(runBin(["token", "new", "--file", good, "--if-missing"]).stderr, "", "0600: nothing to say");
    // a key below the download key's 32 bytes is refused as well
    const weak = join(dir, "weak.key");
    writeFileSync(weak, "0123456789abcdef0123\n", { mode: 0o600 });
    assert.equal(runBin(["key", "new", "--for", "downloads", "--file", weak, "--if-missing"]).status, 1);
});

test("a symbolic link, a directory and a missing directory are refused, never written through", { skip: !POSIX && "symbolic links need rights on Windows" }, () => {
    const dir = tempDir();
    const target = join(dir, "elsewhere.txt");
    writeFileSync(target, "keep me\n");
    const link = join(dir, "linked.token");
    symlinkSync(target, link);
    for (const extra of [[], ["--force"]]) {
        const r = runBin(["token", "new", "--file", link, ...extra]);
        assert.equal(r.status, 1, extra.join(" "));
        assert.match(r.stderr, /symbolic link/);
    }
    // --if-missing only reads through the link (a mounted Secret): this one holds no usable token
    const checked = runBin(["token", "new", "--file", link, "--if-missing"]);
    assert.equal(checked.status, 1);
    assert.match(checked.stderr, /not a usable token/);
    assert.equal(readFileSync(target, "utf8"), "keep me\n");
    mkdirSync(join(dir, "adir"));
    const d = runBin(["token", "new", "--file", join(dir, "adir"), "--force"]);
    assert.equal(d.status, 1);
    assert.match(d.stderr, /a directory/);
    const missing = runBin(["token", "new", "--file", join(dir, "nope", "reports.token")]);
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
        const r = runBin(["token", "new", "--file", join(locked, "reports.token"), "--json"]);
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
    const plain = runBin(["token", "new", "--json"]);
    assert.equal(plain.status, 0, plain.stderr);
    const a = JSON.parse(plain.stdout);
    assert.deepEqual([a.ok, a.exitCode, a.command], [true, 0, "token new"]);
    assert.match(a.token, TOKEN_TEXT);
    const file = join(dir, "reports.token");
    const written = JSON.parse(runBin(["token", "new", "--file", file, "--json"]).stdout);
    assert.deepEqual([written.ok, written.exitCode, written.created, written.token], [true, 0, true, undefined]);
    assert.equal(written.file, file);
    const printed = JSON.parse(runBin(["token", "new", "--file", file, "--if-missing", "--print", "--json"]).stdout);
    assert.deepEqual([printed.ok, printed.created, printed.token], [true, false, fileValue(file)]);
    const refused = runBin(["token", "new", "--file", file, "--json"]);
    assert.equal(refused.status, 1);
    const e = JSON.parse(refused.stdout);
    assert.deepEqual([e.ok, e.exitCode, e.command, e.error.kind, e.error.code], [false, 1, "token new", "io", "EXISTS"]);
    assert.equal(e.token, undefined);
    assert.ok(!refused.stdout.includes(fileValue(file)));
    const usage = runBin(["token", "new", "--bogus", "--json"]);
    assert.equal(usage.status, 2);
    const u = JSON.parse(usage.stdout);
    assert.deepEqual([u.ok, u.exitCode, u.error.kind], [false, 2, "usage"]);
    const key = JSON.parse(runBin(["key", "new", "--for", "downloads", "--json"]).stdout);
    assert.deepEqual([key.ok, key.command, key.for], [true, "key new", "downloads"]);
    assert.match(key.key, KEY_TEXT);
    // the file is UTF-8 without BOM whatever the platform (PowerShell 5.1 would write UTF-16 with ">")
    assert.equal(readFileSync(file)[0], fileValue(file).charCodeAt(0));
});

test("key new: at least 32 bytes, and check-config passes with it as the download key", () => {
    const dir = workspace();
    const key = join(dir, "download.key");
    const r = runBin(["key", "new", "--for", "downloads", "--file", key]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(Buffer.byteLength(fileValue(key)) >= 32);
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", downloads: { key: { file: "download.key" } } } }));
    const check = runBin(["check-config", "--config", config]);
    assert.equal(check.status, 0, check.stdout);
    assert.doesNotMatch(check.stdout, /download.*key.*(PROBLEM|shorter)/i);
    // --for is required and checked
    const noFor = runBin(["key", "new"]);
    assert.equal(noFor.status, 2);
    assert.match(noFor.stderr, /pivotkit-server key new --for downloads\|audit/, "the usage line");
    const wrong = runBin(["key", "new", "--for", "download"]);
    assert.equal(wrong.status, 2);
    assert.match(wrong.stderr, /did you mean "downloads"/);
});

test("--add: a backup, the indentation kept, a relative path; a duplicate name and an unknown profile refused", () => {
    const dir = workspace();
    mkdirSync(join(dir, "secrets"));
    const config = join(dir, "pivotkit.json");
    const original = `{\n    "sources": { "sales": { "file": "data/sales.csv" } },\n    "output": { "dir": "out" },\n    "policy": { "profiles": { "export": { "results": true } } }\n}\n`;
    writeFileSync(config, original, { mode: 0o640 });
    const r = runBin(["token", "new", "--file", join(dir, "secrets", "reports.token"), "--config", config, "--add", "--name", "reports", "--profile", "export", "--scope", "sales"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
    const text = readFileSync(config, "utf8");
    assert.match(text, /\n {4}"auth": \{\n {8}"mode": "token"/, "four spaces as before");
    const options = JSON.parse(text);
    assert.deepEqual(options.auth.tokens, [{ name: "reports", file: "secrets/reports.token", scopes: ["sales"], profile: "export" }]);
    const backups = () => readdirSync(dir).filter((n) => n.startsWith("pivotkit.json.bak")).sort();
    assert.equal(backups().length, 1);
    assert.match(backups()[0], /^pivotkit\.json\.bak-\d{8}T\d{6}Z(-\d+)?$/);
    assert.equal(readFileSync(join(dir, backups()[0]), "utf8"), original);
    if (POSIX) {
        assert.equal(statSync(config).mode & 0o777, 0o640, "the configuration's mode kept");
    }
    // a second token: the next backup, the first token kept
    assert.equal(runBin(["token", "new", "--file", join(dir, "secrets", "ci.token"), "--config", config, "--add", "--name", "ci"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(config, "utf8")).auth.tokens.map((t) => t.name), ["reports", "ci"]);
    assert.equal(backups().length, 2, "one backup per run, never one replaced");
    const before = readFileSync(config, "utf8");
    // a name already there, a profile that is not, an unknown scope's syntax: nothing written
    const dup = runBin(["token", "new", "--file", join(dir, "secrets", "x.token"), "--config", config, "--add", "--name", "reports"]);
    assert.equal(dup.status, 2);
    assert.match(dup.stderr, /"reports" is already in auth\.tokens/);
    const profile = runBin(["token", "new", "--file", join(dir, "secrets", "y.token"), "--config", config, "--add", "--name", "y", "--profile", "exprot"]);
    assert.equal(profile.status, 2);
    assert.match(profile.stderr, /did you mean "export"/);
    assert.equal(readFileSync(config, "utf8"), before);
    assert.ok(!existsSync(join(dir, "secrets", "x.token")) && !existsSync(join(dir, "secrets", "y.token")), "no file written for a refused entry");
    // a file inside output.dir is refused (the server prunes and serves that directory)
    const inOut = runBin(["token", "new", "--file", join(dir, "out", "z.token"), "--config", config]);
    assert.equal(inOut.status, 2);
    assert.match(inOut.stderr, /output\.dir/);
    // --add needs --config and --file
    assert.equal(runBin(["token", "new", "--add", "--file", join(dir, "secrets", "w.token")]).status, 2);
    assert.equal(runBin(["token", "new", "--add", "--config", config]).status, 2);
    assert.deepEqual(tempFiles(dir), []);
    assert.deepEqual(tempFiles(join(dir, "secrets")), []);
});

test("round trip: token new --add, the server takes it with its profile, --force rotates it without a restart", async () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, output: { dir: "out" }, policy: { profiles: { export: { results: true } } } }, null, 2));
    const file = join(dir, "export.token");
    const made = runBin(["token", "new", "--file", file, "--config", config, "--add", "--name", "export", "--profile", "export"]);
    assert.equal(made.status, 0, made.stderr);
    const check = runBin(["check-config", "--config", config]);
    assert.equal(check.status, 0, check.stdout);
    const server = await restServer(await loadConfig(config));
    try {
        const token = fileValue(file);
        const body = { source: "sales", view: BY_REGION, format: "csv" };
        assert.equal((await call(`${server.api}/sources`)).status, 401);
        assert.equal((await call(`${server.api}/sources`, { token })).status, 200);
        assert.equal((await call(`${server.api}/views/render/file`, { token, body })).status, 200, "the profile export may download");
        const shown = runBin(["token", "show", "export", "--config", config]);
        assert.equal(shown.status, 0, shown.stderr);
        assert.equal(shown.stdout, `${token}\n`);
        const rotated = runBin(["token", "new", "--file", file, "--force"]);
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
    const good = runBin(["token", "show", "good", "--config", config]);
    assert.equal(good.status, 0, good.stderr);
    assert.equal(good.stdout, "a-test-token-that-is-long-enough-0123456789\n");
    // $PIVOTKIT_CONFIG is the default for show
    assert.equal(runBin(["token", "show", "good"], { env: { PIVOTKIT_CONFIG: config } }).stdout, good.stdout);
    for (const name of ["short", "gone", "byenv"]) {
        const r = runBin(["token", "show", name, "--config", config]);
        assert.equal(r.status, 1, name);
        assert.equal(r.stdout, "");
    }
    assert.equal(runBin(["token", "show", "byenv", "--config", config], { env: { BYENV_TOKEN: "an-env-token-that-is-long-enough-012345678" } }).stdout, "an-env-token-that-is-long-enough-012345678\n");
    const unknown = runBin(["token", "show", "godo", "--config", config]);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /no token "godo".*did you mean "good"/);
    const json = JSON.parse(runBin(["token", "show", "good", "--config", config, "--json"]).stdout);
    assert.deepEqual([json.ok, json.command, json.name, json.token], [true, "token show", "good", "a-test-token-that-is-long-enough-0123456789"]);
    assert.equal(runBin(["token", "show"]).status, 2, "a name is needed");
    assert.equal(runBin(["token", "show", "good"]).status, 2, "a configuration is needed");
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
    const help = runBin(["--help"]);
    assert.match(help.stdout, /token new/);
    assert.match(help.stdout, /token show/);
    assert.match(help.stdout, /key new/);
    const own = runBin(["token", "--help"]);
    assert.equal(own.status, 0);
    for (const flag of ["--file", "--name", "--profile", "--scope", "--if-missing", "--force", "--print", "--config", "--add", "--json"]) {
        assert.ok(own.stdout.includes(flag), flag);
    }
    assert.match(runBin(["key", "--help"]).stdout, /--for downloads\|audit/);
    assert.equal(runBin(["token", "renew"]).status, 2);
});

test("on a terminal: what to add, the profile, the restart and how to try it, with http.publicUrl; never the value on stderr", async () => {
    const { credentialsCommand } = await import("../../src/credentials.js");
    const dir = tempDir();
    writeFileSync(join(dir, "pivotkit.json"), JSON.stringify({ policy: { profiles: { export: { results: true } } }, http: { publicUrl: "https://reports.example.com/" } }, null, 2));
    let out = "";
    let err = "";
    const io = { env: {}, cwd: dir, stdout: { write: (t) => (out += t) }, stderr: { isTTY: true, write: (t) => (err += t) } };
    assert.equal(await credentialsCommand("token", ["new", "--file", "reports.token", "--config", "pivotkit.json"], io), 0);
    const value = fileValue(join(dir, "reports.token"));
    assert.equal(out, "");
    assert.match(err, /Add it to auth\.tokens of pivotkit\.json/);
    assert.match(err, /\{ "name": "reports", "file": "reports\.token" \}/, "as the docs write it");
    assert.match(err, /--profile gives it one of export/);
    assert.match(err, /Restart the server/);
    assert.match(err, /Authorization = "Bearer \$\(Get-Content 'reports\.token'\)"/);
    // curl reads the header from stdin (-K -), so the token is in no command line
    assert.match(err, /printf 'header = "Authorization: Bearer %s"\\n' "\$\(cat 'reports\.token'\)" \| curl -K - https:\/\/reports\.example\.com\/api\/v1\/sources/);
    assert.match(err, /claude mcp add --transport http pivotkit https:\/\/reports\.example\.com\/mcp --header/, "the configuration serves MCP by default");
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
    const first = runBin(["token", "new", "--file", join(dir, "a.token"), "--config", config, "--add", "--json"]);
    assert.equal(first.status, 0, first.stderr);
    const { warnings } = JSON.parse(first.stdout);
    assert.ok(warnings.some((w) => /had no auth\.mode: it is "token" now/.test(w)), warnings.join("\n"));
    assert.ok(warnings.some((w) => /\$PIVOTKIT_TOKEN .*no longer read/.test(w)), warnings.join("\n"));
    const second = runBin(["token", "new", "--file", join(dir, "b.token"), "--config", config, "--add"]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stderr, "", "no warning once the list had a token and the mode");
});

test("--add refuses a configuration it could not replace before it writes the token", { skip: !POSIX && "symbolic links need rights on Windows" }, () => {
    const dir = workspace();
    const real = join(dir, "real.json");
    writeFileSync(real, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } } }));
    const config = join(dir, "pivotkit.json");
    symlinkSync(real, config);
    const r = runBin(["token", "new", "--file", join(dir, "a.token"), "--config", config, "--add"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /symbolic link/);
    assert.ok(!existsSync(join(dir, "a.token")), "no token file left behind");
});

test("without hard links: the file is created in place, and a run that loses waits for the other's value", async () => {
    const { placeSecret, secretFileMeans } = await import("../../src/secret-file.js");
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
    const { tokenProblem, keyProblem } = await import("../../src/secret-rules.js");
    assert.equal(tokenProblem("a-test-token-that-is-long-enough-0123456789"), null);
    assert.match(String(tokenProblem("short")), /at least 32/);
    assert.ok(tokenProblem("a test token that is long enough 0123456789"), "a space is no bearer token");
    assert.equal(keyProblem("downloads")("x".repeat(32)), null);
    assert.match(String(keyProblem("downloads")("x".repeat(31))), /32 bytes/);
    assert.equal(keyProblem("audit")("x".repeat(16)), null);
    assert.match(String(keyProblem("audit")("x".repeat(15))), /16 characters/);
    assert.match(String(keyProblem("audit")("two\nlines-two-lines")), /line break/);
});

test("a token too easy to guess: fewer than 8 different characters or one piece repeated is refused by every check; random tokens pass", async () => {
    const { tokenProblem } = await import("../../src/secret-rules.js");
    const { SECRET_BYTES, newSecret } = await import("../../src/secret-file.js");
    for (const weak of ["x".repeat(40), "passwordpasswordpasswordpassword", "changemechangemechangemechangeme", "0123456789abcdef0123456789abcdef", "12345678901234567890123456789012", "abcdefgh".repeat(4)]) {
        assert.match(String(tokenProblem(weak)), /^too easy to guess \((\d different characters?, at least 8|one piece repeated)\)$/, weak);
    }
    assert.equal(tokenProblem("x".repeat(40)), "too easy to guess (1 different character, at least 8)");
    assert.equal(tokenProblem("abcdefgh".repeat(4)), "too easy to guess (one piece repeated)");
    // what people make: token new, hex from openssl rand -hex 16, a UUID without dashes
    assert.equal(tokenProblem("9f86d081884c7d659a2feaa0c55ad015"), null);
    assert.equal(tokenProblem("0f8fad5bd9cb469fa16570867728950e"), null);
    for (let i = 0; i < 2000; i++) {
        assert.equal(tokenProblem(newSecret(SECRET_BYTES.token, tokenProblem)), null);
    }
    // a check no value passes ends after 100 draws instead of looping on
    let draws = 0;
    assert.throws(() => newSecret(SECRET_BYTES.token, () => (draws++, "never")), /no usable secret of 32 random bytes in 100 draws/);
    assert.equal(draws, 100);
    // the start refuses it, check-config says so, token new --if-missing does not keep it
    const dir = workspace();
    const weak = "x".repeat(40);
    await assert.rejects(restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: weak } }), /^ConfigError: auth: the token \(\$PIVOTKIT_TOKEN\) is too easy to guess \(1 different character, at least 8\); make one with: /);
    const check = spawnSync(process.execPath, [BIN, "check-config", "--source", "sales=data/sales.csv", "--auth", "token"], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH ?? "", PIVOTKIT_TOKEN: weak } });
    assert.match(factsOf(check.stdout), /^PROBLEM: the token token \(\$PIVOTKIT_TOKEN\) is too easy to guess \(1 different character, at least 8\) -> the server does not start$/m);
    writeFileSync(join(dir, "weak.token"), `${weak}\n`, { mode: 0o600 });
    const kept = spawnSync(process.execPath, [BIN, "token", "new", "--file", "weak.token", "--if-missing"], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH ?? "" } });
    assert.equal(kept.status, 1, kept.stderr);
    assert.match(kept.stderr, /weak\.token: is there but not a usable token \(too easy to guess \(1 different character, at least 8\)\); replace it with --force/);
});

test("--if-missing reads a kept token file as the server does: spaces and the line ending around it trimmed; a key keeps its spaces", async () => {
    const dir = tempDir();
    const token = "Abc-def_ghi.jkl~mno+pqr/stu0123456789xyzXYZ";
    writeFileSync(join(dir, "padded.token"), `  ${token}  \n`, { mode: 0o600 });
    const kept = runBin(["token", "new", "--file", "padded.token", "--if-missing", "--print"], { cwd: dir });
    assert.equal(kept.status, 0, kept.stderr);
    assert.equal(kept.stdout.trim().split("\n")[0], token, "the value the server reads");
    // the server takes the same file
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "bot", file: join(dir, "padded.token") }] }, baseDir: workspace() });
    try {
        assert.equal((await call(`${server.api}/sources`, { token })).status, 200);
    } finally {
        await server.close();
    }
    // a key: one line ending off, as readSecret reads it; spaces are part of it
    writeFileSync(join(dir, "padded.key"), `  ${"k1".repeat(20)}  \n`, { mode: 0o600 });
    const key = runBin(["key", "new", "--for", "downloads", "--file", "padded.key", "--if-missing", "--print"], { cwd: dir });
    assert.equal(key.status, 0, key.stderr);
    assert.equal(key.stdout.split("\n")[0], `  ${"k1".repeat(20)}  `);
});

/** A token file as PowerShell 5.1's ">" writes it: UTF-16 with a BOM. */
const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${text}\r\n`, "utf16le")]);

test("a UTF-16 file says so: token new --if-missing, token show, check-config and the start", async () => {
    const dir = workspace();
    const file = join(dir, "ps.token");
    writeFileSync(file, utf16("a-test-token-that-is-long-enough-0123456789"));
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "ps", file: "ps.token" }] }, output: { dir: "out", downloads: { key: { file: "ps.key" } } } }));
    writeFileSync(join(dir, "ps.key"), utf16("a-key-that-is-long-enough-for-the-download-links-0123456789"));
    const said = /looks like UTF-16 \(PowerShell 5\.1's > writes it\)/;
    const kept = runBin(["token", "new", "--file", file, "--if-missing"]);
    assert.equal(kept.status, 1);
    assert.match(kept.stderr, said);
    const shown = runBin(["token", "show", "ps", "--config", config]);
    assert.equal(shown.status, 1);
    assert.match(shown.stderr, said);
    const check = runBin(["check-config", "--config", config]);
    assert.equal(check.status, 1);
    assert.match(factsOf(check.stdout), /PROBLEM: the token ps \(ps\.token\) looks like UTF-16/);
    assert.match(factsOf(check.stdout), /PROBLEM: output\.downloads\.key: .*looks like UTF-16/);
    await assert.rejects(restServer(await loadConfig(config)), (e) => said.test(e.message));
});

test("a token or key file that is no regular file or too long is refused, never waited for", { skip: !POSIX && "FIFOs are POSIX" }, async () => {
    const dir = workspace();
    spawnSync("mkfifo", [join(dir, "fifo.token")]);
    writeFileSync(join(dir, "long.token"), `${"a".repeat(5000)}\n`);
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "fifo", file: "fifo.token" }, { name: "long", file: "long.token" }] } }));
    const fifo = runBin(["token", "show", "fifo", "--config", config]);
    assert.equal(fifo.status, 1);
    assert.match(fifo.stderr, /not a regular file/);
    const long = runBin(["token", "show", "long", "--config", config]);
    assert.equal(long.status, 1);
    assert.match(long.stderr, /longer than 4096 bytes/);
    const check = runBin(["check-config", "--config", config]);
    assert.match(factsOf(check.stdout), /the token fifo \(fifo\.token\) cannot be read: not a regular file/);
    await assert.rejects(restServer(await loadConfig(config)), (e) => /not a regular file/.test(e.message));
});

test("--if-missing: a kept file of another user gets a warning", { skip: !POSIX && "file owners by uid are POSIX" }, async () => {
    const { placeSecret, secretFileMeans } = await import("../../src/secret-file.js");
    const { uid } = secretFileMeans;
    const dir = tempDir();
    const file = join(dir, "theirs.token");
    writeFileSync(file, "a-test-token-that-is-long-enough-0123456789\n", { mode: 0o600 });
    try {
        // as if this ran as a user that is neither the file's owner nor root
        secretFileMeans.uid = () => 4242;
        const kept = await placeSecret(file, "unused", { keep: true, kind: "token", label: "theirs.token" });
        assert.equal(kept.created, false);
        assert.ok(kept.warnings.some((w) => /theirs\.token is owned by user \d+, not by 4242/.test(w)), kept.warnings.join("\n"));
    } finally {
        secretFileMeans.uid = uid;
    }
});

test("--force over a mounted file (EBUSY) says that a mounted file cannot be replaced", async () => {
    const { placeSecret, secretFileMeans } = await import("../../src/secret-file.js");
    const { rename } = secretFileMeans;
    const dir = tempDir();
    const file = join(dir, "mounted.token");
    writeFileSync(file, "a-test-token-that-is-long-enough-0123456789\n", { mode: 0o600 });
    try {
        secretFileMeans.rename = async () => Promise.reject(Object.assign(new Error("resource busy"), { code: "EBUSY" }));
        await assert.rejects(placeSecret(file, "a-new-token-that-is-long-enough-01234567890", { replace: true, label: "mounted.token" }), (e) => e.code === "MOUNTED" && /a mounted file cannot be replaced/.test(e.message));
        assert.deepEqual(tempFiles(dir), []);
        assert.equal(fileValue(file), "a-test-token-that-is-long-enough-0123456789");
    } finally {
        secretFileMeans.rename = rename;
    }
});

test("SIGTERM during a write leaves no temporary file", { skip: !POSIX && "signals are POSIX" }, () => {
    const dir = tempDir();
    const module = new URL("../../src/secret-file.js", import.meta.url).href;
    // the link step stands for a slow file system: the signal comes while the temporary file exists
    const script = `import { placeSecret, secretFileMeans } from ${JSON.stringify(module)};
secretFileMeans.link = () => { process.kill(process.pid, "SIGTERM"); return new Promise((done) => setTimeout(done, 5000)); };
await placeSecret(${JSON.stringify(join(dir, "slow.token"))}, "a-test-token-that-is-long-enough-0123456789");`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 20_000 });
    assert.equal(r.signal, "SIGTERM", r.stderr);
    assert.deepEqual(readdirSync(dir), []);
});

test("key new --config --add names the key in the configuration, with the same checks and backup", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, audit: { subject: "hash" } }, null, 2));
    const r = runBin(["key", "new", "--for", "downloads", "--file", join(dir, "download.key"), "--config", config, "--add"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(config, "utf8")).output.downloads, { key: { file: "download.key" } });
    assert.equal(runBin(["key", "new", "--for", "audit", "--file", join(dir, "audit.key"), "--config", config, "--add"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(config, "utf8")).audit, { subject: "hash", key: { file: "audit.key" } });
    assert.equal(readdirSync(dir).filter((n) => n.startsWith("pivotkit.json.bak-")).length, 2);
    assert.equal(runBin(["check-config", "--config", config]).status, 0);
    // a key already named is refused before anything is written; so is a key inside output.dir
    const again = runBin(["key", "new", "--for", "downloads", "--file", join(dir, "other.key"), "--config", config, "--add"]);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /output\.downloads\.key is set already/);
    assert.ok(!existsSync(join(dir, "other.key")));
    assert.equal(runBin(["key", "new", "--for", "audit", "--file", join(dir, "out", "a.key"), "--config", config]).status, 2);
    assert.equal(runBin(["key", "new", "--for", "audit", "--add", "--file", join(dir, "b.key")]).status, 2, "--add needs --config");
});

test("on a terminal: a kept file is one line; MCP only where the configuration serves it; --add says it rewrote the file", async () => {
    const { credentialsCommand } = await import("../../src/credentials.js");
    const dir = tempDir();
    writeFileSync(join(dir, "kept.token"), "a-test-token-that-is-long-enough-0123456789\n", { mode: 0o600 });
    writeFileSync(join(dir, "rest-only.json"), JSON.stringify({ http: { enable: ["rest"] } }));
    let err = "";
    const io = { env: {}, cwd: dir, stdout: { write() {} }, stderr: { isTTY: true, write: (t) => (err += t) } };
    assert.equal(await credentialsCommand("token", ["new", "--file", "kept.token", "--if-missing"], io), 0);
    assert.equal(err, "kept kept.token (usable)\n");
    err = "";
    assert.equal(await credentialsCommand("token", ["new", "--file", "new.token", "--config", "rest-only.json", "--add"], io), 0);
    assert.doesNotMatch(err, /claude mcp add/);
    assert.match(err, /rewritten as pretty-printed JSON/);
    err = "";
    assert.equal(await credentialsCommand("token", ["new", "--file", "loose.token"], io), 0);
    assert.match(err, /claude mcp add .*\(where the server serves MCP\)/);
    const help = (await import("node:child_process")).spawnSync(process.execPath, [BIN, "token", "--help"], { encoding: "utf8" }).stdout;
    assert.match(help, /--add .*needs --file/);
});

test("a request without a token is told what to send in plain words, without angle brackets", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "t", env: "T" }] }, baseDir: dir }, { env: { T: "a-test-token-that-is-long-enough-0123456789" } });
    try {
        const r = await call(`${server.api}/sources`);
        assert.equal(r.status, 401);
        assert.doesNotMatch(String(r.data.detail), /[<>]/);
        assert.match(String(r.data.detail), /Authorization: Bearer YOUR_TOKEN/);
    } finally {
        await server.close();
    }
});

test("--if-missing --add twice: the second run finds it done; a different entry of that name is still refused", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, policy: { profiles: { export: { results: true } } } }, null, 2));
    const args = ["token", "new", "--file", join(dir, "a.token"), "--config", config, "--add", "--name", "a", "--if-missing"];
    assert.equal(runBin(args).status, 0);
    const after = readFileSync(config, "utf8");
    const again = runBin([...args, "--json"]);
    assert.equal(again.status, 0, again.stdout);
    const out = JSON.parse(again.stdout);
    assert.deepEqual([out.ok, out.created, out.configured], [true, false, "already"]);
    assert.equal(readFileSync(config, "utf8"), after, "the configuration is not written again");
    assert.equal(readdirSync(dir).filter((n) => n.startsWith("pivotkit.json.bak-")).length, 1, "no second backup");
    // the same name with another profile is a different entry
    const other = runBin([...args, "--profile", "export"]);
    assert.equal(other.status, 2);
    assert.match(other.stderr, /"a" is already in auth\.tokens/);
    // a key the same way
    const keyArgs = ["key", "new", "--for", "downloads", "--file", join(dir, "d.key"), "--config", config, "--add", "--if-missing"];
    assert.equal(runBin(keyArgs).status, 0);
    assert.equal(runBin(keyArgs).status, 0);
    assert.equal(runBin(["key", "new", "--for", "downloads", "--file", join(dir, "e.key"), "--config", config, "--add", "--if-missing"]).status, 2, "another file for the key is refused");
});

/**
 * The lstat placeSecret sees, with the file's owner and group as given: an old file of another user
 * or group, which a test that is not root cannot make.
 */
async function withOldOwner(secretFileMeans, file, owner, work) {
    const { lstat: realLstat } = await import("node:fs/promises");
    const { lstat } = secretFileMeans;
    secretFileMeans.lstat = async (path) => {
        const info = await realLstat(path);
        return path === file ? Object.assign(Object.create(Object.getPrototypeOf(info)), info, owner) : info;
    };
    try {
        return await work();
    } finally {
        secretFileMeans.lstat = lstat;
    }
}

test("--force over another user's file: the group kept by chown(-1, gid), only its read bit, and a warning for the owner", { skip: !POSIX && "owners and modes are POSIX" }, async () => {
    const { placeSecret, secretFileMeans } = await import("../../src/secret-file.js");
    const dir = tempDir();
    const file = join(dir, "theirs.token");
    writeFileSync(file, "a-test-token-that-is-long-enough-0123456789\n");
    chmodSync(file, 0o660);
    const me = process.getuid?.() ?? 0;
    // the old file's owner and group, neither this user's nor its default group
    const old = { uid: me + 4242, gid: statSync(file).gid + 4242 };
    const calls = [];
    let groupSet = null;
    const { chown, stat } = secretFileMeans;
    try {
        // not root: changing the owner is refused; keeping the owner (-1) and setting a group this user is in works
        secretFileMeans.chown = async (handle, uid, group) => {
            calls.push([uid, group]);
            if (uid !== -1) {
                throw Object.assign(new Error("not permitted"), { code: "EPERM" });
            }
            groupSet = group;
        };
        // what the new file reports after that chown: the group it was given
        secretFileMeans.stat = async (handle) => {
            const info = await handle.stat();
            return groupSet === null ? info : Object.assign(Object.create(Object.getPrototypeOf(info)), info, { gid: groupSet });
        };
        const placed = await withOldOwner(secretFileMeans, file, old, () => placeSecret(file, "a-new-token-that-is-long-enough-01234567890", { replace: true, label: "theirs.token" }));
        assert.deepEqual(calls, [[old.uid, old.gid], [-1, old.gid]], "the owner tried, then the group alone with -1");
        assert.equal(groupSet, old.gid, "the old group asked for");
        assert.equal(statSync(file).mode & 0o777, 0o640, "the group's read bit, never its write bit");
        assert.ok(placed.warnings.some((w) => w.includes(`theirs.token: owner or group not kept (now ${me}:${old.gid}, was ${old.uid}:${old.gid})`)), placed.warnings.join("\n"));
        assert.ok(placed.warnings.some((w) => /mode 640, was 660/.test(w)), placed.warnings.join("\n"));
    } finally {
        secretFileMeans.chown = chown;
        secretFileMeans.stat = stat;
    }
});

test("--force where neither owner nor group can be kept: mode 600 and a warning", { skip: !POSIX && "owners and modes are POSIX" }, async () => {
    const { placeSecret, secretFileMeans } = await import("../../src/secret-file.js");
    const dir = tempDir();
    const file = join(dir, "lost.token");
    writeFileSync(file, "a-test-token-that-is-long-enough-0123456789\n");
    chmodSync(file, 0o640);
    const own = statSync(file).gid;
    const { chown } = secretFileMeans;
    try {
        secretFileMeans.chown = async () => Promise.reject(Object.assign(new Error("not permitted"), { code: "EPERM" }));
        const placed = await withOldOwner(secretFileMeans, file, { uid: (process.getuid?.() ?? 0) + 4242, gid: own + 4242 }, () => placeSecret(file, "a-new-token-that-is-long-enough-01234567890", { replace: true, label: "lost.token" }));
        assert.equal(statSync(file).gid, own, "this user's group, not the old file's");
        assert.equal(statSync(file).mode & 0o777, 0o600, "no group bits for another group");
        assert.ok(placed.warnings.some((w) => /lost\.token: owner or group not kept \(now \d+:\d+, was \d+:\d+\)/.test(w)), placed.warnings.join("\n"));
        assert.ok(placed.warnings.some((w) => /mode 600, was 640/.test(w)), placed.warnings.join("\n"));
    } finally {
        secretFileMeans.chown = chown;
    }
});

test("--force keeps a second group of this user and its read bit", { skip: (!POSIX || (process.getgroups?.() ?? []).length < 2) && "needs POSIX and a second group" }, async () => {
    const { placeSecret } = await import("../../src/secret-file.js");
    const dir = tempDir();
    const file = join(dir, "shared.token");
    // a group a new file in this directory would not get by itself
    const group = (process.getgroups?.() ?? []).find((g) => g !== statSync(dir).gid && g !== process.getgid?.());
    assert.ok(group !== undefined);
    writeFileSync(file, "a-test-token-that-is-long-enough-0123456789\n");
    (await import("node:fs")).chownSync(file, process.getuid?.() ?? 0, group);
    chmodSync(file, 0o640);
    const kept = await placeSecret(file, "a-new-token-that-is-long-enough-01234567890", { replace: true, label: "shared.token" });
    assert.equal(statSync(file).gid, group, "the group kept");
    assert.equal(statSync(file).mode & 0o777, 0o640, "its read bit kept");
    assert.deepEqual(kept.warnings, []);
});

test("--if-missing that takes away everyone's read access says so; through a link it only reads", { skip: !POSIX && "mode bits and links are POSIX" }, () => {
    const dir = tempDir();
    const file = join(dir, "open.token");
    writeFileSync(file, "a-test-token-that-is-long-enough-0123456789\n");
    chmodSync(file, 0o604);
    const r = runBin(["token", "new", "--file", file, "--if-missing"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /warning: .*open\.token: removed everyone's read access \(mode 600, was 604\)/);
    // a mounted Secret: the file behind ..data links, its mode not ours to change
    mkdirSync(join(dir, "..data"));
    writeFileSync(join(dir, "..data", "reports"), "a-test-token-that-is-long-enough-0123456789\n");
    chmodSync(join(dir, "..data", "reports"), 0o644);
    symlinkSync(join("..data", "reports"), join(dir, "reports"));
    const linked = runBin(["token", "new", "--file", join(dir, "reports"), "--if-missing"]);
    assert.equal(linked.status, 0, linked.stderr);
    assert.equal(linked.stdout, "");
    assert.match(linked.stderr, /warning: .*reports is readable by everyone \(mode 644\); not changed through the link/);
    assert.equal(statSync(join(dir, "..data", "reports")).mode & 0o777, 0o644, "nothing changed through the link");
    // the value behind a link is not printed: that is token show's job, by name
    for (const flag of ["--print", "--json"]) {
        const printed = runBin(["token", "new", "--file", join(dir, "reports"), "--if-missing", "--print", ...(flag === "--json" ? ["--json"] : [])]);
        assert.equal(printed.status, 2, flag);
        assert.ok(!printed.stdout.includes("a-test-token-that-is-long-enough"), flag);
        assert.match(flag === "--json" ? JSON.parse(printed.stdout).error.message : printed.stderr, /behind a symbolic link/);
    }
});

test("--add refuses to replace a configuration that changed since it was read", async () => {
    const { credentialsCommand } = await import("../../src/credentials.js");
    const { secretFileMeans } = await import("../../src/secret-file.js");
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } } }, null, 2));
    const { link } = secretFileMeans;
    let err = "";
    try {
        // someone saves the configuration while the token is being written
        secretFileMeans.link = async (from, to) => {
            writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv", title: "Edited" } } }, null, 2));
            return link(from, to);
        };
        const code = await credentialsCommand("token", ["new", "--file", "x.token", "--config", "pivotkit.json", "--add"], { env: {}, cwd: dir, stdout: { write() {} }, stderr: { write: (t) => (err += t) } });
        assert.equal(code, 1);
    } finally {
        secretFileMeans.link = link;
    }
    assert.match(err, /pivotkit\.json changed since it was read/);
    assert.equal(JSON.parse(readFileSync(config, "utf8")).sources.sales.title, "Edited", "the other change stays");
    assert.deepEqual(readdirSync(dir).filter((n) => n.includes(".bak-")), [], "no backup left for a write that did not happen");
});

test("--json and --help count as flags only before --", () => {
    const dir = tempDir();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ auth: { mode: "token", tokens: [{ name: "a", env: "A_TOKEN" }] } }));
    const r = runBin(["token", "show", "--config", config, "--", "--json"]);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "", "no JSON: --json after -- is the name");
    assert.match(r.stderr, /no token "--json"/);
    const h = runBin(["token", "show", "--config", config, "--", "--help"]);
    assert.equal(h.status, 2);
    assert.match(h.stderr, /no token "--help"/);
});

test("the claude mcp add hint says that the token lands in the process list and the shell's history", async () => {
    const { credentialsCommand } = await import("../../src/credentials.js");
    const dir = tempDir();
    let err = "";
    await credentialsCommand("token", ["new", "--file", "t.token"], { env: {}, cwd: dir, stdout: { write() {} }, stderr: { isTTY: true, write: (t) => (err += t) } });
    assert.match(err, /claude mcp add[^\n]*\n[^\n]*process list and your shell's history/);
});

test("--add notices a same-size edit with the time put back", async () => {
    const { credentialsCommand } = await import("../../src/credentials.js");
    const { secretFileMeans } = await import("../../src/secret-file.js");
    const { utimesSync } = await import("node:fs");
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv", title: "AAAA" } } }, null, 2));
    // whole seconds, so the edit below can put the time back exactly
    const stamp = new Date("2026-01-02T03:04:05Z");
    utimesSync(config, stamp, stamp);
    const { link } = secretFileMeans;
    let err = "";
    try {
        secretFileMeans.link = async (from, to) => {
            writeFileSync(config, readFileSync(config, "utf8").replace("AAAA", "BBBB"));
            utimesSync(config, stamp, stamp);
            return link(from, to);
        };
        const code = await credentialsCommand("token", ["new", "--file", "x.token", "--config", "pivotkit.json", "--add"], { env: {}, cwd: dir, stdout: { write() {} }, stderr: { write: (t) => (err += t) } });
        assert.equal(code, 1);
    } finally {
        secretFileMeans.link = link;
    }
    assert.match(err, /changed since it was read/);
    assert.equal(JSON.parse(readFileSync(config, "utf8")).sources.sales.title, "BBBB");
});

test("--if-missing --add of an entry that is there, with its file new: the hint says created", async () => {
    const { credentialsCommand } = await import("../../src/credentials.js");
    const dir = tempDir();
    writeFileSync(join(dir, "pivotkit.json"), JSON.stringify({ auth: { mode: "token", tokens: [{ name: "new", file: "new.token" }] } }));
    let err = "";
    const code = await credentialsCommand("token", ["new", "--file", "new.token", "--config", "pivotkit.json", "--add", "--if-missing"], { env: {}, cwd: dir, stdout: { write() {} }, stderr: { isTTY: true, write: (t) => (err += t) } });
    assert.equal(code, 0);
    assert.equal(err, "created new.token; already configured in pivotkit.json\n");
});

test("a flag without its value names that flag, without a 'did you mean' of itself", () => {
    const r = runBin(["token", "new", "--file", "--json"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--file/);
    assert.doesNotMatch(r.stderr, /did you mean/);
});

test("--add over a configuration of another user and group: a warning, and no group or world bits for this user's group", { skip: !POSIX && "owners and modes are POSIX" }, async () => {
    const { credentialsCommand } = await import("../../src/credentials.js");
    const { secretFileMeans } = await import("../../src/secret-file.js");
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } } }, null, 2));
    chmodSync(config, 0o644);
    const { chown } = secretFileMeans;
    let err = "";
    try {
        secretFileMeans.chown = async () => Promise.reject(Object.assign(new Error("not permitted"), { code: "EPERM" }));
        const code = await withOldOwner(secretFileMeans, config, { uid: (process.getuid?.() ?? 0) + 4242, gid: statSync(config).gid + 4242 }, () =>
            credentialsCommand("token", ["new", "--file", "a.token", "--config", "pivotkit.json", "--add"], { env: {}, cwd: dir, stdout: { write() {} }, stderr: { write: (t) => (err += t) } })
        );
        assert.equal(code, 0, err);
    } finally {
        secretFileMeans.chown = chown;
    }
    assert.match(err, /warning: pivotkit\.json: owner or group not kept/);
    assert.match(err, /pivotkit\.json: read access narrowed \(mode 600, was 644\)/);
    assert.equal(statSync(config).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(config, "utf8")).auth.tokens[0].name, "a");
});

test("--add keeps the configuration's bytes as they were in the backup", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    // a byte that is no UTF-8 inside a title: JSON.parse reads it as U+FFFD, the backup must not
    const original = Buffer.concat([Buffer.from('{ "sources": { "sales": { "file": "data/sales.csv", "title": "Sales '), Buffer.from([0xff]), Buffer.from('" } } }\n')]);
    writeFileSync(config, original);
    const r = runBin(["token", "new", "--file", join(dir, "a.token"), "--config", config, "--add"]);
    assert.equal(r.status, 0, r.stderr);
    const backup = readdirSync(dir).find((n) => n.startsWith("pivotkit.json.bak-"));
    assert.ok(backup);
    assert.ok(readFileSync(join(dir, /** @type {string} */ (backup))).equals(original), "byte for byte");
});

test("a flag at the end without its value: named, no suggestion", () => {
    for (const args of [["token", "new", "--file"], ["key", "new", "--for"], ["token", "show", "--config"]]) {
        const r = runBin(args);
        assert.equal(r.status, 2, args.join(" "));
        assert.match(r.stderr, new RegExp(`'${args.at(-1)} <value>' argument missing`));
        assert.doesNotMatch(r.stderr, /did you mean/, args.join(" "));
    }
});
