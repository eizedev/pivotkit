# Changelog

All notable changes to `pivotkit-cli` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `pivotkit example [name]`: writes the data and views of an example into the current directory
  (default `sales`, generated; `weather`, the playground's start, with `weather-SOURCE.txt`, its
  attribution and licence), never over a file there, and says what each file is and what to run
  next; `--list` names them. The files are the playground's data and views as the report downloads
  them; the package ships the data gzipped.
- A view file's field types (`source.fields`) decide how a column of the data is read when the reader
  inferred another one (text such as `1e3` in a CSV stays text): an `info` finding `typeFromView`;
  a type the column's values do not fit is not applied (`typeFromViewFailed`, a warning).
- `pivotkit-cli/files`: the file handling of the command line for pivotkit's other Node front ends
  (`readSafe`, `readStdin`, `writeSafe`, `writeNew`, `allowedDirs`, `readTable`, ...); `readSafe`
  takes `hardLinks: false` to refuse a file with a second name and checks the real path again after
  opening ([#165](https://github.com/eizedev/pivotkit/issues/165), [#209](https://github.com/eizedev/pivotkit/issues/209)).

### Changed

- `validate`, `describe` and `render` run pivotkit-report's operations, which the MCP server shares.
  `--json`: `validate` and `describe` of a view add `uses` (the data's fields the view uses);
  `describe` of a view gives `valid`, `name` and `description` without `errors` and `warnings`
  (they are the `findings`); `describe` of data gives `rows`, `fields` and `text`.

### Fixed

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
