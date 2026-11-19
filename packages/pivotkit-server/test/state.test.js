// The state directory (src/state.js): what a start without any setup makes (a token, the download
// links' key, the audit key), what it refuses, file references with create: true, the container
// image's built-in configuration, and check-config and `token show` resolving the same files without
// making them. Mode bits, users and symbolic links are POSIX facts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, checkConfig, serve, validateOptions } from "pivotkit-server";
import { IMAGE_PATHS, STATE_ENV, builtInConfig, configFrom, prepareHttpServe } from "pivotkit-server/internal";
import { BIN, BY_REGION, call, factsOf, tempDir, workspace } from "./helpers.js";

const POSIX = process.platform !== "win32";
const ROOT = process.getuid?.() === 0;
const OPEN = "0.0.0.0";

/** A token as the start makes it: 32 random bytes in base64url. */
const TOKEN_TEXT = /^[A-Za-z0-9_-]{43}$/;

/** The command as the image runs it, without a terminal. */
const run = (args, { env = {}, cwd } = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, timeout: 30_000 });

/** A workspace with an empty state directory beside it. */
function setup() {
    const dir = workspace();
    const state = join(dir, "state");
    mkdirSync(state);
    return { dir, state, secrets: join(state, "secrets") };
}

/** The value of a secret file (one line). */
const valueOf = (path) => readFileSync(path, "utf8").replace(/\n$/, "");

/** serve() off loopback on a free port with its log kept as parsed lines. */
async function openServer(options, { env = {}, stateDir = null } = {}) {
    const log = [];
    const server = await serve({ ...options, http: { host: OPEN, port: 0, enable: ["rest"], ...options.http } }, { env, stateDir, stderr: { write: (t) => log.push(...String(t).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) } });
    return { ...server, log, api: `http://127.0.0.1:${server.port}/api/v1` };
}

const sources = { sales: { file: "data/sales.csv" }, open: { file: "data/sales.csv", policy: { default: "show" } } };

/** A workspace's configuration file that asks for tokens and names none. */
const workspaceWithTokenConfig = (dir) => writeFileSync(join(dir, "token.json"), JSON.stringify({ auth: { mode: "token" } }));

