---
title: pivotkit-core reference
description: Every public function, constant and type of pivotkit-core and its entry points pivotkit-core/export, /link and /templates, with their options.
---

# pivotkit-core reference

Four entry points: `pivotkit-core` (the engine), `pivotkit-core/export` (XLSX and CSV) and
`pivotkit-core/link` (a view in a link), the only importers of fflate, and `pivotkit-core/templates`
(a list of templates). Every function takes its required inputs first and all optional settings in one
options object last. Modules not listed here are internal and may change in any release.

```js
import { encode, normalize, computePivot, toGrid, toEChartsOption } from "pivotkit-core";
import { toXlsx, toCsv, toCsvBytes, toTsv, toJson, rowsToCsv, rowsToCsvBytes, rowsToXlsx } from "pivotkit-core/export";
import { parseTemplates, templatesFromSchema } from "pivotkit-core/templates";
import type { PivotResult, Grid, View, Encoded } from "pivotkit-core";   // TypeScript
```

## Data

### `encode(rows, options?)`

Turns an array of objects into typed columns: Int32 codes with dictionaries for labels, Float64 for
measures. Returns `Encoded`.

| Option | Type | Default | What |
| --- | --- | --- | --- |
| `types` | `{ [column]: "string"` or `"number"` or `"boolean"` or `"date" }` | detected | The type of a column, by name (case-insensitive). |
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

### `fieldDefaultsFromSchema(schema, options?)`

What a JSON Schema or an OpenAPI document says about each field of a row, in the shape of
pivotkit-react's `fieldDefaults`: `title` becomes `label`, `description` stays `description`,
`externalDocs.url` becomes `href` (https only), `type` `integer` or `number` and `format` `date` or
`date-time` become `type`, `enum` becomes `order`. `schema` is the row's schema (an object with
`properties`, or an array of rows), or an OpenAPI 3 / Swagger 2 document with `options.schema`, the
name of a schema in `components.schemas` (or `definitions`) or a local `$ref`
(`"#/components/schemas/Release"`). Only references inside the document are followed, `allOf` parts
are merged, a nullable `anyOf`/`oneOf` is read as its one schema, each `$ref` target is read once.
Nothing is fetched or run; texts are plain (no control, bidi or zero-width characters) and capped
(label 120, description 1,000 characters, 1,000 fields and enum entries, 32 levels of `$ref`, 20,000
schema objects). A property with nothing to say is left out. Returns `{ defaults, issues }`:
`defaults` is the `fieldDefaults` object, `issues` (`{ path, message }[]`) what could not be read (a
reference outside the document or not local, a cycle, a cap reached), as `normalize()` reports a
view's. Throws `INVALID_ARGUMENT` for input that is no schema at all. See [Field descriptions and names](../concepts/fields.md).

## Views

A view is the report as JSON; [Views and saved views](../concepts/views.md) describes its keys.

