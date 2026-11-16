---
title: Getting started with the MCP server
description: Let an AI client (Claude Code, Claude Desktop, VS Code and others) build pivot reports over your data with pivotkit-mcp - local over stdio, for a team over HTTP with a token or OAuth, and inside PowerShell Universal.
---

# Getting started with the MCP server

`pivotkit-mcp` lets an AI client build pivot reports for you. You ask for "sales by region per
quarter as Excel". The model builds a view. The server checks it against your data and writes it
into a file you open. Through pivotkit, the model sees the fields of your data and, at the levels
you set, their values. By default it sees names, types and counts, and no values. The
[reference](../reference/mcp.md) has every tool and setting.

You need Node 22 or later. A client either starts the server itself (stdio) or connects to a server
that runs (HTTP). Without Node, use [Server in 5 minutes](server-in-5-minutes.md). It starts the
container image with one command. That gives you the MCP endpoint and a token the server makes
itself.

## 1. Your data and a folder for the reports

Put the data where the server may read it. When the server starts, it makes the folder for what it
writes (`--output`):

```bash
mkdir -p ~/reports
cd ~/reports && npx -y pivotkit-cli example   # optional: sample data (sales.csv) from the command line
```

Any CSV, TSV, JSON or Excel file works. Before a client connects, check what the server would expose:

```bash
npx -y pivotkit-mcp --source sales=$HOME/reports/sales.csv --output ~/reports/out --check-config
```

## 2. Add it to your client

=== "Claude Code"

    ```bash
    claude mcp add pivotkit -- npx -y pivotkit-mcp --source sales=$HOME/reports/sales.csv --output $HOME/reports/out
    ```

=== "Claude Desktop"

    Edit `claude_desktop_config.json`. The app's settings open it:

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

Use absolute paths. A client may start the server in another directory. The server makes a missing
output directory at start.

VS Code also reads the newer `.mcp.json` with `mcpServers`, as under "Other clients".

