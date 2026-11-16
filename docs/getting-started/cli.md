---
title: Getting started with the command line
description: Install pivotkit-cli, write the example files with pivotkit example, get a draft view from your own CSV or Excel file, render a view over data to an HTML report, CSV or Excel, render your own report from the files the report downloads, and check views in CI - with npx, a global install, PowerShell and GitHub Actions.
---

# Getting started with the command line

`pivotkit` renders a [view](../concepts/views.md) over a data file without a browser. It writes one
of these:

- an HTML report to print or save as PDF
- CSV or JSON
- an Excel workbook
- the chart as SVG

It also checks views in a pipeline before they go live. It needs Node 22 or later. For local files it
needs no network. With `--url` it runs on a [pivotkit-server](#server)'s data instead.

You get there in five steps:

1. Install it.
2. Try it on the example files.
3. Get a view from your own file.
4. Render a report from the files the report downloads.
5. Put it into CI.

## 1. Install { #install }

=== "Global (the `pivotkit` command)"

    ```bash
    npm install --global pivotkit-cli
    pivotkit --version
    ```

=== "In a project"

    ```bash
    npm install --save-dev pivotkit-cli
    npx pivotkit --version          # the project's own copy
    ```

=== "Without installing"

    ```bash
    npx pivotkit-cli --version      # every command: npx pivotkit-cli <command> ...
    ```

The package is named `pivotkit-cli`, and its command is `pivotkit`. Without an install,
`npx pivotkit-cli` runs the command once. It does not put `pivotkit` on your `PATH`, so each line
starts with `npx pivotkit-cli`. `npx pivotkit` alone asks npm for another package. The rest of this
page writes `pivotkit`.

To update it later, see [Update an installation](upgrading.md#update).

## 2. Try it on the example files { #try-it }

```bash
mkdir pivotkit-try && cd pivotkit-try
pivotkit example
```

```text
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

Run what it prints, and open `sales.html` in a browser. Two more commands give a chart and a
workbook: the chart from the second view file, the workbook from the same view.

```bash
pivotkit render sales.pivotkit.json --data sales.csv -o sales.html
pivotkit render sales-chart.pivotkit.json --data sales.csv -o trend.html      # with the chart
pivotkit render sales.pivotkit.json --data sales.csv -o sales.xlsx            # the same as Excel
```

More examples:

- `pivotkit example weather` writes the live demo's start: the daily weather of 14 cities, with its
  licence in `weather-SOURCE.txt`.
- `pivotkit example templates` writes two print templates for the HTML report. See
  [your own corporate design](../reference/corporate-design.md).
- `pivotkit example --list` names the examples.

`pivotkit example` never writes over a file. In a directory that has one of its files, it writes
nothing.

Without the command, the same files are on this site:

```bash
curl -fsSLO https://pivotkit.eize.dev/assets/examples/sales.csv
curl -fsSLO https://pivotkit.eize.dev/assets/examples/sales.pivotkit.json
```

See [all example files](../reference/cli.md#try-it).

## 3. A view from your own file { #from-your-file }

Point it at a CSV, JSON or Excel file, and it suggests a first view:

- text fields with few values as rows and columns
- a date grouped by its span
- the first number summed

```bash
pivotkit describe sales.csv --suggest -o draft.pivotkit.json
```

```text
draft: rows Region; columns Month by month; values Sum of Units
  other text fields: Country, Product, Category, Channel
  other numbers: Revenue, Discount
  to change a part: pivotkit describe sales.csv --suggest --values sum:Revenue (or --rows, --cols, --group <field>:<unit>)
wrote draft.pivotkit.json: a draft view of sales.csv
next: pivotkit render draft.pivotkit.json --data sales.csv -o draft.html
```

The draft reads types and counts, not meaning. Check what it picked, and change a part with a flag:

```bash
pivotkit describe sales.csv --suggest --values sum:Revenue -o draft.pivotkit.json
pivotkit render draft.pivotkit.json --data sales.csv -o draft.html
```

Or say the whole layout yourself and render without a view file. `--save-view` keeps the view:

```bash
pivotkit render sales.csv --rows Region --cols Month --group Month:yearQuarter --values sum:Revenue -o by-quarter.html --save-view by-quarter.pivotkit.json
```

`pivotkit render sales.csv --suggest -o draft.html` does both in one step.

For a workbook, `--sheet` picks the sheet. Without it, the CLI takes the first visible sheet.
`pivotkit describe book.xlsx` lists the sheets. The view file names the sheet. In the report,
**Views**, **Open view file** opens the view file on the same file and sheet, so you can go on there.

Field names with spaces and the units of `--group`, `--filter` and `--map` are in
[a view from the data's fields](../reference/cli.md#a-view-from-the-datas-fields).

## 4. Render a report from the browser's files { #your-own-report }

A view applies to the data it was made on: the rows, with the fields under their own names. From a
report in the browser, such as the [live demo](../demo.md):

1. **Views**, **Download view (.pivotkit.json)**: the view file.
2. **Export**, **Source data**, **All rows as CSV (.csv)**: the rows. The application decides whether
   it offers this group: see [exportData](../reference/react.md#prop-exportdata). If you loaded the
   file yourself, you have it already.
3. Render them. The names below are the playground's. The view file is named after the view's name.
   The data file is named after the application's file name with `-data`.

    ```bash
    pivotkit render revenue-by-region-and-category.pivotkit.json --data pivotkit-sales-data.csv -o report.html
    ```

The table's own CSV (**Export**, **Table as CSV**) is the result of the view, not its data. If you
give it as `--data`, the CLI says so and names what to take instead. See
[when the data does not fit](../reference/cli.md#data-mismatch).

A view made on a sheet of an Excel workbook you loaded names that sheet. Give the workbook as
`--data`, and the CLI reads that sheet. `--sheet` reads another one, and `pivotkit describe book.xlsx`
lists the sheets. See [the sheet of a workbook](../reference/cli.md#the-sheet-of-a-workbook).

A view written by hand works too, as a file or as JSON text:

```bash
pivotkit render '{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]}' --data sales.csv -f csv
```

## 5. Check views in CI { #ci }

`validate` exits 1 when a view has an error. With `--strict`, it also exits 1 on a warning. A
pipeline then stops before it publishes a broken view. With the example files committed to
`reports/`:

```yaml
# .github/workflows/reports.yml
name: Reports
on: [push, pull_request]
jobs:
  reports:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install --global pivotkit-cli
      - run: pivotkit validate reports/sales.pivotkit.json --data reports/sales.csv --strict
      - run: mkdir -p out && pivotkit render reports/sales.pivotkit.json --data reports/sales.csv -o out/sales.html --now 2026-11-13
```

`--now` fixes "today" for relative date filters and the generated time, so the report is the same on
every run. Where the output must not change with a release, pin the version:
`npm install --global pivotkit-cli@<version>`.

## A server's data { #server }

When the data lives on a [pivotkit-server](../reference/rest.md) and may not be copied, the same
commands run there:

- `--url` names the server.
- `--source` names its source.
- The token comes from `PIVOTKIT_TOKEN` or `--token-file`.

```bash
export PIVOTKIT_URL=https://reports.example.com/api/v1
pivotkit sources --token-file token.txt                                   # what the token reaches
pivotkit validate sales.pivotkit.json --source sales --token-file token.txt --strict
pivotkit render sales.pivotkit.json --source sales --token-file token.txt -o sales.xlsx
```

`render` needs a token whose profile may download files (`results: true`). The commands validate,
describe and sources work with any token. Options that act on local files, such as `--data` or `--locale`, are an
error there. Everything else is in [With a server](../reference/cli.md#with-a-server).

## PowerShell { #powershell }

`--json` writes one object on stdout, for a script:

```powershell
$result = pivotkit validate sales.pivotkit.json --data sales.csv --json | ConvertFrom-Json
if (-not $result.ok) {
    $result.findings | Where-Object severity -eq 'error' | Format-Table code, path, message
    exit $result.exitCode
}
$written = pivotkit render sales.pivotkit.json --data sales.csv -o sales.xlsx --json | ConvertFrom-Json
$written.output.file      # sales.xlsx; .output.bytes its size
```

Shell completion: `pivotkit completion powershell | Out-String | Invoke-Expression`. For bash, zsh
and fish, see [the reference](../reference/cli.md#completion).

## Next

- Every command, option, exit code and message: [pivotkit-cli reference](../reference/cli.md).
- A column renamed since the view was made: [`--map Old=New`](../reference/cli.md#map).
- A server's sources instead of files: [With a server](../reference/cli.md#with-a-server).
- The same from your own code, in Node or the browser: [getting started with reports](report.md).
- A print template with your logo and layout: [print template](../reference/print-template.md).
