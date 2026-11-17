---
title: What else counts as public interface
description: React props, the element's attributes, properties and events, the plugin API, CLI exit codes and the lowest supported Node, React and browser versions are public interface. The --pk-* theme tokens are not.
status: accepted
date: 2026-11-17
---

# 0013 What else counts as public interface

Source: [#491](https://github.com/eizedev/pivotkit/issues/491)

This record amends [0012](0012-versioning-policy.md).

## Context and Problem Statement

#491 listed what counts as public interface. Some parts were not on that list, and
[0012](0012-versioning-policy.md) left them open. Do they fall under the versioning promise?

## Considered Options

- Each part counts as public interface (not discussed in a source).
- Each part can change in any release (not discussed in a source).

## Decision Outcome

These count as public interface and follow the promise:

- React props
- the web component's attributes, properties and events
- the plugin API
- CLI exit codes
- the lowest supported Node.js version
- the lowest supported React version and browser versions

The theme tokens (`--pk-*`) do not. A minor release can change them, and the changelog names the
change.

Reason: not recorded.

### Consequences

- Raising the lowest supported Node.js, React or browser version is a break. From 1.0.0 it waits
  for a major release.
- A host that sets `--pk-*` tokens reads the changelog before it updates.
- [Versioning](../versioning.md#what-is-public-interface) holds the full list.
