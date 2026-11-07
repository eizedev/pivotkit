# Changelog

All notable changes to `pivotkit-core` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-07

First release.

### Added

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
  formatting.
- `toSeries()` and `toEChartsOption()` for bar, stacked bar, line, area, pie and heatmap.
- `pivotkit-core/export` with `toXlsx()`, `toCsv()` and `toCsvBytes()`: workbook with typed cells,
  number formats that show cells as the grid does, merged headers, bold totals, frozen panes, column
  widths and native colour scales and data bars; CSV with the grid locale's separator and a guard
  against formula injection.
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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-core@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-core@0.1.0
