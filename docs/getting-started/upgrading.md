---
title: Upgrading
description: How to update the command line, the services, the image and the plugin, and what changes between releases.
---

# Upgrading

The first section says how to update the command line, the REST service, the MCP server, the
container image and the Claude Code plugin. Each section after it lists what changes between two
releases and whom it concerns. **Breaking** marks a change that needs your action when it applies.

## Update an installation { #update }

Before you update, read the sections below from your version to the new one. Each package's
`CHANGELOG.md` has the full list. `npm view <package> version` names its newest release. For a
setup others rely on, update to a version you name and checked, not to whatever is newest.

### Installed with `npm install --global` { #update-global }

```bash
npm outdated --global       # which global packages have a newer release (exit code 1 when one has)
npm install --global pivotkit-server@<version> pivotkit-mcp@<version> pivotkit-cli@<version>
pivotkit-server --version
pivotkit-mcp --version
pivotkit --version
```

Update pivotkit-server and pivotkit-mcp in one command, to the same release. `pivotkit-server serve`
loads the pivotkit-mcp installed beside it. If you later change pivotkit-server alone, `serve` can
stop at start with "pivotkit-mcp <x> does not fit pivotkit-server <y>". With pivotkit-server 0.1.1
and earlier, the message is that a module "does not provide an export named ...". The sure sign is
that `npm ls -g --all` marks pivotkit-server under pivotkit-mcp as `invalid`. Then install both
again in one command.

- pivotkit-cli updates on its own.
- `npm update --global` updates every global package to its newest release, across minor versions
  too.
