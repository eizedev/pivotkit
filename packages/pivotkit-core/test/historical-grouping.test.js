import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toGrid, toSeries } from "../src/index.js";
import { toCsv } from "../src/export.js";

const wallDate = (year, month) => {
    const d = new Date(0);
    d.setUTCFullYear(year, month, 15);
    return d;
};

for (const by of ["yearMonth", "yearQuarter"]) {
    test(`${by} historical labels agree across table, chart and export`, () => {
        for (const locale of ["en-US", "de-DE", "en-US-u-ca-islamic-civil"]) {
            for (const year of [-99, -1, 0, 1, 99, 100, 2026]) {
                for (const month of [0, 1, 9, 11]) {
                    const source = wallDate(year, month);
                    const d = encode([{ date: source }]);
                    const r = computePivot(d, {
                        derived: [{ name: "Period", field: "date", by }], rows: ["Period"],
                        values: [{ agg: "count" }], formatting: { locale }
                    });
                    const start = new Date(source);
                    start.setUTCDate(1);
                    // a year before 1 AD with its era in both, a quarter's in the Gregorian calendar (its key's)
                    const quarterYear = year >= 1 ? String(year) : new Intl.DateTimeFormat(locale, { year: "numeric", era: "short", calendar: "gregory", timeZone: "UTC" }).format(start);
                    const expected = by === "yearQuarter" ? `Q${Math.floor(month / 3) + 1} ${quarterYear}` :
                        new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC", era: year <= 0 ? "short" : undefined }).format(start);
                    assert.equal(r.label("rows", r.rowRoot.children[0]), expected, `${locale}/${year}/${month}`);
                    assert.deepEqual(toSeries(r).categories, [expected]);
                    const grid = toGrid(r);
                    assert.ok(grid.rows.some((row) => row.some((cell) => cell.text === expected)));
                    assert.ok(toCsv(grid).includes(expected), expected);
                }
            }
        }
    });
}

test("month of year names the data's Gregorian month in every calendar, in the table, the chart and the export (#596)", () => {
    const d = encode([0, 5, 8, 11].map((month) => ({ date: wallDate(2025, month) })));
    for (const locale of ["en-US-u-ca-islamic-civil", "th-TH", "fa-IR", "en-US-u-ca-hebrew", "ja-JP-u-ca-japanese"]) {
        const r = computePivot(d, { derived: [{ name: "Month", field: "date", by: "month" }], rows: ["Month"], values: [{ agg: "count" }], formatting: { locale } });
        // the locale's language, the Gregorian calendar of the month number
        const expected = [0, 5, 8, 11].map((m) => new Intl.DateTimeFormat(locale, { month: "short", calendar: "gregory", timeZone: "UTC" }).format(Date.UTC(2025, m, 1)));
        assert.deepEqual(r.rowRoot.children.map((n) => n.key), [1, 6, 9, 12], locale);
        assert.deepEqual(r.rowRoot.children.map((n) => r.label("rows", n)), expected, locale);
        assert.deepEqual(toSeries(r).categories, expected, locale);
        const csv = toCsv(toGrid(r));
        for (const name of expected) assert.ok(csv.includes(name), `${locale}: ${name} in ${csv}`);
    }
    // the case of the report: January is January, not "Ram." (January 2000 fell in Ramadan)
    const islamic = computePivot(d, { derived: [{ name: "Month", field: "date", by: "month" }], rows: ["Month"], values: [{ agg: "count" }], formatting: { locale: "en-US-u-ca-islamic-civil" } });
    assert.deepEqual(islamic.rowRoot.children.map((n) => islamic.label("rows", n)), ["Jan", "Jun", "Sep", "Dec"]);
});
