---
title: pivotkit-mcp
description: The pivotkit MCP server - tools for an AI client to describe data sources, write and validate views, render reports into files and make links without reading the data; exposure policy, configuration, limits, errors, logging, HTTP transport and authentication (token, OAuth 2.1).
---

# pivotkit-mcp

`pivotkit-mcp` is an [MCP](https://modelcontextprotocol.io) server: an AI client (Claude Code,
Claude Desktop, VS Code and others) uses it to build pivot reports over data the operator names. The
model never reads the data itself. It sees what the operator allows of each source (by default
names, types and counts), writes a [view](view-file.md), lets the server check it, and has the
report written into a file or made into a link for the person who asked.

To set it up step by step, see [Getting started: MCP server](../getting-started/mcp.md); to update
it, see [Update an installation](../getting-started/upgrading.md#update). This page is the
reference.

```bash
npx -y pivotkit-mcp --source sales=sales.csv --output reports     # stdio, for a local client
npx -y pivotkit-mcp --config pivotkit-mcp.json --http             # Streamable HTTP on 127.0.0.1:3333
```

Node 22 or later. It brings the official MCP TypeScript SDK (`@modelcontextprotocol/server`, which
speaks the protocol revision 2026-07-28 and the 2025 revisions) and [pivotkit-server](rest.md), which
holds what it shares with the REST service (sources, policy, workers, output, sign-in) and brings
[pivotkit-report](report.md), pivotkit-cli's file handling, pivotkit-xlsx, ECharts 6.1.0 and jose
(for OAuth). `pivotkit-server serve` runs this endpoint and the REST service on one port.

## Tools { #tools }

| Tool | What it does | Writes |
| --- | --- | --- |
| `list_sources` | The sources the caller may use: id, title, whether a link or a schedule works, the parameters a source takes | - |
| `describe_source` | A source's fields with their type, level and counts, the aggregators and filters each works with, example views from its own fields | - |
| `suggest_view` | A draft view from a source's fields (marked `Draft:`), with what each part took and could take instead (`picks`); a `layout` replaces parts of it | - |
| `get_view_guide` | How to write a view: its keys, the vocabulary (aggregators, filter types, date groupings), five example views | - |
| `validate_view` | Errors and warnings of a view (or a `layout`: a view by field names) against a source, each with its place and, for a misspelt name, the name meant (`suggestion`) | - |
| `describe_view` | A view in plain parts (rows, columns, values, filters in words) with the same findings | - |
| `render_view` | The report of a view or a `layout` as `xlsx` (default), `html`, `csv`, `json` or `svg`, into the output directory; inline where the policy allows; over HTTP a [download link](delivery.md) in the text and as a `resource_link` where the report gets one; with `save: false` csv or json inline only ([below](#inline-only)) | a new file; none with `save: false` |
| `create_link` | A link that opens the view in the source's report page (only for sources with `link`); a view only, a `layout` is refused with the way to make one (`validate_view`) | - |
| `draft_schedule` | A draft of a report that runs on a schedule (when, formats, recipients by name), for a person to approve in the host; runs and sends nothing; a view only, as `create_link` | a new file |

Every tool has an input and an output JSON Schema (draft 2020-12) and returns its result as
structured content and as one text block: a short sentence with counts and ids (never a name or value
from the data), then the JSON. A view with errors is not a tool error: `ok` or `valid` is false and
`findings` say what to fix. Every result over a source's data (all tools but `list_sources` and
`get_view_guide`) has `dataAsOf`, when the data is from, in UTC to the second
(`"2026-11-15T08:00:00Z"`): a file's modification time, or for a library host's code source its own
`asOf` (see below), else when `load()` gave the data. pivotkit parses every such time and writes it
again in this one form, so no text of a source reaches the model through it; a time that does not
parse is left out for when the data arrived, one in the future becomes now. `render_view`'s message and
summary line end with it in words ("Data as of 2026-11-15 08:00 UTC."). A result may also carry
`stale: { since }` when last good data stands in for a code source's load that failed
([last good data](sources.md#code-cache)). The tools are one table shared with the command line
([`pivotkit-report/operations`](report.md#operations)); the [REST service](rest.md) offers the
same operations with the same policy to programs.

The server also gives the model short **instructions** when it connects, a **prompt**
`pivotkit_report` (for clients with a prompt picker) and a **skill** (see [the skill](#skill)).

### What a source is { #sources }

`source` is either the **id** of a source the operator configured (`sales`) or, when the operator
allows files, **`file:`** and a path inside the allowed directories (`file:q3.csv`,
`file:/srv/reports/q3.csv`). A relative path is looked up in each allowed directory in turn. Formats:
CSV, TSV, TXT, JSON and XLSX, read as the [command line](cli.md#files) reads them.

A `file:` path to the file of a configured source is that source: its scopes and its policy hold.
The output directory may not lie inside an allowed directory (nor hold one), so the model cannot read
back a report it was not shown. Put only data files into an allowed directory: the first line of any
CSV, TSV, TXT or JSON file there becomes field names, which the model sees at every level.

A file named by `file:` is checked on its real path (symbolic links and `..` resolved) against the
allowed directories, then opened once without following a link at its end and checked again on the
open file. A file with a second name (a hard link) is refused unless `files.hardLinks` is true. A
file that is missing, outside the directories or replaced while it is read gets the same answer,
`FILE_NOT_AVAILABLE`, so a model cannot probe which files exist elsewhere.

### Data in the request { #data }

`source` may also be **`inline:`**: a small table the model sends itself in `data`, for a table it
already has (one a user pasted, the result of another tool). The tools that take a source offer
`data` unless the operator switched it off (`mcp.data: false`):

```json
{ "source": "inline:", "data": { "name": "Open tickets", "columns": ["Team", "Open"],
  "rows": [["Blue", 4], ["Red", 7]], "rowCount": 2, "asOf": "2026-11-15T06:00:00Z" },
  "view": { "rows": ["Team"], "values": [{ "field": "Open", "agg": "sum" }] }, "format": "xlsx" }
```

- **The model wrote these rows.** They are not the operator's data, and the operator's exposure
  policy does not apply to them: every field is `show` to the caller who sent them. A report over
  them is no proof that its content came from the operator's data. The profile's `inline` limits
  still apply.
- **The whole table.** `rowCount` is required and must equal the rows sent, else `DATA_MISMATCH`
  ("you sent 180 rows but rowCount says 200: send the whole table"); every row has one value per
  column; column names are unique (without case), without control or direction characters.
- **A fixed cap.** At most 500 rows, 5,000 cells and 256 KiB (the `data` object as JSON); the
  operator may lower each (`mcp.data`) but never raise it. Over it the answer is `LIMIT_EXCEEDED`
  with the cap in force ("the limit is 500 rows / 5000 cells / 256 KiB; send fewer, or ask the
  operator to configure a source for this data"). `list_sources` says it as
  `"data": { "rows": 500, "cells": 5000, "bytes": 262144 }`. For more data the operator configures a
  source. A call far over the cap may hit the SDK's limit of 10,000 input elements first, whose
  error the client gets instead.
- **Not kept.** The data is never cached and is gone after the call. `create_link` answers
  `NO_LINK` and `draft_schedule` `NOT_SCHEDULABLE`. `dataAsOf` is when the data arrived; the
  caller's own `asOf` comes back as `suppliedAsOf`, parsed and written again, as the caller states it.
- A profile with `data: false` (or `policy.data: false` for callers without a profile) switches it
  off for those callers (`NOT_ALLOWED`). The same works over stdio. Programs send larger tables and
  files to the [REST service](rest.md#data).

## Exposure policy { #policy }

The operator sets, per field, how much of it the model may see. A source's `policy` goes over the
server's `policy`; field names are matched without regard to case. [What reaches an AI
model](../model-data.md) shows a model's answers at each level and a profile per client.

Levels from open to closed: `show`, `values`, `summary`, `hide`. A source's rule for a field
replaces the server's, and a profile's replaces the source's, except that a field the source's policy
hides stays hidden in every profile. Only two rules of one part for one field (two spellings of its
name) keep the stricter of the two.

| Level | describe_source shows | Findings | Results |
| --- | --- | --- | --- |
| `show` | name, type, counts, up to `items` values (`complete: true` when that is all of them; no `complete` with `counts: false`), the smallest and largest value | an item in another case or with other spaces gets the data's spelling (`itemCase`; the item is not corrected, so the report stays empty until the view uses that spelling); where the list is complete, an item that is none of the values gets `itemUnknown` with the closest one; a render whose fields are all `show` says when its filters keep no rows (`noRowsKept`) or a table or chart was cut | csv and json come back inline when they fit `inline` |
| `values` | name, type, counts and every distinct value, sorted (`items`, `complete: true`; `auto: true` where the [automatic rule](#auto-values) gave the level) | `itemCase` and `itemUnknown` for this field; no `noRowsKept`, `filterEmpty`, `tableCut` or `chartCut`, which would tell whether a combination of listed values exists | as `summary`: written to a file only; rows, columns and size withheld |
| `summary` (default) | name, type, counts | names; no check of an item against the data: a misspelt item renders an empty report | written to a file only; rows, columns and size withheld |
| `hide` | not listed; `hiddenFields` counts them | never named | the column is dropped when the data is read |

A column the file gives no name (a blank header cell, or a row with more values than the header,
which a separator inside a value can cause: the reader names it `Column 7`) is `hide` whatever the
default, since its values may belong to another column; a rule of `fields` that names it holds.
Such a name is a position, not a meaning: when the file gains or loses a column, `"Column 6": "show"`
shows whatever lands there, so give the column a header instead where you can.
Where a caller sees any field below `show` (its default or a rule is `values`, `summary` or `hide`), a
row whose cells may be shifted (a value beyond the header, or more cells than the header and than the
file's other rows; a separator that ends every line is no shift) is left out whole, with a
`ROWS_DROPPED` note that counts such rows: the values after a stray separator shift one column to the
right, so a value kept back would land in the next column, which may be shown. `check-config` counts
such rows per source.
`"default": "show"` with fields set to `hide` is a deny list: a column the data gains later is shown
unless someone hides it, and `check-config` warns of it. Prefer `summary` by default and name the
fields to show.

A field asked for `values` is `summary` where a list would not be complete and exact: a number or
date field, more distinct values than `valuesMax`, a value longer than 80 characters, a source with
`counts: false` or `rows: false` (a list's length is the distinct count), or data whose statistics
could not be read. `check-config` names each such field and why. `describe_source` says what it keeps
back in `withheld` (fixed words: `values`, `rows`, `counts`) with one sentence in `hint`. A client
reads an unknown `level` as `summary`: more levels may come.

| Key | Default | What it does |
| --- | --- | --- |
| `default` | `"summary"` | The level of a field without its own |
| `fields` | `{}` | Levels by field name: `{ "Region": "show", "Status": "values", "Customer": "hide" }` |
| `items` | `20` | Values listed per `show` field |
| `valuesMax` | `50` | Server and source: the most distinct values a `values` field may have (at most 1000) |
| `autoValues` | `false` | Server and source: the [automatic rule](#auto-values): `true`, `false` or `{ "maxDistinct", "minRowsPerValue", "minRows", "deny" }` |
| `rows` | `true` | Show the number of rows (`false` also keeps a render's `sourceRows` and `keptRows` back) |
| `counts` | `true` | Show distinct and blank counts per field |
| `inline` | `{ "cells": 500, "bytes": 32768 }` | The largest csv or json result that may come back inline; `false`: never. An inline csv (`inline.text`) has no byte order mark, as text a program reads; the csv file starts with one |
| `results` | `false` | The REST service's file route may hand out the rendered file ([downloads](rest.md#downloads)) |

### The automatic values rule { #auto-values }

With `policy.autoValues: true` (off by default), a text field that looks like a category gets
`values` without a rule of its own, so a model can find the exact name of a status or a team. It is
meant for sources whose text fields are non-personal categories: `check-config` lists what it would
list, so review that before you switch it on, and give a field its own rule or the source a
`default` where it must not apply. Listed values are data from the source, never instructions; they
are cleaned of control and direction characters like every value. It
applies only to the operator's sources (never to a `file:` path), only where no `default` is written
at server, source or profile level, and never to a caller bound to a profile. A field's own rule
always wins. A field qualifies when all of these hold:

- at most 12 distinct values (`maxDistinct`), each in at least 5 rows (`minRowsPerValue`);
- at least 100 rows in the source (`minRows`), and at least 20 rows per distinct value;
- values of at most 40 characters, none looking like an e-mail address, a phone number (seven
  digits or more anywhere), an address on the web, an IBAN, an IP address or a run of 6 or more
  digits;
- a field name without a word of the deny list, in English and German: people and their roles
  (name, customer, employee, owner, contact, manager, user, created by, assigned to, Kunde,
  Ansprechpartner, ...), personal traits and beliefs (gender, age, birth, religion, nationality,
  party, union, ...), health, money (salary, payroll, income, credit, bank, ...), places (address,
  street, city, postcode, PLZ, ...), family and free text (comment, note, reason, ...). Names are
  read with compatibility forms folded, invisible characters and accents removed, German umlauts and
  ß written out (and also without their dots), Latin small capitals, Cyrillic and Greek look-alike
  letters and the digits 0, 1 (as i and as l), 3, 4 and 5 read as letters, and runs of one- and
  two-letter words glued ("D.o.B."). Short or everyday words (name, age, city, note, union, ...)
  match only as a word of their own, with a plural or German ending; others anywhere in a word
  ("Kundenname") and, from five letters, across spaces ("Ow ner"); `deny` adds words.

The deny list is a second layer, not the safeguard. It is English and German only: a header in
another language ("Propriétaire") or a column of person names under a neutral header ("Team") is not
caught, so read what `check-config` would list before you switch the rule on. It also fails closed
the other way: a neutral header that holds a listed word ("Bank holiday", "Member tier") stays
`summary`; give such a field `values` in `fields` (`"Member tier": "values"`), since a field's own
rule always wins. The level is decided from statistics counted
when the data is read (numbers, never values) and kept with the data; when they are missing the
field is `summary`. A change after the data is read again is logged, and the start log says how many
fields the rule puts at `values`. `check-config` prints every field's level and why, for example
`values (auto: 3 distinct, min 410 rows)` or `summary (13 distinct > 12)`; with the rule off, the
fields it would list.

A **profile** (`policy.profiles.<name>`, a policy of the same shape) gives one caller more or less
than this: bound to a static token (`auth.tokens[].profile`), an OAuth client
(`auth.clientProfiles`), a person's group (`auth.groupProfiles`) or scope (`auth.scopeProfiles`), or
to every other signed-in caller (`auth.defaultProfile`), laid over each source's policy; a field a
source hides stays hidden in every profile, and a caller without a profile gets the server's policy.
See [profiles](rest.md#profiles) for which one a caller gets.

A view that uses a field that is not `show` (rows, columns, values, filters, sorting, a date
grouping's source field; `values` included) has its result **withheld**: `render_view` writes the file and returns
its name, `withheld: ["rows", "columns", "bytes", "content"]` and a `message` for the user, but no
count, size or content, since even a row count could answer "is this person in the data?".

<a id="inline-only"></a>With **`save: false`**, `render_view` returns the result inline only: no file in
the output directory, no upload to the [operator's store](delivery.md#upload), no `output` (it is
`null`) and no link, for a person who asks for the result in the chat. It takes `csv` (the format
when none is given) or `json` and lets out no more than a render without it: where the result could
not come back inline, the call fails and says to leave out `save` for a file, never saving one
instead. `INVALID_INPUT` for `xlsx`, `html` or `svg`; `NOT_ALLOWED` where inline results are off (the policy's
`inline: false`) or the view uses a field that is not `show` (that error says nothing of the
result's size); `LIMIT_EXCEEDED` for a result over the policy's `inline` cells or bytes. The call's
log line has `saved: false`. Without `save` (or with `save: true`) a render is saved as above, also
when its csv or json comes back inline. In an inline json result every row and column has `total`:
0 data, 1 subtotal, 2 grand total, so a sum over the rows takes only those with `total: 0`.

`suggest_view` reads what `describe_source` shows. Its draft and `picks` name fields, never values
(not those of a `values` field either) or counts; the one thing they tell about a shown field's values is the date grouping its span gives
(a span of up to two years is grouped by month), as a `layout` with a date on an axis does. A date
field that is not shown is grouped by quarter whatever its span, and with `counts: false` the draft
does not read counts (a shown date's grouping still follows its span).

!!! warning "summary is not confidentiality"
    `summary` keeps values out of what the model reads directly, and `values` lists them on purpose. A model that writes filters over
    other fields and looks at what comes back inline can still learn about the data, and every
    number in a report is real: a small group can identify a person. For a field the model must not
    learn anything about, use `hide`, or leave the column out of the data. Field names are data too.
    Pseudonymised values are not offered.

## Configuration { #configuration }

A model chooses a source and reads its fields by the words you give them: `list_sources` hands it
`sources.<id>.description`, and `describe_source` each field's `fields.<name>.description`. Say in a
sentence what a source holds (one row per what, since when) and explain field names that are short
or coded; `check-config` names the sources without a description in one line under `Sources`.

The runner reads a configuration file (JSON) and its flags; a flag wins, and a list given as flags
adds to the file's. Paths in the file are relative to the file; a relative path given without a
configuration file (`--output reports`) is relative to the working directory, for a stdio client the
folder the client starts the server in. The configuration is read at start: a
change needs a restart, except token files (read on every request). An unknown key or value is an
error that names the key and the one probably meant.

| Key | Flag | Default | What it is |
| --- | --- | --- | --- |
| `sources.<id>.file` | `--source id=file` | - | A data file (CSV, TSV, TXT, JSON, XLSX) |
| `sources.<id>.title`, `.description` | - | the id | What list_sources says about it |
| `sources.<id>.sheet` | - | first visible | A workbook's sheet |
| `sources.<id>.policy` | - | the server's | The source's exposure policy |
| `sources.<id>.link`, `.linkKey` | - | none | The page that shows this source's reports, for create_link; the report's key there |
| `sources.<id>.template` | - | built-in | An HTML [print template](print-template.md) for render_view's html, its path relative to the configuration file, at most 1 MiB; its `--pk-*` colours reach the chart ([details](print-template.md#template-design)). Read and checked at start and by `check-config`: a template with an unknown placeholder, over 1 MiB or not a regular file keeps the server from starting; a missing one starts the server with a warning (a `PROBLEM` the server starts with in `check-config`) and fails that source's html reports |
| `sources.<id>.scopes` | - | none | OAuth or token scopes a caller needs to see and use it |
| `sources.<id>.fields.<name>.description` | - | none | The operator's words about a field (at most 500 characters), shown by describe_source at every level but `hide`; control and direction characters are removed |
| `sources.<id>.http` | - | none | An [HTTP source](sources.md#http): an operator's backend, its address with `{name}` for a parameter, where the rows are, paging and limits, its sign-in (`http.auth`: a secret header, client credentials or a token exchange, [backend sign-in](sources.md#http-auth)) |
| `sources.<id>.params` | - | none | An HTTP or code source's parameters: values a caller passes with the source (see below) |
| `sources.<id>.timeMs`, `.ttl`, `.maxStale` | - | code: 30000 ms, none, 3600 s; HTTP: 15000 ms, 60 s, 3600 s | An HTTP or code source's time limit, reuse and last good data ([HTTP](sources.md#http-options), [code](sources.md#code-options)) |
| `sources.<id>.cacheShared` | - | false | A code source's one copy for all callers ([code sources](sources.md#code-options)) |
| `sourceCache.maxMb` | - | 256 | The loaded data of code and HTTP sources the process keeps, in MiB (1 to 65536); the largest table that can be kept is a quarter of it (64 MiB by default), a larger one loads on every call; with several contexts in one process the largest setting applies ([bounds](sources.md#code-cache)) |
| `sources.<id>.perPerson` | - | false | A code source whose data differs per caller: its reports get only links the person who asked can open ([code sources](sources.md#code-options)) |
| `httpSources.enabled`, `.allowIpLiterals`, `.backends` | - | true, false, none | HTTP sources on or off, an IP address as a host, backends many sources share (with `intranet` for loopback and private addresses) ([HTTP sources](sources.md#http-options)) |
| `files.allowDirs` | `--allow-dir dir` | none | Directories the model may name files in (`file:`) |
| `files.list` | `--list-files` | false | list_sources lists the data files of the allowed directories (not their subdirectories) |
| `files.hardLinks` | - | false | Read files that have a second name |
| `files.scopes`, `files.policy` | - | none, the server's | Scopes and policy of `file:` sources |
| `output.dir` | `--output dir` | none | Where reports and drafts are written; made at start when missing (with its parents, mode 0700: reports may hold what a model may not see; 0755 narrowed by the umask when `output.baseUrl` is set, so the web server can read it), a warning in the log; with `output.create: false` a missing directory is an error |
| `output.create` | - | true | `false`: a missing `output.dir` is an error at start instead |
| `output.baseUrl` | - | none | The address the directory is served at: file names start with 22 random characters, and results over sources whose fields are all `show` carry a `url` (others none: anyone with it could open what the model was not shown) |
| `output.downloads` | - | on over HTTP | The server's own [download links](delivery.md): `enabled`, `expiresMinutes` (60), `bind` (`signIn`, `once`, `none`), `key`, `signIn` (`clientId`, `clientSecret`, `issuer`, `scopes`) |
| `output.upload` | - | none | [Upload to your store](delivery.md#upload): `url` or `presign`, `headers`, `link`, `linkOrigins`, `method` (PUT), `timeMs` (30000), `maxBytes`, `keepLocal` (true), `bind` (`none`), `intranet` |
| `output.maxFiles` | - | 1000 | Reports and drafts (named `<name>.pivotkit-out.<format>`) the directory may hold; a new report deletes the oldest reports, whoever made them; drafts are never deleted this way (see [REST](rest.md#running) for the trade-off) |
| `output.maxMb` | - | 1024 | Megabytes of reports and drafts the directory may hold; a new report deletes the oldest reports until it fits |
| `output.maxAgeDays` | - | 30 | Delete reports and drafts older than this many days (`0`: no age limit; the default applies only to a directory of the reports' own) from the top level of the output directory, and the temporary files of writes the server was killed in (older than an hour), at start and every hour (see [REST](rest.md#running)) |
| `policy` | - | see above | The server's exposure policy, with its `profiles` |
| `policy.data`, `policy.profiles.<name>.data` | - | MCP: on | `false`: the caller may not send [its own data](#data) (`inline:`); REST needs `true` |
| `mcp.data` | - | 500 rows, 5000 cells, 262144 bytes | `false` switches [data in the request](#data) off; `{ "rows", "cells", "bytes" }` lowers the cap (a value above the built-in one is an error) |
| `limits` | - | pivotkit-core's, files 50 MiB | pivotkit-core's [limits](../concepts/limits.md) (`rows`, `fileBytes`, `unpackedBytes`, ...) |
| `locale`, `timeZone` | - | en-US, UTC | Numbers and dates of reports; the time zone of dates in the data |
| `compute.workers` | - | 2 | Reports computed at once (worker threads) |
| `compute.timeMs` | - | 30000 | The longest a call may compute; the worker is then stopped and replaced (`TIMEOUT`) |
| `compute.memoryMb` | - | 1024 | Memory of a worker (`LIMIT_EXCEEDED` beyond) |
| `compute.queueMs` | - | 10000 | How long a call waits for a free worker before `BUSY` |
| `http.host`, `http.port` | `--host`, `--port` | 127.0.0.1, 3333 | Where `--http` listens |
| `http.publicUrl` | `--public-url url` | none | The server's address as clients reach it (behind a proxy) |
| `http.allowHosts` | `--allow-host name` | localhost names | Host names the server answers to (DNS rebinding protection) |
| `http.allowOrigins` | `--allow-origin name` | none | Browser origins (host names) allowed to call |
| `http.page` | - | on | The quick-start page; `{ "sources": true }` lists source ids on it; `false` turns it off |
| `http.graceMs` | - | 25000 | How long a stop (SIGTERM) waits for running requests |
| `http.maxConnectionsPerAddress` | - | 0 (no bound) | Connections one address may hold, loopback excepted ([Streamable HTTP](#http)) |
| `mcp.rateLimit.perMinute`, `.burst` | - | 120, 30 | HTTP: requests per minute of one caller (the person an OAuth token names, a static token's name, or `local` without sign-in; an OAuth token without a subject counts for its client), with up to `burst` at once after a pause; the people of one OAuth client together get eight times both |
| `mcp.rateLimit.failedAuthPerMinute` | - | 30 | HTTP: refused tokens per address and minute; beyond, a wrong token from that address gets 429 instead of 401 (a right one still works) |
| `mcp.concurrency` | - | 4 | HTTP: requests of one caller at once (an answer that streams holds its place until it ends); the same setting holds the people of one OAuth client together to eight times this (the refusal's `limit` is `clientShare`) |
| `auth.*` | `--auth mode` | none | See [Authentication](#auth) |
| `log.level` | `--log level` | info | `debug`, `info`, `warn`, `error` or `off`; `"log": "debug"` is short for the level; `$PIVOTKIT_LOG_LEVEL` ([operations](operations.md#settings)) |
| `log.format` | `--log-format format` | auto | `auto` (text on a terminal, JSON otherwise), `text` or `json`; `$PIVOTKIT_LOG_FORMAT` |
| `log.address` | `--log-address on\|off` | on | The client's address on a request's lines (HTTP); `$PIVOTKIT_LOG_ADDRESS` |
| `audit.subject` | - | off | `hash` or `plain`: the person (`auth.subjectClaim` of an OAuth token) on the `call`, `request` and `download` [log lines](#logging) |
| `audit.key` | - | a random key per start | `hash`: the key (at least 16 characters), `{ "env": "NAME" }` or `{ "file": "path" }`, read at start with OAuth only |
| - | `--config file` | `$PIVOTKIT_MCP_CONFIG` | The configuration file |
| - | `--check-config` | - | Print whether the server would start and what it would expose (sources, each field's level and why, the fields the automatic values rule gives or would give `values`, files, output, auth) and exit; 1 when it finds a problem ([reading it](rest.md#check-config)). A policy rule that names no column of the data is a warning (exit 0) |

A write the server is killed in leaves its temporary file
(`.<name>.pivotkit-out.<format>.<pid>-<random>.tmp`). It is not a report: neither counted toward
`output.maxFiles` and `output.maxMb` nor deleted to make room. With `output.maxAgeDays: 0` it stays
until you remove it.

The same file configures [pivotkit-server](rest.md#running), which reads `rest.*` and `http.enable`
too; pivotkit-mcp ignores them.

```json
{
  "sources": {
    "sales": {
      "file": "data/sales.csv",
      "title": "Sales",
      "description": "Orders since 2024, one row per order line",
      "link": "https://reports.example.com/sales",
      "policy": { "fields": { "Region": "show", "Product": "show", "Customer": "hide" } }
    }
  },
  "output": { "dir": "reports" },
  "policy": { "default": "summary", "items": 20 }
}
```

As a library (the SDK's stdio entry is `serveStdio` from `@modelcontextprotocol/server/stdio`):

```js
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpContext, listen } from "pivotkit-mcp";

const context = await createMcpContext({ sources: { sales: { load: async () => rows, version: () => rowsVersion } }, output: { dir: "/srv/reports" } });
serveStdio((ctx) => context.server(ctx));                               // stdio
// or HTTP with every check of this page, on node:http:
const server = await listen({ sources: { sales: { file: "/srv/data/sales.csv" } }, http: { port: 3333 } }, { env: process.env, stderr: process.stderr });
```

`createMcpContext(options)` checks the options (`validateOptions`), resolves the
directories and starts the workers; `context.server(ctx)` builds a fresh McpServer for the SDK's
`serveStdio` or `createMcpHandler`; `await createHttpHandler(context)` gives `{ fetch, close }` with every
check of this page; `loadConfig(file)` reads a configuration file into options. A library host may
give a source a function instead of a file, a [code source](sources.md#code):
`load(params, { caller, signal })` returns rows, `{ rows, asOf }` or columnar data, and
`version(params, { caller })` says when the data changed. `caller` is a frozen copy of who calls
(`client`, `profile`, `scopes`, `groups`, and with OAuth `subject` and `issuer`, else null; never a
token); `signal` is aborted after the source's `timeMs` (30 s by default). `load` runs in the host's
thread; the report over its data is computed in a worker under `compute.timeMs` and
`compute.memoryMb`, as for a file ([where it runs](sources.md#code-thread)). pivotkit keeps their data per caller (with its client, scopes, groups
and claims), values and policy levels, unless `cacheShared: true` makes one copy for all callers
(`caller` is then null); a caller without an identity (an OAuth token without a usable subject) gets
no kept data. Calls that need the same data while it loads share one load; after a transient failure
the last good data stands in for up to `maxStale` seconds (3600 by default), with `stale` in the
result. A `SourceError` (exported by pivotkit-server) says what went wrong in words a caller may read;
anything else a load throws is `SOURCE_UNAVAILABLE` with a fixed text ([errors](sources.md#code-errors)).

An operator configures an [HTTP source](sources.md#http) in the configuration file: pivotkit
requests the operator's backend at an address with `{name}` for a parameter, never one a caller
gives, and reads the rows from its answer.

A code or HTTP source may declare **parameters**: values a caller passes as `params` with the source's id,
checked and written again by pivotkit before `load` (or the backend's address) sees them (a code source without `params` gets `{}`).

```js
sources: {
  tickets: {
    load: async ({ team }, { caller }) => fetchTickets(team, caller.subject),
    params: { team: { type: "string", required: true, enum: ["blue", "red"], description: "The team" } }
  }
}
```

A parameter has a `type` (`string`, `integer`, `number`, `boolean`) and may have `required`,
`default`, `description`, `example`, `enum`, `pattern`, `minLength`, `maxLength` (strings: 64 unless
set, at most 256), `minimum`, `maximum` and `format: "date"`; at most 16 per source, names letters,
digits and `_`. A `pattern` is matched against the whole value (as if written `^(?:...)$`) and may
not repeat a group (`(a|b)*`, `(ab)+`, `(ab){1,3}`; repeat a character or a class, `[ab]*`, or make the group optional, `(-x)?`). Every match runs with a time limit of 25 ms: a pattern that takes longer on values made to be slow is refused at start, and a value it cannot check in time is `INVALID_INPUT`; a string without `pattern` or `enum`
takes letters, digits and `. _ ~ -` only, and no string value may hold `..` or a control character. `list_sources` lists a source's parameters, and the tools that take a source take `params` only
when a configured source declares any. A missing required value, an unknown name or a value of the
wrong form is `INVALID_INPUT` naming the parameter, with its description, example and (when short)
pattern; a value must have the parameter's type (a number for a `string` parameter is refused), and
a text with lone surrogates is refused. `list_sources` gives each parameter's type, description,
example, list of values, pattern, format, lengths and range. `createHttpHandler(context, { env })`
reads static tokens from `env` (default `process.env`). `pivotkit-mcp/policy` exports the exposure
policy (`resolvePolicy`, `withStats`, `levelOf`, `levelInfo`, `autoLevel`, `deniedWord`, `listsAll`,
`stricter`, `exposeSource`, `exposeFindings`, `touchesClosed`) for another front end over the same
sources; it is `pivotkit-server/policy` under another name.

## Limits and errors { #errors }

Views from the model are checked with pivotkit-core's limits for views from outside (`outsideLimits`),
data with its [limits](../concepts/limits.md); the server's own default for files is 50 MiB
(`fileBytes`, `unpackedBytes`). A call's input may hold at most 10,000 array elements and object
members; an HTTP body at most 2 MiB. Over HTTP a caller over a request limit (`mcp.rateLimit`,
`mcp.concurrency`, the REST service's limits with their own counts) gets 429 with `Retry-After` and
a JSON-RPC error; the counts live in the memory of one process.

A tool error is a result with `isError` and the text `CODE: message` (an input the tool's schema
refuses is answered by the SDK before the tool runs, as `Input validation error: ...`); the message names a file by its
base name only and holds no file content. Every tool error ends with the call's request id,
`CODE: message (request id Ab3_xY9-k2Q)`: the person gives it to the operator, who finds the call's
[log line](#logging) by it. An error of status 500 or more says the same fixed text as the REST
service, never its own words, with the source and whether trying again may work in the same
parenthesis (`SOURCE_UNAVAILABLE: the source is not available right now; if it stays so, give the
operator the request id (source tickets; trying again later may work; request id Ab3_xY9-k2Q)`).
A message that ends in a parenthesis (a refused value's "(The team, for example blue)") takes the
request id inside it, so no two stand in a row. `BUSY`, `NOT_READY` and
`TIMEOUT` keep their own words, which name only the server's limits. Whether trying again may work
is said for `SOURCE_UNAVAILABLE` and `UPLOAD_FAILED` (as the REST service's
[`retryable`](rest.md#errors)); a source's own refusal below status 500 (`NOT_ALLOWED`,
`INVALID_INPUT`, `DATA_NOT_AVAILABLE`) keeps its words and says nothing about it: the same call
does not work when tried again.

| Code | When |
| --- | --- |
| `INVALID_INPUT` | An input the schema allows but the tool does not (a recipient that is an address, a format, an input nested deeper than 64 levels) |
| `SOURCE_NOT_FOUND` | No such source, or one the caller lacks the scopes for (the same answer) |
| `FILES_NOT_ALLOWED` | `file:` without allowed directories, or without the scopes for files |
| `FILE_NOT_AVAILABLE` | A file missing, outside the allowed directories, or changed while read |
| `NOT_REGULAR_FILE`, `HARD_LINK`, `UNSUPPORTED_FORMAT`, `INVALID_FILE` | The file is a directory or special file, has a second name, is no data format, or cannot be read |
| `LIMIT_EXCEEDED` | A file, a view, the [data sent](#data) or the work over a limit; the worker's memory |
| `NOT_ALLOWED` | A tool the caller's token has no scope for; [data sent](#data) where it is switched off; a code source that refuses the caller (its `SourceError`) |
| `DATA_MISMATCH` | [Data sent](#data) whose `rowCount` differs from the rows sent |
| `NO_OUTPUT` | No output directory for a file that must go there, the directory not writable by the server's user, or full where the server deletes nothing (it holds the operator's own files) |
| `NO_LINK`, `NOT_SCHEDULABLE` | A link for a source without a page or over data sent in the request; a schedule over a `file:` source, data sent in the request, or a source with a token exchange or a parameter bound to a claim ([backend sign-in](sources.md#http-claims)) |
| `BUSY`, `TIMEOUT` | No worker free within `queueMs`; a call over `timeMs` |
| `SOURCE_UNAVAILABLE` | A code or HTTP source's load failed, took longer than its `timeMs` or has too many loads running ([code sources](sources.md#code-errors), [HTTP sources](sources.md#http-errors)); one of pivotkit's fixed texts (not available right now; the backend refused pivotkit's access; not set up correctly), with the source's id and whether trying again may work |
| `DATA_NOT_AVAILABLE` | A code source has no data the caller may see for these values (its own `SourceError`); an HTTP source's backend answered 401, 403 or 404 for the values given |
| `UPLOAD_FAILED` | The report was made but could not be stored in the [operator's store](delivery.md#upload); a fixed text with the request id and whether trying again may work; the report stays in the output directory |
| `INTERNAL` | Anything else: "internal error", the details only in the log with `--log debug` |

## Logging { #logging }

One line per event on stderr (on stdio, stdout is the protocol): JSON, or text on a terminal
(`log.format`). Every line has `time`, `level`, `severity`, `event`, `msg`, `service` and `version`;
[Operations and logs](operations.md) lists every field, the levels, the request and trace ids and
how to ship the log. `started` (version, transport, address, auth mode, the number of sources and
their ids, whether files and an output directory are on, the log's settings, the static tokens'
names), `call` (tool, the source: a configured id, `inline:`, `file:` for any file by path or
`unknown` for any other text, never the text the model sent; client, `requestId`, `traceId`, `ok`,
`status` and `outcome`, error code, time in ms; for `inline:` data the number of rows and columns;
`saved: false` for a `render_view` with `save: false`),
`download` (a [download link](delivery.md) opened: `via: "link"`, its binding, whether it worked and
the code, never the token), `refused` (an HTTP request refused by the Host, Origin or token check, a
limit or a body over the cap, a request the protocol layer refuses (its error's class and the SDK's
name for the refusal; the message itself, which can quote the request's body, only with
`--log debug`), or any other error answer that has no line of its own, such as a body that is not
JSON, with its status and `reason`), `warning` and, after an HTTP server stops, `stopped`. A
call line is `info` when it worked, `warn` for an error a REST caller would get as 4xx and `error`
for 5xx. `requestId` is random (11 characters), the same on every line of one call, at the end of its
error and, over HTTP, in the answer's `X-Request-Id` header. Over HTTP a request's lines name the
client's `address` (with `http.trustProxy` the forwarded client, else the socket's peer; the socket's
peer as `peerAddress` where it differs) unless `log.address` is `off`. The client is the static token's name or the OAuth token's client id. A line
holds the person only where you ask for it with `audit.subject`, as `subject`, and never their groups
or other claims. No line holds a view, a value, a token or a full path. The log is the supervisor's
to keep and rotate.

`audit.subject` names the person of an OAuth token (its `auth.subjectClaim`) on `call`, `request`
and `download` lines; a refused request never names one, and a static token's caller is named by the
token's `client` already.

| `audit.subject` | `subject` on the line |
| --- | --- |
| `off` (default) | none |
| `hash` | the first 16 hex characters of `HMAC-SHA256(audit.key, JSON.stringify([issuer, subject]))`, hex-encoded: the same person gets the same value, and without the key it cannot be turned back into a name. Without `audit.key` the key is random per start (a warning): the values change with every restart |
| `plain` | the subject as the token carries it, without control characters, at most 128 characters |

With `plain`, and with `hash` while you keep the key, the log holds personal data: say so where the
log goes, and keep it no longer than you need it. Keep `audit.key` as a secret (a file only the
server's user reads). The key is read at start, and only with OAuth (a static token's caller is
named by its token); a key that cannot be read, or one shorter than 16 characters, stops the start.
A rotated key takes effect at the next restart and changes every person's value, so lines from
before and after no longer match.

To find a person's lines, compute their value with the key, for example in Node:

```js
import { createHmac } from "node:crypto";
createHmac("sha256", key).update(JSON.stringify([issuer, subject])).digest("hex").slice(0, 16);
```

`issuer` is the token's `iss` exactly as the server checks it (`auth.issuer`), `subject` the value
of `auth.subjectClaim`.

## Streamable HTTP { #http }

`--http` serves the MCP endpoint at `/mcp` (POST; GET and DELETE as the SDK answers them), with these
checks in order:

1. **Host**: only the localhost names, the public URL's host and `--allow-host` (protection against
   DNS rebinding, as the [transport spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security-%26-endpoint) asks). It cannot be switched off.
2. **Origin**: a request with an `Origin` header (a browser) is refused with 403 unless its host name
   is in `--allow-origin`; a client that sends none (every non-browser client) passes.
3. **Authentication** for `/mcp` ([below](#auth)).

`/mcp` takes `POST` only (the server keeps no sessions): another method, `HEAD` included, answers 405
with `Allow: POST` after the token check and takes no request slot.

Host, Origin, the declared size and the token are checked from the headers before the body is
read. At most 256 connections are open at once, and 16 of them are kept for loopback clients
such as the health check or a proxy on the same host, so clients on the network that hold
connections without sending cannot lock them out (a process on the same host can); a client has 5
seconds for its headers and 30 for its request. `http.maxConnectionsPerAddress` (default 0, no
bound) caps the connections of one address; set it where clients reach the port directly with
addresses of their own. Behind NAT, a published port or a proxy every client has one address, so
leave it off there. An IPv6 address counts as it is, not by its network. Refused connections are
logged at most once a minute (the first at once, the rest when the minute ends), naming each bound
that refused a connection since the last line (`total`, `loopbackReserve`, `perAddress`), the last
address and the counts. Behind a proxy (`http.trustProxy`) the protection comes from the proxy: its header
and body timeouts, its limits per client, and the server's port reachable from the proxy only. A
request target must be a path (or the absolute form `http://host/path`, read by its path):
`OPTIONS *` answers 400. On SIGTERM the server
takes no new connection and lets running requests finish for up to `http.graceMs`.

Without authentication: `/healthz` (`{ "ok": true }`, for a supervisor or a proxy), the OAuth
discovery documents, and the **quick-start page** at `/`: what the server is, its endpoint, client
configurations to copy, the auth mode and the tools. A browser that opens `/mcp` is sent there. The
page lists source ids only when `http.page.sources` is true (default only with auth `none`), and only
sources without scopes, never paths, fields or data; it loads nothing from elsewhere and has no script
(`Content-Security-Policy: default-src 'none'`).

The server listens on 127.0.0.1 unless `--host` says otherwise, and refuses another address without
authentication unless `--allow-unauthenticated` says the network is trusted. There are no sessions:
every request gets a fresh server from the shared context. Behind a reverse proxy: keep the server
on 127.0.0.1 when the proxy runs on the same machine, terminate TLS at the proxy, forward `/mcp`,
`/.well-known/`, `/downloads/` ([download links](delivery.md)) and `/`, keep the `Host` header (or add the proxy's name with `--allow-host`), set
`--public-url`, and turn response buffering off for `/mcp`. The server reads no
`X-Forwarded-Proto` or `X-Forwarded-Host`: its own address is `--public-url`. `X-Forwarded-For` it
reads only with `http.trustProxy` (the client's address for its limits and the log, [REST
service](rest.md#running)); without it, client addresses are in the proxy's log. For IIS with ARR, see
[PowerShell Universal](../getting-started/mcp.md#psu-iis). For nginx:

```nginx
location ~ ^/(mcp|\.well-known/|downloads/|healthz$|$) {
    proxy_pass http://127.0.0.1:3333;
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_read_timeout 60s;
}
```

## Authentication { #auth }

| Mode | For | How |
| --- | --- | --- |
| `none` | stdio, HTTP on loopback | No check. stdio always: the [authorization spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#protocol-requirements) says a stdio server takes credentials from its environment. |
| `token` | a team, a proxy, PowerShell Universal | `Authorization: Bearer <token>` |
| `oauth` | any OAuth 2.1 / OpenID Connect provider | The server is an OAuth protected resource |

### Static tokens { #token }

The token comes from `$PIVOTKIT_MCP_TOKEN`, or several named tokens from `auth.tokens`, each from
an environment variable or a file (read on every request, so a token is rotated without a restart),
each with its own `scopes` (a token without `scopes` holds every scope). A token has at least 32
characters, only those a bearer token can carry (letters, digits, `-._~+/`, `=` at the end; the
start refuses another); make one with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Tokens are compared
as SHA-256 digests in constant time, never logged, and refused in the address (`?access_token=`) and
when a request carries two `Authorization` headers.
The token's name is the client in the log. A token file that is missing, empty or shorter than 32
characters while the server runs refuses every request with that token (401) and writes a warning
naming the token and the cause, at most once a minute.

```json
{ "auth": { "mode": "token", "tokens": [
    { "name": "analysts", "env": "PIVOTKIT_TOKEN_ANALYSTS", "scopes": ["sales", "hr"] },
    { "name": "viewers", "file": "/run/secrets/pivotkit-viewers", "scopes": ["sales"] } ] } }
```

Rotating a token without a break:

1. Add a second entry to `auth.tokens` for the new token, with the same `scopes` and `profile`, from
   a file of its own, and restart once (the list of tokens is read at start).
2. Give the clients the new token, one after the other; both work meanwhile.
3. Remove the old entry and restart.

A token file can also be overwritten in place, without a restart: every client still on the old value
gets 401 from that moment, so do it only after steps 1 and 2, or when you mean to cut the old value
off. Write the new value to a temporary file in the same directory and rename it over the old one
(`mv`), so the server never reads a half-written file. The warning for a file that cannot be used
names the cause (the file is missing, empty, or has N characters), never the value or the path.

### OAuth 2.1 { #oauth }

The server follows the [MCP authorization spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
(revision 2026-07-28) as a protected resource:

- It serves **Protected Resource Metadata** ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728))
  at `/.well-known/oauth-protected-resource/mcp`, naming the issuer as its authorization server, and
  the issuer's own metadata at `/.well-known/oauth-authorization-server` for older clients.
- A request without a valid token gets **401** with `WWW-Authenticate: Bearer resource_metadata="..."
  scope="..."`; a token without the required scopes gets **403** `insufficient_scope` naming every
  scope the call needs.
- An access token must be a **JWT** signed by a key of the issuer's JWKS (RS256, PS256, ES256 or EdDSA
  by default; never `none`, never HMAC), with this issuer, an audience of this server (the
  `resource`, [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)) or one of `audience`, and an
  expiry; 30 seconds of clock difference are allowed. Why a token failed stays on the server. The
  token is never passed on.
- At start the server reads the issuer's metadata (RFC 8414, then OpenID Connect discovery; its
  `issuer` must match exactly, its `jwks_uri` must be on the issuer's origin unless `jwksUri` is set),
  with a time limit and no redirects. Until it has it, `/mcp` answers 503 and the server keeps trying.
- Every request to the issuer (metadata, keys, a download link's sign-in, whose token endpoint must
  be on the issuer's origin unless `output.downloads.signIn.tokenUrl` names it) follows the rules of the
  server's other outbound requests: `https://` only, no redirects, no proxy from the environment, the
  address checked where the connection goes, at most 256 KiB of metadata and 256 KiB of keys (a
  larger key set is refused, and no token verifies against it). Link-local and cloud metadata
  addresses are never reached; loopback and private addresses only with `auth.intranet: true`, for
  an issuer in your LAN or cluster (Keycloak, Authentik). An IP address as the host works only in
  `auth.issuer` or `auth.jwksUri` itself. A refused request is a warning in the log that names the
  setting, and `check-config` prints a PROBLEM for an issuer on such an address. For a certificate
  of your own authority, set `NODE_EXTRA_CA_CERTS` to its file.
  It reads the metadata again every hour, and when a token names a key the JWKS does not hold, so a
  moved `jwks_uri` works without a restart; after a read that found nothing new (or failed, which
  keeps what is loaded) the next such read waits a minute, so made-up key ids cannot hammer the
  issuer; one sent just before a rotation can delay picking up the moved `jwks_uri` by up to that
  minute. Keys are fetched from the JWKS and kept for 10 minutes; a new key is fetched at most every
  30 seconds. A token stays valid until it expires (no revocation check).

| Key | Default | What it is |
| --- | --- | --- |
| `auth.issuer` | - | The issuer, exactly as its metadata writes it (required) |
| `auth.resource` | - | The canonical address of the MCP endpoint, e.g. `https://reports.example.com/mcp` (required) |
| `auth.audience` | `[resource]` | The `aud` values accepted, for providers that put a client id or an `api://` URI there |
| `auth.requiredScopes` | none (a warning at start) | Scopes every request needs, e.g. `["pivotkit"]`; also the scopes the 401 asks for |
| `auth.toolScopes` | none | Scopes per tool: `{ "render_view": ["pivotkit:render"], "draft_schedule": ["pivotkit:schedule"] }` |
| `sources.<id>.scopes`, `files.scopes` | none | Scopes a caller needs to see a source (without them it is not listed and is `SOURCE_NOT_FOUND`) |
| `auth.scopesSupported` | `requiredScopes` | What the metadata lists, taken as it is when set ([which scopes](#scopes)) |
| `auth.offerSourceScopes` | false | `true`: the metadata lists the sources' scopes too |
| `auth.scopeClaim` | `scope`, else `scp` | The claim the scopes are read from |
| `auth.subjectClaim` | `sub` | The claim that names the person: the identity a code source's kept data, a download link and the request limits are bound to. Name a claim the provider does not let users change (not a profile field such as a nickname): one a person could edit would let them act as someone else or open new limits for themselves. A token without it (or with an empty one, or one over 256 characters) has no identity, and nothing is kept for it. Some providers give a different `sub` per application; for those name another claim (for Microsoft Entra ID, for example, `oid`; check your provider's documentation) |
| `auth.algorithms` | RS256, PS256, ES256, EdDSA | Accepted signature algorithms |
| `auth.jwksUri` | the issuer's | Another place for the keys |
| `auth.requireTyp` | none | Require a token type, e.g. `at+jwt` (rejects ID tokens where the provider marks access tokens) |
| `auth.clockTolerance` | 30 | Seconds of clock difference |
| `auth.intranet` | false | The issuer (and `jwksUri`) may be on a loopback or private address: an issuer in your LAN or cluster |
| `auth.allowInsecureIssuer` | false | Accept an `http://` issuer on a loopback address: for a test issuer on this machine only |
| `auth.clientProfiles`, `auth.scopeProfiles` | none | The policy profile of an OAuth client id or scope ([profiles](rest.md#profiles)) |
| `auth.groupProfiles` | none | A person's group to a profile, `[{ "group": "finance", "profile": "finance" }]`: the first entry whose group the token carries wins ([groups](#groups)) |
| `auth.groupsClaim` | `groups` | The claim with the person's groups, a list of texts |
| `auth.groupsSeparator` | none | Also take a text claim, split by this separator (`","`); without it a text claim counts as unknown. A group name that holds the separator is split in two |
| `auth.defaultProfile` | none | The profile of a signed-in caller that no token, client, group or scope names; without it, a signed-in person whom no client, group or scope gives a profile is refused while `groupProfiles` is set |

#### A client registered in advance { #preregistered-client }

An MCP client registers itself at the issuer when the issuer offers dynamic client registration.
Where it does not (its discovery document, `/.well-known/openid-configuration` or
`/.well-known/oauth-authorization-server`, has no `registration_endpoint`), create the client at the
provider yourself and give the MCP client its id. Claude Code otherwise stops with "does not support
dynamic client registration":

```bash
claude mcp add --transport http --client-id <client-id> --callback-port 8080 pivotkit https://reports.example.com/mcp
```

Register `http://localhost:8080/callback` (the port of `--callback-port`) as the client's redirect
URI. For a confidential client add `--client-secret`, which asks for the secret (or reads
`MCP_CLIENT_SECRET`); a public client with PKCE needs none. Claude Code's own
[MCP documentation](https://code.claude.com/docs/en/mcp) has the current flags. Other MCP clients
work the same way where they take a client id and a fixed redirect URI: register what the client's
documentation names.

Many providers put the client id into the access token's `aud` for such a client. Add that id to
`auth.audience` (`"audience": ["https://reports.example.com/mcp", "<client-id>"]`), unless your
provider sets `aud` to the resource the client asked for.

#### Which scopes the metadata offers { #scopes }

The metadata (`scopes_supported`) lists `auth.requiredScopes`. With `auth.offerSourceScopes: true`
it lists every scope a source needs too (`sources.<id>.scopes`, `files.scopes` when files are
allowed), so a person and a client can see which scopes exist; a scope of `auth.scopeProfiles` is
never listed by itself, since a client that asks for it would choose its own profile. It is off by
default: a provider may refuse a sign-in that asks for a scope it does not define, and the metadata
is public, so it names your scopes to anyone. Define every offered scope at your provider first, and
give scopes neutral names (`pivotkit:sales`, not the name of a confidential project).

The 401 challenge asks for `requiredScopes` only. A client that follows the MCP specification
(revision 2026-07-28, "Scope Selection Strategy") asks for the challenge's scopes first and reads
`scopes_supported` only when the challenge names none, so a source's scope reaches a person's token
through the client's own scope setting, the provider's default scopes or `requiredScopes`. A call
that needs more gets 403 `insufficient_scope`, and an empty `list_sources` says what to do; with
the scopes offered it names them:

```text
0 sources. No source is available with your current sign-in. This server offers the scopes: pivotkit:sales pivotkit:vms. Sign in with one of them, or ask the operator.
```

Without offered scopes it says to ask the operator which scopes to sign in with.
`auth.scopesSupported` replaces the list (check-config warns of a `scopeProfiles` scope in it).
`check-config` prints the scopes offered and warns of a source whose scope is offered nowhere.

#### Groups { #groups }

`auth.groupProfiles` gives a person the profile of their group: the first entry, in the
configuration's order, whose `group` the token's `auth.groupsClaim` lists (exact and
case-sensitive). The groups count as unknown when the claim is missing, is a text without
`auth.groupsSeparator`, holds something other than texts, holds more than 100 groups or one longer
than 256 characters, or when the token says the groups are elsewhere (an overage marker:
`_claim_names` naming the claim, or `hasgroups`; Microsoft Entra ID, for example, sends one for a
person in many groups: check your provider's documentation). A person whose groups are unknown never
gets a group's or a scope's profile: they get `auth.defaultProfile`, or, without one, 403
`access_denied` ("your sign-in does not carry your groups; ask the operator"). A client profile
(`auth.clientProfiles`) comes first, so a restricted model client stays restricted whatever the
person's groups. Groups are read from the access token: a change takes effect with the person's next
access token. A provider that cuts a long group list without a marker cannot be told from one that
sends the whole list: check how your provider handles many groups. A person in none of the groups, whom no
client or scope profile names either, gets `auth.defaultProfile`, or, without one, 403
`access_denied` ("your sign-in gives you no access to this server's data; ask the operator"), never
the sources' own policy, which may show more than any profile (check-config says so). With `--log debug` each sign-in logs how many groups it carried (never
which) and the profile chosen; groups are never logged otherwise. A refused sign-in's `refused` line
names the client (the app), never the person.

A token stays valid until it expires: keep the provider's access token lifetime short (minutes), so
taking a person's access away takes effect soon. Set `requiredScopes`, so not every token the provider
issues for this audience works, and `requireTyp: "at+jwt"` where the provider marks its access tokens
so (RFC 9068), so an ID token is refused. Why a token was refused is logged with `--log debug`
(jose's reason and the claim, never the token); the client is the token's `azp` or `client_id`
(`client` when it has neither).

Opaque tokens (checked by introspection) are not supported: the provider must issue JWT access
tokens. How a client registers (Client ID Metadata Documents, a pre-registered client or Dynamic
Client Registration) is between the client and the provider: the provider needs a public client with
PKCE, the scopes, and an audience the server accepts.

Examples (the issuer's form and what lands in `aud` differ by provider and setting: check them in
your provider's documentation and in a decoded access token of your own):

=== "Authentik"

    ```json
    { "auth": { "mode": "oauth",
        "issuer": "https://auth.example.com/application/o/pivotkit/",
        "resource": "https://reports.example.com/mcp",
        "audience": ["<the provider's client id>"],
        "requiredScopes": ["pivotkit"] } }
    ```

    The provider's settings in Authentik (signing key, scope mapping, client type):
    [Sign-in with Authentik](../getting-started/kubernetes.md#oauth).

=== "Keycloak"

    ```json
    { "auth": { "mode": "oauth",
        "issuer": "https://login.example.com/realms/example",
        "resource": "https://reports.example.com/mcp",
        "requiredScopes": ["pivotkit"] } }
    ```

    An audience mapper on the client scope puts `https://reports.example.com/mcp` into `aud`.

=== "Microsoft Entra ID"

    ```json
    { "auth": { "mode": "oauth",
        "issuer": "https://login.microsoftonline.com/<tenant id>/v2.0",
        "resource": "https://reports.example.com/mcp",
        "audience": ["api://<application id>", "<application id>"],
        "requiredScopes": ["Reports.Read"] } }
    ```

    The issuer is tenant-specific (not `/common`), and of this form for version 2 access tokens; the
    scopes arrive in `scp`.

## The skill { #skill }

`skills/pivotkit-reports/SKILL.md` in the package teaches a model the workflow: describe the source,
write a view from its fields, validate and use the suggestions, render or link, and what `level` and
`withheld` mean. The server offers it as MCP skills to clients that support them, as the prompt
`pivotkit_report`, and in short as its instructions. For clients that read skill folders, see
[Getting started](../getting-started/mcp.md#skill).

## Security { #security }

See [Security: the MCP server](../security.md#mcp) for what the server protects against and what it
does not.
