---
title: Locale, time zones, limits and errors
description: How pivotkit picks the locale and reads dates, the limits that keep a view's memory use bounded, and its error model.
---

# Locale, time zones, limits and errors

## Locale

Numbers, dates, sorting and the labels the engine writes ("Grand Total") follow one locale, picked in
this order:

1. the view's `formatting.locale`,
2. the `locale` option or prop (`locale="de-DE"` on the report),
3. `"en-US"`.

The machine's or browser's locale is never used, so a report looks the same for everyone who opens it,
and on a server. The CSV and XLSX exports use the grid's locale too. In the UI, `locale` also picks the
language of the labels; see [Localisation](../reference/localisation.md).

## Time zones

Dates are **wall-clock time**: a value is grouped and shown as it was written, never shifted to the
reader's zone.

- An ISO string without an offset (`"2026-03-04T10:00"`, `"2026-03-04"`) is taken as written.
- A `Date`, epoch milliseconds, or an ISO string with an offset (`"2026-03-04T10:00:00Z"`) is an
  **instant**. It is read at the wall clock of the zone given to `encode(rows, { timeZone })`
  (`timeZone` prop or `time-zone` attribute in the UI): `"UTC"` by default, any IANA zone
  (`"Europe/Berlin"`), or `"local"` for the machine's zone (resolved to its name).

The zone is in `data.timeZone`, `result.timeZone` and `grid.timeZone`. A view can carry
`formatting.timeZone`, and `computePivot` reports an issue when it differs from the data's.

!!! warning "Dates built in the browser"
    A `Date` built from local parts (`new Date(2026, 2, 4)`, a date picker's value) is local midnight,
    an instant. With the default `"UTC"` it shows as the previous day east of UTC. Pass
    `timeZone: "local"` (or the zone the dates belong to) for such data.

## Limits

A view is user input and cannot run code, but it can ask for a lot of work: two fields with many
distinct values each on rows and columns would make a table of billions of cells. pivotkit counts
the size of everything dense (rows x columns) **before** it allocates it and stops with an error
instead.

`LIMITS` holds the defaults; every function that takes `options.limits` (and the `limits` prop or
property of the UI) merges your values over them. A resource limit is counted before the memory it
guards is allocated, or while it grows, and stops with `LIMIT_EXCEEDED`; a view limit drops what is
over it and reports it as an issue.

| Limit | Default | Guards |
| --- | --- | --- |
| `rows` | 1,000,000 | Rows `encode` accepts. |
| `groups` | 500,000 | Groups of rows and columns `computePivot` makes, subtotals and grand totals included. |
| `pivotCells` | 2,000,000 | Cells `computePivot` aggregates, subtotals and totals included. |
| `work` | 100,000,000 | Cell updates of `computePivot`: filtered rows x (row fields + 1) x (column fields + 1) x values; a median or a unique count counts 10 times. |
| `cells` | 2,000,000 | Cells of a grid and data points of a chart. |
| `cacheEntries` | 16 | Derived columns and sort orders kept per data set; the least recently used go first. |
| `axisFields` | 8 | Fields per axis (rows, columns). |
| `values` | 16 | Values. |
| `json` | 5,000,000 | Characters of the serialized view. |
| `name` | 256 | Length of a name in a view. |
| `filters` | 128 | Filters. |
| `items` | 100,000 | Items in one filter. |
| `derived` | 64 | Derived fields. |
| `sort` | 64 | Sort entries. |
| `collapsed` | 10,000 | Collapsed groups. |
| `topCount` | 1,000,000 | The `count` of a top N filter. |

The defaults are sized for a browser tab and the about 100,000 rows the engine is designed for; the
[pivotkit-core README](https://github.com/eizedev/pivotkit/tree/main/packages/pivotkit-core#limits)
has the measurements behind each number. `groups` can be raised to 2^27 at most. A host that takes
data or views from untrusted users can lower them, for example
`{ rows: 200_000, groups: 100_000, pivotCells: 500_000, work: 20_000_000, cells: 500_000 }`.

The XLSX export adds Excel's own limits: 1,048,576 rows and 16,384 columns per sheet (a larger grid
throws) and 32,767 characters per cell (longer text is cut).

In the UI, a layout over a limit shows a message in place of the result that says which limit and
what to change, for example "This layout makes more than 500,000 groups of rows and columns. Remove a
field with many values from Rows or Columns, or filter it." The person takes a field off and goes on.
A ninth field on Rows or Columns (or a seventeenth value) is refused with the note "Rows holds at
most 8 fields. Remove one first."; a template with more loads the fields that fit and says so. The
texts are `tooManyRows`, `tooMuchWork`, `tooManyGroups`, `tooManyCells`, `tooLarge`, `zoneFull` and
`templateTrimmed` in the [labels](../reference/localisation.md).

The engine is designed for up to about 100,000 rows in the browser. More rows work within `rows`, at
the cost of time and memory; see the [performance numbers](../reference/react.md#performance).

## Errors

- **A bad view never throws.** `normalize` drops what it cannot use and reports each issue with its
  path; every function that takes a view normalizes it first.
- **A programmer error throws** a `PivotkitError` with a `code`:

| `code` | When |
| --- | --- |
| `INVALID_ARGUMENT` | A wrong argument, for example `computePivot(null)` or `toGrid({})`. |
| `INVALID_OPTION` | An unknown locale or time zone in the options, an unknown or invalid limit. |
| `LIMIT_EXCEEDED` | A limit; `error.details` is `{ limit, value, max }`. |

```js
import { PivotkitError } from "pivotkit-core";

try {
    grid = toGrid(computePivot(data, view));
} catch (error) {
    if (error instanceof PivotkitError && error.code === "LIMIT_EXCEEDED") {
        showMessage(`The report is too large (${error.details.limit}).`);
    } else {
        throw error;
    }
}
```
