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
