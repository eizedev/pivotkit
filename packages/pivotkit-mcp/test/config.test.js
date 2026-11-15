// The runner and the options: flags over the configuration file, paths relative to the file, the
// checks with "did you mean", --check-config, --help; the skill that ships with the package.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OPERATION_NAMES } from "pivotkit-report/operations";
import { ConfigError, SKILLS_DIR, loadConfig, validateOptions } from "pivotkit-mcp";
import { BIN, httpServer, workspace } from "./helpers.js";

const runner = (args, cwd, env = {}) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, ...env }, timeout: 30_000 });

test("validateOptions names the wrong key, says what was meant and checks the rules between keys", () => {
    const bad = [
        [{ sourcs: {} }, /unknown key "sourcs"; did you mean "sources"/],
        [{ sources: { "../x": { file: "a.csv" } } }, /an id is letters/],
        [{ sources: { a: { file: "a.csv", load: async () => [] } } }, /either file or load/],
        [{ sources: { a: { file: "a.csv", policy: { fields: { X: "secret" } } } } }, /must be one of show, values, summary, hide/],
        [{ policy: { default: "shwo" } }, /did you mean show/],
        [{ limits: { rowz: 5 } }, /limits.rowz: unknown limit; did you mean "rows"/],
        [{ auth: { mode: "oauth", issuer: "https://id.example.com" } }, /auth.resource: needed/],
        [{ auth: { mode: "oauth", issuer: "https://id.example.com", resource: "https://m.example.com/mcp", algorithms: ["HS256"] } }, /HS256 is not accepted/],
        [{ auth: { toolScopes: { render: ["x"] } } }, /auth.toolScopes.render: no such tool; did you mean "render_view"/],
        [{ auth: { tokens: [{ name: "a" }] } }, /either env .* or file/],
        [{ http: { page: "yes" } }, /http.page/],
        [{ output: { baseUrl: "ftp://x" } }, /must start with https/]
    ];
    for (const [options, message] of bad) {
        assert.throws(() => validateOptions(/** @type {any} */ (options)), (e) => e instanceof ConfigError && message.test(e.message), JSON.stringify(options));
    }
    assert.doesNotThrow(() => validateOptions({ sources: { sales: { file: "s.csv", policy: { fields: { Region: "show" }, inline: false } } }, auth: { toolScopes: { render_view: ["r"] } } }));
});

test("a configuration file: paths relative to it, flags add to it, --check-config says what is exposed", async () => {
    const dir = workspace();
    writeFileSync(join(dir, "pivotkit-mcp.json"), JSON.stringify({ sources: { sales: { file: "data/sales.csv", title: "Sales", policy: { fields: { Region: "show", Customer: "hide" } } } }, output: { dir: "out" } }));
    const options = await loadConfig(join(dir, "pivotkit-mcp.json"));
    assert.equal(options.baseDir, dir);
    const other = workspace();
    const check = runner(["--config", join(dir, "pivotkit-mcp.json"), "--source", "more=data/none.csv", "--allow-dir", "data", "--check-config"], other);
    assert.equal(check.status, 1, "a missing file is a problem: exit 1");
    assert.match(check.stdout, /1 problem: see NOT FOUND above/);
    assert.match(check.stdout, /sales: .*data\/sales\.csv\n {4}fields: summary by default; Region show, Customer hide/);
    assert.match(check.stdout, /more: .*none\.csv {2}\(NOT FOUND\)/);
    assert.match(check.stdout, /Files by path: allowed in .*data/);
    assert.match(check.stdout, /Output: out\n/);
    const ok = runner(["--config", join(dir, "pivotkit-mcp.json"), "--check-config"], other);
    assert.equal(ok.status, 0, ok.stdout);
    writeFileSync(join(dir, "bad-out.json"), JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "nope" } }));
    // a missing output directory is made at start; with output.create off it is a problem
    const noOut = runner(["--config", join(dir, "bad-out.json"), "--check-config"], other);
    assert.equal(noOut.status, 0, noOut.stdout);
    assert.match(noOut.stdout, /Output: nope {2}\(does not exist yet: will be created at start; check the path\)/);
    writeFileSync(join(dir, "off-out.json"), JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "nope", create: false } }));
    const off = runner(["--config", join(dir, "off-out.json"), "--check-config"], other);
    assert.equal(off.status, 1);
    assert.match(off.stdout, /Output: nope {2}\(NOT FOUND: create the directory first, or leave output\.create on\)/);
});

