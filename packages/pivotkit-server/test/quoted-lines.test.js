// A quoted value that spans lines in a text file (CSV, TSV, TXT) of a source that keeps a field back:
// an unclosed quote pulls the rows after it into one shown cell, hidden values with them, so such a
// file is refused for callers who do not see every field as show (data.js withoutQuotedLines).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConfig } from "pivotkit-server";
import { call, factsOf, restServer, workspace } from "./helpers.js";

/** The review's probe: the quote before South is never closed where it should be. */
const PROBE = 'Region,Secret,Sales\nNorth,hid-1,10\n"South,hid-2,20\nWest,hid-3,30\nEast,"hid-4",40\nNorth,hid-5,50\n';

/** Two stray quotes that pair up on a separator: the value closes on a comma, the rows between still move. */
const PAIRED = 'Region,Secret,Sales\nNorth,hid-1,10\n"South,hid-2,20\nWest",hid-3,30\nNorth,hid-5,50\n';

/** A quoted value with a line break that is meant: an address over two lines. */
const MEANT = 'Region,Secret,Sales\nNorth,hid-1,10\n"South\nside",hid-2,20\n';

const HIDDEN = { default: "show", fields: { Secret: "hide" } };

/** describe and a render by Region of `people.<ext>` under `policy`: the statuses and the text a caller gets. */
async function answers(name, bytes, policy) {
    const dir = workspace({ [name]: bytes });
    const server = await restServer({ sources: { people: { file: `data/${name}`, policy } }, output: { dir: "out" }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        const region = await call(`${server.api}/views/render`, { body: { source: "people", view: { rows: ["Region"], values: [{ agg: "count" }] }, format: "json" } });
        return { described, region, text: JSON.stringify(described.data) + JSON.stringify(region.data) };
    } finally {
        await server.close();
    }
}

test("the review's probe: a source that hides Secret is refused, and no hidden value reaches describe or a render", async () => {
    const got = await answers("people.csv", PROBE, HIDDEN);
    assert.doesNotMatch(got.text, /hid-[2-5]/, got.text);
    assert.equal(got.described.status, 422, got.text);
    assert.equal(got.described.data.code, "INVALID_FILE");
    assert.equal(got.described.data.detail, "people: a quoted value that starts in line 3 spans several lines; an unclosed quote can pull the rows after it, hidden values too, into one cell, so a source that hides a field is not read from this file; close the quote, or save the file as xlsx or JSON");
    assert.equal(got.region.status, 422);
});

test("two stray quotes that close on a separator are refused too, and so is a line break that is meant (fail closed)", async () => {
    for (const csv of [PAIRED, MEANT]) {
        const got = await answers("people.csv", csv, HIDDEN);
        assert.equal(got.described.status, 422, csv);
        assert.doesNotMatch(got.text, /hid-[2-5]/, csv);
    }
});

test("summary and values fields count as kept back; a source that shows every field reads such a file as before", async () => {
    for (const level of ["summary", "values"]) {
        assert.equal((await answers("people.csv", PROBE, { default: "show", fields: { Secret: level } })).described.status, 422, level);
    }
    const open = await answers("people.csv", MEANT, { default: "show" });
    assert.equal(open.described.status, 200, open.text);
    assert.equal(open.described.data.rows, 2);
});

test("the file is split as the reader splits it: semicolons, tabs, CRLF, a byte order mark, sep=, UTF-16", async () => {
    const semicolons = PROBE.replaceAll(",", ";");
    const cases = {
        "semicolons.csv": semicolons,
        "tabs.tsv": PROBE.replaceAll(",", "\t"),
        "crlf.csv": PROBE.replaceAll("\n", "\r\n"),
        "bom.csv": `\uFEFF${PROBE}`,
        "hint.csv": `sep=;\n${semicolons}`,
        // a control character as the separator: the reader's note drops it from its text, the sep= line names it
        "control.csv": `sep=\u0001\n${PROBE.replaceAll(",", "\u0001")}`,
        "utf16.csv": Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(PROBE, "utf16le")])
    };
    for (const [name, bytes] of Object.entries(cases)) {
        const got = await answers(name, bytes, HIDDEN);
        assert.equal(got.described.status, 422, `${name}: ${got.text}`);
        assert.doesNotMatch(got.text, /hid-[2-5]/, name);
    }
    // a quote inside a value (not at its start) opens nothing: the reader keeps it as text
    const inside = await answers("inside.csv", 'Region,Secret,Sales\nNo"rth,hid-1,10\nSouth,hid-2,20\n', HIDDEN);
    assert.equal(inside.described.status, 200, inside.text);
    // a quoted value on one line is fine
    const oneLine = await answers("quoted.csv", 'Region,Secret,Sales\n"North, upper",hid-1,10\nSouth,hid-2,20\n', HIDDEN);
    assert.equal(oneLine.described.status, 200, oneLine.text);
    assert.equal(oneLine.described.data.rows, 2);
});

test("check-config warns of such a file for a source that keeps a field back, and its CSV hint names the case", async () => {
    const dir = workspace({ "people.csv": PROBE });
    const closed = factsOf((await checkConfig({ sources: { people: { file: "data/people.csv", policy: HIDDEN } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(closed, /^WARNING \(Sources\): sources\.people: a quoted value that starts in line 3 spans several lines; the source is refused for callers who do not see every field as show \(an unclosed quote can pull the rows after it, hidden values too, into one cell\)$/m);
    assert.match(closed, /a value kept back is safe in CSV only when values that hold the separator are quoted and no quoted value spans lines; xlsx or JSON is safer/);
    const open = factsOf((await checkConfig({ sources: { people: { file: "data/people.csv", policy: { default: "show" } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(open, /spans several lines/);
});
