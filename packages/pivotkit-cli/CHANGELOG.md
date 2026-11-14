# Changelog

All notable changes to `pivotkit-cli` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `describe` of a workbook lists its sheets; `--json` gives `sheet` (the sheet read) for every
  command with data and `sheets` for `describe` of a workbook ([#252](https://github.com/eizedev/pivotkit/issues/252)).
- `--verbose`: how the data was read (encoding, separator, sheet) on stderr.
- `pivotkit --version --json`: the versions with an `environment` block (Node, the locale, time zone
  and "now" the environment sets and whether Intl knows them, the default limits), for bug reports
  and CI logs.
- `pivotkit example [name]`: writes the data and views of an example into the current directory
  (default `sales`, generated; `weather`, the playground's start, with `weather-SOURCE.txt`, its
  attribution and licence), never over a file there, and says what each file is and what to run
  next; `--list` names them. The files are the playground's data and views as the report downloads
  them; the package ships the data gzipped.
- A view file's field types (`source.fields`) decide how a column of the data is read when the reader
  inferred another one (text such as `1e3` in a CSV stays text): an `info` finding `typeFromView`;
  a type the column's values do not fit is not applied (`typeFromViewFailed`, a warning).

### Changed

- A view file or link that names a sheet the workbook given with `--data` does not have is an error
  (exit 2, `NO_SHEET`) instead of a run on the first sheet; `--sheet` reads another
  ([#252](https://github.com/eizedev/pivotkit/issues/252)).
- The report's English words follow the report on a page (pivotkit-report's default labels): yes/no
  as "Yes" and "No" instead of "true" and "false", "Distinct count" instead of "Count Unique", and so
  on, in every format; a script that reads them must take the new words. `LINES_SKIPPED` (a warning
  now) and the new `noRowsKept` count as findings with `--strict`.
- A view file's field that the data lacks, with exactly one new field of its type in the data, is
  named as a rename; filters that keep no row give the warning `noRowsKept`; an HTML report written
  to the terminal says how to save it; `--lenient` counts every error and says when the report cannot
  show the data.
- When the data lacks fields the view uses, one error leads (`dataMismatch`): the view's fields, the
  data's, the missing ones with "did you mean", and, for the table's own CSV given as `--data` (a
  "Grand Total" column, "Average of …" in its header), that it is a pivot result and to take Export →
  Source data → All rows as CSV; the errors that follow from it are counted there and listed in
  `--json`. An unknown field lists the data's fields; a value refused on a text field names the value
  and row that made it text; a view that is not JSON says where.
- `render` says on stderr what it wrote (`wrote sales.html: an HTML report, …`), or that it wrote
  despite errors with `--lenient`; "nothing written: the view has errors." no longer offers
  `--lenient` as the remedy. `validate` says what it checked (with the data, or only the view file's
  fields). `-q` keeps them off.
- `-o report.html -f csv` is a usage error (the name and the format disagree), as the help says.
- `--locale de-DE` writes the report's words in German, as the report on a page does.
- Usage errors end with `see "pivotkit help <command>"`; a command's help lists only the common
  options that act in it; `-o` into a missing directory names it and the `mkdir` that makes it; an
  unknown `--limit` gives a hint and the page of the limits instead of all of them; reading from stdin
  on a terminal says so; `LINES_SKIPPED` (title lines skipped) is a warning.

### Fixed

- `render`, `validate` and `describe` read the sheet of a workbook a view file or link names
  (`source.params.sheet`, written by pivotkit-react) when `--sheet` is not given, instead of the first
  sheet; `--sheet` overrides it. A sheet the workbook does not have, from `--sheet` or the view, is an
  `io` error `NO_SHEET` that lists the sheets there are; a host's own `source.params.sheet` is read
  the same way when such a view is rendered on a workbook ([#252](https://github.com/eizedev/pivotkit/issues/252)).
- The help's examples name view files `.pivotkit.json`, as the report downloads them.

## [0.1.0] - 2026-11-13

First release.

### Added

- A workbook over `archiveEntries` or `unpackedBytes` is a `limit` error with the code
  `LIMIT_EXCEEDED` (pivotkit-xlsx [#208](https://github.com/eizedev/pivotkit/issues/208)); the docs
  give the measured time and memory of untrusted workbooks at the default limits and recommend
  `--limit unpackedBytes=...` and a time limit for them.
- `pivotkit render`, `validate`, `describe`, `completion` (bash, zsh, fish, PowerShell) and `help`,
  with exit codes 0, 1 (findings) and 2 (usage, file, limit, template) and `--json`
  ([#165](https://github.com/eizedev/pivotkit/issues/165)).
- Files read once as regular files with their size checked before reading, written through a
  temporary file; `--allow-dir` limits every file to the directories named (real paths); no file
  content in a message.
- Defaults from `PIVOTKIT_LOCALE`, `PIVOTKIT_TIME_ZONE` and `PIVOTKIT_NOW`; every command checks them
  and names the variable a wrong value came from.
- `--bom auto|on|off`: a CSV file of `-o` starts with a byte order mark for Excel, CSV on stdout not.
- The format comes from `-f` or a known extension of `-o`; another extension (`-o report.pdf`) is a
  usage error instead of HTML in a `.pdf`.
- An option that does nothing in the chosen format (`--width` with `csv`) is a warning `ignoredOption`.

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-cli@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-cli@0.1.0
