// The command `pivotkit-server` as the container image runs it: its subcommands, the configuration
// by variable, the health check, and a stop (SIGTERM) that lets a running report finish.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { serve } from "pivotkit-server";
import { fitsRange } from "../src/version-range.js";
import { BIN, BY_REGION, TOKEN, call, factsOf, workspace } from "./helpers.js";

const { version: VERSION } = createRequire(import.meta.url)("../package.json");

const run = (args, { env = {}, cwd } = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, timeout: 30_000 });

/**
 * A start error as the person reads it: serve writes it as a JSON line where stderr is no terminal
 * (the log's auto rule), with the same words in msg; text as it is.
 */
const startError = (stderr, program = "pivotkit-server") => {
    const first = stderr.split("\n")[0];
    if (!first.startsWith("{")) {
        return stderr;
    }
    const line = JSON.parse(first);
    assert.deepEqual([line.level, line.event, line.service], ["error", "error", program]);
    return `${program}: ${line.msg}\n${stderr.slice(first.length + 1)}`;
};

test("help, version, an unknown command; cli and mcp hand over to their packages", () => {
    const help = run(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: pivotkit-server <command>/);
    for (const name of ["serve", "check-config", "mcp", "cli", "healthcheck", "--enable", "PIVOTKIT_TOKEN"]) {
        assert.ok(help.stdout.includes(name), name);
    }
    assert.match(run(["--version"]).stdout, /^pivotkit-server \d+\.\d+\.\d+\n$/);
    const unknown = run(["srve"]);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /unknown command "srve"/);
    assert.equal(run([]).status, 2);
    const typo = run(["serve", "--prot", "1"]);
    assert.equal(typo.status, 2);
    assert.match(typo.stderr, /did you mean --port\?/);
    const cli = run(["cli", "--version"]);
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /pivotkit/);
    const mcp = run(["mcp", "--version"]);
    assert.equal(mcp.status, 0, mcp.stderr);
    assert.match(mcp.stdout, /^pivotkit-mcp /);
});

test("a pivotkit-mcp of another release: serve and mcp say so with both versions, not a missing export", () => {
    // a file URL: --import takes a specifier, and on Windows a path with a drive letter is none
    const hook = new URL("./fixtures/mcp-other-release/hook.js", import.meta.url).href;
    const dir = workspace();
    for (const args of [["serve", "--source", "sales=data/sales.csv", "--port", "0"], ["mcp", "--version"]]) {
        const r = spawnSync(process.execPath, ["--import", hook, BIN, ...args], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH ?? "" }, timeout: 30_000 });
        assert.equal(r.status, 2, `${args[0]}: ${r.stderr}`);
        // the first line: a Node release may warn of the resolution hook below it
        assert.equal(
            startError(r.stderr).split("\n")[0],
            `pivotkit-server: pivotkit-mcp 0.0.1 does not fit pivotkit-server ${VERSION} (it needs pivotkit-server ^0.0.1; The requested module 'pivotkit-server' does not provide an export named 'EXPORT_OF_ANOTHER_RELEASE'). Install pivotkit-server and pivotkit-mcp of one release in one command: https://pivotkit.eize.dev/getting-started/upgrading/#update`,
            args[0]
        );
    }
    // the same for a name of a subpath (pivotkit-server/policy)
    const subpath = spawnSync(process.execPath, ["--import", hook, BIN, "serve", "--source", "sales=data/sales.csv", "--port", "0"], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH ?? "", MCP_STUB: "subpath-export.js" }, timeout: 30_000 });
    assert.equal(subpath.status, 2, subpath.stderr);
    assert.match(startError(subpath.stderr).split("\n")[0], /^pivotkit-server: pivotkit-mcp 0\.0\.1 does not fit pivotkit-server [^ ]+ \(it needs pivotkit-server \^0\.0\.1; The requested module 'pivotkit-server\/policy' does not provide an export named 'EXPORT_OF_ANOTHER_RELEASE'\)\. Install/);
    // a missing export of another package is no mismatch of the two: its own error stays
    const other = spawnSync(process.execPath, ["--import", hook, BIN, "serve", "--source", "sales=data/sales.csv", "--port", "0"], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH ?? "", MCP_STUB: "core-export.js" }, timeout: 30_000 });
    assert.equal(other.status, 2, other.stderr);
    assert.equal(startError(other.stderr).split("\n")[0], "pivotkit-server: could not start: The requested module 'pivotkit-core' does not provide an export named 'EXPORT_OF_ANOTHER_RELEASE'");
});

