---
title: Server in 5 minutes
description: Start the pivotkit container with one command, read the token it made at its first start, call the REST service with curl or PowerShell, add it to an MCP client, then point it at your own data.
---

# Server in 5 minutes

One `docker run` starts the REST service and the MCP server with example data. At its first start
the server makes a token of its own. It keeps the token in a volume. You read it with one command.

You need only two things:

- Docker or Podman
- curl or PowerShell

## 1. Start it { #start }

```bash
docker run -d --name pivotkit -p 127.0.0.1:3333:3333 -v pivotkit:/var/lib/pivotkit ghcr.io/eizedev/pivotkit:0.2.0
```

The volume `pivotkit` keeps what the server makes: the token `admin`, the key of the download links
and the reports. Without a configuration, the server serves its built-in example: the source
`example`, 2000 rows of sales.

## 2. Get the token { #token }

=== "bash"

    ```bash
    TOKEN=$(docker exec pivotkit pivotkit-server token show admin)
    ```

=== "PowerShell"

    ```powershell
    $token = docker exec pivotkit pivotkit-server token show admin
    ```

The log also names this command. You see it with `docker logs pivotkit`. The log never shows the
token itself. Every request without the token gets 401.

## 3. Call it with curl { #curl }

```bash
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3333/api/v1/sources
curl -f -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"example","view":{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]},"format":"csv"}' \
  -o revenue.csv http://127.0.0.1:3333/api/v1/views/render/file
```

`revenue.csv` holds the revenue per region. With `-f`, curl fails on an error instead of writing it
into the file. `format` also takes `xlsx`, `json`, `svg` and `html`. The
[REST reference](../reference/rest.md) has every route.

## 4. The same in PowerShell { #powershell }

```powershell
$api = "http://127.0.0.1:3333/api/v1"
$auth = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Headers $auth "$api/sources"
$view = '{"source":"example","view":{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]},"format":"csv"}'
Invoke-RestMethod -Headers $auth -Method Post -ContentType "application/json" -Body $view -OutFile revenue.csv "$api/views/render/file"
```

## 5. Add it to an MCP client { #mcp }

The MCP endpoint is on the same port, at `/mcp`, with the same token. In Claude Code:

```bash
claude mcp add --transport http pivotkit http://127.0.0.1:3333/mcp --header "Authorization: Bearer $TOKEN"
```

Another client that speaks Streamable HTTP takes the address and the header, for example:

```json
{ "mcpServers": { "pivotkit": {
    "type": "http",
    "url": "http://127.0.0.1:3333/mcp",
    "headers": { "Authorization": "Bearer <token>" } } } }
```

Ask it: "Which sources do you have?" Then ask: "Revenue per region of example as an Excel file."
[Getting started: MCP server](mcp.md) shows what the model may see and how to choose it.

## 6. Your own data { #own-data }

Put your files in a folder `data`. Name them in a `pivotkit.json` beside it:

```json
{
  "sources": { "sales": { "file": "/data/sales.csv", "title": "Sales" } },
  "output": { "dir": "/var/lib/pivotkit/out" },
  "policy": { "results": true }
}
```

Start the container again with both mounted. The same volume keeps the token:

```bash
docker rm -f pivotkit
docker run -d --name pivotkit -p 127.0.0.1:3333:3333 -v pivotkit:/var/lib/pivotkit \
  -v "$PWD/data:/data:ro" -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" ghcr.io/eizedev/pivotkit:0.2.0
```

- The user 10001 runs the server. It must be able to read the files. `chmod 0644` gives it that.
- `"results": true` lets callers download rendered files, as in step 3.
- By default, each field shows its name, type and counts, but not its values.
  `"policy": { "fields": { "Region": "show" } }` in a source shows more. See
  [Getting started: REST service](rest.md#policy).
- The server reads only the files you name. A mounted `/data` alone is not readable by path:
  `"files": { "allowDirs": ["/data"] }` allows it, for every token.

### With Docker Compose { #compose }

The same setup as a Compose project. Download the two example files of this release:

=== "bash"

    ```bash
    mkdir pivotkit && cd pivotkit && mkdir data
    curl -fsSL -o compose.yml https://raw.githubusercontent.com/eizedev/pivotkit/pivotkit-server@0.2.0/docker/compose.example.yml
    curl -fsSL -o pivotkit.json https://raw.githubusercontent.com/eizedev/pivotkit/pivotkit-server@0.2.0/docker/pivotkit.example.json
    export PIVOTKIT_VERSION=0.2.0
    ```

=== "PowerShell"

    ```powershell
    mkdir pivotkit; cd pivotkit; mkdir data
    Invoke-WebRequest -OutFile compose.yml https://raw.githubusercontent.com/eizedev/pivotkit/pivotkit-server@0.2.0/docker/compose.example.yml
    Invoke-WebRequest -OutFile pivotkit.json https://raw.githubusercontent.com/eizedev/pivotkit/pivotkit-server@0.2.0/docker/pivotkit.example.json
    $env:PIVOTKIT_VERSION = "0.2.0"
    ```

Put your files into `data/`. Name them in `pivotkit.json`. Then start it and read the token:

```bash
docker compose up -d --wait
docker compose exec pivotkit pivotkit-server token show admin
```

Make `data/` and `pivotkit.json` before the first `up`. Docker makes a missing mount source as an
empty directory, owned by root. `pivotkit.json` would then be a directory, and the server does not
start. The files are
[compose.example.yml](https://github.com/eizedev/pivotkit/blob/pivotkit-server@0.2.0/docker/compose.example.yml)
and [pivotkit.example.json](https://github.com/eizedev/pivotkit/blob/pivotkit-server@0.2.0/docker/pivotkit.example.json).

## What to know { #know }

### Keep the volume { #volume }

- `/var/lib/pivotkit` holds the token, the key of the download links and the reports.
- Without a volume there, the server still starts. It warns that you lose them with the container.
- With `--read-only` and no volume, the server does not start.
- Back the volume up like any other. See [Operations](../reference/operations.md#state).

### A new token { #new-token }

```bash
docker exec pivotkit pivotkit-server token new --file /var/lib/pivotkit/secrets/admin.token --force
```

- The server reads the file on every request. You do not need to restart it.
- The old token gets 401 at once.

### Other machines { #other-machines }

- The token `admin` holds every scope. Anyone who reads it can use everything the server offers.
- Over plain HTTP the token crosses the network unencrypted. Use it from other machines only behind
  a proxy with HTTPS, or on a network you trust.
- Publish the port on an address they reach: `-p 3333:3333`.
- Name the host name they use: `"http": { "allowHosts": ["reports.example.com"] }`. The server
  answers no other host name.
- Behind the proxy, set `"http": { "publicUrl": "https://reports.example.com/" }`. Download links
  point there.

### Your own tokens, Kubernetes { #more }

- The server makes `admin` only when nothing else gives a token. If `auth.tokens` or
  `$PIVOTKIT_TOKEN` holds a token, the server uses that one instead.
- Tokens you manage as secrets: [Container image: managed secrets](../reference/container.md#managed-secrets).
- A cluster: [Kubernetes](kubernetes.md).
