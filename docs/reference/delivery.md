---
title: Download links
description: How pivotkit-server and pivotkit-mcp hand reports to people over HTTP - links that expire, bound to the person's sign-in for sources whose fields are withheld.
---

# Download links

A report the MCP server or the REST service writes lands in the server's output directory
(`output.dir`). Over HTTP the server serves those reports itself: a result carries a link under
`http.publicUrl` + `/downloads/<token>` that works for 60 minutes. MCP results carry it twice: in
the text the model reads and as a `resource_link` the client can show the person. Nothing else has
to run beside the server.

Which report gets which link depends on the source. A source is **open** when its policy has
`"default": "show"` and no field below `show`, for the server's policy, the source's and every
profile; listing every column as `show` is not enough, since a column the data gains later would
take the default. A source with a field at `values`, `summary` or `hide` for anyone, or whose default
is not `show`, is **closed**, since its report may hold what the model was not shown. `check-config`
names, for each closed source, what makes it closed.

| Source | Caller | Link |
| --- | --- | --- |
| Open | any | A plain link anyone who has it can open until it expires (`bound: "none"`) |
| Closed | signed in over OAuth with a subject, `bind: "signIn"` | A link only that person can open, after signing in in the browser (`bound: "signIn"`) |
| Closed | `bind: "once"` (your explicit choice) | A link that works once (`bound: "once"`) |
| Closed | anything else: a static token, a token without a usable subject, `bind: "none"` | No link: the file is kept, and the result says "The report is saved on the server; ask the operator how to open it." |

Over REST a link to a report over a closed source also needs `results: true` in the caller's
policy (the caller is a program that could open the link itself, the same rule as the
[file route](rest.md#downloads)). Reports over open sources get their link without it.

Over stdio there is no HTTP server and no link: a local server keeps showing the file's path.

## Configuration { #configuration }

```json
{
  "http": { "publicUrl": "https://reports.example.com" },
  "auth": { "mode": "oauth", "issuer": "https://auth.example.com/application/o/pivotkit/", "resource": "https://reports.example.com/mcp" },
  "output": {
    "dir": "reports",
    "downloads": {
      "expiresMinutes": 60,
      "key": { "env": "PIVOTKIT_DOWNLOAD_KEY" },
      "signIn": { "clientId": "pivotkit-downloads", "clientSecret": { "file": "secrets/download-client-secret" } }
    }
  }
}
```

| Key | Default | What it is |
| --- | --- | --- |
| `output.downloads.enabled` | true | The server's own links. They need HTTP and `output.dir`, and are off while `output.baseUrl` is set (`true` next to `output.baseUrl` is refused at start: choose one) |
| `output.downloads.expiresMinutes` | 60 | How long a link works, 1 to 1440 minutes |
| `output.downloads.bind` | `"signIn"` with `auth.mode: "oauth"` and `signIn.clientId`, else `"none"` | How links to reports over closed sources are bound: `signIn`, `once`, or `none` (such reports get no link) |
| `output.downloads.key` | a random key per process | The link key, a secret reference (`{ "env": "NAME" }` or `{ "file": "path" }`) of at least 32 bytes; set it for more than one replica and for links that survive a restart. Make one with `openssl rand -base64 48`. It is read on every use, so a rotated key works without a restart (links made with the old key stop working) |
| `output.downloads.signIn.clientId` | none | The browser client the person signs in with |
| `output.downloads.signIn.clientSecret` | none (a public client with PKCE) | Its secret, a secret reference, sent as HTTP Basic (or in the form where the provider only takes `client_secret_post`) |
| `output.downloads.signIn.issuer` | `auth.issuer` | Must be `auth.issuer` when written: a link is bound to the issuer and subject of the caller's token, so the person signs in where the client did |
| `output.downloads.signIn.scopes` | `["openid"]` | What the sign-in asks for; must hold `openid` |

`bind: "signIn"` needs `auth.mode: "oauth"`, `http.publicUrl` with `https://` and
`signIn.clientId`; the server does not start without them. Without `http.publicUrl`, a server on
loopback puts its own address in links (`http://127.0.0.1:3333/downloads/...`), and a server on any
other address gives no links (a warning at start and in `check-config`), so a link never shows an
internal address.

The reports that get a link are stored with the link's 22 random characters before their name
(`Q3vB0rD3cE1fG9hI2jK4lM-Sales by region.pivotkit-out.xlsx`); the result's `output.name` is that
stored name and `output.filename` the name the person sees (`Sales by region.xlsx`). Reports
without a link keep their names. A key that cannot be read (a missing variable or file, shorter than
32 bytes) is a warning at start; until it can be read, reports get no link, keep their names, and
their result says to ask the operator.

## Sign-in links { #sign-in }

A sign-in link opens the provider's sign-in page in the browser (the OAuth 2.1 code flow with PKCE,
`state` and `nonce`), comes back to `/downloads/callback`, and sends the file only when the ID
token's issuer and subject are those of the access token the report was asked with (an ID token for
several audiences must name this client as `azp`). Register at the provider:

1. A client for the browser (`signIn.clientId`), public with PKCE or confidential with a secret,
   with the redirect URI `https://reports.example.com/downloads/callback` (`http.publicUrl` +
   `/downloads/callback`; `check-config` prints it).
2. Make the client resolve the same subject as the MCP client: `auth.subjectClaim` (default `sub`) is
   read from both tokens. Providers that give each application its own `sub` need a claim that is the
   same for every application (for example `oid` with Microsoft Entra ID; check your provider's
   documentation). A claim such as `email` binds a link only as strongly as the provider checks
   that the address belongs to the person (and keeps it from moving to another account).

