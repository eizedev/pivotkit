# Changelog

All notable changes to `pivotkit-element` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-element@0.1.0
