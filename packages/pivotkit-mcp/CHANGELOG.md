# Changelog

All notable changes to `pivotkit-mcp` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Upgrading from 0.1.1

- With OAuth, the Protected Resource Metadata lists the sources' scopes besides the required ones;
  the 401 challenge asks for the required scopes only. Define the scopes at your provider, or set
  `auth.offerSourceScopes: false` ([#331](https://github.com/eizedev/pivotkit/issues/331)).

### Added

- pivotkit-server's operator controls ([#331](https://github.com/eizedev/pivotkit/issues/331)):
  groups to profiles (`auth.groupProfiles`), `auth.defaultProfile`, the person on `call` lines
  (`audit.subject`), the hint of an empty `list_sources`. A token whose groups are unknown, with
  `auth.groupProfiles` and no default profile, gets 403 `access_denied` without a scope challenge.
  Needs pivotkit-server's `groupRefusal`.

- The exposure policy's level `values` and the opt-in automatic rule (`policy.autoValues`) of
  pivotkit-server ([#362](https://github.com/eizedev/pivotkit/issues/362)); `--check-config` prints
  each field's level and why.
- The instructions and the skill explain the levels once per conversation, `values` included, and
  `itemUnknown`.
- Every tool result over a source's data has `dataAsOf` (when the data is from); render_view's
  message ends with it in words. The tools that take a source take `params` when a configured code
  source declares parameters ([pivotkit-server](https://pivotkit.eize.dev/reference/mcp/#configuration)).
- Each tool call has a request id on its log lines, and every tool error ends with `(id ...)`, for
  the person to give the operator. An error of status 500 or more says pivotkit-server's fixed text
  (`INTERNAL`: "internal error"), with the source and whether trying again may work; `BUSY`,
  `NOT_READY` and `TIMEOUT` keep their own words. Release pivotkit-server first: this version needs
  its new exports (`serverTextOf`, `withRequestId`, `callerFields`, `offeredScopes`).

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

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-mcp@0.1.1...HEAD
[0.1.1]: https://github.com/eizedev/pivotkit/compare/pivotkit-mcp@0.1.0...pivotkit-mcp@0.1.1
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-mcp@0.1.0
