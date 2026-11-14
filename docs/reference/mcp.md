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

To set it up step by step, see [Getting started: MCP server](../getting-started/mcp.md). This page
is the reference.

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
| `list_sources` | The sources the caller may use: id, title, whether a link or a schedule works | - |
| `describe_source` | A source's fields with their type, level and counts, the aggregators and filters each works with, example views from its own fields | - |
| `get_view_guide` | How to write a view: its keys, the vocabulary (aggregators, filter types, date groupings), five example views | - |
| `validate_view` | Errors and warnings of a view against a source, each with its place and, for a misspelt name, the name meant (`suggestion`) | - |
| `describe_view` | A view in plain parts (rows, columns, values, filters in words) with the same findings | - |
| `render_view` | The report as `xlsx` (default), `html`, `csv`, `json` or `svg`, into the output directory; inline where the policy allows | a new file |
| `create_link` | A link that opens the view in the source's report page (only for sources with `link`) | - |
| `draft_schedule` | A draft of a report that runs on a schedule (when, formats, recipients by name), for a person to approve in the host; runs and sends nothing | a new file |

Every tool has an input and an output JSON Schema (draft 2020-12) and returns its result as
structured content and as one text block: a short sentence with counts and ids (never a name or value
from the data), then the JSON. A view with errors is not a tool error: `ok` or `valid` is false and
`findings` say what to fix. The tools are one table shared with the command line
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

## Exposure policy { #policy }

The operator sets, per field, how much of it the model may see. A source's `policy` goes over the
server's `policy`; field names are matched without regard to case.

| Level | describe_source shows | Findings | Results |
| --- | --- | --- | --- |
| `show` | name, type, counts, up to `items` values, the smallest and largest value | names and values (a misspelt item gets the item meant) | csv and json come back inline when they fit `inline` |
| `summary` (default) | name, type, counts | names; no check of an item against the data | written to a file only; rows, columns and size withheld |
| `hide` | not listed; `hiddenFields` counts them | never named | the column is dropped when the data is read |

| Key | Default | What it does |
| --- | --- | --- |
| `default` | `"summary"` | The level of a field without its own |
| `fields` | `{}` | Levels by field name: `{ "Region": "show", "Customer": "hide" }` |
| `items` | `20` | Values listed per `show` field |
| `rows` | `true` | Show the number of rows |
| `counts` | `true` | Show distinct and blank counts per field |
| `inline` | `{ "cells": 500, "bytes": 32768 }` | The largest csv or json result that may come back inline; `false`: never |
| `results` | `false` | The REST service's file route may hand out the rendered file ([downloads](rest.md#downloads)) |

