// The text exports for a reader rather than a spreadsheet: numbers as the view shows them (numbers:
// "shown", no float noise), one header row (flatHeader) and the JSON without indentation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, reportLabels, toGrid } from "../src/index.js";
import { toCsv, toJson } from "../src/export.js";

/** 64 rows of 0.1 and 0.2: their sum is 9.599999999999994 in floating point, not 9.6. */
const ROWS = Array.from({ length: 64 }, (_, i) => ({ Region: ["East", "North"][(i >> 1) % 2], Product: ["A", "B"][(i >> 2) % 2], Amount: [0.1, 0.2][i % 2] }));
const data = encode(ROWS);
const gridOf = (view, locale = "en-US") => toGrid(computePivot(data, view, { locale }), { locale, labels: reportLabels(locale) });
const BY_REGION = { rows: ["Product"], cols: ["Region"], values: [{ field: "Amount", agg: "sum", format: "currency:eur" }] };

test("CSV numbers: full keeps the float noise of a sum; shown rounds every number to the decimals its format shows", () => {
    const grid = gridOf(BY_REGION);
    assert.match(toCsv(grid), /Grand Total,4\.8,4\.8,9\.59999999999999\r\n$/, "full precision is the default");
    assert.match(toCsv(grid, { numbers: "shown" }), /Grand Total,4\.8,4\.8,9\.6\r\n$/);
    // an average's automatic format shows two decimals; a percent stays in percent with "%"
    const average = gridOf({ rows: ["Product"], values: [{ field: "Amount", agg: "average" }, { field: "Amount", agg: "sum", showAs: { type: "percentOfGrandTotal" } }] });
    assert.equal(toCsv(average, { numbers: "shown" }).split("\r\n")[1], "A,0.15,50%");
    // a value with three decimals in a number:3 format keeps them
    const three = encode([{ R: "x", V: 1.2345 }, { R: "x", V: 1 / 3 }]);
    const g3 = toGrid(computePivot(three, { rows: ["R"], values: [{ field: "V", agg: "sum", format: "number:3" }] }, { locale: "en-US" }), { locale: "en-US" });
    assert.equal(toCsv(g3, { numbers: "shown" }).split("\r\n")[1], "x,1.568");
});

test("CSV numbers shown: the locale's decimal mark and separator, its labels", () => {
    const csv = toCsv(gridOf(BY_REGION, "de-DE"), { numbers: "shown" });
    assert.equal(csv.split("\r\n").at(-2), "Gesamtergebnis;4,8;4,8;9,6");
});

test("CSV flatHeader: one header row, the column's labels without the value's name when the view has one value", () => {
    const grid = gridOf(BY_REGION);
    assert.equal(toCsv(grid).split("\r\n").slice(0, 2).join("|"), "Region,East,North,Grand Total|Product,Sum of Amount,,", "two header rows by default");
    const flat = toCsv(grid, { flatHeader: true, numbers: "shown" }).split("\r\n");
    assert.deepEqual(flat, ["Product,East,North,Grand Total", "A,2.4,2.4,4.8", "B,2.4,2.4,4.8", "Grand Total,4.8,4.8,9.6", ""]);
    // two values: each column says its value after its column labels
    const two = gridOf({ rows: ["Product"], cols: ["Region"], values: [{ field: "Amount", agg: "sum" }, { field: "Amount", agg: "count" }] });
    assert.equal(toCsv(two, { flatHeader: true }).split("\r\n")[0], "Product,East / Sum of Amount,East / Count of Amount,North / Sum of Amount,North / Count of Amount,Grand Total / Sum of Amount,Grand Total / Count of Amount");
    // a grid with one header row already is the same either way
    const one = gridOf({ rows: ["Product"], values: [{ field: "Amount", agg: "sum" }] });
    assert.equal(toCsv(one, { flatHeader: true }), toCsv(one));
});

test("JSON: numbers shown rounds as the CSV does; space 0 writes it on one line", () => {
    const grid = gridOf(BY_REGION);
    assert.deepEqual(JSON.parse(toJson(grid)).rows.at(-1).values, [4.8, 4.8, 9.59999999999999]);
    const shown = toJson(grid, { numbers: "shown", space: 0 });
    assert.ok(!shown.includes("\n"));
    assert.deepEqual(JSON.parse(shown).rows.at(-1).values, [4.8, 4.8, 9.6]);
    // a percent stays the fraction, rounded to what the table shows
    const share = gridOf({ rows: ["Product"], values: [{ field: "Amount", agg: "sum", showAs: { type: "percentOfGrandTotal" } }] });
    assert.deepEqual(JSON.parse(toJson(share, { numbers: "shown" })).rows.map((r) => r.values[0]), [0.5, 0.5, 1]);
});

test("numbers takes full or shown only", () => {
    const grid = gridOf(BY_REGION);
    assert.throws(() => toCsv(grid, { numbers: "rounded" }), /numbers/);
    assert.throws(() => toJson(grid, { numbers: true }), /numbers/);
});

test("CSV in a locale with its own digits (ar-EG): Latin digits, a \".\" decimal mark and \",\" between cells", () => {
    const grid = gridOf({ rows: ["Product"], values: [{ field: "Amount", agg: "average" }] }, "ar-EG");
    for (const numbers of /** @type {const} */ (["full", "shown"])) {
        const lines = toCsv(grid, { numbers }).split("\r\n");
        assert.match(lines[1], /^[^,]+,0\.15$/, numbers);
        assert.doesNotMatch(toCsv(grid, { numbers }), /[٠-٩٫]/, "no Arabic-Indic digit or decimal mark in a number");
    }
});

test("shown for a format without plain decimals (compact, bytes, duration): about 12 significant digits", () => {
    const grid = gridOf({ rows: ["Product"], cols: ["Region"], values: [{ field: "Amount", agg: "sum", format: "compact" }] });
    assert.match(toCsv(grid), /9\.59999999999999\r\n$/);
    assert.match(toCsv(grid, { numbers: "shown" }), /,9\.6\r\n$/);
    assert.equal(JSON.parse(toJson(grid, { numbers: "shown" })).rows.at(-1).values.at(-1), 9.6);
});
