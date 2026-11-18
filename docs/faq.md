---
title: FAQ
description: Common questions about pivotkit - which package to use, data size, server data, saving reports, charts, Excel, styling and languages.
---

# FAQ

## Which package do I need?

- A React app: [pivotkit-react](getting-started/react.md).
- A page without React, such as Angular, PHP or plain HTML: [pivotkit-element](getting-started/web-component.md).
- Your own UI, or pivots, grids and exports in your own code: [pivotkit-core](getting-started/engine.md).
- Reports as files from a script or a server: [pivotkit-report](getting-started/report.md).
- Reports in a terminal or CI: [pivotkit-cli](getting-started/cli.md).
- Reports for programs over HTTP, or as a container: [pivotkit-server](getting-started/rest.md).
- Reports from an AI client: [pivotkit-mcp](getting-started/mcp.md).

[Embed pivotkit](embed/index.md) lists all eight packages and what a host switches on.

## How many rows can it handle?

pivotkit is measured up to 1,000,000 rows in Chromium, Firefox and WebKit on one Mac (Apple M4,
16 GB):

- The first table took about 0.15 s at 100,000 rows and 1 to 2.5 s at a million. The page freezes
  while pivotkit builds the table.
- After that, a filter, a field or the chart took about 0.15 s at most.

[Measured in the browser](concepts/limits.md#measured-in-the-browser) has the details. It also says
what was not measured, such as loading a file.

A million rows is the default `rows` limit. Beyond the rows, the [limits](concepts/limits.md#limits)
guard four more things:

- the work of a layout: `work`
- its groups: `groups`
- its aggregated cells: `pivotCells`
- the size of the table: `cells`

For more rows, see [more than a million rows](concepts/limits.md#more-than-a-million-rows).

## My data is on a server. Does pivotkit fetch it?

The report in the browser does not. It loads only its own code chunks. It takes an array of plain
objects that you load yourself, for example with `fetch`, a framework's data layer or a
`<script type="application/json">` block.

To aggregate on the server instead, you have two ways:

- Run pivotkit-core on the server and send the [grid](getting-started/engine.md#drawing-the-grid)
  or the XLSX file.
- Run the [REST service](getting-started/rest.md), its container image or the
  [MCP server](getting-started/mcp.md). They fetch the data themselves from the sources you
  configure: files, an [HTTP API](reference/sources.md#http) or your
  [own code](reference/sources.md#code). Programs or an AI client ask them for reports.

## Does pivotkit send anything home?

No. pivotkit has no telemetry, no update check and no error reporting. It loads nothing from another
host. [Network requests](security.md#network) lists every request each part can make, for operators
in closed networks.

## My data is columnar (`{ columns, rows }`). Can I pass it?

Data with one array per column, `{ columns, types, data }`, goes in as it is. You pass it as `data`
of the React component and the web component, or to pivotkit-core's
[`encode`](reference/core.md#columnar-input), without an object per row.

pivotkit does not take row arrays under `columns` (`{ columns, rows }`). Turn them into one array per
column first:

```js
const columnar = { columns: data.columns, data: data.columns.map((_, c) => data.rows.map((r) => r[c])) };
```

## How do I save a report?

Store the view that `onViewChange` or `pivot-view-change` hands you as JSON. Later, pass it back as
`view` or `defaultView`.

To let people name and keep several views, you have two ways:

- Pass them as `templates`. They become the shared views and my views of the Views menu.
- Let the browser keep them: `templateStore="browser"`.

See [Templates and shared views](concepts/templates.md).

## Is it safe to load a view someone else saved?

Yes. A view holds names only, plus the values chosen in its filters as plain data. pivotkit checks it
against the data and fixed lists. A view cannot run code and cannot allocate unbounded memory. See
[Security](security.md).

## My dates are a day off.

A `Date` built from local parts, such as a date picker's value, is local midnight: an instant. The
default time zone is UTC. Pass one of these:

- the prop `timeZone="local"`
- the attribute `time-zone="local"`
- the zone the dates belong to

See [Time zones](concepts/limits.md#time-zones).

## Why do I see only four quarters (or twelve months) for several years?

The date is grouped by **Quarter of year** or **Month of year**. These groupings put the same
period of every year in one row, so Q1 holds Q1 2024 and Q1 2025 together. Use them to compare
seasons. The title says which years it combines: "Date by quarter of year · 2024–2025 combined".

- For one row per quarter of each year, group by **Quarter**, which runs along the time line.
- For one year next to another, put the date on Rows by **Year** and on Columns by
  **Quarter of year**.

[Which grouping do I need?](use/values.md#dates-and-number-ranges) has the steps, and how to keep one
year only.

## Does the Excel file contain formulas?

No. pivotkit writes values as typed cells with number formats and text as inline strings. Totals are
values too. Colour scales and data bars are Excel's native conditional formats. Excel cannot show a
few formats the same way. [Values](concepts/values.md#export) lists them.

## Can I use my own chart library?

The report draws with Apache ECharts. With pivotkit-core you have two ways:

- Take `toSeries(result)`, the categories and series as plain arrays, and draw them with anything.
- Use `toEChartsOption` with your own ECharts instance.

## The page already has ECharts. Is it loaded twice?

With pivotkit-react, no. ECharts is a peer dependency, so pivotkit-react uses your copy.

pivotkit-element bundles the parts of ECharts it needs and loads them on the first chart. A page with
its own ECharts then loads a second copy. Use pivotkit-react if that matters.

## How do I match my design?

Set the `--pk-*` tokens: colours, fonts, radii, sizes and chart colours. See [Theming](reference/theming.md).

## Which languages are built in?

English and German. For any other language, you pass a labels object. See
[Localisation](reference/localisation.md).

## Does it work with a keyboard and a screen reader?

Yes:

- Every action has a button or a menu entry.
- Chips move with the keyboard.
- The arrow keys reach the table's values.
- The chart has a text alternative.

See
[Keyboard and screen readers](use/keyboard.md).

## Several reports on one page?

Yes. Give each one its own `label`, so a screen reader can tell their landmarks apart.
