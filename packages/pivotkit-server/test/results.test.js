// Results a caller reads or pastes as they are: inline csv and json with numbers as the view shows
// them (no float noise), in the caller's locale, with one header row on request and json on one line;
// saved files and the file route keep full precision unless numbers says otherwise; every answer
// names its request id; saved files are named without spaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OPERATION_NAMES } from "pivotkit-report/operations";
import { callerOf, createContext, present, presentedOutput } from "pivotkit-server";
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

test("REST: inline csv rounds as the view shows; the saved file and the file route keep full precision; numbers overrides both", async () => {
    const { server, dir } = await amountsServer();
    try {
        const res = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", title: "Amounts" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.inline.text, "Region,East,North,Grand Total\r\nProduct,Sum of Amount,,\r\nA,2.4,2.4,4.8\r\nB,2.4,2.4,4.8\r\nGrand Total,4.8,4.8,9.6\r\n");
        assert.match(readFileSync(join(dir, "out", res.data.output.name), "utf8"), /Grand Total,4\.8,4\.8,9\.59999999999999\r\n$/, "the saved file: full");
        const file = await call(`${server.api}/views/render/file`, { body: { source: "amounts", layout: LAYOUT, format: "csv" } });
        assert.match(new TextDecoder().decode(file.data), /Grand Total,4\.8,4\.8,9\.59999999999999\r\n$/, "the file route: full");
        const shownFile = await call(`${server.api}/views/render/file`, { body: { source: "amounts", layout: LAYOUT, format: "csv", numbers: "shown" } });
        assert.match(new TextDecoder().decode(shownFile.data), /Grand Total,4\.8,4\.8,9\.6\r\n$/);
        const shownSaved = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", numbers: "shown" } });
        assert.equal(readFileSync(join(dir, "out", shownSaved.data.output.name), "utf8"), `\uFEFF${shownSaved.data.inline.text}`);
        const full = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", numbers: "full", save: false } });
        assert.match(full.data.inline.text, /Grand Total,4\.8,4\.8,9\.59999999999999\r\n$/);
    } finally {
        await server.close();
    }
});

test("REST: a value shown as 0 that is not 0 is said in the message; options a format ignores are said too", async () => {
    const dir = workspace({ "tiny.csv": "Product,Amount\nA,0.000000001\nB,2\n" });
    const server = await restServer({ sources: { tiny: { file: "data/tiny.csv", policy: { default: "show" } } }, rest: { inline: true }, output: { dir: "out" }, baseDir: dir });
    try {
        const res = await call(`${server.api}/views/render`, { body: { source: "tiny", view: { rows: ["Product"], values: [{ field: "Amount", agg: "sum", format: "number:2" }] }, format: "csv", save: false } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.match(res.data.inline.text, /^A,0\r\n/m);
        assert.match(res.data.message, /1 value is shown as 0 though it is not 0[^.]*numbers: "full"/);
        const full = await call(`${server.api}/views/render`, { body: { source: "tiny", view: { rows: ["Product"], values: [{ field: "Amount", agg: "sum", format: "number:2" }] }, format: "csv", numbers: "full", save: false } });
        assert.doesNotMatch(full.data.message, /shown as 0/);
        const xlsx = await call(`${server.api}/views/render`, { body: { source: "tiny", layout: { rows: ["Product"], values: [{ field: "Amount", agg: "sum" }] }, format: "xlsx", numbers: "shown", flatHeader: true } });
        assert.equal(xlsx.status, 200, JSON.stringify(xlsx.data));
        assert.match(xlsx.data.message, /numbers and flatHeader apply to csv and json only and were ignored for xlsx/);
    } finally {
        await server.close();
    }
});

test("the inline cap counts the text that is sent: json on one line fits where its indented file would not", async () => {
    const dir = workspace({ "amounts.csv": AMOUNTS_CSV });
    const local = callerOf("none", undefined);
    const input = { source: "amounts", layout: LAYOUT, format: "json", save: false };
    const contextOf = async (bytes) => createContext({ log: "off", baseDir: dir, sources: { amounts: { file: "data/amounts.csv", policy: { default: "show", inline: { cells: 500, bytes } } } } });
    const wide = await contextOf(1_000_000);
    const sent = (await present(wide, "render_view", input, local)).result.inline.text;
    const indented = JSON.stringify(JSON.parse(sent), null, 2);
    const exact = await contextOf(Buffer.byteLength(sent));
    assert.equal((await present(exact, "render_view", input, local)).result.inline.text, sent, `fits at ${Buffer.byteLength(sent)} bytes, the indented one takes ${Buffer.byteLength(indented)}`);
    const under = await contextOf(Buffer.byteLength(sent) - 1);
    await assert.rejects(present(under, "render_view", input, local), (e) => e.code === "LIMIT_EXCEEDED");
});

test("REST locale: ar-EG writes Latin digits with \".\" and \",\"; a numbering system of its own is refused", async () => {
    const { server } = await amountsServer();
    try {
        const ar = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", locale: "ar-EG", flatHeader: true, save: false } });
        assert.equal(ar.status, 200, JSON.stringify(ar.data));
        assert.match(ar.data.inline.text, /,4\.8,4\.8,9\.6\r\n$/);
        assert.doesNotMatch(ar.data.inline.text, /[\u0660-\u0669\u066b]/);
        const nu = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", locale: "ar-EG-u-nu-arab", save: false } });
        assert.equal(nu.status, 400);
        assert.match(nu.data.detail, /numbering system/);
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
        // letters NFKD keeps whole, titles without Latin letters, Windows device names
        const named = async (title) => (await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "csv", title } })).data.output.filename;
        assert.equal(await named("Ærø Łódź Þing Đakovo Œuvre"), "aero-lodz-thing-dakovo-oeuvre.csv");
        assert.match(await named("日本の売上"), /^report-[0-9a-f]{8}\.csv$/);
        assert.notEqual(await named("日本の売上"), await named("中国の売上"), "two titles without Latin letters get two names");
        assert.equal(await named("CON"), "_con.csv");
        assert.equal(await named("lpt1"), "_lpt1.csv");
        assert.equal(await named("nul.txt"), "_nul.txt.csv", "a device name with an extension");
        // letters dropped beside what is kept: the hash keeps two titles apart
        assert.match(await named("日本語2"), /^2-[0-9a-f]{8}\.csv$/);
        assert.notEqual(await named("日本語2"), await named("中文2"));
        assert.equal(await named("Q3 2026"), "q3-2026.csv", "nothing dropped: no hash");
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

test("REST render: an xlsx of a chart view has the finding chartNotInXlsx; a table view none (#360)", async () => {
    const { server } = await amountsServer();
    try {
        const chart = await call(`${server.api}/views/render`, { body: { source: "amounts", view: { version: 2, ...LAYOUT, display: "chart", chart: { type: "line" } }, format: "xlsx" } });
        assert.equal(chart.status, 200, JSON.stringify(chart.data));
        assert.deepEqual(chart.data.findings.map((f) => [f.code, f.severity]), [["chartNotInXlsx", "warning"]]);
        const table = await call(`${server.api}/views/render`, { body: { source: "amounts", layout: LAYOUT, format: "xlsx" } });
        assert.equal(table.status, 200, JSON.stringify(table.data));
        assert.deepEqual(table.data.findings, []);
    } finally {
        await server.close();
    }
});
