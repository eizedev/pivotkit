// The REST service over HTTP as a program uses it: each route with real data, the problem documents,
// and the inputs a hostile or careless client sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BY_REGION, SALES_CSV, call, raw, restServer, workspace } from "./helpers.js";

/** A server over the sales data: Region and Product shown, Customer hidden, the rest summary. */
async function salesServer(extra = {}) {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", title: "Sales", link: "https://reports.example.com/sales", policy: { fields: { Region: "show", Product: "show", Customer: "hide" } } } }, output: { dir: "out" }, baseDir: dir, ...extra });
    return { server, dir };
}

/** The members every problem document has. */
function assertProblem(res, status, code) {
    assert.equal(res.status, status, JSON.stringify(res.data));
    assert.match(res.headers.get?.("content-type") ?? res.headers["content-type"], /^application\/problem\+json/);
    assert.equal(res.data.status, status);
    assert.equal(res.data.code, code);
    assert.equal(res.data.type, `https://pivotkit.eize.dev/reference/rest/#error-${code.toLowerCase().replace(/_/g, "-")}`);
    assert.equal(typeof res.data.title, "string");
    assert.equal(typeof res.data.detail, "string");
}

test("GET /sources lists the source; GET /sources/{id} and POST /sources/describe describe it alike, by the policy", async () => {
    const { server } = await salesServer();
    try {
        const list = await call(`${server.api}/sources`);
        assert.equal(list.status, 200);
        assert.deepEqual(list.data.sources, [{ id: "sales", title: "Sales", kind: "source", link: true, schedulable: true }]);
        const byId = await call(`${server.api}/sources/sales`);
        const byPost = await call(`${server.api}/sources/describe`, { body: { source: "sales" } });
        assert.equal(byId.status, 200);
        assert.deepEqual(byId.data, byPost.data);
        const names = byId.data.fields.map((f) => f.name);
        assert.ok(!names.includes("Customer"), "a hidden field is not listed");
        assert.equal(byId.data.hiddenFields, 1);
        const region = byId.data.fields.find((f) => f.name === "Region");
        assert.deepEqual(region.items, ["North", "South", "West"]);
        const sales = byId.data.fields.find((f) => f.name === "Sales");
        assert.equal(sales.level, "summary");
        assert.equal(sales.items, undefined);
        assert.equal(sales.min, undefined, "no smallest or largest value of a summary field");
        // describe_source's "items" is the operator's policy, not the caller's choice
        const asked = await call(`${server.api}/sources/describe`, { body: { source: "sales", items: 1000 } });
        assertProblem(asked, 400, "INVALID_INPUT");
    } finally {
        await server.close();
    }
});

test("validate and describe: a misspelt name is an error with the name meant; a hidden field reads as a missing one", async () => {
    const { server } = await salesServer();
    try {
        const bad = await call(`${server.api}/views/validate`, { body: { source: "sales", view: { rows: ["Regoin"], values: [{ field: "Sales", agg: "sum" }] } } });
        assert.equal(bad.status, 200);
        assert.equal(bad.data.valid, false);
        assert.equal(bad.data.findings[0].suggestion, "Region");
        const hidden = await call(`${server.api}/views/validate`, { body: { source: "sales", view: { rows: ["Customer"], values: [{ agg: "count" }] } } });
        const missing = await call(`${server.api}/views/validate`, { body: { source: "sales", view: { rows: ["Nobody"], values: [{ agg: "count" }] } } });
        assert.equal(hidden.data.valid, false);
        assert.deepEqual(hidden.data.findings.map((f) => f.code), missing.data.findings.map((f) => f.code));
        assert.ok(!JSON.stringify(hidden.data).includes("Alice"), "no value of the hidden field");
        const described = await call(`${server.api}/views/describe`, { body: { source: "sales", view: BY_REGION } });
        assert.equal(described.data.valid, true);
        assert.match(described.data.description.text, /Region/);
        const guide = await call(`${server.api}/views/guide`);
        assert.equal(guide.status, 200);
        assert.ok(guide.data.examples.length > 0);
    } finally {
        await server.close();
    }
});