test("a pivotkit-mcp of another release whose imports resolve: its declared range refuses it, for serve and mcp", () => {
    // a file URL: --import takes a specifier, and on Windows a path with a drive letter is none
    const hook = new URL("./fixtures/mcp-other-release/hook.js", import.meta.url).href;
    const dir = workspace();
    for (const args of [["mcp", "--version"], ["check-config", "--source", "sales=data/sales.csv"]]) {
        const r = spawnSync(process.execPath, ["--import", hook, BIN, ...args], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH ?? "", MCP_STUB: "imports-fine.js" }, timeout: 30_000 });
        if (args[0] === "check-config") {
            // check-config does not load pivotkit-mcp: it starts nothing
            assert.equal(r.status, 0, r.stderr);
            continue;
        }
        assert.equal(r.status, 2, `${args[0]}: ${r.stdout}${r.stderr}`);
        assert.equal(
            startError(r.stderr).split("\n")[0],
            `pivotkit-server: pivotkit-mcp 0.0.1 does not fit pivotkit-server ${VERSION} (it needs pivotkit-server ^0.0.1). Install pivotkit-server and pivotkit-mcp of one release in one command: https://pivotkit.eize.dev/getting-started/upgrading/#update`
        );
    }
    // serve the same, before it listens
    const serving = spawnSync(process.execPath, ["--import", hook, BIN, "serve", "--source", "sales=data/sales.csv", "--port", "0"], { encoding: "utf8", cwd: dir, env: { PATH: process.env.PATH ?? "", MCP_STUB: "imports-fine.js" }, timeout: 30_000 });
    assert.equal(serving.status, 2, serving.stderr);
    assert.match(startError(serving.stderr).split("\n")[0], /^pivotkit-server: pivotkit-mcp 0\.0\.1 does not fit pivotkit-server [^ ]+ \(it needs pivotkit-server \^0\.0\.1\)\. Install/);
});

test("fitsRange reads the ranges npm writes: caret, tilde, exact, comparisons, ||; null for one it cannot read", () => {
    const cases = [
        ["^0.2.0", "0.2.0", true], ["^0.2.0", "0.2.5", true], ["^0.2.0", "0.3.0", false], ["^0.2.0", "0.1.1", false],
        ["^0.0.3", "0.0.3", true], ["^0.0.3", "0.0.4", false], ["^1.2.0", "1.9.0", true], ["^1.2.0", "2.0.0", false],
        ["~0.2.1", "0.2.9", true], ["~0.2.1", "0.3.0", false], ["0.2.0", "0.2.0", true], ["=0.2.0", "0.2.1", false],
        [">=0.2.0 <0.3.0", "0.2.4", true], [">=0.2.0 <0.3.0", "0.3.0", false], ["^0.1.0 || ^0.2.0", "0.2.1", true],
        ["0.2.x", "0.2.7", true], ["0.2.x", "0.3.0", false], ["*", "0.2.0", true],
        ["^0.2.0", "0.2.0-rc.1", false], ["^0.2.0-rc.1", "0.2.0", true],
        ["file:../pivotkit-server", "0.2.0", null], ["latest", "0.2.0", null], ["", "0.2.0", null]
    ];
    for (const [range, version, fits] of cases) {
        assert.equal(fitsRange(range, version), fits, `${range} ${version}`);
    }
});

