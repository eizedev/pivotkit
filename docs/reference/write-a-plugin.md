---
title: Write a plugin
description: The reader plugin contract of pivotkit (API version 1), what a reader returns, the limits and safety rules it follows, and a complete example plugin to copy.
---

# Write a plugin

A reader plugin teaches pivotkit a file format. It parses the format into rows; pivotkit-core's
shared part (`createTable`) does the rest, the same for every format: the header, the column names,
cleaned values, the types, the limits and the notes. A complete example to copy is in the
repository: [`examples/reader-plugin`](https://github.com/eizedev/pivotkit/tree/main/examples/reader-plugin)
(JSON Lines), with its test in `tests/reader-plugin.test.js`.

## The contract

API version 1. A plugin is a plain object, the **descriptor**, that imports nothing:

```js
// src/index.js
export default Object.freeze({
    apiVersion: 1,                         // the plugin API version it is made for
    kind: "reader",                        // the only kind of API 1
    name: "jsonl",                         // unique: lower-case letters, digits and "-"
    label: "JSON Lines",                   // what a file picker shows
    accept: [".jsonl", ".ndjson", "application/x-ndjson"],   // extensions and media types, lower case
    load: () => import("./reader.js")      // the reader, loaded on the first file of its kind
});
```

`validatePlugin(plugin)` checks it and throws `PivotkitError` `INVALID_ARGUMENT` with what is wrong.
A plugin made for another API version is refused with both versions named, so a host sees at once
which of the two to update. pivotkit-core's `PLUGIN_API_VERSION` is the version it supports.

The module `load()` gives offers:

| Function | What |
| --- | --- |
| `read(file, options)` | Reads the file into a table. `file` is a `File`, a `Blob`, an `ArrayBuffer` or a `Uint8Array`. Required.<br><small>Returns `Promise<ImportTable>`</small> |
| `sheets(file, options)` | For formats with several tables (a workbook's sheets): `[{ name, index, visible }]`. Optional.<br><small>Returns `Promise<SheetInfo[]>`</small> |

`options` are `ReadOptions`: `name`, `sheet`, `types`, `locale`, `limits`, `signal` and `onProgress`,
as in [Loading files](import.md#functions). A reader passes `types` to `finish()` and honours the
rest as below.

## The helpers

From `pivotkit-core/import`, so every reader behaves the same:

| Name | What |
| --- | --- |
| `readOptions(options)` | The options with `limits` resolved (the host's merged over `LIMITS`). |
| `fileName(file, options)` | The file's name for messages, cleaned. |
| `bytesOf(file, limits, name)` | The file's bytes, after its size was checked against `limits.fileBytes`. |
| `createTable({ file, limits, locale, hints })` | The table builder: `header(names)` when the format names its columns apart from the rows (JSON), else the header is found in the first rows; `row(cells)` per row, values of any JSON type or `Date`; `note(code, params)` for what the reader did (`ENCODING`, `SHEET`, ...); `finish(types)` gives the typed `ImportTable`. `hints.decimal` (`"."` or `","`) and `hints.dateOrder` say how to read numbers and dates in text; `hints.textNumbers: false` keeps text as text (formats that type their values, as JSON does); `hints.serialDates` lets a number column become dates as Excel serial days. |
| `fileError(reason, file, message, params)` | A `PivotkitError` `INVALID_FILE` that names the file. |
| `checkFileLimit(limit, value, max, file, what)`, `limitError(...)` | A `LIMIT_EXCEEDED` that names the file and the limit. |
| `dateToIso(date)` | A `Date` whose UTC fields are the wall clock as ISO text, to the second when it is within 2 ms of one. |

## The rules

A reader reads what people pick, from anywhere: treat every file as hostile.

- **Limits before the expensive step.** Check the size of anything before you allocate for it:
  `bytesOf` checks the file; check counts a format declares (entries, rows, dimensions) against
  `limits` before you read them; never trust a size a file states without a cap. `createTable`
  counts rows, columns and cells as they come.
- **No code from the file.** Never `eval`, `new Function`, `import()` of anything a file names, or
  an XML parser that expands entities or fetches a DTD. Refuse what the format allows but a table
  never needs (macros, external references).
- **No network, no storage.** A reader reads the bytes it is given; it fetches nothing.
- **Stay responsive and stoppable.** Check `signal` (`signal?.throwIfAborted()`) and report
  `onProgress({ phase, done, total })` between steps, and give the event loop a turn now and then
  (`await new Promise((r) => setTimeout(r, 0))`) in a long loop.
- **Messages people can act on.** Throw `fileError(reason, file, message)` with what the file is and
  what to do ("save it as .xlsx or CSV"), never a stack trace; `reason` is a short code in capitals a
  UI can translate.
- **Names and values as data.** Hand them to `createTable` as they are; it cleans them. Never use a
  value from a file as an object key without an own-property check (`Map` is safer).
- **No worker of your own.** A `blob:` worker breaks a strict Content-Security-Policy; the host runs
  readers in a worker of its own when it wants one.
- **Small descriptor.** The descriptor imports nothing; everything else loads through `load()`.

## The example

[`examples/reader-plugin/src/reader.js`](https://github.com/eizedev/pivotkit/blob/main/examples/reader-plugin/src/reader.js)
reads JSON Lines in five steps: options and name; the bytes after the size check; the rows, with a
message that names the line that is no JSON; the table, which counts the limits and cleans the
values; the types. Copy the folder, change the descriptor and `read()`, keep the steps.

```js
import { bytesOf, createTable, fileError, fileName, readOptions } from "pivotkit-core/import";

export async function read(file, options) {
    const o = readOptions(options);
    const name = fileName(file, o);
    const bytes = await bytesOf(file, o.limits, name);
    const table = createTable({ file: name, limits: o.limits, locale: o.locale });
    for (const cells of parseYourFormat(bytes, name)) {   // throw fileError(...) for a broken file
        table.row(cells);
        // between steps: o.signal?.throwIfAborted(); o.onProgress?.({ phase: "parse", done, total });
    }
    return table.finish(o.types);
}
```

Test a plugin on real files of its format: a well-formed one, one with every kind of value, a broken
one, one over each limit, one stopped by `signal`. A shared conformance test kit for plugins is
planned.

## Publish

Name the package as you like, but not `pivotkit-*` (kept for the official plugins); add the npm
keyword `pivotkit-plugin`, so people [find it](plugins.md#find-plugins); take pivotkit-core as a peer
dependency with a caret range of the version you test with; publish with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements). Then open a pull request
that lists it on [Plugins](plugins.md#find-plugins).
