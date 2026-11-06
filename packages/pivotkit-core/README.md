# pivotkit-core

The pivot engine of pivotkit, in plain JavaScript without UI: typed encoding of your rows, pivot tables
with subtotals and totals, "show values as", filters, date grouping and number bins, a grid with merged
headers for any table renderer, chart options for Apache ECharts, and XLSX and CSV export. Excel's
PivotTable is the reference for how things behave.

Status: in development, not published to npm yet. ES modules, Node 22 or later and current browsers;
the only dependency is [fflate](https://github.com/101arrowz/fflate) (MIT) for the XLSX zip.

## Example

```js
import { encode, computePivot, toGrid, toXlsx, toEChartsOption } from "pivotkit-core";

const data = encode([
    { Region: "North", Product: "A", Units: 3, Date: "2026-01-05" },
    { region: "South", product: "B", units: 7, date: "2026-02-14" }
]);

// the view is the report as JSON: save it as a template, send it to the browser, undo it
const view = {
    rows: ["Region"],
    cols: ["Month"],
    derived: [{ name: "Month", field: "Date", by: "yearMonth" }],
    values: [{ field: "Units", agg: "sum", format: "number:0" }],
    sort: [{ field: "Region", by: "value", order: "desc" }],
    formatting: { locale: "en-US" }
};

const result = computePivot(data, view);
const grid = toGrid(result);          // grid.rows[r][c]: { text, value, rowSpan, colSpan, total, ... }
const xlsx = toXlsx(grid);            // Uint8Array, opens in Excel, LibreOffice and Numbers
const option = toEChartsOption(result, { chart: { type: "bar", stacked: true } });
```

## API

| Function | What |
| --- | --- |
| `encode(rows, { types, columns, timeZone })` | Columns typed (string, number, boolean, date incl. ISO strings), as Int32 codes plus dictionaries and Float64 measures. Names match case-insensitively. |
| `normalize(view, schema)`, `validate(view, schema)` | A view is user input: names are resolved against the schema and fixed lists, everything else is dropped (`normalize`) or reported (`validate`). Nothing in a view runs as code. |
| `computePivot(data, view)` | Row and column key trees with subtotals and totals; `result.value(row, col, i)` and `result.display(row, col, i)` (after "show values as"). |
| `cellRows(result, rowPath, colPath)` | The source row indices behind a cell, for drill-down. |
| `toGrid(result, { locale, labels })` | Header and body rows with merges, totals, formatted text and raw values, toggles for collapsed groups, conditional-formatting ratios. |
| `toSeries(result)`, `toEChartsOption(result, view, theme)` | Chart data and a plain ECharts option for bar, stacked bar, line, area, pie and heatmap. ECharts itself is not imported. |
| `toXlsx(grid)`, `toCsv(grid)`, `toCsvBytes(grid)` | Excel workbook (typed cells, number formats, merged headers, bold totals, frozen panes, native colour scales and data bars) and CSV (locale separator, formula-injection guard). |
| `createHistory(startView)` | Undo, redo and reset for views. |

## The view

```js
{
    version: 1,
    rows: ["Region", "Country"],              // field names, outer first
    cols: ["Year"],
    values: [{
        field: "Sales", agg: "sum",           // count countUnique listUnique sum average median min max
                                              // stdev stdevp var varp first last
        format: "currency:EUR",               // number[:d] integer currency[:CODE] percent[:d] percent100
                                              // compact bytes duration[:unit] date datetime time text
        label: null,                          // default "Sum of Sales"
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
    formatting: { locale: "de-DE" }
}
```

"Show values as": `percentOfGrandTotal`, `percentOfRowTotal`, `percentOfColumnTotal`,
`percentOfParentRow`, `percentOfParentColumn`, `differenceFromPrevious`,
`percentDifferenceFromPrevious`, `runningTotal`, `percentRunningTotal`, `rankAscending`,
`rankDescending`; the last six walk along `axis` within each parent group.

Value filters (top N, value conditions) on a field of an axis work within each item of the field
above it, and totals then add up the visible items only, as in Excel. Dates are handled as wall-clock
time: "2026-03-04T10:00" is 10:00 on every machine.

## Development

```bash
npm test -w pivotkit-core       # node --test
npm run bench -w pivotkit-core  # timings for 2k, 4k and 100k rows
```

## License

[MIT](../../LICENSE)
