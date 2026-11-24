// A source's print template (sources.<id>.template): check-config lists it and reports what the
// parser refuses as a PROBLEM line; the start refuses it like any other configuration error, so a typo
// such as {{titel}} is found before the first html report fails with INVALID_TEMPLATE. A template
// file that is not there is like a missing source file: a PROBLEM the server starts with, a warning at start.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, checkConfig, createContext } from "pivotkit-server";
import { factsOf, workspace, runBin } from "./helpers.js";

/** A print template as an operator writes one: its own header, a typo on line 7. */
const BRAND = ["<!doctype html>", "<html>", "<head>", "<title>{{title}}</title>", "</head>", "<body>", "<h1>{{titel}}</h1>", "{{table}}", "</body>", "</html>"].join("\n");
const TYPO = "unknown placeholder {{titel}} (line 7); did you mean {{title}}?";

/** A workspace with data/sales.csv and the template file data/brand.html. */
function withTemplate(text) {
    const dir = workspace();
    if (text !== undefined) {
        writeFileSync(join(dir, "data", "brand.html"), text);
    }
    return dir;
}

test("check-config lists each source's print template and reports the parser's message as a PROBLEM", async () => {
    const dir = withTemplate(BRAND);
    const result = await checkConfig({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: dir }, { http: false, name: "pivotkit-server" });
    const lines = factsOf(result.text).split("\n");
    assert.equal(lines[0], "pivotkit-server: the server does not start with this configuration.");
    assert.ok(lines.includes("    template: data/brand.html"), result.text);
    assert.ok(lines.includes(`PROBLEM: sources.sales.template: ${TYPO} -> the server does not start`), result.text);
    assert.equal(result.problems, 1);
    assert.equal(result.stops, 1);
});

test("check-config: a template the parser accepts is listed with no PROBLEM; a missing one a PROBLEM the server starts with, an oversized one a PROBLEM that stops it", async () => {
    const good = withTemplate(BRAND.replace("{{titel}}", "{{title}}"));
    const ok = await checkConfig({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: good }, { http: false });
    assert.match(ok.text, /^ {4}template: data\/brand\.html$/m);
    assert.doesNotMatch(ok.text, /PROBLEM/);
    assert.equal(ok.problems, 0);

    const missing = withTemplate(undefined);
    const gone = await checkConfig({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: missing }, { http: false });
    // like a missing source file: the server starts, the source's html reports fail until it is there
    assert.match(gone.text, /^ {4}template: data\/brand\.html$/m);
    assert.match(factsOf(gone.text), /^PROBLEM: sources\.sales\.template: brand\.html: not found -> the server starts; html reports of sales fail until it can be read$/m);
    assert.match(factsOf(gone.text), /^pivotkit-mcp: the server starts, but not everything will work\.\n1 problem, /);
    assert.equal(gone.problems, 1);
    assert.equal(gone.stops, 0);

    // the same byte limit as on a request (1 MiB): the reader's limit message, no path
    const big = withTemplate(`<p>{{title}}</p>${"x".repeat(1_048_577)}`);
    const large = await checkConfig({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: big }, { http: false });
    assert.match(factsOf(large.text), /^PROBLEM: sources\.sales\.template: brand\.html: [\d,]+ bytes exceed the limit of 1,048,576 \(limits\.template\) -> the server does not start$/m);
    assert.doesNotMatch(factsOf(large.text).split("\n").find((l) => l.startsWith("PROBLEM")) ?? "", new RegExp(big.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("the start refuses a source's broken print template like any other configuration error", async () => {
    const dir = withTemplate(BRAND);
    await assert.rejects(
        createContext({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: dir }),
        (e) => e instanceof ConfigError && e.message === `sources.sales.template: ${TYPO}`
    );
    // a template that is not there yet (a deploy copies it later): the start warns and goes on
    const missing = withTemplate(undefined);
    const said = [];
    const started = await createContext({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: missing }, { stderr: { write: (t) => said.push(String(t)) } });
    await started.close();
    assert.ok(
        said.some((t) => t.includes("sources.sales.template: brand.html: not found; html reports of sales fail until it can be read")),
        said.join("")
    );
    // a good template starts
    const good = withTemplate(BRAND.replace("{{titel}}", "{{title}}"));
    const context = await createContext({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: good });
    await context.close();
});

test("the start reads the template through the safe reader: a FIFO and a directory are not a regular file, and refused", { skip: process.platform === "win32" && "no FIFOs" }, async () => {
    const dir = withTemplate(undefined);
    const fifo = join(dir, "data", "brand.html");
    execFileSync("mkfifo", [fifo]);
    await assert.rejects(createContext({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: dir }), (e) => e instanceof ConfigError && e.message === "sources.sales.template: brand.html: not a regular file");
    const other = withTemplate(undefined);
    mkdirSync(join(other, "data", "brand.html"));
    await assert.rejects(createContext({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: other }), (e) => e instanceof ConfigError && e.message === "sources.sales.template: brand.html: not a regular file");
    const checked = await checkConfig({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: other }, { http: false });
    assert.match(factsOf(checked.text), /^PROBLEM: sources\.sales\.template: brand\.html: not a regular file -> the server does not start$/m);
});

test("pivotkit-server serve and check-config from the command line: the template's message, exit 2 and 1", () => {
    const dir = withTemplate(BRAND);
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } } }));
    const serve = runBin(["serve", "--config", config, "--port", "0"], { cwd: dir });
    assert.equal(serve.status, 2, serve.stderr);
    // stderr is a pipe here: serve's start error is a JSON line (the log's auto rule) with the same words
    const said = JSON.parse(serve.stderr.split("\n")[0]);
    assert.deepEqual([said.level, said.code, said.msg], ["error", "CONFIG", `sources.sales.template: ${TYPO}`]);
    const check = runBin(["check-config", "--config", config], { cwd: dir });
    assert.equal(check.status, 1, check.stderr);
    assert.match(factsOf(check.stdout), new RegExp(`PROBLEM: sources\\.sales\\.template: ${TYPO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} -> the server does not start`));
});
