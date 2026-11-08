---
title: Getting started with the engine
description: Use pivotkit-core without UI - encode rows, compute a pivot table, render its grid, build an ECharts option, export XLSX and CSV - in the browser or in Node.
---

# Getting started with the engine

`pivotkit-core` is the pivot engine in plain JavaScript, without UI and without a framework. Use it
to draw your own table, to build ECharts options, or to export a report on a server. It runs in
browsers and in Node 22 or later; the only dependency is [fflate](https://github.com/101arrowz/fflate)
(MIT) for the XLSX zip, loaded only by the `pivotkit-core/export` entry. TypeScript declarations are
generated from the JSDoc types.

```bash
npm install pivotkit-core
```

pivotkit-core is an ES module package (`import`, no `require`). In Node, write the examples in a
`.mjs` file or in a package with `"type": "module"` in its `package.json`.

## From rows to a table

```js
import { encode, normalize, computePivot, toGrid, toEChartsOption } from "pivotkit-core";
import { toXlsx, toCsv } from "pivotkit-core/export";

const data = encode([
    { Region: "North", Product: "A", Units: 3, Date: "2026-01-05" },
    { region: "South", product: "B", units: 7, date: "2026-02-14" }
]);

// the view is the report as JSON: save it, send it to the browser, undo it
const input = {
    rows: ["Region"],
    cols: ["Month"],
    derived: [{ name: "Month", field: "Date", by: "yearMonth" }],
    values: [{ field: "Units", agg: "sum", format: "number:0" }],
    sort: [{ field: "Region", by: "value", order: "desc" }],
    formatting: { locale: "en-US" }
};

const { view, issues } = normalize(input, data); // issues: what was dropped: path, message, code
const result = computePivot(data, view);          // normalizes again, so raw user input is fine too
const grid = toGrid(result);                      // grid.rows[r][c]: { text, value, rowSpan, colSpan, total, ... }
const xlsx = toXlsx(grid);                        // Uint8Array, opens in Excel, LibreOffice and Numbers
const csv = toCsv(grid);
const option = toEChartsOption(result, { chart: { type: "bar", stacked: true } });
```

The steps:

1. **`encode(rows)`** turns an array of objects into typed columns once: text, numbers, booleans and
   dates (including ISO strings). Column names match case-insensitively, so `Region` and `region`
   above are one field.
2. **`normalize(view, data)`** checks a view against the data: unknown fields, aggregators or formats
   are dropped and listed in `issues`, each with its path and a `code` to say it in your own words
   ([Issues](../concepts/views.md#issues-for-developers)). You do not have to call it; every function that takes a view
   normalizes it first.
3. **`computePivot(data, view)`** builds the row and column trees with subtotals and totals.
4. **`toGrid(result)`** lays the result out as table rows with merged header cells, formatted text and
   raw values, for any table renderer and for the export.
5. **`toEChartsOption(result)`** returns a plain option object for an
   [Apache ECharts](https://echarts.apache.org/) instance; pivotkit-core does not import ECharts.
6. **`toXlsx(grid)`** and **`toCsv(grid)`** export what the grid shows.

## Drawing the grid

`grid.rows` holds header rows first (`grid.headerRows` of them), then the body. A cell covered by a
merge is `null`; the others carry `rowSpan` and `colSpan`. A minimal HTML table:

```js
function renderTable(grid) {
    const table = document.createElement("table");
    grid.rows.forEach((cells, r) => {
        const tr = table.insertRow();
        for (const cell of cells) {
            if (cell === null) continue;                          // covered by a merge
            const td = document.createElement(r < grid.headerRows || cell.kind === "rowHeader" ? "th" : "td");
            td.textContent = cell.text;                            // text only, never HTML
            if (cell.rowSpan > 1) td.rowSpan = cell.rowSpan;
            if (cell.colSpan > 1) td.colSpan = cell.colSpan;
            if (cell.total) td.className = cell.total === 2 ? "grand-total" : "subtotal";
            tr.append(td);
        }
    });
    return table;
}
```

Each cell has `kind` (`"corner"`, `"colHeader"`, `"rowHeader"` or `"value"`), `total` (0 none,
1 subtotal, 2 grand total), the formatted `text` and the raw `value`; value cells also carry
`rowPath`, `colPath` and `valueIndex`, which [`cellRows`](../reference/core.md#drill-down) turns into
the source rows behind them.

## On a server

Everything except the browser download works in Node: build the workbook and send it.

```js
import { encode, computePivot, toGrid } from "pivotkit-core";
import { toXlsx } from "pivotkit-core/export";

const bytes = toXlsx(toGrid(computePivot(encode(rows), savedView)), { sheetName: "Tickets" });
response.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
response.end(bytes);
```

A view from a browser is user input. It cannot run code, and the [limits](../concepts/limits.md)
keep its memory use bounded; a view that would need more throws `PivotkitError` with the code
`LIMIT_EXCEEDED`, which a server answers with an error instead of a report.

## Next steps { #next }

- [pivotkit-core reference](../reference/core.md): every function and its options.
- [Views and saved views](../concepts/views.md): the view's keys.
- [Locale, time zones, limits and errors](../concepts/limits.md).