A **profile** (`policy.profiles.<name>`, a policy of the same shape) gives one caller more or less
than this: bound to a static token (`auth.tokens[].profile`), an OAuth client
(`auth.clientProfiles`) or scope (`auth.scopeProfiles`), laid over each source's policy; a field a
source hides stays hidden in every profile, and a caller without a profile gets the server's policy.
See [profiles](rest.md#profiles).

A view that uses a field the model may not see in full (rows, columns, values, filters, sorting, a
date grouping's source field) has its result **withheld**: `render_view` writes the file and returns
its name, `withheld: ["rows", "columns", "bytes", "content"]` and a `message` for the user, but no
count, size or content, since even a row count could answer "is this person in the data?".

!!! warning "summary is not confidentiality"
    `summary` keeps values out of what the model reads directly. A model that writes filters over
    other fields and looks at what comes back inline can still learn about the data, and every
    number in a report is real: a small group can identify a person. For a field the model must not
    learn anything about, use `hide`, or leave the column out of the data. Field names are data too.
    Pseudonymised values are not offered.

## Configuration { #configuration }

The runner reads a configuration file (JSON) and its flags; a flag wins, and a list given as flags
adds to the file's. Paths in the file are relative to the file. The configuration is read at start: a
change needs a restart, except token files (read on every request). An unknown key or value is an
error that names the key and the one probably meant.

| Key | Flag | Default | What it is |
| --- | --- | --- | --- |
| `sources.<id>.file` | `--source id=file` | - | A data file (CSV, TSV, TXT, JSON, XLSX) |
| `sources.<id>.title`, `.description` | - | the id | What list_sources says about it |
| `sources.<id>.sheet` | - | first visible | A workbook's sheet |
| `sources.<id>.policy` | - | the server's | The source's exposure policy |
| `sources.<id>.link`, `.linkKey` | - | none | The page that shows this source's reports, for create_link; the report's key there |
| `sources.<id>.template` | - | built-in | An HTML [print template](print-template.md) for render_view's html |
| `sources.<id>.scopes` | - | none | OAuth or token scopes a caller needs to see and use it |
| `files.allowDirs` | `--allow-dir dir` | none | Directories the model may name files in (`file:`) |
| `files.list` | `--list-files` | false | list_sources lists the data files of the allowed directories (not their subdirectories) |
| `files.hardLinks` | - | false | Read files that have a second name |
| `files.scopes`, `files.policy` | - | none, the server's | Scopes and policy of `file:` sources |
| `output.dir` | `--output dir` | none | Where reports and drafts are written |
| `output.baseUrl` | - | none | The address the directory is served at: results carry a `url`, file names start with 22 random characters |
| `output.maxFiles` | - | 1000 | Files the directory may hold before render_view refuses (`NO_OUTPUT`) |
| `output.maxAgeDays` | - | none | Delete files older than this from the output directory (checked at most once an hour, when a file is written) |
| `policy` | - | see above | The server's exposure policy, with its `profiles` |
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
| `auth.*` | `--auth mode` | none | See [Authentication](#auth) |
| `log` | `--log level` | info | `info`, `debug` or `off` |
| - | `--config file` | `$PIVOTKIT_MCP_CONFIG` | The configuration file |
| - | `--check-config` | - | Print what would be exposed (sources, fields by level, files, output, auth) and exit |

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
`serveStdio` or `createMcpHandler`; `createHttpHandler(context)` returns `{ fetch, close }` with every
check of this page; `loadConfig(file)` reads a configuration file into options. A library host may
give a source `load: async () => rows` (rows or columnar data) and `version: () => key` instead of
`file`; such sources run in the host's thread, not in a worker. `createHttpHandler(context, { env })`
reads static tokens from `env` (default `process.env`). `pivotkit-mcp/policy` exports the exposure
policy (`resolvePolicy`, `levelOf`, `exposeSource`, `exposeFindings`, `touchesClosed`) for another
front end over the same sources; it is `pivotkit-server/policy` under another name.

## Limits and errors { #errors }

Views from the model are checked with pivotkit-core's limits for views from outside (`outsideLimits`),
data with its [limits](../concepts/limits.md); the server's own default for files is 50 MiB
(`fileBytes`, `unpackedBytes`). A call's input may hold at most 10,000 array elements and object
members; an HTTP body at most 2 MiB.

A tool error is a result with `isError` and the text `CODE: message` (an input the tool's schema
refuses is answered by the SDK before the tool runs, as `Input validation error: ...`); the message names a file by its
base name only and holds no file content.

| Code | When |
| --- | --- |
| `INVALID_INPUT` | An input the schema allows but the tool does not (a recipient that is an address, a format, an input nested too deeply) |
| `SOURCE_NOT_FOUND` | No such source, or one the caller lacks the scopes for (the same answer) |
| `FILES_NOT_ALLOWED` | `file:` without allowed directories, or without the scopes for files |
| `FILE_NOT_AVAILABLE` | A file missing, outside the allowed directories, or changed while read |
| `NOT_REGULAR_FILE`, `HARD_LINK`, `UNSUPPORTED_FORMAT`, `INVALID_FILE` | The file is a directory or special file, has a second name, is no data format, or cannot be read |
| `LIMIT_EXCEEDED` | A file, a view or the work over a limit; the worker's memory |
| `NOT_ALLOWED` | A tool the caller's token has no scope for |
| `NO_OUTPUT` | No output directory for a file that must go there, or the directory is full |
| `NO_LINK`, `NOT_SCHEDULABLE` | A link for a source without a page; a schedule over a `file:` source |
| `BUSY`, `TIMEOUT` | No worker free within `queueMs`; a call over `timeMs` |
| `INTERNAL` | Anything else: "internal error", the details only in the log with `--log debug` |

## Logging { #logging }

One JSON line per event on stderr (on stdio, stdout is the protocol): `started` (version, transport,
address, auth mode, the number of sources, whether files and an output directory are on), `call`
(tool, source id or the base name of a file, client, `ok`, error code, time in ms), `refused` (an HTTP
request refused by the Host, Origin or token check, with its status) and `warning`. The client is the
static token's name or the OAuth token's client id, never the person's id. No line holds a view, a
value, a token or a full path. The log is the supervisor's to keep and rotate.

## Streamable HTTP { #http }

`--http` serves the MCP endpoint at `/mcp` (POST; GET and DELETE as the SDK answers them), with these
checks in order:

1. **Host**: only the localhost names, the public URL's host and `--allow-host` (protection against
   DNS rebinding, as the [transport spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security-%26-endpoint) asks). It cannot be switched off.
2. **Origin**: a request with an `Origin` header (a browser) is refused with 403 unless its host name
   is in `--allow-origin`; a client that sends none (every non-browser client) passes.
3. **Authentication** for `/mcp` ([below](#auth)).

Host, Origin, the declared size and the token are checked from the headers before the body is
read; at most 256 connections are open at once, and a request has 30 seconds. On SIGTERM the server
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
`/.well-known/` and `/`, keep the `Host` header (or add the proxy's name with `--allow-host`), set
`--public-url`, and turn response buffering off for `/mcp`. The server reads no `X-Forwarded-*`
header: client addresses are in the proxy's log. For nginx:

```nginx
location ~ ^/(mcp|\.well-known/|healthz$|$) {
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
characters; make one with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Tokens are compared
as SHA-256 digests in constant time, never logged, and refused in the address (`?access_token=`) and
when a request carries two `Authorization` headers.
The token's name is the client in the log.

```json
{ "auth": { "mode": "token", "tokens": [
    { "name": "analysts", "env": "PIVOTKIT_TOKEN_ANALYSTS", "scopes": ["sales", "hr"] },
    { "name": "viewers", "file": "/run/secrets/pivotkit-viewers", "scopes": ["sales"] } ] } }
```

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
  Keys are fetched from the JWKS and kept for 10 minutes; a new key is fetched at most every 30
  seconds. A token stays valid until it expires (no revocation check).

| Key | Default | What it is |
| --- | --- | --- |
| `auth.issuer` | - | The issuer, exactly as its metadata writes it (required) |
| `auth.resource` | - | The canonical address of the MCP endpoint, e.g. `https://reports.example.com/mcp` (required) |
| `auth.audience` | `[resource]` | The `aud` values accepted, for providers that put a client id or an `api://` URI there |
| `auth.requiredScopes` | none (a warning at start) | Scopes every request needs, e.g. `["pivotkit"]`; also the scopes the 401 asks for |
| `auth.toolScopes` | none | Scopes per tool: `{ "render_view": ["pivotkit:render"], "draft_schedule": ["pivotkit:schedule"] }` |
| `sources.<id>.scopes`, `files.scopes` | none | Scopes a caller needs to see a source (without them it is not listed and is `SOURCE_NOT_FOUND`) |
| `auth.scopesSupported` | `requiredScopes` | What the metadata lists |
| `auth.scopeClaim` | `scope`, else `scp` | The claim the scopes are read from |
| `auth.algorithms` | RS256, PS256, ES256, EdDSA | Accepted signature algorithms |
| `auth.jwksUri` | the issuer's | Another place for the keys |
| `auth.requireTyp` | none | Require a token type, e.g. `at+jwt` (rejects ID tokens where the provider marks access tokens) |
| `auth.clockTolerance` | 30 | Seconds of clock difference |
| `auth.allowInsecureIssuer` | false | Accept an `http://` issuer: for a test issuer on this machine only |
| `auth.clientProfiles`, `auth.scopeProfiles` | none | The policy profile of an OAuth client id or scope ([profiles](rest.md#profiles)) |

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
