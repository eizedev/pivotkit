---
title: Tokens from an external issuer
description: The server accepts short-lived tokens another system signs for its signed-in person, capped by the scopes and profiles the operator allows. They have no deny list and no audience.
status: accepted
date: 2026-11-17
---

# 0014 Tokens from an external issuer

Source: [#487](https://github.com/eizedev/pivotkit/issues/487)

## Context and Problem Statement

PowerShell Universal knows who is signed in to it. It should hand that person a short-lived
pivotkit token without a sign-in provider. How does pivotkit-server accept such tokens, and how
much may they carry?

## Considered Options

- An HMAC key shared with the other system.
- An Ed25519 key pair: the other system holds the private key, pivotkit only the public one.
- The other system's tokens carry what they claim: every scope without a `scope` claim, any
  configured profile.
- The other system's tokens are capped by what the operator allows for that issuer.

## Decision Outcome

Chosen options: the Ed25519 key pair, with caps per issuer.

- `auth.externalIssuers` names the issuer, its token type and one or two public keys.
- Each issuer is checked with its own name, type and keys only.
- `scopes` is required. A token's `scope` is cut to it, and a token without `scope` gets exactly
  that list, never every scope.
- `profiles` lists the profiles a token may name. Any other gets 401. `profile` is the issuer's
  profile for a token that names none.
- There is no deny list. `maxMinutes` caps a token's lifetime (default 60, at most 1440).
- The tokens carry no audience.

Why the key pair: #487 prefers it, so pivotkit can never mint tokens for the other system.

Why the caps: the other system is a sign-in provider, not an operator. Its tokens never get more
than the operator allowed it. Decided in the review of #487.

Why there is no deny list and no audience: reason not recorded in #487. The build keeps the
tokens short instead.

### Consequences

- A leaked token works until it expires, at most `maxMinutes`.
- Every pivotkit-server that trusts the same public key accepts the same token.
- A stolen private key of the issuer makes tokens for any person, within the issuer's scopes and
  profiles.
- Operators keep `maxMinutes` low and give each issuer only the scopes and profiles it needs.
- [0009](0009-server-signed-tokens.md) and [0010](0010-signed-tokens-without-audience.md) cover the
  tokens the server signs itself.
