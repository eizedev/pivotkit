---
title: Overview
description: pivotkit is a pivot report builder for the web - drag-and-drop fields, table and chart, filters, drill-down, views as JSON files and native Excel export - as a JavaScript engine, a React component and a web component.
hide:
  - navigation
  - toc
---

<div class="hero" markdown>

<p class="hero-kicker">Pivot tables · React · Web component · Excel export</p>

# pivotkit

<p class="hero-lead">A pivot report builder for the web, with Excel's PivotTable as the reference: people drag fields into rows, columns and values, filter, drill into the rows behind a number, switch to a chart and export to Excel - and the whole report is a small JSON object you can save, share as a link or a file and load again.</p>

[I build reports](use/index.md){ .md-button .md-button--primary title="For the people who build reports in an application: fields, filters, charts, export" }
[I embed pivotkit](embed/index.md){ .md-button .md-button--primary title="For developers: React, web component, engine" }
[Try the live demo](demo.md){ .md-button }

</div>

![The pivot report in the light theme with real weather data: field list on the left, the Filters, Columns, Rows and Values zones, and the average temperature of 14 cities by month as a colour scale](assets/screenshots/report-light.png#only-light)
![The pivot report in the dark theme with real weather data: field list on the left, the Filters, Columns, Rows and Values zones, and the average temperature of 14 cities by month as a colour scale](assets/screenshots/report-dark.png#only-dark)

<small>Weather data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)); contains modified Copernicus Climate Change Service information ([attribution](learn.md#query-it-live)).</small>

<div class="grid" markdown>

<div markdown>

## For the people who build reports

<span id="what-people-can-do-with-it"></span>

Start with the [quick start](use/quick-start.md) (your first report in six steps), then
[learn with real data](learn.md). Every task has a page of its own:

- Drag fields into **Rows**, **Columns**, **Values** and **Filters**, or use the menu every field
  has: drag and drop is never the only way ([fields and zones](use/fields.md)).
- Sum, count, average, median, minimum, maximum, distinct count and the usual statistics; show a
  value as a share of a total, a running total, a difference or a rank ([values](use/values.md)).
- Dates are grouped by year, quarter, month, week, day or hour as soon as they are placed; numbers
  go into ranges ([dates and ranges](use/values.md#dates-and-number-ranges)).
- Filter a field by its values with their row counts, a text condition, a value condition ("Sum of
  Revenue > 1,000") or its top N; the menu says what a filter keeps ([filters](use/filters.md)).
- Click a number to see the rows behind it, then copy or download them ([drill-down](use/drill-down.md)).
- Switch to a chart: the type follows the data (lines over dates, else bars) until you pick bars,
  lines, area, pie, donut or heatmap, with value labels, legend, title and group labels
  ([charts](use/charts.md)).
- Undo and redo every step; Reset goes back to the start, New empties the report. Pick a shared view
  or one of your own under Views, save changes to it with one click or under a new name, publish it
  for everyone where allowed, or share it as a link, as JSON or as a
  view file; a view for other data asks first ([views and sharing](use/views.md)).
- Export the table to Excel or CSV and the chart to PNG, or copy the table into a spreadsheet
  ([export and copy](use/export.md)).
- Enlarge the result or put the report on the full screen; tips, one at a time, say what the report
  shows and what to do next; an "i" explains each zone, field and setting that needs it, a field's
  menu says on its first level what is set and opens each topic in a level of its own, and every text
  field in a menu has an × that empties it
  ([small screens, menus and tips](use/layout.md)).
- Works with a keyboard and a screen reader, from a phone to a wide screen
  ([keyboard](use/keyboard.md)), in English and German, light and dark.

</div>

<div markdown>

## For developers

<span id="quick-start"></span><span id="three-packages"></span>

```bash
npm install pivotkit-react react react-dom echarts
```

Start with [Embed pivotkit](embed/index.md): which package fits, and a first report in a few lines.

- One React component, `<PivotReport>`, for React 18 and 19 ([React](getting-started/react.md)).
- The web component `<pivot-report>` for pages without React: Angular, PHP, plain HTML ([web component](getting-started/web-component.md)).
- Runs in PowerShell Universal on the React it provides ([PowerShell Universal](getting-started/react.md#powershell-universal)), ready-made as `New-UDPivotReport` in [PowerShellUniversal.Component.Pivot](https://powershell-universal-components.eize.dev/pivot/).
- The engine alone, in the browser or in Node: pivots, grids, chart options, XLSX and CSV ([engine](getting-started/engine.md)).
- The report is a JSON view: store it, pass it back, controlled or not ([views](concepts/views.md)).
- A view is user input: names only, checked against fixed lists and limits, never run ([security](security.md)).
- Field labels, descriptions and links, also from a JSON Schema or OpenAPI document ([fields](concepts/fields.md)).
- `chartOptions` merges plain JSON over the ECharts option, for what the menus do not offer ([charts](concepts/charts.md#chartoptions-for-developers)).
- `shareLink` and `persistView` share and keep views; a view travels as a [view file](reference/view-file.md) with a JSON Schema, `toViewFile` and `fromViewFile` read and write it ([sharing](concepts/sharing.md)).
- Templates in two groups, shared views and my views, kept by the host's callbacks or by the browser (`templateStore`), also from an OpenAPI document's `x-pivotkit-views` ([templates](concepts/templates.md)).
- `source`, `sources` and `onSourceSwitch` name the data a view is made for and let a view for other data switch to it ([sharing](concepts/sharing.md#the-source-of-a-view-for-developers)).
- `loading` shows the skeleton while the host fetches data ([React props](reference/react.md#props)).
- Every file and every copy passes `onExport` first, so the host can keep it ([React props](reference/react.md#props)).
- Theming through `--pk-*` tokens, inside a shadow root too ([theming](reference/theming.md)); every text replaceable, English and German built in ([localisation](reference/localisation.md)).
- Designed for about 100,000 rows; heavy parts load on first use ([performance](reference/react.md#performance), [bundle size](reference/element.md#bundle-size)).

</div>

</div>

Every behaviour, also the small ones, is in the [feature list](features.md), with a link to its page.

## Designed for

- **Up to about 100,000 rows** in the browser: typed columns, no object per row in the hot loops. A
  change stays within a frame or two (see [Performance](reference/react.md#performance)).
- **Safe input**: a view is user input. It holds names only, cannot run code and is checked against
  limits before anything big is allocated. Exports are safe to open. See [Security](security.md).
- **Excel as the reference**: subtotals, "show values as", top N and the export behave as people know
  them from Excel's PivotTable; the [concepts](concepts/views.md) name the few places that differ.

## License

MIT. The source is on [GitHub](https://github.com/eizedev/pivotkit). Charts are drawn with
[Apache ECharts](https://echarts.apache.org/) (Apache-2.0); pivotkit-element bundles React, ReactDOM,
@dnd-kit, ECharts, zrender, tslib and fflate under their own licenses, listed in its
`dist/THIRD_PARTY_LICENSES.txt`. Icon and header are made in
[eizedev/brand](https://github.com/eizedev/brand) and licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
