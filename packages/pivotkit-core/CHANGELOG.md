# Changelog

All notable changes to `pivotkit-core` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** view version 2 ([#165](https://github.com/eizedev/pivotkit/issues/165)). Every filter
  has one shape, `{ field, type, ..., not, blanks }`: `not` inverts which items with a value it
  keeps, `blanks` (`"exclude"`, the default, `"include"`, `"only"`) alone decides the blank items.
  The types are `in` (was `include` and `exclude`), `blank` (new), `text` (was `label`: `on` the
  value or the label, `match` with case and whitespace, default insensitive and collapsed),
  `compare`, `relative`, `top` and `value`; `!=`, `notBetween`, `notEquals` and `notContains` are
  written as the positive operator with `not: true`. `migrate()` brings every version-1 view to
  version 2 with the same result; a view without a version is read as version 1. One exception: in
  a runtime whose default locale is Turkish, Azeri or Lithuanian, a version-1 label filter with an
  "I" may keep other items, since version 2 folds case without the runtime's locale. A host that
  reads normalized `include`, `exclude` or `label` filters, or `CATALOG.labelOps` and
  `CATALOG.valueOps` (now `textOps` and `compareOps`), must read the new shape; a host that
  overrides the texts of the issue codes `filterLabelOp`, `filterCompareField` and
  `filterRelativeField` uses `filterTextOp` and `filterFieldType`.
- Relative date ranges ([#165](https://github.com/eizedev/pivotkit/issues/165)): `direction` (`last`,
  `next`, `this`, `before`), `calendar` (whole units, or rolling from now), `includeCurrent`, the
  units `hour`, `week` and `quarter` besides `day`, `month` and `year`, and `anchor` `"first"` or a
  date of its own besides `"today"` and `"latest"`. A view's `formatting.weekStart` (1 Monday, the
  default, to 7 Sunday) starts its weeks. `relativeDateRange` takes the same options; a bound that is
  not at midnight is written to the minute, `"before"` has `from: null` (its type is `string | null`). Normalized relative filters
  write every key. New issue code `filterRelativeDirection`; `CATALOG.relativeDirections`.
- A comparison of dates has a `precision`: `year`, `quarter`, `month`, `day` (the default) or `hour`;
  both sides are taken as the start of their unit. A top N has `ties`: `first` (the default, as it
  was) or `all` (every item tied at the cut stays). New issue codes `filterPrecision` and
  `filterTies`; `CATALOG.comparePrecisions` and `CATALOG.topTies`.
- The JSON Schema of a view of version 2, `pivotkit-core/schema/view-2.json` (published at
  `https://pivotkit.eize.dev/schema/view-2.json`), built from the engine's tables; it refuses every
  case of an issue code whose `VIEW_ISSUES[code].schema` is true.
- `computePivot`'s result has `filters`: per filter of the view `{ field, type, kept }`, the source
  rows left after it, counted as the filters apply.
- Each filter type works on the field types of the field-type matrix (`CATALOG.filterFields`):
  another is the issue `filterFieldType` with the type that fits.

- `validate()` returns `{ valid, errors, warnings }`; `valid` is true without errors.

### Added

- Limits `textValue` (1,000 characters of a text filter's text, which was fixed), `srcParams` and
  `srcParamLength` (a link's data source parameters), and `OUTSIDE_LIMITS` (`{ filters: 50 }`) with
  `outsideLimits(limits)`: the tighter limits of a view from a link, pasted JSON, an API or an LLM.

- Every issue carries a `severity`: `"error"` (the part is left out or replaced by its default) or
  `"warning"` (used as written, but maybe not what was meant). `VIEW_ISSUES` gives each code's
  severity and whether the view's JSON Schema refuses it; `VIEW_ISSUE_CODES` lists its codes.
- "Did you mean": an unknown field, aggregator, filter type or key has `params.suggestion`, the closest
  known name (edit distance, bounded).
- The warning `itemCase`: a text item of a filter that is no item of the data, but differs from one
  only in case or whitespace, names the data's item.
- A key inside a part of a view (a value, a filter, a sort, the chart, totals, formatting, a grouping)
  that this version does not know is reported as a warning `unknownKey`; it was dropped without a word.
- New issue codes `filterFieldType`, `filterTextOp`, `filterMatch`, `filterNot`, `filterBlanks`, and
  the warnings `blanksUnspecified` and `filterEmpty`, which `validate()` gives.
- `foldText(text, match?)` and `MATCH_DEFAULTS`: the one way text is compared, case-insensitive
  without the runtime's locale and with every run of whitespace (a no-break space U+00A0 among them)
  as one space ([#159](https://github.com/eizedev/pivotkit/issues/159)).

## [0.4.0] - 2026-11-11

### Added

- Columnar data ([#44](https://github.com/eizedev/pivotkit/issues/44)): `encode` takes
  `{ columns, types, data }`, one array per column (a typed array too), besides an array of objects;
  no object per row is built. Its `types` name a column's type by position; `options.types` wins.
  A wrong shape throws `INVALID_ARGUMENT` that says what is wrong; `limits.rows` caps the length. The
  type `ColumnarData`.
- The entry point `pivotkit-core/import` ([#44](https://github.com/eizedev/pivotkit/issues/44)):
  `readFile` reads CSV, TSV, text and JSON files into a table that is `encode`'s columnar input, in
  the browser or in Node. Encoding from a byte order mark, else strict UTF-8, else Windows-1252; the
  separator from Excel's `sep=` line or the first lines; quotes with separators and line breaks; a
  title block above the header skipped; column names cleaned, empty ones numbered and repeated ones
  counted; control and direction characters removed; types inferred (dates before numbers, German and
  English numbers per column, a leading zero or more than 15 digits keeps text); `notes` for what was
  read how and what changed; `retype` changes column types from the values as read. The readers load
  on demand; the main entry does not load them.
- Reader plugins, contract version 1: `validatePlugin`, `readerFor`, `loadReader`,
  `PLUGIN_API_VERSION`, the built-in `csvReader` and `jsonReader`, and the helpers a plugin builds its
  table with (`createTable`, `bytesOf`, `readOptions`, `fileName`, `fileError`, `limitError`,
  `checkFileLimit`, `dateToIso`, `noteMessage`). The first plugin is the new package `pivotkit-xlsx`.
- Limits for loading files: `fileBytes` (checked before a byte is read), `columns`, `importCells`,
  `textLength`, `archiveEntries` and `unpackedBytes`; a limit names the file in its message and in
  `details.file`.
- The error code `INVALID_FILE` for a file that cannot be read, with `details.reason` and
  `details.file`.

## [0.3.0] - 2026-11-09

### Added

- A `relative` filter takes `anchor`: `"latest"` counts the last N years, months or days back from
  the latest date of the field's data (a grouping's source dates) instead of today, for data that
  end before today; `"today"` is the default and is not written. `relativeDateRange()` takes the same
  `anchor` with `latest`, the data's latest date; `CATALOG.relativeAnchors` lists both. An anchor
  that is neither is the new issue code `filterRelativeAnchor`, and the filter is left out.
- A `compare` filter on a date grouping takes a calendar day as its value (`"2025-01-01"`): the
  grouping is then compared by its source dates, not its key, so `between "2025-01-01" and
  "2025-12-31"` on a month-of-the-year grouping keeps the rows of 2025 (the Filter level's Years
  combined). A day and a key in one comparison is `filterCompareValue`.
- The view file's JSON Schema describes `anchor` of a `relative` filter.
- Two filter types ([#89](https://github.com/eizedev/pivotkit/issues/89)): `compare` compares the
  item itself (`=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `notBetween`): a number, a date by its
  calendar day (`"2022-03-01"`) or a grouping's key (year `2022`, month `202503`), so "from 2022"
  keeps the years from 2022 on; `relative` keeps the dates of the last N years, months or days,
  today's included, and on a date grouping filters its source dates. Today is `computePivot`'s new
  option `now` (default the current time), read in the data's time zone, never the machine's; beyond
  what a `Date` holds it throws `INVALID_OPTION`. A date's `compare` value beyond that range is the
  issue `filterCompareValue`, as any other value that is no calendar day.
  `normalize()` reports the new issue codes `filterCompareField`, `filterCompareValue`,
  `filterRelativeField`, `filterRelativeUnit` and `filterRelativeCount`. pivotkit-core 0.2.0
  reports both types as unused parts (`unknownFilterType`) and leaves them out.
- `relativeDateRange(unit, count, { now, timeZone })`: the days a relative range keeps
  (`{ from: "2022-01-01", to: "2026-12-31" }`), for a UI's "last 5 years (2022–2026)"; `null` for a
  range that leaves what a `Date` holds.
- `CATALOG.relativeUnits` and `CATALOG.relativeMaxCount` (500, so a range stays after year 1).
- `fieldItems()` items have `kept`: whether the field's own rules on items keep the item (for a UI's
  pick list next to the rules); option `now` for relative ranges.
- The view file's JSON Schema (`schema/view-file-1.json`) describes the view's `filters`: each
  filter's field and type (the known types listed, any other text valid, as a reader reports it as
  unused) and the parts of the two new types. `formatVersion` stays 1.

## [0.2.0] - 2026-11-08

### Added

- Every issue of `normalize()`, `migrate()`, `validate()` and `computePivot()` has a `code` (one of
  the new export `VIEW_ISSUE_CODES`, such as `"unknownField"` or `"colorScaleColors"`) and, where a
  text needs them, `params` (`field`, `value`, `agg`, `type`, `max`, `zone`; a value from the view at
  most 100 characters), so a UI can say each one in its own words
  ([#56](https://github.com/eizedev/pivotkit/issues/56)). The English `message` stays as it was. New
  type `IssueParams`.

### Changed

- The README, the package's page on npm, is a short landing page: what pivotkit-core is, one screenshot,
  install, one example and a table of links into the
  [documentation site](https://pivotkit.eize.dev/), which holds the details.

### Fixed

- `normalize()` reads a colour scale with an empty `colors` list as the theme's scale without an
  issue. normalize writes that list itself, so a normalized view with a colour scale in the theme's
  colours (kept by the UI, in a link or a view file) reported "values[0].conditional.colors" as a
  part that was not used.

## [0.1.0] - 2026-11-07

First release.

### Added

- Templates, the entry point `pivotkit-core/templates`: `parseTemplates(list)` reads a list (or its
  JSON text) of view files, templates `{ name, view }` and bare views with a `name` as
  `{ templates, issues }` without throwing (text and entries capped by `TEMPLATE_LIMITS`, own
  properties only, names and descriptions plain text); `templatesFromSchema(doc, { schema })` reads
  pivotkit's own extension `x-pivotkit-views` of a named schema (or a local `$ref`) or of the
  document's root, local references only, nothing fetched. `TEMPLATES_EXTENSION` names it.
- `pivotkit-core/export` exports source rows and copies the grid: `rowsToCsv`, `rowsToCsvBytes` and
  `rowsToXlsx` write rows of the data (a drill-down's rows behind a value, by their positions from
  `cellRows`) with a header of display names, each value as a drill-down panel shows it (the field's
  format, up to 6 decimals, the date's day), through the grid's writers (formula guard, typed cells,
  frozen header); rows x columns count against `limits.cells`. `toTsv(grid)` is the grid as the table
  shows it, tab-separated for the clipboard (also `toTsv(rows)` for rows of display texts), and
  `toJson(grid)` the grid's data as JSON (`rowHeaders`, `columns`, `rows` with labels, raw values and
  `collapsed` for a collapsed group). The formula guard of the CSV and TSV leaves numbers as every
  locale writes them alone: group separators `'` and `’` (de-CH), a space before `%`, a currency
  symbol before or after.
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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-core@0.4.0...HEAD
[0.4.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-core@0.3.0...pivotkit-core@0.4.0
[0.3.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-core@0.2.0...pivotkit-core@0.3.0
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-core@0.1.0...pivotkit-core@0.2.0
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-core@0.1.0
