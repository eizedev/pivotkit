---
title: pivotkit-core reference
description: Every public function, constant and type of pivotkit-core and pivotkit-core/export, with their options.
---

# pivotkit-core reference

Two entry points: `pivotkit-core` (the engine) and `pivotkit-core/export` (XLSX and CSV, the only
importer of fflate). Every function takes its required inputs first and all optional settings in one
options object last. Modules not listed here are internal and may change in any release.

```js
import { encode, normalize, computePivot, toGrid, toEChartsOption } from "pivotkit-core";
import { toXlsx, toCsv, toCsvBytes } from "pivotkit-core/export";
import type { PivotResult, Grid, View, Encoded } from "pivotkit-core";   // TypeScript
```

## Data

### `encode(rows, options?)`

Turns an array of objects into typed columns: Int32 codes with dictionaries for labels, Float64 for
measures. Returns `Encoded`.

| Option | Type | Default | What |
| --- | --- | --- | --- |
| `types` | `{ [column]: "string" \| "number" \| "boolean" \| "date" }` | detected | The type of a column, by name (case-insensitive). |
| `columns` | `string[]` | all | Only these columns, in this order (case-insensitive). |
| `timeZone` | `string` | `"UTC"` | The wall clock that `Date` objects, epoch milliseconds and ISO strings with an offset are read in: `"UTC"`, an IANA zone (`"Europe/Berlin"`) or `"local"` (the machine's zone, resolved to its name). See [time zones](../concepts/limits.md#time-zones). |
| `inferNumbers` | `boolean` | `false` | Numeric text (`"12"`, `"-3.5"`) makes a number column. |
| `limits` | `Partial<Limits>` | | `rows` caps the input size. |

`Encoded` has `length`, `columns`, `schema.fields` (name, type, and `detected` when a text column
holds only numbers, so a UI can offer `inferNumbers` or a `types` override), `column(name)` (a
case-insensitive lookup), `timeZone`, and `issues` (column names that collide case-insensitively).
Names match case-insensitively; the data's own spelling is kept for display.

### `fieldItems(data, field, options?)`

The distinct values of a field (a derived field of `options.view` too) with label and row count, in
the table's label order, blank last: what a filter list shows. Counts are over all rows, before
filters. Returns `{ field, type, items: { value, label, count }[], truncated }`, or `null` for an
unknown field. Options: `view`, `locale`, `labels`, `limits`.

### `suggestDateUnit(data, field)`

The date grouping a date field gets on an axis, from the span of its values: up to 62 days `"day"`, up
to two years `"yearMonth"`, up to six years `"yearQuarter"`, longer `"year"`; `null` for fewer than two
days or a field that is not a date.

## Views

A view is the report as JSON; [Views and templates](../concepts/views.md) describes its keys.

| Function | Returns | What |
| --- | --- | --- |
| `normalize(view, schema, { limits })` | `{ view, issues }` | Names resolved against the schema (or the `Encoded` data) and fixed lists; everything else dropped and reported with its path. Nothing in a view runs as code. |
| `validate(view, schema)` | `{ valid, errors }` | Everything `normalize` would drop or change. |
| `migrate(view)` | `{ view, issues }` | A parsed view brought to `VIEW_VERSION`; a newer version is refused (`view: null`). `normalize` runs it first. |
| `emptyView()` | `View` | A new, empty report. |
| `viewFields(view, schema)` | | The fields of a view, including its derived fields. |
| `VIEW_VERSION` | `number` | The view version this release writes. |

## Pivot

### `computePivot(data, view, options?)`

Builds the row and column key trees with subtotals and totals. The view is normalized first, so raw
user input is fine. Options: `locale`, `limits`.

The `PivotResult` has, among others:

| Member | What |
| --- | --- |
| `view` | The normalized view. |
| `issues` | What `normalize` dropped, and a time zone that differs from the data's. |
| `locale`, `timeZone` | The resolved locale and the data's time zone. |
| `rows` | The source row indices left after all filters. |
| `rowRoot`, `colRoot`, `rowNodes`, `colNodes` | The key trees and their nodes. |
| `value(row, col, i)` | The raw aggregate of value `i` at a row and column node. |
| `display(row, col, i)` | The same after "show values as". |
| `label(axis, node, labels?)` | A node's label as the table shows it. |

### Drill-down

| Function | What |
| --- | --- |
| `findNode(result, axis, path)` | The node of `"rows"` or `"cols"` for a key path (`[]` is the grand total); `null` when there is none. |
| `cellRows(result, { row, col })` | The source row indices behind a cell, in data order, as an `Int32Array`. `row` and `col` are nodes or key paths; omitted or `[]` means all rows. |

## Output

### `toGrid(result, options?)`

Header and body rows with merges, totals, formatted text and raw values, toggles for collapsed groups
and conditional-formatting ratios. Options: `locale`, `labels`, `limits` (`cells` caps the grid's
size, counted before anything is allocated).

| `Grid` member | What |
| --- | --- |
| `rows` | `GridCell[][]`, header rows first; `null` is a cell covered by a merge. |
| `headerRows`, `rowHeaderColumns`, `columnCount` | The layout. |
| `merges` | `{ row, col, rowSpan, colSpan }[]`. |
| `dataColumns`, `bodyRows` | Per value column its `colPath`, `valueIndex` and `total`; per body row its `rowPath`, `total` and `collapsed`. |
| `formats`, `valueNames`, `conditional` | Per value. |
| `locale`, `timeZone` | What the texts are formatted in; the exports use them too. |

A `GridCell` has `text` (formatted), `value` (raw), `kind` (`"corner"`, `"colHeader"`, `"rowHeader"`,
`"value"`), `total` (0 none, 1 subtotal, 2 grand total), and where they apply `rowSpan`, `colSpan`,
`valueType`, `format`, `field`, `rowPath`, `colPath`, `valueIndex`, `toggle` (`{ axis, path, collapsed }`)
and `style` (`{ scale, bar, color }` for colour scales and data bars).

### `toSeries(result, options?)` and `toEChartsOption(result, options?)`

Chart data, and a plain [Apache ECharts](https://echarts.apache.org/) option for bar, stacked bar,
line, area, pie and heatmap. ECharts itself is not imported.

| Option | Of | What |
| --- | --- | --- |
| `chart` | `toEChartsOption` | `{ type, stacked, horizontal }`, overrides the view's chart. |
| `theme` | `toEChartsOption` | `ChartTheme`: `colors`, `textColor`, `axisColor`, `gridColor`, `backgroundColor` (default transparent), `fontFamily`, `heatmapColors` (low, high), `pieRadius` (inner, outer; default a ring, `35%`, `70%`). |
| `locale` | `toEChartsOption` | Used when the view names none; default the pivot's locale. |
| `labels`, `limits` | both | Texts; `cells` caps the data points. |
| `separator` | both | Between the parts of a multi-level label, default `" / "`. |
| `maxCategories` | both | Plots the first categories in the view's order; `toSeries` reports `categoryCount`, the number before the cut. |
| `series` | `toEChartsOption` | The `toSeries` result of the same result and options, when the caller has it already. |

### Export: `pivotkit-core/export`

| Function | Returns | What |
| --- | --- | --- |
| `toXlsx(grid, { sheetName, theme })` | `Uint8Array` | An Excel workbook: typed cells, number formats as in the grid, merged headers, bold totals, frozen panes, native colour scales and data bars. `theme`: `{ colorScale, dataBar }` for conditional formats whose view names no colours. |
| `toCsv(grid, { separator, repeatLabels })` | `string` | CSV. The grid's locale decides the separator and the decimal mark; text a spreadsheet would run as a formula gets a leading `'`. |
| `toCsvBytes(grid, { separator, repeatLabels, bom })` | `Uint8Array` | The same as UTF-8 bytes, with a byte order mark when `bom` is set. |

What the files contain, and where Excel's number formats cannot follow the grid, is in
[Security](../security.md#exports) and [Values](../concepts/values.md#export).

## Helpers

| Name | What |
| --- | --- |
| `createHistory(startView, { limit })` | Undo, redo and reset for views: `current`, `canUndo`, `canRedo`, `push(view)` (an unchanged view is not a step; returns whether it was one), `undo()`, `redo()`, `reset()` (back to the start view as one step that can be undone). `limit` defaults to 100 steps. |
| `formatter(format, { locale })` | A named [format](../concepts/values.md#formats) as a function from a value to text. |
| `isFormat(format)` | Whether a name is a known format. |
| `CATALOG` | Every name a view accepts, for a UI's menus: `aggregators`, `commonAggregators`, `columnTypes`, `deriveUnits`, `timelineUnits`, `cyclicUnits`, `filterTypes`, `labelOps`, `valueOps`, `formats`, `showAs`, `showAsAlongAxis`, `chartTypes`, `displayModes`, `conditionalTypes`. |
| `aggregatorsFor(type)` | The aggregators that fit a field type. |
| `DEFAULT_LABELS` | The texts the engine writes (blank, totals, value names, aggregator names, "show as" names), to override per call with `labels`. |
| `DEFAULT_THEME` | Default colours for colour scales and data bars, and the pie's radius. |
| `LIMITS` | The [limits](../concepts/limits.md#limits). |
| `PivotkitError` | The error class; `code` is `INVALID_ARGUMENT`, `INVALID_OPTION` or `LIMIT_EXCEEDED`, `details` holds `{ limit, value, max }` for a limit. |

## Types

`View`, `ValueSpec`, `ValueRef`, `FilterSpec`, `DerivedSpec`, `SortSpec`, `Issue`, `Encoded`, `Column`,
`ColumnType`, `SchemaField`, `PivotResult`, `PivotNode`, `Grid`, `GridCell`, `FieldItem`, `ChartTheme`,
`Formatter`, `Limits`, `Labels` and `PivotkitErrorCode`, from `pivotkit-core`.

## Performance

Benchmark of the engine with 100,000 rows (median of 5 runs, Node 26 on one Mac with Apple silicon;
approximate, other machines differ; `npm run bench -w pivotkit-core` measures your own):

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
