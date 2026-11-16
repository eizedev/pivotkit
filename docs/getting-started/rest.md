---
title: "Getting started: REST service"
description: Run pivotkit-server over a CSV file, call it with curl and PowerShell, validate and render a view, get a download link, then add tokens and a profile.
---

# Getting started: REST service

In ten minutes you run the REST service over a CSV file on your machine, call it with curl or
PowerShell, check a view, render it into an Excel file and download it. You need Node 22 or later.
Without Node, [Server in 5 minutes](server-in-5-minutes.md) starts the container image with one
command and a token it makes itself; [Container image](../reference/container.md) has the details.

## 1. Install and start it { #start }

Make a folder with the example data of the [command line](../reference/cli.md):

```bash
mkdir pivotkit-rest && cd pivotkit-rest
npx -y pivotkit-cli example
```

Start the service with one source, `sales`, on 127.0.0.1:3333 (no sign-in on loopback); it makes
the folder `reports` for what it writes:

```bash
npx -y pivotkit-server serve --source sales=sales.csv --output reports
```

The log says `started` with the address. Leave it running and open a second terminal in the same
folder. For another port, add `--port 8080`, set the environment variable `PIVOTKIT_PORT`, or write
`http.port` in a configuration file (the flag wins over the file, the file over the variable), and
use that port in the calls below. `npx -y` takes the newest release at each start; for a service others use, install a version
you name and update it as in [Update an installation](upgrading.md#update).

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

Each field has a `level`. By default every field is `summary`: you get its name, type and counts, not
its values. At `values` you get every value as a complete list, at `show` values and results. The
operator decides per field ([step 6](#policy)).

## 3. Check a view { #validate }

A view is the report's layout as JSON ([View file format](../reference/view-file.md)). Send one with
a misspelt field:

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

The answer says `"valid": false` and a finding with `"suggestion": "Region"`: the name meant.

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

The answer names the file (`output.filename`, here `sales.xlsx`); it is in the `reports` folder as
`sales.pivotkit-out.xlsx`. Its `message` says "The report is saved on the server; ask the operator
how to open it.": a program does not get the server's path; it takes the file itself through the
file route ([step 6](#policy)), and a person a [download link](#download-link). Check
`ok` in a script: a view with errors also answers 200, with `ok: false`, its `findings` and no file.
The answer also says `withheld`: Region and Revenue are `summary` fields, so the numbers stay in the
file and are not part of the answer.

## 5. A download link { #download-link }

A report over a source whose fields are all shown gets a link a person opens in the browser. Stop
the service (Ctrl+C), write a configuration file `pivotkit.json` that shows every field of `sales`,
and start it again:

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

`check-config` warns that `output.downloads.key` is not set: without it the server makes a new key
at each start, so links stop working on a restart. That is fine here; for a service others use, set
the key ([download links](../reference/delivery.md#configuration)). Render the same view again
([step 4](#render)); the answer's `output` now holds the link (the token is shortened here):

```json
"output": { "name": "LBYgghNzgES9CtH50Kz7nQ-Sales.pivotkit-out.xlsx", "filename": "Sales.xlsx",
  "url": "http://127.0.0.1:3333/downloads/eyJ2IjoxLC...qjt4hRZV3X", "expiresAt": "2026-11-16T01:19:54Z",
  "bound": "none", "note": "Open the link in your browser; it works for 60 minutes.", "format": "xlsx", ... }
```

`url` works until `expiresAt` for anyone who has it (`bound: "none"`). A report over a source with a
field that is not shown gets no link, or one bound to the person's sign-in or used once, as the
operator sets it: [Download links](../reference/delivery.md) has the rules, sign-in links and an
upload to your own store instead.

## 6. Tokens, a profile and downloads { #policy }

Stop the service (Ctrl+C) and write `pivotkit.json` again: Region is shown, two tokens, one of them
with a profile that may download files.

```json
{
  "sources": { "sales": { "file": "sales.csv", "title": "Sales", "policy": { "fields": { "Region": "show" } } } },
  "output": { "dir": "reports" },
  "policy": { "profiles": { "export": { "results": true } } },
  "auth": { "mode": "token", "tokens": [
    { "name": "scripts", "env": "SCRIPTS_TOKEN" },
    { "name": "export", "env": "EXPORT_TOKEN", "profile": "export" } ] }
}
```

Make two tokens and start it again:

=== "bash"

    ```bash
    export SCRIPTS_TOKEN="$(npx -y pivotkit-server token new)"
    export EXPORT_TOKEN="$(npx -y pivotkit-server token new)"
    npx -y pivotkit-server check-config --config pivotkit.json
    npx -y pivotkit-server serve --config pivotkit.json
    ```

=== "PowerShell"

    ```powershell
    $env:SCRIPTS_TOKEN = npx -y pivotkit-server token new
    $env:EXPORT_TOKEN = npx -y pivotkit-server token new
    npx -y pivotkit-server check-config --config pivotkit.json
    npx -y pivotkit-server serve --config pivotkit.json
    ```

`check-config` prints what the service exposes. In the second terminal (with the same two variables
set), a call without a token is now 401, and only the export token may download the file:

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

    The command line runs on the server's source instead of a file ([With a server](../reference/cli.md#with-a-server)).

A program that has the data itself can send it with the request, as JSON or a file, when its profile
has `data: true` ([Data in the request](../reference/rest.md#data)):

```bash
curl -s -o revenue.xlsx -H "Authorization: Bearer $ETL_TOKEN" -F data=@sales.csv \
  -F 'input={"view":{"rows":["Region"],"values":[{"field":"Revenue","agg":"sum"}]}}' http://127.0.0.1:3333/api/v1/views/render/file
```

An error is a problem document with a stable `code` and a `detail` that says what to do; with
PowerShell 7, `Invoke-RestMethod` throws and the document is in `$_.ErrorDetails.Message`.

## From PowerShell Universal { #powershell }

In a PSU script or endpoint, keep the token in a secret (here `$Secret:PivotkitToken`) and pass the
view a user built:

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
- [Container image](../reference/container.md): the same service in Docker; [Kubernetes](kubernetes.md): with the MCP server, an Ingress and sign-in.
- [Update an installation](upgrading.md#update): a new release of the service, the image or the CLI.
- The command line against this service: [pivotkit-cli with a server](../reference/cli.md#with-a-server).
- [Getting started: MCP server](mcp.md): the same sources for an AI client.
- [What reaches an AI model](../model-data.md): what a program and a model see at each level, and
  a profile per client.
