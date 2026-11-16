// pivotkit-mcp with a state directory (pivotkit-server's state.js): over HTTP off loopback a start
// without a token makes its own (the variable is $PIVOTKIT_MCP_TOKEN here), and the MCP endpoint
// takes it; over stdio nothing is made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listen } from "pivotkit-mcp";
import { BIN, httpClient, stdioClient, workspace } from "./helpers.js";

/** A workspace with an empty state directory. */
function setup() {
    const dir = workspace();
    const state = join(dir, "state");
    mkdirSync(state);
    return { dir, state, tokenFile: join(state, "secrets", "admin.token") };
}

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } };

/** A POST to /mcp: its status. */
const post = (url, token) => fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(initialize) }).then(async (r) => (await r.body?.cancel(), r.status));

test("--http off loopback with a state directory: the token admin is made, /mcp answers 401 without it and 200 with it", async () => {
    const { dir, state, tokenFile } = setup();
    const log = [];
    const server = await listen({ sources: { sales: { file: "data/sales.csv" } }, http: { host: "0.0.0.0", port: 0 }, baseDir: dir }, { env: {}, stateDir: state, stderr: { write: (t) => log.push(...String(t).trim().split("\n").map((l) => JSON.parse(l))) } });
    try {
        const token = readFileSync(tokenFile, "utf8").trim();
        const url = `http://127.0.0.1:${server.port}/mcp`;
        assert.equal(await post(url), 401);
        assert.equal(await post(url, token), 200);
        const { client, close } = await httpClient(url, { token });
        try {
            const tools = await client.listTools();
            assert.ok(tools.tools.length > 0);
        } finally {
            await close();
        }
        assert.ok(log.some((l) => /^auth: token "admin" from .*admin\.token; read it with: /.test(l.message ?? "")));
        assert.ok(!JSON.stringify(log).includes(token));
    } finally {
        await server.close();
    }
    // $PIVOTKIT_MCP_TOKEN is this server's variable: with it no file is made
    const other = setup();
    const withVariable = await listen({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, http: { host: "0.0.0.0", port: 0 }, baseDir: other.dir }, { env: { PIVOTKIT_MCP_TOKEN: "a-test-token-that-is-long-enough-0123456789" }, stateDir: other.state, stderr: { write: () => true } });
    await withVariable.close();
    assert.ok(!existsSync(other.tokenFile));
});

test("--http with auth.mode token and no token: refused, fail closed; pivotkit-server's variable is not pivotkit-mcp's", async () => {
    const { dir, state } = setup();
    // $PIVOTKIT_TOKEN is pivotkit-server's: pivotkit-mcp reads $PIVOTKIT_MCP_TOKEN, so this resolves no token
    await assert.rejects(
        listen({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, http: { host: "0.0.0.0", port: 0 }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: "a-test-token-that-is-long-enough-0123456789" }, stateDir: state, stderr: { write: () => true } }),
        /auth\.mode is "token", but neither auth\.tokens nor \$PIVOTKIT_MCP_TOKEN gives a token; set \$PIVOTKIT_MCP_TOKEN/
    );
    assert.deepEqual(readdirSync(state), []);
});

test("the runner reads $PIVOTKIT_STATE_DIR over --http; stdio makes nothing", async () => {
    const { dir, state, tokenFile } = setup();
    const { client, close, stderr } = await stdioClient(["--source", "sales=data/sales.csv", "--output", join(state, "out"), "--host", "0.0.0.0"], { cwd: dir, env: { PIVOTKIT_STATE_DIR: state } });
    try {
        assert.ok((await client.listTools()).tools.length > 0);
    } finally {
        await close();
    }
    assert.ok(!existsSync(join(state, "secrets")), stderr.join(""));
    // over --http the runner makes the token
    const child = spawn(process.execPath, [BIN, "--http", "--host", "0.0.0.0", "--port", "0", "--source", "sales=data/sales.csv"], { cwd: dir, env: { PATH: process.env.PATH ?? "", PIVOTKIT_STATE_DIR: state } });
    try {
        await new Promise((resolve, reject) => {
            let err = "";
            child.stderr.on("data", (c) => {
                err += c;
                if (err.includes('"started"')) resolve(undefined);
            });
            child.on("exit", (code) => reject(new Error(`exited ${code}: ${err}`)));
        });
        assert.ok(existsSync(tokenFile));
        assert.deepEqual(readdirSync(join(state, "secrets")), ["admin.token"]);
    } finally {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
    }
});

test("PIVOTKIT_MCP_TOKEN set while auth is none on loopback: listen says so, and the mode stays none", async () => {
    const dir = workspace();
    const lines = [];
    const server = await listen({ sources: { sales: { file: "data/sales.csv" } }, http: { port: 0 }, log: { format: "json" }, baseDir: dir }, { env: { PIVOTKIT_MCP_TOKEN: "a-test-token-that-is-long-enough-0123456789" }, stderr: { write: (t) => lines.push(...String(t).trim().split("\n").map((l) => JSON.parse(l))) } });
    await server.close();
    assert.ok(lines.some((l) => l.level === "warn" && l.msg === "PIVOTKIT_MCP_TOKEN is set but auth is none; use --auth token (or auth.mode token)"), JSON.stringify(lines.map((l) => l.msg)));
    assert.ok(lines.some((l) => l.msg === "started" && l.auth === "none"));
});
