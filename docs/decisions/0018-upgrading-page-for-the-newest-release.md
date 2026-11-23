---
title: The upgrading page covers the newest release
description: The upgrading page says how to update and what the next and the latest release ask you to change. Each package's changelog keeps every break.
status: accepted
date: 2026-11-23
---

# 0018 The upgrading page covers the newest release

Source: [#745](https://github.com/eizedev/pivotkit/pull/745)

## Context and Problem Statement

[0012](0012-versioning-policy.md) says that the upgrading page lists every break. The page then
kept every release's changes and grew to 1,658 lines. Readers who update one installation had to
find their part in it. The same changes were also in each package's changelog.

## Considered Options

- Keep every release on the upgrading page.
- Move older releases to a second page.
- Keep only the newest release on the upgrading page, and leave older releases to the changelogs.

## Decision Outcome

Chosen option: the newest release only, because the changelogs already keep every break and a
second page would keep growing.

- The upgrading page has how to update each kind of installation, the breaks of the next release
  and of the latest one, each with what to do.
- Its package's changelog marks every break **Breaking**. That is the lasting record.
- The release pull request renames "In the next release" and removes the section of the release
  before. [RELEASING.md](https://github.com/eizedev/pivotkit/blob/main/RELEASING.md) lists the step.
- A deprecation names its id in the changelog and in the register. The upgrading page lists it
  while its release is the newest.

This changes the point "the upgrading page lists every break" of 0012. The rest of 0012 stands.

### Consequences

- Good: a reader who updates finds the steps and the actions on one short page.
- Bad: links into removed sections land at the top of the page. Links in the repository point to the
  old page at a fixed commit instead.
- Bad: someone who skips several minor versions reads the changelogs, not one page.
