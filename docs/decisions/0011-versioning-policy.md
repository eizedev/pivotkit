---
title: Versioning before and after 1.0.0
description: pivotkit 0.x may break in a minor release. From 1.0.0 it follows Semantic Versioning strictly, with numbered deprecations.
status: accepted
date: 2026-11-16
---

# 0011 Versioning before and after 1.0.0

Source: [#491](https://github.com/eizedev/pivotkit/issues/491)

## Context and Problem Statement

pivotkit is 0.x, and a minor release can break things. Before 1.0.0, it needs a written policy and
the means to keep it. Someone who takes minor and patch releases automatically should never get a
break without a warning.

## Considered Options

The sources name no other options.

## Decision Outcome

- From 1.0.0, Semantic Versioning, strictly.
    - Patch: fixes only.
    - Minor: additions. What is to go away is only deprecated.
    - Major: the only place where deprecated things are removed.
- One exception: a security fix may close an unsafe default in a minor or patch release. It
  carries the mark "Security" in the release notes, with a way to detect it and a way back.
- 0.x stays as it is. A minor release can break, and the upgrading page lists every break. We still
  break as little as possible.
- All packages start 1.0.0 together. Reason not recorded.
- Each deprecation gets an id `PK-DEP-NNNN`, a runtime warning, a `check-config` line, an entry on
  the upgrading page and an entry in the register.

The reason recorded in #491 is the goal in the context: no break without a warning.
[Versioning](../versioning.md) holds the policy, the public interface and the register.

### Consequences

- Good: a host can take minor and patch releases automatically from 1.0.0.
- Bad: removing anything public takes a deprecation and waits for the next major.
