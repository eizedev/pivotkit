---
title: pivotkit-server (REST)
description: The pivotkit REST service - routes, the OpenAPI 3.1 document, policy profiles, downloads, CORS, limits, errors as problem details and logging. Sign-in, tokens and the rows route have pages of their own.
---

# pivotkit-server (REST)

`pivotkit-server` serves pivotkit's reports to programs over HTTP. A script, a PowerShell Universal
endpoint, a scheduler or a web app can list data sources, check a [view](view-file.md), render it
into a file and make links. The server runs the same operations as the [MCP server](mcp.md) and the
[command line](cli.md), with the same exposure policy. A program sees of a source what the operator
allows.

The command line is also a client of the server. `pivotkit render`, `validate`, `describe` and
`sources` with `--url` and `--source` run on the server's sources
([With a server](cli.md#with-a-server)).

The package also holds what the MCP server is built on. `pivotkit-server serve` runs the REST
service. When `pivotkit-mcp` is installed beside it, the same command also serves the MCP endpoint
on the same port.

- To try it step by step, see [Getting started: REST service](../getting-started/rest.md).
- To run it as a container, see [Container image](container.md).
- To update it, see [Update an installation](../getting-started/upgrading.md#update).

This page is the reference.

The REST service is at `/api/v1`, for example `https://reports.example.com/api/v1`. Its
[OpenAPI document](#openapi) sits at the server's root, not under `/api/v1`:
`https://reports.example.com/openapi.json`.

```bash
npm install --global pivotkit-server pivotkit-mcp
PIVOTKIT_TOKEN=... pivotkit-server serve --config pivotkit.json --auth token   # http://127.0.0.1:3333/api/v1
```

Node 24 or later. It brings [pivotkit-report](report.md), pivotkit-xlsx, ECharts 6 and jose; for
`pivotkit-server cli`, install pivotkit-cli beside it. The MCP SDK comes with pivotkit-mcp.

## Routes { #routes }

Every route is under `/api/v1` and answers JSON. A `GET` route answers `HEAD` too, without the body.
The routes are RPC-style (`POST /views/validate`), one per operation of the
[operation table](report.md#operations), and the [rows route](records.md#records):

| Route | Operation | What it does |
| --- | --- | --- |
| `GET /sources` | `list_sources` | The sources the caller may use: id, title, whether a link or a schedule works, the parameters a source takes, its [named views](sources.md#views), and where known its row count and data date ([below](#source-list)) |
| `GET /sources/{id}` | `describe_source` | A source's fields with their type, level and counts, the aggregators and filters each works with, example views, its named views |
| `POST /sources/describe` | `describe_source` | The same, with `{ "source": "<id>" }` |
| `POST /views/suggest` | `suggest_view` | A draft view from the source's fields, with the fields it picked (`picks`). A `layout` replaces the parts it gives |
| `GET /views/guide` | `get_view_guide` | How to write a view: its keys, the vocabulary, example views |
| `POST /views/validate` | `validate_view` | Errors and warnings of a view against a source, each with its place and, for a misspelt name, the name meant (`suggestion`) |
| `POST /views/describe` | `describe_view` | A view in plain parts with the same findings |
| `POST /views/render` | `render_view` | The report as `xlsx` (default), `html`, `csv`, `json` or `svg`, saved in the output directory |
| `POST /views/render/file` | `render_view` | The same report as the answer itself, a download ([below](#downloads)) |
| `POST /views/link` | `create_link` | A link that opens the view in the source's report page, with the source's link parameters in the page's query string ([link parameters](../concepts/sharing.md#link-params)) |
| `POST /schedules/draft` | `draft_schedule` | A draft of a scheduled report for a person to approve. It runs and sends nothing |
| `POST /sources/records` | none (REST only) | The rows of a source for a person who signed in, where a profile allows it ([below](records.md#records)) |

`GET /sources/records` and `GET /sources/describe` answer 405 with `Allow: POST`. A source with the
id `records` or `describe` is still described there for a caller who may use it.

A POST takes its input as JSON (`Content-Type: application/json`), at most 2 MiB. A caller that may
[send its own data](#data) can also send multipart, up to `rest.data.maxBytes`. The
[OpenAPI document](#openapi) holds the input and the answer of each route.

A view with errors is no error. The answer is 200 with `ok` or `valid` false, and its `findings` say
what to fix. The file route answers 422.

`validate`, `render`, `render/file`, `link` and `schedules/draft` take a `layout` instead of a
`view`. A layout is the view by field names (rows, columns, values, groupings), as the command line's
layout flags write it ([layout](report.md#operations)). `validate` and `render` then answer with the
`view` it made. `suggest` takes a layout too, and its parts replace those of the draft.

`render`, `render/file`, `link` and `schedules/draft` also take the name of a
[named view](sources.md#views) as `view`, such as `"view": "by-region"`. `GET /sources` lists the
names.

`source` is the id of a source the operator configured, or `inline:` for
[data sent in the request](#data). Over REST, the server refuses files by path (`file:`) with
`FILES_NOT_ALLOWED`, whatever `files.allowDirs` allows the MCP server.

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"sales","view":{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]},"format":"xlsx"}' \
  http://127.0.0.1:3333/api/v1/views/render
```

Over a source whose fields are `summary` (the default), the report gets no link, and the answer
withholds its content:

```json
{ "ok": true, "findings": [], "uses": ["Region", "Revenue"], "format": "xlsx",
  "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "dataAsOf": "2026-11-16T00:19:40Z",
  "withheld": ["rows", "columns", "bytes", "content"],
  "output": { "name": "sales.pivotkit-out.xlsx", "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "filename": "sales.xlsx", "note": "The report is saved on the server; ask the operator how to open it.", "format": "xlsx" },
  "message": "The report is saved on the server; ask the operator how to open it. Its content is not part of this answer: results over fields that are not fully shown (Region, Revenue) stay in the file. Data as of 2026-11-16 00:19 UTC.",
  "requestId": "Ab3_xY9-k2Q" }
```

Over an open source (`"policy": { "default": "show" }`, title Sales), the same request gets a
[download link](delivery.md) and the table's size in `summary`. The token in `url` is shortened here:

```json
{ "ok": true, "findings": [], "uses": ["Region", "Revenue"], "format": "xlsx",
  "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "dataAsOf": "2026-11-16T00:19:40Z",
  "summary": { "rows": 6, "columns": 2, "sourceRows": 2000, "keptRows": 2000, "truncated": false },
  "output": { "name": "LBYgghNzgES9CtH50Kz7nQ-sales.pivotkit-out.xlsx", "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "filename": "sales.xlsx", "url": "http://127.0.0.1:3333/downloads/eyJ2IjoxLC...qjt4hRZV3X", "expiresAt": "2026-11-16T01:19:54Z",
    "bound": "none", "note": "Open the link in your browser; it works for 60 minutes.", "format": "xlsx" },
  "message": "The report is saved as \"sales.xlsx\". Open the link in your browser; it works for 60 minutes. Data as of 2026-11-16 00:19 UTC.",
  "requestId": "Ab3_xY9-k2Q" }
```

Every answer that works carries `requestId`, the id of the request's [log lines](#logging) and its
`X-Request-Id` header. Give it to the operator when an answer looks wrong.

Every answer over a source's data carries `dataAsOf`. `GET /sources` gives it per source where it is
known ([below](#source-list)). `GET /views/guide` reads no data and has none. `dataAsOf` says when
the data is from, in UTC to the second. It is a file's modification time, or a code source's own
time or the time it gave the data. The server parses the time and writes it again in this one form.

A source with parameters takes their values as `params` with its id in a POST body
(`{ "source": "vms", "params": { "customer": "acme" } }`). Such a source is an
[HTTP source](sources.md#http) in the configuration, or a library host's code source.

- Describe such a source with `POST /sources/describe`. `GET /sources/{id}` carries no params, so it
  answers `INVALID_INPUT` for a source with required ones. Its `detail` names
  `POST /sources/describe`.
- `GET /sources` lists the parameters. Its `linkParams` names those a link may carry.
- `POST /views/link` takes only the parameters in `linkParams`, where the source has the list. It
  writes their values into the page's query string
  ([link parameters](../concepts/sharing.md#link-params)). Any other answers `INVALID_INPUT`.
  Without the list, the link carries none, and the answer warns with `paramsNotCarried`.
- The routes take `params` only when a configured source declares any
  ([parameters](mcp.md#configuration)). Otherwise a request with `params` answers `INVALID_INPUT`
  with the `detail` "this server has no source that takes params; leave params out (GET /sources
  lists the sources)".
- Where another source declares parameters, a source without them answers `params` with
  `INVALID_INPUT`, for example "the source sales takes no params".
- A parameter's pattern runs under a time limit. A value it cannot check in time, also on a busy
  server, answers 503 `BUSY` with `retryable: true` ([the limits](mcp.md#configuration)).

`render_view` saves the file in the server's output directory (`output.dir`) and says where:

- `output.name` is the stored name.
- `output.filename` is the name a person sees.

Where the report gets a [download link](delivery.md), the link is in `output.url`, with `expiresAt`,
`bound` and `note`, one sentence on how to open it. A report gets a link:

- always, over an [open source](delivery.md): hidden by default with its shown fields listed, or
  every field shown
- over another source only with `results: true` and a bound link

The file's name is `name` from the input, else `title`, else the view's name, else the source's.
The server rewrites it, `name` too, to lower case with `-` for spaces (`Sales by region` is
`sales-by-region`), as [delivery](delivery.md#configuration) describes. `.pivotkit-out.` goes before the format
(`sales-by-region.pivotkit-out.xlsx`). The [file route](#downloads) saves nothing, and its download
keeps the title as its name. This is the mark by which the
server knows its own files. A name that is taken gets `-2`, `-3` and so on, since the server never
replaces a file.

Check `ok` in the answer: a view with errors answers 200 with `ok: false` and `output: null`. The
caller fetches the file from the address in `output`, or uses the [file route](#downloads).

The field names in these examples are those of the `sales.csv` that `pivotkit example` writes, or
made up. `GET /sources/{id}` lists the fields of your source and views built from them (`fields`,
`examples`).

A csv result is the report's layout, as the HTML report and the workbook show it: a header row per
column field, a row of labels, then a row per group with a total row and column. The file starts
with a UTF-8 byte order mark, so a spreadsheet opens it as UTF-8. The inline `inline.text` has no
byte order mark.

These inputs change how a csv or json result reads:

- `numbers`: how numbers are written.
    - `shown` rounds each number to the decimals the view shows. A sum of 0.1 and 0.2 values is
      `9.6`, not `9.59999999999999`. A format without plain decimals (compact, bytes, a duration)
      keeps about 12 significant digits.
    - `full` keeps 15 significant digits.
    - Without `numbers`, the inline text (`inline.text`) is `shown`. The saved file and the
      [file route](#downloads)'s download are `full`. `numbers` sets both.
    - Where `shown` writes a value as 0 that is not 0, such as a sum of 0.000000001 at two
      decimals, the answer's `message` says so.
- `locale`: the language of the labels and the number format, such as `de-DE`, for a view or layout
  that names none. A csv in `de-DE` uses `;` and the decimal comma, and says "Gesamtergebnis".
    - The labels ("Grand Total", "Sum of") come in the languages pivotkit ships
      ([localisation](localisation.md#built-in-languages)), else in English.
    - Numbers are written in Latin digits, with the decimal mark the locale uses with Latin digits.
      `ar-EG` writes `9.6`, with `,` between cells.
    - A locale that chooses a numbering system (`-u-nu-`, such as `ar-EG-u-nu-arab`) is refused
      with `INVALID_INPUT`, as is a tag the server has no number format for.
- `flatHeader: true`: csv with one header row. Each column says its labels joined with ` / `, without
  the value's name when the view has one value: `Product,East,North,Grand Total`.

xlsx, html and svg ignore `numbers` and `flatHeader`, and json ignores `flatHeader`. The answer's
`message` then says which were ignored.

The inline json is on one line. The saved json file keeps its indentation. In both, every row and
column has `total`: 0 data, 1 subtotal, 2 grand total.

A csv or json result comes back inline (`inline.text`) only when the operator sets
`rest.inline: true` and every field the view uses is `show`.

With `"save": false` in the input, `/views/render` saves nothing: no file in the output directory,
no upload, `output: null`. It returns the result inline only, by the same rules. With
`"save": false` and no format, the format is csv. Where the result cannot come back inline, the
route answers an error instead of a file:

- 400 `INVALID_INPUT` for xlsx, html or svg
- 403 `NOT_ALLOWED` without `rest.inline`, or for a view of a field that is not `show`
- 413 `LIMIT_EXCEEDED` over the profile's `inline` limits ([MCP](mcp.md#inline-only))

Its `request` line has `saved: false`. The file route sends the file and saves none, so it takes no
`save` (400 `INVALID_INPUT`).

`withheld` lists what the answer leaves out because the view uses a field that is not `show`
(`values` included).

The server decides findings per field. A finding about a field's items carries the field in
`field`:

- An item spelt differently (`itemCase`) is named for a `show` or `values` field. The item meant is
  in `suggestion`, not in `message`.
- An item that is none of a field's values (`itemUnknown`, with the closest one) is named where the
  field's list is complete.

A filter on an item of a `summary` field that does not exist validates and renders an empty report.
Nothing says why, since saying so would tell that the item does not exist. Only for a view of `show`
fields does a render whose filters keep no rows have the warning `noRowsKept`.

### Row count and data date in the list { #source-list }

`GET /sources` gives a source's `rows` and `dataAsOf` once the server has read its data. A host page
can show the row count and the data date from the list alone. The list never reads data itself.

```json
{ "id": "sales", "title": "Sales", "kind": "source", "link": false, "schedulable": true,
  "rows": 2000, "dataAsOf": "2026-11-16T00:19:40Z" }
```

- Both values come from the source's last read: any REST route or MCP tool over its data, by any
  caller. The rows route counts too.
- Before the first read, both are absent. They are kept in memory only, so a restart clears them.
  To fill them after a start, read the source once, for example with `POST /sources/describe`.
- After the data changes, the list keeps the last read's values until a route reads the data again.
  `dataAsOf` says which data the count is from.
- A read whose data is older than the list's never replaces it. So after a file is restored with
  an older modification time, the list shows the old values until a restart.
- Only a source whose rows are the same for every caller gets them: a `file` source, and a code
  source with `cacheShared` and without parameters.
- A source with parameters, an HTTP source, a source bound to a person and a `perPerson` code source
  get neither: their rows depend on who asks or on the values.
- `rows` follows the caller's policy. With [`rows: false`](mcp.md#policy), the caller gets
  `dataAsOf` without `rows`, as `describe_source` keeps the count back.

## Exposure policy and profiles { #profiles }

The exposure policy is the [MCP server's](mcp.md#policy). Each field has a level: `show`, `values`,
`summary` (default) or `hide`. A source's policy goes over the server's. The
[automatic values rule](mcp.md#auto-values) is opt-in.

A REST caller is a program, not a model, but the same rules hold:

- A field at `summary` keeps its values out of every answer.
- A field at `values` lists its values but no result over them.

[What reaches an AI model](../model-data.md#rest) shows the answers per token.

| Level | `GET /sources/{id}` | Findings | Results |
| --- | --- | --- | --- |
| `show` | values up to `items`, `complete`, smallest and largest | `itemCase`; `itemUnknown` where the list is complete; `noRowsKept`, `filterEmpty`, `tableCut`, `chartCut` when every field of the view is `show` | inline where `rest.inline` and `inline` allow |
| `values` | every value, sorted, `complete: true` (`auto: true` from the automatic rule) | `itemCase`, `itemUnknown` | file only, `withheld` |
| `summary` | name, type, counts | none about items | file only, `withheld` |
| `hide` | not listed | none | dropped |

A **profile** gives one caller more (or less) than the default. It is a named policy of the same
shape in `policy.profiles`. A caller gets one profile, the first of these that names one:

1. A static token's own (`auth.tokens[].profile`).
2. Its OAuth client's (`auth.clientProfiles`). A client's profile wins over a person's groups both
   ways. A restricted model client stays restricted, and a trusted client's profile applies to
   everyone using it.
3. The first entry of `auth.groupProfiles` whose group the person's token carries
   ([groups](mcp.md#groups)). When the token's groups are unknown, only step 5 follows. Without
   step 5, the answer is 403 `NOT_ALLOWED`.
4. The one profile its OAuth scopes name (`auth.scopeProfiles`). Scopes that name two different
   profiles name none.
5. `auth.defaultProfile`, for every signed-in caller (a static token without a profile too).

Without any of these, a caller gets the sources' own policy. With `auth.groupProfiles` set, the
server refuses (403) a signed-in person whom none of these names instead
([groups](mcp.md#groups)). Profiles are never merged.

The server lays the profile over each source's policy:

- A field the source's policy hides stays hidden in every profile. The server drops it when it
  reads the data.
- Any other field takes the profile's level for it, else the profile's `default`, else the source's
  level.
- `items`, `rows`, `counts`, `inline` and `results` are the profile's where it sets them. A profile
  with `results: true` may download from a source whose own policy says `results: false`.
- A caller without a profile gets the server's policy, never more.

A caller bound to a profile never gets the automatic values rule. It gets what its profile and the
source say. With `policy.autoValues: true`, a profile that only adds `results: true` (the `export`
profile below) therefore sees less than a plain token. A field the rule lists for the plain token is
`summary` for it. Give such a profile `values` where it needs them, in its `fields` or as its
`default`. `check-config` prints each profile's levels per source.

To give a group more, bind a profile to its OAuth scope. Here a plain token sees `Status` as a
complete list and nothing else. A token with the scope `pivotkit:analyst` sees every value but
`Customer`:

```json
{
  "sources": { "tickets": { "file": "data/tickets.csv", "policy": { "fields": { "Status": "values", "Customer": "hide" } } } },
  "policy": { "profiles": { "analyst": { "default": "show" } } },
  "auth": { "mode": "oauth", "issuer": "https://login.example.com", "resource": "https://reports.example.com/mcp",
    "scopeProfiles": { "pivotkit:analyst": "analyst" } }
}
```

| Caller | `Status` | `Priority` (no rule) | `Customer` |
| --- | --- | --- | --- |
| plain token | `values` | `summary` | hidden |
| token with `pivotkit:analyst` | `show` | `show` | hidden |

```json
{
  "sources": { "sales": { "file": "data/sales.csv", "policy": { "fields": { "Region": "show", "Customer": "hide" } } } },
  "policy": {
    "profiles": {
      "analyst": { "default": "show" },
      "export": { "results": true }
    }
  },
  "auth": { "mode": "token", "tokens": [
    { "name": "dashboard", "file": "/run/secrets/dashboard", "profile": "analyst" },
    { "name": "nightly-export", "file": "/run/secrets/export", "profile": "export" },
    { "name": "scripts", "file": "/run/secrets/scripts" } ] }
}
```

Here:

- The dashboard sees every value of `sales` except `Customer`.
- The nightly export may download files.
- The scripts get the default.

`results: true` means: this caller may read every value of every field that is not hidden, in a
file, whatever level the field has. Give it only to callers that may. Profiles apply to the MCP
endpoint too: a model's token with the `analyst` profile sees values. The exception is `results`,
which only the file route reads.

| Key | Default | What it is |
| --- | --- | --- |
| `policy.profiles.<name>` | none | A profile: `default` (show, values or summary), `fields`, `items`, `rows`, `counts`, `inline`, `results`, `records` ([rows route](records.md#records)) |
| `policy.results`, `sources.<id>.policy.results` | false | Downloads through the file route for callers without a profile, per source |
| `auth.tokens[].profile` | none | A static token's profile |
| `auth.clientProfiles` | none | OAuth client id (`azp` or `client_id`) to profile: `{ "report-bot": "export" }` |
| `auth.scopeProfiles` | none | OAuth scope to profile: `{ "pivotkit:export": "export" }` |
| `auth.groupProfiles` | none | A person's group to profile, the first match wins: `[{ "group": "finance", "profile": "finance" }, { "group": "staff", "profile": "staff" }]` |
| `auth.defaultProfile` | none | The profile of a signed-in caller that nothing above names |
| `policy.data`, `policy.profiles.<name>.data` | false | The caller may send its own data ([below](#data)) |

Groups to profiles, with a narrow profile for everyone else:

```json
{
  "policy": { "profiles": { "finance": { "default": "show" }, "staff": { "fields": { "Region": "show" } }, "restricted": { "default": "summary" } } },
  "auth": { "mode": "oauth", "issuer": "https://login.example.com/realms/example", "resource": "https://reports.example.com/mcp",
    "groupProfiles": [ { "group": "finance", "profile": "finance" }, { "group": "staff", "profile": "staff" } ],
    "defaultProfile": "restricted" }
}
```

A person in both groups gets `finance`, since it comes first. `check-config` warns when a later entry
shows a field an earlier one holds back. It compares the levels in each source, with its policy.

Without `defaultProfile`, the server refuses a person with 403 `NOT_ALLOWED` when they are in none
of the groups and their client or scopes name no profile (the MCP endpoint answers
`access_denied`). Set `defaultProfile` to a narrow profile to
let such people in. `check-config` warns when it is missing.

## Data in the request { #data }

A program that has the data already, such as a script or a scheduled job, can send it with the
request. The operator then does not need to configure a source for it. Sending data is off by
default. The operator turns it on per profile with `data: true`, or for every caller with
`policy.data: true`.

The source id is then `inline:`, on every route that takes a source: describe, suggest, validate,
describe a view, render and the file route.

A caller without `data: true` that sends `inline:` gets 403 `NOT_ALLOWED`:

- Where no profile has `data: true`: "this server takes no data sent in the request (the operator
  allows it per profile: data: true); use a source from GET /sources".
- Where other profiles have it: "your token may not send data (the operator allows it per profile:
  data: true)".

As JSON, the table goes into `data`:

- `columns`, the column names, at most 1000 and at most `limits.columns`
- `rows`, the rows as lists in the columns' order, at most `limits.rows` and `limits.importCells` cells
- `rowCount`, the number of rows of the whole table

`rowCount` must match the rows sent, else the answer is 422 `DATA_MISMATCH`. This way the server
refuses a table cut short on the way:

```bash
curl -s -H "Authorization: Bearer $ETL_TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"inline:","data":{"columns":["Region","Sales"],"rows":[["North",10],["South",20]],"rowCount":2,"name":"Weekly sales","asOf":"2026-11-15T06:00:00Z"},"view":{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]},"format":"csv"}' \
  http://127.0.0.1:3333/api/v1/views/render/file
```

| Key of `data` | Required | What it is |
| --- | --- | --- |
| `columns` | yes | The column names, each once (compared without case and with whitespace collapsed), no control or direction characters, at most 1000 |
| `rows` | yes | One list per row, one value per column (text, number, true, false or null) |
| `rowCount` | yes | The number of rows of the whole table |
| `name` | no | What the data is: the report's name (default "Data sent with the request") |
| `asOf` | no | When the data is from, as you state it (ISO 8601). The answer says it as `suppliedAsOf`. `dataAsOf` is when it arrived |

A file goes as `multipart/form-data` with these parts:

- `data`: the file, as csv, tsv, json or xlsx. The server takes the format from the file name's
  extension, else from the part's content type.
- `input`, optional: the route's input as JSON, without `source`, or with `"inline:"`.

The input's `data` holds only `name`, `asOf`, `sheet` (a workbook's sheet) and `sha256`, the SHA-256
of the file's bytes in hex. The server refuses a file that differs (422 `DATA_MISMATCH`). The body has
at most these two parts. The server writes nothing to disk and uses the file's name for its
extension only:

```bash
printf 'Region,Sales\nNorth,10\nSouth,20\nNorth,5\n' > sales.csv
curl -s -o report.xlsx -H "Authorization: Bearer $ETL_TOKEN" \
  -F data=@sales.csv -F 'input={"view":{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]},"data":{"sha256":"'"$(shasum -a 256 sales.csv | cut -d' ' -f1)"'"}}' \
  http://127.0.0.1:3333/api/v1/views/render/file
```

- **No exposure policy.** The rows are the caller's own: every field is `show` to it, whatever the
  server's or its profile's policy says of fields of that name. The profile's `inline` limits still
  apply. A report over such data is no proof that its content came from the operator's data.
- **Size.**
    - A caller with `data: true` may send a body of up to `rest.data.maxBytes` (default 10 MiB, 2 to
      64 MiB) on the POST routes that take a source. Every other request keeps 2 MiB, and a 413 says
      which cap applied.
    - The larger cap applies only once the token is checked. The server refuses a body declared
      larger than any caller may send before that.
    - The server reads at most two bodies over 2 MiB at once over all callers, one per caller.
      Another caller gets 503 `BUSY` with `Retry-After` and `retryable: true`. A caller here is a
      person (an OAuth subject, or a static token's name), else the OAuth client of a token without a
      subject. Two people of one OAuth client may hold both places. Programs that share one token send one such body at a time between them.
    - The server refuses a JSON body nested deeper than 64 levels before it parses it. It refuses a
      multipart body with more than two parts before it reads the parts.
    - The server parses a JSON body in its main thread. A `data: true` token is trusted with that
      time and memory ([security](../security.md#rest)).
    - The server's import limits (`limits.rows`, `limits.importCells`, `limits.fileBytes`) apply as
      to a file source. The server reads a file in a worker under `compute.timeMs` and
      `compute.memoryMb`.
- **Downloads.** The file route over `inline:` needs `data: true` only, not `results: true`, since
  there is no operator data to protect. `results` still decides for configured sources.
- **Not kept.** The server never caches the data, and the data is gone after the request. A report
  rendered over it is saved in the output directory like any other and counts against its quota. A
  link (`/views/link`) answers 409 `NO_LINK`, and a schedule (`/schedules/draft`) 409
  `NOT_SCHEDULABLE`.
- `GET /sources` adds `"data": { "maxBytes": 10485760 }` for a caller that may send data.

| Key | Default | What it is |
| --- | --- | --- |
| `policy.data`, `policy.profiles.<name>.data` | false (REST) | The caller may send its own data. A source's policy and `files.policy` do not take it |
| `rest.data.maxBytes` | 10485760 (10 MiB) | The largest body of a caller that may send data: 2097152 (2 MiB) to 67108864 (64 MiB) |

## Downloads { #downloads }

`POST /views/render/file` takes the input of `/views/render` and answers with the file itself, as an
attachment.

- Only a caller whose policy has `results: true` may use it. That can be a profile's, a source's or
  the server's policy. Over [data the caller sends](#data), `data: true` is enough.
- This holds whatever fields the view uses. An answer that depended on the view's fields would
  itself tell what they hold.
- Without that permission, the answer is 403 `NOT_ALLOWED`.
- The route writes nothing to the output directory, and every download is a log event of its own.

| Header | Value |
| --- | --- |
| `Content-Type` | the format's: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv;charset=utf-8`, `application/json`, `text/html;charset=utf-8`, `image/svg+xml` |
| `Content-Disposition` | `attachment; filename="..."; filename*=UTF-8''...` (the name without path or control characters, at most 80 characters) |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `no-store` |
| `Content-Security-Policy` | `sandbox; default-src 'none'` (an HTML or SVG report runs nothing when a browser opens it) |

A view with errors answers 422 `VIEW_HAS_ERRORS` with its `findings`.

```bash
curl -s -o report.xlsx -H "Authorization: Bearer $EXPORT_TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"sales","view":{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]}}' \
  http://127.0.0.1:3333/api/v1/views/render/file
```

The [command line](cli.md#with-a-server) does the same with a view file, and checks the view first:

```bash
PIVOTKIT_TOKEN=$EXPORT_TOKEN pivotkit render sales.pivotkit.json --url http://127.0.0.1:3333/api/v1 --source sales -o report.xlsx
```

## Rows of a source { #records }

<span id="records-setup"></span><span id="records-who"></span><span id="records-fields"></span><span id="records-limits"></span><span id="records-host"></span><span id="records-log"></span><span id="records-sizing"></span>

`POST /api/v1/sources/records` gives the rows of a source to a person who signed in, where a profile
allows it. [Rows of a source](records.md) says how to turn it on, its limits and its sizing.

## Sign-in { #auth }

<span id="sign-in-cli"></span><span id="sign-in-cli-operator"></span><span id="sign-in-cli-manual"></span>

[Sign-in to the REST service](sign-in.md) has the sign-in modes, OAuth with the REST resource and
its scopes, and the command line's sign-in with `pivotkit login`.

## CORS { #cors }

CORS is off by default. The server refuses a request with an `Origin` header (from a browser) with
403 `FORBIDDEN_ORIGIN`. Programs send no `Origin` header.

`rest.cors.origins` lists the browser origins allowed to call. Write each exactly as a browser sends
it (`https://app.example.com`, never `*`). For these origins:

- The server answers a preflight (`OPTIONS`) before sign-in.
- Every answer, errors included, carries `Access-Control-Allow-Origin` with that origin and
  `Vary: Origin`.

The server never reads cookies, so no credentials mode is needed: the page sends the token in the
`Authorization` header. MCP's `http.allowOrigins` is a separate list.

| Key | Default | What it is |
| --- | --- | --- |
| `rest.cors.origins` | none | Browser origins allowed to call |
| `rest.cors.maxAge` | 600 | Seconds a browser may keep a preflight's answer |

## Limits { #limits }

Besides pivotkit-core's [limits](../concepts/limits.md) and the workers' (`compute.*`, as for
[MCP](mcp.md#configuration)), the REST service limits each caller. A caller is one of these:

- the person an OAuth token names (its issuer and subject)
- a static token, by its name
- `local`, without sign-in

An OAuth token without a subject counts for its client. The people of one OAuth client together get
eight times `rest.rateLimit`. They run at most eight times `rest.concurrency` requests at once. Their
refusals say `limit: clientRate` and `limit: clientShare` on the log line:

| Key | Default | What it is |
| --- | --- | --- |
| `rest.rateLimit.perMinute`, `.burst` | 120, 30 | Requests per minute, with up to `burst` at once after a pause |
| `rest.rateLimit.failedAuthPerMinute` | 30 | Refused tokens per address and minute. Beyond that, a wrong token from that address gets 429 instead of 401. A right one still works |
| `rest.concurrency` | 4 | Requests of one caller at once |
| `rest.inline` | false | csv and json results inline in the answer, where the policy allows |
| `rest.data.maxBytes` | 10485760 (10 MiB) | The body of a caller that may [send data](#data). Everyone else gets 2 MiB |

The [rows route](records.md#records-limits) has limits of its own (`rest.records`).

Over a limit, the answer is 429 `RATE_LIMITED` with `Retry-After`. The MCP endpoint has the same
limits with counts of its own (`mcp.rateLimit`, `mcp.concurrency`, see [MCP](mcp.md#configuration)).

- The server checks a token once per request.
- The counts live in the memory of one process. Two instances behind a load balancer count on their
  own.
- The address is the socket's, or with `http.trustProxy` the last one in `X-Forwarded-For`.

The server holds at most 256 connections. It keeps 16 of them for loopback clients, such as the
health check or a proxy on the same host. A client has 5 seconds to send its headers
([MCP](mcp.md#http) has the details). One address may hold at most 32 connections
(`http.maxConnectionsPerAddress`). With `http.trustProxy` there is no such bound by default. On a
network you do not trust, put a reverse proxy in front.

### The output directory { #output-limits }

The output directory holds at most `output.maxFiles` files and `output.maxMb` MiB that
pivotkit wrote. When it is full, a new report deletes the oldest reports, whoever made them, so any
token that may render can push other callers' older reports out. A link to such a report
(`output.baseUrl`) then answers 404, and one of the server's own links answers 410 `LINK_EXPIRED`.

Schedule drafts are never deleted this way. They may take at most half of `output.maxFiles` (none at
1) and half of `output.maxMb`. A draft over that answers 409 `NO_OUTPUT`, while reports keep
working. `output.maxAgeDays` does not delete a draft that waits for approval either.
`output.draftMaxAgeDays` does, where you set it. So give `draft_schedule` a scope of its own too,
and remove the drafts nobody approved. A file you name with `.pivotkit-out.` yourself counts as
pivotkit's, and the server may delete it.

The cap counts all callers together. A caller is no stable owner: with auth `none` every caller is
the same, and files written before a restart have none. So:

- Set `output.maxFiles` well above what your callers render between two clean-ups.
- Give `render_view` a scope of its own (`auth.toolScopes`) when not every caller needs it.
- Keep the per-caller rate limit ([limits](#limits)).
- Keep `output.maxAgeDays` on (30 days by default).
- Run one server process per output directory, since each process keeps its own count.

When the server stops hard during a write, the write leaves its temporary file
(`.<name>.pivotkit-out.<format>.<pid>-<random>.tmp`). The server neither counts it nor deletes it to
make room. With `output.maxAgeDays: 0`, it stays until you remove it.

## Errors { #errors }

Every error is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document,
`application/problem+json`:

```json
{ "type": "https://pivotkit.eize.dev/reference/rest/#error-source-not-found", "title": "Source not found",
  "status": 404, "code": "SOURCE_NOT_FOUND", "detail": "no source \"salse\"; did you mean \"sales\"?; GET /sources lists them" }
```

`code` is stable. `type` is the error's row in the [table below](#errors) under
`branding.docsUrl`, or `about:blank` when it is `null` ([documentation links](branding.md#docs)).
`detail` says what went wrong and what to do. It names a file by its base name at
most, never its content. A 5xx answer carries a fixed text, never an error's message. 429 and 503
carry `Retry-After`.

Every problem also carries `requestId`, the id on the request's [log lines](#logging). A person gives
it to the operator.

These errors add `retryable`: whether the same request may work when tried again. `Retry-After` says
when, where it is known.

- `SOURCE_UNAVAILABLE`:
    - `true` for a failure that may pass: an error with a network code (`ECONNRESET`, `ETIMEDOUT`
      and the like), the source's time limit, a backend's 429, 502, 503 or 504, a `SourceError`
      marked `transient`, or too many loads of the source running.
    - `false` for any other error: the backend refused this server's access or answered another status
      such as 500, a source not set up correctly, an error of a code source's `load` without a
      network code, or a [print template](print-template.md) the server cannot read.
- `NOT_ALLOWED`, `INVALID_INPUT` and `DATA_NOT_AVAILABLE` from a source: `false`. These come from a
  code source's `SourceError`, or from an HTTP source's backend that answered 400 or 422, or 401,
  403 or 404 for a source with parameters.
- `UPLOAD_FAILED`: as the store's failure is.
- 503 `BUSY` for a [large body](#data) while two are read already, for a parameter's pattern that
  could not be checked in time, or for a [rows request](records.md#records-limits) beyond the limit: `true`.

Every other error carries no `retryable`. This includes a limit of a source's settings
(`LIMIT_EXCEEDED`, `http.maxBytes` or `http.maxPages`).

```json
{ "type": "https://pivotkit.eize.dev/reference/rest/#error-source-unavailable", "title": "Source unavailable",
  "status": 502, "code": "SOURCE_UNAVAILABLE", "detail": "the source is not available right now; if it stays so, give the operator the request id",
  "requestId": "Ab3_xY9-k2Q", "retryable": true }
```

Rows go by status, then by code. The answers of the download links come last.

| Status | Code | When |
| --- | --- | --- |
| 400 | <a id="error-invalid-input"></a>`INVALID_INPUT` | The body is not valid JSON, is no JSON object, or does not fit the route's schema (an unknown key, a wrong type, nested deeper than 64 levels, also inside a view given as JSON text) |
| 401 | <a id="error-invalid-token"></a>`INVALID_TOKEN` | No token, an unknown or expired one, another scheme, a token in the address |
| 403 | <a id="error-files-not-allowed"></a>`FILES_NOT_ALLOWED` | A `file:` source |
| 403 | <a id="error-forbidden-host"></a>`FORBIDDEN_HOST` | A `Host` the server does not answer to (DNS rebinding protection; `http.allowHosts`, `http.publicUrl`) |
| 403 | <a id="error-forbidden-origin"></a>`FORBIDDEN_ORIGIN` | A browser origin not in `rest.cors.origins` |
| 403 | <a id="error-insufficient-scope"></a>`INSUFFICIENT_SCOPE` | The token lacks a scope the service or the operation needs |
| 403 | <a id="error-not-allowed"></a>`NOT_ALLOWED` | The file route without `results: true`; `inline:` data from a caller without `data: true`; a code source that refuses the caller (its `SourceError`); `save: false` where the result may not come back inline; the [rows route](records.md#records) for a caller without a person or the right, or for a field below `show` (with `notShown`) |
| 404 | <a id="error-data-not-available"></a>`DATA_NOT_AVAILABLE` | A code source has no data the caller may see for these values (its own `SourceError`, [code sources](code-sources.md#code-errors)); an HTTP source's backend answered 401, 403 or 404 for the values given ([HTTP sources](sources.md#http-errors)) |
| 404 | <a id="error-file-not-available"></a>`FILE_NOT_AVAILABLE` | The source's file is missing or changed while read |
| 404 | <a id="error-not-found"></a>`NOT_FOUND` | No such route. With REST on, the `detail` names the REST service and the OpenAPI document |
| 404 | <a id="error-source-not-found"></a>`SOURCE_NOT_FOUND` | No such source, or one the caller lacks the scopes for |
| 405 | <a id="error-method-not-allowed"></a>`METHOD_NOT_ALLOWED` | GET for a POST route or the other way round (`Allow` names the method) |
| 409 | <a id="error-no-link"></a>`NO_LINK`, <a id="error-not-schedulable"></a>`NOT_SCHEDULABLE` | A link for a source without a page; a schedule over a source that cannot have one: a `file:` source, data sent in the request, a source with a token exchange or a parameter bound to a claim ([backend sign-in](sources.md#http-claims)) |
| 409 | <a id="error-no-output"></a>`NO_OUTPUT` | No output directory for a file, the directory not writable by the server's user, or full where the server deletes nothing (it holds the operator's own files) |
| 413 | <a id="error-body-too-large"></a>`BODY_TOO_LARGE`, <a id="error-limit-exceeded"></a>`LIMIT_EXCEEDED` | The body over 2 MiB (over `rest.data.maxBytes` for a caller that may send data); a file, the data sent, a view or the work over a limit; with `save: false`, a result over the `inline` limits; [rows](records.md#records-limits) over `rest.records` |
| 415 | <a id="error-unsupported-media-type"></a>`UNSUPPORTED_MEDIA_TYPE`, <a id="error-unsupported-format"></a>`UNSUPPORTED_FORMAT` | A POST whose `Content-Type` is not `application/json` (curl's `-d` alone sends a form) nor, where data may be sent, `multipart/form-data`; a file sent in no data format; a source file in no data format |
| 422 | <a id="error-data-mismatch"></a>`DATA_MISMATCH` | [Data sent in the request](#data) whose `rowCount` differs from the rows sent, or a file whose SHA-256 differs from `sha256` |
| 422 | <a id="error-invalid-file"></a>`INVALID_FILE`, <a id="error-not-regular-file"></a>`NOT_REGULAR_FILE`, <a id="error-hard-link"></a>`HARD_LINK`, <a id="error-invalid-template"></a>`INVALID_TEMPLATE` | The source's file cannot be used, or its print template (`sources.<id>.template` or `output.template`, a [print template](print-template.md) whose `--pk-*` colours reach the chart, [options](mcp.md)) holds what the parser refuses |
| 422 | <a id="error-view-has-errors"></a>`VIEW_HAS_ERRORS` | The file route for a view with errors (with `findings`) |
| 429 | <a id="error-rate-limited"></a>`RATE_LIMITED` | A [limit](#limits) |
| 500 | <a id="error-internal"></a>`INTERNAL` | Anything else. The details are only in the log, with `--log debug` |
| 502 | <a id="error-source-unavailable"></a>`SOURCE_UNAVAILABLE` | A code or HTTP source's load failed, took longer than its `timeMs` or has too many loads running. An html render whose print template the server cannot read. `detail` is one of pivotkit's fixed texts: not available right now, the source's backend refused this server's access, the source is not set up correctly, or the server's print template is not available now. `retryable` says whether trying again may work ([HTTP sources](sources.md#http-errors)) |
| 502 | <a id="error-upload-failed"></a>`UPLOAD_FAILED` | The report was made but could not be stored in the [operator's store](delivery.md#upload) (`retryable` says whether trying again may help); the report stays in the output directory |
| 503 | <a id="error-busy"></a>`BUSY`, <a id="error-not-ready"></a>`NOT_READY`, <a id="error-auth-not-ready"></a>`AUTH_NOT_READY` | No worker free, two [large bodies](#data) read already, a parameter's pattern not checked in time, or too many [rows requests](records.md#records-limits); starting or stopping; the OAuth issuer not loaded yet |
| 504 | <a id="error-timeout"></a>`TIMEOUT` | A report over `compute.timeMs` |
| 400, 403, 409, 410, 503 | <a id="error-link-expired"></a>`LINK_EXPIRED`, <a id="error-link-used"></a>`LINK_USED`, <a id="error-link-not-yours"></a>`LINK_NOT_YOURS`, <a id="error-sign-in-failed"></a>`SIGN_IN_FAILED`, <a id="error-sign-in-not-ready"></a>`SIGN_IN_NOT_READY` | Answers of the server's own [download links](delivery.md#answers) (`/downloads/`), not of `/api/v1` |

## Headers of every answer { #headers }

Every answer of `/api/v1` carries these headers, errors included. The one exception is the answer
to a CORS preflight (`OPTIONS`), which carries no body:

| Header | Value | Why |
| --- | --- | --- |
| `Cache-Control` | `no-store` | No proxy or browser keeps an answer. The [rows](records.md#records) are a person's |
| `X-Content-Type-Options` | `nosniff` | A browser takes the type as sent |
| `Referrer-Policy` | `no-referrer` | No address leaves with a link |
| `X-Request-Id` | the request's id | The same id as `requestId` and the [log lines](#logging) |
| `Content-Type` | `application/json`, or `application/problem+json` for an error | A download has its format's type ([downloads](#downloads)) |

For an origin in `rest.cors.origins` every answer adds `Access-Control-Allow-Origin` and
`Vary: Origin` ([CORS](#cors)). A 429 and a 503 add `Retry-After`. A 401 adds `WWW-Authenticate`.

## The OpenAPI document { #openapi }

A running server serves its OpenAPI 3.1 document at the server's root, not under `/api/v1`. For a
server at `https://reports.example.com` the address is `https://reports.example.com/openapi.json`.
On your machine it is `http://127.0.0.1:3333/openapi.json`. A 404 and `check-config` name this full
address when `http.publicUrl` is set. Without it, they say that the document sits at the root.

The document has the server's own origin (`http.publicUrl`) and sign-in: bearer for tokens, the
issuer's OAuth endpoints, and the scopes per operation as `x-pivotkit-scopes`.

- By default, only signed-in callers get it (`rest.openapi: "auth"`).
- `"public"` serves it to anyone.
- `"off"` serves it to nobody.

The view's JSON Schema ([view-2.json](view-file.md)) is bundled into the document, so a client
fetches nothing else. The document of a server with static tokens is also published at
[pivotkit.eize.dev/openapi.json](https://pivotkit.eize.dev/openapi.json).

The server generates the document from the operation table and the schemas it presents, the same
ones the MCP tools have, so routes, docs and checks cannot drift apart. `/api/v1` changes only with a
breaking change of the operations' contracts, which is a breaking change for MCP too.
`info.version` is pivotkit-server's.

## Running it { #running }

`pivotkit-server` is one command for the REST service, the MCP server and the command line. The
[container image](container.md) runs them the same way ([on Kubernetes](../getting-started/kubernetes.md)):

| Command | What it does |
| --- | --- |
| `pivotkit-server serve [flags]` | HTTP on one port: `/api/v1`, `/openapi.json` at the root, and with pivotkit-mcp installed `/mcp` and its quick-start page. Always `/healthz` and `/readyz` |
| `pivotkit-server check-config [flags]` | Whether `serve` would start and what it would expose, then exit. It shows the sources, each field's level and why, the fields the automatic values rule gives or would give `values`, delivery, auth, profiles and REST settings. Exit 1 when it finds a problem, whether or not the server would start with it ([reading it](#check-config)). A policy rule that names no column of the data is a warning (exit 0), with the name probably meant |
| `pivotkit-server check-source <id> [--param name=value ...] [flags]` | Load an [HTTP source](sources.md#check-source) once as the server would. It shows each page's status, content type and size, the rows, the fields with their types (never a value), when the data is from, and what a caller would get when it fails. Exit 1 when it fails, 2 when the id names no HTTP source |
| `pivotkit-server source-from-openapi <file or https URL> --operation <operationId or "GET /path"> [--id <id>] [--backend <name>]` | Propose an [HTTP source](sources.md#openapi) from one GET operation of an OpenAPI document (JSON). The block goes to stdout, what you must check and decide to stderr. The values you must fill in say `TODO`, and the server refuses them until you do. Exit 2 when the operation cannot be a source |
| `pivotkit-server mcp [flags]` | [pivotkit-mcp](mcp.md)'s runner (stdio by default) |
| `pivotkit-server cli <command> ...` | The [command line](cli.md) `pivotkit`, when pivotkit-cli is installed beside pivotkit-server. The container image has it. Without it, exit 2 with "npm install pivotkit-cli" (or `--global` for a global install) |
| `pivotkit-server healthcheck [url] [--port <port>]` | Exit 0 when `GET /healthz` answers, else 1, also for a usage error such as a url and `--port` together. Without a url it asks `http://127.0.0.1:<port>/healthz`. The port: `--port`, then `http.port` of `$PIVOTKIT_CONFIG`'s file, then `$PIVOTKIT_PORT`, then 3333 |
| `pivotkit-server token new [--file <path>] [--config <file> --add]` | Make a static token: on stdout, or into a file with mode 0600, and with `--add` into `auth.tokens` ([tokens and keys](tokens.md#credentials)) |
| `pivotkit-server token show <name>` | Print the value of a token of `auth.tokens`, as the server reads it. Exit 1 when it is missing or cannot be used, 2 for a name that is not there |
| `pivotkit-server token issue [--expires 1h] [--name <n>] [--profile <p>] [--scope <s>]` | Issue a [signed token](tokens.md#signed-tokens) that expires |
| `pivotkit-server token list` | List every token: ID, name, kind, profile, expiry and status, never a value ([list, revoke, remove](tokens.md#token-list)) |
| `pivotkit-server token revoke <id or name>` | Refuse a signed token from the next request on |
| `pivotkit-server token remove <id or name>` | Take a static token out of `auth.tokens`, or revoke a signed one and take it off the list |
| `pivotkit-server key new --for downloads\|audit [--file <path>] [--config <file> --add]` | Make a key for `output.downloads.key` or `audit.key` ([tokens and keys](tokens.md#credentials)) |
| `pivotkit-server key new --for signing`, `key remove <key id> --for signing` | Add or remove a key that signs tokens ([rotation](tokens.md#signed-keys)) |
| `pivotkit-server --version` | The version |

### Reading check-config { #check-config }

`check-config`'s first line says whether the server starts:

- "the server does not start with this configuration"
- "the server starts, but not everything will work"
- "the configuration is valid"

The second line counts problems and warnings. Then come every `PROBLEM` line, every `WARNING` line
named by the section it belongs to, and the sections. The issuer's warnings go under `Auth`, where
the sign-in is.

A `PROBLEM` ends with what it does:

- `-> the server does not start`: what `serve` refuses. That is an output directory it cannot use, a
  static token that is missing or too easy to guess, an address off loopback without auth, an issuer that is
  not https, an `audit.key` that cannot be read or has fewer than 16 characters (OAuth or an
  external issuer, with `audit.subject: hash`), or a print template the parser refuses.
- What does not work while the server runs: a source file that is not there, a backend secret, the
  download key, an upload header's secret, the download links' client secret, an issuer or upload
  target on an address the server refuses, or an output directory the server cannot write.

Any `PROBLEM` exits with 1. A `WARNING` does not change the exit code. An issuer whose metadata
cannot be loaded from where you run it is a warning, with the connection's error (for example
`ENOTFOUND`), since the server starts and keeps trying.

```text
pivotkit-server: the server starts, but not everything will work.
1 problem, 1 warning.

PROBLEM: httpSources.backends.platform.auth.clientCredentials.clientSecret:
    the file secrets/backend-secret cannot be read (no such file) -> the
    server starts; vms answers SOURCE_UNAVAILABLE

WARNING (Auth): the token export's scope "typo:scope" is named by no source,
    tool or required scope

Sources (1):
  no description: vms (a model chooses sources by it: sources.<id>.description)
  values listed per shown field: 20 (policy.items)
  results inline in the tool answer: up to 500 cells (policy.inline)
  vms: an HTTP source, described under HTTP sources
    policy: hide by default; name show, cpu show
    fields: known only after a load (pivotkit-server check-source vms loads
        it)
...
Auth: token
  token export from $PIVOTKIT_TOKEN: all scopes, profile export
```

A configuration with an unknown key, a value of the wrong type or a rule it breaks gets no report.
`check-config` and `serve` print why and exit 2. A number out of its range does not stop the check.
The message names every such number found, one per line. Any other broken rule stops the check
where it finds it:

```text
pivotkit-server: 2 problems in the configuration:
  rest.records.maxRows: from 1 to 10000000
  rest.records.concurrency: from 1 to 64
```

Each line holds one fact. A fact under another is two spaces further in, a wrapped line four. Lines
are wrapped at 78 columns at spaces. A path stands on a line of its own and is never cut, so a long
one makes its line longer.

The output prints the limits and defaults that matter with their values: the exposure limits, the
output directory's size, CORS, where the OpenAPI document is and who may read it. A field's level
says whether it comes from a rule or the default. A secret is named by its variable or by its file,
as written and with its full path, never by its value.

Over stdio (`pivotkit-mcp` without `--http`), there are no download links and no signed-in person.
The `Transport:` section says which sources therefore cannot be used.

"New in this version" names the changes of this release that apply to the configuration, one per
line. Each links to its section of the [upgrading page](../getting-started/upgrading.md).

The flags of `serve` are the [MCP runner's](mcp.md#configuration) without `--http`, `--allow-dir`
and `--list-files`, plus `--enable rest,mcp`. `--enable` sets `http.enable`, what to serve. The
default is REST, and MCP when pivotkit-mcp is installed.

- The configuration file is `--config` or `$PIVOTKIT_CONFIG`.
- The one static token without `auth.tokens` is `$PIVOTKIT_TOKEN`. Set while auth is `none`, it gets
  a warning at start and in `check-config`, over HTTP only: "PIVOTKIT_TOKEN is set but auth is none;
  use --auth token (or auth.mode token)". A written `auth.mode: "none"` gives no warning.
- `$PIVOTKIT_PORT` sets the port when neither the flag nor the file does.
- An unknown flag is a usage error (exit 2) that points to `--help`.

It is one configuration for both endpoints. Only the REST service reads `rest.*`. Only the MCP
endpoint reads `http.allowOrigins` and shows the page of `http.page`. `http.page.url` sends `/` to
your own page on a REST-only server too ([your own name and links](branding.md#page)).

`/healthz` answers `{ "ok": true }` while the process runs. `/readyz` answers 200 when the server can
take work, and 503 otherwise:

- The 200 answer is `{ "ok": true, "checks": { "auth": true, "workers": true, "output": true } }`:
  an OAuth issuer loaded ([of several](sign-in.md#issuers), one), workers up, the output directory
  writable.
- The 503 answer has `reason` in fixed words (`"the OAuth issuer's metadata is not loaded; see the log"`).
- Both name the OAuth issuers not loaded yet in `waiting`, by their option: `["auth.issuer"]` with
  one issuer, `["auth.issuers[1].issuer"]` with several.

Both answer `HEAD` too.

An output directory the server's user cannot write is also a warning at start, a problem in
`check-config`, and 409 `NO_OUTPUT` for a report.

On SIGTERM or SIGINT, the server takes no new connection. It lets running requests finish for up to
`http.graceMs` (25 seconds by default).

Windows has no SIGTERM. There, Ctrl+C stops the server this way, also the Ctrl+C event of a service
manager. CI does not test this stop on Windows.

Closing the console window sends SIGHUP instead. The server does not wait for running requests then,
and Windows ends the process about 10 seconds later at the latest. A forced end of the process, for
example in Task Manager, ends it at once.

| Key | Default | What it is |
| --- | --- | --- |
| `http.enable` | `["rest"]`, plus `"mcp"` when installed | What `serve` serves |
| `http.trustProxy` | false | Read the client's address from `X-Forwarded-For` (the last entry) for the limits and the log's `address` (the proxy is then `peerAddress`) |
| `log.level`, `log.format`, `log.address` | info, auto, on | The log's level, its format (text on a terminal, JSON otherwise) and whether lines name the client's address. Flags `--log`, `--log-format`, `--log-address`. Variables `PIVOTKIT_LOG_LEVEL`, `PIVOTKIT_LOG_FORMAT`, `PIVOTKIT_LOG_ADDRESS` ([operations](operations.md#settings)) |
| `http.maxConnectionsPerAddress` | 32, none with `http.trustProxy` | Connections one address may hold (loopback excepted), counted by the socket's peer. `0` switches the bound off. Raise it where many clients share one address without a proxy, such as an office behind one NAT ([MCP](mcp.md#http) has the details) |
| `http.graceMs` | 25000 | How long a stop waits for running requests |
| `output.create` | true | Make a missing `output.dir` at start, with its parents and mode 0700. When `output.baseUrl` is set, the mode is 0755 narrowed by the umask. The start logs a warning when it makes the directory. `false` makes a missing directory an error. A relative `output.dir` without a configuration file is relative to the working directory. `check-config` says whether the directory exists, will be made, or cannot be made, and why: a parent the server's user may not write, a name too long, a symbolic link loop |
| `output.maxFiles`, `output.maxMb` | 1000, 1024 | Files pivotkit wrote and their MiB (1,048,576 bytes each) the directory may hold, at its top level: reports (`<name>.pivotkit-out.<format>`) and schedule drafts (`<name>.pivotkit-out.report.json`). A new report deletes the oldest reports until it fits, one write at a time. Drafts are counted but never deleted to make room. They may take at most half of `output.maxFiles` and half of `output.maxMb`, and a draft over that answers 409 `NO_OUTPUT`. Files without that mark (the operator's, reports of older versions) are neither counted nor deleted, nor are subdirectories. A file named with the mark by hand counts as pivotkit's. Nothing is deleted where the output directory is the configuration file's directory or holds a source, print template or token file. There a full directory answers 409 `NO_OUTPUT`, and the start warns. With `output.maxAgeDays` written explicitly, the server does not start there |
| `output.maxAgeDays` | 30 | `0`: no age limit. Otherwise the server deletes reports (the files marked `.pivotkit-out.`) and schedule drafts no longer waiting for approval (`.pivotkit-out.report.json` whose `status` is not `"draft"`) older than this many days from the top level of the output directory, at start and every hour. It also deletes the temporary files of writes the server was killed in (`.<name>.pivotkit-out.<format>.<pid>-<random>.tmp`, older than an hour). Other files and subdirectories stay. Use a directory of its own. The server refuses to start with a limit you write when the output directory is the configuration file's directory or holds a source, print template or token file. There the default does not apply (no age limit) |
| `output.draftMaxAgeDays` | 0 (never) | Delete schedule drafts that still wait for approval (`status` `"draft"`) when they are older than this many days, at start and every hour. It works with `output.maxAgeDays: 0` too. Like `output.maxAgeDays`, the server refuses to start with it where the output directory holds the operator's own files |
| `output.template` | built-in | The [print template](print-template.md) of every html report whose source sets none, data sent in the request too. A source's `sources.<id>.template` wins. A missing file fails html reports only, with 502 `SOURCE_UNAVAILABLE` |
| `output.downloads` | on (plain links for open sources) | The server's own [download links](delivery.md): `enabled`, `expiresMinutes` (60), `bind` (`signIn`, `once`, `none`), `key`, `signIn` |
| `output.upload` | none | [Upload to your store](delivery.md#upload): `url` or `presign`, `headers`, `link`, `linkOrigins`, `method`, `timeMs`, `maxBytes`, `keepLocal`, `bind`, `intranet` |
| `rest.openapi` | `"auth"` | Who gets `/openapi.json`, at the server's root |
| `branding.name`, `.docsUrl`, `.icon` | pivotkit's | The name end users see, the base of the documentation links or `null` for none, and an icon ([your own name and links](branding.md)) |

Behind a reverse proxy:

- Forward `/api/v1/`, `/openapi.json`, `/.well-known/oauth-protected-resource/api/v1` and
  `/downloads/`. With MCP, also forward `/mcp`, `/.well-known/` and `/`.
- With `branding.icon`, forward `/icon.png`. With `http.page.url`, forward `/`.
- Keep the `Host` header, or add the proxy's name to `http.allowHosts`.
- Set `http.publicUrl` to the origin people open, such as `https://reports.example.com`.
- `http.publicUrl` takes no path, user name, password, query or fragment. The server serves at the
  root of its host. On a shared host, give pivotkit a host name of its own, such as a subdomain, or
  route the paths above at the root. A prefix such as `/reports` in front of them does not work.
- Set `http.trustProxy` when the proxy adds the client's address to `X-Forwarded-For`. Otherwise
  every client has the proxy's address and shares one count of refused tokens (the [limit](#limits)
  per address).
- Set `http.trustProxy` only when the service is reachable through the proxy alone. A client that
  reaches the server directly can write any `X-Forwarded-For`.
- With `http.trustProxy`, the log names the client's address as `address` and the proxy as
  `peerAddress` ([correlation with the proxy](operations.md#correlation)).
- Let the proxy take bodies of 2 MiB (nginx's default is 1 MiB), or `rest.data.maxBytes` where
  callers [send data](#data).

For nginx:

```nginx
location ~ ^/(api/v1/|openapi\.json$|mcp$|\.well-known/|downloads/|healthz$|readyz$|icon\.png$|$) {
    proxy_pass http://127.0.0.1:3333;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 60s;
    client_max_body_size 2m;
}
```

Without containers, on Windows next to PowerShell Universal, `pivotkit-server serve` runs as a
service with a service manager of your choice. [PowerShell Universal](../getting-started/powershell-universal.md#psu)
has the steps: an account of its own, its file rights, the token from a PSU secret, a rotated log,
and IIS with ARR in front. CI runs the server's tests on Linux, macOS and Windows. Its tests of
file modes, owners, FIFOs, symbolic links and the stop on SIGTERM run on Linux and macOS only.
[#209](https://github.com/eizedev/pivotkit/issues/209) tracks junctions and hard links on Windows.

### Tokens and keys { #credentials }

<span id="credentials-if-missing"></span><span id="credentials-force"></span><span id="credentials-add"></span><span id="token-expires"></span><span id="signed-tokens"></span><span id="signed-keys"></span><span id="external-issuers"></span><span id="token-list"></span><span id="first-start"></span>

[Tokens and keys](tokens.md) has `token new` and `key new`, tokens that expire, signed tokens,
tokens from another system, how to list, revoke and remove tokens, and what the server makes at its
first start.

## Logging { #logging }

The server writes one line per event on stderr, as the [MCP server](mcp.md#logging) does: JSON, or
text on a terminal (`log.format`). Every line has `time`, `level`, `severity`, `event`, `msg`,
`service` and `version`. [Operations and logs](operations.md) lists every field, the levels and how
to ship the log.

| Event | What the line holds |
| --- | --- |
| `started` | Version, address, what it serves, auth mode, the source ids, the log's settings, the static tokens' names |
| `request` | Operation, route, client, `requestId`, `traceId`, the client's `address`, source id, `status`, `outcome`, error code, time in ms. For `inline:` data also the number of rows and columns, or a file's format and bytes |
| `download` | Operation, client, `requestId`, source, format, bytes. For a [download link](delivery.md) also `via: "link"`, its binding, whether it worked and the code, never the token |
| `refused` | A request refused by the Host, Origin or token check, a limit or a body over the cap, with its `requestId` and `reason` |
| `warning` | A problem that does not stop the server |
| `stopped` | Written after a stop |

A request line is `info` when it worked, `warn` for 4xx and 503 `BUSY`, and `error` for other
5xx. `requestId` is random (11 characters). It is the same on every line of one request, in its
answer's body (`requestId`) and in the `X-Request-Id` header of every answer.

The client is the static token's name or the OAuth client id. The person is on `request` and
`download` lines only with `audit.subject` ([audit](mcp.md#logging)). Their groups and other claims
never appear. No line holds a view, a value or a token. A request's line holds no file path. Lines at
start can name the operator's own file paths. The client's address is on a request's lines by
default. It is personal data. `log.address: "off"` leaves it out.

## In your own server { #embed }

`pivotkit-server` is a library too: `createContext` and `createRestHandler` put the REST service into
a server of your own. [In your own server](service-exports.md#embed) has the example.

## PowerShell Universal { #psu }

PSU scripts, endpoints and apps call the REST service with `Invoke-RestMethod`.
[Services next to PowerShell Universal](../getting-started/powershell-universal.md#psu-rest) has
the calls and the setup.

## Security { #security }

See [Security: the REST service](../security.md#rest) for what the service protects against and what
it does not, and [Privacy](../privacy.md) for what an operator decides about the data it serves.
