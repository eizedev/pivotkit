# pivotkit-cli

The [pivotkit](https://pivotkit.eize.dev/) command line, `pivotkit`. It runs a view over a CSV, JSON
or Excel file and writes an HTML report, CSV, JSON, XLSX or the chart as SVG.

## Install

```bash
npm install --global pivotkit-cli    # the command pivotkit
```

To run it once without installing, use `npx pivotkit-cli <command>`. That does not put `pivotkit` on
the `PATH`, so every line starts with `npx pivotkit-cli`.

Node 22 or later. It brings pivotkit-core, pivotkit-report, pivotkit-xlsx and ECharts 6.1.0.

## Example

```bash
pivotkit example            # sales.csv, sales.pivotkit.json and sales-chart.pivotkit.json here
pivotkit render sales.pivotkit.json --data sales.csv -o sales.html --now 2026-11-13
pivotkit validate sales.pivotkit.json --data sales.csv --strict --json
pivotkit describe sales.csv
pivotkit describe sales.csv --suggest -o draft.pivotkit.json      # a draft view from the fields
pivotkit render sales.csv --rows Region --cols Channel --values sum:Revenue -o by-region.html
```

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Done. |
| 1 | Findings: an error in the view, or a warning with `--strict`. |
| 2 | A usage, file, limit or template error. |

## What it does

- Gets a draft view from a file's fields, or renders from layout flags without a view file.
- Validates and describes views in CI, with stable exit codes and `--json`.
- Runs the same commands on a pivotkit-server's sources with `--url` and `--source`.
- Needs no browser, and no network for local files.
- Gives the same output on every run with `--now`.
- Reads and writes files only as regular files. `--allow-dir` limits them to the directories you
  name.

## Where in the docs

| Topic | Page |
| --- | --- |
| Getting started: install, the example files, your own report, CI, PowerShell | [Getting started with the command line](https://pivotkit.eize.dev/getting-started/cli/) |
| Commands, options, exit codes, `--json`, completion, file safety | [pivotkit-cli reference](https://pivotkit.eize.dev/reference/cli/) |
| `--url`, `--source`, `pivotkit sources`: a server's data | [With a server](https://pivotkit.eize.dev/reference/cli/#with-a-server) |
| `--suggest`, layout flags, `--map`, `--save-view` | [A view from the data's fields](https://pivotkit.eize.dev/reference/cli/#a-view-from-the-datas-fields) |
| The print template of `--template` | [Print template](https://pivotkit.eize.dev/reference/print-template/) |
| Your company's design: `pivotkit example templates` | [Your own corporate design](https://pivotkit.eize.dev/reference/corporate-design/) |
| Update it, and what changes between releases | [Upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#update) |
| The library it runs on | [pivotkit-report reference](https://pivotkit.eize.dev/reference/report/) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-cli/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
