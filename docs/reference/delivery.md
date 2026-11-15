---
title: Download links
description: How pivotkit-server and pivotkit-mcp hand reports to people over HTTP - links that expire, bound to the person's sign-in for sources whose fields are withheld, or an upload to the operator's store.
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

Reports can also go to a store you run (S3, Azure Blob Storage, a file service of your own): see
[Upload to your store](#upload). The store's link then takes the place of these links, under the
same rules for closed sources.

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
| `output.downloads.signIn.issuer` | `auth.issuer` | May be left out; when given, it must equal `auth.issuer` (a link is bound to the issuer and subject of the caller's token, so the person signs in where the client did) |
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
made exclusively, so replicas sharing the directory agree; the files go once their link expired. Each
file is written whole and then hard-linked to its name, so the output directory's file system must
support hard links (local disks and NFS do; some network or object-store mounts do not, and a
one-time download there answers 500).

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

## Upload to your store { #upload }

With `output.upload`, a report is written to `output.dir` and then uploaded to a store you name; the
result shows the store's link. You configure the store; a caller cannot name an address.

```json
{
  "output": {
    "dir": "reports",
    "upload": {
      "presign": {
        "url": "https://store.example.com/presign",
        "headers": { "authorization": { "prefix": "Bearer ", "value": { "env": "STORE_TOKEN" } } },
        "uploadUrl": "/uploadUrl",
        "uploadHeaders": "/headers",
        "link": "/downloadUrl",
        "expiresAt": "/expiresAt",
        "allowOrigins": ["https://bucket.store.example.com"]
      },
      "linkOrigins": ["https://files.example.com"],
      "maxBytes": 52428800
    }
  }
}
```

Here pivotkit sends `POST https://store.example.com/presign` with the `authorization` header and the
JSON `{ "filename": "Sales by region.xlsx", "mediaType": "...", "bytes": 18234, "sha256": "<hex>" }`.
A presign service you run answers, for example:

```json
{
  "uploadUrl": "https://bucket.store.example.com/reports/7f3a.xlsx?X-Amz-Signature=...",
  "headers": { "x-amz-server-side-encryption": "AES256" },
  "downloadUrl": "https://files.example.com/reports/7f3a.xlsx?sig=...",
  "expiresAt": "2026-11-16T08:00:00Z"
}
```

pivotkit then sends the file with `PUT` to `uploadUrl`, with `content-type`, `content-length` and the
answer's `headers`, and shows `downloadUrl` as `output.url`, with `expiresAt`. Your credentials go to
the presign address only, never to `uploadUrl`.

Without a presign service, give an address template; `{id}` is random, `{name}` is the report's name
as letters, digits, `.`, `_` and `-` (at most 80 characters), `{format}` its format:

```json
"upload": {
  "url": "https://store.example.com/reports/{id}/{name}.{format}",
  "headers": { "authorization": { "prefix": "Bearer ", "value": { "file": "secrets/store-token" } } }
}
```

A `PUT` there makes the address itself the link, unless the address has a query: then `link` is required, since a query may hold a signature. With `"method": "POST"`, `link` says where the
answer names the stored report: a JSON Pointer (`"/url"`) or `"header:location"`.

| Key | Default | What it is |
| --- | --- | --- |
| `output.upload.url` | none | An `https://` address template with `{id}`, `{name}` and `{format}` in its path or query; or `presign` |
| `output.upload.headers` | none | With `url`: headers sent to the store. A value is a text, or `{ "prefix": "Bearer ", "value": <secret reference> }`; `authorization`, `cookie` and names with `key`, `token`, `secret`, `auth` or `pass` take a secret reference only |
| `output.upload.link` | the address (`PUT` to an address without a query) | With `url`: a JSON Pointer into the store's answer, or `"header:location"`; required for `POST` and for an address with a query (a query may hold a signature, such as a SAS token, which is never shown) |
| `output.upload.expiresAt` | none | With `url`: a JSON Pointer to the link's expiry in the store's answer |
| `output.upload.presign.url` | none | The `https://` address of your presign service |
| `output.upload.presign.headers` | none | Headers sent to the presign service only, as `output.upload.headers` |
| `output.upload.presign.uploadUrl`, `.link` | none | JSON Pointers to the address to upload to and to the link, in the presign answer |
| `output.upload.presign.uploadHeaders`, `.expiresAt` | none | JSON Pointers to headers for the upload (an object of texts) and to the link's expiry |
| `output.upload.presign.allowOrigins` | the presign address's origin | The origins `uploadUrl` may have (`https://bucket.store.example.com`) |
| `output.upload.linkOrigins` | the origin of `url` or `presign.url` | The origins a link may have |
| `output.upload.method` | `"PUT"` | `PUT` or `POST` for the upload |
| `output.upload.timeMs` | 30000 | Waiting for a slot, presign and upload together, 1000 to 600000 ms |
| `output.upload.maxBytes` | `output.maxMb` | A larger report is not uploaded (`UPLOAD_FAILED`) |
| `output.upload.keepLocal` | true | Keep the report in `output.dir` too; with `false` it is removed once the store answered 2xx and the link was checked |
| `output.upload.bind` | `"none"` | What the store's links do, as you declare it: `none` (anyone with the link), `once`, or `signIn` (the store checks the person) |
| `output.upload.intranet` | false | The store may be on a loopback or private address |

`output.upload` needs `output.dir` and cannot be combined with `output.baseUrl`.

Which reports go to the store:

| Source | `bind` | Delivery |
| --- | --- | --- |
| Open | any | Uploaded; the store's link (`bound` is `bind`) |
| Closed | `once` or `signIn` | Uploaded; the store's link. Over REST only for a caller with `results: true` |
| Closed | `none` | Not uploaded: a store whose links anyone can open never gets such a report. The server's own links apply (a sign-in link where configured), else no link |

Schedule drafts are not uploaded: the host approves them in `output.dir`.

What is checked: every request goes through the same guarded fetch as [HTTP sources](sources.md#http)
(`https://` only, no redirects followed, cloud metadata and link-local addresses never, loopback and
private addresses only with `intranet`). `uploadUrl` must be `https://` and on `allowOrigins`. The
presign service may not ask for `host`, `content-length`, `authorization`, `cookie`, `proxy-*` or
connection headers, nor for line breaks in a value. A link must be `https://`, on `linkOrigins`,
without a user name or password or control characters, and at most 2048 characters. Answers are read
up to 64 KiB. At most two uploads run at once; the file is streamed from disk. A `PUT` is tried once
more after a dropped connection or a 502, 503 or 504 while time is left; a `POST` (the presign
request among them) never is.

When an upload fails, the caller gets `UPLOAD_FAILED` (502) with a fixed text, the request id and
`retryable` ([REST](rest.md#error-upload-failed), [MCP](mcp.md#errors)); the report stays in
`output.dir` (with `keepLocal: false` until it is cleaned up). The log line `upload failed` names the
request id and a code (`PRESIGN_403`, `UPLOAD_URL`, `LINK`, `STORE_503`, `TIMEOUT`, `SECRET`, ...),
never an address, a header or what the store answered: presigned addresses and links are
credentials.

`check-config` prints an `Upload:` section: the target (without its query), which sources' reports go there, and a
`PROBLEM:` line for a header secret it cannot read.

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
