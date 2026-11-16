---
title: Security
description: Why pivotkit is not access control, how it treats views and loaded files as untrusted input, keeps memory use bounded, renders no markup from data, writes safe exports, what its MCP server lets a model see and its REST service lets a program fetch, and runs under a strict Content-Security-Policy.
---

# Security

The people who use reports build them. Views travel: they are saved on servers, shared as templates
and passed in URLs. pivotkit is built for that. To report a vulnerability, use the private channel
described in the repository's
[security policy](https://github.com/eizedev/pivotkit/blob/main/SECURITY.md).

## pivotkit is not access control

pivotkit shows every row and column it is given:

- in the table and the chart
- in the drill-down
- in the exports of the source rows
- in what `onCellClick` and the events pass on

Filters, the start view and templates are not permissions. A person can remove a filter, load another
view or open a link, and then sees the rest of the data. `drillDownLimit` caps how many rows a
drill-down holds, for memory. It does not decide who sees them.

- Send only the rows and columns this viewer may see. Filter them on your server for this user,
  before they reach the browser. Whatever the browser holds, the person can read with its developer
  tools.
- A link or a view file names its data by a source id ([Sharing](concepts/sharing.md#opening-a-link-on-another-page)).
  Load the data behind that id with the rights of the person who opens it, not of the person who
  shared it. Answer a source they may not see as you answer an unknown one. Check the link's allowed
  `params` the same way: they come from the link, not from you.
- A shared view holds the values chosen in its filters, so a view can show a value to someone who
  could not see the rows ([Privacy](reference/view-file.md#privacy)).

### Source data { #source-data }

Export → **Source data** downloads every row and every column of the data the report holds, as CSV or
JSON. It is off by default. `exportData` turns it on, `export-data` on the element. The download also
holds:

- the columns no view places
- the rows the report's filters leave out
- a field the host only relabels or describes. `fieldDefaults` changes how a field is shown, not
  whether it is there.

It puts into one click what the browser's developer tools already reach, so turn it on only where
the viewer may take every row home. Keep rows the viewer must not have off the page: aggregate them
on your server. `exportData={{ columns }}` limits the files to the columns you name. It does the same
for the drill-down's copies and files.

The drill-down hands out rows too. It shows up to `drillDownLimit` rows behind a value, with every
column, in its panel, its exports and `onCellClick`. The grand total's drill-down holds every row.
Where rows must stay in, turn it off with `drillDown={false}`.

`onExport` sees the file first, with `kind` `"data-csv"` or `"data-json"`. On the element it is
`pivot-export`. Your code can log the file, upload it or refuse it (`false`). It is a hook for your
own code, not a barrier against a person with developer tools.

Nothing is stored or sent: the browser makes the file. Its size counts against `limits.cells`, rows
times fields, default 2,000,000. pivotkit checks it before it builds the file. While the browser makes
the file, it holds about twice the CSV's size. For JSON it holds a few times the file's size.

## Views are untrusted input

- A view holds **names only**, and in its filters the values chosen there. Those are plain values of
  the data, and a shared view gives them away. See [Privacy](reference/view-file.md#privacy).
    - Field names are resolved against the data's columns.
    - Aggregators, formats, filter operators, "show as" calculations and chart types are resolved
      against fixed lists.
    - Colours are checked against `#rgb` and `#rrggbb`.
    - A name is never evaluated as code. It is never used as an object key without an own-property
      check.
- A view from a link, a pasted text, a file or the tab's storage is the same input. It goes through
  `normalize()` against the data, and pivotkit says in plain words what it left out.
- A link is capped at 32,000 characters and its view at 1,000,000 characters. pivotkit enforces the
  caps while it inflates the link, 1 KiB of input at a time. So a small crafted link can neither make
  a large allocation nor keep the page busy ([Sharing](concepts/sharing.md)).
- The tips' list in `localStorage` holds dismissed tips and the help switches. pivotkit reads it as
  JSON and keeps only entries that are one of the known ids. Anything else, or text that is no JSON,
  reads as an empty list.
- Templates are views too ([Templates and shared views](concepts/templates.md)):
    - Every name in the Views menu, the host's `templates` included, is plain text. Control, bidi and
      zero-width characters are removed. A name has at most 120 characters.
    - `parseTemplates` reads a list from a server, the browser store or an OpenAPI document's
      `x-pivotkit-views`. It caps the list's text at 5,000,000 characters and its entries at 500
      before it reads them, and reads own properties only.
    - The browser store's text is not parsed at all above 500,000 characters.
    - Every view is normalized when it is loaded. A published view leaves the report normalized.
    - `templatesFromSchema` follows local references only and fetches nothing.
    - The report only shows what the host allows (`canPublish`, `deletable`). The host's server must
      check who may save, publish or delete, and validate every view it receives.
- `chartOptions` belongs to the host, but is often JSON from a server, so pivotkit cleans it
  ([Charts](concepts/charts.md#chartoptions-for-developers)):
    - Only plain JSON values pass. Prototype keys and functions are dropped.
    - Depth and size are capped.
    - The ECharts options that are markup or addresses are dropped too: a string `formatter`, `rich`,
      `link`, `image` and the tooltip's element.

    So nothing in it is markup, an address or run.

- A bad view does not throw. pivotkit drops what it cannot use and reports it. See
  [Views and saved views](concepts/views.md#a-view-is-user-input).
- A filter's values are checked like its names:
    - A `compare` value is a number or a calendar day: `"2022-03-01"` or wall-clock milliseconds,
      within what a `Date` holds.
    - A `relative` count is capped at 500.
    - Today, for a relative range, is `options.now` of `computePivot` or the current time, read in the
      data's time zone. So a saved relative view gives different results on different days, by design
      ([Filters](concepts/filters.md#relative-date-ranges)).
- A view cannot ask for unbounded work:
    - Its size and its parts are capped: 8 fields per axis, 16 values.
    - The work of a pivot is computed before it starts.
    - The groups, the aggregated cells and every dense structure are counted against
      [limits](concepts/limits.md#limits) before or while they are allocated. Dense structures are
      the rows x columns of a table and the data points of a chart.
    - Over a limit, pivotkit throws `PivotkitError` with `LIMIT_EXCEEDED`. The UI shows a message
      that says which limit was hit and what to change.

## Data is text, never markup

Field names, values and labels are rendered as text: by React, or by `textContent` in your own
renderer. A value like `<img src=x onerror=alert(1)>` shows as those characters. A browser test checks it with a
data set of labels that look like HTML.

Field labels and descriptions (`fieldDefaults`) are plain text too, capped in length. A "Learn more"
link is shown only for an absolute `https:` URL, and it opens with `rel="noopener noreferrer"`.

`fieldDefaultsFromSchema` treats a JSON Schema or OpenAPI document as data:

- It follows references inside the document only.
- It fetches nothing and runs nothing.
- It caps the fields, texts, enum entries, reference depth and the number of schema objects it reads.

## Exports

- **CSV**: text that a spreadsheet would run as a formula gets a leading `'`. That is:
    - text starting with a tab or a carriage return
    - text whose first visible character is `=` or `@`. Spaces, line breaks, control characters and
      invisible characters such as a zero-width space do not count as visible.
    - text starting with `+` or `-`, unless it is a number as a locale writes it (`-5%`, `-1.234,5`, `-1’234.5`, `-5,3 %`, `-€1.50`) or a
      number range such as the bin label `-10 – 0`

    Characters that change the direction of text are left out, as the import leaves them out:
    U+061C, U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069. So a name cannot read as another
    one, and no formula hides behind one.

- **Source data as CSV**: the same guard on every value and on the field names of its header. A field
  named `=x` is written `'=x`, and a script reading the file gets that name.
- **Source data as JSON**: every text and name as it is. There is no guard, and no bidi controls are
  removed. Programs read JSON, and no spreadsheet runs it. A program that turns it into CSV applies
  its own guard.
- **Copies** (Copy table, the drill-down's Copy): the same guard on every cell, since a spreadsheet
  runs a pasted formula too. Copy as JSON writes values, never markup or code.
- **XLSX**: text is written as inline strings, never as formulas, and without bidi controls, as in the
  CSV. pivotkit-core writes the XML itself. No spreadsheet library is involved. Excel's sheet limits
  are checked before writing.
- **HTML report and SVG** ([pivotkit-report](reference/report.md)):
    - Every text is escaped and loses its bidi controls, as in the CSV. In the SVG that holds also for
      text written as a numeric reference.
    - A [print template](reference/print-template.md) may hold placeholders only in text and in a few
      attributes. pivotkit checks it before it renders anything.
    - The report's Content-Security-Policy loads and runs nothing. Its chart is an image.
    - The SVG is checked element by element: no script, event attribute, link or style attribute.
    - Printing from the page fills a frame sandboxed without scripts.
- Downloads use a blob URL on an `<a download>`. Nothing is sent anywhere. File names are made safe:
  path separators and characters a file system refuses are replaced. With `onExport`, or the
  cancelable `pivot-export` event, your page gets every file and every copy first. It can keep it
  instead.

## Loaded files are untrusted input

The browser reads a file a person loads ([Loading files](reference/import.md)). Nothing is uploaded,
and a hostile file affects only that person's tab. Its readers treat it as hostile:

- **Limits before the expensive step**:
    - The file's size is checked before a byte is read.
    - Rows, columns and values are checked while they are read.
    - For a workbook, the number of ZIP parts and the size they unpack to are checked from the ZIP's
      directory, before anything is unpacked.
    - Each part is unpacked as a stream. The stream stops when the part would grow beyond the size
      the directory states. So a ZIP bomb or a forged directory cannot unpack more than the limits
      allow.
    - `unpackedBytes` bounds what is unpacked, not the memory a read takes. See
      [Untrusted workbooks](#untrusted-workbooks).
    - A sheet's values are checked against `rows`, `columns` and `importCells` by the row and column
      they stand in. pivotkit reads those as the parser reads them, with any namespace prefix. It
      checks them while the sheet streams in and before the sheet is parsed. Otherwise a file of a
      few hundred bytes with a value in row 300,000 and column XFD would become a dense array of
      billions of cells in the parser.
    - pivotkit leaves out rows without a value, such as a used range of formatted empty cells. That
      saves time and memory. The limits do not depend on it.
    - A host can give loaded files lower limits than its own data
      ([`importLimits`](concepts/limits.md#limits-of-a-loaded-file)).
- **Nothing in a file runs**:
    - No formula is evaluated. pivotkit reads a workbook's saved values.
    - A workbook with macros (`.xlsm`, `vbaProject.bin`) is refused.
    - An XML part that declares a document type or entities (`<!DOCTYPE`, `<!ENTITY`) is refused
      before it is parsed. That rules out entity expansion ("billion laughs") and external entities.
    - Nothing is fetched.
- **Names and values are text**:
    - Control characters, invisible format characters and the characters that turn text around
      (U+202E) are removed from column names and values. These are then shown as text, like any
      data.
    - The `params` of a table's notes and the messages of errors quote the file too, for example a
      sheet name or a JSON key. They are cleaned the same way and cut to 256 characters. They are
      still the file's text: show them as text (`textContent`), never as HTML.
    - Text that a spreadsheet would run as a formula stays as it is in the table. The
      [exports](#exports) guard it.
- **Clear refusals**: a file that is something else is refused with what it is and what to do. Such
  files are an `.xls`, a password-protected workbook, or a workbook named `.csv`.
- **Plugins** run with the rights of the page. Use [plugins](reference/plugins.md) whose source you
  can read, pinned to an exact version.
- **In the report** (`allowImport`):
    - The file is read only after a person picked or dropped it. It is shown first in a preview.
    - Only **Load data** replaces the data. The host can refuse it (`onDataLoad`, `pivot-data-load`).
    - Names and values from the file are shown as text in the preview, the field list and the table.
    - A loaded file's data lives only in the tab's memory. None of its values is stored, and a reload
      brings the host's data back.
    - The file's name and its column names are stored where views are kept or shared. The source id
      of a saved view, a view file or a link names the file, with up to 120 characters and a hash. A
      view file lists the fields it uses.
    - Undo keeps at most three data sets, so loading one file after another does not keep every one
      in memory.

### Untrusted workbooks

`unpackedBytes` (500 MiB) bounds how much of a workbook is unpacked. The memory a read takes depends
on how much of it is kept.

Before read-excel-file parses a part, pivotkit-xlsx does this:

- It leaves out what it never reads: rows without a value, anything between rows that is no row, and
  what follows `</sheetData>`.
- It cuts runs of whitespace to 128 KiB.
- It refuses as `DAMAGED` a text of more than 1 MiB, a tag of more than 256 KiB, or a `<` inside a
  tag.

So a small file padded with whitespace costs time in proportion to its unpacked size. It costs memory
mostly for the pieces being unpacked, which the garbage collector frees as it goes. At its peak that
is up to about 2 to 3 times the unpacked size. What is kept costs a few times its size, as for any
workbook that large.

read-excel-file keeps an entry for each shared string and each cell or number format. Each entry
costs about 100 bytes, even for a string of one letter. pivotkit-xlsx bounds these entries:

- Of the shared strings, it keeps only those up to the highest one a cell of the sheet names. It
  leaves out strings that only other sheets use.
- It counts the strings and formats it keeps against `importCells` plus 1,000 rows for a title
  block. It counts them together, and with a namespace prefix too. More stop the read with
  `LIMIT_EXCEEDED`, so they cost no more than a table at that limit.
- Shared strings are numbered across the whole workbook. So a small sheet is refused too when its
  cell names a string past that limit, for example in a workbook whose other sheets hold millions of
  strings.
- The sheet may name its strings in a way the filter does not read: with a prefix, or with a value
  that is no plain number. Then all strings are kept, up to the same limit.
- A comment, CDATA section or processing instruction in a row or in the shared strings is skipped,
  as the parser skips it.

Measured with Node 26 on an Apple M4, as the peak memory of the whole process. The numbers are
approximate, and machines differ:

| Workbook | Unpacked | Time | Memory |
| --- | --- | --- | --- |
| 54 KB, sheet XML padded with whitespace | 50 MiB | 0.4 s | about 200 MB |
| 105 KB, whitespace before, in and after the rows, in a tag, in shared strings | 100 MiB | 0.4 to 0.8 s | about 190 to 310 MB |
| 257 KB, 6 million one-letter shared strings, a sheet of two cells | 100 MiB | 0.3 s | about 120 MB |
| 1.3 MB, 30 million one-letter shared strings, a sheet of two cells | 495 MiB | 1.3 s | about 120 MB |
| 455 KB, 11 million one-letter shared strings, a cell naming the last one | 178 MiB | 5 to 8 s | about 1 GB |
| 81 KB, 11 million cell formats (`<xf/>`) | 52 MiB | 2 s | about 1.3 GB |
| 1.3 MB, 30 million one-letter shared strings, a cell naming the last one | 495 MiB | refused after 2 to 3 s | about 300 MB |

The last three are what the defaults still allow. Lowering `importCells` lowers them in proportion.

For workbooks from people you do not trust:

- Lower `unpackedBytes` and `importCells` to what your workbooks need. Use `importLimits` in the
  report, and `--limit unpackedBytes=104857600` on the [command line](reference/cli.md#files).
- Run a server-side read with a time and memory limit of its own, in a worker or a container.

## The command line

`pivotkit` ([pivotkit-cli](reference/cli.md#files)) handles files like this:

- It reads a file once, as a regular file, after it checked its size.
- It writes through a temporary file.
- It never replaces a link or a directory.
- With `--allow-dir`, it reads and writes only inside the directories named, by real path.

`--allow-dir` is not a sandbox. A hard link inside an allowed directory reaches the file it names.
Another process of the same user can change the directories while the CLI runs.

Its messages never hold a file's content. `describe` shows a data file's values only when asked
(`--items`).

With a server (`--url`, `--source`):

- The token comes only from `--token-file` or `PIVOTKIT_TOKEN`, and is never printed.
- The CLI speaks https. It speaks http only to loopback.
- It follows no redirect.
- It refuses to send the token with `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- It caps and checks every answer.
- It writes a downloaded report with mode 0600.

A token whose profile has `results: true` exports every field that is not hidden. Keep it out of an
environment an AI agent controls ([With a server](reference/cli.md#with-a-server)).

## The MCP server { #mcp }

[pivotkit-mcp](reference/mcp.md) lets an AI model build reports over data the operator names. It
treats the model as a caller that may have been steered by text it read. It treats the data as text
that may try to steer the model. [What reaches an AI model](model-data.md) shows the answers a model
gets at each level, and how to set them per client.

- **Through pivotkit, the model gets what the policy shows.** It gets what the
  [exposure policy](reference/mcp.md#policy) allows per field:

    | Level | The model gets |
    | --- | --- |
    | `summary`, the default | names, types and counts |
    | `values` | the field's values as a complete list |
    | `show` | values and results. Only `show` fields give them. |
    | `hide` | nothing. The field is dropped when the data is read. |

    - A view may touch a field that is not `show`, `values` included. Then its result is written to a
      file. Its row count, size and content are withheld from the model.
    - Findings are decided per field. A finding about a field's items comes only for a field whose
      values are listed.
    - A finding that would tell whether rows exist comes only for a view of `show` fields. Such
      findings are "a filter keeps nothing" and "a table was cut". So an empty combination of two
      listed values says nothing.
- **The automatic values rule is off by default.** With `policy.autoValues: true`, a text field that
  looks like a category lists its values without a rule of its own. A field looks like a category
  when it has:
    - few values, each in many rows, and short ones
    - nothing that looks like an e-mail address, a phone number, an IBAN, an address on the web or
      an IP address
    - a name that is not on a deny list

    The rule decides from counts taken when the data is read, never from a person's judgement.
    Before you switch it on for personal data, run `check-config` and read what it lists. Set an
    explicit `default` or a field rule where the rule must not apply. It never applies to a `file:`
    path, never where a `default` is written, and never to a caller bound to a profile.

    A draft (`suggest_view`, a layout) reads no counts or span of a field that is not shown. It reads
    no counts where `counts` is false. A date field there is grouped by quarter, whatever its span.

- **The policy is not confidentiality.**
    - A model can still learn from what it may see: results over `show` fields, the lists of `values`
      fields, and counts.
    - Every number in a report is real. A small group can identify a person.
    - Field names are data too.

    Leave out of the data, or `hide`, what the model must not learn about.

- **Over stdio, the policy is no access control against the client.** A result names the report
  file by its absolute path. A client with file or shell tools, such as Claude Code or VS Code, can
  read that file and the source files. The model then reads values the policy keeps back. Give such
  a client only data its model may see. Or run the server as another user or on another machine,
  and connect over HTTP, where a result names no path.
- **Links reach the model.** A sign-in link or a one-time link (`bind: "once"`) is in the result the
  model reads. A client with a browser tool in the person's signed-in session can open it.
  [What the policy does not cover](model-data.md#beyond-policy) has both.

- **Data values are text, never instructions.** Names and values reach the model only inside the
  result's JSON. They are cleaned of control and direction characters and cut at 80 characters. They
  never appear in the sentence a tool answers with, in the tool descriptions or in the instructions.
  A model can still be misled by them. The skill and the instructions tell it they are data.
- **Files**: no directory is open to the model by default.
    - With `files.allowDirs`, the model may name files inside those directories. The server checks
      them by real path, on the path and again on the open file.
    - A hard link is refused.
    - A file that is missing, outside or replaced gets one answer, so paths outside cannot be probed.
    - This is not a sandbox (see [the command line](#the-command-line)). Run the server as a user
      that can only read what it should.
    - Configured sources are the operator's paths and need no allowed directory. A `file:` path to
      one of them is that source, with its scopes and policy.
    - The output directory may not lie inside an allowed directory.
    - Every file in an allowed directory can be read. Its first line becomes field names the model
      sees, so keep only data files there.
- **Output** goes only to the operator's output directory:
    - Reports are new files that never replace one. Their names are cleaned to letters, digits,
      spaces, dots, underscores, dashes and parentheses.
    - In a directory a web server serves, names start with 22 random characters. Protect that server
      as you would the data. Note that a report gets an address there only when it is over an open
      source ([download links](reference/delivery.md)): hidden by default with its shown fields
      listed, or every field shown.
    - The directory holds at most `output.maxFiles` files and `output.maxMb` MiB of pivotkit's
      files. pivotkit's reports and drafts carry `.pivotkit-out.` in their names. Other files are
      neither counted nor deleted. A file named with `.pivotkit-out.` by hand counts as pivotkit's.
    - When the directory is full, a new report deletes the oldest reports, so one caller cannot stop
      rendering for everyone. But any token that may render can push other callers' reports out. A
      link to such a report then answers 404, or 410 for the server's own links.
    - This never deletes drafts awaiting approval. Drafts may take at most half of `maxFiles` and
      half of `maxMb`. A draft over that is refused.
    - Set `maxFiles` high. Give `render_view` and `draft_schedule` scopes of their own. Keep
      `output.maxAgeDays` on, 30 days by default. It never deletes drafts that wait.
      `output.draftMaxAgeDays` does, where you set it. Keep the rate limits
      ([REST](reference/rest.md#auth)).
- **Data the model sends** (`source` `inline:`, [details](reference/mcp.md#data)) belongs to the
  model, not the operator:
    - No exposure policy applies to it.
    - A report over it is no proof that its content came from the operator's data.
    - It is capped at 500 rows, 5,000 cells and 256 KiB. The operator may lower the cap or switch it
      off with `mcp.data`, but never raise it.
    - `rowCount` must match the rows sent.
    - The report is computed in a worker like one over a file. The table is checked in the main
      thread first.
    - It is never cached, and cannot be linked or scheduled.
    - Formulas in its cells are written safe like any other text.
    - A report over it lands in the output directory like any other and counts against its quota.
      When the directory is full, the oldest reports go first.
- **Download links** ([details](reference/delivery.md)): over HTTP the server serves a report under
  a link that expires, by default after 60 minutes.
    - The link is an HMAC-signed token with 128 random bits. The server checks it in constant time.
      A forged and an unknown link get the same 404. The link names no file.
    - A source can be closed: a field at `values` or `summary`, a field hidden under the default
      `show`, or a field shown to some callers only. A report over such a source gets a link only
      where the link is bound in one of two ways:
        - to the person's sign-in: OpenID Connect code flow with PKCE, `state` and `nonce`. Only a
          sign-in with the issuer and subject that asked gets the file. The token holds them as an
          HMAC.
        - as the operator's explicit choice, used once. A GET never uses it, so a link preview
          cannot.
    - Otherwise the report gets no link. A link anyone can open would let the client or the model
      fetch what was withheld from it.
    - Over REST, such a link also needs `results: true`.
    - Links carry no internal address. Off loopback, there is no link without `http.publicUrl`.
    - The log never holds a token.
    - The token is in the link's path, so proxy logs and browser history hold it. Keep proxy logs of
      `/downloads/` short.
- **Upload to the operator's store** ([details](reference/delivery.md#upload)): the store is the
  operator's configuration, never a caller's.
    - Requests go through the guarded fetch: `https://` only, no redirects, loopback and private
      addresses only with `intranet`, metadata addresses never.
    - The operator's credentials are secret references. They go to the presign address only.
    - The address to upload to must be on `presign.allowOrigins`. The presign service cannot ask for
      credential or connection headers.
    - A link is shown only when it is `https://`, on `linkOrigins`, and without user name or control
      characters.
    - A report over a closed source goes to the store only where the operator declares its links
      bound: `once`, or `signIn` for a caller with a subject. A store whose links anyone can open
      never gets one.
    - The binding is the operator's declaration. A `signIn` link is only as strong as the store's own
      access control, which pivotkit does not verify. The presign service gets the person's HMAC
      binding, never the subject.
    - Presigned addresses, links, store tokens and answer bodies are never logged or shown. A
      failure is `UPLOAD_FAILED` with a fixed text and the request id.
- **Templates and recipients**: a print template comes from the operator, never from the model.
  A schedule is a draft a person approves in the host. Recipients are names, never addresses.
- **Connections**:
    - at most 256 at once
    - 16 of them kept for loopback clients, for the health check
    - 5 seconds for the headers
    - 32 per address where clients reach the port directly (`http.maxConnectionsPerAddress`).

    Behind a proxy, the proxy must guard the connections, and only the proxy may reach the port.

- **Resources**: worker threads compute the reports under a memory and a time limit, and a run over
  it is stopped. At most a few run at once. pivotkit-core's [limits](concepts/limits.md) apply, with
  a default of 50 MiB per file.
- **HTTP**:
    - The server listens on 127.0.0.1 by default. It refuses another address without
      authentication, unless told the network is trusted.
    - It checks the `Host` header against an allow-list, against DNS rebinding.
    - It refuses browser origins it does not know, as the MCP transport spec requires.
    - Bodies are capped at 2 MiB.
- **Authentication** is a static token or OAuth 2.1, or off (`auth` `none`):
    - A static token. The server compares it in constant time and never logs it.
      [`pivotkit-server token new`](reference/rest.md#credentials) makes one: 32 random bytes in a
      file only its owner can read.
    - OAuth 2.1 as the [MCP authorization spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
      describes. The server checks JWT access tokens for signature, issuer, audience (the server
      itself), expiry and algorithm, and never passes them on. Scopes apply per tool and per source.

    The server requests the issuer's metadata, its keys and the download sign-in's token endpoint
    under the rules of every other outbound request: no redirects, sizes capped, link-local and
    metadata addresses never, loopback and private addresses only with `auth.intranet`. So a hostile
    metadata document cannot point the server at an internal address.

    The quick-start page at `/` is not behind authentication. It shows no source ids unless the
    operator turns that on (`http.page.sources`). Without sign-in (`auth` `none`), it lists them by
    default.

- **The log** names tools, source ids and the client.
    - Source ids include `inline:`, `file:` for a file by path, and `unknown` for anything else a
      caller typed.
    - The client is a token's name or an OAuth client id.
    - A request's or a call's line never names a view, a value, a token or a file path. Lines at start
      can name the operator's own file paths.
    - It names a person's id only when the operator sets `audit.subject`. With `hash`, the id is an
      HMAC-SHA256 with `audit.key`, which has at least 16 characters. With OAuth, the server reads
      the key at start. With a static token it does not read it. A rotated key needs a restart and changes every value. With `plain`,
      the id is the claim's text.
    - It never names a person's groups.
- **Groups to profiles** (`auth.groupProfiles`):
    - A token whose group list is cut, missing or replaced by an overage marker never gets a group's
      or a scope's profile.
    - A person who is in none of the groups and whom no client or scope profile names is refused
      (403), unless `auth.defaultProfile` gives them a narrow profile. They never get the sources'
      own policy.
    - A provider that cuts a list without a marker cannot be detected.

## The REST service { #rest }

[pivotkit-server](reference/rest.md) serves the same operations to programs, on the same core as the
MCP server. The exposure policy, the workers and their limits, the output directory, the Host check
and the sign-in above hold for it too. What differs:

- **A caller gets what its policy allows, never more.** A program is not a model, but the levels
  still hold:
    - A field at `summary` keeps its values out of every answer.
    - A field at `values` lists its values, but no result over them.
    - `hide` drops the field.

    A **profile** can give one caller more: values, downloads. The configuration binds a profile to a
    token, an OAuth client, a group or a scope. Or it gives the profile to every other signed-in
    caller (`auth.defaultProfile`). The caller never chooses it. A field the source hides stays hidden
    in every profile. A caller without a profile gets `auth.defaultProfile` where it is set.
    Otherwise it gets the server's and the source's policy.

- **Downloads** (`POST /api/v1/views/render/file`) need a policy with `results: true`. Whether a
  download is allowed never depends on the view's fields. The file comes as an attachment with
  `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` and
  `Content-Security-Policy: sandbox; default-src 'none'`. So an HTML or SVG report runs nothing when
  a browser opens it.
- **Data in the request** ([details](reference/rest.md#data)) is off unless a profile has
  `data: true`.
    - Only such a caller may send a larger body, and only once its token is checked. The body may be
      up to `rest.data.maxBytes`: default 10 MiB, from 2 to 64 MiB. It may go only to a route that
      takes a source.
    - Everyone else keeps 2 MiB. A body declared larger than any caller may send is refused before
      the token is read.
    - Over all callers, the server reads at most two such large bodies at once, one per caller. A
      caller is a token by its name, or an OAuth client, however many use it. Another body gets 503
      `BUSY` with `Retry-After`.
    - A file is parsed in a worker under the time, memory and import limits.
    - A `sha256` of its bytes catches a file altered on the way. `rowCount` catches a cut JSON table.
    - The data is never cached, and no exposure policy applies to it.
- **What runs in the main thread.** These run in the server's main thread, outside `compute.timeMs`
  and `compute.memoryMb`:
    - reading a body
    - the check of its nesting. It is counted on the bytes, so a body of millions of brackets is
      refused at 64 levels before it is parsed.
    - `JSON.parse` of a JSON body, and the check of its table

    Only the report itself and the parsing of a file sent as multipart run in a worker. Measured on a
    laptop, for the whole request: a 7 MiB JSON table took about 0.4 s, and 46 MiB about 1.7 s. While
    the body is parsed, memory holds it a few times over. A token with `data: true` is trusted with
    that much of the server's time and memory. Give it to programs you run. Keep
    `rest.data.maxBytes` as small as they need, and keep the rate limits.

- **No files by path**: `file:` sources are refused, whatever the MCP server's `files.allowDirs` says.
  Inline results are off unless the operator turns them on, since a program can enumerate through
  them.
- **Sign-in**: the service reads only the `Authorization` header. It reads no cookie, no Basic, no
  token in the address and no second header. So a page on another site cannot call the service with
  a browser's credentials. With OAuth, the REST service is a resource of its own. A token for the MCP
  endpoint does not reach it, and the other way round.
- **CORS** is off. A browser request is refused unless its origin is listed exactly
  (`rest.cors.origins`, never `*`).
- **Limits** slow down scripts, on the REST service and the MCP endpoint alike. Each counts on its
  own:
    - per caller: requests per minute and requests at once
    - per address: refused tokens

    The counts live in one process's memory.

    The limit on refused tokens does not slow down guessing. Beyond it, a wrong token from that
    address gets 429 instead of 401, but a right token still works. What stops guessing is a token
    nobody can guess. Make every token with `pivotkit-server token new`: 32 random bytes. The server
    refuses a static token with fewer than 32 characters or 8 different characters, or one that
    repeats one piece.

- **Signed tokens** ([signed tokens](reference/rest.md#signed-tokens)) are JWTs signed with the
  server's Ed25519 keys. The server checks:
    - the signature, with `EdDSA` only, and the type `pivotkit+jwt`
    - the expiry and the lifetime, with `auth.clockTolerance` for the clocks
    - the deny list, on every request

    A token it cannot check is refused: an unknown key, a scope or profile of the wrong form, or a
    deny list it cannot read. The keys have mode 0600 and are never printed. A key file behind a
    symbolic link, or one the group or others may read, is not used. A static token is
    always compared first, so a static token that looks like a JWT keeps working.

- **Errors** are problem documents with a stable code. A message names no file content, and a 5xx
  carries a fixed text. A source the caller may not use answers as a missing one.

### The container image { #container }

The [image](reference/container.md) runs as the user 10001 on a distroless Node 22 base, with no shell
and no package manager. The base is pinned by digest. The packages come from the repository's lock
file, installed without install scripts.

Run it like this:

- with a read-only root file system, no capabilities and `no-new-privileges`
- with data mounted read-only
- with tokens as secret files. Environment variables show in `docker inspect`.

It never listens on every address without sign-in.

Without a token of yours, it makes the token `admin` at its first start, in its state volume
([made at the first start](reference/rest.md#first-start)). It does so only where the configuration
leaves auth to it. A written `auth.mode` `"token"` that resolves no token is refused, so a misspelt
variable never becomes a token with every scope. The token `admin` holds every scope. Keep it like a
password. When it leaves the machine, send it over HTTPS only.

Without a configuration, the image serves only its example data. A mounted `/data` is not readable by
path until a configuration says so (`files.allowDirs`), since every token could then read every file
below it.

Each release's image is signed with cosign (keyless) and has provenance and SBOM attestations.
[Check them](reference/container.md#verify) before you run it.

## HTTP sources and outbound requests { #http-sources }

The REST service and the MCP server make requests to other servers only where the operator's
configuration names the address:

- an [HTTP source](reference/sources.md#http) and its backend sign-in
- the OAuth issuer's metadata, key set and token endpoint ([OAuth](reference/mcp.md#oauth))
- an [upload to a store](reference/delivery.md#upload)
- an OpenAPI document by URL for `pivotkit-server source-from-openapi`

Every one goes through the same guarded request, `guardedFetch` in pivotkit-server. So a caller or a
model cannot point the server at an address:

- `https://` only, with no user name or password in the address. Plain `http://` goes only to a
  loopback address, for a test issuer the operator allows (`auth.allowInsecureIssuer`).
- No redirect is followed. A 3xx answer fails the request.
- The address is checked on the connection's own name lookup, not on a separate DNS question
  beforehand. So a name that answers differently the second time cannot pass. The socket's address
  is checked once more after it connects.
- Link-local and cloud metadata addresses are refused always. These include 169.254.0.0/16,
  `fd00:ec2::254`, `100.100.100.200` and others, also inside an IPv6 address that carries an IPv4
  one.
- Loopback and private addresses are refused unless the operator marks that target as internal:
  `intranet` on an HTTP source's backend, its token endpoint or the upload store, and
  `auth.intranet` for the issuer.
- An IP address written in a source's address needs `httpSources.allowIpLiterals`. A backend's token
  endpoint follows the same switch ([backend sign-in](reference/sources.md#http-auth)). An upload
  store's address is refused as an IP address always. The issuer follows its own rules
  ([OAuth](reference/mcp.md#oauth)).
- The operator types the OpenAPI document's address on the command line. That address may be
  private.
- Each request has its own connection and uses no proxy of the environment, so no proxy connects
  past the address check.
- The body is counted while it arrives, after decompression. The whole request has a time limit.

An HTTP source in particular makes the server request an operator's backend. So the address is the
operator's, never a caller's:

- The address is written in the configuration. A caller passes only values for its declared
  parameters. The server checks them against their type, pattern or list before it sends anything.
- A value is percent-encoded into its own path segment or query value. It cannot change the host,
  add a path segment or add another query parameter. A string without a pattern takes letters,
  digits and `. _ ~ -` only. No value holds `..`.
- Requests are `https://` only and follow no redirect. The address is checked on the connection's
  own name lookup. Link-local and cloud metadata addresses are refused always. Loopback and private
  ones are refused unless the backend is marked `intranet`. `check-config` lists each such backend.
- Further pages must be on the same host and path. The bytes of all pages, the pages, the rows and
  the time are bounded.
- A backend's body, and the words of a failed request, never reach a caller or the log. For a source
  with parameters, the backend's 401, 403 and 404 give one answer, so a caller cannot probe which
  other customers exist.
- A backend's sign-in ([backend sign-in](reference/sources.md#http-auth)) is a header from a secret
  reference, OAuth client credentials or a token exchange.
    - A secret is never written in the configuration, logged, or printed by `check-config` and
      `check-source`.
    - A person's own access token goes only to the token endpoint, as the token exchange's
      `subject_token`. It never goes to a backend: there is no token passthrough.
    - An exchanged token is kept per person, client and scopes. It is never kept longer than the
      person's own token and `maxAgeSeconds`.
    - The token endpoint's `error_description` is dropped.
    - Configure the provider so that only pivotkit's client may exchange, only tokens for pivotkit's
      resource, and only to the named audience.
- A parameter can be bound to a claim of the verified token. That gives a backend without per-person
  rights each person's own rows. The parameter needs a pattern or a list. It takes only a verified
  email. A caller never sets it, and the server never says it back.
- The policy of an HTTP source must hide fields by default, so a field the backend adds later is not
  shown without anyone deciding. Its data is kept per caller and values, never shared between
  callers.

## Content-Security-Policy

The web component was measured in the browser tests (`tests/browser/element.spec.js`) in Chromium,
Firefox and WebKit of the Playwright version pinned in `package.json`, with this policy in a `<meta>` element:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'
```

- The report renders and is styled. `style-src 'self'` does not block its constructed stylesheet. It
  does not block the inline styles React sets through the CSSOM either.
- The chart works. ECharts loads from its chunk and draws on a canvas. Nothing needs
  `'unsafe-eval'`.
- The chart's tooltip shows on hover without a violation. ECharts' default is an HTML string with
  inline `style` attributes, which `style-src-attr` would refuse. Instead, pivotkit-react builds the
  tooltip as DOM nodes, with styles set through the CSSOM and the data's texts as `textContent`.
- The XLSX and PNG exports download through a blob URL on an `<a download>`. There is no `fetch` of
  `data:`. CSV takes the same path as XLSX.
- No violation is reported (`securitypolicyviolation`), and nothing is logged. The test checks that
  the policy is in force: it adds an inline `<style>`, which is refused.
- The `<style>` fallback is tested on its own page, with constructable stylesheets removed and
  without CSP.

Not covered:

- Browsers without constructable stylesheets fall back to a `<style>` element. That needs
  `style-src 'unsafe-inline'`, since the element has no nonce option.
- Only the `<meta>` form of the policy was measured, not an HTTP header.
- `script-src` must allow the origin that serves `dist/` and its chunks.
- A page script that sets the element's properties must be a file or carry a nonce.

pivotkit-react has no measured policy of its own. What it needs depends on how your app is built and
served.

The readers of `pivotkit-core/import` and pivotkit-xlsx start no worker and evaluate no code, so the
policy above is enough for them. This was measured for pivotkit-xlsx in Chromium, Firefox and
WebKit (`tests/browser/xlsx.spec.js`). A host that runs them in a module worker of its own needs
`worker-src 'self'`.

Loading data in the element (`allow-import`) was measured with the same policy
(`tests/browser/import.spec.js`):

- Its import worker, `dist/import-worker.js`, is a file of the page's origin, started by URL, never
  `blob:`. `script-src 'self'` allows it, since `worker-src` falls back to it.
- pivotkit-xlsx's `dist/` reads workbooks as a plugin.
- The drop overlay and the preview set their places through the CSSOM.

Chromium, Firefox and the WebKit of Playwright 1.65 (build 2388) report no violation. The WebKit of
Playwright 1.64 (build 2370) reports one `style-src-attr` violation, with a console error, for every
native `<select>`. That covers the preview's type and sheet lists and a page's own `<select>` alike.
The violation comes from the control's own inner parts, not from the report's code. The lists work.
Which Safari releases behave like which build was not measured.

A policy whose `worker-src` does not allow the worker's origin makes the report read on the page
instead. The browser logs the refusal.

## Loading from another origin

The browser fetches module scripts from another origin, such as a CDN, with CORS. The server must
send `Access-Control-Allow-Origin` for `index.js` and every chunk. Subresource Integrity covers only
the `<script integrity>` of the entry. The chunks it imports later cannot carry a hash, so pin a
version in the URL, or host `dist/` yourself.

## This documentation site

The theme's script in the header of this site asks api.github.com for the repository's stars, forks and
latest release, from the reader's browser. pivotkit itself, in your app, sends nothing to a third
party. It loads only its own chunks from where you host it.

## Dependencies

- pivotkit-core has one runtime dependency: [fflate](https://github.com/101arrowz/fflate) for the XLSX
  zip.
- pivotkit-xlsx depends on pivotkit-core, fflate and [read-excel-file](https://www.npmjs.com/package/read-excel-file)
  (MIT). read-excel-file brings saxen, which `dist/` bundles. It also brings worker-f and
  unzipper-esm, which its browser, web worker and Node entries use. pivotkit-xlsx reads with its
  universal entry and does not use them. pivotkit-xlsx's `dist/` bundles read-excel-file, saxen and
  fflate, with their licenses in `dist/THIRD_PARTY_LICENSES.txt`.
- pivotkit-react depends on pivotkit-core and @dnd-kit. React, ReactDOM and ECharts come from your
  app, so their security updates stay with you.
- pivotkit-element bundles everything it needs and has no runtime dependency. The licenses of the
  bundled packages are in its `dist/THIRD_PARTY_LICENSES.txt`.
- Every third-party package is pinned to an exact version in the repository, and CI installs without
  install scripts.
