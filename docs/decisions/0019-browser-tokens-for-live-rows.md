---
title: A browser token for the rows of one report
description: The browser reads a report's rows with a separate short-lived token the server makes for one source, never with a passed-on access token. The components get it through getToken(). This amends 0010 and 0015 for the rows route.
status: accepted
date: 2026-11-28
---

# 0019 A browser token for the rows of one report

Sources: [#621](https://github.com/eizedev/pivotkit/issues/621),
[the decision on #621](https://github.com/eizedev/pivotkit/issues/621#issuecomment-7231514614)

This record amends [0010](0010-signed-tokens-without-audience.md) and
[0015](0015-live-rows-for-a-host-page.md) for the rows route.

## Context and Problem Statement

In stage 1 ([0015](0015-live-rows-for-a-host-page.md)) the host application's backend fetches a
report's rows. Stage 2 lets the browser read them from pivotkit-server itself, for pages without a
backend and to take the host application out of the data path. The browser needs a token for that.
Which one?

## Considered Options

- Pass on the person's access token from the host application's sign-in.
- A separate short-lived token that only the report server accepts, signed with its own key.

## Decision Outcome

Chosen option: a separate short-lived token. Decided on #621:

- The host's backend, or the server's own viewer page, exchanges the person's token at
  pivotkit-server for a browser token.
- The server signs it with its own key. It is valid only for reading the rows of the report it was
  made for, for a few minutes, and it can be revoked.
- At the start, the browser path accepts only this token, never a passed-on access token of the
  host or the identity provider. Loosening this later is not breaking; tightening it would be.
- The components get the token through `getToken()` and never know where it comes from, so this
  choice stays on the server.

Reason recorded on #621: a script in the page can read a token in the browser. A passed-on token
also works for the host itself and everything else with the same audience. A separate token only
reads this report, ends on its own and can be revoked. It works the same for every host, with or
without its own identity provider.

### What this changes in earlier records

- [0010](0010-signed-tokens-without-audience.md) says one server-signed token works on REST and on
  MCP. The browser token is not such a token: it works on the rows route only, and every other
  route refuses it.
- [0015](0015-live-rows-for-a-host-page.md) says server-signed tokens get no rows. The browser
  token gets rows, because it stands for the person it was made for, with that person's rights.
  Static tokens and the signed tokens of `token issue` still get none.

### Consequences

- Good: a token a script steals reads one report's rows for a few minutes, nothing else.
- Good: a host application without its own identity provider uses the same path as one with it.
- Bad: the page asks for a new token every few minutes. `getToken()` is called again when a token
  expires.
- Bad: the server needs a key of its own for these tokens, beside its other keys.
- [0020](0020-the-browser-path.md) records how the browser path is built around this token.
