---
title: Upgrading
description: How to update the command line, the services, the image and the plugin, and what changes between releases.
---

# Upgrading

The first section says how to update the command line, the REST service, the MCP server, the
container image and the Claude Code plugin. Each section after it lists what changes between two
releases and whom it concerns; **Breaking** marks a change that needs your action when it applies.

## Update an installation { #update }

Read the sections below from your version to the new one before you update; each package's
`CHANGELOG.md` has the full list, and `npm view <package> version` names its newest release. For a
setup others rely on, update to a version you name and checked, not to whatever is newest.

### Installed with `npm install --global` { #update-global }

```bash
npm outdated --global       # which global packages have a newer release (exit code 1 when one has)
npm install --global pivotkit-server@<version> pivotkit-mcp@<version> pivotkit-cli@<version>
pivotkit-server --version
pivotkit-mcp --version
pivotkit --version
```

Update pivotkit-server and pivotkit-mcp in one command, to the same release: `pivotkit-server serve`
loads the pivotkit-mcp installed beside it, and a pivotkit-server changed alone afterwards can make
it stop at start with "pivotkit-mcp <x> does not fit pivotkit-server <y>" (pivotkit-server 0.1.1
and earlier: a module "does not provide an export named ..."). The sure sign is `npm ls -g --all`
marking pivotkit-server under pivotkit-mcp `invalid`; install both again in one command.
pivotkit-cli updates on its own. `npm update --global` updates every global package
to its newest release, across minor versions too. Install global packages into a folder you own
(npm's `prefix`), not with `sudo`. `npm audit signatures` checks the registry's signatures in a
project only, not for global packages: to check a release first, install it into an empty folder,
run `npm audit signatures` there, then install it globally.

### In a project or an app folder { #update-project }

A project's `package.json` keeps a range: `npm update` stays inside it, and in 0.x a caret range
spans patch releases only (`^0.y.z` takes the later 0.y patches, never 0.(y+1)). For the next
minor version, name it:

```bash
npm install <package>@<version>
npm audit signatures        # the registry's signatures of the installed packages
npx <command> --version
```

For the services, name pivotkit-server and pivotkit-mcp in one command at the same release, as for
[PowerShell Universal](mcp.md#psu-install).

### Started with `npx` { #update-npx }

`npx -y pivotkit-mcp` without a version asks the registry at each start and takes the newest
release, unless the package is installed in the folder `npx` runs in (or a folder above it) or
globally: then it runs that copy, whatever its version, without asking. Write the version into the
command:

- `npx -y pivotkit-mcp@<version>`: one release; change it to update. Use this for a setup others
  rely on and for every shared configuration.
- `npx -y pivotkit-mcp@latest`: the newest release at each start, for a setup of your own; `-y`
  then runs code you have not looked at yet whenever a release comes out.

The same holds for `npx pivotkit-cli` and `npx pivotkit-server`.

### Restart what runs { #update-restart }

A running process keeps the version it started with. Restart it right after the update:

- An MCP client over stdio starts the server for a session: restart the client, or start a new
  session.
- `pivotkit-server serve` and `pivotkit-mcp --http`: restart the process; a Windows service by its
  name (`nssm restart pivotkit` for [the service under NSSM](mcp.md#psu-service)). If `serve` stops
  at start with "does not fit" or "does not provide an export named", pivotkit-server and
  pivotkit-mcp do not fit together ([above](#update-global)).

### The container image { #update-image }

The image is built for each release of pivotkit-server, with pivotkit-mcp and pivotkit-cli of the
same commit; a release of pivotkit-cli or pivotkit-mcp alone reaches the image with the next
pivotkit-server release. Its [tags](../reference/container.md):

- `<version>` never moves;
- `<major>.<minor>` moves to each patch release of that minor version, never to the next minor
  version;
- `latest` is the image of the pivotkit-server release published last: a new minor version with
  breaking changes too, and an older version again when a patch of an older minor version comes out
  later. Not for production.

For production, use the exact version or its digest (`ghcr.io/eizedev/pivotkit@sha256:...`, the
digest the signature names), and [check the signature](../reference/container.md#verify) of the
new image before you restart. Pulling a tag does not change a running container; make it again:

=== "docker run"

    ```bash
    docker pull ghcr.io/eizedev/pivotkit:<version>
    docker rm -f pivotkit
    # then the same docker run as before, with the new tag
    ```

    The reports stay in the volume `pivotkit-out`; `docker rm` does not remove a volume.

=== "Docker Compose"

    [docker/compose.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.example.yml)
    takes the tag from `PIVOTKIT_VERSION` (in the shell or in a `.env` file beside it). Set it to the
    new release, then:

    ```bash
    docker compose pull
    docker compose up -d
    ```

    With `<major>.<minor>`, each `pull` takes that line's newest patch: check its signature too.

=== "Kubernetes"

    Write the exact version or the digest into the manifest, never `latest` or `<major>.<minor>`:
    with `latest` Kubernetes pulls on every start (`imagePullPolicy` defaults to `Always`), and with
    another tag a node that pulled it once keeps that image (`IfNotPresent`). To update, change the
    tag and apply the manifest again (or `kubectl set image`). The example of
    [Kubernetes](kubernetes.md) replaces the pod (`strategy: Recreate`), as one output directory
    takes one server process.

Check the versions inside the image:

```bash
docker run --rm ghcr.io/eizedev/pivotkit:<version> --version
docker run --rm ghcr.io/eizedev/pivotkit:<version> mcp --version
docker run --rm ghcr.io/eizedev/pivotkit:<version> cli --version
```

### The Claude Code plugin { #update-plugin }

The plugin `pivotkit-mcp@pivotkit` holds [the skill](mcp.md#skill) only: updating it does not update
the server, and updating the server does not update the skill. Update both:

```bash
claude plugin marketplace update pivotkit
claude plugin update pivotkit-mcp@pivotkit
```

Then restart Claude Code.

## From 0.6.1 to the next release { #from-0-6-1 }

Operators of pivotkit-server and pivotkit-mcp need not act for the exposure policy: every field
keeps its level, and the automatic values rule and the new operator controls are off. Library hosts
with code sources check [Code sources](#code-sources). Over HTTP with an output directory, check the
[download links](#download-links): reports may get links of the server under `/downloads/`, and
`output.baseUrl` no longer gives an address to reports over closed sources. With OAuth and an issuer
on a private address (your LAN, your cluster), set [`auth.intranet: true`](#issuer-requests). What
callers notice:

- a filter item that is none of a `show` field's values gets the warning `itemUnknown` where
  `describe_source` lists all of them, and `itemCase` comes for a `show` field also when the view
  uses other fields;
- `describe_source` adds `complete` to `show` fields and `withheld` with a `hint`;
- a withheld render's `message` reads "results over fields that are not fully shown (...) stay in
  the file".

| Change | Applies to you when | Action |
| --- | --- | --- |
| [Data as of in files](#data-as-of-files) | people read html reports or open xlsx files | nothing; a print template of your own may add `{{dataAsOf}}` |
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
| [Reports deleted after 30 days](#max-age-default) | the server has `output.dir` in a directory of its own and no `output.maxAgeDays` | nothing, or `output.maxAgeDays: 0` to keep reports with no age limit |
| [The log](#log) | you read the log on a terminal, parse it, alert on it, or ship it to a log server | JSON lines gain fields and the client's address is logged by default (`log.address: "off"` keeps it out); levels and `msg` are new, and more refusals get a line; on a terminal the log is text unless `log.format` is `json`; a start error is a JSON line where stderr is no terminal |
| [Print templates checked at start](#template-at-start) | a source has `sources.<id>.template` | run `check-config`; fix a template it reports as a PROBLEM or NOT FOUND |

### Data as of in files { #data-as-of-files }

An html report's details (the default template's `{{details}}`) add "Data as of" with when the data
is from, and a print template may place it with `{{dataAsOf}}`. An xlsx file carries it as the
custom document property `DataAsOf`. A print template of your own shows it only where it uses
`{{details}}` or `{{dataAsOf}}`: the Minimal example uses `{{details}}`, the Corporate example writes
its own footer without it (add `{{dataAsOf}}` there where your reports always come from a service).
csv, json and svg carry it in the result only.

### Print templates checked at start { #template-at-start }

The server reads and checks each source's print template (`sources.<id>.template`) at start, as an
html report reads it. A template the parser refuses (for example
`sources.sales.template: unknown placeholder {{titel}} (line 7); did you mean {{title}}?`), one over
1 MiB or one that is not a regular file keeps the server from starting; `check-config` reports the
same message as a PROBLEM line. A template file that is not there or cannot be read is treated like
a missing source file: the server starts with a warning, `check-config` marks it NOT FOUND, and that
source's html reports fail until the file is there. A template changed after the start is checked
again on every html report, as before.

### Groups, a default profile, source scopes, the person in the log { #operator-controls }

All of them are off until you set them ([profiles](../reference/rest.md#profiles),
[scopes](../reference/mcp.md#scopes), [logging](../reference/rest.md#logging)):

- `auth.groupProfiles` maps an OAuth token's groups to policy profiles (first match wins, after a
  client's profile); a token whose group list is cut or missing gets `auth.defaultProfile`, or 403
  without one. A person in none of the groups (and no client or scope profile) is refused
  with 403 as well, unless `auth.defaultProfile` gives them a profile.
- `auth.defaultProfile` is the profile of every signed-in caller that no token, client, group or
  scope names, a static token without a profile included.
- `auth.offerSourceScopes: true` lists the sources' scopes in the OAuth metadata
  (`scopes_supported`). Define them at your provider first: a client that asks for every listed
  scope can be refused for one the provider does not know, and the metadata is public.
- An empty `list_sources` (REST `GET /sources`) for a sign-in that lacks the sources' scopes has a
  `hint`.
- `audit.subject: "hash"` or `"plain"` adds the person (`auth.subjectClaim`) to the `call`,
  `request` and `download` log lines, as a keyed hash or as it is (`audit.key`: at least 16
  characters).

### The values level { #values-level }

A field at `values` lists every distinct value as a complete list in `describe_source`
(`complete: true`); a result over it stays withheld, as for `summary`. To use it:

1. Give category fields the level in `fields` (`"Status": "values"`), or switch on the automatic
   rule with `"policy": { "autoValues": true }`: text fields that look like categories get `values`
   where no `default` is written ([the rule](../reference/mcp.md#auto-values)). It never applies to
   a caller bound to a profile or to a `file:` path.
2. Run `check-config` (`pivotkit-server check-config` or `pivotkit-mcp --check-config`): it prints
   each field's level and why, and with the rule off the fields it would list.
3. To give one group more, bind a profile to its OAuth scope (`auth.scopeProfiles`,
   [example](../reference/rest.md#profiles)).

`"autoValues": false` or a written `default` keeps every field as it is.

### Findings carry their field { #findings-field }

A finding about a field's items has `field`. `itemCase` is sent for a `show` or `values` field,
the new `itemUnknown` (an item that is none of a field's values, with the closest one as the
`suggestion`) where its values are listed completely. `noRowsKept`, `filterEmpty`, `tableCut` and
`chartCut` stay for views whose fields are all `show`. `describe_source` may add `withheld`, `hint`,
`complete` and `auto`; a client reads a `level` it does not know as `summary`.

### Download links { #download-links }

A server that serves HTTP and has an output directory, without `output.baseUrl`, serves reports
itself under `/downloads/<token>` for 60 minutes ([download links](../reference/delivery.md)):

- Reports over open sources (`"default": "show"` and no field below `show`, in every profile; listing
  every column as `show` is not enough) get a plain link; reports over other sources get
  one only with a sign-in client (`output.downloads.signIn`, with OAuth) or one-time links you switch
  on (`output.downloads.bind: "once"`). With static tokens and the default `summary`, such reports
  get no link, as before, and their result says to ask you for the file.
- A report that gets a link is stored with 22 random characters before its name: `output.name` is
  that stored name, the new `output.filename` the plain one. Reports without a link keep their names.
- Results with a link carry `url`, `expiresAt`, `bound`, `note` and `filename`, and MCP results for
  clients of protocol 2025-06-18 or later a `resource_link`; the `message` names the file and leaves
  the address to `output.url`.
- Off loopback the links need `http.publicUrl`; route `/downloads/` to the server at the proxy or
  ingress. Set `output.downloads.key` (a secret of at least 32 bytes), or links stop working on a
  restart and differ between replicas.

`"output": { "downloads": { "enabled": false } }` keeps the old behaviour. `check-config` prints a
`Delivery:` section with what applies.

### `output.baseUrl` and closed sources { #base-url-closed }

With `output.baseUrl`, a report over a source with a field at `values`, `summary` or `hide` (for
anyone, in any profile) carries no `url` any more, on MCP and REST: anyone with the address could open
a report whose fields were withheld from the model. The file is still written. Reports over sources
whose fields are all `show` keep their address. For the others, leave out `output.baseUrl` and use
sign-in links, or give REST programs `results: true` and the [file route](../reference/rest.md#downloads).

### Reports deleted after 30 days { #max-age-default }

`output.maxAgeDays` is 30 by default: reports and schedule drafts (drafts waiting for approval too)
older than 30 days are deleted from the output directory at start and every hour. Before, they stayed
until `output.maxFiles` or `output.maxMb` pushed them out. Set `output.maxAgeDays` to another number
of days, or to `0` for no age limit, the old behaviour. The default applies only to a directory of the
reports' own: where `output.dir` holds the configuration or a source, template or token file, nothing
is deleted by age and the server starts as before (`check-config` says "no age limit: the directory
holds other files"). Copy the reports you want to keep elsewhere before you upgrade.

### Request ids { #request-ids }

The `call`, `request`, `download`, `refused` and `error` log lines carry `requestId`. Every REST
problem document carries it too, and every MCP tool error ends with `(request id ...)`; a person gives the id
to the operator. On MCP an `INTERNAL` error says "internal error", as REST does, instead of its own
words. A body over the cap gets a `refused` log line. `check-config` warns of a static token's file
that other users of the machine can read, and closes with "New in this version" where a change
applies to the configuration.

### The log { #log }

[Operations and logs](../reference/operations.md) describes the log as it is now. What an existing
installation notices:

- On a terminal the log is text (`key=value` pairs), not JSON: `log.format` is `auto`. Where stderr
  is no terminal (a container without `-t`, a service manager, a pipe) it stays JSON. The container
  image sets `PIVOTKIT_LOG_FORMAT=json`, so containers keep JSON also under `docker run -t`. Set
  `log.format: "json"` (or `--log-format json`) to keep JSON everywhere.
- JSON lines gain fields; none is renamed or removed. Every line has `level`, `severity`, `msg`,
  `service` and `version`; a request's lines `traceId`, `upstreamRequestId` (a proxy's
  `X-Request-Id`) and the client's `address`; `call`, `request`, `download` and `refused` lines
  `outcome` and `status`; `refused` lines `reason`; backend warnings `cause`, `backend`,
  `upstreamStatus` and `upstreamMs`. `started` adds `sourceIds`, the log's settings and the static
  tokens' names; an HTTP server ends with a `stopped` line.
- The client's address is logged by default as `address`: with `http.trustProxy` the forwarded
  client, as before, or `invalid` for a forwarded value that is no IP address; without it the
  connection's own address, which was not logged before. `peerAddress` is the connection's own
  address where it differs (the proxy). `log.address: "off"` keeps both out
  ([privacy](../privacy.md#logs)).
- More refusals get a `refused` line: the per-caller 429s, `/openapi.json` with a refused token, an
  MCP body over the cap, and requests the HTTP parser refuses (`warn`); a GET of the MCP endpoint and
  a path nobody serves at `debug` only. An alert on refused lines counts them too.
- `--log` takes `warn` and `error` too; `log` in the file may be an object of `level`, `format`
  and `address`, and `"log": "debug"` keeps working.
- Every answer carries an `X-Request-Id` header (exposed to browsers by CORS).
- An error at the start of `serve` or `pivotkit-mcp` (a configuration it cannot read, an unknown
  flag) follows the log's format: a JSON line where stderr is no terminal (a container, a service
  manager, a pipe) or JSON is asked for, the plain `pivotkit-server: ...` line on a terminal or with
  `--log-format text`. A script that reads that line from a pipe reads JSON now.

### Code sources { #code-sources }

For library hosts whose sources have `load` ([code sources](../reference/sources.md#code)), when
they update pivotkit-server from 0.1.x or pivotkit-mcp from 0.1.x to the next release:

- `load` is called as `load(params, { caller, signal })` and `version` as `version(params,
  { caller })`, also without declared `params` (then `{}`). A `load()` that takes no arguments works
  as it is; one whose first parameter has a default of its own now gets `{}` there. A `version`
  that returns a promise is refused (`SOURCE_UNAVAILABLE`): return the value itself.
- A load is aborted after 30 s (`timeMs`, at most ten minutes), and when every request waiting for
  it went away (a REST client that closed its connection, an MCP call over HTTP whose connection closed); pass
  `signal` on to `fetch` or your database client.
- Loaded data is kept per caller (and per values and policy levels), not per source: a `load` that
  gives every caller the same data sets `cacheShared: true` (it then gets `caller: null`). Without
  `version` and `ttl` nothing is reused, as before; parallel calls for the same data share one load.
- A load that fails transiently (the time limit, a network error, a `SourceError` with `transient`)
  answers with the data last loaded for that caller, up to an hour old, and `stale: { since }` in
  the result; `maxStale: 0` turns it off.
- An error a load throws answers `SOURCE_UNAVAILABLE` (502) with a fixed text instead of `INTERNAL`
  (500); throw a `SourceError` to answer `NOT_ALLOWED`, `INVALID_INPUT` or `DATA_NOT_AVAILABLE` with
  your own words.
- The data has a file's limits: `limits.rows`, `limits.columns`, `limits.importCells`
  (`LIMIT_EXCEEDED`), and texts are cut at `limits.textLength`.
- The report over a code source's data is computed in a worker, as for a file
  ([where it runs](../reference/sources.md#code-thread)): it answers `TIMEOUT` after `compute.timeMs`
  (30 s), `LIMIT_EXCEEDED` over `compute.memoryMb` (1024 MB), and `BUSY` when no worker is free
  within `compute.queueMs`. A host that computed long reports over its own data raises these, or
  `compute.workers`.

`check-config` given these options lists each code source with its time limit and how its data is
kept.

### Data in the request { #data-in-request }

The MCP tools that take a source offer `data`, a small table the model sends with `source`
`inline:` (at most 500 rows, 5,000 cells and 256 KiB), on by default. No exposure policy applies to
it: it is the model's own data, not yours. `"mcp": { "data": false }` switches it off,
`"mcp": { "data": { "rows": 100 } }` lowers the cap, and a profile with `"data": false` switches it
off for its callers ([details](../reference/mcp.md#data)). On REST it is off until a profile has
`"data": true`; such a caller may also send a file as `multipart/form-data` and a body of up to
`rest.data.maxBytes` (default 10 MiB) ([details](../reference/rest.md#data)). `inline:` was
answered as an unknown source before; `check-config` says who may send data.

### Requests to the issuer { #issuer-requests }

The issuer's metadata, its keys and the download sign-in's token endpoint are requested like every
other outbound request of the server ([OAuth 2.1](../reference/mcp.md#oauth)). What an existing
OAuth installation notices:

- An issuer whose name resolves to a loopback or private address (Keycloak or Authentik in your
  LAN or cluster) is refused until you set `"intranet": true` in `auth`: `/readyz` stays 503, and
  the log warns with the setting's name. `check-config` prints a PROBLEM for it.
- The proxy of the environment (`NODE_USE_ENV_PROXY` with `HTTPS_PROXY`) is not used for the issuer.
- A key set over 256 KiB is refused; no token verifies against it.
- `auth.allowInsecureIssuer` accepts an `http://` issuer on a loopback address only.
- A download sign-in whose provider keeps its token endpoint on another host than the issuer needs
  `output.downloads.signIn.tokenUrl`.

## From 0.6.0 to 0.6.1 { #from-0-6-0 }

Hosts of the report change nothing. Operators of pivotkit-server and pivotkit-mcp check the first
three rows: the output directory names its files differently and has a size limit, and the MCP
endpoint has request limits. Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| [Versions move together](#versions-0-6-1) | you also install pivotkit-core, pivotkit-report or pivotkit-xlsx yourself | update them to the same release |
| [Output files of the services](#output-0-6-1) | you run pivotkit-server or pivotkit-mcp with an output directory | remove the reports of 0.6.0 by hand once; check `output.maxMb` and `output.maxFiles`; a missing directory is now made |
| [Request limits of the MCP endpoint](#mcp-limits-0-6-1) | clients use pivotkit-mcp or pivotkit-server's `/mcp` over HTTP | raise `mcp.rateLimit` or `mcp.concurrency` for busy clients |
| [Checks at start](#checks-0-6-1) | you run `check-config` in a pipeline or start the service from scripts | fix what it now names |
| [Years before 1 AD](#bce-0-6-1) | your data has dates before 1 AD or after 9999, and tests or screenshots show them | take the new labels |
| [Command line](#cli-0-6-1) | a script runs `pivotkit` with `--strict`, `-o` or on Windows | check the list below |

### Versions move together { #versions-0-6-1 }

The packages of this release depend on each other at its versions (pivotkit-core 0.6.1,
pivotkit-react 0.6.1, pivotkit-report 0.2.1, pivotkit-xlsx 0.3.1, ...). A host that also lists
pivotkit-core, pivotkit-report or pivotkit-xlsx itself updates them with pivotkit-react, or npm may
install two copies.

### Output files of the services { #output-0-6-1 }

pivotkit-server and pivotkit-mcp name the reports and drafts they write `<name>.pivotkit-out.<format>`
(`sales.pivotkit-out.xlsx`) and count, clean up (`output.maxAgeDays`) and delete only files named so.
**Breaking** for the directory's old files: reports written by 0.6.0 are neither counted nor deleted;
remove them by hand once.

- `output.maxMb` (default 1024) is new: a new report deletes the oldest reports until the directory
  fits it and `output.maxFiles`, instead of refusing every caller. Set both to what the disk holds.
- Schedule drafts are never deleted this way and may take at most half of `output.maxFiles` (none
  at 1); a draft over that answers 409 `NO_OUTPUT`.
- An output directory the server cannot write is a problem in `check-config` (exit 1), a warning at
  start, and 409 `NO_OUTPUT` for a report, instead of 500 `INTERNAL`.
- A missing output directory is made at start, with its parents (mode 0700, or 0755 narrowed by the
  umask when `output.baseUrl` is set), with a warning in the log; before, the start failed. A setup
  that relies on that error (a directory on a volume that must be mounted first) sets
  `output.create: false`.

See [the REST service's options](../reference/rest.md#running).

### Request limits of the MCP endpoint { #mcp-limits-0-6-1 }

Over HTTP, the MCP endpoint limits each caller as the REST service does: `mcp.rateLimit.perMinute`
(120), `.burst` (30), `.failedAuthPerMinute` (30) and `mcp.concurrency` (4); over a limit the answer
is 429 with `Retry-After`. Both services also have `http.maxConnectionsPerAddress` (default 0, no
bound), and a client has 5 seconds for its headers (was 15). See [the MCP server's
configuration](../reference/mcp.md#configuration).

### Checks at start { #checks-0-6-1 }

- A static token with characters a bearer token cannot carry is refused at start and in
  `check-config`: no request could have sent it. Make one with the command the message names.
- `check-config` warns of a policy rule that names no column of its source, with the name probably
  meant (exit 0): such a rule left the real column at the default level.
- With OAuth and neither required scopes nor `auth.toolScopes`, the REST service warns at start, as
  the MCP endpoint does.

### Years before 1 AD { #bce-0-6-1 }

Date labels write a year before 1 AD with its era: `yearQuarter` "Q1 2 BC" (was "Q1 -1"), a date
"Jan 11, 2 BC" (was "Jan 11, 2", the same as 2 AD), `yearWeek` "2 BC-W02". `toCsv` and `toJson`
write a date before year 0 or after 9999 in its signed ISO form (`-000001-01-11`). `isIdentifierName`
takes `HTTPId` and `ABCId` as identifiers, so such a number field is counted when placed, as `ID` is.

### Command line { #cli-0-6-1 }

- `--sheet` for data that is no workbook is a warning `ignoredOption`: with `--strict` the run
  exits 1.
- `-o` naming the data file or the view file (also through a link or another case of its name),
  `--save-view` naming the data file, and `-o -` are usage errors (exit 2) instead of replacing the
  input or writing a file named `-`.
- On Windows, a device name as the output (`-o NUL`, `CON`, `COM1.csv`) is refused, as `/dev/null`
  is elsewhere.
- `--json`: an error that follows from a grouping the view cannot make has `followsFrom` with the
  grouping's code and is counted there on stderr instead of shown.
- `describe --data <file>` without an argument describes the data.

## From 0.5 to 0.6 { #from-0-5 }

Hosts of the report change nothing: views, files and links of 0.5 load with the same result, and the
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
the versions released with pivotkit-react 0.6 (their CHANGELOGs say which), or npm installs two
copies.

### Export → Table as CSV { #table-as-csv }

The Export menu's **CSV file (.csv)** is called **Table as CSV (.csv)** (German **Tabelle als CSV
(.csv)**), so it is not taken for the rows behind the report. Its label key (`exportCsv`) and its
`onExport` kind `"csv"` stay.

### Source data { #source-data-0-6 }

`exportData` (pivotkit-element: `export-data`) adds **Source data** to the Export menu: every row of
the data shown as CSV or JSON. It is off by default because it holds columns no view places; see
[security](../security.md). `onSaveTemplate`, `onPublishTemplate` and the element's
`pivot-template-save` and `pivot-template-publish` also get `source`, the data the view was made for;
a host that ignores it changes nothing.

### The report's words in pivotkit-report { #report-words }

Without `labels`, `render()` (and so `pivotkit render`) writes the report's words in the language of
its locale, German for `de-DE` ("Gesamtergebnis", "Summe von Units"), and in English the words the
report on a page shows: "Yes" and "No" instead of "true" and "false", "Distinct count" instead of
"Count Unique". The HTML report's details give "Rows: 8" (it said "Rows: 8 rows"). Pass
`labels: DEFAULT_LABELS` (pivotkit-core) for the engine's own words.

### Command line { #cli-0-6 }

- A view file or link that names a workbook's sheet the data does not have is an error (exit 2,
  `NO_SHEET`), not a run on the first sheet; `--sheet` reads another.
- `--strict` also fails on `LINES_SKIPPED` (title lines skipped, a warning now) and on the new
  `noRowsKept` (filters that keep no row).
- `--json`: `validate` and `describe` of a view add `uses`; `describe` of a view gives `findings`
  instead of `errors` and `warnings`; `describe` of data gives `rows`, `fields` and `text`; every
  command with data gives `sheet`.
- `-o report.html -f csv` is a usage error (the name and the format disagree).
- Usage errors end with `see "pivotkit help <command>"`, and `render` says on stderr what it wrote
  (`-q` keeps it off).

## From 0.4 to 0.5 { #from-0-4 }

Most hosts change nothing: views, files and links of 0.4 load with the same result. Check the list
below for what your page does; **Breaking** marks a change that needs your action when it applies.
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
version 2: a filter has one shape with `not` and `blanks`. Views, files and links of version 1 load
with the same result. pivotkit 0.4 refuses a view, file or link of version 2 as newer, so a link
shared from the new release does not open on a page that still runs 0.4. A host that reads the
filters of a normalized view in its own code reads the new shape (pivotkit-core's CHANGELOG lists the
names).

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

A rule such as `html[data-theme="dark"] .pk-root` keeps working on screen, but the Excel export and
the HTML report read the light theme by showing it on the report for a moment: a rule on the page's
attribute stays active then, and your dark colours land in the file
([Theming, Light and dark](../reference/theming.md#light-and-dark)).

### Import maps { #import-maps }

**Breaking** for a page without a bundler. pivotkit-react imports `pivotkit-report` (on the first
HTML report, SVG or print of the Export menu) and `pivotkit-core/chart` (on the first chart) by their
bare names: add both to the import map
([Bundlers and import maps](react.md#bundlers-and-import-maps)). A bundler and pivotkit-element need
nothing.

### Colour scale { #colour-scale }

A colour scale without colours of its own runs from light to strong blue (`--pk-scale-low` and
`--pk-scale-high`, the heatmap's colours): it says "more", not "good" or "bad". `--pk-scale-mid` is no
longer set; a host that sets it gets a three-colour scale. The colours of 0.4, red over yellow to
green, come back with these tokens (on `pivot-report` for the web component):

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

Column subtotals are off by default; row subtotals and both grand totals stay on. Every view the
report saves, shares or stores names all four totals, so these keep what they showed. A start view, a
template or a view file written by hand without `totals.colSubtotals` shows no column subtotals now:
add `totals: { colSubtotals: true }` to keep them.

### Labels { #labels }

The field list's menu has one entry for filtering, **Add to Filters**; the label key `filter` of the
old "Filter…" entry is gone, and a host's text for it is ignored.

### Font weights { #font-weights }

The font weights are four tokens (`--pk-weight-normal` 400, `--pk-weight-medium` 500,
`--pk-weight-strong` 600, `--pk-weight-bold` 700). The weights 550 (field chips, the drill-down's
path) and 650 (titles, table headers) are 600 (`--pk-weight-strong`); a font without those faces drew
them as 600 or 700 anyway.

### Chart text { #chart-text }

The chart's axes, legend and labels are 14 px (`--pk-chart-text-size`, by default `--pk-small`), not
ECharts' 12 px; labels slant or thin out a little sooner. Text in the report is never below 14 px.
With pivotkit-core alone, `theme: { textSize: 12 }` keeps the old size.
