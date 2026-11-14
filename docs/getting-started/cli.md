---
title: Getting started with the command line
description: Install pivotkit-cli, write the example files with pivotkit example, render a view over data to an HTML report, CSV or Excel, render your own report from the files the report downloads, and check views in CI - with npx, a global install, PowerShell and GitHub Actions.
---

# Getting started with the command line

`pivotkit` renders a [view](../concepts/views.md) over a data file without a browser: an HTML report
to print or save as PDF, CSV, JSON, an Excel workbook or the chart as SVG. It also checks views in a
pipeline before they go live. It needs Node 22 or later and no network.

You get there in four steps: install it, try it on the example files, render your own report from the
files the report downloads, then put it into CI.

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

The package is named `pivotkit-cli`, its command `pivotkit`. Without an install, `npx pivotkit-cli`
runs the command once; it does not put `pivotkit` on your `PATH`, so each line starts with
`npx pivotkit-cli` (`npx pivotkit` alone asks npm for another package). The rest of this page writes
`pivotkit`.

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
Other examples: pivotkit example weather
```

Run what it prints, and open `sales.html` in a browser; the same view also gives a chart and a
workbook:

```bash
pivotkit render sales.pivotkit.json --data sales.csv -o sales.html
pivotkit render sales-chart.pivotkit.json --data sales.csv -o trend.html      # with the chart
pivotkit render sales.pivotkit.json --data sales.csv -o sales.xlsx            # the same as Excel
```

`pivotkit example weather` writes the playground's start (daily weather of 14 cities, with its
licence in `weather-SOURCE.txt`); `pivotkit example --list` names the examples. It never writes over a
file: in a directory that has one of its files it writes nothing.

Without the command, the same files are on this site:

```bash
curl -fsSLO https://pivotkit.eize.dev/assets/examples/sales.csv
curl -fsSLO https://pivotkit.eize.dev/assets/examples/sales.pivotkit.json
```

([all example files](../reference/cli.md#try-it))

## 3. Render your own report { #your-own-report }

A view applies to the data it was made on: the rows, with the fields under their own names. From a
report in the browser (the [live demo](../demo.md) does it):

1. **Views**, **Download view (.pivotkit.json)**: the view file.
2. **Export**, **Source data**, **All rows as CSV (.csv)**: the rows. The application decides whether
   it offers this group ([exportData](../reference/react.md#prop-exportdata)); a file you loaded
   yourself you have already.
3. Render them (the names are the playground's: the view is named after its name, the data after
   the application's file name with `-data`):

    ```bash
    pivotkit render revenue-by-region-and-category.pivotkit.json --data pivotkit-sales-data.csv -o report.html
    ```

The table's own CSV (**Export**, **Table as CSV**) is the result of the view, not its data: given as
`--data`, the CLI says so and names what to take instead
([when the data does not fit](../reference/cli.md#data-mismatch)).

A view written by hand works too, as a file or as JSON text:

```bash
pivotkit render '{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]}' --data sales.csv -f csv
```

## 4. Check views in CI { #ci }

`validate` exits 1 when a view has an error (with `--strict` also a warning), so a pipeline stops
before a broken view is published. With the example files committed to `reports/`:

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
every run. Pin the version (`npm install --global pivotkit-cli@<version>`) where the output must not
change with a release.

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

Shell completion: `pivotkit completion powershell | Out-String | Invoke-Expression` (bash, zsh and fish
in [the reference](../reference/cli.md#completion)).

## Next

- Every command, option, exit code and message: [pivotkit-cli reference](../reference/cli.md).
- The same from your own code, in Node or the browser: [getting started with reports](report.md).
- A print template with your logo and layout: [print template](../reference/print-template.md).
