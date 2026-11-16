// --filter as a person types it (#508): the short form Field=Item next to the JSON filter of a view,
// the errors of a filter written another way, and "did you mean" for an aggregator of another tool.
// Run as a user runs them, on a small table with a field whose name holds "="; what is checked is the
// table rendered and the message read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS } from "../src/commands.js";
import { run, tempDir } from "./helpers.js";

const DATA = [
    "Country,Region,Units,Month,a=b,Paid",
    "Germany,North,3,2025-01-01,x=1,true",
    "Germany,South,4,2025-02-01,y,false",
    "France,North,2,2025-02-01,x=1,false",
    "Spain,West,5,2025-03-01,y,true",
    "Italy,South,7,2025-03-01,y,false"
].join("\n");

/** A directory with the table as data.csv. */
function files() {
    const dir = tempDir();
    writeFileSync(join(dir, "data.csv"), `${DATA}\n`);
    return dir;
}

/** The rendered CSV as its lines, without a byte order mark. */
const lines = (text) => text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);

const SUM_BY_COUNTRY = ["render", "data.csv", "--rows", "Country", "--values", "sum:Units", "-f", "csv"];

test("--filter Country=Germany keeps the rows of that item, as the JSON filter does", async () => {
    const dir = files();
    const short = await run([...SUM_BY_COUNTRY, "--filter", "Country=Germany"], { cwd: dir });
    assert.equal(short.code, 0, short.stderr);
    assert.deepEqual(lines(short.stdout), ["Country,Sum of Units", "Germany,7", "Grand Total,7"]);
    const json = await run([...SUM_BY_COUNTRY, "--filter", '{"field":"Country","type":"in","items":["Germany"]}'], { cwd: dir });
    assert.equal(json.code, 0, json.stderr);
    assert.equal(short.stdout, json.stdout);
});

test("--filter given again for one field keeps each item; for two fields, the rows both keep", async () => {
    const dir = files();
    const two = await run([...SUM_BY_COUNTRY, "--filter", "Country=Germany", "--filter", "country=Spain"], { cwd: dir });
    assert.equal(two.code, 0, two.stderr);
    assert.deepEqual(lines(two.stdout), ["Country,Sum of Units", "Germany,7", "Spain,5", "Grand Total,12"]);
    const both = await run([...SUM_BY_COUNTRY, "--filter", "Country=Germany", "--filter", "Region=North"], { cwd: dir });
    assert.equal(both.code, 0, both.stderr);
    assert.deepEqual(lines(both.stdout), ["Country,Sum of Units", "Germany,3", "Grand Total,3"]);
    // a number and a date are written as the data shows them
    const number = await run([...SUM_BY_COUNTRY, "--filter", "Units=4"], { cwd: dir });
    assert.deepEqual(lines(number.stdout), ["Country,Sum of Units", "Germany,4", "Grand Total,4"]);
    const date = await run([...SUM_BY_COUNTRY, "--filter", "Month=2025-03-01"], { cwd: dir });
    assert.deepEqual(lines(date.stdout), ["Country,Sum of Units", "Italy,7", "Spain,5", "Grand Total,12"]);
    const yes = await run([...SUM_BY_COUNTRY, "--filter", "Paid=true"], { cwd: dir });
    assert.deepEqual(lines(yes.stdout), ["Country,Sum of Units", "Germany,3", "Spain,5", "Grand Total,8"]);
});

test("an item spelt otherwise than the data spells it is a warning with the item meant, said once", async () => {
    const dir = files();
    const lower = await run([...SUM_BY_COUNTRY, "--filter", "Country=germany"], { cwd: dir });
    assert.equal(lower.code, 0, lower.stderr);
    // the hint comes from the finding's suggestion, once (core's message names no item meant)
    assert.match(lower.stderr, /^warning itemCase at filters\[0\]\.items: .*\(did you mean "Germany"\?\)$/m);
    assert.equal(lower.stderr.match(/did you mean/g)?.length, 1);
    const typo = await run([...SUM_BY_COUNTRY, "--filter", "Country=Germny"], { cwd: dir });
    assert.equal(typo.code, 0, typo.stderr);
    assert.match(typo.stderr, /^warning itemUnknown at filters\[0\]\.items: .*\(did you mean "Germany"\?\)$/m);
    // with --strict a warning fails the run, so a misspelt item never gives a silent table of zeros in CI
    const strict = await run([...SUM_BY_COUNTRY, "--filter", "Country=Germny", "--strict"], { cwd: dir });
    assert.equal(strict.code, 1);
    // an item that is right gives no warning, also with --strict
    const right = await run([...SUM_BY_COUNTRY, "--filter", "Country=Germany", "--strict"], { cwd: dir });
    assert.equal(right.code, 0, right.stderr);
    assert.equal(right.stderr, "");
});

