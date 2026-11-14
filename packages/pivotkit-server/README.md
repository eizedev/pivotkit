# pivotkit-server

[pivotkit](https://pivotkit.eize.dev/)'s reports for programs over HTTP: a REST service under
`/api/v1` that lists data sources, checks pivot views, renders reports into Excel, HTML, CSV, JSON or
SVG files and makes links, with an OpenAPI 3.1 document made from the same operations. Per field the
operator decides what a caller may see; profiles give one token or OAuth client more (values,
downloads). Sign-in with static tokens or OAuth 2.1. It is also the shared core of
[pivotkit-mcp](https://www.npmjs.com/package/pivotkit-mcp): `pivotkit-server serve` runs the REST
service and, with pivotkit-mcp installed, the MCP endpoint on one port, and a container image runs
both with the command line.

## Install

```bash
npm install --global pivotkit-server pivotkit-mcp
pivotkit-server serve --source sales=/path/to/sales.csv --output /path/to/reports   # http://127.0.0.1:3333/api/v1
```

Node 22 or later. It brings pivotkit-report, pivotkit-cli's file handling, pivotkit-xlsx, ECharts
6.1.0 and jose; not the MCP SDK.

## Example

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"source":"sales","view":{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]},"format":"xlsx"}' \
  http://127.0.0.1:3333/api/v1/views/render
```

## Where in the docs

| Topic | Page |
| --- | --- |
| Run it and call it with curl and PowerShell | [Getting started: REST service](https://pivotkit.eize.dev/getting-started/rest/) |
| Routes, profiles, downloads, sign-in, CORS, limits, errors, OpenAPI, embedding | [pivotkit-server reference](https://pivotkit.eize.dev/reference/rest/) |
| The container image | [Container image](https://pivotkit.eize.dev/reference/container/) |
| What it protects against and what not | [Security: the REST service](https://pivotkit.eize.dev/security/#rest) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-server/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)
