// What the command line says when something is given in a place it does not belong: --sheet on data
// that is no workbook, -o naming an input or "-", a view file where --suggest wants data, a data file
// where a view belongs, a view that is not there, an error that follows from a grouping, an unknown
// field of a draft, describe with --data alone; and hint lines that a shell pastes as they are.
// Run as a user runs them; what is checked is what a person reads and the files left behind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { quoteArg } from "../src/layout-view.js";
import { BY_REGION, SALES_CSV, has, run, tempDir } from "./helpers.js";

/** A directory with sales.csv and the view file view.json over it. */
function fixtureDir() {
    const dir = tempDir();
    writeFileSync(join(dir, "sales.csv"), SALES_CSV);
    writeFileSync(join(dir, "view.json"), JSON.stringify(BY_REGION));
    return dir;
}

test("--sheet on data that is no workbook: a warning ignoredOption, as other options without effect", async () => {
    const dir = fixtureDir();
    const r = await run(["render", "view.json", "--data", "sales.csv", "--sheet", "Foo", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 0);
    assert.match(r.stderr, /^warning ignoredOption: --sheet does nothing: sales\.csv is no workbook \(only an XLSX file has sheets\)$/m);
    assert.equal((await run(["render", "view.json", "--data", "sales.csv", "--sheet", "Foo", "-f", "csv", "--strict"], { cwd: dir })).code, 1);
    // validate and describe read the data the same way
    assert.match((await run(["validate", "view.json", "--data", "sales.csv", "--sheet", "Foo"], { cwd: dir })).stderr, /warning ignoredOption: --sheet/);
    assert.match((await run(["describe", "sales.csv", "--sheet", "Foo"], { cwd: dir })).stderr, /warning ignoredOption: --sheet/);
    // an empty --sheet counts as not given: no warning
    assert.doesNotMatch((await run(["render", "view.json", "--data", "sales.csv", "--sheet", "", "-f", "csv"], { cwd: dir })).stderr, /ignoredOption/);
});

test("render -o naming the data file, the view file or -: a usage error, nothing replaced, no file named -", async () => {
    const dir = fixtureDir();
    const over = await run(["render", "sales.csv", "--rows", "Region", "-f", "csv", "-o", "sales.csv"], { cwd: dir });
    assert.equal(over.code, 2);
    assert.match(over.stderr, /^pivotkit: -o names the data file: the output would replace the data; give it another name/m);
    assert.equal(readFileSync(join(dir, "sales.csv"), "utf8"), SALES_CSV);
    const overData = await run(["render", "view.json", "--data", "./sales.csv", "-f", "csv", "-o", "sales.csv"], { cwd: dir });
    assert.equal(overData.code, 2);
    assert.equal(readFileSync(join(dir, "sales.csv"), "utf8"), SALES_CSV);
    const overView = await run(["render", "view.json", "--data", "sales.csv", "-o", "view.json"], { cwd: dir });
    assert.equal(overView.code, 2);
    assert.match(overView.stderr, /-o names the view file/);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "view.json"), "utf8")), BY_REGION);
    const dash = await run(["render", "sales.csv", "--rows", "Region", "-f", "csv", "-o", "-"], { cwd: dir });
    assert.equal(dash.code, 2);
    assert.match(dash.stderr, /^pivotkit: -o -: the output goes to stdout when -o is left out/m);
    assert.ok(!existsSync(join(dir, "-")));
    assert.equal(JSON.parse((await run(["render", "view.json", "--data", "sales.csv", "-o", "-", "--json"], { cwd: dir })).stdout).error.code, "BAD_VALUE");
});

