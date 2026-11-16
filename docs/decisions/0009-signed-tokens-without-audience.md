---
title: Server-signed tokens without an audience
description: Tokens the server signs itself carry the issuer pivotkit-server and no audience. REST and MCP both accept them.
status: proposed
date: 2026-11-16
---

# 0009 Server-signed tokens without an audience

Sources: [#485](https://github.com/eizedev/pivotkit/issues/485),
[#540](https://github.com/eizedev/pivotkit/pull/540)

Status: proposed. It becomes accepted with the merge of #540.

## Context and Problem Statement

Without a sign-in provider, REST and MCP took only static tokens. They never expire, and the
operator hands them out by hand. #485 adds short-lived tokens that the server signs itself. Which
claims does such a token carry, and which endpoints accept it?

## Considered Options

The sources name no other options.

## Decision Outcome

Decided in #485:

- The server signs the tokens with its own key. Several keys can be valid at once, so a key change
  breaks no client.
- A deny list revokes a single token before it expires.
- REST and MCP both accept these tokens.
- Logs show the token ID, never the value.

Built in #540:

- The token is a JWT with the type `pivotkit+jwt`, the issuer `pivotkit-server` and no audience
  (`aud`).

Why the token carries no audience: reason not recorded. OAuth tokens differ: each endpoint checks
its own audience there.

### Consequences

- Servers with the same signing keys accept each other's tokens. So each server makes its own key
  with `pivotkit-server key new --for signing`. The key directory is never copied to another server.
- One token works on REST and on MCP of the same server.
