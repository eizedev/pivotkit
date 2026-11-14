---
title: Container image
description: The pivotkit container image - the REST service, the MCP server and the command line in one distroless Node 22 image; running it read-only and non-root, configuration, secrets, volumes, health checks, OAuth, Kubernetes, and checking its signature, provenance and SBOM.
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

Images are built for linux/amd64 and linux/arm64 from the release's commit, signed with cosign
(keyless) and carry a provenance and an SBOM attestation ([below](#verify)).

## Run it { #run }

The image runs `pivotkit-server serve --host 0.0.0.0` on port 3333 with the configuration file
`/config/pivotkit.json` ([REST](rest.md), [MCP](mcp.md#configuration): one file for both). On every
address of the container it starts only with sign-in (`auth.mode` `token` or `oauth`). A minimal
configuration (paths are inside the container):

```json
{
  "sources": { "sales": { "file": "/data/sales.csv", "title": "Sales", "policy": { "fields": { "Region": "show", "Customer": "hide" } } } },
  "output": { "dir": "/out", "maxAgeDays": 7 },
  "auth": { "mode": "token", "tokens": [ { "name": "reports", "file": "/run/secrets/pivotkit_token" } ] }
}
```

```bash
docker run -d --name pivotkit \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  -p 127.0.0.1:3333:3333 \
  -v "$PWD/data:/data:ro" \
  -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" \
  -v "$PWD/secrets/pivotkit_token:/run/secrets/pivotkit_token:ro" \
  -v pivotkit-out:/out \
  ghcr.io/eizedev/pivotkit:<version>
```

| Path | What goes there |
| --- | --- |
| `/config/pivotkit.json` | The configuration (`$PIVOTKIT_CONFIG` names another) |
| `/data` | The data files, mounted read-only |
| `/out` | The output directory, writable by the user 10001 (a named volume is; a host folder needs `chown 10001:10001`) |
| `/run/secrets/` | Token files, readable by the user 10001 |
| `/tmp` | A tmpfs: the root file system stays read-only |

Keep tokens in files (secrets), not in environment variables: `docker inspect` shows a container's
environment. A token file is read on every request, so a new token works without a restart.

[docker/compose.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.example.yml)
and [docker/pivotkit.example.json](https://github.com/eizedev/pivotkit/blob/main/docker/pivotkit.example.json)
are an example for Docker Compose with these settings: two tokens as secrets, one with a profile that
may download files.

## Commands { #commands }

The image's entry point is `pivotkit-server`; the command after the image name is its subcommand:

```bash
docker run --rm ghcr.io/eizedev/pivotkit:<version> --help
docker run --rm ghcr.io/eizedev/pivotkit:<version> check-config          # with the configuration mounted
docker run --rm --read-only -v "$PWD:/work" -w /work ghcr.io/eizedev/pivotkit:<version> cli render view.json --data sales.csv -o report.xlsx
docker run --rm -i -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" -v "$PWD/data:/data:ro" ghcr.io/eizedev/pivotkit:<version> mcp
```

`mcp` runs the MCP server over stdio (for a client that starts the container itself), reading
`/config/pivotkit.json` too. `cli` writes where you mount a writable folder. `serve --enable rest`
serves REST only; the MCP endpoint is on by default.

## Health { #health }

The image has a `HEALTHCHECK` (`pivotkit-server healthcheck`, every 30 seconds): it asks
`/healthz`, which answers while the process runs. `/readyz` answers 200 only when the server can take
work (the OAuth issuer loaded, the workers up, `/out` writable) and 503 otherwise; use it as a
readiness probe. On `docker stop` (SIGTERM) the server takes no new connection and lets running
reports finish for up to 25 seconds (`http.graceMs`); give the container more than that
(`--stop-timeout 30`, `stop_grace_period: 30s`).

## Behind a proxy, with OAuth { #oauth }

Set `http.publicUrl` to the address clients use and keep the proxy's `Host` header (or add its name
to `http.allowHosts`); the server answers no other host name. With OAuth the MCP endpoint and the
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
Until it has loaded the issuer's keys, `/readyz` is 503.

## Kubernetes { #kubernetes }

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  runAsGroup: 10001
  fsGroup: 10001
containers:
  - name: pivotkit
    image: ghcr.io/eizedev/pivotkit:<version>
    ports: [{ containerPort: 3333 }]
    securityContext: { readOnlyRootFilesystem: true, allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } }
    readinessProbe: { httpGet: { path: /readyz, port: 3333, httpHeaders: [{ name: Host, value: localhost }] } }
    livenessProbe: { httpGet: { path: /healthz, port: 3333, httpHeaders: [{ name: Host, value: localhost }] } }
    volumeMounts:
      - { name: config, mountPath: /config, readOnly: true }
      - { name: data, mountPath: /data, readOnly: true }
      - { name: out, mountPath: /out }
      - { name: tokens, mountPath: /run/secrets, readOnly: true }
      - { name: tmp, mountPath: /tmp }
terminationGracePeriodSeconds: 30
```

A probe sends the pod's IP as its `Host` by default, which the server refuses: send `localhost` as
above. The limits of the REST service are counted per process: with more than one replica each counts
on its own.

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