test("check-config reads the file $PIVOTKIT_CONFIG names and says what REST would expose; 1 when a file is missing", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" }, gone: { file: "data/gone.csv" } }, policy: { profiles: { export: { results: true } } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT", profile: "export" }] }, rest: { cors: { origins: ["https://app.example.com"] } }, output: { dir: "out" } }));
    const unset = run(["check-config"], { env: { PIVOTKIT_CONFIG: config } });
    assert.equal(unset.status, 1, unset.stderr);
    // the verdict and the counts first, then the problems: the token stops the start, the missing file does not
    const said = factsOf(unset.stdout).split("\n");
    assert.deepEqual(said.slice(0, 2), ["pivotkit-server: the server does not start with this configuration.", "2 problems, 0 warnings."]);
    assert.deepEqual(said.slice(3, 5), ["PROBLEM: the token bot ($BOT) is not set or shorter than 32 characters -> the server does not start", "PROBLEM: sources.gone.file: data/gone.csv is not there -> the server starts; gone answers FILE_NOT_AVAILABLE"]);
    const res = run(["check-config"], { env: { PIVOTKIT_CONFIG: config, BOT: TOKEN } });
    assert.equal(res.status, 1, res.stderr);
    const text = factsOf(res.stdout);
    assert.match(text, /^pivotkit-server: the server starts, but not everything will work\.\n1 problem, 0 warnings\./);
    assert.match(text, /\n {2}gone: a file\n {4}\S+gone\.csv\n/);
    assert.match(text, /token bot from \$BOT: all scopes, profile export/);
    assert.match(text, /\nProfile export:\n {2}policy: [^\n]*\n {2}file downloads \(REST\): allowed\n/);
    // what REST does differently from its defaults: here only CORS
    assert.match(text, /\nREST: \/api\/v1\n {2}CORS: https:\/\/app\.example\.com\n/);
    const open = run(["check-config", "--config", config, "--host", "0.0.0.0", "--auth", "none"], { env: { BOT: TOKEN } });
    assert.match(factsOf(open.stdout), /PROBLEM: 0\.0\.0\.0 is not loopback: it needs auth token or oauth \(or auth\.allowUnauthenticated\) -> the server does not start/);
    const bad = run(["check-config", "--config", config, "--enable", "rest,soap"]);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /http\.enable\[1\]: must be one of mcp, rest/);
});

test("serve from the command line: REST and MCP on one port, /healthz for healthcheck, and SIGTERM stops it", async (t) => {
    const dir = workspace();
    const child = spawn(process.execPath, [BIN, "serve", "--source", "sales=data/sales.csv", "--port", "0", "--auth", "token"], { cwd: dir, env: { PATH: process.env.PATH ?? "", PIVOTKIT_TOKEN: TOKEN } });
    const lines = [];
    child.stderr.on("data", (c) => lines.push(...String(c).trim().split("\n")));
    try {
        const started = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`not started: ${lines.join("\n")}`)), 20_000);
            child.stderr.on("data", () => {
                const line = lines.map((l) => JSON.parse(l)).find((l) => l.message === "started");
                if (line) {
                    clearTimeout(timer);
                    resolve(line);
                }
            });
        });
        assert.deepEqual(started.serves, ["rest", "mcp"]);
        assert.equal((await call(`${started.url}/api/v1/sources`, { token: TOKEN })).status, 200);
        const mcp = await fetch(`${started.url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
        assert.equal(mcp.status, 401, "the MCP endpoint is there and asks for the token");
        const port = new URL(started.url).port;
        const ok = spawnSync(process.execPath, [BIN, "healthcheck"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", PIVOTKIT_PORT: port } });
        assert.equal(ok.status, 0, ok.stderr);
        const exited = new Promise((resolve) => child.once("exit", (c) => resolve(c)));
        if (process.platform === "win32") {
            // not tested on Windows: it has no SIGTERM to catch, and CI sends no console Ctrl+C
            t.diagnostic("the graceful stop is not tested on Windows");
            child.kill();
            await exited;
        } else {
            child.kill("SIGTERM");
            assert.equal(await exited, 0);
        }
        const dead = spawnSync(process.execPath, [BIN, "healthcheck", `http://127.0.0.1:${port}/healthz`], { encoding: "utf8" });
        assert.equal(dead.status, 1);
    } finally {
        child.kill("SIGKILL");
    }
});

