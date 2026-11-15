# Changelog

All notable changes to `pivotkit-server` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Upgrading from 0.1.1

Every field keeps its level and the automatic rule is off; the [upgrade page](https://pivotkit.eize.dev/getting-started/upgrading/#from-0-6-1) has the details.

- html reports print "Data as of" in their details; xlsx files carry the document property
  `DataAsOf`.

- A client reads the optional `field` of a finding, the code `itemUnknown`, `withheld`, `hint`,
  `complete` and `auto` in `describe_source`, and treats a `level` it does not know as `summary`.
- A filter item that is none of a `show` field's values gets `itemUnknown` where its list is
  complete; `itemCase` comes for a `show` field also in a view that uses other fields.
- A withheld render's `message` reads "results over fields that are not fully shown (...) stay in
  the file".
- `check-config` prints more lines: each field's level and why, and each profile's levels.
- Log lines written inside a request (`call`, `request`, `download`, `refused`, `error`) carry
  `requestId`; every REST problem document carries it too. A body over the cap gets a `refused` line.
- `check-config` warns of a static token's file that other users of the machine can read.
- Library hosts with code sources (`load`): `load(params, { caller, signal })` also without declared
  params (`{}`), aborted after 30 s (`timeMs`); data kept per caller unless `cacheShared: true`; last
  good data up to an hour old after a transient failure, with `stale` (`maxStale: 0` turns it off);
  an error thrown by `load` answers `SOURCE_UNAVAILABLE` (502) instead of `INTERNAL` (500); the data
  has a file's limits ([code sources](https://pivotkit.eize.dev/getting-started/upgrading/#code-sources)).
- `checkConfig(options)` checks the options as `createContext` does first and throws the same
  `ConfigError`; its second argument is optional.
- MCP clients may send a small table of their own (`inline:`, below); `"mcp": { "data": false }`
  switches it off. `check-config` prints a "Data in the request" line.
- A code source's `signal` is also aborted when every request waiting for its load went away (a REST
  client that closed its connection, an MCP call over HTTP whose connection closed).
