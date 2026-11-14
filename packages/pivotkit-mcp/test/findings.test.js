// Bugs the reviews of the built server found, each a test that failed before its fix: a padded field
// name past the policy, counts in a cut chart's or a limit's message, a readable output directory, a
// file: path past a source's scopes, an operator's file name in an error, a parser's quote of a file,
// a worker's hidden count, a caller without a token, the body read before the token.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { callerOf, createMcpContext, listen } from "pivotkit-mcp";
import { SALES_CSV, call, httpClient, httpServer, workspace } from "./helpers.js";

/** 60 customers with salaries: more chart categories than a chart draws. */
const PEOPLE = ["Name,Dept,Salary", ...Array.from({ length: 60 }, (_, i) => `Person ${i},${i % 3 ? "Sales" : "HR"},${1000 + i}`)].join("\n") + "\n";

async function session(options, run, env = {}) {
    const server = await httpServer(options, { env });
    const { client, close } = await httpClient(server.url, env.PIVOTKIT_MCP_TOKEN ? { token: env.PIVOTKIT_MCP_TOKEN } : {});
    try {
        await run(client, server);
    } finally {
        await close();
        await server.close();
    }
}

test("a padded or differently cased field name is the same field for the policy: no item hint for a summary field", () => {
    const dir = workspace();
    return session({ sources: { sales: { file: "data/sales.csv", policy: { default: "show", fields: { Customer: "summary" } } } }, baseDir: dir }, async (client) => {
        for (const field of [" Customer", "Customer ", "CUSTOMER"]) {
            const r = await call(client, "validate_view", { source: "sales", view: { rows: ["Region"], filters: [{ field, type: "in", items: ["alice example"], blanks: "exclude" }] } });
            assert.deepEqual(r.data.findings.filter((f) => f.code === "itemCase"), [], field);
            assert.doesNotMatch(r.text, /Alice Example/, field);
        }
    });
});

test("a cut chart and a limit say no count for a view over a summary field", () => {
    const dir = workspace({ "people.csv": PEOPLE });
    return session({ sources: { people: { file: "data/people.csv", policy: { fields: { Dept: "show" } } } }, output: { dir: "out" }, limits: { groups: 20 }, baseDir: dir }, async (client) => {
        const chart = await call(client, "render_view", { source: "people", view: { rows: ["Dept"], values: [{ field: "Salary", agg: "sum" }], display: "chart" }, format: "svg" });
        assert.equal(chart.isError, false);
        const many = await call(client, "render_view", { source: "people", view: { rows: ["Name"] }, format: "csv" });
        assert.match(many.text, /^LIMIT_EXCEEDED: the report is over a limit of the server \(limits\.groups\)/);
        assert.doesNotMatch(many.text, /\d{2}/);
    });
});

test("chartCut and tableCut findings are left out for a view over a summary field", () => {
    const dir = workspace({ "people.csv": PEOPLE });
    return session({ sources: { people: { file: "data/people.csv", policy: { fields: { Dept: "show" } } } }, output: { dir: "out" }, baseDir: dir }, async (client) => {
        const r = await call(client, "render_view", { source: "people", view: { rows: ["Name"], values: [{ field: "Salary", agg: "sum" }], display: "chart" }, format: "svg" });
        assert.equal(r.data.ok, true);
        assert.deepEqual(r.data.findings.filter((f) => f.code === "chartCut"), []);
        assert.doesNotMatch(r.text, /60|50 of/);
    });
});

test("the output directory may not lie inside an allowed directory (the model would read what it was not shown)", async () => {
    const dir = workspace();
    await assert.rejects(createMcpContext({ files: { allowDirs: ["data"] }, output: { dir: "data" }, baseDir: dir }), /output.dir: lies inside a directory of files.allowDirs/);
    await assert.rejects(createMcpContext({ files: { allowDirs: ["."] }, output: { dir: "out" }, baseDir: dir }), /output.dir: lies inside/);
});

test("a file: path to an operator source's file is that source: its scopes and its hidden fields hold", () => {
    const dir = workspace();
    const options = { sources: { pay: { file: "data/sales.csv", scopes: ["payroll"], policy: { fields: { Customer: "hide" } } } }, files: { allowDirs: ["data"] }, auth: { mode: "token", tokens: [{ name: "other", env: "T1", scopes: [] }, { name: "payroll", env: "T2", scopes: ["payroll"] }] }, baseDir: dir };
    const token = "a-test-token-that-is-long-enough-0123456789";
    return session(
        options,
        async (client, server) => {
            const denied = await call(client, "describe_source", { source: "file:sales.csv" });
            assert.match(denied.text, /^FILE_NOT_AVAILABLE/);
            const payroll = await httpClient(server.url, { token: `${token}2` });
            const allowed = await call(payroll.client, "describe_source", { source: "file:sales.csv" });
            assert.equal(allowed.data.hiddenFields, 1);
            assert.ok(!allowed.data.fields.some((f) => f.name === "Customer"));
            await payroll.close();
        },
        { PIVOTKIT_MCP_TOKEN: `${token}1`, T1: `${token}1`, T2: `${token}2` }
    );
});

test("an operator source's file is never named to the model: a missing one is the source not available", () => {
    const dir = workspace();
    return session({ sources: { sales: { file: "data/secret-name-2027.csv", title: "Sales" } }, baseDir: dir }, async (client) => {
        const r = await call(client, "describe_source", { source: "sales" });
        assert.match(r.text, /^FILE_NOT_AVAILABLE: the source Sales is not available now/);
        assert.doesNotMatch(r.text, /secret-name/);
    });
});

test("a file a reader cannot parse is named with its reason, never quoted", () => {
    const dir = workspace({ "sales.csv": SALES_CSV, "bad.json": '[{"Name":"Alice","Salary":secret42}]' });
    return session({ files: { allowDirs: ["data"] }, baseDir: dir }, async (client) => {
        const r = await call(client, "describe_source", { source: "file:bad.json" });
        assert.match(r.text, /^INVALID_FILE: bad\.json: cannot be read/);
        assert.doesNotMatch(r.text, /secret42|Alice/);
    });
});

test("a code source counts its hidden fields; a caller without a verified token holds no scope", async () => {
    const dir = workspace();
    const context = await createMcpContext({ sources: { hr: { load: async () => [{ Name: "A", Dept: "X", Salary: 1 }], policy: { fields: { Name: "hide" } } } }, baseDir: dir }, { stderr: { write() {} } });
    try {
        const { computer, registry } = context;
        const resolved = await registry.resolve("hr", { scopes: null, client: "t" });
        const { hidden } = await computer.run("describe_source", { source: "hr" }, { spec: resolved.spec }, resolved.source);
        assert.equal(hidden, 1);
    } finally {
        await context.close();
    }
    assert.deepEqual(callerOf("token", undefined).scopes, new Set());
    assert.equal(callerOf("none", undefined).scopes, null);
});

test("a large body without a token is answered 401 from its headers, before it is read", async () => {
    const dir = workspace();
    const server = await listen({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, http: { port: 0 }, baseDir: dir }, { env: { PIVOTKIT_MCP_TOKEN: "a-test-token-that-is-long-enough-0123456789" }, stderr: { write() {} } });
    try {
        const status = await new Promise((resolve, reject) => {
            const req = httpRequest(server.url, { method: "POST", headers: { "content-type": "application/json", "content-length": String(1_500_000) } }, (res) => {
                res.resume();
                resolve(res.statusCode);
            });
            req.on("error", reject);
            // only the first bytes are sent: the answer comes without the rest
            req.write("{");
        });
        assert.equal(status, 401);
    } finally {
        await server.close();
    }
});
