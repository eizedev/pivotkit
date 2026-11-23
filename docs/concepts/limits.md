---
title: Locale, time zones, limits and errors
description: How pivotkit picks the locale and reads dates, the limits that keep a view's memory use bounded, and its error model.
---

# Locale, time zones, limits and errors

## Locale

Numbers, dates, sorting and the labels the engine writes ("Grand Total") follow one locale. pivotkit
picks it in this order:

1. the view's `formatting.locale`,
2. the `locale` option or prop (`locale="de-DE"` on the report),
3. `"en-US"`.

pivotkit never uses the machine's or browser's locale, so a report looks the same for everyone who
opens it, and on a server. A locale counts only when the runtime has data for it:

- A view's locale that it does not know, such as `xx-XX`, gets the issue `unknownLocale`, and the
  next step applies.
- A `locale` option or prop that it does not know takes `"en-US"`. `computePivot` reports it as the
  warning `unknownLocale` at the path `locale`, and the report still shows.
- A `locale` option that is no locale tag at all throws `INVALID_OPTION`.

The CSV and XLSX exports use the grid's locale too. In the UI, `locale` also picks the language of
the labels. See [Localisation](../reference/localisation.md).

## Time zones

Dates are **wall-clock time**. pivotkit groups and shows a value as it was written. It never shifts
the value to the reader's zone.

- pivotkit takes an ISO string without an offset (`"2026-03-04T10:00"`, `"2026-03-04"`) as written.
- Write a year before 0 or after 9999 as ECMAScript does, with a sign and six digits:
  `"+010000-01-01"`, or `"-000001-12-31"` for 2 BC. This works within what a `Date` holds
  (`MAX_DATE_MS`: the years -271821 to 275760). pivotkit writes such years the same way, in exports
  and in a compare filter's day at the edges of that range. The day reads the same when you save the
  view and load it again. pivotkit refuses `"-000000"`, which is not a year.
- A `Date`, epoch milliseconds, or an ISO string with an offset (`"2026-03-04T10:00:00Z"`) is an
  **instant**. pivotkit reads it at the wall clock of the zone given to `encode(rows, { timeZone })`.
  In the UI, that is the `timeZone` prop or the `time-zone` attribute. The zone is one of:
    - `"UTC"`, the default
    - any IANA zone (`"Europe/Berlin"`)
    - `"local"` for the machine's zone, resolved to its name
- An instant before 1 AD keeps its year in every zone.
- An instant is blank when its wall clock in the zone lies past what a `Date` holds, in the first or
  last hours of that range.

The zone is in `data.timeZone`, `result.timeZone` and `grid.timeZone`. A view can carry
`formatting.timeZone`. `computePivot` reports an issue when it differs from the data's.

!!! warning "Dates built in the browser"
    A `Date` built from local parts, such as `new Date(2026, 2, 4)` or a date picker's value, is
    local midnight, an instant. With the default `"UTC"` it shows as the previous day east of UTC.
    For such data, pass `timeZone: "local"` or the zone the dates belong to.

## Limits

A view is user input and cannot run code. It can still ask for a lot of work: two fields with many
distinct values on rows and columns make a table of billions of cells. pivotkit counts the size of
everything dense (rows x columns) **before** it allocates it, and stops with an error over a limit.