test("--save-view naming the data file: a usage error, the data kept", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "sales.json"), JSON.stringify([{ Region: "North", Units: 3 }, { Region: "South", Units: 4 }]));
    const r = await run(["render", "sales.json", "--rows", "Region", "-f", "csv", "--save-view", "sales.json"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--save-view names the data file/);
    assert.match(readFileSync(join(dir, "sales.json"), "utf8"), /^\[\{"Region"/);
});

test("describe <view file> --suggest, and render <view file> with layout flags: says the data is needed, not a reader's error", async () => {
    const dir = fixtureDir();
    const r = await run(["describe", "view.json", "--suggest"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^pivotkit: --suggest makes a view from a data file, and view\.json is a view: give the data \(pivotkit describe <data> --suggest\), or describe the view with pivotkit describe view\.json --data <data>/m);
    assert.doesNotMatch(r.stderr, /JSON_PROPERTY|noSuggestion/);
    const flags = await run(["render", "view.json", "--rows", "Region"], { cwd: dir });
    assert.equal(flags.code, 2);
    assert.match(flags.stderr, /--rows makes a view from a data file, and view\.json is a view: give the data \(pivotkit render <data> --rows \.\.\.\), or render the view with pivotkit render view\.json --data <data>/);
    // a view as JSON text and from stdin too
    assert.match((await run(["describe", "-", "--data-format", "json", "--suggest"], { cwd: dir, input: JSON.stringify(BY_REGION) })).stderr, /stdin is a view/);
    // JSON data is still data
    writeFileSync(join(dir, "rows.json"), JSON.stringify([{ Region: "North", Units: 3 }, { Region: "South", Units: 4 }, { Region: "North", Units: 1 }]));
    assert.equal((await run(["describe", "rows.json", "--suggest"], { cwd: dir })).code, 0);
});

test("quoteArg: a value with ! in single quotes, so an interactive bash pastes it without history expansion", { skip: has("bash") ? false : "bash is not installed" }, () => {
    assert.equal(quoteArg("sum:Units"), "sum:Units");
    assert.equal(quoteArg("Mean °C"), '"Mean °C"');
    assert.equal(quoteArg("Wow!"), "'Wow!'");
    assert.equal(quoteArg("it's $5!"), "'it'\\''s $5!'");
    // what bash makes of each quoted word is the word itself
    for (const word of ["Wow!", "it's $5!", 'a "b" !c', "x`y`!"]) {
        assert.equal(execFileSync("bash", ["-c", `printf %s ${quoteArg(word)}`], { encoding: "utf8" }), word);
    }
});

test("a hint line with ! in a field name pastes in bash: the field single-quoted", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "d.csv"), "Region,Units,Cost!\nNorth,3,1\nSouth,4,2\nNorth,1,5\n");
    const r = await run(["describe", "d.csv", "--suggest", "-o", "d.pivotkit.json"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /--values 'sum:Cost!'/);
});

