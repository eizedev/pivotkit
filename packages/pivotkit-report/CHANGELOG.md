# Changelog

All notable changes to `pivotkit-report` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The README says that a minor release of 0.x can break things, with links to Versioning and Upgrading.

### Fixed

- A German HTML report writes its filters and its summary (`{{filters}}`, `{{summary}}` and the
  page description) in German. They were English (#798).

## [0.6.0] - 2026-11-24

### Fixed

- A view that holds itself gives the issue `viewFile` instead of a `TypeError`.
- `cleanSvg` takes an SVG with two `<style>` elements. It refused it as "a <style> element that is
  not closed".
- Cells of an HTML table with the same data bar or colour share one CSS rule. A table of 40,000 rows
  with four data bars wrote 160,000 rules and 18.6 MB; it now writes about 1,000 rules and 10.6 MB.

### Changed

- Depends on `pivotkit-core` `^0.10.0` (was `^0.9.0`).
- **Breaking:** `render` refuses with `INVALID_OPTION` an option of the wrong kind it used to take
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#from-0-9)):
  - `title`, `description` or `source` that is no text. A number as title threw a bare `TypeError`.
  - `labels` or `texts` that is no object.
  - `tableCells` that is no whole number of at least 1 or `Infinity`: `0`, `NaN`, `10.5`, `"100"`.
    `0` and `NaN` gave a table of headers only.

  `null` still means "not given", and `tableCells: Infinity` still means no limit.

- `render` checks the `template` after its other options, except `size`. With a bad template and
  another bad option, such as `chart: "yes"`, it throws `INVALID_OPTION` for the option, where it
  threw `INVALID_TEMPLATE`. A single bad option or template throws the same error as before.
- `OperationError` extends `CodedError` of `pivotkit-core/internal`. Its members and their types stay
  the same.
- The operations table is split into smaller files: errors, findings, schemas, layouts, the view
  guide, the input check and the helpers of the operations. `pivotkit-report/operations` exports the
  same names, and answers and messages stay the same.

## [0.5.0] - 2026-11-22

### Added

- An HTML report of a view with `display: "both"` has the chart above the table
  ([#51](https://github.com/eizedev/pivotkit/issues/51)).
- The chart as SVG and in the HTML report draws bars and lines, and a treemap
  ([chart types](https://pivotkit.eize.dev/use/charts/#chart-types), [#518](https://github.com/eizedev/pivotkit/issues/518)).
- The chart as SVG and in the HTML report merges a pie's smallest slices into "Other (n)" by the same
  rule as the screen. The chart takes the report's words, so a German report writes "Andere (n)"
  and the German names of the reference lines. `--pk-chart-other` is one of the report's tokens
  ([many slices](https://pivotkit.eize.dev/use/charts/#many-slices), [#544](https://github.com/eizedev/pivotkit/issues/544)).
- The chart as SVG and in the HTML report draws the high and low points. Their labels are placed
  after a second draw, as on the screen
  ([high and low points](https://pivotkit.eize.dev/use/charts/#high-and-low-points), [#574](https://github.com/eizedev/pivotkit/issues/574)).
- `list_sources`' output schema has `linkParams` per source, and `create_link`'s description names it
  ([link parameters](https://pivotkit.eize.dev/concepts/sharing/#link-params), [#619](https://github.com/eizedev/pivotkit/issues/619)).

### Changed

- Depends on `pivotkit-core` `^0.9.0` (was `^0.8.0`).
- **Breaking:** needs Node 24 or later. Node 22 is no longer supported
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#node-24), [#519](https://github.com/eizedev/pivotkit/issues/519)).
- `create_link` and `draft_schedule` take exactly one of `view` or `layout`, through the same
  `viewOrLayout` as `validate_view` and `render_view`. `view` is no longer required ([#469](https://github.com/eizedev/pivotkit/issues/469)).

## [0.4.0] - 2026-11-18

### Added

- The SVG and the HTML report draw 100 % stacks (`chart.stackPercent`) and leave out hidden
  series (`chart.hidden`). They draw every category, without a zoom slider ([#36](https://github.com/eizedev/pivotkit/issues/36)).
- `render` takes `colorMap`, a fixed colour per series or slice name for the chart. The SVG and the
  HTML report draw the view's `chart.colors` over it ([#54](https://github.com/eizedev/pivotkit/issues/54)).
- The chart as SVG and in the HTML report draws the view's reference lines with their labels
  (`chart.referenceLines`). `--pk-chart-reference` is one of the report's tokens, `var(--pk-muted)`
  in both themes ([#48](https://github.com/eizedev/pivotkit/issues/48)).
- `render` of a view that shows the chart as `xlsx` adds the warning `chartNotInXlsx`: the
  workbook holds the table, the chart is in `html` or `svg`. The `render_view` description says the
  workbook has no chart ([#360](https://github.com/eizedev/pivotkit/issues/360)).
- `rowCount: false` leaves the data's row count out of `{{rows}}` and the HTML report's details
  ([#547](https://github.com/eizedev/pivotkit/issues/547)).
- `render` takes `numbers` (`"full"` or `"shown"`) for csv and json and `flatHeader` for csv.
  Its result has the `grid` it exported. The `render_view` operation takes them as inputs, with `locale` for a view or layout that names
  none; a `locale` that chooses a numbering system or that the runtime has no format for is refused
  ([#478](https://github.com/eizedev/pivotkit/issues/478)).

### Changed

- Depends on `pivotkit-core` `^0.8.0` (was `^0.7.0`).
- Behaviour change: the HTML report's row count takes the plural form of its language: "1 row",
  "1 Zeile". `REPORT_TEXTS.<lang>.rowsCount` and `rowsFiltered` are objects of plural forms, no
  longer texts, and so is their type in `ReportTexts`. The `texts` option takes a count as one text
  or as forms ([#547](https://github.com/eizedev/pivotkit/issues/547)).
- The chart's SVG takes `toEChartsOption` from `pivotkit-core/chart` ([#546](https://github.com/eizedev/pivotkit/issues/546)).
- The chart's SVG keeps a heatmap's colours ECharts can mix through pivotkit-core's
  `decorateOption` (`readColor`). The output is the same ([#386](https://github.com/eizedev/pivotkit/issues/386)).
- The HTML report says how many of the data's rows the filters keep, as pivotkit-react's row count
  does: `{{rows}}` says "6 of 8 rows" (German "6 von 8 Zeilen"), the details' rows "6 of 8". With
  nothing filtered out they say "8 rows" and "8" as before. Their texts are the new `texts` entries
  `rowsFiltered` and `rowsKept` ([#547](https://github.com/eizedev/pivotkit/issues/547)).

### Fixed

- The chart's SVG lays out its labels as the screen does, from pivotkit-core: slanted category names
  leave the plot its height, a donut's outside labels stay whole, the value at the end of a
  horizontal bar is not cut (the plot of horizontal bars with value labels is a little narrower,
  at every size), and a heatmap names every row that has room ([#228](https://github.com/eizedev/pivotkit/issues/228),
  [#229](https://github.com/eizedev/pivotkit/issues/229), [#230](https://github.com/eizedev/pivotkit/issues/230), [#231](https://github.com/eizedev/pivotkit/issues/231)).

## [0.3.0] - 2026-11-16

### Upgrading from 0.2

What code that calls `render` checks; the [upgrade page](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L803) has the details.

- **Breaking:** `render` refuses `tokens` or `darkTokens` that is no object (a CSS text, a list,
  `null`, a number) with `INVALID_OPTION`; pass an object, or leave the option out
  ([upgrading](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L1292)).
- On a dark screen `--pk-scale-mid` is `initial` unless `darkTokens` sets it: pass the middle
  colour there to keep one ([upgrading](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L1280)).
- A token's value with a quoted string is left out, except in `font-family`, in the host's
  `tokens` too.
- pivotkit-core moves to `^0.7.0` with it.

### Added

- `list_sources`' output schema takes a parameter's `pattern`, `format`, `minLength`, `maxLength`,
  `minimum` and `maximum`; `list_sources`, `describe_source` and `render_view` say that a source's
  required params go into every call ([#328](https://github.com/eizedev/pivotkit/issues/328)).

- A finding about a field carries it in `field` (from pivotkit-core's issue, such as `itemCase`).
- `env.unknownItems`: the finding `itemUnknown` for an item of an `in` filter that is none of its
  text field's values, with the closest one as the `suggestion`
  ([#362](https://github.com/eizedev/pivotkit/issues/362)).
- An HTML report's chart, its card and the table's colour scales and data bars take the `--pk-*`
  colours and the font that the print template's own CSS gives the report, computed as the browser
  computes them for `.pk-report` (light values, `var()` resolved), so a template's CSS is the one
  place of its design ([#369](https://github.com/eizedev/pivotkit/issues/369)).
- The HTML report's root (`<html>` of a print template) takes `data-pk-theme="light"` (light on
  every screen) and `data-pk-theme="dark"` (dark on every screen, light on paper). On a dark screen
  the report's dark tokens win over a template's plain `:root` colours
  ([#370](https://github.com/eizedev/pivotkit/issues/370)).
- `OPERATION_ERRORS` has `DATA_MISMATCH` (422), `DATA_NOT_AVAILABLE` (404), `SOURCE_UNAVAILABLE` (502)
  and `UPLOAD_FAILED` (502); `OperationError` takes `details` (`requestId`, `retryable`,
  `retryAfter`).
- A front end's `data(source)` may give `asOf` (and `stale`); `render_view` passes it to `render` as
  the option `dataAsOf`, which `render` checks (UTC to the second, a time that exists).
- `dataAsOf` in files ([#331](https://github.com/eizedev/pivotkit/issues/331)): an html report's
  details say "Data as of" (German "Datenstand"), in the locale and time zone with the zone named;
  the print template's `{{dataAsOf}}` placeholder; an xlsx file's custom document property
  `DataAsOf` (needs pivotkit-core's `toXlsx` option `dataAsOf`).
- list_sources' output schema has `params` per source; describe_source's a field's `description`.

- `darkTokens`: a host's `--pk-*` colours for an HTML report on a dark screen, over the dark theme's,
  as `tokens` are over the light ones (cleaned the same way); paper, a root that pins light and the
  chart keep the light ones, and a template's own dark rules win over them. A host's brand colours
  were lost on a dark screen ([#385](https://github.com/eizedev/pivotkit/issues/385)).

### Changed

- `checkInput`: a text over its `maxLength` says its own length and to shorten it ("input.name must
  have at most 80 characters, not 81; shorten it").
- A token's value with a quoted string is left out (the default stands in), except in
  `font-family`: in the host's `tokens` too. A quote in a colour could only make the chart's SVG
  refused ([#369](https://github.com/eizedev/pivotkit/issues/369)).
- **Breaking:** `render` refuses `tokens` or `darkTokens` that is no object (a CSS text, a list, `null`, a number)
  with `INVALID_OPTION` and `details.option`, as its other options; such a value gave the default
  colours without a word. A token inside the object that cannot be used is still left out on its own
  ([#165](https://github.com/eizedev/pivotkit/issues/165)).
- Depends on `pivotkit-core` `^0.7.0` (was `^0.6.1`).

### Fixed

- HTML report on a dark screen: the note under a chart cut at its categories ("The chart shows the
  first 50 of ...") sits on the chart's light card and takes the light theme's muted text (a
  template's own included; a template's own `.pk-report-note` rule still colours it); it took the
  dark theme's light grey there, 2.3:1 on the card
  ([#370](https://github.com/eizedev/pivotkit/issues/370)).
- HTML report on a dark screen: `--pk-scale-mid` is `initial` unless `darkTokens` sets it, so a
  host's light middle colour (of `tokens` or of a template's light rule) no longer shows in dark
  mode; the cells run halfway between the dark low and high colours. This changes how an existing
  report with a middle colour looks on a dark screen: pass the middle colour in `darkTokens` to keep
  one there ([#385](https://github.com/eizedev/pivotkit/issues/385)).
- HTML report on a dark screen: a colour scale whose view names no colours runs through the dark
  theme's heat colours, as the report on a page does; the light ones made its low end a bright grey
  under light text (3.3:1). A view's own colours are mixed fainter there (30 %, as on the page).
  Each cell carries only its place on the scale; the colour is mixed by one rule per half
  ([#370](https://github.com/eizedev/pivotkit/issues/370)).
- A host's token that is another token alone (`var(--pk-chart-2)`) reaches the chart as that token's
  value; one with any other `var()` keeps the default instead of reaching the chart as `var(...)`. A
  heatmap colour ECharts cannot mix (such as `oklch()`) keeps the default scale instead of turning
  the heatmap black ([#369](https://github.com/eizedev/pivotkit/issues/369)).

## [0.2.1] - 2026-11-14

### Added

- `env.drafting`: a front end narrows what a draft (`suggest_view`, a layout) reads of the data's
  description, such as the counts and spans its exposure policy keeps back
  ([#296](https://github.com/eizedev/pivotkit/issues/296)).

## [0.2.0] - 2026-11-14

### Upgrading from 0.1

What a script that reads the reports checks; the [upgrade page](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md?plain=1#L1527) has the details.

- Without `labels`, the report's words follow its locale (German for `de-DE`) and, in English, the
  report on a page: "Yes"/"No" instead of "true"/"false", "Distinct count" instead of "Count
  Unique". `labels: DEFAULT_LABELS` keeps the engine's words.
- The HTML report's details say "Rows: 8" (was "Rows: 8 rows").

### Added

- Operations: `suggest_view` (a draft view file from a source's fields, with its `picks`), and a
  `layout` (a view by field names) instead of a `view` for `render_view` and `validate_view`, with the
  `view` it made in the result; `viewOfLayout` and `LAYOUT_NOTE_SEVERITY`, the one way the operations
  and the command line make a view from a layout ([#253](https://github.com/eizedev/pivotkit/issues/253)).
- `pivotkit-report/operations`: the one table of operations the command line, the MCP server and a
  REST service share (`OPERATIONS`: list_sources, describe_source, get_view_guide, validate_view,
  describe_view, render_view, create_link, draft_schedule), each with its description, input and
  output JSON Schema, HTTP route and `run(input, env)`; `VIEW_GUIDE`, `exampleViews`, `findingOf`,
  `OperationError` with `OPERATION_ERRORS`; every `run` checks its input against its schema first
  (`checkInput`, `INVALID_INPUT` naming the place) ([#165](https://github.com/eizedev/pivotkit/issues/165)).
- `summary.keptRows`: the rows the view's filters keep (the CLI warns when it is 0).

### Changed

- The HTML report's details give the data's rows as a number ("Rows: 8"; it said "Rows: 8 rows",
  "Zeilen: 8 Zeilen"); the template's `{{rows}}` stays "8 rows".
- Without `labels`, `render()` writes the report's words in the language of its locale
  (pivotkit-core's `reportLabels`): German for a German locale ("Gesamtergebnis", "Summe von Units",
  where it wrote "Grand Total" next to German numbers), and in English the words the report on a page
  shows ("Distinct count", yes/no as "Yes" and "No"). Pass `labels: DEFAULT_LABELS` for the engine's
  own words.
- Depends on `pivotkit-core` `^0.6.0` (was `^0.5.0`).

## [0.1.0] - 2026-11-13

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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-report@0.6.0...HEAD
[0.6.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-report@0.5.0...pivotkit-report@0.6.0
[0.5.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-report@0.4.0...pivotkit-report@0.5.0
[0.4.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-report@0.3.0...pivotkit-report@0.4.0
[0.3.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-report@0.2.1...pivotkit-report@0.3.0
[0.2.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-report@0.2.0...pivotkit-report@0.2.1
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-report@0.1.0...pivotkit-report@0.2.0
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-report@0.1.0
