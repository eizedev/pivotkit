---
title: Rows of a source
description: The REST route POST /api/v1/sources/records - the rows of a source for a person who signed in, so a host application's backend can show a live pivotkit report - how to turn it on, who gets rows, which fields leave, its limits, a host backend that fetches the rows, the log and sizing.
---

# Rows of a source

This page is for the people who run pivotkit-server and build a host application on it. The other
routes are in [pivotkit-server (REST)](rest.md#routes).

## What the route gives { #records }

A host application can show a live report over a source that only pivotkit-server can reach. Its
backend fetches the rows for the person who opens the page. The page hands them to the components.
This route is off by default. [Record 0015](../decisions/0015-live-rows-for-a-host-page.md) says
why it works this way.

`POST /sources/records` answers the rows of one source:

```bash
curl -s -H "Authorization: Bearer $PERSON_TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"sales","fields":["Region","Sales"]}' \
  https://reports.example.com/api/v1/sources/records
```

```json
{ "columns": ["Region", "Sales"], "types": ["string", "number"], "rowCount": 2,
  "dataAsOf": "2026-11-18T08:00:00Z", "withheld": ["Customer"], "requestId": "Ab3_xY9-k2Q",
  "data": [["North", "South"], [10, 20]] }
```

- `columns`, `types` and `data` are the columnar shape the components take: one array per column.
  pivotkit-core's `encode` reads it as it is.
- A date is ISO text without an offset, such as `2026-11-18` or `2026-11-18T08:30:00`. It means the
  same day and time in every time zone.
- `rowCount` is every row of the source. The policy's `rows: false` and `counts: false` do not
  hide it here, since `data` holds every row anyway.
- `withheld` names the fields at `values` or `summary` for the caller. They are left out.
- `dataAsOf` and `stale` are as on every other route.

The input:

| Key | Required | What it is |
| --- | --- | --- |
| `source` | yes | A source id whose entry in `GET /sources` has `records: true` |
| `params` | no | The source's parameters, as on the other routes |
| `fields` | no | The fields to answer, in this order. Names match as the policy matches them: case, Unicode form and extra spaces do not count |
| `view` | no | A view, or its JSON text. Only the fields it uses are answered |

Give `fields` or `view`, not both. Without either, every field at `show` is answered.

The server does not apply a view's filters. Filters are no permission. Every row of the source
leaves, also when the view filters most of them out.

## Turn it on { #records-setup }

1. Give a profile the right, as a list of source ids: `"records": ["sales"]`.
2. Set each field that may leave to `show` for that profile.
3. Bind the profile to people, for example with `auth.groupProfiles` or `auth.defaultProfile`.
4. Run `check-config`. It lists per profile the sources and the fields that would leave.

```json
{
  "sources": { "sales": { "file": "data/sales.csv", "policy": { "fields": { "Customer": "hide" } } } },
  "policy": { "profiles": { "staff": { "records": ["sales"], "fields": { "Region": "show", "Sales": "show" } } } },
  "auth": { "mode": "oauth", "issuer": "https://login.example.com", "resource": "https://reports.example.com/mcp",
    "defaultProfile": "staff" }
}
```

There is no switch for every caller or every source. A source added later stays closed until a
profile names it.

## Who gets rows { #records-who }

Only a person gets rows:

- an OAuth token of the configured issuer with a subject (`auth.subjectClaim`)
- a [token from another system](tokens.md#external-issuers) with a subject

Everyone else gets 403 `NOT_ALLOWED`: a static token, a signed token, an OAuth token without a
subject, and every caller of a server without sign-in.

A machine's token with a subject cannot be told apart from a person's. Give no such client a
profile with `records`.

A caller whose profile does not name the source gets 403 `NOT_ALLOWED`. A source that does not
exist answers the same. The `detail` names the caller's profile, or says that the caller has none.

`GET /sources` adds `"records": true` to each source the caller may read the rows of.

MCP has no tool for this route. A model gets results, never rows.

## Which fields leave { #records-fields }

Only fields at `show` for the caller leave.

| The request names | Answer |
| --- | --- |
| nothing | every field at `show`; the others in `withheld` |
| fields at `show` only | those fields |
| a field at `values` or `summary` | 403 `NOT_ALLOWED`. `detail` names the fields, `notShown` lists them for programs |
| a hidden field | 400 `INVALID_INPUT`, as for a field that does not exist. Neither is named |
| a view with errors, or one that uses a hidden field | 400 `INVALID_INPUT`. Check the view with `POST /views/validate` |
| a [named view](sources.md#views) by its name | the fields it uses |
| a named view that uses a field at `values` or `summary` | 403 `NOT_ALLOWED`. `detail` and `notShown` name those fields only |
| a named view that uses a hidden field | 400 `INVALID_INPUT`, as for a name that does not exist |

```json
{ "type": "https://pivotkit.eize.dev/reference/rest/#error-not-allowed", "title": "Not allowed",
  "status": 403, "code": "NOT_ALLOWED", "detail": "Team is not at show for you, so its values cannot leave: leave it out, or ask the operator to show it",
  "requestId": "Ab3_xY9-k2Q", "notShown": ["Team"] }
```

Under a profile with `"default": "show"`, a column the data gains later leaves too. `check-config`
warns about such a profile.

## Limits { #records-limits }

!!! warning "One rows request at a time by default"

    `rest.records.concurrency` is 1 by default, for the whole server. One person's rows request
    holds the route. Every other person waits up to `rest.records.waitMs` (5 s) for it, then gets 503
    `BUSY`. Raise `rest.records.concurrency` and `compute.workers` together when several people open
    live reports at once.

The load stays bounded by the server's other limits: `limits.rows`, `limits.fileBytes`,
`http.maxBytes` and `sourceCache.maxMb`. These keys bound what one answer hands out. The smallest
limit wins.

| Key | Default | What it is |
| --- | --- | --- |
| `policy.profiles.<name>.records` | none | The source ids whose rows the profile may read |
| `rest.records.maxRows` | 50000 | The most rows of one answer (1 to 10,000,000) |
| `rest.records.maxCells` | 1000000 | The most values of one answer: rows times fields (1 to 100,000,000) |
| `rest.records.concurrency` | 1 | Rows requests at once over all callers, one per person (1 to 64). Keep it below `compute.workers` (default 2) |
| `rest.records.waitMs` | 5000 | How long a request waits for a place before 503 `BUSY` (0 to 60000; 0: no wait) |
| `rest.records.idleMs` | 30000 | A reader that reads nothing for this long loses its place (1000 to 600000) |
| `rest.records.writeMs` | 10000, at most `compute.timeMs` | A reader that has not read the whole answer within this time loses its place (1000 to 600000, not above `compute.timeMs`) |
| `sources.<id>.records.maxRows` | `rest.records.maxRows` | A lower row limit for one source. It cannot be higher than the server's |

- Over a row or cell limit, the answer is 413 `LIMIT_EXCEEDED`, for example "this source has too
  many rows to open here (60,000, the limit is 50,000); filter it with a parameter or ask the
  operator". Where the policy hides the row count (`rows: false`), the message leaves the count out.
  It names a parameter only for a source that takes one the caller sends.
- The server checks the fields and the limits before it writes the first byte.
- Beyond `concurrency`, a request waits up to `waitMs` for a place, first come first served. After
  that, and at once for a second request of the same person or beyond 32 waiting requests, the
  answer is 503 `BUSY` with `Retry-After` and `retryable: true`.
- With the default of 1, the route serves one person at a time. A slow reader holds the place for up
  to `writeMs`. A source that loads slowly holds it while it loads, up to its own time limit and
  `compute.timeMs`, and a request that waits longer than `waitMs` gets 503 `BUSY`. The place is
  taken before the load, so at most `concurrency` loads hold data at once. Raise `concurrency` and
  `compute.workers` together for more people at once.
- `writeMs` cuts an honest reader on a slow link too. The default answer of 50,000 rows is about
  4 MiB ([sizing](#records-sizing)), which needs about 3.5 Mbit/s within 10 s.
- `auth.toolScopes` cannot name this route, since it is no operation. `rest.requiredScopes` and the
  source's `scopes` apply.
- The places for [large bodies](rest.md#data) are not used here.
- One request holds a [compute worker](mcp.md#configuration) while its answer is written. Keep
  `concurrency` below `compute.workers`, so reports still find a worker. `check-config` warns
  otherwise.
- After its wait for a place, the whole request, reading and writing, must end within
  `compute.timeMs`, and the writing within `writeMs`. A slow reader's answer is cut off then, and the connection ends without the closing
  bracket.
- The answer has no `Content-Length`. Read it to its end, then parse it.

## A host backend fetches the rows { #records-host }

A page shows a live report over a source that only pivotkit-server can reach, such as an HTTP source
with a token exchange. The page's own backend fetches the rows for the person who opens it. The
page hands them to the report.

The operator sets up pivotkit-server once:

1. A profile names the source in `records`. The fields that may leave are `show` for it.
2. The profile is bound to the people, for example with `auth.defaultProfile` or
   `auth.groupProfiles`.
3. With OAuth, the backend sends the person's access token from your application's own sign-in.
   pivotkit-server must be an intended audience of it: list your application's audience in
   `rest.audience`, beside the REST resource. The token needs the scopes of `rest.requiredScopes`
   and of the source (`sources.<id>.scopes`).
4. Or your application signs a token for the person ([tokens from another
   system](tokens.md#external-issuers)). Such a token cannot read a source with a token
   exchange.

```json
{
  "rest": { "audience": ["https://reports.example.com/api/v1", "host-app"], "requiredScopes": ["pivotkit"] },
  "policy": { "profiles": { "staff": { "records": ["vms"], "default": "hide", "fields": { "Name": "show", "Cpu": "show" } } } },
  "auth": { "mode": "oauth", "issuer": "https://login.example.com", "resource": "https://reports.example.com/mcp", "defaultProfile": "staff" }
}
```

The backend forwards the answer as text, and the page encodes it:

```js
// the host application's backend, for the signed-in person
const answer = await fetch("https://reports.example.com/api/v1/sources/records", {
    method: "POST",
    headers: { authorization: `Bearer ${personAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ source: "vms", params: { customer: "acme" } })
});
if (!answer.ok) throw new Error((await answer.json()).detail);
// pass the text on as it is: no objects of your own in between
response.setHeader("content-type", "application/json");
response.setHeader("cache-control", "no-store");
response.end(await answer.text());
```

```js
// the page: the columnar answer is what <pivot-report> takes as data
const { columns, types, data } = await (await fetch("/my-app/report-rows")).json();
document.querySelector("pivot-report").data = { columns, types, data };
```

- On an error, the problem's `code` says what to do: 503 `BUSY` means try again after
  `Retry-After` seconds; `notShown` names the fields to leave out.
- An answer that does not parse was cut off (an idle or slow reader, `compute.timeMs`). Ask again.
- A backend short of memory can pipe `answer.body` to its own answer instead of reading the text.
- The answer is the person's rows. Keep `Cache-Control: no-store` on your own answer.
- The page holds every row. The browser is not access control: send only what the person may see.
- The rows' memory: [sizing](#records-sizing).

## What the log says { #records-log }

Every answer that started ends with a `records` line: the source, the rows and columns, the profile,
`client` and `ms`, how long the answer took to read. With `audit.subject` it names the person too.
It never holds a value. An answer cut off has `outcome: "error"` and `reason`: `idle`, `slow` (not
read within `writeMs`), `client` (the reader left), `timeout` or `error`.

## Sizing { #records-sizing }

By default the route serves one request at a time, server-wide: `rest.records.concurrency` is 1
([limits](#records-limits)). Size for the number of people who open live reports at the same moment.

An answer holds every row of the source. Three places hold it.

- **The browser.** The components encode the rows and compute every view there. The
  [browser benchmark](../concepts/limits.md#measured-in-the-browser) measured about 10 MB for the
  data and 13 MB for the report at 100,000 rows of 9 columns. A rows answer of 50,000 rows takes
  about half of that, as an estimate: it was not measured with the rows route.
- **The host application's server.** It receives the whole answer, then passes it to the page as
  text. Pass it on as text, never as objects of your own: objects of its own language take more
  memory than the text. The answer's size is in the table below.
- **pivotkit-server.** It reads the source as for a report and keeps it in a worker. It writes the
  answer in pieces of about 256 KiB, one piece per read. The main thread holds at most one piece of
  an answer.

Measured in pivotkit-server with `npm run bench:records -w pivotkit-server`. Node 26 on an Apple M4
with 10 cores. A CSV source of 8 columns, the REST handler in one process without sockets, each
answer read to its end. Cold: a fresh server reads the file. Warm: the worker kept the data. RSS
counts the main thread and the workers. The render is a pivot of the same source as csv, through
the [file route](rest.md#downloads).

| Rows | Answer | CPU rows, cold / warm | CPU render, cold / warm | RSS rows, cold / warm | RSS render, cold / warm | Main heap rows, warm |
| --- | --- | --- | --- | --- | --- | --- |
| 10,000 | 0.8 MiB | 197 ms / 18 ms | 205 ms / 7 ms | 43 MiB / 11 MiB | 45 MiB / 0 MiB | 0 MiB |
| 50,000 | 4.2 MiB | 427 ms / 61 ms | 403 ms / 7 ms | 101 MiB / 9 MiB | 98 MiB / 1 MiB | 0 MiB |
| 100,000 | 8.3 MiB | 694 ms / 118 ms | 617 ms / 25 ms | 134 MiB / 5 MiB | 142 MiB / 2 MiB | 0 MiB |

- 50,000 rows is the default row limit. The 100,000 row run raised `rest.records.maxRows`.
- Reading the source costs most. Once the worker keeps the data, a rows request costs more CPU in
  pivotkit-server than a render of the same source. The pivoting then happens in the browser.
- The main thread's heap does not grow with the answer.
- These are numbers of one machine and one run. Measure your own data before you raise a limit.
