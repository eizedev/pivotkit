# Changelog

All notable changes to `pivotkit-react` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A rule on the name whose text is emptied (select all and delete, the field's ×, or only spaces)
  no longer keeps filtering by its last text while the field looks empty: the rule leaves the view
  a moment later, its row stays as a rule not yet complete, and a new text applies it again in its
  place among the rules, with its blank items kept as before ([#159](https://github.com/eizedev/pivotkit/issues/159)).

## [0.5.0] - 2026-11-13

### Upgrading from 0.4

What a host checks; the [upgrade page](https://pivotkit.eize.dev/getting-started/upgrading/) has the details.

- **Breaking:** views, view files and links are written in format version 2; pivotkit 0.4 refuses
  them as newer. Version 1 loads with the same result.
- **Breaking:** dark colours of a host go on `.pk-root[data-pk-theme="dark"]`, not on an attribute of
  the page (`html[data-theme="dark"] .pk-root`): the Excel export and the HTML report read the light
  theme by showing it on the report for a moment, and a rule on the page's attribute would put the
  dark colours into the file.
- **Breaking:** a page with an import map maps `pivotkit-report` and `pivotkit-core/chart`.
- The colour scale's default is blue; red, yellow, green come back with `--pk-scale-low: #f8696b`,
  `--pk-scale-mid: #ffeb84`, `--pk-scale-high: #63be7b` (dark: `#c2413f`, `#b39a2e`, `#3f9a5c`).
  `--pk-scale-mid` is no longer set.
- The label key `filter` is removed (a host's text for it is ignored).
- The font weights 550 and 650 are 600 (`--pk-weight-strong`).
- The chart's text is 14 px, not 12 px.
- Column subtotals are off by default: a start view or template without `totals.colSubtotals` adds
  `totals: { colSubtotals: true }` to keep them.

### Changed

- Depends on `pivotkit-core` `^0.5.0` (was `^0.4.0`): a host updates both together, or it gets
  two copies of pivotkit-core.
- The chart's axes, legend and labels are 14 px or more (`--pk-chart-text-size`, by default
  `var(--pk-small)`), not ECharts' 12 px; the labels are laid out for that size ([#221](https://github.com/eizedev/pivotkit/issues/221)).
- Export → HTML report takes the report's font size (`--pk-font-size` and `--pk-small` in px, so a
  report on a 16 px page writes a 16 px file) and a host's `--pk-report-title-size`,
  `--pk-print-size` and `--pk-print-small` ([#220](https://github.com/eizedev/pivotkit/issues/220)).
- A colour scale in the theme's colours runs from light to strong blue (`--pk-scale-low` and
  `--pk-scale-high` are `var(--pk-heat-low)` and `var(--pk-heat-high)`, the heatmap's colours), not
  from red over yellow to green: it says "more", not "good" or "bad". `--pk-scale-mid` is no longer
  set; a host that sets it gets a three-colour scale ([#212](https://github.com/eizedev/pivotkit/issues/212)).
- The chart's plan, its colours from the tokens and its marks are pivotkit-core's (`chartPlan`,
  `chartThemeFrom`, `pivotkit-core/chart`), so an SVG and a printed report of pivotkit-report draw
  the same chart; the report looks the same. A host page with an import map adds
  `pivotkit-core/chart` next to `pivotkit-core/export`, and `pivotkit-report` (a dependency, loaded on
  the first HTML report, SVG or print of the Export menu) ([#165](https://github.com/eizedev/pivotkit/issues/165)).
- The table follows pivotkit-core's totals ([#155](https://github.com/eizedev/pivotkit/issues/155), [#156](https://github.com/eizedev/pivotkit/issues/156)): column subtotals off in a new report,
  no empty column and no total rows for fields in Rows without a value, no subtotal for a group of
  one item (its arrow stays). Labels without a value column next to them take up to 85 % of the
  report's width instead of 40 %, so a name on a phone is not broken inside a word.
- A subtotal column is set apart from its group: a line before it (`--pk-border-strong`) and a
  slightly darker `--pk-total` (light `#eef1f5`, dark `#21252d`; text on it 14.9:1 and 12.8:1, the
  muted header text 5.4:1 and 6.6:1), and its header's tooltip says what it adds up ([#156](https://github.com/eizedev/pivotkit/issues/156)).
- Options: a total switch that changes nothing is disabled without a tick; every total also needs a
  field in Values ("Needs a field in Values.", `needsValue`). The explanations of the subtotals say
  "subtotal", name a subtotal's label ("North Total") and say that a group of one item has none ([#156](https://github.com/eizedev/pivotkit/issues/156)).
- The npm description names views as JSON files, as the README and the docs do, instead of templates
  ([#191](https://github.com/eizedev/pivotkit/issues/191)).
- npm keywords `pivot-grid`, `pivottable` and `excel-export`, the terms people search for ([#172](https://github.com/eizedev/pivotkit/issues/172)).
- The report reads and writes pivotkit-core's view version 2 ([#165](https://github.com/eizedev/pivotkit/issues/165)):
  the picks of a field are an `in` filter with `not: true` and `blanks`, a rule on the names a `text`
  filter (case and runs of whitespace ignored, `on: "label"` for a field that is not text), "is not",
  "does not contain" and "is not between" the positive operator with `not: true`. Views of version 1
  (stored, shared, the host's) load with the same result. A rule the menus have no word for (a
  loaded view's "is not greater than") is said as "not (…)".
- A relative range the quick choices do not write (a loaded view's hours, or a second range of a
  field) says what it keeps in words, in English and German, and stays as it is: its row in the
  Filter level can only be removed.
- A comparison of dates by another precision (a loaded view's) says its unit ("Feb 2026", "from Q2
  2026") and stays as it is.
- The view files and links the report writes are of format version 2, with the `$schema`
  `https://pivotkit.eize.dev/schema/view-file-2.json` by default; files and links of version 1 load as
  before. The link's place in the fragment is pivotkit-core's (`linkFragment`, `withLinkFragment`).
- A view read from a link, a file, pasted JSON or the tab's storage keeps at most 50 filters and is
  at most 1,000,000 characters long (pivotkit-core's `outsideLimits`), or the host's lower limits.
- The field list's menu has one entry for filtering, **Add to Filters**, instead of two that did almost
  the same ([#157](https://github.com/eizedev/pivotkit/issues/157)): it opens the field's filter at
  once, **Apply** puts the field into Filters with the choice, **Cancel** places nothing. A field on
  Rows or Columns moves to Filters on Apply; a field in Filters opens its filter. "Filter…" is gone,
  and with it the label `filter` (a host's text for it is ignored).

### Added

- The token `--pk-chart-text-size`: the chart's text but the title, resolved to px like
  `--pk-chart-title-size`; it reaches the PNG, the SVG and the HTML report too ([#221](https://github.com/eizedev/pivotkit/issues/221)).
- Corners, the code font, the focus ring and the chart's title and marks as tokens ([#216](https://github.com/eizedev/pivotkit/issues/216)):
  `--pk-radius-xs`, `--pk-radius-mark` and `--pk-radius-icon` (4, 5 and 6 px, four, five and six
  sevenths of `--pk-radius-sm`, so a host that sets `--pk-radius-sm` changes them too),
  `--pk-radius-card` (8 px, the chart's tooltip), `--pk-radius-chart` (the chart's bars and slices,
  `var(--pk-radius-xs)`), `--pk-font-mono` (the JSON text field), `--pk-chart-title-size`
  (`max(16px, var(--pk-font-size))`: 16 px as before up to a 16 px font, as large as the report's text
  above it), `--pk-focus-width` and `--pk-focus-offset` (2 px), `--pk-glow-width` (3 px, the soft ring
  of a focused text field and of a zone a field is dragged over) and `--pk-ring-width` (2 px, the
  inset rings). The report looks the same with the defaults. The chart resolves its title size and
  corners to px, so a host may write them in `em` or `calc()`. A test fails on a corner radius, a
  font family or a ring width written outside the token blocks, and on a radius or a title size set
  from code.
- Font weights as tokens ([#201](https://github.com/eizedev/pivotkit/issues/201)):
  `--pk-weight-normal` (400), `--pk-weight-medium` (500), `--pk-weight-strong` (600) and
  `--pk-weight-bold` (700), documented in Theming. Every rule uses them, the chart's tooltip, title
  and group labels too, so a host whose font looks too heavy or too light sets four tokens instead of
  overriding selectors. The weights 550 (field chips, the drill-down's path) and 650 (titles, table
  headers) are now 600, to keep the scale at four steps; a font without those faces drew them as 600
  or 700 anyway. The HTML report and print take the report's weights along, in the dark theme too
  (its colours only in the light theme, as before). A test fails on a colour or font weight written
  outside the token blocks.
- Export → "HTML report (.html)", "Chart image (.svg)" and a group "Print" with "Print or save as
  PDF…": the table as it is shown (and the chart when it is shown) as a page that opens anywhere and
  prints well, the chart as SVG, and the same report in the browser's print dialog, from a sandboxed
  frame a strict Content-Security-Policy allows. `onExport` gets the kinds `html`, `svg` and `print`
  (with the report's HTML; `false` prints nothing). pivotkit-report is a new dependency, loaded on the
  first of these exports ([#165](https://github.com/eizedev/pivotkit/issues/165)).
- The tip `colSubtotals`: while a Total column shows (column subtotals on, two or more fields in
  Columns, a value, an open column group of two or more items), it says that a Total column adds up the group before it, with the button **Hide column subtotals** ([#156](https://github.com/eizedev/pivotkit/issues/156)).
- The prop `importLimits` ([#169](https://github.com/eizedev/pivotkit/issues/169)): the limits a file
  loaded with `allowImport` is read and shown with, merged key by key over `limits`. The host's data
  keeps `limits`, so a host can keep uploads small (`importLimits={{ rows: 1000 }}`) without capping
  its own data. Without it a file has `limits`, as before. A key of `importLimits` is not capped by
  `limits`, so a file may also get more. Compared by value, as `limits`.
- The Filter level edits what view version 2 can say:
  - A rule on the name offers "does not begin with" and "does not end with".
  - **Also keep items without a value (N rows)** under the rules, for a field with blank items and a
    rule on its items or a quick choice: every such rule keeps the blank items (`blanks: "include"`),
    a new rule too; off, none does. Only the blanks stay a pick: Select none, then "(blank)".
  - A date's quick choices count in a unit: **This [unit]** (the units whose current period has
    data) and **Last [N] [unit]**, with **Include the current <unit>** under it while it is set;
    **More choices**, folded: **Next [N] [unit]**, **Before the last [N] [unit]** and **Rolling
    instead of whole calendar periods**. No unit is finer than the grouping (by month: months,
    quarters, years; a date or by day: days and weeks too). Last keeps its count when the unit
    changes while it reaches the data. **Counted back from** offers the first record and a date of
    your own as well; it stands under the choices when the data end before the current period or it
    is not today, else among More choices. A date being typed keeps the last whole date for the
    ranges and says so; left incomplete, the field shows that date again. When Last's current period
    has no data, **Count back from the latest record (date) instead** under it does that in one
    click. A loaded view's next, this, before, rolling, quarter or week range is its quick choice,
    editable there.
  - **Top items**: **Also show items with the same value as the last one** while a top is set
    (`ties: "all"`); another count or measure keeps it. Under it the level says how many items
    show ("7 items shown"), or, for a field below another on its axis, that a group can show more.
  - The menu's search finds the rule on the name by its operators ("does not begin with").
  Texts in English and German. The chip says a range of quarters, weeks or this period by its
  periods ("this quarter (Q4 2026)", "last 3 months, current period excluded (Aug–Oct 2026)"); a
  rolling range counted from a date says its days, not midnight as a time. The unit selects of the
  quick choices are named after their choice ("Unit of “Last …”") and as high as the count beside
  them. In German, a range counted from the latest or first record says "Datensatz", as the menu
  does.
- The warning about a view's unused parts says when a filter's item is in the data in another case
  (“north”, but “North”), and names a key inside a part of the view by itself. It says when an item
  is longer than 10,000 characters, and how many more problems it does not list.

### Fixed

- The warning about unused view parts keeps the view's or host's locale when the pivot fails
  (including the work and group limits), and falls back to English for an invalid locale
  ([#162](https://github.com/eizedev/pivotkit/pull/162)).
- A workbook and an HTML report exported from the dark theme carry the host's light colours
  (`--pk-scale-*`, `--pk-heat-*`, `--pk-chart-1` and the rest of the light theme): the report reads
  its light theme for the export, without a transition or a frame in between, also inside
  pivotkit-element. Before, they got pivotkit-core's and pivotkit-report's defaults. The HTML report
  takes a host's `--pk-scale-mid` too ([#217](https://github.com/eizedev/pivotkit/issues/217)).
- A change made while a controlled host is still passing back an earlier view (a host whose view
  goes through its server) builds on the report's own history, also when some of the earlier views
  have come back in between: Undo takes back the user's steps one by one and records no "change
  from outside" ([#141](https://github.com/eizedev/pivotkit/issues/141)).
- The Excel export writes a colour scale and data bars in the theme's colours the report resolves
  from its tokens (`--pk-scale-low`, `--pk-scale-mid`, `--pk-scale-high`, `--pk-chart-1`), so a
  theme of the host's carries over; a dark report writes the light theme's colours. Before, the
  workbook always had Excel's red, yellow, green ([#212](https://github.com/eizedev/pivotkit/issues/212)).
- The explanation of an "i" inside a menu (Copy table in Export, a total in Options) is drawn above
  the menu; at the window's right edge the menu in the browser's top layer covered it ([#213](https://github.com/eizedev/pivotkit/issues/213)).
- A description shown on hover of an "i" stays while the pointer is on its way from the "i" to it
  (beside the "i" towards a description moved aside to stay in the window, or in the gap between
  them) for up to one and a half seconds, so a slow move gets there; a pointer that took more than a
  quarter of a second there closed it ([#213](https://github.com/eizedev/pivotkit/issues/213)).
- A choice clicked in a field's Top items level keeps the focus, also in Safari, where a click does
  not focus a radio button ([#119](https://github.com/eizedev/pivotkit/issues/119)).
- The rule between a menu's groups had 1.3:1 contrast in the light theme and 1.2:1 in the dark one,
  and in More, whose groups have no titles, it is the only thing that tells them apart. It is drawn
  in the new token `--pk-rule`, 3:1 against the menu in both themes
  ([#128](https://github.com/eizedev/pivotkit/issues/128)).
- An open menu or popover follows its anchor when the anchor moves or changes size while it is open
  (the zones' open animation, a transition of the host page)
  ([#120](https://github.com/eizedev/pivotkit/issues/120)).
- A delayed popover autofocus frame no longer steals focus from a control already in use
  ([#139](https://github.com/eizedev/pivotkit/issues/139)).
- Outside pie and donut labels appear on the first draw, including their chosen values
  ([#103](https://github.com/eizedev/pivotkit/issues/103)).
- The menus' text actions drew as plain text in the text colour, so they did not look clickable:
  **Back**, **Reset filter**, **Clear**, **Remove**, **change it above**, **Select all**, **Select
  none**, **Only** and **Swap rows and columns** are in the accent colour and semibold (Back at the
  size of the text around it, the others at the small size); Reset filter, Clear, Remove and Swap
  are greyed out while they would change nothing. A status note's **Undo** is semibold in a tint of
  the accent that reads on the note. The reset that gives buttons and fields the report's font and
  colour had outranked these styles; it no longer does, so the other controls look as designed too:
  the icon buttons (×, "i", a field's menu, a tip's ×, a table row's expand arrow) and the folding
  lines of the Filter level (More choices, the items left out by the rules) are muted until hovered,
  a chip's name is semibold, the folded field list's **Fields** button is bold, the link **Skip to
  the toolbar** (shown only while it has the keyboard focus) is in the accent colour and semibold,
  and the folded layout line is at the small size. A field's menu button is
  no longer faded on top of that, so it keeps 3:1. Text fields and selects keep the report's font
  ([#193](https://github.com/eizedev/pivotkit/issues/193)).
- The Filter level's **Count back from the latest record (…) instead** looked like a note, not like
  something to click: it is a small button as the level's **Compare** buttons (a border, an icon
  before its words, at least 24 px high, its text wrapping inside it at a narrow width)
  ([#179](https://github.com/eizedev/pivotkit/issues/179)).
- The note of a file over a limit named the file twice (`big.csv could not be loaded: "big.csv" has
  more than …`) and only `limits.*` as what a host raises, although `importLimits` may set the limit.
  It says the limit in the report's language (English, German), with its key in brackets, and that a
  host can raise this limit: "big.csv could not be loaded: it has more than 1,000 rows (limits.rows):
  load a smaller extract of it, or a host can raise this limit"; other errors of a reader lose the
  file's name in front in both of its forms ([#185](https://github.com/eizedev/pivotkit/issues/185)).
- A workbook over pivotkit-xlsx's limits `archiveEntries` or `unpackedBytes` is said in the report's
  language too ("book.xlsx could not be loaded: it has more than 524,288,000 bytes unpacked
  (limits.unpackedBytes): …"), with the words in `labels.dataImport.limitWhat`; it showed
  pivotkit-xlsx's English message ([#239](https://github.com/eizedev/pivotkit/issues/239)).
- A rule on the names ("begins with “ACTIVE DIRECTORY”") keeps the items whose names hold a no-break
  space or other whitespace, and a space typed at the end does not matter
  ([#159](https://github.com/eizedev/pivotkit/issues/159)).
- The search of a field's item list and of a grouping's item picker finds an item whose label holds
  a no-break space or another run of whitespace when a plain space is typed, and ignores spaces
  typed at the ends ([#159](https://github.com/eizedev/pivotkit/issues/159)). Both searches fold
  text with pivotkit-core's `foldText`.

## [0.4.0] - 2026-11-11

### Added

- Loading data in the browser ([#44](https://github.com/eizedev/pivotkit/issues/44)), with the new
  prop `allowImport` (off by default): a **Data** button before Views (under More on a narrow report)
  with the data source (name, rows × columns), **Load data…** and **Back to original data**; a file
  dropped onto the report, with an overlay while it is dragged; a preview before the data is
  replaced: the sheet of a workbook, the first rows, a type per column (Text, Number, Date, Yes/No),
  the readers' notes, progress and **Cancel** while it reads, Escape to cancel. A file that cannot be
  read keeps the data and says why with the reader's message. Loading is a step of the undo history
  (Undo and Redo move between the data sets with their own views, up to three kept); a dot on Data
  and a line under the result name the file while its data is shown. The empty report offers to load a
  file ("Load data to start" without data). Texts in English and German (`labels.dataImport`).
- `plugins`: reader plugins of `pivotkit-core/import` (pivotkit-xlsx for Excel workbooks);
  `onDataLoad`: every change of the data shown (`cause` "load", "original", "undo", "redo"; returning
  `false` refuses a file); `importWorker`: a module worker (the new entry `pivotkit-react/import-worker`)
  that reads CSV and JSON off the page, with the page as the fallback.
- While a file's data is shown the report's source is the file's: its name and the first 16 hex digits
  of the SHA-256 of its name and column names, so the browser store keeps views per file.
- A report mounted again by its host ([#131](https://github.com/eizedev/pivotkit/issues/131)), as
  PowerShell Universal does on its light/dark switch and on `Sync-UDElement`, shows the loaded file
  again with its view and its undo steps, when it has the same `storageKey` and the host's data is
  the same (`dataKey`, else its columns, and `source`). Kept in the page's memory only, never in
  browser storage, for up to four reports; let go when the host's data is shown again. `onDataLoad`
  hears it as `cause` "restore".
- `data` takes columnar data (`{ columns, types, data }`), as pivotkit-core's `encode` does.
- The import UI is a file of its own, `dist/import-ui.js` (with `pivotkit-core/import`, which this
  release needs from pivotkit-core), loaded on its first use; the first load keeps the Data button and
  the drop handler.

- Identifier fields ([#113](https://github.com/eizedev/pivotkit/issues/113)): a number field of whole numbers whose name ends in the word ID, Nr,
  No, Number, Key or "#" ("ID", "CustomerId", "customer_id", "Order No", "Serial #", "userID2", "ID
  (Asset)"; not "Paid", "UUID" or "Number of items"), for which
  `fieldDefaults` sets none of `agg`, `format` and `drillFormat`, is counted when it is added to
  Values (from the field list, by a drag or by Move to; Sum stays a choice) and shows its numbers as
  they are in the drill-down (27000, not 27,000). Any of the three entries overrides it.
- The token `--pk-layer-z` (default `50`): the z-index of the layer of menus, sheets and popups in a
  browser without the Popover API ([#111](https://github.com/eizedev/pivotkit/issues/111)).
- The host's own view (`view`, else the first `defaultView`) is warned about like a loaded view when
  the data cannot use parts of it, once per distinct view, not while `loading` ([#83](https://github.com/eizedev/pivotkit/issues/83)).

### Changed

- UI: **Start over** in the toolbar, a menu button after Undo and Redo, replaces the Reset button. It
  holds **Reset** ("Back to the start view. Your data stays.") and **New, empty report** ("No fields.
  Undo brings it back. Your data stays."), each greyed out with its reason ("Already at the start
  view.", "The report is empty already."); Reset is also off when the start view is the empty report
  ("The start view is empty: use New, empty report."). When both are off, Start over itself is off
  (focusable, `aria-disabled`, with the reason "The report is empty already." as its description
  and tooltip). Enter, Space or the down arrow opens it. In
  More, Reset and New are entries of their own. The test id `reset` is now Reset's entry in that menu
  (`start-over` is the button; `new-report` and `more-new-report` New's), so a host's test that
  clicked `reset` opens Start over first. New labels `startOver`, `resetAlready`, `resetStartEmpty`,
  `newHint`; `resetHint` is the new longer text; `newAlready` is a first-load text now
  ([#88](https://github.com/eizedev/pivotkit/issues/88)).
- UI: the Views menu holds what persists, in four groups: This view (Save, Save as…), Shared views,
  My views, Share this view (Copy link, Copy view as JSON, Download view, Open view file…), with no
  Share level in between. "New, empty report" left it for Start over; "Load view…" reads "Open view
  file…" (the label `loadView`; German "Ansichtsdatei öffnen…"), its level "Views › Open view file".
  The labels `share` and `settingInfo.newReport` are gone.
- UI: every menu draws its groups alike: each group's title in bold, as Export's, with a rule between
  one group and the next (Options, Views, the chart type, More, a chip menu's levels such as "More
  statistics"); More has rules only; the chart's Display parts its own groups (Value labels, Legend,
  Title, ...) with a dashed rule, each a named group for a screen reader. One component draws them
  (`Group` in popover.jsx) ([#105](https://github.com/eizedev/pivotkit/issues/105)).
- An item of a toolbar menu (Start over, More) that is greyed out stays reachable with the arrow keys
  (`aria-disabled`), so a screen reader hears its reason.
- Reset's note "Back to the start view" has **Undo**, as New's has. In More, a letter jumps to the
  next entry that starts with it, as in the other menus, and Layout is a checkbox item
  (`menuitemcheckbox`), not one of a set of choices.

### Fixed

- A loaded file shown again after a new mount lost its view when the host mounted the report twice in
  a row (PowerShell Universal's `Sync-UDElement`, two mounts within about 30 ms) or mounted it again
  before it passed back a view it was told: the report now starts on the kept view history at once,
  and keeps the view it told a host that controls the view, not the host's view from before
  ([#135](https://github.com/eizedev/pivotkit/issues/135)).
- Toolbar buttons moved into More although the free room would hold some of them (a report about
  1,000 px wide showed Reset, Layout and Options in More next to a wide gap). A button moves now only
  when the room left cannot hold it: the room is measured with the texts of the report's language
  (not the longest of every language), and a button that fits stays even when one before it in the
  order had to go. The chart type keeps the room of its longest type, so picking one never moves a
  button, and while a toolbar menu is open nothing moves (a language change keeps the menu, its
  button and its focus). The order is Layout, Options, the chart type, then Start over (where New is) and Views
  last; More lists them in groups
  ([#88](https://github.com/eizedev/pivotkit/issues/88)).
- Menus, bottom sheets and "i" popups opened by a click open in the browser's top layer
  (`popover="manual"`; a description shown on hover stays in the report's layer): a host's
  fixed navigation above z-index 50 (PowerShell Universal's drawer at 1200) no longer covers the left
  of a sheet or an "About" popup at 800 px or less ([#111](https://github.com/eizedev/pivotkit/issues/111)). They stay in the report's DOM, so its
  tokens and the web component's shadow styles apply; Tab inside them is moved by the report (WebKit
  left a top-layer popover for the page's body), past the last control a popover closes and the
  focus goes back to its button.
- A large table scrolls in one box: the screen reader texts of empty cells no longer made the result
  area scroll as well, with two scroll bars side by side ([#112](https://github.com/eizedev/pivotkit/issues/112)).
- A virtual table's row label column (300 rows or more) keeps its width while the table scrolls:
  measured per view and data over its 50 longest labels in the table's own font (again when the font,
  its size or a web font changes), at most 28em, a longer label cut with "…" and whole in its tooltip
  ([#110](https://github.com/eizedev/pivotkit/issues/110), [#121](https://github.com/eizedev/pivotkit/issues/121)).
- Tab in a bottom sheet: one Tab from a chip menu's first level closes it and moves on from its chip;
  a level with fields keeps Tab inside the sheet (Chromium let it out to the page). One definition of
  a Tab stop for every layer (`tabStops`).
- Field names in the field list break between words only; a word too long for its line ends in "…"
  ([#114](https://github.com/eizedev/pivotkit/issues/114)). The field list is wider (`--pk-panel-w`
  288 px, at most 284 px on a medium report; it was 268 and 244) and a field's menu button takes the
  least room a control may (24 px), so a name of up to about 16 characters fits next to its zone mark.
- A description opened on a narrow report is a bottom sheet as wide as the window, not a 320 px box.
- Every `input`, `select` and `textarea` has a `name` of its own report (unique also across two web
  components on a page) and a label; Chrome listed them as form fields without an id or name
  ([#115](https://github.com/eizedev/pivotkit/issues/115)).
- A line of the warning about a view's unused parts goes once its part of the view is changed by
  hand, and comes back with Undo ([#82](https://github.com/eizedev/pivotkit/issues/82)).
- A modal layer (the file preview, the drill-down, the field drawer) whose first frame comes late
  (WebKit) no longer takes the focus back from a control inside it: **Load data** keeps the focus once
  the first rows are read, and the sheet list keeps it after a sheet over the limits
  ([#136](https://github.com/eizedev/pivotkit/issues/136)).

## [0.3.0] - 2026-11-09

### Added

- The Filter level rebuilt. A summary card that stays in view: what the table shows of the field in
  bold ("3 of 12 months shown", "Nothing shown" in red), why the rest does not, each reason with its
  count ("9 left out by your picks", "24 outside last 2 years (2025; 2026 has no data)", "11 left out
  by the rule"), with nothing shown the one reason and the nearest totals ("No month has a total
  Average of Mean °C that is greater than 25 – the totals go from 13.4 (Jan) to 22.2 (Jul)."), the
  rows and the data's dates; **Reset filter**. Three sections that fold, with their state on the
  header and Clear or Remove beside it: **Quick choices** (a date along the time line only; only the
  choices that keep a row, each with the data's share of its days and its rows, a line naming the
  ones not offered, counts that start where the data end, Last [N] days for a date field, and
  **Counted back from** today or the latest record when the data end before the current period, saved
  as the filter's `anchor`), **Years combined** instead for a grouping that repeats every year (a
  toggle per year of the data, written as whole-year comparisons on the dates), **Pick items** (the
  items a rule leaves out in a folded tail group, their ticks kept) and **Rules** (an "i" per rule
  with what it compares and an example - the total's names its Grand Total scope -, a line under
  each with what it keeps, the quick choice among them as a line to read, not a rule; a searchable
  list instead of a native select for a grouping with more than twelve items). The first rule or
  quick choice opens Rules and folds Pick items, the last one going does the reverse, a fold by hand
  wins afterwards; on a phone one of them is open at a time. A quick choice says the data's share on
  the chip and the menu's first level too ("last 2 years (2025; 2026 has no data)", "last 12 months
  to Dec 2025"); the chip says Years combined as years ("2024 to 2025"). New labels (`summary*`,
  `nouns`, `quickRows`, `quickHidden`, `anchor*`, `yearsCombined*`, `pickItems`, `picksState`,
  `rulesState`, `tailOut`, `ruleKeeps*`, `ruleInfo`, `scope*`, `picker*`, `relativeTo`, `withShare`,
  `noData`, `summaryQuickOnly` and more); gone: `moreFilters`, `itemsPicked`, `itemsShown*`, `pickedPlus`, `ruleOut`,
  `quickCustom`, `conditionOnNames`, `removeConditions`. New tokens `--pk-danger-soft` and
  `--pk-warn`. Text actions in the menus (Reset filter, Clear, Remove, Select all, "change it above")
  are quiet buttons, disabled while they would change nothing. The data range in the footer and the
  axis title and the Group level's names come in a separate change.
- Filter rules ([#89](https://github.com/eizedev/pivotkit/issues/89),
  [#90](https://github.com/eizedev/pivotkit/issues/90)). The Filter level of a date field (or a
  grouping of one) starts with quick choices: All, This year, Last [N] years and, unless it is
  grouped by year or quarter, Last [N] months, each with the days it keeps ("2022–2026"), relative to
  today in the data's time zone; "Custom rules" while the rules hold more. Under "More ways to
  filter" a rule editor: sentences that all apply together, added and removed one by one, each
  applied once complete: the item itself compared ("Released by year is from 2022", for dates also
  "is in the last N years"), its total compared ("Count of Released is greater than 3"; "Count of
  rows" with nothing in Values) and a rule on its name. The chip, the menu's first level and the
  level say the same words: "last 5 years (2022–2026)", "from 2022", "Count of rows > 3".
- A field in Filters opens a menu of its own with the same Filter level (Filter, Move to, Remove
  field) instead of the filter popover.
- The menu search finds the rules ("rule"), the quick choices with the count typed ("last 3
  years") and a year compared ("from 2022"), and applies them at once.

### Changed

- A quick choice replaces the field's relative ranges only: its comparisons stay as rules, and
  "Remove" beside Rules keeps the quick choice. "Last [N] years" starts at 2 ("Last 1 year" is This
  year); a month-of-the-year grouping (and the other groupings that repeat every year) has no quick
  choices.
- The text condition and the condition on a value of the Filter level are rules now: each is added
  with its button and taken away with its ×; "is anything" and "No condition" are gone. "Remove the
  conditions" is "Remove the rules" and takes the quick choice of a date too.
- A sort, Top items or a value condition by the row count the view does not show is named "Count
  of rows" ("Anzahl der Zeilen").
- The filter popover is only the field list's "Filter…" of a field not placed yet, so its "Remove
  filter" is gone (with the label `removeFilter`).
- The menus of a chip and Options are in levels instead of long accordions. The first level is a
  short summary: one row per topic with what is set on its right ("Filter · All", "Top items · Off",
  "Number format · ● Currency"; the dot and ", changed" in its accessible name where it is not the
  default), or a topic's few choices right there (A to Z and Z to A, a value's Highlight, the totals
  and help switches). A row opens the topic's own level in place, titled with the field ("Month ›
  Group"), with **‹ Back**. The first level and the levels of choices are ARIA menus (WAI-ARIA
  Authoring Practices: one Tab stop, arrow keys, Home and End, type-ahead; Enter or the right arrow
  into a level, Escape or the left arrow back to the row it came from, Escape on the first level
  closes the menu, Tab closes it and moves on); a level with form controls is a group with its
  heading. A search above a chip menu's first level finds a choice of any level, with its path.
- Every choice in these menus applies at once, without Apply: the values of the Filter level (in a
  chip's menu; the filter popover of a Filters chip keeps its draft and Apply), the text condition and
  the numbers a moment after the typing stops (or with Enter), a value's name with Enter or when the
  field is left; Escape in a field gives back what applies. Number ranges keep Apply (size and start
  apply together).
- The Filter level of a field: how many items the list keeps, **Remove filter** (now also taking the
  value condition; Top N stays), the values with their counts, the condition on the names, and the
  condition on a value as a sentence ("Keep Region items whose Sum of Revenue is greater than …";
  "is anything" takes it off). The Top items level: Off, Top 3, Top 5, Top 10, or **Top N…** with Top
  or Bottom and a count. The Group level of a date: one column, each unit's example on its right,
  under "Along the time line" and "Same period every year". Sorting by a value: on the first level
  for one value, else in the level **Sort by value**.
- Options: the totals and help switches are menu items (`menuitemcheckbox`); one that would change
  nothing is `aria-disabled` with its reason, so the arrow keys still reach it; the "i" next to a
  total is for the pointer, its text is the item's description; Keyboard shortcuts is a level.
- The Views menu is in levels too: its first level is the flat list to scan (This view with Save “…”,
  Save as… and New, Shared views, My views, Share); Save as…, Share (copy link, copy JSON, download,
  Load view…) and the questions before a delete, a publish or a Save over a shared view open levels of
  their own. An entry's Publish and Delete are items next to it, reached by the arrow keys; after a
  delete the focus goes to the entry that takes its place.
- The Views menu's **Share** row sits under a group heading of its own, **Share this view** (German
  "Diese Ansicht teilen"), like This view, Shared views and My views, so it is not lost under the lists.
- No menu folds any more: the chart type menu (its Display settings shown at once) and the Export
  menus are flat lists in titled groups. The folding (`SECTIONS`, `open:<section>` and
  `closed:<section>` in the tips' list) and **Reset menu sections** are gone; a stored state of a
  section is dropped when the list is read, and `dismissedTips` and `onTipDismiss` carry only tips and
  switches.
- After a usability review: the Filter level shows the list first and folds "More ways to filter"
  (the text condition and the condition on a value) each time it opens; its first line names the
  conditions; Clear picks and Remove the conditions replace Remove filter there; the comparison has a
  line of its own. A typed name, count or number applies when the menu closes from a click outside.
  The search knows "percent", "%", "rename", "top 5" and the two conditions, and `/` goes to it. A
  format the menu does not offer (number:1) is a checked entry by its name. The levels of choices are
  one column, the chip menus 420 px wide. The Sort row names a sort by a value; the menu's head names
  the field as its levels do; Expand all has a neutral icon; Select all and the Filter level's
  actions are underlined. A popover keeps its side while its content changes.
- A menu whose entries are all off (the Export menu of an empty report) no longer puts the focus on
  its first "i", whose explanation opened over the entries; the menu takes the focus itself.
- Text fields, searches and selects in the menus have an edge of 3:1 contrast in both themes: the new
  token `--pk-input-border`.
- Labels of the menus (a host's `labels` for them): new `shareThisView`, `back`, `backTo`, `levelTitle`, `searchMenu`,
  `searchMenuShort`, `searchResults`, `searchNothing`, `sortByValue`, `sortOldestShort`,
  `sortNewestShort`, `filterTopic`, `filterAll`, `groupTopic`, `groupNoneShort`, `off`,
  `moveToTitle`, `topOwn`, `binsOff`, `itemsPicked`, `valueConditionTitle`, `keepWhose`,
  `valueOpAny`, `nameHint`, `showAsKeywords`, `nameKeywords`, `filterKeywords`, `formatDecimals`,
  `pickedPlus`, `conditionOnNames`, `conditionOnValue`, `listAnd`, `clearPicks`, `removeConditions`,
  `moreFilters`; changed: `valueOps` is the comparison inside the sentence ("is greater
  than", German "größer als"), `groupCyclic` reads "Same period every year"; gone (no longer shown):
  `chooseValues`, `valueFilter`, `change`, `removeSetting`, `topStart`, `binsStart`, `filterIs`,
  `groupBy`, `resetSections`, `resetSectionsDone`. A host's text for a key that is gone is ignored.

### Fixed

- A press inside a menu that a chip or a field opened no longer drags that chip or field: selecting
  text in the menu, pressing a native select of a rule, or a click that moves a little (Clear picks
  over the Values zone) moved the field to another zone and lost its filters. The menu is rendered
  through a portal, and React passed its mouse and touch events up to the chip's drag listeners;
  they now take only events from the chip's or field's own elements.
- Filter rules after review: a rule on the names shows its words on the chip ("contains “linux”");
  the pick list marks the items the field's rules leave out and the first line counts what shows
  ("2 of 36 items shown: last 2 years (2025–2026)"); the quick choices follow Undo; a count above
  500 says so; a new rule and the opened rules scroll into view; a narrow chip cuts the rule, not the
  field's name; "is not" says blank items are not kept; counts of one have their own words ("Letztes
  1 Jahr", "im letzten 1 Monat"); the rule on a total names the items ("Region items whose …"); the
  search offers "from 2022" for a grouping by year only. The labels `labelOps` load first now (the
  chip says them).
- On a touch screen the field list keeps its desktop rows: the grip, the "i" and the menu of a
  field keep their size and get a hit area 44 px high instead (the grip's 44 px wide), within their
  own row; they made every row 44 px or more high and broke names such as "Sunshine h" into two lines.
- Highlight keeps a value's own colours: Colour scale while it is checked changes nothing (it
  replaced a view's own colours by the theme's), and None or Data bars and back bring the value's
  colours of an earlier step of the history back.
- The "i" popover (and every other popover) appears at its final size and place
  ([#91](https://github.com/eizedev/pivotkit/issues/91)). Where the area of fixed elements ends before
  the window's edge (a classic scroll bar, as on Windows; a transformed host element), it narrowed a
  little on every placement, over about a second; it now takes its own width (`width: max-content`,
  capped as before) and is placed inside the window without its scroll bars.
- With reduced motion a chip's menu (and every other menu) takes the focus when it opens
  ([#78](https://github.com/eizedev/pivotkit/issues/78)). The reduced-motion rule gave every element a
  transition of 1 ms, also those without one of their own (`transition-property` is `all` by
  default), so a popover shown from `visibility: hidden` was still hidden in the frame its focus
  moved; reduced motion now turns animations and transitions off (`animation: none`,
  `transition: none`), so nothing moves at all.
- German texts quote with German quotation marks
  ([#79](https://github.com/eizedev/pivotkit/issues/79)): a text condition in a chip's menu
  ("enthält „an“") and the fields a view for other data names ("Felder, die diese Daten
  nicht haben: „Country“") take their quotes from the new label `quote` (`"“{text}”"` in English,
  `"„{text}“"` in German); they were English quotes in every language.
- The empty report's first steps ("Build your report in three steps" with its **Start with …**
  buttons) are no longer cut off in a report lower than they are (a host's height, the result's least
  height of 240 px): the result's area scrolls what is taller than it (`.pk-result` is
  `overflow: auto`); the table keeps scrolling in its own box.

## [0.2.0] - 2026-11-08

### Added

- A view's unused parts as a warning in plain words
  ([#56](https://github.com/eizedev/pivotkit/issues/56)). What a saved view (the host's templates
  and the browser store's), a link or a loaded file asks for and the data or this version cannot
  give is a notice above the result, open the first time it shows for a view (another view loaded
  opens it again, also with the same parts) and folded with its title: "2 parts of this view could
  not be used", one line per part with what it is about in bold (the value's name, the field, the
  part of the report; two entries of one name say which one, "Sum of Units (no. 2 in Values)"),
  what is wrong and what is used instead ("Quakes: the colour scale needs two or three colours - the
  default colours are used"), and below it, small, the path and pivotkit-core's message for
  developers. An open warning shows its first three lines (two on a narrow report) and "Show N more"
  for the rest. A screen reader hears it once (the title through a live region, or the status note
  "View loaded; some parts did not fit this data" alone); it never takes the focus; its x dismisses
  it and moves the focus to what follows it. The words for every issue code (pivotkit-core's
  `VIEW_ISSUE_CODES`) load on demand when a view has such parts (`unused-texts.js`, German in a file
  of its own); until then, or when they fail, each line shows the core's English message, and a
  German report falls back to English. A code a newer pivotkit-core adds gets a general text.
  The plain words need the pivotkit-core release with issue codes (the next release); with an
  earlier pivotkit-core each line shows the core's English message.
  Labels: `unusedParts` (the title, a count), `unusedPath` ("For developers:"), `unusedMore` (a
  count) and `unusedFewer` are new; the texts of the lines are `labels.unused` (`codes`, `dropped`,
  `sections`, `settings`, `view`, `quote`, `position`, `other`, `item`), which a host overrides as
  any label and which `pivotkit-react/labels` has in `LABELS`. Hosts that override labels: `issues`
  is gone (the title is `unusedParts` now, with the count in it), and so are `viewMissingFields`,
  `viewOtherIssue` and `viewOtherIssues` (each part has its own line now).
- Sorting with a click on a table header
  ([#55](https://github.com/eizedev/pivotkit/issues/55)). A value's name sorts the innermost row
  field by that value: largest first, smallest first, then the field's own order again; a row
  field's name toggles A to Z and Z to A. It writes the same sort entry as the chip menu, as one step
  Undo takes back. Only the name is the button (the cell's edges stay free), reached with Tab and
  pressed with Enter or Space; with column fields only the grand total column's value names sort.
  The header whose sort was chosen carries `aria-sort` (one at a time; `other` for a custom order;
  the default A to Z none); an
  arrow marks the chosen order and, on hover and focus, the next one, and a faint arrow every name
  that sorts on a touch screen, where the name is a 44 px target; a screen reader hears the new
  order. The table's tip ("Click a value, ...") and `shortcuts.open` say that a header sorts. New
  labels: `headerSort`, `headerSortDesc` and `headerSortAsc` (the tooltip of a row field's and a
  value's name) and `headerSorted` (what is read out).
- Save, Save as and New for views
  ([#60](https://github.com/eizedev/pivotkit/issues/60)). The toolbar shows the name of the view
  loaded (a saved view, a view file, a link) next to Views, with a dot while it has unsaved changes
  (`labels.unsavedChanges`); the name is a button that opens Views. The Views menu starts with
  "This view": **Save “…”** writes the loaded view under its name in one click (a view of the
  browser store in its place, a user's view of the host through `onSaveTemplate`, a shared view
  through `onPublishTemplate` with `canPublish`, after "Replace the shared view “…” for everyone?").
  It is off with the reason for a shared view the user may not change, for a view from a file or a
  link and while the report is empty. **Save as…** is the name field (its button "Save as"): a
  name that exists among the user's views asks "“…” exists. Replace it?" first. **New, empty report** (in
  the menu) empties the report to the start screen in one step. The name belongs to the history's steps: New and Reset take it away
  (the report no longer shows that view), Undo and Redo move it with the view. A view of the browser
  store is known by its name and the data it names, so two views of one name (one saved without
  named data) stay apart; another source with the same columns keeps the view but not its name. A
  reload with `persistView` keeps the view, not its name. A save that answers after New, another
  view loaded or a change names nothing it did not save. New labels: `newEmpty`,
  `unsavedChanges`, `steps.new`, and in the menus `thisView`, `saveNamed`, `saveAs`,
  `saveSharedLocked`, `saveNotInViews`, `replaceConfirm`, `replaceSharedConfirm`, `replaceAction`,
  `newAlready`, `settingInfo.newReport`.
- Publish as shared view hands over the view in the same form as Save: normalized against the data,
  with the host's custom orders (`fieldDefaults.order`) the report shows.
- Host notes: Save and Save as call `onSaveTemplate(name, view, { scope: "user" })` and
  `onPublishTemplate(name, view)` with a name that exists: the host replaces the view of that name
  (an upsert by name), it does not add a second one.

### Changed

- The field chip menu shows each setting first, one line per setting
  ([#57](https://github.com/eizedev/pivotkit/issues/57)): "Top 10 by Sum of Revenue · Change ·
  Remove", "Ranges of 0.5 from 4.5 · Change · Remove", "Sum of Units > 1,000 · Change · Remove",
  "Filter: 15 of 45 · Remove" (each Remove takes only its own setting); with nothing set, one item
  ("Show top items…", "Group into ranges…", "Value condition…") opens its form in place, with Apply
  and Cancel (Cancel puts the focus back on the line; the form scrolls into view). Filters offer
  "Choose values…" and "Value condition…" as equals. Order: Sort, Filters, Top items, Group, Move.
  The field's description (with its link), and in a value's menu the note that values are not
  filtered there, are behind an "i" next to the field's name in the menu's first row, instead of a
  paragraph.
- Menu sections: a folded title says what the section holds, muted at its end ("Number format ·
  Automatic"), with a dot (read as ", changed") when it is not the default; titles read as controls
  (the text's colour, a larger chevron, 44 px high on a touch screen). Share (Views) and Display
  (chart type) start folded; Options → Rows, the value's Name and its Filters note fold no more.
  Options → Help has "Reset menu sections" (the focus then on the Help title, a status says it);
  "Show dismissed tips again" keeps the folding, as before. The drill-down's Export menu has Download
  before Copy, as the toolbar's. My views, empty in the browser store, is one line.
- Labels for hosts that override them: `topN` reads "Top items", `bins` "Number ranges", `valueFilter`
  "Value condition…"; new are `change`, `topStart`, `binsStart`, `binsState`, `chooseValues`,
  `noViewsStore`, `resetSections`, `resetSectionsDone`, `sectionChanged` and
  `settingInfo.valuesFilter`. `valuesFilterHint` is gone (its text is `settingInfo.valuesFilter`): a
  host's text for it is no longer used. The `dismissedTips` entries `open:`/`closed:` of `name`,
  `valueFilters` and `folding` are dropped.

- What runs only after a click in a menu loads with the menus, not with the report
  ([#73](https://github.com/eizedev/pivotkit/issues/73)): the view changes only the menus make and
  the filter's summary (`menu-ops.js`), sharing's Copy link, Copy view as JSON, Download view and
  Load view (`share-actions.js`), the drill-down's table (`drill-table.js`, built when the panel
  opens), and the texts only these show (the totals and their reasons, Expand and Collapse all's
  notes, the filter's text conditions, sharing's notes, `toastExported`, `chartDisplay`) move to
  `menu-labels.js`. The chart's label layout (`chart-layout.js`) loads with ECharts. A host's
  `labels` for them still win, `LABELS` of `pivotkit-react/labels` is unchanged, and the files of
  `dist/` stay the same; a value clicked before the menus are there opens its rows once they are.

- The menus' German texts are a file of their own, `dist/menu-texts-de.js`, loaded with the menus
  only for a German report, or when the locale changes to German
  ([#73](https://github.com/eizedev/pivotkit/issues/73)). A menu waits for them ("Loading…"), so it
  never shows English first, and keeps its texts (and its state and focus) while the language
  changes with it open; when the file cannot load, the menus open in English and the next menu tries
  again. A host's `labels` still win; `labels` with `lang: "de"` load the file too. The loading line
  is announced to screen readers. The menus' sections and the "i" of the
  settings (`section.jsx`) load with the menus, not with the report; their context is `help.js`.
  The element's menus are 2.7 KiB gzip smaller for every page that is not German. `LABELS` of
  `pivotkit-react/labels` is unchanged. A host that copies `dist/` by hand copies the new file too
  (it is in `dist/`).

- The README, the package's page on npm, is a short landing page: what pivotkit-react is, one screenshot,
  install, one example and a table of links into the
  [documentation site](https://pivotkit.eize.dev/), which holds the details.
- Views stays in the toolbar from a window about 1280 px wide: it is the last button to move into
  "More" (`OVERFLOW_ORDER`: Reset, Layout, Options, the chart type, Views), so it shows wherever one
  button besides Undo, Redo and Export fits, with the loaded view's name before it. Options and the
  chart type move into "More" before Views: at about 1280 px the chart type is in "More", from
  about 1440 px both show. The name is cut with "…" but never below 4em.
- Every save closes the Views menu, as Save “…” does: also the first Save of a view without a name
  and Save as (it stayed open with Copy link). The focus goes back to Views (or More), the note says
  "View “…” saved".
- The question before a view is replaced ("“…” exists. Replace it?", "Replace the shared view “…”
  for everyone?") has the focus on Cancel, so Enter replaces nothing.
- The view loaded has a check mark (and `aria-current="true"`) in Shared views or My views; while
  Views is in "More", More shows the dot for unsaved changes too.
- The texts of the keyboard shortcuts (`labels.shortcuts`) load with the menus, where Options, Help
  shows them (`menu-labels.js`): a host's texts for them apply as before. This made room in the first
  load for sorting by a header.
- The forms of a row or column field's menu (number ranges, Top N, value condition) remove what
  they set with **Remove** (was "Clear"; label key `removeSetting`, was `clear`), and Apply with an
  empty number removes it too instead of asking for a number. One undo step, as before.
- The foot of a chip menu reads **Remove field** ("Feld entfernen"), so it is not mistaken for a
  form's Remove.

### Fixed

- Copy table, Copy data as JSON, Excel, CSV and PNG are off for an empty report (no field placed),
  with the reason "Add a field first." (`labels.exportNeedsField`); they produced empty output
  before, and no `onExport` call happens for them now
  ([#61](https://github.com/eizedev/pivotkit/issues/61)).
- A click or Enter on a field of the field list that is in Values already no longer adds it again
  ("Count of Ticket 2", "3", ... on a repeated Enter): it stays, and the status line says "Ticket is
  already in Values", as for a field in Rows. A second value of the same field is "Add to Values
  again" in the field's menu (label `addAgain`).
- A donut on a narrow chart: a legend on the right of a chart narrower than 480 px is drawn at the
  bottom, so the ring keeps its width, and numbers inside a ring too thin for them are written
  outside on a line instead of spilling over its edges.
- A colour scale in the theme's colours (Highlight, "Colour scale") no longer shows "Some parts of the
  view were not used" (pivotkit-core's normalize).

## [0.1.0] - 2026-11-07

First release.

### Added

- The Export menus (the toolbar's and the drill-down's) fold their sections Download and Copy
  (`exportDownload`, `exportCopy`), remembered as the other sections. Copy table and the drill-down's
  Copy say in their "i" and their note that the copy is tab-separated and pastes into Excel or Google
  Sheets as columns. The status notes show above the drill-down panel, so its copies and exports are
  seen. The popovers' layer is no longer inside a clipping box: the report's layout clips its content
  instead of the report, so Safari no longer cuts a popover (the filter from the field list) at the
  report's edge.
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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.5.0...HEAD
[0.5.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.4.0...pivotkit-react@0.5.0
[0.4.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.3.0...pivotkit-react@0.4.0
[0.3.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.2.0...pivotkit-react@0.3.0
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.1.0...pivotkit-react@0.2.0
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-react@0.1.0
