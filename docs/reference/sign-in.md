---
title: Sign-in and identity providers
description: How callers of pivotkit-server sign in - static and signed tokens or OAuth 2.1, the REST resource and its audience, scopes, the command line's device code sign-in with pivotkit login, provider notes for Authentik, Keycloak and Microsoft Entra ID, and Authentik set up step by step.
---

# Sign-in and identity providers

This page is for the people who run pivotkit-server and connect it to a sign-in provider:

- [Sign-in](#auth): the modes of the REST service, and OAuth with its resource and scopes.
- [More than one issuer](#issuers): tokens of several OAuth issuers on one server.
- [Sign in from the command line](#sign-in-cli): `pivotkit login`, and what the operator sets up.
- [Authentik step by step](#authentik): a provider for the MCP endpoint and the REST service.

The OAuth keys of the MCP endpoint are in [OAuth 2.1](mcp.md#oauth). The tokens the server makes
itself are in [Tokens and keys](tokens.md#credentials).

## Sign-in { #auth }

The modes are the [MCP server's](mcp.md#auth), from the same `auth` settings:

| Mode | How | 401 answers with |
| --- | --- | --- |
| `none` | No check. Loopback only unless `auth.allowUnauthenticated` | - |
| `token` | `Authorization: Bearer <token>`: `$PIVOTKIT_TOKEN`, named tokens in `auth.tokens` (from a variable or a file read on every request), a [signed token](tokens.md#signed-tokens) the server issued, or a [token from another system](tokens.md#external-issuers) | `WWW-Authenticate: Bearer realm="pivotkit"` |
| `oauth` | A JWT access token of the issuer for the REST resource | `WWW-Authenticate: Bearer error="invalid_token", ..., resource_metadata="..."` |

The server reads only the `Authorization` header. It refuses a token in the address
(`?access_token=`), two `Authorization` headers, Basic, and cookies. Static tokens and their scopes
work on both endpoints.

With OAuth, the REST service is a protected resource of its own:

- Its resource is `rest.resource`. The default is the origin of `auth.resource` with `/api/v1`, for
  example `https://reports.example.com/api/v1`.
- Its metadata ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)) is at
  `/.well-known/oauth-protected-resource/api/v1`.
- A token must carry its audience. REST refuses a token issued for the MCP endpoint, and the MCP
  endpoint refuses one issued for REST.
- `auth.audience` applies to `/mcp` only. REST checks `rest.audience`.
- A REST caller may hold a token issued to another application. Providers such as Authentik put
  that application's client ID into `aud`. List that client ID in `rest.audience`, as for the
  [command line's](#sign-in-cli-operator) client ID.
- `rest.audience` replaces the default. Keep `rest.resource` in the list if tokens issued for it
  should still work:
  `"rest": { "audience": ["https://reports.example.com/api/v1", "<other client id>"] }`.
- The issuer's settings are the MCP endpoint's ([OAuth 2.1](mcp.md#oauth)), including
  `auth.intranet` for an issuer on a private address.
- `auth.mode: "oauth"` needs `auth.resource`, also when only REST is on. `rest.resource` takes its
  default from it.

A token without the required scopes gets 403 `INSUFFICIENT_SCOPE` with
`WWW-Authenticate: Bearer error="insufficient_scope", scope="..."` naming them.

A person whose token does not carry their groups gets 403 `NOT_ALLOWED` without a challenge, since
signing in again with more scopes would not help. This applies with `auth.groupProfiles` and no
`auth.defaultProfile` ([groups](mcp.md#groups)). The `refused` log line of a 403 for groups names
the client.

The metadata lists the required scopes, and the sources' scopes with `auth.offerSourceScopes: true`
([which scopes](mcp.md#scopes)). An empty `GET /sources` for a token without the sources' scopes has
a `hint`.

Set `auth.requireTyp: "at+jwt"` where the provider marks its access tokens so (RFC 9068). The server
then refuses an ID token with the right audience.

With `auth.mode: oauth` and neither required scopes nor `auth.toolScopes`, the start warns. Any token
of the issuer for the REST audience then gets everything its profile allows.

Scopes per operation (`auth.toolScopes`, for example `{ "render_view": ["pivotkit:render"] }`) and
per source (`sources.<id>.scopes`) hold as for MCP. A source the caller may not use answers as a
missing one (404 `SOURCE_NOT_FOUND`).

| Key | Default | What it is |
| --- | --- | --- |
| `rest.resource` | origin of `auth.resource` + `/api/v1` | The REST service's resource (OAuth) |
| `rest.audience` | `[rest.resource]` | The `aud` values a REST token may carry |
| `rest.requiredScopes` | `auth.requiredScopes` | Scopes every REST call needs |
| `rest.signIn.clientId` | none | The public client `pivotkit login` signs in with, published in the metadata (OAuth only). Not `output.downloads.signIn.clientId` |

## More than one issuer { #issuers }

A server can accept the tokens of up to 10 OAuth issuers. Authentik, for example, gives each
application an issuer of its own: a host application's portal and the MCP client each sign in at
their own provider. List the issuers in `auth.issuers` instead of `auth.issuer` and `auth.jwksUri`
(both together are refused). List first the provider that MCP clients, `pivotkit login` and the
download sign-in use, because the server names only the first one to clients:

```json
"auth": {
  "mode": "oauth",
  "resource": "https://reports.example.com/mcp",
  "requiredScopes": ["pivotkit"],
  "issuers": [
    { "issuer": "https://auth.example.com/application/o/pivotkit/", "audience": ["<pivotkit's client id>"] },
    { "issuer": "https://auth.example.com/application/o/portal/", "audience": ["<the portal's client id>"], "requiredScopes": ["pivotkit:portal"] }
  ]
}
```

- A token is checked with the keys of the issuer its `iss` names, exactly as written there, and
  with no other issuer's keys. A token of an issuer that is not listed is refused.
- Each entry takes `issuer` (required), `jwksUri`, `audience` and `requiredScopes`. Its `audience`
  replaces the endpoint's (`auth.audience`, `rest.audience`) for its tokens on both endpoints, so
  one of its tokens reaches both MCP and REST. Leave it unset where the provider can issue the
  endpoints' own audiences. Its `requiredScopes` add to the endpoint's `requiredScopes`; a token
  without them gets 403 `insufficient_scope`.
- Give each issuer a pivotkit scope, in the endpoint's `requiredScopes` or its own. Leave the
  endpoint's out when every entry has its own. Where an entry's `audience` is another application's
  client ID, every token issued to that application is otherwise valid here.
- The first issuer is the one the server names to clients: the Protected Resource Metadata, the
  OpenAPI document, the [download sign-in](delivery.md#sign-in) and `pivotkit login`. Clients of
  the other issuers get their issuer and token by their own means; `pivotkit login` signs in at the
  first issuer only.
- Only the first issuer's people get [links bound to a sign-in](delivery.md#sign-in-issuer).
- Every listed issuer is trusted as fully as `auth.issuer`: the scopes, groups, client IDs and
  claims its tokens carry pick profiles (`scopeProfiles`, `groupProfiles`, `clientProfiles`) and
  fill parameters bound to claims, as the first issuer's do. List only issuers whose admins you
  trust with that. A client ID is the same client at every issuer. `subjectClaim`, `groupsClaim`,
  `scopeClaim`, `intranet` and `allowInsecureIssuer` apply to every issuer. Issuers that name a
  person in different claims, such as Entra ID's `oid` beside Authentik's `sub`, are not supported
  yet.
- Each issuer's metadata and keys load on their own. A token of an issuer that is not loaded yet
  gets 503, and the other issuers' tokens pass. `/readyz` answers 200 once one issuer is loaded and
  names the others' options in `waiting`, such as `auth.issuers[1].issuer`. The log warns about
  them, as `check-config` does.
- A [token exchange](sources.md#http-auth) serves the people of one issuer, named in
  `tokenExchange.issuer`. A person of another issuer does not see the source.
- `check-config` lists each issuer with its own audience and scopes.

## Sign in from the command line { #sign-in-cli }

With `auth.mode: oauth`, a person gets a REST token from the sign-in provider with a code in the
browser. This is the OAuth 2.0 device authorization grant
([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)). The token goes from the provider to the
person. The server takes no part in the sign-in. It only publishes its metadata.

=== "pivotkit"

    ```bash
    pivotkit login --url https://reports.example.com/api/v1
    pivotkit token | sed 's/^/Authorization: Bearer /' | curl -H @- https://reports.example.com/api/v1/sources
    ```

    curl reads the header from stdin (`-H @-`), so the token is in no argument. Other users of the
    machine can read arguments in the process list.

=== "PowerShell"

    ```powershell
    pivotkit login --url https://reports.example.com/api/v1
    Invoke-RestMethod https://reports.example.com/api/v1/sources -Headers @{ Authorization = "Bearer $(pivotkit token)" }
    ```

`pivotkit login` prints an address and a code. Open the address, enter the code, and sign in.
It takes the client ID the server publishes. Where the server publishes none, give it with
`--client-id`.
`pivotkit token` then prints a fresh access token whenever you need one.
[pivotkit-cli](cli.md#sign-in) describes both commands and where they keep the refresh token.

### What the operator sets up { #sign-in-cli-operator }

1. Create a client at the provider for the command line:
    - It is a public client. `pivotkit login` sends no client secret.
    - It may use the device authorization grant.
    - It may get refresh tokens. Authentik and Entra ID give one only with the scope `offline_access`.
2. Make its access tokens fit the REST service, as for any other client ([Sign-in](#auth)):
    - their `aud` is in `rest.audience`
    - they carry `rest.requiredScopes`
3. Publish the client ID, so users need only the server's address:

    ```json
    { "rest": { "signIn": { "clientId": "pivotkit-cli" } } }
    ```

    The server then names it in its metadata as `pivotkit_client_id`, next to the fields of
    [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728). `check-config` shows it.
    The field is pivotkit's own extension, which other clients ignore. RFC 9728 says in section 2:
    "Additional protected resource metadata parameters MAY also be used." Section 3.2 adds: "any
    metadata parameters that are not understood MUST be ignored."
    Without the setting, tell the users the client ID. They pass it with `--client-id` or
    `PIVOTKIT_CLIENT_ID`. Either pins the ID: `login` then never takes the published one.
    This client is not the browser client of a download link's sign-in
    ([`output.downloads.signIn.clientId`](delivery.md#configuration)).

!!! warning "Publish a public client only"

    Anyone can read the metadata, without a token. Publish only a public client: one the provider
    lets sign in without a secret. A client with a secret does not work with `pivotkit login`, and
    its ID tells others which client to attack. The setting has no field for a secret.

The command line asks for the scopes in the server's metadata. It adds `offline_access` when the
provider lists it or lists no scopes. `--scope` replaces both.

=== "Authentik"

    - Its discovery names the device endpoint
      ([source](https://github.com/goauthentik/authentik/blob/version/2026.8.5/authentik/providers/oauth2/views/provider.py)).
    - Set a **Device code flow** on the brand. Without it, Authentik offers no device code
      ([device code flow](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/device_code/),
      [brands](https://docs.goauthentik.io/customize/branding/)).
    - The device endpoint is `/application/o/device/`, the same for every application.
      The issuer stays the application's: `https://auth.example.com/application/o/<slug>/`
      ([OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)).
    - Add the `offline_access` scope mapping to the provider. Without it, there is no refresh
      token ([OAuth2 provider](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)).
    - Authentik puts the client ID into `aud`. List the command line's client ID in `rest.audience`.
      Keep `rest.resource` in the list if tokens issued for it should still work
      ([Authentik step by step](#authentik)).

=== "Keycloak"

    - Under **Capability config**, turn on the device authorization grant
      ([client settings](https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/clients/oidc/con-basic-settings.adoc)).
      Turn off client authentication, which makes it a public client.
    - The device endpoint is `/realms/<realm>/protocol/openid-connect/auth/device`. The realm's
      discovery names it only while the device flow feature of the server is on
      ([source](https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/OIDCWellKnownProvider.java)).
    - Keycloak returns refresh tokens by default
      ([server administration guide](https://www.keycloak.org/docs/latest/server_admin/index.html)).
      When the realm lists `offline_access`, `pivotkit login` asks for it too. Give `--scope`
      without it if users should not get that scope.
    - An **Audience** mapper puts the REST resource into `aud`
      ([audience support](https://github.com/keycloak/keycloak/blob/main/docs/documentation/server_admin/topics/clients/oidc/con-audience.adoc)).

=== "Microsoft Entra ID"

    - The device code endpoint is `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/devicecode`
      ([device code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)).
      The server's issuer names the tenant, as for the [MCP endpoint](mcp.md#oauth).
    - Set **Allow public client flows** to **Yes** under the app registration's advanced settings
      ([desktop app registration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-registration)).
    - Ask for the API's `.default` scope and `offline_access`:
      `--scope "api://<application id>/.default offline_access"`
      ([scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc)).
      Entra gives a refresh token only with `offline_access`.
    - Set `requestedAccessTokenVersion` to `2` in the API's manifest. Its tokens then have the issuer
      `https://login.microsoftonline.com/<tenant id>/v2.0`
      ([manifest](https://learn.microsoft.com/en-us/entra/identity-platform/reference-app-manifest)).
    - A Conditional Access policy can block the device code flow. Microsoft recommends blocking it
      where it is not used. Check your tenant's policies
      ([authentication flows](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-authentication-flows)).
    - A person in more than 200 groups gets no `groups` claim, only a marker
      ([claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference)).
      See [groups](mcp.md#groups).

Labels and defaults change between releases of the providers. These notes follow their
documentation and source code as of November 2026. Decode an access token of your own to see what
your setup issues.

### Without the command line { #sign-in-cli-manual }

The same steps work with curl or PowerShell:

1. Read the server's metadata at `/.well-known/oauth-protected-resource/api/v1`. Check that its
   `resource` is the address you use. Its `authorization_servers` names the issuer.
2. Read the issuer's metadata ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)) at
   `/.well-known/oauth-authorization-server` before the issuer's path. Where that fails, read
   `<issuer>/.well-known/openid-configuration`. Check that its `issuer` is the one the server named.
   It names the `device_authorization_endpoint` and the `token_endpoint`. Both must be https.
3. Post `client_id` and `scope` to the device endpoint. The answer has the `verification_uri`, the
   `user_code`, the `device_code` and the `interval`.
4. Check that the address is on your sign-in provider's site. Open it and enter the code.
5. Post `grant_type=urn:ietf:params:oauth:grant-type:device_code`, the `device_code` and the
   `client_id` to the token endpoint every `interval` seconds:
    - `authorization_pending` (HTTP 400): ask again.
    - `slow_down` (HTTP 400): wait 5 seconds longer from now on.
    - Any other error ends the sign-in.
    - HTTP 200 holds the `access_token`.

The token endpoint answers 400 while it waits. So `curl -f` fails there, and `Invoke-RestMethod`
throws. The scripts below handle that, and they check the addresses as steps 1 and 2 say.

=== "PowerShell"

    Save it as `Get-PivotkitToken.ps1`. It needs no module.

    ```powershell
    <#
    .SYNOPSIS
    Signs in to a pivotkit REST service with a device code and returns an access token.
    .EXAMPLE
    $token = ./Get-PivotkitToken.ps1 -Api https://reports.example.com/api/v1 -ClientId pivotkit-cli
    Invoke-RestMethod "https://reports.example.com/api/v1/sources" -Headers @{ Authorization = "Bearer $token" }
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [uri] $Api,
        [Parameter(Mandatory)] [string] $ClientId,
        [string] $Scope
    )
    $ErrorActionPreference = 'Stop'
    function Assert-Https([string] $Address, [string] $What) {
        if (([uri]$Address).Scheme -ne 'https') { throw "$What is no https:// address: $Address" }
    }
    $base = $Api.AbsoluteUri.TrimEnd('/')
    Assert-Https $base 'The server'
    $resource = Invoke-RestMethod ($Api.GetLeftPart([UriPartial]::Authority) + '/.well-known/oauth-protected-resource' + $Api.AbsolutePath.TrimEnd('/'))
    if ($resource.resource.TrimEnd('/') -ne $base) { throw "The server's metadata is for $($resource.resource), not $base." }
    $issuerName = $resource.authorization_servers[0]
    Assert-Https $issuerName 'The issuer'
    $issuerUri = [uri]$issuerName
    $issuer = $null
    foreach ($at in @(($issuerUri.GetLeftPart([UriPartial]::Authority) + '/.well-known/oauth-authorization-server' + $issuerUri.AbsolutePath.TrimEnd('/')), ($issuerName.TrimEnd('/') + '/.well-known/openid-configuration'))) {
        try { $issuer = Invoke-RestMethod $at -MaximumRedirection 0; break } catch { $issuer = $null }
    }
    if (-not $issuer -or $issuer.issuer -ne $issuerName) { throw "The issuer's metadata cannot be read, or names another issuer." }
    Assert-Https $issuer.device_authorization_endpoint 'The device endpoint'
    Assert-Https $issuer.token_endpoint 'The token endpoint'
    if (-not $Scope) {
        $Scope = (@($resource.scopes_supported | Where-Object { $_ }) + 'offline_access') -join ' '
    }
    $start = Invoke-RestMethod $issuer.device_authorization_endpoint -Method Post -Body @{ client_id = $ClientId; scope = $Scope }
    Assert-Https $start.verification_uri 'The code page'
    Write-Host "Sign in at $($issuerUri.Host). Open $($start.verification_uri) and enter the code $($start.user_code)"
    $interval = if ($start.interval) { [int]$start.interval } else { 5 }
    $deadline = (Get-Date).AddSeconds([int]$start.expires_in)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds $interval
        try {
            $body = @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; device_code = $start.device_code; client_id = $ClientId }
            return (Invoke-RestMethod $issuer.token_endpoint -Method Post -Body $body).access_token
        } catch {
            $answer = $_.ErrorDetails.Message | ConvertFrom-Json
            switch ($answer.error) {
                'authorization_pending' { }
                'slow_down' { $interval += 5 }
                default { throw "The sign-in did not finish: $($answer.error)" }
            }
        }
    }
    throw 'The code expired before the sign-in finished.'
    ```

=== "curl"

    It needs [jq](https://jqlang.org/) to read the JSON answers. The device code and the token go to
    curl on stdin (`@-`), never as an argument, since other users of the machine can read arguments
    in the process list.

    ```bash
    set -eu
    API=https://reports.example.com/api/v1
    CLIENT_ID=pivotkit-cli
    https() { case "$1" in https://*) ;; *) echo "$2 is no https:// address: $1" >&2; exit 1 ;; esac; }
    https "$API" "The server"
    ORIGIN=${API%/api/v1}
    PRM=$(curl -fsS "$ORIGIN/.well-known/oauth-protected-resource/api/v1")
    [ "$(echo "$PRM" | jq -r '.resource | rtrimstr("/")')" = "$API" ] || { echo "The server's metadata is for another address" >&2; exit 1; }
    ISSUER=$(echo "$PRM" | jq -r '.authorization_servers[0]')
    https "$ISSUER" "The issuer"
    ISSUER_ORIGIN=$(echo "$ISSUER" | sed -E 's#^(https://[^/]+).*#\1#')
    ISSUER_PATH=${ISSUER#"$ISSUER_ORIGIN"}
    META=$(curl -fsS "$ISSUER_ORIGIN/.well-known/oauth-authorization-server${ISSUER_PATH%/}" || curl -fsS "${ISSUER%/}/.well-known/openid-configuration")
    [ "$(echo "$META" | jq -r .issuer)" = "$ISSUER" ] || { echo "The issuer's metadata names another issuer" >&2; exit 1; }
    DEVICE_URL=$(echo "$META" | jq -r .device_authorization_endpoint); https "$DEVICE_URL" "The device endpoint"
    TOKEN_URL=$(echo "$META" | jq -r .token_endpoint); https "$TOKEN_URL" "The token endpoint"
    SCOPE=$(echo "$PRM" | jq -r '(.scopes_supported // []) + ["offline_access"] | join(" ")')
    START=$(curl -fsS -d "client_id=$CLIENT_ID" --data-urlencode "scope=$SCOPE" "$DEVICE_URL")
    https "$(echo "$START" | jq -r .verification_uri)" "The code page"
    echo "$START" | jq -r --arg host "${ISSUER_ORIGIN#https://}" '"Sign in at \($host). Open \(.verification_uri) and enter the code \(.user_code)"'
    INTERVAL=$(echo "$START" | jq -r '.interval // 5')
    while :; do
      sleep "$INTERVAL"
      ANSWER=$(echo "$START" | jq -j .device_code | curl -sS -d grant_type=urn:ietf:params:oauth:grant-type:device_code \
        -d "client_id=$CLIENT_ID" --data-urlencode device_code@- "$TOKEN_URL")
      case "$(echo "$ANSWER" | jq -r '.error // "done"')" in
        done) break ;;
        authorization_pending) ;;
        slow_down) INTERVAL=$((INTERVAL + 5)) ;;
        *) echo "The sign-in did not finish: $(echo "$ANSWER" | jq -r .error)" >&2; exit 1 ;;
      esac
    done
    echo "$ANSWER" | jq -r '"Authorization: Bearer \(.access_token)"' | curl -fsS -H @- "$API/sources"
    ```

Both scripts keep no refresh token. Run them again when the access token expires, or use
`pivotkit login`, which keeps the refresh token for you.

## Authentik step by step { #authentik }

With OAuth, the MCP endpoint takes access tokens of your identity provider instead of static tokens.
It works with any provider that issues JWT access tokens. [OAuth 2.1](mcp.md#oauth) has
every key. With [Authentik](https://goauthentik.io/):

1. Under **Customization > Property Mappings**, create a **Scope Mapping**. Give it the **Scope name**
   `pivotkit` and an expression that returns `{}`. The scope adds no claims. Authentik drops a scope
   a client asks for when the provider has no scope mapping for it. A token without `pivotkit` then
   gets 403.
2. Under **Applications > Applications**, choose **New Application**. Give it the slug `pivotkit`
   and the provider type **OAuth2/OIDC**, with these provider settings:
     - **Client Type**: **Public**. An MCP client keeps no secret. It signs in with PKCE.
     - **Redirect URIs/Origins (RegEx)**: the callback addresses of the MCP clients you allow. Take
       them from the clients' documentation. Give each the matching mode **Strict**, which matches
       the address exactly. With **Regex**, the whole address must match the expression. Then
       escape the dots (`https://app\.example\.com/callback`) and use no `.*`. Otherwise a sign-in
       can go to an address you did not mean.
     - **Signing Key**: a certificate with one of the keys the server accepts by default
       (`auth.algorithms`): an RSA key (RS256), an EC P-256 key (ES256) or an Ed25519 key (EdDSA).
       For the other EC curves, Authentik signs with ES384 or ES512. Without a signing key,
       Authentik signs with HS256 and the client secret, which the server refuses.
     - **Encryption Key**: none. With one, Authentik encrypts the access token (JWE), and the server
       cannot read it.
     - **Access Token Validity**: minutes, for example `minutes=10`. The default is one hour. A token stays
       valid until it expires.
     - **Scopes**: add the `pivotkit` mapping to the selected scopes.
3. On the application's **Policy / Group / User Bindings**, bind the group that may use pivotkit
   (**Bind existing group/user**). You can bind users or a policy instead. An application without
   any binding lets every user of Authentik sign in to it.
4. Note the provider's **Client ID**.

The server accepts every access token this provider issues for its audience with the required
scopes. So Authentik decides who gets a token: by the bindings of step 3 and by the scopes.

The issuer is `https://auth.example.com/application/o/pivotkit/`. It ends with the application's
slug. That holds with the default issuer mode, where each provider has its own issuer. Authentik
puts the client ID into the access token's `aud`, and the granted scopes into its `scope` claim. The
`auth` part of the configuration:

```json
{
  "auth": { "mode": "oauth",
    "issuer": "https://auth.example.com/application/o/pivotkit/",
    "resource": "https://reports.example.com/mcp",
    "audience": ["<the provider's client id>"],
    "requiredScopes": ["pivotkit"] },
  "http": { "publicUrl": "https://reports.example.com/", "trustProxy": true, "enable": ["mcp"] }
}
```

- `requiredScopes` also keeps Authentik's ID tokens out: they carry the same `aud` but no `scope`.
  Do not set `auth.requireTyp`: Authentik's access tokens carry no `typ` of `at+jwt`.
- `http.enable: ["mcp"]` serves the MCP endpoint only. The REST service is a resource of its own,
  and its tokens must carry its audience ([REST sign-in](sign-in.md#auth)). With
  Authentik, every token of the provider carries the same client ID. To serve REST from the same
  provider, set `rest.audience` to that client ID. Give REST a scope of its own with
  `rest.requiredScopes` and a second scope mapping. A token with both scopes then works on both
  endpoints.

A second application (a portal, a tool with a client of its own) has an issuer of its own in this
mode. To accept its tokens too, list both providers in [`auth.issuers`](#issuers), each with its own
client ID as audience.

These settings follow the sources below, checked in November 2026:

- Authentik's [OAuth2 provider documentation](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/):
  issuer, signing key, PKCE.
- Authentik's source code at the release `version/2026.8.5`:
    - `authentik/providers/oauth2/`: the access token's `aud`, `scope` and header, the signing
      algorithm per key, the default validity, scopes without a mapping, and redirect addresses
      matched in full.
    - `authentik/policies/engine.py`: an application without bindings passes everyone.
    - `web/src/admin/`: the labels of the forms.

Labels and defaults can change between Authentik releases. It was not checked whether Authentik
reads the `resource` parameter of [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707). The server
does not need it, since it accepts the client ID as audience. Decode an access token of your own to
see what your setup issues.
