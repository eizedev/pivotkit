# Changelog

All notable changes to `pivotkit-cli` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `--filter Field=Item` keeps the rows of one item: `--filter Country=Germany`. Given again for
  the same field, it keeps each item. JSON and `@file.json` work as before (#508).
- With layout flags and local data, an item of a text field that is none of its values is a
  warning `itemUnknown` with the item meant. Number fields and server mode get only
  `noRowsKept` (#508).

### Changed

- `render --help` says the workbook holds the table and the chart is in html or svg. A chart view
  rendered as xlsx warns `chartNotInXlsx` ([#360](https://github.com/eizedev/pivotkit/issues/360)).
- The example views (`pivotkit example`) name the chart's `tooltip` setting, `"auto"`.

- `--filter Revenue>1000`, `Country!=Germany` or `Country<>Germany` is a usage error that gives
  the JSON filter it means. A value in neither form gets an example of each (#508).
- `--values avg:Revenue` asks "did you mean average?", as do `mean`, `cnt`, `total`, `distinct`
  and `stddev` (#508).
- `itemCase` says "did you mean" once: pivotkit-core's message no longer names the item meant (#508).
- pivotkit-core's internal limit helper words a file over its limit. The text stays the same
  ([#509](https://github.com/eizedev/pivotkit/issues/509)).

### Fixed

- `--format csv` in a locale whose own decimal mark is `٫` (`ar-EG`, `ar-SA`, `fa-IR`, `ur-IN`,
  `ps-AF` and others) writes the decimal mark the locale uses with Latin digits, from pivotkit-core:
  `9.6`, not `9٫6`, which parsers misread ([#478](https://github.com/eizedev/pivotkit/issues/478)).

## [0.3.0] - 2026-11-16

### Upgrading from 0.2

What a script that runs `pivotkit` checks; the [upgrade page](https://pivotkit.eize.dev/getting-started/upgrading/#cli-next) has the details.

- Usage errors end with `run "pivotkit <command> --help"` (was `see "pivotkit help <command>"`),
  and unknown options and commands read `unknown option "--bogus"`. Scripts read the exit code or
  `--json`, not the text.
- `--json` errors may have the new `kind` `remote`, with `status` and `retryAfter`.
- `writeNew` (`pivotkit-cli/files`) keeps parentheses in file names
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#report-names)).

### Added

- `pivotkit example templates` writes two print templates for the HTML report, Corporate (a company
  header with a logo slot, your colours as `--pk-*` tokens, a footer with the details, always light)
  and Minimal (title, chart, table and details, light or dark after the system), and says how to
  render them over the `sales` example ([#368](https://github.com/eizedev/pivotkit/issues/368)).
- `render`, `validate` and `describe` run on a pivotkit-server's source with `--url` (or
  `PIVOTKIT_URL`) and `--source`; `pivotkit sources [id]` lists a server's sources or describes one.
  The token comes from `--token-file` or `PIVOTKIT_TOKEN` and is never printed; https only (http for
  loopback), no redirects, a time limit (`--timeout`) and size caps; a rendered file is written with
  mode 0600. Options that act on local files are a usage error with a server, and `pivotkit help`
  marks them "local only" ([#306](https://github.com/eizedev/pivotkit/issues/306)).
- `--json`: a new error `kind`, `remote` (a server's problem, an answer that is none of a
  pivotkit-server's, or a network error), with `status` and `retryAfter`.
- `pivotkit-cli/rest`: what the REST service and its client agree on (`REST_BASE`, `SOURCE_ID`,
  `TOKEN_SYNTAX`, `REST_ERRORS`, `PROBLEM_CODES`, `isLoopback`); `writeSafe` takes `mode`.
- `pivotkit serve` says to use `pivotkit-server serve`.
- `--param name=value` gives a server's source its parameters (render, validate, describe and
  `pivotkit sources <id>`, which then asks `POST /sources/describe`); `pivotkit sources` marks a
  source with required parameters `(needs: customer)`. A 401 is one line that says whether a token
  was sent and from where; "render needs data" and the layout flags' message name `--source` too. A
  missing parameter ends with "re-run with --param customer=acme", a refused value with "fix it with
  --param customer=<value>"; a server's hints follow its words after a semicolon
  ([#424](https://github.com/eizedev/pivotkit/issues/424)).

### Changed

- Usage errors end with `run "pivotkit <command> --help"` (was `see "pivotkit help <command>"`);
  unknown options and commands read `unknown option "--bogus"`, quoted, as in pivotkit-server and
  pivotkit-mcp. An option before the command says where it goes and `--json` names the command, not
  the option. Run as `pivotkit-server cli`, the pointers name that. `--token-file` that is not there
  says `--token-file missing.txt: not found`.
- `writeNew`'s file names keep parentheses: a report pivotkit-server writes into `output.dir` under
  the name "Orders (fake backend)" is `Orders (fake backend).pivotkit-out.xlsx`, not
  `Orders -fake backend.pivotkit-out.xlsx`; `pivotkit render -o` writes the name it is given, as
  before
  ([#448](https://github.com/eizedev/pivotkit/issues/448)).
- Depends on `pivotkit-core` `^0.7.0`, `pivotkit-report` `^0.3.0` and `pivotkit-xlsx` `^0.4.0`.

## [0.2.1] - 2026-11-14

### Upgrading from 0.2.0

What a script that runs `pivotkit` checks; the [upgrade page](https://pivotkit.eize.dev/getting-started/upgrading/#cli-0-6-1) has the details.

- `--sheet` for data that is no workbook is a warning `ignoredOption` (exit 1 with `--strict`).
- `-o` naming the data or the view file, `--save-view` naming the data file, `-o -` and, on Windows,
  a device name as `-o` are usage errors (exit 2).
- `--json`: an error that follows from a grouping the view cannot make has `followsFrom`.

### Added

- `pivotkit-cli/files` exports `TEMP_FILE_NAME`, the pattern of the temporary files `writeSafe`
  writes, so a caller that owns a directory can remove those of a process killed during a write
  ([#209](https://github.com/eizedev/pivotkit/issues/209)).

### Changed

- `describe --data <file>` without an argument describes the data, as the options table says
  (`describe --data - --data-format csv` reads stdin); a view given that way is a usage error that
  says how to describe it ([#301](https://github.com/eizedev/pivotkit/issues/301)).

### Fixed

- `--sheet` for data that is no workbook is a warning `ignoredOption`, as other options without
  effect ([#275](https://github.com/eizedev/pivotkit/issues/275)).
- `render -o` naming the data file or the view file, and `--save-view` naming the data file, are a
  usage error instead of replacing the input, also under another name of the same file (a link to its
  directory, another case of its name); `render -o -` is a usage error instead of a file named
  `-` ([#280](https://github.com/eizedev/pivotkit/issues/280)).
- `describe <view file> --suggest`, and `render <view file>` with layout flags, say that the data is
  needed instead of reading the view as data ([#285](https://github.com/eizedev/pivotkit/issues/285)).
- A hint line with `!` in a value quotes it with single quotes, so an interactive bash does not expand
  it from its history ([#286](https://github.com/eizedev/pivotkit/issues/286)).
- Messages that lead better ([#301](https://github.com/eizedev/pivotkit/issues/301)): a data file given where the view belongs says to give
  it with `--data`; a view that is no file says what the argument is read as; the unknown field that
  follows from a grouping the view cannot make (`--group Region:yearMonth` on a text field) is counted
  on the grouping's error (`followsFrom` in `--json`); `describe --suggest` with a field the data lacks
  is a `dataMismatch` that lists the data's fields, as in `render`.
- On Windows, a device name as the output (`-o NUL`, `CON`, `COM1.csv`) is refused as a device, as
  `/dev/null` is elsewhere; `writeNew` of `pivotkit-cli/files` takes such a name as taken and writes
  `con-2.csv` ([#209](https://github.com/eizedev/pivotkit/issues/209)).

## [0.2.0] - 2026-11-14

### Upgrading from 0.1

What a script that runs `pivotkit` checks; the [upgrade page](https://pivotkit.eize.dev/getting-started/upgrading/#cli-0-6) has the details.

- A view file or link that names a workbook's sheet the data lacks is exit 2 `NO_SHEET`, not a run on
  the first sheet.
- `--strict` also fails on `LINES_SKIPPED` and `noRowsKept`.
- `--json` of `validate`, `describe` and `render` has new members (`uses`, `sheet`; `describe` of a
  view gives `findings` instead of `errors` and `warnings`).
- The report's English words change ("Yes"/"No", "Distinct count"); `--locale de-DE` writes German.
- `-o report.html -f csv` is a usage error.

### Added

- `pivotkit describe <data> --suggest [-o draft.pivotkit.json]`: a draft view from the data's fields
  (a text field with few values on the rows, a date grouped by its span or another text field on the
  columns, the first number that is no identifier summed), named `Draft: ...`, as a view file that
  names the file and the workbook's sheet as the report does, so the report opens it on that file;
  stderr says what each part took and what else it could take. Nothing to group by is the error
  `noSuggestion`, which names a workbook's other sheets ([#253](https://github.com/eizedev/pivotkit/issues/253)).
- `render` without a view file: `--rows`, `--cols`, `--values sum:Field`, `--group Field:unit`,
  `--filter <json | @file>` and `--chart-type`, with the data as the argument or `--data`; `render
  <data> --suggest` renders the draft. `--save-view` writes the view used as a view file. The same
  flags with `describe --suggest` replace a part of the draft ([#253](https://github.com/eizedev/pivotkit/issues/253)).
- `--map Old=New` (render): a view's field renamed for data whose column was renamed, with a view
  file too; the data-mismatch hint for a renamed field names the flag ([#253](https://github.com/eizedev/pivotkit/issues/253)).
- `describe` of a workbook lists its sheets; `--json` gives `sheet` (the sheet read) for every
  command with data and `sheets` for `describe` of a workbook ([#252](https://github.com/eizedev/pivotkit/issues/252)).
- `--verbose`: how the data was read (encoding, separator, sheet) on stderr.
- `pivotkit --version --json`: the versions with an `environment` block (Node, the locale, time zone
  and "now" the environment sets and whether Intl knows them, the default limits), for bug reports
  and CI logs.
- `pivotkit example [name]`: writes the data and views of an example into the current directory
  (default `sales`, generated; `weather`, the live demo's start, with `weather-SOURCE.txt`, its
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
- Depends on `pivotkit-core` `^0.6.0`, `pivotkit-report` `^0.2.0` and `pivotkit-xlsx` `^0.3.0`.

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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-cli@0.3.0...HEAD
[0.3.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-cli@0.2.1...pivotkit-cli@0.3.0
[0.2.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-cli@0.2.0...pivotkit-cli@0.2.1
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-cli@0.1.0...pivotkit-cli@0.2.0
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-cli@0.1.0
