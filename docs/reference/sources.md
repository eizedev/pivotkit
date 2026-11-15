---
title: Data sources
description: The kinds of data source pivotkit-server and pivotkit-mcp read - files, and code sources of a library host with parameters, the caller, a time limit, coalescing, kept data and last good data.
---

# Data sources

A source is what a caller names with `source`: an id the operator configured under `sources`, or a
`file:` path inside `files.allowDirs`. A configured source is one of these kinds:

| Kind | Configured with | Where it is read |
| --- | --- | --- |
| File | `file`: a CSV, TSV, TXT, JSON or XLSX file | In a worker thread, with the file limits ([options](mcp.md#configuration)) |
| Code | `load`: a function of a library host | In the host's thread; see [Code sources](#code) |

Every kind has the same exposure policy, scopes, field descriptions and `dataAsOf` in its results
([pivotkit-mcp](mcp.md), [REST](rest.md)).

## Code sources { #code }

A host that embeds pivotkit-server or pivotkit-mcp as a library can give a source a function instead
of a file. A configuration file cannot hold a function, so code sources exist only in options passed
in code (`createContext`, `createMcpContext`, `listen`).

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
    }
  }
});
```

### Options { #code-options }

| Key | Default | Meaning |
| --- | --- | --- |
| `sources.<id>.load` | - | `load(params, { caller, signal })`: the data (see below) |
| `sources.<id>.version` | none | `version(params, { caller })`: a value that changes when the data changes; kept data is reused while it is the same |
| `sources.<id>.params` | none | The values a caller passes with the source ([parameters](mcp.md#configuration)) |
| `sources.<id>.timeMs` | 30000 ms | The longest `load` may take, at most 600000 (ten minutes); the signal is aborted then |
| `sources.<id>.ttl` | none (only `version` decides) | Seconds a load is reused; `0` only shares loads that run at the same time |
| `sources.<id>.maxStale` | 3600 s | How old the last good data may be to stand in after a transient failure; `0` turns it off |
| `sources.<id>.cacheShared` | `false` | The data is the same for every caller: one copy for all, and `load` gets `caller: null` |

`check-config` lists each code source when it is given the options (`checkConfig(options)`): its time
limit, how its data is kept, and whether last good data may stand in.

### What load gets and returns { #code-load }

- `params`: the caller's values, checked and written again by pivotkit (`{}` when the source
  declares none). A source without `params` refuses any.
- `caller`: a frozen copy of who calls, without any token: `client` (a token's name or an OAuth
  client id), `profile`, `scopes` (a list, or `null` for every scope), `groups`, `claims` (only those
  the configuration names), and with OAuth `subject` and `issuer` (else `null`). With
  `cacheShared: true` it is `null`, so a source that reads it there fails at once instead of
  serving one person's rows to everyone.
- `signal`: an `AbortSignal` that is aborted after `timeMs` (with a `TimeoutError`). Pass it to
  `fetch` and your database client; a load that ignores it runs on in the background.

`load` returns rows (`[{ ... }]`), `{ rows, asOf }`, or columnar data `{ columns, types?, data, asOf? }`
with one array per column; not `encode()`'s result, so hidden fields can be dropped. `asOf` (a `Date`,
an ISO 8601 text or epoch milliseconds) becomes the results' `dataAsOf`; without it, the time `load`
gave the data. A `load()` that takes no arguments works as it is.

The data has the limits a file has: `limits.rows`, `limits.columns` and `limits.importCells`
(`LIMIT_EXCEEDED` over them), and texts longer than `limits.textLength` are cut, on a copy.

### Errors { #code-errors }

Throw a `SourceError` to say what went wrong in words a caller may read:

| `SourceError` code | The caller gets | Last good data |
| --- | --- | --- |
| `NOT_ALLOWED` | 403 with your `publicMessage` | dropped |
| `INVALID_INPUT` | 400 with your `publicMessage` | dropped |
| `DATA_NOT_AVAILABLE` | 404 with your `publicMessage` | dropped |
| `SOURCE_UNAVAILABLE` | 502 with pivotkit's fixed text, `retryable` as `transient` | used when `transient` |

`new SourceError(code, { publicMessage, transient, status })`: `publicMessage` is the only text of
yours that reaches a caller (cleaned of control characters, at most 300 characters; a 502 always
says pivotkit's fixed text); `transient: true` says the failure may pass; `status` is a backend's
HTTP status for the log, and 429, 502, 503 or 504 make the error transient unless `transient` says
otherwise. Without `publicMessage`, the code's own words are used.

Anything else `load` throws, an `OperationError` of pivotkit's own codes too, answers
`SOURCE_UNAVAILABLE` with `retryable: false` and the fixed text; its class is logged, its message
only with `log: "debug"`. A network error that may pass (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`,
`ENOTFOUND`, `EAI_AGAIN`, `EPIPE`, undici's socket and timeout errors, also as the `cause` of
`fetch`'s error) answers `SOURCE_UNAVAILABLE` with `retryable: true`.

### Kept data, coalescing and last good data { #code-cache }

- **Per caller.** Loaded data is kept per caller: the person (with OAuth `subject` and `issuer`, a
  static token's name, or `local`), with the client, its scopes, the groups and the claims, the
  values of `params` and the caller's policy levels. A caller without an identity (an OAuth token
  without a usable subject) gets nothing kept, shares no load and gets no last good data. With
  `cacheShared: true` all callers share one copy per set of values and policy levels.
- **Reuse.** Kept data is reused while `version` gives the same value (and within `ttl` when both
  are set), or for `ttl` seconds without `version`. Without either, every call loads.
- **Coalescing.** Calls that need the same data while it loads wait for that one load.
- **Load limits.** At most 4 loads of one source run at once, and at most 2 of them for one person
  (callers without an identity count per client), so one person trying many values cannot take every
  slot. A call over the limit answers `SOURCE_UNAVAILABLE` with `retryable: true` and
  `Retry-After: 1`. A load that ignores the abort keeps its slot until it ends.
- **Time limit.** After `timeMs` the signal is aborted and the call answers `SOURCE_UNAVAILABLE`
  (`retryable: true`), or last good data. A result that arrives later is kept for the next call,
  unless a refusal for the same data came in between.
- **Last good data.** After a transient failure only (the time limit, a network error, a
  `SourceError` with `transient`), the data last loaded for the same caller and values stands in
  when it is at most `maxStale` seconds old. The result keeps that data's `dataAsOf` and adds
  `stale: { since }` (when it was loaded); `render_view`'s message says "The data is from ...: the
  source could not be refreshed.", and the log has a warning with the source's id. Any other failure
  answers at once and drops what was kept for that caller and values, so a withdrawn access is never
  covered by the cache.
- **Bounds.** The process keeps at most 64 loads, 256 MiB of encoded data, and 8 loads per caller;
  the least recently used go first.

### Where it runs { #code-thread }

`load` and the operation over its data run in the host's thread, not in a worker. `timeMs` bounds
`load`; the computation after it is not bounded by `compute.timeMs`, so keep the data a code source
returns to what a report needs.

A code source is your code: pivotkit hands it a frozen copy of the caller and never a token, which
guards against mistakes, not against code that means harm.
