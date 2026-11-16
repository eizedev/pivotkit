---
title: Privacy for operators
description: What an operator of pivotkit's MCP server and REST service decides about the data they serve - purpose per source and caller, minimal defaults, field names and aggregates as personal data, data sent in requests, what reaches backends and the sign-in provider, logs, memory and retention of reports, and what to tell the people who use it.
---

# Privacy for operators

pivotkit's [MCP server](reference/mcp.md) and [REST service](reference/rest.md) compute reports over
data you configure and hand the results to callers you sign in. Neither decides what is lawful or
appropriate for your data; that is yours. This page lists what to decide and which setting carries
it. It makes no compliance claim.

## What is processed, where, how long, who sees it { #overview }

| What | Where | How long | Who sees it |
| --- | --- | --- | --- |
| [Source data loaded for a caller](#memory) (code and HTTP sources) | the server's memory | until newer loads push it out (at most 64 loads and `sourceCache.maxMb`, default 256 MiB, a quarter per person or shared source) or a restart | the caller it was loaded for, through the policy |
| [Reports and schedule drafts](#retention) | files in `output.dir` | 30 days by default (`output.maxAgeDays`), or until `output.maxFiles`/`output.maxMb` push them out | whoever opens their link, or can read the directory |
| [Data sent in a request](#inline) (`inline:`) | the server's memory for one call; a report over it in `output.dir` | the call; the report as any report | the sender, through the model or program it uses |
| [Cache keys](#memory) | the server's memory | as long as their data | nobody: values, groups and claims only as a keyed digest |
| [Exchanged backend tokens](#memory) | the server's memory | at most until the person's own token expires | the backend they are for |
| [The log](#logs) | stderr, then your container runtime or journal | as long as you keep it | whoever reads the log |
| [Client IP addresses in the log](#logs) (`log.address`, on by default) | the log | as long as you keep the log | whoever reads the log |
| [The limiter](#memory) | the server's memory | about two minutes after an address's last refused token; a caller until its rate bucket is full again (checked every minute) | nobody |
| [Backends of HTTP sources](#recipients) | the backend and its own logs | as the backend keeps them | the backend's operator |
| [The sign-in provider](#recipients) | the provider's sign-in log | as the provider keeps it | the provider's administrators |
| [An upload store](#recipients) (`output.upload`) | your store, and the presign service's log | as the store keeps them | whoever holds a store link (as `bind` says); the store's operator |
| [The model's provider](#ai-client) | the provider of the AI client's model | as that provider keeps it | that provider |

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

In CSV, a hidden (or `summary`, `values`) column is protected only when the file is well formed: a
separator inside an unquoted value moves the values after it into the next columns, and pivotkit
catches that only where the row gets wider than the header (it then leaves the row out). A shifted
row whose writer dropped a cell at the end has the header's width and cannot be told from the data,
nor can a shifted row in a file whose every line ends with a separator, where the shift fills the
empty last cell.
For sources with fields kept back, write CSV with quoted values, or use xlsx or JSON;
`check-config` says this under each such CSV source.

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

## The `values` level { #values }

A field at [`values`](reference/mcp.md#policy) shows the model every distinct value of the field
(sorted, up to `valuesMax`), but no result by it: what the model reads is the list, and the report
is written to a file. A list of names is a list of the people in the data. Give `values` to fields
whose values are not about people (regions, products, states); with the automatic rule
(`policy.autoValues`) on, check what `check-config` says it would put at `values` and deny the
fields about people (`autoValues.deny`).

## Data sent in a request { #inline }

A caller may send a small table of its own with the source `inline:` (on MCP by default, up to 500
rows, 5000 cells and 256 KiB; on REST only for profiles with `data: true`;
[data in the request](reference/rest.md#data)). No exposure policy applies to it: the caller sent
it, so the model sees every value it computes over. What the model sent may still be about people
(a pasted list of names or salaries), and pivotkit handles it as such:

- it is never kept in a cache; it is read for the one call and dropped;
- a report over it counts as closed for links: it gets a link bound to the person who asked (a
  sign-in link), a one-time link where you chose `bind: "once"`, or none
  ([download links](reference/delivery.md)); a static token or a caller without a subject gets no
  sign-in link, and `output.baseUrl` gives it no address;
- the report file stays in the output directory like any other (see [retention](#retention));
- the log names it `inline:` with its number of rows and columns, never a value.

Switch it off with `mcp.data: false` (MCP) and by not giving any profile `data: true` (REST).

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
person (at most 64 loads and `sourceCache.maxMb` in all, default 256 MiB, a quarter per person or
shared source) until newer loads push it out, also after its
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

What reaches other services, in short:

- **The backend** of an HTTP source receives the caller's values in the address (a value in the
  path or query is in the backend's own access log), a claim's value where a parameter is bound to
  a claim, and with a token exchange a token that names the person. It does not receive the
  person's own access token.
- **The token endpoint** of a token exchange receives the person's access token (that is what the
  exchange is), and the token endpoint of client credentials the client's own secret.
- **The sign-in provider** sees a sign-in each time a person opens a [sign-in
  link](reference/delivery.md#sign-in): its own log then has an event for that person and the
  download client (`output.downloads.signIn.clientId`), as for any application they sign in to.
- **An [upload store](reference/delivery.md#upload)** receives the whole report file, under a name
  taken from the report's name (a source's title, or a name the caller gave); in presign mode the
  presign service also gets the file's size and SHA-256, and with `bind: "signIn"` an HMAC of the
  person's sign-in (never the name itself), the same for one person across reports. The presign
  service sees one request per report, so it knows when and how often reports are made. With
  `bind: "none"` anyone holding a link can open the file until the link expires; in template mode the
  store does not have to say when that is (`expiresAt` is optional), so the store's own settings
  decide. `bind` is your declaration of what the store does; pivotkit does not check it. How long
  reports stay there is the store's setting; `keepLocal: false` removes only the copy in
  `output.dir` after a successful upload, and a failed upload keeps it there until it is cleaned up.
- **The model's provider** receives what the model sees (see [the AI client](#ai-client)).

## Memory { #memory }

The server keeps in its memory, never on disk:

- the data of code and HTTP sources per person (and per set of values and policy levels), at most
  64 loads and `sourceCache.maxMb` in all (default 256 MiB, a quarter per person or shared
  source), until newer loads push it out or the process restarts, also after
  `maxStale` passed or the person lost access (it is not given to anyone then). An HTTP source's
  answer, JSON or CSV, is kept without the columns the caller's policy hides;
- in each compute worker, the data sets of its last four runs without hidden fields, at most a
  quarter of `compute.memoryMb`, until newer ones push them out or the worker is replaced;
- exchanged backend tokens, per person, at most until the person's own token expires;
- the keys of that data: the person, their groups, claims and values only as a keyed digest (a
  random key per process), so a memory dump does not show them in clear text, while the data
  itself is there;
- the limiter's state (`rest.rateLimit`, `mcp.rateLimit`): per address that sent a refused token, the
  times of its refused tokens of the last minute (the limit on trying tokens); per client (a static token's name, an OAuth client id, or
  `local`) a rate bucket, its fill and when it was last used, and the number of its requests running.
  Once a minute the server drops an address whose refused tokens are all older than a minute and a
  client whose bucket is full again, so an address is kept at most about two minutes after its last
  refused token; a running count goes when its requests end. Each map holds at most 10,000 keys.

Data in memory goes with a restart.

For code sources, HTTP sources (CSV and JSON) and CSV files, what the server keeps holds no hidden
column: not the loads it keeps per person, not the data sets a compute worker keeps, not the notes
of a read, for a signed-in person as for a caller whose data is not kept. To drop a column, though,
the server reads all of the data first: a code source's rows as `load` returns them, and an HTTP
source's body and, for JSON, its parsed rows in the main thread; for CSV, the decoded text and every
cell in the worker that reads it. These are freed once the data is read, and freed memory can hold
their values until the process reuses it, as in any process. A dump of the server's memory taken
meanwhile (a core dump, a debugger, a scan by someone with access to the host) can show values of a
hidden column. Where that matters, have the backend or the `load` function leave the column out, as
with a file that leaves it out.

The test [test/memory.test.js](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-server/test/memory.test.js)
checks the first part. It calls a CSV, a JSON and a code source, each as a signed-in person and as a
caller without an identity, with hidden text and number columns of unique values (hidden by the
default level and by a field's own rule). After a garbage collection it finds none of them in the
kept loads, in the worker's data sets, or among the texts and boxed numbers the main thread and the
worker still reach (a heap snapshot of each), while it finds every shown value and values kept on
purpose. A heap snapshot does not show numbers held unboxed (in a double array, or as small
integers), so hidden numbers are checked in the kept loads and the worker's data sets only: numbers
held unboxed outside the kept data are not seen. A second part reads a 16 MB CSV whose hidden
column is most of it (14 MB), through a file source and as an HTTP source's answer, and the same
file without that column. After a garbage collection the memory still in use after the first read
may exceed the second's by at most 1 % and 128 KiB, so the kept data set keeps no more than the
shown data does, and the second must exceed 2 MB, so the shown data is counted. Data sent in a
request is not part of the test.

## check-config and check-source { #check-output }

`check-config` and `check-source` print no value and no secret, but they print field names, and
`check-source` prints the keys of a backend's answer where it finds no rows. Field names can be data
(a column per person or per customer). `check-config` also prints the full path of each file a
secret is read from, and the addresses of your issuer and backends. Treat their output as you treat
the data: do not paste it into public issues or chats without reading it. `pivotkit-server
check-config` (and `pivotkit-mcp --check-config --http`) asks the OAuth issuer for its public
metadata once, with nothing of yours in the request, so it can warn when the issuer cannot be
reached; a library host's `checkConfig()` asks nothing.

## Logs { #logs }

pivotkit writes one line per event to stderr and keeps no log file; retention and access are those
of your container runtime or journal.

A line holds the operation, the source, the client (a token's name or an OAuth client id), a random
request id (it names nothing; it lets you find the line a person quotes from an error), a trace id,
the status and the time; at the default level never a view, a value or a token.

A request's lines hold the client's IP address (`log.address`, on by default): `address`, the
client as best known (with `http.trustProxy` the address the proxy names, else the address the
connection came from), and `peerAddress`, the connection's own address where that differs (the
proxy). An IP address can identify a person, so it is personal data; it is there to tell an attack
or a misbehaving script from a person, and to find a request a person reports. Keep the log no
longer than that needs, or set `log.address` to `off` (flag `--log-address off`) when the proxy's
own log covers it.

A refused request's line holds the `Host` and `Origin` it was sent with (at most 100 characters
each), which a caller chooses. The `started` line names the configured source ids and the static
tokens' names (never a value), at most 64 characters each. The warning of an HTTP source whose
backend answered with an error status holds the source's address template (`template`), and with it
the backend's host name, never a parameter's value.

A source is named by its configured id, `inline:` or `file:`, and anything
else a caller typed as `unknown`. The client of a static token is the token's name: name tokens
after systems or roles, not after people, or the log names a person without `audit.subject`.
`--log debug` is for setting a server up: its lines can hold more, an error's own message (which may
quote a value or a request's body) among them; do not leave it on.

A line names the person only with `audit.subject` ([logging](reference/mcp.md#logging)): `hash`, a
keyed hash of issuer and subject, is still personal data for as long as you keep `audit.key`, since
you can match it to a person again (a rotated key, which takes effect at a restart, changes every
person's value); `plain` writes the subject as the token carries it (often an e-mail address or an
employee id). Turn it on only for a purpose you can name (who used which source when), tell the
people concerned, and keep that log no longer than the purpose needs.

## Reports and retention { #retention }

Reports and drafts stay in the output directory until they are deleted:

- by age: `output.maxAgeDays` is 30 by default, so reports and drafts (drafts waiting for approval
  too) older than 30 days are deleted at start and every hour, with the temporary files of writes
  the server was killed in once they are an hour old. `output.maxAgeDays: 0` keeps them with no age
  limit; `check-config` warns under `Retention:` when you set 0 while closed sources or data sent in
  requests are on. The default does not apply where the output directory holds the configuration
  or a source, template or token file (nothing is deleted by age there): give the output directory
  to pivotkit alone;
- by count and size: when the directory holds `output.maxFiles` files (1000 by default) or
  `output.maxMb` megabytes (1024 by default) of pivotkit's, a new report deletes the oldest
  reports, whoever asked for them (drafts are not deleted this way; they may take at most half of
  `output.maxFiles`, and a draft over that is refused);
- by you, on a schedule of your own.

A link that expires does not remove its file. Reports cannot be searched per person; to remove a
person's reports you delete files.

Who can read the output directory:

- the directory the server creates is mode 0700 (only the server's user), or 0755 with
  `output.baseUrl` (less the umask), so your web server can read it; a directory that exists keeps
  its mode;
- reports are written with mode 0644 (less the umask): readable for other local users wherever the
  directory lets them in, so restrict the directory where that matters;
- the markers of used one-time links in `.pivotkit-downloads/` hold a link's random nonce and its
  expiry, no personal data.

A web server that serves the directory (`output.baseUrl`) makes every file reachable by its name for
as long as the file is there, with no expiry and no sign-in: pivotkit gives such an address only to
reports over open sources, but the web server serves whatever is in the directory. The server's own
[download links](reference/delivery.md) expire (60 minutes by default). Reports over closed sources
and over data that belongs to one person (data sent in the request, a source bound to the person, a
code source with `perPerson`) get a link bound to the person who asked, a one-time link where you
chose `bind: "once"`, or none, and never an `output.baseUrl` address. pivotkit cannot see whether a
code source answers differently per caller. If yours does, set `perPerson: true`, or reports over it
get plain links and, with `output.baseUrl`, a permanent address. A link is in the browser's history and
a proxy's log until it expires. Two sign-in links of one person cannot be tied to each other: each
holds the person only as a digest with its own random part.

## The AI client { #ai-client }

An MCP client sends what the model sees (descriptions, findings, inline results) to the model's
provider. What the policy shows a model is what that provider receives:
[what reaches an AI model](model-data.md) shows it per level and per client. See also
[Security: the MCP server](security.md#mcp).

## What to tell your users { #tell-users }

A short list to adapt for the people who use the server through an AI assistant or a program:

- Which sources they can reach, what for, and that the assistant's provider receives what the
  assistant is shown.
- That data they paste or send to the assistant for a report (`inline:`) goes to this server and
  into a report file, which is kept for as long as you keep reports (say how long).
- That a report's link opens only after they sign in (for their own or closed data), works for a
  limited time (say how long), and should not be forwarded.
- Whether their name or id is in the server's log (`audit.subject`), why, and for how long.
- That the server's log holds the IP address their requests come from (`log.address`), why, and for
  how long.
- That the sign-in provider records each sign-in, including the one a download link asks for.
- Whom to ask when a report is missing, a link does not work, or they want their data removed.
