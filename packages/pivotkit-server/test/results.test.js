// Results a caller reads or pastes as they are: inline csv and json with numbers as the view shows
// them (no float noise), in the caller's locale, with one header row on request and json on one line;
// the saved file holds the same numbers; every answer names its request id; saved files are named
// without spaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OPERATION_NAMES } from "pivotkit-report/operations";
import { presentedOutput } from "pivotkit-server";
import { call, restServer, workspace } from "./helpers.js";

/** 64 amounts of 0.1 and 0.2: their sum is 9.599999999999994 in floating point, not 9.6. */
const AMOUNTS_CSV = ["Region,Product,Amount", ...Array.from({ length: 64 }, (_, i) => `${["East", "North"][(i >> 1) % 2]},${["A", "B"][(i >> 2) % 2]},${[0.1, 0.2][i % 2]}`)].join("\n") + "\n";

/** A value with columns: Product down, Region across, one sum. */
const LAYOUT = Object.freeze({ rows: ["Product"], cols: ["Region"], values: [{ field: "Amount", agg: "sum" }] });

async function amountsServer() {
    const dir = workspace({ "amounts.csv": AMOUNTS_CSV });
    const server = await restServer({ sources: { amounts: { file: "data/amounts.csv", policy: { default: "show", results: true } } }, rest: { inline: true }, output: { dir: "out" }, baseDir: dir });
    return { server, dir };
}

test("REST inline csv: numbers as the view shows them, the same in the saved file; full keeps the old form", async () => {
    const { server, dir } = await amountsServer();
    try {
        const res = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", title: "Amounts" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.inline.text, "Region,East,North,Grand Total\r\nProduct,Sum of Amount,,\r\nA,2.4,2.4,4.8\r\nB,2.4,2.4,4.8\r\nGrand Total,4.8,4.8,9.6\r\n");
        // the saved file is the same text (with the byte order mark Excel needs)
        assert.equal(readFileSync(join(dir, "out", res.data.output.name), "utf8"), `\uFEFF${res.data.inline.text}`);
        const full = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", numbers: "full", save: false } });
        assert.match(full.data.inline.text, /Grand Total,4\.8,4\.8,9\.59999999999999\r\n$/);
    } finally {
        await server.close();
    }
});

test("REST inline csv: the caller's locale and one header row; json inline on one line, its numbers rounded", async () => {
    const { server } = await amountsServer();
    try {
        const de = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", locale: "de-DE", flatHeader: true, save: false } });
        assert.equal(de.status, 200, JSON.stringify(de.data));
        assert.equal(de.data.inline.text, "Product;East;North;Gesamtergebnis\r\nA;2,4;2,4;4,8\r\nB;2,4;2,4;4,8\r\nGesamtergebnis;4,8;4,8;9,6\r\n");
        const json = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "json", locale: "de-DE", save: false } });
        assert.equal(json.status, 200, JSON.stringify(json.data));
        assert.ok(!json.data.inline.text.includes("\n"), "one line");
        const parsed = JSON.parse(json.data.inline.text);
        assert.deepEqual(parsed.rows.at(-1), { labels: ["Gesamtergebnis"], total: 2, collapsed: false, values: [4.8, 4.8, 9.6] });
        assert.deepEqual(parsed.columns.at(-1), { labels: ["Gesamtergebnis", "Summe von Amount"], value: "Summe von Amount", total: 2 });
        const bad = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", locale: "<script>", save: false } });
        assert.equal(bad.status, 400);
        assert.equal(bad.data.code, "INVALID_INPUT");
    } finally {
        await server.close();
    }
});

test("REST: every answer names its request id in the body, the same as X-Request-Id", async () => {
    const { server } = await amountsServer();
    try {
        const answers = [
            await call(`${server.api}/sources`),
            await call(`${server.api}/sources/amounts`),
            await call(`${server.api}/views/validate`, { body: { source: "amounts", layout: LAYOUT } }),
            await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", save: false } })
        ];
        for (const res of answers) {
            assert.equal(res.status, 200, JSON.stringify(res.data));
            assert.match(res.data.requestId, /^[A-Za-z0-9_-]{11}$/);
            assert.equal(res.data.requestId, res.headers.get("x-request-id"));
        }
        assert.equal(new Set(answers.map((r) => r.data.requestId)).size, answers.length);
    } finally {
        await server.close();
    }
});

test("saved files are named without spaces; the file route's download keeps the title", async () => {
    const { server, dir } = await amountsServer();
    try {
        const res = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "json", title: "Umsatz pro Produkt (Größe)" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        // (a download link's 22 random characters before the name)
        assert.match(res.data.output.name, /^(?:[A-Za-z0-9_-]{22}-)?umsatz-pro-produkt-grosse\.pivotkit-out\.json$/);
        assert.equal(res.data.output.filename, "umsatz-pro-produkt-grosse.json");
        assert.deepEqual(readdirSync(join(dir, "out")).filter((n) => !n.startsWith(".")), [res.data.output.name]);
        // the saved json file stays indented for a person who opens it
        assert.match(readFileSync(join(dir, "out", res.data.output.name), "utf8"), /^\{\n {2}"rowHeaders"/);
        const file = await call(`${server.api}/views/render/file`, { body: { source: "amounts", layout: LAYOUT, format: "csv", name: "Umsatz pro Produkt" } });
        assert.equal(file.status, 200);
        // it saves nothing: the person's download is named by the title
        assert.equal(file.headers.get("content-disposition"), "attachment; filename=\"Umsatz pro Produkt.csv\"; filename*=UTF-8''Umsatz%20pro%20Produkt.csv");
    } finally {
        await server.close();
    }
});

test("the output schemas: requestId on every operation; inline says its numbers, header and json shape", () => {
    for (const name of OPERATION_NAMES) {
        assert.equal(presentedOutput(name).properties.requestId?.type, "string", name);
    }
    const inline = presentedOutput("render_view").properties.inline;
    assert.match(inline.properties.text.description, /total is 0 for data, 1 for a subtotal, 2 for a grand total/);
    assert.match(inline.properties.text.description, /one line/);
});
