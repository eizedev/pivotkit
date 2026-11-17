---
title: Features
description: Every feature of pivotkit by area - loading files, the field list, filters, dates, values, totals and sorting, drill-down, charts, views, explanations, keyboard, languages, theming, exports with the source data, reports and the command line, security, limits and integrations - each with a link to the page that describes it.
---

# Features

Every feature of pivotkit by area. Each area says what people do with it and what a developer sets.
It links to the page that describes it with all its small behaviours. The [start page](index.md) has
the short version. The [comparison](compare.md) sets pivotkit beside other pivot components.

## Load your own data { #import }

<span id="loading-files"></span><span id="data"></span>

- People drop a CSV, TSV, JSON or Excel file onto the report, or pick it under **Data**
  ([load your own data](use/load-data.md#after-loading)).
    - A preview shows the first rows with a type under each column. People change the type there.
    - The preview also shows the sheet of a workbook, and notes on what was read how.
    - Undo and **Back to original data** bring the application's data back.
    - Views remember the file they were made for, and on a workbook its sheet. When people open a
      view of another sheet, it reads that sheet.
- The file is read right ([loading files](reference/import.md)):
    - encodings, separators, and title lines above the header
    - German and English numbers and dates
    - leading zeros kept ("01067"), and long identifiers kept as text
- Developers ([React props](reference/react.md#prop-allowimport), [pivotkit-core](reference/core.md#data)):
    - `allowImport`, off by default
    - `plugins`, with [pivotkit-xlsx](reference/plugins.md#pivotkit-xlsx) for Excel
    - `importWorker`, `onDataLoad`, and `importLimits` apart from the host's `limits`
    - the application's own data as objects or one array per column, typed, with `dataKey`, `encoded`
      and `loading`

## The field list and the zones { #zones-and-fields }

- Rows, Columns, Values and Filters ([fields and zones](use/fields.md)):
    - People drag a field, click it, or place it through its menu. Drag and drop is never the only
      way. A click puts numbers into Values and the rest into Rows.
    - Types with icons, and a search.
    - Chips that show their filter, top N and sort.
    - Swap rows and columns.
    - The zones fold under their heading "Fields in the report" ([a low report](use/layout.md#a-low-report)).
- Table and Chart as tabs on the result, each with its settings ([charts](use/charts.md)).
- The table ([the table](use/fields.md#the-table)): subtotals and grand totals, expand and collapse,
  sticky headers, and long labels that wrap. It is fast from 300 rows on.
- Developers: per field a label, a description, links, an aggregator, a format and an item order
  (`fieldDefaults`). They can also come from a JSON Schema or OpenAPI document
  ([field descriptions](concepts/fields.md)).

<span id="table"></span>

## Filters { #filters }

- The filter menu ([filters, top N and sorting](use/filters.md)):
    - Items with their row counts, a search and **Only**.
    - Quick choices for dates in a unit: this, last N, next N, before the last N, and rolling. They
      stay right over time. They count from today, the latest or first record, or a date.
    - Rules on the item ("from 2022"), on its name ("does not begin with") and on its total ("Sum of
      Revenue > 1,000"). Each rule says what it keeps.
    - Items without a value kept or left out.
    - Top or bottom N within groups, with ties.
    - The same menu in Filters.
- Developers: one filter shape with `not` and `blanks`. It covers items, blanks, text, comparisons,
  relative ranges from hours to years, top N and value conditions ([filters](concepts/filters.md)).

## Dates and number ranges { #dates }

- A date is grouped by the span of its values as soon as people place it
  ([dates and number ranges](use/values.md#dates-and-number-ranges), [years combined](use/filters.md#years-combined)):
    - along the time line: year, quarter, month, week, day, hour
    - as the same period every year: quarter, month or week of the year, weekday, hour of the day
    - **Years combined** for the years a cyclic grouping joins
    - the data's date range in the footer and in the date's "i"; the name of a combined grouping
      says which years it joins; the Group level starts with the range and shows examples from the
      data
- Numbers are grouped into ranges.
- Developers: derived fields in the view, and wall-clock dates in the data's `timeZone`
  ([dates](concepts/dates.md), [time zones](concepts/limits.md)).

## Values { #values }

- Values and formats ([values and formats](use/values.md)):
    - Sum, count, average, median, minimum, maximum, distinct count, statistics, first and last.
    - Show values as shares of the grand, row, column or parent total, as differences, running totals
      and ranks.
    - Number formats, colour scales and data bars.
    - A name of your own.
- Developers: `AGGREGATORS`, `SHOW_AS` and formats as tables of the engine ([values](concepts/values.md)).

## Totals and sorting { #sorting }

- Subtotals and grand totals on or off per axis ([totals](use/fields.md#the-table)).
- Sorting by label, by any value or in a custom order. A click on a header sorts
  ([sorting](use/filters.md#sorting)).

## The rows behind a number { #drill-down }

- Click a value or a chart mark. A panel shows the rows behind it
  ([the rows behind a number](use/drill-down.md)). People can enlarge it. Where the application
  allows it, they copy the rows, copy them as JSON, or download them as CSV or Excel.
- Developers: `drillDown`, `drillDownLimit`, `drillDownExport`, and `onCellClick` with the rows ([React props](reference/react.md#props)).

## Charts { #chart }

- Table or chart with one switch ([charts](use/charts.md)):
    - The type follows the data: lines over dates, else bars. That holds until people pick a type:
      bars, stacked or horizontal bars, lines, area, pie, donut or heatmap.
    - Value labels, legend, title, smooth lines, axis and group labels.
    - A zoom slider under a long axis, series shown or hidden from the legend, 100 % stacked bars
      and areas.
    - Reference lines: an average, a trend and a target ([reference lines](use/charts.md#reference-lines)).
    - Fixed colours per series or slice, the share in the tooltip, and the chart as an image on the
      clipboard.
    - Tips that suggest a better type.
- Developers: the view's `chart` settings, `autoChartType`, `colorMap` for fixed colours per name,
  and `chartOptions` as checked plain JSON ([charts](concepts/charts.md)).

## Views, saving and sharing { #saved-views }

<span id="sharing"></span>

- People work with views like this ([views, saving and sharing](use/views.md)):
    - Undo and redo every step. Start over with Reset or New.
    - The view's name in the toolbar, with a dot for unsaved changes.
    - Save and Save as. Shared views and my views. Publish where allowed.
    - Copy a link, copy the view as JSON, download or open a view file.
    - A view for other data asks first.
- Developers ([views](concepts/views.md), [templates](concepts/templates.md),
  [sharing](concepts/sharing.md), [view file format](reference/view-file.md)):
    - The view is versioned JSON with published JSON Schemas, controlled or not.
    - `templates`, `onSaveTemplate`, `onDeleteTemplate`, `onPublishTemplate`,
      `templateStore="browser"`, and `x-pivotkit-views` in an OpenAPI document.
    - View files (`toViewFile`, `fromViewFile`) and links in the URL fragment (`shareLink`,
      `readViewLink`).
    - `source`, `sources`, `onSourceSwitch` and `persistView`.

## Explanations, tips and messages { #tips }

- Help where people need it ([small screens, menus and tips](use/layout.md), [behaviour reference](use/behaviour.md)):
    - An **i** next to each zone, each field the application describes and each setting that needs
      one.
    - Tips one at a time above the result.
    - Greyed-out entries that say why.
    - Status messages.
    - Parts of a view that could not be used, in plain words.
    - Menus in levels with a search, and an × in every text field.
- Developers: `tips`, `storageKey`, `dismissedTips`, `onTipDismiss`, `fieldInfo`, `zoneInfo` and
  `settingInfo` ([tips](reference/react.md#tips)).

## Keyboard and screen readers { #accessibility }

- Keyboard and screen readers ([keyboard and screen readers](use/keyboard.md)):
    - Every action by keyboard and by a menu.
    - The field list as one Tab stop.
    - Chips moved with the arrow keys, with their place announced.
    - The table by arrow keys.
    - A text alternative of the chart.
    - Focus kept on purpose.
    - 44 px touch targets on a phone.
- Both themes meet WCAG contrast ratios, and a test checks them. pivotkit claims no conformance
  level ([theming](reference/theming.md)).

## Languages { #languages }

- English and German built in, with numbers and dates in the language ([in German](use/layout.md#in-german)).
- Developers: every text replaceable through `labels` and `locale`. A new language takes a few files
  ([localisation](reference/localisation.md)).

## Theming { #theming }

- Light and dark, following the page or the system.
- Developers: `--pk-*` CSS custom properties for colours, fonts, weights, sizes, corners and chart
  colours. The chart, the HTML report, print and the Excel export take the same tokens, inside a
  shadow root too ([theming](reference/theming.md)).

## Exports and the source data { #export }

- Exports and copies ([export and copy](use/export.md)):
    - The table as an Excel workbook: merged headers, bold totals, number formats, and colour scales
      and data bars as Excel's own conditional formats.
    - A CSV safe to open.
    - An HTML report.
    - The chart as PNG or SVG.
    - Print, or save as PDF.
    - Copy the table, or its data as JSON.
- **Source data**, where the application turns it on: every row behind the report as CSV or JSON,
  for your own analysis or the command line ([the table or the rows](use/export.md#the-table-or-the-rows-behind-it)).
- Developers: `fileName`, `exportData`, and every file and copy through `onExport`
  ([React props](reference/react.md#prop-exportdata)).

## Reports without a browser and the command line { #reports-without-a-browser }

- `pivotkit-report` renders a view over rows in Node and in the browser
  ([reports in code](getting-started/report.md), [pivotkit-report](reference/report.md),
  [print template](reference/print-template.md)):
    - to an HTML report from a print template, CSV, JSON, XLSX or SVG
    - with the same table and chart as on the screen
    - with two templates to start from, Corporate and Minimal, from `pivotkit example templates`
      ([your own corporate design](reference/corporate-design.md))
- `pivotkit-cli` ([command line](getting-started/cli.md), [pivotkit-cli](reference/cli.md)):
    - `pivotkit example`, `render`, `validate` and `describe`.
    - A draft view from a file's fields (`describe --suggest`), and a report without a view file
      from layout flags (`render --rows ... --values ... --filter Country=Germany`). `--map` for a renamed column, and
      `--save-view` ([a view from the data's fields](reference/cli.md#a-view-from-the-datas-fields)).
    - Exit codes, `--json`, and messages that say what to fix.
    - The sheet of a workbook a view names. `describe` lists a workbook's sheets.
    - Shell completion and safe file handling.
    - Offline, or on a pivotkit-server's sources with `--url`, `--source` and `pivotkit sources`
      ([with a server](reference/cli.md#with-a-server)).
- For programs and reviews: `validate` with "did you mean" hints, and `describeSource` and
  `describeView` in plain words ([views](concepts/views.md)).

## REST service and container { #rest }

- `pivotkit-server` ([getting started](getting-started/rest.md), [pivotkit-server](reference/rest.md),
  [tokens and keys](reference/rest.md#credentials),
  [reading check-config](reference/rest.md#check-config), [security](security.md#rest),
  [privacy](privacy.md)):
    - The same operations for programs over HTTP under `/api/v1`: list and describe sources,
      validate, describe and render views, links, and schedule drafts.
    - An OpenAPI 3.1 document made from the same table.
    - Errors as problem documents.
    - Sign-in with tokens or OAuth 2.1. The server can issue tokens that expire on their own
      ([signed tokens](reference/rest.md#signed-tokens)). It also takes short-lived tokens another
      system issues for its signed-in person, such as PowerShell Universal
      ([tokens from another system](reference/rest.md#external-issuers)).
    - With OAuth, people sign in from the command line with a code in the browser: `pivotkit login`,
      then `pivotkit token` for curl or PowerShell
      ([sign in from the command line](reference/rest.md#sign-in-cli)).
    - Policy profiles per token, OAuth client, group or scope, and a default profile. A profile can
      allow more values, downloads, and data sent with the request as JSON or as a csv, tsv, json or
      xlsx file.
    - The person in the log only when the operator asks for it.
    - CORS off by default, and limits per caller.
    - `check-config` says whether the server starts. It prints each field's level per source and
      profile.
    - `token new` and `key new` make tokens and keys into files only their owner can read. `--add`
      puts a token into the configuration.
    - `token list`, `token revoke` and `token remove` manage tokens without showing a value
      ([list, revoke, remove](reference/rest.md#token-list)).
- Sources for both services ([data sources](reference/sources.md)):
    - data files
    - an operator's API as an HTTP source
    - a library host's code sources
- An HTTP source offers:
    - its address written once, with typed parameters a caller fills
    - paging, and data kept per caller
    - a sign-in to the backend by a secret header, OAuth client credentials, or a token exchange for
      the signed-in person
    - parameters bound to a claim of the sign-in
    - `pivotkit-server check-source` to test it
    - `pivotkit-server source-from-openapi` to start from the API's OpenAPI document
- Download links ([download links](reference/delivery.md)):
    - The server serves each report for a while under a link that expires.
    - For sources whose fields are not all shown, only the person who asked gets the report, after
      signing in with your identity provider.
    - Or the report is uploaded to a store you run, through a presign service or an address
      template. The result holds the store's link ([upload](reference/delivery.md#upload)).
- One container image for the REST service, the MCP server and the command line
  ([server in 5 minutes](getting-started/server-in-5-minutes.md),
  [made at the first start](reference/rest.md#first-start), [container image](reference/container.md),
  [Kubernetes](getting-started/kubernetes.md)):
    - Distroless Node 22, non-root, read-only, with health checks.
    - Signed, with provenance and an SBOM.
    - One `docker run` serves example data. At its first start the server makes a token and the
      download links' key and keeps them in a volume. `token show` reads the token back.
- A log for operations ([operations and logs](reference/operations.md)):
    - JSON lines, or text on a terminal.
    - Level, severity, request and trace ids, the client's address, the outcome and a refused
      request's reason.
    - `X-Request-Id` on every answer.
    - Examples for Docker's `gelf` and `syslog` drivers.

## AI clients (MCP) { #mcp }

- `pivotkit-mcp` ([getting started](getting-started/mcp.md), [pivotkit-mcp](reference/mcp.md), [security](security.md#mcp)):
    - Tools to list and describe sources, and to suggest a draft view.
    - Tools to write views, or lay them out by field names, and to validate and describe them.
    - Tools to render reports into files, make links and draft schedules.
    - Through pivotkit, the model reads only what the policy shows. A client with file tools can
      [reach more](model-data.md#beyond-policy).
- An exposure policy per field ([what reaches an AI model](model-data.md), [exposure policy](reference/mcp.md#policy)):

    | Level | The model gets |
    | --- | --- |
    | `show` | values and results |
    | `values` | a category's values as a complete list, so the model filters on exact names, but no result |
    | `summary`, the default | name, type and counts |
    | `hide` | nothing |

    - An automatic `values` rule for category fields. It is off by default, and `check-config`
      previews it.
    - Results over fields that are not shown stay in the file.
- One server, different rules per client: a profile per token, OAuth client, group or scope, and a
  default profile. So a cloud assistant sees less than a model on your own hardware
  ([per client](model-data.md#per-client)).
- A result only in the answer, saved nowhere: `render_view` with `save: false` returns a small csv
  or json over shown fields inline. It writes no file ([inline only](reference/mcp.md#inline-only)).
  Its numbers are rounded as the view shows them, in the caller's `locale`, and a csv can have one
  header row.
- More ([data in the request](reference/mcp.md#data)):
    - When the data is from (`dataAsOf`), in every result and in the html and xlsx files the
      services write.
    - The request id in every result, to find its log line.
    - A small table of the model's own (`inline:`). It is capped, and `mcp.data: false` switches it
      off.
    - stdio and Streamable HTTP with a token or OAuth 2.1.
    - A skill that teaches the workflow.

## Security { #security }

- The exposure policy decides what an AI model and its provider receive, per field and per client.
  Operators get a list of what is processed where, for how long and for whom
  ([what reaches an AI model](model-data.md), [privacy for operators](privacy.md)).
- What protects the report ([security](security.md)):
    - A view holds names only, and the values chosen in its filters.
    - A view is checked against fixed lists and limits, and cannot run code.
    - A loaded file is checked before it is parsed.
    - Exports are safe to open.
    - Data is written as text, never markup.
    - A strict CSP works.
- pivotkit is not access control: send only the rows a viewer may see.

## Limits and performance { #limits }

- Rows, groups, cells and work are capped before anything big is allocated. Links are capped while
  they are inflated. A loaded file has its own limits ([limits](concepts/limits.md#limits)).
- Measured up to 1,000,000 rows in three browsers on one Mac. Heavy parts load on first use
  ([measured in the browser](concepts/limits.md#measured-in-the-browser),
  [bundle size](reference/element.md#bundle-size)).

## Packages and integrations { #embedding }

<span id="props-and-attributes"></span>

- The packages ([Embed pivotkit](embed/index.md), [pivotkit-element](reference/element.md)):
    - `pivotkit-react`: `<PivotReport>`, for React 18 and 19.
    - `pivotkit-element`: `<pivot-report>` with its own React, for Angular, PHP and plain HTML. It
      has attributes, properties, and `pivot-*` events with `respondWith()`.
    - `pivotkit-core`: the engine, for the browser and Node.
    - `pivotkit-xlsx`, `pivotkit-report`, `pivotkit-cli`, `pivotkit-server` and `pivotkit-mcp`.
- Programs over REST and AI clients through MCP. You set per field what a caller may see
  ([REST service](getting-started/rest.md), [MCP server](getting-started/mcp.md)).
- Recipes ([recipes](embed/recipes.md), [PowerShell Universal](getting-started/react.md#powershell-universal)):
    - bundlers and import maps
    - several reports on one page
    - PowerShell Universal, on the React it provides and as the module `New-UDPivotReport`
- Real data to learn with: weather, countries, earthquakes, Nobel laureates, software end of life
  ([learn with real data](learn.md), [live demo](demo.md)).
