# Changelog

All notable changes to `pivotkit-xlsx` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- npm keywords `pivot-grid` and `pivottable`, as the repository's topics.
- npm keyword `pivot-table` ([#172](https://github.com/eizedev/pivotkit/issues/172)).
- A workbook over `limits.archiveEntries` or `limits.unpackedBytes` throws `LIMIT_EXCEEDED` with
  `details` `{ limit, value, max, file }`, as every other limit does, not `INVALID_FILE` with the
  reason `LIMIT` ([#208](https://github.com/eizedev/pivotkit/issues/208)).
- Markup between a sheet's rows that is no row (a comment) and what follows its `</sheetData>`
  (merged cells, conditional formats, print settings) are no longer handed to read-excel-file, which
  reads nothing there; shared strings and styles stream into the archive it gets instead of being
  unpacked whole first.

### Fixed

- A workbook a few dozen kilobytes small whose XML is padded with whitespace (tens of megabytes
  unpacked, under every default limit) took about a minute and a gigabyte of memory and then failed
  with `DAMAGED` ("Maximum call stack size exceeded"): read-excel-file parses a sheet in pieces and
  reads an unfinished text or tag again from its start with every piece. Runs of whitespace in text
  and between attributes are now cut to 128 KiB before it parses a part, and a text, comment, CDATA
  section or processing instruction of more than 1 MiB, or a tag of more than 256 KiB, is refused as
  `DAMAGED` at once (an Excel cell holds at most 32,767 characters). Such a workbook of 50 MiB unpacked is read in about half a
  second with about 200 MB of memory.
- The position of a cell or row (`r`) is read in single quotes, with whitespace around `=` and after
  a line break too, so such a value far out is refused before parsing like any other; a row of many
  unclosed `<c ` tags is scanned in linear time, no longer quadratic; a row inside a comment, CDATA
  section or processing instruction between rows is no longer read as data.

## [0.1.0] - 2026-11-11

First release.

### Added

- The reader plugin for Excel workbooks (.xlsx) of `pivotkit-core/import`, plugin API 1
  ([#44](https://github.com/eizedev/pivotkit/issues/44)): the first visible sheet or the one asked for
  (`sheets()` lists them), dates from the cell formats, a formula's saved value, a cell with an Excel
  error as blank with a note. Before anything is parsed: `.xls`, `.xlsb`, macro and password-protected
  workbooks are refused with what to do; the ZIP directory's parts and unpacked size are checked
  against `limits.archiveEntries` and `limits.unpackedBytes`; a part that unpacks to more than its
  directory states stops the read; `<!DOCTYPE` and `<!ENTITY` in an XML part are refused. Rows without
  a value (a used range of formatted empty cells) are left out while the sheet is unpacked. Built on
  read-excel-file 9.3.14 (MIT), which gets an uncompressed archive of only the parts it needs, so no
  worker is started and a strict Content-Security-Policy works. `dist/` holds a bundle for pages
  without a bundler, with `THIRD_PARTY_LICENSES.txt`.

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-xlsx@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-xlsx@0.1.0
