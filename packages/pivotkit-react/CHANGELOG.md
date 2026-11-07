# Changelog

All notable changes to `pivotkit-react` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-07

First release.

### Added

- Sort by value and Top N by any value that gives numbers: the sort section lists "Largest … first"
  and "Smallest … first" for each such value, Top N has a "by" select; the first value is the
  default. A value condition on a row or column field ("Value filter…" in the Filters section of its
  menu: a value, an operator of `CATALOG.valueOps` and a number, two for between), pivotkit-core's
  `value` filter, shown on the chip and in the menu as "Sum of Revenue > 1,000"; Clear removes it,
  Remove filter too; editing changes only the condition (or top N) being edited, and a measure no
  longer among the values stays a choice. Numbers in the menus (value condition, Top N, number
  ranges) are text fields read in the report's locale ("1.000,5" in German, a plain "1000.5"
  everywhere), with a note under a field that holds no number. Labels `numberInvalid`,
  `countInvalid`, `sizeInvalid`, `topBy`, `valueFilter`, `valueFilterBy`, `valueFilterOp`,
  `valueFilterNumber`, `valueFilterTo`, `valueOps` and `valueConditions`.
- Chart display settings in the chart type menu ("Display"): value labels, legend, title, smooth
  lines, axis labels (all straight when they fit, slanted, else every n-th with a note; long names cut
  with "…", whole in the tooltip), long titles cut with "…", and group labels under the axis for two
  or more row fields (automatic: only where the chart has room; on, off); kept in
  the view, so saved views, links and the PNG export show them. A tip suggests bars for lines over
  categories without an order (`chartTrend`, "Switch to Bars").
- Chart type Donut (a ring; the pie is a whole circle), and "Labels: Outside / Inside" for a pie or a
  donut (`chart.labelPosition`): inside writes only the number on the slice (the share when
  Automatic) in a colour that reads on it, the legend names the slices. Labels `chartTypes.donut`,
  `labelPosition`, `labelPositionNames`.
