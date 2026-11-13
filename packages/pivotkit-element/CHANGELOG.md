# Changelog

All notable changes to `pivotkit-element` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- npm keywords `pivot-grid` and `pivottable`, the terms people search for ([#172](https://github.com/eizedev/pivotkit/issues/172)).
- The element bundles pivotkit-core with view version 2 and pivotkit-react's filters for it
  ([#165](https://github.com/eizedev/pivotkit/issues/165)): views of version 1 load with the same
  result. The first load grows by about 7.5 KiB (gzip), its budget to 169; the plain words of a
  view's unused parts to 5.5.

### Added

- Export → HTML report, Chart image (.svg) and Print or save as PDF (pivotkit-react), loaded as the
  chunk group "report" on first use (19.9 KiB gzip); `pivot-export` has the kinds `html`, `svg` and
  `print` ([#165](https://github.com/eizedev/pivotkit/issues/165)). ECharts' SVG renderer comes with
  the chart chunks (215.8 KiB, budget 222.5) and pivotkit-core's describe module with the first load
  (170.0 KiB, budget 171.5): esbuild puts a module where any importer of its barrel loads it.
- The property `importLimits` ([#169](https://github.com/eizedev/pivotkit/issues/169)), as
  pivotkit-react's prop: the limits of a file loaded with `allow-import`, merged key by key over
  `limits`; the page's data keeps `limits`. A property only, as `limits`.

### Fixed

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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.4.0...HEAD
[0.4.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.3.0...pivotkit-element@0.4.0
[0.3.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.2.0...pivotkit-element@0.3.0
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.1.0...pivotkit-element@0.2.0
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-element@0.1.0
