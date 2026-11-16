// The log in production (#432): every line with level, severity, msg, service and version; the
// request's scope (requestId, traceId from a strictly parsed traceparent, a checked X-Request-Id, the
// addresses) on every line written for it; X-Request-Id on every answer; refused lines with their
// reason; the level of call, request, download and refused lines by their status; the text format
// (logfmt, one line whatever a value holds); log settings from the file, the flags and the
// environment; and no token, value, path or claim on any line in either format.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REFUSED_REASONS, SEVERITY, createContext, flushed, logSettingsOf, optionsFrom, refusalReason, startFields, serve, startErrorLine, traceIdOf, upstreamRequestIdOf, validateOptions, withRequestScope, SERVER_FLAGS } from "pivotkit-server";
import { createLog } from "../src/log.js";
import { uploadCauseOf } from "../src/delivery.js";
import { requestScopeFor } from "../src/request-id.js";
import { GuardedFetchError } from "../src/sources/fetch.js";
import { upstreamCauseOf } from "../src/sources/http.js";
import { BIN, BY_REGION, OTHER_TOKEN, TOKEN, call, raw, workspace } from "./helpers.js";

/** A log on a kept stream: its raw text lines. */
function keptLog(settings, { tty = false, env = {}, version = "0.7.0" } = {}) {
    const lines = [];
    const stream = { isTTY: tty, write: (t) => lines.push(...String(t).split("\n").filter(Boolean)) };
    return { log: createLog(settings, stream, { service: "pivotkit-server", version, env }), lines };
}

/** The scope of the issue's example line. */
const EXAMPLE_SCOPE = Object.freeze({ id: "F0iFBi9CZjQ", traceId: "4bf92f3577b34da6a3ce929d0e0e4736", address: "192.0.2.10" });

/** The issue's example request line. */
const EXAMPLE_ENTRY = Object.freeze({ operation: "describe_source", route: "POST /sources/describe", client: "reports", source: "web", status: 502, code: "SOURCE_UNAVAILABLE", ms: 15 });

test("the spec's example lines: the same request in JSON and in text, field for field", () => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-15T11:12:45.066Z") });
    try {
        const json = keptLog({ format: "json" });
        withRequestScope(EXAMPLE_SCOPE, () => json.log.request({ ...EXAMPLE_ENTRY, requestId: EXAMPLE_SCOPE.id }));
        assert.equal(
            json.lines[0],
            '{"time":"2026-11-15T11:12:45.066Z","level":"error","severity":3,"event":"request","msg":"describe_source failed","service":"pivotkit-server","version":"0.7.0","requestId":"F0iFBi9CZjQ","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","operation":"describe_source","route":"POST /sources/describe","client":"reports","address":"192.0.2.10","source":"web","status":502,"outcome":"error","code":"SOURCE_UNAVAILABLE","ms":15}'
        );
        // the text format leaves out what is the same on every line (severity, service, version) and the trace id
        const text = keptLog({ format: "text" });
        withRequestScope(EXAMPLE_SCOPE, () => text.log.request({ ...EXAMPLE_ENTRY, status: 404, code: "SOURCE_NOT_FOUND" }));
        assert.equal(text.lines[0], 'time=2026-11-15T11:12:45.066Z level=warn event=request msg="describe_source failed" requestId=F0iFBi9CZjQ operation=describe_source route="POST /sources/describe" client=reports address=192.0.2.10 source=web status=404 outcome=error code=SOURCE_NOT_FOUND ms=15');
    } finally {
        mock.timers.reset();
    }
});

test("levels: severity by RFC 5424, call and request lines by status, warn drops successful lines, off writes nothing, started and stopped at every level", () => {
    assert.deepEqual(SEVERITY, { debug: 7, info: 6, warn: 4, error: 3 });
    const all = keptLog("debug");
    all.log.request({ operation: "list_sources", status: 200 });
    all.log.request({ operation: "describe_source", status: 404, code: "SOURCE_NOT_FOUND" });
    all.log.request({ operation: "describe_source", status: 502, code: "SOURCE_UNAVAILABLE" });
    all.log.call({ tool: "render_view", ok: true, status: 200 });
    all.log.call({ tool: "render_view", ok: false, status: 413, code: "LIMIT_EXCEEDED" });
    all.log.refused({ status: 401, reason: "no_token" });
    all.log.debug("details");
    all.log.error(new TypeError("boom: a secret value"), { where: "rest" });
    const parsed = all.lines.map((l) => JSON.parse(l));
    assert.deepEqual(parsed.map((l) => [l.event, l.level, l.severity, l.outcome]), [
        ["request", "info", 6, "ok"],
        ["request", "warn", 4, "error"],
        ["request", "error", 3, "error"],
        ["call", "info", 6, "ok"],
        ["call", "warn", 4, "error"],
        ["refused", "warn", 4, "error"],
        ["debug", "debug", 7, undefined],
        ["error", "error", 3, undefined]
    ]);
    assert.deepEqual(parsed.map((l) => l.msg), ["list_sources ok", "describe_source failed", "describe_source failed", "render_view ok", "render_view failed", "request refused: no_token", "details", "unexpected error"]);
    // the existing fields stay: ok beside outcome, message beside msg, event "warning"
    assert.equal(parsed[3].ok, true);
    const warnOnly = keptLog("warn");
    warnOnly.log.started({ version: "0.7.0" });
    warnOnly.log.request({ operation: "list_sources", status: 200 });
    warnOnly.log.call({ tool: "list_sources", ok: true, status: 200 });
    warnOnly.log.info("output directory full");
    warnOnly.log.warn("a warning");
    warnOnly.log.request({ operation: "describe_source", status: 404 });
    warnOnly.log.stopped({ ms: 3 });
    assert.deepEqual(
        warnOnly.lines.map((l) => JSON.parse(l)).map((l) => [l.event, l.msg, l.message]),
        [
            ["info", "started", "started"],
            ["warning", "a warning", "a warning"],
            ["request", "describe_source failed", undefined],
            ["info", "stopped", "stopped"]
        ]
    );
    const errorOnly = keptLog("error");
    errorOnly.log.warn("a warning");
    errorOnly.log.request({ operation: "describe_source", status: 502 });
    assert.deepEqual(errorOnly.lines.map((l) => JSON.parse(l).status), [502]);
    const off = keptLog("off");
    off.log.started({});
    off.log.error(new Error("x"));
    assert.deepEqual(off.lines, []);
});