Pin a version (`pivotkit-mcp@<version>`) for a setup others rely on, and in every shared
configuration. Without a pinned version, `npx -y` runs the newest release at each start: code nobody
has looked at yet. One exception: when pivotkit-mcp is installed globally, or in the folder the
client starts it in or a folder above it, `npx -y` runs that copy, whatever its version.
`pivotkit-mcp@latest` is for a setup of your own. [Update an installation](upgrading.md#update-npx)
has the details, and also says how to restart the client after an update.

Then ask, for example:

- "Which sources does pivotkit have?"
- "Make an Excel report of sales by region per quarter"
- "Make a link to that report"

The server answers with the file's place. A report can use fields whose values you did not let the
model see. Then the server says that the model has not seen the content.

!!! warning "A client with file tools can read the files"
    Over stdio, the answer names the report's absolute path. Claude Code, VS Code and other clients
    with file or shell tools can read that file and your source files. The model then sees values
    the policy keeps back, and its provider receives them. So over stdio the policy is no access
    control against such a client. Give it only data its model may see. Or run the server as another
    user and connect over [HTTP](#4-for-a-team-http).
    [What the policy does not cover](../model-data.md#beyond-policy) has the details.

## 3. Choose what the model may see

By default every field is `summary`: the model sees its name, type and counts. Mark the other fields
like this:

| Level | Mark these fields | What the model gets |
| --- | --- | --- |
| `show` | fields whose values may reach the model | It can answer questions about them and gets small results inline. |
| `values` | category fields | It sees their values as a complete list. So it filters on the exact name of a channel or a team, but gets no result over them. |
| `hide` | fields the model must not know about | Nothing. The server drops them when it reads the data. |

`"policy": { "autoValues": true }` gives `values` to text fields that look like categories by
itself. [The rule](../reference/mcp.md#auto-values) says which ones. `--check-config` lists them.

Give each source a `description`. Explain short or coded field names in
`fields.<name>.description`. A model chooses and reads sources by these words. See
[configuration](../reference/mcp.md#configuration). In a configuration file:

```json
{
  "sources": {
    "sales": {
      "file": "/Users/you/reports/sales.csv",
      "title": "Sales",
      "description": "Orders since 2024, one row per order line",
      "policy": { "fields": { "Region": "show", "Product": "show", "Channel": "values", "Discount": "hide" } }
    }
  },
  "output": { "dir": "/Users/you/reports/out" }
}
```

```bash
claude mcp add pivotkit -- npx -y pivotkit-mcp --config /Users/you/reports/pivotkit-mcp.json
```

To let the model open any data file in a folder by path ("file:q3.csv"), add
`--allow-dir /Users/you/reports`. Add `--list-files` to have the files listed. Every file in that
folder is then open to the model, so put only data there that the model may use.

- [Exposure policy](../reference/mcp.md#policy) has the rules.
- [What reaches the model](../model-data.md) shows the answers a model gets at each level. It also
  shows how to give each client its own rules.

## 4. For a team: HTTP

=== "bash"

    ```bash
    export PIVOTKIT_MCP_TOKEN="$(npx -y pivotkit-server token new)"
    npx -y pivotkit-mcp --config pivotkit-mcp.json --http --auth token
    ```

=== "PowerShell"

    ```powershell
    $env:PIVOTKIT_MCP_TOKEN = npx -y pivotkit-server token new
    npx -y pivotkit-mcp --config pivotkit-mcp.json --http --auth token
    ```

The server listens on `http://127.0.0.1:3333/mcp`. Open `http://127.0.0.1:3333/` in a browser for
the quick-start page. It has the configurations to copy.

For other machines, put the server behind a reverse proxy with TLS. Give it
`--public-url https://reports.example.com`, and `--host 0.0.0.0` or the proxy's network.

The server writes the reports and serves them itself under `/downloads/` for 60 minutes. Results
carry a link:

- For a source whose fields are all `show`: a plain link.
- For other sources: only a link the person opens after signing in with your identity provider, or
  a one-time link you switch on.

See [download links](../reference/delivery.md). Clients connect with:

```bash
claude mcp add --transport http pivotkit https://reports.example.com/mcp --header "Authorization: Bearer <token>"
```

The token is then on that command line. While the command runs, other users of the machine can see
it in the process list. Your shell keeps it in its history. Claude Code stores it in its
configuration either way.

For sign-in with your identity provider, see [OAuth](../reference/mcp.md#oauth). That works with
Authentik, Keycloak, Microsoft Entra ID and any OAuth 2.1 / OpenID Connect provider. Scopes then
decide who sees which source and who may use which tool.

Some providers, Authentik for example, have no dynamic client registration. There you create a
client yourself and give it to Claude Code with `--client-id` and `--callback-port`. See
[a client registered in advance](../reference/mcp.md#preregistered-client).

A policy profile can apply per token, OAuth client, group or scope. With it, a cloud assistant gets
less than a model on your own hardware. See [per client](../model-data.md#per-client).

To serve programs too, run `pivotkit-server serve --config pivotkit-mcp.json --auth token` instead,
with `pivotkit-mcp` installed beside it. One port then offers the same `/mcp` endpoint and the
[REST service](rest.md) at `/api/v1`. This also runs as a [container image](../reference/container.md)
([in 5 minutes](server-in-5-minutes.md)) and [on Kubernetes](kubernetes.md).
Its one static token is `$PIVOTKIT_TOKEN`.

Either server takes `--state-dir <dir>` or `$PIVOTKIT_STATE_DIR`. It then keeps the download links'
key in that folder. When no token is given and the server listens off loopback, it also makes a
token of its own there. See [tokens made at the first start](../reference/rest.md#first-start).

## PowerShell Universal { #psu }

PowerShell Universal runs scripts and apps, but it is no MCP client. Its server can host pivotkit and
feed it data. Run `pivotkit-server serve` there with `pivotkit-mcp` installed beside it. One process
on one port then offers:

- the [REST service](rest.md) at `/api/v1` for PSU's scripts and apps
- the MCP endpoint at `/mcp` for AI clients

Both use the one token `$PIVOTKIT_TOKEN`, or the tokens of `auth.tokens`.

The steps below use `D:\pivotkit` with the folders `app`, `data`, `out`, `logs` and `secrets`. Any
other place works the same.

### Install { #psu-install }

```powershell
cd D:\pivotkit\app
npm install pivotkit-server@<version> pivotkit-mcp@<version>
```

On a machine without internet, install from the packages' tarballs. Make them with `npm pack` on a
machine with internet. To update, run the same command with the new versions and restart the
service. See [Update an installation](upgrading.md#update-project).

The configuration, `D:\pivotkit\pivotkit.json`:

```json
{
  "sources": { "sales": { "file": "data/sales.csv", "link": "https://psu.example.com/reports/sales" } },
  "output": { "dir": "out" },
  "auth": { "mode": "token", "tokens": [{ "name": "psu", "file": "secrets/psu-token" }] },
  "http": { "host": "127.0.0.1", "port": 3333, "publicUrl": "https://reports.example.com" }
}
```

Relative paths start at the configuration file's folder. `pivotkit-server check-config --config
D:\pivotkit\pivotkit.json` prints what the server would expose. It also says which file or folder is
missing.

### Data from a PSU script { #psu-data }

A scheduled script exports what a source shows into the data folder. It writes to a temporary name
first and then moves the file, so the server never reads half a file:

```powershell
$rows = Invoke-Sqlcmd -Query 'SELECT Region, Product, Sales, OrderDate FROM dbo.Sales'
$rows | Export-Csv -Path 'D:\pivotkit\data\sales.tmp' -NoTypeInformation -Encoding utf8
Move-Item -Path 'D:\pivotkit\data\sales.tmp' -Destination 'D:\pivotkit\data\sales.csv' -Force
```

A source's `"link"` is the page of a PSU app that shows the report with pivotkit. `create_link` then
makes links that open the view there. The page loads the data with the rights of the person who
opens it.

### A service account and its file rights { #psu-account }

Run the server as an account of its own with no rights beyond its folders. Never run it as PSU's
account or as LocalSystem. Use a local or domain account that is no administrator, here
`pivotkit-svc`. NSSM gives it the right *Log on as a service*. The accounts need these rights:

| Folder | The server's account | PSU's account |
| --- | --- | --- |
| `app`, `pivotkit.json` | read | none (an administrator updates them) |
| `data` | read | modify (the export script writes there) |
| `secrets` | read | modify (the script that writes the token) |
| `out` | modify (reports, drafts, `output.maxAgeDays` deletes old reports) | read, if a script hands the files on |
| `logs` | modify (NSSM runs as this account and writes and renames the log) | modify (the schedule that deletes old logs), or read when an administrator deletes them |

For example:

```powershell
icacls D:\pivotkit\app D:\pivotkit\data D:\pivotkit\secrets /grant "pivotkit-svc:(OI)(CI)RX"
icacls D:\pivotkit\pivotkit.json /grant "pivotkit-svc:R"
icacls D:\pivotkit\out D:\pivotkit\logs /grant "pivotkit-svc:(OI)(CI)M"
icacls D:\pivotkit\data D:\pivotkit\logs /grant "<PSU's account>:(OI)(CI)M"
icacls D:\pivotkit\out /grant "<PSU's account>:(OI)(CI)RX"
```

`<PSU's account>` is the account the PSU service runs as. Only the two accounts and the
administrators may read `secrets`. Remove the inherited rights, then grant theirs:

```powershell
icacls D:\pivotkit\secrets /inheritance:r
icacls D:\pivotkit\secrets /grant "Administrators:(OI)(CI)F" "pivotkit-svc:(OI)(CI)RX" "<PSU's account>:(OI)(CI)M"
```

The server refuses to start in these cases:

- The output folder is the configuration's folder.
- The output folder holds a source, a print template or a token file.

Its checks of links and hard links are measured on Linux and macOS.
[#209](https://github.com/eizedev/pivotkit/issues/209) tracks junctions and hard links on Windows.

### The token from a PSU secret { #psu-token }

The server reads a token file on every request, so a new token takes effect without a restart. A
PSU script writes the secret into that file, at the start and whenever the token changes. Here the
secret is `PivotkitToken`, a string secret:

```powershell
Set-Content -Path 'D:\pivotkit\secrets\psu-token' -Value $Secret:PivotkitToken -NoNewline
```

PSU's scripts and apps send the same secret: `Authorization = "Bearer $Secret:PivotkitToken"`.
See [the calls in PowerShell](rest.md#powershell).

Scheduled jobs cannot use a secret with roles (see
[PSU's variables](https://docs.devolutions.net/powershell-universal/platform/variables)). So the
script that writes the file runs on a schedule only with a secret without roles.

Without a token file, `$PIVOTKIT_TOKEN` in the service's environment works too. A service manager
keeps it in its configuration. NSSM keeps it in the service's registry key. Check that key's rights
before you put a token there.

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

The server writes one line per event on stderr. The line is JSON, since the service's stderr is no
terminal. It holds no view, value, token or path. See [operations and logs](../reference/operations.md).

NSSM restarts the process when it ends. With `AppRotateFiles` and `AppRotateOnline`, NSSM renames
the log once it is larger than `AppRotateBytes`, here 10 MiB. It does that also while the service
runs.

Set the account before `nssm start pivotkit`. Without `ObjectName`, the service runs as LocalSystem.

The password goes from `Get-Credential` to NSSM in a variable, so it is not in the shell's history.
But it is an argument of `nssm`, and the process list shows it while that command runs. To avoid
that, leave out the `ObjectName` line and use one of these ways before you start the service:

- Set the account in the service's properties: `services.msc`, **Log On**.
- Install with NSSM's dialog: `nssm install pivotkit` without a program. Its **Log on** tab takes the account.

A service set up in the dialog still needs the folder, the log and its rotation. Set them with the
`nssm set` lines above, or in the dialog's tabs **Application** (its **Startup directory**),
**I/O** and **File rotation**.

NSSM keeps every renamed file, so a PSU schedule deletes old ones:

```powershell
Get-ChildItem 'D:\pivotkit\logs\pivotkit-*.log' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item
```

### IIS with ARR in front { #psu-iis }

IIS can serve the address, with TLS and the certificate. Then let it forward to the server with URL
Rewrite and Application Request Routing (ARR), as in Microsoft's
[reverse proxy walkthrough](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing):

1. In IIS Manager, on the server node, open **Application Request Routing**, **Server Proxy
   Settings**. Check **Enable proxy**. Set **Response Buffer Threshold (KB)** to 0, so ARR does not
   hold back responses of `/mcp`
   ([why](https://learn.microsoft.com/en-us/archive/blogs/asiatech/transfer-encoding-chunked-is-not-in-the-response-header-when-using-arr)).
2. Make a site of its own for the address, `reports.example.com` with an HTTPS binding. Give it this
   `web.config`:

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

3. Set `http.publicUrl` in `pivotkit.json` to the address IIS serves. The server answers to its own
   loopback names and the host of `http.publicUrl`. So it takes the request whether or not ARR keeps
   the client's `Host` header.

The server listens on 127.0.0.1, so only IIS reaches it.

Set `http.trustProxy` only when ARR writes the client's address into `X-Forwarded-For`. The server
then counts refused tokens per client and logs the client's address. See
[behind a reverse proxy](../reference/rest.md#running).

ARR ends a request that takes longer than its **Time-out**, in the same **Server Proxy Settings**.
Keep it above the longest time a request to the server may take, so ARR does not cut off a long
answer. An HTTP request to `/mcp` has 30 seconds, as [MCP server](../reference/mcp.md#http) says.
This is not tested with ARR.

A server that offers MCP alone runs the same way with `pivotkit-mcp`'s own command:
`node_modules\pivotkit-mcp\bin\pivotkit-mcp.js --config ... --http --auth token`. The token goes in
`$PIVOTKIT_MCP_TOKEN`.

## The skill { #skill }

The server teaches the model its workflow in three ways:

- its instructions
- the prompt `pivotkit_report`
- MCP skills, for clients that support them

The same skill is a folder. You can install it in clients that read skills:

=== "Claude Code plugin"

    ```text
    /plugin marketplace add eizedev/pivotkit
    /plugin install pivotkit-mcp@pivotkit
    ```

    The plugin holds only the skill. Add the server with `claude mcp add` as above. Plugin and server
    update separately. See [Update an installation](upgrading.md#update-plugin).

=== "A skill folder"

    Copy `skills/pivotkit-reports/` into your client's skills folder. For Claude Code, that is
    `~/.claude/skills/`. Take the folder from one of these places:

    - the installed package: `node_modules/pivotkit-mcp/skills/`
    - [the repository](https://github.com/eizedev/pivotkit/tree/main/packages/pivotkit-mcp/skills/pivotkit-reports)
