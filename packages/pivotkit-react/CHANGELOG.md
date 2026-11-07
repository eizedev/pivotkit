# Changelog

All notable changes to `pivotkit-react` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- README: links to other packages, the examples and the license are absolute (GitHub, the
  documentation site), so they work on the npm page.

## [0.1.0] - 2026-11-07

First release.

### Added

- `<PivotReport>`: field list with search, type icons, quick add and a menu per field; Rows, Columns,
  Values and Filters zones with chips that are dragged, reordered and removed and say what is set on
  them ("3 of 4", "Top 5", the sort); chip menus for sort, date grouping, number ranges, top N,
  filter, aggregator (common ones first), "show as", number format, highlighting, name and move.
- Controlled (`view` + `onViewChange`) and uncontrolled (`defaultView`) use; the undo history stays in
  the report however often the host renders, new data with the same columns keeps it; `dataKey`
  encodes a new array only when its key changes. Undo notes say what was undone.
- A date is grouped by the span of its values when it is placed (day, month, quarter or year);
  `fieldDefaults` gives a field's aggregator and format in Values.
- Drag and drop with @dnd-kit (mouse, touch and keyboard with positions announced), a drag preview
  above everything, auto-scroll, drop on the field list to remove, header cells dragged into a zone.
- Table with sticky header and row labels, expand and collapse, totals on and off, colour scales and
  data bars, keyboard navigation, drill-down panel and `onCellClick`; virtual scrolling from 300 rows.
- Chart with Apache ECharts (a peer dependency, loaded on first use): bars, stacked and horizontal
  bars, lines, area, pie, heatmap, themed from the `--pk-*` tokens, with a text alternative, at most 50
  categories, hints for many series and dates on Columns, and "Swap rows and columns".
- Filter popover with values and row counts, search, select all or none and a text condition.
- Undo, redo and reset; templates (load, save, delete of templates marked `deletable` after an in-page
  confirmation; the host's callbacks may return a promise); export to XLSX, CSV and PNG, with
  `onExport` seeing every file before its download and able to skip it (then without the "Exported"
  note).
- Popovers and menus open at their button also inside an ancestor with a transform, a filter or
  `contain`, which becomes the containing block of fixed elements.
- The medium layout narrows the field list without setting `--pk-panel-w` on the root, so a host's
  value of the token stays in force.
- Notes in the status line under the table (none for adding a field), kept while hovered or focused.
- Themes light and dark (`theme="auto"` follows the nearest `data-theme`, also across a shadow root,
  and `prefers-color-scheme`), CSS custom properties `--pk-*` with zero-specificity defaults,
  `prefers-reduced-motion`. Works inside a shadow root with the stylesheet linked there.
- Layouts for wide, medium and narrow reports; toolbar buttons keep their text and move into "More"
  when there is no room; field list as a modal drawer below 640 px.
- Labels in English and German with plain words; `labels` overrides single texts and ignores entries
  of the wrong type; the report's `lang` follows the labels.
- Labels `toastSaveRejected` and `toastDeleteRejected` ("The server could not save the template."),
  shown when the host's template callback throws or rejects without a message; a message the host
  gives (an `Error`, a text) is shown as before.
- Compact layout: below 540 px of height (border box, measured before the first paint) the zones
  start folded into one line that says what is in them; the line and the new Layout button of the
  toolbar open and fold them, and a drag opens them while it lasts. Layout stays in the toolbar
  while the zones are folded. A fold waits while a menu or popover is open, and a focus in the
  zones moves to the folded line. Labels `layout`, `showLayout`, `hideLayout` and `layoutEmpty`.
- The `label` prop names the report's region landmark (default `labels.report`); several reports on
  one page need one name each.
- A limit of pivotkit-core in place of the result says which one and what to change: too many
  rows in the data (`tooManyRows`), too many cell updates (`tooMuchWork`), groups (`tooManyGroups`) or
  cells with subtotals (`tooManyCells`) in the layout, besides the dense grid's `tooLarge`.
- A field beyond pivotkit-core's limit of its zone (8 per axis, 16 values) is refused with a note
  (`zoneFull`); a template with more loads the fields that fit and says so
  (`templateTrimmed`).

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-react@0.1.0
