---
title: Short-lived tokens the server signs itself
description: Without a sign-in provider, the server issues short-lived tokens signed with its own keys. REST and MCP both accept them.
status: accepted
date: 2026-11-16
---

# 0009 Short-lived tokens the server signs itself

Sources: [#485](https://github.com/eizedev/pivotkit/issues/485),
[#540](https://github.com/eizedev/pivotkit/pull/540)

## Context and Problem Statement

Without a sign-in provider, REST and MCP take only static tokens. They never expire, and the
operator hands them out by hand. Can the server issue short-lived tokens itself?

## Considered Options

- Static tokens only.
- Short-lived tokens that the server signs with its own key.

## Decision Outcome

Chosen option: short-lived tokens that the server signs. Decided in #485:

- The server signs the tokens with its own key.
- Several keys can be valid at once, so a key change breaks no client.
- A deny list revokes a single token before it expires: `pivotkit-server token revoke <id or name>`.
- REST and MCP both accept these tokens.
- Logs show the token ID, never the value.

Reason recorded in #485: a static token never expires, and the operator has to create and hand it
out by hand.

### Consequences

- Good: an operator without a sign-in provider can hand out tokens that end on their own.
- Bad: the server keeps signing keys and a deny list. They belong on a volume, like the other
  secrets (#540).
- [0010](0010-signed-tokens-without-audience.md) records that these tokens carry no audience.