test("without a state directory an open address without auth is still refused, and nothing is made", async () => {
    const { dir, state } = setup();
    await assert.rejects(openServer({ sources, baseDir: dir }), /needs --auth token or oauth/);
    assert.deepEqual(readdirSync(state), []);
    // the runner: an empty $PIVOTKIT_STATE_DIR is no state directory
    const r = run(["serve", "--host", OPEN, "--source", `s=${join(dir, "data", "sales.csv")}`], { env: { [STATE_ENV]: "" } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /needs --auth token or oauth/);
});

test("the first start makes the token admin (0600 in secrets/ 0700) and the download key; the next start keeps them; the token works", async () => {
    const { dir, state, secrets } = setup();
    const first = await openServer({ sources, output: { dir: "out" }, baseDir: dir }, { stateDir: state });
    const token = valueOf(join(secrets, "admin.token"));
    const key = valueOf(join(secrets, "downloads.key"));
    try {
        assert.match(token, TOKEN_TEXT);
        assert.match(key, /^[A-Za-z0-9_-]{64}$/);
        if (POSIX) {
            assert.equal(statSync(secrets).mode & 0o777, 0o700);
            assert.equal(statSync(join(secrets, "admin.token")).mode & 0o777, 0o600);
            assert.equal(statSync(join(secrets, "downloads.key")).mode & 0o777, 0o600);
        }
        assert.equal((await call(`${first.api}/sources`)).status, 401);
        const listed = await call(`${first.api}/sources`, { token });
        assert.equal(listed.status, 200);
        assert.equal(first.log.find((l) => l.message === "started")?.auth, "token");
        assert.deepEqual(readdirSync(secrets).sort(), ["admin.token", "downloads.key"]);
    } finally {
        await first.close();
    }
    const second = await openServer({ sources, output: { dir: "out" }, baseDir: dir }, { stateDir: state });
    try {
        assert.equal(valueOf(join(secrets, "admin.token")), token);
        assert.equal(valueOf(join(secrets, "downloads.key")), key);
        assert.equal((await call(`${second.api}/sources`, { token })).status, 200);
        assert.ok(!second.log.some((l) => /^created /.test(l.message ?? "")), "nothing made the second time");
    } finally {
        await second.close();
    }
});

test("on loopback, with $PIVOTKIT_TOKEN, or with allowUnauthenticated no token is made", async () => {
    for (const [name, options, env, http] of /** @type {const} */ ([
        ["loopback", {}, {}, { host: "127.0.0.1" }],
        ["the variable", { auth: { mode: "token" } }, { PIVOTKIT_TOKEN: "a-test-token-that-is-long-enough-0123456789" }, {}],
        ["allowUnauthenticated", { auth: { allowUnauthenticated: true } }, {}, {}]
    ])) {
        const { dir, state } = setup();
        const server = await openServer({ sources, ...options, http, baseDir: dir }, { stateDir: state, env });
        try {
            assert.ok(!existsSync(join(state, "secrets", "admin.token")), name);
        } finally {
            await server.close();
        }
    }
});

test("a state directory that cannot be written stops the start when the token is needed, never listening; the key alone is a warning", { skip: (!POSIX || ROOT) && "needs a POSIX user that is not root" }, async () => {
    const { stateMeans } = await import("../src/state.js");
    const { container } = stateMeans;
    const { dir, state } = setup();
    chmodSync(state, 0o500);
    try {
        // outside a container the fix is the directory itself; inside one, a volume
        stateMeans.container = () => null;
        await assert.rejects(openServer({ sources, baseDir: dir }, { stateDir: state }), (e) => e instanceof ConfigError && /the token "admin" cannot be made/.test(e.message) && /create .*state and make it writable for the user this runs as/.test(e.message) && !/volume/.test(e.message) && /\$PIVOTKIT_TOKEN/.test(e.message));
        stateMeans.container = () => "docker";
        await assert.rejects(openServer({ sources, baseDir: dir }, { stateDir: state }), (e) => e instanceof ConfigError && /mount a writable volume at .*state/.test(e.message));
        stateMeans.container = container;
        // the runner: exit 2 and no listening line
        const r = run(["serve", "--host", OPEN, "--port", "0", "--source", `s=${join(dir, "data", "sales.csv")}`, "--log-format", "json"], { env: { [STATE_ENV]: state } });
        assert.equal(r.status, 2);
        assert.doesNotMatch(r.stderr, /"event":"started"/);
        assert.match(r.stderr, /cannot be made/);
        // loopback with links on: only the key is wanted, and the start goes on with a random one
        const { options, notes } = await prepareHttpServe({ sources, output: { dir: "out" }, baseDir: dir }, { env: {}, host: "127.0.0.1", tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
        assert.equal(options.output?.downloads?.key, undefined);
        assert.ok(notes.some((n) => n.level === "warn" && /the download links' key cannot be made/.test(n.text) && /random key/.test(n.text)), JSON.stringify(notes));
    } finally {
        stateMeans.container = container;
        chmodSync(state, 0o700);
    }
    assert.deepEqual(readdirSync(state), []);
});

test("a state directory that does not exist is not made: the start says so", async () => {
    const { stateMeans } = await import("../src/state.js");
    const { container } = stateMeans;
    const { dir } = setup();
    const missing = join(dir, "no-such-state");
    try {
        stateMeans.container = () => null;
        await assert.rejects(openServer({ sources, baseDir: dir }, { stateDir: missing }), (e) => /the state directory .*no-such-state does not exist/.test(e.message) && /create .*no-such-state/.test(e.message) && !/volume/.test(e.message));
        stateMeans.container = () => "docker";
        await assert.rejects(openServer({ sources, baseDir: dir }, { stateDir: missing }), /mount a writable volume at .*no-such-state/);
    } finally {
        stateMeans.container = container;
    }
    assert.ok(!existsSync(missing));
});

test("auth.tokens[].file without create is never made; with create it is; a missing directory is refused", async () => {
    const { dir } = setup();
    const without = { sources, auth: { mode: "token", tokens: [{ name: "bot", file: "bot.token" }] }, baseDir: dir };
    await assert.rejects(openServer(without), /the token "bot" \(its file\) is missing/);
    assert.ok(!existsSync(join(dir, "bot.token")));
    const server = await openServer({ ...without, auth: { mode: "token", tokens: [{ name: "bot", file: "bot.token", create: true }] } });
    try {
        const token = valueOf(join(dir, "bot.token"));
        assert.match(token, TOKEN_TEXT);
        assert.equal((await call(`${server.api}/sources`, { token })).status, 200);
        assert.ok(server.log.some((l) => l.message === `created the token "bot" in ${join(dir, "bot.token")}`));
    } finally {
        await server.close();
    }
    await assert.rejects(openServer({ ...without, auth: { mode: "token", tokens: [{ name: "bot", file: "nowhere/bot.token", create: true }] } }), /auth\.tokens\[0\]: .*nowhere.bot\.token cannot be made \(.*its directory does not exist/);
});

test("create: true needs file; secrets another system issues refuse it", () => {
    assert.throws(() => validateOptions({ auth: { mode: "token", tokens: [{ name: "bot", env: "BOT", create: true }] } }), /auth\.tokens\[0\]\.create: create needs file; pivotkit cannot set a variable/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { key: { env: "KEY", create: true } } } }), /output\.downloads\.key: create needs file; pivotkit cannot set a variable/);
    assert.throws(() => validateOptions({ audit: { subject: "hash", key: { env: "KEY", create: true } } }), /audit\.key: create needs file/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { signIn: { clientId: "c", clientSecret: { file: "s", create: true } } } } }), /clientSecret: create: pivotkit cannot make a secret another system issues/);
    assert.throws(() => validateOptions({ sources: { api: { http: { url: "https://api.example.com/rows", auth: { header: { name: "authorization", value: { file: "s", create: true } } } } } } }), /pivotkit cannot make a secret another system issues/);
    // accepted where pivotkit makes the secret
    validateOptions({ output: { dir: "out", downloads: { key: { file: "k", create: true } } }, audit: { subject: "hash", key: { file: "a", create: true } }, auth: { mode: "token", tokens: [{ name: "bot", file: "t", create: true }] } });
});