test("a data file where a view belongs: says to give it with --data or to describe it", async () => {
    const dir = fixtureDir();
    const v = await run(["validate", "sales.csv"], { cwd: dir });
    assert.equal(v.code, 1);
    assert.match(v.stderr, /^error viewFile: not a view: not valid JSON/m);
    assert.match(v.stderr, /^ {2}sales\.csv looks like data, not a view: give it with --data \(pivotkit validate <view> --data sales\.csv\), or describe it: pivotkit describe sales\.csv$/m);
    const r = await run(["render", "sales.csv", "--data", "sales.csv", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /sales\.csv looks like data, not a view: give it with --data \(pivotkit render <view> --data sales\.csv\), or make a view of it: pivotkit render sales\.csv --suggest/);
    // a broken view file is no data: no such hint
    writeFileSync(join(dir, "broken.json"), '{"rows": [');
    assert.doesNotMatch((await run(["validate", "broken.json", "--data", "sales.csv"], { cwd: dir })).stderr, /looks like data/);
});

test("a view that is not there: says what was looked for", async () => {
    const dir = fixtureDir();
    const r = await run(["render", "x", "--data", "sales.csv"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^pivotkit: x: not found: the view is a view file, - for stdin, JSON text or --link/m);
    assert.match((await run(["validate", "nope.json"], { cwd: dir })).stderr, /nope\.json: not found: the view is a view file/);
});

test("a date grouping of a text field: the unknown field that follows from it is left out, counted, and kept in --json", async () => {
    const dir = fixtureDir();
    const r = await run(["render", "sales.csv", "--rows", "Region", "--group", "Region:yearMonth", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^error groupingNeedsDate at derived\[0\]: date grouping needs a date field$/m);
    assert.match(r.stderr, /^ {2}and 1 more error from it \(--json lists it\)$/m);
    assert.doesNotMatch(r.stderr, /Region by month/);
    const json = JSON.parse((await run(["render", "sales.csv", "--rows", "Region", "--group", "Region:yearMonth", "-o", "out.csv", "--json"], { cwd: dir })).stdout);
    const follower = json.findings.find((f) => f.code === "unknownField");
    assert.equal(follower.followsFrom, "groupingNeedsDate");
    // the same for describe --suggest and validate
    const draft = await run(["describe", "sales.csv", "--suggest", "--rows", "Region", "--group", "Region:yearMonth"], { cwd: dir });
    assert.doesNotMatch(draft.stderr, /Region by month/);
    writeFileSync(join(dir, "g.json"), JSON.stringify({ rows: ["Region by month"], derived: [{ name: "Region by month", field: "Region", by: "yearMonth" }] }));
    const valid = await run(["validate", "g.json", "--data", "sales.csv"], { cwd: dir });
    assert.match(valid.stderr, /groupingNeedsDate/);
    assert.doesNotMatch(valid.stderr, /unknownField/);
});

test("describe --suggest with an unknown field: the data's fields, as render says it", async () => {
    const dir = fixtureDir();
    const r = await run(["describe", "sales.csv", "--suggest", "--rows", "Nope"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^error dataMismatch: sales\.csv does not have the fields the view uses$/m);
    assert.match(r.stderr, /^ {2}the data has: Region, Product, Units, Date$/m);
});

test("describe --data - with no argument describes the data from stdin", async () => {
    const dir = tempDir();
    const r = await run(["describe", "--data", "-", "--data-format", "csv"], { cwd: dir, input: SALES_CSV });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Region/);
    const file = await run(["describe", "--data", "sales.csv"], { cwd: fixtureDir() });
    assert.equal(file.code, 0, file.stderr);
    assert.match(file.stdout, /^ {2}Units/m);
    // --suggest takes --data alone
    assert.equal((await run(["describe", "--data", "-", "--data-format", "csv", "--suggest"], { cwd: dir, input: SALES_CSV })).code, 0);
    // --as view with --data alone: there is no view
    const asView = await run(["describe", "--data", "sales.csv", "--as", "view"], { cwd: fixtureDir() });
    assert.equal(asView.code, 2);
    assert.match(asView.stderr, /--as view needs the view as the argument/);
    const none = await run(["describe"], { cwd: dir });
    assert.equal(none.code, 2);
    assert.match(none.stderr, /describe needs a view or a data file \(the argument, or --data <file>\)/);
});

/** Whether the file system of a directory finds a file by another case of its name (macOS, Windows). */
const caseInsensitive = (dir) => existsSync(join(dir, "SALES.CSV"));

test("-o naming the data through a link to its directory or another case of its name: refused, the data kept", async () => {
    const dir = fixtureDir();
    // a junction on Windows: a link to a directory that needs no privilege there
    symlinkSync(dir, join(dir, "lnk"), "junction");
    for (const args of [
        ["render", "sales.csv", "--rows", "Region", "-f", "csv", "-o", "lnk/sales.csv"],
        ["render", "view.json", "--data", "sales.csv", "-f", "csv", "-o", "lnk/sales.csv"],
        ["render", "view.json", "--data", "sales.csv", "-f", "json", "-o", "lnk/view.json"],
        ["describe", "rows.json", "--suggest", "-o", "lnk/rows.json"]
    ]) {
        writeFileSync(join(dir, "rows.json"), JSON.stringify([{ Region: "North", Units: 3 }, { Region: "South", Units: 4 }, { Region: "North", Units: 1 }]));
        const r = await run(args, { cwd: dir });
        assert.equal(r.code, 2, `${args.join(" ")}: ${r.stderr}`);
        assert.match(r.stderr, /names the (data|view) file/);
    }
    assert.equal(readFileSync(join(dir, "sales.csv"), "utf8"), SALES_CSV);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "view.json"), "utf8")), BY_REGION);
});

test("-o naming the data by another case of its name, where the file system ignores case: refused", async (t) => {
    const dir = fixtureDir();
    if (!caseInsensitive(dir)) {
        t.skip("the file system tells cases apart");
        return;
    }
    const r = await run(["render", "sales.csv", "--rows", "Region", "-f", "csv", "-o", "SALES.CSV"], { cwd: dir });
    assert.equal(r.code, 2, r.stderr);
    assert.equal(readFileSync(join(dir, "sales.csv"), "utf8"), SALES_CSV);
});

test("describe --data <view file>: says it is a view and how to describe it", async () => {
    const dir = fixtureDir();
    const r = await run(["describe", "--data", "view.json"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^pivotkit: --data view\.json is a view, not data: describe it with pivotkit describe view\.json \(and its data with --data <data>\)/m);
    assert.doesNotMatch(r.stderr, /no table/i);
});
