# Changelog

All notable changes to `pivotkit-mcp` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `create_link` and `draft_schedule` take a `layout` instead of a `view`, as `render_view` does.
  The schema's placeholder `layout` that refused every layout is gone (#469).
- `render_view`, `create_link` and `draft_schedule` take the name of a view the operator published
  ([named views](https://pivotkit.eize.dev/reference/sources/#views), #616). MCP clients reconnect
  to read the new schemas.

## [0.3.2] - 2026-11-19

### Changed

- Depends on `pivotkit-server` `^0.3.2`. Install pivotkit-server and pivotkit-mcp 0.3.2 in one command
  ([update](https://pivotkit.eize.dev/getting-started/upgrading/#update-global)).

## [0.3.1] - 2026-11-18

### Changed

- Depends on `pivotkit-server` `^0.3.1`. Install pivotkit-server and pivotkit-mcp 0.3.1 in one command
  ([update](https://pivotkit.eize.dev/getting-started/upgrading/#update-global)).

## [0.3.0] - 2026-11-18

### Changed

- Depends on `pivotkit-report` `^0.4.0` and `pivotkit-server` `^0.3.0`.
- `render_view`'s description says the workbook holds the table, no chart. A chart view rendered as
  xlsx has the finding `chartNotInXlsx`. Clients see the description after they reconnect
  ([#360](https://github.com/eizedev/pivotkit/issues/360)).
- `render_view` takes `locale`, `numbers` and `flatHeader`, and every tool result carries
  `requestId`, also at the end of its summary line. Inline csv and json round numbers as the view
  shows them (saved files keep full precision), inline json is on one line, and saved reports and
  drafts are named in lower case without spaces. A `resource_link`'s `title` is the report's title.
  Reconnect a client to see the new inputs; a session that stays connected keeps working ([#478](https://github.com/eizedev/pivotkit/issues/478), [#481](https://github.com/eizedev/pivotkit/issues/481),
  [upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#results-0-8)).
- Behaviour change from pivotkit-server: a source hidden by default whose named fields are all
  `show` or `hide` is open, and its reports get plain download links. "Show everything except"
  stays closed
  ([#510](https://github.com/eizedev/pivotkit/issues/510),
  [upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#hidden-open)).
- Behaviour change from pivotkit-server: over HTTP, one address may hold at most 32 connections by
  default, none with `http.trustProxy` (`http.maxConnectionsPerAddress`)
  ([#511](https://github.com/eizedev/pivotkit/issues/511),
  [upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#per-address)).
- Behaviour change from pivotkit-server: schedule drafts may take at most half of `output.maxMb`,
  and `output.draftMaxAgeDays` lets waiting drafts expire
  ([#513](https://github.com/eizedev/pivotkit/issues/513),
  [upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#draft-quota)).

### Fixed

- Behaviour change from pivotkit-server: on a busy host, a parameter pattern's time limit no longer
  refuses fast, valid values and patterns. Matches run under 75 ms with retries. A value that runs
  out of time twice, or a request whose pattern checks take over 150 ms, answers `BUSY`
  ([#528](https://github.com/eizedev/pivotkit/issues/528)).

## [0.2.0] - 2026-11-16

### Upgrading from 0.1.1

- Copy the reports you want to keep out of `output.dir` before you update: reports older than
  `output.maxAgeDays` (30 by default) are deleted at the first start; this release's
  `--check-config` counts them. Schedule drafts (`*.pivotkit-out.report.json`) that still wait for
  approval stay
  ([upgrading, from 0.6.1 / 0.1.1](https://pivotkit.eize.dev/getting-started/upgrading/#from-0-6-1)).
- Behaviour change: `mcp.rateLimit` and `mcp.concurrency` count per person, no longer per OAuth
  client; one client's people together get eight times both ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#limits-per-person)).
  Needs pivotkit-server 0.2.0 (`limitKeyOf`).
- The log ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#log)): on a terminal it
  is text unless `log.format` is `json`; JSON lines only gain fields; over HTTP the client's address
  is logged by default (`log.address: "off"` keeps it out).
- Behaviour change: pivotkit-server's `output.maxAgeDays` is 30 by default, so reports older than 30
  days are deleted from `output.dir` at start and every hour. A schedule draft whose `status` is
  still `"draft"` waits for approval and stays; one the host gave another status goes by age. Set
  `output.maxAgeDays: 0` for no age limit ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#max-age-default)).
- Breaking: a trivial static token keeps the server from starting: one with fewer than 8 different
  characters, or one that repeats one piece, "is too easy to guess". The rule stops trivial tokens;
  it does not measure strength. Make one with `npx -y pivotkit-server token new`.
- Behaviour change: where a caller sees a field below `show`, a CSV, TSV or TXT file with a quoted
  value that spans lines is refused with `INVALID_FILE`: an unclosed quote pulled the rows after
  it, hidden values too, into one shown cell.
- Over HTTP with `output.dir` and without `output.baseUrl`, reports come with pivotkit-server's
  [download links](https://pivotkit.eize.dev/reference/delivery/) under `/downloads/`: route that path
  to the server, or set `output.downloads.enabled: false`. With `output.baseUrl`, reports over a
  source with a field that is not `show` carry no `url` any more.
- With OAuth, the issuer's metadata, its keys and the download sign-in's token endpoint are requested
  through the server's guarded requests: an issuer on a loopback or private address needs
  `auth.intranet: true`, the environment's proxy is not used, and a key set over 256 KiB is refused
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#issuer-requests)).
- Behaviour change: a source's print template (`sources.<id>.template`) is checked at start and by
  `--check-config`; one with an unknown placeholder, over 1 MiB or not a regular file keeps the
  server from starting; a missing template file is a warning, as a missing source file ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#template-at-start)).

### Added

- `--state-dir` (`$PIVOTKIT_STATE_DIR`): with `--http` off loopback and no token, the server makes the
  token `admin` there at its first start instead of refusing, and keeps the download links' key and
  the audit key there; over stdio nothing is made
  ([made at the first start](https://pivotkit.eize.dev/reference/rest/#first-start)). Needs
  pivotkit-server 0.2.0 (`prepareHttpServe`).
- `--help` names where a token for `--auth token` comes from: `npx -y pivotkit-server token new`
  ([tokens and keys](https://pivotkit.eize.dev/reference/rest/#credentials)).
- `render_view` takes `save: false`: the csv or json result comes back inline only, with no file,
  no upload and no link, for a result asked for in the chat; csv when no format is given. Where it
  cannot come back inline (xlsx, html or svg, inline results off, a field that is not `show`, a result over the `inline` limits) the call
  fails and says to leave out `save`; it never saves a file instead. The call line has `saved: false`
  ([inline only](https://pivotkit.eize.dev/reference/mcp/#inline-only), [#472](https://github.com/eizedev/pivotkit/issues/472)).
- The log settings of pivotkit-server ([operations](https://pivotkit.eize.dev/reference/operations/)):
  `--log-format`, `--log-address` and `--log warn|error`, with their keys and variables. A `call`
  line has `status` and `outcome` and its level follows the status; over HTTP a call's id is its
  request's, so the answer's `X-Request-Id`, the `call` line and the error's "(request id ...)" name
  one id, and the call line carries the request's `traceId`. `refused` lines give a `reason`, also
  for the per-caller 429s and a body over the cap. The HTTP server ends with a `stopped` line; a
  configuration error at start is a JSON line with `--log-format json` or `PIVOTKIT_LOG_FORMAT=json`.
  Lines name `service` `pivotkit-mcp` when it runs on its own.

- Reports can go to the operator's store (pivotkit-server's `output.upload`,
  [#332](https://github.com/eizedev/pivotkit/issues/332)): render_view then carries the store's link
  in its text and as a `resource_link`; a failed upload is the tool error `UPLOAD_FAILED` with a
  fixed text and the request id. Needs pivotkit-server 0.2.0.

- pivotkit-server's operator controls ([#331](https://github.com/eizedev/pivotkit/issues/331)):
  groups to profiles (`auth.groupProfiles`), `auth.defaultProfile`, the person on `call` lines
  (`audit.subject`), the sources' scopes in the Protected Resource Metadata with
  `auth.offerSourceScopes: true` (off by default), the hint of an empty `list_sources`. A token whose groups are unknown, with
  `auth.groupProfiles` and no default profile, gets 403 `access_denied` without a scope challenge.
  Needs pivotkit-server's `groupRefusal`.

- HTTP sources of pivotkit-server ([#328](https://github.com/eizedev/pivotkit/issues/328)) in
  `sources.<id>.http`, with their parameters in `list_sources`. A `SOURCE_UNAVAILABLE` tool error says
  the fixed text its reason picks (not available right now, the backend refused pivotkit's access,
  the source is not set up correctly). A call over HTTP whose connection closed stops waiting for a source's load,
  and the load is aborted when no other call waits for it. Needs pivotkit-server
  0.2.0 (`serverTextOf` with a reason).

- Data in the request ([#326](https://github.com/eizedev/pivotkit/issues/326)): the tools that take
  a source offer `data`, a small table of the model's own with `source` `inline:` (at most 500 rows,
  5,000 cells and 256 KiB; `mcp.data` lowers the cap or switches it off). Its description says that
  the operator's exposure policy does not apply to it. The `call` log line counts its rows and
  columns. The instructions and the skill explain it where it is offered. Needs pivotkit-server
  0.2.0 (it imports `inlineLogFields`); the range is `^0.2.0` and pivotkit-server is released first.
- render_view and draft_schedule results with a download link carry it in the text and, after it, as
  a `resource_link` for clients of protocol 2025-06-18 or later (`size` only for a report the
  assistant was shown in full); the message names the file, the address is `output.url`
  ([#327](https://github.com/eizedev/pivotkit/issues/327)). The HTTP transport serves `/downloads/`
  before its Origin check and body cap (a browser's form, not an MCP client). Release pivotkit-server
  first: this version needs its new exports (`createDownloadHandler`, `DOWNLOAD_BODY_BYTES`).

- The exposure policy's level `values` and the opt-in automatic rule (`policy.autoValues`) of
  pivotkit-server ([#362](https://github.com/eizedev/pivotkit/issues/362)); `--check-config` prints
  each field's level and why.
- The instructions and the skill explain the levels once per conversation, `values` included, and
  `itemUnknown`.
- Every tool result over a source's data has `dataAsOf` (when the data is from); render_view's
  message ends with it in words. The tools that take a source take `params` when a configured code
  source declares parameters ([pivotkit-server](https://pivotkit.eize.dev/reference/mcp/#configuration)).
- Each tool call has a request id on its log lines, and every tool error ends with
  `(request id ...)`, in one parenthesis with the source and whether to try again (inside the
  message's own closing parenthesis where it ends in one), for the person to give the operator.
  Unknown options read `unknown option "--bogus"; run "pivotkit-mcp --help"`; the help's Usage
  lines name `--version`. render_view's summary line leaves out the link's note, which its message says. An error of status 500 or more says pivotkit-server's fixed text
  (`INTERNAL`: "internal error"), with the source and whether trying again may work; `BUSY`,
  `NOT_READY` and `TIMEOUT` keep their own words. Release pivotkit-server first: this version needs
  its new exports (`serverTextOf`, `withRequestId`, `callerFields`, `offeredScopes`).
- Code sources of a library host have a time limit, share parallel loads, keep data per caller and
  give last good data with `stale` after a transient failure; a failing load is `SOURCE_UNAVAILABLE`;
  the report over their data is computed in a worker under `compute.timeMs` and `compute.memoryMb`
  ([code sources](https://pivotkit.eize.dev/reference/sources/#code)).

### Changed

- `--check-config` prints pivotkit-server's new layout: whether the server starts, the counts and
  every `PROBLEM` first, one fact per line; over stdio a `Transport:` section says there are no
  download links and no signed-in person. With `--http` it also asks the OAuth issuer for its
  metadata and warns when it cannot be loaded ([#424](https://github.com/eizedev/pivotkit/issues/424)).
- The log names a tool call's source by a configured id, `inline:` or `file:` (no file name), else
  `unknown`, never the model's text; a request the protocol layer refuses is logged with its
  error's class and the SDK's name for the refusal, its message (which can quote the body) only with
  `--log debug` ([#422](https://github.com/eizedev/pivotkit/issues/422)).
- The README links the page on what reaches an AI model at each level of the exposure policy, and
  how to give each client its own profile ([#338](https://github.com/eizedev/pivotkit/issues/338)).
- Depends on `pivotkit-report` `^0.3.0` and `pivotkit-server` `^0.2.0`.

### Fixed

- The npm description, the quick-start page, the skill, the plugin and the instructions sent to the
  model said the model never reads the data. Through pivotkit it reads only what the operator's
  policy shows; they now say so. A client gets the new instructions when it reconnects.
- `--http` exited 0 on SIGTERM or SIGINT even when closing the server failed. It now logs the error
  and exits 1.
- A request with a Host the server does not answer to got the SDK's JSON-RPC "Invalid Host: <name>"
  on every route. `/mcp` still answers JSON-RPC, the other routes (`/`, `/healthz`,
  `/.well-known/...`) answer problem+json, and both add "add the name with http.allowHosts or
  --allow-host, or set http.publicUrl". The `refused` line carries it as `hint`.
- Over HTTP on loopback with `$PIVOTKIT_MCP_TOKEN` set and no `auth.mode`, the start warns:
  "PIVOTKIT_MCP_TOKEN is set but auth is none; use --auth token (or auth.mode token)".
- Every refusal of the protocol layer is one `refused` line with its status, a reason, the path
  `/mcp`, the error's class and the SDK's name for it (its message only at debug, on the same line):
  a body that is not JSON, an unsupported `mcp-protocol-version`, a wrong `Content-Type` (415) or
  `Accept`. What you will notice: these lines replace the `warning` "request refused by the
  protocol layer" ([#456](https://github.com/eizedev/pivotkit/issues/456)).

## [0.1.1] - 2026-11-14

### Upgrading from 0.1.0

What an operator checks; the [upgrade page](https://pivotkit.eize.dev/getting-started/upgrading/#from-0-6-0) has the details.

- Over HTTP, each caller is limited (`mcp.rateLimit`: 120 per minute, burst 30; `mcp.concurrency`: 4);
  over a limit the answer is 429 with `Retry-After`. A method other than `POST` on `/mcp` is 405.
- Reports and drafts are named `<name>.pivotkit-out.<format>`; reports written by 0.1.0 are neither
  counted nor deleted: remove them by hand once. `output.maxMb` (default 1024) is new. A missing
  `--output` directory is made at start instead of failing it; `output.create: false` keeps the
  error.
- A static token with characters a bearer token cannot carry is refused at start.

### Added

- A missing `--output` directory is made at start with mode 0700 (0755 narrowed by the umask when
  `output.baseUrl` is set), as pivotkit-server does; the former error is opt-in with
  `output.create: false`.
- Request limits over HTTP, as the REST service has them: `mcp.rateLimit.perMinute`, `.burst`,
  `.failedAuthPerMinute` and `mcp.concurrency`; over a limit the answer is 429 with `Retry-After`
  ([#270](https://github.com/eizedev/pivotkit/issues/270)). `/mcp` answers a method other than
  `POST` with 405 before it takes a request slot.

### Changed

- A token is checked once per request; the Host list, the body cap, the default port and the common
  flags come from pivotkit-server ([#291](https://github.com/eizedev/pivotkit/issues/291)).
- The output directory and `--check-config` follow pivotkit-server's: reports and drafts are named
  `<name>.pivotkit-out.<format>`, a full directory deletes its oldest reports (never drafts), `output.maxMb`, `NO_OUTPUT` with a hint for a directory the server
  cannot write, and a warning for a policy rule that names no column
  ([#269](https://github.com/eizedev/pivotkit/issues/269), [#288](https://github.com/eizedev/pivotkit/issues/288),
  [#297](https://github.com/eizedev/pivotkit/issues/297), [#298](https://github.com/eizedev/pivotkit/issues/298)).

### Fixed

- `create_link` and `draft_schedule` given a `layout` answer with one short error that says to make
  the view with `validate_view` first, instead of the input schema's list of what is missing;
  `draft_schedule` with a `layout` that also lacks schedule fields still lists those fields first
  ([#303](https://github.com/eizedev/pivotkit/issues/303)).
- The HTTP server's connection limits, request targets, start-time token checks and issuer
  metadata refresh follow pivotkit-server's ([#289](https://github.com/eizedev/pivotkit/issues/289),
  [#299](https://github.com/eizedev/pivotkit/issues/299), [#271](https://github.com/eizedev/pivotkit/issues/271)).
- `render_view` says `noRowsKept` when the filters of a view of shown fields keep no rows, and
  `suggest_view` reads no span or counts the policy keeps back (pivotkit-server's,
  [#302](https://github.com/eizedev/pivotkit/issues/302), [#296](https://github.com/eizedev/pivotkit/issues/296)).

## [0.1.0] - 2026-11-14

First release.

### Added

- The tool `suggest_view`, and a `layout` (a view by field names) for `validate_view` and
  `render_view`; the skill names both ([#253](https://github.com/eizedev/pivotkit/issues/253)).
- The MCP server `pivotkit-mcp` ([#165](https://github.com/eizedev/pivotkit/issues/165), step 3):
  the tools `list_sources`, `describe_source`, `get_view_guide`, `validate_view`, `describe_view`,
  `render_view`, `create_link` and `draft_schedule` from pivotkit-report's operation table, over
  stdio and Streamable HTTP (the official SDK v2: protocol 2026-07-28 and the 2025 era).
- Sources by id from the operator's configuration, or `file:` paths inside allowed directories (real
  path, no hard links, one answer for a missing or outside file).
- The exposure policy per field: `show`, `summary` (default) and `hide`; results that touch a field
  the model may not see are written to a file with their shape withheld.
- Reports computed in worker threads with memory and time limits (`compute`), written as new files
  into the output directory, never replacing one.
- HTTP: Host and Origin checks, a quick-start page at `/`, `/healthz`; authentication `none`, static
  tokens (named, with scopes) or OAuth 2.1 as a protected resource (RFC 9728 metadata, JWT access
  tokens checked against the issuer's keys, scopes per tool and source).
- The skill `pivotkit-reports`, served as MCP skills, the prompt `pivotkit_report` and the server's
  instructions, and installable as a Claude Code plugin.
- `--check-config` prints what the server would expose (sources, fields by level, files, output,
  auth, token scopes no source names) and exits 1 when a file or directory it names is missing.
- `pivotkit-mcp/policy`: the exposure policy for another front end over the same sources.
- Built on `pivotkit-server`, which holds what the MCP server and the REST service share (options,
  sources, policy, workers, output, sign-in); `pivotkit-mcp/policy` is `pivotkit-server/policy`
  ([#268](https://github.com/eizedev/pivotkit/issues/268)). Policy profiles per token, OAuth client or
  scope apply to the tools too.
- On SIGTERM the HTTP server lets running requests finish (`http.graceMs`, 25 seconds by default);
  two `Authorization` headers are refused, also when node:http would keep only the first; an input
  nested deeper than 64 levels is `INVALID_INPUT` before it reaches a worker.

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-mcp@0.3.2...HEAD
[0.3.2]: https://github.com/eizedev/pivotkit/compare/pivotkit-mcp@0.3.1...pivotkit-mcp@0.3.2
[0.3.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-mcp@0.3.0...pivotkit-mcp@0.3.1
[0.3.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-mcp@0.2.0...pivotkit-mcp@0.3.0
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-mcp@0.1.1...pivotkit-mcp@0.2.0
[0.1.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-mcp@0.1.0...pivotkit-mcp@0.1.1
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-mcp@0.1.0
