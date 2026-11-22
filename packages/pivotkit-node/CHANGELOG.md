# Changelog

All notable changes to `pivotkit-node` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The first release: the file handling of `pivotkit-cli/files` and the REST contract of
  `pivotkit-cli/rest`, which pivotkit-cli and pivotkit-server now share from here.
- `pivotkit-node/net`: `ipBytes`, `isLoopback`, `retryAfterSeconds` and `networkCodeOf`, the one copy
  of how both front ends read addresses, Retry-After headers and failed connections.

[Unreleased]: https://github.com/eizedev/pivotkit/commits/main/packages/pivotkit-node
