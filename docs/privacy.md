---
title: Privacy for operators
description: What an operator of pivotkit's MCP server and REST service decides about the data they serve - purpose per source and caller, minimal defaults, field names and aggregates as personal data, data sent in requests, what reaches backends and the sign-in provider, logs, memory and retention of reports, and what to tell the people who use it.
---

# Privacy for operators

pivotkit's [MCP server](reference/mcp.md) and [REST service](reference/rest.md) compute reports over
data you configure. They hand the results to callers you sign in. Neither decides what is lawful or
appropriate for your data. That decision is yours. This page lists what to decide and which setting
carries it. It makes no compliance claim.

## What is processed, where, how long, who sees it { #overview }

| What | Where | How long | Who sees it |
| --- | --- | --- | --- |
| [Source data loaded for a caller](#memory) (code and HTTP sources) | the server's memory | until newer loads push it out (at most 64 loads and `sourceCache.maxMb`, default 256 MiB, a quarter per person or shared source) or a restart | the caller it was loaded for, through the policy |
| [Reports](#retention) | files in `output.dir` | 30 days by default (`output.maxAgeDays`), or until `output.maxFiles`/`output.maxMb` push them out | whoever opens their link, or can read the directory |
| [Schedule drafts](#retention) | files in `output.dir` | while waiting for approval, until the host or you remove them; once the host sets another `status`, as reports | whoever can read the directory, such as the host that approves them |
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

For each source, write down why you serve it and to whom: an analyst's dashboard, a nightly export,
an AI assistant for a team. Then:

- Give each kind of caller its own token, OAuth client or scope.
- Give a caller its own [profile](reference/rest.md#profiles) where it needs more than the default.
- Set `scopes` on a source that only some callers may use.
- Do not configure a source that no caller needs.

## Start from little { #defaults }

The defaults show little:

- Every field is `summary`: name, type and counts, no values.
- The automatic `values` rule is off.
- Inline results are off for REST.
- Downloads need `results: true`.
- Files by path are off.

Open up field by field (`show`) for what a purpose needs. Set `hide` on what no caller needs:
pivotkit drops a hidden column when it reads the data. Leaving a column out of the data file is
safer still.

In CSV, a hidden column is protected only when the file is well formed. The same holds for a
`summary` or `values` column. A separator inside an unquoted value moves the values after it into
the next columns. pivotkit catches that only where the row gets wider than the named header, not
counting the row's empty cells at the end. It then leaves the row out.

There is one exception. pivotkit reads a file whose every row has the same width and holds nothing
beyond the named header as a file with a separator that ends every line, and keeps its rows.

A value can open a quote and never close it. That quote can pull the rows after it, hidden values
too, into one cell. So where a caller sees a field below `show`, the server refuses a CSV, TSV or
text file with any quoted value that spans lines (`INVALID_FILE`, 422). It also refuses a file whose
separator it cannot tell. This holds for file sources, uploads, data sent in a request and an HTTP
source's CSV answer. A source whose fields are all `show` reads such a file as before.

The cost: a correct value over several lines, such as an address, also refuses such a source. Use
xlsx or JSON for it.

A stray pair of quotes on one line, such as `"South,hid-2",20`, still puts a hidden value into a
shown cell. pivotkit cannot tell it from correct quoting.

pivotkit cannot detect two kinds of shift from the data:

- a row whose writer dropped a cell at the end, which has the header's width
- a row in such a uniform file whose shift fills the empty last cell

For sources with fields kept back, write CSV with quoted values, or use xlsx or JSON.
`check-config` says this under each such CSV source.

## What counts as personal data { #personal-data }

- **Values** of a field about people (names, e-mail addresses, IDs) are personal data. Dates and
  free text can be personal data too.
- **Field names** are data too: every caller sees the names of the fields it may use, at every level.
- **Aggregates** can be personal data. A sum over a group of one is that person's value. A count
  can answer "is this person in the data?". The policy withholds a result's shape when a view uses a
  field that is not shown, but every number in a report is real. pivotkit does not suppress small
  cells. Filter out or merge small groups in the data itself when that matters.
- **Error codes and timing** are not hidden. A view over a field that is not shown can end in
  `LIMIT_EXCEEDED` or a timeout. That answer tells the caller one bit about the data: whether the
  work went over a limit.
- **Links and drafts** carry a view (field names, filter items) to whoever opens them. This policy
  does not limit the report page a link opens. It also does not limit a scheduled report once a
  person approves the draft. Whoever may open them sees the values. Keep those pages behind your own
  sign-in.
- **Downloads**: a caller whose policy has `results: true` may read every value of every field that
  is not hidden, in a file, whatever level the field has.
- **Names match** like this:
    - Case, Unicode form and the kind of whitespace do not matter.
    - A no-break space or doubled spaces in a header match one space in the policy.
    - Two rules for the same field keep the stricter level.
    - The reader renames a column whose header repeats a hidden one ("Email (2)"). That column is
      hidden too.
    - Other columns the reader names itself ("Column 8" for cells without a header) take the default
      level. For a source of personal data, start from `"default": "hide"` and list the fields to
      show.
    - A JSON source's nested properties become fields with a dotted name
      ([column names](reference/import.md#column-names-and-values)). A rule for `meta` does not cover
      `meta.Secret`. Only a rule that names `meta.Secret` does. For JSON sources, start from
      `"default": "hide"` too.

## The `values` level { #values }

A field at [`values`](reference/mcp.md#policy) shows the model every distinct value of the field,
sorted, up to `valuesMax`. It shows no result by that field. The model reads the list, and the
server writes the report to a file. A list of names is a list of the people in the data.

Give `values` to fields whose values are not about people: regions, products, states. With the
automatic rule (`policy.autoValues`) on, check what `check-config` says it would put at `values`.
Deny the fields about people (`autoValues.deny`).

## Data sent in a request { #inline }

A caller may send a small table of its own with the source `inline:`
([data in the request](reference/rest.md#data)):

- On MCP it is on by default, up to 500 rows, 5000 cells and 256 KiB.
- On REST it is on only for profiles with `data: true`.

No exposure policy applies to it. The caller sent it, so the model sees every value it computes
over. What the model sent may still be about people, such as a pasted list of names or salaries.
pivotkit handles it as such:

- pivotkit never keeps it in a cache. It reads it for the one call and drops it.
- A report over it counts as closed for links ([download links](reference/delivery.md)).
  `output.baseUrl` gives it no address. It gets one of these:
    - a link bound to the person who asked (a sign-in link). A static token or a caller without a
      subject gets no sign-in link.
    - a one-time link, where you chose `bind: "once"`
    - no link
- The report file stays in the output directory like any other (see [retention](#retention)).
- The log names it `inline:` with its number of rows and columns, never a value.

Switch it off with `mcp.data: false` (MCP) and by not giving any profile `data: true` (REST).

## Recipients { #recipients }

Whoever holds a token, or signs in with OAuth, receives what its policy allows. The reports written
for it are in the output directory. Treat token holders as recipients of that data:

- Give tokens to people and systems, not to groups that change.
- Rotate tokens. The server reads token files on every request.
- Keep OAuth access tokens short-lived, since a token stays valid until it expires.

With OAuth the server reads who the person is from the token (`auth.subjectClaim`, default `sub`)
and its issuer. It keeps them in memory only, as a keyed hash that means nothing outside the process.
It needs them to keep a code source's data per person. The server does not log them unless you set
`audit.subject` (below). With `auth.groupProfiles` it reads the person's groups to choose a profile
and logs none of them.

A library host's code source receives them as `caller.subject` and `caller.issuer`, unless all
callers share it (`cacheShared`). What it does with them is the host's decision. The access token
itself goes to no source.

The server keeps the data a code source loaded in its memory per person until newer loads push it
out. The cap is 64 loads and `sourceCache.maxMb` in all, default 256 MiB, a quarter per person or
shared source. The data stays even after its `maxStale` has passed or the person lost access. The
server does not give it to anyone then, but it stays in memory until newer loads push it out or the
process restarts.

Each compute worker (`compute.workers`) keeps the data sets of its last four runs in memory, of any
source, without hidden fields. They take at most a quarter of `compute.memoryMb`. They stay until
newer ones push them out or the server replaces the worker. Only this process can ask for them again,
for the same load and the same owner: the person, or all callers for a shared source.

An [HTTP source](reference/sources.md#http) sends the values a caller passes for its parameters to
the operator's backend, in the address the operator configured. It sends nothing else of the caller:
no token, no identity. The exception is when the operator configured one of these
([backend sign-in](reference/sources.md#http-auth)):

- A token exchange sends the person's access token to the provider's token endpoint and gives the
  backend a token for that person.
- A parameter bound to a claim sends that claim's value (a customer id, a verified email) to the
  backend.

The server reads only the claims the configuration names from a token, and never logs them. It keeps
exchanged tokens in memory only, at most until the person's own token expires. It keeps the HTTP
source's data per person in the same way (`ttl`, 60 seconds by default). The log holds the backend's
status, the address template and the source's id, never a value. With `log: "debug"` it also holds
each request's path, with the values written as `{name}`.

What reaches other services, in short:

- **The backend** of an HTTP source does not receive the person's own access token. It receives:
    - the caller's values in the address. A value in the path or query is in the backend's own
      access log.
    - a claim's value, where a parameter is bound to a claim.
    - with a token exchange, a token that names the person.
- **The token endpoint** of a token exchange receives the person's access token: that is what the
  exchange is. The token endpoint of client credentials receives the client's own secret.
- **The sign-in provider** sees a sign-in each time a person opens a [sign-in
  link](reference/delivery.md#sign-in). Its own log then has an event for that person and the
  download client (`output.downloads.signIn.clientId`), as for any application they sign in to.
- **An [upload store](reference/delivery.md#upload)** receives the whole report file. Its name comes
  from the report's name: a source's title, or a name the caller gave.
    - In presign mode the presign service also gets the file's size and SHA-256.
    - With `bind: "signIn"` the presign service also gets an HMAC of the person's sign-in, never the
      name itself. The HMAC is the same for one person across reports.
    - The presign service sees one request per report, so it knows when and how often reports are
      made.
    - With `bind: "none"` anyone holding a link can open the file until the link expires. In
      template mode the store does not have to say when that is (`expiresAt` is optional), so the
      store's own settings decide.
    - `bind` is your declaration of what the store does. pivotkit does not check it.
    - The store's setting decides how long reports stay there. `keepLocal: false` removes only the
      copy in `output.dir` after a successful upload. After a failed upload the copy stays there
      until it is cleaned up.
- **The model's provider** receives what the model sees (see [the AI client](#ai-client)).

## Memory { #memory }

The server keeps in its memory, never on disk:

- **The data of code and HTTP sources**, per person and per set of values and policy levels:
    - at most 64 loads and `sourceCache.maxMb` in all (default 256 MiB, a quarter per person or
      shared source)
    - until newer loads push it out or the process restarts
    - even after `maxStale` passed or the person lost access. The server does not give it to anyone
      then.

    The server keeps an HTTP source's answer, JSON or CSV, without the columns the caller's policy
    hides.

- **In each compute worker**, the data sets of its last four runs without hidden fields. They take
  at most a quarter of `compute.memoryMb` and stay until newer ones push them out or the server
  replaces the worker.
- **Exchanged backend tokens**, per person, at most until the person's own token expires.
- **The keys of that data.** The person, their groups, claims and values are there only as a keyed
  digest, with a random key per process. A memory dump does not show them in clear text, while the
  data itself is there.
- **The limiter's state** (`rest.rateLimit`, `mcp.rateLimit`):
    - per address that sent a refused token: the times of its refused tokens of the last minute
      (the limit on trying tokens)
    - per client (a static token's name, an OAuth client id, or `local`): a rate bucket, its fill,
      when it was last used, and the number of its requests running

    Once a minute the server drops an address whose refused tokens are all older than a minute. It
    also drops a client whose bucket is full again, so the server keeps an address at most about two
    minutes after its last refused token. A running count goes when its requests end. Each map holds
    at most 10,000 keys.

Data in memory goes with a restart.

For code sources, HTTP sources (CSV and JSON) and CSV files, what the server keeps holds no hidden
column. This holds for the loads it keeps per person, the data sets a compute worker keeps and the
notes of a read. It holds for a signed-in person and for a caller whose data the server does not
keep.

To drop a column, though, the server reads all of the data first:

- a code source's rows as `load` returns them
- an HTTP source's body and, for JSON, its parsed rows, in the main thread
- for CSV, the decoded text and every cell, in the worker that reads it

These are freed once the server has read the data. As in any process, freed memory can hold their
values until the process reuses it. A dump of the server's memory taken meanwhile can show values of
a hidden column: a core dump, a debugger, a scan by someone with access to the host. Where that
matters, have the backend or the `load` function leave the column out, as with a file that leaves it
out.

The test [test/memory.test.js](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-server/test/memory.test.js)
checks the first part:

- It calls a CSV, a JSON and a code source. It calls each as a signed-in person and as a caller
  without an identity.
- Each source has hidden text and number columns of unique values, hidden by the default level and
  by a field's own rule.
- After a garbage collection the test finds none of these values in the kept loads or in the
  worker's data sets. It also finds none among the texts and boxed numbers the main thread and the
  worker still reach (a heap snapshot of each). It does find every shown value and the values kept on
  purpose.
- A heap snapshot does not show numbers held unboxed (in a double array, or as small integers). So
  the test checks hidden numbers in the kept loads and the worker's data sets only. It does not see
  numbers held unboxed outside the kept data.

A second part reads a 16 MB CSV whose hidden column is most of it (14 MB). It reads it through a
file source and as an HTTP source's answer, and then the same file without that column. After a
garbage collection, two checks apply:

- The memory still in use after the first read may exceed the second's by at most 1 % and 128 KiB.
  So the kept data set keeps no more than the shown data does.
- The second must exceed 2 MB, so the test knows the shown data is counted.

Data sent in a request is not part of the test.

## check-config and check-source { #check-output }

`check-config` and `check-source` print no value and no secret. They do print:

- field names. Field names can be data, such as a column per person or per customer.
- with `check-source`, the keys of a backend's answer where it finds no rows.
- with `check-config`, the full path of each file a secret is read from, and the addresses of your
  issuer and backends.

Treat their output as you treat the data. Do not paste it into public issues or chats without reading
it.

`pivotkit-server check-config` (and `pivotkit-mcp --check-config --http`) asks the OAuth issuer for
its public metadata once, with nothing of yours in the request. It does so to warn when it cannot
reach the issuer. A library host's `checkConfig()` asks nothing.

## Logs { #logs }

pivotkit writes one line per event to stderr and keeps no log file. Your container runtime or
journal decides retention and access.

A line holds:

- the operation
- the source
- the client: a token's name or an OAuth client id
- a random request id. It names nothing. It lets you find the line a person quotes from an error.
- a trace id
- `upstreamRequestId`: the `X-Request-Id` the request came with, up to 128 characters. The caller
  or a proxy chooses it. A proxy may put a user id or a session id there. It is on every line of the
  request, and no setting leaves it out, `log.address: "off"` neither. To keep it out, have the
  proxy strip or rewrite the header.
- the status and the time

At the default level a line never holds a view, a value or a token.

A request's lines hold the client's IP address. This is on by default (`log.address`):

- `address` is the client as best known. With `http.trustProxy` it is the address the proxy names,
  else the address the connection came from.
- `peerAddress` is the connection's own address where that differs: the proxy.

An IP address can identify a person, so it is personal data. It is there to tell an attack or a
misbehaving script from a person, and to find a request a person reports. Keep the log no longer
than that needs. To leave addresses out, set `"log": { "address": "off" }`, the flag
`--log-address off` or `PIVOTKIT_LOG_ADDRESS=off`. Do that when the proxy's own log covers it.

Other lines:

- A refused request's line holds the `Host` and `Origin` it was sent with, at most 100 characters
  each. A caller chooses them.
- The `started` line names the configured source ids and the static tokens' names (never a value),
  at most 64 characters each.
- The warning of an HTTP source whose backend answered with an error status holds the source's
  address template (`template`). With it, the line holds the backend's host name, never a
  parameter's value.

The log names a source by its configured id, `inline:` or `file:`. It writes anything else a caller
typed as `unknown`. The client of a static token is the token's name. Name tokens after systems or
roles, not after people, or the log names a person without `audit.subject`.

`--log debug` is for setting a server up. Its lines can hold more, among them an error's own
message, which may quote a value or a request's body. Do not leave it on.

A line names the person only with `audit.subject` ([logging](reference/mcp.md#logging)):

- `hash` writes a keyed hash of issuer and subject. It is still personal data for as long as you keep
  `audit.key`, since you can match it to a person again. A rotated key changes every person's value.
  It takes effect at a restart.
- `plain` writes the subject as the token carries it, often an e-mail address or an employee id.

Turn it on only for a purpose you can name, such as who used which source when. Tell the people
concerned, and keep that log no longer than the purpose needs.

## Reports and retention { #retention }

Reports and drafts stay in the output directory until one of these deletes them:

- **Age.** `output.maxAgeDays` is 30 by default. The server deletes reports older than 30 days at
  start and every hour. It also deletes the temporary files of writes the server was killed in, once
  they are an hour old. It never deletes a schedule draft that still waits for approval.
    - `output.maxAgeDays: 0` keeps them with no age limit. `check-config` warns under `Retention:`
      when you set 0 while closed sources or data sent in requests are on.
    - The default does not apply where the output directory holds the configuration or a source,
      template or token file. Nothing is deleted by age there. Give the output directory to
      pivotkit alone.
- **Count and size.** The limits are `output.maxFiles` files (1000 by default) or `output.maxMb`
  megabytes (1024 by default) of pivotkit's. When the directory holds that much, a new report
  deletes the oldest reports, whoever asked for them. This rule does not delete drafts. Drafts may
  take at most half of `output.maxFiles`, and the server refuses a draft over that.
- **You**, on a schedule of your own.

A schedule draft waits for approval while its file's `status` is `"draft"`, as `draft_schedule`
writes it. A draft the server cannot read, or one over 1 MiB, counts as waiting too. No rule of the
server deletes a waiting draft. A host that approves or rejects a draft should change its `status`.
The draft then goes by age like a report. Drafts carry a view and recipients by name. Remove the
drafts nobody approved, on a schedule of your own.

A link that expires does not remove its file. You cannot search reports per person. To remove a
person's reports, you delete files.

Who can read the output directory:

- The directory the server creates is mode 0700: only the server's user can read it. With
  `output.baseUrl` it is 0755 (less the umask), so your web server can read it. A directory that
  exists keeps its mode.
- The server writes reports with mode 0644 (less the umask). Other local users can read them wherever
  the directory lets them in, so restrict the directory where that matters.
- The markers of used one-time links in `.pivotkit-downloads/` hold a link's random nonce and its
  expiry, no personal data.

A web server that serves the directory (`output.baseUrl`) makes every file reachable by its name for
as long as the file is there, with no expiry and no sign-in. pivotkit gives such an address only to
reports over open sources, but the web server serves whatever is in the directory. The server's own
[download links](reference/delivery.md) expire (60 minutes by default).

Some reports are over closed sources or over data that belongs to one person:

- data sent in the request
- a source bound to the person
- a code source with `perPerson`

These reports never get an `output.baseUrl` address. They get one of these:

- a link bound to the person who asked
- a one-time link, where you chose `bind: "once"`
- no link

pivotkit cannot see whether a code source answers differently per caller. If yours does, set
`perPerson: true`. Otherwise reports over it get plain links and, with `output.baseUrl`, a permanent
address.

A link is in the browser's history and a proxy's log until it expires. Two sign-in links of one
person cannot be tied to each other: each holds the person only as a digest with its own random
part.

## The AI client { #ai-client }

An MCP client sends what the model sees (descriptions, findings, inline results) to the model's
provider. What the policy shows a model is what that provider receives.
[What reaches an AI model](model-data.md) shows it per level and per client. See also
[Security: the MCP server](security.md#mcp).

The policy limits what pivotkit hands the model. It does not limit what the client reaches by other
means:

- **Over stdio**, a result names the report file by its absolute path. A client with file or shell
  tools, such as Claude Code or VS Code, can read that file and the source files. The model then
  reads values the policy keeps back, and its provider receives them. Over stdio, the policy is no
  access control against such a client. Run the server as another user or on another machine, and
  connect over HTTP, where a result names no path.
- **A sign-in link or a one-time link** (`bind: "once"`) is in the result the model reads. A client
  with a browser tool in the person's signed-in session can open it.

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
