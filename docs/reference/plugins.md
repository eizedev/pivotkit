---
title: Plugins
description: The official pivotkit plugins (pivotkit-xlsx for Excel workbooks), how to install them for React and the web component, and how to find and list plugins.
---

# Plugins

A plugin adds what not every host needs, as a package of its own, so the report stays small for the
others. Plugin API version 1 knows one kind: **readers**, which read a file format into a table
([Loading files](import.md)). A plugin is a small descriptor; its code loads only when a person reads
a file of its kind.

## Official plugins

Official plugins are named `pivotkit-*`, live in the [pivotkit repository](https://github.com/eizedev/pivotkit)
next to the engine, are tested with every change and are published to npm by its release workflow,
with npm provenance.

| Plugin | What | Size (gzip) | pivotkit-core |
| --- | --- | --- | --- |
| <span id="pivotkit-xlsx"></span>[`pivotkit-xlsx`](https://www.npmjs.com/package/pivotkit-xlsx) | Excel workbooks (`.xlsx`): one sheet, the first visible one or the one asked for; dates from the cell formats; the values Excel saved, never formulas. Refuses `.xls`, `.xlsb`, macro and password-protected workbooks, ZIP bombs and XML with a document type, before anything is parsed. Built on [read-excel-file](https://www.npmjs.com/package/read-excel-file) (MIT). | 0.2 KiB descriptor, 30.6 KiB when the first workbook is read | 0.6 (plugin API 1) |

### pivotkit-xlsx

With a bundler (React, or the web component in a built app):

```bash
npm install pivotkit-xlsx
```

In the report, as a plugin of its Data menu and of files dropped onto it
([Load your own data](../use/load-data.md)):

```jsx
import xlsxReader from "pivotkit-xlsx";

<PivotReport data={rows} allowImport plugins={[xlsxReader]} />
```

```js
import "pivotkit-element";
import xlsxReader from "pivotkit-xlsx";

const report = document.querySelector("pivot-report");   // <pivot-report allow-import>
report.plugins = [xlsxReader];
```

pivotkit-element does not bundle pivotkit-xlsx: a page that reads only CSV and JSON loads none of it.

Or on its own, with `readFile`:

```js
import { readFile } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";

const table = await readFile(file, { plugins: [xlsxReader] });
```

Without a bundler (the web component on a plain page): the package's `dist/` holds the plugin as
ES modules with read-excel-file and fflate bundled; serve the whole `dist/` folder, since the reader
is a chunk loaded on demand. Its licences are in `dist/THIRD_PARTY_LICENSES.txt`.

```html
<pivot-report allow-import></pivot-report>
<script type="module" src="/assets/pivotkit-element/dist/index.js"></script>
<script type="module">
    import xlsxReader from "/assets/pivotkit-xlsx/dist/index.js";
    document.querySelector("pivot-report").plugins = [xlsxReader];
</script>
```

The plugin is code of the page: the report reads its files on the page, never in the import worker,
and the workbook's reader loads only when the first workbook is read.

What it reads and refuses:

| | |
| --- | --- |
| Sheets | The first visible worksheet; another by name or position (`sheet`); `sheets(file)` from `pivotkit-xlsx/reader` lists them with `visible`. Hidden sheets are listed, never read unless asked for. |
| Values | Numbers, text (shared and inline), booleans; a date where the cell's format is a date format; a formula's saved value. A cell with an Excel error (`#N/A`) is blank, with a note. A time without a date reads as that time on 30 December 1899, Excel's day 0. |
| The used range | Rows without a value are left out while the sheet is unpacked, before it is parsed: a sheet whose formatting reaches row 900,000 below 94,000 rows of data is read as 94,000 rows, with a note. A value beyond `limits.rows` or `limits.columns`, or a sheet whose values span more than `limits.importCells`, is refused at that point too, before the parser makes the sheet a dense table. |
| Refused | `.xls` (Excel 97-2003), `.xlsb`, `.xlsm` and any workbook with `vbaProject.bin` or the macro content type, password-protected workbooks, encrypted ZIP entries; a ZIP whose directory names more than `limits.archiveEntries` parts or more than `limits.unpackedBytes` bytes (checked before anything is unpacked); a part that unpacks to more than its directory states; `<!DOCTYPE` or `<!ENTITY` in any XML part it reads. |
| Content-Security-Policy | No worker, no `eval`, no inline script: a strict policy works (`script-src 'self'`). |

??? info "Measured: 94,000 rows x 20 columns"
    A generated ticket export of 94,000 rows and 20 columns of mixed types (12 MB), and the same with
    all 20 columns formatted to row 900,000 (52 MB), read on a Mac (Apple silicon, Node 26, Chromium of
    Playwright 1.64) by `npm run bench -w pivotkit-xlsx -- --browser`. Approximate; machines differ.

    | File | pivotkit-xlsx, Node | read-excel-file alone, Node | pivotkit-xlsx, Chromium (strict CSP) |
    | --- | --- | --- | --- |
    | 12 MB, 94,000 rows | 2.3 s, about 650 MB more memory (RSS) | 1.2 s, about 500 MB | 2.0 s |
    | 52 MB, used range to row 900,000 | 4.4 s, about 780 MB | 7.8 s, about 2,100 MB | 4.0 s |

    pivotkit-xlsx takes longer than read-excel-file alone on a plain file: it unpacks and checks the
    sheet itself, copies it once more into the archive read-excel-file gets, and cleans and types the
    columns. On the used-range file it is twice as fast and needs less than half the memory, since the
    empty rows never reach the parser.

## Find plugins

- Official plugins: the table above, and `pivotkit-*` packages of the repository.
- Plugins of others carry the npm keyword `pivotkit-plugin`:
  [search npm](https://www.npmjs.com/search?q=keywords%3Apivotkit-plugin).
- To list your plugin on this page, open a pull request that adds it to a table "Plugins of others"
  here, with a link to its source.

!!! warning "A plugin runs in your page"
    A reader plugin is code that runs with the rights of your page and sees the files people read
    with it. Use plugins whose source you can read, pin them to an exact version, and check a new
    version before you update. pivotkit checks a plugin's descriptor (`validatePlugin`) and the
    shape of the table it returns (`readFile`), but it cannot make a plugin's own code safe.

## Write a plugin

The contract, the rules a reader follows and a complete example to copy:
[Write a plugin](write-a-plugin.md).