| Function | Returns | What |
| --- | --- | --- |
| `normalize(view, schema, { limits })` | `{ view, issues }` | Names resolved against the schema (or the `Encoded` data) and fixed lists; everything else dropped and reported with its path. Nothing in a view runs as code. |
| `validate(view, schema, { limits })` | `{ valid, errors }` | Everything `normalize` would drop or change, against the same `limits` (`errors` are `normalize`'s issues, `{ path, message }`). |
| `migrate(view)` | `{ view, issues }` | A parsed view brought to `VIEW_VERSION`; a newer version is refused (`view: null`). `normalize` runs it first. |
| `emptyView()` | `View` | A new, empty report. |
| `viewFields(view, schema)` | `[{ name, type, derived? }]` | The fields of the data and the view's derived fields (`derived: true`; `type` is `"date"` for a grouping by day, `"number"` for every other unit and for number ranges). |
| `VIEW_VERSION` | `number` | The view version this release writes. |

### View files

A view with its name, the data it was made for and the fields it uses, as one JSON document: what
pivotkit-react shares as JSON, as a file and (in its link profile) as a link. The format, its rules
and its JSON Schema are in [View file format](view-file.md).

| Function | Returns | What |
| --- | --- | --- |
| `toViewFile(view, meta?, { link })` | object | The view file, keys in their canonical order. `meta`: `name`, `description` (left out when empty), `createdAt` (a `Date` or ISO text; left out without it), `generator` (`{ name, version }`), `source` (`{ id, name }`), `data` (an `Encoded`: `source.fields` lists the fields the view uses with their types). `link: true` gives the link profile: format, version, `source.id`, `name` and the view only. Throws `TypeError` for a view that is no object. |
| `fromViewFile(input, { data, sourceId })` | `ViewFileRead` | Reads a view file, a bare view or a template `{ name, view }` from its text or parsed object; never throws. `view` (as parsed, not normalized; `null` when it cannot be used), `envelope`, `name`, `description`, `createdAt`, `generator`, `source`, `failed` (`"empty"`, `"tooLarge"`, `"notJson"`, `"notView"`, `"newerFormat"`, `"newerView"`), `issues` (what was left out of the envelope). With `data`: `compatible` `{ ok, source: "same" \| "other" \| "unknown", missing, changed, needs }`. |
| `viewFileText(file)` | `string` | The file as JSON with a 2-space indent and a trailing newline. |
| `viewFileName(name)` | `string` | `"<slug>.pivotkit.json"` ("Revenue by region" gives `revenue-by-region.pivotkit.json`), `view.pivotkit.json` without a letter or digit. |
| `viewFileFields(view)` | `string[]` | The data's fields a view uses (rows, columns, values, filters, sort; a grouping as its source field), each once. |
| `VIEW_FILE_FORMAT`, `VIEW_FILE_VERSION`, `VIEW_FILE_SCHEMA`, `VIEW_FILE_LIMITS` | | `"pivotkit-view"`, `1`, the schema's address, and `{ text: 1000000, name: 256, description: 2000, fields: 1000 }`. |

## Pivot

### `computePivot(data, view, options?)`

Builds the row and column key trees with subtotals and totals. The view is normalized first, so raw
user input is fine. Options: `locale`, `limits` (`work` is computed before the aggregation starts;
`groups` and `pivotCells` are counted while the key trees and the cells grow; over one,
`LIMIT_EXCEEDED`).

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
| `hasRows(row, col)` | Whether any source row is behind a cell (a blank cell of a combination without data has none). |
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
| `showAs` | Per value its "show values as" type, or `null`. |
| `locale`, `timeZone` | What the texts are formatted in; the exports use them too. |

A `GridCell` has `text` (formatted), `value` (raw), `kind` (`"corner"`, `"colHeader"`, `"rowHeader"`,
`"value"`), `total` (0 none, 1 subtotal, 2 grand total), and where they apply `rowSpan`, `colSpan`,
`valueType`, `format`, `field`, `rowPath`, `colPath`, `valueIndex`, `toggle` (`{ axis, path, collapsed }`),
`style` (`{ scale, bar, color }` for colour scales and data bars) and, on value cells, `hasRows`
(`false`: no source row behind the cell, nothing to drill into). With one value, its name is a single
header cell over all of its columns, as in Excel.

### `toSeries(result, options?)` and `toEChartsOption(result, options?)`

Chart data, and a plain [Apache ECharts](https://echarts.apache.org/) option for bar, stacked bar,
line, area, pie, donut and heatmap. ECharts itself is not imported.

| Option | Of | What |
| --- | --- | --- |
| `chart` | `toEChartsOption` | `{ type, stacked, horizontal, valueLabels, legend, title, smooth, axisLabels, groupLabels, labelPosition }`, over the view's chart ([Charts](../concepts/charts.md)). |
| `theme` | `toEChartsOption` | `ChartTheme`: `colors`, `textColor`, `axisColor`, `gridColor`, `backgroundColor` (default transparent), `fontFamily`, `heatmapColors` (low, high), `pieRadius` (inner, outer of a pie; default a whole circle, `0%`, `70%`), `donutRadius` (of a donut; default a ring, `42%`, `70%`). |
| `locale` | `toEChartsOption` | Used when the view names none; default the pivot's locale. |
| `labels`, `limits` | both | Texts; `cells` caps the data points. |
| `separator` | both | Between the parts of a multi-level label, default `" / "`. |
| `maxCategories` | both | Plots the first categories in the view's order; `toSeries` reports `categoryCount`, the number before the cut. |
| `series` | `toEChartsOption` | The `toSeries` result of the same result and options, when the caller has it already. |

`chart.type` `"auto"` (the view's default) is drawn as `autoChartType(view, data)` says: `"line"`
when a date or a grouping of one along the time line (not weekday, hour, month of year) is on Rows, else `"bar"`. A pie's share is written as the locale
writes a percentage; a heatmap's colour scale (`visualMap.formatter`) in the value's number format.

### `autoChartType(view, data)`

What the chart type `"auto"` stands for, for a normalized view and its data: `"line"` when a field on
Rows is a date or a grouping of one along the time line (a repeating one such as weekday is categories), else `"bar"`. A date on Columns alone gives `"bar"`; a UI that
wants lines there swaps rows and columns for the chart (pivotkit-react does).

`toSeries` gives `categories` (the whole path of each category, "Asia / Japan"), `categoryLevels`
(its label per level, `["Asia", "Japan"]`), `categoryPaths`, `series` and `totals`. The view's display
settings are part of the option: a `title`, the legend where `chart.legend` puts it (and room for
it), value labels (`label` of the series; for a pie or a donut outside or, with `chart.labelPosition`
`"inside"`, on the slices without a label line), `smooth` lines, and with `chart.groupLabels` (`"auto"` or `"on"`; the UI hides `"auto"` ones in a small chart) and two or
more row fields a second category axis with the outer field's items, once per group at its middle,
with a separator tick where a group starts (`xAxis` or `yAxis` is then a list of two). Where to write
the category labels (`chart.axisLabels`) depends on the chart's size, so the UI decides it
(pivotkit-react's `categoryLabelLayout`).

### Links: `pivotkit-core/link`

A view as a short text for a link and back; a separate entry point, so a page that never shares does
not load fflate. The format is pivotkit's share format: `1.` and the JSON compressed with raw
DEFLATE, in base64url. pivotkit-react encodes the [link profile of a view file](view-file.md#the-link-profile)
(`toViewFile(view, meta, { link: true })`); `decodeViewLink` gives back whatever object was encoded,
which `fromViewFile` reads (a bare view too). See [Sharing](../concepts/sharing.md).

| Name | What |
| --- | --- |
| `encodeViewLink(view)` | The text of a link to a view. Throws `PivotkitError` `LIMIT_EXCEEDED` (`details.limit` `"link"`) when the text would be longer than `LINK_LIMITS.text`; `INVALID_ARGUMENT` for a non-object.<br><small>Returns `string`</small> |
| `decodeViewLink(text)` | The view of a link text as parsed JSON, or `null` with an issue that says why (empty, too long, not a pivotkit link, damaged, too large, no JSON object). Never throws. The view is user input: pass it to `normalize()`.<br><small>Returns `{ view, issues }`</small> |
| `LINK_LIMITS` | `{ text: 32000, json: 1000000 }`: the characters of a link text, and of the view inflated (enforced while inflating: 1 KiB of input at a time, it stops at the cap). |

### Templates: `pivotkit-core/templates` { #templates }

A list of named views (shared views, a person's own) and the templates an OpenAPI document or a JSON
Schema carries in the extension `x-pivotkit-views` (pivotkit's own convention, not part of either
standard). A separate entry point: a UI loads it only where it reads templates (pivotkit-react with
its menus). See [Templates and shared views](../concepts/templates.md).

| Name | What |
| --- | --- |
| `parseTemplates(input)` | A list (or its JSON text) of view files, templates `{ name, view }` and bare views with a `name`, read with `fromViewFile`. Never throws. An entry without a name or a usable view, of a newer format or view version, or that is no JSON is left out with an issue (path `[i]`); names and descriptions are plain text (control, bidi and zero-width characters go), at most 256 characters. The text and the number of entries are capped before they are read (`TEMPLATE_LIMITS`); entries given as objects count as their JSON. The views are as parsed, not normalized.<br><small>Returns `{ templates: [{ name, view, description?, source? }], issues }`</small> |
| `templatesFromSchema(doc, { schema })` | The templates of `x-pivotkit-views` on the schema `schema` names (a schema of `components.schemas` or `definitions`, or a local `$ref`), else on the document's root, read by `parseTemplates`. Only local references are followed (the list may be one too), as deep as `SCHEMA_CAPS.depth`; nothing is fetched. No extension: no templates, no issue. A document that is no object, or a schema name it lacks, throws `PivotkitError` `INVALID_ARGUMENT`; issues have the path `x-pivotkit-views[i]`.<br><small>Returns `{ templates, issues }`</small> |
| `TEMPLATE_LIMITS` | `{ count: 500, text: 5000000 }`: templates read from one list, and characters of its JSON. |
| `TEMPLATES_EXTENSION` | `"x-pivotkit-views"`. |

### Export: `pivotkit-core/export`

| Function | What |
| --- | --- |
| `toXlsx(grid, { sheetName, theme })` | An Excel workbook: typed cells, number formats as in the grid, merged headers, bold totals, frozen panes, native colour scales and data bars. `sheetName`: default `"Pivot"`; at most 31 characters, `\ / ? * [ ] :` and control characters become spaces, apostrophes at either end are dropped, and `"History"` (reserved by Excel) becomes `"History 1"`. `theme`: `{ colorScale, dataBar }` for conditional formats whose view names no colours.<br><small>Returns `Uint8Array`</small> |
| `toCsv(grid, { separator, repeatLabels })` | CSV. `separator`: default `";"` where the grid's locale writes decimals with a comma (de-DE), else `","`; the locale also gives the decimal mark. `repeatLabels`: default `true`, a row label that spans several rows is written on each of them, so every line stands on its own; `false` writes it once. Numbers keep 15 significant digits; a percent and a "show values as" value are written as the table shows them, rounded to the decimals of their format, a percent in percent with a `%` (`-2.6%`; the XLSX keeps their full precision); text a spreadsheet would run as a formula gets a leading `'`.<br><small>Returns `string`</small> |
| `toCsvBytes(grid, { separator, repeatLabels, bom })` | The same as UTF-8 bytes, with a byte order mark so Excel detects the encoding; `bom: false` leaves it out.<br><small>Returns `Uint8Array`</small> |
| `toTsv(grid)`, `toTsv(rows)` | For the clipboard: the grid as the table shows it (each cell's display text, headers and totals, a row label repeated on every row it spans), or rows of display texts (the first the headers), tab-separated with CRLF line ends. A spreadsheet takes it as columns when it is pasted, and in the same locale reads the numbers and dates back. Text a spreadsheet would run as a formula gets a leading `'`; a cell with a tab, a line break or a quote is quoted.<br><small>Returns `string`</small> |
| `toJson(grid, { space })` | The grid's data as JSON text: `{ rowHeaders, columns, rows }`. `rowHeaders`: the names of the row label columns. `columns`: per value column `{ labels, value, total }`, the header texts above it, the value's name, `total` 0 none, 1 subtotal, 2 grand total. `rows`: per body row `{ labels, total, collapsed, values }`, its labels (a label repeated on every row it spans, `""` beside a subtotal's label and beside a collapsed group), `collapsed` true for a collapsed group (its values are the group's totals), and its values in the order of `columns`: numbers with 15 significant digits, a "show values as" share as the fraction (0.25 for 25%, the table shows "25%"), dates as ISO dates of their wall clock, text as it is, a blank cell `null`. `space`: indentation, default 2.<br><small>Returns `string`</small> |
| `rowsToCsv(data, indices, { columns, locale, formats, labels, separator, limits })` | Source rows as CSV: the rows at `indices` of the encoded `data` (the positions `cellRows` gives: a drill-down's rows), a header row with the fields' display names (`labels.fields`), one line per row. `columns`: the fields and their order, default every column of the data. Each value as a drill-down panel shows it: a number with its field's format (`formats`, a format name per field, matched case-insensitively) or with up to 6 decimals, a date as its day (with the time when the column has times), yes/no as `labels.true` and `labels.false`; the format `text` keeps an identifier as it is. Written as `toCsv` writes the grid: separator and decimal mark of `locale`, numbers with full precision, dates as ISO dates, the formula guard. Rows x columns count against `limits.cells`.<br><small>Returns `string`</small> |
| `rowsToCsvBytes(data, indices, { ..., bom })` | The same as UTF-8 bytes with a byte order mark.<br><small>Returns `Uint8Array`</small> |
| `rowsToXlsx(data, indices, { columns, locale, formats, labels, sheetName, limits })` | Source rows as an Excel workbook: a bold, frozen header row, numbers and dates as typed cells with the number format the panel shows them in, text as inline strings. `sheetName` as in `toXlsx`.<br><small>Returns `Uint8Array`</small> |

What the files contain, and where Excel's number formats cannot follow the grid, is in
[Security](../security.md#exports) and [Values](../concepts/values.md#export).

## Helpers

| Name | What |
| --- | --- |
| `createHistory(startView, { limit })` | Undo, redo and reset for views: `current`, `canUndo`, `canRedo`, `push(view)` (an unchanged view is not a step; returns whether it was one), `undo()`, `redo()`, `reset()` (back to the start view as one step that can be undone). `limit` defaults to 100 steps. |
| `formatter(format, { locale })` | A named [format](../concepts/values.md#formats) as a function from a value to text. |
| `isFormat(format)` | Whether a name is a known format. |
| `CATALOG` | Every name a view accepts, for a UI's menus: `aggregators`, `commonAggregators`, `columnTypes`, `deriveUnits`, `timelineUnits`, `cyclicUnits`, `filterTypes`, `labelOps`, `valueOps`, `formats`, `showAs`, `showAsAlongAxis`, `chartTypes`, `chartValueLabels`, `chartLegends`, `chartAxisLabels`, `chartGroupLabels`, `chartLabelPositions`, `displayModes`, `conditionalTypes`. |
| `aggregatorsFor(type)` | The aggregators that fit a field type. |
| `DEFAULT_LABELS` | The texts the engine writes (blank, totals, value names, aggregator names, "show as" names), to override per call with `labels`. |
| `fieldLabel(field, labels)` | A field's display name from `labels.fields` (matched case-insensitively), else the name. With `labels.fields` the grid's corner headers, the value names, the exports and the chart show display names; the view keeps the field names. |
| `DEFAULT_THEME` | Default colours for colour scales and data bars, and the radius of a pie and of a donut. |
| `LIMITS` | The [limits](../concepts/limits.md#limits). |
| `PivotkitError` | The error class; `code` is `INVALID_ARGUMENT`, `INVALID_OPTION` or `LIMIT_EXCEEDED`, `details` holds `{ limit, value, max }` for a limit. |

## Types

`View`, `ValueSpec`, `ValueRef`, `FilterSpec`, `DerivedSpec`, `SortSpec`, `Issue`, `Encoded`, `Column`,
`ColumnType`, `SchemaField`, `PivotResult`, `PivotNode`, `Grid`, `GridCell`, `FieldItem`, `ChartTheme`,
`Formatter`, `Limits`, `Labels`, `SchemaFieldDefaults`, `PivotkitErrorCode`, `ViewFileMeta`, `ViewFileRead`,
`ViewFileCompatibility` and `ViewFileSource`, from `pivotkit-core`.

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
