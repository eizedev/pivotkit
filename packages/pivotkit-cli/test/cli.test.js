// The CLI end to end, as a spawned process: exit codes, stdout and stderr, --json, stdin and stdout,
// files read and written the safe way, and what it refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodeViewLink } from "pivotkit-core/link";
import { BY_REGION, SALES_CSV, run, tempDir } from "./helpers.js";

/** A directory with sales.csv and view.json. */
function fixtureDir() {
    const dir = tempDir();
    writeFileSync(join(dir, "sales.csv"), SALES_CSV);
    writeFileSync(join(dir, "view.json"), JSON.stringify(BY_REGION));
    return dir;
}

test("help: pivotkit, a command's help and help <command>; an unknown command is a usage error with a hint", async () => {
    const top = await run([]);
    assert.equal(top.code, 0);
    for (const c of ["render", "validate", "describe", "completion", "help"]) assert.ok(top.stdout.includes(`  ${c} `), c);
    assert.match(top.stdout, /Exit codes: 0 done, 1 findings/);
    const render = await run(["render", "--help"]);
    assert.equal(render.code, 0);
    assert.match(render.stdout, /-o, --output <file>/);
    assert.match(render.stdout, /--now <date> .*\[env PIVOTKIT_NOW\]/);
    assert.equal((await run(["help", "render"])).stdout, render.stdout);
    const wrong = await run(["rendr"]);
    assert.equal(wrong.code, 2);
    assert.equal(wrong.stdout, "");
    assert.match(wrong.stderr, /unknown command "rendr"; did you mean render\?/);
    const flag = await run(["render", "--formt", "csv"]);
    assert.equal(flag.code, 2);
    assert.match(flag.stderr, /unknown option --formt for "render"; did you mean --format\?/);
});

test("--version names the CLI, pivotkit-report and pivotkit-core", async () => {
    const r = await run(["--version"]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /^pivotkit-cli \d+\.\d+\.\d+ \(pivotkit-report \d+\.\d+\.\d+, pivotkit-core \d+\.\d+\.\d+\)\n$/);
});

test("render to stdout: CSV of the view over the data, nothing else on stdout; info notes stay off stderr", async () => {
    const dir = fixtureDir();
    const r = await run(["render", "view.json", "--data", "sales.csv", "--format", "csv"], { cwd: dir });
    assert.equal(r.code, 0);
    // no byte order mark on stdout: the first header cell is "Region" for cut, diff or a CSV reader
    assert.equal(r.stdout, "Region,Sum of Units\r\nNorth,5\r\nSouth,4\r\nWest,5\r\nGrand Total,14\r\n");
    assert.equal(r.stderr, "");
});

test("--bom: a CSV file of -o starts with a byte order mark for Excel, stdout not; on and off decide", async () => {
    const dir = fixtureDir();
    const bom = (bytes) => bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    assert.equal((await run(["render", "view.json", "--data", "sales.csv", "-o", "auto.csv"], { cwd: dir })).code, 0);
    assert.ok(bom(readFileSync(join(dir, "auto.csv"))));
    assert.equal((await run(["render", "view.json", "--data", "sales.csv", "-o", "off.csv", "--bom", "off"], { cwd: dir })).code, 0);
    assert.ok(!bom(readFileSync(join(dir, "off.csv"))));
    assert.ok(bom((await run(["render", "view.json", "--data", "sales.csv", "-f", "csv", "--bom", "on"], { cwd: dir })).bytes));
});

test("-o names the format by a known extension; another extension or none is a usage error, not HTML in a .pdf", async () => {
    const dir = fixtureDir();
    for (const [file, message] of [["report.pdf", /report\.pdf: \.pdf is no format pivotkit writes; give -f html, csv, json, xlsx, svg/], ["report", /report: no extension to take the format from/]]) {
        const r = await run(["render", "view.json", "--data", "sales.csv", "-o", file], { cwd: dir });
        assert.equal(r.code, 2, file);
        assert.match(r.stderr, message);
        assert.ok(!existsSync(join(dir, file)), file);
    }
    // -f decides whatever the extension; .htm is HTML
    assert.equal((await run(["render", "view.json", "--data", "sales.csv", "-o", "report.pdf", "-f", "html"], { cwd: dir })).code, 0);
    assert.equal((await run(["render", "view.json", "--data", "sales.csv", "-o", "page.htm"], { cwd: dir })).code, 0);
    assert.ok(readFileSync(join(dir, "page.htm"), "utf8").startsWith("<!doctype html>"));
});

