# pivotkit-xlsx

The reader plugin for Excel workbooks. A workbook is hostile input.
The root [AGENTS.md](../../AGENTS.md) and pivotkit-core's reader rules apply too.

## Commands

```bash
npm test -w pivotkit-xlsx       # node --test on generated workbooks
npm run build -w pivotkit-xlsx  # dist/ for pages without a bundler
npm run size -w pivotkit-xlsx   # gzip size; fails above SIZE_BUDGET_KIB
npm run bench -w pivotkit-xlsx  # a 94,000-row workbook (-- --browser for Chromium)
```

Run `size` and `bench` after a change of the reader.

## Rules

- `src/index.js` is the descriptor. It imports nothing.
- Check before parsing. `zip.js` checks the ZIP directory against `archiveEntries` and `unpackedBytes`.
- Unpack parts as a stream, never beyond their stated size.
- `xml.js` refuses `<!DOCTYPE` and `<!ENTITY`.
- Every part read-excel-file gets passes `createXmlGuard`.
- The guard cuts whitespace runs and refuses over-long tags and tokens.
- Reason: read-excel-file re-reads an unfinished token with every piece. That is quadratic.
- Shared strings and formats count against `importCells`.
- read-excel-file runs on an uncompressed ZIP of only the needed parts (`createStoredZip`).
- So it starts no worker. A strict CSP blocks fflate's `blob:` workers.
- The table is built with pivotkit-core's `createTable`.

## Dependencies

- pivotkit-core takes a caret range. fflate and read-excel-file are exact.
- `dist/` bundles them with their licences in `dist/THIRD_PARTY_LICENSES.txt`.

## Tests

- `test/make-xlsx.js` generates every workbook the tests read. None is committed.
- `SHEET_BOOKS` there are the multi-sheet workbooks the CLI and browser tests share.
- `test/bench.js` measures the 94,000-row workbook.
