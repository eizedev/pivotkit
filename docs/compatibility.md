---
title: What works with pivotkit
description: The products pivotkit works with, by area - Node and browsers, host applications, sign-in providers, MCP clients, data sources and backend sign-in, report stores, log targets and platforms - with the status of each one and the settings it needs.
---

# What works with pivotkit

This page lists the products pivotkit works with, area by area. Each entry gives its status and the
settings it needs. The linked reference pages have the rest.

## What the status means { #status }

| Status | Meaning |
| --- | --- |
| Tested in CI | A workflow of this repository runs it on every pull request that touches it. |
| Tested by hand | Someone ran it by hand. The linked issue or pull request has the result. Nobody runs it again on every change. |
| Tested in CI and by hand | Both of the above. |
| Tested at release | A release workflow runs it when it publishes. Pull requests do not. |
| Documented, not tested | The docs give the settings, taken from the product's own documentation. Nobody ran it with pivotkit. |
| Not tested | The docs give no settings for it. It may work if it meets the requirements of its area. |
| Not supported | pivotkit does not do this. The entry says what to do instead. |

An entry tested in CI runs against a stand-in, unless it says otherwise. For example, the sign-in
tests use a test issuer of their own, not a real identity provider.

## Node.js { #node }

The engine, the reports, the CLI, the REST service and the MCP server run in **Node 24 or later**.

| Where | Status | What runs |
| --- | --- | --- |
| Linux, Node 24 and 26 | Tested in CI | Every unit test and the repository checks |
| Windows and macOS, Node 24 | Tested in CI | The tests of pivotkit-cli and pivotkit-server |

