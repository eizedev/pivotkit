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
property of the UI) merges your values over them. A file people load in the UI has limits of its own,
`importLimits`, merged key by key over `limits` ([below](#limits-of-a-loaded-file)). A resource limit is counted before the memory it
guards is allocated, or while it grows, and stops with `LIMIT_EXCEEDED`; a view limit drops what is
over it and reports it as an issue.

| Limit | Default | Counts | When |
| --- | --- | --- | --- |
| `rows` | 1,000,000 | Rows `encode` accepts, and rows of a loaded file. | Before any column is built; for a file, as its rows are read. |
| `groups` | 500,000 | Nodes of the row and column key trees of `computePivot` together: every item, every subtotal and the two grand totals. | The distinct leaves of an axis before its first node is made, then each node before it is made. |
| `pivotCells` | 2,000,000 | Cells `computePivot` aggregates: for each distinct pair of row leaf and column leaf in the filtered rows, (row fields + 1) x (column fields + 1), its subtotals and totals included. | A lower bound (the leaves of the larger axis times that product) before the cell index is built, then each pair before it is stored. |
| `work` | 100,000,000 | Cell updates of `computePivot`: filtered rows x (row fields + 1) x (column fields + 1) x measures (the values plus the values a sort uses, each once); a `median`, `countUnique` or `listUnique` counts 10 times, since it keeps an entry per row and cell. | Exactly, after the filters and before the key trees are built. |
| `cells` | 2,000,000 | Cells of a grid (`toGrid`: header and body rows x columns) and data points of a chart (`toSeries`). | Before the grid or the series is built. |
| `cacheEntries` | 16 | Derived columns and sort orders kept per data set. | On each new entry; the least recently used go first. |
| `fileBytes` | 104,857,600 (100 MiB) | Bytes of a file [loaded](../reference/import.md#limits). | Before a byte is read. |
| `columns` | 1,000 | Columns of a loaded table. | As they appear. |
| `importCells` | 10,000,000 | Rows x columns of a loaded table. | As the rows are read. |
| `textLength` | 32,767 | Characters of one value of a loaded table (Excel's cell limit). | As the value is read; longer text is cut, with a note. |
| `archiveEntries` | 10,000 | Parts of an archive file (an `.xlsx` is a ZIP). | From its directory, before anything is unpacked. |
| `unpackedBytes` | 524,288,000 (500 MiB) | Bytes the parts of an archive file unpack to. | From its directory, before anything is unpacked; a part that unpacks to more than its directory states stops the read. |
| `axisFields` | 8 | Fields per axis (rows, columns). | In `normalize`: more is dropped as an issue. |
| `values` | 16 | Values. | In `normalize`. |
| `json` | 5,000,000 | Characters of the serialized view. | In `normalize`. |
| `name` | 256 | Length of a name in a view. | In `normalize`. |
| `filters` | 128 | Filters. | In `normalize`. |
| `items` | 100,000 | Items in one filter. | In `normalize`. |
| `derived` | 64 | Derived fields. | In `normalize`. |
| `sort` | 64 | Sort entries. | In `normalize`. |
| `collapsed` | 10,000 | Collapsed groups. | In `normalize`. |
| `topCount` | 1,000,000 | The `count` of a top N filter. | In `normalize`. |
| `textValue` | 1,000 | Characters of the text a text filter compares with. | In `normalize`. |
| `srcParams` | 16 | Parameters of a link's data source reference (`source.params`). | When a link is read. |
| `srcParamLength` | 256 | Characters of each name and value of those parameters. | When a link is read. |

### Views from outside

A person builds a view of a few filters in the UI; a view with dozens was most likely generated, and
each filter is a pass over the rows. A view that comes from outside the host's own code (a link,
pasted or loaded JSON, the tab's stored view, a request to an API, an LLM) is therefore normalized
with tighter limits: `OUTSIDE_LIMITS` (`{ filters: 50, json: 1000000 }`, at most 50 filters and a
view as large as a link or a view file may be) over the host's. `outsideLimits(limits)` in
pivotkit-core gives them: each key of `OUTSIDE_LIMITS` at most its preset value, a host's lower value
stays lower, the host's other limits as they are (`items` and `collapsed` among them: a person's
picks of a large field are that many). pivotkit-react uses it for every view it reads from a link, a
file, pasted JSON or the tab's storage; a host that takes views from an API passes
`{ limits: outsideLimits(myLimits) }` to `normalize`.

The issues of one view are capped too, whatever its limits: at most 100 of one code and 1,000 in all
(`ISSUE_CAP`), the rest counted in one last warning `tooManyIssues`, so a small hostile view cannot
make a list of issues larger than itself. The generated JSON Schemas carry the default `LIMITS`; a
host with other limits checks those with `normalize`.

The defaults are sized for a browser tab: up to the default of 1,000,000 rows the report was
[measured in the browser](#measured-in-the-browser) below;
[why the defaults are what they are](#why-the-defaults-are-what-they-are) is below. `groups` can be raised to 2^27 at most. A host
that takes data or views from untrusted users can lower them, for example
`{ rows: 200_000, groups: 100_000, pivotCells: 500_000, work: 20_000_000, cells: 500_000 }`.

The XLSX export adds Excel's own limits: 1,048,576 rows and 16,384 columns per sheet (a larger grid
throws) and 32,767 characters per cell (longer text is cut).

`error.details.value` is the count when the limit was hit: for a limit counted while it grows, the
first count above `max`, not the total. `groups` must stay at or below 2^27 (134,217,728): cell keys
are row node id x column count + column node id and stay exact in a double only up to there; a larger
value is `INVALID_OPTION`.

Not counted: the data itself (the host's rows and the encoded columns, rows x columns; `rows` caps the
rows, the number of columns of the host's data is not limited; a loaded file's are), "show values as" and sorting after the aggregation (they
grow with the cells, which `pivotCells` bounds), and the time a pivot within the limits takes.

### Limits of a loaded file

A file people load into the report ([`allowImport`](../reference/react.md#prop-allowimport)) comes
from someone other than the host, so the host may want it smaller than its own data. `importLimits`
(a prop of pivotkit-react, a property of pivotkit-element) holds the limits for it, merged key by key
over `limits`: a key it sets is the file's, a key it leaves out is `limits`'s, and both over `LIMITS`.
Without `importLimits` a file has the host's `limits`. They hold for everything about the file: the
readers (`fileBytes`, `rows`, `columns`, `importCells`, `textLength`, `archiveEntries`,
`unpackedBytes`; on the page or in the import worker), and its views, results and exports while its
data is shown. The host's own `data` keeps `limits`. A key of `importLimits` may also be higher than
the same key of `limits` (a file gets more than the host's data): nothing caps one by the other, so set
only the keys a file should have differently:

```jsx
<PivotReport data={rows} allowImport limits={{ cells: 500_000 }} importLimits={{ rows: 1_000, fileBytes: 5_000_000 }} />
```

The host's rows are capped only by the default `rows` (1,000,000); a file has at most 1,000 rows and
5,000,000 bytes, and both have at most 500,000 cells in a grid. A file over a limit is refused with the
limit named (`… has more than 1,000 rows (limits.rows) …`) and the data shown stays. pivotkit-core's
[`readFile`](../reference/import.md#limits) has one `limits` option: a caller with its own data and
files merges the import limits over its limits itself (`{ ...limits, ...importLimits }`).

### Why the defaults are what they are

Measured in Node 26 on arm64; other engines and machines differ.

- `rows`: the encoded columns take about 4 to 12 bytes per row and column, the host's row objects
  more; a million rows is the largest size [measured in the browser](#measured-in-the-browser).
- `axisFields`: each row updates (row fields + 1) x (column fields + 1) cells per value, 81 at 8 x 8
  and 1,089 at 32 x 32; a report nested deeper than eight levels per axis is hard to read anyway.
- `groups`: a key tree keeps about 400 bytes per node, so the trees stay at about 200 MB. A table
  shows at most one row per row node, and more than `cells` allows does not render either.
- `pivotCells`: 100,000 rows that are all distinct pairs on three row and two column fields make
  1.2 million; a view of many fields with many values each is refused within a fraction of a second.
  At the defaults the largest pivots measured (495,000 rows, one row and one column field of 240,000
  values each, with and without "show values as") took 0.8 to 2.6 s and grew the process memory (RSS)
  by up to about 1.5 GB.
- `work`: per cell update, a sum takes about 2.5 ns and no memory beyond its cells; a median 9 to 11
  ns and 10 to 18 bytes; a unique count of distinct values 65 to 80 ns and 28 to 42 bytes. 100 million
  updates of a sum take a fraction of a second; the weight of 10 keeps the entries of medians and
  unique counts at 10 million, about 400 MB at most. 100,000 rows on three row and two column fields
  with five values make 6 million.
- `values`: each value is a column per column item; more than 16 side by side cannot be read, and
  `work` bounds what they cost.
- `cacheEntries`: a derived column takes 12 bytes per row, so 16 entries of a million rows stay at
  about 200 MB.
- `fileBytes`, `importCells`: a loaded table keeps each value twice until it is encoded (as read and
  typed) and the encoded columns once more; a CSV file of 100 MiB or 10 million values is about what a
  tab handles without slowing to a crawl. A workbook of 94,000 rows x 20 columns (12 MB) took about
  650 MB of memory while it was read ([measured](../reference/plugins.md#pivotkit-xlsx)).
- `textLength`: Excel's own limit per cell; longer text in a CSV file is more likely an error than a
  value.
- `archiveEntries`, `unpackedBytes`: a workbook has a few dozen parts; 94,000 rows x 20 columns
  unpack to about 100 MB. 500 MiB leaves room for a used range of formatted empty cells (a sheet
  formatted to row 900,000 unpacks to about 300 MB) and refuses a ZIP bomb, which unpacks to
  gigabytes, before anything is unpacked.

In the UI, a layout over a limit shows a message in place of the result that says which limit and
what to change, for example "This layout makes more than 500,000 groups of rows and columns. Remove a
field with many values from Rows or Columns, or filter it." The person takes a field off and goes on.
A ninth field on Rows or Columns (or a seventeenth value) is refused with the note "Rows holds at
most 8 fields. Remove one first."; a saved view with more loads the fields that fit and says so above the result. The
texts are `tooManyRows`, `tooMuchWork`, `tooManyGroups`, `tooManyCells`, `tooLarge`, `zoneFull` and
`viewTrimmed` in the [labels](../reference/localisation.md).

The time and memory grow with the rows; how much, from 100,000 to the default 1,000,000 rows, is
[measured in the browser](#measured-in-the-browser) below.

### Measured in the browser

`npm run bench:browser` hands the playground's generated data (fixed seed: sales with 9 columns,
IT tickets with 10) to `<PivotReport>` in Chromium, Firefox and WebKit and measures, in the page,
the time from the data handed over to the first table on screen: `encode`, `computePivot`,
`toGrid` and React's render together. Median of 5 runs, each in a new page. Measured on one Mac
(Apple M4, 10 cores, 16 GB, macOS 27) with the browsers of Playwright 1.64.1 (Chromium 156,
Firefox 157, WebKit 27.2), headless, while the machine was otherwise lightly loaded (load average
about 3 to 4). These are numbers of one machine; a slower laptop or a busy machine takes longer
(a run while other browser tests ran took up to 1.7 times as long).

| View | Rows | Chromium | Firefox | WebKit | Memory (Chromium): data + report |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sales: sum, 2 row fields x 1 column field | 100,000 | 143 ms | 132 ms | 157 ms | 10 + 13 MB |
| | 250,000 | 294 ms | 277 ms | 304 ms | 25 + 25 MB |
| | 500,000 | 555 ms | 512 ms | 550 ms | 50 + 45 MB |
| | 1,000,000 | 1.0 s | 1.0 s | 1.0 s | 100 + 85 MB |
| Tickets: median by month (date grouping), filtered | 100,000 | 187 ms | 183 ms | 185 ms | 15 + 19 MB |
| | 250,000 | 400 ms | 402 ms | 404 ms | 37 + 40 MB |
| | 500,000 | 801 ms | 755 ms | 771 ms | 73 + 75 MB |
| | 1,000,000 | 1.6 s | 1.5 s | 1.7 s | 147 + 145 MB |
| Tickets: unique count of the ticket ID + median | 100,000 | 221 ms | 214 ms | 205 ms | 15 + 24 MB |
| | 250,000 | 484 ms | 507 ms | 474 ms | 37 + 51 MB |
| | 500,000 | 987 ms | 1.0 s | 944 ms | 73 + 98 MB |
| | 1,000,000 | 2.0 s | 2.5 s | 1.9 s | 147 + 194 MB |

`encode` is most of it: about 1 to 1.5 s per million rows in each browser. The unique count of a column
whose every value is distinct is the most expensive aggregation (`computePivot` 0.5 s per million
rows in Chromium and WebKit, 1 s in Firefox). No size hit a limit, crashed or showed a wrong row
count; a million rows is exactly the default `rows` limit.

The page cannot paint while the first table is built: the report shows its skeleton first, then
the whole build runs as one task (Chromium reports one long task as long as the time in the table),
so the page does not react to clicks or scrolling for that time.

After the first table, the steps of a person on the sales view, by real clicks, from the click to
the first frame that shows the result (the range across the three browsers):

| Step | 100,000 | 250,000 | 500,000 | 1,000,000 |
| --- | ---: | ---: | ---: | ---: |
| Open a field's filter values | 11-15 ms | 17-20 ms | 25-32 ms | 41-55 ms |
| Take a value out of the filter | 19-23 ms | 32-40 ms | 52-68 ms | 90-124 ms |
| Add a field to Rows | 20-29 ms | 26-37 ms | 39-57 ms | 66-98 ms |
| Export XLSX (the table, 5 KB) | 13-15 ms | 12-14 ms | 12-14 ms | 13-16 ms |
| Switch to the chart (ECharts loaded on first use) | 61-78 ms | 70-93 ms | 84-114 ms | 109-151 ms |

During a step the page could not paint for at most the step's time (for the chart less, 33 to 91
ms: part of its time is spent waiting for the ECharts file). The XLSX export writes the grid,
not the rows, so its time does not grow with the data.

Memory, Chromium only: the page's JavaScript memory after a garbage collection (the heap, the
ArrayBuffers of the encoded columns and the DOM), through the DevTools protocol. "Data" is the
generated row objects, which the host holds anyway; "report" is what the report adds to them
(encoded columns, caches, the pivot, React's tree). Generated rows repeat a few strings; rows parsed
from JSON with many distinct texts take more.

Not measured:

- Memory in Firefox and WebKit (no interface for it), and the peak while the table is built: only
  what stays after it.
- Long tasks in Firefox and WebKit (they do not report them); the longest gap between two
  animation frames, measured in all three, stands in for it.
- Loading a file into the report (see [pivotkit-xlsx](../reference/plugins.md#pivotkit-xlsx)),
  other views (many distinct row labels, many fields, "show values as"), drill-down and scrolling.
- Phones, Windows, Linux and other machines; a visible (not headless) window.

What this means for a host:

- **Up to about 250,000 rows** the first table takes well under half a second, a filter or a field
  under 40 ms, the chart under 100 ms: comfortable.
- **500,000 rows**: the first table takes about 0.5 to 1 s, a filter or a field up to about 70 ms;
  usable.
- **1,000,000 rows**: the first table takes 1 to 2.5 s with the page frozen meanwhile, a filter or a
  field about 0.1 s. It works, but the start is slow, and the report keeps about as much memory again
  as the host's rows (more with medians and unique counts).
- More than a million rows need a higher `rows` limit (`limits={{ rows: 2_000_000 }}`). That was not
  measured; from 100,000 to 1,000,000 rows the times and the memory grew about in proportion to the
  rows, so expect seconds of a frozen page and memory on top of the host's own rows. Aggregate on
  the server instead where you can.
- At 1,000,000 rows the unique count + median view counts 80,000,000 of `work`'s 100,000,000
  (rows x 2 x 2 x 2 values x 10 for aggregations that keep values); one more row field would be
  refused. Raise `work` together with `rows`, knowing that each such aggregation keeps an entry per
  row and cell (about 10 to 40 bytes each, see `work` above).

## Errors

- **A bad view never throws.** `normalize` drops what it cannot use and reports each issue with its
  path; every function that takes a view normalizes it first.
- **Issues and error messages quote the view and the data**: field names, items, column spellings.
  Both come from users, so show them as text (React's `{text}`, `textContent`), never as HTML.
- **A programmer error throws** a `PivotkitError` with a `code`:

| `code` | When |
| --- | --- |
| `INVALID_ARGUMENT` | A wrong argument, for example `computePivot(null)` or `toGrid({})`. |
| `INVALID_OPTION` | An unknown locale or time zone in the options, an unknown or invalid limit. |
| `LIMIT_EXCEEDED` | A limit; `error.details` is `{ limit, value, max }`, with `file` for a file being loaded. |
| `INVALID_FILE` | A file that cannot be read ([Loading files](../reference/import.md#errors)); `error.details` is `{ reason, file }`. |

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
