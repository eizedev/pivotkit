// The server-wide print template (output.template): every html report whose source sets none takes
// it, data sent in the request (inline:) and a file by path (file:) too, so one deployment has one
// design. It is read and checked as a source's template is: at start, by check-config and on every
// request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, callerOf, checkConfig, createContext, present } from "pivotkit-server";
import { BY_REGION, TOKEN, call, factsOf, restServer, workspace } from "./helpers.js";

const LOCAL = callerOf("none", undefined);

/** A print template with a mark of its own in the page, so a report shows which template made it. */
const branded = (mark) => ["<!doctype html>", "<html>", "<head>", "<title>{{title}}</title>", "{{style}}", "</head>", "<body>", `<p class="brand">${mark}</p>`, "{{table}}", "</body>", "</html>"].join("\n");
const TYPO = "unknown placeholder {{titel}} (line 7); did you mean {{title}}?";
const BROKEN = ["<!doctype html>", "<html>", "<head>", "<title>{{title}}</title>", "</head>", "<body>", "<h1>{{titel}}</h1>", "{{table}}", "</body>", "</html>"].join("\n");

/** A small table as a caller sends it. */
const TICKETS = { name: "Tickets", columns: ["Region", "Sales"], rows: [["North", 10], ["South", 20]], rowCount: 2 };

/** A workspace with data/sales.csv and the given template files in data/. */
function withTemplates(files) {
    const dir = workspace();
    for (const [name, text] of Object.entries(files)) {
        writeFileSync(join(dir, "data", name), text);
    }
    return dir;
}

/** The fixed text of a print template the server cannot read now (#653). */
const TEMPLATE_GONE = "the server's print template is not available now; tell the operator and give the request id";

/**
 * A render whose print template cannot be read: the server's fault, said with a fixed text. Not a
 * 404 that reads like a missing source, and not the template's file name.
 */
function assertTemplateUnavailable(error, file) {
    assert.deepEqual([error.code, error.status, error.message, error.details?.retryable], ["SOURCE_UNAVAILABLE", 502, TEMPLATE_GONE, false]);
    assert.ok(!JSON.stringify({ message: error.message, details: error.details }).includes(file));
}

/** An html report's text, as the server saved it. */
async function htmlOf(context, dir, input) {
    const { result } = await present(context, "render_view", { view: BY_REGION, format: "html", ...input }, LOCAL);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    return readFileSync(join(dir, "out", result.output.name), "utf8");
}

test("output.template: inline: data, a file: path and a source without a template take it; a source's own template wins", async () => {
    const dir = withTemplates({ "house.html": branded("HOUSE DESIGN"), "own.html": branded("OWN DESIGN") });
    const context = await createContext({
        log: "off",
        sources: { plain: { file: "data/sales.csv", policy: { default: "show" } }, own: { file: "data/sales.csv", template: "data/own.html", policy: { default: "show" } } },
        files: { allowDirs: ["data"], policy: { default: "show" } },
        output: { dir: "out", template: "data/house.html" },
        baseDir: dir
    });
    try {
        assert.match(await htmlOf(context, dir, { source: "inline:", data: TICKETS }), /HOUSE DESIGN/);
        writeFileSync(join(dir, "data", "other.csv"), "Region,Sales\nNorth,1\n");
        assert.match(await htmlOf(context, dir, { source: "file:other.csv" }), /HOUSE DESIGN/);
        assert.match(await htmlOf(context, dir, { source: "plain" }), /HOUSE DESIGN/);
        const own = await htmlOf(context, dir, { source: "own" });
        assert.match(own, /OWN DESIGN/);
        assert.doesNotMatch(own, /HOUSE DESIGN/);
        // read on every request, as a source's template: a changed file applies to the next report
        writeFileSync(join(dir, "data", "house.html"), branded("NEW HOUSE DESIGN"));
        assert.match(await htmlOf(context, dir, { source: "inline:", data: TICKETS }), /NEW HOUSE DESIGN/);
    } finally {
        await context.close();
    }
});

test("output.template: the start refuses what the parser refuses and warns of a missing file", async () => {
    const dir = withTemplates({ "house.html": BROKEN });
    await assert.rejects(
        createContext({ log: "off", output: { dir: "out", template: "data/house.html" }, baseDir: dir }),
        (e) => e instanceof ConfigError && e.message === `output.template: ${TYPO}`
    );
    const missing = withTemplates({});
    const said = [];
    const started = await createContext({ output: { dir: "out", template: "data/house.html" }, baseDir: missing }, { stderr: { write: (t) => said.push(String(t)) } });
    await started.close();
    assert.ok(said.some((t) => t.includes("output.template: house.html: not found; html reports without a template of their own fail until it can be read")), said.join(""));
});