test("a symbolic link (a mounted Secret) is read, never written; a link to nothing is refused", { skip: !POSIX && "symbolic links need rights on Windows" }, async () => {
    const { dir } = setup();
    mkdirSync(join(dir, "mounted"));
    const value = "a-mounted-token-that-is-long-enough-0123456789";
    writeFileSync(join(dir, "mounted", "..data-token"), `${value}\n`, { mode: 0o600 });
    symlinkSync(join(dir, "mounted", "..data-token"), join(dir, "linked.token"));
    const server = await openServer({ sources, auth: { mode: "token", tokens: [{ name: "bot", file: "linked.token", create: true }] }, baseDir: dir });
    try {
        assert.equal((await call(`${server.api}/sources`, { token: value })).status, 200);
        assert.equal(valueOf(join(dir, "mounted", "..data-token")), value);
        assert.ok(statSync(join(dir, "linked.token")).isFile());
    } finally {
        await server.close();
    }
    symlinkSync(join(dir, "gone"), join(dir, "dangling.token"));
    await assert.rejects(openServer({ sources, auth: { mode: "token", tokens: [{ name: "bot", file: "dangling.token", create: true }] }, baseDir: dir }), /symbolic link to nothing/);
    assert.ok(!existsSync(join(dir, "gone")));
});

/** The start's preparation in a child process, its token file's value on stdout. */
const childPrepare = (state) =>
    new Promise((resolve) => {
        const code = `const { prepareHttpServe } = await import("pivotkit-server/internal"); const { readFileSync } = await import("node:fs"); await prepareHttpServe({}, { env: {}, host: "0.0.0.0", tokenEnv: "PIVOTKIT_TOKEN", stateDir: ${JSON.stringify(state)} }); process.stdout.write(readFileSync(${JSON.stringify(join(state, "secrets", "admin.token"))}, "utf8"));`;
        const child = spawn(process.execPath, ["--input-type=module", "-e", code], { cwd: process.cwd() });
        let out = "";
        child.stdout.on("data", (c) => (out += c));
        child.on("exit", (status) => resolve({ status, out: out.trim() }));
    });

test("starts racing on one state directory end with one token, and no temporary file", async () => {
    const { state, secrets } = setup();
    const env = { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state };
    const [children, ...inProcess] = await Promise.all([Promise.all([childPrepare(state), childPrepare(state)]), ...Array.from({ length: 8 }, () => prepareHttpServe({}, env))]);
    const value = valueOf(join(secrets, "admin.token"));
    for (const child of children) {
        assert.equal(child.status, 0);
        assert.equal(child.out, value);
    }
    assert.equal(inProcess.filter(({ notes }) => notes.some((n) => /^created the token/.test(n.text))).length <= 1, true);
    assert.deepEqual(readdirSync(secrets), ["admin.token"]);
});

