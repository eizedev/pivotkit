---
title: pivotkit-core reference
description: Every public function, constant and type of pivotkit-core and its entry points pivotkit-core/export, /link, /templates and /import, with their options.
---

# pivotkit-core reference

pivotkit-core has five entry points:

- `pivotkit-core`: the engine.
- `pivotkit-core/export`: XLSX and CSV.
- `pivotkit-core/link`: a view in a link.
- `pivotkit-core/templates`: a list of templates.
- `pivotkit-core/import`: reads CSV, JSON and, with plugins, other files into a table
  ([Loading files](import.md)).

Only `pivotkit-core/export` and `pivotkit-core/link` import fflate. Every function takes its required
inputs first and all optional settings in one options object last. Modules not listed here are
internal and may change in any release.

```js
import { encode, normalize, computePivot, toGrid, toEChartsOption } from "pivotkit-core";
import { toXlsx, isDataAsOf, toCsv, toCsvBytes, toTsv, toJson, rowsToCsv, rowsToCsvBytes, rowsToXlsx, dataToCsv, dataToCsvBytes, dataToCsvParts, dataToJson } from "pivotkit-core/export";
import { parseTemplates, templatesFromSchema } from "pivotkit-core/templates";
import { readFile, retype } from "pivotkit-core/import";
import type { PivotResult, Grid, View, Encoded } from "pivotkit-core";   // TypeScript
```

## Data

### `encode(rows, options?)`

