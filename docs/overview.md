---
title: What pivotkit does
description: pivotkit at a glance - what the people who use a report can do, and what developers get, one sentence each.
---

# What pivotkit does

pivotkit is a pivot report builder for the web: the engine `pivotkit-core`, the React component
`pivotkit-react` and the web component `pivotkit-element`. Every point links to its details; the
[feature list](features.md) has every behaviour, also the small ones.

<div class="grid" markdown>

<div markdown>

## For the people who use a report

- Drag fields into Rows, Columns, Values and Filters, or use the menu every field has ([guide](guide.md#adding-fields)).
- Sum, count, average and more, or show a value as a share, a running total or a rank ([values](concepts/values.md)).
- Dates are grouped as soon as they are placed, numbers go into ranges ([dates](concepts/dates.md)).
- Filter a field by its values, a text condition, a value condition ("Sum of Revenue > 1,000") or its top N; the menu says what a filter keeps ([filters](concepts/filters.md)).
- Click a number to see the rows behind it ([drill-down](guide.md#the-rows-behind-a-number)).
- Switch to a chart: the type follows the data (lines over dates, else bars) until you pick bars, lines, area, pie, donut or heatmap, with value labels, legend, title and group labels ([charts](concepts/charts.md)).
- Undo and redo every step; Reset goes back to the start ([guide](guide.md#undo-saved-views-and-export)).
- Pick a shared view or one of your own under Views, save yours, publish it for everyone where allowed ([templates](concepts/templates.md)), or share it as a link, as JSON or as a view file; a view for other data asks first ([sharing](concepts/sharing.md)).
- Enlarge the result or put the report on the full screen ([guide](guide.md#more-room-for-the-result)).
- Export the table to Excel or CSV and the chart to PNG, or copy the table into a spreadsheet ([export](guide.md#undo-saved-views-and-export)); copy or download the rows behind a number ([drill-down](guide.md#the-rows-behind-a-number)).
- Tips, one at a time, say what the report shows and what to do next; an "i" explains each zone, field and setting that needs it, and long menus fold their sections ([tips](guide.md#tips), [menus](guide.md#menus-that-are-long)).
- Every text field in a menu has an × that empties it ([guide](guide.md#menus-and-text-fields)).
- Works with a keyboard and a screen reader, from a phone to a wide screen ([keyboard](guide.md#keyboard-and-screen-readers)).
- In English and German, light and dark ([localisation](reference/localisation.md), [theming](reference/theming.md)).

</div>

<div markdown>

## For developers

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
- Theming through `--pk-*` tokens, inside a shadow root too ([theming](reference/theming.md)).
- Designed for about 100,000 rows; heavy parts load on first use ([performance](reference/react.md#performance), [bundle size](reference/element.md#bundle-size)).

</div>

</div>
