---
title: Security
description: How pivotkit treats views as untrusted input, keeps memory use bounded, renders no markup from data, writes safe exports, and runs under a strict Content-Security-Policy.
---

# Security

Reports are built by the people who use them, and views travel: they are saved on servers, shared as
templates and passed in URLs. pivotkit is built for that. To report a vulnerability, use the private
channel described in the repository's
[security policy](https://github.com/eizedev/pivotkit/blob/main/SECURITY.md).

## Views are untrusted input

- A view holds **names only**. Field names are resolved against the data's columns; aggregators,
  formats, filter operators, "show as" calculations and chart types against fixed lists; colours
  against `#rgb` and `#rrggbb`. A name is never evaluated as code and never used as an object key
  without an own-property check.
- A bad view does not throw: what cannot be used is dropped and reported (see
  [Views and templates](concepts/views.md#a-view-is-user-input)).
- A view cannot ask for unbounded work. Its size and its parts are capped, and every dense structure
  (rows x columns of a table, data points of a chart) is counted against [limits](concepts/limits.md#limits)
  **before** it is allocated; over a limit, `PivotkitError` with `LIMIT_EXCEEDED` is thrown and the UI
  shows a message instead of the table.

## Data is text, never markup

Field names, values and labels are rendered as text by React (or `textContent` in your own renderer).
A value like `<img src=x onerror=alert(1)>` shows as those characters; a browser test checks it with a
data set of labels that look like HTML.

## Exports

- **CSV**: text that a spreadsheet would run as a formula gets a leading `'`: text starting with a tab
  or a carriage return, text whose first visible character (after spaces, line breaks and control
  characters) is `=` or `@`, and text starting with `+` or `-` unless it is a plain number (`-5%`) or a
  number range such as the bin label `-10 – 0`.
- **XLSX**: text is written as inline strings, never as formulas. The XML is written by pivotkit-core
  itself; no spreadsheet library is involved. Excel's sheet limits are checked before writing.
- Downloads use a blob URL on an `<a download>`; nothing is sent anywhere. File names are made safe:
  path separators and characters a file system refuses are replaced. With `onExport` (or the
  cancelable `pivot-export` event) your page gets every file first and can keep it instead.

## Content-Security-Policy

The web component was measured in Chromium, Firefox and WebKit with this policy in a `<meta>` element:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'
```

- The report renders and is styled: its constructed stylesheet is not blocked by `style-src 'self'`,
  and the inline styles React sets through the CSSOM are not blocked either.
- The chart works: ECharts loads from its chunk and draws on a canvas; nothing needs `'unsafe-eval'`.
- The XLSX, CSV and PNG exports download.
- No violation is reported, and the test checks that the policy is in force.

Not covered: browsers without constructable stylesheets fall back to a `<style>` element, which needs
`style-src 'unsafe-inline'` (the element has no nonce option); only the `<meta>` form of the policy was
measured, not an HTTP header; `script-src` must allow the origin that serves `dist/` and its chunks;
a page script that sets the element's properties must be a file or carry a nonce.

pivotkit-react has no measured policy of its own: what it needs depends on how your app is built and
served.

## Loading from another origin

Module scripts from another origin (a CDN) are fetched with CORS: the server must send
`Access-Control-Allow-Origin` for `index.js` and every chunk. Subresource Integrity covers only the
`<script integrity>` of the entry; the chunks it imports later cannot carry a hash, so pin a version in
the URL, or host `dist/` yourself.

## Dependencies

- pivotkit-core has one runtime dependency: [fflate](https://github.com/101arrowz/fflate) for the XLSX
  zip.
- pivotkit-react depends on pivotkit-core and @dnd-kit; React, ReactDOM and ECharts come from your app,
  so their security updates stay with you.
- pivotkit-element bundles everything it needs and has no runtime dependency; the licenses of the
  bundled packages are in its `dist/THIRD_PARTY_LICENSES.txt`.
- Every third-party package is pinned to an exact version in the repository, and CI installs without
  install scripts.
