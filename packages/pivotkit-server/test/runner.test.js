// The command `pivotkit-server` as the container image runs it: its subcommands, the configuration
// by variable, the health check, and a stop (SIGTERM) that lets a running report finish.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { serve } from "pivotkit-server";
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
    const hook = fileURLToPath(new URL("./fixtures/mcp-other-release/hook.js", import.meta.url));
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

test("serve from the command line: REST and MCP on one port, /healthz for healthcheck, and SIGTERM stops it", async () => {
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
        child.kill("SIGTERM");
        const code = await new Promise((resolve) => child.once("exit", (c) => resolve(c)));
        assert.equal(code, 0);
        const dead = spawnSync(process.execPath, [BIN, "healthcheck", `http://127.0.0.1:${port}/healthz`], { encoding: "utf8" });
        assert.equal(dead.status, 1);
    } finally {
        child.kill("SIGKILL");
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

test("/readyz says 503 when the output directory is not writable", { skip: process.getuid?.() === 0 ? "root writes anywhere" : false }, async () => {
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
    // http.port in the configuration file wins for serve and check-config, as before; healthcheck
    // still asks $PIVOTKIT_PORT first and says so
    const config = join(dir, "port.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, http: { port: 3333 } }));
    const fromFile = run(["check-config"], { env: { ...env, PIVOTKIT_CONFIG: config }, cwd: dir });
    assert.equal(fromFile.status, 0, fromFile.stderr);
    assert.equal(run(["healthcheck"], { env: { ...env, PIVOTKIT_CONFIG: config }, cwd: dir }).stderr, said);
    // a port given otherwise wins, as before: --port for serve, a URL for healthcheck
    const check = run(["check-config", "--source", "sales=data/sales.csv", "--port", "3333"], { env, cwd: dir });
    assert.equal(check.status, 0, check.stderr);
    assert.equal(run(["healthcheck", "http://127.0.0.1:1/healthz"], { env }).status, 1);
});
