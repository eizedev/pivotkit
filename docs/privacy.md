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

The defaults show little: every field is `summary` (name, type and counts, no values), the automatic
`values` rule is off, inline results are off for REST, downloads need `results: true`, files by path
are off. Open up field by field
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

With OAuth the server reads who the person is from the token (`auth.subjectClaim`, default `sub`)
and its issuer. It keeps them in memory only, to keep a code source's data per person (as a keyed
hash that means nothing outside the process), and does not log them unless you set `audit.subject`
(below). With `auth.groupProfiles` it reads the person's groups to choose a profile and logs none of
them. A library host's code source receives them as `caller.subject` and `caller.issuer` (unless it
is shared by all callers, `cacheShared`): what it does with them is the host's decision. The access
token itself goes to no source. The data a code source loaded is kept in the server's memory per
person (at most 64 loads and 256 MiB in all) until newer loads push it out, also after its
`maxStale` has passed or the person lost access: it is not given to anyone then, but it stays in
memory until it is pushed out or the process restarts. Each compute worker (`compute.workers`) keeps
the data sets of its last four runs, of any source, without hidden fields, at most a quarter of
`compute.memoryMb`, in memory until newer ones push them out or the worker is replaced. Only this
process can ask for them again, for the same load and the same owner (the person, or all callers for a shared source).

An [HTTP source](reference/sources.md#http) sends the values a caller passes for its parameters to
the operator's backend, in the address the operator configured, and nothing else of the caller: no
token, no identity, unless the operator configured one of these
([backend sign-in](reference/sources.md#http-auth)): a token exchange sends the person's access token
to the provider's token endpoint and gives the backend a token for that person; a parameter bound to
a claim sends that claim's value (a customer id, a verified email) to the backend. Only the claims
the configuration names are read from a token, and they are never logged. Exchanged tokens are kept
in memory only, at most until the person's own token expires. The HTTP source's data is kept per person in the same way (`ttl`, 60 seconds by default). The
log holds the backend's status, the address template and the source's id, never a value; with
`log: "debug"` also each request's path with the values written as `{name}`.

## Logs and retention { #retention }

The log holds the operation, the source id, the client (a token's name or an OAuth client id), a
random request id (it names nothing; it lets the operator find the line a person
quotes from an error), the status and the time (a source id only when it is a configured source); at the
default level never a view, a value or a token, and no client address unless
`http.trustProxy` is set. It names the person only with `audit.subject`
([logging](reference/mcp.md#logging)): `hash`, a keyed hash of issuer and subject, is still personal
data for as long as you keep `audit.key`, since you can match it to a person again (a rotated key,
which takes effect at a restart, changes every person's value); `plain` writes
the subject as the token carries it (often an e-mail address or an employee id). Turn it on only for
a purpose you can name (who used which source when), tell the people concerned, and keep that log
no longer than the purpose needs. Reports and drafts stay in the output directory until you remove them, or,
for reports, until the directory holds `output.maxFiles` files or `output.maxMb` megabytes of
pivotkit's: then a new report deletes the oldest reports, whoever asked for them (drafts are not
deleted this way; they may take at most half of `output.maxFiles`, and a draft over that is
refused). `output.maxAgeDays` deletes older reports and drafts (drafts waiting for approval
too) at start and every hour, and with them the temporary files of writes the server was killed
in once they are an hour old; or clean it up on a schedule of your own; give the output directory
to pivotkit alone. Reports are written with mode 0644 (less the umask), readable for other local
users: restrict the directory itself where that matters. Decide how long the log and the reports
are kept, and who can read the output directory (a web server that serves it, `output.baseUrl`,
makes every file reachable by its name). The server's own [download links](reference/delivery.md)
expire (60 minutes by default) and, for sources with fields that are not shown, open only for the
person who asked; a link is in the browser's history and a proxy's log until it expires.

## The AI client { #ai-client }

An MCP client sends what the model sees (descriptions, findings, inline results) to the model's
provider. What the policy shows a model is what that provider receives. See
[Security: the MCP server](security.md#mcp).
