---
title: pivotkit-cli
description: The pivotkit command line - render a view over CSV, JSON or Excel data to an HTML report, CSV, JSON, XLSX or SVG, get a draft view from a file's fields or render from layout flags without a view file, validate and describe views in CI, run the same commands against a pivotkit-server's sources, with stable exit codes, --json, shell completion and safe file handling.
---

# pivotkit-cli

`pivotkit` runs [views](view-file.md) without a browser:

- It renders a view over a data file.
- It checks views in a pipeline before they go live.
- It describes views and data.

On local files, it needs no network, and with `--now` its output is the same on every run. With
`--url` and `--source`, the same commands run on the sources of a [pivotkit-server](rest.md)
([With a server](#with-a-server)), for data that lives there. `pivotkit login` signs you in where
the server uses a sign-in provider ([Sign in](#sign-in)). To update it, see
[Update an installation](../getting-started/upgrading.md#update).

```bash
npm install --global pivotkit-cli     # the command pivotkit
pivotkit example                      # writes sales.csv and two views into this directory
pivotkit render sales.pivotkit.json --data sales.csv -o sales.html --now 2026-11-13
```

Without installing, `npx pivotkit-cli <command>` runs it once (`npx pivotkit-cli example`). It does
not put `pivotkit` on the `PATH`. In a project, run `npm install --save-dev pivotkit-cli`, then
`npx pivotkit <command>`. Step by step: [getting started with the command line](../getting-started/cli.md).

It needs Node 22 or later. It brings [pivotkit-report](report.md), pivotkit-core, pivotkit-xlsx and
ECharts 6.1.0.

## Try it { #try-it }

`pivotkit example` writes the default example, `sales`, into the current directory. It says what
each file is and what to run next.

- `pivotkit example weather` and `pivotkit example templates` write the others.
- `pivotkit example --list` names them all and writes nothing.

It never writes over a file. When one of its files is there, it writes nothing (exit 2, `EXISTS`).
Each file is linked into place, so a file that appears while it writes is not replaced either.

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
Other examples: pivotkit example weather, pivotkit example templates
```


| Example | Files | What |
| --- | --- | --- |
| `sales` | `sales.csv`, `sales.pivotkit.json`, `sales-chart.pivotkit.json` | Generated sales, 2,000 rows: revenue by region and category, and a monthly chart. |
| `weather` | `weather.csv`, `weather.pivotkit.json`, `weather-SOURCE.txt` | Daily weather of 14 cities, 2023-2025, 15,344 rows: the mean temperature per city and month, the live demo's start. Weather data by [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0: `weather-SOURCE.txt` holds the attribution and the changes made; keep it with the data. |
| `templates` | `corporate.template.html`, `minimal.template.html` | Two print templates for the HTML report, to render with `--template` over the `sales` example: Corporate (your company's design, always light) and Minimal (follows the system's theme). See [your own corporate design](corporate-design.md). |

The same files are on this site: [sales.csv](../assets/examples/sales.csv),
[sales.pivotkit.json](../assets/examples/sales.pivotkit.json),
[sales-chart.pivotkit.json](../assets/examples/sales-chart.pivotkit.json),
[weather.csv](../assets/examples/weather.csv),
[weather.pivotkit.json](../assets/examples/weather.pivotkit.json),
[weather-SOURCE.txt](../assets/examples/weather-SOURCE.txt). They are the playground's data and
its start views as the report downloads them, so the HTML report shows what the
[playground](../demo.md) shows. The print templates are there too:
[corporate.template.html](../assets/examples/corporate.template.html),
[minimal.template.html](../assets/examples/minimal.template.html).

Your own report: in the report, **Views**, **Download view** gives the view file. **Export**,
**Source data**, **All rows as CSV** gives the data it was made on, where the application turns it
on (the playground does). `pivotkit render <name>.pivotkit.json --data <name>-data.csv -o report.html`
makes the report again. The table's own CSV (**Export**, **Table as CSV**) is the result, not the
data, so a view does not apply to it.

## Commands

| Command | What it does |
| --- | --- |
| `pivotkit render <view> --data <file> [-o <file>]` | Runs the view over the data and writes an HTML report, CSV, JSON, XLSX or SVG. |
| `pivotkit render <data> --rows <field> --values <agg:field> [-o <file>]` | The same without a view file: the view from [layout flags](#a-view-from-the-datas-fields), or `--suggest` for the draft. |
| `pivotkit validate <view> [--data <file>]` | Checks the view against the data, or against the fields its view file lists (`source.fields`). |
| `pivotkit describe <view \| data>` | What a view shows and filters, or a data file's fields (the data may be given with `--data` instead: `describe --data - --data-format csv`). |
| `pivotkit describe <data> --suggest [-o <file>]` | A [draft view](#a-view-from-the-datas-fields) of the data as a view file: on stdout, or into `-o`. |
| `pivotkit render <view> --url <address> --source <id> [-o <file>]` | The same on a server's source. `validate` and `describe` work there too ([With a server](#with-a-server)). |
| `pivotkit sources [id] --url <address>` | A server's sources, or one source's fields, types and counts. |
| `pivotkit login --url <address> [--client-id <id>]` | Signs in to a server's sign-in provider with a code in the browser and keeps the refresh token ([Sign in](#sign-in)). |
| `pivotkit token [--url <address>]` | Prints a fresh access token of a server you signed in to. |
| `pivotkit logout [--url <address>]` | Removes the kept sign-in of a server. |
| `pivotkit example [name] [--list]` | Writes an example's data and views (or, `templates`, two print templates) into the current directory (default `sales`), never over a file, and says what to run next. `--list` names the examples ([Try it](#try-it)). |
| `pivotkit completion bash \| zsh \| fish \| powershell` | The shell's completion script. |
| `pivotkit help [command]`, `-h`, `--version` | Help. `--version` gives the versions of pivotkit-cli, pivotkit-report and pivotkit-core. |

`<view>` is a view file, a view as JSON text (`'{"rows":["Region"]}'`), or `-` for stdin.
`--link <url>` reads it from a [pivotkit link](../concepts/sharing.md) instead (`--key` for a page
with several reports). Only one input can come from stdin. An argument that starts with `{` is always
read as JSON text, so give a file whose name starts with `{` as `./{name}.json`.

## Options

| Option | Commands | What it does |
| --- | --- | --- |
| `--data <file>` | render, validate, describe | CSV, TSV, JSON or XLSX, or `-` for stdin ([what is read](import.md)). |
| `--data-format csv\|json\|xlsx` | | The data's format. Needed for stdin. Otherwise the file's extension gives it. |
| `--sheet <name>` | | The sheet of a workbook. Without it: the sheet the view names (`source.params.sheet`, written by the report for a view made on a workbook's sheet), else the first visible one. For data that is no workbook, a warning `ignoredOption`. [More](#the-sheet-of-a-workbook) |
| `-f, --format html\|csv\|json\|xlsx\|svg` | render | Default: the extension of `-o` (`.htm` is `html`). Another extension, or none, is a usage error. On stdout `html`. |
| `-o, --output <file>` | render | Write here instead of stdout. A regular file there is replaced whole. A link, a directory or a device is refused. Its directory must exist. The data file, the view file (also by another name: a link to its directory, another case of its name) and `-` are a usage error (stdout is where the output goes without `-o`). |
| `--template <file>` | render | `html`: a [print template](print-template.md). Its `--pk-*` colours reach the chart ([details](print-template.md#template-design)). Two to start from: `pivotkit example templates` ([your own corporate design](corporate-design.md)). |
| `--title <text>` | render | `html`, `xlsx`: the report's title (default the view file's name). |
| `--chart auto\|on\|off` | render | `html`: the chart above the table (`auto`: when the view shows the chart). |
| `--width`, `--height <px>` | render | `svg`, `html`: the chart's size (800 x 480). |
| `--bom auto\|on\|off` | render | `csv`: a byte order mark first, so Excel reads the file as UTF-8. `auto`: in a file of `-o`, not on stdout, where a program would read it as part of the first header. |
| `--suggest` | render, describe | A draft view from the data's fields ([below](#a-view-from-the-datas-fields)). |
| `--rows`, `--cols <field>` | render, describe `--suggest` | A field on the rows or the columns, outer first; repeat the flag for the next level. |
| `--values <agg:field>` | | `sum:Revenue`, `"average:Mean °C"`, `count` (the rows), or a field alone (a number summed, an identifier or another type counted). Repeatable. |
| `--group <field:unit>` | | Group a field where it is placed: `Date:yearMonth`, `Date:month` (Jan to Dec of every year), `Revenue:bin:500`. Repeatable. |
| `--filter <field=item\|json>` | | Keep the rows of one item, as in `Country=Germany`, or any filter as a view writes it, as JSON text or `@file.json`. Repeatable. |
| `--chart-type <type>` | | Show the chart: `auto`, `bar`, `line`, `area`, `pie`, `donut`, `heatmap`. |
| `--map <old=new>` | render, describe `--suggest` | The view's field `old` is the data's `new`, for a column renamed since the view was made. Works with a view file too. |
| `--save-view <file>` | render | Also write the view used as a view file (after `--map`; the view the layout flags or `--suggest` made). The data file is a usage error. |
| `-o, --output <file>` | describe `--suggest` | The draft view file; without it the view file goes to stdout. The data file and `-` are a usage error. |
| `--lenient` | render, describe `--suggest` | Write the output also when the view has errors, as the report shows it. Still exit 1. `describe --suggest`: the draft also when there is nothing to group by. |
| `--strict` | render, validate, describe | Warnings are findings too. |
| `--as view\|data` | describe | Read the input as a view or as data (default: a view when it is one; `--data` alone is data). |
| `--items <n>` | describe | Data: list up to n values of each field (default none). |
| `--json` | all | One JSON object on stdout (render: needs `-o`). |
| `-q, --quiet` | all | No warnings and no line saying what was written on stderr. Errors still appear. |
| `--verbose` | render, validate, describe | Also how the data was read: encoding, separator, sheet (the reader's `info` notes) on stderr. |
| `--locale <tag>` | render, describe `--suggest` (taken and checked by all) | Default `en-US`. Environment `PIVOTKIT_LOCALE`. The locale also picks the CSV separator (`;` where the decimal mark is a comma) and the report's words: German ones ("Gesamtergebnis", "Summe von Units") for a German locale, as the report on a page writes them, English for any other. |
| `--time-zone <zone>` | all | The data's dates. Default `UTC`. Environment `PIVOTKIT_TIME_ZONE`. |
| `--now <date>` | render (taken and checked by all) | "Today" of relative filters and the generated time. Environment `PIVOTKIT_NOW`. |
| `--limit key=n` | all | One of pivotkit-core's [limits](../concepts/limits.md) (`--limit rows=200000`). Repeatable. |
| `--allow-dir <dir>` | all | Read and write only inside this directory. Repeatable. |
| `--url <address>` | render, validate, describe, sources, login, token, logout | A pivotkit-server's REST address, `https://host/api/v1`. Environment `PIVOTKIT_URL`. [With a server](#with-a-server) |
| `--source <id>` | render, validate, describe | The server's source to run on (`pivotkit sources` lists them). |
| `--param name=value` | render, validate, describe, sources `<id>` | A value of the source's parameter; repeatable. `pivotkit sources` says which a source needs. |
| `--token-file <file>` | render, validate, describe, sources | Read the server's token from this file instead of `PIVOTKIT_TOKEN`. |
| `--timeout <s>` | render, validate, describe, sources | Seconds to wait for the server's answer, 1 to 3600 (default 30). |
| `--client-id <id>` | login | The sign-in provider's client ID for the command line. Default: the one the server publishes. Environment `PIVOTKIT_CLIENT_ID`. |
| `--scope <scopes>` | login | The scopes to ask for, separated by spaces. Default: the server's scopes and `offline_access`. |
| `--store auto\|keychain\|file` | login | Where the refresh token goes. Default `auto`: the keychain, else a file only you read. |

An option on the command line wins over its environment variable.

Every command checks `--locale`, `--time-zone` and `--now`, from the command line or the
environment, so a wrong value in a pipeline's environment fails in every step, not only in
`render`. When the value came from the environment, the message names the variable. A locale counts
only when the runtime has data for it: `xx-XX` is refused.

An option given for a format it does nothing in (`--width` with `csv`), or `--sheet` for data that is
no workbook, is a warning `ignoredOption`.

You can paste a command that a line on stderr suggests into a shell as it is. A value with spaces is
in double quotes, one with `!` in single quotes, since bash expands `!` in double quotes. The CLI
writes no colours.

A report rendered from local files carries no time of the data, since the command line passes none, so an HTML report's details have no "Data as of", and a workbook has no `DataAsOf` property.
[With a server](#with-a-server), the file is the server's and carries the time its source gives.

## What it says

stdout carries only a command's output: the rendered report or file without `-o`, the `--json`
object, `pivotkit example --list`, what `describe` describes, help and completion scripts.

Everything said to a person goes to stderr: the findings, and a line that says what was written or
checked, so a run in a terminal is never silent, and a pipe gets the output alone. `-q` keeps stderr
to errors. `pivotkit example` writes files, so all it says is on stderr.

Commands accept every common option, and `pivotkit help <command>` lists the ones that act in it.

| When | stderr |
| --- | --- |
| `render -o` wrote a file | `wrote sales.html: an HTML report, 21 rows x 6 columns, from 2,000 rows of sales.csv` (nothing when the output goes to stdout) |
| `render --lenient` wrote despite errors | the errors, then `wrote out.html despite 2 errors (--lenient)` |
| the view has errors | the errors, then `nothing written: the view has errors.` |
| `validate` found nothing | `valid: no errors, no warnings (with sales.csv)`, or without `--data`: `valid against the fields the view file lists (source.fields), not against data: give --data to check it with the data` |
| a usage error | `pivotkit: ...; run "pivotkit render --help"`; an unknown option `pivotkit: unknown option "--bogus"; run "pivotkit render --help"`, an option before the command `"--json" comes after the command: pivotkit sources --json` (run as `pivotkit-server cli`, the pointers say `pivotkit-server cli`) |
| `-o` into a directory that does not exist | below the working directory `the directory "out" does not exist: create it first (mkdir -p out)`, elsewhere `its directory does not exist` |
| `-o report.html -f csv` | a usage error: the name says HTML, `-f` CSV (an extension that is no format of pivotkit's, `-o out.txt -f csv`, is written as asked) |
| an HTML report to the terminal (no `-o`) | the report on stdout, and `an HTML report was written to the terminal: add -o report.html to save it` |
| title lines above the header were skipped | `warning LINES_SKIPPED: ...` (they may be data; a finding with `--strict`) |
| the filters keep no row | `warning noRowsKept: the filters keep none of the 2,000 rows of sales.csv` (a table of zeros otherwise; with `--strict` a finding); a view with a date filter adds `(a date filter counts from --now or today)` |
| data or a view from stdin on a terminal | `reading the data from stdin: type or paste it, then Ctrl-D (Ctrl-Z, Enter on Windows)` |
| a view that is not JSON | `not a view: not valid JSON at line 2, column 30` |
| a data file where the view belongs (`validate sales.csv`) | `error viewFile: not a view: not valid JSON`, then `sales.csv looks like data, not a view: give it with --data (pivotkit validate <view> --data sales.csv), or describe it: pivotkit describe sales.csv` |
| a view that is no file | `pivotkit: x: not found: the view is a view file, - for stdin, JSON text or --link` |
| a view file given as `--data` alone (`describe --data view.json`) | a usage error: `--data view.json is a view, not data: describe it with pivotkit describe view.json (and its data with --data <data>)` |
| a view file where `--suggest` or a layout flag wants data | a usage error: `--suggest makes a view from a data file, and view.json is a view: give the data (pivotkit describe <data> --suggest), or describe the view with pivotkit describe view.json --data <data>` |
| a grouping that cannot be made (`--group Region:yearMonth` on a text field) | `error groupingNeedsDate at derived[0]: date grouping needs a date field`, then `and 1 more error from it (--json lists it)`: the unknown field "Region by month" that follows is left out |

### When the data does not fit the view { #data-mismatch }

When the data lacks fields the view uses, the first error says so, with both lists and what to do.
The errors that follow from it (an unknown field, a grouping whose name the data has) are counted
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
"Average of …"), the message says it looks like one. With one sign, it says it may be one. A long
list of fields is cut ("… and 12 more"). `dataFields` in `--json` has all.

Messages quote the data's field names and at most one cell value, cut at 20 characters. A file is
named by its base name. The hints:

- A field the data has under a near name is named
  (`missing: "Mean °C" (did you mean "Mean C"?)`).
- A field the view file lists with its type, which the data has as the one new field of that type,
  is named as a rename:
  `missing: "Revenue" (number); the data has a new number field "Turnover": renamed? --map "Revenue=Turnover"`.
  That is the flag that renders the view on the renamed column ([below](#map)). With two or three
  such fields, it names them and `--map "Revenue=<its new name>"`.
- An unknown field lists the fields the data has.
- A value refused on a text field names the value and row that made it text
  (`its value "n/a" in row 2 is no number`).
- An aggregator as other tools name it gets ours as the hint (`avg`: did you mean `average`?).

`--lenient` writes the report all the same and says how many errors it has. When the data lacks the
view's fields, it also says that the report shows none of them.

## A view from the data's fields { #a-view-from-the-datas-fields }

Point the command line at a file and get a view without opening the browser:

- `describe --suggest` writes a draft view file.
- `render` with layout flags renders without a view file.
- `render --suggest` renders the draft at once.

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
| Values | The first number field whose name is no identifier (its last word ID, Nr, No, Number, Key or `#`), summed. With none, the count of rows. |

The rules read the fields' types and counts, not what they mean: a temperature or a price is summed
like revenue.

The lines on stderr name the other fields a part could take, and a line to paste that changes one
part. Every layout flag given with `--suggest` replaces that part of the draft
(`--values "average:Mean °C"` keeps the suggested rows and columns).

The draft is a view file of format 2:

- Its name is `Draft: ` and what it shows.
- Its description says where it came from.
- It names the data as the report names a loaded file, with the sheet of a workbook
  (`source.params.sheet`), so **Views**, **Open view file** in the report opens it on that file and
  sheet.

The draft is checked against the data as `validate --strict` would. A field the data lacks
(`--rows Nope`) is a [data mismatch](#data-mismatch) that lists the data's fields. The same file
gives the same draft on every machine. `--locale` changes the names of groupings and of the view.

Without `-o`, the view file goes to stdout (`pivotkit describe x.csv --suggest > x.pivotkit.json`).
With `--json`, it is the `view` key of the object instead. With `-o` and `--json`, the object has
`output` (`{ file, bytes }`) and no `view`. `describe` without `--suggest` writes nothing, and its
layout flags and `-o` are a usage error there.

For a file that looks like an exported pivot result (a `Grand Total` column, `Sum of …` headers),
the message says so, with what to take instead, as for a view that [does not fit](#data-mismatch).

Nothing to group by is an error, `noSuggestion` (exit 1). Examples are a workbook whose first sheet
is a note, or a file of one column of different values. Nothing is written unless `--lenient`. For a
workbook, the error names the other sheets and the command for one:

```text
error noSuggestion: the sheet "Readme" of book.xlsx has nothing to group by (no text field with 2 to 50 values that repeat, and no date)
  the workbook's other sheets: "2025", "2026"; try: pivotkit describe book.xlsx --suggest --sheet 2025
```

### Layout flags { #layout-flags }

`render` with any of `--rows`, `--cols`, `--values`, `--group`, `--filter` or `--chart-type` (or
`--suggest`) makes its view from the data's fields.

- The data is the argument or `--data`. Both together are a usage error.
- A view (the argument, `--link`) and layout flags together are a usage error too. So
  `pivotkit render sales.csv` alone still asks for a view.
- A view file given as the data (`pivotkit render view.json --rows Region`,
  `describe view.json --suggest`) is a usage error that says to give the data, or how to run the
  view.

The view runs as a view file would: checked with "did you mean" hints, exit codes 0, 1 and 2 as for a
view.

- **One value names one thing**, and each flag may be repeated, outer first: `--rows Region --rows
  Product`. There are no comma lists, so a field name may hold commas, spaces and colons (`--rows
  "Revenue, EUR"`). Names match in any case and are written as the data spells them.
- **`--values`**: `<agg>:<field>` splits at the first colon only when what is before it is an
  aggregator (`sum`, `average`, `count`, `countUnique`, `median`, `min`, `max`, …, any case). So
  `"sum:Time: start"` sums the field `Time: start`. A field named exactly as the whole value wins.
  A misspelt aggregator before a field of the data (`summ:Revenue`) is a usage error with the one
  meant. A name from another tool, such as `avg`, gets a hint: did you mean average?
  `count` alone counts the rows.
- **`--group`**: `<field>:<unit>`, the unit after the last colon, or `<field>:bin:<size>` for number
  ranges. The units are the view file's: `year`, `yearQuarter`, `yearMonth`, `yearWeek`, `day` along
  the time line (Jan 2025, Feb 2025), and `quarter`, `month`, `week`, `weekday`, `hour` repeating
  (Jan to Dec of every year together). The grouping takes its field's place on the axes. A grouping
  whose field is on no axis is a warning `unusedGroup`. A date on an axis without `--group` is grouped
  by its span, as the report groups a date it places. An `info` finding `dateGrouped` says so.
- **`--filter`** has a short form and a JSON form:
    - `Field=Item` keeps the rows of one item: `--filter Country=Germany`. It splits at the `=` after
      a field of the data, so a name and an item may hold `=`. When two `=` follow field names, the
      first wins. With fields `a` and `a=b`, `a=b=c` keeps the item `b=c` of `a`. With a server, the
      data's fields are not known first, so it splits at the first `=`.
    - Write the item as the data spells it. With local data, an item of a text field in another case,
      or one that is none of its values, is a warning with the item meant. With `--strict`, the
      warning fails the run. For a number field, or with a server, only `noRowsKept` tells you.
    - The same field given again keeps each item: `--filter Country=Germany --filter Country=France`.
      A JSON filter stays its own filter. Filters keep the rows that all of them keep.
    - A value that starts with `{` or `[` is a filter as a [view](view-file.md) writes it, as JSON:
      `'{"field":"Revenue","type":"compare","op":">","value":1000}'`. A list of filters works too.
    - `@file.json` reads that JSON from a file. In PowerShell, where quoting JSON is awkward, use
      `--filter '@revenue.json'`.
    - `Field=Item` is the only short form. `Revenue>1000`, `Country!=Germany` or `Country<>Germany`
      is a usage error that gives the JSON filter it means. A value in neither form is a usage error
      with an example of each.
    - A field name that starts with `{` or `[` needs a JSON filter.
- **`--chart-type`** shows the chart of that type: the SVG, and the HTML report above the table.
  `--chart auto|on|off` keeps its meaning. With a view file, it is a usage error, since the view sets
  its chart.
- **`--save-view <file>`** writes the view used as a view file. The view file names the data as
  `describe --suggest` does. It is written only when nothing failed, or with `--lenient`. `-o` and
  `--save-view` naming one file is a usage error. `pivotkit render <saved> --data <file>` gives the
  same report.

### --map { #map }

`--map Old=New` says that the view's field `Old` is the data's `New`: a column renamed since the view
was made.

- Every place the view names the field is renamed: rows, columns, values, filters and the measures
  they go by, sort, a grouping's field. The types the view file lists are renamed too. A grouping's
  own name stays.
- It works with a view file, a link and the layout flags. With `--save-view`, it keeps the renamed
  view.
- The `=` that splits is the one whose left part the view uses, so a name may hold `=`.
- Each name mapped is an `info` finding `mapped` (`--verbose`, `--json`).
- A name the view does not use is a warning `unusedMap`.
- Two names mapped onto one, or a name mapped onto a field the view keeps, is a usage error.

```bash
pivotkit render revenue.pivotkit.json --data new-export.csv --map Revenue=Turnover -o report.html --save-view revenue-turnover.pivotkit.json
```

## Exit codes

| Code | Means |
| --- | --- |
| 0 | Done. Warnings and the line that says what was written are on stderr (with `--verbose` also the reader's notes on how the data was read). |
| 1 | Findings: an error in the view, or a warning with `--strict`. `render` writes nothing unless `--lenient`. |
| 2 | A usage error, a file that cannot be read or written, a limit, a refused template, or a server's refusal or a network error (`kind: "remote"`). Nothing is written. |
| 3 | `pivotkit token` and `logout`: the sign-in has ended or there is none. Run `pivotkit login` again. `error.code` names why: `INVALID_GRANT`, `NOT_SIGNED_IN`. |

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
  stderr shows). An error that follows from it has `followsFrom: "dataMismatch"`. An error that
  names a grouping the view could not make (an unknown field "Region by month" after
  `groupingNeedsDate`) has `followsFrom` with the grouping's code; stderr counts it on the grouping's
  error instead of showing it.
- `error` (exit 2): `{ kind, code, message }`. `kind` is one of `usage`, `io`, `limit`, `template`,
  `remote`, `internal` (more may come). A `remote` error also has `status` (the HTTP status, `null`
  without an answer) and `retryAfter` (the seconds the server asks to wait, else `null`). Its `code`
  is the server's problem code ([REST errors](rest.md#errors)), `PROBLEM` for one this version does
  not know, or the CLI's own: `REDIRECT`, `NOT_PIVOTKIT`, `ANSWER_TOO_LARGE`, `ANSWER_CUT`, `TIMEOUT`,
  a network error's code (`ECONNREFUSED`, `ENOTFOUND` ...) or `NETWORK`.
- `pivotkit --version --json`: `{ "pivotkit-cli", "pivotkit-report", "pivotkit-core", environment }`,
  `environment` with `node`, `locale`, `timeZone` (each `{ value, from, known }`: from the environment
  variable or the default, and whether Node's Intl knows it), `now` (`{ value, from }`) and pivotkit-core's
  default `limits`. Use it for a bug report or a CI log.
- `sources`: `kind: "sources"` and `sources` (each `{ id, title, kind, link, schedulable }` and, for
  a source with parameters, `params`, as the server lists them).
- `sources <id>`: `kind: "source"`, `source` and `description` (`rows`, `fields`, `text`,
  `hiddenFields`).
- `render`: `summary` and `output` (`{ file, format, mediaType, bytes }`, or `null` when nothing was
  written). With `--save-view` also `savedView` (`{ file, bytes }`). With `--suggest`, `draft: true`
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

## With a server { #with-a-server }

A [pivotkit-server](rest.md) keeps the data and decides who sees what. `render`, `validate` and
`describe` run on its sources instead of local files, through its REST service. `pivotkit sources`
lists what the token reaches. The view is a local file, JSON text or stdin, as without a server. The
layout flags and `--suggest` work too, and `--map` with `render` and `describe --suggest`.

```bash
export PIVOTKIT_URL=https://reports.example.com/api/v1
export PIVOTKIT_TOKEN=...                 # or --token-file token.txt
# the container's own token (server in 5 minutes): export PIVOTKIT_TOKEN="$(docker exec pivotkit pivotkit-server token show admin)"
pivotkit sources                          # the sources this token reaches
pivotkit sources sales                    # their fields, types and counts
pivotkit sources vms --param customer=acme   # a source with parameters: a value for each it needs
pivotkit validate sales.pivotkit.json --source sales --strict
pivotkit describe --source sales --suggest -o draft.pivotkit.json
pivotkit render sales.pivotkit.json --source sales -o sales.xlsx
```

- **Remote mode** starts with `--url` or `--source` on the command line. `PIVOTKIT_URL` alone is
  only the default address: `render --data` stays local in a shell that has it set. `--source`
  without an address is a usage error.
- **Options that act on local data or files** are a usage error with a server, never silently
  ignored: `--data`, `--data-format`, `--sheet`, `--limit`, `--template`, `--locale`, `--time-zone`,
  `--now`, `--bom`, `--width`, `--height`, `--lenient`, `--link`, `--key`, `--save-view`, `--as` and
  `--items`. `pivotkit help <command>` marks them "local only", and the server's own options "with a
  server". `PIVOTKIT_LOCALE`, `PIVOTKIT_TIME_ZONE` and `PIVOTKIT_NOW` are not used with a server, and
  a note says so. A view file's own `formatting.locale` and `timeZone` still apply. Relative dates
  ("the last 30 days") count from the server's time.
- **Routes**:
    - `validate`: `POST /views/validate`
    - `describe <view>`: `POST /views/describe`
    - `describe --suggest`: `POST /views/suggest`
    - `render`: `POST /views/validate`, then `POST /views/render/file`. `render --suggest` calls
      `POST /views/suggest` first.
    - `sources`: `GET /sources` and `GET /sources/{id}`, and with `--param`, `POST /sources/describe`.
    - `describe` with a server takes a view. For a source's fields, run `pivotkit sources <id>`.
- **Parameters**: a source with parameters needs a value for each required one in every call. Such a
  source is an HTTP source with `{customer}` in its address, or a code source that declares
  `params`. `pivotkit sources` lists such a source with `(needs: customer)`. Give the values with
  `--param customer=acme`, once per parameter. They go with the source as `params`, as typed. The
  server reads a number or `true`/`false` from the text where the parameter is one.
- **Render** needs a token whose [policy profile](rest.md#profiles) has `results: true`, or, on a
  server without sign-in, `results: true` in the server's or the source's policy. Without it, the
  server answers 403 `NOT_ALLOWED` and the CLI says so (exit 2). Validate, describe and
  sources work with any token.
    - The file goes only to `-o` or stdout, never to a name from the answer. An XLSX file is not
      written to a terminal.
    - The CLI writes the file with mode `0600` (only you read it) through a temporary file, once the
      whole answer is in, so a refused, failed or cut download never replaces a file.
    - A view with errors (422 `VIEW_HAS_ERRORS`) gives the server's findings and exit 1. `--json`
      has `summary: null`, since the file route gives none.
    - A token the operator lets render but not validate (`auth.toolScopes`) still gets the file,
      with a warning `notValidated`. The server's errors stop the file, but its warnings are not
      known, so `--strict` writes nothing.
- **Findings and exit codes** are as without a server: errors (and warnings with `--strict`) exit 1.
  The data's own notes (how a file was read, a data mismatch explained against local columns,
  `noRowsKept`) come from the server's findings instead.

### Sign in { #sign-in }

A server with a sign-in provider (`auth.mode: oauth`) takes the provider's access tokens. Sign in
once, then let `pivotkit token` give you a fresh token:

```bash
pivotkit login --url https://reports.example.com/api/v1
PIVOTKIT_TOKEN="$(pivotkit token)" pivotkit sources --url https://reports.example.com/api/v1
pivotkit token | sed 's/^/Authorization: Bearer /' | curl -H @- https://reports.example.com/api/v1/sources
```

The last line hands the token to curl on stdin (`-H @-`). A token in an argument, as in
`curl -H "Authorization: Bearer $(pivotkit token)"`, is in the process list, where other users of the
machine can read it while curl runs.

- `login` reads the server's metadata and its issuer, and starts the device code flow there.
- It names the issuer's host first. It warns when the code page's host is neither the issuer's host
  nor a parent or subdomain of it. The warning is a hint, not a guarantee: check the page yourself.
  Then it prints an address and a code on stderr. Open the address, enter the code and sign in.
- `login` takes the client ID the server publishes (`rest.signIn.clientId`) and says so. Where the
  server publishes none, the operator gives you the client ID. Pass it with `--client-id` or
  `PIVOTKIT_CLIENT_ID`. Either pins the ID: `login` then never takes the published one.
- `login` waits as long as the provider allows, at most 30 minutes. It polls at the provider's
  interval, at most every five minutes, and says so when the provider asks for longer. It asks again
  after a network error, a timeout, a 429 or a 5xx, three times in a row at most.
- The issuer must use https. Plain http is taken only when the server's address is loopback too.
- `token` trades the kept refresh token for an access token at the provider. It prints the access
  token alone on stdout, with `--json` as `accessToken`. It asks the provider on every run.
- `token` exits 3 when the sign-in has ended, for example when the provider revoked it. The message
  says to run `pivotkit login` again. A network error exits 2 ([exit codes](#exit-codes)).
- `token` and `logout` take the server from `--url`, else `PIVOTKIT_URL`, else the only server you
  signed in to.
- `logout` removes the refresh token and the entry. Where the provider offers token revocation
  ([RFC 7009](https://www.rfc-editor.org/rfc/rfc7009)), it revokes the refresh token there first.
  Any 2xx answer counts as revoked.
  Otherwise the session at the provider stays open until it expires.
- A server without a sign-in provider has no metadata. `login` says so. Ask the operator for a token
  instead.

Where the refresh token goes (`--store`):

| System | Keychain | Through |
| --- | --- | --- |
| macOS | the login keychain | `/usr/bin/security` |
| Linux | the secret service (GNOME Keyring, KWallet) | `secret-tool` of libsecret |
| Windows | the Credential Manager | Windows PowerShell |

- The refresh token reaches these tools on stdin, never as an argument.
- A keychain may ask you to unlock it. pivotkit waits two minutes for that.
- `auto` falls back to a file when the keychain cannot keep the token, and says why. Examples:
    - `secret-tool` is not installed (the package `libsecret-tools` on Debian and Ubuntu).
    - A server has no desktop session, so no secret service runs.
    - On Windows, the token is longer than the 2560 bytes the Credential Manager keeps
      ([CREDENTIAL](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)).
    - Any keychain that does not give the token back as written, for example one that cuts a very
      long token. pivotkit reads each token back after it writes it.
- The file is `pivotkit/tokens/` in `$XDG_CONFIG_HOME` (default `~/.config`), or in `%APPDATA%` on
  Windows. It is not encrypted.
    - On Linux and macOS, only you can read it: mode 0600 in a 0700 directory.
    - On Windows, it has the permissions of your profile's folder.
- `pivotkit/logins.json` beside it names the servers, their issuers and client IDs. It holds no
  token.
- When the provider hands out a new refresh token, `token` keeps the new one. When the keychain
  cannot keep it, `token` writes it to the file, says so on stderr and still prints the access token.
  It removes the keychain's old entry, so `logout` leaves nothing behind.
- Two `token` runs at once take turns through a lock file in `pivotkit/locks/`. So neither spends
  the refresh token the other one just replaced.
    - The run that holds the lock renews its time every 5 seconds.
    - A lock not renewed for 3 minutes is a crashed run's. The next run takes it over.
    - A waiting run waits up to 150 seconds, long enough for a keychain unlock dialog. Then it says
      another run holds the lock.

[Sign in from the command line](rest.md#sign-in-cli) has what the operator sets up, and the same
steps with curl or PowerShell.

### The token { #token }

- The CLI reads the token from `--token-file` first, else from `PIVOTKIT_TOKEN`, again for every
  request. It never takes the token from a flag's value, since that would be in the shell's history
  and the process list. It never prints the token, also not in an error.
- The token file is read like every file of the CLI: a regular file, no symbolic link at its end, at
  most 4 KiB. A trailing newline is trimmed. On Linux and macOS, a file the group or others can read
  gives a warning, also with `-q`. `-o` naming the token file is a usage error. A token with
  characters a bearer token cannot carry is refused before any request.
- `PIVOTKIT_TOKEN` is also the variable the server reads its own token from. On a machine that runs
  both, the CLI sends the server's token.
- A token whose profile has `results: true` lets whoever holds it export every field that is not
  hidden. Hide identifier fields at the source, give render tokens a profile of their own, and keep a
  token with `results: true` out of an environment an AI agent controls.

### The connection { #connection }

- `https://` everywhere. `http://` only for a literal loopback address (`localhost`, `127.0.0.1` to
  `127.255.255.255`, `[::1]`), where nothing leaves the machine. A user name, password, query or
  fragment in the address is a usage error.
- On every run, the CLI writes the server's origin and where the token came from on stderr
  (`server: https://reports.example.com (token: PIVOTKIT_TOKEN)`), except with `-q`, so a wrong
  target or token shows.
- Redirects are not followed: "the server redirected (a common cause: http instead of https)". An
  unknown route says "the address should end in /api/v1".
- Every request has a time limit (`--timeout`, default 30 s) and a size limit on the answer: 5 MB of
  JSON, 64 MiB for a rendered file.
- These answers are "not a pivotkit server answer", with their status only: an answer that is
  neither the expected type nor a problem document (a sign-in page of a proxy, say), a rendered file
  that is not sent as an attachment (`Content-Disposition`), or JSON nested deeper than 64 levels.
- Stderr lists at most 200 findings and says how many more. `--json` has all.
- With `NODE_TLS_REJECT_UNAUTHORIZED=0` (no check of the server's certificate), the CLI does not talk
  to an https server at all, with or without a token. There is no `--insecure`. For a certificate of
  your own CA, use `NODE_EXTRA_CA_CERTS`.
- **A proxy**: the CLI uses `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` only as Node does, when Node's
  proxy support is on: `NODE_USE_ENV_PROXY=1` (Node 22.21.0 or later, 24.0.0 or later) or
  `node --use-env-proxy` (Node 22.21.0 or later, 24.5.0 or later). Node marks both "Active
  development" ([Node's CLI documentation](https://nodejs.org/api/cli.html#node_use_env_proxy1),
  [built-in proxy support](https://nodejs.org/api/http.html#built-in-proxy-support)). When a proxy
  variable is set and Node does not use it, a network error says so. A loopback address never goes
  through a proxy.
- Messages hold the problem's code and its cleaned `detail` (control characters out, cut at 200
  characters). They never hold headers, the answer's body, the full address or the text of a
  network error.
  A 401 is one line: "the server needs a token: set PIVOTKIT_TOKEN or give --token-file <file>" when
  none was sent, "the server refused the token from --token-file token.txt: ..." with the server's
  reason when one was. A missing parameter ends with "re-run with --param customer=acme", a refused
  value with "fix it with --param customer=<value>". A render the token may not make says to ask
  the operator for a token whose profile has `results: true`, and that validate, describe and
  sources still work with it. Other hints follow the server's words after a semicolon, never in a
  second parenthesis. For 429 and 503, the hint is "retry in N s" (a `Retry-After` over a day is left
  out).

## The sheet of a workbook

A view made in the report on a workbook's sheet names that sheet in its view file and link
(`source.params.sheet`, [view file](view-file.md)). `render`, `validate` and `describe` of such a view
read that sheet of `--data` when `--sheet` is not given. They say so in an `info` finding `viewSheet`
(in `--json`, and on stderr with `--verbose`). `--sheet` reads another. A view without a sheet reads
the first visible sheet. Data that is no workbook does not use the view's sheet, and an `info`
finding `viewSheet` says so.

A sheet the workbook does not have, named by `--sheet` or by the view, is an error (exit 2, `io`,
`NO_SHEET`) that names the sheets there are:

```text
pivotkit: quarters.xlsx: the workbook has no sheet "Q4" (the view's source.params.sheet; give --sheet to read another); its sheets: "Q1", "Q2", "Q3"
```

`describe` of a workbook lists its sheets after its summary line, the one read marked:
`sheets: "Q1" (read), "Q2", "Q3"`. A hidden one says `(hidden)`, or `(read, hidden)` when it is read.
Names are quoted as JSON text. An empty `--sheet ""` counts as not given.

## What describe shows

For data: the fields with their types and counts (distinct, blank). Values, and the smallest and
largest value, appear only with `--items <n>`. A file's values can be personal or confidential, and a
pipeline log or a language model reading it needs the names and types more often than the values.

For a view: one sentence of what it shows and filters, and its findings. It needs the data, or a view
file with `source.fields`, to check the fields.

## Types from the view file { #types-from-the-view-file }

A CSV says nothing about types. The reader infers them ([what is read](import.md)), so a column of
text such as `1e3`, `12` or `true` is read as a number or a boolean. A view file written by the
report lists the fields it uses with their types (`source.fields`). `render`, `validate` and
`describe` read such a column as that type, and say so in `--json` (an `info` finding
`typeFromView`).

A type that a value of the column does not fit is not applied, so a view file made for other data
never blanks a column. The column stays as read, with the warning `typeFromViewFailed` naming the
value and its row (a finding with `--strict`).

What a CSV cannot carry stays different from the data the view was made on:

- A row without any value is skipped.
- Text is trimmed, and its line breaks are read as spaces.
- Text a spreadsheet would run as a formula carries the leading `'` the report wrote.

The JSON of Source data keeps all of it. The files hold wall-clock dates without a time zone. Give
`--time-zone` and `--now` for a report that is the same on every run.

## Files

- A file is opened once, as a **regular file** only. A FIFO, a directory or a device is refused, and
  a FIFO never makes the CLI wait. Its size is checked against `fileBytes` (100 MiB) **before** it is
  read. A view file has at most 4 MB, a template 1 MB.
- **Workbooks you did not make**: by default, a workbook may unpack to 500 MiB (`unpackedBytes`).
  Whitespace padding costs little: a 54 KB file padded to 50 MiB reads in about 0.4 s with about
  200 MB. Content that is kept costs a few times its size. The shared strings and formats kept count
  against `importCells`, and 11 million of them, under the defaults, took about 1 to 1.3 GB (Node 26,
  Apple M4; approximate). For untrusted files, lower the limits to what your workbooks need and give
  the run a time limit:
  `timeout 60 pivotkit describe upload.xlsx --limit unpackedBytes=104857600` (`timeout` is GNU
  coreutils, `gtimeout` on macOS with Homebrew's coreutils). See
  [Untrusted workbooks](../security.md#untrusted-workbooks).
- **Output** goes to a new temporary file next to the target, then replaces it, so there is no
  half-written file. A link, a directory or another non-regular file at the target is never
  replaced. For stdout, leave out `-o` (`-o /dev/stdout` is a device). The directory is not created.
  A run killed between the two steps leaves the temporary file (`.<name>.<pid>-<random>.tmp`). The
  CLI does not remove it later, so delete it by hand.
- A file that has more bytes when it is read than its size said (it grew, or a `/proc` file that
  says 0) is refused, never cut.
- **`--allow-dir`** is a hard limit. Every file read or written must lie inside one of the
  directories after its real path is resolved (symbolic links, Windows junctions and `..`
  followed). The CLI checks the path, and again the opened file. Without `--allow-dir`, the CLI reads
  and writes with your own rights, as any command-line tool does. `--allow-dir` narrows what a
  mistake or a hostile view file name can reach.
- `--allow-dir` is **not a sandbox**. It does not hold against another process of the same user that
  changes the directories while it runs. A hard link inside an allowed directory to a file outside it
  reads that file, since no path check can tell a hard link apart. Run the CLI as a user that can
  only reach what it should, or in a container, where that matters.
- **Messages** name a file by its base name and never print a file's content. Names and messages
  from a view or the data are cleaned of control characters and cut at 200 characters.
- **`pivotkit example`** writes its files the same way, in the current directory, after checking that
  none of them is there yet. If one is, nothing is written (exit 2, `EXISTS`). `--allow-dir` holds.
- Templates and file paths come only from the person running the command. The [MCP server](mcp.md)
  is built on the same file handling (`pivotkit-cli/files`: `readSafe`, `writeSafe`, `writeNew`,
  `allowedDirs`, `readTable`). It takes a template only from its operator, and a path from a model
  only inside the operator's allowed directories. It refuses hard links there.

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
