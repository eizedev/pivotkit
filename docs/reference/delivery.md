---
title: Download links
description: How pivotkit-server and pivotkit-mcp hand reports to people over HTTP - links that expire, bound to the person's sign-in for sources whose fields are withheld, or an upload to the operator's store.
---

# Download links

A report the MCP server or the REST service writes lands in the server's output directory
(`output.dir`). Over HTTP, the server serves those reports itself. A result carries a link under
`http.publicUrl` + `/downloads/<token>` that works for 60 minutes. MCP results carry the link twice:

- in the text the model reads
- as a `resource_link` the client can show the person

Nothing else has to run beside the server. A `render_view` with `save: false` writes no file and gets
no link. Its csv or json result comes back [inline only](mcp.md#inline-only).

Which report gets which link depends on the source:

- A source is **open** only where nothing new can become visible, the same for every caller. This
  must hold for the server's policy, the source's and every profile. Two policies are open:
    - `"default": "hide"`, with every field it names at `show` or `hide`. The server drops a hidden
      field when it reads the data, and a column the data gains later is hidden too.
    - `"default": "show"` with no field below `show`: every field shown, nothing hidden.
- Any other policy makes a source **closed**:
    - a field or the default at `values` or `summary` for anyone, since its report may hold what the
      model was not shown, and the automatic `values` rule
    - `"default": "show"` with a field at `hide` ("show everything except the personal column"). A
      column the data gains later would be shown. For plain links, set the default to `hide` and
      list the fields to show.
    - a field shown to some callers and hidden for others. One caller's report would hold what
      another caller may not see.
- Data that belongs to one person counts as closed too, whatever its fields' levels. That is data
  sent in the request (`inline:`), a source bound to a person (a
  [parameter bound to a claim](sources.md#http-claims) or a backend's
  [token exchange](sources.md#http-auth)), and a code source you mark with
  [`perPerson: true`](code-sources.md#code-options).

`check-config` names, for each closed source, what makes it closed.

| Source | Caller | Link |
| --- | --- | --- |
| Open | any | A plain link anyone who has it can open until it expires (`bound: "none"`) |
| Closed | signed in over OAuth with a subject, `bind: "signIn"` | A link only that person can open, after signing in through the browser (`bound: "signIn"`) |
| Closed | `bind: "once"` (your explicit choice) | A link that works once (`bound: "once"`) |
| Closed | anything else: a static token, a token without a usable subject, `bind: "none"` | No link: the file is kept, and the result says "The report is saved on the server; ask the operator how to open it." |

Over REST, a link to a report over a closed source also needs `results: true` in the caller's
policy. The caller is a program that could open the link itself, so the same rule holds as for the
[file route](rest.md#downloads). Reports over open sources get their link without it.

Over stdio, there is no HTTP server and no link. A local server shows the file's path.

Reports can also go to a store you run (S3, Azure Blob Storage, a file service of your own). See
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
| `output.downloads.enabled` | true | The server's own links. They need HTTP and `output.dir`, and are off while `output.baseUrl` is set. `true` next to `output.baseUrl` is refused at start: choose one |
| `output.downloads.expiresMinutes` | 60 | How long a link works, 1 to 1440 minutes. A person reads the answer, opens the link and signs in within this time, so give them minutes, not seconds. `check-config` warns below 5 |
| `output.downloads.bind` | `"signIn"` with `auth.mode: "oauth"` and `signIn.clientId`, else `"none"` | How links to reports over closed sources are bound: `signIn`, `once`, or `none` (such reports get no link) |
| `output.downloads.key` | a random key per process. With a state directory, `<state>/secrets/downloads.key`, made at the first start ([made at the first start](tokens.md#first-start)) | The link key, a secret reference (`{ "env": "NAME" }` or `{ "file": "path" }`, `"create": true` makes a missing file) of at least 32 bytes. Set it for more than one replica and for links that survive a restart. Make one with `pivotkit-server key new --for downloads --file <path>` ([tokens and keys](tokens.md#credentials)). It is read again at most once a second, so a rotated key works without a restart, within a second. Links made with the old key stop working. Rotating without a restart needs the `{ "file": "path" }` form, since a process's environment variables do not change while it runs |
| `output.downloads.allowInsecureUrl` | false | Links under an `http://` `http.publicUrl` on a host other than loopback. Without it, the server does not start with such an address while links are on: a link is the credential, and it and its cookie would cross the network in clear text. With it, the start and `check-config` warn. Use it only on a network you trust |
| `output.downloads.signIn.clientId` | none | The browser client the person signs in with. Not `rest.signIn.clientId`, the [command line's client](sign-in.md#sign-in-cli-operator) |
| `output.downloads.signIn.clientSecret` | none (a public client with PKCE) | Its secret, a secret reference, sent as HTTP Basic (or in the form where the provider only takes `client_secret_post`) |
| `output.downloads.signIn.issuer` | `auth.issuer` | May be left out. When given, it must be `auth.issuer` exactly, since a link is bound to the issuer and subject of the caller's token, so the person signs in where the client did. The server does not start otherwise, and `check-config` stops with the same message. One that differs only in spelling (a trailing slash, case in the scheme or host, a default port) says to leave it out. Another issuer is refused with a pointer to [an issuer of its own](#sign-in-issuer) |
| `output.downloads.signIn.scopes` | `["openid"]` | What the sign-in asks for. Must hold `openid` |
| `output.downloads.signIn.tokenUrl` | the metadata's `token_endpoint` | The token endpoint the code (and the client secret) goes to, `https://`. Without it, the metadata's endpoint must be on the issuer's own origin. Set it for a provider that keeps it on another host |

`bind: "signIn"` needs `auth.mode: "oauth"`, `http.publicUrl` with `https://` and
`signIn.clientId`. The server does not start without them.

### An issuer of its own { #sign-in-issuer }

Some providers give each application an issuer of its own. A download sign-in there would need its
own issuer, different from `auth.issuer`. pivotkit does not support that yet.
[#441](https://github.com/eizedev/pivotkit/issues/441) tracks it.

Without `http.publicUrl`:

- A server on loopback puts its own address in links (`http://127.0.0.1:3333/downloads/...`).
- A server on any other address gives no links, with a warning at start and in `check-config`, so a
  link never shows an internal address.

The reports that get a link are stored with the link's 22 random characters before their name
(`Q3vB0rD3cE1fG9hI2jK4lM-sales-by-region.pivotkit-out.xlsx`). The result's `output.name` is that
stored name, and `output.filename` the name the person sees (`sales-by-region.xlsx`). Reports without
a link keep their names.

A report's file name comes from its title, or from the `name` the caller gives. The server rewrites
it so links and shells take it as it is:

- in lower case, with letters, digits, `.`, `_` and `-` only
- `-` for spaces, parentheses and any other character
- accents dropped; `ß` as `ss`, `Æ` as `ae`, `Ø` as `o`, `Ł` as `l`, `Þ` as `th`, `Đ` as `d`
  and the like
- where letters of another script are left out, `-` and 8 characters of the title's hash after
  it (`日本語2` is `2-cf1c61f6`, `日本の売上` is `report-1b501f78`), so two such titles
  get two names
- a name Windows keeps for a device (`con`, `nul`, `prn`, `aux`, `com1`, `lpt1` and the like),
  also with an extension (`nul.txt`), with `_` first
- cut at 80 characters

For example, `Orders (fake backend)` is stored as `orders-fake-backend.pivotkit-out.xlsx`. The title
stays the report's own: an MCP `resource_link` carries it as its `title`.

A key that cannot be read (a missing variable or file, shorter than 32 bytes) is a warning at start.
Until it can be read, reports get no link and keep their names, and their result says to ask the
operator.

## Sign-in links { #sign-in }

A sign-in link works in three steps:

1. It opens the provider's sign-in page in the browser: the OAuth 2.1 code flow with PKCE, `state`
   and `nonce`.
2. The sign-in comes back to `/downloads/callback`.
3. The server sends the file only when the ID token's issuer and subject are those of the access
   token the report was asked with. An ID token for several audiences must name this client as
   `azp`.

A HEAD of the link (a link preview) answers 200 with a short page, or the link's error, and starts
no sign-in.

Register at the provider:

1. A client for the browser (`signIn.clientId`), public with PKCE or confidential with a secret,
   with the redirect URI `https://reports.example.com/downloads/callback`. That is `http.publicUrl` +
   `/downloads/callback`, and `check-config` prints it.
2. Make the client resolve the same subject as the MCP client: `auth.subjectClaim` (default `sub`) is
   read from both tokens. Providers that give each application its own `sub` need a claim that is the
   same for every application, for example `oid` with Microsoft Entra ID. Check your provider's
   documentation. A claim such as `email` binds a link only as strongly as the provider checks that
   the address belongs to the person (and keeps it from moving to another account).

The link holds the person only as a keyed digest of the link's own random part, the issuer and the
subject. It does not tell who it is for, and two links of one person cannot be tied to each other.

ID tokens must be signed with a key from the issuer's key set: `auth.jwksUri`, else the metadata's
`jwks_uri` on the issuer's origin, as for access tokens (RS256, ES256 and the like). Tokens signed
with the client secret (HS256) are not accepted. The issuer's metadata, keys and token endpoint are
requested under the rules of [the server's issuer](mcp.md#oauth), so an issuer on a private address
needs `auth.intranet: true`.

Someone signed in as another account gets 403 "You are signed in as a different account than the one
that asked for this report." No session outlives the download: the short cookie that holds the
sign-in under way is cleared with the answer.

## One-time links { #once }

`bind: "once"` is your explicit choice for servers without a sign-in client. A GET (or HEAD) of the
link answers a short page, light or dark as the browser is set. It shows the file's name, kind and
size, until when the link works (in the browser's own time zone) and a Download button. The GET
never uses the link, so a chat client's link preview does not use it up. The button's POST sends
the file once.

After the click the page says "Downloaded once. You can repeat it for 2 minutes, in this browser."
That browser may repeat the download for two minutes, and its page says until when. Any other
browser gets 409 at once, on the GET too, without a button: "This link was already used. If you
downloaded the report earlier, look in the downloads of the browser you used. Otherwise ask whoever
made the report to make it again."

The POST must come from the link's own page. Its `Origin` is `http.publicUrl`'s origin: the page is
served with `Referrer-Policy: same-origin`, so the browser names it. A POST with `Origin: null`
and `Sec-Fetch-Site: same-origin` is accepted too.

Anyone who sees a one-time link can use it once, and an assistant with a browser or a code tool can
use it before the person does. `check-config` warns of that. Use `signIn` where it matters.

The server keeps which links were used, and which sign-ins came back, in `.pivotkit-downloads/` in
the output directory:

- For a sign-in, it keeps its `state`, so a callback replayed with the cookie from before it is
  refused.
- It makes one file per link or sign-in, exclusively, so replicas sharing the directory agree.
- At most 20 sign-ins a minute from one address write such a file. Over that, the page asks to wait.
  Behind a proxy, set `http.trustProxy`, or every person counts as the proxy's one address.
- The files go once their link or sign-in expired. They are swept every ten minutes, and on a
  one-time download.

## What a result holds { #result }

```json
"output": {
  "name": "Q3vB0rD3cE1fG9hI2jK4lM-sales-by-region.pivotkit-out.xlsx",
  "filename": "sales-by-region.xlsx",
  "url": "https://reports.example.com/downloads/eyJ2IjoxLC...Q.k3Jx...",
  "expiresAt": "2026-11-15T09:00:00Z",
  "bound": "signIn",
  "note": "Open the link in your browser and sign in; it works for 60 minutes.",
  "format": "xlsx",
  "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}
```

`url`, `expiresAt` and `bound` are there only when a link was given. After its text, the MCP tool
result adds a [resource link](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
(Tool Result, Resource Links):

```json
{ "type": "resource_link", "uri": "https://reports.example.com/downloads/eyJ2...", "name": "sales-by-region.xlsx", "title": "Sales by region", "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "annotations": { "audience": ["user"] } }
```

It carries `size` only for a report the assistant was shown in full. `audience` is a hint to the
client, not a protection: the binding is. The resource link goes only to clients that send
`MCP-Protocol-Version` 2025-06-18 or later, the revision that brought resource links. Older clients
get the link in the result's JSON alone. The result's `message` names the file, not the address. The
address is `output.url`.

## Answers { #answers }

A browser gets a short page with a title and heading of its own for each answer. Where the server
failed (status 500 or more), the page also shows the request's id. A program that asks for JSON
(`Accept: application/json`) gets a problem document like the
[REST service's](rest.md#errors), with `requestId`. A person quotes the id to the operator. The
operator finds it on the request's log line where there is one: its `download` line, or the debug
line of a link that does not exist.

| Status | Code | When |
| --- | --- | --- |
| 404 | `NOT_FOUND` | No such link: unknown, cut off, or signed with another key (all the same answer) |
| 410 | <a id="error-link-expired"></a>`LINK_EXPIRED` | The link expired, or its report was removed (`output.maxFiles`, `output.maxMb`, `output.maxAgeDays`) before it did |
| 409 | <a id="error-link-used"></a>`LINK_USED` | A one-time link that was used |
| 403 | <a id="error-link-not-yours"></a>`LINK_NOT_YOURS` | Signed in as another account than the one that asked |
| 403 | `FORBIDDEN_ORIGIN`, `FORBIDDEN_HOST` | A one-time link's POST from another page (`FORBIDDEN_ORIGIN`). A `Host` the server does not answer to (`FORBIDDEN_HOST`) |
| 400 | <a id="error-sign-in-failed"></a>`SIGN_IN_FAILED` | The sign-in did not complete. The page tells three cases apart. Cancelled or refused at the provider: "Not signed in". No sign-in of this browser under way, as after a reload, a tab left open for more than 10 minutes or a callback opened in another browser: "Sign-in page out of date". The ID token not valid: "Sign-in failed". Each says to open the download link once more |
| 503 | <a id="error-sign-in-not-ready"></a>`SIGN_IN_NOT_READY` | The server has not loaded the sign-in issuer's metadata yet (`Retry-After`) |

Every answer carries these headers:

- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer` (`same-origin` on a one-time link's page)
- `X-Robots-Tag: noindex`
- `X-Content-Type-Options: nosniff`
- `Cross-Origin-Resource-Policy: same-origin`

A file also carries `Content-Security-Policy: sandbox; default-src 'none'` and
`Content-Disposition: attachment`. A page carries `default-src 'none'`, with only its own style and
the button's script allowed by their hashes (`style-src`, `script-src`), `form-action 'self'` and
`frame-ancestors 'none'`.

Ranges are not served. A download request takes a body of at most 1 KiB.

## Upload to your store { #upload }

With `output.upload`, a report is written to `output.dir` and then uploaded to a store you name. The
result shows the store's link. You configure the store. A caller cannot name an address.

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
JSON `{ "filename": "sales-by-region.xlsx", "mediaType": "...", "bytes": 18234, "sha256": "<hex>" }`.
For a `bind: "signIn"` store, it adds `"subject"` (below).

`filename` is the report's stored name without its mark: lower case, letters, digits, `.`, `_` and
`-` only. A caller can choose it, so treat it as untrusted text. Never use it
unchecked as an object key or a path.

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
answer's `headers`. It shows `downloadUrl` as `output.url`, with `expiresAt`. Your credentials go to
the presign address only, never to `uploadUrl`.

Without a presign service, give an address template:

- `{id}` is random and required, so every report gets an address of its own that cannot be guessed
  from its name.
- `{name}` is the report's name as letters, digits, `.`, `_` and `-` (at most 80 characters).
- `{format}` is its format.

```json
"upload": {
  "url": "https://store.example.com/reports/{id}/{name}.{format}",
  "headers": { "authorization": { "prefix": "Bearer ", "value": { "file": "secrets/store-token" } } }
}
```

A `PUT` there makes the address itself the link. If the address has a query, `link` is required,
since a query may hold a signature. With `"method": "POST"`, `link` says where the answer names the
stored report: a JSON Pointer (`"/url"`) or `"header:location"`.

| Key | Default | What it is |
| --- | --- | --- |
| `output.upload.url` | none | An `https://` address template with `{id}` (required), `{name}` and `{format}` in its path or query. Use `presign` instead for a presign service |
| `output.upload.headers` | none | With `url`: headers sent to the store. A value is a text, or `{ "prefix": "Bearer ", "value": <secret reference> }`. `authorization`, `cookie` and names with `key`, `token`, `secret`, `auth` or `pass` take a secret reference only |
| `output.upload.link` | the address (`PUT` to an address without a query) | With `url`: a JSON Pointer into the store's answer, or `"header:location"`. Required for `POST` and for an address with a query. A query may hold a signature, such as a SAS token, which is never shown |
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
| `output.upload.keepLocal` | true | Keep the report in `output.dir` too. With `false`, it is removed once the store answered 2xx and the link was checked |
| `output.upload.bind` | `"none"` | What the store's links do, as you declare it. pivotkit does not check it. The values are `none` (anyone with the link), `once`, or `signIn` (the store checks the person) |
| `output.upload.intranet` | false | The store may be on a loopback or private address |

`output.upload` needs `output.dir` and cannot be combined with `output.baseUrl`.

Which reports go to the store:

| Source | `bind` | Delivery |
| --- | --- | --- |
| Open | any | Uploaded, with the store's link (`bound` is `bind`) |
| Closed | `once` | Uploaded, with the store's link. Over REST only for a caller with `results: true` |
| Closed | `signIn` | Uploaded for a caller signed in with an issuer and subject, with the store's link. Over REST only with `results: true`. A caller without a subject gets the server's own delivery |
| Closed | `none` | Not uploaded: a store whose links anyone can open never gets such a report. The server's own links apply (a sign-in link where configured), else no link |

Schedule drafts are not uploaded: the host approves them in `output.dir`.

With `bind: "signIn"`, the presign request carries `subject`. It is an HMAC of the caller's issuer
and subject under a key derived from `output.downloads.key` for this purpose alone. It is never the
subject itself, and never a value a sign-in link holds. The presign service can use it to scope the object
to the person and check it when they open the link.

- The value is the same for one person across reports, so the store can tell which reports belong to
  the same person.
- A program signed in with client credentials (a service account) has a subject too, usually its
  client. Its reports are bound to that client, so only a sign-in as the same service account opens
  them.
- Over stdio, or when the key cannot be read, no `subject` is sent.
- Without `output.downloads.key`, the server uses a random key per process, so the value changes on
  every restart and differs between replicas, and `check-config` warns of it.
- A `signIn` link is only as strong as the store's own access control. pivotkit declares the
  binding, it does not verify it.

What is checked:

- Every request goes through the same guarded fetch as [HTTP sources](sources.md#http): `https://`
  only, no redirects followed, cloud metadata and link-local addresses never, loopback and private
  addresses only with `intranet`.
- `uploadUrl` must be `https://` and on `allowOrigins`.
- The presign service may not ask for `host`, `content-length`, `content-type`, `content-encoding`,
  `expect`, `authorization`, `cookie`, `proxy-*`, `x-forwarded-*`, `forwarded` or connection
  headers, nor for line breaks in a value.
- A link must be `https://`, on `linkOrigins`, without a user name or password or control
  characters, and at most 2048 characters.
- Answers are read up to 64 KiB.
- At most two uploads run at once, and 32 wait for a slot. One more fails at once, retryable. The
  file is streamed from disk.
- A `PUT` is tried once more after a dropped connection or a 502, 503 or 504 while time is left. A
  `POST`, the presign request among them, never is.

When an upload fails, the caller gets `UPLOAD_FAILED` (502) with a fixed text, the request id and
`retryable` ([REST](rest.md#error-upload-failed), [MCP](mcp.md#errors)). The report stays in
`output.dir`, with `keepLocal: false` until it is cleaned up.

What went wrong is on the log only. The line `upload failed` names the request id and one of the
codes below. It never names an address, a header or what the store answered, since presigned
addresses and links are credentials. The caller never sees the code, since it would describe your
store's setup.

| Code | Meaning | What to check |
| --- | --- | --- |
| `TOO_LARGE` | The report is larger than `maxBytes` | `output.upload.maxBytes`, `output.maxMb` |
| `SECRET` | A header's secret cannot be read | The variable or file the header names; `check-config` says which |
| `TIMEOUT` | `timeMs` passed (waiting for a slot, presign and upload), or 32 uploads were already waiting | The store's speed, `timeMs`, how many reports are made at once |
| `PRESIGN_<status>` (`PRESIGN_403`, `PRESIGN_503`) | The presign service answered with this status | Its credentials (4xx), its health (5xx) |
| `PRESIGN_ANSWER` | The presign answer is not a JSON object | The presign service |
| `PRESIGN_<fetch code>` | The presign request failed: `REFUSED_ADDRESS`, `IP_LITERAL`, `NETWORK`, `REDIRECT`, `TOO_LARGE` (answer over 64 KiB), `BAD_ENCODING` | Its address, `intranet`, the service's answer |
| `UPLOAD_URL_<problem>` | The answer's `uploadUrl` was not used: `MISSING`, `LENGTH` (over 8192 characters), `CHARS` (control characters), `PARSE`, `SCHEME` (not `https://`), `USERINFO`, `ORIGIN` (not on `presign.allowOrigins`) | `presign.uploadUrl` (the pointer), `presign.allowOrigins` |
| `UPLOAD_HEADERS` | The answer's upload headers hold a refused name, a line break, or more than 20 entries | The presign service |
| `STORE_<status>` (`STORE_403`, `STORE_503`) | The store answered the upload with this status (a PUT after 502, 503 or 504 was tried twice) | The store's permissions (4xx), its health (5xx) |
| `STORE_<fetch code>` | The upload failed: `REFUSED_ADDRESS` (a metadata, loopback or private address without `intranet`), `IP_LITERAL`, `NETWORK`, `REDIRECT`, `BAD_BODY`, ... | The store's address, `intranet` |
| `STORE_ANSWER` | The store's answer has no JSON where `link` points into it | `output.upload.link`, the store |
| `LINK_<problem>` | The link was not shown: `MISSING`, `LENGTH` (over 2048 characters), `CHARS`, `PARSE`, `SCHEME`, `USERINFO`, `ORIGIN` (not on `linkOrigins`) | `link` (the pointer), `linkOrigins` |

`LINK_<problem>` and `STORE_ANSWER` come after the upload. The store then holds the report, with no
link given out for it. pivotkit does not delete it there, since it may not have the right to. Let
the store's own retention remove such objects.

`check-config` prints an `Upload:` section: the target (without its query), which sources' reports
go there, and where each header's secret comes from. Two cases are a `PROBLEM` the server starts
with:

- a header secret it cannot read
- a target that resolves to an address uploads refuse: an IP address, a metadata address, or a
  loopback or private one without `intranet`

Every upload fails until it is fixed ([reading check-config](rest.md#check-config)).

## Behind a proxy { #proxy }

Behind a proxy:

- Route `/downloads/` to the service besides `/mcp` and `/api/v1/`.
- Keep the `Host` header, or add the proxy's name to `http.allowHosts`.
- Set `http.publicUrl` to the origin people open, without a path.

The token is in the link's path, and proxies and browsers keep paths in their logs and history. That
is why plain links go only to reports over open sources. Keep proxy logs of `/downloads/` short, or
leave the path out of them.

The server's own log names a download's binding, outcome and request id, never its token. With
[`audit.subject`](mcp.md#logging) on, a sign-in link's line also names the person who signed in, as
a call's line does. That is who got the file, or who was refused with `LINK_NOT_YOURS`. A link that
does not exist is on the debug log only (`--log debug`), so a scan does not fill the log.

With more than one replica, set `output.downloads.key` (the same on every replica) and give them one
output directory (a ReadWriteMany volume), or run one replica. See [the container](container.md) and
[Kubernetes](../getting-started/kubernetes.md).

`output.baseUrl` (your own web server for the directory) is the alternative to these links. It gives
an address only to reports over open sources. A report over a closed source (data per person
included) carries no `url`, since anyone with the address could open a report whose fields were
withheld from the model, or another person's data. Such an address works as long as the file is
there, 30 days by default (`output.maxAgeDays`).

`check-config` prints a `Delivery:` section: where links point, which sources get which link, the
redirect URI to register, where the key and the sign-in client's secret come from, and the warnings.
A key or client secret it cannot read is a `PROBLEM` the server starts with. Until it is fixed,
reports get no links, or download links (signed in) fail after the person signs in.

## Reports and drafts in the output directory { #output-directory }

Reports stay in the output directory after their link expired, until `output.maxFiles`,
`output.maxMb` or `output.maxAgeDays` remove them. `output.maxAgeDays` is 30 by default: the server
deletes reports older than 30 days at start and every hour. `output.maxAgeDays: 0` keeps them with
no age limit. The default does not apply where the output directory holds the configuration or a
source, template or token file. `check-config` warns under `Retention:` when you set 0 while closed
sources or data sent in requests are on.

A schedule draft that waits for approval (`status` `"draft"`) does not expire unless you set
`output.draftMaxAgeDays`. Waiting drafts count against the drafts cap: half of `output.maxFiles`
(500 by default) and half of `output.maxMb` (512 MiB by default). The server never deletes them to
make room. Once they reach the cap, the server refuses new drafts until a person approves or
removes drafts. Renders keep working, unless drafts written under larger limits fill the directory
alone. So approve or reject drafts by changing their `status`, or remove them. A host may also
delete or move a draft instead of rewriting its `status`. A draft file that cannot be read or parsed, is over 1 MiB, or has no `status` that is a string
counts as waiting.
