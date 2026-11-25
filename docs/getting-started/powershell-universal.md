---
title: Services next to PowerShell Universal
description: Run the pivotkit REST service and MCP server on a Windows server next to PowerShell Universal - install, data from a PSU script, a service account, the token from a PSU secret, a Windows service with NSSM and IIS with ARR in front - and call the REST service from PSU scripts and apps.
---

# Services next to PowerShell Universal

This page is for the people who run PowerShell Universal (PSU) on Windows and want pivotkit's
services beside it. For the report inside a PSU app, see
[PowerShell Universal](react.md#powershell-universal) on the React page.

## What runs where { #psu }

PowerShell Universal runs scripts and apps, but it is no MCP client. Its server can host pivotkit and
feed it data. Run `pivotkit-server serve` there with `pivotkit-mcp` installed beside it. One process
on one port then offers:

- the [REST service](rest.md) at `/api/v1` for PSU's scripts and apps
- the MCP endpoint at `/mcp` for AI clients

Both use the one token `$PIVOTKIT_TOKEN`, or the tokens of `auth.tokens`.

## Call the REST service from PSU { #psu-rest }

A PSU script, endpoint or app calls the REST service with `Invoke-RestMethod`. It does not run Node
itself:

- Keep the token in a PSU secret ([below](#psu-token)).
- Call `POST /api/v1/views/render/file` with a token whose profile has `results: true`, and hand the
  file to the user.
- Or call `POST /api/v1/views/render` to save the file in the service's output directory.

[Getting started: REST service](rest.md#powershell) has the calls in PowerShell. The PSU module's
report pages load their data from the PSU app, with the person's own rights. The REST service's
policy does not apply to them.

The steps below use `D:\pivotkit` with the folders `app`, `data`, `out`, `logs` and `secrets`. Any
other place works the same.

## Install { #psu-install }

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

## Data from a PSU script { #psu-data }

A scheduled script exports what a source shows into the data folder. It writes to a temporary name
first and then moves the file, so the server never reads half a file:

```powershell
$rows = Invoke-Sqlcmd -Query 'SELECT Region, Product, Sales, OrderDate FROM dbo.Sales'
$rows | Export-Csv -Path 'D:\pivotkit\data\sales.tmp' -NoTypeInformation -Encoding utf8
Move-Item -Path 'D:\pivotkit\data\sales.tmp' -Destination 'D:\pivotkit\data\sales.csv' -Force
```

A source's `"link"` is the page of a PSU app that shows the report with pivotkit. `create_link` then
makes links that open the view there. The page loads the data with the rights of the person who
opens it. An [HTTP source](../reference/sources.md#http) with a `customer` parameter can list
`"linkParams": ["customer"]`. A link then names the customer in the page's query string, where the
app's backend reads it ([link parameters](../concepts/sharing.md#link-params)).

## A service account and its file rights { #psu-account }

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
- The output folder holds a source, a print template, or a token file.

Its checks of links and hard links ran on Linux and macOS.
[#209](https://github.com/eizedev/pivotkit/issues/209) tracks junctions and hard links on Windows.

## The token from a PSU secret { #psu-token }

The server reads a token file on every request, so a new token takes effect without a restart. A
PSU script writes the secret into that file at the start, and whenever the token changes. Here the
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

## A Windows service with a rotated log { #psu-service }

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
nssm set pivotkit AppStopMethodConsole 30000
nssm start pivotkit
```

The server writes one line per event on stderr. The line is JSON, since the service's stderr is no
terminal. It holds no view, value, token, or path. See [operations and logs](../reference/operations.md).

NSSM restarts the process when it ends. With `AppRotateFiles` and `AppRotateOnline`, NSSM renames
the log once it is larger than `AppRotateBytes`, here 10 MiB. It does that also while the service
runs.

To stop the service, NSSM first sends Ctrl+C. The server then lets running requests finish for up
to `http.graceMs`, 25 seconds by default. NSSM waits 1500 ms by default, then ends the process.
`AppStopMethodConsole 30000` gives it 30 seconds. CI does not test this stop on Windows
([stopping](../reference/rest.md#running)).

Set the account before `nssm start pivotkit`. Without `ObjectName`, the service runs as LocalSystem.

The password goes from `Get-Credential` to NSSM in a variable, so it is not in the shell's history.
But it is an argument of `nssm`, and the process list shows it while that command runs. To avoid
that, leave out the `ObjectName` line and use one of these ways before you start the service:

- Set the account in the service's properties: `services.msc`, **Log On**.
- Install with NSSM's dialog: `nssm install pivotkit` without a program. Its **Log on** tab takes the account.

A service set up in the dialog still needs the folder, the log, and its rotation. Set them with the
`nssm set` lines before, or in the dialog's tabs **Application** (its **Startup directory**),
**I/O** and **File rotation**.

NSSM keeps every renamed file, so a PSU schedule deletes old ones:

```powershell
Get-ChildItem 'D:\pivotkit\logs\pivotkit-*.log' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item
```

## IIS with ARR in front { #psu-iis }

IIS can serve the address with TLS and the certificate. Then let it forward to the server with URL
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

3. Set `http.publicUrl` in `pivotkit.json` to the origin IIS serves, without a path. The server
   answers to its own loopback names and the host of `http.publicUrl`. So it takes the request whether or not ARR keeps
   the client's `Host` header.

The server listens on 127.0.0.1, so only IIS reaches it.

Set `http.trustProxy` only when ARR writes the client's address into `X-Forwarded-For`. The server
then counts refused tokens per client and logs the client's address. See
[behind a reverse proxy](../reference/rest.md#running).

ARR ends a request that takes longer than its **Time-out**, in the same **Server Proxy Settings**.
Keep it longer than `compute.queueMs` + `compute.timeMs`, which is 40 seconds with the defaults, so
ARR does not cut off a long answer ([configuration](../reference/mcp.md#configuration)). The rows
route adds `rest.records.waitMs` (5 s). This is not tested with ARR.

A server that offers MCP alone runs the same way with `pivotkit-mcp`'s own command:
`node_modules\pivotkit-mcp\bin\pivotkit-mcp.js --config ... --http --auth token`. The token goes in
`$PIVOTKIT_MCP_TOKEN`.
