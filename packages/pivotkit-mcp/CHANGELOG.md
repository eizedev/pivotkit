# Changelog

All notable changes to `pivotkit-mcp` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  nested too deeply for a worker is `INVALID_INPUT` and frees the worker at once.