test("--filter splits at the = after a field of the data, so names and items may hold =", async () => {
    const dir = files();
    const r = await run([...SUM_BY_COUNTRY, "--filter", "a=b=x=1"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(lines(r.stdout), ["Country,Sum of Units", "France,2", "Germany,3", "Grand Total,5"]);
});

test("with fields a and a=b, the first = after a field's name wins: a=b=x=1 filters a on b=x=1", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "data.csv"), "Country,Units,a,a=b\nGermany,3,b=x=1,y\nFrance,2,c,x=1\n");
    const r = await run([...SUM_BY_COUNTRY, "--filter", "a=b=x=1", "--save-view", "tie.pivotkit.json"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    const saved = JSON.parse(readFileSync(join(dir, "tie.pivotkit.json"), "utf8"));
    assert.deepEqual(saved.view.filters.map((f) => [f.field, f.items]), [["a", ["b=x=1"]]]);
    assert.deepEqual(lines(r.stdout), ["Country,Sum of Units", "Germany,3", "Grand Total,3"]);
});

test("a misspelt field is the data mismatch of any view, with the field meant", async () => {
    const dir = files();
    const r = await run([...SUM_BY_COUNTRY, "--filter", "Contry=Germany"], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^error dataMismatch: /m);
    assert.match(r.stderr, /missing: "Contry" \(did you mean "Country"\?\)/);
});

test("an item of a number field that is none of its values names no item: noRowsKept says the table is empty", async () => {
    const dir = files();
    const r = await run([...SUM_BY_COUNTRY, "--filter", "Units=99"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /^warning noRowsKept: /m);
    assert.doesNotMatch(r.stderr, /itemUnknown/);
});

test("a JSON filter stays its own filter next to short forms of the same field: the rows all of them keep", async () => {
    const dir = files();
    writeFileSync(join(dir, "spain.json"), JSON.stringify({ field: "Country", type: "in", items: ["Spain", "Germany"] }));
    const both = await run([...SUM_BY_COUNTRY, "--filter", "@spain.json", "--filter", "Country=Germany", "--filter", "Country=Italy"], { cwd: dir });
    assert.equal(both.code, 0, both.stderr);
    assert.deepEqual(lines(both.stdout), ["Country,Sum of Units", "Germany,7", "Grand Total,7"]);
    const none = await run([...SUM_BY_COUNTRY, "--filter", '{"field":"Country","type":"in","items":["Spain"]}', "--filter", "Country=Germany"], { cwd: dir });
    assert.equal(none.code, 0, none.stderr);
    assert.match(none.stderr, /^warning noRowsKept: /m);
});

test("--filter with --save-view: the saved view holds the filter as JSON and renders the same", async () => {
    const dir = files();
    const r = await run([...SUM_BY_COUNTRY, "--filter", "Country=Germany", "--filter", "Country=Spain", "--save-view", "v.pivotkit.json"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    const saved = JSON.parse(readFileSync(join(dir, "v.pivotkit.json"), "utf8"));
    assert.deepEqual(
        saved.view.filters.map((f) => [f.field, f.type, f.items]),
        [["Country", "in", ["Germany", "Spain"]]]
    );
    const again = await run(["render", "v.pivotkit.json", "--data", "data.csv", "-f", "csv"], { cwd: dir });
    assert.equal(again.stdout, r.stdout);
});

test("describe --suggest takes the short form too", async () => {
    const dir = files();
    const r = await run(["describe", "data.csv", "--suggest", "--rows", "Country", "--filter", "Country=Italy", "-o", "d.pivotkit.json"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    const saved = JSON.parse(readFileSync(join(dir, "d.pivotkit.json"), "utf8"));
    assert.deepEqual(saved.view.filters.map((f) => [f.field, f.type, f.items]), [["Country", "in", ["Italy"]]]);
});

test("a --filter in neither form says both forms, with an example of each", async () => {
    const dir = files();
    const r = await run([...SUM_BY_COUNTRY, "--filter", "Germany"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--filter "Germany": give Field=Item, as in --filter "Country=Germany", or a filter as JSON/);
    assert.match(r.stderr, /\{"field":"Region","type":"in","items":\["North"\]\}/);
    // an item missing, a field missing
    const noItem = await run([...SUM_BY_COUNTRY, "--filter", "Country="], { cwd: dir });
    assert.equal(noItem.code, 2);
    assert.match(noItem.stderr, /--filter "Country=": give the item after =/);
    const noField = await run([...SUM_BY_COUNTRY, "--filter", "=Germany"], { cwd: dir });
    assert.equal(noField.code, 2);
    assert.match(noField.stderr, /--filter "=Germany": give the field before =/);
    // broken JSON stays a JSON error with its position
    const broken = await run([...SUM_BY_COUNTRY, "--filter", '{"field":"Country",}'], { cwd: dir });
    assert.equal(broken.code, 2);
    assert.match(broken.stderr, /--filter: not JSON \(at character \d+\)/);
});

test("a comparison or a negation in the short form is refused with the JSON filter it means", async () => {
    const dir = files();
    const cases = [
        ["Units>3", '{"field":"Units","type":"compare","op":">","value":3}'],
        ["Units>=3", '{"field":"Units","type":"compare","op":">=","value":3}'],
        ["Units<=3", '{"field":"Units","type":"compare","op":"<=","value":3}'],
        ["Month<2025-02-01", '{"field":"Month","type":"compare","op":"<","value":"2025-02-01"}'],
        ["Country!=Germany", '{"field":"Country","type":"in","items":["Germany"],"not":true}'],
        ["Country<>Germany", '{"field":"Country","type":"in","items":["Germany"],"not":true}']
    ];
    for (const [given, meant] of cases) {
        const r = await run([...SUM_BY_COUNTRY, "--filter", given], { cwd: dir });
        assert.equal(r.code, 2, given);
        assert.match(r.stderr, /the short form keeps one item: Field=Item/, given);
        assert.ok(r.stderr.includes(meant), `${given}: ${r.stderr}`);
        // the example works as written
        const json = await run([...SUM_BY_COUNTRY, "--filter", meant], { cwd: dir });
        assert.equal(json.code, 0, `${meant}: ${json.stderr}`);
    }
});

test("the JSON filter meant is whole for long names; a very long one points to the reference", async () => {
    const dir = files();
    const long = "G".repeat(80);
    const r = await run([...SUM_BY_COUNTRY, "--filter", `Country!=${long}`], { cwd: dir });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.includes(JSON.stringify({ field: "Country", type: "in", items: [long], not: true })), r.stderr);
    const huge = await run([...SUM_BY_COUNTRY, "--filter", `Country!=${"G".repeat(300)}`], { cwd: dir });
    assert.equal(huge.code, 2);
    assert.ok(huge.stderr.includes(`the short form keeps one item: Field=Item. For this filter give JSON as a view writes it: see ${DOCS}reference/cli/#layout-flags`), huge.stderr);
});

test("a field name that starts with { or [ takes the JSON path, and its error says so", async () => {
    const dir = files();
    const r = await run([...SUM_BY_COUNTRY, "--filter", "[Q]=1"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--filter: not JSON.*; a field name that starts with \{ or \[ needs a JSON filter/);
    // broken JSON with an = inside a string is broken JSON, not a field name: no false cause
    const broken = await run([...SUM_BY_COUNTRY, "--filter", '{"field":"A","items":["x=y"]'], { cwd: dir });
    assert.equal(broken.code, 2);
    assert.match(broken.stderr, /--filter: not JSON/);
    assert.doesNotMatch(broken.stderr, /field name that starts with/);
});

test("an operator form without a field or an item gets the plain Field=Item message", async () => {
    const dir = files();
    for (const given of ["<>x", "a<>", ">3", "Units>", "Country!=", "Units>="]) {
        const r = await run([...SUM_BY_COUNTRY, "--filter", given], { cwd: dir });
        assert.equal(r.code, 2, given);
        assert.match(r.stderr, /give Field=Item, as in --filter "Country=Germany"/, `${given}: ${r.stderr}`);
        assert.doesNotMatch(r.stderr, /For this filter give JSON/, given);
    }
});

test("a number in the short form's comparison is a number in the JSON meant, in any notation", async () => {
    const dir = files();
    // decimal notation only: 0x10 stays text; spaces around the operator are not part of the names
    for (const [given, value] of [["Units>1e3", 1000], ["Units<.5", 0.5], ["Units>=-2", -2], ["Units>0x10", "0x10"], ["Units >= 3", 3], ["Units > +2.5E1", 25]]) {
        const r = await run([...SUM_BY_COUNTRY, "--filter", given], { cwd: dir });
        assert.equal(r.code, 2, given);
        const json = /give JSON: (\{.*\});/.exec(r.stderr)?.[1];
        assert.equal(JSON.parse(json ?? "null")?.value, value, `${given}: ${r.stderr}`);
        assert.equal(JSON.parse(json ?? "null")?.field, "Units", `${given}: ${r.stderr}`);
    }
});

test("an aggregator of another tool gets the name pivotkit uses: avg is average", async () => {
    const dir = files();
    const r = await run(["render", "data.csv", "--rows", "Country", "--values", "avg:Units"], { cwd: dir });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /"avg" is no aggregator; did you mean average\?/);
    const mean = await run(["render", "data.csv", "--rows", "Country", "--values", "Mean:Units"], { cwd: dir });
    assert.match(mean.stderr, /"Mean" is no aggregator; did you mean average\?/);
});

test("render --help shows the short form and the JSON form of --filter", async () => {
    const help = await run(["render", "--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /--filter <field=item\|json>/);
    assert.match(help.stdout, /Country=Germany/);
});
