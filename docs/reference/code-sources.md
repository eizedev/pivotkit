---
title: Code sources
description: Code sources of pivotkit-server and pivotkit-mcp - a library host gives a source a load function instead of a file - its options, what load gets and returns, errors, kept data, coalescing and last good data, and where it runs.
---

# Code sources

This page is for developers who embed pivotkit-server or pivotkit-mcp as a library. The other kinds
of source are in [Data sources](sources.md).

## A function instead of a file { #code }

A host that embeds pivotkit-server or pivotkit-mcp as a library can give a source a function instead
of a file. A configuration file cannot hold a function, so code sources exist only in options that
code passes to `createContext`, `createMcpContext` or `listen`.

```js
import { createContext, SourceError } from "pivotkit-server";

const context = await createContext({
  sources: {
    tickets: {
      title: "Open tickets",
      load: async (params, { caller, signal }) => {
        const res = await fetch(`https://tickets.example.com/api/teams/${encodeURIComponent(params.team)}`, {
          signal,
          headers: { "x-on-behalf-of": caller.subject ?? caller.client }
        });
        if (res.status === 403) throw new SourceError("NOT_ALLOWED", { publicMessage: "You may not see this team's tickets." });
        if (res.status === 404) throw new SourceError("DATA_NOT_AVAILABLE", { publicMessage: "There is no such team." });
        if (!res.ok) throw new SourceError("SOURCE_UNAVAILABLE", { status: res.status });
        const body = await res.json();
        return { rows: body.items, asOf: body.generatedAt };
      },
      params: { team: { type: "string", required: true, enum: ["blue", "red"], description: "The team" } },
      timeMs: 20000,
      ttl: 120,
      maxStale: 3600,
      policy: { default: "summary", fields: { Team: "show", Status: "values" } }
    },
    rates: {
      // the same data for everyone: one copy, and load gets no caller
      load: async (_params, { caller, signal }) => {
        const res = await fetch("https://rates.example.com/today.json", { signal });
        return { rows: caller === null ? await res.json() : [], asOf: new Date() };
      },
      cacheShared: true,
      ttl: 600
    }
  }
});
```

The example compiles with strict TypeScript. pivotkit-server's types give `load` a `caller` of type
`SourceCaller`, or `null` with `cacheShared: true`. They export `SourceCaller`, `SourceLoad`,
`SharedSourceLoad`, `SourceVersion`, `LoadResult` and `SourceParams` for your own functions.

## Options { #code-options }

| Key | Default | Meaning |
| --- | --- | --- |
| `sources.<id>.load` | - | `load(params, { caller, signal })`: the data (see below) |
| `sources.<id>.version` | none | `version(params, { caller })`: a value (not a promise) that changes when the data changes; kept data is reused while it is the same. It is called at once on every call, never awaited, so keep it cheap |
| `sources.<id>.params` | none | The values a caller passes with the source ([parameters](mcp.md#configuration)); a parameter with `claim` is filled from the signed-in person's token instead ([claims](sources.md#http-claims)) |
| `sources.<id>.linkParams` | none | The parameters a link from `create_link` may carry, in the page's query string ([link parameters](../concepts/sharing.md#link-params)) |
| `sources.<id>.timeMs` | 30000 ms | The longest `load` may take, at most 600000 (ten minutes); the signal is aborted then |
| `sources.<id>.ttl` | none (only `version` decides) | Seconds a load is reused; `0` only shares loads that run at the same time |
| `sources.<id>.maxStale` | 3600 s | How old the last good data may be to stand in after a transient failure; `0` turns it off |
| `sources.<id>.cacheShared` | `false` | The data is the same for every caller: one copy for all, and `load` gets `caller: null`. Without params, the source list gives its row count and data date ([source list](rest.md#source-list)) |
| `sourceCache.maxMb` | 256 | Top level: the loaded data of code and HTTP sources the process keeps, in MiB (1 to 65536); see [bounds](#code-cache) |
| `sources.<id>.perPerson` | `false` | The data differs per caller (each person sees their own): its reports count as closed for [download links](delivery.md), so only the person who asked can open them (a sign-in link) or no link is given. Not with `cacheShared` |

`checkConfig` lists each code source with its time limit, how its data is kept, and whether last
good data may stand in. It first checks the options as `createContext` does, so it throws the same
`ConfigError` for options the server would refuse:

```js
import { checkConfig } from "pivotkit-server";

