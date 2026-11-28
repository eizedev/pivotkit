---
title: More than one OAuth issuer, each checked on its own
description: The server accepts the tokens of a list of OAuth issuers. A token is checked with the keys, audience and scopes of the issuer its iss names. The first issuer is the one named to clients, and a token exchange serves the people of one issuer.
status: accepted
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

Chosen option: a list, `auth.issuers`, because it needs no change at the provider and checks each
issuer's tokens with that issuer's keys only.

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
- Each issuer loads on its own. A token waits only for the issuer its `iss` names: 503 while that
  issuer's metadata and keys are not loaded, while the loaded issuers' tokens pass. `/readyz` is 200
  once one issuer is loaded and names the others. One unreachable provider must not take every
  sign-in down.
- Links bound to a sign-in go to the first issuer's people only, until
  [#441](https://github.com/eizedev/pivotkit/issues/441) gives the download sign-in an issuer of its
  own.

This extends [0015](0015-live-rows-for-a-host-page.md): "the configured issuer" there means any of
the listed issuers. The [external issuers](0014-external-token-issuers.md) of token mode are not
among them.

### Not decided

- Whether a provider accepts a token exchange with a subject token of another provider.
- A token exchange for the people of several issuers, with a client per issuer.
- Profiles or caps per issuer. Every listed issuer is trusted as `auth.issuer` is: its scopes,
  groups, client IDs and claims pick profiles and fill claim-bound parameters.

### Consequences

- Good: two providers' clients reach one server without a change at the provider.
- Bad: a client ID that exists at two issuers gets the same `clientProfiles` entry at both.
- Bad: an entry's `audience` applies to both MCP and REST. For that issuer the split into an MCP and
  a REST audience is gone: one of its tokens reaches both endpoints. Leave it unset where the
  provider can issue the endpoints' own audiences.
- Bad: `subjectClaim`, `groupsClaim`, `scopeClaim`, `intranet` and `allowInsecureIssuer` apply to
  every issuer. Issuers that name a person in different claims, such as Entra ID's `oid` beside
  Authentik's `sub`, are not supported.
- Bad: a token that names a configured issuer not loaded yet gets 503, one of an unknown issuer 401.
  A caller without a valid token can tell that a guessed issuer is configured and down. This is the
  price of per-issuer readiness, and it is accepted.
- Bad: a readiness probe that waits for `/readyz` does not see an issuer that is still unreachable;
  the body and a warning name it.
