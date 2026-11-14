// What a person reads when something is wrong or right, as found by a usability review of the CLI:
// the owner's case (the table's own CSV given as --data), the fields a view needs and the data has,
// what --lenient did, an output name that contradicts --format, a line that says what was written,
// --verbose, the value that made a column text, where a view is not JSON, the way to the help, the
// options a command's help lists, a missing directory, --limit, --version --json and the report's
// language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main } from "../src/cli.js";
import { run, tempDir } from "./helpers.js";

/** The weather example and the table's own CSV of its view (Export → Table as CSV), as the owner had them. */
async function ownerDir() {
    const dir = tempDir();
    assert.equal((await run(["example", "weather", "-q"], { cwd: dir })).code, 0);
    assert.equal((await run(["render", "weather.pivotkit.json", "--data", "weather.csv", "-o", "pivotkit-weather.csv", "-q"], { cwd: dir })).code, 0);
    return dir;
}

test("the table's own CSV as --data: one error first, the view's fields and the data's, what the file looks like and what to use", async () => {
    const dir = await ownerDir();
    const r = await run(["render", "weather.pivotkit.json", "--data", "pivotkit-weather.csv", "-o", "out.html"], { cwd: dir });
    assert.equal(r.code, 1);
    const lines = r.stderr.trimEnd().split("\n");
    assert.match(lines[0], /^error dataMismatch: pivotkit-weather\.csv does not have the fields the view uses$/);
    assert.match(r.stderr, /^ {2}the view uses: City, Date, Mean °C$/m);
    // a wide table's names are cut after 12
    assert.match(r.stderr, /^ {2}the data has: Date by month of year, Jan, Feb, .*, Nov and 2 more$/m);
    assert.match(r.stderr, /looks like an exported pivot result \("Grand Total", "Average of Mean °C"\), not the rows the report was made from/);
    assert.match(r.stderr, /^ {2}in the report, take Export → Source data → All rows as CSV, and give that file to --data$/m);
    // the errors that follow from it are counted, not repeated
    assert.doesNotMatch(r.stderr, /unknownField/);
    assert.match(r.stderr, /^ {2}and 3 more errors from the missing fields \(--json lists them\)$/m);
    assert.match(lines.at(-1), /^nothing written: the view has errors\.$/);
    assert.equal(existsSync(join(dir, "out.html")), false);
    // --json: the mismatch first, every finding kept
    const json = JSON.parse((await run(["render", "weather.pivotkit.json", "--data", "pivotkit-weather.csv", "-o", "out.html", "--json"], { cwd: dir })).stdout);
    const errors = json.findings.filter((f) => f.severity === "error");
    assert.equal(errors[0].code, "dataMismatch");
    assert.deepEqual(errors[0].missing, ["City", "Date", "Mean °C"]);
    assert.equal(errors[0].pivotResult, true);
    assert.deepEqual(errors.slice(1).map((f) => f.code).sort(), ["groupingNameTaken", "unknownField", "unknownField"]);
    // validate says the same
    const valid = await run(["validate", "weather.pivotkit.json", "--data", "pivotkit-weather.csv"], { cwd: dir });
    assert.equal(valid.code, 1);
    assert.match(valid.stderr, /^error dataMismatch/);
});

test("a field the data has under another name: did you mean, and the data's fields", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Mean C\nNorth,3\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Region"], values: [{ field: "Mean °C", agg: "sum" }] }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^ {2}missing: "Mean °C" \(did you mean "Mean C"\?\)$/m);
    assert.match(r.stderr, /^ {2}the data has: Region, Mean C$/m);
    assert.doesNotMatch(r.stderr, /pivot result/);
});

test("unknownField names the fields the data has, also without a close match", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Zzz"], values: [{ field: "Units", agg: "sum" }] }));
    const json = JSON.parse((await run(["validate", "v.json", "--data", "d.csv", "--json"], { cwd: dir })).stdout);
    const unknown = json.findings.find((f) => f.code === "unknownField");
    assert.match(unknown.message, /unknown field "Zzz"; the data has: Region, Units$/);
});

test("--lenient is no remedy in the message; when it writes despite errors it says so", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Region", "Nope"], values: [{ field: "Units", agg: "sum" }] }));
    const strict = await run(["render", "v.json", "--data", "d.csv", "-o", "out.html"], { cwd: dir });
    assert.equal(strict.code, 1);
    assert.doesNotMatch(strict.stderr, /--lenient/);
    const lenient = await run(["render", "v.json", "--data", "d.csv", "-o", "out.html", "--lenient"], { cwd: dir });
    assert.equal(lenient.code, 1);
    assert.match(lenient.stderr, /^wrote out\.html despite 2 errors \(--lenient\): the data lacks the view's fields, so the report shows none of them$/m);
    assert.ok(existsSync(join(dir, "out.html")));
});

