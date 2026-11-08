---
title: Embed pivotkit
description: For developers - which of the three pivotkit packages fits your page, a first report in a few lines for React, the web component and the engine, and where to go next.
---

# Embed pivotkit

pivotkit comes as three npm packages. Pick the one that fits your page, put a first report on it in a
few lines, then follow the getting-started page of that package step by step.

## Which package

| Package | What it is | Use it when |
| --- | --- | --- |
| [`pivotkit-react`](../reference/react.md) | The report builder as a React component: field list, drag and drop, table and chart, filters, drill-down, undo, saved views and sharing, export. | Your page is a React app (or a host that renders React components). |
| [`pivotkit-element`](../reference/element.md) | The same report builder as the web component `<pivot-report>`, with React bundled inside a shadow root. | Your page has no React: Angular, PHP and other server-rendered pages, plain HTML. |
| [`pivotkit-core`](../reference/core.md) | The engine without UI: typed encoding, pivot computation, subtotals and totals, "show values as", filters, date grouping, grids, ECharts options, XLSX and CSV. | You draw your own UI, or build reports on a server. |

<div class="cards" markdown>

- [**React**](../getting-started/react.md)<br>`<PivotReport>` for React 18 and 19. React and ECharts come from your app, so the page has one copy of each.
- [**Web component**](../getting-started/web-component.md)<br>`<pivot-report>` with its own React, for Angular, PHP and plain HTML pages. ECharts loads on the first chart.
- [**PowerShell Universal**](../getting-started/react.md#powershell-universal)<br>pivotkit-react runs on the React 18.3.1 that PowerShell Universal provides to its components; the module [PowerShellUniversal.Component.Pivot](https://powershell-universal-components.eize.dev/pivot/) brings it ready-made as `New-UDPivotReport`.
- [**Engine only**](../getting-started/engine.md)<br>`pivotkit-core`: pivot tables, grids, chart options and XLSX/CSV export in plain JavaScript, in the browser or in Node.

</div>

## A first report

=== "React"

    ```bash
    npm install pivotkit-react react react-dom echarts
    ```

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
    ([details](../getting-started/web-component.md)).

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

## Next steps

1. Follow the getting-started page of your package in small steps:
   [React](../getting-started/react.md), [web component](../getting-started/web-component.md) or
   [engine only](../getting-started/engine.md).
2. Look up a task in the [recipes](recipes.md): keep the view, save views on a server, share links,
   field descriptions, chart options, theming.
3. Read the [concepts](../concepts/views.md) behind the report: the view, templates, values, dates,
   filters, fields, charts, sharing and limits.
4. Look up every prop, attribute and function in the reference:
   [pivotkit-core](../reference/core.md), [pivotkit-react](../reference/react.md),
   [pivotkit-element](../reference/element.md), the [view file](../reference/view-file.md).
5. Point the people who use your report to [Use a report](../use/index.md).
