---
title: Versioning
description: How pivotkit numbers its releases, what counts as its public interface, and how a deprecation works before something goes away.
---

# Versioning

This page says when a release of pivotkit may break your setup. It also lists every deprecation.
The [upgrading page](getting-started/upgrading.md) says what changed between two releases.

## The promise

### Before 1.0.0

pivotkit is 0.x and under active development.

- A minor release (0.7 to 0.8) can break things.
- We break as little as possible.
- The upgrading page lists every break, with what to do.

In 0.x, npm's caret range covers patch releases only. `npm update` therefore never takes the next
minor release on its own.

### From 1.0.0

pivotkit follows [Semantic Versioning](https://semver.org/) strictly.

| Release | May contain |
| --- | --- |
| Patch (1.2.3 to 1.2.4) | fixes only |
| Minor (1.2 to 1.3) | additions. What is to go away is only deprecated |
| Major (1 to 2) | removals of deprecated things. This is the only place for them |

If you take minor and patch releases automatically, nothing breaks without a warning first.

All packages start 1.0.0 together.

### The security exception

A security fix may close an unsafe default in a minor or patch release. Such a change:

- carries the mark **Security** in the changelog and on the upgrading page
- comes with a way to detect it, for example a `check-config` line or a log line
- comes with a way back to the old behaviour

## What is public interface

These are the parts a break can hit. A change to them follows [the promise](#the-promise).

- The view file format and its JSON Schemas.
- The JavaScript exports of each package, with their parameters and results.
- The React props, and the web component's attributes, properties and events.
- The plugin API.
- The REST routes and the OpenAPI document.
- The MCP tool names, their input schemas and their output schemas.
- The command line: commands, flags and exit codes.
- Configuration keys of the services.
- Environment variables.
- Error codes, such as `LIMIT_EXCEEDED` or `INVALID_INPUT`.
- The lowest supported Node.js, React and browser versions.

These are not public interface. They can change in any release:

- The look: layout, colours, spacing and CSS details.
- The wording of messages, hints and errors. Match on the code, not on the text.
- Modules that no package exports.
- The layout of an exported workbook beyond its values: styles, column widths and sheet order.

## How a deprecation works

From 1.0.0, nothing public goes away without a deprecation first.

1. **An id.** Each deprecation gets a number of its own, `PK-DEP-NNNN`, counted up from
   `PK-DEP-0001`. An id never changes and is never used again, even if the deprecation is withdrawn.
2. **A warning.** Using the old form logs a warning once per process. The warning names the id and
   the replacement.
3. **A `check-config` line.** For the services, `check-config` names the id where the configuration
   uses the old form.
4. **Old input keeps working.** Where possible, pivotkit reads the old form and turns it into the new
   one until the next major release.
5. **A register entry.** The [register below](#register) lists the id, what is deprecated, the
   replacement, the release that deprecated it and the earliest release that removes it.
6. **An upgrading note.** The upgrading page says what to change, with the id.

Removal comes no earlier than the next major release.
[CONTRIBUTING.md](https://github.com/eizedev/pivotkit/blob/main/CONTRIBUTING.md#deprecate-something)
says what a pull request that deprecates something delivers.

## Register { #register }

There are no deprecations yet.

## Where this comes from

The rules follow what other projects do:

- [Node.js](https://nodejs.org/api/deprecations.html) numbers each deprecation (`DEP0001`) and never
  changes an id. Its warnings print once per process.
- [Kubernetes](https://kubernetes.io/docs/reference/using-api/deprecation-policy/) removes a stable
  API element only with a new major version.
- [Angular](https://angular.dev/reference/releases) keeps a deprecated API for at least one major
  version and announces it in the changelog.

The decision record [Versioning before and after 1.0.0](decisions/0011-versioning-policy.md) says
why pivotkit chose these rules.
