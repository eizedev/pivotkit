import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toGrid } from "pivotkit-core";
import { decodeRow, drillRows, drillTable } from "../src/drill.js";
import { LABELS, fill, hostFailure, resolveLabels } from "../src/labels.js";
import { fromOrigin, placePopover } from "../src/place.js";
import { chartThemeFrom, resolveTheme } from "../src/theme.js";
import { sliceRows, windowOf } from "../src/virtual.js";

test("theme: an explicit theme wins, then <html data-theme>, then the system", () => {
    assert.equal(resolveTheme("dark", "light", false), "dark");
    assert.equal(resolveTheme("auto", "dark", false), "dark");
    assert.equal(resolveTheme("auto", "light", true), "light");
    assert.equal(resolveTheme("auto", null, true), "dark");
    assert.equal(resolveTheme(undefined, "unknown", false), "light");
});

test("the chart theme comes from the --pk-* tokens", () => {
    const tokens = { "--pk-chart-1": " #111111", "--pk-chart-2": "#222222", "--pk-muted": "#555", "--pk-border": "#ddd", "--pk-heat-low": "#eee", "--pk-heat-high": "#00f", "font-family": "Inter" };
    const theme = chartThemeFrom({ getPropertyValue: (n) => tokens[n] ?? "" });
    assert.deepEqual(theme.colors, ["#111111", "#222222"]);
    assert.deepEqual([theme.textColor, theme.gridColor, theme.fontFamily], ["#555", "#ddd", "Inter"]);
    assert.deepEqual(theme.heatmapColors, ["#eee", "#00f"]);
});

test("labels: the locale picks the language, partial labels merge deeply, en and de have the same keys", () => {
    assert.equal(resolveLabels("de-AT").zones.rows, "Zeilen");
    assert.equal(resolveLabels("fr-FR").zones.rows, "Rows");
    const custom = resolveLabels("de-DE", { zones: { rows: "Reihen" }, core: { grandTotal: "Summe" } });
    assert.deepEqual([custom.zones.rows, custom.zones.cols, custom.core.grandTotal, custom.core.blank], ["Reihen", "Spalten", "Summe", "(Leer)"]);
    assert.equal(resolveLabels("en", JSON.parse('{"__proto__": {"polluted": 1}}')).polluted, undefined);
    const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
    assert.deepEqual(keys(LABELS.de), keys(LABELS.en));
    assert.equal(fill("{a} of {b} {c}", { a: 1, b: "x" }), "1 of x {c}");
});

test("virtual window: rows in view plus overscan, spacers for the rest", () => {
    assert.deepEqual(windowOf({ count: 1000, scrollTop: 0, viewport: 340, rowHeight: 34, overscan: 5 }), { start: 0, end: 15, padTop: 0, padBottom: 985 * 34 });
    const w = windowOf({ count: 1000, scrollTop: 3400, viewport: 340, rowHeight: 34, overscan: 5 });
    assert.deepEqual([w.start, w.end, w.padTop], [95, 115, 95 * 34]);
    assert.equal(windowOf({ count: 10, scrollTop: 99999, viewport: 340, rowHeight: 34 }).end, 10);
});

test("a merged row label that starts above the window is drawn in its first row, cut to the window", () => {
    const rows = [];
    for (const g of ["A", "B"]) for (let i = 0; i < 5; i++) rows.push({ G: g, I: `${g}${i}`, V: i });
    const grid = toGrid(computePivot(encode(rows), { rows: ["G", "I"], values: [{ field: "V", agg: "sum" }], totals: { rowSubtotals: false, grandTotalRow: false } }));
    const slice = sliceRows(grid, 2, 4);
    const first = slice[0].cells;
    assert.equal(first[0].cell.text, "A");
    assert.equal(first[0].rowSpan, 2);
    assert.deepEqual(first.map((c) => c.col), [0, 1, 2]);
    assert.equal(slice[1].cells[0].cell.text, "A3", "the second row has no label of its own in column 0");
    const whole = sliceRows(grid, 0, 10);
    assert.equal(whole[0].cells[0].rowSpan, 5);
});

