---
title: More than one OAuth issuer, each checked on its own
description: The server accepts the tokens of a list of OAuth issuers. A token is checked with the keys, audience and scopes of the issuer its iss names. The first issuer is the one named to clients, and a token exchange serves the people of one issuer.
status: proposed
date: 2026-11-28
---

# 0019 More than one OAuth issuer, each checked on its own

Source: [#587](https://github.com/eizedev/pivotkit/issues/587)

## Context and Problem Statement

The server accepts tokens of one OAuth issuer (`auth.issuer`). Authentik gives each application an
issuer of its own. A server that serves two applications, such as a host application's portal and
Claude Code, then needs one Authentik provider for both or a global issuer with a shared key.

How does the server accept tokens of several issuers without one issuer's tokens counting at
another?

## Considered Options

- A list of issuers, each with its own keys, audience and scopes.
- One issuer, and the provider configured to a global issuer.
- One server per issuer.

## Decision Outcome

Chosen option: a list, `auth.issuers`, because it needs no change at the provider and keeps each
issuer's trust apart.

- A token is routed by its `iss`, matched exactly, and checked with that issuer's keys only.
- An entry's `audience` replaces the endpoint's for its tokens. Its `requiredScopes` add to the
  endpoint's.
- `auth.issuer` stays the form for one issuer. Both together are refused.
- The first issuer is the one the server names to clients: the resource metadata, the OpenAPI
  document, the download sign-in and `pivotkit login`.
- A token exchange names one issuer (`tokenExchange.issuer`), because its client and secret belong
  to one token endpoint. A person of another issuer does not see the source, and their token never
  goes there. #587 proposed a list of issuers per source; one issuer per exchange is the narrower
  start, and a list can come later without a break.
- `/readyz`, REST and MCP answer 503 until every issuer's metadata and keys are loaded, so the
  endpoints agree with the readiness check.
- Links bound to a sign-in go to the first issuer's people only, until
  [#441](https://github.com/eizedev/pivotkit/issues/441) gives the download sign-in an issuer of its
  own.

This extends [0015](0015-live-rows-for-a-host-page.md): "the configured issuer" there means any of
the listed issuers.

### Not decided

- Whether a provider accepts a token exchange with a subject token of another provider.
- A token exchange for the people of several issuers, with a client per issuer.
- Profiles per issuer. `clientProfiles` and the other profile settings hold for every issuer.
- Whether tokens of a loaded issuer should pass while another issuer is still unreachable.

### Consequences

- Good: two providers' clients reach one server without a change at the provider.
- Bad: a client ID that exists at two issuers gets the same `clientProfiles` entry at both.
- Bad: the server is ready only when every issuer's metadata and keys are loaded.
