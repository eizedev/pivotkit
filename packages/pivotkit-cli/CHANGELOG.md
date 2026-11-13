# Changelog

All notable changes to `pivotkit-cli` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First release.

### Added

- `pivotkit render`, `validate`, `describe`, `completion` (bash, zsh, fish, PowerShell) and `help`,
  with exit codes 0, 1 (findings) and 2 (usage, file, limit, template) and `--json`
  ([#165](https://github.com/eizedev/pivotkit/issues/165)).
- Files read once as regular files with their size checked before reading, written through a
  temporary file; `--allow-dir` limits every file to the directories named (real paths); no file
  content in a message.
- Defaults from `PIVOTKIT_LOCALE`, `PIVOTKIT_TIME_ZONE` and `PIVOTKIT_NOW`.