- `chartOptions`: plain JSON merged over the ECharts option (lists entry by entry, an object into
  every entry of a list); it wins over the view's settings; functions, values that are not JSON and
  the ECharts options that are markup or addresses (a string `formatter` at any depth, `rich`, `link`,
  `sublink`, `image`, the tooltip's element) are left out with a warning.
- The Views menu (labels `views`, `savedViews`, `share`; "Ansichten" in German) with two sections:
  Saved views (the host's `templates`, "Save current view") and Share: Copy link (with `shareLink`:
  `true` or a base URL; the view in the fragment, `#pivot=` or `#pivot-<storageKey>=`, only that
  entry changed so a hash route stays; `true` links to the page without its query; read after the
  first render as the start, and on a fragment change as one undoable step), Copy view as JSON,
  Download view (.pivotkit.json) (`onExport` kind `"json"`), Load view… from a pasted view file, JSON,
  a link or a file, and a line on what a shared view gives away (`sharePrivacy`).
- The prop `schemaUrl`: the `$schema` of the view files the report writes (a self-hosted copy of the
  schema, or `null` / `""` for none); loading never depends on it.
- Views are shared as pivotkit-core's view file: the envelope with the view's name, its source and
  the fields it uses, `generator` with this package's version from its `package.json`; a link carries
  its link profile. A bare view and a link with one still load; a newer format or view version is
  refused with "Update pivotkit to open it."
- Props `source` (`{ id, name }`), `sources` and `onSourceSwitch`: a view made for another source, or
  with fields this data lacks or has with another type, asks before it is loaded (Load anyway,
  Cancel, "Switch to “…” and load"); labels `loadCheckTitle`, `loadCheckSource`,
  `loadCheckOtherSource`, `loadCheckMissing`, `loadCheckChanged`, `loadAnyway`, `switchAndLoad`.
- A loaded view is one undoable step with a note that has Undo and goes by itself ("View loaded",
  `toastViewLoadedPartly` when parts were left out: a warning, not an error); what was left out stays
  in the collapsible "Some parts of the view were not used" area above the result until it is
  dismissed (`dismissIssues`) or another view is loaded; so does a saved view trimmed to the limits
  (`viewTrimmed`).
- `persistView="session"`: the view kept per tab in `sessionStorage`; Reset stores the start view.
- `loading` and a skeleton (toolbar, zones, table rows, `role="status"` announced once, reduced motion
  respected) while the host loads data, while more than 10,000 rows are encoded the first time and
  while a link is read.
- Filters say what they keep: "Filter: 15 of 45" or the condition in the chip menu, in the accent
  colour, with "Remove filter" right below; "Remove filter" at the top of the filter popover; the ×
  of the text condition removes it at once.
- One clear "×" for every text field in a menu (field search, value name, "Starting at", saved
  view's name, filter search and condition, Load view): it empties the field and keeps the focus there,
  Escape does the same first; a value's name goes back to its default at once, as one undo step.
- "Filter…" in the field list for a field not placed: its filter opens at once, Apply puts it into
  Filters with the selection.
- The Values menu says where filtering happens; an "i" next to each zone's title explains it with an
  example; the field list's grip says "Drag into a zone" and opens the field's menu on a click.
- Options, Help: "Show tips", "Show field descriptions", "Show zone explanations" and "Show
  explanations", remembered with the tips; `fieldInfo`, `zoneInfo` and `settingInfo` ("on", "off")
  decide them for the host.
- One way to explain a setting: the "i" (hover, focus, tap) next to the totals, Show as, Along, the
  export formats (the export menu is a dialog), and a pie's Labels and the Group labels; menu rows stay
  one line (`aboutSetting`, `settingInfo`).
- An entry that would change nothing is disabled and says why, only while disabled: the grand total
  row needs a field in Rows, the grand total column one in Columns, subtotals two or more fields on
  their axis (`needsRowField`, `needsColField`, `needsRowFields`, `needsColFields`), the chart image
  "Switch to Chart first." (`exportPngNeedsChart`).
- Long menus: the wheel and the swipe stay in the menu (the table and the page behind never scroll),
  a menu is never higher than the window; sections fold with their title, the frequent ones open, the
  user's choice kept with the tips (`"open:<id>"`, `"closed:<id>"` in `dismissedTips`); "More
  formats" for the rarer number formats.
- Enlarge and Full screen at the top right of the result: Enlarge lets the result fill the report
  (Escape or the button restores), Full screen uses the Fullscreen API on the report's root (also in a
  shadow root) and is offered only where the browser has it; neither is part of the view.
- Expand all and Collapse all are offered only when they change something, say why not, and report
  what they did ("5 groups collapsed").
- Notices and tips above the result, from one table (`tips.js`). Notices, always shown and not
  dismissible: a filter that leaves nothing (with "Remove filter"), top N, the chart's category cap.
  Tips: what 100 % is for a percentage, dates on Columns and many
  series in a chart (with "Swap rows and columns"), a text field in Values, an ungrouped date with
  many columns (with "Group by"), many columns (swap), Rows without Values, Undo after the first drag,
  saving after five changes (opens Views), the empty report and how to open a value. At most two
  at a time (one in a narrow or low report), in the flow above the result, each with an x; Options has
  "Show tips", "Show dismissed tips again" and the keyboard shortcuts. Props `tips` ("on", "off" or ids),
  `storageKey` (localStorage per report, read after the first render so server rendering and
  hydration match), `dismissedTips` and `onTipDismiss`. The texts are `labels.tips`; the earlier keys
  `topNote`, `bottomNote`, `noValuesHint`, `cellHint`, `emptyHint`, `chartManySeries`,
  `chartDatesOnColumns` and `chartCapped` still apply as aliases of their tip.
- `fieldDefaults[field].label`, `.description`, `.href` and `.type`: a display name everywhere a field
  name shows (chips, headers, value names, drill-down, chart, CSV and XLSX; views keep the names), an
  "i" with the description on hover, focus and tap ("Learn more" for an https link), the description
  at the top of the chip menu and on table and drill-down headers, field search by label and
  description, and the column type for encode. A label two fields share, or another field's name,
  gets the field's name in parentheses. A field without them looks as before.

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
- Table with sticky header and row labels (their offsets follow the report's width and fractional row
  heights), expand and collapse, totals on and off, colour scales and
  data bars, keyboard navigation, drill-down panel and `onCellClick`; virtual scrolling from 300 rows.
- Chart with Apache ECharts (a peer dependency, loaded on first use): bars, stacked and horizontal
  bars, lines, area, pie, donut, heatmap, themed from the `--pk-*` tokens, with a text alternative, at most 50
  categories, tips for many series and dates on Columns, and "Swap rows and columns"; a stacked area
  or line chart is named "Area" or "Lines" in the toolbar and the picker.
- Filter popover with values and row counts, search, select all or none and a text condition.
- Undo, redo and reset; saved views (the `templates` prop: load, save, delete of entries marked
  `deletable` after an in-page confirmation; the host's callbacks may return a promise); export to XLSX, CSV and PNG, with
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
- Labels `toastSaveRejected` and `toastDeleteRejected` ("The server could not save the view."),
  shown when the host's save or delete callback throws or rejects without a message; a message the host
  gives (an `Error`, a text) is shown instead.
- Compact layout: below 600 px of height, 820 px in the narrow layout (border box, measured before
  the first paint), the zones start folded into one line that says what is in them, and at most one
  tip shows; the line and the Layout toggle of the toolbar (a stable text with `aria-pressed`; its
  place in the toolbar or in "More" depends on the width only) open and fold them, and a drag opens
  them while it lasts. A fold waits while a menu or popover is open, and a focus in the zones moves to
  the folded line. Labels `layout`, `showLayout` and `layoutEmpty`.
- The result keeps a least height (240 px, 280 px narrow): a report without `height` that needs more
  grows past its 640 px (an inline `min-height`), so the page scrolls; with a `height` it stays inside
  and its table scrolls. The prop `grow` ("on", "off") decides it either way.
- The menus' panels load on demand (`dist/menus.js`, `dist/chunks/`); a failed load says so in the
  menu with Try again, and the next try imports again.
- A link in the page's address made for other data asks before it opens (Load anyway, Cancel, Switch),
  as a pasted view file does; the load check takes the focus when it appears.
- The `label` prop names the report's region landmark (default `labels.report`); several reports on
  one page need one name each.
- A limit of pivotkit-core in place of the result says which one and what to change: too many
  rows in the data (`tooManyRows`), too many cell updates (`tooMuchWork`), groups (`tooManyGroups`) or
  cells with subtotals (`tooManyCells`) in the layout, besides the dense grid's `tooLarge`.
- A field beyond pivotkit-core's limit of its zone (8 per axis, 16 values) is refused with a note
  (`zoneFull`); a saved view with more loads the fields that fit and says so above the result
  (`viewTrimmed`).
- Number ranges: size and "Starting at" (Excel's origin; empty is 0); a new size keeps the start, and
  a start so far from the field's numbers that every row would be blank is refused with a note.
- `fieldDefaults[field].order`: the field's custom order of items. A field placed on Rows or Columns
  is sorted in it, and so is one in a view or template without a sort entry for it; its menu offers
  "Custom order" and "Custom order, reversed" (also for a view's own custom sort).
- Another aggregator in a value's menu keeps the field's format (`fieldDefaults` or the user's own)
  while the result is in the field's unit, not for a count; "show values as" starts again.
- Long row labels wrap: the label columns share at most 40 % of the report's main area and a value's
  name wraps beyond 30 %, so a phone shows values next to nested row labels. From 300 rows on, where
  rows have one height, a label is cut with an ellipsis; the status line shows the whole label of a
  tapped label or of the focused value until the focus leaves the table or the table is scrolled.
- A blank value cell with no rows behind it is not clickable and Enter does nothing; `onCellClick` is
  not called for it. Every empty cell stays an arrow-key stop and a screen reader hears "No rows" or
  "No value" (`labels.emptyCell`, `labels.emptyValue`); a copied selection keeps the cell empty.
- A narrow chip shortens the field's name with an ellipsis and keeps a few characters of it, never a
  badge ("Top 10", "15 of 45"); on a phone a zone's name stands above its chips.
- Heatmaps slant their column names where they would overlap, write every row name where a line
  fits each row (else every n-th), and show the numbers only where the formatted numbers fit the
  cells.
- The export menu says what each file keeps: the XLSX every decimal, the CSV percentages and
  calculations as the table shows them.
- Tested against the five real public data sets of the playground and the documentation site:
  weather (Open-Meteo), countries (World Bank), earthquakes (USGS), Nobel laureates and the release
  cycles of software products (endoflife.date).

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-react@0.1.0
