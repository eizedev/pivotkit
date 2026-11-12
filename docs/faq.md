---
title: FAQ
description: Common questions about pivotkit - which package to use, data size, server data, saving reports, charts, Excel, styling and languages.
---

# FAQ

## Which package do I need?

- A React app: [pivotkit-react](getting-started/react.md).
- A page without React (Angular, PHP, plain HTML): [pivotkit-element](getting-started/web-component.md).
- Your own UI, or reports built on a server: [pivotkit-core](getting-started/engine.md).

## How many rows can it handle?

Measured up to 1,000,000 rows in Chromium, Firefox and WebKit on one Mac: the first table took
about 0.15 s at 100,000 rows and 1 to 2.5 s at a million, with the page frozen while it is built;
after that a filter, a field or the chart took under about 150 ms
([measured in the browser](concepts/limits.md#measured-in-the-browser), which also says what was not
measured, such as loading a file). A million rows is the default `rows` limit. Beyond the rows, the [limits](concepts/limits.md#limits)
guard the work of a layout (`work`), its groups (`groups`), its aggregated cells (`pivotCells`) and
the size of the table (`cells`).

## My data is on a server. Does pivotkit fetch it?

No. pivotkit takes an array of plain objects you load yourself (`fetch`, a framework's data layer, a
`<script type="application/json">` block), and never makes a network request. To aggregate on the
server instead, run pivotkit-core there and send the [grid](getting-started/engine.md#drawing-the-grid)
or the XLSX file.

## My data is columnar (`{ columns, rows }`). Can I pass it?

Data with one array per column, `{ columns, types, data }`, goes in as it is: as `data` of the React
component and the web component, and into pivotkit-core's [`encode`](reference/core.md#columnar-input),
without an object per row. Row arrays under `columns` (`{ columns, rows }`) are not taken; turn them
into one array per column first:

```js
const columnar = { columns: data.columns, data: data.columns.map((_, c) => data.rows.map((r) => r[c])) };
```

## How do I save a report?

Store the view that `onViewChange` (or `pivot-view-change`) hands you, as JSON, and pass it back as
`view` or `defaultView` later. To let people name and keep several, pass them as `templates` (the shared views and my views of the Views menu), or let the browser keep them (`templateStore="browser"`); see
[Templates and shared views](concepts/templates.md).

## Is it safe to load a view someone else saved?

Yes: a view holds names only (and the values chosen in its filters, as plain data) and is checked against the data and fixed lists; it cannot run code and
cannot allocate unbounded memory. See [Security](security.md).

## My dates are a day off.

A `Date` built from local parts (a date picker's value) is local midnight, an instant, and the default
time zone is UTC. Pass `timeZone="local"` (prop), `time-zone="local"` (attribute) or the zone the dates
belong to. See [Time zones](concepts/limits.md#time-zones).

## Why do I see only four quarters (or twelve months) for several years?

The date is grouped by **Quarter of year** or **Month of year**: the same period of every year in
one row, so Q1 is Q1 2024 and Q1 2025 together, for comparing seasons. For one row per quarter of
each year group by **Quarter** (along the time line); for one year next to another put the date on
Rows by **Year** and on Columns by **Quarter of year**. The steps, and how to keep one year only, are
under [Which grouping do I need?](use/values.md#dates-and-number-ranges).

## Does the Excel file contain formulas?

No. Values are written as typed cells with number formats, text as inline strings; totals are values
too. Colour scales and data bars are Excel's native conditional formats. The few formats Excel cannot
show the same way are listed under [Values](concepts/values.md#export).

## Can I use my own chart library?

The report draws with Apache ECharts. With pivotkit-core you can take `toSeries(result)` (categories
and series as plain arrays) and draw them with anything, or use `toEChartsOption` with your own
ECharts instance.

## The page already has ECharts. Is it loaded twice?

With pivotkit-react, no: ECharts is a peer dependency, your copy is used. pivotkit-element bundles the
parts of ECharts it needs and loads them on the first chart, so a page with its own ECharts loads a
second copy then; use pivotkit-react if that matters.

## How do I match my design?

Set the `--pk-*` tokens: colours, fonts, radii, sizes and chart colours. See [Theming](reference/theming.md).

## Which languages are built in?

English and German; any other language is a labels object you pass. See
[Localisation](reference/localisation.md).

## Does it work with a keyboard and a screen reader?

Yes. Every action has a button or a menu entry, chips move with the keyboard, the table's values are
reachable with the arrow keys, and the chart has a text alternative. See
[Keyboard and screen readers](use/keyboard.md).

## Several reports on one page?

Yes. Give each one its own `label`, so a screen reader can tell their landmarks apart.