test("render: the file is saved in the output directory; a summary field withholds the result's shape; no inline result by default", async () => {
    const { server, dir } = await salesServer();
    try {
        const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(res.status, 200);
        assert.equal(res.data.ok, true);
        // Sales is a summary field: the numbers stay in the file
        assert.deepEqual(res.data.withheld, ["rows", "columns", "bytes", "content"]);
        assert.equal(res.data.summary, undefined);
        assert.equal(res.data.inline, undefined);
        assert.match(res.data.message, /Its content is not part of this answer, since the operator does not show the values of Sales\./);
        assert.ok(!/assistant/.test(res.data.message), "words for a program, not a model");
        assert.deepEqual(readdirSync(join(dir, "out")), [res.data.output.name]);
        assert.equal(res.data.output.path, undefined, "no server path");
        // a view with errors: 200 with ok false and its findings, no file
        const broken = await call(`${server.api}/views/render`, { body: { source: "sales", view: { rows: ["Regoin"], values: [{ agg: "count" }] } } });
        assert.equal(broken.status, 200);
        assert.equal(broken.data.ok, false);
        assert.equal(broken.data.output, null);
        assert.equal(readdirSync(join(dir, "out")).length, 1);
    } finally {
        await server.close();
    }
});

test("render inline: only with rest.inline and only when every field the view uses is shown", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, rest: { inline: true }, baseDir: dir });
    try {
        const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.match(res.data.inline.text, /North.*15/s);
        assert.equal(res.data.output, null);
        // no output directory and xlsx: nowhere to put the file
        const xlsx = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "xlsx" } });
        assert.equal(xlsx.status, 409);
        assert.equal(xlsx.data.code, "NO_OUTPUT");
        assert.match(xlsx.data.detail, /views\/render\/file/);
    } finally {
        await server.close();
    }
});

test("suggest: a draft from the fields with its picks; a layout instead of a view renders and validates; not both", async () => {
    const { server } = await salesServer();
    try {
        const draft = await call(`${server.api}/views/suggest`, { body: { source: "sales" } });
        assert.equal(draft.status, 200, JSON.stringify(draft.data));
        assert.equal(draft.data.ok, true);
        assert.match(draft.data.name, /^Draft: /);
        assert.ok(draft.data.picks.some((p) => p.part === "rows" && p.field === "Region"), JSON.stringify(draft.data.picks));
        assert.ok(!JSON.stringify(draft.data).includes("Customer"), "a hidden field is never picked");
        const rendered = await call(`${server.api}/views/render`, { body: { source: "sales", layout: { rows: ["Region"], values: [{ field: "Sales" }] }, format: "csv" } });
        assert.equal(rendered.status, 200, JSON.stringify(rendered.data));
        assert.equal(rendered.data.ok, true);
        assert.deepEqual(rendered.data.view.rows, ["Region"], "the view the layout made");
        const misspelt = await call(`${server.api}/views/validate`, { body: { source: "sales", layout: { rows: ["Regoin"] } } });
        assert.equal(misspelt.status, 200);
        assert.equal(misspelt.data.valid, false);
        const both = await call(`${server.api}/views/validate`, { body: { source: "sales", view: BY_REGION, layout: { rows: ["Region"] } } });
        assert.equal(both.status, 400);
        assert.equal(both.data.code, "INVALID_INPUT");
        const neither = await call(`${server.api}/views/render`, { body: { source: "sales" } });
        assert.equal(neither.status, 400);
    } finally {
        await server.close();
    }
});

