---
title: Container image
description: The pivotkit container image - the REST service, the MCP server and the command line in one distroless Node 24 image; the token it makes at its first start, running it read-only and non-root, configuration, managed secrets, volumes, health checks, OAuth, Kubernetes, and checking its signature, provenance and SBOM.
---

# Container image

`ghcr.io/eizedev/pivotkit` runs the [REST service](rest.md), the [MCP server](mcp.md) and the
[command line](cli.md) from one install. It holds pivotkit-server, pivotkit-mcp and pivotkit-cli at
the versions of one release. The base is a distroless Node 24 image, with no shell and no package
manager. The image runs as the user 10001.

| Tag | What it is |
| --- | --- |
| `<version>`, the version of the release tag `pivotkit-server@<version>` | That release, unchanged |
| `<major>.<minor>` | The latest release of that minor version |
| `latest` | The image of the pivotkit-server release published last. That can be a new minor version, or an older version when a patch of an older minor version comes out later. Not for production |

To update a running container, see [Update an installation](../getting-started/upgrading.md#update-image).

The image workflow builds each image for linux/amd64 and linux/arm64 from the release's commit. It
signs the image with cosign (keyless) and attaches a provenance and an SBOM attestation
([below](#verify)).

## Run it { #run }

The image runs `pivotkit-server serve --host 0.0.0.0` on port 3333. It reads the configuration file
`/config/pivotkit.json`, one file for both [REST](rest.md) and [MCP](mcp.md#configuration).

The server listens on every address of the container, so it serves only with sign-in. Without a
token of yours, it makes the token `admin` at its first start, in the state directory
`/var/lib/pivotkit` ([made at the first start](rest.md#first-start)).
[Server in 5 minutes](../getting-started/server-in-5-minutes.md) walks through it:

```bash
docker run -d --name pivotkit \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  -p 127.0.0.1:3333:3333 \
  -v pivotkit:/var/lib/pivotkit \
  -v "$PWD/data:/data:ro" \
  -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" \
  ghcr.io/eizedev/pivotkit:<version>
docker exec pivotkit pivotkit-server token show admin
```

A minimal configuration (paths are inside the container):

```json
{
  "sources": { "sales": { "file": "/data/sales.csv", "title": "Sales", "policy": { "fields": { "Region": "show", "Customer": "hide" } } } },
  "output": { "dir": "/var/lib/pivotkit/out", "maxAgeDays": 7 }
}
```

Without a configuration (nothing in `/config`), the image serves its built-in example:

- The source `example` holds the command line's sales data.
- Reports go to `/var/lib/pivotkit/out`.
- Callers may download files (`policy.results`) and send data (`policy.data`).

With the built-in example, a mounted `/data` is not readable by path. The token `admin` holds every
scope, so you open a directory only on purpose, in a configuration:
`"files": { "allowDirs": ["/data"] }`.

If `/config` holds other files but no `pivotkit.json`, pivotkit refuses it and names those files.
This catches a typo such as `pivotkit.jsn`.

| Path | What goes there |
| --- | --- |
| `/config/pivotkit.json` | The configuration (`$PIVOTKIT_CONFIG` names another) |
| `/data` | The data files, mounted read-only |
| `/var/lib/pivotkit` | The state directory (`$PIVOTKIT_STATE_DIR`). Mount a named volume there ([below](#state-dir)) |
| `/out` | An output directory for a configuration that names it. The user 10001 must be able to write to it ([below](#out-dir)) |
| `/run/secrets/` | Token files of your own, readable by the user 10001 ([managed secrets](#managed-secrets)) |
| `/tmp` | A tmpfs: the root file system stays read-only |

Set the port with `PIVOTKIT_PORT` or `http.port` in the file. The health check reads both. The server reads a token file on every request, so a new token works without a
restart:
`docker exec pivotkit pivotkit-server token new --file /var/lib/pivotkit/secrets/admin.token --force`.

[docker/compose.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.example.yml)
and [docker/pivotkit.example.json](https://github.com/eizedev/pivotkit/blob/main/docker/pivotkit.example.json)
are this setup for Docker Compose. There you show the token with
`docker compose exec pivotkit pivotkit-server token show admin`.

### Connections per address { #per-address }

The server bounds the connections one address may hold: 32 by default. This keeps one client from
taking every connection. It counts the address the container sees, and that depends on how Docker
forwards the published port on that host:

- Often the container sees each client's own address. Then the default fits.
- Sometimes every connection comes from the Docker network's gateway, such as `172.17.0.1`. Then
  all clients share the 32.

`check-config` prints the bound under `HTTP:`. The log line for refused connections names the
address (`perAddress`). If it names the gateway, or an office's one NAT address, raise the bound.
Behind a proxy with `http.trustProxy` there is no bound by default ([below](#oauth)).

These settings live only in the configuration file. There is no flag or variable for them. Add
them to the `pivotkit.json` you mount at `/config/pivotkit.json` ([above](#run)). A file with only
these keys has no sources, since the built-in example applies only when `/config` is empty. `0`
switches the bound off:

```json
{
  "sources": { "sales": { "file": "/data/sales.csv", "title": "Sales" } },
  "http": { "maxConnectionsPerAddress": 128 }
}
```

Behind a proxy that writes `X-Forwarded-For`, set `"http": { "trustProxy": true }` instead.

### The state directory { #state-dir }

`/var/lib/pivotkit` is the state directory:

- It holds the token and keys made at the first start, in `secrets/`. The folder has mode 0700, each
  file 0600.
- It holds the reports in `out/` when `output.dir` names it.
- Mount a named volume there. A new volume takes the image's owner (10001) and mode (0700).
- The image declares no `VOLUME`. Without a volume, the server starts but warns that the token and
  keys are lost with the container. With `--read-only` and no volume, the server does not start,
  since it cannot make the token.
- Use one container per volume, or several containers on one shared volume. Containers on one shared
  volume end up with one token.

### An output directory in `/out` { #out-dir }

Mount `/out` for an output directory that a configuration names. The image declares no `VOLUME`
there. Without a mount, you lose the reports and the schedule drafts waiting for approval with the
container. Mount a named volume (`-v pivotkit-out:/out`) or a host folder. The user 10001 must be
able to write to it:

- A named volume is writable by the user 10001. A host folder needs `chown 10001:10001`.
- Docker makes a missing host folder as root, so make it yourself first. `check-config` and the start
  say so when the folder is not writable.
- When `output.dir` names a directory below `/out`, the server makes it at start, with mode 0700.
  When `output.baseUrl` is set, the mode is 0755 narrowed by the umask.
- With mode 0700, only the user 10001 reads the directory, and reports are 0600. A second reader,
  such as a web server or a backup, needs `output.baseUrl` or must run as the user 10001.
- The server's own [download links](delivery.md) record which one-time links were used in
  `.pivotkit-downloads/` there.

### Managed secrets { #managed-secrets }

Put tokens of your own into `auth.tokens`, for example several with a profile each. The server then
makes no `admin`. Keep the tokens in files (secrets), not in environment variables, because
`docker inspect` shows a container's environment.

The simplest way lets the server make each token file. Write the token with `"create": true` and a
file in the state volume ([made at the first start](rest.md#first-start)):

```json
{ "auth": { "mode": "token", "tokens": [
    { "name": "reports", "file": "/var/lib/pivotkit/reports.token", "create": true },
    { "name": "exports", "file": "/var/lib/pivotkit/exports.token", "create": true, "profile": "export" }
  ] },
  "policy": { "profiles": { "export": { "results": true } } } }
```

At its next start, the server makes each missing file as the user 10001, with mode 0600. Print a
token with `token show`:

```bash
docker exec pivotkit pivotkit-server token show reports
```

To make a token file on the host instead, the image makes the value, so you need no other tool:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/secrets:/out" ghcr.io/eizedev/pivotkit:<version> token new --file /out/pivotkit_token
```

In PowerShell, mount `"${PWD}/secrets:/out"` and leave `--user` out. The image then writes as its
user 10001. Whether it may write the folder depends on Docker Desktop's file sharing. Check
afterwards that the file is there and that you can read it.

With Node, run `npx -y pivotkit-server token new --file secrets/pivotkit_token`.

`token new --file` writes mode 0600 for your own user ([tokens and keys](rest.md#credentials)).
Output you save with `>` instead gets the mode your umask gives, often 0644, which everyone can
read. Run `umask 077` first if you do that.

For a token that expires on its own, issue a [signed token](rest.md#signed-tokens) in the running
container. It needs no change to the configuration:

```bash
docker exec pivotkit pivotkit-server token issue --expires 8h --name laptop
```

`token new --add` writes the token into `auth.tokens` of the configuration file. It needs that file
writable. With the configuration mounted `:ro`, run it where you edit the file, or add the entry by
hand.

Docker mounts a secret file with its owner and mode from the host, so the user 10001 must be able to
read it. Give it to that user with `sudo chown 10001 secrets/*` and `chmod 0400`. The file then stays
hidden from the host's other users. `check-config` and the start say so when the user 10001 cannot
read the file.

[docker/compose.secrets.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.secrets.example.yml)
and [docker/pivotkit.secrets.example.json](https://github.com/eizedev/pivotkit/blob/main/docker/pivotkit.secrets.example.json)
are an example with two tokens as secrets. One of them has a profile that may download files. The
server still makes the key of the download links in the state volume.

The image sets `PIVOTKIT_LOG_FORMAT=json`, so the log is JSON lines on stderr, also under
`docker run -t`. A configuration's `log.format` still wins. Each answer carries `X-Request-Id`, the
id on its log lines. [Operations and logs](operations.md) lists the fields and shows the `gelf` and
`syslog` log drivers. The Compose example keeps the log with the `local` driver, bounded in size.

## Commands { #commands }

The image's entry point is `pivotkit-server`. The command after the image name is its subcommand:

```bash
docker run --rm ghcr.io/eizedev/pivotkit:<version> --help
docker run --rm ghcr.io/eizedev/pivotkit:<version> token new   # a token on stdout (key new --for downloads: the download key)
docker exec pivotkit pivotkit-server token show admin   # a token's value as the running server reads it (kubectl exec deploy/pivotkit -- the same)
docker exec pivotkit pivotkit-server token show token   # the one of $PIVOTKIT_TOKEN, or of $PIVOTKIT_MCP_TOKEN where only that is set (pivotkit-server mcp)
docker run --rm -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" -v "$PWD/data:/data:ro" -v pivotkit:/var/lib/pivotkit ghcr.io/eizedev/pivotkit:<version> check-config --host 0.0.0.0   # the mounts of the example above
docker run --rm --read-only -v "$PWD:/work" -w /work ghcr.io/eizedev/pivotkit:<version> cli render view.json --data sales.csv -o report.xlsx
docker run --rm -i -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" -v "$PWD/data:/data:ro" ghcr.io/eizedev/pivotkit:<version> mcp
```

`pivotkit-server` is on the image's `PATH`, so `docker exec` and `kubectl exec` run it by name.

- `mcp` runs the MCP server over stdio, for a client that starts the container itself. It reads
  `/config/pivotkit.json` too. Over stdio, it makes nothing in the state directory.
- `cli` writes where you mount a writable folder.
- `serve --enable rest` serves REST only. The MCP endpoint is on by default.

Give `check-config` the flags you give `serve`: `--host 0.0.0.0`, as the image's own `serve` has it,
and `--enable` where you set it. Without them, it checks a server on loopback with REST and MCP.
Under `Credentials`, it says whether the token and keys are there, will be made at the first start,
or cannot be made (a read-only state directory). `check-config` itself makes nothing.

## Health { #health }

The image has a `HEALTHCHECK` that runs `pivotkit-server healthcheck` every 30 seconds. It asks
`/healthz`, which answers while the process runs. It takes the port from `http.port` of the file
`$PIVOTKIT_CONFIG` names (the image sets `/config/pivotkit.json`), then `$PIVOTKIT_PORT`, then 3333
([commands](rest.md#running)). It does not see a `--config` or `--port` flag of the start command.
Use one of these two ways for the port.

The health check's request stays inside the container. The image makes no request of its own.
[Network requests](../security.md#network) lists every request the server can make.

`/readyz` answers 200 only when the server can take work, and 503 otherwise. The server can take
work when the OAuth issuer is loaded, the workers are up and the output directory is writable. Use
`/readyz` as a readiness probe.

On `docker stop` (SIGTERM), the server takes no new connection. It lets running reports finish for up
to 25 seconds (`http.graceMs`). Give the container more time than that: `--stop-timeout 30` or
`stop_grace_period: 30s`.

## Behind a proxy, with OAuth { #oauth }

Behind a proxy:

- Set `http.publicUrl` to the origin clients use, without a path.
- Keep the proxy's `Host` header, or add its name to `http.allowHosts`. The server answers no other
  host name.
- With a proxy or a published port in front, every client comes from one address. Set
  `http.trustProxy` with a proxy that writes `X-Forwarded-For`
  ([the nginx example](rest.md#running)). The limit on refused tokens then counts per client.
- In this setup, the proxy guards the connections (timeouts, limits per client). The
  container's port should be reachable from the proxy only.
- With `http.trustProxy`, the server sets no bound on connections per address by default. Every
  client has the proxy's address, so the proxy limits its clients.

With OAuth, the MCP endpoint and the REST service are two resources with their own audiences:

```json
{
  "auth": { "mode": "oauth",
    "issuer": "https://login.example.com/realms/example",
    "resource": "https://reports.example.com/mcp",
    "requiredScopes": ["pivotkit"],
    "scopeProfiles": { "pivotkit:export": "export" } },
  "rest": { "resource": "https://reports.example.com/api/v1" },
  "policy": { "profiles": { "export": { "results": true } } },
  "http": { "publicUrl": "https://reports.example.com/" }
}
```

The provider must put `https://reports.example.com/api/v1` into the `aud` of tokens for the REST
service. In Keycloak that is an audience mapper, in Entra ID the application ID URI.
[MCP: OAuth](mcp.md#oauth) has provider examples. The image must reach the issuer over HTTPS.

Until the server has loaded the issuer's keys, `/readyz` answers 503. The server tries again after 2,
4, 8 seconds and so on, with a wait of up to one minute. After a long outage of the issuer, it can take up to a
minute to be ready again.

The proxy also routes `/downloads/` to the container, because reports come back as
[download links](delivery.md) there. The server makes the link key at the first start in the state
volume, so links survive a restart. More than one container needs one of these (or run one
container only):

- one shared state volume
- a key of your own as a secret file
  (`"output": { "downloads": { "key": { "file": "/run/secrets/download-key" } } }`) and one shared
  output directory

For sign-in links, add a browser client at the provider with the redirect URI
`https://reports.example.com/downloads/callback`. Then set `"signIn": { "clientId": "..." }` in
`output.downloads`.

## Kubernetes { #kubernetes }

[Kubernetes](../getting-started/kubernetes.md) has a complete example manifest and explains it: the
pod's security settings, probes with `Host: localhost`, getting data files into `/data`, memory per
worker, Service, Ingress, NetworkPolicy and sign-in with an identity provider.

## Check the image { #verify }

This repository's image workflow signs each release's image with cosign's keyless signing. Check the
signature, then the attestations. The commands below use cosign 3 and Docker's buildx. Check their
options against the current documentation of both tools:

```bash
cosign verify ghcr.io/eizedev/pivotkit:<version> \
  --certificate-identity-regexp '^https://github\.com/eizedev/pivotkit/\.github/workflows/image\.yml@refs/tags/pivotkit-server@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
docker buildx imagetools inspect ghcr.io/eizedev/pivotkit:<version> --format '{{ json .Provenance }}'
docker buildx imagetools inspect ghcr.io/eizedev/pivotkit:<version> --format '{{ json .SBOM }}'
```

The image workflow builds the image from the release's commit with `npm ci --omit=dev --ignore-scripts`
from the repository's lock file. The base images are pinned by digest
([docker/Dockerfile](https://github.com/eizedev/pivotkit/blob/main/docker/Dockerfile)).

## Without containers { #windows }

The same service runs from npm. Install it with `npm install --global pivotkit-server pivotkit-mcp`,
then run `pivotkit-server serve --config pivotkit.json`. You can run it as a Windows service next to
PowerShell Universal, for example. See [Running it](rest.md#running).
