// The drill-down (drill.js, drill-table.js): the rows behind a value, from the host or rebuilt from
// the encoded data, and the table that shows them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode } from "pivotkit-core";
import { decodeRow, drillRows } from "../src/drill.js";
import { drillTable } from "../src/drill-table.js";
import { LABELS } from "../src/labels.js";
// the German first-load texts: pivotkit-react adds them as it loads (deferred.js)
import "../src/deferred.js";

test("drill-down: the host's rows, or rows rebuilt from encoded data, limited", () => {
    const rows = [
        { Region: "North", Units: 3, Day: "2026-01-05" },
        { Region: "South", Units: 7, Day: "2026-02-14T10:30" },
        { Region: "North", Units: null, Day: null }
    ];
    const data = encode(rows);
    const r = computePivot(data, { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] });
    const own = drillRows(r, { rowPath: ["North"], data: rows });
    assert.equal(own.count, 2);
    assert.equal(own.rows[0], rows[0], "the host's own object");
    const rebuilt = drillRows(r, { rowPath: [], limit: 2 });
    assert.deepEqual([rebuilt.count, rebuilt.rows.length], [3, 2]);
    assert.deepEqual(rebuilt.rows[1], { Region: "South", Units: 7, Day: "2026-02-14T10:30" });
    assert.deepEqual(decodeRow(data, 0), { Region: "North", Units: 3, Day: "2026-01-05" });
    assert.deepEqual([...own.indices], [0, 2]);
});

test("drill-down: a column named __proto__ is rebuilt as an own value, not as the prototype", () => {
    const data = encode(JSON.parse('[{ "__proto__": "x", "constructor": "y", "Units": 1 }]'));
    const row = decodeRow(data, 0);
    assert.ok(Object.hasOwn(row, "__proto__"));
    assert.equal(Object.getOwnPropertyDescriptor(row, "__proto__")?.value, "x");
    assert.equal(Object.getPrototypeOf(row), Object.prototype);
    assert.deepEqual(Object.keys(row), ["__proto__", "constructor", "Units"]);
    assert.equal(JSON.stringify(row), '{"__proto__":"x","constructor":"y","Units":1}');
});

test("drill-down table: dates as the table shows them, numbers in the locale, the host's formats", () => {
    const rows = [
        { "Ticket number": 40072, Opened: "2026-01-05", Seen: "2026-02-14T10:30:00Z", Revenue: 1234.5, Hours: 3.5, Done: true, Team: "Network" },
        { "Ticket number": 40073, Opened: null, Seen: "2026-02-15T08:00:00Z", Revenue: null, Hours: 0.25, Done: false, Team: "<b>x</b>" }
    ];
    const encoded = encode(rows, { timeZone: "Europe/Berlin" });
    const plain = drillTable(encoded, [0, 1], { locale: "en-US", labels: LABELS.en.core });
    assert.deepEqual(plain.columns.map((c) => [c.name, c.numeric]), [["Ticket number", true], ["Opened", false], ["Seen", false], ["Revenue", true], ["Hours", true], ["Done", false], ["Team", false]]);
    // an ISO date is a date, not its ISO text; a time is read on the data's wall clock (Berlin, +1 h)
    assert.deepEqual(plain.rows[0], ["40,072", "Jan 5, 2026", "Feb 14, 2026, 11:30 AM", "1,234.5", "3.5", "Yes", "Network"]);
    assert.deepEqual(plain.rows[1], ["40,073", "", "Feb 15, 2026, 9:00 AM", "", "0.25", "No", "<b>x</b>"]);
    // the host says how: an identifier as it is, a duration, a currency; German words and digits
    const formats = { "ticket number": "text", hours: "duration:h", revenue: "currency:EUR", seen: "date", team: "integer" };
    const de = drillTable(encoded, [0], { locale: "de-DE", labels: LABELS.de.core, formatOf: (name) => formats[name.toLowerCase()] });
    assert.deepEqual(de.rows[0], ["40072", "05.01.2026", "14.02.2026", "1.234,50\u00a0€", "3 h 30 min", "Ja", "Network"]);
    assert.equal(de.columns[0].numeric, false, "an identifier shown as text is not right-aligned");
    // a format that does not fit, or is no format, is ignored
    const odd = drillTable(encoded, [0], { locale: "en-US", labels: LABELS.en.core, formatOf: (name) => (name === "Opened" ? "currency:EUR" : name === "Revenue" ? "date" : "=cmd()") });
    assert.deepEqual(odd.rows[0].slice(1, 4), ["Jan 5, 2026", "Feb 14, 2026, 11:30 AM", "1,234.5"]);
});
