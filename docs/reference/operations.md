---
title: Operations and logs
description: Running pivotkit-server and pivotkit-mcp in production - the log's settings, levels, events and fields, request ids and trace ids, correlation with a reverse proxy, error codes in the log, and shipping the log with Docker's gelf and syslog drivers or a Kubernetes log agent.
---

# Operations and logs

pivotkit-server and pivotkit-mcp write one line per event to stderr and keep no log file. On stdio,
stdout is the MCP protocol. What happens to the lines is up to your container runtime or service
manager: `docker logs`, journald, a log driver or a cluster's log agent. This page says what a line
holds and how to get the lines where you search them. Whether a server is up and can take work is
for `/healthz` and `/readyz`, not the log ([health checks](rest.md#running)).

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

- **`log.level`**: a line is written when its level reaches the setting.
    - `warn` keeps every failure and drops successful requests and calls.
    - `error` keeps only server errors (5xx) and unexpected errors.
    - The `started` and `stopped` lines are written at every level but `off`.
    - `debug` is for setting a server up. Its lines hold more, an error's own message among them,
      which may quote a value or a request's body, so do not leave it on.
    - Where you only look at what went wrong (a busy server, a log you pay for by volume), `warn` is
      the level to run with.
- **`log.format`**:
    - `json` writes one JSON object per line.
    - `text` writes `key=value` pairs (logfmt, in the style of Go's `slog` TextHandler) for a person
      at a terminal.
    - `auto` writes text when stderr is a terminal, and JSON otherwise.
    - Both formats carry the same fields, except that text leaves out `severity`, `service`,
      `version` (the `started` line names it) and `traceId`.
    - Text is coloured only on a terminal, and only when `NO_COLOR` is not set.
    - The [container image](container.md) sets `PIVOTKIT_LOG_FORMAT=json`, because `docker run -t`
      gives the process a terminal.
- **`log.address`**: `on`, the default, puts the client's address on every line of a request:
    - `address`, the client as best known: with `http.trustProxy` the last entry of
      `X-Forwarded-For`, else the socket's peer
    - `peerAddress`, the socket's peer, where it differs (behind a proxy, the proxy)

    An address is personal data ([privacy](../privacy.md#logs)). `off` leaves both out:
    `"log": { "address": "off" }`, `--log-address off` or `PIVOTKIT_LOG_ADDRESS=off`.

`started` names the format it chose (`logFormat`), so a log that suddenly reads as text or JSON
tells you why.

An error at start, before the log exists, follows the same rule: for example a configuration that
cannot be read, or an unknown flag. It is a JSON line (`event` `error`, `code` `CONFIG`) where
stderr is no terminal or JSON is asked for. It is the plain line `pivotkit-server: ...` on a terminal
or with `--log-format text`. check-config prints the log's settings and does not log.

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
| `upstreamRequestId` | The `X-Request-Id` the request came with (a proxy's id), 1 to 128 letters, digits and `_ . : + / = -`. Any other value is not logged. The caller or a proxy chooses it, so it can hold a user id or a session id |
| `address` | The client as best known, unless `log.address` is `off`. With `http.trustProxy`, the last entry of `X-Forwarded-For`, or `invalid` when that is no IP address (the request is never put on the proxy's address). Without it, the socket's peer |
| `peerAddress` | The socket's peer, where it differs from `address` (behind a trusted proxy, the proxy) |

`traceId` and `upstreamRequestId` come from the caller's headers. They are checked for their form,
not for who sent them, so they are hints to join lines with other systems, not proof of where a
request came from.

Lines of calls, requests, downloads and refusals add:

| Field | On | What it holds |
| --- | --- | --- |
| `operation`, `route` | `request`, `download` | The REST operation and its route (`POST /sources/describe`) |
| `tool` | `call` | The MCP tool |
| `client` | `call`, `request`, `download` | The static token's name or the OAuth client id |
| `subject` | `call`, `request`, `download` | The person, only with [`audit.subject`](mcp.md#logging) |
| `source` | `call`, `request`, `download` | A configured id, `inline:`, `file:` (any file by path) or `unknown` (anything else a caller typed). At most 64 characters |
| `status` | all four | The HTTP status. On a `call` line, the status REST answers the same error with |
| `outcome` | all four | `ok` or `error`. `ok` stays beside it on `call` lines |
| `code` | failures | The [error code](#codes) |
| `ms` | `call`, `request` | The time the work took, in milliseconds |
| `saved` | `call`, `request` | `false` for a `render_view` with `save: false`, which writes no file ([inline only](mcp.md#inline-only)) |
| `reason` | `refused` | Why the request was refused. The values are listed [below the table](#reasons) |
| `limit`, `size` | `refused` | For `body_too_large`: the bytes allowed and the declared size. For `rate_limited` after sign-in, `limit` is `rate` (the caller's own bucket), `clientRate` (the bucket of one OAuth client's people together, eight times as large), `concurrency` (the caller's own requests at once) or `clientShare` (the requests of one OAuth client's people together, eight times `concurrency`). A `download` line with `code` `RATE_LIMITED` is a sign-in callback over 20 a minute from one address. Behind a proxy, that needs `http.trustProxy`, or everyone shares the proxy's address. Limits count per person. The line names the person as `subject` only with `audit.subject` |
| `path` | `refused` | The route family that refused it (`/api/v1`, `/openapi.json`, `/mcp`, `/downloads`), never the path the request asked for |
| `error`, `refusal`, `detail` | `refused` | For a request the MCP protocol layer refused: its error's class, the SDK's fixed name for the refusal (such as `name-header-mismatch`) and, only at `debug`, its message, which can quote the request's body |
| `host`, `origin` | `refused` | For `reason` `host` or `origin`: the Host or Origin the request sent (at most 100 characters) |
| `parserError` | `refused` | For a request the HTTP parser refused (answered 400, 408 or 431 with an `X-Request-Id`): the parser's code, such as `HPE_INVALID_HEADER_TOKEN`. A `CONNECT` (a tunnel, which the server never opens) is answered 400 with a `bad_request` line without it |

<a id="reasons"></a>The values of `reason`:

- `no_token`, `bad_token`, `rate_limited`, `body_too_large`, `host`, `origin`, `insufficient_scope`
- `not_allowed`: the person's groups
- `not_ready`: the issuer is not loaded yet
- `busy`
- `bad_request`: a body or a request the HTTP parser cannot read, a method the server never takes
  such as `TRACE`, a body that is not JSON, or an `mcp-protocol-version` the MCP endpoint does not
  support. A method such as `TRACE` gets 400 and a line at `warn` by design.
- `unsupported_media_type` and `not_acceptable`: the MCP endpoint's `Content-Type` and `Accept`
  checks
- `token_in_address`
- `internal`: a 5xx without a line of its own
- At `debug` only:
    - `method_not_allowed`: a method a route does not take, such as a GET of the MCP endpoint, which
      clients send to open a stream
    - `not_found`: a path nobody serves, also under `/api/v1`. Under `/downloads`, a link nobody has
      is at `info`, since a person asks you about it.
- Any other error answer without a line of its own gives its problem's code in lower case, or one of
  these by its status.

The level of a `call`, `request`, `download` or `refused` line follows its status: `info` below 400,
`warn` for 4xx, `error` for 5xx. A refused request is `warn` or `error`, except the two routine ones
above (`method_not_allowed`, `not_found`), which are `debug`.

Every error answer (4xx and 5xx) has one line under the `requestId` of its `X-Request-Id`: its own
`call`, `request` or `download` line, or a `refused` line. A 404 or 405 has its line only at
`log.level` `debug`. A request that fails unexpectedly after it logged a line below 500 gets an
`internal` `refused` line at `error` besides it.

A log line names the route family. The path, query and body a request sent are never logged. A host
or origin refusal names the refused Host or Origin value, cut to 100 characters.

`/healthz` and `/readyz` write no line per probe. `/readyz` writes one when the server stops being
ready (`warn`, with what is missing) and one when it is ready again (`info`).

A body larger than the cap is answered 413 at once. One that keeps coming after four times the cap
(at least 64 KiB) has its connection cut. A client that sends with no `Content-Length`, such as a
proxy forwarding an HTTP/2 body, still gets the 413 with its `X-Request-Id` first. A proxy may report
a stream error to its own client instead. The `refused` line with `body_too_large` and `size` (the
declared size, when there is one) is written either way. Look it up by time and `peerAddress`.

A warning about a backend adds these fields. A backend is an [HTTP source](sources.md), its
sign-in, or the [upload store](delivery.md#upload).

| Field | What it holds |
| --- | --- |
| `cause` | `timeout`, `connection`, `tls`, `dns`, `blocked_address` (an address it may not reach), `http_status`, `bad_body` (an answer that cannot be read as configured), `setup` (the request cannot be sent as configured), `sign_in_failed` (a backend's sign-in: the token endpoint refused or answered badly), `upload_failed` (an upload that failed otherwise) |
| `backend` | The backend's name in `httpSources.backends`, where the source uses one |
| `upstreamStatus` | The backend's (or the store's, the token endpoint's) status, where it answered |
| `upstreamMs` | The time since the request to it started, in milliseconds |

A warning's text (`msg`) is free text and may change between versions. Query by `event`, `cause`,
`backend` and `source`, which stay. The warning of an HTTP source's error status also holds
`template`: the source's configured address template with the backend's host, never a value of a
parameter.

No line holds a view, a value, a token, or a person's groups or other claims. A request's or a
call's line holds no file path. Lines at start can name the operator's own file paths. Text a
caller or a backend controls is cut, and its control characters (C0, C1, the bidi controls, the line
separators) are removed in both formats, so it cannot start a line of its own, a field in the text
format, or a terminal escape in a log viewer.

An example request line in each format:

```json
{"time":"2026-11-15T11:12:45.066Z","level":"warn","severity":4,"event":"request","msg":"describe_source failed","service":"pivotkit-server","version":"<version>","requestId":"F0iFBi9CZjQ","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","operation":"describe_source","route":"POST /sources/describe","client":"reports","address":"192.0.2.10","source":"web","status":404,"outcome":"error","code":"DATA_NOT_AVAILABLE","ms":15}
```

```text
time=2026-11-15T11:12:45.066Z level=warn event=request msg="describe_source failed" requestId=F0iFBi9CZjQ operation=describe_source route="POST /sources/describe" client=reports address=192.0.2.10 source=web status=404 outcome=error code=DATA_NOT_AVAILABLE ms=15
```

## Events { #events }

| `event` | When |
| --- | --- |
| `info` with `msg` `started` | The server listens: `version`, `transport`, `url`, what it serves, the auth mode, `sources` (how many) and `sourceIds`, `logLevel`, `logFormat`, over HTTP `logAddress`, and with static tokens their names (`tokens`), never a value. Ids and names at most 64 characters |
| `info` with `msg` `stopped` | The HTTP server has stopped after the running requests finished or the grace time ended (`ms`). Written after SIGTERM, before the process ends |
| `call` | An MCP tool call |
| `request` | A REST request that reached an operation |
| `download` | A file handed out: by the REST file route or a [download link](delivery.md) (`via: "link"`) |
| `refused` | A request refused before it reached an operation, with its `reason` |
| `warning` | Something the operator should look at: a backend that failed, refused connections, a setting that does not fit, a static token's file that cannot be used, with the cause (at most once a minute per token) |
| `info` | Something that changed: the issuer's metadata loaded, old reports deleted (to make room, or by `output.maxAgeDays`: one line per sweep with the counts `reports` and `drafts`) |
| `error` | An unexpected error: its class, its message only at `debug`, never its stack |
| `debug` | Only at `debug`: why a token was refused, what a backend answered |

`message` repeats `msg`, `ok` repeats `outcome` on `call` lines, and warnings have the event name
`warning`. Query by `msg`, `outcome` and `level` where you can.

## Error codes in the log { #codes }

`code` on a line is the code the caller got: REST's [problem codes](rest.md#errors) and MCP's
[tool error codes](mcp.md#errors), with the same names on both. A few to watch:

| Code | What it says about the server |
| --- | --- |
| `SOURCE_UNAVAILABLE` | A backend or a source's code failed. The `warning` line of the same `requestId` has the `cause` |
| `DATA_NOT_AVAILABLE` | The backend refused or did not know the data (401, 403, 404 of a parameterised source) |
| `TIMEOUT`, `BUSY` | The compute workers or the queue are at their limit (`compute.*`) |
| `INTERNAL` | An unexpected error. The `error` line of the same `requestId` has its class, and `--log debug` its message |
| `INVALID_TOKEN`, `RATE_LIMITED` | On `refused` lines with `reason`. Many from one `address` are someone guessing tokens. Behind a proxy, that holds only with `http.trustProxy`, else `address` is the proxy for every client. An `address` of `invalid` is a forwarded header the proxy should not have passed |

## Correlation with a reverse proxy { #correlation }

Every answer carries `X-Request-Id` with the request's own id. A person who quotes the id of an
error finds every line of that request. The id is the server's own: an `X-Request-Id` the request
came with is logged as `upstreamRequestId` and never replaces it.

To find a proxy's access log line next to pivotkit's:

- Let the proxy send its own id as `X-Request-Id` (nginx: `proxy_set_header X-Request-Id $request_id;`
  and `$request_id` in its log format) and search pivotkit's log for `upstreamRequestId`.
- Or let the proxy log the answer's header (nginx: `$upstream_http_x_request_id`) and search for
  `requestId`.
- A proxy or service mesh with W3C trace context propagation turned on (its OpenTelemetry tracing)
  sends `traceparent`. Its trace id becomes `traceId`, so lines join a trace in your tracing tool. A
  `traceparent` that does not parse strictly (version 00 with exactly four lower-case hex fields, or
  a later version) is ignored, and a new trace id is made.
- With `http.trustProxy`, `address` is the client the proxy saw and `peerAddress` the proxy. Without
  it, `address` is the proxy's own address.
- When the proxy runs in a container whose port Docker publishes (`ports:` in Compose, `-p`), the
  proxy itself may see the Docker network's gateway (such as `172.17.0.1`) instead of the client,
  depending on how Docker forwards the connection on that host. `address` is then the gateway for
  every client, and `http.trustProxy` cannot fix that: the proxy never learned the client's address.
  Check the proxy's own access log. If it shows the gateway, change how the proxy receives
  connections (for example host networking for the proxy's container).

## Docker log drivers { #docker }

The JSON lines go to Docker's logging driver as they are. Docker's own `json-file` and `local`
drivers keep them for `docker logs`. Give them a size, so they do not fill the disk. To send them to
a log server, use the `gelf` or `syslog` driver
([Docker's driver options](https://docs.docker.com/engine/logging/configure/)).

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

syslog (rsyslog, syslog-ng, a SIEM, a NAS's log center), in RFC 5424 format. Over TLS:

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

To a plain receiver on port 514, over TCP or UDP, whichever the receiver listens on. `rfc3164` is
the safe choice for a NAS's log center. Use `rfc5424` for a receiver that expects it:

```yaml
    logging:
      driver: syslog
      options:
        syslog-address: "tcp://nas.example:514"   # or "udp://nas.example:514"
        syslog-format: "rfc3164"                  # or "rfc5424"
        tag: "pivotkit"
```

On a Synology NAS, Log Center receives syslog on port 514 and files it per sending host. Whether it
takes UDP or TCP depends on the receiving rule in Log Center > Log Receiving.

- The Docker syslog driver sends each line as one message with facility `daemon` and severity `err`
  for everything on stderr, where pivotkit logs. This holds whatever pivotkit's own `level` says, so
  map the level from the JSON.
- The message text is pivotkit's JSON line.
- A BSD (RFC 3164) receiving rule accepts the driver's `rfc3164` and `rfc5424` output over UDP and
  TCP. Check one test line in your Log Center before relying on how it shows the tag and severity.

Both drivers put pivotkit's whole JSON line into the message (GELF `short_message`, the syslog
message text). The driver's own level is the stream's, the same for every line of stderr, so it says
nothing. Let the log server parse the message as JSON and use pivotkit's `level` (or `severity`).

In Graylog, add a JSON extractor on the message (or a pipeline rule that parses it as JSON). Use its
`level` and `severity` fields instead of the GELF level the driver sets. `time` stays a text field
until you map it to a date, or use the message's own timestamp, which the driver sets when it
receives the line.

## Without a container: journald and rsyslog { #journald }

When the server runs as a systemd service, its stderr goes to the journal. Name the syslog identifier
(`SyslogIdentifier`). The log stays JSON, since stderr is no terminal there:

```ini
# /etc/systemd/system/pivotkit.service (the parts about the log)
[Service]
ExecStart=/usr/bin/npx pivotkit-server serve --config /etc/pivotkit/pivotkit.json
StandardError=journal
SyslogIdentifier=pivotkit
```

```bash
journalctl -u pivotkit -o cat | jq 'select(.level != "info")'   # every warning and error
```

rsyslog reads the journal through its `imjournal` module and can pass the lines on over TCP. Many
distributions load the module already in `/etc/rsyslog.conf`. Keep the `module` line only where
yours does not, since loading it twice is an error.

The template `RSYSLOG_SyslogProtocol23Format` is rsyslog's IETF draft form (syslog-protocol-23),
close to RFC 5424. `RSYSLOG_SyslogRFC5424Format` is the strict one, but it ends a message without a
line feed, which a receiver reading lines over TCP may not split:

```text
# /etc/rsyslog.d/pivotkit.conf
module(load="imjournal")   # only where /etc/rsyslog.conf does not load it
if $programname == 'pivotkit' then @@logs.example.com:514;RSYSLOG_SyslogProtocol23Format
```

## The state volume { #state }

When the server has a state directory (`/var/lib/pivotkit` in the [container image](container.md),
`--state-dir` elsewhere), it keeps there:

- in `secrets/`, the token `admin`, the key of the download links and the audit key it made at its
  first start ([made at the first start](rest.md#first-start))
- in `out/`, the reports, where `output.dir` names it

Back the volume up with the rest of the installation. Keep the backup as secret as the tokens: with
the files, anyone can call the server and open its download links. A restore brings the same token
and keys back. Without one, the server makes new ones, so clients need the new token and older links
stop working.

Rotate a value by replacing its file, without a restart:

```bash
docker exec pivotkit pivotkit-server token new --file /var/lib/pivotkit/secrets/admin.token --force
docker exec pivotkit pivotkit-server key new --for downloads --file /var/lib/pivotkit/secrets/downloads.key --force
```

The token's old value gets 401 at once, and links made with the old key stop working within a
second. The audit key is read at start, so restart after replacing it. The same person then gets
another hash. To make a value new at the next start instead, delete its file.

## Kubernetes { #kubernetes }

Kubernetes has no log driver per pod. The container runtime writes each container's stderr to a file
on the node. `kubectl logs` reads that file, and a log agent of the cluster (Fluent Bit, Vector, the
OpenTelemetry Collector, Grafana Alloy) ships it.

- Keep `log.format` at `json`, the image's setting.
- Let the agent parse each line as JSON.
- Keep pivotkit's `level` and `requestId` as fields.

See [Kubernetes](../getting-started/kubernetes.md) for the deployment itself.

## Privacy { #privacy }

What the log holds about people, and how long to keep it, is on the [privacy page](../privacy.md#logs).