- Install global packages into a folder you own (npm's `prefix`), not with `sudo`.
- `npm audit signatures` checks the registry's signatures in a project only, not for global
  packages. To check a release first, install it into an empty folder and run `npm audit signatures`
  there. Then install it globally.

### In a project or an app folder { #update-project }

A project's `package.json` keeps a range, and `npm update` stays inside it. In 0.x a caret range
spans patch releases only: `^0.y.z` takes the later 0.y patches, never 0.(y+1). For the next minor
version, name it:

```bash
npm install <package>@<version>
npm audit signatures        # the registry's signatures of the installed packages
npx <command> --version
```

For the services, name pivotkit-server and pivotkit-mcp in one command at the same release, as for
[PowerShell Universal](mcp.md#psu-install).

### Started with `npx` { #update-npx }

`npx -y pivotkit-mcp` without a version asks the registry at each start and takes the newest
release. One exception: when the package is installed globally, or in the folder `npx` runs in or a
folder above it, `npx` runs that copy, whatever its version, without asking. Write the version into
the command:

- `npx -y pivotkit-mcp@<version>`: one release. Change it to update. Use this for a setup others
  rely on and for every shared configuration.
- `npx -y pivotkit-mcp@latest`: the newest release at each start, for a setup of your own. `-y`
  then runs code you have not looked at yet whenever a release comes out.

The same holds for `npx pivotkit-cli` and `npx pivotkit-server`.

### Restart what runs { #update-restart }

A running process keeps the version it started with. Restart it right after the update:

- An MCP client over stdio starts the server for a session. Restart the client, or start a new
  session.
- `pivotkit-server serve` and `pivotkit-mcp --http`: restart the process. Restart a Windows service
  by its name, for example `nssm restart pivotkit` for [the service under NSSM](mcp.md#psu-service).
  If `serve` stops at start with "does not fit" or "does not provide an export named",
  pivotkit-server and pivotkit-mcp do not fit together. See [above](#update-global).

### The container image { #update-image }

The image is built for each release of pivotkit-server, with pivotkit-mcp and pivotkit-cli of the
same commit. A release of pivotkit-cli or pivotkit-mcp alone reaches the image with the next
pivotkit-server release. Its [tags](../reference/container.md):

- `<version>` never moves.
- `<major>.<minor>` moves to each patch release of that minor version, never to the next minor
  version.
- `latest` is the image of the pivotkit-server release published last. That can be a new minor
  version with breaking changes. It can also be an older version again, when a patch of an older
  minor version comes out later. Not for production.

For production, use the exact version or its digest: `ghcr.io/eizedev/pivotkit@sha256:...`, the
digest the signature names. [Check the signature](../reference/container.md#verify) of the new image
before you restart. Pulling a tag does not change a running container, so make the container again:

=== "docker run"

    ```bash
    docker pull ghcr.io/eizedev/pivotkit:<version>
    docker rm -f pivotkit
    # then the same docker run as before, with the new tag
    ```

    The token, the keys and the reports stay in the volume `pivotkit` (`/var/lib/pivotkit`). Reports
    of a configuration that names `/out` stay in that volume. `docker rm` does not remove a volume.

=== "Docker Compose"

    [docker/compose.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.example.yml)
    takes the tag from `PIVOTKIT_VERSION`, in the shell or in a `.env` file beside it. Set it to the
    new release, then:

    ```bash
    docker compose pull
    docker compose up -d
    ```

    With `<major>.<minor>`, each `pull` takes that line's newest patch. Check its signature too.

=== "Kubernetes"

    Write the exact version or the digest into the manifest, never `latest` or `<major>.<minor>`:

    - With `latest`, Kubernetes pulls on every start, since `imagePullPolicy` defaults to `Always`.
    - With another tag, a node that pulled it once keeps that image (`IfNotPresent`).

    To update, change the tag and apply the manifest again, or use `kubectl set image`. The example
    of [Kubernetes](kubernetes.md) replaces the pod (`strategy: Recreate`), as one output directory
    takes one server process.

Check the versions inside the image:

```bash
docker run --rm ghcr.io/eizedev/pivotkit:<version> --version
docker run --rm ghcr.io/eizedev/pivotkit:<version> mcp --version
docker run --rm ghcr.io/eizedev/pivotkit:<version> cli --version
```

### The Claude Code plugin { #update-plugin }

The plugin `pivotkit-mcp@pivotkit` holds only [the skill](mcp.md#skill). Updating it does not update
the server, and updating the server does not update the skill. Update both:

```bash
claude plugin marketplace update pivotkit
claude plugin update pivotkit-mcp@pivotkit
```

Then restart Claude Code.

## From 0.6 to 0.7 { #from-0-6-1 }

!!! warning "Copy schedule drafts out of `output.dir` first"
    This applies to pivotkit-server and pivotkit-mcp 0.1.1 too, which move to 0.2.0 with pivotkit
    0.7. At their first start, pivotkit-server 0.2.0 and pivotkit-mcp 0.2.0 delete reports **and
    schedule drafts still waiting for approval** older than 30 days from `output.dir`
    ([why](#max-age-default)). Drafts are the files `*.pivotkit-out.report.json`. Reports are the
    other `*.pivotkit-out.*` files. Copy those you want to keep elsewhere before you update, or set
    `output.maxAgeDays: 0`. Run the `check-config` of 0.2.0 first. It counts the drafts and reports
    the first start would delete.

Operators of pivotkit-server and pivotkit-mcp need not act for the exposure policy. Every field
keeps its level, and the automatic values rule and the new operator controls are off. Check these:

- Library hosts with code sources: [Code sources](#code-sources).
- Over HTTP with an output directory: the [download links](#download-links). Reports may get links
  of the server under `/downloads/`. `output.baseUrl` no longer gives an address to reports over
  closed sources.
- With OAuth and an issuer on a private address, in your LAN or your cluster: set
  [`auth.intranet: true`](#issuer-requests).

What callers notice:

- A filter item that is none of a `show` field's values gets the warning `itemUnknown`, where
  `describe_source` lists all of them. `itemCase` comes for a `show` field also when the view uses
  other fields.
- `describe_source` adds `complete` to `show` fields, and `withheld` with a `hint`.
- A withheld render's `message` reads "results over fields that are not fully shown (...) stay in
  the file".

| Change | Applies to you when | Action |
| --- | --- | --- |
| [Tokens and keys made at the first start](#first-start-0-7) | you run the container image, or start pivotkit-server or pivotkit-mcp with `--state-dir` | mount a volume at `/var/lib/pivotkit`; read the token with `pivotkit-server token show admin`; the example files are `compose.example.yml` and `pivotkit.example.json` (minimal) and `compose.secrets.example.yml` and `pivotkit.secrets.example.json` (tokens of your own) |
| [Versions move together](#versions-0-7) | you also install pivotkit-core, pivotkit-report or pivotkit-xlsx yourself, or pivotkit-server and pivotkit-mcp side by side | update them to the same release |
| [Data as of in files](#data-as-of-files) | people read html or xlsx reports from the REST service or the MCP server, or your code passes `dataAsOf` | nothing; a print template of your own may add `{{dataAsOf}}` |
| [Groups, a default profile, source scopes, the person in the log](#operator-controls) | you want profiles by group, a profile for everyone else, the sources' scopes in the OAuth metadata, or the person in the log | set `auth.groupProfiles` with `auth.defaultProfile`, `auth.offerSourceScopes`, `audit.subject` |
| [The values level](#values-level) | a model or a program should find the exact names of a category | give such fields `values`, or switch on `policy.autoValues`, then run `check-config` |
| [Findings carry their field](#findings-field) | a client reads `findings` | accept the optional `field`, the code `itemUnknown` and an unknown `level` |
| [Request ids](#request-ids) | you parse the log or MCP tool errors, or a program reads problem documents | accept the new members and the id at the end of a tool error |
| [Code sources](#code-sources) | you embed pivotkit-server or pivotkit-mcp with a source that has `load` | check the time limit, the per-caller cache and `cacheShared`; read `stale`; reports are computed in a worker under `compute.*` |
| [HTTP sources](../reference/sources.md#http) | you want an API's data as a source without writing code | add `sources.<id>.http` with typed `params` (or let `pivotkit-server source-from-openapi` propose them from the API's OpenAPI document), test it with `pivotkit-server check-source` |
| [Backend sign-in](../reference/sources.md#http-auth) | the API needs credentials, or each person should see only their own rows | add `http.auth` (a secret header, client credentials or a token exchange) or a parameter with `claim`; for a token exchange, restrict the exchange at your provider |
| [Data in the request](#data-in-request) | you run the MCP server, or a program should send its own data over REST | nothing, or `mcp.data: false` to switch it off on MCP; `data: true` in a profile to allow it on REST |
| [Download links](#download-links) | the server serves HTTP and has `output.dir` | route `/downloads/` to it, set `output.downloads.key`, and for closed sources a sign-in client; or set `output.downloads.enabled: false` |
| [`output.baseUrl` and closed sources](#base-url-closed) | you set `output.baseUrl` | reports over sources with a field that is not `show` carry no `url` any more |
| [Requests to the issuer](#issuer-requests) | `auth.mode` is `oauth` and the issuer resolves to a loopback or private address, is reached through a proxy, redirects, or serves a key set over 256 KiB | set `auth.intranet: true` for an issuer in your LAN or cluster; run `check-config` |
| [Reports and drafts deleted after 30 days](#max-age-default) | the server has `output.dir` in a directory of its own and no `output.maxAgeDays` | copy the schedule drafts and reports you want to keep out of `output.dir` before you update, or set `output.maxAgeDays: 0` |
| **Breaking:** [download links over plain http](#download-links-http) | `http.publicUrl` is `http://` on a host other than loopback, with `output.dir` | use `https://`, or set `output.downloads.allowInsecureUrl: true` for a network you trust, or `output.downloads.enabled: false` |
| [Columns without a header](#columns-without-header) | a file source has rows longer than its header, or a blank header cell, under `"default": "show"` | name such a column in `fields` if it should be shown; run `check-config` |
| [Rows longer than the header](#long-rows) | a file or CSV answer has rows wider than its named header (other than a separator that ends every line), and a caller sees a field below `show` | fix those rows (quote values with the separator in them); until then they are left out, with a `ROWS_DROPPED` note; `check-config` counts them |
| [Request limits per person](#limits-per-person) | people sign in through one OAuth client | nothing; each person gets `rateLimit` and `concurrency` of their own |
| [The log](#log) | you read the log on a terminal, parse it, alert on it, or ship it to a log server | JSON lines gain fields and the client's address is logged by default (`log.address: "off"` keeps it out); levels and `msg` are new, and more refusals get a line; on a terminal the log is text unless `log.format` is `json`; a start error is a JSON line where stderr is no terminal |
| [check-config's layout](#check-config-layout) | you read `check-config`'s output in a script | use its exit code, or its first line, which says whether the server starts |
| [Print templates checked at start](#template-at-start) | a source has `sources.<id>.template` | run `check-config`; fix a template it reports as a PROBLEM |
| [HTML reports on a dark screen](#dark-mid-colour) | your reports or print templates set a colour scale's middle colour (`--pk-scale-mid`), or pass `tokens` with quoted strings | pass the middle colour in `darkTokens` to keep one on a dark screen |
| **Breaking:** [`tokens` and `darkTokens` that are no object](#tokens-object) | your code passes pivotkit-report's `render` a `tokens` or `darkTokens` that is a text, a list, `null` or a number | pass an object, or leave the option out |
| [Loopback addresses](#loopback) | the server listens on `127.1`, `127.0.1` or a host name that starts with `127.` | write `127.0.0.1`, or set `auth` |
| [Report file names](#report-names) | a script finds reports in `output.dir` by name | match the name with its parentheses |
| [Command line](#cli-next) | a script reads `pivotkit`'s error text | read the exit code or `--json` |

Before you connect a cloud model to a server you upgraded, read [what reaches an AI
model](../model-data.md). It shows the answers a model gets at each level, and how to give each
client its own profile.

### Tokens and keys made at the first start { #first-start-0-7 }

The container image starts without any setup. `docker run -v pivotkit:/var/lib/pivotkit <image>`
serves its built-in example and makes the token `admin` at its first start
([Server in 5 minutes](server-in-5-minutes.md)). What changes for an existing installation:

- The image sets `PIVOTKIT_STATE_DIR=/var/lib/pivotkit`. Outside the image, use `--state-dir <dir>`.
  With a state directory, the server makes there what is missing
  ([made at the first start](../reference/rest.md#first-start)):
    - the token `admin`, when auth needs a token and none is given
    - the key of the download links, when `output.downloads.key` is not set
    - the audit key for `audit.subject` `"hash"` without `audit.key`

    Download links and audit hashes then stay the same after a restart, as long as the directory is
    on a volume.
- A start with `auth.mode` not set on an address off loopback was refused. With a state directory
  it now starts with the token `admin`. Without one it is refused as before. In the image,
  `-e PIVOTKIT_STATE_DIR=` turns it off.
- `auth.mode` `"token"` with neither `auth.tokens` nor `$PIVOTKIT_TOKEN` is still refused. The
  message says how to fix it: set the variable, or remove `auth.mode` to use the generated `admin`.
  A misspelt variable never turns into a token with every scope.
- A configuration that names its tokens, or `$PIVOTKIT_TOKEN`, gets no `admin`.
- A read-only container without a volume at `/var/lib/pivotkit` warns at every start that the
  download links' key cannot be made. Add `-v pivotkit:/var/lib/pivotkit` to keep links across
  restarts.
- The image declares no `VOLUME` any more. Before, `/out` was an anonymous volume.
  - A `--read-only` run without `-v ...:/out` can no longer write reports there. The start warns
    that `output.dir` is on a read-only file system, and each report fails with `NO_OUTPUT`. Mount a
    named volume: `-v pivotkit-out:/out`, or move `output.dir` to `/var/lib/pivotkit/out` on the
    state volume.
  - Without `--read-only`, reports go into the container and are lost with it.
  - Reports of earlier runs stay in the old anonymous volume. `docker volume ls` lists it (a long
    hexadecimal name). Copy what you need out of it, then remove it.
- On a read-only root without a volume at `/var/lib/pivotkit`, the server cannot make the token. The
  start is refused and says which volume to mount. Without `--read-only` and without a volume, the
  server starts and warns that you lose the token and keys with the container.
- An empty `/config`, with nothing mounted there, starts the built-in example instead of refusing.
  It serves the example data only. A mounted `/data` needs `files.allowDirs` in a configuration. A
  `/config` with other files but no `pivotkit.json` is refused, and the message names those files.
- `pivotkit-server` is on the image's `PATH`: `docker exec <container> pivotkit-server token show admin`.
- `docker/compose.example.yml` and `docker/pivotkit.example.json` are the minimal setup now, with the
  volume `pivotkit` and no secrets. The tokens as secret files moved to
  `docker/compose.secrets.example.yml` and `docker/pivotkit.secrets.example.json`. A copy you made of
  the old files keeps working.
- `auth.tokens[]`, `output.downloads.key` and `audit.key` take `"create": true`. pivotkit then makes
  the file where it is missing. `create` on any other secret, or with `env`, is refused.

### Versions move together { #versions-0-7 }

Each package depends on the others of the same release, and in 0.x a caret range admits one minor
only. A host may also list pivotkit-core, pivotkit-report or pivotkit-xlsx itself. It then updates
them to the versions released with pivotkit-react 0.7: pivotkit-core 0.7.0, pivotkit-report 0.3.0
and pivotkit-xlsx 0.4.0. Otherwise npm installs two copies. pivotkit-server 0.2.0 and pivotkit-mcp
0.2.0 belong together the same way: [update them in one command](#update-global).

### Data as of in files { #data-as-of-files }

An html report's details, the default template's `{{details}}`, add "Data as of" with when the data
is from. A print template may place it with `{{dataAsOf}}`. An xlsx file carries it as the custom
document property `DataAsOf`.

Both appear only where the report is given that time:

- The REST service and the MCP server pass it, as the results' `dataAsOf`.
- pivotkit-report's `render` takes it as its [`dataAsOf` option](../reference/report.md).
- The command line passes none. So a report it renders from a local file carries none.

A print template of your own shows it only where it uses `{{details}}` or `{{dataAsOf}}`. The
Minimal example uses `{{details}}`. The Corporate example writes its own footer without it. Add
`{{dataAsOf}}` there where your reports always come from a service. csv, json and svg carry it in
the result only.

### check-config's layout { #check-config-layout }

`check-config` prints, in this order:

1. whether the server starts, and how many problems and warnings it found
2. every `PROBLEM` with what it does: `-> the server does not start`, or what fails while the server
   runs
3. every `WARNING` with its section
4. the sections, one fact per line, wrapped at 78 columns

What was `NOT FOUND` or `NOT WRITABLE` is a `PROBLEM` line. It says "would not start" only for what
`serve` refuses. A missing source file, backend secret, download key or upload secret starts the
server. With OAuth, `check-config` asks the issuer for its public metadata once, for 3 s at most. It
warns when it cannot load them. The exit code is as before: 1 for any problem
([reading check-config](../reference/rest.md#check-config)).

The start may refuse a configuration outright: an unknown key, a value out of range, a rule between
keys. Then `check-config` ends at that message. The warnings of the later checks show once you fix
it.

### Print templates checked at start { #template-at-start }

The server reads and checks each source's print template (`sources.<id>.template`) at start, as an
html report reads it. These templates keep the server from starting:

- a template the parser refuses, for example
  `sources.sales.template: unknown placeholder {{titel}} (line 7); did you mean {{title}}?`
- a template over 1 MiB
- a template that is not a regular file

`check-config` reports the same message as a PROBLEM line.

A template file that is not there or cannot be read is treated like a missing source file. The
server starts with a warning, and `check-config` reports a PROBLEM the server starts with. That
source's html reports fail until the file is there. A template changed after the start is checked
again on every html report, as before.

### Groups, a default profile, source scopes, the person in the log { #operator-controls }

All of them are off until you set them ([profiles](../reference/rest.md#profiles),
[scopes](../reference/mcp.md#scopes), [logging](../reference/rest.md#logging)):

- `auth.groupProfiles` maps an OAuth token's groups to policy profiles. The first match wins, after
  a client's profile. A token whose group list is cut or missing gets `auth.defaultProfile`, or 403
  without one. A person in none of the groups, with no client or scope profile, is refused with 403
  as well, unless `auth.defaultProfile` gives them a profile.
- `auth.defaultProfile` is the profile of every signed-in caller that no token, client, group or
  scope names. That includes a static token without a profile.
- `auth.offerSourceScopes: true` lists the sources' scopes in the OAuth metadata
  (`scopes_supported`). Define them at your provider first. A client that asks for every listed scope
  can be refused for one the provider does not know. The metadata is public.
- An empty `list_sources` (REST `GET /sources`) for a sign-in that lacks the sources' scopes has a
  `hint`.
- `audit.subject: "hash"` or `"plain"` adds the person (`auth.subjectClaim`) to the `call`,
  `request` and `download` log lines. `"hash"` writes a keyed hash, `"plain"` the claim as it is.
  `audit.key` has at least 16 characters.

### The values level { #values-level }

A field at `values` lists every distinct value as a complete list in `describe_source`
(`complete: true`). A result over it stays withheld, as for `summary`. To use it:

1. Give category fields the level in `fields` (`"Status": "values"`). Or switch on the automatic
   rule with `"policy": { "autoValues": true }`. Then text fields that look like categories get
   `values` where no `default` is written ([the rule](../reference/mcp.md#auto-values)). The rule
   never applies to a caller bound to a profile or to a `file:` path.
2. Run `check-config` (`pivotkit-server check-config` or `pivotkit-mcp --check-config`). It prints
   each field's level and why. With the rule off, it prints the fields the rule would list.
3. To give one group more, bind a profile to its OAuth scope (`auth.scopeProfiles`,
   [example](../reference/rest.md#profiles)).

`"autoValues": false` or a written `default` keeps every field as it is.

### Findings carry their field { #findings-field }

A finding about a field's items has `field`.

- `itemCase` is sent for a `show` or `values` field.
- The new `itemUnknown` is sent where a field's values are listed completely. It marks an item that
  is none of the field's values, with the closest one as the `suggestion`.
- `noRowsKept`, `filterEmpty`, `tableCut` and `chartCut` stay for views whose fields are all `show`.
- `describe_source` may add `withheld`, `hint`, `complete` and `auto`.
- A client reads a `level` it does not know as `summary`.

### Download links { #download-links }

A server that serves HTTP and has an output directory, without `output.baseUrl`, serves reports
itself under `/downloads/<token>` for 60 minutes ([download links](../reference/delivery.md)):

- Reports over open sources get a plain link. A source is open with `"default": "show"` and no field
  below `show`, in every profile. Listing every column as `show` is not enough.
- Reports over other sources get a link only in two cases: with a sign-in client
  (`output.downloads.signIn`, with OAuth), or with one-time links you switch on
  (`output.downloads.bind: "once"`). With static tokens and the default `summary`, such reports get
  no link, as before. Their result says to ask you for the file.
- A report that gets a link is stored with 22 random characters before its name. `output.name` is
  that stored name. The new `output.filename` is the plain one. Reports without a link keep their
  names.
- Results with a link carry `url`, `expiresAt`, `bound`, `note` and `filename`. MCP results for
  clients of protocol 2025-06-18 or later also carry a `resource_link`. The `message` names the file
  and leaves the address to `output.url`.
- `/downloads/` answers without a token: the link is the credential. Keep it out of logs and
  chats as you would a token.
- Off loopback, the links need `http.publicUrl`. Route `/downloads/` to the server at the proxy or
  ingress. Set `output.downloads.key`, a secret of at least 32 bytes. Otherwise links stop working on
  a restart and differ between replicas.

`"output": { "downloads": { "enabled": false } }` keeps the old behaviour. `check-config` prints a
`Delivery:` section with what applies.

### `output.baseUrl` and closed sources { #base-url-closed }

With `output.baseUrl`, a report over a source with a field at `values`, `summary` or `hide` carries
no `url` any more, on MCP and REST. That holds when the field has that level for anyone, in any
profile. Anyone with the address could open a report whose fields were withheld from the model. The
file is still written. Reports over sources whose fields are all `show` keep their address. For the
others, leave out `output.baseUrl` and use sign-in links. Or give REST programs `results: true` and
the [file route](../reference/rest.md#downloads).

### Reports and drafts deleted after 30 days { #max-age-default }

Copy the schedule drafts you want to keep out of `output.dir` before you update. Drafts still waiting
for approval are deleted with the old reports.

`output.maxAgeDays` is 30 by default. At start and every hour, the server deletes reports and
schedule drafts older than 30 days from the output directory. That includes drafts waiting for
approval. Before, they stayed until `output.maxFiles` or `output.maxMb` pushed them out. Set
`output.maxAgeDays` to another number of days, or to `0` for no age limit, the old behaviour.

The default applies only to a directory of the reports' own. `output.dir` may hold the configuration
or a source, template or token file. Then nothing is deleted by age, and the server starts as
before. `check-config` says "no age limit: the directory holds other files" under `Output:`. It also
warns that a full directory there refuses new reports.

Each sweep that deletes something writes an `info` line with the counts of `reports` and `drafts`.

### Download links over plain http { #download-links-http }

Download links are on with HTTP and `output.dir`, without `output.baseUrl`. Then the server no
longer starts with an `http://` `http.publicUrl` on a host other than loopback. A link is the
credential, and it and its cookie would cross the network in clear text. Choose one:

- Put the server behind TLS and write `https://`.
- Set `output.downloads.allowInsecureUrl: true` for a network you trust. The start and
  `check-config` then warn.
- Switch the links off with `output.downloads.enabled: false`. That turns off every download link,
  the https ones too.

`http://localhost` and `http://127.0.0.1` work as before.

```json
{ "http": { "publicUrl": "http://reports.lan:3333" },
  "output": { "dir": "reports", "downloads": { "allowInsecureUrl": true } } }
```

### Columns without a header { #columns-without-header }

A column the file gives no name is `hide`, whatever the policy's default. Such a column comes from a
blank header cell, or from a row with more values than the header, which an unquoted separator
inside a value causes. Its values may be another column's, shifted. Before, it took the default. So
under `"default": "show"` a hidden column's value could be shown there. A rule that names it
(`"Column 7": "show"`) still holds. `check-config` prints such a column as `hide`. It warns of
`"default": "show"` with hidden fields.

### Rows longer than the header { #long-rows }

This applies where a caller sees any field below `show`: the default or a rule is `values`,
`summary` or `hide`, the shipped default `summary` included.

An unquoted separator inside a value can shift a row's cells. The values after the stray separator
shift one column to the right. So a value kept back would land in a shown column. The server
therefore leaves out such a row whole. The answer's notes say how many with `ROWS_DROPPED`.

- Such a row has more cells than the named header, not counting its empty cells at the end.
- A file whose every row is as wide and ends with a separator has no shift and keeps its rows. That
  holds with or without a separator at the end of the header.
- In a file with mixed row widths, every row wider than the named header is left out. A file where
  only some rows end with a separator loses those rows. If every row is wider, it loses all of them.
  `ROWS_DROPPED` gives the count.
- A source whose fields are all `show` keeps every row. Extra values go into a hidden `Column N`.
- `check-config` counts such rows per source by the source's own policy. So a caller whose profile
  sees fewer fields can lose rows `check-config` does not warn about.

To keep the rows, quote values that hold the separator. A shifted row as wide as the header cannot
be caught. So use quoted CSV, xlsx or JSON for sources with fields kept back.

### Request limits per person { #limits-per-person }

`rest.rateLimit`, `rest.concurrency`, `mcp.rateLimit` and `mcp.concurrency` count per person, no
longer per OAuth client. A person is the issuer and subject of an OAuth token, or a static token's
name. So people who sign in through one client no longer share 120 requests a minute and 4 at once.

- An OAuth token without a subject counts for its client.
- The people of one client together get eight times the rate. They run at most eight times
  `concurrency` requests at once.
- Make sure `auth.subjectClaim` names a claim your provider does not let users change.

### Request ids { #request-ids }

The `call`, `request`, `download`, `refused` and `error` log lines carry `requestId`. Every REST
problem document carries it too. Every MCP tool error ends with `(request id ...)`. A person gives the
id to the operator.

- On MCP, an `INTERNAL` error says "internal error", as REST does, instead of its own words.
- A body over the cap gets a `refused` log line.
- `check-config` warns of a static token's file that other users of the machine can read.
- `check-config` closes with "New in this version" where a change applies to the configuration.

### The 401 without a token { #no-token-text }

A request without a token gets a 401 whose detail says `send Authorization: Bearer YOUR_TOKEN`. It
said `<token>`, which PowerShell's error details leave out. A script that matches the old text needs
the new one. The status and the `WWW-Authenticate` header are the same.

### The log { #log }

[Operations and logs](../reference/operations.md) describes the log as it is now. What an existing
installation notices:

- On a terminal the log is text (`key=value` pairs), not JSON, since `log.format` is `auto`. Where
  stderr is no terminal, it stays JSON: in a container without `-t`, under a service manager, in a
  pipe. The container image sets `PIVOTKIT_LOG_FORMAT=json`, so containers keep JSON also under
  `docker run -t`. To keep JSON everywhere, set `log.format: "json"` or `--log-format json`.
- JSON lines gain fields. None is renamed or removed.

    | Lines | New fields |
    | --- | --- |
    | every line | `level`, `severity`, `msg`, `service`, `version` |
    | a request's lines | `traceId`, `upstreamRequestId` (a proxy's `X-Request-Id`), the client's `address` |
    | `call`, `request`, `download`, `refused` | `outcome`, `status` |
    | `refused` | `reason` |
    | backend warnings | `cause`, `backend`, `upstreamStatus`, `upstreamMs` |
    | `started` | `sourceIds`, the log's settings, the static tokens' names |

    An HTTP server ends with a `stopped` line.
- The client's address is logged by default as `address`:
    - With `http.trustProxy`, it is the forwarded client, as before. A forwarded value that is no IP
      address is logged as `invalid`.
    - Without `http.trustProxy`, it is the connection's own address, which was not logged before.
    - `peerAddress` is the connection's own address where it differs: the proxy.
    - `log.address: "off"` keeps both out ([privacy](../privacy.md#logs)).
- A log line names a source by its configured id, `inline:` or `file:`. Anything else a caller typed
  is `unknown`, never the caller's text. An alert on a misspelt source id reads `unknown`. No setting
  brings the text back.
- More refusals get a `refused` line:
    - at `warn`: the per-caller 429s, `/openapi.json` with a refused token, an MCP body over the cap,
      and requests the HTTP parser refuses
    - at `debug` only: a GET of the MCP endpoint, and a path nobody serves

    An alert on refused lines counts them too.
- `--log` takes `warn` and `error` too. `log` in the file may be an object of `level`, `format`
  and `address`. `"log": "debug"` keeps working.
- Every answer carries an `X-Request-Id` header. CORS exposes it to browsers.
- An error at the start of `serve` or `pivotkit-mcp` follows the log's format. Such errors are a
  configuration it cannot read, or an unknown flag.
    - It is a JSON line where stderr is no terminal (a container, a service manager, a pipe), or
      where JSON is asked for.
    - It is the plain `pivotkit-server: ...` line on a terminal, or with `--log-format text`.

    A script that reads that line from a pipe reads JSON now. Only `serve` and `pivotkit-mcp` write
    start errors as JSON. check-config and the other commands of `pivotkit-server` stay plain text.

### HTML reports on a dark screen { #dark-mid-colour }

On a dark screen, an html report no longer takes a colour scale's middle colour from the light
colours, that is from `tokens` or a print template's light rules. Its cells run halfway between the
dark low and high colours. A view's own colours are mixed fainter (30 %), as on the page. Paper and
print stay light. To keep a middle colour on a dark screen, pass it as `--pk-scale-mid` in
pivotkit-report's `darkTokens` ([options](../reference/report.md#options)). Or set it in a print
template's dark rule ([theming](../reference/theming.md)).

A host's `tokens` or `darkTokens` value that holds a quoted string is left out, and the default
stands in. `font-family` is the exception. Write such a colour without quotes.

### `tokens` and `darkTokens` that are no object { #tokens-object }

**Breaking** for code that passes such a value. pivotkit-report's `render` refuses `tokens` or
`darkTokens` that is no object, such as a CSS text, a list, `null` or a number. It answers with
`INVALID_OPTION` and `details.option`. Before, such a value gave the default colours without a word.
Pass an object of `--pk-*` names and values, or leave the option out (`undefined`, not `null`).

### Loopback addresses { #loopback }

Only literal loopback addresses count as loopback: `127.0.0.1` and the rest of `127.0.0.0/8` written
in full, `::1` and `localhost`. These are no longer loopback:

- a listen host written short, such as `127.1` or `127.0.1`
- a host name that starts with `127.`, such as `127.example.com`

So the server needs `auth` there, or `--allow-unauthenticated`. Write `127.0.0.1`.

### Report file names { #report-names }

Reports and drafts the server writes into `output.dir` keep parentheses in their names. A report
named "Orders (fake backend)" is stored as `Orders (fake backend).pivotkit-out.xlsx`, not
`Orders -fake backend.pivotkit-out.xlsx`. `output.name`, `output.filename` and a presign request's
`filename` follow. Files `pivotkit render -o` writes keep the name you give, as before.

### Command line { #cli-next }

- Usage errors end with `run "pivotkit <command> --help"`, and unknown options and commands read
  `unknown option "--bogus"`. Scripts read the exit code or `--json`, not the text.

### Code sources { #code-sources }

This section is for library hosts whose sources have `load` ([code sources](../reference/sources.md#code)).
It applies when they update pivotkit-server from 0.1.x or pivotkit-mcp from 0.1.x to 0.2.0:

- `load` is called as `load(params, { caller, signal })`, and `version` as `version(params,
  { caller })`. That holds also without declared `params`, which are then `{}`.
    - A `load()` that takes no arguments works as it is.
    - A `load` whose first parameter has a default of its own now gets `{}` there.
    - A `version` that returns a promise is refused (`SOURCE_UNAVAILABLE`). Return the value itself.
- A load is aborted after 30 s (`timeMs`, at most ten minutes). It is also aborted when every request
  waiting for it went away: a REST client that closed its connection, or an MCP call over HTTP whose
  connection closed. Pass `signal` on to `fetch` or your database client.
- Loaded data is kept per caller, and per values and policy levels, not per source. A `load` that
  gives every caller the same data sets `cacheShared: true`. It then gets `caller: null`. Without
  `version` and `ttl`, nothing is reused, as before. Parallel calls for the same data share one load.
- The process keeps at most `sourceCache.maxMb` of loaded data (256 MiB). Each person or shared
  source gets a quarter of it. So a table over 64 MiB is loaded again on every call, and the log warns
  once an hour. To keep it, raise `sourceCache.maxMb` ([bounds](../reference/sources.md#code-cache)).
- A `load` whose data differs per caller, where each person sees their own rows, sets
  `perPerson: true`. Its reports then get only links the person who asked can open, or none. Without
  it, the server's [download links](#download-links) treat the source by its fields. A source whose
  fields are all `show` then gets plain links anyone with the link can open.
- A load may fail transiently: the time limit, a network error, or a `SourceError` with
  `transient`. It then answers with the data last loaded for that caller, up to an hour old, and
  `stale: { since }` in the result. `maxStale: 0` turns it off.
- An error a load throws answers `SOURCE_UNAVAILABLE` (502) with a fixed text, instead of `INTERNAL`
  (500). To answer `NOT_ALLOWED`, `INVALID_INPUT` or `DATA_NOT_AVAILABLE` with your own words, throw
  a `SourceError`.
- The data has a file's limits: `limits.rows`, `limits.columns` and `limits.importCells`
  (`LIMIT_EXCEEDED`). Texts are cut at `limits.textLength`.
- The report over a code source's data is computed in a worker, as for a file
  ([where it runs](../reference/sources.md#code-thread)). It answers:
    - `TIMEOUT` after `compute.timeMs` (30 s)
    - `LIMIT_EXCEEDED` over `compute.memoryMb` (1024 MB)
    - `BUSY` when no worker is free within `compute.queueMs`

    A host that computed long reports over its own data raises these, or `compute.workers`.
- `checkConfig(options)` first checks the options as `createContext` does, and throws the same
  `ConfigError`. Its second argument is optional. A host that called it with options
  `createContext` refuses gets that error now.

`check-config` given these options lists each code source with its time limit and how its data is
kept.

### Data in the request { #data-in-request }

The MCP tools that take a source offer `data`, a small table the model sends with `source`
`inline:`. It holds at most 500 rows, 5,000 cells and 256 KiB, and it is on by default. No exposure
policy applies to it: it is the model's own data, not yours ([details](../reference/mcp.md#data)).

- `"mcp": { "data": false }` switches it off.
- `"mcp": { "data": { "rows": 100 } }` lowers the cap.
- A profile with `"data": false` switches it off for its callers.

On REST it is off until a profile has `"data": true`. Such a caller may also send a file as
`multipart/form-data`, and a body of up to `rest.data.maxBytes`, default 10 MiB
([details](../reference/rest.md#data)). Before, `inline:` was answered as an unknown source.
`check-config` says who may send data.

### Requests to the issuer { #issuer-requests }

The issuer's metadata, its keys and the download sign-in's token endpoint are requested like every
other outbound request of the server ([OAuth 2.1](../reference/mcp.md#oauth)). What an existing
OAuth installation notices:

- An issuer whose name resolves to a loopback or private address is refused until you set
  `"intranet": true` in `auth`. Examples are Keycloak or Authentik in your LAN or cluster. Until
  then, `/readyz` stays 503, and the log warns with the setting's name. `check-config` prints a
  PROBLEM for it.
- The proxy of the environment (`NODE_USE_ENV_PROXY` with `HTTPS_PROXY`) is not used for the issuer.
- A key set over 256 KiB is refused. No token verifies against it.
- `auth.allowInsecureIssuer` accepts an `http://` issuer on a loopback address only.
- A download sign-in whose provider keeps its token endpoint on another host than the issuer needs
  `output.downloads.signIn.tokenUrl`.

## From 0.6.0 to 0.6.1 { #from-0-6-0 }

Hosts of the report change nothing. Operators of pivotkit-server and pivotkit-mcp check the first
three rows. The output directory names its files differently and has a size limit. The MCP endpoint
has request limits. Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| [Versions move together](#versions-0-6-1) | you also install pivotkit-core, pivotkit-report or pivotkit-xlsx yourself | update them to the same release |
| [Output files of the services](#output-0-6-1) | you run pivotkit-server or pivotkit-mcp with an output directory | remove the reports of 0.6.0 by hand once; check `output.maxMb` and `output.maxFiles`; a missing directory is now made |
| [Request limits of the MCP endpoint](#mcp-limits-0-6-1) | clients use pivotkit-mcp or pivotkit-server's `/mcp` over HTTP | raise `mcp.rateLimit` or `mcp.concurrency` for busy clients |
| [Checks at start](#checks-0-6-1) | you run `check-config` in a pipeline or start the service from scripts | fix what it now names |
| [Years before 1 AD](#bce-0-6-1) | your data has dates before 1 AD or after 9999, and tests or screenshots show them | take the new labels |
| [Command line](#cli-0-6-1) | a script runs `pivotkit` with `--strict`, `-o` or on Windows | check the list below |

### Versions move together { #versions-0-6-1 }

The packages of 0.6.1 depend on each other at its versions: pivotkit-core 0.6.1,
pivotkit-react 0.6.1, pivotkit-report 0.2.1, pivotkit-xlsx 0.3.1, and so on. A host that also lists
pivotkit-core, pivotkit-report or pivotkit-xlsx itself updates them with pivotkit-react. Otherwise
npm may install two copies.

### Output files of the services { #output-0-6-1 }

pivotkit-server and pivotkit-mcp name the reports and drafts they write `<name>.pivotkit-out.<format>`,
for example `sales.pivotkit-out.xlsx`. They count, clean up (`output.maxAgeDays`) and delete only
files named so. **Breaking** for the directory's old files: reports written by 0.6.0 are neither
counted nor deleted. Remove them by hand once.

- `output.maxMb` (default 1024) is new. A new report deletes the oldest reports until the directory
  fits it and `output.maxFiles`, instead of refusing every caller. Set both to what the disk holds.
- Schedule drafts are never deleted this way. They may take at most half of `output.maxFiles`, none
  at 1. A draft over that answers 409 `NO_OUTPUT`.
- An output directory the server cannot write is a problem in `check-config` (exit 1) and a warning
  at start. A report then gets 409 `NO_OUTPUT` instead of 500 `INTERNAL`.
- A missing output directory is made at start, with its parents, and with a warning in the log.
  Before, the start failed. Its mode is 0700, or 0755 narrowed by the umask when `output.baseUrl` is
  set. A setup that relies on that error sets `output.create: false`, for example with a directory
  on a volume that must be mounted first.

See [the REST service's options](../reference/rest.md#running).

### Request limits of the MCP endpoint { #mcp-limits-0-6-1 }

Over HTTP, the MCP endpoint limits each caller as the REST service does:

- `mcp.rateLimit.perMinute` (120)
- `.burst` (30)
- `.failedAuthPerMinute` (30)
- `mcp.concurrency` (4)

Over a limit, the answer is 429 with `Retry-After`. Both services also have
`http.maxConnectionsPerAddress`, default 0, which means no bound. A client has 5 seconds for its
headers, down from 15. See [the MCP server's configuration](../reference/mcp.md#configuration).

### Checks at start { #checks-0-6-1 }

- A static token with characters a bearer token cannot carry is refused at start and in
  `check-config`. No request could have sent it. Make one with the command the message names.
- `check-config` warns of a policy rule that names no column of its source (exit 0). The warning
  names the column probably meant. Such a rule left the real column at the default level.
- With OAuth and neither required scopes nor `auth.toolScopes`, the REST service warns at start, as
  the MCP endpoint does.

### Years before 1 AD { #bce-0-6-1 }

Date labels write a year before 1 AD with its era:

| Label | 0.6.1 | Before |
| --- | --- | --- |
| `yearQuarter` | "Q1 2 BC" | "Q1 -1" |
| a date | "Jan 11, 2 BC" | "Jan 11, 2", the same as 2 AD |
| `yearWeek` | "2 BC-W02" | |

`toCsv` and `toJson` write a date before year 0 or after 9999 in its signed ISO form
(`-000001-01-11`). `isIdentifierName` takes `HTTPId` and `ABCId` as identifiers. So such a number
field is counted when placed, as `ID` is.

### Command line { #cli-0-6-1 }

- `--sheet` for data that is no workbook is a warning `ignoredOption`. With `--strict` the run
  exits 1.
- These are usage errors (exit 2), instead of replacing the input or writing a file named `-`:
    - `-o` naming the data file or the view file, also through a link or another case of its name
    - `--save-view` naming the data file
    - `-o -`
- On Windows, a device name as the output (`-o NUL`, `CON`, `COM1.csv`) is refused, as `/dev/null`
  is elsewhere.
- `--json`: an error can follow from a grouping the view cannot make. It then has `followsFrom` with
  the grouping's code. On stderr it is counted there instead of shown.
- `describe --data <file>` without an argument describes the data.

## From 0.5 to 0.6 { #from-0-5 }

Hosts of the report change nothing. Views, files and links of 0.5 load with the same result, and the
new features are off until you turn them on. Scripts that read what pivotkit-report or the command
line write check the last two rows. Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| [Versions move together](#versions-0-6) | you also install pivotkit-core, pivotkit-report or pivotkit-xlsx yourself | update them to the same release |
| [Export → Table as CSV](#table-as-csv) | your tests or screenshots look for "CSV file (.csv)" | look for "Table as CSV (.csv)" |
| [Source data](#source-data-0-6) | you want people to download the rows | set `exportData` (`export-data`); off by default |
| [The report's words in pivotkit-report](#report-words) | a script reads the words of a report pivotkit-report or the CLI writes | take the new words, or pass `labels: DEFAULT_LABELS` |
| [Command line](#cli-0-6) | a script runs `pivotkit` and reads its exit code, `--json` or stderr | check the list below |

### Versions move together { #versions-0-6 }

Each package depends on the others of the same release, and in 0.x a caret range admits one minor
only. A host that also lists pivotkit-core, pivotkit-report or pivotkit-xlsx itself updates them to
the versions released with pivotkit-react 0.6. Their CHANGELOGs say which. Otherwise npm installs
two copies.

### Export → Table as CSV { #table-as-csv }

The Export menu's **CSV file (.csv)** is called **Table as CSV (.csv)**, in German **Tabelle als CSV
(.csv)**. So people do not take it for the rows behind the report. Its label key (`exportCsv`) and
its `onExport` kind `"csv"` stay.

### Source data { #source-data-0-6 }

`exportData` (pivotkit-element: `export-data`) adds **Source data** to the Export menu: every row of
the data shown, as CSV or JSON. It is off by default because it holds columns no view places. See
[security](../security.md).

`onSaveTemplate`, `onPublishTemplate` and the element's `pivot-template-save` and
`pivot-template-publish` also get `source`, the data the view was made for. A host that ignores it
changes nothing.

### The report's words in pivotkit-report { #report-words }

Without `labels`, `render()` writes the report's words in the language of its locale. So does
`pivotkit render`.

- For `de-DE` the words are German: "Gesamtergebnis", "Summe von Units".
- In English they are the words the report on a page shows: "Yes" and "No" instead of "true" and
  "false", "Distinct count" instead of "Count Unique".
- The HTML report's details give "Rows: 8". It said "Rows: 8 rows".

For the engine's own words, pass `labels: DEFAULT_LABELS` (pivotkit-core).

### Command line { #cli-0-6 }

- A view file or link may name a workbook's sheet the data does not have. That is an error (exit 2,
  `NO_SHEET`), not a run on the first sheet. `--sheet` reads another sheet.
- `--strict` also fails on `LINES_SKIPPED` and on the new `noRowsKept`. `LINES_SKIPPED` means title
  lines were skipped, and is a warning now. `noRowsKept` means filters keep no row.
- `--json`:
    - `validate` and `describe` of a view add `uses`.
    - `describe` of a view gives `findings` instead of `errors` and `warnings`.
    - `describe` of data gives `rows`, `fields` and `text`.
    - Every command with data gives `sheet`.
- `-o report.html -f csv` is a usage error, since the name and the format disagree.
- Usage errors end with `see "pivotkit help <command>"`. `render` says on stderr what it wrote. `-q`
  keeps that off.

## From 0.4 to 0.5 { #from-0-4 }

Most hosts change nothing. Views, files and links of 0.4 load with the same result. Check the list
below for what your page does. **Breaking** marks a change that needs your action when it applies.
Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| **Breaking:** [view and file format 2](#view-and-file-format-2) | users share views, files or links with a page that still runs 0.4 | upgrade those pages too |
| **Breaking:** [dark theme selectors](#dark-theme-selectors) | your CSS sets `--pk-*` tokens for the dark theme | write them for `[data-pk-theme="dark"]` |
| **Breaking:** [import maps](#import-maps) | your page loads pivotkit-react through an import map | map `pivotkit-report` and `pivotkit-core/chart` |
| [Colour scale in blue](#colour-scale) | you liked red, yellow, green | set three tokens |
| [Column subtotals off](#column-subtotals) | your start view or templates rely on column subtotals | add `totals: { colSubtotals: true }` |
| [Label `filter` removed](#labels) | you pass `labels.filter` | nothing; remove it |
| [Font weights 550 and 650 are 600](#font-weights) | you compare screenshots | nothing, or `--pk-weight-strong` |
| [Chart text 14 px](#chart-text) | you compare screenshots | nothing |

### View and file format 2 { #view-and-file-format-2 }

**Breaking.** The report writes views, [view files](../reference/view-file.md) and links of format
version 2. In it, a filter has one shape with `not` and `blanks`. Views, files and links of version 1
load with the same result. pivotkit 0.4 refuses a view, file or link of version 2 as newer. So a link
shared from the new release does not open on a page that still runs 0.4. A host that reads the
filters of a normalized view in its own code reads the new shape. pivotkit-core's CHANGELOG lists
the names.

### Dark theme selectors { #dark-theme-selectors }

**Breaking** for a host that sets its own dark colours. Write them for the theme the report shows,
not for an attribute of the page:

```css
/* pivotkit-react */
.pk-root[data-pk-theme="dark"] {
    --pk-surface: #101418;
}
/* pivotkit-element */
pivot-report[data-pk-theme="dark"] {
    --pk-surface: #101418;
}
```

A rule such as `html[data-theme="dark"] .pk-root` keeps working on screen. But the Excel export and
the HTML report read the light theme by showing it on the report for a moment. A rule on the page's
attribute stays active then, and your dark colours land in the file
([Theming, Light and dark](../reference/theming.md#light-and-dark)).

### Import maps { #import-maps }

**Breaking** for a page without a bundler. pivotkit-react imports two modules by their bare names:

- `pivotkit-report`, on the first HTML report, SVG or print of the Export menu
- `pivotkit-core/chart`, on the first chart

Add both to the import map ([Bundlers and import maps](react.md#bundlers-and-import-maps)). A
bundler and pivotkit-element need nothing.

### Colour scale { #colour-scale }

A colour scale without colours of its own runs from light to strong blue. These are
`--pk-scale-low` and `--pk-scale-high`, the heatmap's colours. The scale says "more", not "good" or
"bad". `--pk-scale-mid` is no longer set. A host that sets it gets a three-colour scale. The colours
of 0.4, red over yellow to green, come back with these tokens. For the web component, set them on
`pivot-report`:

```css
.pk-root {
    --pk-scale-low: #f8696b;
    --pk-scale-mid: #ffeb84;
    --pk-scale-high: #63be7b;
}
.pk-root[data-pk-theme="dark"] {
    --pk-scale-low: #c2413f;
    --pk-scale-mid: #b39a2e;
    --pk-scale-high: #3f9a5c;
}
```

The Excel export and the HTML report take them too. A view's own colours are unchanged. With
pivotkit-core alone, pass `theme: { colorScale: ["#f8696b", "#ffeb84", "#63be7b"] }` to `toXlsx`.

### Column subtotals { #column-subtotals }

Column subtotals are off by default. Row subtotals and both grand totals stay on. Every view the
report saves, shares or stores names all four totals, so these views keep what they showed. A start
view, a template or a view file written by hand without `totals.colSubtotals` shows no column
subtotals now. To keep them, add `totals: { colSubtotals: true }`.

### Labels { #labels }

The field list's menu has one entry for filtering, **Add to Filters**. The label key `filter` of the
old "Filter…" entry is gone, and a host's text for it is ignored.

### Font weights { #font-weights }

The font weights are four tokens: `--pk-weight-normal` 400, `--pk-weight-medium` 500,
`--pk-weight-strong` 600 and `--pk-weight-bold` 700. The weights 550 and 650 are 600
(`--pk-weight-strong`). 550 was used for field chips and the drill-down's path, 650 for titles and
table headers. A font without those faces drew them as 600 or 700 anyway.

### Chart text { #chart-text }

The chart's axes, legend and labels are 14 px, not ECharts' 12 px. The token is
`--pk-chart-text-size`, by default `--pk-small`. Labels slant or thin out a little sooner. Text in the
report is never below 14 px. With pivotkit-core alone, `theme: { textSize: 12 }` keeps the old size.
