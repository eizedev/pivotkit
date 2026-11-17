---
title: Use a report
description: For the people who build reports with pivotkit in an application - where to start, and one page per task - fields, values, filters, charts, the rows behind a number, saved views, export, keyboard and small screens.
---

# Use a report

These pages are for the people who build reports with pivotkit in an application. You need no
programming. You drag fields, pick from menus and read the result. Everything here works the same in
every application that uses pivotkit. You can follow along in the [live demo](../demo.md).

## Where to start

1. [Quick start](quick-start.md): your first report in six steps, with a picture of each.
2. [Learn with real data](../learn.md): questions to answer on real public data about weather,
   countries, earthquakes, Nobel laureates and software end of life. Each question comes with
   "Read it" and "Try this".
3. Then look up what you need below.

## One page per task

| I want to... | Page |
| --- | --- |
| Put fields into rows, columns and values, rearrange them, read the table | [Fields, zones and the table](fields.md) |
| Sum, count or average, show a share or a running total, format numbers, group dates | [Values and formats](values.md) |
| Leave values out, keep the top 10, sort | [Filters, top N and sorting](filters.md) |
| Show the report as a chart, change labels, legend and title | [Charts](charts.md) |
| See the rows behind a number, copy or download them where the application allows it | [The rows behind a number](drill-down.md) |
| Undo, save a view, pick a shared one, share a link or a file, load one | [Views, saving and sharing](views.md) |
| Load a CSV, JSON or Excel file of my own into the report | [Load your own data](load-data.md) |
| Download Excel, CSV or a chart image, copy the table into a spreadsheet | [Export and copy](export.md) |
| Use the report with a keyboard or a screen reader | [Keyboard and screen readers](keyboard.md) |
| Give the result more room, use the report on a phone, find my way in long menus, tips | [Small screens, menus and tips](layout.md) |
| Know why a button is greyed out, what a message means, why the report shows nothing | [Behaviour reference](behaviour.md) |

![The report: the field list on the left, the four zones Filters, Columns, Rows and Values, and the table](../assets/screenshots/report-light.png#only-light)
![The report: the field list on the left, the four zones Filters, Columns, Rows and Values, and the table](../assets/screenshots/report-dark.png#only-dark)

<small>Weather data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)); contains modified Copernicus Climate Change Service information ([attribution](../learn.md#query-it-live)).</small>

!!! note "For developers"
    These pages hold for the React component and the web component alike.
    [Embed pivotkit](../embed/index.md) describes how you put the report into your application.
    Every setting that a "For developers" box on these pages names is in the
    [pivotkit-react reference](../reference/react.md#props) and the
    [element reference](../reference/element.md#properties-and-attributes).
