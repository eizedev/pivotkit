# pivotkit-core

The pivot engine of [pivotkit](https://pivotkit.eize.dev/), a pivot report builder for the web with
Excel's PivotTable as the reference. Plain JavaScript without UI: it encodes your rows and computes
pivot tables with subtotals and totals, "show values as", filters, date grouping and number ranges;
it gives a grid with merged headers for any table renderer, chart options for Apache ECharts, and
XLSX, CSV and JSON export. The whole report is a view, a small JSON object you can save and share.

![The pivot report with real weather data: field list, the Filters, Columns, Rows and Values zones, and the average temperature of 14 cities by month as a colour scale](https://pivotkit.eize.dev/assets/screenshots/report-light.png)

<sub>The report builder of pivotkit-react and pivotkit-element, computed by pivotkit-core. Weather
data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/));
contains modified Copernicus Climate Change Service information
([attribution](https://pivotkit.eize.dev/learn/#query-it-live)).</sub>

## Install

```bash
npm install pivotkit-core
```

ES modules (no `require`) for Node 22 or later and browsers from Chrome 111, Firefox 113 and
Safari 16.4. The only dependency is
[fflate](https://github.com/101arrowz/fflate) (MIT), loaded only by the `pivotkit-core/export` and
`pivotkit-core/link` entries. TypeScript declarations are included. `pivotkit-core/import` reads CSV
and JSON files into a table; Excel workbooks with the plugin
[pivotkit-xlsx](https://www.npmjs.com/package/pivotkit-xlsx).

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

## Where in the docs

| Topic | Page |
| --- | --- |
| Getting started: rows to a table, drawing the grid, on a server | [Getting started with the engine](https://pivotkit.eize.dev/getting-started/engine/) |
| Loading CSV, JSON and (with a plugin) Excel files | [Loading files](https://pivotkit.eize.dev/reference/import/), [Plugins](https://pivotkit.eize.dev/reference/plugins/) |
| Every function, constant and type | [pivotkit-core reference](https://pivotkit.eize.dev/reference/core/): [data](https://pivotkit.eize.dev/reference/core/#data), [views](https://pivotkit.eize.dev/reference/core/#views), [pivot](https://pivotkit.eize.dev/reference/core/#pivot), [output and export](https://pivotkit.eize.dev/reference/core/#output), [helpers](https://pivotkit.eize.dev/reference/core/#helpers), [types](https://pivotkit.eize.dev/reference/core/#types) |
| The view and every key | [Views and saved views](https://pivotkit.eize.dev/concepts/views/#a-complete-view) |
| Aggregators, show as, formats | [Values](https://pivotkit.eize.dev/concepts/values/) |
| Date grouping and number ranges | [Dates and number ranges](https://pivotkit.eize.dev/concepts/dates/) |
| Filters, top N, sorting | [Filters, top N and sorting](https://pivotkit.eize.dev/concepts/filters/) |
| Chart options | [Charts](https://pivotkit.eize.dev/concepts/charts/) |
| View files, links, templates | [View file format](https://pivotkit.eize.dev/reference/view-file/), [Sharing](https://pivotkit.eize.dev/concepts/sharing/), [Templates](https://pivotkit.eize.dev/concepts/templates/) |
| Locale and time zones | [Locale](https://pivotkit.eize.dev/concepts/limits/#locale), [Time zones](https://pivotkit.eize.dev/concepts/limits/#time-zones) |
| Labels and chart colours | [Localisation](https://pivotkit.eize.dev/reference/localisation/), [Chart colours](https://pivotkit.eize.dev/reference/theming/#chart-colours) |
| Limits and errors | [Limits](https://pivotkit.eize.dev/concepts/limits/#limits), [Errors](https://pivotkit.eize.dev/concepts/limits/#errors) |
| Performance | [Benchmark](https://pivotkit.eize.dev/reference/core/#performance) |
| Security: views as input, safe exports | [Security](https://pivotkit.eize.dev/security/) |
| Browser and Node support | [Browser support](https://pivotkit.eize.dev/browser-support/) |
| Recipes | [Recipes](https://pivotkit.eize.dev/embed/recipes/) |
| For the people who use a report | [Use a report](https://pivotkit.eize.dev/use/) |
| Try it | [Live demo](https://pivotkit.eize.dev/demo/), [feature list](https://pivotkit.eize.dev/features/), [FAQ](https://pivotkit.eize.dev/faq/) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-core/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
