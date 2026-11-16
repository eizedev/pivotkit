// Remote mode against a fake pivotkit-server on a free loopback port (and a fake proxy): every
// status the REST service answers with, answers that are none of a pivotkit-server, and the
// network's failures. The fake server echoes the Authorization header it gets into every problem's
// detail and a header, and every answer carries a marker outside `detail`, so each test proves that
// neither the token nor the raw body nor the full address reaches stdout, stderr or --json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, tempDir } from "./helpers.js";

const TOKEN = "fake-token-SECRET-0123456789abcdefghijkl";
const RAW = "RAW-BODY-MARKER-7c1e";
const PATH_MARK = "/pk-mark-9f2/api/v1";
const VIEW = JSON.stringify({ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] });
const FINDING = { severity: "error", code: "unknownField", path: "rows[0]", message: 'unknown field "Regoin"', suggestion: "Region" };

/** A problem document as pivotkit-server writes it, with the received token echoed into detail and a header. */
function problem(res, req, status, code, { detail, headers = {}, extra = {} } = {}) {
    const auth = req.headers.authorization ?? "";
    res.writeHead(status, { "content-type": "application/problem+json", "x-echo": auth, ...headers });
    res.end(JSON.stringify({ type: "https://pivotkit.eize.dev/reference/rest/#error", title: code, status, code, detail: detail ?? `refused ${auth}`, raw: RAW, ...extra }));
}

/** A JSON answer with the marker outside the fields the CLI reads. */
function json(res, body, status = 200) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ ...body, raw: RAW }));
}

/**
 * A fake server on 127.0.0.1:0; `handler(req, res, body)` answers. The requests are kept.
 * @param {(req: any, res: any, body: string) => void} handler
 */
async function fakeServer(handler) {
    const requests = [];
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            requests.push({ method: req.method, url: req.url, headers: req.headers, body });
            handler(req, res, body);
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, url: `${origin}${PATH_MARK}`, requests, close: () => new Promise((resolve) => server.closeAllConnections() || server.close(resolve)) };
}

