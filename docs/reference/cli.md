---
title: pivotkit-cli
description: The pivotkit command line - render a view over CSV, JSON or Excel data to an HTML report, CSV, JSON, XLSX or SVG, get a draft view from a file's fields or render from layout flags without a view file, validate and describe views in CI, with stable exit codes, --json, shell completion and safe file handling.
---

# pivotkit-cli

`pivotkit` runs [views](view-file.md) without a browser: it renders a view over a data file, checks
views in a pipeline before they go live, and describes views and data. It needs no network, and with
`--now` its output is the same on every run.

```bash
npm install --global pivotkit-cli     # the command pivotkit
pivotkit example                      # writes sales.csv and two views into this directory
pivotkit render sales.pivotkit.json --data sales.csv -o sales.html --now 2026-11-13
```

Without installing, `npx pivotkit-cli <command>` runs it once (`npx pivotkit-cli example`); it does
not put `pivotkit` on the `PATH`. In a project, `npm install --save-dev pivotkit-cli` and
`npx pivotkit <command>`. Step by step: [getting started with the command line](../getting-started/cli.md).

Node 22 or later. It brings [pivotkit-report](report.md), pivotkit-core, pivotkit-xlsx and ECharts
6.1.0.

## Try it { #try-it }

`pivotkit example` writes the default example, `sales`, into the current directory, says what each
file is and what to run next; `pivotkit example weather` writes the other one, `pivotkit example
--list` names them all and writes nothing. It never writes over a file: when one of its files is
there, it writes nothing (exit 2, `EXISTS`); each file is linked into place, so one that appears
while it writes is not replaced either.

```text
$ pivotkit example
Wrote 3 files into this directory:
  sales.csv                  the data: 2,000 rows of generated sales, as the report's Export → Source data writes it
  sales.pivotkit.json        a view: Revenue by region and category (a table)
  sales-chart.pivotkit.json  a view: Monthly revenue trend (a line chart)
Next:
  pivotkit render sales.pivotkit.json --data sales.csv -o sales.html    (an HTML report: open it in a browser)
  pivotkit validate sales-chart.pivotkit.json --data sales.csv --strict
  pivotkit describe sales.csv
Other examples: pivotkit example weather
```


| Example | Files | What |
| --- | --- | --- |
| `sales` | `sales.csv`, `sales.pivotkit.json`, `sales-chart.pivotkit.json` | Generated sales, 2,000 rows: revenue by region and category, and a monthly chart. |
| `weather` | `weather.csv`, `weather.pivotkit.json`, `weather-SOURCE.txt` | Daily weather of 14 cities, 2023-2025, 15,344 rows: the mean temperature per city and month, the playground's start. Weather data by [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0: `weather-SOURCE.txt` holds the attribution and the changes made; keep it with the data. |

The same files are on this site: [sales.csv](../assets/examples/sales.csv),
[sales.pivotkit.json](../assets/examples/sales.pivotkit.json),
[sales-chart.pivotkit.json](../assets/examples/sales-chart.pivotkit.json),
[weather.csv](../assets/examples/weather.csv),
[weather.pivotkit.json](../assets/examples/weather.pivotkit.json),
[weather-SOURCE.txt](../assets/examples/weather-SOURCE.txt). They are the playground's data and
its start views as the report downloads them, so the HTML report shows what the
[playground](../demo.md) shows.

Your own report: in the report, **Views**, **Download view** gives the view file, and **Export**,
**Source data**, **All rows as CSV** the data it was made on (where the application turns it on; the
playground does). `pivotkit render <name>.pivotkit.json --data <name>-data.csv -o report.html` makes
the report again. The table's own CSV (**Export**, **Table as CSV**) is the result, not the data: a
view does not apply to it.

## Commands

