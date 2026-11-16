---
title: Container image
description: The pivotkit container image - the REST service, the MCP server and the command line in one distroless Node 22 image; the token it makes at its first start, running it read-only and non-root, configuration, managed secrets, volumes, health checks, OAuth, Kubernetes, and checking its signature, provenance and SBOM.
---

# Container image

`ghcr.io/eizedev/pivotkit` runs the [REST service](rest.md), the [MCP server](mcp.md) and the
[command line](cli.md) from one install: pivotkit-server, pivotkit-mcp and pivotkit-cli at the
versions of one release, on a distroless Node 22 image (no shell, no package manager), as the user
10001.

| Tag | What it is |
| --- | --- |
| `<version>`, e.g. the release `pivotkit-server@0.1.0` as `0.1.0` | That release, unchanged |
| `<major>.<minor>` | The latest release of that minor version |
| `latest` | The image of the pivotkit-server release published last: a new minor version too, or an older version when a patch of an older minor version comes out later; not for production |

To update a running container, see [Update an installation](../getting-started/upgrading.md#update-image).

Images are built for linux/amd64 and linux/arm64 from the release's commit, signed with cosign
(keyless) and carry a provenance and an SBOM attestation ([below](#verify)).

## Run it { #run }

The image runs `pivotkit-server serve --host 0.0.0.0` on port 3333 with the configuration file
`/config/pivotkit.json` ([REST](rest.md), [MCP](mcp.md#configuration): one file for both). On every
address of the container it serves only with sign-in: without a token of yours it makes the token
`admin` at its first start in the state directory `/var/lib/pivotkit`
([made at the first start](rest.md#first-start)). [Server in 5 minutes](../getting-started/server-in-5-minutes.md)
walks through it:

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

Without a configuration (nothing in `/config`) the image serves its built-in example:

- the source `example`, the command line's sales data;
- reports in `/var/lib/pivotkit/out`;
- files may be downloaded (`policy.results`), and callers may send data (`policy.data`).

A mounted `/data` is not readable by path then. The token `admin` holds every scope, so opening a
directory is a choice you make in a configuration: `"files": { "allowDirs": ["/data"] }`. A
`/config` that holds other files but no `pivotkit.json` (a typo such as `pivotkit.jsn`) is refused,
naming them.

| Path | What goes there |
| --- | --- |
| `/config/pivotkit.json` | The configuration (`$PIVOTKIT_CONFIG` names another) |
| `/data` | The data files, mounted read-only |
| `/var/lib/pivotkit` | The state directory (`$PIVOTKIT_STATE_DIR`): the token and keys made at the first start in `secrets/` (0700, each file 0600), and the reports in `out/` when `output.dir` names it. Mount a named volume there; it takes the image's owner (10001) and mode (0700) when it is new. The image declares no `VOLUME`: without a volume the server starts but warns that the token and keys are lost with the container, and with `--read-only` it does not start, since it cannot make the token. One container per volume, or several on one shared volume (they end with one token) |
| `/out` | An output directory for a configuration that names it, writable by the user 10001 (a named volume is; a host folder needs `chown 10001:10001`, and Docker makes a missing one as root, so make it yourself first; `check-config` and the start say so when it is not writable). A directory below it in `output.dir` is made at start, with mode 0700 (0755 narrowed by the umask when `output.baseUrl` is set): only the user 10001 reads it, so a second reader (a web server, a backup) needs `output.baseUrl` or a directory you make yourself. The server's own [download links](delivery.md) keep which one-time links were used in `.pivotkit-downloads/` there |
| `/run/secrets/` | Token files of your own, readable by the user 10001 ([managed secrets](#managed-secrets)) |
| `/tmp` | A tmpfs: the root file system stays read-only |

Set the port with `PIVOTKIT_PORT`, not `http.port` in the file: the health check asks
`$PIVOTKIT_PORT`. A token file is read on every request, so a new token works without a restart:
`docker exec pivotkit pivotkit-server token new --file /var/lib/pivotkit/secrets/admin.token --force`.

[docker/compose.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.example.yml)
and [docker/pivotkit.example.json](https://github.com/eizedev/pivotkit/blob/main/docker/pivotkit.example.json)
are this setup for Docker Compose (`docker compose exec pivotkit pivotkit-server token show admin`).

### Managed secrets { #managed-secrets }

Tokens of your own, for example several with a profile each, go into `auth.tokens`; the server then
makes no `admin`. Keep them in files (secrets), not in environment variables: `docker inspect` shows a
container's environment. The image makes the values, so you need no other tool:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/secrets:/out" ghcr.io/eizedev/pivotkit:<version> token new --file /out/pivotkit_token
```

In PowerShell, mount `"${PWD}/secrets:/out"` and leave `--user` out. The image then writes as its user 10001. Whether it may write the folder depends on Docker Desktop's file sharing: check afterwards that the file is there and that you can read it.

(With Node, `npx -y pivotkit-server token new --file secrets/pivotkit_token`.) `token new --file`
writes mode 0600 for your own user ([tokens and keys](rest.md#credentials)); output saved with `>`
instead gets the mode your umask gives (often 0644, readable by everyone): run `umask 077` first if
you do that. A secret file is mounted with
its owner and mode from the host, so it must be readable by the user 10001: owned by 10001 with
`chmod 0400` (`sudo chown 10001 secrets/*`) keeps it from the host's other users; `chmod 0644` is the
way without root; `check-config` and the start say so when it is not.
[docker/compose.secrets.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.secrets.example.yml)
and [docker/pivotkit.secrets.example.json](https://github.com/eizedev/pivotkit/blob/main/docker/pivotkit.secrets.example.json)
are an example with two tokens as secrets, one with a profile that may download files; the key of
the download links is still made in the state volume.

The image sets `PIVOTKIT_LOG_FORMAT=json`: the log is JSON lines on stderr, also under `docker run -t`
(a configuration's `log.format` still wins). Each answer carries `X-Request-Id`, the id on its log
lines. [Operations and logs](operations.md) lists the fields and shows the `gelf` and `syslog` log
drivers; the Compose example keeps the log with the `local` driver, bounded in size.

## Commands { #commands }

The image's entry point is `pivotkit-server`; the command after the image name is its subcommand:

```bash
docker run --rm ghcr.io/eizedev/pivotkit:<version> --help
docker run --rm ghcr.io/eizedev/pivotkit:<version> token new   # a token on stdout (key new --for downloads: the download key)
docker exec pivotkit pivotkit-server token show admin   # a token's value as the running server reads it (kubectl exec deploy/pivotkit -- the same)
docker exec pivotkit pivotkit-server token show token   # the one of $PIVOTKIT_TOKEN, or of $PIVOTKIT_MCP_TOKEN where only that is set (pivotkit-server mcp)
docker run --rm -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" -v "$PWD/data:/data:ro" -v pivotkit:/var/lib/pivotkit ghcr.io/eizedev/pivotkit:<version> check-config --host 0.0.0.0   # the mounts of the example above
docker run --rm --read-only -v "$PWD:/work" -w /work ghcr.io/eizedev/pivotkit:<version> cli render view.json --data sales.csv -o report.xlsx
docker run --rm -i -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" -v "$PWD/data:/data:ro" ghcr.io/eizedev/pivotkit:<version> mcp
```

`pivotkit-server` is on the image's `PATH`, so `docker exec` and `kubectl exec` run it by name. `mcp`
runs the MCP server over stdio (for a client that starts the container itself), reading
`/config/pivotkit.json` too; over stdio nothing is made in the state directory. `cli` writes where you mount a writable folder. `serve --enable rest`
serves REST only; the MCP endpoint is on by default.

Give `check-config` the flags you give `serve`: `--host 0.0.0.0` as the image's own `serve` has,
and `--enable` where you set it. Without them it checks a server on loopback with REST and MCP.
Under `Credentials` it says whether the token and keys are there, will be made at the first start,
or cannot be (a read-only state directory), and makes nothing.

## Health { #health }

The image has a `HEALTHCHECK` (`pivotkit-server healthcheck`, every 30 seconds): it asks
`/healthz`, which answers while the process runs. `/readyz` answers 200 only when the server can take
work (the OAuth issuer loaded, the workers up, the output directory writable) and 503 otherwise; use it as a
readiness probe. On `docker stop` (SIGTERM) the server takes no new connection and lets running
reports finish for up to 25 seconds (`http.graceMs`); give the container more than that
(`--stop-timeout 30`, `stop_grace_period: 30s`).

## Behind a proxy, with OAuth { #oauth }

Set `http.publicUrl` to the address clients use and keep the proxy's `Host` header (or add its name
to `http.allowHosts`); the server answers no other host name. With a proxy or a published port in
front, every client comes from one address: set `http.trustProxy` with a proxy that writes
`X-Forwarded-For` ([the nginx example](rest.md#running)), so the limit on refused tokens counts per
client; the proxy then guards the connections (timeouts, limits per client), and the container's
port should be reachable from the proxy only. Leave `http.maxConnectionsPerAddress` off there: every
client has the proxy's address. With OAuth the MCP endpoint and the
REST service are two resources with their own audiences:

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
service (an audience mapper in Keycloak, the application ID URI in Entra ID; see
[MCP: OAuth](mcp.md#oauth) for provider examples), and the image must reach the issuer over HTTPS.
Until it has loaded the issuer's keys, `/readyz` is 503. It tries again after 2, 4, 8 seconds and so
on, at most every minute, so after a long outage of the issuer it can take up to a minute to be
ready again.

The proxy also routes `/downloads/` to the container: reports come back as
[download links](delivery.md) there. The link key is made at the first start in the state volume, so
links survive a restart; more than one container needs one shared state volume (or one container),
or a key of your own as a secret file
(`"output": { "downloads": { "key": { "file": "/run/secrets/download-key" } } }`) and one shared output directory. For
sign-in links, add a browser client at the provider with the redirect URI
`https://reports.example.com/downloads/callback` and `"signIn": { "clientId": "..." }` there.

## Kubernetes { #kubernetes }

[Kubernetes](../getting-started/kubernetes.md) has a complete example manifest and explains it: the
pod's security settings, probes with `Host: localhost`, getting data files into `/data`, memory per
worker, Service, Ingress, NetworkPolicy and sign-in with an identity provider.

## Check the image { #verify }

Each release's image is signed by this repository's image workflow with cosign's keyless signing.
Check the signature, then the attestations (with cosign 3 and Docker's buildx; check the options
against their current documentation):

```bash
cosign verify ghcr.io/eizedev/pivotkit:<version> \
  --certificate-identity-regexp '^https://github\.com/eizedev/pivotkit/\.github/workflows/image\.yml@refs/tags/pivotkit-server@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
docker buildx imagetools inspect ghcr.io/eizedev/pivotkit:<version> --format '{{ json .Provenance }}'
docker buildx imagetools inspect ghcr.io/eizedev/pivotkit:<version> --format '{{ json .SBOM }}'
```

The image is built from the release's commit with `npm ci --omit=dev --ignore-scripts` from the
repository's lock file, on base images pinned by digest
([docker/Dockerfile](https://github.com/eizedev/pivotkit/blob/main/docker/Dockerfile)).

## Without containers { #windows }

The same service runs from npm: `npm install --global pivotkit-server pivotkit-mcp`, then
`pivotkit-server serve --config pivotkit.json`, for example as a Windows service next to PowerShell
Universal. See [Running it](rest.md#running).
