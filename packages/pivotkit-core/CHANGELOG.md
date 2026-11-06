# Changelog

All notable changes to `pivotkit-core` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `encode()`: typed columnar encoding (string, number, boolean, date including ISO strings) with Int32
  codes, dictionaries and Float64 measures; column names matched case-insensitively.
- The view object (version 1) with `normalize()` and `validate()`: rows, columns, values with format,
  "show values as" and conditional formatting, filters (include, exclude, label, top/bottom N, value
  conditions), derived fields (date grouping, number bins), sort, totals, collapsed groups, display,
  chart and locale. Hostile input is reduced to known names and safe values.
- `computePivot()` with Excel PivotTable semantics: count, countUnique, listUnique, sum, average,
  median, min, max, stdev, stdevp, var, varp, first, last; subtotals and grand totals; eleven "show
  values as" calculations; `cellRows()` for drill-down.
- `toGrid()`: header and body rows with merges, totals, formatted text, toggles and conditional
  formatting.
- `toSeries()` and `toEChartsOption()` for bar, stacked bar, line, area, pie and heatmap.
- `toXlsx()`, `toCsv()` and `toCsvBytes()`: workbook with typed cells, number formats, merged headers,
  bold totals, frozen panes, column widths and native colour scales and data bars; CSV with the
  locale's separator and a guard against formula injection.
- `createHistory()` for undo, redo and reset; a benchmark script.
