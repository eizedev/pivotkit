# Changelog

All notable changes to `pivotkit-cli` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `render`, `validate` and `describe` read the sheet of a workbook a view file or link names
  (`source.params.sheet`, written by pivotkit-react) when `--sheet` is not given, instead of the first
  sheet; `--sheet` overrides it. A sheet the workbook does not have, from `--sheet` or the view, is an
  `io` error `NO_SHEET` that lists the sheets there are ([#252](https://github.com/eizedev/pivotkit/issues/252)).

### Added

- `describe` of a workbook lists its sheets; `--json` gives `sheet` (the sheet read) for every
  command with data and `sheets` for `describe` of a workbook ([#252](https://github.com/eizedev/pivotkit/issues/252)).

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
