# Changelog

All notable changes to `pivotkit-react` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  rows in the data (`tooManyRows`), too many groups (`tooManyGroups`) or cells with subtotals
  (`tooManyCells`) in the layout, besides the dense grid's `tooLarge`.

### Changed

- Counts in words take the plural form of the language ("1 series", "1 Reihe", "1 row"):
  `rowsCount`, `drillCount` and the new `chartCategories` and `chartSeries` are objects with one
  text per `Intl.PluralRules` category (`{ one, other }`, more for languages that have them), and
  the placeholders of `chartCounts` ("{categories}, {series}.") carry the nouns. Migration: a host
  label written as one text keeps working (`rowsCount: "{count} Zeilen"` is used for every count,
  and a `chartCounts` with the nouns after its placeholders gets the bare numbers); to have "1
  Zeile", pass `{ one: "{count} Zeile", other: "{count} Zeilen" }`.
- Yes/no fields read "Yes" and "No" ("Ja", "Nein") in the table, the filter list and the
  drill-down, instead of "true" and "false" ("wahr", "falsch"): `labels.core.true` and `false`.

### Fixed

- ECharts is loaded from `dist/echarts.js`, which imports bar, line, pie, heatmap, their components
  and the canvas renderer by name; the namespace imports before made a host's bundler keep every
  chart type.
- The report is a `role="region"` named by the new label `report` ("Pivot report", "Pivot-Bericht")
  instead of a `<main>`, which nested inside the host page's main landmark.
- Templates with the same name (a saved template with a preset's name) gave React duplicate keys,
  and a delete asked for confirmation on every entry of that name; entries are keyed and confirmed
  by their place in the list, and every one is shown.
- A field of the field list described its click as "Add to Rows" wherever it was; its description
  now says what a click does from where it is ("Move to Rows" from Columns or Filters, "Add to
  Values" for a number). A click on a field already in Rows leaves it there and says so in the
  status line ("Region is already in Rows", new label `alreadyIn`).
- The drill-down showed raw values (ISO date texts, "40,072" for an identifier); it formats each
  column by its type as the table does (dates as dates, numbers in the locale, Yes/No) and
  applies a field's `fieldDefaults` format. The new `fieldDefaults[field].drillFormat` sets the
  format of the field's values there (`"text"`: an identifier as it is).
- At medium widths (a half-width card of about 650 px) "Swap rows and columns" and the chips ran out
  of their zones: the zones stack whenever the area next to the field list is narrower than 640 px
  (a container query, no longer the narrow size class alone), and the swap button shows its icon
  only, with its name and a tooltip, when the Columns zone is too narrow for the text.
- A chart in a low report was cut at the bottom: the canvas had a minimum height of 240 px and grew
  past its box. It is the size of its box now, and a pie leaves room for its labels above and below:
  5 % of the chart's height, at most 24 px, so a pie in a tall chart is about 48 px smaller in
  diameter than before.