test("an option that does nothing in the format is a warning (exit 1 with --strict); a device as -o says to leave it out", async () => {
    const dir = fixtureDir();
    const r = await run(["render", "view.json", "--data", "sales.csv", "-f", "csv", "--width", "800", "--title", "T"], { cwd: dir });
    assert.equal(r.code, 0);
    assert.match(r.stderr, /warning ignoredOption: --title does nothing in csv \(only in html, xlsx\)/);
    assert.match(r.stderr, /warning ignoredOption: --width does nothing in csv \(only in svg, html\)/);
    assert.equal((await run(["render", "view.json", "--data", "sales.csv", "-f", "csv", "--width", "800", "--strict"], { cwd: dir })).code, 1);
    const device = await run(["render", "view.json", "--data", "sales.csv", "-f", "csv", "-o", "/dev/null"], { cwd: dir });
    assert.equal(device.code, 2);
    assert.match(device.stderr, /null: exists and is a device or another special file; not replaced; to write to stdout, leave out -o/);
});

test("--locale, --time-zone and --now are checked by every command, and name the variable they came from", async () => {
    const dir = fixtureDir();
    for (const command of [["render", "view.json", "--data", "sales.csv", "-f", "csv"], ["validate", "view.json", "--data", "sales.csv"], ["describe", "sales.csv"]]) {
        const env = await run(command, { cwd: dir, env: { PIVOTKIT_NOW: "garbage" } });
        assert.equal(env.code, 2, command[0]);
        assert.match(env.stderr, /--now "garbage" is not a date .* \(from PIVOTKIT_NOW\)/, command[0]);
        const flag = await run([...command, "--locale", "not_a_locale"], { cwd: dir });
        assert.equal(flag.code, 2, command[0]);
        assert.match(flag.stderr, /--locale "not_a_locale" is not a locale tag/);
        assert.ok(!flag.stderr.includes("options.locale") && !flag.stderr.includes("from PIVOTKIT"));
        const zone = await run([...command, "--time-zone", "Mars/Olympus"], { cwd: dir });
        assert.equal(zone.code, 2, command[0]);
        assert.match(zone.stderr, /--time-zone "Mars\/Olympus" is not a time zone/);
    }
});

test("stdin: the view or the data, not both; data from stdin needs its format", async () => {
    const dir = fixtureDir();
    const view = await run(["render", "-", "--data", "sales.csv", "-f", "json"], { cwd: dir, input: JSON.stringify(BY_REGION) });
    assert.equal(view.code, 0);
    assert.equal(JSON.parse(view.stdout).rows.at(-1).values[0], 14);
    const data = await run(["render", "view.json", "--data", "-", "--data-format", "csv", "-f", "csv"], { cwd: dir, input: SALES_CSV });
    assert.equal(data.code, 0);
    assert.ok(data.stdout.includes("Grand Total,14"));
    const noFormat = await run(["render", "view.json", "--data", "-"], { cwd: dir, input: SALES_CSV });
    assert.equal(noFormat.code, 2);
    assert.match(noFormat.stderr, /--data - needs --data-format/);
    const both = await run(["render", "-", "--data", "-", "--data-format", "csv"], { cwd: dir, input: "{}" });
    assert.equal(both.code, 2);
    assert.match(both.stderr, /only one input can come from stdin/);
});

test("-o: the format from the extension, a file replaced whole, --json with the output's facts", async () => {
    const dir = fixtureDir();
    writeFileSync(join(dir, "out.html"), "old content that is much longer than nothing ".repeat(1000));
    const r = await run(["render", "view.json", "--data", "sales.csv", "-o", "out.html", "--json", "--now", "2026-11-13"], { cwd: dir });
    assert.equal(r.code, 0);
    const result = JSON.parse(r.stdout);
    assert.deepEqual(result.output, { file: "out.html", format: "html", mediaType: "text/html;charset=utf-8", bytes: statSync(join(dir, "out.html")).size });
    assert.deepEqual([result.ok, result.exitCode, result.command], [true, 0, "render"]);
    assert.ok(result.findings.every((f) => f.severity === "info"));
    const html = readFileSync(join(dir, "out.html"), "utf8");
    assert.ok(html.startsWith("<!doctype html>") && html.includes("<h1>By region</h1>") && !html.includes("old content"));
    // no temporary file is left next to it
    assert.deepEqual(execFileSync("ls", ["-A", dir], { encoding: "utf8" }).trim().split("\n").sort(), ["out.html", "sales.csv", "view.json"]);
    const noFile = await run(["render", "view.json", "--data", "sales.csv", "--json"], { cwd: dir });
    assert.equal(noFile.code, 2);
    assert.equal(JSON.parse(noFile.stdout).error.code, "JSON_NEEDS_OUTPUT");
});

