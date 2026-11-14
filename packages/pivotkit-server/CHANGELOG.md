# Changelog

All notable changes to `pivotkit-server` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
