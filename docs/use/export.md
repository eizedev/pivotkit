---
title: Export and copy
description: Download a pivotkit report as an Excel workbook, a CSV file or an HTML report, the chart as a PNG or SVG image, print it or save it as PDF, copy the table into a spreadsheet or as JSON, or download all the rows behind it - what each one holds.
---

# Export and copy

With **Export** in the toolbar you can:

- download the table as an Excel workbook, a CSV file or an HTML report
- download the chart as a picture
- print the report, or save it as PDF
- copy the table, so you can paste it into a spreadsheet

The Excel file keeps every number with all its decimals, and the formats. The CSV, the HTML report
and the copy hold the numbers as the table shows them. Where the application offers it,
**Source data** downloads all the rows behind the report instead of the table.

![The Export menu: Excel workbook, Table as CSV, HTML report and the chart images under Download; Print or save as PDF under Print; Copy table and Copy data as JSON under Copy; All rows as CSV and as JSON under Source data](../assets/screenshots/export-menu-light.png#only-light)
![The Export menu: Excel workbook, Table as CSV, HTML report and the chart images under Download; Print or save as PDF under Print; Copy table and Copy data as JSON under Copy; All rows as CSV and as JSON under Source data](../assets/screenshots/export-menu-dark.png#only-dark)

| Entry | Gives | Best for |
| --- | --- | --- |
| **Excel workbook (.xlsx)** | The table with every number and all its decimals, the number formats, the merged headers, the bold totals and the highlighting. | Calculating on in Excel. |
| **Table as CSV (.csv)** | The table as text: percentages and "show as" calculations as the table shows them, other numbers with all their decimals. | Other programs. |
| **HTML report (.html)** | A page with the table as it is shown, the chart when the chart is shown, and the filters. Opens in any browser, prints well. | Sending a report to read or to print. |
| **Chart image (.png)** | The chart as drawn. Greyed out with "Switch to Chart first." while the table is shown. | A slide or a message. |
| **Chart image (.svg)** | The chart as a vector image: sharp at any size. Greyed out with "Switch to Chart first." while the table is shown. | A document or a print layout. |
| **Print or save as PDF…** | The HTML report in the browser's print dialog: print it, or pick "Save as PDF" there. | Paper, or a PDF. |
| **Copy table** | The table as it is shown, tab-separated. | Pasting into Excel, Numbers or Google Sheets. |
| **Copy data as JSON** | The table's data for a program. | A developer. |
| **All rows as CSV (.csv)** | All the original rows behind the report, before grouping, filters and totals, with every field. | Your own analysis. Or a colleague who builds the report again with a script: give them this file and the view from **Views**, **Download view**. The [command line](../reference/cli.md) needs these two things. |
| **All rows as JSON (.json)** | The same rows for a program: numbers as numbers, text as text, a blank as `null`. | A developer. |

While you have placed no field, there is no table to export. The table's entries are greyed out
with "Add a field first." under them, and nothing is downloaded or copied. The source data is there
all the same.

- The menu has three titled groups: **Download**, **Print** and **Copy**.
- A fourth group, **Source data**, comes last where the application turns it on. The playground
  does. It may hold only some of the fields.
- The drill-down's Export menu has **Download** and **Copy** with the rows behind a number. It has no
  HTML report, SVG or print.
- An **i** says what an entry holds. It stands next to Excel, Table as CSV, HTML report, Print, Copy
  table, Copy data as JSON and the two source data entries. Its text opens above the menu, also at
  the window's edge.

## The table or the rows behind it?

The table's exports hold what you see: the groups, the totals, the numbers as the table shows them.
They are Excel, Table as CSV, the HTML report and the copies.

**Source data** holds what the report is made of:

- every row of the data as it came in, one line per row
- every field under its own name
- no grouping and no totals
- the report's filters not applied: a view applies them when it is used

| You want | Take |
| --- | --- |
| The table for a colleague, a slide, a mail | Excel workbook, Table as CSV or HTML report |
| The rows to analyse yourself, in Excel or another tool | All rows as CSV |
| The report built again by a script or the command line | All rows as CSV and the view from **Views**, **Download view**. Then `pivotkit render <view> --data <rows>`. See [command line](../reference/cli.md#try-it). |
| The rows for a program | All rows as JSON |

For the rows behind ONE number, a cell's drill-down, see the [drill-down](drill-down.md#copy-or-download-the-rows).

## What each one holds

??? info "Excel workbook"
    The workbook holds:

    - every number with all its decimals
    - the number formats
    - the merged headers: a group's label at the top of its rows, as in the report
    - the bold totals
    - the highlighting. Colour scales and data bars become Excel's own conditional formats, so they
      stay live. They take the report's colours from the light theme, also when the report is dark,
      since Excel shows them behind black text.

    The sheet has the file's name, made valid for Excel: at most 31 characters.

    Where Excel cannot follow a format, the workbook writes:

    - bytes and durations as plain numbers
    - compact numbers in languages that group by ten thousand, such as Japanese, as general numbers
    - dates before 1900 as text

    Number labels, such as a year on rows, stay numbers.

??? info "CSV file"
    The file is UTF-8 with a byte order mark, so Excel reads accents and umlauts correctly. The
    separator and the decimal mark follow the report's language. Percentages and "show values as"
    calculations are written as the table shows them, such as "-2.6%". Spreadsheets read them back as
    the fraction. Other numbers keep all their decimals, up to 15 significant digits. The file repeats a
    row label on every row it spans.

??? info "HTML report"
    One file that opens in any browser, offline. It holds:

    - a heading: the loaded view's name, or "Report"
    - the chart, when the chart is shown
    - the table as it is shown: merged headers, bold totals, colour scales and data bars, collapsed
      groups marked "+", and every number as the table writes it
    - below the table: the data's name, its rows, the filters in words and when the report was made

    On screen it is light or dark, after your system. On paper it is always light. It loads and runs
    nothing: no script, no address it fetches. A very large table is cut after 200,000 cells, and the
    report says how many rows it shows. Export Excel or CSV for all of them.

??? info "Chart image"
    The PNG is the chart as drawn, at twice the screen's resolution, on the report's background
    colour. It has the chart's title, legend, value labels and group labels.

    The SVG is the same chart at the size it has on the screen, as a vector image on a light
    background. Its texts stay text. It holds at most the first 50 categories, as on the screen.

??? info "Print or save as PDF"
    This entry opens the browser's print dialog with the HTML report, not the page around it.

    - Every page repeats the table's header row and never splits a row.
    - A table with more than 8 columns prints in landscape.
    - A table with more than 16 columns prints in a smaller font.
    - The chart stays whole on its page.

    To get a PDF, pick "Save as PDF" or "Microsoft Print to PDF" as the printer. Where the page does
    not allow printing, a note says so: "This page does not allow printing the report. Download the
    HTML report instead."

    In Safari, after you cancel the print dialog, the next print in that tab first asks
    "This webpage is trying to print. Do you want to print it?" That is Safari's own rule. To get the
    dialog directly again, print or save as PDF once instead of cancelling, or press Enter in the
    address bar.

??? info "Copy table"
    The table as it is shown: headers, labels and totals, with every number as the table writes it,
    such as "1,234.5" or "35.7%". Values are tab-separated, and a row label is repeated on every row
    it spans. When you paste it into Excel, Numbers or Google Sheets, it lands in columns. A
    spreadsheet in the same language reads the numbers back as numbers. After the copy, a note says
    what it gave: "Table copied: tab-separated, pastes into Excel or Google Sheets as columns".

??? info "All rows as CSV and as JSON"
    These files hold the data the view was made on:

    - every row of the data the report shows: the application's data, or a file you loaded
    - every field except the groupings a view adds, such as a date by month or ranges

    The fields keep the names the data gives them, not the report's display names, since a view uses
    those names.

    The CSV is a machine format:

    - UTF-8 with a byte order mark
    - always `,` between values and `.` as the decimal mark. If your Excel uses a comma as the decimal
      mark, open the file with **Data**, **From Text/CSV**.
    - numbers with all their digits
    - dates as `2026-07-03` or `2026-07-03T08:15:00`
    - yes/no as `true` and `false`
    - a blank as an empty value

    A text or a field name a spreadsheet would run as a formula gets a leading `'`, as in every CSV.
    See [Safe to open](#safe-to-open) below. The JSON keeps text as it is, without a `'`. It keeps
    numbers as numbers and a blank as `null`.

    A very large data set is refused with a note: more than 2,000,000 values, counted as rows times
    fields. The application can raise that limit.

??? info "Copy data as JSON"
    The table's data for a program:

    - the header texts above each value column
    - per row, its labels and its values with all their decimals
    - a percentage of "Show as" as the fraction: 0.25 for 25%
    - a collapsed group marked as such

    It is not the view. **Views**, **Copy view as JSON** copies how the report is built, not its
    numbers. See [sharing](views.md#share-a-view).

## File names

The files take the application's report name. When it gives none, they use "pivot":

- `pivot.xlsx`, `pivot.csv`, `pivot.html`, `pivot.png`, `pivot.svg`
- the source data: `pivot-data.csv` and `pivot-data.json`

A downloaded view is `<name>.pivotkit.json`, after the view's or the data's name. See
[views](views.md#share-a-view). The rows behind a number take the cell's name. See
[drill-down](drill-down.md#copy-or-download-the-rows). The live demo names its files after its data
set (`pivotkit-tickets.xlsx`), and after a file you load into it (`quarter-csv.xlsx`).

## Safe to open

Some labels a spreadsheet would run as a formula: those that start with `=` or `@`, or with `+` or
`-` and are no number. In the CSV and in the copies, such a label gets a leading `'`. The Excel file
writes text as text, never as a formula. The HTML report and the SVG write every text as text, never
as markup. See [security](../security.md#exports).

## When copying is not allowed

Some pages do not allow copying: an address without https, or a frame without the permission. There
a note says so: "This page does not allow copying. Download a file instead."

!!! note "For developers"
    - `fileName` names the files.
    - Every file and every copy passes `onExport` first, so the host can keep it or print it its own
      way. The kinds are `xlsx`, `csv`, `html`, `png`, `svg`, `print` with the HTML before the
      dialog opens, `json` for a downloaded view file, `copy-table`, `copy-json`, and `data-csv` and
      `data-json` for the source data. See [React props](../reference/react.md#props).
    - Source data is off unless the host sets `exportData`. See
      [React](../reference/react.md#prop-exportdata) and [web component](../reference/element.md):
      `export-data`. It holds every row and column the report has, also those it does not show. Or
      it holds the columns `exportData` names. The drill-down's exports keep to those as well. See
      [security](../security.md#source-data).
    - Its files are pivotkit-core's `dataToCsvParts` and `dataToJson`. See
      [pivotkit-core](../reference/core.md).
    - The HTML report and the SVG come from [pivotkit-report](../reference/report.md), the same as
      the command line's. See [pivotkit-cli](../reference/cli.md).
    - The shape of Copy data as JSON is [pivotkit-core's `toJson`](../reference/core.md).
    - [Values](../concepts/values.md#export) describes how formats reach Excel and CSV.