const { text, problems } = await checkConfig(options, { name: "my-app" });  // name: the first line's
console.log(text);                                                           // (default "pivotkit-mcp")
```

## What load gets and returns { #code-load }

- `params`: the caller's values, which pivotkit checks and writes again. It is `{}` when the source
  declares none. A source without `params` refuses any.
- `caller`: a frozen copy of who calls, without any token. It has these keys:
    - `client`: a token's name or an OAuth client id
    - `profile`
    - `scopes`: a list, or `null` for every scope
    - `groups`
    - `claims`: only those the configuration names
    - `subject` and `issuer` with OAuth, else `null`

    With `cacheShared: true`, `caller` is `null`. A source that reads it there fails at once instead
    of serving one person's rows to everyone.

- `signal`: an `AbortSignal`. pivotkit aborts it after `timeMs` (with a `TimeoutError`). It also
  aborts it when every caller waiting for this load went away: a REST request or an MCP call over
  HTTP whose connection closed. Pass it to `fetch` and your database client.

    - A load that ignores it runs on in the background and keeps its slot (see the load limits)
      until it ends. After twice `timeMs`, the log warns once.
    - A load that never ends holds its slot until the process restarts.

`load` returns one of these:

- rows (`[{ ... }]`)
- `{ rows, asOf }`
- columnar data `{ columns, types?, data, asOf? }`, with one array per column

It does not return `encode()`'s result, so pivotkit can drop hidden fields. `asOf` becomes the
results' `dataAsOf`. It is a `Date`, an ISO 8601 text or epoch milliseconds. Without it, `dataAsOf`
is the time `load` gave the data. A `load()` that takes no arguments works as it is.

The data has the limits a file has: `limits.rows`, `limits.columns` and `limits.importCells`. Over
them, the answer is `LIMIT_EXCEEDED`. pivotkit cuts texts longer than `limits.textLength`, on a
copy.

## Errors { #code-errors }

Throw a `SourceError` to say what went wrong in words a caller may read:

| `SourceError` code | The caller gets | Last good data |
| --- | --- | --- |
| `NOT_ALLOWED` | 403 with your `publicMessage` | dropped |
| `INVALID_INPUT` | 400 with your `publicMessage` | dropped |
| `DATA_NOT_AVAILABLE` | 404 with your `publicMessage` | dropped |
| `SOURCE_UNAVAILABLE` | 502 with pivotkit's fixed text, `retryable` as `transient` | used when `transient` |

`new SourceError(code, { publicMessage, transient, status, retryAfter, reason })`:

- `publicMessage` is the only text of yours that reaches a caller. pivotkit removes control
  characters and keeps at most 300 characters. A 502 always says one of pivotkit's fixed texts.
  Without `publicMessage`, the caller gets the code's own words.

These options apply to `SOURCE_UNAVAILABLE` only:

- `transient: true` says the failure may pass.
- `status` is a backend's HTTP status, also for the log. A status of 429, 502, 503 or 504 makes the
  failure transient unless `transient` says otherwise.
- `retryAfter`, in whole seconds, becomes the answer's `Retry-After`.
- `reason` picks pivotkit's text:
    - `"refused"`: "the source's backend refused this server's access; ask the operator ..."
    - `"setup"`: "the source is not set up correctly; ask the operator ..."
    - none: "the source is not available right now; ..."

A refusal (`NOT_ALLOWED`, `INVALID_INPUT`, `DATA_NOT_AVAILABLE`) is never transient.

Anything else `load` throws answers `SOURCE_UNAVAILABLE` with `retryable: false` and the fixed text.
That includes an `OperationError` of pivotkit's own codes. pivotkit logs the error's class, and its
message only with `log: "debug"`.

A network error that may pass answers `SOURCE_UNAVAILABLE` with `retryable: true`. These are
`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, and undici's socket and timeout
errors, also as the `cause` of `fetch`'s error.

Two more cases answer `SOURCE_UNAVAILABLE`: an error your code throws while pivotkit reads the
returned rows (a getter), and a `version` that returns a promise.

pivotkit reads your rows once into plain values. Getters and `toJSON` run then. Objects in cells
become JSON text, and every text is cut at `limits.textLength`.

## Kept data, coalescing and last good data { #code-cache }

