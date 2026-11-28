# pivotkit-core

The pivot engine of [pivotkit](https://pivotkit.eize.dev/), a pivot report builder for the web with
Excel's PivotTable as the reference. It turns your rows into pivot tables, and those into a grid,
chart options or files. It is plain JavaScript without a UI. The whole report is a view, a small JSON
object you can save and share.

![The pivot report with real weather data: field list, the Filters, Columns, Rows and Values zones, and the average temperature of 14 cities by month as a colour scale](https://pivotkit.eize.dev/assets/screenshots/report-light.png)

<sub>The report builder of pivotkit-react and pivotkit-element, computed by pivotkit-core. Weather
data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/));
contains modified Copernicus Climate Change Service information
([attribution](https://pivotkit.eize.dev/learn/#query-it-live)).</sub>

## Install

```bash
npm install pivotkit-core
```

- ES modules only, no `require`.
- Node 24 or later. Browsers from Chrome 111, Firefox 113 and Safari 16.4.
- The only dependency is [fflate](https://github.com/101arrowz/fflate) (MIT). Only the
  `pivotkit-core/export` and `pivotkit-core/link` entries load it.
- The package includes TypeScript declarations.
- `pivotkit-core/import` reads CSV and JSON files into a table. For Excel workbooks, add the plugin
  [pivotkit-xlsx](https://www.npmjs.com/package/pivotkit-xlsx).

pivotkit is 0.x: a minor release can break things. [Versioning](https://pivotkit.eize.dev/versioning/)
says how each break is marked, [Upgrading](https://pivotkit.eize.dev/getting-started/upgrading/) what to do.

## Example

```js
import { encode, normalize, computePivot, toGrid, toEChartsOption } from "pivotkit-core";
import { toXlsx, toCsv } from "pivotkit-core/export";

const data = encode([
    { Region: "North", Product: "A", Units: 3, Date: "2026-01-05" },
    { Region: "South", Product: "B", Units: 7, Date: "2026-02-14" }
]);

// the view is the report as JSON: save it, send it to the browser, undo it
const input = {
    rows: ["Region"],
    cols: ["Month"],
    derived: [{ name: "Month", field: "Date", by: "yearMonth" }],
    values: [{ field: "Units", agg: "sum", format: "number:0" }]
};

const { view, issues } = normalize(input, data); // issues: what was dropped, with its path
const result = computePivot(data, view);          // normalizes again, so raw user input is fine too
const grid = toGrid(result);                      // grid.rows[r][c]: { text, value, rowSpan, colSpan, total, ... }
const xlsx = toXlsx(grid);                        // Uint8Array, opens in Excel, LibreOffice and Numbers
const csv = toCsv(grid);
const option = toEChartsOption(result, { chart: { type: "bar", stacked: true } });
```

## What it does

- Encodes your rows and computes pivot tables with subtotals and totals.
- Supports "show values as", filters, date grouping and number ranges.
- Gives a grid with merged headers for any table renderer.
- Gives chart options for Apache ECharts.
- Exports XLSX, CSV and JSON.

## Where in the docs

| Topic | Page |
| --- | --- |
| Getting started | [Engine guide](https://pivotkit.eize.dev/getting-started/engine/) |
| Reference | [Core API](https://pivotkit.eize.dev/reference/core/), [Import and plugins](https://pivotkit.eize.dev/reference/import/), [View file format](https://pivotkit.eize.dev/reference/view-file/) |
| Concepts | [Views](https://pivotkit.eize.dev/concepts/views/), [Values](https://pivotkit.eize.dev/concepts/values/), [Dates](https://pivotkit.eize.dev/concepts/dates/), [Filters](https://pivotkit.eize.dev/concepts/filters/), [Charts](https://pivotkit.eize.dev/concepts/charts/) |
| Security and compatibility | [Security](https://pivotkit.eize.dev/security/), [Browser support](https://pivotkit.eize.dev/browser-support/), [Limits](https://pivotkit.eize.dev/concepts/limits/) |
| Changelog | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-core/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
