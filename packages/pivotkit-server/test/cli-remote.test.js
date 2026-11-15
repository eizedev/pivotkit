// The command line in remote mode against the real REST service: pivotkit-cli's `pivotkit` spawned
// with --url and --source, one token without results: true (validate, describe and sources work,
// render is refused) and one whose profile has results: true (render writes the file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { OTHER_TOKEN, TOKEN, restServer, workspace } from "./helpers.js";

const CLI = join(dirname(createRequire(import.meta.url).resolve("pivotkit-cli/package.json")), "bin", "pivotkit.js");
const VIEW = JSON.stringify({ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] });

/** pivotkit with its arguments, the token in PIVOTKIT_TOKEN. */
function pivotkit(args, { cwd, token }) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { PATH: process.env.PATH, HOME: process.env.HOME, PIVOTKIT_TOKEN: token }, stdio: ["ignore", "pipe", "pipe"] });
        const out = [];
        const err = [];
        child.stdout.on("data", (c) => out.push(c));
        child.stderr.on("data", (c) => err.push(c));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
    });
}

test("pivotkit --url: a plain token validates, describes and lists; render needs a profile with results: true", async () => {
    const dir = workspace();
    writeFileSync(join(dir, "view.json"), VIEW);
    const server = await restServer(
        {
            sources: { sales: { file: "data/sales.csv", policy: { fields: { Customer: "hide" } } } },
            policy: { profiles: { export: { results: true } } },
            auth: { mode: "token", tokens: [{ name: "reader", env: "READER" }, { name: "exporter", env: "EXPORTER", profile: "export" }] },
            baseDir: dir
        },
        { env: { READER: TOKEN, EXPORTER: OTHER_TOKEN } }
    );
    try {
        const plain = { cwd: dir, token: TOKEN };
        const remote = ["--url", server.api, "--source", "sales"];
        const sources = await pivotkit(["sources", "--url", server.api, "--json"], plain);
        assert.equal(sources.code, 0, sources.stderr);
        assert.deepEqual(JSON.parse(sources.stdout).sources.map((s) => s.id), ["sales"]);
        const fields = await pivotkit(["sources", "sales", "--url", server.api, "--json"], plain);
        assert.equal(fields.code, 0, fields.stderr);
        const names = JSON.parse(fields.stdout).description.fields.map((f) => f.name);
        assert.ok(names.includes("Region") && !names.includes("Customer"), "the hidden field is listed");
        const valid = await pivotkit(["validate", "view.json", ...remote], plain);
        assert.equal(valid.code, 0, valid.stderr);
        assert.match(valid.stderr, /valid: no errors/);
        const typo = await pivotkit(["validate", JSON.stringify({ rows: ["Regoin"], values: [{ field: "Sales", agg: "sum" }] }), ...remote, "--json"], plain);
        assert.equal(typo.code, 1);
        assert.equal(JSON.parse(typo.stdout).findings.find((f) => f.code === "unknownField").suggestion, "Region");
        const described = await pivotkit(["describe", "view.json", ...remote], plain);
        assert.equal(described.code, 0, described.stderr);
        assert.match(described.stdout, /Region/);
        const refused = await pivotkit(["render", "view.json", ...remote, "-o", "out.csv", "--json"], plain);
        assert.equal(refused.code, 2);
        const { error } = JSON.parse(refused.stdout);
        assert.deepEqual([error.kind, error.code, error.status], ["remote", "NOT_ALLOWED", 403]);
        for (const r of [sources, fields, valid, typo, described, refused]) {
            assert.ok(!r.stdout.includes(TOKEN) && !r.stderr.includes(TOKEN));
        }
        const exporter = { cwd: dir, token: OTHER_TOKEN };
        const rendered = await pivotkit(["render", "view.json", ...remote, "-o", "out.csv"], exporter);
        assert.equal(rendered.code, 0, rendered.stderr);
        assert.match(readFileSync(join(dir, "out.csv"), "utf8"), /^\uFEFF?Region,Sum of Sales\r?\n/);
        if (process.platform !== "win32") {
            assert.equal(statSync(join(dir, "out.csv")).mode & 0o777, 0o600);
        }
        // a view using the hidden field: the server's findings, exit 1, no file
        const hidden = await pivotkit(["render", JSON.stringify({ rows: ["Customer"], values: [{ agg: "count" }] }), ...remote, "-o", "hidden.csv", "--json"], exporter);
        assert.equal(hidden.code, 1, hidden.stderr);
        assert.equal(JSON.parse(hidden.stdout).output, null);
        const xlsx = await pivotkit(["render", "--rows", "Region", "--values", "sum:Sales", ...remote, "-o", "out.xlsx"], exporter);
        assert.equal(xlsx.code, 0, xlsx.stderr);
        assert.equal(readFileSync(join(dir, "out.xlsx")).subarray(0, 2).toString("latin1"), "PK");
        assert.ok(!rendered.stderr.includes(OTHER_TOKEN) && !xlsx.stderr.includes(OTHER_TOKEN));
    } finally {
        await server.close();
    }
});

