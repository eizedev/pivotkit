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

- A minor release, from 0.y to 0.(y+1), can break things.
- pivotkit breaks as little as possible.
- The upgrading page lists every break, with what to do.

In a project's `package.json`, a caret range on a 0.x release covers patch releases only. `npm update`
in that project therefore stays on the same minor release.

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

- is marked **Security** in the release notes
- comes with a way to detect it, for example a `check-config` line or a log line
- comes with a way back to the old behaviour

## What is public interface

These are the parts a break can hit. A change to them follows [the promise](#the-promise).

- The view file format.
- The JavaScript exports of each package.
- The React props.
- The web component's attributes, properties and events.
- The plugin API.
- The REST routes and the OpenAPI document.
- The MCP tool names and their schemas.
- The command line flags and exit codes.
- Configuration keys of the services.
- Environment variables.
- Error codes, such as `LIMIT_EXCEEDED` or `INVALID_INPUT`.
- The lowest supported versions of Node.js, React and the browsers
  ([browser support](browser-support.md)).

These are not public interface. They can change in any release:

- The look and CSS details.
- The theme tokens (`--pk-*`). A minor release can change them. The changelog names the change.
- The wording of messages. Match on the code, not on the text.
- Internal modules, the ones no package exports.
- The layout of an exported workbook beyond its values.

## How a deprecation works

From 1.0.0, nothing public goes away without a deprecation first.

1. **An id.** Each deprecation gets a number of its own, `PK-DEP-NNNN`, counted up from
   `PK-DEP-0001`. An id never changes, even if the deprecation is withdrawn.
2. **A warning.** Using the old form warns at run time, in the way that fits the interface. A
   JavaScript export can log a warning, a view key can give a finding, a configuration key can give
   a log line. Every warning names the id and the replacement.
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

There are no deprecations yet. A withdrawn deprecation stays listed with its id.

<!-- An entry looks like this:
| PK-DEP-0001 | the view key `oldKey` | `newKey` | 1.2.0 | 2.0.0 |
-->

| Id | Deprecated | Replacement | Since | Earliest removal |
| --- | --- | --- | --- | --- |

## Where this comes from

The rules follow what other projects do:

- [Node.js](https://nodejs.org/api/deprecations.html) numbers each deprecation (`DEP0001`) and never
  changes an id, even when it withdraws a deprecation.
- [Kubernetes](https://kubernetes.io/docs/reference/using-api/deprecation-policy/) removes an API
  element only by incrementing the version of its API group.
- [Angular](https://angular.dev/reference/releases) keeps a deprecated API for at least one major
  version and announces it in the changelog.

The decision record [Versioning before and after 1.0.0](decisions/0012-versioning-policy.md) says
why pivotkit chose these rules.
