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
  yes/no) and a search. A mark next to a field shows which zone it is in. When the application
  describes a field, an **i** next to it says what the field means.
- **The zones**: **Rows** and **Columns** say how the table is split, **Values** what is computed in
  the cells, **Filters** what is left out of the whole report. The **i** next to a zone's title says
  what it does, with an example.
- **The toolbar**: Table or Chart, the chart type, Undo, Redo, Reset, Layout, Options, Templates and
  Export. What does not fit the report's width moves into **More**, Reset and Redo first, then Layout,
  Templates, Options and the chart type; Table or Chart, Undo and Export always stay.
- **The result**: the table or the chart, with tips above it and a status line below it.

## Adding fields

There are three ways, all with the same result:

- **Drag** a field into a zone. The lists and the page scroll while you drag.
- **Click** a field: numbers go to Values, everything else to Rows. Each click on a number adds
  another value (a second "Sum of Revenue", to show it as a share, say); a field in Columns or Filters
  moves to Rows; a field in Rows already stays, and the status line says so ("Region is already in
  Rows").
- Open the field's **menu** (the three dots, or a click on the grip left of the field, which says
  "Drag into a zone") and choose "Add to Rows", "Columns", "Values" or "Filters". A field that is not
  in the report yet also has **Filter…**: see [Filters](#filters).

A date is grouped as soon as it is placed, by the span of its values: up to 62 days by day, up to two
years by month ("Jan 2025"), up to six years by quarter, longer by year. The chip says so:
"Created (Month)". See [Dates and number ranges](concepts/dates.md).

## What a field means

When the application describes its fields, an **i** stands next to such a field in the list and on
its chips. Point at it, or move the focus to it with Tab, and the description appears; click or tap it
to keep it open, with **Learn more** when there is a page about the field. Escape closes it. On a phone a chip has no **i**; the same
text is at the top of the chip's menu and on the field's headers in the table and in the drill-down,
and the field search finds a field by words of its description. The application may also give a
field a clearer name than the data's; the report uses that name everywhere, also in the exported
files.

![A field's description next to the field list: what the World Bank counts as population, with Learn more](assets/screenshots/field-info.png)

## Chips

Every field in a zone is a **chip**. A chip shows what is set on it: "3 of 4" for a filter, "Top 5",
a value condition ("Sum of Revenue > 1,000"), the sort.

- Drag a chip to reorder it or to move it to another zone.
- Drag it back to the field list, or press its **x**, to remove it. A note under the table offers Undo.
  A field that leaves the report takes its filters and its sort with it.
- Open its **menu** (the arrow) for everything else.

The menu of a **row or column field** has sort (by label; "Largest Sum of Revenue first" and
"Smallest Sum of Revenue first" for each value that gives a number, so with two values you choose
which one orders the items; and "Custom order" and "Custom order, reversed" when the field has one,
such as the seasons in the order of the year), date grouping (along the time line:
year, quarter, month, week, day; or across years: quarter, month, week of the year, weekday, hour),
number ranges (their size and where they start, "Starting at"; a new size keeps the start, an empty
start is 0, and a start so far from the field's numbers that every row would be blank is refused
with a note under it), top or bottom N by a value you choose, the filter with a value condition
("Value filter…"), and move. Remove is always at the foot.

## Values

![The menu of a value: Summarize by, Show as, Number format and Remove](assets/screenshots/value-menu.png)

The menu of a **value** has:

- **Summarize by**: sum, count, average, minimum, maximum; the statistics (median, distinct count,
  standard deviation, variance, first, last) under "More statistics".
- **Show as**: the value itself, % of grand total, % of row total, % of column total; differences,
  running totals and ranks under "More calculations", with an **Along** switch (Rows or Columns) for
  the direction they walk. The header then says it: "% of grand total of Revenue".
- **Number format**: automatic, number (also with no or two decimals), whole number, currency,
  percent, compact (1.2K), bytes, durations from hours or seconds. A format the template brought along
  that is not in this list (a date, text, another currency) stays until you pick another.
- **Highlight**: a colour scale or data bars.
- Show as, Number format and Highlight are there only for a value that gives a number: not for a list
  of distinct values, the first or last entry of a text, or the average, median, minimum or maximum of dates.
- **Name**: type a name and Apply; the **×** gives the value its default name back at once
  ("Sum of Revenue", shown as the placeholder), as one step Undo takes back.
- Move, and a sentence on filtering: values are not filtered here; filter a field on Rows or Columns
  through its menu, or move a field to Filters.

What each one computes is in [Values](concepts/values.md).

## Filters

![The filter of the Region field: values with row counts, a search, select all or none, and a text condition](assets/screenshots/filter.png)

Open a field's menu and choose the filter (a chip in **Filters** opens it with a click). It lists the
field's values with their row counts and "N selected" at the top, with a search, "Select all",
"Select none" and "Only" next to each value (keeps that one alone), and a text condition (contains,
begins with, ...). At most 300 values are listed; below them "300 of 1,045 values; search to find
more" says that the search finds the rest. Select all and Select none act on what the search finds.
Your choice is a draft until **Apply**; **Cancel** or Escape leaves the filter as it was. A field in
the **Filters** zone filters the whole report.

The report remembers the values you left out, not the ones you kept: a value that is new in later data
shows up. With every value ticked, the field is not filtered at all.

- While a field is filtered, its menu says what the filter keeps, in the accent colour: "Filter: 15 of
  45" or "Filter: contains “an”", with **Remove filter** right below. The filter itself has **Remove
  filter** at its top.
- The **×** in the text of a condition removes the condition at once; the values you ticked stay
  until you apply them.
- A field that is not in the report yet: **Filter…** in its menu in the field list opens its filter at
  once. Apply puts it into Filters with what you chose; Cancel changes nothing. Moved to Rows or
  Columns later, it keeps its filter.

![A filtered field's menu: Filter: 1 of 5 in the accent colour, Remove filter right below](assets/screenshots/filter-state.png)

**Value filter…** in the menu of a row or column field keeps the items whose value meets a condition:
pick the value (when there are several), an operator such as "greater than" or "between", and the
number. The chip then shows it, "Sum of Revenue > 1,000", and so does the menu ("Filter: Sum of
Revenue > 1,000"); open the form again to change it, **Clear** to remove it.

![The menu of Region with its value condition: Sum of Revenue greater than 2,000,000](assets/screenshots/value-filter.png)

Top N ("Show only the top items") is in the same menu: Top or Bottom, how many, and by which value.
Notes above the table say what it does to totals and percentages ("Country shows the top 5 only:
..."). See [Filters, top N and sorting](concepts/filters.md).

## The table

- The header and the row labels stay in place while you scroll.
- Groups expand and collapse with the arrow next to them; Options has "Expand all" and "Collapse all"
  for the groups of Rows (groups of Columns open and close with their arrows only). Each is offered
  only when it changes something; otherwise a line under it says why ("Nothing is collapsed.", "Needs
  two or more fields in Rows.", "Every group is collapsed already."), and after a click the status
  line says what it did ("5 groups collapsed").
- **Swap rows and columns** (above Columns) swaps the fields, which groups are collapsed, and the
  direction of calculations: "% of row total" becomes "% of column total", a running total along Rows
  runs along Columns.
- Subtotals and grand totals are switched on and off in **Options**.
- Field names and value names in the header can be dragged into a zone.
- With one value, its name stands once over all of its columns.
- The table is as wide as its columns and scrolls sideways when it is wider than the report. Long
  row labels wrap, so on a phone numbers stay in view next to them.

## The rows behind a number

![The rows behind the value Service Desk, P3 Medium: 648 rows with all their fields](assets/screenshots/drill-down.png)

Click a value (or move to it with the arrow keys and press Enter) and a panel shows the rows behind it,
formatted as the table formats them: dates as dates, numbers in your language, yes/no fields as "Yes"
and "No". It covers the report while it is open: the focus stays in it, and Escape, its close button
or a click beside it closes it and returns to the value. The panel lists up to 1,000 rows by default;
with more behind the value its title line says "Showing the first 1,000 of 4,210 rows". A blank cell
with no rows behind it opens nothing.

## The chart

![A line chart of monthly revenue per category in the dark theme](assets/screenshots/chart.png)

**Chart** in the toolbar shows the same report as a chart: bars, stacked bars, horizontal bars, lines,
area, pie or heatmap ("Chart type" in the toolbar). A click on a bar, a point or a heatmap cell opens
its rows, as in the table. Pointing at a category shows a tooltip with its whole name and one line per
series with its colour and the formatted value; on a pie, the slice; on a heatmap, the cell's row and
column and its value.

At most 50 categories are drawn, with a tip. With more than 8 series, or lines with the dates on
Columns, a tip offers **Swap rows and columns** (also above the Columns zone). Lines over categories
without an order (countries) get a tip with **Switch to Bars**.

The chart type menu also has **Display**: value labels, legend, title, smooth lines, axis labels and,
with two fields in Rows, group labels under the axis. The settings stay with the report, also in
templates, links and the PNG. All of it is in [Charts](concepts/charts.md).

## Undo, templates and export

- **Undo** (Ctrl+Z, on a Mac Cmd+Z) and **Redo** (Ctrl+Shift+Z or Ctrl+Y, Cmd+Shift+Z) step through
  every change. **Reset** goes back to the start view, as one step you can undo.
- **Templates** loads a saved report. When the application allows it, "Save current view" saves yours
  under a name (up to 120 characters; Enter saves), and your own templates can be deleted, after a
  confirmation. **Share this view** copies a link (when the application allows links) or the view as
  JSON, downloads it as a file, and **Load view…** opens one from pasted text or a file:
  [Sharing and keeping a view](concepts/sharing.md).
- **Export** downloads the table as **Excel** (XLSX) or **CSV**, or the chart as **PNG**. The Excel
  file keeps every number with all its decimals, the number formats, the merged headers, the bold
  totals and the highlighting; its sheet has the file's name (made valid for Excel: at most 31
  characters). The CSV is UTF-8 with a byte order mark, so Excel reads accents and umlauts right; it
  writes percentages and "show values as" calculations as the table shows them ("-2.6%"); other
  numbers keep all their decimals; a row label is repeated on every row it spans. The export menu
  says so too. The PNG is the chart as drawn, at twice the screen's resolution, on the report's
  background colour. The files are named after the application's `fileName` ("pivot" when it gives
  none): `pivot.xlsx`, `pivot.csv`, `pivot.png`, and `pivot-view.json` for a downloaded view.

A button or menu entry that would do nothing is greyed out:

| Entry | Available when |
| --- | --- |
| Undo, Redo | there is a step to take back or to repeat |
| Reset | the report differs from the start view |
| Export, **Chart image (.png)** | the chart is shown and drawn |
| Options, Help, **Show dismissed tips again** | you dismissed a tip |
| Options, **Expand all**, **Collapse all** | it changes something; the line under it says why not |
| Templates, **Save** | the name holds text |
| Load view, **Load** | the box holds text (a chosen file loads at once) |
| The chart title's **Apply** | the title differs from the current one |

### Status messages

Notes such as "Undone: Region removed", "Template “Sales” saved" or "Exported pivot.xlsx" appear in
the status line under the table, never over the data, and a screen reader hears them. At most two
show at a time; each goes after 6 seconds, but stays while the pointer is on it or the focus is in it.
Errors ("Export failed: ...") stay until you close them with their **x**.

### Parts of a view that were not used

A template, a link or a loaded file can name things the data does not have (a field that is gone, a
value the field cannot compute). The report leaves them out and shows "Some parts of the view were
not used: 2" above the result; open it to see each part (its path in the view, such as
`filters[1].by`, and why) - up to 20 of them.

### When the report cannot show anything

- Data without a single column: the field list says "The data has no columns."
- No field placed: the table shows three first steps and up to three templates to start from.
- A layout over a limit: the result says what to change ("This layout makes more than 500,000 groups of
  rows and columns. Remove a field with many values from Rows or Columns, or filter it."), see
  [Limits](concepts/limits.md).
- Any other error: "The report cannot be shown:" and the error's message.

## Tips

Short tips above the result say what the report shows and what you can do next: that a top 5 changes
what the totals mean, what 100 % is for a percentage, that a text field in Values is counted, that a
date makes a column per day (with a button to group it by month), that a filter leaves nothing (with
**Remove filter**), or that the view could be saved as a template. At most two show at a time, the
most important first, and never over the table. The notes that say the result is cut or empty (a top
5, the first 50 categories of a chart, a filter that leaves nothing) always stay; they have no x.

- The **x** of a tip (Tab reaches it) hides that tip; the report remembers it.
- **Options**, **Help** has **Show tips**, to switch them all off and on, **Show field descriptions**
  (the **i** of the fields; shown when the application describes its fields) and **Show zone
  explanations** (the **i** of the zones), and **Show dismissed tips again**. The report remembers the
  switches like the tips.
- **Options**, **Help**, **Keyboard shortcuts** lists the keys.

![Above the table: the notice that the top 3 cover these items only, and a tip with its x](assets/screenshots/tips.png)

## Menus and text fields

- Every text field in a menu - the field search, a value's name, "Starting at" of number ranges, a
  template's name, the text of a filter condition, the box of Load view - has an **×** while it holds
  text. It empties the field and keeps the focus there; Ctrl+Z in the field brings the text back.
- **Escape** in such a field empties it first; the next Escape closes the menu.
- While the report waits for its data, or opens a shared link, it shows grey shapes where the
  toolbar, the zones and the table will be, and a screen reader hears "Loading the report…".

## Small screens

The report adapts to its own width. On a wide screen the field list is on the left and the zones in a
2 x 2 grid. On a narrow one the field list opens as a drawer with **Fields** in the toolbar, menus open
as sheets from the bottom, and toolbar buttons that do not fit move into **More**. The drawer closes
with its **x** ("Close field list"), Escape or a tap beside it, and by itself once a field is added
from it, its "Filter…" opens or a drag starts, so you see where the field lands.

![The report at phone width: toolbar, the zones stacked, and the table below](assets/screenshots/phone.png){ width="320" }

When the report is low, the zones fold into one line that says what is in them ("Rows: Team ·
Columns: Priority · Values: Count of Ticket"); a click on it, or **Layout** in the toolbar, opens them.
A drag from the field list or the table opens them while it lasts.

## Keyboard and screen readers

- Every action has a button or a menu entry; drag and drop is never the only way.
- Menus move with the arrow keys, **Home** and **End** jump to the first and the last entry, and Tab
  or Escape closes them.
- A chip or a field handle is picked up with **Space**. **Left** and **Right** move it within a zone,
  **Up** and **Down** to the zone above or below; its position is announced ("Region is over Rows,
  position 2 of 3"). **Space** drops it, **Escape** cancels.
- In the table the arrow keys move between values and **Enter** or **Space** opens the rows behind one. An empty
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
