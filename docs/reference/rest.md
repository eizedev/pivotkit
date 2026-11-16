---
title: pivotkit-server (REST)
description: The pivotkit REST service - routes, the OpenAPI 3.1 document, sign-in with tokens or OAuth 2.1, policy profiles, downloads, CORS, limits, errors as problem details, logging, and embedding pivotkit-server in your own Node server.
---

# pivotkit-server (REST)

`pivotkit-server` serves pivotkit's reports to programs over HTTP: a script, a PowerShell
Universal endpoint, a scheduler or a web app lists data sources, checks a [view](view-file.md),
renders it into a file and makes links. It runs the same operations as the
[MCP server](mcp.md) and the [command line](cli.md), with the same exposure policy, so a program sees
of a source what the operator allows. The command line is also its client: `pivotkit render`,
`validate`, `describe` and `sources` with `--url` and `--source` run on the server's sources
([With a server](cli.md#with-a-server)). The package also holds what the MCP server is built on, so
`pivotkit-server serve` runs the REST service and, when `pivotkit-mcp` is installed beside it, the MCP
endpoint on the same port.

To try it step by step, see [Getting started: REST service](../getting-started/rest.md); to run it as a
container, see [Container image](container.md); to update it, see
[Update an installation](../getting-started/upgrading.md#update). This page is the reference.

```bash
npm install --global pivotkit-server pivotkit-mcp
PIVOTKIT_TOKEN=... pivotkit-server serve --config pivotkit.json --auth token   # http://127.0.0.1:3333/api/v1
```

Node 22 or later. It brings [pivotkit-report](report.md), pivotkit-cli's file handling,
pivotkit-xlsx, ECharts 6.1.0 and jose (for OAuth); not the MCP SDK.

## Routes { #routes }

Every route is under `/api/v1` and answers JSON (a `GET` route answers `HEAD` too, without the
body). The routes are RPC-style (`POST /views/validate`), one per operation of the
[operation table](report.md#operations):

| Route | Operation | What it does |
| --- | --- | --- |
| `GET /sources` | `list_sources` | The sources the caller may use: id, title, whether a link or a schedule works, the parameters a source takes |
| `GET /sources/{id}` | `describe_source` | A source's fields with their type, level and counts, the aggregators and filters each works with, example views |
| `POST /sources/describe` | `describe_source` | The same, with `{ "source": "<id>" }` |
| `POST /views/suggest` | `suggest_view` | A draft view from the source's fields, with the fields it picked (`picks`); a `layout` replaces the parts it gives |
| `GET /views/guide` | `get_view_guide` | How to write a view: its keys, the vocabulary, example views |
| `POST /views/validate` | `validate_view` | Errors and warnings of a view against a source, each with its place and, for a misspelt name, the name meant (`suggestion`) |
| `POST /views/describe` | `describe_view` | A view in plain parts with the same findings |
| `POST /views/render` | `render_view` | The report as `xlsx` (default), `html`, `csv`, `json` or `svg`, saved in the output directory |
| `POST /views/render/file` | `render_view` | The same report as the answer itself, a download ([below](#downloads)) |
| `POST /views/link` | `create_link` | A link that opens the view in the source's report page |
| `POST /schedules/draft` | `draft_schedule` | A draft of a scheduled report for a person to approve; runs and sends nothing |

A POST takes its input as JSON (`Content-Type: application/json`, at most 2 MiB; a caller that may
[send its own data](#data) also multipart, up to `rest.data.maxBytes`). The input and the
answer of each route are in the [OpenAPI document](#openapi). A view with errors is no error: the
answer is 200 with `ok` or `valid` false and `findings` that say what to fix (the file route answers
422). `validate`, `render` and `render/file` take a `layout` instead of a `view`: the view by field names
(rows, columns, values, groupings), as the command line's layout flags write it
([layout](report.md#operations)); the answer then holds the `view` it made. `suggest` takes one too,
whose parts replace those of the draft. `source` is the id of a source the operator configured, or
`inline:` for [data sent in the request](#data): files by path (`file:`) are refused
over REST (`FILES_NOT_ALLOWED`), whatever `files.allowDirs` allows the MCP server.

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"sales","view":{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]},"format":"xlsx"}' \
  http://127.0.0.1:3333/api/v1/views/render
```

```json
{ "ok": true, "findings": [], "uses": ["Region", "Sales"], "format": "xlsx",
  "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "withheld": ["rows", "columns", "bytes", "content"],
  "dataAsOf": "2026-11-15T08:00:00Z",
  "output": { "name": "sales.pivotkit-out.xlsx", "format": "xlsx", "mediaType": "..." },
  "message": "The report is saved as sales.pivotkit-out.xlsx in the output directory. Its content is not part of this answer: results over fields that are not fully shown (Sales) stay in the file. Data as of 2026-11-15 08:00 UTC." }
```

Every answer over a source's data (all routes but `GET /sources` and `GET /views/guide`) carries
`dataAsOf`: when the data is from, in UTC to the second (a file's modification time, a code source's
own time or when it gave the data), parsed and written again by the server in this one form.
A source with parameters (an [HTTP source](sources.md#http) in the configuration, or a library
host's code source) takes their values as `params` with its id in a POST body
(`{ "source": "vms", "params": { "customer": "acme" } }`). Describe such a source with
`POST /sources/describe`: `GET /sources/{id}` carries no params, so it answers `INVALID_INPUT` for a
source with required ones, and its `detail` names `POST /sources/describe`; `GET /sources` lists them,
and the routes take `params` only when a configured source declares any
([parameters](mcp.md#configuration)).

`render_view` saves the file in the server's output directory (`output.dir`) and says where
(`output.name`, the stored name, and `output.filename`, the name a person sees), and gives a
[download link](delivery.md) in `output.url` where the report gets one (`expiresAt`, `bound`, and
`note`, one sentence on how to open it): a report over a source whose fields are all `show` always,
one over another source only with `results: true` and a bound link. The file's name is `name` from the
input, else `title`, else the view's name, else the source's, with `.pivotkit-out.` before the
format (`sales.pivotkit-out.xlsx`), the mark by which the server knows its own files; a name that is
taken gets `-2`, `-3` and so on, since no file is ever replaced. Check `ok` in the answer: a view with errors answers 200
with `ok: false` and `output: null`. The caller fetches the file from there or
uses the [file route](#downloads). The field names in these examples are made up: the fields of your
source and views built from them are in `GET /sources/{id}` (`fields`, `examples`).

A csv result is the report's layout, as the HTML report and the workbook show it: a header row per
column field, a row of labels, then a row per group with a total row and column; it starts with a
UTF-8 byte order mark, so a spreadsheet opens it as UTF-8.

A csv or json result comes back inline (`inline.text`) only when the operator sets
`rest.inline: true` and every field the view uses is `show`. With `"save": false` in the input,
`/views/render` saves nothing (no file in the output directory, no upload, `output: null`) and
returns the result inline only, by the same rules; where it cannot come back inline it answers an
error instead of a file (csv when no format is given): 400 `INVALID_INPUT` for xlsx, html or svg, 403 `NOT_ALLOWED`
without `rest.inline` or for a view of a field that is not `show`, 413 `LIMIT_EXCEEDED` over the
profile's `inline` limits ([MCP](mcp.md#inline-only)). Its `request` line has `saved: false`. The
file route sends the file and saves none, so it takes no `save` (400 `INVALID_INPUT`). `withheld` lists what is left out of the
answer because the view uses a field that is not `show` (`values` included). Findings are decided per
field (a finding about a field's items carries it in `field`): an item spelt differently (`itemCase`)
is named for a `show` or `values` field, an item that is none of a field's values (`itemUnknown`,
with the closest one) where its list is complete. A filter on an item of a `summary` field that does
not exist validates and renders an empty report, and nothing says why, since saying so would tell
that the item does not exist. Only for a view of `show` fields does a render whose filters keep no
rows have the warning `noRowsKept`.

## Exposure policy and profiles { #profiles }

The exposure policy is the [MCP server's](mcp.md#policy): per field `show`, `values`, `summary`
(default) or `hide`, per source over the server's, with the opt-in [automatic values
rule](mcp.md#auto-values). A REST caller is a program, not a model, but the same rules hold: a field
at `summary` keeps its values out of every answer, and one at `values` lists its values but no result
over them ([what reaches an AI model](../model-data.md#rest) shows the answers per token).

| Level | `GET /sources/{id}` | Findings | Results |
| --- | --- | --- | --- |
| `show` | values up to `items`, `complete`, smallest and largest | `itemCase`; `itemUnknown` where the list is complete; `noRowsKept`, `filterEmpty`, `tableCut`, `chartCut` when every field of the view is `show` | inline where `rest.inline` and `inline` allow |
| `values` | every value, sorted, `complete: true` (`auto: true` from the automatic rule) | `itemCase`, `itemUnknown` | file only, `withheld` |
| `summary` | name, type, counts | none about items | file only, `withheld` |
| `hide` | not listed | none | dropped |

A **profile** gives one caller more (or less) than the default: a named policy of the same shape in
`policy.profiles`. A caller gets one profile, the first of these that names one:

1. a static token's own (`auth.tokens[].profile`);
2. its OAuth client's (`auth.clientProfiles`): a client's profile wins over a person's groups both
   ways, so a restricted model client stays restricted, and a trusted client's profile applies to
   everyone using it;
3. the first entry of `auth.groupProfiles` whose group the person's token carries
   ([groups](mcp.md#groups)); when the token's groups are unknown, only step 5 follows (or 403
   `NOT_ALLOWED` without it);
4. the one profile its OAuth scopes name (`auth.scopeProfiles`); scopes that name two different
   profiles name none;
5. `auth.defaultProfile`, for every signed-in caller (a static token without a profile too).

Without any, a caller gets the sources' own policy; with `auth.groupProfiles` set, a signed-in
person whom none of these names is refused (403) instead ([groups](mcp.md#groups)). Profiles are
never merged. The profile is laid
over each source's policy:

- a field the source's policy hides stays hidden in every profile (it is dropped when the data is
  read);
- any other field takes the profile's level for it, else the profile's `default`, else the source's
  level;
- `items`, `rows`, `counts`, `inline` and `results` are the profile's where it sets them (a profile with `results: true` may download from a source whose own policy says `results: false`);
- a caller without a profile gets the server's policy, never more.

A caller bound to a profile never gets the automatic values rule: what its profile and the source
say is what it gets. With `policy.autoValues: true`, a profile that only adds `results: true` (the
`export` profile below) therefore sees less than a plain token: a field the rule lists for the plain
token is `summary` for it. Give such a profile `values` where it needs them, in its `fields` or as
its `default`; `check-config` prints each profile's levels per source. To give a group more, bind a
profile to its OAuth scope. Here a plain token
sees `Status` as a complete list and nothing else, and a token with the scope `pivotkit:analyst`
sees every value but `Customer`:

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

Here the dashboard sees every value of `sales` except `Customer`; the nightly export may download
files; the scripts get the default. `results: true` means: this caller may read every value of every
field that is not hidden, in a file, whatever level the field has; give it only to callers that may. Profiles apply to the MCP endpoint too (a model's token with the
`analyst` profile sees values), except `results`, which only the file route reads.

| Key | Default | What it is |
| --- | --- | --- |
| `policy.profiles.<name>` | none | A profile: `default` (show, values or summary), `fields`, `items`, `rows`, `counts`, `inline`, `results` |
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

A person in both groups gets `finance`, since it comes first; `check-config` warns when a later
entry shows a field an earlier one holds back. Without `defaultProfile`, a person in none of the
groups (and whose client or scopes name no profile) is refused with 403 `access_denied`; set it to a
narrow profile to let such people in (`check-config` warns when it is missing).

## Data in the request { #data }

A program that has the data already (a script, a scheduled job) can send it with the request
instead of the operator configuring a source for it. It is off by default and the operator turns it
on per profile with `data: true` (or for every caller with `policy.data: true`). The source id is
then `inline:`, on every route that takes a source: describe, suggest, validate, describe a view,
render and the file route. A caller without `data: true` that sends `inline:` gets 403
`NOT_ALLOWED`: "this server takes no data sent in the request (the operator allows it per profile:
data: true); use a source from GET /sources" where no profile has it, "your token may not send data
(the operator allows it per profile: data: true)" where other profiles have it.

As JSON, the table goes into `data`: the column names, the rows as lists in the columns' order, and
`rowCount`, the number of rows of the whole table, which must match the rows sent (else 422
`DATA_MISMATCH`), so a table cut short on the way is refused:

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
| `asOf` | no | When the data is from, as you state it (ISO 8601): the answer says it as `suppliedAsOf`; `dataAsOf` is when it arrived |

A file goes as `multipart/form-data` with a part `data` (the file: csv, tsv, json or xlsx, by the
file name's extension, else the part's content type) and an optional part `input` (the route's
input as JSON, without `source`, or with `"inline:"`). Its `data` holds only `name`, `asOf`, `sheet`
(a workbook's sheet) and `sha256`, the SHA-256 of the file's bytes in hex: a file that differs is
refused (422 `DATA_MISMATCH`). The body has at most these two parts; nothing is written to disk, and
the file's name is used for its extension only:

```bash
printf 'Region,Sales\nNorth,10\nSouth,20\nNorth,5\n' > sales.csv
curl -s -o report.xlsx -H "Authorization: Bearer $ETL_TOKEN" \
  -F data=@sales.csv -F 'input={"view":{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]},"data":{"sha256":"'"$(shasum -a 256 sales.csv | cut -d' ' -f1)"'"}}' \
  http://127.0.0.1:3333/api/v1/views/render/file
```

- **No exposure policy.** The rows are the caller's own: every field is `show` to it, whatever the
  server's or its profile's policy says of fields of that name. The profile's `inline` limits still
  apply. A report over such data is no proof that its content came from the operator's data.
- **Size.** A caller with `data: true` may send a body of up to `rest.data.maxBytes` (default
  10 MiB, 2 to 64 MiB) on the POST routes that take a source; every other request keeps 2 MiB, and
  a 413 says which cap applied. The larger cap applies only once the token is checked: a body
  declared larger than any caller may send is refused before that. At most two bodies over 2 MiB are
  read at once over all callers, one per caller; another gets 503 `BUSY` with `Retry-After` and `retryable: true`.
  A caller here is a token (by its name) or an OAuth client: programs that share one token, or people
  who sign in through one OAuth client, send one such body at a time between them.
  A JSON body nested deeper than 64 levels is refused before it is parsed, a multipart body with more
  than two parts before its parts are read. A JSON body is parsed in the server's main thread: a
  `data: true` token is trusted with that time and memory ([security](../security.md#rest)). The server's import limits (`limits.rows`, `limits.importCells`, `limits.fileBytes`)
  apply as to a file source; a file is read in a worker under `compute.timeMs` and
  `compute.memoryMb`.
- **Downloads.** The file route over `inline:` needs `data: true` only, not `results: true`: there
  is no operator data to protect. `results` still decides for configured sources.
- **Not kept.** The data is never cached and is gone after the request; a report rendered over it
  is saved in the output directory like any other and counts against its quota. A link (`/views/link`)
  answers 409 `NO_LINK` and a schedule (`/schedules/draft`) 409 `NOT_SCHEDULABLE`.
- `GET /sources` adds `"data": { "maxBytes": 10485760 }` for a caller that may send data.

| Key | Default | What it is |
| --- | --- | --- |
| `policy.data`, `policy.profiles.<name>.data` | false (REST) | The caller may send its own data; a source's policy and `files.policy` do not take it |
| `rest.data.maxBytes` | 10485760 (10 MiB) | The largest body of a caller that may send data: 2097152 (2 MiB) to 67108864 (64 MiB) |

## Downloads { #downloads }

`POST /views/render/file` takes the input of `/views/render` and answers with the file itself, as an
attachment. It is allowed only for a caller whose policy has `results: true` (a profile's, a source's
or the server's; over [data the caller sends](#data), `data: true`), whatever fields the view uses: an answer that depended on the view's fields would
itself tell what they hold. Without it the answer is 403 `NOT_ALLOWED`. Nothing is written to the
output directory, and every download is a log event of its own.

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

## Sign-in { #auth }

The modes are the [MCP server's](mcp.md#auth), from the same `auth` settings:

| Mode | How | 401 answers with |
| --- | --- | --- |
| `none` | No check; loopback only unless `auth.allowUnauthenticated` | - |
| `token` | `Authorization: Bearer <token>`: `$PIVOTKIT_TOKEN`, or named tokens in `auth.tokens` (from a variable or a file read on every request) | `WWW-Authenticate: Bearer realm="pivotkit"` |
| `oauth` | A JWT access token of the issuer for the REST resource | `WWW-Authenticate: Bearer error="invalid_token", ..., resource_metadata="..."` |

Only the `Authorization` header is read: a token in the address (`?access_token=`), two
`Authorization` headers, Basic and cookies are refused. Static tokens and their scopes work on both
endpoints. With OAuth the REST service is a protected resource of its own: its resource is
`rest.resource` (default the origin of `auth.resource` with `/api/v1`, e.g.
`https://reports.example.com/api/v1`), its metadata ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728))
is at `/.well-known/oauth-protected-resource/api/v1`, and a token must carry its audience: a token
issued for the MCP endpoint is refused by REST, and one for REST by the MCP endpoint. The issuer's
settings are the MCP endpoint's ([OAuth 2.1](mcp.md#oauth)), including `auth.intranet` for an issuer
on a private address. A token without
the required scopes gets 403 `INSUFFICIENT_SCOPE` with `WWW-Authenticate: Bearer
error="insufficient_scope", scope="..."` naming them. A person whose token does not carry their groups
(with `auth.groupProfiles` and no `auth.defaultProfile`, [groups](mcp.md#groups)) gets 403
`NOT_ALLOWED` without a challenge: signing in again with more scopes would not help. The metadata
lists the required scopes, and the sources' with `auth.offerSourceScopes: true` ([which
scopes](mcp.md#scopes)); an empty `GET /sources` for a token without the sources' scopes has a
`hint`. The `refused` log line of a 403 for groups names the client.

Set `auth.requireTyp: "at+jwt"` where the provider marks its access tokens so (RFC 9068), so an ID
token with the right audience is refused.

The output directory holds at most `output.maxFiles` files and `output.maxMb` megabytes that
pivotkit wrote. When it is full, a new report deletes the oldest reports, whoever made them: any
token that may render can push other callers' older reports out, and a link to one of them
(`output.baseUrl`) then answers 404, one of the server's own links 410 `LINK_EXPIRED`. Schedule drafts are never deleted this way; they may take at
most half of `output.maxFiles` (none at 1), and a draft over that answers 409 `NO_OUTPUT` while
reports keep working, so give `draft_schedule` a scope of its own too and keep
`output.maxAgeDays` (30 days by default) on. A file you name with `.pivotkit-out.` yourself counts as pivotkit's and may be
deleted. A quota per caller
was the other choice; it was not taken because a caller is no stable owner (with auth `none` every
caller is the same, files written before a restart have none) and the directory would still need a
total that, once reached, refuses everyone again. So set `output.maxFiles` well above what your
callers render between two clean-ups, give `render_view` a scope of its own (`auth.toolScopes`) when
not every caller needs it, keep the per-caller rate limit ([limits](#limits)), keep
`output.maxAgeDays` on (30 days by default), and run one server process per output directory (the count is kept within a
process). A write the server is killed in leaves its temporary file
(`.<name>.pivotkit-out.<format>.<pid>-<random>.tmp`): it is neither counted nor deleted to make
room, and with `output.maxAgeDays: 0` it stays until you remove it. The server
holds at most 256 connections and keeps 16 of them for loopback clients such as the health check or
a proxy on the same host, and a client has 5 seconds to send its headers ([MCP](mcp.md#http) has the
details); `http.maxConnectionsPerAddress` bounds the connections of one address. On a network you do
not trust, put a reverse proxy in front. With `auth.mode: oauth` and neither
required scopes nor `auth.toolScopes`, the start warns: any token of the issuer for the REST
audience then gets everything its profile allows.

Scopes per operation (`auth.toolScopes`, e.g. `{ "render_view": ["pivotkit:render"] }`) and per
source (`sources.<id>.scopes`) hold as for MCP; a source the caller may not use answers as a missing
one (404 `SOURCE_NOT_FOUND`).

| Key | Default | What it is |
| --- | --- | --- |
| `rest.resource` | origin of `auth.resource` + `/api/v1` | The REST service's resource (OAuth) |
| `rest.audience` | `[rest.resource]` | The `aud` values a REST token may carry |
| `rest.requiredScopes` | `auth.requiredScopes` | Scopes every REST call needs |

## CORS { #cors }

Off by default: a request with an `Origin` header (from a browser) is refused with 403
`FORBIDDEN_ORIGIN`; programs send none. `rest.cors.origins` lists the browser origins allowed to call,
each exactly as a browser sends it (`https://app.example.com`, never `*`). For them a preflight
(`OPTIONS`) is answered before sign-in, and every answer, errors included, carries
`Access-Control-Allow-Origin` with that origin and `Vary: Origin`. Cookies are never read, so no
credentials mode is needed: the page sends the token in the `Authorization` header. MCP's
`http.allowOrigins` is a separate list.

| Key | Default | What it is |
| --- | --- | --- |
| `rest.cors.origins` | none | Browser origins allowed to call |
| `rest.cors.maxAge` | 600 | Seconds a browser may keep a preflight's answer |

## Limits { #limits }

Besides pivotkit-core's [limits](../concepts/limits.md) and the workers' (`compute.*`, as for
[MCP](mcp.md#configuration)), the REST service limits each caller: the person an OAuth token names (its issuer and subject), a
static token by its name, or `local` without sign-in; an OAuth token without a subject counts for its
client. The people of one OAuth client together get eight times `rest.rateLimit` and run at most eight
times `rest.concurrency` requests at once (their refusals say `limit: clientRate` and
`limit: clientShare` on the log line):

| Key | Default | What it is |
| --- | --- | --- |
| `rest.rateLimit.perMinute`, `.burst` | 120, 30 | Requests per minute, with up to `burst` at once after a pause |
| `rest.rateLimit.failedAuthPerMinute` | 30 | Refused tokens per address and minute; beyond, a wrong token from that address gets 429 instead of 401 (a right one still works) |
| `rest.concurrency` | 4 | Requests of one caller at once |
| `rest.inline` | false | csv and json results inline in the answer, where the policy allows |
| `rest.data.maxBytes` | 10485760 (10 MiB) | The body of a caller that may [send data](#data); 2 MiB for everyone else |

Over a limit the answer is 429 `RATE_LIMITED` with `Retry-After`. The MCP endpoint has the same
limits with counts of its own (`mcp.rateLimit`, `mcp.concurrency`, see [MCP](mcp.md#configuration)).
A token is checked once per request. The counts live in the memory of one process: two instances behind a load balancer count on their own. The address is the socket's,
or with `http.trustProxy` the last one in `X-Forwarded-For`.

## Errors { #errors }

Every error is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem document,
`application/problem+json`:

```json
{ "type": "https://pivotkit.eize.dev/reference/rest/#error-source-not-found", "title": "Source not found",
  "status": 404, "code": "SOURCE_NOT_FOUND", "detail": "no source \"salse\"; did you mean \"sales\"?; GET /sources lists them" }
```

`code` is stable; `detail` says what went wrong and what to do, and names a file by its base name at
most, never its content. A 5xx answer carries a fixed text, never an error's message. 429 and 503
carry `Retry-After`.

Every problem also carries `requestId`, the id on the request's [log lines](#logging): a person
gives it to the operator. An error of a source or a store that failed (`SOURCE_UNAVAILABLE`,
`UPLOAD_FAILED`) adds `retryable`, whether the same request may work when tried again;
`Retry-After` says when, where it is known:

```json
{ "type": "https://pivotkit.eize.dev/reference/rest/#error-source-unavailable", "title": "Source unavailable",
  "status": 502, "code": "SOURCE_UNAVAILABLE", "detail": "the source is not available right now; if it stays so, give the operator the request id",
  "requestId": "Ab3_xY9-k2Q", "retryable": true }
```

| Status | Code | When |
| --- | --- | --- |
| 400 | <a id="error-invalid-input"></a>`INVALID_INPUT` | The body is not valid JSON, is no JSON object, or does not fit the route's schema (an unknown key, a wrong type, nested deeper than 64 levels, also inside a view given as JSON text) |
| 401 | <a id="error-invalid-token"></a>`INVALID_TOKEN` | No token, an unknown or expired one, another scheme, a token in the address |
| 403 | <a id="error-insufficient-scope"></a>`INSUFFICIENT_SCOPE` | The token lacks a scope the service or the operation needs |
| 403 | <a id="error-not-allowed"></a>`NOT_ALLOWED` | The file route without `results: true`; `inline:` data from a caller without `data: true`; a code source that refuses the caller (its `SourceError`); `save: false` where the result may not come back inline |
| 403 | <a id="error-files-not-allowed"></a>`FILES_NOT_ALLOWED` | A `file:` source |
| 403 | <a id="error-forbidden-host"></a>`FORBIDDEN_HOST` | A `Host` the server does not answer to (DNS rebinding protection; `http.allowHosts`, `http.publicUrl`) |
| 403 | <a id="error-forbidden-origin"></a>`FORBIDDEN_ORIGIN` | A browser origin not in `rest.cors.origins` |
| 404 | <a id="error-not-found"></a>`NOT_FOUND` | No such route |
| 404 | <a id="error-source-not-found"></a>`SOURCE_NOT_FOUND` | No such source, or one the caller lacks the scopes for |
| 404 | <a id="error-file-not-available"></a>`FILE_NOT_AVAILABLE` | The source's file is missing or changed while read |
| 404 | <a id="error-data-not-available"></a>`DATA_NOT_AVAILABLE` | A code source has no data the caller may see for these values (its own `SourceError`, [code sources](sources.md#code-errors)); an HTTP source's backend answered 401, 403 or 404 for the values given ([HTTP sources](sources.md#http-errors)) |
| 405 | <a id="error-method-not-allowed"></a>`METHOD_NOT_ALLOWED` | GET for a POST route or the other way round (`Allow` names the method) |
| 409 | <a id="error-no-output"></a>`NO_OUTPUT` | No output directory for a file, the directory not writable by the server's user, or full where the server deletes nothing (it holds the operator's own files) |
| 409 | <a id="error-no-link"></a>`NO_LINK`, <a id="error-not-schedulable"></a>`NOT_SCHEDULABLE` | A link for a source without a page; a schedule over a source that cannot have one: a `file:` source, data sent in the request, a source with a token exchange or a parameter bound to a claim ([backend sign-in](sources.md#http-claims)) |
| 413 | <a id="error-body-too-large"></a>`BODY_TOO_LARGE`, <a id="error-limit-exceeded"></a>`LIMIT_EXCEEDED` | The body over 2 MiB (over `rest.data.maxBytes` for a caller that may send data); a file, the data sent, a view or the work over a limit; with `save: false`, a result over the `inline` limits |
| 415 | <a id="error-unsupported-media-type"></a>`UNSUPPORTED_MEDIA_TYPE`, <a id="error-unsupported-format"></a>`UNSUPPORTED_FORMAT` | A POST whose `Content-Type` is not `application/json` (curl's `-d` alone sends a form) nor, where data may be sent, `multipart/form-data`; a file sent in no data format; a source file in no data format |
| 422 | <a id="error-invalid-file"></a>`INVALID_FILE`, <a id="error-not-regular-file"></a>`NOT_REGULAR_FILE`, <a id="error-hard-link"></a>`HARD_LINK`, <a id="error-invalid-template"></a>`INVALID_TEMPLATE` | The source's file or print template (`sources.<id>.template`, a [print template](print-template.md) whose `--pk-*` colours reach the chart, [options](mcp.md)) cannot be used |
| 422 | <a id="error-view-has-errors"></a>`VIEW_HAS_ERRORS` | The file route for a view with errors (with `findings`) |
| 502 | <a id="error-upload-failed"></a>`UPLOAD_FAILED` | The report was made but could not be stored in the [operator's store](delivery.md#upload) (`retryable` says whether trying again may help); the report stays in the output directory |
| 429 | <a id="error-rate-limited"></a>`RATE_LIMITED` | A [limit](#limits) |
| 500 | <a id="error-internal"></a>`INTERNAL` | Anything else; the details only in the log with `--log debug` |
| 422 | <a id="error-data-mismatch"></a>`DATA_MISMATCH` | [Data sent in the request](#data) whose `rowCount` differs from the rows sent, or a file whose SHA-256 differs from `sha256` |
| 502 | <a id="error-source-unavailable"></a>`SOURCE_UNAVAILABLE` | A code or HTTP source's load failed, took longer than its `timeMs` or has too many loads running; `detail` is one of pivotkit's fixed texts (not available right now; the source's backend refused pivotkit's access; the source is not set up correctly), `retryable` says whether trying again may work ([HTTP sources](sources.md#http-errors)) |
| 503 | <a id="error-busy"></a>`BUSY`, <a id="error-not-ready"></a>`NOT_READY`, <a id="error-auth-not-ready"></a>`AUTH_NOT_READY` | No worker free, or two [large bodies](#data) read already; starting or stopping; the OAuth issuer not loaded yet |
| 400, 403, 409, 410, 503 | <a id="error-link-expired"></a>`LINK_EXPIRED`, <a id="error-link-used"></a>`LINK_USED`, <a id="error-link-not-yours"></a>`LINK_NOT_YOURS`, <a id="error-sign-in-failed"></a>`SIGN_IN_FAILED`, <a id="error-sign-in-not-ready"></a>`SIGN_IN_NOT_READY` | Answers of the server's own [download links](delivery.md#answers) (`/downloads/`), not of `/api/v1` |
| 504 | <a id="error-timeout"></a>`TIMEOUT` | A report over `compute.timeMs` |

## The OpenAPI document { #openapi }

A running server serves its OpenAPI 3.1 document at `/openapi.json`, with its own address
(`http.publicUrl`) and sign-in (bearer for tokens, the issuer's OAuth endpoints, the scopes per
operation as `x-pivotkit-scopes`). By default only for signed-in callers (`rest.openapi: "auth"`);
`"public"` serves it to anyone, `"off"` not at all. The view's JSON Schema
([view-2.json](view-file.md)) is bundled into it, so a client fetches nothing else. The document of a
server with static tokens is also published at
[pivotkit.eize.dev/openapi.json](https://pivotkit.eize.dev/openapi.json).

The document is generated from the operation table and the schemas the server presents, the same
ones the MCP tools have, so routes, docs and checks cannot drift apart. `/api/v1` changes only with a
breaking change of the operations' contracts (a breaking change for MCP too); `info.version` is
pivotkit-server's.

## Running it { #running }

`pivotkit-server` is one command for the REST service, the MCP server and the command line, as the
[container image](container.md) runs them ([on Kubernetes](../getting-started/kubernetes.md)):

| Command | What it does |
| --- | --- |
| `pivotkit-server serve [flags]` | HTTP on one port: `/api/v1`, `/openapi.json`, and with pivotkit-mcp installed `/mcp` and its quick-start page; `/healthz` and `/readyz` |
| `pivotkit-server check-config [flags]` | Whether `serve` would start and what it would expose (sources, each field's level and why, the fields the automatic values rule gives or would give `values`, delivery, auth, profiles, REST settings), then exit; 1 when it finds a problem, whether or not the server would start with it ([reading it](#check-config)). A policy rule that names no column of the data is a warning (exit 0), with the name probably meant |
| `pivotkit-server check-source <id> [--param name=value ...] [flags]` | Load an [HTTP source](sources.md#check-source) once as the server would: each page's status, content type and size, the rows, the fields with their types (never a value), when the data is from, and what a caller would get when it fails; 1 when it fails, 2 when the id names no HTTP source |
| `pivotkit-server source-from-openapi <file or https URL> --operation <operationId or "GET /path"> [--id <id>] [--backend <name>]` | Propose an [HTTP source](sources.md#openapi) from one GET operation of an OpenAPI document (JSON): the block on stdout, what you must check and decide on stderr; the values you must fill in say `TODO`, which the server refuses until you do; 2 when the operation cannot be a source |
| `pivotkit-server mcp [flags]` | [pivotkit-mcp](mcp.md)'s runner (stdio by default) |
| `pivotkit-server cli <command> ...` | The [command line](cli.md) `pivotkit` |
| `pivotkit-server healthcheck [url]` | Exit 0 when `GET /healthz` answers (default `http://127.0.0.1:$PIVOTKIT_PORT/healthz`) |
| `pivotkit-server --version` | The version |

### Reading check-config { #check-config }

`check-config`'s first line says whether the server starts ("the server does not start with this
configuration", "the server starts, but not everything will work", or "the configuration is
valid"); the second counts problems and warnings. Then come every `PROBLEM` line, every `WARNING`
line named by the section it belongs to (the issuer's under `Auth`, where the sign-in is), and the
sections. A `PROBLEM` ends with what it does: `->
the server does not start` (what `serve` refuses: an output directory it cannot use, a static token
that is missing or too short, an address off loopback without auth, an issuer that is not https, an
audit key, a print template the parser refuses), or what does not work while the server runs (a
source file that is not there, a backend secret, the download key, an upload header's secret, the
download links' client secret, an issuer or upload target on an address the server refuses, an
output directory the server cannot write). Any `PROBLEM` exits with 1. A `WARNING` does not change
the exit code; an issuer whose metadata cannot be loaded from where you run it is one, with the
connection's error (for example `ENOTFOUND`), since the server starts and keeps trying.

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

New in this version: data in the request (inline:; mcp.data: false switches it
    off), download links under /downloads/, answered without a token (the link
    is the credential; output.downloads.enabled: false switches them off),
    reports deleted after 30 days (output.maxAgeDays: 0 keeps them), the
    client's IP address on the log's request lines (log.address: "off" leaves
    it out), a start error as a JSON line where stderr is no terminal
    (log.format: "text" keeps the plain line)
    -> https://pivotkit.eize.dev/getting-started/upgrading/
```

Each line holds one fact: a fact under another is two spaces further in, a wrapped line four. Lines
are wrapped at 78 columns at spaces; a path stands on a line of its own and is never cut, so a long
one makes its line longer. Limits and defaults that matter are printed with their values (the
exposure limits, the output directory's size, CORS, who may read `/openapi.json`); a field's level
says whether it comes from a rule or the default. A secret is named by its variable or by its file,
as written and with its full path, never by its value. Over stdio (`pivotkit-mcp` without `--http`)
there are no download links and no signed-in person, and the `Transport:` section says which
sources therefore cannot be used. "New in this version" names the changes of this release that
apply to the configuration, with the setting that switches each off, and links to the
[upgrading page](../getting-started/upgrading.md).

The flags of `serve` are the [MCP runner's](mcp.md#configuration) without `--http`, `--allow-dir`
and `--list-files`, plus `--enable rest,mcp` (`http.enable`: what to serve; default REST, and MCP
when pivotkit-mcp is installed). The configuration file is `--config` or `$PIVOTKIT_CONFIG`; the
one static token without `auth.tokens` is `$PIVOTKIT_TOKEN`; `$PIVOTKIT_PORT` sets the port when
neither the flag nor the file does. An unknown flag is a usage error (exit 2) that points to
`--help`. It is one configuration for both endpoints: `rest.*` is read by
the REST service only, `http.page` and `http.allowOrigins` by the MCP endpoint only.

`/healthz` answers `{ "ok": true }` while the process runs; `/readyz` answers 200 when it can take
work (`{ "ok": true, "checks": { "auth": true, "workers": true, "output": true } }`: the OAuth issuer
loaded, workers up, the output directory writable) and 503 otherwise, with `reason` in fixed words
(`"the OAuth issuer's metadata is not loaded; see the log"`); both answer `HEAD` too. An
output directory the
server's user cannot write is also a warning at start, a problem in `check-config`, and 409
`NO_OUTPUT` for a report. On SIGTERM the server takes no
new connection and lets running requests finish for up to `http.graceMs` (25 seconds by default).

| Key | Default | What it is |
| --- | --- | --- |
| `http.enable` | `["rest"]`, plus `"mcp"` when installed | What `serve` serves |
| `http.trustProxy` | false | Read the client's address from `X-Forwarded-For` (the last entry) for the limits and the log's `address` (the proxy is then `peerAddress`) |
| `log.level`, `log.format`, `log.address` | info, auto, on | The log's level, its format (text on a terminal, JSON otherwise) and whether lines name the client's address; flags `--log`, `--log-format`, `--log-address`, variables `PIVOTKIT_LOG_LEVEL`, `PIVOTKIT_LOG_FORMAT`, `PIVOTKIT_LOG_ADDRESS` ([operations](operations.md#settings)) |
| `http.maxConnectionsPerAddress` | 0 (no bound) | Connections one address may hold (loopback excepted); set it (e.g. 32) when clients reach the port directly with addresses of their own, not behind NAT, a published port or a proxy, where every client has one address |
| `http.graceMs` | 25000 | How long a stop waits for running requests |
| `output.create` | true | Make a missing `output.dir` at start (with its parents, mode 0700, or 0755 narrowed by the umask when `output.baseUrl` is set; a warning in the log); `false` makes a missing directory an error. A relative `output.dir` without a configuration file is relative to the working directory. `check-config` says whether the directory exists, will be made, or cannot be, and why (a parent the server's user may not write, a name too long, a symbolic link loop) |
| `output.maxFiles`, `output.maxMb` | 1000, 1024 | Files pivotkit wrote and their megabytes the directory may hold: reports (`<name>.pivotkit-out.<format>`) and schedule drafts (`<name>.pivotkit-out.report.json`), at its top level. A new report deletes the oldest reports until it fits, one write at a time; drafts are counted but never deleted, and may take at most half of `output.maxFiles` (a draft over that answers 409 `NO_OUTPUT`). Files without that mark (the operator's, reports of older versions) are neither counted nor deleted, nor are subdirectories; a file named with the mark by hand counts as pivotkit's. Where the output directory is the configuration file's directory or holds a source, print template or token file, nothing is deleted: a full directory answers 409 `NO_OUTPUT`, and the start warns (with `output.maxAgeDays` it does not start) |
| `output.maxAgeDays` | 30 | `0`: no age limit. Delete reports and drafts (the files marked `.pivotkit-out.`) older than this many days from the top level of the output directory, at start and every hour, and the temporary files of writes the server was killed in (`.<name>.pivotkit-out.<format>.<pid>-<random>.tmp`, older than an hour); other files and subdirectories stay. Use a directory of its own: the server refuses to start with a limit you write when the output directory is the configuration file's directory or holds a source, print template or token file; there the default does not apply (no age limit) |
| `output.downloads` | on (plain links for open sources) | The server's own [download links](delivery.md): `enabled`, `expiresMinutes` (60), `bind` (`signIn`, `once`, `none`), `key`, `signIn` |
| `output.upload` | none | [Upload to your store](delivery.md#upload): `url` or `presign`, `headers`, `link`, `linkOrigins`, `method`, `timeMs`, `maxBytes`, `keepLocal`, `bind`, `intranet` |
| `rest.openapi` | `"auth"` | Who gets `/openapi.json` |

Behind a reverse proxy: forward `/api/v1/`, `/openapi.json`, `/.well-known/oauth-protected-resource/api/v1`
and `/downloads/` (with MCP also `/mcp`, `/.well-known/` and `/`), keep the `Host` header (or add the proxy's name to
`http.allowHosts`), and set `http.publicUrl`. Set `http.trustProxy` when the proxy adds the client's
address to `X-Forwarded-For`: otherwise every client has the proxy's address and shares one count of
refused tokens (the [limit](#limits) per address). Only when the service is reachable through the proxy alone:
a client that reaches the server directly can write any `X-Forwarded-For`. With it, the log names the
client's address as `address` and the proxy as `peerAddress` ([correlation with the proxy](operations.md#correlation)). Let the proxy take bodies of 2 MiB (nginx's default is 1 MiB), or `rest.data.maxBytes` where callers [send data](#data). For nginx:

```nginx
location ~ ^/(api/v1/|openapi\.json$|mcp$|\.well-known/|downloads/|healthz$|readyz$|$) {
    proxy_pass http://127.0.0.1:3333;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 60s;
    client_max_body_size 2m;
}
```

Without containers, on Windows next to PowerShell
Universal, `pivotkit-server serve` runs as a service with a service manager of your choice:
[PowerShell Universal](../getting-started/mcp.md#psu) has the steps (an account of its own, its file
rights, the token from a PSU secret, a rotated log, IIS with ARR in front). Its file checks are
measured on Linux and macOS ([#209](https://github.com/eizedev/pivotkit/issues/209) tracks junctions
and hard links on Windows).

## Logging { #logging }

One line per event on stderr, as the [MCP server's](mcp.md#logging): JSON, or text on a terminal
(`log.format`). Every line has `time`, `level`, `severity`, `event`, `msg`, `service` and `version`;
[Operations and logs](operations.md) lists every field, the levels and how to ship the log.
`started` (version, address, what it serves, auth mode, the source ids, the log's settings, the
static tokens' names), `request` (operation, route, client, `requestId`, `traceId`, the client's
`address`, source id, `status`, `outcome`, error code, time in ms; for `inline:` data the number of
rows and columns, or a file's format and bytes), `download` (operation, client, `requestId`, source,
format, bytes; for a [download link](delivery.md) `via: "link"`, its binding, whether it worked and
the code, never the token), `refused` (a request refused by the Host, Origin or token check, a limit
or a body over the cap, with its `requestId` and `reason`), `warning` and, after a stop, `stopped`.
A request line is `info` when it worked, `warn` for 4xx and `error` for 5xx. `requestId` is random
(11 characters), the same on every line of one request, in its error answer and in the
`X-Request-Id` header of every answer. The client is the static token's name or the OAuth client
id; the person is on `request` and `download` lines only with `audit.subject` ([audit](mcp.md#logging)),
and their groups and other claims never; no line holds a view, a value, a token or a path.
`log.address: "off"` leaves the client's address out.

## In your own server { #embed }

`pivotkit-server` is a library too. `createContext(options)` checks the options and starts the
workers; `createRestHandler(context)` from `pivotkit-server/rest` returns a fetch handler (a
`Request` in, a `Response` out) for any server that speaks them:

```js
import { createContext, serveFetch } from "pivotkit-server";
import { createRestHandler } from "pivotkit-server/rest";

const context = await createContext({
    sources: { sales: { load: async () => rows, version: () => rowsVersion, cacheShared: true, policy: { fields: { Region: "show" } } } },
    output: { dir: "/srv/reports" },
    auth: { mode: "token" }
});
const rest = await createRestHandler(context, { env: process.env, loopback: true });

// on node:http with the checks of this page (body cap, slow clients, a graceful stop):
const server = await serveFetch(rest, { host: "127.0.0.1", port: 3333, bodyBytes: 2_097_152 });
// or in a framework: return rest.fetch(request, { address });
```

- `bodyBytes` is a number, or `(request, info) => number`: decided once per request after the
  precheck, where `peekSignIn(info)` gives the sign-in the precheck kept (`{ caller }`, or undefined).
  A function gives a caller who is not signed in at most `BODY_BYTES` (2 MiB) and a signed-in one at
  most `MAX_BODY_BYTES` (64 MiB); `bodyBytesOf(options)` is the server's own (`rest.data.maxBytes` for a REST caller that may [send data](#data), else 2 MiB).
- Each request runs inside `withRequestId(id, fn)`: `requestId()` gives its id anywhere in its work,
  a code source's `load` included (for the host's own log lines), and every log line written inside
  it names it. `errorDetails({ retryable, retryAfter })` builds an `OperationError`'s details with
  that id. `callerFields(caller)` is what a log line may hold of a caller: the client, and `subject` where
  `audit.subject` named the person when the token was verified.
- The handlers (`createRestHandler`, `createServerHandler`, pivotkit-mcp's `createHttpHandler`) run
  each request in its scope (`requestScopeFor(request, info, { trustProxy })`: its id, the trace id
  of a valid `traceparent`, a checked `X-Request-Id`, `info.address` and, with `http.trustProxy`, the
  forwarded client as `address`) and set `X-Request-Id` on every answer; `serveFetch` does the same for any
  handler (pass its `trustProxy`). The context's runtime takes `service` (`{ name, version }`, the
  program on every line) and `env` (where `NO_COLOR` is read).
- With `auth.groupProfiles`, answer a verified token whose groups are unknown before you make its
  caller: `groupRefusal(options.auth, authInfo)` gives the text of the 403, or null. `callerOf`
  throws `NOT_ALLOWED` for such a token, so it never gets the sources' own policy.
- A secret in your options is a reference, `{ "env": "NAME" }` or `{ "file": "path" }` (`SECRET_REF`);
  `readSecret(ref, options, env)` reads it on every use (a rotated file works without a restart),
  trims one trailing newline and refuses a value with another line break or a NUL; its error names
  the reference, never the value.

A configured source may be an operator's backend, an [HTTP source](sources.md#http)
(`sources.<id>.http`, with typed `params`), or, for a library host, a function instead of a file, a
[code source](sources.md#code):
`load(params, { caller, signal })` returns an array of row objects, `{ rows, asOf }` or columnar data
`{ columns, types, data }` with one array per column (not `encode()`'s result, so hidden fields can
be dropped). `load` runs in the host's thread and its `signal` is aborted after `timeMs` (30 s by
default); the report over its data is computed in a worker under `compute.timeMs` and
`compute.memoryMb` ([where it runs](sources.md#code-thread)). The data is kept per caller, values and policy levels while `version(params,
{ caller })` gives the same value or for `ttl` seconds (`cacheShared: true`: one copy for all
callers), parallel calls share one load, and after a transient failure the last good data stands in
for up to `maxStale` seconds, with `stale` in the result. A `SourceError` answers its code with its
`publicMessage`; anything else `load` throws answers 502 `SOURCE_UNAVAILABLE` with a fixed text, its
class in the log, its message with `log: "debug"`.

- The one static token without `auth.tokens` is `$PIVOTKIT_TOKEN` (`createContext(options,
  { tokenEnv })` names another); tokens are read from `env` of `createRestHandler`.
- `loopback` says whether the server listens on loopback only; it decides whether `auth: none` is
  allowed, so it must match the address you listen on.
- `rest.fetch(request, { address })` takes the client's address for the limit on refused tokens;
  without it, refused tokens are not limited (a warning says so once).
- The Host check reads the request's `Host` header (a `Request` built in code without one: its URL's
  host); it accepts `localhost`, `127.0.0.1`, `[::1]`, the host of `http.publicUrl` and
  `http.allowHosts`.
- `createServerHandler(options, { env, stderr, loopback })` is the handler of `pivotkit-server serve`:
  REST and, when pivotkit-mcp is installed, MCP over one context, with `/healthz` and `/readyz`; hand
  it to `serveFetch` or your own server. To combine them yourself, build the context with pivotkit-mcp's
  `createMcpContext` (its `createHttpHandler` needs the MCP server factory it adds) and give it to both
  `createHttpHandler` and `createRestHandler`. `openApiDocument(options)` builds the OpenAPI document,
`REST_ROUTES` lists the routes, and `present(context, operation, input, caller)` runs an operation for
a caller (`callerOf("none")` without sign-in) and gives `{ text, result }` as both endpoints do.
`serve(options, { env, stderr })` is `pivotkit-server serve` in code.

## PowerShell Universal { #psu }

A PowerShell Universal script, endpoint or app calls the REST service with `Invoke-RestMethod`
instead of running Node on the PSU server: keep the token in a PSU secret, call
`POST /api/v1/views/render/file` with a token whose profile has `results: true` and hand the file to
the user, or `POST /api/v1/views/render` to save it in the service's output directory. See
[Getting started: REST service](../getting-started/rest.md#powershell) for the calls in PowerShell,
and [Getting started: MCP server](../getting-started/mcp.md#psu) for running the service next to PSU.
The PSU module's report pages load their data from the PSU app, with the person's own rights; the
REST service's policy does not apply to them.

## Security { #security }

See [Security: the REST service](../security.md#rest) for what the service protects against and what
it does not, and [Privacy](../privacy.md) for what an operator decides about the data it serves.
