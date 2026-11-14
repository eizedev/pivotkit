// The command `pivotkit-server` as the container image runs it: its subcommands, the configuration
// by variable, the health check, and a stop (SIGTERM) that lets a running report finish.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "pivotkit-server";
import { BIN, BY_REGION, TOKEN, call, workspace } from "./helpers.js";

const run = (args, { env = {}, cwd } = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, timeout: 30_000 });

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

test("check-config reads the file $PIVOTKIT_CONFIG names and says what REST would expose; 1 when a file is missing", () => {
    const dir = workspace();
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv" }, gone: { file: "data/gone.csv" } }, policy: { profiles: { export: { results: true } } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT", profile: "export" }] }, rest: { cors: { origins: ["https://app.example.com"] } }, output: { dir: "out" } }));
    const res = run(["check-config"], { env: { PIVOTKIT_CONFIG: config } });
    assert.equal(res.status, 1, res.stderr);
    assert.match(res.stdout, /^pivotkit-server: the configuration is valid, but not everything it names is there\./);
    assert.match(res.stdout, /gone: .*\(NOT FOUND\)/);
    assert.match(res.stdout, /token bot from \$BOT: scopes all, profile export/);
    assert.match(res.stdout, /Profile export: .*file downloads \(REST\) allowed/);
    assert.match(res.stdout, /REST: \/api\/v1; files by path refused; inline results off; CORS https:\/\/app\.example\.com; \/openapi\.json auth/);
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
