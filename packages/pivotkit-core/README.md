# pivotkit-core

The pivot engine of pivotkit, in plain JavaScript without UI: typed encoding of your rows, pivot tables
with subtotals and totals, "show values as", filters, date grouping and number bins, a grid with merged
headers for any table renderer, chart options for Apache ECharts, and XLSX and CSV export. Excel's
PivotTable is the reference for how things behave.

Status: in development, not published to npm yet. ES modules for Node 22 or later; the sources use only
what browsers and Node share (no `process`, no `Buffer`), and the browser tests of the playground run
them in Chromium, Firefox and WebKit through pivotkit-react. The only dependency is
[fflate](https://github.com/101arrowz/fflate) (MIT) for the XLSX zip, and only the
`pivotkit-core/export` entry loads it. TypeScript declarations are generated from the JSDoc types.

## Example

```js
import { encode, normalize, computePivot, toGrid, toEChartsOption } from "pivotkit-core";
import { toXlsx, toCsv } from "pivotkit-core/export";

const data = encode([
    { Region: "North", Product: "A", Units: 3, Date: "2026-01-05" },
    { region: "South", product: "B", units: 7, date: "2026-02-14" }
]);

// the view is the report as JSON: save it as a template, send it to the browser, undo it
const input = {
    rows: ["Region"],
    cols: ["Month"],
    derived: [{ name: "Month", field: "Date", by: "yearMonth" }],
    values: [{ field: "Units", agg: "sum", format: "number:0" }],
    sort: [{ field: "Region", by: "value", order: "desc" }],
    formatting: { locale: "en-US" }
};

const { view, issues } = normalize(input, data); // issues: what was dropped, with its path
const result = computePivot(data, view);          // normalizes again, so raw user input is fine too
const grid = toGrid(result);                      // grid.rows[r][c]: { text, value, rowSpan, colSpan, total, ... }
const xlsx = toXlsx(grid);                        // Uint8Array, opens in Excel, LibreOffice and Numbers
const csv = toCsv(grid);
const option = toEChartsOption(result, { chart: { type: "bar", stacked: true } });
```

## API

Every function takes its required inputs first and all optional settings in one options object last.

| Function | What |
| --- | --- |
| `encode(rows, { types, columns, timeZone, inferNumbers, limits })` | Columns typed (string, number, boolean, date incl. ISO strings), as Int32 codes plus dictionaries and Float64 measures. Names match case-insensitively; colliding spellings are listed in `data.issues`. `data.schema.fields[i].detected` says when a text column holds only numbers. |
| `normalize(view, schema, { limits })` | `{ view, issues }`: names resolved against the schema and fixed lists, everything else dropped and reported. Nothing in a view runs as code. |
| `validate(view, schema)` | `{ valid, errors }`: everything `normalize` would drop or change. |
| `migrate(view)` | `{ view, issues }`: a parsed view brought to `VIEW_VERSION`; a newer version is refused (`view: null`). `normalize` runs it first. |
| `emptyView()`, `viewFields(view, schema)` | A new report; the fields of a view including its derived fields. |
| `computePivot(data, view, { locale, limits })` | Row and column key trees with subtotals and totals; `result.value(row, col, i)` and `result.display(row, col, i)` (after "show values as"); `result.issues`. |
| `findNode(result, axis, path)`, `cellRows(result, { row, col })` | A node by its key path; the source row indices behind a cell, for drill-down. |
| `fieldItems(data, field, { view, locale, labels, limits })` | The distinct values of a field (a derived field of `view` too) with label and row count, in the table's label order, blank last; for a filter list. Counts are over all rows, before filters. |
| `toGrid(result, { locale, labels, limits })` | Header and body rows with merges, totals, formatted text and raw values, toggles for collapsed groups, conditional-formatting ratios. |
| `toSeries(result, { labels, separator, limits, maxCategories })`, `toEChartsOption(result, { chart, theme, locale, labels, limits, maxCategories })` | Chart data and a plain ECharts option for bar, stacked bar, line, area, pie and heatmap. ECharts itself is not imported. `maxCategories` plots the first categories in the view's order; `toSeries` reports `categoryCount`, the number before the cut. |
| `toXlsx(grid, { sheetName, theme })`, `toCsv(grid, { separator, repeatLabels })`, `toCsvBytes(grid, { bom })` | From `pivotkit-core/export`. Excel workbook (typed cells, number formats as in the grid, merged headers, bold totals, frozen panes, native colour scales and data bars) and CSV (the grid's locale decides separator and decimal mark, formula-injection guard). |
| `createHistory(startView, { limit })` | Undo, redo and reset for views. |
| `formatter(format, { locale })`, `isFormat(format)` | A named format as a function; whether a name is a known format. |
| `CATALOG`, `aggregatorsFor(type)` | Every name a view accepts (aggregators, formats, show-as, filter types, grouping units, chart types), for a UI's menus, with the sub-lists `commonAggregators`, `timelineUnits` and `cyclicUnits`; the aggregators that fit a field type. |
| `suggestDateUnit(data, field)` | The date grouping a date field gets on an axis, from the span of its values: up to 62 days `day`, up to two years `yearMonth`, up to six years `yearQuarter`, longer `year`; `null` for fewer than two days or a field that is not a date. |
| `DEFAULT_LABELS`, `DEFAULT_THEME`, `LIMITS`, `VIEW_VERSION`, `PivotkitError` | Defaults to override, the limits, the view version, the error class. |

Types: `import type { PivotResult, Grid, View, Encoded } from "pivotkit-core"`. Modules not listed
here are internal and may change in any release.

### Locale, time zone and errors

- Locale: the view's `formatting.locale`, then `options.locale`, then `"en-US"`. The machine's locale
  is never used, so a report looks the same everywhere. The CSV and XLSX exports use the grid's locale.
- Time zone: dates are wall-clock time. An ISO string without an offset ("2026-03-04T10:00") is taken as
  written. A `Date`, epoch milliseconds or an ISO string with an offset is an instant and is read at the
  wall clock of `encode(rows, { timeZone })`: `"UTC"` by default, or any IANA zone
  (`"Europe/Berlin"`), or `"local"` for the machine's zone (resolved to its name). The zone is in
  `data.timeZone`, `result.timeZone` and `grid.timeZone`; a view can carry `formatting.timeZone`, and
  `computePivot` reports when it differs from the data's.
  A `Date` built in the browser from local parts (`new Date(2026, 2, 4)`, a date picker's value) is
  local midnight, an instant: with the default `"UTC"` it shows as the previous day east of UTC. Pass
  `timeZone: "local"` (or the zone the dates belong to) to `encode` for such data.
- Errors: a bad view never throws; `normalize` drops what it cannot use and reports it as an issue. A
  programmer error throws a `PivotkitError` with a `code`: `INVALID_ARGUMENT` (for example
  `computePivot(null)`), `INVALID_OPTION` (an unknown locale or time zone in the options) or
  `LIMIT_EXCEEDED` (see below; `error.details` has `{ limit, value, max }`).

### Limits

`LIMITS` holds the defaults; every function that takes `options.limits` merges it over them.

| Limit | Default | Guards |
| --- | --- | --- |
| `rows` | 10,000,000 | rows `encode` accepts |
| `cells` | 2,000,000 | cells of a grid and data points of a chart. Both are dense (rows x columns), so two fields with many distinct values each would otherwise allocate gigabytes; the size is counted before anything is allocated. |
| `cacheEntries` | 64 | derived columns and sort orders kept per data set (least recently used go first) |
| `json`, `name`, `axisFields`, `values`, `filters`, `items`, `derived`, `sort`, `collapsed`, `topCount` | see `LIMITS` | the size of a view and its parts |

XLSX adds Excel's own limits: 1,048,576 rows and 16,384 columns per sheet (a larger grid throws
`LIMIT_EXCEEDED`), 32,767 characters per cell (longer text is cut).

## The view

```js
{
    version: 1,
    rows: ["Region", "Country"],              // field names, outer first
    cols: ["Year"],
    values: [{
        field: "Sales", agg: "sum",           // count countUnique listUnique sum average median min max
                                              // stdev stdevp var varp first last
        format: "currency:EUR",               // number[:d] integer currency[:CODE] percent[:d] percent100[:d]
                                              // compact bytes duration[:unit] date datetime time text
        label: null,                          // default "Sum of Sales"; with showAs "% of row total of Sales"
        showAs: { type: "percentOfRowTotal", axis: "rows" },
        conditional: { type: "colorScale", colors: ["#f8696b", "#63be7b"] }   // or { type: "dataBar" }
    }],
    filters: [
        { field: "Region", type: "include", items: ["North", null] },        // null is (blank)
        { field: "Rep", type: "label", op: "contains", value: "an" },
        { field: "Country", type: "top", count: 5, bottom: false, by: { field: "Sales", agg: "sum" } },
        { field: "Region", type: "value", op: ">", value: 1000 }
    ],
    derived: [
        { name: "Year", field: "OrderDate", by: "year" },  // year quarter month week day hour weekday
                                                           // yearQuarter yearMonth yearWeek
        { name: "Band", field: "Amount", by: "bin", size: 100, origin: 0 }
    ],
    sort: [{ field: "Country", by: "value", order: "desc", value: { field: "Sales", agg: "sum" } }],
    totals: { grandTotalRow: true, grandTotalColumn: true, rowSubtotals: true, colSubtotals: true },
    collapsed: { rows: [["North"]], cols: [] },
    display: "table",                          // or "chart"
    chart: { type: "bar", stacked: false, horizontal: false },   // bar line area pie heatmap
    formatting: { locale: "de-DE", timeZone: null }
}
```

Formats: `number` shows up to 2 decimals and `percent` up to 1; with a number of decimals
(`number:2`, `percent:0`, up to 20) exactly that many. `currency` takes an ISO 4217 code. A value
without a format gets the same decimals in every cell of its column: those of the source values (at
most 2) for a sum, minimum, maximum, first or last, 2 for an average, median or spread, none for a count; a percent calculation one.

Date groupings label their values in the locale: `yearMonth` "Jan 2025" ("Jan. 2025" in German),
`yearQuarter` "Q1 2025", `month` "Jan", `weekday` "Mon"; the keys stay numbers that sort in time.

"Show values as": `percentOfGrandTotal`, `percentOfRowTotal`, `percentOfColumnTotal`,
`percentOfParentRow`, `percentOfParentColumn`, `differenceFromPrevious`,
`percentDifferenceFromPrevious`, `runningTotal`, `percentRunningTotal`, `rankAscending`,
`rankDescending`; the last six walk along `axis` within each parent group. Running totals need an
aggregator that adds up (`sum`, `count`); on an average or a median they are refused.

Value filters (top N, value conditions) on a field of an axis work within each item of the field
above it, and totals then add up the visible items only, as in Excel. Top N keeps exactly N items;
a tie at the cut keeps the item that appears first in the data (Excel may keep all tied items).

Number bins include their lower bound and exclude the upper one, computed in the decimals of `size`
and `origin`, so 0.3 lands in "0.3 – 0.4" for a size of 0.1. Sizes below 1e-9 are refused.

## Export

- XLSX number formats show cells as the grid does: decimals per cell for `number`, `percent` and
  `percent100`, the locale's currency symbol and its place, `compact` with Excel's thousands scaling,
  and the locale's date order. Gaps: `bytes` and `duration` are written as plain numbers (Excel cannot
  divide by 1024 or write "2 h 5 min" in a number format), and `compact` in locales that group by ten
  thousand (Japanese) falls back to `General`. Number labels (a year) stay numbers. Dates use Excel's
  serials including its 1900 leap-year quirk; dates before 1900 are written as text.
- CSV: text a spreadsheet would run as a formula gets a leading `'`: text starting with a tab or a
  carriage return, text whose first visible character (after spaces, line breaks and control
  characters) is `=` or `@`, and text starting with `+` or `-` unless it is a plain number (`-5%`) or a
  number range like the bin label `-10 – 0`. Numbers keep 15 significant digits.

## Development

```bash
npm test -w pivotkit-core          # node --test
npm run coverage -w pivotkit-core  # the same with a coverage report
npm run types -w pivotkit-core     # type check and generated .d.ts in types/
npm run bench -w pivotkit-core     # timings for 2k, 4k and 100k rows
```

Benchmark baseline, 100,000 rows (median of 5 runs, Node 26 on darwin/arm64; measured
with this version, other machines differ):

| Step | ms |
| --- | ---: |
| `encode` | 138 |
| `computePivot`, 2 rows x 1 column, sum + average | 14 |
| `computePivot`, median + countUnique + stdev | 20 |
| `computePivot`, year-month columns, % of row | 6 |
| `computePivot`, 3 row levels, top 10 products | 18 |
| `toGrid`, 9,268 cells | 3 |
| `toXlsx`, 75 KB | 10 |
| `toCsv` | 2 |

## License

[MIT](../../LICENSE)
