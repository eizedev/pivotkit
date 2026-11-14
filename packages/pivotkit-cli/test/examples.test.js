// pivotkit example: the shipped example files (scripts/examples.js builds them from the playground's
// data) written into the current directory, never over a file there; and every shipped example run
// through validate and render as a user runs it, so CI tests the CLI on real files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { run, tempDir } from "./helpers.js";

const SHIPPED = new URL("../examples/", import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL("examples.json", SHIPPED), "utf8"));

test("pivotkit example --list: the examples with their files, the default marked; writes nothing", async () => {
    const dir = tempDir();
    const r = await run(["example", "--list"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    for (const e of MANIFEST.examples) {
        assert.match(r.stdout, new RegExp(`^  ${e.name} `, "m"));
        for (const f of e.files) assert.ok(r.stdout.includes(f), f);
    }
    assert.match(r.stdout, /^ {2}sales .*\(the default\)$/m);
    assert.deepEqual(readdirSync(dir), []);
    const both = await run(["example", "weather", "--list"], { cwd: dir });
    assert.equal(both.code, 2);
    assert.deepEqual(readdirSync(dir), []);
    const json = JSON.parse((await run(["example", "--list", "--json"], { cwd: tempDir() })).stdout);
    assert.deepEqual(json.examples.map((e) => e.name), MANIFEST.examples.map((e) => e.name));
    assert.equal(json.ok, true);
});

test("pivotkit example without a name writes the default, sales, and says what each file is and what to run", async () => {
    const dir = tempDir();
    const r = await run(["example"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(dir).sort(), ["sales-chart.pivotkit.json", "sales.csv", "sales.pivotkit.json"]);
    assert.match(r.stderr, /^Wrote 3 files into this directory:$/m);
    assert.match(r.stderr, /^ {2}sales\.csv +the data: 2,000 rows of generated sales/m);
    assert.match(r.stderr, /^ {2}sales-chart\.pivotkit\.json +a view: Monthly revenue trend/m);
    assert.match(r.stderr, /^Next:\n {2}pivotkit render sales\.pivotkit\.json --data sales\.csv -o sales\.html +\(an HTML report: open it in a browser\)$/m);
    assert.match(r.stderr, /pivotkit validate sales-chart\.pivotkit\.json --data sales\.csv --strict/);
    assert.match(r.stderr, /Other examples: pivotkit example weather/);
    // -q: nothing on stderr
    assert.equal((await run(["example", "-q"], { cwd: tempDir() })).stderr, "");
});

test("pivotkit example sales: writes its files into the current directory, the data unpacked; says what to run", async () => {
    const dir = tempDir();
    const r = await run(["example", "sales"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(dir).sort(), ["sales-chart.pivotkit.json", "sales.csv", "sales.pivotkit.json"]);
    assert.deepEqual(readFileSync(join(dir, "sales.csv")), gunzipSync(readFileSync(new URL("sales.csv.gz", SHIPPED))));
    assert.deepEqual(readFileSync(join(dir, "sales.pivotkit.json")), readFileSync(new URL("sales.pivotkit.json", SHIPPED)));
    assert.match(r.stderr, /pivotkit render sales\.pivotkit\.json --data sales\.csv -o sales\.html/);
});

test("pivotkit example: never replaces a file; writes nothing when one of its files is there", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "sales.pivotkit.json"), "mine");
    const r = await run(["example", "sales", "--json"], { cwd: dir });
    assert.equal(r.code, 2);
    const out = JSON.parse(r.stdout);
    assert.equal(out.error.kind, "io");
    assert.equal(out.error.code, "EXISTS");
    assert.match(out.error.message, /sales\.pivotkit\.json/);
    assert.deepEqual(readdirSync(dir), ["sales.pivotkit.json"]);
    assert.equal(readFileSync(join(dir, "sales.pivotkit.json"), "utf8"), "mine");
});

test("pivotkit example: an unknown name is a usage error with a hint; --allow-dir is kept", async () => {
    const r = await run(["example", "sale"], { cwd: tempDir() });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /no example "sale"; did you mean sales\?; run "pivotkit example --list"/);
    const dir = tempDir();
    const outside = await run(["example", "weather", "--allow-dir", tempDir()], { cwd: dir });
    assert.equal(outside.code, 2);
    assert.deepEqual(readdirSync(dir), []);
});

test("pivotkit example weather: the attribution next to the files, in the view file and on stderr", async () => {
    const dir = tempDir();
    const r = await run(["example", "weather"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /^Data: Weather data by Open-Meteo\.com/m);
    assert.match(r.stderr, /weather-SOURCE\.txt +where the data comes from and its licence/);
    const source = readFileSync(join(dir, "weather-SOURCE.txt"), "utf8");
    assert.match(source, /Licence: CC BY 4\.0, https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//);
    assert.match(source, /Changes made:/);
    assert.match(JSON.parse(readFileSync(join(dir, "weather.pivotkit.json"), "utf8")).description, /CC BY 4\.0/);
});

// every shipped view over its data, as a user runs it: no finding, a table with its totals
for (const example of MANIFEST.examples) {
    test(`shipped example ${example.name}: every view validates strictly and renders over its data`, async () => {
        const dir = tempDir();
        assert.equal((await run(["example", example.name], { cwd: dir })).code, 0);
        for (const view of example.files.filter((f) => f.endsWith(".pivotkit.json"))) {
            const valid = await run(["validate", view, "--data", example.data, "--strict", "--json"], { cwd: dir });
            assert.equal(valid.code, 0, `${view}: ${valid.stdout}`);
            assert.deepEqual(JSON.parse(valid.stdout).findings.filter((f) => f.severity !== "info"), [], view);
            const csv = await run(["render", view, "--data", example.data, "-f", "csv", "--strict"], { cwd: dir });
            assert.equal(csv.code, 0, `${view}: ${csv.stderr}`);
            assert.match(csv.stdout, /Grand Total/, view);
            const html = await run(["render", view, "--data", example.data, "-o", `${view}.html`, "--json"], { cwd: dir });
            assert.equal(html.code, 0, `${view}: ${html.stdout}`);
            assert.ok(JSON.parse(html.stdout).summary.rows > 0, view);
        }
    });
}

test("the example writer (writeSafe exclusive) refuses a file that is there with EXISTS and leaves it as it was", async () => {
    const { writeSafe } = await import("../src/safe-files.js");
    const dir = tempDir();
    writeFileSync(join(dir, "late.csv"), "mine");
    // (the link() into place refuses one that appears after this check, too)
    await assert.rejects(writeSafe("late.csv", new TextEncoder().encode("theirs"), { cwd: dir, allow: [], exclusive: true }), { code: "EXISTS" });
    assert.equal(readFileSync(join(dir, "late.csv"), "utf8"), "mine");
    assert.deepEqual(readdirSync(dir), ["late.csv"]);
});
