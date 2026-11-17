---
title: Plain download links only where nothing new can become visible
description: A source gets plain download links only where no caller can see more than the policy shows today, also when the data gains a column.
status: accepted
date: 2026-11-16
---

# 0008 Plain download links only where nothing new can become visible

Sources: [#510](https://github.com/eizedev/pivotkit/issues/510),
[#539](https://github.com/eizedev/pivotkit/pull/539)

## Context and Problem Statement

A plain download link works for whoever holds it. The server checks no sign-in for it. So the
server gives plain links only for an open source, one where every caller sees the same.

A common policy is "show everything except the personal column": `"default": "show"` with one field
at `hide`. Such a source got no plain links (#510). Which sources should count as open?

## Considered Options

- Count `hide` as open. "Show everything except" gets plain links. #510 proposed this.
- State the old rule in the docs and keep it.
- Open only where nothing new can become visible, for every caller alike. #539 built this.

## Decision Outcome

Chosen option: open only where nothing new can become visible.

Open:

- every field `show`, nothing hidden
- hidden by default (`"default": "hide"`) with every named field at `show` or `hide`

Closed:

- "show everything except X" (`"default": "show"` with a field at `hide`)
- any field or default at `values` or `summary`, and the automatic values rule
- a field shown to some callers only

The reason recorded in #539: under "show everything except", a column the data gains later would be
shown behind a plain link.

### Consequences

- Good: a link stays safe when the data gains a column.
- Bad: "show everything except" needs a change for plain links. Set the default to `hide` and list
  the fields to show.
- `check-config` says what closes each source.
