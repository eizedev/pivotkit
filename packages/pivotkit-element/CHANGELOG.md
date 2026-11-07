# Changelog

All notable changes to `pivotkit-element` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-07

### Added

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

### Fixed

- The chart chunk takes the ECharts parts from pivotkit-react's `echarts.js` instead of a list of
  its own; it is one file of 200 KiB gzip (budget 221 KiB).
- pivotkit-react's fixes ship in the bundle: the report is a named region instead of a `<main>`,
  zones stack by their own width, a compact layout below 540 px of height, charts inside their box,
  formatted drill-down rows, plural forms, and a note for a template save the page rejects without a
  message. The first load is 124.4 KiB gzip.
- The chart's tooltip works under a strict Content-Security-Policy (`style-src 'self'`): pivotkit-react
  builds it without inline `style` attributes. The CSP browser test hovers the chart.
- `pivotkit-element/element` exports `EVENTS` too, as the README said: the same exports as the main
  entry.
- `engines` is gone: the package runs in the browser.
- pivotkit-core's limits for `computePivot()` and its lower defaults are in the bundle, with a
  message per limit in place of the result.

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-element@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-element@0.1.0
