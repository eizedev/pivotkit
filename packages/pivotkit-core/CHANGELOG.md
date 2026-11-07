# Changelog

All notable changes to `pivotkit-core` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-07

First release.

### Added

- The view file's JSON Schema ships in the package: `pivotkit-core/schema/view-file-1.json` (the same
  bytes the site publishes at https://pivotkit.eize.dev/schema/view-file-1.json); `toViewFile`'s
  `meta.schemaUrl` writes another `$schema` (a host's own copy) or, `null`, none.
  `formatVersion` must be the integer 1: any other value is refused, never read as 1.
- The view file: `toViewFile(view, meta, { link })`, `fromViewFile(input, { data, sourceId })`,
  `viewFileText`, `viewFileName`, `viewFileFields` and `VIEW_FILE_FORMAT`, `VIEW_FILE_VERSION`,
  `VIEW_FILE_SCHEMA`, `VIEW_FILE_LIMITS`: a view with its name, description, source (id, name, the
  fields it uses with their types), generator and an optional `createdAt` as one JSON document
  (`"format": "pivotkit-view"`, `formatVersion` 1, canonical key order, `<slug>.pivotkit.json`), its
  link profile, and a reader that never throws, ignores unknown keys, refuses a newer format or view
  version, caps sizes, reads own properties only, keeps names as plain text and says whether a view
  fits the data. The JSON Schema is published at https://pivotkit.eize.dev/schema/view-file-1.json.
- `pivotkit-core/link`: `encodeViewLink(view)` and `decodeViewLink(text)`, a view as a short link
  text (`1.` and its JSON deflated with fflate, base64url) and back; decoding never throws, caps the
  text (`LINK_LIMITS.text`, 32,000 characters) and the inflated view (`LINK_LIMITS.json`, 1,000,000)
  while inflating (1 KiB of input at a time, it stops at the cap), an empty payload is damaged, and returns `{ view, issues }` for `normalize()`.
- The chart type `"auto"`, the view's default (also for a view without `chart.type`): the data
  decides, lines when a date or a grouping of one along the time line (not weekday, hour, month of year) is on Rows, else bars; `autoChartType(view, data)`
  says which, `toEChartsOption()` draws it. Any other type is one the user chose. A pie's or donut's
  share is written as the locale writes a percentage ("35.7%", "35,7 %"); a heatmap's colour scale
  writes its ends in the value's number format.
- The view's chart has display settings: `valueLabels` (`auto`, `off`, `value`, `percent`, `both`),
  `legend` (`auto`, `bottom`, `right`, `off`), `title`, `smooth`, `axisLabels` (`auto`, `all`, `nth`)
  `groupLabels` (`auto`, `on`, `off`) and `labelPosition` (`outside`, `inside`: where a pie or a donut
  writes its labels), normalized against fixed lists (`CATALOG.chartValueLabels`,
  `chartLegends`, `chartAxisLabels`, `chartGroupLabels`, `chartLabelPositions`); `toEChartsOption()` draws them (title, legend placement and
  room, value labels, smooth lines, and with two or more row fields a second category axis with the
  outer field's items as group labels), and `toSeries()` gives `categoryLevels`.
- `fieldDefaultsFromSchema(schema, { schema })`: display names, descriptions, https links, column
  types and item orders of a row's fields from a JSON Schema or an OpenAPI 3 / Swagger 2 document
  (`title`, `description`, `externalDocs.url`, `type` and `format`, `enum`), as `{ defaults, issues }`;
  local `$ref`s only, each read once, `allOf` merged, nothing fetched or run, every size capped
  (`SCHEMA_CAPS`), what could not be read listed in `issues`; bidi controls and zero-width characters
  removed from the texts.
- `labels.fields` and `fieldLabel(field, labels)`: display names of fields in the grid's corner
  headers, the value names, the chart's series names and the exports; views keep the field names.

- `suggestDateUnit(data, field)`: the date grouping for a date field from the span of its values (day,
  month, quarter or year), so a UI can group a date as soon as it is placed.
- `toSeries()` and `toEChartsOption()` take `maxCategories`; `toSeries()` reports `categoryCount`;
  `toEChartsOption()` takes `series`, the `toSeries()` result the caller has already.
- `CATALOG.commonAggregators`, `CATALOG.timelineUnits` and `CATALOG.cyclicUnits` for a UI's menus.
- `DEFAULT_LABELS.showAsName` and `DEFAULT_LABELS.showAs`: a value shown as a calculation is named
  after it ("% of grand total of Sales").
- `fieldItems(data, field, { view, locale, labels, limits })`: the distinct values of a field, a derived
  field of the view too, with label and row count in the table's label order, for a filter list.
- `encode()`: typed columnar encoding (string, number, boolean, date including ISO strings) with Int32
  codes, dictionaries and Float64 measures; column names matched case-insensitively, colliding
  spellings listed in `data.issues`; `inferNumbers` turns numeric text into numbers, and
  `schema.fields[i].detected` shows when a text column holds only numbers.
- Time zones: Date objects and ISO strings with an offset are read at the wall clock of
  `encode(rows, { timeZone })`, default `"UTC"`, any IANA zone or `"local"`; the zone is recorded in
  `data.timeZone`, `result.timeZone` and `grid.timeZone`, and a view can carry `formatting.timeZone`.
- The view object (version 1) with `normalize()`, `validate()` and `migrate()`: rows, columns, values
  with format, "show values as" and conditional formatting, filters (include, exclude, label,
  top/bottom N, value conditions), derived fields (date grouping, number bins), sort, totals, collapsed
  groups, display, chart, locale and time zone. A view cannot run code; a newer view version is refused.
- `computePivot()` with Excel PivotTable semantics: count, countUnique, listUnique, sum, average,
  median, min, max, stdev, stdevp, var, varp, first, last; subtotals and grand totals; eleven "show
  values as" calculations; `findNode()` and `cellRows()` for drill-down.
- `toGrid()`: header and body rows with merges, totals, formatted text, toggles and conditional
  formatting; a single value's name is one header cell over all of its columns. Number ranges whose
  bounds are all whole numbers between -9,999 and 9,999 (years) are labelled without thousands
  separators ("1900 – 1910").
- `toSeries()` and `toEChartsOption()` for bar, stacked bar, line, area, pie (a whole circle,
  `DEFAULT_THEME.pieRadius`), donut (a ring, `donutRadius`, chart type `"donut"`) and heatmap; a heatmap's
  empty cells show the background (no split areas, which ECharts paints light grey in every theme)
  and its x axis names every column.
- `pivotkit-core/export` with `toXlsx()`, `toCsv()` and `toCsvBytes()`: workbook with typed cells,
  number formats that show cells as the grid does, merged headers, bold totals, frozen panes, column
  widths and native colour scales and data bars, every number with full precision; CSV with the grid
  locale's separator and a guard against formula injection, a percent and a "show values as" value
  as the table shows them (rounded to their format's decimals, a percent in percent with a `%`),
  other numbers with full precision.
- `LIMITS` and `options.limits`: besides the view limits, `rows` for `encode()`; `work` for the cell
  updates of `computePivot()` (computed before it starts, a median or unique count 10 times) and
  `groups` and `pivotCells` for its key trees and cells (counted while they grow); `cells` for the
  dense `toGrid()` and `toSeries()` (counted before allocating) and `cacheEntries` for the bounded
  cache of derived columns and sort orders. The defaults are sized for a browser tab: `rows`
  1,000,000, `work` 100,000,000, `groups` 500,000, `pivotCells` 2,000,000, `cells` 2,000,000,
  `cacheEntries` 16, 8 fields per axis (`axisFields`) and 16 values (`values`); the core README says
  what each one counts and why. `AGGREGATORS` entries say `keepsValues` when they store a value per
  row.
- `PivotkitError` with the codes `INVALID_ARGUMENT`, `INVALID_OPTION` and `LIMIT_EXCEEDED`.
- `CATALOG` and `aggregatorsFor()` for a UI's menus; `DEFAULT_LABELS`, `DEFAULT_THEME`.
- `createHistory()` for undo, redo and reset; generated TypeScript declarations; a benchmark script.
- A custom sort order: `sort: [{ field, by: "custom", items: [...] }]` puts the listed items first in
  their order and the others after them by label, like Excel's custom lists; `order: "desc"` reverses
  both.
- `result.hasRows(row, col)` and `hasRows` on the grid's value cells: whether any source row is behind
  a cell, so a UI can leave a blank cell without rows unclickable.
- `grid.showAs`: per value its "show values as" type, or null.

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-core@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-core@0.1.0
