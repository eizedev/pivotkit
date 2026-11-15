// The log in production (#432): every line with level, severity, msg, service and version; the
// request's scope (requestId, traceId from a strictly parsed traceparent, a checked X-Request-Id, the
// addresses) on every line written for it; X-Request-Id on every answer; refused lines with their
// reason; the level of call, request, download and refused lines by their status; the text format
// (logfmt, one line whatever a value holds); log settings from the file, the flags and the
// environment; and no token, value, path or claim on any line in either format.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEVERITY, createContext, flushed, logSettingsOf, optionsFrom, refusalReason, serve, startErrorLine, traceIdOf, upstreamRequestIdOf, validateOptions, withRequestScope, SERVER_FLAGS } from "pivotkit-server";
import { createLog } from "../src/log.js";
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
        assert.deepEqual([request.traceId, request.upstreamRequestId, request.address, request.clientAddress], ["4bf92f3577b34da6a3ce929d0e0e4736", "proxy-1", "127.0.0.1", "203.0.113.9"]);
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
    assert.doesNotMatch(all, /"address"|"clientAddress"|203\.0\.113\.9/);
});

test("redaction: no token, value, claim or path on any line, in JSON and in text, at info (and no token at debug)", async () => {
    const SECRET_VALUE = "SecretRegion-7f3a";
    for (const [format, level] of [["json", "info"], ["text", "info"], ["json", "debug"], ["text", "debug"]]) {
        const dir = workspace({ "sales.csv": `Region,Sales,Customer\n${SECRET_VALUE},10,Alice Example\nNorth,5,Bob Example\n` });
        const { server, text, api } = await rawServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show", fields: { Customer: "hide" } } } }, auth: { mode: "token" }, output: { dir: "out" }, log: { format, level }, baseDir: dir }, { PIVOTKIT_TOKEN: TOKEN });
        try {
            await call(`${api}/views/render`, { token: TOKEN, body: { source: "sales", view: { ...BY_REGION, filters: [{ field: "Region", type: "in", items: [SECRET_VALUE] }] }, format: "csv" } });
            await call(`${api}/views/render`, { token: TOKEN, body: { source: "sales", view: { rows: ["Customer"], values: [{ field: "Sales", agg: "sum" }] } } });
            await call(`${api}/sources/describe`, { token: TOKEN, body: { source: `${dir}/data/sales.csv` } });
            await call(`${api}/sources`, { token: OTHER_TOKEN });
            await call(`${api}/sources`, { headers: { authorization: `Bearer ${OTHER_TOKEN}`, cookie: "session=abc" } });
        } finally {
            await server.close();
        }
        const all = text.join("");
        assert.ok(all.split("\n").filter(Boolean).length >= 5, `${format} ${level}: lines were written`);
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

test("serve's start error is a JSON line when the log is asked to be JSON, text otherwise", () => {
    const json = spawnSync(process.execPath, [BIN, "serve", "--config", "/nonexistent/pivotkit.json"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", PIVOTKIT_LOG_FORMAT: "json" } });
    assert.equal(json.status, 2);
    const line = JSON.parse(json.stderr);
    assert.deepEqual([line.level, line.severity, line.event, line.service, line.code], ["error", 3, "error", "pivotkit-server", "CONFIG"]);
    assert.match(line.msg, /pivotkit\.json/);
    const text = spawnSync(process.execPath, [BIN, "serve", "--config", "/nonexistent/pivotkit.json"], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
    assert.match(text.stderr, /^pivotkit-server: /);
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
