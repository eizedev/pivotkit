---
title: JavaScript exports of the services
description: Every name that pivotkit-server, pivotkit-server/rest, pivotkit-server/policy, pivotkit-mcp and pivotkit-mcp/policy export, with what each is and where its details are, and the REST service in a server of your own.
---

# JavaScript exports of the services

pivotkit-server and pivotkit-mcp are command line programs and libraries. This page lists every
name their entry points export. Each name is public interface, as [versioning](../versioning.md)
says. The details are on the pages each line links to.

Build your own server with them as [In your own server](#embed) below shows.

## `pivotkit-server` { #server }

The options, the context, the errors, and the helpers for requests.

### Start and run

| Name | What it is |
| --- | --- |
| `createContext` | Checks the options and starts the workers. [Details](#embed) |
| `present` | Runs an operation for a caller and gives what the caller may see. |
| `callerOf` | The caller of a request, from its sign-in. |
| `serve` | Serves REST and MCP over HTTP from options, as `pivotkit-server serve` does. |
| `createServerHandler` | The fetch handler of REST and, when installed, MCP over one context. |
| `serveFetch` | Serves a fetch handler on `node:http`. It caps the body and stops gracefully. [Details](#embed) |
| `loadConfig` | Reads a configuration file. |
| `validateOptions` | Checks options and throws a `ConfigError` for a mistake. |
| `checkConfig` | The report that `check-config` prints. [Details](sources.md#check-source) |

### Errors

| Name | What it is |
| --- | --- |
| `ConfigError` | The error of a wrong option or configuration file. |
| `OperationError` | The error of an operation, with a code such as `INVALID_INPUT`. [Codes](rest.md#errors) |
| `SourceError` | The error a code source throws to answer with a code. [Details](code-sources.md#code) |
| `SOURCE_ERROR_CODES` | The codes a `SourceError` may carry. |
| `SecretError` | The error when pivotkit cannot read a secret. Its code is `SECRET`. |

### Options and defaults

| Name | What it is |
| --- | --- |
| `readSecret` | Reads a secret reference on every use. [Details](#embed) |
| `SECRET_REF` | The option schema of a secret reference, `{ "env": "NAME" }` or `{ "file": "path" }`, for options of your own. |
| `OPTION_KEYS` | Every option key, nested as the options object is. |
| `CODE_DEFAULTS` | The defaults of a code source: `timeMs`, `ttl`, `maxStale` and `cacheShared`. |
| `SERVER_LIMITS` | The import limits a server uses unless you set them: `fileBytes` and `unpackedBytes`. |
| `COMPUTE_DEFAULTS` | The defaults of the compute workers: `workers`, `timeMs`, `memoryMb` and `queueMs`. |
| `DEFAULT_ALGORITHMS` | The JWT signature algorithms accepted by default. |
| `POLICY_LEVELS` | The exposure levels: `show`, `values`, `summary` and `hide`. |
| `POLICY_DEFAULTS` | The policy a source has unless you set one. |
| `DEFAULT_PORT` | The port `serve` listens on by default: 3333. |
| `VERSION` | The package's version. |

### Requests

| Name | What it is |
| --- | --- |
| `BODY_BYTES` | The largest body of a caller who is not signed in: 2 MiB. |
| `MAX_BODY_BYTES` | The largest body a cap function may give a signed-in caller: 64 MiB. |
| `bodyBytesOf` | The server's own body cap for its options. |
| `bodyCapOf` | The body cap of one request from a number, or from a cap function. |
| `peekSignIn` | The sign-in the precheck kept for a request, inside a cap function. |
| `groupRefusal` | The text of the 403 for a token whose groups are unknown, or null. |
| `offeredScopes` | The OAuth scopes the server offers on `"mcp"` or `"rest"`, or null. |
| `withRequestId` | Runs a function with a request id. |
| `requestId` | The id of the request in progress. |
| `requestScopeFor` | The request id, the trace id, and the client address of a request. |
| `errorDetails` | The details of an `OperationError`, with the request id. |
| `callerFields` | What a log line may hold of a caller. |

## `pivotkit-server/rest` { #rest }

The REST service. [The service](rest.md) has its routes and answers.

| Name | What it is |
| --- | --- |
| `createRestHandler` | The fetch handler of the REST service over a context. [Details](#embed) |
| `openApiDocument` | The OpenAPI 3.1 document of a context. [Details](rest.md#openapi) |
| `REST_ROUTES` | The routes, each with its method, path, and operation. |
| `REST_BASE` | The path the routes are under: `/api/v1`. |
| `REST_BODY_BYTES` | The largest request body by default: 2 MiB. |
| `REST_ERRORS` | The codes the REST layer adds, with their HTTP status. [Codes](rest.md#errors) |
| `PROBLEM_CODES` | Every code a problem answer can carry. |
| `REST_LIMITS` | The default request limits: `perMinute`, `burst`, `failedAuthPerMinute`, `concurrency` and `clientShare`. [Limits](rest.md#limits) |

## `pivotkit-server/policy` { #policy }

The exposure policy, for another front end over the same sources.

| Name | What it is |
| --- | --- |
| `resolvePolicy` | The policy of a source for a profile, from the server's and the source's options. |
| `withStats` | A policy with the data's statistics, for the automatic `values` rule. |
| `levelOf` | The level of a field. |
| `levelInfo` | The level of a field and why it has it. |
| `autoLevel` | The level the automatic rule gives a field. |
| `deniedWord` | The word of the deny list in a field's name, or null. |
| `listsAll` | Whether `describe_source` lists every value of a field. |
| `stricter` | The stricter of two levels. |
| `exposeSource` | A source's description, cut to what the policy shows. |
| `exposeFindings` | A view's findings, cut to what the policy shows. |
| `touchesClosed` | Whether a view uses a field that is not at `show`. |
| `POLICY_LEVELS` | The exposure levels, as in `pivotkit-server`. |
| `POLICY_DEFAULTS` | The default policy, as in `pivotkit-server`. |
| `AUTO_VALUES` | The thresholds of the automatic `values` rule and its deny list. |

## `pivotkit-mcp` { #mcp }

The MCP server. [pivotkit-mcp](mcp.md) has its tools.

| Name | What it is |
| --- | --- |
| `createMcpContext` | Checks the options and starts the MCP server's context. [Details](mcp.md) |
| `createHttpHandler` | The fetch handler of MCP over HTTP. |
| `listen` | Starts MCP over HTTP from options. |
| `run` | Runs the command line `pivotkit-mcp` with its arguments. |
| `callerOf` | The caller of a request, as in `pivotkit-server`. |
| `INSTRUCTIONS` | What a model reads when it connects. |
| `instructionsOf` | The instructions with the lines for the inputs the server offers. |
| `SKILLS_DIR` | The folder of [the skill](mcp.md#skill) in the package. |
| `VERSION` | The package's version. |
| `ConfigError`, `loadConfig`, `validateOptions` | As in `pivotkit-server`. |
| `OPTION_KEYS`, `SERVER_LIMITS`, `COMPUTE_DEFAULTS`, `DEFAULT_ALGORITHMS` | As in `pivotkit-server`. |
| `POLICY_LEVELS`, `POLICY_DEFAULTS` | As in `pivotkit-server`. |

`pivotkit-mcp/policy` is `pivotkit-server/policy` under another name.

## Not public

`pivotkit-server/internal` holds what pivotkit-mcp shares with pivotkit-server. It is no public
interface, and any release may change it. Install pivotkit-server and pivotkit-mcp of one release,
as [upgrading](../getting-started/upgrading.md#update) says.

## In your own server { #embed }

`pivotkit-server` is a library too. `createContext(options)` checks the options and starts the
workers. `createRestHandler(context)` from `pivotkit-server/rest` returns a fetch handler (a
`Request` in, a `Response` out) for any server that speaks them:

```js
import { createContext, serveFetch } from "pivotkit-server";
import { createRestHandler } from "pivotkit-server/rest";

// your data, and a value that changes when the data does
let rows = [{ Region: "North", Revenue: 120 }, { Region: "South", Revenue: 80 }];
let rowsVersion = 1;

const context = await createContext({
    sources: { sales: { load: async () => rows, version: () => rowsVersion, cacheShared: true, policy: { fields: { Region: "show" } } } },
    output: { dir: "/srv/reports" },
    auth: { mode: "token" } // the token is $PIVOTKIT_TOKEN, or list several in auth.tokens
});
const rest = await createRestHandler(context, { env: process.env, loopback: true });

// on node:http with the checks of this page (body cap, slow clients, a graceful stop):
const server = await serveFetch(rest, { host: "127.0.0.1", port: 3333, bodyBytes: 2_097_152 });
// or in a framework: return rest.fetch(request, { address });
```

Create `/srv/reports` first, or point `output.dir` at a directory you own. Run it with a token of at
least 32 characters in `PIVOTKIT_TOKEN`:

```bash
PIVOTKIT_TOKEN="$(npx -y pivotkit-server token new)" node server.js
```

Without a token, `createRestHandler` throws a `ConfigError` that says how to make one.

- `bodyBytes` is a number, or `(request, info) => number`. A function is called once per request,
  after the precheck. There `peekSignIn(info)` gives the sign-in the precheck kept (`{ caller }`, or
  undefined). A function gives a caller who is not signed in at most `BODY_BYTES` (2 MiB) and a
  signed-in one at most `MAX_BODY_BYTES` (64 MiB). `bodyBytesOf(options)` is the server's own:
  `rest.data.maxBytes` for a REST caller that may [send data](rest.md#data), else 2 MiB.
- Each request runs inside `withRequestId(id, fn)`. `requestId()` gives its id anywhere in its work,
  a code source's `load` included, for the host's own log lines. Every log line written inside it
  names the id. `errorDetails({ retryable, retryAfter })` builds an `OperationError`'s details with
  that id. `callerFields(caller)` is what a log line may hold of a caller: the client, and `subject`
  where `audit.subject` named the person when the token was verified.
- The handlers (`createRestHandler`, `createServerHandler`, pivotkit-mcp's `createHttpHandler`) run
  each request in its scope and set `X-Request-Id` on every answer. The scope comes from
  `requestScopeFor(request, info, { trustProxy })`: its id, the trace id of a valid `traceparent`, a
  checked `X-Request-Id`, `info.address` and, with `http.trustProxy`, the forwarded client as
  `address`. `serveFetch` does the same for any handler (pass its `trustProxy`). The context's runtime
  takes `service` (`{ name, version }`, the program on every line) and `env` (where `NO_COLOR` is
  read).
- With `auth.groupProfiles`, answer a verified token whose groups are unknown before you make its
  caller. `groupRefusal(options.auth, authInfo)` gives the text of the 403, or null. `callerOf`
  throws `NOT_ALLOWED` for such a token, so it never gets the sources' own policy.
- A secret in your options is a reference, `{ "env": "NAME" }` or `{ "file": "path" }`
  (`SECRET_REF`). `readSecret(ref, options, env)` reads it on every use, so a rotated file works
  without a restart. It trims one trailing newline and refuses a value with another line break or a
  NUL. Its error names the reference, never the value.

A configured source may be an operator's backend, an [HTTP source](sources.md#http)
(`sources.<id>.http`, with typed `params`), or, for a library host, a function instead of a file, a
[code source](code-sources.md#code):

- `load(params, { caller, signal })` returns an array of row objects, `{ rows, asOf }`, or columnar
  data `{ columns, types, data }` with one array per column. It does not return `encode()`'s result,
  so hidden fields can be dropped.
- `load` runs in the host's thread. Its `signal` is aborted after `timeMs` (30 s by default).
- The report over its data is computed in a worker under `compute.timeMs` and `compute.memoryMb`
  ([where it runs](code-sources.md#code-thread)).
- pivotkit keeps one copy of the data for each combination of caller, parameter values and policy
  levels. The caller counts with its client, scopes, groups and claims.
    - With `cacheShared: true`, one copy serves all callers.
    - A caller without an identity (an OAuth token without a usable subject) gets nothing kept.
    - A kept copy is reused while `version(params, { caller })` gives the same value, or for `ttl`
      seconds.
- Parallel calls share one load.
- After a transient failure, the last good data stands in for up to `maxStale` seconds, with `stale`
  in the result.
- A `SourceError` answers its code with its `publicMessage`. Anything else `load` throws answers 502
  `SOURCE_UNAVAILABLE` with a fixed text. Its class goes into the log, its message with
  `log: "debug"`.

More about the handler:

- The one static token without `auth.tokens` is `$PIVOTKIT_TOKEN`. Set while auth is `none`, it gets
  a warning at start and in `check-config`, over HTTP only: "PIVOTKIT_TOKEN is set but auth is none;
  use --auth token (or auth.mode token)". A written `auth.mode: "none"` gives no warning.
  `createContext(options, { tokenEnv })` names another. Tokens are read from `env` of
  `createRestHandler`.
- `createContext(options, { env })` is where the `{ env }` secrets of a backend's sign-in and of
  `output.upload`'s headers are read, at start and on every use. Default: `process.env`.
- `loopback` says whether the server listens on loopback only. It decides whether `auth: none` is
  allowed, so it must match the address you listen on.
- `rest.fetch(request, { address })` takes the client's address for the limit on refused tokens.
  Without it, refused tokens are not limited, and a warning says so once.
- The Host check reads the request's `Host` header. For a `Request` built in code without one, it
  reads its URL's host. It accepts `localhost`, `127.0.0.1`, `[::1]`, the host of `http.publicUrl`
  and `http.allowHosts`.
- `createServerHandler(options, { env, stderr, loopback })` is the handler of
  `pivotkit-server serve`. It serves REST and, when pivotkit-mcp is installed, MCP over one context,
  with `/healthz` and `/readyz`. Hand it to `serveFetch` or your own server.
- To combine them yourself, build the context with pivotkit-mcp's `createMcpContext`, since its
  `createHttpHandler` needs the MCP server factory it adds. Give that context to both
  `createHttpHandler` and `createRestHandler`.
- From `pivotkit-server/rest`, `openApiDocument(options)` builds the OpenAPI document and
  `REST_ROUTES` lists the routes.
- From `pivotkit-server`, `present(context, operation, input, caller)` runs an operation for a
  caller (`callerOf("none")` without sign-in). It gives `{ text, result }` as both endpoints do.
- `serve(options, { env, stderr })` is `pivotkit-server serve` in code.
