# pivotkit-mcp

An [MCP](https://modelcontextprotocol.io) server for [pivotkit](https://pivotkit.eize.dev/): an AI
client (Claude Code, Claude Desktop, VS Code and others) describes your data sources, writes and
checks pivot views, and has reports made into Excel, HTML, CSV, JSON or SVG files or into links,
without reading the data itself. Per field the operator decides what the model may see (names and
counts, values, or nothing). stdio for a local client; Streamable HTTP with a token or OAuth 2.1 for
a team.

## Install

```bash
npx -y pivotkit-mcp --source sales=/path/to/sales.csv --output /path/to/reports
claude mcp add pivotkit -- npx -y pivotkit-mcp --source sales=/path/to/sales.csv --output /path/to/reports
```

Node 22 or later. It brings the official MCP TypeScript SDK and pivotkit-server (with
pivotkit-report, pivotkit-cli's file handling, pivotkit-xlsx, ECharts 6.1.0 and jose).
`pivotkit-server serve` runs it next to the REST service on one port.

## Example

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

## Where in the docs

| Topic | Page |
| --- | --- |
| Set it up in Claude Code, Claude Desktop, VS Code, for a team, in PowerShell Universal | [Getting started: MCP server](https://pivotkit.eize.dev/getting-started/mcp/) |
| Tools, exposure policy, configuration, errors, logging, HTTP, authentication | [pivotkit-mcp reference](https://pivotkit.eize.dev/reference/mcp/) |
| What it protects against and what not | [Security: the MCP server](https://pivotkit.eize.dev/security/#mcp) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-mcp/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
