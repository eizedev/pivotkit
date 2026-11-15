---
title: Data sources
description: The kinds of data source pivotkit-server and pivotkit-mcp read - files, HTTP sources the operator configures with typed parameters, and code sources of a library host, with a time limit, coalescing, kept data and last good data.
---

# Data sources

A source is what a caller names with `source`: an id the operator configured under `sources`, a
`file:` path inside `files.allowDirs`, or `inline:`, a table the caller sends with the request
([MCP](mcp.md#data), [REST](rest.md#data)), to which no exposure policy applies. A configured source
is one of these kinds:

| Kind | Configured with | Where it is read |
| --- | --- | --- |
| File | `file`: a CSV, TSV, TXT, JSON or XLSX file | In a worker thread, with the file limits ([options](mcp.md#configuration)) |
| HTTP | `http`: an operator's backend, its address with typed parameters | Requested and parsed in the server's thread, computed in a worker; see [HTTP sources](#http) |
| Code | `load`: a function of a library host | In the host's thread; see [Code sources](#code) |

Every kind has the same exposure policy, scopes, field descriptions and `dataAsOf` in its results
([pivotkit-mcp](mcp.md), [REST](rest.md)).

## HTTP sources { #http }

An HTTP source asks an operator's backend for its rows. You write the address once in the
configuration, with a parameter in braces where a caller's value goes; a caller (a model or a
program) passes only the values, which pivotkit checks against their declared type, pattern or list
before anything is sent. A caller never gives an address.

```json
{
  "httpSources": {
    "backends": {
      "platform": {
        "url": "https://api.example.com/v1",
        "headers": { "accept": "application/json" },
        "timeMs": 15000
      }
    }
  },
  "sources": {
    "vms": {
      "title": "Virtual machines",
      "http": {
        "backend": "platform",
        "path": "/customers/{customer}/vms",
        "query": { "state": "{state}", "limit": "500" },
        "rows": "/items",
        "asOf": "/generatedAt",
        "paging": { "next": "/next" },
        "maxPages": 10
      },
      "params": {
        "customer": { "type": "string", "required": true, "pattern": "^[a-z0-9-]{1,40}$", "description": "The customer's short name", "example": "acme" },
        "state": { "type": "string", "enum": ["running", "stopped"] }
      },
      "ttl": 300,
      "policy": { "default": "hide", "fields": { "name": "show", "cpu": "show", "state": "show" } }
    }
  }
}
```

A call with `"params": { "customer": "acme", "state": "running" }` requests
`https://api.example.com/v1/customers/acme/vms?state=running&limit=500`, follows the `next` pages,
and reads the rows at `/items` of each answer. `list_sources` names the parameters with their type,
description, example, list of values, pattern, format, lengths and range; a call without a required one answers `INVALID_INPUT`
naming it ("the source vms needs params.customer (string): The customer's short name, for example
acme"), and a value of the wrong form is refused with the parameter's description, example and
(when short) pattern. A value must have the parameter's type: a number for a `string` parameter is
refused, as is a text with lone surrogates. The fields of a source with required parameters are known only after a load with values, so
`describe_source` needs them too.

### Options { #http-options }

| Key | Default | Meaning |
| --- | --- | --- |
| `httpSources.enabled` | `true` | `false` leaves every HTTP source out (not listed, `SOURCE_NOT_FOUND`); `check-config` says how many are ignored |
| `httpSources.allowIpLiterals` | `false` | An IP address as the host of a backend's or a source's address |
| `httpSources.backends.<name>` | none | A backend many sources share: `url` (an `https://` address and path prefix, no query), `intranet`, `headers`, `auth`, `timeMs`, `maxBytes`, `ttl`, `maxStale`; a source's own value wins |
| `httpSources.backends.<name>.auth` | none | The backend's sign-in for all its sources ([backend sign-in](#http-auth)) |
| `httpSources.backends.<name>.intranet` | `false` | The backend may be on a loopback or private address (an internal API); `check-config` lists each such backend |
| `sources.<id>.http.backend` + `.path` | - | A backend and the path after its `url`, with `{name}` for a parameter |
| `sources.<id>.http.url` | - | Instead of `backend` and `path`: a whole `https://` address template |
| `sources.<id>.http.intranet` | `false` | With `url`: as a backend's `intranet` |
| `.http.query` | none | Query parameters: each value a literal or exactly one `{name}`; a parameter without a value is left out |
| `.http.auth` | the backend's | The source's own sign-in: a header from a secret, client credentials or a token exchange ([backend sign-in](#http-auth)) |
| `.http.headers` | none | Static headers, over the backend's (literal values: no secret). `authorization` and `cookie` go to `http.auth`; `host`, `content-length`, `transfer-encoding`, `connection`, `te`, `trailer`, `upgrade`, `keep-alive`, `accept-encoding`, `forwarded`, `proxy-*` and `x-forwarded-*` are refused |
| `.http.rows` | `""` (the body is the list) | A JSON Pointer (RFC 6901) to the rows: `"/items"`, `"/data/rows"` |
| `.http.format` | `"json"` | `"csv"`: the body is a CSV file, one page, read as a file is |
| `.http.asOf` | none | A JSON Pointer to the body's own time (ISO 8601 text or epoch seconds): the results' `dataAsOf`; else the time the last page arrived |
| `.http.paging` | none | How further pages are found (see [Paging](#http-paging)) |
| `.http.maxPages` | 10 | 1 to 100; a source with more pages answers `LIMIT_EXCEEDED` |
| `.http.maxBytes` | 20 MiB | All pages together, after decompression; over it `LIMIT_EXCEEDED`. A load reads at most `limits.fileBytes` (50 MiB unless set): a larger value is refused when `limits.fileBytes` is set, and a `check-config` warning otherwise |
| `sources.<id>.params` | none | The values a caller passes: `type` (`string`, `integer`, `number`, `boolean`), `required`, `description`, `example`, `enum`, `pattern`, `minLength`, `maxLength` (strings: default 64, at most 256), `minimum`, `maximum`, `format: "date"`, `default`, `claim` (filled from the sign-in, [claims](#http-claims)) |
| `sources.<id>.timeMs` | 15000 ms | All pages of one load, at most 600000 |
| `sources.<id>.ttl` | 60 s | Seconds a load is reused for the same caller and values; `0` only shares loads that run at the same time |
| `sources.<id>.maxStale` | 3600 s | How old the last good data may be to stand in after a transient failure; `0` turns it off |

An HTTP source's policy needs a `default` that is not `show`, under the server's policy and every
profile, or the server does not start: a field the backend adds later would otherwise be shown
without anyone deciding. Set `policy.default` to `hide` and list the fields to show.

A backend's sign-in goes to `http.auth`, never to `http.headers`, and its secret is a reference to
a variable or a file ([backend sign-in](#http-auth)). A header whose name looks like a secret's
(`key`, `token`, `secret`, `auth`, `pass`) with a literal value is a warning in `check-config`,
since everyone who can read the configuration file reads it too.

### The address { #http-address }

- `https://` only; no user name or password, no fragment, no `?` in the address (query values go to
  `query`). An expression is allowed in the path only, never in the host or the port: "expressions in
  the URL are allowed in the path only; for a query value use http.query".
- At most one `{name}` per path segment, with text around it allowed (`{id}.json`, `v{version}`);
  each names a declared parameter, and a parameter in the path must be `required` or have a
  `default`. A segment `.` or `..`, also percent-encoded, is refused.
- A value is encoded as RFC 6570 simple string expansion: everything but letters, digits, `-`, `.`,
  `_` and `~` is percent-encoded, so `/`, `?`, `#`, `&`, `=`, `+`, `;` and a space (`%20`) stay
  inside their segment or value. Numbers and booleans are written by pivotkit, never as the caller
  typed them. The address must keep the template's host and its number of path segments, and no
  value may make a segment empty, `.` or `..`.
- A `string` parameter without `pattern` or `enum` takes letters, digits and `. _ ~ -` only (some
  backends decode `%2F` before they route); no value may hold `..` or a control character. A
  `pattern` is the whole value (anchored), and one that can take long on some values is refused at
  start.
- Write no secret into the address or `query`: the configuration file holds it in plain text; a
  backend's sign-in goes to [`http.auth`](#http-auth). The log and `check-source` write each literal query
  value as `...`, but the path as it is.
- A parameter's `description`, `example`, `enum`, `pattern`, `format`, lengths and range are shown to
  callers (`list_sources`, and the message of a refused value): write no internal names or secrets
  there.
- A query name is given once (without regard to case); a name the paging fills cannot also be a
  parameter or a query value. `check-config` warns about a parameter no part of the address uses.

### Reading the answer { #http-rows }

- The body is parsed as JSON in the server's thread, each page at most `maxBytes`; one nested deeper
  than 64 levels or that is no JSON answers `SOURCE_UNAVAILABLE`. The rows' pointer
  reads the body's own keys only.
- Rows are objects (their keys are the fields, in the order first seen) or lists (the first is the
  header). A value that is an object or a list becomes its JSON text; texts are cut at
  `limits.textLength`. Field names are cleaned of control and direction characters; a name that
  repeats another without regard to case gets " (2)".
- The rows have the limits a file has: `limits.rows` (counted while paging), `limits.columns` and
  `limits.importCells`; over them `LIMIT_EXCEEDED`.
- Hidden fields are dropped before the data is encoded, in a worker, where the operation runs too.

### Paging { #http-paging }

| `paging` | The next page |
| --- | --- |
| `{ "next": "/next" }` | The address at this pointer of the body (absolute or relative); none, `null` or `""` ends |
| `{ "link": true }` | The `Link` header's `rel="next"` |
| `{ "page": "page", "start": 1 }` | The query parameter `page`, counted up from `start` until a page has no rows |
| `{ "offset": "from", "limit": "size", "size": 100 }` | `from` counted up by `size` (sent as `size`) until a page has fewer rows |

A `next` or `link` page must be on the same host and path as the page before (only its query may
differ), or the load fails; a page named again ends the paging. The names `page`, `offset` and
`limit` are pivotkit's to fill: never a parameter, never offered to a caller. A source whose pages
reach `maxPages` and still name a next page answers `LIMIT_EXCEEDED`.

### What a caller gets { #http-errors }

| Backend | Caller gets | `retryable` |
| --- | --- | --- |
| 2xx | the data | |
| 400, 422 | `INVALID_INPUT` "the backend did not accept these parameters" | false |
| 401, 403, 404 on a source with parameters | `DATA_NOT_AVAILABLE` (404) "nothing you may see for customer=xyz: check the value", one answer for all three so other customers' names cannot be probed | false |
| 401, 403 on a source without parameters | `SOURCE_UNAVAILABLE` "the source's backend refused pivotkit's access; ask the operator and give the request id" | false |
| 404 on a source without parameters, a redirect, an address it may not reach, an answer the settings do not fit | `SOURCE_UNAVAILABLE` "the source is not set up correctly; ask the operator and give the request id" | false |
| 429, 502, 503, 504, a timeout, a network error | `SOURCE_UNAVAILABLE` "the source is not available right now; ...", `Retry-After` passed on | true |
| anything else | `SOURCE_UNAVAILABLE` | false |

The texts are pivotkit's, the same on REST and MCP; MCP adds the source's id and whether trying
again may work, and every error names the request id. A backend's body never reaches a caller or the
log. The log has the status, the address template and the source's id; with `log: "debug"` also each
request's path with every value written as `{name}`, and why a request failed.

### The network { #http-network }

Every request goes through the server's guarded fetch: `https://` only, no redirect followed, the
address checked on the connection's own name lookup (a name that answers differently a second time
cannot pass), the body counted while it arrives. Loopback and private addresses are refused unless
the backend is marked `intranet`; link-local and cloud metadata addresses (169.254.0.0/16,
`fd00:ec2::254`, `100.100.100.200` and others) are refused always. A request has its own connection
and no proxy of the environment.

A backend whose certificate comes from an internal certificate authority needs that authority's
certificate in `NODE_EXTRA_CA_CERTS` (a file of PEM certificates, read when the server starts); the
container image takes it as an environment variable too. `check-source` says so on a certificate
error, and when the variable is set, that its file holds no authority that signed the backend's
certificate.

Each page's body is held in memory while it is read and parsed, up to `maxBytes` per load, and the
rows of a kept load stay in memory for `ttl` (bounded as for code sources); keep `maxBytes` near what
a source needs.

### Backend sign-in { #http-auth }

A backend's sign-in is configured in `http.auth` of a source, or in `auth` of a backend for all its
sources (a source's own wins). It is exactly one of three; a secret is always a reference,
`{ "env": "NAME" }` or `{ "file": "path" }` (relative to the configuration file), read when it is
used, so a rotated file or variable works without a restart.

=== "Header"

    A static header, such as an API key:

    ```json
    { "header": { "name": "authorization", "prefix": "Bearer ", "value": { "env": "PLATFORM_TOKEN" } } }
    ```

=== "Client credentials"

    An OAuth access token for pivotkit itself (RFC 6749, client credentials), with a client secret
    sent as HTTP Basic credentials (`client_secret_basic`):

    ```json
    { "clientCredentials": {
        "tokenUrl": "https://auth.example.com/application/o/token/",
        "clientId": "pivotkit-backend",
        "clientSecret": { "file": "secrets/backend-secret" },
        "scope": "platform:read" } }
    ```

    or with a JWT as the client's proof (RFC 7523 `client_assertion`), such as a projected Kubernetes
    service account token, read again for every token request:

    ```json
    { "clientCredentials": {
        "tokenUrl": "https://auth.example.com/application/o/token/",
        "clientId": "pivotkit-backend",
        "assertion": { "file": "/var/run/secrets/tokens/pivotkit" } } }
    ```

=== "Token exchange"

    An access token for the signed-in person (RFC 8693 token exchange), so the backend applies that
    person's rights:

    ```json
    { "tokenExchange": {
        "audience": "platform-api",
        "scope": "platform:read",
        "clientId": "pivotkit-backend",
        "clientSecret": { "file": "secrets/backend-secret" },
        "maxAgeSeconds": 300 } }
    ```

| Key | Default | Meaning |
| --- | --- | --- |
| `header.name` | `authorization` | The header's name; not one the connection sets (`host`, `content-length`, ...), and not also a static header |
| `header.prefix` | none | Text before the secret, such as `Bearer ` |
| `header.value` | - | The secret reference |
| `clientCredentials.tokenUrl` | - | The token endpoint, `https://` |
| `clientCredentials.clientId` | - | pivotkit's client at the token endpoint |
| `clientCredentials.clientSecret` or `.assertion` | - | One of the two, as a secret reference |
| `clientCredentials.scope`, `.audience`, `.resource` | none | Sent with the token request |
| `tokenExchange.tokenUrl` | the `token_endpoint` of `auth.issuer`'s metadata | An `https://` address; the metadata's endpoint must be on the issuer's own origin |
| `tokenExchange.clientId`, `.clientSecret` | - | pivotkit's confidential client (`client_secret_basic`) |
| `tokenExchange.audience` or `.resource` | - | The backend the exchanged token is for; at least one |
| `tokenExchange.scope` | none | The scopes asked for; ask for the narrowest |
| `tokenExchange.maxAgeSeconds` | 300 | The longest an exchanged token is reused, 1 to 86400 |
| `.intranet` (both OAuth kinds) | `false` | The token endpoint may be on a loopback or private address |

A token exchange needs `auth.mode: "oauth"` (see [sign-in](mcp.md#oauth)); with `auth.mode`
`token` or `none` the server does not start with one. It works only for a signed-in person: a caller
whose token has a subject (`auth.subjectClaim`). A caller whose token has none, and a stdio session
(which has no sign-in), does not see the source: it is not listed and answers `SOURCE_NOT_FOUND`,
and the log has an info line naming the source for the operator. A header and client credentials
work for every caller, also over stdio.

**The person's token goes to the token endpoint only.** pivotkit sends the caller's own access token
as `subject_token` to the token endpoint, and never to a backend or to an address taken from an
answer, as the MCP specification requires ("MCP servers MUST NOT accept or transit any other
tokens", Authorization, Token Handling; Security Best Practices, Token Passthrough).

#### Tokens kept { #http-auth-cache }

- Client credentials: one token per sign-in setting, shared by every caller, until 30 s before it
  expires (`expires_in`).
- Token exchange: one token per person, client and scopes (a token got through a broad client never
  serves a restricted one), until the first of: 30 s before it expires, the person's own token
  expires, `maxAgeSeconds`.
- One token request per key at a time, shared by all who wait for it; a failed request is kept 5 s;
  at most 1000 tokens per process, the oldest out first. Tokens stay in memory only.
- A backend that answers 401 makes pivotkit drop the token it sent and ask once more with a new one.
- The token endpoint's answer must hold an `access_token` of `token_type` Bearer (for a token
  exchange also `N_A` with an access token as `issued_token_type`); an `expires_in` that is missing
  or outside 1 to 86400 counts as 60 s. When the token is a JWT, its `aud` is compared with the
  requested `audience`, and a difference is logged as a warning.

#### When the sign-in fails { #http-auth-errors }

| What happened | Caller gets | `retryable` |
| --- | --- | --- |
| The token endpoint refused (4xx), e.g. `invalid_client`, `invalid_grant` | `SOURCE_UNAVAILABLE` "the source's backend refused pivotkit's access; ..." | false |
| A secret is missing, the token endpoint cannot be reached by its address rules, its answer holds no bearer token | `SOURCE_UNAVAILABLE` "the source is not set up correctly; ..." | false |
| The token endpoint failed (5xx, 429), its own time limit (10 s), a network error | `SOURCE_UNAVAILABLE` "the source is not available right now; ..." | false |
| The source's `timeMs` ended while pivotkit still waited for a token | `SOURCE_UNAVAILABLE` "the source is not available right now; ...", or the same caller's last good data with `stale` | true |

Last good data never stands in after a refused or failed token request (it drops what was kept).
When the source's `timeMs` ends first, the source's time limit answers as for any slow load. A
failed token request is kept 5 s: calls in that time get the same answer without a new request (the
log has an info line "token request failed (cached)" with each call's request id). A secret that
cannot be read is a warning in the log when the server starts, and a warning about the sign-in's
settings is logged at most once a minute, not on every call.

A backend that answers 401 to a source with parameters gives the caller `DATA_NOT_AVAILABLE`
("nothing you may see for ..."), the same answer as for a value it does not know, so a wrong secret
looks like an empty answer to the caller: look at the log's warning first. With a header sign-in
the warning names the secret behind it. The log names the token endpoint's status and
its RFC 6749 `error` code only (`error_description` is dropped), and a missing secret by its
reference; never a secret or a token.

#### Parameters bound to a claim { #http-claims }

A backend without rights per person can still serve each person their own rows: a parameter with
`claim` is filled from that claim of the caller's verified token, never from the caller. It works
for HTTP and code sources and needs `auth.mode: "oauth"`.

```json
"params": {
  "customer": { "type": "string", "required": true, "claim": "customer", "pattern": "^[a-z0-9-]{1,40}$" }
}
```

- A text parameter bound to a claim needs a `pattern` or an `enum`; the claim's value is checked as
  a caller's value is (texts, numbers and booleans only), and a value with `/`, `\`, `..`, `%`, `?`,
  a line break or one outside the pattern is refused (`NOT_ALLOWED`) before anything is sent.
- `claim: "email"` takes the email only when the token's `email_verified` is `true`.
- `list_sources` does not offer the parameter, a caller that sends it gets `INVALID_INPUT` ("params.customer
  is set by the server from your sign-in; leave it out"), and a token without the claim gets
  `NOT_ALLOWED` ("your sign-in has no customer claim, which the source vms needs; ask the
  operator"). The claim's value is never said back: a backend's 401, 403 or 404 names the caller's
  own values only.
- Only the claims a parameter names are read from a token; a code source sees them in
  `caller.claims` too. Claims are never logged.

A source with a token exchange or a claim is listed only for a signed-in person (with a subject),
and `draft_schedule` answers `NOT_SCHEDULABLE` for it (`schedulable: false` in `list_sources`): a
schedule runs later without a person signed in.

#### What the provider must allow { #http-auth-provider }

A token exchange makes pivotkit a deputy that asks for tokens on a person's behalf. Configure the
provider so it can do no more than this source needs:

- only pivotkit's client may exchange tokens, and it is a confidential client;
- only tokens whose audience is pivotkit's own resource can be exchanged;
- only for the named audience (the backend), with the narrowest scopes.

The settings below were checked against the providers' documentation in November 2026; check the
current documentation of your provider's version, as these settings change.

=== "Authentik: client credentials with a service account token"

    Authentik's OAuth2 provider takes a JWT as `client_assertion` in a client credentials request
    when the JWT is signed by a source listed under **Federated OIDC Sources** of the provider: an
    OAuth source configured with the Kubernetes API server's OpenID configuration URL or its JWKS.
    Authentik then issues a token for a service account named after the provider and the JWT's `sub`
    (Authentik documentation, "Client credentials").

    ```json
    "httpSources": {
      "backends": {
        "platform": {
          "url": "https://platform.example.com/api",
          "auth": { "clientCredentials": {
            "tokenUrl": "https://auth.example.com/application/o/token/",
            "clientId": "pivotkit-backend",
            "assertion": { "file": "/var/run/secrets/tokens/pivotkit" } } }
        }
      }
    }
    ```

    The token file is the pod's service account token, for example a projected
    `serviceAccountToken` volume. Such files are usually readable by group and others (Kubernetes'
    default mode for a projected volume is 0644), so `check-config`'s warning about a secret file
    other users can read is expected there; the pod has no other users.

    With the provider's client secret instead, Authentik issues the token for a service account it
    makes itself, `ak-<provider name>-client_credentials`; scopes the backend needs come from scope
    mappings on the provider, asked for in `scope` (Authentik documentation, "Client credentials").
    Authentik's page shows the secret sent in the form body; pivotkit sends it as HTTP Basic
    credentials (`client_secret_basic`), so check that your Authentik version takes those.

    ```json
    "auth": { "clientCredentials": {
      "tokenUrl": "https://auth.example.com/application/o/token/",
      "clientId": "pivotkit-backend",
      "clientSecret": { "file": "secrets/backend-secret" },
      "scope": "platform:read" } }
    ```

=== "Keycloak: token exchange"

    Keycloak's standard token exchange: switch on **Standard token exchange** on pivotkit's client,
    which must be confidential and in the same realm as the backend's client. The person's token must
    hold both pivotkit's resource, which pivotkit checks (`auth.resource`, put there by the audience
    mapper of the [Keycloak sign-in](mcp.md#oauth)), and pivotkit's client id, since Keycloak
    exchanges a token only for a client in its `aud` (a second audience mapper); the `audience` is
    the backend's client id, and Keycloak does
    not take the `resource` parameter (Keycloak documentation, "Configuring and using token
    exchange"). Without `tokenUrl`, pivotkit takes the token endpoint from the metadata of
    `auth.issuer` (the realm).

    ```json
    "auth": { "tokenExchange": {
      "audience": "platform-api",
      "scope": "platform:read",
      "clientId": "pivotkit",
      "clientSecret": { "file": "secrets/pivotkit-client-secret" } } }
    ```

### Kept data { #http-cache }

As for [code sources](#code-cache): data is kept per caller (the person, a static token's name, or
`local`) and set of values for `ttl` seconds; calls that need the same data while it loads share one
load, and a caller that goes away stops waiting (the requests are cancelled when nobody waits any
more); at most 4 loads of one source and 2 of one person run at once; last good data stands in only
after a transient failure, with `stale: { since }`, and a refusal drops it. A load aborted because
every caller went away keeps nothing: the next call loads again. A caller without an identity (an
OAuth token without a usable subject) gets nothing kept and shares no load. For a source with a
token exchange or a claim, the data is kept per person, client and scopes, as its token is.

### check-config and check-source { #check-source }

`check-config` prints each HTTP source without calling its backend:

```text
HTTP sources (1):
  vms: backend platform (https://api.example.com/v1) /customers/{customer}/vms?state={state}&limit=..., rows at /items, next page at /next, up to 10 pages / 20 MiB / 15 s, kept 300 s per caller, last good data up to 3600 s; links: create_link makes none (no sources.<id>.link); schedules: draft_schedule drafts them with the caller's params
    params: customer (string, pattern, required), state (running|stopped)
    backend auth: client credentials as pivotkit-backend (secret from a file) at https://auth.example.com/application/o/token/, scope platform:read (httpSources.backends.platform)
```

The `backend auth` line says how the sign-in is made and where its secrets come from (a variable's
name, "a file"), never a value or its length. A variable that is not set or a file that cannot be
read is a `PROBLEM`; a secret file other users of the machine can read is a warning, as are a token
endpoint on a loopback or private address without `intranet: true`, and a token exchange's
`tokenUrl` on another host than `auth.issuer` (the person's token goes there).

`pivotkit-server check-source <id> [--param name=value ...] [--config file]` (the id and the
options in any order) loads a source once as the server would, without an AI client, and prints
each page's status, content type and size, the rows, the fields with their types, when the data is
from and what a caller would get when it fails, with the operator's hint where there is one: the
`--param` to re-run with when a required value is missing, the secret behind `http.auth` (its
variable or file, never the value) or where to set one when the backend answers 401 or 403,
`intranet` for a private address, `NODE_EXTRA_CA_CERTS` for a certificate (and, when it is set,
that its file holds no authority that signed the backend's certificate). On success the last line
names the values it loaded with (`OK with customer=acme`). Exit 1 when the load fails, 2 when the
id names no HTTP source (or the command line is wrong). It
prints no cell value and no secret: each value in the address is `{name}` and each literal query
value `...`. Field names, and the keys where the rows' pointer finds no list, are printed: they can
be data of the backend's, so treat the output as you treat the backend's answers. A load without
rows prints a warning. With a sign-in, it prints the token endpoint's status, its error code, the
scope it granted and `expires_in` (never a token). A token exchange needs a person's token, which a
command line does not have: `check-source` asks the token endpoint with the client's credentials
only, says whether it answers and takes the client, and does not load the source. A `--param` for a
parameter bound to a claim stands in for the sign-in's claim. It uses the same configuration, address rules and limits as the server:

```text
$ pivotkit-server check-source vms --param customer=acme --config pivotkit.json
source vms: GET https://api.example.com/v1/customers/{customer}/vms?state={state}&limit=...
  page 1: 200 application/json, 18342 bytes
  1 page, 18342 bytes, 42 rows, 180 ms
  fields: name (text), cpu (number), state (text), owner (text), tags (text)
  data as of 2026-11-15T08:00:00Z (from the body)
OK with customer=acme
```

With a pointer that matches nothing:

```text
source vms: GET https://api.example.com/v1/customers/{customer}/vms?state={state}&limit=...
  page 1: 200 application/json, 18342 bytes
  pointer /items matched nothing; the body has the keys: results, next
  a caller gets: SOURCE_UNAVAILABLE: the source is not set up correctly; ask the operator and give the request id
FAILED
```

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

The example compiles with strict TypeScript: pivotkit-server's types give `load` a `caller` of type
`SourceCaller` (and `null` with `cacheShared: true`), and export `SourceCaller`, `SourceLoad`,
`SharedSourceLoad`, `SourceVersion`, `LoadResult` and `SourceParams` for your own functions.

### Options { #code-options }

| Key | Default | Meaning |
| --- | --- | --- |
| `sources.<id>.load` | - | `load(params, { caller, signal })`: the data (see below) |
| `sources.<id>.version` | none | `version(params, { caller })`: a value (not a promise) that changes when the data changes; kept data is reused while it is the same. It is called at once on every call, never awaited, so keep it cheap |
| `sources.<id>.params` | none | The values a caller passes with the source ([parameters](mcp.md#configuration)); a parameter with `claim` is filled from the signed-in person's token instead ([claims](#http-claims)) |
| `sources.<id>.timeMs` | 30000 ms | The longest `load` may take, at most 600000 (ten minutes); the signal is aborted then |
| `sources.<id>.ttl` | none (only `version` decides) | Seconds a load is reused; `0` only shares loads that run at the same time |
| `sources.<id>.maxStale` | 3600 s | How old the last good data may be to stand in after a transient failure; `0` turns it off |
| `sources.<id>.cacheShared` | `false` | The data is the same for every caller: one copy for all, and `load` gets `caller: null` |

`checkConfig` lists each code source: its time limit, how its data is kept, and whether last good
data may stand in. It checks the options first as `createContext` does, so it throws the same
`ConfigError` for options the server would refuse:

```js
import { checkConfig } from "pivotkit-server";

const { text, problems } = await checkConfig(options, { name: "my-app" });  // name: the first line's
console.log(text);                                                           // (default "pivotkit-mcp")
```

### What load gets and returns { #code-load }

- `params`: the caller's values, checked and written again by pivotkit (`{}` when the source
  declares none). A source without `params` refuses any.
- `caller`: a frozen copy of who calls, without any token: `client` (a token's name or an OAuth
  client id), `profile`, `scopes` (a list, or `null` for every scope), `groups`, `claims` (only those
  the configuration names), and with OAuth `subject` and `issuer` (else `null`). With
  `cacheShared: true` it is `null`, so a source that reads it there fails at once instead of
  serving one person's rows to everyone.
- `signal`: an `AbortSignal` that is aborted after `timeMs` (with a `TimeoutError`), or when every
  caller waiting for this load went away (a REST request or an MCP call over HTTP whose connection
  closed). Pass it to `fetch` and your database client. A load that
  ignores it runs on in the background and keeps its slot (see the load limits) until it ends; after
  twice `timeMs` the log warns once. A load that never ends holds its slot until the process
  restarts.

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

`new SourceError(code, { publicMessage, transient, status, retryAfter, reason })`: `publicMessage` is the
only text of yours that reaches a caller (cleaned of control characters, at most 300 characters; a
502 always says one of pivotkit's fixed texts). For `SOURCE_UNAVAILABLE` only: `transient: true` says the
failure may pass, `status` (a backend's HTTP status, also for the log) of 429, 502, 503 or 504 makes
it transient unless `transient` says otherwise, `retryAfter` (whole seconds) becomes the answer's
`Retry-After`, and `reason` picks pivotkit's text: `"refused"` ("the source's backend refused
pivotkit's access; ask the operator ..."), `"setup"` ("the source is not set up correctly; ask the
operator ..."), or none ("the source is not available right now; ..."). A refusal (`NOT_ALLOWED`, `INVALID_INPUT`, `DATA_NOT_AVAILABLE`) is never transient.
Without `publicMessage`, the code's own words are used.

Anything else `load` throws, an `OperationError` of pivotkit's own codes too, answers
`SOURCE_UNAVAILABLE` with `retryable: false` and the fixed text; its class is logged, its message
only with `log: "debug"`. A network error that may pass (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`,
`ENOTFOUND`, `EAI_AGAIN`, undici's socket and timeout errors, also as the `cause` of `fetch`'s
error) answers `SOURCE_UNAVAILABLE` with `retryable: true`. An error your code throws while pivotkit
reads the returned rows (a getter), or a `version` that returns a promise, is `SOURCE_UNAVAILABLE`
too. pivotkit reads your rows once into plain values (getters and `toJSON` run then); objects in
cells are written as JSON text, and every text is cut at `limits.textLength`.

### Kept data, coalescing and last good data { #code-cache }

- **Per caller.** Loaded data is kept per caller: the person (with OAuth `subject` and `issuer`, a
  static token's name, or `local`), with the client, its scopes, the groups and the claims, the
  values of `params` and the caller's policy levels. A caller without an identity (an OAuth token
  without a usable subject) gets nothing kept, shares no load and gets no last good data. With
  `cacheShared: true` all callers share one copy per set of values and policy levels.
- **Reuse.** Kept data is reused while `version` gives the same value (and within `ttl` when both
  are set), or for `ttl` seconds without `version`. Without either, every call loads. `ttl` counts
  from when the load ended.
- **Coalescing.** Calls that need the same data while it loads wait for that one load. A caller that
  goes away stops waiting; the load is aborted only when every caller waiting for it went away, and
  that is no failure of the source (nothing kept is dropped).
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
  `stale: { since }` (when its load ended); `render_view`'s message says "The data is from ...: the
  source could not be refreshed.", and the log has a warning with the source's id. Any other failure
  answers at once and drops what was kept for that caller and values, so a withdrawn access is never
  covered by the cache.
- **Bounds.** The process keeps at most 64 loads and 256 MiB of encoded data; one person (a shared
  source counts as one) at most 8 loads and a quarter of the bytes, and a person's new load pushes
  out that person's oldest first, so one caller cannot push out everyone else's data. Otherwise the
  least recently used go first. Kept data stays in the process's memory until it is pushed out,
  also after `maxStale` has passed.

### Where it runs { #code-thread }

`load` and the operation over its data run in the host's thread, not in a worker. `timeMs` bounds
`load`; the computation after it is not bounded by `compute.timeMs`, so keep the data a code source
returns to what a report needs.

A code source is your code: pivotkit hands it a frozen copy of the caller and never a token, which
guards against mistakes, not against code that means harm.
