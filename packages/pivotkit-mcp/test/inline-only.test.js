// render_view with save: false, over the wire: the result comes back inline only, with no file in the
// output directory, no output and no link; where it cannot come back inline (a format that is a file,
// inline results off, a field that is not fully shown, a result over the inline caps) the call fails
// with a code and a way out, never a silent file. Without save the render is as it always was.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { BY_REGION, call, httpClient, httpServer, workspace } from "./helpers.js";

/** Region shown, Sales a summary field (the source "sales"): BY_REGION touches Sales. The source "open" shows every field, so a saved report over it gets a link. */
const POLICY = Object.freeze({ fields: { Region: "show", Product: "show" } });
const COUNT_BY_REGION = Object.freeze({ rows: ["Region"], values: [{ agg: "count" }] });

/** A server with an output directory and an address for its files (so a saved report has a link), and a client of it. */
async function withServer(policy, run) {
    const dir = workspace();
    const server = await httpServer({ sources: { open: { file: "data/sales.csv", policy: { default: "show", ...policy, fields: {} } }, sales: { file: "data/sales.csv", policy } }, output: { dir: "out", baseUrl: "https://files.example.com/reports" }, baseDir: dir });
    const { client, close } = await httpClient(server.url, { era: "modern" });
    const files = () => readdirSync(join(dir, "out")).filter((n) => !n.startsWith("."));
    try {
        await run(client, { files, log: server.log });
    } finally {
        await close();
        await server.close();
    }
}

test("save: false: the result inline, no output, no link, no file; the call line says nothing was saved", () =>
    withServer(POLICY, async (client, { files, log }) => {
        for (const format of ["csv", "json"]) {
            const rendered = await call(client, "render_view", { source: "open", view: COUNT_BY_REGION, format, save: false });
            assert.equal(rendered.isError, false, rendered.text);
            assert.equal(rendered.data.ok, true);
            assert.equal(rendered.data.output, null);
            assert.equal(rendered.data.inline.format, format);
            assert.match(rendered.data.inline.text, /North/);
            assert.match(rendered.data.message, /not saved as a file/);
            assert.match(rendered.text, new RegExp(`^Done: ${format}, inline\\.`));
            assert.ok(!rendered.raw.content.some((c) => c.type === "resource_link"), "no resource_link");
            assert.doesNotMatch(rendered.text, /files\.example\.com/);
        }
        assert.deepEqual(files(), []);
        const lines = log.filter((l) => l.event === "call" && l.tool === "render_view");
        assert.equal(lines.length, 2);
        assert.ok(lines.every((l) => l.saved === false && l.ok === true), JSON.stringify(lines));
    }));

test("save: false with a format that is a file: INVALID_INPUT naming csv and json; nothing written", () =>
    withServer(POLICY, async (client, { files }) => {
        for (const format of [undefined, "xlsx", "html", "svg"]) {
            const rendered = await call(client, "render_view", { source: "open", view: COUNT_BY_REGION, ...(format ? { format } : {}), save: false });
            assert.equal(rendered.isError, true);
            assert.match(rendered.text, /^INVALID_INPUT: save: false .*csv.*json/);
        }
        assert.deepEqual(files(), []);
    }));

test("save: false over a field that is not fully shown: NOT_ALLOWED, no number of the result, no file", () =>
    withServer(POLICY, async (client, { files, log }) => {
        const rendered = await call(client, "render_view", { source: "sales", view: BY_REGION, format: "csv", save: false });
        assert.equal(rendered.isError, true);
        assert.match(rendered.text, /^NOT_ALLOWED: .*not fully shown.*leave out save/);
        // the sums (15, 20, 7, 3) and the source's size stay out of the answer
        assert.doesNotMatch(rendered.text, /\b(15|20|7|3|5|6)\b/);
        assert.deepEqual(files(), []);
        const line = log.find((l) => l.event === "call" && l.tool === "render_view");
        assert.deepEqual([line?.saved, line?.code], [false, "NOT_ALLOWED"]);
    }));

test("save: false with a result over the inline caps: LIMIT_EXCEEDED with the caps, no file", () =>
    withServer({ ...POLICY, inline: { cells: 4, bytes: 32_768 } }, async (client, { files }) => {
        const rendered = await call(client, "render_view", { source: "open", view: COUNT_BY_REGION, format: "json", save: false });
        assert.equal(rendered.isError, true);
        assert.match(rendered.text, /^LIMIT_EXCEEDED: the result is larger than may come back inline \(4 cells, 32768 bytes\)/);
        assert.deepEqual(files(), []);
    }));

test("save: false with a result over the inline bytes cap: LIMIT_EXCEEDED, no file", () =>
    withServer({ ...POLICY, inline: { cells: 500, bytes: 10 } }, async (client, { files }) => {
        const rendered = await call(client, "render_view", { source: "open", view: COUNT_BY_REGION, format: "csv", save: false });
        assert.equal(rendered.isError, true);
        assert.match(rendered.text, /^LIMIT_EXCEEDED: the result is larger than may come back inline \(500 cells, 10 bytes\)/);
        assert.deepEqual(files(), []);
    }));

test("save: false with inline results off: NOT_ALLOWED, no file", () =>
    withServer({ ...POLICY, inline: false }, async (client, { files }) => {
        const rendered = await call(client, "render_view", { source: "open", view: COUNT_BY_REGION, format: "csv", save: false });
        assert.equal(rendered.isError, true);
        assert.match(rendered.text, /^NOT_ALLOWED: inline results are off/);
        assert.deepEqual(files(), []);
    }));

test("without save, and with save: true, a render is as before: a file with a link, inline where allowed; the call line has no saved", () =>
    withServer(POLICY, async (client, { files, log }) => {
        for (const save of [undefined, true]) {
            const rendered = await call(client, "render_view", { source: "open", view: COUNT_BY_REGION, format: "csv", ...(save === undefined ? {} : { save }) });
            assert.equal(rendered.isError, false, rendered.text);
            assert.match(rendered.data.output.url, /^https:\/\/files\.example\.com\/reports\//);
            assert.match(rendered.data.inline.text, /North/);
            assert.ok(rendered.raw.content.some((c) => c.type === "resource_link"));
        }
        assert.equal(files().length, 2);
        assert.ok(log.filter((l) => l.event === "call").every((l) => !("saved" in l)));
    }));

test("tools/list: render_view takes save, a boolean", () =>
    withServer(POLICY, async (client) => {
        const { tools } = await client.listTools();
        const save = tools.find((t) => t.name === "render_view")?.inputSchema.properties?.save;
        assert.equal(save?.type, "boolean");
        assert.match(String(save?.description), /inline/);
    }));