test("create_link and draft_schedule answer as the operations do", async () => {
    const { server, dir } = await salesServer();
    try {
        const link = await call(`${server.api}/views/link`, { body: { source: "sales", view: BY_REGION, name: "By region" } });
        assert.equal(link.status, 200);
        assert.match(link.data.url, /^https:\/\/reports\.example\.com\/sales#/);
        const draft = await call(`${server.api}/schedules/draft`, { body: { source: "sales", view: BY_REGION, name: "Weekly", formats: ["xlsx"], every: { unit: "week", at: "07:00", weekday: "mon" }, recipients: ["Sales team"] } });
        assert.equal(draft.status, 200);
        assert.equal(draft.data.draft.status, "draft");
        assert.ok(readdirSync(join(dir, "out")).some((n) => n.endsWith(".report.json")));
        const address = await call(`${server.api}/schedules/draft`, { body: { source: "sales", view: BY_REGION, name: "Weekly", formats: ["xlsx"], every: { unit: "day", at: "07:00" }, recipients: ["boss@example.com"] } });
        assert.equal(address.status, 400);
    } finally {
        await server.close();
    }
});

test("errors are problem documents: unknown route 404, wrong method 405 with Allow, not JSON 415, broken JSON 400, unknown key 400", async () => {
    const { server } = await salesServer();
    try {
        assertProblem(await call(`${server.api}/nothing`), 404, "NOT_FOUND");
        assertProblem(await call(`${server.url}/api/v2/sources`), 404, "NOT_FOUND");
        const wrong = await call(`${server.api}/views/validate`);
        assertProblem(wrong, 405, "METHOD_NOT_ALLOWED");
        assert.equal(wrong.headers.get("allow"), "POST");
        assertProblem(await call(`${server.api}/views/validate`, { body: "source=sales", headers: { "content-type": "application/x-www-form-urlencoded" } }), 415, "UNSUPPORTED_MEDIA_TYPE");
        assertProblem(await call(`${server.api}/views/validate`, { body: "{ not json" }), 400, "INVALID_INPUT");
        assertProblem(await call(`${server.api}/views/validate`, { body: "[1,2]" }), 400, "INVALID_INPUT");
        const extra = await call(`${server.api}/views/validate`, { body: { source: "sales", view: BY_REGION, admin: true } });
        assertProblem(extra, 400, "INVALID_INPUT");
        assert.match(extra.data.detail, /no key "admin"/);
        const unknown = await call(`${server.api}/sources/salse`);
        assertProblem(unknown, 404, "SOURCE_NOT_FOUND");
        assert.match(unknown.data.detail, /did you mean "sales"\?; GET \/sources lists them/);
        // the safe headers on every answer
        const ok = await call(`${server.api}/sources`);
        assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
        assert.equal(ok.headers.get("cache-control"), "no-store");
    } finally {
        await server.close();
    }
});

test("files by path are refused over REST, whatever files.allowDirs says; a path as an id is just a missing source", async () => {
    const dir = workspace();
    mkdirSync(join(dir, "shared"));
    writeFileSync(join(dir, "shared", "other.csv"), SALES_CSV);
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, files: { allowDirs: ["shared"], list: true }, output: { dir: "out" }, baseDir: dir });
    try {
        const list = await call(`${server.api}/sources`);
        assert.deepEqual(list.data.sources.map((s) => s.id), ["sales"], "no file: entries listed");
        for (const source of ["file:other.csv", `file:${join(dir, "shared", "other.csv")}`, "file:../data/sales.csv"]) {
            const res = await call(`${server.api}/views/validate`, { body: { source, view: BY_REGION } });
            assertProblem(res, 403, "FILES_NOT_ALLOWED");
        }
        const byAddress = await call(`${server.api}/sources/${encodeURIComponent("file:other.csv")}`);
        assertProblem(byAddress, 403, "FILES_NOT_ALLOWED");
        for (const id of ["..%2Fdata%2Fsales.csv", "%2E%2E", "sales%00", "%E0%A4%A"]) {
            const res = await call(`${server.api}/sources/${id}`);
            assert.ok([400, 404].includes(res.status), `${id}: ${res.status}`);
            assert.ok(!JSON.stringify(res.data).includes(dir), "no server path in the answer");
        }
    } finally {
        await server.close();
    }
});

test("a body over the cap is refused before it is read, also when it is sent in chunks without a length", async () => {
    const { server } = await salesServer();
    try {
        const big = JSON.stringify({ source: "sales", view: { rows: ["Region"], name: "x".repeat(3_000_000) } });
        const declared = await raw(`${server.api}/views/validate`, { method: "POST", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(big)) }, body: big });
        assert.equal(declared.status, 413);
        assert.equal(declared.data.code, "BODY_TOO_LARGE");
        const chunked = await raw(`${server.api}/views/validate`, { method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" }, body: big });
        assert.equal(chunked.status, 413);
        // the server still answers
        assert.equal((await call(`${server.api}/sources`)).status, 200);
    } finally {
        await server.close();
    }
});

