---
title: Security
description: How pivotkit treats views and loaded files as untrusted input, keeps memory use bounded, renders no markup from data, writes safe exports, and runs under a strict Content-Security-Policy.
---

# Security

Reports are built by the people who use them, and views travel: they are saved on servers, shared as
templates and passed in URLs. pivotkit is built for that. To report a vulnerability, use the private
channel described in the repository's
[security policy](https://github.com/eizedev/pivotkit/blob/main/SECURITY.md).

## Views are untrusted input

- A view holds **names only**, and in its filters the values chosen there (plain values of the data,
  which a shared view gives away: see [Privacy](reference/view-file.md#privacy)). Field names are resolved against the data's columns; aggregators,
  formats, filter operators, "show as" calculations and chart types against fixed lists; colours
  against `#rgb` and `#rrggbb`. A name is never evaluated as code and never used as an object key
  without an own-property check.
- A view from a link, a pasted text, a file or the tab's storage is the same input: it goes through
  `normalize()` against the data, and what was left out is said in plain words. A link is capped at
  32,000 characters and its view at 1,000,000 characters, enforced while it is inflated (1 KiB of
  input at a time), so a small crafted link can neither make a large allocation nor keep the page busy ([Sharing](concepts/sharing.md)).
- The tips' list in `localStorage` (dismissed tips, the help switches) is
  read as JSON and kept only where an entry is one of the known ids; anything else, or text that is
  no JSON, reads as an empty list.
- Templates are views too. Every name in the Views menu, the host's `templates` included, is plain
  text (control, bidi and zero-width characters removed, at most 120 characters). A list read with
  `parseTemplates` (from a server, the browser store or an OpenAPI document's `x-pivotkit-views`) has
  its text (5,000,000 characters) and its entries (500) capped before it is read, own properties
  only; the browser store's text is not parsed at all above 500,000 characters. Every view is
  normalized when it is loaded, and a published view leaves the report normalized.
  `templatesFromSchema` follows local references only and fetches nothing. The report only shows
  what the host allows (`canPublish`, `deletable`): the host's server must check who may save,
  publish or delete, and validate every view it receives ([Templates and shared views](concepts/templates.md)).
- `chartOptions` is the host's, but often JSON from a server: only plain JSON values pass, prototype
  keys and functions are dropped, depth and size are capped, and the ECharts options that are markup
  or addresses (a string `formatter`, `rich`, `link`, `image` and the tooltip's element) are dropped
  too, so nothing in it is markup, an address or run
  ([Charts](concepts/charts.md#chartoptions-for-developers)).
- A bad view does not throw: what cannot be used is dropped and reported (see
  [Views and saved views](concepts/views.md#a-view-is-user-input)).
- A filter's values are checked like its names: a `compare` value is a number or a calendar day
  (as `"2022-03-01"` or wall-clock milliseconds, within what a `Date` holds), a `relative` count is
  capped at 500. Today for a relative range is `options.now` of `computePivot` or the current time,
  read in the data's time zone, so a saved relative view gives different results on different days
  by design ([Filters](concepts/filters.md#relative-date-ranges)).
- A view cannot ask for unbounded work. Its size and its parts are capped (8 fields per axis, 16
  values), the work of a pivot is computed before it starts, and the groups, aggregated cells and
  every dense structure (rows x columns of a table, data points of a chart) are counted against
  [limits](concepts/limits.md#limits) before or while they are allocated; over a limit,
  `PivotkitError` with `LIMIT_EXCEEDED` is thrown and the UI shows a message that says which limit
  and what to change.

## Data is text, never markup

Field names, values and labels are rendered as text by React (or `textContent` in your own renderer).
A value like `<img src=x onerror=alert(1)>` shows as those characters; a browser test checks it with a
data set of labels that look like HTML.

Field labels and descriptions (`fieldDefaults`) are plain text too, capped in length; a "Learn more"
link is shown only for an absolute `https:` URL and opens with `rel="noopener noreferrer"`.
`fieldDefaultsFromSchema` treats a JSON Schema or OpenAPI document as data: it follows references
inside the document only, fetches nothing, runs nothing, and caps the fields, texts, enum entries,
reference depth and the number of schema objects it reads.

## Exports

- **CSV**: text that a spreadsheet would run as a formula gets a leading `'`: text starting with a tab
  or a carriage return, text whose first visible character (after spaces, line breaks and control
  characters) is `=` or `@`, and text starting with `+` or `-` unless it is a number as a locale writes it (`-5%`, `-1.234,5`, `-1’234.5`, `-5,3 %`, `-€1.50`) or a
  number range such as the bin label `-10 – 0`.
- **Copies** (Copy table, the drill-down's Copy): the same guard on every cell, since a spreadsheet
  runs a pasted formula too. Copy as JSON writes values, never markup or code.
- **XLSX**: text is written as inline strings, never as formulas. The XML is written by pivotkit-core
  itself; no spreadsheet library is involved. Excel's sheet limits are checked before writing.
- Downloads use a blob URL on an `<a download>`; nothing is sent anywhere. File names are made safe:
  path separators and characters a file system refuses are replaced. With `onExport` (or the
  cancelable `pivot-export` event) your page gets every file and every copy first and can keep it
  instead.

## Loaded files are untrusted input

A file a person loads ([Loading files](reference/import.md)) is read in the browser; nothing is
uploaded, and a hostile file affects only that person's tab. Its readers treat it as hostile:

- **Limits before the expensive step**: the file's size before a byte is read; rows, columns and
  values while they are read; for a workbook, the number of ZIP parts and the size they unpack to,
  from the ZIP's directory, before anything is unpacked. Each part is unpacked into a buffer of the
  size the directory states and stops when it would grow beyond it, so a ZIP bomb or a forged
  directory cannot take more memory than the limits allow. A sheet's values are checked against
  `rows`, `columns` and `importCells` by the row and column they stand in, while the sheet streams
  in and before it is parsed: a file of a few hundred bytes with a value in row 300,000 and column
  XFD would otherwise become a dense array of billions of cells in the parser. Leaving out rows
  without a value (a used range of formatted empty cells) saves time and memory; the limits do not
  depend on it.
- **Nothing in a file runs**: no formula is evaluated (a workbook's saved values are read), a workbook
  with macros (`.xlsm`, `vbaProject.bin`) is refused, and an XML part that declares a document type or
  entities (`<!DOCTYPE`, `<!ENTITY`) is refused before it is parsed, which rules out entity expansion
  ("billion laughs") and external entities. Nothing is fetched.
- **Names and values are text**: control characters, invisible format characters and the
  characters that turn text around (U+202E) are removed from column names and values, which are then
  shown as text as any data. The `params` of a table's notes and the messages of errors quote the file
  too (a sheet name, a JSON key): cleaned the same way and cut to 256 characters, they are still the
  file's text, to be shown as text (`textContent`), never as HTML.
  Text that a spreadsheet would run as a formula stays as it is in the table, and the
  [exports](#exports) guard it.
- **Clear refusals**: a file that is something else (an `.xls`, a password-protected workbook, a
  workbook named `.csv`) is refused with what it is and what to do.
- **Plugins** run with the rights of the page: use [plugins](reference/plugins.md) whose source you
  can read, pinned to an exact version.

## Content-Security-Policy

The web component was measured in the browser tests (`tests/browser/element.spec.js`) in Chromium,
Firefox and WebKit of the Playwright version pinned in `package.json`, with this policy in a `<meta>` element:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'
```

- The report renders and is styled: its constructed stylesheet is not blocked by `style-src 'self'`,
  and the inline styles React sets through the CSSOM are not blocked either.
- The chart works: ECharts loads from its chunk and draws on a canvas; nothing needs `'unsafe-eval'`.
  Its tooltip shows on hover without a violation: pivotkit-react builds it as DOM nodes with styles
  set through the CSSOM and the data's texts as `textContent`, instead of ECharts' default HTML string
  with inline `style` attributes (which `style-src-attr` would refuse).
- The XLSX and PNG exports download (a blob URL on an `<a download>`; no `fetch` of `data:`); CSV
  takes the same path as XLSX.
- No violation is reported (`securitypolicyviolation`) and nothing is logged; the test checks that the
  policy is in force by adding an inline `<style>`, which is refused.
- The `<style>` fallback is tested on its own page (constructable stylesheets removed), without CSP.

Not covered: browsers without constructable stylesheets fall back to a `<style>` element, which needs
`style-src 'unsafe-inline'` (the element has no nonce option); only the `<meta>` form of the policy was
measured, not an HTTP header; `script-src` must allow the origin that serves `dist/` and its chunks;
a page script that sets the element's properties must be a file or carry a nonce.

pivotkit-react has no measured policy of its own: what it needs depends on how your app is built and
served.

The readers of `pivotkit-core/import` and pivotkit-xlsx start no worker and evaluate no code, so the
policy above is enough for them (measured for pivotkit-xlsx in Chromium, Firefox and WebKit,
`tests/browser/xlsx.spec.js`); a host that runs them in a module worker of its own needs
`worker-src 'self'`.

## Loading from another origin

Module scripts from another origin (a CDN) are fetched with CORS: the server must send
`Access-Control-Allow-Origin` for `index.js` and every chunk. Subresource Integrity covers only the
`<script integrity>` of the entry; the chunks it imports later cannot carry a hash, so pin a version in
the URL, or host `dist/` yourself.

## This documentation site

The theme's script in the header of this site asks api.github.com for the repository's stars, forks and
latest release, from the reader's browser. pivotkit itself, in your app, sends nothing to a third party:
it loads only its own chunks from where you host it.

## Dependencies

- pivotkit-core has one runtime dependency: [fflate](https://github.com/101arrowz/fflate) for the XLSX
  zip.
- pivotkit-xlsx depends on pivotkit-core, fflate and [read-excel-file](https://www.npmjs.com/package/read-excel-file)
  (MIT), which brings saxen, worker-f and unzipper-esm (for its Node entry, not used by pivotkit-xlsx);
  its `dist/` bundles read-excel-file and fflate, with their licenses in `dist/THIRD_PARTY_LICENSES.txt`.
- pivotkit-react depends on pivotkit-core and @dnd-kit; React, ReactDOM and ECharts come from your app,
  so their security updates stay with you.
- pivotkit-element bundles everything it needs and has no runtime dependency; the licenses of the
  bundled packages are in its `dist/THIRD_PARTY_LICENSES.txt`.
- Every third-party package is pinned to an exact version in the repository, and CI installs without
  install scripts.
