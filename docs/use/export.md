---
title: Export and copy
description: Download a pivotkit report as an Excel workbook, a CSV file or an HTML report, the chart as a PNG or SVG image, print it or save it as PDF, or copy the table into a spreadsheet or as JSON - what each one holds.
---

# Export and copy

**Export** in the toolbar downloads the table as an Excel workbook, a CSV file or an HTML report, the
chart as a picture, prints the report (or saves it as PDF), or copies the table so you can paste it
into a spreadsheet. The Excel file keeps every number with all its decimals and the formats; the CSV,
the HTML report and the copy hold the numbers as the table shows them.

![The Export menu: Excel workbook, CSV file, HTML report and the chart images under Download; Print or save as PDF under Print; Copy table and Copy data as JSON under Copy](../assets/screenshots/export-menu-light.png#only-light)
![The Export menu: Excel workbook, CSV file, HTML report and the chart images under Download; Print or save as PDF under Print; Copy table and Copy data as JSON under Copy](../assets/screenshots/export-menu-dark.png#only-dark)

| Entry | Gives | Best for |
| --- | --- | --- |
| **Excel workbook (.xlsx)** | The table with every number and all its decimals, the number formats, the merged headers, the bold totals and the highlighting. | Calculating on in Excel. |
| **CSV file (.csv)** | The table as text: percentages and "show as" calculations as the table shows them, other numbers with all their decimals. | Other programs. |
| **HTML report (.html)** | A page with the table as it is shown, the chart when the chart is shown, and the filters. Opens in any browser, prints well. | Sending a report to read or to print. |
| **Chart image (.png)** | The chart as drawn. Greyed out while the table is shown ("Switch to Chart first."). | A slide or a message. |
| **Chart image (.svg)** | The chart as a vector image: sharp at any size. Greyed out while the table is shown ("Switch to Chart first."). | A document or a print layout. |
| **Print or save as PDF…** | The HTML report in the browser's print dialog: print it, or pick "Save as PDF" there. | Paper, or a PDF. |
| **Copy table** | The table as it is shown, tab-separated. | Pasting into Excel, Numbers or Google Sheets. |
| **Copy data as JSON** | The table's data for a program. | A developer. |

While no field is placed there is nothing to export: every entry is greyed out with "Add a field
first." under it, and nothing is downloaded or copied.

The menu has three titled groups, **Download**, **Print** and **Copy**. The drill-down's Export menu
has **Download** and **Copy** with the rows behind a number; it has no HTML report, SVG or print. An
**i** next to Excel, CSV, HTML report, Print, Copy table and Copy data as JSON says what each holds.

## What each one holds

??? info "Excel workbook"
    Every number with all its decimals, the number formats, the merged headers, the bold totals and
    the highlighting (colour scales and data bars as Excel's own conditional formats, so they stay
    live). The sheet has the file's name, made valid for Excel: at most 31 characters. Where Excel
    cannot follow a format: bytes and durations are written as plain numbers, compact numbers in
    languages that group by ten thousand (Japanese) as general numbers, and dates before 1900 as text.
    Number labels (a year on rows) stay numbers.

??? info "CSV file"
    UTF-8 with a byte order mark, so Excel reads accents and umlauts right. The separator and the
    decimal mark follow the report's language. Percentages and "show values as" calculations are
    written as the table shows them ("-2.6%"), which spreadsheets read back as the fraction; other
    numbers keep all their decimals (15 significant digits). A row label is repeated on every row it
    spans.

??? info "HTML report"
    One file that opens in any browser, offline: a heading (the loaded view's name, or "Report"), the
    chart when the chart is shown, the table as it is shown (merged headers, bold totals, colour
    scales and data bars, collapsed groups marked "+"; every number as the table writes it), and below
    it the data's name, its rows, the filters in words and when it was made. Light or dark after your
    system on screen, always light on paper. It loads and runs nothing: no script, no address it
    fetches. A very large table is cut after 200,000 cells, and the report says how many rows it
    shows; export Excel or CSV for all of them.

??? info "Chart image"
    The PNG: the chart as drawn, at twice the screen's resolution, on the report's background colour:
    with its title, legend, value labels and group labels. The SVG: the same chart at the size it has
    on the screen, as a vector image on a light background, its texts as text; at most the first 50
    categories, as on the screen.

??? info "Print or save as PDF"
    Opens the browser's print dialog with the HTML report (not the page around it). Every page repeats
    the table's header row and never splits a row; a table with more than 8 columns is printed
    landscape, one with more than 16 in a smaller font, the chart stays whole on its page. To get a
    PDF, pick "Save as PDF" (or "Microsoft Print to PDF") as the printer. Where the page does not allow
    it, a note says so: "This page does not allow printing the report. Download the HTML report
    instead."

??? info "Copy table"
    The table as it is shown: headers, labels and totals, every number as the table writes it
    ("1,234.5", "35.7%"), tab-separated, a row label repeated on every row it spans. Pasted into
    Excel, Numbers or Google Sheets it lands in columns; a spreadsheet in the same language reads the
    numbers back as numbers. After the copy a note says what it gave: "Table copied: tab-separated,
    pastes into Excel or Google Sheets as columns".

??? info "Copy data as JSON"
    The table's data for a program: the header texts above each value column, and per row its labels
    and its values with all their decimals, a percentage of "Show as" as the fraction (0.25 for 25%),
    a collapsed group marked as such. It is not the view: **Views**, **Copy view as JSON** copies how
    the report is built, not its numbers ([sharing](views.md#share-a-view)).

## File names

The files are named after the application's report name, "pivot" when it gives none: `pivot.xlsx`,
`pivot.csv`, `pivot.html`, `pivot.png`, `pivot.svg`. A downloaded view is `<name>.pivotkit.json`, after the view's or the
data's name ([views](views.md#share-a-view)). The rows behind a number are named after the cell
([drill-down](drill-down.md#copy-or-download-the-rows)).

## Safe to open

A label a spreadsheet would run as a formula (it starts with `=`, `@`, or `+` or `-` and is no number)
gets a leading `'`, in the CSV and in the copies. The Excel file writes text as text, never as a
formula. The HTML report and the SVG write every text as text, never as markup
([security](../security.md#exports)).

## When copying is not allowed

Where the page does not allow copying (an address without https, a frame without the permission) a
note says so: "This page does not allow copying. Download a file instead."

!!! note "For developers"
    `fileName` names the files; every file and every copy passes `onExport` first (`xlsx`, `csv`,
    `html`, `png`, `svg`, `print` with the HTML before the dialog opens, `json` for a downloaded view
    file, `copy-table`, `copy-json`), so the host can keep it or print it its own way
    ([React props](../reference/react.md#props)). The HTML report and the SVG are
    [pivotkit-report](../reference/report.md)'s, the same as the command line's
    ([pivotkit-cli](../reference/cli.md)). The shape of Copy data as JSON is
    [pivotkit-core's `toJson`](../reference/core.md); how formats reach Excel and CSV is in
    [Values](../concepts/values.md#export).