ID tokens must be signed with a key from the issuer's `jwks_uri` (RS256, ES256 and the like); tokens
signed with the client secret (HS256) are not accepted. Someone signed in as another account gets
403 "You are signed in as a different account than the one that asked for this report." No session
outlives the download: the short cookie that holds the sign-in under way is cleared with the answer.

## One-time links { #once }

`bind: "once"` is your explicit choice for servers without a sign-in client. A GET (or HEAD) of the
link answers a short page (light or dark, as the browser is set) with a Download button that says
when the download has started, and never uses the link, so a chat client's link preview
does not use it up; the button's POST sends the file once. The same browser may repeat the download
for two minutes; anyone else gets 409 "This link was already used. Ask whoever made the report to make it again." The POST must come from the
link's own page: its `Origin` is `http.publicUrl`'s origin (the page is served with
`Referrer-Policy: same-origin`, so the browser names it), or `Origin: null` with
`Sec-Fetch-Site: same-origin`.

Anyone who sees a one-time link can use it once, and an assistant with a browser or a code tool can
use it before the person does. `check-config` warns of that; use `signIn` where it matters.

Which links were used is kept in `.pivotkit-downloads/` in the output directory, a file per link
made exclusively, so replicas sharing the directory agree; the files go once their link expired.

## What a result holds { #result }

```json
"output": {
  "name": "Q3vB0rD3cE1fG9hI2jK4lM-Sales by region.pivotkit-out.xlsx",
  "filename": "Sales by region.xlsx",
  "url": "https://reports.example.com/downloads/eyJ2IjoxLC...Q.k3Jx...",
  "expiresAt": "2026-11-15T09:00:00Z",
  "bound": "signIn",
  "note": "Open the link in your browser and sign in; it works for 60 minutes.",
  "format": "xlsx",
  "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}
```

`url`, `expiresAt` and `bound` are there only when a link was given. The MCP tool result adds,
after its text, a [resource link](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) (Tool Result, Resource Links):

```json
{ "type": "resource_link", "uri": "https://reports.example.com/downloads/eyJ2...", "name": "Sales by region.xlsx", "title": "Sales by region", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "annotations": { "audience": ["user"] } }
```

It carries `size` only for a report the assistant was shown in full. `audience` is a hint to the
client, not a protection: the binding is. The resource link goes only to clients that send
`MCP-Protocol-Version` 2025-06-18 or later (the revision that brought resource links); older
clients get the link in the result's JSON alone. The result's `message` names the file, not the
address: the address is `output.url`.

## Answers { #answers }

A browser gets a short page, a program that asks for JSON (`Accept: application/json`) a problem
document like the [REST service's](rest.md#errors).

| Status | Code | When |
| --- | --- | --- |
| 404 | `NOT_FOUND` | No such link: unknown, cut off, or signed with another key (all the same answer) |
| 410 | <a id="error-link-expired"></a>`LINK_EXPIRED` | The link expired, or its report was removed (`output.maxFiles`, `output.maxMb`, `output.maxAgeDays`) before it did |
| 409 | <a id="error-link-used"></a>`LINK_USED` | A one-time link that was used |
| 403 | <a id="error-link-not-yours"></a>`LINK_NOT_YOURS` | Signed in as another account than the one that asked |
| 403 | `FORBIDDEN_ORIGIN`, `FORBIDDEN_HOST` | A one-time link's POST from another page; a `Host` the server does not answer to |
| 400 | <a id="error-sign-in-failed"></a>`SIGN_IN_FAILED` | The sign-in did not complete: refused at the provider, the browser's sign-in cookie missing or used, or the ID token not valid |
| 503 | <a id="error-sign-in-not-ready"></a>`SIGN_IN_NOT_READY` | The server has not loaded the sign-in issuer's metadata yet (`Retry-After`) |

Every answer carries `Cache-Control: no-store`, `Referrer-Policy: no-referrer` (`same-origin` on a
one-time link's page),
`X-Robots-Tag: noindex`, `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy:
same-origin`; a file `Content-Security-Policy: sandbox; default-src 'none'` and
`Content-Disposition: attachment`, a page `default-src 'none'` with only its own style and the
button's script allowed by their hashes (`style-src`, `script-src`), `form-action 'self'` and
`frame-ancestors 'none'`. Ranges are not served. A download request takes a body of at most 1 KiB.

## Behind a proxy { #proxy }

Route `/downloads/` to the service besides `/mcp` and `/api/v1/`, keep the `Host` header (or add the
proxy's name to `http.allowHosts`), and set `http.publicUrl` to the address people open. The token is
in the link's path: proxies and browsers keep paths in their logs and history. That is why plain
links go only to reports over open sources; keep proxy logs of `/downloads/` short or leave the path
out of them. The server's own log names a download's binding, outcome and request id, never its
token; a link that does not exist is on the debug log only (`--log debug`), so a scan does not fill
the log. With more than one replica, set `output.downloads.key` (the same on every replica) and give
them one output directory (a ReadWriteMany volume), or run one replica; see
[the container](container.md) and [Kubernetes](../getting-started/kubernetes.md).

`output.baseUrl` (your own web server for the directory) still works instead of these links. It gives
an address only to reports over open sources: a report over a closed source carries no `url`, since
anyone with the address could open a report whose fields were withheld from the model.

`check-config` prints a `Delivery:` section: where links point, which sources get which link, the
redirect URI to register and the warnings.
