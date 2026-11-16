# Changelog

All notable changes to `pivotkit-server` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-11-16

### Upgrading from 0.1.1

- The container image starts without a configuration and makes its token `admin` at the first
  start in `/var/lib/pivotkit`: mount a volume there (`-v pivotkit:/var/lib/pivotkit`); with
  `--read-only` and no volume the start is refused. A start off loopback without `auth.mode` that was
  refused starts with that token where a state directory is set. `docker/compose.example.yml` and
  `docker/pivotkit.example.json` are the minimal setup; the tokens as secret files moved to
  `compose.secrets.example.yml` and `pivotkit.secrets.example.json`. The image declares no `VOLUME`
  any more: mount a named volume where reports go. A read-only container without the state volume
  warns at every start that the download key cannot be made
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#first-start-0-7)).
- Copy the schedule drafts you want to keep out of `output.dir` before you update: drafts still
  waiting for approval (`*.pivotkit-out.report.json`) are deleted with reports older than
  `output.maxAgeDays` (30 by default) at the first start; this release's `check-config` counts them
  ([upgrading, from 0.6.1 / 0.1.1](https://pivotkit.eize.dev/getting-started/upgrading/#from-0-6-1)).
- Breaking: with download links on, an `http://` `http.publicUrl` on a host other than loopback
  keeps the server from starting; use `https://`, or set `output.downloads.allowInsecureUrl: true`
  for a network you trust ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#download-links-http)).
- Behaviour change: a column a file gives no header (a blank header cell, a row longer than the
  header) is `hide` whatever the policy's default; a rule that names it still holds
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#columns-without-header)).
- Behaviour change: where a caller sees a field below `show`, a row wider than the named header (a
  uniform file that ends every line with a separator aside) is left out whole, with a `ROWS_DROPPED` note that counts such rows;
  `check-config` counts them ([#479](https://github.com/eizedev/pivotkit/issues/479),
  [upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#long-rows)).
- Behaviour change: the request limits (`rest.*`, `mcp.*` `rateLimit` and `concurrency`) count per
  person, no longer per OAuth client; one client's people together get eight times the rate and run
  at most eight times `concurrency` at once; `auth.subjectClaim` must name a claim users cannot change
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#limits-per-person)).

- The log ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#log)): on a terminal it
  is text unless `log.format` is `json` (stderr that is no terminal, and the container image, stay
  JSON). JSON lines gain fields. The client's address is logged by default as `address` (with
  `http.trustProxy` the forwarded client, as before, or `invalid` for one that is no IP address),
  with `peerAddress` beside it where the connection's own address differs; `log.address: "off"`
  keeps both out. More refusals get a line, and an error at the start of `serve` is a JSON line
  where stderr is no terminal.

- Behaviour change: `output.maxAgeDays` is 30 by default, so reports and schedule drafts older than
  30 days are deleted from `output.dir` at start and every hour, including drafts still waiting for
  approval. `output.maxAgeDays: 0` keeps them
  with no age limit, as before. The default does not apply where `output.dir` holds the
  configuration or a source, template or token file ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#max-age-default)).

Every field keeps its level and the automatic rule is off; the [upgrade page](https://pivotkit.eize.dev/getting-started/upgrading/#from-0-6-1) has the details.

- html reports print "Data as of" in their details; xlsx files carry the document property
  `DataAsOf`.

- A client reads the optional `field` of a finding, the code `itemUnknown`, `withheld`, `hint`,
  `complete` and `auto` in `describe_source`, and treats a `level` it does not know as `summary`.
- A filter item that is none of a `show` field's values gets `itemUnknown` where its list is
  complete; `itemCase` comes for a `show` field also in a view that uses other fields.
- A withheld render's `message` reads "results over fields that are not fully shown (...) stay in
  the file".
- `check-config` prints more lines (each field's level and why, each profile's levels) in a new
  layout: a script that reads its text uses the exit code or the first line instead
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#check-config-layout)).
- Behaviour change: a source's print template (`sources.<id>.template`) is read and checked at
  start; one the parser refuses (an unknown placeholder), over 1 MiB or not a regular file keeps
  the server from starting, where before every html report of that source failed with
  `INVALID_TEMPLATE` (a parse error) or `LIMIT_EXCEEDED`. `check-config` lists the template per
  source and reports that message as a PROBLEM line; a template file that is not there is NOT
  FOUND, and the start only warns, as for a missing source file ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#template-at-start)).
- Log lines written inside a request (`call`, `request`, `download`, `refused`, `error`) carry
  `requestId`; every REST problem document carries it too. A body over the cap gets a `refused` line.
- `check-config` warns of a static token's file that other users of the machine can read.
- Library hosts with code sources (`load`): `load(params, { caller, signal })` also without declared
  params (`{}`), aborted after 30 s (`timeMs`); data kept per caller unless `cacheShared: true`; last
  good data up to an hour old after a transient failure, with `stale` (`maxStale: 0` turns it off);
  an error thrown by `load` answers `SOURCE_UNAVAILABLE` (502) instead of `INTERNAL` (500); the data
  has a file's limits; the report over it is computed in a worker under `compute.timeMs`,
  `compute.memoryMb` and `compute.queueMs` ([code sources](https://pivotkit.eize.dev/getting-started/upgrading/#code-sources)).
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
- With OAuth, the issuer's metadata, its keys and the download sign-in's token endpoint are requested
  through the server's guarded requests: an issuer on a loopback or private address needs
  `auth.intranet: true`, the environment's proxy is not used, and a key set over 256 KiB is refused
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#issuer-requests)).

### Added

- A state directory (`--state-dir`, `$PIVOTKIT_STATE_DIR`; the image: `/var/lib/pivotkit`): over
  HTTP the server makes there what is missing, the token `admin` when auth needs a token off loopback
  and none is given, the download links' key, and the audit key for `audit.subject` `"hash"`, so
  links and hashes stay the same after a restart. `auth.tokens[]`, `output.downloads.key` and
  `audit.key` take `"create": true` for a file pivotkit makes where it is missing. A token that cannot
  be made stops the start; a key is a warning. The start logs the command that prints the token,
  never the value; `check-config` says under `Credentials` what is there or will be made, and
  `token show admin` prints it without a configuration
  ([server in 5 minutes](https://pivotkit.eize.dev/getting-started/server-in-5-minutes/),
  [made at the first start](https://pivotkit.eize.dev/reference/rest/#first-start)).
- The container image: a built-in example configuration when `/config` is empty (the example data
  only; a mounted `/data` needs `files.allowDirs`), the state
  directory `/var/lib/pivotkit` (0700, user 10001), and `pivotkit-server` on its `PATH` for
  `docker exec` and `kubectl exec`.
- `pivotkit-server token new`, `token show` and `key new --for downloads|audit`: a token (32 random
  bytes) or key (48) on stdout, or into a file with mode 0600 that is never written through a
  symbolic link and never replaced without `--force` (`--if-missing` keeps it, also with several runs
  at once); `token new --config <file> --add` puts the token into `auth.tokens`, `key new --config
  <file> --add` names the key, each with a backup; `--json` as pivotkit-cli's. The messages and docs
  that named `openssl` or `node -e` name these commands
  ([tokens and keys](https://pivotkit.eize.dev/reference/rest/#credentials)).
- A token or key file in UTF-16 (PowerShell 5.1's `>`) is named as such by the start and
  `check-config`; one that is not a regular file or is longer than 4096 bytes is refused, never
  waited for.
- `output.downloads.allowInsecureUrl`: download links under an `http://` `http.publicUrl` off
  loopback, refused without it; with it the start and `check-config` warn.
- `check-config` warns of `"default": "show"` with hidden fields (a deny list), of
  `output.downloads.expiresMinutes` under 5 ([#468](https://github.com/eizedev/pivotkit/issues/468)),
  of an `output.dir` that holds the configuration or a source, template or token file (as the start
  does), and counts the schedule drafts and reports the next start's age sweep deletes; one line under
  `Sources` names the sources without a `description`, which a model chooses sources by
  ([#471](https://github.com/eizedev/pivotkit/issues/471)).
- A refusal by the client's share of the request limits logs `limit: clientRate` or `limit: clientShare`.
- Download sign-in callbacks are limited to 20 a minute per address (each writes a marker); over that
  the page asks to wait (429 `RATE_LIMITED`). Behind a proxy, set `http.trustProxy`, or all people
  share the proxy's address.
- An `info` line for each `output.maxAgeDays` sweep that deleted something, with the counts of
  `reports` and `drafts`.
- A `warning` when a static token's file is missing, empty or shorter than 32 characters while the
  server runs, naming the token and the cause (never its value or path), at most once a minute.
- `limitKeyOf(caller)`: whom a caller's request limits count for (pivotkit-mcp uses it).
- `render_view` (MCP and `POST /views/render`) takes `save: false`: the csv or json result comes back
  inline only, with no file in `output.dir`, no upload and no link; csv when no format is given.
  Where it cannot come back inline (xlsx, html or svg, inline results off, a field that is not `show`, a result over the `inline`
  limits) it answers `INVALID_INPUT`, `NOT_ALLOWED` or `LIMIT_EXCEEDED` instead of saving a file. The
  `call` and `request` lines have `saved: false`; `saveLogFields` gives that field
  ([inline only](https://pivotkit.eize.dev/reference/mcp/#inline-only), [#472](https://github.com/eizedev/pivotkit/issues/472)).
- Operations log ([operations](https://pivotkit.eize.dev/reference/operations/)): `log.level`
  (`debug`, `info`, `warn`, `error`, `off`), `log.format` (`auto`, `text`, `json`) and `log.address`
  (`on`, `off`), each a key, a flag (`--log`, `--log-format`, `--log-address`) and a variable
  (`PIVOTKIT_LOG_LEVEL`, `PIVOTKIT_LOG_FORMAT`, `PIVOTKIT_LOG_ADDRESS`); `"log": "debug"` stays the
  short form. Every line has `level`, `severity` (RFC 5424), `msg`, `service` and `version`; a
  request's lines its `traceId` (from a valid W3C `traceparent`, else new), `upstreamRequestId` (a
  checked incoming `X-Request-Id`) and the client's address; `call`, `request`, `download` and
  `refused` lines `outcome` and `status`, at `info`, `warn` (4xx) or `error` (5xx); `refused` lines a
  `reason` (with `limit` and `size` for a body over the cap), also for the per-caller 429s,
  `/openapi.json` and requests the HTTP parser refuses (with `parserError`), and at `debug` for a GET
  of the MCP endpoint and a path nobody serves; `peerAddress`, the socket's peer where it differs from
  `address`; warnings of HTTP sources, backend sign-ins and uploads `cause`, `backend`,
  `upstreamStatus` and `upstreamMs`; text values without C0, C1 or bidi controls in JSON too; `started`
  the source ids, the log's settings and the static tokens' names; a `stopped` line ends the log.
  The text format is logfmt, one line per event whatever a value holds, coloured only on a terminal
  without `NO_COLOR`. `source` is at most 64 characters on every line.
- Every answer carries `X-Request-Id`, the request's id (exposed to browsers by CORS).
- A configuration error at the start of `serve` is a JSON line when `--log-format json` or
  `PIVOTKIT_LOG_FORMAT=json` is set.
- The container image sets `PIVOTKIT_LOG_FORMAT=json`; `docker/compose.example.yml` bounds the log
  with the `local` driver and shows the `gelf` and `syslog` drivers.
- For hosts: `requestScopeFor`, `withRequestScope`, `requestScope`, `withRequestIdHeader`,
  `traceIdOf`, `upstreamRequestIdOf`, `refusalReason`, `startFields`, `startErrorLine`,
  `startFormatOf`, `flushed`, `logSettingsOf` and the log's constants; `serveFetch` takes
  `trustProxy`; a context's runtime takes `service` and `env`.

- `sourceCache.maxMb` (default 256): the loaded data of code and HTTP sources the process keeps.
  The largest table that can be kept is a quarter of it (64 MiB by default); a larger table loads
  on every call. With several contexts in one process the largest setting applies. `check-config`
  prints both limits
  ([#414](https://github.com/eizedev/pivotkit/issues/414)).
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
  hint for a private address (`intranet`) or a certificate (`NODE_EXTRA_CA_CERTS`, and when it is
  set, that its file does not cover the certificate). The id and the options in any order; exit 2
  for an id that names no HTTP source; `OK with customer=acme` on success; the `--param` to re-run
  with for a missing value; on a backend's 401 or 403 the secret behind `http.auth` (its variable or
  file) or where to set one ([#424](https://github.com/eizedev/pivotkit/issues/424)).
- `pivotkit-server --help` names `--version` and lists it before `--help`, as pivotkit-mcp's help
  does. Unknown options and commands read `unknown option "--bogus"; run "pivotkit-server --help"`
  (pivotkit-mcp's alike); `--auth` with another value says `--auth must be none, token or oauth`.
- `pivotkit-server source-from-openapi <file or https URL> --operation <operationId or "GET /path">`: proposes an
  HTTP source block from one GET operation of an OpenAPI 3.0 or 3.1 document in JSON (path and query
  parameters with their types, where the rows are, the fields' descriptions, a skeleton of the
  backend's sign-in). The document is read as untrusted input: local references only, size and
  node budgets, no `pattern` copied, descriptions cleaned and listed for review, and no address
  copied as a value. What the operator must decide says `TODO`, and the server refuses a value under
  `httpSources` or a source's `http` that still does
  ([data sources](https://pivotkit.eize.dev/reference/sources/#openapi)).
- Parameters: a refused value's `INVALID_INPUT` names the parameter's description, example and short
  pattern in one parenthesis ("params.customer is not in the expected form (The customer's short
  name, for example acme; pattern ...)"); a missing one ends with "re-run with
  params.customer=acme"; `GET /sources/{id}` of a source that needs params says to use `POST
  /sources/describe`; render without `results: true` says to ask the operator for such a token; a value must have the parameter's type (a number for a `string` parameter is refused) and
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
  link (GET shows a page with the file's name, kind, size and expiry and a Download button, one POST
  sends the file; the same browser may repeat it for two minutes, and for any other browser the GET
  already answers 409 `LINK_USED`). REST callers get links to such reports only with
  `results: true`. Results carry `output.filename`, `url`, `expiresAt`, `bound` and `note`;
  `present()` returns the file's MCP `resource_link`. `check-config` prints a `Delivery:` section.
  Each answer of the route has a page with its own title and heading (a sign-in that was cancelled,
  one whose page is out of date and one that failed say so apart, each with the link to open again)
  and a problem document with `requestId`, the id of the request's log line. The pages meet 4.5:1
  contrast in both colour schemes and show a focus ring.
  `createDownloadHandler`, `linksOf` and the route's constants are exported.
- Upload to the operator's store ([#332](https://github.com/eizedev/pivotkit/issues/332)):
  `output.upload` sends a written report to a store the operator names, either through a presign
  service (`presign`: a POST with the operator's credentials, which names the address to upload to,
  its headers, the link and its expiry) or an address template (`url` with `{id}`, `{name}`,
  `{format}`), and the result shows the store's link (`url`, `expiresAt`, `bound`, `note`, and the
  MCP `resource_link`). Reports over closed sources go there only where `bind` is `once` or
  `signIn`; schedule drafts never. Requests go through guardedFetch (private addresses only with
  `intranet`), the upload address must be on `presign.allowOrigins` and the link on `linkOrigins`;
  at most two uploads at once within one `timeMs` (30 s). A failure answers `UPLOAD_FAILED` (502)
  with a fixed text, the request id and `retryable`; the report stays in `output.dir`.
  `check-config` prints an `Upload:` section.

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

- The 401 for a request without a token says `send Authorization: Bearer YOUR_TOKEN` (it said
  `<token>`, which PowerShell's error details leave out)
  ([upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#no-token-text)).
- The privacy page says what the server's memory holds of a hidden column of a code or HTTP source:
  nothing it keeps (the loads per person, the workers' data sets), measured by `test/memory.test.js`
  for texts and numbers, with and without a caller's identity, in the kept data and in heap snapshots
  of the main thread and the worker; the data it reads to drop the column is freed, and freed memory
  can hold its values until it is reused ([#456](https://github.com/eizedev/pivotkit/issues/456)).
- The docs: check-config in a container runs with `serve`'s flags; behind a published Docker port
  `address` can be the Docker network's gateway, which `http.trustProxy` cannot fix; Synology Log
  Center as measured (facility `daemon`, severity `err`, `rfc3164` the safe format).
- check-config's "New in this version" also names, where they apply: the client's IP address on the
  log's request lines (`log.address: "off"`), a start error as a JSON line over HTTP
  (`log.format: "text"`), and the `/downloads/` route, answered without a token since the link is
  the credential, wherever download links are on, also before a report gets one
  (`output.downloads.enabled: false`) ([#452](https://github.com/eizedev/pivotkit/issues/452)).
- `check-config` says first whether the server starts and how many problems and warnings it found,
  then every `PROBLEM` with what it does (`-> the server does not start`, or what fails while the
  server runs), then every `WARNING` named by its section, then the sections: one fact per line
  wrapped at 78 columns (a path alone on its line), three markers (PROBLEM, WARNING, plain), the
  limits that matter with their values, ASCII `->`. The Auth section names the MCP and the REST
  audience where they differ. "Would not start" is said only for what `serve` refuses: a missing source file,
  backend secret, download key or upload secret starts the server and is a PROBLEM it starts with.
  How a person gets a profile stands under `Auth:`; over stdio a `Transport:` section says there are
  no links and no signed-in person. It checks the download links' client secret, warns of an issuer
  whose metadata cannot be loaded (3 s, from the commands only, under the issuer's request rules) and of a backend's `auth` no source
  uses, says when there are no sources, names a secret file with its full path, and closes with "New
  in this version" in one line and the upgrading link. `checkConfig()` returns `warnings` and
  `stops` too ([#424](https://github.com/eizedev/pivotkit/issues/424)).
- `output.downloads.signIn.issuer` other than `auth.issuer` is compared after normalising (trailing
  slash, case of the scheme and host, a default port): a spelling difference says to leave the key
  out, another issuer points to the planned sign-in with an issuer of its own
  ([#434](https://github.com/eizedev/pivotkit/issues/434)).
- The requests to the OAuth issuer (metadata, keys, the download sign-in's token endpoint) go through
  guardedFetch, with its rules: no redirects, the address checked where the connection goes,
  link-local and cloud metadata addresses never, loopback and private addresses only with the new
  `auth.intranet`, an IP address as host only where the operator wrote it, the key set capped at
  256 KiB. The download sign-in reads the keys where the access tokens' are read (`auth.jwksUri`, or
  a `jwks_uri` on the issuer's origin). A refused request is a warning that names the setting;
  `check-config` prints the rules and a PROBLEM for an issuer on such an address
  ([#420](https://github.com/eizedev/pivotkit/issues/420)). The exported `discover(issuer)` follows
  the same rules and refuses a loopback or private issuer unless its second argument allows it
  (`{ intranet: true, insecure: false, origins: [] }`). After a failed read of the key set (also a
  non-200 answer or one without a `keys` list), tokens are refused for 5 seconds without asking the
  issuer again, and the warning comes at most once a minute. The download sign-in's token endpoint
  from the metadata must be on the issuer's origin; `output.downloads.signIn.tokenUrl` names another.
  `/readyz` answers 503 with `reason` in fixed words.
- A code source's operation is computed in a worker as a table job, as an HTTP source's: `load` and
  the reading of its rows stay in the host's thread, the encoding and the report are bounded by
  `compute.timeMs` and `compute.memoryMb` ([#414](https://github.com/eizedev/pivotkit/issues/414)).
  Its rows are kept packed (texts dictionary-coded, numbers, dates and true/false values in shared
  typed arrays) and measured exactly; a kept load (tables up to 64 MiB per person by default) goes to a
  worker once, later calls send its key only. Each worker keeps at most a quarter of `compute.memoryMb` of data sets. A source whose
  every field is hidden keeps its row count.
- Privacy ([#422](https://github.com/eizedev/pivotkit/issues/422)):
  - Data that belongs to one person counts as closed for download links and `output.baseUrl`: data
    sent in the request (`inline:`), a source with a parameter bound to a claim or a token exchange,
    and a code source with the new `sources.<id>.perPerson: true`. Their reports get a sign-in link
    for a caller with a subject, or no link. `isClosedForDelivery(options, ref)` (`src/registry.js`)
    is the one rule.
  - With `auth.groupProfiles` and no `auth.defaultProfile`, a person in none of the groups whom no
    client or scope profile names is refused with 403 ("your sign-in gives you no access to this
    server's data; ask the operator", `NOT_IN_GROUP`) instead of getting the sources' own policy.
  - A sign-in link's subject digest holds the link's nonce: two links of one person cannot be tied
    together.
  - Cache keys hold a caller's values, groups and claims only as a keyed digest; an HTTP source's
    answer is kept without the columns the caller's policy hides. A CSV answer is read once in a
    worker into a packed table without them, as a code source's rows are, and that table is kept
    ([#433](https://github.com/eizedev/pivotkit/issues/433)): reading it counts against
    `compute.timeMs` and `compute.memoryMb`, not the source's `timeMs`. A CSV answer whose every
    column is hidden reports its real row count (it said 0). If the reading fails (`BUSY`,
    `TIMEOUT`, a limit), the answer is dropped and the next call asks the backend again. For a
    caller without an identity nothing is kept, and the answer goes to the operation's worker as
    before.
  - Packed tables (code sources and CSV answers) keep a text column's dictionary as one UTF-8
    buffer in shared memory, its codes and whole-number columns in one, two or four bytes: a
    million rows of eight small whole numbers take 8 MB instead of 64 MB, and sending a table to
    a worker copies no text. A table over a quarter of `sourceCache.maxMb`, which is loaded on every
    call, gets one warning an hour per source in the log.
  - With `audit.subject` on, a sign-in link's `download` line names the person who signed in.
  - The markers of used one-time links are swept every ten minutes, not only on the next one-time
    download.
  - A REST and MCP log line names a source by a configured id, `inline:` or `file:`, else
    `unknown`, never the caller's text.
  - `check-config` warns under `Retention:` when `output.maxAgeDays` is 0 while closed sources or
    data sent in requests are on, lists the per-person sources under `Delivery:`, and says of a code
    source open by its fields that `perPerson: true` is for data that differs per caller.
  - The limiter drops an address within two minutes of its last refused token and a caller once its
    bucket is full again, on a timer, instead of keeping them until the 10,000-key cap.
- `ConfigError` is defined in `src/options/shared.js`; `pivotkit-server` exports it as before.
- A pattern of a source's parameter that runs out of time on a test value is tried once more before
  it is refused at start, so a busy host does not refuse a fast pattern.
- The message of a withheld render names the fields that are not fully shown.
- `REST_BASE`, `SOURCE_ID`, `TOKEN_SYNTAX`, `TOKEN_SYNTAX_TEXT`, `REST_ERRORS`, `PROBLEM_CODES` and
  `isLoopback` come from `pivotkit-cli/rest`, which the command line's remote mode checks against
  ([#306](https://github.com/eizedev/pivotkit/issues/306)); the exports keep their names.
  pivotkit-server needs pivotkit-cli 0.3.0, which has `pivotkit-cli/rest`.
- The sources sit behind one dispatch by kind (`src/sources/`); file sources read as before. The
  output directory's code moved to `src/output.js`.
- Depends on `pivotkit-core` `^0.7.0`, `pivotkit-report` `^0.3.0`, `pivotkit-cli` `^0.3.0` and
  `pivotkit-xlsx` `^0.4.0`.

### Fixed

- A row with more cells than the header put a hidden column's value into a shown `Column N` under
  `"default": "show"`; such columns are now hidden. The cells after the stray separator also moved a
  hidden value into the next named column; such rows are now left out where a field is below `show`
  ([#479](https://github.com/eizedev/pivotkit/issues/479)).
- The download key (`output.downloads.key`) was read on every request to `/downloads/`, forged links
  included; a read is now shared for a second.
- A download sign-in's `state` was used once only because the browser drops its cookie; a callback
  replayed with the cookie from before it is now refused (a marker in `.pivotkit-downloads/`).
- A body over `rest.data.maxBytes` from a caller that may send data reset the connection after about
  8 MB instead of answering 413 to clients that read only after sending (.NET, PowerShell)
  ([#473](https://github.com/eizedev/pivotkit/issues/473)).
- REST logs a token in the address (`?access_token=`) as `token_in_address`, as MCP does, not as
  `no_token`.

- Every error answer (4xx and 5xx) has one log line under its `X-Request-Id`, a 404 or 405 only at
  `log.level` `debug`: its own line, or a `refused` line whose reason is the answer's problem code or
  its status's (`method_not_allowed` and `not_found` at `debug`, other 4xx at `warn`, a 5xx at
  `error`), plus an `internal` line at `error` when a request fails unexpectedly after it logged a
  line below 500. A link under `/downloads` that nobody has is `not_found` at `info`. A refused
  download has one line, not two ([#456](https://github.com/eizedev/pivotkit/issues/456)).
- What you will notice in the log: new `warn` `refused` lines for a body that is not JSON or an
  unsupported `mcp-protocol-version`, an `info` line for a download link nobody has, a `warn` line
  when `/readyz` finds the server not ready and an `info` line when it is ready again (no line per
  probe), and an `error` `refused` line for a 5xx that had no line of its own.
- A body found larger than the cap while it streams (no `Content-Length`, as a proxy forwards an
  HTTP/2 body) is answered 413 with its `X-Request-Id` at once; the connection is cut after four
  times the cap, at least 64 KiB, so a download's small cap still lets the client read the answer.
  A streamed body over a download's cap gets its `refused` line.
- A client that stops sending its body after a 413 leaves one `refused` line, not a second one of
  the HTTP parser.
- A handler that throws is answered 500 without detail and logged as one `refused` line at `error`
  with reason `internal`; a place it held for a large body is given back. A request whose method or
  headers cannot be read as a request (such as `TRACE`) is the client's: 400, `bad_request`. A 500
  has an `error` line also where the request logged a line below 500 first. A `CONNECT` is answered
  400 with an `X-Request-Id` and a `bad_request` line, and its connection is closed after the answer.
- check-config prints a source's policy rules in that source's own spelling, never another
  source's.
- An `http://` `auth.issuer` with download sign-in and no `output.downloads.signIn.issuer` is
  reported as `auth.issuer: must be an https:// address`.
- A compute worker's kept data set of a CSV (an HTTP source's answer or a file) no longer keeps the
  whole text it was read from in memory, the columns the policy hides included: its texts were
  slices of that text, which V8 keeps alive whole. The data set's texts are copies of their own, and
  a read ends by replacing the subject V8 keeps of the last regular expression run, which on Node 22
  and 24 kept the whole text too ([#456](https://github.com/eizedev/pivotkit/issues/456)).
- REST: `inline:` from a caller without `data: true` is 403 `NOT_ALLOWED` on every route that takes
  a source, on a server that offers data to no profile in MCP's words ("this server takes no data
  sent in the request ..."), instead of 400 `INVALID_INPUT` "input has no key \"data\""
  ([#453](https://github.com/eizedev/pivotkit/issues/453)).
- Findings of a live review ([#448](https://github.com/eizedev/pivotkit/issues/448)): a presign
  answer that is a JSON array (or any other non-object) is `PRESIGN_ANSWER`, as documented, not
  `UPLOAD_URL_MISSING`; HEAD on a sign-in download link answers 200 with a short page and starts no
  sign-in (no redirect, no cookie), so a link preview does not; `source-from-openapi` notes that a
  backend on a private address needs `intranet: true` and sets `http.asOf` to the answer's one
  timestamp field (`date-time`, or a name such as `generatedAt`); report file names keep
  parentheses (pivotkit-cli).
- `PIVOTKIT_PORT` set to `tcp://<address>:<port>`, as Kubernetes' service links do for a Service
  named pivotkit: `serve`, `check-config` and `healthcheck` say so and name `enableServiceLinks:
  false`, instead of "http.port: must be a whole number of 0 or more" (`healthcheck`: a failed
  request; it still exits 1). An empty `PIVOTKIT_PORT` counts as not set for `healthcheck`, as it
  does for `serve`.
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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-server@0.2.0...HEAD
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-server@0.1.1...pivotkit-server@0.2.0
[0.1.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-server@0.1.0...pivotkit-server@0.1.1
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-server@0.1.0
