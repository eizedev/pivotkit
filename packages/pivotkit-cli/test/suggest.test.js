// A view from a file without the browser (#253): `describe <data> --suggest` writes a draft view file,
// `render <data> --rows ... --values ...` renders from layout flags, `render <data> --suggest` renders
// the draft at once, `--map Old=New` renames a view's fields for renamed columns, `--save-view` keeps
// the view used. Run as a user runs them, on the shipped examples, on a workbook whose first sheet is
// a note, and on field names with spaces, commas and colons; what is checked is what a person reads:
// the table's cells, the messages, the files written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { sourceIdOf } from "pivotkit-core/import";
import { SHEET_BOOKS } from "../../pivotkit-xlsx/test/make-xlsx.js";
import { listedFor, sheetPlan } from "../../pivotkit-react/src/sheet-views.js";
import { run, tempDir } from "./helpers.js";

const SHIPPED = new URL("../examples/", import.meta.url);

/** A directory with the shipped examples' data (sales.csv, weather.csv) and the sales workbook. */
function files() {
    const dir = tempDir();
    for (const name of ["sales", "weather"]) {
        writeFileSync(join(dir, `${name}.csv`), gunzipSync(readFileSync(new URL(`${name}.csv.gz`, SHIPPED))));
    }
    writeFileSync(join(dir, "book.xlsx"), SHEET_BOOKS.sales());
    return dir;
}

/** A CSV text as rows of cells (no quoted separators in these tables but the ones handled). */
function cells(text) {
    return text
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/)
        .map((line) => {
            const out = [];
            let cell = "";
            let quoted = false;
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (quoted) {
                    if (c === '"' && line[i + 1] === '"') {
                        cell += '"';
                        i++;
                    } else if (c === '"') quoted = false;
                    else cell += c;
                } else if (c === '"') quoted = true;
                else if (c === ",") {
                    out.push(cell);
                    cell = "";
                } else cell += c;
            }
            out.push(cell);
            return out;
        });
}

/** The sum of a column of a CSV file, by the value of another column (what a pivot of it shows). */
function sumBy(text, key, value) {
    const [head, ...rows] = cells(text);
    const k = head.indexOf(key);
    const v = head.indexOf(value);
    const out = new Map();
    for (const r of rows) out.set(r[k], (out.get(r[k]) ?? 0) + Number(r[v]));
    return out;
}

