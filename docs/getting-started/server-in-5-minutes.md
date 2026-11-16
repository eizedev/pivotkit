---
title: Server in 5 minutes
description: Start the pivotkit container with one command, read the token it made at its first start, call the REST service with curl or PowerShell, add it to an MCP client, then point it at your own data.
---

# Server in 5 minutes

One `docker run` starts the REST service and the MCP server with example data. At its first start
the server makes a token of its own and keeps it in a volume; you read it with one command. You need
Docker (or Podman) and curl or PowerShell, nothing else.

## 1. Start it { #start }

```bash
docker run -d --name pivotkit -p 127.0.0.1:3333:3333 -v pivotkit:/var/lib/pivotkit ghcr.io/eizedev/pivotkit:0.2.0
```

The volume `pivotkit` keeps what the server makes: the token `admin`, the key of the download links
and the reports. Without a configuration the server serves its built-in example, the source
`example` (2000 rows of sales).

## 2. Get the token { #token }

=== "bash"

    ```bash
    TOKEN=$(docker exec pivotkit pivotkit-server token show admin)
    ```

=== "PowerShell"

    ```powershell
    $token = docker exec pivotkit pivotkit-server token show admin
    ```

The log names the same command (`docker logs pivotkit`), never the token itself. Every request
without it gets 401.

## 3. Call it with curl { #curl }

```bash
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3333/api/v1/sources
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"example","view":{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]},"format":"csv"}' \
  -o revenue.csv http://127.0.0.1:3333/api/v1/views/render/file
```

`revenue.csv` holds the revenue per region. The [REST reference](../reference/rest.md) has every
route; `format` takes `xlsx`, `json`, `svg` and `html` too.

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

Ask it "Which sources do you have?", then "Revenue per region of example as an Excel file".
[Getting started: MCP server](mcp.md) shows what the model may see and how to choose it.

## 6. Your own data { #own-data }

Put your files in a folder `data` and name them in a `pivotkit.json` beside it:

```json
{
  "sources": { "sales": { "file": "/data/sales.csv", "title": "Sales" } },
  "output": { "dir": "/var/lib/pivotkit/out" }
}
```

Start the container again with both mounted (the same volume keeps the token):

```bash
docker rm -f pivotkit
docker run -d --name pivotkit -p 127.0.0.1:3333:3333 -v pivotkit:/var/lib/pivotkit \
  -v "$PWD/data:/data:ro" -v "$PWD/pivotkit.json:/config/pivotkit.json:ro" ghcr.io/eizedev/pivotkit:0.2.0
```

The files must be readable by the user 10001 the image runs as (`chmod 0644`). By default each
field shows its name, type and counts, not its values: `"policy": { "fields": { "Region": "show" } }`
in a source shows more ([Getting started: REST service](rest.md#policy)), and
`"policy": { "results": true }` lets callers download rendered files as above.
[docker/compose.example.yml](https://github.com/eizedev/pivotkit/blob/main/docker/compose.example.yml)
is the same setup for Docker Compose (`docker compose exec pivotkit pivotkit-server token show admin`).

## What to know { #know }

- **Keep the volume.** `/var/lib/pivotkit` holds the token, the key of the download links and the
  reports. Without a volume there the server still starts, warns that they are lost when the
  container is removed, and makes new ones next time; with `--read-only` and no volume it does not
  start. Back the volume up like any other ([Operations](../reference/operations.md#state)).
- **A new token.** `docker exec pivotkit pivotkit-server token new --file /var/lib/pivotkit/secrets/admin.token --force`
  replaces it; the server reads the file on every request, so the old token gets 401 at once and no
  restart is needed.
- **Other machines.** Publish the port on an address they reach (`-p 3333:3333`) and name the host
  name they use, in the file (`"http": { "allowHosts": ["reports.example.com"] }`) or as a command
  after the image name, which replaces the image's own `serve --host 0.0.0.0`:
  `ghcr.io/eizedev/pivotkit:0.2.0 serve --host 0.0.0.0 --allow-host reports.example.com`. The server
  answers no other host name. Behind a proxy with HTTPS, set `--public-url https://reports.example.com/`
  (`http.publicUrl`): download links point there.
- **Tokens of your own, Kubernetes.** For tokens you manage as secrets, see
  [Container image: managed secrets](../reference/container.md#managed-secrets); for a cluster,
  [Kubernetes](kubernetes.md). The defaults apply only where nothing is configured: a token in
  `auth.tokens` or `$PIVOTKIT_TOKEN` is used instead of `admin`.
