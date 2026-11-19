---
title: Your own name and links
description: Run pivotkit-server and pivotkit-mcp under your own name - the name end users see, your own documentation address or no links at all, an icon, and your own page at / - for intranet and air-gapped deployments.
---

# Your own name and links

An intranet deployment can show its own name instead of pivotkit's. It can link its own copy of the
documentation, or no documentation at all. It can also send `/` to its own page.

- Every setting is optional. Without them, the server says pivotkit and links pivotkit.eize.dev.
- These are names and links only. The server never requests pivotkit.eize.dev, with or without them
  ([network requests](../security.md#network)).
- The same configuration works for `pivotkit-server serve` and `pivotkit-mcp --http`.

## The settings { #settings }

| Key | Default | What it does |
| --- | --- | --- |
| `branding.name` | `pivotkit` | The name end users and clients see. 1 to 60 characters, no control or direction characters |
| `branding.docsUrl` | `https://pivotkit.eize.dev/` | The base of every documentation link the server hands out. `null`: no documentation links at all |
| `branding.icon` | none | A PNG file of at most 64 KiB, relative to the configuration file. The icon of the MCP server and its page, served at `/icon.png` |
| `http.page.url` | none | `/` sends a browser to this address instead of the built-in page. A browser that opens `/mcp` goes there too |

```json
{
  "branding": { "name": "Team reports", "docsUrl": null, "icon": "team-icon.png" },
  "http": { "page": { "url": "https://intranet.example/reports-help" } }
}
```

The server checks the values at start. A wrong value stops the start and names the key.
`check-config` shows them in a section `Branding` ([check it](#check)).

## The name { #name }

`branding.name` replaces pivotkit's name where people and clients show it:

- the download pages: "Team reports report" in the title and over the heading, and the icon
- the MCP server's `serverInfo.title`, its page's title and heading
- the OpenAPI document's title: "Team reports REST"
- the OAuth metadata: `resource_name` "Team reports REST" for REST, "Team reports" for MCP

Two places need the name as a short identifier. The server makes one from it: lower-case letters,
digits and dashes, such as `team-reports`. A name without any of these gives `pivotkit`.

- the server's key in the client configurations on the MCP page, such as `"team-reports"`
- the `realm` of the 401 answer with static tokens: `team-reports` for REST, `team-reports-mcp` for MCP

## Documentation links { #docs }

Give `branding.docsUrl` the address of your own copy of this site. The server adds the same paths
as on pivotkit.eize.dev, such as `reference/rest/#error-source-not-found`. Zensical builds the site
from `docs/` in the repository. A copy of the published site works too.

With `branding.docsUrl: null`, the server hands out no documentation link:

- A REST error's `type` is `about:blank`, as RFC 9457 allows. Its `code` still names the error.
- The OAuth metadata of REST and MCP leave out `resource_documentation`.
- The OpenAPI document leaves out its documentation links.
- The MCP page leaves out its section "Documentation".
- `check-config` and the start error of mismatched versions leave out the link to the upgrading page.

The settings change the operator's output too:

- `check-config` links the upgrading page under your address.
- A download sign-in with another issuer [names your address](delivery.md#sign-in-issuer).
- `pivotkit-server source-from-openapi --config <file>` links its notes under the file's
  `branding.docsUrl`. It reads only that key of the file.

These still name pivotkit.eize.dev, since they name the format or the program:

- `$schema` in view files that `suggest_view`, `pivotkit render --save-view` and `pivotkit draft`
  write. It is a validation reference that nothing fetches. In the browser, pivotkit-react's
  [`schemaUrl`](react.md#prop-schemaurl) sets it.
- the `--help` texts of `pivotkit-server`, `pivotkit-mcp` and `pivotkit`

## The icon { #icon }

`branding.icon` names a PNG file of at most 64 KiB. The server reads it once at start. A missing
file, another format or a larger file stops the start.

- MCP clients get it in `serverInfo.icons` as a `data:` address, with its size.
- The MCP page and the download pages show it as their favicon. Their Content-Security-Policy then
  allows `data:` images.
- `/icon.png` serves it without sign-in. Without `branding.icon`, `/icon.png` is not found.

## Your page at / { #page }

With `http.page.url`, `/` answers 302 to your address. This also holds for a REST-only server
(`http.enable: ["rest"]`). A browser that opens `/mcp` goes straight there.

- The address is absolute, `http://` or `https://`.
- `http.page.url` and `http.page.sources` exclude each other: the server shows no page to list
  sources on.
- Without `http.page.url`, a REST-only server answers `/` with a 404 problem as before.

Behind a reverse proxy, forward `/` and `/icon.png` too ([behind a reverse proxy](rest.md#running)).

## What stays pivotkit { #stays }

Some names are identifiers. Renaming them would break clients, saved views and log pipelines, so no
setting changes them:

- the JSON Schemas and their `$id`
- the view file's `format: "pivotkit-view"`, the `.pivotkit.json` extension and `generator`
- the `x-pivotkit-*` keys, the signed tokens' `typ`, the download cookie's name, the `.pivotkit-out.`
  mark of reports and the browser's storage keys
- the names of tools, prompts and the skill, and the `PIVOTKIT_*` variables
- the MCP `serverInfo.name` (`pivotkit-mcp`), the log's `service` field, the image labels and the
  `User-Agent` headers
- the HTML report's `<meta name="generator">`. Your [print template](print-template.md) replaces the
  whole page.
- the MCP server's instructions and tool descriptions, which tell the model how pivotkit works

Exports carry no product name. An xlsx file names no author or company. CSV, JSON, SVG and PNG
files carry no metadata.

## Check it { #check }

`check-config` shows the branding when you set any of it:

```text
Branding:
  name: Team reports
  documentation links: none (branding.docsUrl null)
  icon: /srv/pivotkit/team-icon.png, 64x64 PNG
  page: / goes to https://intranet.example/reports-help, and a browser that opens /mcp too
```

An icon the server cannot use is a `PROBLEM` there that stops the start.