test("traceparent: version 00 exactly, lower-case hex, no all-zero ids; a later version by its first fields; anything else gets a new trace", () => {
    assert.equal(traceIdOf("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"), "4bf92f3577b34da6a3ce929d0e0e4736");
    assert.equal(traceIdOf("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-future"), "4bf92f3577b34da6a3ce929d0e0e4736");
    for (const bad of [
        "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
        "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
        "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01,00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e473-00f067aa0ba902b7-01",
        "",
        null
    ]) {
        assert.equal(traceIdOf(bad), null, String(bad));
    }
    const scope = requestScopeFor(new Request("http://localhost/", { headers: { traceparent: "garbage" } }), { address: "::ffff:192.0.2.10" });
    assert.match(scope.traceId, /^[0-9a-f]{32}$/);
    assert.equal(scope.address, "192.0.2.10");
    // X-Request-Id: logged only after its checks, never as the server's own id
    assert.equal(upstreamRequestIdOf("4f6c2a1e-1b2c-4d5e-8f90-0123456789ab"), "4f6c2a1e-1b2c-4d5e-8f90-0123456789ab");
    for (const bad of ["a b", "x".repeat(129), 'id"', "id\nlevel=error", "ü", ""]) {
        assert.equal(upstreamRequestIdOf(bad), undefined, bad);
    }
});

