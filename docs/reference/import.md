---
title: Loading files
description: pivotkit-core/import reads CSV, TSV, text and JSON files (and Excel with the pivotkit-xlsx plugin) into a typed table for the report, in the browser or in Node, with limits checked before the expensive steps.
---

# Loading files

`pivotkit-core/import` reads a file a person picks into a table the report can use. It reads:

- CSV, TSV and text
- JSON
- Excel workbooks, with the [pivotkit-xlsx](plugins.md#pivotkit-xlsx) plugin

It runs in the browser, where nothing is uploaded, and in Node. The table it returns is `encode`'s
[columnar input](core.md#columnar-input), so it goes into the engine without an object per row.

!!! note "In the report"
    This page describes the readers. The report uses them itself with
    [`allowImport`](react.md#prop-allowimport), the element's `allow-import`. The person then gets a
    Data menu, can drop a file onto the report, and picks the column types in a preview
    ([Load your own data](../use/load-data.md)). A host that reads a file itself passes the table as
    `data`. Both take the columnar input `{ columns, types, data }`.

```js
import { readFile, retype } from "pivotkit-core/import";
import { encode } from "pivotkit-core";
import xlsxReader from "pivotkit-xlsx";               // optional: Excel workbooks

const table = await readFile(file, {                  // a File from <input type="file"> or a drop
    plugins: [xlsxReader],
    signal: controller.signal,                         // Cancel
    onProgress: ({ phase, done, total }) => show(phase, done / total)
});
table.notes;                                           // what was read how, and what was changed
const data = encode(table);                            // { columns, types, data } is encode's input
const asText = retype(table, { Zip: "string" });       // another type, without reading the file again
const comma = retype(table, {}, { decimal: { Sales: "," } }); // "1,234" in Sales is 1.234
```

In Node, make a `File` from the file's bytes and its name. The name picks the reader:

```js
import { readFile as readBytes } from "node:fs/promises";
import { readFile } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";

const table = await readFile(new File([await readBytes("sales.xlsx")], "sales.xlsx"), { plugins: [xlsxReader] });
```

## Formats

| Format | Reader | Files | What it reads |
| --- | --- | --- | --- |
| CSV, TSV, text | built in (`csvReader`) | `.csv`, `.tsv`, `.txt`, `.tab` | Delimited text with a header row. |
| JSON | built in (`jsonReader`) | `.json` | An array of objects; an array of arrays (the first holds the names); `{ columns, rows }`; the columnar `{ columns, types, data }`; or one of these under a property (`{ "data": [...] }`). |
| Excel | [pivotkit-xlsx](plugins.md#pivotkit-xlsx) | `.xlsx` | One sheet of a workbook: the first visible one, or the one asked for. |

`readerFor` picks the reader by the file name's extension, then by its media type. The host's
plugins come before the built-in readers. The built-in readers are plugins too. Their code loads when
the first file of their kind is read. So `pivotkit-core/import` itself stays small, and the main entry
`pivotkit-core` does not load any of it.

## How a CSV file is read

- **Encoding**: a byte order mark decides: UTF-8, or UTF-16 little or big endian. Bytes that do not
  fit it become the replacement character U+FFFD. Without a byte order mark:
    - Text with a zero byte after or before each character is UTF-16 in little or big endian.
    - Else the reader reads the file as strict UTF-8. If a byte is not valid UTF-8, it reads the whole
      file as Windows-1252, which Excel writes as "CSV" on a Western Windows.
- **Zero characters**: zeros at the end of a file are padding and go. A zero anywhere else means the
  file holds binary data, and the reader refuses it with `BINARY`.
- **Separator**: Excel's first line `sep=;` names it. Else the reader takes comma, semicolon, tab or
  vertical bar, whichever splits the first 100 lines into the same number of fields most often. For
  `.tsv` it tries a tab first.
- **Quotes**: a value in double quotes may hold the separator, line breaks and doubled quotes (`""`).
  A quote that is never closed stops the read with the line it opened in.
- **The header**: the first row with at least half as many values as the fullest of the first 50
  rows. The reader skips the lines above it, with a note. Official exports often have a title, a
  date or a licence line there.

## Column names and values

Every reader gives the same table for the same content. The readers parse their format into rows,
and one shared part (`createTable`) does the rest.

- **Names**: `createTable` trims them. It takes out control characters and the characters that turn
  text around (U+202E and its kind). Line breaks and tabs become spaces. An empty name becomes
  `Column 3`, its position. A name that repeats, compared without case, becomes `Name (2)`. Each
  change is a note.
- **Nested JSON**: the JSON reader flattens a nested object into columns with dotted names.
  `{ "meta": { "Secret": 1 } }` becomes the column `meta.Secret`, with the note `JSON_FLATTENED`.
  It flattens four levels. A deeper object stays JSON text in one column.
- **Values**: `createTable` takes out control and direction characters. Tabs and line breaks become a
  space. It trims text and cuts it at `limits.textLength` characters. Text that looks like a formula
  (`=`, `+`, `-`, `@`) stays as it is: the [exports](../security.md#exports) guard it.
- **Empty rows and columns**: `createTable` leaves out empty rows, and a column without a name and
  without a single value. A row with more values than there are names adds columns named `Column N`.
  Each is a note.

## How a loaded file is named { #how-a-loaded-file-is-named }

A file loaded in the report ([`allowImport`](react.md#prop-allowimport)) becomes the report's
[`source`](react.md#prop-source) while its data is shown. Its `id` names the views saved for it:

- in the browser store (`templateStore="browser"`)
- in the view files and links shared from it

So the same file loaded again finds its views, and other data does not. pivotkit builds the id in
this order:

1. **The name** is the file's `File.name` as the browser gives it. pivotkit cleans it as it cleans a
   column name:
    - It takes out control characters, except tabs and line breaks.
    - It takes out the characters that turn text around.
    - It takes out the invisible ones: zero-width characters, the soft hyphen, the byte order mark,
      tag characters, a lone half of a surrogate pair.
    - Each run of tabs and line breaks becomes one space.
    - It trims the name.
    - Then it cuts the name to 256 characters, counted as UTF-16 code units. The cut is fixed:
      `limits` does not change it, and pivotkit does not trim the name again.

    An empty name becomes `file`. Two names that differ only in characters taken out are the same
    name.


2. **The columns** are the names of the table after the readers' cleanup
   ([above](#column-names-and-values)):
    - pivotkit cleans them the same way and cuts them to `limits.name` characters, 256 by default.
    - A number or date in the header row counts as its text. A date counts in ISO form.
    - It leaves out columns without a name and without a value.
    - An empty name is `Column N`, where N is its place among the columns kept.
    - A name that repeats, compared without case, is `Name (2)`. "Team" and "team" become "Team" and
      "team (2)".
    - Nested JSON is `a.b`.

    A type picked in the preview changes nothing.


3. **The hash** is SHA-256 of the UTF-8 bytes of the name and the column names in their order,
   joined with U+0000. The browser's `crypto.subtle` computes it. A page over plain `http` on a host
   other than `localhost` has no `crypto.subtle`. There pivotkit-core uses its own implementation,
   which gives the same digest.
4. **`source.id`** is the shown name, `#` and the first 16 hex digits of the hash.
   **`source.name`** is the shown name. That is the name itself, or, above 120 characters, its first
   117 followed by `...`. It takes 116 when the 117th is the first half of a surrogate pair, so no
   character is split. The hash always covers the whole name.

| File | Columns | `source.id` |
| --- | --- | --- |
| `tickets.csv` | `Id`, `Team`, `Opened`, `Hours`, `Zip` | `tickets.csv#e51bd4bc21e98ee8` |
| `tickets.csv` | `Team`, `Id`, `Opened`, `Hours`, `Zip` | `tickets.csv#d11fe64346f1d906` |

The first row is SHA-256 of `tickets.csv\0Id\0Team\0Opened\0Hours\0Zip`
(`e51bd4bc21e98ee818b3a8efcb49347b…`). These make other data:

- reordered, renamed or added columns
- another file name, `Tickets.csv` too, since the name is compared as it is

The sheet of a workbook is not part of the id. The views saved, downloaded and linked from a workbook
name their sheet next to the id, in `source.params.sheet`
([view file](view-file.md#the-sheet-of-a-workbook)). So two sheets with the same columns keep their
views apart. A view of another sheet of the same file reads that sheet again when you open it
([saved views](../use/load-data.md#after-loading)). The rows are not part of the id either, so a newer
export of the same table keeps its views.

`sourceIdOf(name, columns)` of `pivotkit-core/import` computes the id and returns a promise of it.
`shownName` and `SHOWN_MAX` give the shown name. The command line names the files it writes a view
for the same way (`describe --suggest`, `render --save-view`). So the report opens such a view as a
view of that file, on its sheet.

## Types

The reader infers a column's type from all its values, unless the caller names it. The caller names
it with `types`, by position or by column name.

| Values | Type | Notes |
| --- | --- | --- |
| `true`, `false` (also `WAHR`, `FALSCH`), in any case | boolean | |
| `2026-11-10`, `2026-11-10T08:30`, with or without an offset | date | ISO text without an offset is the wall clock as written; with one, an instant read in `encode`'s `timeZone`. |
| `10.11.2026`, `1.2.2026 08:30` | date | Day, month, year. Read before numbers: `10.11.2026` is not the number 10112026. |
| `02/03/2026` | date | The values decide the order (a 13 in the first place is a day); if every value fits both, the `locale` option decides (`en-US`: month first, others day first), with a note. |
| `1234.5`, `1,234.5`, `-0.25`, `1e3` | number | English. A comma only separates groups of three digits, so `1,5` is never 15. |
| `1.234,5`, `1234,5` | number | German. A column that fits both notations takes the one of the separator: German with semicolons. Otherwise the `locale` decides: German for a locale that writes `1,5`, else English. When the two notations give different numbers, as for `1,234` or `1.500`, a note names the decimal mark. |
| `01067`, `007` | string | A leading zero keeps the column as text: postcodes and identifiers. |
| A whole number of more than 15 digits, with or without group separators | string | An identifier. A number would lose digits. |
| Anything else, or a mix | string | |

Values with a type of their own keep it, such as a spreadsheet's cells or JSON's numbers and
booleans. A column of one kind is that type. A mix is text. JSON strings stay text unless they are
ISO dates, as in `encode`: JSON says what is a number. A number field named ID, Nr, No, Number or Key
stays a number. The report counts it instead of summing it
([identifier fields](../concepts/fields.md#identifier-fields)).

A JSON number keeps only what a number holds:

- A whole number over 2^53, such as an ID of 19 digits, can lose its last digits. The reader can't
  see the lost digits, so the note `NUMBERS_ROUNDED` counts these numbers.
- A number over about 1.8e308 becomes empty, with the note `NUMBERS_TOO_LARGE`.

Write long IDs as JSON strings.

`retype(table, types)` gives the table with other types. It works from the values as the reader
first read them, which the table keeps in `table.raw`. So a preview can let a person change a column's type without reading
the file again. Text read as a number goes back to the text the file holds (`1.234,5`). A value that
does not convert is blank, with a note that counts them.

`retype(table, types, { decimal })` also picks the decimal mark of number columns, `"."` or `","`,
by column name or by position, as `types` does. It is for a column with the note `DECIMAL_MARK`,
whose values read as different numbers in the two notations. Its text then reads in that mark
alone: with `","`, `1,234` is 1.234 and `1.500` is 1500. A value that does not fit the mark is
blank, with a note that counts them. The note `DECIMAL_MARK` stays and names the mark picked. A
column keeps its mark while its type stays. When its type changes, it reads in its values' notation
again unless `decimal` names a mark for it. The mark applies to text only: a number cell of a
workbook stays as it is.

## The table

| Key | What |
| --- | --- |
| `columns` | The column names, unique without case. |
| `types` | One per column: `"string"`, `"number"`, `"date"` or `"boolean"`. |
| `data` | One array per column, of values of its type; `null` is blank. Dates are ISO text. |
| `raw` | One array per column, the cleaned values as read (a text column shares its array with `data`). `retype` reads it; drop the table once it is encoded. |
| `detected` | The inferred type of each column, before an override. |
| `rowCount` | Rows. |
| `notes` | `{ code, params, message }` for each thing worth saying (table below). |
| `hints` | How text was read (`decimal`, `dateOrder`), so `retype` reads it the same way. |
| `unnamed` | The columns the file gives no name, as named here (`Column 7`): a blank header cell, or a row with more values than the header. Such a column's values may belong to another column, shifted by a separator inside a value; pivotkit-server hides them. A name such as `Column 7` is its position, so a host's rule for it follows whatever column lands there. A reader plugin's own table may leave it out. |
| `longRows` | The rows (0-based) with more cells than the named header (its empty cells at the end left out), whose values may be shifted. None where the file is uniform: every row as wide, every cell beyond the named header empty (a separator that ends every line). In a file with mixed row widths every row wider than the named header counts: a file where only some rows end with a separator has those rows here, or all of them if every row is wider (pivotkit-server's `ROWS_DROPPED` note gives the count). A shifted row of the header's width (a cell at the end dropped), or one in such a uniform file that fills its empty last cell, cannot be told: hidden columns in CSV are safe only in well-formed files. pivotkit-server leaves such rows out of a source with a field below `show`. A reader plugin's own table may leave it out. |

A reader plugin's table built by hand may leave out `raw`, `detected`, `rowCount` and `hints`.
`readFile` fills them in:

- `raw` as `data`
- `detected` as `types`
- the row count
- `hints` as `createTable` sets them for the locale

Without `raw`, a type changed in the preview is read from the typed values, not from the text as the
file had it. A field that is given must be right. This holds for `hints` too: `decimal` is `"."` or
`","`, `dateOrder` is `"dmy"` or `"mdy"`. The table also counts against the limits below. Otherwise
`readFile` throws ([Errors](#errors)).

| Note `code` | When | `params` |
| --- | --- | --- |
| `ENCODING` | Always, for text | `encoding` |
| `SEPARATOR` | Always, for delimited text | `separator`, `name` |
| `LINES_SKIPPED` | A title block above the header | `count` |
| `COLUMN_RENAMED` | An empty or repeated name | `position`, `from`, `to` |
| `COLUMNS_RENAMED_MORE` | More than 20 renamed | `count` |
| `COLUMN_DROPPED` | A column without a name and values | `position` |
| `COLUMNS_ADDED` | Rows longer than the header | `rows`, `count` |
| `ROWS_EMPTY` | Empty rows left out | `count` |
| `TEXT_CUT` | Text longer than `limits.textLength` | `count`, `max` |
| `CHARACTERS_REMOVED` | Control or direction characters | `count` |
| `DATE_ORDER` | Dates with slashes that fit both orders | `column`, `order` |
| `DECIMAL_MARK` | A number column with values the two notations read as different numbers: `1,234`, `1.500` | `column`, `decimal`, `example`, and `point` and `comma`: the example's number with each mark |
| `VALUES_NOT_CONVERTED` | Values that are not of the column's type | `column`, `type`, `count` |
| `NUMBERS_TOO_LARGE` | Numbers too large to hold, such as JSON's `1e999`, left empty | `column`, `count` |
| `NUMBERS_ROUNDED` | Whole numbers over 2^53 and under 1e21 from JSON or a workbook, which may have lost digits | `column`, `count` |
| `JSON_PROPERTY` | The rows were under a property | `property` |
| `JSON_FLATTENED` | Nested objects became `a.b` columns | `example` |
| `SHEET` | A workbook: the sheet read | `sheet`, `count`, `visible` |
| `USED_RANGE` | A workbook's used range reaches far below its values | `usedRow`, `lastRow` |
| `ERROR_CELLS` | Cells with an Excel error (`#N/A`) | `count` |

`message` is the English text (`noteMessage(code, params)`). A UI shows its own text per code.
`params` can quote the file, such as a sheet name, a JSON key or a separator. They are cleaned and at
most 256 characters. Show them as text, never as HTML.

## Limits

pivotkit checks each file against [`LIMITS`](../concepts/limits.md#limits) before the step each
limit guards, so a file that is too large costs no memory first. The `limits` option is merged over
them. In the report, [`importLimits`](react.md#prop-importlimits) is merged over `limits`.

The JSON reader parses a file whole, in one step, after its size check. The parsed objects take
several times the file's size, and the step shows no progress and ignores the abort signal. A host
that reads large JSON files on a small device lowers `fileBytes` for them.

| Limit | Default | When |
| --- | --- | --- |
| `fileBytes` | 100 MiB | The file's size, before a byte is read. |
| `rows` | 1,000,000 | Rows of the table, counted as they are read. |
| `columns` | 1,000 | Columns, as they appear. |
| `importCells` | 10,000,000 | Rows x columns, counted as they are read; a workbook's shared strings and formats too. |
| `textLength` | 32,767 | Characters of one value (Excel's cell limit); longer text is cut, with a note. |
| `archiveEntries` | 10,000 | Parts of an archive (an `.xlsx` is a ZIP), from its directory, before anything is unpacked. |
| `unpackedBytes` | 500 MiB | What the parts unpack to, from the directory, before anything is unpacked (a ZIP bomb). |

A file over a limit throws `PivotkitError` `LIMIT_EXCEEDED` with `details` `{ limit, value, max,
file, what }`. The message names the file, the limit and what to change: `"tickets.csv" has
more than 1,000,000 rows (limits.rows): load a smaller extract of it, or a host can raise this
limit`. `what` is what was counted, in English, as the message says it. The previous data stays.

pivotkit-react says it in the report's language from `details`, after the file's name:
"big.csv could not be loaded: it has more than 1,000 rows (limits.rows): …".

- It does so for the limits `rows`, `columns`, `fileBytes`, `importCells`, `archiveEntries` and
  `unpackedBytes`.
- The texts are `labels.dataImport.overLimit` and `limitWhat`.
- When a workbook's shared strings and formats reach `importCells`, `details.what` names them. The
  report uses the words of `workbookCells`, "different texts and formats".
- The key is the one of `limits`, also where the host set `importLimits`.

Any other error is the reader's message without the file's name in front.

## Errors

A file that cannot be read throws `PivotkitError` with the code `INVALID_FILE`, `details.file` and
`details.reason`. The message names the file and says what to do.

| `reason` | When |
| --- | --- |
| `NO_READER` | No reader accepts the file's extension or type. |
| `WRONG_TYPE` | The file is something else: a workbook named `.csv`, a CSV named `.xlsx`, a PDF, a ZIP of something else. |
| `BINARY` | A text file holds binary data. |
| `UNCLOSED_QUOTE` | A quote is never closed; `details.line`. |
| `INVALID_JSON` | The JSON does not parse. |
| `NO_TABLE` | The JSON holds no table; a workbook has no worksheet. |
| `NO_SHEET` | The sheet asked for is not in the workbook. |
| `XLS`, `XLSB` | An Excel 97-2003 workbook, an Excel binary workbook: save it as `.xlsx` or CSV. |
| `ENCRYPTED` | A password-protected workbook. |
| `MACROS` | A workbook with macros (`.xlsm`, `vbaProject.bin`). |
| `XML_DECLARATION` | A part of a workbook declares a document type or entities, which a workbook never needs. |
| `DAMAGED` | A workbook is damaged, cut off, a part unpacks to more than its directory states, or an XML part holds a text of more than 1 MiB or a tag of more than 256 KiB (an Excel cell holds at most 32,767 characters). |

`readFile` throws `INVALID_ARGUMENT` when a reader plugin returns one of these. Each is a bug of the
plugin, and the message names the plugin and the field.

- a table of another shape
- a field given wrong (`rowCount`, `raw`, `detected`, `hints`)
- a note without a `code`
- a table whose fields throw when read

## Progress, cancel and workers

`onProgress({ phase, done, total })` is called between steps. It reports these phases:

- `read`: bytes
- `unpack`: a workbook's bytes
- `parse`: characters or rows
- `type`: columns, for a plugin that checks its columns' types in a step of its own. The built-in
  readers do not report it.

`signal`, an `AbortSignal`, stops a read between steps with the signal's `AbortError`. The readers
give the event loop a turn every 16,384 rows. So a page stays responsive enough to show progress and a
Cancel button. For files of tens of megabytes, a host can run `readFile` in a module worker of its
own. The readers use no DOM, and the table is plain arrays, which `postMessage` copies.

The readers start no worker themselves. The report runs the built-in ones in a worker where the host
gives one ([`importWorker`](react.md#prop-importworker)). pivotkit-element brings its own,
`dist/import-worker.js`. pivotkit-xlsx hands read-excel-file an uncompressed archive of the parts it
needs, so no `blob:` worker starts. read-excel-file unpacks with fflate, which would start one for
parts over 512 KiB. So a strict Content-Security-Policy without `worker-src blob:` works. A host that
runs the readers in its own worker needs `worker-src 'self'`, or the worker's origin.

## Functions

| Name | What |
| --- | --- |
| `readFile(file, options)` | Reads a `File` or `Blob` with the reader that accepts it. Options: `plugins` (the host's reader plugins), `reader` (one plugin, skipping the choice), `sheet` (a workbook's sheet, by name or 0-based index), `types`, `locale`, `limits`, `signal`, `onProgress`, `name` (the file name for messages, for a `Blob`).<br><small>Returns `Promise<ImportTable>`</small> |
| `retype(table, types, options)` | The table with other column types, from `table.raw`. Options: `decimal` (the decimal mark of number columns, by name or position).<br><small>Returns `ImportTable`</small> |
| `readerFor(file, plugins)` | The plugin that accepts a `{ name, type }`, or `undefined`. |
| `loadReader(plugin)` | The plugin's reader module, loaded once and checked (`read`, optional `sheets`). |
| `validatePlugin(plugin)` | Checks a plugin against the [contract](write-a-plugin.md#the-contract); throws `INVALID_ARGUMENT` that says what is wrong. |
| `csvReader`, `jsonReader`, `BUILT_IN_READERS` | The built-in reader plugins. |
| `PLUGIN_API_VERSION` | `1`. |
| `createTable`, `bytesOf`, `readOptions`, `fileName`, `fileError`, `limitError`, `checkFileLimit`, `dateToIso`, `noteMessage`, `cleanText` | The shared part of every reader, for [plugins](write-a-plugin.md#the-helpers). |
| `IMPORT_NOTE_CODES`, `IMPORT_TYPES` | The note codes and column types. |

Types: `ImportTable`, `PluginTable` (what a plugin's `read` returns), `ImportNote`, `ImportType`,
`ImportHints`, `ImportProgress`, `ReadOptions`, `ReaderPlugin`, `ReaderModule`, `SheetInfo`.
