# Changelog

All notable changes to `pivotkit-core` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
  formatting.
- `toSeries()` and `toEChartsOption()` for bar, stacked bar, line, area, pie and heatmap.
- `pivotkit-core/export` with `toXlsx()`, `toCsv()` and `toCsvBytes()`: workbook with typed cells,
  number formats that show cells as the grid does, merged headers, bold totals, frozen panes, column
  widths and native colour scales and data bars; CSV with the grid locale's separator and a guard
  against formula injection.
- `LIMITS` and `options.limits`: besides the view limits, `rows` for `encode()`, `cells` for the dense
  `toGrid()` and `toSeries()` (counted before allocating) and `cacheEntries` for the bounded cache of
  derived columns and sort orders.
- `PivotkitError` with the codes `INVALID_ARGUMENT`, `INVALID_OPTION` and `LIMIT_EXCEEDED`.
- `CATALOG` and `aggregatorsFor()` for a UI's menus; `DEFAULT_LABELS`, `DEFAULT_THEME`.
- `createHistory()` for undo, redo and reset; generated TypeScript declarations; a benchmark script.

### Changed

Breaking changes against the phase 1 code on `main` (never published):

- The package exports about 20 documented entry points; helpers such as `encodeColumn`, `makeEncoded`,
  `toWallMs`, `groupBy`, `derivedColumn`, `isoWeek`, `ranksOf`, `labelOf`, `naturalCompare`,
  `parseFormat`, `excelNumberFormat`, `formatBytes`, `formatDuration`, `excelSerial`, `cellRef`,
  `xmlEscape`, `neutralizeFormula`, `csvSeparator`, `defaultFormat`, `valueName` and `scaleColor` are
  internal. The lists `SHOW_AS`, `FILTER_TYPES`, `DERIVE_UNITS`, `AGGREGATOR_NAMES` and the like are in
  `CATALOG`.
- `toXlsx`, `toCsv` and `toCsvBytes` moved to `pivotkit-core/export`.
- `normalize(view, schema)` returns `{ view, issues }`; the `onIssue` callback is gone.
- `toEChartsOption(result, view, theme, options)` is `toEChartsOption(result, { chart, theme, ... })`.
- `formatter(format, locale)` is `formatter(format, { locale })`.
- `cellRows(result, row, col)` is `cellRows(result, { row, col })`.
- `toCsv()` and `toCsvBytes()` take the locale from the grid; their `locale` option is gone.
- Locale precedence is the view's locale, then `options.locale`, then `"en-US"` (the options used to win
  over the view, and the runtime's locale was the default).
- The default time zone for Date objects and ISO strings with an offset is `"UTC"`, not the machine's.
- `encode()` throws a `PivotkitError` for rows that are not an array; functions and symbols in the data
  are blank.
- Formats with decimals (`number:2`, `percent:2`, `percent100:2`) show exactly that many; `percent`
  without decimals shows up to one. Decimals above 20 and currency codes outside ISO 4217 are refused.
- Running totals on aggregators that do not add up (average, median, ...) are refused; bin sizes below
  1e-9 are refused.

### Fixed

- A public function given options that are not an object (a locale string in an older call shape)
  throws `INVALID_OPTION` instead of ignoring them.
- Number bins whose index would exceed 2^53 (1e15 in bins of 1e-9) are blank instead of bins with
  equal bounds.
- Number bins of decimal sizes (0.1, 0.05, ...) put values on a bin boundary into the right bin.
- The CSV formula guard looks past leading spaces, line breaks and control characters, and leaves plain
  numbers and bin labels such as `-10 – 0` alone. CSV numbers like `1e-20` no longer become `-0`.
- XLSX: number formats per cell as in the grid (the default `number` without a trailing dot, percent
  decimals, the currency symbol, compact, the locale's date order); text cut at 32,767 characters;
  a clear error beyond 1,048,576 rows or 16,384 columns; Excel serials before 1900-03-01; dates before
  1900 as text; the reserved sheet name "History" and control characters in sheet names; data bars
  that start at zero as in the grid; number labels as numbers.
- ISO times like `10:61` are no dates; years before 100 are.
- Numbers that round to zero no longer show as `-0`.
- A view's resource use is bounded: two fields with thousands of distinct values each used to make
  `toGrid()` allocate gigabytes or crash the process.
