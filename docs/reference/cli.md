---
title: pivotkit-cli
description: The pivotkit command line - render a view over CSV, JSON or Excel data to an HTML report, CSV, JSON, XLSX or SVG, validate and describe views in CI, with stable exit codes, --json, shell completion and safe file handling.
---

# pivotkit-cli

`pivotkit` runs [views](view-file.md) without a browser: it renders a view over a data file, checks
views in a pipeline before they go live, and describes views and data. It needs no network, and with
`--now` its output is the same on every run.

```bash
npm install --global pivotkit-cli     # or: npx pivotkit-cli <command>
pivotkit render sales.pivot.json --data sales.csv -o sales.html --now 2026-11-13
```

Node 22 or later. It brings [pivotkit-report](report.md), pivotkit-core, pivotkit-xlsx and ECharts
6.1.0.

## Commands

| Command | What it does |
| --- | --- |
| `pivotkit render <view> --data <file> [-o <file>]` | Runs the view over the data and writes an HTML report, CSV, JSON, XLSX or SVG. |
| `pivotkit validate <view> [--data <file>]` | Checks the view against the data, or against the fields its view file lists (`source.fields`). |
| `pivotkit describe <view \| data>` | What a view shows and filters, or a data file's fields. |
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
| `--sheet <name>` | | The sheet of a workbook. |
| `-f, --format html\|csv\|json\|xlsx\|svg` | render | Default: the extension of `-o` (`.htm` is `html`); another extension, or none, is a usage error. On stdout `html`. |
| `-o, --output <file>` | render | Write here instead of stdout. A regular file there is replaced whole; a link, a directory or a device is refused. Its directory must exist. |
| `--template <file>` | render | `html`: a [print template](print-template.md). |
| `--title <text>` | render | `html`, `xlsx`: the report's title (default the view file's name). |
| `--chart auto\|on\|off` | render | `html`: the chart above the table (`auto`: when the view shows the chart). |
| `--width`, `--height <px>` | render | `svg`, `html`: the chart's size (800 x 480). |
| `--bom auto\|on\|off` | render | `csv`: a byte order mark first, so Excel reads the file as UTF-8. `auto`: in a file of `-o`, not on stdout, where a program would read it as part of the first header. |
| `--lenient` | render | Write the output also when the view has errors, as the report shows it; still exit 1. |
| `--strict` | render, validate | Warnings are findings too. |
| `--as view\|data` | describe | Read the input as a view or as data (default: a view when it is one). |
| `--items <n>` | describe | Data: list up to n values of each field (default none). |
| `--json` | all | One JSON object on stdout (render: needs `-o`). |
| `-q, --quiet` | all | No warnings on stderr; errors still. |
| `--locale <tag>` | render (checked by all) | Default `en-US`; environment `PIVOTKIT_LOCALE`. The locale also picks the CSV separator (`;` where the decimal mark is a comma). |
| `--time-zone <zone>` | all | The data's dates; default `UTC`; environment `PIVOTKIT_TIME_ZONE`. |
| `--now <date>` | render (checked by all) | "Today" of relative filters and the generated time; environment `PIVOTKIT_NOW`. |
| `--limit key=n` | all | One of pivotkit-core's [limits](../concepts/limits.md) (`--limit rows=200000`); repeatable. |
| `--allow-dir <dir>` | all | Read and write only inside this directory; repeatable. |

An option on the command line wins over its environment variable. Every command checks `--locale`,
`--time-zone` and `--now` (from the command line or the environment, and the message names the
variable), so a wrong value in a pipeline's environment fails in every step, not only in `render`. An
option given for a format it does nothing in (`--width` with `csv`) is a warning `ignoredOption`. The
CLI writes no colours.

## Exit codes

| Code | Means |
| --- | --- |
| 0 | Done. Warnings (and with `render`, the reader's notes) may be on stderr. |
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
  read), `code` ([the view's issue codes](core.md), the reader's note codes, `viewFile`), `path`,
  `message` and, where there is one, `suggestion`.
- `error` (exit 2): `{ kind, code, message }`, `kind` one of `usage`, `io`, `limit`, `template`,
  `internal` (more may come).
- `render`: `summary` and `output` (`{ file, format, mediaType, bytes }`, or `null` when nothing was
  written). `validate`: `valid`. `describe`: `kind` (`view` or `data`) and `description`
  (pivotkit-core's [`describeView` or `describeSource`](core.md)).

## What describe shows

For data: the fields with their types and counts (distinct, blank). Values, and the smallest and
largest value, only with `--items <n>`: a file's values can be personal or confidential, and a
pipeline log or a language model reading it needs the names and types more often than the values.
For a view: one sentence of what it shows and filters, and its findings; it needs the data (or a view
file with `source.fields`) to check the fields.

## Files

- A file is opened once, as a **regular file** only (a FIFO, a directory or a device is refused, and
  a FIFO never makes the CLI wait), and its size is checked against `fileBytes` (100 MiB) **before**
  it is read; a view file has at most 4 MB, a template 1 MB.
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
- Templates and file paths come only from the person running the command; a server built on the
  same code (MCP, REST) never takes them from a caller.

## Completion

```bash
eval "$(pivotkit completion bash)"                 # ~/.bashrc
eval "$(pivotkit completion zsh)"                  # ~/.zshrc
pivotkit completion fish | source                  # ~/.config/fish/config.fish
pivotkit completion powershell | Out-String | Invoke-Expression   # $PROFILE
```

The scripts, like the help, are made from the CLI's one table of commands and options.

## In CI

```bash
mkdir -p out
pivotkit validate views/sales.pivot.json --data fixtures/sales.csv --strict
pivotkit render views/sales.pivot.json --data fixtures/sales.csv -o out/sales.html --now 2026-01-01 --json > out/report.json
```
