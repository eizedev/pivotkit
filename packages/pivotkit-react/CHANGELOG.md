# Changelog

All notable changes to `pivotkit-react` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `<PivotReport>`: field list with search, type icons, quick add and a menu per field; Rows, Columns,
  Values and Filters zones with chips that are dragged, reordered and removed; chip menus for sort,
  date grouping, number bins, top N, filter, aggregator, "show values as", number format,
  highlighting, name and move.
- Drag and drop with @dnd-kit (mouse, touch and keyboard), a drag preview above everything,
  auto-scroll, drop on the field list to remove, header cells of the table dragged into a zone.
- Table with sticky header and row labels, expand and collapse, totals on and off, colour scales and
  data bars, keyboard navigation, drill-down panel and `onCellClick`; virtual scrolling from 300 rows.
- Chart with Apache ECharts (a peer dependency, loaded on first use): bars, stacked and horizontal
  bars, lines, area, pie, heatmap, themed from the `--pk-*` tokens.
- Filter popover with values and row counts, search, select all or none and a label condition.
- Undo, redo and reset with toolbar buttons and shortcuts; templates (load, save, delete through the
  host's callbacks); export to XLSX, CSV and PNG; toasts in a live region.
- Themes light and dark (`theme="auto"` follows `<html data-theme>` and `prefers-color-scheme`),
  CSS custom properties `--pk-*` with zero-specificity defaults, `prefers-reduced-motion`.
- Layouts for wide, medium and narrow reports (field list as a drawer below 640 px).
- Labels in English and German; `labels` overrides single texts.
