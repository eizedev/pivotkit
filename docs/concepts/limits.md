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
property of the UI) merges your values over them.

| Limit | Default | Guards |
| --- | --- | --- |
| `rows` | 10,000,000 | Rows `encode` accepts. |
| `cells` | 2,000,000 | Cells of a grid and data points of a chart. |
| `cacheEntries` | 64 | Derived columns and sort orders kept per data set; the least recently used go first. |
| `json` | 5,000,000 | Characters of the serialized view. |
| `name` | 256 | Length of a name in a view. |
| `axisFields` | 32 | Fields per axis. |
| `values` | 64 | Values. |
| `filters` | 128 | Filters. |
| `items` | 100,000 | Items in one filter. |
| `derived` | 64 | Derived fields. |
| `sort` | 64 | Sort entries. |
| `collapsed` | 10,000 | Collapsed groups. |
| `topCount` | 1,000,000 | The `count` of a top N filter. |

The XLSX export adds Excel's own limits: 1,048,576 rows and 16,384 columns per sheet (a larger grid
throws) and 32,767 characters per cell (longer text is cut).

In the UI, a layout over `limits.cells` shows a message in place of the table; the person can take a
field off and go on.

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
