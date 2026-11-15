// A source's print template (sources.<id>.template): check-config lists it and reports what the
// parser refuses as a PROBLEM line; the start refuses it like any other configuration error, so a typo
// such as {{titel}} is found before the first html report fails with INVALID_TEMPLATE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, checkConfig, createContext } from "pivotkit-server";
import { BIN, workspace } from "./helpers.js";

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
    const lines = result.text.split("\n");
    assert.equal(lines[0], "pivotkit-server: the configuration is valid, but the server would not start with it as it is.");
    assert.ok(lines.includes("    template: data/brand.html"), result.text);
    assert.ok(lines.includes(`    PROBLEM: sources.sales.template: ${TYPO}`), result.text);
    assert.equal(result.problems, 1);
});

test("check-config: a template the parser accepts is listed with no PROBLEM; a missing or oversized one is a PROBLEM", async () => {
    const good = withTemplate(BRAND.replace("{{titel}}", "{{title}}"));
    const ok = await checkConfig({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: good }, { http: false });
    assert.match(ok.text, /^ {4}template: data\/brand\.html$/m);
    assert.doesNotMatch(ok.text, /PROBLEM/);
    assert.equal(ok.problems, 0);

    const missing = withTemplate(undefined);
    const gone = await checkConfig({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: missing }, { http: false });
    assert.match(gone.text, /^ {4}PROBLEM: sources\.sales\.template: brand\.html: not found$/m);
    assert.equal(gone.problems, 1);

    // the same byte limit as on a request (1 MiB): the reader's limit message, no path
    const big = withTemplate(`<p>{{title}}</p>${"x".repeat(1_048_577)}`);
    const large = await checkConfig({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: big }, { http: false });
    assert.match(large.text, /^ {4}PROBLEM: sources\.sales\.template: brand\.html: [\d,]+ bytes exceed the limit of 1,048,576 \(limits\.template\)$/m);
    assert.doesNotMatch(large.text.split("PROBLEM")[1] ?? "", new RegExp(big.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("the start refuses a source's broken print template like any other configuration error", async () => {
    const dir = withTemplate(BRAND);
    await assert.rejects(
        createContext({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: dir }),
        (e) => e instanceof ConfigError && e.message === `sources.sales.template: ${TYPO}`
    );
    const missing = withTemplate(undefined);
    await assert.rejects(createContext({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: missing }), (e) => e instanceof ConfigError && e.message === "sources.sales.template: brand.html: not found");
    // a good template starts
    const good = withTemplate(BRAND.replace("{{titel}}", "{{title}}"));
    const context = await createContext({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } }, baseDir: good });
    await context.close();
});

test("pivotkit-server serve and check-config from the command line: the template's message, exit 2 and 1", () => {
    const dir = withTemplate(BRAND);
    const config = join(dir, "pivotkit.json");
    writeFileSync(config, JSON.stringify({ sources: { sales: { file: "data/sales.csv", template: "data/brand.html" } } }));
    const env = { PATH: process.env.PATH ?? "" };
    const serve = spawnSync(process.execPath, [BIN, "serve", "--config", config, "--port", "0"], { encoding: "utf8", cwd: dir, env, timeout: 30_000 });
    assert.equal(serve.status, 2, serve.stderr);
    assert.equal(serve.stderr.split("\n")[0], `pivotkit-server: sources.sales.template: ${TYPO}`);
    const check = spawnSync(process.execPath, [BIN, "check-config", "--config", config], { encoding: "utf8", cwd: dir, env, timeout: 30_000 });
    assert.equal(check.status, 1, check.stderr);
    assert.match(check.stdout, new RegExp(`PROBLEM: sources\\.sales\\.template: ${TYPO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});