| Command | What it does |
| --- | --- |
| `pivotkit render <view> --data <file> [-o <file>]` | Runs the view over the data and writes an HTML report, CSV, JSON, XLSX or SVG. |
| `pivotkit render <data> --rows <field> --values <agg:field> [-o <file>]` | The same without a view file: the view from [layout flags](#a-view-from-the-datas-fields), or `--suggest` for the draft. |
| `pivotkit validate <view> [--data <file>]` | Checks the view against the data, or against the fields its view file lists (`source.fields`). |
| `pivotkit describe <view \| data>` | What a view shows and filters, or a data file's fields. |
| `pivotkit describe <data> --suggest [-o <file>]` | A [draft view](#a-view-from-the-datas-fields) of the data as a view file: on stdout, or into `-o`. |
| `pivotkit example [name] [--list]` | Writes an example's data and views into the current directory (default `sales`), never over a file, and says what to run next; `--list` names the examples ([Try it](#try-it)). |
| `pivotkit completion bash \| zsh \| fish \| powershell` | The shell's completion script. |
| `pivotkit help [command]`, `-h`, `--version` | Help; the versions of pivotkit-cli, pivotkit-report and pivotkit-core. |

`<view>` is a view file, a view as JSON text (`'{"rows":["Region"]}'`), or `-` for stdin;
`--link <url>` reads it from a [pivotkit link](../concepts/sharing.md) instead (`--key` for a page with
several reports). Only one input can come from stdin. An argument that starts with `{` is always
read as JSON text: a file whose name starts with `{` is given as `./{name}.json`.

## Options

| Option | Commands | What it does |
| --- | --- | --- |
| `--data <file>` | render, validate, describe | CSV, TSV, JSON or XLSX, or `-` for stdin ([what is read](import.md)). |
| `--data-format csv\|json\|xlsx` | | The data's format; needed for stdin, else the file's extension. |
| `--sheet <name>` | | The sheet of a workbook. Without it: the sheet the view names (`source.params.sheet`, written by the report for a view made on a workbook's sheet), else the first visible one. [More](#the-sheet-of-a-workbook) |
| `-f, --format html\|csv\|json\|xlsx\|svg` | render | Default: the extension of `-o` (`.htm` is `html`); another extension, or none, is a usage error. On stdout `html`. |
| `-o, --output <file>` | render | Write here instead of stdout. A regular file there is replaced whole; a link, a directory or a device is refused. Its directory must exist. |
| `--template <file>` | render | `html`: a [print template](print-template.md). |
| `--title <text>` | render | `html`, `xlsx`: the report's title (default the view file's name). |
| `--chart auto\|on\|off` | render | `html`: the chart above the table (`auto`: when the view shows the chart). |
| `--width`, `--height <px>` | render | `svg`, `html`: the chart's size (800 x 480). |
| `--bom auto\|on\|off` | render | `csv`: a byte order mark first, so Excel reads the file as UTF-8. `auto`: in a file of `-o`, not on stdout, where a program would read it as part of the first header. |
| `--suggest` | render, describe | A draft view from the data's fields ([below](#a-view-from-the-datas-fields)). |
| `--rows`, `--cols <field>` | render, describe `--suggest` | A field on the rows or the columns, outer first; repeat the flag for the next level. |
| `--values <agg:field>` | | `sum:Revenue`, `"average:Mean °C"`, `count` (the rows), or a field alone (a number summed, an identifier or another type counted); repeatable. |
| `--group <field:unit>` | | Group a field where it is placed: `Date:yearMonth`, `Date:month` (Jan to Dec of every year), `Revenue:bin:500`; repeatable. |
| `--filter <json>` | | A filter as a view writes it, as JSON text or `@file.json`; repeatable. |
| `--chart-type <type>` | | Show the chart: `auto`, `bar`, `line`, `area`, `pie`, `donut`, `heatmap`. |
| `--map <old=new>` | render, describe `--suggest` | The view's field `old` is the data's `new`, for a column renamed since the view was made; with a view file too. |
| `--save-view <file>` | render | Also write the view used as a view file (after `--map`; the view the layout flags or `--suggest` made). |
| `-o, --output <file>` | describe `--suggest` | The draft view file; without it the view file goes to stdout. |
| `--lenient` | render, describe `--suggest` | Write the output also when the view has errors, as the report shows it; still exit 1. `describe --suggest`: the draft also when there is nothing to group by. |
| `--strict` | render, validate, describe | Warnings are findings too. |
| `--as view\|data` | describe | Read the input as a view or as data (default: a view when it is one). |
| `--items <n>` | describe | Data: list up to n values of each field (default none). |
| `--json` | all | One JSON object on stdout (render: needs `-o`). |
| `-q, --quiet` | all | No warnings and no line saying what was written on stderr; errors still. |
| `--verbose` | render, validate, describe | Also how the data was read: encoding, separator, sheet (the reader's `info` notes) on stderr. |
| `--locale <tag>` | render, describe `--suggest` (taken and checked by all) | Default `en-US`; environment `PIVOTKIT_LOCALE`. The locale also picks the CSV separator (`;` where the decimal mark is a comma) and the report's words: German ones ("Gesamtergebnis", "Summe von Units") for a German locale, as the report on a page writes them, English for any other. |
| `--time-zone <zone>` | all | The data's dates; default `UTC`; environment `PIVOTKIT_TIME_ZONE`. |
| `--now <date>` | render (taken and checked by all) | "Today" of relative filters and the generated time; environment `PIVOTKIT_NOW`. |
| `--limit key=n` | all | One of pivotkit-core's [limits](../concepts/limits.md) (`--limit rows=200000`); repeatable. |
| `--allow-dir <dir>` | all | Read and write only inside this directory; repeatable. |

An option on the command line wins over its environment variable. Every command checks `--locale`,
`--time-zone` and `--now` (from the command line or the environment, and the message names the
variable), so a wrong value in a pipeline's environment fails in every step, not only in `render`. An
option given for a format it does nothing in (`--width` with `csv`) is a warning `ignoredOption`. The
CLI writes no colours.

## What it says

stdout carries only a command's output: the rendered report or file without `-o`, the `--json`
object, `pivotkit example --list`, what `describe` describes, help and completion scripts. Everything
said to a person goes to stderr: the findings, and a line that says what was written or checked, so a
run in a terminal is never silent and a pipe gets the output alone; `-q` keeps stderr to errors.
`pivotkit example` writes files, so all it says is on stderr. Commands accept every common option,
and `pivotkit help <command>` lists the ones that act in it.

| When | stderr |
| --- | --- |
| `render -o` wrote a file | `wrote sales.html: an HTML report, 21 rows x 6 columns, from 2,000 rows of sales.csv` (nothing when the output goes to stdout) |
| `render --lenient` wrote despite errors | the errors, then `wrote out.html despite 2 errors (--lenient)` |
| the view has errors | the errors, then `nothing written: the view has errors.` |
| `validate` found nothing | `valid: no errors, no warnings (with sales.csv)`, or without `--data`: `valid against the fields the view file lists (source.fields), not against data: give --data to check it with the data` |
| a usage error | `pivotkit: ...; see "pivotkit help render"` |
| `-o` into a directory that does not exist | below the working directory `the directory "out" does not exist: create it first (mkdir -p out)`, elsewhere `its directory does not exist` |
| `-o report.html -f csv` | a usage error: the name says HTML, `-f` CSV (an extension that is no format of pivotkit's, `-o out.txt -f csv`, is written as asked) |
| an HTML report to the terminal (no `-o`) | the report on stdout, and `an HTML report was written to the terminal: add -o report.html to save it` |
| title lines above the header were skipped | `warning LINES_SKIPPED: ...` (they may be data; a finding with `--strict`) |
| the filters keep no row | `warning noRowsKept: the filters keep none of the 2,000 rows of sales.csv (a date filter counts from --now or today)` (a table of zeros otherwise; with `--strict` a finding) |
| data or a view from stdin on a terminal | `reading the data from stdin: type or paste it, then Ctrl-D (Ctrl-Z, Enter on Windows)` |
| a view that is not JSON | `not a view: not valid JSON at line 2, column 30` |

### When the data does not fit the view { #data-mismatch }

When the data lacks fields the view uses, the first error says so, with both lists and what to do;
the errors that follow from it (an unknown field, a grouping whose name the data has) are counted
there and listed in `--json`:

```text
error dataMismatch: pivotkit-weather.csv does not have the fields the view uses
  the view uses: City, Date, Mean °C
  the data has: Date by month of year, Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Grand Total
  it looks like an exported pivot result ("Grand Total", "Average of Mean °C"), not the rows the report was made from:
  in the report, take Export → Source data → All rows as CSV, and give that file to --data
  or give --data the file the report was made from, if you have it
  and 3 more errors from the missing fields (--json lists them)
nothing written: the view has errors.
```

That is the table's own CSV (Export, **Table as CSV**): the result of a view, not the data a view
applies to ([Try it](#try-it)). With both signs (a "Grand Total" column and a value's name such as
"Average of …") the message says it looks like one, with one sign that it may be one. A long list of
fields is cut ("… and 12 more"; `dataFields` in `--json` has all). Messages quote the data's field
names and at most one cell value, cut at 20 characters; a file is named by its base name. A field the data has under a near name is named
(`missing: "Mean °C" (did you mean "Mean C"?)`); a field the view file lists with its type that the
data has as the one new field of that type is named as a rename (`missing: "Revenue" (number); the
data has a new number field "Turnover": renamed? --map "Revenue=Turnover"`, the flag that renders the
view on the renamed column, [below](#map); with two or three such fields it names them and
`--map "Revenue=<its new name>"`); an unknown field lists the fields the data has; a
value refused on a text field names the value and row that made it text (`its value "n/a" in row 2 is
no number`); an aggregator as other tools name it gets ours as the hint (`avg`: did you mean
`average`?). `--lenient` writes the report all the same and says how many errors it has, and when the
data lacks the view's fields that the report shows none of them.

## A view from the data's fields { #a-view-from-the-datas-fields }

Point the command line at a file and get a view without opening the browser: `describe --suggest`
writes a draft view file, `render` with layout flags renders without a view file, and `render
--suggest` renders the draft at once.

```bash
pivotkit describe sales.xlsx --suggest -o draft.pivotkit.json       # a draft view file
pivotkit render draft.pivotkit.json --data sales.xlsx -o draft.html  # the report of it
pivotkit render sales.xlsx --suggest -o draft.html                   # both in one step
pivotkit render sales.xlsx --rows Region --cols "Order date" --group "Order date:yearQuarter" \
  --values sum:Revenue -o by-quarter.html --save-view by-quarter.pivotkit.json
```

```text
$ pivotkit describe sales.csv --suggest -o draft.pivotkit.json
draft: rows Region; columns Month by month; values Sum of Units
  other text fields: Country, Product, Category, Channel
  other numbers: Revenue, Discount
  to change a part: pivotkit describe sales.csv --suggest --values sum:Revenue (or --rows, --cols, --group <field>:<unit>)
wrote draft.pivotkit.json: a draft view of sales.csv
next: pivotkit render draft.pivotkit.json --data sales.csv -o draft.html
```

### What --suggest picks { #suggest }

| Part | Rule |
| --- | --- |
| Rows | The first text field with 2 to 50 values that repeat (not every row its own value) and no identifier's name. |
| Columns | The first date, grouped by its span: up to 62 days by day, up to two years by month, up to six years by quarter, longer by year, named as the report names a date it groups (`Order date by month`). Without a date: the next text field with up to 12 values. Without a text field on the rows, the date goes to the rows. |
| Values | The first number field whose name is no identifier (its last word ID, Nr, No, Number, Key or `#`), summed; none: the count of rows. |

The rules read the fields' types and counts, not what they mean: a temperature or a price is summed
like revenue. The lines on stderr name the other fields a part could take and a line to paste that
changes one part: every layout flag given with `--suggest` replaces that part of the draft
(`--values "average:Mean °C"` keeps the suggested rows and columns). The draft is a view file of
format 2: its name is `Draft: ` and what it shows, its description says where it came from, and it
names the data as the report names a loaded file, with the sheet of a workbook (`source.params.sheet`),
so **Views**, **Open view file** in the report opens it on that file and sheet. It is checked against
the data as `validate --strict` would; same file, same draft on every machine (`--locale` changes the
names of groupings and of the view).

Without `-o`, the view file goes to stdout (`pivotkit describe x.csv --suggest > x.pivotkit.json`);
with `--json` it is the `view` key of the object instead, and with `-o` and `--json` the object has
`output` (`{ file, bytes }`) and no `view`. `describe` without `--suggest` writes nothing, and its
layout flags and `-o` are a usage error there.

A file that looks like an exported pivot result (a `Grand Total` column, `Sum of …` headers) is
said with what to take instead, as for a view that [does not fit](#data-mismatch).

Nothing to group by (a workbook whose first sheet is a note, a file of one column of different
values) is an error, `noSuggestion` (exit 1), and nothing is written unless `--lenient`. For a
workbook it names the other sheets and the command for one:

```text
error noSuggestion: the sheet "Readme" of book.xlsx has nothing to group by (no text field with 2 to 50 values that repeat, and no date)
  the workbook's other sheets: "2025", "2026"; try: pivotkit describe book.xlsx --suggest --sheet 2025
```

### Layout flags { #layout-flags }

`render` with any of `--rows`, `--cols`, `--values`, `--group`, `--filter` or `--chart-type` (or
`--suggest`) makes its view from the data's fields. The data is the argument or `--data` (both: a
usage error); a view (the argument, `--link`) and layout flags together are a usage error too, so
`pivotkit render sales.csv` alone still asks for a view. The view runs as a view file would: checked
with "did you mean" hints, exit codes 0, 1 and 2 as for a view.

- **One value names one thing**, and each flag may be repeated, outer first: `--rows Region --rows
  Product`. There are no comma lists, so a field name may hold commas, spaces and colons (`--rows
  "Revenue, EUR"`). Names match in any case and are written as the data spells them.
- **`--values`**: `<agg>:<field>` splits at the first colon only when what is before it is an
  aggregator (`sum`, `average`, `count`, `countUnique`, `median`, `min`, `max`, …, any case), so
  `"sum:Time: start"` sums the field `Time: start`; a field named exactly as the whole value wins.
  A misspelt aggregator before a field of the data (`summ:Revenue`) is a usage error with the one
  meant.
  `count` alone counts the rows.
- **`--group`**: `<field>:<unit>`, the unit after the last colon, or `<field>:bin:<size>` for number
  ranges. The units are the view file's: `year`, `yearQuarter`, `yearMonth`, `yearWeek`, `day` along
  the time line (Jan 2025, Feb 2025), `quarter`, `month`, `week`, `weekday`, `hour` repeating (Jan to
  Dec of every year together). The grouping takes its field's place on the axes; a grouping whose
  field is on no axis is a warning `unusedGroup`. A date on an axis without `--group` is grouped by
  its span as the report groups a date it places, said in an `info` finding `dateGrouped`.
- **`--filter`**: a filter as a [view](view-file.md) writes it, as JSON (`'{"field":"Region","type":"in","items":["North"]}'`)
  or `@file.json` (PowerShell: `--filter '@north.json'`, where quoting JSON is awkward); a list of
  filters in one file works too.
- **`--chart-type`** shows the chart of that type (the SVG, and the HTML report above the table);
  `--chart auto|on|off` keeps its meaning. With a view file it is a usage error: the view sets its chart.
- **`--save-view <file>`** writes the view used as a view file (named as `describe --suggest` names
  the data), only when nothing failed (or with `--lenient`); `-o` and `--save-view` naming one file is
  a usage error. `pivotkit render <saved> --data <file>` gives the same report.

### --map { #map }

`--map Old=New` says that the view's field `Old` is the data's `New`: a column renamed since the view
was made. Every place the view names the field is renamed (rows, columns, values, filters and the
measures they go by, sort, a grouping's field), the types the view file lists too; a grouping's own
name stays. It works with a view file, a link and the layout flags, and with `--save-view` it keeps
the renamed view. The `=` that splits is the one whose left part the view uses, so a name may hold
`=`. Each name mapped is an `info` finding `mapped` (`--verbose`, `--json`); a name the view does not use
is a warning `unusedMap`; two names mapped onto one, or a name mapped onto a field the view keeps,
is a usage error.

```bash
pivotkit render revenue.pivotkit.json --data new-export.csv --map Revenue=Turnover -o report.html --save-view revenue-turnover.pivotkit.json
```

## Exit codes

| Code | Means |
| --- | --- |
| 0 | Done. Warnings and the line that says what was written are on stderr (with `--verbose` also the reader's notes on how the data was read). |
| 1 | Findings: an error in the view, or a warning with `--strict`. `render` writes nothing unless `--lenient`. |
| 2 | A usage error, a file that cannot be read or written, a limit, or a refused template. Nothing is written. |

## --json

One object on stdout, for scripts and for the PowerShell Universal module:

```json
{ "ok": false, "exitCode": 1, "command": "validate",
  "findings": [{ "severity": "error", "code": "unknownField", "path": "rows[0]",
                 "message": "unknown field \"Regoin\"", "suggestion": "Region" }],
  "valid": false }
```

- `findings`: each with `severity` (`error`, `warning`, or `info` for a reader's note on how a file was
  read), `code` ([the view's issue codes](core.md), the reader's note codes, `viewFile`,
  `dataMismatch`, `typeFromView`, `typeFromViewFailed`, and from a view made from the data's fields
  `noSuggestion`, `pivotResult`, `dateGrouped`, `unusedGroup`, `unusedMap`, `mapped`), `path`, `message` and, where there is one,
  `suggestion`. `dataMismatch` also has `missing`, `dataFields`, `pivotResult` and `details` (the lines
  stderr shows); an error that follows from it has `followsFrom: "dataMismatch"`.
- `error` (exit 2): `{ kind, code, message }`, `kind` one of `usage`, `io`, `limit`, `template`,
  `internal` (more may come).
- `pivotkit --version --json`: `{ "pivotkit-cli", "pivotkit-report", "pivotkit-core", environment }`,
  `environment` with `node`, `locale`, `timeZone` (each `{ value, from, known }`: from the environment
  variable or the default, and whether Node's Intl knows it), `now` (`{ value, from }`) and pivotkit-core's
  default `limits`: for a bug report or a CI log.
- `render`: `summary` and `output` (`{ file, format, mediaType, bytes }`, or `null` when nothing was
  written); with `--save-view` also `savedView` (`{ file, bytes }`); with `--suggest`, `draft: true`
  and `picks`. `describe --suggest`: `draft: true`, `picks` (each `{ part, code, field, agg, by,
  others, text }`), `view` or `output`, `sheet` and, for a workbook, `sheets`. `validate`: `valid` and `uses` (the data's fields the view uses). `describe`: `kind`
  (`view` or `data`) and `description` (pivotkit-core's [`describeView`](core.md) without its
  `errors` and `warnings`, which are the `findings`, plus `valid`, `name` and `uses`; or
  [`describeSource`](core.md)'s `rows`, `fields` and `text`).
- `validate`, `describe` and `render` are operations of pivotkit-report's
  [operation table](report.md#operations), which the [MCP server](mcp.md) and the
  [REST service](rest.md) share: the same findings and the same output there.
- `render`, `validate` and `describe`: `sheet`, the sheet of a workbook read (`null` for other data or
  without data). `describe` of a workbook also gives `sheets`: `[{ name, index, visible }]` in the
  workbook's order.

## The sheet of a workbook

A view made in the report on a workbook's sheet names that sheet in its view file and link
(`source.params.sheet`, [view file](view-file.md)). `render`, `validate` and `describe` of such a view
read that sheet of `--data` when `--sheet` is not given, and say so in an `info` finding `viewSheet`
(in `--json`, and on stderr with `--verbose`); `--sheet` reads another. A view without a sheet reads the first visible sheet. Data
that is no workbook does not use the view's sheet (an `info` finding `viewSheet` says so).

A sheet the workbook does not have, named by `--sheet` or by the view, is an error (exit 2, `io`,
`NO_SHEET`) that names the sheets there are:

```text
pivotkit: quarters.xlsx: the workbook has no sheet "Q4" (the view's source.params.sheet; give --sheet to read another); its sheets: "Q1", "Q2", "Q3"
```

`describe` of a workbook lists its sheets after its summary line, the one read marked:
`sheets: "Q1" (read), "Q2", "Q3"`; a hidden one says `(hidden)` (`(read, hidden)` when it is read).
Names are quoted as JSON text. An empty `--sheet ""` counts as not given.

## What describe shows

For data: the fields with their types and counts (distinct, blank). Values, and the smallest and
largest value, only with `--items <n>`: a file's values can be personal or confidential, and a
pipeline log or a language model reading it needs the names and types more often than the values.
For a view: one sentence of what it shows and filters, and its findings; it needs the data (or a view
file with `source.fields`) to check the fields.

## Types from the view file { #types-from-the-view-file }

A CSV says nothing about types: the reader infers them ([what is read](import.md)), so a column of
text such as `1e3`, `12` or `true` is read as a number or a boolean. A view file written by the report
lists the fields it uses with their types (`source.fields`); `render`, `validate` and `describe` read
such a column as that type, and say so in `--json` (an `info` finding `typeFromView`). A type that a
value of the column does not fit is not applied (a view file made for other data never blanks a
column): the column stays as read, with the warning `typeFromViewFailed` naming the value and its row
(a finding with `--strict`). What a CSV cannot carry stays different from the data the view was made
on: a row without any value is skipped, text is trimmed and its line breaks read as spaces, and text
a spreadsheet would run as a formula carries the leading `'` the report wrote; the JSON of Source data
keeps all of it. The files hold wall-clock dates without a time zone: give `--time-zone` and `--now`
for a report that is the same on every run.

## Files

- A file is opened once, as a **regular file** only (a FIFO, a directory or a device is refused, and
  a FIFO never makes the CLI wait), and its size is checked against `fileBytes` (100 MiB) **before**
  it is read; a view file has at most 4 MB, a template 1 MB.
- **Workbooks you did not make**: by default a workbook may unpack to 500 MiB (`unpackedBytes`).
  Whitespace padding costs little (a 54 KB file padded to 50 MiB reads in about 0.4 s with about
  200 MB), but content that is kept costs a few times its size: 100 MiB of shared strings took about
  2.4 s and 660 MB (Node 26, Apple M4; approximate), 500 MiB would take gigabytes. For untrusted files
  lower the limit to what your workbooks need and give the run a time limit:
  `timeout 60 pivotkit describe upload.xlsx --limit unpackedBytes=104857600` (`timeout` is GNU
  coreutils; `gtimeout` on macOS with Homebrew's coreutils). See
  [Untrusted workbooks](../security.md#untrusted-workbooks).
- **Output** goes to a new temporary file next to the target, then replaces it: no half-written
  file. A link, a directory or another non-regular file at the target is never replaced; for stdout
  leave out `-o` (`-o /dev/stdout` is a device). The directory is not created. A run killed between
  the two steps leaves the temporary file (`.<name>.<pid>-<random>.tmp`).
- A file that has more bytes when it is read than its size said (it grew, or a `/proc` file that
  says 0) is refused, never cut.
- **`--allow-dir`** is a hard limit: every file read or written must lie inside one of the
  directories after its real path is resolved (symbolic links and `..` followed), checked on the
  path and again on the opened file. Without it the CLI reads and writes with your own rights, as any
  command-line tool does. It narrows what a mistake or a hostile view file name can reach; it is
  **not a sandbox**: not against another process of the same user that changes the directories while
  it runs, and a hard link inside an allowed directory to a file outside it reads that file (no path
  check can tell a hard link apart). Run the CLI as a user that can only reach what it should, or in
  a container, where that matters.
- **Messages** name a file by its base name and never print a file's content; names and messages
  from a view or the data are cleaned of control characters and cut at 200 characters.
- **`pivotkit example`** writes its files the same way, in the current directory, after checking that
  none of them is there yet (one that is: nothing is written, exit 2, `EXISTS`); `--allow-dir` holds.
- Templates and file paths come only from the person running the command. The [MCP server](mcp.md),
  built on the same file handling (`pivotkit-cli/files`: `readSafe`, `writeSafe`, `writeNew`,
  `allowedDirs`, `readTable`), takes a template only from its operator and a path from a model only
  inside the operator's allowed directories, and refuses hard links there.

## Completion

```bash
eval "$(pivotkit completion bash)"                 # ~/.bashrc
eval "$(pivotkit completion zsh)"                  # ~/.zshrc
pivotkit completion fish | source                  # ~/.config/fish/config.fish
pivotkit completion powershell | Out-String | Invoke-Expression   # $PROFILE
```

The scripts, like the help, are made from the CLI's one table of commands and options.

## In CI

With the example files committed to `reports/` (`pivotkit example`, then move them there):

```bash
mkdir -p out
pivotkit validate reports/sales.pivotkit.json --data reports/sales.csv --strict
pivotkit render reports/sales.pivotkit.json --data reports/sales.csv -o out/sales.html --now 2026-11-13 --json > out/report.json
```

A GitHub Actions workflow with these steps is in [getting started](../getting-started/cli.md#ci).
In PowerShell, `--json` gives an object:

```powershell
$result = pivotkit validate reports/sales.pivotkit.json --data reports/sales.csv --json | ConvertFrom-Json
if (-not $result.ok) { $result.findings | Format-Table severity, code, message; exit $result.exitCode }
```
