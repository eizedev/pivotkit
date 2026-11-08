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

<p class="hero-install"><code>npm install pivotkit-react react react-dom echarts</code></p>

[Get started](getting-started/react.md){ .md-button .md-button--primary }
[Using the report](guide.md){ .md-button title="For the people who build reports: fields, filters, charts, export" }
[Try the live demo](demo.md){ .md-button }
[Learn with real data](learn.md){ .md-button }
[What pivotkit does](overview.md){ .md-button }
[Feature list](features.md){ .md-button }
[Source on GitHub](https://github.com/eizedev/pivotkit){ .md-button }

</div>

![The pivot report in the light theme with real weather data: field list on the left, the Filters, Columns, Rows and Values zones, and the average temperature of 14 cities by month as a colour scale](assets/screenshots/report-light.png#only-light)
![The pivot report in the dark theme with real weather data: field list on the left, the Filters, Columns, Rows and Values zones, and the average temperature of 14 cities by month as a colour scale](assets/screenshots/report-dark.png#only-dark)

<small>Weather data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)); contains modified Copernicus Climate Change Service information ([attribution](learn.md#query-it-live)).</small>

<div class="cards" markdown>

- [**React**](getting-started/react.md)<br>`<PivotReport>` for React 18 and 19. React and ECharts come from your app, so the page has one copy of each.
- [**Web component**](getting-started/web-component.md)<br>`<pivot-report>` with its own React, for Angular, PHP and plain HTML pages. ECharts loads on the first chart.
- [**PowerShell Universal**](getting-started/react.md#powershell-universal)<br>pivotkit-react runs on the React 18.3.1 that PowerShell Universal provides to its components; the module [PowerShellUniversal.Component.Pivot](https://powershell-universal-components.eize.dev/pivot/) brings it ready-made as `New-UDPivotReport`.
- [**Engine only**](getting-started/engine.md)<br>`pivotkit-core`: pivot tables, grids, chart options and XLSX/CSV export in plain JavaScript, in the browser or in Node.

</div>

## Three packages

| Package | What it is | Use it when |
| --- | --- | --- |
| [`pivotkit-react`](reference/react.md) | The report builder as a React component: field list, drag and drop, table and chart, filters, drill-down, undo, saved views and sharing, export. | Your page is a React app (or a host that renders React components). |
| [`pivotkit-element`](reference/element.md) | The same report builder as the web component `<pivot-report>`, with React bundled inside a shadow root. | Your page has no React: Angular, PHP and other server-rendered pages, plain HTML. |
| [`pivotkit-core`](reference/core.md) | The engine without UI: typed encoding, pivot computation, subtotals and totals, "show values as", filters, date grouping, grids, ECharts options, XLSX and CSV. | You draw your own UI, or build reports on a server. |

## Quick start

=== "React"

    ```jsx
    import { PivotReport } from "pivotkit-react";
    import "pivotkit-react/styles.css";

    <PivotReport
        data={rows}
        defaultView={{ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }}
        onViewChange={save}
    />
    ```

=== "Web component"

    `/assets/pivotkit-element/dist/` is the package's `dist/` directory, copied from
    `node_modules/pivotkit-element/dist/` after `npm install pivotkit-element`
    ([details](getting-started/web-component.md)).

    ```html
    <script type="module" src="/assets/pivotkit-element/dist/index.js"></script>
    <pivot-report default-view='{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]}'></pivot-report>
    <script type="module">
        const report = document.querySelector("pivot-report");
        report.data = rows;
        report.addEventListener("pivot-view-change", (e) => save(e.detail.view));
    </script>
    ```

=== "Engine"

    ```js
    import { encode, computePivot, toGrid } from "pivotkit-core";
    import { toXlsx } from "pivotkit-core/export";

    const data = encode(rows);
    const result = computePivot(data, { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] });
    const xlsx = toXlsx(toGrid(result));   // Uint8Array
    ```

`rows` is an array of plain objects, one per record. Each key is a field the user can drag.

## What people can do with it

- Drag fields into **Rows**, **Columns**, **Values** and **Filters**, or use the menu on every field:
  drag and drop is never the only way.
- Sum, count, average, median, minimum, maximum, distinct count and the usual statistics; show a value
  as a percentage of a total, a running total, a difference or a rank.
- Group dates by year, quarter, month, week, day or hour, and numbers into ranges.
- Filter by values with their row counts, by a text condition, by a value condition or to the top N.
- Click a number to see the rows behind it.
- Switch to a bar, line, area, pie, donut or heatmap chart, with value labels, legend, title and group labels.
- Undo and redo every step, save the report as a view, share it as a link, as JSON or as a view file,
  export to Excel, CSV and PNG.
- Use it with a keyboard and a screen reader, in English or German, light or dark, from a phone to a
  wide screen.

[Using the report](guide.md) describes all of it for the people who use the report; [What pivotkit
does](overview.md) has it on one page for users and developers, and the [feature list](features.md)
every behaviour with its details.

## Designed for

- **Up to about 100,000 rows** in the browser: typed columns, no object per row in the hot loops. A
  change stays within a frame or two (see [Performance](reference/react.md#performance)).
- **Safe input**: a view is user input. It holds names only, cannot run code and is checked against
  limits before anything big is allocated. Exports are safe to open. See [Security](security.md).
- **Excel as the reference**: subtotals, "show values as", top N and the export behave as people know
  them from Excel's PivotTable; the [concepts](concepts/views.md) name the few places that differ.

## License

MIT. Charts are drawn with [Apache ECharts](https://echarts.apache.org/) (Apache-2.0); pivotkit-element
bundles React, ReactDOM, @dnd-kit, ECharts, zrender, tslib and fflate under their own licenses, listed
in its `dist/THIRD_PARTY_LICENSES.txt`. Icon and header are made in
[eizedev/brand](https://github.com/eizedev/brand) and licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
