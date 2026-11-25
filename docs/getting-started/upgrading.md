---
title: Upgrading
description: How to update pivotkit's packages, the image and the plugin, and what you must change for the newest release.
---

# Upgrading

For everyone who updates an installation of pivotkit. The first part says how to update, for each
way of installing. The second part lists the changes of the newest release that need your action,
and those of the next release once `main` has any. Every other change is in the package's
`CHANGELOG.md`. [Versioning](../versioning.md) says which releases may break things.

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

### From 0.10 to 0.11 { #from-0-10 }

The next release, on `main` now. The table lists the changes that need an action.

| Change | Applies to you when | Action |
| --- | --- | --- |
| **Breaking:** a key file that starts with a UTF-8 byte order mark is refused | a key's `{ "file" }` (`output.downloads.key`, `audit.key`, a backend's or the upload store's secret) starts with one, as Windows PowerShell 5.1's `-Encoding UTF8` writes it | save the file as UTF-8 without the mark. `check-config` names the file. Download links made with the old key stop working, and audit hashes change |
| A backend's sign-in and `output.upload`'s headers read `{ "env" }` secrets from the `env` the host passes | a host passes its own `env` to `createContext` or `serve()` without those variables | add the variables to that `env`. The start warns when a backend's sign-in cannot read its secret |

### From 0.9 to 0.10 { #from-0-9 }

pivotkit-server and pivotkit-mcp move from 0.4 to 0.5 with this release, pivotkit-cli from 0.5 to
0.6. The table lists the changes that need an action. The changelogs list changes of texts, of the
layout, and new options.

| Change | Applies to you when | Action |
| --- | --- | --- |
| **Breaking:** [pivotkit-server no longer brings pivotkit-cli](#server-without-cli) | you installed pivotkit-server from npm and run `pivotkit-server cli` | install pivotkit-cli beside it |
| **Breaking:** two inputs where the CLI read one | a script runs `pivotkit render <view> --link <url>`, or `pivotkit describe <data> --data <other>` | keep the input you mean: the view or `--link`; the data to describe, or a view with `--data` |
| **Breaking:** the label `settingsShort` is gone | your `labels` set `settingsShort` | remove it. On a phone the settings button shows its icon only, named by `tableSettings` or `chartSettings` |
| **Breaking:** the theme token `--pk-knob` is gone | your page or `tokens` set `--pk-knob` | remove it; nothing used it |
| **Breaking:** the CLI's `--strict` refuses views with a dropped setting | a script runs `pivotkit render` or `validate` with `--strict` on a view with a switch that is not `true` or `false`, a section that is not an object, or an unknown sort `order` or "show as" `axis` | fix the setting the warning names, or leave out `--strict` |
| **Breaking:** `render` checks the kind of its options | your code passes pivotkit-report's `render` a `tableCells` as text or with a fraction (`"100"`, `10.5`), or a `title`, `description`, `source`, `labels` or `texts` of another kind | pass a whole number (or `Infinity`), texts and objects; `null` still means "not given" |
| **Breaking:** wrong arguments throw `PivotkitError` | your code catches `TypeError` from pivotkit-core's `toViewFile` (a view that is no object), `viewFromLayout` (a filter with a cycle or a BigInt) or `readFile` (`plugins` that is no list), or passes `createHistory` a `limit` that is no number | catch `PivotkitError` (codes `INVALID_ARGUMENT` and `INVALID_OPTION`); pass `createHistory` a number or leave `limit` out |
| **Breaking:** the view schema refuses a blank label | you validate stored view files against `view-2.json` or `view-file-2.json`, and a value's `label` or a name in `fieldLabels` is blank | give it a character or remove it; `normalize()` dropped such a label already |
| **Breaking:** header values refuse the control characters U+0080 to U+009F | a header value in your configuration or secret holds one of them | remove the character. The start or the log names the header |
| **Breaking:** reports are written with mode 0600 | another user reads the output directory without `output.baseUrl`, such as a backup job | run that reader as the server's user, or set `output.baseUrl`; `chmod 600` older reports to match |
| Numbers in loaded files read by their decimal mark | people load CSV or Excel files with text numbers such as `1,234` or `1.500` | check the column the note `DECIMAL_MARK` names. A comma-separated file reads `"1,234"` as 1234, where it read as 1.234; an Excel text cell `"1.500"` reads as 1500 in a German locale, where it read as 1.5 |
| pivotkit-server answers a little differently | a client keeps `list_sources` file names, relies on the order of `files.list`, or calls `/openapi.json` or the REST metadata with a method other than GET or HEAD | read file names of the second and later `files.allowDirs` without their path; sort `files.list` yourself if you need another order; use GET (other methods get 405 with `Allow: GET, HEAD`). The [pivotkit-server changelog](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-server/CHANGELOG.md) has the details |
| [Versions move together](#update) | you list pivotkit-core, pivotkit-report or pivotkit-xlsx yourself | update them to the release of pivotkit-react 0.10: core 0.10.0, report 0.6.0, xlsx 0.7.0 |

#### pivotkit-server no longer brings pivotkit-cli { #server-without-cli }

`pivotkit-server cli` runs the pivotkit-cli installed beside pivotkit-server. Install it the way you
installed pivotkit-server, for example `npm install --global pivotkit-cli@<version>`. Without it, the
command exits with code 2 and names `npm install pivotkit-cli`, and `npm install --global pivotkit-cli`
for a global install. The container image has all three packages.

## Older releases { #older }

The changes of 0.9 and earlier are in each package's changelog:
[pivotkit-react](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-react/CHANGELOG.md),
[pivotkit-server](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-server/CHANGELOG.md),
[pivotkit-mcp](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-mcp/CHANGELOG.md),
[pivotkit-cli](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-cli/CHANGELOG.md) and
the [other packages](https://github.com/eizedev/pivotkit/tree/main/packages). Read the entries marked
**Breaking** and the sections "Upgrading from" of every minor version from yours to the new one.
Earlier versions of this page have the details:
[0.9](https://github.com/eizedev/pivotkit/blob/152bc7809fd41021a0650996f685e657cf1fbb89/docs/getting-started/upgrading.md#from-0-8-2)
and [0.4 to 0.8](https://github.com/eizedev/pivotkit/blob/5e36b19f07b8c9cff75a14c57316576d8dd9d50b/docs/getting-started/upgrading.md).