test("the runner's usage errors exit 2 with a hint; --help and --version exit 0", () => {
    const dir = workspace();
    const typo = runner(["--alow-dir", "x"], dir);
    assert.equal(typo.status, 2);
    assert.equal(typo.stderr, 'pivotkit-mcp: unknown option "--alow-dir"; did you mean --allow-dir? run "pivotkit-mcp --help"\n');
    assert.equal(runner(["--auth", "bogus"], dir).stderr, 'pivotkit-mcp: --auth must be none, token or oauth; run "pivotkit-mcp --help"\n');
    // the same Usage lines and flag order as pivotkit-server's help
    const usage = runner(["--help"], dir).stdout;
    assert.match(usage, /\nUsage: pivotkit-mcp \[options\]\n {7}pivotkit-mcp --version\n\nOptions:\n/);
    assert.match(usage, /\n {2}--version {2,}Print the version and exit\.\n {2}--help {2,}Print this help and exit\.\n/);
    const missing = runner(["--config", "nope.json"], dir);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /nope\.json: not found/);
    const noDir = runner(["--allow-dir", "nope", "--check-config"], dir);
    assert.equal(noDir.status, 2);
    const help = runner(["--help"], dir);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--allow-dir <dir>/);
    assert.match(runner(["--version"], dir).stdout, /^pivotkit-mcp \d+\.\d+\.\d+/);
});

test("the skill: valid frontmatter, every tool it names exists, every view in its table is valid JSON", () => {
    const text = readFileSync(join(SKILLS_DIR, "pivotkit-reports", "SKILL.md"), "utf8");
    const front = /^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/.exec(text);
    assert.ok(front, "frontmatter with name and description");
    assert.equal(front[1], "pivotkit-reports");
    assert.ok(front[2].length > 50 && front[2].length <= 1024);
    for (const [, name] of text.matchAll(/`([a-z]+_[a-z_]+)`/g)) {
        assert.ok(OPERATION_NAMES.includes(name), `the skill names ${name}`);
    }
    for (const name of OPERATION_NAMES.filter((n) => n !== "describe_view")) {
        assert.ok(text.includes(name), `the skill mentions ${name}`);
    }
    for (const [, json] of text.matchAll(/\| `(\{.*?\})` \|/g)) {
        assert.doesNotThrow(() => JSON.parse(json), json);
    }
});

test("the Claude Code plugin is the package's folder: its version is the package's, the marketplace points at it", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const plugin = JSON.parse(readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"));
    const market = JSON.parse(readFileSync(new URL("../../../.claude-plugin/marketplace.json", import.meta.url), "utf8"));
    assert.equal(plugin.name, pkg.name);
    assert.equal(plugin.version, pkg.version);
    assert.deepEqual(market.plugins.map((p) => [p.name, p.source]), [["pivotkit-mcp", "./packages/pivotkit-mcp"]]);
});

test("the MCP server makes a missing output directory at start, as pivotkit-server does", async () => {
    const dir = workspace();
    const server = await httpServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "fresh/out" }, baseDir: dir });
    try {
        assert.ok(statSync(join(dir, "fresh", "out")).isDirectory());
        assert.ok(server.log.some((l) => l.event === "warning" && /output directory did not exist and was created/.test(l.message)));
    } finally {
        await server.close();
    }
});
