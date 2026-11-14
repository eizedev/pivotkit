// The runner and the options: flags over the configuration file, paths relative to the file, the
// checks with "did you mean", --check-config, --help; the skill that ships with the package.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OPERATION_NAMES } from "pivotkit-report/operations";
import { ConfigError, SKILLS_DIR, loadConfig, validateOptions } from "pivotkit-mcp";
import { BIN, workspace } from "./helpers.js";

const runner = (args, cwd, env = {}) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, ...env }, timeout: 30_000 });

test("validateOptions names the wrong key, says what was meant and checks the rules between keys", () => {
    const bad = [
        [{ sourcs: {} }, /unknown key "sourcs"; did you mean "sources"/],
        [{ sources: { "../x": { file: "a.csv" } } }, /an id is letters/],
        [{ sources: { a: { file: "a.csv", load: async () => [] } } }, /either file or load/],
        [{ sources: { a: { file: "a.csv", policy: { fields: { X: "secret" } } } } }, /must be one of show, summary, hide/],
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
    const check = runner(["--config", join(dir, "pivotkit-mcp.json"), "--source", "more=data/sales.csv", "--allow-dir", "data", "--check-config"], other);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /sales: .*data\/sales\.csv\n {4}fields: summary by default; region show, customer hide/);
    assert.match(check.stdout, /more: .*sales\.csv {2}\(NOT FOUND\)|more: .*sales\.csv\n/);
    assert.match(check.stdout, /Files by path: allowed in .*data/);
    assert.match(check.stdout, /Output: out/);
});

test("the runner's usage errors exit 2 with a hint; --help and --version exit 0", () => {
    const dir = workspace();
    const typo = runner(["--alow-dir", "x"], dir);
    assert.equal(typo.status, 2);
    assert.match(typo.stderr, /did you mean --allow-dir\?/);
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
