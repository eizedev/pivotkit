---
title: Using the report
description: A guide for the people who use a pivotkit report - fields and zones, drag and drop, chips and their menus, values, filters, the chart, drill-down, export, templates, undo and the keyboard.
---

# Using the report

This page is for the people who build reports with pivotkit. Everything here works the same in the
React component and in the web component; the [live demo](demo.md) is a good place to follow along,
and [Learn with real data](learn.md) has tasks to try on real public data.

![The report: the field list on the left, the four zones Filters, Columns, Rows and Values, and the table](assets/screenshots/report-light.png#only-light)
![The report: the field list on the left, the four zones Filters, Columns, Rows and Values, and the table](assets/screenshots/report-dark.png#only-dark)

<small>Weather data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)); contains modified Copernicus Climate Change Service information ([attribution](learn.md#query-it-live)).</small>

## The parts

- **Fields** (left): every column of the data, with an icon for its type (text, number, date,
  yes/no) and a search. A mark next to a field shows which zone it is in.
- **The zones**: **Rows** and **Columns** say how the table is split, **Values** what is computed in
  the cells, **Filters** what is left out of the whole report.
- **The toolbar**: Table or Chart, the chart type, Undo, Redo, Reset, Layout, Options, Templates and
  Export. What does not fit the report's width moves into **More**, Reset and Redo first, then Layout,
  Templates, Options and the chart type; Table or Chart, Undo and Export always stay.
- **The result**: the table or the chart, with notes above it and a status line below it.

## Adding fields

There are three ways, all with the same result:

- **Drag** a field into a zone. The lists and the page scroll while you drag.
- **Click** a field: numbers go to Values, everything else to Rows.
- Open the field's **menu** (the three dots) and choose "Add to Rows", "Columns", "Values" or "Filters".

A date is grouped as soon as it is placed, by the span of its values: up to 62 days by day, up to two
years by month ("Jan 2025"), up to six years by quarter, longer by year. The chip says so:
"Created (Month)". See [Dates and number ranges](concepts/dates.md).

## Chips

Every field in a zone is a **chip**. A chip shows what is set on it: "3 of 4" for a filter, "Top 5",
the sort.

- Drag a chip to reorder it or to move it to another zone.
- Drag it back to the field list, or press its **x**, to remove it. A note under the table offers Undo.
- Open its **menu** (the arrow) for everything else.

The menu of a **row or column field** has sort (by label or by a value, and "Custom order" and
"Custom order, reversed" when the field has one, such as the seasons in the order of the year), date grouping (along the time line:
year, quarter, month, week, day; or across years: quarter, month, week of the year, weekday, hour),
number ranges (their size and where they start, "Starting at"; a new size keeps the start, an empty
start is 0, and a start so far from the field's numbers that every row would be blank is refused
with a note under it), top or bottom N, filter, and move. Remove is always at the foot.

## Values

![The menu of a value: Summarize by, Show as, Number format and Remove](assets/screenshots/value-menu.png)

The menu of a **value** has:

- **Summarize by**: sum, count, average, minimum, maximum; the statistics (median, distinct count,
  standard deviation, variance, first, last) under "More statistics".
- **Show as**: the value itself, % of grand total, % of row total, % of column total; differences,
  running totals and ranks under "More calculations". The header then says it: "% of grand total of
  Revenue".
- **Number format**: automatic, number, whole number, currency, percent, compact (1.2K), bytes,
  durations.
- **Highlight**: a colour scale or data bars.
- **Name**, and move.

What each one computes is in [Values](concepts/values.md).

## Filters

![The filter of the Region field: values with row counts, a search, select all or none, and a text condition](assets/screenshots/filter.png)

Open a field's menu and choose the filter. It lists the field's values with their row counts, with a
search, "Select all", "Select none" and "Only" next to each value (keeps that one alone), and a text condition (contains, begins
with, ...). A field in the **Filters** zone filters the whole report.

Top N ("Show only the top items") is in the menu of a row or column field. Notes above the table
say what it does to totals and percentages ("Country shows the top 5 only: ..."). See
[Filters, top N and sorting](concepts/filters.md).

## The table

- The header and the row labels stay in place while you scroll.
- Groups expand and collapse with the arrow next to them; Options has "Expand all" and "Collapse all".
- Subtotals and grand totals are switched on and off in **Options**.
- Field names and value names in the header can be dragged into a zone.
- With one value, its name stands once over all of its columns.
- The table is as wide as its columns and scrolls sideways when it is wider than the report. Long
  row labels wrap, so on a phone numbers stay in view next to them.

## The rows behind a number

![The rows behind the value Service Desk, P3 Medium: 648 rows with all their fields](assets/screenshots/drill-down.png)

Click a value (or move to it with the arrow keys and press Enter) and a panel shows the rows behind it,
formatted as the table formats them: dates as dates, numbers in your language, yes/no fields as "Yes"
and "No". Escape closes it and returns to the value. The panel lists up to 1,000 rows by default. A
blank cell with no rows behind it opens nothing.

## The chart

![A line chart of monthly revenue per category in the dark theme](assets/screenshots/chart.png)

**Chart** in the toolbar shows the same report as a chart: bars, stacked bars, horizontal bars, lines,
area, pie or heatmap ("Chart type" in the toolbar). A click on a bar, a point or a heatmap cell opens
its rows, as in the table.

At most 50 categories are drawn, with a note. With more than 8 series, or lines with the dates on
Columns, a hint offers **Swap rows and columns** (also above the Columns zone).

## Undo, templates and export

- **Undo** (Ctrl+Z, on a Mac Cmd+Z) and **Redo** (Ctrl+Shift+Z or Ctrl+Y, Cmd+Shift+Z) step through
  every change. **Reset** goes back to the start view, as one step you can undo.
- **Templates** loads a saved report. When the application allows it, "Save current view" saves yours
  under a name, and your own templates can be deleted.
- **Export** downloads the table as **Excel** (XLSX) or **CSV**, or the chart as **PNG**. The Excel
  file keeps every number with all its decimals, the number formats, the merged headers, the bold
  totals and the highlighting. The CSV writes percentages and "show values as" calculations as the
  table shows them ("-2.6%"); other numbers keep all their decimals. The export menu says so too.

Notes such as "Undone: Region removed" or "Exported pivot.xlsx" appear in the status line under the
table; errors stay until you close them.

## Small screens

The report adapts to its own width. On a wide screen the field list is on the left and the zones in a
2 x 2 grid. On a narrow one the field list opens as a drawer with **Fields** in the toolbar, menus open
as sheets from the bottom, and toolbar buttons that do not fit move into **More**.

![The report at phone width: toolbar, the zones stacked, and the table below](assets/screenshots/phone.png){ width="320" }

When the report is low, the zones fold into one line that says what is in them ("Rows: Team ·
Columns: Priority · Values: Count of Ticket"); a click on it, or **Layout** in the toolbar, opens them.
A drag from the field list or the table opens them while it lasts.

## Keyboard and screen readers

- Every action has a button or a menu entry; drag and drop is never the only way.
- Menus move with the arrow keys and close with Tab or Escape.
- A chip or a field handle is picked up with **Space**. **Left** and **Right** move it within a zone,
  **Up** and **Down** to the zone above or below; its position is announced ("Region is over Rows,
  position 2 of 3"). **Space** drops it, **Escape** cancels.
- In the table the arrow keys move between values and **Enter** opens the rows behind one. An empty
  cell is a stop too; a screen reader hears "No rows" (nothing behind it) or "No value" (rows
  without a number).
- From 300 rows on a row label is cut to one line; the status line under the table shows the whole
  label of the row the focus is on, or of a label you tap.
- The chart has a text alternative: type, values, counts, highest and lowest value.
- The drill-down, the field drawer and the bottom sheets keep the focus inside while open and give it
  back when they close.

## In German

The report speaks English and German; numbers, dates and currency follow the language as well.

![The report in German: Felder, Zeilen, Spalten, Werte, amounts as 1.041.224,25 €](assets/screenshots/german.png)
