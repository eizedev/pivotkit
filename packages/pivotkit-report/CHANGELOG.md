# Changelog

All notable changes to `pivotkit-report` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First release.

### Added

- `SIZE_TOKENS`: the HTML report's font sizes as tokens, `--pk-font-size` (14 px), `--pk-small`
  (the details, at least 14 px, were 12 px), `--pk-report-title-size` (20 px at 14 px),
  `--pk-print-size` (10 pt) and `--pk-print-small` (7 pt); a host's `tokens` change them, and the
  chart's text with `--pk-chart-text-size` in px (default 14 px, was ECharts' 12 px). A token's value
  may hold a `calc()`'s `*`, never a comment ([#220](https://github.com/eizedev/pivotkit/issues/220), [#221](https://github.com/eizedev/pivotkit/issues/221)).
- `SHAPE_TOKENS`: the corner of the HTML report's chart card, `--pk-radius-card` (8 px, pivotkit-react's
  value); a host's `tokens` change it, as the chart's title size (`--pk-chart-title-size`) and its marks'
  corners (`--pk-radius-chart`) in px ([#216](https://github.com/eizedev/pivotkit/issues/216)).
- A colour scale or data bars without colours of the view's own take the host's `tokens` in the HTML
  report's table and in the workbook (`--pk-scale-low`, `--pk-scale-mid`, `--pk-scale-high`,
  `--pk-chart-1`), as the report on screen does; by default the light theme's heat colours, light
  for low and strong for high ([#212](https://github.com/eizedev/pivotkit/issues/212)).
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
  text and a few attributes only, checked before anything is rendered (`INVALID_TEMPLATE`); the
  `content` of a `<meta>` takes one only for `name="description"` without `http-equiv`.
- A host's `tokens` are left out when a value holds a line break or `url(` (also in a quoted string,
  which a line break would end), a comment or a function that is not a colour, `calc()`, `min()`,
  `max()`, `clamp()` or `var()`. The HTML report and the SVG leave out bidi controls, as the CSV does (in the SVG also as numeric references).
- The chart as SVG through ECharts' server-side renderer, checked and cleaned (`cleanSvg`): no
  script, event attribute, link or style attribute; attribute names plain names, namespaces only
  SVG's and xlink's.
- Options are checked: an unknown one is refused with the closest name, an option of a few values
  (`chart`, `chartEmbed`, `bom`, `strict`, `trusted`) takes only those, and `chart: true` without
  `echarts` is an error. `bom: false` writes CSV without a byte order mark.
