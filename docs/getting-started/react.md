---
title: Getting started with React
description: Install pivotkit-react, render <PivotReport> with your rows, keep the view in your app, offer saved views and react to clicks - for React 18 and 19, and PowerShell Universal.
---

# Getting started with React

`pivotkit-react` is the report builder as the React component `<PivotReport>`, for React 18 and 19.

You put a report into a React app in a few steps: install the package, render `<PivotReport>` with
your rows, then add what your app needs - keep the view, save views, react to clicks. Each step adds
one or two props to the one before it.

## 1. Install { #install }

```bash
npm install pivotkit-react react react-dom echarts
```

React, ReactDOM and Apache ECharts are **peer dependencies**: your app provides them, so the page has
one copy of each. pivotkit-core (a caret range) and `@dnd-kit/core` and `@dnd-kit/sortable` (pinned
exactly) come with the package.

| Peer | Range | Why it is a peer |
| --- | --- | --- |
| `react`, `react-dom` | `>=18.2 <20` | Hooks break with two copies of React in one page. Every browser test runs on React 18 and on React 19. |
| `echarts` | `>=6.1.0 <7` | About 1 MB; an app that draws its own charts has it already. It is loaded on the first chart, so a report that never shows one does not load it. |

!!! note "Using pivotkit-core directly as well"
    pivotkit-react depends on a caret range of pivotkit-core (`^0.4.0`). In 0.x a caret range spans
    patch versions only (`^0.4.0` is 0.4.x), so an app that imports pivotkit-core itself must use a
    version inside that range; npm shares one copy only when the ranges overlap.

## 2. Render the first report { #the-first-report }

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

## 3. Keep the view in your app { #keep-the-view-in-your-app }

To store the report, or start it from a saved one, make it **controlled**: pass `view` and set it
from `onViewChange`. The undo history stays inside the report however often your app renders.

```jsx
import { useState } from "react";

export function TicketReport({ rows }) {
    const [view, setView] = useState(presets[0].view);
    return <PivotReport data={rows} view={view} onViewChange={setView} />;
}

const presets = [
    { name: "Tickets per team", view: { rows: ["Team"], cols: ["Priority"], values: [{ field: "Ticket", agg: "count" }] } }
];
```

Store `view` wherever your app keeps settings; it is plain JSON.

## 4. Tell the report when the data is new { #data-key }

```jsx
<PivotReport data={rows} dataKey="tickets" view={view} onViewChange={setView} />
```

`dataKey` tells the report when the data is new. An app that builds a new array on every render
passes a key, and the rows are encoded again only when it changes.

## 5. Offer saved views { #saved-views }

```jsx
<PivotReport
    data={rows}
    dataKey="tickets"
    view={view}
    onViewChange={setView}
    templates={[...presets, ...saved.map((t) => ({ ...t, scope: "user", deletable: true }))]}
    onSaveTemplate={(name, v) => saveTemplate({ name, view: v })}
    onDeleteTemplate={(name, { scope }) => deleteTemplate(name, scope)}
/>
```

`templates` fill the Views menu, in two groups: Shared views (the presets) and My views (the
`deletable` ones); `onSaveTemplate` adds "Save current view" and Save for a loaded view of the user's (it may get a name that exists: replace that view). Both callbacks may return a promise: the
report shows "Saved" when it resolves and an error when it rejects. Without a server,
`templateStore="browser"` keeps the user's views in the browser; shared views, publishing and views
from an OpenAPI document are in [Templates and shared views](../concepts/templates.md).

## 6. Set what a field gets { #field-defaults }

```jsx
<PivotReport
    data={rows}
    fieldDefaults={{ "Lead hours": { agg: "average", format: "duration:h" } }}
/>
```

`fieldDefaults` set the aggregator and format a field gets when someone adds it to Values, and the
custom order of its items (`order`) on Rows or Columns. Labels, descriptions and links of fields are
in [Field descriptions and names](../concepts/fields.md).

## 7. React to clicks { #cell-clicks }

```jsx
<PivotReport data={rows} onCellClick={({ row, col, count }) => console.log(row, col, count)} />
```

`onCellClick` gets every click on a value or a chart point, with the rows behind it.

## 8. Language and the data's name { #locale-and-source }

```jsx
<PivotReport data={rows} locale="de-DE" source={{ id: "tickets", name: "Tickets" }} />
```

- `locale` sets numbers, dates and sorting, and the language of the labels (`de-*` is German).
- `source` (`{ id, name }`) names the data: shared views carry it, and a view made for other data
  asks before it is loaded ([Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers)).

All props are listed in the [pivotkit-react reference](../reference/react.md).

## Bundlers and import maps

`dist/index.js` is an ES module whose imports stay bare: `react`, `react-dom`, `pivotkit-core`,
`pivotkit-core/export`, `pivotkit-core/link`, `pivotkit-core/templates` (with the menus),
`pivotkit-core/import` (with [`allowImport`](../reference/react.md#prop-allowimport), on the first
use of loading data), `@dnd-kit/core` and `@dnd-kit/sortable`. On the first chart it loads
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

A ready-made module is
[PowerShellUniversal.Component.Pivot](https://powershell-universal-components.eize.dev/pivot/)
(`New-UDPivotReport`, a separate project): the report with saved and shared views, roles, and the app's
theme. A component of your own bundles pivotkit-react with pivotkit-core, @dnd-kit and ECharts, and
leaves React and ReactDOM to PowerShell Universal.

## Next steps { #next }

- [Recipes](../embed/recipes.md): tasks such as links, the browser store, chart options, a strict
  Content-Security-Policy.
- [Views and saved views](../concepts/views.md): the JSON behind every report.
- [Theming](../reference/theming.md) and [Localisation](../reference/localisation.md).
- [Use a report](../use/index.md): what the people using it can do; point them there.
