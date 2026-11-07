# Changelog

All notable changes to `pivotkit-react` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-07

First release.

### Added

- The field list collapses to a rail of about 40 px (`--pk-rail-w`): « next to "Fields"
  (`collapseFields`, `aria-expanded`), the rail with "Fields" upright (`expandFields`) and a search
  button that opens the list with the focus in its search field; a chip dropped on the rail leaves
  the report (the rail reads "Drop here to remove" while one is dragged); another `fieldList` value
  is ignored with a console warning; the choice is kept with the tips (`-fields`); `fieldList` (`"open"`, `"collapsed"`)
  starts it so. Not on a narrow report (the drawer); Enlarge hides it. The check and merge of
  `chartOptions` and the report's marks on the chart's option load with ECharts
  (`dist/echarts.js`), so the first load stays small; the `chartOptions` warning comes when the chart
  is drawn.
- Templates in two groups of the Views menu, "Shared views" and "My views" (labels `sharedViews`,
  `myViews`; "Gemeinsame Ansichten", "Meine Ansichten"), each shown only with entries ("My views"
  also while people can save; `noViews` when there is nothing at all). `templates` entries take
  `scope` (`"shared"` or `"user"`; without it a `deletable` entry is the user's own) and `file`, a
  view file instead of `view` (its name the default). A shared entry that cannot be deleted has an
  "i": "Only admins can change shared views." (`labels.settingInfo.sharedView`), where someone can
  change shared views (a deletable shared entry, or Publish). Every name is plain text, at most 120
  characters; a deletable entry without `scope` is listed under My views with a console warning once.
  A published view is sent normalized against the data. `onSaveTemplate`
  gets `{ scope: "user" }` and `onDeleteTemplate` `{ scope }`. `canPublish` with `onPublishTemplate`
  offers "Publish as shared view" on the user's views, asked in place (`publishView`,
  `publishConfirm`, `publishAction`, `toastPublished`, `toastPublishFailed`,
  `toastPublishRejected`). After a delete, a publish or Cancel the focus goes back to the entry in
  that place. `templateStore="browser"` keeps the user's views in localStorage
  (`pivotkit:views:<storageKey>`) as view files per data (`source`), at most 100 views and 500,000
  characters for a save (a delete is never refused; a text over the cap is not read), a delete
  changed in another tab meanwhile refused (`storeChanged`), read after hydration, with a note that they stay in this browser (`storeNote`) and
  the reasons a save is refused (`storeFull`, `storeTooLarge`, `storeRefused`); the host's
  `onSaveTemplate` wins. The texts of save and delete (`toastSaved`, `toastDeleted`,
  `toastSaveFailed`, `toastDeleteFailed`, `toastSaveRejected`, `toastDeleteRejected`) load with the
  menus, as does the browser store with pivotkit-core/templates, so the first load stays small.
- The drill-down panel: Enlarge fills the report with it (Reduce or Escape brings it back, a second
  Escape closes it; the focus stays on the button; not on a narrow report, not part of the view),
  columns as wide as their content with a long text wrapping, and an Export menu: Copy (the rows as
  shown, tab-separated with a header row, for a spreadsheet), Copy as JSON (field names and raw
  values), Download CSV and Download Excel (pivotkit-core's rows exporters, the panel's formats, named
  after the cell: "Central – Jul 2026"). With more rows behind the value than `drillDownLimit`, every
  export holds the rows shown, and the menu and the note say so ("Copied 1,000 of 4,212 rows").
- Export, Copy table (the table as shown, tab-separated, headers and totals) and Copy data as JSON
  (pivotkit-core's `toJson`: header texts, labels and raw values; not the view, which Views, Copy view
  as JSON copies); a page that does not allow copying gets a note. `onExport` gets every copy too:
  kinds `copy-table`, `copy-json`, `drill-copy`, `drill-json`, `drill-csv`, `drill-xlsx`, with `text`
  for a copy and `rows: { shown, count }` for a drill-down export; returning false keeps it from the
  clipboard or the download. The Export menu and its texts load with the menus; the export module
  starts loading when the Export menu or the drill-down opens, so a copy happens in the click.
- The filter and the chip menus (a scrolling middle, a foot that stays in view) may cover their anchor
  when they fit neither below nor above it: placed against the window's edge, as tall as the window
  allows (`fill` of the popover); every other popover stays next to its anchor and scrolls. The
  filter is a column with a scrolling middle (values and condition, the list of values giving way
  first), its head and Apply and Cancel always in view.