test("a deep or huge view is a limit or an invalid input, never a crash, and it does not keep a worker", async () => {
    // one worker that waits at most a second for work: a view that kept it busy would make the next call BUSY
    const { server } = await salesServer({ compute: { workers: 1, queueMs: 1000 } });
    try {
        let deep = { rows: ["Region"] };
        for (let i = 0; i < 5000; i++) {
            deep = { nested: deep };
        }
        for (let i = 0; i < 2; i++) {
            const res = await call(`${server.api}/views/validate`, { body: `{"source":"sales","view":${JSON.stringify(deep)}}` });
            assert.equal(res.status, 400, `status ${res.status}: ${JSON.stringify(res.data)}`);
            assert.equal(res.data.code, "INVALID_INPUT");
        }
        const after = await call(`${server.api}/views/validate`, { body: { source: "sales", view: BY_REGION } });
        assert.equal(after.status, 200, JSON.stringify(after.data));
        const many = await call(`${server.api}/views/validate`, { body: { source: "sales", view: { rows: Array.from({ length: 5000 }, (_, i) => `F${i}`) } } });
        assert.ok(many.status < 500, `status ${many.status}`);
        const proto = await call(`${server.api}/views/validate`, { body: '{"source":"sales","view":{"__proto__":{"admin":true},"rows":["Region"]}}' });
        assert.ok(proto.status < 500);
        assert.equal({}.admin, undefined);
    } finally {
        await server.close();
    }
});

test("the Host check refuses a name the server does not answer to (DNS rebinding)", async () => {
    const { server } = await salesServer();
    try {
        const res = await raw(`${server.api}/sources`, { headers: { host: "evil.example" } });
        assert.equal(res.status, 403);
        assert.equal(res.data.code, "FORBIDDEN_HOST");
        const post = await raw(`${server.api}/views/validate`, { method: "POST", headers: { host: "evil.example", "content-type": "application/json" }, body: "{}" });
        assert.equal(post.status, 403);
    } finally {
        await server.close();
    }
});

test("output.maxAgeDays: writing a report deletes the files older than that, and keeps the others", async () => {
    const dir = workspace();
    const { utimesSync } = await import("node:fs");
    writeFileSync(join(dir, "out", "old.xlsx"), "old");
    writeFileSync(join(dir, "out", "recent.xlsx"), "recent");
    const old = new Date(Date.now() - 3 * 86_400_000);
    utimesSync(join(dir, "out", "old.xlsx"), old, old);
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", maxAgeDays: 2 }, baseDir: dir });
    try {
        assert.deepEqual(readdirSync(join(dir, "out")).sort(), ["old.xlsx", "recent.xlsx"], "nothing is deleted before a report is written");
        const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION } });
        assert.equal(res.status, 200);
        assert.deepEqual(readdirSync(join(dir, "out")).sort(), [res.data.output.name, "recent.xlsx"].sort());
    } finally {
        await server.close();
    }
});

test("the log names the route, the source and the status; never the view, a value or a path", async () => {
    const { server, dir } = await salesServer();
    try {
        await call(`${server.api}/views/render`, { body: { source: "sales", view: { ...BY_REGION, filters: [{ field: "Region", type: "in", items: ["SecretRegion"] }] }, format: "csv" } });
        const entry = server.log.find((l) => l.event === "request" && l.operation === "render_view");
        assert.equal(entry.source, "sales");
        assert.equal(entry.status, 200);
        assert.equal(entry.client, "local");
        assert.equal(entry.address, undefined, "no client address without http.trustProxy");
        const text = JSON.stringify(server.log);
        assert.ok(!text.includes("SecretRegion") && !text.includes(dir) && !text.includes("Alice"));
    } finally {
        await server.close();
    }
});