Turns an array of objects, or [columnar data](#columnar-input), into typed columns: Int32 codes with
dictionaries for labels, Float64 for measures. Returns `Encoded`.

| Option | Type | Default | What |
| --- | --- | --- | --- |
| `types` | `{ [column]: "string"` or `"number"` or `"boolean"` or `"date" }` | detected | The type of a column, by name (case-insensitive). It wins over the `types` of columnar data. |
| `columns` | `string[]` | all | Only these columns, in this order (case-insensitive). |
| `timeZone` | `string` | `"UTC"` | The wall clock that `Date` objects, epoch milliseconds and ISO strings with an offset are read in: `"UTC"`, an IANA zone (`"Europe/Berlin"`) or `"local"` (the machine's zone, resolved to its name). See [time zones](../concepts/limits.md#time-zones). |
| `inferNumbers` | `boolean` | `false` | Numeric text (`"12"`, `"-3.5"`) makes a number column. |
| `limits` | `Partial<Limits>` | | `rows` caps the input size. |

`Encoded` has these members:

- `length` and `columns`.
- `schema.fields`: name, type, and `detected` when a text column holds only numbers. A UI can then
  offer `inferNumbers` or a `types` override.
- `column(name)`: a case-insensitive lookup.
- `timeZone`.
- `issues`: column names that collide case-insensitively, of type `EncodeIssue`.

Names match case-insensitively. The display keeps the data's own spelling.

Each issue has a `path` (the column's name), a `message`, a `code` and `params`. In `params`,
`column` is the name kept and `spelling` the other one. The codes are:

- `columnCase`: `encode` joined another spelling to the column, such as rows with `Team` and rows
  with `team`.
- `columnCaseValue`: a row has both spellings. `encode` uses the later value and loses the other.
  `row` is the row's index in the data, 0-based.
- `columnCaseLeftOut`: `encode` left out a column of columnar data for an earlier one.

#### Columnar input

Instead of an array of objects, `encode` takes one array per column:

```js
encode({
    columns: ["Region", "Units", "Date"],
    types: ["string", "number", "date"],          // optional; an entry may be null (inferred)
    data: [["North", "South"], [3, 7], ["2026-01-05", "2026-02-14"]]
});
```

`data[c][r]` is the value of column `columns[c]` in row `r`. `encode` builds no object per row and
repeats no name per row. A large data set therefore takes less memory, in the browser and on the
wire, and a server can send this shape as JSON.

- Every array must have the same length. A typed array such as a `Float64Array` works too, and
  `NaN` is blank.
- `types` has one entry per column.
- When two names match case-insensitively, `encode` keeps the first column and reports the second in
  `issues`.
- A wrong shape throws `INVALID_ARGUMENT`, which says what is wrong.
- `limits.rows` caps the length.

The tables of [`pivotkit-core/import`](import.md) have this shape: `encode(table)`. Columnar data
gives the same pivot as the same rows as objects.

### `fieldItems(data, field, options?)`

The distinct values of a field with label and row count, as a filter list shows them. The field may
also be a derived field of `options.view`. The values come in the table's label order, blank last.
Counts are over all rows, before filters.

Each item's `kept` says whether the field's own rules on items keep it:

- These rules count, all together: a `label` condition, a `compare` and a `relative` range. A year
  of a grouping is kept when one of its rows is in the range.
- Without such a rule, `kept` is `true`.
- The field's picks and the conditions on totals do not count.

Returns `{ field, type, items: { value, label, count, kept }[], truncated }`, or `null` for an
unknown field. Options: `view`, `locale`, `labels`, `limits` and `now`. `now` is today for a
relative range, as in `computePivot`.

### `suggestDateUnit(data, field)`

The date grouping a date field gets on an axis, from the span of its values:

| Span | Unit |
| --- | --- |
| up to 62 days | `"day"` |
| up to two years | `"yearMonth"` |
| up to six years | `"yearQuarter"` |
| longer | `"year"` |

It returns `null` for fewer than two days or a field that is not a date.

### `fieldDefaultsFromSchema(schema, options?)`

Reads what a JSON Schema or an OpenAPI document says about each field of a row. It returns it in the
shape of pivotkit-react's `fieldDefaults`:

| Schema | `fieldDefaults` |
| --- | --- |
| `title` | `label` |
| `description` | `description` |
| `externalDocs.url` | `href` (https only) |
| `type` `integer` or `number`, `format` `date` or `date-time` | `type` |
| `enum` | `order` |

`schema` is one of these:

- The row's schema: an object with `properties`, or an array of rows.
- An OpenAPI 3 / Swagger 2 document with `options.schema`. `options.schema` is the name of a schema
  in `components.schemas` (or `definitions`), or a local `$ref` (`"#/components/schemas/Release"`).

How it reads the schema:

- It follows only references inside the document.
- It merges `allOf` parts.
- It reads a nullable `anyOf`/`oneOf` as its one schema.
- It reads each `$ref` target once.
- It fetches and runs nothing.
- Texts are plain, without control, bidi or zero-width characters.
- Caps: label 120 and description 1,000 characters, 1,000 fields and enum entries, 32 levels of
  `$ref`, 20,000 schema objects.
- It leaves out a property with nothing to say.

Returns `{ defaults, issues }`. `defaults` is the `fieldDefaults` object. `issues`
(`{ path, message }[]`) lists what it could not read, as `normalize()` reports a view's: a reference
outside the document or not local, a cycle, a cap reached. Input that is no schema at all throws
`INVALID_ARGUMENT`. See [Field descriptions and names](../concepts/fields.md).

## Views

A view is the report as JSON. [Views and saved views](../concepts/views.md) describes its keys.

| Function | Returns | What |
| --- | --- | --- |
| `normalize(view, schema, { limits })` | `{ view, issues }` | Resolves names against the schema (or the `Encoded` data) and fixed lists. It drops everything else and reports it as an issue `{ path, message, code, severity, params }` ([Issues](../concepts/views.md#issues-for-developers)). Nothing in a view runs as code. |
| `validate(view, schema, { limits })` | `{ valid, errors, warnings }` | `errors`: everything `normalize` would drop or change, against the same `limits`. `warnings`: what it uses but may not be what was meant, including the warnings only a strict check gives. `valid` is true without errors. |
| `migrate(view)` | `{ view, issues }` | Brings a parsed view to `VIEW_VERSION`. A view without `version` is read as version 1 ([Versions](../concepts/views.md#versions)). It refuses a newer version (`view: null`). `normalize` runs it first. |
| `emptyView()` | `View` | A new, empty report. |
| `viewFields(view, schema)` | `[{ name, type, derived? }]` | The fields of the data and the view's derived fields (`derived: true`). A derived field's `type` is `"date"` for a grouping by day, and `"number"` for every other unit and for number ranges. |
| `VIEW_VERSION` | `number` | The view version this release writes: 2. |
| `VIEW_ISSUE_CODES` | `string[]` | Every `code` an issue of `normalize`, `migrate`, `validate` or `computePivot` can have ([Issues](../concepts/views.md#issues-for-developers)). |
| `VIEW_ISSUES` | object | Per code: `severity` (`"error"` or `"warning"`) and `schema` (whether the view's JSON Schema refuses the case too). |

The JSON Schema of a view of version 2 is for an editor, a generator or an LLM that writes views.
pivotkit-core ships it as `pivotkit-core/schema/view-2.json`, and the site publishes it at
`https://pivotkit.eize.dev/schema/view-2.json`.

- The repository's `scripts/schemas.js` builds it from the engine's own tables.
- It refuses everything `normalize` would refuse without looking at the data
  (`VIEW_ISSUES[code].schema`).
- Only `normalize` checks what only the data can tell: a field's name and type, an aggregator for a
  field.
- A validator checks a filter against the schema of its `type` alone, so its errors are about that
  type.
- It carries the default `LIMITS`. A host with other limits checks those with `normalize`.

### Describing data and views

Plain, structured summaries for a log, an approver or an LLM that writes or explains views. They are
JSON with one short English `text` per part, without a locale, and nothing rendered. Values from the
data are data, and a prompt should mark them as such.

| Function | Returns | What |
| --- | --- | --- |
| `describeSource(data, { items })` | `{ rows, fields, text }` | Per field: `name`, `type`, and the `aggregators` and filter types (`filters`) that work on it. Encoded data adds `distinct`, `blanks`, the first `items` and `min`/`max` of numbers and dates (dates as ISO days). `items` holds at most `DESCRIBE_LIMITS.items`, 20, each cut at 80 characters. A schema `{ fields }` or a fields array gives the types only (`rows: null`). Rows that are not encoded throw `INVALID_ARGUMENT`, so `encode()` them first. Field names in the `text`s are cut at 80 characters, as items are. |
| `describeView(view, schema, { limits })` | object | The view as `normalize` reads it, in parts: `rows`, `cols`, `values` with their names, `filters`, `derived`, `sort` and `display`. Each normalized filter has its `text`: `Region is one of "North", "South" (blanks dropped)`. It adds `valid`, `errors` and `warnings` of `validate`, and `text`, the whole view in one sentence. A part with an error is left out of the parts. The `text` of an invalid view starts with `(invalid: n errors, the parts they name are left out)`. |

### A view from field names { #view-from-field-names }

`viewFromLayout` and `suggestLayout` work with field names instead of a view. The command line's
layout flags and `describe
--suggest`, and the operations' `layout` and `suggest_view`, build with them. Both are pure functions over a
[description](#describing-data-and-views) of the data. The view they return is raw, so `normalize()`
or `validate()` it against the data like any view from outside.

```js
import { describeSource, encode, suggestLayout, validate, viewFromLayout } from "pivotkit-core";
const data = encode(rows);
const description = describeSource(data);
const { layout, picks } = suggestLayout(description);          // a first layout and why each part
const { view, name, notes } = viewFromLayout({ ...layout, values: [{ field: "Revenue", agg: "average" }] }, description);
const { valid, errors } = validate(view, data);
```

| Function | Returns | What |
| --- | --- | --- |
| `viewFromLayout(layout, description, { locale })` | `{ view, name, notes }`: `view` is a raw `LayoutView`, and `normalize(view, data).view` is the `View` | `layout`: `{ rows, cols, values: [{ field, agg }], groups: [{ field, by, size }], filters, chart, map }`, every key optional. Names match the description case-insensitively and take its spelling. A grouping takes its field's place on the axes and gets the name the report gives one (`Date by month`, German `Date nach Monat`: `GROUPING_NAMES`). A date on an axis without a grouping is grouped by its span (`dateUnitFor`, note `dateGrouped`). A value without `agg` is summed when its field is a number that is no identifier (`isIdentifierName`), else counted. `chart` shows that chart type. `map` renames the layout's names first, by the rules of `renameFields`, so a mapped number is summed and a mapped date grouped. A grouping of a field the description does not have is left out, so `normalize` names the field itself with the name meant. Names are German for a `de` locale, English for any other. An unknown field, aggregator or unit passes through, so `normalize` names it with "did you mean". `name` says what the view shows (`Sum of Revenue by Region and Date by month`). A layout of another shape throws `INVALID_ARGUMENT`. A layout beyond `LAYOUT_LIMITS` (64 entries per list, 1,024 characters per name) throws `LIMIT_EXCEEDED`. `notes`: `dateGrouped`, `unusedGroup` (a grouping on no axis and in no filter), `unusedMap`. |
| `suggestLayout(description, { locale })` | `{ layout, picks, notes }` | A first layout. Rows: the first text field that is a category:<br>- its name is not an identifier's name<br>- with counts, it has 2 to 50 values that repeat<br> Columns: the first date, grouped by its span or by its own `by` (a grouping a front end sets where the span is not to be read). Without a date, Columns gets the next category of up to 12 values (`SUGGEST_LIMITS`). Values: the first number that is no identifier, summed. Without one, the count of rows. Without a category the date goes to rows. `picks`: per part its `code` (`category`, `date`, `secondCategory`, `firstNumber`, `countRows`), the field, and `others`, the fields it could have taken. With nothing to group by, it returns the note `noSuggestion`. The rules read types and counts, not meaning: a temperature is summed like revenue. |
| `renameFields(view, map)` | `{ view, unused }` | Renames every reference to a data field, all at once and case-insensitively: rows, columns, values, filters and their measures, sort and its measure, the groupings' source fields. A grouping's own name stays. Two old names onto one new name would join two fields, and so would a used field renamed to a field the view keeps. Both throw `INVALID_ARGUMENT`. |
| `dateUnitFor(min, max)` | unit or `null` | The grouping for a span of dates in ms, the latest minus the earliest. 1 Jan to 4 Mar is 62 days. Up to 62 days `day`, up to two years `yearMonth`, up to six `yearQuarter`, longer `year`. `suggestDateUnit` returns the same for a field. |
| `isIdentifierName(name)` | boolean | Whether a name's last word is ID, Nr, No, Number, Key or `#` (`CustomerId`, `Order No`, `Serial#`). The report's field list and a layout count such a number field instead of summing it. |
| `groupingName(field, unit, { locale, size })` | text | A grouping's name as the report gives it, from `GROUPING_NAMES` (`en`, `de`). |

### View files

A view file is one JSON document with a view, its name, the data it was made for and the fields it
uses. pivotkit-react shares it as JSON, as a file and, in its link profile, as a link.
[View file format](view-file.md) describes the format, its rules and its JSON Schema.

| Function | Returns | What |
| --- | --- | --- |
| `toViewFile(view, meta?, { link })` | object | The view file, keys in their canonical order. `meta` has these keys:<br>- `name`<br>- `description`, left out when empty<br>- `createdAt`, a `Date` or ISO text, left out without it<br>- `generator` (`{ name, version }`)<br>- `source` (`{ id, name, params }`), whose `params` are written with an id only ([`source.params`](view-file.md))<br>- `data`, an `Encoded`: with it, `source.fields` lists the fields the view uses with their types<br> `link: true` gives the link profile: format, version, `source.id`, `name` and the view only. A view that is no object throws `TypeError`. |
| `fromViewFile(input, { data, sourceId })` | `ViewFileRead` | Reads a view file, a bare view or a template `{ name, view }` from its text or parsed object. It never throws. The result: `view` as parsed, not normalized, `null` when it cannot be used. Also `envelope`, `name`, `description`, `createdAt`, `generator` and `source`. `failed`: `"empty"`, `"tooLarge"`, `"notJson"`, `"notView"`, `"newerFormat"`, `"newerView"`. `issues`: what was left out of the envelope. With `data` it adds `compatible` `{ ok, source: "same" \| "other" \| "unknown", missing, changed, needs }`. |
| `viewFileText(file)` | `string` | The file as JSON with a 2-space indent and a trailing newline. |
| `viewFileName(name)` | `string` | `"<slug>.pivotkit.json"`: "Revenue by region" gives `revenue-by-region.pivotkit.json`. A name without a letter or digit gives `view.pivotkit.json`. |
| `viewFileFields(view)` | `string[]` | The data's fields a view uses, each once: rows, columns, values, filters, sort. A grouping counts as its source field. |
| `VIEW_FILE_FORMAT`, `VIEW_FILE_VERSION`, `VIEW_FILE_SCHEMA`, `VIEW_FILE_LIMITS` | | `"pivotkit-view"`, `2` (the version written, while 1 is read too), the schema's address, and `{ text: 1000000, name: 256, description: 2000, fields: 1000 }`. |

## Pivot

### `computePivot(data, view, options?)`

Builds the row and column key trees with subtotals and totals. It normalizes the view first, so raw
user input is fine. Options:

- `locale`.
- `limits`. It computes `work` before the aggregation starts. It counts `groups` and `pivotCells`
  while the key trees and the cells grow. Over one of them, it throws `LIMIT_EXCEEDED`.
- `now`: today for relative date ranges ("the last 5 years",
  [Filters](../concepts/filters.md#relative-date-ranges)). It takes a `Date`, epoch milliseconds or
  an ISO string, read in the data's time zone like any date. An ISO string without an offset is read
  as written. The default is the current time. Anything else, and epoch milliseconds beyond what a
  `Date` holds, throws `INVALID_OPTION`.

The `PivotResult` has, among others:

| Member | What |
| --- | --- |
| `view` | The normalized view. |
| `issues` | What `normalize` dropped, and a time zone that differs from the data's (`code: "timeZoneMismatch"`). |
| `locale`, `timeZone` | The resolved locale and the data's time zone. |
| `rows` | The source row indices left after all filters. |
| `filters` | Per filter of the view, in its order: `{ field, type, kept }`, the source rows left after it. Filters apply in turn: item filters in the view's order, then value filters from the outer level in. So `kept` says what each one took away from the rows before it. It is `null` for a filter whose field is not in the data. |
| `rowRoot`, `colRoot`, `rowNodes`, `colNodes` | The key trees and their nodes. |
| `value(row, col, i)` | The raw aggregate of value `i` at a row and column node. |
| `display(row, col, i)` | The same after "show values as". |
| `hasRows(row, col)` | Whether any source row is behind a cell (a blank cell of a combination without data has none). |
| `label(axis, node, labels?)` | A node's label as the table shows it. |

### `relativeDateRange(unit, count, options?)`

The dates a relative date range keeps, both included: `relativeDateRange("year", 5, { now:
"2026-11-09" })` is `{ from: "2022-01-01", to: "2026-12-31" }`.

- Whole days are ISO days.
- Where a bound is not at midnight (hours, a rolling range), it is the minute: `"2026-03-15T12:00"`.
- `"before"` has `from: null`.

`unit` is one of `CATALOG.relativeUnits`: `hour`, `day`, `week`, `month`, `quarter`, `year`. `count`
is a whole number from 1 to `CATALOG.relativeMaxCount`, 500. It is not read for `"this"`.

The options are those of a filter ([Relative date ranges](../concepts/filters.md#relative-date-ranges)):

- `direction`, `calendar` and `includeCurrent`.
- `anchor`: `"today"`, `"latest"` with `latest`, `"first"` with `first`, or a date.
- `weekStart`: 1 to 7, default 1.
- `now`: as in `computePivot`, default the current time. Beyond what a `Date` holds, it throws
  `INVALID_OPTION`.
- `timeZone`: the data's, default `"UTC"`, never the machine's.

It returns `null` for anything a filter could not have, an anchor without its date, or a range that
leaves what a `Date` holds (the years -271821 to 275760). A UI shows the range with it ("last 5 years
(2022–2026)", "last 12 months to Dec 2025").

### Drill-down

| Function | What |
| --- | --- |
| `findNode(result, axis, path)` | The node of `"rows"` or `"cols"` for a key path. `[]` is the grand total. Returns `null` when there is none. |
| `cellRows(result, { row, col })` | The source row indices behind a cell, in data order, as an `Int32Array`. `row` and `col` are nodes or key paths. Omitted or `[]` means all rows. |

## Output

### `toGrid(result, options?)`

Header and body rows with merges, totals, formatted text and raw values, toggles for collapsed groups
and conditional-formatting ratios. Options: `locale`, `labels` and `limits`. `cells` caps the grid's
size, and `toGrid` counts it before it allocates anything.

| `Grid` member | What |
| --- | --- |
| `rows` | `GridCell[][]`, header rows first. `null` is a cell covered by a merge. |
| `headerRows`, `rowHeaderColumns`, `columnCount` | The layout. |
| `merges` | `{ row, col, rowSpan, colSpan }[]`. |
| `dataColumns`, `bodyRows` | `dataColumns`: per value column its `colPath`, `valueIndex` and `total`. `bodyRows`: per body row its `rowPath`, `total` and `collapsed`. Without values there is one column per column line (`valueIndex` -1, empty cells under the labels). With no column fields either, there are no columns. |
| `formats`, `valueNames`, `conditional` | Per value. |
| `showAs` | Per value its "show values as" type, or `null`. |
| `locale`, `timeZone` | What the texts are formatted in. The exports use them too. |

A `GridCell` has these members:

- `text`: formatted.
- `value`: raw.
- `kind`: `"corner"`, `"colHeader"`, `"rowHeader"` or `"value"`.
- `total`: 0 none, 1 subtotal, 2 grand total.
- Where they apply: `rowSpan`, `colSpan`, `valueType`, `format`, `field`, `rowPath`, `colPath`,
  `valueIndex`, `toggle` (`{ axis, path, collapsed }`) and `style` (`{ scale, bar, color }` for
  colour scales and data bars).
- On value cells, `hasRows`. `false` means no source row is behind the cell, so there is nothing to
  drill into.

With one value, its name is a single header cell over all of its columns, as in Excel.

The view's `totals` decide the total rows and columns, with two rules of their own:

- Without values there are none. A total would have no number. With fields in Columns alone, the one
  body row has no label.
- A group with a single child has no subtotal, since it would repeat the child. The group keeps its
  toggle.

### `toSeries(result, options?)` and `toEChartsOption(result, options?)`

`toSeries` gives chart data. `toEChartsOption` gives a plain [Apache ECharts](https://echarts.apache.org/)
option for bar, stacked bar, line, area, pie, donut and heatmap. Neither imports ECharts itself.
`toEChartsOption` is also exported from [`pivotkit-core/chart`](#chart-marks). Import it from there to
load it with the chart, not with the first load.

| Option | Of | What |
| --- | --- | --- |
| `chart` | `toEChartsOption` | `{ type, stacked, horizontal, valueLabels, legend, title, smooth, axisLabels, groupLabels, labelPosition, tooltip }`, over the view's chart ([Charts](../concepts/charts.md)). |
| `theme` | `toEChartsOption` | `ChartTheme`: `colors`, `textColor`, `axisColor`, `gridColor`, `backgroundColor` (default transparent), `fontFamily`, `strongWeight` (the font weight of the title and the group labels, default 600), `titleSize` (the title's font size in px, default 16), `textSize` (the font size of every other text, the axes, the legend and the labels, in px, default 14), `heatmapColors` (low, high), `pieRadius` (inner and outer radius of a pie, default a whole circle, `0%`, `70%`), `donutRadius` (of a donut, default a ring, `42%`, `70%`). |
| `locale` | `toEChartsOption` | Used when the view names none. Default: the pivot's locale. |
| `labels`, `limits` | both | `labels`: texts. `limits`: `cells` caps the data points. |
| `separator` | both | Between the parts of a multi-level label, default `" / "`. |
| `maxCategories` | both | Plots the first categories in the view's order. `toSeries` reports `categoryCount`, the number before the cut. |
| `series` | `toEChartsOption` | The `toSeries` result of the same result and options, when the caller has it already. |

`chart.type` `"auto"` is the view's default. It draws what `autoChartType(view, data)` says: `"line"`
when a date or a grouping of one along the time line is on Rows, else `"bar"`. Weekday, hour and
month of year are not along the time line. A pie writes its share as the locale writes a percentage.
A heatmap writes its colour scale (`visualMap.formatter`) in the value's number format.

### `autoChartType(view, data)`

What the chart type `"auto"` stands for, for a normalized view and its data. It is `"line"` when a
field on Rows is a date or a grouping of one along the time line, else `"bar"`. A repeating grouping
such as weekday counts as categories. A date on Columns alone gives `"bar"`. A UI that wants lines
there swaps rows and columns for the chart. pivotkit-react and pivotkit-report do so through
`chartPlan`.

### `chartPlan(view, data)`, `swapAxes(view)` and `chartThemeFrom(style)`

What a chart draws, the same on the screen, in an SVG and in a printed report.

`chartPlan` gives `{ auto, swap, chart: { type, stacked, horizontal } }`:

- A type the view chose stays as it is.
- For `"auto"`: lines when a date is on Rows.
- For `"auto"`: lines with `swap: true` when a date is on Columns only. Draw from the pivot of
  `swapAxes(view)`, so the dates run along the axis.
- For `"auto"` otherwise: bars.

`swapAxes` returns a copy of a normalized view with Rows and Columns swapped. Their collapsed groups
move with them. A "show values as" that names an axis turns to the other one, so every number stays
what it was.

`chartThemeFrom` reads from any object with `getPropertyValue`, such as a report's computed style or a
map of tokens. It reads the chart's theme:

- `colors` from `--pk-chart-1` to `--pk-chart-8`.
- The text, axis and grid colours, the heatmap's ends and the font.
- `strongWeight` from `--pk-weight-strong` when it is a number from 1 to 1000.
- `titleSize` from `--pk-chart-title-size` and `textSize` from `--pk-chart-text-size` when they are
  in px.

It also reads a workbook's colours, as CSS writes them. Make them `#rrggbb` for `toXlsx`.

- `colorScale` from `--pk-scale-low`, `--pk-scale-mid` when set, and `--pk-scale-high`.
- `dataBar` from `--pk-chart-1`.

A token that is missing or not readable keeps `DEFAULT_THEME`'s value. `CHART_COLORS` is 8.

### The chart's marks: `pivotkit-core/chart` { #chart-marks }

This entry point exports `toEChartsOption` too, so a bundle loads the option with the chart.

`decorateOption(option, style, { width, height, categoryNames, axisLabels, tooltipFormatter, readColor })` puts
a report's marks on `toEChartsOption`'s option:

- The theme's colours from the `--pk-*` tokens of `style`.
- Bars and pie slices with `--pk-radius-chart` corners in px. A heatmap's cells get three quarters of
  it. The default is `DEFAULT_THEME.markRadius`, 4.
- A tooltip with `--pk-radius-card` corners, default 8 px.
- A bar that lights up alone under the pointer. A line lights up as a whole.
- 2 px lines.
- The room around a pie, and room beside it for the labels outside.
- A legend moved below a narrow chart.
- The category axis laid out for the chart's size (`categoryLabelLayout`: straight, slanted or every
  n-th, `chart.axisLabels`). The option's `axisEvery` says when every n-th label is written.
- Room on the right for the values at the end of horizontal bars, and fewer value ticks where a
  narrow axis needs them.
- A heatmap's row names and cell numbers where its cells have room.
- With `readColor`, a heatmap's colours as ECharts can mix them. ECharts' own parser reads hex,
  `rgb()`, `hsl()` and some names only. Another form, such as `oklch()`, turns the cells black.
  `readColor(color)` returns a colour ECharts reads, or `null`. An end with `null` takes
  `DEFAULT_THEME.colorScale`'s colour.

pivotkit-react adds its DOM tooltip through `tooltipFormatter`. Its `readColor` turns any colour the
browser reads into `#rrggbb`. pivotkit-report's keeps the colours ECharts reads. Any other one
takes the default. It follows the view's `chart.tooltip`
([Charts](../concepts/charts.md#display-settings-for-the-people-who-use-the-report)). [pivotkit-report](report.md) draws the
SVG with `decorateOption`. The layout measures the labels at the option's text size
(`textStyle.fontSize`, the theme's `textSize`).

The entry exports the layout functions and their constants too: `categoryLabelLayout`,
`categoryLabelWidth`, `columnLabelLayout`, `groupLabelsFit`, `heatmapCellLabels`, `pieLabelRoom`,
`ringLabelsFit` and `rowLabelInterval`. Those that measure text take its size in px as `fontSize`,
`DEFAULT_THEME.textSize` by default. They estimate a text's width per character: a whole em for CJK
and fullwidth characters, 0.7 em for a capital, 0.55 em for the others.

`heatmapCellLabels` and `rowLabelInterval` take an optional last argument `frame`, `{ x, y }`: the
px of the chart that are not cells, beside them (`x`) and above and below them (`y`). By default it
is a heatmap of pivotkit-core with straight column names. `categoryLabelLayout` takes `reserved` in
its box: the px of the height that are neither plot nor category labels. The entry imports nothing, so a report's first load does not
carry it.

`toSeries` gives these members:

- `categories`: the whole path of each category, "Asia / Japan".
- `categoryLevels`: its label per level, `["Asia", "Japan"]`.
- `categoryPaths`, `series` and `totals`.

The view's display settings are part of the option:

- A `title`.
- The legend where `chart.legend` puts it, and room for it.
- Value labels (`label` of the series). A pie or a donut writes them outside. With
  `chart.labelPosition` `"inside"`, it writes them on the slices without a label line.
- `smooth` lines.
- A second category axis with the outer field's items, once per group at its middle, with a
  separator tick where a group starts. It needs `chart.groupLabels` (`"auto"` or `"on"`) and two or
  more row fields. The UI hides `"auto"` ones in a small chart. `xAxis` or `yAxis` is then a list of
  two.

Where to write the category labels (`chart.axisLabels`) depends on the chart's size, so the UI
decides it (`categoryLabelLayout` of [pivotkit-core/chart](#chart-marks)).

### Links: `pivotkit-core/link`

A view as a short text for a link and back. It is a separate entry point, so a page that never
shares does not load fflate. The format is pivotkit's share format: `1.` and the JSON compressed with
raw DEFLATE, in base64url.

pivotkit-react encodes the [link profile of a view file](view-file.md#the-link-profile)
(`toViewFile(view, meta, { link: true })`). `decodeViewLink` gives back whatever object was encoded.
`fromViewFile` reads it, a bare view too. See [Sharing](../concepts/sharing.md).

| Name | What |
| --- | --- |
| `encodeViewLink(view)` | The text of a link to a view. Throws `PivotkitError` `LIMIT_EXCEEDED` (`details.limit` `"link"`) when the text would be longer than `LINK_LIMITS.text`. Throws `INVALID_ARGUMENT` for a non-object.<br><small>Returns `string`</small> |
| `decodeViewLink(text)` | The view of a link text as parsed JSON, or `null` with an issue that says why, its `code` of `LINK_ISSUE_CODES`: `linkEmpty`, `linkTooLong`, `notLink`, `linkDamaged`, `linkTooLarge`, `notView`, `notJson`. Never throws. The view is user input: pass it to `normalize()`.<br><small>Returns `{ view, issues }`</small> |
| `readViewLink(hash, key?, { allowParams, limits })` | The view of a page's fragment. It decodes the entry of `key` (`#pivot=`, or `#pivot-<key>=` for a report with that key) and reads it as a view file. `src` is the data source it names, `{ id, params }`, or `null` without an id. `id` is the host's opaque name of the data. `params` holds only the parameters the host lists in `allowParams`, none by default, within `limits.srcParams` and `srcParamLength`. It leaves out the others with an issue. `failed`: `"none"` (no entry), `"link"` (the text is no link, `issues` says why), or `fromViewFile`'s. A bad link never throws. A bad `limits` throws `INVALID_OPTION`, link or not. Normalize the view with `outsideLimits()`.<br><small>Returns `{ view, src, name, failed, issues }`</small> |
| `linkParam(key?)`, `linkFragment(hash, key?)`, `withLinkFragment(url, key, text)` | `linkParam`: the name of a report's entry in the fragment (`"pivot"`, `"pivot-<key>"`). `linkFragment`: its link text in a fragment, or `null`. `withLinkFragment`: a URL with it added, replaced or, with `text` null, removed. The rest of the fragment stays byte for byte. All three are in the main entry too, without fflate. |
| `LINK_LIMITS` | `{ text: 32000, json: 1000000 }`: the characters of a link text, and of the view inflated. The cap holds while inflating: it reads 1 KiB of input at a time and stops at the cap. |

### Templates: `pivotkit-core/templates` { #templates }

Reads a list of named views, such as shared views or a person's own. It also reads the templates an
OpenAPI document or a JSON Schema carries in the extension `x-pivotkit-views`. The extension is
pivotkit's own convention, not part of either standard. It is a separate entry point, so a UI loads
it only where it reads templates (pivotkit-react with its menus). See [Templates and shared
views](../concepts/templates.md).

| Name | What |
| --- | --- |
| `parseTemplates(input)` | Reads a list, or its JSON text, of view files, templates `{ name, view }` and bare views with a `name`, with `fromViewFile`. Never throws. It leaves out an entry with an issue (path `[i]`) when the entry has no name or no usable view, has a newer format or view version, or is no JSON. Names and descriptions are plain text, at most 256 characters, and lose control, bidi and zero-width characters. It caps the text and the number of entries before it reads them (`TEMPLATE_LIMITS`). Entries given as objects count as their JSON. The views are as parsed, not normalized.<br><small>Returns `{ templates: [{ name, view, description?, source? }], issues }`</small> |
| `templatesFromSchema(doc, { schema })` | The templates of `x-pivotkit-views`, read by `parseTemplates`. It reads them on the schema `schema` names (a schema of `components.schemas` or `definitions`, or a local `$ref`), else on the document's root. It follows only local references, as deep as `SCHEMA_CAPS.depth`, and the list may be one too. It fetches nothing. Without the extension there are no templates and no issue. A document that is no object, or a schema name it lacks, throws `PivotkitError` `INVALID_ARGUMENT`. Issues have the path `x-pivotkit-views[i]`.<br><small>Returns `{ templates, issues }`</small> |
| `TEMPLATE_LIMITS` | `{ count: 500, text: 5000000 }`: the templates read from one list, and the characters of its JSON. |
| `TEMPLATES_EXTENSION` | `"x-pivotkit-views"`. |

### Loading files: `pivotkit-core/import`

A separate entry point whose readers load on demand. It holds:

- `readFile(file, { plugins })`: reads CSV, TSV, text and JSON, and other formats with reader
  plugins, into a table that is `encode`'s columnar input.
- `retype`: changes column types without reading the file again.
- The plugin contract (`validatePlugin`, `readerFor`, `loadReader`) and the helpers a plugin builds
  its table with.
- `sourceIdOf(name, columns)`: the id by which a loaded file's views name it
  ([how a loaded file is named](import.md#how-a-loaded-file-is-named)).

See [Loading files](import.md), [Plugins](plugins.md) and [Write a plugin](write-a-plugin.md).

### Export: `pivotkit-core/export`

| Function | What |
| --- | --- |
| `toXlsx(grid, { sheetName, theme, dataAsOf })` | An Excel workbook: typed cells, number formats as in the grid, merged headers (a label over several rows at their top), bold totals, frozen panes, native colour scales and data bars. `sheetName`: default `"Pivot"`, at most 31 characters. `\ / ? * [ ] :` and control characters become spaces. Apostrophes at either end are dropped. `"History"`, which Excel reserves, becomes `"History 1"`. `theme`: `{ colorScale, dataBar }` for conditional formats whose view names no colours, default `DEFAULT_THEME`'s. Colours are `#rgb` or `#rrggbb`, and `colorScale` has two or three colours, low to high. pivotkit-react passes the colours its report resolves from its tokens. `dataAsOf`: when the data is from, `"2026-11-15T08:00:00Z"`, in UTC to the second. Another form throws `INVALID_ARGUMENT`. It is written as the custom document property `DataAsOf`, a date. Without it, there is no document property.<br><small>Returns `Uint8Array`</small> |
| `isDataAsOf(value)` | Whether a value is a `dataAsOf`: a text in UTC to the second (`"2026-11-15T08:00:00Z"`) that names a time that exists (no 30 February, no hour 25). `toXlsx` and pivotkit-report's `render` take it.<br><small>Returns `boolean`</small> |
| `toCsv(grid, { separator, repeatLabels, numbers, flatHeader })` | CSV. `separator`: default `";"` where the grid's locale writes decimals with a comma (de-DE), else `","`. The locale also gives the decimal mark. `repeatLabels`: default `true`, which writes a row label that spans several rows on each of them, so every line stands on its own. `false` writes it once. Numbers keep 15 significant digits, in Latin digits with the decimal mark the locale uses with Latin digits (`ar-EG` writes `.`). `numbers: "shown"` rounds every number to the decimals of its format instead, so a sum of 0.1 and 0.2 values is `9.6`, not `9.59999999999999`. A format without plain decimals (`compact`, `bytes`, a duration) keeps 12 significant digits then. A percent and a "show values as" value are always written as the table shows them, rounded to the decimals of their format. A percent is written in percent with a `%` (`-2.6%`). The XLSX keeps their full precision. `flatHeader: true` writes one header row instead of one per column field: the row fields' names, then each column's labels joined with ` / `, without the value's name when the view has one value. Dates are ISO dates. A year before 0 or after 9999 has its sign and six digits and is guarded like text: `'-000001-01-11`. Text a spreadsheet would run as a formula gets a leading `'`. Bidi controls (U+202A to U+202E, U+2066 to U+2069 and the like) are left out.<br><small>Returns `string`</small> |
| `toCsvBytes(grid, { separator, repeatLabels, numbers, flatHeader, bom })` | The same as UTF-8 bytes, with a byte order mark so Excel detects the encoding. `bom: false` leaves it out.<br><small>Returns `Uint8Array`</small> |
| `toTsv(grid)`, `toTsv(rows)` | For the clipboard, tab-separated with CRLF line ends. It writes the grid as the table shows it: each cell's display text, headers and totals, a row label repeated on every row it spans. Or it writes rows of display texts, the first being the headers. A spreadsheet takes it as columns when it is pasted, and in the same locale reads the numbers and dates back. As in the CSV, text a spreadsheet would run as a formula gets a leading `'`, and bidi controls are left out. A cell with a tab, a line break or a quote is quoted.<br><small>Returns `string`</small> |
| `toJson(grid, { space, numbers })` | The grid's data as JSON text: `{ rowHeaders, columns, rows }`. `rowHeaders`: the names of the row label columns. `columns`: per value column `{ labels, value, total }`: the header texts above it, the value's name, and `total` 0 none, 1 subtotal, 2 grand total. `rows`: per body row `{ labels, total, collapsed, values }`. `labels` repeats a label on every row it spans, with `""` beside a subtotal's label and beside a collapsed group. `collapsed` is true for a collapsed group, whose values are the group's totals. `values` come in the order of `columns`: numbers with 15 significant digits, a "show values as" share as the fraction (0.25 for 25%, the table shows "25%"), dates as ISO dates of their wall clock, text as it is, a blank cell `null`. `space`: indentation, default 2, `0` for one line. `numbers: "shown"` rounds each number to the decimals of its format, a share to those of its percentage.<br><small>Returns `string`</small> |
| `rowsToCsv(data, indices, { columns, locale, formats, labels, separator, limits })` | Source rows as CSV: the rows at `indices` of the encoded `data`, a header row with the fields' display names (`labels.fields`), one line per row. `indices` are the positions `cellRows` gives, a drill-down's rows. `columns`: the fields and their order, default every column of the data. Each value appears as a drill-down panel shows it. A number has its field's format (`formats`, a format name per field, matched case-insensitively) or up to 6 decimals. A date is its day, with the time when the column has times. Yes/no are `labels.true` and `labels.false`. The format `text` keeps an identifier as it is. It writes as `toCsv` writes the grid: separator and decimal mark of `locale`, numbers with full precision, dates as ISO dates, the formula guard. Rows x columns count against `limits.cells`.<br><small>Returns `string`</small> |
| `rowsToCsvBytes(data, indices, { ..., bom })` | The same as UTF-8 bytes with a byte order mark.<br><small>Returns `Uint8Array`</small> |
| `dataToCsv(data, { columns, limits })` | The data itself as CSV, to read again (the CLI's `--data`, a script, a spreadsheet). A header with the fields' own names, the names a view uses rather than their display names. Then every row with its values as they are, not formatted. Always `,` between values and `.` as the decimal mark, whatever the locale. Numbers with every digit JavaScript writes (`1e-7`, `0.30000000000000004`). Dates as ISO text of their wall clock without an offset: `2026-07-03` in a column without clock times, else `2026-07-03T08:15:00`, with milliseconds when they are set. `true` and `false`. A blank is empty. Derived fields are no columns of the data and are never written. Text keeps the formula guard and loses bidi controls, as in `toCsv`. Read back with `readFile` (pivotkit-core/import), it gives the same columns, types and values, with two exceptions. A text column whose values all look like numbers, booleans or dates comes back as that type, since a CSV cannot mark them as text. Text with a leading zero, such as `007`, stays text ([types](import.md#types)). `dataToJson` keeps the text, and the CLI reads such a field as the type a view file lists for it. The reader leaves out a row without any value. `columns`: the fields and their order, default every column. A name of no column is left out, and a name given twice is written once. A blank that is the only value of its line is written `""`, so the line keeps its row in any reader (pivotkit's own reader skips a row without any value). Rows x columns count against `limits.cells`.<br><small>Returns `string`</small> |
| `dataToCsvBytes(data, { columns, limits, bom })` | The same as UTF-8 bytes, with a byte order mark. `bom: false` leaves it out.<br><small>Returns `Uint8Array`</small> |
| `dataToCsvParts(data, { columns, limits, bom })` | The bytes of `dataToCsvBytes` in pieces of whole lines, 10,000 lines each, for `new Blob(parts)`. It never holds the text whole, so a large file takes about twice its size in memory while it is made. The whole text first would take about five times.<br><small>Returns `Uint8Array[]`</small> |
| `dataToJson(data, { columns, limits })` | The data itself as JSON text: an array with one object per row, one row per line. Each field is under its own name, and the values are typed. Numbers, `true`/`false`, and text as it is, without the formula guard, since programs read JSON. Dates are ISO text as in `dataToCsv`. A blank is `null`. These are the data's blanks: `encode` reads empty text as blank. `columns` as in `dataToCsv`. Read back with `readFile`, it gives the same columns, types and values, text that looks like a number included.<br><small>Returns `string`</small> |
| `scaleColor(colors, t)` | The colour at `t` (0 to 1) of a colour scale of two or three hex colours, as the grid computes a cell's (`style.color`).<br><small>Returns `string`</small> |
| `rowsToXlsx(data, indices, { columns, locale, formats, labels, sheetName, limits })` | Source rows as an Excel workbook. It has a bold, frozen header row. Numbers and dates are typed cells with the number format the panel shows them in, and text is inline strings. `sheetName` as in `toXlsx`.<br><small>Returns `Uint8Array`</small> |

[Security](../security.md#exports) and [Values](../concepts/values.md#export) describe what the
files contain and where Excel's number formats cannot follow the grid.

## Helpers

| Name | What |
| --- | --- |
| `createHistory(startView, { limit })` | Undo, redo and reset for views: `current`, `canUndo`, `canRedo`, `push(view)`, `undo()`, `redo()`, `reset()`. `push` returns whether the view was a step, and an unchanged view is not one. `reset` goes back to the start view as one step that can be undone. `limit` defaults to 100 steps. |
| `formatter(format, { locale })` | A named [format](../concepts/values.md#formats) as a function from a value to text. |
| `MAX_DATE_MS`, `isDateMs(ms)` | `MAX_DATE_MS`: the most milliseconds from the epoch a `Date` holds either way (`8.64e15`, the years -271821 to 275760). `isDateMs`: whether a value is a number within it. `new Date(ms)` of any other is invalid, and formatting it throws. For a host that builds dates or a `now` of its own. |
| `isFormat(format)` | Whether a name is a known format. |
| `CATALOG` | Every name a view accepts, for a UI's menus: `aggregators`, `commonAggregators`, `columnTypes`, `deriveUnits`, `timelineUnits`, `cyclicUnits`, `filterTypes`, `filterFields` (per filter type, the field types it works on), `filterBlanks`, `textOps`, `textOn`, `matchCases`, `matchWhitespace`, `compareOps`, `comparePrecisions`, `topTies`, `relativeUnits`, `relativeDirections`, `relativeMaxCount`, `relativeAnchors`, `formats`, `showAs`, `showAsAlongAxis`, `chartTypes`, `chartValueLabels`, `chartLegends`, `chartAxisLabels`, `chartGroupLabels`, `chartLabelPositions`, `chartTooltips`, `additiveAggregators`, `additiveShowAs`, `displayModes`, `conditionalTypes`. |
| `aggregatorsFor(type)` | The aggregators that fit a field type. |
| `AGGREGATOR_ALIASES` | Other tools' names of aggregators and the ones they mean: `avg` and `mean` are `average`, `cnt` is `count`, `total` is `sum`, `distinct` is `countUnique`, `stddev` is `stdev`. For "did you mean" only: a view never accepts them. |
| `foldText(text, match?)` | A text folded as text filters compare it. `match` is `{ case: "insensitive" \| "sensitive", whitespace: "collapse" \| "exact" }`, default `MATCH_DEFAULTS`. `insensitive` lower-cases with `toLowerCase()`, which does not depend on the runtime's locale. `collapse` turns every run of whitespace, a no-break space (U+00A0) among them, into one space and trims the ends. A UI's search over a field's items folds with it, so a search and a text filter agree. |
| `MATCH_DEFAULTS` | `{ case: "insensitive", whitespace: "collapse" }`. |
| `closest(name, candidates)` | "Did you mean": the name of `candidates` closest to `name` as `foldText` folds both, else `null`. The edit distance is at most a third of the name's length, at least 1 and at most 3. A swap of two neighbours is one edit. `HINT_LIMITS` (`{ candidates: 1000, length: 64, distance: 3 }`) bounds it, so a hint costs a few thousand steps per name at most. The view's hints, pivotkit-report's template check and pivotkit-cli's options use it. |
| `DEFAULT_LABELS` | The texts the engine writes (blank, totals, value names, aggregator names, "show as" names), to override per call with `labels`. |
| `REPORT_LABELS`, `reportLabels(locale)` | The same texts as a report shows them, per language. `en` has yes/no as words and the aggregators' longer names ("Distinct count"). `de` has "Gesamtergebnis" and "Summe von Units". `reportLabels` gives a locale's texts: German for `"de-DE"`, English for any other. pivotkit-react's report and pivotkit-report use them. |
| `fieldLabel(field, labels)` | A field's display name from `labels.fields` (matched case-insensitively), else the name. With `labels.fields` the grid's corner headers, the value names, the exports and the chart show display names. The view keeps the field names. |
| `DEFAULT_THEME` | The defaults for charts and conditional formats. Colours for colour scales and data bars are those of pivotkit-react's light theme: `colorScale` `["#eaf1fb", "#2a78d6"]`, light for low and strong for high, and `dataBar` `"#2a78d6"`. A chart's title has the font weight `strongWeight`, 600, and the size `titleSize`, 16 px. Its other text has `textSize`, 14 px. The corners of its marks are `markRadius`, 4 px, and of its tooltip `cardRadius`, 8 px. It also holds the radius of a pie and of a donut. |
| `LIMITS` | The [limits](../concepts/limits.md#limits). |
| `ISSUE_CAP` | `{ perCode: 100, total: 1000 }`: the most issues of one code, and in all, that `normalize` and `validate` list for one view. The warning `tooManyIssues` counts the rest ([Views from outside](../concepts/limits.md#views-from-outside)). |
| `OUTSIDE_LIMITS`, `outsideLimits(limits)` | `OUTSIDE_LIMITS`: the tighter limits of a view from outside (a link, pasted JSON, an API, an LLM), `{ filters: 50, json: 1000000 }`. `outsideLimits(limits)`: the host's limits with each of these at most its preset value, to pass as `normalize`'s `limits` ([Views from outside](../concepts/limits.md#views-from-outside)). |
| `PivotkitError` | The error class. `code` is `INVALID_ARGUMENT`, `INVALID_OPTION`, `LIMIT_EXCEEDED` or `INVALID_FILE`, a file that cannot be read ([Loading files](import.md#errors)). `details` holds `{ limit, value, max }` for a limit, plus `file` and `what` (what was counted) for a file's limit. It holds `{ reason, file }` for a file that cannot be read. |

## Types

`View`, `ValueSpec`, `ValueRef`, `FilterSpec`, `DerivedSpec`, `SortSpec`, `Issue`, `IssueParams`, `Encoded`, `Column`,
`ColumnType`, `ColumnarData`, `EncodeIssue` (an issue of `encode`, while `Issue` is a view's),
`SchemaField`, `PivotResult`, `PivotNode`, `Grid`, `GridCell`, `FieldItem`, `ChartTheme`,
`Formatter`, `Limits`, `Labels`, `SchemaFieldDefaults`, `PivotkitErrorCode`, `ViewFileMeta`, `ViewFileRead`,
`ViewFileCompatibility`, `ViewFileSource`, `LayoutView` and `TextMatch`, from `pivotkit-core`.

## Performance

A benchmark of the engine with 100,000 rows: the median of 5 runs, Node 26 on one Mac with Apple
silicon. The numbers are approximate, and other machines differ. `npm run bench -w pivotkit-core`
measures your own:

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

These are the engine alone in Node. [Measured in the browser](../concepts/limits.md#measured-in-the-browser)
(`npm run bench:browser`) has the report in Chromium, Firefox and WebKit from 100,000 to 1,000,000
rows, with React's render and the steps of a person.
