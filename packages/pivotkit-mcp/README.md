# pivotkit-mcp

An [MCP](https://modelcontextprotocol.io) server for [pivotkit](https://pivotkit.eize.dev/). An AI
client such as Claude Code, Claude Desktop or VS Code describes your data sources, writes and checks
pivot views, and has reports made into Excel, HTML, CSV, JSON or SVG files or into links. The client
does all this without reading the data itself, beyond what the operator allows.

## Install

```bash
npx -y pivotkit-mcp --source sales=/path/to/sales.csv --output /path/to/reports
claude mcp add pivotkit -- npx -y pivotkit-mcp --source sales=/path/to/sales.csv --output /path/to/reports
```

- Node 22 or later.
- It brings the official MCP TypeScript SDK and pivotkit-server. pivotkit-server brings
  pivotkit-report, pivotkit-cli's file handling, pivotkit-xlsx, ECharts 6.1.0 and jose.
- `pivotkit-server serve` runs it next to the REST service on one port.

## Example

A configuration file, `pivotkit-mcp.json`:

```json
{
  "sources": {
    "sales": { "file": "data/sales.csv", "title": "Sales", "policy": { "fields": { "Region": "show", "Customer": "hide" } } }
  },
  "output": { "dir": "reports" }
}
```

```bash
npx -y pivotkit-mcp --config pivotkit-mcp.json                  # stdio
npx -y pivotkit-mcp --config pivotkit-mcp.json --check-config   # what a model would see
npx -y pivotkit-mcp --config pivotkit-mcp.json --http --auth token   # http://127.0.0.1:3333/mcp, PIVOTKIT_MCP_TOKEN
```

## What it does

- Lets the operator decide per field what the model may see: names and counts, values, or nothing.
- Talks to a local client over stdio.
- Serves a team over Streamable HTTP, with a token or OAuth 2.1.

## Where in the docs

| Topic | Page |
| --- | --- |
| Set it up in Claude Code, Claude Desktop, VS Code, for a team, in PowerShell Universal | [Getting started: MCP server](https://pivotkit.eize.dev/getting-started/mcp/) |
| Tools, exposure policy, configuration, errors, logging, HTTP, authentication | [pivotkit-mcp reference](https://pivotkit.eize.dev/reference/mcp/) |
| Reports as links that expire, bound to the person's sign-in, or in your own store | [Download links](https://pivotkit.eize.dev/reference/delivery/) |
| Run it with pivotkit-server on Kubernetes, sign-in with Authentik | [Kubernetes](https://pivotkit.eize.dev/getting-started/kubernetes/) |
| Update it together with pivotkit-server, the plugin, and what changes between releases | [Upgrading](https://pivotkit.eize.dev/getting-started/upgrading/#update) |
| What the model and its provider receive at each level, and how to set it per client | [What reaches an AI model](https://pivotkit.eize.dev/model-data/) |
| What it protects against and what not | [Security: the MCP server](https://pivotkit.eize.dev/security/#mcp) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-mcp/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
