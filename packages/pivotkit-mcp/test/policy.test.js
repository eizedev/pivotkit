// The exposure policy as the model meets it: what each level lets through, over the wire. A hidden
// field's name and values must appear nowhere: not in a result, an error, a suggestion or the log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BY_REGION, call, httpClient, httpServer, workspace } from "./helpers.js";

/** Every text a client got, joined: results, structured content and errors. */
const seen = (results) => results.map((r) => `${r.text}\n${JSON.stringify(r.data ?? null)}`).join("\n");

async function withServer(policy, run, extra = {}) {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv", policy } }, output: { dir: "out" }, baseDir: dir, ...extra });
    const { client, close } = await httpClient(server.url);
    try {
        await run(client, server);
    } finally {
        await close();
        await server.close();
    }
}

test("hide: the column is gone - not listed, not usable, not suggested, not in a note, not in the log", () =>
    withServer({ fields: { Region: "show", Customer: "hide" } }, async (client, server) => {
        const results = [];
        const described = await call(client, "describe_source", { source: "sales" });
        results.push(described);
        assert.equal(described.data.hiddenFields, 1);
        assert.deepEqual(described.data.fields.map((f) => f.name), ["Region", "Product", "Sales", "OrderDate", "Q"]);
        results.push(await call(client, "validate_view", { source: "sales", view: { rows: ["Customer"] } }));
        results.push(await call(client, "validate_view", { source: "sales", view: { rows: ["Custome"] } }));
        results.push(await call(client, "validate_view", { source: "sales", view: { filters: [{ field: "Customer", type: "in", items: ["Alice Example"] }] } }));
        results.push(await call(client, "render_view", { source: "sales", view: { rows: ["Customer"] }, format: "csv" }));
        results.push(await call(client, "describe_view", { source: "sales", view: { rows: ["customer"] } }));
        const text = seen(results);
        assert.doesNotMatch(text.replace(/"Customer"\]|\["Customer|"customer"|"Custome"|Alice Example"\]/g, ""), /Alice|Bob Example|Carol/);
        assert.ok(results[1].data.findings.some((f) => f.code === "unknownField"));
        assert.ok(!results.some((r) => r.data?.findings?.some((f) => /customer/i.test(f.suggestion ?? ""))), "never suggested");
        assert.doesNotMatch(JSON.stringify(server.log), /Customer|Alice/);
    }));

test("summary (the default): names, types and counts; no items, no smallest or largest; results over it go to a file, their shape withheld", () =>
    withServer({ fields: { Region: "show" } }, async (client) => {
        const described = await call(client, "describe_source", { source: "sales" });
        const region = described.data.fields.find((f) => f.name === "Region");
        const sales = described.data.fields.find((f) => f.name === "Sales");
        assert.equal(region.level, "show");
        assert.deepEqual(region.items, ["North", "South", "West"]);
        assert.equal(sales.level, "summary");
        assert.deepEqual([sales.items, sales.min, sales.max], [undefined, undefined, undefined]);
        assert.equal(sales.distinct, 5);
        assert.doesNotMatch(described.text.split("\n")[0], /North|Region/, "the prose holds no name and no value");
        const rendered = await call(client, "render_view", { source: "sales", view: BY_REGION, format: "csv" });
        assert.deepEqual(rendered.data.withheld, ["rows", "columns", "bytes", "content"]);
        assert.equal(rendered.data.inline, undefined);
        assert.equal(rendered.data.summary, undefined);
        assert.doesNotMatch(rendered.text, /North|\b20\b/);
    }));

test("show: values listed, and a small csv or json result comes back inline (and as a file)", () =>
    withServer({ fields: { Region: "show", Sales: "show" } }, async (client) => {
        const rendered = await call(client, "render_view", { source: "sales", view: BY_REGION, format: "csv" });
        assert.equal(rendered.data.withheld, undefined);
        assert.match(rendered.data.inline.text, /^Region,Sum of Sales\r?\n/);
        assert.match(rendered.data.inline.text, /North,15/);
        assert.deepEqual(rendered.data.summary, { rows: 5, columns: 2, sourceRows: 5, keptRows: 5, truncated: false });
        assert.equal(rendered.data.output.name, "sales.csv");
        const xlsx = await call(client, "render_view", { source: "sales", view: BY_REGION });
        assert.equal(xlsx.data.inline, undefined, "only csv and json come back inline");
    }));

test("an item check is a hint for a shown field and nothing for a summary one: no probing whether an item exists", () =>
    withServer({ fields: { Region: "show" } }, async (client) => {
        const shown = await call(client, "validate_view", { source: "sales", view: { rows: ["Region"], filters: [{ field: "Region", type: "in", items: ["north"] }] } });
        assert.deepEqual(shown.data.findings.filter((f) => f.code === "itemCase").map((f) => f.suggestion), ["North"]);
        const closed = await call(client, "validate_view", { source: "sales", view: { rows: ["Product"], filters: [{ field: "Product", type: "in", items: ["a"] }] } });
        assert.deepEqual(closed.data.findings.filter((f) => f.code === "itemCase"), []);
    }));

test("policy switches: no counts, no row count, default hide with one shown field, inline off", () =>
    withServer({ default: "hide", fields: { Region: "show" }, counts: false, rows: false, inline: false }, async (client) => {
        const described = await call(client, "describe_source", { source: "sales" });
        assert.deepEqual(described.data.fields.map((f) => f.name), ["Region"]);
        assert.equal(described.data.hiddenFields, 5);
        assert.equal(described.data.rows, null);
        assert.equal(described.data.fields[0].distinct, undefined);
        const rendered = await call(client, "render_view", { source: "sales", view: { rows: ["Region"] }, format: "csv" });
        assert.equal(rendered.data.inline, undefined);
        assert.equal(rendered.data.output.name, "sales.csv");
    }));

test("without an output directory: a withheld result is refused, not shown; a shown one comes back inline", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv", policy: { fields: { Region: "show" } } } }, baseDir: dir });
    try {
        const { client, close } = await httpClient(server.url);
        const xlsx = await call(client, "render_view", { source: "sales", view: { rows: ["Region"] } });
        assert.match(xlsx.text, /^NO_OUTPUT: this server has no output directory/);
        const closed = await call(client, "render_view", { source: "sales", view: BY_REGION, format: "csv" });
        assert.match(closed.text, /^NO_OUTPUT: the view uses a field whose values may not be shown/);
        const open = await call(client, "render_view", { source: "sales", view: { rows: ["Region"] }, format: "json" });
        assert.equal(open.data.output, null);
        assert.ok(open.data.inline.text.includes("North"));
        await close();
    } finally {
        await server.close();
    }
});
