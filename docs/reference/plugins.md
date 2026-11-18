---
title: Plugins
description: The official pivotkit plugins (pivotkit-xlsx for Excel workbooks), how to install them for React and the web component, and how to find and list plugins.
---

# Plugins

A plugin is a package of its own that adds what not every host needs. The report stays small for
the other hosts. Plugin API version 1 knows one kind of plugin: **readers**, which read a file format
into a table ([Loading files](import.md)). A plugin is a small descriptor. Its code loads only when a
person reads a file of its kind.

## Official plugins

Official plugins:

- are named `pivotkit-*`
- live in the [pivotkit repository](https://github.com/eizedev/pivotkit) next to the engine
- are tested with every change
- are published to npm by the repository's release workflow, with npm provenance

| Plugin | What | Size (gzip) | pivotkit-core |
| --- | --- | --- | --- |
| <span id="pivotkit-xlsx"></span>[`pivotkit-xlsx`](https://www.npmjs.com/package/pivotkit-xlsx) | Excel workbooks (`.xlsx`): one sheet, the first visible one or the one asked for; dates from the cell formats; the values Excel saved, never formulas. Refuses `.xls`, `.xlsb`, macro and password-protected workbooks, ZIP bombs and XML with a document type, before anything is parsed. Built on [read-excel-file](https://www.npmjs.com/package/read-excel-file) (MIT). | 0.2 KiB descriptor, 31.4 KiB when the first workbook is read | 0.8 (plugin API 1) |

### pivotkit-xlsx

With a bundler, for React or the web component in a built app:

```bash
npm install pivotkit-xlsx
```

In the report, it serves the Data menu and files dropped onto the report
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

pivotkit-element does not bundle pivotkit-xlsx. A page that reads only CSV and JSON loads none of it.

You can also use it on its own, with `readFile`:

```js
import { readFile } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";

const table = await readFile(file, { plugins: [xlsxReader] });
```

Without a bundler, for the web component on a plain page, use the package's `dist/`. It holds the
plugin as ES modules with read-excel-file and fflate bundled. Serve the whole `dist/` folder, because
the reader is a chunk that loads on demand. Its licences are in `dist/THIRD_PARTY_LICENSES.txt`.

```html
<pivot-report allow-import></pivot-report>
<script type="module" src="/assets/pivotkit-element/dist/index.js"></script>
<script type="module">
    import xlsxReader from "/assets/pivotkit-xlsx/dist/index.js";
    document.querySelector("pivot-report").plugins = [xlsxReader];
</script>
```

The plugin is code of the page. The report reads its files on the page, never in the import worker.
The workbook's reader loads only when the report reads the first workbook.

What it reads and refuses:

| | |
| --- | --- |
| Sheets | The first visible worksheet. Another one by name or position (`sheet`). `sheets(file)` from `pivotkit-xlsx/reader` lists them with `visible`. It lists hidden sheets but reads one only when asked for it. |
| Values | - numbers, text (shared and inline) and booleans<br>- a date where the cell's format is a date format<br>- a formula's saved value<br>A cell with an Excel error (`#N/A`) is blank, with a note. A time without a date reads as that time on 30 December 1899, Excel's day 0. |
| The used range | The reader leaves out rows without a value while it unpacks the sheet, before it parses it. A sheet whose formatting reaches row 900,000 below 94,000 rows of data reads as 94,000 rows, with a note. At that point the reader also refuses a value beyond `limits.rows` or `limits.columns`, and a sheet whose values span more than `limits.importCells`. This happens before the parser makes the sheet a dense table. |
| Shared strings and formats | The parser gets only the shared strings up to the highest one a cell of the sheet names. They and the cell and number formats count together against `limits.importCells`, plus 1,000 rows for a title block. The reader checks this while it unpacks them. Strings are numbered across the workbook, so the reader refuses a sheet that names a string past that limit. The parser keeps an entry for each, so a file of a few hundred kilobytes cannot make millions of them. |
| Refused | - `.xls` (Excel 97-2003), `.xlsb` and `.xlsm`<br>- any workbook with `vbaProject.bin` or the macro content type<br>- password-protected workbooks and encrypted ZIP entries<br>- a ZIP whose directory names more than `limits.archiveEntries` parts or more than `limits.unpackedBytes` bytes, checked before anything is unpacked<br>- a part that unpacks to more than its directory states<br>- `<!DOCTYPE` or `<!ENTITY` in any XML part it reads<br>- a `<` inside a tag, which XML never allows (as `DAMAGED`)<br>- a sheet named as the workbook's shared strings or styles (as `DAMAGED`) |
| Content-Security-Policy | It uses no worker, no `eval` and no inline script. A strict policy (`script-src 'self'`) works. |

??? info "Measured: 94,000 rows x 20 columns"
    `npm run bench -w pivotkit-xlsx -- --browser` read two files on a Mac (Apple silicon, Node 26,
    Chromium of Playwright 1.64):

    - a generated ticket export of 94,000 rows and 20 columns of mixed types (12 MB)
    - the same with all 20 columns formatted to row 900,000 (52 MB)

    The numbers are approximate. Machines differ.

    | File | pivotkit-xlsx, Node | read-excel-file alone, Node | pivotkit-xlsx, Chromium (strict CSP) |
    | --- | --- | --- | --- |
    | 12 MB, 94,000 rows | 2.3 s, about 650 MB more memory (RSS) | 1.2 s, about 500 MB | 2.0 s |
    | 52 MB, used range to row 900,000 | 4.4 s, about 780 MB | 7.8 s, about 2,100 MB | 4.0 s |

    On a plain file, pivotkit-xlsx takes longer than read-excel-file alone. It unpacks and checks the
    sheet itself, copies it once more into the archive read-excel-file gets, and cleans and types the
    columns. On the used-range file it is twice as fast and needs less than half the memory, because
    the empty rows never reach the parser.

## Find plugins

- Official plugins: the table above, and `pivotkit-*` packages of the repository.
- Plugins of others carry the npm keyword `pivotkit-plugin`:
  [search npm](https://www.npmjs.com/search?q=keywords%3Apivotkit-plugin).
- To list your plugin on this page, open a pull request that adds it to a table "Plugins of others"
  here, with a link to its source.

!!! warning "A plugin runs in your page"
    A reader plugin is code that runs with the rights of your page. It sees the files people read
    with it. Use plugins whose source you can read, pin them to an exact version, and check a new
    version before you update. pivotkit checks a plugin's descriptor (`validatePlugin`) and the
    shape of the table it returns (`readFile`). It cannot make a plugin's own code safe.

## Write a plugin

The contract, the rules a reader follows and a complete example to copy:
[Write a plugin](write-a-plugin.md).
