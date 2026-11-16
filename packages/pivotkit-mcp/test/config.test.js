// The runner and the options: flags over the configuration file, paths relative to the file, the
// checks with "did you mean", --check-config, --help; the skill that ships with the package.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATION_NAMES } from "pivotkit-report/operations";
import { ConfigError, SKILLS_DIR, loadConfig, validateOptions } from "pivotkit-mcp";
import { BIN, httpServer, workspace } from "./helpers.js";
// check-config's wrapped lines joined back, as pivotkit-server's tests read them
import { factsOf } from "../../pivotkit-server/test/helpers.js";

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
    const said = factsOf(check.stdout);
    assert.match(said, /^pivotkit-mcp: the server starts, but not everything will work\.\n1 problem, 0 warnings\./);
    assert.match(said, /\n {2}sales: a file\n {4}\S+data\/sales\.csv\n {4}policy: summary by default; Region show, Customer hide\n/);
    assert.match(said, /PROBLEM: sources\.more\.file: data\/none\.csv is not there -> the server starts; more answers FILE_NOT_AVAILABLE/);
    assert.match(said, /Files by path: allowed in .*data/);
    assert.match(said, /\nOutput: out\n/);
    const ok = runner(["--config", join(dir, "pivotkit-mcp.json"), "--check-config"], other);
    assert.equal(ok.status, 0, ok.stdout);
    writeFileSync(join(dir, "bad-out.json"), JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "nope" } }));
    // a missing output directory is made at start; with output.create off it is a problem
    const noOut = runner(["--config", join(dir, "bad-out.json"), "--check-config"], other);
    assert.equal(noOut.status, 0, noOut.stdout);
    assert.match(factsOf(noOut.stdout), /\nOutput: nope\n {2}\S+nope\n {2}will be created at start\n/);
    writeFileSync(join(dir, "off-out.json"), JSON.stringify({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "nope", create: false } }));
    const off = runner(["--config", join(dir, "off-out.json"), "--check-config"], other);
    assert.equal(off.status, 1);
    assert.match(factsOf(off.stdout), /PROBLEM: output\.dir: not found \(create it first, or leave output\.create on\) -> the server does not start/);
});

/**
 * A start error as the person reads it: serve writes it as a JSON line where stderr is no terminal
 * (the log's auto rule), with the same words in msg; text as it is.
 */
const startError = (stderr, program = "pivotkit-mcp") => {
    const first = stderr.split("\n")[0];
    if (!first.startsWith("{")) {
        return stderr;
    }
    const line = JSON.parse(first);
    assert.deepEqual([line.level, line.event, line.service], ["error", "error", program]);
    return `${program}: ${line.msg}\n${stderr.slice(first.length + 1)}`;
};

test("the runner's usage errors exit 2 with a hint; --help and --version exit 0", () => {
    const dir = workspace();
    const typo = runner(["--alow-dir", "x"], dir);
    assert.equal(typo.status, 2);
    assert.equal(startError(typo.stderr), 'pivotkit-mcp: unknown option "--alow-dir"; did you mean --allow-dir? run "pivotkit-mcp --help"\n');
    assert.equal(startError(runner(["--auth", "bogus"], dir).stderr), 'pivotkit-mcp: --auth must be none, token or oauth; run "pivotkit-mcp --help"\n');
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
    // where a token for --auth token comes from: pivotkit-server's command
    assert.match(help.stdout, /\$PIVOTKIT_MCP_TOKEN or auth\.tokens\): npx -y pivotkit-server token new/);
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

test("what the package tells people and the model: it reads only what the policy shows, never that it reads no data", async () => {
    const { INSTRUCTIONS } = await import("../src/context.js");
    const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    const texts = {
        instructions: INSTRUCTIONS,
        "package.json": JSON.parse(read("../package.json")).description,
        "plugin.json": JSON.parse(read("../.claude-plugin/plugin.json")).description,
        "page.js": read("../src/page.js"),
        "index.js": read("../src/index.js"),
        "SKILL.md": read("../skills/pivotkit-reports/SKILL.md"),
        "README.md": read("../README.md")
    };
    for (const [where, text] of Object.entries(texts)) {
        assert.doesNotMatch(text, /data itself|without reading the data|never read/i, where);
        assert.match(text.replace(/\s+/g, " "), /only what the (operator's )?(exposure )?policy shows/, where);
    }
    // the model is not told it cannot read files: allow-dir lets it name files by path
    assert.doesNotMatch(INSTRUCTIONS, /cannot read|no files?\b/i);
});
