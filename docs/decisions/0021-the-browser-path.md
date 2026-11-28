---
title: The browser path for live reports
description: How the browser reads a report's rows with the token of 0020 - the exchange route, what the token carries, CORS of its own, access levels for live links, the components' server connection and the viewer page.
status: accepted
date: 2026-11-28
---

# 0021 The browser path for live reports

Sources: [#621](https://github.com/eizedev/pivotkit/issues/621),
[the decision on #621](https://github.com/eizedev/pivotkit/issues/621#issuecomment-7231514614),
the decision on the viewer page's sign-in in [#997](https://github.com/eizedev/pivotkit/pull/997) (2026-11-28)

## Context and Problem Statement

[0020](0020-browser-tokens-for-live-rows.md) decides that the browser reads a report's rows with a
separate short-lived token. This record says how the server makes and checks that token, which
pages may use it, who may open a live link, and how the components and the server's own viewer
page use it. Everything here is open to change before it is accepted.

## Considered Options

- The token carries the person's identity, readable by any script in the page (a signed JWT).
- The token carries the person's identity encrypted, so only the server reads it (an encrypted JWT).
- The token carries an ID, and the server keeps the person's identity in memory.
- CORS for the browser path through `rest.cors.origins`.
- CORS for the browser path through a setting of its own.
- An access level as a page setting, checked in the browser.
- An access level signed into the link, checked when the token is made.
- The viewer page runs the sign-in inside the page: the code flow with PKCE in the browser, a public
  client, the person's token in the page (A).
- The server signs the person in, as for the download links, and hands the page only the browser
  token (B).
- The server signs the person in and keeps a session in a cookie (C).

## Decision Outcome

### The exchange

- `POST /api/v1/sources/records/token` takes `{ source, params?, access? }` and answers
  `{ token, tokenType, expiresIn, expiresAt, source }`.
- Only a person who may read the source's rows (0015) gets one: an OAuth token with a subject, or
  an external issuer's token with a subject. A browser token cannot make another one.
- The token's lifetime is `rest.browser.minutes` (5 by default, at most 60), never longer than the
  person's own token.
- A source whose backend exchanges the person's token is refused at the start: the browser token
  never carries the person's access token, so the server could not exchange it.

### The token

- An encrypted JWT (RFC 7516, `dir` with `A256GCM`) of the type `pivotkit-browser+jwt`.
- Its key is derived from `rest.browser.key`, a secret like `output.downloads.key`. With a state
  directory the server makes it at the first start (`<state>/secrets/browser.key`). Without one, the
  key is random per process, so a restart ends every browser token.
- It carries the source, its parameters and the person as the server saw them: the issuer and
  subject, the profile, the scopes, and only the claims the source's parameters are bound to. A
  code source gets the groups and claims too, since its code sees them.
- Why encrypted: no script in the page reads the person's claims, and the server needs no memory
  per token, so several replicas with one key work.
- The rows route takes it for the source it was made for only. A request with other parameters is
  refused.
- Every other route, MCP and the download links refuse it as an unknown token.
- The log names its ID, never its value.
- A new key revokes every browser token within a second, without a restart. A deny list for one
  token is not built yet.

### CORS

- `rest.browser.origins` lists the pages that may read rows with a browser token. It is empty by
  default: only a page on the server's own origin reads rows.
- Such an origin may call the rows route only. Every other route refuses it as before.
- `rest.cors.origins` keeps its job: origins that call the whole service with their own tokens.

### Access levels for live links

- A live link carries one level: only me, signed-in, or a group from the sign-in (the groups
  claim). `rest.browser.levels` lists the levels an instance offers, `["signedIn"]` by default.
- `create_link` takes the level, and writes it signed into the page's query string as `pk-access`.
  The group and the person are in it only as keyed digests.
- The key of `pk-access` is derived from `rest.browser.key` for this purpose alone.
- The exchange route checks it. A link without one opens as signed-in where the instance offers
  that, and is refused otherwise.
- A level only narrows who opens the link. It is no data boundary: every reader reads with their own
  rights, and could read the same rows without the link.
- A person signed in at an external issuer gets no "only me" or group link, as
  [0014](0014-external-token-issuers.md) gives such tokens no links bound to a sign-in.
- "Anyone with the link" is not part of this stage.

### The components

- `server={{ url, source, getToken }}` in React, `server-url` and `server-source` on the element.
  The page names its server in its own code, never from a link.
- Parameters come from the page's query string, only the names in `allowParams`.
- `getToken()` is called on start and again when the token expires.
- The network code loads on first use, so a page without a server loads none of it.
- The states (loading, refused, expired, too large, unreachable) are events and data first. Their
  look and words follow the design.

### The viewer page

Chosen: B, the [download links' sign-in](../reference/delivery.md#sign-in).

- `http.publicUrl` + `/live/<source>` is the server's own page for a live link. It is off unless
  `rest.browser.viewer` is set.
- Opening it starts nothing: a link preview signs nobody in. Its script goes to the sign-in.
- The server runs the code flow with PKCE, `state` and `nonce`, on the download links' client with
  one more redirect URI. The code is the download links', not a second flow.
- A short cookie of its own holds the sign-in under way. The answer clears it. No session follows.
- The callback reads the person's rights from the access token of the same answer, as the REST
  service reads a bearer's, for the issuer and subject of the ID token. It makes the browser token of
  0020 for the link's source, parameters and access level.
- The page gets that browser token only, never the person's own token. When the report needs a new
  one, the page signs in again.
- Its Content-Security-Policy allows no inline script or style. Its tests run over stored titles
  and branding.

Not built, and a possible later option each:

- A, the sign-in in the page: the person's token would be in the page, readable by its scripts,
  for as long as it lives. It needs a second client, public, at every provider.
- C, a session in a cookie: the server would keep state per person, a cookie would read rows on its
  own, and the page would need protection against cross-site requests. Nothing needs it while a
  sign-in at the provider is quick.

### Consequences

- Good: a page without a backend shows a live report, and the rows never pass through the host
  application.
- Good: a stolen browser token reads one report for minutes, and tells nothing about its person.
- Bad: the browser path does not yet serve a source whose backend exchanges the person's token.
- Bad: a level other than signed-in needs `rest.browser.key` or a state directory, or links stop
  working after a restart. A new key also ends the levels of the links made before it.
- Bad: an encrypted token cannot be read for debugging. The log has its ID.
- Good: the viewer page needs no page or backend of the host, and no second client.
- Bad: without a session, the viewer page goes to the provider again on every reload and whenever
  the report needs a new browser token. That is quick while the person is signed in there.
- Bad: the viewer page needs pivotkit-element installed next to the server.
