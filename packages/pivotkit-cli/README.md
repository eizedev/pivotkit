# pivotkit-cli

The [pivotkit](https://pivotkit.eize.dev/) command line, `pivotkit`: run a view over a CSV, JSON or
Excel file and write an HTML report, CSV, JSON, XLSX or the chart as SVG; validate and describe views
in CI with stable exit codes and `--json`. No network, no browser; with `--now` the output is the same
on every run. Files are read and written only as regular files, and `--allow-dir` limits them to the
directories you name.

## Install

```bash
npm install --global pivotkit-cli    # or: npx pivotkit-cli render ...
```

Node 22 or later. It brings pivotkit-core, pivotkit-report, pivotkit-xlsx and ECharts 6.1.0.

## Example

```bash
pivotkit example            # sales.csv, sales.pivotkit.json and sales-chart.pivotkit.json here
pivotkit render sales.pivotkit.json --data sales.csv -o sales.html --now 2026-11-13
pivotkit validate sales.pivotkit.json --data sales.csv --strict --json
pivotkit describe sales.csv
```

Exit codes: 0 done, 1 findings (an error in the view, or a warning with `--strict`), 2 a usage, file,
limit or template error.

## Where in the docs

| Topic | Page |
| --- | --- |
| Commands, options, exit codes, `--json`, completion, file safety | [pivotkit-cli reference](https://pivotkit.eize.dev/reference/cli/) |
| The print template of `--template` | [Print template](https://pivotkit.eize.dev/reference/print-template/) |
| The library it runs on | [pivotkit-report reference](https://pivotkit.eize.dev/reference/report/) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-cli/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
