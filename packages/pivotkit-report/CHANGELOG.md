# Changelog

All notable changes to `pivotkit-report` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First release.

### Added

- `WEIGHT_TOKENS`: pivotkit-react's font weight scale (`--pk-weight-normal`, `-medium`, `-strong`,
  `-bold`); the report's stylesheet and its chart take their weights from these tokens, so a host's
  `tokens` change them too ([#201](https://github.com/eizedev/pivotkit/issues/201)).
- `render(view, data, options)`: a view over rows, columnar or encoded data as JSON, CSV, XLSX, SVG or
  a printable HTML report, with the view's issues, `ok` and a summary; a bad view never throws, a
  limit or a refused template throws `PivotkitError` ([#165](https://github.com/eizedev/pivotkit/issues/165)).
- The HTML report: the table as the screen shows it (merged headers, totals and subtotals, colour
  scales and data bars, collapsed groups), the chart as an image, the details (source, rows, filters,
  generated), print rules (the header on every page, rows not split, landscape for a wide table) and
  a Content-Security-Policy that loads and runs nothing.
- The print template (`pivotkit-report/template`): `{{placeholders}}` from a fixed table, allowed in
  text and a few attributes only, checked before anything is rendered (`INVALID_TEMPLATE`).
- The chart as SVG through ECharts' server-side renderer, checked and cleaned (`cleanSvg`): no
  script, event attribute, link or style attribute; attribute names plain names, namespaces only
  SVG's and xlink's.
- Options are checked: an unknown one is refused with the closest name, an option of a few values
  (`chart`, `chartEmbed`, `bom`, `strict`, `trusted`) takes only those, and `chart: true` without
  `echarts` is an error. `bom: false` writes CSV without a byte order mark.
