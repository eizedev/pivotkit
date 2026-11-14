---
title: Features
description: Every feature of pivotkit by area - loading files, the field list, filters, dates, values, totals and sorting, drill-down, charts, views, explanations, keyboard, languages, theming, exports with the source data, reports and the command line, security, limits and integrations - each with a link to the page that describes it.
---

# Features

Every feature of pivotkit by area. Each area says what people do with it and what a developer sets,
and links to the page that describes it with all its small behaviours. The [start page](index.md) has
the short version, the [comparison](compare.md) sets it beside other pivot components.

## Load your own data { #import }

<span id="loading-files"></span><span id="data"></span>

- People drop a CSV, TSV, JSON or Excel file onto the report or pick it under **Data**: a preview
  shows the first rows with a type under each column (change it there), the sheet of a workbook,
  and notes on what was read how; Undo and **Back to original data** bring the application's data
  back; views remember the file they were made for ([load your own data](use/load-data.md)).
- Read right: encodings, separators, title lines above the header, German and English numbers and
  dates, leading zeros kept ("01067"), long identifiers kept as text ([loading files](reference/import.md)).
- Developers: `allowImport` (off by default), `plugins` ([pivotkit-xlsx](reference/plugins.md#pivotkit-xlsx)
  for Excel), `importWorker`, `importLimits` apart from the host's `limits`, `onDataLoad`; the
  application's own data as objects or one array per column, typed, with `dataKey`, `encoded` and
  `loading` ([React props](reference/react.md#prop-allowimport), [pivotkit-core](reference/core.md#data)).

## The field list and the zones { #zones-and-fields }

- Rows, Columns, Values and Filters; a field is dragged, clicked (numbers to Values, the rest to
  Rows) or placed through its menu: drag and drop is never the only way; types with icons, a search,
  chips that show their filter, top N and sort; Swap rows and columns ([fields and zones](use/fields.md)).
- The table: subtotals and grand totals, expand and collapse, sticky headers, long labels that wrap,
  fast from 300 rows on ([the table](use/fields.md#the-table)).
- Developers: field labels, descriptions and links, an aggregator, format and item order per field
  (`fieldDefaults`), also from a JSON Schema or OpenAPI document ([field descriptions](concepts/fields.md)).

<span id="table"></span>

## Filters { #filters }

- Items with their row counts, a search and **Only**; quick choices for dates in a unit (this, last
  N, next N, before the last N, rolling) that stay right over time, counted from today, the latest
  or first record or a date; rules on the item ("from 2022"), its name ("does not begin with") and its
  total ("Sum of Revenue > 1,000"), each saying what it keeps; items without a value kept or left;
  top or bottom N within groups, with ties; the same menu in Filters
  ([filters, top N and sorting](use/filters.md)).
- Developers: one filter shape with `not` and `blanks` for items, blanks, text, comparisons, relative
  ranges from hours to years, top N and value conditions ([filters](concepts/filters.md)).

## Dates and number ranges { #dates }

- A date is grouped as it is placed, by the span of its values: along the time line (year, quarter,
  month, week, day, hour) or as the same period every year (quarter, month or week of the year,
  weekday, hour of the day), with **Years combined** for the years a cyclic grouping joins; numbers
  into ranges ([dates and number ranges](use/values.md#dates-and-number-ranges), [years combined](use/filters.md#years-combined)).
- Developers: derived fields in the view, wall-clock dates in the data's `timeZone`
  ([dates](concepts/dates.md), [time zones](concepts/limits.md)).

## Values { #values }

- Sum, count, average, median, minimum, maximum, distinct count, statistics, first and last; show
  values as shares of the grand, row, column or parent total, differences, running totals and ranks;
  number formats; colour scales and data bars; a name of your own ([values and formats](use/values.md)).
- Developers: `AGGREGATORS`, `SHOW_AS` and formats as tables of the engine ([values](concepts/values.md)).

## Totals and sorting { #sorting }

- Subtotals and grand totals on or off per axis; sorting by label, by any value or in a custom
  order; a click on a header sorts ([sorting](use/filters.md#sorting), [totals](use/fields.md#the-table)).

## The rows behind a number { #drill-down }

- Click a value or a chart mark: the rows behind it in a panel, enlarged on request, to copy, copy as
  JSON, or download as CSV or Excel ([the rows behind a number](use/drill-down.md)).
- Developers: `drillDown`, `drillDownLimit`, `onCellClick` with the rows ([React props](reference/react.md#props)).

## Charts { #chart }

- Table or chart with one switch; the type follows the data (lines over dates, else bars) until
  people pick bars, stacked or horizontal bars, lines, area, pie, donut or heatmap; value labels,
  legend, title, smooth lines, axis and group labels; tips that suggest a better type ([charts](use/charts.md)).
- Developers: the view's `chart` settings, `autoChartType`, `chartOptions` as checked plain JSON
  ([charts](concepts/charts.md)).

## Views, saving and sharing { #saved-views }

<span id="sharing"></span>

- Undo and redo every step; Start over (Reset, New); the view's name in the toolbar with a dot for
  unsaved changes; Save and Save as; shared views and my views; publish where allowed; copy a link,
  copy the view as JSON, download or open a view file; a view for other data asks first
  ([views, saving and sharing](use/views.md)).
- Developers: the view is versioned JSON with published JSON Schemas, controlled or not; `templates`,
  `onSaveTemplate`, `onDeleteTemplate`, `onPublishTemplate`, `templateStore="browser"`,
  `x-pivotkit-views` in an OpenAPI document; view files (`toViewFile`, `fromViewFile`), links in the
  URL fragment (`shareLink`, `readViewLink`), `source`, `sources`, `onSourceSwitch`,
  `persistView` ([views](concepts/views.md), [templates](concepts/templates.md),
  [sharing](concepts/sharing.md), [view file format](reference/view-file.md)).

## Explanations, tips and messages { #tips }

- An **i** next to each zone, each field the application describes and each setting that needs one;
  tips one at a time above the result; greyed-out entries that say why; status messages; parts of a
  view that could not be used, in plain words; menus in levels with a search; an × in every text
  field ([small screens, menus and tips](use/layout.md), [behaviour reference](use/behaviour.md)).
- Developers: `tips`, `storageKey`, `dismissedTips`, `onTipDismiss`, `fieldInfo`, `zoneInfo`,
  `settingInfo` ([tips](reference/react.md#tips)).

## Keyboard and screen readers { #accessibility }

- Every action by keyboard and by a menu; the field list as one Tab stop; chips moved with the
  arrow keys and their place announced; the table by arrow keys; a text alternative of the chart;
  focus kept on purpose; 44 px touch targets on a phone ([keyboard and screen readers](use/keyboard.md)).
- Both themes meet WCAG contrast ratios, checked by a test; no conformance level is claimed
  ([theming](reference/theming.md)).

## Languages { #languages }

- English and German built in, numbers and dates in the language ([in German](use/layout.md#in-german)).
- Developers: every text replaceable through `labels`, `locale`; a new language in a few files
  ([localisation](reference/localisation.md)).

## Theming { #theming }

- Light and dark, following the page or the system.
- Developers: `--pk-*` CSS custom properties for colours, fonts, weights, sizes, corners and chart
  colours; the chart, the HTML report, print and the Excel export take the same tokens, inside a
  shadow root too ([theming](reference/theming.md)).

## Exports and the source data { #export }

- The table as an Excel workbook (merged headers, bold totals, number formats, colour scales and
  data bars as Excel's own conditional formats), a CSV safe to open, an HTML report, the chart as PNG
  or SVG, print or save as PDF, copy the table or its data as JSON ([export and copy](use/export.md)).
- Where the application turns it on, **Source data**: every row behind the report as CSV or JSON,
  for your own analysis or the command line ([the table or the rows](use/export.md#the-table-or-the-rows-behind-it)).
- Developers: `fileName`, `exportData`, every file and copy through `onExport`
  ([React props](reference/react.md#prop-exportdata)).

## Reports without a browser and the command line { #reports-without-a-browser }

- `pivotkit-report`: a view over rows to an HTML report from a print template, CSV, JSON, XLSX or SVG,
  in Node and the browser, the same table and chart as on the screen
  ([reports in code](getting-started/report.md), [pivotkit-report](reference/report.md),
  [print template](reference/print-template.md)).
- `pivotkit-cli`: `pivotkit example`, `render`, `validate` and `describe`, with exit codes, `--json`,
  messages that say what to fix, shell completion and safe file handling; offline
  ([command line](getting-started/cli.md), [pivotkit-cli](reference/cli.md)).
- For programs and reviews: `validate` with "did you mean" hints, `describeSource` and `describeView`
  in plain words ([views](concepts/views.md)).

## AI clients (MCP) { #mcp }

- `pivotkit-mcp`: tools to list and describe sources, write, validate and describe views, render
  reports into files, make links and draft schedules; the model sees per field names and counts,
  values or nothing (exposure policy) and never the data itself; stdio and Streamable HTTP with a
  token or OAuth 2.1; a skill that teaches the workflow
  ([getting started](getting-started/mcp.md), [pivotkit-mcp](reference/mcp.md), [security](security.md#mcp)).

## Security { #security }

- A view holds names only (and the values chosen in its filters), is checked against fixed lists and
  limits and cannot run code; a loaded file is checked before it is parsed; exports are safe to open;
  data is written as text, never markup; a strict CSP works. Not access control: send only the rows a
  viewer may see ([security](security.md)).

## Limits and performance { #limits }

- Rows, groups, cells and work capped before anything big is allocated; links capped while they are
  inflated; a loaded file's own limits ([limits](concepts/limits.md#limits)).
- Measured up to 1,000,000 rows in three browsers on one Mac; heavy parts loaded on first use
  ([measured in the browser](concepts/limits.md#measured-in-the-browser),
  [bundle size](reference/element.md#bundle-size)).

## Packages and integrations { #embedding }

<span id="props-and-attributes"></span>

- `pivotkit-react` (`<PivotReport>`, React 18 and 19), `pivotkit-element` (`<pivot-report>` with its
  own React, for Angular, PHP and plain HTML; attributes, properties, `pivot-*` events with
  `respondWith()`), `pivotkit-core` (the engine, browser and Node), `pivotkit-xlsx`,
  `pivotkit-report`, `pivotkit-cli`, `pivotkit-mcp` ([Embed pivotkit](embed/index.md), [pivotkit-element](reference/element.md)).
- AI clients through MCP, with what the model may see set per field ([MCP server](getting-started/mcp.md)).
- Bundlers and import maps, several reports on one page, PowerShell Universal on the React it
  provides and as the module `New-UDPivotReport` ([recipes](embed/recipes.md),
  [PowerShell Universal](getting-started/react.md#powershell-universal)).
- Real data to learn with: weather, countries, earthquakes, Nobel laureates, software end of life
  ([learn with real data](learn.md), [live demo](demo.md)).