test("describe --suggest on the sales example: a draft view file on stdout, what was picked and what to run next on stderr", async () => {
    const dir = files();
    const r = await run(["describe", "sales.csv", "--suggest"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    const file = JSON.parse(r.stdout);
    assert.equal(file.format, "pivotkit-view");
    assert.match(file.name, /^Draft: Sum of Units by Region and Month by month$/);
    assert.match(file.description, /suggested by pivotkit describe --suggest from the fields of sales\.csv/);
    assert.deepEqual(file.view.rows, ["Region"]);
    assert.deepEqual(file.view.cols, ["Month by month"]);
    assert.deepEqual(file.view.values.map((v) => [v.field, v.agg]), [["Units", "sum"]]);
    // the fields the view uses with their types, and the id the browser gives this file
    assert.deepEqual(file.source.fields, [{ name: "Region", type: "string" }, { name: "Month", type: "date" }, { name: "Units", type: "number" }]);
    const columns = readFileSync(join(dir, "sales.csv"), "utf8").split(/\r?\n/)[0].replace(/^\uFEFF/, "").split(",");
    assert.equal(file.source.id, await sourceIdOf("sales.csv", columns));
    assert.match(r.stderr, /^draft: rows Region; columns Month by month; values Sum of Units$/m);
    assert.match(r.stderr, /other numbers: Revenue, Discount/);
    assert.match(r.stderr, /^ {2}to change a part: pivotkit describe sales\.csv --suggest --values sum:Revenue /m);
    assert.match(r.stderr, /^next: pivotkit describe sales\.csv --suggest -o sales\.pivotkit\.json$/m);
    assert.deepEqual(readdirSync(dir).sort(), ["book.xlsx", "sales.csv", "weather.csv"], "nothing written without -o");
});

test("describe --suggest -o: the draft passes validate --strict and renders the table its rules promise", async () => {
    const dir = files();
    const r = await run(["describe", "sales.csv", "--suggest", "-o", "draft.pivotkit.json"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^wrote draft\.pivotkit\.json: a draft view of sales\.csv$/m);
    assert.match(r.stderr, /^next: pivotkit render draft\.pivotkit\.json --data sales\.csv -o draft\.html$/m);
    const valid = await run(["validate", "draft.pivotkit.json", "--data", "sales.csv", "--strict"], { cwd: dir });
    assert.equal(valid.code, 0, valid.stderr);
    const csv = await run(["render", "draft.pivotkit.json", "--data", "sales.csv", "-f", "csv"], { cwd: dir });
    assert.equal(csv.code, 0, csv.stderr);
    const table = cells(csv.stdout);
    // the grand total of each region is the sum of its units in the file
    const want = sumBy(readFileSync(join(dir, "sales.csv"), "utf8"), "Region", "Units");
    for (const [region, units] of want) {
        const row = table.find((cellsOfRow) => cellsOfRow[0] === region);
        assert.ok(row, region);
        assert.equal(Number(row.at(-1)), units, region);
    }
    assert.ok(table.some((row) => row.some((c) => /^Jan 2025$/.test(c))), "a column per month");
    // the HTML report too
    const html = await run(["render", "draft.pivotkit.json", "--data", "sales.csv", "-o", "draft.html"], { cwd: dir });
    assert.equal(html.code, 0, html.stderr);
    assert.match(readFileSync(join(dir, "draft.html"), "utf8"), /<title>Draft: Sum of Units by Region and Month by month<\/title>/);
});

test("describe --suggest on the weather example: cities by quarter, the draft valid; a flag changes one part of it", async () => {
    const dir = files();
    const r = await run(["describe", "weather.csv", "--suggest", "--json"], { cwd: dir });
    assert.equal(r.code, 0, r.stdout);
    const out = JSON.parse(r.stdout);
    assert.equal(out.draft, true);
    assert.deepEqual(out.view.view.rows, ["City"]);
    assert.deepEqual(out.view.view.cols, ["Date by quarter"]);
    assert.deepEqual(out.picks.map((p) => [p.part, p.code]), [["rows", "category"], ["cols", "date"], ["values", "firstNumber"]]);
    const avg = await run(["describe", "weather.csv", "--suggest", "--values", "average:Mean °C", "-o", "w.pivotkit.json"], { cwd: dir });
    assert.equal(avg.code, 0, avg.stderr);
    const file = JSON.parse(readFileSync(join(dir, "w.pivotkit.json"), "utf8"));
    assert.deepEqual(file.view.rows, ["City"]);
    assert.deepEqual(file.view.values.map((v) => [v.field, v.agg]), [["Mean °C", "average"]]);
    assert.equal(file.name, "Draft: Average of Mean °C by City and Date by quarter");
    const valid = await run(["validate", "w.pivotkit.json", "--data", "weather.csv", "--strict"], { cwd: dir });
    assert.equal(valid.code, 0, valid.stderr);
    // --json with -o: the file is the view; the envelope says where it went
    const both = JSON.parse((await run(["describe", "weather.csv", "--suggest", "--json", "-o", "w2.pivotkit.json"], { cwd: dir })).stdout);
    assert.equal(both.view, undefined);
    assert.equal(both.output.file, "w2.pivotkit.json");
});

test("a workbook whose first sheet is a note: nothing to group by is an error that names the other sheets; --sheet makes the draft", async () => {
    const dir = files();
    const r = await run(["describe", "book.xlsx", "--suggest", "-o", "draft.pivotkit.json"], { cwd: dir });
    assert.equal(r.code, 1, r.stderr);
    assert.match(r.stderr, /^error noSuggestion: the sheet "Readme" of book\.xlsx has nothing to group by/m);
    assert.match(r.stderr, /pivotkit describe book\.xlsx --suggest --sheet 2025/);
    assert.ok(!existsSync(join(dir, "draft.pivotkit.json")), "nothing written");
    const json = JSON.parse((await run(["describe", "book.xlsx", "--suggest", "--json"], { cwd: dir })).stdout);
    assert.equal(json.ok, false);
    assert.equal(json.findings.find((f) => f.code === "noSuggestion")?.severity, "error");
    // --lenient writes the count anyway, the exit code stays 1
    const lenient = await run(["describe", "book.xlsx", "--suggest", "--lenient", "-o", "count.pivotkit.json"], { cwd: dir });
    assert.equal(lenient.code, 1);
    assert.ok(existsSync(join(dir, "count.pivotkit.json")));

    const sheet = await run(["describe", "book.xlsx", "--suggest", "--sheet", "2025", "-o", "draft.pivotkit.json"], { cwd: dir });
    assert.equal(sheet.code, 0, sheet.stderr);
    const file = JSON.parse(readFileSync(join(dir, "draft.pivotkit.json"), "utf8"));
    assert.equal(file.source.params.sheet, "2025");
    assert.deepEqual(file.view.rows, ["Region"]);
    assert.deepEqual(file.view.cols, ["Order date by month"]);
    assert.equal(file.source.id, await sourceIdOf("book.xlsx", ["Order date", "Region", "Category", "Units", "Revenue"]));
    // rendered without --sheet: the sheet the draft names
    const csv = await run(["render", "draft.pivotkit.json", "--data", "book.xlsx", "-f", "csv"], { cwd: dir });
    assert.equal(csv.code, 0, csv.stderr);
    assert.match(csv.stdout, /^Grand Total,.*,(\d+)$/m);
    // the browser opens it as a view of this workbook: listed for its sheets, read on its sheet
    const shown = { id: await sourceIdOf("book.xlsx", ["Note"]), sheet: "Readme", sheets: ["Readme", "2025", "2026"] };
    assert.equal(listedFor({ sourceId: file.source.id, sheet: "2025" }, shown), true);
    assert.deepEqual(sheetPlan({ id: file.source.id, sheet: file.source.params.sheet }, shown), { kind: "switch", sheet: "2025" });
});

test("render <data> with layout flags: the table the flags describe, without a view file", async () => {
    const dir = files();
    const r = await run(["render", "sales.csv", "--rows", "Region", "--cols", "Channel", "--values", "sum:Revenue", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    const table = cells(r.stdout);
    const want = sumBy(readFileSync(join(dir, "sales.csv"), "utf8"), "Region", "Revenue");
    for (const [region, revenue] of want) {
        const row = table.find((cellsOfRow) => cellsOfRow[0] === region);
        assert.ok(row, region);
        assert.ok(Math.abs(Number(row.at(-1)) - revenue) < 0.01, `${region}: ${row.at(-1)} vs ${revenue}`);
    }
    const channels = [...sumBy(readFileSync(join(dir, "sales.csv"), "utf8"), "Channel", "Units").keys()].sort();
    assert.deepEqual(table[0].slice(1, 1 + channels.length).sort(), channels);
    // --data instead of the positional; a date placed without --group is grouped by its span, as the browser groups it
    const month = await run(["render", "--data", "sales.csv", "--rows", "Month", "--values", "Revenue", "-f", "csv", "--json", "-o", "m.csv"], { cwd: dir });
    assert.equal(month.code, 0, month.stdout);
    const out = JSON.parse(month.stdout);
    assert.ok(out.findings.some((f) => f.code === "dateGrouped" && f.severity === "info" && /Month by month/.test(f.message)), JSON.stringify(out.findings));
    assert.match(readFileSync(join(dir, "m.csv"), "utf8"), /^\uFEFF?Month by month,Sum of Revenue$/m);
});

test("layout flags: field names with spaces, commas and colons, --group's units, German names", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "t.csv"), '"sales region","Time: start","Revenue, EUR"\nNorth,2025-01-05,10\nSouth,2025-03-01,20\nNorth,2026-02-01,30\n');
    const r = await run(["render", "t.csv", "--rows", "SALES REGION", "--cols", "Time: start", "--group", "Time: start:year", "--values", "sum:Revenue, EUR", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    const table = cells(r.stdout);
    assert.ok(r.stdout.includes("Time: start by year"), r.stdout);
    assert.ok(table.some((row) => row.includes("2025") && row.includes("2026")), r.stdout);
    assert.ok(table.some((row) => row[0] === "North" && row[1] === "10" && row[2] === "30"), r.stdout);
    const de = await run(["render", "t.csv", "--rows", "Time: start", "--group", "Time: start:yearQuarter", "--values", "count", "--locale", "de-DE", "-f", "csv"], { cwd: dir });
    assert.equal(de.code, 0, de.stderr);
    assert.match(de.stdout, /Time: start nach Quartal/);
    // a unit pivotkit does not know: the units with what each means
    const bad = await run(["render", "t.csv", "--rows", "Time: start", "--group", "Time: start:monthly"], { cwd: dir });
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /yearMonth \(Jan 2025, Feb 2025\)/);
    assert.match(bad.stderr, /month \(Jan to Dec, every year together\)/);
});

test("layout flags: an unknown field is a finding with the name meant; usage errors exit 2", async () => {
    const dir = files();
    const unknown = await run(["render", "sales.csv", "--rows", "Regoin", "--values", "sum:Revenue", "-f", "csv"], { cwd: dir });
    assert.equal(unknown.code, 1);
    assert.match(unknown.stderr, /^ {2}missing: "Regoin" \(did you mean "Region"\?\)$/m);
    const both = await run(["render", "sales.csv", "--data", "sales.csv", "--rows", "Region"], { cwd: dir });
    assert.equal(both.code, 2);
    assert.match(both.stderr, /the data twice/);
    writeFileSync(join(dir, "v.json"), JSON.stringify({ rows: ["Region"] }));
    const view = await run(["render", "v.json", "--data", "sales.csv", "--rows", "Region"], { cwd: dir });
    assert.equal(view.code, 2);
    assert.match(view.stderr, /a view or layout flags, not both/);
    const filter = await run(["render", "sales.csv", "--rows", "Region", "--filter", "{Region: North}"], { cwd: dir });
    assert.equal(filter.code, 2);
    assert.match(filter.stderr, /--filter: not JSON/);
    // a data file given as the view, without layout flags: still the error it was, not a flags mode
    const bare = await run(["render", "sales.csv"], { cwd: dir });
    assert.equal(bare.code, 2);
    assert.doesNotMatch(bare.stderr, /layout/);
    const chart = await run(["render", "v.json", "--data", "sales.csv", "--chart-type", "line"], { cwd: dir });
    assert.equal(chart.code, 2);
    assert.match(chart.stderr, /--chart-type .*layout flags/);
});

test("--filter as JSON or @file, --chart-type, --save-view: the saved view renders the same table", async () => {
    const dir = files();
    writeFileSync(join(dir, "north.json"), JSON.stringify({ field: "Region", type: "in", items: ["North"] }));
    const args = ["render", "sales.csv", "--rows", "Region", "--rows", "Product", "--values", "sum:Revenue"];
    const inline = await run([...args, "--filter", '{"field":"Region","type":"in","items":["North"]}', "-f", "csv"], { cwd: dir });
    assert.equal(inline.code, 0, inline.stderr);
    assert.ok(cells(inline.stdout).every((row, i) => i === 0 || ["North", "North Total", "Grand Total", ""].includes(row[0])), inline.stdout);
    const fromFile = await run([...args, "--filter", "@north.json", "-f", "csv", "--save-view", "north.pivotkit.json"], { cwd: dir });
    assert.equal(fromFile.code, 0, fromFile.stderr);
    assert.equal(fromFile.stdout, inline.stdout);
    assert.match(fromFile.stderr, /wrote north\.pivotkit\.json: the view/);
    const again = await run(["render", "north.pivotkit.json", "--data", "sales.csv", "-f", "csv"], { cwd: dir });
    assert.equal(again.code, 0, again.stderr);
    assert.equal(again.stdout, inline.stdout);
    const same = await run([...args, "-o", "x.json", "--save-view", "x.json"], { cwd: dir });
    assert.equal(same.code, 2);
    assert.match(same.stderr, /-o and --save-view name the same file/);
    const svg = await run(["render", "sales.csv", "--rows", "Month", "--values", "sum:Revenue", "--chart-type", "line", "-o", "trend.svg"], { cwd: dir });
    assert.equal(svg.code, 0, svg.stderr);
    assert.match(readFileSync(join(dir, "trend.svg"), "utf8"), /^<svg/);
    const agg = await run(["render", "sales.csv", "--rows", "Region", "--values", "summ:Revenue"], { cwd: dir });
    assert.equal(agg.code, 2);
    assert.match(agg.stderr, /"summ" is no aggregator; did you mean sum\?/);
    // a grouping of a field the data does not have: the field is named with the one meant, not a grouping's name
    const group = await run(["render", "sales.csv", "--rows", "Mnth", "--group", "Mnth:yearQuarter", "--values", "sum:Revenue", "-f", "csv"], { cwd: dir });
    assert.equal(group.code, 1);
    assert.match(group.stderr, /missing: "Mnth" \(did you mean "Month"\?\)/);
    assert.doesNotMatch(group.stderr, /Mnth by quarter/);
    const bad = await run(["render", "sales.csv", "--rows", "Region", "--chart-type", "lines"], { cwd: dir });
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /did you mean line/);
});

test("an exported pivot result is no data to suggest from: said with what to take instead", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "result.csv"), "Region,Grand Total\nNorth,10\nSouth,20\n");
    writeFileSync(join(dir, "table.csv"), "Date by month of year,Jan,Feb,Grand Total\nCity,Average of Mean °C,,\nBerlin,1,2,1.5\nMünchen,0,1,0.5\n");
    const r = await run(["describe", "table.csv", "--suggest"], { cwd: dir });
    assert.match(r.stderr, /an exported pivot result \("Grand Total", "Average of Mean °C"\)/);
    assert.match(r.stderr, /Export → Source data → All rows as CSV/);
});

