---
title: Data sources
description: The kinds of data source pivotkit-server and pivotkit-mcp read - files, HTTP sources the operator configures with typed parameters, and code sources of a library host, with a time limit, coalescing, kept data and last good data.
---

# Data sources

A source is what a caller names with `source`. It is one of these:

- an id the operator configured under `sources`
- a `file:` path inside `files.allowDirs`
- `inline:`, a table the caller sends with the request ([MCP](mcp.md#data), [REST](rest.md#data)).
  No exposure policy applies to it.

A configured source is one of these kinds:

| Kind | Configured with | Where it is read |
| --- | --- | --- |
| File | `file`: a CSV, TSV, TXT, JSON or XLSX file | In a worker thread, with the file limits ([options](mcp.md#configuration)) |
| HTTP | `http`: an operator's backend, its address with typed parameters | Requested in the server's thread, a JSON answer parsed there, a CSV answer in a worker; computed in a worker; see [HTTP sources](#http) |
| Code | `load`: a function of a library host | Loaded in the host's thread, computed in a worker; see [Code sources](#code) |

Every kind has the same exposure policy, scopes and field descriptions, and its results carry
`dataAsOf` ([pivotkit-mcp](mcp.md), [REST](rest.md)).

A person may read the rows of any kind of source where a profile names it in `records`
([rows route](rest.md#records)). `sources.<id>.records.maxRows` gives one source a lower row limit
than `rest.records.maxRows`. It cannot be higher.

## HTTP sources { #http }

An HTTP source asks an operator's backend for its rows. You write the address once in the
configuration. A parameter in braces marks where a caller's value goes. A caller, such as a model or a
program, passes only the values. pivotkit checks them against their declared type, pattern or list
before it sends anything. A caller never gives an address. When the API has an OpenAPI document,
[`source-from-openapi`](#openapi) proposes the block for one of its operations.

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

A call with `"params": { "customer": "acme", "state": "running" }` does this:

1. It requests `https://api.example.com/v1/customers/acme/vms?state=running&limit=500`.
2. It follows the `next` pages.
3. It reads the rows at `/items` of each answer.

`list_sources` names the parameters with their type, description, example, list of values, pattern,
format, lengths and range.

A call without a required parameter answers `INVALID_INPUT`. The message names the parameter and
how to call again: "the source vms needs params.customer (The customer's short name,
for example acme); re-run with params.customer=acme". On the command line it says `--param
customer=acme`.

A value of the wrong form is refused. The message gives the parameter's description, its example
and, when short, its pattern in one parenthesis: "params.customer is not in the expected form (The
customer's short name, for example acme; pattern ^[a-z0-9-]{1,40}$)".

A value must have the parameter's type. pivotkit refuses a number for a `string` parameter, and a
text with lone surrogates. The fields of a source with required parameters are known only after a
load with values, so `describe_source` needs the values too.

A link from `create_link` carries only the parameters in `sources.<id>.linkParams`. Their values go
into the query string of the source's page ([link parameters](../concepts/sharing.md#link-params)).

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
| `sources.<id>.linkParams` | none | The parameters a link from `create_link` may carry, in the page's query string ([link parameters](../concepts/sharing.md#link-params)) |
| `sources.<id>.timeMs` | 15000 ms | All pages of one load, at most 600000 |
| `sources.<id>.ttl` | 60 s | Seconds a load is reused for the same caller and values; `0` only shares loads that run at the same time |
| `sources.<id>.maxStale` | 3600 s | How old the last good data may be to stand in after a transient failure; `0` turns it off |

An HTTP source's policy needs a `default` that is not `show`, under the server's policy and every
profile. Otherwise the server does not start. The reason: a field the backend adds later would be
shown without anyone deciding. Set `policy.default` to `hide` and list the fields to show.

A backend's sign-in goes to `http.auth`, never to `http.headers`. Its secret is a reference to a
variable or a file ([backend sign-in](#http-auth)). `check-config` warns about a header with a
literal value whose name looks like a secret's: `key`, `token`, `secret`, `auth`, `pass`. Everyone
who can read the configuration file reads that value too.

### The address { #http-address }

- The address is `https://` only. It has no user name or password, no fragment and no `?`. Query
  values go to `query`.
- An expression is allowed in the path only, never in the host or the port. Otherwise the message is
  "expressions in the URL are allowed in the path only; for a query value use http.query".
- A path segment holds at most one `{name}`. Text around it is allowed (`{id}.json`, `v{version}`).
  Each `{name}` names a declared parameter. A parameter in the path must be `required` or have a
  `default`. A segment `.` or `..`, also percent-encoded, is refused.
- pivotkit encodes a value as RFC 6570 simple string expansion. It percent-encodes everything but
  letters, digits, `-`, `.`, `_` and `~`. So `/`, `?`, `#`, `&`, `=`, `+`, `;` and a space (`%20`)
  stay inside their segment or value.
- pivotkit writes numbers and booleans itself, never as the caller typed them.
- The address must keep the template's host and its number of path segments. No value may make a
  segment empty, `.` or `..`.
- A `string` parameter without `pattern` or `enum` takes letters, digits and `. _ ~ -` only, because
  some backends decode `%2F` before they route. No value may hold `..` or a control character.
- A `pattern` matches the whole value: it is anchored. pivotkit refuses at start a pattern that can
  take long on some values.
- Write no secret into the address or `query`. The configuration file holds them in plain text. A
  backend's sign-in goes to [`http.auth`](#http-auth). The log and `check-source` write each literal
  query value as `...`, but the path as it is.
- Callers see a parameter's `description`, `example`, `enum`, `pattern`, `format`, lengths and
  range, in `list_sources` and in the message of a refused value. Write no internal names or secrets
  there.
- Each query name appears once, without regard to case. A name the paging fills cannot also be a
  parameter or a query value. `check-config` warns about a parameter that no part of the address
  uses.

### Reading the answer { #http-rows }

- The server parses the body as JSON in its own thread. Each page is at most `maxBytes`. A body
  nested deeper than 64 levels, or one that is no JSON, answers `SOURCE_UNAVAILABLE`.
- The rows' pointer reads the body's own keys only.
- Rows are objects or lists. In objects, the keys are the fields, in the order first seen. In lists,
  the first list is the header.
- A value that is an object or a list becomes its JSON text. Texts are cut at `limits.textLength`.
- Field names lose control and direction characters. A name that repeats another without regard to
  case gets " (2)".
- The rows have the limits a file has: `limits.rows` (counted while paging), `limits.columns` and
  `limits.importCells`. Over them, the answer is `LIMIT_EXCEEDED`.
- A worker drops hidden fields before it encodes the data. The operation runs in that worker too.

### Paging { #http-paging }

| `paging` | The next page |
| --- | --- |
| `{ "next": "/next" }` | The address at this pointer of the body (absolute or relative); none, `null` or `""` ends |
| `{ "link": true }` | The `Link` header's `rel="next"` |
| `{ "page": "page", "start": 1 }` | The query parameter `page`, counted up from `start` until a page has no rows |
| `{ "offset": "from", "limit": "size", "size": 100 }` | `from` counted up by `size` (sent as `size`) until a page has fewer rows |

A `next` or `link` page must be on the same host and path as the page before, or the load fails.
Only its query may differ. A page named again ends the paging. pivotkit fills the names `page`,
`offset` and `limit` itself. They are never a parameter and never offered to a caller. A source
whose pages reach `maxPages` and still name a next page answers `LIMIT_EXCEEDED`.

### What a caller gets { #http-errors }

| Backend | Caller gets | `retryable` |
| --- | --- | --- |
| 2xx | the data | |
| 400, 422 | `INVALID_INPUT` "the backend did not accept these parameters" | false |
| 401, 403, 404 on a source with parameters | `DATA_NOT_AVAILABLE` (404) "nothing you may see for customer=xyz: check the value", one answer for all three so other customers' names cannot be probed | false |
| 401, 403 on a source without parameters | `SOURCE_UNAVAILABLE` "the source's backend refused this server's access; ask the operator and give the request id" | false |
| 404 on a source without parameters, a redirect, an address it may not reach, an answer the settings do not fit | `SOURCE_UNAVAILABLE` "the source is not set up correctly; ask the operator and give the request id" | false |
| 429, 502, 503, 504, a timeout, a network error | `SOURCE_UNAVAILABLE` "the source is not available right now; ...", `Retry-After` passed on | true |
| anything else | `SOURCE_UNAVAILABLE` | false |

The texts are pivotkit's, the same on REST and MCP. MCP adds the source's id and whether trying
again may work. Every error names the request id. A backend's body never reaches a caller or the
log.

The log has:

- the status, the address template and the source's id
- a warning with the failure's `cause` (`timeout`, `connection`, `tls`, `dns`, `blocked_address`,
  `http_status`, `bad_body`, `setup`), the backend's name, its status and the time it took
  ([operations](operations.md#lines))
- with `log: "debug"`, also each request's path with every value written as `{name}`, and why a
  request failed

### The network { #http-network }

Every request goes through the server's guarded fetch:

- `https://` only.
- It follows no redirect.
- It checks the address on the connection's own name lookup. A name that answers differently a
  second time cannot pass.
- It counts the body while it arrives.
- It refuses loopback and private addresses unless the backend is marked `intranet`.
- It always refuses link-local and cloud metadata addresses (169.254.0.0/16, `fd00:ec2::254`,
  `100.100.100.200` and others).

A request has its own connection and uses no proxy of the environment.

A backend whose certificate comes from an internal certificate authority needs that authority's
certificate in `NODE_EXTRA_CA_CERTS`. That is a file of PEM certificates, which the server reads when
it starts. The container image takes it as an environment variable too. On a certificate error,
`check-source` says so. When the variable is set, it says that its file holds no authority that
signed the backend's certificate.

The server holds each page's body in memory while it reads and parses it, up to `maxBytes` per load.
The rows of a kept load stay in memory for `ttl`, bounded as for code sources. Keep `maxBytes` near
what a source needs.

### Backend sign-in { #http-auth }

You configure a backend's sign-in in a source's `http.auth`, or in a backend's `auth` for all its
sources. A source's own sign-in wins. It is exactly one of three kinds.

A secret is always a reference: `{ "env": "NAME" }` or `{ "file": "path" }`, relative to the
configuration file. pivotkit reads it when it uses it, so a rotated file or variable works without a
restart.

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

    Microsoft Entra ID does not offer this exchange. Its per-person tokens need the On-Behalf-Of
    flow, which pivotkit does not speak yet
    ([#484](https://github.com/eizedev/pivotkit/issues/484), open for help). Until then, use a service
    account with client credentials.

| Key | Default | Meaning |
| --- | --- | --- |
| `header.name` | `authorization` | The header's name; not one the connection sets (`host`, `content-length`, ...), and not also a static header |
| `header.prefix` | none | Text before the secret, such as `Bearer ` |
| `header.value` | - | The secret reference |
| `clientCredentials.tokenUrl` | - | The token endpoint, `https://` |
| `clientCredentials.clientId` | - | pivotkit's client at the token endpoint |
| `clientCredentials.clientSecret` or `.assertion` | - | One of the two, as a secret reference |
| `clientCredentials.scope`, `.audience`, `.resource` | none | Sent with the token request |
| `tokenExchange.tokenUrl` | the `token_endpoint` of `auth.issuer`'s metadata | An `https://` address; the metadata's endpoint must be on the issuer's own origin. The metadata is read under the server's issuer rules: an issuer on a private address needs `auth.intranet: true` ([OAuth 2.1](mcp.md#oauth)) |
| `tokenExchange.clientId`, `.clientSecret` | - | pivotkit's confidential client (`client_secret_basic`) |
| `tokenExchange.audience` or `.resource` | - | The backend the exchanged token is for; at least one |
| `tokenExchange.scope` | none | The scopes asked for; ask for the narrowest |
| `tokenExchange.maxAgeSeconds` | 300 | The longest an exchanged token is reused, 1 to 86400 |
| `.intranet` (both OAuth kinds) | `false` | The token endpoint may be on a loopback or private address |

A token exchange needs `auth.mode: "oauth"` (see [sign-in](mcp.md#oauth)). With `auth.mode`
`token` or `none`, the server does not start with one.

A token exchange works only for a signed-in person: a caller whose token has a subject
(`auth.subjectClaim`). Two kinds of caller do not see the source: a caller whose token has no
subject, and a stdio session, which has no sign-in. For them the source is not listed and answers
`SOURCE_NOT_FOUND`. The log has an info line naming the source for the operator.

A header and client credentials work for every caller, also over stdio.

**The person's token goes to the token endpoint only.** pivotkit sends the caller's own access token
as `subject_token` to the token endpoint, and never to a backend or to an address taken from an
answer, as the MCP specification requires ("MCP servers MUST NOT accept or transit any other
tokens", Authorization, Token Handling; Security Best Practices, Token Passthrough).

#### Tokens kept { #http-auth-cache }

- Client credentials: one token per sign-in setting, shared by every caller. pivotkit keeps it
  until 30 s before it expires (`expires_in`).
- Token exchange: one token per person, client and scopes. A token got through a broad client never
  serves a restricted one. pivotkit keeps it until the first of these:
    - 30 s before it expires
    - the person's own token expires
    - `maxAgeSeconds`
- pivotkit sends one token request per key at a time. Everyone who waits for it shares it.
- pivotkit keeps a failed request for 5 s.
- A process keeps at most 1000 tokens, and the oldest goes out first. Tokens stay in memory only.
- When a backend answers 401, pivotkit drops the token it sent and asks once more with a new one.
- The token endpoint's answer must hold an `access_token` of `token_type` Bearer. For a token
  exchange, `N_A` with an access token as `issued_token_type` works too.
- An `expires_in` that is missing or outside 1 to 86400 counts as 60 s.
- When the token is a JWT, pivotkit compares its `aud` with the requested `audience` and logs a
  difference as a warning.

#### When the sign-in fails { #http-auth-errors }

| What happened | Caller gets | `retryable` |
| --- | --- | --- |
| The token endpoint refused (4xx), e.g. `invalid_client`, `invalid_grant` | `SOURCE_UNAVAILABLE` "the source's backend refused this server's access; ..." | false |
| A secret is missing, the token endpoint cannot be reached by its address rules, its answer holds no bearer token | `SOURCE_UNAVAILABLE` "the source is not set up correctly; ..." | false |
| The token endpoint failed (5xx, 429), its own time limit (10 s), a network error | `SOURCE_UNAVAILABLE` "the source is not available right now; ..." | false |
| The source's `timeMs` ended while pivotkit still waited for a token | `SOURCE_UNAVAILABLE` "the source is not available right now; ...", or the same caller's last good data with `stale` | true |

Last good data never stands in after a refused or failed token request. Such a request drops what
was kept. When the source's `timeMs` ends first, the source's time limit answers as for any slow
load.

pivotkit keeps a failed token request for 5 s. Calls in that time get the same answer without a new
request. The log has an info line "token request failed (cached)" with each call's request id.

A secret that cannot be read is a warning in the log when the server starts. pivotkit logs a warning
about the sign-in's settings at most once a minute, not on every call.

A backend that answers 401 to a source with parameters gives the caller `DATA_NOT_AVAILABLE`
("nothing you may see for ..."). That is the same answer as for a value the backend does not know.
So a wrong secret looks like an empty answer to the caller: look at the log's warning first. With a
header sign-in, the warning names the secret behind it.

The log names only the token endpoint's status and its RFC 6749 `error` code, and drops
`error_description`. It names a missing secret by its reference. It never names a secret or a
token.

#### Parameters bound to a claim { #http-claims }

A backend without rights per person can still serve each person their own rows. pivotkit fills a
parameter with `claim` from that claim of the caller's verified token, never from the caller. This
works for HTTP and code sources and needs `auth.mode: "oauth"`.

```json
"params": {
  "customer": { "type": "string", "required": true, "claim": "customer", "pattern": "^[a-z0-9-]{1,40}$" }
}
```

- A text parameter bound to a claim needs a `pattern` or an `enum`. pivotkit checks the claim's
  value as it checks a caller's value: texts, numbers and booleans only. It refuses a value with
  `/`, `\`, `..`, `%`, `?`, a line break or one outside the pattern (`NOT_ALLOWED`) before it sends
  anything.
- `claim: "email"` takes the email only when the token's `email_verified` is `true`.
- `list_sources` does not offer the parameter.
- A caller that sends it gets `INVALID_INPUT` ("params.customer
  is set by the server from your sign-in; leave it out").
- A token without the claim gets `NOT_ALLOWED` ("your sign-in has no customer claim, which the source vms needs; ask the
  operator").
- pivotkit never says the claim's value back. A backend's 401, 403 or 404 names the caller's own
  values only.
- pivotkit reads only the claims a parameter names from a token. A code source sees them in
  `caller.claims` too. Claims are never logged.

A source with a token exchange or a claim is listed only for a signed-in person, one with a subject.
`draft_schedule` answers `NOT_SCHEDULABLE` for it (`schedulable: false` in `list_sources`), because a
schedule runs later without a person signed in.

#### What the provider must allow { #http-auth-provider }

A token exchange makes pivotkit a deputy that asks for tokens on a person's behalf. Configure the
provider so it can do no more than this source needs:

- Only pivotkit's client may exchange tokens, and it is a confidential client.
- Only tokens whose audience is pivotkit's own resource can be exchanged.
- Tokens are exchanged only for the named audience (the backend), with the narrowest scopes.

The settings below were checked against the providers' documentation in November 2026. These
settings change, so check the current documentation of your provider's version.

=== "Authentik: client credentials with a service account token"

    Authentik's OAuth2 provider takes a JWT as `client_assertion` in a client credentials request.
    The JWT must be signed by a source listed under **Federated OIDC Sources** of the provider. That
    is an OAuth source configured with the Kubernetes API server's OpenID configuration URL or its
    JWKS. Authentik then issues a token for a service account named after the provider and the JWT's
    `sub` (Authentik documentation, "Client credentials").

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
    `serviceAccountToken` volume. Group and others can usually read such files: Kubernetes' default
    mode for a projected volume is 0644, so expect `check-config`'s warning about a secret file
    other users can read. The pod has no other users.

    With the provider's client secret instead, Authentik issues the token for a service account it
    makes itself, `ak-<provider name>-client_credentials`. The scopes the backend needs come from
    scope mappings on the provider. Ask for them in `scope` (Authentik documentation, "Client
    credentials"). Authentik's page shows the secret sent in the form body. pivotkit sends it as
    HTTP Basic credentials (`client_secret_basic`), so check that your Authentik version takes
    those.

    ```json
    "auth": { "clientCredentials": {
      "tokenUrl": "https://auth.example.com/application/o/token/",
      "clientId": "pivotkit-backend",
      "clientSecret": { "file": "secrets/backend-secret" },
      "scope": "platform:read" } }
    ```

=== "Authentik: token exchange"

    Authentik's page marks delegation (on-behalf-of) as available from version 2026.8 on. Check that
    your version offers the plain token exchange too. The steps follow Authentik's documentation,
    "[Token exchange](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/token_exchange/)":

    - pivotkit exchanges as a confidential client, with `clientSecret`. The provider of the
      [Authentik sign-in](../getting-started/kubernetes.md#oauth) is public. So create a second,
      confidential provider for the exchange, such as `pivotkit-backend`, and bind it to an
      application.
    - Under **Grant Types** of `pivotkit-backend`, select **Token exchange**.
    - Federate the providers on both sides, under **Federated OAuth2/OpenID Providers**:
        - `pivotkit-backend` lists only the sign-in provider, which issued the person's token.
          Authentik's page names no check of the person's token's audience.
        - The backend's provider lists `pivotkit-backend`. It must be bound to an application too.
    - The `audience` is the client ID of the backend's provider. Authentik then issues the token with
      that provider's issuer, signing key and scope mappings. The person must pass the policy
      bindings of the backend's application.
    - Leave out `resource`. Authentik rejects a request with `resource` with `invalid_target`.
    - Set `scope`. Without it, the issued token has no scopes. `check-config` warns about that.
    - Without `tokenUrl`, pivotkit takes the token endpoint from the metadata of `auth.issuer`.
      Authentik's token endpoint is a global path, `/application/o/token/`
      ([OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)).

    ```json
    "auth": { "tokenExchange": {
      "audience": "<the backend provider's client id>",
      "scope": "platform:read",
      "clientId": "pivotkit-backend",
      "clientSecret": { "file": "secrets/pivotkit-backend-secret" } } }
    ```

    Not verified: Authentik's page shows the client secret sent in the form body. pivotkit sends it
    as HTTP Basic credentials (`client_secret_basic`). `check-source` shows whether the token
    endpoint takes pivotkit's client.

=== "Keycloak: token exchange"

    Keycloak's standard token exchange works like this (Keycloak documentation, "Configuring and
    using token exchange"):

    - Switch on **Standard token exchange** on pivotkit's client. The client must be confidential
      and in the same realm as the backend's client.
    - The person's token must hold pivotkit's resource, which pivotkit checks (`auth.resource`).
      The audience mapper of the [Keycloak sign-in](mcp.md#oauth) puts it there.
    - The person's token must also hold pivotkit's client id, because Keycloak exchanges a token
      only for a client in its `aud`. A second audience mapper adds it.
    - The `audience` is the backend's client id. Keycloak does not take the `resource` parameter.
    - Without `tokenUrl`, pivotkit takes the token endpoint from the metadata of `auth.issuer` (the
      realm).

    ```json
    "auth": { "tokenExchange": {
      "audience": "platform-api",
      "scope": "platform:read",
      "clientId": "pivotkit",
      "clientSecret": { "file": "secrets/pivotkit-client-secret" } } }
    ```

### Kept data { #http-cache }

HTTP sources keep data as [code sources](#code-cache) do:

- pivotkit keeps data for `ttl` seconds per caller and set of values. The caller is the person, a
  static token's name, or `local`.
- Calls that need the same data while it loads share one load.
- A caller that goes away stops waiting. pivotkit cancels the requests when nobody waits any more.
- At most 4 loads of one source and 2 of one person run at once.
- Last good data stands in only after a transient failure, with `stale: { since }`. A refusal drops
  it.
- A load aborted because every caller went away keeps nothing. The next call loads again.
- A caller without an identity, an OAuth token without a usable subject, gets nothing kept and
  shares no load.
- For a source with a token exchange or a claim, pivotkit keeps the data per person, client and
  scopes, as it keeps the token.

pivotkit keeps an answer without the columns the caller's policy hides. A caller whose profile shows
more gets its own copy. It keeps a JSON answer's rows. It reads a CSV answer once in a worker into a
compact table and keeps that, as it keeps a [code source's](#code-thread) data. That read runs within
`compute.timeMs` and `compute.memoryMb`, after the source's `timeMs`. A kept answer goes to a worker
once. Later calls send its key only. The key holds the values and the caller only as a keyed
digest.

What a CSV answer takes in memory:

- The compact table holds each distinct text of a column once, as UTF-8. Each row takes a code of
  one, two or four bytes. Whole numbers take one, two or four bytes. Other numbers and dates take 8
  bytes.
- The table is about the size of the answer or smaller. Two examples:
    - A million rows of four columns with a distinct text in one (27.5 MB of CSV) take about 28 MB.
    - A million rows of eight small whole numbers (19 MB) take 8 MB.
- Packing costs the first call some time. For that million rows with a distinct text it takes
  about 1.2 s instead of 1.1 s, measured on a laptop. Later calls are as fast.
- The table counts against `sourceCache.maxMb` as a code source's table does (see
  [code sources](#code-cache)). pivotkit does not keep a table over a quarter of it. Then every call
  asks the backend again, and the log says so once an hour per source, naming `sourceCache.maxMb`.
- When reading the answer fails or waits too long (`BUSY`, `TIMEOUT`, `LIMIT_EXCEEDED`), pivotkit
  drops the answer. The next call asks the backend again. pivotkit never keeps the raw answer, which
  includes the hidden columns.
- For a caller without an identity, pivotkit keeps nothing. The answer goes straight to the worker
  that computes the call, and that worker drops the hidden columns.

### check-config and check-source { #check-source }

`check-config` prints each HTTP source without calling its backend:

```text
HTTP sources (1):
  vms: backend platform (https://api.example.com/v1)
    GET /customers/{customer}/vms?state={state}&limit=...
    rows at /items
    next page at /next
    up to 10 pages / 20 MiB / 15 s
    kept 300 s per caller
    last good data: up to 3600 s
    create_link: none (no sources.<id>.link)
    draft_schedule: drafts with the caller's params
    params: customer (string, pattern, required), state (running|stopped)
    backend authentication: client credentials as pivotkit-backend at
        https://auth.example.com/application/o/token/, scope platform:read
        (httpSources.backends.platform.auth)
      client secret from the file secrets/backend-secret
          (/etc/pivotkit/secrets/backend-secret)
```

The `backend authentication` lines say how the sign-in works and where its secrets come from: a
variable's name, or a file as written and with its full path. They never show a value or its
length.

A variable that is not set, or a file that cannot be read, is a `PROBLEM`. The server still starts.
The sources that use it answer `SOURCE_UNAVAILABLE` until it is there.

`check-config` warns about:

- a secret file other users of the machine can read, on Linux and macOS (Windows has no such modes)
- a token endpoint on a loopback or private address without `intranet: true`
- a token exchange's `tokenUrl` on another host than `auth.issuer`, since the person's token goes
  there
- a token exchange without `scope`, since some providers, Authentik among them, then issue a token
  without scopes
- a backend's `auth` that no source uses, because each source has its own `http.auth`

In the `Sources` and profile lines, an HTTP source's fields are known only after a load
([reading check-config](rest.md#check-config)).

`pivotkit-server check-source <id> [--param name=value ...] [--config file]` loads a source once as
the server would, without an AI client. The id and the options go in any order. It prints:

- each page's status, content type and size
- the rows and the fields with their types
- when the data is from
- what a caller would get when it fails

Where there is one, it adds the operator's hint:

- the `--param` to re-run with when a required value is missing or a value is refused. It fills in
  the declared example, else `<value>`.
- when the backend answers 401 or 403: the secret behind `http.auth` (its variable or file, never
  the value), or where to set one
- `intranet` for a private address
- `NODE_EXTRA_CA_CERTS` for a certificate. When the variable is set, it says that its file holds no
  authority that signed the backend's certificate.

On success, the last line names the values it loaded with (`OK with customer=acme`). It exits 1 when
the load fails. It exits 2 when the id names no HTTP source, or when the command line is wrong.

It prints no cell value and no secret. Each value in the address is `{name}`, and each literal query
value is `...`. It prints field names, and the keys where the rows' pointer finds no list. These can
be the backend's data, so treat the output as you treat the backend's answers. A load without rows
prints a warning.

With a sign-in, it prints the token endpoint's status, its error code, the scope it granted and
`expires_in`. It never prints a token. A token exchange needs a person's token, which a command line
does not have. For a token exchange, `check-source` asks the token endpoint with the client's
credentials only. It says whether the endpoint answers and takes the client, and does not load the
source. A `--param` for a parameter bound to a claim stands in for the sign-in's claim.

`check-source` uses the same configuration, address rules and limits as the server:

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

### Options { #code-options }

| Key | Default | Meaning |
| --- | --- | --- |
| `sources.<id>.load` | - | `load(params, { caller, signal })`: the data (see below) |
| `sources.<id>.version` | none | `version(params, { caller })`: a value (not a promise) that changes when the data changes; kept data is reused while it is the same. It is called at once on every call, never awaited, so keep it cheap |
| `sources.<id>.params` | none | The values a caller passes with the source ([parameters](mcp.md#configuration)); a parameter with `claim` is filled from the signed-in person's token instead ([claims](#http-claims)) |
| `sources.<id>.linkParams` | none | The parameters a link from `create_link` may carry, in the page's query string ([link parameters](../concepts/sharing.md#link-params)) |
| `sources.<id>.timeMs` | 30000 ms | The longest `load` may take, at most 600000 (ten minutes); the signal is aborted then |
| `sources.<id>.ttl` | none (only `version` decides) | Seconds a load is reused; `0` only shares loads that run at the same time |
| `sources.<id>.maxStale` | 3600 s | How old the last good data may be to stand in after a transient failure; `0` turns it off |
| `sources.<id>.cacheShared` | `false` | The data is the same for every caller: one copy for all, and `load` gets `caller: null` |
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

### What load gets and returns { #code-load }

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

### Errors { #code-errors }

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

### Kept data, coalescing and last good data { #code-cache }

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

### Where it runs { #code-thread }

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

## HTTP sources from an OpenAPI document { #openapi }

`pivotkit-server source-from-openapi` reads an API's OpenAPI document. It proposes the
configuration of an HTTP source for one of its GET operations:

- the address with its parameters
- the parameters' types and descriptions
- where the rows are
- the fields' descriptions

You review the result, fill in what it leaves to you and add it to your configuration. The command
is for you at the command line. The server never reads the document.

```text
pivotkit-server source-from-openapi <file or https URL> --operation <operationId | "GET /path"> [--id <source id>] [--backend <name>]
```

`--operation` names the operation by its `operationId`. For a document without them, it names the
method and path as the document writes it (`--operation "GET /pet/{petId}"`). An unknown name lists
the document's GET operations in both forms.

The command prints the block as JSON on stdout. On stderr it prints what you must still check and
decide. It exits 0 when it wrote a block. It exits 2 on a usage error, a document it does not read,
or an operation that cannot be a source.

- `--id` names the source. The default is the `operationId`, else the path: `pet-petId`.
- `--backend` names the backend. The default is the document's `info.title` in lower case with `-`,
  else `api`.

`pivotkit-server source-from-openapi --help` lists the options.

With the public Swagger Petstore (OpenAPI 3) document:

```text
$ pivotkit-server source-from-openapi https://petstore3.swagger.io/api/v3/openapi.json --operation findPetsByStatus --backend petstore > petstore.json
```

```json
{
  "httpSources": {
    "backends": {
      "petstore": {
        "url": "TODO: https://... (the document names the relative address /api/v3, which is https://petstore3.swagger.io/api/v3 from the document's address; check it)"
      }
    }
  },
  "sources": {
    "findPetsByStatus": {
      "title": "Finds Pets by status.",
      "description": "Multiple status values can be provided with comma separated strings.",
      "http": {
        "backend": "petstore",
        "path": "/pet/findByStatus",
        "query": {
          "status": "{status}"
        },
        "rows": ""
      },
      "params": {
        "status": {
          "type": "string",
          "required": true,
          "description": "Status values that need to be considered for filter",
          "enum": [
            "available",
            "pending",
            "sold"
          ]
        }
      },
      "fields": {
        "status": {
          "description": "pet status in the store"
        }
      },
      "policy": {
        "default": "hide",
        "fields": {
          "id": "hide",
          "name": "hide",
          "category": "hide",
          "photoUrls": "hide",
          "tags": "hide",
          "status": "hide"
        }
      }
    }
  }
}
```

```text
The API host comes from the document; check it before adding credentials.

Still to decide: 1 value says TODO, and the server refuses the configuration until none does:
  httpSources.backends.petstore.url: TODO: https://... (the document names the relative address /api/v3, which is https://petstore3.swagger.io/api/v3 from the document's address; check it)

Notes:
  - The document's sign-in is not one pivotkit writes for you (petstore_auth: OAuth for people, not client credentials): configure the backend's auth by hand (https://pivotkit.eize.dev/reference/sources/#http-auth); for each person's own access, use tokenExchange.
  - The query parameter "status"'s explode is left out: it makes no difference for a single value.
  - Every field is hidden (sources.findPetsByStatus.policy): set the ones a caller may see to "show", "values" or "summary".

Review these as text the model will read:
  sources.findPetsByStatus.title: "Finds Pets by status."
  sources.findPetsByStatus.description: "Multiple status values can be provided with comma separated strings."
  sources.findPetsByStatus.params.status.description: "Status values that need to be considered for filter"
  sources.findPetsByStatus.params.status.enum: "available, pending, sold"
  sources.findPetsByStatus.fields.status.description: "pet status in the store"

Add the block to your configuration, fill in every TODO, then run pivotkit-server check-config and check-source findPetsByStatus. Docs: https://pivotkit.eize.dev/reference/sources/#openapi
```

The document names its server as `/api/v3`, an address relative to the document's own, so the TODO
names both. Its sign-in is OAuth for people (an implicit flow). The command does not write that. You
configure a token exchange or another backend auth yourself.

### What it reads { #openapi-input }

- **OpenAPI 3.0 or 3.1 in JSON** (`"openapi": "3.1.0"`, also `"3.1"`), at most 5 MiB and 128
  levels deep. The command refuses a YAML document and says how to convert it, for example
  `npx js-yaml openapi.yaml > openapi.json`. js-yaml's command writes a YAML file as JSON. The
  command refuses Swagger 2.0. Convert it to OpenAPI 3 first.
- **A file, or an `https://` URL.** The command fetches a URL once, within 10 seconds and without
  credentials. It uses the guarded fetch of HTTP sources: no redirects, no cloud metadata or
  link-local addresses, and the size limit while it streams. You name the address yourself, so a
  private address is allowed here without `intranet`. For a document behind a sign-in or on plain
  `http://`, download it and pass the file.
- **Local references only.** The command follows `$ref` values that start with `#/`, with these
  limits:
    - own properties only
    - at most 32 in a chain
    - `allOf` at most 8 deep, merging at most 1,000 properties. Each schema is merged once per
      depth, however often it is referenced.
    - one budget of 100,000 nodes for the whole run. Every property read counts against it.
    - finding the operation has a budget of its own, about 200,000 paths.

    A document over a limit is refused, or shortened with a note, quickly. The command never fetches
    a reference to another file or address (`file:`, `https:`, `http://169.254.169.254/...`). It
    names it in a note and goes on without it. It names a circular reference the same way.

### What it writes { #openapi-output }

| From the document | In the block |
| --- | --- |
| The server address (`servers`, the operation's or path's first) | The backend's `url`, as a `TODO` that names the address without a user name, password, query or fragment; an address with variables as written with their defaults (`https://{region}.example.com (region=eu)`); a relative address with what it is relative to the document's URL |
| A server on a private address (a loopback or private IP address, `localhost`, a name of one label or ending in `.local`, `.lan`, `.internal`, `.intranet`, `.corp`, `.home`, `.home.arpa`, `.localdomain`) | A note that the backend needs `intranet: true`; the block does not set it (no name is looked up). A link-local, unspecified or metadata IP address (169.254.0.0/16, fe80::/10, 0.0.0.0, a cloud's metadata address) gets a note that the server refuses it even with `intranet` |
| The operation's path | `http.path`, with each path parameter as `{name}`; a path over 2,000 characters or with an empty segment refuses the operation |
| Path parameters | Required `params` |
| Query parameters | `params` and `http.query`; `required` is kept |
| A parameter's `type`, `enum`, `minLength`, `maxLength`, `minimum`, `maximum`, `format: date`, `description`, `example` | The same keys of the parameter, as far as the server accepts them (an `example` outside the safe characters, a `maxLength` over 256 or an `enum` of more than 100 values is left out or capped, with a note) |
| A parameter's `pattern` | Never copied: a document's regular expression could take very long on a caller's value; a text parameter without a pattern takes letters, digits and `. _ ~ -` only. Write your own pattern where values need more |
| A name that is no parameter's name (`created-after`, `filter[name]`) | The parameter `created_after`, `filter_name`; the query keeps the document's name |
| Header and cookie parameters, array and object values, a `style` or `allowReserved` | Left out, with a note (a path parameter like that refuses the operation) |
| A JSON answer (the first 2xx) that is a list | `http.rows: ""` |
| An object with exactly one list | `http.rows` pointing at it (`/items`) |
| The object's one property in `date-time` format, else its one property named like a time (`generatedAt`, `updated_at`, `timestamp`, ...; a text or a number) | `http.asOf` pointing at it, with a note; two of a kind give none and a note |
| Any other answer | `http.rows` as a `TODO` |
| A `text/csv` answer | `http.format: "csv"` |
| The row's properties | `fields.<name>.description` where the document describes them, and every property in `policy.fields` as `hide`, under `policy.default: "hide"` |
| The operation's `summary` and `description` | The source's `title` and `description` |
| The security scheme | A skeleton of the backend's [sign-in](#http-auth), see below |

Descriptions and other texts lose control characters, terminal escape sequences, bidi controls and
other invisible characters. The joiners an emoji needs stay. Line breaks become spaces. Texts are
cut at 500 characters, a title at 200.

The model reads these texts through `list_sources` and `describe_source`. An API's documentation can
hold instructions meant for a model. So the command prints each text under "Review these as text the
model will read".

Some parameters keep no example and no list of values, and a note names each one:

- a parameter whose name looks like a credential's: `key`, `token`, `secret`, `auth`, `pass`
- a parameter whose example or values look like a credential:
    - a known token prefix such as `sk-`, `ghp_`, `hf_`, `xoxb-`, `AKIA`, `AIza`, `ya29.` or `SG.`
      followed by at least 16 token characters
    - a JWT
    - 32 or more token characters with letters and digits that are no UUID

The command leaves out a query parameter in which the document's own security scheme sends an API
key. A credential never comes from a caller.

The command takes the sign-in from the operation's `security`, else from the document's. It uses the
first alternative of one scheme that maps:

| Security scheme | Backend auth |
| --- | --- |
| `apiKey` in a header | `header` with the header's name (listed for review; `Cookie`, `Authorization`, `Origin`, `Referer` or a header of the connection becomes a `TODO`) and `value: { "env": "TODO: ..." }` |
| `http` with `bearer` | `header` with `prefix: "Bearer "` |
| `http` with `basic` | `header` with `prefix: "Basic "`; the secret holds the base64 of `user:password` |
| `oauth2` with a `clientCredentials` flow | `clientCredentials` with `tokenUrl`, `clientId` and `clientSecret` as `TODO`s and the operation's scopes (a scope starting with `TODO` is left out) |
| An API key in the query or a cookie, OAuth for people, OpenID Connect, mutual TLS, two schemes together | No auth, with a note: configure it by hand; for each person's own access use `tokenExchange` |

### TODO values { #openapi-todo }

Every value you must decide starts with `TODO: `, the same word everywhere, so `grep TODO` finds
them. The server refuses a configuration with a value under `httpSources` or a source's `http` that
still starts with `TODO: `. It checks this right after the keys and their types, before the other
rules. `pivotkit-server check-config` and `serve` exit 2 while one is left:

```text
pivotkit-server: 1 value still says TODO: httpSources.backends.petstore.url; replace each with the real value
```

No address from the document becomes a value by itself. A document could name an attacker's host as
the API or the token endpoint, and that host would then receive your credentials. Check the host,
write it into `url` and `tokenUrl`, then add the credentials. Other texts, such as a title or a
description, are ordinary values. So is a value that is just `TODO`, such as a query value a ticket
API takes.

Then decide which fields a caller may see (`policy.fields`). Test the source with
`pivotkit-server check-config` and [`check-source`](#check-source). `check-source` also prints the
fields the backend really sends.
