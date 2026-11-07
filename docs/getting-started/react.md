---
title: Getting started with React
description: Install pivotkit-react, render <PivotReport> with your rows, keep the view in your app, offer saved views and react to clicks - for React 18 and 19, and PowerShell Universal.
---

# Getting started with React

`pivotkit-react` is the report builder as the React component `<PivotReport>`, for React 18 and 19.

## Install

```bash
npm install pivotkit-react react react-dom echarts
```

React, ReactDOM and Apache ECharts are **peer dependencies**: your app provides them, so the page has
one copy of each. pivotkit-core and @dnd-kit come with the package.

| Peer | Range | Why it is a peer |
| --- | --- | --- |
| `react`, `react-dom` | `>=18.2 <20` | Hooks break with two copies of React in one page. Every browser test runs on React 18 and on React 19. |
| `echarts` | `>=6.1.0 <7` | About 1 MB; an app that draws its own charts has it already. It is loaded on the first chart, so a report that never shows one does not load it. |

!!! note "Using pivotkit-core directly as well"
    pivotkit-react depends on a caret range of pivotkit-core (`^0.1.0`). In 0.x a caret range spans
    patch versions only (`^0.1.0` is 0.1.x), so an app that imports pivotkit-core itself must use a
    version inside that range; npm shares one copy only when the ranges overlap.

## The first report

```jsx
import { PivotReport } from "pivotkit-react";
import "pivotkit-react/styles.css";

const rows = [
    { Region: "North", Product: "A", Sales: 120, Date: "2026-01-05" },
    { Region: "South", Product: "B", Sales: 340, Date: "2026-02-14" }
    // ...
];

export function SalesReport() {
    return (
        <PivotReport
            data={rows}
            defaultView={{ rows: ["Region"], cols: ["Product"], values: [{ field: "Sales", agg: "sum" }] }}
            height={640}
        />
    );
}
```

- `data` is an array of plain objects. Every key is a field; numbers, text, booleans and dates
  (`Date` objects or ISO strings such as `"2026-01-05"`) are recognised by themselves.
- `defaultView` is the start: a [view](../concepts/views.md), plain JSON. Leave it out and the report
  starts empty with a short guide.
- Import `pivotkit-react/styles.css` once. Every colour and size is a `--pk-*` token you can
  [override](../reference/theming.md).
- `height` is the report's height (default 640 px); the table and the field list scroll inside it.

## Keep the view in your app

To store the report, or start it from a saved one, make it **controlled**: pass `view` and set it
from `onViewChange`. The undo history stays inside the report however often your app renders.

```jsx
import { useState } from "react";

export function TicketReport({ rows, saved, saveTemplate, deleteTemplate }) {
    const [view, setView] = useState(presets[0].view);
    return (
        <PivotReport
            data={rows}
            dataKey="tickets"
            view={view}
            onViewChange={setView}
            templates={[...presets, ...saved.map((t) => ({ ...t, deletable: true }))]}
            onSaveTemplate={(name, v) => saveTemplate({ name, view: v })}
            onDeleteTemplate={(name, { scope }) => deleteTemplate(name, scope)}
            fieldDefaults={{ "Lead hours": { agg: "average", format: "duration:h" } }}
            onCellClick={({ row, col, count }) => console.log(row, col, count)}
            locale="de-DE"
        />
    );
}

const presets = [
    { name: "Tickets per team", view: { rows: ["Team"], cols: ["Priority"], values: [{ field: "Ticket", agg: "count" }] } }
];
```

- `dataKey` tells the report when the data is new. An app that builds a new array on every render
  passes a key, and the rows are encoded again only when it changes.
- `templates` fill the Views menu, in two groups: Shared views (the presets) and My views (the
  `deletable` ones); `onSaveTemplate` adds "Save current view". Both callbacks may return a promise:
  the report shows "Saved" when it resolves and an error when it rejects. Without a server,
  `templateStore="browser"` keeps the user's views in the browser; shared views, publishing and
  views from an OpenAPI document are in [Templates and shared views](../concepts/templates.md).
- `fieldDefaults` set the aggregator and format a field gets when someone adds it to Values, and
  the custom order of its items (`order`) on Rows or Columns.
- `onCellClick` gets every click on a value or a chart point, with the rows behind it.
- `locale` sets numbers, dates and sorting, and the language of the labels (`de-*` is German).
- `source` (`{ id, name }`) names the data: shared views carry it, and a view made for other data
  asks before it is loaded ([Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers)).

All props are listed in the [pivotkit-react reference](../reference/react.md).

## Bundlers and import maps

`dist/index.js` is an ES module whose imports stay bare: `react`, `react-dom`, `pivotkit-core`,
`pivotkit-core/export`, `pivotkit-core/link`, `pivotkit-core/templates` (with the menus),
`@dnd-kit/core` and `@dnd-kit/sortable`. On the first chart it loads
`./echarts.js` next to it, which imports `echarts/core`, `echarts/charts`, `echarts/components` and
`echarts/renderers` by name, so a bundler keeps only the four chart types the report draws. Any
bundler that understands ES modules resolves them. A page without a bundler maps each bare name to a
file with an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap);
the browser tests load the package that way.

The build compiles JSX to `React.createElement`, so the app needs `react` and `react-dom` only, no
JSX runtime.

## PowerShell Universal

PowerShell Universal renders custom components with React 18.3.1, which it provides at runtime.
pivotkit-react fits that model: React and ECharts stay outside the package, the report follows the
`data-theme="light|dark"` attribute that PowerShell Universal sets on `<html>`, and it keeps its undo
history when the host renders it again on every change. The browser tests run it on a host page that
takes React from an import map and renders again all the time, the way PowerShell Universal does.

A ready-made PowerShell Universal component module is not part of pivotkit. A component of your own
bundles pivotkit-react with pivotkit-core, @dnd-kit and ECharts, and leaves React and ReactDOM to
PowerShell Universal.

## Next

- [Using the report](../guide.md): what the people using it can do.
- [Views and saved views](../concepts/views.md): the JSON behind every report.
- [Theming](../reference/theming.md) and [Localisation](../reference/localisation.md).