test("render <data> --suggest: the draft as a report in one step", async () => {
    const dir = files();
    const r = await run(["render", "sales.csv", "--suggest", "-o", "sales.html", "--save-view", "draft.pivotkit.json"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /^draft: rows Region; columns Month by month; values Sum of Units$/m);
    assert.match(readFileSync(join(dir, "sales.html"), "utf8"), /<title>Draft: Sum of Units by Region and Month by month<\/title>/);
    assert.equal(JSON.parse(readFileSync(join(dir, "draft.pivotkit.json"), "utf8")).name, "Draft: Sum of Units by Region and Month by month");
});

test("--map Old=New: a view made before a column was renamed renders on the new file; the mismatch names the flag", async () => {
    const dir = files();
    writeFileSync(join(dir, "old.csv"), "Region,Revenue\nNorth,3\nSouth,4\nNorth,5\n");
    writeFileSync(join(dir, "renamed.csv"), "Region,Turnover\nNorth,3\nSouth,4\nNorth,5\n");
    writeFileSync(join(dir, "v.pivotkit.json"), JSON.stringify({ format: "pivotkit-view", formatVersion: 2, name: "By region", source: { id: "sales", fields: [{ name: "Region", type: "string" }, { name: "Revenue", type: "number" }] }, view: { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }] } }));
    const before = await run(["render", "v.pivotkit.json", "--data", "renamed.csv", "-f", "csv"], { cwd: dir });
    assert.equal(before.code, 1);
    assert.match(before.stderr, /renamed\? --map "Revenue=Turnover"/);
    const mapped = await run(["render", "v.pivotkit.json", "--data", "renamed.csv", "--map", "Revenue=Turnover", "-f", "csv", "--save-view", "fixed.pivotkit.json"], { cwd: dir });
    assert.equal(mapped.code, 0, mapped.stderr);
    const original = await run(["render", "v.pivotkit.json", "--data", "old.csv", "-f", "csv"], { cwd: dir });
    assert.equal(mapped.stdout.replace("Turnover", "Revenue"), original.stdout);
    const fixed = JSON.parse(readFileSync(join(dir, "fixed.pivotkit.json"), "utf8"));
    assert.equal(fixed.view.values[0].field, "Turnover");
    const unused = await run(["render", "v.pivotkit.json", "--data", "old.csv", "--map", "Nope=Revenue", "-f", "csv", "--strict"], { cwd: dir });
    assert.equal(unused.code, 1);
    assert.match(unused.stderr, /warning unusedMap/);
    const merge = await run(["render", "v.pivotkit.json", "--data", "renamed.csv", "--map", "Region=Turnover", "--map", "Revenue=Turnover"], { cwd: dir });
    assert.equal(merge.code, 2);
    // a few fields of the type the view does not use: named, with the flag to give
    writeFileSync(join(dir, "two.csv"), "Region,Units,Turnover\nNorth,1,3\n");
    const two = await run(["render", "v.pivotkit.json", "--data", "two.csv", "-f", "csv"], { cwd: dir });
    assert.match(two.stderr, /number fields the view does not use: "Units", "Turnover": one of them renamed\? --map "Revenue=<its new name>"/);
    // the mapping is said (--verbose shows info findings)
    const said = await run(["render", "v.pivotkit.json", "--data", "renamed.csv", "--map", "Revenue=Turnover", "-f", "csv", "--verbose"], { cwd: dir });
    assert.match(said.stderr, /info mapped: --map: the view's "Revenue" is read as "Turnover"/);
});

