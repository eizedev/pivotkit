# Changelog

All notable changes to `pivotkit-node` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-24

### Added

- The first release: the file handling of `pivotkit-cli/files` and the REST contract of
  `pivotkit-cli/rest`, which pivotkit-cli and pivotkit-server now share from here. `writeNew` and
  `writeSafe` with `exclusive` also work on file systems without hard links, such as FAT, exFAT and
  some SMB mounts.
- `pivotkit-node/net`: `ipBytes`, `isLoopback`, `retryAfterSeconds` and `networkCodeOf`, the one copy
  of how both front ends read addresses, Retry-After headers and failed connections.
  `NETWORK_FAILURES` is the one table of a failed connection's codes: the command line's words and
  which codes may work again.
- `CliError` extends `CodedError` of `pivotkit-core/internal`.

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-node@0.1.0...HEAD
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-node@0.1.0
