---
title: Write a plugin
description: The reader plugin contract of pivotkit (API version 1), what a reader returns, the limits and safety rules it follows, and a complete example plugin to copy.
---

# Write a plugin

A reader plugin teaches pivotkit a file format. The plugin parses the format into rows.
pivotkit-core's shared part, `createTable`, does the rest, the same for every format:

- the header and the column names
- cleaned values
- the types
- the limits and the notes

The repository has a complete example to copy:
[`examples/reader-plugin`](https://github.com/eizedev/pivotkit/tree/main/examples/reader-plugin)
reads JSON Lines. Its test is `tests/reader-plugin.test.js`.

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
It refuses a plugin made for another API version and names both versions, so a host sees at once
which of the two to update. pivotkit-core's `PLUGIN_API_VERSION` is the version it supports.

The module that `load()` returns offers:

| Function | What |
| --- | --- |
| `read(file, options)` | Reads the file into a table. `file` is a `File`, a `Blob`, an `ArrayBuffer` or a `Uint8Array`. Required. Build the table with `createTable` (below). A table built by hand needs `columns`, `types`, `data` (one array per column, all of one length) and `notes` (each with a `code`). `readFile` fills in `raw`, `detected`, `rowCount` and `hints` ([The table](import.md#the-table)) and checks the limits. It refuses a wrong table with `INVALID_ARGUMENT` and names the plugin and the field. Only `readFile` completes the table: `loadReader(plugin).read()` returns the table as the plugin built it.<br><small>Returns `Promise<PluginTable>`</small> |
| `sheets(file, options)` | For formats with several tables, such as a workbook's sheets: `[{ name, index, visible }]`. Optional.<br><small>Returns `Promise<SheetInfo[]>`</small> |

`options` are `ReadOptions`: `name`, `sheet`, `types`, `locale`, `limits`, `signal` and `onProgress`,
as in [Loading files](import.md#functions). A reader passes `types` to `finish()` and honours the
others as the rules below say.

## The helpers

`pivotkit-core/import` exports these helpers, so every reader behaves the same:

| Name | What |
| --- | --- |
| `readOptions(options)` | The options with `limits` resolved (the host's merged over `LIMITS`). |
| `fileName(file, options)` | The file's name for messages, cleaned. |
| `bytesOf(file, limits, name)` | The file's bytes, after its size was checked against `limits.fileBytes`. |
| `createTable({ file, limits, locale, hints })` | The table builder. `header(names)` when the format names its columns apart from the rows (JSON). Without it, the builder finds the header in the first rows. `row(cells)` per row, values of any JSON type or `Date`. `note(code, params)` for what the reader did (`ENCODING`, `SHEET`, ...). `finish(types)` gives the typed `ImportTable`. `hints.decimal` (`"."` or `","`) and `hints.dateOrder` say how to read numbers and dates in text. `hints.textNumbers: false` keeps text as text, for formats that type their values, as JSON does. `hints.serialDates` lets a number column become dates as Excel serial days. |
| `fileError(reason, file, message, params)` | A `PivotkitError` `INVALID_FILE` that names the file. |
| `checkFileLimit(limit, value, max, file, what)`, `limitError(...)` | A `LIMIT_EXCEEDED` that names the file and the limit. |
| `dateToIso(date)` | A `Date` whose UTC fields are the wall clock as ISO text, to the second when it is within 2 ms of one. |
| `cleanText(text)` | The text without control and direction characters, line breaks and tabs as one space, without spaces at either end. For a name the file gives, such as a sheet's. |

## The rules

A reader reads what people pick, from anywhere. Treat every file as hostile.

- **Limits before the expensive step.** Check the size of anything before you allocate for it.
    - `bytesOf` checks the file.
    - Check counts a format declares (entries, rows, dimensions) against `limits` before you read
      them.
    - Never trust a size a file states without a cap.
    - `createTable` counts rows, columns and cells as they come.
- **No code from the file.** Never use `eval`, `new Function`, `import()` of anything a file names,
  or an XML parser that expands entities or fetches a DTD. Refuse what the format allows but a table
  never needs, such as macros and external references.
- **No network, no storage.** A reader reads the bytes it is given. It fetches nothing.
- **Stay responsive and stoppable.** Between steps, check `signal` (`signal?.throwIfAborted()`) and
  report `onProgress({ phase, done, total })`. In a long loop, give the event loop a turn now and
  then (`await new Promise((r) => setTimeout(r, 0))`).
- **Messages people can act on.** Throw `fileError(reason, file, message)`. Say what the file is and
  what to do ("save it as .xlsx or CSV"), never a stack trace. `reason` is a short code in capitals
  that a UI can translate.
- **Names and values as data.** Hand them to `createTable` as they are. It cleans them. Never use a
  value from a file as an object key without an own-property check. A `Map` is safer.
- **No worker of your own.** A `blob:` worker breaks a strict Content-Security-Policy. The host runs
  readers in a worker of its own when it wants one.
- **Small descriptor.** The descriptor imports nothing. Everything else loads through `load()`.

## The example

[`examples/reader-plugin/src/reader.js`](https://github.com/eizedev/pivotkit/blob/main/examples/reader-plugin/src/reader.js)
reads JSON Lines in five steps:

1. the options and the name
2. the bytes, after the size check
3. the rows, with a message that names the line that is no JSON
4. the table, which counts the limits and cleans the values
5. the types

Copy the folder, change the descriptor and `read()`, and keep the steps.

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

Test a plugin on real files of its format:

- a well-formed one
- one with every kind of value
- a broken one
- one over each limit
- one stopped by `signal`

There is no shared conformance test kit for plugins.
[#122](https://github.com/eizedev/pivotkit/issues/122) is open for it.

## Publish

1. Name the package as you like, but not `pivotkit-*`. That name is kept for the official plugins.
2. Add the npm keyword `pivotkit-plugin`, so people [find it](plugins.md#find-plugins).
3. Take pivotkit-core as a peer dependency with a caret range of the version you test with.
4. Publish with [npm provenance](https://docs.npmjs.com/generating-provenance-statements).
5. Open a pull request that lists it on [Plugins](plugins.md#find-plugins).
