# Changelog

All notable changes to `pivotkit-element` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.0] - 2026-11-26

### Added

- The import preview lets a person pick a column's decimal mark. See pivotkit-react's changelog.
  The import group grows to 23.7 KiB gzip on an official Node 24 build, its budget to 23.9 KiB
  ([#787](https://github.com/eizedev/pivotkit/issues/787)).
- A field's menu has Default order, and Chart settings says what its unclear choices do. See
  pivotkit-react's changelog. On an official Node 24 build the menus group grows to 60.3 KiB gzip, its budget
  to 60.3 KiB, and the texts group, with the German menu texts, to 8.7 KiB, its budget to 8.8 KiB
  ([#916](https://github.com/eizedev/pivotkit/issues/916),
  [#917](https://github.com/eizedev/pivotkit/issues/917),
  [#963](https://github.com/eizedev/pivotkit/issues/963)).

### Changed

- Bundles pivotkit-core 0.11.0, pivotkit-react 0.11.0 and pivotkit-report 0.7.0.
- The zones' colours and the field names in the table's header (see pivotkit-react) add 0.7 KiB to
  the first load: 179.7 KiB gzip on an official Node 24 build, within its budget of 182.5 KiB ([#920](https://github.com/eizedev/pivotkit/issues/920)).
- The first load is 3.3 KiB smaller: 179.0 KiB gzip on an official Node 24 build, in 13 files as
  before (was 182.3 KiB). Its budget stays at 182.5 KiB. The code moved loads on demand, and the
  budgets of the chart, export and report groups rise with it (260.7, 13.7 and 26.8 KiB):
  - The chart's events and each draw load with ECharts: the chart group grows by 1.3 KiB to 260.2 KiB.
  - pivotkit-core's view description loads with the HTML report: the report group grows by 2.3 KiB
    to 26.3 KiB, with the Excel number formats.
  - pivotkit-core's Excel number formats load with the export: the export group grows by 0.8 KiB to
    13.2 KiB ([#772](https://github.com/eizedev/pivotkit/issues/772)).
  - The German words of the HTML report's filters and summary load with the report, not with the
    first load: the report group grows by 3.4 KiB to 29.7 KiB, its budget to 29.7 KiB
    ([#798](https://github.com/eizedev/pivotkit/issues/798)).
- The README says that a minor release of 0.x can break things, with links to Versioning and Upgrading.
- The chart's load group grows by 1.6 KiB to 261.8 KiB gzip with pivotkit-core's fix of text on
  coloured fills and of high and low points beside grouped bars, its budget to 262.0 KiB
  ([#913](https://github.com/eizedev/pivotkit/issues/913), [#914](https://github.com/eizedev/pivotkit/issues/914)).
  The first load stays the same.

### Fixed

- An element added to the page again while a link is in the page's address opens the link. Before,
  it threw a `TypeError` and showed nothing, as pivotkit-react did
  ([#735](https://github.com/eizedev/pivotkit/issues/735)).

## [0.10.0] - 2026-11-24

### Changed

- Bundles pivotkit-core 0.10.0, pivotkit-react 0.10.0 and pivotkit-report 0.6.0.
- **Breaking:** the theme token `--pk-knob` and the label `settingsShort` are gone, as in
  pivotkit-react. A page that sets either removes it; see
  [Upgrading](https://pivotkit.eize.dev/getting-started/upgrading/).
- The README, the package's page on npm, no longer carries a paragraph on what dates say. It said
  nothing about the web component, and the docs describe dates.
- The first load grows with pivotkit-core's and pivotkit-react's fixes of this release: 182.3 KiB
  gzip on an official Node 24 build, in 13 files instead of 12. Its budget goes to 182.5 KiB, the
  import group's to 23.2 KiB, the unused group's to 6.5 KiB and the report group's to 24.5 KiB
  ([#782](https://github.com/eizedev/pivotkit/pull/782), [#786](https://github.com/eizedev/pivotkit/pull/786),
  [#796](https://github.com/eizedev/pivotkit/pull/796)).

### Fixed

- The package root exports the types of every event detail and property: `TipDismiss`, `DataLoad`,
  `SourceEntry`, `SourceSwitch`, `ReaderPlugin` and `ColumnarData` came only from
  `pivotkit-element/element`.
- Headers that wrap between words only, one note above the result at a time on a phone and a
  clearer tip on an empty report. See pivotkit-react's changelog.
- The chart's point menu without a tooltip over it, the fade of a cut-off menu and the euro listed
  once in Number format. See pivotkit-react's changelog.
- The buttons beside the tabs Table and Chart are no longer cut off. See pivotkit-react's changelog
  ([#706](https://github.com/eizedev/pivotkit/issues/706)).
- The filter's **Only**, the Filter level's wording, the number formats and the Publish icon of
  My views. See pivotkit-react's changelog.
- The menus count with the host's `limits`, a part that failed to load loads again on the next try,
  an error note stays until someone closes it, the report ignores a too long view kept for the tab,
  the zone's flash and the empty report's chips follow `--pk-duration`, the report reads
  `chartOptions` without calling a getter, a `fileName` such as `aux.data` is safe on Windows,
  type-ahead uses the menu's language, and the settings button shows its icon only on a phone. See
  pivotkit-react's changelog.

## [0.9.0] - 2026-11-22

### Added

- A menu at a clicked point of the chart, to show its rows or filter by it. See pivotkit-react's
  changelog ([#53](https://github.com/eizedev/pivotkit/issues/53)). `pivot-cell-click` for a chart
  point comes at **Show the rows** or a double click.
- A name of the report's own for a field. See pivotkit-react's changelog
  ([#158](https://github.com/eizedev/pivotkit/issues/158)).
- The table and the chart side by side on a wide report. See pivotkit-react's changelog
  ([#51](https://github.com/eizedev/pivotkit/issues/51)).
- A date in Filters can be grouped from its chip's menu. See pivotkit-react's changelog
  ([#100](https://github.com/eizedev/pivotkit/issues/100)).
- A tip on stacked bars of a value that does not add up. See pivotkit-react's changelog
  ([#536](https://github.com/eizedev/pivotkit/issues/536)).
- Colour scales to pick in the value menu. See pivotkit-react's changelog
  ([#95](https://github.com/eizedev/pivotkit/issues/95)).
- Sort by one column with a click on its name. See pivotkit-react's changelog
  ([#70](https://github.com/eizedev/pivotkit/issues/70)).
- Bars and lines, and a treemap, from pivotkit-react. ECharts' treemap loads with the chart: the
  chart group's budget goes to 259.5 KiB. The first load does not grow
  ([chart types](https://pivotkit.eize.dev/use/charts/#chart-types), [#518](https://github.com/eizedev/pivotkit/issues/518)).
- The warning above the result names a field that a view names twice, and two fields of one name.
  See pivotkit-react's changelog ([#699](https://github.com/eizedev/pivotkit/issues/699)).
- High and low points on a chart, from pivotkit-react. ECharts' markPoint loads with the chart,
  inside the chart group's budget of 259.5 KiB. The German menu texts' budget goes to 8.5 KiB
  ([high and low points](https://pivotkit.eize.dev/use/charts/#high-and-low-points), [#574](https://github.com/eizedev/pivotkit/issues/574)).

### Changed

- Bundles pivotkit-core 0.9.0, pivotkit-react 0.9.0 and pivotkit-report 0.5.0.
- Plainer words in the filter and "Filter by …" on the buttons that add a rule. See
  pivotkit-react's changelog ([#595](https://github.com/eizedev/pivotkit/issues/595),
  [#177](https://github.com/eizedev/pivotkit/issues/177)).
- On a touch screen every button takes a finger, at least 44 x 44 px. See pivotkit-react's
  changelog ([#72](https://github.com/eizedev/pivotkit/issues/72)).
- The first load is about 6 KiB smaller (gzip). Three parts load later
  ([#546](https://github.com/eizedev/pivotkit/issues/546)):
    - The German texts of the first render load before a German report renders. Until then the
      report shows its skeleton without a word. It never shows English first. A report that changes
      its language keeps its texts until the new ones are there. After 4 seconds without them, the
      report shows in English.
    - The tips' table loads right after the first render. A tip shows a moment later. The notices
      that the result is cut or empty stay in the first load.
    - The style rules only the menus use load with the menus.
- A German report pays for this: its texts are one more request before the first render. Measured
  in Chromium with 1.6 Mbit/s, 150 ms latency and the processor slowed down 4 times, median of 11
  cold loads: a German report rendered about 0.18 s later, an English one about 0.03 s sooner.
  Without throttling both stayed within a few milliseconds.
- Every boolean attribute reads `"false"`, in any case and with spaces around it, as off.
  `save-templates`, `can-publish`, `allow-import` and `loading` were on with any value, `"false"`
  included ([#548](https://github.com/eizedev/pivotkit/issues/548)).

### Fixed

- Bundles pivotkit-react's fix of **Show the rows** in the menu at a chart point
  ([#705](https://github.com/eizedev/pivotkit/issues/705)). The element does not change: it always
  sends `pivot-cell-click`, so the entry always does something.

## [0.8.2] - 2026-11-19

### Fixed

- Bundles pivotkit-react 0.8.2. The arrow keys in a long table no longer leave the focus one cell
  behind. See pivotkit-react's changelog ([#416](https://github.com/eizedev/pivotkit/issues/416)).

## [0.8.1] - 2026-11-18

### Added

- Theme tokens for the tabs, icon buttons, button frames and primary buttons. Set on
  `<pivot-report>`, they reach these parts inside the shadow root. See pivotkit-react's changelog
  ([#604](https://github.com/eizedev/pivotkit/issues/604)).

### Changed

- Bundles pivotkit-react 0.8.1.
- The four zones form an even 2×2 grid with equal halves, and one column on a narrow report. Each
  zone has a frame (`--pk-zone-border`). See pivotkit-react's changelog
  ([#605](https://github.com/eizedev/pivotkit/issues/605)).

## [0.8.0] - 2026-11-18

### Upgrading from 0.7

- Table and Chart are tabs on top of the result, with "Table settings" or "Chart settings" beside
  them. The chart type button, Options and Layout left the toolbar. More is always at its end, with
  Help first. The zones fold under the heading "Fields in the report", and Swap rows and columns sits
  at the end of that row. The labels `layout`, `showLayout`, `options` and `chartDisplay` are no longer
  shown, and the test ids `chart-type`, `options` and `layout` are gone
  ([#580](https://github.com/eizedev/pivotkit/issues/580),
  [upgrading](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L511)).
- The chart type menu lists the types, then a row per Display topic that opens a level: Value
  labels, Legend, Title, Axis, Tooltip, Series and Layout ([#106](https://github.com/eizedev/pivotkit/issues/106)). Tests open the
  level first; a choice is a menu item with `aria-checked`.
- Bars, lines and areas with more than 20 categories get a zoom slider. Display › Axis › Zoom slider
  › Off draws every category as before. A click on the legend changes the view, so Undo takes it
  back ([upgrading](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L471)).
- Without `export-data`, the default, the drill-down panel has no Export menu: no copy and no
  download of its rows. Set `drill-down-export` to keep it
  ([upgrading](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L669)).
- The row count under the result says "2,190 of 4,386 rows" when a filter leaves rows out. A page
  whose `labels` set `rowsCount` or add a language sets the new label `rowsFiltered` too
  ([upgrading](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L679)).

### Added

- "+ Add" in each zone opens "Add to Rows" (or the zone's name): every field with its type and the
  field list's search. A field placed elsewhere shows its zone and moves. A pick that would change
  nothing is disabled with its reason. Values takes a field again, and Filters opens the field's
  filter first. The focus goes to the new chip, and a status region says what happened. Test ids:
  `add-field-<zone>`, `add-pick-<field>`, `zones-status`. New labels: `addField`, `addFieldTo`,
  `movedFrom`; the menu adds `addAlready`, `addMoves` and `addSecond`
  ([#581](https://github.com/eizedev/pivotkit/issues/581)).
- The `zones` attribute (`"open"` or `"folded"`) sets whether the zones start open or folded. Without it,
  the report's height decides ([#580](https://github.com/eizedev/pivotkit/issues/580)).
- Chart settings › Layout folds the groups of Rows in the words of the fields: "Show each Country",
  "Show Region only". Table settings' Collapse all says what it keeps
  ([#580](https://github.com/eizedev/pivotkit/issues/580)).
- Theme tokens for the zones' section (`--pk-section-*`) and the tab shown (`--pk-tab-mark`)
  ([#580](https://github.com/eizedev/pivotkit/issues/580)).
- The data's date range before filters ("Data before filters: …"): in the footer next to the row count, and in a date
  field's "i". The title of a cyclic grouping such as "Month of year" in the table and the chart
  says which years it combines: "Date by month of year · 2023–2025 combined". With one year left,
  month and quarter items carry it ("Jan 2025"); weekday, hour and week say "· 2025 only" in the
  title. Exports keep the plain items and names.
  Group lists the data's range first and shows hints from the data, under "One item per period"
  and "Same period, years combined" ([#109](https://github.com/eizedev/pivotkit/issues/109)).
- The chart's zoom slider, by mouse, touch and keyboard, the legend that hides and shows series in
  the view, and 100 % stacked bars and areas ([#36](https://github.com/eizedev/pivotkit/issues/36)), ([#575](https://github.com/eizedev/pivotkit/issues/575)).
- The `colorMap` property: a fixed colour per series or slice name. Export → Copy chart image, the
  `pivot-export` kind `"copy-chart"`, colours in Display › Series and the share in Display › Tooltip ([#54](https://github.com/eizedev/pivotkit/issues/54)).
- Reference lines in the chart: Display › **Reference lines** with **Average**, **Trend** and a
  **Target** ([#48](https://github.com/eizedev/pivotkit/issues/48)). ECharts' markLine component
  draws them: about 6 KiB gzip more in the chart's chunk.
- `drill-down-export` (boolean attribute) and the `drillDownExport` property: the drill-down panel's
  copy and download while `export-data` is off. As pivotkit-react's `drillDownExport`.

### Changed

- The open zones are shelves: each zone's title, "i" and "+ Add" at its left, its chips beside them.
  Shelves sit side by side while they fit and take a line of their own when they need it. The dashed
  drop outline shows only while something is dragged. On a phone, "+ Add" sits at the right end of
  the shelf's title row. A report with no field placed starts with its zones open, whatever its
  height, unless `zones` says otherwise. The empty report's steps and the empty zones' hints name
  "+ Add" too. A value that is in the view twice is "Sum of Revenue (2)" on its chip and in the
  table. New tokens: `--pk-shelf-gap`, `--pk-shelf-pad`,
  `--pk-shelf-min`, `--pk-chip-gap`, `--pk-chip-h`, `--pk-add-gap`, `--pk-add-hover`
  ([#581](https://github.com/eizedev/pivotkit/issues/581)).
- The chart's tooltip names the element under the pointer, with a stack's total. Display →
  **Tooltip**, **All series** lists every series at the category
  ([#376](https://github.com/eizedev/pivotkit/issues/376), [#106](https://github.com/eizedev/pivotkit/issues/106)).

- The drill-down panel's copy and download follow `export-data`. Without it, the panel shows the
  rows but offers no copy and no download ([#263](https://github.com/eizedev/pivotkit/issues/263)).
- The first load is about 1.7 KiB smaller: pivotkit-core's ECharts option loads with the chart
  ([#546](https://github.com/eizedev/pivotkit/issues/546)).
- The first load grows by about 0.5 KiB gzip: the table measures whether its row labels fit before
  the first paint ([#584](https://github.com/eizedev/pivotkit/issues/584)). With the other changes of this release, the first-load budget is 181 KiB ([#546](https://github.com/eizedev/pivotkit/issues/546)).
- `npm run size` names the zlib it measures with. It says when the sizes can differ from CI's, as
  with a Node that uses the system's zlib ([#546](https://github.com/eizedev/pivotkit/issues/546)).
- The row count under the result says how many of the data's rows the filters keep, as
  pivotkit-react's ([#108](https://github.com/eizedev/pivotkit/issues/108)).

### Fixed

- On a touch screen, a menu's rows and its Back row are at least 44 px high. The chart's tooltip
  names the element under the pointer after a redraw too. Both as in pivotkit-react
  ([#582](https://github.com/eizedev/pivotkit/issues/582), [#576](https://github.com/eizedev/pivotkit/issues/576)).
- The chart on a touch screen, a heatmap's colours in a form such as `oklch()` and the tooltip of a
  pie or heatmap with a field on Columns, as pivotkit-react's ([#538](https://github.com/eizedev/pivotkit/issues/538),
  [#386](https://github.com/eizedev/pivotkit/issues/386), [#537](https://github.com/eizedev/pivotkit/issues/537)).
- A view's locale or a `locale` attribute that the browser has no data for, such as `xx-XX`, no
  longer takes the machine's locale, as in pivotkit-react ([#552](https://github.com/eizedev/pivotkit/issues/552)).
- Export → Source data is off while the data have no rows, and a relative date filter names no day
  from today on as having no data while the data have no date after today, as in pivotkit-react ([#585](https://github.com/eizedev/pivotkit/issues/585), [#586](https://github.com/eizedev/pivotkit/issues/586)).
- The element bundles pivotkit-core's chart labels at small sizes: slanted category names leave the
  plot its height, a donut's outside labels stay whole, the value at the end of a horizontal bar is
  not cut, and a heatmap names every row that has room ([#228](https://github.com/eizedev/pivotkit/issues/228), [#229](https://github.com/eizedev/pivotkit/issues/229),
  [#230](https://github.com/eizedev/pivotkit/issues/230), [#231](https://github.com/eizedev/pivotkit/issues/231)).
- The zones fold when they no longer fit the element's box, also when the box keeps its size, as
  pivotkit-react's ([#93](https://github.com/eizedev/pivotkit/issues/93)).

## [0.7.0] - 2026-11-16

### Upgrading from 0.6

What a page checks; the [upgrade page](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L803) has the details.

- Export → HTML report carries the dark colours set on the element. On a dark screen a colour
  scale's middle colour (`--pk-scale-mid`) is the one the dark theme sets, not the light one
  ([upgrading](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L1280)).
- A field's Filter level shows its rules in a single column as wide as the menu, in every browser.
  Tests or screenshots of that form take the new layout.

### Changed

- Bundles pivotkit-core 0.7.0, pivotkit-react 0.7.0 and pivotkit-report 0.3.0.

### Fixed

- The element bundles pivotkit-react's fix of a field's Filter level: its rules show in the WebKit
  of Playwright 1.65 (build 2388), in a single column as wide as the menu, in every browser
  ([#474](https://github.com/eizedev/pivotkit/issues/474)).
- The element bundles pivotkit-react's Export → HTML report with the dark colours set on the element
  (`pivot-report[data-pk-theme="dark"]`), for a reader on a dark screen
  ([#385](https://github.com/eizedev/pivotkit/issues/385)).
- The element bundles pivotkit-react's fix of Print or save as PDF: the print dialog opens in the
  click itself, also on a hidden page ([#210](https://github.com/eizedev/pivotkit/issues/210)).
- The element bundles pivotkit-react's fix of a menu's button in Safari and other WebKit browsers: a
  second click on it closes the menu ([#393](https://github.com/eizedev/pivotkit/issues/393)).

## [0.6.1] - 2026-11-14

### Added

- `export-data` takes a JSON object for some columns only (`export-data='{"columns":["Region","Revenue"]}'`,
  or the `exportData` property as an object), as pivotkit-react's `exportData`: Source data and the
  drill-down's copies and files hold those columns. Text it cannot read is off and said once in the
  console ([#259](https://github.com/eizedev/pivotkit/issues/259)).
- `importWorkerUrl` (a property, no attribute): where an app serves the import worker of
  `allow-import` (`dist/import-worker.js`), relative to the page, for an app that bundles the element
  under a base href such as `/reports/`. Without it the worker is next to the element's own code
  ([#194](https://github.com/eizedev/pivotkit/issues/194)).

### Changed

- The first load grows by about 0.3 KiB gzip with pivotkit-react's dates before year 1 and after
  9999 in the filter's texts (173.9 KiB measured on a Mac with `importWorkerUrl`, CI about 0.6
  more), within its budget of 175 ([#349](https://github.com/eizedev/pivotkit/issues/349)).
- The import group grows by about 0.4 KiB gzip with pivotkit-core's check of a plugin's table
  (21.5 KiB measured on a Mac with the other changes of this release, CI about 0.2 more); its budget
  to 22 ([#130](https://github.com/eizedev/pivotkit/issues/130)).

### Fixed

- The element bundles pivotkit-react's fix of an open menu that moved when its own content was
  scrolled, so a click could land beside the control aimed at
  ([#222](https://github.com/eizedev/pivotkit/issues/222)).
- The element bundles pivotkit-react's fix of a saved view that reads another sheet of the loaded
  workbook: a sheet the reader has notes on shows them in the preview before it is loaded
  ([#274](https://github.com/eizedev/pivotkit/issues/274)).

## [0.6.0] - 2026-11-14

### Upgrading from 0.5

What a page checks; the [upgrade page](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L1490) has the details.

- Export → **CSV file (.csv)** is called **Table as CSV (.csv)**; the `pivot-export` kind `"csv"`
  stays. Tests or screenshots that look for the old text take the new one.
- `export-data` (Export → Source data) is new and off by default.

### Added

- `pivot-template-save` and `pivot-template-publish` carry `source` in `detail`: the data shown, with
  a loaded workbook's sheet in `params.sheet`; Publish of a view file or of a view of the browser
  store made for other data gives that data ([#252](https://github.com/eizedev/pivotkit/issues/252)).
- `export-data` (boolean attribute) and the `exportData` property: pivotkit-react's Export → Source
  data, every row of the data as a CSV or JSON file; `pivot-export` kinds `"data-csv"`, `"data-json"`.
  Off by default.

### Changed

- Export → **CSV file (.csv)** is called **Table as CSV (.csv)**, as in pivotkit-react.
- Bundles pivotkit-core 0.6.0, pivotkit-react 0.6.0 and pivotkit-report 0.2.0.

### Fixed

- The element bundles pivotkit-react's fix of views made on a workbook's sheet other than the first:
  they open on that sheet again after the workbook is loaded anew ([#252](https://github.com/eizedev/pivotkit/issues/252)).
- The element bundles pivotkit-react's fix of a rule on the name whose text is emptied: the rule
  stops filtering ([#159](https://github.com/eizedev/pivotkit/issues/159)).

## [0.5.0] - 2026-11-13

### Upgrading from 0.4

What a host checks; the [upgrade page](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L1554) has the details.

- **Breaking:** views, view files and links are written in format version 2; pivotkit 0.4 refuses
  them as newer. Version 1 loads with the same result.
- **Breaking:** dark colours of a host go on `pivot-report[data-pk-theme="dark"]`, not on an attribute
  of the page (`html[data-theme="dark"] pivot-report`): the Excel export and the HTML report read the light
  theme by showing it on the report for a moment, and a rule on the page's attribute would put the
  dark colours into the file.
- The colour scale's default is blue; red, yellow, green come back with `--pk-scale-low: #f8696b`,
  `--pk-scale-mid: #ffeb84`, `--pk-scale-high: #63be7b` on the element (dark: `#c2413f`, `#b39a2e`,
  `#3f9a5c`). `--pk-scale-mid` is no longer set.
- The label key `filter` is removed (a host's text for it is ignored).
- The font weights 550 and 650 are 600 (`--pk-weight-strong`).
- The chart's text is 14 px, not 12 px.
- Column subtotals are off by default: a start view or template without `totals.colSubtotals` adds
  `totals: { colSubtotals: true }` to keep them.

### Changed

- npm keywords `angular` (the Angular example) and `excel-export`.
- `dist/THIRD_PARTY_LICENSES.txt` is written by the repository's shared licence script, as for
  pivotkit-xlsx; its text is unchanged ([#125](https://github.com/eizedev/pivotkit/issues/125)).
- The element bundles pivotkit-core's and pivotkit-react's totals ([#155](https://github.com/eizedev/pivotkit/issues/155), [#156](https://github.com/eizedev/pivotkit/issues/156)): column subtotals
  off by default, no empty column or total rows without values, no subtotal for a group of one item,
  the tip on column subtotals. Size budgets ([#198](https://github.com/eizedev/pivotkit/issues/198)): the first load to 170.5 KiB (168.6 measured on
  a Mac, CI about 0.5 more), the link to 7.5 (7.2 measured, 0.1 below its old budget).
- npm keywords `pivot-grid` and `pivottable`, the terms people search for ([#172](https://github.com/eizedev/pivotkit/issues/172)).
- The element bundles pivotkit-core with view version 2 and pivotkit-react's filters for it
  ([#165](https://github.com/eizedev/pivotkit/issues/165)): views of version 1 load with the same
  result. The first load grows by about 7.5 KiB (gzip), its budget to 169; the plain words of a
  view's unused parts to 5.5.

### Added

- pivotkit-react's `--pk-chart-text-size` (the chart's text, at least 14 px) and the HTML report's
  font size tokens (`--pk-report-title-size`, `--pk-print-size`, `--pk-print-small`), set on the
  element like every `--pk-*` token ([#220](https://github.com/eizedev/pivotkit/issues/220), [#221](https://github.com/eizedev/pivotkit/issues/221)). The first load grows by
  about 0.1 KiB gzip (171.9 KiB measured on a Mac, CI 172.5), its budget to 173.
- pivotkit-react's tokens for corners, the code font, the focus ring and the chart's title and marks
  ([#216](https://github.com/eizedev/pivotkit/issues/216)): `--pk-radius-xs`, `--pk-radius-mark`, `--pk-radius-icon`, `--pk-radius-card`,
  `--pk-radius-chart`, `--pk-font-mono`, `--pk-chart-title-size`, `--pk-focus-width`,
  `--pk-focus-offset`, `--pk-glow-width` and `--pk-ring-width`, set on the element like every `--pk-*`
  token. The first load grows by about 0.5 KiB gzip (171.4 KiB measured on a Mac, CI about 0.6
  more), its budget to 172.5.
- pivotkit-react's font weight tokens ([#201](https://github.com/eizedev/pivotkit/issues/201)): `--pk-weight-normal`, `--pk-weight-medium`,
  `--pk-weight-strong` and `--pk-weight-bold`, set on the element like every `--pk-*` token.
- Export → HTML report, Chart image (.svg) and Print or save as PDF (pivotkit-react), loaded as the
  chunk group "report" on first use (19.9 KiB gzip); `pivot-export` has the kinds `html`, `svg` and
  `print` ([#165](https://github.com/eizedev/pivotkit/issues/165)). ECharts' SVG renderer comes with
  the chart chunks (215.8 KiB, budget 222.5) and pivotkit-core's describe module with the first load
  (170.0 KiB, budget 171.5): esbuild puts a module where any importer of its barrel loads it.
- The property `importLimits` ([#169](https://github.com/eizedev/pivotkit/issues/169)), as
  pivotkit-react's prop: the limits of a file loaded with `allow-import`, merged key by key over
  `limits`; the page's data keeps `limits`. A property only, as `limits`.

### Fixed

- The element bundles pivotkit-core's and pivotkit-report's export fixes: CSV, XLSX, the HTML report
  and the SVG leave out bidi controls, a print template's `<meta http-equiv>` takes no placeholder,
  and a token value with a line break or `url(` is left out. The group "report" grows to 21.0 KiB
  gzip (CI 21.1), its budget to 21.5.
- A workbook and an HTML report exported while the element shows the dark theme carry the tokens set
  on the element for the light theme, `--pk-scale-mid` too ([#217](https://github.com/eizedev/pivotkit/issues/217)).
- The element bundles pivotkit-react's fixes: the Excel export in the report's theme colours, the
  default colour scale from light to strong blue, a group's label at the top of its rows in the
  workbook ([#212](https://github.com/eizedev/pivotkit/issues/212)), and an "i" inside a menu explained above the menu ([#213](https://github.com/eizedev/pivotkit/issues/213)).
- The element bundles pivotkit-react's fix of a hover description that closed while the pointer
  paused between its "i" and it ([#213](https://github.com/eizedev/pivotkit/issues/213)).
- An app whose bundler reads `sideEffects` (Angular's build) no longer warns about, or may drop,
  the chunks `dist/index.js` imports for their effects: `sideEffects` lists `dist/chunks/*.js` too
  ([#174](https://github.com/eizedev/pivotkit/issues/174)).
- An app that bundles the element (Angular's build) had no `import-worker.js`, so with
  `allow-import` the element read files on the page and Firefox and WebKit logged the failed worker.
  The docs and the Angular example copy `dist/import-worker.js` as an asset (`angular.json`), and the
  example's test reads a CSV file in the worker ([#182](https://github.com/eizedev/pivotkit/issues/182)).

## [0.4.0] - 2026-11-11

### Added

- Loading data in the browser ([#44](https://github.com/eizedev/pivotkit/issues/44)): the attribute
  `allow-import` (property `allowImport`) with pivotkit-react's Data menu, drop onto the report and
  preview; the property `plugins` for reader plugins (pivotkit-xlsx is not bundled: a page adds its
  `dist/` as a plugin); the cancelable event `pivot-data-load` for every change of the data shown.
  CSV and JSON files are read in the element's own worker, `dist/import-worker.js` (a file of the
  page's origin, so a strict CSP with `script-src 'self'` allows it; where it cannot start, the
  element reads on the page). The import UI is the load group "import" (19.9 KiB gzip), loaded on its
  first use.
- An element with `storage-key` taken out of the page and put back
  ([#131](https://github.com/eizedev/pivotkit/issues/131)) shows the loaded file again with its view
  and its undo steps (in the page's memory only); `pivot-data-load` says so with `cause` "restore".
- `data` takes columnar data (`{ columns, types, data }`).
- pivotkit-react's identifier fields ([#113](https://github.com/eizedev/pivotkit/issues/113)): a number field named ID, …Id, …_id, Nr, No, Number
  or Key with whole numbers, without `agg`, `format` or `drillFormat` in `fieldDefaults`, is counted
  in Values and shown as it is in the drill-down.
- The token `--pk-layer-z`, set on the element like every `--pk-*` token ([#111](https://github.com/eizedev/pivotkit/issues/111)). No new
  attribute or event.
- What of the page's `view` or `defaultView` the data cannot use shows above the result ([#83](https://github.com/eizedev/pivotkit/issues/83)).

### Changed

- The first load grows from 157.5 to 160.4 KiB gzip (the Data button, the drop handler and the rules
  of the import UI, and two more files esbuild splits off); its budget is 161.5.
- pivotkit-react's **Start over** menu in the toolbar (Reset and New, empty report, each with what it
  does or why it is off) replaces the Reset button; the Views menu holds This view, Shared views, My
  views and Share this view (with "Open view file…", formerly "Load view…"), New moved to Start over;
  every menu's groups have bold titles and a rule between them
  ([#88](https://github.com/eizedev/pivotkit/issues/88), [#105](https://github.com/eizedev/pivotkit/issues/105)). The test id `reset` is Reset's entry in Start over's menu now.
  No new attribute or event.

### Fixed

- A loaded file shown again lost its view when the element was taken out and put back twice in a row
  while its view is controlled (pivotkit-react's fix,
  [#135](https://github.com/eizedev/pivotkit/issues/135)).
- Toolbar buttons move into More only when the room left cannot hold them, measured with the texts
  of the element's language ([#88](https://github.com/eizedev/pivotkit/issues/88)).
- Menus, bottom sheets and popups open in the browser's top layer, still inside the shadow root:
  above a page's fixed navigation whatever its z-index ([#111](https://github.com/eizedev/pivotkit/issues/111)).
- pivotkit-react's fixes of one scroll container for a large table ([#112](https://github.com/eizedev/pivotkit/issues/112)), a row label column
  that keeps its width while it scrolls ([#110](https://github.com/eizedev/pivotkit/issues/110)), field names that break between words only
  ([#114](https://github.com/eizedev/pivotkit/issues/114)), form fields with names of their own element ([#115](https://github.com/eizedev/pivotkit/issues/115)) and the unused-parts warning
  that follows changes by hand ([#82](https://github.com/eizedev/pivotkit/issues/82)).

## [0.3.0] - 2026-11-09

### Added

- pivotkit-react's rebuilt Filter level: the summary card, quick choices only where the data reach,
  the reference date (today or the latest record, pivotkit-core's `anchor` of a `relative` filter),
  Years combined for a grouping that repeats every year, the items a rule leaves out in a folded
  tail, rules with an "i" and a result line, a searchable item picker. The new tokens
  `--pk-danger-soft` and `--pk-warn` can be set on the element like every `--pk-*` token. No new
  attribute or event.
- pivotkit-react's filter rules ([#89](https://github.com/eizedev/pivotkit/issues/89),
  [#90](https://github.com/eizedev/pivotkit/issues/90)): quick choices for dates (This year, Last N
  years or months), rules on the item itself, its total and its name, the same Filter level for a
  field in Filters, and pivotkit-core's `compare` and `relative` filters.

### Changed

- Size budgets for the rebuilt Filter level: the first load 155 KiB (153.7 measured on a Mac; the
  core's anchor and source-day comparison, and the chips' words for the data's share of a range),
  the menus 41 KiB (39.1 measured), their German texts 6.8 KiB (6.2 measured).
- Size budgets: the first load 153 KiB (151.8 measured on a Mac; the core's new filters and the
  chips' words for them, the touch hit areas of the field list), the menus 33.5 KiB (31.7 measured), their German texts 5.5 KiB, the texts
  of a view's unused parts 5 KiB.
- pivotkit-react's chip menus, Options and Views are in levels, and no menu folds any more (Reset
  menu sections is gone; stored folds are dropped): a first level that says what each topic
  holds, a level of its own per topic with **‹ Back**, every choice applied at once, a search over all
  levels of a chip's menu; ARIA menus with one Tab stop, the arrow keys and type-ahead. The label
  changes are pivotkit-react's (some menu labels new, `valueOps` and `groupCyclic` reworded,
  `chooseValues`, `valueFilter`, `change`, `removeSetting`, `topStart`, `binsStart`, `filterIs`,
  `groupBy`, `resetSections` and `resetSectionsDone` gone); the new token `--pk-input-border` can be set on the element like every `--pk-*`
  token. No new attribute or event. Size: the menus 28.5 KiB measured (budget 30), their German texts
  4.8 (budget 5.3), the first load 149.4 (budget 151, for the levels' rules in the stylesheet).

### Fixed

- pivotkit-react's chips and fields are no longer dragged by a press inside the menu they opened
  (selecting text, a native select, a click that moves a little), which moved the field to another
  zone and lost its filters.
- pivotkit-react's field list on a touch screen keeps its desktop rows, with 44 px high hit areas
  for a field's grip, "i" and menu.
- pivotkit-react's Highlight keeps a value's own colours (a checked Colour scale changes nothing;
  None or Data bars and back bring them back).
- pivotkit-react's popovers appear at their final size and place
  ([#91](https://github.com/eizedev/pivotkit/issues/91)).
- With reduced motion pivotkit-react's menus take the focus when they open
  ([#78](https://github.com/eizedev/pivotkit/issues/78)).
- German texts quote with German quotation marks (pivotkit-react's new label `quote`)
  ([#79](https://github.com/eizedev/pivotkit/issues/79)).
- The empty report's first steps are no longer cut off in a low report: pivotkit-react's result area
  scrolls what is taller than it.

## [0.2.0] - 2026-11-08

### Added

- pivotkit-react's warning for a view's unused parts, in plain words
  ([#56](https://github.com/eizedev/pivotkit/issues/56)): its words are a chunk of their own (the
  load group "unused", 4.2 KiB measured, budget 4.7), loaded only when a view has such parts; the
  first load holds the warning's frame and pivotkit-core's issue codes (149.4 KiB measured, budget
  raised from 149 to 150). Label changes as in pivotkit-react: `unusedParts`, `unusedPath`, `unusedMore` and `unusedFewer` new,
  `issues`, `viewMissingFields`, `viewOtherIssue` and `viewOtherIssues` gone, `labels.unused` for the
  lines. No new attribute or event.
- pivotkit-react's sorting with a click on a table header
  ([#55](https://github.com/eizedev/pivotkit/issues/55)): a value's name sorts the innermost row
  field by it, a row field's name A to Z and Z to A; a `pivot-view-change` like the chip menu's sort.
  No new attribute or event.
- pivotkit-react's Save, Save as and New for views
  ([#60](https://github.com/eizedev/pivotkit/issues/60)): Save on a user's view sends
  `pivot-template-save` (with `save-templates`) or writes the browser store, Save on a shared view
  sends `pivot-template-publish` (with `can-publish` and after the user confirmed, else it is off
  with the reason), Save as onto a name that exists asks the user first. No new attribute or event.
- Host notes: `pivot-template-save` and `pivot-template-publish` come with a name that exists for
  Save and for Save as after the user confirmed: the page replaces the view of that name (an upsert
  by name), it does not add a second one.

### Changed

- pivotkit-react's field chip menu with each setting in one line and folded menu sections that say
  what they hold ([#57](https://github.com/eizedev/pivotkit/issues/57)); no new attribute or event.
  The menus' size budget is 20 KiB (19.3 measured).

- What runs only after a click left the first load
  ([#73](https://github.com/eizedev/pivotkit/issues/73)): the menus' view changes, sharing's copy,
  download and load, the drill-down's table and the texts only they show load with the menus, the
  chart's label layout with the chart. The first load is 147.8 KiB gzip (152.2 before, measured on one
  Mac), the menus 22.8, their German texts 4.4. Every size budget of a loaded chunk is now 3 to 5 % above what CI
  measures, the first load's about 1 KiB: initial 149, chart 211, export 11.5, link 7.3, menus 24, texts 4.9. No new attribute
  or event.

- pivotkit-react's menu texts in German are a chunk of their own, loaded with the menus only for a
  German report or when `locale` changes to German, and the menus' sections moved out of the first
  load ([#73](https://github.com/eizedev/pivotkit/issues/73)): the menus 20.6 to 17.9 KiB gzip, the
  first load 152.1 to 152.2 with the loading of the texts and English standing in when they fail
  (measured on one Mac); a German page loads the texts' 4.0 KiB on top. The
  size check has a group "texts" for it (budget 4.5 KiB).

- The README, the package's page on npm, is a short landing page: what pivotkit-element is, one screenshot,
  install, one example and a table of links into the
  [documentation site](https://pivotkit.eize.dev/), which holds the details.
- pivotkit-react's toolbar: Views is the last button to move into "More", so it stays in the toolbar
  from about 1280 px (the chart type moves into "More" before it); New is in the Views menu only.
  Every save closes the Views menu; the question before a view is replaced has the focus on Cancel;
  the view loaded has a check mark in its group, and More the dot for unsaved changes while Views
  is in it.

### Fixed

- No `pivot-export` for an empty report: its Export entries are off with "Add a field first."
  ([#61](https://github.com/eizedev/pivotkit/issues/61)).

## [0.1.0] - 2026-11-07

First release.

### Added

- The attribute `field-list` (`"open"`, `"collapsed"`): the field list collapsed to a rail, as
  pivotkit-react's `fieldList`.
- Templates as pivotkit-react's: `templates` entries with `scope` and `file`, the attributes
  `template-store` (`"browser"`: "My views" in localStorage, no event for its saves and deletes) and
  `can-publish`, the event `pivot-template-publish` (`{ name, view, respondWith }`), and `scope` in
  the details of `pivot-template-save` and `pivot-template-delete`.
- `pivot-export` also for every copy and the drill-down's exports: kinds `copy-table`, `copy-json`,
  `drill-copy`, `drill-json`, `drill-csv`, `drill-xlsx`; a copy has `text`, a drill-down export
  `rows: { shown, count }`; `preventDefault()` keeps a copy from the clipboard as it keeps a file
  from the download. The Export menu loads with the menus (first load 151.0 KiB measured, budget 152
  unchanged); the menus' budget is 17.5 KiB (16.4 measured), the export's 11.5 (10.6 with the rows
  export, TSV and JSON); the size check follows the chunks a chunk loads (the export is loaded from
  the menus).
- Attributes `share-link`, `persist-view`, `loading`, `field-info` and `zone-info`, and the property
  `chartOptions`, as pivotkit-react's props; `pivot-export` also for a downloaded view (`kind`
  `"json"`). pivotkit-core's link module is a chunk of its own, loaded on the first link; the size
  budget of the first load is 152 KiB (150.7 measured with the chart display settings, sharing, the
  skeleton, the menu changes, the value conditions and locale number entry).
- Attributes `tips` ("on", "off" or a comma-separated list of tip ids) and `storage-key`, the property
  `dismissedTips` and the event `pivot-tip-dismiss` (`{ id, dismissed }`), as pivotkit-react's tips
  props; `fieldDefaults` takes `label`, `description`, `href` and `type`.
- The attribute `grow` (pivotkit-react's `grow`: past the height or inside it).
- The menus' texts load with the menus (pivotkit-react's `menu-labels.js`): the first load stays
  within its 152 KiB budget (151.0 measured with the automatic chart type, the field list's keys, the
  touch targets and the settings' explanations loaded with the menus); the menus' budget is 15 KiB
  (13.8 measured).
- The attribute `schema-url` (pivotkit-react's `schemaUrl`: the `$schema` of the view files; `""` for none).
- Attributes `setting-info` (the "i" next to the settings, as pivotkit-react's `settingInfo`),
  `source-id` and `source-name` (the data shown, for the shared view files and the check before a
  view for other data loads), the property `sources` and the event `pivot-source-switch`
  (`{ source, view, name }`: "Switch to … and load"). Full screen works on the report inside the
  shadow root.

- `<pivot-report>`: pivotkit-react's `<PivotReport>` as a custom element in an open shadow root, with
  its own React 18.3.1, ReactDOM, pivotkit-react, pivotkit-core and @dnd-kit in the bundle; ECharts
  (bar, line, pie and heatmap only) and the XLSX/CSV export are chunks loaded on first use.
- Properties `data`, `dataKey`, `view`, `defaultView`, `templates`, `labels`, `fieldDefaults`, `limits`;
  reflected attributes `locale` (else the element's `lang`), `theme`, `height`, `time-zone`,
  `file-name`, `drill-down`, `drill-down-limit`, `save-templates`; JSON attributes `view` and
  `default-view`. Controlled and uncontrolled as in pivotkit-react; a different `defaultView` starts
  the report again on it, the view the report last reported does not. `height="100%"` fills the
  element.
- Events `pivot-view-change`, `pivot-cell-click`, `pivot-template-save` and `pivot-template-delete`
  (answered with `detail.respondWith(promise)`, a console warning when nothing answered), and
  `pivot-export` (cancelable: the page keeps the file); all bubble and are composed.
- Styles in the shadow root as one shared constructed stylesheet (a `<style>` element where there is
  none); the `--pk-*` tokens are declared on `:host`, so the page themes the element with rules on it
  and nothing else crosses; `data-pk-theme` on the element tells the theme shown.
- Lifecycle: properties set before the definition are taken over, a disconnected element unmounts its
  React root (a move in the same task keeps it), a reconnected one mounts again on its last view.
- `define(name)` for another tag name; loading the package twice does not throw and warns with both
  versions (`PivotReportElement.version`). Imports in Node without defining anything.
- Type declarations: the element, `PivotReportEventMap`, `HTMLElementTagNameMap` and the event map of
  the DOM; `pivotkit-element/jsx` declares the element in React's JSX.
- `dist/THIRD_PARTY_LICENSES.txt` with the license texts of the bundled packages; a size budget per
  load group (`npm run size`).
- `fieldDefaults[field].drillFormat` as in pivotkit-react: the format of a field's values in the
  drill-down.
- Attribute and property `label`: the name of the report's region landmark, one per report on a
  page.
- Everything of pivotkit-core and pivotkit-react 0.1.0 in the bundle, among it number ranges with
  "Starting at", custom sort orders (`fieldDefaults[field].order`, reversed too, also for saved views),
  unclickable empty cells with a text for screen readers, row labels that wrap on a phone and are
  shown whole in the status line of a long table, one header for a single value, year ranges without
  thousands separators, CSV percentages and calculations as the table shows them, heatmaps without
  grey empty cells.

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.11.0...HEAD
[0.11.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.10.0...pivotkit-element@0.11.0
[0.10.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.9.0...pivotkit-element@0.10.0
[0.9.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.8.2...pivotkit-element@0.9.0
[0.8.2]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.8.1...pivotkit-element@0.8.2
[0.8.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.8.0...pivotkit-element@0.8.1
[0.8.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.7.0...pivotkit-element@0.8.0
[0.7.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.6.1...pivotkit-element@0.7.0
[0.6.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.6.0...pivotkit-element@0.6.1
[0.6.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.5.0...pivotkit-element@0.6.0
[0.5.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.4.0...pivotkit-element@0.5.0
[0.4.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.3.0...pivotkit-element@0.4.0
[0.3.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.2.0...pivotkit-element@0.3.0
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.1.0...pivotkit-element@0.2.0
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-element@0.1.0
