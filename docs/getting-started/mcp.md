---
title: Getting started with the MCP server
description: Let an AI client (Claude Code, Claude Desktop, VS Code and others) build pivot reports over your data with pivotkit-mcp - local over stdio, for a team over HTTP with a token or OAuth, and inside PowerShell Universal.
---

# Getting started with the MCP server

`pivotkit-mcp` lets an AI client build pivot reports for you: "sales by region per quarter as Excel"
becomes a view, checked against your data and written into a file you open. The model sees the
fields of your data (by default names, types and counts, no values) and never reads the data itself.
See the [reference](../reference/mcp.md) for every tool and setting.

Node 22 or later. A client starts the server itself (stdio), or connects to one that runs (HTTP).

## 1. Your data and a folder for the reports

Put the data where the server may read it; the server makes the folder for what it writes
(`--output`) when it starts:

```bash
mkdir -p ~/reports
cd ~/reports && npx -y pivotkit-cli example   # optional: sample data (sales.csv) from the command line
```

Any CSV, TSV, JSON or Excel file works. Check what the server would expose before a client connects:

```bash
npx -y pivotkit-mcp --source sales=$HOME/reports/sales.csv --output ~/reports/out --check-config
```

## 2. Add it to your client

=== "Claude Code"

    ```bash
    claude mcp add pivotkit -- npx -y pivotkit-mcp --source sales=$HOME/reports/sales.csv --output $HOME/reports/out
    ```