test("-o with the extension of another format than -f is a usage error; nothing is written", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-o", "t.html", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /t\.html is an html file, -f asks for csv: name it t\.csv, or leave out -f/);
    assert.equal(existsSync(join(dir, "t.html")), false);
    // an extension that is no format of pivotkit's, with -f: written as asked
    assert.equal((await run(["render", "v.json", "--data", "d.csv", "-o", "t.txt", "-f", "csv"], { cwd: dir })).code, 0);
});

test("a line on stderr says what was written (not with -q or --json); validate says what it checked", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3\nSouth,4\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ format: "pivotkit-view", formatVersion: 2, name: "U", source: { fields: [{ name: "Region", type: "string" }, { name: "Units", type: "number" }] }, view: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] } }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-o", "out.html"], { cwd: dir });
    assert.equal(r.code, 0);
    assert.match(r.stderr, /^wrote out\.html: an HTML report, 3 rows x 2 columns, from 2 rows of d\.csv$/m);
    assert.equal((await run(["render", "v.json", "--data", "d.csv", "-o", "out.html", "-q"], { cwd: dir })).stderr, "");
    // to stdout: the output alone
    assert.equal((await run(["render", "v.json", "--data", "d.csv", "-f", "csv"], { cwd: dir })).stderr, "");
    const fields = await run(["validate", "v.json"], { cwd: dir });
    assert.equal(fields.code, 0);
    assert.match(fields.stderr, /^valid against the fields the view file lists \(source\.fields\), not against data: give --data to check it with the data$/m);
    assert.match((await run(["validate", "v.json", "--data", "d.csv"], { cwd: dir })).stderr, /^valid: no errors, no warnings \(with d\.csv\)$/m);
});

test("--verbose shows how the data was read; skipped title lines are a warning", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region;Units\nNorth;3,5\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-f", "csv", "--verbose"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /^info SEPARATOR: d\.csv: Values separated by semicolons\.$/m);
    assert.match(r.stderr, /^info ENCODING: /m);
    assert.equal((await run(["render", "v.json", "--data", "d.csv", "-f", "csv"], { cwd: dir })).stderr, "");
    writeFileSync(join(dir, "t.csv"), "Sales report 2026\n\nRegion,Units,Price\nNorth,3,4\n");
    const skipped = await run(["render", "v.json", "--data", "t.csv", "-f", "csv"], { cwd: dir });
    assert.match(skipped.stderr, /^warning LINES_SKIPPED: /m);
});

test("a field read as text: the value and row that made it text", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3\nSouth,n/a\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /sum does not work on the string field "Units" \(read as text: its value "n\/a" in row 2 is no number\)/);
});

test("a view that is not JSON: where it stops being JSON", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3\n");
    writeFileSync(join(dir, "bad.json"), '{ "rows": ["Region"],\n  "values": [ {"field": "Units" "agg": "sum"} ] }');
    const r = await run(["render", "bad.json", "--data", "d.csv", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /not valid JSON at line 2, column \d+/);
});

test("a usage error ends with the way to the command's help", async () => {
    const r = await run(["render", "--formt", "csv"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr.trimEnd(), /; see "pivotkit help render"$/);
    const missing = await run(["render", '{"rows":["Region"]}'], { cwd: tempDir() });
    assert.match(missing.stderr.trimEnd(), /see "pivotkit help render"$/);
});

test("a command's help lists only the options it uses", async () => {
    const example = (await run(["help", "example"])).stdout;
    for (const flag of ["--now", "--locale", "--time-zone", "--limit", "--data"]) assert.ok(!example.includes(flag), `example: ${flag}`);
    assert.ok(example.includes("--allow-dir"));
    const validate = (await run(["help", "validate"])).stdout;
    assert.ok(!validate.includes("--now"));
    assert.ok(validate.includes("--time-zone"));
    assert.ok((await run(["help", "render"])).stdout.includes("--now"));
    // still accepted where they do nothing, as before (scripts pass them to every command)
    assert.equal((await run(["validate", '{"rows":[]}', "--now", "2026-01-01", "--data", "-", "--data-format", "csv"], { input: "A\n1\n" })).code, 0);
});

test("-o into a directory that does not exist: names it and how to make it", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-o", "out/report.html"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /the directory "out" does not exist: create it first \(mkdir -p out\)/);
});