test("healthcheck probes the port serve listens on: --port, then http.port of the configuration, then $PIVOTKIT_PORT (#439)", async () => {
    const dir = workspace();
    const server = await serve({ sources: { sales: { file: "data/sales.csv" } }, http: { port: 0, enable: ["rest"] }, baseDir: dir, log: "off" }, { env: {}, stderr: { write() {} } });
    try {
        const live = String(server.port);
        const config = join(dir, "live.json");
        writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, http: { port: server.port } }));
        // asynchronous: the server answers in this process
        const probe = (args, env) =>
            new Promise((resolve) => {
                const child = spawn(process.execPath, [BIN, "healthcheck", ...args], { cwd: dir, env: { PATH: process.env.PATH ?? "", ...env } });
                const out = { stdout: "", stderr: "" };
                child.stdout.on("data", (c) => (out.stdout += c));
                child.stderr.on("data", (c) => (out.stderr += c));
                child.on("close", (status) => resolve({ ...out, status }));
            });
        // the image sets PIVOTKIT_PORT; the configuration's http.port wins, as for serve
        for (const port of ["1", "tcp://10.0.0.1:3333"]) {
            const r = await probe([], { PIVOTKIT_PORT: port, PIVOTKIT_CONFIG: config });
            assert.equal(r.status, 0, `${port}: ${r.stderr}`);
        }
        const flagged = await probe(["--port", live], { PIVOTKIT_PORT: "1" });
        assert.equal(flagged.status, 0, flagged.stderr);
        assert.equal((await probe(["--port", "1"], { PIVOTKIT_CONFIG: config })).status, 1, "--port wins over the configuration");
        assert.equal((await probe([], { PIVOTKIT_PORT: live })).status, 0, "the variable without a configured port");
        assert.equal((await probe([`http://127.0.0.1:${live}/healthz`], {})).status, 0);
        const help = await probe(["--help"], {});
        assert.equal(help.status, 0);
        assert.match(help.stdout, /^Usage: pivotkit-server healthcheck \[url\] \[--port <port>\]\n/);
        for (const args of [["--port", "abc"], ["--port"], ["--prot", "1"], ["a", "b"], [`http://127.0.0.1:${live}/healthz`, "--port", live]]) {
            const r = await probe(args, {});
            assert.equal(r.status, 1, args.join(" "));
            assert.match(r.stderr, /^pivotkit-server: healthcheck: .+; pivotkit-server healthcheck --help\n$/, args.join(" "));
        }
    } finally {
        await server.close();
    }
});

test("stopOnSignals: SIGTERM or SIGINT closes the server once and exits 0; a close that throws is logged and exits 1", async () => {
    const { stopOnSignals } = await import("pivotkit-server");
    const { EventEmitter } = await import("node:events");
    for (const [signal, fails] of [["SIGTERM", false], ["SIGINT", true]]) {
        const signals = new EventEmitter();
        const exits = [];
        const errors = [];
        let closed = 0;
        const server = { close: async () => (closed++, fails ? Promise.reject(new Error("socket hang")) : undefined) };
        const log = { error: (e, extra) => errors.push([e.message, extra]) };
        const done = new Promise((resolve) => stopOnSignals(server, { log, stderr: { write: (_t, cb) => cb?.() }, signals, exit: (code) => resolve(exits.push(code)) }));
        signals.emit(signal);
        await done;
        assert.deepEqual([closed, exits], [1, [fails ? 1 : 0]], signal);
        assert.deepEqual(errors, fails ? [["socket hang", { where: "stop" }]] : [], signal);
        assert.equal(signals.listenerCount("SIGINT") + signals.listenerCount("SIGTERM"), 0, "both listeners gone");
    }
});

