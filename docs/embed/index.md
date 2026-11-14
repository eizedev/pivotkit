---
title: Embed pivotkit
description: For developers and the people who run applications with pivotkit - which of the six pivotkit packages fits, a first report in a few lines for React, the web component, the engine, reports in code and the command line, what a host switches on or off, and where to go next.
---

# Embed pivotkit

pivotkit comes as six npm packages: three to show the report, one plugin to read Excel files, two to
make reports without a browser. Pick the one that fits, put a first report on it in a few lines,
then follow its getting-started page step by step.

## Which package

| Package | What it is | Use it when |
| --- | --- | --- |
| [`pivotkit-react`](../reference/react.md) | The report builder as a React component: field list, drag and drop, table and chart, filters, drill-down, undo, saved views and sharing, export. | Your page is a React app (or a host that renders React components). |
| [`pivotkit-element`](../reference/element.md) | The same report builder as the web component `<pivot-report>`, with React bundled inside a shadow root. | Your page has no React: Angular, PHP and other server-rendered pages, plain HTML. |
| [`pivotkit-core`](../reference/core.md) | The engine without UI: typed encoding, pivot computation, subtotals and totals, "show values as", filters, date grouping, grids, ECharts options, XLSX and CSV, reading CSV and JSON files. | You draw your own UI, or compute pivots in your own code. |
| [`pivotkit-xlsx`](../reference/plugins.md#pivotkit-xlsx) | A reader plugin for Excel workbooks (.xlsx), checked before it is parsed. | People load Excel files into the report (`allowImport`), or your code reads them. |
| [`pivotkit-report`](../reference/report.md) | A view over rows as a file without a browser: HTML report, CSV, JSON, XLSX, SVG. | A script, a job or a server makes report files. |
| [`pivotkit-cli`](../reference/cli.md) | The command line `pivotkit`: render, validate and describe views. | Reports and view checks in a terminal or CI, without code. |

<div class="cards" markdown>

- [**React**](../getting-started/react.md)<br>`<PivotReport>` for React 18 and 19. React and ECharts come from your app, so the page has one copy of each.
- [**Web component**](../getting-started/web-component.md)<br>`<pivot-report>` with its own React, for Angular, PHP and plain HTML pages. ECharts loads on the first chart.
- [**PowerShell Universal**](../getting-started/react.md#powershell-universal)<br>pivotkit-react runs on the React 18.3.1 that PowerShell Universal provides to its components; the module [PowerShellUniversal.Component.Pivot](https://powershell-universal-components.eize.dev/pivot/) brings it ready-made as `New-UDPivotReport`.
- [**Engine only**](../getting-started/engine.md)<br>`pivotkit-core`: pivot tables, grids, chart options and XLSX/CSV export in plain JavaScript, in the browser or in Node.
- [**Reports in code**](../getting-started/report.md)<br>`pivotkit-report`: a view and rows to an HTML report, CSV or Excel in Node.
- [**Command line**](../getting-started/cli.md)<br>`pivotkit-cli`: `pivotkit example`, then `pivotkit render` and `validate` in a terminal or CI.

</div>

Coming from 0.4? [Upgrading from 0.4](../getting-started/upgrading.md) lists what a host checks.


## A first report

=== "React"

    ```bash
    npm install pivotkit-react react react-dom echarts
    ```

    ```jsx
    import { PivotReport } from "pivotkit-react";
    import "pivotkit-react/styles.css";

    const rows = [{ Region: "North", Sales: 120 }, { Region: "South", Sales: 340 }];
    const save = (view) => localStorage.setItem("view", JSON.stringify(view));

    export const Report = () => <PivotReport
        data={rows}
        defaultView={{ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }}
        onViewChange={save}
    />;
    ```

    A whole app to copy, with Vite: [getting started with React](../getting-started/react.md#a-complete-app).

=== "Web component"

    `/assets/pivotkit-element/dist/` is the package's `dist/` directory, copied from
    `node_modules/pivotkit-element/dist/` after `npm install pivotkit-element`
    ([details](../getting-started/web-component.md)).

    ```html
    <script type="module" src="/assets/pivotkit-element/dist/index.js"></script>
    <pivot-report default-view='{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]}'></pivot-report>
    <script type="module">
        const report = document.querySelector("pivot-report");
        report.data = [{ Region: "North", Sales: 120 }, { Region: "South", Sales: 340 }];
        report.addEventListener("pivot-view-change", (e) => localStorage.setItem("view", JSON.stringify(e.detail.view)));
    </script>
    ```

    A whole page to copy: [getting started with the web component](../getting-started/web-component.md#a-complete-page).

=== "Engine"

    ```js
    import { encode, computePivot, toGrid } from "pivotkit-core";
    import { toXlsx } from "pivotkit-core/export";

    const rows = [{ Region: "North", Sales: 120 }, { Region: "South", Sales: 340 }];
    const data = encode(rows);
    const result = computePivot(data, { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] });
    const xlsx = toXlsx(toGrid(result));   // Uint8Array
    ```

=== "Command line"

    ```bash
    npx pivotkit-cli example                  # sales.csv and two views in this directory
    npx pivotkit-cli render sales.pivotkit.json --data sales.csv -o sales.html
    ```

`rows` is an array of plain objects, one per record; each key is a field the user can drag. The
getting-started pages have complete projects to copy and run (the engine's in an ES module:
`"type": "module"` in `package.json`, or a `.mjs` file).

## What a host switches on

Off by default, so a host decides: `allowImport` (people load their own file into the report:
[load your own data](../use/load-data.md)), `exportData` (Export → Source data, every row as CSV or
JSON: [export](../use/export.md#the-table-or-the-rows-behind-it)), `shareLink` and `persistView`
(links and the tab's view: [sharing](../concepts/sharing.md)), `templateStore` (views in the browser).
On by default and switched off with a prop: `drillDown` (the rows behind a value), the tips (`tips`).
Every file and copy passes `onExport` first ([React props](../reference/react.md#props)).

Every row and column you pass can be seen and exported: filters and templates are no permissions.
Send only what this viewer may see, filtered on your server
([pivotkit is not access control](../security.md#pivotkit-is-not-access-control)).

## Next steps

1. Follow the getting-started page of your package in small steps:
   [React](../getting-started/react.md), [web component](../getting-started/web-component.md),
   [engine only](../getting-started/engine.md), [reports in code](../getting-started/report.md) or the
   [command line](../getting-started/cli.md).
2. Look up a task in the [recipes](recipes.md): keep the view, save views on a server, share links,
   field descriptions, chart options, theming.
3. Read the [concepts](../concepts/views.md) behind the report: the view, templates, values, dates,
   filters, fields, charts, sharing and limits.
4. Look up every prop, attribute and function in the reference:
   [pivotkit-core](../reference/core.md), [pivotkit-react](../reference/react.md),
   [pivotkit-element](../reference/element.md), the [view file](../reference/view-file.md).
5. Point the people who use your report to [Use a report](../use/index.md).
