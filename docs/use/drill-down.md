---
title: The rows behind a number
description: Click a value of a pivotkit report to see the source rows behind it, enlarge the panel, and, where the application allows it, copy or download those rows as tab-separated text, JSON, CSV or Excel.
---

# The rows behind a number

Click a value in the table. In the chart, click a bar, a point or a heatmap cell and pick
**Show the rows**. A panel shows the rows of the data behind it: which tickets make up "648", or
which sales add up to a region's revenue. Where the application allows it, you can copy the rows or
download them from there.

![The rows behind the value Service Desk, P3 Medium: 648 rows with all their fields](../assets/screenshots/drill-down-light.png#only-light)
![The rows behind the value Service Desk, P3 Medium: 648 rows with all their fields](../assets/screenshots/drill-down-dark.png#only-dark)

## Open and close the panel

| To | Do |
| --- | --- |
| Open it | Click a value, or move to it with the arrow keys and press Enter or Space. In the chart, click a bar, a point or a heatmap cell and pick **Show the rows**, or double-click it. On a phone, tap it twice, then pick **Show the rows**: the first tap shows its tooltip. |
| Give it the whole report | **Enlarge**. **Reduce** or Escape brings it back to its size. The focus stays on the button. |
| Close it | Press Escape, use its close button, or click beside it. When the panel is enlarged, press Escape twice. The focus returns to the value. |

??? info "What the panel shows"
    - The panel formats the rows as the table formats them: dates as dates, numbers in your language,
      yes/no fields as "Yes" and "No".
    - The panel covers the report while it is open, and the focus stays in it.
    - It lists up to 1,000 rows by default. With more rows behind the value, its title line says
      "Showing the first 1,000 of 4,210 rows". The application can raise the limit.
    - A blank cell with no rows behind it opens nothing.
    - Each column is as wide as its content. A long text wraps inside its column, so the panel scrolls
      sideways less.
    - On a narrow report the panel already fills the report and has no Enlarge. Enlarge is not part of
      the saved view.

## Copy or download the rows

![The rows behind the grand total, enlarged, with the Export menu open: Copy, Copy as JSON, Download CSV, Download Excel, and the note that it holds the first 1,000 of 4,000 rows](../assets/screenshots/drill-export-light.png#only-light)
![The rows behind the grand total, enlarged, with the Export menu open: Copy, Copy as JSON, Download CSV, Download Excel, and the note that it holds the first 1,000 of 4,000 rows](../assets/screenshots/drill-export-dark.png#only-dark)

The panel has an **Export** menu with two groups, **Copy** and **Download**:

| Entry | Gives |
| --- | --- |
| **Copy** | The rows as the panel shows them, with dates and numbers in your language. They are tab-separated, with a header row. When you paste them into Excel, Numbers or Google Sheets, they land in columns. A spreadsheet in the same language reads the numbers and dates back as numbers and dates. An **i** says so. |
| **Copy as JSON** | The rows as objects for a program, with the data's field names and raw values: numbers as numbers, dates as ISO dates, a blank as `null`. |
| **Download CSV**, **Download Excel** | The rows with the headers the panel shows. Each value has the format it has in the panel: a field's format, numbers with up to 6 decimals, dates as their day. The Excel file keeps numbers and dates as numbers and freezes the header row. |

??? info "File names, large values and notes"
    - The application decides whether the panel has the Export menu. Without it, the panel shows the
      rows but offers no copy and no download.
    - The file and its sheet take the cell's name: `Central – Jul 2026.csv`.
    - With more rows behind the value than the panel shows, every export holds the rows shown. The menu
      says "Holds the first 1,000 of 4,212 rows, as shown here.", and the note after a copy says
      "Copied 1,000 of 4,212 rows".
    - A copy says what it gave, such as "Copied 25 rows: …". The notes show above the open panel.
    - Text a spreadsheet would run as a formula gets a leading `'`, as in every export. See
      [security](../security.md#exports).

!!! note "For developers"
    - `drillDown` turns the panel off.
    - `drillDownLimit` sets how many rows it gets.
    - `onCellClick` gives the host the clicked cell and its rows.
    - `fieldDefaults.drillFormat` sets a field's format in the panel.
    - Every copy and file passes `onExport` first: `drill-copy`, `drill-json`, `drill-csv`,
      `drill-xlsx`.
    - The Export menu follows `exportData`. With `exportData` off, `drillDownExport` turns it on.
    - `exportData={{ columns }}` keeps its copies and files to those columns.

    See the [pivotkit-react reference](../reference/react.md#props).
