---
title: pivotkit-server (REST)
description: The pivotkit REST service - routes, the OpenAPI 3.1 document, sign-in with tokens or OAuth 2.1, policy profiles, downloads, CORS, limits, errors as problem details, logging, and embedding pivotkit-server in your own Node server.
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

It needs Node 24 or later. It brings [pivotkit-report](report.md), pivotkit-cli's file handling,
pivotkit-xlsx, ECharts 6.1.0 and jose (for OAuth). It does not bring the MCP SDK.

## Routes { #routes }

Every route is under `/api/v1` and answers JSON. A `GET` route answers `HEAD` too, without the body.
The routes are RPC-style (`POST /views/validate`), one per operation of the
[operation table](report.md#operations), and the [rows route](#records):

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
| `POST /sources/records` | none (REST only) | The rows of a source for a person who signed in, where a profile allows it ([below](#records)) |

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
| `policy.profiles.<name>` | none | A profile: `default` (show, values or summary), `fields`, `items`, `rows`, `counts`, `inline`, `results`, `records` ([rows route](#records)) |
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
shows a field an earlier one holds back.

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

- `columns`, the column names
- `rows`, the rows as lists in the columns' order
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
      token (by its name) or an OAuth client. Programs that share one token, or people who sign in
      through one OAuth client, send one such body at a time between them.
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

A host application can show a live report over a source that only pivotkit-server can reach. Its
backend fetches the rows for the person who opens the page. The page hands them to the components.
This route is off by default. [Record 0015](../decisions/0015-live-rows-for-a-host-page.md) says
why it works this way.

`POST /sources/records` answers the rows of one source:

```bash
curl -s -H "Authorization: Bearer $PERSON_TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"sales","fields":["Region","Sales"]}' \
  https://reports.example.com/api/v1/sources/records
```

```json
{ "columns": ["Region", "Sales"], "types": ["string", "number"], "rowCount": 2,
  "dataAsOf": "2026-11-18T08:00:00Z", "withheld": ["Customer"], "requestId": "Ab3_xY9-k2Q",
  "data": [["North", "South"], [10, 20]] }
```

- `columns`, `types` and `data` are the columnar shape the components take: one array per column.
  pivotkit-core's `encode` reads it as it is.
- A date is ISO text without an offset, such as `2026-11-18` or `2026-11-18T08:30:00`. It means the
  same day and time in every time zone.
- `rowCount` is every row of the source. The policy's `rows: false` and `counts: false` do not
  hide it here, since `data` holds every row anyway.
- `withheld` names the fields at `values` or `summary` for the caller. They are left out.
- `dataAsOf` and `stale` are as on every other route.

The input:

| Key | Required | What it is |
| --- | --- | --- |
| `source` | yes | A source id whose entry in `GET /sources` has `records: true` |
| `params` | no | The source's parameters, as on the other routes |
| `fields` | no | The fields to answer, in this order. Names match without case |
| `view` | no | A view, or its JSON text. Only the fields it uses are answered |

Give `fields` or `view`, not both. Without either, every field at `show` is answered.

The server does not apply a view's filters. Filters are no permission. Every row of the source
leaves, also when the view filters most of them out.

### Turn it on { #records-setup }

1. Give a profile the right, as a list of source ids: `"records": ["sales"]`.
2. Set each field that may leave to `show` for that profile.
3. Bind the profile to people, for example with `auth.groupProfiles` or `auth.defaultProfile`.
4. Run `check-config`. It lists per profile the sources and the fields that would leave.

```json
{
  "sources": { "sales": { "file": "data/sales.csv", "policy": { "fields": { "Customer": "hide" } } } },
  "policy": { "profiles": { "staff": { "records": ["sales"], "fields": { "Region": "show", "Sales": "show" } } } },
  "auth": { "mode": "oauth", "issuer": "https://login.example.com", "resource": "https://reports.example.com/mcp",
    "defaultProfile": "staff" }
}
```

There is no switch for every caller or every source. A source added later stays closed until a
profile names it.

### Who gets rows { #records-who }

Only a person gets rows:

- an OAuth token of the configured issuer with a subject (`auth.subjectClaim`)
- a [token from another system](#external-issuers) with a subject

Everyone else gets 403 `NOT_ALLOWED`: a static token, a signed token, an OAuth token without a
subject, and every caller of a server without sign-in.

A machine's token with a subject cannot be told apart from a person's. Give no such client a
profile with `records`.

A caller whose profile does not name the source gets 403 `NOT_ALLOWED`. A source that does not
exist answers the same. The `detail` names the caller's profile, or says that the caller has none.

`GET /sources` adds `"records": true` to each source the caller may read the rows of.

MCP has no tool for this route. A model gets results, never rows.

### Which fields leave { #records-fields }

Only fields at `show` for the caller leave.

| The request names | Answer |
| --- | --- |
| nothing | every field at `show`; the others in `withheld` |
| fields at `show` only | those fields |
| a field at `values` or `summary` | 403 `NOT_ALLOWED`. `detail` names the fields, `notShown` lists them for programs |
| a hidden field | 400 `INVALID_INPUT`, as for a field that does not exist. Neither is named |
| a view with errors, or one that uses a hidden field | 400 `INVALID_INPUT`. Check the view with `POST /views/validate` |
| a [named view](sources.md#views) by its name | the fields it uses |
| a named view that uses a field at `values` or `summary` | 403 `NOT_ALLOWED`. `detail` and `notShown` name those fields only |
| a named view that uses a hidden field | 400 `INVALID_INPUT`, as for a name that does not exist |

```json
{ "type": "https://pivotkit.eize.dev/reference/rest/#error-not-allowed", "title": "Not allowed",
  "status": 403, "code": "NOT_ALLOWED", "detail": "Team is not at show for you, so its values cannot leave: leave it out, or ask the operator to show it",
  "requestId": "Ab3_xY9-k2Q", "notShown": ["Team"] }
```

Under a profile with `"default": "show"`, a column the data gains later leaves too. `check-config`
warns about such a profile.

### Limits { #records-limits }

The load stays bounded by the server's other limits: `limits.rows`, `limits.fileBytes`,
`http.maxBytes` and `sourceCache.maxMb`. These keys bound what one answer hands out. The smallest
limit wins.

| Key | Default | What it is |
| --- | --- | --- |
| `policy.profiles.<name>.records` | none | The source ids whose rows the profile may read |
| `rest.records.maxRows` | 50000 | The most rows of one answer (1 to 10,000,000) |
| `rest.records.maxCells` | 1000000 | The most values of one answer: rows times fields (1 to 100,000,000) |
| `rest.records.concurrency` | 1 | Rows requests at once over all callers, one per person (1 to 64). Keep it below `compute.workers` (default 2) |
| `rest.records.idleMs` | 30000 | A reader that reads nothing for this long loses its place (1000 to 600000) |
| `rest.records.writeMs` | 10000, at most `compute.timeMs` | A reader that has not read the whole answer within this time loses its place (1000 to 600000, not above `compute.timeMs`) |
| `sources.<id>.records.maxRows` | `rest.records.maxRows` | A lower row limit for one source. It cannot be higher than the server's |

The defaults are a first guess. Real row counts will set them better.

- Over a row or cell limit, the answer is 413 `LIMIT_EXCEEDED`, for example "this source has too
  many rows to open here (60,000, the limit is 50,000); filter it with a parameter or ask the
  operator". Where the policy hides the row count (`rows: false`), the message leaves the count out.
- The server checks the fields and the limits before it writes the first byte.
- Beyond `concurrency`, or for a second request of the same person, the answer is 503 `BUSY` with
  `Retry-After` and `retryable: true`.
- With the default of 1, the route serves one person at a time. A slow reader keeps the others at
  503 `BUSY` for up to `writeMs`. A source that loads slowly keeps them there while it loads, up to
  its own time limit and `compute.timeMs`. The place is taken before the load, so at most
  `concurrency` loads hold data at once. Raise `concurrency` and `compute.workers` together for
  more people at once.
- `writeMs` cuts an honest reader on a slow link too. The default answer of 50,000 rows is about
  4 MiB ([sizing](#records-sizing)), which needs about 3.5 Mbit/s within 10 s.
- `auth.toolScopes` cannot name this route, since it is no operation. `rest.requiredScopes` and the
  source's `scopes` apply.
- The places for [large bodies](#data) count per client, so they are not used here.
- One request holds a [compute worker](mcp.md#configuration) while its answer is written. Keep
  `concurrency` below `compute.workers`, so reports still find a worker. `check-config` warns
  otherwise.
- The whole request, reading and writing, must end within `compute.timeMs`, and the writing within
  `writeMs`. A slow reader's answer is cut off then, and the connection ends without the closing
  bracket.
- The answer has no `Content-Length`. Read it to its end, then parse it.

### A host backend fetches the rows { #records-host }

A page shows a live report over a source that only pivotkit-server can reach, such as an HTTP source
with a token exchange. The page's own backend fetches the rows for the person who opens it. The
page hands them to the report.

The operator sets up pivotkit-server once:

1. A profile names the source in `records`. The fields that may leave are `show` for it.
2. The profile is bound to the people, for example with `auth.defaultProfile` or
   `auth.groupProfiles`.
3. With OAuth, the backend sends the person's access token from your application's own sign-in.
   pivotkit-server must be an intended audience of it: list your application's audience in
   `rest.audience`, beside the REST resource. The token needs the scopes of `rest.requiredScopes`
   and of the source (`sources.<id>.scopes`).
4. Or your application signs a token for the person ([tokens from another
   system](#external-issuers)). Such a token cannot read a source with a token
   exchange.

```json
{
  "rest": { "audience": ["https://reports.example.com/api/v1", "host-app"], "requiredScopes": ["pivotkit"] },
  "policy": { "profiles": { "staff": { "records": ["vms"], "default": "hide", "fields": { "Name": "show", "Cpu": "show" } } } },
  "auth": { "mode": "oauth", "issuer": "https://login.example.com", "resource": "https://reports.example.com/mcp", "defaultProfile": "staff" }
}
```

The backend forwards the answer as text, and the page encodes it:

```js
// the host application's backend, for the signed-in person
const answer = await fetch("https://reports.example.com/api/v1/sources/records", {
    method: "POST",
    headers: { authorization: `Bearer ${personAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ source: "vms", params: { customer: "acme" } })
});
if (!answer.ok) throw new Error((await answer.json()).detail);
// pass the text on as it is: no objects of your own in between
response.setHeader("content-type", "application/json");
response.setHeader("cache-control", "no-store");
response.end(await answer.text());
```

```js
// the page: the columnar answer is what <pivot-report> takes as data
const { columns, types, data } = await (await fetch("/my-app/report-rows")).json();
document.querySelector("pivot-report").data = { columns, types, data };
```

- On an error, the problem's `code` says what to do: 503 `BUSY` means try again after
  `Retry-After` seconds; `notShown` names the fields to leave out.
- An answer that does not parse was cut off (an idle or slow reader, `compute.timeMs`). Ask again.
- A backend short of memory can pipe `answer.body` to its own answer instead of reading the text.
- The answer is the person's rows. Keep `Cache-Control: no-store` on your own answer.
- The page holds every row. The browser is not access control: send only what the person may see.
- The rows' memory: [sizing](#records-sizing).

### What the log says { #records-log }

Every answer that started ends with a `records` line: the source, the rows and columns, the profile,
`client` and `ms`, how long the answer took to read. With `audit.subject` it names the person too.
It never holds a value. An answer cut off has `outcome: "error"` and `reason`: `idle`, `slow` (not
read within `writeMs`), `client` (the reader left), `timeout` or `error`.

### Sizing { #records-sizing }

An answer holds every row of the source. Three places hold it.

- **The browser.** The components encode the rows and compute every view there. The
  [browser benchmark](../concepts/limits.md#measured-in-the-browser) measured about 10 MB for the
  data and 13 MB for the report at 100,000 rows of 9 columns. A rows answer of 50,000 rows takes
  about half of that, as an estimate: it was not measured with the rows route.
- **The host application's server.** It receives the whole answer, then passes it to the page as
  text. Pass it on as text, never as objects of your own: objects of its own language take more
  memory than the text. The answer's size is in the table below.
- **pivotkit-server.** It reads the source as for a report and keeps it in a worker. It writes the
  answer in pieces of about 256 KiB, one piece per read. The main thread holds at most one piece of
  an answer.

Measured in pivotkit-server with `npm run bench:records -w pivotkit-server`. Node 26 on an Apple M4
with 10 cores. A CSV source of 8 columns, the REST handler in one process without sockets, each
answer read to its end. Cold: a fresh server reads the file. Warm: the worker kept the data. RSS
counts the main thread and the workers. The render is a pivot of the same source as csv, through
the [file route](#downloads).

| Rows | Answer | CPU rows, cold / warm | CPU render, cold / warm | RSS rows, cold / warm | RSS render, cold / warm | Main heap rows, warm |
| --- | --- | --- | --- | --- | --- | --- |
| 10,000 | 0.8 MiB | 197 ms / 18 ms | 205 ms / 7 ms | 43 MiB / 11 MiB | 45 MiB / 0 MiB | 0 MiB |
| 50,000 | 4.2 MiB | 427 ms / 61 ms | 403 ms / 7 ms | 101 MiB / 9 MiB | 98 MiB / 1 MiB | 0 MiB |
| 100,000 | 8.3 MiB | 694 ms / 118 ms | 617 ms / 25 ms | 134 MiB / 5 MiB | 142 MiB / 2 MiB | 0 MiB |

- 50,000 rows is the default row limit. The 100,000 row run raised `rest.records.maxRows`.
- Reading the source costs most. Once the worker keeps the data, a rows request costs more CPU in
  pivotkit-server than a render of the same source. The pivoting then happens in the browser.
- The main thread's heap does not grow with the answer.
- These are numbers of one machine and one run. Measure your own data before you raise a limit.

## Sign-in { #auth }

The modes are the [MCP server's](mcp.md#auth), from the same `auth` settings:

| Mode | How | 401 answers with |
| --- | --- | --- |
| `none` | No check. Loopback only unless `auth.allowUnauthenticated` | - |
| `token` | `Authorization: Bearer <token>`: `$PIVOTKIT_TOKEN`, named tokens in `auth.tokens` (from a variable or a file read on every request), a [signed token](#signed-tokens) the server issued, or a [token from another system](#external-issuers) | `WWW-Authenticate: Bearer realm="pivotkit"` |
| `oauth` | A JWT access token of the issuer for the REST resource | `WWW-Authenticate: Bearer error="invalid_token", ..., resource_metadata="..."` |

The server reads only the `Authorization` header. It refuses a token in the address
(`?access_token=`), two `Authorization` headers, Basic and cookies. Static tokens and their scopes
work on both endpoints.

With OAuth, the REST service is a protected resource of its own:

- Its resource is `rest.resource`. The default is the origin of `auth.resource` with `/api/v1`, for
  example `https://reports.example.com/api/v1`.
- Its metadata ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)) is at
  `/.well-known/oauth-protected-resource/api/v1`.
- A token must carry its audience. REST refuses a token issued for the MCP endpoint, and the MCP
  endpoint refuses one issued for REST.
- `auth.audience` applies to `/mcp` only. REST checks `rest.audience`.
- A REST caller may hold a token issued to another application. Providers such as Authentik put
  that application's client ID into `aud`. List that client ID in `rest.audience`, as for the
  [command line's](#sign-in-cli-operator) client ID.
- `rest.audience` replaces the default. Keep `rest.resource` in the list if tokens issued for it
  should still work:
  `"rest": { "audience": ["https://reports.example.com/api/v1", "<other client id>"] }`.
- The issuer's settings are the MCP endpoint's ([OAuth 2.1](mcp.md#oauth)), including
  `auth.intranet` for an issuer on a private address.
- `auth.mode: "oauth"` needs `auth.resource`, also when only REST is on. `rest.resource` takes its
  default from it.

A token without the required scopes gets 403 `INSUFFICIENT_SCOPE` with
`WWW-Authenticate: Bearer error="insufficient_scope", scope="..."` naming them.

A person whose token does not carry their groups gets 403 `NOT_ALLOWED` without a challenge, since
signing in again with more scopes would not help. This applies with `auth.groupProfiles` and no
`auth.defaultProfile` ([groups](mcp.md#groups)). The `refused` log line of a 403 for groups names
the client.

The metadata lists the required scopes, and the sources' scopes with `auth.offerSourceScopes: true`
([which scopes](mcp.md#scopes)). An empty `GET /sources` for a token without the sources' scopes has
a `hint`.

Set `auth.requireTyp: "at+jwt"` where the provider marks its access tokens so (RFC 9068). The server
then refuses an ID token with the right audience.

The output directory holds at most `output.maxFiles` files and `output.maxMb` MiB that
pivotkit wrote. When it is full, a new report deletes the oldest reports, whoever made them, so any
token that may render can push other callers' older reports out. A link to such a report
(`output.baseUrl`) then answers 404, and one of the server's own links answers 410 `LINK_EXPIRED`.

Schedule drafts are never deleted this way. They may take at most half of `output.maxFiles` (none at
1) and half of `output.maxMb`. A draft over that answers 409 `NO_OUTPUT`, while reports keep
working. `output.maxAgeDays` does not delete a draft that waits for approval either.
`output.draftMaxAgeDays` does, where you set it. So give `draft_schedule` a scope of its own too,
and remove the drafts nobody approved. A file you name with `.pivotkit-out.` yourself counts as
pivotkit's and may be deleted.

A quota per caller was the other choice. It was not taken because a caller is no stable owner: with
auth `none` every caller is the same, and files written before a restart have none. The directory
would also still need a total that, once reached, refuses everyone again. So:

- Set `output.maxFiles` well above what your callers render between two clean-ups.
- Give `render_view` a scope of its own (`auth.toolScopes`) when not every caller needs it.
- Keep the per-caller rate limit ([limits](#limits)).
- Keep `output.maxAgeDays` on (30 days by default).
- Run one server process per output directory, since the count is kept within a process.

When the server is killed during a write, the write leaves its temporary file
(`.<name>.pivotkit-out.<format>.<pid>-<random>.tmp`). The server neither counts it nor deletes it to
make room. With `output.maxAgeDays: 0`, it stays until you remove it.

The server holds at most 256 connections. It keeps 16 of them for loopback clients, such as the
health check or a proxy on the same host. A client has 5 seconds to send its headers
([MCP](mcp.md#http) has the details). One address may hold at most 32 connections
(`http.maxConnectionsPerAddress`). With `http.trustProxy` there is no such bound by default. On a
network you do not trust, put a reverse proxy in front.

With `auth.mode: oauth` and neither required scopes nor `auth.toolScopes`, the start warns. Any token
of the issuer for the REST audience then gets everything its profile allows.

Scopes per operation (`auth.toolScopes`, for example `{ "render_view": ["pivotkit:render"] }`) and
per source (`sources.<id>.scopes`) hold as for MCP. A source the caller may not use answers as a
missing one (404 `SOURCE_NOT_FOUND`).

| Key | Default | What it is |
| --- | --- | --- |
| `rest.resource` | origin of `auth.resource` + `/api/v1` | The REST service's resource (OAuth) |
| `rest.audience` | `[rest.resource]` | The `aud` values a REST token may carry |
| `rest.requiredScopes` | `auth.requiredScopes` | Scopes every REST call needs |
| `rest.signIn.clientId` | none | The public client `pivotkit login` signs in with, published in the metadata (OAuth only). Not `output.downloads.signIn.clientId` |

## Sign in from the command line { #sign-in-cli }

With `auth.mode: oauth`, a person gets a REST token from the sign-in provider with a code in the
browser. This is the OAuth 2.0 device authorization grant
([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)). The token goes from the provider to the
person. The server takes no part in the sign-in. It only publishes its metadata.

=== "pivotkit"

    ```bash
    pivotkit login --url https://reports.example.com/api/v1
    pivotkit token | sed 's/^/Authorization: Bearer /' | curl -H @- https://reports.example.com/api/v1/sources
    ```

    curl reads the header from stdin (`-H @-`), so the token is in no argument. Other users of the
    machine can read arguments in the process list.

=== "PowerShell"

    ```powershell
    pivotkit login --url https://reports.example.com/api/v1
    Invoke-RestMethod https://reports.example.com/api/v1/sources -Headers @{ Authorization = "Bearer $(pivotkit token)" }
    ```

`pivotkit login` prints an address and a code. Open the address, enter the code and sign in.
It takes the client ID the server publishes. Where the server publishes none, give it with
`--client-id`.
`pivotkit token` then prints a fresh access token whenever you need one.
[pivotkit-cli](cli.md#sign-in) describes both commands and where they keep the refresh token.

### What the operator sets up { #sign-in-cli-operator }

1. Create a client at the provider for the command line:
    - It is a public client. `pivotkit login` sends no client secret.
    - It may use the device authorization grant.
    - It may get refresh tokens. Authentik and Entra ID give one only with the scope `offline_access`.
2. Make its access tokens fit the REST service, as for any other client ([Sign-in](#auth)):
    - their `aud` is in `rest.audience`
    - they carry `rest.requiredScopes`
3. Publish the client ID, so users need only the server's address:

    ```json
    { "rest": { "signIn": { "clientId": "pivotkit-cli" } } }
    ```

    The server then names it in its metadata as `pivotkit_client_id`, next to the fields of
    [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728). `check-config` shows it.
    The field is pivotkit's own extension, which other clients ignore. RFC 9728 says in section 2:
    "Additional protected resource metadata parameters MAY also be used." Section 3.2 adds: "any
    metadata parameters that are not understood MUST be ignored."
    Without the setting, tell the users the client ID. They pass it with `--client-id` or
    `PIVOTKIT_CLIENT_ID`. Either pins the ID: `login` then never takes the published one.
    This client is not the browser client of a download link's sign-in
    ([`output.downloads.signIn.clientId`](delivery.md#configuration)).

!!! warning "Publish a public client only"

    Anyone can read the metadata, without a token. Publish only a public client: one the provider
    lets sign in without a secret. A client with a secret does not work with `pivotkit login`, and
    its ID tells others which client to attack. The setting has no field for a secret.

The command line asks for the scopes in the server's metadata. It adds `offline_access` when the
provider lists it or lists no scopes. `--scope` replaces both.

=== "Authentik"

    - Its discovery names the device endpoint
      ([source](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/providers/oauth2/views/provider.py)).
    - Set a **Device code flow** on the brand. Without it, Authentik offers no device code
      ([device code flow](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/device_code/),
      [brands](https://docs.goauthentik.io/customize/branding/)).
    - The device endpoint is `/application/o/device/`, the same for every application.
      The issuer stays the application's: `https://auth.example.com/application/o/<slug>/`
      ([OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)).
    - Add the `offline_access` scope mapping to the provider. Without it, there is no refresh
      token ([OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)).
    - Authentik puts the client ID into `aud`. List the command line's client ID in `rest.audience`.
      Keep `rest.resource` in the list if tokens issued for it should still work
      ([Sign-in with Authentik](../getting-started/kubernetes.md#oauth)).

=== "Keycloak"

    - Under **Capability config**, turn on the device authorization grant
      ([client settings](https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/clients/oidc/con-basic-settings.adoc)).
      Turn off client authentication, which makes it a public client.
    - The device endpoint is `/realms/<realm>/protocol/openid-connect/auth/device`. The realm's
      discovery names it only while the device flow feature of the server is on
      ([source](https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/OIDCWellKnownProvider.java)).
    - Keycloak returns refresh tokens by default
      ([server administration guide](https://www.keycloak.org/docs/latest/server_admin/index.html)).
      When the realm lists `offline_access`, `pivotkit login` asks for it too. Give `--scope`
      without it if users should not get that scope.
    - An **Audience** mapper puts the REST resource into `aud`
      ([audience support](https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/clients/oidc/con-audience.adoc)).

=== "Microsoft Entra ID"

    - The device code endpoint is `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/devicecode`
      ([device code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)).
      The server's issuer names the tenant, as for the [MCP endpoint](mcp.md#oauth).
    - Set **Allow public client flows** to **Yes** under the app registration's advanced settings
      ([desktop app registration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration)).
    - Ask for the API's `.default` scope and `offline_access`:
      `--scope "api://<application id>/.default offline_access"`
      ([scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc)).
      Entra gives a refresh token only with `offline_access`.
    - Set `requestedAccessTokenVersion` to `2` in the API's manifest. Its tokens then have the issuer
      `https://login.microsoftonline.com/<tenant id>/v2.0`
      ([manifest](https://learn.microsoft.com/en-us/entra/identity-platform/reference-app-manifest)).
    - A Conditional Access policy can block the device code flow. Microsoft recommends blocking it
      where it is not used. Check your tenant's policies
      ([authentication flows](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-authentication-flows)).
    - A person in more than 200 groups gets no `groups` claim, only a marker
      ([claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference)).
      See [groups](mcp.md#groups).

Labels and defaults change between releases of the providers. These notes follow their
documentation and source code as of November 2026. Decode an access token of your own to see what
your setup issues.

### Without the command line { #sign-in-cli-manual }

The same steps work with curl or PowerShell:

1. Read the server's metadata at `/.well-known/oauth-protected-resource/api/v1`. Check that its
   `resource` is the address you use. Its `authorization_servers` names the issuer.
2. Read the issuer's metadata ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)) at
   `/.well-known/oauth-authorization-server` before the issuer's path. Where that fails, read
   `<issuer>/.well-known/openid-configuration`. Check that its `issuer` is the one the server named.
   It names the `device_authorization_endpoint` and the `token_endpoint`. Both must be https.
3. Post `client_id` and `scope` to the device endpoint. The answer has the `verification_uri`, the
   `user_code`, the `device_code` and the `interval`.
4. Check that the address is on your sign-in provider's site. Open it and enter the code.
5. Post `grant_type=urn:ietf:params:oauth:grant-type:device_code`, the `device_code` and the
   `client_id` to the token endpoint every `interval` seconds:
    - `authorization_pending` (HTTP 400): ask again.
    - `slow_down` (HTTP 400): wait 5 seconds longer from now on.
    - Any other error ends the sign-in.
    - HTTP 200 holds the `access_token`.

The token endpoint answers 400 while it waits. So `curl -f` fails there, and `Invoke-RestMethod`
throws. The scripts below handle that, and they check the addresses as steps 1 and 2 say.

=== "PowerShell"

    Save it as `Get-PivotkitToken.ps1`. It needs no module.

    ```powershell
    <#
    .SYNOPSIS
    Signs in to a pivotkit REST service with a device code and returns an access token.
    .EXAMPLE
    $token = ./Get-PivotkitToken.ps1 -Api https://reports.example.com/api/v1 -ClientId pivotkit-cli
    Invoke-RestMethod "https://reports.example.com/api/v1/sources" -Headers @{ Authorization = "Bearer $token" }
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [uri] $Api,
        [Parameter(Mandatory)] [string] $ClientId,
        [string] $Scope
    )
    $ErrorActionPreference = 'Stop'
    function Assert-Https([string] $Address, [string] $What) {
        if (([uri]$Address).Scheme -ne 'https') { throw "$What is no https:// address: $Address" }
    }
    $base = $Api.AbsoluteUri.TrimEnd('/')
    Assert-Https $base 'The server'
    $resource = Invoke-RestMethod ($Api.GetLeftPart([UriPartial]::Authority) + '/.well-known/oauth-protected-resource' + $Api.AbsolutePath.TrimEnd('/'))
    if ($resource.resource.TrimEnd('/') -ne $base) { throw "The server's metadata is for $($resource.resource), not $base." }
    $issuerName = $resource.authorization_servers[0]
    Assert-Https $issuerName 'The issuer'
    $issuerUri = [uri]$issuerName
    $issuer = $null
    foreach ($at in @(($issuerUri.GetLeftPart([UriPartial]::Authority) + '/.well-known/oauth-authorization-server' + $issuerUri.AbsolutePath.TrimEnd('/')), ($issuerName.TrimEnd('/') + '/.well-known/openid-configuration'))) {
        try { $issuer = Invoke-RestMethod $at -MaximumRedirection 0; break } catch { $issuer = $null }
    }
    if (-not $issuer -or $issuer.issuer -ne $issuerName) { throw "The issuer's metadata cannot be read, or names another issuer." }
    Assert-Https $issuer.device_authorization_endpoint 'The device endpoint'
    Assert-Https $issuer.token_endpoint 'The token endpoint'
    if (-not $Scope) {
        $Scope = (@($resource.scopes_supported | Where-Object { $_ }) + 'offline_access') -join ' '
    }
    $start = Invoke-RestMethod $issuer.device_authorization_endpoint -Method Post -Body @{ client_id = $ClientId; scope = $Scope }
    Assert-Https $start.verification_uri 'The code page'
    Write-Host "Sign in at $($issuerUri.Host). Open $($start.verification_uri) and enter the code $($start.user_code)"
    $interval = if ($start.interval) { [int]$start.interval } else { 5 }
    $deadline = (Get-Date).AddSeconds([int]$start.expires_in)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $interval
        try {
            $body = @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; device_code = $start.device_code; client_id = $ClientId }
            return (Invoke-RestMethod $issuer.token_endpoint -Method Post -Body $body).access_token
        } catch {
            $answer = $_.ErrorDetails.Message | ConvertFrom-Json
            switch ($answer.error) {
                'authorization_pending' { }
                'slow_down' { $interval += 5 }
                default { throw "The sign-in did not finish: $($answer.error)" }
            }
        }
    }
    throw 'The code expired before the sign-in finished.'
    ```

=== "curl"

    It needs [jq](https://jqlang.org/) to read the JSON answers. The device code and the token go to
    curl on stdin (`@-`), never as an argument, since other users of the machine can read arguments
    in the process list.

    ```bash
    set -eu
    API=https://reports.example.com/api/v1
    CLIENT_ID=pivotkit-cli
    https() { case "$1" in https://*) ;; *) echo "$2 is no https:// address: $1" >&2; exit 1 ;; esac; }
    https "$API" "The server"
    ORIGIN=${API%/api/v1}
    PRM=$(curl -fsS "$ORIGIN/.well-known/oauth-protected-resource/api/v1")
    [ "$(echo "$PRM" | jq -r '.resource | rtrimstr("/")')" = "$API" ] || { echo "The server's metadata is for another address" >&2; exit 1; }
    ISSUER=$(echo "$PRM" | jq -r '.authorization_servers[0]')
    https "$ISSUER" "The issuer"
    ISSUER_ORIGIN=$(echo "$ISSUER" | sed -E 's#^(https://[^/]+).*#\1#')
    ISSUER_PATH=${ISSUER#"$ISSUER_ORIGIN"}
    META=$(curl -fsS "$ISSUER_ORIGIN/.well-known/oauth-authorization-server${ISSUER_PATH%/}" || curl -fsS "${ISSUER%/}/.well-known/openid-configuration")
    [ "$(echo "$META" | jq -r .issuer)" = "$ISSUER" ] || { echo "The issuer's metadata names another issuer" >&2; exit 1; }
    DEVICE_URL=$(echo "$META" | jq -r .device_authorization_endpoint); https "$DEVICE_URL" "The device endpoint"
    TOKEN_URL=$(echo "$META" | jq -r .token_endpoint); https "$TOKEN_URL" "The token endpoint"
    SCOPE=$(echo "$PRM" | jq -r '(.scopes_supported // []) + ["offline_access"] | join(" ")')
    START=$(curl -fsS -d "client_id=$CLIENT_ID" --data-urlencode "scope=$SCOPE" "$DEVICE_URL")
    https "$(echo "$START" | jq -r .verification_uri)" "The code page"
    echo "$START" | jq -r --arg host "${ISSUER_ORIGIN#https://}" '"Sign in at \($host). Open \(.verification_uri) and enter the code \(.user_code)"'
    INTERVAL=$(echo "$START" | jq -r '.interval // 5')
    while :; do
      sleep "$INTERVAL"
      ANSWER=$(echo "$START" | jq -j .device_code | curl -sS -d grant_type=urn:ietf:params:oauth:grant-type:device_code \
        -d "client_id=$CLIENT_ID" --data-urlencode device_code@- "$TOKEN_URL")
      case "$(echo "$ANSWER" | jq -r '.error // "done"')" in
        done) break ;;
        authorization_pending) ;;
        slow_down) INTERVAL=$((INTERVAL + 5)) ;;
        *) echo "The sign-in did not finish: $(echo "$ANSWER" | jq -r .error)" >&2; exit 1 ;;
      esac
    done
    echo "$ANSWER" | jq -r '"Authorization: Bearer \(.access_token)"' | curl -fsS -H @- "$API/sources"
    ```

Both scripts keep no refresh token. Run them again when the access token expires, or use
`pivotkit login`, which keeps the refresh token for you.

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

The [rows route](#records-limits) has limits of its own (`rest.records`).

Over a limit, the answer is 429 `RATE_LIMITED` with `Retry-After`. The MCP endpoint has the same
limits with counts of its own (`mcp.rateLimit`, `mcp.concurrency`, see [MCP](mcp.md#configuration)).

- The server checks a token once per request.
- The counts live in the memory of one process. Two instances behind a load balancer count on their
  own.
- The address is the socket's, or with `http.trustProxy` the last one in `X-Forwarded-For`.

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
  could not be checked in time, or for a [rows request](#records-limits) beyond the limit: `true`.

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
| 403 | <a id="error-not-allowed"></a>`NOT_ALLOWED` | The file route without `results: true`; `inline:` data from a caller without `data: true`; a code source that refuses the caller (its `SourceError`); `save: false` where the result may not come back inline; the [rows route](#records) for a caller without a person or the right, or for a field below `show` (with `notShown`) |
| 404 | <a id="error-data-not-available"></a>`DATA_NOT_AVAILABLE` | A code source has no data the caller may see for these values (its own `SourceError`, [code sources](sources.md#code-errors)); an HTTP source's backend answered 401, 403 or 404 for the values given ([HTTP sources](sources.md#http-errors)) |
| 404 | <a id="error-file-not-available"></a>`FILE_NOT_AVAILABLE` | The source's file is missing or changed while read |
| 404 | <a id="error-not-found"></a>`NOT_FOUND` | No such route |
| 404 | <a id="error-source-not-found"></a>`SOURCE_NOT_FOUND` | No such source, or one the caller lacks the scopes for |
| 405 | <a id="error-method-not-allowed"></a>`METHOD_NOT_ALLOWED` | GET for a POST route or the other way round (`Allow` names the method) |
| 409 | <a id="error-no-link"></a>`NO_LINK`, <a id="error-not-schedulable"></a>`NOT_SCHEDULABLE` | A link for a source without a page; a schedule over a source that cannot have one: a `file:` source, data sent in the request, a source with a token exchange or a parameter bound to a claim ([backend sign-in](sources.md#http-claims)) |
| 409 | <a id="error-no-output"></a>`NO_OUTPUT` | No output directory for a file, the directory not writable by the server's user, or full where the server deletes nothing (it holds the operator's own files) |
| 413 | <a id="error-body-too-large"></a>`BODY_TOO_LARGE`, <a id="error-limit-exceeded"></a>`LIMIT_EXCEEDED` | The body over 2 MiB (over `rest.data.maxBytes` for a caller that may send data); a file, the data sent, a view or the work over a limit; with `save: false`, a result over the `inline` limits; [rows](#records-limits) over `rest.records` |
| 415 | <a id="error-unsupported-media-type"></a>`UNSUPPORTED_MEDIA_TYPE`, <a id="error-unsupported-format"></a>`UNSUPPORTED_FORMAT` | A POST whose `Content-Type` is not `application/json` (curl's `-d` alone sends a form) nor, where data may be sent, `multipart/form-data`; a file sent in no data format; a source file in no data format |
| 422 | <a id="error-data-mismatch"></a>`DATA_MISMATCH` | [Data sent in the request](#data) whose `rowCount` differs from the rows sent, or a file whose SHA-256 differs from `sha256` |
| 422 | <a id="error-invalid-file"></a>`INVALID_FILE`, <a id="error-not-regular-file"></a>`NOT_REGULAR_FILE`, <a id="error-hard-link"></a>`HARD_LINK`, <a id="error-invalid-template"></a>`INVALID_TEMPLATE` | The source's file cannot be used, or its print template (`sources.<id>.template` or `output.template`, a [print template](print-template.md) whose `--pk-*` colours reach the chart, [options](mcp.md)) holds what the parser refuses |
| 422 | <a id="error-view-has-errors"></a>`VIEW_HAS_ERRORS` | The file route for a view with errors (with `findings`) |
| 429 | <a id="error-rate-limited"></a>`RATE_LIMITED` | A [limit](#limits) |
| 500 | <a id="error-internal"></a>`INTERNAL` | Anything else. The details are only in the log, with `--log debug` |
| 502 | <a id="error-source-unavailable"></a>`SOURCE_UNAVAILABLE` | A code or HTTP source's load failed, took longer than its `timeMs` or has too many loads running. An html render whose print template the server cannot read. `detail` is one of pivotkit's fixed texts: not available right now, the source's backend refused this server's access, the source is not set up correctly, or the server's print template is not available now. `retryable` says whether trying again may work ([HTTP sources](sources.md#http-errors)) |
| 502 | <a id="error-upload-failed"></a>`UPLOAD_FAILED` | The report was made but could not be stored in the [operator's store](delivery.md#upload) (`retryable` says whether trying again may help); the report stays in the output directory |
| 503 | <a id="error-busy"></a>`BUSY`, <a id="error-not-ready"></a>`NOT_READY`, <a id="error-auth-not-ready"></a>`AUTH_NOT_READY` | No worker free, two [large bodies](#data) read already, a parameter's pattern not checked in time, or too many [rows requests](#records-limits); starting or stopping; the OAuth issuer not loaded yet |
| 504 | <a id="error-timeout"></a>`TIMEOUT` | A report over `compute.timeMs` |
| 400, 403, 409, 410, 503 | <a id="error-link-expired"></a>`LINK_EXPIRED`, <a id="error-link-used"></a>`LINK_USED`, <a id="error-link-not-yours"></a>`LINK_NOT_YOURS`, <a id="error-sign-in-failed"></a>`SIGN_IN_FAILED`, <a id="error-sign-in-not-ready"></a>`SIGN_IN_NOT_READY` | Answers of the server's own [download links](delivery.md#answers) (`/downloads/`), not of `/api/v1` |

## Headers of every answer { #headers }

Every answer of `/api/v1` carries these headers, errors included. The one exception is the answer
to a CORS preflight (`OPTIONS`), which carries no body:

| Header | Value | Why |
| --- | --- | --- |
| `Cache-Control` | `no-store` | No proxy or browser keeps an answer. The [rows](#records) are a person's |
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
| `pivotkit-server cli <command> ...` | The [command line](cli.md) `pivotkit` |
| `pivotkit-server healthcheck [url] [--port <port>]` | Exit 0 when `GET /healthz` answers, else 1, also for a usage error such as a url and `--port` together. Without a url it asks `http://127.0.0.1:<port>/healthz`. The port: `--port`, then `http.port` of `$PIVOTKIT_CONFIG`'s file, then `$PIVOTKIT_PORT`, then 3333 |
| `pivotkit-server token new [--file <path>] [--config <file> --add]` | Make a static token: on stdout, or into a file with mode 0600, and with `--add` into `auth.tokens` ([tokens and keys](#credentials)) |
| `pivotkit-server token show <name>` | Print the value of a token of `auth.tokens`, as the server reads it. Exit 1 when it is missing or cannot be used, 2 for a name that is not there |
| `pivotkit-server token issue [--expires 1h] [--name <n>] [--profile <p>] [--scope <s>]` | Issue a [signed token](#signed-tokens) that expires |
| `pivotkit-server token list` | List every token: ID, name, kind, profile, expiry and status, never a value ([list, revoke, remove](#token-list)) |
| `pivotkit-server token revoke <id or name>` | Refuse a signed token from the next request on |
| `pivotkit-server token remove <id or name>` | Take a static token out of `auth.tokens`, or revoke a signed one and take it off the list |
| `pivotkit-server key new --for downloads\|audit [--file <path>] [--config <file> --add]` | Make a key for `output.downloads.key` or `audit.key` ([tokens and keys](#credentials)) |
| `pivotkit-server key new --for signing`, `key remove <key id> --for signing` | Add or remove a key that signs tokens ([rotation](#signed-keys)) |
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
  the OAuth issuer loaded, workers up, the output directory writable.
- The 503 answer has `reason` in fixed words (`"the OAuth issuer's metadata is not loaded; see the log"`).

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
service with a service manager of your choice. [PowerShell Universal](../getting-started/mcp.md#psu)
has the steps: an account of its own, its file rights, the token from a PSU secret, a rotated log,
and IIS with ARR in front. CI runs the server's tests on Linux, macOS and Windows. Its tests of
file modes, owners, FIFOs, symbolic links and the stop on SIGTERM run on Linux and macOS only.
[#209](https://github.com/eizedev/pivotkit/issues/209) tracks junctions and hard links on Windows.

### Tokens and keys { #credentials }

`pivotkit-server` makes the secrets the server needs, so you need no other tool. A token is 32
random bytes and a key 48, both in base64url (letters, digits, `-` and `_`).

=== "bash"

    ```bash
    # a token in a file only you can read, added to auth.tokens of pivotkit.json (a backup pivotkit.json.bak first)
    npx -y pivotkit-server token new --file secrets/reports.token --config pivotkit.json --add --name reports
    # the key of the download links
    npx -y pivotkit-server key new --for downloads --file secrets/download.key
    # a token on stdout, for a variable
    export SCRIPTS_TOKEN="$(npx -y pivotkit-server token new)"
    ```

=== "PowerShell"

    ```powershell
    npx -y pivotkit-server token new --file secrets/reports.token --config pivotkit.json --add --name reports
    npx -y pivotkit-server key new --for downloads --file secrets/download.key
    $env:SCRIPTS_TOKEN = npx -y pivotkit-server token new
    ```

    Let the command write the file (`--file`): PowerShell 5.1's `>` writes UTF-16, which the server
    cannot read as a token.

| Option | What it does |
| --- | --- |
| `--file <path>` | Write the value to this file: one line ending in LF, mode 0600, never through a symbolic link, never into a directory that is not there. The value is not printed (`--print` prints it too) |
| `--if-missing` | Keep a file that is there and exit 0, if the server can use its value. Otherwise exit 1. [Below](#credentials-if-missing) |
| `--force` | Replace a file that is there, atomically. [Below](#credentials-force) |
| `--config <file>` | `token new`: check `--profile` against `policy.profiles`, refuse a file inside `output.dir`, and use `http.publicUrl` in the hints. `token new` and `key new` read no configuration without it, not even `$PIVOTKIT_CONFIG`. `token show` reads `$PIVOTKIT_CONFIG` by default |
| `--state-dir <dir>` | `token show`: the server's [state directory](#first-start) (default `$PIVOTKIT_STATE_DIR`). With it, `token show admin` prints the token the server made at its first start, without a configuration. Before that start, it exits 1 (`NOT_CREATED`) and makes nothing. `token show token` prints `$PIVOTKIT_TOKEN` where the server uses it, or `$PIVOTKIT_MCP_TOKEN` where only that one is set (pivotkit-mcp, `pivotkit-server mcp`) |
| `--add` | `token new`: add the token to `auth.tokens` of `--config`. `key new`: name the key as `output.downloads.key` or `audit.key`. Both need `--file`. [Below](#credentials-add) |
| `--name`, `--profile`, `--scope` | The token's name (default: the file's name without extension), its [profile](#profiles) and its scopes (`--scope` once per scope) |
| `--expires <when>` | `token new`: when the token stops working, written as `auth.tokens[].expires`. A date (`2027-01-31` means 00:00 UTC that day), a date-time with a zone (`2027-01-31T08:00:00Z`), or a time from now (`90d`, `12h`, `30m`). [Expiry](#token-expires) |
| `--for downloads\|audit` | `key new`: the key of the [download links](delivery.md) (`output.downloads.key`, at least 32 bytes) or of the [audit](mcp.md#logging) hash (`audit.key`) |
| `--json` | One object on stdout, as [pivotkit's](cli.md): `{ "ok", "exitCode", "command", "name", "file", "created", "replaced", "config", "configured", "backup", "token" or "key", "warnings", "error": { "kind", "code", "message" } }`. It holds the value only where it would be printed |

#### What `--if-missing` does { #credentials-if-missing }

- It reads the file and checks the value by the server's rules. A value it cannot use is exit 1.
- A file of yours that everyone may read loses those bits. It says so.
- A file a group may read keeps that bit, since a group may share it on purpose. It warns you.
- A file of another user than you or root is kept too, with a warning.
- A symbolic link, such as a mounted Kubernetes Secret, is only read through. Nothing behind it is
  changed, and `--print` is refused there. `token show` prints a configured token.
- Several runs at once end with one value.

#### What `--force` does { #credentials-force }

- It writes the new value to a temporary file and renames it over the old one. A reader never sees
  half a value.
- It keeps the old file's owner and group where it may. As root it keeps both. As another user it
  keeps the group when you are in it, and the owner is yours.
- With the old group kept, the group's read bit stays. A write bit never does, nor any bit for
  everyone else.
- It warns you of an owner, group or read bit it could not keep. Then check that the server's user
  can still read the file.
- Clients that still send the old token get 401 from then on. The server reads a token's file on
  every request and the download key within a second, so neither needs a restart.
- A file mounted on its own (a bind mount of one file, a Kubernetes `subPath`) cannot be replaced
  (`MOUNTED`). Change it where it comes from.

#### What `--add` does { #credentials-add }

- It writes `{ "name", "file", "scopes", "profile" }` into `auth.tokens`, or `{ "file" }` as the key.
  The file's path is relative to the configuration when the file lies below it.
- It checks the new configuration first. A name that is there, a key that is set, an unknown
  profile, `auth.mode` `none` or `oauth` stop it before anything is written.
- It sets `auth.mode` to `token` when the file has none, and says so.
- Once `auth.tokens` lists a token, `$PIVOTKIT_TOKEN` is no longer read. The first `--add` warns
  you.
- With `--if-missing`, an entry with the same name, file, scopes and profile counts as done: the
  run exits 0 and writes nothing.
- It keeps the old configuration byte for byte as `<file>.bak-<UTC time>`, one per run, readable by
  you only. Remove old backups when you
  no longer need them.
- It writes the configuration again as pretty-printed JSON. The indentation and the file's mode
  stay. A compact one-line object is spread over lines.
- It reads the configuration, writes the secret's file, then replaces the configuration. Right
  before the replace it reads the configuration again. If someone changed it in between, it does
  not replace it and says so. Run it again with `--if-missing`. This is a best effort, not a lock:
  an edit saved in the moment between that last read and the rename is lost. Do not run `--add`
  while someone edits the file.
- The new configuration keeps the old one's owner and group where it may, as `--force` does. Where
  it cannot (you are not root and not in its group), it is yours and readable by you only, and a
  warning says so: check that the server's user can still read it.
- It refuses a configuration that is a symbolic link (a mounted ConfigMap) or in a folder it
  cannot write.
- Restart the server afterwards: it reads the list of tokens and the audit key at start.

Without `--file`, the value is the only line on stdout. On a terminal, the commands write on stderr
what to add to the configuration and how to try the token with curl, PowerShell and
`claude mcp add --header`.

The exit codes:

- 0 when done.
- 1 for a file that is there, missing or not usable (`EXISTS`, `NOT_REGULAR_FILE`, `NO_DIRECTORY`,
  `READ_ONLY`, `MOUNTED`, `UNUSABLE`).
- 2 for a usage or configuration error.

No message holds a value. These commands, `check-config` and the start say so when a file is in
UTF-16, which is what PowerShell 5.1's `>` writes. They also say so when a token or key file is not a
regular file or is longer than 4096 bytes. They never wait for such a file. When you stop the
command (Ctrl+C) during a write, it removes its temporary file.

On Windows, the mode does not apply: the file takes the permissions of its folder. To keep the file
to your account, run in PowerShell:
`icacls secrets\reports.token /inheritance:r /grant:r "${env:USERNAME}:F"`. This gives full control
to you alone, so `--force` can still replace the file. `/inheritance:r` also takes away SYSTEM and
Administrators. A server that runs as a service then needs its own grant (`/grant "<account>:R"`).

#### When a static token expires { #token-expires }

`auth.tokens[].expires` ends a static token at a date. Add it by hand, or with `token new --expires`.

```json
{ "name": "contractor", "file": "secrets/contractor.token", "expires": "2027-01-31" }
```

- A date alone means 00:00 UTC of that day. A date-time needs a zone (`Z` or `+01:00`).
- From then on, a request with the token gets 401 "this token expired".
- The start logs a warning for a token that has expired.
- `check-config` warns a week ahead, and again once the token has expired.
- The server reads the list of tokens at start. A new `expires` needs a restart.

### Signed tokens { #signed-tokens }

The server can issue tokens that expire on their own. You need no sign-in provider for them.

```bash
pivotkit-server token issue --expires 8h --name laptop --profile staff
docker exec pivotkit pivotkit-server token issue --expires 7d --scope pivotkit:sales
```

The token is printed once, on stdout. It works on REST and MCP at once, without a restart. Only
after you set or change `auth.signedTokens` does the server need a restart, since it reads `auth` at
start.

- It is a JWT signed with Ed25519 (`EdDSA`), of the type `pivotkit+jwt`. Clients send it like any
  bearer token.
- The default lifetime is one hour. `--expires` takes `15m`, `8h`, `7d` or a date.
- `auth.signedTokens.maxDays` caps the lifetime (default 30, at most 365). The server refuses a token
  that lives longer, even with a valid signature.
- `--profile` and `--scope` work as for static tokens. Without `--scope`, it holds every scope.
- A token whose profile is no longer in `policy.profiles` gets 401.
- The log names the token by its ID, never by its value or its name. Rate limits count per token.
- Clocks may differ by `auth.clockTolerance` seconds (default 30), at both ends of the lifetime.
- Signed tokens work with `auth.mode` `"token"` only. A static token is still needed, as for
  `token new`. With a state directory and no `auth.mode` written, the server makes `admin`
  ([first start](#first-start)).
- `--scope` takes one word per scope, without spaces. A token over 2048 characters is refused at
  issue, since the server would not take it: give fewer or shorter scopes.

The files live in `auth.signedTokens.dir`. With a [state directory](#first-start), the default is
`<state>/secrets/signed`. Without either, `token issue` says what to set. The first `token issue`
makes the directory:

| What | Where |
| --- | --- |
| The signing keys, one line each, mode 0600 | `keys/<key id>.key` |
| One record per token: ID, name, key, profile, scopes, issued and expiry. No value | `issued/<id>.json` |
| The deny list, one entry per revoked token | `revoked/<id>.json` |

Keep this directory on a volume, like the other secrets. Never copy it to another server. Every
server signs with the same issuer and no audience, so servers with the same keys take each other's
tokens. Run `pivotkit-server key new --for signing` on each server instead.

The server uses a key file only when it is a file of its own, has mode 0600 and belongs to the user
the server runs as. A planted key therefore never signs. On Windows, mode and owner are not checked.

!!! warning "A key file with a wider mode is skipped"

    A restore with another umask, or some bind mounts, can leave a key file with mode 0640 or 0644.
    The server then skips the key, and every token it signed gets 401. The log and `check-config`
    name the file and the fix: `chmod 600 <file>`. `token list` shows its tokens as `key unusable`.
    A key that should not be there goes with `pivotkit-server key remove <key id> --for signing`.

 `token issue` removes records and entries of
tokens that expired, at most once an hour. `check-config` prints the keys and counts the active and revoked tokens under
`Signed tokens`, once the directory is there.

| Key | Default | What it is |
| --- | --- | --- |
| `auth.signedTokens.dir` | `<state>/secrets/signed` | Where the keys, records and the deny list live. Not inside `output.dir` |
| `auth.signedTokens.maxDays` | 30 | The longest lifetime of a signed token, in days (1 to 365) |

#### Rotating the signing key { #signed-keys }

Every key in `keys/` verifies tokens. The newest key signs new ones. So a new key breaks no client:

1. Run `pivotkit-server key new --for signing`. It prints the new key's ID, never the key.
2. New tokens are signed with it. Tokens of the older key keep working.
3. Once those have expired, run `pivotkit-server key remove <old key id> --for signing`.

`token list` shows a token of a removed key as `key removed`, and one of a skipped key file as
`key unusable`. Both get 401.

`key remove` exits 1 while tokens of that key still work, and names when the last one expires.
`--force` removes it anyway, and those tokens get 401 from the next request on. A key file is never
printed, and `key new --for signing` refuses `--file`, `--print` and `--add`.

### Tokens from another system { #external-issuers }

Another system can issue short-lived tokens for the person signed in there. PowerShell Universal is
one example. The server checks them with that system's public key. It never holds a key that could
make such a token.

The other system is a sign-in provider, not an operator. Its tokens never get more than you allow
it: the scopes and profiles of its entry.

```json
{
  "auth": {
    "mode": "token",
    "externalIssuers": [{
      "issuer": "psu",
      "typ": "psu+jwt",
      "maxMinutes": 15,
      "scopes": ["pivotkit:read"],
      "profiles": ["staff"],
      "profile": "staff",
      "keys": [{ "kid": "psu-2026-11", "publicKey": { "file": "keys/psu.pub" } }]
    }]
  }
}
```

What a token gets:

- **Scopes**: the token's `scope`, cut to the entry's `scopes`. A token without `scope` gets exactly
  `scopes`, never every scope. `scopes` is required. An empty list gives no scope.
- **Profile**: a token may name a profile of the entry's `profiles`. Any other gets 401. Without
  `profiles`, a token may name none.
- A token without `profile` gets the entry's `profile`, else `auth.defaultProfile`. One of the two
  must be set, or the server does not start. The sources' own policy never applies to these tokens.
- `check-config` warns when that default is not in the entry's `profiles`. A token without
  `profile` then gets it, but a token that names it gets 401.

The keys:

- The key is an Ed25519 public key in PEM (`-----BEGIN PUBLIC KEY-----`), from a file or a variable.
  A private key, an encrypted one, another kind of key or a file the server cannot read stops the
  start.
- The server reads the keys at start. A new key takes a restart.
- One or two keys per issuer. Add the new key next to the old one, restart, and remove the old one
  once its tokens have expired.

The rest:

- `issuer` and `typ` belong to that system alone. The server refuses its own `pivotkit-server` and
  `pivotkit+jwt`. It also refuses an `issuer` that names a token in `auth.tokens`, since the log
  names both the same way.
- `maxMinutes` caps a token's lifetime (default 60, at most 1440). A token that lives longer gets
  401, even with a valid signature.
- There is no deny list. A token works until it expires.
- The tokens work with `auth.mode` `"token"` only, on REST and MCP alike.
- At most 8 issuers.

!!! warning "What a leak costs"

    - A leaked token works until its `exp`, at most `maxMinutes`. Nothing revokes it earlier.
    - It carries no audience. Every pivotkit-server that trusts the same key accepts it.
    - A stolen private key of the issuer makes tokens for any person, within the entry's `scopes`
      and `profiles`.

    Keep `maxMinutes` low, for example 15. Give the entry only the scopes and profiles that system
    needs. [Decision record 0014](../decisions/0014-external-token-issuers.md) has the reasons.

A token the server takes is at most 2048 characters long:

| Part | Holds |
| --- | --- |
| header `alg` | `EdDSA` |
| header `kid` | the ID of one of the issuer's keys |
| header `typ` | the issuer's `typ` |
| `iss` | the issuer's `issuer` |
| `sub` | the person: 1 to 256 characters, no spaces, no control, format, surrogate, private-use or unassigned characters. Without it, 401. Compared in Unicode NFC |
| `jti` | the token's ID: letters, digits, `.`, `_` and `-`, at most 128 |
| `iat`, `exp` | when the issuer made it and when it expires, in seconds since 1970 |
| `nbf` | optional: not before this time |
| `profile` | optional: one of the entry's `profiles` |
| `scope` | optional: scopes separated by spaces, cut to the entry's `scopes` |

- The log names the issuer as the client. It names the person only as `audit.subject` says, as for
  OAuth ([logging](#logging)).
- A refused token gets an `info` line with the issuer and the reason, at most once a minute per
  reason. The line never holds the token.
- Each person is an identity of their own for caches and limits: the issuer and `sub` together.
- A link or upload bound to a sign-in (`signIn`) never goes to such a person. They signed in
  elsewhere, so the server's own sign-in cannot check them.
- `check-config` lists each issuer under `External token issuers`: its type, keys, lifetime,
  scopes, profiles and the profile without one. A key it cannot use is a PROBLEM.

| Key | Default | What it is |
| --- | --- | --- |
| `auth.externalIssuers[].issuer` | - | The other system's name, as its tokens carry it in `iss` |
| `auth.externalIssuers[].typ` | - | The type its tokens carry in their header, such as `psu+jwt` |
| `auth.externalIssuers[].keys` | - | One or two keys: `kid` and `publicKey` (`{ "file" }` or `{ "env" }`) |
| `auth.externalIssuers[].scopes` | - | Required. The scopes its tokens may get |
| `auth.externalIssuers[].profiles` | none | The profiles its tokens may name |
| `auth.externalIssuers[].profile` | `auth.defaultProfile` | The profile of a token that names none. This or `auth.defaultProfile` is required |
| `auth.externalIssuers[].maxMinutes` | 60 | The longest lifetime of its tokens, in minutes (1 to 1440) |

### List, revoke and remove tokens { #token-list }

```bash
pivotkit-server token list
pivotkit-server token revoke laptop
pivotkit-server token remove contractor
```

!!! warning "After a leak: `token remove` alone does not stop a static token"

    The running server reads `auth.tokens` at start. After `token remove`, it still accepts the
    static token until it restarts. The command says so in its first line. Restart the server now,
    or delete the token's file. A signed token is refused from the next request on.

`token list` shows every token. It never shows a value.

```text
ID                NAME     KIND    PROFILE  EXPIRES               STATUS
admin             admin    static  -        never                 active
3f2a1b0c9d8e7f60  laptop   signed  staff    2026-11-17 06:00 UTC  active
```

- A static token's ID is its name. A signed token's ID is the one the log shows.
- The commands take an ID or a name. A name that two tokens share is refused with both IDs.
- `token revoke` puts a signed token on the deny list. The server refuses it from the next request
  on. It also takes an ID that is not in the list, for example one from the log.
- `token remove` takes a static token out of `auth.tokens` of the configuration file. It keeps the
  old file as a backup first, as `--add` does.
    - The token's file is deleted where the server made it (`"create": true`, or in the state
      directory). The token is then refused from the next request on.
    - Otherwise the file stays, and the token works until the next restart (see the warning above).
    - It refuses the last token of `auth.tokens`, and `admin`. Give `admin` a new value with
      `token new --file <its file> --force`.
- `token remove` on a signed token revokes it and takes it off the list.
- `token revoke` on a static token is refused. Use `token remove`.

They read the configuration as `token show` does: `--config` or `$PIVOTKIT_CONFIG`, and
`--state-dir` or `$PIVOTKIT_STATE_DIR`. In the container image, they need no flag.

### Made at the first start { #first-start }

You set the state directory with `--state-dir <dir>` or `$PIVOTKIT_STATE_DIR`. The
[container image](container.md) sets `/var/lib/pivotkit`. With a state directory, the server makes
what is missing there when it starts over HTTP, so a start without any setup has a token and links
that survive a restart:

| What | Where | When |
| --- | --- | --- |
| `auth.mode` `"token"` | | `auth.mode` is not set, the address is not loopback and `auth.allowUnauthenticated` is not set (such a start is refused without a state directory) |
| The token `admin` (every scope, no profile) | `<dir>/secrets/admin.token` | `auth.mode` is not written, so the row above sets `"token"`, `auth.tokens` is empty and `$PIVOTKIT_TOKEN` (pivotkit-mcp: `$PIVOTKIT_MCP_TOKEN`) is not set. A written `auth.mode` `"token"` without a token is refused (below) |
| The key of the [download links](delivery.md) | `<dir>/secrets/downloads.key` | Links are on and `output.downloads.key` is not set |
| The [audit](mcp.md#logging) key | `<dir>/secrets/audit.key` | `audit.subject` is `"hash"` and `audit.key` is not set |
| The [signed tokens'](#signed-tokens) directory | `<dir>/secrets/signed/` | The first `token issue`, not the start |

- The server never makes the state directory itself. It makes only these in it:
    - `secrets/` (mode 0700), for the files above
    - `out/` (mode 0700), when `output.dir` is `<dir>/out`, as in the image's built-in example
- Each file is one line with mode 0600. A file that is there is read and never written.
- The start logs `created the token "admin" in <path>` once. It never logs a value.
- Every start with the token `admin` logs the command that prints it. In Docker or Podman that is
  `docker exec <container> pivotkit-server token show admin`. In Kubernetes it names the namespace
  and the pod: `kubectl -n <namespace> exec <pod> -- pivotkit-server token show admin` (add
  `-c <container>` in a pod with more than one). Elsewhere it is
  `pivotkit-server token show admin --state-dir <dir>`.
- `admin` is made only where the configuration leaves auth to the server. A written `auth.mode`
  `"token"` (or `--auth token`) with neither `auth.tokens` nor the variable is refused. Set the
  variable, list tokens, or remove `auth.mode` to use `admin`. A misspelt variable never becomes a
  token with every scope.
- When the token cannot be made, the start is refused. It never serves without auth instead. The
  message says what helps: a writable volume in a container, else the directory itself.
- A key that cannot be made is a warning. The key is then a random one per process.
- Over stdio nothing is made.
- `check-config` says under `Credentials` whether each file is there, will be made, or cannot be. It
  makes nothing.

Several processes that start at once on one directory end with one value each (the first one's).
Run one replica, or several on one shared volume. Replicas with a volume each would each make their
own token. `output.dir` may not be the state directory or hold its `secrets/`.

`"create": true` on a file reference asks for the same where you name the file:

- `auth.tokens[]`: `{ "name": "bot", "file": "bot.token", "create": true }`
- `output.downloads.key` and `audit.key`: `{ "file": "download.key", "create": true }`

The file is made where it is missing, also without a state directory. Its directory must be there.
pivotkit refuses `create` with `env`, since it cannot set a variable. It also refuses `create` on a
secret another system issues: a sign-in's `clientSecret`, a backend's header or client secret.

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

`pivotkit-server` is a library too. `createContext(options)` checks the options and starts the
workers. `createRestHandler(context)` from `pivotkit-server/rest` returns a fetch handler (a
`Request` in, a `Response` out) for any server that speaks them:

```js
import { createContext, serveFetch } from "pivotkit-server";
import { createRestHandler } from "pivotkit-server/rest";

// your data, and a value that changes when the data does
let rows = [{ Region: "North", Revenue: 120 }, { Region: "South", Revenue: 80 }];
let rowsVersion = 1;

const context = await createContext({
    sources: { sales: { load: async () => rows, version: () => rowsVersion, cacheShared: true, policy: { fields: { Region: "show" } } } },
    output: { dir: "/srv/reports" },
    auth: { mode: "token" } // the token is $PIVOTKIT_TOKEN, or list several in auth.tokens
});
const rest = await createRestHandler(context, { env: process.env, loopback: true });

// on node:http with the checks of this page (body cap, slow clients, a graceful stop):
const server = await serveFetch(rest, { host: "127.0.0.1", port: 3333, bodyBytes: 2_097_152 });
// or in a framework: return rest.fetch(request, { address });
```

Create `/srv/reports` first, or point `output.dir` at a directory you own. Run it with a token of at
least 32 characters in `PIVOTKIT_TOKEN`:

```bash
PIVOTKIT_TOKEN="$(npx -y pivotkit-server token new)" node server.js
```

Without a token, `createRestHandler` throws a `ConfigError` that says how to make one.

- `bodyBytes` is a number, or `(request, info) => number`. A function is called once per request,
  after the precheck. There `peekSignIn(info)` gives the sign-in the precheck kept (`{ caller }`, or
  undefined). A function gives a caller who is not signed in at most `BODY_BYTES` (2 MiB) and a
  signed-in one at most `MAX_BODY_BYTES` (64 MiB). `bodyBytesOf(options)` is the server's own:
  `rest.data.maxBytes` for a REST caller that may [send data](#data), else 2 MiB.
- Each request runs inside `withRequestId(id, fn)`. `requestId()` gives its id anywhere in its work,
  a code source's `load` included, for the host's own log lines. Every log line written inside it
  names the id. `errorDetails({ retryable, retryAfter })` builds an `OperationError`'s details with
  that id. `callerFields(caller)` is what a log line may hold of a caller: the client, and `subject`
  where `audit.subject` named the person when the token was verified.
- The handlers (`createRestHandler`, `createServerHandler`, pivotkit-mcp's `createHttpHandler`) run
  each request in its scope and set `X-Request-Id` on every answer. The scope comes from
  `requestScopeFor(request, info, { trustProxy })`: its id, the trace id of a valid `traceparent`, a
  checked `X-Request-Id`, `info.address` and, with `http.trustProxy`, the forwarded client as
  `address`. `serveFetch` does the same for any handler (pass its `trustProxy`). The context's runtime
  takes `service` (`{ name, version }`, the program on every line) and `env` (where `NO_COLOR` is
  read).
- With `auth.groupProfiles`, answer a verified token whose groups are unknown before you make its
  caller. `groupRefusal(options.auth, authInfo)` gives the text of the 403, or null. `callerOf`
  throws `NOT_ALLOWED` for such a token, so it never gets the sources' own policy.
- A secret in your options is a reference, `{ "env": "NAME" }` or `{ "file": "path" }`
  (`SECRET_REF`). `readSecret(ref, options, env)` reads it on every use, so a rotated file works
  without a restart. It trims one trailing newline and refuses a value with another line break or a
  NUL. Its error names the reference, never the value.

A configured source may be an operator's backend, an [HTTP source](sources.md#http)
(`sources.<id>.http`, with typed `params`), or, for a library host, a function instead of a file, a
[code source](sources.md#code):

- `load(params, { caller, signal })` returns an array of row objects, `{ rows, asOf }`, or columnar
  data `{ columns, types, data }` with one array per column. It does not return `encode()`'s result,
  so hidden fields can be dropped.
- `load` runs in the host's thread. Its `signal` is aborted after `timeMs` (30 s by default).
- The report over its data is computed in a worker under `compute.timeMs` and `compute.memoryMb`
  ([where it runs](sources.md#code-thread)).
- pivotkit keeps one copy of the data for each combination of caller, parameter values and policy
  levels. The caller counts with its client, scopes, groups and claims.
    - With `cacheShared: true`, one copy serves all callers.
    - A caller without an identity (an OAuth token without a usable subject) gets nothing kept.
    - A kept copy is reused while `version(params, { caller })` gives the same value, or for `ttl`
      seconds.
- Parallel calls share one load.
- After a transient failure, the last good data stands in for up to `maxStale` seconds, with `stale`
  in the result.
- A `SourceError` answers its code with its `publicMessage`. Anything else `load` throws answers 502
  `SOURCE_UNAVAILABLE` with a fixed text. Its class goes into the log, its message with
  `log: "debug"`.

More about the handler:

- The one static token without `auth.tokens` is `$PIVOTKIT_TOKEN`. Set while auth is `none`, it gets
  a warning at start and in `check-config`, over HTTP only: "PIVOTKIT_TOKEN is set but auth is none;
  use --auth token (or auth.mode token)". A written `auth.mode: "none"` gives no warning.
  `createContext(options, { tokenEnv })` names another. Tokens are read from `env` of
  `createRestHandler`.
- `loopback` says whether the server listens on loopback only. It decides whether `auth: none` is
  allowed, so it must match the address you listen on.
- `rest.fetch(request, { address })` takes the client's address for the limit on refused tokens.
  Without it, refused tokens are not limited, and a warning says so once.
- The Host check reads the request's `Host` header. For a `Request` built in code without one, it
  reads its URL's host. It accepts `localhost`, `127.0.0.1`, `[::1]`, the host of `http.publicUrl`
  and `http.allowHosts`.
- `createServerHandler(options, { env, stderr, loopback })` is the handler of
  `pivotkit-server serve`. It serves REST and, when pivotkit-mcp is installed, MCP over one context,
  with `/healthz` and `/readyz`. Hand it to `serveFetch` or your own server.
- To combine them yourself, build the context with pivotkit-mcp's `createMcpContext`, since its
  `createHttpHandler` needs the MCP server factory it adds. Give that context to both
  `createHttpHandler` and `createRestHandler`.
- From `pivotkit-server/rest`, `openApiDocument(options)` builds the OpenAPI document and
  `REST_ROUTES` lists the routes.
- From `pivotkit-server`, `present(context, operation, input, caller)` runs an operation for a
  caller (`callerOf("none")` without sign-in). It gives `{ text, result }` as both endpoints do.
- `serve(options, { env, stderr })` is `pivotkit-server serve` in code.

## PowerShell Universal { #psu }

A PowerShell Universal script, endpoint or app calls the REST service with `Invoke-RestMethod`
instead of running Node on the PSU server:

- Keep the token in a PSU secret.
- Call `POST /api/v1/views/render/file` with a token whose profile has `results: true`, and hand the
  file to the user.
- Or call `POST /api/v1/views/render` to save the file in the service's output directory.

See [Getting started: REST service](../getting-started/rest.md#powershell) for the calls in
PowerShell, and [Getting started: MCP server](../getting-started/mcp.md#psu) for running the service
next to PSU.

The PSU module's report pages load their data from the PSU app, with the person's own rights. The
REST service's policy does not apply to them.

## Security { #security }

See [Security: the REST service](../security.md#rest) for what the service protects against and what
it does not, and [Privacy](../privacy.md) for what an operator decides about the data it serves.