- Enlarge of the result and of the drill-down: the name says what a click does (Enlarge, Reduce), so
  the button is no toggle (no `aria-pressed`); the highlight shows the state.
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
- The Views menu (labels `views`, `share`; "Ansichten" in German) with the templates and Share: Copy link (with `shareLink`:
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
- Options, Help: two switches, "Show tips" and "Show explanations" (every "i": of the settings, the
  zones and the field descriptions), remembered with the tips (`"-explanations"` in
  `dismissedTips`); `fieldInfo`, `zoneInfo` and `settingInfo` ("on", "off") decide one kind each for
  the host, whatever the switch says.
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
  (Escape or the button, which then reads "Reduce", restores; label `reduce`), Full screen uses the Fullscreen API on the report's root (also in a
  shadow root) and is offered only where the browser has it; neither is part of the view.
- Expand all and Collapse all are offered only when they change something, say why not, and report
  what they did ("5 groups collapsed").
- Notices and tips above the result, from one table (`tips.js`). Notices, always shown and not
  dismissible: a filter that leaves nothing (with "Remove filter"), top N, the chart's category cap.
  Tips: what 100 % is for a percentage, dates on Columns and many
  series in a chart (with "Swap rows and columns"), a text field in Values, an ungrouped date with
  many columns (with "Group by"), many columns (swap), Rows without Values, Undo after the first drag,
  saving after five changes (opens Views; after a save it waits for five more), the empty report and
  how to open a value; a chosen chart type over dates ("Show as lines over time", `chartOverTime`),
  a pie or donut of more than 7 slices ("Switch to Bars", `pieSlices`) and one whose columns it adds
  up (`pieColumns`). One tip at a time, the most important first, the next one waiting until it is
  followed or dismissed; in the flow above the result, each with an x; Options has
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
- The chart type "Automatic" (the default, `chart.type: "auto"`): lines when a date or a grouping of
  one along the time line is on Rows (a weekday or hour of day is bars); with dates on Columns only, lines too, with rows and columns swapped for the chart
  alone (the table keeps its layout); bars otherwise. The toolbar's button shows the type ("Automatic",
  "Bars"; its name "Chart type: …"), the menu's "Automatic" what it draws now (`chartAutoNow`). A
  type the user picks stays.
- Chart with Apache ECharts (a peer dependency, loaded on first use): bars, stacked and horizontal
  bars, lines, area, pie, donut, heatmap (its colour scale in the value's number format), themed from the `--pk-*` tokens, with a text alternative, at most 50
  categories, tips for many series and dates on Columns, and "Swap rows and columns"; a stacked area
  or line chart is named "Area" or "Lines" in the toolbar and the picker.
- Filter popover with values and row counts, search, select all or none and a condition on the labels
  by the field's type: "Text condition" for text, "Condition on the label" for a number (label
  `conditionNumber`), none for a date or a grouping of one and a yes/no field.
- Undo, redo and reset; saved views (the `templates` prop: load, save, delete of entries marked
  `deletable` after an in-page confirmation; the host's callbacks may return a promise); export to XLSX, CSV and PNG, with
  `onExport` seeing every file before its download and able to skip it (then without the "Exported"
  note).
- Popovers and menus open at their button also inside an ancestor with a transform, a filter or
  `contain`, which becomes the containing block of fixed elements.
- The toolbar moves buttons into "More" by a fixed priority (Reset, Layout, Views, Options, chart
  type) and the report's width, not by the length of its texts: the same buttons show at the same
  width in English and German; Redo stays next to Undo. On a narrow report More and every other menu
  are a sheet at the bottom of the window, as high as 82 % of it, scrolling inside.
- The field list is one stop of the Tab order: arrow keys move between the fields (up, down, Home,
  End) and a field's grip, name, "i" and menu (left, right), Shift+F10 or the context menu key opens
  its menu, Enter on a name adds it; a "Skip to the toolbar" link before it (label `skipToToolbar`);
  both in Options → Help → Keyboard shortcuts. A long field name takes two lines, with the whole name
  as its title.
- A date grouping is named in words: "Created by month", "Erstellt nach Monat" (labels
  `derivedName`, `unitInName`).
- Status notes sit at the bottom edge of the report's part on screen, also when the report reaches
  past the window. The Views menu stays open after "Save", with the new entry and Copy link in it.
- Row labels on a narrow report wrap between words and keep at least 5.5em, so a common word is not
  cut in two; a longer one breaks at a hyphen of its own (labels are data, not the UI's
  language), a word longer than the column only as a last resort.
- On a touch screen (a coarse pointer) the ×, the "i", a field's menu and grip and a tip's x are at
  least 44 px (token `--pk-target-touch`).
- The texts only the menus show load with them (`menu-labels.js`); a host's `labels` for them still
  apply. `LABELS` (every text, English and German) is the subpath export `pivotkit-react/labels`.
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
