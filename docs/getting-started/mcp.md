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

You need Node 24 or later. A client either starts the server itself (stdio) or connects to a server
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
has the details. [Restart what runs](upgrading.md#update-restart) says how to restart the client.

Then ask, for example:

- "Which sources does pivotkit have?"
- "Make an Excel report of sales by region per quarter"
- "Now the same report as CSV, only for the North region"

The server answers with the file's place. A report can use fields whose values you did not let the
model see. Then the server says that the model has not seen the content.

A link to a report needs a page that shows reports. You set it as the source's `link`.
[PowerShell Universal](powershell-universal.md#psu) has an example.

!!! warning "A client with file tools can read the files"
    Claude Code, VS Code and other clients with file or shell tools can read the report and your
    source files over stdio. The policy of step 3 does not stop them. Read
    [what the policy does not cover](../model-data.md#beyond-policy) before you add real data.

## 3. Choose what the model may see

By default every field is `summary`: the model sees its name, type and counts. Mark the other fields
like this:

| Level | Mark these fields | What the model gets |
| --- | --- | --- |
| `show` | fields whose values may reach the model | It can answer questions about them and gets small results inline. |
| `values` | category fields | It sees their values as a complete list. So it filters on the exact name of a channel or a team, but gets no result over them. |
| `hide` | fields the model must not know about | Nothing. The server drops them when it reads the data. |

- `"policy": { "autoValues": true }` gives `values` to text fields that look like categories ([rule](../reference/mcp.md#auto-values)).
- The levels do not cover [data the model sends itself](../reference/mcp.md#data), the source
  `inline:`. `"mcp": { "data": false }` switches it off.

Give each source a `description`, and explain short or coded field names in
`fields.<name>.description`: a model chooses and reads sources by these words. In a configuration file:

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
`--allow-dir /Users/you/reports/data`. Add `--list-files` to have the files listed. Every file in that
folder is then open to the model, so put only data there that the model may use. The folder must not
hold `output.dir`: the server refuses to start then.

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

- For an [open source](../reference/delivery.md), hidden by default with its shown fields listed, or
  with every field shown: a plain link.
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
[What works with pivotkit](../compatibility.md#sign-in) says how each provider was tested.

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
token of its own there. See [tokens made at the first start](../reference/tokens.md#first-start).

## PowerShell Universal { #psu }

<span id="psu-install"></span><span id="psu-data"></span><span id="psu-account"></span><span id="psu-token"></span><span id="psu-service"></span><span id="psu-iis"></span>

PowerShell Universal is no MCP client, but its server can run pivotkit for its scripts, its apps,
and AI clients. [Services next to PowerShell Universal](powershell-universal.md) has the steps.

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