/** A fake HTTP proxy that refuses everything and counts what reached it. */
async function fakeProxy() {
    const hits = [];
    const server = createServer((req, res) => {
        hits.push(req.url);
        res.writeHead(502);
        res.end();
    });
    server.on("connect", (req, socket) => {
        hits.push(`CONNECT ${req.url}`);
        socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { url: `http://127.0.0.1:${server.address().port}`, hits, close: () => new Promise((resolve) => server.closeAllConnections() || server.close(resolve)) };
}

/** Neither the token nor the raw body nor the full address in anything the CLI wrote. */
function assertClean(result, fullUrl) {
    for (const [name, text] of [["stdout", result.stdout], ["stderr", result.stderr]]) {
        assert.ok(!text.includes(TOKEN), `${name} holds the token`);
        assert.ok(!text.includes(RAW), `${name} holds the raw body`);
        assert.ok(!text.includes(fullUrl), `${name} holds the full address`);
        assert.ok(!text.includes(PATH_MARK), `${name} holds the address's path`);
    }
}

/** --json's object of a run. */
const jsonOf = (result) => JSON.parse(result.stdout);

/** A working directory with the view file. */
function workdir() {
    const dir = tempDir("pivotkit-remote-");
    writeFileSync(join(dir, "view.json"), VIEW);
    return dir;
}

/** Runs the CLI with the token in PIVOTKIT_TOKEN and the server's address in --url. */
const remote = (server, args, { env = {}, cwd } = {}) => run([...args, "--url", server.url], { cwd: cwd ?? workdir(), env: { PIVOTKIT_TOKEN: TOKEN, ...env } });

test("200: sources lists the server's sources, with the token, the user agent and the server's origin", async () => {
    const server = await fakeServer((req, res) => json(res, { sources: [{ id: "sales", title: "Sales", kind: "source", link: false, schedulable: false }, { id: "hr", title: "People", kind: "source", link: false, schedulable: false }] }));
    try {
        const r = await remote(server, ["sources"]);
        assert.equal(r.code, 0, r.stderr);
        assert.match(r.stdout, /^sales {2}Sales\nhr {5}People\n$/);
        assert.match(r.stderr, new RegExp(`^server: ${server.origin.replace(/\./g, "\\.")} \\(token: PIVOTKIT_TOKEN\\)\\n`));
        assertClean(r, server.url);
        const [request] = server.requests;
        assert.equal(request.url, `${PATH_MARK}/sources`);
        assert.equal(request.headers.authorization, `Bearer ${TOKEN}`);
        assert.match(request.headers["user-agent"], /^pivotkit-cli\/\d+\.\d+\.\d+/);
        const j = jsonOf(await remote(server, ["sources", "--json"]));
        assert.deepEqual(j.sources.map((s) => s.id), ["sales", "hr"]);
        assert.ok(!JSON.stringify(j).includes(RAW));
    } finally {
        await server.close();
    }
});

test("200: sources <id> describes a source's fields by GET /sources/{id}; a token that reaches no source is told so", async () => {
    const server = await fakeServer((req, res) => (req.url.endsWith("/sources/sales") ? json(res, { rows: 4, fields: [{ name: "Region", type: "string", text: "Region: string, summary, 3 distinct, 0 blank" }], hiddenFields: 1, text: "4 rows, 1 field (1 more hidden by the operator)", examples: [], notes: [] }) : json(res, { sources: [] })));
    try {
        const r = await remote(server, ["sources", "sales"]);
        assert.equal(r.code, 0, r.stderr);
        assert.equal(r.stdout, "4 rows, 1 field (1 more hidden by the operator)\n  Region: string, summary, 3 distinct, 0 blank\n");
        const j = jsonOf(await remote(server, ["sources", "sales", "--json"]));
        assert.equal(j.description.hiddenFields, 1);
        const none = await remote(server, ["sources"]);
        assert.equal(none.code, 0);
        assert.match(none.stderr, /this token reaches no source of the server/);
        assertClean(none, server.url);
        // an id that is none never becomes part of an address
        const bad = await remote(server, ["sources", "../admin"]);
        assert.equal(bad.code, 2);
        assert.match(bad.stderr, /the id is no source id/);
        assert.equal(server.requests.length, 3);
    } finally {
        await server.close();
    }
});

test("200: validate and describe send the view to the server; findings exit 1", async () => {
    const server = await fakeServer((req, res, body) => {
        const input = JSON.parse(body);
        assert.equal(input.source, "sales");
        assert.equal(typeof input.view, "string");
        if (req.url.endsWith("/views/validate")) return json(res, { valid: false, findings: [FINDING], uses: ["Sales"] });
        return json(res, { valid: true, name: "By region", description: { text: "Sum of Sales by Region" }, findings: [], uses: ["Region", "Sales"] });
    });
    try {
        const v = await remote(server, ["validate", "view.json", "--source", "sales", "--json"]);
        assert.equal(v.code, 1, v.stderr);
        const j = jsonOf(v);
        assert.equal(j.valid, false);
        assert.deepEqual(j.findings, [FINDING]);
        assertClean(v, server.url);
        const d = await remote(server, ["describe", "view.json", "--source", "sales"]);
        assert.equal(d.code, 0, d.stderr);
        assert.equal(d.stdout, "By region: Sum of Sales by Region\n");
        assert.deepEqual(server.requests.map((r) => r.url), [`${PATH_MARK}/views/validate`, `${PATH_MARK}/views/describe`]);
    } finally {
        await server.close();
    }
});

test("200: render checks the view, then writes the server's file with mode 0600, replacing only after the whole answer", async () => {
    const CSV = "Region,Sum of Sales\nNorth,10\n";
    const server = await fakeServer((req, res, body) => {
        if (req.url.endsWith("/views/validate")) return json(res, { valid: true, findings: [], uses: [] });
        const input = JSON.parse(body);
        assert.equal(input.format, "csv");
        assert.equal(input.title, "Q4");
        res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="../../evil.csv"' });
        res.end(CSV);
    });
    try {
        const cwd = workdir();
        writeFileSync(join(cwd, "out.csv"), "old");
        const r = await remote(server, ["render", "view.json", "--source", "sales", "-o", "out.csv", "--title", "Q4", "--json"], { cwd });
        assert.equal(r.code, 0, r.stderr);
        assert.equal(readFileSync(join(cwd, "out.csv"), "utf8"), CSV);
        if (process.platform !== "win32") {
            assert.equal(statSync(join(cwd, "out.csv")).mode & 0o777, 0o600);
        }
        // the name of the answer's Content-Disposition is never used
        assert.ok(!existsSync(join(cwd, "..", "..", "evil.csv")));
        assert.deepEqual(jsonOf(r).output, { file: "out.csv", format: "csv", mediaType: "text/csv;charset=utf-8", bytes: CSV.length });
        assert.equal(jsonOf(r).sheet, null);
        assertClean(r, server.url);
        // without -o: stdout
        const out = await remote(server, ["render", "view.json", "--source", "sales", "-f", "csv", "--title", "Q4"]);
        assert.equal(out.stdout, CSV);
    } finally {
        await server.close();
    }
});

test("params: sources names what a source needs; --param goes with the source as params, sources <id> --param asks POST /sources/describe; --param needs a server and a source", async () => {
    const VMS = { id: "vms", title: "Virtual machines", kind: "source", link: false, schedulable: true, params: [{ name: "customer", type: "string", required: true, example: "acme" }, { name: "state", type: "string" }] };
    const server = await fakeServer((req, res, body) => {
        if (req.url.endsWith("/sources")) return json(res, { sources: [{ id: "sales", title: "Sales", kind: "source", link: false, schedulable: false }, VMS] });
        if (req.url.endsWith("/sources/describe")) return json(res, { rows: 2, fields: [{ name: "name", type: "string", text: "name: text" }], text: "2 rows, 1 field" });
        if (req.url.endsWith("/views/validate")) return json(res, { valid: true, findings: [], uses: ["name"] });
        if (req.url.endsWith("/views/render/file")) {
            res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="r.csv"' });
            return res.end("name\nweb-1\n");
        }
        return problem(res, req, 404, "NOT_FOUND", { detail: `no route ${req.method} ${req.url} ${body.length}` });
    });
    try {
        const list = await remote(server, ["sources"]);
        assert.equal(list.code, 0, list.stderr);
        assert.match(list.stdout, /^sales {2}Sales\nvms {4}Virtual machines \(needs: customer\)\n$/);

        const described = await remote(server, ["sources", "vms", "--param", "customer=acme", "--param", "state=running"]);
        assert.equal(described.code, 0, described.stderr);
        const asked = server.requests.at(-1);
        assert.equal(`${asked.method} ${asked.url}`, `POST ${PATH_MARK}/sources/describe`);
        assert.deepEqual(JSON.parse(asked.body), { source: "vms", params: { customer: "acme", state: "running" } });

        const view = join(workdir(), "v.json");
        writeFileSync(view, JSON.stringify({ rows: ["name"] }));
        server.requests.length = 0;
        const rendered = await remote(server, ["render", view, "--source", "vms", "--param", "customer=acme", "-f", "csv"]);
        assert.equal(rendered.code, 0, rendered.stderr);
        assert.deepEqual(server.requests.map((r) => [r.url.slice(PATH_MARK.length), JSON.parse(r.body).source, JSON.parse(r.body).params]), [["/views/validate", "vms", { customer: "acme" }], ["/views/render/file", "vms", { customer: "acme" }]]);

        // a required value left out: the server's words and the flag that gives it, not the REST route's pointer
        const without = await fakeServer((req, res) => problem(res, req, 400, "INVALID_INPUT", { detail: 'the source vms needs params.customer (The customer\'s short name, for example acme); re-run with params.customer=acme. GET /sources/{id} takes no params: send them with POST /sources/describe, {"source": "vms", "params": {...}}' }));
        try {
            const r = await remote(without, ["sources", "vms"]);
            assert.equal(r.code, 2);
            assert.match(r.stderr, /\npivotkit: the server answered 400 INVALID_INPUT: the source vms needs params\.customer \(The customer's short name, for example acme\); re-run with --param customer=acme\n$/);
        } finally {
            await without.close();
        }

        // a token file that is not there: named after the flag
        const gone = await remote(server, ["sources", "--token-file", "missing.txt"]);
        assert.equal(gone.code, 2);
        assert.match(gone.stderr, /^pivotkit: --token-file missing\.txt: not found\n$/);

        // usage: name=value, once each, with a source; and only with a server
        const malformed = await remote(server, ["sources", "vms", "--param", "customer"]);
        assert.match(malformed.stderr, /^pivotkit: --param takes name=value, not "customer"/, "refused before the first line and the first request");
        assert.match((await remote(server, ["sources", "vms", "--param", "customer=a", "--param", "customer=b"])).stderr, /--param customer is given twice/);
        const bare = await remote(server, ["sources", "--param", "customer=acme"]);
        assert.equal(bare.code, 2);
        assert.match(bare.stderr, /--param goes with a source: pivotkit sources <id> --param name=value/);
        const local = await run(["render", view, "--data", view, "--param", "customer=acme"], { cwd: workdir(), env: {} });
        assert.equal(local.code, 2);
        assert.match(local.stderr, /--param acts with a server only/);
    } finally {
        await server.close();
    }
});

test("render without data names a server's source as the third way", async () => {
    const view = join(workdir(), "v.json");
    writeFileSync(view, JSON.stringify({ rows: ["Region"] }));
    const r = await run(["render", view], { cwd: workdir(), env: {} });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /render needs data: --data <file>, --data - for stdin, or a server's source: --source <id> with --url or PIVOTKIT_URL/);
    const layout = await run(["render", "--rows", "Region"], { cwd: workdir(), env: {} });
    assert.match(layout.stderr, /--rows needs the data: pivotkit render <data> --rows \.\.\., or a server's source: --source <id> with --url or PIVOTKIT_URL/);
});

test("401: one line that says whether a token went and from where, kind remote with the code and status; the echoed token is taken out", async () => {
    const server = await fakeServer((req, res) => problem(res, req, 401, "INVALID_TOKEN", { headers: { "www-authenticate": 'Bearer realm="pivotkit"' } }));
    try {
        const r = await remote(server, ["sources", "--json"]);
        assert.equal(r.code, 2);
        const { error } = jsonOf(r);
        assert.deepEqual({ kind: error.kind, code: error.code, status: error.status, retryAfter: error.retryAfter }, { kind: "remote", code: "INVALID_TOKEN", status: 401, retryAfter: null });
        assert.match(error.message, /^the server refused the token from PIVOTKIT_TOKEN: refused Bearer \u2026 \(401 INVALID_TOKEN\)$/);
        assertClean(r, server.url);
        const text = await remote(server, ["sources"]);
        assert.match(text.stderr, /\npivotkit: the server refused the token from PIVOTKIT_TOKEN: refused Bearer \u2026 \(401 INVALID_TOKEN\)\n$/);
        assertClean(text, server.url);
        // no token at all: what to set, in one line
        const none = await run(["sources", "--url", server.url], { cwd: workdir(), env: {} });
        assert.equal(none.code, 2);
        assert.match(none.stderr, /\npivotkit: the server needs a token: set PIVOTKIT_TOKEN or give --token-file <file> \(401 INVALID_TOKEN\)\n$/);
    } finally {
        await server.close();
    }
});

test("403 NOT_ALLOWED on render: the profile has no results: true; nothing is written", async () => {
    const server = await fakeServer((req, res) => (req.url.endsWith("/views/validate") ? json(res, { valid: true, findings: [] }) : problem(res, req, 403, "NOT_ALLOWED")));
    try {
        const cwd = workdir();
        writeFileSync(join(cwd, "out.xlsx"), "old");
        const r = await remote(server, ["render", "view.json", "--source", "sales", "-o", "out.xlsx", "--json"], { cwd });
        assert.equal(r.code, 2);
        const { error } = jsonOf(r);
        assert.equal(error.code, "NOT_ALLOWED");
        assert.equal(error.status, 403);
        assert.match(error.message, /; this token's profile has no results: true; validate, describe and sources still work with this token$/);
        assert.equal(readFileSync(join(cwd, "out.xlsx"), "utf8"), "old");
        assertClean(r, server.url);
    } finally {
        await server.close();
    }
});

test("404: an unknown source by its code; an unknown route says the address should end in /api/v1", async () => {
    const server = await fakeServer((req, res) => (req.url.startsWith(PATH_MARK) ? problem(res, req, 404, "SOURCE_NOT_FOUND", { detail: "no source sales" }) : problem(res, req, 404, "NOT_FOUND", { detail: "no such route" })));
    try {
        const r = await remote(server, ["validate", "view.json", "--source", "sales", "--json"]);
        assert.equal(r.code, 2);
        assert.equal(jsonOf(r).error.code, "SOURCE_NOT_FOUND");
        assert.doesNotMatch(jsonOf(r).error.message, /should end in/);
        assertClean(r, server.url);
        const root = await run(["sources", "--url", `${server.origin}/pk-mark-9f2`], { cwd: workdir(), env: { PIVOTKIT_TOKEN: TOKEN } });
        assert.equal(root.code, 2);
        assert.match(root.stderr, /404 NOT_FOUND: no such route; the address should end in \/api\/v1\n/);
        assertClean(root, `${server.origin}/pk-mark-9f2`);
    } finally {
        await server.close();
    }
});

test("422 VIEW_HAS_ERRORS: the server's findings, exit 1, nothing written", async () => {
    const server = await fakeServer((req, res) => (req.url.endsWith("/views/validate") ? json(res, { valid: true, findings: [] }) : problem(res, req, 422, "VIEW_HAS_ERRORS", { extra: { findings: [FINDING] } })));
    try {
        const cwd = workdir();
        const r = await remote(server, ["render", "view.json", "--source", "sales", "-o", "out.xlsx", "--json"], { cwd });
        assert.equal(r.code, 1, r.stderr);
        const j = jsonOf(r);
        assert.deepEqual(j.findings, [FINDING]);
        assert.equal(j.output, null);
        assert.ok(!existsSync(join(cwd, "out.xlsx")));
        assertClean(r, server.url);
    } finally {
        await server.close();
    }
});

test("413, 429 with Retry-After, 500 and 503 with Retry-After: their codes, the status and the wait", async () => {
    const cases = [
        [413, "BODY_TOO_LARGE", {}, null],
        [429, "RATE_LIMITED", { "retry-after": "7" }, 7],
        [500, "INTERNAL", {}, null],
        [503, "BUSY", { "retry-after": "5" }, 5]
    ];
    for (const [status, code, headers, wait] of cases) {
        const server = await fakeServer((req, res) => problem(res, req, status, code, { headers }));
        try {
            const r = await remote(server, ["validate", "view.json", "--source", "sales", "--json"]);
            assert.equal(r.code, 2, `${status}`);
            const { error } = jsonOf(r);
            assert.deepEqual([error.kind, error.code, error.status, error.retryAfter], ["remote", code, status, wait]);
            if (wait !== null) assert.match(error.message, new RegExp(`retry in ${wait} s`));
            assertClean(r, server.url);
        } finally {
            await server.close();
        }
    }
});

test("a problem's code the CLI does not know is PROBLEM; control and direction characters of detail are taken out", async () => {
    const server = await fakeServer((req, res) => problem(res, req, 400, "SOMETHING_NEW", { detail: "bad \u001b[31mred\u001b[0m \u202eevil\u0007 input" }));
    try {
        const r = await remote(server, ["validate", "view.json", "--source", "sales"]);
        assert.equal(r.code, 2);
        assert.match(r.stderr, /the server answered 400 PROBLEM: bad/);
        assert.ok(!/[\p{Cc}\u202a-\u202e]/u.test(r.stderr.replace(/\n/g, "")), "a control or direction character in stderr");
        assertClean(r, server.url);
    } finally {
        await server.close();
    }
});

test("an answer that is no pivotkit-server's (an HTML login page) is said with its status only", async () => {
    const server = await fakeServer((req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<html><form>login ${RAW}</form></html>`);
    });
    try {
        const r = await remote(server, ["sources", "--json"]);
        assert.equal(r.code, 2);
        const { error } = jsonOf(r);
        assert.deepEqual([error.code, error.status, error.message], ["NOT_PIVOTKIT", 200, "not a pivotkit server answer (HTTP 200)"]);
        assertClean(r, server.url);
    } finally {
        await server.close();
    }
});

test("a redirect is not followed", async () => {
    const server = await fakeServer((req, res) => {
        res.writeHead(301, { location: `https://elsewhere.example/api/v1/sources?raw=${RAW}` });
        res.end();
    });
    try {
        const r = await remote(server, ["sources", "--json"]);
        assert.equal(r.code, 2);
        assert.equal(jsonOf(r).error.code, "REDIRECT");
        assert.match(jsonOf(r).error.message, /the server redirected \(a common cause: http instead of https\)/);
        assert.equal(server.requests.length, 1);
        assertClean(r, server.url);
    } finally {
        await server.close();
    }
});

test("a network error: no server on the port is kind remote with no status", async () => {
    const server = await fakeServer(() => undefined);
    const url = server.url;
    await server.close();
    const r = await run(["sources", "--url", url, "--json"], { cwd: workdir(), env: { PIVOTKIT_TOKEN: TOKEN } });
    assert.equal(r.code, 2);
    const { error } = jsonOf(r);
    assert.deepEqual([error.kind, error.code, error.status], ["remote", "ECONNREFUSED", null]);
    assert.match(error.message, /the server cannot be reached: the connection was refused/);
    assertClean(r, url);
});

test("a timeout: a server that never answers is given up after --timeout", async () => {
    const server = await fakeServer(() => undefined);
    try {
        const started = Date.now();
        const r = await remote(server, ["sources", "--timeout", "1", "--json"]);
        assert.equal(r.code, 2);
        assert.equal(jsonOf(r).error.code, "TIMEOUT");
        assert.ok(Date.now() - started < 10_000); // wall time: event latency (a child process)
        assertClean(r, server.url);
    } finally {
        await server.close();
    }
});

test("a JSON answer over 5 MB and a file cut short are refused; an existing file stays", async () => {
    const big = await fakeServer((req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ sources: [], pad: "x".repeat(6 * 1024 * 1024), raw: RAW }));
    });
    try {
        const r = await remote(big, ["sources", "--json"]);
        assert.equal(jsonOf(r).error.code, "ANSWER_TOO_LARGE");
        assertClean(r, big.url);
    } finally {
        await big.close();
    }
    const cut = await fakeServer((req, res) => {
        if (req.url.endsWith("/views/validate")) return json(res, { valid: true, findings: [] });
        res.writeHead(200, { "content-type": "text/csv", "content-length": "1000", "content-disposition": "attachment" });
        res.write("Region,Sum\n");
        setTimeout(() => res.socket.destroy(), 50);
    });
    try {
        const cwd = workdir();
        writeFileSync(join(cwd, "out.csv"), "old");
        const r = await remote(cut, ["render", "view.json", "--source", "sales", "-o", "out.csv", "--json"], { cwd });
        assert.equal(r.code, 2);
        assert.equal(jsonOf(r).error.code, "ANSWER_CUT");
        assert.equal(readFileSync(join(cwd, "out.csv"), "utf8"), "old");
        assertClean(r, cut.url);
    } finally {
        await cut.close();
    }
});

test("the address: https or loopback http; no credentials, query or fragment, none of it quoted back", async () => {
    const cwd = workdir();
    for (const [url, why] of [
        ["http://reports.example.com/api/v1", /http:\/\/ only for localhost/],
        ["https://user:pa55word@reports.example.com/api/v1", /holds a user name or password/],
        ["https://reports.example.com/api/v1?token=abc", /holds a query or a fragment/],
        ["https://reports.example.com/api/v1#x", /holds a query or a fragment/],
        ["ftp://reports.example.com/api/v1", /takes an https:\/\/ address/],
        ["no-scheme-here", /is not an address/]
    ]) {
        const r = await run(["sources", "--url", url], { cwd, env: { PIVOTKIT_TOKEN: TOKEN } });
        assert.equal(r.code, 2, url);
        assert.match(r.stderr, why);
        assert.ok(!r.stderr.includes("pa55word") && !r.stderr.includes("token=abc"), url);
        assertClean(r, url);
    }
    // loopback by any of its names
    for (const host of ["localhost", "127.0.0.2", "[::1]"]) {
        const r = await run(["sources", "--url", `http://${host}:9/api/v1`, "--timeout", "2", "--json"], { cwd });
        assert.equal(jsonOf(r).error.kind, "remote", host);
    }
});

test("PIVOTKIT_URL is only the address: local options keep working, and --source without an address is a usage error", async () => {
    const cwd = workdir();
    writeFileSync(join(cwd, "sales.csv"), "Region,Sales\nNorth,10\n");
    const local = await run(["render", "view.json", "--data", "sales.csv", "-f", "csv"], { cwd, env: { PIVOTKIT_URL: "https://reports.example.com/api/v1", PIVOTKIT_TOKEN: TOKEN } });
    assert.equal(local.code, 0, local.stderr);
    assert.match(local.stdout, /^Region,Sum of Sales\r?\nNorth,10/);
    assert.doesNotMatch(local.stderr, /server:/);
    const noUrl = await run(["validate", "view.json", "--source", "sales"], { cwd });
    assert.equal(noUrl.code, 2);
    assert.match(noUrl.stderr, /a server's address is needed: --url https:\/\/host\/api\/v1, or PIVOTKIT_URL/);
});

test("the option table: a local option with a server, a server's option without one, both usage errors that name it", async () => {
    const server = await fakeServer((req, res) => json(res, { valid: true, findings: [] }));
    try {
        for (const flag of [["--data", "x.csv"], ["--limit", "rows=5"], ["--template", "t.html"], ["--locale", "de-DE"], ["--lenient"], ["--link", "#pk=x"], ["--width", "500"], ["--bom", "on"], ["--now", "2026-01-01"], ["--save-view", "v.json"]]) {
            const r = await remote(server, ["render", "view.json", "--source", "sales", ...flag]);
            assert.equal(r.code, 2, flag[0]);
            assert.match(r.stderr, new RegExp(`${flag[0]} is not available with --source or --url`));
        }
        assert.equal(server.requests.length, 0);
        const local = await run(["validate", "view.json", "--token-file", "t.txt"], { cwd: workdir() });
        assert.equal(local.code, 2);
        assert.match(local.stderr, /--token-file acts with a server only/);
        // the environment's defaults of local options are not used, with a note
        const env = await remote(server, ["validate", "view.json", "--source", "sales"], { env: { PIVOTKIT_LOCALE: "de-DE", PIVOTKIT_NOW: "2026-01-01" } });
        assert.equal(env.code, 0, env.stderr);
        assert.match(env.stderr, /note: PIVOTKIT_LOCALE, PIVOTKIT_NOW are not used with a server/);
        const help = await run(["help", "render"]);
        assert.match(help.stdout, /--data <file> +The data: .*\[local only\]/);
        assert.match(help.stdout, /--source <id> +Run on this source .*\[with a server\]/);
    } finally {
        await server.close();
    }
});

test("the token: --token-file first, a trailing newline trimmed; a link, an open file and a bad token handled before any request", async () => {
    const server = await fakeServer((req, res) => json(res, { sources: [] }));
    try {
        const cwd = workdir();
        writeFileSync(join(cwd, "token.txt"), `${TOKEN}\n`);
        chmodSync(join(cwd, "token.txt"), 0o600);
        const r = await remote(server, ["sources", "--token-file", "token.txt"], { cwd, env: { PIVOTKIT_TOKEN: "env-token-not-this-one-0123456789abcdef" } });
        assert.equal(r.code, 0, r.stderr);
        assert.equal(server.requests[0].headers.authorization, `Bearer ${TOKEN}`);
        assert.doesNotMatch(r.stderr, /readable by the group/);
        assertClean(r, server.url);
        if (process.platform !== "win32") {
            chmodSync(join(cwd, "token.txt"), 0o644);
            const open = await remote(server, ["sources", "--token-file", "token.txt"], { cwd });
            assert.equal(open.code, 0);
            assert.match(open.stderr, /warning: --token-file token.txt: readable by the group or by others; chmod 600/);
            symlinkSync(join(cwd, "token.txt"), join(cwd, "link.txt"));
            const link = await remote(server, ["sources", "--token-file", "link.txt"], { cwd });
            assert.equal(link.code, 2);
            assert.match(link.stderr, /is a symbolic link/);
        }
        const before = server.requests.length;
        writeFileSync(join(cwd, "bad.txt"), `${TOKEN} with spaces\n`);
        const bad = await remote(server, ["sources", "--token-file", "bad.txt"], { cwd });
        assert.equal(bad.code, 2);
        assert.match(bad.stderr, /has characters a bearer token cannot carry/);
        const badEnv = await remote(server, ["sources"], { env: { PIVOTKIT_TOKEN: `${TOKEN}\nX-Other: 1` } });
        assert.equal(badEnv.code, 2);
        assert.equal(server.requests.length, before);
        assertClean(bad, server.url);
        assertClean(badEnv, server.url);
    } finally {
        await server.close();
    }
});

test("NODE_TLS_REJECT_UNAUTHORIZED=0: the token is not sent", async () => {
    const r = await run(["sources", "--url", "https://pivotkit.invalid/api/v1"], { cwd: workdir(), env: { PIVOTKIT_TOKEN: TOKEN, NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /NODE_TLS_REJECT_UNAUTHORIZED=0 turns off the check of the server's certificate: pivotkit does not talk to a server so/);
    assert.ok(!r.stderr.includes(TOKEN));
    // also without a token, and before the server line
    const none = await run(["sources", "--url", "https://pivotkit.invalid/api/v1"], { cwd: workdir(), env: { NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
    assert.equal(none.code, 2);
    assert.match(none.stderr, /^pivotkit: NODE_TLS_REJECT_UNAUTHORIZED=0/);
});

/** Whether this Node routes fetch through HTTP_PROXY with NODE_USE_ENV_PROXY=1 (22.21 or later, 24 or later). */
const [MAJOR, MINOR] = process.versions.node.split(".").map(Number);
const ENV_PROXY = MAJOR >= 24 || (MAJOR === 22 && MINOR >= 21);

/** Runs a script in a child Node with the environment given, without blocking this process's servers. */
const childNode = (script, env) => new Promise((resolve) => execFile(process.execPath, ["-e", script], { env: { PATH: process.env.PATH, ...env }, timeout: 20_000 }, (_e, stdout, stderr) => resolve({ stdout, stderr })));

test("a loopback address never goes through a proxy, also when Node uses the environment's proxy", { skip: !ENV_PROXY && "this Node has no NODE_USE_ENV_PROXY" }, async () => {
    const server = await fakeServer((req, res) => json(res, { sources: [{ id: "sales", title: "Sales", kind: "source", link: false, schedulable: false }] }));
    const proxy = await fakeProxy();
    try {
        const env = { NODE_USE_ENV_PROXY: "1", HTTP_PROXY: proxy.url, HTTPS_PROXY: proxy.url };
        // the control: in this environment Node's own fetch goes through the proxy, also to loopback
        await childNode(`fetch(${JSON.stringify(`${server.url}/sources`)}).then((r) => console.log(r.status), () => {})`, env);
        assert.equal(proxy.hits.length, 1, "the control did not reach the proxy");
        const r = await remote(server, ["sources"], { env });
        assert.equal(r.code, 0, r.stderr);
        assert.equal(proxy.hits.length, 1);
        assert.equal(server.requests.length, 1);
    } finally {
        await server.close();
        await proxy.close();
    }
});

test("another address uses the proxy only as Node does, and a network error says which", { skip: !ENV_PROXY && "this Node has no NODE_USE_ENV_PROXY" }, async () => {
    const proxy = await fakeProxy();
    try {
        const cwd = workdir();
        const via = await run(["sources", "--url", "https://pivotkit.invalid/api/v1", "--json"], { cwd, env: { NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: proxy.url, PIVOTKIT_TOKEN: TOKEN } });
        assert.equal(via.code, 2);
        assert.deepEqual(proxy.hits, ["CONNECT pivotkit.invalid:443"]);
        assert.match(jsonOf(via).error.message, /the request went through the proxy of HTTPS_PROXY/);
        assert.ok(!via.stdout.includes(proxy.url));
        const ignored = await run(["sources", "--url", "https://pivotkit.invalid/api/v1", "--json"], { cwd, env: { HTTPS_PROXY: proxy.url, PIVOTKIT_TOKEN: TOKEN } });
        assert.equal(ignored.code, 2);
        assert.equal(proxy.hits.length, 1);
        assert.match(jsonOf(ignored).error.message, /HTTPS_PROXY is set, but Node uses it only with NODE_USE_ENV_PROXY=1 \(Node 22\.21\.0 or later, 24\.0\.0 or later\) or --use-env-proxy \(Node 22\.21\.0 or later, 24\.5\.0 or later\)/);
    } finally {
        await proxy.close();
    }
});

test("layout flags and --suggest go to the server as a layout; the data argument is refused", async () => {
    const DRAFT = { format: "pivotkit-view", formatVersion: 2, name: "Draft: Sum of Sales by Region", view: { version: 2, rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] } };
    const server = await fakeServer((req, res, body) => {
        if (req.url.endsWith("/views/suggest")) return json(res, { ok: true, findings: [], view: DRAFT, name: DRAFT.name, picks: [{ part: "rows", code: "fewValues", field: "Region", others: [], text: "Region: the first text field with few values" }] });
        if (req.url.endsWith("/views/validate")) return json(res, { valid: true, findings: [] });
        res.writeHead(200, { "content-type": "text/csv", "content-disposition": "attachment" });
        res.end(`${JSON.stringify(JSON.parse(body).layout ?? "view")}\n`);
    });
    try {
        const cwd = workdir();
        const flags = await remote(server, ["render", "--source", "sales", "--rows", "Region", "--values", "sum:Sales", "--map", "Region=Area", "-f", "csv"], { cwd });
        assert.equal(flags.code, 0, flags.stderr);
        assert.deepEqual(JSON.parse(flags.stdout), { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }], map: { Region: "Area" } });
        const draft = await remote(server, ["describe", "--source", "sales", "--suggest", "-o", "draft.pivotkit.json"], { cwd });
        assert.equal(draft.code, 0, draft.stderr);
        assert.deepEqual(JSON.parse(readFileSync(join(cwd, "draft.pivotkit.json"), "utf8")), DRAFT);
        assert.match(draft.stderr, /picked: Region: the first text field with few values/);
        const data = await remote(server, ["render", "sales.csv", "--source", "sales", "--suggest"], { cwd });
        assert.equal(data.code, 2);
        assert.match(data.stderr, /with --source the data is the server's/);
        const describeData = await remote(server, ["describe", "--source", "sales"], { cwd });
        assert.equal(describeData.code, 2);
        assert.match(describeData.stderr, /the fields of a source: pivotkit sources <id>/);
    } finally {
        await server.close();
    }
});

test("a draft's names over 200 characters are written whole; only what is printed is cut", async () => {
    const long = `Region ${"x".repeat(300)}`;
    const DRAFT = { format: "pivotkit-view", formatVersion: 2, name: "Draft", view: { version: 2, rows: [long], values: [{ agg: "count" }] } };
    const server = await fakeServer((req, res) => json(res, { ok: true, findings: [], view: DRAFT, name: "Draft", picks: [{ part: "rows", code: "fewValues", field: long, others: [], text: `${long}: the first text field with few values` }] }));
    try {
        const cwd = workdir();
        const r = await remote(server, ["describe", "--source", "sales", "--suggest", "-o", "draft.pivotkit.json"], { cwd });
        assert.equal(r.code, 0, r.stderr);
        assert.equal(JSON.parse(readFileSync(join(cwd, "draft.pivotkit.json"), "utf8")).view.rows[0], long);
        assert.ok(!r.stderr.includes(long), "the printed line is cut");
        const j = jsonOf(await remote(server, ["describe", "--source", "sales", "--suggest", "--json"], { cwd }));
        assert.equal(j.view.view.rows[0], long);
        assert.equal(j.picks[0].field, long);
    } finally {
        await server.close();
    }
});

test("render with a token that may not validate (auth.toolScopes): the file still comes, with a note", async () => {
    const server = await fakeServer((req, res) => {
        if (req.url.endsWith("/views/validate")) return problem(res, req, 403, "INSUFFICIENT_SCOPE", { detail: "validate_view needs the scopes reports:check" });
        res.writeHead(200, { "content-type": "text/csv;charset=utf-8", "content-disposition": "attachment" });
        res.end("Region,Sum of Sales\n");
    });
    try {
        const r = await remote(server, ["render", "view.json", "--source", "sales", "-f", "csv"]);
        assert.equal(r.code, 0, r.stderr);
        assert.equal(r.stdout, "Region,Sum of Sales\n");
        assert.match(r.stderr, /warning notValidated: the view was not checked first/);
        assertClean(r, server.url);
        // --strict does not pass a view it could not check
        const strict = await remote(server, ["render", "view.json", "--source", "sales", "-f", "csv", "--strict"]);
        assert.equal(strict.code, 1);
        assert.equal(strict.stdout, "");
    } finally {
        await server.close();
    }
});

test("the Content-Type and the attachment are checked: valid JSON as text/html, a page as the HTML report, CSV bytes as text/html", async () => {
    const page = `<html><body>sign in ${RAW}</body></html>`;
    const server = await fakeServer((req, res) => {
        if (req.url.endsWith("/sources")) {
            res.writeHead(200, { "content-type": "text/html" });
            return res.end(JSON.stringify({ sources: [{ id: "sales", title: "Sales" }] }));
        }
        if (req.url.endsWith("/views/validate")) return json(res, { valid: true, findings: [] });
        // a captive portal's page: the type the html report has, but no attachment
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(page);
    });
    try {
        const list = await remote(server, ["sources", "--json"]);
        assert.equal(list.code, 2);
        assert.equal(jsonOf(list).error.code, "NOT_PIVOTKIT");
        const cwd = workdir();
        const html = await remote(server, ["render", "view.json", "--source", "sales", "-o", "r.html", "--json"], { cwd });
        assert.equal(html.code, 2);
        assert.equal(jsonOf(html).error.code, "NOT_PIVOTKIT");
        assert.ok(!existsSync(join(cwd, "r.html")));
        const csv = await remote(server, ["render", "view.json", "--source", "sales", "-o", "r.csv", "--json"], { cwd });
        assert.equal(jsonOf(csv).error.code, "NOT_PIVOTKIT");
        assert.ok(!existsSync(join(cwd, "r.csv")));
        for (const r of [list, html, csv]) assertClean(r, server.url);
    } finally {
        await server.close();
    }
});

test("hostile sizes: 400,000 sources list without a stack overflow; an answer nested 10,000 deep is no pivotkit answer", async () => {
    const many = JSON.stringify({ sources: Array.from({ length: 400_000 }, (_, i) => ({ id: `s${i % 10}` })) });
    const deep = `{"valid":true,"findings":[],"uses":${"[".repeat(10_000)}${"]".repeat(10_000)}}`;
    const server = await fakeServer((req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(req.url.endsWith("/sources") ? many : deep);
    });
    try {
        const list = await remote(server, ["sources", "-q"]);
        assert.equal(list.code, 0, list.stderr.slice(0, 500));
        assert.equal(list.stdout.split("\n").length - 1, 400_000);
        const nested = await remote(server, ["validate", "view.json", "--source", "sales", "--json"]);
        assert.equal(nested.code, 2);
        assert.deepEqual([jsonOf(nested).error.code, jsonOf(nested).error.message], ["NOT_PIVOTKIT", "not a pivotkit server answer (nested deeper than 64 levels)"]);
    } finally {
        await server.close();
    }
});

test("many findings: stderr lists 200 and says how many more; --json keeps them all", async () => {
    const findings = Array.from({ length: 250 }, (_, i) => ({ severity: "error", code: "unknownField", path: `rows[${i}]`, message: `unknown field "F${i}"` }));
    const server = await fakeServer((req, res) => json(res, { valid: false, findings }));
    try {
        const r = await remote(server, ["validate", "view.json", "--source", "sales"]);
        assert.equal(r.code, 1);
        assert.equal((r.stderr.match(/^error unknownField/gm) ?? []).length, 200);
        assert.match(r.stderr, /and 50 more findings \(--json lists them all\)/);
        assert.equal(jsonOf(await remote(server, ["validate", "view.json", "--source", "sales", "--json"])).findings.length, 250);
    } finally {
        await server.close();
    }
});

test("small things: -o over the token file, a source id as the view, Retry-After over a day, --timeout first, sources --json kind, the token's source, 127.example.com", async () => {
    const server = await fakeServer((req, res) => (req.url.endsWith("/sources") ? json(res, { sources: [] }) : problem(res, req, 429, "RATE_LIMITED", { headers: { "retry-after": "999999" } })));
    try {
        const cwd = workdir();
        writeFileSync(join(cwd, "token.txt"), TOKEN);
        chmodSync(join(cwd, "token.txt"), 0o600);
        // a token file whose name is one of a format's
        writeFileSync(join(cwd, "token.csv"), TOKEN);
        chmodSync(join(cwd, "token.csv"), 0o600);
        const over = await remote(server, ["render", "view.json", "--source", "sales", "--token-file", "token.csv", "-o", "token.csv"], { cwd });
        assert.equal(over.code, 2);
        assert.match(over.stderr, /-o names the token file/);
        assert.equal(readFileSync(join(cwd, "token.csv"), "utf8"), TOKEN);
        const id = await remote(server, ["describe", "sales", "--source", "sales"], { cwd });
        assert.equal(id.code, 2);
        assert.match(id.stderr, /the fields of a source: pivotkit sources sales/);
        const wait = await remote(server, ["validate", "view.json", "--source", "sales", "--json"]);
        assert.deepEqual([jsonOf(wait).error.code, jsonOf(wait).error.retryAfter], ["RATE_LIMITED", null]);
        const timeout = await remote(server, ["sources", "--timeout", "0"]);
        assert.equal(timeout.code, 2);
        assert.match(timeout.stderr, /^pivotkit: --timeout takes/);
        const kind = jsonOf(await remote(server, ["sources", "--json"]));
        assert.equal(kind.kind, "sources");
        const file = await remote(server, ["sources", "--token-file", "token.txt"], { cwd });
        assert.match(file.stderr, /\(token: --token-file token.txt\)/);
        const none = await run(["sources", "--url", server.url], { cwd });
        assert.match(none.stderr, /\(token: none\)/);
        const name = await run(["sources", "--url", "http://127.example.com/api/v1"], { cwd, env: { PIVOTKIT_TOKEN: TOKEN } });
        assert.equal(name.code, 2);
        assert.match(name.stderr, /http:\/\/ only for localhost/);
    } finally {
        await server.close();
    }
});

test("-q does not hide that the token file is readable by others", { skip: process.platform === "win32" && "POSIX permissions" }, async () => {
    const server = await fakeServer((req, res) => json(res, { sources: [] }));
    try {
        const cwd = workdir();
        writeFileSync(join(cwd, "token.txt"), TOKEN);
        chmodSync(join(cwd, "token.txt"), 0o644);
        const r = await remote(server, ["sources", "-q", "--token-file", "token.txt"], { cwd });
        assert.equal(r.code, 0);
        assert.match(r.stderr, /^warning: --token-file token.txt: readable by the group or by others/);
        assert.doesNotMatch(r.stderr, /server:/);
    } finally {
        await server.close();
    }
});

test("serve is pivotkit-server's", async () => {
    const r = await run(["serve"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /use "pivotkit-server serve" \(npm install --global pivotkit-server pivotkit-mcp\)/);
});
