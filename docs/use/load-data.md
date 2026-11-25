---
title: Load your own data
description: Load a CSV, TSV, text, JSON or Excel file into a pivotkit report in the browser - drop it onto the report or pick it from the Data menu, check the preview and the column types, go back to the original data.
---

# Load your own data

Where the application allows it, the report reads a file of yours. Drop it onto the report, or pick
it under **Data**, **Load data…**. Before the report replaces its data, a preview shows what it read.
The file stays on your computer:

- Your browser reads it, and nothing is uploaded.
- After a reload, the application's own data is back.

![The Data menu: the data source with its name, rows and columns; Load data… and the hint to drop a file](../assets/screenshots/data-menu-light.png#only-light)
![The Data menu: the data source with its name, rows and columns; Load data… and the hint to drop a file](../assets/screenshots/data-menu-dark.png#only-dark)

## Load a file

1. Drag the file from your desktop onto the report and let go, or open **Data** in the toolbar and
   pick **Load data…**.
2. Check the preview: the first rows, the type of each column, and the notes on what was read.
3. Change a column's type where it is wrong, for example a postcode to **Text**. Or pick another
   sheet of a workbook.
4. Click **Load data**. **Cancel** or Escape keeps the data you had.

| Format | Files |
| --- | --- |
| CSV, TSV, text | `.csv`, `.tsv`, `.txt`, `.tab`: commas, semicolons, tabs or vertical bars; German or English numbers and dates |
| JSON | `.json`: a list of records, or a table under a property |
| Excel workbook | `.xlsx`, where the application added the Excel plugin; one sheet at a time |

The Data menu says which formats the report reads, for example
"Reads Excel workbook, CSV or text, and JSON".

![A file dragged over the report: a dashed box says to let go and which formats the report reads](../assets/screenshots/import-drop-light.png#only-light)
![A file dragged over the report: a dashed box says to let go and which formats the report reads](../assets/screenshots/import-drop-dark.png#only-dark)

## The preview

![The preview of tickets-2026.csv: 240 rows, 6 columns; the first rows with a type under each column name; four notes; Cancel and Load data](../assets/screenshots/import-preview-light.png#only-light)
![The preview of tickets-2026.csv: 240 rows, 6 columns; the first rows with a type under each column name; four notes; Cancel and Load data](../assets/screenshots/import-preview-dark.png#only-dark)

| Part | What |
| --- | --- |
| Title | "Load tickets.csv", with the rows, the columns and the file's size. |
| Sheet | A workbook with more than one sheet: which one to read. A hidden sheet says "(hidden)". Another sheet reads the file again. |
| The first rows | Eight rows as they will be loaded, numbers in your language's notation. |
| Type | Under each column name: **Text**, **Number**, **Date** or **Yes/No**. The report picks one from the values. You can change it here. A value that does not fit the type you pick stays empty, and a note counts these values. |
| Decimal mark | When a value such as `1,234` can be read two ways, its column asks what it means: 1234 (thousands) or 1 point 234. |
| Notes | How the report read the file and what it changed: the encoding, the separator, lines skipped above the column names, empty rows left out, columns renamed, values cut, and numbers that could read two ways or were too long or too large. |

While the report reads a large file, the preview shows the progress, with **Cancel**. The preview
shows up to 60 columns. The others keep the type and decimal mark the report found.

??? info "How the types are found"
    - A column of whole and decimal numbers is a **Number**, in German (`1.234,5`) or English
      (`1,234.5`) notation. When some values read as different numbers in the two, such as
      `1,234`, a note names the decimal mark the report used. To change it, pick what the value means
      under the column name. A column after the first 60 keeps it; change the file for that one.
    - Dates such as `10.11.2026`, `2026-11-10` or `11/10/2026` are a **Date**.
    - `true` and `false`, and also `WAHR` and `FALSCH`, are **Yes/No**.
    - A number stays **Text** when it has a leading zero, such as the postcode `01067`, or more than
      15 digits, such as an identifier. So nothing is lost.
    - Values counts a column with an ID-like name instead of summing it, such as ID, Nr, No, Number
      or Key. See [adding fields](fields.md#adding-fields).

## After loading

![The report on the loaded file: Team in Rows, State in Columns, Sum of Hours; a dot on Data and "tickets-2026.csv, only in this browser" under the table](../assets/screenshots/import-loaded-light.png#only-light)
![The report on the loaded file: Team in Rows, State in Columns, Sum of Hours; a dot on Data and "tickets-2026.csv, only in this browser" under the table](../assets/screenshots/import-loaded-dark.png#only-dark)

- The field list shows the file's columns. Fields of the report that the file has too stay where they
  were. The others go.
- **Data** carries a dot. The line under the result names the file, and for a workbook also the
  sheet: "tickets.csv, only in this browser".
- A note says what the report loaded, with **Undo**: "tickets.csv loaded: 240 rows, 6 columns".
- Views you save then belong to this file. When you load a file with the same name and the same
  columns in the same order, **Views** offers them again. This also works for a newer export with
  other rows. A renamed file makes it other data. So do renamed columns, added columns or columns in
  another order. The application's data and other files do not show these views. See
  [saved views](views.md) and
  [how a file is named](../reference/import.md#how-a-loaded-file-is-named).
- A view saved on a sheet of a workbook remembers the sheet. While the report shows a workbook of
  that name, **Views** lists the views of its other sheets too, with the sheet next to each
  ("Sheet “Q3”"). Opening one reads that sheet of the file again and shows the view on it. So after a
  reload, you load the workbook as it comes and open the view. The preview starts on the first
  sheet. A view file or link made on a sheet does the same under **Open view file…**. **Undo** first
  takes back the view, then the reading of the sheet.
- The sheet loads by itself, unless it has no rows or the reader has notes on it, such as a used
  range, values it could not read or columns it renamed. Then the preview stays open with the
  notes and a line that says which view needs the sheet:
  "Opening “Q3 by region” needs the sheet “Q3”." **Load data** loads the sheet and opens the view.
- If you pick another sheet in that preview, it does not load by itself. **Load data** loads it, and
  the report does not open the view:
  "“Q3 by region” was not opened: it was made for the sheet “Q3”."
- **Cancel** while the report reads the sheet, or in its preview, keeps the sheet and the view you
  had. The view you chose is dropped, so loading that sheet later does not open it. If you drop a
  file meanwhile, it takes the place
  of the read, and the report does not open the view on it.
- An application that checks the files you load checks that sheet too, and may refuse it. Then the
  report does not open the view, and a note says so.
- A view whose sheet the workbook no longer has says so, and the report shows it on the sheet you
  have: "“Q3 by region” was made for the sheet “Q3”, which quarters.xlsx does not have."

## Back to the original data

- **Data**, **Back to original data** shows the application's data again, with the view you had on it.
  The entry is there only while the report shows a file's data.
- **Undo** takes back loading too: first your changes on the file, then the loading itself. **Redo**
  goes forward again, file and changes included.
- Undo goes back over the last three data steps. Data steps are loads and Back to original data.
  The report lets older ones go, because each one keeps a whole data set.
- Reloading the page shows the application's data. The report does not keep the file.
- Some applications build the report anew on the same page, for example on a change of light and
  dark. Then the file comes back with your view and your Undo steps, as long as the application's
  data is the same. After **Back to original data** it does not come back.

## When a file cannot be loaded

The data you had stays, and a note says why. A note about a limit is in the report's language. Any
other reason is in the words of the reader, in English.

| Note | What to do |
| --- | --- |
| "tickets.csv could not be loaded: the quote that opens a value in line 12 is never closed." | Fix the line in the file, or export it again. |
| "big.csv could not be loaded: it has more than 1,000,000 rows (limits.rows): load a smaller extract of it, or a host can raise this limit" | Load a smaller extract. The application can raise the limit. An application can allow fewer rows for a file than its own data has. The same note names the other limits: columns, bytes, or values (rows x columns). For a workbook it also names too many different texts and formats, the parts in its ZIP directory, or the bytes it unpacks to. |
| "… the workbook holds macros …", "… an Excel 97-2003 workbook …", "… protected with a password …" | Save it as an Excel workbook (`.xlsx`) without macros, or as CSV. |
| "… no reader for this kind of file." | The report does not read this format, for example a PDF. Save the data as CSV. |
| "Drop one file at a time." | You dropped more than one file. |

An empty report of an application without data of its own says "Load data to start", with "Drop a
file onto the report, or" and **Load data…**.

When the report cannot read a sheet of a workbook, it says why above the sheet list. Pick another
sheet, or **Cancel**. A note about a file that could not be loaded closes when you drop or pick the
next file.

![The empty report: the three steps, and below them "Or load your own data: drop a file onto the report, or" with Load data…](../assets/screenshots/import-empty-light.png#only-light)
![The empty report: the three steps, and below them "Or load your own data: drop a file onto the report, or" with Load data…](../assets/screenshots/import-empty-dark.png#only-dark)

## Keyboard, screen readers, phones

- **Data** is a toolbar button like the others. Tab to it, and Enter opens it. **Load data…** is the
  first entry. On a narrow report it is under **More**, which then carries the dot.
- The preview is a dialog. The focus moves in, Tab stays inside, and Escape cancels. Afterwards the
  focus goes back to where it was.
- When the first rows are there, the focus is on **Load data**, so Enter loads. Tab from there goes
  to the sheet and the types, each a list named like "Type of Hours", and to the decimal marks, each
  named by its question and column, like "“1,234” means (decimal mark of Sales)". Shift+Tab goes to
  **Cancel**.
- After you pick another sheet, the focus stays on the sheet list.
- The dialog's description is its line of rows and columns and its notes, so a screen reader reads
  them out.
- Undo's keys, Ctrl+Z and Ctrl+Y, do nothing while the preview is open.
- On a phone the preview fills the width of the window. The table scrolls sideways.

![The preview on a phone: the table scrolls sideways, the notes below, Cancel and Load data](../assets/screenshots/import-phone-light.png#only-light)
![The preview on a phone: the table scrolls sideways, the notes below, Cancel and Load data](../assets/screenshots/import-phone-dark.png#only-dark)

!!! note "For developers"
    Loading data is off by default. `allowImport` (React) or the attribute `allow-import` (the web
    component) turns it on. Excel needs the [pivotkit-xlsx plugin](../reference/plugins.md#pivotkit-xlsx)
    in `plugins`. `onDataLoad` (React) or the event `pivot-data-load` reports every change of the data
    shown and can refuse a file. A file comes back after a new mount of the report only with a
    `storageKey`: see the [details](../reference/react.md#prop-allowimport). A file's limits are
    [`importLimits`](../reference/react.md#prop-importlimits) over `limits`, so you can keep uploads
    smaller than the host's data. See the [React props](../reference/react.md#prop-allowimport), the
    [element reference](../reference/element.md#prop-allowimport) and
    [Loading files](../reference/import.md) for what the readers do.
