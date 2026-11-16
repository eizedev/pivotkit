# pivotkit-xlsx

A reader plugin for [pivotkit](https://pivotkit.eize.dev/). It loads Excel workbooks (.xlsx) into a
pivot report in the browser. It uploads nothing.

## Install

```bash
npm install pivotkit-xlsx
```

- ES modules for Node 22 or later and browsers from Chrome 111, Firefox 113 and Safari 16.4.
- It needs pivotkit-core with `pivotkit-core/import`, plugin API 1.
- A page without a bundler serves the whole `dist/` directory. It holds the plugin and the reader
  chunk the plugin loads. The licenses are in `dist/THIRD_PARTY_LICENSES.txt`.
- The package includes TypeScript declarations.

## Example

```js
import { readFile } from "pivotkit-core/import";
import { encode } from "pivotkit-core";
import xlsxReader from "pivotkit-xlsx";

// in the browser: a File from <input type="file"> or a drop; in Node: new File([bytes], "sales.xlsx")
const table = await readFile(file, { plugins: [xlsxReader] }); // the first visible sheet
const data = encode(table);                                      // typed columns for the report
```

## Checks on every file

Before it parses a file, pivotkit-xlsx:

- Refuses `.xls` and `.xlsb` files, workbooks with macros, password-protected workbooks, ZIP bombs
  and XML with a document type. For each, it says what to do.
- Leaves out a used range of formatted empty cells far below the data, while it unpacks the sheet.

It builds on [read-excel-file](https://www.npmjs.com/package/read-excel-file) (MIT). It starts no
worker, so a strict Content-Security-Policy works.

## Where in the docs

| Topic | Page |
| --- | --- |
| What it reads and refuses, sizes, measurements | [Plugins: pivotkit-xlsx](https://pivotkit.eize.dev/reference/plugins/#pivotkit-xlsx) |
| Types, notes, limits and errors of a loaded table | [Loading files](https://pivotkit.eize.dev/reference/import/) |
| Security of loaded files | [Security](https://pivotkit.eize.dev/security/#loaded-files-are-untrusted-input) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-xlsx/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
