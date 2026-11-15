---
title: Operations and logs
description: Running pivotkit-server and pivotkit-mcp in production - the log's settings, levels, events and fields, request ids and trace ids, correlation with a reverse proxy, error codes in the log, and shipping the log with Docker's gelf and syslog drivers or a Kubernetes log agent.
---

# Operations and logs

pivotkit-server and pivotkit-mcp write one line per event to stderr and keep no log file (on stdio,
stdout is the MCP protocol). What happens to the lines is your container runtime's or service
manager's business: `docker logs`, journald, a log driver or a cluster's log agent. This page says
what a line holds and how to get the lines where you search them.

## Settings { #settings }

Each setting is a key in the configuration file, a flag and an environment variable. A flag wins,
then the file, then the variable.

| Key | Flag | Variable | Default | Values |
| --- | --- | --- | --- | --- |
| `log.level` | `--log` | `PIVOTKIT_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `off` |
| `log.format` | `--log-format` | `PIVOTKIT_LOG_FORMAT` | `auto` | `auto`, `text`, `json` |
| `log.address` | `--log-address` | `PIVOTKIT_LOG_ADDRESS` | `on` | `on`, `off` |

```json
{ "log": { "level": "info", "format": "json", "address": "on" } }
```

`"log": "debug"` (a level alone) is short for `{ "level": "debug" }`.

- **`log.level`**: a line is written when its level reaches the setting. `warn` keeps every failure
  and drops successful requests and calls; `error` keeps only server errors (5xx) and unexpected
  errors. The `started` and `stopped` lines are written at every level but `off`. `debug` is for
  setting a server up: its lines hold more, an error's own message among them (which may quote a
  value or a request's body), so do not leave it on.
- **`log.format`**: `json` writes one JSON object per line; `text` writes `key=value` pairs (logfmt,
  in the style of Go's `slog` TextHandler) for a person at a terminal; `auto` writes text when stderr
  is a terminal and JSON otherwise. Both formats carry the same fields, except that text leaves out
  `severity`, `service`, `version` (the `started` line names it) and `traceId`. Text is coloured only
  on a terminal and only when `NO_COLOR` is not set. The [container image](container.md) sets
  `PIVOTKIT_LOG_FORMAT=json`, because `docker run -t` gives the process a terminal.
- **`log.address`**: `on` puts the client's address on every line of a request: `address`, the
  socket's peer (behind a proxy, the proxy), and with `http.trustProxy` also `clientAddress`, the
  last entry of `X-Forwarded-For`. `off` leaves both out. An address is personal data
  ([privacy](../privacy.md#logs)).

`started` names the format it chose (`logFormat`), so a log that suddenly reads as text or JSON
tells you why. An error in the configuration at start, before the log exists, is a JSON line when
`--log-format json` or `PIVOTKIT_LOG_FORMAT=json` asks for JSON (the image sets it); otherwise it is
the plain line `pivotkit-server: ...` that the command line's usage errors are. check-config prints
the log's settings and does not log.

## Lines { #lines }

Every line has these fields:

| Field | What it holds |
| --- | --- |
| `time` | When, in UTC (ISO 8601 with milliseconds) |
| `level` | `debug`, `info`, `warn` or `error` |
| `severity` | The level as an RFC 5424 number: `error` 3, `warn` 4, `info` 6, `debug` 7 |
| `event` | What happened ([events](#events)) |
| `msg` | A short sentence: `describe_source failed`, `request refused: no_token`, the text of a warning |
| `service` | `pivotkit-server`, or `pivotkit-mcp` when pivotkit-mcp runs on its own |
| `version` | The package's version |

A line written while a request or tool call runs adds its scope:

| Field | What it holds |
| --- | --- |
| `requestId` | 11 random characters, the same on every line of the request, in its `X-Request-Id` answer header and in its error ([correlation](#correlation)) |
| `traceId` | 32 hex characters: the trace id of a valid W3C `traceparent` header, else a new one |
| `upstreamRequestId` | The `X-Request-Id` the request came with (a proxy's id), 1 to 128 letters, digits and `_ . : + / = -`; any other value is not logged |
| `address` | The socket's peer, unless `log.address` is `off` |
| `clientAddress` | With `http.trustProxy` and `log.address` on: the last entry of `X-Forwarded-For` |

Lines of calls, requests, downloads and refusals add:

| Field | On | What it holds |
| --- | --- | --- |
| `operation`, `route` | `request`, `download` | The REST operation and its route (`POST /sources/describe`) |
| `tool` | `call` | The MCP tool |
| `client` | `call`, `request`, `download` | The static token's name or the OAuth client id |
| `subject` | `call`, `request`, `download` | The person, only with [`audit.subject`](mcp.md#logging) |
| `source` | `call`, `request`, `download` | A configured id, `inline:`, `file:` (any file by path) or `unknown` (anything else a caller typed); at most 64 characters |
| `status` | all four | The HTTP status; on a `call` line the status REST answers the same error with |
| `outcome` | all four | `ok` or `error`; `ok` stays beside it on `call` lines |
| `code` | failures | The [error code](#codes) |
| `ms` | `call`, `request` | The time the work took |
| `reason` | `refused` | `no_token`, `bad_token`, `rate_limited`, `body_too_large`, `host`, `origin`, `insufficient_scope`, `not_allowed` (the person's groups), `not_ready` (the issuer is not loaded yet), `busy`, `bad_request` (a body that cannot be read), `token_in_address` |
| `limit`, `size` | `refused` | For `body_too_large`: the bytes allowed and the declared size; for `rate_limited` after sign-in, `limit` is `rate` or `concurrency` |

The level of a `call`, `request`, `download` or `refused` line follows its status: `info` below 400,
`warn` for 4xx, `error` for 5xx. A refused request is always `warn` or `error`.

A warning about a data source's backend (an [HTTP source](sources.md)) adds:

| Field | What it holds |
| --- | --- |
| `cause` | `timeout`, `connection`, `tls`, `dns`, `blocked_address` (an address the source may not reach), `http_status`, `bad_body` (an answer that cannot be read as configured), `setup` (the request cannot be sent as configured) |
| `backend` | The backend's name in `httpSources.backends`, never its address |
| `upstreamStatus` | The backend's status, where it answered |
| `upstreamMs` | The time since the source's request started |

No line holds a view, a value, a token, a person's groups or other claims, or a full path. Text a
caller or a backend controls is cut and has control characters removed, so it cannot start a line
of its own or a field in the text format.

An example request line in each format:

```json
{"time":"2026-11-15T11:12:45.066Z","level":"warn","severity":4,"event":"request","msg":"describe_source failed","service":"pivotkit-server","version":"0.7.0","requestId":"F0iFBi9CZjQ","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","operation":"describe_source","route":"POST /sources/describe","client":"reports","address":"192.0.2.10","source":"web","status":404,"outcome":"error","code":"SOURCE_NOT_FOUND","ms":15}
```

```text
time=2026-11-15T11:12:45.066Z level=warn event=request msg="describe_source failed" requestId=F0iFBi9CZjQ operation=describe_source route="POST /sources/describe" client=reports address=192.0.2.10 source=web status=404 outcome=error code=SOURCE_NOT_FOUND ms=15
```

## Events { #events }

| `event` | When |
| --- | --- |
| `info` with `msg` `started` | The server listens: `version`, `transport`, `url`, what it serves, the auth mode, `sources` (how many) and `sourceIds`, `logLevel`, `logFormat`, `logAddress`, and with static tokens their names (`tokens`), never a value |
| `info` with `msg` `stopped` | The HTTP server has stopped after the running requests finished or the grace time ended (`ms`); after SIGTERM, before the process ends |
| `call` | An MCP tool call |
| `request` | A REST request that reached an operation |
| `download` | A file handed out: by the REST file route or a [download link](delivery.md) (`via: "link"`) |
| `refused` | A request refused before it reached an operation, with its `reason` |
| `warning` | Something the operator should look at: a backend that failed, refused connections, a setting that does not fit |
| `info` | Something that changed: the issuer's metadata loaded, old reports deleted |
| `error` | An unexpected error: its class, its message only at `debug`, never its stack |
| `debug` | Only at `debug`: why a token was refused, what a backend answered |

The fields `message` (beside `msg`), `ok` (beside `outcome`) and the event name `warning` are kept
for log queries written before these fields existed.

## Error codes in the log { #codes }

`code` on a line is the code the caller got: REST's [problem codes](rest.md#errors) and MCP's
[tool error codes](mcp.md#errors), the same names on both. A few to watch:

| Code | What it says about the server |
| --- | --- |
| `SOURCE_UNAVAILABLE` | A backend or a source's code failed; the `warning` line of the same `requestId` has the `cause` |
| `DATA_NOT_AVAILABLE` | The backend refused or did not know the data (401, 403, 404 of a parameterised source) |
| `TIMEOUT`, `BUSY` | The compute workers or the queue are at their limit (`compute.*`) |
| `INTERNAL` | An unexpected error: the `error` line of the same `requestId` has its class; `--log debug` its message |
| `INVALID_TOKEN`, `RATE_LIMITED` | On `refused` lines with `reason`; many from one `address` are someone guessing |

## Correlation with a reverse proxy { #correlation }

Every answer carries `X-Request-Id` with the request's own id; a person who quotes the id of an
error finds every line of that request. The id is the server's own: an `X-Request-Id` the request
came with is logged as `upstreamRequestId` and never replaces it.

To find a proxy's access log line next to pivotkit's:

- Let the proxy send its own id as `X-Request-Id` (nginx: `proxy_set_header X-Request-Id $request_id;`
  and `$request_id` in its log format) and search pivotkit's log for `upstreamRequestId`.
- Or let the proxy log the answer's header (nginx: `$upstream_http_x_request_id`) and search for
  `requestId`.
- A proxy or service mesh with W3C trace context propagation turned on (its OpenTelemetry tracing)
  sends `traceparent`; its trace id becomes `traceId`, so lines join a trace in your tracing tool. A
  `traceparent` that does not parse strictly (version 00 with exactly four lower-case hex fields, or
  a later version) is ignored and a new trace id is made.
- With `http.trustProxy`, `clientAddress` is the client the proxy saw; without it, `address` is the
  proxy's own address.

## Docker log drivers { #docker }

The JSON lines go to Docker's logging driver as they are. Docker's own `json-file` and `local`
drivers keep them for `docker logs`; give them a size so they do not fill the disk. To send them to a
log server, use the `gelf` or `syslog` driver ([Docker's driver
options](https://docs.docker.com/engine/logging/configure/)).

GELF (Graylog, or anything that takes GELF over UDP or TCP), in `compose.yml`:

```yaml
services:
  pivotkit:
    image: ghcr.io/eizedev/pivotkit:<version>
    logging:
      driver: gelf
      options:
        gelf-address: "udp://graylog.example.com:12201"
        tag: "pivotkit"
