import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computePivot, encode, toGrid } from "../src/index.js";
import { parseIso } from "../src/time.js";

const index = fileURLToPath(new URL("../src/index.js", import.meta.url));

// The same rows pivoted in a child process per machine time zone and locale; the output must not change.
const script = `
const { encode, computePivot, toGrid } = await import(${JSON.stringify(index)});
const rows = [
    { d: "2026-03-04T23:30:00-05:00", v: 1 },
    { d: "2026-03-04T23:30:00", v: 2 },
    { d: new Date("2026-03-05T00:30:00+01:00"), v: 3 }
];
const data = encode(rows);
const result = computePivot(data, { derived: [{ name: "Day", field: "d", by: "day" }, { name: "Hour", field: "d", by: "hour" }], rows: ["Day", "Hour"], values: [{ field: "v", agg: "sum" }, { field: "d", agg: "max" }] });
const grid = toGrid(result);
console.log(JSON.stringify({ values: [...data.column("d").values], text: grid.rows.map((r) => r.map((c) => c && c.text)) }));
`;

function runIn(env) {
    return execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, ...env }, encoding: "utf8" });
}

test("pivots do not depend on the machine's time zone or locale", () => {
    const outputs = [
        { TZ: "UTC", LANG: "en_US.UTF-8" },
        { TZ: "America/New_York", LANG: "de_DE.UTF-8" },
        { TZ: "Asia/Kolkata", LANG: "ja_JP.UTF-8" },
        { TZ: "Pacific/Chatham", LANG: "fr_FR.UTF-8" }
    ].map(runIn);
    for (const out of outputs.slice(1)) {
        assert.equal(out, outputs[0]);
    }
    const { values } = JSON.parse(outputs[0]);
    // offsets convert to UTC, the string without an offset stays as written
    assert.deepEqual(values, [Date.UTC(2026, 2, 5, 4, 30), Date.UTC(2026, 2, 4, 23, 30), Date.UTC(2026, 2, 4, 23, 30)]);
});

test("a chosen time zone reads instants at its wall clock, daylight saving included", () => {
    const rows = [
        { d: new Date("2026-01-15T12:00:00Z") }, // EST, UTC-5
        { d: "2026-07-15T12:00:00Z" }, // EDT, UTC-4
        { d: "2026-03-08T06:59:00Z" }, // 01:59 EST, a minute before the switch
        { d: "2026-03-08T07:00:00Z" }, // 03:00 EDT
        { d: "2026-07-15T12:00:00" } // no offset: as written in any zone
    ];
    const data = encode(rows, { timeZone: "America/New_York" });
    assert.equal(data.timeZone, "America/New_York");
    assert.deepEqual([...data.column("d").values], [
        Date.UTC(2026, 0, 15, 7),
        Date.UTC(2026, 6, 15, 8),
        Date.UTC(2026, 2, 8, 1, 59),
        Date.UTC(2026, 2, 8, 3),
        Date.UTC(2026, 6, 15, 12)
    ]);
    assert.equal(encode(rows).timeZone, "UTC");
    assert.equal(encode(rows, { timeZone: "utc" }).timeZone, "UTC");
    // "local" is resolved to the machine's zone by name, so the data says what it used
    assert.match(encode(rows, { timeZone: "local" }).timeZone, /\w/);
    assert.notEqual(encode(rows, { timeZone: "local" }).timeZone, "local");
});

test("the view keeps the time zone it was made for and the pivot reports a mismatch", () => {
    const view = { rows: ["d"], formatting: { timeZone: "europe/berlin" } };
    const berlin = computePivot(encode([{ d: "2026-01-01" }], { timeZone: "Europe/Berlin" }), view);
    assert.equal(berlin.view.formatting.timeZone, "Europe/Berlin");
    assert.deepEqual(berlin.issues, []);
    assert.equal(berlin.timeZone, "Europe/Berlin");
    assert.equal(toGrid(berlin).timeZone, "Europe/Berlin");
    const utc = computePivot(encode([{ d: "2026-01-01" }]), view);
    assert.deepEqual(utc.issues.map((i) => i.path), ["formatting.timeZone"]);
    const bad = computePivot(encode([{ d: "2026-01-01" }]), { formatting: { timeZone: "Mars/Olympus" } });
    assert.equal(bad.view.formatting.timeZone, null);
    assert.deepEqual(bad.issues.map((i) => i.path), ["formatting.timeZone"]);
});

test("ISO times that do not exist are text; years before 100 are dates", () => {
    for (const s of ["2026-03-04T10:61:00", "2026-03-04T24:00:00", "2026-03-04T10:00:60", "2026-13-01", "2026-02-30", "2026-03-04T10:00:00+25:00"]) {
        assert.equal(parseIso(s), null, s);
        assert.equal(encode([{ d: s }]).column("d").type, "string", s);
    }
    assert.equal(encode([{ d: "0050-01-01" }]).column("d").values[0], -60589296000000);
    assert.deepEqual(parseIso("2026-03-04T10:00:00+0530"), { ms: Date.UTC(2026, 2, 4, 10), offsetMinutes: 330 });
    assert.deepEqual(parseIso("2026-03-04 10:00:00.123456789Z"), { ms: Date.UTC(2026, 2, 4, 10, 0, 0, 123), offsetMinutes: 0 });
});

test("relative date ranges read today in the data's zone, not the machine's", () => {
    // 03:00 UTC on New Year's Day: still 2025 on a machine in New York, already 2026 in UTC data
    const relative = `
const { encode, computePivot, relativeDateRange } = await import(${JSON.stringify(index)});
const data = encode([{ d: "2025-12-31", v: 1 }, { d: "2026-01-01", v: 2 }]);
const now = new Date("2026-01-01T03:00:00Z");
const r = computePivot(data, { values: [{ field: "v", agg: "sum" }], filters: [{ field: "d", type: "relative", unit: "year", count: 1 }] }, { now });
console.log(JSON.stringify([r.value(r.rowRoot, r.colRoot, 0), relativeDateRange("day", 1, { now })]));
`;
    const run = (TZ) => execFileSync(process.execPath, ["--input-type=module", "-e", relative], { env: { ...process.env, TZ }, encoding: "utf8" });
    const outputs = ["UTC", "America/New_York", "Pacific/Kiritimati"].map(run);
    assert.deepEqual(JSON.parse(outputs[0]), [2, { from: "2026-01-01", to: "2026-01-01" }]);
    for (const out of outputs.slice(1)) {
        assert.equal(out, outputs[0]);
    }
});
