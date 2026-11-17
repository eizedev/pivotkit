---
title: React 18 as the lowest supported React
description: pivotkit-react supports React 18 and 19. React 18 stays the floor because PowerShell Universal ships it.
status: accepted
date: 2026-11-07
---

# 0005 React 18 as the lowest supported React

Sources: [#18](https://github.com/eizedev/pivotkit/pull/18),
[#13](https://github.com/eizedev/pivotkit/pull/13)

## Context and Problem Statement

Dependabot proposed React 19 for the workspaces (#12 to #15). Taking it would raise the React that
the workspaces build and test with. Which React does pivotkit support at the lowest?

## Considered Options

- Move the workspaces to React 19.
- Keep React 18 as the floor and test React 19 beside it.

## Decision Outcome

Chosen option: React 18 stays the floor.

- `pivotkit-react` takes React `>=18.2 <20` as a peer dependency.
- The workspaces build on React 18. Dependabot ignores major updates of `react`, `react-dom` and their
  types there.
- Every browser test runs on React 18 and on React 19. React 19 has its own install in
  `tests/react19/`.
- `pivotkit-element` bundles its own React 18.

The reason recorded in #18: React 18 is what PowerShell Universal ships. Why the range starts at 18.2
and not 18.0: reason not recorded.

### Consequences

- Good: pivotkit works in PowerShell Universal and in apps on React 18 or 19.
- Bad: pivotkit cannot use features that only React 19 has.
