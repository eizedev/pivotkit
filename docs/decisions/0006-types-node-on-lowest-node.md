---
title: "@types/node on the lowest supported Node"
description: The Node type definitions stay on the lowest supported Node major, so code cannot use APIs that Node lacks.
status: accepted
date: 2026-11-16
---

# 0006 `@types/node` on the lowest supported Node

Sources: [#520](https://github.com/eizedev/pivotkit/pull/520),
[#519](https://github.com/eizedev/pivotkit/issues/519)

## Context and Problem Statement

pivotkit supports Node 24 and later (`engines: ">=24"`). It was Node 22 when this was decided.
`@types/node` describes which Node APIs the code may use. Dependabot proposes each new major of
`@types/node`. Which major should the repository use?

## Considered Options

- The newest `@types/node`, as Dependabot proposes.
- The `@types/node` of the lowest supported Node major.

## Decision Outcome

Chosen option: the lowest supported Node major.

- `@types/node` stays on the floor's major: 24.x while Node 24 is the floor.
- Dependabot ignores its major updates. Minor and patch updates of that major still come.
- The floor and the types rise together, in one change.

The reason recorded in #520: types of a newer Node would let code use APIs that the floor lacks. Only
users on the floor would notice.

### Consequences

- Good: the type check catches a Node API that the floor does not have.
- Bad: newer Node APIs wait until the floor rises.
- Raising the floor is a break under the [versioning policy](../versioning.md).