test("popover placement: below, above when there is no room, inside the viewport", () => {
    const vp = { width: 800, height: 600 };
    assert.deepEqual(placePopover({ top: 100, bottom: 130, left: 50, right: 150 }, { width: 200, height: 200 }, vp).side, "below");
    const up = placePopover({ top: 500, bottom: 530, left: 50, right: 150 }, { width: 200, height: 300 }, vp);
    assert.equal(up.side, "above");
    assert.equal(up.top, 500 - 6 - 300);
    assert.equal(placePopover({ top: 10, bottom: 40, left: 750, right: 790 }, { width: 200, height: 100 }, vp).left, 800 - 200 - 8);
    assert.equal(placePopover({ top: 10, bottom: 40, left: 600, right: 790 }, { width: 200, height: 100 }, vp, "end").left, 590);
});

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

test("drill-down table: dates as the table shows them, numbers in the locale, the host's formats", () => {
    const rows = [
        { "Ticket number": 40072, Opened: "2026-01-05", Seen: "2026-02-14T10:30:00Z", Revenue: 1234.5, Hours: 3.5, Done: true, Team: "Network" },
        { "Ticket number": 40073, Opened: null, Seen: "2026-02-15T08:00:00Z", Revenue: null, Hours: 0.25, Done: false, Team: "<b>x</b>" }
    ];
    const encoded = encode(rows, { timeZone: "Europe/Berlin" });
    const plain = drillTable(encoded, [0, 1], { locale: "en-US", labels: LABELS.en.core });
    assert.deepEqual(plain.columns.map((c) => [c.name, c.numeric]), [["Ticket number", true], ["Opened", false], ["Seen", false], ["Revenue", true], ["Hours", true], ["Done", false], ["Team", false]]);
    // an ISO date is a date, not its ISO text; a time is read on the data's wall clock (Berlin, +1 h)
    assert.deepEqual(plain.rows[0], ["40,072", "Jan 5, 2026", "Feb 14, 2026, 11:30 AM", "1,234.5", "3.5", "true", "Network"]);
    assert.deepEqual(plain.rows[1], ["40,073", "", "Feb 15, 2026, 9:00 AM", "", "0.25", "false", "<b>x</b>"]);
    // the host says how: an identifier as it is, a duration, a currency; German words and digits
    const formats = { "ticket number": "text", hours: "duration:h", revenue: "currency:EUR", seen: "date", team: "integer" };
    const de = drillTable(encoded, [0], { locale: "de-DE", labels: LABELS.de.core, formatOf: (name) => formats[name.toLowerCase()] });
    assert.deepEqual(de.rows[0], ["40072", "05.01.2026", "14.02.2026", "1.234,50\u00a0€", "3 h 30 min", "wahr", "Network"]);
    assert.equal(de.columns[0].numeric, false, "an identifier shown as text is not right-aligned");
    // a format that does not fit, or is no format, is ignored
    const odd = drillTable(encoded, [0], { locale: "en-US", labels: LABELS.en.core, formatOf: (name) => (name === "Opened" ? "currency:EUR" : name === "Revenue" ? "date" : "=cmd()") });
    assert.deepEqual(odd.rows[0].slice(1, 4), ["Jan 5, 2026", "Feb 14, 2026, 11:30 AM", "1,234.5"]);
});

test("a popover inside a transformed ancestor is placed from that ancestor's origin", () => {
    const place = { top: 300, left: 120, maxHeight: 400, side: "below" };
    assert.deepEqual(fromOrigin(place, { top: 0, left: 0 }), place);
    assert.deepEqual(fromOrigin(place, { top: 200, left: 40 }), { top: 100, left: 80, maxHeight: 400, side: "below" });
});

test("a host that refuses a template: its own message when it gives one, a plain note when not", () => {
    const { en, de } = LABELS;
    const save = (e, l = en) => hostFailure(l.toastSaveFailed, l.toastSaveRejected, e);
    assert.equal(save(new Error("Name taken")), "The template could not be saved: Name taken");
    assert.equal(save("Quota reached"), "The template could not be saved: Quota reached");
    assert.equal(save({ message: "Forbidden" }), "The template could not be saved: Forbidden");
    // nothing to show: no "undefined", no "[object Object]", no dangling colon
    for (const e of [undefined, null, new Error(""), new Error("  "), "", {}, 42, false]) {
        assert.equal(save(e), "The server could not save the template.", String(e));
    }
    assert.equal(save(undefined, de), "Der Server konnte die Vorlage nicht speichern.");
    assert.equal(hostFailure(de.toastDeleteFailed, de.toastDeleteRejected, null), "Der Server konnte die Vorlage nicht löschen.");
});