The lowest Node version is part of the [versioning promise](versioning.md#what-is-public-interface).

## Browsers { #browsers }

The report runs in these browsers or newer:

| Browser | From |
| --- | --- |
| Chrome, Edge and other Chromium browsers | 111 |
| Firefox | 113 |
| Safari | 16.4 |

| What | Status | How |
| --- | --- | --- |
| Chromium, Firefox and WebKit | Tested in CI | Every browser test runs in the current engines of Playwright. These are newer than the lowest versions above. |
| The Safari app on macOS and iOS | Tested by hand | Printing the table and the chart: in [Safari 27.0.1 on macOS](https://github.com/eizedev/pivotkit/issues/210#issuecomment-6901701332) and in [Safari on iOS 27.2 in the simulator](https://github.com/eizedev/pivotkit/issues/210#issuecomment-6902457786) |
| Real phones and touch input | Not tested | The browser tests use narrow windows and a mouse. |

[Browser support](browser-support.md) has the details and the browser features the report needs.

## React and ECharts { #react }

| Package | Status | How |
| --- | --- | --- |
| React for pivotkit-react: `>=18.2 <20` | Tested in CI | On the React 18 and React 19 this repository pins, not on each version of the range |
| Apache ECharts for pivotkit-react: `>=6.1.0 <7` | Tested in CI | On the version this repository pins |
| pivotkit-element, with its own React and ECharts | Tested in CI | On pages without React and on pages with React 18 or 19 |

## Host applications { #hosts }

A host is the application the report runs in.

| Host | Status | How |
| --- | --- | --- |
| A React application | Tested in CI | The playground and host pages in Chromium, Firefox and WebKit |
| A plain HTML page | Tested in CI | The web component on test pages, a strict Content-Security-Policy among them |
| Angular | Tested in CI | CI builds the zoneless Angular 22 example and runs its browser test |
| PowerShell Universal apps | Tested by hand | The report in a PowerShell Universal app, on release 0.3.0. [#118](https://github.com/eizedev/pivotkit/pull/118) fixed the findings. CI tests host pages that render as PowerShell Universal does. |
| PowerShell Universal scripts with the REST service or the MCP server | Documented, not tested | [PowerShell Universal](getting-started/powershell-universal.md#psu) |
| A Node program, engine only | Tested in CI | pivotkit-core's tests |
| Your own Node server with pivotkit-server inside | Tested in CI | The REST handler with requests as a framework passes them |

The settings each host needs:

=== "React"

    ```bash
    npm install pivotkit-react echarts react react-dom
    ```

    See [Getting started: React](getting-started/react.md).

=== "Plain HTML"

    Serve the whole `dist/` directory of pivotkit-element and load its entry:

    ```html
    <script type="module" src="/assets/pivotkit-element/dist/index.js"></script>
    <pivot-report></pivot-report>
    ```

    See [Getting started: web component](getting-started/web-component.md).

=== "Angular"

    Add `CUSTOM_ELEMENTS_SCHEMA` to the component that uses `<pivot-report>`. See
    [Angular](getting-started/web-component.md#angular).

=== "PowerShell Universal"

    In an app, use the separate module
    [PowerShellUniversal.Component.Pivot](https://powershell-universal-components.eize.dev/pivot/)
    or a component of your own: [PowerShell Universal](getting-started/react.md#powershell-universal).

    For scripts, run `pivotkit-server serve` on the PowerShell Universal server. Its scripts call the
    REST service: [PowerShell Universal](getting-started/powershell-universal.md#psu).

## Sign-in to the services { #sign-in }

This is how a person or a program signs in to the REST service and the MCP server.

What a provider must do:

- It issues JWT access tokens. Opaque tokens, checked by introspection, are not supported.
- It publishes its metadata and keys at an `https://` address.
- It has a public client with PKCE for MCP clients, the scopes, and an audience the server accepts.
- An issuer in your LAN or cluster needs `auth.intranet: true`.

| Provider | Status | How |
| --- | --- | --- |
| None: a static token | Tested in CI | One token, or several named ones |
| The server's checks of OAuth tokens | Tested in CI | Tokens of a test issuer: metadata, keys, challenges and refused tokens. No real provider |
| Authentik | Tested by hand | MCP over HTTP with a real sign-in, REST with client credentials, per-person backend tokens: [#448](https://github.com/eizedev/pivotkit/issues/448), tested at commit f3cde815 |
| Keycloak | Documented, not tested | [Keycloak](reference/mcp.md#oauth) |
| Microsoft Entra ID | Documented, not tested | [Microsoft Entra ID](reference/mcp.md#oauth). Per-person backend tokens are not supported, see [below](#backend-sign-in) |
| Okta, Auth0, Google | Not tested | Check them against the requirements above |

The settings each provider needs:

=== "Static token"

    ```bash
    PIVOTKIT_TOKEN=... pivotkit-server serve --config pivotkit.json --auth token
    ```

    `pivotkit-server token new` makes a token. See [tokens and keys](reference/tokens.md#credentials).

=== "Authentik"

    ```json
    { "auth": { "mode": "oauth",
        "issuer": "https://auth.example.com/application/o/pivotkit/",
        "resource": "https://reports.example.com/mcp",
        "audience": ["<the provider's client id>"],
        "requiredScopes": ["pivotkit"] } }
    ```

    Authentik needs a signing key, a scope mapping and a public client. See
    [Sign-in with Authentik](reference/sign-in.md#authentik).

=== "Keycloak"

    ```json
    { "auth": { "mode": "oauth",
        "issuer": "https://login.example.com/realms/example",
        "resource": "https://reports.example.com/mcp",
        "requiredScopes": ["pivotkit"] } }
    ```

    An audience mapper on the client scope puts the `resource` into `aud`.

=== "Microsoft Entra ID"

    ```json
    { "auth": { "mode": "oauth",
        "issuer": "https://login.microsoftonline.com/<tenant id>/v2.0",
        "resource": "https://reports.example.com/mcp",
        "audience": ["api://<application id>", "<application id>"],
        "requiredScopes": ["Reports.Read"] } }
    ```

    The issuer names your tenant, not `/common`.

The full list of settings is in [OAuth](reference/mcp.md#oauth) and [REST sign-in](reference/sign-in.md#auth).

## MCP clients { #mcp-clients }

| Client | Status | How |
| --- | --- | --- |
| The MCP SDK's own client, over stdio or Streamable HTTP | Tested in CI | With the 2025 handshake and with protocol version 2026-07-28 |
| An MCP client that signs in with OAuth | Tested by hand | Through Authentik: [#448](https://github.com/eizedev/pivotkit/issues/448), tested at commit f3cde815. CI tests only the server's side, with tokens of a test issuer |
| A program with a bearer token over HTTP | Tested in CI | The MCP and REST tests |
| Claude Code | Documented, not tested | [Add it to your client](getting-started/mcp.md#2-add-it-to-your-client) |
| Claude Desktop | Documented, not tested | [Add it to your client](getting-started/mcp.md#2-add-it-to-your-client) |
| VS Code | Documented, not tested | [Add it to your client](getting-started/mcp.md#2-add-it-to-your-client) |
| Other MCP clients | Documented, not tested | [Add it to your client](getting-started/mcp.md#2-add-it-to-your-client), "Other clients" |

## Data sources { #sources }

| Source | Status | How |
| --- | --- | --- |
| Files: CSV, TSV, TXT and JSON | Tested in CI | The readers built into pivotkit-core |
| Excel workbooks (XLSX) | Tested in CI | The reader plugin pivotkit-xlsx |
| Any HTTP API that answers JSON or CSV | Tested in CI | A stand-in backend over `https://` |
| HTTP sources made from an OpenAPI document | Tested in CI | The server's command that writes them |
| A code source: a function of your Node server | Tested in CI | The `load` function of a library host |
| Data the caller sends with the request | Tested in CI | `inline:` on REST and MCP |

The settings are in [Data sources](reference/sources.md).

## Backend sign-in for HTTP sources { #backend-sign-in }

This is how pivotkit signs in to the backend an HTTP source reads.

| Sign-in | Status | How |
| --- | --- | --- |
| A static header, such as an API key or a bearer token | Tested in CI | A stand-in backend |
| Basic sign-in with user and password | Documented, not tested | A static header with the prefix Basic |
| A service account: OAuth client credentials, with a client secret or a JWT | Tested in CI | A stand-in token endpoint |
| Per person: the signed-in person's own backend token | Tested in CI and by hand | CI: a stand-in token endpoint. By hand: Authentik to a stand-in backend, [#448](https://github.com/eizedev/pivotkit/issues/448), tested at commit f3cde815 |
| Per person with Keycloak | Documented, not tested | [Keycloak](reference/sources.md#http-auth-provider) |
| Per person with Microsoft Entra ID | Not supported | [#484](https://github.com/eizedev/pivotkit/issues/484) is open for it. Use a service account with a parameter bound to a claim, or a code source |

The settings each kind needs:

=== "Header"

    ```json
    { "header": { "name": "authorization", "prefix": "Bearer ", "value": { "env": "PLATFORM_TOKEN" } } }
    ```

=== "Basic"

    ```json
    { "header": { "prefix": "Basic ", "value": { "env": "PLATFORM_BASIC" } } }
    ```

    The secret holds the base64 of `user:password`.

=== "Service account"

    ```json
    { "clientCredentials": {
        "tokenUrl": "https://auth.example.com/application/o/token/",
        "clientId": "pivotkit-backend",
        "clientSecret": { "file": "secrets/backend-secret" },
        "scope": "platform:read" } }
    ```

=== "Per person"

    ```json
    { "tokenExchange": {
        "audience": "platform-api",
        "scope": "platform:read",
        "clientId": "pivotkit-backend",
        "clientSecret": { "file": "secrets/backend-secret" } } }
    ```

    A per-person token needs OAuth sign-in to the services. The provider must allow the token
    exchange: see [what the provider must allow](reference/sources.md#http-auth-provider).

The full list of settings is in [Backend sign-in](reference/sources.md#http-auth).

## Report stores { #stores }

A report can go to a store you run. You give pivotkit an upload address or a presign service.

| Store | Status | How |
| --- | --- | --- |
| A presign service of your own | Tested in CI and by hand | CI: a stand-in store over `https://`. By hand: a throwaway store with a presign service, [#448](https://github.com/eizedev/pivotkit/issues/448), tested at commit f3cde815 |
| A plain PUT or POST address | Tested in CI | `output.upload.url` against a stand-in store |
| Amazon S3 | Not tested | [Upload to your store](reference/delivery.md#upload) names it. The docs give no settings for it by name |
| Azure Blob Storage | Not tested | [Upload to your store](reference/delivery.md#upload) names it. The docs give no settings for it by name |

The settings each kind needs:

=== "Presign service"

    ```json
    { "output": { "dir": "reports", "upload": { "presign": {
        "url": "https://store.example.com/presign",
        "headers": { "authorization": { "prefix": "Bearer ", "value": { "env": "STORE_TOKEN" } } },
        "uploadUrl": "/uploadUrl",
        "link": "/downloadUrl" } } } }
    ```

    Your presign service answers with the address to upload to and the link.

=== "PUT address"

    ```json
    { "output": { "dir": "reports", "upload": {
        "url": "https://store.example.com/reports/{id}/{name}.{format}",
        "headers": { "authorization": { "prefix": "Bearer ", "value": { "file": "secrets/store-token" } } } } } }
    ```

The full list of settings is in [Upload to your store](reference/delivery.md#upload).

## Logs { #logs }

The services write JSON lines to stderr. CI tests the log's format.

| Target | Status | How |
| --- | --- | --- |
| `docker logs` (the `json-file` and `local` drivers) | Documented, not tested | [Docker log drivers](reference/operations.md#docker) |
| Graylog, through Docker's `gelf` driver | Documented, not tested | [Docker log drivers](reference/operations.md#docker) |
| A syslog receiver, through Docker's `syslog` driver | Documented, not tested | [Docker log drivers](reference/operations.md#docker) |
| journald and rsyslog, without a container | Documented, not tested | [journald and rsyslog](reference/operations.md#journald) |
| A Kubernetes log agent, such as Fluent Bit or Vector | Documented, not tested | [Kubernetes](reference/operations.md#kubernetes) |
| Grafana Loki | Not tested | The docs give no settings for it |

The settings each Docker driver needs, in `compose.yml`:

=== "Graylog (gelf)"

    ```yaml
    logging:
      driver: gelf
      options:
        gelf-address: "udp://graylog.example.com:12201"
        tag: "pivotkit"
    ```

=== "syslog"

    ```yaml
    logging:
      driver: syslog
      options:
        syslog-address: "tcp+tls://logs.example.com:6514"
        syslog-format: "rfc5424"
        tag: "pivotkit"
    ```

Both drivers give every line the same level. Let the log server parse the JSON and use its `level`.

## Platforms { #platforms }

| Platform | Status | How |
| --- | --- | --- |
| The container image on linux/amd64 | Tested in CI | A change to the image builds it and runs it: the first start, refused starts, tokens of your own |
| The container image on linux/arm64 | Tested at release | The release of an image starts it once on each platform |
| Docker Compose | Tested in CI | The Compose example in `docker/` |
| Kubernetes | Documented, not tested | [Kubernetes](getting-started/kubernetes.md) |
| Behind a reverse proxy | Documented, not tested | [Behind a proxy](reference/delivery.md#proxy) |
| A Windows service with IIS in front | Documented, not tested | [PowerShell Universal](getting-started/powershell-universal.md#psu-service) |

## Something missing? { #missing }

Did you run pivotkit with a product this page does not list, or lists as not tested? Open an
[issue](https://github.com/eizedev/pivotkit/issues). Say what you ran and which settings you used.