test("the same file gives the same draft whatever the machine's language and zone", async () => {
    const dir = files();
    const a = await run(["describe", "sales.csv", "--suggest"], { cwd: dir, env: { LANG: "tr_TR.UTF-8", TZ: "Pacific/Kiritimati" } });
    const b = await run(["describe", "sales.csv", "--suggest"], { cwd: dir, env: { LANG: "de_DE.UTF-8", TZ: "America/Los_Angeles" } });
    assert.equal(a.code, 0, a.stderr);
    assert.equal(a.stdout, b.stdout);
});

test("help and completions name the layout flags", async () => {
    const help = await run(["help", "render"]);
    for (const flag of ["--rows", "--cols", "--values", "--group", "--filter", "--chart-type", "--map", "--save-view", "--suggest"]) assert.ok(help.stdout.includes(flag), flag);
    const describe = await run(["help", "describe"]);
    assert.match(describe.stdout, /--suggest/);
    assert.match(describe.stdout, /-o, --output/);
    const bash = await run(["completion", "bash"]);
    assert.match(bash.stdout, /--chart-type\) COMPREPLY=\( \$\(compgen -W 'auto bar line area pie donut heatmap'/);
});

test("what the review found: no file content in a --filter error, -o never over the data, UTF-16 filter files, x:bin:month", async () => {
    const dir = files();
    writeFileSync(join(dir, "f.json"), "secret-token-abc123 not json");
    const leak = await run(["render", "sales.csv", "--rows", "Region", "--filter", "@f.json"], { cwd: dir });
    assert.equal(leak.code, 2);
    assert.doesNotMatch(leak.stderr, /token|abc123/);
    assert.match(leak.stderr, /--filter @f\.json: not JSON/);
    const over = await run(["describe", "sales.csv", "--suggest", "-o", "sales.csv"], { cwd: dir });
    assert.equal(over.code, 2);
    assert.match(readFileSync(join(dir, "sales.csv"), "utf8"), /^\uFEFF?Region,/);
    const named = await run(["describe", "sales.csv", "--suggest", "-o", "draft.txt"], { cwd: dir });
    assert.equal(named.code, 2);
    const dash = await run(["describe", "sales.csv", "--suggest", "-o", "-"], { cwd: dir });
    assert.equal(dash.code, 2);
    assert.ok(!existsSync(join(dir, "-")));
    // Windows PowerShell 5.1 writes UTF-16 with a byte order mark
    writeFileSync(join(dir, "north16.json"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('{"field":"Region","type":"in","items":["North"]}', "utf16le")]));
    const utf16 = await run(["render", "sales.csv", "--rows", "Region", "--values", "count", "--filter", "@north16.json", "-f", "csv"], { cwd: dir });
    assert.equal(utf16.code, 0, utf16.stderr);
    assert.doesNotMatch(utf16.stdout, /South/);
    // a field named "x:bin" grouped by month
    writeFileSync(join(dir, "bin.csv"), '"x:bin",n\n2025-01-05,1\n2025-03-01,2\n');
    const bin = await run(["render", "bin.csv", "--rows", "x:bin", "--group", "x:bin:month", "--values", "sum:n", "-f", "csv"], { cwd: dir });
    assert.equal(bin.code, 0, bin.stderr);
    assert.match(bin.stdout, /x:bin by month of year/);
    // a grouping of a field the data does not have, on no axis: said
    const nope = await run(["render", "sales.csv", "--rows", "Region", "--group", "Nope:month", "--values", "count", "-f", "csv", "--strict"], { cwd: dir });
    assert.equal(nope.code, 1);
    assert.match(nope.stderr, /warning unusedGroup: the data has no field Nope to group/);
    // the same --map name twice with two new names
    const twice = await run(["render", "sales.csv", "--rows", "Region", "--map", "A=B", "--map", "a=C"], { cwd: dir });
    assert.equal(twice.code, 2);
});