test("exit 1: an error in the view writes nothing; --lenient writes it and still exits 1; --strict counts warnings", async () => {
    const dir = fixtureDir();
    const bad = JSON.stringify({ rows: ["Regoin"], values: [{ field: "Units", agg: "sum" }] });
    const r = await run(["render", bad, "--data", "sales.csv", "-o", "out.csv"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /error unknownField at rows\[0\]: unknown field "Regoin" \(did you mean "Region"\?\)/);
    assert.match(r.stderr, /nothing written/);
    assert.ok(!existsSync(join(dir, "out.csv")));
    const lenient = await run(["render", bad, "--data", "sales.csv", "-o", "out.csv", "--lenient"], { cwd: dir });
    assert.equal(lenient.code, 1);
    assert.ok(readFileSync(join(dir, "out.csv"), "utf8").includes("Grand Total"));
    // a key this version does not know is a warning: exit 0, with --strict exit 1
    const warn = JSON.stringify({ rows: ["Region"], values: [{ field: "Units", agg: "sum", colour: "red" }] });
    const loose = await run(["validate", warn, "--data", "sales.csv", "--json"], { cwd: dir });
    assert.equal(loose.code, 0);
    assert.equal(JSON.parse(loose.stdout).findings.find((f) => f.severity === "warning").code, "unknownKey");
    const strict = await run(["validate", warn, "--data", "sales.csv", "--strict"], { cwd: dir });
    assert.equal(strict.code, 1);
});

test("exit 2 with the kind in --json: usage, a missing file, a limit, a bad template", async () => {
    const dir = fixtureDir();
    const kind = async (args) => {
        const r = await run([...args, "--json"], { cwd: dir });
        const out = JSON.parse(r.stdout);
        assert.equal(r.code, 2, args.join(" "));
        assert.equal(out.exitCode, 2);
        return [out.error.kind, out.error.code];
    };
    assert.deepEqual(await kind(["validate", "view.json"]), ["usage", "MISSING_DATA"]);
    assert.deepEqual(await kind(["validate", "nope.json", "--data", "sales.csv"]), ["io", "NOT_FOUND"]);
    assert.deepEqual(await kind(["validate", "view.json", "--data", "sales.csv", "--limit", "rows=2"]), ["limit", "LIMIT_EXCEEDED"]);
    assert.deepEqual(await kind(["validate", "view.json", "--data", "sales.csv", "--limit", "rowz=2"]), ["usage", "UNKNOWN_LIMIT"]);
    writeFileSync(join(dir, "t.html"), '<a href="{{source}}">x</a>');
    assert.deepEqual(await kind(["render", "view.json", "--data", "sales.csv", "--template", "t.html", "-o", "r.html"]), ["template", "attribute"]);
    assert.deepEqual(await kind(["render", "view.json", "--data", "sales.csv", "--format", "pdf", "-o", "r.pdf"]), ["usage", "BAD_VALUE"]);
});

test("a file over fileBytes is refused before it is read (a sparse file of 101 MiB)", async () => {
    const dir = fixtureDir();
    writeFileSync(join(dir, "huge.csv"), "");
    truncateSync(join(dir, "huge.csv"), 101 * 1024 * 1024);
    const started = Date.now();
    const r = await run(["describe", "huge.csv"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /huge\.csv: 105,906,176 bytes exceed the limit of 104,857,600 \(limits\.fileBytes\)/);
    assert.ok(Date.now() - started < 10_000);
});

test("--allow-dir is a hard limit: a link out of it, .. and an output outside are refused; inside works", async () => {
    const root = tempDir();
    const inside = join(root, "inside");
    const outside = join(root, "outside");
    mkdirSync(inside);
    mkdirSync(outside);
    writeFileSync(join(inside, "sales.csv"), SALES_CSV);
    writeFileSync(join(inside, "view.json"), JSON.stringify(BY_REGION));
    writeFileSync(join(outside, "secret.csv"), "Secret\nTOP-SECRET-VALUE\n");
    symlinkSync(join(outside, "secret.csv"), join(inside, "link.csv"));
    const allow = ["--allow-dir", inside];
    const ok = await run(["render", "view.json", "--data", "sales.csv", "-o", "out.csv", ...allow], { cwd: inside });
    assert.equal(ok.code, 0);
    for (const [args, what] of [[["describe", "link.csv"], "link.csv"], [["describe", "../outside/secret.csv"], "secret.csv"], [["render", "view.json", "--data", "sales.csv", "-o", "../outside/out.csv"], "out.csv"]]) {
        const r = await run([...args, ...allow], { cwd: inside });
        assert.equal(r.code, 2, args.join(" "));
        // the allowed directories are named by their base names, as every path in a message
        assert.match(r.stderr, new RegExp(`${what.replace(".", "\\.")}: outside the allowed directories \\(--allow-dir inside\\)`));
        assert.ok(!r.stderr.includes("TOP-SECRET") && !r.stdout.includes("TOP-SECRET"));
    }
    assert.ok(!existsSync(join(outside, "out.csv")));
    // a name that starts with ".." is a name inside the directory, not a way out of it
    writeFileSync(join(inside, "..data.csv"), SALES_CSV);
    assert.equal((await run(["describe", "..data.csv", ...allow], { cwd: inside })).code, 0);
    // without --allow-dir the user's own rights apply: the link is followed
    assert.equal((await run(["describe", "link.csv"], { cwd: inside })).code, 0);
});

test("only regular files: a FIFO is refused without waiting for a writer, a directory as data, a link as output", async () => {
    const dir = fixtureDir();
    execFileSync("mkfifo", [join(dir, "pipe.csv")]);
    const fifo = await run(["describe", "pipe.csv"], { cwd: dir, timeout: 10_000 });
    assert.equal(fifo.code, 2);
    assert.match(fifo.stderr, /pipe\.csv: not a regular file/);
    mkdirSync(join(dir, "folder.csv"));
    const folder = await run(["describe", "folder.csv"], { cwd: dir });
    assert.equal(folder.code, 2);
    assert.match(folder.stderr, /folder\.csv: not a regular file/);
    writeFileSync(join(dir, "target.txt"), "keep me");
    symlinkSync(join(dir, "target.txt"), join(dir, "link.csv"));
    const link = await run(["render", "view.json", "--data", "sales.csv", "-o", "link.csv"], { cwd: dir });
    assert.equal(link.code, 2);
    assert.match(link.stderr, /link\.csv: exists and is a symbolic link; not replaced/);
    assert.equal(readFileSync(join(dir, "target.txt"), "utf8"), "keep me");
    const toFolder = await run(["render", "view.json", "--data", "sales.csv", "-o", "folder.csv"], { cwd: dir });
    assert.equal(toFolder.code, 2);
    assert.match(toFolder.stderr, /folder\.csv: exists and is a directory; not replaced/);
    // a long name: the temporary file next to it still fits a file name's 255 bytes
    const long = `${"ä".repeat(120)}.csv`;
    const longRun = await run(["render", "view.json", "--data", "sales.csv", "-o", long], { cwd: dir });
    assert.equal(longRun.code, 0, longRun.stderr);
    assert.ok(existsSync(join(dir, long)));
});

test("no file content in a message: a broken view, data that cannot be read, a hostile field name cleaned", async () => {
    const dir = fixtureDir();
    writeFileSync(join(dir, "broken.json"), '{ "rows": ["SECRET-IN-VIEW" ');
    const view = await run(["validate", "broken.json", "--data", "sales.csv"], { cwd: dir });
    assert.equal(view.code, 1);
    assert.match(view.stderr, /not a view: not valid JSON/);
    assert.ok(!view.stderr.includes("SECRET"));
    writeFileSync(join(dir, "bad.json"), '[{"a": "SECRET-IN-DATA"');
    const data = await run(["describe", "bad.json", "--as", "data"], { cwd: dir });
    assert.equal(data.code, 2);
    assert.ok(!data.stderr.includes("SECRET"), data.stderr);
    writeFileSync(join(dir, "ansi.csv"), "Re\u001b]8;;https://x\u0007gion\u001b[31m,Units\nNorth,1\n");
    const ansi = await run(["validate", JSON.stringify({ rows: ["Nope\u001b[2J"] }), "--data", "ansi.csv"], { cwd: dir });
    assert.equal(ansi.code, 1);
    // eslint-disable-next-line no-control-regex
    assert.ok(!/[\u0000-\u0008\u000b-\u001f]/.test(ansi.stderr), JSON.stringify(ansi.stderr));
});

test("describe: data shows names, types and counts, values only with --items; a view needs its data", async () => {
    const dir = fixtureDir();
    const plain = await run(["describe", "sales.csv", "--json"], { cwd: dir });
    assert.equal(plain.code, 0);
    const out = JSON.parse(plain.stdout);
    assert.equal(out.kind, "data");
    const region = out.description.fields.find((f) => f.name === "Region");
    assert.deepEqual([region.type, region.distinct, region.items], ["string", 3, []]);
    const units = out.description.fields.find((f) => f.name === "Units");
    assert.equal(units.min, undefined);
    assert.ok(!plain.stdout.includes("North"));
    const items = JSON.parse((await run(["describe", "sales.csv", "--json", "--items", "2"], { cwd: dir })).stdout);
    assert.deepEqual(items.description.fields.find((f) => f.name === "Region").items, ["North", "South"]);
    const view = await run(["describe", "view.json"], { cwd: dir });
    assert.equal(view.code, 2);
    assert.match(view.stderr, /needs its data/);
    const withData = await run(["describe", "view.json", "--data", "sales.csv"], { cwd: dir });
    assert.equal(withData.code, 0);
    assert.equal(withData.stdout, "By region: sum of Units by Region\n");
    // a JSON file of rows is data; a view read as data has no table
    writeFileSync(join(dir, "rows.json"), JSON.stringify([{ a: 1, b: "x" }, { a: 2, b: "y" }]));
    assert.equal(JSON.parse((await run(["describe", "rows.json", "--json"], { cwd: dir })).stdout).kind, "data");
    const forced = JSON.parse((await run(["describe", "view.json", "--as", "data", "--json"], { cwd: dir })).stdout);
    assert.deepEqual([forced.exitCode, forced.error.code], [2, "NO_TABLE"]);
});

test("PIVOTKIT_NOW gives the default of --now: a relative filter keeps other rows; the option wins", async () => {
    const dir = fixtureDir();
    const view = JSON.stringify({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Date", type: "relative", unit: "month", count: 3 }] });
    const nov = await run(["render", view, "--data", "sales.csv", "-f", "csv"], { cwd: dir, env: { PIVOTKIT_NOW: "2026-11-13" } });
    assert.ok(nov.stdout.includes("South,4") && nov.stdout.includes("North,2") && !nov.stdout.includes("West"));
    const flag = await run(["render", view, "--data", "sales.csv", "-f", "csv", "--now", "2025-08-01"], { cwd: dir, env: { PIVOTKIT_NOW: "2026-11-13" } });
    assert.ok(flag.stdout.includes("West,5") && !flag.stdout.includes("South"));
});

test("--link reads the view from a pivotkit link; an XLSX goes to a file, never to stdout of a terminal", async () => {
    const dir = fixtureDir();
    const link = `https://example.com/report#pivot=${encodeViewLink(BY_REGION.view)}`;
    const r = await run(["render", "--link", link, "--data", "sales.csv", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 0);
    assert.ok(r.stdout.includes("Grand Total,14"));
    const xlsx = await run(["render", "view.json", "--data", "sales.csv", "-o", "out.xlsx"], { cwd: dir });
    assert.equal(xlsx.code, 0);
    assert.deepEqual([...readFileSync(join(dir, "out.xlsx")).subarray(0, 2)], [0x50, 0x4b]);
});

test("XLSX data: a workbook is read with pivotkit-xlsx; unpacking more than the limit is refused before it is unpacked", async () => {
    const { makeXlsx } = await import("../../pivotkit-xlsx/test/make-xlsx.js");
    const dir = fixtureDir();
    const rows = [["Region", "Units"], ...Array.from({ length: 2_000 }, (_, i) => [i % 2 ? "North" : "South", 1])];
    writeFileSync(join(dir, "sales.xlsx"), makeXlsx({ sheets: [{ name: "Sales", rows }] }));
    const ok = await run(["render", "view.json", "--data", "sales.xlsx", "-f", "csv"], { cwd: dir });
    assert.equal(ok.code, 0, ok.stderr);
    assert.ok(ok.stdout.includes("Grand Total,2000"));
    const bomb = await run(["render", "view.json", "--data", "sales.xlsx", "-o", "out.csv", "--limit", "unpackedBytes=20000", "--json"], { cwd: dir });
    assert.equal(bomb.code, 2);
    assert.equal(JSON.parse(bomb.stdout).error.kind, "limit");
});