- **Per caller.** pivotkit keeps loaded data per caller. The key is made of:
    - the person: with OAuth `subject` and `issuer`, a static token's name, or `local`
    - the client, its scopes, the groups and the claims
    - the values of `params`
    - the caller's policy levels

    A caller without an identity, an OAuth token without a usable subject, gets nothing kept,
    shares no load and gets no last good data. With `cacheShared: true`, all callers share one copy
    per set of values and policy levels. The key holds the values, groups and claims only as a
    keyed digest (random per process), not in clear text.

- **Reuse.** pivotkit reuses kept data while `version` gives the same value, and within `ttl` when
  both are set. Without `version`, it reuses data for `ttl` seconds. Without either, every call
  loads. `ttl` counts from when the load ended.
- **Coalescing.** Calls that need the same data while it loads wait for that one load. A caller that
  goes away stops waiting. pivotkit aborts the load only when every caller waiting for it went away.
  That is no failure of the source, and nothing kept is dropped.
- **Load limits.** At most 4 loads of one source run at once, and at most 2 of them for one person.
  Callers without an identity count per client, so one person trying many values cannot take every
  slot. A call over the limit answers `SOURCE_UNAVAILABLE` with `retryable: true` and
  `Retry-After: 1`. A load that ignores the abort keeps its slot until it ends.
- **Time limit.** After `timeMs`, pivotkit aborts the signal. The call answers `SOURCE_UNAVAILABLE`
  (`retryable: true`), or last good data. pivotkit keeps a result that arrives later for the next
  call, unless a refusal for the same data came in between.
- **Last good data.** Only after a transient failure does the data last loaded for the same caller
  and values stand in, and only when it is at most `maxStale` seconds old. Transient failures are
  the time limit, a network error and a `SourceError` with `transient`.

    - The result keeps that data's `dataAsOf` and adds `stale: { since }`, the time its load ended.
    - `render_view`'s message says "The data is from ...: the source could not be refreshed."
    - The log has a warning with the source's id.

    Any other failure answers at once and drops what was kept for that caller and values. So the
    cache never covers a withdrawn access.

- **Bounds.** The process keeps at most 64 loads and `sourceCache.maxMb` of loaded tables (256 MiB
  by default). pivotkit counts each table as it holds it: each distinct text of a column once as
  UTF-8, whole numbers in one, two or four bytes, other numbers, dates and true/false values as
  typed arrays. One person keeps at most 8 loads and a quarter of the bytes. A shared source counts
  as one person. A person's new load pushes out that person's oldest first, so one caller cannot
  push out everyone else's data. Otherwise the least recently used go first. Kept data stays in the
  process's memory until it is pushed out, also after `maxStale` has passed. `check-config` prints
  both limits.
- **Tables up to a quarter of `sourceCache.maxMb`** (64 MiB by default) are kept. pivotkit never
  keeps a larger table. Every call loads it again, reads it and sends it to a worker, as without
  `ttl`. The log warns once an hour per source with the table's size.

    For example, a million rows of eight columns with a distinct text of about 36 characters in
    each row take about 65 MiB, just over the default share. With `"sourceCache": { "maxMb": 512 }`
    (tables up to 128 MiB), pivotkit keeps it, and a later call takes a few milliseconds. Give the
    process the memory for it.

    The process keeps one load cache. With several contexts in one process, the largest
    `sourceCache.maxMb` of those open applies. When a context closes, the cache shrinks to the
    largest left.

## Where it runs { #code-thread }

`load` runs in the host's thread. pivotkit reads its rows there once into a compact table:

- The run limits above apply, and hidden fields are left out.
- The table holds each distinct text of a column once.
- Its texts and codes, numbers, dates and true/false values are in shared memory, so sending it to a
  worker copies no value.

The operation over that table runs in a worker, as for a file or an HTTP source:

- `timeMs` bounds `load`.
- `compute.timeMs` bounds the computation (`TIMEOUT`).
- `compute.memoryMb` bounds its memory (`LIMIT_EXCEEDED`).
- It waits up to `compute.queueMs` for a free worker (`BUSY`).

A load that is kept (`ttl` or `version`) goes to a worker once. Later calls go to that worker without
the table while it keeps it. Each worker keeps the data of its last four runs, at most a quarter of
`compute.memoryMb`.

Reading a million rows of eight columns takes about 0.5 s of the host's thread on a laptop. A call
over kept data takes a few milliseconds, so keep the data a code source returns to what a report
needs.

A code source is your code. pivotkit hands it a frozen copy of the caller and never a token. That
guards against mistakes, not against code that means harm.
