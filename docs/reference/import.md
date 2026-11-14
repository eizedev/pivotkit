---
title: Loading files
description: pivotkit-core/import reads CSV, TSV, text and JSON files (and Excel with the pivotkit-xlsx plugin) into a typed table for the report, in the browser or in Node, with limits checked before the expensive steps.
---

# Loading files

`pivotkit-core/import` reads a file a person picks into a table the report can use: CSV, TSV and
text, JSON, and Excel workbooks with the [pivotkit-xlsx](plugins.md#pivotkit-xlsx) plugin. It runs in
the browser (nothing is uploaded) and in Node. The table it returns is `encode`'s
[columnar input](core.md#columnar-input), so it goes into the engine without an object per row.

!!! note "In the report"
    This page describes the readers. The report uses them itself with
    [`allowImport`](react.md#prop-allowimport) (the element's `allow-import`): a Data menu, a file
    dropped onto the report and a preview where the person picks the column types
    ([Load your own data](../use/load-data.md)). A host that reads a file itself passes the table as
    `data` (`{ columns, types, data }` is the columnar input both take).

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
```

In Node, a file on disk becomes a `File` with its bytes and its name (the name picks the reader):

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

The reader is picked by the file name's extension, then by its media type; the host's plugins come
before the built-in readers (`readerFor`). The built-in readers are plugins too: their code loads when
the first file of their kind is read, so `pivotkit-core/import` itself stays small, and the main entry
`pivotkit-core` does not load any of it.

## How a CSV file is read

- **Encoding**: a byte order mark decides (UTF-8, UTF-16 little or big endian); without one the file
  is read as strict UTF-8, and if a byte is not valid UTF-8 the whole file is read as Windows-1252,
  which Excel writes as "CSV" on a Western Windows. Invalid bytes never become replacement characters.
- **Separator**: Excel's first line `sep=;` names it; else comma, semicolon, tab or vertical bar,
  whichever splits the first 100 lines into the same number of fields most often (a tab first for
  `.tsv`).
- **Quotes**: a value in double quotes may hold the separator, line breaks and doubled quotes (`""`).
  A quote that is never closed stops the read with the line it opened in.
- **The header**: the first row with at least half as many values as the fullest of the first 50
  rows. Lines above it (a title, a date, a licence line, as official exports have) are skipped, with a
  note.

## Column names and values

Every reader gives the same table for the same content: the readers parse their format into rows,
and one shared part (`createTable`) does the rest.

- **Names** are trimmed; control characters and the characters that turn text around (U+202E and its
  kind) are taken out; line breaks and tabs become spaces. An empty name becomes `Column 3` (its
  position); a name that repeats, compared without case, becomes `Name (2)`. Each change is a note.
- **Values** lose control and direction characters; tabs and line breaks become a space; text is
  trimmed and cut at `limits.textLength` characters. Text that looks like a formula (`=`, `+`, `-`,
  `@`) stays as it is: the [exports](../security.md#exports) guard it.
- **Empty rows** are left out; a column without a name and without a single value is left out; a row
  with more values than there are names adds columns named `Column N`. Each is a note.

## How a loaded file is named { #how-a-loaded-file-is-named }

A file loaded in the report ([`allowImport`](react.md#prop-allowimport)) becomes the report's
[`source`](react.md#prop-source) while its data is shown. Its `id` names the views saved for it in the
browser store (`templateStore="browser"`) and in the view files and links shared from it, so the same
file loaded again finds its views and other data does not. The rule, in this order:

1. **The name** is the file's `File.name` as the browser gives it, cleaned as a column name is:
   control characters (but tabs and line breaks), the characters that turn text around and the
   invisible ones (zero-width characters, the soft hyphen, the byte order mark, tag characters, a
   lone half of a surrogate pair) taken out, each run of tabs and line breaks as one space, trimmed;
   then cut to 256 characters (UTF-16 code units, a fixed cut that `limits` does not change, and not
   trimmed again). An empty name becomes `file`. Two names that differ only in characters taken out
   are the same name.
2. **The columns** are the names of the table after the readers' cleanup
   ([above](#column-names-and-values)): cleaned the same way and cut to `limits.name` characters (256
   by default); a number or date in the header row as its text (a date in ISO form); columns without a
   name and without a value left out; an empty name `Column N` (N its place among the columns kept);
   a name that repeats, compared without case, `Name (2)` ("Team" and "team" become "Team" and
   "team (2)"); nested JSON as `a.b`. A type picked in the preview changes nothing.
3. **The hash**: SHA-256 of the UTF-8 bytes of the name and the column names in their order, joined
   with U+0000. The browser's `crypto.subtle` computes it; a page without it (plain `http` on a host
   other than `localhost`) uses pivotkit-react's own implementation, which gives the same digest.
4. **`source.id`** is the shown name, `#` and the first 16 hex digits of the hash.
   **`source.name`** is the shown name: the name itself, or, above 120 characters, its first 117
   followed by `...` (116 when the 117th is the first half of a surrogate pair, so no character is
   split). The hash always covers the whole name.

| File | Columns | `source.id` |
| --- | --- | --- |
| `tickets.csv` | `Id`, `Team`, `Opened`, `Hours`, `Zip` | `tickets.csv#e51bd4bc21e98ee8` |
| `tickets.csv` | `Team`, `Id`, `Opened`, `Hours`, `Zip` | `tickets.csv#d11fe64346f1d906` |

The first row is SHA-256 of `tickets.csv\0Id\0Team\0Opened\0Hours\0Zip`
(`e51bd4bc21e98ee818b3a8efcb49347b…`). Reordered, renamed or added columns, or another file name
(`Tickets.csv` too: the name is compared as it is), make other data. The sheet of a workbook is not
part of it: two sheets with the same columns share their views. The rows are not part of it either: a
newer export of the same table keeps its views.

## Types

A column's type is inferred from all its values, unless the caller names it (`types`, by position or
by column name).

| Values | Type | Notes |
| --- | --- | --- |
| `true`, `false` (also `WAHR`, `FALSCH`), in any case | boolean | |
| `2026-11-10`, `2026-11-10T08:30`, with or without an offset | date | ISO text without an offset is the wall clock as written; with one, an instant read in `encode`'s `timeZone`. |
| `10.11.2026`, `1.2.2026 08:30` | date | Day, month, year. Read before numbers: `10.11.2026` is not the number 10112026. |
| `02/03/2026` | date | The values decide the order (a 13 in the first place is a day); if every value fits both, the `locale` option decides (`en-US`: month first, others day first), with a note. |
| `1234.5`, `-0.25`, `1e3` | number | English: no group separators, so `1,5` is never 15. |
| `1.234,5`, `1234,5` | number | German. A column that fits both notations is read in the one of the separator: German with semicolons, English otherwise. |
| `01067`, `007` | string | A leading zero keeps the column as text: postcodes and identifiers. |
| A whole number of more than 15 digits | string | An identifier; a number would lose digits. |
| Anything else, or a mix | string | |

Values with a type of their own (a spreadsheet's cells, JSON's numbers and booleans) keep it; a column
of one kind is that type, a mix is text. JSON strings stay text unless they are ISO dates, as in
`encode`: JSON says what is a number. A number field named ID, Nr, No, Number or Key stays a number;
the report counts it instead of summing it
([identifier fields](../concepts/fields.md#identifier-fields)).

`retype(table, types)` gives the table with other types from the values as they were read (kept in
`table.raw`), so a preview can let a person change a column's type without reading the file again;
text read as a number goes back to the text the file holds (`1.234,5`). A value that does not convert
is blank, with a note that counts them.

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
| `VALUES_NOT_CONVERTED` | Values that are not of the column's type | `column`, `type`, `count` |
| `JSON_PROPERTY` | The rows were under a property | `property` |
| `JSON_FLATTENED` | Nested objects became `a.b` columns | `example` |
| `SHEET` | A workbook: the sheet read | `sheet`, `count`, `visible` |
| `USED_RANGE` | A workbook's used range reaches far below its values | `usedRow`, `lastRow` |
| `ERROR_CELLS` | Cells with an Excel error (`#N/A`) | `count` |

`message` is the English text (`noteMessage(code, params)`); a UI shows its own text per code.
`params` can quote the file (a sheet name, a JSON key, a separator), cleaned and at most 256
characters: show them as text, never as HTML.

## Limits

Each file is checked against [`LIMITS`](../concepts/limits.md#limits) (the `limits` option merged
over them; in the report, [`importLimits`](react.md#prop-importlimits) over `limits`) before the
step it guards, so a file that is too large costs no memory first:

| Limit | Default | When |
| --- | --- | --- |
| `fileBytes` | 100 MiB | The file's size, before a byte is read. |
| `rows` | 1,000,000 | Rows of the table, counted as they are read. |
| `columns` | 1,000 | Columns, as they appear. |
| `importCells` | 10,000,000 | Rows x columns, counted as they are read. |
| `textLength` | 32,767 | Characters of one value (Excel's cell limit); longer text is cut, with a note. |
| `archiveEntries` | 10,000 | Parts of an archive (an `.xlsx` is a ZIP), from its directory, before anything is unpacked. |
| `unpackedBytes` | 500 MiB | What the parts unpack to, from the directory, before anything is unpacked (a ZIP bomb). |

A file over a limit throws `PivotkitError` `LIMIT_EXCEEDED` with `details` `{ limit, value, max,
file }` and a message that names the file, the limit and what to change: `"tickets.csv" has more than
1,000,000 rows (limits.rows): load a smaller extract of it, or a host can raise this limit`. The
previous data stays. pivotkit-react says it in the report's language from `details` (the limits
`rows`, `columns`, `fileBytes`, `importCells`, `archiveEntries` and `unpackedBytes`;
`labels.dataImport.overLimit` and `limitWhat`), after the file's name: "big.csv could not be
loaded: it has more than 1,000 rows (limits.rows): …"; the key is the one of `limits` also where the
host set `importLimits`. Any other error is the reader's message without the file's name in front.

## Errors

A file that cannot be read throws `PivotkitError` with the code `INVALID_FILE`, `details.file` and
`details.reason`; the message names the file and says what to do.

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

## Progress, cancel and workers

`onProgress({ phase, done, total })` reports `read` (bytes), `unpack` (a workbook's bytes), `parse`
(characters or rows) and is called between steps; `signal` (an `AbortSignal`) stops a read between
steps with the signal's `AbortError`. The readers give the event loop a turn every 16,384 rows, so a
page stays responsive enough to show progress and a Cancel button; for files of tens of megabytes a
host can run `readFile` in a module worker of its own: the readers use no DOM, and the table is plain
arrays, which `postMessage` copies.

The readers start no worker themselves; the report runs the built-in ones in a worker where the host
gives one ([`importWorker`](react.md#prop-importworker); pivotkit-element brings its own,
`dist/import-worker.js`). pivotkit-xlsx hands read-excel-file an uncompressed archive of
the parts it needs, so no `blob:` worker is started (fflate, which read-excel-file unpacks with, would
start one for parts over 512 KiB), and a strict Content-Security-Policy without `worker-src blob:`
works. A host that runs the readers in its own worker needs `worker-src 'self'` (or the worker's
origin).

## Functions

| Name | What |
| --- | --- |
| `readFile(file, options)` | Reads a `File` or `Blob` with the reader that accepts it. Options: `plugins` (the host's reader plugins), `reader` (one plugin, skipping the choice), `sheet` (a workbook's sheet, by name or 0-based index), `types`, `locale`, `limits`, `signal`, `onProgress`, `name` (the file name for messages, for a `Blob`).<br><small>Returns `Promise<ImportTable>`</small> |
| `retype(table, types)` | The table with other column types, from `table.raw`.<br><small>Returns `ImportTable`</small> |
| `readerFor(file, plugins)` | The plugin that accepts a `{ name, type }`, or `undefined`. |
| `loadReader(plugin)` | The plugin's reader module, loaded once and checked (`read`, optional `sheets`). |
| `validatePlugin(plugin)` | Checks a plugin against the [contract](write-a-plugin.md#the-contract); throws `INVALID_ARGUMENT` that says what is wrong. |
| `csvReader`, `jsonReader`, `BUILT_IN_READERS` | The built-in reader plugins. |
| `PLUGIN_API_VERSION` | `1`. |
| `createTable`, `bytesOf`, `readOptions`, `fileName`, `fileError`, `limitError`, `checkFileLimit`, `dateToIso`, `noteMessage` | The shared part of every reader, for [plugins](write-a-plugin.md#the-helpers). |
| `IMPORT_NOTE_CODES`, `IMPORT_TYPES` | The note codes and column types. |

Types: `ImportTable`, `ImportNote`, `ImportType`, `ImportHints`, `ImportProgress`, `ReadOptions`,
`ReaderPlugin`, `ReaderModule`, `SheetInfo`.