=== "Claude Desktop"

    In `claude_desktop_config.json` (the app's settings open it):

    ```json
    { "mcpServers": { "pivotkit": {
        "command": "npx",
        "args": ["-y", "pivotkit-mcp", "--source", "sales=/Users/you/reports/sales.csv", "--output", "/Users/you/reports/out"] } } }
    ```

=== "VS Code"

    In `.vscode/mcp.json`:

    ```json
    { "servers": { "pivotkit": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "pivotkit-mcp", "--source", "sales=${workspaceFolder}/data/sales.csv", "--output", "${workspaceFolder}/reports"] } } }
    ```

=== "Other clients"

    ```json
    { "mcpServers": { "pivotkit": { "command": "npx", "args": ["-y", "pivotkit-mcp", "--config", "/path/to/pivotkit-mcp.json"] } } }
    ```

Use absolute paths: a client may start the server in another directory (a missing output
directory is made at start). VS Code also reads the newer `.mcp.json` with `mcpServers`, as
under "Other clients". Pin a version for a setup others rely on (`pivotkit-mcp@<version>`), and in
every shared configuration. Without one, `npx -y` runs the newest release at each start, code nobody
has looked at yet, unless pivotkit-mcp is installed globally or in the folder the client starts it in
(or a folder above it): then it runs that copy, whatever its version. `pivotkit-mcp@latest` is for a
setup of your own. See [Update an installation](upgrading.md#update-npx), also for restarting the
client after an update.

Then ask: "Which sources does pivotkit have?", "Make an Excel report of sales by region per quarter",
"Make a link to that report". The server answers with the file's place; when the report uses fields
whose values you did not let the model see, it says that it has not seen the content.

## 3. Choose what the model may see

By default every field is `summary`: name, type and counts. Mark fields whose values may reach the
model as `show` (the model can then answer questions about them and get small results inline), and
fields it must not know about as `hide` (dropped when the data is read). In a configuration file:

```json
{
  "sources": {
    "sales": {
      "file": "/Users/you/reports/sales.csv",
      "title": "Sales",
      "policy": { "fields": { "Region": "show", "Product": "show", "Discount": "hide" } }
    }
  },
  "output": { "dir": "/Users/you/reports/out" }
}
```

```bash
claude mcp add pivotkit -- npx -y pivotkit-mcp --config /Users/you/reports/pivotkit-mcp.json
```

To let the model open any data file in a folder by path ("file:q3.csv"), add
`--allow-dir /Users/you/reports` (and `--list-files` to have it listed). Every file in that folder
can then be read: put only data there that the model may use. [Exposure policy](../reference/mcp.md#policy).

## 4. For a team: HTTP

```bash
export PIVOTKIT_MCP_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
npx -y pivotkit-mcp --config pivotkit-mcp.json --http --auth token
```

The server listens on `http://127.0.0.1:3333/mcp`; open `http://127.0.0.1:3333/` in a browser for
the quick-start page with the configurations to copy. For other machines, put it behind a reverse
proxy with TLS and give `--public-url https://reports.example.com` (and `--host 0.0.0.0` or the
proxy's network). The reports are written on the server: for people on other machines, serve the
output directory (behind the same sign-in) and set `output.baseUrl`, so results carry a link
instead of a path on the server. Clients connect with:

```bash
claude mcp add --transport http pivotkit https://reports.example.com/mcp --header "Authorization: Bearer <token>"
```

For sign-in with your identity provider (Authentik, Keycloak, Microsoft Entra ID, any OAuth 2.1 /
OpenID Connect provider), see [OAuth](../reference/mcp.md#oauth); scopes then decide who sees which
source and may use which tool.

To serve programs too, run `pivotkit-server serve --config pivotkit-mcp.json --auth token` (with
`pivotkit-mcp` installed beside it) instead: the same `/mcp` endpoint and the
[REST service](rest.md) at `/api/v1` on one port, also as a [container image](../reference/container.md)
and [on Kubernetes](kubernetes.md).
Its one static token is `$PIVOTKIT_TOKEN`.

## PowerShell Universal { #psu }

PowerShell Universal runs scripts and apps but is no MCP client; its server can host pivotkit and
feed it data. Run `pivotkit-server serve` there with `pivotkit-mcp` installed beside it: one process
on one port offers the [REST service](rest.md) at `/api/v1` for PSU's scripts and apps and the MCP
endpoint at `/mcp` for AI clients, both behind the one token `$PIVOTKIT_TOKEN` (or the tokens of
`auth.tokens`). The steps below use `D:\pivotkit` with the folders `app`, `data`, `out`, `logs`
and `secrets`; any other place works the same.

### Install { #psu-install }

```powershell
cd D:\pivotkit\app
npm install pivotkit-server@<version> pivotkit-mcp@<version>
```

On a machine without internet, install from the packages' tarballs (`npm pack` on a machine with
it). To update, run the same command with the new versions and restart the service
([Update an installation](upgrading.md#update-project)). The configuration, `D:\pivotkit\pivotkit.json`:

```json
{
  "sources": { "sales": { "file": "data/sales.csv", "link": "https://psu.example.com/reports/sales" } },
  "output": { "dir": "out" },
  "auth": { "mode": "token", "tokens": [{ "name": "psu", "file": "secrets/psu-token" }] },
  "http": { "host": "127.0.0.1", "port": 3333, "publicUrl": "https://reports.example.com" }
}
```

Relative paths start at the configuration file's folder. `pivotkit-server check-config --config
D:\pivotkit\pivotkit.json` prints what the server would expose and says which file or folder is
missing.

### Data from a PSU script { #psu-data }

A scheduled script exports what a source shows into the data folder, written to a temporary name
first and then moved, so the server never reads half a file:

```powershell
$rows = Invoke-Sqlcmd -Query 'SELECT Region, Product, Sales, OrderDate FROM dbo.Sales'
$rows | Export-Csv -Path 'D:\pivotkit\data\sales.tmp' -NoTypeInformation -Encoding utf8
Move-Item -Path 'D:\pivotkit\data\sales.tmp' -Destination 'D:\pivotkit\data\sales.csv' -Force
```

A source's `"link"` is the page of a PSU app that shows the report with pivotkit; `create_link` then
makes links that open the view there, and the page loads the data with the rights of the person who
opens it.

### A service account and its file rights { #psu-account }

Run the server as an account of its own with no rights beyond its folders, never as PSU's account
or as LocalSystem: a local or domain account (here `pivotkit-svc`) that is no administrator (NSSM gives
it the right *Log on as a service*). What it needs:

| Folder | The server's account | PSU's account |
| --- | --- | --- |
| `app`, `pivotkit.json` | read | none (an administrator updates them) |
| `data` | read | modify (the export script writes there) |
| `secrets` | read | modify (the script that writes the token) |
| `out` | modify (reports, drafts, `output.maxAgeDays` deletes old ones) | read, if a script hands the files on |
| `logs` | modify (NSSM runs as this account and writes and renames the log) | modify (the schedule that deletes old logs), or read when an administrator deletes them |

For example:

```powershell
icacls D:\pivotkit\app D:\pivotkit\data D:\pivotkit\secrets /grant "pivotkit-svc:(OI)(CI)RX"
icacls D:\pivotkit\pivotkit.json /grant "pivotkit-svc:R"
icacls D:\pivotkit\out D:\pivotkit\logs /grant "pivotkit-svc:(OI)(CI)M"
icacls D:\pivotkit\data D:\pivotkit\logs /grant "<PSU's account>:(OI)(CI)M"
icacls D:\pivotkit\out /grant "<PSU's account>:(OI)(CI)RX"
```

`<PSU's account>` is the account the PSU service runs as. `secrets` holds only what the two
accounts and the administrators may read: remove the inherited rights, then grant them:

```powershell
icacls D:\pivotkit\secrets /inheritance:r
icacls D:\pivotkit\secrets /grant "Administrators:(OI)(CI)F" "pivotkit-svc:(OI)(CI)RX" "<PSU's account>:(OI)(CI)M"
```

The server refuses to start when the
output folder is the configuration's folder or holds a source, a print template or a token file.
Its checks of links and hard links are measured on Linux and macOS
([#209](https://github.com/eizedev/pivotkit/issues/209) tracks junctions and hard links on Windows).

### The token from a PSU secret { #psu-token }

The server reads a token file on every request, so a new token takes effect without a restart. A
PSU script writes the secret (here `PivotkitToken`, a string secret) into that file, at the start
and whenever the token is changed:

```powershell
Set-Content -Path 'D:\pivotkit\secrets\psu-token' -Value $Secret:PivotkitToken -NoNewline
```

PSU's scripts and apps send the same secret: `Authorization = "Bearer $Secret:PivotkitToken"`
([the calls in PowerShell](rest.md#powershell)). A secret with roles is not available to scheduled
jobs ([PSU's variables](https://docs.devolutions.net/powershell-universal/platform/variables)), so
the script that writes the file runs on a schedule only with a secret without roles. Without a
token file, `$PIVOTKIT_TOKEN` in the service's environment works too; a service manager keeps it in
its configuration (NSSM: in the service's registry key; check that key's rights before you put a
token there).

### A Windows service with a rotated log { #psu-service }

Any service manager that restarts a process works. With [NSSM](https://nssm.cc/usage), for example:

```powershell
nssm install pivotkit "C:\Program Files\nodejs\node.exe" D:\pivotkit\app\node_modules\pivotkit-server\bin\pivotkit-server.js serve --config D:\pivotkit\pivotkit.json
nssm set pivotkit AppDirectory D:\pivotkit
$account = Get-Credential -Credential '.\pivotkit-svc'
nssm set pivotkit ObjectName $account.UserName $account.GetNetworkCredential().Password
nssm set pivotkit AppStdout D:\pivotkit\logs\pivotkit.log
nssm set pivotkit AppStderr D:\pivotkit\logs\pivotkit.log
nssm set pivotkit AppRotateFiles 1
nssm set pivotkit AppRotateOnline 1
nssm set pivotkit AppRotateBytes 10485760
nssm start pivotkit
```

The server writes one JSON line per event on stderr ([logging](../reference/rest.md#logging)): no
view, value, token or path. NSSM restarts the process when it ends, and with `AppRotateFiles` and
`AppRotateOnline` renames the log once it is larger than `AppRotateBytes` (10 MiB here), also while
the service runs.

Set the account before `nssm start pivotkit`: without `ObjectName` the service runs as LocalSystem.
The password goes from `Get-Credential` to NSSM in a variable, so it is not in the shell's history,
but it is an argument of `nssm`, visible in the process list while that command runs. To avoid
that, leave out the `ObjectName` line and set the account in the service's properties instead
(`services.msc`, **Log On**) before you start it, or install with NSSM's dialog (`nssm install
pivotkit` without a program), whose **Log on** tab takes the account. A service set up in the dialog
still needs the folder, the log and its rotation: the `nssm set` lines above, or the dialog's
**Application** (its **Startup directory**), **I/O** and **File rotation** tabs.

NSSM keeps every renamed file, so a PSU schedule deletes old ones:

```powershell
Get-ChildItem 'D:\pivotkit\logs\pivotkit-*.log' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item
```

### IIS with ARR in front { #psu-iis }

When IIS serves the address (TLS, the certificate), let it forward to the server with URL Rewrite and
Application Request Routing (ARR), as in Microsoft's
[reverse proxy walkthrough](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing):

1. In IIS Manager, on the server node, open **Application Request Routing**, **Server Proxy
   Settings**: check **Enable proxy**, and set **Response Buffer Threshold (KB)** to 0, so
   responses of `/mcp` are not held back
   ([why](https://learn.microsoft.com/en-us/archive/blogs/asiatech/transfer-encoding-chunked-is-not-in-the-response-header-when-using-arr)).
2. A site of its own for the address (`reports.example.com`, HTTPS binding) with this `web.config`:

   ```xml
   <configuration>
     <system.webServer>
       <rewrite>
         <rules>
           <rule name="pivotkit" stopProcessing="true">
             <match url="(.*)" />
             <action type="Rewrite" url="http://127.0.0.1:3333/{R:1}" />
           </rule>
         </rules>
       </rewrite>
     </system.webServer>
   </configuration>
   ```

3. `http.publicUrl` in `pivotkit.json` is the address IIS serves. The server answers to its own
   loopback names and the host of `http.publicUrl`, so it takes the request whether or not ARR keeps
   the client's `Host` header.

The server listens on 127.0.0.1, so only IIS reaches it. Set `http.trustProxy` only when ARR writes
the client's address into `X-Forwarded-For`; the server then counts refused tokens per client and
logs the client's address ([behind a reverse proxy](../reference/rest.md#running)). ARR ends a
request that takes longer than its **Time-out** (in the same **Server Proxy Settings**); keep it
above the longest a request to the server may take (an HTTP request to `/mcp` has 30 seconds,
[MCP server](../reference/mcp.md#http)), so a long answer is not cut off (not tested with ARR).

A server that offers MCP alone runs the same way with `pivotkit-mcp`'s own command
(`node_modules\pivotkit-mcp\bin\pivotkit-mcp.js --config ... --http --auth token`, the token in
`$PIVOTKIT_MCP_TOKEN`).

## The skill { #skill }

The server teaches the model its workflow through its instructions, the prompt `pivotkit_report`,
and MCP skills for clients that support them. The same skill is a folder you can install in clients
that read skills:

=== "Claude Code plugin"

    ```text
    /plugin marketplace add eizedev/pivotkit
    /plugin install pivotkit-mcp@pivotkit
    ```

    The plugin holds the skill only; add the server with `claude mcp add` as above. Plugin and server
    update separately ([Update an installation](upgrading.md#update-plugin)).

=== "A skill folder"

    Copy `skills/pivotkit-reports/` from the installed package (`node_modules/pivotkit-mcp/skills/`)
    or from [the repository](https://github.com/eizedev/pivotkit/tree/main/packages/pivotkit-mcp/skills/pivotkit-reports)
    into your client's skills folder (for Claude Code: `~/.claude/skills/`).