```

```bash
docker run --log-driver gelf --log-opt gelf-address=udp://graylog.example.com:12201 --log-opt tag=pivotkit ...
```

syslog (rsyslog, syslog-ng, a SIEM), in RFC 5424 format:

```yaml
services:
  pivotkit:
    image: ghcr.io/eizedev/pivotkit:<version>
    logging:
      driver: syslog
      options:
        syslog-address: "tcp+tls://logs.example.com:6514"
        syslog-format: "rfc5424"
        tag: "pivotkit"
```

The receiver's format and transport must match what the driver sends: an RFC 5424 sender to a
receiver that expects RFC 3164 (or TCP to a UDP port) gives garbled or no messages.

Both drivers put pivotkit's whole JSON line into the message (GELF `short_message`, the syslog
message text). The driver's own level is the stream's, the same for every line of stderr, so it says
nothing: let the log server parse the message as JSON and use pivotkit's `level` (or `severity`).
In Graylog, add a JSON extractor on the message (or a pipeline rule that parses it as JSON) and use
its `level` and `severity` fields instead of the GELF level the driver sets.

## Kubernetes { #kubernetes }

Kubernetes has no log driver per pod: the container runtime writes each container's stderr to a file
on the node, which `kubectl logs` reads and a log agent of the cluster (Fluent Bit, Vector, the
OpenTelemetry Collector, Grafana Alloy) ships. Keep `log.format` at `json` (the image's
setting), let the agent parse each line as JSON, and keep pivotkit's `level` and `requestId` as
fields. See [Kubernetes](../getting-started/kubernetes.md) for the deployment itself.

## Privacy { #privacy }

What the log holds about people, and how long to keep it, is on the [privacy page](../privacy.md#logs).
