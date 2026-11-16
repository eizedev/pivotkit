---
title: "Getting started: REST service"
description: Run pivotkit-server over a CSV file, call it with curl and PowerShell, validate and render a view, get a download link, then add tokens and a profile.
---

# Getting started: REST service

In ten minutes you do the following:

- run the REST service over a CSV file on your machine
- call it with curl or PowerShell
- check a view
- render it into an Excel file and download it

You need Node 22 or later. Without Node, use [Server in 5 minutes](server-in-5-minutes.md). It starts
the container image with one command, and the server makes a token itself.
[Container image](../reference/container.md) has the details.

## 1. Install and start it { #start }

Make a folder with the example data of the [command line](../reference/cli.md):

```bash
mkdir pivotkit-rest && cd pivotkit-rest
npx -y pivotkit-cli example
```

Start the service with one source, `sales`, on 127.0.0.1:3333. On loopback it needs no sign-in. It
makes the folder `reports` for what it writes:

```bash
npx -y pivotkit-server serve --source sales=sales.csv --output reports
```

The log says `started` with the address. Leave it running and open a second terminal in the same
folder. If your shell sets `PIVOTKIT_TOKEN`, the start warns, since you did not set `auth.mode`.
[Step 6](#policy) sets up tokens.

For another port, use one of these and use that port in the calls below:

- the flag `--port 8080`
- the environment variable `PIVOTKIT_PORT`
- `http.port` in a configuration file

The flag wins over the file, and the file wins over the variable.

`npx -y` takes the newest release at each start. For a service others use, install a version you
name. Update it as [Update an installation](upgrading.md#update) describes.

## 2. Look at the data { #describe }

=== "curl"

    ```bash
    curl -s http://127.0.0.1:3333/api/v1/sources
    curl -s http://127.0.0.1:3333/api/v1/sources/sales
    ```

=== "PowerShell"

    ```powershell
    $api = "http://127.0.0.1:3333/api/v1"
    Invoke-RestMethod "$api/sources"
    (Invoke-RestMethod "$api/sources/sales").fields | Format-Table name, type, level, distinct
    ```

=== "pivotkit"

    ```bash
    npx -y pivotkit-cli sources --url http://127.0.0.1:3333/api/v1
    npx -y pivotkit-cli sources sales --url http://127.0.0.1:3333/api/v1
    ```

Each field has a `level`:

- `summary`, the default: you get the field's name, type and counts, but not its values.
- `values`: you also get every value as a complete list.
- `show`: you get values and results.

The operator sets the level per field, as [step 6](#policy) shows.

## 3. Check a view { #validate }

A view is the report's layout as JSON. [View file format](../reference/view-file.md) describes it.
Send a view with a misspelt field:

=== "curl"

    ```bash
    curl -s -H "Content-Type: application/json" \
      -d '{"source":"sales","view":{"rows":["Regoin"],"values":[{"field":"Revenue","agg":"sum"}]}}' \
      http://127.0.0.1:3333/api/v1/views/validate
    ```

=== "PowerShell"

    ```powershell
    $body = @{ source = "sales"; view = @{ rows = @("Regoin"); values = @(@{ field = "Revenue"; agg = "sum" }) } } | ConvertTo-Json -Depth 10
    (Invoke-RestMethod "$api/views/validate" -Method Post -ContentType "application/json" -Body $body).findings
    ```

The answer says `"valid": false`. Its finding has `"suggestion": "Region"`, the name you meant.

## 4. Render it { #render }

With the name fixed, render the report into the output folder:

=== "curl"

    ```bash
    curl -s -H "Content-Type: application/json" \
      -d '{"source":"sales","view":{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]},"format":"xlsx"}' \
      http://127.0.0.1:3333/api/v1/views/render
    ls reports
    ```

=== "PowerShell"

    ```powershell
    $body = @{ source = "sales"; view = @{ rows = @("Region"); values = @(@{ field = "Revenue"; agg = "sum" }) }; format = "xlsx" } | ConvertTo-Json -Depth 10
    (Invoke-RestMethod "$api/views/render" -Method Post -ContentType "application/json" -Body $body).message
    Get-ChildItem reports
    ```

The answer names the file in `output.filename`, here `sales.xlsx`. The file is in the `reports`
folder as `sales.pivotkit-out.xlsx`. The answer's `message` says "The report is saved on the server;
ask the operator how to open it."

You get this answer with the default policy. A program does not get the server's path, and a source
with fields that are not shown gets no link. The next steps get you the report:

- A person takes a [download link](#download-link) (step 5).
- A program takes the file itself through the file route ([step 6](#policy)).

In a script, check `ok`. A view with errors also answers 200. That answer has `ok: false`, its
`findings` and no file.

The answer also says `withheld`. Region and Revenue are `summary` fields, so the numbers stay in the
file. The answer does not include them.

## 5. A download link { #download-link }

When every field of a source is shown, a report over it gets a link. A person opens the link in the
browser. Stop the service with Ctrl+C. Write a configuration file `pivotkit.json` that shows every
field of `sales`. Then start the service again:

```json
{
  "sources": { "sales": { "file": "sales.csv", "title": "Sales", "policy": { "default": "show" } } },
  "output": { "dir": "reports" }
}
```

```bash
npx -y pivotkit-server check-config --config pivotkit.json
npx -y pivotkit-server serve --config pivotkit.json
```

`check-config` warns that `output.downloads.key` is not set. Without the key, the server makes a
new key at each start, so links stop working after a restart. That is fine here. For a service
others use, set the key. See [download links](../reference/delivery.md#configuration).

Render the same view again, as in [step 4](#render). This time the answer's `output` holds the link.
The token in it is shortened here:

```json
"output": { "name": "LBYgghNzgES9CtH50Kz7nQ-Sales.pivotkit-out.xlsx", "filename": "Sales.xlsx",
  "url": "http://127.0.0.1:3333/downloads/eyJ2IjoxLC...qjt4hRZV3X", "expiresAt": "2026-11-16T01:19:54Z",
  "bound": "none", "note": "Open the link in your browser; it works for 60 minutes.", "format": "xlsx", ... }
```

`url` works until `expiresAt` for anyone who has it. `bound: "none"` says so.

A source can have a field that is not shown. A report over that source gets one of these, as the
operator sets it:

- no link
- a link bound to the person's sign-in
- a link that works once

[Download links](../reference/delivery.md) has the rules and sign-in links. It also describes an
upload to your own store instead of a link.

## 6. Tokens, a profile and downloads { #policy }

Stop the service with Ctrl+C. Write `pivotkit.json` again. This time Region is shown, and a profile
may download files.

```json
{
  "sources": { "sales": { "file": "sales.csv", "title": "Sales", "policy": { "fields": { "Region": "show" } } } },
  "output": { "dir": "reports" },
  "policy": { "profiles": { "export": { "results": true } } }
}
```

Make two tokens with the command below, each in a file only you can read. It adds them to
`auth.tokens`, keeps the old file as a backup and sets `auth.mode` to `token`. Then start the
service again:

=== "bash"

    ```bash
    mkdir -p secrets
    npx -y pivotkit-server token new --file secrets/scripts.token --config pivotkit.json --add --name scripts
    npx -y pivotkit-server token new --file secrets/export.token --config pivotkit.json --add --name export --profile export
    npx -y pivotkit-server check-config --config pivotkit.json
    npx -y pivotkit-server serve --config pivotkit.json
    ```

=== "PowerShell"

    ```powershell
    New-Item -ItemType Directory -Force secrets | Out-Null
    npx -y pivotkit-server token new --file secrets/scripts.token --config pivotkit.json --add --name scripts
    npx -y pivotkit-server token new --file secrets/export.token --config pivotkit.json --add --name export --profile export
    npx -y pivotkit-server check-config --config pivotkit.json
    npx -y pivotkit-server serve --config pivotkit.json
    ```

??? note "Tokens from environment variables instead"

    A token can also come from a variable. Write `{ "name": "scripts", "env": "SCRIPTS_TOKEN" }` in
    `auth.tokens`. Set the variable:

    - bash: `export SCRIPTS_TOKEN="$(npx -y pivotkit-server token new)"`
    - PowerShell: `$env:SCRIPTS_TOKEN = npx -y pivotkit-server token new`

    The server reads a file on every request, so you can rotate a file's token without a restart.
    You cannot do that with a variable.

In the second terminal, read the two tokens into variables:

=== "bash"

    ```bash
    SCRIPTS_TOKEN="$(cat secrets/scripts.token)"; EXPORT_TOKEN="$(cat secrets/export.token)"
    ```

=== "PowerShell"

    ```powershell
    $env:SCRIPTS_TOKEN = Get-Content secrets/scripts.token; $env:EXPORT_TOKEN = Get-Content secrets/export.token
    ```

`check-config` prints what the service exposes. A call without a token gets 401. Only the export
token may download the file:

=== "curl"

    ```bash
    curl -s -w ' %{http_code}\n' http://127.0.0.1:3333/api/v1/sources            # 401
    VIEW='{"source":"sales","view":{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]},"format":"xlsx"}'
    curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $SCRIPTS_TOKEN" -H "Content-Type: application/json" -d "$VIEW" \
      http://127.0.0.1:3333/api/v1/views/render/file               # 403 NOT_ALLOWED
    curl -s -o revenue.xlsx -H "Authorization: Bearer $EXPORT_TOKEN" -H "Content-Type: application/json" -d "$VIEW" \
      http://127.0.0.1:3333/api/v1/views/render/file
    ```

=== "PowerShell"

    ```powershell
    $view = @{ source = "sales"; view = @{ rows = @("Region"); values = @(@{ field = "Revenue"; agg = "sum" }) }; format = "xlsx" } | ConvertTo-Json -Depth 10
    $headers = @{ Authorization = "Bearer $env:EXPORT_TOKEN" }
    Invoke-RestMethod "$api/views/render/file" -Method Post -ContentType "application/json" -Body $view -Headers $headers -OutFile revenue.xlsx
    ```

=== "pivotkit"

    ```bash
    export PIVOTKIT_URL=http://127.0.0.1:3333/api/v1
    PIVOTKIT_TOKEN=$SCRIPTS_TOKEN npx -y pivotkit-cli validate sales.pivotkit.json --source sales
    PIVOTKIT_TOKEN=$SCRIPTS_TOKEN npx -y pivotkit-cli render sales.pivotkit.json --source sales -o revenue.xlsx   # exit 2, NOT_ALLOWED
    PIVOTKIT_TOKEN=$EXPORT_TOKEN npx -y pivotkit-cli render sales.pivotkit.json --source sales -o revenue.xlsx
    ```

    The command line runs on the server's source instead of a file. See [With a server](../reference/cli.md#with-a-server).

A program that has the data itself can send it with the request, as JSON or a file. Its profile
needs `data: true`. See [Data in the request](../reference/rest.md#data).

```bash
curl -s -o revenue.xlsx -H "Authorization: Bearer $ETL_TOKEN" -F data=@sales.csv \
  -F 'input={"view":{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]}}' http://127.0.0.1:3333/api/v1/views/render/file
```

An error is a problem document. It has a stable `code` and a `detail` that says what to do. With
PowerShell 7, `Invoke-RestMethod` throws, and the document is in `$_.ErrorDetails.Message`.

## From PowerShell Universal { #powershell }

In a PSU script or endpoint, keep the token in a secret, here `$Secret:PivotkitToken`. Pass the view
a user built:

```powershell
$api = "https://reports.example.com/api/v1"
$headers = @{ Authorization = "Bearer $Secret:PivotkitToken" }
$body = @{ source = "sales"; view = $View; format = "xlsx"; name = "Revenue by region" } | ConvertTo-Json -Depth 20
try {
    Invoke-RestMethod "$api/views/render/file" -Method Post -ContentType "application/json" -Body $body -Headers $headers -OutFile $Path
} catch {
    $problem = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Error "$($problem.code): $($problem.detail)"
}
```

## Next { #next }

- [pivotkit-server (REST)](../reference/rest.md): every route, profiles, sign-in with OAuth, CORS, limits, errors.
- The OpenAPI document of your service: `GET /openapi.json` with a token.
- [Container image](../reference/container.md): the same service in Docker.
- [Kubernetes](kubernetes.md): the service with the MCP server, an Ingress and sign-in.
- [Update an installation](upgrading.md#update): a new release of the service, the image or the CLI.
- The command line against this service: [pivotkit-cli with a server](../reference/cli.md#with-a-server).
- [Getting started: MCP server](mcp.md): the same sources for an AI client.
- [What reaches an AI model](../model-data.md): what a program and a model see at each level, and
  a profile per client.
