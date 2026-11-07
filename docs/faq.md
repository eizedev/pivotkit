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

It is designed for up to about 100,000 rows in the browser; a change then stays within a frame or two
(see [Performance](reference/react.md#performance)). `encode` accepts up to 1,000,000 rows by
default, at the cost of time and memory. Beyond the rows, the [limits](concepts/limits.md#limits)
guard the work of a layout (`work`), its groups (`groups`), its aggregated cells (`pivotCells`) and
the size of the table (`cells`).

## My data is on a server. Does pivotkit fetch it?

No. pivotkit takes an array of plain objects you load yourself (`fetch`, a framework's data layer, a
`<script type="application/json">` block), and never makes a network request. To aggregate on the
server instead, run pivotkit-core there and send the [grid](getting-started/engine.md#drawing-the-grid)
or the XLSX file.

## My data is columnar (`{ columns, rows }`). Can I pass it?

Not directly: pivotkit takes rows as objects. Map them first:

```js
const objects = data.rows.map((r) => Object.fromEntries(data.columns.map((c, i) => [c, r[i]])));
```

## How do I save a report?

Store the view that `onViewChange` (or `pivot-view-change`) hands you, as JSON, and pass it back as
`view` or `defaultView` later. To let people name and keep several, pass them as `templates` (the saved views of the Views menu); see
[Views and saved views](concepts/views.md#saved-views-in-the-ui).

## Is it safe to load a view someone else saved?

Yes: a view holds names only and is checked against the data and fixed lists; it cannot run code and
cannot allocate unbounded memory. See [Security](security.md).

## My dates are a day off.

A `Date` built from local parts (a date picker's value) is local midnight, an instant, and the default
time zone is UTC. Pass `timeZone="local"` (prop), `time-zone="local"` (attribute) or the zone the dates
belong to. See [Time zones](concepts/limits.md#time-zones).

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
[Using the report](guide.md#keyboard-and-screen-readers).

## Several reports on one page?

Yes. Give each one its own `label`, so a screen reader can tell their landmarks apart.
