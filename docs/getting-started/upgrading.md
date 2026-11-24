---
title: Upgrading
description: How to update pivotkit's packages, the image and the plugin, and what you must change for the newest release.
---

# Upgrading

For everyone who updates an installation of pivotkit. The first part says how to update, for each
way of installing. The second part lists the changes of the next release and of the latest one that
need your action. Every other change is in the package's `CHANGELOG.md`. [Versioning](../versioning.md) says
which releases may break things.

## Update an installation { #update }

Read [what changed](#changes) before you update. For a setup others rely on, update to a version
you name and checked, not to whatever is newest. `npm view <package> version` names a package's
newest release.

pivotkit's packages of one release belong together. pivotkit-server and pivotkit-mcp in particular:
install both of one release in one command. A pivotkit-mcp that does not fit the pivotkit-server
beside it stops `serve` and `mcp` with "does not fit pivotkit-server" or "does not provide an export
named".

### Installed with `npm install --global` { #update-global }

```bash
npm outdated --global
npm install --global pivotkit-server@<version> pivotkit-mcp@<version> pivotkit-cli@<version>
pivotkit-server --version
```

- `npm update --global` takes every global package to its newest release, across minor versions
  too. Name the version instead.
- Install global packages into a folder you own, set as npm's `prefix`. Don't use `sudo`.
- To check the registry's signatures first, install the release into an empty folder and run
  `npm audit signatures` there. npm does not check them for global packages.

### In a project or an app folder { #update-project }

`npm update` stays inside the range in `package.json`. In 0.x, `^0.y.z` takes the later 0.y
patches, never the next minor version. For a new minor version, name it:

```bash
npm install <package>@<version>
npm audit signatures
```

### Started with `npx` { #update-npx }

`npx -y pivotkit-mcp` without a version takes the newest release at each start. When a global install
or one in a parent folder exists, `npx` runs that copy instead. Write the version into the
command: `npx -y pivotkit-mcp@<version>`. Use `@latest` only for a setup of your own: `-y` then runs
each new release unread. The same holds for `pivotkit-cli` and `pivotkit-server`.

### Restart what runs { #update-restart }

A running process keeps the version it started with.

- An MCP client over stdio starts the server per session. Restart the client.
- Restart `pivotkit-server serve` and `pivotkit-mcp --http`, for example
  `nssm restart pivotkit` for [the Windows service](powershell-universal.md#psu-service).

### The container image { #update-image }

Each release of pivotkit-server builds the image. It holds pivotkit-mcp and pivotkit-cli of
the same commit, so a release of pivotkit-cli or pivotkit-mcp alone reaches the image with the next
pivotkit-server release. Its [tags](../reference/container.md): `<version>` never moves, `<major>.<minor>`
follows that minor version's patches, and `latest` follows the release published last, which can be
a new minor version. Use the exact version or its digest in production, and
[check the signature](../reference/container.md#verify) before you restart.

Pulling a tag does not change a running container. Make it again:

=== "docker run"

    ```bash
    docker pull ghcr.io/eizedev/pivotkit:<version>
    docker rm -f pivotkit
    # then the same docker run as before, with the new tag
    ```

    Token, keys and reports stay in the volume `pivotkit`. A configuration that writes to `/out`
    needs a volume there too, or the reports and drafts are lost with the container.

=== "Docker Compose"

    Set `PIVOTKIT_VERSION` (shell or `.env`) for
    [compose.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.example.yml),
    then `docker compose pull` and `docker compose up -d`. With a `<major>.<minor>` tag, each pull
    takes that line's newest patch: check its signature too.

=== "Kubernetes"

    Write the exact version or the digest into the manifest. A node that pulled a moving tag once keeps
    that image, and `latest` is pulled at every start, so either updates when you don't expect it.
    Change the version and apply the manifest again, or use `kubectl set image`. The [example](kubernetes.md) replaces the pod
    (`strategy: Recreate`), as one output directory takes one server process.

`docker run --rm ghcr.io/eizedev/pivotkit:<version> --version` prints the version. Add `mcp` or
`cli` before `--version` for the others.

### The Claude Code plugin { #update-plugin }

The plugin holds only [the skill](mcp.md#skill), not the server. Update it on its own, then restart
Claude Code:

```bash
claude plugin marketplace update pivotkit
claude plugin update pivotkit-mcp@pivotkit
```

## What changed { #changes }

### In the next release { #next }

These changes are on `main` and come with the next release.

| Change | Applies to you when | Action |
| --- | --- | --- |
| **Breaking:** [pivotkit-server no longer brings pivotkit-cli](#server-without-cli) | you installed pivotkit-server from npm and run `pivotkit-server cli` | install pivotkit-cli beside it |
| **Breaking:** two inputs where the CLI read one | a script runs `pivotkit render <view> --link <url>`, or `pivotkit describe <data> --data <other>` | keep the input you mean: the view or `--link`; the data to describe, or a view with `--data` |
| **Breaking:** the label `settingsShort` is gone | your `labels` set `settingsShort` | remove it. On a phone the settings button shows its icon only, named by `tableSettings` or `chartSettings` |
| **Breaking:** reports are written with mode 0600 | another user reads the output directory without `output.baseUrl`, such as a backup job | run that reader as the server's user, or set `output.baseUrl`; `chmod 600` older reports to match |

#### pivotkit-server no longer brings pivotkit-cli { #server-without-cli }

`pivotkit-server cli` runs the pivotkit-cli installed beside pivotkit-server. Install it the way you
installed pivotkit-server, for example `npm install --global pivotkit-cli@<version>`. Without it, the
command exits with code 2 and names `npm install pivotkit-cli`, and `npm install --global pivotkit-cli` for a
global install. The container image has all three
packages.

### From 0.8 to 0.9 { #from-0-8-2 }

pivotkit-server and pivotkit-mcp move from 0.3 to 0.4 with this release. The table lists the
changes that need an action. The changelogs list changes of texts, of the layout, and new options.

| Change | Applies to you when | Action |
| --- | --- | --- |
| **Breaking:** [`http.publicUrl` is an origin](#public-url-origin) | `http.publicUrl` or `--public-url` has a path, user, password, query, or fragment | give pivotkit a host name of its own, or route its paths at the host's root. Then set the origin |
| **Breaking:** [Node 24 or later](#node-24) | you run pivotkit's packages on Node 22 | update Node first. The image brings Node 24 |
| **Breaking:** [Fewer JavaScript exports of pivotkit-server](#internal-exports) | your code imports a name that [JavaScript exports](../reference/service-exports.md) does not list | use a listed name, or open an issue |
| [Versions move together](#update) | you list pivotkit-core, pivotkit-report or pivotkit-xlsx yourself | update them to the release of pivotkit-react 0.9: core 0.9.0, report 0.5.0, xlsx 0.6.0 |
| A link names [a source's parameters](../concepts/sharing.md#link-params) | links carry a source's parameters | list them in `sources.<id>.linkParams`. Send `Referrer-Policy: same-origin` or `no-referrer`, see [security](../security.md#link-params) |
| New MCP tool descriptions and view schema | you run pivotkit-server or pivotkit-mcp | reconnect MCP clients |
| Error and message texts without the product name | a program or log rule matches the words of an error, or of pivotkit-react's messages about a loaded view | match the error's `code`, or update the words |
| Views of 0.9 opened by pivotkit 0.8 | pages with pivotkit 0.8 open views made with 0.9: names of a field (`fieldLabels`), table and chart side by side, the two new chart types, sort by one column | update every page that shares views to 0.9. pivotkit 0.8 opens such a view with an error note and falls back to the fields' own names, the table, its automatic chart type and the sort by the whole row. Saved there, the view loses these settings |
| An unreadable print template is the server's error | a program reads the answer of an html render | expect 502 `SOURCE_UNAVAILABLE`, not 404 `FILE_NOT_AVAILABLE` |
| 503 `BUSY` logs at `warn` | a log rule counts `error` lines | count `BUSY` among the warnings, or match its `code` |
| A click in the chart opens a menu | your app uses `onCellClick` or `pivot-cell-click` for chart points, or tests click a chart point | the call comes at **Show the rows** or a double click |
| An [HTTP source](../reference/sources.md#http-rows) reads JSON while it arrives | a backend's JSON repeats a key on the way to its rows after them | fix the answer. The server refuses it with `SOURCE_UNAVAILABLE` |
| `<pivot-report>` reads `"false"` as off | a page writes `save-templates`, `can-publish`, `allow-import` or `loading` as `"false"` and means on | leave the attribute out |
| `ViewInput` is now `PivotView` | TypeScript code imports `ViewInput` from pivotkit-react | import `PivotView`. `ViewInput` still works until its [deprecation](../versioning.md#register) ends |

#### `http.publicUrl` is an origin { #public-url-origin }

The server serves at the root of its host, so `http.publicUrl` and `--public-url` take an origin such
as `https://reports.example.com`. The server does not start with a path, user, password, query or
fragment there, or in `auth.resource` and `rest.resource`. `check-config` shows it before you
restart.

On a shared host, give pivotkit a host name of its own, or route `/mcp`, `/.well-known/`, `/api/v1`,
`/openapi.json`, `/downloads/` and `/` at the root of that host. If your address had a path, change
these with it:

- With `output.downloads.signIn`, register the new sign-in callback at the identity provider.
  `check-config` prints it.
- Point MCP clients at the new address and set `auth.resource` to it.
- Download links sent before the update stop working.

#### Node 24 or later { #node-24 }

pivotkit-core, -xlsx, -report, -cli, -server and -mcp need Node 24 or later. `node --version` must
print `v24` or higher. On Node 22, npm warns with `EBADENGINE`, or refuses with
`engine-strict=true`. [Compatibility](../compatibility.md#node) lists the tested versions.

#### Fewer JavaScript exports of pivotkit-server { #internal-exports }

`pivotkit-server`, `pivotkit-server/policy` and `pivotkit-mcp/policy` export only the names that
[JavaScript exports](../reference/service-exports.md) lists. A host that imported another name, such
as `planState` or `renderFile`, gets an error at start that names it.

## Older releases { #older }

The changes of 0.8 and earlier are in each package's changelog:
[pivotkit-react](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-react/CHANGELOG.md),
[pivotkit-server](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-server/CHANGELOG.md),
[pivotkit-mcp](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-mcp/CHANGELOG.md),
[pivotkit-cli](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-cli/CHANGELOG.md) and
the [other packages](https://github.com/eizedev/pivotkit/tree/main/packages). Read the entries marked
**Breaking** and the sections "Upgrading from" of every minor version from yours to the new one. The
[page as it was for 0.9](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md)
has the details for 0.4 to 0.8.
