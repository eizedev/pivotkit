# Changelog

All notable changes to `pivotkit-server` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `output.maxMb` (default 1024): the megabytes of reports and drafts the output directory may hold
  ([#269](https://github.com/eizedev/pivotkit/issues/269)).
- `check-config` warns of a policy rule that names no column of its source (a typo leaves the real
  column at the default level), with the name probably meant, and prints field names in the data's
  spelling ([#298](https://github.com/eizedev/pivotkit/issues/298)).

### Changed

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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-server@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-server@0.1.0
