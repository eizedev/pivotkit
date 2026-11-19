---
title: JavaScript exports of the services
description: Every name that pivotkit-server, pivotkit-server/rest, pivotkit-server/policy, pivotkit-mcp and pivotkit-mcp/policy export, with what each is and where its details are.
---

# JavaScript exports of the services

pivotkit-server and pivotkit-mcp are command line programs and libraries. This page lists every
name their entry points export. Each name is public interface, as [versioning](../versioning.md)
says. The details are on the pages each line links to.

Build your own server with them as [In your own server](rest.md#embed) shows.

## `pivotkit-server` { #server }

The options, the context, the errors, and the helpers for requests.

### Start and run

| Name | What it is |
| --- | --- |
| `createContext` | Checks the options and starts the workers. [Details](rest.md#embed) |
| `present` | Runs an operation for a caller and gives what the caller may see. |
| `callerOf` | The caller of a request, from its sign-in. |
| `serve` | Serves REST and MCP over HTTP from options, as `pivotkit-server serve` does. |
| `createServerHandler` | The fetch handler of REST and, when installed, MCP over one context. |
| `serveFetch` | Serves a fetch handler on `node:http`. It caps the body and stops gracefully. [Details](rest.md#embed) |
| `loadConfig` | Reads a configuration file. |
| `validateOptions` | Checks options and throws a `ConfigError` for a mistake. |
| `checkConfig` | The report that `check-config` prints. [Details](sources.md#check-source) |

### Errors

| Name | What it is |
| --- | --- |
| `ConfigError` | The error of a wrong option or configuration file. |
| `OperationError` | The error of an operation, with a code such as `INVALID_INPUT`. [Codes](rest.md#errors) |
| `SourceError` | The error a code source throws to answer with a code. [Details](sources.md#code) |
| `SOURCE_ERROR_CODES` | The codes a `SourceError` may carry. |
| `SecretError` | The error when pivotkit cannot read a secret. Its code is `SECRET`. |

### Options and defaults

| Name | What it is |
| --- | --- |
| `readSecret` | Reads a secret reference on every use. [Details](rest.md#embed) |
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
| `createRestHandler` | The fetch handler of the REST service over a context. [Details](rest.md#embed) |
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
