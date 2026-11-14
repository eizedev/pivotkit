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

Put the data where the server may read it and make a folder for what it writes:

```bash
mkdir -p ~/reports/out
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

Use absolute paths: a client may start the server in another directory, and create the output
directory first (the server does not). VS Code also reads the newer `.mcp.json` with `mcpServers`, as
under "Other clients".
 Pin a version for a setup
others rely on (`pivotkit-mcp@0.1.0`): `npx` without one takes the newest at each start.

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
      "policy": { "fields": { "Region": "show", "Product": "show", "Customer": "hide" } }
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

To serve programs too, run `pivotkit-server serve --config pivotkit-mcp.json` (with
`pivotkit-mcp` installed beside it) instead: the same `/mcp` endpoint and the
[REST service](rest.md) at `/api/v1` on one port, also as a [container image](../reference/container.md).
Its one static token is `$PIVOTKIT_TOKEN`.

## PowerShell Universal { #psu }

PowerShell Universal runs scripts and apps but is no MCP client; it can host the server and its data:

- **Data**: a scheduled script exports what a source shows into a data folder, written to a
  temporary name first and then moved, so the server never reads half a file:

  ```powershell
  $rows = Invoke-Sqlcmd -Query 'SELECT Region, Product, Sales, OrderDate FROM dbo.Sales'
  $rows | Export-Csv -Path 'D:\pivotkit\data\sales.tmp' -NoTypeInformation -Encoding utf8
  Move-Item -Path 'D:\pivotkit\data\sales.tmp' -Destination 'D:\pivotkit\data\sales.csv' -Force
  ```

- **Server**: run `node <path>\node_modules\pivotkit-mcp\bin\pivotkit-mcp.js --config D:\pivotkit\pivotkit-mcp.json --http --auth token`
  as a service that restarts it (a Windows service wrapper, or PowerShell Universal's own way of
  keeping a process running), with `PIVOTKIT_MCP_TOKEN` from a secret. Install it once with
  `npm install pivotkit-mcp@<version>` in that folder (or from a tarball on a machine without
  internet).
- **Links**: give a source `"link": "https://psu.example.com/reports/sales"`, the page of the app
  that shows the report with pivotkit; `create_link` then makes links that open the view there, and
  the page loads the data with the rights of the person who opens it.

## The skill { #skill }

The server teaches the model its workflow through its instructions, the prompt `pivotkit_report`,
and MCP skills for clients that support them. The same skill is a folder you can install in clients
that read skills:

=== "Claude Code plugin"

    ```text
    /plugin marketplace add eizedev/pivotkit
    /plugin install pivotkit-mcp@pivotkit
    ```

    The plugin holds the skill only; add the server with `claude mcp add` as above.

=== "A skill folder"

    Copy `skills/pivotkit-reports/` from the installed package (`node_modules/pivotkit-mcp/skills/`)
    or from [the repository](https://github.com/eizedev/pivotkit/tree/main/packages/pivotkit-mcp/skills/pivotkit-reports)
    into your client's skills folder (for Claude Code: `~/.claude/skills/`).
