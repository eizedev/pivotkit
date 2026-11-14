---
title: pivotkit-server (REST)
description: The pivotkit REST service - routes, the OpenAPI 3.1 document, sign-in with tokens or OAuth 2.1, policy profiles, downloads, CORS, limits, errors as problem details, logging, and embedding pivotkit-server in your own Node server.
---

# pivotkit-server (REST)

`pivotkit-server` serves pivotkit's reports to programs over HTTP: a script, a PowerShell
Universal endpoint, a scheduler or a web app lists data sources, checks a [view](view-file.md),
renders it into a file and makes links. It runs the same operations as the
[MCP server](mcp.md) and the [command line](cli.md), with the same exposure policy, so a program sees
of a source what the operator allows. The package also holds what the MCP server is built on, so
`pivotkit-server serve` runs the REST service and, when `pivotkit-mcp` is installed beside it, the MCP
endpoint on the same port.

To try it step by step, see [Getting started: REST service](../getting-started/rest.md); to run it as a
container, see [Container image](container.md). This page is the reference.

```bash
npm install --global pivotkit-server pivotkit-mcp
PIVOTKIT_TOKEN=... pivotkit-server serve --config pivotkit.json --auth token   # http://127.0.0.1:3333/api/v1
```

Node 22 or later. It brings [pivotkit-report](report.md), pivotkit-cli's file handling,
pivotkit-xlsx, ECharts 6.1.0 and jose (for OAuth); not the MCP SDK.

## Routes { #routes }