test("text format: one line whatever a value holds; quotes, control, C1, bidi and line separators cannot forge a field or a line", () => {
    const { log, lines } = keptLog({ format: "text" });
    log.warn('x level=error msg="forged"\nnext=line', { source: "\u001b[31mred\u0085\u2028\u202eevil level=error", note: "", list: ["a", "b"], object: { a: 1 } });
    assert.equal(lines.length, 1);
    const line = lines[0];
    assert.doesNotMatch(line, /[\p{Cc}\u2028\u2029\u202e]/u);
    // read as logfmt (a key, "=", then a quoted JSON string or a run without spaces), the line has
    // each key once and the values as written: a quoted value cannot add a field
    const pairs = [...line.matchAll(/([A-Za-z0-9_.-]+)=("(?:[^"\\]|\\.)*"|\S*)(?: |$)/g)].map(([, key, value]) => [key, value.startsWith('"') ? JSON.parse(value) : value]);
    assert.deepEqual(pairs.map(([k]) => k), ["time", "level", "event", "msg", "source", "note", "list", "object"]);
    const fields = Object.fromEntries(pairs);
    assert.deepEqual([fields.level, fields.msg, fields.source], ["warn", 'x level=error msg="forged"next=line', "[31mredevil level=error"]);
    assert.match(line, / note="" list=a,b object="\{\\"a\\":1\}"/);
    // a source is at most 64 characters, the same rule on REST and MCP lines (the logger's)
    const long = keptLog("info");
    long.log.call({ tool: "describe_source", source: "s".repeat(200), status: 200 });
    assert.equal(JSON.parse(long.lines[0]).source.length, 64);
});

test("colour only on a terminal and only without NO_COLOR; auto is text on a terminal and JSON otherwise", () => {
    const tty = keptLog({ format: "auto" }, { tty: true });
    tty.log.warn("w");
    assert.ok(tty.lines[0].includes("level=\u001b[33mwarn\u001b[0m"), tty.lines[0]);
    const plain = keptLog({ format: "auto" }, { tty: true, env: { NO_COLOR: "1" } });
    plain.log.warn("w");
    assert.match(plain.lines[0], /^time=\S+ level=warn event=warning msg=w$/);
    const piped = keptLog({ format: "text" });
    piped.log.warn("w");
    assert.ok(!piped.lines[0].includes("\u001b"));
    const auto = keptLog({ format: "auto" });
    auto.log.warn("w");
    assert.equal(JSON.parse(auto.lines[0]).level, "warn");
});

test("log settings: the short form stays, the object form is checked, a flag wins over the file and the file over the environment", async () => {
    assert.deepEqual(logSettingsOf("debug"), { level: "debug", format: "auto", address: "on" });
    validateOptions({ log: "warn" });
    validateOptions({ log: { level: "error", format: "text", address: "off" } });
    assert.throws(() => validateOptions({ log: { format: "xml" } }), /log\.format: must be one of auto, text, json/);
    assert.throws(() => validateOptions({ log: "loud" }), /log: must be one of debug, info, warn, error, off/);
    const dir = workspace();
    const file = join(dir, "pivotkit.json");
    writeFileSync(file, JSON.stringify({ log: "debug" }));
    const env = { PIVOTKIT_LOG_FORMAT: "json", PIVOTKIT_LOG_LEVEL: "error", PIVOTKIT_LOG_ADDRESS: "off" };
    const fromEnv = await optionsFrom(["--config", file], env, { flags: SERVER_FLAGS, configEnv: "X" });
    assert.deepEqual(fromEnv.options.log, { level: "debug", format: "json", address: "off" }, "the file's level, the rest from the environment");
    const flagged = await optionsFrom(["--config", file, "--log", "warn", "--log-format", "text"], env, { flags: SERVER_FLAGS, configEnv: "X" });
    assert.deepEqual(flagged.options.log, { level: "warn", format: "text", address: "off" });
    const untouched = await optionsFrom(["--config", file], {}, { flags: SERVER_FLAGS, configEnv: "X" });
    assert.equal(untouched.options.log, "debug");
    await assert.rejects(optionsFrom(["--log-format", "xml"], {}, { flags: SERVER_FLAGS, configEnv: "X" }), /--log-format must be auto, text or json/);
    await assert.rejects(optionsFrom([], { PIVOTKIT_LOG_LEVEL: "loud" }, { flags: SERVER_FLAGS, configEnv: "X" }), /PIVOTKIT_LOG_LEVEL is "loud"; it must be debug, info, warn, error or off/);
});

test("refusal reasons: the token's by the request, the rest by the answer's code", () => {
    assert.equal(refusalReason("INVALID_TOKEN", new Request("http://localhost/")), "no_token");
    assert.equal(refusalReason("INVALID_TOKEN", new Request("http://localhost/", { headers: { authorization: "Bearer x" } })), "bad_token");
    assert.deepEqual(["RATE_LIMITED", "BODY_TOO_LARGE", "FORBIDDEN_HOST", "FORBIDDEN_ORIGIN"].map((c) => refusalReason(c)), ["rate_limited", "body_too_large", "host", "origin"]);
});

test("upstream causes: one word per kind of failure, never the error's text", () => {
    const of = (code, message, cause) => upstreamCauseOf(new GuardedFetchError(code, message, cause ? { cause } : {}));
    assert.equal(of("TIMEOUT", "no complete answer"), "timeout");
    assert.equal(of("NETWORK", "the connection failed (ECONNREFUSED)"), "connection");
    assert.equal(of("NETWORK", "the connection failed (ENOTFOUND)"), "dns");
    assert.equal(of("NETWORK", "the name has no address"), "dns");
    assert.equal(of("NETWORK", "the connection failed (x)", Object.assign(new Error("x"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" })), "tls");
    assert.equal(of("REFUSED_ADDRESS", "private"), "blocked_address");
    assert.equal(of("REDIRECT", "301"), "http_status");
    assert.equal(of("TOO_LARGE", "larger"), "bad_body");
    assert.equal(of("BAD_HEADER", "bad"), "setup");
});

/** A server whose stderr is kept as raw text (to read in either format). */
async function rawServer(options, env = {}) {
    const text = [];
    const server = await serve({ ...options, http: { port: 0, enable: ["rest"], ...options.http } }, { env, stderr: { write: (t) => text.push(String(t)) } });
    return { server, text, api: `${server.url}/api/v1` };
}

test("X-Request-Id on every answer, the same id as its log lines; traceparent and X-Request-Id of a proxy logged, never as the server's id", async () => {
    const dir = workspace();
    const { server, text, api } = await rawServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, http: { trustProxy: true }, log: { format: "json" }, baseDir: dir }, { PIVOTKIT_TOKEN: TOKEN });
    try {
        const answers = [
            await call(`${api}/sources`, { token: TOKEN, headers: { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "x-request-id": "proxy-1", "x-forwarded-for": "198.51.100.7, 203.0.113.9" } }),
            await call(`${api}/sources`),
            await call(`${api}/sources`, { token: OTHER_TOKEN }),
            await call(`${api}/nothing`, { token: TOKEN }),
            await call(`${server.url}/healthz`),
            await call(`${api}/sources/describe`, { token: TOKEN, body: { source: "sales", pad: "x".repeat(2_200_000) } })
        ];
        const hostile = await raw(`${api}/sources`, { headers: { host: "evil.example" } });
        for (const answer of answers) {
            assert.match(answer.headers.get("x-request-id") ?? "", /^[A-Za-z0-9_-]{11}$/);
        }
        assert.match(String(hostile.headers["x-request-id"]), /^[A-Za-z0-9_-]{11}$/);
        assert.equal(new Set(answers.map((a) => a.headers.get("x-request-id"))).size, answers.length, "one id per request");
        const lines = text.join("").trim().split("\n").map((l) => JSON.parse(l));
        const byId = (answer) => lines.filter((l) => l.requestId === answer.headers.get("x-request-id"));
        const [ok, noToken, badToken, , , tooLarge] = answers;
        const request = byId(ok).find((l) => l.event === "request");
        assert.deepEqual([request.traceId, request.upstreamRequestId, request.address, request.peerAddress], ["4bf92f3577b34da6a3ce929d0e0e4736", "proxy-1", "203.0.113.9", "127.0.0.1"]);
        assert.equal(byId(noToken).find((l) => l.event === "refused").reason, "no_token");
        assert.equal(byId(badToken).find((l) => l.event === "refused").reason, "bad_token");
        const large = byId(tooLarge).find((l) => l.event === "refused");
        assert.deepEqual([large.reason, large.limit, large.size > 2_200_000], ["body_too_large", 2_097_152, true]);
        assert.equal(tooLarge.data.requestId, tooLarge.headers.get("x-request-id"), "the problem names the header's id");
        assert.ok(lines.filter((l) => l.event === "refused").every((l) => typeof l.requestId === "string" && typeof l.reason === "string"));
        for (const line of lines) {
            assert.deepEqual([typeof line.time, typeof line.level, typeof line.severity, typeof line.msg, line.service, typeof line.version], ["string", "string", "number", "string", "pivotkit-server", "string"]);
        }
    } finally {
        await server.close();
    }
    const stopped = text.join("").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
    assert.equal(stopped.msg, "stopped");
});

test("log.address off: no address and no forwarded client on any line", async () => {
    const dir = workspace();
    const { server, text, api } = await rawServer({ sources: { sales: { file: "data/sales.csv" } }, http: { trustProxy: true }, log: { format: "json", address: "off" }, baseDir: dir });
    try {
        await call(`${api}/sources`, { headers: { "x-forwarded-for": "203.0.113.9" } });
        await call(`${api}/sources/describe`, { body: { source: "nope" } });
    } finally {
        await server.close();
    }
    const all = text.join("");
    assert.ok(all.includes('"event":"request"'));
    assert.doesNotMatch(all, /"address"|"peerAddress"|203\.0\.113\.9/);
});

test("log.address off: no address on the start, request, MCP call, refused, parser-error and refused-connection lines, in JSON and in text", async () => {
    const forwarded = { "x-forwarded-for": "203.0.113.9" };
    for (const format of ["json", "text"]) {
        const dir = workspace();
        const { server, text, api } = await rawServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, http: { trustProxy: true, enable: ["rest", "mcp"] }, log: { format, level: "debug", address: "off" }, baseDir: dir }, { PIVOTKIT_TOKEN: TOKEN });
        try {
            await call(`${api}/sources`, { token: TOKEN, headers: forwarded });
            await call(`${api}/sources`, { token: OTHER_TOKEN, headers: forwarded });
            await raw(`${api}/sources`, { headers: { ...forwarded, host: "evil.example" } });
            const rpc = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", authorization: `Bearer ${TOKEN}`, ...forwarded };
            await fetch(`${server.url}/mcp`, { method: "POST", headers: rpc, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_sources", arguments: {} } }) }).then((r) => r.text());
            await fetch(`${server.url}/mcp`, { method: "POST", headers: { ...rpc, authorization: `Bearer ${OTHER_TOKEN}` }, body: "{}" }).then((r) => r.text());
            // a request the HTTP parser refuses
            const { port } = new URL(server.url);
            await new Promise((resolve) => {
                const socket = connect(Number(port), "127.0.0.1", () => socket.end("NOT HTTP\r\n\r\n"));
                socket.on("close", resolve).on("error", resolve).resume();
            });
        } finally {
            await server.close();
        }
        // refused connections (serve's onRefused) are a warning with the address as a field: a loopback
        // client is never refused, so the line is written here as serve writes it
        const log = createLog({ format, address: "off" }, { write: (t) => text.push(String(t)) });
        log.warn("connections refused since the last report: an address held as many as http.maxConnectionsPerAddress allows", { address: "203.0.113.9", limits: ["perAddress"], open: 9, fromAddress: 1, refused: 2 });
        const all = text.join("");
        for (const event of format === "json" ? ['"event":"request"', '"event":"call"', '"event":"refused"', '"msg":"started"', '"parserError"', "connections refused since the last report"] : ["event=request", "event=call", "event=refused", "msg=started", "parserError=", "connections refused since the last report"]) {
            assert.ok(all.includes(event), `${format}: ${event} in\n${all}`);
        }
        assert.doesNotMatch(all, format === "json" ? /"address"|"peerAddress"|203\.0\.113\.9/ : /\baddress=|peerAddress=|203\.0\.113\.9/, format);
    }
});

test("redaction: no token, value, claim or path on any line, in JSON and in text, at info (and no token at debug)", async () => {
    const SECRET_VALUE = "SecretRegion-7f3a";
    for (const [format, level] of [["json", "info"], ["text", "info"], ["json", "debug"], ["text", "debug"]]) {
        const dir = workspace({ "sales.csv": `Region,Sales,Customer\n${SECRET_VALUE},10,Alice Example\nNorth,5,Bob Example\n` });
        const { server, text, api } = await rawServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show", fields: { Customer: "hide" } } } }, auth: { mode: "token" }, output: { dir: "out" }, http: { enable: ["rest", "mcp"] }, log: { format, level }, baseDir: dir }, { PIVOTKIT_TOKEN: TOKEN });
        try {
            await call(`${api}/views/render`, { token: TOKEN, body: { source: "sales", view: { ...BY_REGION, filters: [{ field: "Region", type: "in", items: [SECRET_VALUE] }] }, format: "csv" } });
            await call(`${api}/views/render`, { token: TOKEN, body: { source: "sales", view: { rows: ["Customer"], values: [{ field: "Sales", agg: "sum" }] } } });
            await call(`${api}/sources/describe`, { token: TOKEN, body: { source: `${dir}/data/sales.csv` } });
            await call(`${api}/sources`, { token: OTHER_TOKEN });
            await call(`${api}/sources`, { headers: { authorization: `Bearer ${OTHER_TOKEN}`, cookie: "session=abc" } });
            // the same over MCP: a call with the value in its view, and a refused token
            const mcpHeaders = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
            const tool = (token) => fetch(`${server.url}/mcp`, { method: "POST", headers: { ...mcpHeaders, authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "render_view", arguments: { source: "sales", view: { ...BY_REGION, filters: [{ field: "Region", type: "in", items: [SECRET_VALUE] }] }, format: "csv" } } }) }).then((r) => r.text());
            await tool(TOKEN);
            await tool(OTHER_TOKEN);
        } finally {
            await server.close();
        }
        const all = text.join("");
        assert.ok(all.split("\n").filter(Boolean).length >= 5, `${format} ${level}: lines were written`);
        assert.ok(all.includes("render_view ok"), `${format} ${level}: the MCP call was logged`);
        for (const secret of [TOKEN, OTHER_TOKEN, "session=abc"]) {
            assert.ok(!all.includes(secret), `${format} ${level}: ${secret.slice(0, 8)}... is not logged`);
        }
        if (level === "info") {
            for (const secret of [SECRET_VALUE, "Alice Example", dir]) {
                assert.ok(!all.includes(secret), `${format} ${level}: ${secret.slice(0, 12)} is not logged`);
            }
        }
        if (format === "text") {
            assert.doesNotMatch(all, /^\{/m, "text lines are not JSON");
        }
    }
});

test("serve's start error follows the log's rule: JSON where stderr is no terminal or json is asked for, text when text is asked for", () => {
    const json = spawnSync(process.execPath, [BIN, "serve", "--config", "/nonexistent/pivotkit.json"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", PIVOTKIT_LOG_FORMAT: "json" } });
    assert.equal(json.status, 2);
    const line = JSON.parse(json.stderr);
    assert.deepEqual([line.level, line.severity, line.event, line.service, line.code], ["error", 3, "error", "pivotkit-server", "CONFIG"]);
    assert.match(line.msg, /pivotkit\.json/);
    const auto = spawnSync(process.execPath, [BIN, "serve", "--config", "/nonexistent/pivotkit.json"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
    assert.equal(JSON.parse(auto.stderr).code, "CONFIG", "auto on a pipe: JSON");
    const text = spawnSync(process.execPath, [BIN, "serve", "--log-format", "text", "--config", "/nonexistent/pivotkit.json"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", PIVOTKIT_LOG_FORMAT: "json" } });
    assert.match(text.stderr, /^pivotkit-server: .*pivotkit\.json/, "the flag wins over the variable");
    assert.equal(startErrorLine("text", "x", { service: "s", version: "1" }), null);
});

test("flushed: resolves when the stream says its write is out, or after a second for one that never says", async () => {
    let said = false;
    await flushed({ write: (_t, done) => setTimeout(() => ((said = true), done?.()), 5) });
    assert.ok(said);
    const started = Date.now();
    await flushed({ write: () => true });
    assert.ok(Date.now() - started >= 900);
});

test("a context names its program and version on every line", async () => {
    const lines = [];
    const context = await createContext({ sources: {} }, { stderr: { write: (t) => lines.push(JSON.parse(t)) }, service: { name: "pivotkit-mcp", version: "9.9.9" } });
    try {
        context.log.info("hello");
        assert.deepEqual([lines[0].service, lines[0].version], ["pivotkit-mcp", "9.9.9"]);
    } finally {
        await context.close();
    }
});

test("redaction with OAuth: no token, claim, group or subject on any line, in JSON and in text, a refused token included", async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import("jose");
    const { createServer } = await import("node:http");
    const key = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    let issuer = "";
    const issuerServer = createServer((req, res) => {
        res.writeHead(req.url === "/.well-known/openid-configuration" || req.url === "/jwks" ? 200 : 404, { "content-type": "application/json" });
        res.end(req.url === "/jwks" ? JSON.stringify({ keys: [jwk] }) : JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] }));
    });
    await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${/** @type {any} */ (issuerServer.address()).port}`;
    const CLAIMS = { email: "ana.secret@example.com", groups: ["grp-finance-secret"], team: "team-secret-blue" };
    const tokenOf = (aud, signWith = key.privateKey) => new SignJWT({ scope: "pivotkit", client_id: "report-bot", ...CLAIMS }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience(aud).setSubject("subject-secret-4711").setIssuedAt().setExpirationTime("5m").sign(signWith);
    try {
        for (const format of ["json", "text"]) {
            const dir = workspace();
            const { server, text, api } = await rawServer({ sources: { sales: { file: "data/sales.csv", policy: { fields: { Region: "show" } } } }, auth: { mode: "oauth", issuer, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"], groupsClaim: "groups", groupProfiles: [{ group: "grp-finance-secret", profile: "fin" }] }, policy: { profiles: { fin: { default: "summary" } } }, http: { publicUrl: "https://pk.example.com/" }, log: { format }, baseDir: dir });
            try {
                for (let i = 0; i < 50 && (await call(`${server.url}/readyz`)).status !== 200; i++) {
                    await new Promise((r) => setTimeout(r, 50));
                }
                const good = await tokenOf("https://pk.example.com/api/v1");
                const wrongAudience = await tokenOf("https://elsewhere.example.com/");
                const forged = await tokenOf("https://pk.example.com/api/v1", (await generateKeyPair("RS256")).privateKey);
                assert.equal((await call(`${api}/sources`, { token: good })).status, 200);
                await call(`${api}/sources`, { token: wrongAudience });
                await call(`${api}/sources`, { token: forged });
                const all = text.join("");
                assert.ok(all.includes("report-bot"), "the client is named");
                for (const secret of [good, wrongAudience, forged, good.split(".")[1], ...Object.values(CLAIMS).flat(), "subject-secret-4711"]) {
                    assert.ok(!all.includes(secret), `${format}: ${String(secret).slice(0, 12)}... is not logged`);
                }
                assert.equal((all.match(/bad_token/g) ?? []).length >= 2, true);
            } finally {
                await server.close();
            }
        }
    } finally {
        await new Promise((resolve) => issuerServer.close(resolve));
    }
});

test("a host that serves the handler itself: every answer still names its id in X-Request-Id, the same as its lines; the handler's trustProxy wins", async () => {
    const { createServerHandler } = await import("pivotkit-server");
    const dir = workspace();
    const lines = [];
    const handler = await createServerHandler({ sources: { sales: { file: "data/sales.csv" } }, http: { enable: ["rest"], trustProxy: true }, baseDir: dir }, { env: {}, stderr: { write: (t) => lines.push(JSON.parse(t)) }, loopback: true });
    try {
        const info = { address: "::ffff:192.0.2.44" };
        const request = new Request("http://localhost/api/v1/sources/describe", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify({ source: "nope" }) });
        const answer = await handler.fetch(request, info);
        const id = answer.headers.get("x-request-id");
        assert.match(id ?? "", /^[A-Za-z0-9_-]{11}$/);
        const line = lines.find((l) => l.event === "request");
        assert.deepEqual([line.requestId, line.address, line.peerAddress, line.status], [id, "203.0.113.9", "192.0.2.44", 404]);
        const health = await handler.fetch(new Request("http://localhost/healthz"));
        assert.match(health.headers.get("x-request-id") ?? "", /^[A-Za-z0-9_-]{11}$/);
    } finally {
        await handler.close();
    }
});

test("addresses: behind a trusted proxy address is the forwarded client and peerAddress the proxy; a forwarded value that is no IP address is \"invalid\", never the proxy's", () => {
    const at = (headers, trustProxy, socket = "::ffff:10.0.0.5") => requestScopeFor(new Request("http://localhost/", { headers }), { address: socket }, { trustProxy });
    assert.deepEqual([at({}, false).address, at({}, false).peerAddress], ["10.0.0.5", undefined]);
    assert.deepEqual([at({ "x-forwarded-for": "203.0.113.9" }, false).address, at({ "x-forwarded-for": "203.0.113.9" }, false).peerAddress], ["10.0.0.5", undefined], "no trust, no forwarded address");
    const proxied = at({ "x-forwarded-for": "198.51.100.7, 2001:db8::7" }, true);
    assert.deepEqual([proxied.address, proxied.peerAddress], ["2001:db8::7", "10.0.0.5"]);
    for (const forged of ["evil\u009b31m", "not-an-ip", "203.0.113.9 level=error", "999.1.1.1"]) {
        const scope = at({ "x-forwarded-for": `198.51.100.7, ${forged}` }, true);
        assert.deepEqual([scope.address, scope.peerAddress], ["invalid", "10.0.0.5"], JSON.stringify(forged));
    }
    // the proxy itself in front of a loopback server: one address when both are the same
    const same = at({ "x-forwarded-for": "127.0.0.1" }, true, "127.0.0.1");
    assert.deepEqual([same.address, same.peerAddress], ["127.0.0.1", undefined]);
});

test("JSON lines: every text value without C0, C1 or bidi controls, a Host and an Origin of a refused request too", async () => {
    const { log, lines } = keptLog({ format: "json" });
    log.refused({ status: 403, reason: "host", host: "evil\u009b[31m.example\u202e", origin: "https://x\u0085y", nested: { list: ["a\u009bb"] } });
    assert.equal(lines.length, 1);
    assert.doesNotMatch(lines[0], /[\p{Cc}\u2028\u2029\u202e]/u);
    assert.ok(!Buffer.from(lines[0]).includes(Buffer.from([0xc2, 0x9b])), "no raw C1 byte pair");
    const line = JSON.parse(lines[0]);
    assert.deepEqual([line.host, line.origin, line.nested.list[0]], ["evil[31m.example", "https://xy", "ab"]);
    // the same through a real server: a Host with a C1 control is refused, and its line holds none
    const dir = workspace();
    const { server, text } = await rawServer({ sources: { sales: { file: "data/sales.csv" } }, log: { format: "json" }, baseDir: dir });
    try {
        await raw(`${server.url}/api/v1/sources`, { headers: { host: Buffer.from("evil\u009b.example", "latin1").toString("latin1"), origin: "https://o\u0085.example" } }).catch(() => undefined);
    } finally {
        await server.close();
    }
    assert.ok(text.join("").includes('"reason":"host"'), "the refused Host was logged");
    assert.ok(!Buffer.from(text.join("")).includes(Buffer.from([0xc2, 0x9b])));
    assert.ok(!Buffer.from(text.join("")).includes(Buffer.from([0xc2, 0x85])));
});

test("started: token names and source ids at most 64 characters, without controls; logAddress only over HTTP", () => {
    const fields = startFields({ auth: { mode: "token", tokens: [{ name: `${"t".repeat(100)}\u009b`, env: "X" }] } }, { ids: () => ["sales"] }, { level: "info", format: "json", address: "on" });
    assert.equal(fields.tokens[0], "t".repeat(64));
    assert.equal(fields.logAddress, "on");
    assert.equal(startFields({}, { ids: () => [] }, { level: "info", format: "json", address: "on" }, { http: false }).logAddress, undefined);
});

test("refusal reasons: every code the servers refuse with has a reason of its own; an unmapped one is its own name, never bad_request", () => {
    // the codes passed to refusalReason anywhere in pivotkit-server and pivotkit-mcp
    const sources = ["../src", "../src/rest", "../../pivotkit-mcp/src"].flatMap((dir) => readdirSync(new URL(dir, import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => readFileSync(new URL(`${dir}/${f}`, import.meta.url), "utf8")));
    const codes = new Set(sources.flatMap((text) => [...text.matchAll(/refusalReason\("([A-Z_]+)"/g)].map((m) => m[1])));
    assert.ok(codes.size >= 10, [...codes].join(", "));
    for (const code of codes) {
        assert.ok(REFUSED_REASONS.includes(refusalReason(code)), `${code} has no reason of its own`);
    }
    assert.equal(refusalReason("SOMETHING_NEW"), "something_new");
});

test("upload causes: a store's status, its answer, the network and the rest", () => {
    assert.deepEqual(["STORE_503", "PRESIGN_403", "STORE_ANSWER", "LINK_TOO_LONG", "TIMEOUT", "STORE_NETWORK", "PRESIGN_REFUSED_ADDRESS", "SECRET", "TOO_LARGE", "INTERNAL"].map(uploadCauseOf), ["http_status", "http_status", "bad_body", "bad_body", "timeout", "connection", "blocked_address", "setup", "upload_failed", "upload_failed"]);
});

test("debug-level refusals: a path nobody serves and a GET of the MCP endpoint are on the debug log only; a request the HTTP parser refuses is a warning with an id", async () => {
    const dir = workspace();
    for (const level of ["info", "debug"]) {
        const { server, text } = await rawServer({ sources: { sales: { file: "data/sales.csv" } }, http: { enable: ["rest", "mcp"] }, log: { format: "json", level }, baseDir: dir });
        try {
            await call(`${server.url}/wp-admin.php`);
            await fetch(`${server.url}/mcp`, { headers: { accept: "text/event-stream" } });
            const broken = await new Promise((resolve) => {
                import("node:net").then(({ connect }) => {
                    const socket = connect(Number(new URL(server.url).port), "127.0.0.1", () => socket.write("GET / HTTP/1.1\r\nHost: localhost\r\nBad Header Line\r\n\r\n"));
                    let answer = "";
                    socket.on("data", (d) => (answer += d));
                    socket.on("close", () => resolve(answer));
                });
            });
            assert.match(String(broken), /^HTTP\/1\.1 400 Bad Request\r\n[\s\S]*X-Request-Id: ([A-Za-z0-9_-]{11})/);
            const id = /X-Request-Id: ([A-Za-z0-9_-]{11})/.exec(String(broken))?.[1];
            const lines = text.join("").trim().split("\n").map((l) => JSON.parse(l));
            const refused = lines.filter((l) => l.event === "refused");
            const parser = refused.find((l) => l.requestId === id);
            assert.deepEqual([parser?.level, parser?.status, parser?.reason, parser?.address, typeof parser?.parserError], ["warn", 400, "bad_request", "127.0.0.1", "string"]);
            const quiet = refused.filter((l) => l.level === "debug").map((l) => l.reason).sort();
            assert.deepEqual(quiet, level === "debug" ? ["method_not_allowed", "not_found"] : []);
        } finally {
            await server.close();
        }
    }
});

test("every 4xx answer has exactly one line under its X-Request-Id: what the MCP SDK refuses without reporting it, REST's wrong method and unknown route; never the body", async () => {
    const dir = workspace();
    const mcpHeaders = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
    const listTools = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    // [name, path, request, status, reason, level]
    const cases = [
        ["MCP: a body that is not JSON", "/mcp", { method: "POST", headers: mcpHeaders, body: '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"render_view","arguments":{"data":{"rows":[["MKR-BODY-1"]' }, 400, "bad_request", "warn"],
        ["MCP: an unsupported mcp-protocol-version", "/mcp", { method: "POST", headers: { ...mcpHeaders, "mcp-protocol-version": "1999-01-01" }, body: listTools }, 400, "bad_request", "warn"],
        ["MCP: a wrong content type", "/mcp", { method: "POST", headers: { ...mcpHeaders, "content-type": "text/plain" }, body: listTools }, 415, "unsupported_media_type", "warn"],
        ["MCP: a GET (a client opening a stream)", "/mcp", { method: "GET", headers: { accept: "text/event-stream" } }, 405, "method_not_allowed", "debug"],
        ["a path nobody serves", "/nothing-here", { method: "GET" }, 404, "not_found", "debug"],
        ["REST: a wrong method", "/api/v1/sources", { method: "DELETE" }, 405, "method_not_allowed", "debug"],
        ["REST: an unknown route", "/api/v1/nope", { method: "GET" }, 404, "not_found", "debug"],
        ["REST: a POST of /openapi.json", "/openapi.json", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, 405, "method_not_allowed", "debug"],
        ["REST: a body that is not JSON", "/api/v1/views/validate", { method: "POST", headers: { "content-type": "application/json" }, body: '{"source":"MKR-BODY-2' }, 400, null, "warn"]
    ];
    for (const level of ["debug", "info"]) {
        const { server, text } = await rawServer({ sources: { sales: { file: "data/sales.csv" } }, http: { enable: ["rest", "mcp"] }, log: { format: "json", level }, baseDir: dir });
        try {
            const answers = [];
            for (const [name, path, request, status] of cases) {
                const answer = await raw(`${server.url}${path}`, request);
                assert.equal(answer.status, status, `${name}: ${JSON.stringify(answer.data)}`);
                assert.match(String(answer.headers["x-request-id"]), /^[A-Za-z0-9_-]{11}$/, name);
                answers.push(answer);
            }
            const lines = text.join("").trim().split("\n").map((l) => JSON.parse(l));
            cases.forEach(([name, path, , status, reason, lineLevel], i) => {
                const mine = lines.filter((l) => l.requestId === answers[i].headers["x-request-id"]);
                if (level === "info" && lineLevel === "debug") {
                    assert.deepEqual(mine, [], `${name}: kept to the debug log`);
                    return;
                }
                assert.equal(mine.length, 1, `${name}: ${JSON.stringify(mine)}`);
                const [line] = mine;
                assert.equal(line.level, lineLevel, name);
                assert.equal(line.status, status, name);
                if (reason) {
                    // a request refused before it reached an operation
                    assert.deepEqual([line.event, line.reason, line.path], ["refused", reason, path.startsWith("/api/v1") ? "/api/v1" : path === "/nothing-here" ? undefined : path], name);
                } else {
                    // one that reached its operation keeps its request line
                    assert.equal(line.event, "request", name);
                }
            });
            assert.ok(!text.join("").includes("MKR-"), "no part of a refused body is logged");
        } finally {
            await server.close();
        }
    }
});

test("an error answer with no line of its own: a 5xx gets an error-level refused line whose reason is the problem's code; /readyz says only when readiness changes", async () => {
    const dir = workspace();
    // an issuer nothing listens on: its metadata never loads, so the REST resource's metadata is 503 AUTH_NOT_READY
    const { server, text } = await rawServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "oauth", issuer: "http://127.0.0.1:9/issuer", resource: "http://127.0.0.1:3333/api/v1", allowInsecureIssuer: true }, log: { format: "json", level: "info" }, baseDir: dir });
    try {
        const answer = await raw(`${server.url}/.well-known/oauth-protected-resource/api/v1`);
        assert.equal(answer.status, 503);
        const lines = () => text.join("").trim().split("\n").map((l) => JSON.parse(l));
        const mine = lines().filter((l) => l.requestId === answer.headers["x-request-id"]);
        assert.deepEqual(mine.map((l) => [l.event, l.level, l.status, l.reason]), [["refused", "error", 503, "not_ready"]], JSON.stringify(mine));
        // three probes while not ready: one warning, and no line per probe
        const probes = [];
        for (let i = 0; i < 3; i++) {
            probes.push(await raw(`${server.url}/readyz`));
        }
        assert.deepEqual(probes.map((p) => p.status), [503, 503, 503]);
        const readiness = lines().filter((l) => /ready/.test(String(l.msg)) && l.event !== "refused" && l.msg !== "started");
        assert.deepEqual(readiness.map((l) => l.level), ["warn"], JSON.stringify(readiness));
        assert.match(readiness[0].msg, /not ready/);
        // the change is on the probe that saw it; the probes after it have no line
        assert.equal(readiness[0].requestId, probes[0].headers["x-request-id"]);
        for (const probe of probes.slice(1)) {
            assert.deepEqual(lines().filter((l) => l.requestId === probe.headers["x-request-id"]), [], "no line per probe");
        }
        assert.equal((await raw(`${server.url}/healthz`)).status, 200);
        assert.equal(lines().filter((l) => /healthz/.test(JSON.stringify(l))).length, 0);
    } finally {
        await server.close();
    }
});

test("/readyz: one line when the server is no longer ready (warn) and one when it is ready again (info)", { skip: (process.platform === "win32" || process.getuid?.() === 0) && "file modes" }, async () => {
    const dir = workspace();
    const { server, text } = await rawServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, log: { format: "json", level: "info" }, baseDir: dir });
    const { chmodSync } = await import("node:fs");
    try {
        const probe = async () => (await raw(`${server.url}/readyz`)).status;
        assert.equal(await probe(), 200);
        chmodSync(join(dir, "out"), 0o500);
        assert.deepEqual([await probe(), await probe()], [503, 503]);
        chmodSync(join(dir, "out"), 0o700);
        assert.deepEqual([await probe(), await probe()], [200, 200]);
        const readiness = text.join("").trim().split("\n").map((l) => JSON.parse(l)).filter((l) => /ready/.test(String(l.msg)) && l.msg !== "started");
        assert.deepEqual(readiness.map((l) => [l.level, l.event]), [["warn", "warning"], ["info", "info"]], JSON.stringify(readiness));
    } finally {
        chmodSync(join(dir, "out"), 0o700);
        await server.close();
    }
});

test("a Host the server does not answer to: the answer and the refused line say how to add it; problem+json except on /mcp, which answers JSON-RPC", async () => {
    const dir = workspace();
    const lines = [];
    const server = await serve({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, http: { port: 0 }, log: { format: "json" }, baseDir: dir }, { env: {}, stderr: { write: (t) => lines.push(...String(t).trim().split("\n").map((l) => JSON.parse(l))) } });
    const hint = "add the name with http.allowHosts or --allow-host, or set http.publicUrl";
    const said = `Invalid Host: evil.example; ${hint}`;
    const headers = { host: "evil.example" };
    try {
        assert.deepEqual(server.enable, ["rest", "mcp"]);
        for (const path of ["/api/v1/sources", "/", "/healthz", "/readyz", "/.well-known/oauth-protected-resource/mcp", "/nope"]) {
            const res = await raw(`${server.url}${path}`, { headers });
            assert.equal(res.status, 403, path);
            assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, path);
            assert.deepEqual([res.data.code, res.data.detail], ["FORBIDDEN_HOST", said], path);
        }
        const mcp = await raw(`${server.url}/mcp`, { method: "POST", headers: { ...headers, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
        assert.equal(mcp.status, 403);
        assert.match(String(mcp.headers["content-type"]), /^application\/json/);
        assert.deepEqual(mcp.data, { jsonrpc: "2.0", error: { code: -32000, message: said }, id: null });
    } finally {
        await server.close();
    }
    const refused = lines.filter((l) => l.event === "refused" && l.reason === "host");
    assert.equal(refused.length, 7, JSON.stringify(lines));
    for (const line of refused) {
        assert.deepEqual([line.host, line.hint], ["evil.example", hint], JSON.stringify(line));
    }
});
