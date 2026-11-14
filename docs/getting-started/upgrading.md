---
title: Upgrading
description: What a host or a script checks when it moves to the next release of pivotkit - from 0.6.0 to 0.6.1 (the services' output files and request limits, checks at start, years before 1 AD and the command line), from 0.5 to 0.6 (Table as CSV, Source data, the report's words and the command line) and from 0.4 to 0.5 (view and file format 2, dark theme selectors, the colour scale, labels, font weights, chart text and column subtotals).
---

# Upgrading

Each section lists what changes between two releases and whom it concerns; **Breaking** marks a
change that needs your action when it applies.

## From 0.6.0 to 0.6.1 { #from-0-6-0 }

Hosts of the report change nothing. Operators of pivotkit-server and pivotkit-mcp check the first
three rows: the output directory names its files differently and has a size limit, and the MCP
endpoint has request limits. Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| [Versions move together](#versions-0-6-1) | you also install pivotkit-core, pivotkit-report or pivotkit-xlsx yourself | update them to the same release |
| [Output files of the services](#output-0-6-1) | you run pivotkit-server or pivotkit-mcp with an output directory | remove the reports of 0.6.0 by hand once; check `output.maxMb` and `output.maxFiles`; a missing directory is now made |
| [Request limits of the MCP endpoint](#mcp-limits-0-6-1) | clients use pivotkit-mcp or pivotkit-server's `/mcp` over HTTP | raise `mcp.rateLimit` or `mcp.concurrency` for busy clients |
| [Checks at start](#checks-0-6-1) | you run `check-config` in a pipeline or start the service from scripts | fix what it now names |
| [Years before 1 AD](#bce-0-6-1) | your data has dates before 1 AD or after 9999, and tests or screenshots show them | take the new labels |
| [Command line](#cli-0-6-1) | a script runs `pivotkit` with `--strict`, `-o` or on Windows | check the list below |

### Versions move together { #versions-0-6-1 }

The packages of this release depend on each other at its versions (pivotkit-core 0.6.1,
pivotkit-react 0.6.1, pivotkit-report 0.2.1, pivotkit-xlsx 0.3.1, ...). A host that also lists
pivotkit-core, pivotkit-report or pivotkit-xlsx itself updates them with pivotkit-react, or npm may
install two copies.

### Output files of the services { #output-0-6-1 }

pivotkit-server and pivotkit-mcp name the reports and drafts they write `<name>.pivotkit-out.<format>`
(`sales.pivotkit-out.xlsx`) and count, clean up (`output.maxAgeDays`) and delete only files named so.
**Breaking** for the directory's old files: reports written by 0.6.0 are neither counted nor deleted;
remove them by hand once.

- `output.maxMb` (default 1024) is new: a new report deletes the oldest reports until the directory
  fits it and `output.maxFiles`, instead of refusing every caller. Set both to what the disk holds.
- Schedule drafts are never deleted this way and may take at most half of `output.maxFiles` (none
  at 1); a draft over that answers 409 `NO_OUTPUT`.
- An output directory the server cannot write is a problem in `check-config` (exit 1), a warning at
  start, and 409 `NO_OUTPUT` for a report, instead of 500 `INTERNAL`.
- A missing output directory is made at start, with its parents (mode 0700, or 0755 narrowed by the
  umask when `output.baseUrl` is set), with a warning in the log; before, the start failed. A setup
  that relies on that error (a directory on a volume that must be mounted first) sets
  `output.create: false`.

See [the REST service's options](../reference/rest.md#running).

### Request limits of the MCP endpoint { #mcp-limits-0-6-1 }

Over HTTP, the MCP endpoint limits each caller as the REST service does: `mcp.rateLimit.perMinute`
(120), `.burst` (30), `.failedAuthPerMinute` (30) and `mcp.concurrency` (4); over a limit the answer
is 429 with `Retry-After`. Both services also have `http.maxConnectionsPerAddress` (default 0, no
bound), and a client has 5 seconds for its headers (was 15). See [the MCP server's
configuration](../reference/mcp.md#configuration).

### Checks at start { #checks-0-6-1 }

- A static token with characters a bearer token cannot carry is refused at start and in
  `check-config`: no request could have sent it. Make one with the command the message names.
- `check-config` warns of a policy rule that names no column of its source, with the name probably
  meant (exit 0): such a rule left the real column at the default level.
- With OAuth and neither required scopes nor `auth.toolScopes`, the REST service warns at start, as
  the MCP endpoint does.

### Years before 1 AD { #bce-0-6-1 }

Date labels write a year before 1 AD with its era: `yearQuarter` "Q1 2 BC" (was "Q1 -1"), a date
"Jan 11, 2 BC" (was "Jan 11, 2", the same as 2 AD), `yearWeek` "2 BC-W02". `toCsv` and `toJson`
write a date before year 0 or after 9999 in its signed ISO form (`-000001-01-11`). `isIdentifierName`
takes `HTTPId` and `ABCId` as identifiers, so such a number field is counted when placed, as `ID` is.

### Command line { #cli-0-6-1 }

- `--sheet` for data that is no workbook is a warning `ignoredOption`: with `--strict` the run
  exits 1.
- `-o` naming the data file or the view file (also through a link or another case of its name),
  `--save-view` naming the data file, and `-o -` are usage errors (exit 2) instead of replacing the
  input or writing a file named `-`.
- On Windows, a device name as the output (`-o NUL`, `CON`, `COM1.csv`) is refused, as `/dev/null`
  is elsewhere.
- `--json`: an error that follows from a grouping the view cannot make has `followsFrom` with the
  grouping's code and is counted there on stderr instead of shown.
- `describe --data <file>` without an argument describes the data.

## From 0.5 to 0.6 { #from-0-5 }

Hosts of the report change nothing: views, files and links of 0.5 load with the same result, and the
new features are off until you turn them on. Scripts that read what pivotkit-report or the command
line write check the last two rows. Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| [Versions move together](#versions-0-6) | you also install pivotkit-core, pivotkit-report or pivotkit-xlsx yourself | update them to the same release |
| [Export → Table as CSV](#table-as-csv) | your tests or screenshots look for "CSV file (.csv)" | look for "Table as CSV (.csv)" |
| [Source data](#source-data-0-6) | you want people to download the rows | set `exportData` (`export-data`); off by default |
| [The report's words in pivotkit-report](#report-words) | a script reads the words of a report pivotkit-report or the CLI writes | take the new words, or pass `labels: DEFAULT_LABELS` |
| [Command line](#cli-0-6) | a script runs `pivotkit` and reads its exit code, `--json` or stderr | check the list below |

### Versions move together { #versions-0-6 }

Each package depends on the others of the same release, and in 0.x a caret range admits one minor
only. A host that also lists pivotkit-core, pivotkit-report or pivotkit-xlsx itself updates them to
the versions released with pivotkit-react 0.6 (their CHANGELOGs say which), or npm installs two
copies.

### Export → Table as CSV { #table-as-csv }

The Export menu's **CSV file (.csv)** is called **Table as CSV (.csv)** (German **Tabelle als CSV
(.csv)**), so it is not taken for the rows behind the report. Its label key (`exportCsv`) and its
`onExport` kind `"csv"` stay.

### Source data { #source-data-0-6 }

`exportData` (pivotkit-element: `export-data`) adds **Source data** to the Export menu: every row of
the data shown as CSV or JSON. It is off by default because it holds columns no view places; see
[security](../security.md). `onSaveTemplate`, `onPublishTemplate` and the element's
`pivot-template-save` and `pivot-template-publish` also get `source`, the data the view was made for;
a host that ignores it changes nothing.

### The report's words in pivotkit-report { #report-words }

Without `labels`, `render()` (and so `pivotkit render`) writes the report's words in the language of
its locale, German for `de-DE` ("Gesamtergebnis", "Summe von Units"), and in English the words the
report on a page shows: "Yes" and "No" instead of "true" and "false", "Distinct count" instead of
"Count Unique". The HTML report's details give "Rows: 8" (it said "Rows: 8 rows"). Pass
`labels: DEFAULT_LABELS` (pivotkit-core) for the engine's own words.

### Command line { #cli-0-6 }

- A view file or link that names a workbook's sheet the data does not have is an error (exit 2,
  `NO_SHEET`), not a run on the first sheet; `--sheet` reads another.
- `--strict` also fails on `LINES_SKIPPED` (title lines skipped, a warning now) and on the new
  `noRowsKept` (filters that keep no row).
- `--json`: `validate` and `describe` of a view add `uses`; `describe` of a view gives `findings`
  instead of `errors` and `warnings`; `describe` of data gives `rows`, `fields` and `text`; every
  command with data gives `sheet`.
- `-o report.html -f csv` is a usage error (the name and the format disagree).
- Usage errors end with `see "pivotkit help <command>"`, and `render` says on stderr what it wrote
  (`-q` keeps it off).

## From 0.4 to 0.5 { #from-0-4 }

Most hosts change nothing: views, files and links of 0.4 load with the same result. Check the list
below for what your page does; **Breaking** marks a change that needs your action when it applies.
Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| **Breaking:** [view and file format 2](#view-and-file-format-2) | users share views, files or links with a page that still runs 0.4 | upgrade those pages too |
| **Breaking:** [dark theme selectors](#dark-theme-selectors) | your CSS sets `--pk-*` tokens for the dark theme | write them for `[data-pk-theme="dark"]` |
| **Breaking:** [import maps](#import-maps) | your page loads pivotkit-react through an import map | map `pivotkit-report` and `pivotkit-core/chart` |
| [Colour scale in blue](#colour-scale) | you liked red, yellow, green | set three tokens |
| [Column subtotals off](#column-subtotals) | your start view or templates rely on column subtotals | add `totals: { colSubtotals: true }` |
| [Label `filter` removed](#labels) | you pass `labels.filter` | nothing; remove it |
| [Font weights 550 and 650 are 600](#font-weights) | you compare screenshots | nothing, or `--pk-weight-strong` |
| [Chart text 14 px](#chart-text) | you compare screenshots | nothing |

### View and file format 2 { #view-and-file-format-2 }

**Breaking.** The report writes views, [view files](../reference/view-file.md) and links of format
version 2: a filter has one shape with `not` and `blanks`. Views, files and links of version 1 load
with the same result. pivotkit 0.4 refuses a view, file or link of version 2 as newer, so a link
shared from the new release does not open on a page that still runs 0.4. A host that reads the
filters of a normalized view in its own code reads the new shape (pivotkit-core's CHANGELOG lists the
names).

### Dark theme selectors { #dark-theme-selectors }

**Breaking** for a host that sets its own dark colours. Write them for the theme the report shows,
not for an attribute of the page:

```css
/* pivotkit-react */
.pk-root[data-pk-theme="dark"] {
    --pk-surface: #101418;
}
/* pivotkit-element */
pivot-report[data-pk-theme="dark"] {
    --pk-surface: #101418;
}
```

A rule such as `html[data-theme="dark"] .pk-root` keeps working on screen, but the Excel export and
the HTML report read the light theme by showing it on the report for a moment: a rule on the page's
attribute stays active then, and your dark colours land in the file
([Theming, Light and dark](../reference/theming.md#light-and-dark)).

### Import maps { #import-maps }

**Breaking** for a page without a bundler. pivotkit-react imports `pivotkit-report` (on the first
HTML report, SVG or print of the Export menu) and `pivotkit-core/chart` (on the first chart) by their
bare names: add both to the import map
([Bundlers and import maps](react.md#bundlers-and-import-maps)). A bundler and pivotkit-element need
nothing.

### Colour scale { #colour-scale }

A colour scale without colours of its own runs from light to strong blue (`--pk-scale-low` and
`--pk-scale-high`, the heatmap's colours): it says "more", not "good" or "bad". `--pk-scale-mid` is no
longer set; a host that sets it gets a three-colour scale. The colours of 0.4, red over yellow to
green, come back with these tokens (on `pivot-report` for the web component):

```css
.pk-root {
    --pk-scale-low: #f8696b;
    --pk-scale-mid: #ffeb84;
    --pk-scale-high: #63be7b;
}
.pk-root[data-pk-theme="dark"] {
    --pk-scale-low: #c2413f;
    --pk-scale-mid: #b39a2e;
    --pk-scale-high: #3f9a5c;
}
```

The Excel export and the HTML report take them too. A view's own colours are unchanged. With
pivotkit-core alone, pass `theme: { colorScale: ["#f8696b", "#ffeb84", "#63be7b"] }` to `toXlsx`.

### Column subtotals { #column-subtotals }

Column subtotals are off by default; row subtotals and both grand totals stay on. Every view the
report saves, shares or stores names all four totals, so these keep what they showed. A start view, a
template or a view file written by hand without `totals.colSubtotals` shows no column subtotals now:
add `totals: { colSubtotals: true }` to keep them.

### Labels { #labels }

The field list's menu has one entry for filtering, **Add to Filters**; the label key `filter` of the
old "Filter…" entry is gone, and a host's text for it is ignored.

### Font weights { #font-weights }

The font weights are four tokens (`--pk-weight-normal` 400, `--pk-weight-medium` 500,
`--pk-weight-strong` 600, `--pk-weight-bold` 700). The weights 550 (field chips, the drill-down's
path) and 650 (titles, table headers) are 600 (`--pk-weight-strong`); a font without those faces drew
them as 600 or 700 anyway.

### Chart text { #chart-text }

The chart's axes, legend and labels are 14 px (`--pk-chart-text-size`, by default `--pk-small`), not
ECharts' 12 px; labels slant or thin out a little sooner. Text in the report is never below 14 px.
With pivotkit-core alone, `theme: { textSize: 12 }` keeps the old size.
