---
title: Server-signed tokens carry no audience
description: The tokens the server signs itself carry the issuer pivotkit-server and no audience claim.
status: proposed
date: 2026-11-16
---

# 0010 Server-signed tokens carry no audience

Sources: [#540](https://github.com/eizedev/pivotkit/pull/540),
[#485](https://github.com/eizedev/pivotkit/issues/485)

## Context and Problem Statement

[0009](0009-server-signed-tokens.md) lets the server sign short-lived tokens. A JWT can name its
audience (`aud`): the service it is meant for. Which claims does a server-signed token carry?

## Considered Options

- An audience per server or per endpoint (not discussed in a source).
- No audience. #540 builds this.

## Decision Outcome

Chosen option: no audience.

- The token is a JWT with the type `pivotkit+jwt` and the issuer `pivotkit-server`.
- It carries no `aud` claim.

Why the token carries no audience: reason not recorded. OAuth tokens differ: there, each endpoint
checks its own audience.

### Consequences

- Risk: servers that share a key directory accept each other's tokens. Each server makes its own
  key with `pivotkit-server key new --for signing`, and the key directory is never copied to another
  server.
- One token works on REST and on MCP of the same server.