test("--limit with an unknown key: a hint and the way to the list, not the whole list", async () => {
    const r = await run(["render", "v.json", "--limit", "row=5"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unknown limit "row"; did you mean rows\?/);
    assert.ok(!r.stderr.includes("archiveEntries"));
    assert.match(r.stderr, /pivotkit\.eize\.dev\/concepts\/limits\//);
});

test("--version --json: the versions and the environment a bug report needs", async () => {
    const r = await run(["--version", "--json"], { env: { PIVOTKIT_LOCALE: "de-DE", PIVOTKIT_TIME_ZONE: "Europe/Berlin" } });
    assert.equal(r.code, 0);
    const v = JSON.parse(r.stdout);
    assert.match(v["pivotkit-cli"], /^\d+\.\d+\.\d+/);
    assert.equal(v.environment.node, process.version);
    assert.deepEqual(v.environment.locale, { value: "de-DE", from: "PIVOTKIT_LOCALE", known: true });
    assert.deepEqual(v.environment.timeZone, { value: "Europe/Berlin", from: "PIVOTKIT_TIME_ZONE", known: true });
    assert.deepEqual(v.environment.now, { value: null, from: "the clock" });
    assert.equal(v.environment.limits.rows, 1_000_000);
    const odd = JSON.parse((await run(["--version", "--json"], { env: { PIVOTKIT_TIME_ZONE: "Mars/Olympus" } })).stdout);
    assert.equal(odd.environment.timeZone.known, false);
    // without --json: one line, as before
    assert.match((await run(["--version"])).stdout, /^pivotkit-cli \S+ \(pivotkit-report \S+, pivotkit-core \S+\)\n$/);
});

test("--locale de-DE: the report's own words in German, as the report on the page writes them", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3.5\nSouth,4\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-o", "out.html", "--locale", "de-DE", "-q"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    const html = readFileSync(join(dir, "out.html"), "utf8");
    assert.match(html, /Summe von Units/);
    assert.match(html, /Gesamtergebnis/);
    assert.doesNotMatch(html, /Grand Total|Sum of/);
    assert.match(html, /7,5/);
});

test("data from stdin on a terminal: a hint that the CLI waits for it", async () => {
    const out = [];
    const err = [];
    const stdin = Object.assign((async function* () {})(), { isTTY: true });
    const code = await main(["describe", "-", "--data-format", "csv"], { stdin, stdout: { write: (c) => out.push(c) }, stderr: { write: (c) => err.push(c) }, env: {}, cwd: tempDir() });
    assert.equal(code, 0);
    assert.match(err.join(""), /reading the data from stdin: type or paste it, then Ctrl-D \(Ctrl-Z, Enter on Windows\)/);
});

test("filters that keep no row: a warning, not a silent table of zeros", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Day,Units\n2026-01-05,3\n2026-02-01,4\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Day"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Day", type: "relative", direction: "last", unit: "month", count: 1 }] }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-f", "csv", "--now", "2024-01-01"], { cwd: dir });
    assert.equal(r.code, 0);
    assert.match(r.stderr, /^warning noRowsKept: the filters keep none of the 2 rows of d\.csv \(a date filter counts from --now or today\)$/m);
    assert.equal((await run(["render", "v.json", "--data", "d.csv", "-f", "csv", "--now", "2024-01-01", "--strict"], { cwd: dir })).code, 1);
});

test("a field of the view file missing, one new field of its type in the data: renamed?", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Turnover\nNorth,3\n");
    writeFileSync(join(dir, "v.json"), JSON.stringify({ format: "pivotkit-view", formatVersion: 2, name: "R", source: { fields: [{ name: "Region", type: "string" }, { name: "Revenue", type: "number" }] }, view: { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }] } }));
    const r = await run(["render", "v.json", "--data", "d.csv", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^ {2}missing: "Revenue" \(number\); the data has a new number field "Turnover": renamed\?$/m);
});

test("--lenient over a data mismatch: every error counted, and that the report cannot show the data", async () => {
    const dir = await ownerDir();
    const r = await run(["render", "weather.pivotkit.json", "--data", "pivotkit-weather.csv", "-o", "out.html", "--lenient"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^wrote out\.html despite 4 errors \(--lenient\): the data lacks the view's fields, so the report shows none of them$/m);
    // the way back to the data, also when the file is at hand
    assert.match(r.stderr, /^ {2}or give --data the file the report was made from, if you have it$/m);
});

test("an HTML report on the terminal: a hint to save it", async () => {
    const out = [];
    const err = [];
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units\nNorth,3\n");
    const stdin = Object.assign((async function* () {})(), { isTTY: false });
    const code = await main(["render", '{"rows":["Region"],"values":[{"field":"Units","agg":"sum"}]}', "--data", "d.csv"], { stdin, stdout: { write: (c) => out.push(c), isTTY: true }, stderr: { write: (c) => err.push(c) }, env: {}, cwd: dir });
    assert.equal(code, 0);
    assert.match(err.join(""), /an HTML report was written to the terminal: add -o report\.html to save it/);
});
