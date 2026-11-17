// What a model pastes into its answer: inline csv with numbers as the view shows them, in the
// caller's locale, with one header row on request; every tool result names its request id; a saved
// file's link is named without spaces and titled as the report.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, httpClient, httpServer, workspace } from "./helpers.js";

/** 64 amounts of 0.1 and 0.2: their sum is 9.599999999999994 in floating point, not 9.6. */
const AMOUNTS_CSV = ["Region,Product,Amount", ...Array.from({ length: 64 }, (_, i) => `${["East", "North"][(i >> 1) % 2]},${["A", "B"][(i >> 2) % 2]},${[0.1, 0.2][i % 2]}`)].join("\n") + "\n";
const LAYOUT = Object.freeze({ rows: ["Product"], cols: ["Region"], values: [{ field: "Amount", agg: "sum" }] });

test("MCP render_view: inline csv rounded as the view shows it, in German with one header row; the request id in every result", async () => {
    const dir = workspace({ "amounts.csv": AMOUNTS_CSV });
    const server = await httpServer({ sources: { amounts: { file: "data/amounts.csv", policy: { default: "show" } } }, output: { dir: "out", baseUrl: "https://files.example.com/reports/" }, baseDir: dir });
    const { client, close } = await httpClient(server.url);
    try {
        const tools = (await client.listTools()).tools;
        const render = tools.find((t) => t.name === "render_view");
        assert.deepEqual([render.inputSchema.properties.flatHeader.type, render.inputSchema.properties.locale.type, render.inputSchema.properties.inline], ["boolean", "string", undefined]);
        assert.match(render.inputSchema.properties.numbers.description, /Default: shown for a result that comes back inline, full for a saved file or a download/);
        assert.equal(render.outputSchema.properties.requestId.type, "string");
        const de = await call(client, "render_view", { source: "amounts", layout: LAYOUT, format: "csv", locale: "de-DE", flatHeader: true, save: false });
        assert.equal(de.isError, false, de.text);
        assert.equal(de.data.inline.text, "Product;East;North;Gesamtergebnis\r\nA;2,4;2,4;4,8\r\nB;2,4;2,4;4,8\r\nGesamtergebnis;4,8;4,8;9,6\r\n");
        const listed = await call(client, "list_sources");
        const calls = server.log.filter((l) => l.event === "call");
        assert.deepEqual([de.data.requestId, listed.data.requestId], calls.map((l) => l.requestId));
        assert.notEqual(de.data.requestId, listed.data.requestId);
        // the summary line names it too, as an error's text does
        assert.ok(de.text.split("\n")[0].endsWith(` (request id ${de.data.requestId})`), de.text.split("\n")[0]);
        // a saved file: its name without spaces, the link titled as the report
        const saved = await client.callTool({ name: "render_view", arguments: { source: "amounts", layout: LAYOUT, format: "csv", title: "Umsatz pro Produkt" } });
        const structured = /** @type {any} */ (saved.structuredContent);
        // (output.baseUrl puts 22 random characters before the name)
        assert.match(structured.output.name, /^[A-Za-z0-9_-]{22}-umsatz-pro-produkt\.pivotkit-out\.csv$/);
        const link = /** @type {any[]} */ (saved.content).find((c) => c.type === "resource_link");
        assert.deepEqual([link.name, link.title], ["umsatz-pro-produkt.csv", "Umsatz pro Produkt"]);
        assert.equal(link.uri, `https://files.example.com/reports/${structured.output.name}`);
    } finally {
        await close();
        await server.close();
    }
});