test("pivotkit --param against the service: a text, a whole number and a true/false typed on the command line reach a code source's load as their types, in sources, validate, describe --suggest and render", async () => {
    const dir = workspace();
    writeFileSync(join(dir, "view.json"), VIEW);
    /** @type {any[]} */
    const seen = [];
    const server = await restServer(
        {
            sources: {
                team: {
                    load: async (params) => (seen.push(params), ["a", "b", "a", "b"].map((x, i) => ({ Region: `${params.team}-${params.year}-${x}`, Sales: params.open ? i : -i }))),
                    params: { team: { type: "string", required: true, pattern: "^[a-z]+$" }, year: { type: "integer", required: true }, open: { type: "boolean" } },
                    policy: { default: "show" }
                }
            },
            policy: { profiles: { export: { results: true } } },
            auth: { mode: "token", tokens: [{ name: "exporter", env: "EXPORTER", profile: "export" }] },
            baseDir: dir
        },
        { env: { EXPORTER: TOKEN } }
    );
    try {
        const as = { cwd: dir, token: TOKEN };
        const params = ["--param", "team=north", "--param", "year=2026", "--param", "open=true"];
        const listed = await pivotkit(["sources", "--url", server.api], as);
        assert.match(listed.stdout, /^team {2}team \(needs: team, year\)\n$/);
        const described = await pivotkit(["sources", "team", "--url", server.api, ...params, "--json"], as);
        assert.equal(described.code, 0, described.stderr);
        const remote = ["--url", server.api, "--source", "team", ...params];
        const valid = await pivotkit(["validate", "view.json", ...remote], as);
        assert.equal(valid.code, 0, valid.stderr);
        const draft = await pivotkit(["describe", "--suggest", ...remote], as);
        assert.equal(draft.code, 0, draft.stderr);
        const rendered = await pivotkit(["render", "view.json", ...remote, "-o", "out.csv"], as);
        assert.equal(rendered.code, 0, rendered.stderr);
        assert.match(readFileSync(join(dir, "out.csv"), "utf8"), /north-2026/);
        assert.ok(seen.length > 0);
        assert.ok(seen.every((p) => p.team === "north" && p.year === 2026 && p.open === true), JSON.stringify(seen));
        // a value of the wrong form: the server's words, in one line
        const wrong = await pivotkit(["sources", "team", "--url", server.api, "--param", "team=north", "--param", "year=soon"], as);
        assert.equal(wrong.code, 2);
        assert.match(wrong.stderr, /params\.year must be a whole number/);
        // left out: the flag that gives it
        const missing = await pivotkit(["sources", "team", "--url", server.api], as);
        assert.match(missing.stderr, /needs params\.team .*\(give it with --param team=<value>\)\n$/);
    } finally {
        await server.close();
    }
});
