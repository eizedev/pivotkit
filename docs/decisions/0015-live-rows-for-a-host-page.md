---
title: Rows of a source for a signed-in person, behind the records right
description: The server hands a source's rows to a signed-in person only where a profile grants the records right for that source, and only fields at show. A host application's backend fetches them first; the browser path comes later.
status: accepted
date: 2026-11-19
---

# 0015 Rows of a source for a signed-in person, behind the records right

Sources: [#615](https://github.com/eizedev/pivotkit/issues/615),
[eizedev/powershell-universal-components#144](https://github.com/eizedev/powershell-universal-components/issues/144)

## Context and Problem Statement

A host application is a program that shows pivotkit reports on its own pages, such as PowerShell
Universal. A link from `create_link` opens a view there, but the page must load the rows itself.
Where only pivotkit-server can reach the data, the page cannot: an HTTP source with a token
exchange, a file on the server. The server hands out results, never rows.

How does a host application get the rows of a server source for the person who opens the page?

## Considered Options

- The host application's backend fetches the rows with the person's token.
- The browser fetches the rows with the person's token.
- The server computes every view, and the page shows results only.
- The link carries a copy of the data.

## Decision Outcome

Chosen option: the backend fetches the rows, because it needs no CORS, no token in the browser and
no network code in the components. The browser path follows in a later stage under its own record.

Stages: 1 is this record and [0016](0016-link-parameters-in-the-query-string.md). 2 is the browser
path and the server's viewer page. 3 is snapshots of uploaded data
([0017](0017-report-snapshots-carry-rows.md)).

### The route and the right

- `POST /api/v1/sources/records` answers the rows of one source. It stores nothing. MCP gets no
  tool for it.
- A profile grants the right with `records`, a list of source ids. It is off by default.
- Only fields at `show` for the caller leave. A request that needs a field at `values` or `summary`
  gets `NOT_ALLOWED`, and the `detail` names those fields. A hidden field is never named: one asked
  for answers as a field that does not exist.
- The server does not apply a view's filters. Filters are no permission, so every `show` row of
  the source leaves.
- Only a person gets rows: an OAuth token with a subject from the configured issuer, or a token from
  an [external issuer](0014-external-token-issuers.md) with a subject. Static tokens, server-signed
  tokens and callers without sign-in get `NOT_ALLOWED`. A machine token with a subject looks like a
  person, so the operator gives no such client a profile with `records`.

Why a list of source ids: a new data channel stays off until the operator decides, as in
[0007](0007-export-data-off-by-default.md). A source added later stays closed, in the spirit of
[0008](0008-plain-links-only-where-nothing-new-shows.md). One key keeps the decision in one place.

Why `show` only: every field is `summary` by default, so the operator chooses each field that may
leave. A caller with `results: true` can already read every non-hidden value in a file, so for such
a caller this is consistency, not a barrier.

### Which token the backend sends

- The person's access token from the host application's own sign-in, when the same issuer signs it
  and `rest.audience` lists its audience. The host application passes the token on to pivotkit, so
  pivotkit must be an intended audience of it.
- Or a token the host application signs for the person ([0014](0014-external-token-issuers.md)).
  Such a token cannot read a source with a token exchange, since 0014 refuses the exchange for it.

Both carry a person, so both may hold `records`.

### Bounds

- Limits per answer: `rest.records.maxRows` and `rest.records.maxCells` for the server, and
  `sources.<id>.records.maxRows`, which can only be lower. The load itself stays bounded by the
  existing limits (`limits.rows`, `http.maxBytes`, `sourceCache.maxMb`). The smallest limit wins.
- Over a limit: 413 `LIMIT_EXCEEDED`, with a message that says to filter with a parameter.
- Rows requests at once: a server-wide cap and one per person. A reader that stalls loses its slot
  after an idle timeout. Beyond the cap: 503 `BUSY` with `Retry-After`. The slots for large bodies
  are not reused, since they count one OAuth client as one caller
  ([#435](https://github.com/eizedev/pivotkit/issues/435)).
- The answer has the columnar shape the components take. The server writes it in pieces.
- The host application passes the answer on as text, never as objects of its own.

### Why no browser path in stage 1

- A stage-1 page is not worse than a host page that passes `-Data` today.
- The per-source row limit and a memory limit per host process bound the worst case.
- Real data can be measured only once the backend of the first source accepts exchanged tokens.

Stage 2 follows right after stage 1 if a report at the row limit adds more than a set amount of
memory to the host application's server process. The amount is set after the stage-1 measurement.

### Consequences

- Good: a link opens a live report on a host page with a backend. Nothing is stored.
- Good: `check-config` lists who may read rows of which source, and which fields would leave.
- Bad: with the defaults nothing works. The operator grants `records` and sets fields to `show`.
- Bad: under a profile with `"default": "show"`, a column the data gains later leaves too.
- Bad: rows reach the browser through the host page. The browser is not access control.
- Bad: in stage 1 the rows pass through the host application's memory.
- Bad: people who bring their own data get no live link before stage 3.