- Over HTTP with `output.dir` and without `output.baseUrl`, the server serves reports itself under
  `/downloads/` ([download links](https://pivotkit.eize.dev/reference/delivery/)): route that path to
  it, set `output.downloads.key`, or set `output.downloads.enabled: false` to keep the old behaviour.
  Reports that get a link are stored with 22 random characters before their name (`output.name`;
  `output.filename` is the plain name).
- With `output.baseUrl`, a report over a source with a field that is not `show` carries no `url` any
  more (REST and MCP); the file is still written.

### Added

- Backend sign-in for HTTP sources ([#329](https://github.com/eizedev/pivotkit/issues/329)):
  `sources.<id>.http.auth` or `httpSources.backends.<name>.auth` is a header from a secret reference,
  OAuth client credentials (a client secret, or a JWT client assertion such as a Kubernetes service
  account token, read on every token request), or an RFC 8693 token exchange for the signed-in
  person, whose own token goes only to the token endpoint as `subject_token`. Tokens are kept in
  memory: client credentials per setting, exchanged tokens per person, client and scopes, never past
  the person's own token or `maxAgeSeconds`; one request per key at a time; a backend's 401 asks once
  more with a new token. A refused or failed token request answers `SOURCE_UNAVAILABLE` (not retryable, no last good
  data); only the token endpoint's RFC 6749 error code is logged. `check-config` prints how each
  sign-in is made and checks its secrets (never a value); `check-source` prints the token endpoint's
  status, error code, granted scope and `expires_in`. `http.headers` refuses `authorization` and
  `cookie` with a pointer to `http.auth`.
- Parameters bound to a claim (`params.<name>.claim`, HTTP and code sources, `auth.mode: "oauth"`):
  filled from the verified token, checked like a caller's value (a text needs a `pattern` or an
  `enum`), an email only when verified; never offered, never set by a caller, never said back. Only the claims
  a parameter names are read from a token (`Caller.claims`). A source with a token exchange or a
  claim is listed only for a caller with a subject and is not schedulable (`NOT_SCHEDULABLE`).
- Operator controls ([#331](https://github.com/eizedev/pivotkit/issues/331)):
  `auth.groupProfiles` maps an OAuth token's groups (`auth.groupsClaim`, a list; a text with
  `auth.groupsSeparator`) to policy profiles, the first match winning after a client's profile; a
  cut, missing or overage group list gets `auth.defaultProfile` or 403 `NOT_ALLOWED`, never a wider
  profile. `auth.defaultProfile` is the profile of every signed-in caller nothing else names.
  `auth.offerSourceScopes: true` (off by default) lists the sources' scopes in the OAuth metadata;
  the 401 challenge names the required scopes only. An empty `list_sources` says what to do instead
  of naming describe_source, and the `refused` line of a 403 for groups names the client.
  `audit.subject` (`hash` with `audit.key` of at least 16 characters, or `plain`) puts the person on `call`, `request` and
  `download` log lines. An empty `list_sources` for a sign-in without the sources' scopes has a
  `hint` naming the scopes the server offers. `check-config` prints how a person gets a profile, the
  scopes offered, sources no scope reaches, a later `groupProfiles` entry wider than an earlier one, groupProfiles without a default profile, and the
  audit setting. `groupsOf`, `groupRefusal` and `GROUPS_REFUSED` are exported.
- HTTP sources ([#328](https://github.com/eizedev/pivotkit/issues/328)): `sources.<id>.http` asks an
  operator's backend at an address written once in the configuration (`backend` and `path` of
  `httpSources.backends`, or a whole `url`), with `{name}` for a declared parameter in the path and
  `query`; a caller passes only the values, checked against their type, pattern or list and encoded
  as RFC 6570 simple expansion, and never an address. The rows at a JSON Pointer (or a CSV body),
  `asOf` from the body, paging by a `next` pointer, the `Link` header, page numbers or offsets on the
  same host and path, `maxPages` and `maxBytes`; kept per caller and values for `ttl` (default 60 s),
  coalesced, last good data after a transient failure. Requests go through the guarded fetch with
  loopback and private addresses refused unless the backend is marked `intranet`; a backend's body
  never reaches a caller or the log, and its 401, 403 and 404 on a source with parameters give one
  answer (`DATA_NOT_AVAILABLE`). An HTTP source whose policy shows fields by default is refused at
  start. `httpSources.enabled: false` leaves them all out; `check-config` lists each source, the
  intranet backends and warnings ([data sources](https://pivotkit.eize.dev/reference/sources/#http)).
- `pivotkit-server check-source <id> [--param name=value ...]`: one load of an HTTP source as the
  server would make it, with each page's status, the rows, the fields and their types (no cell
  value; literal query values as `...`), what a caller would get when it fails, and the operator's
  hint for a private address (`intranet`) or a certificate (`NODE_EXTRA_CA_CERTS`).
- Parameters: a refused value's `INVALID_INPUT` names the parameter's description, example and short
  pattern; a value must have the parameter's type (a number for a `string` parameter is refused) and
  a text must be well-formed Unicode; `list_sources` adds each parameter's `pattern`, `format`,
  `minLength`, `maxLength`, `minimum` and `maximum`. The descriptions of `list_sources`,
  `describe_source`, `render_view` and the `params` input say that required params go into every
  call.
- `SourceError`'s `reason` (`"refused"`, `"setup"`) picks which of pivotkit's fixed texts a
  `SOURCE_UNAVAILABLE` says ("the source's backend refused pivotkit's access; ask the operator ...",
  "the source is not set up correctly; ask the operator ..."), on REST and MCP alike; `serverTextOf`
  takes the reason as its second argument.

- Data in the request ([#326](https://github.com/eizedev/pivotkit/issues/326)): `source` `inline:`
  with `data` (`columns`, `rows`, `rowCount`, optional `name` and `asOf`) on every operation that
  takes a source. MCP: on by default under a built-in cap of 500 rows, 5,000 cells and 256 KiB that
  `mcp.data` can lower or switch off, never raise. REST: only for callers whose policy says
  `data: true` (`policy.data`, `policy.profiles.<name>.data`), as JSON or a csv, tsv, json or xlsx
  file in a `multipart/form-data` body with an optional `sha256`, in a body of up to
  `rest.data.maxBytes` (default 10 MiB, 2 to 64 MiB) once the token is checked. `rowCount` and
  `sha256` must match (`DATA_MISMATCH`); no exposure policy applies; the data is computed in a worker,
  never cached, and cannot be linked or scheduled; the file route takes it with `data: true` alone.
  Results carry the caller's time as `suppliedAsOf`; `list_sources` adds `data` with the cap; the
  log counts rows and columns. `bodyBytesOf` gives the larger cap, only on the routes that take a
  source; at most two bodies over 2 MiB are read at once, one per caller (else 503 `BUSY`, retryable). A JSON body
  nested deeper than 64 levels is refused before it is parsed, a multipart body with more than two
  parts before its parts are read; a 413 names the cap that applied; a file sent that cannot be read
  says why in words. Exported: `INLINE_ID`, `MCP_DATA_CAP`, `REST_DATA_BYTES`, `inlineLogFields`.
- Download links ([#327](https://github.com/eizedev/pivotkit/issues/327)): over HTTP a report is
  served under `http.publicUrl` + `/downloads/<token>` until the link expires (`output.downloads`,
  60 minutes by default). The token is HMAC-signed with 128 random bits and names no file. Reports
  over sources whose fields are all `show` get a plain link; reports over other sources only a link
  bound to the person's sign-in (OpenID Connect code flow with PKCE against `output.downloads.signIn`,
  the issuer and subject compared with the caller's token's) or, where the operator chooses `bind: "once"`, a one-time
  link (GET shows a page, one POST sends the file). REST callers get links to such reports only with
  `results: true`. Results carry `output.filename`, `url`, `expiresAt`, `bound` and `note`;
  `present()` returns the file's MCP `resource_link`. `check-config` prints a `Delivery:` section.
  `createDownloadHandler`, `linksOf` and the route's constants are exported.

- A request id on every REST request and MCP tool call: on every log line written inside it, inside
  its work (a source's code, an error's details), in every REST problem document and at the end of
  every MCP tool error. A problem of a source or a store that failed adds `retryable` and
  `Retry-After` where known; a details' `requestId` not of pivotkit's form is replaced by the
  request's. The 5xx texts of `SOURCE_UNAVAILABLE` and `UPLOAD_FAILED` are fixed (`serverTextOf`).
- The options table is composed from per-feature fragments (`src/options/`); a key declared twice is
  an error when it is composed. `check-config` runs one section per feature and closes with "New in
  this version" where a change applies to the configuration.
- `readSecret` and the secret reference `{ "env": "NAME" }` or `{ "file": "path" }`: read on every
  use, one trailing newline trimmed, a line break or NUL inside refused, never logged.
- `serveFetch`'s `bodyBytes` may be a function of the request and the precheck's `info`, decided
  after the sign-in (`bodyBytesOf`, `peekSignIn`, `bodyCapOf`): at most `BODY_BYTES` for a caller
  who is not signed in, at most `MAX_BODY_BYTES` (64 MiB) for one who is. `offeredScopes`,
  `callerFields` (the caller's fields a log line may hold: the client only), `secretFileWarning`.
- Code sources are hardened ([#330](https://github.com/eizedev/pivotkit/issues/330)):
  `load(params, { caller, signal })` with a time limit (`sources.<id>.timeMs`, default 30000 ms, at
  most ten minutes) that aborts the signal; parallel calls for the same data share one load; at most
  4 loads per source and 2 per person at once; data kept per caller, values and policy levels while
  `version` is the same or for `ttl` seconds, one copy for all with `cacheShared: true` (`caller`
  null); last good data with `stale` after a transient failure only, for up to `maxStale` seconds
  (default 3600), dropped by any other failure; a file's run limits (`limits.rows`, `columns`,
  `importCells`, `textLength`). `SourceError` (exported, with `SOURCE_ERROR_CODES`) answers
  `NOT_ALLOWED`, `INVALID_INPUT` or `DATA_NOT_AVAILABLE` with its `publicMessage`, or
  `SOURCE_UNAVAILABLE`; anything else a load throws is `SOURCE_UNAVAILABLE` with the fixed text.
  `CODE_DEFAULTS`; `check-config` lists each code source. `ttl`, `maxStale` and `timeMs` are refused
  on file sources. A shared load is aborted only when every caller waiting for it went away; a
  person's kept data is at most 8 loads and a quarter of the cache's bytes; `SourceError` takes
  `retryAfter`; a load still running after twice its `timeMs` is logged. Types: `SourceCaller`,
  `SourceLoad`, `SharedSourceLoad`, `SourceVersion`, `LoadResult`, `SourceParams`; `load`'s caller is
  typed non-null unless `cacheShared: true`.
- The level `values` between `show` and `summary`: a field's distinct values as a complete, sorted
  list (`items`, `complete: true`), never a result over them. A number or date field, more values
  than `policy.valuesMax` (default 50), a value over 80 characters, `counts: false` or `rows: false`
  make it `summary` ([#362](https://github.com/eizedev/pivotkit/issues/362)).
- `policy.autoValues` (default `false`, server and source): text fields that look like categories
  get `values` where no `default` is written, never for a caller bound to a profile or a `file:`
  path; thresholds and an English and German deny list, extended by the operator. The data's
  statistics (counts, never values) are counted when the data is read and kept with it; without
  them a field is `summary`. A change after a reload is logged, the start log counts the fields.
- `check-config` prints each field's level and why, and the fields the automatic rule would list.
- `describe_source`: `withheld` and `hint` say what is kept back; a `show` field has `complete`.
- Findings are decided per field: `itemCase` for `show` and `values` fields, `itemUnknown` (the
  closest listed value) where a field's list is complete; `noRowsKept`, `filterEmpty`, `tableCut`
  and `chartCut` only for views whose fields are all `show`.
- `pivotkit-server/policy`: `withStats`, `levelInfo`, `autoLevel`, `AUTO_VALUES`,
  `AUTO_VALUES_DEFAULT`.
- `dataAsOf` in every result over a source's data (describe, suggest, validate, describe view, render,
  link, schedule draft): when the data is from, in UTC to the second (a file's modification time, a
  code source's `asOf` or when `load()` gave the data), parsed and written again by the server;
  render_view's message says it in words.
- Code sources can declare `params` (`sources.<id>.params`): values a caller passes with the source,
  checked, typed and written again before `load(params, { caller })` sees them, with a frozen copy of
  the caller and the data kept per caller and values. `list_sources` lists them; the tools and routes
  take `params` only when a source declares any. A source without `params` is called as before.
- `sources.<id>.fields.<name>.description`: the operator's words about a field, shown by
  describe_source.
- `auth.subjectClaim` (default `sub`): the claim that names the person behind an OAuth token, the
  identity data is kept for. A token without a usable subject gets nothing kept.

### Changed

- `ConfigError` is defined in `src/options/shared.js`; `pivotkit-server` exports it as before.
- A pattern of a source's parameter that runs out of time on a test value is tried once more before
  it is refused at start, so a busy host does not refuse a fast pattern.
- The message of a withheld render names the fields that are not fully shown.
- `REST_BASE`, `SOURCE_ID`, `TOKEN_SYNTAX`, `TOKEN_SYNTAX_TEXT`, `REST_ERRORS`, `PROBLEM_CODES` and
  `isLoopback` come from `pivotkit-cli/rest`, which the command line's remote mode checks against
  ([#306](https://github.com/eizedev/pivotkit/issues/306)); the exports keep their names.
  pivotkit-server needs the pivotkit-cli release that has `pivotkit-cli/rest` (its release raises
  the `pivotkit-cli` range).
- The sources sit behind one dispatch by kind (`src/sources/`); file sources read as before. The
  output directory's code moved to `src/output.js`.

### Fixed

- A client that leaves while a streamed answer waits (an MCP call over a slow source) frees its
  caller's slot at once, also when it left before the answer started: the stream was only given up
  when the socket was written to, so the slot stayed taken until the call ended.
- `output.dir` with a name longer than the file system allows, or a symbolic link loop in its path:
  `check-config` reports it as a directory that cannot be created, with the reason, as the start
  refuses it (it said "will be created at start"); with `output.create: false` both say it cannot
  be examined. Start errors name these reasons in words, keep any other file system code in a
  neutral sentence, and a link changed while the directory is made is refused with its reason
  instead of a raw error.
- `isLoopback` takes only literal loopback addresses: a host name that starts with `127.`
  (`127.example.com`) is no longer loopback, and `[::1]` as a URL writes it is. A listen host
  written short, `127.1` or `127.0.1`, no longer counts as loopback either: on it the server needs
  `auth` (or `--allow-unauthenticated`); write `127.0.0.1`.
- A pivotkit-mcp of another release beside pivotkit-server: `serve` and `mcp` stop with "pivotkit-mcp
  <x> does not fit pivotkit-server <y> (it needs pivotkit-server <range>; ...)" and a link to the
  update guide, instead of "could not start: The requested module ... does not provide an export
  named ...". `pivotkit-server mcp` no longer says "needs the package pivotkit-mcp" when
  pivotkit-mcp is installed but cannot be loaded; it names the error.

## [0.1.1] - 2026-11-14

### Upgrading from 0.1.0

What an operator checks; the [upgrade page](https://pivotkit.eize.dev/getting-started/upgrading/#from-0-6-0) has the details.

- Reports and drafts are named `<name>.pivotkit-out.<format>`; reports written by 0.1.0 are neither
  counted nor deleted: remove them from the output directory by hand once.
- `output.maxMb` (default 1024) is new: a full directory deletes its oldest reports. Drafts may take
  at most half of `output.maxFiles` (none at 1).
- A missing `output.dir` is made at start instead of failing it; `output.create: false` keeps the
  error.
- The MCP endpoint over HTTP has request limits (`mcp.rateLimit`, `mcp.concurrency`; 429 over them);
  `http.maxConnectionsPerAddress` is new; a client has 5 seconds for its headers.
- A static token with characters a bearer token cannot carry, and an output directory the server
  cannot write, are problems in `check-config`; a policy rule that names no column is a warning.

### Added

- A missing `output.dir` is made at start (with its parents, mode 0700, or 0755 narrowed by the
  umask when `output.baseUrl` is set) with a warning in the log. It was an error before; that is now
  opt-in with `output.create: false`. `check-config` says whether the directory exists, will be
  made, or cannot be, and names one inside an allowed directory as the problem the start refuses.
- `mcp.rateLimit` and `mcp.concurrency`: the MCP endpoint over HTTP limits each caller and refused
  tokens per address as the REST service does, with counts of its own; `createLimits` is shared
  ([#270](https://github.com/eizedev/pivotkit/issues/270)).
- `output.maxMb` (default 1024): the megabytes of reports and drafts the output directory may hold
  ([#269](https://github.com/eizedev/pivotkit/issues/269)).
- `check-config` warns of a policy rule that names no column of its source (a typo leaves the real
  column at the default level), with the name probably meant, and prints field names in the data's
  spelling ([#298](https://github.com/eizedev/pivotkit/issues/298)).

### Changed

- A token is checked once per request: the precheck's sign-in is kept for the route (REST and MCP).
  A `GET` route answers `HEAD`; the OAuth protected-resource metadata no longer carries
  `Access-Control-Allow-Origin: *`, which the Origin check made untrue. The Host list, the body cap,
  the default port and the runners' common flags are defined once (`SHARED_FLAGS`)
  ([#291](https://github.com/eizedev/pivotkit/issues/291)).
- `output.maxFiles` 1 leaves no room for schedule drafts (a draft would block every render); the
  hint for a full set of drafts names `output.maxFiles` and `output.maxAgeDays`
  ([#288](https://github.com/eizedev/pivotkit/issues/288)).
- The log of refused connections names every bound that refused one (`total`, `loopbackReserve`,
  `perAddress`) and reports the refusals of the rest of the minute when it ends or at close, instead
  of dropping them; `/healthz` and `/readyz` answer `HEAD` ([#289](https://github.com/eizedev/pivotkit/issues/289)).
- Reports and schedule drafts are named `<name>.pivotkit-out.<format>` (`sales.pivotkit-out.xlsx`),
  so the server knows its own files: only those are counted, cleaned up by `output.maxAgeDays` and
  deleted to make room; the operator's files, and reports written by an earlier version, are not
  (remove those by hand once) ([#288](https://github.com/eizedev/pivotkit/issues/288)).
- A full output directory (`output.maxFiles`, `output.maxMb`) deletes its oldest reports to make room
  instead of refusing every caller, so one token can no longer stop rendering for everyone; any token
  that may render can push other callers' older reports out. Schedule drafts awaiting approval are
  never deleted this way and may take at most half of `output.maxFiles` (a draft over that is refused
  with 409 `NO_OUTPUT`), and nothing is deleted where the directory holds the configuration or a
  source, template or token file ([#288](https://github.com/eizedev/pivotkit/issues/288)).

### Fixed

- A missing or short token of `$PIVOTKIT_TOKEN` (or `$PIVOTKIT_MCP_TOKEN`) is named by its variable
  alone, not as `the token "token"`; a token of `auth.tokens` keeps its name in the message
  ([#303](https://github.com/eizedev/pivotkit/issues/303)).
- `output.maxAgeDays` also removes the temporary files of writes the server was killed in
  (`.<name>.pivotkit-out.<format>.<pid>-<random>.tmp`, older than an hour); they are not reports,
  so nothing else ever removed them ([#209](https://github.com/eizedev/pivotkit/issues/209)).
- A render whose filters keep no rows has the warning `noRowsKept` when the view uses shown fields
  only, as the command line has; for a view that touches a field whose values are not shown it stays
  out, since it would tell whether an item exists ([#302](https://github.com/eizedev/pivotkit/issues/302),
  [#290](https://github.com/eizedev/pivotkit/issues/290)).
- `suggest_view` and a layout read what `describe_source` shows: no span of a date field that is not
  shown (it is grouped by quarter whatever its span), no counts where `counts` is false
  ([#296](https://github.com/eizedev/pivotkit/issues/296)).
- `rows: false` keeps a render's `keptRows` back too: without a filter it is the source's row count
  ([#296](https://github.com/eizedev/pivotkit/issues/296)).
- The docs said a misspelt item of a shown field gets the item meant; only an item in another case
  or with other spaces does ([#283](https://github.com/eizedev/pivotkit/issues/283)).
- The file count of the output directory holds when many reports are written at once: writes into
  it run one at a time ([#269](https://github.com/eizedev/pivotkit/issues/269)).
- An output directory the server cannot write is a problem in `check-config` and a warning at start,
  and a report answers 409 `NO_OUTPUT` with a hint instead of 500 `INTERNAL`
  ([#297](https://github.com/eizedev/pivotkit/issues/297)).
- 16 of the 256 connections are kept for loopback, so clients on the network that hold connections
  without sending cannot lock out the health check; a client has 5 seconds for its headers (was 15,
  and checked only every 30 seconds); `http.maxConnectionsPerAddress` (default 0, no bound) caps one
  address, and refused connections are logged at most once a minute
  ([#289](https://github.com/eizedev/pivotkit/issues/289)).
- A request target in the absolute form (`GET http://host/path`) is read by its path, and `OPTIONS *`
  answers 400, instead of both reaching `/` ([#299](https://github.com/eizedev/pivotkit/issues/299)).
- A static token with characters a bearer token cannot carry is refused at start and in
  `check-config` (no request could send it); with OAuth and neither required scopes nor
  `auth.toolScopes`, the REST service warns at start as MCP does
  ([#299](https://github.com/eizedev/pivotkit/issues/299)).
- The issuer's metadata is read again every hour and when a token names an unknown key (after a
  read that found nothing new, not again within a minute), so a changed `jwks_uri` works without a
  restart
  ([#271](https://github.com/eizedev/pivotkit/issues/271)).

## [0.1.0] - 2026-11-14

First release.

### Added

- The package `pivotkit-server` ([#165](https://github.com/eizedev/pivotkit/issues/165), step 4;
  [#268](https://github.com/eizedev/pivotkit/issues/268)): what pivotkit-mcp and the REST service
  share, moved out of pivotkit-mcp: the options and their checks, the source registry, the exposure
  policy, the compute workers, the output directory, the log, sign-in (static tokens, OAuth 2.1
  resource server) and the Host check; `present()`, `presentedInput()` and `presentedOutput()`, the
  step after an operation (policy, output, inline result, message) and the schemas a caller sees.
- The REST service `pivotkit-server/rest`: `createRestHandler(context)`, a fetch handler with a route
  per operation under `/api/v1` (plus `GET /sources/{id}` and the download route
  `POST /views/render/file`), errors as RFC 9457 problem documents, `/openapi.json`, and
  `openApiDocument()`, the OpenAPI 3.1 document made from the same table (published as
  `docs/openapi.json`).
- A policy names a field without regard to case, Unicode form or the kind of whitespace (a no-break
  space in a header); two rules that name the same field keep the stricter level. A Host header that is not a host name and port is refused, and the path of a
  request comes from its request line only.
- Policy profiles (`policy.profiles`), bound to static tokens, OAuth clients or scopes; downloads only
  with `results: true`; files by path refused over REST; inline results off by default.
- A REST resource of its own for OAuth (`rest.resource`, its Protected Resource Metadata), CORS off
  by default (`rest.cors.origins`), limits per caller and per address for refused tokens
  (`rest.rateLimit`, `rest.concurrency`).
- The command `pivotkit-server`: `serve` (REST and, with pivotkit-mcp installed, MCP on one port,
  `/healthz`, `/readyz`, a graceful stop), `check-config`, `mcp`, `cli`, `healthcheck`.
- `output.maxAgeDays` deletes old reports, and refuses an output directory that is the configuration's
  directory or holds a source, print template or token file; `http.trustProxy` reads the client's address from
  `X-Forwarded-For`.
- The container image `ghcr.io/eizedev/pivotkit` (distroless Node 22, non-root, read-only), built
  and signed on each release of this package.

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-server@0.1.1...HEAD
[0.1.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-server@0.1.0...pivotkit-server@0.1.1
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-server@0.1.0
