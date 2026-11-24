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

- [Getting started with the engine](https://pivotkit.eize.dev/getting-started/engine/): rows to a table, drawing the grid, on a server
- [Loading files](https://pivotkit.eize.dev/reference/import/) and [Plugins](https://pivotkit.eize.dev/reference/plugins/): CSV and JSON files, Excel files with a plugin, writing the data as a file again with `dataToCsv`
- [pivotkit-core reference](https://pivotkit.eize.dev/reference/core/): every function, constant and type, in the sections [data](https://pivotkit.eize.dev/reference/core/#data), [views](https://pivotkit.eize.dev/reference/core/#views), [pivot](https://pivotkit.eize.dev/reference/core/#pivot), [output and export](https://pivotkit.eize.dev/reference/core/#output), [helpers](https://pivotkit.eize.dev/reference/core/#helpers) and [types](https://pivotkit.eize.dev/reference/core/#types)
- [Views and saved views](https://pivotkit.eize.dev/concepts/views/#a-complete-view): the view and every key
- [Values](https://pivotkit.eize.dev/concepts/values/): aggregators, show as, formats
- [Dates and number ranges](https://pivotkit.eize.dev/concepts/dates/): date grouping and number ranges
- [Filters, top N and sorting](https://pivotkit.eize.dev/concepts/filters/)
- [Charts](https://pivotkit.eize.dev/concepts/charts/): chart options
- [View file format](https://pivotkit.eize.dev/reference/view-file/), [Sharing](https://pivotkit.eize.dev/concepts/sharing/) and [Templates](https://pivotkit.eize.dev/concepts/templates/): view files, links, templates
- [Locale](https://pivotkit.eize.dev/concepts/limits/#locale) and [Time zones](https://pivotkit.eize.dev/concepts/limits/#time-zones)
- [Localisation](https://pivotkit.eize.dev/reference/localisation/) and [Chart colours](https://pivotkit.eize.dev/reference/theming/#chart-colours): labels and chart colours
- [Limits](https://pivotkit.eize.dev/concepts/limits/#limits) and [Errors](https://pivotkit.eize.dev/concepts/limits/#errors)
- [Performance](https://pivotkit.eize.dev/reference/core/#performance): the benchmark
- [Security](https://pivotkit.eize.dev/security/): views as input, safe exports
- [Browser support](https://pivotkit.eize.dev/browser-support/): browsers and Node
- [Recipes](https://pivotkit.eize.dev/embed/recipes/)
- [Use a report](https://pivotkit.eize.dev/use/): for the people who use a report
- Try it: [Live demo](https://pivotkit.eize.dev/demo/), [feature list](https://pivotkit.eize.dev/features/), [FAQ](https://pivotkit.eize.dev/faq/)
- Changes: [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-core/CHANGELOG.md)

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