test("close() lets a running report finish before the server stops", async () => {
    const dir = workspace();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const server = await serve(
        { sources: { slow: { load: async () => (await gate, [{ Region: "North", Sales: 1 }]) } }, http: { port: 0, enable: ["rest"] }, baseDir: dir, log: "off" },
        { env: {}, stderr: { write() {} } }
    );
    const running = call(`${server.url}/api/v1/views/validate`, { body: { source: "slow", view: BY_REGION } });
    await new Promise((r) => setTimeout(r, 100));
    const closing = server.close();
    setTimeout(() => release(), 200);
    const res = await running;
    await closing;
    assert.equal(res.status, 200);
    assert.equal(res.data.valid, true);
});

test("/readyz says 503 when the output directory is not writable", { skip: process.getuid?.() === 0 ? "root writes anywhere" : process.platform === "win32" ? "POSIX modes" : false }, async () => {
    const dir = workspace();
    const server = await serve({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, http: { port: 0, enable: ["rest"] }, baseDir: dir, log: "off" }, { env: {}, stderr: { write() {} } });
    try {
        assert.equal((await call(`${server.url}/readyz`)).status, 200);
        chmodSync(join(dir, "out"), 0o500);
        const res = await call(`${server.url}/readyz`);
        assert.equal(res.status, 503);
        assert.deepEqual(res.data.checks, { auth: true, workers: true, output: false });
    } finally {
        chmodSync(join(dir, "out"), 0o700);
        await server.close();
    }
});

test("PIVOTKIT_PORT as Kubernetes service links set it (tcp://...): serve, check-config and healthcheck name it", () => {
    const dir = workspace();
    const env = { PIVOTKIT_PORT: "tcp://10.0.0.1:3333" };
    const said = 'pivotkit-server: PIVOTKIT_PORT is "tcp://10.0.0.1:3333", which Kubernetes sets for a Service named pivotkit; set enableServiceLinks: false in the pod, or PIVOTKIT_PORT to the port number\n';
    // healthcheck fails with 1: a container's health check reserves 2
    for (const [args, status] of [[["serve", "--source", "sales=data/sales.csv"], 2], [["check-config", "--source", "sales=data/sales.csv"], 2], [["healthcheck"], 1]]) {
        const r = run(args, { env, cwd: dir });
        assert.equal(r.status, status, `${args[0]}: ${r.stderr}`);
        assert.equal(args[0] === "serve" ? startError(r.stderr) : r.stderr, said, args[0]);
    }
    // http.port in the configuration file wins for serve, check-config and healthcheck (#439): the
    // variable is not read then (port 1: nothing answers there, so the probe fails at once)
    const config = join(dir, "port.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, http: { port: 1 } }));
    const fromFile = run(["check-config"], { env: { ...env, PIVOTKIT_CONFIG: config }, cwd: dir });
    assert.equal(fromFile.status, 0, fromFile.stderr);
    const probe = run(["healthcheck"], { env: { ...env, PIVOTKIT_CONFIG: config }, cwd: dir });
    assert.equal(probe.status, 1);
    assert.match(probe.stderr, /^pivotkit-server: http:\/\/127\.0\.0\.1:1\/healthz: /);
    // a port given otherwise wins, as before: --port for serve, a URL for healthcheck
    const check = run(["check-config", "--source", "sales=data/sales.csv", "--port", "3333"], { env, cwd: dir });
    assert.equal(check.status, 0, check.stderr);
    assert.equal(run(["healthcheck", "http://127.0.0.1:1/healthz"], { env }).status, 1);
});
