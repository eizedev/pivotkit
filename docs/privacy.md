---
title: Privacy for operators
description: What an operator of pivotkit's MCP server and REST service decides about the data they serve - purpose per source and caller, minimal defaults, field names and aggregates as personal data, small groups, token holders as recipients, logs and retention of reports.
---

# Privacy for operators

pivotkit's [MCP server](reference/mcp.md) and [REST service](reference/rest.md) compute reports over
data you configure and hand the results to callers you sign in. Neither decides what is lawful or
appropriate for your data; that is yours. This page lists what to decide and which setting carries
it. It makes no compliance claim.

## Purpose per source and caller { #purpose }

Write down, per source, why it is served and to whom: an analyst's dashboard, a nightly export, an
AI assistant for a team. Then give each kind of caller its own token (or OAuth client or scope) and,
where it needs more than the default, its own [profile](reference/rest.md#profiles). A source only
some callers may use gets `scopes`; a source no caller needs is not configured at all.

## Start from little { #defaults }

The defaults show little: every field is `summary` (name, type and counts, no values), inline results
are off for REST, downloads need `results: true`, files by path are off. Open up field by field
(`show`) for what a purpose needs, and `hide` what no caller needs: a hidden column is dropped when
the data is read. Leaving a column out of the data file is safer still.

## What counts as personal data { #personal-data }

- **Values** of a field about people (names, e-mail addresses, IDs) are personal data; so can be dates
  and free text.
- **Field names** are data too: every caller sees the names of the fields it may use, at every level.
- **Aggregates** can be personal data: a sum over a group of one is that person's value, and a count
  can answer "is this person in the data?". The policy withholds a result's shape when a view uses a
  field that is not shown, but every number in a report is real. Filter out or merge small groups in
  the data itself when that matters; pivotkit does not suppress small cells.
- **Links and drafts** carry a view (field names, filter items) to whoever opens them. The report
  page a link opens, and a scheduled report once a person approves the draft, are not limited by
  this policy: whoever may open them sees the values. Keep those pages behind your own sign-in.
- **Downloads**: a caller whose policy has `results: true` may read every value of every field that
  is not hidden, in a file, whatever level the field has.
- **Names match** without regard to case, Unicode form or the kind of whitespace (a no-break space or
  doubled spaces in a header match one space in the policy; two rules for the same field keep the
  stricter level); a column the reader renamed because its
  header repeats a hidden one ("Email (2)") is hidden too. Other columns the reader names itself
  ("Column 8" for cells without a header) take the default level: for a source of personal data,
  start from `"default": "hide"` and list the fields to show.

## Recipients { #recipients }

Whoever holds a token, or signs in with OAuth, receives what its policy allows, and the reports
written for it are in the output directory. Treat token holders as recipients of that data: give
tokens to people and systems, not to groups that change, rotate them (token files are read on every
request), and keep OAuth access tokens short-lived, since a token stays valid until it expires.

## Logs and retention { #retention }

The log holds the operation, the source id, the client (a token's name or an OAuth client id, never a
person's id), the status and the time (a source id only when it is a configured source); at the
default level never a view, a value or a token, and no client address unless
`http.trustProxy` is set. Reports and drafts stay in the output directory until you remove them:
`output.maxAgeDays` deletes older reports and drafts (drafts waiting for approval too) at start and
every hour, or clean it up on a schedule of your own; give the output directory to pivotkit alone.
Reports are written with mode 0644 (less the umask), readable for other local users: restrict the directory
itself where that matters. Decide how long the
log and the reports are kept, and who can read the output directory (a web server that serves it,
`output.baseUrl`, makes every file reachable by its name).

## The AI client { #ai-client }

An MCP client sends what the model sees (descriptions, findings, inline results) to the model's
provider. What the policy shows a model is what that provider receives. See
[Security: the MCP server](security.md#mcp).