test("without hard links: a start that finds the file another start is still writing waits for its value", async () => {
    const { state, secrets } = setup();
    mkdirSync(secrets, { mode: 0o700 });
    const target = join(secrets, "admin.token");
    const value = "the-other-process-token-long-enough-012345";
    writeFileSync(target, "", { mode: 0o600 });
    const later = setTimeout(() => writeFileSync(target, `${value}\n`), 200);
    try {
        const { options } = await prepareHttpServe({ sources, baseDir: state }, { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
        // what the server reads next is the other start's value
        assert.equal(valueOf(options.auth?.tokens?.[0].file ?? ""), value);
    } finally {
        clearTimeout(later);
    }
});

test("a download link works after a restart: the key is kept in the state directory", async () => {
    const { dir, state } = setup();
    // off loopback a link needs the address people open
    const options = { sources, output: { dir: "out" }, http: { publicUrl: "http://localhost" }, baseDir: dir };
    const first = await openServer(options, { stateDir: state });
    const token = valueOf(join(state, "secrets", "admin.token"));
    let url;
    try {
        const r = await call(`${first.api}/views/render`, { token, body: { source: "open", view: BY_REGION, format: "csv", name: "Sales" } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        url = new URL(r.data.output.url);
    } finally {
        await first.close();
    }
    const second = await openServer(options, { stateDir: state });
    try {
        const got = await fetch(`http://127.0.0.1:${second.port}${url.pathname}`);
        assert.equal(got.status, 200);
        assert.match(await got.text(), /North/);
    } finally {
        await second.close();
    }
});

test("audit.subject hash without audit.key: the key is made once, so a person's hash stays the same over a restart", async () => {
    const { auditOf } = await import("../src/auth.js");
    const { auditText } = await import("../src/log.js");
    const { state } = setup();
    const quiet = { warn: () => undefined };
    const hashes = [];
    for (let i = 0; i < 2; i++) {
        const { options } = await prepareHttpServe({ audit: { subject: "hash" }, auth: { mode: "token" }, baseDir: state }, { env: { PIVOTKIT_TOKEN: "a-test-token-that-is-long-enough-0123456789" }, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
        hashes.push(auditText(await auditOf(options, { env: {}, log: quiet }), "https://issuer.example.com", "alice"));
    }
    assert.match(String(hashes[0]), /^[0-9a-f]+$/);
    assert.equal(hashes[0], hashes[1]);
    assert.ok(existsSync(join(state, "secrets", "audit.key")));
});

test("output.dir that is the state directory or holds its secrets is refused", async () => {
    const { dir, state } = setup();
    for (const out of [state, dir, join(state, "secrets"), join(state, "secrets", "reports")]) {
        await assert.rejects(prepareHttpServe({ output: { dir: out }, baseDir: dir }, { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state }), /output\.dir: .* would hold the state directory's secrets/, out);
    }
    assert.deepEqual(readdirSync(state), []);
});

test("the image's built-in configuration: only for the image's path from the variable, with /config missing or empty; a stray file is named", async () => {
    const root = tempDir();
    const paths = { config: join(root, "config", "pivotkit.json"), stateDir: join(root, "state"), example: join(root, "example.csv"), data: join(root, "data") };
    const state = paths.stateDir;
    // /config missing, /data missing
    const missing = await configFrom({ fromEnv: paths.config, stateDir: state, paths });
    assert.equal(missing?.builtIn, true);
    assert.deepEqual(missing?.options, { sources: { example: { file: paths.example, title: "Example sales" } }, output: { dir: join(state, "out") }, policy: { results: true, data: true }, baseDir: join(root, "config") });
    validateOptions(/** @type {any} */ (missing).options);
    // /config empty (an empty ConfigMap's ..data does not count), /data mounted: still only the
    // example; files by path are a setting of a configuration (files.allowDirs), never a default
    mkdirSync(join(root, "config"));
    mkdirSync(join(root, "config", "..data"));
    mkdirSync(paths.data);
    const withData = await configFrom({ fromEnv: paths.config, stateDir: state, paths });
    assert.equal(withData?.builtIn, true);
    assert.equal(withData?.options.files, undefined);
    // without a state directory: no output directory
    assert.equal(builtInConfig(null, paths).output, undefined);
    // a typo is refused with its name
    writeFileSync(join(root, "config", "pivotkit.jsn"), "{}");
    await assert.rejects(configFrom({ fromEnv: paths.config, stateDir: state, paths }), /pivotkit\.json: not found, and .*config holds pivotkit\.jsn; did you mean to name pivotkit\.jsn pivotkit\.json\?/);
    // --config naming a missing file stays an error, as does another path in the variable
    await assert.rejects(configFrom({ flag: paths.config, stateDir: state, paths }), /not found/);
    await assert.rejects(configFrom({ fromEnv: join(root, "elsewhere.json"), stateDir: state, paths }), /not found/);
    // the file there is read
    writeFileSync(paths.config, JSON.stringify({ sources: { mine: { file: "/data/mine.csv" } } }));
    assert.deepEqual(Object.keys((await configFrom({ fromEnv: paths.config, stateDir: state, paths }))?.options.sources ?? {}), ["mine"]);
});

test("the Dockerfile sets the paths state.js names", () => {
    const dockerfile = readFileSync(new URL("../../../docker/Dockerfile", import.meta.url), "utf8");
    assert.match(dockerfile, new RegExp(`PIVOTKIT_CONFIG=${IMAGE_PATHS.config}\\b`));
    assert.match(dockerfile, new RegExp(`${STATE_ENV}=${IMAGE_PATHS.stateDir}\\b`));
    assert.ok(dockerfile.includes(IMAGE_PATHS.example), "the example data is unpacked where the built-in configuration reads it");
    assert.ok(dockerfile.includes(` ${IMAGE_PATHS.stateDir}`), "the state directory is made in the image");
    assert.doesNotMatch(dockerfile, /^VOLUME/m, "no anonymous volume: the state directory and /out are named volumes the operator mounts");
});

test("the hint's --state-dir is one word of the shell where the server runs: a POSIX shell, or PowerShell on Windows", async () => {
    const { shellWord } = await import("../src/state.js");
    assert.equal(shellWord("/var/lib/pivotkit", "linux"), "/var/lib/pivotkit");
    assert.equal(shellWord("/srv/my state/it's", "darwin"), "'/srv/my state/it'\\''s'");
    assert.equal(shellWord("C:\\ProgramData\\pivotkit\\state", "win32"), "C:\\ProgramData\\pivotkit\\state");
    assert.equal(shellWord("D:\\my state\\it's", "win32"), "'D:\\my state\\it''s'");
});

test("the log: created lines once, the token's line with the command for where it runs, never a value", async () => {
    const { stateMeans } = await import("../src/state.js");
    const { container, hostname, namespace } = stateMeans;
    try {
        stateMeans.hostname = () => "pivotkit-7d9f";
        stateMeans.namespace = async () => "team-a";
        for (const [where, env, hint] of /** @type {const} */ ([
            ["kubernetes", { KUBERNETES_SERVICE_HOST: "10.0.0.1" }, "kubectl -n team-a exec pivotkit-7d9f -- pivotkit-server token show admin (in a pod with sidecars add -c <container>)"],
            ["docker", {}, "docker exec <container> pivotkit-server token show admin (replace <container> with the container's name or ID)"],
            ["podman", {}, "podman exec <container> pivotkit-server token show admin (replace <container> with the container's name or ID)"]
        ])) {
            stateMeans.container = (e = {}) => (e.KUBERNETES_SERVICE_HOST ? "kubernetes" : /** @type {any} */ (where === "kubernetes" ? null : where));
            const { dir, state } = setup();
            const server = await openServer({ sources, output: { dir: "out" }, baseDir: dir }, { stateDir: state, env });
            const token = valueOf(join(state, "secrets", "admin.token"));
            const key = valueOf(join(state, "secrets", "downloads.key"));
            await server.close();
            const created = server.log.filter((l) => /^created /.test(l.message ?? ""));
            assert.deepEqual(created.map((l) => [l.level, l.message]), [
                ["info", `created the token "admin" in ${join(state, "secrets", "admin.token")} (keep this directory on a volume)`],
                ["info", `created the download links' key in ${join(state, "secrets", "downloads.key")} (keep this directory on a volume)`]
            ]);
            assert.ok(server.log.some((l) => l.message === `auth: token "admin" from ${join(state, "secrets", "admin.token")}; read it with: ${hint}`), where);
            const text = JSON.stringify(server.log);
            assert.ok(!text.includes(token) && !text.includes(key), "no value on the log");
        }
        // outside a container: the command itself, with --state-dir where the variable does not name it
        stateMeans.container = () => null;
        const { dir, state } = setup();
        const plain = await openServer({ sources, baseDir: dir }, { stateDir: state });
        await plain.close();
        assert.ok(plain.log.some((l) => l.message?.endsWith(`read it with: pivotkit-server token show admin --state-dir ${state}${process.platform === "win32" ? " (PowerShell)" : ""}`)), JSON.stringify(plain.log.map((l) => l.message)));
        // a pod whose namespace file cannot be read: the pod's name alone
        stateMeans.namespace = async () => null;
        stateMeans.container = () => "kubernetes";
        const k8s = setup();
        const noNs = await openServer({ sources, baseDir: k8s.dir }, { stateDir: k8s.state, env: { KUBERNETES_SERVICE_HOST: "10.0.0.1" } });
        await noNs.close();
        assert.ok(noNs.log.some((l) => l.message?.endsWith("read it with: kubectl exec pivotkit-7d9f -- pivotkit-server token show admin (in a pod with sidecars add -c <container>)")), JSON.stringify(noNs.log.map((l) => l.message)));
    } finally {
        stateMeans.container = container;
        stateMeans.hostname = hostname;
        stateMeans.namespace = namespace;
    }
});

test("auth.mode token written without a token and without the variable is refused, never the generated admin (fail closed)", async () => {
    const { dir, state } = setup();
    workspaceWithTokenConfig(dir);
    await assert.rejects(
        prepareHttpServe({ sources, auth: { mode: "token" }, baseDir: dir }, { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state }),
        (e) => e instanceof ConfigError && /auth\.mode is "token", but neither auth\.tokens nor \$PIVOTKIT_TOKEN gives a token/.test(e.message) && /set \$PIVOTKIT_TOKEN/.test(e.message) && /remove auth\.mode/.test(e.message)
    );
    assert.deepEqual(readdirSync(state), []);
    // the runner with --auth token: the same
    const r = run(["serve", "--host", OPEN, "--port", "0", "--auth", "token", "--source", `s=${join(dir, "data", "sales.csv")}`], { env: { [STATE_ENV]: state } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /neither auth\.tokens nor \$PIVOTKIT_TOKEN gives a token/);
    assert.deepEqual(readdirSync(state), []);
    // token show and check-config see no admin there
    const shown = run(["token", "show", "admin", "--state-dir", state, "--config", join(dir, "token.json")], { env: {} });
    assert.equal(shown.status, 2);
    // check-config says the same as the start, and never "the token token"
    const checked = await checkConfig({ sources, auth: { mode: "token" }, http: { host: OPEN }, baseDir: dir }, { http: true, env: {}, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
    const facts = factsOf(checked.text);
    assert.match(facts, /PROBLEM: auth\.mode is "token", but neither auth\.tokens nor \$PIVOTKIT_TOKEN gives a token; set \$PIVOTKIT_TOKEN or list tokens in auth\.tokens, or remove auth\.mode .* to let the server make the token "admin" .* -> the server does not start/);
    assert.doesNotMatch(facts, /token token/);
    // without a state directory there is no admin to point to
    const plainCheck = factsOf((await checkConfig({ sources, auth: { mode: "token" }, http: { host: OPEN }, baseDir: dir }, { http: true, env: {}, tokenEnv: "PIVOTKIT_TOKEN" })).text);
    assert.match(plainCheck, /PROBLEM: auth\.mode is "token", but neither auth\.tokens nor \$PIVOTKIT_TOKEN gives a token; set \$PIVOTKIT_TOKEN or list tokens in auth\.tokens -> the server does not start/);
    // auth not set at all: the generated admin, as before
    const other = setup();
    const unset = await prepareHttpServe({ sources, baseDir: other.dir }, { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: other.state });
    assert.ok(existsSync(join(other.state, "secrets", "admin.token")));
    assert.ok(!unset.notes.some((n) => /neither auth\.tokens/.test(n.text)));
});

test("on the container's own layer the state directory is still used, with a warning", { skip: process.platform === "win32" && "a container's mount table (/proc/self/mountinfo) is Linux's; on Windows the server runs in no Linux container" }, async () => {
    const { stateMeans } = await import("../src/state.js");
    const { container, mountinfo } = stateMeans;
    const { dir, state } = setup();
    try {
        stateMeans.container = () => "docker";
        stateMeans.mountinfo = async () => `1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /proc rw - proc proc rw\n3 1 0:3 / ${dir}/elsewhere rw - ext4 /dev/sda rw\n`;
        const { notes } = await prepareHttpServe({}, { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
        assert.ok(notes.some((n) => n.level === "warn" && /is on the container's own layer: its tokens, keys and reports are lost when the container is removed/.test(n.text)));
        assert.ok(existsSync(join(state, "secrets", "admin.token")));
        // on a volume: no warning
        stateMeans.mountinfo = async () => `1 0 0:1 / / rw - overlay overlay rw\n3 1 0:3 / ${state.replace(/ /g, "\\040")} rw - ext4 /dev/sda rw\n`;
        const onVolume = await prepareHttpServe({}, { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
        assert.ok(!onVolume.notes.some((n) => /own layer/.test(n.text)));
    } finally {
        stateMeans.container = container;
        stateMeans.mountinfo = mountinfo;
    }
});

test("check-config resolves the same files without making them, and has no PROBLEM before the first start", async () => {
    const { stateMeans } = await import("../src/state.js");
    const { container } = stateMeans;
    const { dir, state } = setup();
    // the hint as outside a container, also where the tests run in one
    stateMeans.container = () => null;
    const result = await checkConfig({ sources, output: { dir: "out" }, http: { host: OPEN }, baseDir: dir }, { http: true, env: {}, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", stateDir: state, rest: true });
    const text = factsOf(result.text);
    assert.equal(result.problems, 0, text);
    assert.match(text, /Credentials: state directory .*state \(writable\)/);
    assert.match(text, /the token "admin" \(default of the state directory\): .*admin\.token, made at the first start/);
    assert.match(text, /the download links' key \(default of the state directory\): .*downloads\.key, made at the first start/);
    assert.match(text, /read the token with: pivotkit-server token show admin --state-dir /);
    assert.match(text, /Auth: token/);
    // the notes of 0.2.0 are gone: "New in this version" names this release's changes only
    assert.doesNotMatch(text, /made at the first start in .*an empty \$PIVOTKIT_STATE_DIR keeps the start as before/);
    stateMeans.container = container;
    assert.deepEqual(readdirSync(state), []);
    // the runner, as the image runs it: exit 0, nothing made
    const r = run(["check-config", "--host", OPEN, "--source", `s=${join(dir, "data", "sales.csv")}`], { env: { [STATE_ENV]: state } });
    assert.equal(r.status, 0, r.stdout);
    assert.deepEqual(readdirSync(state), []);
    // after the start: there, and no value printed
    await prepareHttpServe({ sources, output: { dir: "out" }, baseDir: dir }, { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
    const after = run(["check-config", "--host", OPEN, "--source", `s=${join(dir, "data", "sales.csv")}`, "--output", join(dir, "out")], { env: { [STATE_ENV]: state } });
    assert.equal(after.status, 0, after.stdout);
    assert.match(factsOf(after.stdout), /admin\.token, there/);
    assert.ok(!after.stdout.includes(valueOf(join(state, "secrets", "admin.token"))));
});

test("check-config: a state directory that cannot be written is a PROBLEM for the token, a WARNING for a key alone", { skip: (!POSIX || ROOT) && "needs a POSIX user that is not root" }, async () => {
    const { dir, state } = setup();
    chmodSync(state, 0o500);
    try {
        const open = await checkConfig({ sources, http: { host: OPEN }, baseDir: dir }, { http: true, env: {}, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
        assert.match(factsOf(open.text), /PROBLEM: the token "admin" cannot be made in .*admin\.token: .*cannot be written .*-> the server does not start/);
        const keyOnly = await checkConfig({ sources, output: { dir: "out" }, baseDir: dir }, { http: true, env: {}, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
        assert.equal(keyOnly.problems, 0, keyOnly.text);
        assert.match(factsOf(keyOnly.text), /WARNING \(Credentials\): the download links' key cannot be made .*a random key is used/);
    } finally {
        chmodSync(state, 0o700);
    }
});

test("token show: not made before the first start (exit 1, nothing made), then the value; without a configuration; the variable's token", async () => {
    const { dir, state } = setup();
    const before = run(["token", "show", "admin"], { env: { [STATE_ENV]: state } });
    assert.equal(before.status, 1);
    assert.match(before.stderr, /the token "admin" is not created yet .*start the server first/);
    assert.deepEqual(readdirSync(state), []);
    const json = JSON.parse(run(["token", "show", "admin", "--json"], { env: { [STATE_ENV]: state } }).stdout);
    assert.deepEqual([json.ok, json.exitCode, json.error.code], [false, 1, "NOT_CREATED"]);
    await prepareHttpServe({ sources, baseDir: dir }, { env: {}, host: OPEN, tokenEnv: "PIVOTKIT_TOKEN", stateDir: state });
    const value = valueOf(join(state, "secrets", "admin.token"));
    const shown = run(["token", "show", "admin", "--state-dir", state]);
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(shown.stdout, `${value}\n`);
    // the token of $PIVOTKIT_TOKEN is "token"; then no admin is made or shown
    const variable = run(["token", "show", "token", "--state-dir", state], { env: { PIVOTKIT_TOKEN: "a-test-token-that-is-long-enough-0123456789" } });
    assert.equal(variable.stdout, "a-test-token-that-is-long-enough-0123456789\n");
    // pivotkit-mcp's variable, where only it is set: "token" is that one, and no admin is made for it
    const mcpVariable = run(["token", "show", "token", "--state-dir", state], { env: { PIVOTKIT_MCP_TOKEN: "an-mcp-test-token-that-is-long-enough-012345" } });
    assert.equal(mcpVariable.stdout, "an-mcp-test-token-that-is-long-enough-012345\n", mcpVariable.stderr);
    const mcpAdmin = run(["token", "show", "admin", "--state-dir", state], { env: { PIVOTKIT_MCP_TOKEN: "an-mcp-test-token-that-is-long-enough-012345" } });
    assert.equal(mcpAdmin.status, 2, mcpAdmin.stderr);
    assert.match(mcpAdmin.stderr, /no token "admin"/);
    // neither a configuration nor a state directory
    const none = run(["token", "show", "admin"]);
    assert.equal(none.status, 2);
    assert.match(none.stderr, /--state-dir/);
    // a configuration with its own tokens: admin is not one of them
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] } }));
    const own = run(["token", "show", "admin", "--config", config, "--state-dir", state]);
    assert.equal(own.status, 2);
    assert.match(own.stderr, /no token "admin"/);
});

test("PIVOTKIT_TOKEN set while auth is none on loopback: the start and check-config say so; the mode stays none", async () => {
    const dir = workspace();
    const lines = [];
    const env = { PIVOTKIT_TOKEN: "a-test-token-that-is-long-enough-0123456789" };
    const server = await serve({ sources: { sales: { file: "data/sales.csv" } }, http: { port: 0, enable: ["rest"] }, log: { format: "json" }, baseDir: dir }, { env, stderr: { write: (t) => lines.push(...String(t).trim().split("\n").map((l) => JSON.parse(l))) } });
    try {
        assert.equal(server.context.options.auth?.mode ?? "none", "none");
        assert.equal((await call(`${server.url}/api/v1/sources`)).status, 200, "no token needed: the mode is not switched");
    } finally {
        await server.close();
    }
    const said = lines.filter((l) => l.level === "warn").map((l) => l.msg);
    assert.ok(said.includes("PIVOTKIT_TOKEN is set but auth is none; use --auth token (or auth.mode token)"), JSON.stringify(said));
    const text = factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir }, { http: true, env, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true })).text);
    assert.match(text, /^WARNING \([^)]+\): PIVOTKIT_TOKEN is set but auth is none; use --auth token \(or auth\.mode token\)$/m);
    // a written mode, the variable unset, or stdio: no such line
    for (const [options, runtime] of [[{ auth: { mode: "none" } }, { env }], [{}, { env: {} }]]) {
        const quiet = factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir, ...options }, { http: true, name: "pivotkit-server", tokenEnv: "PIVOTKIT_TOKEN", rest: true, ...runtime })).text);
        assert.doesNotMatch(quiet, /is set but auth is none/);
    }
    assert.doesNotMatch(factsOf((await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir }, { http: false, env: { PIVOTKIT_MCP_TOKEN: env.PIVOTKIT_TOKEN } })).text), /is set but auth is none/);
});