Every route is under `/api/v1` and answers JSON. The routes are RPC-style (`POST /views/validate`),
one per operation of the [operation table](report.md#operations):

| Route | Operation | What it does |
| --- | --- | --- |
| `GET /sources` | `list_sources` | The sources the caller may use: id, title, whether a link or a schedule works |
| `GET /sources/{id}` | `describe_source` | A source's fields with their type, level and counts, the aggregators and filters each works with, example views |
| `POST /sources/describe` | `describe_source` | The same, with `{ "source": "<id>" }` |
| `GET /views/guide` | `get_view_guide` | How to write a view: its keys, the vocabulary, example views |
| `POST /views/validate` | `validate_view` | Errors and warnings of a view against a source, each with its place and, for a misspelt name, the name meant (`suggestion`) |
| `POST /views/describe` | `describe_view` | A view in plain parts with the same findings |
| `POST /views/render` | `render_view` | The report as `xlsx` (default), `html`, `csv`, `json` or `svg`, saved in the output directory |
| `POST /views/render/file` | `render_view` | The same report as the answer itself, a download ([below](#downloads)) |
| `POST /views/link` | `create_link` | A link that opens the view in the source's report page |
| `POST /schedules/draft` | `draft_schedule` | A draft of a scheduled report for a person to approve; runs and sends nothing |

A POST takes its input as JSON (`Content-Type: application/json`, at most 2 MiB). The input and the
answer of each route are in the [OpenAPI document](#openapi). A view with errors is no error: the
answer is 200 with `ok` or `valid` false and `findings` that say what to fix (the file route answers
422). `source` is the id of a source the operator configured: files by path (`file:`) are refused
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
  "output": { "name": "sales.xlsx", "format": "xlsx", "mediaType": "..." },
  "message": "The report is saved as sales.xlsx in the output directory. Its content is not part of this answer, since the operator does not show the values of Sales." }
```

`render_view` saves the file in the server's output directory (`output.dir`) and says where
(`output.name`, and `output.url` when `output.baseUrl` is set). The file's name is `name` from the
input, else `title`, else the view's name, else the source's; a name that is taken gets `-2`, `-3`
and so on, since no file is ever replaced. Check `ok` in the answer: a view with errors answers 200
with `ok: false` and `output: null`. The caller fetches the file from there or
uses the [file route](#downloads). The field names in these examples are made up: the fields of your
source and views built from them are in `GET /sources/{id}` (`fields`, `examples`).

A csv result is the report's layout, as the HTML report and the workbook show it: a header row per
column field, a row of labels, then a row per group with a total row and column; it starts with a
UTF-8 byte order mark, so a spreadsheet opens it as UTF-8.

A csv or json result comes back inline (`inline.text`) only when the operator sets
`rest.inline: true` and every field the view uses is shown. `withheld` lists what is left out of the
answer because the view uses a field whose values the policy does not show. For such a view, the
findings that would tell what the data holds (an item spelt differently, a filter that keeps nothing)
are left out too: a filter on an item that does not exist validates and renders an empty report.

## Exposure policy and profiles { #profiles }

The exposure policy is the [MCP server's](mcp.md#policy): per field `show`, `summary` (default) or
`hide`, per source over the server's. A REST caller is a program, not a model, but the same rules
hold: a field at `summary` keeps its values out of every answer.

A **profile** gives one caller more (or less) than the default: a named policy of the same shape in
`policy.profiles`, bound to a static token (`auth.tokens[].profile`), an OAuth client
(`auth.clientProfiles`) or an OAuth scope (`auth.scopeProfiles`). It is laid over each source's
policy:

- a field the source's policy hides stays hidden in every profile (it is dropped when the data is
  read);
- any other field takes the profile's level for it, else the profile's `default`, else the source's
  level;
- `items`, `rows`, `counts`, `inline` and `results` are the profile's where it sets them (a profile with `results: true` may download from a source whose own policy says `results: false`);
- a caller without a profile gets the server's policy, never more. An OAuth token whose scopes name
  two different profiles gets none.

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
| `policy.profiles.<name>` | none | A profile: `default` (show or summary), `fields`, `items`, `rows`, `counts`, `inline`, `results` |
| `policy.results`, `sources.<id>.policy.results` | false | Downloads through the file route for callers without a profile, per source |
| `auth.tokens[].profile` | none | A static token's profile |
| `auth.clientProfiles` | none | OAuth client id (`azp` or `client_id`) to profile: `{ "report-bot": "export" }` |
| `auth.scopeProfiles` | none | OAuth scope to profile: `{ "pivotkit:export": "export" }` |

## Downloads { #downloads }

`POST /views/render/file` takes the input of `/views/render` and answers with the file itself, as an
attachment. It is allowed only for a caller whose policy has `results: true` (a profile's, a source's
or the server's), whatever fields the view uses: an answer that depended on the view's fields would
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
issued for the MCP endpoint is refused by REST, and one for REST by the MCP endpoint. A token without
the required scopes gets 403 `INSUFFICIENT_SCOPE` with `WWW-Authenticate: Bearer
error="insufficient_scope", scope="..."` naming them.

Set `auth.requireTyp: "at+jwt"` where the provider marks its access tokens so (RFC 9068), so an ID
token with the right audience is refused.

Every token that may render can fill the output directory up to `output.maxFiles`; then rendering
into it answers 409 `NO_OUTPUT` for everyone until files are removed. Set `output.maxAgeDays`, and
give `render_view` a scope of its own (`auth.toolScopes`) when not every caller needs it. The server
holds at most 256 connections, and a client has 15 seconds to send its headers: on a network you do
not trust, put a reverse proxy in front.

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
[MCP](mcp.md#configuration)), the REST service limits each caller (a static token's name, an OAuth
client id, or `local` without sign-in):

| Key | Default | What it is |
| --- | --- | --- |
| `rest.rateLimit.perMinute`, `.burst` | 120, 30 | Requests per minute, with up to `burst` at once after a pause |
| `rest.rateLimit.failedAuthPerMinute` | 30 | Refused tokens per address and minute; beyond, a wrong token from that address gets 429 instead of 401 (a right one still works) |
| `rest.concurrency` | 4 | Requests of one caller at once |
| `rest.inline` | false | csv and json results inline in the answer, where the policy allows |

Over a limit the answer is 429 `RATE_LIMITED` with `Retry-After`. The counts live in the memory of
one process: two instances behind a load balancer count on their own. The address is the socket's,
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

| Status | Code | When |
| --- | --- | --- |
| 400 | <a id="error-invalid-input"></a>`INVALID_INPUT` | The body is not valid JSON, is no JSON object, or does not fit the route's schema (an unknown key, a wrong type, nested deeper than 64 levels, also inside a view given as JSON text) |
| 401 | <a id="error-invalid-token"></a>`INVALID_TOKEN` | No token, an unknown or expired one, another scheme, a token in the address |
| 403 | <a id="error-insufficient-scope"></a>`INSUFFICIENT_SCOPE` | The token lacks a scope the service or the operation needs |
| 403 | <a id="error-not-allowed"></a>`NOT_ALLOWED` | The file route without `results: true` |
| 403 | <a id="error-files-not-allowed"></a>`FILES_NOT_ALLOWED` | A `file:` source |
| 403 | <a id="error-forbidden-host"></a>`FORBIDDEN_HOST` | A `Host` the server does not answer to (DNS rebinding protection; `http.allowHosts`, `http.publicUrl`) |
| 403 | <a id="error-forbidden-origin"></a>`FORBIDDEN_ORIGIN` | A browser origin not in `rest.cors.origins` |
| 404 | <a id="error-not-found"></a>`NOT_FOUND` | No such route |
| 404 | <a id="error-source-not-found"></a>`SOURCE_NOT_FOUND` | No such source, or one the caller lacks the scopes for |
| 404 | <a id="error-file-not-available"></a>`FILE_NOT_AVAILABLE` | The source's file is missing or changed while read |
| 405 | <a id="error-method-not-allowed"></a>`METHOD_NOT_ALLOWED` | GET for a POST route or the other way round (`Allow` names the method) |
| 409 | <a id="error-no-output"></a>`NO_OUTPUT` | No output directory for a file, or the directory is full |
| 409 | <a id="error-no-link"></a>`NO_LINK`, <a id="error-not-schedulable"></a>`NOT_SCHEDULABLE` | A link for a source without a page; a schedule over a source that cannot have one |
| 413 | <a id="error-body-too-large"></a>`BODY_TOO_LARGE`, <a id="error-limit-exceeded"></a>`LIMIT_EXCEEDED` | The body over 2 MiB; a file, a view or the work over a limit |
| 415 | <a id="error-unsupported-media-type"></a>`UNSUPPORTED_MEDIA_TYPE`, <a id="error-unsupported-format"></a>`UNSUPPORTED_FORMAT` | A POST whose `Content-Type` is not `application/json` (curl's `-d` alone sends a form); a source file in no data format |
| 422 | <a id="error-invalid-file"></a>`INVALID_FILE`, <a id="error-not-regular-file"></a>`NOT_REGULAR_FILE`, <a id="error-hard-link"></a>`HARD_LINK`, <a id="error-invalid-template"></a>`INVALID_TEMPLATE` | The source's file or print template cannot be used |
| 422 | <a id="error-view-has-errors"></a>`VIEW_HAS_ERRORS` | The file route for a view with errors (with `findings`) |
| 429 | <a id="error-rate-limited"></a>`RATE_LIMITED` | A [limit](#limits) |
| 500 | <a id="error-internal"></a>`INTERNAL` | Anything else; the details only in the log with `--log debug` |
| 503 | <a id="error-busy"></a>`BUSY`, <a id="error-not-ready"></a>`NOT_READY`, <a id="error-auth-not-ready"></a>`AUTH_NOT_READY` | No worker free; starting or stopping; the OAuth issuer not loaded yet |
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
[container image](container.md) runs them:

| Command | What it does |
| --- | --- |
| `pivotkit-server serve [flags]` | HTTP on one port: `/api/v1`, `/openapi.json`, and with pivotkit-mcp installed `/mcp` and its quick-start page; `/healthz` and `/readyz` |
| `pivotkit-server check-config [flags]` | What `serve` would expose (sources, fields by level, profiles, REST settings), then exit; 1 when a file it names is missing |
| `pivotkit-server mcp [flags]` | [pivotkit-mcp](mcp.md)'s runner (stdio by default) |
| `pivotkit-server cli <command> ...` | The [command line](cli.md) `pivotkit` |
| `pivotkit-server healthcheck [url]` | Exit 0 when `GET /healthz` answers (default `http://127.0.0.1:$PIVOTKIT_PORT/healthz`) |

The flags of `serve` are the [MCP runner's](mcp.md#configuration) without `--http`, `--allow-dir`
and `--list-files`, plus `--enable rest,mcp` (`http.enable`: what to serve; default REST, and MCP
when pivotkit-mcp is installed). The configuration file is `--config` or `$PIVOTKIT_CONFIG`; the
one static token without `auth.tokens` is `$PIVOTKIT_TOKEN`; `$PIVOTKIT_PORT` sets the port when
neither the flag nor the file does. It is one configuration for both endpoints: `rest.*` is read by
the REST service only, `http.page` and `http.allowOrigins` by the MCP endpoint only.

`/healthz` answers `{ "ok": true }` while the process runs; `/readyz` answers 200 when it can take
work (`{ "ok": true, "checks": { "auth": true, "workers": true, "output": true } }`: the OAuth issuer
loaded, workers up, the output directory writable) and 503 otherwise. On SIGTERM the server takes no
new connection and lets running requests finish for up to `http.graceMs` (25 seconds by default).

| Key | Default | What it is |
| --- | --- | --- |
| `http.enable` | `["rest"]`, plus `"mcp"` when installed | What `serve` serves |
| `http.trustProxy` | false | Read the client's address from `X-Forwarded-For` (the last entry) for the limits and the log |
| `http.graceMs` | 25000 | How long a stop waits for running requests |
| `output.maxAgeDays` | none | Delete reports and drafts (`.xlsx`, `.html`, `.csv`, `.json`, `.svg`) older than this from the top level of the output directory, at start and every hour; other files and subdirectories stay. Use a directory of its own: the server refuses to start when the output directory holds a source file, a token file or the configuration file |
| `rest.openapi` | `"auth"` | Who gets `/openapi.json` |

Behind a reverse proxy: forward `/api/v1/`, `/openapi.json` and `/.well-known/oauth-protected-resource/api/v1`
(with MCP also `/mcp`, `/.well-known/` and `/`), keep the `Host` header (or add the proxy's name to
`http.allowHosts`), and set `http.publicUrl`. Set `http.trustProxy` when the proxy adds the client's
address to `X-Forwarded-For`: otherwise every client has the proxy's address and shares one count of
refused tokens (the [limit](#limits) per address). Only when the service is reachable through the proxy alone:
a client that reaches the server directly can write any `X-Forwarded-For`. With it, the log names the
client's address. Let the proxy take bodies of 2 MiB (nginx's default is 1 MiB). For nginx:

```nginx
location ~ ^/(api/v1/|openapi\.json$|mcp$|\.well-known/|healthz$|readyz$|$) {
    proxy_pass http://127.0.0.1:3333;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 60s;
    client_max_body_size 2m;
}
```

Without containers, on Windows next to PowerShell
Universal, `pivotkit-server serve` from a global npm install runs as a service with a service
manager of your choice; its file checks are measured on Linux and macOS
([#209](https://github.com/eizedev/pivotkit/issues/209) tracks junctions and hard links on Windows).

## Logging { #logging }

One JSON line per event on stderr, as the [MCP server's](mcp.md#logging): `started` (version,
address, what it serves, auth mode), `request` (operation, route, client, source id, status, error
code, time in ms), `download` (operation, client, source, format, bytes), `refused` (a request refused
by the Host, Origin or token check) and `warning`. The client is the static token's name or the OAuth
client id, never the person's id; no line holds a view, a value, a token, a path or, unless
`http.trustProxy` is set, a client address.

## In your own server { #embed }

`pivotkit-server` is a library too. `createContext(options)` checks the options and starts the
workers; `createRestHandler(context)` from `pivotkit-server/rest` returns a fetch handler (a
`Request` in, a `Response` out) for any server that speaks them:

```js
import { createContext, serveFetch } from "pivotkit-server";
import { createRestHandler } from "pivotkit-server/rest";

const context = await createContext({
    sources: { sales: { load: async () => rows, version: () => rowsVersion, policy: { fields: { Region: "show" } } } },
    output: { dir: "/srv/reports" },
    auth: { mode: "token" }
});
const rest = await createRestHandler(context, { env: process.env, loopback: true });

// on node:http with the checks of this page (body cap, slow clients, a graceful stop):
const server = await serveFetch(rest, { host: "127.0.0.1", port: 3333, bodyBytes: 2_097_152 });
// or in a framework: return rest.fetch(request, { address });
```

A source may be `load: async () => rows` instead of `file`: an array of row objects, or columnar data
`{ columns, types, data }` with one array per column (not `encode()`'s result, so hidden fields can
be dropped). It runs in the host's thread, not in a worker. With `version: () => key` the encoded data
is kept until the key changes (per process, by source id and key); without it, every request loads
again. An error thrown by `load` answers 500 with a fixed text; its class is logged, its message with
`log: "debug"`.

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
[Getting started: REST service](../getting-started/rest.md#powershell) for the calls in PowerShell.
The links of the PSU module's reports open as before.

## Security { #security }

See [Security: the REST service](../security.md#rest) for what the service protects against and what
it does not, and [Privacy](../privacy.md) for what an operator decides about the data it serves.
