---
title: Overview
description: pivotkit is Excel's PivotTable for web applications and the command line - people load their own file, drag fields, filter, chart and export to Excel, and the report is a safe JSON view that renders again in CI. React, web component, engine, CLI; MIT.
hide:
  - navigation
  - toc
---

<div class="hero" markdown>

<p class="hero-kicker">Pivot tables · React · Web component · CLI · Excel export</p>

# pivotkit

<p class="hero-lead">Excel's PivotTable for your web application: people load their data, drag fields into rows, columns and values, and take the result to Excel - and the same report runs again on the command line.</p>

MIT · in the browser, nothing uploaded · React, web component, Node, command line

[I build reports](use/index.md){ .md-button .md-button--primary title="For the people who build reports in an application: load data, fields, filters, charts, export" }
[I embed or automate pivotkit](embed/index.md){ .md-button .md-button--primary title="For developers: React, web component, engine, reports and the command line" }
[Try the live demo](demo.md){ .md-button }

</div>

<div class="grid" markdown>

<figure markdown>
![The pivot report: average temperature of 14 cities by month as a colour scale](assets/screenshots/report-light.png#only-light)
![The pivot report in the dark theme: average temperature of 14 cities by month as a colour scale](assets/screenshots/report-dark.png#only-dark)
<figcaption>The report: fields in Rows, Columns and Values, a colour scale.</figcaption>
</figure>

<figure markdown>
![The preview of a loaded CSV file: its first rows with a type under each column name, notes on what was read, Cancel and Load data](assets/screenshots/import-preview-light.png#only-light)
![The preview of a loaded CSV file in the dark theme: its first rows with a type under each column name, notes on what was read, Cancel and Load data](assets/screenshots/import-preview-dark.png#only-dark)
<figcaption>Your own file: a preview with a type per column before it replaces the data.</figcaption>
</figure>

<figure markdown>
![The same report as an Excel workbook: cities down, months across, Grand Total in bold, numbers as numbers](assets/screenshots/xlsx-result-light.png#only-light)
![The same report as an Excel workbook: cities down, months across, Grand Total in bold, numbers as numbers](assets/screenshots/xlsx-result-dark.png#only-dark)
<figcaption>The same report as a workbook (here in the macOS preview; Excel also shows its colour scale).</figcaption>
</figure>

</div>

<small>Weather data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)); contains modified Copernicus Climate Change Service information ([attribution](learn.md#query-it-live)).</small>

## What it does well

1. **Bring your own file.** Drop a CSV, JSON or Excel file onto the report: a preview shows a type
   under each column, lets you change it and pick the sheet of a workbook; German numbers and dates,
   title lines above the header and leading zeros ("01067") are read right; Undo brings the
   application's data back. Nothing is uploaded ([load your own data](use/load-data.md)).
2. **Filters that say what they keep.** Pick items with their row counts, take "last 3 months" or
   "this quarter" that stay right over time, a top 10 with ties, or a rule on a total ("Sum of
   Revenue > 1,000"); each one says how many items it keeps ([filters](use/filters.md)).
3. **Excel with the layout kept.** The workbook keeps merged headers, bold totals, number formats,
   and colour scales and data bars as Excel's own conditional formats. Next to the table's exports,
   the rows behind it download as CSV or JSON for your own analysis
   ([export](use/export.md), [the table or the rows](use/export.md#the-table-or-the-rows-behind-it)).
4. **Keyboard and screen reader for every action.** Every step has a button or a menu entry, drag
   and drop is never the only way, chips move with the arrow keys and say where they are
   ([keyboard and screen readers](use/keyboard.md)).
5. **Safe views, reports without a browser.** A report is a small JSON view that holds names only and
   cannot run code ([security](security.md#views-are-untrusted-input)); `pivotkit render` makes the
   same report from it on the command line or in CI, as HTML, CSV or Excel
   ([command line](getting-started/cli.md)).

<div class="grid" markdown>

<div markdown>

## For the people who build reports { #for-the-people-who-build-reports }

<span id="what-people-can-do-with-it"></span>

Your first report in six steps: the [quick start](use/quick-start.md). Then
[learn with real data](learn.md) (weather, countries, earthquakes, Nobel laureates, software end of
life), or [load your own](use/load-data.md). Every task has its page under
[Use a report](use/index.md); every feature is in the [feature list](features.md).

</div>

<div markdown>

## For developers { #for-developers }

<span id="quick-start"></span><span id="three-packages"></span>

| You want | Start here |
| --- | --- |
| The report in a React 18 or 19 app | [React](getting-started/react.md): `npm install pivotkit-react react react-dom echarts` |
| The report on a page without React (Angular, PHP, plain HTML) | [Web component](getting-started/web-component.md): `<pivot-report>` |
| Pivots, grids and exports in your own code, browser or Node | [Engine](getting-started/engine.md): `pivotkit-core` |
| Reports as files from a script or a server | [Reports in code](getting-started/report.md): `pivotkit-report` |
| Reports and view checks in a terminal or CI | [Command line](getting-started/cli.md): `pivotkit example` |

Which package fits, PowerShell Universal and the recipes: [Embed pivotkit](embed/index.md).

</div>

</div>

!!! note "What pivotkit does not do"

    - It fetches no data and makes no network request: the application passes the rows, or a person
      loads a file ([FAQ](faq.md#my-data-is-on-a-server-does-pivotkit-fetch-it)).
    - It is not access control: whoever sees the report can read every row the application passes
      ([security](security.md#pivotkit-is-not-access-control)).
    - It computes on the page, not in WebAssembly or on a server: measured up to 1,000,000 rows, where
      the first table takes 1 to 2.5 s and the page waits meanwhile; for more, aggregate on the server
      first ([limits](concepts/limits.md#measured-in-the-browser)).
    - It draws bars, lines, area, pie, donut and heatmap, not dozens of chart types, and ships English
      and German (every text replaceable) ([charts](use/charts.md), [localisation](reference/localisation.md)).
    - It is a pivot report, not a data grid, a dashboard tool or a BI server
      ([comparison](compare.md)).

## License

MIT. The source is on [GitHub](https://github.com/eizedev/pivotkit). Charts are drawn with
[Apache ECharts](https://echarts.apache.org/) (Apache-2.0); pivotkit-element bundles React, ReactDOM,
@dnd-kit, ECharts, zrender, tslib and fflate under their own licenses, listed in its
`dist/THIRD_PARTY_LICENSES.txt`. Icon and header are made in
[eizedev/brand](https://github.com/eizedev/brand) and licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
