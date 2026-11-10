# Changelog

All notable changes to `pivotkit-xlsx` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