test("check-config names output.template and reports its problems as for a source's template", async () => {
    const good = withTemplates({ "house.html": branded("HOUSE") });
    const ok = await checkConfig({ output: { dir: "out", template: "data/house.html" }, baseDir: good }, { http: false });
    assert.match(factsOf(ok.text), /^ {2}print template: data\/house\.html, for every html report whose source has none, data sent in the request too$/m);
    assert.doesNotMatch(ok.text, /PROBLEM/);

    const bad = withTemplates({ "house.html": BROKEN });
    const broken = await checkConfig({ output: { dir: "out", template: "data/house.html" }, baseDir: bad }, { http: false });
    assert.match(factsOf(broken.text), new RegExp(`^PROBLEM: output\\.template: ${TYPO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} -> the server does not start$`, "m"));
    assert.equal(broken.stops, 1);

    const none = withTemplates({});
    const gone = await checkConfig({ output: { template: "data/house.html" }, baseDir: none }, { http: false });
    assert.match(factsOf(gone.text), /^PROBLEM: output\.template: house\.html: not found -> the server starts; html reports without a template of their own fail until it can be read$/m);
    assert.equal(gone.stops, 0);
});

test("a missing output.template fails html reports only: csv, describe and validate still answer", async () => {
    const dir = withTemplates({ "house.html": branded("HOUSE DESIGN") });
    const context = await createContext({ log: "off", sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, output: { dir: "out", template: "data/house.html" }, baseDir: dir });
    try {
        rmSync(join(dir, "data", "house.html"));
        const csv = await present(context, "render_view", { source: "sales", view: BY_REGION, format: "csv" }, LOCAL);
        assert.equal(csv.result.ok, true);
        assert.ok((await present(context, "describe_source", { source: "sales" }, LOCAL)).result.fields.length > 0);
        assert.equal((await present(context, "validate_view", { source: "sales", view: BY_REGION }, LOCAL)).result.valid, true);
        const html = await present(context, "render_view", { source: "inline:", data: TICKETS, view: BY_REGION, format: "html" }, LOCAL).catch((e) => e);
        assertTemplateUnavailable(html, "house.html");
    } finally {
        await context.close();
    }
});

test("a missing print template over REST: 502 SOURCE_UNAVAILABLE with the fixed text, no file name, an error line for the operator", async () => {
    const dir = withTemplates({ "own.html": branded("OWN DESIGN") });
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", template: "data/own.html", policy: { default: "show" } } }, output: { dir: "out" }, auth: { mode: "token", tokens: [{ name: "ops", env: "OPS" }] }, baseDir: dir }, { env: { OPS: TOKEN } });
    try {
        rmSync(join(dir, "data", "own.html"));
        const answer = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: BY_REGION, format: "html" } });
        assert.deepEqual([answer.status, answer.data.code, answer.data.detail, answer.data.retryable], [502, "SOURCE_UNAVAILABLE", TEMPLATE_GONE, false]);
        assert.ok(!JSON.stringify(answer.data).includes("own.html"));
        const line = server.log.find((l) => l.event === "request" && l.status === 502);
        assert.deepEqual([line?.level, line?.code], ["error", "SOURCE_UNAVAILABLE"]);
    } finally {
        await server.close();
    }
});

test("a missing source template fails that source's html reports only, and a file put back applies again", async () => {
    const dir = withTemplates({ "own.html": branded("OWN DESIGN") });
    const context = await createContext({ log: "off", sources: { sales: { file: "data/sales.csv", template: "data/own.html", policy: { default: "show" } } }, output: { dir: "out" }, baseDir: dir });
    try {
        rmSync(join(dir, "data", "own.html"));
        assert.equal((await present(context, "render_view", { source: "sales", view: BY_REGION, format: "csv" }, LOCAL)).result.ok, true);
        const html = await present(context, "render_view", { source: "sales", view: BY_REGION, format: "html" }, LOCAL).catch((e) => e);
        assertTemplateUnavailable(html, "own.html");
        writeFileSync(join(dir, "data", "own.html"), branded("OWN DESIGN AGAIN"));
        assert.match(await htmlOf(context, dir, { source: "sales" }), /OWN DESIGN AGAIN/);
    } finally {
        await context.close();
    }
});
