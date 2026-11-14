---
title: "Getting started: REST service"
description: Run pivotkit-server over a CSV file, call it with curl and PowerShell, validate and render a view, download the report, then add tokens and a profile.
---

# Getting started: REST service

In ten minutes you run the REST service over a CSV file on your machine, call it with curl or
PowerShell, check a view, render it into an Excel file and download it. You need Node 22 or later;
for the container image, see [Container image](../reference/container.md).

## 1. Install and start it { #start }

Make a folder with the example data of the [command line](../reference/cli.md) and an output folder:

```bash
mkdir pivotkit-rest && cd pivotkit-rest
npx -y pivotkit-cli example
mkdir reports
```

Start the service with one source, `sales`, on 127.0.0.1:3333 (no sign-in on loopback):

```bash
npx -y pivotkit-server serve --source sales=sales.csv --output reports
```

The log says `started` with the address. Leave it running and open a second terminal in the same
folder.

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

Each field has a `level`. By default every field is `summary`: you get its name, type and counts, not
its values. The operator decides more per field ([step 5](#policy)).

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

The answer's `message` says where the file is. Check `ok` in a script: a view with errors also
answers 200, with `ok: false`, its `findings` and no file. The answer also says `withheld`: Region
and Revenue are `summary` fields, so the numbers stay in the file and are not part of the answer.

## 5. Tokens, a profile and downloads { #policy }

Stop the service (Ctrl+C) and write a configuration file `pivotkit.json`: Region is shown, two
tokens, one of them with a profile that may download files.

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
    export SCRIPTS_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
    export EXPORT_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
    npx -y pivotkit-server check-config --config pivotkit.json
    npx -y pivotkit-server serve --config pivotkit.json
    ```

=== "PowerShell"

    ```powershell
    $env:SCRIPTS_TOKEN = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
    $env:EXPORT_TOKEN = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
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
- [Container image](../reference/container.md): the same service in Docker or Kubernetes.
- [Getting started: MCP server](mcp.md): the same sources for an AI client.
