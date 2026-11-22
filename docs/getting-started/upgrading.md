---
title: Upgrading
description: How to update each kind of installation, and what you must change when you move to the newest release.
anchors_moved_to: ../upgrading-older/
---

# Upgrading

This page answers two questions:

- [How do I update?](#update) One short section per way of installing.
- [What must I change for 0.9?](#from-0-8-2) Breaking changes first, then the changes that can
  break a test, a script, or a client.

Going from 0.8.2 to 0.9.0? Do these four things, then check the
[other changes](#other-changes-0-9):

1. Update Node to 24 or later. [Details](#node-24)
2. Server operators: set `http.publicUrl` to an origin without a path. [Details](#public-url-origin)
3. Code that imports from pivotkit-server: use only the listed exports. [Details](#internal-exports)
4. Update all pivotkit packages of the release in one command. [Details](#versions-0-9)

On 0.8.1 or earlier? [Upgrading from older releases](upgrading-older.md) has the steps. Do them
first, then the steps on this page.

This page lists only what needs your action. Each package's `CHANGELOG.md` lists everything new.

## <span id="update"></span>Update an installation

Three rules hold for every way of installing:

1. Read [what to change](#from-0-8-2) before you update.
2. Install pivotkit-server and pivotkit-mcp together, in one command, at the same release.
3. Restart what runs. A running process keeps its old version.

To see the newest release of a package, run `npm view <package> version`. For a setup other people
rely on, pin the version you tested. Do not take whatever is newest.

### <span id="update-global"></span>Installed with `npm install --global`

```bash
npm outdated --global
npm install --global pivotkit-server@<version> pivotkit-mcp@<version> pivotkit-cli@<version>
pivotkit-server --version
```

The versions of 0.9 are in [the table of the release](#from-0-8-2).

- `npm outdated --global` lists the global packages that have a newer release.
- You can also update pivotkit-cli on its own.
- Install global packages into a folder you own: set npm's `prefix` to it. Do not use `sudo`.

pivotkit-server loads the pivotkit-mcp installed beside it. If the two come from different releases,
`serve` and `mcp` do not start. The error says "does not fit" or "does not provide an export
named". Install both again in one command.

### <span id="update-project"></span>In a project or an app folder

`npm update` does not move to the next 0.x release. `package.json` holds a caret range: `^` and a
version. In 0.x, a caret range covers patch releases only. Name the new version:

```bash
npm install <package>@<version>
npx <command> --version
```

- A host that also lists pivotkit-core, pivotkit-report or pivotkit-xlsx updates them in the same
  command. Otherwise npm installs two copies of pivotkit-core.
- For the services, name pivotkit-server and pivotkit-mcp in one command, as for
  [PowerShell Universal](mcp.md#psu-install).
- `npm audit signatures` checks the registry's signatures of what you installed.

### <span id="update-npx"></span>Started with `npx`

`npx -y pivotkit-mcp` without a version takes the newest release at each start. If you installed
the package globally, or in the folder `npx` runs in, `npx` runs that copy instead, whatever its
version. Write the version into the command:

- `npx -y pivotkit-mcp@<version>`: one fixed release. Change the version to update. Use this for
  every shared configuration.
- `npx -y pivotkit-mcp@latest`: the newest release at each start. Use this only for a setup of
  your own. `-y` then runs each new release without asking.

The same holds for `npx pivotkit-cli` and `npx pivotkit-server`.

### <span id="update-image"></span>The container image

Pick a tag:

| Tag | Moves to | Use it for |
| --- | --- | --- |
| `<version>`, the full version | never moves | production |
| `<major>.<minor>` | each patch of that minor release | a test setup |
| `latest` | the newest pivotkit-server release, breaking ones too | trying things out |

For production, use the exact version or its digest. A digest is the image's fixed hash, such as
`ghcr.io/eizedev/pivotkit@sha256:...`. [Check the signature](../reference/container.md#verify)
of the new image before you restart. A release of pivotkit-cli or pivotkit-mcp alone reaches the
image with the next pivotkit-server release.

Pulling a new tag does not change a running container. Create the container again:

- **docker run**: run `docker pull ghcr.io/eizedev/pivotkit:<version>` and
  `docker rm -f pivotkit`. Then run the same `docker run` as before, with the new tag.
- **Docker Compose**: set `PIVOTKIT_VERSION` to the new release, in the shell or in the `.env`
  file. Then run `docker compose pull` and `docker compose up -d`.
- **Kubernetes**: write the new version or digest into the manifest and apply it again. Never use
  `latest` or `<major>.<minor>` there. [Kubernetes](kubernetes.md) has the details.

**Warning: an `output.dir` of `/out` needs its own volume.** The default state volume `pivotkit`
keeps the token, the keys and the reports in `/var/lib/pivotkit/out`. If your configuration sets
`output.dir` to `/out`, mount a volume there too, such as `-v pivotkit-out:/out`. Without it,
`docker rm` deletes the reports and the drafts that wait for approval.

Check the versions inside the new image:

```bash
docker run --rm ghcr.io/eizedev/pivotkit:<version> --version
docker run --rm ghcr.io/eizedev/pivotkit:<version> mcp --version
docker run --rm ghcr.io/eizedev/pivotkit:<version> cli --version
```

### <span id="update-plugin"></span>The Claude Code plugin

The plugin `pivotkit-mcp@pivotkit` holds only [the skill](mcp.md#skill). It does not update the
server, and the server does not update it. Update both. For the plugin, run:

```bash
claude plugin marketplace update pivotkit
claude plugin update pivotkit-mcp@pivotkit
```

Then restart Claude Code.

### <span id="update-restart"></span>Restart what runs

- **An MCP client that starts the server itself over stdio**: restart the client, or start a new
  session.
- **`pivotkit-server serve` and `pivotkit-mcp --http`**: restart the process. Under Windows, restart
  the service, for example `nssm restart pivotkit` for
  [the service under NSSM](mcp.md#psu-service).
- **A container**: create it again, as [the container image](#update-image) says.

## <span id="from-0-8-2"></span>From 0.8 to 0.9

The packages of this release:

| Package | From | To |
| --- | --- | --- |
| pivotkit-react, pivotkit-element, pivotkit-core | 0.8.x | 0.9.0 |
| pivotkit-report, pivotkit-cli | 0.4.x | 0.5.0 |
| pivotkit-xlsx | 0.5.x | 0.6.0 |
| pivotkit-server, pivotkit-mcp, the container image | 0.3.x | 0.4.0 |

On 0.8.1? Do the steps [from 0.8.1 to 0.8.2](upgrading-older.md#from-0-8-1) first. On 0.8.0, do
the steps [from 0.8.0 to 0.8.1](upgrading-older.md#from-0-8-0) before them.

### Breaking changes

Every reader checks these four.

#### <span id="node-24"></span>Node 24 or later

**Who:** everyone who installs or runs pivotkit-core, pivotkit-xlsx, pivotkit-report, pivotkit-cli,
pivotkit-server or pivotkit-mcp with Node. That includes the build of a React app, because
pivotkit-react depends on pivotkit-core. Browsers do not change.

**Do:** update Node to 24 or later before you update pivotkit. `node --version` must print `v24` or
higher.

- On Node 22, npm installs the packages with an `EBADENGINE` warning. With `engine-strict=true`, npm
  refuses them.
- CI no longer tests Node 22, and no fix comes for it.
- The container image brings its own Node 24. Nothing to do there.
- The [compatibility page](../compatibility.md#node) lists the Node versions CI tests.

#### <span id="public-url-origin"></span>`http.publicUrl` is an origin

**Who:** operators of pivotkit-server or pivotkit-mcp whose `http.publicUrl` or `--public-url` has a
path, such as `https://example.com/reports`. An address with a user name, password, query or
fragment stops the start too, also in `auth.resource` and `rest.resource`.

**Do:** set the origin only, such as `https://reports.example.com`. An origin is scheme, host name
and port, without a path. A trailing `/` is fine.

The server does not start with a path in the address. The error names the remedy. Run
`pivotkit-server check-config` to see it before you restart.

If your address had a path:

- Give pivotkit a host name of its own, such as a subdomain. Or route these paths at the root of the
  shared host: `/mcp`, `/.well-known/`, `/api/v1`, `/openapi.json`, `/downloads/` and `/`. With
  `branding.icon`, route `/icon.png` too. A proxy that strips a prefix such as `/reports` no longer works.
- Point MCP clients at the new address, and set `auth.resource` to it.
- With `output.downloads.signIn`, register the new callback at the identity provider.
  `check-config` prints it.
- Download links sent before the update stop working.

#### <span id="internal-exports"></span>Fewer exports of pivotkit-server

**Who:** code that imports from `pivotkit-server`, `pivotkit-server/policy` or
`pivotkit-mcp/policy`.

**Do:** import only the names that [JavaScript exports](../reference/service-exports.md) lists. If
you need another name, open an issue and say what for.

- A host that imported another name, such as `planState` or `renderFile`, stops at start with an
  error that names it.
- pivotkit-mcp imports the rest from `pivotkit-server/internal`. That entry point is no public
  interface. Any release can change it.

#### <span id="versions-0-9"></span>One release together

**Who:** a host that lists more than one pivotkit package, and every server that runs
pivotkit-server with pivotkit-mcp.

**Do:** update the packages of one release in one command, at the versions in the
[table of this release](#from-0-8-2).

- In 0.x, a caret range admits one minor release only. A host that lists pivotkit-core 0.8 beside
  pivotkit-react 0.9 gets two copies of pivotkit-core.
- pivotkit-mcp 0.4.0 beside pivotkit-server 0.3.x does not start. The error names
  `pivotkit-server/internal`. The other way round, the error names a missing export.

### <span id="other-changes-0-9"></span>Other changes to check

Each of these can break a test, a script, or a client. Skip the ones that do not apply to you.
pivotkit-core and pivotkit-cli users need only the breaking changes and
[views shared with pivotkit 0.8](#views-0-8).

| Change | Who it affects |
| --- | --- |
| [A click in the chart opens a menu](#chart-click-menu) | apps with `onCellClick` or `pivot-cell-click`, and tests that click a chart |
| [The element reads `"false"` as off](#element-false) | pages that use `<pivot-report>` |
| [New texts in the report and the errors](#neutral-texts) | tests, screenshots, and log rules that match words |
| [Views shared with pivotkit 0.8](#views-0-8) | apps on 0.8 and 0.9 at once, and tests that compare views |
| [Reconnect MCP clients](#mcp-reconnect) | operators of pivotkit-server or pivotkit-mcp |
| [A print template the server cannot read](#template-unavailable) | programs that read the status of an html render |
| [503 `BUSY` logs at `warn`](#busy-warn) | log rules that count `error` lines |
| [HTTP sources read JSON while it arrives](#http-json) | operators of HTTP sources with unusual JSON |
| [`ViewInput` is now `PivotView`](#pivot-view-type) | TypeScript code that uses pivotkit-react |

#### <span id="chart-click-menu"></span>A click in the chart opens a menu

Click a bar, a point, a slice, or a heatmap cell, and a small menu opens there. Its first item,
**Show the rows**, opens the rows, as the click did before. A double click opens them at once.
See [filter from the chart](../use/charts.md#filter-from-the-chart).

- `onCellClick` and `pivot-cell-click` for a chart point fire at **Show the rows** or at the double
  click. They no longer fire at the first click.
- In tests, click **Show the rows** or double-click the point.
- On a phone, the second tap opens the menu.
- The table does not change. Clicking a value still opens its rows.

#### <span id="element-false"></span>The element reads `"false"` as off

Every boolean attribute of `<pivot-report>` reads `"false"` as off, in any case. Before,
`save-templates`, `can-publish`, `allow-import` and `loading` were on with any value. A page that
wrote `allow-import="false"` offered to load files. Now it does not.

**Do:** nothing, unless you meant such an attribute as on. Then write it without a value.
See [the attributes](../reference/element.md#properties-and-attributes).

#### <span id="neutral-texts"></span>New texts in the report and the errors

Some texts changed. Error codes stay the same.

**Do:** match an error's `code`, not its words. Take screenshots again.

- Errors of the services no longer name pivotkit. `SOURCE_UNAVAILABLE` says "the source's backend
  refused this server's access". `UNSUPPORTED_FORMAT` says "`<name>`: the server reads csv,
  tsv, txt, json and xlsx files".
- pivotkit-react's messages about a loaded view no longer name pivotkit, for example "This is not a
  view.". A host that sets these texts through `labels` keeps its own.
- The filter has plainer words. "Text condition" is now "Only if the name". The buttons that add a
  rule read "Filter by Region" and the like. See [filter by name](../use/filters.md#rule-on-the-name).
- <span id="other-slice"></span>A pie or donut with the legend off groups its smallest slices into
  "Other (n)". See [many slices](../use/charts.md#many-slices).
- On phones and tablets, every control is at least 44 by 44 px. A phone shows a little less of the table.
  See [sizes on phones](../use/keyboard.md#touch-and-sizes).
- A German report waits for its texts before it renders. A test waits for a German text, not only
  for the first render. See [built-in languages](../reference/localisation.md#built-in-languages).

#### <span id="views-0-8"></span>Views shared with pivotkit 0.8

pivotkit 0.8 can open a view made with 0.9. It drops the new settings and reports an issue. If
someone saves the view again in 0.8, the view loses the settings.

**Do:** update every app that opens the same views to 0.9 at the same time.

The new settings are these. A view file or a link that uses none of them reads in 0.8 as before.

- <span id="combo-treemap"></span>[Chart types](../use/charts.md#chart-types) `"combo"` and
  `"treemap"`.
- <span id="sort-column"></span>[Sort by one column](../use/filters.md#sort-with-a-click-on-a-header):
  `column` in a sort entry.
- <span id="field-labels"></span>[A field's own name in the report](../use/fields.md):
  `fieldLabels`.
- <span id="display-both"></span>[Table and chart side by side](../use/charts.md#both):
  `display: "both"`.
- <span id="chart-points"></span>[High and low points](../use/charts.md#high-and-low-points):
  `chart.referenceLines.extremes`.

This also concerns code that uses pivotkit-core, with no 0.8 app around:

- A normalized view always has `chart.referenceLines.extremes`, `false` when it is off. A test
  that compares a whole normalized view needs the new key.
- A program that reads views gets the new keys.

#### <span id="mcp-reconnect"></span>Reconnect MCP clients

<span id="named-views"></span><span id="link-params"></span><span id="source-list-rows"></span>The
descriptions and schemas of `render_view`, `create_link`, `draft_schedule` and `list_sources`
changed.

**Do:** reconnect each MCP client after the update, so it reads the new tools.

What changed in the tools:

- A view's name works as `view`, for the [named views](../reference/sources.md#views) a source
  publishes.
- `create_link` and `draft_schedule` take a `layout` instead of a `view`.
- `create_link` writes the parameters that `sources.<id>.linkParams` lists into the page's query
  string. The host page then sends `Referrer-Policy: same-origin` or `no-referrer`. See
  [link parameters](../concepts/sharing.md#link-params).
- `list_sources` adds `rows` and `dataAsOf`.

#### <span id="template-unavailable"></span>A print template the server cannot read

An html render whose print template the server cannot read answers 502 `SOURCE_UNAVAILABLE`, with
`retryable: false`. Before, it answered 404 `FILE_NOT_AVAILABLE`. The answer no longer names the
template's file. A warning in the log names it.

**Do:** a program that reads the status of an html render expects 502 for this case.

#### <span id="busy-warn"></span>503 `BUSY` logs at `warn`

A 503 `BUSY` answer means the server is full, not broken. The client may try again. Its log lines
now have the level `warn`. Every other 5xx stays at `error`.

**Do:** a log rule that counts `error` lines counts `BUSY` among the warnings, or matches its
`code`.

#### <span id="http-json"></span>HTTP sources read JSON while it arrives

An HTTP source reads a JSON answer row by row, while it arrives. That needs less memory. One rare
body is now refused with `SOURCE_UNAVAILABLE`: a body that repeats, after the rows, a key on the
path to the rows.
CSV answers do not change.

**Do:** if a source fails after the update, fix the backend's answer. See
[reading the answer](../reference/sources.md#http-rows).

#### <span id="pivot-view-type"></span>`ViewInput` is now `PivotView`

pivotkit-react calls its view type `PivotView`, the name pivotkit-element uses. `ViewInput` still
works. The deprecation PK-DEP-0001 removes it in 2.0.0 at the earliest.

**Do:** replace `import { type ViewInput } from "pivotkit-react"` with `type PivotView`. TypeScript
shows no warning for the old name. The [register](../versioning.md#register) lists it.