`LIMITS` holds the defaults. Every function that takes `options.limits` merges your values over
them, and so does the `limits` prop or property of the UI. A file people load in the UI has limits
of its own, `importLimits`, merged key by key over `limits` ([below](#limits-of-a-loaded-file)).

There are two kinds of limits:

- pivotkit counts a resource limit before it allocates the memory the limit guards, or while that
  memory grows. Over the limit, it stops with `LIMIT_EXCEEDED`.
- A view limit drops what is over it and reports it as an issue.

| Limit | Default | Counts | When |
| --- | --- | --- | --- |
| `rows` | 1,000,000 | Rows `encode` accepts, and rows of a loaded file. | Before any column is built. For a file, as its rows are read. |
| `groups` | 500,000 | Nodes of the row and column key trees of `computePivot` together: every item, every subtotal and the two grand totals. | The distinct leaves of an axis before its first node is made. Then each node before it is made. |
| `pivotCells` | 2,000,000 | Cells `computePivot` aggregates. For each distinct pair of row leaf and column leaf in the filtered rows: (row fields + 1) x (column fields + 1), its subtotals and totals included. | A lower bound (the leaves of the larger axis times that product) before the cell index is built. Then each pair before it is stored. |
| `work` | 100,000,000 | Cell updates of `computePivot`: filtered rows x (row fields + 1) x (column fields + 1) x measures. Measures are the values plus the values a sort uses, each once. A `median`, `countUnique` or `listUnique` counts 10 times, because it keeps an entry per row and cell. | Exactly, after the filters and before the key trees are built. |
| `cells` | 2,000,000 | Cells of a grid (`toGrid`: header and body rows x columns). Data points of a chart (`toSeries`). The values of a source rows file: `rowsToCsv`, the drill-down's, and `dataToCsv` and `dataToJson`, Export → Source data (rows x fields). | Before the grid, the series or the file is built. |
| `cacheEntries` | 16 | Derived columns and sort orders kept per data set. | On each new entry. The least recently used go first. |
| `fileBytes` | 104,857,600 (100 MiB) | Bytes of a file [loaded](../reference/import.md#limits). | Before a byte is read. |
| `columns` | 1,000 | Columns of a loaded table. | As they appear. |
| `importCells` | 10,000,000 | Rows x columns of a loaded table. For a workbook also its shared strings and its cell and number formats, with 1,000 rows more for a title block above the header. | As the rows are read. A workbook's before it is parsed, while its parts are unpacked. |
| `textLength` | 32,767 | Characters of one value of a loaded table (Excel's cell limit). | As the value is read. Longer text is cut, with a note. |
| `archiveEntries` | 10,000 | Parts of an archive file (an `.xlsx` is a ZIP). | From its directory, before anything is unpacked. |
| `unpackedBytes` | 524,288,000 (500 MiB) | Bytes the parts of an archive file unpack to. | From its directory, before anything is unpacked. A part that unpacks to more than its directory states stops the read. |
| `axisFields` | 8 | Fields per axis (rows, columns). | In `normalize`, which drops the rest as an issue. |
| `values` | 16 | Values. | In `normalize`. |
| `json` | 5,000,000 | Characters of the serialized view. | In `normalize`. |
| `name` | 256 | Length of a name in a view. | In `normalize`. |
| `filters` | 128 | Filters. | In `normalize`. |
| `items` | 100,000 | Items in one filter, or in a custom sort order. Also the names of a chart's hidden series (`chart.hidden`) and its colours (`chart.colors`). | In `normalize`. |
| `derived` | 64 | Derived fields. | In `normalize`. |
| `sort` | 64 | Sort entries. | In `normalize`. |
| `collapsed` | 10,000 | Collapsed groups. | In `normalize`. |
| `topCount` | 1,000,000 | The `count` of a top N filter. | In `normalize`. |
| `textValue` | 1,000 | Characters of the text a text filter compares with. | In `normalize`. |
| `srcParams` | 16 | Parameters of a link's data source reference (`source.params`). | When a link is read. |
| `srcParamLength` | 256 | Characters of each name and value of those parameters. | When a link is read. |

### Views from outside

A person builds a view of a few filters in the UI. A view with dozens was most likely generated, and
each filter is a pass over the rows. So pivotkit normalizes a view from outside the host's own code
with tighter limits. Such views come from:

- a link
- pasted or loaded JSON
- the tab's stored view
- a request to an API
- an LLM

The tighter limits are `OUTSIDE_LIMITS` (`{ filters: 50, json: 1000000 }`) over the host's. That is
at most 50 filters, and a view as large as a link or a view file may be. `outsideLimits(limits)` in
pivotkit-core gives them:

- Each key of `OUTSIDE_LIMITS` is at most its preset value.
- A host's lower value stays lower.
- The host's other limits stay as they are. `items` and `collapsed` are among them, because a
  person's picks of a large field are that many.

pivotkit-react uses it for every view it reads from a link, a file, pasted JSON or the tab's storage.
A host that takes views from an API passes `{ limits: outsideLimits(myLimits) }` to `normalize`.

pivotkit also caps the issues of one view, whatever its limits: at most 100 of one code and 1,000 in
all (`ISSUE_CAP`). One last warning, `tooManyIssues`, counts the rest. So a small hostile view cannot
make a list of issues larger than itself. The generated JSON Schemas carry the default `LIMITS`. A
host with other limits checks those with `normalize`.

The defaults are sized for a browser tab. The report was [measured in the
browser](#measured-in-the-browser) up to the default of 1,000,000 rows.
[Why the defaults are what they are](#why-the-defaults-are-what-they-are) explains each one. You can
raise `groups` to 2^27 at most. A host that takes data or views from untrusted users can lower the
limits, for example
`{ rows: 200_000, groups: 100_000, pivotCells: 500_000, work: 20_000_000, cells: 500_000 }`.

The XLSX export adds Excel's own limits:

- 1,048,576 rows and 16,384 columns per sheet. A larger grid throws.
- 32,767 characters per cell. Longer text is cut.

`error.details.value` is the count when the limit was hit. For a limit counted while it grows, it is
the first count above `max`, not the total.

`groups` must stay at or below 2^27 (134,217,728). Cell keys are row node id x column count + column
node id, and they stay exact in a double only up to there. A larger value is `INVALID_OPTION`.

Not counted:

- The data itself. `rows` caps the rows. `encode()` trusts the width a host's own code gives it. A file,
  a server source and data sent with a request count `columns` and `importCells` before it.
- "Show values as" and sorting after the aggregation. They grow with the cells (a rank sorts each
  group once), which `pivotCells` bounds.
- The time a pivot within the limits takes.

### Limits of a loaded file

A file people load into the report ([`allowImport`](../reference/react.md#prop-allowimport)) comes
from someone other than the host. The host may want it smaller than its own data. `importLimits`
holds the limits for it. It is a prop of pivotkit-react and a property of pivotkit-element. The
report merges it key by key over `limits`:

- A key `importLimits` sets is the file's.
- A key it leaves out comes from `limits`.
- Both merge over `LIMITS`.

Without `importLimits`, a file has the host's `limits`. They hold for everything about the file:

- the readers (`fileBytes`, `rows`, `columns`, `importCells`, `textLength`, `archiveEntries`,
  `unpackedBytes`), on the page or in the import worker
- its views, results and exports while its data is shown

The host's own `data` keeps `limits`. A key of `importLimits` may also be higher than the same key of
`limits`, so a file gets more than the host's data. Nothing caps one by the other. Set only the keys a
file should have differently:

```jsx
<PivotReport data={rows} allowImport limits={{ cells: 500_000 }} importLimits={{ rows: 1_000, fileBytes: 5_000_000 }} />
```

With these `importLimits`:

- Only the default `rows` (1,000,000) caps the host's rows.
- A file has at most 1,000 rows and 5,000,000 bytes. Without `importLimits`, a file gets the host's
  `limits`, here the default 1,000,000 rows and 100 MiB.
- Both have at most 500,000 cells in a grid.

The report refuses a file over a limit and names the limit
(`… has more than 1,000 rows (limits.rows) …`). The data shown stays.

pivotkit-core's [`readFile`](../reference/import.md#limits) has one `limits` option. A caller with its
own data and files merges the import limits over its limits itself (`{ ...limits, ...importLimits }`).

### Limits of a report file

[pivotkit-report](../reference/report.md) and the command line count against pivotkit-core's limits:

- the view with `outsideLimits()`
- the data with `rows`
- the table with `cells`

They also count against limits of their own, `REPORT_LIMITS`:

| Limit | Default | Counts |
| --- | --- | --- |
| `template` | 262,144 | Characters of a [print template](../reference/print-template.md). |
| `chartWidth`, `chartHeight` | 8,000 | Pixels of a chart (SVG, a report's chart). |
| `tableCells` | 200,000 | Cells of an HTML report's table. A larger table is cut after the last whole row, and the report says so. Excel and CSV hold every cell up to `cells`. |
| `categories` | 50 | Categories a chart draws, the first ones, as on the screen. |

Before it parses them, the command line reads a view file of at most 4 MB and a template of at most
1 MB. It reads data files up to `fileBytes` ([pivotkit-cli](../reference/cli.md#files)).

pivotkit-server reads a print template of at most 1 MiB. A source's [named views](../reference/sources.md#views)
count against two limits of their own:

- 100 views per source, in the configuration and its folder together
- 256 KiB per view file, and per view written in the configuration

### Why the defaults are what they are

Measured in Node 26 on arm64. Other engines and machines differ.

- `rows`: The encoded columns take about 4 to 12 bytes per row and column. The host's row objects
  take more. A million rows is the largest size [measured in the browser](#measured-in-the-browser).
- `axisFields`: Each row updates (row fields + 1) x (column fields + 1) cells per value. That is 81
  at 8 x 8 and 1,089 at 32 x 32. A report nested deeper than eight levels per axis is hard to read
  anyway.
- `groups`: A key tree keeps about 400 bytes per node, so the trees stay at about 200 MB. A table
  shows at most one row per row node, and more than `cells` allows does not render either.
- `pivotCells`: 100,000 rows that are all distinct pairs on three row and two column fields make
  1.2 million. pivotkit refuses a view of many fields with many values each within a fraction of a
  second. At the defaults, the largest pivots measured took 0.8 to 2.6 s and grew the process memory
  (RSS) by up to about 1.5 GB. They had 495,000 rows and one row and one column field of 240,000
  values each, with and without "show values as".
- `work`: The cost per cell update:
    - a sum: about 2.5 ns, and no memory beyond its cells
    - a median: 9 to 11 ns and 10 to 18 bytes
    - a unique count of distinct values: 65 to 80 ns and 28 to 42 bytes

    100 million updates of a sum take a fraction of a second. The weight of 10 keeps the entries of
    medians and unique counts at 10 million, about 400 MB at most. 100,000 rows on three row and two
    column fields with five values make 6 million.

- `values`: Each value is a column per column item. More than 16 side by side cannot be read, and
  `work` bounds what they cost.
- `cacheEntries`: A derived column takes 12 bytes per row, so 16 entries of a million rows stay at
  about 200 MB.
- `fileBytes`, `importCells`: A loaded table keeps each value twice until it is encoded, as read and
  as typed. The encoded columns keep it once more. A CSV file of 100 MiB or 10 million values is
  about what a tab handles without slowing to a crawl. A workbook of 94,000 rows x 20 columns (12
  MB) took about 650 MB of memory while it was read
  ([measured](../reference/plugins.md#pivotkit-xlsx)). Its parser keeps about 100 bytes per shared
  string and per format, so they count against `importCells` too. A sheet cannot name more strings
  than it has cells. 11 million shared strings cost about 1 GB, less than a table at that limit
  ([measured](../security.md#untrusted-workbooks)).
- `textLength`: Excel's own limit per cell. Longer text in a CSV file is more likely an error than a
  value.
- `archiveEntries`, `unpackedBytes`: A workbook has a few dozen parts. 94,000 rows x 20 columns
  unpack to about 100 MB. 500 MiB leaves room for a used range of formatted empty cells: a sheet
  formatted to row 900,000 unpacks to about 300 MB. The limit refuses a ZIP bomb, which unpacks to
  gigabytes, before anything is unpacked. It bounds what is unpacked, not the memory. What the
  reader keeps costs a few times its size ([measured](../security.md#untrusted-workbooks)), so lower
  it for files from people you do not trust.

In the UI, a layout over a limit shows a message in place of the result. It says which limit was
hit and what to change, for example "This layout makes more than 500,000 groups of rows and
columns. Remove a field with many values from Rows or Columns, or filter it." The person takes a
field off and goes on.

The UI refuses a ninth field on Rows or Columns, or a seventeenth value, with the note "Rows holds
at most 8 fields. Remove one first." A saved view with more loads the fields that fit and says so
above the result. The texts are `tooManyRows`, `tooMuchWork`, `tooManyGroups`, `tooManyCells`,
`tooLarge`, `zoneFull` and `viewTrimmed` in the [labels](../reference/localisation.md).

The time and memory grow with the rows. [Measured in the browser](#measured-in-the-browser) shows
how much, from 100,000 to the default 1,000,000 rows.

### The date context in the UI

The report keeps the work behind its date ranges and combined years bounded:

- A combined grouping lists at most 32 years per field. More years end in "…".
- The Group level counts the years in a fixed table of 68 KiB.
- The report keeps the range of at most 16 date fields per data set (`LIMITS.cacheEntries`). It
  scans an evicted field again when it needs its range.
- A date outside the range JavaScript can represent gets no range and no years.

### Measured in the browser

`npm run bench:browser` hands the playground's generated data to `<PivotReport>` in Chromium,
Firefox and WebKit. The data has a fixed seed: sales with 9 columns, IT tickets with 10. The script
measures, in the page, the time from the data handed over to the first table on screen. That time
covers `encode`, `computePivot`, `toGrid` and React's render together. Each number is the median of
5 runs, each in a new page of the same browser process.

The setup:

- one Mac (Apple M4, 10 cores, 16 GB, macOS 27)
- the browsers of Playwright 1.64.1 (Chromium 156, Firefox 157, WebKit 27.2), headless
- a machine otherwise lightly loaded (load average about 3 to 4)

These are numbers of one machine. A slower laptop or a busy machine takes longer. A run while other
browser tests ran took up to 1.7 times as long.

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

`encode` is most of it: about 1 to 1.5 s per million rows in each browser. The most expensive
aggregation is the unique count of a column whose every value is distinct. There, `computePivot`
takes 0.5 s per million rows in Chromium and WebKit, and 1 s in Firefox. No size hit a limit or
crashed. The sales view's row count matched at every size. The other views have no such check. A
million rows is exactly the default `rows` limit.

The page cannot paint while the report builds the first table. The report shows its skeleton first.
Then the whole build runs as one task, so the page does not react to clicks or scrolling for that
time. Chromium reports one long task almost as long as the time in the table.

The next table shows the steps of a person on the sales view after the first table, by real clicks.
Each time runs from the click to the start of the first frame with the result in the page. It does
not include that frame's last layout and paint, so these are lower bounds. Each cell is the range
across the three browsers:

| Step | 100,000 | 250,000 | 500,000 | 1,000,000 |
| --- | ---: | ---: | ---: | ---: |
| Open a field's filter values | 11-15 ms | 17-20 ms | 25-32 ms | 41-55 ms |
| Take a value out of the filter | 19-23 ms | 32-40 ms | 52-68 ms | 90-124 ms |
| Add a field to Rows | 20-29 ms | 26-37 ms | 39-57 ms | 66-98 ms |
| Export XLSX (the table, 5 KB) | 13-15 ms | 12-14 ms | 12-14 ms | 13-16 ms |
| Switch to the chart (ECharts loaded on first use) | 61-78 ms | 70-93 ms | 84-114 ms | 109-151 ms |

During a step, the page could not paint for at most the step's time. For the chart it was less,
33 to 91 ms, because part of its time goes to waiting for the ECharts file. The XLSX export writes
the grid, not the rows, so its time does not grow with the data.

Memory was measured in Chromium only, through the DevTools protocol. It is the page's JavaScript
memory after a garbage collection: the heap, the ArrayBuffers of the encoded columns and the DOM.

- "Data" is the generated row objects, which the host holds anyway.
- "Report" is what the report adds to them: encoded columns, caches, the pivot, React's tree.

Generated rows repeat a few strings. Rows parsed from JSON with many distinct texts take more.

Not measured:

- Memory in Firefox and WebKit, which have no interface for it.
- The peak memory while the table is built. Only what stays after it was measured.
- Long tasks in Firefox and WebKit, which do not report them. The longest gap between two animation
  frames, measured in all three, stands in for it.
- Loading a file into the report (see [pivotkit-xlsx](../reference/plugins.md#pivotkit-xlsx)).
- Other views: many distinct row labels, many fields, "show values as".
- Drill-down and scrolling.
- Phones, Windows, Linux and other machines.
- A visible window, not headless.

What this means for a host:

- **Up to about 250,000 rows** is comfortable. The first table takes about 0.15 to 0.5 s, a filter
  or a field under 40 ms, the chart under 100 ms.
- **500,000 rows** is usable. The first table takes about 0.5 to 1 s, a filter or a field up to about
  70 ms.
- **1,000,000 rows** works, but the start is slow. The first table takes 1 to 2.5 s, and the page is
  frozen meanwhile. A filter or a field takes about 0.1 s. The report keeps about as much memory
  again as the host's rows, more with medians and unique counts.
- **More than a million rows**: aggregate on the server first. See
  [More than a million rows](#more-than-a-million-rows).
- At 1,000,000 rows, the unique count + median view counts 80,000,000 of `work`'s 100,000,000:
  rows x 2 x 2 x 2 values x 10 for aggregations that keep values. pivotkit would refuse one more row
  field. Raise `work` together with `rows`. Each such aggregation keeps an entry per row and cell,
  about 10 to 40 bytes each (see `work` above).

### More than a million rows

A million rows is the default `rows` limit and the largest size measured. For more:

1. **Aggregate on the server first**, where the rows are stored, with SQL `GROUP BY` or an API that
   returns totals. Group by the fields people put into Rows, Columns and Filters, and pass the
   smaller result. Sums add up again in the report: pass a count as a column and sum it too. An
   average, a median or a distinct count of the original rows cannot be computed again from groups.
   Compute those on the server at the level the report shows.
2. **Or build the table on the server.** [pivotkit-core runs in Node](../getting-started/engine.md#on-a-server).
   Send the grid or the XLSX file to the page.
3. **Or raise the `rows` limit** (`limits={{ rows: 2_000_000 }}`). That was not measured. From
   100,000 to 1,000,000 rows, the times and the memory grew about in proportion to the rows. So
   expect seconds of a frozen page, and memory on top of the host's own rows. Raise `work` with it
   for medians and unique counts (see above).

## Errors

- **A bad view never throws.** `normalize` drops what it cannot use and reports each issue with its
  path. Every function that takes a view normalizes it first.
- **Issues and error messages quote the view and the data**: field names, items, column spellings.
  Both come from users, so show them as text (React's `{text}`, `textContent`), never as HTML.
- **A programmer error throws** a `PivotkitError` with a `code`:

| `code` | When |
| --- | --- |
| `INVALID_ARGUMENT` | A wrong argument, for example `computePivot(null)` or `toGrid({})`. |
| `INVALID_OPTION` | An unknown locale or time zone in the options, an unknown or invalid limit. |
| `INVALID_VIEW` | `computePivot` with `strict: true` and a view with an error issue. `error.details.issues` holds them. |
| `LIMIT_EXCEEDED` | A limit. `error.details` is `{ limit, value, max }`, with `file` for a file being loaded. |
| `INVALID_FILE` | A file that cannot be read ([Loading files](../reference/import.md#errors)). `error.details` is `{ reason, file }`. |
| `INVALID_TEMPLATE` | A print template that pivotkit-report refuses ([Print templates](../reference/print-template.md)). `error.details` holds the `reason` and the placeholder. |

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
